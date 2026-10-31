import test from "node:test";
import assert from "node:assert/strict";
import { classifyTextUnit } from "../services/translation/smart-detector.ts";
import { INTERNAL_SOP_EXAMPLES, findInternalSopExample } from "../services/translation/internal-sop.ts";
import { polishSopText } from "../services/translation/sop-polisher.ts";

test("Workspace and Smart Audit synchronization: Internal SOP Examples", () => {
  // Test that hot shaping inspection sentences from Workspace are in INTERNAL_SOP_EXAMPLES
  const tempSentence = "1. Kiểm tra nhiệt độ thực tế 80-90°C của định hình nóng, thời gian 30s, lực ép 4-6kg";
  const matched = findInternalSopExample(tempSentence, INTERNAL_SOP_EXAMPLES);
  assert.ok(matched, "Hot shaping temp inspection sentence must match internal SOP example");
  assert.match(matched, /^1\.\s*Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg\./i);
  assert.doesNotMatch(matched, /\bcheck\s+with\b/i, "Must never contain 'check with'");
});

test("Smart Audit classifyTextUnit recognizes Workspace internal SOP examples as LOCKED_TERMINOLOGY", () => {
  const source = "1. Kiểm tra nhiệt độ thực tế 80-90°C của định hình nóng, thời gian 30s, lực ép 4-6kg";
  const classified = classifyTextUnit(source, { slideIndex: 1, shapeIndex: 1, paragraphIndex: 1 }, {
    sourceLang: "vi",
    targetLang: "en",
  });

  assert.equal(classified.status, "LOCKED_TERMINOLOGY", "Approved internal example must be classified as LOCKED_TERMINOLOGY");
  assert.equal(classified.confidence, 1.0, "Confidence must be 1.0");
  assert.ok(classified.suggestedTranslation, "Must provide suggestedTranslation");
  assert.match(classified.suggestedTranslation, /^1\.\s*Check if hot mold temp is 80-90°C/i);
  assert.doesNotMatch(classified.suggestedTranslation, /\bcheck\s+with\b/i);
});

test("Smart Audit classifyTextUnit auto-polishes legacy 'Check with' in existingTranslation", () => {
  const source = "1. Kiểm tra nhiệt độ thực tế 80-90°C của định hình nóng, thời gian 30s, lực ép 4-6kg";
  const legacyTranslation = "1. Check with real temp 80-90°C of hold mold, time 30s, pressure 4-6kg.";
  
  const classified = classifyTextUnit(source, { slideIndex: 1, shapeIndex: 1, paragraphIndex: 1 }, {
    sourceLang: "vi",
    targetLang: "en",
    existingTranslation: legacyTranslation,
  });

  assert.ok(classified.suggestedTranslation, "Must supply suggestedTranslation");
  assert.doesNotMatch(classified.suggestedTranslation, /\bcheck\s+with\b/i, "Legacy 'Check with' must be polished away");
  assert.match(classified.suggestedTranslation, /^1\.\s*Check if hot mold temp is 80-90°C/i);
});

test("Workspace and Smart Audit synchronization: BPM logo inspection sentence", () => {
  const bpmSource = "4. Kiểm tra sau khi dập BPM, logo không bị cấn, trầy, để lại dấu trên bề mặt logo.";
  const matched = findInternalSopExample(bpmSource, INTERNAL_SOP_EXAMPLES);
  assert.ok(matched, "BPM logo inspection must match internal SOP example");
  assert.match(matched, /Check if logo has no marks, scratches, or under-paint cracks after BPM/i);
  assert.doesNotMatch(matched, /\bcheck\s+with\b/i);
});
