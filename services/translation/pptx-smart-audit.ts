import JSZip from "jszip";
import { db } from "../database/db";
import type { TerminologyEntry } from "../database/types";
import { DocumentTranslationMemory, canonicalizeText } from "./document-tm";
import { cleanTargetTerm } from "./casing";
import { isSafeTerminologyEntry } from "../terminology/safety";
import { checkGlossaryTranslation } from "../terminology/audit-compliance";
import { getAuditHistoryPairs } from "./translation-memory";
import { AUDIT_CONFIDENCE, AuditMemoryIndex, auditTextForms, chooseAuditMatch, languageEvidence, memoryPriority, vietnameseQuality } from "./audit-intelligence";
import type { AuditMemoryPair } from "./audit-intelligence";
import { PPTX_PARAGRAPH_PATTERN, paragraphText, canReplaceParagraphText, replaceParagraphText, canTranslateParagraphText } from "../documents/pptx-text";
import { orderedSlidePaths, readIsqSlidePairs } from "../documents/pptx-slide-order";
import { dynamicDeckDetector } from "../documents/pptx-structure";
import { classifyTextUnit, computeSourceHash, hasViDiacritics, isInspectionStatusLabel, isNonTranslatable, isPureEnglish, isShoeModelName, isEnglishImmunityProtected } from "./smart-detector";
import type { ScannedTextUnit, SmartAuditReport, TextUnitLocation, TranslationAuditGroup } from "./smart-detector";

interface RawUnit { id: string; text: string; xml: string; location: TextUnitLocation; containerId: string; readOnly?: boolean }
interface ScanOptions {
  sourceLang?: string;
  targetLang?: string;
  mode?: string;
  customDocTM?: DocumentTranslationMemory;
  approvedGlossary?: TerminologyEntry[];
  historyPairs?: AuditMemoryPair[];
  expectedSuggestions?: { id: string; sourceText: string; suggestedTranslation: string }[];
  customTranslations?: Record<string, string>;
}

function sourceEvidence(text: string, sourceLang: string): boolean {
  if (isNonTranslatable(text)) return false;
  const language = languageEvidence(text);
  return sourceLang === "vi"
    ? hasViDiacritics(text) || language.vi.length > 0
    : !hasViDiacritics(text) && !language.vi.length && (language.likelyEnglish || isPureEnglish(text));
}

function targetEvidence(text: string, targetLang: string): boolean {
  return sourceEvidence(text, targetLang);
}

async function extractUnits(zip: JSZip): Promise<{ units: RawUnit[]; slides: number }> {
  const paths = await orderedSlidePaths(zip);
  const units: RawUnit[] = [];
  for (let s = 0; s < paths.length; s++) {
    const partPath = paths[s], slideIndex = s + 1;
    const xml = await zip.file(partPath)!.async("string");
    const containers = Array.from(xml.matchAll(/<(?:p|a):txBody(?:\s[^>]*)?>[\s\S]*?<\/(?:p|a):txBody>/g));
    const titleRanges = Array.from(xml.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g)).filter((m) => /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(m[0]));
    let paragraphIndex = 0;
    let containerPointer = 0;
    for (const match of xml.matchAll(new RegExp(PPTX_PARAGRAPH_PATTERN))) {
      const index = paragraphIndex++;
      const text = paragraphText(match[0]).trim();
      if (!text) continue;
      const offset = match.index!;
      while (containerPointer < containers.length && offset >= containers[containerPointer].index! + containers[containerPointer][0].length) containerPointer++;
      const current = containers[containerPointer];
      const containerIndex = current && offset >= current.index! && offset < current.index! + current[0].length ? containerPointer : -1;
      const containerId = `s${slideIndex}_c${containerIndex < 0 ? `p${index}` : containerIndex}`;
      units.push({ id: `s${slideIndex}_p${index}`, text, xml: match[0], containerId,
        location: { partPath, containerId, slideIndex, shapeIndex: containerIndex + 1, paragraphIndex: index,
          isTitle: titleRanges.some((m) => offset >= m.index! && offset < m.index! + m[0].length),
          isTable: xml.lastIndexOf("<a:tc", offset) > xml.lastIndexOf("</a:tc>", offset) },
      });
    }
    // Follow relationships instead of assuming notesSlideN corresponds to slideN.
    const relsPath = partPath.replace("slides/", "slides/_rels/") + ".rels";
    const rels = await zip.file(relsPath)?.async("string") || "";
    const relatedParts = Array.from(rels.matchAll(/<Relationship\b[^>]*>/g)).map((m) => {
      const target = m[0].match(/Target="([^"]+)"/)?.[1];
      const type = m[0].match(/Type="([^"]+)"/)?.[1] || "";
      if (!target || !/\/(?:notesSlide|diagramData)$/.test(type) || /TargetMode="External"/.test(m[0])) return undefined;
      // Only internal text parts are read. Never load media or arbitrary ZIP paths.
      const path = target.startsWith("/") ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, "")}`;
      return /^(?:ppt\/notesSlides\/notesSlide\d+|ppt\/diagrams\/data\d+)\.xml$/.test(path) ? path : undefined;
    }).filter((p): p is string => Boolean(p));
    // Tolerate lightweight fixtures/legacy decks without relationships.
    const physicalIndex = Number(partPath.match(/slide(\d+)/)![1]);
    if (!relatedParts.some((p) => p.includes("notesSlides")) && zip.file(`ppt/notesSlides/notesSlide${physicalIndex}.xml`)) relatedParts.push(`ppt/notesSlides/notesSlide${physicalIndex}.xml`);
    for (const relatedPath of new Set(relatedParts)) {
      const relatedXml = await zip.file(relatedPath)?.async("string");
      if (!relatedXml) continue;
      let pIndex = 0;
      for (const match of relatedXml.matchAll(new RegExp(PPTX_PARAGRAPH_PATTERN))) {
        const index = pIndex++, text = paragraphText(match[0]).trim();
        if (!text || isNonTranslatable(text)) continue;
        const id = `${relatedPath.includes("notesSlides") ? "notes" : "diagram"}_s${slideIndex}_p${index}`;
        units.push({ id, text, xml: match[0], containerId: id, readOnly: true,
          location: { partPath: relatedPath, slideIndex, paragraphIndex: index, containerId: id } });
      }
    }
  }
  return { units, slides: paths.length };
}

function buildGroups(units: ScannedTextUnit[], pairs: AuditMemoryPair[], preservedIds = new Set<string>()): TranslationAuditGroup[] {
  const groups: TranslationAuditGroup[] = [];
  const bySource = new Map<string, AuditMemoryPair[]>();
  for (const pair of pairs) {
    if (pair.targetOnly) continue;
    const key = auditTextForms(pair.source).normalized;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(pair);
  }
  const grouped = new Set<string>();
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const [key, entries] of bySource) {
    const present = entries.filter((p) => p.origin === "presentation" && p.targetUnitId);
    if (!present.length) continue;
    const variants = new Map<string, { text: string; count: number; approved: boolean; slides: number[] }>();
    for (const pair of entries) {
      if (!pair.target || !pair.target.trim()) continue;
      const trimmedTarget = pair.target.trim();
      // Bare numbers, non-translatables, and single-char targets must NEVER be treated as valid translation variants
      if (/^\d+(?:[.,]\d+)?$/.test(trimmedTarget) || isNonTranslatable(trimmedTarget) || trimmedTarget.length <= 1) continue;
      const targetKey = auditTextForms(pair.target).normalized;
      if (!variants.has(targetKey)) variants.set(targetKey, { text: pair.target, count: 0, approved: pair.origin === "approved" || pair.origin === "correction", slides: [] });
      const variant = variants.get(targetKey)!;
      variant.approved ||= pair.origin === "approved" || pair.origin === "correction";
      if (pair.origin === "presentation") { variant.count++; if (pair.slideIndex && !variant.slides.includes(pair.slideIndex)) variant.slides.push(pair.slideIndex); }
    }
    if (variants.size < 2) continue;
    const sorted = [...variants.values()].sort((a, b) => Number(b.approved) - Number(a.approved) || b.count - a.count);
    const ids = new Set(present.map((p) => p.targetUnitId!));
    const affected = [...ids].map((id) => byId.get(id)).filter((u): u is ScannedTextUnit => Boolean(u) && !preservedIds.has(u!.id) && auditTextForms(u!.sourceText).normalized !== auditTextForms(sorted[0].text).normalized);
    if (!affected.length) continue;
    for (const unit of affected) {
      unit.status = "TRANSLATION_CONFLICT"; unit.selectedForTranslation = false;
      unit.suggestedTranslation = sorted[0].text; unit.safeToApply = false;
      unit.reason = sorted[0].approved ? "Thuật ngữ đã xác nhận khác với bản dịch hiện tại." : "Cùng nội dung nguồn có nhiều bản dịch; bản dùng nhiều nhất vẫn cần xác nhận.";
      grouped.add(unit.id);
    }
    groups.push({ id: `consistency:${key}`, type: "consistency", title: entries[0].source, unitIds: affected.map((u) => u.id),
      suggestedTranslation: sorted[0].text, variants: sorted, confidence: sorted[0].approved ? 0.99 : 0.85,
      safeToApply: false, reason: affected[0].reason });
  }
  const buckets = new Map<string, ScannedTextUnit[]>();
  for (const unit of units) {
    if (grouped.has(unit.id) || ["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status)) continue;
    const key = `${unit.status}:${auditTextForms(unit.suggestedTranslation || unit.sourceText).compact}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(unit);
  }
  for (const [key, members] of buckets) groups.push({ id: key,
    type: members[0].status === "SUSPICIOUS_TRANSLATION" ? "language_quality" : members[0].status === "TRANSLATION_CONFLICT" ? "consistency" : "translation",
    title: members[0].sourceText, unitIds: members.map((u) => u.id), suggestedTranslation: members[0].suggestedTranslation,
    confidence: Math.min(...members.map((u) => u.confidence)), reason: members[0].reason,
    safeToApply: members.every((u) => u.safeToApply && u.canApply) });
  return groups.sort((a, b) => Number(a.safeToApply) - Number(b.safeToApply) || b.confidence - a.confidence);
}

export async function scanPptxTranslationIntelligence(buffer: Buffer, fileName: string, options: ScanOptions = {}): Promise<SmartAuditReport> {
  const sourceLang = options.sourceLang || "en", targetLang = options.targetLang || "vi";
  const zip = await JSZip.loadAsync(buffer);
  const extracted = await extractUnits(zip);
  const isqSlidePairs = await readIsqSlidePairs(zip);
  const referencePaths = new Set(isqSlidePairs.map(p=>p.vi));
  const isqPaths = new Set<string>();
  if (sourceLang === "vi" && targetLang === "en" && options.mode !== "replace_en") {
    const slideUnits = new Map<string,RawUnit[]>();
    for (const raw of extracted.units.filter(u=>/^ppt\/slides\//.test(u.location.partPath || ""))) {
      const part=raw.location.partPath!; if(!slideUnits.has(part))slideUnits.set(part,[]);slideUnits.get(part)!.push(raw);
    }
    let afterHfpa=false;
    for(const [part,members] of slideUnits){
      const containsHfpa=members.some(u=>/\bhfpa\b/i.test(u.text));
      const profile=dynamicDeckDetector.profileSlide({slideIndex:members[0].location.slideIndex!,slideFileName:part,title:members[0].text,
        paragraphs:members.map(u=>({id:u.id,originalText:u.text,translatedText:'',slideIndex:u.location.slideIndex!,shapeIndex:0,paragraphIndex:u.location.paragraphIndex!}))},await zip.file(part)!.async('string'),fileName,afterHfpa);
      const ipqcTable=/\bIPQC\b/i.test(fileName) && !afterHfpa && profile.hasTable && profile.totalTexts>15;
      if(profile.isIsq && !profile.isDivider && !ipqcTable && !referencePaths.has(part))isqPaths.add(part);
      if(containsHfpa)afterHfpa=true;
    }
  }
  const glossary = (options.approvedGlossary || db.getApprovedTerminology(sourceLang, targetLang)).filter((e) => e.status === "approved" && isSafeTerminologyEntry(e) &&
    !(sourceLang === "vi" && targetLang === "en" && hasViDiacritics(cleanTargetTerm(e.targetTerm))) &&
    auditTextForms(e.sourceTerm).compact !== auditTextForms(e.targetTerm).compact);
  const pairs: AuditMemoryPair[] = glossary.map((e) => ({ source: e.sourceTerm, target: cleanTargetTerm(e.targetTerm), origin: "approved" }));
  pairs.push(...(options.historyPairs || getAuditHistoryPairs(sourceLang, targetLang)));
  for (const entry of options.customDocTM?.getAllEntries() || []) pairs.push({ source: entry.sourceOriginal, target: entry.target,
    origin: entry.status === "LOCKED" || entry.status === "APPROVED" ? "approved" : "presentation", slideIndex: entry.sourceLocation.slide });
  const extractItemStepNumber = (text: string): string | null => {
    if (!text) return null;
    const m = text.match(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*(\d+(?:\.\d+)?)|#?\s*(\d+(?:\.\d+)?)\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)\b))/i);
    if (m) return m[1] || m[2];
    return null;
  };

  const cleanStepPrefix = (text: string): string => {
    return text.replace(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*\d+(?:\.\d+)?[:.]?|#?\s*\d+(?:\.\d+)?\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)[:.]?))\s*/i, "").trim();
  };

  const containers = new Map<string, RawUnit[]>();
  for (const unit of extracted.units) { if (!containers.has(unit.containerId)) containers.set(unit.containerId, []); containers.get(unit.containerId)!.push(unit); }
  const paired = new Map<string, string>();
  const inlineBilingual = new Set<string>();
  for (const raw of extracted.units) {
    const parts = raw.text.split(/\r?\n|\s+[-–—/|]\s+/).map((t) => t.replace(/^(?:EN|VI|VN)\s*:\s*/i, "").trim()).filter(Boolean);
    if (parts.length === 2) {
      const s = parts.find((t) => sourceEvidence(t, sourceLang));
      const t = parts.find((t) => targetEvidence(t, targetLang));
      if (s && t && !isNonTranslatable(s) && !isNonTranslatable(t) && !/^\d+(?:[.,]\d+)?$/.test(s) && !/^\d+(?:[.,]\d+)?$/.test(t)) {
        pairs.push({ source: s, target: t, origin: "presentation", slideIndex: raw.location.slideIndex });
        inlineBilingual.add(raw.id);
      }
    } else if (parts.length > 2) {
      // Interleaved lines within the same paragraph: 1.EN, 1.VI, 2.EN, 2.VI...
      for (let k = 0; k < parts.length - 1; k++) {
        const l1 = parts[k], l2 = parts[k + 1];
        if (isInspectionStatusLabel(l1) || isInspectionStatusLabel(l2)) continue;
        const s1 = sourceEvidence(l1, sourceLang), t1 = targetEvidence(l1, targetLang);
        const s2 = sourceEvidence(l2, sourceLang), t2 = targetEvidence(l2, targetLang);
        const step1 = extractItemStepNumber(l1), step2 = extractItemStepNumber(l2);
        const sameStep = Boolean(step1 && step2 && step1 === step2);
        const diffStep = Boolean(step1 && step2 && step1 !== step2);
        if (diffStep) continue;

        const lenRatio = Math.min(l1.trim().length, l2.trim().length) / Math.max(l1.trim().length, l2.trim().length);
        const plausibleLength = lenRatio >= 0.35 || (sameStep && lenRatio >= 0.25);

        if (plausibleLength && ((s1 && t2 && lenRatio >= 0.4) || (sameStep && s1 && !s2))) {
          if (!isNonTranslatable(l1) && !isNonTranslatable(l2) && !/^\d+(?:[.,]\d+)?$/.test(l1) && !/^\d+(?:[.,]\d+)?$/.test(l2)) {
            pairs.push({ source: l1, target: l2, origin: "presentation", slideIndex: raw.location.slideIndex });
            inlineBilingual.add(raw.id);
            k++;
          }
        } else if (plausibleLength && ((t1 && s2 && lenRatio >= 0.4) || (sameStep && !s1 && s2))) {
          if (!isNonTranslatable(l1) && !isNonTranslatable(l2) && !/^\d+(?:[.,]\d+)?$/.test(l1) && !/^\d+(?:[.,]\d+)?$/.test(l2)) {
            pairs.push({ source: l2, target: l1, origin: "presentation", slideIndex: raw.location.slideIndex });
            inlineBilingual.add(raw.id);
            k++;
          }
        }
      }
    }
  }
  const known = new AuditMemoryIndex(pairs);
  const addPair = (source: RawUnit, target: RawUnit) => {
    if (isNonTranslatable(source.text) || isNonTranslatable(target.text)) return;
    if (isInspectionStatusLabel(source.text) || isInspectionStatusLabel(target.text)) return;
    const sTrim = source.text.trim();
    const tTrim = target.text.trim();
    if (sTrim.toLowerCase() === tTrim.toLowerCase()) return;
    if (/^\d+(?:[.,]\d+)?$/.test(sTrim) || /^\d+(?:[.,]\d+)?$/.test(tTrim)) return;
    if (sTrim.length <= 1 || tTrim.length <= 1) return;

    // Strict length disparity guard: a long paragraph cannot pair with a short label
    const minLen = Math.min(sTrim.length, tTrim.length);
    const maxLen = Math.max(sTrim.length, tTrim.length);
    if (maxLen >= 15 && minLen < 5) return;
    if (maxLen >= 25 && minLen / maxLen < 0.25) return;

    pairs.push({ source: source.text, target: target.text, origin: "presentation", slideIndex: source.location.slideIndex, sourceUnitId: source.id, targetUnitId: target.id });
    paired.set(source.id, target.text); paired.set(target.id, source.text);

    const cleanSrc = cleanStepPrefix(source.text);
    const cleanTgt = cleanStepPrefix(target.text);
    if (cleanSrc && cleanTgt && cleanSrc.length > 2 && cleanTgt.length > 2 && (cleanSrc !== source.text || cleanTgt !== target.text)) {
      pairs.push({ source: cleanSrc, target: cleanTgt, origin: "presentation", slideIndex: source.location.slideIndex });
    }
  };
  for (const members of containers.values()) {
    // 1. Interleaved adjacent [EN, VI] or [VI, EN] paragraphs within container (1.EN 1.VI or 1.VI 1.EN)
    for (let k = 0; k < members.length - 1; k++) {
      const u1 = members[k], u2 = members[k + 1];
      if (paired.has(u1.id) || paired.has(u2.id)) continue;
      if (isInspectionStatusLabel(u1.text) || isInspectionStatusLabel(u2.text)) continue;

      const s1 = sourceEvidence(u1.text, sourceLang), t1 = targetEvidence(u1.text, targetLang);
      const s2 = sourceEvidence(u2.text, sourceLang), t2 = targetEvidence(u2.text, targetLang);
      const step1 = extractItemStepNumber(u1.text), step2 = extractItemStepNumber(u2.text);
      const sameStep = Boolean(step1 && step2 && step1 === step2);
      const diffStep = Boolean(step1 && step2 && step1 !== step2);
      if (diffStep) continue;

      const lenRatio = Math.min(u1.text.trim().length, u2.text.trim().length) / Math.max(u1.text.trim().length, u2.text.trim().length);
      const plausibleLength = lenRatio >= 0.35 || (sameStep && lenRatio >= 0.25);

      if (plausibleLength && ((s1 && t2 && lenRatio >= 0.4) || (sameStep && s1 && !s2))) {
        addPair(u1, u2);
        k++;
      } else if (plausibleLength && ((t1 && s2 && lenRatio >= 0.4) || (sameStep && !s1 && s2))) {
        addPair(u2, u1);
        k++;
      }
    }

    // 2. Existing relationships from memory index
    const sources = members.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang));
    const targets = members.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang));
    for (const source of sources) {
      if (paired.has(source.id)) continue;
      const relationship = chooseAuditMatch(known.lookup(source.text));
      if (!relationship.match || relationship.conflict) continue;
      const target = targets.find((t) => !paired.has(t.id) && auditTextForms(t.text).compact === auditTextForms(relationship.match!.target).compact);
      if (target) addPair(source, target);
    }

    // 3. Step-number matching within container (e.g. all EN items 1,2,3,4 followed by all VI items 1,2,3,4)
    const remSources = members.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang));
    const remTargets = members.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang));
    for (const src of remSources) {
      if (paired.has(src.id)) continue;
      const srcStep = extractItemStepNumber(src.text);
      if (srcStep) {
        const matchingTgt = remTargets.find((tgt) => !paired.has(tgt.id) && extractItemStepNumber(tgt.text) === srcStep);
        if (matchingTgt) {
          addPair(src, matchingTgt);
        }
      }
    }

    // 4. Unique complementary pair fallback
    const unpairedSources = members.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang) && !isInspectionStatusLabel(u.text));
    const unpairedTargets = members.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang) && !isInspectionStatusLabel(u.text));
    if (unpairedSources.length === 1 && unpairedTargets.length === 1) {
      const s = unpairedSources[0], t = unpairedTargets[0];
      const sLen = s.text.trim().length, tLen = t.text.trim().length;
      const ratio = Math.min(sLen, tLen) / Math.max(sLen, tLen);
      if (ratio >= 0.35 && sLen >= 6 && tLen >= 6) {
        addPair(s, t);
      }
    }
  }

  // 5. Cross-container / Same-slide pairing (Block bilingual layout on the same slide:
  // e.g. Textbox 1 has EN steps 1, 2, 3, 4; Textbox 2 has VI steps 1, 2, 3, 4 or vice-versa)
  const slideUnitsMap = new Map<number, RawUnit[]>();
  for (const unit of extracted.units) {
    const sIdx = unit.location.slideIndex ?? 0;
    if (!slideUnitsMap.has(sIdx)) slideUnitsMap.set(sIdx, []);
    slideUnitsMap.get(sIdx)!.push(unit);
  }

  for (const [, slideUnits] of slideUnitsMap) {
    const unpairedVi = slideUnits.filter((u) => !paired.has(u.id) && !isInspectionStatusLabel(u.text) && (hasViDiacritics(u.text) || languageEvidence(u.text).vi.length > 0));
    const unpairedEn = slideUnits.filter((u) => !paired.has(u.id) && !isInspectionStatusLabel(u.text) && !hasViDiacritics(u.text) && (isPureEnglish(u.text) || languageEvidence(u.text).likelyEnglish || /[a-zA-Z]{2,}/.test(u.text)));

    // A. Match by step number on the same slide (e.g. 1.EN with 1.VI, 2.EN with 2.VI...)
    for (const viUnit of unpairedVi) {
      if (paired.has(viUnit.id)) continue;
      const vStep = extractItemStepNumber(viUnit.text);
      if (vStep) {
        const matchingEn = unpairedEn.find((eu) => !paired.has(eu.id) && extractItemStepNumber(eu.text) === vStep);
        if (matchingEn) {
          const vLen = viUnit.text.trim().length, eLen = matchingEn.text.trim().length;
          const ratio = Math.min(vLen, eLen) / Math.max(vLen, eLen);
          if (ratio >= 0.25 || (vLen < 15 && eLen < 20)) {
            addPair(viUnit, matchingEn);
          }
        }
      }
    }
  }

  // Cross-slide pairing between paired EN and VI slides (Ching Luh SOP Option 1 pairs)
  const slidePartUnits = new Map<string, RawUnit[]>();
  for (const unit of extracted.units) {
    if (unit.location.partPath) {
      if (!slidePartUnits.has(unit.location.partPath)) slidePartUnits.set(unit.location.partPath, []);
      slidePartUnits.get(unit.location.partPath)!.push(unit);
    }
  }
  for (const pair of isqSlidePairs) {
    const enUnits = (slidePartUnits.get(pair.en) || []).filter((u) => !isNonTranslatable(u.text) && !isInspectionStatusLabel(u.text) && !/^\d+(?:[.,]\d+)?$/.test(u.text.trim()) && u.text.trim().length > 1);
    const viUnits = (slidePartUnits.get(pair.vi) || []).filter((u) => !isNonTranslatable(u.text) && !isInspectionStatusLabel(u.text) && !/^\d+(?:[.,]\d+)?$/.test(u.text.trim()) && u.text.trim().length > 1);
    // Match by step number across slides
    for (const vu of viUnits) {
      if (paired.has(vu.id)) continue;
      const vStep = extractItemStepNumber(vu.text);
      if (vStep) {
        const matchingEu = enUnits.find((eu) => !paired.has(eu.id) && extractItemStepNumber(eu.text) === vStep);
        if (matchingEu) {
          const vLen = vu.text.trim().length, eLen = matchingEu.text.trim().length;
          const ratio = Math.min(vLen, eLen) / Math.max(vLen, eLen);
          if (ratio >= 0.3 || (vLen < 15 && eLen < 20)) {
            addPair(vu, matchingEu);
          }
        }
      }
    }
  }
  // Vietnamese already present in the deck also supplies spelling evidence without inventing a source/target relationship.
  if (targetLang === "vi") for (const raw of extracted.units) {
    if (inlineBilingual.has(raw.id) || languageEvidence(raw.text).en.length >= 2 || (!hasViDiacritics(raw.text) && !languageEvidence(raw.text).vi.length)) continue;
    const quality = vietnameseQuality(raw.text);
    pairs.push({ source: "", target: quality.suggestion || raw.text, origin: "presentation", slideIndex: raw.location.slideIndex, targetOnly: true, inferred: Boolean(quality.suggestion) });
  }
  const sourceIndex = new AuditMemoryIndex(pairs), targetIndex = new AuditMemoryIndex(pairs, "target");
  const docTM = options.customDocTM || new DocumentTranslationMemory();
  // Keep existing TM intact. Presentation observations are ESTABLISHED, never falsely APPROVED.
  if (!options.customDocTM) docTM.initializeDocumentTM([], glossary);
  for (const pair of pairs.filter((p) => p.origin === "presentation" && p.source)) docTM.recordTranslation(pair.source, pair.target, { slide: pair.slideIndex }, "DOCUMENT", 0.9, "ESTABLISHED");
  const memo = new Map<string, ReturnType<AuditMemoryIndex["lookup"]>>();
  const decisionMemo = new Map<string, ReturnType<typeof chooseAuditMatch>>();
  const glossaryChecks = new Map<string, ReturnType<typeof checkGlossaryTranslation>>();
  const checkCandidate = (source: string, target: string) => {
    const key = JSON.stringify([source, target]);
    if (!glossaryChecks.has(key)) glossaryChecks.set(key, checkGlossaryTranslation(source, target, glossary, sourceLang, targetLang));
    return glossaryChecks.get(key)!;
  };
  const lookup = (index: AuditMemoryIndex, text: string, field: string) => {
    const key = `${field}:${text}`;
    if (!memo.has(key)) memo.set(key, index.lookup(text));
    return memo.get(key)!;
  };
  const preservedIds = new Set<string>();
  const units: ScannedTextUnit[] = extracted.units.map((raw) => {
    const language = languageEvidence(raw.text);
    const base = classifyTextUnit(raw.text, raw.location, { sourceLang, targetLang,
      existingTranslation: paired.has(raw.id) ? paired.get(raw.id) : undefined });
    const unit: ScannedTextUnit = { id: raw.id, sourceText: raw.text, sourceHash: computeSourceHash(raw.text), canonicalText: canonicalizeText(raw.text),
      location: raw.location, ...base, selectedForTranslation: false, safeToApply: false, canApply: false };

    // Early guard: English Immunity Shield (inspection labels, pure English, shoe models, technical standards)
    if (isEnglishImmunityProtected(raw.text, sourceLang)) {
      preservedIds.add(unit.id);
      const isLabel = isInspectionStatusLabel(raw.text);
      unit.status = isLabel ? "NON_TRANSLATABLE" : "ALREADY_TRANSLATED";
      unit.reason = isLabel
        ? "Ký hiệu nhãn đánh giá đạt chuẩn (GOOD / NO GOOD / OK / NG); giữ nguyên."
        : isShoeModelName(raw.text)
        ? "Tên model giày, thương hiệu hoặc mã mẫu kỹ thuật; giữ nguyên."
        : isPureEnglish(raw.text)
        ? "Nội dung đã là tiếng Anh chuẩn; giữ nguyên, không cần dịch lại."
        : "Thuật ngữ kỹ thuật / mã chuẩn / số liệu; giữ nguyên.";
      unit.requiresTranslation = false;
      unit.selectedForTranslation = false;
      if (paired.has(raw.id)) unit.existingTranslation = paired.get(raw.id);
      delete unit.suggestedTranslation;
      return unit;
    }

    if (referencePaths.has(raw.location.partPath!)) {
      preservedIds.add(unit.id);
      unit.status = "ALREADY_TRANSLATED";
      unit.reason = "Slide tiếng Việt tham chiếu của cặp ISQ; giữ nguyên, không cần dịch lại.";
      unit.selectedForTranslation = false;
      unit.requiresTranslation = false;
      if (paired.has(raw.id)) unit.existingTranslation = paired.get(raw.id);
      delete unit.suggestedTranslation;
      return unit;
    }
    const isqSource = isqPaths.has(raw.location.partPath!) && sourceEvidence(raw.text,sourceLang);
    unit.location.isIsq=isqPaths.has(raw.location.partPath!);
    if (paired.has(raw.id)) {
      unit.existingTranslation = paired.get(raw.id);
      if (!isqSource) {
        preservedIds.add(unit.id);
        unit.status = "ALREADY_TRANSLATED";
        unit.reason = "Đã có bản dịch song ngữ tương ứng trong cùng slide/hộp văn bản.";
        unit.requiresTranslation = false;
        unit.selectedForTranslation = false;
        delete unit.suggestedTranslation;
        return unit;
      }
    }
    if(sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text,"vi") && !paired.has(raw.id) && !inlineBilingual.has(raw.id) && unit.status === "ALREADY_TRANSLATED") {
      unit.status="NEEDS_TRANSLATION"; delete unit.suggestedTranslation;
    }
    if (unit.status === "NEEDS_TRANSLATION") unit.reason = "Nội dung có bằng chứng ngôn ngữ nguồn và chưa tìm thấy bản dịch.";
    if (unit.status === "ALREADY_TRANSLATED") unit.reason = paired.has(raw.id) ? "Đã có cặp dịch trong cùng hộp văn bản." : "Nội dung đã ở ngôn ngữ đích.";
    if (isNonTranslatable(raw.text)) {
      delete unit.suggestedTranslation;
      return unit;
    }
    // In VI -> EN repair, existing English is final content. Do not turn casing,
    // wording or historical/glossary variants into a request to edit it again.
    if (sourceLang === "vi" && targetLang === "en" && !sourceEvidence(raw.text,"vi")) {
      preservedIds.add(unit.id); unit.status="ALREADY_TRANSLATED";
      unit.reason=isPureEnglish(raw.text) || language.likelyEnglish ? "Nội dung đã là tiếng Anh; giữ nguyên, không dịch hoặc chỉnh lại." : "Không có bằng chứng tiếng Việt; giữ nguyên, không gợi ý chỉnh sửa.";
      unit.requiresTranslation=false; delete unit.suggestedTranslation; return unit;
    }
    if (sourceLang === "en" && targetLang === "vi" && hasViDiacritics(raw.text)) {
      preservedIds.add(unit.id); unit.status="ALREADY_TRANSLATED";
      unit.reason="Nội dung đã ở tiếng Việt; giữ nguyên, không gợi ý chỉnh sửa.";
      unit.requiresTranslation=false; delete unit.suggestedTranslation; return unit;
    }
    if (inlineBilingual.has(raw.id) && !isqSource) { unit.status = "ALREADY_TRANSLATED"; unit.reason = "Đã có cặp song ngữ trong cùng đoạn văn."; return unit; }
    // A leaked VI history target cannot prove that a VI paragraph is translated.
    const targetMatches = lookup(targetIndex, raw.text, "target").filter(match =>
      !(sourceLang === "vi" && targetLang === "en" && hasViDiacritics(match.target)));
    const targetMatch = [...targetMatches].sort((a, b) => memoryPriority(b.origin) - memoryPriority(a.origin) || Number(Boolean(a.inferred)) - Number(Boolean(b.inferred)) || Number(Boolean(vietnameseQuality(a.target).suggestion)) - Number(Boolean(vietnameseQuality(b.target).suggestion)) || b.confidence - a.confidence)[0];
    if (targetMatch && targetMatch.confidence >= AUDIT_CONFIDENCE.variant && (targetLang !== "vi" || hasViDiacritics(targetMatch.target))) {
      unit.matches = targetMatches.filter((match) => !match.inferred).slice(0, 5);
      if (raw.text.normalize("NFC") !== targetMatch.target.normalize("NFC")) {
        unit.status = "SUSPICIOUS_TRANSLATION"; unit.suggestedTranslation = targetMatch.target; unit.confidence = targetMatch.confidence;
        unit.reason = "Biến thể gần với bản dịch đã dùng: kiểm tra dấu, cách viết hoặc khoảng trắng.";
        if (targetLang === "vi") {
          const quality = vietnameseQuality(raw.text);
          unit.suspiciousSegments = quality.segments;
          if (targetMatch.inferred) {
            unit.reason = "Có cụm tiếng Việt có thể thiếu/sai dấu hoặc dính chữ; cần kiểm tra trước khi sửa.";
            unit.confidence = 0.86;
          }
        }
        unit.safeToApply = raw.text.replace(/\s+/g, " ").trim() === targetMatch.target.replace(/\s+/g, " ").trim();
      } else { unit.status = "ALREADY_TRANSLATED"; unit.reason = "Khớp với bản dịch đã có."; }
    } else if (targetLang === "vi" && (hasViDiacritics(raw.text) || language.vi.length)) {
      const quality = vietnameseQuality(raw.text);
      if (quality.suggestion) {
        unit.status = "SUSPICIOUS_TRANSLATION"; unit.suggestedTranslation = quality.suggestion; unit.suspiciousSegments = quality.segments; unit.confidence = 0.86;
        unit.reason = "Có cụm tiếng Việt có thể thiếu/sai dấu hoặc dính chữ; cần kiểm tra trước khi sửa.";
      } else if (language.en.length >= 2 && !paired.has(raw.id)) {
        unit.status = "MIXED_LANGUAGE"; unit.reason = "Có cụm tiếng Anh trong nội dung tiếng Việt; cần xem ngữ cảnh."; unit.confidence = 0.83;
      } else { unit.status = "ALREADY_TRANSLATED"; }
    } else if (!paired.has(raw.id)) {
      // Check conditional prefix pattern: *Đối với <Model> / Đối với <Model>
      // Rule: Translate "Đối với" -> "For", shoe model name stays as-is, never binds model into glossary!
      const doiVoiAuditMatch = raw.text.match(/^(\s*\*?\s*)đối\s*với\s+(.+)$/i);
      const isModelNote = doiVoiAuditMatch && (isShoeModelName(doiVoiAuditMatch[2].trim()) || /^[A-Z0-9\-\/\.\s]+$/i.test(doiVoiAuditMatch[2].trim()));

      if (isModelNote) {
        const prefix = doiVoiAuditMatch![1].includes("*") ? "*For " : "For ";
        const remainder = doiVoiAuditMatch![2].trim();
        unit.suggestedTranslation = prefix + remainder;
        unit.status = "LOCKED_TERMINOLOGY";
        unit.safeToApply = true;
        unit.canApply = true;
        unit.confidence = 1.0;
        unit.reason = "Dịch 'Đối với' thành 'For' theo quy chuẩn (tên model giày giữ nguyên).";
        unit.glossaryCorrections = [{ sourceTerm: "Đối với", expectedTarget: "For" }];
      } else {
        const rawMatches = lookup(sourceIndex, raw.text, "source");
        const enforceGlossary = sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text, sourceLang);
        const checked = enforceGlossary ? rawMatches.map(match => ({ match, check: checkCandidate(raw.text, match.target) })) : [];
        // Historical source similarity says nothing about glossary compliance.
        // Exclude unresolved targets before choosing, comparing or exposing a suggestion.
        const matches = enforceGlossary ? checked.filter(({ check }) => check.isValid && !hasViDiacritics(check.text)).map(({ match, check }) => ({ ...match, target: check.text })) : rawMatches;
        if (!decisionMemo.has(raw.text)) decisionMemo.set(raw.text, chooseAuditMatch(matches));
        const decision = decisionMemo.get(raw.text)!;
        if (decision.match) {
          unit.matches = matches.slice(0, 5); unit.confidence = decision.match.confidence;
          const prefix = raw.text.match(/^\s*(?:[\*•\#]|[-–—]\s+|\d{1,3}[.)]\s*)/)?.[0] || "";
          unit.suggestedTranslation = prefix && !decision.match.target.startsWith(prefix.trim()) ? prefix + decision.match.target : decision.match.target;
          unit.safeToApply = decision.safe;
          unit.status = decision.conflict ? "TRANSLATION_CONFLICT" : decision.safe ? decision.match.origin === "approved" ? "LOCKED_TERMINOLOGY" : "TM_REUSE" : "POSSIBLE_TRANSLATION";
          unit.reason = decision.conflict ? "Có nhiều bản dịch phù hợp; cần chọn theo ngữ cảnh." : decision.match.origin === "approved" ? "Bản dịch từ thuật ngữ đã duyệt." : decision.match.origin === "correction" ? "Bản dịch đã được người dùng chỉnh sửa và lưu." : decision.match.origin === "presentation" ? "Tìm thấy bản dịch trong PowerPoint hiện tại." : "Tìm thấy bản dịch trong tài liệu trước; cần xác nhận.";
          if (enforceGlossary) {
          const selectedCheck = checked.find(({ check }) => check.isValid && check.text === decision.match!.target)?.check;
          if (selectedCheck?.corrections.length) {
            unit.glossaryCorrections = selectedCheck.corrections.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
            unit.reason += " Đã sửa theo glossary: " + unit.glossaryCorrections.map(c => `${c.sourceTerm} → ${c.expectedTarget}`).join("; ") + ".";
          }
          if (!decision.safe) unit.confidence = Math.min(unit.confidence, 0.85);
        }
      } else if (checked.some(({ check }) => !check.isValid || hasViDiacritics(check.text))) {
        unit.glossaryMismatches = [...new Map(checked.flatMap(({ check }) => check.mismatches).map(m => [m.sourceTerm, { sourceTerm: m.sourceTerm, expectedTarget: m.expectedTarget }])).values()];
        unit.status = "REVIEW_REQUIRED"; unit.confidence = 0.6;
        delete unit.suggestedTranslation;
        unit.reason = unit.glossaryMismatches.length
          ? "Bản dịch lưu chưa tuân thủ glossary; cần dịch lại với thuật ngữ: " + unit.glossaryMismatches.map(m => `${m.sourceTerm} → ${m.expectedTarget}`).join("; ") + "."
          : "Bản dịch lưu còn tiếng Việt; cần dịch lại sang tiếng Anh.";
      } else if (sourceLang === "en" && targetLang === "vi" && !language.likelyEnglish) {
        unit.status = "REVIEW_REQUIRED"; unit.reason = "Chưa đủ bằng chứng ngôn ngữ; có thể là tên, mã hoặc tiếng Việt không dấu."; unit.confidence = 0.5;
      } else if (sourceLang === "en" && targetLang === "vi" && auditTextForms(raw.text).tokens.length === 1) {
        unit.status = "REVIEW_REQUIRED"; unit.reason = "Từ đơn cần ngữ cảnh để chọn nghĩa phù hợp."; unit.confidence = 0.6;
      }
      }
    }
    // Also guard target-variant suggestions: corrupt history can contain VI
    // targets and otherwise bypass the source-memory branch above.
    if (sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text, sourceLang) && unit.suggestedTranslation) {
      const checked = checkCandidate(raw.text, unit.suggestedTranslation);
      if (!checked.isValid || hasViDiacritics(checked.text)) {
        unit.glossaryMismatches = checked.mismatches.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
        delete unit.suggestedTranslation; unit.safeToApply = false; unit.status = "REVIEW_REQUIRED"; unit.confidence = 0.6;
        unit.reason = unit.glossaryMismatches.length
          ? "Gợi ý chưa tuân thủ glossary; cần dịch lại: " + unit.glossaryMismatches.map(m => `${m.sourceTerm} → ${m.expectedTarget}`).join("; ") + "."
          : "Gợi ý còn tiếng Việt; cần dịch lại sang tiếng Anh.";
      } else {
        unit.suggestedTranslation = checked.text;
        if (checked.corrections.length) {
          unit.glossaryCorrections = checked.corrections.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
          unit.reason += " Đã sửa theo glossary: " + unit.glossaryCorrections.map(c => `${c.sourceTerm} → ${c.expectedTarget}`).join("; ") + ".";
        }
      }
    }
    if (!["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status) && unit.suggestedTranslation && unit.suggestedTranslation !== raw.text) unit.canApply = !raw.readOnly && canReplaceParagraphText(raw.xml, unit.suggestedTranslation);
    unit.safeToApply = Boolean(unit.safeToApply && unit.canApply);
    // A candidate in memory is not a translation already present in the file.
    // Include unresolved source text even when history disagrees or a glossary
    // suggestion exists; the translator resolves trusted mappings and translates
    // conflicts afresh instead of choosing an arbitrary historical candidate.
    unit.requiresTranslation = isqSource || !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status) && sourceEvidence(raw.text, sourceLang);
    if(isqSource && unit.status === "ALREADY_TRANSLATED")unit.status=unit.existingTranslation?"TM_REUSE":"MIXED_LANGUAGE";
    unit.selectedForTranslation = unit.requiresTranslation && !raw.readOnly && canTranslateParagraphText(raw.xml);
    if (isqSource) {unit.reason += " ISQ: xuất slide EN riêng, slide VI ở ngay sau.";unit.canApply=false;}
    if (unit.requiresTranslation && !unit.selectedForTranslation) unit.reason += raw.readOnly ? " Ghi chú/SmartArt cần chỉnh thủ công." : " Cần chỉnh thủ công để giữ định dạng hoặc ngắt dòng.";
    if (unit.suggestedTranslation && unit.suggestedTranslation.trim().toLowerCase() === raw.text.trim().toLowerCase()) {
      delete unit.suggestedTranslation;
    }
    return unit;
  });
  const groups = buildGroups(units, pairs, preservedIds);
  // Consistency suggestions may change after grouping.
  const rawById = new Map(extracted.units.map((r) => [r.id, r]));
  for (const unit of units) {
    const raw = rawById.get(unit.id)!;
    if (unit.status === "TRANSLATION_CONFLICT" && unit.suggestedTranslation) unit.canApply = !raw.readOnly && canReplaceParagraphText(raw.xml, unit.suggestedTranslation);
    if(unit.location.isIsq && unit.requiresTranslation){unit.canApply=false;unit.safeToApply=false;}
  }
  const count = (status: ScannedTextUnit["status"]) => units.filter((u) => u.status === status).length;
  const pending = units.filter((u) => u.status === "NEEDS_TRANSLATION");
  const translatableMissing = units.filter((u) => u.selectedForTranslation);
  const slidePairs: import("./smart-detector").SlidePairSummary[] = [];
  for (const pair of isqSlidePairs) {
    const enUnits = slidePartUnits.get(pair.en) || [];
    const viUnits = slidePartUnits.get(pair.vi) || [];
    const enSlide = enUnits[0]?.location.slideIndex || Number(pair.en.match(/slide(\d+)/)?.[1] || 0);
    const viSlide = viUnits[0]?.location.slideIndex || Number(pair.vi.match(/slide(\d+)/)?.[1] || 0);
    const enTitle = enUnits.find((u) => u.text.trim())?.text || "";
    const viTitle = viUnits.find((u) => u.text.trim())?.text || "";
    slidePairs.push({
      enSlide,
      viSlide,
      enPath: pair.en,
      viPath: pair.vi,
      enTitle,
      viTitle,
      status: "auto",
      itemCount: viUnits.length,
    });
  }
  const uniquePending = new Set(translatableMissing.filter((u) => !u.safeToApply && !["TM_REUSE", "LOCKED_TERMINOLOGY"].includes(u.status)).map((u) => u.canonicalText));
  return { fileName, fileType: "pptx", totalUnits: units.length, totalSlides: extracted.slides,
    alreadyTranslatedCount: count("ALREADY_TRANSLATED"), needsTranslationCount: pending.length, tmReusableCount: count("TM_REUSE"), lockedTerminologyCount: count("LOCKED_TERMINOLOGY"),
    untranslatedCount: units.filter((u) => u.requiresTranslation).length, translatableMissingCount: translatableMissing.length,
    nonTranslatableCount: count("NON_TRANSLATABLE"), mixedLanguageCount: count("MIXED_LANGUAGE"), possibleTranslationCount: count("POSSIBLE_TRANSLATION"), reviewRequiredCount: count("REVIEW_REQUIRED"),
    suspiciousTranslationCount: count("SUSPICIOUS_TRANSLATION"), translationConflictCount: count("TRANSLATION_CONFLICT"),
    attentionCount: groups.filter((g) => !g.safeToApply).length, safeFixCount: units.filter((u) => u.safeToApply).length,
    affectedSlides: [...new Set(units.filter((u) => !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(u.status)).map((u) => u.location.slideIndex!))].sort((a, b) => a - b),
    estimatedGeminiRequests: Math.ceil(uniquePending.size / 25), units, groups, slidePairs };
}

/** Re-scan on the server and apply only the selected suggestions. No client-supplied replacement text. */
export async function applyPptxAuditSuggestions(buffer: Buffer, fileName: string, unitIds: string[], options: ScanOptions = {}) {
  const report = await scanPptxTranslationIntelligence(buffer, fileName, options);
  const requested = new Set(unitIds);
  const selected = report.units.filter((u) => requested.has(u.id));
  if (options.customTranslations) {
    for (const unit of selected) {
      if (typeof options.customTranslations[unit.id] === "string" && options.customTranslations[unit.id].trim()) {
        unit.suggestedTranslation = options.customTranslations[unit.id].trim();
        unit.canApply = true;
      }
    }
  }
  if (!selected.length || selected.length !== requested.size || selected.some((u) => !u.canApply || !u.suggestedTranslation)) throw new Error("Một số gợi ý không còn hợp lệ hoặc cần chỉnh sửa thủ công để giữ định dạng. Hãy quét lại.");
  if (options.expectedSuggestions) {
    const expected = new Map(options.expectedSuggestions.map((u) => [u.id, u]));
    if (selected.some((u) => expected.get(u.id)?.sourceText !== u.sourceText || expected.get(u.id)?.suggestedTranslation !== u.suggestedTranslation)) throw new Error("Gợi ý đã thay đổi kể từ lúc xem trước. Hãy quét lại.");
  }
  const zip = await JSZip.loadAsync(buffer);
  const byPart = new Map<string, Map<number, ScannedTextUnit>>();
  for (const unit of selected) {
    const part = unit.location.partPath!;
    if (!byPart.has(part)) byPart.set(part, new Map());
    byPart.get(part)!.set(unit.location.paragraphIndex!, unit);
  }
  for (const [part, replacements] of byPart) {
    const xml = await zip.file(part)!.async("string");
    let index = 0;
    const result = xml.replace(new RegExp(PPTX_PARAGRAPH_PATTERN), (pXml) => {
      const unit = replacements.get(index++);
      if (!unit) return pXml;
      if (paragraphText(pXml).trim() !== unit.sourceText) throw new Error("Nội dung đã thay đổi; hãy quét lại trước khi áp dụng.");
      return replaceParagraphText(pXml, unit.suggestedTranslation!);
    });
    zip.file(part, result);
  }
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), appliedCount: selected.length };
}
