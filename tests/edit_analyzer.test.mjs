import test from "node:test";
import assert from "node:assert";
import { analyzeParagraphEdit } from "../services/terminology/edit-analyzer.ts";

test("Edit Analyzer - Detects Tip-quarter hyphenation standardization", async () => {
  const req = {
    paragraphId: "p1",
    originalText: "3. Tip quarter ép bị bao không",
    oldTranslatedText: "3. Tipquarter press is covered",
    newTranslatedText: "3. Tip-quarter press is covered",
    deckSlides: [
      {
        slideIndex: 1,
        paragraphs: [
          { id: "p1", originalText: "3. Tip quarter ép bị bao không", translatedText: "3. Tipquarter press is covered" },
          { id: "p2", originalText: "Tip quarter ép dính chắc", translatedText: "Tipquarter press high-adhesion" },
          { id: "p3", originalText: "Khác màu Tip quarter", translatedText: "Tipquarter color shade variation" },
        ],
      },
    ],
  };

  const res = await analyzeParagraphEdit(req);

  assert.ok(res !== null, "Must detect a suggestion for Tip-quarter");
  assert.strictEqual(res.targetTerm, "Tip-quarter");
  assert.match(res.sourceTerm, /Tip[- ]quarter/i);
  assert.strictEqual(res.occurrencesInDeck, 2, "Must count 2 other occurrences in deck");
  assert.deepStrictEqual(res.matchingParagraphIds, ["p2", "p3"]);
});

test("Edit Analyzer - Detects footwear defect terminology correction", async () => {
  const req = {
    paragraphId: "p4",
    originalText: "Kiểm tra mặt trước rập film",
    oldTranslatedText: "Check front film pattern",
    newTranslatedText: "Check vamp film pattern",
  };

  const res = await analyzeParagraphEdit(req);

  assert.ok(res !== null, "Must detect vamp term correction");
  assert.strictEqual(res.targetTerm.toLowerCase(), "vamp");
  assert.strictEqual(res.sourceTerm.toLowerCase(), "mặt trước");
  assert.strictEqual(res.category, "Bộ vị (Component)");
});

test("Edit Analyzer - Returns null for identical text", async () => {
  const req = {
    paragraphId: "p5",
    originalText: "Kiểm tra mặt trước",
    oldTranslatedText: "Check vamp",
    newTranslatedText: "Check vamp",
  };

  const res = await analyzeParagraphEdit(req);
  assert.strictEqual(res, null, "Should return null when nothing changed");
});
