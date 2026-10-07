import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  DocumentTranslationMemory,
  canonicalizeText,
  exactCanonicalKey,
  isTechnicalTermCandidate,
} from "../services/translation/document-tm.ts";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { xlsxTranslatorService } from "../services/documents/xlsx.ts";
import { GeminiRateLimitError } from "../services/translation/gemini/types.ts";

test("Document TM - 1. Exact repeated phrase on later slide (Slide 3 -> Slide 15 enterprise proof)", async () => {
  const zip = new JSZip();

  // Slide 3 has "Upper Material Inspection"
  // Slide 15 has "Upper Material Inspection"
  const slide3Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Upper Material Inspection</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  const slide15Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Upper Material Inspection</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide3.xml", slide3Xml);
  zip.file("ppt/slides/slide15.xml", slide15Xml);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  let geminiCallsForUpperMaterial = 0;
  const mockGemini = {
    name: "gemini",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        if (item.sourceText === "Upper Material Inspection") {
          geminiCallsForUpperMaterial++;
          results.set(item.id, "Kiểm tra nguyên liệu mũ giày");
        } else {
          results.set(item.id, item.sourceText + " (trans)");
        }
      }
      return { results, provider: "gemini", durationMs: 5 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockGemini,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlide3 = await outZip.file("ppt/slides/slide3.xml")?.async("string");
  const outSlide15 = await outZip.file("ppt/slides/slide15.xml")?.async("string");

  assert.ok(outSlide3.includes("Kiểm tra nguyên liệu mũ giày"), "Slide 3 must contain approved translation");
  assert.ok(outSlide15.includes("Kiểm tra nguyên liệu mũ giày"), "Slide 15 must contain approved translation");

  // PROOF: Gemini must NOT be called repeatedly for the identical phrase on Slide 15!
  assert.equal(
    geminiCallsForUpperMaterial,
    1,
    "Gemini must only be called ONCE for 'Upper Material Inspection'; Slide 15 MUST reuse TM"
  );
});

test("Document TM - 2. Exact repeated sentence reuse across document", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.initializeDocumentTM([
    { id: "s1_p1", sourceText: "Check the upper material before stitching.", slideIndex: 1 },
    { id: "s8_p2", sourceText: "Check the upper material before stitching.", slideIndex: 8 },
  ]);

  // First occurrence established
  dtm.recordTranslation(
    "Check the upper material before stitching.",
    "Kiểm tra nguyên liệu mũ giày trước khi may.",
    { slide: 1 },
    "GEMINI"
  );

  // Planning for later unit
  const plan = dtm.planTranslations([
    { id: "s8_p2", sourceText: "Check the upper material before stitching.", slideIndex: 8 },
  ]);

  assert.equal(plan.preResolved.get("s8_p2"), "Kiểm tra nguyên liệu mũ giày trước khi may.");
  assert.equal(plan.itemsRequiringTranslation.length, 0, "No Gemini call required for exact repeated sentence");
});

test("Document TM - 3. Same technical term inside different sentences", () => {
  const dtm = new DocumentTranslationMemory();
  // Established term
  dtm.recordTranslation("upper material", "nguyên liệu mũ giày", { slide: 2 }, "GEMINI");

  // Translating a whole new sentence containing the term
  const source = "Check upper material before bonding.";
  // Gemini might return alternate wording like "Kiểm tra vật liệu phía trên trước khi kết dính."
  const geminiVariant = "Kiểm tra vật liệu phía trên trước khi kết dính.";

  const enforced = dtm.enforceDocumentTM(source, geminiVariant, "en", "vi");
  assert.ok(
    enforced.text.includes("nguyên liệu mũ giày"),
    `Must preserve established technical term 'nguyên liệu mũ giày', got: ${enforced.text}`
  );
});

test("Document TM - 4. Case normalization maintains canonical mapping", () => {
  assert.equal(canonicalizeText("Final Inspection"), canonicalizeText("FINAL INSPECTION"));
  assert.equal(canonicalizeText("final inspection"), canonicalizeText("Final Inspection"));

  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Final Inspection", "Kiểm tra cuối cùng", { slide: 1 }, "GEMINI");

  const lookupLower = dtm.lookup("final inspection");
  assert.ok(lookupLower, "Lower-case variation must match");
  assert.equal(lookupLower.target, "Kiểm tra cuối cùng");

  const lookupUpper = dtm.lookup("FINAL INSPECTION");
  assert.ok(lookupUpper, "Upper-case variation must match");
  assert.equal(lookupUpper.target, "Kiểm tra cuối cùng");
});

test("Document TM - 5. Whitespace normalization collapses extraneous spaces", () => {
  assert.equal(canonicalizeText("  Final   Inspection  "), "final inspection");
  assert.equal(exactCanonicalKey("  Final   Inspection  "), "final inspection");

  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Final Inspection", "Kiểm tra cuối cùng", { slide: 1 }, "GEMINI");

  const plan = dtm.planTranslations([
    { id: "u1", sourceText: "  Final   Inspection \t " },
  ]);
  assert.equal(plan.preResolved.get("u1"), "Kiểm tra cuối cùng");
});

test("Document TM - 6. Repeated table header in XLSX pre-resolves from TM", async () => {
  const workbookData = [
    {
      name: "Line 1",
      rows: [
        ["Upper Material", "Inspection Status", "Inspector"],
        ["Leather A", "Pass", "Nguyen"],
      ],
    },
    {
      name: "Line 2",
      rows: [
        ["Upper Material", "Inspection Status", "Inspector"],
        ["Synthetic B", "Pass", "Tran"],
      ],
    },
  ];

  let geminiCalls = 0;
  const mockProvider = {
    name: "gemini",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        geminiCalls++;
        if (item.sourceText === "Upper Material") results.set(item.id, "Nguyên liệu mũ giày");
        else if (item.sourceText === "Inspection Status") results.set(item.id, "Tình trạng kiểm tra");
        else if (item.sourceText === "Inspector") results.set(item.id, "Người kiểm tra");
        else results.set(item.id, item.sourceText);
      }
      return { results, provider: "gemini", durationMs: 2 };
    },
  };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const sheet of workbookData) {
    const ws = wb.addWorksheet(sheet.name);
    for (const r of sheet.rows) ws.addRow(r);
  }
  const buffer = await wb.xlsx.writeBuffer();

  const res = await xlsxTranslatorService.translateSpreadsheet(Buffer.from(buffer), {
    provider: mockProvider,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
  });

  assert.ok(res.translatedBuffer.length > 0);
  // Total unique header items = 3 ("Upper Material", "Inspection Status", "Inspector")
  // Sheet 2 MUST NOT trigger duplicate Gemini calls for repeated table headers
  assert.ok(geminiCalls <= 5, `Expected at most 5 unique calls across workbook, got ${geminiCalls}`);
});

test("Document TM - 7. Repeated process terminology preserves section prefixes (*)", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("*Hot/cool shaping:", "*Định hình nóng/lạnh:", { slide: 3 }, "GEMINI");

  const plan = dtm.planTranslations([
    { id: "u2", sourceText: "*Hot/cool shaping:" },
  ]);

  assert.equal(plan.preResolved.get("u2"), "*Định hình nóng/lạnh:");
});

test("Document TM - 8. LOCKED company glossary overrides Gemini", () => {
  const dtm = new DocumentTranslationMemory();
  const lockedGlossary = [
    {
      id: "term_lock_1",
      sourceTerm: "Upper Material",
      targetTerm: "Nguyên liệu mũ giày",
      sourceLanguage: "en",
      targetLanguage: "vi",
      status: "approved",
      priority: 10,
    },
  ];

  dtm.initializeDocumentTM([], lockedGlossary);

  // Gemini returns an unauthorized synonym
  const geminiResult = "Vật liệu phần trên";
  const enforced = dtm.enforceDocumentTM("Upper Material", geminiResult, "en", "vi");

  assert.equal(enforced.text, "Nguyên liệu mũ giày", "LOCKED glossary must override Gemini result");
});

test("Document TM - 9. APPROVED TM overrides Gemini suggestions", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.initializeDocumentTM(
    [],
    [],
    [{ source: "Final Inspection", target: "Kiểm tra cuối cùng", origin: "APPROVED_TM" }]
  );

  const enforced = dtm.enforceDocumentTM("Final Inspection", "Khảo sát kết thúc", "en", "vi");
  assert.equal(enforced.text, "Kiểm tra cuối cùng", "APPROVED TM must override Gemini synonym");
});

test("Document TM - 10. Earlier document translation reused on later slides", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.initializeDocumentTM([
    { id: "s2_p1", sourceText: "Needle Detection", slideIndex: 2 },
    { id: "s14_p3", sourceText: "Needle Detection", slideIndex: 14 },
  ]);

  // Slide 2 is translated first
  dtm.recordTranslation("Needle Detection", "Kiểm tra kim", { slide: 2 }, "GEMINI");

  // Slide 14 is planned next
  const plan = dtm.planTranslations([
    { id: "s14_p3", sourceText: "Needle Detection", slideIndex: 14 },
  ]);

  assert.equal(plan.preResolved.get("s14_p3"), "Kiểm tra kim");
  assert.equal(plan.itemsRequiringTranslation.length, 0);
});

test("Document TM - 11. Partial phrase reuse inside longer surrounding context", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Needle Detection", "Kiểm tra kim", { slide: 4 }, "GEMINI");

  // Slide 18 has: "Needle Detection Process"
  const source = "Needle Detection Process";
  const geminiOutput = "Quy trình phát hiện kim loại"; // Gemini translated the term differently

  const enforced = dtm.enforceDocumentTM(source, geminiOutput, "en", "vi");
  assert.equal(
    enforced.text,
    "Quy trình kiểm tra kim",
    `Must retain established term 'kiểm tra kim', got: ${enforced.text}`
  );
});

test("Document TM - 12. Similar but technically different phrases are NOT merged", () => {
  const key1 = canonicalizeText("Final Inspection");
  const key2 = canonicalizeText("Final Inspection Report");
  const key3 = canonicalizeText("Final Inspection Procedure");

  assert.notEqual(key1, key2, "Final Inspection and Final Inspection Report must be distinct");
  assert.notEqual(key1, key3, "Final Inspection and Final Inspection Procedure must be distinct");
  assert.notEqual(key2, key3, "Report and Procedure must be distinct");

  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Final Inspection", "Kiểm tra cuối cùng", { slide: 1 }, "GEMINI");

  // Plan for "Final Inspection Report" should NOT be pre-resolved using "Final Inspection"
  const plan = dtm.planTranslations([
    { id: "u_report", sourceText: "Final Inspection Report" },
  ]);
  assert.equal(plan.preResolved.has("u_report"), false, "Different technical phrases must not be merged");
  assert.equal(plan.itemsRequiringTranslation.length, 1);
});

test("Document TM - 13. Batch 3 accesses terminology established in Batch 1", () => {
  const dtm = new DocumentTranslationMemory();

  // Simulate Batch 1 (Slides 1-5)
  dtm.recordTranslation("Outsole Buffing", "Mài đế ngoài", { slide: 2 }, "GEMINI");

  // Simulate Batch 2 (Slides 6-10)
  dtm.recordTranslation("Vamp Cementing", "Quét keo mặt trước", { slide: 7 }, "GEMINI");

  // Simulate Batch 3 (Slides 11-15) querying prompt constraints
  const batch3Items = [
    { sourceText: "Inspect Outsole Buffing before Vamp Cementing." },
  ];
  const constraints = dtm.getPromptConstraints(batch3Items);

  const hasBuffing = constraints.some((c) => c.sourceTerm === "Outsole Buffing" && c.targetTerm === "Mài đế ngoài");
  const hasCementing = constraints.some((c) => c.sourceTerm === "Vamp Cementing" && c.targetTerm === "Quét keo mặt trước");

  assert.ok(hasBuffing, "Batch 3 must have access to Outsole Buffing from Batch 1");
  assert.ok(hasCementing, "Batch 3 must have access to Vamp Cementing from Batch 2");
});

test("Document TM - 14. Full-document pre-scan builds global TM occurrences", () => {
  const dtm = new DocumentTranslationMemory();
  const units = [
    { id: "u1", sourceText: "Heel Counter", slideIndex: 1, shapeIndex: 1 },
    { id: "u2", sourceText: "Heel Counter", slideIndex: 4, shapeIndex: 2 },
    { id: "u3", sourceText: "Heel Counter", slideIndex: 9, shapeIndex: 1 },
  ];

  dtm.initializeDocumentTM(units, [
    { id: "t1", sourceTerm: "Heel Counter", targetTerm: "Bộ đệm gót", sourceLanguage: "en", targetLanguage: "vi", status: "approved" },
  ]);

  const entry = dtm.lookup("Heel Counter");
  assert.ok(entry, "Heel Counter must exist in TM");
  assert.equal(entry.occurrences.length, 3, "All 3 slides must be recorded in occurrences");
});

test("Document TM - 15. Terminology survives Gemini retry", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Insole Attachment", "Dán đế trong", { slide: 2 }, "GEMINI");

  // Simulate a retry loop where first attempt failed with 503 / 429
  let attempts = 0;
  const mockTranslate = () => {
    attempts++;
    if (attempts < 2) {
      throw new GeminiRateLimitError("Rate limit", 1);
    }
    return "Dán đế trong";
  };

  let translated = "";
  try {
    translated = mockTranslate();
  } catch {
    translated = mockTranslate();
  }

  const enforced = dtm.enforceDocumentTM("Insole Attachment", translated, "en", "vi");
  assert.equal(enforced.text, "Dán đế trong", "Established terminology survives retry");
});

test("Document TM - 16. Terminology survives partial batch recovery", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Toe Spring", "Độ vênh mũi", { slide: 3 }, "GEMINI");

  // In a partial batch where 2 items succeeded and 1 was omitted
  const recoveredItem = { id: "u_omit", sourceText: "Toe Spring" };
  const plan = dtm.planTranslations([recoveredItem]);

  assert.equal(plan.preResolved.get("u_omit"), "Độ vênh mũi", "TM immediately resolves omitted item");
});

test("Document TM - 17. Terminology survives Google NMT fallback", () => {
  const dtm = new DocumentTranslationMemory();
  dtm.recordTranslation("Upper Material", "Nguyên liệu mũ giày", { slide: 1 }, "GEMINI");

  // Google NMT raw output translates generically
  const rawNmtOutput = "Vật liệu phần trên";
  const enforced = dtm.enforceDocumentTM("Upper Material", rawNmtOutput, "en", "vi");

  assert.equal(enforced.text, "Nguyên liệu mũ giày", "NMT fallback must strictly respect established TM");
});

test("Document TM - 18. Conflicting terminology is detected and recorded", () => {
  const dtm = new DocumentTranslationMemory();

  // Slide 3 establishes translation 1
  dtm.recordTranslation("Upper Material", "Nguyên liệu mũ giày", { slide: 3 }, "GEMINI");

  // Slide 12 provides translation 2 (conflict)
  dtm.recordTranslation("Upper Material", "Vật liệu mũ giày", { slide: 12 }, "GEMINI");

  const conflicts = dtm.getConflicts();
  assert.equal(conflicts.length, 1, "Conflict must be recorded");
  assert.equal(conflicts[0].sourceOriginal, "Upper Material");
  assert.equal(conflicts[0].winningTarget, "Nguyên liệu mũ giày");
  assert.equal(conflicts[0].conflictingTarget, "Vật liệu mũ giày");
});

test("Document TM - 19. Earliest established translation wins when no approved glossary exists", () => {
  const dtm = new DocumentTranslationMemory();

  // Earliest: Slide 3
  dtm.recordTranslation("Sockliner Emboss", "Dập nổi lót giày", { slide: 3 }, "GEMINI");

  // Later: Slide 9
  dtm.recordTranslation("Sockliner Emboss", "Ép logo lót", { slide: 9 }, "GEMINI");

  const entry = dtm.lookup("Sockliner Emboss");
  assert.equal(entry.target, "Dập nổi lót giày", "Earliest established translation must win");
});

test("Document TM - 20. Existing PPTX formatting remains unchanged", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr b="1" sz="1600"/><a:t>*Hot/cool shaping:</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1200"/><a:t>1. Upper Material Inspection</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "mock",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        if (item.sourceText.includes("*Hot/cool shaping:")) results.set(item.id, "*Định hình nóng/lạnh:");
        else results.set(item.id, "1. Kiểm tra nguyên liệu mũ giày");
      }
      return { results, provider: "mock", durationMs: 2 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  // Formatting verification:
  assert.ok(outSlideXml.includes('b="1"'), "Bold formatting on process heading must be strictly preserved");
  assert.ok(outSlideXml.includes("1. Kiểm tra nguyên liệu mũ giày"), "Numbered step must be translated");
  assert.ok(outSlideXml.includes("*Định hình nóng/lạnh:"), "Process heading must be translated");
});
