import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { pptxTranslatorService, escapeXml, isSafeTerminologyEntry, unescapeXml } from "../services/documents/pptx-translator.ts";
import { dynamicDeckDetector } from "../services/documents/pptx-structure.ts";

test("PPTX XML Helper - escapeXml and unescapeXml", () => {
  const input = 'Kiểm tra "chất lượng" & an toàn <ISO> \'2026\'';
  const escaped = escapeXml(input);
  assert.equal(escaped, 'Kiểm tra "chất lượng" &amp; an toàn &lt;ISO&gt; \'2026\'');
  const unescaped = unescapeXml(escaped);
  assert.equal(unescaped, input);
});

test("PPTX XML Helper - prevents double escaping and apos artifacts", () => {
  assert.equal(escapeXml("Welding &amp;amp; Nosew"), "Welding &amp; Nosew");
  assert.equal(escapeXml("Welding &amp; Nosew"), "Welding &amp; Nosew");
  assert.equal(escapeXml("Welding & Nosew"), "Welding &amp; Nosew");
  assert.equal(escapeXml("time 30''"), "time 30''");
  assert.equal(escapeXml("time 30&apos;&apos;"), "time 30''");
});

test("PPTX Translator - Crawling & Image Shield Protection", async () => {
  const zip = new JSZip();

  // Slide 1 XML with Title and Bullet points
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Chiến lược phát triển 2026</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Mục tiêu 1: Nâng cao năng lực sản xuất</a:t></a:r></a:p>
          <a:p><a:r><a:t>Mục tiêu 2: Kiểm soát chất lượng nghiêm ngặt</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  // Slide 2 XML with Table and multiple runs in single paragraph
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:t>Kế hoạch </a:t></a:r>
            <a:r><a:t>hành động</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  // Speaker notes for slide 1
  const notes1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Ghi chú: Cần trình bày rõ ràng với ban giám đốc.</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`;

  // Add dummy media image (Binary picture)
  const dummyImageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);
  zip.file("ppt/notesSlides/notesSlide1.xml", notes1Xml);
  zip.file("ppt/media/company_logo.png", dummyImageBytes);

  const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });

  // 1. Test Crawling
  const { stats, slides } = await pptxTranslatorService.crawl(pptxBuffer);

  assert.equal(stats.totalSlides, 2);
  assert.equal(stats.totalImagesProtected, 1);
  assert.deepEqual(stats.protectedImageNames, ["company_logo.png"]);
  assert.equal(stats.imageShieldActive, true);

  assert.equal(slides.length, 2);
  assert.equal(slides[0].title, "Chiến lược phát triển 2026");
  assert.equal(slides[0].paragraphs.length, 3);
  assert.ok(slides[0].notes?.includes("Ghi chú: Cần trình bày"));

  // Check multi-run concatenation in Slide 2
  assert.equal(slides[1].paragraphs.length, 1);
  assert.equal(slides[1].paragraphs[0].originalText, "Kế hoạch hành động");

  // 2. Test Translation & Image Preservation
  // Create a mock provider that records what text was translated and asserts no image data was sent
  const translatedTexts = [];
  const mockProvider = {
    name: "test_mock",
    async translate(req) {
      // Security assertion: Req must only contain plain text, never binary/base64 image data
      assert.ok(!req.sourceText.includes("data:image"));
      assert.ok(!req.sourceText.includes("PNG"));
      translatedTexts.push(req.sourceText);

      if (req.sourceText.includes("Chiến lược phát triển")) {
        return { translatedText: "Development Strategy 2026", provider: "mock", durationMs: 5 };
      }
      if (req.sourceText.includes("Nâng cao năng lực sản xuất")) {
        return { translatedText: "Goal 1: Enhance production capacity", provider: "mock", durationMs: 5 };
      }
      if (req.sourceText.includes("Kiểm soát chất lượng")) {
        return { translatedText: "Goal 2: Strict quality control", provider: "mock", durationMs: 5 };
      }
      if (req.sourceText.includes("Kế hoạch hành động")) {
        return { translatedText: "Action Plan", provider: "mock", durationMs: 5 };
      }
      if (req.sourceText.includes("Ghi chú: Cần trình bày")) {
        return { translatedText: "Note: Must present clearly to BOD.", provider: "mock", durationMs: 5 };
      }

      return { translatedText: `[EN] ${req.sourceText}`, provider: "mock", durationMs: 5 };
    },
  };

  const result = await pptxTranslatorService.translate(pptxBuffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  assert.equal(result.stats.totalSlides, 2);
  assert.equal(result.stats.totalImagesProtected, 1);

  // 3. Inspect generated translated PPTX ZIP
  const translatedZip = await JSZip.loadAsync(result.translatedBuffer);

  // CRITICAL SECURITY ASSERTION: Image was 100% untouched and preserved in translated PPTX
  const preservedImageBytes = await translatedZip.file("ppt/media/company_logo.png")?.async("nodebuffer");
  assert.ok(preservedImageBytes, "Image must exist in translated PPTX");
  assert.equal(preservedImageBytes.compare(dummyImageBytes), 0, "Image bytes must match original byte-for-byte");

  // Verify translated slide XML
  const translatedSlide1Xml = await translatedZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(translatedSlide1Xml.includes("Development Strategy 2026"));
  assert.ok(translatedSlide1Xml.includes("Goal 1: Enhance production capacity"));
  assert.ok(translatedSlide1Xml.includes("Goal 2: Strict quality control"));
  assert.ok(!translatedSlide1Xml.includes("Chiến lược phát triển 2026")); // Vietnamese replaced

  const translatedSlide2Xml = await translatedZip.file("ppt/slides/slide2.xml")?.async("string");
  assert.ok(translatedSlide2Xml.includes("Action Plan"));

  const translatedNotes1Xml = await translatedZip.file("ppt/notesSlides/notesSlide1.xml")?.async("string");
  assert.ok(translatedNotes1Xml.includes("Note: Must present clearly to BOD."));

  // 4. Test Rebuilding with manual edits
  result.slides[0].paragraphs[0].translatedText = "Custom Master Plan 2026";
  const rebuiltBuffer = await pptxTranslatorService.rebuildWithTranslations(
    pptxBuffer,
    result.slides
  );
  const rebuiltZip = await JSZip.loadAsync(rebuiltBuffer);
  const rebuiltSlide1Xml = await rebuiltZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(rebuiltSlide1Xml.includes("Custom Master Plan 2026"));
});


test("PPTX Translator - SOP Bilingual Mode Retains Vietnamese and English", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:pPr><a:buNone/></a:pPr>
            <a:r><a:rPr lang="vi-VN" sz="1400"/><a:t>Kiểm tra độ bám dính keo</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "test_bilingual_mock",
    async translate(req) {
      return { translatedText: "Check cement adhesion", provider: "mock", durationMs: 2 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  const translatedZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await translatedZip.file("ppt/slides/slide1.xml")?.async("string");

  // In IPQC bilingual mode: English is on top, and Vietnamese is kept below
  assert.ok(outSlideXml.includes("Check cement adhesion"));
  assert.ok(outSlideXml.includes("Kiểm tra độ bám dính keo"));
});

test("PPTX Translator - Preserves SPI 9-10 stitches/inch and similar forms intact", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:t>Sử dụng 3mm nylon tape để may vòng cổ, cách biên 2mm 10-12 mũi/inch</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:t>9-10 mũi</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "test_spi_mock",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        if (item.sourceText.includes("10-12 mũi/inch")) {
          // Provider returns "SPI 10-12 stitches/inch"
          results.set(item.id, "Use 3mm nylon tape to stitch collar with margin 2mm, SPI 10-12 stitches/inch");
        } else if (item.sourceText.includes("9-10 mũi")) {
          // Provider returns "SPI 9-10 stitches/inch"
          results.set(item.id, "SPI 9-10 stitches/inch");
        }
      }
      return { results, provider: "mock", durationMs: 2 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const translatedZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await translatedZip.file("ppt/slides/slide1.xml")?.async("string");

  // Verify that SPI stitches/inch is preserved intact per user requirement
  assert.ok(outSlideXml.includes("SPI 10-12 stitches/inch"), "Must preserve 'SPI 10-12 stitches/inch'");
  assert.ok(outSlideXml.includes("SPI 9-10 stitches/inch"), "Must preserve 'SPI 9-10 stitches/inch'");
});

test("PPTX Translator - completes omitted Gemini batch ids, including unaccented footwear terms", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>*May mudguard 1,2</a:t></a:r></a:p>
    <a:p><a:r><a:t>1. Đặt liệu mudguard vào jig.</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  let individualRetries = 0;
  const incompleteGeminiMock = {
    name: "gemini",
    async translateBatch(req) {
      // Simulate Gemini returning valid JSON that omits the numbered instruction.
      const mudguardTitle = req.items.find((item) => item.sourceText.includes("May mudguard"));
      return {
        results: mudguardTitle
          ? new Map([[mudguardTitle.id, "*Stitching mudguard 1,2"]])
          : new Map(),
        provider: "mock",
        durationMs: 1,
      };
    },
    async translate(req) {
      individualRetries += 1;
      return {
        translatedText: req.sourceText.includes("Đặt liệu")
          ? "1. Set mudguard material in the jig."
          : "*Stitching mudguard 1,2",
        provider: "mock",
        durationMs: 1,
      };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: incompleteGeminiMock,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outXml.includes("*Stitching mudguard 1,2"));
  assert.ok(outXml.includes("1. Set mudguard material in the jig."));
  assert.ok(individualRetries >= 1, "An omitted batch id must receive an individual retry");
});

test("PPTX Translator - ignores glossary rows that collapse an instruction into a heading", async () => {
  const corruptEntry = {
    id: "bad-row",
    sourceTerm: "1. Kiểm tra nước thuốc/keo phải dùng đúng theo PFC và còn hạn sử dụng",
    targetTerm: "*Upper priming/cementing",
  };
  assert.equal(isSafeTerminologyEntry(corruptEntry), false);

  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>1. Kiểm tra nước thuốc/keo phải dùng đúng theo PFC và còn hạn sử dụng</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  let providerCalls = 0;
  const provider = {
    name: "safe-glossary-mock",
    async translate() {
      providerCalls += 1;
      return {
        translatedText: "1. Use the approved PFC primer/cement within its shelf life.",
        provider: "mock",
        durationMs: 1,
      };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });
  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.equal(providerCalls, 1, "Unsafe exact mappings must not bypass the translator");
  assert.ok(outXml.includes("1. Use the approved PFC primer/cement within its shelf life."));
  assert.ok(!outXml.includes("*Upper priming/cementing"));
});

test("PPTX Translator - rejects rogue heading mappings and prevents spurious *Lacing insertion between steps", async () => {
  // 1. Verify isSafeTerminologyEntry rejects rogue mappings and fragments
  const rogueLacing = {
    id: "corrupted_thu_6",
    sourceTerm: "thứ 6",
    targetTerm: "*Lacing",
  };
  assert.equal(isSafeTerminologyEntry(rogueLacing), false, "Must reject 'thứ 6' -> '*Lacing'");

  const rogueStar = {
    id: "corrupted_star",
    sourceTerm: "Quét keo",
    targetTerm: "*Cementing",
  };
  assert.equal(isSafeTerminologyEntry(rogueStar), false, "Must reject non-star source to star target");

  const typoEntry = {
    id: "corrupted_typo",
    sourceTerm: "Phun keo",
    targetTerm: "aplly cement",
  };
  assert.equal(isSafeTerminologyEntry(typoEntry), false, "Must reject typo aplly");

  // 2. Build slide XML representing the Lacing process with split 'thứ 6'
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr b="1"/><a:t>*Cột dây</a:t></a:r></a:p>
    <a:p><a:r><a:t>1.Sử dụng rập kiểm tra độ mở của ô dê sau khi cột dây</a:t></a:r></a:p>
    <a:p><a:r><a:t>2.Kiểm tra không được xiết dây quá mạnh ( dây ôm sát phom )chỉ xỏ dây tới nấc</a:t></a:r></a:p>
    <a:p><a:r><a:t>thứ 6</a:t></a:r></a:p>
    <a:p><a:r><a:t>3.Sử dụng dây giả để vòng cổ ôm sát phom. Kiểm tra sau khi cột dây eo và ô dê không nhăn</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const { AirGappedTranslationProvider } = await import("../services/translation/offline.ts");
  const result = await pptxTranslatorService.translate(buffer, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
    provider: new AirGappedTranslationProvider(),
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  // Verify *Lacing appears only once as the header
  const lacingMatches = outXml.match(/\*Lacing/g) || [];
  assert.equal(lacingMatches.length, 1, "*Lacing must only appear once as the section header");

  // Verify steps 1, 2, 3 are present
  assert.ok(outXml.includes("eyestay") && outXml.includes("after lacing"), "Step 1 must be translated");
  assert.ok(outXml.includes("tighten") || outXml.includes("too tight"), "Step 2 must be translated");
  assert.ok(outXml.includes("collar opening") || outXml.includes("temporary lace"), "Step 3 must be translated");

  // Verify step 2 is followed directly by step 3 without a spurious *Lacing header in between
  assert.ok(!outXml.includes("eyelet</a:t></a:r></a:p><a:p><a:r><a:rPr b=\"1\"/><a:t>*Lacing"));
});

test("PPTX Translator - translates *Phun keo và dán mos to *Spray cement and attach cement foam with bold", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr b="1"/><a:t>*Phun keo và dán mos</a:t></a:r></a:p>
    <a:p><a:r><a:t>1. Phun keo đều tới vị để qua thành hình không bị nhăn eo</a:t></a:r></a:p>
    <a:p><a:r><a:t>2.Mos lăn keo hai mặt 100%, dán mos theo lỗ đinh</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buffer, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  // Verify correct translation and zero typos
  assert.ok(outXml.includes("*Spray cement and attach cement foam"), "Must be *Spray cement and attach cement foam");
  assert.ok(!outXml.includes("aplly"), "Must have no spelling typo aplly");
  assert.ok(!outXml.includes("apply cement foam"), "Must use attach, not apply");
  assert.ok(outXml.includes('b="1"'), "Must preserve bold formatting on header");
});

test("PPTX Translator - replace_en mode eliminates duplicate English from existing bilingual containers", async () => {
  const slideXmlWithBilingualBox = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr>
      <!-- Title banner -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><p:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="500000" y="200000"/><a:ext cx="8000000" cy="500000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:t>Assembly Inspection Strategy</a:t></a:r></p:txBody>
      </p:sp>
      <!-- Instruction container containing EN on top and VI below with QA-manual mention -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Instructions"/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="500000" y="1500000"/><a:ext cx="8000000" cy="3000000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>1. Check if wheel is covered by paper tape and close to material.</a:t></a:r></a:p>
          <a:p><a:r><a:t>2. Check if scratched heel material. Place heel follow pin holes.</a:t></a:r></a:p>
          <a:p><a:r><a:t>3. After stitching, check straight heel, 9-10 SPI. (Accept scratched level follow QA manual)</a:t></a:r></a:p>
          <a:p><a:r><a:t>1. Kiểm tra bánh xe máy may phải quấn băng keo.</a:t></a:r></a:p>
          <a:p><a:r><a:t>2. Kiểm tra liệu gót không bị trầy. Đặt liệu may theo lỗ định vị.</a:t></a:r></a:p>
          <a:p><a:r><a:t>3. Sau khi may kiểm tra gót thẳng, 9-10 mũi/inch. (Tiêu chuẩn trầy theo QA manual)</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/slides/slide1.xml", slideXmlWithBilingualBox);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "test_duplicate_mock",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        results.set(item.id, "AI Translated: " + item.sourceText);
      }
      return { results, provider: "mock", durationMs: 2 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const translatedZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await translatedZip.file("ppt/slides/slide1.xml")?.async("string");

  // Verify that the Vietnamese was NOT translated into a duplicate second copy of English
  assert.ok(!outSlideXml.includes("AI Translated: 1. Kiểm tra bánh xe"), "Must NOT translate existing Vietnamese into a second duplicate English line");
  assert.ok(!outSlideXml.includes("AI Translated: 2. Kiểm tra liệu gót"), "Must NOT translate existing Vietnamese into a second duplicate English line");
  
  // Verify that the existing English lines are preserved exactly once
  assert.ok(outSlideXml.includes("1. Check if wheel is covered by paper tape"), "Must keep original English line 1");
  assert.ok(outSlideXml.includes("2. Check if scratched heel material"), "Must keep original English line 2");
  assert.ok(outSlideXml.includes("3. After stitching, check straight heel"), "Must keep original English line 3");

  // Verify count of instruction paragraphs: exactly 3 (lines 1, 2, 3), not 6!
  const instructionMatches = outSlideXml.match(/Check if|After stitching/g) || [];
  assert.strictEqual(instructionMatches.length, 3, "Must have exactly 3 English instruction items, not 6 duplicated lines");
});

test("DynamicDeckDetector - Dynamically detects pre-split decks and preserves exact slide count", () => {
  // Simulate an 86-slide deck with IPQC tables, divider, VI ISQ block, and EN ISQ block
  const mockSlides = [];

  // 1. IPQC Table Slides (1..36)
  for (let i = 1; i <= 36; i++) {
    mockSlides.push({
      slideIndex: i,
      slideFileName: `ppt/slides/slide${i}.xml`,
      title: i === 1 ? "SU24 Model Cover" : "Cutting Inspection Strategy",
      paragraphs: [
        { id: `s${i}_p0`, slideIndex: i, shapeIndex: 0, paragraphIndex: 0, originalText: "Inspection Item", translatedText: "" },
        { id: `s${i}_p1`, slideIndex: i, shapeIndex: 0, paragraphIndex: 1, originalText: "Hạng mục kiểm tra", translatedText: "" },
      ],
    });
  }

  // 2. Section Divider (37)
  mockSlides.push({
    slideIndex: 37,
    slideFileName: "ppt/slides/slide37.xml",
    title: "FA22 ISQ Process",
    paragraphs: [
      { id: "s37_p0", slideIndex: 37, shapeIndex: 0, paragraphIndex: 0, originalText: "FA22 ISQ Process", translatedText: "" },
    ],
  });

  // 3. Pre-existing Vietnamese ISQ section (38..65)
  for (let i = 38; i <= 65; i++) {
    mockSlides.push({
      slideIndex: i,
      slideFileName: `ppt/slides/slide${i}.xml`,
      title: "ISQ - Critical to Quality",
      paragraphs: [
        { id: `s${i}_p0`, slideIndex: i, shapeIndex: 0, paragraphIndex: 0, originalText: "ISQ - Critical to Quality", translatedText: "" },
        { id: `s${i}_p1`, slideIndex: i, shapeIndex: 0, paragraphIndex: 1, originalText: "Kiểm tra dao chặt và độ bén của khuôn dao", translatedText: "" },
        { id: `s${i}_p2`, slideIndex: i, shapeIndex: 0, paragraphIndex: 2, originalText: "Tiêu chuẩn kiểm tra chất lượng công đoạn may", translatedText: "" },
      ],
    });
  }

  // 4. Pre-existing English ISQ target section (66..86)
  for (let i = 66; i <= 86; i++) {
    mockSlides.push({
      slideIndex: i,
      slideFileName: `ppt/slides/slide${i}.xml`,
      title: "ISQ - Critical to Quality",
      paragraphs: [
        { id: `s${i}_p0`, slideIndex: i, shapeIndex: 0, paragraphIndex: 0, originalText: "ISQ - Critical to Quality", translatedText: "" },
        { id: `s${i}_p1`, slideIndex: i, shapeIndex: 0, paragraphIndex: 1, originalText: "Check cutting dies and sharpness of cutting blade", translatedText: "" },
        { id: `s${i}_p2`, slideIndex: i, shapeIndex: 0, paragraphIndex: 2, originalText: "Standard quality inspection for stitching process", translatedText: "" },
      ],
    });
  }

  assert.strictEqual(mockSlides.length, 86, "Simulated deck must have 86 slides");

  const plan = dynamicDeckDetector.detectZones(mockSlides, undefined, "ipqc_bilingual");

  // Verify that detector identifies parallel sections dynamically
  assert.strictEqual(plan.hasParallelSections, true, "Must detect pre-existing parallel VI/EN sections");
  assert.strictEqual(plan.totalSlides, 86, "Plan total slides must equal 86");

  // Verify that VI reference block slides are marked keep_original
  assert.strictEqual(plan.targetSlideModes.get(45), "keep_original", "VI ISQ reference slide must be kept original");
  
  // Verify that EN target block slides are marked replace_en
  assert.strictEqual(plan.targetSlideModes.get(75), "replace_en", "EN ISQ target slide must be translated in-place");

  // Verify that IPQC table slides are marked ipqc_bilingual
  assert.strictEqual(plan.targetSlideModes.get(10), "ipqc_bilingual", "IPQC table slide must be bilingual");
});

test("DynamicDeckDetector & SOP Translation - Translates Vietnamese slides when deck starts with English base slides", () => {
  // Simulate presentation like SU25: English base slides followed by divider and Vietnamese ISQ slides
  const mockSlides = [
    {
      slideIndex: 1,
      slideFileName: "ppt/slides/slide1.xml",
      title: "SU25 Model Cover",
      paragraphs: [{ id: "s1_p0", slideIndex: 1, shapeIndex: 0, paragraphIndex: 0, originalText: "SU25 Model Cover", translatedText: "" }],
    },
    {
      slideIndex: 2,
      slideFileName: "ppt/slides/slide2.xml",
      title: "ISQ - Critical to Quality",
      paragraphs: [
        { id: "s2_p0", slideIndex: 2, shapeIndex: 0, paragraphIndex: 0, originalText: "ISQ - Critical to Quality", translatedText: "" },
        { id: "s2_p1", slideIndex: 2, shapeIndex: 0, paragraphIndex: 1, originalText: "Check cutting dies and sharpness", translatedText: "" },
      ],
    },
    {
      slideIndex: 3,
      slideFileName: "ppt/slides/slide3.xml",
      title: "Divider Sub-model SBQ",
      paragraphs: [{ id: "s3_p0", slideIndex: 3, shapeIndex: 0, paragraphIndex: 0, originalText: "Divider Sub-model SBQ", translatedText: "" }],
    },
    {
      slideIndex: 4,
      slideFileName: "ppt/slides/slide4.xml",
      title: "ISQ - Cắt và Mài",
      paragraphs: [
        { id: "s4_p0", slideIndex: 4, shapeIndex: 0, paragraphIndex: 0, originalText: "ISQ - Cắt và Mài", translatedText: "" },
        { id: "s4_p1", slideIndex: 4, shapeIndex: 0, paragraphIndex: 1, originalText: "Kiểm tra dao chặt và độ bén của khuôn dao", translatedText: "" },
        { id: "s4_p2", slideIndex: 4, shapeIndex: 0, paragraphIndex: 2, originalText: "Quét xử lý MEK theo tiêu chuẩn", translatedText: "" },
      ],
    },
  ];

  const plan = dynamicDeckDetector.detectZones(mockSlides, undefined, "ipqc_bilingual");

  // Crucial: Must NOT falsely detect pre-existing parallel sections (since English comes first, not subsequent)
  assert.strictEqual(plan.hasParallelSections, false, "Must not flag deck as pre-split when English is at the start");

  // Crucial: Vietnamese ISQ slide must be designated replace_en for pure English top slide under Option 1
  assert.strictEqual(plan.targetSlideModes.get(4), "replace_en", "ISQ slide must be designated as replace_en under Ching Luh Option 1");
});

test("Ching Luh Option 1 - ISQ slide with tables duplicates into 1 pure EN slide and 1 original VI slide", async () => {
  const zip = new JSZip();

  // presentation.xml with 2 slides: Slide 1 is IPQC table, Slide 2 is ISQ Cutting Die table
  const presXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`;

  const presRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

  // Slide 1: IPQC Standard Process with table
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Quy trình may</a:t></a:r></a:p>
          <a:p><a:r><a:t>Kiểm tra đường may và mép vật liệu</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <a:tbl>
        <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Hạng mục kiểm tra</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
      </a:tbl>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  // Slide 2: ISQ Cutting Die with table
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>ISQ - Khuôn dao chặt</a:t></a:r></a:p>
          <a:p><a:r><a:t>Kiểm tra độ bén khuôn dao chặt</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <a:tbl>
        <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Tiêu chuẩn khuôn dao chặt</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
      </a:tbl>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/presentation.xml", presXml);
  zip.file("ppt/_rels/presentation.xml.rels", presRelsXml);
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/slide2.xml", slide2Xml);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const mockProvider = {
    name: "test_isq_option1_mock",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        if (item.sourceText.includes("Quy trình may")) {
          results.set(item.id, "Stitching process");
        } else if (item.sourceText.includes("Kiểm tra đường may")) {
          results.set(item.id, "Check stitch line and material edge");
        } else if (item.sourceText.includes("Hạng mục kiểm tra")) {
          results.set(item.id, "Inspection item");
        } else if (item.sourceText.includes("ISQ - Khuôn dao chặt")) {
          results.set(item.id, "ISQ - Cutting Die");
        } else if (item.sourceText.includes("Kiểm tra độ bén")) {
          results.set(item.id, "Check cutting die sharpness");
        } else if (item.sourceText.includes("Tiêu chuẩn khuôn dao chặt")) {
          results.set(item.id, "Cutting die standard");
        } else {
          results.set(item.id, "Translated: " + item.sourceText);
        }
      }
      return { results, provider: "mock", durationMs: 2 };
    },
  };

  const result = await pptxTranslatorService.translate(buffer, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
    fileName: "SOP_Cutting_Die_ISQ.pptx",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outPresXml = await outZip.file("ppt/presentation.xml")?.async("string");

  // Under Ching Luh Option 1:
  // Slide 1 (IPQC) is NOT duplicated.
  // Slide 2 (ISQ with table) IS duplicated into Slide 2 (top: pure EN) and Slide 1002 (bottom: original VI)!
  const sldIds = Array.from(outPresXml.matchAll(/<p:sldId\b[^>]*\/>/g));
  assert.strictEqual(sldIds.length, 3, "Deck must now have 3 slides (1 IPQC + 1 ISQ EN + 1 ISQ VI)");

  // Verify Slide 1 (IPQC): Bilingual (has EN and keeps VI)
  const outSlide1Xml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlide1Xml.includes("Stitching process"), "IPQC must contain English");
  assert.ok(outSlide1Xml.includes("Quy trình may"), "IPQC must keep Vietnamese underneath");

  // Verify Slide 2 (ISQ Top): Pure English (replace_en, NO Vietnamese leakage!)
  const outSlide2Xml = await outZip.file("ppt/slides/slide2.xml")?.async("string");
  assert.ok(outSlide2Xml.includes("Check cutting die sharpness"), "ISQ top slide must have English translation");
  assert.ok(!outSlide2Xml.includes("Kiểm tra độ bén"), "ISQ top slide must NOT retain Vietnamese (replace_en rule)");

  // Verify Slide 1002 (ISQ Duplicated Bottom): Original Vietnamese intact!
  const outSlideDupXml = await outZip.file("ppt/slides/slide1002.xml")?.async("string");
  assert.ok(outSlideDupXml !== undefined, "Duplicated ISQ slide must exist in zip");
  assert.ok(outSlideDupXml.includes("Kiểm tra độ bén khuôn dao chặt"), "Duplicated ISQ bottom slide must keep original Vietnamese intact");
});

test("PPTX ISQ - CTQ column with identifier code does not trigger false bilingual block (SBQ bug fix)", async () => {
  // Regression: In ISQ CTQ column, paragraphs like:
  //   Para 1: "4.HF logo trang trí lưỡi không hở keo"  (Vietnamese)
  //   Para 2: "(SBQ-083-6)"                             (Code: NOT a genuine EN paragraph)
  // MUST NOT trigger isParallelBilingualBlock. Both paras should be translated.
  const zip = new JSZip();

  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:rPr lang="vi-VN"/><a:t>4.HF logo trang tri luoi khong ho keo</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>(SBQ-083-6)</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml, "Output slide XML must exist");
  // The SBQ code must still be present
  assert.ok(outXml.includes("SBQ-083-6"), "SBQ identifier code must be preserved in output");
  // Ensure there is substantive translated content beyond just the code (at least 2 paragraphs)
  const pCount = (outXml.match(/<a:p[>\s]/g) || []).length;
  assert.ok(pCount >= 2, `Output must have at least 2 paragraphs (got ${pCount}), not just the SBQ code alone`);
});

test("PPTX Translator - Partial bold paragraph does NOT fabricate bold on translated text", async () => {
  const zip = new JSZip();
  // Para has Run 1: "1. " (bold b="1"), Run 2: "Thao tác bình thường" (not bold)
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p>
          <a:r><a:rPr b="1"/><a:t>1. </a:t></a:r>
          <a:r><a:rPr/><a:t>Thao tác bình thường không in đậm</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const mockProvider = {
    name: "test_bold_mock",
    async translate(req) {
      return { translatedText: "1. Normal non-bold operation", provider: "mock", durationMs: 1 };
    },
  };

  const result = await pptxTranslatorService.translate(buf, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml, "Output slide XML must exist");
  assert.ok(outXml.includes("Normal non-bold operation"));
  // Verify that b="1" is NOT present on the paragraph run
  assert.ok(!outXml.includes('b="1"'), "Translated paragraph must NOT inherit bold from prefix run");
});

test("PPTX Translator - Multi-line steps in single paragraph restore into separate paragraphs", async () => {
  const zip = new JSZip();
  // Single paragraph with <a:br/> separating step 2 and step 3
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p>
          <a:r><a:t>2. Thao tác thứ nhất</a:t></a:r>
          <a:br/>
          <a:r><a:t>3. Thao tác thứ hai</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  // Simulate AI translation provider returning steps merged without newline
  const mockProvider = {
    name: "test_line_break_mock",
    async translateBatch(req) {
      const results = new Map();
      for (const item of req.items) {
        results.set(item.id, "2. First operation 3. Second operation");
      }
      return { results, provider: "mock", durationMs: 1 };
    },
  };

  const result = await pptxTranslatorService.translate(buf, {
    provider: mockProvider,
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml, "Output slide XML must exist");
  assert.ok(outXml.includes("First operation"));
  assert.ok(outXml.includes("Second operation"));
  // Both steps must be on separate <a:p> elements
  const pCount = (outXml.match(/<a:p[>\s]/g) || []).length;
  assert.strictEqual(pCount, 2, `Steps 2 and 3 must be on separate <a:p> elements (expected 2, got ${pCount})`);
});

test("PPTX Translator - English steps followed by Vietnamese model-specific notes (*Đối với) does NOT drop paragraphs", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>1.Check if nosew bond gap/delaminate on upper</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>2.Time/temperature of heating oven follow PFC</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>3.Place lasted upper correct way after cementing</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="vi-VN" b="1"/><a:t>*Đối với SB-077-A-1</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="vi-VN"/><a:t>Kiểm tra thành phẩm mặt giày Tip quarter không hở keo nosew.</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="vi-VN" b="1"/><a:t>*Đối với SB-077-P-1:</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="vi-VN"/><a:t>Do có in 1 lớp keo trên bề mặt liệu vamp vị trí Tip quarter có dao động khác màu.</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml, "Output slide XML must exist");
  assert.ok(outXml.includes("SB-077-A-1"), "SB-077-A-1 must be present in output");
  assert.ok(outXml.includes("SB-077-P-1"), "SB-077-P-1 must be present in output");
  const pCount = (outXml.match(/<a:p[>\s]/g) || []).length;
  assert.strictEqual(pCount, 7, `All 7 paragraphs must be preserved, none dropped (got ${pCount})`);
});

test("DynamicDeckDetector & PPTX Translator - Inspection Strategy slides after HFPA are converted to 1 EN + 1 VI slides", async () => {
  const zip = new JSZip();

  // Slide 1: Cover
  const s1Xml = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>FA25 NIKE MODEL IPQC MANUAL</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  // Slide 2: Pre-HFPA Cutting Inspection Strategy Table
  const s2Xml = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Cutting Inspection Strategy</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Kiểm tra dao chặt</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`;
  // Slide 3: HFPA Inspection Strategy Table
  const s3Xml = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>HFPA Inspection Strategy</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Hạng mục HFPA</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`;
  // Slide 4: Post-HFPA Cutting Inspection Strategy Focus Slide
  const s4Xml = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Cutting Inspection Strategy</a:t></a:r></a:p><a:p><a:r><a:t>IPQC Cutting Inspection Focuses</a:t></a:r></a:p><a:p><a:r><a:t>Kiểm tra chất lượng dao chặt theo rập chuẩn.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  // Slide 5: Post-HFPA Inspection Strategy Focus Slide
  const s5Xml = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Inspection strategy</a:t></a:r></a:p><a:p><a:r><a:t>IPQC Inspection Focuses:</a:t></a:r></a:p><a:p><a:r><a:t>Kiểm tra keo và độ dính thành phẩm.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

  zip.file("ppt/slides/slide1.xml", s1Xml);
  zip.file("ppt/slides/slide2.xml", s2Xml);
  zip.file("ppt/slides/slide3.xml", s3Xml);
  zip.file("ppt/slides/slide4.xml", s4Xml);
  zip.file("ppt/slides/slide5.xml", s5Xml);

  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/><p:sldId id="259" r:id="rId4"/><p:sldId id="260" r:id="rId5"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide4.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide5.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide4.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide5.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outPresXml = await outZip.file("ppt/presentation.xml")?.async("string");
  const sldIdMatches = outPresXml?.match(/<p:sldId\s+[^>]*\/>/g) || [];

  // Slide 1 (Cover) = 1 slide
  // Slide 2 & 3 (Pre-HFPA tables) = 2 slides (NOT duplicated, bilingual in-place)
  // Slide 4 & 5 (Post-HFPA Inspection Strategy slides) = duplicated to 2 EN + 2 original VI slides (total 4 slides)
  // Grand total slides = 1 + 2 + 4 = 7 slides!
  assert.strictEqual(sldIdMatches.length, 7, `Expected 7 slides after post-HFPA duplication, got ${sldIdMatches.length}`);

  // In the top slide of slide 4 (ppt/slides/slide4.xml), it must be translated to English without Vietnamese leakage
  const outS4Xml = await outZip.file("ppt/slides/slide4.xml")?.async("string");
  assert.ok(outS4Xml, "Slide 4 XML must exist");

  // In replace_en (Option 2: EN only), post-HFPA rule does NOT apply: slide count remains strictly 5
  const resultEnOnly = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });
  const outZipEnOnly = await JSZip.loadAsync(resultEnOnly.translatedBuffer);
  const outPresXmlEnOnly = await outZipEnOnly.file("ppt/presentation.xml")?.async("string");
  const sldIdMatchesEnOnly = outPresXmlEnOnly?.match(/<p:sldId\s+[^>]*\/>/g) || [];
  assert.strictEqual(sldIdMatchesEnOnly.length, 5, `Expected exactly 5 slides in replace_en mode without post-HFPA duplication, got ${sldIdMatchesEnOnly.length}`);
  assert.ok(!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(outS4Xml), "Slide 4 top slide must be pure English with zero Vietnamese leakage");
});

test("PPTX Translator - Preserves Model Code and Instruction Lines in Callout Shapes (SB-077-A-1 logo in son)", async () => {
  const zip = new JSZip();

  // Slide XML mimicking Slide 14 layout:
  // Title shape + Sub-header shape + Defect note shape with SB-077-A-1 and Vietnamese instruction
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>Cutting Inspection Strategy</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="22225" y="548640"/><a:ext cx="3559175" cy="337820"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>IPQC Cutting Inspection Focuses</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="3094519" y="562703"/><a:ext cx="4677881" cy="579120"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="1600"><a:srgbClr val="0070C0"/></a:rPr><a:t>SB-077-A-1</a:t></a:r></a:p>
          <a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="1600"><a:srgbClr val="0070C0"/></a:rPr><a:t>Chất lượng logo in sơn khi kiểm tra cần chú ý</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlideXml, "Slide 1 XML must exist");

  // Verify that SB-077-A-1 is preserved
  assert.ok(outSlideXml.includes("SB-077-A-1"), "Model code SB-077-A-1 must be preserved");

  // Verify that the second line was NOT dropped and was translated to English
  assert.ok(!outSlideXml.includes("Chất lượng logo in sơn"), "Vietnamese text must not leak into English slide");
  assert.ok(!outSlideXml.includes("cần chú ý"), "Vietnamese text must not leak into English slide");
  assert.ok(
    outSlideXml.includes("Screen-printed logo quality requires attention during inspection") ||
    outSlideXml.includes("logo quality") ||
    outSlideXml.includes("inspection"),
    "Second line must be translated to English and present in output XML"
  );

  // Verify bold attribute b="1" is preserved
  assert.ok(outSlideXml.includes('b="1"'), "Bold formatting must be preserved on both lines");
});

test("PPTX Translator - Compound Word Guard: Tip-quarter sentence is never truncated to 'Tip'", async () => {
  const { splitBilingualText } = await import("../services/documents/pptx-translator.ts");
  
  // 1. Unit test splitBilingualText:
  // Hyphen split MUST return null outside Inspection Item
  assert.strictEqual(splitBilingualText("Tip-quarter bị nhạt màu và trắng các lỗ trang trí", false), null);
  assert.strictEqual(splitBilingualText("Bond gap upper to bottom-Hở keo đế với mặt giày", false), null);

  // Hyphen split MUST succeed on Inspection Item column
  const inspSplit1 = splitBilingualText("Bond gap upper to bottom-Hở keo đế với mặt giày", true);
  assert.deepStrictEqual(inspSplit1, { en: "Bond gap upper to bottom", vi: "Hở keo đế với mặt giày" });

  const inspSplit2 = splitBilingualText("Rocking-Độ ổn định", true);
  assert.deepStrictEqual(inspSplit2, { en: "Rocking", vi: "Độ ổn định" });

  const inspSplit3 = splitBilingualText("Toe cap shape-Hình dạng mũi", true);
  assert.deepStrictEqual(inspSplit3, { en: "Toe cap shape", vi: "Hình dạng mũi" });

  // 2. Integration test in replace_en mode: Full translation must be present, never just 'Tip'
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="3240" y="7440"/><a:ext cx="4157" cy="300"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>Tip-quarter bị nhạt màu và trắng các lỗ trang trí</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlideXml, "Slide 1 XML must exist");

  // Output must NOT be truncated to bare "Tip"
  assert.ok(!outSlideXml.includes("<a:t>Tip</a:t>"), "Must NOT be truncated to bare 'Tip'");
  // Output must contain full translated text
  assert.ok(
    outSlideXml.includes("Tip-quarter color fading and whitening at perforation holes") ||
    outSlideXml.includes("Tip-quarter color fading and whitening at deco holes") ||
    outSlideXml.includes("perforation holes") ||
    outSlideXml.includes("deco holes"),
    "Must translate full sentence including whitening at perforation holes / deco holes"
  );
  // Zero Vietnamese leakage
  assert.ok(!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(outSlideXml), "Zero Vietnamese leakage");
});

test("PPTX Translator - Sub-process Headings: * Ép lạnh: thời gian 15\" is never dropped between steps", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="100000" y="100000"/><a:ext cx="5000000" cy="4000000"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>2.Kiểm tra máy được điều chỉnh nhiệt độ /thời gian/ lực ép máy nosew đúng PFC :</a:t></a:r></a:p>
          <a:p><a:r><a:t>*Ép nóng : Nhiệt độ trên :165℃+-3 , dưới 140℃+-3,Thời gian : 30”, lực ép 70-75kg/cm2</a:t></a:r></a:p>
          <a:p><a:r><a:t>* Ép lạnh: thời gian 15”</a:t></a:r></a:p>
          <a:p><a:r><a:t>3.Kiểm tra Tip-quarter trước khi ép nosew logo in sơn có rõ nét, không lem sơn, tróc sơn.</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outSlideXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlideXml, "Slide 1 XML must exist");

  // Verify that cold press with 15 is preserved!
  assert.ok(
    outSlideXml.includes("15") && (outSlideXml.includes("Cold press") || outSlideXml.includes("cold") || outSlideXml.includes("cool")),
    "Cold press specification with 15\" must be preserved in translated output"
  );

  // Verify all 4 paragraphs are preserved (step 2, hot press, cold press, step 3)
  const ps = outSlideXml.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
  assert.ok(ps.length >= 4, `Expected at least 4 paragraphs, got ${ps.length}`);
});

test("Defect Card Table Cell - Prevents duplication of bilingual defect titles with trailing date and model code", async () => {
  const zip = new JSZip();

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <a:tbl>
        <a:tr>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1200"/><a:t>Color migration</a:t></a:r></a:p>
              <a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1200"/><a:t>Đổi màu/Ẩn màu</a:t></a:r></a:p>
              <a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1200"/><a:t>SB-077-C-1</a:t></a:r></a:p>
              <a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1200"/><a:t>22/9/2026</a:t></a:r></a:p>
            </a:txBody>
          </a:tc>
        </a:tr>
      </a:tbl>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);

  const buf = await zip.generateAsync({ type: "nodebuffer" });

  // Test 1: ipqc_bilingual mode
  const bilingualRes = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  const outZipBi = await JSZip.loadAsync(bilingualRes.translatedBuffer);
  const outSlideXmlBi = await outZipBi.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlideXmlBi, "Slide 1 XML must exist");

  const textsBi = [...outSlideXmlBi.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
  // Must preserve exact 4 items without duplicating or generating synthetic translations
  assert.deepStrictEqual(textsBi, [
    "Color migration",
    "Đổi màu/Ẩn màu",
    "SB-077-C-1",
    "22/9/2026",
  ]);

  // Test 2: replace_en mode
  const replaceEnRes = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZipEn = await JSZip.loadAsync(replaceEnRes.translatedBuffer);
  const outSlideXmlEn = await outZipEn.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outSlideXmlEn, "Slide 1 XML must exist");

  const textsEn = [...outSlideXmlEn.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
  // Must preserve English defect and metadata, with zero Vietnamese leakage
  assert.deepStrictEqual(textsEn, [
    "Color migration",
    "SB-077-C-1",
    "22/9/2026",
  ]);
});







