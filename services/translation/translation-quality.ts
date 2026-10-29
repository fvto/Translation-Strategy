import { isInstructionFragment, modelSectionKey } from "./bilingual-alignment";
import { isVietnameseText, hasVietnameseDiacritics } from "./vietnamese-detector";
import type { SmartAuditReport, TranslationAuditGroup } from "./smart-detector";
import type { PostFlightAuditReport } from "../qa/pptx-postflight-gate";

export interface TranslationQualityIssue {
  type: "incomplete_instruction" | "check_if_required" | "incomplete_condition" | "missing_measurement" | "missing_restriction" | "unsupported_operation";
  message: string;
  unitId: string;
  sourceUnitId?: string;
  slideIndex?: number;
  sourceText?: string;
  targetText: string;
  protected: boolean;
}
export interface TranslationQualityReport {
  passed: boolean;
  checkedPairs: number;
  unpairedEnglishUnits: number;
  /** Rule checks do not certify semantic equivalence. */
  semanticAssessment: "not_performed";
  issues: TranslationQualityIssue[];
}
export const stripInstructionPrefix = (text: string) => text.trim().replace(/^(?:[*•#]\s*)?(?:(?:step|bước|item|ctq)\s*)?\d+(?:\.\d+)?[.):\-]\s*/iu, '').trim();
const vi = (text: string) => hasVietnameseDiacritics(text) || isVietnameseText(text);
const finite = /\b(?:is|are|has|have|does|do|can|must|should|will|remains?|matches?|fits?|aligns?|exceeds?|meets?|follows?|shows?|covers?|contains?|overlaps?|passes?|stays?|lies?|sits?|reaches?|touches?|looks?|feels?)\b/i;

function measurements(text: string) {
  const normalized = text.toLowerCase().replace(/\+\s*[-−]\s*/g, '±').replace(/,/g, '.').replace(/mũi\s*\/\s*inch/g, 'stitches/inch');
  return [...normalized.matchAll(/(?:[±+\-−]\s*)?\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:stitches\s*\/\s*inch|kg\s*\/\s*cm[²2]|mm|cm|kg|n\b|°\s*c|%)/gu)].map(match => match[0].replace(/\s+/g, '').replace(/–/g, '-').replace(/²/g, '2'));
}

export function checkInstructionQuality(source: string | undefined, target: string): Pick<TranslationQualityIssue, "type" | "message">[] {
  const issues: Pick<TranslationQualityIssue, "type" | "message">[] = [];
  const add = (type: TranslationQualityIssue["type"], message: string) => issues.push({ type, message });
  if (isInstructionFragment(target)) add("incomplete_instruction", "Câu EN bị cụt: chỉ có động từ, thiếu nội dung thao tác/điều kiện.");
  const body = stripInstructionPrefix(target);
  if (/^check\s+if\b/i.test(body)) {
    const clause = body.replace(/^check\s+if\s*/i, '').split(/[,;.!?]/)[0];
    const words = clause.match(/[\p{L}]+/gu) || [];
    if (!clause || (!finite.test(clause) && (words.length <= 3 || /^(?:the\s+)?(?:consistent|correct|no|free\s+of)\b/i.test(clause) || /\b(?:attached|aligned|positioned|centered|pressed|stitched|bonded)\b/i.test(clause)))) {
      add("incomplete_condition", "Sau Check if chưa có điều kiện hoàn chỉnh; cần kiểm tra chủ thể và động từ.");
    }
  }
  if (/\b(?:isn['’]t|is\s+not|aren['’]t|are\s+not)\s+(?:align|attach|stitch)\b/i.test(body)) add("incomplete_condition", "Cấu trúc động từ trong điều kiện EN chưa đúng; cần rà lại câu.");
  if (!source) return issues;
  const sourceBody = stripInstructionPrefix(source);
  const inspection = /^kiểm\s+tra\b/iu.test(sourceBody) || /(?:^|\s)có\s+.+\s+không[?.!]?$/iu.test(sourceBody);
  if (inspection && !/^check\s+if\b/i.test(body)) add("check_if_required", "Câu kiểm tra chưa dùng Check if + chủ thể + động từ + điều kiện đầy đủ.");
  const targetMeasures = new Set(measurements(target));
  const missing = measurements(source).filter(value => !targetMeasures.has(value));
  if (missing.length) add("missing_measurement", `Thông số/dung sai trong nguồn chưa được giữ đúng: ${[...new Set(missing)].join(', ')}.`);
  if (/không\s+(?:vượt|quá)|tối\s+đa/iu.test(source) && !/\b(?:not\s+exceed|no\s+more\s+than|at\s+most|maximum|up\s+to|within)\b|[≤<]=?/i.test(target)) add("missing_restriction", "Chưa xác nhận giới hạn tối đa trong câu EN; cần kiểm tra điều kiện chấp nhận.");
  if (modelSectionKey(source) && /^\s*[*•#]?\s*(?:đối\s+với|dành\s+cho|áp\s+dụng\s+cho)/iu.test(source) && /\bcutting\s+die\b/i.test(target) && !/dao|khuôn/iu.test(source)) add("unsupported_operation", "Tiêu đề VI chỉ phạm vi áp dụng theo model; EN thêm nội dung cutting die không có trong nguồn.");
  return issues;
}

/** Presence and quality are independent. Existing targets remain protected and unselected. */
export function refreshTranslationQuality(report: SmartAuditReport, sourceLang = 'vi', targetLang = 'en', additionalPairs: { id: string; sourceText: string; targetText: string; slideIndex?: number; protected?: boolean }[] = []): TranslationQualityReport {
  const quality: TranslationQualityReport = { passed: true, checkedPairs: 0, unpairedEnglishUnits: 0, semanticAssessment: "not_performed", issues: [] };
  if (sourceLang !== 'vi' || targetLang !== 'en') { report.translationQuality = quality; return quality; }
  const add = (source: string | undefined, target: string, unitId: string, sourceUnitId: string | undefined, slideIndex: number | undefined, protectedText = true) => {
    for (const issue of checkInstructionQuality(source, target)) quality.issues.push({ ...issue, unitId, sourceUnitId, slideIndex, sourceText: source, targetText: target, protected: protectedText });
  };
  const covered = new Set<string>();
  const knownPairs = new Set<string>();
  const pairKey = (source: string, target: string, slide?: number) => JSON.stringify([source, target, slide]);
  for (const unit of report.units) {
    if (vi(unit.sourceText) && unit.existingTranslation && !vi(unit.existingTranslation)) {
      quality.checkedPairs++;
      knownPairs.add(pairKey(unit.sourceText, unit.existingTranslation, unit.location.slideIndex));
      const targetId = unit.pairedUnitId || unit.id;
      const evidence = additionalPairs.find(pair => pair.sourceText === unit.sourceText && pair.targetText === unit.existingTranslation && pair.slideIndex === unit.location.slideIndex);
      add(unit.sourceText, unit.existingTranslation, targetId, unit.id, unit.location.slideIndex, evidence?.protected ?? true);
      if (unit.pairedUnitId) covered.add(unit.pairedUnitId);
    }
  }
  for (const pair of additionalPairs) {
    if (knownPairs.has(pairKey(pair.sourceText, pair.targetText, pair.slideIndex))) continue;
    knownPairs.add(pairKey(pair.sourceText, pair.targetText, pair.slideIndex));
    quality.checkedPairs++;
    const actual = report.units.find(unit => unit.location.slideIndex === pair.slideIndex && unit.sourceText === pair.targetText);
    if (actual) covered.add(actual.id);
    const sourceUnit = report.units.find(unit => unit.id === pair.id || unit.id === pair.id.split(":inline:")[0]);
    add(pair.sourceText, pair.targetText, actual?.id || sourceUnit?.id || pair.id, sourceUnit?.id || pair.id, pair.slideIndex, pair.protected ?? true);
  }
  for (const unit of report.units) {
    if (vi(unit.sourceText) || unit.status === 'NON_TRANSLATABLE' || covered.has(unit.id)) continue;
    quality.unpairedEnglishUnits++;
    add(undefined, unit.sourceText, unit.id, undefined, unit.location.slideIndex);
  }
  for (const unit of report.units) {
    const issues = quality.issues.filter(issue => issue.unitId === unit.id || issue.sourceUnitId === unit.id);
    unit.qualityIssues = issues.length ? issues : undefined;
    unit.qualityStatus = issues.length ? "review_required" : covered.has(unit.id) || Boolean(unit.existingTranslation) ? "no_rule_issues" : "not_assessed";
    if (!issues.length) continue;
    // Do not rewrite status/selection for inspection columns or original VI reference slides.
    if (unit.status !== 'NON_TRANSLATABLE' && !unit.location.isInspectionItem && !unit.location.isIsqReference) {
      if (!unit.existingTranslation && isInstructionFragment(unit.sourceText)) unit.status = 'REVIEW_REQUIRED';
      unit.safeToApply = false; unit.canApply = false;
      unit.reason = [...new Set(issues.map(issue => issue.message))].join(' ') + ' Giữ nguyên nội dung; cần duyệt chất lượng.';
      // A known translation is not a missing translation. A pre-existing selection for genuinely missing VI stays intact.
      if (unit.existingTranslation || !vi(unit.sourceText)) { unit.requiresTranslation = false; unit.selectedForTranslation = false; }
    }
  }
  quality.passed = quality.issues.length === 0;
  report.translationQuality = quality;
  return quality;
}

export function attachTranslationQualityGate(postFlight: PostFlightAuditReport, quality: TranslationQualityReport) {
  postFlight.translationQuality = quality;
  if (quality.passed) return;
  postFlight.passed = false;
  for (const issue of quality.issues) postFlight.issues.push({ slide: String(issue.slideIndex || '?'), type: 'translation_quality', message: issue.message, originalText: issue.sourceText, targetText: issue.targetText, autoRepaired: false });
}

export function translationQualityGroups(report: SmartAuditReport): TranslationAuditGroup[] {
  const grouped = new Map<string, TranslationQualityIssue[]>();
  for (const issue of report.translationQuality?.issues || []) grouped.set(issue.unitId, [...(grouped.get(issue.unitId) || []), issue]);
  return [...grouped].map(([id, issues]) => ({ id: `quality:${id}`, type: "language_quality", title: issues[0].sourceText || issues[0].targetText,
    unitIds: [...new Set(issues.flatMap(issue => [issue.unitId, ...(issue.sourceUnitId ? [issue.sourceUnitId] : [])]))].filter(id => report.units.some(unit => unit.id === id)),
    confidence: 0.95, reason: [...new Set(issues.map(issue => issue.message))].join(" "), safeToApply: false }));
}
