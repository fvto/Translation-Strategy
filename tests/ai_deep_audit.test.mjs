import test from "node:test";
import assert from "node:assert/strict";
import { runAiDeepAudit } from "../services/translation/ai-deep-audit.js";

test("AI Deep Audit: returns immediately when report has 0 candidates needing translation", async () => {
  const dummyReport = {
    fileName: "test.pptx",
    fileType: "pptx",
    totalUnits: 2,
    totalSlides: 1,
    alreadyTranslatedCount: 2,
    needsTranslationCount: 0,
    tmReusableCount: 0,
    lockedTerminologyCount: 0,
    nonTranslatableCount: 0,
    mixedLanguageCount: 0,
    possibleTranslationCount: 0,
    reviewRequiredCount: 0,
    affectedSlides: [],
    estimatedGeminiRequests: 0,
    units: [
      {
        id: "p1",
        sourceText: "Wrong material",
        sourceHash: "h1",
        canonicalText: "wrong material",
        status: "ALREADY_TRANSLATED",
        selectedForTranslation: false,
        confidence: 1.0,
        reason: "Already translated",
        location: { slideIndex: 1, shapeIndex: 0, paragraphIndex: 0 },
      },
      {
        id: "p2",
        sourceText: "Sai liệu",
        sourceHash: "h2",
        canonicalText: "sai lieu",
        status: "ALREADY_TRANSLATED",
        selectedForTranslation: false,
        confidence: 1.0,
        reason: "Already translated",
        existingTranslation: "Wrong material",
        location: { slideIndex: 1, shapeIndex: 0, paragraphIndex: 1 },
      },
    ],
  };

  const result = await runAiDeepAudit(dummyReport);
  assert.equal(result.pairedCount, 0);
  assert.equal(result.report.aiAudited, true);
  assert.equal(result.report.aiAuditedItemCount, 0);
});

test("AI Deep Audit: returns informative error when API key is missing without crashing", async () => {
  const prevKey = process.env.GEMINI_KEY;
  const prevApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const dummyReport = {
      fileName: "test.pptx",
      fileType: "pptx",
      totalUnits: 1,
      totalSlides: 1,
      alreadyTranslatedCount: 0,
      needsTranslationCount: 1,
      tmReusableCount: 0,
      lockedTerminologyCount: 0,
      nonTranslatableCount: 0,
      mixedLanguageCount: 0,
      possibleTranslationCount: 0,
      reviewRequiredCount: 0,
      affectedSlides: [1],
      estimatedGeminiRequests: 1,
      units: [
        {
          id: "p1",
          sourceText: "Sai liệu",
          sourceHash: "h1",
          canonicalText: "sai lieu",
          status: "NEEDS_TRANSLATION",
          selectedForTranslation: true,
          confidence: 0.5,
          reason: "Needs translation",
          location: { slideIndex: 1, shapeIndex: 0, paragraphIndex: 0 },
        },
      ],
    };

    const result = await runAiDeepAudit(dummyReport);
    assert.ok(result.error, "Should report missing API key");
    assert.equal(result.report.needsTranslationCount, 1, "Report should remain intact");
  } finally {
    if (prevKey) process.env.GEMINI_KEY = prevKey;
    if (prevApiKey) process.env.GEMINI_API_KEY = prevApiKey;
  }
});
