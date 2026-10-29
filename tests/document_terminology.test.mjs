import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DocumentTerminologyPlan, mandatoryTerminologyPrompt } from '../services/terminology/document-plan.ts';
import { validateTranslationTerminology } from '../services/terminology/validator.ts';
import { withDocumentTerminology } from '../services/translation/consistent-provider.ts';
import { TranslationCacheService } from '../services/translation/cache.ts';
import { DocumentTranslationMemory } from '../services/translation/document-tm.ts';
import { verifyPackagedTerminology } from '../services/terminology/output-verification.ts';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';
import { db } from '../services/database/db.ts';

const entry = (sourceTerm, targetTerm, extras = {}) => ({ id: `${sourceTerm}:${targetTerm}`, sourceTerm, targetTerm, sourceLanguage: 'vi', targetLanguage: 'en', status: 'approved', priority: 1, createdAt: '', updatedAt: '', ...extras });
const term = entry('mép liệu', 'component edge');
const alternative = entry('mép liệu', 'material border', { priority: 0 });
const unit = (id, sourceText, extras = {}) => ({ id, sourceText, scope: 'cutting', ...extras });

async function deck(texts) {
  const zip = new JSZip();
  const paragraphs = texts.map(text => `<a:p><a:r><a:rPr sz="1400" b="1"/><a:t>${text}</a:t></a:r></a:p>`).join('');
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Approved snapshot is deterministic; review entries do not become locked terms', () => {
  const review = entry('mép liệu', 'review border', { status: 'review', priority: 99 });
  const a = new DocumentTerminologyPlan([alternative, review, term]);
  const b = new DocumentTerminologyPlan([term, review, alternative]);
  assert.equal(a.version, b.version);
  assert.deepEqual(a.glossaryFor().map(e => e.targetTerm), ['component edge']);
  term.targetTerm = 'temporary mutation';
  assert.equal(a.glossaryFor()[0].targetTerm, 'component edge');
  term.targetTerm = 'component edge';
  const tm = new DocumentTranslationMemory();
  tm.initializeDocumentTM([], [review, term]);
  assert.equal(tm.lookup('mép liệu').target, 'component edge');
  assert.equal(tm.getAllEntries().some(e => e.target === 'review border'), false);
});

test('One source can have different legitimate meanings by scope; equal authority conflicts are reported', () => {
  const entries = [entry('miếng', 'panel', { context: 'stitching' }), entry('miếng', 'film', { context: 'nosew' })];
  const plan = new DocumentTerminologyPlan(entries, [unit('s1', 'miếng', { scope: 'stitching' }), unit('s2', 'miếng', { scope: 'nosew' })]);
  assert.equal(plan.glossaryFor('stitching')[0].targetTerm, 'panel');
  assert.equal(plan.glossaryFor('nosew')[0].targetTerm, 'film');
  assert.equal(plan.glossaryFor('general').length, 0);
  const report = plan.audit([{ id: 'ambiguous', sourceText: 'miếng', targetText: 'piece', scope: 'general' }]);
  assert.equal(report.groups[0].kind, 'glossary_conflict');
  assert.equal(report.passed, false);
});

test('Consistency groups a concept across different VI sentences and slides, including protected EN', () => {
  const plan = new DocumentTerminologyPlan([term, alternative]);
  const report = plan.audit([
    { id: 'a', slideIndex: 1, sourceText: 'Kiểm tra mép liệu bên trái.', targetText: 'Check if the component edge is even.' },
    { id: 'b', slideIndex: 9, sourceText: 'Kiểm tra mép liệu bên phải.', targetText: 'Check if the material border is even.', protected: true },
    { id: 'c', slideIndex: 12, sourceText: 'Mép liệu không đều.', targetText: 'Component edge; uneven material border.' },
    { id: 'd', sourceText: 'Thuật ngữ chưa có chuẩn.', targetText: 'Unknown technical label.' },
  ], 2);
  assert.equal(report.checkedConcepts, 1);
  assert.equal(report.unitsWithoutApprovedTerms, 1);
  assert.equal(report.englishOnlyUnitsWithoutSource, 2);
  assert.ok(report.groups.find(g => g.kind === 'variant').occurrences.some(o => o.slideIndex === 9 && o.protected));
  assert.ok(report.groups.find(g => g.kind === 'variant').occurrences.some(o => o.unitId === 'c'), 'A correct occurrence must not mask another variant in the same paragraph');
});

test('Generic approved label aliases normalize without changing predicates or other concepts', () => {
  const plan = new DocumentTerminologyPlan([term, alternative]);
  assert.equal(plan.repair('Mép liệu', 'Material border', 'general', 'vi', 'en').text.toLowerCase(), 'component edge');
  const withOtherConcept = new DocumentTerminologyPlan([term, alternative, entry('viền trang trí', 'material border')]);
  const text = withOtherConcept.repair('Mép liệu, viền trang trí', 'Component edge, material border', 'general', 'vi', 'en').text;
  assert.equal(text, 'Component edge, material border');
  const threads = new DocumentTerminologyPlan([entry('đứt chỉ', 'Broken thread')]);
  assert.equal(threads.audit([{ id: 't', sourceText: 'Kiểm tra đứt chỉ.', targetText: 'Check if the threads are broken.' }]).passed, true);
  assert.equal(validateTranslationTerminology('khớp', 'This is a benefit.', [entry('khớp', 'fit')]).isValid, false);
});

test('All relevant terms reach batch prompts, including terms beyond the old limit of 35', () => {
  const entries = Array.from({ length: 45 }, (_, i) => entry(`thuật ngữ ${i + 1}`, `canonical ${i + 1}`));
  const prompt = mandatoryTerminologyPrompt(entries.map(e => e.sourceTerm).join('; '), entries);
  assert.match(prompt, /canonical 45/);
  assert.equal(prompt.split('\n').filter(line => line.startsWith('{')).length, 45);
});

test('Provider retries only failed units with the same approved decisions, context and style references', async () => {
  const units = [unit('a', 'Kiểm tra mép liệu bên trái.'), unit('b', 'Kiểm tra mép liệu bên phải.')];
  const plan = new DocumentTerminologyPlan([term], units);
  const calls = [];
  const provider = withDocumentTerminology({ name: 'mock', translate: async () => { throw Error('unexpected'); }, translateBatch: async request => {
    calls.push(request);
    return { results: new Map(request.items.map(item => [item.id, item.id === 'b' && calls.length === 1 ? 'Check if the border is even.' : 'Check if the component edge is even.'])), provider: 'mock', durationMs: 0 };
  } }, plan);
  const internalExamples = [{ id: 'example' }];
  const result = await provider.translateBatch({ items: units, sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [], internalExamples });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].items.map(i => i.id), ['b']);
  assert.ok(calls.every(call => call.internalExamples === internalExamples && call.approvedTerminology[0].targetTerm === term.targetTerm));
  assert.match(calls[1].context, /cutting/);
  assert.match(result.results.get('b'), /component edge/);
});

test('Single retry and fallback providers share the document plan; ambiguity is not arbitrarily locked', async () => {
  const plan = new DocumentTerminologyPlan([term], [unit('one', 'Kiểm tra mép liệu.')]);
  let calls = 0;
  const failing = withDocumentTerminology({ name: 'primary', translate: async request => {
    calls++;
    assert.match(request.context, /cutting/);
    return { translatedText: 'Check if the border is even.', provider: 'primary', durationMs: 0 };
  } }, plan);
  await failing.translate({ unitId: 'one', sourceText: 'Kiểm tra mép liệu.', sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [] });
  assert.equal(calls, 2, 'One bounded repair attempt, never an endless retry');
  const fallback = withDocumentTerminology({ name: 'fallback', translate: async request => ({ translatedText: request.approvedTerminology[0].targetTerm, provider: 'fallback', durationMs: 0 }) }, plan);
  assert.equal((await fallback.translate({ unitId: 'one', sourceText: 'Kiểm tra mép liệu.', sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [] })).translatedText.toLowerCase(), 'component edge');
});

test('Cache deduplicates only within the same glossary version and scope', () => {
  const cache = new TranslationCacheService();
  cache.clear();
  const items = [unit('a', 'Miếng', { scope: 'nosew' }), unit('b', 'Miếng', { scope: 'stitching' }), unit('c', 'Miếng', { scope: 'nosew' })];
  const namespace = item => `v1:${item.scope}`;
  const work = cache.deduplicateItems(items, 'vi', 'en', undefined, false, namespace);
  assert.equal(work.uniqueToTranslate.length, 2);
  const resolved = work.resolveAll(new Map([['a', 'film'], ['b', 'panel']]));
  assert.equal(resolved.get('c'), 'film');
  assert.equal(resolved.get('b'), 'panel');
  assert.equal(cache.get('Miếng', 'vi', 'en', 'v2:nosew'), undefined);
  assert.equal(cache.get('Miếng', 'vi', 'en', 'v1:nosew'), 'film');
  cache.clear();
});

test('Packaged verification uses actual XML and reports a lost or rewritten target', async () => {
  const buffer = await deck(['Component edge', 'Actual changed target']);
  const result = await verifyPackagedTerminology(buffer, [
    { id: 'ok', sourceText: 'Mép liệu', targetText: 'Old edge', partPath: 'ppt/slides/slide1.xml' },
    { id: 'lost', sourceText: 'Mép liệu bên trái', targetText: 'Missing target', partPath: 'ppt/slides/slide1.xml' },
  ], [{ slide: '1', type: 'typo_repair', originalText: 'Old edge', targetText: 'Component edge', autoRepaired: true }]);
  assert.equal(result.observations[0].targetText, 'Component edge');
  assert.equal(result.unverified[0].kind, 'unverified_output');
  assert.equal(result.unverified[0].occurrences[0].unitId, 'lost');
});

test('Smart Audit checks protected bilingual English instead of treating English as proof of glossary compliance', async () => {
  const buffer = await deck(['Kiểm tra mép liệu bên trái.', 'Check if the border on the left is even.']);
  const report = await auditPptxGaps(buffer, 'synthetic-pairs.pptx', { sourceLang: 'vi', targetLang: 'en', mode: 'ipqc_bilingual', approvedGlossary: [term], historyPairs: [], autoAiCascade: false });
  const group = report.terminologyConsistency.groups.find(g => g.sourceTerm === term.sourceTerm);
  assert.ok(group);
  assert.equal(group.occurrences[0].protected, true);
  assert.equal(report.units.find(u => u.sourceText.startsWith('Kiểm tra')).selectedForTranslation, false);
});

test('Postflight re-scan retains the scope of identical VI sentences on different manufacturing stages', async () => {
  const source = 'Kiểm tra miếng.';
  const glossary = [entry('miếng', 'panel', { context: 'stitching' }), entry('miếng', 'film', { context: 'nosew' })];
  const plan = new DocumentTerminologyPlan(glossary, [unit('first', source, { scope: 'stitching' }), unit('second', source, { scope: 'nosew' })]);
  const zip = await JSZip.loadAsync(await deck([source, 'Check if the panel is clean.']));
  const other = await JSZip.loadAsync(await deck([source, 'Check if the film is clean.']));
  zip.file('ppt/slides/slide2.xml', await other.file('ppt/slides/slide1.xml').async('string'));
  const report = await auditPptxGaps(await zip.generateAsync({ type: 'nodebuffer' }), 'synthetic-stages.pptx', {
    sourceLang: 'vi', targetLang: 'en', mode: 'ipqc_bilingual', approvedGlossary: glossary, historyPairs: [], autoAiCascade: false,
    terminologyPlan: plan, terminologyScopeByPart: { 'ppt/slides/slide1.xml': 'stitching', 'ppt/slides/slide2.xml': 'nosew' },
  });
  assert.equal(report.terminologyConsistency.checkedUnits, 2);
  assert.equal(report.terminologyConsistency.passed, true);
});

test('Rebuilding an edited file runs terminology checks against the packaged text', async () => {
  const original = db.getApprovedTerminology;
  db.getApprovedTerminology = () => [term];
  try {
    const input = await deck(['Kiểm tra mép liệu bên trái.']);
    const { slides } = await pptxTranslatorService.crawl(input, { includeMarkitdown: false });
    slides[0].paragraphs[0].translatedText = 'Check if the border is even.';
    let postFlight;
    await pptxTranslatorService.rebuildWithTranslations(input, slides, 'replace_en', 'synthetic-edited.pptx', 'en', undefined, report => { postFlight = report; });
    assert.equal(postFlight.passed, false);
    assert.ok(postFlight.terminologyConsistency.groups.some(group => group.sourceTerm === 'mép liệu'));
    assert.ok(postFlight.terminologyConsistency.groups[0].occurrences.some(occurrence => occurrence.protected));
  } finally { db.getApprovedTerminology = original; }
});

test('PPTX integration reports unresolved terminology in the backend without rewriting excluded paragraphs', async () => {
  const original = db.getApprovedTerminology;
  db.getApprovedTerminology = () => [term];
  try {
    const source = 'Kiểm tra mép liệu bên trái.';
    const excluded = 'Giữ nguyên thông số 3mm.';
    const buffer = await deck([source, excluded]);
    const scan = await auditPptxGaps(buffer, 'synthetic-selection.pptx', { sourceLang: 'vi', targetLang: 'en', mode: 'replace_en', approvedGlossary: [term], historyPairs: [], autoAiCascade: false });
    const id = scan.units.find(u => u.sourceText === source).id;
    const response = { translatedText: 'Check if the border is even.', provider: 'mock', durationMs: 0 };
    const provider = { name: 'mock', translate: async () => response, translateBatch: async request => ({ ...response, results: new Map(request.items.map(item => [item.id, response.translatedText])) }) };
    const result = await pptxTranslatorService.translate(buffer, { provider, sourceLanguage: 'vi', targetLanguage: 'en', mode: 'replace_en', fileName: 'synthetic-selection.pptx', translateMissingOnly: true, selectedUnitIds: [id] });
    assert.equal(result.postFlight.passed, false);
    assert.equal(result.postFlight.terminologyConsistency.passed, false);
    assert.ok(result.postFlight.issues.some(issue => issue.type === 'terminology'));
    const xml = await (await JSZip.loadAsync(result.translatedBuffer)).file('ppt/slides/slide1.xml').async('string');
    assert.match(xml, /<a:rPr sz="1400" b="1"\/><a:t>Giữ nguyên thông số 3mm\.<\/a:t>/);
    assert.match(xml, /Check if/);
  } finally { db.getApprovedTerminology = original; }
});
