import { TranslationProvider } from "./types";
import { AirGappedTranslationProvider } from "./offline";
import { CloudTranslationProvider } from "./cloud";
import { LocalLLMProvider } from "./local";
import { GoogleTranslationProvider } from "./google";
import { HuggingFaceTranslationProvider } from "./huggingface";
import { GeminiTranslationProvider } from "./gemini";
import { AntigravityCliTranslationProvider } from "./antigravity";
import { CTranslate2TranslationProvider } from "./ctranslate2";
import { db } from "../database/db";

export * from "./types";
export * from "./context";
export * from "./google";
export * from "./gemini";
export * from "./antigravity";
export * from "./ctranslate2";

export function getTranslationProvider(providerName?: string): TranslationProvider {
  const settings = db.getSettings();
  const providerToUse =
    providerName && providerName !== "default"
      ? providerName
      : settings.defaultProvider || process.env.DEFAULT_TRANSLATION_PROVIDER || "gemini";

  switch (providerToUse) {
    case "gemini": {
      const geminiKey = settings.geminiApiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
      if (geminiKey) {
        return new GeminiTranslationProvider(
          geminiKey,
          process.env.GEMINI_MODEL || settings.geminiModel || "gemini-3.5-flash-lite"
        );
      }
      return new GoogleTranslationProvider(
        settings.googleApiKey || process.env.GOOGLE_TRANSLATE_API_KEY
      );
    }
    case "google_translate":
      return new GoogleTranslationProvider(
        settings.googleApiKey || process.env.GOOGLE_TRANSLATE_API_KEY
      );
    case "openai":
      return new CloudTranslationProvider(
        settings.openaiApiKey || process.env.OPENAI_API_KEY,
        settings.openaiModel || "gpt-4o-mini"
      );
    case "huggingface":
      return new HuggingFaceTranslationProvider(
        settings.huggingFaceApiKey || process.env.HUGGINGFACE_API_KEY,
        settings.huggingFaceModel || "Helsinki-NLP/opus-mt-en-vi"
      );
    case "local_llm":
      return new LocalLLMProvider(
        settings.localLlmUrl || process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1",
        settings.localLlmModel || process.env.LOCAL_LLM_MODEL || "qwen3:4b"
      );
    case "antigravity_cli":
      return new AntigravityCliTranslationProvider();
    case "ctranslate2":
      return new CTranslate2TranslationProvider();
    case "airgapped":
      return new AirGappedTranslationProvider();
    default: {
      const fallbackKey = settings.geminiApiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
      if (fallbackKey) {
        return new GeminiTranslationProvider(
          fallbackKey,
          process.env.GEMINI_MODEL || settings.geminiModel || "gemini-3.5-flash-lite"
        );
      }
      return new AirGappedTranslationProvider();
    }
  }
}
