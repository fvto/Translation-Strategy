import { TerminologyEntry } from "../database/types";

export interface TranslationRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  approvedTerminology: TerminologyEntry[];
  context?: string;
}

export interface TranslationResponse {
  translatedText: string;
  provider: string;
  durationMs: number;
  modelName?: string;
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
}

export interface TranslationProvider {
  name: string;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  translateBatch?(request: BatchTranslationRequest): Promise<BatchTranslationResponse>;
}
