import fs from "fs";
import path from "path";
import { QuotaUsageState, GeminiQuotaExhaustedError } from "./types";

/**
 * Enterprise Daily Quota Manager
 * 
 * Tracks in-process and file-persisted daily API requests against Google AI Studio quotas:
 * - gemini-3.5-flash-lite: 500 RPD
 * - gemini-3.5-flash: 20 RPD
 * 
 * Automatically resets when the calendar day changes.
 * Prevents unnecessary API calls when a model is known to be exhausted.
 */
export class GeminiQuotaManager {
  private static instance: GeminiQuotaManager;
  private readonly storagePath: string;

  private defaultLimits: Record<string, number> = {
    "gemini-3.5-flash-lite": 500,
    "gemini-3.5-flash": 20,
    "gemini-2.5-flash": 20,
    "gemini-2.0-flash": 20,
    "gemini-1.5-flash": 20,
  };

  private memoryState: Map<string, QuotaUsageState> = new Map();

  private constructor() {
    this.storagePath = path.resolve(process.cwd(), "data", "gemini_quota_tracker.json");
    this.loadFromDisk();
  }

  public static getInstance(): GeminiQuotaManager {
    if (!GeminiQuotaManager.instance) {
      GeminiQuotaManager.instance = new GeminiQuotaManager();
    }
    return GeminiQuotaManager.instance;
  }

  private getTodayDateKey(): string {
    // Uses UTC date key for deterministic daily quota tracking
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeModelKey(modelName: string): string {
    const lower = modelName.toLowerCase().trim();
    if (lower.includes("lite")) return "gemini-3.5-flash-lite";
    if (lower.includes("flash")) return "gemini-3.5-flash";
    return lower || "gemini-3.5-flash-lite";
  }

  public getDailyLimit(modelName: string): number {
    const key = this.normalizeModelKey(modelName);
    return this.defaultLimits[key] ?? 500;
  }

  private loadFromDisk(): void {
    const today = this.getTodayDateKey();
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [m, data] of Object.entries<any>(parsed)) {
            if (data.date === today) {
              const limit = this.getDailyLimit(m);
              const used = Math.max(0, Number(data.used) || 0);
              this.memoryState.set(m, {
                model: m,
                dailyLimit: limit,
                used,
                remaining: Math.max(0, limit - used),
                retriesConsumed: Math.max(0, Number(data.retriesConsumed) || 0),
                date: today,
              });
            }
          }
        }
      }
    } catch {
      // In case of read/parse error, memory fallback starts clean
    }
  }

  private persistToDisk(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const serializable: Record<string, QuotaUsageState> = {};
      for (const [k, v] of this.memoryState.entries()) {
        serializable[k] = v;
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(serializable, null, 2), "utf-8");
    } catch {
      // Non-fatal write error
    }
  }

  public getQuotaState(modelName: string): QuotaUsageState {
    const key = this.normalizeModelKey(modelName);
    const today = this.getTodayDateKey();
    let state = this.memoryState.get(key);

    if (!state || state.date !== today) {
      const limit = this.getDailyLimit(key);
      state = {
        model: key,
        dailyLimit: limit,
        used: 0,
        remaining: limit,
        retriesConsumed: 0,
        date: today,
      };
      this.memoryState.set(key, state);
    }

    return { ...state };
  }

  public canRequest(modelName: string): boolean {
    const state = this.getQuotaState(modelName);
    return state.remaining > 0;
  }

  /**
   * Asserts quota is available before initiating request. Throws GeminiQuotaExhaustedError if not.
   */
  public assertQuotaAvailable(modelName: string): void {
    const state = this.getQuotaState(modelName);
    if (state.remaining <= 0) {
      throw new GeminiQuotaExhaustedError(state.model, state.used, state.dailyLimit);
    }
  }

  /**
   * Records an API request consumption.
   */
  public recordRequest(modelName: string, isRetry = false): void {
    const key = this.normalizeModelKey(modelName);
    const state = this.getQuotaState(key);
    state.used += 1;
    state.remaining = Math.max(0, state.dailyLimit - state.used);
    if (isRetry) {
      state.retriesConsumed += 1;
    }
    this.memoryState.set(key, state);
    this.persistToDisk();
  }

  /**
   * Manually sets used count (e.g., when API returns daily quota exhaustion).
   */
  public markExhausted(modelName: string): void {
    const key = this.normalizeModelKey(modelName);
    const state = this.getQuotaState(key);
    state.used = state.dailyLimit;
    state.remaining = 0;
    this.memoryState.set(key, state);
    this.persistToDisk();
  }

  public setUsed(modelName: string, count: number): void {
    const key = this.normalizeModelKey(modelName);
    const state = this.getQuotaState(key);
    state.used = count;
    state.remaining = Math.max(0, state.dailyLimit - count);
    this.memoryState.set(key, state);
    this.persistToDisk();
  }

  public reset(): void {
    this.memoryState.clear();
    this.persistToDisk();
  }
}
