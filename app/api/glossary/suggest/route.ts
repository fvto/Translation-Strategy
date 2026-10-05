import { NextRequest, NextResponse } from "next/server";
import { AntigravityCliTranslationProvider, AntigravityAuthRequiredError } from "@/services/translation/antigravity";
import { AirGappedTranslationProvider } from "@/services/translation/offline";
import { db } from "@/services/database/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sourceTerm,
      context,
      sourceLanguage = "en",
      targetLanguage = "vi",
    } = body;

    if (!sourceTerm || typeof sourceTerm !== "string" || !sourceTerm.trim()) {
      return NextResponse.json({ error: "sourceTerm is required" }, { status: 400 });
    }

    const trimmedSource = sourceTerm.trim();

    // 1. First check if term already exists in local approved database
    const existingTerms = db.getTerminology({ search: trimmedSource });
    const exactMatch = existingTerms.find(
      (t) => t.sourceTerm.toLowerCase() === trimmedSource.toLowerCase() && t.status === "approved"
    );

    if (exactMatch) {
      return NextResponse.json({
        success: true,
        sourceTerm: exactMatch.sourceTerm,
        targetTerm: exactMatch.targetTerm,
        category: exactMatch.category || "Approved Glossary",
        confidence: 1.0,
        provider: "Internal Approved Glossary",
        notes: "Thuật ngữ đã được chuẩn hóa trong cơ sở dữ liệu.",
        isExisting: true,
      });
    }

    // 2. Use Antigravity CLI Provider with full domain engineering context
    const agyProvider = new AntigravityCliTranslationProvider();

    try {
      const suggestion = await agyProvider.suggestTerm(
        trimmedSource,
        context,
        sourceLanguage,
        targetLanguage
      );

      return NextResponse.json({
        success: true,
        ...suggestion,
      });
    } catch (cliErr: any) {
      // If CLI is awaiting one-time authentication or has issue, fallback gracefully
      const isAuthError = cliErr instanceof AntigravityAuthRequiredError;
      const fallbackEngine = new AirGappedTranslationProvider();
      const fallbackTranslation = await fallbackEngine.translate({
        sourceText: trimmedSource,
        sourceLanguage,
        targetLanguage,
        approvedTerminology: [],
        context,
      });

      return NextResponse.json({
        success: true,
        sourceTerm: trimmedSource,
        targetTerm: fallbackTranslation.translatedText,
        category: "Footwear Manufacturing",
        confidence: 0.75,
        provider: "Offline Glossary (Fallback)",
        authRequired: isAuthError,
        authUrl: isAuthError ? cliErr.authUrl : undefined,
        notes: isAuthError
          ? "Antigravity CLI chưa đăng nhập. Mở Terminal và gõ 'agy' để đăng nhập Google một lần duy nhất."
          : `CLI Notice: ${cliErr.message}`,
        isFallback: true,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
