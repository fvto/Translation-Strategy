import test from "node:test";
import assert from "node:assert";
import { auditPresentationCompliance } from "../services/qa/compliance-scorer.ts";

test("QA Scorer - Perfect presentation achieves Grade A+ with 100% score", () => {
  const slides = [
    {
      slideIndex: 1,
      slideFileName: "slide1.xml",
      title: "Quality Standard",
      paragraphs: [
        {
          id: "p1",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 1,
          originalText: "*Buffing: Mài cao và hở keo tại đế ngoài",
          translatedText: "*Buffing: Over buffing and bond gap at outsole",
        },
        {
          id: "p2",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 2,
          originalText: "May mũi 10-12 mũi/inch, kiểm tra mũi giày",
          translatedText: "Stitch tip with SPI 10-12 stitches/inch, inspect Tip shape",
        },
      ],
    },
  ];

  const report = auditPresentationCompliance(slides, "test.pptx");
  assert.strictEqual(report.breakdown.grade, "A+");
  assert.strictEqual(report.breakdown.overallScore, 100);
  assert.strictEqual(report.violations.length, 0);
  assert.ok(report.autoRepairedItems.length >= 1);
});

test("QA Scorer - Detects Vietnamese leakage and penalizes score accordingly", () => {
  const slides = [
    {
      slideIndex: 1,
      slideFileName: "slide1.xml",
      title: "QC Check",
      paragraphs: [
        {
          id: "p1",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 1,
          originalText: "Kiểm tra hở keo",
          translatedText: "Inspect hở keo at midsole", // Leaked Vietnamese
        },
      ],
    },
  ];

  const report = auditPresentationCompliance(slides, "test.pptx");
  assert.ok(report.breakdown.overallScore < 100);
  assert.strictEqual(report.breakdown.vietnameseLeakageScore, 75);
  assert.ok(report.violations.some((v) => v.type === "vi_leakage"));
});

test("QA Scorer - Detects non-standard SPI and bad CTQ noun adjunct order", () => {
  const slides = [
    {
      slideIndex: 1,
      slideFileName: "slide1.xml",
      title: "Inspection",
      paragraphs: [
        {
          id: "p1",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 1,
          originalText: "Mật độ mũi 10 SPI",
          translatedText: "Density 10 SPI without standard",
        },
        {
          id: "p2",
          slideIndex: 1,
          shapeIndex: 1,
          paragraphIndex: 2,
          originalText: "Định hình mũi giày",
          translatedText: "Check Shape tip carefully", // Should be Tip shape
        },
      ],
    },
  ];

  const report = auditPresentationCompliance(slides, "test.pptx");
  assert.ok(report.violations.some((v) => v.type === "spi_format"));
  assert.ok(report.violations.some((v) => v.type === "noun_adjunct"));
});
