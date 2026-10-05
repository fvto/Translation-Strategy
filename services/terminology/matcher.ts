import { TerminologyEntry } from "../database/types";
import { MatchedTerm } from "./types";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sortedGlossaryCache = new WeakMap<TerminologyEntry[], TerminologyEntry[]>();
const regexCache = new Map<string, RegExp>();

function getCachedRegex(rawTerm: string): RegExp {
  let regex = regexCache.get(rawTerm);
  if (!regex) {
    const escaped = escapeRegex(rawTerm);
    const hasAsciiEnd = /[a-zA-Z]$/.test(rawTerm);
    const pluralSuffix = hasAsciiEnd ? "(?:es|s)?" : "";
    const regexPattern = `(?<![\\p{L}\\p{N}])(${escaped}${pluralSuffix})(?![\\p{L}\\p{N}])`;
    regex = new RegExp(regexPattern, "giu");
    regexCache.set(rawTerm, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

function getSortedGlossary(glossary: TerminologyEntry[]): TerminologyEntry[] {
  let sorted = sortedGlossaryCache.get(glossary);
  if (!sorted) {
    sorted = [...glossary].sort((a: any, b: any) => {
      const lenDiff = b.sourceTerm.length - a.sourceTerm.length;
      if (lenDiff !== 0) return lenDiff;

      // Direct matches over reversed matches
      if (a.isDirect && !b.isDirect) return -1;
      if (!a.isDirect && b.isDirect) return 1;

      const aLower = a.sourceTerm.toLowerCase().trim();
      const bLower = b.sourceTerm.toLowerCase().trim();
      if (aLower === "hở keo" && bLower === "hở keo") {
        if (/bond\s*gap/i.test(a.targetTerm)) return -1;
        if (/bond\s*gap/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "bọt khí" && bLower === "bọt khí") {
        if (/air\s*bubble/i.test(a.targetTerm)) return -1;
        if (/air\s*bubble/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "sụp mí" && bLower === "sụp mí") {
        if (/run-off\s*stitching/i.test(a.targetTerm)) return -1;
        if (/run-off\s*stitching/i.test(b.targetTerm)) return 1;
      }
      return (b.priority ?? 1) - (a.priority ?? 1);
    });
    sortedGlossaryCache.set(glossary, sorted);
  }
  return sorted;
}

/**
 * Matches source text against a glossary of terminology entries.
 * Implements:
 * - Longest phrase first
 * - Exact and case-insensitive matching
 * - Strict word boundaries
 * - Safe plural variation (e.g. "Risk Assessments" -> "Risk Assessment")
 * - Non-overlapping span protection
 */
export function matchTerminology(
  sourceText: string,
  glossary: TerminologyEntry[]
): MatchedTerm[] {
  if (!sourceText || glossary.length === 0) return [];

  const sortedGlossary = getSortedGlossary(glossary);

  const matchedSpans: { start: number; end: number }[] = [];
  const results: MatchedTerm[] = [];

  const lowerText = sourceText.toLowerCase();

  for (const entry of sortedGlossary) {
    const rawTerm = entry.sourceTerm.trim();
    if (!rawTerm) continue;

    // Skip pure numeric terms (e.g. "9", "10", "123") — these are almost
    // certainly row IDs extracted from spreadsheets, not real terminology.
    // Also skip terms shorter than 2 characters to avoid false matches.
    if (/^\d+$/.test(rawTerm) || rawTerm.length < 2) continue;

    // Fast substring pre-filter: if text does not contain the term at all,
    // skip regex compilation completely (provides 1,000x+ speedup)
    const lowerTerm = rawTerm.toLowerCase();
    if (!lowerText.includes(lowerTerm)) continue;

    // Unicode-aware word boundaries (?<![\p{L}\p{N}]) and (?![\p{L}\p{N}]) to correctly handle
    // Vietnamese diacritics (đ, ê, ơ, ư, etc.) where standard ASCII \b fails.
    const regex = getCachedRegex(rawTerm);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceText)) !== null) {
      const startIndex = match.index;
      const matchedStr = match[1];
      const endIndex = startIndex + matchedStr.length;

      // Check for overlap with already matched longer phrases
      const overlaps = matchedSpans.some(
        (span) => Math.max(span.start, startIndex) < Math.min(span.end, endIndex)
      );

      if (!overlaps) {
        // Special domain rule: "mũi" alone (meaning toe/tip) should NOT match when it is part of stitch count, stitches, or stitch density
        // e.g. "10-12 mũi/inch", "9-10 mũi", "mũi/inch", "lại 3 mũi", "may 2 mũi", "mũi chỉ", "mũi kim", "mũi may", "số mũi", "các mũi chỉ"
        if (rawTerm.toLowerCase() === "mũi") {
          const charAfter = sourceText.slice(endIndex);
          const charBefore = sourceText.slice(0, startIndex);
          const isStitchMeasurement =
            /^\s*(?:\/\s*inch|chỉ\b|kim\b|may\b|khâu\b)/i.test(charAfter) ||
            /\d+\s*-\s*\d+\s*$/i.test(charBefore) ||
            /\d+\s*$/i.test(charBefore) ||
            /\b(?:may|lại|bỏ|rút|hụt|số|đếm|từng|mỗi|các)\s*(?:\d+\s*)?$/i.test(charBefore);
          if (isStitchMeasurement) {
            continue;
          }
        }

        matchedSpans.push({ start: startIndex, end: endIndex });
        results.push({
          entry,
          startIndex,
          endIndex,
          matchedText: matchedStr,
        });
      }
    }
  }

  // Sort results in chronological order of appearance in source text
  return results.sort((a, b) => a.startIndex - b.startIndex);
}
