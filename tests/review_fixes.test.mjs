import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { NextRequest } from 'next/server';
import { Database, db } from '../services/database/db.ts';
import { shiftFormulaColumns, xlsxTranslatorService } from '../services/documents/xlsx.ts';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';
import { auditAndRepairPptxPostFlight } from '../services/qa/pptx-postflight-gate.ts';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';
import { paragraphText } from '../services/documents/pptx-text.ts';
import { polishSopText } from '../services/translation/sop-polisher.ts';
import { POST as saveSettings } from '../app/api/settings/route.ts';
import { POST as upload } from '../app/api/documents/upload/route.ts';
import { POST as downloadPptx } from '../app/api/documents/translate-pptx/download/route.ts';
import { isSafePath } from '../services/security/validator.ts';

const sourceParagraph = (text) => `<a:p><a:r><a:rPr sz="1400"/><a:t>${text}</a:t></a:r></a:p>`;
async function deck(texts) {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>${texts.map(sourceParagraph).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  return zip.generateAsync({ type: 'nodebuffer' });
}
const mock = {
  name: 'regression-fixture',
  translate: async () => ({ translatedText: 'Check bond gap', provider: 'regression-fixture', durationMs: 0 }),
  translateBatch: async ({ items }) => ({ results: new Map(items.map((item) => [item.id, 'Check bond gap'])), provider: 'regression-fixture', durationMs: 0 }),
};

test('PPTX QA retains rejection, measurements and legitimate existing English', async () => {
  const input = 'Reject uneven Tip-quarter surfaces when the gap exceeds 2mm.';
  const result = await auditAndRepairPptxPostFlight(await deck([input]), 'replace_en', 'en');
  const zip = await JSZip.loadAsync(result.auditedBuffer);
  assert.equal(paragraphText(await zip.file('ppt/slides/slide1.xml').async('string')), input);
  assert.match(polishSopText('The flat does not accept the quality standard at 2mm.'), /does not accept.*2mm/);
});

test('Excel reference updates leave function names, literals and unrelated sheets intact', () => {
  assert.equal(shiftFormulaColumns('LOG10(B2)', 2), 'LOG10(C2)');
  assert.equal(shiftFormulaColumns('IF(A1="B2",B2,0)', 2), 'IF(A1="B2",C2,0)');
  assert.equal(shiftFormulaColumns("'Other'!B2+C2", 2), "'Other'!B2+D2");
  assert.equal(shiftFormulaColumns("'Other'!B2:C3+B2", 2), "'Other'!B2:C3+C2");
  assert.equal(shiftFormulaColumns('SUM(Table1[B2])+B2', 2), 'SUM(Table1[B2])+C2');
});

test('Excel column insert updates formulas on other sheets pointing to the changed sheet', async () => {
  const wb = new ExcelJS.Workbook();
  const source = wb.addWorksheet('Input');
  source.getCell('A1').value = 'Kiểm tra hở keo';
  source.getCell('B2').value = 100;
  const other = wb.addWorksheet('Other');
  other.getCell('A1').value = { formula: 'Input!B2+LOG10(B2)', result: 100 };
  source.getCell('D2').value = { formula: "'Other'!B2+B2", result: 100 };
  const result = await xlsxTranslatorService.translateSpreadsheet(Buffer.from(await wb.xlsx.writeBuffer()), { mode: 'bilingual_columns', provider: mock });
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(result.translatedBuffer);
  assert.equal(out.getWorksheet('Other').getCell('A1').formula, 'Input!C2+LOG10(B2)');
  assert.equal(out.getWorksheet('Input').getCell('E2').formula, "'Other'!B2+C2");
});

test('Excel bilingual sheets preserve long unique names, merges and validation', async () => {
  const wb = new ExcelJS.Workbook();
  const source = wb.addWorksheet('Manufacturing data sheet 2026');
  source.getCell('A1').value = 'Kiểm tra hở keo';
  source.mergeCells('A1:B1');
  source.getCell('A2').dataValidation = { type: 'whole', operator: 'between', formulae: [1, 10] };
  const result = await xlsxTranslatorService.translateSpreadsheet(Buffer.from(await wb.xlsx.writeBuffer()), { mode: 'bilingual_sheets', provider: mock });
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(result.translatedBuffer);
  assert.equal(out.worksheets.length, 2);
  assert.equal(new Set(out.worksheets.map((s) => s.name)).size, 2);
  for (const sheet of out.worksheets) {
    assert.ok(sheet.name.length <= 31);
    assert.deepEqual(sheet.model.merges, ['A1:B1']);
    assert.equal(sheet.getCell('A2').dataValidation.type, 'whole');
  }
});

test('Independent database connections cannot overwrite settings by logging', () => {
  const first = new Database(), second = new Database();
  first.getSettings();
  second.updateSettings({ localLlmModel: 'regression-new-model' });
  first.addAuditLog({ userId: 'test', userEmail: 'test@example.invalid', operation: 'REVIEW_REGRESSION', status: 'SUCCESS', durationMs: 0 });
  assert.equal(second.getSettings().localLlmModel, 'regression-new-model');
  assert.equal(first.getSettings().localLlmModel, 'regression-new-model');
});

test('Settings responses mask every stored API key on POST', async () => {
  db.updateSettings({ googleApiKey: 'DUMMY_GOOGLE_SECRET', geminiApiKey: 'DUMMY_GEMINI_SECRET', openaiApiKey: 'DUMMY_OPENAI_SECRET', huggingFaceApiKey: 'DUMMY_HF_SECRET' });
  try {
    const response = await saveSettings(new NextRequest('http://localhost/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes('DUMMY_'));
  } finally { db.updateSettings({ googleApiKey: '', geminiApiKey: '', openaiApiKey: '', huggingFaceApiKey: '' }); }
});

test('Invalid and unparseable uploads leave no temporary file with either retention option', async () => {
  const storage = path.resolve('data/secure_storage');
  fs.mkdirSync(storage, { recursive: true });
  const before = fs.readdirSync(storage).sort();
  for (const retentionPolicy of ['delete_immediately', 'persist_until_manual']) {
    for (const bytes of [Buffer.from('invalid'), await new JSZip().file('fake.txt', 'synthetic').generateAsync({ type: 'nodebuffer' })]) {
      const form = new FormData();
      form.append('file', new File([bytes], 'review-invalid.docx'));
      form.append('retentionPolicy', retentionPolicy);
      const response = await upload(new NextRequest('http://localhost/api/documents/upload', { method: 'POST', body: form }));
      assert.ok(response.status >= 400);
      assert.deepEqual(fs.readdirSync(storage).sort(), before);
    }
  }
});

test('PPTX EN to VI export preserves the Vietnamese target instead of retranslating it', async () => {
  const vi = 'Kiểm tra hở keo';
  const file = await deck([vi]);
  const response = await downloadPptx(new NextRequest('http://localhost/api/documents/translate-pptx/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64: file.toString('base64'), fileName: 'review.pptx', slides: [], mode: 'replace_en', sourceLanguage: 'en', targetLanguage: 'vi' }) }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition'), /review-VI\.pptx/);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes(vi));
});

test('PPTX selective translation leaves skipped Vietnamese and existing English byte for byte', async () => {
  const skipped = 'Giữ nguyên nội dung ô này';
  const existing = 'Nosew 10 SPI';
  const input = await deck(['Kiểm tra hở keo', skipped, existing]);
  const report = await auditPptxGaps(input, 'review.pptx', { sourceLang: 'vi', targetLang: 'en', mode: 'replace_en', autoAiCascade: false });
  const id = report.units.find((u) => u.sourceText === 'Kiểm tra hở keo').id;
  const result = await pptxTranslatorService.translate(input, { mode: 'replace_en', fileName: 'review.pptx', translateMissingOnly: true, selectedUnitIds: [id], customTranslations: { [id]: 'Check bond gap' }, provider: mock });
  const zip = await JSZip.loadAsync(result.translatedBuffer);
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(xml.includes(sourceParagraph(skipped)));
  assert.ok(xml.includes(sourceParagraph(existing)));
  assert.ok(paragraphText(xml).includes('Check bond gap'));
});

test('PPTX deselecting the whole slide makes no translation calls and preserves slide XML', async () => {
  const input = await deck(['Kiểm tra hở keo', 'Giữ nguyên nội dung']);
  const provider = { name: 'must-not-call', translate: async () => { throw new Error('Unexpected translation'); } };
  const result = await pptxTranslatorService.translate(input, { mode: 'replace_en', translateMissingOnly: true, selectedUnitIds: [], provider });
  const before = await JSZip.loadAsync(input), after = await JSZip.loadAsync(result.translatedBuffer);
  assert.equal(await after.file('ppt/slides/slide1.xml').async('string'), await before.file('ppt/slides/slide1.xml').async('string'));
});

test('PPTX export reports unresolved instructions instead of deleting them or claiming QA passed', async () => {
  const source = 'Đoạn rò rỉ tiếng Việt chưa dịch';
  const file = await deck([source]);
  const response = await downloadPptx(new NextRequest('http://localhost/api/documents/translate-pptx/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64: file.toString('base64'), fileName: 'review.pptx', slides: [], mode: 'replace_en', sourceLanguage: 'vi', targetLanguage: 'en' }) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Postflight-Passed'), 'false');
  assert.ok(Number(response.headers.get('X-Audit-Unhandled-Count')) > 0);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes(source));
});

test('PPTX slide range and explicit cell selection are intersected', async () => {
  const one = await deck(['Kiểm tra hở keo']);
  const zip = await JSZip.loadAsync(one);
  const originalXml = await zip.file('ppt/slides/slide1.xml').async('string');
  zip.file('ppt/slides/slide2.xml', originalXml);
  zip.file('ppt/presentation.xml', (await zip.file('ppt/presentation.xml').async('string')).replace('</p:sldIdLst>', '<p:sldId id="257" r:id="rId2"/></p:sldIdLst>'));
  zip.file('ppt/_rels/presentation.xml.rels', (await zip.file('ppt/_rels/presentation.xml.rels').async('string')).replace('</Relationships>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>'));
  const result = await pptxTranslatorService.translate(await zip.generateAsync({ type: 'nodebuffer' }), { provider: mock, mode: 'replace_en', translateMissingOnly: true, selectedUnitIds: ['s1_p0', 's2_p0'], selectedSlideIndices: [1], customTranslations: { s1_p0: 'Check bond gap' } });
  const out = await JSZip.loadAsync(result.translatedBuffer);
  assert.equal(await out.file('ppt/slides/slide2.xml').async('string'), originalXml);
  assert.ok(paragraphText(await out.file('ppt/slides/slide1.xml').async('string')).includes('Check bond gap'));
});

test('Storage containment rejects similarly named sibling directories', () => {
  assert.equal(isSafePath(path.resolve('data/secure_storage'), path.resolve('data/secure_storage_backup/file.txt')), false);
});
