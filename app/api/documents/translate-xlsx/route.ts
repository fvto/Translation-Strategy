import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { xlsxTranslatorService, XlsxTranslationMode } from "@/services/documents/xlsx";
import { xlsxSessionStore, XlsxSession } from "@/services/documents/xlsx-session-store";
import { db } from "@/services/database/db";
import { verifySessionToken } from "@/services/security/auth";
import { getTranslationProvider } from "@/services/translation";
import { GoogleTranslationProvider } from "@/services/translation/google";
import { GeminiTranslationProvider } from "@/services/translation/gemini";
import { AntigravityCliTranslationProvider } from "@/services/translation/antigravity";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  xlsxSessionStore.cleanup();

  try {
    const token =
      req.cookies.get("secure_session")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    const session = token ? verifySessionToken(token) : null;

    const userEmail = session?.email || "anonymous@secure.local";
    const userId = session?.id || "anonymous";

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceLanguage = (formData.get("sourceLanguage") as string) || "vi";
    const targetLanguage = (formData.get("targetLanguage") as string) || "en";
    const providerType = formData.get("provider") as string | null;
    const mode = ((formData.get("mode") as string) || "bilingual_columns") as XlsxTranslationMode;

    if (!file) {
      return NextResponse.json({ error: "No Excel (.xlsx) file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .xlsx Excel spreadsheets are supported" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify ZIP magic bytes (PK\x03\x04)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return NextResponse.json({ error: "Invalid XLSX file: invalid binary zip header" }, { status: 400 });
    }

    const sessionId = `xlsx_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    let provider = getTranslationProvider();
    if (providerType === "antigravity_cli") {
      provider = new AntigravityCliTranslationProvider();
    } else if (providerType === "gemini") {
      const settings = db.getSettings();
      const geminiKey = settings.geminiApiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
      if (geminiKey) {
        provider = new GeminiTranslationProvider(
          geminiKey,
          process.env.GEMINI_MODEL || settings.geminiModel || "gemini-3.5-flash-lite"
        );
      } else {
        provider = new GoogleTranslationProvider();
      }
    } else if (providerType === "google_translate" || !provider || provider.name === "airgapped") {
      provider = new GoogleTranslationProvider();
    }

    const wantStream =
      req.nextUrl.searchParams.get("stream") === "true" ||
      req.headers.get("accept")?.includes("text/event-stream");

    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: string, data: any) => {
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch (e) {}
          };

          try {
            const translationResult = await xlsxTranslatorService.translateSpreadsheet(buffer, {
              sourceLanguage,
              targetLanguage,
              provider,
              mode,
              onProgress: (progressUpdate) => {
                sendEvent("progress", progressUpdate);
              },
            });

            const xlsxSession: XlsxSession = {
              id: sessionId,
              fileName: file.name,
              originalBuffer: buffer,
              translatedBuffer: translationResult.translatedBuffer,
              stats: translationResult.stats,
              mode,
              createdAt: Date.now(),
            };
            xlsxSessionStore.set(sessionId, xlsxSession);

            db.addAuditLog({
              userId,
              userEmail,
              operation: "XLSX_TRANSLATED",
              status: "SUCCESS",
              durationMs: Date.now() - startTime,
              details: {
                fileName: file.name,
                totalSheets: translationResult.stats.totalSheets,
                totalCells: translationResult.stats.totalCells,
                translatedCells: translationResult.stats.translatedCells,
                formulasPreserved: translationResult.stats.formulasPreserved,
                mode,
                sourceLanguage,
                targetLanguage,
              },
            });

            sendEvent("complete", {
              success: true,
              sessionId,
              fileName: file.name,
              stats: translationResult.stats,
              sampleTranslations: translationResult.sampleTranslations,
              durationMs: Date.now() - startTime,
              downloadUrl: `/api/documents/translate-xlsx/download?id=${sessionId}`,
            });
            controller.close();
          } catch (err: any) {
            sendEvent("error", { error: err.message || "XLSX translation failed" });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Direct synchronous response
    const translationResult = await xlsxTranslatorService.translateSpreadsheet(buffer, {
      sourceLanguage,
      targetLanguage,
      provider,
      mode,
    });

    const xlsxSession: XlsxSession = {
      id: sessionId,
      fileName: file.name,
      originalBuffer: buffer,
      translatedBuffer: translationResult.translatedBuffer,
      stats: translationResult.stats,
      mode,
      createdAt: Date.now(),
    };
    xlsxSessionStore.set(sessionId, xlsxSession);

    db.addAuditLog({
      userId,
      userEmail,
      operation: "XLSX_TRANSLATED",
      status: "SUCCESS",
      durationMs: Date.now() - startTime,
      details: {
        fileName: file.name,
        totalSheets: translationResult.stats.totalSheets,
        totalCells: translationResult.stats.totalCells,
        translatedCells: translationResult.stats.translatedCells,
        formulasPreserved: translationResult.stats.formulasPreserved,
        mode,
        sourceLanguage,
        targetLanguage,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId,
      fileName: file.name,
      stats: translationResult.stats,
      sampleTranslations: translationResult.sampleTranslations,
      durationMs: Date.now() - startTime,
      downloadUrl: `/api/documents/translate-xlsx/download?id=${sessionId}`,
    });
  } catch (err: any) {
    console.error("[TranslateXLSX] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to translate Excel file" }, { status: 500 });
  }
}
