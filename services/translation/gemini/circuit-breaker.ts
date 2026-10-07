import { CircuitState, GeminiError, GeminiErrorType, ModelHealth } from "./types";
import { GeminiQuotaManager } from "./quota-manager";

/**
 * Enterprise Model Circuit Breaker
 * 
 * Prevents the translation pipeline from falling into dead-model traps (e.g. permanently
 * getting stuck on gemini-3.5-flash after its 20/20 RPD is exhausted).
 * 
 * Circuit States:
 * - CLOSED: Model is healthy, eligible for requests.
 * - OPEN: Model is exhausted or experiencing hard failures. Bypassed immediately.
 * - HALF_OPEN: Model is being tested after cooldown expiry.
 */
export class GeminiCircuitBreaker {
  private static instance: GeminiCircuitBreaker;
  private healthMap: Map<string, ModelHealth> = new Map();

  private constructor() {}

  public static getInstance(): GeminiCircuitBreaker {
    if (!GeminiCircuitBreaker.instance) {
      GeminiCircuitBreaker.instance = new GeminiCircuitBreaker();
    }
    return GeminiCircuitBreaker.instance;
  }

  private normalizeKey(model: string): string {
    const lower = model.toLowerCase().trim();
    if (lower.includes("lite")) return "gemini-3.5-flash-lite";
    if (lower.includes("flash")) return "gemini-3.5-flash";
    return lower || "gemini-3.5-flash-lite";
  }

  private getHealth(model: string): ModelHealth {
    const key = this.normalizeKey(model);
    let health = this.healthMap.get(key);
    if (!health) {
      health = {
        model: key,
        state: "CLOSED",
        consecutiveFailures: 0,
        lastFailureTime: 0,
        cooldownMs: 60_000, // 1 min default cooldown
      };
      this.healthMap.set(key, health);
    }
    return health;
  }

  /**
   * Checks if a model's circuit allows requests.
   */
  public isModelAvailable(model: string): boolean {
    const key = this.normalizeKey(model);
    const quotaManager = GeminiQuotaManager.getInstance();

    // If quota manager confirms RPD is 0, circuit is definitely OPEN
    if (!quotaManager.canRequest(key)) {
      this.getHealth(key).state = "OPEN";
      return false;
    }

    const health = this.getHealth(key);
    if (health.state === "CLOSED") {
      return true;
    }

    if (health.state === "OPEN") {
      const elapsed = Date.now() - health.lastFailureTime;
      if (elapsed >= health.cooldownMs) {
        health.state = "HALF_OPEN";
        return true;
      }
      return false;
    }

    // HALF_OPEN allows a single probe call
    return true;
  }

  /**
   * Records a successful response for a model, resetting its failure counters.
   */
  public recordSuccess(model: string): void {
    const health = this.getHealth(model);
    health.state = "CLOSED";
    health.consecutiveFailures = 0;
    health.lastFailureTime = 0;
  }

  /**
   * Records a failure and updates circuit breaker state.
   */
  public recordFailure(model: string, error: GeminiError): void {
    const key = this.normalizeKey(model);
    const health = this.getHealth(key);
    health.lastFailureTime = Date.now();
    health.consecutiveFailures += 1;

    // RPD exhaustion: Open circuit immediately with 24-hour cooldown
    if (error.errorType === GeminiErrorType.RATE_LIMIT_RPD) {
      health.state = "OPEN";
      health.cooldownMs = 24 * 60 * 60 * 1000;
      GeminiQuotaManager.getInstance().markExhausted(key);
      console.warn(`[GeminiCircuitBreaker] Opened circuit for ${key} due to RPD quota exhaustion.`);
      return;
    }

    // Permanent errors (Model not found, Auth, Permission): Open circuit
    if (
      error.errorType === GeminiErrorType.MODEL_NOT_FOUND ||
      error.errorType === GeminiErrorType.AUTH_ERROR ||
      error.errorType === GeminiErrorType.PERMISSION_ERROR
    ) {
      health.state = "OPEN";
      health.cooldownMs = 60 * 60 * 1000; // 1 hour
      return;
    }

    // Temporary RPM or 5xx: after 4 consecutive failures, back off model for 2 minutes
    if (health.consecutiveFailures >= 4) {
      health.state = "OPEN";
      health.cooldownMs = 120_000; // 2 minutes
    }
  }

  /**
   * Returns healthy candidate models in priority order.
   * Never includes models with OPEN circuit unless all models are open.
   */
  public getCandidateModels(requestedModel?: string): string[] {
    const envModel = process.env.GEMINI_MODEL || "";
    const primary = this.normalizeKey(requestedModel || envModel || "gemini-3.5-flash-lite");
    const secondary = primary.includes("lite") ? "gemini-3.5-flash" : "gemini-3.5-flash-lite";

    const candidates = [primary, secondary];
    const available = candidates.filter((m) => this.isModelAvailable(m));

    // If both are open or none available, fallback to primary to let rate limiter / quota guard handle
    return available.length > 0 ? available : [primary];
  }

  public reset(): void {
    this.healthMap.clear();
  }
}
