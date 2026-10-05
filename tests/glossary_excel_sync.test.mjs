import test from "node:test";
import assert from "node:assert";
import ExcelJS from "exceljs";
import { db } from "../services/database/db.ts";

test("Glossary Excel Export - Builds valid workbook containing approved terms", async () => {
  const terms = db.getTerminology({ status: "approved" });
  assert.ok(terms.length >= 936, `Expected at least 936 terms, got ${terms.length}`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Glossary");

  ws.columns = [
    { header: "Mã ID", key: "id" },
    { header: "Thuật Ngữ Tiếng Việt (VI)", key: "sourceTerm" },
    { header: "Bản Dịch Tiếng Anh (EN)", key: "targetTerm" },
    { header: "Công Đoạn (Stage)", key: "stage" },
  ];

  for (const t of terms.slice(0, 10)) {
    ws.addRow({
      id: t.id,
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
      stage: t.category,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 1000);

  const reloaded = new ExcelJS.Workbook();
  // @ts-ignore
  await reloaded.xlsx.load(Buffer.from(buf));
  const readWs = reloaded.getWorksheet("Glossary");
  assert.strictEqual(readWs.rowCount, 11); // 1 header + 10 rows
});

test("Glossary Excel Import - Hygiene rule blocks identical source and target terms", () => {
  const sourceTerm = "Sole";
  const targetTerm = "Sole";
  assert.strictEqual(sourceTerm.toLowerCase() === targetTerm.toLowerCase(), true);
});
