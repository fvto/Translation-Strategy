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
