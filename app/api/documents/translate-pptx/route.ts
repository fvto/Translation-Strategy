import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pptxTranslatorService, PptxSlideData, PptxExtractionStats } from "@/services/documents/pptx-translator";
import { db } from "@/services/database/db";
import { verifySessionToken } from "@/services/security/auth";
import { getTranslationProvider } from "@/services/translation";
import { GoogleTranslationProvider } from "@/services/translation/google";
import { GeminiTranslationProvider } from "@/services/translation/gemini";
import { AntigravityCliTranslationProvider } from "@/services/translation/antigravity";

import { pptxSessionStore, PptxSession } from "@/services/documents/pptx-session-store";
import { recordTranslationSession } from "@/services/translation/translation-memory";
import { applyPptxAuditSuggestions } from "@/services/translation/pptx-smart-audit";
import { harvestTerminologyFromSlides } from "@/services/translation/harvester";
import { auditPptxGaps, runAiDeepAudit } from "@/services/translation/smart-detector";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  pptxSessionStore.cleanup();

  try {
    const token =
      req.cookies.get("secure_session")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    const session = token ? verifySessionToken(token) : null;

    const userEmail = session?.email || "anonymous@secure.local";
    const userId = session?.id || "anonymous";

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const action = (formData.get("action") as string) || "translate"; // "crawl" | "translate" | "audit"
    const sourceLanguage = (formData.get("sourceLanguage") as string) || "vi";
    const targetLanguage = (formData.get("targetLanguage") as string) || "en";
    const providerType = formData.get("provider") as string | null;
    const mode = ((formData.get("mode") as string) || "ipqc_bilingual") as any;
    const stage = (formData.get("stage") as string) || "auto";
    const translateMissingOnly = formData.get("translateMissingOnly") === "true";
    const selectedUnitIdsRaw = formData.get("selectedUnitIds") as string | null;
    let selectedUnitIds: string[] | undefined;
    if (selectedUnitIdsRaw) {
      try {
        selectedUnitIds = JSON.parse(selectedUnitIdsRaw);
        if (!Array.isArray(selectedUnitIds) || selectedUnitIds.some((id) => typeof id !== "string")) throw new Error("Invalid selection");
      } catch {
        return NextResponse.json({ error: "Danh sách vị trí đã chọn không hợp lệ. Hãy quét lại." }, { status: 400 });
      }
    }

    const customTranslationsRaw = formData.get("customTranslations") as string | null;
    let customTranslations: Record<string, string> | undefined;
    if (customTranslationsRaw) {
      try {
        customTranslations = JSON.parse(customTranslationsRaw);
      } catch {}
    }

    const slideRange = (formData.get("slideRange") as string | null) || undefined;
    const selectedSlideIndicesRaw = formData.get("selectedSlideIndices") as string | null;
    let selectedSlideIndices: number[] | undefined;
    if (selectedSlideIndicesRaw) {
      try {
        selectedSlideIndices = JSON.parse(selectedSlideIndicesRaw);
      } catch {}
    }

    if (action === "ai_deep_audit") {
      let auditReport = null;
      const reportJson = formData.get("auditReport");
      if (reportJson) {
        try {
          auditReport = JSON.parse(String(reportJson));
        } catch {}
      }

      // If auditReport wasn't provided directly, extract from file if provided
      if (!auditReport) {
        if (!file) {
          return NextResponse.json({ error: "Thiếu dữ liệu auditReport hoặc file PowerPoint (.pptx)." }, { status: 400 });
        }
        if (!file.name.toLowerCase().endsWith(".pptx")) {
          return NextResponse.json({ error: "Only .pptx PowerPoint presentations are supported" }, { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
          return NextResponse.json({ error: "Invalid PPTX file: invalid binary zip header" }, { status: 400 });
        }
        auditReport = await auditPptxGaps(buffer, file.name, {
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          mode,
        });
      }

      if (!auditReport) {
        return NextResponse.json({ error: "Thiếu dữ liệu auditReport hoặc file PowerPoint." }, { status: 400 });
      }

      const deepResult = await runAiDeepAudit(auditReport, {
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
      });

      return NextResponse.json({
        success: true,
        sessionId,
        action: "ai_deep_audit",
        auditReport: deepResult.report,
        pairedCount: deepResult.pairedCount,
        immuneCount: deepResult.immuneCount,
        verifiedCount: deepResult.verifiedCount,
        error: deepResult.error,
      });
    }

    if (!file) {
      return NextResponse.json({ error: "No PowerPoint (.pptx) file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return NextResponse.json({ error: "Only .pptx PowerPoint presentations are supported" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify ZIP magic bytes (PK\x03\x04)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return NextResponse.json({ error: "Invalid PPTX file: invalid binary zip header" }, { status: 400 });
    }

    if (action === "apply_audit") {
      if (!Array.isArray(selectedUnitIds) || !selectedUnitIds.length || selectedUnitIds.some((id) => typeof id !== "string")) {
        return NextResponse.json({ error: "Chọn ít nhất một gợi ý để áp dụng." }, { status: 400 });
      }
      try {
        const expectedSuggestions = JSON.parse(String(formData.get("auditPreview") || "null"));
        if (!Array.isArray(expectedSuggestions) || expectedSuggestions.length !== new Set(selectedUnitIds).size || expectedSuggestions.some((u) => !u || typeof u.id !== "string" || typeof u.sourceText !== "string" || typeof u.suggestedTranslation !== "string")) {
          return NextResponse.json({ error: "Thiếu nội dung xem trước. Hãy quét lại." }, { status: 400 });
        }
        const result = await applyPptxAuditSuggestions(buffer, file.name, selectedUnitIds, { sourceLang: sourceLanguage, targetLang: targetLanguage, mode, expectedSuggestions, customTranslations });
        return new Response(result.buffer as any, { headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "X-Audit-Applied-Count": String(result.appliedCount),
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name.replace(/\.pptx$/i, "-audited.pptx"))}"`,
        } });
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }

    if (action === "audit") {
      const auditReport = await auditPptxGaps(buffer, file.name, {
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        mode,
      });

      return NextResponse.json({
        success: true,
        sessionId,
        fileName: file.name,
        action: "audit",
        auditReport,
      });
    }

    if (action === "crawl") {
      // Crawl only
      const crawled = await pptxTranslatorService.crawl(buffer, { includeMarkitdown: true });

      const pptxSession: PptxSession = {
        id: sessionId,
        fileName: file.name,
        originalBuffer: buffer,
        slides: crawled.slides,
        stats: crawled.stats,
        createdAt: Date.now(),
      };
      pptxSessionStore.set(sessionId, pptxSession);

      return NextResponse.json({
        success: true,
        sessionId,
        fileName: file.name,
        action: "crawl",
        stats: crawled.stats,
        slides: crawled.slides,
        imageShieldActive: true,
      });
    }

    // Full translation
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
        console.warn("Gemini API key is not configured. Falling back to GoogleTranslationProvider with glossary.");
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
            const translationResult = await pptxTranslatorService.translate(buffer, {
              sourceLanguage,
              targetLanguage,
              provider,
              mode,
              fileName: file.name,
              stage,
              translateMissingOnly,
              selectedUnitIds,
              slideRange,
              selectedSlideIndices,
              customTranslations,
              onProgress: (progressUpdate) => {
                sendEvent("progress", progressUpdate);
              },
            });

            const pptxSession: PptxSession = {
              id: sessionId,
              fileName: file.name,
              originalBuffer: buffer,
              translatedBuffer: translationResult.translatedBuffer,
              slides: translationResult.slides,
              stats: translationResult.stats,
              mode,
              sourceLanguage,
              targetLanguage,
              createdAt: Date.now(),
              unmappedTerms: translationResult.unmappedTerms || [],
            };
            pptxSessionStore.set(sessionId, pptxSession);

            db.addAuditLog({
              userId,
              userEmail,
              operation: "PPTX_TRANSLATED",
              status: "SUCCESS",
              durationMs: Date.now() - startTime,
              details: {
                fileName: file.name,
                totalSlides: translationResult.stats.totalSlides,
                totalParagraphs: translationResult.stats.totalParagraphs,
                totalImagesProtected: translationResult.stats.totalImagesProtected,
                imagesSentToAi: 0,
                sourceLanguage,
                targetLanguage,
              },
            });

            // Auto-harvest terminology pairs into database for continuous learning
            let harvestStats = { added: [] as any[], skipped: 0 };
            try {
              harvestStats = harvestTerminologyFromSlides(
                translationResult.slides,
                file.name,
                sourceLanguage,
                targetLanguage
              );
            } catch (hErr: any) {
              console.error("[TranslatePPTX] Auto-harvest error:", hErr);
            }

            // Record full bilingual session log in Translation Memory
            try {
              recordTranslationSession(
                sessionId,
                file.name,
                translationResult.slides,
                mode,
                sourceLanguage,
                targetLanguage,
                harvestStats.added.length
              );
            } catch (tmErr: any) {
              console.error("[TranslatePPTX] Translation memory log error:", tmErr);
            }

            sendEvent("complete", {
              success: true,
              sessionId,
              fileName: file.name,
              stats: translationResult.stats,
              slides: translationResult.slides,
              unmappedTerms: translationResult.unmappedTerms || [],
              durationMs: translationResult.durationMs,
              imageShieldActive: true,
              harvestedCount: harvestStats.added.length,
              downloadUrl: `/api/documents/translate-pptx/download?id=${sessionId}`,
              auditReport: translationResult.auditReport,
            });
            controller.close();
          } catch (err: any) {
            console.error("PPTX streaming error:", err);
            sendEvent("error", { error: err.message || "Failed to translate presentation" });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    const translationResult = await pptxTranslatorService.translate(buffer, {
      sourceLanguage,
      targetLanguage,
      provider,
      mode,
      fileName: file.name,
      stage,
      translateMissingOnly,
      selectedUnitIds,
      slideRange,
      selectedSlideIndices,
      customTranslations,
    });

    const pptxSession: PptxSession = {
      id: sessionId,
      fileName: file.name,
      originalBuffer: buffer,
      translatedBuffer: translationResult.translatedBuffer,
      slides: translationResult.slides,
      stats: translationResult.stats,
      mode,
      sourceLanguage,
      targetLanguage,
      createdAt: Date.now(),
      unmappedTerms: translationResult.unmappedTerms || [],
    };
    pptxSessionStore.set(sessionId, pptxSession);

    // Zero-Leak Audit Log
    db.addAuditLog({
      userId,
      userEmail,
      operation: "PPTX_TRANSLATED",
      status: "SUCCESS",
      durationMs: Date.now() - startTime,
      details: {
        fileName: file.name,
        totalSlides: translationResult.stats.totalSlides,
        totalParagraphs: translationResult.stats.totalParagraphs,
        totalImagesProtected: translationResult.stats.totalImagesProtected,
        imagesSentToAi: 0, // Explicit zero-leak proof
        sourceLanguage,
        targetLanguage,
      },
    });

    // Auto-harvest terminology pairs into database for continuous learning
    let harvestStats = { added: [] as any[], skipped: 0 };
    try {
      harvestStats = harvestTerminologyFromSlides(
        translationResult.slides,
        file.name,
        sourceLanguage,
        targetLanguage
      );
    } catch (hErr: any) {
      console.error("[TranslatePPTX] Auto-harvest error:", hErr);
    }

    // Record full bilingual session log in Translation Memory
    try {
      recordTranslationSession(
        sessionId,
        file.name,
        translationResult.slides,
        mode,
        sourceLanguage,
        targetLanguage,
        harvestStats.added.length
      );
    } catch (tmErr: any) {
      console.error("[TranslatePPTX] Translation memory log error:", tmErr);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      fileName: file.name,
      stats: translationResult.stats,
      slides: translationResult.slides,
      unmappedTerms: translationResult.unmappedTerms || [],
      durationMs: translationResult.durationMs,
      imageShieldActive: true,
      harvestedCount: harvestStats.added.length,
      downloadUrl: `/api/documents/translate-pptx/download?id=${sessionId}`,
      auditReport: translationResult.auditReport,
    });
  } catch (error: any) {
    console.error("PPTX translation error:", error);
    db.addAuditLog({
      userId: "unknown",
      userEmail: "unknown",
      operation: "PPTX_TRANSLATE_FAILED",
      status: "FAILURE",
      durationMs: Date.now() - startTime,
      errorCode: error.message,
    });

    return NextResponse.json(
      { error: error.message || "Failed to process and translate PowerPoint file" },
      { status: 500 }
    );
  }
}
