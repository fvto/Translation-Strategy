import test from "node:test";
import assert from "node:assert/strict";
import { getTranslationProvider } from "../services/translation/index.ts";
import {
  recordTranslationSession,
  getTranslationSessions,
  getTranslationSessionById,
  searchTranslationMemory,
} from "../services/translation/translation-memory.ts";
import { harvestTerminologyFromSlides } from "../services/translation/harvester.ts";
import { db } from "../services/database/db.ts";

test("Workspace Engine Resolution & Provider Dispatch", () => {
  const origKey = process.env.GEMINI_KEY;
  process.env.GEMINI_KEY = origKey || "test_gemini_key";
  try {
    // Test gemini provider resolution
    const geminiProvider = getTranslationProvider("gemini");
    assert.ok(geminiProvider, "Gemini provider should be resolved");
    assert.equal(geminiProvider.name, "gemini");
  } finally {
    if (!origKey) delete process.env.GEMINI_KEY;
  }

  // Test airgapped provider resolution
  const airgappedProvider = getTranslationProvider("airgapped");
  assert.ok(airgappedProvider, "Airgapped provider should be resolved");
  assert.equal(airgappedProvider.name, "airgapped");

  // Test antigravity_cli resolution
  const agyProvider = getTranslationProvider("antigravity_cli");
  assert.ok(agyProvider, "Antigravity CLI provider should be resolved");
  assert.equal(agyProvider.name, "antigravity_cli");
});

test("Translation Memory Logging - Records and retrieves session logs", () => {
  const testSessionId = `test_session_${Date.now()}`;
  const mockSlides = [
    {
      slideIndex: 1,
      title: "HFPA Cutting Inspection Strategy",
      paragraphs: [
        { id: "p1", originalText: "*Ép lạnh: thời gian 15\"", translatedText: "*Cold pressing: time 15\"" },
        { id: "p2", originalText: "Chất lượng logo in sơn khi kiểm tra cần chú ý", translatedText: "Painted logo quality key inspection points" },
      ],
    },
  ];

  const sessionLog = recordTranslationSession(
    testSessionId,
    "Test_SOP_01.pptx",
    mockSlides,
    "ipqc_bilingual",
    "vi",
    "en",
    2
  );

  assert.equal(sessionLog.sessionId, testSessionId);
  assert.equal(sessionLog.slideCount, 1);
  assert.equal(sessionLog.totalPairs, 2);

  // Retrieve index
  const sessions = getTranslationSessions();
  const foundInIndex = sessions.find((s) => s.sessionId === testSessionId);
  assert.ok(foundInIndex, "Session must exist in translation memory index");
  assert.equal(foundInIndex.fileName, "Test_SOP_01.pptx");

  // Retrieve single log
  const retrievedLog = getTranslationSessionById(testSessionId);
  assert.ok(retrievedLog, "Full session log must be retrievable");
  assert.equal(retrievedLog.slides[0].pairs.length, 2);
  assert.equal(retrievedLog.slides[0].pairs[0].sourceText, "*Ép lạnh: thời gian 15\"");
  assert.equal(retrievedLog.slides[0].pairs[0].translatedText, "*Cold pressing: time 15\"");
});

test("Auto-Feed Terminology Harvester - Extracts and sanitizes footwear terms into database", () => {
  const mockSlides = [
    {
      slideIndex: 1,
      title: "Assembly SOP",
      paragraphs: [
        {
          id: "p1",
          originalText: "*Ép lạnh: thời gian 15\"",
          translatedText: "*Cold pressing: time 15\"",
        },
        {
          id: "p2",
          originalText: "Chất lượng logo in sơn",
          translatedText: "Painted logo quality",
        },
        {
          id: "p3",
          originalText: "Kiểm tra không lem sơn",
          translatedText: "Check no paint smudging",
        },
      ],
    },
  ];

  const result = harvestTerminologyFromSlides(mockSlides, "Sample_Harvester_SOP.pptx", "vi", "en");
  assert.ok(
    result.added.length + result.skipped >= 2,
    `Should harvest or identify at least 2 terms, got added=${result.added.length}, skipped=${result.skipped}`
  );

  // Verify terms are stored in database
  const approved = db.getApprovedTerminology("vi", "en");
  const hasColdPressing = approved.some((t) => t.sourceTerm.toLowerCase().includes("ép lạnh"));
  assert.ok(hasColdPressing, "Harvested 'ép lạnh' term must be present in approved terminology");

  // Verify rule: Zero identical source/target
  for (const t of result.added) {
    assert.notEqual(
      t.sourceTerm.trim().toLowerCase(),
      t.targetTerm.trim().toLowerCase(),
      "Harvested term cannot have identical source and target"
    );
  }
});

test("Strict Zero-Image Policy - Images, media paths and binaries are NEVER fed or logged", () => {
  const imageMockSlides = [
    {
      slideIndex: 1,
      title: "Slide with Media",
      paragraphs: [
        { id: "img1", originalText: "ppt/media/image1.png", translatedText: "ppt/media/image1.png" },
        { id: "img2", originalText: "image_defect_01.jpeg", translatedText: "image_defect_01.jpeg" },
        { id: "img3", originalText: "data:image/png;base64,iVBORw0KGgo...", translatedText: "data:image/png;base64,..." },
        { id: "p1", originalText: "Hình dạng mũi", translatedText: "Tip shape" },
      ],
    },
  ];

  // 1. Verify harvester ignores all images
  const harvestRes = harvestTerminologyFromSlides(imageMockSlides, "Image_Check_SOP.pptx", "vi", "en");
  for (const t of harvestRes.added) {
    assert.ok(!/\.(png|jpe?g|gif|webp|svg)$/i.test(t.sourceTerm), "Harvester must never feed image file paths");
    assert.ok(!/data:image\//i.test(t.sourceTerm), "Harvester must never feed base64 images");
  }

  // 2. Verify translation memory logs exclude image files and base64
  const sessionLog = recordTranslationSession(
    `tm_zero_img_${Date.now()}`,
    "Image_Check_SOP.pptx",
    imageMockSlides,
    "ipqc_bilingual",
    "vi",
    "en"
  );
  for (const p of sessionLog.slides[0].pairs) {
    assert.ok(!/\.(png|jpe?g|gif|webp|svg)$/i.test(p.sourceText), "TM Log must never store image paths");
    assert.ok(!/data:image\//i.test(p.sourceText), "TM Log must never store base64 image data");
  }
});

test("Translation Memory & Glossary - Search TM segments with timestamps and sort by oldest", () => {
  // 1. Verify searchTranslationMemory returns results with ISO timestamps
  const tmResults = searchTranslationMemory("", 20);
  assert.ok(tmResults.length > 0, "TM segments search should return stored translation segments");
  for (const seg of tmResults) {
    assert.ok(seg.id, "Segment must have unique ID");
    assert.ok(seg.createdAt, "Segment must have valid ISO timestamp");
    assert.ok(!isNaN(new Date(seg.createdAt).getTime()), "Segment timestamp must be valid date");
    assert.ok(seg.sourceText, "Segment must have sourceText");
    assert.ok(seg.translatedText, "Segment must have translatedText");
  }

  // 2. Verify searching by query filters correctly
  const filtered = searchTranslationMemory("pressing", 10);
  for (const seg of filtered) {
    const textMatch =
      seg.sourceText.toLowerCase().includes("pressing") ||
      seg.translatedText.toLowerCase().includes("pressing") ||
      seg.fileName.toLowerCase().includes("pressing");
    assert.ok(textMatch, "Search query filter must match");
  }

  // 3. Verify db.getTerminology with sortBy='oldest'
  const oldestTerms = db.getTerminology({ sortBy: "oldest" });
  assert.ok(oldestTerms.length >= 2, "Database must have multiple terms");
  const time0 = new Date(oldestTerms[0].createdAt || oldestTerms[0].updatedAt).getTime();
  const timeLast = new Date(
    oldestTerms[oldestTerms.length - 1].createdAt || oldestTerms[oldestTerms.length - 1].updatedAt
  ).getTime();
  assert.ok(time0 <= timeLast, "Oldest sort must place earlier timestamps first");
});


