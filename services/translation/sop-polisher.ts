/**
 * SOP Grammar & Polish Engine for Footwear Manufacturing
 * Converts literal/word-by-word Vietnamese machine translations into crisp, professional,
 * standard imperative English as used in Nike / Ching Luh SOP documentation.
 */

export interface PolishOptions {
  stage?: string; // e.g. "cutting" | "nosew" | "stitching" | "assembly" | "stockfit" | "qa"
}

export function polishSopText(text: string, options: PolishOptions = {}): string {
  if (!text || !text.trim()) return text;

  let polished = text;

  // 1. Technical Tolerance & Quality Standard Acceptance (Strict User Directive: No 'tolerances')
  // e.g. "flat does not accept the quality standard..." -> "quality standards are acceptable..."
  polished = polished.replace(
    /\b(?:flat\s+does\s+not\s+accept|flat\s+not\s+accept)\b[\s\S]*?\b(?:quality\s+standard|standard)\b/gi,
    "quality standards are acceptable"
  );
  polished = polished.replace(
    /\bquality\s+standard\s+tolerances\s+are\s+acceptable\b/gi,
    "quality standards are acceptable"
  );
  polished = polished.replace(
    /\blevel\s+Color\s+migration\s+is\s+acceptable\b/gi,
    "color migration is acceptable"
  );

  // 2. Machine Adjustment & PFC Verification (Fix clumsy "Check machine have is to...")
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+is\s+to\s+align\s+temperature\s*\/time\/\s*pressure\s+machine\s+nosew\s+correct\s+PFC\s*:/gi,
    "Verify nosew machine temperature/time/pressure settings comply with PFC:"
  );
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+is\s+to\b/gi,
    "Verify machine is adjusted to"
  );
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+been\s+adjusted\b/gi,
    "Verify machine is adjusted for"
  );
  polished = polished.replace(
    /\bCheck\s+(?:the\s+)?time\s+and\s+temp\s+of\s+heating\s+oven\s+follow\s+PFC\s*:/gi,
    "Verify oven time and temperature follow PFC:"
  );
  polished = polished.replace(
    /\bTime\/temperature\s+of\s+heating\s+oven\s+follow\s+PFC\b/gi,
    "Verify oven time and temperature follow PFC"
  );

  // 3. Imperative Action Polish (Eliminate wordy "conduct/carry out/proceed to" fillers)
  polished = polished.replace(
    /\b(?:Carry\s+out|Conduct|Proceed\s+to)\s+(?:sweeping\s+glue|cementing)\b/gi,
    "Apply cement"
  );
  polished = polished.replace(
    /\b(?:carry\s+out|conduct|proceed\s+to)\s+(?:sweeping\s+glue|cementing)\b/gi,
    "apply cement"
  );
  polished = polished.replace(
    /\b(?:Carry\s+out|Conduct|Proceed\s+to)\s+priming\b/gi,
    "Apply primer"
  );
  polished = polished.replace(
    /\b(?:carry\s+out|conduct|proceed\s+to)\s+priming\b/gi,
    "apply primer"
  );
  polished = polished.replace(
    /\b(?:Carry\s+out|Conduct|Proceed\s+to)\s+(?:nosew|no-sew)\b/gi,
    "Press nosew"
  );
  polished = polished.replace(
    /\b(?:carry\s+out|conduct|proceed\s+to)\s+(?:nosew|no-sew)\b/gi,
    "press nosew"
  );
  polished = polished.replace(
    /\b(?:Carry\s+out|Conduct|Perform)\s+inspection\b/gi,
    "Inspect"
  );
  polished = polished.replace(
    /\b(?:carry\s+out|conduct|perform)\s+inspection\b/gi,
    "inspect"
  );

  // 4. Defect & Component Phrasing (Air bubble / Upper / Vamp)
  // "not bag empty", "bag empty", "no envelope" -> "no air bubbles"
  polished = polished.replace(
    /\b(?:not\s+bag\s+empty|bag\s+empty|no\s+envelope|no\s+empty\s+bag)\b/gi,
    "no air bubbles"
  );
  // "Shoe face / Front face is color migration" -> "Vamp has color migration"
  polished = polished.replace(
    /\b(?:The\s+front\s+face|Front\s+face)\s+is\s+(?:color\s+migration|hidden\s+color)\b/gi,
    "Vamp component has color migration"
  );
  // "shoe face after press nosew" -> "upper after nosew pressing"
  polished = polished.replace(
    /\bshoe\s+face\s+after\s+press\s+nosew\b/gi,
    "upper after nosew pressing"
  );
  // "check component vamp after spraying" -> "check vamp component after spraying"
  polished = polished.replace(
    /\bcheck\s+component\s+vamp\b/gi,
    "check vamp component"
  );
  polished = polished.replace(
    /\bCheck\s+component\s+vamp\b/gi,
    "Check vamp component"
  );

  // 5. Stage-Specific Polish
  const stage = options.stage?.toLowerCase();
  if (stage === "nosew" || stage === "no-sew") {
    // In Nosew, "protective film" handling
    polished = polished.replace(/\bfilm\s+protect\b/gi, "protective film");
  } else if (stage === "stitching") {
    // In Stitching, avoid "margin" for "may"
    polished = polished.replace(/\bmargin\s+mudguard\b/gi, "stitch mudguard");
  } else if (stage === "assembly") {
    // In Assembly, ensure "upper to bottom"
    polished = polished.replace(/\bupper\s+with\s+sole\b/gi, "upper to bottom");
  }

  // 6. Strict Terminology: "No-sew" / "no-sew" with hyphen (Production Rule #3, NEVER unhyphenated "Nosew" or "nosew")
  polished = polished
    .replace(/\bNosew\b/g, "No-sew")
    .replace(/\bnosew\b/g, "no-sew")
    .replace(/\bNOSEW\b/g, "NO-SEW");

  return polished;
}
