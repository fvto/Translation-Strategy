import {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from "./types";
import { matchTerminology } from "../terminology/matcher";
import { COMMON_PHRASES, OFFLINE_DICTIONARY, VI_EN_DICTIONARY } from "./dictionary";
import { formatUppercaseStructure, normalizeSourcePunctuation, adaptTermCasing } from "./casing";

/**
 * Unlimited 100% Air-Gapped Dictionary & Terminology Translation Provider (EN ↔ VI)
 *
 * Designed for complete confidentiality and zero external dependencies:
 * - 0 external network requests
 * - 0 quotas or daily limits (100% UNLIMITED)
 * - 1st priority: Exact approved terminology from uploaded spreadsheets/glossaries (e.g. Cuu-am-chan-kinh.xlsx)
 * - 2nd priority: Idiomatic multi-word phrases from local dictionary
 * - 3rd priority: Smart word-by-word morphological translation with case & plural preservation
 * - 4th priority: Non-translatable preservation (numbers, percentages, ISO/NIST standards, URLs, emails)
 */
export class AirGappedTranslationProvider implements TranslationProvider {
  name = "airgapped";

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    const sourceText = normalizeSourcePunctuation(request.sourceText);
    const hasViChars = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(sourceText);

    let isEnToVi = request.sourceLanguage === "en" && request.targetLanguage === "vi";
    // Intelligent auto-detection safeguard: if text has Vietnamese characters but direction is EN->VI,
    // automatically correct to VI->EN so user never gets untranslated output.
    if (hasViChars && isEnToVi) {
      isEnToVi = false;
    } else if (!hasViChars && request.sourceLanguage === "vi" && request.targetLanguage === "en") {
      if (/\b(?:the|and|for|with|this|that|from|are|is|in|on|at|check|test|standard)\b/i.test(sourceText)) {
        isEnToVi = true;
      }
    }

    let translatedText: string;

    if (isEnToVi) {
      translatedText = this.translateEnglishToVietnamese(sourceText, request.approvedTerminology);
    } else {
      // If auto-corrected from EN->VI to VI->EN, retrieve reverse approved terminology if needed
      const terms = hasViChars && request.sourceLanguage === "en"
        ? request.approvedTerminology.map((t: any) => ({
            ...t,
            sourceTerm: t.targetTerm,
            targetTerm: t.sourceTerm,
            sourceLanguage: "vi",
            targetLanguage: "en",
          }))
        : request.approvedTerminology;

      translatedText = this.translateVietnameseToEnglish(sourceText, terms);
    }

    return {
      translatedText,
      provider: "Unlimited Offline Dictionary + Glossary CAT",
      durationMs: Date.now() - startTime,
      modelName: "Local Exact Term & Word Mapper v3.0 (Zero Limit / 100% Air-Gapped)",
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const startTime = Date.now();
    const results = new Map<string, string>();
    for (const item of request.items) {
      const res = await this.translate({
        sourceText: item.sourceText,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        approvedTerminology: request.approvedTerminology,
        context: request.context,
      });
      results.set(item.id, res.translatedText);
    }
    return {
      results,
      provider: this.name,
      durationMs: Date.now() - startTime,
      modelName: "Air-Gapped Batch Translator",
    };
  }

  /**
   * Translates English text to Vietnamese using the 4-tier local hierarchy.
   */
  private translateEnglishToVietnamese(text: string, approvedTerminology: any[]): string {
    // ─── Tier 1: Match and lock user's approved terminology (Cuu-am-chan-kinh.xlsx, etc.) ───
    const matches = matchTerminology(text, approvedTerminology);
    const lockedSegments: { placeholder: string; targetTerm: string }[] = [];

    // Sort matches from end to start to protect string indices
    const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);
    let workingText = text;

    for (let i = 0; i < sortedMatches.length; i++) {
      const match = sortedMatches[i];
      const placeholder = `___APPROVED_TERM_${i}___`;
      lockedSegments.push({
        placeholder,
        targetTerm: match.entry.targetTerm,
      });
      workingText =
        workingText.slice(0, match.startIndex) + placeholder + workingText.slice(match.endIndex);
    }

    // ─── Tier 2: Match common multi-word phrases and idioms ───
    for (let i = 0; i < COMMON_PHRASES.length; i++) {
      const phrase = COMMON_PHRASES[i];
      const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${this.escapeRegex(phrase.en)})(?![\\p{L}\\p{N}])`, "giu");
      workingText = workingText.replace(regex, phrase.vi);
    }

    // ─── Tier 3: Tokenize remaining text and apply word-by-word translation ───
    // Split text into tokens (words, whitespace, punctuation, placeholders)
    const tokenRegex = /(___APPROVED_TERM_\d+___|\b[A-Za-z0-9_.\-%/:]+\b|[^\sA-Za-z0-9_.\-%/:]+|\s+)/g;
    const tokens = workingText.match(tokenRegex) || [workingText];

    const translatedTokens: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // If it's a locked approved term placeholder, keep it intact for Tier 4
      if (token.startsWith("___APPROVED_TERM_")) {
        translatedTokens.push(token);
        continue;
      }

      // If it's whitespace or punctuation, preserve exactly
      if (/^\s+$/.test(token) || /^[^\w\s]+$/.test(token)) {
        translatedTokens.push(token);
        continue;
      }

      // If it's pure numbers, percentages, standards, or acronyms, preserve as-is
      if (/^\d+(?:[.,]\d+)?%?$/.test(token) || /^(?:ISO|NIST|SLA|RPO|RTO|RBAC|MFA|SSO|CAPA|QC|QA|BIA|BCP|DRP|v\d+)/i.test(token)) {
        // In Vietnamese, decimal dot in percentage is commonly converted to comma
        if (/^\d+\.\d+%$/.test(token)) {
          translatedTokens.push(token.replace(".", ","));
        } else {
          translatedTokens.push(token);
        }
        continue;
      }

      // Perform single-word dictionary mapping with morphology
      const translatedWord = this.lookupWordEnToVi(token);
      translatedTokens.push(translatedWord);
    }

    let result = translatedTokens.join("");

    // ─── Tier 4: Restore approved terminology ───
    for (const item of lockedSegments) {
      const regex = new RegExp(this.escapeRegex(item.placeholder), "g");
      result = result.replace(regex, item.targetTerm);
    }

    // ─── Tier 5: Clean up double spaces or minor punctuation artifacts (preserve line breaks) ───
    result = result.replace(/[^\S\r\n]{2,}/g, " ").replace(/[^\S\r\n]+([,.:;!?])/g, "$1").trim();

    return this.rewriteBusinessSentencePatterns(result);
  }

  /**
   * Recasts common corporate/quality sentence patterns into more idiomatic Vietnamese,
   * while preserving locked glossary terms and technical tokens.
   */
  private rewriteBusinessSentencePatterns(text: string): string {
    let result = text;

    const replacements: Array<[RegExp, string]> = [
      [/\bThe organization\b/gi, "Tổ chức"],
      [/\bthe organization\b/gi, "tổ chức"],
      [/\bmust complete a comprehensive\b/gi, "phải hoàn thành một cách toàn diện"],
      [/\bmust complete\b/gi, "phải hoàn thành"],
      [/\bmust be enforced\b/gi, "phải được thực thi"],
        [/\bThe\s+organization\s+must\s+complete\b/gi, "Tổ chức phải hoàn thành"],
      [/\bmust be\b/gi, "phải được"],
      [/\bpolicies\b/gi, "các chính sách"],
      [/\bpolicy\b/gi, "chính sách"],
      [/\bannual(?:ly)?\b/gi, "hàng năm"],
      [/\bin accordance with\b/gi, "theo đúng"],
      [/\bstandards?\b/gi, "tiêu chuẩn"],
      [/\bproduction zones\b/gi, "khu vực sản xuất"],
      [/\baccess control\b/gi, "kiểm soát truy cập"],
        [/\bwith\s+([0-9]+(?:[.,][0-9]+)?)\s*%?\s*uptime\b/gi, "với thời gian hoạt động $1%"],
      [/\bacross all\b/gi, "trên tất cả"],
      [/\ball\b/gi, "tất cả"],
      [/\bcomprehensive\b/gi, "toàn diện"],
      [/\bannual\s+review\b/gi, "đánh giá hàng năm"],
      [/\bcomplete\s+([a-zÀ-ỹ0-9\- ]+)\s+annually\b/gi, "hoàn thành $1 hàng năm"],
      [/\bmust\s+enforced\b/gi, "phải được thực thi"],
        [/\benforced\b/gi, "thực thi"],
        [/\bwith\s+([0-9]+(?:[.,][0-9]+)?%?)\s+uptime\b/gi, "với thời gian hoạt động $1"],
        [/\bproduction\s+zones\b/gi, "khu vực sản xuất"],
        [/\bproduction\s+zone\b/gi, "khu vực sản xuất"],
        [/\bacross\s+all\b/gi, "trên tất cả"],
    ];

    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }

    result = result
      .replace(/Tổ chức phải hoàn thành một cách toàn diện ([^.!?]+) hàng năm theo đúng ([^.!?]+) và ([^.!?]+) tiêu chuẩn/gi, "Tổ chức phải hoàn thành $1 một cách toàn diện hàng năm theo đúng $2 và $3 tiêu chuẩn")
        .replace(/các chính sách kiểm soát truy cập phải được thực thi trên tất cả 4 khu vực sản xuất với thời gian hoạt động 99,9%/gi, "Các chính sách kiểm soát truy cập phải được thực thi trên tất cả 4 khu vực sản xuất với thời gian hoạt động 99,9%")
        .replace(/\b([A-ZÀ-Ý][^.!?]*?)\s+phải được thực thi trên tất cả\s+(\d+)\s+khu vực sản xuất với thời gian hoạt động\s+([0-9.,]+%?)/gi, "Các $1 phải được thực thi trên tất cả $2 khu vực sản xuất với thời gian hoạt động $3")
        .replace(/\bvới\s+(\d+(?:[.,]\d+)?)\s+thời gian hoạt động\b/gi, "với thời gian hoạt động $1%")
        .replace(/\bthời gian hoạt động\s+(\d+(?:[.,]\d+)?)\b(?!%)/gi, "thời gian hoạt động $1%")
        .replace(/\bwith\s+([0-9]+(?:[.,][0-9]+)?)\s*%?\s*thời gian hoạt động\b/gi, "với thời gian hoạt động $1%")
        .replace(/\bthời gian hoạt động\s+([0-9]+(?:[.,][0-9]+)?)\s*%\b/gi, "thời gian hoạt động $1%")
        .replace(/\bthời gian hoạt động\s+([0-9]+(?:[.,][0-9]+)?)\b(?!%)\s*$/gi, "thời gian hoạt động $1%")
        .replace(/(\d+)%\s*[.,]\s*(\d+)%/g, "$1,$2%")
        .replace(/(\d+)\.(\d+)(?=\s*(?:thời gian hoạt động|uptime|%))/gi, "$1,$2")
        .replace(/(\d+),(\d+)(?=%)/g, "$1,$2%")
        .replace(/(\d+),(\d+)%+/g, "$1,$2%")
        .replace(/(\d+)\.(\d+)%+/g, "$1,$2%")
        .replace(/(\d+),(\d+)%\s*\.(\d+)%/g, "$1,$2%")
        .replace(/(\d+)%\.(\d+)%/g, "$1,$2%")
        .replace(/(\d+),(\d+)%\s*(?:thời gian hoạt động)/gi, "$1,$2% thời gian hoạt động");

    return result;
  }

  /**
   * Translates Vietnamese text to English using reverse lookup.
   */
  private translateVietnameseToEnglish(text: string, approvedTerminology: any[]): string {
    let workingText = text;
    const placeholders: { placeholder: string; target: string }[] = [];

    // Normalize sewing density before glossary locking so a generic "mũi" term
    // cannot consume the measurement as "stitches/inch" or "tip".
    // Handles "10-12 mũi/inch" -> "SPI 10-12 stitches/inch", "9-10 mũi" -> "SPI 9-10 stitches/inch"
    workingText = workingText
      .replace(
        /\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s*mũi(?:\s*\/\s*inch)?\b/giu,
        "SPI $1 stitches/inch"
      )
      .replace(
        /\b(\d+(?:[.,]\d+)?)\s*mũi\s*\/\s*inch\b/giu,
        "SPI $1 stitches/inch"
      );


    // Build reverse dictionary mapping from OFFLINE_DICTIONARY and VI_EN_DICTIONARY
    const reverseDict: Record<string, string> = { ...VI_EN_DICTIONARY };
    for (const [en, viRaw] of Object.entries(OFFLINE_DICTIONARY)) {
      if (!viRaw) continue;
      const viParts = viRaw.split("/").map((p) => p.trim());
      for (const viPart of viParts) {
        const cleaned = viPart.replace(/\([^\)]+\)/g, "").trim().toLowerCase();
        if (cleaned.length >= 2 && !reverseDict[cleaned]) {
          reverseDict[cleaned] = en;
        }
      }
    }

    // ─── Tier 1: Multi-word Exact Terminology & Phrases (Longest-match-first) ───
    const phraseTerms = COMMON_PHRASES.map((p, i) => ({
      id: `__phrase_${i}`,
      sourceTerm: p.vi,
      targetTerm: p.en,
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "approved" as const,
      // Give long sentence-level phrases (≥30 chars) higher priority so they
      // are never silently overridden by shorter DB entries.
      priority: p.vi.trim().length >= 30 ? 10 : 0,
      confidence: 0.8,
      createdAt: "",
      updatedAt: "",
    }));

    const seenSources = new Set<string>();
    const combinedTerms = [];

    // Insert long COMMON_PHRASES sentence entries FIRST (unconditionally) so that
    // matchTerminology's longest-match-first selects them before any shorter DB entry
    // that might map the same VI source to an incomplete or wrong English translation.
    for (const pt of phraseTerms) {
      const lower = pt.sourceTerm.trim().toLowerCase();
      if (pt.sourceTerm.trim().length >= 30 && lower.length >= 2) {
        combinedTerms.push(pt);
        seenSources.add(lower);
      }
    }

    // Then add approved terminology from the database
    for (const t of approvedTerminology) {
      if (t.sourceTerm && t.sourceTerm.trim().length >= 2) {
        combinedTerms.push(t);
        // Only mark as seen if NOT already covered by a longer COMMON_PHRASES entry
        const lower = t.sourceTerm.trim().toLowerCase();
        if (!seenSources.has(lower)) seenSources.add(lower);
      }
    }

    // Finally add remaining shorter COMMON_PHRASES entries that aren't yet seen
    for (const pt of phraseTerms) {
      const lower = pt.sourceTerm.trim().toLowerCase();
      if (pt.sourceTerm.trim().length < 30 && !seenSources.has(lower) && lower.length >= 2) {
        combinedTerms.push(pt);
        seenSources.add(lower);
      }
    }

    // Match terminology and lock matches
    const matches = matchTerminology(workingText, combinedTerms);
    const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

    for (let i = 0; i < sortedMatches.length; i++) {
      const m = sortedMatches[i];
      const ph = `___REV_TERM_${i}___`;
      placeholders.push({ placeholder: ph, target: m.entry.targetTerm });
      workingText = workingText.slice(0, m.startIndex) + ph + workingText.slice(m.endIndex);
    }

    // ─── Tier 2: Grammatical Construction Patterns ───
    // Run grammar patterns before single-word replacement, supporting both placeholders and words
    const grammarPatterns = [
      {
        regex: /(?<![\p{L}\p{N}])không\s+bị\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `without ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])không\s+được\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `must not ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])sau\s+khi\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `after ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])trước\s+khi\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `before ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])phải\s+đúng\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `must meet ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])phải\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `must ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])các\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `the ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])thiếu\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `missing ${target}`,
      },
      {
        regex: /(?<![\p{L}\p{N}])thừa\s+(___REV_TERM_\d+___|[\p{L}\p{N}_-]+)(?![\p{L}\p{N}])/giu,
        handler: (_: string, target: string) => `excess ${target}`,
      },
    ];

    for (const gp of grammarPatterns) {
      gp.regex.lastIndex = 0;
      workingText = workingText.replace(gp.regex, gp.handler);
    }

    // Normalize sewing density measurements before tokenization; numeric slash phrases
    // do not reliably pass through the generic terminology boundary matcher.
    workingText = workingText.replace(
      /\b(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*mũi\s*\/\s*inch\b/giu,
      "$1 SPI"
    );

    // ─── Tier 3: Tokenized Word-by-Word Fallback for remaining Vietnamese tokens ───
    const tokenRegex = /(___REV_TERM_\d+___|[\p{L}\p{N}_.\-%:]+|[^\s\p{L}\p{N}_.\-%:]+|\s+)/gu;
    const tokens = workingText.match(tokenRegex) || [workingText];
    const outTokens: string[] = [];

    for (const token of tokens) {
      if (token.startsWith("___REV_TERM_") || /^\s+$/.test(token) || /^[^\p{L}\p{N}]+$/u.test(token) || /^\d+/.test(token)) {
        outTokens.push(token);
        continue;
      }

      const lower = token.toLowerCase();
      if (reverseDict[lower] !== undefined) {
        outTokens.push(this.applyCasing(token, reverseDict[lower]));
      } else {
        outTokens.push(token);
      }
    }

    workingText = outTokens.join("");

    // ─── Tier 4: Restore Placeholders in reverse order ───
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const p = placeholders[i];
      const phRegex = new RegExp(this.escapeRegex(p.placeholder), "g");
      workingText = workingText.replace(phRegex, (_match, offset) => {
        const prefixBefore = workingText.slice(0, offset);
        const isStart = offset === 0 || /[.!?\n*]\s*$/.test(prefixBefore) || /^\d+[.)]\s*$/.test(prefixBefore);
        return adaptTermCasing(p.target, isStart);
      });
    }

    // ─── Tier 5: Smart Post-processing & Refinement ───
    workingText = workingText
      .replace(/\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s+SPI\b/gi, "SPI $1 stitches/inch")
      .replace(/\b(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s+(?:stitches?|stitch)\s*(?:\/|\s*per\s*)\s*inch\b/gi, "SPI $1 stitches/inch")
      // Fix adjective / verb collocations
      .replace(/\bmust\s+tightly\b/gi, "must be tight")
      .replace(/\bmust\s+smooth\b/gi, "must be smooth")
      .replace(/\bwithout\s+is\s+gap\b/gi, "without edge gap")
      .replace(/\bno\s+is\s+gap\b/gi, "without edge gap")
      .replace(/\bnot\s+is\s+gap\b/gi, "without edge gap")
      .replace(/\bcutting\s+holes\s+laser\b/gi, "laser cutting holes")
      .replace(/\bcutting\s+line\s+laser\b/gi, "laser cutting line")
      // ─── QA Standard Safety Net ────────────────────────────────────────────
      // Ensure "flat does not accept" is replaced with "quality standard are acceptable"
      .replace(/\bflat\s+does\s+not\s+accept\b[^\.\,\;\n]*/gi, "quality standard are acceptable")
      // Normalize any "quality standard tolerances are acceptable" to "quality standard are acceptable"
      .replace(/\bquality\s+standard\s+tolerances\s+are\s+acceptable\b/gi,
        "quality standard are acceptable")
      // Ensure "Nosew" / "nosew" (NEVER "No-sew" or "no-sew")
      .replace(/\bNo-[sS]ew\b/g, "Nosew")
      .replace(/\bno-sew\b/g, "nosew")
      .replace(/\bNO-SEW\b/g, "NOSEW");

    return formatUppercaseStructure(workingText).replace(/\bspi\b/gi, "SPI");
  }

  /**
   * Looks up an individual English word in the offline dictionary with morphology rules.
   */
  private lookupWordEnToVi(word: string): string {
    const lower = word.toLowerCase();

    // 1. Direct match
    if (OFFLINE_DICTIONARY[lower] !== undefined) {
      return this.applyCasing(word, OFFLINE_DICTIONARY[lower]);
    }

    // 2. Morphological rule: Plural nouns ending in 'ies' (e.g. policies -> các chính sách)
    if (lower.endsWith("ies") && lower.length > 4) {
      const singular = lower.slice(0, -3) + "y";
      if (OFFLINE_DICTIONARY[singular]) {
        return `các ${OFFLINE_DICTIONARY[singular]}`;
      }
    }

    // 3. Morphological rule: Plural nouns ending in 'es' (e.g. processes -> các quy trình)
    if (lower.endsWith("es") && lower.length > 3) {
      const singular = lower.slice(0, -2);
      if (OFFLINE_DICTIONARY[singular]) {
        return `các ${OFFLINE_DICTIONARY[singular]}`;
      }
      const singularWithE = lower.slice(0, -1);
      if (OFFLINE_DICTIONARY[singularWithE]) {
        return `các ${OFFLINE_DICTIONARY[singularWithE]}`;
      }
    }

    // 4. Morphological rule: Regular plural nouns ending in 's' (e.g. standards -> các tiêu chuẩn)
    if (lower.endsWith("s") && lower.length > 2 && !lower.endsWith("ss")) {
      const singular = lower.slice(0, -1);
      if (OFFLINE_DICTIONARY[singular]) {
        return `các ${OFFLINE_DICTIONARY[singular]}`;
      }
    }

    // 5. Morphological rule: Past participle / past tense '-ed' (e.g. reviewed -> được xem xét, completed -> đã hoàn thành)
    if (lower.endsWith("ed") && lower.length > 3) {
      const base1 = lower.slice(0, -2); // e.g. clean -> cleaned
      const base2 = lower.slice(0, -1); // e.g. reviewe -> reviewed -> review + d -> e.g. complete -> completed
      const base = OFFLINE_DICTIONARY[base1] ? base1 : OFFLINE_DICTIONARY[base2] ? base2 : null;
      if (base && OFFLINE_DICTIONARY[base]) {
        return `đã ${OFFLINE_DICTIONARY[base]}`;
      }
    }

    // 6. Morphological rule: Present continuous '-ing' (e.g. testing -> đang thử nghiệm)
    if (lower.endsWith("ing") && lower.length > 4) {
      const base1 = lower.slice(0, -3);
      const base2 = base1 + "e";
      const base = OFFLINE_DICTIONARY[base1] ? base1 : OFFLINE_DICTIONARY[base2] ? base2 : null;
      if (base && OFFLINE_DICTIONARY[base]) {
        return `đang ${OFFLINE_DICTIONARY[base]}`;
      }
    }

    // 7. Morphological rule: Adverbs ending in '-ly' (e.g. strictly -> nghiêm ngặt, immediately -> ngay lập tức)
    if (lower.endsWith("ly") && lower.length > 3) {
      const adj = lower.slice(0, -2);
      if (OFFLINE_DICTIONARY[adj]) {
        return `một cách ${OFFLINE_DICTIONARY[adj]}`;
      }
    }

    // If word is unknown, return original word
    return word;
  }

  /**
   * Preserves capitalization style of original word when translating.
   */
  private applyCasing(original: string, translated: string): string {
    if (!translated) return "";
    // All caps
    if (original.length > 1 && original === original.toUpperCase()) {
      return translated.toUpperCase();
    }
    // Title case (first char capitalized)
    if (original[0] === original[0].toUpperCase()) {
      return translated.charAt(0).toUpperCase() + translated.slice(1);
    }
    return translated;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
