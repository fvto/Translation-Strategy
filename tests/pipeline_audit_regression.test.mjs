import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  isVietnameseText,
  isPureEnglishText,
  hasVietnameseDiacritics,
  isSemanticBilingualPair,
} from "../services/translation/vietnamese-detector.ts";
import { db } from "../services/database/db.ts";
import { auditAndRepairPptxPostFlight } from "../services/qa/pptx-postflight-gate.ts";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { auditPptxGaps } from "../services/translation/smart-detector.ts";
import { applyPptxAuditSuggestions } from "../services/translation/pptx-smart-audit.ts";

test("Pipeline Regression 1: Unaccented Vietnamese and Code-switching Detection", () => {
  // Footwear operations with code-switching / unaccented terms
  assert.equal(isVietnameseText("May mudguard 1,2"), true, "Must detect 'May mudguard' as Vietnamese");
  assert.equal(isVietnameseText("*May logo"), true, "Must detect '*May logo' as Vietnamese");
  assert.equal(isVietnameseText("Kiem tra thiet bi"), true, "Must detect 'Kiem tra thiet bi' as Vietnamese");
  assert.equal(isVietnameseText("Quét primer lên đế"), true, "Must detect accented footwear operation as Vietnamese");

  // Pure English sentences with words that could collide with Vietnamese syllables
  assert.equal(
    isVietnameseText("Check the last, bottom to ensure they are 1/2 size larger than upper"),
    false,
    "Pure English sentence must not be detected as Vietnamese"
  );
  assert.equal(isPureEnglishText("Check the last, bottom to ensure they are 1/2 size larger than upper"), true);

  // English dates with month 'May'
  assert.equal(isVietnameseText("May 2026"), false, "English date 'May 2026' must not be flagged as Vietnamese");
  assert.equal(isPureEnglishText("May 2026"), true, "'May 2026' is pure English date");
});

test("Pipeline Regression 2: Semantic Bilingual Pairing Precision", () => {
  const glossary = [
    { id: "1", sourceTerm: "Sai liệu", targetTerm: "Wrong material", status: "approved" },
    { id: "2", sourceTerm: "May viền", targetTerm: "Stitch binding", status: "approved" },
  ];

  // Known defects and terms
  const validPair = isSemanticBilingualPair("Wrong material", "Sai liệu", glossary);
  assert.equal(validPair.isPair, true, "Known defect English and Vietnamese must pair");

  // Unrelated steps must never pair
  const mismatch1 = isSemanticBilingualPair("1. Place material in jig", "2. May logo", glossary);
  assert.equal(mismatch1.isPair, false, "Different step numbers must not pair");

  const mismatch2 = isSemanticBilingualPair("Upper Material Inspection", "Dừng khẩn cấp", glossary);
  assert.equal(mismatch2.isPair, false, "Unrelated processes must not pair");
});

test("Pipeline Regression 3: Glossary Review Sync and Priority Order", () => {
  // Test approved supersedes review in database
  db.addTerminology([
    {
      sourceTerm: "Kiểm tra keo dán",
      targetTerm: "Glue inspection draft",
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "review",
      domain: "assembly",
    },
    {
      sourceTerm: "Kiểm tra keo dán",
      targetTerm: "Cement application inspection",
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "approved",
      domain: "assembly",
    },
  ]);

  const glossary = db.getGlossaryReviewTerminology("vi", "en");
  const entry = glossary.find((e) => e.sourceTerm === "Kiểm tra keo dán");

  assert.ok(entry, "Term must exist in glossary review terminology");
  assert.equal(entry.status, "approved", "Approved entry must supersede review entry");
  assert.equal(entry.targetTerm, "Cement application inspection", "Target term must be the approved version");
});

test("Pipeline Regression 4: Post-Flight QA Gate Auto-repair and Zero Leaks", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr sz="1600"/><a:t>*Buffing:</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1200"/><a:t>1. Shape toe and check stitch</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1200"/><a:t>2. Maintain 9-10 SPI for Nosew Tipquarter</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1200"/><a:t>3. Kiểm tra dán đế ngoài</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await auditAndRepairPptxPostFlight(buffer, "replace_en", "en");
  assert.ok(report.repairedCount > 0, "Post-Flight QA Gate must proactively auto-repair issues");

  const outZip = await JSZip.loadAsync(report.auditedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  // Bold on process heading preserved
  assert.ok(outXml.includes('b="1"'), "Technical process heading must have bold preserved");

  // Inverted phrase fixed: Shape toe -> Toe shape
  assert.ok(outXml.includes("Toe shape"), "Inverted noun phrase 'Shape toe' must be repaired to 'Toe shape'");
  assert.ok(!outXml.includes("Shape toe"), "'Shape toe' must not remain");

  // SPI normalized
  assert.ok(outXml.includes("SPI 9-10 stitches/inch"), "SPI must be standardized to 'SPI 9-10 stitches/inch'");

  // No-sew and Tip-quarter hyphenated
  assert.ok(outXml.includes("No-sew"), "Nosew must be standardized to No-sew");
  assert.ok(outXml.includes("Tip-quarter"), "Tipquarter must be standardized to Tip-quarter");

  // Vietnamese leak auto-translated in replace_en English mode
  assert.ok(!hasVietnameseDiacritics(outXml), "No Vietnamese diacritics must leak in replace_en English mode");
});

test("Pipeline Regression 5: Multi-run Paragraph Translation without Throwing", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p>
      <a:r><a:rPr b="1"/><a:t>Check</a:t></a:r>
      <a:r><a:t> </a:t></a:r>
      <a:r><a:t>Equipment</a:t></a:r>
    </a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditPptxGaps(buffer, "test.pptx", { sourceLang: "en", targetLang: "vi" });
  assert.equal(audit.units.length, 1);

  // Apply suggestions even if unit has multi-run formatting
  const unit = audit.units[0];
  const applied = await applyPptxAuditSuggestions(buffer, "test.pptx", [unit.id], {
    sourceLang: "en",
    targetLang: "vi",
    customTranslations: { [unit.id]: "Kiểm tra thiết bị" },
  });

  assert.equal(applied.unhandledCount, 0, "All selected units must be handled");
  const outZip = await JSZip.loadAsync(applied.buffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outXml.includes("Kiểm tra thiết bị"), "Translated text must be applied cleanly into multi-run paragraph");
});

test("Pipeline Regression 6: AI Automation - Zero Glossary Blocking and Auto-Enforcement on Production Decks", async () => {
  const sourceText = "3.Kiểm tra sau khi lạng/mài độ rộng và độ dày phải theo tiêu chuẩn PFC cho từng bộ vị để tránh tình giày thành phẩm bị ngấn/cộm,trề biên liệu";
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p>
      <a:r><a:rPr sz="1200"/><a:t>${sourceText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a:t></a:r>
    </a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  // Mock provider returning initial translation with informal synonyms ("bulging" instead of "X-ray", "standard" instead of "quality standard")
  const mockProvider = {
    name: "mock-ai",
    translateBatch: async ({ items }) => ({
      results: new Map(
        items.map((i) => [
          i.id,
          "3. Check width and thickness after skiving/buffing must follow PFC standard for each component to avoid finished shoe having visible mark/bulging, overflow material edge",
        ])
      ),
      provider: "mock-ai",
      durationMs: 10,
    }),
    translate: async ({ sourceText }) => ({
      translatedText:
        "3. Check width and thickness after skiving/buffing must follow PFC standard for each component to avoid finished shoe having visible mark/bulging, overflow material edge",
      provider: "mock-ai",
      durationMs: 10,
    }),
  };

  // 1-Click AI Translation: Must NEVER throw or block delivery for user documents!
  const result = await pptxTranslatorService.translate(buffer, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
    fileName: "SP26 AIR JORDAN 1 TRIPLE STACK (MS-WS) QA IPQC-ISQ manual-EN_.pptx",
    translateMissingOnly: true,
    selectedUnitIds: ["s1_p0"],
    provider: mockProvider,
  });

  assert.ok(result.translatedBuffer, "Must successfully generate output buffer without blocking error");
  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  // Verify approved glossary compliance auto-enforcement
  assert.ok(outXml.includes("X-ray"), "Cộm must be auto-enforced as X-ray without manual intervention");
  assert.match(outXml, /quality standard/i, "Tiêu chuẩn must be auto-enforced as Quality standard");
  assert.ok(!hasVietnameseDiacritics(outXml), "Must contain zero Vietnamese leakage in delivered file");
});

