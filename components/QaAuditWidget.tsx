"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Zap,
} from "lucide-react";
import { QaAuditReport } from "@/services/qa/compliance-scorer";

interface QaAuditWidgetProps {
  report: QaAuditReport;
}

export const QaAuditWidget: React.FC<QaAuditWidgetProps> = ({ report }) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"auto_repaired" | "violations">("auto_repaired");

  const { breakdown, violations, autoRepairedItems } = report;

  const gradeColors = {
    "A+": "bg-emerald-950/80 border-emerald-500/50 text-emerald-300 ring-emerald-500/20",
    A: "bg-emerald-950/60 border-emerald-600/40 text-emerald-300 ring-emerald-600/20",
    B: "bg-amber-950/60 border-amber-600/40 text-amber-300 ring-amber-600/20",
    C: "bg-rose-950/60 border-rose-600/40 text-rose-300 ring-rose-600/20",
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-[#0b101d] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5 animate-in fade-in duration-300">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Báo Cáo Nghiệm Thu Chất Lượng (Post-Flight QA Audit)
                </h3>
                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full">
                  Ching Luh SOP Gate
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Kiểm định tự động theo 4 tiêu chuẩn khắt khe: Zero Leakage, Nike SPI, CTQ Noun-Adjunct &amp; Formatting Parity.
              </p>
            </div>
          </div>
        </div>

        {/* Big Overall Grade Badge */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className={`px-4 py-2.5 rounded-2xl border ring-1 flex items-center space-x-2.5 shadow-lg ${gradeColors[breakdown.grade]}`}>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Điểm Tuân Thủ: {breakdown.overallScore}/100
              </div>
              <div className="text-[11px] font-semibold opacity-90">
                Grade {breakdown.grade} • SOP Compliant
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Compliance Breakdown Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Zero Vietnamese Leakage */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">1. Zero VN Leakage (40%)</span>
            <span className="font-mono font-bold text-emerald-400">
              {breakdown.vietnameseLeakageScore}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full"
              style={{ width: `${breakdown.vietnameseLeakageScore}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {breakdown.vietnameseLeakageScore === 100
              ? "100% sạch dấu tiếng Việt"
              : "Có ký tự tiếng Việt lọt bản dịch"}
          </p>
        </div>

        {/* Metric 2: Nike SPI Standard */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">2. Nike SPI Format (20%)</span>
            <span className="font-mono font-bold text-blue-400">
              {breakdown.spiComplianceScore}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full"
              style={{ width: `${breakdown.spiComplianceScore}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {breakdown.spiComplianceScore === 100
              ? "SPI <n> stitches/inch chuẩn"
              : "Cần chuẩn hóa format SPI"}
          </p>
        </div>

        {/* Metric 3: CTQ Noun-Adjunct Order */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">3. CTQ Noun Order (20%)</span>
            <span className="font-mono font-bold text-amber-400">
              {breakdown.nounAdjunctScore}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full"
              style={{ width: `${breakdown.nounAdjunctScore}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {breakdown.nounAdjunctScore === 100
              ? "Tip/Toe/Heel shape chuẩn"
              : "Không dùng Shape [Part]"}
          </p>
        </div>

        {/* Metric 4: Formatting & Bold Parity */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">4. Format Parity (20%)</span>
            <span className="font-mono font-bold text-teal-400">
              {breakdown.formattingParityScore}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-teal-500 h-1.5 rounded-full"
              style={{ width: `${breakdown.formattingParityScore}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            Bảo toàn tiêu đề (*Buffing:)
          </p>
        </div>
      </div>

      {/* Summary Note & Details Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-slate-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>{breakdown.summary}</span>
        </p>

        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
        >
          <span>{showDetails ? "Ẩn Chi Tiết Nghiệm Thu" : "Xem Chi Tiết Tự Động Sửa Lỗi"}</span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded Accordion Details */}
      {showDetails && (
        <div className="pt-4 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
          {/* Subtabs */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab("auto_repaired")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "auto_repaired"
                  ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vị Trí Đã Tự Động Sửa Chuẩn SOP ({autoRepairedItems.length})</span>
            </button>

            {violations.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("violations")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "violations"
                    ? "bg-amber-600/30 text-amber-300 border border-amber-500/40"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Cảnh Báo Cần Lưu Ý ({violations.length})</span>
              </button>
            )}
          </div>

          {/* Tab 1: Auto-Repaired Items */}
          {activeTab === "auto_repaired" && (
            <div className="space-y-2">
              {autoRepairedItems.length === 0 ? (
                <div className="p-4 bg-slate-950/40 rounded-xl text-xs text-slate-500 text-center">
                  Không có vị trí nào cần can thiệp tự động sửa lỗi.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {autoRepairedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Slide {item.slideIndex}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{item.rule}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-slate-400 text-[11px] truncate">
                          <span className="text-slate-500">Gốc:</span> {item.original}
                        </div>
                        <div className="text-emerald-300 font-medium text-[11px] truncate flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>{item.repaired}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Violations */}
          {activeTab === "violations" && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Slide {v.slideIndex}
                        </span>
                        <span className="font-semibold text-slate-200">{v.title}</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{v.description}</p>
                      <p className="text-slate-500 italic text-[11px] font-mono bg-slate-900/60 p-1.5 rounded">
                        &ldquo;{v.snippet}&rdquo;
                      </p>
                    </div>

                    {v.suggestedFix && (
                      <div className="shrink-0 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2 py-1 rounded-lg text-[11px] font-mono font-semibold">
                        Gợi ý: {v.suggestedFix}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
