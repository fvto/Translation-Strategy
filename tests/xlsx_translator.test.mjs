import test from "node:test";
import assert from "node:assert";
import ExcelJS from "exceljs";
import { xlsxTranslatorService, shiftFormulaColumns, isTranslatableText } from "../services/documents/xlsx.ts";
import { AirGappedTranslationProvider } from "../services/translation/offline.ts";

test("XLSX Helper - shiftFormulaColumns accurately shifts column references", () => {
  assert.strictEqual(shiftFormulaColumns("C2*D2", 4, 1), "C2*E2");
  assert.strictEqual(shiftFormulaColumns("SUM(C2:D10)", 4, 1), "SUM(C2:E10)");
  assert.strictEqual(shiftFormulaColumns("VLOOKUP(B2, D2:F10, 2, FALSE)", 4, 1), "VLOOKUP(B2, E2:G10, 2, FALSE)");
  assert.strictEqual(shiftFormulaColumns("A1+B1", 10, 1), "A1+B1"); // unaffected
});

test("XLSX Helper - isTranslatableText filters pure numbers, codes, and IDs", () => {
  assert.strictEqual(isTranslatableText("123"), false);
  assert.strictEqual(isTranslatableText("45.6%"), false);
  assert.strictEqual(isTranslatableText("STT"), false);
  assert.strictEqual(isTranslatableText("SB-077-A-1"), false);
  assert.strictEqual(isTranslatableText("FA25"), false);
  assert.strictEqual(isTranslatableText("Mũi giày"), true);
  assert.strictEqual(isTranslatableText("Kiểm tra hở keo"), true);
  assert.strictEqual(isTranslatableText("10-12 mũi/inch"), true);
});

test("XLSX Translator - replace_en mode preserves formulas and applies footwear terminology", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOM_Sheet");

  // Headers
  ws.getCell("A1").value = "STT";
  ws.getCell("B1").value = "Mã chi tiết";
  ws.getCell("C1").value = "Tên chi tiết";
  ws.getCell("D1").value = "Tiêu chuẩn kỹ thuật";
  ws.getCell("E1").value = "Định mức";
  ws.getCell("F1").value = "Đơn giá";
  ws.getCell("G1").value = "Thành tiền";

  // Data rows
  ws.getCell("A2").value = 1;
  ws.getCell("B2").value = "P-001";
  ws.getCell("C2").value = "Mũi giày";
  ws.getCell("D2").value = "May lót vòng cổ 10-12 mũi/inch, kiểm tra hở keo và bọt khí";
  ws.getCell("E2").value = 1.5;
  ws.getCell("F2").value = 10000;
  ws.getCell("G2").value = { formula: "E2*F2", result: 15000 };

  // Styling
  ws.getCell("A1").font = { bold: true, color: { argb: "FFFF0000" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };

  const inputBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  // Translate using offline airgapped provider
  const provider = new AirGappedTranslationProvider();
  const result = await xlsxTranslatorService.translateSpreadsheet(inputBuffer, {
    mode: "replace_en",
    provider,
    sourceLanguage: "vi",
    targetLanguage: "en",
  });

  assert.ok(result.translatedBuffer);
  assert.strictEqual(result.stats.formulasPreserved, 1);
  assert.ok(result.stats.translatedCells >= 2);

  // Inspect translated workbook
  const resWb = new ExcelJS.Workbook();
  // @ts-ignore
  await resWb.xlsx.load(result.translatedBuffer);
  const resWs = resWb.getWorksheet("BOM_Sheet");

  // Numeric and formula cells must stay untouched
  assert.strictEqual(resWs.getCell("A2").value, 1);
  assert.strictEqual(resWs.getCell("B2").value, "P-001");
  assert.strictEqual(resWs.getCell("E2").value, 1.5);
  assert.strictEqual(resWs.getCell("F2").value, 10000);

  const g2 = resWs.getCell("G2").value;
  assert.ok(g2 && typeof g2 === "object" && g2.formula === "E2*F2");

  // Style on header must be preserved
  assert.strictEqual(resWs.getCell("A1").font?.bold, true);

  // Text cells must be translated with footwear terminology
  const c2 = String(resWs.getCell("C2").value).toLowerCase();
  assert.ok(c2.includes("vamp") || c2.includes("tip"));

  const d2 = String(resWs.getCell("D2").value).toLowerCase();
  assert.ok(d2.includes("bond gap"));
  assert.ok(d2.includes("spi 10-12 stitches/inch"));
});

test("XLSX Translator - bilingual_columns mode inserts parallel translated columns", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("QC_Checklist");

  ws.getCell("A1").value = "STT";
  ws.getCell("B1").value = "Nội dung kiểm tra";
  ws.getCell("C1").value = "Số lượng";
  ws.getCell("D1").value = "Đơn giá";
  ws.getCell("E1").value = { formula: "C1*D1", result: 50 };

  ws.getCell("A2").value = 1;
  ws.getCell("B2").value = "Phát hiện hở keo và sụp mí tại đế trung";
  ws.getCell("C2").value = 5;
  ws.getCell("D2").value = 10;
  ws.getCell("E2").value = { formula: "C2*D2", result: 50 };

  const inputBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  const provider = new AirGappedTranslationProvider();
  const result = await xlsxTranslatorService.translateSpreadsheet(inputBuffer, {
    mode: "bilingual_columns",
    provider,
    sourceLanguage: "vi",
    targetLanguage: "en",
  });

  assert.ok(result.stats.columnsInserted && result.stats.columnsInserted >= 1);

  const resWb = new ExcelJS.Workbook();
  // @ts-ignore
  await resWb.xlsx.load(result.translatedBuffer);
  const resWs = resWb.getWorksheet("QC_Checklist");

  // Original column B must be intact
  assert.strictEqual(resWs.getCell("B1").value, "Nội dung kiểm tra");
  assert.strictEqual(resWs.getCell("B2").value, "Phát hiện hở keo và sụp mí tại đế trung");

  // Newly inserted column C must have translated content
  const c1 = String(resWs.getCell("C1").value);
  assert.ok(c1.includes("(EN)") || c1.toLowerCase().includes("check") || c1.toLowerCase().includes("inspection"));

  const c2 = String(resWs.getCell("C2").value).toLowerCase();
  assert.ok(c2.includes("bond gap"));
  assert.ok(c2.includes("midsole"));

  // Formula in original column E has shifted across inserted columns to column H with updated references
  const h2 = resWs.getCell("H2").value;
  assert.ok(h2 && typeof h2 === "object");
  assert.strictEqual(h2.formula, "D2*F2");
});

test("XLSX Translator - bilingual_sheets mode duplicates sheet into EN and VI", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Spec");

  ws.getCell("A1").value = "Kiểm tra độ gập ghềnh";
  ws.getCell("A2").value = 100;

  const inputBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  const provider = new AirGappedTranslationProvider();
  const result = await xlsxTranslatorService.translateSpreadsheet(inputBuffer, {
    mode: "bilingual_sheets",
    provider,
  });

  assert.strictEqual(result.stats.sheetsDuplicated, 1);

  const resWb = new ExcelJS.Workbook();
  // @ts-ignore
  await resWb.xlsx.load(result.translatedBuffer);

  const sheetVi = resWb.getWorksheet("Spec (VI)");
  const sheetEn = resWb.getWorksheet("Spec (EN)");

  assert.ok(sheetVi);
  assert.ok(sheetEn);

  assert.strictEqual(sheetVi.getCell("A1").value, "Kiểm tra độ gập ghềnh");
  const enA1 = String(sheetEn.getCell("A1").value).toLowerCase();
  assert.ok(enA1.includes("rocking"));
});
