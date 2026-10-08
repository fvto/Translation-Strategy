import { NextRequest, NextResponse } from "next/server";
import { harvestTerminologyFromAuditReport } from "@/services/translation/harvester";
import { SmartAuditReport } from "@/services/translation/smart-detector";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auditReport, fileName = "presentation.pptx", sourceLanguage = "vi", targetLanguage = "en" } = body as {
      auditReport: SmartAuditReport;
      fileName?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
    };

    if (!auditReport || !Array.isArray(auditReport.units)) {
      return NextResponse.json({ success: false, error: "Báo cáo kiểm tra không hợp lệ" }, { status: 400 });
    }

    const result = harvestTerminologyFromAuditReport(auditReport, fileName, sourceLanguage, targetLanguage);

    return NextResponse.json({
      success: true,
      addedCount: result.added.length,
      skippedCount: result.skipped,
      terms: result.added,
    });
  } catch (error: any) {
    console.error("[HarvestPairsAPI] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Lỗi xử lý thu hoạch thuật ngữ" }, { status: 500 });
  }
}
