import fs from "fs";
import path from "path";
import crypto from "crypto";

const dbPath = path.resolve(process.cwd(), "data", "database.json");
const catalogPath = path.resolve(process.cwd(), "data", "defect_catalog.json");

if (!fs.existsSync(catalogPath)) {
  console.error("Defect catalog not found at", catalogPath);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));

const now = new Date().toISOString();

// Helper to check if string has Vietnamese diacritics or words
const VN_RE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

let addedCount = 0;
let updatedCount = 0;
let skippedCount = 0;

// Track existing terms by normalized sourceTerm
const termIndex = new Map<string, any>();
for (const t of db.terminology) {
  if (t.sourceTerm) {
    const key = t.sourceTerm.trim().toLowerCase().replace(/\s+/g, " ");
    termIndex.set(key, t);
  }
}

// 1. Process Threshold Standards (PDF1)
for (const item of catalog.thresholdStandards) {
  const vi = (item.nameVi || "").trim();
  const en = (item.nameEn || "").trim();
  const code = item.code || "";
  const threshold = item.threshold || "";
  const severity = item.severity || "";

  if (!vi || !en) {
    skippedCount++;
    continue;
  }

  // Strict glossary hygiene: source !== target
  if (vi.toLowerCase() === en.toLowerCase()) {
    skippedCount++;
    continue;
  }

  const key = vi.toLowerCase().replace(/\s+/g, " ");
  const contextStr = `QA Defect Threshold [Code: ${code} | Level: ${severity}${threshold ? ` | Max: ${threshold}` : ""}]`;
  const defStr = `Defect Code ${code}: ${en} (${vi}). Re-inspection standard: ${threshold}, Severity: ${severity}.`;

  const existing = termIndex.get(key);
  if (existing) {
    // Enrich existing
    if (!existing.context || !existing.context.includes(code)) {
      existing.context = existing.context ? `${existing.context}; ${contextStr}` : contextStr;
    }
    if (!existing.definition || existing.definition.length < defStr.length) {
      existing.definition = defStr;
    }
    if (!existing.category) {
      existing.category = "QA";
    }
    existing.targetTerm = en; // update to official Nike defect name
    existing.status = "approved";
    existing.priority = 1;
    existing.updatedAt = now;
    updatedCount++;
  } else {
    const newTerm = {
      id: `term_defect_p1_${code}_${crypto.randomBytes(3).toString("hex")}`,
      sourceTerm: vi,
      targetTerm: en,
      sourceLanguage: "vi",
      targetLanguage: "en",
      definition: defStr,
      context: contextStr,
      category: "QA",
      sourceDocument: "defect threshold , mã lỗi.pdf",
      status: "approved" as const,
      priority: 1,
      confidence: 1.0,
      createdBy: "system@nike-defects.local",
      approvedBy: "qa-lead@chingluh.local",
      version: "v2.0",
      createdAt: now,
      updatedAt: now
    };
    db.terminology.push(newTerm);
    termIndex.set(key, newTerm);
    addedCount++;
  }
}

// 2. Process Stage Defects (PDF2)
for (const item of catalog.stageDefects) {
  const vi = (item.nameVi || "").trim();
  const en = (item.nameEn || "").trim();
  const zh = (item.nameZh || "").trim();
  const code = item.code || "";
  let stage = item.stage || "SOP";
  if (stage === "Stiching") stage = "Stitching";

  if (!vi || !en) {
    skippedCount++;
    continue;
  }

  // Strict glossary hygiene
  if (vi.toLowerCase() === en.toLowerCase()) {
    skippedCount++;
    continue;
  }

  const key = vi.toLowerCase().replace(/\s+/g, " ");
  const contextStr = `${stage} Stage [Code: ${code}${zh ? ` | ZH: ${zh}` : ""}]`;
  const defStr = `Standard Footwear Defect in ${stage} Stage. Code: ${code}${zh ? ` (Chinese: ${zh})` : ""}. Standard translation: ${en}.`;

  const existing = termIndex.get(key);
  if (existing) {
    // Enrich existing
    if (!existing.context || !existing.context.includes(code)) {
      existing.context = existing.context ? `${existing.context}; ${contextStr}` : contextStr;
    }
    if (!existing.category || existing.category === "General" || existing.category === "ISQ") {
      existing.category = stage;
    }
    existing.targetTerm = en; // Use canonical standard
    existing.status = "approved";
    existing.priority = 1;
    existing.updatedAt = now;
    updatedCount++;
  } else {
    const newTerm = {
      id: `term_defect_p2_${code.replace(/[^a-zA-Z0-9]/g, "_")}_${crypto.randomBytes(3).toString("hex")}`,
      sourceTerm: vi,
      targetTerm: en,
      sourceLanguage: "vi",
      targetLanguage: "en",
      definition: defStr,
      context: contextStr,
      category: stage,
      sourceDocument: "Defective Name 1234VN.pdf",
      status: "approved" as const,
      priority: 1,
      confidence: 1.0,
      createdBy: "system@nike-defects.local",
      approvedBy: "qa-lead@chingluh.local",
      version: "v2.0",
      createdAt: now,
      updatedAt: now
    };
    db.terminology.push(newTerm);
    termIndex.set(key, newTerm);
    addedCount++;
  }
}

// 3. Register documents in db.documents if not present
if (!Array.isArray(db.documents)) {
  db.documents = [];
}

const doc1Index = db.documents.findIndex((d: any) => d.fileName === "defect threshold , mã lỗi.pdf");
if (doc1Index >= 0) {
  db.documents[doc1Index].termCount = catalog.thresholdStandards.length;
  db.documents[doc1Index].status = "processed";
} else {
  db.documents.push({
    id: "doc_defect_thresholds_pdf",
    ownerId: "admin",
    fileName: "defect threshold , mã lỗi.pdf",
    fileType: "pdf",
    classification: "internal",
    retentionPolicy: "persist_until_manual",
    termCount: catalog.thresholdStandards.length,
    status: "processed",
    createdAt: now
  });
}

const doc2Index = db.documents.findIndex((d: any) => d.fileName === "Defective Name 1234VN.pdf");
if (doc2Index >= 0) {
  db.documents[doc2Index].termCount = catalog.stageDefects.length;
  db.documents[doc2Index].status = "processed";
} else {
  db.documents.push({
    id: "doc_defective_name_1234vn_pdf",
    ownerId: "admin",
    fileName: "Defective Name 1234VN.pdf",
    fileType: "pdf",
    classification: "internal",
    retentionPolicy: "persist_until_manual",
    termCount: catalog.stageDefects.length,
    status: "processed",
    createdAt: now
  });
}

// 4. Audit Log
if (!Array.isArray(db.auditLogs)) {
  db.auditLogs = [];
}

db.auditLogs.push({
  id: `log_defect_import_${Date.now()}`,
  timestamp: now,
  userId: "admin",
  userEmail: "admin@chingluh.local",
  operation: "IMPORT_DEFECT_STANDARDS_PDF",
  status: "SUCCESS",
  durationMs: 450,
  details: {
    files: [
      "defect threshold , mã lỗi.pdf",
      "Defective Name 1234VN.pdf"
    ],
    thresholdStandardsCount: catalog.thresholdStandards.length,
    stageDefectsCount: catalog.stageDefects.length,
    newlyAddedTerms: addedCount,
    updatedExistingTerms: updatedCount,
    totalTermsInDatabase: db.terminology.length
  }
});

// Save database
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");

console.log("=== Defect Import Complete ===");
console.log(`Newly Added Terms: ${addedCount}`);
console.log(`Updated Existing Terms: ${updatedCount}`);
console.log(`Skipped (Hygiene / Empty): ${skippedCount}`);
console.log(`Total Terminology Count in Database: ${db.terminology.length}`);
console.log(`Documents registered in db.documents: ${db.documents.length}`);
