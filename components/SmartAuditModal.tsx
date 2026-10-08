"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Zap, ShieldCheck, Filter, ArrowRight, RefreshCw, Pencil, Check, RotateCcw, BookOpen, Layers, CheckSquare, Square, SlidersHorizontal, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { SmartAuditReport, TextUnitStatus, TranslationAuditGroup, ScannedTextUnit } from "@/services/translation/smart-detector";

interface SmartAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditReport: SmartAuditReport | null;
  file?: File | null;
  onTranslateMissingOnly: (selectedUnitIds?: string[], customTranslations?: Record<string, string>) => void;
  onTranslateAll?: () => void;
  onApplySuggestions?: (unitIds: string[], customTranslations?: Record<string, string>) => Promise<void>;
  isLoading?: boolean;
}

const LABELS: Record<TextUnitStatus, string> = {
  ALREADY_TRANSLATED: "Đã dịch", NEEDS_TRANSLATION: "Cần dịch", TM_REUSE: "Có thể tái sử dụng",
  LOCKED_TERMINOLOGY: "Thuật ngữ đã duyệt", NON_TRANSLATABLE: "Mã / kỹ thuật", MIXED_LANGUAGE: "Ngôn ngữ hỗn hợp",
  POSSIBLE_TRANSLATION: "Bản dịch tương tự, cần xem lại", REVIEW_REQUIRED: "Chưa đủ bằng chứng",
  SUSPICIOUS_TRANSLATION: "Dấu / cách viết cần xem lại", TRANSLATION_CONFLICT: "Bản dịch không nhất quán",
};
const ORIGINS: Record<string, string> = { approved: "Thuật ngữ đã duyệt", correction: "Người dùng đã sửa", presentation: "PowerPoint hiện tại", history: "Tài liệu trước" };

export function SmartAuditModal({ isOpen, onClose, auditReport, file, onTranslateMissingOnly, onApplySuggestions, isLoading = false }: SmartAuditModalProps) {
  const [tab, setTab] = useState<"summary" | "slides" | "review" | "pairs">("summary");
  const [filter, setFilter] = useState("attention");
  const [slide, setSlide] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set<string>());
  const [ignored, setIgnored] = useState(new Set<string>());
  const [preview, setPreview] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [harvestMsg, setHarvestMsg] = useState("");
  const [aiAuditing, setAiAuditing] = useState(false);
  const [aiReport, setAiReport] = useState<SmartAuditReport | null>(null);
  const [aiAuditMsg, setAiAuditMsg] = useState("");

  const report = aiReport || auditReport;

  // Slide selector states
  const [slideRangeInput, setSlideRangeInput] = useState("");
  const [expandedSlideIndex, setExpandedSlideIndex] = useState<number | null>(null);

  // Custom translation editing states
  const [customEdits, setCustomEdits] = useState<Record<string, string>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    setAiReport(null);
    setAiAuditMsg("");
    setAiAuditing(false);
    setSelected(new Set(auditReport?.units.filter((u) => u.selectedForTranslation).map((u) => u.id)));
    setIgnored(new Set());
    setCustomEdits({});
    setEditingGroupId(null);
    setEditingUnitId(null);
    setPreview(null);
    setError("");
    setHarvestMsg("");
    setHarvesting(false);
    setSlide("all");
    setFilter("attention");
    setTab("summary");
  }, [auditReport]);

  const byId = useMemo(() => new Map(report?.units.map((u) => [u.id, u])), [report]);

  // Group all units by slide index
  const slideMap = useMemo(() => {
    if (!report) return new Map<number, ScannedTextUnit[]>();
    const map = new Map<number, ScannedTextUnit[]>();
    for (const u of report.units) {
      const s = u.location.slideIndex ?? 0;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(u);
    }
    return map;
  }, [report]);

  const slideList = useMemo(() => {
    if (!report) return [];
    return Array.from(slideMap.keys()).sort((a, b) => a - b);
  }, [slideMap, report]);

  const toggleSlide = (slideNum: number) => {
    const units = slideMap.get(slideNum) || [];
    const candidates = units.some((u) => u.selectedForTranslation)
      ? units.filter((u) => u.selectedForTranslation)
      : units.filter((u) => u.status !== "NON_TRANSLATABLE");
    if (!candidates.length) return;
    const allSelected = candidates.every((u) => selected.has(u.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of candidates) {
        if (allSelected) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  };

  const applySlideRange = (rangeStr: string) => {
    if (!rangeStr.trim() || !report) return;
    const indices = new Set<number>();
    const normalized = rangeStr.replace(/\s*-\s*/g, "-");
    const parts = normalized.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-").map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(report.totalSlides, Math.max(start, end));
          for (let i = min; i <= max; i++) indices.add(i);
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= report.totalSlides) indices.add(num);
      }
    }
    if (indices.size === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of report.units) {
        if (!u.selectedForTranslation) continue;
        const s = u.location.slideIndex ?? 0;
        if (indices.has(s)) next.add(u.id);
        else next.delete(u.id);
      }
      return next;
    });
  };

  const selectAllSlides = () => {
    if (!report) return;
    setSelected(new Set(report.units.filter((u) => u.selectedForTranslation).map((u) => u.id)));
  };

  const deselectAllSlides = () => {
    setSelected(new Set());
  };

  const selectOnlyPending = () => {
    if (!report) return;
    setSelected(new Set(report.units.filter((u) => u.selectedForTranslation && u.status === "NEEDS_TRANSLATION").map((u) => u.id)));
  };

  const groups = useMemo(() => {
    if (!report) return [];
    const base: TranslationAuditGroup[] = report.groups || report.units.filter((u) => !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(u.status)).map((u) => ({
      id: u.id, type: "translation", title: u.sourceText, unitIds: [u.id], reason: u.reason, confidence: u.confidence, safeToApply: false, suggestedTranslation: u.suggestedTranslation,
    }));
    return base.filter((g) => !ignored.has(g.id) && (filter !== "attention" || !g.safeToApply)).map((g) => ({ ...g, unitIds: g.unitIds.filter((id) => {
      const u = byId.get(id);
      const effectiveTranslation = customEdits[id] !== undefined ? customEdits[id] : u?.suggestedTranslation;
      return u && (slide === "all" || String(u.location.slideIndex) === slide) &&
        (filter === "attention" || filter === "all" || (filter === "reuse" && ["TM_REUSE", "LOCKED_TERMINOLOGY", "POSSIBLE_TRANSLATION"].includes(u.status)) || u.status === filter) &&
        (!query.trim() || (u.sourceText + " " + (effectiveTranslation || "")).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    }) })).filter((g) => g.unitIds.length);
  }, [report, byId, ignored, filter, slide, query, customEdits]);

  if (!isOpen || !report) return null;

  const loading = isLoading || busy;
  const selectedMissing = report.units
    .filter((u) => selected.has(u.id))
    .map((u) => ({
      ...u,
      selectedForTranslation: true,
      requiresTranslation: true,
      suggestedTranslation: customEdits[u.id] !== undefined ? customEdits[u.id] : u.suggestedTranslation,
    }));
  const safeIds = report.units.filter((u) => u.safeToApply && u.canApply && !(report.groups || []).some((g) => ignored.has(g.id) && g.unitIds.includes(u.id))).map((u) => u.id);
  const attention = (report.groups || []).filter((g) => !g.safeToApply && !ignored.has(g.id)).length || (report.groups ? 0 : report.needsTranslationCount);

  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous), unit = byId.get(id);
    const ids = unit?.location.isIsq ? report.units.filter(u => u.location.partPath === unit.location.partPath).map(u => u.id) : [id];
    const remove = next.has(id);
    for (const target of ids) remove ? next.delete(target) : next.add(target);
    return next;
  });

  const getEffectiveTranslation = (unit: ScannedTextUnit): string | undefined => {
    if (customEdits[unit.id] !== undefined) return customEdits[unit.id];
    if (unit.suggestedTranslation && unit.suggestedTranslation.trim().toLowerCase() !== unit.sourceText.trim().toLowerCase()) {
      return unit.suggestedTranslation;
    }
    return undefined;
  };

  const getGroupEffectiveTranslation = (group: TranslationAuditGroup): string | undefined => {
    const firstUnit = byId.get(group.unitIds[0]);
    if (firstUnit && customEdits[firstUnit.id] !== undefined) return customEdits[firstUnit.id];
    if (group.suggestedTranslation && firstUnit && group.suggestedTranslation.trim().toLowerCase() !== firstUnit.sourceText.trim().toLowerCase()) {
      return group.suggestedTranslation;
    }
    return undefined;
  };

  const startEditGroup = (group: TranslationAuditGroup) => {
    setEditingGroupId(group.id);
    setEditingUnitId(null);
    setEditText(getGroupEffectiveTranslation(group) || "");
  };

  const saveGroupEdit = (group: TranslationAuditGroup) => {
    const trimmed = editText.trim();
    setCustomEdits((prev) => {
      const next = { ...prev };
      for (const id of group.unitIds) {
        if (trimmed) next[id] = trimmed;
        else delete next[id];
      }
      return next;
    });
    setEditingGroupId(null);
    setEditText("");
  };

  const resetGroupEdit = (group: TranslationAuditGroup) => {
    setCustomEdits((prev) => {
      const next = { ...prev };
      for (const id of group.unitIds) delete next[id];
      return next;
    });
  };

  const startEditUnit = (unit: ScannedTextUnit) => {
    setEditingUnitId(unit.id);
    setEditingGroupId(null);
    setEditText(getEffectiveTranslation(unit) || "");
  };

  const saveUnitEdit = (unit: ScannedTextUnit) => {
    const trimmed = editText.trim();
    setCustomEdits((prev) => {
      const next = { ...prev };
      if (trimmed) next[unit.id] = trimmed;
      else delete next[unit.id];
      return next;
    });
    setEditingUnitId(null);
    setEditText("");
  };

  const resetUnitEdit = (unit: ScannedTextUnit) => {
    setCustomEdits((prev) => {
      const next = { ...prev };
      delete next[unit.id];
      return next;
    });
  };

  const apply = async () => {
    if (!preview || !onApplySuggestions) return;
    setBusy(true); setError("");
    try {
      await onApplySuggestions(preview, customEdits);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể áp dụng gợi ý.");
    } finally {
      setBusy(false);
    }
  };

  const ignore = (group: TranslationAuditGroup) => {
    const isqPaths = new Set(group.unitIds.map(id => byId.get(id)).filter(u => u?.location.isIsq).map(u => u!.location.partPath));
    setIgnored((previous) => new Set(previous).add(group.id));
    setSelected((previous) => new Set([...previous].filter((id) => !group.unitIds.includes(id) && !isqPaths.has(byId.get(id)?.location.partPath))));
  };

  const handleAiDeepAudit = async () => {
    if (!report) return;
    setAiAuditing(true);
    setAiAuditMsg("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("action", "ai_deep_audit");
      formData.append("auditReport", JSON.stringify(report));
      formData.append("sourceLanguage", "vi");
      formData.append("targetLanguage", "en");
      if (file) {
        formData.append("file", file);
      }

      const res = await fetch("/api/documents/translate-pptx", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể phân tích bằng AI Studio.");
      }
      if (data.auditReport) {
        setAiReport(data.auditReport);
        setSelected(new Set(data.auditReport.units.filter((u: any) => u.selectedForTranslation).map((u: any) => u.id)));
        setAiAuditMsg(
          `AI Studio đã phân tích xong: Tự động ghép ${data.pairedCount || 0} cặp song ngữ và bảo toàn ${data.immuneCount || 0} thuật ngữ!`
        );
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Lỗi khi gọi AI Studio.");
    } finally {
      setAiAuditing(false);
    }
  };

  const handleHarvestPairs = async () => {
    if (!report) return;
    setHarvesting(true);
    setHarvestMsg("");
    try {
      const res = await fetch("/api/terminology/harvest-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditReport: report, fileName: report.fileName }),
      });
      const data = await res.json();
      if (data.success) {
        setHarvestMsg(`Đã thu hoạch thành công ${data.addedCount} cụm thuật ngữ vào từ điển (Bỏ qua ${data.skippedCount} từ đã có)!`);
      } else {
        setHarvestMsg("Lỗi: " + (data.error || "Không thể thu hoạch"));
      }
    } catch (err: any) {
      setHarvestMsg("Lỗi kết nối: " + (err.message || "Không thể thu hoạch"));
    } finally {
      setHarvesting(false);
    }
  };

  const customEditsCount = Object.keys(customEdits).length;
  const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-4";
  const button = "px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer";

  return (
    <div id="smart-audit-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="smart-audit-title" id="smart-audit-modal-container" className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="smart-audit-title" className="text-lg font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-sky-500" /> Smart Audit
              {report.aiAudited && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-medium">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  Đã xác thực bởi AI Studio
                </span>
              )}
              {customEditsCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 font-medium">
                  {customEditsCount} câu tùy chỉnh
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-1">{report.fileName} · {report.totalSlides} slides · {report.totalUnits} đoạn văn</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAiDeepAudit}
              disabled={aiAuditing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
              title="Dùng Google AI Studio đọc ngữ cảnh các slide để tự động ghép cặp song ngữ và loại bỏ dịch trùng"
            >
              {aiAuditing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI Studio đang đọc slide...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>AI Studio Deep Audit</span>
                </>
              )}
            </button>
            <button aria-label="Đóng Smart Audit" onClick={onClose} disabled={loading} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {aiAuditMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{aiAuditMsg}</span>
            </div>
            <button onClick={() => setAiAuditMsg("")} className="text-emerald-500 hover:text-emerald-700 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-4 px-6 py-3 border-b border-slate-200 dark:border-slate-800 text-sm">
          <button onClick={() => setTab("summary")} aria-pressed={tab === "summary"} className={tab === "summary" ? "font-bold text-sky-600 border-b-2 border-sky-600 pb-1" : "text-slate-500 hover:text-slate-700"}>Tổng quan</button>
          <button onClick={() => setTab("slides")} aria-pressed={tab === "slides"} className={tab === "slides" ? "font-bold text-sky-600 border-b-2 border-sky-600 pb-1 flex items-center gap-1.5" : "text-slate-500 hover:text-slate-700 flex items-center gap-1.5"}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Chọn Slide &amp; Chỗ cần dịch ({selectedMissing.length})
          </button>
          <button onClick={() => setTab("review")} aria-pressed={tab === "review"} className={tab === "review" ? "font-bold text-sky-600 border-b-2 border-sky-600 pb-1" : "text-slate-500 hover:text-slate-700"}>Xem xét ({attention} nhóm)</button>
          <button onClick={() => setTab("pairs")} aria-pressed={tab === "pairs"} className={tab === "pairs" ? "font-bold text-sky-600 border-b-2 border-sky-600 pb-1 flex items-center gap-1.5" : "text-slate-500 hover:text-slate-700 flex items-center gap-1.5"}>
            <Layers className="w-3.5 h-3.5" /> Cặp slide ({report.slidePairs?.length || 0})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p role="alert" className="text-sm text-rose-600 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800">{error}</p>}
          {tab === "slides" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-sky-50/60 dark:bg-sky-950/30 p-3.5 rounded-xl border border-sky-200 dark:border-sky-800/60">
                <div>
                  <h3 className="font-bold text-sm text-sky-900 dark:text-sky-200 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-sky-600" /> Chọn slide và đoạn văn cần dịch bổ sung
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Chọn cả slide, nhập khoảng slide (vd: 1-5, 8, 12-14), hoặc mở rộng từng slide để chọn cụ thể từng chỗ/đoạn văn.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={button} onClick={selectAllSlides}>Chọn tất cả ({report.units.filter((u) => u.selectedForTranslation).length})</button>
                  <button type="button" className={button} onClick={deselectAllSlides}>Bỏ chọn tất cả</button>
                  <button type="button" className={button + " text-sky-600 font-semibold"} onClick={selectOnlyPending}>Chỉ chọn slide thiếu ({report.needsTranslationCount})</button>
                </div>
              </div>

              {/* Range input */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Nhập khoảng slide cần dịch, vd: 1-5, 8, 12-14..."
                  value={slideRangeInput}
                  onChange={(e) => setSlideRangeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySlideRange(slideRangeInput);
                  }}
                  className={button + " flex-1 bg-transparent"}
                />
                <button
                  type="button"
                  className={button + " bg-sky-600 text-white hover:bg-sky-500 shrink-0 font-semibold"}
                  onClick={() => applySlideRange(slideRangeInput)}
                  disabled={!slideRangeInput.trim()}
                >
                  Áp dụng khoảng slide
                </button>
              </div>

              {/* Slide list */}
              <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                {slideList.map((slideNum) => {
                  const units = slideMap.get(slideNum) || [];
                  const actionableUnits = units.filter((u) => u.status !== "NON_TRANSLATABLE");
                  const selectedInSlide = actionableUnits.filter((u) => selected.has(u.id));
                  const isAllSelected = actionableUnits.length > 0 && selectedInSlide.length === actionableUnits.length;
                  const isPartiallySelected = selectedInSlide.length > 0 && selectedInSlide.length < actionableUnits.length;
                  const isExpanded = expandedSlideIndex === slideNum;
                  const needsTransCount = units.filter((u) => u.status === "NEEDS_TRANSLATION" || selected.has(u.id)).length;

                  // Find title or first substantive snippet
                  const titleUnit = units.find((u) => u.sourceText && u.sourceText.trim().length > 3);
                  const titlePreview = titleUnit ? titleUnit.sourceText : `Slide ${slideNum}`;

                  return (
                    <div
                      key={slideNum}
                      className={card + " transition-colors " + (
                        isAllSelected
                          ? "border-sky-400 dark:border-sky-700 bg-sky-50/40 dark:bg-sky-950/25"
                          : isPartiallySelected
                          ? "border-amber-400 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/15"
                          : "border-slate-200 dark:border-slate-800"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleSlide(slideNum)}
                            disabled={actionableUnits.length === 0}
                            className="text-slate-600 dark:text-slate-300 hover:text-sky-600 shrink-0 disabled:opacity-30 cursor-pointer"
                            aria-label={`Chọn toàn bộ Slide ${slideNum}`}
                          >
                            {isAllSelected ? (
                              <CheckSquare className="w-4 h-4 text-sky-600" />
                            ) : isPartiallySelected ? (
                              <div className="w-4 h-4 rounded border-2 border-amber-600 bg-amber-500/20 flex items-center justify-center font-bold text-[10px] text-amber-600 leading-none">
                                -
                              </div>
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-100">Slide {slideNum}</span>
                              {needsTransCount > 0 ? (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                                  {needsTransCount} câu chưa dịch
                                </span>
                              ) : actionableUnits.length > 0 ? (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
                                  Đã dịch
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                                  Không cần dịch
                                </span>
                              )}
                              <span className="text-slate-400 text-[11px]">
                                ({selectedInSlide.length}/{actionableUnits.length} đoạn được chọn)
                              </span>
                            </div>
                            <p className="text-slate-500 text-[11px] truncate mt-0.5 max-w-lg">
                              {titlePreview}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedSlideIndex(isExpanded ? null : slideNum)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 text-[11px] cursor-pointer"
                          >
                            <span>{isExpanded ? "Thu gọn" : "Chi tiết từng câu"}</span>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Granular paragraph-by-paragraph toggle */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                          <p className="text-[11px] font-semibold text-slate-500">
                            Các vị trí văn bản trong Slide {slideNum} (tick để chọn từng chỗ/phần cần dịch):
                          </p>
                          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                            {units.map((u) => {
                              const isChecked = selected.has(u.id);
                              const isCustom = customEdits[u.id] !== undefined;
                              const effectiveTrans = getEffectiveTranslation(u);
                              const isEditing = editingUnitId === u.id;

                              return (
                                <div
                                  key={u.id}
                                  className={`p-2 rounded border text-xs flex flex-col gap-1.5 transition-colors ${
                                    isChecked
                                      ? "bg-white dark:bg-slate-900 border-sky-300 dark:border-sky-800"
                                      : "bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-70"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={loading}
                                        onChange={() => toggle(u.id)}
                                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-sky-600 shrink-0 cursor-pointer"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            Đoạn {(u.location.paragraphIndex ?? 0) + 1}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                            {LABELS[u.status]}
                                          </span>
                                          {isCustom && (
                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold">
                                              Đã sửa thủ công
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-slate-800 dark:text-slate-200 mt-0.5 break-words">
                                          {u.sourceText}
                                        </p>
                                        {effectiveTrans && effectiveTrans.trim().toLowerCase() !== u.sourceText.trim().toLowerCase() && !isEditing && (
                                          <p className="text-emerald-700 dark:text-emerald-400 text-[11px] mt-0.5 break-words flex items-center gap-1">
                                            <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                                            {effectiveTrans}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      {isEditing ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            className={button + " text-emerald-600 p-1"}
                                            onClick={() => saveUnitEdit(u)}
                                            title="Lưu sửa đổi"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className={button + " text-slate-400 p-1"}
                                            onClick={() => setEditingUnitId(null)}
                                            title="Hủy"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            className={button + " text-slate-500 p-1"}
                                            onClick={() => startEditUnit(u)}
                                            title="Tự sửa bản dịch của câu này"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          {isCustom && (
                                            <button
                                              type="button"
                                              className={button + " text-rose-500 p-1"}
                                              onClick={() => resetUnitEdit(u)}
                                              title="Hủy sửa đổi, khôi phục gốc"
                                            >
                                              <RotateCcw className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {isEditing && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <input
                                        type="text"
                                        className={button + " flex-1 bg-white dark:bg-slate-900 text-xs"}
                                        placeholder="Nhập bản dịch tùy chỉnh..."
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") saveUnitEdit(u);
                                        }}
                                        autoFocus
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : tab === "pairs" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-600" /> Sơ đồ ghép cặp slide song ngữ
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tự động nhận diện động {report.slidePairs?.length || 0} cặp slide (1 trang EN bản dịch + 1 trang VI tham chiếu).
                  </p>
                </div>
                <button
                  className={button + " bg-emerald-600 text-white hover:bg-emerald-500 flex items-center gap-1.5"}
                  onClick={handleHarvestPairs}
                  disabled={harvesting || !(report.slidePairs && report.slidePairs.length > 0)}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {harvesting ? "Đang thu hoạch..." : "Thu hoạch thuật ngữ vào TM & Glossary"}
                </button>
              </div>

              {harvestMsg && (
                <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  harvestMsg.startsWith("Lỗi")
                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                }`}>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{harvestMsg}</span>
                </div>
              )}

              {(!report.slidePairs || report.slidePairs.length === 0) ? (
                <div className={card + " text-center py-8 text-slate-500"}>
                  <p>Không phát hiện chuỗi slide song ngữ xen kẽ trong tệp này.</p>
                  <p className="text-xs mt-1">Tệp này có thể là tệp dạng bảng IPQC đơn slide hoặc tệp chưa được ghép đôi.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                  {report.slidePairs.map((pair, idx) => (
                    <div key={idx} className={card + " border-slate-300 dark:border-slate-700 relative hover:border-sky-400 dark:hover:border-sky-500 transition-colors"}>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-sky-600 dark:text-sky-400">Cặp slide #{idx + 1}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {pair.itemCount || 0} đoạn văn · Tự động
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60">
                          <span className="font-bold text-sky-700 dark:text-sky-300 block mb-0.5">Slide {pair.enSlide} (Bản dịch EN)</span>
                          <p className="text-slate-700 dark:text-slate-300 line-clamp-2 italic">{pair.enTitle || "(Không có tiêu đề)"}</p>
                        </div>
                        <div className="flex justify-center text-slate-400">
                          <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                        </div>
                        <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                          <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">Slide {pair.viSlide} (Gốc VI tham chiếu xưởng)</span>
                          <p className="text-slate-700 dark:text-slate-300 line-clamp-2 italic">{pair.viTitle || "(Không có tiêu đề)"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "summary" ? <>
            <p className="text-2xl font-bold">{attention} nhóm cần chú ý</p>
            <div className={card + " grid grid-cols-2 md:grid-cols-3 gap-5 text-sm"}>
              <div><strong className="text-amber-600">{report.untranslatedCount ?? report.needsTranslationCount}</strong><p>Chưa dịch trong file</p></div>
              <div><strong className="text-sky-600">{report.tmReusableCount + report.lockedTerminologyCount}</strong><p>Có bản dịch để dùng lại</p></div>
              <div><strong className="text-rose-600">{report.translationConflictCount || 0}</strong><p>Bản dịch khác nhau</p></div>
              <div><strong>{report.suspiciousTranslationCount || 0}</strong><p>Dấu / cách viết</p></div>
              <div><strong>{report.possibleTranslationCount + report.reviewRequiredCount + report.mixedLanguageCount}</strong><p>Cần kiểm tra ngữ cảnh</p></div>
              <div><strong className="text-emerald-600">{safeIds.length}</strong><p>Gợi ý có thể áp dụng an toàn</p></div>
            </div>

            {report.slidePairs && report.slidePairs.length > 0 && (
              <div className={card + " flex items-center justify-between gap-3 text-sm border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20"}>
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-sky-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-sky-900 dark:text-sky-200">Đã nhận diện động {report.slidePairs.length} cặp slide song ngữ (ISQ Option 1)</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Các slide tiếng Việt tham chiếu đã được tự động liên kết với slide tiếng Anh tương ứng và bảo vệ không dịch lại.</p>
                  </div>
                </div>
                <button className={button + " bg-sky-600 text-white hover:bg-sky-500"} onClick={() => setTab("pairs")}>Xem sơ đồ ({report.slidePairs.length} cặp)</button>
              </div>
            )}

            <div className={card + " flex gap-3 text-sm"}><ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" /><p>{report.alreadyTranslatedCount} đoạn đã dịch và {report.nonTranslatableCount} mã/giá trị được giữ lại. Bạn có thể tùy chỉnh sửa trực tiếp câu dịch của bất kỳ nhóm hoặc slide nào trước khi dịch.</p></div>
            <p className="text-sm text-slate-500">Dịch và sửa trực tiếp phần chưa dịch, sau đó tự tải PPTX và quét lại. Các bản dịch đã tùy chỉnh thủ công sẽ được áp dụng trực tiếp mà không tốn quota AI.</p>
            <p className="text-sm text-slate-500">ISQ: chọn theo cả slide để xuất một slide EN và một slide VI liền sau. IPQC giữ bố cục song ngữ trong slide.</p>
            {(report.untranslatedCount ?? 0) > (report.translatableMissingCount ?? 0) && <p className="text-sm text-amber-600">{(report.untranslatedCount ?? 0) - (report.translatableMissingCount ?? 0)} đoạn có định dạng hoặc cấu trúc đặc biệt cần chỉnh thủ công; xem chi tiết trong các nhóm.</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={button + " bg-sky-600 text-white hover:bg-sky-500 flex items-center gap-1.5 font-semibold"} onClick={() => setTab("slides")}>
                <SlidersHorizontal className="w-3.5 h-3.5" /> Chọn slide &amp; chỗ cần dịch ({selectedMissing.length} đã chọn)
              </button>
              <button type="button" className={button} onClick={() => setTab("review")}>Xem &amp; Tùy chỉnh các nhóm</button>
              <button type="button" className={button} onClick={() => { setFilter("reuse"); setTab("review"); }}>Xem bản dịch có thể dùng lại</button>
              {report.slidePairs && report.slidePairs.length > 0 && (
                <button type="button" className={button + " text-sky-600 flex items-center gap-1.5"} onClick={() => setTab("pairs")}>
                  <Layers className="w-3.5 h-3.5" /> Sơ đồ cặp slide ({report.slidePairs.length})
                </button>
              )}
              {onApplySuggestions && <button type="button" className={button + " text-emerald-600"} disabled={loading || !safeIds.length} onClick={() => setPreview(safeIds)}>Xem trước {safeIds.length} sửa an toàn</button>}
            </div>
          </> : <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Filter className="w-4 h-4 text-slate-400" />
              <select aria-label="Lọc trạng thái" className={button + " bg-transparent"} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="attention">Các nhóm cần chú ý</option><option value="all">Tất cả nhóm phát hiện</option>
                <option value="reuse">Các bản dịch có thể dùng lại</option>
                {Object.entries(LABELS).filter(([s]) => !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(s)).map(([s, label]) => <option key={s} value={s}>{label}</option>)}
              </select>
              <select aria-label="Lọc slide" className={button + " bg-transparent"} value={slide} onChange={(e) => setSlide(e.target.value)}>
                <option value="all">Tất cả slide</option>
                {report.affectedSlides.map((s) => <option key={s} value={s}>Slide {s}</option>)}
              </select>
              {slide !== "all" && (
                <>
                  <button type="button" className={button + " text-sky-600 font-semibold"} onClick={() => {
                    const slideNum = parseInt(slide, 10);
                    const units = slideMap.get(slideNum) || [];
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const u of units) if (u.status !== "NON_TRANSLATABLE") next.add(u.id);
                      return next;
                    });
                  }}>Chọn cả Slide {slide}</button>
                  <button type="button" className={button + " text-slate-500"} onClick={() => {
                    const slideNum = parseInt(slide, 10);
                    const units = slideMap.get(slideNum) || [];
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const u of units) next.delete(u.id);
                      return next;
                    });
                  }}>Bỏ chọn Slide {slide}</button>
                </>
              )}
              <input aria-label="Tìm nội dung" className={button + " flex-1 bg-transparent"} placeholder="Tìm nội dung hoặc gợi ý..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <button type="button" className={button} onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</button>
            </div>

            {groups.map((group) => {
              const members = group.unitIds.map((id) => byId.get(id)!);
              const isEditingThisGroup = editingGroupId === group.id;
              const groupTrans = getGroupEffectiveTranslation(group);
              const groupCustomCount = members.filter((m) => customEdits[m.id] !== undefined).length;
              const isCustomGroup = groupCustomCount > 0;
              const writable = members.filter((u) => (u.canApply || customEdits[u.id] !== undefined) && (customEdits[u.id] || u.suggestedTranslation)).map((u) => u.id);

              return (
                <div key={group.id} className={card + (isCustomGroup ? " border-purple-400/50 dark:border-purple-600/50 bg-purple-50/20 dark:bg-purple-950/20" : "")}>
                  <div className="flex justify-between items-center gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sky-600">
                        {group.type === "consistency" ? "Nhất quán bản dịch" : group.type === "language_quality" ? "Chất lượng ngôn ngữ" : LABELS[members[0].status]} · {group.unitIds.length} vị trí
                      </span>
                      {isCustomGroup && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold border border-purple-300 dark:border-purple-700">
                          <Pencil className="w-2.5 h-2.5" /> Đã tùy chỉnh ({groupCustomCount}/{members.length})
                        </span>
                      )}
                    </div>
                    <span>{Math.round(group.confidence * 100)}% khớp bằng chứng</span>
                  </div>

                  <p className="font-medium mt-2 whitespace-pre-line text-sm">{group.title}</p>

                  {/* Group-level translation editing */}
                  {isEditingThisGroup ? (
                    <div className="mt-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-sky-400 dark:border-sky-500 shadow-sm space-y-2">
                      <label className="text-xs font-semibold text-sky-700 dark:text-sky-300 block">
                        Chỉnh sửa câu dịch cho toàn bộ {members.length} vị trí trong nhóm:
                      </label>
                      <textarea
                        aria-label="Nhập câu dịch tùy chỉnh cho nhóm"
                        className="w-full text-sm p-2 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[64px]"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Nhập câu dịch tiếng Anh..."
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className={button + " bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}
                          onClick={() => { setEditingGroupId(null); setEditText(""); }}
                        >
                          Hủy
                        </button>
                        <button
                          className={button + " bg-sky-600 text-white hover:bg-sky-500"}
                          onClick={() => saveGroupEdit(group)}
                        >
                          <Check className="w-3.5 h-3.5 inline mr-1" />
                          Lưu cho nhóm ({members.length} vị trí)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        {groupTrans ? (
                          <p className={`text-sm flex gap-2 ${isCustomGroup ? "text-purple-700 dark:text-purple-300 font-medium" : "text-emerald-700 dark:text-emerald-400"}`}>
                            <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{groupTrans}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Chưa có bản dịch gợi ý</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          className="px-2.5 py-1 rounded text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/50 border border-sky-300 dark:border-sky-800 flex items-center gap-1 font-medium cursor-pointer"
                          title="Tùy chỉnh sửa câu dịch cho nhóm này"
                          onClick={() => startEditGroup(group)}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{groupTrans ? "Sửa câu dịch" : "+ Thêm bản dịch"}</span>
                        </button>
                        {isCustomGroup && (
                          <button
                            className="px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Khôi phục lại bản dịch đề xuất ban đầu"
                            onClick={() => resetGroupEdit(group)}
                          >
                            <RotateCcw className="w-3 h-3 inline mr-1" />
                            Khôi phục
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mt-2">{group.reason}</p>
                  {group.variants && (
                    <table className="text-xs mt-3 w-full text-left">
                      <thead><tr><th>Bản dịch</th><th>Lần dùng</th><th>Slide</th></tr></thead>
                      <tbody>{group.variants.map((variant) => <tr key={variant.text}><td className="py-1">{variant.text}{variant.approved ? " (đã xác nhận)" : ""}</td><td>{variant.count}</td><td>{variant.slides.join(", ")}</td></tr>)}</tbody>
                    </table>
                  )}

                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-sky-600 font-medium hover:underline">
                      Xem vị trí và bằng chứng ({members.length})
                    </summary>
                    <div className="mt-2 space-y-3">
                      {members.map((u) => {
                        const isEditingThisUnit = editingUnitId === u.id;
                        const uTrans = getEffectiveTranslation(u);
                        const isCustomUnit = customEdits[u.id] !== undefined;

                        return (
                          <div key={u.id} className="border-t border-slate-200 dark:border-slate-800 pt-2.5">
                            <div className="flex gap-2 items-start">
                              <input
                                aria-label={"Chọn dịch " + u.sourceText}
                                type="checkbox"
                                checked={selected.has(u.id)}
                                disabled={loading}
                                onChange={() => toggle(u.id)}
                                className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-sky-600 shrink-0 cursor-pointer"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <strong className="text-slate-700 dark:text-slate-300">
                                    Slide {u.location.slideIndex}, đoạn {(u.location.paragraphIndex ?? 0) + 1}
                                  </strong>
                                  <div className="flex items-center gap-1.5">
                                    {!isEditingThisUnit && (
                                      <button
                                        className="px-2 py-0.5 rounded text-[11px] text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/50 border border-sky-300 dark:border-sky-800 flex items-center gap-1 cursor-pointer"
                                        onClick={() => startEditUnit(u)}
                                        title="Sửa riêng bản dịch cho vị trí này"
                                      >
                                        <Pencil className="w-2.5 h-2.5" />
                                        <span>{uTrans ? "Sửa vị trí này" : "+ Nhập bản dịch"}</span>
                                      </button>
                                    )}
                                    {isCustomUnit && !isEditingThisUnit && (
                                      <button
                                        className="px-1.5 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                        onClick={() => resetUnitEdit(u)}
                                        title="Khôi phục lại gợi ý cho vị trí này"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <p className="whitespace-pre-line mt-0.5">{u.sourceText}</p>

                                {/* Unit inline editor */}
                                {isEditingThisUnit ? (
                                  <div className="mt-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-sky-400 dark:border-sky-500 space-y-1.5">
                                    <label className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 block">
                                      Bản dịch riêng cho Slide {u.location.slideIndex}:
                                    </label>
                                    <input
                                      type="text"
                                      aria-label="Bản dịch riêng cho vị trí này"
                                      className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                      value={editText}
                                      onChange={(e) => setEditText(e.target.value)}
                                      placeholder="Nhập câu dịch..."
                                      autoFocus
                                    />
                                    <div className="flex justify-end gap-1.5 pt-1">
                                      <button
                                        className="px-2 py-1 rounded text-[11px] border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                                        onClick={() => { setEditingUnitId(null); setEditText(""); }}
                                      >
                                        Hủy
                                      </button>
                                      <button
                                        className="px-2.5 py-1 rounded text-[11px] bg-sky-600 text-white font-medium hover:bg-sky-500 cursor-pointer"
                                        onClick={() => saveUnitEdit(u)}
                                      >
                                        Lưu vị trí này
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  uTrans && (
                                    <p className={`mt-1 text-xs flex items-center gap-1.5 ${isCustomUnit ? "text-purple-600 dark:text-purple-400 font-semibold" : "text-emerald-700 dark:text-emerald-400"}`}>
                                      <ArrowRight className="w-3 h-3 shrink-0" />
                                      <span>{uTrans}</span>
                                      {isCustomUnit && (
                                        <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded font-normal">
                                          Tùy chỉnh riêng
                                        </span>
                                      )}
                                    </p>
                                  )
                                )}

                                {u.suspiciousSegments?.length ? <p className="mt-1 text-amber-600">Cụm cần xem lại: {u.suspiciousSegments.join("; ")}</p> : null}
                                {u.matches?.map((match, index) => <p key={index} className="mt-1 text-slate-500">{ORIGINS[match.origin]}{match.fileName ? " · " + match.fileName : ""}{match.slideIndex ? " · Slide " + match.slideIndex : ""}: {match.source || match.target} → {match.target}</p>)}
                                {uTrans && !u.canApply && !isCustomUnit && uTrans !== u.sourceText && (
                                  <p className="mt-1 text-amber-600">{u.selectedForTranslation ? "Dùng nút Dịch & sửa để dịch theo định dạng chữ chủ đạo." : "Chỉnh thủ công để giữ định dạng hoặc cấu trúc đặc biệt."}</p>
                                )}
                                {u.requiresTranslation && !u.selectedForTranslation && <p className="mt-1 text-amber-600">{u.reason}</p>}
                                {uTrans && (u.canApply || isCustomUnit) && onApplySuggestions && (
                                  <button className={button + " mt-2"} disabled={loading} onClick={() => setPreview([u.id])}>
                                    Áp dụng tại vị trí này
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {onApplySuggestions && writable.length > 0 && (
                      <button className={button} disabled={loading} onClick={() => setPreview(writable)}>
                        <RefreshCw className="w-3 h-3 inline mr-1" />
                        Xem trước &amp; áp dụng {writable.length} vị trí {isCustomGroup ? "(đã tùy chỉnh)" : ""}
                      </button>
                    )}
                    <button className={button} disabled={loading} onClick={() => ignore(group)}>
                      Bỏ qua nhóm lần này
                    </button>
                  </div>
                </div>
              );
            })}
            {!groups.length && <p className="text-sm text-slate-500">Không có nhóm phù hợp.</p>}
          </>}

          {/* Preview applied regions */}
          {preview && (
            <div role="region" aria-label="Xem trước áp dụng" className="rounded-xl border border-sky-400 p-4 bg-sky-50 dark:bg-sky-950/40 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <strong>Áp dụng gợi ý tại {preview.length} vị trí</strong>
                {preview.some((id) => customEdits[id] !== undefined) && (
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-medium">
                    Có {preview.filter((id) => customEdits[id] !== undefined).length} vị trí tùy chỉnh thủ công
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Chỉ những vị trí liệt kê dưới đây sẽ thay đổi trên tài liệu PowerPoint.</p>
              <div className="max-h-52 overflow-auto space-y-2 text-xs">
                {preview.map((id) => {
                  const u = byId.get(id)!;
                  const trans = customEdits[id] !== undefined ? customEdits[id] : u.suggestedTranslation;
                  const isCustom = customEdits[id] !== undefined;
                  return (
                    <div key={id} className="flex items-start justify-between gap-2 p-1.5 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                      <div className="flex-1">
                        <strong>Slide {u.location.slideIndex}, đoạn {(u.location.paragraphIndex ?? 0) + 1}</strong>: {u.sourceText} → <span className={isCustom ? "font-bold text-purple-600 dark:text-purple-400" : "text-emerald-700 dark:text-emerald-400"}>{trans}</span>
                      </div>
                      {isCustom && <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded shrink-0 font-medium">Tùy chỉnh</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <button className={button + " bg-sky-600 text-white hover:bg-sky-500"} onClick={apply} disabled={loading}>
                  Áp dụng {preview.length} vị trí
                </button>
                <button className={button} onClick={() => setPreview(null)} disabled={loading}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-xs bg-slate-50/50 dark:bg-slate-950/30">
          <div>
            <span>Đã chọn <strong className="text-sky-600 dark:text-sky-400 font-semibold">{selectedMissing.length}</strong> đoạn cần dịch AI</span>
            {customEditsCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium">
                · {customEditsCount} đoạn đã sửa thủ công (0 token AI)
              </span>
            )}
            <span className="ml-2 text-slate-400">· khoảng {Math.ceil(new Set(selectedMissing.map((u) => u.canonicalText)).size / 25)} yêu cầu AI</span>
          </div>
          <div className="flex gap-2">
            <button className={button} onClick={onClose} disabled={loading}>
              Đóng
            </button>
            <button
              id="btn-translate-missing-only"
              className={button + " bg-sky-600 text-white hover:bg-sky-500"}
              disabled={loading || (!selectedMissing.length && customEditsCount === 0)}
              onClick={() => onTranslateMissingOnly(selectedMissing.map((u) => u.id), customEdits)}
            >
              {loading ? "Đang xử lý..." : `Dịch & sửa phần chưa dịch (${selectedMissing.length + customEditsCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
