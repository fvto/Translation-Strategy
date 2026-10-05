import { NextRequest, NextResponse } from "next/server";
import { feedPdfContextToGlossary } from "@/services/terminology/pdf-context-feeder";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const defaultStage = (formData.get("defaultStage") as string) || "General";
    const autoSave = formData.get("autoSave") === "true";

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn file PDF để nạp ngữ cảnh." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Chỉ hỗ trợ định dạng file PDF (.pdf)." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await feedPdfContextToGlossary(buffer, file.name, {
      defaultStage,
      autoSaveToReview: autoSave,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[GlossaryFeedPdf] Error:", err);
    return NextResponse.json(
      { error: err.message || "Không thể trích xuất ngữ cảnh từ file PDF" },
      { status: 500 }
    );
  }
}
