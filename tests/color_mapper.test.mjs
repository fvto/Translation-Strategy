import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeParagraphColors,
  mapAndBuildParagraphRuns,
  registerPreservedColor,
  isPreservedColor
} from "../services/translation/color-mapper.ts";

test("Color Mapper: Slide 14 Mixed Header preserves Black Prefix and Red Suffix", () => {
  const s14Xml = `<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US" altLang="zh-TW" sz="1600" b="1"><a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:ea typeface="Arial Unicode MS" panose="020B0604020202020204" pitchFamily="34" charset="-120"/></a:rPr><a:t>IPQC </a:t></a:r><a:r><a:rPr lang="en-US" altLang="zh-TW" sz="1600" b="1" smtClean="0"><a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:ea typeface="Arial Unicode MS" panose="020B0604020202020204" pitchFamily="34" charset="-120"/></a:rPr><a:t>Cutting Inspection </a:t></a:r><a:r><a:rPr lang="en-US" altLang="zh-TW" sz="1600" b="1" dirty="0"><a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:ea typeface="Arial Unicode MS" panose="020B0604020202020204" pitchFamily="34" charset="-120"/></a:rPr><a:t>Focuses: </a:t></a:r><a:r><a:rPr lang="en-US" altLang="zh-TW" sz="1600" b="1" dirty="0"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:ea typeface="Arial Unicode MS" panose="020B0604020202020204" pitchFamily="34" charset="-120"/><a:sym typeface="+mn-ea"/></a:rPr><a:t>Trọng điểm kiểm tra ép nosew mặt giày</a:t></a:r></a:p>`;

  const analysis = analyzeParagraphColors(s14Xml);
  assert.equal(analysis.hasPreservedColor, true);
  assert.equal(analysis.isAllPreservedColor, false);
  assert.equal(analysis.hasPrefixSuffixSplit, true);
  assert.equal(analysis.splitType, "NORMAL_PREFIX_RED_SUFFIX");

  const targetText = "IPQC Cutting Inspection Focuses: No-sew upper pressing inspection focuses";
  const runsXml = mapAndBuildParagraphRuns(s14Xml, targetText);
  assert.ok(runsXml);

  const runs = Array.from(runsXml.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)).map((m) => m[0]);
  assert.equal(runs.length, 2, "Must produce exactly 2 runs: Black prefix + Red suffix");

  // Run 1: Prefix
  assert.ok(!runs[0].includes("FF0000"), "Prefix run must NOT be colored red");
  assert.ok(runs[0].includes("IPQC Cutting Inspection Focuses:"));

  // Run 2: Suffix
  assert.ok(runs[1].includes("FF0000"), "Suffix run MUST retain RED solidFill FF0000");
  assert.ok(runs[1].includes("No-sew upper pressing inspection focuses"));
});

test("Color Mapper: Entirely Red Paragraph preserves RED solidFill on entire translation", () => {
  const redPXml = `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1600" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:sym typeface="+mn-ea"/></a:rPr><a:t>Trọng điểm kiểm tra :Khoảng cách các bộ vị đối xứng đồng nhất</a:t></a:r></a:p>`;

  const analysis = analyzeParagraphColors(redPXml);
  assert.equal(analysis.hasPreservedColor, true);
  assert.equal(analysis.isAllPreservedColor, true);

  const targetText = "Inspection Focuses: Symmetrical and uniform distance between components";
  const runsXml = mapAndBuildParagraphRuns(redPXml, targetText);
  assert.ok(runsXml);
  assert.ok(runsXml.includes("FF0000"), "Entire translated text must preserve RED solidFill");
  assert.ok(runsXml.includes(targetText));
});

test("Color Mapper: Non-red Paragraph returns null allowing default flow", () => {
  const blackPXml = `<a:p><a:r><a:rPr sz="1200"><a:latin typeface="Calibri"/></a:rPr><a:t>Check stitch margin</a:t></a:r></a:p>`;
  const runsXml = mapAndBuildParagraphRuns(blackPXml, "Check stitch margin");
  assert.equal(runsXml, null, "Paragraph without preserved color should return null");
});

test("Color Mapper: Extensibility test - Adding future colors", () => {
  registerPreservedColor({
    id: "blue",
    name: "Blue Highlight",
    enabled: true,
    matches: (hex) => hex === "#0070C0",
    defaultSolidFill: '<a:solidFill><a:srgbClr val="0070C0"/></a:solidFill>'
  });

  const check = isPreservedColor("#0070C0");
  assert.equal(check.isPreserved, true);
  assert.equal(check.ruleId, "blue");
});
