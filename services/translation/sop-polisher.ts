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

  // 2. Machine Adjustment & PFC Checking (Enforce "Check if" or "Check", strictly NO "Verify")
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+is\s+to\s+align\s+temperature\s*\/time\/\s*pressure\s+machine\s+nosew\s+correct\s+PFC\s*:/gi,
    "Check if no-sew machine temperature/time/pressure settings comply with PFC:"
  );
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+is\s+to\b/gi,
    "Check if machine is adjusted to"
  );
  polished = polished.replace(
    /\bCheck\s+machine\s+have\s+been\s+adjusted\b/gi,
    "Check if machine is adjusted for"
  );
  polished = polished.replace(
    /\bCheck\s+(?:the\s+)?time\s+and\s+temp\s+of\s+heating\s+oven\s+follow\s+PFC\s*:/gi,
    "Check if oven time and temperature follow PFC:"
  );
  polished = polished.replace(
    /\bTime\/temperature\s+of\s+heating\s+oven\s+follow\s+PFC\b/gi,
    "Check if oven time and temperature follow PFC"
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

  // 3b. Lean Technical Phrasing Polish (Nike / Ching Luh SOP Style)
  // Eliminates verbose operator fillers and conversational explanations
  polished = polished.replace(/\b(?:The\s+operator\s+(?:must\s+use|uses)\s+scissors\s+to\s+trim)\b/gi, "Trim");
  polished = polished.replace(/\b(?:The\s+operator\s+must\s+use\s+a\s+hammer\s+to\s+flatten)\b/gi, "Hammer and flatten");
  polished = polished.replace(/\b(?:The\s+operator\s+must|Operator\s+must)\s+/gi, "");
  polished = polished.replace(/\bThe\s+lasting\s+operation\s+must\s+pull\s+the\s+upper\s+edge\b/gi, "Pull upper edge");
  polished = polished.replace(/\bavoiding\s+a\s+wrinkle\s+upper\s+or\s+bulging\s+that\s+is\s+not\s+smooth\s+on\s+the\s+finished\s+shoe\b/gi, "to prevent upper wrinkles or bulging");
  polished = polished.replace(/\bAcceptance\s+quality\s+standard\s+for\s+hole\s+margin\s+deviation\s+is\s+0\.5mm\s+according\s+to\s+the\s+updated\s+QA\s+manual\b/gi, "Standard: Hole margin deviation <= 0.5mm per updated QA manual");
  polished = polished.replace(/\b(?:according\s+to\s+the\s+updated\s+QA\s+manual|according\s+to\s+QA\s+manual\s+update)\b/gi, "per updated QA manual");
  polished = polished.replace(/\bCheck\s+that\s+the\s+finished\s+shoe\s+has\s+no\b/gi, "Ensure finished shoe has no");
  polished = polished.replace(/\bThe\s+backside\s+after\s+lasting\s+must\s+be\b/gi, "Lasting backside must be");
  polished = polished.replace(/\bCheck\s+if\s+the\s+heel\s+seam\s+of\s+the\s+upper\s+is\s+centered\b/gi, "Check upper heel seam centering");
  polished = polished.replace(/\bCheck\s+if\s+the\s+lasting\s+and\s+tip\s+lasting\s+are\s+aligned\s+with\b/gi, "Check lasting and tip lasting alignment with");
  polished = polished.replace(/\bto\s+avoid\s+X-ray\s+at\s+the\s+tip\s+during\s+tip\s+lasting\b/gi, "to prevent tip bunion/X-ray during lasting");
  polished = polished.replace(/\bThe\s+notches\s+after\s+stitching\s+must\s+fit\s+tightly\s+together,\s+not\s+too\s+tight\s+or\s+too\s+loose\b/gi, "Ensure notches fit snugly without gap/tightness");
  polished = polished.replace(/\bthe\s+stitching\s+must\s+be\s+smoothly\s+and\s+evenly\s+applied\s+following\s+the\s+notches\b/gi, "stitch smoothly and evenly following notches");
  polished = polished.replace(/\bThe\s+outsole\s+is\s+placed\s+accurately\s+according\s+to\b/gi, "Align outsole accurately with");

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

  // 4b. Inspection Focuses Header Polish & Elimination of Redundant Duplicate Focuses
  polished = polished.replace(
    /(\b(?:IPQC|QA|QC|OQC)?\s*(?:Cutting|Stitching|Assembly|Stockfit|HFPA)?\s*Inspection\s+Focuses\s*:\s*)inspection\s+focuses\s*/gi,
    "$1"
  );
  // Clean corrupt "f press vamp/F upper" caused by acronym slash splitting
  polished = polished.replace(/\bf\s+press\s+vamp\/F\s+upper\b/gi, "H/F upper pressing");
  polished = polished.replace(/\bf\s+press\s+vamp\b/gi, "H/F upper pressing");
  polished = polished.replace(/\bf\s+press\b/gi, "H/F press");

  // 4c. User Directive: Use "Check if" or "Check", NEVER "Verify"
  polished = polished.replace(/\bVerify\s+that\b/gi, "Check if");
  polished = polished.replace(/\bverify\s+that\b/gi, "check if");
  polished = polished.replace(/\bVerify\s+if\b/gi, "Check if");
  polished = polished.replace(/\bverify\s+if\b/gi, "check if");
  polished = polished.replace(/\bVerify\s+(?:Apply|apply)\s+MEK\b/gi, "Check if MEK is applied");
  polished = polished.replace(/\bVerify\s+(?:Applying|applying)\s+/gi, "Check if ");
  polished = polished.replace(/\bVerify\s+the\s+operator\s+uses\s+a\s+hammer\s+to\s+flatten\b/gi, "Check if hammer is used to flatten");
  polished = polished.replace(/\bVerify\s+the\s+brush\s+is\s+used\b/gi, "Check if brush is used");
  polished = polished.replace(/\bVerify\s+the\s+operation\b/gi, "Check operation");
  polished = polished.replace(/\bVerify\s+finished\s+shoe\b/gi, "Check if finished shoe");
  polished = polished.replace(/\bVerify\s+components\s+are\s+fixed\b/gi, "Check if components are fixed");
  polished = polished.replace(/\bVerify\s+temperature,\s*time,\s*and\s*pressure\b/gi, "Check temperature, time, and pressure");
  polished = polished.replace(/\bVerify\s+deco\s+holes\s+depth\b/gi, "Check if deco hole depth");
  polished = polished.replace(/\bVerify\s+toe\s+lasting\s+operation\b/gi, "Check toe lasting operation");
  polished = polished.replace(/\bVerify\s+material\s+and\s+pressing\s+mold\b/gi, "Check if material and pressing mold");
  polished = polished.replace(/\bVerify\s+upper\s+quality\b/gi, "Check upper quality");
  polished = polished.replace(/\bVerify\s+strobel\s+is\s+stitched\b/gi, "Check if strobel is stitched");
  polished = polished.replace(/\bVerify\s+pressing\s+mold\b/gi, "Check if pressing mold");
  polished = polished.replace(/\bVerify\s+gauge\s+marking\s+pressure\b/gi, "Check gauge marking pressure");
  polished = polished.replace(/\bVerify\s+upper\s+fits\b/gi, "Check if upper fits");
  polished = polished.replace(/\bVerify\s+bottom\s+attaching\b/gi, "Check bottom attachment");
  polished = polished.replace(/\bVerify\s+no-sew\s+shape\b/gi, "Check if no-sew shape");
  polished = polished.replace(/\bVerify\s+stitching\s+collar\b/gi, "Check if stitching collar");
  polished = polished.replace(/\bVerify\b/g, "Check if");
  polished = polished.replace(/\bverify\b/g, "check if");
  polished = polished.replace(/\bCheck\s+if\s+if\b/gi, "Check if");
  polished = polished.replace(/\bcheck\s+if\s+if\b/gi, "check if");

  // 4d. Strict Terminology: Tip-quarter (Production Rule #3)
  polished = polished.replace(/\bTipquarter\b/gi, "Tip-quarter");
  polished = polished.replace(/\btipquarter\b/gi, "tip-quarter");
  polished = polished.replace(/\bTip\s+quarter\b/gi, "Tip-quarter");
  polished = polished.replace(/\btip\s+quarter\b/gi, "tip-quarter");

  // 4e. Strict Terminology: SPI <number> stitches/inch (Production Rule #3)
  polished = polished.replace(/\b(\d+-\d+|\d+)\s+SPI\b/gi, "SPI $1 stitches/inch");

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
