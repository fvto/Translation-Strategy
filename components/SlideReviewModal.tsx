"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  X,
  Search,
  CheckCircle2,
  Edit3,
  RotateCcw,
  Download,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Save,
  Check,
  RefreshCw,
} from "lucide-react";
import { PptxSlideData, PptxParagraph } from "./PptxTranslator";
import {
  saveUserSlideEdits,
  getUserSlideEdits,
  applyEditsToSlides,
} from "@/services/storage/slide-edits-storage";

interface SlideReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  slides: PptxSlideData[];
  onSaveSlides: (updatedSlides: PptxSlideData[]) => Promise<void>;
  onUpdateSlides?: (updatedSlides: PptxSlideData[]) => void;
  fileName?: string;
  isSaving?: boolean;
}

// Authoritative key footwear SOP terms to highlight
const KEY_SOP_TERMS = [
  "bond gap",
  "tip shape",
  "toe shape",
  "collar shape",
  "heel shape",
  "spi 9-10 stitches/inch",
  "spi 10-12 stitches/inch",
  "spi 7-8 stitches/inch",
  "midsole",
  "outsole",
  "vamp",
  "tongue",
  "buffing",
  "cementing",
  "gauge mark",
  "rocking",
  "crooked",
  "wrinkle",
  "run-off stitching",
  "broken stitch",
  "skipped stitch",
  "air pocket",
  "over buffing",
  "under buffing",
  "high-frequency welding",
];

function highlightFootwearTerms(text: string): React.ReactNode {
  if (!text) return text;
  const lower = text.toLowerCase();
  const matchedTerms: string[] = [];

  for (const term of KEY_SOP_TERMS) {
    if (lower.includes(term)) {
      matchedTerms.push(term);
    }
  }

  if (matchedTerms.length === 0) return text;

  // Build regex pattern matching any of the detected terms
  const escaped = matchedTerms
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(regex);
  return parts.map((part, i) => {
    const isTerm = matchedTerms.some((t) => t.toLowerCase() === part.toLowerCase());
    if (isTerm) {
      return (
        <span
          key={i}
          className="bg-emerald-950/80 text-emerald-300 font-semibold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1 shadow-sm"
          title="Thuật ngữ chuẩn SOP"
        >
          <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
          {part}
        </span>
      );
    }
    return part;
  });
}

export const SlideReviewModal: React.FC<SlideReviewModalProps> = ({
  isOpen,
  onClose,
  slides,
  onSaveSlides,
  onUpdateSlides,
  fileName = "presentation.pptx",
  isSaving = false,
}) => {
  const [editedSlides, setEditedSlides] = useState<PptxSlideData[]>(slides);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const [tempEditText, setTempEditText] = useState<string>("");
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [autoSaveNotice, setAutoSaveNotice] = useState<string | null>(null);

  // Map of paragraphId -> user-edited text
  const [paragraphEdits, setParagraphEdits] = useState<Record<string, string>>({});

  // Baseline untampered AI translations (for reset button and comparison)
  const initialAiTranslationsRef = useRef<Record<string, string>>({});

  // Initialize and merge edits from localStorage whenever modal opens or slides update
  useEffect(() => {
    if (!slides || slides.length === 0) return;

    // 1. Populate baseline AI translations for any new paragraphs
    const baseline = { ...initialAiTranslationsRef.current };
    slides.forEach((s) => {
      s.paragraphs.forEach((p) => {
        if (!baseline[p.id]) {
          baseline[p.id] = p.translatedText;
        }
      });
    });
    initialAiTranslationsRef.current = baseline;

    // 2. Check localStorage for persistent edits
    const stored = getUserSlideEdits(fileName);
    let activeEdits = { ...paragraphEdits };

    if (stored && stored.paragraphEdits && Object.keys(stored.paragraphEdits).length > 0) {
      activeEdits = { ...stored.paragraphEdits, ...activeEdits };
      if (stored.initialAiTranslations) {
        initialAiTranslationsRef.current = {
          ...stored.initialAiTranslations,
          ...initialAiTranslationsRef.current,
        };
      }
    }

    setParagraphEdits(activeEdits);

    // 3. Apply edits onto current slides
    const { slides: merged, appliedCount } = applyEditsToSlides(slides, activeEdits);
    setEditedSlides(merged);

    if (appliedCount > 0 && isOpen) {
      onUpdateSlides?.(merged);
    }
  }, [slides, isOpen, fileName]);

  const pillContainerRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);

  // Enable horizontal mouse-wheel scrolling over slide pills with 60fps momentum interpolation
  useEffect(() => {
    const el = pillContainerRef.current;
    if (!el) return;

    let targetScroll = el.scrollLeft;
    let animId: number | null = null;

    const smoothStep = () => {
      const current = el.scrollLeft;
      const diff = targetScroll - current;

      if (Math.abs(diff) > 0.5) {
        el.scrollLeft = current + diff * 0.18; // smooth exponential decay curve
        animId = requestAnimationFrame(smoothStep);
      } else {
        el.scrollLeft = targetScroll;
        animId = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);

        if (!animId) {
          targetScroll = el.scrollLeft;
        }

        targetScroll = Math.max(0, Math.min(maxScroll, targetScroll + e.deltaY * 1.35));

        if (!animId) {
          animId = requestAnimationFrame(smoothStep);
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen, editedSlides]);

  // Keep active slide pill centered into view when current slide changes
  useEffect(() => {
    if (activePillRef.current) {
      activePillRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentSlideIndex]);

  const slideNumbers = useMemo(() => {
    return editedSlides.map((s) => s.slideIndex);
  }, [editedSlides]);

  const currentSlide = editedSlides[currentSlideIndex] || editedSlides[0];

  const handleStartEdit = (p: PptxParagraph) => {
    setActiveEditingId(p.id);
    setTempEditText(p.translatedText);
  };

  const handleApplyEdit = useCallback(
    (pId: string, textOverride?: string) => {
      const finalText = textOverride !== undefined ? textOverride : tempEditText;

      // Find current paragraph's original text for fallback mapping
      let originalText = "";
      editedSlides.forEach((s) => {
        const found = s.paragraphs.find((p) => p.id === pId);
        if (found) originalText = found.originalText;
      });

      const updatedSlides = editedSlides.map((slide) => ({
        ...slide,
        paragraphs: slide.paragraphs.map((p) =>
          p.id === pId ? { ...p, translatedText: finalText } : p
        ),
      }));

      const newEdits = {
        ...paragraphEdits,
        [pId]: finalText,
      };
      if (originalText.trim()) {
        newEdits[`text_${originalText.trim()}`] = finalText;
      }

      setEditedSlides(updatedSlides);
      setParagraphEdits(newEdits);
      setActiveEditingId(null);

      // 1. Immediately sync to parent component so closing tab or main download works
      onUpdateSlides?.(updatedSlides);

      // 2. Persist to browser localStorage (survives tab close & page reloads)
      saveUserSlideEdits(
        fileName,
        newEdits,
        updatedSlides,
        initialAiTranslationsRef.current
      );

      // 3. Visual autosave feedback
      setAutoSaveNotice("Đã tự động lưu");
      setTimeout(() => setAutoSaveNotice(null), 2500);
    },
    [editedSlides, paragraphEdits, tempEditText, fileName, onUpdateSlides]
  );

  const handleCancelEdit = () => {
    setActiveEditingId(null);
    setTempEditText("");
  };

  const handleResetParagraph = (pId: string) => {
    const originalText = initialAiTranslationsRef.current[pId];
    if (originalText === undefined) return;

    let targetOrigText = "";
    const updatedSlides = editedSlides.map((slide) => ({
      ...slide,
      paragraphs: slide.paragraphs.map((p) => {
        if (p.id === pId) {
          targetOrigText = p.originalText;
          return { ...p, translatedText: originalText };
        }
        return p;
      }),
    }));

    const newEdits = { ...paragraphEdits };
    delete newEdits[pId];
    if (targetOrigText.trim()) {
      delete newEdits[`text_${targetOrigText.trim()}`];
    }

    setEditedSlides(updatedSlides);
    setParagraphEdits(newEdits);

    onUpdateSlides?.(updatedSlides);
    saveUserSlideEdits(
      fileName,
      newEdits,
      updatedSlides,
      initialAiTranslationsRef.current
    );

    setAutoSaveNotice("Đã khôi phục câu dịch AI ban đầu");
    setTimeout(() => setAutoSaveNotice(null), 2500);
  };

  // Safe Close Handler: Auto-commits any pending edit and guarantees parent is synced
  const handleClose = () => {
    if (activeEditingId && tempEditText.trim()) {
      handleApplyEdit(activeEditingId, tempEditText);
    } else {
      onUpdateSlides?.(editedSlides);
    }
    onClose();
  };

  // Auto-save on window beforeunload (in case browser tab is closed during editing)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeEditingId && tempEditText.trim()) {
        const newEdits = { ...paragraphEdits, [activeEditingId]: tempEditText };
        saveUserSlideEdits(
          fileName,
          newEdits,
          editedSlides,
          initialAiTranslationsRef.current
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeEditingId, tempEditText, paragraphEdits, fileName, editedSlides]);

  const handleSaveAndExport = async () => {
    if (activeEditingId && tempEditText.trim()) {
      handleApplyEdit(activeEditingId, tempEditText);
    }
    await onSaveSlides(editedSlides);
    setSaveToast("Đã lưu các thay đổi và xuất tệp PowerPoint mới!");
    setTimeout(() => setSaveToast(null), 3500);
  };

  if (!isOpen) return null;

  const filteredParagraphs =
    currentSlide?.paragraphs.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.originalText.toLowerCase().includes(q) ||
        p.translatedText.toLowerCase().includes(q)
      );
    }) || [];

  const totalCustomEditsCount = Object.keys(paragraphEdits).filter(
    (k) => !k.startsWith("text_")
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b101d] border border-slate-800 rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/10 border border-blue-500/30 rounded-xl text-blue-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Xem Trước Song Ngữ &amp; Chỉnh Sửa Trực Tiếp
                </h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full">
                  Footwear SOP Parity
                </span>
                {totalCustomEditsCount > 0 && (
                  <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-blue-400" />
                    {totalCustomEditsCount} câu đã sửa
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                File: <span className="text-slate-300 font-medium">{fileName}</span> • Tự động lưu mọi câu sửa (Tắt tab hoặc làm mới trang không mất).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Auto-saved badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{autoSaveNotice || "Tự động lưu vào máy"}</span>
            </div>

            <button
              onClick={handleSaveAndExport}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang Đóng Gói...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Lưu &amp; Xuất File PPTX</span>
                </>
              )}
            </button>

            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Đóng (Mọi sửa đổi đã tự động lưu)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Slide Navigation */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800 bg-[#0d1322] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Slide selector pills */}
          <div className="flex items-center space-x-1.5 min-w-0 max-w-full sm:max-w-[70%]">
            <button
              onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
              disabled={currentSlideIndex === 0}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer shrink-0 shadow-sm"
              title="Slide trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              ref={pillContainerRef}
              className="flex items-center space-x-2 overflow-x-auto py-1 max-w-full"
            >
              {slideNumbers.map((sNum, idx) => (
                <button
                  key={sNum}
                  ref={currentSlideIndex === idx ? activePillRef : null}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`px-3 py-1 rounded-lg font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                    currentSlideIndex === idx
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  Slide {sNum}
                </button>
              ))}
            </div>

            <button
              onClick={() =>
                setCurrentSlideIndex(
                  Math.min(editedSlides.length - 1, currentSlideIndex + 1)
                )
              }
              disabled={currentSlideIndex === editedSlides.length - 1}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer shrink-0 shadow-sm"
              title="Slide kế tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm nội dung đoạn văn..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Success Toast */}
        {saveToast && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveToast}</span>
            </div>
            <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body: Dual-Column Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
            <span className="font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              Slide {currentSlide?.slideIndex}: {currentSlide?.title || "Nội dung slide"}
            </span>
            <span className="font-mono text-slate-500">
              {filteredParagraphs.length} đoạn văn • Tô sáng thuật ngữ SOP
            </span>
          </div>

          <div className="space-y-3">
            {filteredParagraphs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                Không tìm thấy đoạn văn nào phù hợp trên Slide {currentSlide?.slideIndex}.
              </div>
            ) : (
              filteredParagraphs.map((p) => {
                const isEditing = activeEditingId === p.id;
                const baselineAiText = initialAiTranslationsRef.current[p.id];
                const isModified =
                  paragraphEdits[p.id] !== undefined ||
                  (baselineAiText !== undefined && baselineAiText !== p.translatedText);

                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border transition-all p-4 grid grid-cols-1 md:grid-cols-2 gap-4 ${
                      isModified
                        ? "bg-blue-950/20 border-blue-500/40 shadow-sm"
                        : "bg-slate-900/40 border-slate-800/90 hover:border-slate-700"
                    }`}
                  >
                    {/* Left Column: Original Vietnamese */}
                    <div className="space-y-1.5 pr-2 md:border-r md:border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
                          Tiếng Việt (Gốc)
                        </span>
                        <span className="text-[9px] font-mono text-slate-600">ID: {p.id}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                        {p.originalText}
                      </p>
                    </div>

                    {/* Right Column: Translated English with in-line editing */}
                    <div className="space-y-1.5 pl-0 md:pl-2 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 font-mono">
                              Tiếng Anh (SOP Target)
                            </span>
                            {isModified && (
                              <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
                                <Check className="w-2.5 h-2.5 text-blue-300" />
                                Đã sửa
                              </span>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="flex items-center space-x-1">
                              {isModified && (
                                <button
                                  type="button"
                                  onClick={() => handleResetParagraph(p.id)}
                                  className="p-1 text-slate-400 hover:text-amber-300 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Khôi phục câu dịch AI ban đầu"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                className="flex items-center gap-1 px-2 py-0.5 text-slate-400 hover:text-blue-300 text-[10px] rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Nhấp để chỉnh sửa bản dịch"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Sửa</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 mt-1">
                            <textarea
                              rows={3}
                              value={tempEditText}
                              onChange={(e) => setTempEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault();
                                  handleApplyEdit(p.id);
                                } else if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                              className="w-full bg-slate-950 border border-blue-500 rounded-xl p-2.5 text-xs text-white focus:outline-none font-sans leading-relaxed"
                              autoFocus
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">
                                Nhấn Ctrl+Enter hoặc Cập nhật để lưu
                              </span>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyEdit(p.id)}
                                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Cập nhật</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            onDoubleClick={() => handleStartEdit(p)}
                            className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap cursor-text hover:bg-slate-800/40 p-1.5 rounded-lg transition-colors"
                            title="Click đúp để chỉnh sửa trực tiếp"
                          >
                            {highlightFootwearTerms(p.translatedText)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 border-t border-slate-800 bg-[#090d16] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300/90 font-medium">
              Đã tự động lưu tất cả chỉnh sửa vào bộ nhớ trình duyệt (Đóng tab này hoặc tải lại trang vẫn giữ nguyên).
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              onClick={handleSaveAndExport}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang Tạo File PPTX...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu &amp; Tải Xuống File Đã Sửa</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
