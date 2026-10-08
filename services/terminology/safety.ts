import type { TerminologyEntry } from "../database/types";
import { isInspectionStatusLabel } from "../translation/smart-detector";

/**
 * Reject imported glossary rows that replace a complete instruction with a short
 * process heading. These rows are harmful even when marked "approved": exact
 * matching bypasses the translation provider and creates repeated headings such
 * as "*Upper priming/cementing" for every numbered step.
 */
export function isSafeTerminologyEntry(entry: TerminologyEntry): boolean {
  const source = entry.sourceTerm?.trim() || "";
  const target = entry.targetTerm?.trim() || "";
  if (!source || !target) return false;

  // Disallow quarantined or explicitly rejected entries
  if (entry.status === "quarantined" || entry.status === "rejected") return false;

  // Reject inspection evaluation labels (GOOD, NO GOOD, OK, NG, PASS, FAIL...) from terminology
  if (isInspectionStatusLabel(source) || isInspectionStatusLabel(target)) return false;

  // Single-character terms (e.g. 'C', 'H') are noise/abbreviations, not terminology
  if (source.length < 2 || target.length < 2) return false;

  // Target cannot be identical to source (no-op or untranslated row)
  if (source.toLowerCase() === target.toLowerCase()) return false;

  // Reject standalone English prepositions / function words / stopwords.
  // Isolated prepositions like "at", "in", "on" cannot be approved glossary terms (e.g. "vị trí" -> "at")
  const ENGLISH_STOPWORDS = new Set([
    "at", "in", "on", "of", "to", "for", "by", "with", "from", "as",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that"
  ]);
  if (ENGLISH_STOPWORDS.has(source.toLowerCase()) || ENGLISH_STOPWORDS.has(target.toLowerCase())) {
    return false;
  }

  // Reject malformed fragments with leading/trailing slashes or ellipsis (e.g. '/may', '...off position')
  if (/^[/\\]|[/\\]$/.test(source) || /^[/\\]|[/\\]$/.test(target)) return false;
  if (/^\.{2,}/.test(source) || /^\.{2,}/.test(target)) return false;

  // When translating VI -> EN, target cannot be pure Vietnamese
  const viChars = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  if (entry.sourceLanguage === "vi" && entry.targetLanguage === "en" && viChars.test(target) && !/[a-zA-Z]{3,}/.test(target.replace(viChars, ""))) {
    return false;
  }

  const sourceWords = source.split(/\s+/).filter(Boolean);
  const targetWords = target.split(/\s+/).filter(Boolean);
  const sourceStep = source.match(/^\s*(\d+)[.)]/)?.[1];
  const targetStep = target.match(/^\s*(\d+)[.)]/)?.[1];
  const targetIsShortHeading = /^\s*[\*•#]\s*\S+(?:\s+\S+){0,3}\s*$/u.test(target);
  const sourceIsShortHeading = /^\s*[\*•#]\s*\S+(?:\s+\S+){0,4}\s*[:：]?\s*$/u.test(source);

  // Reject common typos like aplly
  if (/\baplly\b/i.test(source) || /\baplly\b/i.test(target)) return false;

  // Reject ordinal numbers or step fragments (e.g. "thứ 6", "nấc 2", "bước 3")
  if (/^(?:thứ\s*\d+|nấc\s*\d*|bước\s*\d*|\d+|trang\s*\d+)$/i.test(source)) return false;

  // A numbered instruction must retain its number. A heading cannot substitute it.
  if (sourceStep && sourceStep !== targetStep) return false;

  // Target process heading with '*' or '#' or '•' must have a matching heading prefix in source.
  // Never allow arbitrary text or fragments to map to a process heading (e.g. 'thứ 6' -> '*Lacing').
  if (targetIsShortHeading && !sourceIsShortHeading) {
    return false;
  }

  // Preserve process headings, but never let one replace a substantive step,
  // instruction, or long remark.
  if (
    targetIsShortHeading &&
    (sourceWords.length > 4 || (!sourceIsShortHeading && source.length > 28))
  ) {
    return false;
  }

  // Catch imported mappings that discard most of a long instruction even if the
  // target did not begin with an asterisk.
  if (sourceWords.length >= 10 && target.length < source.length * 0.45) return false;

  // Reject collapse of an entire phrase/sentence (>= 6 words) into a single short word (1 word, <= 6 chars)
  // e.g. "còn logo nếu logo chữ thì sử dụng" -> "logo"
  if (sourceWords.length >= 6 && targetWords.length === 1 && target.length <= 6) return false;

  return true;
}

