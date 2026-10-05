import { NextRequest, NextResponse } from "next/server";
import {
  getTranslationSessions,
  getTranslationSessionById,
  searchTranslationMemory,
} from "@/services/translation/translation-memory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const mode = url.searchParams.get("mode");
    const query = url.searchParams.get("query") || "";

    if (sessionId) {
      const session = getTranslationSessionById(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Session log not found" }, { status: 404 });
      }
      return NextResponse.json({ session });
    }

    if (mode === "segments") {
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);
      const segments = searchTranslationMemory(query, limit);
      return NextResponse.json({ segments });
    }

    const sessions = getTranslationSessions();
    return NextResponse.json({ sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
