import test from "node:test";
import assert from "node:assert";
import {
  FOOTWEAR_ACRONYMS,
  buildAcronymPromptDirective,
  repairMistranslatedAcronyms,
} from "../services/terminology/acronym-resolver.ts";
import { enforceTerminologyCompliance } from "../services/terminology/enforcer.ts";

test("Acronym Resolver - Detects and builds prompt directives for O/S, M/S, and WB", () => {
  const text = "Kiểm tra hở keo tại O/S và WB";
  const directive = buildAcronymPromptDirective(text);

  assert.ok(directive.includes("FOOTWEAR FACTORY ACRONYM CONTEXT"));
  assert.ok(directive.includes("Outsole"));
  assert.ok(directive.includes("Water-based cement"));
  assert.ok(directive.includes("NEVER translate to: \"Operating System\""));
});

test("Acronym Resolver - Repairs hallucinated Operating System back to Outsole", () => {
  const mistranslated = "Bond gap detected on the Operating System";
  const repaired = repairMistranslatedAcronyms(mistranslated);
  assert.strictEqual(repaired, "Bond gap detected on the Outsole");
});

test("Acronym Resolver - Integrated into enforceTerminologyCompliance pipeline", () => {
  const source = "Lỗi tại O/S và keo WB";
  const translated = "Defect at Operating System and Warner Bros";

  const result = enforceTerminologyCompliance(source, translated, []);
  assert.ok(result.text.includes("Outsole"));
  assert.ok(result.text.includes("Water-based cement"));
  assert.ok(!result.text.includes("Operating System"));
  assert.ok(!result.text.includes("Warner Bros"));
});
