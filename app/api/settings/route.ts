import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";

export async function GET() {
  const settings = db.getSettings();
  const envGeminiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  // Mask API key for frontend safety
  const safeSettings = {
    ...settings,
    geminiModel: settings.geminiModel || "gemini-3.8-flash",
    googleApiKey: settings.googleApiKey ? "••••••••••••••••" : "",
    openaiApiKey: settings.openaiApiKey ? "••••••••••••••••" : "",
    geminiApiKey: settings.geminiApiKey || envGeminiKey ? "••••••••••••••••" : "",
    huggingFaceApiKey: settings.huggingFaceApiKey ? "••••••••••••••••" : "",
  };
  return NextResponse.json({ settings: safeSettings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = db.getSettings();

    // Only update API keys if a new non-masked value is provided
    const updates = { ...body };
    if (updates.googleApiKey && updates.googleApiKey.includes("••")) {
      delete updates.googleApiKey;
    }
    if (updates.openaiApiKey && updates.openaiApiKey.includes("••")) {
      delete updates.openaiApiKey;
    }
    if (updates.geminiApiKey && updates.geminiApiKey.includes("••")) {
      delete updates.geminiApiKey;
    }
    if (updates.huggingFaceApiKey && updates.huggingFaceApiKey.includes("••")) {
      delete updates.huggingFaceApiKey;
    }

    const updated = db.updateSettings(updates);

    db.addAuditLog({
      userId: "admin",
      userEmail: "admin@secure.local",
      operation: "SETTINGS_UPDATED",
      status: "SUCCESS",
      durationMs: 4,
      details: {
        provider: updated.defaultProvider,
        retentionPolicy: updated.retentionPolicy,
      },
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
