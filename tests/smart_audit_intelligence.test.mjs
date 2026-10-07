import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { auditPptxGaps, isNonTranslatable } from "../services/translation/smart-detector.ts";
import { auditSimilarity, AuditMemoryIndex, chooseAuditMatch, vietnameseQuality } from "../services/translation/audit-intelligence.ts";
import { applyPptxAuditSuggestions } from "../services/translation/pptx-smart-audit.ts";
import { paragraphText, replaceParagraphText, canReplaceParagraphText } from "../services/documents/pptx-text.ts";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { DocumentTranslationMemory } from "../services/translation/document-tm.ts";
import { translationCache } from "../services/translation/cache.ts";

const options = { sourceLang: "en", targetLang: "vi", approvedGlossary: [], historyPairs: [] };
const escape = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const p = (t, attrs = '') => `<a:p><a:pPr algn="l"/><a:r><a:rPr ${attrs}/><a:t>${escape(t)}</a:t></a:r></a:p>`;
const shape = (...texts) => `<p:sp><p:nvSpPr><p:cNvPr id="7" name="Test"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr wrap="none"/><a:lstStyle/>${texts.map((t) => t.startsWith('<a:p') ? t : p(t)).join('')}</p:txBody></p:sp>`;
async function deck(slides) {
  const zip = new JSZip();
  slides.forEach((content, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${content}</p:spTree></p:cSld><p:timing><p:tnLst/></p:timing></p:sld>`));
  zip.file('ppt/theme/theme1.xml', '<a:theme name="Preserved"/>');
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId9" Type="hyperlink" Target="https://example.test" TargetMode="External"/></Relationships>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Audit intelligence: casing, punctuation, line breaks and split runs reuse a current PPTX pair', async () => {
  const split = '<a:p><a:r><a:rPr b="1"/><a:t>Emergency</a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:t>Stop</a:t></a:r></a:p>';
  const newline = '<a:p><a:r><a:t>Emergency</a:t></a:r><a:br/><a:r><a:t>Stop</a:t></a:r></a:p>';
  const buffer = await deck([shape('Emergency Stop', 'Dừng khẩn cấp'), shape('EMERGENCY STOP') + shape('Emergency  Stop!') + shape(split) + shape(newline)]);
  const report = await auditPptxGaps(buffer, 'reuse.pptx', options);
  const later = report.units.filter((u) => u.location.slideIndex === 2);
  for (const unit of later) {
    assert.equal(unit.status, 'TM_REUSE');
    assert.equal(unit.suggestedTranslation, 'Dừng khẩn cấp');
    assert.ok(unit.confidence >= .94);
    assert.equal(unit.matches[0].slideIndex, 1);
  }
  assert.equal(later[2].canApply, false, 'Mixed formatting requires review for a length-changing translation');
  assert.equal(later[3].canApply, false, 'Explicit breaks remain untouched');
  assert.equal(report.estimatedGeminiRequests, 0);
});

test('Audit intelligence: missing/wrong accents, joined words and spacing form one Vietnamese review cluster', async () => {
  const variants = ['Kiễm tra thiết bị', 'Kiem tra thiet bi', 'Kiểmtra thiết bị', 'Kiểm tra thiếtbi', 'Kiểm tra  thiết bị', 'KIỂM TRA THIẾT BỊ'];
  const buffer = await deck([shape('Kiểm tra thiết bị'), variants.map((t) => shape(t)).join('')]);
  const report = await auditPptxGaps(buffer, 'variants.pptx', options);
  for (const text of variants) {
    const unit = report.units.find((u) => u.sourceText === text);
    assert.equal(unit.status, 'SUSPICIOUS_TRANSLATION', text);
    assert.equal(unit.suggestedTranslation.toLowerCase(), 'kiểm tra thiết bị');
    assert.equal(unit.selectedForTranslation, false);
  }
  assert.equal(report.groups.filter((g) => g.type === 'language_quality').length, 1);
  assert.equal(report.needsTranslationCount, 0);
  assert.equal(report.units.find((u) => u.sourceText === variants[0]).safeToApply, false);
});

test('Audit intelligence: mixed Vietnamese sentence identifies suspicious segments', async () => {
  const text = 'Vui lòng kiem tra thiếtbi trước khi vận hành.';
  const quality = vietnameseQuality(text);
  assert.deepEqual(quality.segments, ['kiem tra', 'thiếtbi']);
  assert.equal(quality.suggestion, 'Vui lòng kiểm tra thiết bị trước khi vận hành.');
  const report = await auditPptxGaps(await deck([shape(text)]), 'mixed.pptx', options);
  assert.equal(report.units[0].status, 'SUSPICIOUS_TRANSLATION');
  assert.equal(report.units[0].safeToApply, false);
  assert.deepEqual(report.units[0].suspiciousSegments, ['kiem tra', 'thiếtbi']);
  assert.equal(report.needsTranslationCount, 0);
});

test('Audit intelligence: intentional technical text and unknown Latin names are conservative', async () => {
  const technical = ['PLC', 'USB', 'Wi-Fi', 'ABB ACS580', 'HTTP', 'AC 220V', 'ISO 9001', '5 mm'];
  technical.forEach((text) => assert.equal(isNonTranslatable(text), true, text));
  assert.equal(isNonTranslatable('Emergency-Stop'), false);
  const report = await auditPptxGaps(await deck([technical.map((t) => shape(t)).join('') + shape('Nguyen Van Minh') + shape('Emergency Stop')]), 'codes.pptx', options);
  assert.equal(report.units.find((u) => u.sourceText === 'Nguyen Van Minh').status, 'REVIEW_REQUIRED');
  assert.equal(report.units.find((u) => u.sourceText === 'Emergency Stop').status, 'NEEDS_TRANSLATION');
});

test('Audit intelligence: English embedded in Vietnamese is reviewed, not considered translated', async () => {
  const report = await auditPptxGaps(await deck([shape('Vui lòng thực hiện Emergency Stop khi có sự cố.')]), 'partial.pptx', options);
  assert.equal(report.units[0].status, 'MIXED_LANGUAGE');
  assert.equal(report.units[0].selectedForTranslation, false);
});

test('Audit intelligence: conflicting targets are grouped with counts; approval outranks frequency', async () => {
  const content = [shape('Emergency Stop', 'Dừng khẩn cấp'), ...Array.from({ length: 3 }, () => shape('Emergency Stop', 'Ngừng khẩn cấp'))];
  const approvedGlossary = [{ id: 'approved', sourceTerm: 'Emergency Stop', targetTerm: 'Dừng khẩn cấp', status: 'approved', sourceLanguage: 'en', targetLanguage: 'vi' }];
  const report = await auditPptxGaps(await deck(content), 'consistency.pptx', { ...options, approvedGlossary });
  const group = report.groups.find((g) => g.type === 'consistency');
  assert.equal(group.suggestedTranslation, 'Dừng khẩn cấp');
  assert.equal(group.unitIds.length, 3);
  assert.equal(group.variants.find((v) => v.text === 'Ngừng khẩn cấp').count, 3);
  assert.equal(group.variants.find((v) => v.text === 'Dừng khẩn cấp').approved, true);
  assert.equal(group.safeToApply, false);
});

test('Audit intelligence: source conflicts never silently select the first translation', async () => {
  const report = await auditPptxGaps(await deck([shape('Emergency Stop', 'Dừng khẩn cấp'), shape('Emergency Stop', 'Ngừng khẩn cấp'), shape('EMERGENCY STOP')]), 'conflict.pptx', options);
  const unit = report.units.find((u) => u.sourceText === 'EMERGENCY STOP');
  assert.equal(unit.status, 'TRANSLATION_CONFLICT');
  assert.equal(unit.safeToApply, false);
});

test('Audit intelligence: crowded containers do not hide an unmatched source', async () => {
  const report = await auditPptxGaps(await deck([shape('Emergency Stop', 'Dừng khẩn cấp', 'Safety Instructions')]), 'crowded.pptx', options);
  const unit = report.units.find((u) => u.sourceText === 'Safety Instructions');
  assert.equal(unit.status, 'NEEDS_TRANSLATION');
});

test('Audit intelligence: a bilingual paragraph supplies reusable memory without requiring labels', async () => {
  const bilingual = '<a:p><a:r><a:t>Safety Instructions</a:t></a:r><a:br/><a:r><a:t>Hướng dẫn an toàn</a:t></a:r></a:p>';
  const report = await auditPptxGaps(await deck([shape(bilingual), shape('SAFETY INSTRUCTIONS')]), 'inline.pptx', options);
  assert.equal(report.units[0].status, 'ALREADY_TRANSLATED');
  assert.equal(report.units[1].suggestedTranslation, 'Hướng dẫn an toàn');
  assert.equal(report.units[1].status, 'TM_REUSE');
});

test('Audit intelligence: fuzzy spelling remains review-only and context-sensitive words are not safe', () => {
  const index = new AuditMemoryIndex([{ source: 'Emergency Stop', target: 'Dừng khẩn cấp', origin: 'presentation' }]);
  const fuzzy = chooseAuditMatch(index.lookup('Emergenci Stop'));
  assert.ok(fuzzy.match);
  assert.equal(fuzzy.safe, false);
  const single = chooseAuditMatch(new AuditMemoryIndex([{ source: 'Open', target: 'Mở', origin: 'presentation' }]).lookup('Open'));
  assert.equal(single.safe, false);
  for (const [a, b] of [['Check 5 mm', 'Check 6 mm'], ['Stop machine', 'Do not stop machine'], ['Check left device', 'Check right device'], ['Before inspection', 'After inspection']]) assert.equal(auditSimilarity(a, b), 0);
  assert.ok(auditSimilarity('Final Inspection Report', 'Final Inspection') < .78);
});

test('Audit intelligence: history stays review-only, user corrections override it, and custom TM is not cleared', async () => {
  const buffer = await deck([shape('Emergency Stop')]);
  const history = [{ source: 'Emergency Stop', target: 'Ngừng khẩn cấp', origin: 'history', fileName: 'old.pptx' }];
  const report = await auditPptxGaps(buffer, 'history.pptx', { ...options, historyPairs: history });
  assert.equal(report.units[0].status, 'POSSIBLE_TRANSLATION');
  assert.equal(report.units[0].safeToApply, false);
  const corrected = await auditPptxGaps(buffer, 'corrected.pptx', { ...options, historyPairs: [...history, { source: 'Emergency Stop', target: 'Dừng khẩn cấp', origin: 'correction' }] });
  assert.equal(corrected.units[0].suggestedTranslation, 'Dừng khẩn cấp');
  assert.equal(corrected.units[0].safeToApply, true);
  const tm = new DocumentTranslationMemory();
  tm.recordTranslation('Emergency Stop', 'Dừng khẩn cấp', {}, 'DOCUMENT');
  const withTM = await auditPptxGaps(buffer, 'custom.pptx', { ...options, customDocTM: tm });
  assert.equal(withTM.units[0].suggestedTranslation, 'Dừng khẩn cấp');
  assert.equal(tm.getAllEntries().length, 1);
});

test('Audit intelligence: exact preview apply preserves all metadata and unselected duplicate occurrences', async () => {
  const styled = p('EMERGENCY STOP', 'b="1" i="1" sz="2000"');
  const buffer = await deck([shape('Emergency Stop', 'Dừng khẩn cấp'), '<p:grpSp>' + shape(styled) + shape(styled) + '</p:grpSp>']);
  const report = await auditPptxGaps(buffer, 'integrity.pptx', options);
  const selected = report.units.find((u) => u.location.slideIndex === 2);
  const expectedSuggestions = [{ id: selected.id, sourceText: selected.sourceText, suggestedTranslation: selected.suggestedTranslation }];
  const result = await applyPptxAuditSuggestions(buffer, 'integrity.pptx', [selected.id], { ...options, expectedSuggestions });
  assert.equal(result.appliedCount, 1);
  const before = await JSZip.loadAsync(buffer), after = await JSZip.loadAsync(result.buffer);
  for (const part of Object.keys(before.files).filter((p) => !before.files[p].dir)) {
    const original = await before.file(part).async('string'), updated = await after.file(part).async('string');
    if (part !== 'ppt/slides/slide2.xml') assert.equal(updated, original, part);
    else {
      assert.equal(updated.replace(/<a:t>[\s\S]*?<\/a:t>/g, '<a:t/>'), original.replace(/<a:t>[\s\S]*?<\/a:t>/g, '<a:t/>'));
      assert.equal((updated.match(/Dừng khẩn cấp/g) || []).length, 1);
      assert.equal((updated.match(/EMERGENCY STOP/g) || []).length, 1);
    }
  }
  await assert.rejects(applyPptxAuditSuggestions(buffer, 'integrity.pptx', [selected.id], { ...options, expectedSuggestions: [{ ...expectedSuggestions[0], suggestedTranslation: 'stale' }] }), /quét lại/);
  await assert.rejects(applyPptxAuditSuggestions(buffer, 'integrity.pptx', ['not_a_real_id'], options), /quét lại/);
});

test('DrawingML reconstruction decodes entities and preserves empty runs and paragraph IDs', async () => {
  assert.equal(paragraphText('<a:p><a:r><a:t>Check &amp; inspect &#x111;&#7875;</a:t></a:r><a:br/><a:r><a:t>USB</a:t></a:r></a:p>'), 'Check & inspect để\nUSB');
  const xml = '<a:p><a:r><a:rPr b="1"/><a:t>Kiễm</a:t></a:r><a:r><a:rPr b="0"/><a:t> tra thiết bị</a:t></a:r></a:p>';
  assert.equal(canReplaceParagraphText(xml, 'Kiểm tra thiết bị'), true);
  const fixed = replaceParagraphText(xml, 'Kiểm tra thiết bị');
  assert.match(fixed, /b="1"\/><a:t>Kiểm/);
  assert.match(fixed, /b="0"\/><a:t> tra thiết bị/);
  const buffer = await deck([shape('<a:p/>', 'Emergency Stop')]);
  const report = await auditPptxGaps(buffer, 'ids.pptx', options);
  const crawled = await pptxTranslatorService.crawl(buffer, { includeMarkitdown: false });
  assert.equal(report.units[0].id, crawled.slides[0].paragraphs[0].id);
});

test('Incremental translation respects exact selection rather than expanding to duplicate text', async () => {
  const text = 'Please check equipment';
  const buffer = await deck([shape(text) + shape(text)]);
  const report = await auditPptxGaps(buffer, 'selection.pptx', options);
  translationCache.clear();
  let sent = 0;
  const provider = { name: 'mock', translateBatch: async ({ items }) => { sent += items.length; return { results: new Map(items.map((item) => [item.id, 'Vui lòng kiểm tra thiết bị'])), provider: 'mock', durationMs: 0 }; }, translate: async () => ({ translatedText: 'Vui lòng kiểm tra thiết bị', provider: 'mock', durationMs: 0 }) };
  const result = await pptxTranslatorService.translate(buffer, { sourceLanguage: 'en', targetLanguage: 'vi', mode: 'replace_en', fileName: 'selection.pptx', provider, translateMissingOnly: true, selectedUnitIds: [report.units[0].id] });
  const after = await JSZip.loadAsync(result.translatedBuffer);
  const xml = await after.file('ppt/slides/slide1.xml').async('string');
  assert.equal((xml.match(/Vui lòng kiểm tra thiết bị/g) || []).length, 1);
  assert.equal((xml.match(/Please check equipment/g) || []).length, 1);
  assert.equal(sent, 1);
  assert.match(xml, /wrap="none"/);
});

test('Audit intelligence: repeated large-deck content is grouped and request estimates deduplicate', async () => {
  const buffer = await deck(Array.from({ length: 60 }, () => Array.from({ length: 15 }, () => shape('Please check equipment')).join('')));
  const report = await auditPptxGaps(buffer, 'large.pptx', options);
  assert.equal(report.totalUnits, 900);
  assert.equal(report.groups.length, 1);
  assert.equal(report.estimatedGeminiRequests, 1);
});

test('Incremental bilingual output preserves source paragraphs and adds only the selected translation', async () => {
  translationCache.clear();
  const buffer = await deck([shape('Please check equipment') + shape('Safety Instructions')]);
  const report = await auditPptxGaps(buffer, 'bilingual.pptx', options);
  const provider = { name: 'mock', translateBatch: async ({ items }) => ({ results: new Map(items.map((item) => [item.id, 'Vui lòng kiểm tra thiết bị'])), provider: 'mock', durationMs: 0 }) };
  const result = await pptxTranslatorService.translate(buffer, { sourceLanguage: 'en', targetLanguage: 'vi', provider, fileName: 'bilingual.pptx', mode: 'ipqc_bilingual', translateMissingOnly: true, selectedUnitIds: [report.units[0].id] });
  const after = await JSZip.loadAsync(result.translatedBuffer);
  const xml = await after.file('ppt/slides/slide1.xml').async('string');
  assert.equal((xml.match(/<a:p>/g) || []).length, 3);
  assert.ok(xml.indexOf('Please check equipment') < xml.indexOf('Vui lòng kiểm tra thiết bị'));
  assert.equal((xml.match(/Safety Instructions/g) || []).length, 1);
});

test('Audit intelligence: unanchored single words and already-translated pairs cannot be auto-applied', async () => {
  const report = await auditPptxGaps(await deck([shape('Open'), shape('Emergency Stop', 'Dừng khẩn cấp')]), 'ambiguous.pptx', options);
  assert.equal(report.units.find((u) => u.sourceText === 'Open').status, 'REVIEW_REQUIRED');
  assert.equal(report.units.find((u) => u.sourceText === 'Emergency Stop').canApply, false);
});

test('Audit intelligence: actual source/target observations retain their trust status', async () => {
  const tm = new DocumentTranslationMemory();
  await auditPptxGaps(await deck([shape('Emergency Stop', 'Dừng khẩn cấp')]), 'trust.pptx', { ...options, customDocTM: tm });
  assert.equal(tm.getAllEntries()[0].status, 'ESTABLISHED');
});

test('Audit intelligence: mixed formatting allows translation while direct spelling edits stay restricted', async () => {
  const xml = '<a:p><a:r><a:rPr b="1"/><a:t>Please check</a:t></a:r><a:r><a:rPr b="0"/><a:t> equipment</a:t></a:r></a:p>';
  const report = await auditPptxGaps(await deck([shape(xml)]), 'mixed-format.pptx', options);
  assert.equal(report.units[0].status, 'NEEDS_TRANSLATION');
  assert.equal(report.units[0].selectedForTranslation, true);
  assert.equal(report.units[0].canApply, false);
});

test('Untranslated source remains selectable when history has conflicting translations or approved reuse', async () => {
  const source = 'Kiểm tra thiết bị trước khi vận hành';
  const report = await auditPptxGaps(await deck([shape(source), shape('Safety Instructions')]), 'missing-history.pptx', {
    sourceLang: 'vi', targetLang: 'en', approvedGlossary: [], historyPairs: [
      { source, target: 'Check equipment before operation', origin: 'history' },
      { source, target: 'Inspect equipment before running', origin: 'history' },
    ],
  });
  assert.equal(report.units[0].status, 'TRANSLATION_CONFLICT');
  assert.equal(report.units[0].requiresTranslation, true);
  assert.equal(report.units[0].selectedForTranslation, true);
  assert.equal(report.units[1].selectedForTranslation, false);
  assert.equal(report.untranslatedCount, 1);
  assert.equal(report.translatableMissingCount, 1);
  assert.equal(report.estimatedGeminiRequests, 1);
  const approved = await auditPptxGaps(await deck([shape(source)]), 'approved-missing.pptx', {
    sourceLang: 'vi', targetLang: 'en', historyPairs: [],
    approvedGlossary: [{ sourceTerm: source, targetTerm: 'Check equipment before operation', status: 'approved' }],
  });
  assert.equal(approved.units[0].status, 'LOCKED_TERMINOLOGY');
  assert.equal(approved.units[0].selectedForTranslation, true);
});

test('Proofing metadata does not block text repair, but actual font and color differences do', () => {
  const xml = '<a:p><a:r><a:rPr lang="vi-VN" sz="1200" err="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Kiểm tra</a:t></a:r><a:r><a:rPr lang="en-US" sz="1200"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t> thiết bị</a:t></a:r></a:p>';
  assert.equal(canReplaceParagraphText(xml, 'Inspect equipment'), true);
  const edited = replaceParagraphText(xml, 'Inspect equipment');
  assert.equal(paragraphText(edited), 'Inspect equipment');
  assert.equal(edited.replace(/<a:t>[\s\S]*?<\/a:t>/g, '<a:t/>'), xml.replace(/<a:t>[\s\S]*?<\/a:t>/g, '<a:t/>'));
  assert.equal(canReplaceParagraphText(xml.replace('typeface="Arial"', 'typeface="Calibri"'), 'Inspect equipment'), false);
  assert.equal(canReplaceParagraphText(xml.replace('val="FF0000"', 'val="0000FF"'), 'Inspect equipment'), false);
});

test('Mixed formatting with trailing whitespace is selectable for translation but not direct reuse', async () => {
  const xml = '<a:p><a:r><a:rPr b="1"/><a:t>Please check</a:t></a:r><a:r><a:rPr b="0"/><a:t> equipment </a:t></a:r></a:p>';
  const report = await auditPptxGaps(await deck([shape(xml)]), 'trailing-space.pptx', options);
  assert.equal(report.units[0].requiresTranslation, true);
  assert.equal(report.units[0].selectedForTranslation, true);
  assert.equal(report.units[0].canApply, false);
  assert.equal(report.untranslatedCount, 1);
  assert.equal(report.translatableMissingCount, 1);
});

test('Conflicting cached translations can be bypassed without losing deduplication or clearing other text', () => {
  translationCache.clear();
  translationCache.set('Please check equipment', 'Old translation', 'en', 'vi');
  translationCache.set('Safety Instructions', 'Hướng dẫn an toàn', 'en', 'vi');
  const batch = translationCache.deduplicateItems([
    {id:'a',sourceText:'Please check equipment'}, {id:'b',sourceText:'Please check equipment'},
    {id:'c',sourceText:'Safety Instructions'},
  ], 'en', 'vi', new Set(['Please check equipment']));
  assert.deepEqual(batch.uniqueToTranslate.map(i=>i.id), ['a']);
  const resolved = batch.resolveAll(new Map([['a','New translation']]));
  assert.equal(resolved.get('a'), 'New translation');
  assert.equal(resolved.get('b'), 'New translation');
  assert.equal(resolved.get('c'), 'Hướng dẫn an toàn');
});

test('Incremental repair translates selected source only and returns a fresh audit of the output', async () => {
  translationCache.clear();
  const source = 'Vui lòng kiểm tra thiết bị';
  const buffer = await deck([shape(source), shape('Safety Instructions')]);
  let sent = [];
  const provider = { name: 'mock', translateBatch: async ({ items }) => {
    sent.push(...items.map(item => item.sourceText));
    return { results: new Map(items.map(item => [item.id, 'Please inspect the equipment'])), provider: 'mock', durationMs: 0 };
  } };
  const result = await pptxTranslatorService.translate(buffer, { sourceLanguage: 'vi', targetLanguage: 'en', mode: 'replace_en',
    provider, fileName: 'repair-missing.pptx', translateMissingOnly: true, selectedUnitIds: ['s1_p0'] });
  assert.deepEqual(sent, [source]);
  assert.equal(result.auditReport.untranslatedCount, 0);
  assert.equal(result.auditReport.translatableMissingCount, 0);
  const before = await JSZip.loadAsync(buffer), after = await JSZip.loadAsync(result.translatedBuffer);
  assert.equal(await after.file('ppt/slides/slide2.xml').async('string'), await before.file('ppt/slides/slide2.xml').async('string'));
  assert.equal(paragraphText(await after.file('ppt/slides/slide1.xml').async('string')), 'Please inspect the equipment');
});

test('VI to EN audit preserves existing English without casing or historical consistency suggestions', async () => {
  const source='Kiểm tra thiết bị', current='Check equipment';
  const buffer=await deck([shape('Cutting die')+shape('CUTTING DIE')+shape(source,current)]);
  const report=await auditPptxGaps(buffer,'existing-english.pptx',{
    sourceLang:'vi',targetLang:'en',mode:'replace_en',historyPairs:[
      {source:'Khuôn dao',target:'cutting die',origin:'history'},
      {source,target:'Inspect the equipment',origin:'correction'},
    ],approvedGlossary:[],
  });
  const english=report.units.filter(u=>['Cutting die','CUTTING DIE',current].includes(u.sourceText));
  assert.equal(english.length,3);
  for(const unit of english){
    assert.equal(unit.status,'ALREADY_TRANSLATED');
    assert.equal(unit.selectedForTranslation,false);assert.equal(unit.canApply,false);assert.equal(unit.safeToApply,false);
    assert.equal(unit.suggestedTranslation,undefined);
    assert.ok(!report.groups.some(g=>g.unitIds.includes(unit.id)));
  }
  assert.equal(report.suspiciousTranslationCount,0);
});

test('Preserving English does not hide Vietnamese leftovers, including known accentless phrases',async()=>{
  const report=await auditPptxGaps(await deck([shape('Check thiết bị')+shape('Kiem tra thiet bi')+shape('Cutting die')]),'mixed.pptx',{
    sourceLang:'vi',targetLang:'en',mode:'replace_en',historyPairs:[],approvedGlossary:[],
  });
  assert.equal(report.units.find(u=>u.sourceText==='Check thiết bị').selectedForTranslation,true);
  assert.equal(report.units.find(u=>u.sourceText==='Kiem tra thiet bi').selectedForTranslation,true);
  assert.equal(report.units.find(u=>u.sourceText==='Cutting die').selectedForTranslation,false);
  assert.equal(report.untranslatedCount,2);
});

test('Existing English with ambiguous footwear words cannot reappear through glossary/history or a stale apply request',async()=>{
  const words=['Cutting die','May 2026','Lot number','day shift','go','Sole bond'];
  const buffer=await deck([words.map(word=>shape(word)).join('')]);
  const opts={sourceLang:'vi',targetLang:'en',mode:'replace_en',
    approvedGlossary:[{sourceTerm:'Lot number',targetTerm:'Batch number',status:'approved'}],
    historyPairs:[{source:'Ngày tháng',target:'may 2026',origin:'history'},{source:'Ca ngày',target:'Day shift',origin:'history'},
      {source:'Khuôn dao',target:'cutting die',origin:'correction'}]};
  const report=await auditPptxGaps(buffer,'english-only.pptx',opts);
  assert.equal(report.groups.length,0);assert.equal(report.attentionCount,0);assert.equal(report.safeFixCount,0);
  assert.equal(report.untranslatedCount,0);assert.equal(report.translatableMissingCount,0);assert.equal(report.estimatedGeminiRequests,0);
  for(const unit of report.units){
    assert.ok(['ALREADY_TRANSLATED','NON_TRANSLATABLE'].includes(unit.status));
    assert.equal(unit.selectedForTranslation,false);assert.equal(unit.canApply,false);assert.equal(unit.safeToApply,false);
  }
  const cutting=report.units.find(u=>u.sourceText==='Cutting die');
  await assert.rejects(applyPptxAuditSuggestions(buffer,'english-only.pptx',[cutting.id],{
    ...opts,expectedSuggestions:[{id:cutting.id,sourceText:'Cutting die',suggestedTranslation:'cutting die'}],
  }),/không còn hợp lệ/);
});
