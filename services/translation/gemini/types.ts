/**
 * Enterprise Gemini Translation Provider - Types & Error Definitions
 */

export enum GeminiErrorType {
  RATE_LIMIT_RPM = "RATE_LIMIT_RPM",
  RATE_LIMIT_RPD = "RATE_LIMIT_RPD",
  RATE_LIMIT_RPM_OR_UNKNOWN = "RATE_LIMIT_RPM_OR_UNKNOWN",
  AUTH_ERROR = "AUTH_ERROR",
  PERMISSION_ERROR = "PERMISSION_ERROR",
  INVALID_REQUEST = "INVALID_REQUEST",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  SERVER_5XX = "SERVER_5XX",
  NETWORK_ERROR = "NETWORK_ERROR",
  ECONNRESET = "ECONNRESET",
  TIMEOUT = "TIMEOUT",
  MALFORMED_JSON = "MALFORMED_JSON",
  EMPTY_RESPONSE = "EMPTY_RESPONSE",
  EMPTY_TRANSLATION = "EMPTY_TRANSLATION",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class GeminiError extends Error {
  readonly errorType: GeminiErrorType;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly model?: string;

  constructor(
    message: string,
    errorType: GeminiErrorType,
    httpStatus?: number,
    retryable = false,
    retryAfterSeconds?: number,
    model?: string
  ) {
    super(message);
    this.name = "GeminiError";
    this.errorType = errorType;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.model = model;
  }
}

/**
 * Backward-compatible GeminiRateLimitError.
 * Preserves code and retryAfterSeconds so existing tests and catch blocks work seamlessly.
 */
export class GeminiRateLimitError extends GeminiError {
  readonly code = "GEMINI_RATE_LIMIT";

  constructor(
    message: string,
    retryAfterSeconds?: number,
    errorType: GeminiErrorType = GeminiErrorType.RATE_LIMIT_RPM,
    model?: string
  ) {
    super(
      message,
      errorType,
      429,
      errorType !== GeminiErrorType.RATE_LIMIT_RPD,
      retryAfterSeconds,
      model
    );
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiQuotaExhaustedError extends GeminiError {
  readonly modelName: string;
  readonly used: number;
  readonly limit: number;

  constructor(modelName: string, used: number, limit: number) {
    super(
      `Gemini daily quota exhausted for model ${modelName} (${used}/${limit} requests used today).`,
      GeminiErrorType.RATE_LIMIT_RPD,
      429,
      false,
      undefined,
      modelName
    );
    this.name = "GeminiQuotaExhaustedError";
    this.modelName = modelName;
    this.used = used;
    this.limit = limit;
  }
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface ModelHealth {
  model: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  cooldownMs: number;
}

export interface QuotaUsageState {
  model: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  retriesConsumed: number;
  date: string;
}

export interface TranslationItemValidation {
  id: string;
  translatedText: string;
}

export interface ParseResult {
  items: TranslationItemValidation[];
  rawText: string;
  malformed: boolean;
  salvaged: boolean;
  wrapperDetected?: string;
  error?: string;
}
