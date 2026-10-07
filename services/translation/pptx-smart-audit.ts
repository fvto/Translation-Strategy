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
import { classifyTextUnit, computeSourceHash, hasViDiacritics, isNonTranslatable, isPureEnglish } from "./smart-detector";
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
  return sourceLang === "vi" ? hasViDiacritics(text) || language.vi.length > 0 : !hasViDiacritics(text) && !language.vi.length && language.likelyEnglish;
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
  const referencePaths = new Set((await readIsqSlidePairs(zip)).map(p=>p.vi));
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
  const containers = new Map<string, RawUnit[]>();
  for (const unit of extracted.units) { if (!containers.has(unit.containerId)) containers.set(unit.containerId, []); containers.get(unit.containerId)!.push(unit); }
  const paired = new Map<string, string>();
  const inlineBilingual = new Set<string>();
  for (const raw of extracted.units) {
    const parts = raw.text.split(/\r?\n|\s+[-–—/|]\s+/).map((t) => t.replace(/^(?:EN|VI|VN)\s*:\s*/i, "").trim()).filter(Boolean);
    const sources = parts.filter((t) => sourceEvidence(t, sourceLang));
    const targets = parts.filter((t) => targetEvidence(t, targetLang));
    if (sources.length === 1 && targets.length === 1) {
      pairs.push({ source: sources[0], target: targets[0], origin: "presentation", slideIndex: raw.location.slideIndex });
      inlineBilingual.add(raw.id);
    }
  }
  const known = new AuditMemoryIndex(pairs);
  const addPair = (source: RawUnit, target: RawUnit) => {
    pairs.push({ source: source.text, target: target.text, origin: "presentation", slideIndex: source.location.slideIndex, sourceUnitId: source.id, targetUnitId: target.id });
    paired.set(source.id, target.text); paired.set(target.id, source.text);
  };
  for (const members of containers.values()) {
    const sources = members.filter((u) => sourceEvidence(u.text, sourceLang));
    const targets = members.filter((u) => targetEvidence(u.text, targetLang));
    // Existing relationships can identify pairs even in crowded/messy containers.
    for (const source of sources) {
      const relationship = chooseAuditMatch(known.lookup(source.text));
      if (!relationship.match || relationship.conflict) continue;
      const target = targets.find((t) => auditTextForms(t.text).compact === auditTextForms(relationship.match!.target).compact);
      if (target) addPair(source, target);
    }
    const unpairedSources = sources.filter((u) => !paired.has(u.id));
    const unpairedTargets = targets.filter((u) => !paired.has(u.id));
    // A unique complementary pair is structural evidence. Multiple unrelated lines are never silently paired.
    if (unpairedSources.length === 1 && unpairedTargets.length === 1) addPair(unpairedSources[0], unpairedTargets[0]);
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
    if (referencePaths.has(raw.location.partPath!)) {preservedIds.add(unit.id);unit.status="ALREADY_TRANSLATED";unit.reason="Slide tiếng Việt tham chiếu của cặp ISQ; giữ nguyên.";return unit;}
    const isqSource = isqPaths.has(raw.location.partPath!) && sourceEvidence(raw.text,sourceLang);
    unit.location.isIsq=isqPaths.has(raw.location.partPath!);
    if (paired.has(raw.id)) unit.existingTranslation=paired.get(raw.id);
    if(sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text,"vi") && !paired.has(raw.id) && !inlineBilingual.has(raw.id) && unit.status === "ALREADY_TRANSLATED") {
      unit.status="NEEDS_TRANSLATION"; delete unit.suggestedTranslation;
    }
    if (unit.status === "NEEDS_TRANSLATION") unit.reason = "Nội dung có bằng chứng ngôn ngữ nguồn và chưa tìm thấy bản dịch.";
    if (unit.status === "ALREADY_TRANSLATED") unit.reason = paired.has(raw.id) ? "Đã có cặp dịch trong cùng hộp văn bản." : "Nội dung đã ở ngôn ngữ đích.";
    if (isNonTranslatable(raw.text)) return unit;
    // In VI -> EN repair, existing English is final content. Do not turn casing,
    // wording or historical/glossary variants into a request to edit it again.
    if (sourceLang === "vi" && targetLang === "en" && !sourceEvidence(raw.text,"vi")) {
      preservedIds.add(unit.id); unit.status="ALREADY_TRANSLATED";
      unit.reason=isPureEnglish(raw.text) || language.likelyEnglish ? "Nội dung đã là tiếng Anh; giữ nguyên, không dịch hoặc chỉnh lại." : "Không có bằng chứng tiếng Việt; giữ nguyên, không gợi ý chỉnh sửa.";
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
  const uniquePending = new Set(translatableMissing.filter((u) => !u.safeToApply && !["TM_REUSE","LOCKED_TERMINOLOGY"].includes(u.status)).map((u) => u.canonicalText));
  return { fileName, fileType: "pptx", totalUnits: units.length, totalSlides: extracted.slides,
    alreadyTranslatedCount: count("ALREADY_TRANSLATED"), needsTranslationCount: pending.length, tmReusableCount: count("TM_REUSE"), lockedTerminologyCount: count("LOCKED_TERMINOLOGY"),
    untranslatedCount: units.filter((u) => u.requiresTranslation).length, translatableMissingCount: translatableMissing.length,
    nonTranslatableCount: count("NON_TRANSLATABLE"), mixedLanguageCount: count("MIXED_LANGUAGE"), possibleTranslationCount: count("POSSIBLE_TRANSLATION"), reviewRequiredCount: count("REVIEW_REQUIRED"),
    suspiciousTranslationCount: count("SUSPICIOUS_TRANSLATION"), translationConflictCount: count("TRANSLATION_CONFLICT"),
    attentionCount: groups.filter((g) => !g.safeToApply).length, safeFixCount: units.filter((u) => u.safeToApply).length,
    affectedSlides: [...new Set(units.filter((u) => !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(u.status)).map((u) => u.location.slideIndex!))].sort((a, b) => a - b),
    estimatedGeminiRequests: Math.ceil(uniquePending.size / 25), units, groups };
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
