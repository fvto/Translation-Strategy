import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/services/database/db";

export const dynamic = "force-dynamic";

const STAGE_COLORS: Record<string, { fill: string; font: string }> = {
  QA: { fill: "FFFDF0", font: "92400E" },
  Stitching: { fill: "EFF6FF", font: "1E40AF" },
  Assembly: { fill: "ECFDF5", font: "065F46" },
  Stockfit: { fill: "FAF5FF", font: "6B21A8" },
  Cutting: { fill: "EEF2FF", font: "3730A3" },
  "No-Sew": { fill: "FFF1F2", font: "9F1239" },
};

export async function GET(req: NextRequest) {
  try {
    const terms = db.getTerminology({ status: "approved" });

    const wb = new ExcelJS.Workbook();
    wb.creator = "SecureTranslator - Ching Luh Footwear CAT";
    wb.created = new Date();

    const ws = wb.addWorksheet("Footwear_Glossary", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "Mã ID", key: "id", width: 14 },
      { header: "Thuật Ngữ Tiếng Việt (VI)", key: "sourceTerm", width: 34 },
      { header: "Bản Dịch Tiếng Anh (EN)", key: "targetTerm", width: 34 },
      { header: "Công Đoạn (Stage)", key: "stage", width: 18 },
      { header: "Mã Lỗi (Defect Code)", key: "defectCode", width: 22 },
      { header: "Ngữ Cảnh SOP (Context)", key: "context", width: 36 },
      { header: "Ghi Chú Kỹ Thuật (Notes)", key: "definition", width: 36 },
    ];

    // Format Header Row
    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" }, // Slate 900
      };
      cell.font = {
        name: "Segoe UI",
        size: 10,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF3B82F6" } },
      };
    });

    // Populate Data Rows
    terms.forEach((term, index) => {
      const stage = term.category || "General";
      const row = ws.addRow({
        id: term.id,
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        stage,
        defectCode: (term as any).defectCode || "",
        context: term.context || "",
        definition: term.definition || "",
      });

      row.height = 22;

      // Subtle zebra striping & stage coloring
      const stageColor = STAGE_COLORS[stage];
      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Segoe UI", size: 9.5 };
        cell.alignment = { vertical: "middle" };

        if (colNumber === 1) {
          // ID cell
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { name: "Consolas", size: 8.5, color: { argb: "FF64748B" } };
        } else if (colNumber === 2) {
          // Vietnamese term
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
        } else if (colNumber === 3) {
          // English term
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF047857" } }; // Emerald 700
        } else if (colNumber === 4 && stageColor) {
          // Stage badge cell
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: stageColor.fill } };
          cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: stageColor.font } };
        }

        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFF1F5F9" } },
        };
      });
    });

    const rawBuffer = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer);

    const fileName = `ChingLuh_Footwear_Glossary_${terms.length}_terms.xlsx`;

    return new Response(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("[GlossaryExport] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to export glossary" }, { status: 500 });
  }
}
