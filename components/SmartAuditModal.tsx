"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  Lock,
  RefreshCw,
  X,
  ArrowRight,
  Eye,
  Check,
  Filter,
  FileText,
  Zap,
} from "lucide-react";
import { SmartAuditReport, ScannedTextUnit, TextUnitStatus } from "@/services/translation/smart-detector";

interface SmartAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditReport: SmartAuditReport | null;
  onTranslateMissingOnly: (selectedUnitIds?: string[]) => void;
  onTranslateAll?: () => void;
  isLoading?: boolean;
}

export const SmartAuditModal: React.FC<SmartAuditModalProps> = ({
  isOpen,
  onClose,
  auditReport,
  onTranslateMissingOnly,
  onTranslateAll,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<"summary" | "review">("summary");
  const [slideFilter, setSlideFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Manage selection of units for translation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (!auditReport) return new Set();
    return new Set(
      auditReport.units
        .filter((u) => u.status === "NEEDS_TRANSLATION")
        .map((u) => u.id)
    );
  });

  // Re-initialize selections when auditReport changes
  React.useEffect(() => {
    if (auditReport) {
      setSelectedIds(
        new Set(
          auditReport.units
            .filter((u) => u.status === "NEEDS_TRANSLATION")
            .map((u) => u.id)
        )
      );
    }
  }, [auditReport]);

  // Filtered units for the Review view (called unconditionally before early return)
  const filteredUnits = useMemo(() => {
    if (!auditReport) return [];
    return auditReport.units.filter((unit) => {
      if (slideFilter !== "all") {
        const slideNum = parseInt(slideFilter, 10);
        if (unit.location.slideIndex !== slideNum) return false;
      }
      if (statusFilter !== "all" && unit.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSrc = unit.sourceText.toLowerCase().includes(q);
        const matchTrans = (unit.suggestedTranslation || "").toLowerCase().includes(q);
        if (!matchSrc && !matchTrans) return false;
      }
      return true;
    });
  }, [auditReport, slideFilter, statusFilter, searchQuery]);

  // Group units by slide or sheet (called unconditionally before early return)
  const groupedUnits = useMemo(() => {
    const map = new Map<number | string, ScannedTextUnit[]>();
    for (const unit of filteredUnits) {
      const groupKey = unit.location.slideIndex ?? unit.location.sheetName ?? 1;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(unit);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (typeof a[0] === "number" && typeof b[0] === "number") return a[0] - b[0];
      return String(a[0]).localeCompare(String(b[0]));
    });
  }, [filteredUnits]);

  if (!isOpen || !auditReport) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllMissing = () => {
    const next = new Set(selectedIds);
    auditReport.units
      .filter((u) => u.status === "NEEDS_TRANSLATION")
      .forEach((u) => next.add(u.id));
    setSelectedIds(next);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const getStatusBadge = (status: TextUnitStatus) => {
    switch (status) {
      case "ALREADY_TRANSLATED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Đã dịch (Skip)
          </span>
        );
      case "NEEDS_TRANSLATION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Sparkles className="w-3 h-3" /> Cần dịch (Mới)
          </span>
        );
      case "TM_REUSE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <RefreshCw className="w-3 h-3" /> Tái sử dụng TM (0 API)
          </span>
        );
      case "LOCKED_TERMINOLOGY":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Lock className="w-3 h-3" /> Thuật ngữ khóa
          </span>
        );
      case "NON_TRANSLATABLE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <ShieldCheck className="w-3 h-3" /> Thuật ngữ kỹ thuật / Mã
          </span>
        );
      case "MIXED_LANGUAGE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Layers className="w-3 h-3" /> Song ngữ hỗn hợp
          </span>
        );
      case "REVIEW_REQUIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" /> Cần xem lại
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-500 border border-slate-500/20">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      id="smart-audit-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="smart-audit-modal-container"
        className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  SMART TRANSLATION AUDIT
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                  Gap Scanner
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tệp: <span className="font-semibold text-slate-700 dark:text-slate-300">{auditReport.fileName}</span> •{" "}
                {auditReport.totalSlides > 0 ? `${auditReport.totalSlides} slides scanned` : `${auditReport.totalSheets} sheets scanned`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Đóng (Hủy)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-100/60 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("summary")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "summary"
                  ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Tổng quan Kiểm toán ({auditReport.totalUnits} đơn vị)
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "review"
                  ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Chi tiết từng Slide ({auditReport.needsTranslationCount} cần dịch)
            </button>
          </div>

          {activeTab === "review" && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAllMissing}
                className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
              >
                Chọn tất cả {auditReport.needsTranslationCount} mục cần dịch
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                onClick={deselectAll}
                className="text-slate-500 hover:underline"
              >
                Bỏ chọn hết
              </button>
            </div>
          )}
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "summary" ? (
            <div className="space-y-6">
              {/* Stat grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Already translated */}
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Đã dịch sẵn (Skip)
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                    {auditReport.alreadyTranslatedCount}
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                    Bảo toàn 100% không đổi
                  </p>
                </div>

                {/* New / untranslated */}
                <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Mới / Chưa dịch
                    </span>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-400">
                    {auditReport.needsTranslationCount}
                  </div>
                  <p className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80">
                    Chỉ gửi số này tới Gemini
                  </p>
                </div>

                {/* TM reusable */}
                <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
                      Tái sử dụng TM
                    </span>
                    <RefreshCw className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-sky-700 dark:text-sky-400">
                    {auditReport.tmReusableCount}
                  </div>
                  <p className="mt-1 text-[11px] text-sky-600/80 dark:text-sky-400/80">
                    Khớp từ các slide trước (0 API)
                  </p>
                </div>

                {/* Non-translatable */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Thuật ngữ / Mã / Số
                    </span>
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-700 dark:text-slate-300">
                    {auditReport.nonTranslatableCount}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    IPQC, ISQ, SPI, ngày, số...
                  </p>
                </div>
              </div>

              {/* Affected Slides Callout */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-transparent border border-sky-500/20">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-sky-500" />
                      Các Slide Chứa Nội Dung Mới Cần Dịch
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Hệ thống đã quét toàn diện toàn bộ {auditReport.totalSlides} slide và phát hiện nội dung chưa dịch chỉ nằm trên các slide sau:
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {auditReport.affectedSlides.length > 0 ? (
                        auditReport.affectedSlides.map((sNum) => {
                          const count = auditReport.units.filter(
                            (u) => u.location.slideIndex === sNum && u.status === "NEEDS_TRANSLATION"
                          ).length;
                          return (
                            <button
                              key={sNum}
                              onClick={() => {
                                setSlideFilter(String(sNum));
                                setActiveTab("review");
                              }}
                              className="px-3 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 shadow-sm hover:scale-105 transition-all"
                            >
                              Slide {sNum} ({count} mục)
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ✓ Không có slide nào thiếu dịch. Toàn bộ file đã được dịch hoàn chỉnh!
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right pl-4">
                    <span className="text-xs text-slate-500">Dự kiến request Gemini</span>
                    <div className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">
                      {auditReport.estimatedGeminiRequests}{" "}
                      <span className="text-xs font-normal text-slate-500">gói (25/gói)</span>
                    </div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Tiết kiệm ~{Math.round(((auditReport.totalUnits - auditReport.needsTranslationCount) / Math.max(1, auditReport.totalUnits)) * 100)}% quota
                    </span>
                  </div>
                </div>
              </div>

              {/* Protection guarantee notice */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  <strong className="text-slate-800 dark:text-slate-200">Cam kết bảo toàn bản dịch:</strong> Khi chọn{" "}
                  <strong className="text-sky-600 dark:text-sky-400">Translate Missing Only</strong>, toàn bộ{" "}
                  {auditReport.alreadyTranslatedCount} đơn vị đã có bản dịch cùng định dạng in đậm, màu sắc, font chữ và các slide cũ{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">sẽ được giữ nguyên 100%</strong>, không bao giờ bị ghi đè hay làm mất công sức trước đó.
                </div>
              </div>
            </div>
          ) : (
            /* Review tab */
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-slate-600 dark:text-slate-400">Lọc slide:</span>
                  <select
                    value={slideFilter}
                    onChange={(e) => setSlideFilter(e.target.value)}
                    className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                    <option value="all">Tất cả ({auditReport.totalSlides} slides)</option>
                    {auditReport.affectedSlides.map((s) => (
                      <option key={s} value={String(s)}>
                        Chỉ Slide {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-600 dark:text-slate-400">Trạng thái:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="NEEDS_TRANSLATION">Cần dịch ({auditReport.needsTranslationCount})</option>
                    <option value="ALREADY_TRANSLATED">Đã dịch ({auditReport.alreadyTranslatedCount})</option>
                    <option value="TM_REUSE">TM Reuse ({auditReport.tmReusableCount})</option>
                    <option value="NON_TRANSLATABLE">Kỹ thuật / Mã ({auditReport.nonTranslatableCount})</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm nội dung đoạn văn..."
                    className="w-full px-3 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Units List */}
              <div className="space-y-4">
                {groupedUnits.map(([groupKey, units]) => (
                  <div
                    key={String(groupKey)}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/50"
                  >
                    <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Slide {groupKey} ({units.length} text units)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {units.filter((u) => u.status === "NEEDS_TRANSLATION").length} cần dịch
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {units.map((unit) => {
                        const isSelected = selectedIds.has(unit.id);
                        return (
                          <div
                            key={unit.id}
                            className={`p-3 text-xs flex items-start gap-3 transition-colors ${
                              unit.status === "NEEDS_TRANSLATION"
                                ? isSelected
                                  ? "bg-amber-500/5 dark:bg-amber-500/10"
                                  : "bg-transparent opacity-60"
                                : "bg-transparent opacity-75"
                            }`}
                          >
                            {unit.status === "NEEDS_TRANSLATION" ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(unit.id)}
                                className="mt-1 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700"
                              />
                            ) : (
                              <span className="w-4 h-4 flex items-center justify-center text-slate-400 mt-0.5">
                                •
                              </span>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {getStatusBadge(unit.status)}
                                <span className="text-[11px] text-slate-400 truncate">
                                  {unit.reason}
                                </span>
                              </div>

                              <div className="font-medium text-slate-900 dark:text-slate-100 break-words">
                                "{unit.sourceText}"
                              </div>

                              {unit.suggestedTranslation && (
                                <div className="mt-1 text-slate-600 dark:text-slate-400 flex items-center gap-1.5 italic">
                                  <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  <span>"{unit.suggestedTranslation}"</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {groupedUnits.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Không tìm thấy đoạn văn nào phù hợp với bộ lọc hiện tại.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="text-xs text-slate-500">
            {activeTab === "review" && (
              <span>
                Đã chọn <strong className="text-amber-600 dark:text-amber-400">{selectedIds.size}</strong> /{" "}
                {auditReport.needsTranslationCount} mục cần dịch
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors"
            >
              Hủy bỏ (Cancel)
            </button>

            {activeTab === "summary" && (
              <button
                onClick={() => setActiveTab("review")}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-sky-300 dark:border-sky-800 transition-colors"
              >
                Review Untranslated
              </button>
            )}

            {/* DEFAULT ACTION: Translate Missing Only */}
            <button
              id="btn-translate-missing-only"
              onClick={() => onTranslateMissingOnly(Array.from(selectedIds))}
              disabled={isLoading || (auditReport.needsTranslationCount > 0 && selectedIds.size === 0)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-lg shadow-sky-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {isLoading
                ? "Đang xử lý..."
                : auditReport.needsTranslationCount === 0
                ? "File Đã Đầy Đủ (Không Cần Dịch)"
                : `Translate Missing Only (${selectedIds.size} mục)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
