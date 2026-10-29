import crypto from "crypto";
import type { TerminologyEntry } from "../database/types";
import { matchTerminology } from "./matcher";
import { approvedTargetForms } from "./usage";
import { cleanTargetTerm } from "../translation/casing";
import { enforceTerminologyCompliance } from "./enforcer";
import { validateTranslationTerminology } from "./validator";

export interface TerminologyUnit {
  id: string;
  sourceText: string;
  slideIndex?: number;
  scope?: string;
  context?: string;
}
export interface TerminologyObservation extends TerminologyUnit {
  targetText: string;
  protected?: boolean;
}
export interface TerminologyConflict {
  conceptId: string;
  sourceTerm: string;
  preferredTarget: string;
  kind: "glossary_conflict" | "missing_term" | "variant" | "unverified_output";
  kinds?: TerminologyConflict["kind"][];
  candidates: string[];
  occurrences: { unitId: string; slideIndex?: number; protected: boolean; targetText: string }[];
}
export interface DocumentTerminologyReport {
  version: string;
  passed: boolean;
  checkedUnits: number;
  checkedConcepts: number;
  unitsWithoutApprovedTerms: number;
  englishOnlyUnitsWithoutSource: number;
  repairOperations: number;
  groups: TerminologyConflict[];
}

const key = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pattern(text: string, global = false) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${text.trim().split(/\s+/).map(escape).join("\\s+")}(?:s|es)?(?![\\p{L}\\p{N}])`, global ? "giu" : "iu");
}
function contextScore(entry: TerminologyEntry, context: string) {
  const ignored = new Set(["stage", "standard", "footwear", "slide", "title", "context", "manual", "ching", "luh"]);
  const tokens = new Set(key(context).match(/[\p{L}]{3,}/gu) || []);
  return [...new Set(key(`${entry.category || ""} ${entry.context || ""}`).match(/[\p{L}]{3,}/gu) || [])]
    .filter((word) => !ignored.has(word) && tokens.has(word)).length;
}
const time = (entry: TerminologyEntry) => Date.parse(entry.updatedAt || entry.createdAt) || 0;
const direct = (entry: TerminologyEntry) => Number((entry as TerminologyEntry & { isDirect?: boolean }).isDirect === true);
const conceptId = (entry: TerminologyEntry) => `${entry.id}:${key(cleanTargetTerm(entry.targetTerm))}`;

/** A per-document, immutable approved terminology snapshot. No AI result is promoted to approved. */
export class DocumentTerminologyPlan {
  readonly version: string;
  readonly units: Map<string, TerminologyUnit>;
  private entries = new Map<string, TerminologyEntry[]>();
  private scopes = new Map<string, { glossary: TerminologyEntry[]; ambiguous: Map<string, string[]> }>();
  repairOperations = 0;

  constructor(glossary: TerminologyEntry[], units: TerminologyUnit[] = []) {
    this.units = new Map(units.map((unit) => [unit.id, { ...unit }]));
    for (const entry of glossary) {
      if (entry.status !== "approved" || !entry.sourceTerm?.trim() || !cleanTargetTerm(entry.targetTerm)) continue;
      const sourceKey = key(entry.sourceTerm);
      const candidates = this.entries.get(sourceKey) || [];
      candidates.push({ ...entry, targetTerm: cleanTargetTerm(entry.targetTerm) });
      this.entries.set(sourceKey, candidates);
    }
    this.version = crypto.createHash("sha256").update(JSON.stringify([...this.entries].sort(([a], [b]) => a.localeCompare(b)).map(([source, entries]) => [source, [...entries].sort((a, b) => a.id.localeCompare(b.id) || a.targetTerm.localeCompare(b.targetTerm))]))).digest("hex").slice(0, 16);
  }

  scopeFor(unitId?: string, sourceText?: string): string {
    const unit = unitId ? this.units.get(unitId) : [...this.units.values()].find((item) => key(item.sourceText) === key(sourceText || ""));
    return unit?.scope || "general";
  }
  contextFor(scope: string): string {
    const contexts = [...new Set([...this.units.values()].filter((unit) => (unit.scope || "general") === scope).map((unit) => unit.context || "").filter(Boolean))];
    return `CURRENT UNIT SCOPE: ${scope}. This scope takes precedence over general document context.\n${contexts.join("\n")}`;
  }
  private resolve(scope: string) {
    const cached = this.scopes.get(scope);
    if (cached) return cached;
    const context = this.contextFor(scope);
    const glossary: TerminologyEntry[] = [], ambiguous = new Map<string, string[]>();
    for (const [sourceKey, candidates] of this.entries) {
      const sorted = [...candidates].sort((a, b) => contextScore(b, context) - contextScore(a, context) || direct(b) - direct(a) || (b.priority || 0) - (a.priority || 0) || time(b) - time(a) || a.id.localeCompare(b.id));
      const winner = sorted[0];
      const ties = sorted.filter((entry) => contextScore(entry, context) === contextScore(winner, context) && direct(entry) === direct(winner) && (entry.priority || 0) === (winner.priority || 0) && time(entry) === time(winner));
      const targets = [...new Set(ties.map((entry) => entry.targetTerm))];
      if (targets.length > 1) ambiguous.set(sourceKey, targets);
      else glossary.push(winner);
    }
    const result = { glossary, ambiguous };
    this.scopes.set(scope, result);
    return result;
  }
  glossaryFor(scope = "general"): TerminologyEntry[] { return this.resolve(scope).glossary; }
  relevant(source: string, scope = "general") { return matchTerminology(source, this.glossaryFor(scope)); }

  repair(source: string, target: string, scope: string, sourceLang: string, targetLang: string) {
    const glossary = this.glossaryFor(scope);
    const matched = this.relevant(source, scope);
    let text = target;
    const isLabel = source.length <= 100 && !/(?:kiểm tra|không|cần|phải|được|khi|nếu|check\s+if)/iu.test(source);
    // Data-driven label aliases, rather than a growing list of hardcoded English synonyms.
    if (isLabel) for (const match of matched) {
      const entry = match.entry;
      const forms = approvedTargetForms(entry).map(cleanTargetTerm);
      for (const alias of this.entries.get(key(entry.sourceTerm)) || []) {
        if (key(alias.targetTerm) === key(entry.targetTerm) || alias.targetTerm.split(/\s+/).length > 5 || forms.some((form) => key(form) === key(alias.targetTerm))) continue;
        if (matched.some((other) => other.entry.id !== entry.id && approvedTargetForms(other.entry).some((form) => key(form) === key(alias.targetTerm)))) continue;
        text = text.replace(pattern(alias.targetTerm, true), () => entry.targetTerm);
      }
    }
    text = enforceTerminologyCompliance(source, text, glossary, sourceLang, targetLang).text;
    if (text !== target) this.repairOperations++;
    return { text, validation: validateTranslationTerminology(source, text, glossary) };
  }

  audit(observations: TerminologyObservation[], englishOnlyUnitsWithoutSource = 0): DocumentTerminologyReport {
    const groups = new Map<string, TerminologyConflict>(), concepts = new Set<string>();
    let checkedUnits = 0, unitsWithoutApprovedTerms = 0;
    const seen = new Set<string>();
    for (const observation of observations) {
      if (seen.has(observation.id)) continue;
      seen.add(observation.id);
      const scope = observation.scope || this.scopeFor(observation.id, observation.sourceText);
      const matched = this.relevant(observation.sourceText, scope);
      const ambiguous = [...this.resolve(scope).ambiguous].filter(([source]) => pattern(source).test(observation.sourceText));
      if (!matched.length && !ambiguous.length) { unitsWithoutApprovedTerms++; continue; }
      checkedUnits++;
      const add = (id: string, sourceTerm: string, preferredTarget: string, kind: TerminologyConflict["kind"], candidates: string[]) => {
        const groupKey = id;
        const group: TerminologyConflict = groups.get(groupKey) || { conceptId: id, sourceTerm, preferredTarget, kind, kinds: [], candidates: [], occurrences: [] };
        group.kinds = [...new Set([...(group.kinds || []), kind])];
        group.candidates = [...new Set([...group.candidates, ...candidates])];
        if (kind === "variant") group.kind = kind;
        if (!group.occurrences.some((item) => item.unitId === observation.id)) group.occurrences.push({ unitId: observation.id, slideIndex: observation.slideIndex, protected: Boolean(observation.protected), targetText: observation.targetText });
        groups.set(groupKey, group);
      };
      for (const [source, candidates] of ambiguous) add(`ambiguous:${source}:${scope}`, source, "", "glossary_conflict", candidates);
      for (const { entry } of matched) {
        const id = conceptId(entry); concepts.add(id);
        const checked = validateTranslationTerminology(entry.sourceTerm, observation.targetText, [entry]);
        if (!checked.isValid) add(id, entry.sourceTerm, entry.targetTerm, "missing_term", []);
        const forms = approvedTargetForms(entry).map(cleanTargetTerm);
        for (const alias of this.entries.get(key(entry.sourceTerm)) || []) {
          if (forms.some((form) => key(form) === key(alias.targetTerm))) continue;
          if (!pattern(alias.targetTerm).test(observation.targetText)) continue;
          if (matched.some((other) => other.entry.id !== entry.id && approvedTargetForms(other.entry).some((form) => key(form) === key(alias.targetTerm)))) continue;
          // A short alias embedded in the preferred target is not another occurrence.
          const withoutPreferred = observation.targetText.replace(pattern(entry.targetTerm, true), " ");
          if (pattern(alias.targetTerm).test(withoutPreferred)) add(id, entry.sourceTerm, entry.targetTerm, "variant", [alias.targetTerm]);
        }
      }
    }
    return { version: this.version, passed: groups.size === 0, checkedUnits, checkedConcepts: concepts.size, unitsWithoutApprovedTerms, englishOnlyUnitsWithoutSource, repairOperations: this.repairOperations, groups: [...groups.values()] };
  }
}

/** Shared by all model prompts; no fixed 35-term truncation. */
export function mandatoryTerminologyPrompt(source: string | string[], glossary: TerminologyEntry[]): string {
  const seen = new Set<string>();
  const approved = glossary.filter((entry) => entry.status === "approved");
  const lines = (Array.isArray(source) ? source : [source]).flatMap(text => matchTerminology(text, approved)).flatMap(({ entry }) => {
    const id = `${key(entry.sourceTerm)}:${key(entry.targetTerm)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [JSON.stringify({ source: entry.sourceTerm, approvedForms: approvedTargetForms(entry) })];
  });
  return lines.length ? `MANDATORY DOCUMENT TERMINOLOGY:\n${lines.join("\n")}\nUse only the approved form appropriate to the grammatical role. Preserve the complete source condition.` : "";
}
