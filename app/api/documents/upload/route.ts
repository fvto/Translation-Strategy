import { NextRequest, NextResponse } from "next/server";
import { documentProcessingService } from "@/services/documents";
import { saveToPrivateStorage, secureDeleteFile } from "@/services/security/storage";
import { db } from "@/services/database/db";
import { verifySessionToken } from "@/services/security/auth";
import { DataClassification, RetentionPolicy } from "@/services/database/types";
// Fix #8: Import session store to trigger opportunistic cleanup on each upload
import { pptxSessionStore } from "@/services/documents/pptx-session-store";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  // Fix #8: Opportunistically clean up stale PPTX sessions (> 2h old) on each upload
  // to prevent disk accumulation of .orig.pptx/.trans.pptx files.
  try { pptxSessionStore.cleanup(); } catch {}
  try {
    const token =
      req.cookies.get("secure_session")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    const session = token ? verifySessionToken(token) : null;

    const userEmail = session?.email || "anonymous@secure.local";
    const userId = session?.id || "anonymous";

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const classification = (formData.get("classification") as DataClassification) || "confidential";
    const retentionPolicy = (formData.get("retentionPolicy") as RetentionPolicy) || "delete_immediately";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Save temporarily to private, non-public storage
    const stored = saveToPrivateStorage(buffer, file.name);

    // 2. Parse document and extract structure and term candidates
    const extracted = await documentProcessingService.processDocument(buffer, file.name);

    // 3. Register extracted terminology candidates under "review" status (NEVER auto-approved)
    const newTerms = extracted.termCandidates.map((c) => ({
      sourceTerm: c.sourceTerm,
      targetTerm: c.targetTerm,
      sourceLanguage: c.sourceLanguage,
      targetLanguage: c.targetLanguage,
      definition: c.definition,
      context: c.context,
      category: c.category || "General",
      sourceDocument: file.name,
      status: "review" as const, // Explicit review required by Section 14
      priority: 2,
      confidence: c.confidence,
      createdBy: userEmail,
      version: "v1.0",
    }));

    if (newTerms.length > 0) {
      db.addTerminology(newTerms);
    }

    // 4. Save document record in DB
    const docRecord = db.addDocument({
      ownerId: userId,
      fileName: file.name,
      fileType: extracted.fileType,
      classification,
      retentionPolicy,
      termCount: extracted.termCandidates.length,
      status: "processed",
      storagePath: retentionPolicy === "persist_until_manual" ? stored.filePath : undefined,
    });

    // 5. If retention policy is "delete_immediately", shred file now
    if (retentionPolicy === "delete_immediately") {
      secureDeleteFile(stored.filePath);
    }

    // 6. Zero-Leak Audit Log
    db.addAuditLog({
      userId,
      userEmail,
      operation: "DOCUMENT_PROCESSED",
      documentId: docRecord.id,
      status: "SUCCESS",
      durationMs: Date.now() - startTime,
      details: {
        fileType: extracted.fileType,
        termsExtracted: extracted.termCandidates.length,
        classification,
        retentionPolicy,
      },
    });

    return NextResponse.json({
      success: true,
      document: docRecord,
      extractedTermsCount: extracted.termCandidates.length,
      sectionsCount: extracted.sections.length,
      isScanned: extracted.metadata?.isScanned || false,
    });
  } catch (e: any) {
    db.addAuditLog({
      userId: "unknown",
      userEmail: "unknown",
      operation: "DOCUMENT_PROCESS_FAILED",
      status: "FAILURE",
      durationMs: Date.now() - startTime,
      errorCode: e.message,
    });

    return NextResponse.json({ error: e.message || "Failed to process document" }, { status: 500 });
  }
}
