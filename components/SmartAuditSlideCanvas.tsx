"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Pencil,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Eye,
  Layers,
  Info,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  X,
  ExternalLink,
  Camera,
  Grid,
  Maximize2,
  Minimize2,
  Copy,
  Split,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Focus,
  Columns,
  Scan,
  Languages,
  CheckCheck,
  Loader2,
  MousePointerClick,
  ListPlus,
  Zap,
} from "lucide-react";
import type {
  SmartAuditReport,
  ScannedTextUnit,
  TextUnitStatus,
  SlideVisualLayout,
  SlideVisualElement,
} from "@/services/translation/smart-detector";
import type { ViReferenceHandlingMode } from "./SmartAuditModal";

interface SmartAuditSlideCanvasProps {
  report: SmartAuditReport;
  selectedUnitIds: Set<string>;
  onToggleUnit: (unitId: string) => void;
  onSelectAllInSlide: (slideNum: number) => void;
  onDeselectAllInSlide: (slideNum: number) => void;
  customEdits: Record<string, string>;
  onSaveCustomEdit: (unitId: string, text: string) => void;
  onResetCustomEdit: (unitId: string) => void;
  initialSlideNum?: number;
  slidePairMap?: Map<number, { role: "en" | "vi"; partnerSlide: number; pairIndex: number }>;
  slideViHandling?: Record<number, ViReferenceHandlingMode>;
  onSetSlideViHandling?: (slideNum: number, mode: ViReferenceHandlingMode) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  element: SlideVisualElement;
  unit: ScannedTextUnit | null;
  selectedPhrase?: string;
  phraseTranslation?: string;
}

const STATUS_CONFIG: Record<
  TextUnitStatus,
  { label: string; bg: string; text: string; border: string; dot: string; canvasBorder: string; canvasBg: string }
> = {
  NEEDS_TRANSLATION: {
    label: "Cần dịch",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
    canvasBorder: "border-rose-500/80 hover:border-rose-400",
    canvasBg: "bg-rose-950/40 hover:bg-rose-950/60",
  },
  ALREADY_TRANSLATED: {
    label: "Đã dịch",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
    canvasBorder: "border-emerald-500/70 hover:border-emerald-400",
    canvasBg: "bg-emerald-950/40 hover:bg-emerald-950/60",
  },
  TM_REUSE: {
    label: "Bộ nhớ TM",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    dot: "bg-blue-500",
    canvasBorder: "border-blue-500/80 hover:border-blue-400",
    canvasBg: "bg-blue-950/40 hover:bg-blue-950/60",
  },
  LOCKED_TERMINOLOGY: {
    label: "Thuật ngữ chuẩn",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-300 dark:border-indigo-800",
    dot: "bg-indigo-500",
    canvasBorder: "border-indigo-500/80 hover:border-indigo-400",
    canvasBg: "bg-indigo-950/40 hover:bg-indigo-950/60",
  },
  NON_TRANSLATABLE: {
    label: "Mã / Số kỹ thuật",
    bg: "bg-slate-50 dark:bg-slate-900/50",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    canvasBorder: "border-slate-600/70 hover:border-slate-400",
    canvasBg: "bg-slate-900/50 hover:bg-slate-900/70",
  },
  MIXED_LANGUAGE: {
    label: "Hỗn hợp VI/EN",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
    canvasBorder: "border-amber-500/80 hover:border-amber-400",
    canvasBg: "bg-amber-950/40 hover:bg-amber-950/60",
  },
  POSSIBLE_TRANSLATION: {
    label: "Gợi ý tương tự",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-800",
    dot: "bg-purple-500",
    canvasBorder: "border-purple-500/80 hover:border-purple-400",
    canvasBg: "bg-purple-950/40 hover:bg-purple-950/60",
  },
  REVIEW_REQUIRED: {
    label: "Cần xem xét",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
    canvasBorder: "border-amber-500/80 hover:border-amber-400",
    canvasBg: "bg-amber-950/40 hover:bg-amber-950/60",
  },
  SUSPICIOUS_TRANSLATION: {
    label: "Nghi ngờ sai lệch",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-800",
    dot: "bg-orange-500",
    canvasBorder: "border-orange-500/80 hover:border-orange-400",
    canvasBg: "bg-orange-950/40 hover:bg-orange-950/60",
  },
  TRANSLATION_CONFLICT: {
    label: "Xung đột bản dịch",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
    canvasBorder: "border-rose-500/80 hover:border-rose-400",
    canvasBg: "bg-rose-950/40 hover:bg-rose-950/60",
  },
};

function getElementTextColor(fill?: string, explicitColor?: string): string {
  const upperFill = fill?.toUpperCase() || "";
  if (
    upperFill === "#FF8810" ||
    upperFill === "#ED7D31" ||
    upperFill === "#FF0000" ||
    upperFill === "#C00000" ||
    upperFill === "#002060"
  ) {
    return "#FFFFFF";
  }

  if (upperFill === "#00B0F0" || upperFill === "#92D050" || upperFill === "#70AD47") {
    return "#0f172a";
  }

  if (explicitColor) {
    if (explicitColor.toUpperCase() === "#FFFFFF") return "#FFFFFF";
    if (explicitColor.toUpperCase() === "#000000") return "#0f172a";
    return explicitColor;
  }

  return "#0f172a";
}

export const SmartAuditSlideCanvas: React.FC<SmartAuditSlideCanvasProps> = ({
  report,
  selectedUnitIds,
  onToggleUnit,
  onSelectAllInSlide,
  onDeselectAllInSlide,
  customEdits,
  onSaveCustomEdit,
  onResetCustomEdit,
  initialSlideNum = 1,
  slidePairMap,
  slideViHandling,
  onSetSlideViHandling,
}) => {
  // Current active slide number
  const [currentSlide, setCurrentSlide] = useState<number>(() => {
    if (initialSlideNum && initialSlideNum >= 1 && initialSlideNum <= report.totalSlides) {
      return initialSlideNum;
    }
    if (report.affectedSlides && report.affectedSlides.length > 0) {
      return report.affectedSlides[0];
    }
    return 1;
  });

  // Display mode for text inside layers: "bilingual" | "target" | "source"
  const [viewMode, setViewMode] = useState<"bilingual" | "target" | "source">("target");

  // Layout presentation mode: "pptx" (spatial 1:1) | "cards" (sequential list) | "split" (both) | "isq_dual" (paired ISQ side-by-side)
  const [layoutMode, setLayoutMode] = useState<"pptx" | "cards" | "split" | "isq_dual">("pptx");

  // Image visibility: "hidden" (strictly deletes/removes images for clean review) | "wireframe" (shows light dashed placeholder)
  const [imageVisibility, setImageVisibility] = useState<"hidden" | "wireframe">("hidden");

  // Selected element on the canvas
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Inline edit state
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");

  // Filter slides in navigator
  const [filterPendingOnly, setFilterPendingOnly] = useState<boolean>(false);

  // Copy feedback
  const [copiedUnitId, setCopiedUnitId] = useState<string | null>(null);

  // Zoom scale: 1.0 = Fit to Container, > 1.0 = Zoomed in
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState<boolean>(false);

  // Focus Mode (dims translated/immutable cells, lights up pending ones)
  const [focusPendingOnly, setFocusPendingOnly] = useState<boolean>(false);

  // Right-click custom Pop-up Translate state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isTranslatingQuick, setIsTranslatingQuick] = useState<boolean>(false);
  const [batchTranslateProgress, setBatchTranslateProgress] = useState<{ current: number; total: number } | null>(null);

  // Container dimensions for 100% Visual Fit without scroll
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close context menu on window click
  useEffect(() => {
    const handleWindowClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [contextMenu]);

  // Group units by slide
  const slideMap = useMemo(() => {
    const map = new Map<number, ScannedTextUnit[]>();
    for (const u of report.units) {
      const s = u.location.slideIndex ?? 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(u);
    }
    return map;
  }, [report.units]);

  // List of all slide indices (1 to totalSlides)
  const allSlideNumbers = useMemo(() => {
    return Array.from({ length: report.totalSlides }, (_, i) => i + 1);
  }, [report.totalSlides]);

  // Slides that have units needing translation
  const pendingSlideNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const u of report.units) {
      if (u.status === "NEEDS_TRANSLATION" || u.status === "MIXED_LANGUAGE" || u.status === "REVIEW_REQUIRED") {
        set.add(u.location.slideIndex ?? 1);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [report.units]);

  // Slides displayed in the quick selector strip
  const displayedSlideStrip = useMemo(() => {
    return filterPendingOnly ? pendingSlideNumbers : allSlideNumbers;
  }, [filterPendingOnly, pendingSlideNumbers, allSlideNumbers]);

  // Units on the current slide
  const currentUnits = useMemo(() => {
    return slideMap.get(currentSlide) || [];
  }, [slideMap, currentSlide]);

  // Lookup map of units by ID for this slide
  const unitById = useMemo(() => {
    const map = new Map<string, ScannedTextUnit>();
    for (const u of currentUnits) {
      map.set(u.id, u);
    }
    return map;
  }, [currentUnits]);

  // Selected units in current slide
  const selectedInCurrentSlide = useMemo(() => {
    return currentUnits.filter((u) => selectedUnitIds.has(u.id));
  }, [currentUnits, selectedUnitIds]);

  // Active visual layout for current slide
  const currentVisualLayout = useMemo(() => {
    if (report.visualLayouts && report.visualLayouts.length > 0) {
      const found = report.visualLayouts.find((l) => l.slideIndex === currentSlide);
      if (found && found.elements.length > 0) return found;
    }

    const elements: SlideVisualElement[] = [];
    currentUnits.forEach((u, idx) => {
      const box = u.location.box || {
        left: 5,
        top: Math.min(85, 10 + idx * 8),
        width: 90,
        height: 6,
      };
      elements.push({
        id: `synth_${u.id}`,
        type: u.location.isTable ? "table" : "text",
        box,
        unitId: u.id,
        unitIds: [u.id],
        isTitle: u.location.isTitle,
        shapeName: u.location.isTitle ? "Tiêu đề Slide" : `Khung chữ #${idx + 1}`,
      });
    });

    return {
      slideIndex: currentSlide,
      widthEmu: 9144000,
      heightEmu: 6858000,
      aspectRatio: 16 / 9,
      elements,
    } as SlideVisualLayout;
  }, [report.visualLayouts, currentSlide, currentUnits]);

  // Separate title, table, and body units
  const { titleUnit, tableUnits, bodyUnits } = useMemo(() => {
    let title: ScannedTextUnit | undefined;
    const tables: ScannedTextUnit[] = [];
    const bodies: ScannedTextUnit[] = [];

    for (const u of currentUnits) {
      if (u.location.isTitle && !title) {
        title = u;
      } else if (u.location.isTable) {
        tables.push(u);
      } else {
        bodies.push(u);
      }
    }

    if (!title && bodies.length > 0 && bodies[0].sourceText.length <= 80 && !bodies[0].sourceText.includes("\n")) {
      title = bodies.shift();
    }

    return { titleUnit: title, tableUnits: tables, bodyUnits: bodies };
  }, [currentUnits]);

  // Current slide statistics
  const slideStats = useMemo(() => {
    const total = currentUnits.length;
    const selected = currentUnits.filter((u) => selectedUnitIds.has(u.id)).length;
    const needsTrans = currentUnits.filter(
      (u) => u.status === "NEEDS_TRANSLATION" || u.status === "MIXED_LANGUAGE"
    ).length;
    const translated = currentUnits.filter(
      (u) => u.status === "ALREADY_TRANSLATED" || u.status === "TM_REUSE" || u.status === "LOCKED_TERMINOLOGY"
    ).length;
    return { total, selected, needsTrans, translated };
  }, [currentUnits, selectedUnitIds]);

  // ISQ Pair info for current slide
  const pairInfo = slidePairMap?.get(currentSlide);
  const isViReferenceSlide =
    pairInfo?.role === "vi" || currentUnits.some((u) => u.location.isIsqReference);
  const partnerSlideNum = pairInfo?.partnerSlide;

  // Dual Slide ISQ Information
  const dualSlideInfo = useMemo(() => {
    if (!partnerSlideNum) return null;
    const viNum = isViReferenceSlide ? currentSlide : partnerSlideNum;
    const enNum = isViReferenceSlide ? partnerSlideNum : currentSlide;
    const viUnits = slideMap.get(viNum) || [];
    const enUnits = slideMap.get(enNum) || [];
    const viUnitsMap = new Map<string, ScannedTextUnit>(viUnits.map((u) => [u.id, u]));
    const enUnitsMap = new Map<string, ScannedTextUnit>(enUnits.map((u) => [u.id, u]));

    const viLayout = report.visualLayouts?.find((l) => l.slideIndex === viNum) || {
      slideIndex: viNum,
      widthEmu: 9144000,
      heightEmu: 6858000,
      aspectRatio: 16 / 9,
      elements: [],
    };
    const enLayout = report.visualLayouts?.find((l) => l.slideIndex === enNum) || {
      slideIndex: enNum,
      widthEmu: 9144000,
      heightEmu: 6858000,
      aspectRatio: 16 / 9,
      elements: [],
    };

    return { viNum, enNum, viUnits, enUnits, viUnitsMap, enUnitsMap, viLayout, enLayout };
  }, [partnerSlideNum, isViReferenceSlide, currentSlide, slideMap, report.visualLayouts]);

  // Helper to get effective translation
  const getTranslationText = useCallback(
    (unit: ScannedTextUnit): string => {
      if (customEdits[unit.id] !== undefined) return customEdits[unit.id];
      if (unit.suggestedTranslation && unit.suggestedTranslation.trim().toLowerCase() !== unit.sourceText.trim().toLowerCase()) {
        return unit.suggestedTranslation;
      }
      if (unit.existingTranslation && unit.existingTranslation.trim().toLowerCase() !== unit.sourceText.trim().toLowerCase()) {
        return unit.existingTranslation;
      }
      return "";
    },
    [customEdits]
  );

  // Navigation handlers
  const handlePrevSlide = useCallback(() => {
    if (currentSlide > 1) {
      setCurrentSlide((prev) => prev - 1);
      setEditingUnitId(null);
      setSelectedElementId(null);
      setContextMenu(null);
    }
  }, [currentSlide]);

  const handleNextSlide = useCallback(() => {
    if (currentSlide < report.totalSlides) {
      setCurrentSlide((prev) => prev + 1);
      setEditingUnitId(null);
      setSelectedElementId(null);
      setContextMenu(null);
    }
  }, [currentSlide, report.totalSlides]);

  const handleNextPendingSlide = useCallback(() => {
    const next = pendingSlideNumbers.find((s) => s > currentSlide);
    if (next) {
      setCurrentSlide(next);
      setEditingUnitId(null);
      setSelectedElementId(null);
      setContextMenu(null);
    } else if (pendingSlideNumbers.length > 0) {
      setCurrentSlide(pendingSlideNumbers[0]);
      setEditingUnitId(null);
      setSelectedElementId(null);
      setContextMenu(null);
    }
  }, [pendingSlideNumbers, currentSlide]);

  const startEdit = useCallback(
    (unit: ScannedTextUnit, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setEditingUnitId(unit.id);
      setEditText(getTranslationText(unit) || unit.sourceText);
    },
    [getTranslationText]
  );

  const saveEdit = useCallback(
    (unitId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      onSaveCustomEdit(unitId, editText);
      setEditingUnitId(null);
    },
    [editText, onSaveCustomEdit]
  );

  const cancelEdit = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingUnitId(null);
  }, []);

  const resetEdit = useCallback(
    (unitId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      onResetCustomEdit(unitId);
      setEditingUnitId(null);
    },
    [onResetCustomEdit]
  );

  const handleCopyText = useCallback((text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedUnitId(id);
    setTimeout(() => setCopiedUnitId(null), 1500);
  }, []);

  // Determine currently inspected element
  const inspectedElement = useMemo(() => {
    if (!currentVisualLayout) return null;
    if (selectedElementId) {
      const found = currentVisualLayout.elements.find((el) => el.id === selectedElementId);
      if (found) return found;
    }
    return null;
  }, [currentVisualLayout, selectedElementId]);

  // Inspected unit (if text/table element)
  const inspectedUnit = useMemo(() => {
    if (!inspectedElement?.unitId) return null;
    return unitById.get(inspectedElement.unitId) || null;
  }, [inspectedElement, unitById]);

  // Stepping through layers
  const handleSelectNextLayer = useCallback(() => {
    if (!currentVisualLayout || currentVisualLayout.elements.length === 0) return;
    const curIdx = currentVisualLayout.elements.findIndex((el) => el.id === inspectedElement?.id);
    const nextIdx = (curIdx + 1) % currentVisualLayout.elements.length;
    setSelectedElementId(currentVisualLayout.elements[nextIdx].id);
  }, [currentVisualLayout, inspectedElement]);

  const handleSelectPrevLayer = useCallback(() => {
    if (!currentVisualLayout || currentVisualLayout.elements.length === 0) return;
    const curIdx = currentVisualLayout.elements.findIndex((el) => el.id === inspectedElement?.id);
    const prevIdx = (curIdx - 1 + currentVisualLayout.elements.length) % currentVisualLayout.elements.length;
    setSelectedElementId(currentVisualLayout.elements[prevIdx].id);
  }, [currentVisualLayout, inspectedElement]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === "input" || activeTag === "textarea";

      if (isInputActive) {
        if (e.key === "Escape") {
          cancelEdit();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          if (editingUnitId) {
            onSaveCustomEdit(editingUnitId, editText);
            setEditingUnitId(null);
          }
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) handleSelectPrevLayer();
        else handleSelectNextLayer();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (inspectedUnit) startEdit(inspectedUnit);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (contextMenu) setContextMenu(null);
        else if (editingUnitId) cancelEdit();
        else if (selectedElementId) setSelectedElementId(null);
      } else if (e.key === " ") {
        e.preventDefault();
        if (inspectedUnit) onToggleUnit(inspectedUnit.id);
      } else if (e.key.toLowerCase() === "f") {
        setFocusPendingOnly((prev) => !prev);
      } else if (e.key === "+" || e.key === "=") {
        setZoomScale((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
      } else if (e.key === "-") {
        setZoomScale((prev) => Math.max(0.7, Number((prev - 0.1).toFixed(2))));
      } else if (e.key === "0") {
        setZoomScale(1.0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handlePrevSlide,
    handleNextSlide,
    handleSelectNextLayer,
    handleSelectPrevLayer,
    inspectedUnit,
    editingUnitId,
    selectedElementId,
    contextMenu,
    startEdit,
    cancelEdit,
    onToggleUnit,
    onSaveCustomEdit,
    editText,
  ]);

  // ==========================================================================
  // TRANSLATION ACTIONS (SINGLE & BATCH)
  // ==========================================================================

  const handleTranslateSingleUnit = async (unit: ScannedTextUnit) => {
    setIsTranslatingQuick(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: unit.sourceText,
          sourceLanguage: "vi",
          targetLanguage: "en",
        }),
      });
      const data = await res.json();
      if (res.ok && data.translatedText) {
        onSaveCustomEdit(unit.id, data.translatedText);
      } else {
        alert("Dịch thất bại: " + (data.error || "Lỗi không xác định"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối dịch: " + err.message);
    } finally {
      setIsTranslatingQuick(false);
      setContextMenu(null);
    }
  };

  const handleTranslatePhrase = async (phrase: string) => {
    setIsTranslatingQuick(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: phrase,
          sourceLanguage: "vi",
          targetLanguage: "en",
        }),
      });
      const data = await res.json();
      if (res.ok && data.translatedText) {
        setContextMenu((prev) => (prev ? { ...prev, phraseTranslation: data.translatedText } : null));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslatingQuick(false);
    }
  };

  const handleBatchTranslateSelected = async () => {
    const unitsToTranslate = currentUnits.filter((u) => selectedUnitIds.has(u.id));
    if (unitsToTranslate.length === 0) return;

    setIsTranslatingQuick(true);
    setBatchTranslateProgress({ current: 0, total: unitsToTranslate.length });

    try {
      for (let i = 0; i < unitsToTranslate.length; i++) {
        const u = unitsToTranslate[i];
        setBatchTranslateProgress({ current: i + 1, total: unitsToTranslate.length });
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceText: u.sourceText,
            sourceLanguage: "vi",
            targetLanguage: "en",
          }),
        });
        const data = await res.json();
        if (res.ok && data.translatedText) {
          onSaveCustomEdit(u.id, data.translatedText);
        }
      }
    } catch (err: any) {
      alert("Lỗi khi dịch hàng loạt: " + err.message);
    } finally {
      setIsTranslatingQuick(false);
      setBatchTranslateProgress(null);
      setContextMenu(null);
    }
  };

  // ==========================================================================
  // MATHEMATICAL VISUAL-FIT CALCULATION (ZERO VERTICAL SCROLL GUARANTEE)
  // ==========================================================================

  const slideDimensions = useMemo(() => {
    const rawAspect = currentVisualLayout?.aspectRatio || (16 / 9);
    const containerW = containerSize.width || 1200;
    const containerH = containerSize.height || 650;

    const availW = Math.max(100, containerW - 32);
    const availH = Math.max(100, containerH - 32);

    let fitW = availW;
    let fitH = availW / rawAspect;

    if (fitH > availH) {
      fitH = availH;
      fitW = availH * rawAspect;
    }

    return {
      width: Math.floor(fitW * zoomScale),
      height: Math.floor(fitH * zoomScale),
      aspectRatio: rawAspect,
    };
  }, [containerSize, currentVisualLayout, zoomScale]);

  const dualSlideDimensions = useMemo(() => {
    const rawAspect = currentVisualLayout?.aspectRatio || (16 / 9);
    const containerW = containerSize.width || 1200;
    const containerH = containerSize.height || 650;

    const availW = Math.max(100, (containerW - 48) / 2);
    const availH = Math.max(100, containerH - 40);

    let fitW = availW;
    let fitH = availW / rawAspect;

    if (fitH > availH) {
      fitH = availH;
      fitW = availH * rawAspect;
    }

    return {
      width: Math.floor(fitW * zoomScale),
      height: Math.floor(fitH * zoomScale),
      aspectRatio: rawAspect,
    };
  }, [containerSize, currentVisualLayout, zoomScale]);

  // ==========================================================================
  // MODULAR SLIDE SHEET RENDERER
  // ==========================================================================

  const renderSlideSheet = (
    slideNum: number,
    layout: SlideVisualLayout,
    unitsMap: Map<string, ScannedTextUnit>,
    activeViewMode: "target" | "source" | "bilingual",
    customWidth?: number,
    customHeight?: number
  ) => {
    const sheetWidth = customWidth || slideDimensions.width;
    const sheetHeight = customHeight || slideDimensions.height;

    return (
      <div
        className="relative rounded-lg shadow-2xl overflow-hidden border border-slate-300 dark:border-slate-700 select-text bg-white shrink-0"
        style={{
          width: `${sheetWidth}px`,
          height: `${sheetHeight}px`,
          backgroundColor: layout?.backgroundColor || "#FFFFFF",
        }}
      >
        {/* Slide Header Indicator Badge */}
        <div className="absolute top-1.5 right-2 flex items-center gap-1.5 text-[10px] font-mono text-slate-600 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 z-20 shadow-2xs backdrop-blur-xs">
          <Presentation className="w-3 h-3 text-orange-500" />
          <span className="font-bold">SLIDE {slideNum}</span>
          {activeViewMode === "source" ? (
            <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
              VI Nguồn
            </span>
          ) : activeViewMode === "target" ? (
            <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
              EN Đích
            </span>
          ) : null}
        </div>

        {/* Spatial Elements */}
        {layout?.elements.map((el) => {
          const isSelected = selectedElementId === el.id;

          // 1. PICTURE SHAPES (ZERO-IMAGE DELETION)
          if (el.type === "image") {
            if (imageVisibility === "hidden") {
              return null;
            }
            return (
              <div
                key={el.id}
                onClick={() => setSelectedElementId(el.id)}
                style={{
                  position: "absolute",
                  left: `${el.box.left}%`,
                  top: `${el.box.top}%`,
                  width: `${el.box.width}%`,
                  height: `${el.box.height}%`,
                }}
                className={`rounded-lg border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-1 overflow-hidden z-10 ${
                  isSelected
                    ? "border-cyan-500 bg-cyan-950/40 ring-2 ring-cyan-400"
                    : "border-cyan-500/40 bg-cyan-950/10 hover:border-cyan-400"
                }`}
                title={`${el.shapeName || "Khung ảnh"} (L:${el.box.left}% T:${el.box.top}% W:${el.box.width}% H:${el.box.height}%)`}
              >
                <Camera className="w-3.5 h-3.5 text-cyan-500 mb-0.5" />
                <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 text-center leading-tight">
                  [ Khung ảnh gốc • Zero-Image ]
                </span>
              </div>
            );
          }

          // 2. TEXT BOX OR TABLE CELL
          const elementUnits = (el.unitIds && el.unitIds.length > 0)
            ? el.unitIds.map((id) => unitsMap.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
            : el.unitId && unitsMap.get(el.unitId)
            ? [unitsMap.get(el.unitId)!]
            : [];

          const primaryUnit = elementUnits[0];
          const isChecked = primaryUnit ? selectedUnitIds.has(primaryUnit.id) : false;

          const isSmallMarker =
            (el.box.width <= 5 && el.box.height <= 6) ||
            (!primaryUnit && el.box.width <= 6 && el.box.height <= 6);
          const isOval =
            el.shapeName?.toLowerCase().includes("oval") || el.shapeName?.toLowerCase().includes("circle");
          const isTopBanner =
            el.fill === "#FF8810" || el.fill === "#ED7D31" || (el.box.top < 3 && el.box.width >= 75);
          const isCyanHeader = el.fill === "#00B0F0" || (el.type === "cell" && el.tableRow === 0);
          const isBadge = el.fill === "#92D050" || el.fill === "#FF0000" || el.fill === "#C00000";

          const bgColor =
            el.fill || (isCyanHeader ? "#00B0F0" : el.type === "cell" ? "#FFFFFF" : "transparent");
          const textColor = getElementTextColor(bgColor, el.textColor);

          const isCentered =
            isSmallMarker ||
            isTopBanner ||
            isCyanHeader ||
            isBadge ||
            el.align === "center" ||
            el.isTitle;

          const borderStyle = isSmallMarker
            ? isOval
              ? "1px solid rgba(0,0,0,0.15)"
              : undefined
            : el.border || (el.type === "cell" ? "1px solid #cbd5e1" : isSelected ? "2px solid #0284c7" : undefined);

          const paddingStyle = isSmallMarker
            ? "0"
            : isTopBanner
            ? "3px 8px"
            : isCyanHeader
            ? "4px 6px"
            : el.type === "cell"
            ? "6px 8px"
            : "2px 4px";

          // Focus Mode Dimming
          const isPending =
            primaryUnit &&
            (primaryUnit.status === "NEEDS_TRANSLATION" ||
              primaryUnit.status === "MIXED_LANGUAGE" ||
              primaryUnit.status === "REVIEW_REQUIRED");
          const isDimmed = focusPendingOnly && !isPending && !isSelected;

          return (
            <div
              key={el.id}
              onClick={(e) => {
                // Multi-selection with Ctrl/Cmd/Shift
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  e.stopPropagation();
                  if (primaryUnit) onToggleUnit(primaryUnit.id);
                } else {
                  setSelectedElementId(el.id);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (primaryUnit) startEdit(primaryUnit, e);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const sel = window.getSelection()?.toString().trim();
                const x = Math.min(e.clientX, window.innerWidth - 350);
                const y = Math.min(e.clientY, window.innerHeight - 440);

                setSelectedElementId(el.id);
                setContextMenu({
                  x: Math.max(10, x),
                  y: Math.max(10, y),
                  element: el,
                  unit: primaryUnit || null,
                  selectedPhrase: sel && sel.length > 0 ? sel : undefined,
                });
              }}
              style={{
                position: "absolute",
                left: `${el.box.left}%`,
                top: `${el.box.top}%`,
                width: `${el.box.width}%`,
                height: `${el.box.height}%`,
                backgroundColor: bgColor,
                color: textColor,
                border: borderStyle,
                padding: paddingStyle,
                borderRadius: isOval ? "9999px" : isBadge ? "4px" : isTopBanner ? "0px" : undefined,
                display: "flex",
                flexDirection: "column",
                justifyContent: isCentered ? "center" : "flex-start",
                alignItems: isCentered ? "center" : "stretch",
                textAlign: isCentered ? "center" : "left",
                opacity: isDimmed ? 0.22 : 1.0,
                filter: isDimmed ? "grayscale(80%)" : "none",
                transition: "opacity 0.2s, filter 0.2s, border-color 0.15s, box-shadow 0.15s",
              }}
              className={`group cursor-pointer overflow-y-auto select-text ${
                isSelected
                  ? "ring-2 ring-sky-500 shadow-xl z-30"
                  : isChecked
                  ? "ring-2 ring-sky-400 bg-sky-50/20 z-20"
                  : isPending && focusPendingOnly
                  ? "ring-2 ring-rose-500 shadow-md animate-pulse z-20"
                  : "hover:ring-1 hover:ring-sky-400/80 z-10"
              }`}
              title={`${el.shapeName || "Phần tử"} • Bấm chuột phải để mở Pop-up Dịch • Nhấp đúp để sửa`}
            >
              {/* Corner handles when selected */}
              {isSelected && (
                <>
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-sky-500 border border-white rounded-2xs pointer-events-none" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 border border-white rounded-2xs pointer-events-none" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-sky-500 border border-white rounded-2xs pointer-events-none" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-sky-500 border border-white rounded-2xs pointer-events-none" />
                </>
              )}

              {/* Multi-Selection Checkmark Badge */}
              {isChecked && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (primaryUnit) onToggleUnit(primaryUnit.id);
                  }}
                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-sky-500 hover:bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs z-20 cursor-pointer transition-colors"
                  title="Đã chọn dịch (Bấm để bỏ chọn)"
                >
                  ✓
                </div>
              )}

              {/* Floating Quick-Action Bar Anchored Above Element */}
              {isSelected && primaryUnit && !isSmallMarker && !contextMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white border border-slate-700/80 rounded-xl px-2.5 py-1 shadow-2xl flex items-center gap-1.5 z-50 text-[11px] whitespace-nowrap pointer-events-auto backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  <button
                    type="button"
                    onClick={() => onToggleUnit(primaryUnit.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer font-medium transition-colors"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3 h-3 text-sky-400" />
                    ) : (
                      <Square className="w-3 h-3 text-slate-400" />
                    )}
                    <span>{isChecked ? "Bỏ chọn" : "Chọn dịch"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => startEdit(primaryUnit, e)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white cursor-pointer font-semibold transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Sửa chữ (Enter)</span>
                  </button>

                  {primaryUnit.suggestedTranslation && (
                    <button
                      type="button"
                      onClick={() => onSaveCustomEdit(primaryUnit.id, primaryUnit.suggestedTranslation!)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer font-medium transition-colors"
                      title={`Áp dụng gợi ý TM: ${primaryUnit.suggestedTranslation}`}
                    >
                      <Sparkles className="w-3 h-3 text-emerald-300" />
                      <span>Áp dụng TM</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedElementId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer transition-colors"
                    title="Đóng thanh công cụ"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Text Body Rendering - 100% CLEAN, UNOBSTRUCTED TEXT */}
              <div
                className={`w-full ${
                  isTopBanner
                    ? "text-xs sm:text-sm font-bold tracking-wide"
                    : isCyanHeader
                    ? "text-[11px] sm:text-[12px] font-bold uppercase tracking-wider"
                    : isBadge
                    ? "text-[11px] sm:text-[12px] font-bold tracking-wider"
                    : isSmallMarker
                    ? "text-[9px] font-bold leading-none text-center"
                    : "text-[10px] sm:text-[11px] lg:text-[12px] leading-snug space-y-1"
                }`}
              >
                {elementUnits.length > 0 ? (
                  elementUnits.map((u, uIdx) => {
                    const isEditingThis = editingUnitId === u.id;
                    const transText = getTranslationText(u);
                    const isHeading =
                      u.sourceText.startsWith("*") ||
                      u.location.isTitle ||
                      el.isTitle ||
                      el.isBold;

                    if (isEditingThis) {
                      return (
                        <div
                          key={u.id}
                          onClick={(e) => e.stopPropagation()}
                          className="space-y-1 bg-white dark:bg-slate-900 p-1.5 rounded-lg border-2 border-sky-500 text-slate-900 dark:text-white shadow-lg text-left"
                        >
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            className="w-full p-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-sky-400 font-sans"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                            >
                              Hủy (Esc)
                            </button>
                            <button
                              type="button"
                              onClick={(e) => saveEdit(u.id, e)}
                              className="px-2 py-0.5 rounded text-[10px] bg-sky-600 text-white font-semibold hover:bg-sky-500 cursor-pointer"
                            >
                              Lưu (Enter)
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const displayedContent =
                      activeViewMode === "target"
                        ? transText || u.sourceText
                        : activeViewMode === "source"
                        ? u.sourceText
                        : null;

                    return (
                      <div
                        key={u.id}
                        className={`${isHeading ? "font-bold" : "font-normal"} ${uIdx > 0 ? "mt-1.5" : ""} break-words`}
                      >
                        {displayedContent !== null ? (
                          <span>{displayedContent}</span>
                        ) : (
                          <div>
                            <div className="opacity-70 text-[0.9em]">{u.sourceText}</div>
                            <div className="font-semibold text-sky-600 dark:text-sky-400">
                              ➔ {transText || "(Chờ dịch)"}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : el.text ? (
                  <div className={`${el.isBold ? "font-bold" : "font-normal"} break-words`}>
                    {el.text}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`h-full flex flex-col min-h-0 overflow-hidden space-y-2 select-none ${
        isCanvasFullscreen ? "fixed inset-0 z-[100] bg-slate-950 p-4" : ""
      }`}
    >
      {/* 1. Sleek & Compact Header Bar */}
      <div className="bg-slate-50 dark:bg-[#121622] px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Slide Pager */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevSlide}
              disabled={currentSlide <= 1}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
              title="Slide trước (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <Presentation className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Slide {currentSlide} / {report.totalSlides}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextSlide}
              disabled={currentSlide >= report.totalSlides}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
              title="Slide tiếp theo (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {pendingSlideNumbers.length > 0 && (
              <button
                type="button"
                onClick={handleNextPendingSlide}
                className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                title="Chuyển tới slide có đoạn chưa dịch tiếp theo"
              >
                <Sparkles className="w-3 h-3 text-rose-500" />
                <span>Đến slide thiếu ({pendingSlideNumbers.length})</span>
              </button>
            )}
          </div>

          {/* Center: Presentation Mode */}
          <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-full border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setLayoutMode("pptx")}
              className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                layoutMode === "pptx"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Xem trước Slide PPTX thực tế 1:1"
            >
              <Presentation className="w-3 h-3 text-orange-400" />
              <span>Xem trước PPTX (1:1)</span>
            </button>

            {partnerSlideNum && (
              <button
                type="button"
                onClick={() => setLayoutMode("isq_dual")}
                className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  layoutMode === "isq_dual"
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                }`}
                title={`So sánh đối chiếu song song: Slide ${dualSlideInfo?.viNum} (VI) ⟷ Slide ${dualSlideInfo?.enNum} (EN)`}
              >
                <Columns className="w-3 h-3 text-sky-400" />
                <span>So sánh ISQ (VI ⟷ EN)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLayoutMode("cards")}
              className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                layoutMode === "cards"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Xem danh sách thẻ tuần tự"
            >
              <FileText className="w-3 h-3 text-blue-400" />
              <span>Danh sách thẻ</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode("split")}
              className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1 hidden md:flex ${
                layoutMode === "split"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Chế độ chia đôi"
            >
              <Split className="w-3 h-3 text-purple-400" />
              <span>Chia đôi</span>
            </button>
          </div>

          {/* Right: Language View, Focus, Zoom & Fit */}
          <div className="flex items-center gap-1.5 text-xs">
            {/* Batch Selected Quick Action Pill */}
            {selectedInCurrentSlide.length > 0 && (
              <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-700 px-2.5 py-0.5 rounded-full text-xs text-sky-800 dark:text-sky-300 font-semibold shadow-2xs">
                <span>Đã chọn: <strong>{selectedInCurrentSlide.length}</strong> ô</span>
                <button
                  type="button"
                  disabled={isTranslatingQuick}
                  onClick={handleBatchTranslateSelected}
                  className="px-2 py-0.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isTranslatingQuick ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5 text-amber-300" />}
                  <span>Dịch ({selectedInCurrentSlide.length})</span>
                </button>
              </div>
            )}

            {/* Focus Mode */}
            <button
              type="button"
              onClick={() => setFocusPendingOnly((prev) => !prev)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer border ${
                focusPendingOnly
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
              }`}
              title="Focus Tiêu Điểm: Làm mờ các ô đã dịch, chỉ sáng ô cần dịch (F)"
            >
              <Focus className="w-3 h-3" />
              <span>{focusPendingOnly ? "Đang Focus" : "Focus (F)"}</span>
            </button>

            {/* Zero-Image Watermark Toggle */}
            <button
              type="button"
              onClick={() => setImageVisibility((v) => (v === "hidden" ? "wireframe" : "hidden"))}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer border ${
                imageVisibility === "hidden"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
              }`}
              title="Đã xóa ảnh bảo mật (Zero-Image)"
            >
              <Camera className="w-3 h-3 text-emerald-500" />
              <span>{imageVisibility === "hidden" ? "Đã xóa ảnh" : "Hiện khung ảnh"}</span>
            </button>

            {/* EN / VI / Song ngữ Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode("target")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "target"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
                title="Bản dịch tiếng Anh (chuẩn xuất slide)"
              >
                🇬🇧 EN
              </button>
              <button
                type="button"
                onClick={() => setViewMode("source")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "source"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
                title="Bản gốc tiếng Việt"
              >
                🇻🇳 VI
              </button>
              <button
                type="button"
                onClick={() => setViewMode("bilingual")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "bilingual"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
                title="Song ngữ đối chiếu"
              >
                🔀 Song ngữ
              </button>
            </div>

            {/* Zoom & Fit Controls */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(0.7, Number((prev - 0.1).toFixed(2))))}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                title="Thu nhỏ (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(1.0)}
                className="px-1.5 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 hover:text-sky-500 cursor-pointer flex items-center gap-0.5"
                title="Visual Fit (Tự động khớp khung hình - Phím 0)"
              >
                <Scan className="w-2.5 h-2.5 text-sky-500" />
                <span>{Math.round(zoomScale * 100)}%</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))))}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                title="Phóng to (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsCanvasFullscreen((prev) => !prev)}
              className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer transition-colors"
              title={isCanvasFullscreen ? "Thu nhỏ về cửa sổ" : "Mở rộng toàn màn hình canvas"}
            >
              {isCanvasFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Compact Slide Strip */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
            <span>Slide:</span>
            <label className="flex items-center gap-1 cursor-pointer text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={filterPendingOnly}
                onChange={(e) => setFilterPendingOnly(e.target.checked)}
                className="rounded text-rose-600 focus:ring-0 cursor-pointer w-3 h-3"
              />
              <span>Chỉ thiếu</span>
            </label>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-thin">
            {displayedSlideStrip.map((sNum) => {
              const uList = slideMap.get(sNum) || [];
              const hasPending = uList.some(
                (u) => u.status === "NEEDS_TRANSLATION" || u.status === "MIXED_LANGUAGE"
              );
              const isSelected = sNum === currentSlide;
              const selectedCount = uList.filter((u) => selectedUnitIds.has(u.id)).length;

              return (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => {
                    setCurrentSlide(sNum);
                    setEditingUnitId(null);
                    setSelectedElementId(null);
                    setContextMenu(null);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold shrink-0 transition-all flex items-center gap-1 cursor-pointer border ${
                    isSelected
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-slate-900 dark:border-white shadow-2xs"
                      : hasPending
                      ? "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      hasPending ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                    }`}
                  />
                  <span>S{sNum}</span>
                  {selectedCount > 0 && (
                    <span className="text-[9px] opacity-80 font-mono">({selectedCount})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. THE CORE WORKSPACE: 100% VISUAL FIT CANVAS (ZERO SCROLL) */}
      <div
        ref={canvasContainerRef}
        onContextMenu={(e) => {
          // If right-clicked on empty area, prevent default browser menu
          if (
            (e.target as HTMLElement).tagName.toLowerCase() !== "input" &&
            (e.target as HTMLElement).tagName.toLowerCase() !== "textarea"
          ) {
            e.preventDefault();
          }
        }}
        className="flex-1 min-h-0 relative flex items-center justify-center w-full overflow-hidden bg-slate-100 dark:bg-slate-950 rounded-xl p-2 select-none shadow-inner border border-slate-200 dark:border-slate-800"
      >
        {layoutMode === "isq_dual" && dualSlideInfo ? (
          // DUAL SLIDE ISQ SIDE-BY-SIDE
          <div className="w-full h-full flex items-center justify-center gap-3 overflow-hidden">
            {renderSlideSheet(
              dualSlideInfo.viNum,
              dualSlideInfo.viLayout,
              dualSlideInfo.viUnitsMap,
              "source",
              dualSlideDimensions.width,
              dualSlideDimensions.height
            )}
            {renderSlideSheet(
              dualSlideInfo.enNum,
              dualSlideInfo.enLayout,
              dualSlideInfo.enUnitsMap,
              "target",
              dualSlideDimensions.width,
              dualSlideDimensions.height
            )}
          </div>
        ) : layoutMode === "cards" ? (
          // SEQUENTIAL CARDS LIST VIEW
          <div className="w-full h-full max-w-4xl overflow-y-auto pr-2 space-y-2.5">
            {bodyUnits.map((unit, idx) => {
              const isSelected = selectedUnitIds.has(unit.id);
              const isEditing = editingUnitId === unit.id;
              const statusCfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.NEEDS_TRANSLATION;
              const transText = getTranslationText(unit);
              const hasCustom = customEdits[unit.id] !== undefined;

              return (
                <div
                  key={unit.id}
                  onClick={() => onToggleUnit(unit.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white dark:bg-[#181d2c] border-sky-500 shadow-md ring-1 ring-sky-500/30"
                      : "bg-white/80 dark:bg-[#141824] border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-[10px] font-bold font-mono px-1 rounded bg-slate-200 dark:bg-slate-800">
                        #{idx + 1}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => startEdit(unit, e)}
                      className="text-xs text-sky-600 hover:underline flex items-center gap-0.5"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{hasCustom ? "Đã sửa" : "Sửa"}</span>
                    </button>
                  </div>

                  <div className="text-xs space-y-1 pl-6">
                    <div className="text-slate-800 dark:text-slate-200 font-medium">{unit.sourceText}</div>
                    {transText && (
                      <div className="text-sky-700 dark:text-sky-300 font-semibold">
                        ➔ {transText}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // STANDARD PPTX VISUAL REVIEW (1:1 SPATIAL)
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            {renderSlideSheet(currentSlide, currentVisualLayout, unitById, viewMode)}
          </div>
        )}

        {/* ================================================================== */}
        {/* RIGHT-CLICK CUSTOM POP-UP TRANSLATE MENU (AT CURSOR POSITION)      */}
        {/* ================================================================== */}
        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            className="w-[330px] bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 rounded-2xl p-3 z-[999] text-xs shadow-2xl text-white space-y-2.5 animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                <Languages className="w-4 h-4 text-sky-400" />
                <span>Pop-up Dịch Nhanh</span>
              </div>
              <button
                type="button"
                onClick={() => setContextMenu(null)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer transition-colors"
                title="Đóng (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selected Phrase Section (If user highlighted a word or phrase with mouse) */}
            {contextMenu.selectedPhrase && (
              <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-800/80 space-y-1.5">
                <div className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                  <MousePointerClick className="w-3 h-3 text-amber-400" />
                  <span>Từ / Cụm từ đã bôi đen:</span>
                </div>
                <div className="text-white font-medium text-xs break-words px-1 bg-black/40 rounded p-1">
                  "{contextMenu.selectedPhrase}"
                </div>

                {contextMenu.phraseTranslation ? (
                  <div className="space-y-1">
                    <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 text-xs font-semibold">
                      ➔ {contextMenu.phraseTranslation}
                    </div>
                    {contextMenu.unit && (
                      <button
                        type="button"
                        onClick={() => {
                          const currentTrans = getTranslationText(contextMenu.unit!) || contextMenu.unit!.sourceText;
                          const newTrans = currentTrans.replace(contextMenu.selectedPhrase!, contextMenu.phraseTranslation!);
                          onSaveCustomEdit(contextMenu.unit!.id, newTrans);
                          setContextMenu(null);
                        }}
                        className="w-full py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] cursor-pointer"
                      >
                        Áp dụng thay thế vào ô
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isTranslatingQuick}
                    onClick={() => handleTranslatePhrase(contextMenu.selectedPhrase!)}
                    className="w-full py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    {isTranslatingQuick ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    <span>Dịch từ / cụm từ này</span>
                  </button>
                )}
              </div>
            )}

            {/* Cell Source Text Info */}
            <div className="space-y-1">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span className="font-semibold text-slate-300">Nội dung ô:</span>
                <span className="font-mono text-[9px] text-slate-400">{contextMenu.element.shapeName || "Phần tử"}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs max-h-24 overflow-y-auto leading-relaxed">
                {contextMenu.unit?.sourceText || contextMenu.element.text || "(Trống)"}
              </div>
            </div>

            {/* Current Translation Preview (if any) */}
            {contextMenu.unit && (
              <div className="space-y-0.5">
                <div className="text-[10px] text-slate-400 font-semibold">Bản dịch hiện tại:</div>
                <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-sky-300 font-semibold text-[11px] truncate">
                  {getTranslationText(contextMenu.unit) || "(Chưa có bản dịch)"}
                </div>
              </div>
            )}

            {/* Instant AI Translation for this Cell */}
            {contextMenu.unit && (
              <button
                type="button"
                disabled={isTranslatingQuick}
                onClick={() => handleTranslateSingleUnit(contextMenu.unit!)}
                className="w-full py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {isTranslatingQuick && !batchTranslateProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang dịch AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Dịch AI ô này ngay (In-place)</span>
                  </>
                )}
              </button>
            )}

            {/* Quick Toggle Selection & Edit */}
            {contextMenu.unit && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onToggleUnit(contextMenu.unit!.id);
                    setContextMenu(null);
                  }}
                  className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  {selectedUnitIds.has(contextMenu.unit.id) ? (
                    <>
                      <CheckSquare className="w-3 h-3 text-sky-400" />
                      <span>Bỏ chọn ô này</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3 h-3 text-slate-400" />
                      <span>Chọn dịch ô này</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startEdit(contextMenu.unit!);
                    setContextMenu(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Sửa bản dịch trực tiếp"
                >
                  <Pencil className="w-3 h-3 text-sky-400" />
                  <span>Sửa</span>
                </button>
              </div>
            )}

            {/* Batch Selection Tools ("chọn hàng loạt để dịch") */}
            <div className="pt-1.5 border-t border-slate-800 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Chọn hàng loạt (Batch)</span>
                <span className="text-sky-400 font-mono">Đã chọn: {selectedInCurrentSlide.length} ô</span>
              </div>

              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    // Select all pending on this slide
                    for (const u of currentUnits) {
                      if (u.status === "NEEDS_TRANSLATION" || u.status === "MIXED_LANGUAGE" || u.status === "REVIEW_REQUIRED") {
                        if (!selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                      }
                    }
                    setContextMenu(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-medium text-slate-300 text-left flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ListPlus className="w-3 h-3 text-amber-400" />
                  <span>Chọn ô chưa dịch</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectAllInSlide(currentSlide);
                    setContextMenu(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-medium text-slate-300 text-left flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-3 h-3 text-emerald-400" />
                  <span>Chọn hết slide</span>
                </button>
              </div>

              {/* Batch Translate Selected Button */}
              {selectedInCurrentSlide.length > 0 && (
                <button
                  type="button"
                  disabled={isTranslatingQuick}
                  onClick={handleBatchTranslateSelected}
                  className="w-full mt-1 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {isTranslatingQuick && batchTranslateProgress ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang dịch {batchTranslateProgress.current}/{batchTranslateProgress.total} ô...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>Dịch hàng loạt {selectedInCurrentSlide.length} ô đã chọn ngay</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Floating Property Inspector (Docked over bottom of canvas ONLY when element is selected) */}
        {inspectedElement && inspectedUnit && !contextMenu && (
          <div className="absolute bottom-3 left-4 right-4 max-w-4xl mx-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-2xl p-3 z-40 text-xs shadow-2xl text-white animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  <Layers className="w-3.5 h-3.5" />
                </span>
                <strong className="font-bold text-xs">{inspectedElement.shapeName || "Phần tử được chọn"}</strong>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  L:{inspectedElement.box.left}% • T:{inspectedElement.box.top}% • W:{inspectedElement.box.width}% • H:{inspectedElement.box.height}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectPrevLayer}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Lớp trước (Shift+Tab)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleSelectNextLayer}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Lớp tiếp theo (Tab)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedElementId(null)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer ml-1"
                  title="Đóng (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">🇻🇳 Văn bản nguồn (VI):</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyText(inspectedUnit.sourceText, inspectedUnit.id, e)}
                    className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    <span>{copiedUnitId === inspectedUnit.id ? "Đã chép!" : "Chép"}</span>
                  </button>
                </div>
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs">
                  {inspectedUnit.sourceText}
                </div>
              </div>

              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">🇬🇧 Bản dịch dự kiến (EN):</span>
                  <div className="flex items-center gap-1.5">
                    {customEdits[inspectedUnit.id] !== undefined && (
                      <button
                        type="button"
                        onClick={(e) => resetEdit(inspectedUnit.id, e)}
                        className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Hoàn tác</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => startEdit(inspectedUnit, e)}
                      className="flex items-center gap-0.5 text-[10px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      <span>{editingUnitId === inspectedUnit.id ? "Đang sửa" : "Sửa bản dịch"}</span>
                    </button>
                  </div>
                </div>

                {editingUnitId === inspectedUnit.id ? (
                  <div className="space-y-1">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="w-full p-1.5 bg-slate-950 border-2 border-sky-500 rounded-xl text-xs text-white focus:outline-none"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={(e) => saveEdit(inspectedUnit.id, e)}
                        className="px-2.5 py-0.5 rounded text-[10px] bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-sky-300 font-semibold text-xs">
                    {getTranslationText(inspectedUnit) || "(Chưa dịch • Sẽ được dịch tự động)"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Compact Keyboard Cheatsheet Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-[10px] text-slate-500 shrink-0">
        <div className="flex items-center gap-1.5">
          <Keyboard className="w-3 h-3 text-slate-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">Phím tắt:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Chuột phải : Pop-up Dịch
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Ctrl+Click : Chọn nhiều ô
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            ←/→ : Đổi Slide
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Nhấp đúp / Enter : Sửa chữ
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Space : Chọn dịch
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            0 : Fit màn hình
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Esc : Đóng
          </span>
        </div>
      </div>
    </div>
  );
};
