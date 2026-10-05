import { TranslationProvider, TranslationRequest, TranslationResponse } from "./types";
import { buildStructuredPrompt } from "./context";

export class CloudTranslationProvider implements TranslationProvider {
  name = "cloud";
  private apiKey?: string;
  private model: string;

  constructor(apiKey?: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.apiKey) {
      throw new Error("Cloud provider error: API key is not configured in settings or environment.");
    }

    const startTime = Date.now();
    const { systemPrompt, userPrompt } = buildStructuredPrompt(request);

    // Call OpenAI or compatible chat completions endpoint
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
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
      const err = await response.text();
      throw new Error(`Cloud Translation API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || "";

    return {
      translatedText,
      provider: "Cloud LLM (OpenAI-compatible)",
      durationMs: Date.now() - startTime,
      modelName: this.model,
    };
  }
}
