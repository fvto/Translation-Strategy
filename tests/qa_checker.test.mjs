import { test } from "node:test";
import assert from "node:assert/strict";
import { runQualityAssurance } from "../services/qa/checker.ts";

test("QA Checker - Detects Number and Percentage Preservation", () => {
  const source = "The 2026 budget allocated $500,000 with 99.9% uptime requirement.";
  const accurateTarget = "Ngân sách 2026 phân bổ $500,000 với yêu cầu thời gian hoạt động 99.9%.";

  const report = runQualityAssurance(source, accurateTarget);
  assert.equal(report.passed, true);
  assert.equal(report.checks.numbersPreserved, true);
  assert.equal(report.issues.length, 0);

  // Missing percentage
  const deficientTarget = "Ngân sách phân bổ với yêu cầu thời gian hoạt động cao.";
  const deficientReport = runQualityAssurance(source, deficientTarget);
  assert.equal(deficientReport.checks.numbersPreserved, false);
  assert.ok(deficientReport.issues.length > 0);
});

test("QA Checker - Enforces Acronym Preservation (ISO 27001, NIST CSF)", () => {
  const source = "Policies must conform to ISO 27001 and NIST CSF frameworks.";
  const goodTarget = "Các chính sách phải phù hợp với khung tiêu chuẩn ISO 27001 và NIST CSF.";

  const report = runQualityAssurance(source, goodTarget);
  assert.equal(report.checks.acronymsPreserved, true);
  assert.equal(report.issues.length, 0);

  // Corrupted acronyms
  const badTarget = "Các chính sách phải phù hợp với khung tiêu chuẩn chung.";
  const badReport = runQualityAssurance(source, badTarget);
  assert.equal(badReport.checks.acronymsPreserved, false);
  assert.ok(badReport.issues.some((i) => i.item === "ISO 27001"));
});


test("QA Checker - Footwear technical acronyms and measurement preservation (PFC, SPI, mm)", () => {
  const source = "Kiểm tra may cách biên 3.0mm 11-12 mũi/inch theo tiêu chuẩn PFC.";
  const validTranslation = "Check margin stitching 3.0mm SPI 11-12 stitches/inch according to PFC standard.";

  const report = runQualityAssurance(source, validTranslation);
  assert.equal(report.checks.numbersPreserved, true);
  assert.equal(report.checks.acronymsPreserved, true);
});
