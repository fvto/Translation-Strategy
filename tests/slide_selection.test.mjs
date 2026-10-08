import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseSlideRange, detectDynamicSlidePairs } from "../services/documents/pptx-slide-order";
import { pptxTranslatorService } from "../services/documents/pptx-translator";
import { auditPptxGaps } from "../services/translation/smart-detector";

test("parseSlideRange: parses single numbers, ranges, and comma/space separated strings", () => {
  assert.deepEqual(parseSlideRange("1, 3, 5"), [1, 3, 5]);
  assert.deepEqual(parseSlideRange("1-3, 5"), [1, 2, 3, 5]);
  assert.deepEqual(parseSlideRange("10 - 12; 15, 20"), [10, 11, 12, 15, 20]);
  assert.deepEqual(parseSlideRange("  63-68  "), [63, 64, 65, 66, 67, 68]);
});

test("parseSlideRange: respects maxSlides bound and handles duplicates/unordered entries", () => {
  assert.deepEqual(parseSlideRange("5, 2, 5, 1-3", 10), [1, 2, 3, 5]);
  assert.deepEqual(parseSlideRange("8-15", 10), [8, 9, 10]);
  assert.deepEqual(parseSlideRange(""), []);
  assert.deepEqual(parseSlideRange("   "), []);
});

test("detectDynamicSlidePairs: detects interleaved 1.EN 1.VI 2.EN 2.VI slide pairs", async () => {
  const zip = new JSZip();

  // Slide 1: 1.EN
  const s1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>1. EN Collar Stitching Standard</a:t></a:r></a:p>
      <a:p><a:r><a:t>Ensure smooth stitching line</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 2: 1.VI
  const s2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>1. VI Tiêu chuẩn may vòng cổ</a:t></a:r></a:p>
      <a:p><a:r><a:t>Đảm bảo đường may suông đều không nhăn</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 3: 2.EN
  const s3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>2. EN Hot Melt Shaping</a:t></a:r></a:p>
      <a:p><a:r><a:t>Place upper into shaping mold</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 4: 2.VI
  const s4 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>2. VI Định hình nhiệt</a:t></a:r></a:p>
      <a:p><a:r><a:t>Đặt mặt giày vào khuôn định hình</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", s1);
  zip.file("ppt/slides/slide2.xml", s2);
  zip.file("ppt/slides/slide3.xml", s3);
  zip.file("ppt/slides/slide4.xml", s4);

  const pairs = await detectDynamicSlidePairs(zip);
  assert.equal(pairs.length, 2, "Must detect exactly 2 interleaved pairs");
  assert.equal(pairs[0].en, "ppt/slides/slide1.xml");
  assert.equal(pairs[0].vi, "ppt/slides/slide2.xml");
  assert.equal(pairs[1].en, "ppt/slides/slide3.xml");
  assert.equal(pairs[1].vi, "ppt/slides/slide4.xml");
});

test("Smart Audit: In-container interleaved pairs (1.EN 1.VI 2.EN 2.VI) are paired and never leak '1' as a variant", async () => {
  const zip = new JSZip();

  // Slide with the exact structure from the user's screenshot
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:t>1. Check if the upper stitching collar is smooth and even, and hammering according to the standard.</a:t></a:r></a:p>
        <a:p><a:r><a:t>1.Kiểm tra mặt giày may vòng cổ có suông đều và dập bằng đúng tiêu chuẩn không</a:t></a:r></a:p>
        <a:p><a:r><a:t>2. Check if the worker's operation of placing the upper into the shaping mold is in the correct position.</a:t></a:r></a:p>
        <a:p><a:r><a:t>2.Thao tác công nhân đặt mặt giày vào khuôn định hình có ngay vị trí không</a:t></a:r></a:p>
        <a:p><a:r><a:t>3. Ensure the collar shape after shaping is straight, free of wrinkles, free of cement overflow, and the collar lining and upper must be edge even without being short.</a:t></a:r></a:p>
        <a:p><a:r><a:t>3. Đảm bảo hình dạng vòng cổ sau khi định hình phải thẳng, ko nhăn, tràn keo ,lót vòng cổ và mặt giày phải bằng mí không được hụt</a:t></a:r></a:p>
        <a:p><a:r><a:t>4. Check if the lasting is aligned with the position markers.</a:t></a:r></a:p>
        <a:p><a:r><a:t>4. Kiểm tra vô phom có ngay định vị không</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await auditPptxGaps(buffer, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  // Verify that all 4 Vietnamese items were successfully paired with their English counterparts
  const viUnits = auditReport.units.filter((u) => u.sourceText.includes("Kiểm tra") || u.sourceText.includes("Thao tác") || u.sourceText.includes("Đảm bảo"));
  assert.equal(viUnits.length, 4);

  for (const vu of viUnits) {
    assert.equal(vu.status, "ALREADY_TRANSLATED", `Unit "${vu.sourceText.slice(0, 20)}" must be ALREADY_TRANSLATED`);
    assert.ok(vu.existingTranslation, "Must have existing English translation paired");
  }

  // Verify that NO translation group or variant contains a bare "1"
  for (const g of auditReport.groups || []) {
    for (const v of g.variants || []) {
      assert.notEqual(v.text.trim(), "1", "Bare '1' must never be a translation variant");
    }
  }
});

test("Selective Slide Translation: only translates slides in slideRange, leaves non-selected slides 100% untouched", async () => {
  const zip = new JSZip();

  const uniqueRunId = Date.now();
  const slide1Text = `Bước không chọn ${uniqueRunId}`;
  const slide2Text = `Bước được chọn ${uniqueRunId}`;

  // Slide 1 has Vietnamese text
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>${slide1Text}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 2 has Vietnamese text
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>${slide2Text}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const translatedItems = [];
  const mockProvider = {
    name: "mock-engine",
    async translateBatch(req) {
      console.log("translateBatch CALLED with items:", req.items.length);
      const results = new Map();
      for (const it of req.items) {
        translatedItems.push(it.sourceText);
        results.set(it.id, "Step successfully verified: " + it.id);
      }
      return { results, provider: "mock-engine", durationMs: 5 };
    },
    async translate(req) {
      return { translatedText: "Step successfully verified", provider: "mock-engine", durationMs: 5 };
    }
  };

  // Only select slide 2 for translation
  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
    slideRange: "2",
  });

  // Verify only slide 2 text was sent to translator
  assert.equal(translatedItems.length, 1);
  assert.equal(translatedItems[0], slide2Text);

  // Verify slide 1 in output PPTX is untouched
  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1After = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");
  const slide2After = await zipAfter.file("ppt/slides/slide2.xml")?.async("string");

  assert.ok(slide1After.includes(slide1Text), "Slide 1 text was preserved as-is");
  assert.ok(!slide1After.includes("Step successfully verified"), "Slide 1 was NOT translated");
  assert.ok(slide2After.includes("Step successfully verified"), "Slide 2 was successfully translated");
});

test("PPTX Translator: In-slide interleaved 1.EN 1.VI 2.EN 2.VI layout is preserved in ipqc_bilingual mode", async () => {
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const JSZip = (await import("jszip")).default;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  // Interleaved items in the exact style of user's presentation
  const p1En = "1. Check if the upper stitching collar is smooth and even";
  const p1Vi = "1.Kiểm tra mặt giày may vòng cổ có suông đều không";
  const p2En = "2. Check if the worker operation of placing the upper into mold is standard";
  const p2Vi = "2.Thao tác công nhân đặt mặt giày vào khuôn có chuẩn không";
  const p3En = "3. Ensure collar shape after shaping is straight";
  const p3Vi = "3. Đảm bảo hình dạng vòng cổ sau khi định hình thẳng";
  const p4En = "4. Check if lasting is aligned";
  const p4Vi = "4. Kiểm tra vô phom có ngay định vị không";

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:bodyPr/>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p3En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p3Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p4En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p4Vi}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  let callCount = 0;
  const mockProvider = {
    name: "mock-engine",
    async translateBatch(req) {
      callCount += req.items.length;
      const results = new Map();
      for (const it of req.items) results.set(it.id, "Mock translated: " + it.sourceText);
      return { results, provider: "mock-engine", durationMs: 5 };
    },
    async translate(req) {
      callCount++;
      return { translatedText: "Mock translated: " + req.sourceText, provider: "mock-engine", durationMs: 5 };
    }
  };

  // Run translation in ipqc_bilingual mode
  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  // Verify that paired interleaved items bypassed Gemini calls!
  assert.equal(callCount, 0, "Paired interleaved items must not trigger LLM calls");

  // Verify the output preserves the interleaved sequence: 1.EN then 1.VI, 2.EN then 2.VI, etc.
  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1After = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slide1After, "Slide 1 XML must exist");

  const p1EnIdx = slide1After.indexOf(p1En);
  const p1ViIdx = slide1After.indexOf(p1Vi);
  const p2EnIdx = slide1After.indexOf(p2En);
  const p2ViIdx = slide1After.indexOf(p2Vi);
  const p3EnIdx = slide1After.indexOf(p3En);
  const p3ViIdx = slide1After.indexOf(p3Vi);
  const p4EnIdx = slide1After.indexOf(p4En);
  const p4ViIdx = slide1After.indexOf(p4Vi);

  assert.ok(p1EnIdx !== -1, "p1En found");
  assert.ok(p1ViIdx !== -1, "p1Vi found");
  assert.ok(p2EnIdx !== -1, "p2En found");
  assert.ok(p2ViIdx !== -1, "p2Vi found");
  assert.ok(p3EnIdx !== -1, "p3En found");
  assert.ok(p3ViIdx !== -1, "p3Vi found");
  assert.ok(p4EnIdx !== -1, "p4En found");
  assert.ok(p4ViIdx !== -1, "p4Vi found");

  // Interleaved order: 1.EN < 1.VI < 2.EN < 2.VI < 3.EN < 3.VI < 4.EN < 4.VI
  assert.ok(p1EnIdx < p1ViIdx, "1.EN precedes 1.VI");
  assert.ok(p1ViIdx < p2EnIdx, "1.VI precedes 2.EN");
  assert.ok(p2EnIdx < p2ViIdx, "2.EN precedes 2.VI");
  assert.ok(p2ViIdx < p3EnIdx, "2.VI precedes 3.EN");
  assert.ok(p3EnIdx < p3ViIdx, "3.EN precedes 3.VI");
  assert.ok(p3ViIdx < p4EnIdx, "3.VI precedes 4.EN");
  assert.ok(p4EnIdx < p4ViIdx, "4.EN precedes 4.VI");
});

test("PPTX Translator: In-slide interleaved in replace_en mode outputs ONLY English without Vietnamese or duplicates", async () => {
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const JSZip = (await import("jszip")).default;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  const p1En = "1. Check if the upper stitching collar is smooth and even";
  const p1Vi = "1.Kiểm tra mặt giày may vòng cổ có suông đều không";
  const p2En = "2. Check if the worker operation of placing the upper into mold is standard";
  const p2Vi = "2.Thao tác công nhân đặt mặt giày vào khuôn có chuẩn không";

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:bodyPr/>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2Vi}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "mock-engine",
    async translateBatch() { return { results: new Map(), provider: "mock-engine", durationMs: 5 }; },
    async translate() { return { translatedText: "", provider: "mock-engine", durationMs: 5 }; }
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1After = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slide1After.includes(p1En), "p1En must be in output");
  assert.ok(slide1After.includes(p2En), "p2En must be in output");
  assert.ok(!slide1After.includes(p1Vi), "p1Vi must be removed in replace_en mode");
  assert.ok(!slide1After.includes(p2Vi), "p2Vi must be removed in replace_en mode");

  // Verify no duplicate occurrences of English steps
  const matches1 = slide1After.split(p1En).length - 1;
  const matches2 = slide1After.split(p2En).length - 1;
  assert.equal(matches1, 1, "p1En must appear exactly once");
  assert.equal(matches2, 1, "p2En must appear exactly once");
});

test("PPTX Translator & Smart Audit: Supports 1.VI 1.EN 2.VI 2.EN order seamlessly", async () => {
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");
  const JSZip = (await import("jszip")).default;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  // VI first, then EN: 1.VI, 1.EN, 2.VI, 2.EN
  const p1Vi = "1. Kiểm tra mặt giày may vòng cổ có suông đều không";
  const p1En = "1. Check if the upper stitching collar is smooth and even";
  const p2Vi = "2. Thao tác công nhân đặt mặt giày vào khuôn có chuẩn không";
  const p2En = "2. Check if the worker operation of placing the upper into mold is standard";

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:bodyPr/>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p1En}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2Vi}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${p2En}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  // 1. Audit Check: Must be paired and classified as ALREADY_TRANSLATED
  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  const viUnits = auditReport.units.filter((u) => u.sourceText.includes("Kiểm tra mặt giày") || u.sourceText.includes("Thao tác công nhân"));
  assert.equal(viUnits.length, 2, "Found 2 VI units");
  for (const u of viUnits) {
    assert.equal(u.status, "ALREADY_TRANSLATED", "VI unit paired with subsequent EN must be ALREADY_TRANSLATED");
    assert.equal(u.requiresTranslation, false, "Must not require translation");
    assert.equal(u.selectedForTranslation, false, "Must not be selected for translation");
  }

  // 2. Translation in ipqc_bilingual: preserves 1.VI then 1.EN, 2.VI then 2.EN
  const mockProvider = {
    name: "mock-engine",
    async translateBatch() { return { results: new Map(), provider: "mock-engine", durationMs: 5 }; },
    async translate() { return { translatedText: "", provider: "mock-engine", durationMs: 5 }; }
  };

  const biResult = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  const zipBi = await JSZip.loadAsync(biResult.translatedBuffer);
  const slideBiXml = await zipBi.file("ppt/slides/slide1.xml")?.async("string");

  const idx1Vi = slideBiXml.indexOf(p1Vi);
  const idx1En = slideBiXml.indexOf(p1En);
  const idx2Vi = slideBiXml.indexOf(p2Vi);
  const idx2En = slideBiXml.indexOf(p2En);

  assert.ok(idx1Vi !== -1 && idx1En !== -1, "1.VI and 1.EN present");
  assert.ok(idx2Vi !== -1 && idx2En !== -1, "2.VI and 2.EN present");
  assert.ok(idx1Vi < idx1En, "1.VI precedes 1.EN");
  assert.ok(idx1En < idx2Vi, "1.EN precedes 2.VI");
  assert.ok(idx2Vi < idx2En, "2.VI precedes 2.EN");

  // 3. Translation in replace_en: outputs ONLY 1.EN and 2.EN
  const enResult = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const zipEn = await JSZip.loadAsync(enResult.translatedBuffer);
  const slideEnXml = await zipEn.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slideEnXml.includes(p1En), "p1En present");
  assert.ok(slideEnXml.includes(p2En), "p2En present");
  assert.ok(!slideEnXml.includes(p1Vi), "p1Vi eliminated in replace_en");
  assert.ok(!slideEnXml.includes(p2Vi), "p2Vi eliminated in replace_en");
});


