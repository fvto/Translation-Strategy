import { NextResponse } from "next/server";
import { GeminiRateLimiter } from "@/services/translation/gemini/rate-limiter";
import { GeminiQuotaManager } from "@/services/translation/gemini/quota-manager";
import { GeminiObservability } from "@/services/translation/gemini/observability";

export async function GET() {
  const envModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const modelKey = envModel.includes("3.8") ? "gemini-3.5-flash-lite" : envModel;
  const quotaManager = GeminiQuotaManager.getInstance();
  const quotaState = quotaManager.getQuotaState(modelKey);
  const minInterval = GeminiRateLimiter.getMinInterval(modelKey);
  const safeRpm = minInterval > 0 ? Math.round((60000 / minInterval) * 10) / 10 : 15;
  const observability = GeminiObservability.getInstance().getMetrics();

  return NextResponse.json({
    model: "gemini-3.5-flash-lite & gemini-3.1-flash-lite",
    primaryModel: "gemini-3.5-flash-lite",
    fallbackModel: "gemini-3.1-flash-lite",
    rpm: {
      current: GeminiRateLimiter.getCurrentRpm(),
      limit: GeminiRateLimiter.getRpmLimit(modelKey),
      minIntervalMs: minInterval,
      safetyRateRpm: safeRpm,
    },
    rpd: {
      used: quotaState.used,
      limit: quotaState.dailyLimit,
      remaining: quotaState.remaining,
      percentRemaining: Math.round((quotaState.remaining / quotaState.dailyLimit) * 100),
      date: quotaState.date,
    },
    observability,
    queueLength: GeminiRateLimiter.getQueueLength(),
    timestamp: Date.now(),
  });
}
