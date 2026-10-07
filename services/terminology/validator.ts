import { TerminologyEntry } from "../database/types";
import { MatchedTerm, TerminologyMismatch, ValidationReport } from "./types";
import { matchTerminology } from "./matcher";
import { cleanTargetTerm } from "../translation/casing";

function isApprovedTermPresent(expected: string, text: string): boolean {
  if (!expected || !text) return false;
  const textLower = text.toLowerCase();
  const cleanExp = cleanTargetTerm(expected);
  const cleanExpLower = cleanExp.toLowerCase();

  // 1. Direct case-insensitive substring
  if (textLower.includes(cleanExpLower) || textLower.includes(expected.toLowerCase())) {
    return true;
  }

  // 2. Slash variations: e.g. "Tip/toe"
  if (expected.includes("/")) {
    const variants = expected.split("/").map((v) => cleanTargetTerm(v).toLowerCase()).filter(Boolean);
    if (variants.some((v) => textLower.includes(v))) return true;
  }

  // 3. Hyphen vs space variation (e.g. "run-off stitching" vs "run off stitching")
  const normExpected = cleanExpLower.replace(/[-\s]+/g, " ");
  const normText = textLower.replace(/[-\s]+/g, " ");
  if (normText.includes(normExpected)) return true;

  // 4. Common morphological variations (e.g. "stitching" -> "stitch", "stitched")
  if ((cleanExpLower === "stitching" || cleanExpLower === "stitch") && /\bstitch(?:es|ed|ing)?\b/i.test(textLower)) {
    return true;
  }
  if ((cleanExpLower === "wrinkled" || cleanExpLower === "wrinkle" || cleanExpLower === "wrinkles") && /\bwrinkle(?:s|d|ing)?\b/i.test(textLower)) {
    return true;
  }
  if (
    (cleanExpLower === "free of wrinkle" || cleanExpLower === "free of wrinkles" || cleanExpLower === "wrinkle-free") &&
    /\b(?:free\s+of\s+wrinkles?|wrinkle[- ]free|not\s+wrinkled?|no\s+wrinkles?|avoid\s+wrinkles?)\b/i.test(textLower)
  ) {
    return true;
  }
  if ((cleanExpLower === "operation" || cleanExpLower === "operator") && /\boperat(?:e|es|ed|ing|ion|or)s?\b/i.test(textLower)) {
    return true;
  }
  if (cleanExpLower === "sole heating" && /\b(?:sole\s+heating|heat(?:ing)?\s+(?:the\s+)?sole)\b/i.test(textLower)) {
    return true;
  }
  if ((cleanExpLower === "finished shoe" || cleanExpLower === "finished shoes") && /\bfinished\s+shoes?\b/i.test(textLower)) {
    return true;
  }
  if (cleanExpLower === "folded" && /\bfold(?:s|ed|ing)?\b/i.test(textLower)) {
    return true;
  }

  // Plural endings (e.g. "top plate" -> "top plates")
  if (textLower.includes(cleanExpLower + "s") || textLower.includes(cleanExpLower + "es")) {
    return true;
  }

  // Mold / Plate compound variations (e.g. "top plate" in "top and bottom plates")
  if (cleanExpLower === "top plate" || cleanExpLower === "bottom plate") {
    if (/\b(?:top\s+(?:and|&|-|\/)\s*bottom|upper\s+(?:and|&|-|\/)\s*lower)\s+plates?\b/i.test(textLower)) {
      return true;
    }
    if (cleanExpLower === "top plate" && /\b(?:top|upper)\s+(?:mold\s+)?plates?\b/i.test(textLower)) {
      return true;
    }
    if (cleanExpLower === "bottom plate" && /\b(?:bottom|lower)\s+(?:mold\s+)?plates?\b/i.test(textLower)) {
      return true;
    }
  }

  // Pin holes variations (lỗ định vị)
  if (cleanExpLower === "pin holes" || cleanExpLower === "pin hole") {
    if (/\b(?:pin|position(?:ing)?|locating|marking|guide|gauge)\s+holes?\b/i.test(textLower)) {
      return true;
    }
  }

  // Fit variations (khớp)
  if (cleanExpLower === "fit") {
    if (/\b(?:fit|fits|fitted|fitting|align|aligns|aligned|aligning|match|matches|matched|matching)\b/i.test(textLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates whether approved terminology detected in source text is correctly present in the translation.
 * Flags mismatches and calculates a rule-based compliance score.
 */
export function validateTranslationTerminology(
  sourceText: string,
  translatedText: string,
  approvedGlossary: TerminologyEntry[]
): ValidationReport {
  // 1. Find all approved terms occurring in source
  const sourceMatches = matchTerminology(sourceText, approvedGlossary);

  if (sourceMatches.length === 0) {
    return {
      isValid: true,
      complianceScore: 100,
      totalApprovedTerms: 0,
      matchedTerms: [],
      mismatches: [],
    };
  }

  // Deduplicate matched terms by entry ID
  const uniqueTermsMap = new Map<string, MatchedTerm>();
  for (const match of sourceMatches) {
    if (!uniqueTermsMap.has(match.entry.id)) {
      uniqueTermsMap.set(match.entry.id, match);
    }
  }

  const uniqueMatches = Array.from(uniqueTermsMap.values());
  const mismatches: TerminologyMismatch[] = [];
  let foundCount = 0;

  for (const match of uniqueMatches) {
    const expected = match.entry.targetTerm.trim();

    // Check if target term is in the translated text
    const isPresent = isApprovedTermPresent(expected, translatedText);

    if (isPresent) {
      foundCount++;
    } else {
      mismatches.push({
        sourceTerm: match.entry.sourceTerm,
        expectedTarget: expected,
        foundInTranslation: false,
        message: `Expected approved term "${expected}" for "${match.entry.sourceTerm}", but it was not found in the translated text.`,
      });
    }
  }

  const complianceScore = Math.round((foundCount / uniqueMatches.length) * 100);

  return {
    isValid: mismatches.length === 0,
    complianceScore,
    totalApprovedTerms: uniqueMatches.length,
    matchedTerms: sourceMatches,
    mismatches,
  };
}
