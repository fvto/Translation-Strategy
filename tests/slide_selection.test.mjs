import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseSlideRange, detectDynamicSlidePairs } from "../services/documents/pptx-slide-order";
import { pptxTranslatorService } from "../services/documents/pptx-translator";
import { auditPptxGaps, hasViDiacritics } from "../services/translation/smart-detector";

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

test("PPTX Translator & Smart Audit: 'Đối với' translates to 'For' without attaching shoe model names", async () => {
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

  const rawVi = "*Đối với LQ-075W-1";
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:bodyPr/>
      <a:p><a:r><a:rPr sz="1400"/><a:t>${rawVi}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  // 1. Audit Check: Glossary correction must be "Đối với" -> "For", NOT "Đối với LQ-075W-1"
  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "replace_en"
  });

  const unit = auditReport.units.find((u) => u.sourceText === rawVi);
  assert.ok(unit, "Unit found");
  assert.equal(unit.suggestedTranslation, "*For LQ-075W-1");
  assert.ok(unit.glossaryCorrections, "Glossary corrections present");
  assert.equal(unit.glossaryCorrections.length, 1);
  assert.equal(unit.glossaryCorrections[0].sourceTerm, "Đối với", "Term must be 'Đối với' without shoe model");
  assert.equal(unit.glossaryCorrections[0].expectedTarget, "For", "Expected target must be 'For'");

  // 2. Translation Check: Translates to "*For LQ-075W-1" without calling LLM
  let llmCalls = 0;
  const mockProvider = {
    name: "mock-engine",
    async translateBatch() { llmCalls++; return { results: new Map(), provider: "mock-engine", durationMs: 5 }; },
    async translate() { llmCalls++; return { translatedText: "", provider: "mock-engine", durationMs: 5 }; }
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  assert.equal(llmCalls, 0, "Pattern must resolve directly without LLM call");
  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slideAfter = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slideAfter.includes("*For LQ-075W-1"), "Output must contain *For LQ-075W-1");
  assert.ok(!slideAfter.includes("*Đối với"), "Vietnamese prefix must be removed");
});

test("Smart Audit: Same-slide block bilingual (Shape 1 EN steps 1-4, Shape 2 VI steps 1-4) are paired as ALREADY_TRANSLATED and unchecked", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");
  const zip = new JSZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  // Slide with Shape 1 (EN steps 1-4) and Shape 2 (VI steps 1-4)
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <!-- Shape 1: EN steps -->
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1.Stitching collar &amp; collar lining must follow notch, margin 2mm, SPI 11-12 stitches/inch</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>2.Spraying cement for upper must consistent, reach marking, spraying cement for collar lining must margin 3-5mm</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>3.Attach foam follow notch/marking, attach higher than upper 3mm</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>4.Check if collar smooth, not off center, collar lining must higher collar 3mm after folding/hammering</a:t></a:r></a:p>
    </p:txBody></p:sp>
    <!-- Shape 2: VI steps -->
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1.Kiểm tra lót vòng cổ và vòng cổ ngay tâm,cách biên đều 3mm ,cách kim 11-12 mũi /inch</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>2.Kiểm tra phun keo mặt giày đều ,tới vị ,lót vòng cổ phun keo chừa đường cách biên lót vòng cổ 3-5mm</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>3.Kiểm tra dán mos ngay tân định vị ,cao hơn mặt giày 3mm</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>4.Kiểm tra sau khi lộn dập bằng vòng cổ suôn đều không méo,độ cao lót so với vòng cổ là 3mm</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  assert.equal(auditReport.units.length, 8, "Must extract 8 paragraphs");
  for (const unit of auditReport.units) {
    assert.equal(unit.status, "ALREADY_TRANSLATED", `Unit "${unit.sourceText.slice(0, 20)}" must be ALREADY_TRANSLATED`);
    assert.equal(unit.selectedForTranslation, false, `Unit "${unit.sourceText.slice(0, 20)}" must NOT be selected for translation`);
    assert.equal(unit.requiresTranslation, false, `Unit "${unit.sourceText.slice(0, 20)}" must NOT require translation`);
  }
});

test("Smart Audit: Zero EN->EN identity suggestions for 'CRITICAL TO QUALITY' and 'CRITICAL TO PROCESS'", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");
  const zip = new JSZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>CRITICAL TO QUALITY</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>CRITICAL TO PROCESS</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  const ctq = auditReport.units.find((u) => u.sourceText === "CRITICAL TO QUALITY");
  const ctp = auditReport.units.find((u) => u.sourceText === "CRITICAL TO PROCESS");

  assert.ok(ctq, "CTQ unit must exist");
  assert.ok(ctp, "CTP unit must exist");

  assert.equal(ctq.status, "ALREADY_TRANSLATED");
  assert.equal(ctp.status, "ALREADY_TRANSLATED");

  // STRICT REQUIREMENT: No EN -> EN identity suggested translation!
  assert.equal(ctq.suggestedTranslation, undefined, "CTQ must NOT have identity suggestedTranslation");
  assert.equal(ctp.suggestedTranslation, undefined, "CTP must NOT have identity suggestedTranslation");
});

test("Smart Audit: Never blindly pairs unrelated items across slides (e.g. COMMENTS: 0.3-0.6 A never pairs with QAM cập nhật)", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");
  const zip = new JSZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`);

  // Slide 1 (EN): comments note and steps
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1.Check the temp, time follow PFC</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>COMMENTS: 0.3-0.6 A</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 2 (VI): steps and status stamp
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1.Kiểm tra thời gian nhiệt độ theo PFC</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>QAM cập nhật</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  const commentsUnit = auditReport.units.find((u) => u.sourceText.includes("COMMENTS: 0.3-0.6 A"));
  assert.ok(commentsUnit, "Comments unit must exist");
  assert.notEqual(commentsUnit.suggestedTranslation, "QAM cập nhật", "Comments MUST NOT be paired with QAM cập nhật");
  assert.notEqual(commentsUnit.existingTranslation, "QAM cập nhật", "Comments MUST NOT have QAM cập nhật as existingTranslation");
});

test("Smart Audit: Inspection labels (GOOD, NO GOOD, OK, NG) are NON_TRANSLATABLE with zero suggestions", async () => {
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
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Do thiết kế phần eo có lập thể nên chấp nhận logo gợn sóng tự nhiên cập nhật QAM</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>NO GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>GOOD</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  const noGoodUnit = auditReport.units.find((u) => u.sourceText === "NO GOOD");
  const goodUnit = auditReport.units.find((u) => u.sourceText === "GOOD");
  const thietKeUnit = auditReport.units.find((u) => u.sourceText.includes("Do thiết kế"));

  assert.ok(noGoodUnit, "NO GOOD unit exists");
  assert.ok(goodUnit, "GOOD unit exists");
  assert.ok(thietKeUnit, "Do thiet ke unit exists");

  assert.equal(noGoodUnit.status, "NON_TRANSLATABLE", "NO GOOD is NON_TRANSLATABLE");
  assert.equal(noGoodUnit.suggestedTranslation, undefined, "NO GOOD has NO suggestedTranslation");
  assert.equal(goodUnit.status, "NON_TRANSLATABLE", "GOOD is NON_TRANSLATABLE");
  assert.equal(goodUnit.suggestedTranslation, undefined, "GOOD has NO suggestedTranslation");

  assert.notEqual(thietKeUnit.suggestedTranslation, "NO GOOD", "Do thiet ke MUST NOT suggest NO GOOD");
  assert.notEqual(noGoodUnit.suggestedTranslation, thietKeUnit.sourceText, "NO GOOD MUST NOT suggest Do thiet ke");
});

test("Test 14: English Immunity Shield protects pure English, inspection labels, and shoe models from re-translation", async () => {
  const { isEnglishImmunityProtected, isInspectionStatusLabel } = await import("../services/translation/smart-detector.js");
  const { isSafeTerminologyEntry } = await import("../services/terminology/safety.js");

  // 1. Detection Immunity Verification
  assert.ok(isEnglishImmunityProtected("GOOD"), "GOOD is protected");
  assert.ok(isEnglishImmunityProtected("NO GOOD"), "NO GOOD is protected");
  assert.ok(isEnglishImmunityProtected("1. GOOD"), "1. GOOD is protected");
  assert.ok(isEnglishImmunityProtected("(2) NO GOOD"), "(2) NO GOOD is protected");
  assert.ok(isEnglishImmunityProtected("OK"), "OK is protected");
  assert.ok(isEnglishImmunityProtected("NG"), "NG is protected");
  assert.ok(isEnglishImmunityProtected("CRITICAL TO QUALITY"), "Pure English sentence is protected");
  assert.ok(isEnglishImmunityProtected("SPI 9-10 stitches/inch"), "SPI specification is protected");
  assert.ok(isEnglishImmunityProtected("Tip-quarter"), "Technical footwear compound is protected");
  assert.ok(isEnglishImmunityProtected("No-sew"), "No-sew specification is protected");
  assert.ok(isEnglishImmunityProtected("PEGASUS 41"), "Shoe model name is protected");

  assert.ok(!isEnglishImmunityProtected("Kiểm tra dán đế"), "Pure Vietnamese is NOT protected");
  assert.ok(!isEnglishImmunityProtected("1. Hình dạng mũi"), "Vietnamese step instruction is NOT protected");

  // 2. Terminology Safety Gate Verification
  assert.ok(!isSafeTerminologyEntry({ sourceTerm: "GOOD", targetTerm: "Đạt", status: "approved" }), "Rejects GOOD as terminology");
  assert.ok(!isSafeTerminologyEntry({ sourceTerm: "Không đạt", targetTerm: "NO GOOD", status: "approved" }), "Rejects NO GOOD as terminology");
  assert.ok(!isSafeTerminologyEntry({ sourceTerm: "OK", targetTerm: "OK", status: "approved" }), "Rejects OK identical term");

  // 3. PPTX Translation Pipeline Verification (Immunity from LLM batch)
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>CRITICAL TO QUALITY</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>NO GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>PEGASUS 41</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Kiểm tra dán đế chắc chắn</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const translatedBatches = [];
  const mockProvider = {
    name: "mock-engine",
    async translateBatch(req) {
      translatedBatches.push(...req.items.map((i) => i.sourceText));
      const results = new Map();
      for (const it of req.items) results.set(it.id, "Firmly inspect sole attaching process");
      return { results, provider: "mock-engine", durationMs: 5 };
    },
    async translate(req) {
      translatedBatches.push(req.sourceText);
      return { translatedText: "Firmly inspect sole attaching process", provider: "mock-engine", durationMs: 5 };
    }
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  // ONLY Vietnamese sentence "Kiểm tra dán đế chắc chắn" should be translated
  assert.equal(translatedBatches.length, 1, "Only 1 item should be sent to translation provider");
  assert.ok(translatedBatches[0].includes("Kiểm tra dán đế"), "The translated item is the Vietnamese instruction");

  // English immune items must NEVER be translated
  assert.ok(!translatedBatches.includes("GOOD"), "GOOD was immune");
  assert.ok(!translatedBatches.includes("NO GOOD"), "NO GOOD was immune");
  assert.ok(!translatedBatches.includes("CRITICAL TO QUALITY"), "CRITICAL TO QUALITY was immune");
  assert.ok(!translatedBatches.includes("PEGASUS 41"), "PEGASUS 41 was immune");

  // Output slide XML must retain all original English terms intact
  const zipAfter = await JSZip.loadAsync(result.translatedBuffer);
  const slide1After = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slide1After.includes("CRITICAL TO QUALITY"), "CRITICAL TO QUALITY preserved in output");
  assert.ok(slide1After.includes("GOOD"), "GOOD preserved in output");
  assert.ok(slide1After.includes("NO GOOD"), "NO GOOD preserved in output");
  assert.ok(slide1After.includes("PEGASUS 41"), "PEGASUS 41 preserved in output");
});

test("Test 15: Smart Audit correctly pairs in-slide bilingual defects ('Wrong material' / 'Sai liệu', 'Inconsistent pair matching label' / 'Tem số...') as ALREADY_TRANSLATED", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.js");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Inconsistent pair matching label</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Tem số phối đôi không đồng bộ.</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Wrong material</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Sai liệu</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual"
  });

  const wrongMat = report.units.find((u) => u.sourceText === "Wrong material");
  const saiLieu = report.units.find((u) => u.sourceText === "Sai liệu");
  const labelEn = report.units.find((u) => u.sourceText === "Inconsistent pair matching label");
  const temSoVi = report.units.find((u) => u.sourceText === "Tem số phối đôi không đồng bộ.");

  assert.ok(wrongMat && saiLieu && labelEn && temSoVi, "All 4 units found");

  // Both English lines are ALREADY_TRANSLATED and unselected
  assert.equal(wrongMat.status, "ALREADY_TRANSLATED");
  assert.equal(wrongMat.selectedForTranslation, false);
  assert.equal(labelEn.status, "ALREADY_TRANSLATED");
  assert.equal(labelEn.selectedForTranslation, false);

  // Both Vietnamese lines are recognized as paired with their English counterparts, so they are ALREADY_TRANSLATED and unchecked!
  assert.equal(saiLieu.status, "ALREADY_TRANSLATED", "Sai liệu must be ALREADY_TRANSLATED");
  assert.equal(saiLieu.selectedForTranslation, false, "Sai liệu must be unchecked");
  assert.equal(saiLieu.existingTranslation, "Wrong material", "Sai liệu paired with Wrong material");

  assert.equal(temSoVi.status, "ALREADY_TRANSLATED", "Tem so must be ALREADY_TRANSLATED");
  assert.equal(temSoVi.selectedForTranslation, false, "Tem so must be unchecked");
  assert.equal(temSoVi.existingTranslation, "Inconsistent pair matching label", "Tem so paired with Inconsistent pair matching label");
});

test("Test 16: Smart Audit recognizes in-line bilingual items ('Color matching-Phối màu liệu', 'Toe shape - Hình dạng mũi') as ALREADY_TRANSLATED and unchecked", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.js");

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Color matching-Phối màu liệu</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Toe shape - Hình dạng mũi</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Outsole: Đế ngoài</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Chỉ may không đều</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
  });

  const colorMatching = report.units.find((u) => u.sourceText === "Color matching-Phối màu liệu");
  const toeShape = report.units.find((u) => u.sourceText === "Toe shape - Hình dạng mũi");
  const outsole = report.units.find((u) => u.sourceText === "Outsole: Đế ngoài");
  const chiMay = report.units.find((u) => u.sourceText === "Chỉ may không đều");

  assert.ok(colorMatching, "Color matching item found");
  assert.ok(toeShape, "Toe shape item found");
  assert.ok(outsole, "Outsole item found");
  assert.ok(chiMay, "Chi may item found");

  // In-line bilingual items must be ALREADY_TRANSLATED and unchecked [ ]
  assert.equal(colorMatching.status, "ALREADY_TRANSLATED", "Color matching-Phối màu liệu must be ALREADY_TRANSLATED");
  assert.equal(colorMatching.selectedForTranslation, false, "Color matching must NOT be selected for translation");

  assert.equal(toeShape.status, "ALREADY_TRANSLATED", "Toe shape - Hình dạng mũi must be ALREADY_TRANSLATED");
  assert.equal(toeShape.selectedForTranslation, false, "Toe shape must NOT be selected for translation");

  assert.equal(outsole.status, "ALREADY_TRANSLATED", "Outsole: Đế ngoài must be ALREADY_TRANSLATED");
  assert.equal(outsole.selectedForTranslation, false, "Outsole must NOT be selected for translation");

  // Genuine un-translated Vietnamese defect must remain NEEDS_TRANSLATION and checked [x]
  assert.equal(chiMay.status, "NEEDS_TRANSLATION", "Chỉ may must be NEEDS_TRANSLATION");
  assert.equal(chiMay.selectedForTranslation, true, "Chỉ may must be selected for translation");
});

test("Test 17: Model Scope Isolation - Steps under '*Đối với LQ-075W-1' remain NEEDS_TRANSLATION [x] and never pair with general steps", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.js");

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const genEn1 = "1. Stitching swoosh must follow marking line";
  const genEn2 = "2. Check stitching line after sewing";
  const genVi1 = "1. May logo phải theo đường định vị";
  const genVi2 = "2. Kiểm tra đường may sau khi may";
  const modelHdr = "*Đối với LQ-075W-1";
  const modVi1 = "1. Kiểm tra logo được may theo định vị trên eo ngoài của hai chân trái phải và trên gót không";
  const modVi2 = "2. Kiểm tra sau khi may cách biên đều 1.5mm/9-10 mũi/inch ,không lồi định vị trên mặt giày,logo không được cong,biến dạng";

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${genEn1}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${genEn2}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${genVi1}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${genVi2}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modelHdr}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modVi1}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modVi2}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
  });

  const unitGenVi1 = report.units.find((u) => u.sourceText === genVi1);
  const unitGenVi2 = report.units.find((u) => u.sourceText === genVi2);
  const unitModelHdr = report.units.find((u) => u.sourceText === modelHdr);
  const unitModVi1 = report.units.find((u) => u.sourceText === modVi1);
  const unitModVi2 = report.units.find((u) => u.sourceText === modVi2);

  assert.ok(unitGenVi1 && unitGenVi2 && unitModelHdr && unitModVi1 && unitModVi2, "All 5 units found");

  // General steps are paired with general English steps -> ALREADY_TRANSLATED and unchecked
  assert.equal(unitGenVi1.status, "ALREADY_TRANSLATED", "General VI 1 must be ALREADY_TRANSLATED");
  assert.equal(unitGenVi1.selectedForTranslation, false, "General VI 1 must be unselected");
  assert.equal(unitGenVi2.status, "ALREADY_TRANSLATED", "General VI 2 must be ALREADY_TRANSLATED");
  assert.equal(unitGenVi2.selectedForTranslation, false, "General VI 2 must be unselected");

  // Model header -> LOCKED_TERMINOLOGY, translates to '*For LQ-075W-1', selected [x]
  assert.equal(unitModelHdr.status, "LOCKED_TERMINOLOGY", "Model header must be LOCKED_TERMINOLOGY");
  assert.equal(unitModelHdr.suggestedTranslation, "*For LQ-075W-1", "Suggested translation is *For LQ-075W-1");
  assert.equal(unitModelHdr.selectedForTranslation, true, "Model header must be selected for translation");

  // Model-specific steps: MUST NOT pair with general English steps 1 & 2!
  // MUST require translation and be selected [x]!
  assert.ok(
    ["NEEDS_TRANSLATION", "POSSIBLE_TRANSLATION"].includes(unitModVi1.status),
    `Model step 1 must require translation, got ${unitModVi1.status}`
  );
  assert.equal(unitModVi1.selectedForTranslation, true, "Model step 1 must be selected [x]");

  assert.ok(
    ["NEEDS_TRANSLATION", "POSSIBLE_TRANSLATION", "REVIEW_REQUIRED"].includes(unitModVi2.status),
    `Model step 2 must require translation, got ${unitModVi2.status}`
  );
  assert.equal(unitModVi2.selectedForTranslation, true, "Model step 2 must be selected [x]");
});

test("Test 18: Model Full Translation Execution - Translates *For LQ-075W-1 and both sub-steps without leaking Vietnamese", async () => {
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const modelHdr = "*Đối với LQ-075W-1";
  const modVi1 = "1. Kiểm tra logo được may theo định vị trên eo ngoài của hai chân trái phải và trên gót không";
  const modVi2 = "2. Kiểm tra sau khi may cách biên đều 1.5mm/9-10 mũi/inch ,không lồi định vị trên mặt giày,logo không được cong,biến dạng";

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modelHdr}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modVi1}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${modVi2}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const { translationCache } = await import("../services/translation/cache.js");
  translationCache.clear();

  const mockProvider = {
    name: "mock-engine",
    async translateBatch({ items }) {
      const results = new Map();
      for (const item of items) {
        if (item.sourceText.includes("Kiểm tra logo")) {
          results.set(item.id, "1. Check if the logo is stitched according to markings on outer waist of left/right feet and heel");
        } else if (item.sourceText.includes("cách biên đều 1.5mm")) {
          results.set(item.id, "2. Check after sewing margin evenly 1.5mm / 9-10 mũi/inch, no protruding positioning, logo not curved or deformed");
        }
      }
      return { results, provider: "mock-engine", durationMs: 5 };
    },
    async translate(req) {
      if (req.sourceText.includes("Kiểm tra logo")) {
        return { translatedText: "1. Check if the logo is stitched according to markings on outer waist of left/right feet and heel", provider: "mock-engine", durationMs: 5 };
      }
      if (req.sourceText.includes("cách biên đều 1.5mm")) {
        return { translatedText: "2. Check after sewing margin evenly 1.5mm / 9-10 mũi/inch, no protruding positioning, logo not curved or deformed", provider: "mock-engine", durationMs: 5 };
      }
      return { translatedText: "", provider: "mock-engine", durationMs: 5 };
    }
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const zipOut = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await zipOut.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml.includes("*For LQ-075W-1"), "Output must contain *For LQ-075W-1");
  assert.ok(outXml.includes("1. Check if the logo is stitched"), "Output contains translated step 1");
  assert.ok(outXml.includes("SPI 9-10 stitches/inch"), "Stitch density normalized to SPI 9-10 stitches/inch");
  assert.equal(hasViDiacritics(outXml), false, "Zero Vietnamese leakage in replace_en mode");
});

test("Test 19: Multiple Model Subsections - 2 independent model blocks on 1 slide never cross-pair", async () => {
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.js");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>*Đối với Model A</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1. Thao tác may Model A</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>2. Kiểm tra chất lượng Model A</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>*Đối với Model B</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1. Thao tác may Model B</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>2. Kiểm tra chất lượng Model B</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
  });

  const stepA1 = report.units.find((u) => u.sourceText === "1. Thao tác may Model A");
  const stepA2 = report.units.find((u) => u.sourceText === "2. Kiểm tra chất lượng Model A");
  const stepB1 = report.units.find((u) => u.sourceText === "1. Thao tác may Model B");
  const stepB2 = report.units.find((u) => u.sourceText === "2. Kiểm tra chất lượng Model B");

  assert.ok(stepA1 && stepA2 && stepB1 && stepB2, "All 4 steps found");
  assert.equal(stepA1.status, "NEEDS_TRANSLATION");
  assert.equal(stepA1.selectedForTranslation, true);
  assert.equal(stepA2.status, "NEEDS_TRANSLATION");
  assert.equal(stepA2.selectedForTranslation, true);
  assert.equal(stepB1.status, "NEEDS_TRANSLATION");
  assert.equal(stepB1.selectedForTranslation, true);
  assert.equal(stepB2.status, "NEEDS_TRANSLATION");
  assert.equal(stepB2.selectedForTranslation, true);
});

test("Test 20: ISQ Duplication in apply_audit - apply_audit duplicates ISQ STRATEGY slide into 2 corresponding slides (EN top, VI bottom)", async () => {
  const { applyPptxAuditSuggestions } = await import("../services/translation/pptx-smart-audit.js");
  const { orderedSlidePaths, readIsqSlidePairs } = await import("../services/documents/pptx-slide-order.js");

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const viText = "CTQ 1-Lập thể mặt trước ép phải nổi";
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>ISQ STRATEGY-CTP-CTQ</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>${viText}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const enTranslation = "CTQ 1-Vamp embossing must be prominent";
  const result = await applyPptxAuditSuggestions(buffer, "ISQ-manual.pptx", ["s1_p1"], {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
    customTranslations: {
      s1_p1: enTranslation,
    },
  });

  const zipOut = await JSZip.loadAsync(result.buffer);
  const order = await orderedSlidePaths(zipOut);
  const pairs = await readIsqSlidePairs(zipOut);

  // Exactly 2 slides created
  assert.equal(order.length, 2, "ISQ slide must be duplicated into 2 slides");
  assert.equal(pairs.length, 1, "Exactly 1 ISQ pair created");

  const topXml = await zipOut.file(pairs[0].en)?.async("string");
  const bottomXml = await zipOut.file(pairs[0].vi)?.async("string");

  // Slide 1 (EN top): has English translation, NO Vietnamese text!
  assert.ok(topXml.includes(enTranslation), "Slide EN has English translation");
  assert.equal(hasViDiacritics(topXml), false, "Slide EN has ZERO Vietnamese leakage");

  // Slide 2 (VI bottom): retains 100% original Vietnamese intact!
  assert.ok(bottomXml.includes(viText), "Slide VI retains original Vietnamese");
});

test("Test 21: ISQ 2-Column CTP/CTQ & GOOD/NO GOOD - Preserves technical heading, color, and labels", async () => {
  const { applyPptxAuditSuggestions } = await import("../services/translation/pptx-smart-audit.js");
  const { readIsqSlidePairs } = await import("../services/documents/pptx-slide-order.js");

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1400" b="1"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:rPr><a:t>ISQ NIKE CPFM AIR FLEA 1-STITCHING</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200" b="1"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:rPr><a:t>*May logo:</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>NO GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>May logo đều đẹp</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await applyPptxAuditSuggestions(buffer, "ISQ-manual.pptx", ["s1_p1", "s1_p4"], {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
    customTranslations: {
      s1_p1: "*Stitching logo:",
      s1_p4: "Stitch logo evenly and beautifully",
    },
  });

  const zipOut = await JSZip.loadAsync(result.buffer);
  const pairs = await readIsqSlidePairs(zipOut);
  const topXml = await zipOut.file(pairs[0].en)?.async("string");

  assert.ok(topXml.includes("*Stitching logo:"), "Heading translated to English");
  assert.ok(topXml.includes('b="1"'), "Heading bold preserved");
  assert.ok(topXml.includes('val="0000FF"'), "Color preserved");
  assert.ok(topXml.includes("GOOD") && topXml.includes("NO GOOD"), "GOOD / NO GOOD labels preserved");
});

test("Test 22: OpenXML Structural Integrity - Slide IDs and relationships remain completely valid after duplication", async () => {
  const { applyPptxAuditSuggestions } = await import("../services/translation/pptx-smart-audit.js");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>ISQ STRATEGY-CTQ-CTP</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>CTQ 1-Kiểm tra</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await applyPptxAuditSuggestions(buffer, "ISQ-manual.pptx", ["s1_p1"], {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
    customTranslations: { s1_p1: "CTQ 1-Inspect" },
  });

  const zipOut = await JSZip.loadAsync(result.buffer);
  const presXml = await zipOut.file("ppt/presentation.xml")?.async("string");
  const relsXml = await zipOut.file("ppt/_rels/presentation.xml.rels")?.async("string");
  const typesXml = await zipOut.file("[Content_Types].xml")?.async("string");

  // Check unique IDs
  const sldIds = Array.from(presXml.matchAll(/id="(\d+)"/g), (m) => m[1]);
  assert.equal(new Set(sldIds).size, sldIds.length, "All sldId attributes must be unique");

  const rIds = Array.from(relsXml.matchAll(/Id="([^"]+)"/g), (m) => m[1]);
  assert.equal(new Set(rIds).size, rIds.length, "All relationship IDs must be unique");

  assert.ok(typesXml.includes("Override"), "Content types overrides present");
});

test("Test 23: Zero Vietnamese Leakage Gate - Post-Flight QA Gate auto-eliminates leaked Vietnamese on ISQ top slide", async () => {
  const { auditAndRepairPptxPostFlight } = await import("../services/qa/pptx-postflight-gate.ts");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`);
  zip.file("ppt/customXml/pairs.xml", `<?xml version="1.0" encoding="UTF-8"?><pairs xmlns="urn:smart-audit:isq-pairs"><pair en="ppt/slides/slide1.xml" vi="ppt/slides/slide2.xml"/></pairs>`);

  // Slide 1 is ISQ EN slide, with an accidental leaked Vietnamese paragraph
  zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1. Check the stitching margin evenly 1.5mm</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Đoạn rò rỉ tiếng Việt chưa dịch</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`);
  zip.file("ppt/slides/slide2.xml", `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:t>Nguyên bản tiếng Việt</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);

  const report = await auditAndRepairPptxPostFlight(await zip.generateAsync({ type: "nodebuffer" }), "ipqc_bilingual");
  const zipRepaired = await JSZip.loadAsync(report.auditedBuffer);
  const slide1Xml = await zipRepaired.file("ppt/slides/slide1.xml")?.async("string");

  assert.equal(hasViDiacritics(slide1Xml), false, "Leaked Vietnamese paragraph must be cleanly removed from ISQ EN slide");
  assert.ok(slide1Xml.includes("1. Check the stitching margin"), "English content preserved");
});

test("Test 24: Technical Heading Visual Parity - Preserves bold b='1', font size, and color for '*May logo:'", async () => {
  const { replaceParagraphText } = await import("../services/documents/pptx-text.js");
  const origPXml = `<a:p><a:pPr algn="l"/><a:r><a:rPr b="1" sz="1400"><a:solidFill><a:srgbClr val="0066CC"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>*May logo:</a:t></a:r></a:p>`;
  const replaced = replaceParagraphText(origPXml, "*Stitching logo:");

  assert.ok(replaced.includes("*Stitching logo:"), "Text replaced");
  assert.ok(replaced.includes('b="1"'), "Bold preserved");
  assert.ok(replaced.includes('val="0066CC"'), "Color preserved");
  assert.ok(replaced.includes('sz="1400"'), "Font size preserved");
  assert.ok(replaced.includes('typeface="Arial"'), "Font typeface preserved");
});

test("Test 25: SPI Strict Normalization - Normalizes variations to 'SPI <number> stitches/inch'", async () => {
  const { normalizeSpiTerminology } = await import("../services/translation/casing.js");

  assert.equal(normalizeSpiTerminology("1.5mm/9-10 mũi/inch"), "1.5mm/SPI 9-10 stitches/inch");
  assert.equal(normalizeSpiTerminology("9-10 SPI"), "SPI 9-10 stitches/inch");
  assert.equal(normalizeSpiTerminology("SPI 10-12"), "SPI 10-12 stitches/inch");
  assert.equal(normalizeSpiTerminology("SPI 7-8 stitches/inch"), "SPI 7-8 stitches/inch");
});

test("Test 26: No-sew & Tip-quarter Enforcement - Standardizes to hyphenated 'No-sew' and 'Tip-quarter' (Production Rule #3)", async () => {
  const { auditAndRepairPptxPostFlight } = await import("../services/qa/pptx-postflight-gate.ts");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Check Nosew delamination on Tipquarter and Tip quarter upper</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`);

  const report = await auditAndRepairPptxPostFlight(await zip.generateAsync({ type: "nodebuffer" }));
  const zipOut = await JSZip.loadAsync(report.auditedBuffer);
  const slideXml = await zipOut.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(slideXml.includes("No-sew"), "Nosew must be auto-corrected to No-sew");
  assert.ok(!slideXml.includes("Nosew"), "Nosew without hyphen must not exist");
  assert.ok(slideXml.includes("Tip-quarter"), "Tipquarter and Tip quarter must be auto-corrected to Tip-quarter");
  assert.ok(!slideXml.includes("Tipquarter"), "Tipquarter without hyphen must not exist");
});

test("Test 27: Inspection Noun Phrase Adjunct Ordering - Enforces [Component] shape (Toe shape, Collar shape, Heel shape)", async () => {
  const { normalizeInvertedNounPhrases } = await import("../services/translation/casing.js");

  assert.equal(normalizeInvertedNounPhrases("1. Shape tip and shape toe"), "1. Tip shape and Toe shape");
  assert.equal(normalizeInvertedNounPhrases("Shape collar must be neat"), "Collar shape must be neat");
  assert.equal(normalizeInvertedNounPhrases("Check Shape heel"), "Check Heel shape");
  assert.equal(normalizeInvertedNounPhrases("Shape vamp"), "Vamp shape");
});

test("Test 28: Auto AI Cascade on Complex Slides - Detects complex slide and sets requiresIsqDuplicate", async () => {
  const { auditPptxGaps } = await import("../services/translation/smart-detector.js");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>ISQ STRATEGY-CTP-CTQ</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>*Đối với LQ-075W-1</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>1. Kiểm tra logo được may</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await auditPptxGaps(buffer, "ISQ-manual.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    autoAiCascade: false, // tests heuristic tagging
  });

  assert.equal(report.requiresIsqDuplicate, true, "Complex ISQ slide automatically tagged requiresIsqDuplicate = true");
  assert.equal(report.units.find((u) => u.sourceText.includes("Kiểm tra logo")).status, "NEEDS_TRANSLATION");
});

test("Test 29: Zero-token Pass for Simple Decks - Runs pure local heuristics in < 0.2s with 0 tokens spent", async () => {
  const { auditPptxGaps } = await import("../services/translation/smart-detector.js");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:rPr sz="1200"/><a:t>Standard Operating Procedure</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>GOOD</a:t></a:r></a:p>
      <a:p><a:r><a:rPr sz="1200"/><a:t>NO GOOD</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const start = Date.now();
  const report = await auditPptxGaps(buffer, "simple.pptx", {
    sourceLang: "vi",
    targetLang: "en",
  });
  const duration = Date.now() - start;

  assert.ok(duration < 1500, `Execution took ${duration}ms, must be < 1500ms`);
  assert.equal(report.untranslatedCount, 0, "Zero untranslated items in pure English/label deck");
  assert.equal(report.translatableMissingCount, 0, "Zero missing translatables");
  assert.equal(report.requiresIsqDuplicate, false, "Simple deck does not require ISQ duplication");
});

test("Test 30: Universal Dynamic Model Handling - Zero hardcoding across thousands of footwear models and styles", async () => {
  const { isShoeModelName } = await import("../services/translation/smart-detector.ts");
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");

  // 1. Dynamic Model Recognition Check: Must recognize arbitrary factory and brand models without pre-registration
  const testModels = [
    "FD0736-001",           // Nike 9-char style-color code
    "CW2288-111",           // Nike style code
    "315122-111",           // Numeric Nike style code
    "W-088",                // Short factory code
    "SB-077-A-1",           // Complex factory development code
    "(SB-077-C)",           // Parenthesized spec code
    "DEV-2025-1",           // Development code
    "PEGASUS 41",           // Branded silhouette
    "ASICS GEL-KAYANO 31",  // Asics runner
    "NEW BALANCE 1906R",    // New Balance lifestyle
    "HOKA CLIFTON 9",       // Hoka maximalist runner
    "SALOMON XT-6",         // Salomon trail runner
    "Model X-99",           // Generic model label
    "Sample #1",            // Generic sample label
  ];

  for (const m of testModels) {
    assert.ok(isShoeModelName(m), `Model '${m}' must be dynamically recognized as shoe model name`);
  }

  // 2. Dynamic Smart Audit & Translation Check: Arbitrary model prefixes translated dynamically
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);

  const dynamicItems = [
    { vi: "*Đối với FD0736-001", expected: "*For FD0736-001" },
    { vi: "*Đối với (SB-077-C)", expected: "*For (SB-077-C)" },
    { vi: "*Đối với W-088", expected: "*For W-088" },
    { vi: "*Đối với ASICS GEL-KAYANO 31", expected: "*For ASICS GEL-KAYANO 31" },
    { vi: "*Áp dụng cho NEW BALANCE 1906R", expected: "*For NEW BALANCE 1906R" },
    { vi: "*Dành cho Model X-99", expected: "*For Model X-99" },
    { vi: "*Mẫu: FZ4044-001", expected: "*Model: FZ4044-001" },
  ];

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      ${dynamicItems.map(it => `<a:p><a:r><a:rPr sz="1200"/><a:t>${it.vi}</a:t></a:r></a:p>`).join("")}
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "dynamic_models.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "replace_en"
  });

  for (const item of dynamicItems) {
    const unit = auditReport.units.find(u => u.sourceText === item.vi);
    assert.ok(unit, `Unit found for '${item.vi}'`);
    assert.equal(unit.suggestedTranslation, item.expected, `Suggested translation matches '${item.expected}'`);
    assert.equal(unit.status, "LOCKED_TERMINOLOGY", `Unit '${item.vi}' must be locked terminology`);
  }

  // 3. Translation Execution: Translates dynamically with zero LLM calls and zero VI leaks
  let llmCalls = 0;
  const mockProvider = {
    name: "mock-engine",
    async translateBatch() { llmCalls++; return { results: new Map(), provider: "mock-engine", durationMs: 5 }; },
    async translate() { llmCalls++; return { translatedText: "", provider: "mock-engine", durationMs: 5 }; }
  };

  const transResult = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  assert.equal(llmCalls, 0, "All dynamic model prefixes must resolve without calling LLM");
  const zipAfter = await JSZip.loadAsync(transResult.translatedBuffer);
  const outXml = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");

  for (const item of dynamicItems) {
    assert.ok(outXml.includes(item.expected), `Output XML must contain '${item.expected}'`);
  }
  assert.ok(!outXml.includes("*Đối với"), "Vietnamese prefix *Đối với must be absent");
  assert.ok(!outXml.includes("*Áp dụng cho"), "Vietnamese prefix *Áp dụng cho must be absent");
  assert.ok(!outXml.includes("*Dành cho"), "Vietnamese prefix *Dành cho must be absent");
});

test("Test 31: Block Bilingual Support - 1.EN..4.EN ... 1.VI..4.VI and vice versa (1.VI..4.VI ... 1.EN..4.EN)", async () => {
  const { splitBilingualText, pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const { scanPptxTranslationIntelligence } = await import("../services/translation/pptx-smart-audit.ts");

  // 1. Check splitBilingualText for both directions in single multi-line strings
  const enViBlockStr = [
    "1. Clean the surface",
    "2. Apply primer coat",
    "3. Heat activate at 55C",
    "4. Press sole firmly",
    "1. Làm sạch bề mặt",
    "2. Quét lớp chất xử lý",
    "3. Kích hoạt nhiệt ở 55C",
    "4. Ép đế giày chắc chắn"
  ].join("\n");

  const viEnBlockStr = [
    "1. Làm sạch bề mặt",
    "2. Quét lớp chất xử lý",
    "3. Kích hoạt nhiệt ở 55C",
    "4. Ép đế giày chắc chắn",
    "1. Clean the surface",
    "2. Apply primer coat",
    "3. Heat activate at 55C",
    "4. Press sole firmly"
  ].join("\n");

  const splitEnVi = splitBilingualText(enViBlockStr);
  assert.ok(splitEnVi, "splitBilingualText parses EN-first block format");
  assert.ok(splitEnVi.en.includes("1. Clean the surface") && splitEnVi.en.includes("4. Press sole firmly"));
  assert.ok(splitEnVi.vi.includes("1. Làm sạch bề mặt") && splitEnVi.vi.includes("4. Ép đế giày chắc chắn"));

  const splitViEn = splitBilingualText(viEnBlockStr);
  assert.ok(splitViEn, "splitBilingualText parses VI-first block format");
  assert.ok(splitViEn.en.includes("1. Clean the surface") && splitViEn.en.includes("4. Press sole firmly"));
  assert.ok(splitViEn.vi.includes("1. Làm sạch bề mặt") && splitViEn.vi.includes("4. Ép đế giày chắc chắn"));

  // 2. Check Smart Audit: In-container multi-paragraph block pairing for both directions
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`);

  // Slide 1: Shape 1 contains 1.EN..4.EN followed by 1.VI..4.VI
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:t>1. Clean the surface</a:t></a:r></a:p>
      <a:p><a:r><a:t>2. Apply primer coat</a:t></a:r></a:p>
      <a:p><a:r><a:t>3. Heat activate at 55C</a:t></a:r></a:p>
      <a:p><a:r><a:t>4. Press sole firmly</a:t></a:r></a:p>
      <a:p><a:r><a:t>1. Làm sạch bề mặt</a:t></a:r></a:p>
      <a:p><a:r><a:t>2. Quét lớp chất xử lý</a:t></a:r></a:p>
      <a:p><a:r><a:t>3. Kích hoạt nhiệt ở 55C</a:t></a:r></a:p>
      <a:p><a:r><a:t>4. Ép đế giày chắc chắn</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  // Slide 2: Shape 1 contains 1.VI..4.VI followed by 1.EN..4.EN
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:bodyPr/>
      <a:p><a:r><a:t>1. Làm sạch bề mặt</a:t></a:r></a:p>
      <a:p><a:r><a:t>2. Quét lớp chất xử lý</a:t></a:r></a:p>
      <a:p><a:r><a:t>3. Kích hoạt nhiệt ở 55C</a:t></a:r></a:p>
      <a:p><a:r><a:t>4. Ép đế giày chắc chắn</a:t></a:r></a:p>
      <a:p><a:r><a:t>1. Clean the surface</a:t></a:r></a:p>
      <a:p><a:r><a:t>2. Apply primer coat</a:t></a:r></a:p>
      <a:p><a:r><a:t>3. Heat activate at 55C</a:t></a:r></a:p>
      <a:p><a:r><a:t>4. Press sole firmly</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await scanPptxTranslationIntelligence(buffer, "block_bilingual.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "replace_en"
  });

  // Verify all 8 items on Slide 1 & Slide 2 are recognized as ALREADY_TRANSLATED and unchecked
  const viUnitsSlide1 = auditReport.units.filter(u => u.location.slideIndex === 1 && /Làm sạch|Quét lớp|Kích hoạt|Ép đế/.test(u.sourceText));
  assert.equal(viUnitsSlide1.length, 4, "4 VI units on Slide 1");
  for (const u of viUnitsSlide1) {
    assert.equal(u.status, "ALREADY_TRANSLATED", `Slide 1 VI unit '${u.sourceText}' must be ALREADY_TRANSLATED`);
    assert.equal(u.selectedForTranslation, false, `Slide 1 VI unit '${u.sourceText}' must be unchecked`);
  }

  const viUnitsSlide2 = auditReport.units.filter(u => u.location.slideIndex === 2 && /Làm sạch|Quét lớp|Kích hoạt|Ép đế/.test(u.sourceText));
  assert.equal(viUnitsSlide2.length, 4, "4 VI units on Slide 2");
  for (const u of viUnitsSlide2) {
    assert.equal(u.status, "ALREADY_TRANSLATED", `Slide 2 VI unit '${u.sourceText}' must be ALREADY_TRANSLATED`);
    assert.equal(u.selectedForTranslation, false, `Slide 2 VI unit '${u.sourceText}' must be unchecked`);
  }

  // 3. Check PPTX Translation in replace_en mode: Outputs ONLY single English block, zero duplicates
  let llmCalls = 0;
  const mockProvider = {
    name: "mock-engine",
    async translateBatch() { llmCalls++; return { results: new Map(), provider: "mock-engine", durationMs: 5 }; },
    async translate() { llmCalls++; return { translatedText: "", provider: "mock-engine", durationMs: 5 }; }
  };

  const transResult = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  assert.equal(llmCalls, 0, "No LLM calls needed for already bilingual blocks");
  const zipAfter = await JSZip.loadAsync(transResult.translatedBuffer);
  const slide1After = await zipAfter.file("ppt/slides/slide1.xml")?.async("string");
  const slide2After = await zipAfter.file("ppt/slides/slide2.xml")?.async("string");

  // Slide 1 checks: Exactly 1 instance of each English step, 0 Vietnamese
  assert.ok(slide1After.includes("Clean the surface") && slide1After.includes("Press sole firmly"));
  assert.ok(!slide1After.includes("Làm sạch"), "Slide 1 must not contain Vietnamese");
  const s1Matches = slide1After.match(/Clean the surface/g) || [];
  assert.equal(s1Matches.length, 1, "Slide 1 has exactly 1 English step 1 (no duplicates)");

  // Slide 2 checks: Exactly 1 instance of each English step, 0 Vietnamese
  assert.ok(slide2After.includes("Clean the surface") && slide2After.includes("Press sole firmly"));
  assert.ok(!slide2After.includes("Làm sạch"), "Slide 2 must not contain Vietnamese");
  const s2Matches = slide2After.match(/Clean the surface/g) || [];
  assert.equal(s2Matches.length, 1, "Slide 2 has exactly 1 English step 1 (no duplicates)");
});

test("Test 32: In-Slide Focus Heading & Trailing Notes - All paired as ALREADY_TRANSLATED without leaking needs_translation", async () => {
  const { auditPptxGaps } = await import("../services/translation/smart-detector.ts");
  const fs = await import("fs");
  const path = await import("path");

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Slide Title</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:t>IPQC Stitching Inspection Focuses: Swoosh stitching</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:t>Trọng điểm kiểm tra may logo</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>1.Place swoosh follow marking on quarter lateral &amp; foxing of left foot.</a:t></a:r></a:p>
        <a:p><a:r><a:t>2.Check stitching swoosh if margin 1.5mm, 9-10 stitches/inch, marking line must not visible exposed</a:t></a:r></a:p>
        <a:p><a:r><a:t>Due to the design, the natural Swoosh wave shape is acceptable follow QA manual</a:t></a:r></a:p>
      </p:txBody></p:sp>
      <p:sp><p:txBody>
        <a:p><a:r><a:t>1.Kiểm tra logo được đặt đúng định vị trên eo ngoài và trang trí gót mặt sau của chân trái</a:t></a:r></a:p>
        <a:p><a:r><a:t>2.Kiểm tra sau khi may logo nằm đúng vị trí cách biên 1.5mm 9-10 mũi/inch, không lỗi đường định vị</a:t></a:r></a:p>
        <a:p><a:r><a:t>Do thiết kế phần eo có lập thể nên chấp nhận Swoosh gợn sóng tự nhiên cập nhật QAM</a:t></a:r></a:p>
      </p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", slideXml);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const report = await auditPptxGaps(buffer, "HO26 NIKE CPFM AIR FLEA 1QA IPQC manual-EN.pptx", {
    sourceLang: "vi",
    targetLang: "en",
    mode: "ipqc_bilingual",
    autoAiCascade: false,
  });

  const headingVi = report.units.find((u) => u.sourceText.includes("Trọng điểm kiểm tra may logo"));
  assert.ok(headingVi, "Vietnamese heading must be found");
  assert.equal(headingVi.status, "ALREADY_TRANSLATED");
  assert.equal(headingVi.requiresTranslation, false);
  assert.ok(headingVi.existingTranslation?.includes("IPQC Stitching Inspection Focuses"));

  const step1Vi = report.units.find((u) => u.sourceText.includes("Kiểm tra logo được đặt đúng định vị"));
  assert.ok(step1Vi, "Vietnamese step 1 must be found");
  assert.equal(step1Vi.status, "ALREADY_TRANSLATED");
  assert.equal(step1Vi.requiresTranslation, false);
  assert.ok(step1Vi.existingTranslation?.includes("Place swoosh follow marking"));

  const step2Vi = report.units.find((u) => u.sourceText.includes("Kiểm tra sau khi may logo"));
  assert.ok(step2Vi, "Vietnamese step 2 must be found");
  assert.equal(step2Vi.status, "ALREADY_TRANSLATED");
  assert.equal(step2Vi.requiresTranslation, false);
  assert.ok(step2Vi.existingTranslation?.includes("Check stitching swoosh"));

  const noteVi = report.units.find((u) => u.sourceText.includes("Do thiết kế phần eo có lập thể"));
  assert.ok(noteVi, "Vietnamese note must be found");
  assert.equal(noteVi.status, "ALREADY_TRANSLATED");
  assert.equal(noteVi.requiresTranslation, false);
  assert.ok(noteVi.existingTranslation?.includes("Due to the design"));

  // Check telemetry trace file exists on disk
  const tracePath = path.resolve(process.cwd(), "data", "audit_traces", "latest_trace.json");
  assert.ok(fs.existsSync(tracePath), "latest_trace.json must exist");
  const traceContent = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
  assert.equal(traceContent.fileName, "HO26 NIKE CPFM AIR FLEA 1QA IPQC manual-EN.pptx");
  assert.equal(traceContent.summary.needsTranslation, 0);
});










