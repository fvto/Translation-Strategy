import { TranslationProvider, TranslationRequest, TranslationResponse } from "./types";
import { AirGappedTranslationProvider } from "./offline";
import { matchTerminology } from "../terminology/matcher";
import { adaptTermCasing, formatUppercaseStructure, normalizeSourcePunctuation } from "./casing";

const DEFAULT_MODEL = "Helsinki-NLP/opus-mt-en-vi";

export class HuggingFaceTranslationProvider implements TranslationProvider {
  name = "huggingface";
  private apiKey?: string;
  private model: string;
  private fallback = new AirGappedTranslationProvider();

  constructor(apiKey?: string, model = DEFAULT_MODEL) {
    this.apiKey = apiKey || process.env.HUGGINGFACE_API_KEY;
    this.model = model || DEFAULT_MODEL;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    if (request.sourceLanguage !== "en" || request.targetLanguage !== "vi") {
      const fallback = await this.fallback.translate(request);
      return { ...fallback, provider: "Hugging Face fallback (offline)", modelName: `${this.model} supports EN -> VI only` };
    }

    try {
      const sourceText = normalizeSourcePunctuation(request.sourceText);
      const matches = matchTerminology(sourceText, request.approvedTerminology || []);
      const locks: { placeholder: string; targetTerm: string }[] = [];
      let workingText = sourceText;

      for (const [index, match] of [...matches].sort((a, b) => b.startIndex - a.startIndex).entries()) {
        const placeholder = `ZXHF${index}K`;
        locks.push({ placeholder, targetTerm: match.entry.targetTerm });
        workingText = workingText.slice(0, match.startIndex) + placeholder + workingText.slice(match.endIndex);
      }

      const response = await fetch(`https://api-inference.huggingface.co/models/${this.model}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ inputs: workingText, options: { wait_for_model: true } }),
      });
      if (!response.ok) throw new Error(`Hugging Face returned status ${response.status}`);

      const data = await response.json();
      const rawText = Array.isArray(data)
        ? data[0]?.translation_text
        : data?.translation_text;
      if (typeof rawText !== "string" || !rawText.trim()) throw new Error("Hugging Face returned empty translation");

      let translatedText = rawText.trim();
      for (const lock of locks) {
        const pattern = new RegExp(`\\b${lock.placeholder}\\b`, "gi");
        translatedText = translatedText.replace(pattern, (_match: string, offset: number, full: string) => {
          const before = full.slice(0, offset);
          return adaptTermCasing(lock.targetTerm, /(?:^|[.!?])\\s*$/.test(before));
        });
      }

      return {
        translatedText: formatUppercaseStructure(translatedText),
        provider: "Hugging Face MarianMT",
        durationMs: Date.now() - startTime,
        modelName: this.model,
      };
    } catch (error: any) {
      const fallback = await this.fallback.translate(request);
      return { ...fallback, provider: "Hugging Face fallback (offline)", modelName: `${this.model}: ${error.message}` };
    }
  }
}