import test from "node:test";
import assert from "node:assert";
import { db } from "../services/database/db.ts";
import { matchTerminology } from "../services/terminology/matcher.ts";
import { validateTranslationTerminology } from "../services/terminology/validator.ts";
import { enforceTerminologyCompliance } from "../services/terminology/enforcer.ts";

test("Terminology Compliance - VI -> EN Core Footwear Defects Mapping in Database", () => {
  const glossary = db.getApprovedTerminology("vi", "en");

  const expectedMappings = [
    { vi: "bọt khí", expectedRegex: /air\s*bubble/i },
    { vi: "hở keo", expectedRegex: /bond\s*gap/i },
    { vi: "độ gập ghềnh", expectedRegex: /rocking/i },
    { vi: "độ ổn định", expectedRegex: /rocking/i },
    { vi: "sụp mí", expectedRegex: /run[\s-]off\s*stitching/i },
    { vi: "mài cao", expectedRegex: /over\s*buffing/i },
    { vi: "lộn chân", expectedRegex: /swapped\s*feet/i },
    { vi: "lót vòng cổ", expectedRegex: /collar\s*lining/i },
    { vi: "vòng cổ", expectedRegex: /collar\s*opening/i },
    { vi: "đế trung", expectedRegex: /midsole/i },
    { vi: "đế ngoài", expectedRegex: /outsole/i },
    { vi: "mặt trước", expectedRegex: /vamp/i },
    { vi: "ngấn", expectedRegex: /visible\s*mark|demolding\s*mark/i },
  ];

  for (const item of expectedMappings) {
    const matched = matchTerminology(item.vi, glossary);
    assert.ok(matched.length > 0, `Expected match for source term "${item.vi}"`);
    const target = matched[0].entry.targetTerm;
    assert.match(
      target,
      item.expectedRegex,
      `Expected "${item.vi}" to map to ${item.expectedRegex}, got "${target}"`
    );
  }
});

test("Terminology Compliance - Post-Translation Enforcer corrects synonyms and deviations", () => {
  const glossary = db.getApprovedTerminology("vi", "en");

  const testCases = [
    {
      source: "Kiểm tra độ gập ghềnh và bọt khí ở phần đế trung, phát hiện hở keo và sụp mí.",
      deviated: "Check unevenness and bubbles in the midsole, detect open glue and collapsed edge.",
      expectedSubstrings: ["rocking", "air bubble", "midsole", "bond gap", "run-off stitching"],
    },
    {
      source: "Chú ý mài cao trên bề mặt da và lộn chân khi đóng thùng.",
      deviated: "Caution on high buffing on the leather surface and material folding during packing.",
      expectedSubstrings: ["over buffing", "swapped feet"],
    },
    {
      source: "May lót vòng cổ cách biên 2mm, 10-12 mũi/inch, kiểm tra ngấn.",
      deviated: "Stitch collar pad margin 2mm, 10-12 SPI, check slight mark.",
      expectedSubstrings: ["collar lining", "SPI 10-12 stitches/inch", "visible mark"],
    },
    {
      source: "CTQ 3- Nosew không tràn keo /hở keo/bao không, mặt trước không dính bụi bẩn, khác màu",
      deviated: "CTQ 3 - No-sew without cement overflow / open glue / air bubble, vamp free of dirt, color migration",
      expectedSubstrings: ["Nosew", "bond gap"],
    },
  ];

  for (const tc of testCases) {
    const enforced = enforceTerminologyCompliance(tc.source, tc.deviated, glossary, "vi", "en");
    const lower = enforced.text.toLowerCase();

    for (const sub of tc.expectedSubstrings) {
      assert.ok(
        lower.includes(sub.toLowerCase()),
        `Expected enforced text to contain "${sub}". Got: "${enforced.text}"`
      );
    }

    const validation = validateTranslationTerminology(tc.source, enforced.text, glossary);
    assert.strictEqual(
      validation.mismatches.length,
      0,
      `Expected 0 mismatches after enforcement. Found: ${JSON.stringify(validation.mismatches)}`
    );
    assert.strictEqual(validation.complianceScore, 100);
  }
});

test("Terminology Compliance - Recency & Manual User Edit Supersedes Older Imported Terms", () => {
  const sourceTerm = "thử nghiệm từ vựng mới";
  const oldTarget = "old generic test";
  const newTarget = "specialized standard test";

  let res1 = [];
  let res2 = [];

  try {
    // Add older term
    res1 = db.addTerminology([
      {
        sourceTerm,
        targetTerm: oldTarget,
        sourceLanguage: "vi",
        targetLanguage: "en",
        category: "Test",
        status: "approved",
        priority: 1,
      },
    ]);

    // Update with newer target
    res2 = db.addTerminology([
      {
        sourceTerm,
        targetTerm: newTarget,
        sourceLanguage: "vi",
        targetLanguage: "en",
        category: "Test",
        status: "approved",
        priority: 1,
      },
    ]);

    const glossary = db.getApprovedTerminology("vi", "en");
    const matched = matchTerminology(sourceTerm, glossary);
    assert.ok(matched.length > 0);
    assert.strictEqual(matched[0].entry.targetTerm, newTarget);
  } finally {
    // Guaranteed cleanup: test terms are always purged after test execution
    if (res1[0]?.id) db.deleteTerm(res1[0].id);
    if (res2[0]?.id) db.deleteTerm(res2[0].id);
    const remnants = db.getTerminology({ search: sourceTerm });
    for (const r of remnants) {
      if (r.sourceTerm === sourceTerm) {
        db.deleteTerm(r.id);
      }
    }
  }
});

test("Terminology Compliance - Replaces erroneous words in sentence without appending brackets to end of text", () => {
  const glossary = db.getApprovedTerminology("vi", "en");
  const source = "1. Kiểm tra đế có nhăn không\n2. Thao tác công nhân dán đế suôn đều theo đường quét keo\n3. Kiểm tra hơ đế phải đều để không bị nhăn\n4. Kiểm tra giày thành phẩm để không nhăn";
  const deviated = "1. Check if the sole is not wrinkled. 2. Workers' work on the sole is done by scanning the sole. 3. Check if the right foot is not wrinkled. 4. Check if the sole is not wrinkled.";

  const enforced = enforceTerminologyCompliance(source, deviated, glossary, "vi", "en");

  // Must replace in sentence 2, not append [operation] to sentence 4
  assert.doesNotMatch(enforced.text, /\[operation\]/i, "Must not append [operation] to end of text");
  assert.match(enforced.text, /operation/i, "Must contain operation in place of erroneous word");
  assert.ok(
    enforced.text.includes("2. Operation on the sole") ||
    enforced.text.includes("2. Worker operation") ||
    enforced.text.toLowerCase().includes("operation on the sole"),
    `Expected sentence 2 to contain operation. Got: "${enforced.text}"`
  );
});

