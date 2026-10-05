import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const sourceLang = url.searchParams.get("sourceLang") || undefined;
  const targetLang = url.searchParams.get("targetLang") || undefined;
  const sortBy = url.searchParams.get("sortBy") || "newest";

  const terms = db.getTerminology({ status, search, sourceLang, targetLang, sortBy });
  return NextResponse.json(
    { terms },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceTerm, targetTerm, definition, context, category } = body;
    let sourceLanguage = body.sourceLanguage;
    let targetLanguage = body.targetLanguage;

    // Smart auto-detection of language direction to prevent inverted mappings
    const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;
    const srcHasVi = viRegex.test(sourceTerm || "");
    const tgtHasVi = viRegex.test(targetTerm || "");

    if (!sourceLanguage || !targetLanguage) {
      if (srcHasVi && !tgtHasVi) {
        sourceLanguage = "vi";
        targetLanguage = "en";
      } else if (!srcHasVi && tgtHasVi) {
        sourceLanguage = "en";
        targetLanguage = "vi";
      } else {
        // Standard Ching Luh SOP translation direction is Vietnamese -> English
        sourceLanguage = "vi";
        targetLanguage = "en";
      }
    } else if (sourceLanguage === "en" && srcHasVi && !tgtHasVi) {
      // Inverted tags correction: source has Vietnamese diacritics
      sourceLanguage = "vi";
      targetLanguage = "en";
    }

    // Reject full sentences: only accept specialized terms (<= 6 words, no sentence punctuation)
    if (sourceTerm.trim().split(/\s+/).length > 6 || /[\.\?\!\;\n\r]/.test(sourceTerm.trim())) {
      return NextResponse.json(
        { error: "Chỉ được thêm thuật ngữ hoặc cụm từ chuyên ngành (dưới 6 từ), không được thêm cả câu văn vào Glossary." },
        { status: 400 }
      );
    }

    const termStatus = body.status === "review" ? "review" : "approved";

    const created = db.addTerminology([
      {
        sourceTerm: sourceTerm.trim(),
        targetTerm: targetTerm.trim(),
        sourceLanguage,
        targetLanguage,
        definition,
        context,
        category: category || "User-Defined",
        status: termStatus,
        priority: 1,
        confidence: 1.0,
        createdBy: "user@secure.local",
        approvedBy: termStatus === "approved" ? "user@secure.local" : undefined,
        version: "v1.0",
      },
    ]);

    db.addAuditLog({
      userId: "user",
      userEmail: "user@secure.local",
      operation: "TERMINOLOGY_CREATED",
      status: "SUCCESS",
      durationMs: 4,
      details: { termId: created[0].id },
    });

    return NextResponse.json({ success: true, term: created[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, status } = body;
    if (!Array.isArray(ids) || !status) {
      return NextResponse.json({ error: "ids array and status required" }, { status: 400 });
    }

    let updatedCount = 0;
    for (const id of ids) {
      const updated = db.updateTermStatus(id, status, "reviewer@secure.local");
      if (updated) updatedCount++;
    }

    db.addAuditLog({
      userId: "reviewer",
      userEmail: "reviewer@secure.local",
      operation: `TERMINOLOGY_BATCH_${status.toUpperCase()}`,
      status: "SUCCESS",
      durationMs: 5,
      details: { count: updatedCount, status },
    });

    return NextResponse.json({ success: true, count: updatedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body;
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids array required" }, { status: 400 });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const deleted = db.deleteTerm(id);
      if (deleted) deletedCount++;
    }

    db.addAuditLog({
      userId: "user",
      userEmail: "user@secure.local",
      operation: "TERMINOLOGY_BATCH_DELETED",
      status: "SUCCESS",
      durationMs: 5,
      details: { count: deletedCount },
    });

    return NextResponse.json({ success: true, count: deletedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
