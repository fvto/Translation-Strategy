import {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from "./types";
import { buildStructuredPrompt } from "./context";
import { normalizeSpiTerminology } from "./casing";
import { enforceTerminologyCompliance } from "../terminology/enforcer";

/** A quota error is recoverable, but waiting inside a request is not. */
export class GeminiRateLimitError extends Error {
  readonly code = "GEMINI_RATE_LIMIT";
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function rateLimitError(message: string): GeminiRateLimitError {
  const retryMatch = message.match(/retry in\s+([\d.]+)\s*s/i);
  const retryAfterSeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : undefined;
  return new GeminiRateLimitError(message, retryAfterSeconds);
}

/**
 * Gemini Translation Provider
 * 
 * Powered by Google Gemini with custom terminology enforcement,
 * batch processing with bounded 503 backoff. Quota (429) is surfaced immediately
 * so the document workflow can switch providers without blocking the whole deck.
 */
export class GeminiTranslationProvider implements TranslationProvider {
  name = "gemini";
  private apiKey?: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    this.model = model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  }

  private getCandidateModels(): string[] {
    const envModel = process.env.GEMINI_MODEL || "";
    const primary = envModel || this.model || "gemini-3.5-flash-lite";
    const candidates = [
      primary,
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
    ].filter(Boolean);
    return Array.from(new Set(candidates));
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const key = this.apiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is not configured in settings or environment (GEMINI_KEY).");
    }

    const startTime = Date.now();
    const { systemPrompt, userPrompt } = buildStructuredPrompt(request);
    const candidateModels = this.getCandidateModels();

    let lastError: Error | null = null;
    let successfulModel = this.model;

    for (const currentModel of candidateModels) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
          const res = await fetch(url, {
            method: "POST",
            signal: AbortSignal.timeout(60_000),
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: systemPrompt }],
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: userPrompt }],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
              },
            }),
          });

          if (res.status === 429) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error?.message || `Gemini ${currentModel} returned ${res.status}`;
            throw rateLimitError(errMsg);
          }

          if (res.status === 503) {
            lastError = new Error(`Gemini ${currentModel} returned 503 (model overloaded)`);
            console.warn(`[Gemini] ${currentModel} returned 503 (server overloaded). Attempt ${attempt + 1}/3...`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API Error (${res.status}): ${errText}`);
          }

          const data = await res.json();
          let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

          // Strip any accidental markdown fences and normalize SPI
          rawText = normalizeSpiTerminology(
            rawText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "")
          ).trim();

          const enforced = enforceTerminologyCompliance(
            request.sourceText,
            rawText,
            request.approvedTerminology || [],
            request.sourceLanguage,
            request.targetLanguage
          );

          successfulModel = currentModel;
          return {
            translatedText: enforced.text,
            provider: `Google Gemini (${successfulModel})`,
            durationMs: Date.now() - startTime,
            modelName: successfulModel,
          };
        } catch (err: any) {
          lastError = err;
          if (err instanceof GeminiRateLimitError) throw err;
          // If network or other non-rate error, try next candidate
          break;
        }
      }
    }

    throw lastError || new Error("Failed to translate with Gemini provider.");
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const key = this.apiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is not configured in settings or environment (GEMINI_KEY).");
    }

    const startTime = Date.now();
    const results = new Map<string, string>();

    if (!request.items || request.items.length === 0) {
      return {
        results,
        provider: `Google Gemini (${this.model})`,
        durationMs: 0,
        modelName: this.model,
      };
    }

    // Build system instruction with glossary (filter to only relevant terms in this chunk)
    let glossaryGuide = "";
    if (request.approvedTerminology && request.approvedTerminology.length > 0) {
      const combinedLower = request.items
        .map((it) => it.sourceText)
        .join(" ")
        .toLowerCase();

      const relevantTerms = request.approvedTerminology
        .filter((t) => {
          if (!t.sourceTerm || t.sourceTerm.trim().length < 2) return false;
          return combinedLower.includes(t.sourceTerm.trim().toLowerCase());
        })
        .slice(0, 35);

      const cleanTerms = relevantTerms
        .map((t) => {
          const cleanTarget = t.targetTerm.replace(/\s*\(.*?\)/g, "").replace(/\s*ex:.*$/i, "").trim();
          return { sourceTerm: t.sourceTerm.trim(), targetTerm: cleanTarget };
        })
        .filter((t) => t.targetTerm && t.sourceTerm);

      if (cleanTerms.length > 0) {
        glossaryGuide = `\nDOMAIN GLOSSARY REFERENCE (GUIDELINE / THAM KHẢO - NOT 100% FORCED):
The following approved footwear terminology should be used as a strong reference to ensure domain consistency:
${cleanTerms.map((t) => `- "${t.sourceTerm}" -> "${t.targetTerm}"`).join("\n")}
Apply these terms naturally according to the surrounding sentence structure and context. Do NOT force rigid word-for-word substitutions if the natural syntax or grammatical flow of the sentence requires an appropriate contextual variation. Preserve acronyms, dimensions, technical tolerances, numbers, and punctuation.`;
      }
    }

    const contextBlock = request.context ? `\nMANUFACTURING STAGE & CONTEXT:\n${request.context}\n` : "";

    const systemInstruction = `You are a professional athletic footwear manufacturing quality assurance (QA/QC) translation engine for Ching Luh / Nike production manuals (IPQC/ISQ).
Translate each provided item accurately from ${request.sourceLanguage.toUpperCase()} to ${request.targetLanguage.toUpperCase()}.
${contextBlock}
${glossaryGuide}
Key domain translation guidelines:
- Footwear construction: "mặt trước" -> "vamp", "mặt giày" -> "upper", "lót vòng cổ" -> "collar lining", "vòng cổ" -> "collar opening", "lưỡi gà" -> "tongue", "gót" -> "heel", "ô dê" -> "eyestay", "eo ngoài" -> "lateral / lat", "eo trong" -> "medial / med", "phom" -> "last", "đế trung" -> "midsole", "đế ngoài" -> "outsole", "bộ vị" -> "component / part".
- Quality Standards & Surface Unevenness: When text mentions "không bằng phẳng chấp nhận mức độ tiêu chuẩn...", it specifies that quality standards are acceptable due to component surface design (e.g. "Due to the uneven surface design of [component], quality standards are acceptable for [defect]..."). DO NOT use the word "tolerances" and NEVER translate as "[flat] does not accept".
- Stitch density (SPI): "mũi/inch" and stitch count ranges like "10-12 mũi/inch", "9-10 mũi", "11-12 mũi", "7-8 mũi" MUST be translated as "SPI <number> stitches/inch" (e.g. "10-12 mũi/inch" -> "SPI 10-12 stitches/inch", "9-10 mũi" -> "SPI 9-10 stitches/inch", "11-12 mũi/inch" -> "SPI 11-12 stitches/inch", "7-8 mũi" -> "SPI 7-8 stitches/inch"). NEVER write just "<number> SPI" or "SPI <number>" without "stitches/inch". The strictly required format is "SPI <number> stitches/inch".
- Processes & Defects: "lập thể nổi đều" -> "consistent deboss / 3D emboss", "độ bo mũi" -> "toe curve", "mũi/gót thẳng hàng" -> "toe/heel alignment", "cách biên" -> "margin", "cách kim" -> "stitch spacing / SPI", "vô phom" -> "lasting", "định hình lạnh" -> "cold molding / cold shaping", "dập bằng" -> "hammering flat", "phun keo và dán mos" / "phun keo và dán mút" -> "*Spray cement and attach cement foam", "dán mos" / "dán mút" -> "attach cement foam" (always use "attach", NEVER "apply" or typo "aplly" for foam attachment), "lộn chân" -> "swapped feet".
- Grammatical Noun-Phrase Ordering for Inspection Criteria / CTQ: In footwear inspection headings, attributes like "Hình dạng [bộ vị]" MUST be translated with English noun adjunct ordering "[Component] shape" (e.g. "Hình dạng mũi" -> "Tip shape" / "Toe shape", NEVER "Shape tip"; "Hình dạng gót" -> "Heel shape"; "Hình dạng vòng cổ" -> "Collar shape"). Do NOT invert noun phrases into imperative verb actions.
- Lists & Headings: Process titles starting with '*' (e.g. *Lacing, *Buffing) mark top-level process sections; NEVER create or duplicate process headings inside numbered lists (e.g. never place *Lacing between step 2 and 3).
- Line Break & Multi-line Preservation: If a sourceText item contains newline characters ('\n') separating lines or numbered steps (e.g. '2. ...\n3. ...'), you MUST strictly preserve the exact same line break structure in translatedText. Each line must remain on its own line separated by '\n'. NEVER merge multiple numbered steps or lines into a single continuous sentence.
- Strictly preserve all dimensions (mm, cm, kg/cm2), temperature ranges (e.g. 90-110oC), fractions (e.g. 1/2 size), acronyms (PFC, SPI, QAM, CTQ, CTP, ISQ, H/F, BPM), codes, and punctuation.
IMPORTANT: You MUST translate every item that is in ${request.sourceLanguage.toUpperCase()} into accurate, fluent, technical English. Do NOT return the source Vietnamese text.
Return strictly a valid JSON array of objects with keys "id" and "translatedText".`;

    const promptItems = request.items.map((it) => ({
      id: it.id,
      sourceText: it.sourceText,
    }));

    const userPrompt = `Translate the following items from ${request.sourceLanguage.toUpperCase()} to ${request.targetLanguage.toUpperCase()}.
Every item that is in ${request.sourceLanguage.toUpperCase()} MUST be translated into natural English. Do NOT leave text in ${request.sourceLanguage.toUpperCase()}.
Return ONLY a valid JSON array with format: [{"id": "...", "translatedText": "..."}]
Input:
${JSON.stringify(promptItems, null, 2)}`;

    const candidateModels = this.getCandidateModels();
    let lastError: Error | null = null;
    let successfulModel = this.model;

    for (const currentModel of candidateModels) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
          const res = await fetch(url, {
            method: "POST",
            signal: AbortSignal.timeout(60_000),
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: systemInstruction }],
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: userPrompt }],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json",
                maxOutputTokens: 8192,
              },
            }),
          });

          if (res.status === 429) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error?.message || `Gemini ${currentModel} returned ${res.status}`;
            throw rateLimitError(errMsg);
          }

          if (res.status === 503) {
            lastError = new Error(`Gemini ${currentModel} returned 503 (model overloaded)`);
            console.warn(`[GeminiBatch] ${currentModel} returned 503 (server overloaded). Attempt ${attempt + 1}/3...`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini Batch API Error (${res.status}): ${errText}`);
          }

          const data = await res.json();
          let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "[]";

          // Clean JSON markdown blocks if any
          rawText = rawText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();

          let parsed: any = null;
          try {
            parsed = JSON.parse(rawText);
          } catch (pe) {
            const match = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (match) {
              try {
                parsed = JSON.parse(match[0]);
              } catch (pe2) {}
            }
          }

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const text =
                item.translatedText ??
                item.text ??
                item.translation ??
                item.targetText ??
                item.translated ??
                item.en;
              if (item.id && typeof text === "string") {
                const sourceItem = request.items.find((x) => x.id === item.id);
                const enforced = sourceItem
                  ? enforceTerminologyCompliance(
                      sourceItem.sourceText,
                      text,
                      request.approvedTerminology || [],
                      request.sourceLanguage,
                      request.targetLanguage
                    ).text
                  : normalizeSpiTerminology(text).trim();
                results.set(item.id, enforced);
              }
            }
          }

          successfulModel = currentModel;
          return {
            results,
            provider: `Google Gemini (${successfulModel})`,
            durationMs: Date.now() - startTime,
            modelName: successfulModel,
          };
        } catch (err: any) {
          lastError = err;
          if (err instanceof GeminiRateLimitError) throw err;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Failed to batch translate with Gemini provider.");
  }
}
