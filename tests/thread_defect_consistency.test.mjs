import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { enforceTerminologyCompliance } from '../services/terminology/enforcer.ts';
import { checkGlossaryTranslation } from '../services/terminology/audit-compliance.ts';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';
import { validateTranslationTerminology } from '../services/terminology/validator.ts';

const glossary = [{ id: 'thread', sourceTerm: 'Đứt chỉ', targetTerm: 'Broken thread', sourceLanguage: 'vi', targetLanguage: 'en', status: 'approved', priority: 1, createdAt: '', updatedAt: '' }];
const enforce = (source, target) => enforceTerminologyCompliance(source, target, glossary, 'vi', 'en');

test('The same thread defect label does not alternate breaking and breakage', () => {
  for (const label of ['Breaking, fraying', 'Breakage, fraying', 'Thread breaking, fraying', 'Thread breakage, fraying']) {
    const result = enforce('Đứt chỉ, tưa biên', label);
    assert.equal(result.text, 'Broken thread, fraying');
    assert.ok(result.replacements.length > 0);
  }
});

test('One compliant occurrence does not mask another inconsistent thread label', () => {
  const result = enforce('Đứt chỉ, tưa biên', 'Broken thread; thread breakage; fraying');
  assert.doesNotMatch(result.text, /breakage|breaking/i);
  assert.match(result.text, /fraying/);
});

test('The thread rule preserves grammatical predicates, numbers and other broken objects', () => {
  assert.equal(enforce('Kiểm tra đứt chỉ ở vị trí 2mm.', 'Check if the threads are broken at 2mm.').text, 'Check if the threads are broken at 2mm.');
  assert.equal(enforce('Kiểm tra đứt chỉ.', 'Check if the threads are breaking.').text, 'Check if the threads are breaking.');
  assert.equal(enforce('Kiểm tra lực đứt chỉ 10N.', 'Check if thread breaking strength exceeds 10N.').text, 'Check if thread breaking strength exceeds 10N.');
  assert.equal(validateTranslationTerminology('Kiểm tra đứt chỉ.', 'Check if the threads are broken.', glossary).isValid, true);
  assert.equal(enforce('Gãy kim, đứt chỉ', 'Needle breaking, thread breakage').text, 'Needle breaking, broken thread');
  assert.equal(enforce('Nứt liệu, tưa biên', 'Material breakage, fraying').text, 'Material breakage, fraying');
});

test('Smart Audit corrects a reused thread label using the approved VI source', async () => {
  const source = 'Đứt chỉ, tưa biên';
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>${source}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  const report = await auditPptxGaps(await zip.generateAsync({ type: 'nodebuffer' }), 'thread-labels.pptx', {
    sourceLang: 'vi', targetLang: 'en', mode: 'replace_en', approvedGlossary: glossary,
    historyPairs: [{ source, target: 'Breaking, fraying', origin: 'history' }],
  });
  assert.equal(report.units[0].suggestedTranslation, 'Broken thread, fraying');
  const checked = checkGlossaryTranslation(source, report.units[0].suggestedTranslation, glossary, 'vi', 'en');
  assert.equal(checked.isValid, true);
});
