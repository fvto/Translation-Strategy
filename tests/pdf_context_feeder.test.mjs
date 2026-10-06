import test from "node:test";
import assert from "node:assert";
import { feedPdfContextToGlossary } from "../services/terminology/pdf-context-feeder.ts";

test("PDF Context Feeder - Extracts text without scanning or extracting images (Zero-Image Shield)", async () => {
  const samplePdfContent = `%PDF-MOCK-FA25
Trang 1: Hướng dẫn SOP lắp ráp giày thể thao Nike FA25
Nắp gót đúc : Molded heel counter cap
Đường viền lưỡi gà : Tongue binding trim
Độ bám dính đế : Outsole bond adhesion
Kiểm tra độ gập ghềnh và bọt khí ở phần dán đế.
Quy trình: Quét keo và dán mos theo tiêu chuẩn QAM.`;

  const pdfBuffer = Buffer.from(samplePdfContent, "utf8");

  const res = await feedPdfContextToGlossary(pdfBuffer, "Nike_FA25_SOP_Spec.pdf", {
    defaultStage: "Assembly",
    autoSaveToReview: false,
  });

  // 1. Strict Security & Confidentiality Assertion: Zero Images Extracted
  assert.strictEqual(res.imageShieldActive, true, "Zero-Image Shield must be strictly active");
  assert.strictEqual(res.imagesExtracted, 0, "Images extracted must strictly be 0");

  // 2. Text and Terminology assertions
  assert.strictEqual(res.totalPages, 1);
  assert.ok(res.totalCharacters > 50, "Extracted text characters from digital layer");
  assert.ok(res.candidateTerms.length > 0, "Must harvest candidate terms from text layer");

  // 3. Verify term formatting and domain rules
  const foundCandidate = res.candidateTerms.find(
    (t) => t.sourceTerm.toLowerCase().includes("nắp gót") || t.targetTerm.toLowerCase().includes("heel counter")
  );
  assert.ok(foundCandidate, "Must extract novel footwear term 'Nắp gót đúc'");
  assert.match(foundCandidate.context, /Trang 1/, "Context must track source page snippet");

  // 4. Verify no sentences leaked as terms (max 4 words)
  for (const c of res.candidateTerms) {
    assert.ok(
      c.sourceTerm.split(/\s+/).length <= 4,
      `Term "${c.sourceTerm}" exceeds maximum 4 words`
    );
    assert.doesNotMatch(
      c.sourceTerm,
      /[\.\?\!\;]/,
      `Term "${c.sourceTerm}" must not contain sentence punctuation`
    );
  }
});

test("PDF Context Feeder - Rejects scanned PDFs without digital text layer", async () => {
  const scannedPdfMock = "%PDF-MOCK-SCAN\n   \n";
  const pdfBuffer = Buffer.from(scannedPdfMock, "utf8");

  await assert.rejects(
    async () => {
      await feedPdfContextToGlossary(pdfBuffer, "Scanned_Image_Only.pdf");
    },
    /Zero-Image Shield/i,
    "Should reject scanned PDFs and refuse OCR for confidentiality"
  );
});

test("PDF Context Feeder - Normalizes glued Tipquarter and unhyphenated Tip quarter to Tip-quarter", async () => {
  const samplePdfContent = `%PDF-MOCK-TIPQUARTER
Trang 1: Tiêu chuẩn kiểm tra Tipquarter và Tip quarter
Độ nhạt màu Tipquarter : Tipquarter color fading
Độ lệch màu Tip quarter : Tip quarter color variation`;

  const pdfBuffer = Buffer.from(samplePdfContent, "utf8");

  const res = await feedPdfContextToGlossary(pdfBuffer, "Tipquarter_Spec.pdf", {
    defaultStage: "Assembly",
    autoSaveToReview: false,
  });

  // Verify that any candidate terms containing Tipquarter/Tip quarter have been normalized to Tip-quarter
  for (const c of res.candidateTerms) {
    assert.doesNotMatch(c.sourceTerm, /\bTipquarter\b/, "Source term must not contain glued Tipquarter");
    assert.doesNotMatch(c.targetTerm, /\bTipquarter\b/, "Target term must not contain glued Tipquarter");
    if (c.targetTerm.toLowerCase().includes("tip")) {
      assert.match(c.targetTerm, /Tip-quarter/i, "Target term must use hyphenated Tip-quarter");
    }
  }
});

