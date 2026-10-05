import {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from "./types";
import { AirGappedTranslationProvider } from "./offline";
import { matchTerminology } from "../terminology/matcher";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { adaptTermCasing, formatUppercaseStructure, normalizeSourcePunctuation } from "./casing";

/**
 * Google Translate Provider with Custom Glossary Enforcement
 * 
 * Combines Google's state-of-the-art Neural Machine Translation (NMT)
 * with strict adherence to custom approved terminology (e.g. Cuu-am-chan-kinh.xlsx).
 * 
 * Modes:
 * 1. Free instant Google Translation (Zero setup, 0 API key required)
 * 2. Enterprise Google Cloud Translation API (when apiKey is supplied)
 * 3. Automatic offline fallback to Air-Gapped CAT engine if network drops
 */
export class GoogleTranslationProvider implements TranslationProvider {
  name = "google_translate";
  private apiKey?: string;
  private fallbackProvider: AirGappedTranslationProvider;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.fallbackProvider = new AirGappedTranslationProvider();
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    // Pre-normalize source text punctuation (e.g. ".Do" -> ". Do", "thẳng,đường" -> "thẳng, đường")
    // while strictly safeguarding technical measurements (1.8m, 1.8mm, etc.)
    const sourceText = normalizeSourcePunctuation(request.sourceText);
    const hasViChars = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(sourceText);

    // The caller has selected the document direction. Never reverse it from a
    // text heuristic: bilingual slides contain English terms, and the old
    // heuristic could translate an EN-deck paragraph back into Vietnamese.
    const srcLang = request.sourceLanguage;
    const tgtLang = request.targetLanguage;

    try {
      // 1. Identify approved glossary terms to protect
      const approved = request.approvedTerminology || [];
      const matched = matchTerminology(sourceText, approved);
      
      // Sort matches from end to start so replacements don't invalidate indices
      const sortedMatches = [...matched].sort((a, b) => b.startIndex - a.startIndex);
      
      let workingText = sourceText;
      const locks: { placeholder: string; targetTerm: string }[] = [];

      for (let i = 0; i < sortedMatches.length; i++) {
        const m = sortedMatches[i];
        // Use non-translatable alphanumeric token that Google Translate preserves as-is
        const placeholder = `ZX${i}K`;
        locks.push({
          placeholder,
          targetTerm: m.entry.targetTerm,
        });

        // Defensive guard: ensure placeholder never directly glues to sentence-ending punctuation (.ZX1K),
        // which would cause Google's NMT sentence splitter to truncate decoding.
        const charBefore = m.startIndex > 0 ? workingText[m.startIndex - 1] : "";
        const charAfter = m.endIndex < workingText.length ? workingText[m.endIndex] : "";
        const prefix = /[.!?]/.test(charBefore) ? " " : "";
        const suffix = /[.!?]/.test(charAfter) ? " " : "";

        workingText = workingText.slice(0, m.startIndex) + prefix + placeholder + suffix + workingText.slice(m.endIndex);
      }

      // 2. Call Google Translate
      let rawTranslated = "";
      if (this.apiKey) {
        // Official Google Cloud Translation API v2
        const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: workingText,
            source: srcLang,
            target: tgtLang,
            format: "text",
          }),
        });
        if (!res.ok) {
          throw new Error(`Google Cloud API returned status ${res.status}`);
        }
        const data = await res.json();
        rawTranslated = data.data?.translations?.[0]?.translatedText || "";
      } else {
        // High-speed Google Client Endpoint
        const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${srcLang}&tl=${tgtLang}&q=${encodeURIComponent(workingText)}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
        });
        if (!res.ok) {
          throw new Error(`Google Translate endpoint returned status ${res.status}`);
        }
        const json = await res.json();
        // Join all translated parts in case response contains multiple segments/paragraphs
        rawTranslated = Array.isArray(json) ? json.filter(Boolean).join(" ") : String(json);
      }

      if (!rawTranslated) {
        throw new Error("Empty response from Google Translate");
      }

      // 3. Restore protected glossary terms with context-aware casing
      let finalResult = rawTranslated;
      for (const item of locks) {
        const regex = new RegExp(`(\\b${item.placeholder}\\b|${item.placeholder})`, "gi");
        finalResult = finalResult.replace(regex, (match, p1, offset, string) => {
          // Check preceding characters to determine if this placeholder is at sentence/item start
          const preceding = string.slice(0, offset);
          const isSentenceStart =
            /(?:^|\n)\s*[\*•\-\#]*\s*(?:\d+[\.\)]|[a-zA-Z][\.\)])?\s*$/.test(preceding) ||
            /[.!?]\s*$/.test(preceding) ||
            /:\s*$/.test(preceding);
          return adaptTermCasing(item.targetTerm, isSentenceStart);
        });
      }

      // 4. Complete typographical uppercase and sentence structure formatting
      finalResult = formatUppercaseStructure(finalResult);

      // 5. Strict post-translation terminology enforcement
      const enforced = enforceTerminologyCompliance(
        request.sourceText,
        finalResult,
        request.approvedTerminology || [],
        srcLang,
        tgtLang
      );
      finalResult = enforced.text;

      return {
        translatedText: finalResult,
        provider: "Google Translate + Glossary CAT",
        durationMs: Date.now() - startTime,
        modelName: this.apiKey
          ? "Google Cloud Translation API (NMT + Glossary Enforcement)"
          : "Google Neural Machine Translation (NMT + Glossary Enforcement)",
      };
    } catch (err: any) {
      console.warn("Google Translate failed or offline, falling back to Air-Gapped engine:", err.message);
      const fallbackResponse = await this.fallbackProvider.translate(request);
      return {
        ...fallbackResponse,
        provider: "Offline CAT (Google Translate Fallback)",
        modelName: `Offline Fallback (${err.message})`,
      };
    }
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const startTime = Date.now();
    const results = new Map<string, string>();
    if (!request.items || request.items.length === 0) {
      return {
        results,
        provider: "Google Translate + Glossary CAT",
        durationMs: 0,
        modelName: "Google Neural Machine Translation (Batch)",
      };
    }

    const concurrency = 8;
    for (let i = 0; i < request.items.length; i += concurrency) {
      const slice = request.items.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (item) => {
          try {
            const res = await this.translate({
              sourceText: item.sourceText,
              sourceLanguage: request.sourceLanguage,
              targetLanguage: request.targetLanguage,
              approvedTerminology: request.approvedTerminology,
              context: request.context,
            });
            results.set(item.id, res.translatedText);
          } catch (e) {
            results.set(item.id, item.sourceText);
          }
        })
      );
      if (i + concurrency < request.items.length) {
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    return {
      results,
      provider: "Google Translate + Glossary CAT",
      durationMs: Date.now() - startTime,
      modelName: "Google Neural Machine Translation (Batch)",
    };
  }
}
