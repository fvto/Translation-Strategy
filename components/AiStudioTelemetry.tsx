"use client";

import React, { useState } from "react";
import {
  Activity,
  Zap,
  Gauge,
  Clock,
  Coins,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info,
  Server,
  RefreshCw,
} from "lucide-react";
import { AiStudioMetrics } from "@/services/translation/types";

interface AiStudioTelemetryProps {
  metrics: AiStudioMetrics | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const AiStudioTelemetry: React.FC<AiStudioTelemetryProps> = ({
  metrics,
  isLoading = false,
  onRefresh,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!metrics && !isLoading) {
    return null;
  }

  const currentRpm = metrics?.rpm.current ?? 0;
  const maxRpm = metrics?.rpm.limit ?? 15;
  const rpmPercent = Math.min(100, Math.round((currentRpm / maxRpm) * 100));

  const usedRpd = metrics?.rpd.used ?? 0;
  const limitRpd = metrics?.rpd.limit ?? 500;
  const remainingRpd = metrics?.rpd.remaining ?? 500;
  const rpdPercent = metrics?.rpd.percentRemaining ?? 100;

  return (
    <div className="bg-white dark:bg-[#11141c] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Thông số Google AI Studio (Live Telemetry)
              </h3>
              <span className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Hoạt động</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Kiểm soát tự động giới hạn tốc độ gọi &amp; hạn ngạch API thời gian thực
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {metrics?.model && (
            <span className="text-[11px] font-mono font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>
                {metrics.model.includes("3.8")
                  ? "gemini-3.5-flash-lite & gemini-3.1-flash-lite"
                  : metrics.model}
              </span>
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              type="button"
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-40 cursor-pointer"
              title="Làm mới chỉ số"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: RPM */}
        <div className="bg-slate-50/80 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-blue-500" />
              <span>Tốc độ gọi (RPM)</span>
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ≤ {maxRpm} RPM
            </span>
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {currentRpm}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {maxRpm} RPM</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                rpmPercent > 80 ? "bg-amber-500" : "bg-blue-500"
              }`}
              style={{ width: `${Math.max(8, rpmPercent)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Giãn cách:</span>
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              ≥ {((metrics?.rpm.minIntervalMs ?? 4500) / 1000).toFixed(1)}s / req
            </span>
          </div>
        </div>

        {/* Card 2: RPD Daily Quota */}
        <div className="bg-slate-50/80 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Hạn mức ngày (RPD)</span>
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {rpdPercent}%
            </span>
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {usedRpd}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {limitRpd} lượt</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (usedRpd / limitRpd) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Còn lại hôm nay:</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {remainingRpd}
            </span>
          </div>
        </div>

        {/* Card 3: Tokens */}
        <div className="bg-slate-50/80 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-indigo-500" />
              <span>Token tiêu thụ</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">TPM: 1M</span>
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics?.tokens ? metrics.tokens.totalTokens.toLocaleString() : "—"}
            </span>
            <span className="text-xs text-slate-400 font-mono">tokens</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Đầu vào / Đầu ra:</span>
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {metrics?.tokens
                ? `${metrics.tokens.promptTokens} / ${metrics.tokens.candidatesTokens}`
                : "Tự động đo"}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            Hạn ngạch Google: 1,000,000 TPM
          </div>
        </div>

        {/* Card 4: Latency & Defense */}
        <div className="bg-slate-50/80 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-500" />
              <span>Thời gian phản hồi</span>
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>OK</span>
            </span>
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics ? (metrics.latencyMs / 1000).toFixed(2) : "—"}
            </span>
            <span className="text-xs text-slate-400 font-mono">giây</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Hàng đợi điều tiết:</span>
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {metrics?.queueLength ?? 0} đang chờ
            </span>
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            Chống 429: Pacing FIFO kích hoạt
          </div>
        </div>
      </div>

      {/* Expandable Technical Details */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-2">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-1 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Chi tiết cơ chế kiểm soát RPM &amp; Bảo vệ hạn ngạch AI Studio</span>
          </span>
          {showDetails ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showDetails && (
          <div className="mt-2 text-xs bg-slate-50 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
            <div className="flex items-start space-x-2">
              <Server className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-800 dark:text-slate-100">
                  Cơ chế tự động điều tiết (Hardware Pacing):
                </strong>{" "}
                Google AI Studio áp dụng hạn ngạch trần 15 RPM (Requests Per Minute). Hệ thống được lập trình hàng đợi FIFO với độ trễ bắt buộc ≥ 4.5 giây giữa mỗi yêu cầu, tương đương trần an toàn 13.3 RPM, giúp ngăn chặn 100% mã lỗi 429 (Too Many Requests).
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-800 dark:text-slate-100">
                  Hạn ngạch hàng ngày (RPD):
                </strong>{" "}
                Mô hình Gemini 3.5 Flash Lite và Gemini 3.1 Flash Lite cung cấp 500 yêu cầu miễn phí/ngày (được theo dõi qua tệp lưu trữ nội bộ). Hạn ngạch được tự động đặt lại vào 00:00 UTC (07:00 sáng theo giờ Việt Nam).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
