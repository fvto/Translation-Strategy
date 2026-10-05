import test from "node:test";
import assert from "node:assert";
import JSZip from "jszip";
import { db } from "../services/database/db.ts";
import { enforceTerminologyCompliance } from "../services/terminology/enforcer.ts";
import { auditAndRepairPptxPostFlight } from "../services/qa/pptx-postflight-gate.ts";
import { pptxTranslatorService } from "../services/documents/pptx-translator.ts";
import { AirGappedTranslationProvider } from "../services/translation/offline.ts";

test("Glossary Polysemy - Supports multiple valid Vietnamese meanings for the same source term", () => {
  // Test adding polysemous entries
  const source = `Polysemy_Test_${Date.now()}`;
  const meaning1 = "ý nghĩa thứ nhất";
  const meaning2 = "ý nghĩa thứ hai";

  let res1 = [];
  let res2 = [];

  try {
    res1 = db.addTerminology([
      {
        sourceTerm: source,
        targetTerm: meaning1,
        sourceLanguage: "en",
        targetLanguage: "vi",
        status: "approved",
        priority: 1,
        confidence: 1.0,
        createdBy: "test@local",
        version: "v1.0",
      },
    ]);
    assert.equal(res1.length, 1);

    // Adding second meaning MUST NOT overwrite meaning1
    res2 = db.addTerminology([
      {
        sourceTerm: source,
        targetTerm: meaning2,
        sourceLanguage: "en",
        targetLanguage: "vi",
        status: "approved",
        priority: 1,
        confidence: 1.0,
        createdBy: "test@local",
        version: "v1.0",
      },
    ]);
    assert.equal(res2.length, 1);
    assert.notEqual(res1[0].id, res2[0].id, "Polysemous entries must have separate IDs");

    // Verify getTerminology returns both entries
    const terms = db.getTerminology({ search: source });
    assert.equal(terms.length, 2, "Both polysemous entries must exist in database");
    const targetTerms = terms.map((t) => t.targetTerm);
    assert.ok(targetTerms.includes(meaning1));
    assert.ok(targetTerms.includes(meaning2));

    // Verify getApprovedTerminology returns both entries
    const approved = db.getApprovedTerminology("en", "vi");
    const approvedTargets = approved
      .filter((t) => t.sourceTerm.toLowerCase() === source.toLowerCase())
      .map((t) => t.targetTerm);
    assert.ok(approvedTargets.includes(meaning1), "Approved terms must include meaning1");
    assert.ok(approvedTargets.includes(meaning2), "Approved terms must include meaning2");
  } finally {
    // Guaranteed cleanup: test terms are always purged
    if (res1[0]?.id) db.deleteTerm(res1[0].id);
    if (res2[0]?.id) db.deleteTerm(res2[0].id);
  }
});

test("Glossary Polysemy - Color migration has both 'ẩn màu' and 'đổi màu' in approved glossary", () => {
  const approved = db.getApprovedTerminology("en", "vi");
  const cmEntries = approved.filter(
    (t) => t.sourceTerm.toLowerCase().trim() === "color migration"
  );
  const targets = cmEntries.map((t) => t.targetTerm.toLowerCase().trim());

  assert.ok(targets.includes("ẩn màu"), "Color migration must have target 'ẩn màu'");
  assert.ok(targets.includes("đổi màu"), "Color migration must have target 'đổi màu'");
});

test("QA Tolerance - Tip quarter uneven surface sentence translates with 'quality standard are acceptable' and NO 'flat does not accept'", async () => {
  const sourceText =
    "Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn, chảy sơn nền sau khi nosew như hình QA manual cập nhật";

  const provider = new AirGappedTranslationProvider();
  const approvedGlossary = db.getApprovedTerminology("vi", "en");
  const res = await provider.translate({
    sourceText,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approvedGlossary,
  });

  const translation = res.translatedText;
  assert.ok(!translation.includes("flat does not accept"), "Must NEVER translate as 'flat does not accept'");
  assert.ok(!translation.includes("does not accept the quality standard"), "Must NEVER invert into rejection");
  assert.ok(
    translation.includes("quality standard are acceptable"),
    `Must express 'quality standard are acceptable'. Got: ${translation}`
  );
  assert.ok(
    !translation.includes("tolerances"),
    `Must NOT contain tolerances per user directive. Got: ${translation}`
  );
  assert.ok(
    /uneven|non-flat/i.test(translation),
    `Must accurately translate 'không bằng phẳng' as uneven/non-flat. Got: ${translation}`
  );
  assert.ok(
    /base\s+paint\s+bleed/i.test(translation),
    `Must translate 'chảy sơn nền' as base paint bleeding. Got: ${translation}`
  );
});

test("QA Tolerance - PostFlightGate auto-repairs legacy 'flat does not accept' in PPTX slide XML", async () => {
  const zip = new JSZip();
  const slideWithInvertedText = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr b="1"/><a:t>*For SB-077-A-1</a:t></a:r></a:p>
    <a:p><a:r><a:t>Due to the surface Tip quarter design, flat does not accept the quality standard swoosh paint printing level, it is not smooth, the base paint flows after nosew as shown in the updated QA manual.</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideWithInvertedText);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const auditResult = await auditAndRepairPptxPostFlight(buf, "replace_en");
  assert.ok(auditResult.repairedCount > 0, "PostFlightGate must auto-repair the inverted sentence");

  const auditedZip = await JSZip.loadAsync(auditResult.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(!outXml.includes("flat does not accept"), "Out XML must not contain 'flat does not accept'");
  assert.ok(outXml.includes("quality standard are acceptable"), "Out XML must contain 'quality standard are acceptable'");
  assert.ok(!outXml.includes("tolerances"), "Out XML must not contain 'tolerances'");
  assert.ok(outXml.includes("Due to the uneven surface design of the Tip quarter"), "Out XML must describe uneven surface");
});

test("QA Tolerance - Full PPTX translation of model note SB-077-A-1 preserves quality standard are acceptable and uppercase code", async () => {
  const zip = new JSZip();
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr b="1"/><a:t>*Đối với SB-077-A-1</a:t></a:r></a:p>
    <a:p><a:r><a:t>Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn, chảy sơn nền sau khi nosew như hình QA manual cập nhật</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const result = await pptxTranslatorService.translate(buf, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "replace_en",
  });

  const outZip = await JSZip.loadAsync(result.translatedBuffer);
  const outXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(outXml.includes("SB-077-A-1"), "Model code SB-077-A-1 must remain uppercase");
  assert.ok(!outXml.includes("flat does not accept"), "Must not contain 'flat does not accept'");
  assert.ok(outXml.includes("quality standard are acceptable"), "Must contain 'quality standard are acceptable'");
  assert.ok(!outXml.includes("tolerances"), "Must not contain 'tolerances'");
});
