import { TranslationRequest } from "./types";
import { matchTerminology } from "../terminology/matcher";
import { extractEntities, isConciseModeEligible, buildConcisePromptRules } from "./concise-sop";

/**
 * Builds structured prompts for LLM providers as defined in Section 17.
 * Only sends minimal required matched terminology without unnecessary context.
 *
 * When concise-mode is active for a sentence, injects telegraphic SOP-style
 * rules with a mandatory entity checklist. If the sentence is complex or
 * contains high-risk content (defect lists, QA tolerance clauses), the standard
 * full-translation mode is used without any compaction.
 */
export function buildStructuredPrompt(
  request: TranslationRequest,
  enableConciseMode: boolean = false
): {
  systemPrompt: string;
  userPrompt: string;
  conciseModeActive: boolean;
} {
  // ─── Zero-Loss Conciseness Gate ──────────────────────────────────────────
  let conciseModeActive = false;
  let conciseRulesBlock = "";

  if (enableConciseMode && request.sourceLanguage?.toLowerCase().startsWith("vi")) {
    const extraction = extractEntities(request.sourceText);
    const { eligible } = isConciseModeEligible(request.sourceText, extraction);
    if (eligible) {
      conciseModeActive = true;
      conciseRulesBlock = "\n" + buildConcisePromptRules(extraction);
    }
  }

  const systemPrompt = `You are a professional footwear manufacturing translator translating from ${request.sourceLanguage.toUpperCase()} to ${request.targetLanguage.toUpperCase()}.

Rules:
1. Preserve numbers, dimensions, and technical measurements (e.g. 1.8mm, 15mm, 99.9%) exactly.
2. DOMAIN GLOSSARY REFERENCE: Refer to the provided GLOSSARY REFERENCE to maintain domain consistency for footwear manufacturing (Ching Luh / Nike SOP). You do NOT need to force-apply them 100% verbatim if the surrounding grammatical context or natural sentence flow calls for an appropriate variation. Translate naturally, accurately, and professionally.
3. Preserve technical acronyms and standards in ALL CAPS (e.g. ISO, NIST, PFC, EVA, TPU, QC, QA, SOP).
4. Produce a concise, professional translation: remove redundant wording and repeated ideas, but keep every distinct action, condition, defect, measurement, unit, standard, acronym, number, and approved term.
5. Preserve the original list, line break (\\n), and paragraph structure when it carries separate instructions. Never merge separate numbered steps or multi-line instructions into a single sentence.
6. Return ONLY the final translated text. Do NOT include thinking tags (<think>), explanations, notes, summaries about the translation, or markdown fences.
7. Stitch density (SPI): "mũi/inch" or stitch count ranges such as "10-12 mũi/inch", "9-10 mũi", "11-12 mũi", "7-8 mũi" MUST be translated as "SPI <number> stitches/inch" (e.g. "SPI 10-12 stitches/inch", "SPI 9-10 stitches/inch", "SPI 7-8 stitches/inch"). NEVER write just "<number> SPI" or "SPI <number>" without "stitches/inch".
8. Grammatical Noun-Phrase Ordering: In technical inspection headings and quality criteria (e.g. CTQ), attributes such as "Hình dạng [bộ vị]" MUST follow English noun phrase order: "[Component] shape" (e.g. "Hình dạng mũi" -> "Tip shape" / "Toe shape", NOT "Shape tip"; "Hình dạng gót" -> "Heel shape"; "Hình dạng vòng cổ" -> "Collar shape"). Do not invert noun phrases into verbs.
9. QA Quality Standard & Surface Geometry: Sentences containing "không bằng phẳng chấp nhận mức độ tiêu chuẩn..." or "chấp nhận mức độ tiêu chuẩn..." mean allowable acceptance due to uneven/non-flat component surfaces (e.g. "Due to the uneven surface design of [component], quality standards are acceptable for [defect]..."). DO NOT use the word "tolerances" and NEVER translate as "[flat] does not accept" or invert into a rejection.
10. Strict Footwear Terminology: Always write "No-sew" or "no-sew" with a hyphen. NEVER use "Nosew" or "nosew" under any circumstances.${request.context ? `\n11. MANUFACTURING STAGE CONTEXT: ${request.context}` : ""}${conciseRulesBlock}`;

  let glossaryText = "";
  if (request.approvedTerminology && request.approvedTerminology.length > 0) {
    const matched = matchTerminology(request.sourceText, request.approvedTerminology);
    if (matched.length > 0) {
      const polysemyMap = new Map<string, Set<string>>();
      for (const m of matched) {
        const src = m.entry.sourceTerm.trim();
        const tgt = m.entry.targetTerm.trim();
        if (!polysemyMap.has(src)) polysemyMap.set(src, new Set());
        polysemyMap.get(src)!.add(tgt);
      }
      glossaryText = `\n\nGLOSSARY REFERENCE (GUIDELINE / THAM KHẢO - NOT 100% FORCED):\n` +
        Array.from(polysemyMap.entries())
          .map(([src, tgtSet]) => {
            const targets = Array.from(tgtSet).join(" / ");
            return `- "${src}" -> "${targets}" (domain guideline, select the context-appropriate meaning or adapt naturally)`;
          })
          .join("\n");
    }
  }

  const userPrompt = `${glossaryText}\n\nTEXT TO TRANSLATE:\n${request.sourceText}`;

  return { systemPrompt, userPrompt, conciseModeActive };
}


