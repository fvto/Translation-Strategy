import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";
import { internalSopKey } from "@/services/translation/internal-sop";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !["vi", "en"].includes(body.sourceLanguage) || !["vi", "en"].includes(body.targetLanguage) || body.sourceLanguage === body.targetLanguage ||
    typeof body.sourceText !== "string" || typeof body.translatedText !== "string" || !body.sourceText.trim() || !body.translatedText.trim() ||
    body.sourceText.length > 20000 || body.translatedText.length > 20000 || internalSopKey(body.sourceText) === internalSopKey(body.translatedText)) {
    return NextResponse.json({ error: "Cần câu gốc và bản dịch nội bộ hợp lệ (tối đa 20.000 ký tự)." }, { status: 400 });
  }
  db.saveInternalSopExample({ sourceText: body.sourceText.trim(), translatedText: body.translatedText.trim(), sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage }, internalSopKey(body.sourceText));
  return NextResponse.json({ success: true });
}
