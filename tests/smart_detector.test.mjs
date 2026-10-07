import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  isNonTranslatable,
  isBilingualText,
  classifyTextUnit,
  auditPptxGaps,
  auditXlsxGaps,
  computeSourceHash,
} from "../services/translation/smart-detector.ts";
import { DocumentTranslationMemory } from "../services/translation/document-tm.ts";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { xlsxTranslatorService } from "../services/documents/xlsx.ts";

// Helper: build a mock 80-slide presentation buffer
async function createMock80SlidePptx(options = {}) {
  const zip = new JSZip();
  const untranslatedSlideSet = new Set(options.untranslatedSlides || []);
  const extraMissingSlideMap = options.extraMissingSlides || {}; // slideIndex -> count

  for (let s = 1; s <= 80; s++) {
    const isUntranslated = untranslatedSlideSet.has(s);
    const extraMissingCount = extraMissingSlideMap[s] || 0;

    let contentXml = "";

    if (isUntranslated) {
      // Newly added English content without Vietnamese
      contentXml = `
      <p:sp><p:txBody>
        <a:p><a:r><a:t>Quality Control Procedure for Slide ${s}</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>Needle Detection Standard</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>IPQC</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>Model XYZ-100</a:t></a:r></a:p>
      </p:txBody></p:sp>
      `;
    } else {
      // Already translated bilingual slides (EN on top, VI below)
      contentXml = `
      <p:sp><p:txBody>
        <a:p><a:r><a:t>Production Process Step ${s}</a:t></a:r></a:p>
        <a:p><a:r><a:t>Quy trình sản xuất bước ${s}</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>Upper Material Inspection</a:t></a:r></a:p>
        <a:p><a:r><a:t>Kiểm tra nguyên liệu mũ giày</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>IPQC</a:t></a:r></a:p>
      </p:txBody></p:sp>
      `;

      if (extraMissingCount > 0) {
        for (let m = 1; m <= extraMissingCount; m++) {
          contentXml += `
          <p:sp><p:txBody>
            <a:p><a:r><a:t>Unexpected English Note ${m} on Slide ${s}</a:t></a:r></a:p>
          </p:txBody></p:sp>
          `;
        }
      }
    }

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    ${contentXml}
  </p:spTree></p:cSld>
</p:sld>`;

    zip.file(`ppt/slides/slide${s}.xml`, slideXml);
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

// -----------------------------------------------------------------------------
// Test 1: 80-slide file with only slides 63–68 untranslated
// -----------------------------------------------------------------------------
test("Smart Detector - 1. 80-slide file with only slides 63–68 untranslated", async () => {
  const buffer = await createMock80SlidePptx({
    untranslatedSlides: [63, 64, 65, 66, 67, 68],
  });

  const audit = await auditPptxGaps(buffer, "SOP_Production_v12.pptx", {
    sourceLang: "en",
    targetLang: "vi",
  });

  assert.equal(audit.totalSlides, 80, "Must scan all 80 slides");
  assert.ok(audit.alreadyTranslatedCount > 200, "Must detect 200+ already translated units");
  assert.deepEqual(
    audit.affectedSlides,
    [63, 64, 65, 66, 67, 68],
    "Affected slides must match exactly 63–68"
  );
  assert.ok(audit.needsTranslationCount > 0, "Needs translation count must be positive");
  assert.ok(audit.estimatedGeminiRequests > 0, "Must estimate Gemini batches correctly");
});

// -----------------------------------------------------------------------------
// Test 2: Fully translated 80-slide file
// -----------------------------------------------------------------------------
test("Smart Detector - 2. Fully translated 80-slide file", async () => {
  const buffer = await createMock80SlidePptx({
    untranslatedSlides: [], // zero untranslated slides
  });

  const audit = await auditPptxGaps(buffer, "SOP_Fully_Translated.pptx", {
    sourceLang: "en",
    targetLang: "vi",
  });

  assert.equal(audit.totalSlides, 80);
  assert.equal(audit.needsTranslationCount, 0, "No units should need translation");
  assert.equal(audit.affectedSlides.length, 0, "Affected slides must be empty");
  assert.equal(audit.estimatedGeminiRequests, 0, "Zero Gemini requests needed");
  assert.ok(audit.alreadyTranslatedCount > 0, "All units recognized as already translated");
});

// -----------------------------------------------------------------------------
// Test 3: Mixed translated/untranslated content on the same slide
// -----------------------------------------------------------------------------
test("Smart Detector - 3. Mixed translated/untranslated content on the same slide", async () => {
  const zip = new JSZip();
  const slide64Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>Production Process</a:t></a:r></a:p>
      <a:p><a:r><a:t>Quy trình sản xuất</a:t></a:r></a:p>
    </p:txBody></p:sp>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>Quality Control Procedure</a:t></a:r></a:p>
    </p:txBody></p:sp>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>IPQC</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide64.xml", slide64Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditPptxGaps(buffer, "MixedSlide.pptx", {
    sourceLang: "en",
    targetLang: "vi",
  });

  const prodUnit = audit.units.find((u) => u.sourceText === "Production Process");
  const quyTrinhUnit = audit.units.find((u) => u.sourceText === "Quy trình sản xuất");
  const qcUnit = audit.units.find((u) => u.sourceText === "Quality Control Procedure");
  const ipqcUnit = audit.units.find((u) => u.sourceText === "IPQC");

  assert.equal(prodUnit?.status, "ALREADY_TRANSLATED");
  assert.equal(quyTrinhUnit?.status, "ALREADY_TRANSLATED");
  assert.equal(qcUnit?.status, "NEEDS_TRANSLATION");
  assert.equal(ipqcUnit?.status, "NON_TRANSLATABLE");

  assert.equal(audit.needsTranslationCount, 1, "Only Quality Control Procedure needs translation");
});

// -----------------------------------------------------------------------------
// Test 4: Existing TM terminology
// -----------------------------------------------------------------------------
test("Smart Detector - 4. Existing TM terminology", async () => {
  const docTM = new DocumentTranslationMemory();
  docTM.initializeDocumentTM(
    [],
    [],
    [
      {
        source: "Upper Material Inspection",
        target: "Kiểm tra nguyên liệu mũ giày",
        origin: "DOCUMENT",
      },
    ]
  );

  const res = classifyTextUnit("Upper Material Inspection", { slideIndex: 65 }, {
    sourceLang: "en",
    targetLang: "vi",
    docTM,
  });

  assert.equal(res.status, "TM_REUSE");
  assert.equal(res.suggestedTranslation, "Kiểm tra nguyên liệu mũ giày");
});

// -----------------------------------------------------------------------------
// Test 5: Existing Vietnamese translation
// -----------------------------------------------------------------------------
test("Smart Detector - 5. Existing Vietnamese translation", async () => {
  const res = classifyTextUnit("Kiểm tra cuối cùng", { slideIndex: 10 }, {
    sourceLang: "en",
    targetLang: "vi",
  });

  assert.equal(res.status, "ALREADY_TRANSLATED");
  assert.match(res.reason, /already in vietnamese/i);
});

// -----------------------------------------------------------------------------
// Test 6: English-only new content
// -----------------------------------------------------------------------------
test("Smart Detector - 6. English-only new content", async () => {
  const res = classifyTextUnit("Needle Detection Procedure", { slideIndex: 65 }, {
    sourceLang: "en",
    targetLang: "vi",
  });

  assert.equal(res.status, "NEEDS_TRANSLATION");
});

// -----------------------------------------------------------------------------
// Test 7: Acronyms such as IPQC/ISQ/SPI
// -----------------------------------------------------------------------------
test("Smart Detector - 7. Acronyms such as IPQC/ISQ/SPI", () => {
  const acronyms = ["IPQC", "ISQ", "SPI", "CTQ", "CAPA", "QMS", "ASTM", "PPM", "ERP", "MES"];
  for (const acr of acronyms) {
    assert.equal(isNonTranslatable(acr), true, `${acr} must be non-translatable`);
    const classified = classifyTextUnit(acr, {}, { sourceLang: "en", targetLang: "vi" });
    assert.equal(classified.status, "NON_TRANSLATABLE", `${acr} must be classified as NON_TRANSLATABLE`);
  }
});

// -----------------------------------------------------------------------------
// Test 8: Product codes
// -----------------------------------------------------------------------------
test("Smart Detector - 8. Product codes", () => {
  const codes = [
    "ABC-123",
    "Model XYZ-100",
    "SB-077-A-1",
    "(SBQ-083-6)",
    "P/O 2026-X1",
  ];
  for (const code of codes) {
    assert.equal(isNonTranslatable(code), true, `${code} must be non-translatable`);
    const classified = classifyTextUnit(code, {}, { sourceLang: "en", targetLang: "vi" });
    assert.equal(classified.status, "NON_TRANSLATABLE", `${code} must be NON_TRANSLATABLE`);
  }
});

// -----------------------------------------------------------------------------
// Test 9: Numbers
// -----------------------------------------------------------------------------
test("Smart Detector - 9. Numbers", () => {
  const numbers = ["2026", "98.5%", "12/05/2024", "1.5mm", "10-12", "0.05", "100%"];
  for (const num of numbers) {
    assert.equal(isNonTranslatable(num), true, `${num} must be non-translatable`);
    const classified = classifyTextUnit(num, {}, { sourceLang: "en", targetLang: "vi" });
    assert.equal(classified.status, "NON_TRANSLATABLE", `${num} must be NON_TRANSLATABLE`);
  }
});

// -----------------------------------------------------------------------------
// Test 10: Bilingual text
// -----------------------------------------------------------------------------
test("Smart Detector - 10. Bilingual text", () => {
  const multiline = "Final Inspection\nKiểm tra cuối cùng";
  const hyphenated = "Toe shape - Hình dạng mũi";
  const xray = "X-ray - Cộm";

  assert.equal(isBilingualText(multiline), true);
  assert.equal(isBilingualText(hyphenated), true);

  const resMulti = classifyTextUnit(multiline, {}, { sourceLang: "en", targetLang: "vi" });
  assert.equal(resMulti.status, "MIXED_LANGUAGE");

  const resHyphen = classifyTextUnit(hyphenated, {}, { sourceLang: "en", targetLang: "vi" });
  assert.equal(resHyphen.status, "MIXED_LANGUAGE");
});

// -----------------------------------------------------------------------------
// Test 11: Missing text on an unexpected slide
// -----------------------------------------------------------------------------
test("Smart Detector - 11. Missing text on an unexpected slide (e.g. Slide 42, 64, 77)", async () => {
  const buffer = await createMock80SlidePptx({
    untranslatedSlides: [63, 64, 65, 66, 67, 68],
    extraMissingSlides: {
      42: 1, // 1 missing box on Slide 42
      77: 2, // 2 missing boxes on Slide 77
    },
  });

  const audit = await auditPptxGaps(buffer, "SOP_With_Unexpected_Gaps.pptx", {
    sourceLang: "en",
    targetLang: "vi",
  });

  assert.equal(audit.totalSlides, 80);
  assert.ok(audit.affectedSlides.includes(42), "Must detect gap on unexpected Slide 42");
  assert.ok(audit.affectedSlides.includes(77), "Must detect gap on unexpected Slide 77");
  assert.ok(audit.affectedSlides.includes(63), "Must detect gap on Slide 63");
  assert.ok(audit.affectedSlides.includes(68), "Must detect gap on Slide 68");
});

// -----------------------------------------------------------------------------
// Test 12: Content moved between slides
// -----------------------------------------------------------------------------
test("Smart Detector - 12. Content moved between slides (Slide 50 -> Slide 70)", async () => {
  const docTM = new DocumentTranslationMemory();
  // Slide 50 in older version established this:
  docTM.initializeDocumentTM(
    [],
    [],
    [
      {
        source: "Collar Lining Alignment",
        target: "Căn chỉnh lót vòng cổ",
        origin: "DOCUMENT",
      },
    ]
  );

  // Content moved to Slide 70 in newer version
  const res = classifyTextUnit("Collar Lining Alignment", { slideIndex: 70 }, {
    sourceLang: "en",
    targetLang: "vi",
    docTM,
  });

  assert.equal(res.status, "TM_REUSE");
  assert.equal(res.suggestedTranslation, "Căn chỉnh lót vòng cổ");
});

// -----------------------------------------------------------------------------
// Test 13: Only missing items are sent to Gemini
// -----------------------------------------------------------------------------
test("Smart Detector - 13. Only missing items are sent to Gemini", async () => {
  const buffer = await createMock80SlidePptx({
    untranslatedSlides: [63], // only Slide 63 has 2 untranslated items
  });

  let totalItemsSentToGemini = 0;
  const mockGemini = {
    name: "gemini",
    async translateBatch(req) {
      totalItemsSentToGemini += req.items.length;
      const results = new Map();
      for (const it of req.items) {
        results.set(it.id, it.sourceText + " (Dịch)");
      }
      return { results, provider: "gemini", durationMs: 10 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockGemini,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
    translateMissingOnly: true, // ACTIVATE INCREMENTAL MODE
  });

  // Slide 63 has 2 untranslated text units ("Quality Control Procedure...", "Needle Detection...")
  // The rest of the 80 slides have over 300 already-translated items!
  assert.ok(
    totalItemsSentToGemini <= 2,
    `Gemini must ONLY receive untranslated items (received: ${totalItemsSentToGemini}), never 300+ units`
  );
  assert.ok(result.translatedBuffer.length > 0);
});

// -----------------------------------------------------------------------------
// Test 14: Existing translations are never modified
// -----------------------------------------------------------------------------
test("Smart Detector - 14. Existing translations are never modified", async () => {
  const buffer = await createMock80SlidePptx({
    untranslatedSlides: [63],
  });

  const zipBefore = await JSZip.loadAsync(buffer);
  const slide1XmlBefore = await zipBefore.file("ppt/slides/slide1.xml")?.async("string");

  const mockProvider = {
    name: "gemini",
    async translateBatch(req) {
      const results = new Map();
      for (const it of req.items) {
        results.set(it.id, "Bản dịch mới");
      }
      return { results, provider: "gemini", durationMs: 5 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
    translateMissingOnly: true,
  });

  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1XmlAfter = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  // Slide 1 had 0 missing units: its XML must be byte-for-byte identical to before!
  assert.equal(
    slide1XmlAfter,
    slide1XmlBefore,
    "Slide 1 XML must remain 100% byte-for-byte identical without any alteration"
  );
});

// -----------------------------------------------------------------------------
// Test 15: Existing formatting remains unchanged
// -----------------------------------------------------------------------------
test("Smart Detector - 15. Existing formatting remains unchanged", async () => {
  const zip = new JSZip();

  // Slide 1 has bold b="1", color srgbClr="0070C0", font sz="1400"
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:rPr b="1" sz="1400"><a:srgbClr val="0070C0"/></a:rPr><a:t>Approved Step Heading</a:t></a:r></a:p>
      <a:p><a:r><a:rPr b="1" sz="1400"><a:srgbClr val="0070C0"/></a:rPr><a:t>Tiêu đề bước đã duyệt</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 2 has missing unit
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>New Missing Instruction</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "gemini",
    async translateBatch(req) {
      const results = new Map();
      for (const it of req.items) results.set(it.id, "Hướng dẫn mới đã dịch");
      return { results, provider: "gemini", durationMs: 5 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "replace_en",
    translateMissingOnly: true,
  });

  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1XmlAfter = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slide1XmlAfter.includes('b="1"'), "Must preserve bold b=1");
  assert.ok(slide1XmlAfter.includes('val="0070C0"'), "Must preserve exact font color");
  assert.ok(slide1XmlAfter.includes('sz="1400"'), "Must preserve exact font size");
});

// -----------------------------------------------------------------------------
// Test 16: User cancellation leaves the source file untouched
// -----------------------------------------------------------------------------
test("Smart Detector - 16. User cancellation leaves the source file untouched", async () => {
  const buffer = await createMock80SlidePptx({ untranslatedSlides: [63] });
  const originalHash = computeSourceHash(buffer.toString("binary"));

  // User triggers audit
  const audit = await auditPptxGaps(buffer, "AuditOnly.pptx");
  assert.ok(audit.needsTranslationCount > 0);

  // User cancels: buffer is not touched
  const cancelledHash = computeSourceHash(buffer.toString("binary"));
  assert.equal(originalHash, cancelledHash, "Source file buffer must remain 100% byte-for-byte untouched");
});

// -----------------------------------------------------------------------------
// Test 17: Translation preview matches actual applied changes
// -----------------------------------------------------------------------------
test("Smart Detector - 17. Translation preview matches actual applied changes", async () => {
  const zip = new JSZip();
  const slide65Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>Quy trình kiểm tra kim</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide65.xml", slide65Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditPptxGaps(buffer, "PreviewMatch.pptx", {
    sourceLang: "vi",
    targetLang: "en",
  });

  const previewItem = audit.units.find((u) => u.sourceText === "Quy trình kiểm tra kim");
  assert.ok(previewItem, "Preview must contain Quy trình kiểm tra kim");
  assert.equal(previewItem.status, "NEEDS_TRANSLATION");

  const mockProvider = {
    name: "gemini",
    async translateBatch(req) {
      const results = new Map();
      for (const it of req.items) results.set(it.id, "Needle Detection Procedure");
      return { results, provider: "gemini", durationMs: 5 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
    translateMissingOnly: true,
  });

  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide65XmlAfter = await zipAfter.file("ppt/slides/slide65.xml")?.async("string");

  assert.ok(
    slide65XmlAfter.includes("Needle Detection Procedure"),
    "Applied change in final PPTX must match the translated item previewed in audit"
  );
});
