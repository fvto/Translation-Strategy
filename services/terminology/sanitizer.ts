import { TerminologyEntry } from "../database/types";

export function hasViDiacritics(str: string): boolean {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(str);
}

export interface TermValidationResult {
  valid: boolean;
  reason?: string;
  autoCorrected?: boolean;
  suggestedTarget?: string;
}

export interface TerminologyHealthReport {
  totalTerms: number;
  healthyTerms: number;
  anomaliesFound: number;
  anomalies: {
    id?: string;
    sourceTerm: string;
    targetTerm: string;
    reason: string;
  }[];
}

/**
 * Proactive Terminology Sanitizer & Anomaly Sentinel Agent
 * 
 * Intercepts glossary insertions and updates before they reach the database,
 * preventing data corruption, cross-language leakage, and inverted grammar.
 */
export function sanitizeTerminologyEntry(entry: Partial<TerminologyEntry>): TermValidationResult {
  const source = (entry.sourceTerm || "").trim();
  const target = (entry.targetTerm || "").trim();

  if (!source || !target) {
    return { valid: false, reason: "Source and target terms must not be empty" };
  }

  // 1. Rejection: Identical source and target (no-op mapping causing untranslated leaks)
  if (source.toLowerCase() === target.toLowerCase()) {
    return {
      valid: false,
      reason: `Source and target are identical ('${source}'). A Vietnamese term cannot have itself as an English translation.`,
    };
  }

  // 2. Rejection: Target contains Vietnamese diacritics when translating VI -> EN
  const isViToEn = !entry.sourceLanguage || entry.sourceLanguage === "vi";
  if (isViToEn && hasViDiacritics(target)) {
    return {
      valid: false,
      reason: `Target term contains Vietnamese diacritical marks in a VI->EN translation: '${target}'.`,
    };
  }

  // 3. Rejection: Instruction collapsed into a section heading (caused by merged table cells in imports)
  const isTargetHeading = /^\s*[\*•#]\s*\S+/u.test(target);
  const isSourceHeading = /^\s*[\*•#]\s*\S+/u.test(source);
  const isSourceLongInstruction = source.split(/\s+/).length >= 6 || /^\s*\d+[.)]/.test(source);
  if (isTargetHeading && isSourceLongInstruction) {
    return {
      valid: false,
      reason: `Instruction sentence ('${source.slice(0, 30)}...') was collapsed into process heading '${target}'.`,
    };
  }

  // 4. Rejection: Rogue process heading mapped from non-heading source (e.g. 'thứ 6' -> '*Lacing')
  if (isTargetHeading && !isSourceHeading) {
    return {
      valid: false,
      reason: `Target has process heading prefix ('${target}') but source ('${source}') is not a heading. Process headings must never substitute arbitrary text.`,
    };
  }

  // 5. Rejection: Ordinal number or step fragment as a glossary entry (e.g. 'thứ 6', 'nấc 2')
  if (/^(?:thứ\s*\d+|nấc\s*\d*|bước\s*\d*|\d+|trang\s*\d+)$/i.test(source)) {
    return {
      valid: false,
      reason: `Source term '${source}' is an ordinal number or step fragment, which cannot be a terminology entry.`,
    };
  }

  // 4. Proactive Auto-Correction: Inverted Noun Phrases
  // e.g. "Shape tip" -> "Tip shape", "Shape collar" -> "Collar shape", "Shape heel" -> "Heel shape"
  const invertedPattern = /^(\d+\.\s*)?Shape\s+(tip|toe|collar|heel|vamp|tongue|quarter)$/i;
  const match = target.match(invertedPattern);
  if (match) {
    const prefix = match[1] || "";
    const component = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
    const suggestedTarget = `${prefix}${component} shape`;
    return {
      valid: true,
      autoCorrected: true,
      suggestedTarget,
    };
  }

  // 6. Proactive Auto-Correction: Common domain typos & standard footwear phrasing
  let cleanedTarget = target;
  if (/\baplly\b/i.test(cleanedTarget)) {
    cleanedTarget = cleanedTarget.replace(/\baplly\b/gi, "apply");
  }
  if (/\b(?:apply|aplly)\s+cement\s+foam\b/i.test(cleanedTarget)) {
    cleanedTarget = cleanedTarget.replace(/\b(?:apply|aplly)\s+cement\s+foam\b/gi, "attach cement foam");
  }
  if (/\*?Spray cement and (?:aplly|apply) (?:cement )?foam/i.test(cleanedTarget)) {
    cleanedTarget = cleanedTarget.replace(/\*?Spray cement and (?:aplly|apply) (?:cement )?foam/gi, "*Spray cement and attach cement foam");
  }
  if (cleanedTarget !== target) {
    return {
      valid: true,
      autoCorrected: true,
      suggestedTarget: cleanedTarget,
    };
  }

  return { valid: true };
}

/**
 * Runs a comprehensive health audit across all entries in the database.
 */
export function auditTerminologyHealth(entries: TerminologyEntry[]): TerminologyHealthReport {
  const anomalies: TerminologyHealthReport["anomalies"] = [];

  for (const entry of entries) {
    const result = sanitizeTerminologyEntry(entry);
    if (!result.valid) {
      anomalies.push({
        id: entry.id,
        sourceTerm: entry.sourceTerm,
        targetTerm: entry.targetTerm,
        reason: result.reason || "Invalid entry",
      });
    }
  }

  return {
    totalTerms: entries.length,
    healthyTerms: entries.length - anomalies.length,
    anomaliesFound: anomalies.length,
    anomalies,
  };
}
