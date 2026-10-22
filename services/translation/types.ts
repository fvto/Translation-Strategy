import { TerminologyEntry } from "../database/types";

export interface TranslationRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  approvedTerminology: TerminologyEntry[];
  context?: string;
}

export interface AiStudioMetrics {
  model: string;
  rpm: {
    current: number;
    limit: number;
    minIntervalMs: number;
    safetyRateRpm: number;
    thresholdRpm?: number;
  };
  rpd: {
    used: number;
    limit: number;
    remaining: number;
    percentRemaining: number;
    date: string;
  };
  tokens?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
    tpmLimit: number;
  };
  latencyMs: number;
  status: "HEALTHY" | "RATE_LIMITED" | "FALLBACK" | "COOLDOWN";
  queueLength: number;
  timestamp: number;
}

export interface TranslationResponse {
  translatedText: string;
  provider: string;
  durationMs: number;
  modelName?: string;
  aiStudioMetrics?: AiStudioMetrics;
}

export interface BatchTranslationItem {
  id: string;
  sourceText: string;
}

export interface BatchTranslationRequest {
  items: BatchTranslationItem[];
  sourceLanguage: string;
  targetLanguage: string;
  approvedTerminology: TerminologyEntry[];
  context?: string;
}

export interface BatchTranslationResponse {
  results: Map<string, string>;
  provider: string;
  durationMs: number;
  modelName?: string;
  aiStudioMetrics?: AiStudioMetrics;
}

export interface TranslationProvider {
  name: string;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  translateBatch?(request: BatchTranslationRequest): Promise<BatchTranslationResponse>;
}
