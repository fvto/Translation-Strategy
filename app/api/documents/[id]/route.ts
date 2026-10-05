import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = db.deleteDocument(id);

  if (!deleted) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  db.addAuditLog({
    userId: "user",
    userEmail: "user@secure.local",
    operation: "DOCUMENT_DELETED",
    documentId: id,
    status: "SUCCESS",
    durationMs: 5,
  });

  return NextResponse.json({ success: true });
}
