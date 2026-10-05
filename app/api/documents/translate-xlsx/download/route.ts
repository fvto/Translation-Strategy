import { NextRequest, NextResponse } from "next/server";
import { xlsxSessionStore } from "@/services/documents/xlsx-session-store";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    const session = xlsxSessionStore.get(id);
    if (!session || !session.translatedBuffer) {
      return NextResponse.json({ error: "Session or translated file not found" }, { status: 404 });
    }

    const baseName = session.fileName.replace(/\.xlsx$/i, "");
    const downloadName = `${baseName}_Translated.xlsx`;

    return new Response(session.translatedBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(downloadName)}"`,
        "Content-Length": session.translatedBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
