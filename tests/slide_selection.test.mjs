import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseSlideRange } from "../services/documents/pptx-slide-order";
import { pptxTranslatorService } from "../services/documents/pptx-translator";

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
