import test from "node:test";
import assert from "node:assert/strict";
import {
  matchRelevantRules,
  buildDynamicRulesPrompt,
  checkProhibitedPhrases,
  applyDynamicAutoRepairs,
  DEFAULT_SOP_RULES,
} from "../services/rules/sop-rule-engine.ts";

test("SOP Rule Engine - Matches rules dynamically based on content triggers", () => {
  const toleranceText = "Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn";
  const matched = matchRelevantRules(toleranceText);
  assert.ok(matched.some((r) => r.id === "rule_surface_tolerance"), "Should match surface tolerance rule");

  const spiText = "Kiểm tra mật độ 10-12 mũi/inch";
  const matchedSpi = matchRelevantRules(spiText);
  assert.ok(matchedSpi.some((r) => r.id === "rule_spi_formatting"), "Should match SPI rule");

  const ctqText = "Hình dạng mũi: kiểm tra độ cân xứng";
  const matchedCtq = matchRelevantRules(ctqText);
  assert.ok(matchedCtq.some((r) => r.id === "rule_ctq_noun_adjunct"), "Should match CTQ noun adjunct rule");

  const headingText = "*Buffing: mài đều bề mặt";
  const matchedHeading = matchRelevantRules(headingText);
  assert.ok(matchedHeading.some((r) => r.id === "rule_process_headings_bold"), "Should match heading bold rule");

  const genericText = "Hello world";
  const matchedGeneric = matchRelevantRules(genericText);
  assert.equal(matchedGeneric.length, 0, "Generic text with no triggers should not match any rules");
});

test("SOP Rule Engine - Builds lean contextual prompts without prompt bloat", () => {
  const textWithTolerance = "Bề mặt lồi lõm không bằng phẳng chấp nhận mức độ tiêu chuẩn";
  const prompt = buildDynamicRulesPrompt(textWithTolerance);
  assert.ok(prompt.includes("Dung sai kỹ thuật"), "Prompt should contain matched rule");
  assert.ok(prompt.includes("không bằng phẳng chấp nhận"), "Prompt should contain guidance");

  const promptEmpty = buildDynamicRulesPrompt("Đo kích thước chiều dài 150mm");
  assert.equal(promptEmpty, "", "Prompt should be empty when no contextual rule matches");
});

test("SOP Rule Engine - Detects prohibited phrases and auto-repairs translations", () => {
  const badTranslation = "Due to the surface, flat does not accept the quality standard swoosh paint.";
  const violations = checkProhibitedPhrases(badTranslation);
  assert.ok(violations.length > 0, "Should detect 'flat does not accept' violation");
  assert.equal(violations[0].ruleId, "rule_surface_tolerance");

  const repairResult = applyDynamicAutoRepairs(badTranslation);
  assert.equal(repairResult.repaired, true, "Should trigger auto-repair");
  assert.ok(repairResult.text.includes("quality standards are acceptable"), "Should replace with canonical quality standard phrasing without tolerances");
  assert.ok(!repairResult.text.toLowerCase().includes("tolerance"), "Should not contain the word tolerance");

  // Inverted CTQ repair
  const badCtq = "1. Shape tip: must be symmetrical";
  const ctqViolations = checkProhibitedPhrases(badCtq);
  assert.ok(ctqViolations.some((v) => v.ruleId === "rule_ctq_noun_adjunct"), "Should flag 'Shape tip'");

  const ctqRepair = applyDynamicAutoRepairs(badCtq);
  assert.equal(ctqRepair.repaired, true);
  assert.ok(ctqRepair.text.includes("Tip shape"));
});
