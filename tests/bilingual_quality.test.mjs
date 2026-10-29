import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';
import { checkInstructionQuality } from '../services/translation/translation-quality.ts';
import { bilingualScopes, structuralScopePairs, modelSectionKey } from '../services/translation/bilingual-alignment.ts';
import { hasVietnameseDiacritics } from '../services/translation/vietnamese-detector.ts';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';
import { DocumentTerminologyPlan } from '../services/terminology/document-plan.ts';
import { withDocumentTerminology } from '../services/translation/consistent-provider.ts';
const options = { sourceLang: 'vi', targetLang: 'en', mode: 'ipqc_bilingual', approvedGlossary: [], historyPairs: [], autoAiCascade: false };
const escapeXml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function deck(texts, inline = false) {
  const zip = new JSZip();
  const body = inline ? `<a:p><a:r><a:t>${texts.map(escapeXml).join('</a:t></a:r><a:br/><a:r><a:t>')}</a:t></a:r></a:p>` : texts.map(text => `<a:p><a:r><a:rPr sz="1400" b="1"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`).join('');
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({type: 'nodebuffer'});
}
const samples = [
['1.Place collar o’lay follow marking','2.Check time/pressure of heating','3.Check if consistent definition embossment, correct position and no white line visibility after pressing','For J-083-50-A','1.Accept off position 0.5mm (update QA manual)','1.Đặt liệu trang trí vòng cổ có ngay định vị không','2.Kiểm tra thời gian, lực ép','3.Liệu sau khi ép lập thể có nổi đều và không lệch và không nổi viền trắng sau khi ép','Đối với J-083-50-A','1.Chấp nhận mức độ tiêu chuẩn lệch 0.5mm (cập nhật qa manual)'],
['1.Stitching counter follow margin 2mm,SPI 9-10 stitches/inch','2.Stitching follow notches/pin holes','* With cutting die J-083-44-F','1. Stitching counter pay attention to show word side at out side collar LN, avoid excess word on finished shoes.','1.Kiểm tra may counter cách biên 2mm,9-10 /inch','2.Kiểm tra may counter phải ngay tâm','*Đối với J-083-44-F','1.May counter phần chữ ra ngoài lót vòng cổ tránh tình trạng ẩn chữ trên giày thành phẩm'],
['1. Fix components stitching follow notches/marking','2.Check if upper&lining attached line up','For J-083-67','Check joint stitching components (tip/vamp/tongue must be aligned, accept the close seam line isn’t align between the parts is +-0.5mm','1. Check','1.Kiểm tra bộ vị may ráp có ngay tâm định vị không','2.Kiểm tra mặt giày và lót có dán bằng mí không','Đối Với J-083-67','1.Kiểm tra máy ráp giữa các bộ vị mũi/mặt trước/lưỡi phải thẳng hàng, chấp nhận đường may dấu lệch giữa các bộ vị là +-0.5mm']
];

test('Example 1: model sections align across language blocks; repeated step 1 cannot steal the general step', async () => {
  const report = await auditPptxGaps(await deck(samples[0]), 'synthetic-model-block.pptx', options);
  for (const [viIndex, enIndex] of [[5, 0], [6, 1], [7, 2], [8, 3], [9, 4]]) {
    assert.equal(report.units[viIndex].existingTranslation, samples[0][enIndex]);
    assert.equal(report.units[viIndex].selectedForTranslation, false);
    assert.equal(report.units[viIndex].pairedUnitId, report.units[enIndex].id);
  }
  assert.equal(report.units[5].existingTranslation.includes('Accept off position'), false);
  assert.ok(report.translationQuality.issues.some(issue => issue.type === 'check_if_required'));
  assert.ok(report.translationQuality.issues.some(issue => issue.type === 'incomplete_condition'));
  assert.ok(report.groups.some(group => group.type === 'language_quality'));
});

test('Example 2: With cutting die and Đối với share a model scope but unsupported content is still flagged', async () => {
  const report = await auditPptxGaps(await deck(samples[1]), 'synthetic-model-heading.pptx', options);
  assert.equal(report.units[6].existingTranslation, samples[1][2]);
  assert.equal(report.units[7].existingTranslation, samples[1][3]);
  assert.ok(report.translationQuality.issues.some(issue => issue.type === 'unsupported_operation'));
  assert.equal(report.units[7].selectedForTranslation, false);
});

test('Example 3: orphan Check is flagged and cannot become a translation counterpart', async () => {
  const report = await auditPptxGaps(await deck(samples[2]), 'synthetic-fragment.pptx', options);
  assert.equal(report.units[5].existingTranslation, samples[2][0]);
  assert.equal(report.units[6].existingTranslation, samples[2][1]);
  assert.equal(report.units[8].existingTranslation, samples[2][3]);
  const fragment = report.units[4];
  assert.equal(fragment.pairedUnitId, undefined);
  assert.equal(fragment.status, 'REVIEW_REQUIRED');
  assert.equal(fragment.qualityStatus, 'review_required');
  assert.equal(fragment.selectedForTranslation, false);
  assert.ok(fragment.qualityIssues.some(issue => issue.type === 'incomplete_instruction'));
});

test('A translated presence status and a quality warning are independent', async () => {
  const report = await auditPptxGaps(await deck(['Kiểm tra thiết bị.', 'Check equipment.']), 'synthetic-quality.pptx', options);
  const source = report.units[0];
  assert.equal(source.status, 'ALREADY_TRANSLATED');
  assert.equal(source.qualityStatus, 'review_required');
  assert.equal(source.requiresTranslation, false);
  assert.equal(source.selectedForTranslation, false);
  assert.equal(report.translationQuality.passed, false);
  assert.equal(report.translationQuality.semanticAssessment, 'not_performed');
});

test('Inline blocks within one XML paragraph retain model boundaries and quality warnings', async () => {
  const report = await auditPptxGaps(await deck(samples[0], true), 'synthetic-inline.pptx', options);
  assert.ok(report.translationQuality.checkedPairs >= 5);
  assert.ok(report.translationQuality.issues.some(issue => issue.type === 'check_if_required'));
  assert.equal(report.units[0].qualityStatus, 'review_required');
  assert.equal(report.units[0].selectedForTranslation, false);
});

test('Different model IDs and ambiguous duplicate steps cannot be joined just because they share step 1', () => {
  const units = ['For Z-101-A', '1. Attach the panel.', 'Đối với Z-102-B', '1. Dán miếng.'].map((text, index) => ({ id: String(index), text }));
  const scopes = bilingualScopes(units, hasVietnameseDiacritics);
  assert.equal(scopes.flatMap(scope => structuralScopePairs(scope, hasVietnameseDiacritics)).length, 0);
  const ambiguous = { key: 'general', model: 'general', units: ['1. Attach panel.', '1. Inspect sole.', '1. Dán miếng.', '1. Kiểm tra đế.'].map((text, index) => ({ id: String(index), text })) };
  assert.equal(structuralScopePairs(ambiguous, hasVietnameseDiacritics).length, 0);
  assert.equal(modelSectionKey('For size #6-#9'), undefined);
});

test('Repeated model sections retain occurrence order independently in EN and VI', () => {
  const units = ['For Z-101-A', '1. First panel.', 'For Z-101-A', '1. Second panel.', 'Đối với Z-101-A', '1. Miếng đầu.', 'Đối với Z-101-A', '1. Miếng sau.'].map((text, index) => ({ id: String(index), text }));
  const pairs = bilingualScopes(units, hasVietnameseDiacritics).flatMap(scope => structuralScopePairs(scope, hasVietnameseDiacritics));
  assert.ok(pairs.some(([vi, en]) => vi.text === '1. Miếng đầu.' && en.text === '1. First panel.'));
  assert.ok(pairs.some(([vi, en]) => vi.text === '1. Miếng sau.' && en.text === '1. Second panel.'));
});

test('Quality checks preserve full Check if conditions and distinguish physical operations from inspections', () => {
  assert.deepEqual(checkInstructionQuality('Kiểm tra các bộ vị thẳng hàng.', 'Check if the components are aligned.'), []);
  assert.deepEqual(checkInstructionQuality('Dán miếng lên đế.', 'Attach the panel to the sole.'), []);
  assert.deepEqual(checkInstructionQuality(undefined, 'Counter stitching'), []);
  assert.ok(checkInstructionQuality('Kiểm tra các bộ vị thẳng hàng.', 'Check if aligned.').some(issue => issue.type === 'incomplete_condition'));
  assert.ok(checkInstructionQuality('Kiểm tra độ cao không vượt quá 2mm.', 'Check if height is 2mm.').some(issue => issue.type === 'missing_restriction'));
  assert.ok(checkInstructionQuality('Chấp nhận lệch +-0.5mm.', 'Accept offset 0.5mm.').some(issue => issue.type === 'missing_measurement'));
  assert.deepEqual(checkInstructionQuality('Chấp nhận lệch +-0.5mm.', 'Accept offset ±0.5 mm.'), []);
  assert.ok(checkInstructionQuality('Đặt cách biên 2mm.', 'Place at margin 3mm.').some(issue => issue.type === 'missing_measurement'));
});

test('Backend postflight flags quality defects while leaving excluded XML untouched', async () => {
  const buffer = await deck(['1. Check', 'Giữ nguyên đoạn này.']);
  const result = await pptxTranslatorService.translate(buffer, { sourceLanguage: 'vi', targetLanguage: 'en', mode: 'replace_en', fileName: 'synthetic-protected.pptx', translateMissingOnly: true, selectedUnitIds: [], provider: { name: 'unused', translate: async () => { throw Error('Excluded text must never reach a provider'); } } });
  const output = await JSZip.loadAsync(result.translatedBuffer);
  assert.equal(await output.file('ppt/slides/slide1.xml').async('string'), await (await JSZip.loadAsync(buffer)).file('ppt/slides/slide1.xml').async('string'));
  assert.equal(result.postFlight.passed, false);
  assert.equal(result.postFlight.translationQuality.passed, false);
  assert.ok(result.postFlight.issues.some(issue => issue.type === 'translation_quality'));
});

test('Selecting an EN quality defect translates its VI source and replaces only that EN slot in bilingual mode', async () => {
  const source = 'Kiểm tra thiết bị không vượt quá 2mm.';
  const badTarget = 'Check equipment 3mm.';
  const buffer = await deck([badTarget, source, 'Giữ nguyên thông số 5mm.']);
  const report = await auditPptxGaps(buffer, 'synthetic-selected-quality.pptx', options);
  const target = report.units.find(unit => unit.sourceText === badTarget);
  assert.equal(target.qualityStatus, 'review_required');
  const calls = [];
  const response = 'Check if the equipment does not exceed 2mm.';
  const provider = { name: 'quality-repair', translate: async request => { calls.push(request.sourceText); return { translatedText: response, provider: 'mock', durationMs: 0 }; },
    translateBatch: async request => { calls.push(...request.items.map(item => item.sourceText)); return { results: new Map(request.items.map(item => [item.id, response])), provider: 'mock', durationMs: 0 }; } };
  const result = await pptxTranslatorService.translate(buffer, { provider, sourceLanguage: 'vi', targetLanguage: 'en', mode: 'ipqc_bilingual', fileName: 'synthetic-selected-quality.pptx', translateMissingOnly: true, selectedUnitIds: [target.id] });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(text => text === source));
  const xml = await (await JSZip.loadAsync(result.translatedBuffer)).file('ppt/slides/slide1.xml').async('string');
  assert.equal(xml.includes(badTarget), false);
  assert.equal(xml.split(response).length - 1, 1);
  assert.ok(xml.includes(`<a:rPr sz="1400" b="1"/><a:t>${source}</a:t>`));
  assert.ok(xml.includes('Giữ nguyên thông số 5mm.'));
});

test('Fresh translations get one bounded quality retry using the same source and complete Check if conditions', async () => {
  const source = 'Kiểm tra bộ vị ngay tâm.';
  const plan = new DocumentTerminologyPlan([], [{ id: 'fresh', sourceText: source }]);
  const calls = [];
  const provider = withDocumentTerminology({ name: 'mock', translate: async request => {
    calls.push(request);
    return { translatedText: calls.length === 1 ? '1. Check' : 'Check if the component is centered.', provider: 'mock', durationMs: 0 };
  } }, plan);
  const response = await provider.translate({ unitId: 'fresh', sourceText: source, sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [] });
  assert.equal(calls.length, 2);
  assert.equal(response.translatedText, 'Check if the component is centered.');
  assert.match(calls[1].context, /complete subject and predicate/);
});

test('An entire bilingual paragraph starting with For is not mistaken for a standalone model heading', async () => {
  const texts = ['For Z-100-B', '1. Attach the panel.', 'Đối với Z-100-B', '1. Dán miếng.'];
  const report = await auditPptxGaps(await deck(texts, true), 'synthetic-inline-model.pptx', options);
  assert.ok(report.translationQuality.checkedPairs >= 2);
});

test('Selecting an orphan EN fragment cannot ask AI to invent a missing source condition', async () => {
  const buffer = await deck(['1. Check']);
  const report = await auditPptxGaps(buffer, 'synthetic-orphan.pptx', options);
  const result = await pptxTranslatorService.translate(buffer, { sourceLanguage: 'vi', targetLanguage: 'en', mode: 'replace_en', translateMissingOnly: true, selectedUnitIds: [report.units[0].id], fileName: 'synthetic-orphan.pptx',
    provider: { name: 'unused', translate: async () => { throw Error('No source, no invented condition'); } } });
  assert.equal(result.postFlight.translationQuality.passed, false);
  assert.ok(result.postFlight.translationQuality.issues.some(issue => issue.type === 'incomplete_instruction'));
});
