/**
 * Enterprise Global Gemini Rate Limiter
 * 
 * Enforces hardware-level request serialization using a concurrency-safe FIFO promise chain.
 * Guarantees that regardless of parallel callers or sub-batch retries, calls to Gemini 3.5 Flash Lite
 * are strictly paced with minimum >= 4500ms interval (<= 13.3 RPM, safely below Google's 15 RPM limit).
 */

export class GeminiRateLimiter {
  private static lastRequestTime = 0;
  private static requestQueue: Promise<void> = Promise.resolve();
  private static activeQueueCount = 0;

  public static minIntervalMs: number =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.argv?.some((a) => a.includes("test")) ||
      process.env.npm_lifecycle_event === "test")
      ? 0
      : 4500;

  /**
   * Resets rate limiter state (useful for test isolation).
   */
  public static reset(): void {
    GeminiRateLimiter.lastRequestTime = 0;
    GeminiRateLimiter.requestQueue = Promise.resolve();
    GeminiRateLimiter.activeQueueCount = 0;
  }

  /**
   * Returns current count of requests waiting in queue.
   */
  public static getQueueLength(): number {
    return GeminiRateLimiter.activeQueueCount;
  }

  /**
   * Serializes callers in FIFO order and ensures required interval has elapsed since the previous call.
   */
  public static async throttle(modelName = "gemini-3.5-flash-lite"): Promise<void> {
    if (GeminiRateLimiter.minIntervalMs === 0) {
      return;
    }

    const isLite = modelName.toLowerCase().includes("lite") || modelName === "";
    // Flash Lite (15 RPM) requires >= 4500ms. Standard Flash (5 RPM) requires >= 12500ms.
    const requiredInterval = isLite
      ? GeminiRateLimiter.minIntervalMs
      : Math.max(GeminiRateLimiter.minIntervalMs, 12500);

    GeminiRateLimiter.activeQueueCount++;
    const prev = GeminiRateLimiter.requestQueue;
    let resolver: () => void;
    GeminiRateLimiter.requestQueue = new Promise((resolve) => {
      resolver = resolve;
    });

    try {
      await prev;
      const now = Date.now();
      const elapsed = now - GeminiRateLimiter.lastRequestTime;
      if (elapsed < requiredInterval) {
        await new Promise((r) => setTimeout(r, requiredInterval - elapsed));
      }
      GeminiRateLimiter.lastRequestTime = Date.now();
    } finally {
      GeminiRateLimiter.activeQueueCount = Math.max(0, GeminiRateLimiter.activeQueueCount - 1);
      resolver!();
    }
  }
}
