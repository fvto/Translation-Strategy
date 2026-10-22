import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { cleanTargetTerm, formatUppercaseStructure, normalizeFootwearHyphenation } from "../services/translation/casing.ts";
import { AirGappedTranslationProvider } from "../services/translation/offline.ts";
import { sanitizeTerminologyEntry } from "../services/terminology/sanitizer.ts";
import { replaceParagraphTranslation } from "../services/documents/pptx-text.ts";
import { polishSopText } from "../services/translation/sop-polisher.ts";
import { isSemanticBilingualPair } from "../services/translation/vietnamese-detector.ts";
import { auditAndRepairPptxPostFlight } from "../services/qa/pptx-postflight-gate.ts";

test("Backend Fix 1: cleanTargetTerm preserves 'stitches/inch' and does not truncate", () => {
  const spi = cleanTargetTerm("SPI 10-12 stitches/inch");
  assert.equal(spi, "SPI 10-12 stitches/inch", "Must preserve '/inch' and not truncate at slash");

  const singleSpi = cleanTargetTerm("stitches/inch");
  assert.equal(singleSpi, "stitches/inch", "Single unit with slash must be preserved intact");

  const slashedOptions = cleanTargetTerm("flashing/edge/material edge");
  assert.equal(slashedOptions, "material edge", "Regular dictionary multi-choice options still pick compound variant");
});

test("Backend Fix 2: normalizeFootwearHyphenation strictly adheres to Rule 3", () => {
  assert.equal(normalizeFootwearHyphenation("Check Nosew on upper"), "Check No-sew on upper");
  assert.equal(normalizeFootwearHyphenation("conduct nosew pressing"), "conduct no-sew pressing");
  assert.equal(normalizeFootwearHyphenation("NOSEW MACHINE"), "NO-SEW MACHINE");

  assert.equal(normalizeFootwearHyphenation("Check Tip quarter"), "Check Tip-quarter");
  assert.equal(normalizeFootwearHyphenation("tip quarter edge"), "tip-quarter edge");
  assert.equal(normalizeFootwearHyphenation("Inspect Tipquarter"), "Inspect Tip-quarter");
  assert.equal(normalizeFootwearHyphenation("tipquarter delamination"), "tip-quarter delamination");
});

test("Backend Fix 3: formatUppercaseStructure auto-enforces footwear hyphenation", () => {
  const input = "1. check nosew delamination on tip quarter. 2. maintain 9-10 SPI";
  const output = formatUppercaseStructure(input);
  assert.ok(output.includes("No-sew") || output.includes("no-sew"), "Must convert nosew to no-sew");
  assert.ok(!output.includes("nosew"), "Must not contain raw unhyphenated nosew");
  assert.ok(output.includes("Tip-quarter") || output.includes("tip-quarter"), "Must convert tip quarter to hyphenated form");
  assert.ok(output.includes("SPI 9-10 stitches/inch"), "Must normalize SPI to standard form");
});

test("Backend Fix 4: Offline AirGapped provider enforces No-sew with hyphen (never Nosew)", async () => {
  const provider = new AirGappedTranslationProvider();
  const res = await provider.translate({
    sourceText: "Ép nosew mặt trước",
    sourceLanguage: "vi",
    targetLanguage: "en",
  });
  assert.ok(res.translatedText.includes("No-sew") || res.translatedText.includes("no-sew"), `Must use No-sew with hyphen. Got: ${res.translatedText}`);
  assert.ok(!/\bNosew\b/.test(res.translatedText), `Must NEVER output Nosew without hyphen. Got: ${res.translatedText}`);
});

test("Backend Fix 5: sanitizeTerminologyEntry auto-corrects unhyphenated nosew and tip quarter", () => {
  const term1 = { sourceTerm: "ép nosew", targetTerm: "nosew pressing" };
  const res1 = sanitizeTerminologyEntry(term1);
  assert.ok(res1.valid);
  assert.equal(res1.suggestedTarget, "no-sew pressing");

  const term2 = { sourceTerm: "biên tip quarter", targetTerm: "tip quarter edge" };
  const res2 = sanitizeTerminologyEntry(term2);
  assert.ok(res2.valid);
  assert.equal(res2.suggestedTarget, "tip-quarter edge");
});

test("Backend Fix 6: replaceParagraphTranslation preserves b='1' on star process headings", () => {
  // XML where the heading has mixed runs (e.g. '*' unbold, text bold) which previously triggered partialBold b="0"
  const xml = `<a:p><a:r><a:t>*</a:t></a:r><a:r><a:rPr b="1"/><a:t>Buffing:</a:t></a:r><a:r><a:t> </a:t></a:r></a:p>`;
  const target = "*Buffing:";
  const result = replaceParagraphTranslation(xml, target);
  assert.ok(result.includes('b="1"'), `Star technical process heading MUST preserve b="1". Got: ${result}`);
  assert.ok(!result.includes('b="0"'), `Must NOT strip bold on star process heading. Got: ${result}`);
});

test("Backend Fix 7: PostFlightGate auto-translates Vietnamese leak without truncating slashes or units", async () => {
  const zip = new JSZip();
  // Slide containing untranslated Vietnamese text that translates to an English sentence with slashes/units
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Kiểm tra thành phẩm mặt giày Tip quarter không hở keo nosew.</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/></p:sldIdLst></p:presentation>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const audit = await auditAndRepairPptxPostFlight(buf, "replace_en", "en");
  const auditedZip = await JSZip.loadAsync(audit.auditedBuffer);
  const outXml = await auditedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.ok(!outXml.includes("Kiểm tra"), "Untranslated Vietnamese must be auto-translated");
  assert.ok(outXml.includes("Tip-quarter") || outXml.includes("tip-quarter"), `Must enforce Tip-quarter hyphenation. Got: ${outXml}`);
  assert.ok(outXml.includes("no-sew") || outXml.includes("No-sew"), `Must enforce No-sew hyphenation. Got: ${outXml}`);
});

test("Backend Fix 8: polishSopText strictly uses 'Check if' or 'Check', NEVER 'Verify'", () => {
  assert.equal(
    polishSopText("1. Verify stitching collar lining to foam is even and smooth."),
    "1. Check if stitching collar lining to foam is even and smooth."
  );
  assert.equal(
    polishSopText("Verify Apply MEK to clean outsole."),
    "Check if MEK is applied to clean outsole."
  );
  assert.equal(
    polishSopText("Verify oven time and temperature follow PFC:"),
    "Check if oven time and temperature follow PFC:"
  );
  assert.equal(
    polishSopText("Verify temperature, time, and pressure according to PFC."),
    "Check temperature, time, and pressure according to PFC."
  );
  assert.ok(!polishSopText("Verify toe lasting operation").includes("Verify"));
});

test("Backend Fix 9: polishSopText eliminates duplicate 'inspection focuses' and corrupt 'f press vamp'", () => {
  const corruptInput = "IPQC Cutting Inspection Focuses: inspection focuses f press vamp/F upper";
  const fixed = polishSopText(corruptInput);
  assert.equal(fixed, "IPQC Cutting Inspection Focuses: H/F upper pressing");
  assert.ok(!fixed.includes("inspection focuses f"), "Must eliminate corrupt 'inspection focuses f'");
  assert.ok(!fixed.includes("f press"), "Must eliminate corrupt 'f press'");
  assert.ok(fixed.includes("H/F upper pressing"), "Must produce clean 'H/F upper pressing'");

  const duplicateFocus = "IPQC Cutting Inspection Focuses: inspection focuses No-sew upper pressing";
  assert.equal(
    polishSopText(duplicateFocus),
    "IPQC Cutting Inspection Focuses: No-sew upper pressing"
  );
});

test("Backend Fix 10: isSemanticBilingualPair rejects false cross-container matches between slide headers and body text", () => {
  const header = "Assembly Inspection Strategy";
  const body1 = "Kiểm tra thao tác quét :quét theo đường vẽ ,quét qua lại đều và đủ để đảm bảo làm sạch bề mặt liệu";
  const body2 = "Khoảng cách các bộ vị đối xứng đồng nhất";
  const body3 = "IPQC Cutting Inspection Focuses: Trọng điểm kiểm tra ép H/F mặt giày";

  assert.equal(isSemanticBilingualPair(body1, header, []).isPair, false);
  assert.equal(isSemanticBilingualPair(body2, header, []).isPair, false);
  assert.equal(isSemanticBilingualPair(body3, header, []).isPair, false);

  // But genuine pairs match
  const genuineVi = "Kiểm tra lực ép máy vẽ chỉ theo PFC";
  const genuineEn = "Check gauge marking pressure according to PFC";
  assert.equal(isSemanticBilingualPair(genuineVi, genuineEn, []).isPair, true);
});
