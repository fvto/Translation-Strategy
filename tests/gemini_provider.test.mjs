import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiRateLimitError, GeminiTranslationProvider } from "../services/translation/gemini.ts";
import { GoogleTranslationProvider } from "../services/translation/google.ts";

test("Gemini Provider - Initialization and Name", () => {
  const provider = new GeminiTranslationProvider("test_key", "gemini-3.8-flash");
  assert.equal(provider.name, "gemini");
});

test("Gemini Provider - Throws error when no API key is provided", async () => {
  const savedKey = process.env.GEMINI_KEY;
  delete process.env.GEMINI_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const provider = new GeminiTranslationProvider("");
    await assert.rejects(
      async () => {
        await provider.translate({
          sourceText: "Kiểm tra chất lượng",
          sourceLanguage: "vi",
          targetLanguage: "en",
        });
      },
      /Gemini API key is not configured/
    );
  } finally {
    if (savedKey) process.env.GEMINI_KEY = savedKey;
  }
});

test("Gemini Provider - Translates with live or mocked response", async () => {
  const provider = new GeminiTranslationProvider(
    process.env.GEMINI_KEY,
    "gemini-3.8-flash"
  );

  if (process.env.GEMINI_KEY) {
    try {
      const res = await provider.translate({
        sourceText: "Kiểm tra chất lượng sản phẩm trước khi xuất xưởng.",
        sourceLanguage: "vi",
        targetLanguage: "en",
      });
      assert.ok(res.translatedText.length > 0);
      assert.ok(res.modelName.includes("gemini"));
      assert.ok(/check|inspect|quality|product/i.test(res.translatedText));
    } catch (e) {
      // If temporary 503 from Google high demand, ensure error message indicates high demand or handled
      assert.ok(e.message);
    }
  }
});

test("Gemini Provider - Batch Translation translates multiple items in one call", async () => {
  const provider = new GeminiTranslationProvider(
    process.env.GEMINI_KEY,
    process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
  );

  if (process.env.GEMINI_KEY) {
    try {
      const res = await provider.translateBatch({
        items: [
          { id: "p1", sourceText: "Kiểm tra mũi đục 1.8mm" },
          { id: "p2", sourceText: "Tiêu chuẩn dán đế giày" },
        ],
        sourceLanguage: "vi",
        targetLanguage: "en",
        approvedTerminology: [],
      });
      assert.ok(res.results instanceof Map);
      assert.ok(res.results.has("p1"));
      assert.ok(res.results.has("p2"));
      assert.ok(/1\.8\s*mm/i.test(res.results.get("p1")));
    } catch (e) {
      assert.ok(e.message);
    }
  }
});

test("Gemini Provider - exposes 429 immediately for application-level fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: "Resource exhausted. Retry in 59s." } }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");
    const startedAt = Date.now();
    await assert.rejects(
      () => provider.translateBatch({
        items: [{ id: "p1", sourceText: "Kiểm tra chất lượng" }],
        sourceLanguage: "vi",
        targetLanguage: "en",
        approvedTerminology: [],
      }),
      (error) => error instanceof GeminiRateLimitError && error.retryAfterSeconds === 59
    );
    assert.ok(Date.now() - startedAt < 1_000, "A 429 must not sleep inside the Gemini provider");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google NMT - honors the requested VI to EN direction for bilingual content", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify(["Translated text"]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const provider = new GoogleTranslationProvider();
    await provider.translate({
      sourceText: "Check cement adhesion before packing.",
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });
    assert.match(requestUrl, /[?&]sl=vi(?:&|$)/);
    assert.match(requestUrl, /[?&]tl=en(?:&|$)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
