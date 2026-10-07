import { GeminiError, GeminiErrorType } from "./types";

export interface SessionMetrics {
  totalInputItems: number;
  geminiSuccessfulItems: number;
  geminiRetryCount: number;
  malformedJsonCount: number;
  partialResponseCount: number;
  missingIdCount: number;
  recoveredIdCount: number;
  nmtFallbackCount: number;
  rateLimitRpmCount: number;
  rateLimitRpdCount: number;
  networkErrorCount: number;
  timeoutCount: number;
  totalGeminiRequests: number;
  totalElapsedMs: number;
}

/**
 * Enterprise Structured Observability for Gemini
 * Logs standardized metrics and diagnostics without leaking sensitive data or API keys.
 */
export class GeminiObservability {
  private static instance: GeminiObservability;

  private metrics: SessionMetrics = {
    totalInputItems: 0,
    geminiSuccessfulItems: 0,
    geminiRetryCount: 0,
    malformedJsonCount: 0,
    partialResponseCount: 0,
    missingIdCount: 0,
    recoveredIdCount: 0,
    nmtFallbackCount: 0,
    rateLimitRpmCount: 0,
    rateLimitRpdCount: 0,
    networkErrorCount: 0,
    timeoutCount: 0,
    totalGeminiRequests: 0,
    totalElapsedMs: 0,
  };

  private constructor() {}

  public static getInstance(): GeminiObservability {
    if (!GeminiObservability.instance) {
      GeminiObservability.instance = new GeminiObservability();
    }
    return GeminiObservability.instance;
  }

  public logRequest(diag: {
    requestId: string;
    batchId?: string | number;
    model: string;
    itemCount: number;
    attempt: number;
  }): void {
    this.metrics.totalGeminiRequests += 1;
    if (diag.attempt > 1) {
      this.metrics.geminiRetryCount += 1;
    }
    console.log(
      `[GeminiRequest] requestId=${diag.requestId} batchId=${diag.batchId ?? "none"} model=${diag.model} items=${diag.itemCount} attempt=${diag.attempt}`
    );
  }

  public logResponse(diag: {
    requestId: string;
    batchId?: string | number;
    status: number;
    elapsedMs: number;
    parsedItems: number;
    missingItems: number;
    wrapperDetected?: string;
  }): void {
    this.metrics.geminiSuccessfulItems += diag.parsedItems;
    this.metrics.missingIdCount += diag.missingItems;
    if (diag.missingItems > 0 && diag.parsedItems > 0) {
      this.metrics.partialResponseCount += 1;
    }
    const wrapperInfo = diag.wrapperDetected ? ` wrapper=${diag.wrapperDetected}` : "";
    console.log(
      `[GeminiResponse] requestId=${diag.requestId} batchId=${diag.batchId ?? "none"} status=${diag.status} elapsedMs=${diag.elapsedMs} parsedItems=${diag.parsedItems} missingItems=${diag.missingItems}${wrapperInfo}`
    );
  }

  public logError(diag: {
    requestId: string;
    batchId?: string | number;
    model: string;
    attempt: number;
    error: GeminiError;
    elapsedMs: number;
  }): void {
    switch (diag.error.errorType) {
      case GeminiErrorType.RATE_LIMIT_RPM:
      case GeminiErrorType.RATE_LIMIT_RPM_OR_UNKNOWN:
        this.metrics.rateLimitRpmCount += 1;
        break;
      case GeminiErrorType.RATE_LIMIT_RPD:
        this.metrics.rateLimitRpdCount += 1;
        break;
      case GeminiErrorType.ECONNRESET:
      case GeminiErrorType.NETWORK_ERROR:
        this.metrics.networkErrorCount += 1;
        break;
      case GeminiErrorType.TIMEOUT:
        this.metrics.timeoutCount += 1;
        break;
      case GeminiErrorType.MALFORMED_JSON:
        this.metrics.malformedJsonCount += 1;
        break;
    }

    console.warn(
      `[GeminiError] requestId=${diag.requestId} batchId=${diag.batchId ?? "none"} model=${diag.model} attempt=${diag.attempt} errorType=${diag.error.errorType} httpStatus=${diag.error.httpStatus ?? "none"} elapsedMs=${diag.elapsedMs}`
    );
  }

  public recordRecovered(count: number): void {
    this.metrics.recoveredIdCount += count;
  }

  public recordNmtFallback(count: number): void {
    this.metrics.nmtFallbackCount += count;
  }

  public addInputItems(count: number): void {
    this.metrics.totalInputItems += count;
  }

  public getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  public formatReport(): string {
    const m = this.metrics;
    return [
      "==================== GEMINI TRANSLATION METRICS ====================",
      `Total Input Items:          ${m.totalInputItems}`,
      `Gemini Successful Items:    ${m.geminiSuccessfulItems}`,
      `Gemini API Requests:        ${m.totalGeminiRequests}`,
      `Retry Count:                ${m.geminiRetryCount}`,
      `Missing IDs (Transient):    ${m.missingIdCount}`,
      `Recovered IDs:              ${m.recoveredIdCount}`,
      `Google NMT Fallbacks:       ${m.nmtFallbackCount}`,
      `429 Rate Limit (RPM):       ${m.rateLimitRpmCount}`,
      `429 Quota Limit (RPD):       ${m.rateLimitRpdCount}`,
      `Network / Socket Drops:     ${m.networkErrorCount}`,
      `Timeouts:                   ${m.timeoutCount}`,
      `Malformed JSON (Repaired):  ${m.malformedJsonCount}`,
      "====================================================================",
    ].join("\n");
  }

  public reset(): void {
    this.metrics = {
      totalInputItems: 0,
      geminiSuccessfulItems: 0,
      geminiRetryCount: 0,
      malformedJsonCount: 0,
      partialResponseCount: 0,
      missingIdCount: 0,
      recoveredIdCount: 0,
      nmtFallbackCount: 0,
      rateLimitRpmCount: 0,
      rateLimitRpdCount: 0,
      networkErrorCount: 0,
      timeoutCount: 0,
      totalGeminiRequests: 0,
      totalElapsedMs: 0,
    };
  }
}
