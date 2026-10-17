import { TranslationProvider } from "./types";
import { GoogleTranslationProvider } from "./google";
import { GeminiTranslationProvider } from "./gemini";
import { AntigravityCliTranslationProvider } from "./antigravity";
import { AirGappedTranslationProvider } from "./offline";
import { db } from "../database/db";

export * from "./types";
export * from "./context";
export * from "./google";
export * from "./gemini";
export * from "./antigravity";
export * from "./document-tm";
export * from "./smart-detector";

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
    case "antigravity_cli":
      return new AntigravityCliTranslationProvider();
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
      return new GoogleTranslationProvider(
        settings.googleApiKey || process.env.GOOGLE_TRANSLATE_API_KEY
      );
    }
  }
}
