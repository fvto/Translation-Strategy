import { TranslationRequest } from "./types";
import { mandatoryTerminologyPrompt } from "../terminology/document-plan";
import { internalSopInstructions } from "./internal-sop";
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
2. You MUST use the approved terminology in MANDATORY GLOSSARY for its matched source phrase. Approved terminology takes precedence over general domain knowledge, synonyms, literal translations, and shorter overlapping phrases. Use the first form for a standalone process heading; select an explicitly listed action form for an instruction. Otherwise keep the approved wording exactly, allowing only capitalization and singular/plural agreement. If a glossary entry covers the complete input, return its approved translation directly.
3. Preserve technical acronyms and standards in ALL CAPS (e.g. ISO, NIST, PFC, EVA, TPU, QC, QA, SOP).
4. Produce short internal SOP instructions. Remove verbal filler, but preserve every source instruction and repetition, action, condition, defect, measurement, unit, standard, acronym, number, and approved term.
5. Preserve the original list, line break (\\n), and paragraph structure when it carries separate instructions. Never merge separate numbered steps or multi-line instructions into a single sentence.
6. Return ONLY the final translated text. Do NOT include thinking tags (<think>), explanations, notes, summaries about the translation, or markdown fences.
7. Stitch density (SPI): "mũi/inch" or stitch count ranges such as "10-12 mũi/inch", "9-10 mũi", "11-12 mũi", "7-8 mũi" MUST be translated as "SPI <number> stitches/inch" (e.g. "SPI 10-12 stitches/inch", "SPI 9-10 stitches/inch", "SPI 7-8 stitches/inch"). NEVER write just "<number> SPI" or "SPI <number>" without "stitches/inch".
8. Grammatical Noun-Phrase Ordering: In technical inspection headings and quality criteria (e.g. CTQ), attributes such as "Hình dạng [bộ vị]" MUST follow English noun phrase order: "[Component] shape" (e.g. "Hình dạng mũi" -> "Tip shape" / "Toe shape", NOT "Shape tip"; "Hình dạng gót" -> "Heel shape"; "Hình dạng vòng cổ" -> "Collar shape"). Do not invert noun phrases into verbs.
9. QA Quality Standard & Surface Geometry: Sentences containing "không bằng phẳng chấp nhận mức độ tiêu chuẩn..." or "chấp nhận mức độ tiêu chuẩn..." mean allowable acceptance due to uneven/non-flat component surfaces (e.g. "Due to the uneven surface design of [component], quality standards are acceptable for [defect]..."). DO NOT use the word "tolerances" and NEVER translate as "[flat] does not accept" or invert into a rejection.
10. Strict Footwear Terminology: Always write "No-sew" or "no-sew" with a hyphen. NEVER use "Nosew" or "nosew" under any circumstances.
11. Lean Inspection Instructions ("Kiểm tra ..."): Inspection instructions ("Kiểm tra ...") MUST ALWAYS use "Check if" followed by a concise grammatical clause (subject + finite verb + condition/predicate). Make sentences AS CONCISE AND DIRECT AS POSSIBLE (càng ngắn càng tốt để vừa ô bảng/slide): omit redundant articles ("the", "a"), filler connectors, and wordy relative clauses while strictly preserving all numbers, units, defects, and predicates. NEVER use "Check with". Examples: translate "Kiểm tra nhiệt độ thực tế 80-90°C..." as "Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg"; translate "Kiểm tra đặt mặt giày vào khuôn..." as "Check if upper is edge-even with hot mold, projector light centered on heel"; translate "Kiểm tra mặt giày khớp với khuôn ép..." as "Check if upper matches mold, mold mark matches machine to avoid mark on logo". Ensure correct subject-verb agreement (e.g. "upper matches", not "upper match"). "Kiểm tra" ALWAYS translates to "Check if", NEVER "Check with", "Verify", "Ensure", or bare "Check".${request.context ? `\n12. MANUFACTURING STAGE CONTEXT: ${request.context}` : ""}${conciseRulesBlock}
${request.sourceLanguage === "vi" && request.targetLanguage === "en" ? internalSopInstructions(request.sourceText, request.internalExamples) : ""}`;

  const glossaryText = mandatoryTerminologyPrompt(request.sourceText, request.approvedTerminology || []);

  const userPrompt = `${glossaryText}\n\nTEXT TO TRANSLATE:\n${request.sourceText}`;

  return { systemPrompt, userPrompt, conciseModeActive };
}


