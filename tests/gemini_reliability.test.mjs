import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiTranslationProvider,
  GeminiErrorType,
  GeminiRateLimitError,
  GeminiQuotaExhaustedError,
  GeminiRateLimiter,
  GeminiQuotaManager,
  GeminiCircuitBreaker,
  GeminiResponseParser,
} from "../services/translation/gemini.ts";

beforeEach(() => {
  GeminiQuotaManager.getInstance().reset();
  GeminiCircuitBreaker.getInstance().reset();
});

test("Gemini Reliability - 1. Raw JSON array parsing", () => {
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify([{ id: "item1", translatedText: "Check cement" }]) }],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "item1", sourceText: "Kiểm tra keo" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, "item1");
  assert.equal(parsed.items[0].translatedText, "Check cement");
  assert.equal(parsed.malformed, false);
});

test("Gemini Reliability - 2. { translations: [...] } wrapper parsing", () => {
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                translations: [{ id: "item1", translatedText: "Cold shaping" }],
              }),
            },
          ],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "item1", sourceText: "Định hình lạnh" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].translatedText, "Cold shaping");
  assert.equal(parsed.wrapperDetected, "translations");
});

test("Gemini Reliability - 3. { items: [...] } wrapper parsing", () => {
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                items: [{ id: "item2", translatedText: "Stitch collar" }],
              }),
            },
          ],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "item2", sourceText: "May cổ" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].translatedText, "Stitch collar");
  assert.equal(parsed.wrapperDetected, "items");
});

test("Gemini Reliability - 4. { data: [...] } wrapper parsing", () => {
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                data: [{ id: "item3", translatedText: "Buffing sole" }],
              }),
            },
          ],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "item3", sourceText: "Mài đế" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].translatedText, "Buffing sole");
  assert.equal(parsed.wrapperDetected, "data");
});

test("Gemini Reliability - 5. Markdown fenced JSON parsing", () => {
  const fenced = "```json\n" + JSON.stringify([{ id: "item4", translatedText: "Toe curve" }]) + "\n```";
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [{ text: fenced }],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "item4", sourceText: "Độ bo mũi" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].translatedText, "Toe curve");
});

test("Gemini Reliability - 6. Multi-part response assembly (ignoring thought metadata)", () => {
  const rawResponse = {
    candidates: [
      {
        content: {
          parts: [
            { text: "Thinking about footwear translation...", thought: true },
            { text: '[{"id": "p1", ' },
            { text: '"translatedText": "Collar opening"}]' },
          ],
        },
      },
    ],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "p1", sourceText: "Vòng cổ" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, "p1");
  assert.equal(parsed.items[0].translatedText, "Collar opening");
});

test("Gemini Reliability - 7. Truncated JSON array with bracket repair", () => {
  // Truncated array where 2nd item was cut off at end
  const truncatedText = '[{"id": "p1", "translatedText": "Step 1"}, {"id": "p2", "translatedText": "Step 2"}, {"id": "p3", "trans';
  const rawResponse = {
    candidates: [{ content: { parts: [{ text: truncatedText }] } }],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "p1", sourceText: "Bước 1" },
    { id: "p2", sourceText: "Bước 2" },
    { id: "p3", sourceText: "Bước 3" },
  ]);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].id, "p1");
  assert.equal(parsed.items[1].id, "p2");
  assert.equal(parsed.salvaged, true);
});

test("Gemini Reliability - 8. Partial object salvage with string-aware parser", () => {
  // Object with braces inside translatedText
  const textWithBraces = 'Here is the result: {"id": "p1", "translatedText": "Note {important}: apply cement"} and {"id": "p2", "translatedText": "Done"}';
  const rawResponse = {
    candidates: [{ content: { parts: [{ text: textWithBraces }] } }],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "p1", sourceText: "Lưu ý" },
    { id: "p2", sourceText: "Xong" },
  ]);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].translatedText, "Note {important}: apply cement");
});

test("Gemini Reliability - 9. Duplicate IDs deduplication", () => {
  const duplicateJson = JSON.stringify([
    { id: "p1", translatedText: "First translation" },
    { id: "p1", translatedText: "Duplicate ignored" },
  ]);
  const rawResponse = {
    candidates: [{ content: { parts: [{ text: duplicateJson }] } }],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "p1", sourceText: "Đoạn 1" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].translatedText, "First translation");
});

test("Gemini Reliability - 10. Unexpected IDs rejection", () => {
  const jsonWithRogueId = JSON.stringify([
    { id: "p1", translatedText: "Valid" },
    { id: "rogue999", translatedText: "Should be dropped" },
  ]);
  const rawResponse = {
    candidates: [{ content: { parts: [{ text: jsonWithRogueId }] } }],
  };
  const parsed = GeminiResponseParser.parseGeminiResponse(rawResponse, [
    { id: "p1", sourceText: "Đoạn 1" },
  ]);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, "p1");
});

test("Gemini Reliability - 11 & 12 & 13. Missing ID reconciliation & retry only missing items", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  const requestsReceived = [];

  globalThis.fetch = async (_url, options) => {
    callCount++;
    const body = JSON.parse(options.body);
    const userPrompt = body.contents[0].parts[0].text;
    requestsReceived.push(userPrompt);

    if (callCount === 1) {
      // First attempt: returns only p1 and p2, omits p3
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { id: "p1", translatedText: "Cement 1" },
                      { id: "p2", translatedText: "Cement 2" },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      // Second attempt (recovery): returns only p3
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify([{ id: "p3", translatedText: "Cement 3" }]) },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  };

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");
    const res = await provider.translateBatch({
      items: [
        { id: "p1", sourceText: "Keo 1" },
        { id: "p2", sourceText: "Keo 2" },
        { id: "p3", sourceText: "Keo 3" },
      ],
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });

    assert.equal(res.results.size, 3);
    assert.equal(res.results.get("p1"), "Cement 1");
    assert.equal(res.results.get("p2"), "Cement 2");
    assert.equal(res.results.get("p3"), "Cement 3");
    assert.equal(callCount, 2, "Second call was made to recover missing p3");

    // Assert that second call contained ONLY p3
    assert.ok(requestsReceived[1].includes('"id": "p3"'));
    assert.ok(!requestsReceived[1].includes('"id": "p1"'));
    assert.ok(!requestsReceived[1].includes('"id": "p2"'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 14 & 15. 429 RPM vs 429 RPD classification", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");

    // 14. 429 RPM with retry-after
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "Resource exhausted. Rate limit exceeded. Retry in 15s." } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        provider.translate({
          sourceText: "Test",
          sourceLanguage: "vi",
          targetLanguage: "en",
          approvedTerminology: [],
        }),
      (err) => err.errorType === GeminiErrorType.RATE_LIMIT_RPM && err.retryAfterSeconds === 15
    );

    // 15. 429 RPD with daily limit exhaustion
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "You exceeded your current quota (PerDay limit reached), please check plan." } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        provider.translate({
          sourceText: "Test",
          sourceLanguage: "vi",
          targetLanguage: "en",
          approvedTerminology: [],
        }),
      (err) => err.errorType === GeminiErrorType.RATE_LIMIT_RPD
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 16 & 17. 500 and 503 Server Errors retry and recover", async () => {
  const originalFetch = globalThis.fetch;
  let attempts503 = 0;

  globalThis.fetch = async () => {
    attempts503++;
    if (attempts503 === 1) {
      return new Response("Server overloaded", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Recovered translation" }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");
    const res = await provider.translate({
      sourceText: "Kiểm tra",
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });
    assert.equal(res.translatedText, "Recovered translation");
    assert.equal(attempts503, 2, "Must retry after 503 and succeed on attempt 2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 18. ECONNRESET / Corporate proxy socket drop recovers", async () => {
  const originalFetch = globalThis.fetch;
  let socketAttempts = 0;

  globalThis.fetch = async () => {
    socketAttempts++;
    if (socketAttempts === 1) {
      const err = new Error("wsarecv: WSAECONNRESET (10054)");
      err.code = "ECONNRESET";
      throw err;
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Socket recovered" }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");
    const res = await provider.translate({
      sourceText: "Kiểm tra",
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });
    assert.equal(res.translatedText, "Socket recovered");
    assert.equal(socketAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 19. Request timeout with AbortController", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };

  try {
    // 50ms timeout for testing
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite", {
      requestTimeoutMs: 50,
      maxRetries: 0,
    });

    await assert.rejects(
      () =>
        provider.translate({
          sourceText: "Kiểm tra",
          sourceLanguage: "vi",
          targetLanguage: "en",
          approvedTerminology: [],
        }),
      (err) => err.errorType === GeminiErrorType.TIMEOUT
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 20. Model circuit breaker never locks into dead model", () => {
  const circuitBreaker = GeminiCircuitBreaker.getInstance();
  circuitBreaker.reset();

  // Initially both are available
  const initial = circuitBreaker.getCandidateModels("gemini-3.5-flash-lite");
  assert.deepEqual(initial, ["gemini-3.5-flash-lite", "gemini-3.5-flash"]);

  // Simulate gemini-3.5-flash having exhausted RPD
  const flashRpdError = new GeminiRateLimitError("Daily limit reached", undefined, GeminiErrorType.RATE_LIMIT_RPD, "gemini-3.5-flash");
  circuitBreaker.recordFailure("gemini-3.5-flash", flashRpdError);

  // Now candidate models must NOT include dead flash model
  const healthyCandidates = circuitBreaker.getCandidateModels("gemini-3.5-flash-lite");
  assert.deepEqual(healthyCandidates, ["gemini-3.5-flash-lite"]);
  assert.equal(circuitBreaker.isModelAvailable("gemini-3.5-flash"), false);
});

test("Gemini Reliability - 21 & 23. Global rate limiter serializes concurrent callers", async () => {
  const originalInterval = GeminiRateLimiter.minIntervalMs;
  GeminiRateLimiter.reset();
  GeminiRateLimiter.minIntervalMs = 60; // 60ms interval for fast concurrency test

  const startTimes = [];
  const makeCall = async () => {
    await GeminiRateLimiter.throttle("gemini-3.5-flash-lite");
    startTimes.push(Date.now());
  };

  // Launch 3 concurrent callers simultaneously
  await Promise.all([makeCall(), makeCall(), makeCall()]);

  assert.equal(startTimes.length, 3);
  assert.ok(startTimes[1] - startTimes[0] >= 50, "Second call must serialize after interval");
  assert.ok(startTimes[2] - startTimes[1] >= 50, "Third call must serialize after interval");

  GeminiRateLimiter.minIntervalMs = originalInterval;
});

test("Gemini Reliability - 22. Daily Quota Manager blocks calls after RPD exhaustion", () => {
  const quotaManager = GeminiQuotaManager.getInstance();
  quotaManager.reset();

  const state = quotaManager.getQuotaState("gemini-3.5-flash-lite");
  assert.equal(state.dailyLimit, 500);
  assert.equal(quotaManager.canRequest("gemini-3.5-flash-lite"), true);

  // Simulate using up all 500
  quotaManager.setUsed("gemini-3.5-flash-lite", 500);
  assert.equal(quotaManager.canRequest("gemini-3.5-flash-lite"), false);

  assert.throws(
    () => quotaManager.assertQuotaAvailable("gemini-3.5-flash-lite"),
    (err) => err instanceof GeminiQuotaExhaustedError && err.used === 500
  );
});

test("Gemini Reliability - 24. Preserves Connection: close header", async () => {
  const originalFetch = globalThis.fetch;
  let connectionHeader = "";

  globalThis.fetch = async (_url, options) => {
    connectionHeader = options.headers["Connection"] || options.headers["connection"];
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite");
    await provider.translate({
      sourceText: "Kiểm tra",
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });
    assert.equal(connectionHeader, "close");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini Reliability - 25. Preserves partial success and only missing items need downstream fallback", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  // Gemini returns only item 1, repeatedly omits item 2
  globalThis.fetch = async () => {
    attempts++;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify([{ id: "item1", translatedText: "Gemini translated 1" }]) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const provider = new GeminiTranslationProvider("test_key", "gemini-3.5-flash-lite", { maxRetries: 1 });
    const res = await provider.translateBatch({
      items: [
        { id: "item1", sourceText: "Đoạn 1" },
        { id: "item2", sourceText: "Đoạn 2" },
      ],
      sourceLanguage: "vi",
      targetLanguage: "en",
      approvedTerminology: [],
    });

    // Item 1 was successfully translated by Gemini and MUST NOT be discarded
    assert.equal(res.results.has("item1"), true);
    assert.equal(res.results.get("item1"), "Gemini translated 1");
    // Item 2 is missing, so caller can selectively fallback only item 2
    assert.equal(res.results.has("item2"), false);
    assert.ok(attempts >= 2, "Gemini attempted recovery for item 2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

