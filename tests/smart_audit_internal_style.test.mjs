import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { db } from '../services/database/db.ts';
import { internalSopKey, internalSopInstructions, shortenInternalSopPhrasing } from '../services/translation/internal-sop.ts';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';
import { paragraphText } from '../services/documents/pptx-text.ts';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';

async function deck(texts) {
  const zip = new JSZip();
  const paragraphs = texts.map((text) => `<a:p><a:r><a:rPr sz="1400"/><a:t>${text}</a:t></a:r></a:p>`).join('');
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Smart Audit passes approved internal examples to the translator and keeps excluded text', async () => {
  const example = { sourceText: 'Kiểm tra độ nghiêng của miếng lót.', translatedText: 'Check if the insole is tilted.', sourceLanguage: 'vi', targetLanguage: 'en' };
  db.saveInternalSopExample(example, internalSopKey(example.sourceText));
  const source = 'Kiểm tra độ nghiêng của miếng lót không vượt quá 2mm.';
  const excluded = 'Giữ nguyên thông số kỹ thuật 3mm.';
  const input = await deck([source, excluded]);
  const report = await auditPptxGaps(input, 'selection-fixture.pptx', { sourceLang: 'vi', targetLang: 'en', mode: 'replace_en' });
  const unit = report.units.find((item) => item.sourceText === source);
  assert.ok(unit, 'The selected source paragraph must be identified by Smart Audit');
  const calls = [];
  const provider = {
    name: 'internal-style-test',
    translate: async (request) => { calls.push(request); return { translatedText: 'It is necessary to check if insole inclination does not exceed 2mm.', provider: 'test', durationMs: 0 }; },
    translateBatch: async (request) => { calls.push(request); return { results: new Map(request.items.map((item) => [item.id, 'It is necessary to check if insole inclination does not exceed 2mm.'])), provider: 'test', durationMs: 0 }; },
  };
  const result = await pptxTranslatorService.translate(input, { provider, mode: 'replace_en', sourceLanguage: 'vi', targetLanguage: 'en', translateMissingOnly: true, selectedUnitIds: [unit.id], fileName: 'selection-fixture.pptx' });
  assert.ok(calls.length > 0, 'Smart Audit must send a new request for the selected item');
  assert.ok(calls.some((request) => request.internalExamples?.some((item) => item.translatedText === example.translatedText)));
  assert.ok(calls.every((request) => !request.items || request.items.every((item) => item.sourceText !== excluded)));
  const output = await JSZip.loadAsync(result.translatedBuffer);
  const xml = await output.file('ppt/slides/slide1.xml').async('string');
  assert.match(paragraphText(xml), /3mm/);
  assert.match(paragraphText(xml), /Giữ nguyên thông số kỹ thuật/);
  assert.match(paragraphText(xml), /2mm/);
  assert.match(paragraphText(xml), /Check if insole inclination does not exceed 2mm/i);
  assert.doesNotMatch(paragraphText(xml), /It is necessary to/i);
});

test('Internal style references guide wording without replacing specifications on another instruction', () => {
  const examples = [{ id: 'approved', sourceText: 'Kiểm tra độ nghiêng không vượt quá 2mm.', translatedText: 'Check inclination; do not exceed 2mm.', sourceLanguage: 'vi', targetLanguage: 'en' }];
  const prompt = internalSopInstructions('Kiểm tra độ nghiêng không vượt quá 3mm.', examples);
  assert.match(prompt, /approvedTranslation/);
  assert.match(prompt, /Never copy their defects, locations or specifications/);
  assert.match(prompt, /Do not target an arbitrary percentage/);
});

test('Shortening removes filler while retaining location, limits and negation', () => {
  const input = 'It is necessary to tuck thread inside the outsole in order to limit exposure. It is necessary to not exceed 2mm.';
  assert.equal(shortenInternalSopPhrasing(input), 'Tuck thread inside the outsole to limit exposure. Do not exceed 2mm.');
  const negative = 'It is not necessary to tuck thread inside the outsole.';
  assert.equal(shortenInternalSopPhrasing(negative), negative);
  assert.equal(shortenInternalSopPhrasing('Since material frays, it is necessary to tuck thread inside.'), 'Since material frays, tuck thread inside.');
});
