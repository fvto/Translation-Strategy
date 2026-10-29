import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { normalizeSpiTerminology } from "../services/translation/casing.ts";
import { auditAndRepairPptxPostFlight } from "../services/qa/pptx-postflight-gate.ts";
import { duplicateIsqSlides } from "../services/documents/pptx-slide-order.ts";

test("Fix 1: Star heading bold restoration generates valid XML on self-closing a:rPr", async () => {
  const zip = new JSZip();
  // Self-closing a:rPr tag
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr lang="en-US"/><a:t>*Hot/cool shaping:</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml.includes('b="1"'), "Must inject bold formatting");
  assert.ok(!outXml.includes('lang="en-US"/'), "Must NOT contain malformed trailing slash inside attributes");
  assert.ok(/<a:rPr\s+lang="en-US"\s+b="1"\/>/.test(outXml) || /<a:rPr\s+b="1"\s+lang="en-US"\/>/.test(outXml), `Must be clean valid self-closing a:rPr tag. Got: ${outXml}`);
});

test("Fix 2: Canned Tip-quarter tolerance does NOT overwrite other footwear components", async () => {
  const zip = new JSZip();
  // A slide describing Heel Counter quality criteria with 'flat does not accept'
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Heel counter flat does not accept deformation or wrinkles</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(!outXml.includes("Due to the uneven surface design of the Tip-quarter"), "Heel counter MUST NOT be overwritten with Tip-quarter text!");
  assert.ok(outXml.includes("Heel counter"), "Original component Heel counter must be preserved");
  assert.ok(outXml.includes("does not accept deformation or wrinkles"), "A rejection criterion must never become an acceptance criterion");
});

test("Fix 3: Vietnamese backstitching count is NOT converted to SPI and original VI slides are untouched", async () => {
  // Test 3a: casing.ts SPI normalization
  const backstitch1 = normalizeSpiTerminology("Lùi mũi 2-3 mũi ở đầu đường may");
  assert.equal(backstitch1, "Lùi mũi 2-3 mũi ở đầu đường may", "Backstitch 'Lùi mũi 2-3 mũi' must not become SPI!");

  const backstitch2 = normalizeSpiTerminology("Khóa mũi 2-3 mũi");
  assert.equal(backstitch2, "Khóa mũi 2-3 mũi", "Backstitch 'Khóa mũi 2-3 mũi' must not become SPI!");

  const realSpi = normalizeSpiTerminology("Mật độ chỉ may 9-10 mũi/inch");
  assert.equal(realSpi, "Mật độ chỉ may SPI 9-10 stitches/inch", "Real stitch density MUST be normalized to standard SPI format");

  // Test 3b: PostFlightGate does not alter original VI slide in ISQ pairs
  const zip = new JSZip();
  const enSlideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Check upper 9-10 SPI</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  const viSlideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Lùi mũi 2-3 mũi cố định</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", enSlideXml);
  zip.file("ppt/slides/slide2.xml", viSlideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`);
  zip.file("customXml/smart-audit-isq-pairs.xml", `<?xml version="1.0" encoding="UTF-8"?><pairs xmlns="urn:smart-audit:isq-pairs"><pair en="ppt/slides/slide1.xml" vi="ppt/slides/slide2.xml"/></pairs>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outViXml = await auditedZip.file("ppt/slides/slide2.xml")?.async("string");

  assert.equal(outViXml, viSlideXml, "Original Vietnamese reference slide must remain 100% untouched byte-for-byte");
});

test("Fix 4: Empty p:txBody is auto-repaired to retain at least one a:p", async () => {
  const zip = new JSZip();
  // Shape with empty txBody (violating OpenXML schema)
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml.includes("<a:p"), "Empty txBody MUST have at least one a:p inserted to comply with OpenXML schema");
});

test("Fix 5: ISQ duplication strips notesSlide relationship and parses arbitrary attribute order", async () => {
  const zip = new JSZip();
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide 1 Content</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  // slide1 rels references both slideLayout AND notesSlide
  const slide1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  zip.file("ppt/slides/_rels/slide1.xml.rels", slide1Rels);
  // presentation.xml has r:id BEFORE id
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId r:id="rId1" id="256"/></p:sldIdLst>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  const pairs = await duplicateIsqSlides(zip, new Set(["ppt/slides/slide1.xml"]));
  assert.equal(pairs.length, 1, "Must successfully duplicate slide even when r:id is before id in presentation.xml");

  const clonedRelPath = pairs[0].vi.replace("slides/", "slides/_rels/") + ".rels";
  const clonedRelsXml = await zip.file(clonedRelPath)?.async("string");

  assert.ok(clonedRelsXml, "Cloned slide must have .rels file");
  assert.ok(clonedRelsXml.includes("slideLayout"), "Cloned slide rels must retain slideLayout");
  assert.ok(!clonedRelsXml.includes("notesSlide"), "Cloned slide rels MUST NOT reference notesSlide to prevent 1-to-many relationship collision in PowerPoint!");
});

test("Fix 6: PostFlightGate avoids double-escaped &amp;amp; and cleanly joins split runs", async () => {
  const zip = new JSZip();
  // Paragraph with split runs ("Kiể" + "m") and ampersand
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Kiể</a:t></a:r><a:r><a:t>m tra keo &amp; ép nhiệt</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(!outXml.includes("&amp;amp;"), "Must NEVER produce double-escaped &amp;amp;");
  assert.ok(!outXml.includes("Kiể m"), "Must not split Vietnamese word across runs with artificial space");
});

test("Fix 8: replaceParagraphsInXml preserves designer wrap='none' settings", async () => {
  const { pptxTranslatorService } = await import("../services/documents/pptx-translator.ts");
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="200" cy="50"/></a:xfrm></p:spPr>
      <p:txBody>
        <a:bodyPr wrap="none"/>
        <a:p><a:r><a:t>Status Badge</a:t></a:r></p:a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.rebuildWithTranslations(buf, [{
    slideIndex: 1,
    slideFileName: "ppt/slides/slide1.xml",
    paragraphs: [{
      id: "s1_p0",
      paragraphIndex: 0,
      originalText: "Status Badge",
      translatedText: "Trạng thái",
      isTitle: false,
      shapeId: "sp_1",
      containerId: "tx_1",
      shapeIndex: 0,
    }],
  }], "ipqc_bilingual", "test.pptx");

  const rebuiltZip = await JSZip.loadAsync(result);
  const outXml = await rebuiltZip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(outXml.includes('wrap="none"'), "Must preserve designer wrap='none' without force-converting to square");
});

test("Fix 14 & 16: pptxSessionStore rejects path traversal IDs", async () => {
  const { pptxSessionStore } = await import("../services/documents/pptx-session-store.ts");
  assert.equal(pptxSessionStore.get("../../database"), null, "Must reject relative directory path traversal");
  assert.equal(pptxSessionStore.get("..\\..\\secret"), null, "Must reject backslash directory traversal");
  assert.equal(pptxSessionStore.get("/etc/passwd"), null, "Must reject absolute path traversal");
});

