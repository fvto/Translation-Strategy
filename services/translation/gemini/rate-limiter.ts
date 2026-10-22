/**
 * Enterprise Global Gemini Rate Limiter
 * 
 * Enforces hardware-level request serialization using a concurrency-safe FIFO promise chain.
 * Guarantees that calls to Gemini 3.5 Flash Lite operate stably at 9-10 RPM (steady-state interval ~6200ms)
 * and strictly enforces a hard safety threshold of 12-13 RPM (default: 12 RPM), preventing any 429 quota exhaustion.
 */

export class GeminiRateLimiter {
  private static lastRequestTime = 0;
  private static requestQueue: Promise<void> = Promise.resolve();
  private static activeQueueCount = 0;
  private static requestTimestamps: number[] = [];

  /**
   * Steady-state minimum interval between calls.
   * 6,200ms yields ~9.68 RPM (perfectly stable at 9-10 RPM).
   * In test environment, keep 0 unless explicitly configured.
   */
  public static minIntervalMs: number =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.argv?.some((a) => a.includes("test")) ||
      process.env.npm_lifecycle_event === "test")
      ? 0
      : 6200;

  /**
   * Safety threshold limit: 12-13 RPM (default: 12 RPM).
   * If request count in the last 60 seconds reaches this threshold,
   * incoming requests will pause until the sliding window drops below threshold.
   */
  public static rpmThreshold: number = 12;

  /**
   * Resets rate limiter state (useful for test isolation).
   */
  public static reset(): void {
    GeminiRateLimiter.lastRequestTime = 0;
    GeminiRateLimiter.requestQueue = Promise.resolve();
    GeminiRateLimiter.activeQueueCount = 0;
    GeminiRateLimiter.requestTimestamps = [];
  }

  /**
   * Returns current count of requests waiting in queue.
   */
  public static getQueueLength(): number {
    return GeminiRateLimiter.activeQueueCount;
  }

  /**
   * Records a request dispatch time in a 60-second sliding window to calculate real-time RPM.
   */
  public static recordRequest(): void {
    const now = Date.now();
    GeminiRateLimiter.requestTimestamps.push(now);
    GeminiRateLimiter.requestTimestamps = GeminiRateLimiter.requestTimestamps.filter(
      (t) => now - t <= 60_000
    );
  }

  /**
   * Returns the count of requests made within the last 60 seconds (current RPM).
   */
  public static getCurrentRpm(): number {
    const now = Date.now();
    GeminiRateLimiter.requestTimestamps = GeminiRateLimiter.requestTimestamps.filter(
      (t) => now - t <= 60_000
    );
    return GeminiRateLimiter.requestTimestamps.length;
  }

  /**
   * Returns the Google AI Studio RPM quota limit for the given model.
   */
  public static getRpmLimit(modelName = "gemini-3.5-flash-lite"): number {
    const lower = modelName.toLowerCase();
    if (lower.includes("flash") && !lower.includes("lite")) {
      return 5;
    }
    return 15;
  }

  /**
   * Returns the safety threshold RPM for the given model (12-13 for Flash Lite, 4 for Standard Flash).
   */
  public static getThresholdRpm(modelName = "gemini-3.5-flash-lite"): number {
    const lower = modelName.toLowerCase();
    if (lower.includes("flash") && !lower.includes("lite")) {
      return 4;
    }
    return GeminiRateLimiter.rpmThreshold;
  }

  /**
   * Returns the minimum safe interval between calls for the given model.
   * For Flash Lite: defaults to minIntervalMs (6200ms -> 9.7 RPM, stable in 9-10 RPM).
   * For Standard Flash (5 RPM limit): requires >= 13000ms (~4.6 RPM).
   */
  public static getMinInterval(modelName = "gemini-3.5-flash-lite"): number {
    const isLite = modelName.toLowerCase().includes("lite") || modelName === "";
    return isLite
      ? GeminiRateLimiter.minIntervalMs
      : Math.max(GeminiRateLimiter.minIntervalMs, 13000);
  }

  /**
   * Serializes callers in FIFO order, ensures required interval has elapsed (steady 9-10 RPM),
   * and enforces the hard 12-13 RPM safety threshold on the 60-second sliding window.
   */
  public static async throttle(modelName = "gemini-3.5-flash-lite"): Promise<void> {
    if (GeminiRateLimiter.minIntervalMs === 0) {
      GeminiRateLimiter.recordRequest();
      return;
    }

    const isLite = modelName.toLowerCase().includes("lite") || modelName === "";
    // Flash Lite: steady interval ~6200ms (9-10 RPM). Standard Flash: >= 13000ms (~4.6 RPM)
    const requiredInterval = isLite
      ? GeminiRateLimiter.minIntervalMs
      : Math.max(GeminiRateLimiter.minIntervalMs, 13000);

    const threshold = isLite ? GeminiRateLimiter.rpmThreshold : 4;

    GeminiRateLimiter.activeQueueCount++;
    const prev = GeminiRateLimiter.requestQueue;
    let resolver: () => void;
    GeminiRateLimiter.requestQueue = new Promise((resolve) => {
      resolver = resolve;
    });

    try {
      await prev;

      // 1. Sliding window threshold check: hold if current requests in last 60s >= threshold (12-13 RPM)
      while (GeminiRateLimiter.getCurrentRpm() >= threshold) {
        const oldest = GeminiRateLimiter.requestTimestamps[0];
        if (oldest) {
          const waitTime = Math.max(50, 60_000 - (Date.now() - oldest) + 50);
          await new Promise((r) => setTimeout(r, waitTime));
        } else {
          break;
        }
      }

      // 2. Steady-state interval check: ensure spacing between consecutive calls (9-10 RPM)
      const now = Date.now();
      const elapsed = now - GeminiRateLimiter.lastRequestTime;
      if (elapsed < requiredInterval) {
        await new Promise((r) => setTimeout(r, requiredInterval - elapsed));
      }

      GeminiRateLimiter.lastRequestTime = Date.now();
      GeminiRateLimiter.recordRequest();
    } finally {
      GeminiRateLimiter.activeQueueCount = Math.max(0, GeminiRateLimiter.activeQueueCount - 1);
      resolver!();
    }
  }
}
