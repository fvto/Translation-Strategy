import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/services/database/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const defaultStage = (formData.get("defaultStage") as string) || "General";

    if (!file) {
      return NextResponse.json({ error: "No Excel file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .xlsx Excel files are supported" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const wb = new ExcelJS.Workbook();
    // @ts-ignore
    await wb.xlsx.load(buffer);

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: "Excel file has no worksheets" }, { status: 400 });
    }

    // 1. Map columns from header row (Row 1)
    let viCol = -1;
    let enCol = -1;
    let stageCol = -1;
    let defectCodeCol = -1;
    let contextCol = -1;
    let notesCol = -1;

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value || "").toLowerCase().trim();
      if (header.includes("tiếng việt") || header.includes("vi") || header.includes("source") || header.includes("nguồn")) {
        viCol = colNumber;
      } else if (header.includes("tiếng anh") || header.includes("en") || header.includes("target") || header.includes("đích")) {
        enCol = colNumber;
      } else if (header.includes("công đoạn") || header.includes("stage") || header.includes("category") || header.includes("bộ phận")) {
        stageCol = colNumber;
      } else if (header.includes("mã lỗi") || header.includes("defect") || header.includes("code")) {
        defectCodeCol = colNumber;
      } else if (header.includes("ngữ cảnh") || header.includes("context") || header.includes("sop")) {
        contextCol = colNumber;
      } else if (header.includes("ghi chú") || header.includes("note") || header.includes("định nghĩa") || header.includes("definition")) {
        notesCol = colNumber;
      }
    });

    // Fallback if headers didn't match explicit keywords: Col 2 = VI, Col 3 = EN
    if (viCol === -1 && ws.columnCount >= 2) viCol = 2;
    if (enCol === -1 && ws.columnCount >= 3) enCol = 3;
    if (stageCol === -1 && ws.columnCount >= 4) stageCol = 4;

    if (viCol === -1 || enCol === -1) {
      return NextResponse.json(
        { error: "Could not find Vietnamese and English columns in the Excel spreadsheet." },
        { status: 400 }
      );
    }

    // 2. Fetch existing glossary terms to detect duplicates
    const existingTerms = db.getTerminology({ status: "all" });
    const existingPairs = new Set(
      existingTerms.map((t) => `${t.sourceTerm.toLowerCase().trim()}:::${t.targetTerm.toLowerCase().trim()}`)
    );

    let totalRead = 0;
    let importedCount = 0;
    let skippedDuplicateCount = 0;
    let skippedInvalidCount = 0;
    const importedSample: Array<{ sourceTerm: string; targetTerm: string; stage: string }> = [];

    const toInsert: any[] = [];

    // 3. Process rows (skip header row 1)
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      totalRead++;

      const viCellVal = row.getCell(viCol).value;
      const enCellVal = row.getCell(enCol).value;

      const sourceTerm = String(
        typeof viCellVal === "object" && viCellVal !== null && "text" in viCellVal
          ? (viCellVal as any).text
          : viCellVal || ""
      ).trim();

      const targetTerm = String(
        typeof enCellVal === "object" && enCellVal !== null && "text" in enCellVal
          ? (enCellVal as any).text
          : enCellVal || ""
      ).trim();

      // Basic validation
      if (!sourceTerm || !targetTerm || sourceTerm.length < 2 || targetTerm.length < 2) {
        skippedInvalidCount++;
        return;
      }

      // Prohibit identical source and target terms (Rule: Continuous Glossary Hygiene)
      if (sourceTerm.toLowerCase() === targetTerm.toLowerCase()) {
        skippedInvalidCount++;
        return;
      }

      // Check duplicates
      const pairKey = `${sourceTerm.toLowerCase()}:::${targetTerm.toLowerCase()}`;
      if (existingPairs.has(pairKey)) {
        skippedDuplicateCount++;
        return;
      }

      // Filter out full sentences: only accept specialized terms (<= 6 words, no sentence punctuation)
      if (sourceTerm.split(/\s+/).length > 6 || /[\.\?\!\;\n\r]/.test(sourceTerm)) {
        skippedInvalidCount++;
        return;
      }

      const stageVal = stageCol !== -1 ? String(row.getCell(stageCol).value || "").trim() : "";
      const stage = stageVal || defaultStage;
      const defectCode = defectCodeCol !== -1 ? String(row.getCell(defectCodeCol).value || "").trim() : "";
      const context = contextCol !== -1 ? String(row.getCell(contextCol).value || "").trim() : "";
      const definition = notesCol !== -1 ? String(row.getCell(notesCol).value || "").trim() : "";

      toInsert.push({
        sourceTerm,
        targetTerm,
        sourceLanguage: "vi",
        targetLanguage: "en",
        category: stage,
        context: defectCode ? `[Mã: ${defectCode}] ${context}`.trim() : context,
        definition: definition || `Nhập từ file Excel: ${file.name}`,
        status: "review", // STRICT USER RULE: Terms from files must enter as "review" (Chờ duyệt)
      });

      existingPairs.add(pairKey);
      importedCount++;

      if (importedSample.length < 10) {
        importedSample.push({ sourceTerm, targetTerm, stage });
      }
    });

    if (toInsert.length > 0) {
      db.addTerminology(toInsert);
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      totalRead,
      importedCount,
      skippedDuplicateCount,
      skippedInvalidCount,
      importedSample,
    });
  } catch (err: any) {
    console.error("[GlossaryImport] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to import glossary" }, { status: 500 });
  }
}
