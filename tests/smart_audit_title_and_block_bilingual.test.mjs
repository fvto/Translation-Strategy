import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { scanPptxTranslationIntelligence } from "../services/translation/pptx-smart-audit.ts";

test("Smart Audit Fix: Table row 0 headers ('Building') are NOT marked as slide titles", async () => {
  const zip = new JSZip();

  // Basic presentation.xml
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:sldSz cx="9144000" cy="6858000"/>
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      </p:sldIdLst>
    </p:presentation>`
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
    </Relationships>`
  );

  // Slide 1 has a top banner shape ("Assembly Inspection Strategy") and a table with row 0 cell ("Building")
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:cSld>
      <p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr/>
        <!-- Top banner title shape without p:ph -->
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="2" name="Text Box 3"/>
            <p:cNvSpPr txBox="1"/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="500000" y="300000"/><a:ext cx="7000000" cy="500000"/></a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>Assembly Inspection Strategy</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>

        <!-- Table with row 0 header cell 'Building' -->
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="3" name="Table 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
          <p:xfrm><a:off x="500000" y="1200000"/><a:ext cx="8000000" cy="4000000"/></p:xfrm>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
              <a:tbl>
                <a:tblPr/>
                <a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="6000000"/></a:tblGrid>
                <a:tr h="500000">
                  <a:tc>
                    <a:txBody><a:bodyPr/><a:p><a:r><a:t>Building</a:t></a:r></a:p></a:txBody>
                  </a:tc>
                  <a:tc>
                    <a:txBody><a:bodyPr/><a:p><a:r><a:t>Inspection Focuses</a:t></a:r></a:p></a:txBody>
                  </a:tc>
                </a:tr>
                <a:tr h="1000000">
                  <a:tc>
                    <a:txBody><a:bodyPr/><a:p><a:r><a:t>B2</a:t></a:r></a:p></a:txBody>
                  </a:tc>
                  <a:tc>
                    <a:txBody>
                      <a:bodyPr/>
                      <a:p><a:r><a:t>1. Lasting: Ensure toe shape is correct</a:t></a:r></a:p>
                      <a:p><a:r><a:t>1. Vỏ phom: Đảm bảo hình dạng mũi chuẩn</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>
      </p:spTree>
    </p:cSld>
  </p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test_deck.pptx");
  const units = report.units;

  // 1. Verify title unit
  const titleUnit = units.find((u) => u.sourceText.includes("Assembly Inspection Strategy"));
  assert.ok(titleUnit, "Should find the banner title unit");
  assert.equal(titleUnit.location.isTitle, true, "Banner shape must be recognized as isTitle: true");
  assert.equal(titleUnit.location.isTable, false, "Banner shape must NOT be a table");

  // 2. Verify table row 0 cell 'Building'
  const buildingUnit = units.find((u) => u.sourceText === "Building");
  assert.ok(buildingUnit, "Should find 'Building' unit");
  assert.equal(buildingUnit.location.isTitle, false, "Table header 'Building' must NOT be marked isTitle");
  assert.equal(buildingUnit.location.isTable, true, "Table header 'Building' must be marked isTable: true");

  // 3. Verify total slides
  assert.notEqual(report.totalSlides, 0);
});

test("Smart Audit Fix: Bilingual multi-paragraph container formats as ALL EN on top, ALL VI below", async () => {
  const zip = new JSZip();

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:sldSz cx="9144000" cy="6858000"/>
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      </p:sldIdLst>
    </p:presentation>`
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
    </Relationships>`
  );

  // A container with 2 Vietnamese instruction paragraphs
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:cSld>
      <p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Box 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="5000000" cy="2000000"/></a:xfrm></p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>1. Vỏ phom: Kiểm tra độ khớp</a:t></a:r></a:p>
            <a:p><a:r><a:t>2. Gò mũi: Đảm bảo đều 2 bên</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree>
    </p:cSld>
  </p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const paragraphs = [
    {
      id: "s1_p0",
      slideIndex: 1,
      shapeIndex: 0,
      paragraphIndex: 0,
      originalText: "1. Vỏ phom: Kiểm tra độ khớp",
      translatedText: "1. Lasting: Check fit accuracy",
      isTitle: false,
    },
    {
      id: "s1_p1",
      slideIndex: 1,
      shapeIndex: 0,
      paragraphIndex: 1,
      originalText: "2. Gò mũi: Đảm bảo đều 2 bên",
      translatedText: "2. Tip lasting: Ensure symmetry on both sides",
      isTitle: false,
    },
  ];

  // Invoke replaceParagraphsInXml via internal call with ipqc_bilingual mode
  const modifiedIds = new Set(["s1_p0", "s1_p1"]);
  const resultXml = pptxTranslatorService.replaceParagraphsInXml(
    slideXml,
    paragraphs,
    "ipqc_bilingual",
    modifiedIds
  );

  // Extract all text inside <a:p> elements in order
  const pMatches = Array.from(resultXml.matchAll(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g));
  const emittedTexts = pMatches.map((m) => {
    const tMatches = Array.from(m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g));
    return tMatches.map((t) => t[1]).join("");
  }).filter(Boolean);

  // Must have 4 paragraphs in exact block bilingual order:
  // 1. Lasting: Check fit accuracy (EN)
  // 2. Tip lasting: Ensure symmetry on both sides (EN)
  // 1. Vỏ phom: Kiểm tra độ khớp (VI)
  // 2. Gò mũi: Đảm bảo đều 2 bên (VI)
  assert.equal(emittedTexts.length, 4, `Expected 4 paragraphs but got ${emittedTexts.length}: ${JSON.stringify(emittedTexts)}`);
  assert.equal(emittedTexts[0], "1. Lasting: Check fit accuracy");
  assert.equal(emittedTexts[1], "2. Tip lasting: Ensure symmetry on both sides");
  assert.equal(emittedTexts[2], "1. Vỏ phom: Kiểm tra độ khớp");
  assert.equal(emittedTexts[3], "2. Gò mũi: Đảm bảo đều 2 bên");

  // NEVER line-by-line interleaved (1.EN, 1.VI, 2.EN, 2.VI)
  assert.notEqual(emittedTexts[1], "1. Vỏ phom: Kiểm tra độ khớp", "Must not interleave line by line!");
});

test("Parallel Block Translation: Incomplete English placeholder '1.' is replaced with translated Vietnamese item", async () => {
  // Slide 10 Cell 10 case: source document has '1.', '2.Last dots hidden from view', '1.Do may ô dê méo', '2.Vô phom méo'
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:cSld>
      <p:spTree>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Cell 10"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr/>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>1.</a:t></a:r></a:p>
            <a:p><a:r><a:t>2.Last dots hidden from view</a:t></a:r></a:p>
            <a:p><a:r><a:t>1.Do may ô dê méo</a:t></a:r></a:p>
            <a:p><a:r><a:t>2.Vô phom méo</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree>
    </p:cSld>
  </p:sld>`;

  const paragraphs = [
    {
      id: "s10_p0",
      slideIndex: 10,
      shapeIndex: 0,
      paragraphIndex: 0,
      originalText: "1.",
      translatedText: "1.",
      isTitle: false,
    },
    {
      id: "s10_p1",
      slideIndex: 10,
      shapeIndex: 0,
      paragraphIndex: 1,
      originalText: "2.Last dots hidden from view",
      translatedText: "2.Last dots hidden from view",
      isTitle: false,
    },
    {
      id: "s10_p2",
      slideIndex: 10,
      shapeIndex: 0,
      paragraphIndex: 2,
      originalText: "1.Do may ô dê méo",
      translatedText: "1. Caused by crooked eyestay stitching",
      isTitle: false,
    },
    {
      id: "s10_p3",
      slideIndex: 10,
      shapeIndex: 0,
      paragraphIndex: 3,
      originalText: "2.Vô phom méo",
      translatedText: "2. Crooked lasting",
      isTitle: false,
    },
  ];

  // Full-deck repair may fill placeholders. Selective translation separately preserves every unselected paragraph.
  const resultXml = pptxTranslatorService.replaceParagraphsInXml(
    slideXml,
    paragraphs,
    "ipqc_bilingual"
  );

  const pMatches = Array.from(resultXml.matchAll(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g));
  const emittedTexts = pMatches.map((m) => {
    const tMatches = Array.from(m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g));
    return tMatches.map((t) => t[1]).join("");
  }).filter(Boolean);

  // In ipqc_bilingual mode:
  // Item 1 in English must NOT be left as bare "1."!
  // It must contain the translated text of item 1!
  assert.equal(emittedTexts.length, 4);
  assert.match(emittedTexts[0], /eyestay|crooked|distorted/i, "Item 1 English must be translated, not bare '1.'!");
  assert.equal(emittedTexts[1], "2.Last dots hidden from view");
  assert.equal(emittedTexts[2], "1.Do may ô dê méo");
  assert.equal(emittedTexts[3], "2.Vô phom méo");
});

test("Smart Audit & Translation: Slide top banner is not paired with body heading and preserved on VI reference slide", async () => {
  const zip = new JSZip();

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:sldSz cx="9144000" cy="6858000"/>
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      </p:sldIdLst>
    </p:presentation>`
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
    </Relationships>`
  );

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:cSld>
      <p:spTree>
        <!-- Top banner: HFW/Nosew Inspection Strategy -->
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="500000" y="200000"/><a:ext cx="8000000" cy="600000"/></a:xfrm></p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>HFW/Nosew Inspection Strategy</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
        <!-- Subtitle in body: IPQC Cutting Inspection Focuses: Trọng điểm kiểm tra ép H/F mặt giày -->
        <p:sp>
          <p:nvSpPr><p:cNvPr id="3" name="Subtitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="500000" y="1500000"/><a:ext cx="8000000" cy="600000"/></a:xfrm></p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>IPQC Cutting Inspection Focuses: Trọng điểm kiểm tra ép H/F mặt giày</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree>
    </p:cSld>
  </p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const report = await scanPptxTranslationIntelligence(buffer, "test.pptx", { sourceLang: "vi", targetLang: "en" });

  // Top banner unit must NOT be paired with the body subtitle
  const titleUnit = report.units.find((u) => u.sourceText === "HFW/Nosew Inspection Strategy");
  assert.ok(titleUnit, "Title unit should exist");
  assert.equal(titleUnit.existingTranslation, undefined, "Title must NOT have false paired translation with body heading!");
});
