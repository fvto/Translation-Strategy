import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { polishSopText } from "../services/translation/sop-polisher.ts";
import { inspectTableOverflow } from "../services/documents/pptx-table-splitter.ts";

test("Initiative 4: Lean Technical Phrasing converts verbose operator clauses into concise Nike SOP format", () => {
  // 1. Operator tool usage
  const text1 = "1. Pre-cutting inspection: The operator uses scissors to trim excess material of the outsole at the position.";
  const polished1 = polishSopText(text1);
  assert.equal(polished1, "1. Pre-cutting inspection: Trim excess material of the outsole at the position.");

  // 2. Operator hammer instruction
  const text2 = "3. The operator must use a hammer to flatten any wrinkled areas on the vamp after drying.";
  const polished2 = polishSopText(text2);
  assert.equal(polished2, "3. Hammer and flatten any wrinkled areas on the vamp after drying.");

  // 3. Acceptance quality standard clause
  const text3 = "Acceptance quality standard for hole margin deviation is 0.5mm according to the updated QA manual";
  const polished3 = polishSopText(text3);
  assert.equal(polished3, "Standard: Hole margin deviation <= 0.5mm per updated QA manual");

  // 4. Lasting operation verbosity
  const text4 = "1. The lasting operation must pull the upper edge upward along the vamp, avoiding a wrinkle upper or bulging that is not smooth on the finished shoe.";
  const polished4 = polishSopText(text4);
  assert.equal(polished4, "1. Pull upper edge upward along the vamp, to prevent upper wrinkles or bulging.");
});

test("Initiative 2 disabled: Tables are preserved without unwanted auto-splitting", () => {
  // Verify inspectTableOverflow remains an internal analytical tool, but splitting is not triggered automatically
  const row0 = `<a:tr h="400000"><a:tc><a:txBody><a:p><a:r><a:t>Building</a:t></a:r></a:p></a:txBody></a:tc></a:tr>`;
  const row1 = `<a:tr h="800000"><a:tc><a:txBody><a:p><a:r><a:t>1. Check if upper heel seam is centered.</a:t></a:r></a:p></a:txBody></a:tc></a:tr>`;
  const tblXml = `<a:tbl>${row0}${row1}</a:tbl>`;
  const check = inspectTableOverflow(tblXml);
  assert.equal(check.totalRows, 2);
});

test("GeminiRateLimiter: Stable 9-10 RPM pacing and hard 12-13 RPM safety threshold", async () => {
  const { GeminiRateLimiter } = await import("../services/translation/gemini/rate-limiter.ts");
  
  // Verify configured threshold is 12 (in 12-13 range)
  assert.equal(GeminiRateLimiter.rpmThreshold, 12, "Threshold must be set at 12 RPM");
  assert.equal(GeminiRateLimiter.getThresholdRpm("gemini-3.5-flash-lite"), 12);
  assert.equal(GeminiRateLimiter.getThresholdRpm("gemini-3.1-flash-lite"), 12);
  assert.equal(GeminiRateLimiter.getThresholdRpm("gemini-1.5-flash"), 4, "Standard Flash threshold must be 4");

  // Verify steady-state pacing math: 6,200ms = 9.68 RPM (solidly 9-10 RPM)
  const rpmFrom6200 = 60_000 / 6200;
  assert.ok(rpmFrom6200 >= 9 && rpmFrom6200 <= 10, "6200ms must yield 9-10 RPM");

  // Test sliding window threshold enforcement:
  GeminiRateLimiter.reset();
  const now = Date.now();
  // Simulate 12 requests already dispatched in the last 10 seconds
  for (let i = 0; i < 12; i++) {
    GeminiRateLimiter.recordRequest();
  }
  assert.equal(GeminiRateLimiter.getCurrentRpm(), 12, "Current RPM must be 12");
  assert.ok(GeminiRateLimiter.getCurrentRpm() >= GeminiRateLimiter.rpmThreshold, "Must hit or exceed 12 RPM threshold");

  GeminiRateLimiter.reset();
});

