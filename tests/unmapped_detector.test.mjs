import test from "node:test";
import assert from "node:assert/strict";
import { detectUnmappedTerminology } from "../services/terminology/unmapped-detector.ts";

test("Unmapped Terminology Detector - Detects specialized terms and locations", () => {
  const dummySlides = [
    {
      slideIndex: 1,
      slideFileName: "ppt/slides/slide1.xml",
      title: "QUY TRÌNH SẢN XUẤT",
      paragraphs: [
        {
          id: "p1",
          slideIndex: 1,
          shapeIndex: 0,
          paragraphIndex: 0,
          originalText: "*Lăn keo đáy: lăn đều keo từ mũi đến gót",
          translatedText: "*Bottom roll cementing: apply cement evenly from toe to heel",
        },
        {
          id: "p2",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 0,
          isInspectionItem: true,
          originalText: "Độ sâu rãnh mài",
          translatedText: "Buffing groove depth",
        },
      ],
      notes: "Chú ý kiểm tra dập gân mũi giày trước khi chuyển sang trạm may.",
      translatedNotes: "Note to inspect toe rib debossing before moving to stitching station.",
    },
    {
      slideIndex: 2,
      slideFileName: "ppt/slides/slide2.xml",
      title: "TIÊU CHUẨN CTQ",
      paragraphs: [
        {
          id: "p3",
          slideIndex: 2,
          shapeIndex: 1,
          paragraphIndex: 0,
          originalText: "*Ép nóng: thời gian 15 giây, nhiệt độ 110°C",
          translatedText: "*Hot pressing: time 15 seconds, temperature 110°C",
        },
      ],
    },
  ];

  // Mock existing glossary that only contains "hở keo"
  const existingGlossary = [
    {
      id: "term_001",
      sourceTerm: "hở keo",
      targetTerm: "bond gap",
      status: "approved",
      sourceLanguage: "vi",
      targetLanguage: "en",
    },
  ];

  const unmapped = detectUnmappedTerminology(dummySlides, existingGlossary, "vi", "en");

  assert.ok(unmapped.length > 0, "Should detect unmapped specialized terms");

  // Verify Slide 1 Heading Detection
  const rollCementing = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("lăn keo đáy") || it.sourceTerm.toLowerCase().includes("lăn keo"));
  assert.ok(rollCementing, "Should detect 'lăn keo đáy' / 'lăn keo'");
  assert.equal(rollCementing.slideIndex, 1, "Should identify Slide 1");
  assert.ok(rollCementing.suggestedOptions.length >= 2, "Should provide at least 2 suggested options");
  assert.ok(rollCementing.suggestedOptions.some((opt) => opt.isRecommended), "Should have a recommended option");

  // Verify Inspection Item Detection
  const grooveItem = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("độ sâu rãnh mài") || it.sourceTerm.toLowerCase().includes("độ sâu rãnh"));
  assert.ok(grooveItem, "Should detect 'độ sâu rãnh mài'");
  assert.equal(grooveItem.slideIndex, 1, "Should be on Slide 1");
  assert.equal(grooveItem.section, "Hạng mục kiểm tra (Inspection Item)");

  // Verify Slide Notes Detection
  const notesItem = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("dập gân"));
  assert.ok(notesItem, "Should detect 'dập gân' from notes");
  assert.equal(notesItem.slideIndex, 1, "Should be on Slide 1");

  // Verify Slide 2 Heading Detection
  const hotPressing = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("ép nóng"));
  assert.ok(hotPressing, "Should detect 'ép nóng' on Slide 2");
  assert.equal(hotPressing.slideIndex, 2, "Should be on Slide 2");
  assert.equal(hotPressing.section, "Quy trình chính (Process Heading)");

  console.log(`[Test Success] Detected ${unmapped.length} unmapped terms with accurate slide numbers, sections, and domain suggestions.`);
});

test("Unmapped Terminology Detector - Strictly filters out English headings and EN->EN suggestions", () => {
  const mixedSlides = [
    {
      slideIndex: 4,
      slideFileName: "ppt/slides/slide4.xml",
      title: "TIÊU CHUẨN CÔNG ĐOẠN",
      paragraphs: [
        {
          id: "p1",
          slideIndex: 4,
          shapeIndex: 0,
          paragraphIndex: 0,
          originalText: "*Nosew on vamp",
          translatedText: "*Nosew on vamp",
        },
        {
          id: "p2",
          slideIndex: 4,
          shapeIndex: 1,
          paragraphIndex: 0,
          originalText: "*Vac tech eco fill process",
          translatedText: "*Vac tech eco fill process",
        },
        {
          id: "p3",
          slideIndex: 4,
          shapeIndex: 2,
          paragraphIndex: 0,
          originalText: "*May viền cổ giày: may đều chỉ",
          translatedText: "*Collar binding stitching: stitch evenly",
        },
        {
          id: "p4",
          slideIndex: 4,
          shapeIndex: 3,
          paragraphIndex: 0,
          isInspectionItem: true,
          originalText: "Tip shape",
          translatedText: "Tip shape",
        },
      ],
    },
  ];

  const unmapped = detectUnmappedTerminology(mixedSlides, [], "vi", "en");

  // Verify English headings are NOT suggested
  const nosewFound = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("nosew"));
  assert.equal(nosewFound, undefined, "English heading '*Nosew on vamp' must NOT be detected as unmapped VI term");

  const vacTechFound = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("vac tech"));
  assert.equal(vacTechFound, undefined, "English heading '*Vac tech eco fill process' must NOT be detected as unmapped VI term");

  const tipShapeFound = unmapped.find((it) => it.sourceTerm.toLowerCase() === "tip shape");
  assert.equal(tipShapeFound, undefined, "English inspection item 'Tip shape' must NOT be detected as unmapped VI term");

  // Verify authentic Vietnamese term IS detected
  const mayVien = unmapped.find((it) => it.sourceTerm.toLowerCase().includes("may viền") || it.sourceTerm.toLowerCase().includes("cổ giày"));
  assert.ok(mayVien, "Authentic Vietnamese term 'May viền cổ giày' must be detected");

  // Verify that suggestions never have target identical to source (no EN -> EN)
  for (const item of unmapped) {
    for (const opt of item.suggestedOptions) {
      assert.notEqual(
        opt.targetTerm.trim().toLowerCase(),
        item.sourceTerm.trim().toLowerCase(),
        `Suggested target '${opt.targetTerm}' must not be identical to source '${item.sourceTerm}'`
      );
    }
  }

  // Verify non VI->EN returns empty
  const enToVi = detectUnmappedTerminology(mixedSlides, [], "en", "vi");
  assert.equal(enToVi.length, 0, "EN -> VI direction must not produce unmapped suggestions");

  const enToEn = detectUnmappedTerminology(mixedSlides, [], "en", "en");
  assert.equal(enToEn.length, 0, "EN -> EN direction must not produce unmapped suggestions");

  console.log("[Test Success] Strictly filtered out English headings and prevented EN->EN suggestions.");
});
