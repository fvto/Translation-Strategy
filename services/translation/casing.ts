/**
 * Casing and Uppercase Normalization Engine
 * 
 * Enforces grammatical sentence casing, list item initial capitalization,
 * post-punctuation capitalization, and adaptive mid-sentence glossary casing
 * while strictly protecting technical standards and manufacturing acronyms.
 */

export const KNOWN_ACRONYMS = new Set([
  "ISO", "NIST", "PFC", "EVA", "QC", "QA", "TPU", "PU", "PVC", "TPR",
  "CAD", "CAM", "SOP", "QMS", "CAPA", "BIA", "BCP", "DRP", "SLA", "RPO",
  "RTO", "RBAC", "MFA", "SSO", "NMT", "CAT", "OS", "MS", "RF", "UV",
  "ASTM", "PPM", "ERP", "MES", "OEE", "FMEA", "SPC", "SPI"
]);

/**
 * Strips raw internal annotations and simplifies multi-choice slashes from glossary terms.
 * e.g.:
 * "Overlap (ưu tiên) / Cover / Block" -> "overlap"
 * "flashing/edge/material edge" -> "material edge"
 * "nail holes/position holes" -> "position holes"
 */
export function cleanTargetTerm(term: string): string {
  if (!term) return "";
  let t = term.trim();

  // 1. If explicitly designated with "(ưu tiên)" (preferred), extract that exact variant
  const prefMatch = t.match(/([A-Za-z0-9\s\-]+)\s*\(\s*ưu\s*tiên\s*\)/i);
  if (prefMatch) {
    t = prefMatch[1].trim();
  }

  // 2. Strip any Vietnamese parenthetical notes: "(sd cho định vị)", "(trong tiêu chuẩn)", etc.
  t = t.replace(/\s*\([^)]*[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ][^)]*\)/gi, "").trim();

  // 3. If multiple slash variants remain (e.g. "flashing/edge/material edge")
  if (t.includes("/")) {
    const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
    // Prefer the most descriptive phrase (contains space) or the last clean variant
    const compound = parts.find((p) => p.includes(" "));
    t = compound || parts[0];
  }

  // 4. Standardize compound defect hyphenation
  if (/^run[\s-]off\s+stitching$/i.test(t)) {
    return "run-off stitching";
  }

  return t;
}

/**
 * Adapts target term casing based on its position in the sentence.
 * - At sentence/item start -> Initial Capital ("Heel stitching", "Check")
 * - In mid-sentence -> Lowercase ("heel stitching", "notch", "quarter")
 * - Acronyms -> Always Preserved in ALL-CAPS ("ISO 27001", "PFC standard", "EVA")
 */
export function adaptTermCasing(targetTerm: string, isSentenceStart: boolean): string {
  const cleaned = cleanTargetTerm(targetTerm);
  if (!cleaned) return "";

  // Standalone acronym or model/part code check (e.g. "SB-077-P-1", "ISO 27001", "PFC")
  if (
    KNOWN_ACRONYMS.has(cleaned.toUpperCase()) ||
    (/^[A-Z0-9_\-]+$/i.test(cleaned) && /\d/.test(cleaned)) ||
    (/^[A-Z0-9]{2,}$/.test(cleaned) && !/[a-z]/.test(cleaned))
  ) {
    if (/\d/.test(cleaned)) return cleaned;
    return cleaned.toUpperCase();
  }

  const words = cleaned.split(/\s+/);
  if (isSentenceStart) {
    // Capitalize first word, keep acronyms uppercase, preserve model/code words
    const cased = words.map((w, idx) => {
      const upper = w.toUpperCase();
      if (KNOWN_ACRONYMS.has(upper)) return upper;
      if (/\d/.test(w) || /^[A-Z0-9]+-[A-Z0-9\-]+$/i.test(w)) return w;
      if (idx === 0) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w.toLowerCase();
    });
    return cased.join(" ");
  } else {
    // Mid-sentence: lowercase all words except known acronyms and model/code words
    const cased = words.map((w) => {
      const upper = w.toUpperCase();
      if (KNOWN_ACRONYMS.has(upper)) return upper;
      if (/\d/.test(w) || /^[A-Z0-9]+-[A-Z0-9\-]+$/i.test(w)) return w;
      return w.toLowerCase();
    });
    return cased.join(" ");
  }
}

/**
 * Normalizes punctuation and spacing for source or general text.
 * - Protects technical decimals & measurements (1.8m, 1.8mm, 0.5cm, 2.5kg, 99.9%, v1.0, etc.)
 * - Removes erroneous whitespace preceding punctuation: " ." -> ".", " ," -> ","
 * - Inserts space after sentence-ending punctuation when followed by any letter or numbered item: ".Do" -> ". Do", ".2." -> ". 2."
 * - Inserts space after commas, semicolons, colons when followed by letters: "thẳng,đường" -> "thẳng, đường"
 * - Inserts space after numbered list markers: "3.Kiểm" -> "3. Kiểm"
 * - Cleans duplicate horizontal spaces while preserving newlines
 */
export function normalizeSourcePunctuation(text: string): string {
  if (!text) return "";

  // 1. Lock all decimal numbers, technical units, and measurements:
  // e.g. "1.8m", "1.8mm", "0.5cm", "2.5kg", "99.9%", "v1.0", "1.8m/s", "3.14"
  // This guarantees they NEVER have spaces inserted into them or get altered by dot rules.
  const decimalLocks: string[] = [];
  let res = text.replace(/\bv?\d+\.\d+(?:[a-zA-Z%°]+(?:\/[a-zA-Z]+)?)?/g, (match) => {
    const token = `___DECIMAL_LOCK_${decimalLocks.length}___`;
    decimalLocks.push(match);
    return token;
  });

  // 2. Spacing around punctuation:
  // Remove space before punctuation (fixes "hoàn toàn .Do" -> "hoàn toàn.Do")
  res = res.replace(/[^\S\r\n]+([,.:;!?])/g, "$1");
  // Ensure space after commas, colons, semicolons followed by non-space/non-digit
  res = res.replace(/([,;:])([^\s\d\r\n])/gu, "$1 $2");
  // Ensure space between sentence-ending punctuation and subsequent numbered item: e.g. ".2." -> ". 2."
  res = res.replace(/([.!?])(\d+\.\s*)/g, "$1 $2");
  // Ensure space after sentence-ending period, exclamation, question mark when followed by any Unicode letter
  res = res.replace(/([.!?])([^\s\d\r\n])/gu, "$1 $2");

  // 3. Ensure space after numbered list item prefix: e.g. "3.Kiểm" -> "3. Kiểm"
  res = res.replace(/(^|\n|\s)(\d+)\.([^\s\d\r\n])/gu, "$1$2. $3");

  // 4. Clean up duplicate spaces while preserving newlines
  res = res.replace(/[^\S\r\n]{2,}/g, " ").trim();

  // 5. Restore all protected decimal numbers and measurements exactly as original
  for (let i = 0; i < decimalLocks.length; i++) {
    res = res.replace(`___DECIMAL_LOCK_${i}___`, decimalLocks[i]);
  }

  return res;
}

/**
 * Normalizes sewing stitch density (SPI) specifications according to Ching Luh / Nike QA SOP standard:
 * - "9-10 mũi/inch", "10-12 mũi/inch", "9-10 mũi" -> "SPI 9-10 stitches/inch", "SPI 10-12 stitches/inch"
 * - "9-10 SPI", "10-12 SPI" -> "SPI 9-10 stitches/inch", "SPI 10-12 stitches/inch"
 * - "SPI 9-10", "SPI 10-12" (without stitches/inch) -> "SPI 9-10 stitches/inch", "SPI 10-12 stitches/inch"
 * - Preserves already correct "SPI 9-10 stitches/inch", "SPI 10-12 stitches/inch" intact
 * - Removes redundant artifacts like "SPI ... SPI", corrects typo "stiches" -> "stitches"
 */
export function normalizeSpiTerminology(text: string): string {
  if (!text) return "";
  let res = text;

  // 1. Fix typo 'stiches' -> 'stitches'
  res = res.replace(/\bstiches\b/gi, "stitches");

  // 2. Double range artifact e.g. '11-12 9-10 SPI' -> 'SPI 11-12 stitches/inch'
  res = res.replace(/\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*(?:SPI|(?:stitches?)\s*(?:\/|\s*per\s*)\s*inch)\b/gi, "SPI $1 stitches/inch");

  // 3. Vietnamese stitch units:
  // '9-10 mũi/inch', '10-12 mũi/inch', '9-10 mũi' (range with mũi) -> 'SPI 9-10 stitches/inch'
  res = res.replace(/\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s*mũi(?:\s*\/\s*inch)?\b/giu, "SPI $1 stitches/inch");
  res = res.replace(/\b(\d+(?:[.,]\d+)?)\s*mũi\s*\/\s*inch\b/giu, "SPI $1 stitches/inch");

  // 4. Any combination of SPI and/or stitches/inch around a range or count:
  // Covers:
  // - "SPI 9-10 stitches/inch"
  // - "SPI: 10-12 stitches/inch"
  // - "SPI 10-12 SPI"
  // - "SPI 9-10" (e.g. "stitch spacing / SPI 9-10")
  // First, match patterns starting with SPI (with optional trailing SPI or stitches/inch)
  res = res.replace(
    /\bSPI\s*[:\-]?\s*(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:\s*(?:SPI|stitches\s*(?:\/|\s*per\s*)\s*inch))?\b/gi,
    "SPI $1 stitches/inch"
  );

  // Next, match numbers followed by SPI or stitches/inch (that weren't already prefixed by SPI)
  res = res.replace(
    /\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:SPI|stitches\s*(?:\/|\s*per\s*)\s*inch)\b/gi,
    (match, p1, offset, fullStr) => {
      // If preceded by "SPI ", already converted, do not touch
      const before = fullStr.slice(Math.max(0, offset - 10), offset);
      if (/\bSPI\s*[:\-]?\s*$/i.test(before)) {
        return match;
      }
      return `SPI ${p1} stitches/inch`;
    }
  );

  // 5. Clean up duplicate 'stitches/inch stitches/inch' or 'SPI SPI'
  res = res.replace(/\bSPI\s+SPI\b/gi, "SPI");
  res = res.replace(/\b(stitches\s*\/\s*inch)(\s+\1)+\b/gi, "$1");

  // 6. Normalize casing of isolated 'spi' -> 'SPI'
  res = res.replace(/\bspi\b/gi, "SPI");

  return res;
}

/**
 * Normalizes inverted CTQ noun phrases to standard English noun phrase order:
 * [Component] shape (e.g. "Shape tip" -> "Tip shape", "Shape toe" -> "Toe shape", "Shape collar" -> "Collar shape", "Shape heel" -> "Heel shape")
 */
export function normalizeInvertedNounPhrases(text: string): string {
  if (!text) return "";
  let res = text;
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+tip\b/gi, (_m, p1) => `${p1 || ""}Tip shape`);
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+toe\b/gi, (_m, p1) => `${p1 || ""}Toe shape`);
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+collar\b/gi, (_m, p1) => `${p1 || ""}Collar shape`);
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+heel\b/gi, (_m, p1) => `${p1 || ""}Heel shape`);
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+vamp\b/gi, (_m, p1) => `${p1 || ""}Vamp shape`);
  res = res.replace(/\b(\d+[.)]\s*)?Shape\s+tongue\b/gi, (_m, p1) => `${p1 || ""}Tongue shape`);
  return res;
}

/**
 * Complete Sentence & Uppercase Structure Normalizer.
 * Applies standard English typographical, capitalization, and punctuation rules.
 */
export function formatUppercaseStructure(text: string): string {
  if (!text) return "";

  // 1. Run full punctuation and spacing normalization first
  let res = normalizeSourcePunctuation(text);

  // 2. Normalize SPI specifications according to SOP rules
  res = normalizeSpiTerminology(res);

  // 3. Normalize inverted CTQ noun phrases (Shape tip -> Tip shape, Shape toe -> Toe shape)
  res = normalizeInvertedNounPhrases(res);

  // 4. Capitalize after sentence-ending punctuation (. ! ?)
  res = res.replace(/([.!?]\s+)([\p{Ll}])/gu, (m, p1, p2) => p1 + p2.toUpperCase());

  // 5. Capitalize start of lines, section titles (*Title:), and numbered items (1. Check, 2. Verify)
  res = res.replace(
    /(^|\n)(\s*[*•\-#]*\s*(?:\d+[.)]|[a-zA-Z][.)])?\s*)([\p{Ll}])/gu,
    (m, p1, p2, p3) => p1 + p2 + p3.toUpperCase()
  );

  // 6. Section headings like *Title: or # Title: -> Title Case
  res = res.replace(/(^|\n)(\s*[\*•]\s*)([\p{Ll}])/gu, (m, p1, p2, p3) => p1 + p2 + p3.toUpperCase());

  return res;
}


