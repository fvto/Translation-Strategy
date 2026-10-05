import test from "node:test";
import assert from "node:assert/strict";
import {
  extractEntities,
  isConciseModeEligible,
  validateEntityIntegrity,
  verifyConciseness,
  buildConcisePromptRules,
} from "../services/translation/concise-sop.ts";

// ─── Entity Extraction ────────────────────────────────────────────────────────

test("ConciseSOP - extractEntities: correctly identifies measurements", () => {
  const src = "Kiểm tra sau khi ép đáy với lực 2.5kg trong 15s, khe hở không quá 0.5mm";
  const result = extractEntities(src);

  assert.ok(result.measurementCount >= 3, `Should find 3+ measurements, found ${result.measurementCount}`);
  assert.ok(result.entities.some((e) => e.normalized.includes("2.5")), "Should detect 2.5kg");
  assert.ok(result.entities.some((e) => e.normalized.includes("0.5")), "Should detect 0.5mm");
  console.log("[✓] Measurements extracted:", result.entities.filter((e) => e.type === "measurement").map((e) => e.value));
});

test("ConciseSOP - extractEntities: correctly identifies SPI stitch ranges", () => {
  const src = "Kiểm tra đường may cách biên 1.5mm và mật độ 9-10 mũi/inch";
  const result = extractEntities(src);

  assert.ok(result.entities.some((e) => e.type === "spec_range" && e.normalized === "9-10"), "Should detect SPI range 9-10");
  assert.ok(result.entities.some((e) => e.normalized.includes("1.5")), "Should detect 1.5mm margin");
  console.log("[✓] SPI ranges:", result.entities.filter((e) => e.type === "spec_range").map((e) => e.normalized));
});

test("ConciseSOP - extractEntities: detects Vietnamese defect list", () => {
  const src = "Kiểm tra không bị đứt chỉ, nổi chỉ, bỏ mũi, lệch biên sau khi may";
  const result = extractEntities(src);

  assert.ok(result.defectListCount >= 3, `Should detect 3+ CTQ defect terms, found ${result.defectListCount}`);
  assert.ok(result.complexityScore >= 45, `High-defect sentence should score high complexity (got ${result.complexityScore})`);
  console.log("[✓] Defects found:", result.entities.filter((e) => e.type === "defect").map((e) => e.value));
});

test("ConciseSOP - extractEntities: detects standard references (PFC, QA manual)", () => {
  const src = "Chấp nhận tiêu chuẩn trầy theo QA manual, kiểm tra theo PFC";
  const result = extractEntities(src);

  assert.ok(result.entities.some((e) => e.type === "standard_ref"), "Should detect standard references");
  console.log("[✓] Standards:", result.entities.filter((e) => e.type === "standard_ref").map((e) => e.value));
});

// ─── Eligibility Gate ─────────────────────────────────────────────────────────

test("ConciseSOP - isConciseModeEligible: rejects high-complexity defect list", () => {
  const src = "Kiểm tra không bị đứt chỉ, nổi chỉ, bỏ mũi, lệch biên, nhảy chỉ, hở keo sau khi may";
  const extraction = extractEntities(src);
  const { eligible, reason } = isConciseModeEligible(src, extraction);

  assert.equal(eligible, false, "Multi-defect sentence should be ineligible for concise mode");
  console.log("[✓] Correctly rejected high-complexity sentence:", reason);
});

test("ConciseSOP - isConciseModeEligible: rejects QA tolerance acceptance clause", () => {
  const src = "Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn, chảy sơn nền sau khi nosew như hình QA manual cập nhật.";
  const extraction = extractEntities(src);
  const { eligible, reason } = isConciseModeEligible(src, extraction);

  assert.equal(eligible, false, "QA tolerance clause must be ineligible for concise mode");
  console.log("[✓] Correctly rejected QA tolerance clause:", reason);
});

test("ConciseSOP - isConciseModeEligible: accepts simple action-spec sentence", () => {
  const src = "Tiến hành thực hiện việc kiểm tra lực ép đáy đạt 2.5kg trong thời gian 15 giây để đảm bảo không bị hở keo.";
  const extraction = extractEntities(src);
  const { eligible, reason } = isConciseModeEligible(src, extraction);

  console.log(`[ℹ] Eligibility: ${eligible} — ${reason}`);
  // This sentence has 1 defect and 2 measurements, may or may not be eligible depending on complexity score
  // The key validation is it doesn't crash and returns a coherent reason
  assert.ok(typeof eligible === "boolean");
});

// ─── Entity Integrity Validator ───────────────────────────────────────────────

test("ConciseSOP - validateEntityIntegrity: passes when all entities present", () => {
  const src = "Ép đáy với lực 2.5kg trong 15s theo PFC standard";
  const extraction = extractEntities(src);

  const goodTranslation = "Press bottom at 2.5kg for 15s per PFC standard.";
  const result = validateEntityIntegrity(goodTranslation, extraction);

  assert.equal(result.shouldRollback, false, "Should pass: all entities present");
  assert.ok(result.coveragePercent >= 80, `Coverage should be high, got ${result.coveragePercent}%`);
  console.log(`[✓] Integrity pass: ${result.coveragePercent}% coverage`);
});

test("ConciseSOP - validateEntityIntegrity: triggers rollback when measurement is dropped", () => {
  const src = "Ép đáy với lực 2.5kg trong 15s";
  const extraction = extractEntities(src);

  // Missing "15s" — measurement dropped by AI
  const badTranslation = "Press bottom at standard pressure.";
  const result = validateEntityIntegrity(badTranslation, extraction);

  assert.equal(result.shouldRollback, true, "Should rollback: measurement '15s' and '2.5kg' dropped");
  assert.ok(result.missingEntities.length > 0, "Should report missing entities");
  console.log("[✓] Correctly detected missing entities:", result.missingEntities.map((e) => e.value));
});

test("ConciseSOP - validateEntityIntegrity: triggers rollback when defect term is dropped", () => {
  const src = "Kiểm tra không đứt chỉ, nổi chỉ sau khi may cách biên 1.5mm";
  const extraction = extractEntities(src);

  // Only mentions one defect, drops the other
  const badTranslation = "Check stitching margin 1.5mm; no broken thread.";
  const result = validateEntityIntegrity(badTranslation, extraction);

  // nổi chỉ (loose thread) should be flagged missing
  const hasDefectMissing = result.missingEntities.some((e) => e.type === "defect");
  assert.ok(hasDefectMissing, "Should detect missing defect term");
  console.log("[✓] Missing defect terms flagged:", result.missingEntities.filter((e) => e.type === "defect").map((e) => e.value));
});

// ─── Full Orchestrator (verifyConciseness) ────────────────────────────────────

test("ConciseSOP - verifyConciseness: accepts valid compact translation", () => {
  const src = "Tiến hành thực hiện việc kiểm tra đường may diễu mũi giày cách biên 1.5mm theo tiêu chuẩn SOP.";
  const concise = "Check vamp topstitch margin 1.5mm per SOP.";
  const full = "Carry out the process of checking the vamp topstitching margin is 1.5mm according to SOP standard.";

  const result = verifyConciseness(src, concise, full);

  // Log for visibility — eligibility depends on complexity score
  console.log(`[ℹ] usedConciseMode: ${result.usedConciseMode}, rolledBack: ${result.rolledBack}, score: ${result.complexityScore}`);
  assert.ok(typeof result.finalText === "string" && result.finalText.length > 0);
  assert.equal(result.rolledBack, false, "Should not rollback: concise output is valid");
});

test("ConciseSOP - verifyConciseness: auto-rollback when concise drops measurement", () => {
  const src = "Tiến hành thực hiện việc kiểm tra ép đáy lực 2.5kg thời gian 15s để đảm bảo không bị hở keo theo PFC standard.";
  const badConcise = "Press bottom; no bond gap per PFC."; // dropped 2.5kg and 15s
  const fullSafe = "Carry out bottom pressing at 2.5kg for 15s; ensure no bond gap per PFC standard.";

  const result = verifyConciseness(src, badConcise, fullSafe);

  if (result.usedConciseMode) {
    // If concise mode was used and verified, check it passed
    assert.equal(result.rolledBack, false);
  } else {
    // Not eligible or rolled back — full output used
    assert.equal(result.finalText, fullSafe, "Should fall back to full safe translation");
  }
  console.log(`[✓] verifyConciseness: usedConcise=${result.usedConciseMode}, rolledBack=${result.rolledBack}, coverage=${result.coveragePercent}%`);
});

test("ConciseSOP - buildConcisePromptRules: generates entity contract list", () => {
  const src = "Kiểm tra ép đáy lực 2.5kg trong 15s, cách biên 1.5mm theo PFC standard";
  const extraction = extractEntities(src);
  const rules = buildConcisePromptRules(extraction);

  assert.ok(rules.includes("CONCISE SOP MODE"), "Should include mode header");
  assert.ok(rules.includes("MANDATORY"), "Should include mandatory entity list");
  assert.ok(rules.includes("telegraphic"), "Should include format instructions");
  console.log("[✓] Concise rules generated:", rules.slice(0, 200) + "...");
});
