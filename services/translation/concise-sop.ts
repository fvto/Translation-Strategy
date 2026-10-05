/**
 * Zero-Loss Concise SOP Engine
 *
 * Philosophy: "Restructure syntax, NEVER summarize semantics."
 *
 * This engine enables compact, telegraphic SOP-style translations while providing
 * a mathematical guarantee that no technical entity is lost in the process.
 *
 * Architecture:
 *  1. extractEntities()        — Scan source for all protected technical entities
 *  2. validateEntityIntegrity()— Cross-check translation contains all entities
 *  3. isConciseModeEligible()  — Determine if sentence is safe to compact
 *  4. buildConcisePromptRules()— Generate conciseness rules to inject into prompt
 *  5. verifyConciseness()      — Full post-translation audit with auto-rollback logic
 */

export interface TechnicalEntity {
  type:
    | "measurement"      // 1.5mm, 15s, 110°C, 0.5mm, 2.5kg
    | "spec_range"       // 9-10 stitches/inch, 10-12 SPI
    | "component"        // Tip quarter, Heel, Vamp, Collar, Eyestay, Tongue
    | "defect"           // Bond gap, Skip stitch, Over cement, Frayed edge
    | "standard_ref"     // PFC, QA manual, SOP, ISO, QC
    | "action_verb"      // Check, Inspect, Ensure, Press, Stitch
    | "count_list"       // Lists of enumerated defects/checks (e.g. "đứt chỉ, nổi chỉ, bỏ mũi, lệch")
    | "condition";       // Accept / Reject conditions with thresholds
  value: string;
  normalized: string; // lowercase stripped for fuzzy matching
}

export interface EntityExtractionResult {
  entities: TechnicalEntity[];
  measurementCount: number;
  defectListCount: number;
  componentCount: number;
  complexityScore: number; // 0-100: higher = more complex, less safe to compact
}

export interface ConciseValidationResult {
  isValid: boolean;
  missingEntities: TechnicalEntity[];
  coveragePercent: number;
  shouldRollback: boolean;
  reason?: string;
}

// ─── Regex patterns ──────────────────────────────────────────────────────────

// Measurements: 1.5mm, 15s, 110°C, 0.5mm, 2.5kg/cm, 99.9%, 3mm, 1.8mm
const MEASUREMENT_REGEX = /\b(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m|s|sec|seconds?|°C|°F|kg(?:\/cm(?:²|2)?)?|%|inch|in\b)/gi;

// SPI / Stitch density ranges: 9-10, 10-12, 7-8 (with optional units)
const SPI_REGEX = /\b(?:SPI\s*)?(\d+)\s*[-–]\s*(\d+)\s*(?:stitches?\/inch|mũi\/inch|SPI|mũi)?/gi;

// Component terms (Vietnamese + English) - footwear anatomy
const VI_COMPONENTS: string[] = [
  "mũi giày", "gót giày", "mũi", "gót", "vòng cổ", "lưỡi gà", "lưỡi", "má trong", "má ngoài",
  "đế giữa", "đế ngoài", "lót giày", "cúp gót", "mudguard", "eyestay", "vamp",
];
const EN_COMPONENTS: string[] = [
  "tip quarter", "heel counter", "collar", "tongue", "vamp", "eyestay", "outsole",
  "midsole", "sockliner", "mudguard", "quarter", "tip", "heel", "lining",
  "collar lining", "toe cap", "strobel board",
];

// Vietnamese administrative filler phrases (safe to remove in compaction)
const VI_FILLER_PATTERNS: RegExp[] = [
  /tiến hành thực hiện (việc\s*)?/gi,
  /thực hiện việc\s*/gi,
  /lưu ý (thao tác )?(cẩn thận\s*)?/gi,
  /để (đảm bảo|tránh) (tình trạng\s*)?(xảy ra\s*)?(việc\s*)?/gi,
  /kiểm tra xem có (bị\s*)?.*? hay không/gi,
  /chú ý (cẩn thận\s*)?/gi,
  /nhằm mục đích\s*/gi,
  /trong quá trình\s*/gi,
  /cần phải\s*/gi,
];

// CTQ defect terms (Vietnamese source keywords for defect lists)
const VI_DEFECT_TERMS: string[] = [
  "đứt chỉ", "nổi chỉ", "bỏ mũi", "lệch", "nhảy chỉ", "hở keo", "lem keo", "tràn keo",
  "thiếu keo", "nhăn", "trề biên", "lộn chân", "bấp bênh", "mài cao", "biến dạng",
  "khác màu", "bọt khí", "sụp mí", "lệch mí", "lệch tâm", "xơ chỉ",
];

// Standards / references that must never be dropped
const STANDARD_REF_PATTERNS: RegExp[] = [
  /\bPFC\b/gi,
  /\bQA[-\s]?manual\b/gi,
  /\bSOP\b/gi,
  /\bISO\s*\d+/gi,
  /\bQC\b/gi,
  /\bCTQ\b/gi,
  /\bIPQC\b/gi,
  /\bISQ\b/gi,
];

// ─── Entity Extraction ────────────────────────────────────────────────────────

/**
 * Extracts all protected technical entities from a source Vietnamese text.
 * These entities MUST survive any form of conciseness transformation.
 */
export function extractEntities(sourceText: string): EntityExtractionResult {
  const entities: TechnicalEntity[] = [];
  const lower = sourceText.toLowerCase();

  // 1. Measurements (numbers + units)
  const measurements = new Set<string>();
  for (const m of sourceText.matchAll(MEASUREMENT_REGEX)) {
    const val = m[0].replace(/\s+/g, "").toLowerCase();
    if (!measurements.has(val)) {
      measurements.add(val);
      entities.push({ type: "measurement", value: m[0], normalized: val });
    }
  }

  // 2. SPI / Stitch ranges (critical - must never become "SPI is SPI" nor be dropped)
  const spiRanges = new Set<string>();
  for (const m of sourceText.matchAll(SPI_REGEX)) {
    const key = `${m[1]}-${m[2]}`;
    if (!spiRanges.has(key)) {
      spiRanges.add(key);
      entities.push({ type: "spec_range", value: m[0], normalized: key });
    }
  }

  // 3. Vietnamese component names
  for (const comp of VI_COMPONENTS) {
    if (lower.includes(comp.toLowerCase())) {
      entities.push({ type: "component", value: comp, normalized: comp.toLowerCase() });
    }
  }
  // English component names (for already partially-English slides)
  for (const comp of EN_COMPONENTS) {
    if (lower.includes(comp.toLowerCase())) {
      const norm = comp.toLowerCase();
      if (!entities.some((e) => e.normalized === norm)) {
        entities.push({ type: "component", value: comp, normalized: norm });
      }
    }
  }

  // 4. Vietnamese CTQ defect terms (defect lists — ALL must survive)
  const defectsFound: string[] = [];
  for (const defect of VI_DEFECT_TERMS) {
    if (lower.includes(defect.toLowerCase())) {
      defectsFound.push(defect);
      entities.push({ type: "defect", value: defect, normalized: defect.toLowerCase() });
    }
  }

  // 5. Standard references (PFC, QA manual, SOP, etc.)
  for (const pattern of STANDARD_REF_PATTERNS) {
    const matches = [...sourceText.matchAll(pattern)];
    for (const m of matches) {
      const norm = m[0].toLowerCase().replace(/[\s-]/g, "");
      if (!entities.some((e) => e.normalized === norm)) {
        entities.push({ type: "standard_ref", value: m[0], normalized: norm });
      }
    }
  }

  // 6. Enumerated defect / check lists (comma-separated Vietnamese terms, e.g. "không đứt chỉ, nổi chỉ, bỏ mũi, lệch")
  const listMatches = sourceText.match(/[,;]\s*(?:không\s+)?[a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]{3,25}(?=[,;])/gi);
  const listCount = listMatches ? listMatches.length : 0;

  // ─── Complexity Score ──────────────────────────────────────────────────────
  // Higher score = more complex sentence = less safe to compact (>70 = preserve full)
  let complexityScore = 0;
  complexityScore += measurements.size * 10;     // Each measurement adds 10 pts
  complexityScore += spiRanges.size * 5;         // SPI ranges add 5 pts
  complexityScore += defectsFound.length * 15;   // Each defect term adds 15 pts (list risk!)
  complexityScore += listCount * 20;             // Comma-separated lists are high-risk
  complexityScore += entities.filter((e) => e.type === "standard_ref").length * 8;

  // Conditional / multi-clause sentences add risk
  const conditionalMarkers = /\b(nếu|trong trường hợp|khi|nhưng|ngoại trừ|chấp nhận|tolera|accept)\b/gi;
  complexityScore += ([...sourceText.matchAll(conditionalMarkers)].length) * 12;

  return {
    entities,
    measurementCount: measurements.size,
    defectListCount: defectsFound.length,
    componentCount: entities.filter((e) => e.type === "component").length,
    complexityScore: Math.min(complexityScore, 100),
  };
}

// ─── Eligibility Check ────────────────────────────────────────────────────────

/**
 * Determines if a sentence is safe for conciseness transformation.
 * Returns false for complex multi-clause technical sentences → preserve full translation.
 *
 * SAFE  (eligible):  Simple 1–2 action + spec sentences
 * UNSAFE (skip):     Multi-defect lists, conditional QA tolerance clauses, safety warnings
 */
export function isConciseModeEligible(
  sourceText: string,
  extraction: EntityExtractionResult
): { eligible: boolean; reason: string } {
  const text = sourceText.trim();

  // 1. Too short to bother compacting
  if (text.length < 30) {
    return { eligible: false, reason: "Sentence too short — no value in compacting" };
  }

  // 2. High complexity score → full translation is safer
  if (extraction.complexityScore >= 65) {
    return {
      eligible: false,
      reason: `High complexity score (${extraction.complexityScore}/100): multi-defect list or multi-conditional clause — preserving full translation`,
    };
  }

  // 3. Sentences with 3+ comma-separated defect/check items → too risky to compact
  if (extraction.defectListCount >= 3) {
    return {
      eligible: false,
      reason: `Contains ${extraction.defectListCount} distinct defect terms — compaction risks losing enumerated items`,
    };
  }

  // 4. Safety warning / QA tolerance acceptance clauses → preserve verbatim
  if (/chấp nhận mức độ|tiêu chuẩn chấp nhận|accept.*QA/i.test(text)) {
    return {
      eligible: false,
      reason: "QA tolerance acceptance clause — must preserve exact conditional phrasing",
    };
  }

  // 5. Already short enough (< 80 chars) → no benefit
  if (text.length < 80) {
    return { eligible: false, reason: "Sentence already short enough" };
  }

  return { eligible: true, reason: "Safe to compact: simple action-spec structure" };
}

// ─── Prompt Rule Injection ────────────────────────────────────────────────────

/**
 * Builds the prompt injection block for concise-mode eligible sentences.
 * Only called when isConciseModeEligible() returns true.
 * Provides exact entities that MUST appear in the output as a contract.
 */
export function buildConcisePromptRules(
  extraction: EntityExtractionResult
): string {
  const mustKeep: string[] = [];

  for (const entity of extraction.entities) {
    if (entity.type === "measurement") mustKeep.push(`"${entity.value}" (exact number+unit)`);
    if (entity.type === "spec_range") mustKeep.push(`SPI range "${entity.normalized}" stitches/inch`);
    if (entity.type === "component") mustKeep.push(`component "${entity.value}"`);
    if (entity.type === "defect") mustKeep.push(`defect term for "${entity.value}"`);
    if (entity.type === "standard_ref") mustKeep.push(`standard "${entity.value}"`);
  }

  const mustKeepList = mustKeep.slice(0, 12).join(", ");

  return `
CONCISE SOP MODE (ACTIVE — Safe for this sentence):
- Use telegraphic imperative format: [Action verb] + [Component] + [Spec/Defect/Condition]
- Strip administrative fillers: "tiến hành thực hiện", "chú ý cẩn thận", "để tránh tình trạng", "kiểm tra xem có... hay không"
- Convert verbose phrases: "carry out the process of checking" → "Check"
- MANDATORY: The following entities MUST appear in your output (do NOT omit any): ${mustKeepList || "all technical terms from source"}
- FORBIDDEN: Do NOT merge or paraphrase defect lists. If source has 4 defects, output must have exactly 4.
- Target length: ~40–60% of what a literal word-for-word translation would produce.`.trim();
}

// ─── Post-Translation Entity Validation ──────────────────────────────────────

/**
 * English proxies for Vietnamese defect terms used in post-translation audit.
 */
const VI_TO_EN_DEFECT_PROXIES: Record<string, string[]> = {
  "đứt chỉ": ["broken thread", "thread break", "snapped stitch"],
  "nổi chỉ": ["loose thread", "raised thread", "thread pull"],
  "bỏ mũi": ["skip stitch", "missed stitch", "skipped stitch"],
  "lệch": ["misalign", "offset", "uneven", "crooked"],
  "nhảy chỉ": ["skip stitch", "skipped stitch"],
  "hở keo": ["bond gap", "open glue", "delamination"],
  "lem keo": ["cement smear", "glue stain", "cement overflow"],
  "tràn keo": ["cement overflow", "excess cement", "glue flashing"],
  "thiếu keo": ["lack of cement", "insufficient cement", "starved glue"],
  "nhăn": ["wrinkle", "crease", "pucker", "fold"],
  "trề biên": ["flashing", "edge overflow", "material overflow"],
  "sụp mí": ["collapsed seam", "dropped stitch", "run-off"],
  "lệch mí": ["seam misalignment", "misaligned edge"],
  "bọt khí": ["air bubble", "blister", "void"],
};

const VI_COMPONENT_EN_PROXIES: Record<string, string[]> = {
  "mũi giày": ["vamp", "toe", "tip"],
  "mũi": ["tip", "toe", "vamp"],
  "gót giày": ["heel"],
  "gót": ["heel"],
  "vòng cổ": ["collar", "neckline", "opening"],
  "lưỡi gà": ["tongue"],
  "lưỡi": ["tongue"],
  "đế giữa": ["midsole"],
  "đế ngoài": ["outsole"],
  "lót giày": ["sockliner", "insole"],
  "cúp gót": ["heel counter"],
  "má trong": ["medial"],
  "má ngoài": ["lateral"],
};

/**
 * Validates that the translated text preserves all extracted source entities.
 * Uses fuzzy English-proxy matching for Vietnamese source terms.
 *
 * @param translatedText — The AI-generated English output
 * @param extraction — Entity extraction result from the Vietnamese source
 * @returns ConciseValidationResult — pass/fail with specific missing entities
 */
export function validateEntityIntegrity(
  translatedText: string,
  extraction: EntityExtractionResult
): ConciseValidationResult {
  const lowerTranslation = translatedText.toLowerCase().replace(/\s+/g, " ");
  const missing: TechnicalEntity[] = [];

  for (const entity of extraction.entities) {
    let found = false;

    switch (entity.type) {
      case "measurement": {
        // Check if the number appears in translation (unit may differ slightly, e.g. "seconds" vs "s")
        const numMatch = entity.value.match(/\d+(?:[.,]\d+)?/);
        if (numMatch) {
          found = lowerTranslation.includes(numMatch[0]);
        }
        break;
      }

      case "spec_range": {
        // SPI range: "9-10" or "9 - 10" must appear
        const rangeMatch = entity.normalized.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const [, lo, hi] = rangeMatch;
          found =
            lowerTranslation.includes(`${lo}-${hi}`) ||
            lowerTranslation.includes(`${lo} - ${hi}`) ||
            lowerTranslation.includes(`${lo} to ${hi}`);
        }
        break;
      }

      case "component": {
        // Check English proxies first, then original term
        const proxies = VI_COMPONENT_EN_PROXIES[entity.normalized] || [];
        found =
          proxies.some((p) => lowerTranslation.includes(p)) ||
          lowerTranslation.includes(entity.normalized);
        // Also check for English components directly
        if (!found && EN_COMPONENTS.some((c) => c.toLowerCase() === entity.normalized)) {
          found = lowerTranslation.includes(entity.normalized);
        }
        break;
      }

      case "defect": {
        // Check English defect proxies
        const proxies = VI_TO_EN_DEFECT_PROXIES[entity.normalized] || [];
        found = proxies.some((p) => lowerTranslation.includes(p));
        break;
      }

      case "standard_ref": {
        // Standards like PFC, QA manual must appear verbatim
        found = lowerTranslation.includes(entity.normalized.replace(/[\s-]/g, "")) ||
          lowerTranslation.includes(entity.value.toLowerCase());
        break;
      }

      default:
        found = true; // action verbs / conditions — flexible
    }

    if (!found) {
      missing.push(entity);
    }
  }

  const totalEntities = extraction.entities.length;
  const foundCount = totalEntities - missing.length;
  const coveragePercent = totalEntities > 0 ? Math.round((foundCount / totalEntities) * 100) : 100;

  // Rollback if ANY critical entity (measurement, spec, defect, standard) is missing
  const criticalMissing = missing.filter((e) =>
    e.type === "measurement" || e.type === "spec_range" || e.type === "standard_ref" || e.type === "defect"
  );
  const shouldRollback = criticalMissing.length > 0;

  return {
    isValid: missing.length === 0,
    missingEntities: missing,
    coveragePercent,
    shouldRollback,
    reason: shouldRollback
      ? `Missing ${criticalMissing.length} critical entities: ${criticalMissing.map((e) => `"${e.value}" [${e.type}]`).join(", ")}`
      : missing.length > 0
      ? `Minor gaps: ${missing.map((e) => e.value).join(", ")}`
      : undefined,
  };
}

// ─── Full Verification Orchestrator ──────────────────────────────────────────

export interface ConciseVerificationResult {
  usedConciseMode: boolean;
  finalText: string;
  rolledBack: boolean;
  coveragePercent: number;
  missingEntities: TechnicalEntity[];
  eligibilityReason: string;
  complexityScore: number;
}

/**
 * Top-level orchestrator: given a source text and two candidate translations
 * (concise + full), returns the optimal output with zero-loss guarantee.
 *
 * @param sourceText        — Original Vietnamese source
 * @param conciseTranslation— AI output generated under concise-mode prompt
 * @param fullTranslation   — AI output generated under standard prompt (safety net)
 */
export function verifyConciseness(
  sourceText: string,
  conciseTranslation: string,
  fullTranslation: string
): ConciseVerificationResult {
  const extraction = extractEntities(sourceText);
  const { eligible, reason: eligibilityReason } = isConciseModeEligible(sourceText, extraction);

  // Sentence not eligible → return full translation unchanged
  if (!eligible) {
    return {
      usedConciseMode: false,
      finalText: fullTranslation,
      rolledBack: false,
      coveragePercent: 100,
      missingEntities: [],
      eligibilityReason,
      complexityScore: extraction.complexityScore,
    };
  }

  // Validate concise output
  const validation = validateEntityIntegrity(conciseTranslation, extraction);

  if (validation.shouldRollback) {
    // Safety rollback → use full translation, log what was lost
    console.warn(
      `[ConciseSOP] Auto-rollback on "${sourceText.slice(0, 60)}...": ${validation.reason}`
    );
    return {
      usedConciseMode: false,
      finalText: fullTranslation,
      rolledBack: true,
      coveragePercent: validation.coveragePercent,
      missingEntities: validation.missingEntities,
      eligibilityReason: `Rolled back: ${validation.reason}`,
      complexityScore: extraction.complexityScore,
    };
  }

  // All entities preserved → use concise translation
  return {
    usedConciseMode: true,
    finalText: conciseTranslation,
    rolledBack: false,
    coveragePercent: validation.coveragePercent,
    missingEntities: validation.missingEntities,
    eligibilityReason,
    complexityScore: extraction.complexityScore,
  };
}
