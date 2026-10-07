import { ParseResult, TranslationItemValidation } from "./types";

/**
 * Enterprise Robust Multi-Stage JSON Parser & Validator
 * 
 * Safely handles:
 * - Multi-part text assembly (filtering out thought tokens).
 * - Markdown code fences (```json ... ```).
 * - Wrapped object structures ({ translations: [...] }, { items: [...] }, etc.).
 * - Balanced-bracket repair for truncated JSON arrays.
 * - String-aware object extraction for partial responses.
 * - Strict schema validation against expected input IDs (rejects unexpected IDs, duplicates, empty text).
 */
export class GeminiResponseParser {
  /**
   * Stage 1: Assembles clean text from Gemini candidates, ignoring thought metadata.
   */
  public static extractRawText(responseData: any): string {
    if (!responseData || typeof responseData !== "object") {
      return "";
    }

    const candidate = responseData.candidates?.[0];
    if (!candidate?.content?.parts) {
      return "";
    }

    const textParts = (candidate.content.parts || [])
      .filter((p: any) => p && typeof p.text === "string" && !p.thought)
      .map((p: any) => p.text);

    let raw = textParts.join("").trim();

    // Stage 2: Remove Markdown code fences if present
    raw = raw.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    return raw;
  }

  /**
   * Stage 3 & 4: Unwraps objects looking for standard wrapper keys.
   */
  private static unwrapCandidateArray(parsed: any): { array?: any[]; wrapper?: string } {
    if (Array.isArray(parsed)) {
      return { array: parsed };
    }

    if (parsed && typeof parsed === "object") {
      const knownKeys = ["translations", "items", "data", "results", "output", "translated_items"];
      for (const k of knownKeys) {
        if (Array.isArray(parsed[k])) {
          return { array: parsed[k], wrapper: k };
        }
      }

      // Check any array property in the object
      const foundKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      if (foundKey) {
        return { array: parsed[foundKey], wrapper: foundKey };
      }
    }

    return {};
  }

  /**
   * Stage 5: Balanced-bracket repair for truncated JSON arrays.
   * If array was cut off before `]`, finds the last complete `}` and closes with `]`.
   */
  private static attemptBracketRepair(rawText: string): any | null {
    const startBracket = rawText.indexOf("[");
    if (startBracket === -1) return null;

    const sub = rawText.slice(startBracket);
    const lastBrace = sub.lastIndexOf("}");
    if (lastBrace === -1) return null;

    const repaired = sub.slice(0, lastBrace + 1) + "]";
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  /**
   * Stage 6: String-aware object scanner.
   * Walks character by character, tracking quotes, escapes, and brace depth,
   * to extract complete JSON objects without regex vulnerabilities.
   */
  private static extractJsonObjectsStringAware(text: string): any[] {
    const results: any[] = [];
    let inString = false;
    let escapeNext = false;
    let depth = 0;
    let objectStart = -1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        if (inString) escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          if (depth === 0) {
            objectStart = i;
          }
          depth++;
        } else if (char === "}") {
          depth--;
          if (depth === 0 && objectStart !== -1) {
            const candidateObjStr = text.slice(objectStart, i + 1);
            try {
              const parsed = JSON.parse(candidateObjStr);
              if (parsed && typeof parsed === "object" && parsed.id) {
                results.push(parsed);
              }
            } catch {
              // Ignore single malformed block
            }
            objectStart = -1;
          }
        }
      }
    }

    return results;
  }

  /**
   * Stage 7 & Strict Schema Validation against input IDs.
   */
  public static parseGeminiResponse(
    responseData: any,
    expectedInputItems: { id: string; sourceText: string }[]
  ): ParseResult {
    const rawText = GeminiResponseParser.extractRawText(responseData);
    if (!rawText) {
      return {
        items: [],
        rawText: "",
        malformed: false,
        salvaged: false,
        error: "Empty response parts from Gemini candidate",
      };
    }

    let candidateArray: any[] = [];
    let wrapperDetected: string | undefined;
    let malformed = false;
    let salvaged = false;

    // 1. Direct JSON parse
    try {
      const parsed = JSON.parse(rawText);
      const unwrapped = GeminiResponseParser.unwrapCandidateArray(parsed);
      if (unwrapped.array) {
        candidateArray = unwrapped.array;
        wrapperDetected = unwrapped.wrapper;
      }
    } catch {
      malformed = true;
    }

    // 2. Bracket repair if direct parse failed
    if (candidateArray.length === 0) {
      const repaired = GeminiResponseParser.attemptBracketRepair(rawText);
      if (repaired) {
        const unwrapped = GeminiResponseParser.unwrapCandidateArray(repaired);
        if (unwrapped.array && unwrapped.array.length > 0) {
          candidateArray = unwrapped.array;
          wrapperDetected = unwrapped.wrapper;
          salvaged = true;
        }
      }
    }

    // 3. String-aware object scanner if still empty
    if (candidateArray.length === 0) {
      const scanned = GeminiResponseParser.extractJsonObjectsStringAware(rawText);
      if (scanned.length > 0) {
        candidateArray = scanned;
        salvaged = true;
      }
    }

    // 4. Regex salvage as absolute last resort
    if (candidateArray.length === 0) {
      const regexMatches = rawText.match(/\{[^{}]*"id"\s*:[^{}]*\}/g);
      if (regexMatches) {
        for (const m of regexMatches) {
          try {
            const p = JSON.parse(m);
            if (p?.id) candidateArray.push(p);
          } catch {
            // ignore
          }
        }
        if (candidateArray.length > 0) {
          salvaged = true;
        }
      }
    }

    // Strict schema validation & ID reconciliation
    const expectedIdSet = new Set(expectedInputItems.map((it) => String(it.id).trim()));
    const seenIds = new Set<string>();
    const validatedItems: TranslationItemValidation[] = [];

    for (const item of candidateArray) {
      if (!item || typeof item !== "object") continue;

      const id = String(item.id ?? "").trim();
      // Validate ID belongs to expected input
      if (!id || !expectedIdSet.has(id)) {
        continue;
      }

      // Prevent duplicate IDs (keep first valid)
      if (seenIds.has(id)) {
        continue;
      }

      // Extract translated text from any standard field
      const text =
        item.translatedText ??
        item.text ??
        item.translation ??
        item.targetText ??
        item.translated ??
        item.en;

      if (typeof text !== "string" || text.trim().length === 0) {
        continue;
      }

      seenIds.add(id);
      validatedItems.push({
        id,
        translatedText: text.trim(),
      });
    }

    return {
      items: validatedItems,
      rawText,
      malformed,
      salvaged,
      wrapperDetected,
    };
  }
}
