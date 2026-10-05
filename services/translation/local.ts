import { TranslationProvider, TranslationRequest, TranslationResponse } from "./types";
import { buildStructuredPrompt } from "./context";
import { formatUppercaseStructure, normalizeSourcePunctuation } from "./casing";
import { enforceTerminologyCompliance } from "../terminology/enforcer";

export class LocalLLMProvider implements TranslationProvider {
  name = "local_llm";
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = "http://localhost:11434/v1", model = "qwen3:4b") {
    let cleanUrl = baseUrl.replace(/\/$/, "");
    // If user provided base Ollama port without /v1, automatically append /v1 for OpenAI compatibility
    if (/:\d+$/.test(cleanUrl) && !cleanUrl.endsWith("/v1")) {
      cleanUrl = `${cleanUrl}/v1`;
    }

    // Prefer 127.0.0.1 when localhost resolves to IPv6/::1 on some Windows setups.
    if (/^http:\/\/localhost(?::\d+)?(?:\/v1)?$/i.test(cleanUrl)) {
      cleanUrl = cleanUrl.replace("http://localhost", "http://127.0.0.1");
    }

    this.baseUrl = cleanUrl;
    this.model = model || "qwen3:4b";
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    const sourceText = normalizeSourcePunctuation(request.sourceText);
    const { systemPrompt, userPrompt } = buildStructuredPrompt({
      ...request,
      sourceText,
    });

    const candidateUrls = Array.from(
      new Set([
        this.baseUrl,
        this.baseUrl.replace("127.0.0.1", "localhost"),
        this.baseUrl.replace("localhost", "127.0.0.1"),
      ])
    );

    let lastError: Error | null = null;

    for (const baseUrl of candidateUrls) {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          throw new Error(`Local LLM responded with status ${response.status}`);
        }

        const data = await response.json();
        let rawText = data.choices?.[0]?.message?.content?.trim() || "";

        if (!rawText) {
          throw new Error("Local LLM returned empty content");
        }

        rawText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        rawText = rawText.replace(/^<think>[\s\S]*/i, "").trim();
        rawText = rawText.replace(/^```[a-zA-Z]*\s*/i, "").replace(/\s*```$/i, "").trim();

        const rawFormatted = formatUppercaseStructure(rawText);
        const enforced = enforceTerminologyCompliance(
          request.sourceText,
          rawFormatted,
          request.approvedTerminology || [],
          request.sourceLanguage,
          request.targetLanguage
        );

        return {
          translatedText: enforced.text,
          provider: "Local LLM (Ollama)",
          durationMs: Date.now() - startTime,
          modelName: `Ollama (${this.model})`,
        };
      } catch (e: any) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    const fallback = new (await import("./offline")).AirGappedTranslationProvider();
    const fallbackResult = await fallback.translate({
      sourceText: normalizeSourcePunctuation(request.sourceText),
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      approvedTerminology: request.approvedTerminology,
    });

    return {
      ...fallbackResult,
      provider: "Local LLM fallback (offline)",
      modelName: `Offline fallback (${this.model})`,
    };
  }
}

