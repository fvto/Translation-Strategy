import { NextRequest, NextResponse } from "next/server";
import { pptxSessionStore } from "@/services/documents/pptx-session-store";
import { pptxTranslatorService, PptxSlideData, formatSopFileName, PptxTranslationMode } from "@/services/documents/pptx-translator";
import { recordTranslationSession } from "@/services/translation/translation-memory";
import { harvestTerminologyFromSlides } from "@/services/translation/harvester";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    const session = pptxSessionStore.get(id);
    if (!session || !session.translatedBuffer) {
      return NextResponse.json({ error: "Session or translated file not found" }, { status: 404 });
    }

    const downloadName = formatSopFileName(session.fileName);

    return new Response(session.translatedBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(downloadName)}"`,
        "Content-Length": session.translatedBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let sessionId: string | null = null;
    let slides: PptxSlideData[] = [];
    let fileBuffer: Buffer | null = null;
    let fileName = "presentation.pptx";

    let mode: PptxTranslationMode | undefined = undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      sessionId = formData.get("id") as string | null;
      mode = (formData.get("mode") as PptxTranslationMode) || undefined;
      const slidesJson = formData.get("slides") as string | null;
      if (slidesJson) {
        slides = JSON.parse(slidesJson);
      }
      const file = formData.get("file") as File | null;
      if (file) {
        fileName = file.name;
        fileBuffer = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const body = await req.json();
      sessionId = body.id || null;
      mode = (body.mode as PptxTranslationMode) || undefined;
      slides = body.slides || [];
      if (body.fileName) fileName = body.fileName;
      if (body.fileBase64) {
        fileBuffer = Buffer.from(body.fileBase64, "base64");
      }
    }

    let originalBuffer: Buffer | null = fileBuffer;
    let session = sessionId ? pptxSessionStore.get(sessionId) : null;

    if (session) {
      if (!originalBuffer) originalBuffer = session.originalBuffer;
      fileName = session.fileName;
    }

    if (!originalBuffer) {
      return NextResponse.json(
        { error: "Session expired or file not found. Please re-upload your presentation." },
        { status: 404 }
      );
    }

    const finalMode = mode || session?.mode || "ipqc_bilingual";

    // Rebuild translated PPTX with latest slide texts and selected mode
    const rebuiltBuffer = await pptxTranslatorService.rebuildWithTranslations(
      originalBuffer,
      slides,
      finalMode,
      fileName
    );

    // If session exists, update it
    if (session) {
      session.translatedBuffer = rebuiltBuffer;
      session.slides = slides;
      session.mode = finalMode;
      pptxSessionStore.set(session.id, session);
    }

    // Auto-sync customized reviewer translations into Translation Memory
    try {
      recordTranslationSession(
        sessionId || `custom_${Date.now()}`,
        fileName,
        slides,
        finalMode,
        "vi",
        "en",
        0
      );
      harvestTerminologyFromSlides(slides, fileName, "vi", "en");
    } catch (tmErr) {
      console.warn("[DownloadPPTX] Failed to sync custom edits to TM:", tmErr);
    }

    const downloadName = formatSopFileName(fileName);

    return new Response(rebuiltBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(downloadName)}"`,
        "Content-Length": rebuiltBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Download route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
