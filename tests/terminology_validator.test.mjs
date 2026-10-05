import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTranslationTerminology } from "../services/terminology/validator.ts";

test("Terminology Validator - Compliant Translation Passes", () => {
  const glossary = [
    {
      id: "term_1",
      sourceTerm: "Risk Assessment",
      targetTerm: "Đánh giá rủi ro",
      sourceLanguage: "en",
      targetLanguage: "vi",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
  ];

  const source = "Risk Assessment must be completed annually.";
  const translation = "Đánh giá rủi ro phải được hoàn thành hàng năm.";

  const report = validateTranslationTerminology(source, translation, glossary);
  assert.equal(report.isValid, true);
  assert.equal(report.complianceScore, 100);
  assert.equal(report.mismatches.length, 0);
});

test("Terminology Validator - Flags Mismatch When Translation Deviates", () => {
  const glossary = [
    {
      id: "term_1",
      sourceTerm: "Risk Assessment",
      targetTerm: "Đánh giá rủi ro",
      sourceLanguage: "en",
      targetLanguage: "vi",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
  ];

  // Translation used generic translation "đánh giá nguy cơ" instead of approved "Đánh giá rủi ro"
  const source = "Risk Assessment must be completed annually.";
  const translation = "đánh giá nguy cơ phải được hoàn thành hàng năm.";

  const report = validateTranslationTerminology(source, translation, glossary);
  assert.equal(report.isValid, false);
  assert.equal(report.complianceScore, 0);
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0].sourceTerm, "Risk Assessment");
  assert.equal(report.mismatches[0].expectedTarget, "Đánh giá rủi ro");
});
