import { TerminologyEntry } from "../database/types";
import { normalizeSpiTerminology, cleanTargetTerm, adaptTermCasing } from "./casing";
import { polishSopText } from "./sop-polisher";
import { repairMistranslatedAcronyms } from "../terminology/acronym-resolver";
import { enforceTerminologyCompliance } from "../terminology/enforcer";

export type TMStatus = "LOCKED" | "APPROVED" | "ESTABLISHED" | "SUGGESTED" | "CONFLICT";
export type TMOrigin = "GLOSSARY" | "DOCUMENT" | "RELATED_DOCUMENT" | "GEMINI" | "GOOGLE_NMT";

export interface TMSourceLocation {
  slide?: number;
  sheet?: string;
  cell?: string;
  shape?: string | number;
  paragraph?: number;
}

export interface DocumentTMEntry {
  sourceCanonical: string;
  sourceOriginal: string;
  target: string;
  status: TMStatus;
  sourceLocation: TMSourceLocation;
  occurrences: TMSourceLocation[];
  origin: TMOrigin;
  confidence: number;
  createdAt: number;
  firstSlide?: number;
}

export interface DocumentTMConflict {
  sourceCanonical: string;
  sourceOriginal: string;
  winningTarget: string;
  winningOrigin: TMOrigin;
  winningLocation: TMSourceLocation;
  conflictingTarget: string;
  conflictingOrigin: TMOrigin;
  conflictingLocation: TMSourceLocation;
  resolvedBy: "LOCKED_GLOSSARY" | "APPROVED_TM" | "EARLIEST_ESTABLISHED";
}

export interface TranslationUnitWithMeta {
  id: string;
  sourceText: string;
  slideIndex?: number;
  shapeIndex?: number;
  paragraphIndex?: number;
  sheetName?: string;
  cellAddress?: string;
  rowNumber?: number;
  colNumber?: number;
  isTitle?: boolean;
  isInspectionItem?: boolean;
  notes?: boolean;
}

export interface TranslationPlan {
  preResolved: Map<string, string>;
  itemsRequiringTranslation: TranslationUnitWithMeta[];
  stats: {
    totalUnits: number;
    exactMatchesReused: number;
    uniqueRequiringTranslation: number;
    lockedGlossaryHits: number;
    approvedTMHits: number;
    establishedDocHits: number;
  };
}

/**
 * Normalizes text for safe canonical matching:
 * - Trims leading and trailing whitespace
 * - Collapses repeated whitespace into a single space
 * - Lowercases for case-insensitive matching
 * - Strips leading bullet symbols / numbering (*, •, -, #, 1., etc.)
 *
 * Distinctive suffixes and words are STRICTLY preserved:
 * "Final Inspection" !== "Final Inspection Report" !== "Final Inspection Procedure"
 */
export function canonicalizeText(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .replace(/^\s*(?:[\*•\#]|[-–—]\s+|\d{1,3}[.)]\s*)/, "") // strip standard bullet or numbering prefix
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Strict exact canonical key without bullet stripping (for exact sentence/paragraph matching)
 */
export function exactCanonicalKey(text: string): string {
  if (!text) return "";
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Conservative check: whether a source string qualifies as technical/manufacturing terminology
 * rather than a generic single English word (e.g. "material", "test", "shoe").
 */
export function isTechnicalTermCandidate(text: string): boolean {
  const clean = text.trim();
  if (clean.length < 3) return false;
  if (/^\d+$/.test(clean)) return false; // purely numeric

  const words = clean.split(/\s+/);
  // Multi-word phrases are strong technical candidates
  if (words.length >= 2 && words.length <= 8) return true;

  // Single words must match known technical footwear/manufacturing patterns
  const technicalSingleWords = new RegExp(
    "^(" +
      "vamp|eyestay|midsole|outsole|tongue|mudguard|lasting|buffing|cementing|" +
      "primer|deboss|emboss|insole|sockliner|foxing|collar|backstay|shank|" +
      "counter|toe|heel|welt|skiving|stitching|isq|ipqc|ctq|qam|spi|eva|tpu|" +
      "pu|polyurethane|solvent|waterbased|bordeaux|gauge|caliper|hardness" +
    ")$",
    "i"
  );
  return technicalSingleWords.test(clean);
}

/**
 * Document-Wide Translation Memory (TM) & Terminology Consistency Manager
 *
 * Architecture:
 * - Operates across the ENTIRE document (all slides/sheets) before final translation decisions.
 * - Enforces strict priority:
 *   1. LOCKED company glossary
 *   2. APPROVED translation memory
 *   3. ESTABLISHED translation found earlier in current document (earliest wins)
 *   4. RELATED document memory
 *   5. GEMINI contextual translation
 *   6. GOOGLE NMT emergency fallback
 * - Conflict detection & audit logging.
 * - Exact string reuse (prevents calling Gemini for repeated phrases/sentences).
 * - Partial technical phrase preservation within surrounding sentences.
 */
export class DocumentTranslationMemory {
  // Global canonical map: canonicalKey -> DocumentTMEntry
  private tmEntries = new Map<string, DocumentTMEntry>();

  // Exact full sentence/paragraph map: exactKey -> DocumentTMEntry
  private exactSentenceMap = new Map<string, DocumentTMEntry>();

  // Sub-phrase technical terminology entries (multi-word terms for partial match enforcement)
  private technicalTermsList: DocumentTMEntry[] = [];

  // Recorded terminology conflicts
  private conflicts: DocumentTMConflict[] = [];

  // Timestamp sequence counter for earliest-wins ordering
  private sequenceCounter = 0;

  constructor() {}

  /**
   * Clears in-memory entries (for tests and clean runs)
   */
  clear(): void {
    this.tmEntries.clear();
    this.exactSentenceMap.clear();
    this.technicalTermsList = [];
    this.conflicts = [];
    this.sequenceCounter = 0;
  }

  /**
   * Phase 1 & 2: Pre-scans the full document and initializes TM with:
   * - LOCKED entries from company glossary
   * - APPROVED entries from historical TM
   * - All extracted units from the current presentation/workbook
   */
  initializeDocumentTM(
    units: TranslationUnitWithMeta[],
    approvedGlossary: TerminologyEntry[] = [],
    historicalApprovedTM: Array<{ source: string; target: string; origin?: TMOrigin }> = []
  ): void {
    this.clear();

    // 1. Seed LOCKED entries from company glossary (Priority 1)
    for (const entry of approvedGlossary) {
      if (!entry.sourceTerm || !entry.targetTerm) continue;
      const cleanSrc = entry.sourceTerm.trim();
      const cleanTgt = cleanTargetTerm(entry.targetTerm).trim();
      if (!cleanSrc || !cleanTgt) continue;

      this.registerEntry({
        sourceCanonical: canonicalizeText(cleanSrc),
        sourceOriginal: cleanSrc,
        target: cleanTgt,
        status: "LOCKED",
        sourceLocation: {},
        occurrences: [],
        origin: "GLOSSARY",
        confidence: 1.0,
        createdAt: ++this.sequenceCounter,
      });

      // Also register exact key
      this.registerExactSentence(cleanSrc, cleanTgt, "LOCKED", "GLOSSARY", {});
    }

    // 2. Seed APPROVED entries from historical TM (Priority 2)
    for (const h of historicalApprovedTM) {
      if (!h.source || !h.target) continue;
      const cleanSrc = h.source.trim();
      const cleanTgt = h.target.trim();
      if (!cleanSrc || !cleanTgt) continue;

      const canon = canonicalizeText(cleanSrc);
      if (!this.tmEntries.has(canon) || this.tmEntries.get(canon)!.status !== "LOCKED") {
        this.registerEntry({
          sourceCanonical: canon,
          sourceOriginal: cleanSrc,
          target: cleanTgt,
          status: "APPROVED",
          sourceLocation: {},
          occurrences: [],
          origin: h.origin || "RELATED_DOCUMENT",
          confidence: 0.95,
          createdAt: ++this.sequenceCounter,
        });
      }
      this.registerExactSentence(cleanSrc, cleanTgt, "APPROVED", h.origin || "RELATED_DOCUMENT", {});
    }

    // 3. Pre-scan document units to record occurrences and metadata
    for (const u of units) {
      const text = u.sourceText?.trim();
      if (!text) continue;

      const loc: TMSourceLocation = {
        slide: u.slideIndex,
        shape: u.shapeIndex,
        paragraph: u.paragraphIndex,
        sheet: u.sheetName,
        cell: u.cellAddress,
      };

      const canon = canonicalizeText(text);
      const exactKey = exactCanonicalKey(text);

      const existing = this.tmEntries.get(canon);
      if (existing) {
        existing.occurrences.push(loc);
      }

      const existingExact = this.exactSentenceMap.get(exactKey);
      if (existingExact) {
        existingExact.occurrences.push(loc);
      }
    }
  }

  private registerEntry(entry: DocumentTMEntry): void {
    this.tmEntries.set(entry.sourceCanonical, entry);
    if (isTechnicalTermCandidate(entry.sourceOriginal)) {
      // Keep sorted by source length descending for longest phrase matching
      this.technicalTermsList = this.technicalTermsList.filter(
        (t) => t.sourceCanonical !== entry.sourceCanonical
      );
      this.technicalTermsList.push(entry);
      this.technicalTermsList.sort(
        (a, b) => b.sourceOriginal.length - a.sourceOriginal.length
      );
    }
  }

  private registerExactSentence(
    sourceText: string,
    targetText: string,
    status: TMStatus,
    origin: TMOrigin,
    location: TMSourceLocation,
    slideIndex?: number
  ): DocumentTMEntry {
    const key = exactCanonicalKey(sourceText);
    const existing = this.exactSentenceMap.get(key);
    if (existing) {
      // Check priority
      if (this.isHigherPriority(status, existing.status)) {
        existing.target = targetText;
        existing.status = status;
        existing.origin = origin;
      }
      if (location && Object.keys(location).length > 0) {
        existing.occurrences.push(location);
      }
      return existing;
    }

    const hasLoc = location && Object.keys(location).length > 0;
    const newEntry: DocumentTMEntry = {
      sourceCanonical: key,
      sourceOriginal: sourceText.trim(),
      target: targetText.trim(),
      status,
      sourceLocation: location,
      occurrences: hasLoc ? [location] : [],
      origin,
      confidence: status === "LOCKED" ? 1.0 : status === "APPROVED" ? 0.95 : 0.9,
      createdAt: ++this.sequenceCounter,
      firstSlide: slideIndex ?? location.slide,
    };
    this.exactSentenceMap.set(key, newEntry);
    return newEntry;
  }

  /**
   * Priority comparison:
   * LOCKED (1) > APPROVED (2) > ESTABLISHED (3) > SUGGESTED (4)
   */
  private isHigherPriority(newStatus: TMStatus, existingStatus: TMStatus): boolean {
    const rank: Record<TMStatus, number> = {
      LOCKED: 5,
      APPROVED: 4,
      ESTABLISHED: 3,
      SUGGESTED: 2,
      CONFLICT: 1,
    };
    return rank[newStatus] > rank[existingStatus];
  }

  /**
   * Phase 3: Translation Planning
   * Pre-resolves all exact matches already present in LOCKED, APPROVED, or ESTABLISHED TM.
   * Returns:
   * - `preResolved`: Map<unitId, translatedText> that NEVER needs to be sent to Gemini.
   * - `itemsRequiringTranslation`: deduplicated unique items requiring contextual translation.
   */
  planTranslations(units: TranslationUnitWithMeta[]): TranslationPlan {
    const preResolved = new Map<string, string>();
    const seenPendingSources = new Map<string, TranslationUnitWithMeta>();
    let exactMatchesReused = 0;
    let lockedGlossaryHits = 0;
    let approvedTMHits = 0;
    let establishedDocHits = 0;

    for (const unit of units) {
      const raw = unit.sourceText?.trim();
      if (!raw) continue;

      const exactKey = exactCanonicalKey(raw);
      const canonKey = canonicalizeText(raw);

      // Check exact sentence match first
      const exactMatch = this.exactSentenceMap.get(exactKey);
      if (exactMatch && (exactMatch.status === "LOCKED" || exactMatch.status === "APPROVED" || exactMatch.status === "ESTABLISHED")) {
        preResolved.set(unit.id, exactMatch.target);
        exactMatchesReused++;
        if (exactMatch.status === "LOCKED") lockedGlossaryHits++;
        else if (exactMatch.status === "APPROVED") approvedTMHits++;
        else establishedDocHits++;
        continue;
      }

      // Check canonical term match (with bullet stripped)
      const canonMatch = this.tmEntries.get(canonKey);
      if (canonMatch && (canonMatch.status === "LOCKED" || canonMatch.status === "APPROVED" || canonMatch.status === "ESTABLISHED")) {
        // Re-attach bullet/number prefix if source had it
        const prefixMatch = raw.match(/^\s*(?:[\*•\#]|[-–—]\s+|\d{1,3}[.)]\s*)/);
        const prefix = prefixMatch ? prefixMatch[0] : "";
        const targetWithPrefix = prefix ? `${prefix}${canonMatch.target}` : canonMatch.target;
        preResolved.set(unit.id, targetWithPrefix);
        exactMatchesReused++;
        if (canonMatch.status === "LOCKED") lockedGlossaryHits++;
        else if (canonMatch.status === "APPROVED") approvedTMHits++;
        else establishedDocHits++;
        continue;
      }

      // If not yet pre-resolved, check if already seen in current translation planning list
      if (!seenPendingSources.has(exactKey)) {
        seenPendingSources.set(exactKey, unit);
      }
    }

    const itemsRequiringTranslation = Array.from(seenPendingSources.values());

    return {
      preResolved,
      itemsRequiringTranslation,
      stats: {
        totalUnits: units.length,
        exactMatchesReused,
        uniqueRequiringTranslation: itemsRequiringTranslation.length,
        lockedGlossaryHits,
        approvedTMHits,
        establishedDocHits,
      },
    };
  }

  /**
   * Dynamically records a successful translation decision from Gemini, NMT, or manual review.
   *
   * Conflict Detection & Earliest-Wins Policy:
   * - If an entry already exists with DIFFERENT target:
   *   - If existing is LOCKED or APPROVED: locked target wins.
   *   - If existing is ESTABLISHED: EARLIEST ESTABLISHED TRANSLATION WINS unless overridden by LOCKED/APPROVED.
   *   - Records conflict details in `conflicts` array.
   */
  recordTranslation(
    sourceText: string,
    translatedText: string,
    location: TMSourceLocation = {},
    origin: TMOrigin = "GEMINI",
    confidence: number = 0.9,
    statusOverride?: TMStatus
  ): DocumentTMEntry {
    const rawSrc = sourceText.trim();
    const rawTgt = translatedText.trim();
    if (!rawSrc || !rawTgt) {
      throw new Error("Cannot record empty translation in DocumentTM");
    }

    const exactKey = exactCanonicalKey(rawSrc);
    const canonKey = canonicalizeText(rawSrc);
    if (exactKey === exactCanonicalKey(rawTgt)) {
      return {
        sourceOriginal: rawSrc,
        sourceCanonical: canonKey,
        target: rawTgt,
        origin,
        status: "ESTABLISHED",
        confidence,
        sourceLocation: location,
        occurrences: [location],
        createdAt: ++this.sequenceCounter,
        firstSlide: location.slide,
      };
    }
    const status: TMStatus = statusOverride || (origin === "GLOSSARY" ? "LOCKED" : origin === "RELATED_DOCUMENT" ? "APPROVED" : "ESTABLISHED");

    // 1. Check exact sentence map
    const existingExact = this.exactSentenceMap.get(exactKey);
    let winningTarget = rawTgt;
    let winningStatus = status;
    let winningOrigin = origin;

    if (existingExact) {
      const existingTgtNorm = exactCanonicalKey(existingExact.target);
      const newTgtNorm = exactCanonicalKey(rawTgt);

      if (existingTgtNorm !== newTgtNorm) {
        // CONFLICT DETECTED!
        if (existingExact.status === "LOCKED") {
          // Locked wins unconditionally
          winningTarget = existingExact.target;
          winningStatus = "LOCKED";
          winningOrigin = existingExact.origin;
          this.conflicts.push({
            sourceCanonical: exactKey,
            sourceOriginal: rawSrc,
            winningTarget: existingExact.target,
            winningOrigin: existingExact.origin,
            winningLocation: existingExact.sourceLocation,
            conflictingTarget: rawTgt,
            conflictingOrigin: origin,
            conflictingLocation: location,
            resolvedBy: "LOCKED_GLOSSARY",
          });
        } else if (existingExact.status === "APPROVED" && status !== "LOCKED") {
          // Approved wins over established/gemini
          winningTarget = existingExact.target;
          winningStatus = "APPROVED";
          winningOrigin = existingExact.origin;
          this.conflicts.push({
            sourceCanonical: exactKey,
            sourceOriginal: rawSrc,
            winningTarget: existingExact.target,
            winningOrigin: existingExact.origin,
            winningLocation: existingExact.sourceLocation,
            conflictingTarget: rawTgt,
            conflictingOrigin: origin,
            conflictingLocation: location,
            resolvedBy: "APPROVED_TM",
          });
        } else if (status === "LOCKED") {
          // New status is locked -> overrides existing
          winningTarget = rawTgt;
          winningStatus = "LOCKED";
          winningOrigin = origin;
          this.conflicts.push({
            sourceCanonical: exactKey,
            sourceOriginal: rawSrc,
            winningTarget: rawTgt,
            winningOrigin: origin,
            winningLocation: location,
            conflictingTarget: existingExact.target,
            conflictingOrigin: existingExact.origin,
            conflictingLocation: existingExact.sourceLocation,
            resolvedBy: "LOCKED_GLOSSARY",
          });
        } else {
          // EARLIEST ESTABLISHED TRANSLATION WINS
          winningTarget = existingExact.target;
          winningStatus = "ESTABLISHED";
          winningOrigin = existingExact.origin;
          this.conflicts.push({
            sourceCanonical: exactKey,
            sourceOriginal: rawSrc,
            winningTarget: existingExact.target,
            winningOrigin: existingExact.origin,
            winningLocation: existingExact.sourceLocation,
            conflictingTarget: rawTgt,
            conflictingOrigin: origin,
            conflictingLocation: location,
            resolvedBy: "EARLIEST_ESTABLISHED",
          });
        }
      }
      existingExact.occurrences.push(location);
    } else {
      this.registerExactSentence(rawSrc, winningTarget, winningStatus, winningOrigin, location);
    }

    // 2. Also register in canonical TM map
    const existingCanon = this.tmEntries.get(canonKey);
    if (!existingCanon || this.isHigherPriority(winningStatus, existingCanon.status)) {
      this.registerEntry({
        sourceCanonical: canonKey,
        sourceOriginal: rawSrc,
        target: winningTarget,
        status: winningStatus,
        sourceLocation: location,
        occurrences: [location],
        origin: winningOrigin,
        confidence,
        createdAt: ++this.sequenceCounter,
        firstSlide: location.slide,
      });
    } else {
      existingCanon.occurrences.push(location);
    }

    return this.exactSentenceMap.get(exactKey)!;
  }

  /**
   * Looks up an exact or canonical translation in TM.
   */
  lookup(sourceText: string): DocumentTMEntry | undefined {
    if (!sourceText) return undefined;
    const exact = this.exactSentenceMap.get(exactCanonicalKey(sourceText));
    if (exact) return exact;
    return this.tmEntries.get(canonicalizeText(sourceText));
  }

  /**
   * Retrieves all established/locked terminology constraints formatted for LLM system prompt.
   * Injects established terms so Gemini preserves them.
   */
  getPromptConstraints(sampleItems: Array<{ sourceText: string }>): TerminologyEntry[] {
    const combinedLower = sampleItems
      .map((it) => it.sourceText || "")
      .join(" ")
      .toLowerCase();

    const matchedEntries: TerminologyEntry[] = [];
    const seen = new Set<string>();

    for (const entry of this.technicalTermsList) {
      if (seen.has(entry.sourceCanonical)) continue;
      const srcLower = entry.sourceOriginal.toLowerCase();
      if (combinedLower.includes(srcLower)) {
        seen.add(entry.sourceCanonical);
        matchedEntries.push({
          id: `tm_${entry.sourceCanonical}`,
          sourceTerm: entry.sourceOriginal,
          targetTerm: entry.target,
          sourceLanguage: "vi",
          targetLanguage: "en",
          status: entry.status === "LOCKED" || entry.status === "APPROVED" ? "approved" : "review",
          priority: entry.status === "LOCKED" ? 10 : entry.status === "APPROVED" ? 9 : 8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return matchedEntries;
  }

  /**
   * Partial Phrase / Term Enforcement:
   * When an established technical term (e.g. "Upper Material" -> "Kiểm tra nguyên liệu mũ giày"
   * or "Needle Detection" -> "Kiểm tra kim") appears inside a larger sentence,
   * ensures the established target is preserved verbatim in the translated text.
   */
  enforceDocumentTM(
    sourceText: string,
    translatedText: string,
    sourceLanguage = "vi",
    targetLanguage = "en"
  ): { text: string; replacements: Array<{ term: string; replacedWith: string }> } {
    if (!sourceText || !translatedText) {
      return { text: translatedText, replacements: [] };
    }

    const replacements: Array<{ term: string; replacedWith: string }> = [];

    // 1. Exact or canonical whole sentence / heading match
    const canonKey = canonicalizeText(sourceText);
    const exact = this.exactSentenceMap.get(exactCanonicalKey(sourceText)) || this.tmEntries.get(canonKey);
    if (exact && (exact.status === "LOCKED" || exact.status === "APPROVED" || exact.status === "ESTABLISHED")) {
      const prefixMatch = sourceText.trim().match(/^\s*(?:[\*•\#]|[-–—]\s+|\d{1,3}[.)]\s*)/);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const targetWithPrefix = prefix && !exact.target.startsWith(prefix.trim())
        ? prefix + exact.target
        : exact.target;

      if (exactCanonicalKey(translatedText) !== exactCanonicalKey(targetWithPrefix)) {
        replacements.push({ term: sourceText, replacedWith: targetWithPrefix });
      }
      return { text: targetWithPrefix, replacements };
    }

    // 2. Partial Phrase / Term Matching:
    // If established technical terms are present in the source sentence,
    // ensure their established translations are enforced into translatedText.
    const relevantConstraints = this.getPromptConstraints([{ sourceText }]);
    if (relevantConstraints.length > 0) {
      const enforced = enforceTerminologyCompliance(
        sourceText,
        translatedText,
        relevantConstraints,
        sourceLanguage,
        targetLanguage
      );
      return {
        text: enforced.text,
        replacements: enforced.replacements.map((r) => ({
          term: r.sourceTerm,
          replacedWith: r.replacementText,
        })),
      };
    }

    return { text: translatedText, replacements: [] };
  }

  /**
   * Returns all recorded conflicts for QA auditing and reporting
   */
  getConflicts(): DocumentTMConflict[] {
    return [...this.conflicts];
  }

  /**
   * Returns all entries currently stored in DocumentTM
   */
  getAllEntries(): DocumentTMEntry[] {
    return Array.from(this.exactSentenceMap.values());
  }

  /**
   * Generates a concise diagnostic summary
   */
  getSummary(): {
    totalEntries: number;
    lockedCount: number;
    approvedCount: number;
    establishedCount: number;
    conflictCount: number;
  } {
    let lockedCount = 0;
    let approvedCount = 0;
    let establishedCount = 0;

    for (const e of this.exactSentenceMap.values()) {
      if (e.status === "LOCKED") lockedCount++;
      else if (e.status === "APPROVED") approvedCount++;
      else if (e.status === "ESTABLISHED") establishedCount++;
    }

    return {
      totalEntries: this.exactSentenceMap.size,
      lockedCount,
      approvedCount,
      establishedCount,
      conflictCount: this.conflicts.length,
    };
  }
}

// Global shared singleton for cross-batch persistence during document lifecycle
export const documentTM = new DocumentTranslationMemory();
