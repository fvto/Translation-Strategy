import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (body.status) {
      const updated = db.updateTermStatus(id, body.status, "reviewer@secure.local");
      if (!updated) {
        return NextResponse.json({ error: "Term not found" }, { status: 404 });
      }

      db.addAuditLog({
        userId: "reviewer",
        userEmail: "reviewer@secure.local",
        operation: `TERMINOLOGY_${body.status.toUpperCase()}`,
        status: "SUCCESS",
        durationMs: 3,
        details: { termId: id, status: body.status },
      });

      return NextResponse.json({ success: true, term: updated });
    }

    if (body.swapDirection) {
      const existing = db.getTerminology().find((t) => t.id === id);
      if (!existing) {
        return NextResponse.json({ error: "Term not found" }, { status: 404 });
      }
      const newSource = existing.targetTerm;
      const newTarget = existing.sourceTerm;
      const newSrcLang = existing.targetLanguage || (existing.sourceLanguage === "vi" ? "en" : "vi");
      const newTgtLang = existing.sourceLanguage || (existing.targetLanguage === "en" ? "vi" : "en");
      const updated = db.updateTerm(id, {
        sourceTerm: newSource,
        targetTerm: newTarget,
        sourceLanguage: newSrcLang,
        targetLanguage: newTgtLang,
      });
      db.addAuditLog({
        userId: "reviewer",
        userEmail: "reviewer@secure.local",
        operation: "TERMINOLOGY_DIRECTION_SWAPPED",
        status: "SUCCESS",
        durationMs: 3,
        details: { termId: id, from: `${existing.sourceLanguage}->${existing.targetLanguage}`, to: `${newSrcLang}->${newTgtLang}` },
      });
      return NextResponse.json({ success: true, term: updated });
    }

    const updated = db.updateTerm(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, term: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = db.deleteTerm(id);
  if (!deleted) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  db.addAuditLog({
    userId: "user",
    userEmail: "user@secure.local",
    operation: "TERMINOLOGY_DELETED",
    status: "SUCCESS",
    durationMs: 3,
    details: { termId: id },
  });

  return NextResponse.json({ success: true });
}
