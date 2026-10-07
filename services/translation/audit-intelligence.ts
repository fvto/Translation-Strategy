import { canonicalizeText } from "./document-tm";

/** Audit-only tolerances. Never weaken the translator's strict canonical keys. */
export const AUDIT_CONFIDENCE = Object.freeze({
  reuse: 0.94, review: 0.78, variant: 0.86, margin: 0.06, maxCandidates: 48, maxPostings: 256,
  maxFuzzyLength: 350, historySessions: 20, historyPairs: 12000,
});

export type AuditMemoryOrigin = "approved" | "correction" | "presentation" | "history";
export interface AuditMemoryPair {
  source: string;
  target: string;
  origin: AuditMemoryOrigin;
  slideIndex?: number;
  fileName?: string;
  sourceUnitId?: string;
  targetUnitId?: string;
  targetOnly?: boolean;
  slides?: number[];
  inferred?: boolean;
}
export interface AuditMatch extends AuditMemoryPair {
  confidence: number;
  exact: boolean;
}

export function auditTextForms(text: string) {
  const normalized = canonicalizeText(text.normalize("NFC")).replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  const folded = normalized.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
  return { normalized, folded, compact: folded.replace(/\s/g, ""), tokens: folded.split(" ").filter(Boolean) };
}

function editSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

const CONTRAST_WORDS = new Set(["not", "no", "without", "before", "after", "left", "right", "increase", "decrease", "khong", "truoc", "sau", "trai", "phai", "tang", "giam"]);
export function auditSimilarity(a: string, b: string): number {
  const x = auditTextForms(a), y = auditTextForms(b);
  // Numbers, negation, direction and sequence must not disappear during fuzzy reuse.
  if ((a.match(/\d+(?:[.,]\d+)*/g) || []).join("|") !== (b.match(/\d+(?:[.,]\d+)*/g) || []).join("|")) return 0;
  const contrast = (tokens: string[]) => tokens.filter((t) => CONTRAST_WORDS.has(t)).sort().join("|");
  if (contrast(x.tokens) !== contrast(y.tokens)) return 0;
  if (x.normalized === y.normalized) return 0.99;
  if (x.folded === y.folded) return 0.97;
  if (x.compact === y.compact && x.compact.length >= 8) return 0.96;
  if (Math.max(x.compact.length, y.compact.length) > AUDIT_CONFIDENCE.maxFuzzyLength) return 0;
  // Extra/missing substantive words (procedure vs report) are not spelling variants.
  if (x.tokens.length !== y.tokens.length) return 0;
  const overlap = x.tokens.filter((t) => y.tokens.includes(t)).length / Math.max(1, x.tokens.length);
  return Math.min(0.92, editSimilarity(x.compact, y.compact) * 0.8 + overlap * 0.2);
}

function grams(text: string): string[] {
  const result = new Set<string>();
  for (let i = 0; i < text.length - 2; i++) result.add(text.slice(i, i + 3));
  return [...result];
}

export const memoryPriority = (origin: AuditMemoryOrigin) => ({ approved: 4, correction: 3, presentation: 2, history: 1 })[origin];

/** Exact/compact hashes plus a bounded inverted index, built once per scan. */
export class AuditMemoryIndex {
  private entries: AuditMemoryPair[] = [];
  private keys = new Map<string, number[]>();
  private inverted = new Map<string, Set<number>>();
  private seen = new Map<string, number>();
  constructor(pairs: AuditMemoryPair[], private field: "source" | "target" = "source") {
    for (const pair of pairs) {
      if (pair.targetOnly && field === "source") continue;
      if ((!pair.source.trim() && !pair.targetOnly) || !pair.target.trim() || auditTextForms(pair.source).compact === auditTextForms(pair.target).compact) continue;
      const dedup = JSON.stringify([pair.source, pair.target, pair.origin, pair.fileName]);
      const existingId = this.seen.get(dedup);
      if (existingId !== undefined) {
        const existing = this.entries[existingId];
        if (existing.inferred && !pair.inferred) {
          existing.inferred = false;
          existing.slideIndex = pair.slideIndex;
          existing.slides = [];
        }
        if (pair.slideIndex && !existing.slides!.includes(pair.slideIndex)) existing.slides!.push(pair.slideIndex);
        continue;
      }
      const id = this.entries.push({ ...pair, slides: pair.slideIndex ? [pair.slideIndex] : [] }) - 1;
      this.seen.set(dedup, id);
      const form = auditTextForms(pair[field]);
      const bucket = this.keys.get(form.compact) || [];
      bucket.push(id);
      this.keys.set(form.compact, bucket);
      if (form.compact.length <= AUDIT_CONFIDENCE.maxFuzzyLength) {
        for (const gram of grams(form.compact)) {
          if (!this.inverted.has(gram)) this.inverted.set(gram, new Set());
          this.inverted.get(gram)!.add(id);
        }
      }
    }
  }
  lookup(text: string): AuditMatch[] {
    const form = auditTextForms(text);
    let candidates = this.keys.get(form.compact) || [];
    if (!candidates.length && form.tokens.length > 1 && form.compact.length <= AUDIT_CONFIDENCE.maxFuzzyLength) {
      const hits = new Map<number, number>();
      // Rare grams reduce work on repetitive large decks.
      const queryGrams = grams(form.compact).sort((a, b) => (this.inverted.get(a)?.size || 0) - (this.inverted.get(b)?.size || 0)).slice(0, 8);
      for (const gram of queryGrams) {
        let visited = 0;
        for (const id of this.inverted.get(gram) || []) {
          if (++visited > AUDIT_CONFIDENCE.maxPostings) break;
          hits.set(id, (hits.get(id) || 0) + 1);
        }
      }
      candidates = [...hits].sort((a, b) => b[1] - a[1]).slice(0, AUDIT_CONFIDENCE.maxCandidates).map(([id]) => id);
    }
    return candidates.map((id) => {
      const pair = this.entries[id];
      const confidence = auditSimilarity(text, pair[this.field]);
      return { ...pair, confidence, exact: form.normalized === auditTextForms(pair[this.field]).normalized };
    }).filter((match) => match.confidence >= AUDIT_CONFIDENCE.review)
      .sort((a, b) => b.confidence - a.confidence || memoryPriority(b.origin) - memoryPriority(a.origin));
  }
}

/** A known relationship is stronger than a language guess. Conflicting targets require review. */
export function chooseAuditMatch(matches: AuditMatch[]) {
  const first = matches[0];
  if (!first) return { match: undefined, conflict: false, safe: false };
  const comparable = matches.filter((m) => first.confidence - m.confidence < AUDIT_CONFIDENCE.margin);
  const preferred = [...comparable].sort((a, b) => memoryPriority(b.origin) - memoryPriority(a.origin) || b.confidence - a.confidence)[0];
  const preferredTargets = new Set(comparable.filter((m) => memoryPriority(m.origin) >= memoryPriority(preferred.origin)).map((m) => auditTextForms(m.target).normalized));
  const conflict = preferredTargets.size > 1;
  const ambiguousSingle = auditTextForms(preferred.source).tokens.length === 1 && preferred.origin !== "approved" && preferred.origin !== "correction";
  return { match: preferred, conflict, safe: !conflict && !ambiguousSingle && preferred.exact && preferred.confidence >= AUDIT_CONFIDENCE.reuse && preferred.origin !== "history" };
}

// Small language evidence vocabulary, not a universal spell checker. Unknown Latin text stays reviewable.
const EN_WORDS = new Set("emergency stop shutdown safety instructions inspection inspect quality control procedure production process material upper needle detection standard equipment machine device check operate operation report final use please open close start maintenance before after ensure test press button warning remove clean cutting stitch shape toe heel collar buffing cement apply attach spray tension prepare operator must should good reject defect critical measurement record door valve switch power off on instruction unexpected english note slide step tools sew sole panel lining assembly hot cool last lasting fit verify feed position set adjust select install replace handling temperature specification manual prevent during work wear protection".split(" "));
const VI_PHRASES = ["kiểm tra", "thiết bị", "vui lòng", "trước khi", "vận hành", "hướng dẫn", "an toàn", "khẩn cấp", "quy trình", "sản xuất", "nguyên liệu", "mũ giày", "dừng máy"];
export function languageEvidence(text: string) {
  const form = auditTextForms(text);
  const en = form.tokens.filter((token) => EN_WORDS.has(token));
  const vi = VI_PHRASES.filter((phrase) => form.compact.includes(auditTextForms(phrase).compact));
  return { en, vi, likelyEnglish: en.length >= 2 || (form.tokens.length === 1 && en.length === 1) };
}

export function vietnameseQuality(text: string): { suggestion?: string; segments: string[] } {
  let suggestion = text;
  const segments: string[] = [];
  // Normalize only complete known multiword segments; never guess individual accentless syllables.
  for (const phrase of VI_PHRASES) {
    const words = auditTextForms(phrase).tokens;
    const pattern = words.map((word) => [...word].map((letter) => {
      const variants: Record<string, string> = { a: "[aàáạảãâầấậẩẫăằắặẳẵ]", e: "[eèéẹẻẽêềếệểễ]", i: "[iìíịỉĩ]", o: "[oòóọỏõôồốộổỗơờớợởỡ]", u: "[uùúụủũưừứựửữ]", y: "[yỳýỵỷỹ]", d: "[dđ]" };
      return variants[letter] || letter;
    }).join("")).join("\\s*");
    suggestion = suggestion.replace(new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, "giu"), (found) => {
      if (found.normalize("NFC").toLowerCase().replace(/\s+/g, " ") === phrase) return found;
      segments.push(found);
      return found === found.toUpperCase() ? phrase.toUpperCase() : /^[A-ZÀ-Ỹ]/.test(found) ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
    });
  }
  return { suggestion: segments.length ? suggestion : undefined, segments };
}
