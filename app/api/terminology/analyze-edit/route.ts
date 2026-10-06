import { NextRequest, NextResponse } from "next/server";
import { analyzeParagraphEdit } from "@/services/terminology/edit-analyzer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paragraphId, originalText, oldTranslatedText, newTranslatedText, stageContext, deckSlides } = body;

    if (!originalText || !newTranslatedText) {
      return NextResponse.json({ success: true, suggestion: null });
    }

    const suggestion = await analyzeParagraphEdit({
      paragraphId,
      originalText,
      oldTranslatedText: oldTranslatedText || "",
      newTranslatedText,
      stageContext,
      deckSlides,
    });

    return NextResponse.json({ success: true, suggestion });
  } catch (error: any) {
    console.error("[AnalyzeEditAPI] Error analyzing edit:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
