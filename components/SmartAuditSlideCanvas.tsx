"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { extractNumericParameters } from "@/services/translation/vietnamese-detector";
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Pencil,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
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
  ArrowLeftRight,
  Maximize,
  Move,
  GripVertical,
  Undo2,
  Redo2,
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Plus,
  Minus,
  Type,
  Palette,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Paintbrush,
  AlertTriangle,
  BookOpen,
  Magnet,
  BoxSelect,
  Scissors,
  HelpCircle,
} from "lucide-react";
import type {
  SmartAuditReport,
  ScannedTextUnit,
  TextUnitStatus,
  SlideVisualLayout,
  SlideVisualElement,
} from "@/services/translation/smart-detector";
import type { ViReferenceHandlingMode } from "./SmartAuditModal";

export interface SlideCanvasCustomState {
  positions: Record<string, { left: number; top: number }>;
  sizes: Record<string, { width: number; height: number }>;
  styles: Record<
    string,
    {
      fontSizePt?: number;
      isBold?: boolean;
      align?: "left" | "center" | "right";
      fill?: string;
      textColor?: string;
      zIndex?: number;
    }
  >;
  addedElements: SlideVisualElement[];
  deletedElementIds: string[];
}

interface SmartAuditSlideCanvasProps {
  report: SmartAuditReport;
  selectedUnitIds: Set<string>;
  onToggleUnit: (unitId: string) => void;
  onSelectAllInSlide: (slideNum: number) => void;
  onDeselectAllInSlide: (slideNum: number) => void;
  onSkipUnits: (unitIds: string[]) => void;
  customEdits: Record<string, string>;
  onSaveCustomEdit: (unitId: string, text: string) => void;
  onResetCustomEdit: (unitId: string) => void;
  initialSlideNum?: number;
  slidePairMap?: Map<number, { role: "en" | "vi"; partnerSlide: number; pairIndex: number }>;
  slideViHandling?: Record<number, ViReferenceHandlingMode>;
  onSetSlideViHandling?: (slideNum: number, mode: ViReferenceHandlingMode) => void;
  onSlideChange?: (slideNum: number) => void;
  onCustomFontSizesChange?: (customFontSizes: Record<string, number>) => void;
  onOpenGlossary?: (term?: string) => void;
  initialCustomFontSizes?: Record<string, number>;
}

interface ContextMenuState {
  x: number;
  y: number;
  element: SlideVisualElement;
  unit: ScannedTextUnit | null;
  unitIndex?: number;
  elementUnits?: ScannedTextUnit[];
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

export interface TypographyPreset {
  id: "title" | "process" | "body" | "note";
  label: string;
  fontSizePt: number;
  isBold: boolean;
  description: string;
}

export const SOP_TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  { id: "title", label: "Tiêu đề", fontSizePt: 16, isBold: true, description: "Tiêu đề chính slide (16pt Bold)" },
  { id: "process", label: "Công đoạn", fontSizePt: 12, isBold: true, description: "Đầu mục công đoạn kỹ thuật (12pt Bold)" },
  { id: "body", label: "Nội dung", fontSizePt: 10, isBold: false, description: "Nội dung bảng & mô tả chuẩn (10pt)" },
  { id: "note", label: "Ghi chú", fontSizePt: 8, isBold: false, description: "Ghi chú nhỏ & thông số phụ (8pt)" },
];

export const SOP_TERM_REGEX = /(SPI\s+\d+(?:-\d+)?\s+stitches\/inch|No-sew|no-sew|Tip-quarter|tip-quarter|\*(?:Hot\/cool shaping|Buffing|Cementing|Stitching|Cutting|Assembly|Skiving|Embroidery|Pressing|Priming):?|Tip shape|Toe shape|Collar shape|Heel shape|Tongue shape|Eyestay shape|Backtab shape|Bonding gap|Overflow|Dirty mark|Delamination|Wrinkle|Crooked|Asymmetry|Stitch run-off|Broken stitch|Loose stitch|High\/low|Excess cement)/gi;

// High-performance LRU cache for offscreen canvas text measurements (eliminates layout thrashing)
const textFitCache = new Map<string, { fontScale: number; lineCount: number; isOverflowing: boolean }>();
const MAX_TEXT_FIT_CACHE_SIZE = 3000;

export const SmartAuditSlideCanvas: React.FC<SmartAuditSlideCanvasProps> = ({
  report,
  selectedUnitIds,
  onToggleUnit,
  onSelectAllInSlide,
  onDeselectAllInSlide,
  onSkipUnits,
  customEdits,
  onSaveCustomEdit,
  onResetCustomEdit,
  initialSlideNum = 1,
  slidePairMap,
  slideViHandling,
  onSetSlideViHandling,
  onSlideChange,
  onCustomFontSizesChange,
  onOpenGlossary,
  initialCustomFontSizes,
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

  // Synchronize current slide when initialSlideNum changes from parent modal
  useEffect(() => {
    if (initialSlideNum && initialSlideNum >= 1 && initialSlideNum <= report.totalSlides) {
      setCurrentSlide(initialSlideNum);
    }
  }, [initialSlideNum, report.totalSlides]);

  // Notify parent component of current slide changes & reset active target selection on slide switch
  useEffect(() => {
    onSlideChange?.(currentSlide);
    setSelectedElementId(null);
    setLastActiveElementId(null);
  }, [currentSlide, onSlideChange]);

  // Display mode for text inside layers: "bilingual" | "target" | "source"
  const [viewMode, setViewMode] = useState<"bilingual" | "target" | "source">("source");

  // Layout presentation mode: "pptx" (spatial 1:1) | "cards" (sequential list) | "split" (both) | "isq_dual" (paired ISQ side-by-side)
  const [layoutMode, setLayoutMode] = useState<"pptx" | "cards" | "split" | "isq_dual">("pptx");

  // Image visibility: "hidden" (strictly deletes/removes images for clean review) | "wireframe" (shows light dashed placeholder with shape name)
  const [imageVisibility, setImageVisibility] = useState<"hidden" | "wireframe">("wireframe");

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

  // Top Header Slot in SmartAuditModal (Ngang hàng với các tab như Trực quan Slide PPTX)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateSlot = () => {
      const el = document.getElementById("canvas-top-header-slot");
      if (el) setHeaderSlot(el);
    };
    updateSlot();
    const t1 = setTimeout(updateSlot, 50);
    const t2 = setTimeout(updateSlot, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Fit Mode: "contain" (fits slide into viewport) | "width" (stretches slide across comfortable width with vertical scroll for dense tables/shapes)
  const [fitMode, setFitMode] = useState<"contain" | "width">("width");

  // Presentation Framework Mode: "document" (Natural expanded height for tables) | "presentation" (Strict 16:9 projector fit with OpenXML normAutofit)
  const [slideViewMode, setSlideViewMode] = useState<"document" | "presentation">("document");

  // Last active element ID (keeps toolbar alive & responsive when cursor moves between canvas and toolbar)
  const [lastActiveElementId, setLastActiveElementId] = useState<string | null>(null);

  // Focus Mode (dims translated/immutable cells, lights up pending ones)
  const [focusPendingOnly, setFocusPendingOnly] = useState<boolean>(false);

  // Right-click custom Pop-up Translate state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isTranslatingQuick, setIsTranslatingQuick] = useState<boolean>(false);
  const [batchTranslateProgress, setBatchTranslateProgress] = useState<{ current: number; total: number } | null>(null);

  // Active slide transition feedback & throttling refs
  const [slideSwitchNotice, setSlideSwitchNotice] = useState<number | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const navThrottleRef = useRef<number>(0);
  const slideStripRef = useRef<HTMLDivElement>(null);
  const activeSlideBtnRef = useRef<HTMLButtonElement | null>(null);

  // Freely draggable position for the floating toolbar
  // null = dynamically positioned near selected element
  // { x: left%, y: top% } = user custom position on the slide sheet
  const [floatingToolbarPos, setFloatingToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingToolbar, setIsDraggingToolbar] = useState<boolean>(false);

  // Real-time Font Size HUD Toast Feedback (Alt + Mouse Wheel)
  const [fontSizeFeedback, setFontSizeFeedback] = useState<{ elId: string; sizePt: number } | null>(null);
  const fontSizeFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // UX Improvement 1: Format Painter (Chổi quét định dạng)
  const [copiedStyle, setCopiedStyle] = useState<{
    fontSizePt?: number;
    isBold?: boolean;
    align?: "left" | "center" | "right";
    textColor?: string;
    fill?: string;
  } | null>(null);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // UX Improvement 2: Multi-Select Batch Resize & Area Selection (Select Area)
  const [multiSelectedElementIds, setMultiSelectedElementIds] = useState<Set<string>>(new Set());
  const [isAreaSelectMode, setIsAreaSelectMode] = useState<boolean>(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const isAreaSelectingRef = useRef<boolean>(false);
  const justFinishedRightDraggingRef = useRef<boolean>(false);
  // Feature 4: Tự động gập / thu nhỏ thanh công cụ nổi HUD để không che slide
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);

  // UX Improvement 5: Visual Before-After Split Comparison Slider (So sánh Trước / Sau)
  const [isSplitCompareActive, setIsSplitCompareActive] = useState<boolean>(false);
  const [splitSliderPercent, setSplitSliderPercent] = useState<number>(50);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // UX Improvement 6: Smooth Pan & Zoom (Ctrl + Wheel & Space + Drag)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const isSpacePressedRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);

  const [quickActionNotice, setQuickActionNotice] = useState<string | null>(null);
  const quickActionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Feature 3: Magnetic Snap Guides Toggle & Feedback
  const [isMagneticSnapEnabled, setIsMagneticSnapEnabled] = useState<boolean>(true);
  const [snapFeedback, setSnapFeedback] = useState<{ label: string; x?: number; y?: number } | null>(null);

  // Feature 5: Tô sáng Thuật ngữ Chuẩn Glossary & Quy tắc SOP
  const [isHighlightSopTerms, setIsHighlightSopTerms] = useState<boolean>(true);

  const toolbarDragRef = useRef<{
    startX: number;
    startY: number;
    origLeftPct: number;
    origTopPct: number;
    sheetW: number;
    sheetH: number;
  } | null>(null);

  const handleToolbarMouseDown = useCallback(
    (e: React.MouseEvent, sheetW: number, sheetH: number, currentLeftPct: number, currentTopPct: number) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input") || target.closest("textarea")) return;

      e.preventDefault();
      e.stopPropagation();

      setIsDraggingToolbar(true);
      toolbarDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeftPct: currentLeftPct,
        origTopPct: currentTopPct,
        sheetW: Math.max(100, sheetW),
        sheetH: Math.max(100, sheetH),
      };

      const handleMouseMove = (moveEvt: MouseEvent) => {
        if (!toolbarDragRef.current) return;
        moveEvt.preventDefault();
        const dx = moveEvt.clientX - toolbarDragRef.current.startX;
        const dy = moveEvt.clientY - toolbarDragRef.current.startY;

        const dLeftPct = (dx / toolbarDragRef.current.sheetW) * 100;
        const dTopPct = (dy / toolbarDragRef.current.sheetH) * 100;

        const newLeft = Math.max(0.2, Math.min(88, toolbarDragRef.current.origLeftPct + dLeftPct));
        const newTop = Math.max(0.2, Math.min(96, toolbarDragRef.current.origTopPct + dTopPct));

        setFloatingToolbarPos({
          x: Number(newLeft.toFixed(1)),
          y: Number(newTop.toFixed(1)),
        });
      };

      const handleMouseUp = () => {
        setIsDraggingToolbar(false);
        toolbarDragRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    []
  );

  useEffect(() => {
    setSlideSwitchNotice(currentSlide);
    if (onSlideChange) onSlideChange(currentSlide);
    // Always reset viewport scroll to top so every slide starts cleanly with header banner visible
    if (canvasContainerRef.current) {
      canvasContainerRef.current.scrollTop = 0;
      canvasContainerRef.current.scrollLeft = 0;
    }
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSlideSwitchNotice(null);
    }, 450);
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [currentSlide, onSlideChange]);

  useEffect(() => {
    if (activeSlideBtnRef.current) {
      activeSlideBtnRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentSlide]);

  // Canva Canvas Customization State (Positions, Sizes, Styles, Added, Deleted)
  const [canvasState, setCanvasState] = useState<SlideCanvasCustomState>(() => {
    const initStyles: SlideCanvasCustomState["styles"] = {};
    if (initialCustomFontSizes) {
      for (const [id, sz] of Object.entries(initialCustomFontSizes)) {
        if (typeof sz === "number") {
          initStyles[id] = { fontSizePt: sz };
        }
      }
    }
    return {
      positions: {},
      sizes: {},
      styles: initStyles,
      addedElements: [],
      deletedElementIds: [],
    };
  });

  const customPositions = canvasState.positions;
  const customSizes = canvasState.sizes;
  const customStyles = canvasState.styles;

  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [resizingElementId, setResizingElementId] = useState<string | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ elId: string; width: number; height: number } | null>(null);
  const [colorPopover, setColorPopover] = useState<{ type: "textColor" | "fill"; elId: string } | null>(null);
  const [lineToolMode, setLineToolMode] = useState<"translate" | "edit">("translate");

  const [undoStack, setUndoStack] = useState<SlideCanvasCustomState[]>([]);
  const [redoStack, setRedoStack] = useState<SlideCanvasCustomState[]>([]);
  const [activeGuides, setActiveGuides] = useState<{ vertical: number[]; horizontal: number[] }>({
    vertical: [],
    horizontal: [],
  });
  const justFinishedDraggingRef = useRef(false);
  const dragStartRef = useRef<{
    elId: string;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    sheetW: number;
    sheetH: number;
    hasMoved: boolean;
    snapshot: SlideCanvasCustomState;
  } | null>(null);

  const resizeStartRef = useRef<{
    elId: string;
    handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    origWidth: number;
    origHeight: number;
    sheetW: number;
    sheetH: number;
    hasMoved: boolean;
    snapshot: SlideCanvasCustomState;
  } | null>(null);

  const pushUndoSnapshot = useCallback((snapshot: SlideCanvasCustomState) => {
    setUndoStack((prev) => [...prev.slice(-30), snapshot]);
    setRedoStack([]);
  }, []);

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

  // Precomputed summary map of slide statuses for smooth, lag-free navigation
  const slideStatusSummary = useMemo(() => {
    const summary = new Map<number, { hasPending: boolean; total: number }>();
    for (const [sNum, uList] of slideMap.entries()) {
      const hasPending = uList.some(
        (u) => u.status === "NEEDS_TRANSLATION" || u.status === "MIXED_LANGUAGE" || u.status === "REVIEW_REQUIRED"
      );
      summary.set(sNum, { hasPending, total: uList.length });
    }
    return summary;
  }, [slideMap]);

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

  // Check if any element on the current slide was customized (moved, resized, restyled, added, deleted)
  const hasCustomPositionsOnCurrentSlide = useMemo(() => {
    if (!currentVisualLayout || !currentVisualLayout.elements) return false;
    const hasPos = currentVisualLayout.elements.some((el) => canvasState.positions[el.id] !== undefined);
    const hasSize = currentVisualLayout.elements.some((el) => canvasState.sizes[el.id] !== undefined);
    const hasStyle = currentVisualLayout.elements.some((el) => canvasState.styles[el.id] !== undefined);
    const hasDel = currentVisualLayout.elements.some((el) => canvasState.deletedElementIds.includes(el.id));
    const hasAdded = canvasState.addedElements.some((el) => (el as any).slideIndex === currentSlide);
    return hasPos || hasSize || hasStyle || hasDel || hasAdded;
  }, [currentVisualLayout, canvasState, currentSlide]);

  // Undo (Ctrl + Z)
  const handleUndo = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previous = prevUndo[prevUndo.length - 1];
      setRedoStack((prevRedo) => [...prevRedo.slice(-30), canvasState]);
      setCanvasState(previous);
      return prevUndo.slice(0, -1);
    });
  }, [canvasState]);

  // Redo (Ctrl + Y / Ctrl + Shift + Z)
  const handleRedo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const next = prevRedo[prevRedo.length - 1];
      setUndoStack((prevUndo) => [...prevUndo.slice(-30), canvasState]);
      setCanvasState(next);
      return prevRedo.slice(0, -1);
    });
  }, [canvasState]);

  // Reset custom layout on current slide back to original PPTX layout
  const handleResetPositions = useCallback(() => {
    if (!currentVisualLayout) return;
    pushUndoSnapshot({ ...canvasState });
    setCanvasState((prev) => {
      const nextPos = { ...prev.positions };
      const nextSize = { ...prev.sizes };
      const nextStyle = { ...prev.styles };
      const slideElIds = new Set(currentVisualLayout.elements.map((el) => el.id));
      for (const id of slideElIds) {
        delete nextPos[id];
        delete nextSize[id];
        delete nextStyle[id];
      }
      const nextDel = prev.deletedElementIds.filter((id) => !slideElIds.has(id));
      const nextAdded = prev.addedElements.filter((el) => (el as any).slideIndex !== currentSlide);
      return {
        positions: nextPos,
        sizes: nextSize,
        styles: nextStyle,
        deletedElementIds: nextDel,
        addedElements: nextAdded,
      };
    });
  }, [currentVisualLayout, canvasState, currentSlide, pushUndoSnapshot]);

  // Elements for current slide combining PPTX layout + added duplicates, minus deleted
  const currentSlideElements = useMemo(() => {
    const baseElements = currentVisualLayout?.elements || [];
    const activeBase = baseElements.filter((el) => !canvasState.deletedElementIds.includes(el.id));
    const slideAdded = canvasState.addedElements.filter(
      (el) => (el as any).slideIndex === currentSlide || !(el as any).slideIndex
    );
    return [...activeBase, ...slideAdded];
  }, [currentVisualLayout, canvasState.deletedElementIds, canvasState.addedElements, currentSlide]);

  // Marquee Area Selection (Select Area / Rubberband Drag bằng bấm giữ CHUỘT PHẢI hoặc bật chế độ Quét)
  const handleStartAreaSelection = useCallback(
    (e: React.MouseEvent) => {
      // Chỉ kích hoạt khi bấm CHUỘT PHẢI (e.button === 2) hoặc khi đã chủ động bật nút "Quét vùng" (e.button === 0)
      if (e.button !== 2 && !(isAreaSelectMode && e.button === 0)) return;
      const target = e.target as HTMLElement;
      if (
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("button") ||
        target.isContentEditable
      ) {
        return;
      }

      const isRightClick = e.button === 2;
      const startX = e.clientX;
      const startY = e.clientY;
      let hasExceededThreshold = false;
      let cachedElementRects: Array<{ id: string; left: number; top: number; right: number; bottom: number }> | null = null;
      let areaRafId: number | null = null;

      const handleAreaMouseMove = (moveEvt: MouseEvent) => {
        const curX = moveEvt.clientX;
        const curY = moveEvt.clientY;
        const dist = Math.hypot(curX - startX, curY - startY);

        if (!hasExceededThreshold) {
          if (dist > 5) {
            hasExceededThreshold = true;
            isAreaSelectingRef.current = true;
            if (isRightClick) {
              justFinishedRightDraggingRef.current = true;
            }
            justFinishedDraggingRef.current = true;
            // Pre-cache DOM element bounding rects once (avoids continuous layout thrashing)
            const cellDomElements = document.querySelectorAll<HTMLElement>("[data-element-id]");
            cachedElementRects = [];
            cellDomElements.forEach((elNode) => {
              const id = elNode.getAttribute("data-element-id");
              if (!id) return;
              const rect = elNode.getBoundingClientRect();
              cachedElementRects!.push({
                id,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              });
            });
          } else {
            return;
          }
        }

        moveEvt.preventDefault();
        window.getSelection()?.removeAllRanges();

        if (areaRafId) cancelAnimationFrame(areaRafId);
        areaRafId = requestAnimationFrame(() => {
          setSelectionBox({
            startX,
            startY,
            currentX: curX,
            currentY: curY,
          });

          if (!cachedElementRects) return;
          const selLeft = Math.min(startX, curX);
          const selTop = Math.min(startY, curY);
          const selRight = Math.max(startX, curX);
          const selBottom = Math.max(startY, curY);

          const selected = new Set<string>();
          for (let i = 0; i < cachedElementRects.length; i++) {
            const item = cachedElementRects[i];
            const overlaps = !(
              item.right < selLeft ||
              item.left > selRight ||
              item.bottom < selTop ||
              item.top > selBottom
            );
            if (overlaps) {
              selected.add(item.id);
            }
          }
          setMultiSelectedElementIds(selected);
        });
      };

      const handleAreaMouseUp = (upEvt: MouseEvent) => {
        if (areaRafId) cancelAnimationFrame(areaRafId);
        cachedElementRects = null;
        isAreaSelectingRef.current = false;
        setSelectionBox(null);

        if (hasExceededThreshold && isRightClick) {
          justFinishedRightDraggingRef.current = true;
          setTimeout(() => {
            justFinishedRightDraggingRef.current = false;
          }, 300);
        } else if (!hasExceededThreshold && isRightClick) {
          justFinishedRightDraggingRef.current = false;
        }

        setTimeout(() => {
          justFinishedDraggingRef.current = false;
        }, 150);

        window.removeEventListener("mousemove", handleAreaMouseMove);
        window.removeEventListener("mouseup", handleAreaMouseUp);
      };

      window.addEventListener("mousemove", handleAreaMouseMove);
      window.addEventListener("mouseup", handleAreaMouseUp);
    },
    [isAreaSelectMode]
  );

  // UX Shortcut: Chuột giữa (nút lăn chuột / wheel click) CHỈ có chức năng DUY NHẤT: HỦY TOÀN BỘ Ô DỊCH
  const handleMiddleClickElement = useCallback(
    (e: React.MouseEvent, units: ScannedTextUnit[]) => {
      if (e.button === 1) { // 1 = Middle mouse button (nút lăn chuột)
        e.preventDefault();
        e.stopPropagation();
        if (!units || units.length === 0) return;
        // CHỈ HỦY TOÀN BỘ Ô DỊCH: Bỏ chọn toàn bộ các dòng đang được chọn trong ô này (Không bật lại, không toggle)
        let canceledAny = false;
        for (const u of units) {
          if (selectedUnitIds.has(u.id)) {
            onToggleUnit(u.id);
            canceledAny = true;
          }
        }
        if (canceledAny) {
          if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
          setQuickActionNotice("Đã hủy dịch ô này (Chuột giữa)");
          quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1500);
        }
      }
    },
    [selectedUnitIds, onToggleUnit]
  );

  // UX Shortcut: Chuột giữa vào dòng cụ thể -> CHỈ hủy toàn bộ ô dịch
  const handleLineMiddleClick = useCallback(
    (e: React.MouseEvent, _u: ScannedTextUnit, allUnits: ScannedTextUnit[]) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        handleMiddleClickElement(e, allUnits);
      }
    },
    [handleMiddleClickElement]
  );

  // Mouse handler to drag & move slide elements with Canva-style alignment guides & snapping
  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, el: SlideVisualElement, sheetW: number, sheetH: number) => {
      // Bấm chuột phải hoặc bật chế độ Quét: Kích hoạt quét vùng
      if (e.button === 2 || (isAreaSelectMode && e.button === 0)) {
        handleStartAreaSelection(e);
        return;
      }
      // Bấm chuột giữa (nút lăn chuột): Hủy / chuyển đổi ô dịch
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        const targetUnits = (el.unitIds && el.unitIds.length > 0)
          ? el.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
          : el.unitId && unitById.get(el.unitId)
          ? [unitById.get(el.unitId)!]
          : [];
        handleMiddleClickElement(e, targetUnits);
        return;
      }
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("button") ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.shiftKey) {
        handleStartAreaSelection(e);
        return;
      }

      const currentPos = canvasState.positions[el.id] || { left: el.box.left, top: el.box.top };
      const currentSnapshot: SlideCanvasCustomState = {
        positions: { ...canvasState.positions },
        sizes: { ...canvasState.sizes },
        styles: { ...canvasState.styles },
        addedElements: [...canvasState.addedElements],
        deletedElementIds: [...canvasState.deletedElementIds],
      };

      const otherElements = currentSlideElements.filter((other) => other.id !== el.id);
      const targetXs: number[] = [50];
      const targetYs: number[] = [50];

      for (const other of otherElements) {
        const oPos = canvasState.positions[other.id] || { left: other.box.left, top: other.box.top };
        const oSize = canvasState.sizes[other.id] || { width: other.box.width, height: other.box.height };
        targetXs.push(oPos.left, oPos.left + oSize.width / 2, oPos.left + oSize.width);
        targetYs.push(oPos.top, oPos.top + oSize.height / 2, oPos.top + oSize.height);
      }

      dragStartRef.current = {
        elId: el.id,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: currentPos.left,
        origTop: currentPos.top,
        sheetW: sheetW || 1,
        sheetH: sheetH || 1,
        hasMoved: false,
        snapshot: currentSnapshot,
      };

      let dragRafId: number | null = null;
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = moveEvent.clientX - dragStartRef.current.startX;
        const dy = moveEvent.clientY - dragStartRef.current.startY;

        if (!dragStartRef.current.hasMoved && Math.hypot(dx, dy) > 4) {
          dragStartRef.current.hasMoved = true;
          setDraggingElementId(el.id);
        }

        if (dragStartRef.current.hasMoved) {
          moveEvent.preventDefault();
          window.getSelection()?.removeAllRanges();

          const clientX = moveEvent.clientX;
          const clientY = moveEvent.clientY;

          if (dragRafId) cancelAnimationFrame(dragRafId);
          dragRafId = requestAnimationFrame(() => {
            if (!dragStartRef.current) return;

            const deltaLeft = ((clientX - dragStartRef.current.startX) / (dragStartRef.current.sheetW || 1)) * 100;
            const deltaTop = ((clientY - dragStartRef.current.startY) / (dragStartRef.current.sheetH || 1)) * 100;

            const rawLeft = Math.round((dragStartRef.current.origLeft + deltaLeft) * 10) / 10;
            const rawTop = Math.round((dragStartRef.current.origTop + deltaTop) * 10) / 10;

            const SNAP_THRESHOLD_X = isMagneticSnapEnabled ? 1.6 : 0.0;
            const SNAP_THRESHOLD_Y = isMagneticSnapEnabled ? 1.6 : 0.0;

            let snappedLeft = rawLeft;
            let verticalGuide: number | null = null;
            let bestDiffX = SNAP_THRESHOLD_X;
            let snapLabelX = "";

            if (isMagneticSnapEnabled) {
              for (const tx of targetXs) {
                const isCenter50 = Math.abs(tx - 50) < 0.01;
                const dL = Math.abs(rawLeft - tx);
                if (dL < bestDiffX) {
                  bestDiffX = dL;
                  snappedLeft = tx;
                  verticalGuide = tx;
                  snapLabelX = isCenter50 ? "Tâm dọc Slide (50%)" : "Khớp mép trái";
                }
                const dC = Math.abs(rawLeft + el.box.width / 2 - tx);
                if (dC < bestDiffX) {
                  bestDiffX = dC;
                  snappedLeft = tx - el.box.width / 2;
                  verticalGuide = tx;
                  snapLabelX = isCenter50 ? "Tâm dọc Slide (50%)" : "Khớp tâm đối tượng";
                }
                const dR = Math.abs(rawLeft + el.box.width - tx);
                if (dR < bestDiffX) {
                  bestDiffX = dR;
                  snappedLeft = tx - el.box.width;
                  verticalGuide = tx;
                  snapLabelX = isCenter50 ? "Tâm dọc Slide (50%)" : "Khớp mép phải";
                }
              }
            }

            let snappedTop = rawTop;
            let horizontalGuide: number | null = null;
            let bestDiffY = SNAP_THRESHOLD_Y;
            let snapLabelY = "";

            if (isMagneticSnapEnabled) {
              for (const ty of targetYs) {
                const isCenter50 = Math.abs(ty - 50) < 0.01;
                const dT = Math.abs(rawTop - ty);
                if (dT < bestDiffY) {
                  bestDiffY = dT;
                  snappedTop = ty;
                  horizontalGuide = ty;
                  snapLabelY = isCenter50 ? "Tâm ngang Slide (50%)" : "Khớp mép trên";
                }
                const dC = Math.abs(rawTop + el.box.height / 2 - ty);
                if (dC < bestDiffY) {
                  bestDiffY = dC;
                  snappedTop = ty - el.box.height / 2;
                  horizontalGuide = ty;
                  snapLabelY = isCenter50 ? "Tâm ngang Slide (50%)" : "Khớp tâm ngang";
                }
                const dB = Math.abs(rawTop + el.box.height - ty);
                if (dB < bestDiffY) {
                  bestDiffY = dB;
                  snappedTop = ty - el.box.height;
                  horizontalGuide = ty;
                  snapLabelY = isCenter50 ? "Tâm ngang Slide (50%)" : "Khớp mép dưới";
                }
              }
            }

            const maxLeft = Math.max(0, 100 - Math.min(el.box.width, 10));
            const maxTop = Math.max(0, 100 - Math.min(el.box.height, 5));
            const newLeft = Math.max(-5, Math.min(maxLeft, Math.round(snappedLeft * 10) / 10));
            const newTop = Math.max(-5, Math.min(maxTop, Math.round(snappedTop * 10) / 10));

            setActiveGuides({
              vertical: verticalGuide !== null ? [verticalGuide] : [],
              horizontal: horizontalGuide !== null ? [horizontalGuide] : [],
            });

            if (isMagneticSnapEnabled && (verticalGuide !== null || horizontalGuide !== null)) {
              const label = snapLabelX && snapLabelY ? `${snapLabelX} & ${snapLabelY}` : (snapLabelX || snapLabelY);
              setSnapFeedback({
                label,
                x: verticalGuide !== null ? verticalGuide : snappedLeft + el.box.width / 2,
                y: horizontalGuide !== null ? horizontalGuide : snappedTop,
              });
            } else {
              setSnapFeedback(null);
            }

            setCanvasState((prev) => ({
              ...prev,
              positions: {
                ...prev.positions,
                [el.id]: { left: newLeft, top: newTop },
              },
            }));
          });
        }
      };

      const handleMouseUp = () => {
        if (dragRafId) cancelAnimationFrame(dragRafId);
        setActiveGuides({ vertical: [], horizontal: [] });
        setSnapFeedback(null);
        if (dragStartRef.current?.hasMoved) {
          justFinishedDraggingRef.current = true;
          setTimeout(() => {
            justFinishedDraggingRef.current = false;
          }, 120);

          if (dragStartRef.current.snapshot) {
            pushUndoSnapshot(dragStartRef.current.snapshot);
          }
        }
        dragStartRef.current = null;
        setDraggingElementId(null);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [canvasState, currentSlideElements, isMagneticSnapEnabled, isAreaSelectMode, handleStartAreaSelection, pushUndoSnapshot]
  );

  // Mouse handler to resize slide elements using 8 Canva-style handles with snapping
  const handleResizeMouseDown = useCallback(
    (
      e: React.MouseEvent,
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
      el: SlideVisualElement,
      sheetW: number,
      sheetH: number
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const currentPos = canvasState.positions[el.id] || { left: el.box.left, top: el.box.top };
      const currentSize = canvasState.sizes[el.id] || { width: el.box.width, height: el.box.height };

      const currentSnapshot: SlideCanvasCustomState = {
        positions: { ...canvasState.positions },
        sizes: { ...canvasState.sizes },
        styles: { ...canvasState.styles },
        addedElements: [...canvasState.addedElements],
        deletedElementIds: [...canvasState.deletedElementIds],
      };

      setResizingElementId(el.id);
      resizeStartRef.current = {
        elId: el.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: currentPos.left,
        origTop: currentPos.top,
        origWidth: currentSize.width,
        origHeight: currentSize.height,
        sheetW: sheetW || 1,
        sheetH: sheetH || 1,
        hasMoved: false,
        snapshot: currentSnapshot,
      };

      const otherElements = currentSlideElements.filter((other) => other.id !== el.id);
      const targetXs: number[] = [50];
      const targetYs: number[] = [50];
      for (const other of otherElements) {
        const oPos = canvasState.positions[other.id] || { left: other.box.left, top: other.box.top };
        const oSize = canvasState.sizes[other.id] || { width: other.box.width, height: other.box.height };
        targetXs.push(oPos.left, oPos.left + oSize.width / 2, oPos.left + oSize.width);
        targetYs.push(oPos.top, oPos.top + oSize.height / 2, oPos.top + oSize.height);
      }

      let resizeRafId: number | null = null;
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeStartRef.current) return;
        const ref = resizeStartRef.current;
        const dx = moveEvent.clientX - ref.startX;
        const dy = moveEvent.clientY - ref.startY;

        if (!ref.hasMoved && Math.hypot(dx, dy) > 3) {
          ref.hasMoved = true;
        }

        if (ref.hasMoved) {
          moveEvent.preventDefault();
          window.getSelection()?.removeAllRanges();

          const clientX = moveEvent.clientX;
          const clientY = moveEvent.clientY;

          if (resizeRafId) cancelAnimationFrame(resizeRafId);
          resizeRafId = requestAnimationFrame(() => {
            if (!resizeStartRef.current) return;
            const curRef = resizeStartRef.current;
            const curDx = clientX - curRef.startX;
            const curDy = clientY - curRef.startY;

            const deltaW = (curDx / curRef.sheetW) * 100;
            const deltaH = (curDy / curRef.sheetH) * 100;

            let newLeft = curRef.origLeft;
            let newTop = curRef.origTop;
            let newWidth = curRef.origWidth;
            let newHeight = curRef.origHeight;

            const MIN_W = 3.0;
            const MIN_H = 2.0;

            if (handle.includes("e")) {
              newWidth = Math.max(MIN_W, curRef.origWidth + deltaW);
            }
            if (handle.includes("s")) {
              newHeight = Math.max(MIN_H, curRef.origHeight + deltaH);
            }
            if (handle.includes("w")) {
              const maxDeltaW = curRef.origWidth - MIN_W;
              const actualDeltaW = Math.min(deltaW, maxDeltaW);
              newLeft = curRef.origLeft + actualDeltaW;
              newWidth = curRef.origWidth - actualDeltaW;
            }
            if (handle.includes("n")) {
              const maxDeltaH = curRef.origHeight - MIN_H;
              const actualDeltaH = Math.min(deltaH, maxDeltaH);
              newTop = curRef.origTop + actualDeltaH;
              newHeight = curRef.origHeight - actualDeltaH;
            }

            const SNAP_THRESHOLD = isMagneticSnapEnabled ? 1.5 : 0.0;
            let vGuide: number | null = null;
            let hGuide: number | null = null;

            if (isMagneticSnapEnabled) {
              if (handle.includes("e")) {
                const rightEdge = newLeft + newWidth;
                for (const tx of targetXs) {
                  if (Math.abs(rightEdge - tx) < SNAP_THRESHOLD) {
                    newWidth = Math.max(MIN_W, tx - newLeft);
                    vGuide = tx;
                    break;
                  }
                }
              } else if (handle.includes("w")) {
                for (const tx of targetXs) {
                  if (Math.abs(newLeft - tx) < SNAP_THRESHOLD) {
                    const diff = tx - newLeft;
                    newLeft = tx;
                    newWidth = Math.max(MIN_W, newWidth - diff);
                    vGuide = tx;
                    break;
                  }
                }
              }

              if (handle.includes("s")) {
                const bottomEdge = newTop + newHeight;
                for (const ty of targetYs) {
                  if (Math.abs(bottomEdge - ty) < SNAP_THRESHOLD) {
                    newHeight = Math.max(MIN_H, ty - newTop);
                    hGuide = ty;
                    break;
                  }
                }
              } else if (handle.includes("n")) {
                for (const ty of targetYs) {
                  if (Math.abs(newTop - ty) < SNAP_THRESHOLD) {
                    const diff = ty - newTop;
                    newTop = ty;
                    newHeight = Math.max(MIN_H, newHeight - diff);
                    hGuide = ty;
                    break;
                  }
                }
              }
            }

            newLeft = Math.round(newLeft * 10) / 10;
            newTop = Math.round(newTop * 10) / 10;
            newWidth = Math.round(newWidth * 10) / 10;
            newHeight = Math.round(newHeight * 10) / 10;

            setActiveGuides({
              vertical: vGuide !== null ? [vGuide] : [],
              horizontal: hGuide !== null ? [hGuide] : [],
            });

            if (isMagneticSnapEnabled && (vGuide !== null || hGuide !== null)) {
              const isCenter = (vGuide !== null && Math.abs(vGuide - 50) < 0.01) || (hGuide !== null && Math.abs(hGuide - 50) < 0.01);
              setSnapFeedback({
                label: isCenter ? "Khớp tâm 50%" : "Khớp mép đối tượng",
                x: vGuide !== null ? vGuide : newLeft + newWidth,
                y: hGuide !== null ? hGuide : newTop + newHeight,
              });
            } else {
              setSnapFeedback(null);
            }

            setResizeInfo({ elId: el.id, width: newWidth, height: newHeight });

            setCanvasState((prev) => ({
              ...prev,
              positions: {
                ...prev.positions,
                [el.id]: { left: newLeft, top: newTop },
              },
              sizes: {
                ...prev.sizes,
                [el.id]: { width: newWidth, height: newHeight },
              },
            }));
          });
        }
      };

      const handleMouseUp = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId);
        setActiveGuides({ vertical: [], horizontal: [] });
        setSnapFeedback(null);
        setResizeInfo(null);
        setResizingElementId(null);
        if (resizeStartRef.current?.hasMoved) {
          justFinishedDraggingRef.current = true;
          setTimeout(() => {
            justFinishedDraggingRef.current = false;
          }, 120);
          pushUndoSnapshot(resizeStartRef.current.snapshot);
        }
        resizeStartRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [canvasState, currentSlideElements, isMagneticSnapEnabled, pushUndoSnapshot]
  );

  // Typography & Styling actions for Canva floating toolbar
  const handleChangeFontSize = useCallback(
    (elId: string, delta: number, skipSnapshot = false) => {
      if (!skipSnapshot) {
        pushUndoSnapshot({ ...canvasState });
      }

      const targets = multiSelectedElementIds.size > 0
        ? Array.from(multiSelectedElementIds)
        : (selectedElementId ? [selectedElementId] : (elId ? [elId] : []));

      if (targets.length === 0) return;

      let lastFinalSize = 11;
      const fontSizesUpdate: Record<string, number> = {};

      for (const tid of targets) {
        const baseEl = currentSlideElements.find((e) => e.id === tid);
        const curStyle = canvasState.styles[tid] || {};
        const curSize = curStyle.fontSizePt ?? baseEl?.fontSizePt ?? 11;
        const nextSize = Math.max(6, Math.min(36, Number((curSize + delta).toFixed(1))));
        lastFinalSize = nextSize;

        if (baseEl) {
          if (baseEl.unitIds && baseEl.unitIds.length > 0) {
            for (const uid of baseEl.unitIds) fontSizesUpdate[uid] = nextSize;
          } else if (baseEl.unitId) {
            fontSizesUpdate[baseEl.unitId] = nextSize;
          }
        }
        fontSizesUpdate[tid] = nextSize;
      }

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const curStyle = nextStyles[tid] || {};
          const curSize = curStyle.fontSizePt ?? currentSlideElements.find((e) => e.id === tid)?.fontSizePt ?? 11;
          const nextSize = Math.max(6, Math.min(36, Number((curSize + delta).toFixed(1))));
          nextStyles[tid] = { ...curStyle, fontSizePt: nextSize };
        }
        return {
          ...prev,
          styles: nextStyles,
        };
      });

      if (onCustomFontSizesChange && Object.keys(fontSizesUpdate).length > 0) {
        onCustomFontSizesChange(fontSizesUpdate);
      }

      setFontSizeFeedback({ elId: targets[0], sizePt: lastFinalSize });
      if (fontSizeFeedbackTimerRef.current) clearTimeout(fontSizeFeedbackTimerRef.current);
      fontSizeFeedbackTimerRef.current = setTimeout(() => {
        setFontSizeFeedback(null);
      }, 950);

      if (targets.length > 1) {
        setQuickActionNotice(`Đã đổi cỡ chữ cho ${targets.length} ô: ${lastFinalSize}pt`);
        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
      }
    },
    [canvasState, pushUndoSnapshot, currentSlideElements, multiSelectedElementIds, selectedElementId, onCustomFontSizesChange]
  );

  // UX Improvement 1: Format Painter (Chổi quét định dạng)
  const handleCopyStyle = useCallback(
    (elId: string) => {
      const baseEl = currentSlideElements.find((e) => e.id === elId);
      const curStyle = canvasState.styles[elId] || {};
      const styleToCopy = {
        fontSizePt: curStyle.fontSizePt ?? baseEl?.fontSizePt,
        isBold: curStyle.isBold !== undefined ? curStyle.isBold : Boolean(baseEl?.isBold),
        align: (curStyle.align || (baseEl?.tableRow === 0 || baseEl?.align === "center" || baseEl?.isTitle ? "center" : "left")) as "left" | "center" | "right",
        textColor: curStyle.textColor || baseEl?.textColor,
        fill: curStyle.fill || baseEl?.fill,
      };
      setCopiedStyle(styleToCopy);
      setIsFormatPainterActive(true);
      setQuickActionNotice("Đã sao chép định dạng! Nhấp vào ô bất kỳ để dán style.");
      if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
      quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 2500);
    },
    [canvasState.styles, currentSlideElements]
  );

  const handlePasteStyle = useCallback(
    (targetElId: string) => {
      if (!copiedStyle) return;
      pushUndoSnapshot({ ...canvasState });

      const targets = multiSelectedElementIds.size > 0
        ? Array.from(multiSelectedElementIds)
        : [targetElId];

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const cur = nextStyles[tid] || {};
          nextStyles[tid] = {
            ...cur,
            ...(copiedStyle.fontSizePt !== undefined ? { fontSizePt: copiedStyle.fontSizePt } : {}),
            ...(copiedStyle.isBold !== undefined ? { isBold: copiedStyle.isBold } : {}),
            ...(copiedStyle.align ? { align: copiedStyle.align } : {}),
            ...(copiedStyle.textColor ? { textColor: copiedStyle.textColor } : {}),
            ...(copiedStyle.fill ? { fill: copiedStyle.fill } : {}),
          };
        }
        return { ...prev, styles: nextStyles };
      });

      if (copiedStyle.fontSizePt !== undefined && onCustomFontSizesChange) {
        const fontSizesUpdate: Record<string, number> = {};
        for (const tid of targets) {
          const baseEl = currentSlideElements.find((e) => e.id === tid);
          if (baseEl) {
            if (baseEl.unitIds && baseEl.unitIds.length > 0) {
              for (const uid of baseEl.unitIds) fontSizesUpdate[uid] = copiedStyle.fontSizePt;
            } else if (baseEl.unitId) {
              fontSizesUpdate[baseEl.unitId] = copiedStyle.fontSizePt;
            }
          }
          fontSizesUpdate[tid] = copiedStyle.fontSizePt;
        }
        onCustomFontSizesChange(fontSizesUpdate);
      }

      setIsFormatPainterActive(false);
      setQuickActionNotice(`Đã dán định dạng cho ${targets.length} ô!`);
      if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
      quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 2000);
    },
    [copiedStyle, canvasState, multiSelectedElementIds, pushUndoSnapshot, onCustomFontSizesChange, currentSlideElements]
  );

  // UX Improvement 3: Reset Font Size to Original Slide Value
  const handleResetFontSize = useCallback(
    (elId: string) => {
      const targets = multiSelectedElementIds.size > 0
        ? Array.from(multiSelectedElementIds)
        : (selectedElementId ? [selectedElementId] : (elId ? [elId] : []));

      if (targets.length === 0) return;

      pushUndoSnapshot({ ...canvasState });
      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          if (nextStyles[tid]) {
            const { fontSizePt, ...rest } = nextStyles[tid];
            nextStyles[tid] = rest;
          }
        }
        return { ...prev, styles: nextStyles };
      });

      if (onCustomFontSizesChange) {
        const fontSizesUpdate: Record<string, number> = {};
        for (const tid of targets) {
          const el = currentSlideElements.find((e) => e.id === tid);
          const origSize = el?.fontSizePt ?? 11;
          if (el) {
            if (el.unitIds && el.unitIds.length > 0) {
              for (const uid of el.unitIds) fontSizesUpdate[uid] = origSize;
            } else if (el.unitId) {
              fontSizesUpdate[el.unitId] = origSize;
            }
          }
          fontSizesUpdate[tid] = origSize;
        }
        onCustomFontSizesChange(fontSizesUpdate);
      }

      const firstEl = currentSlideElements.find((e) => e.id === targets[0]);
      setFontSizeFeedback({ elId: targets[0], sizePt: firstEl?.fontSizePt ?? 11 });
      if (fontSizeFeedbackTimerRef.current) clearTimeout(fontSizeFeedbackTimerRef.current);
      fontSizeFeedbackTimerRef.current = setTimeout(() => {
        setFontSizeFeedback(null);
      }, 950);

      setQuickActionNotice(
        targets.length > 1
          ? `Đã đặt lại cỡ chữ gốc cho ${targets.length} ô!`
          : `Đã đặt lại cỡ chữ gốc: ${firstEl?.fontSizePt ?? 11}pt`
      );
      if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
      quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
    },
    [canvasState, currentSlideElements, multiSelectedElementIds, selectedElementId, onCustomFontSizesChange, pushUndoSnapshot]
  );

  // Feature 1: Apply SOP Standard Typography Preset (1-Click)
  const handleApplyTypographyPreset = useCallback(
    (elId: string, preset: TypographyPreset) => {
      pushUndoSnapshot({ ...canvasState });

      const targets = multiSelectedElementIds.size > 0
        ? Array.from(multiSelectedElementIds)
        : (selectedElementId ? [selectedElementId] : (elId ? [elId] : []));

      if (targets.length === 0) return;

      const fontSizesUpdate: Record<string, number> = {};
      for (const tid of targets) {
        const baseEl = currentSlideElements.find((e) => e.id === tid);
        if (baseEl) {
          if (baseEl.unitIds && baseEl.unitIds.length > 0) {
            for (const uid of baseEl.unitIds) fontSizesUpdate[uid] = preset.fontSizePt;
          } else if (baseEl.unitId) {
            fontSizesUpdate[baseEl.unitId] = preset.fontSizePt;
          }
        }
        fontSizesUpdate[tid] = preset.fontSizePt;
      }

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const curStyle = nextStyles[tid] || {};
          nextStyles[tid] = {
            ...curStyle,
            fontSizePt: preset.fontSizePt,
            isBold: preset.isBold,
          };
        }
        return {
          ...prev,
          styles: nextStyles,
        };
      });

      if (onCustomFontSizesChange && Object.keys(fontSizesUpdate).length > 0) {
        onCustomFontSizesChange(fontSizesUpdate);
      }

      setFontSizeFeedback({ elId: targets[0], sizePt: preset.fontSizePt });
      if (fontSizeFeedbackTimerRef.current) clearTimeout(fontSizeFeedbackTimerRef.current);
      fontSizeFeedbackTimerRef.current = setTimeout(() => {
        setFontSizeFeedback(null);
      }, 950);

      setQuickActionNotice(
        targets.length > 1
          ? `Đã áp dụng chuẩn SOP (${preset.label} ${preset.fontSizePt}pt) cho ${targets.length} ô!`
          : `Đã áp dụng chuẩn SOP: ${preset.label} (${preset.fontSizePt}pt${preset.isBold ? " Bold" : ""})`
      );
      if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
      quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 2000);
    },
    [canvasState, currentSlideElements, multiSelectedElementIds, selectedElementId, onCustomFontSizesChange, pushUndoSnapshot]
  );

  // Feature 5: Helper to highlight SOP Glossary terms with visual badges
  const renderHighlightedSopText = useCallback(
    (text: string, isEnglishOrTarget: boolean) => {
      if (!isHighlightSopTerms || !text || !isEnglishOrTarget) {
        return text;
      }
      SOP_TERM_REGEX.lastIndex = 0;
      const parts = text.split(SOP_TERM_REGEX);
      if (parts.length <= 1) return text;

      return parts.map((part, pIdx) => {
        if (!part) return null;
        // In text.split with capturing group, odd indices are the matched terms
        if (pIdx % 2 === 1) {
          return (
            <span
              key={`sop_badge_${pIdx}`}
              className="inline-flex items-center gap-0.5 px-1 py-0.2 mx-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-600/60 shadow-2xs select-none align-baseline"
              title={`Thuật ngữ Chuẩn SOP: "${part}"`}
            >
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0 inline" />
              <span>{part}</span>
            </span>
          );
        }
        return <React.Fragment key={`sop_txt_${pIdx}`}>{part}</React.Fragment>;
      });
    },
    [isHighlightSopTerms]
  );

  const handleToggleBold = useCallback(
    (el: SlideVisualElement) => {
      pushUndoSnapshot({ ...canvasState });
      const targets =
        multiSelectedElementIds.size > 0
          ? Array.from(multiSelectedElementIds)
          : (selectedElementId ? [selectedElementId] : [el.id]);

      const curStyle = canvasState.styles[el.id] || {};
      const newBold = !(curStyle.isBold !== undefined ? curStyle.isBold : Boolean(el.isBold));

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const cStyle = nextStyles[tid] || {};
          nextStyles[tid] = { ...cStyle, isBold: newBold };
        }
        return {
          ...prev,
          styles: nextStyles,
        };
      });

      if (targets.length > 1) {
        setQuickActionNotice(`Đã ${newBold ? "in đậm" : "bỏ in đậm"} cho ${targets.length} ô!`);
        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
      }
    },
    [canvasState, multiSelectedElementIds, selectedElementId, pushUndoSnapshot]
  );

  const handleChangeAlign = useCallback(
    (elId: string, align: "left" | "center" | "right") => {
      pushUndoSnapshot({ ...canvasState });
      const targets =
        multiSelectedElementIds.size > 0
          ? Array.from(multiSelectedElementIds)
          : (selectedElementId ? [selectedElementId] : [elId]);

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const curStyle = nextStyles[tid] || {};
          nextStyles[tid] = { ...curStyle, align };
        }
        return {
          ...prev,
          styles: nextStyles,
        };
      });

      if (targets.length > 1) {
        setQuickActionNotice(
          `Đã căn lề ${align === "center" ? "giữa" : align === "right" ? "phải" : "trái"} cho ${targets.length} ô!`
        );
        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
      }
    },
    [canvasState, multiSelectedElementIds, selectedElementId, pushUndoSnapshot]
  );

  const handleAutoFitText = useCallback(
    (el: SlideVisualElement, textContent: string) => {
      if (!textContent || textContent.trim().length === 0) return;
      pushUndoSnapshot({ ...canvasState });

      const size = canvasState.sizes[el.id] || { width: el.box.width, height: el.box.height };
      const rawAspect = currentVisualLayout?.aspectRatio || (16 / 9);
      const containerW = containerSize.width || 1200;
      const containerH = containerSize.height || 650;
      let fitW = Math.max(100, containerW - (fitMode === "width" ? 16 : 24));
      let fitH = Math.round(fitW / rawAspect);
      if (fitMode === "contain") {
        const availH = Math.max(100, containerH - 24);
        if (fitH > availH) {
          fitH = availH;
          fitW = Math.round(availH * rawAspect);
        }
      }
      const sWidth = Math.floor(fitW * zoomScale);
      const sHeight = Math.floor(fitH * zoomScale);

      const boxWpx = Math.max(30, (size.width / 100) * sWidth - 12);
      const boxHpx = Math.max(18, (size.height / 100) * sHeight - 6);

      const charCount = textContent.length;
      let bestFs = 11;

      for (let fs = 22; fs >= 6; fs--) {
        const charWpx = fs * 1.333 * 0.52;
        const lineHpx = fs * 1.333 * 1.25;
        const charsPerLine = Math.max(1, Math.floor(boxWpx / charWpx));
        const linesNeeded = Math.ceil(charCount / charsPerLine);
        const neededH = linesNeeded * lineHpx;
        if (neededH <= boxHpx) {
          bestFs = fs;
          break;
        }
        if (fs === 6) bestFs = 6;
      }

      setCanvasState((prev) => {
        const curStyle = prev.styles[el.id] || {};
        return {
          ...prev,
          styles: {
            ...prev.styles,
            [el.id]: { ...curStyle, fontSizePt: bestFs },
          },
        };
      });

      if (onCustomFontSizesChange) {
        const targetIds: string[] = [];
        if (el.unitIds && el.unitIds.length > 0) {
          targetIds.push(...el.unitIds);
        } else if (el.unitId) {
          targetIds.push(el.unitId);
        }
        targetIds.push(el.id);
        const fontSizesUpdate: Record<string, number> = {};
        for (const tid of targetIds) {
          fontSizesUpdate[tid] = bestFs;
        }
        onCustomFontSizesChange(fontSizesUpdate);
      }

      setFontSizeFeedback({ elId: el.id, sizePt: bestFs });
      if (fontSizeFeedbackTimerRef.current) clearTimeout(fontSizeFeedbackTimerRef.current);
      fontSizeFeedbackTimerRef.current = setTimeout(() => {
        setFontSizeFeedback(null);
      }, 950);
    },
    [canvasState, containerSize, currentVisualLayout, zoomScale, fitMode, pushUndoSnapshot, onCustomFontSizesChange]
  );

  const handleChangeColor = useCallback(
    (elId: string, type: "textColor" | "fill", color: string) => {
      pushUndoSnapshot({ ...canvasState });
      const targets =
        multiSelectedElementIds.size > 0
          ? Array.from(multiSelectedElementIds)
          : (selectedElementId ? [selectedElementId] : [elId]);

      setCanvasState((prev) => {
        const nextStyles = { ...prev.styles };
        for (const tid of targets) {
          const curStyle = nextStyles[tid] || {};
          nextStyles[tid] = {
            ...curStyle,
            [type]: color,
          };
        }
        return {
          ...prev,
          styles: nextStyles,
        };
      });

      if (targets.length > 1) {
        setQuickActionNotice(
          `Đã đổi ${type === "textColor" ? "màu chữ" : "màu nền"} cho ${targets.length} ô!`
        );
        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
      }
    },
    [canvasState, multiSelectedElementIds, selectedElementId, pushUndoSnapshot]
  );

  const handleToggleBatchTranslate = useCallback(() => {
    const selectedElements = currentSlideElements.filter((el) => multiSelectedElementIds.has(el.id));
    const allTargetUnitIds: string[] = [];
    for (const el of selectedElements) {
      const uids = (el.unitIds && el.unitIds.length > 0)
        ? el.unitIds
        : el.unitId ? [el.unitId] : [];
      for (const uid of uids) if (!allTargetUnitIds.includes(uid)) allTargetUnitIds.push(uid);
    }
    if (allTargetUnitIds.length > 0) {
      const allSelected = allTargetUnitIds.every((uid) => selectedUnitIds.has(uid));
      for (const uid of allTargetUnitIds) {
        if (allSelected) {
          if (selectedUnitIds.has(uid)) onToggleUnit(uid);
        } else {
          if (!selectedUnitIds.has(uid)) onToggleUnit(uid);
        }
      }
      setQuickActionNotice(
        allSelected
          ? `Đã bỏ chọn dịch ${allTargetUnitIds.length} dòng!`
          : `Đã chọn dịch ${allTargetUnitIds.length} dòng trong ${multiSelectedElementIds.size} ô!`
      );
      if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
      quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
    }
  }, [currentSlideElements, multiSelectedElementIds, selectedUnitIds, onToggleUnit]);

  const handleSkipSelectedArea = useCallback(() => {
    const elements = [...currentSlideElements, ...(report.visualLayouts || []).flatMap((layout) => layout.elements)];
    const ids = new Set(elements.filter((el) => multiSelectedElementIds.has(el.id)).flatMap((el) => el.unitIds?.length ? el.unitIds : el.unitId ? [el.unitId] : []));
    onSkipUnits([...ids]);
    setQuickActionNotice(`Đã bỏ dịch ${multiSelectedElementIds.size} ô. Nội dung được giữ nguyên.`);
    if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
    quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 2200);
  }, [currentSlideElements, report.visualLayouts, multiSelectedElementIds, onSkipUnits]);

  const handleLayerOrder = useCallback(
    (elId: string, direction: "forward" | "backward") => {
      pushUndoSnapshot({ ...canvasState });
      const targetEl = currentSlideElements.find((e) => e.id === elId);
      const effectiveTargetId = targetEl?.type === "cell" && targetEl.tableId ? targetEl.tableId : elId;

      setCanvasState((prev) => {
        // Collect effective zIndex of all elements on the current slide
        const elementsWithZ = currentSlideElements.map((el, idx) => {
          const effectiveId = el.type === "cell" && el.tableId ? el.tableId : el.id;
          const customZ = prev.styles[effectiveId]?.zIndex ?? prev.styles[el.id]?.zIndex;
          return {
            id: effectiveId,
            z: customZ !== undefined ? customZ : (10 + idx * 2),
          };
        });

        const target = elementsWithZ.find((e) => e.id === effectiveTargetId);
        const curZ = target?.z ?? (prev.styles[effectiveTargetId]?.zIndex ?? prev.styles[elId]?.zIndex ?? 10);

        let nextZ: number;
        if (direction === "forward") {
          // Find other elements with higher zIndex
          const aboveElements = elementsWithZ.filter((e) => e.id !== effectiveTargetId && e.z >= curZ);
          if (aboveElements.length > 0) {
            const minAboveZ = Math.min(...aboveElements.map((e) => e.z));
            nextZ = minAboveZ + 2;
          } else {
            nextZ = curZ + 5;
          }
        } else {
          // Find other elements with lower zIndex
          const belowElements = elementsWithZ.filter((e) => e.id !== effectiveTargetId && e.z <= curZ);
          if (belowElements.length > 0) {
            const maxBelowZ = Math.max(...belowElements.map((e) => e.z));
            nextZ = Math.max(1, maxBelowZ - 2);
          } else {
            nextZ = Math.max(1, curZ - 5);
          }
        }

        const curStyle = prev.styles[effectiveTargetId] || prev.styles[elId] || {};
        return {
          ...prev,
          styles: {
            ...prev.styles,
            [effectiveTargetId]: { ...curStyle, zIndex: nextZ },
            ...(effectiveTargetId !== elId ? { [elId]: { ...prev.styles[elId], zIndex: nextZ } } : {}),
          },
        };
      });
    },
    [canvasState, currentSlideElements, pushUndoSnapshot]
  );

  const handleDuplicateElement = useCallback(
    (el: SlideVisualElement) => {
      pushUndoSnapshot({ ...canvasState });

      const pos = canvasState.positions[el.id] || { left: el.box.left, top: el.box.top };
      const size = canvasState.sizes[el.id] || { width: el.box.width, height: el.box.height };
      const style = canvasState.styles[el.id] || {};

      const cloneId = `clone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newLeft = Math.min(95 - size.width, pos.left + 2.5);
      const newTop = Math.min(95 - size.height, pos.top + 2.5);

      const clonedEl: SlideVisualElement = {
        ...el,
        id: cloneId,
        shapeName: `${el.shapeName || "Phần tử"} (Bản sao)`,
        box: {
          left: newLeft,
          top: newTop,
          width: size.width,
          height: size.height,
        },
      };
      (clonedEl as any).slideIndex = currentSlide;

      setCanvasState((prev) => ({
        ...prev,
        addedElements: [...prev.addedElements, clonedEl],
        positions: {
          ...prev.positions,
          [cloneId]: { left: newLeft, top: newTop },
        },
        sizes: {
          ...prev.sizes,
          [cloneId]: { width: size.width, height: size.height },
        },
        styles: {
          ...prev.styles,
          [cloneId]: { ...style },
        },
      }));

      setSelectedElementId(cloneId);
    },
    [canvasState, currentSlide, pushUndoSnapshot]
  );

  const handleDeleteElement = useCallback(
    (elId: string) => {
      pushUndoSnapshot({ ...canvasState });
      setCanvasState((prev) => ({
        ...prev,
        deletedElementIds: [...prev.deletedElementIds, elId],
        addedElements: prev.addedElements.filter((a) => a.id !== elId),
      }));
      setSelectedElementId(null);
    },
    [canvasState, pushUndoSnapshot]
  );

  // Separate title, table, and body units
  const { titleUnit, tableUnits, bodyUnits } = useMemo(() => {
    let title: ScannedTextUnit | undefined;
    const tables: ScannedTextUnit[] = [];
    const bodies: ScannedTextUnit[] = [];

    for (const u of currentUnits) {
      if (u.location.isTable) {
        tables.push(u);
      } else if (u.location.isTitle && !title) {
        title = u;
      } else {
        bodies.push(u);
      }
    }

    if (!title && bodies.length > 0) {
      const bannerIdx = bodies.findIndex((b) => {
        const text = b.sourceText.trim();
        if (text.length > 90 || text.includes("\n") || /\b\d+\.\s*[A-Za-z]/.test(text)) return false;
        if (/^(assembly|cutting|stitching|outgoing|stockfit)?\s*(inspection\s*strategy|chiến\s*lược\s*kiểm\s*tra|standard\s*operating\s*procedure|ipqc\s*manual|qa\/?ipqc\s*manual)/i.test(text)) return true;
        if (b.location.box && b.location.box.top <= 12 && b.location.box.width >= 40) return true;
        return false;
      });
      if (bannerIdx >= 0) {
        title = bodies.splice(bannerIdx, 1)[0];
      } else if (bodies[0].sourceText.length <= 80 && !bodies[0].sourceText.includes("\n") && !/\b\d+\.\s*[A-Za-z]/.test(bodies[0].sourceText)) {
        title = bodies.shift();
      }
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
        // Defensive hygiene: reject corrupted legacy pairings where different shoe sizes or measurements were falsely linked
        if (/size\s*#?\d+/i.test(unit.sourceText) && /size\s*#?\d+/i.test(unit.existingTranslation)) {
          const sMatch = unit.sourceText.match(/size\s*#?\d+(?:[.,]\d+)?(?:\s*-\s*#?\d+(?:[.,]\d+)?)?/i)?.[0]?.toLowerCase().replace(/\s+/g, "");
          const tMatch = unit.existingTranslation.match(/size\s*#?\d+(?:[.,]\d+)?(?:\s*-\s*#?\d+(?:[.,]\d+)?)?/i)?.[0]?.toLowerCase().replace(/\s+/g, "");
          if (sMatch && tMatch && sMatch !== tMatch) {
            return "";
          }
        }
        const numS = extractNumericParameters(unit.sourceText);
        const numT = extractNumericParameters(unit.existingTranslation);
        if (numS.length > 0 && numT.length > 0) {
          const shared = numS.filter((n) => numT.includes(n));
          if (shared.length === 0 && (numS.length >= 2 || numT.length >= 2)) {
            return "";
          }
        }
        return unit.existingTranslation;
      }
      return "";
    },
    [customEdits]
  );

  // Navigation handlers (Smooth, throttled, and resilient to stale closures)
  const handlePrevSlide = useCallback(() => {
    const now = Date.now();
    if (now - navThrottleRef.current < 160) return;
    navThrottleRef.current = now;

    setCurrentSlide((prev) => {
      if (prev <= 1) return prev;
      return prev - 1;
    });
    setEditingUnitId(null);
    setSelectedElementId(null);
    setContextMenu(null);
  }, []);

  const handleNextSlide = useCallback(() => {
    const now = Date.now();
    if (now - navThrottleRef.current < 160) return;
    navThrottleRef.current = now;

    setCurrentSlide((prev) => {
      if (prev >= report.totalSlides) return prev;
      return prev + 1;
    });
    setEditingUnitId(null);
    setSelectedElementId(null);
    setContextMenu(null);
  }, [report.totalSlides]);

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

  const applyEditDirectly = useCallback(
    (unitId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      onSaveCustomEdit(unitId, editText);
      // If unit was selected for AI translation, uncheck it since user manually completed it
      if (selectedUnitIds.has(unitId)) {
        onToggleUnit(unitId);
      }
      setEditingUnitId(null);
    },
    [editText, onSaveCustomEdit, selectedUnitIds, onToggleUnit]
  );

  const selectOnlyThisUnit = useCallback(
    (targetUnit: ScannedTextUnit, allUnitsInElement: ScannedTextUnit[], e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      for (const ou of allUnitsInElement) {
        if (ou.id !== targetUnit.id && selectedUnitIds.has(ou.id)) {
          onToggleUnit(ou.id);
        }
      }
      if (!selectedUnitIds.has(targetUnit.id)) {
        onToggleUnit(targetUnit.id);
      }
    },
    [selectedUnitIds, onToggleUnit]
  );

  const toggleUnitSelection = useCallback(
    (unitId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      onToggleUnit(unitId);
    },
    [onToggleUnit]
  );

  const selectAllUnitsInElement = useCallback(
    (units: ScannedTextUnit[], e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      for (const u of units) {
        if (!selectedUnitIds.has(u.id)) {
          onToggleUnit(u.id);
        }
      }
    },
    [selectedUnitIds, onToggleUnit]
  );

  const deselectAllUnitsInElement = useCallback(
    (units: ScannedTextUnit[], e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      for (const u of units) {
        if (selectedUnitIds.has(u.id)) {
          onToggleUnit(u.id);
        }
      }
    },
    [selectedUnitIds, onToggleUnit]
  );

  const handleMergeLine = useCallback(
    (
      direction: "up" | "down",
      targetUnit?: ScannedTextUnit | null,
      uIdx?: number,
      unitsList?: ScannedTextUnit[]
    ) => {
      const units =
        unitsList ||
        contextMenu?.elementUnits ||
        (contextMenu?.element?.unitIds
          ? contextMenu.element.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
          : []);
      if (!units || units.length <= 1) return;

      const unit = targetUnit || contextMenu?.unit || units[0];
      const idx = uIdx !== undefined ? uIdx : units.findIndex((u) => u.id === unit.id);
      if (idx < 0) return;

      if (direction === "up") {
        if (idx === 0) return;
        const aboveUnit = units[idx - 1];
        const currentUnit = units[idx];

        // Merge source text
        const sAbove = (aboveUnit.sourceText || "").trim();
        const sCurrent = (currentUnit.sourceText || "").trim();
        const mergedSource = sAbove ? (sCurrent ? `${sAbove} ${sCurrent}` : sAbove) : sCurrent;

        // Merge translation / custom text if any
        const tAbove = getTranslationText(aboveUnit).trim();
        const tCurrent = getTranslationText(currentUnit).trim();
        let mergedTrans = "";
        if (tAbove || tCurrent) {
          mergedTrans = tAbove ? (tCurrent ? `${tAbove} ${tCurrent}` : tAbove) : tCurrent;
        }

        aboveUnit.sourceText = mergedSource;
        currentUnit.sourceText = "";

        if (mergedTrans) {
          onSaveCustomEdit(aboveUnit.id, mergedTrans);
        }
        onSaveCustomEdit(currentUnit.id, "");

        if (selectedUnitIds.has(currentUnit.id)) {
          onToggleUnit(currentUnit.id);
        }
        if (!selectedUnitIds.has(aboveUnit.id) && !mergedTrans) {
          onToggleUnit(aboveUnit.id);
        }
      } else if (direction === "down") {
        if (idx >= units.length - 1) return;
        const currentUnit = units[idx];
        const belowUnit = units[idx + 1];

        // Merge source text
        const sCurrent = (currentUnit.sourceText || "").trim();
        const sBelow = (belowUnit.sourceText || "").trim();
        const mergedSource = sCurrent ? (sBelow ? `${sCurrent} ${sBelow}` : sCurrent) : sBelow;

        // Merge translation / custom text if any
        const tCurrent = getTranslationText(currentUnit).trim();
        const tBelow = getTranslationText(belowUnit).trim();
        let mergedTrans = "";
        if (tCurrent || tBelow) {
          mergedTrans = tCurrent ? (tBelow ? `${tCurrent} ${tBelow}` : tCurrent) : tBelow;
        }

        currentUnit.sourceText = mergedSource;
        belowUnit.sourceText = "";

        if (mergedTrans) {
          onSaveCustomEdit(currentUnit.id, mergedTrans);
        }
        onSaveCustomEdit(belowUnit.id, "");

        if (selectedUnitIds.has(belowUnit.id)) {
          onToggleUnit(belowUnit.id);
        }
        if (!selectedUnitIds.has(currentUnit.id) && !mergedTrans) {
          onToggleUnit(currentUnit.id);
        }
      }

      setContextMenu(null);
    },
    [contextMenu, unitById, getTranslationText, onSaveCustomEdit, selectedUnitIds, onToggleUnit]
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

  // Determine currently inspected element (including duplicated elements)
  const inspectedElement = useMemo(() => {
    if (!currentSlideElements || currentSlideElements.length === 0) return null;
    if (selectedElementId) {
      const found = currentSlideElements.find((el) => el.id === selectedElementId);
      if (found) return found;
    }
    return null;
  }, [currentSlideElements, selectedElementId]);

  // Inspected unit (if text/table element)
  const inspectedUnit = useMemo(() => {
    if (!inspectedElement?.unitId) return null;
    return unitById.get(inspectedElement.unitId) || null;
  }, [inspectedElement, unitById]);

  // All text units in the currently inspected/selected element
  const inspectedUnits = useMemo(() => {
    if (!inspectedElement) return [];
    if (inspectedElement.unitIds && inspectedElement.unitIds.length > 0) {
      return inspectedElement.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u));
    }
    if (inspectedElement.unitId && unitById.get(inspectedElement.unitId)) {
      return [unitById.get(inspectedElement.unitId)!];
    }
    return [];
  }, [inspectedElement, unitById]);

  const inspectedFullText = useMemo(() => {
    return inspectedUnits.map((u) => getTranslationText(u) || u.sourceText).join(" ") || inspectedElement?.text || "";
  }, [inspectedUnits, getTranslationText, inspectedElement]);

  // Active Focus Element for Ribbon Toolbar & quick shortcuts:
  // Prioritizes: Explicitly selected elements > Clicked element > Inspected element > Last active element
  const activeFocusElement = useMemo(() => {
    if (multiSelectedElementIds.size > 0) {
      const firstId = Array.from(multiSelectedElementIds)[0];
      const found = currentSlideElements.find((el) => el.id === firstId);
      if (found) return found;
    }
    if (selectedElementId) {
      const found = currentSlideElements.find((el) => el.id === selectedElementId);
      if (found) return found;
    }
    if (inspectedElement) return inspectedElement;
    if (lastActiveElementId) {
      const found = currentSlideElements.find((el) => el.id === lastActiveElementId);
      if (found) return found;
    }
    return null;
  }, [multiSelectedElementIds, selectedElementId, inspectedElement, lastActiveElementId, currentSlideElements]);

  const activeFocusUnits = useMemo(() => {
    if (!activeFocusElement) return [];
    if (activeFocusElement.unitIds && activeFocusElement.unitIds.length > 0) {
      return activeFocusElement.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u));
    }
    if (activeFocusElement.unitId && unitById.get(activeFocusElement.unitId)) {
      return [unitById.get(activeFocusElement.unitId)!];
    }
    return [];
  }, [activeFocusElement, unitById]);

  const activeFocusFullText = useMemo(() => {
    return activeFocusUnits.map((u) => getTranslationText(u) || u.sourceText).join(" ") || activeFocusElement?.text || "";
  }, [activeFocusUnits, getTranslationText, activeFocusElement]);

  // Stepping through layers
  const handleSelectNextLayer = useCallback(() => {
    if (!currentSlideElements || currentSlideElements.length === 0) return;
    const curIdx = currentSlideElements.findIndex((el) => el.id === inspectedElement?.id);
    const nextIdx = (curIdx + 1) % currentSlideElements.length;
    setSelectedElementId(currentSlideElements[nextIdx].id);
  }, [currentSlideElements, inspectedElement]);

  const handleSelectPrevLayer = useCallback(() => {
    if (!currentSlideElements || currentSlideElements.length === 0) return;
    const curIdx = currentSlideElements.findIndex((el) => el.id === inspectedElement?.id);
    const prevIdx = (curIdx - 1 + currentSlideElements.length) % currentSlideElements.length;
    setSelectedElementId(currentSlideElements[prevIdx].id);
  }, [currentSlideElements, inspectedElement]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contentEditable element
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

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

      // Ignore OS key hold repeat to prevent auto-scrolling past slides uncontrollably
      if (e.repeat) return;

      // Check if user is pressing D (Next Slide) or A (Prev Slide)
      // Handles physical keys (e.code), character keys, and Vietnamese Telex IME variations ('d', 'đ', 'Đ', 'a', 'â', 'ă')
      const isNextSlideKey =
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "ArrowRight" ||
          e.code === "KeyD" ||
          e.key.toLowerCase() === "d" ||
          e.key === "đ" ||
          e.key === "Đ");

      const isPrevSlideKey =
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "ArrowLeft" ||
          e.code === "KeyA" ||
          e.key.toLowerCase() === "a" ||
          e.key === "â" ||
          e.key === "ă");

      if (isPrevSlideKey) {
        e.preventDefault();
        e.stopPropagation();
        handlePrevSlide();
        return;
      }

      if (isNextSlideKey) {
        e.preventDefault();
        e.stopPropagation();
        handleNextSlide();
        return;
      }

      // UX Improvement 1: Format Painter Shortcuts (Ctrl+Shift+C to copy, Ctrl+Shift+V to paste)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === "c" || e.code === "KeyC")) {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleCopyStyle(target.id);
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === "v" || e.code === "KeyV")) {
        const target = activeFocusElement || inspectedElement;
        if (target && copiedStyle) {
          e.preventDefault();
          handlePasteStyle(target.id);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Canva Action Shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "d" || e.code === "KeyD")) {
        if (inspectedElement) {
          e.preventDefault();
          handleDuplicateElement(inspectedElement);
        }
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (inspectedElement) {
          e.preventDefault();
          handleDeleteElement(inspectedElement.id);
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "b" || e.code === "KeyB")) {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleToggleBold(target);
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "[" || e.code === "BracketLeft")) {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleLayerOrder(target.id, "backward");
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "]" || e.code === "BracketRight")) {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleLayerOrder(target.id, "forward");
        }
        return;
      } else if (e.key === "[") {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleChangeFontSize(target.id, -1);
        }
        return;
      } else if (e.key === "]") {
        const target = activeFocusElement || inspectedElement;
        if (target) {
          e.preventDefault();
          handleChangeFontSize(target.id, 1);
        }
        return;
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) handleSelectPrevLayer();
        else handleSelectNextLayer();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (inspectedUnit) startEdit(inspectedUnit);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (showShortcutsModal) setShowShortcutsModal(false);
        setIsAreaSelectMode(false);
        setMultiSelectedElementIds(new Set());
        if (colorPopover) setColorPopover(null);
        else if (contextMenu) setContextMenu(null);
        else if (editingUnitId) cancelEdit();
        else if (selectedElementId) setSelectedElementId(null);
        else if (isFormatPainterActive) setIsFormatPainterActive(false);
      } else if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeTag = (document.activeElement?.tagName || "").toLowerCase();
        const isInputActive = activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;
        if (!isInputActive && !editingUnitId) {
          e.preventDefault();
          setShowShortcutsModal((prev) => !prev);
        }
      } else if (e.key === " " && !e.repeat) {
        const activeTag = (document.activeElement?.tagName || "").toLowerCase();
        const isInputActive = activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;
        if (!isInputActive && !editingUnitId) {
          e.preventDefault();
          isSpacePressedRef.current = true;
          setIsSpacePressed(true);
        } else if (inspectedUnit) {
          e.preventDefault();
          onToggleUnit(inspectedUnit.id);
        }
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeTag = (document.activeElement?.tagName || "").toLowerCase();
        const isInputActive = activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;
        if (!isInputActive && !editingUnitId) {
          e.preventDefault();
          setIsAreaSelectMode((prev) => !prev);
        }
      } else if (e.key.toLowerCase() === "f") {
        setFocusPendingOnly((prev) => !prev);
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        setFitMode((prev) => (prev === "contain" ? "width" : "contain"));
      } else if (e.key === "+" || e.key === "=") {
        setZoomScale((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))));
      } else if (e.key === "-") {
        setZoomScale((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))));
      } else if (e.key === "0") {
        e.preventDefault();
        setFitMode("contain");
        setZoomScale(1.0);
        setPanOffset({ x: 0, y: 0 });
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setSlideViewMode((prev) => (prev === "document" ? "presentation" : "document"));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    handlePrevSlide,
    handleNextSlide,
    handleSelectNextLayer,
    handleSelectPrevLayer,
    inspectedElement,
    inspectedUnit,
    editingUnitId,
    selectedElementId,
    colorPopover,
    contextMenu,
    startEdit,
    cancelEdit,
    onToggleUnit,
    onSaveCustomEdit,
    editText,
    handleUndo,
    handleRedo,
    handleDuplicateElement,
    handleDeleteElement,
    handleToggleBold,
    handleChangeFontSize,
    handleLayerOrder,
    setSlideViewMode,
    activeFocusElement,
    handleCopyStyle,
    handlePasteStyle,
    copiedStyle,
    isFormatPainterActive,
  ]);

  // UX Improvement 6: Smooth Pan & Zoom Mouse Handlers & Marquee Area Selection
  const handleCanvasContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest("button, input, textarea, a, select")) return;

      // 1. Pan mode (Space pressed or middle click)
      if (isSpacePressedRef.current || e.button === 1) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          origPanX: panOffset.x,
          origPanY: panOffset.y,
        };

        let panRafId: number | null = null;
        const handleMouseMove = (moveEvt: MouseEvent) => {
          if (!isPanningRef.current || !panStartRef.current) return;
          moveEvt.preventDefault();
          const dx = moveEvt.clientX - panStartRef.current.startX;
          const dy = moveEvt.clientY - panStartRef.current.startY;
          const nextX = panStartRef.current.origPanX + dx;
          const nextY = panStartRef.current.origPanY + dy;
          if (panRafId) cancelAnimationFrame(panRafId);
          panRafId = requestAnimationFrame(() => {
            setPanOffset({
              x: nextX,
              y: nextY,
            });
          });
        };

        const handleMouseUp = () => {
          if (panRafId) cancelAnimationFrame(panRafId);
          isPanningRef.current = false;
          panStartRef.current = null;
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return;
      }

      // 2. Right Click (Chuột phải) hoặc chế độ Quét: Bấm giữ kéo để quét chọn nhiều ô
      if (e.button === 2 || (isAreaSelectMode && e.button === 0)) {
        handleStartAreaSelection(e);
        return;
      }

      // 3. Left Click trên nền trống canvas: Hủy chọn ô đang chọn
      if (e.button === 0 && !target.closest("[data-element-id]")) {
        setMultiSelectedElementIds(new Set());
        setSelectedElementId(null);
      }
    },
    [panOffset, isAreaSelectMode, handleStartAreaSelection]
  );



  // ==========================================================================
  // ALT + MOUSE WHEEL: INSTANT FONT SIZE ADJUSTMENT ON ACTIVE/HOVERED ELEMENT
  // ==========================================================================
  const wheelAccumulatorRef = useRef(0);
  const wheelGestureActiveRef = useRef(false);
  const wheelGestureTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep fresh references to avoid tearing down and re-binding wheel listeners on every render
  const activeFocusElementRef = useRef(activeFocusElement);
  activeFocusElementRef.current = activeFocusElement;
  const selectedElementIdRef = useRef(selectedElementId);
  selectedElementIdRef.current = selectedElementId;
  const inspectedElementRef = useRef(inspectedElement);
  inspectedElementRef.current = inspectedElement;
  const currentSlideElementsRef = useRef(currentSlideElements);
  currentSlideElementsRef.current = currentSlideElements;
  const unitByIdRef = useRef(unitById);
  unitByIdRef.current = unitById;
  const handleChangeFontSizeRef = useRef(handleChangeFontSize);
  handleChangeFontSizeRef.current = handleChangeFontSize;
  const pushUndoSnapshotRef = useRef(pushUndoSnapshot);
  pushUndoSnapshotRef.current = pushUndoSnapshot;
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 0. UX Improvement 6: Smooth Zoom with Ctrl + Wheel
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoomScale((prev) => Math.max(0.4, Math.min(3.0, Number((prev * factor).toFixed(2)))));
        return;
      }

      // Only trigger when Alt key is held down
      if (!e.altKey) return;

      // 1. Direct hit-test from cursor position at the exact moment of wheel event!
      let targetId: string | null = null;
      let targetEl: SlideVisualElement | null = null;

      const elUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
      const hitDom = elUnderCursor?.closest("[data-element-id]");
      if (hitDom) {
        targetId = hitDom.getAttribute("data-element-id");
      }

      const elements = currentSlideElementsRef.current;
      if (targetId) {
        targetEl = elements.find((x) => x.id === targetId) || null;
      }

      // 2. Fallback to activeFocusElement / lastActiveElement / selectedElementId
      const activeFocus = activeFocusElementRef.current;
      const selId = selectedElementIdRef.current;
      const inspected = inspectedElementRef.current;

      if (!targetId && activeFocus) {
        targetId = activeFocus.id;
        targetEl = activeFocus;
      } else if (!targetId && selId) {
        targetId = selId;
        targetEl = inspected;
      }

      if (!targetId) return;

      // Prevent page/container vertical scroll so slide stays completely stationary
      e.preventDefault();
      e.stopPropagation();

      // At start of wheel gesture, record a single undo snapshot
      if (!wheelGestureActiveRef.current) {
        wheelGestureActiveRef.current = true;
        pushUndoSnapshotRef.current({ ...canvasStateRef.current });
      }

      // Reset gesture timer
      if (wheelGestureTimerRef.current) clearTimeout(wheelGestureTimerRef.current);
      wheelGestureTimerRef.current = setTimeout(() => {
        wheelGestureActiveRef.current = false;
        wheelAccumulatorRef.current = 0;
      }, 350);

      wheelAccumulatorRef.current += e.deltaY;
      const THRESHOLD = 35; // Responsive notch trigger

      if (Math.abs(wheelAccumulatorRef.current) >= THRESHOLD) {
        // Scrolling UP (deltaY < 0) -> Increase font size (+1pt)
        // Scrolling DOWN (deltaY > 0) -> Decrease font size (-1pt)
        const step = wheelAccumulatorRef.current < 0 ? 1 : -1;
        wheelAccumulatorRef.current = 0;
        handleChangeFontSizeRef.current(targetId, step, true);

        // Keep lastActiveElementId in sync with the element being adjusted
        if (targetEl) {
          setLastActiveElementId(targetId);
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (wheelGestureTimerRef.current) clearTimeout(wheelGestureTimerRef.current);
    };
  }, []);

  // ==========================================================================
  // TRANSLATION ACTIONS (SINGLE & BATCH)
  // ==========================================================================

  const handleTranslateUnits = async (unitsToTranslate: ScannedTextUnit[]) => {
    if (!unitsToTranslate || unitsToTranslate.length === 0) return;
    setIsTranslatingQuick(true);
    try {
      for (const unit of unitsToTranslate) {
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
          break;
        }
      }
    } catch (err: any) {
      alert("Lỗi kết nối dịch: " + err.message);
    } finally {
      setIsTranslatingQuick(false);
      setContextMenu(null);
    }
  };

  const handleTranslateSingleUnit = (unit: ScannedTextUnit) => handleTranslateUnits([unit]);

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

    if (fitMode === "width") {
      // HƯỚNG 1: BUNG RỘNG CHIỀU NGANG THOÁNG ĐÃNG CHUẨN POWERPOINT
      const availW = Math.max(300, containerW - 24);
      // Giới hạn max-width thoải mái 1360px để hiển thị sắc nét, thoáng đãng không bị tràn màn hình siêu rộng
      const fitW = Math.min(availW, 1360);
      const fitH = Math.round(fitW / rawAspect);

      return {
        width: Math.floor(fitW * zoomScale),
        height: Math.floor(fitH * zoomScale),
        aspectRatio: rawAspect,
      };
    }

    // CHẾ ĐỘ VỪA KHUNG (CONTAIN): VỪA KHÍT 100% KHUNG NHÌN KHÔNG PHÁT SINH CUỘN
    const margin = 24;
    const availW = Math.max(100, containerW - margin);
    const availH = Math.max(100, containerH - margin);

    let fitW = availW;
    let fitH = availW / rawAspect;

    if (fitH > availH) {
      fitH = availH;
      fitW = Math.round(availH * rawAspect);
    }

    if (fitW > availW) {
      fitW = availW;
      fitH = Math.round(availW / rawAspect);
    }

    return {
      width: Math.floor(fitW * zoomScale),
      height: Math.floor(fitH * zoomScale),
      aspectRatio: rawAspect,
    };
  }, [containerSize, currentVisualLayout, zoomScale, fitMode]);

  const dualSlideDimensions = useMemo(() => {
    const rawAspect = currentVisualLayout?.aspectRatio || (16 / 9);
    const containerW = containerSize.width || 1200;
    const containerH = containerSize.height || 650;

    if (fitMode === "width") {
      const availW = Math.max(100, (containerW - 32) / 2);
      const fitW = availW;
      const fitH = Math.round(availW / rawAspect);

      return {
        width: Math.floor(fitW * zoomScale),
        height: Math.floor(fitH * zoomScale),
        aspectRatio: rawAspect,
      };
    }

    const marginX = 16;
    const marginY = 16;
    const availW = Math.max(100, (containerW - marginX * 2 - 16) / 2);
    const availH = Math.max(100, containerH - marginY * 2);

    let fitW = availW;
    let fitH = availW / rawAspect;

    if (fitH > availH) {
      fitH = availH;
      fitW = Math.round(availH * rawAspect);
    }

    if (fitW > availW) {
      fitW = availW;
      fitH = Math.round(availW / rawAspect);
    }

    return {
      width: Math.floor(fitW * zoomScale),
      height: Math.floor(fitH * zoomScale),
      aspectRatio: rawAspect,
    };
  }, [containerSize, currentVisualLayout, zoomScale, fitMode]);

  // ==========================================================================
  // MODULAR SLIDE SHEET RENDERER (OPENXML NORMAUTOFIT & CANVAS TEXT METRICS)
  // ==========================================================================

  // Offscreen Canvas Text Metrics Measurement Cache for Pixel-Perfect Font Scaling
  const getOffscreenCanvasCtx = useCallback((): CanvasRenderingContext2D | null => {
    if (typeof window === "undefined") return null;
    if (!(window as any).__smartAuditOffscreenCtx) {
      const c = document.createElement("canvas");
      (window as any).__smartAuditOffscreenCtx = c.getContext("2d");
    }
    return (window as any).__smartAuditOffscreenCtx;
  }, []);

  const computeCanvasTextFit = useCallback((
    text: string,
    boxWidthPx: number,
    boxHeightPx: number,
    baseFontSizePt: number,
    fontFamily: string = "Arial, sans-serif"
  ): { fontScale: number; lineCount: number; isOverflowing: boolean } => {
    if (!text || boxWidthPx <= 0 || boxHeightPx <= 0) return { fontScale: 1.0, lineCount: 1, isOverflowing: false };

    // 1. High-speed LRU memory lookup
    const cacheKey = `${text}::${Math.round(boxWidthPx)}::${Math.round(boxHeightPx)}::${baseFontSizePt}::${fontFamily}`;
    const cached = textFitCache.get(cacheKey);
    if (cached) return cached;

    const ctx = getOffscreenCanvasCtx();
    if (!ctx) return { fontScale: 1.0, lineCount: 1, isOverflowing: false };

    const basePx = (baseFontSizePt * 96) / 72;
    ctx.font = `${basePx}px ${fontFamily}`;
    const textWidth = ctx.measureText(text).width;

    let result: { fontScale: number; lineCount: number; isOverflowing: boolean };

    if (textWidth <= boxWidthPx) {
      result = { fontScale: 1.0, lineCount: 1, isOverflowing: false };
    } else {
      const estLines = Math.max(1, Math.ceil(textWidth / boxWidthPx));
      const totalRequiredH = estLines * basePx * 1.25;
      const isOverflowing = totalRequiredH > boxHeightPx;
      if (isOverflowing) {
        const scale = Math.max(0.70, Math.min(1.0, Math.sqrt((boxWidthPx * boxHeightPx) / (textWidth * basePx * 1.25))));
        result = { fontScale: Number(scale.toFixed(2)), lineCount: estLines, isOverflowing: true };
      } else {
        result = { fontScale: 1.0, lineCount: estLines, isOverflowing: false };
      }
    }

    // 2. Cache result with LRU hygiene
    if (textFitCache.size >= MAX_TEXT_FIT_CACHE_SIZE) {
      const iter = textFitCache.keys();
      for (let i = 0; i < 500; i++) {
        const k = iter.next().value;
        if (!k) break;
        textFitCache.delete(k);
      }
    }
    textFitCache.set(cacheKey, result);

    return result;
  }, [getOffscreenCanvasCtx]);

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
    // Scale font size proportionally so text never overlaps rows across different view widths
    const fontRatio = Math.max(0.55, Math.min(1.2, sheetWidth / 1200));

    const isPresentationMode = slideViewMode === "presentation";

    return (
      <div
        data-document-content="true"
        className="relative rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 select-none bg-white shrink-0"
        onMouseDown={(e) => {
          if (e.button === 2 || (isAreaSelectMode && e.button === 0)) {
            handleStartAreaSelection(e);
          }
        }}
        style={{
          width: `${sheetWidth}px`,
          minHeight: `${sheetHeight}px`,
          height: "auto",
          backgroundColor: layout?.backgroundColor || "#FFFFFF",
          cursor: isAreaSelectMode ? "crosshair" : undefined,
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

        {/* Canva-style Smart Alignment Guide Lines */}
        {activeGuides.vertical.map((gx, idx) => (
          <div
            key={`vg_${idx}`}
            className="absolute top-0 bottom-0 pointer-events-none z-50 flex flex-col justify-between py-0.5"
            style={{
              left: `${gx}%`,
              width: "1.5px",
              backgroundColor: "#ec4899",
              boxShadow: "0 0 6px rgba(236, 72, 153, 0.9), 0 0 1px #ffffff",
            }}
          >
            <div className="w-2 h-2 -ml-[3.25px] rounded-full bg-pink-500 ring-2 ring-white shadow-sm" />
            <div className="w-2 h-2 -ml-[3.25px] rounded-full bg-pink-500 ring-2 ring-white shadow-sm" />
          </div>
        ))}

        {activeGuides.horizontal.map((gy, idx) => (
          <div
            key={`hg_${idx}`}
            className="absolute left-0 right-0 pointer-events-none z-50 flex justify-between px-0.5"
            style={{
              top: `${gy}%`,
              height: "1.5px",
              backgroundColor: "#ec4899",
              boxShadow: "0 0 6px rgba(236, 72, 153, 0.9), 0 0 1px #ffffff",
            }}
          >
            <div className="w-2 h-2 -mt-[3.25px] rounded-full bg-pink-500 ring-2 ring-white shadow-sm" />
            <div className="w-2 h-2 -mt-[3.25px] rounded-full bg-pink-500 ring-2 ring-white shadow-sm" />
          </div>
        ))}

        {/* Feature 3: Magnetic Snap Feedback Floating Badge */}
        {isMagneticSnapEnabled && snapFeedback && (
          <div
            className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-full bg-pink-600 text-white text-[10px] font-semibold tracking-wide shadow-lg flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: `${snapFeedback.x !== undefined ? Math.max(5, Math.min(95, snapFeedback.x)) : 50}%`,
              top: `${snapFeedback.y !== undefined ? Math.max(2, snapFeedback.y - 1.2) : 6}%`,
            }}
          >
            <Magnet className="w-3 h-3 text-pink-200" />
            <span>{snapFeedback.label}</span>
          </div>
        )}

        {/* Spatial Elements & Native PPTX Table Rendering */}
        {(() => {
          const baseElements = layout?.elements || [];
          const activeBase = baseElements.filter((el) => !canvasState.deletedElementIds.includes(el.id));
          const slideAdded = canvasState.addedElements.filter(
            (el) => (el as any).slideIndex === slideNum || !(el as any).slideIndex
          );
          const allEffective = [...activeBase, ...slideAdded];

          // Reusable Text Body Renderer for both table cells and standalone shapes
          const renderElementTextBody = (
            el: SlideVisualElement,
            elementUnits: ScannedTextUnit[],
            isChecked: boolean,
            isBold: boolean,
            effectiveFontSizePt?: number,
            displayFontSizePt?: number,
            isUltraCompact?: boolean,
            pos?: { left: number; top: number },
            size?: { width: number; height: number }
          ) => {
            if (elementUnits.length > 0) {
              const renderUnitEditor = (u: ScannedTextUnit, uIdx: number) => {
                const isUnitSelected = selectedUnitIds.has(u.id);
                const isRightAnchored = pos ? pos.left > 55 : false;

                return (
                  <div
                    key={u.id}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      minWidth: "290px",
                      maxWidth: "400px",
                      [isRightAnchored ? "right" : "left"]: 0,
                    }}
                    className="absolute top-0 z-[70] bg-white dark:bg-slate-900 p-2 rounded-xl border-2 border-sky-500 text-slate-900 dark:text-white shadow-2xl text-left animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between text-[10px] text-sky-600 dark:text-sky-400 font-semibold mb-1 select-none gap-2">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold whitespace-nowrap">Sửa dòng {uIdx + 1}/{elementUnits.length}</span>
                        {elementUnits.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              if (e.altKey) selectOnlyThisUnit(u, elementUnits, e);
                              else toggleUnitSelection(u.id, e);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors flex items-center gap-0.5 cursor-pointer select-none whitespace-nowrap shrink-0 ${
                              isUnitSelected
                                ? "bg-amber-500 text-white border-amber-600 shadow-2xs"
                                : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/60"
                            }`}
                            title={`Chọn/bỏ chọn dòng D${uIdx + 1} để dịch AI`}
                          >
                            <Sparkles className="w-2.5 h-2.5 shrink-0" />
                            <span>{isUnitSelected ? `✓ Dịch D${uIdx + 1}` : `+ Chọn dịch D${uIdx + 1}`}</span>
                          </button>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono whitespace-nowrap shrink-0">Enter: Lưu • Esc: Hủy</span>
                    </div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(u.id, e as any);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit(e as any);
                        }
                      }}
                      rows={Math.max(2, Math.min(6, editText.split("\n").length))}
                      style={{
                        fontSize: effectiveFontSizePt ? `${Math.min(14, Math.max(10, effectiveFontSizePt))}pt` : undefined,
                      }}
                      className="w-full p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-400 font-sans shadow-inner resize-y"
                      autoFocus
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-1 mt-0.5">
                      <div className="flex items-center gap-1 shrink-0">
                        {elementUnits.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              if (e.altKey) selectOnlyThisUnit(u, elementUnits, e);
                              else toggleUnitSelection(u.id, e);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer shadow-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                              isUnitSelected
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-amber-500 hover:bg-amber-600 text-white"
                            }`}
                            title={`Bấm để chọn/bỏ chọn dòng D${uIdx + 1}`}
                          >
                            <Sparkles className="w-2.5 h-2.5 shrink-0" />
                            <span>{isUnitSelected ? `✓ D${uIdx + 1}` : `+ D${uIdx + 1}`}</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                        >
                          Hủy (Esc)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => saveEdit(u.id, e)}
                          className="px-2 py-0.5 rounded text-[10px] bg-sky-600 text-white font-semibold hover:bg-sky-500 cursor-pointer shadow-xs whitespace-nowrap shrink-0 transition-colors"
                          title="Lưu sửa đổi tạm thời"
                        >
                          Lưu (Enter)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => applyEditDirectly(u.id, e)}
                          className="px-2.5 py-0.5 rounded text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-xs flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                          title="Thêm trực tiếp vào bản dịch ngay, hoàn tất dòng này"
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Thêm vào luôn</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              };

              // Mode Bilingual + Multi-line: Block Bilingual (1.EN 2.EN 3.EN ... 1.VI 2.VI 3.VI ...)
              if (activeViewMode === "bilingual" && elementUnits.length > 1) {
                const isViUnit = (u: ScannedTextUnit) => {
                  const text = u.sourceText.trim();
                  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
                };
                const viCount = elementUnits.filter(isViUnit).length;
                const enCount = elementUnits.length - viCount;
                const hasExistingBilingualMix = viCount > 0 && enCount > 0;

                const enDisplayUnits = hasExistingBilingualMix
                  ? elementUnits.filter((u) => !isViUnit(u))
                  : elementUnits;
                const viDisplayUnits = hasExistingBilingualMix
                  ? elementUnits.filter(isViUnit)
                  : elementUnits;

                return (
                  <div className="w-full space-y-1">
                    {/* EN Block: 1.EN, 2.EN, 3.EN... */}
                    <div className="space-y-0.5">
                      {enDisplayUnits.map((u, uIdx) => {
                        if (editingUnitId === u.id) return renderUnitEditor(u, uIdx);
                        const transText = getTranslationText(u);
                        const isHeading = u.sourceText.startsWith("*") || u.location.isTitle || el.isTitle || isBold;
                        return (
                          <div
                            key={`en_${u.id}`}
                            onMouseDown={(e) => handleLineMiddleClick(e, u, elementUnits)}
                            onAuxClick={(e) => handleLineMiddleClick(e, u, elementUnits)}
                            onDoubleClick={(e) => { e.stopPropagation(); startEdit(u, e); }}
                            onContextMenu={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              if (justFinishedRightDraggingRef.current) return;
                              const sel = window.getSelection()?.toString().trim();
                              const x = Math.min(e.clientX, window.innerWidth - 350);
                              const y = Math.min(e.clientY, window.innerHeight - 440);
                              setSelectedElementId(el.id);
                              setContextMenu({
                                x: Math.max(10, x), y: Math.max(10, y),
                                element: { ...el, box: { ...el.box, left: pos?.left ?? el.box.left, top: pos?.top ?? el.box.top, width: size?.width ?? el.box.width, height: size?.height ?? el.box.height } },
                                unit: u,
                                unitIndex: uIdx,
                                elementUnits: enDisplayUnits,
                                selectedPhrase: sel && sel.length > 0 ? sel : undefined,
                              });
                            }}
                            style={{ fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined }}
                            className={`group/line relative rounded px-1 -mx-1 py-0.5 transition-colors cursor-text hover:bg-sky-500/10 dark:hover:bg-sky-400/10 ${
                              isHeading ? "font-bold" : "font-normal"
                            } break-words`}
                            title={`Dòng ${uIdx + 1} (EN) • Nhấp đúp để sửa`}
                          >
                            {uIdx === 0 && isChecked && (
                              <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-sky-600 text-white text-[8px] font-bold mr-1 shrink-0 align-middle shadow-2xs pointer-events-none">
                                ✓
                              </span>
                            )}
                            {selectedUnitIds.has(u.id) && !isChecked && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-amber-500/25 text-amber-800 dark:text-amber-200 border border-amber-500/40 mr-1.5 align-middle shadow-2xs shrink-0 select-none"
                                title={`Đã chọn dịch dòng D${uIdx + 1}`}
                              >
                                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                                <span>Dịch D{uIdx + 1}</span>
                              </span>
                            )}
                            <span className="font-semibold text-slate-900 dark:text-white break-words">
                              {renderHighlightedSopText(transText || u.sourceText, true)}
                            </span>
                            <div className="opacity-0 group-hover/line:opacity-100 transition-opacity ml-1.5 inline-flex items-center gap-1 align-middle select-none">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startEdit(u, e); }}
                                className="px-1 py-0.2 rounded text-[9px] font-medium bg-sky-500/20 hover:bg-sky-500 text-sky-700 hover:text-white dark:text-sky-300 dark:hover:text-white inline-flex items-center gap-0.5 shadow-2xs cursor-pointer"
                                title={`Sửa riêng dòng ${uIdx + 1}`}
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span className="text-[8px] font-bold">Sửa D{uIdx + 1}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (e.altKey) selectOnlyThisUnit(u, elementUnits, e);
                                  else toggleUnitSelection(u.id, e);
                                }}
                                className={`px-1 py-0.2 rounded text-[8.5px] font-bold border inline-flex items-center gap-0.5 shadow-2xs cursor-pointer transition-colors ${
                                  selectedUnitIds.has(u.id)
                                    ? "bg-amber-500 text-white border-amber-600 shadow-2xs"
                                    : "bg-amber-500/20 hover:bg-amber-500 text-amber-700 hover:text-white dark:text-amber-300 dark:hover:text-white border-amber-500/40"
                                }`}
                                title={`Bấm để chọn/bỏ chọn dòng D${uIdx + 1}`}
                              >
                                <Sparkles className="w-2 h-2 text-amber-500 group-hover/line:text-white" />
                                <span>{selectedUnitIds.has(u.id) ? `✓ D${uIdx + 1}` : `D${uIdx + 1}`}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Subtle separator between EN block and VI block */}
                    <div className="border-t border-dashed border-sky-400/30 dark:border-sky-500/30 my-0.5" />

                    {/* VI Block: 1.VI, 2.VI, 3.VI... */}
                    <div className="space-y-0.5 opacity-75">
                      {viDisplayUnits.map((u, uIdx) => {
                        const isHeading = u.sourceText.startsWith("*") || u.location.isTitle || el.isTitle || isBold;
                        return (
                          <div
                            key={`vi_${u.id}`}
                            onMouseDown={(e) => handleLineMiddleClick(e, u, elementUnits)}
                            onAuxClick={(e) => handleLineMiddleClick(e, u, elementUnits)}
                            onDoubleClick={(e) => { e.stopPropagation(); startEdit(u, e); }}
                            style={{ fontSize: displayFontSizePt ? `${Math.max(7.5, displayFontSizePt * 0.92)}pt` : undefined }}
                            className={`group/line-vi relative rounded px-1 -mx-1 py-0.5 transition-colors cursor-text hover:bg-slate-500/10 ${
                              isHeading ? "font-semibold" : "font-normal"
                            } break-words text-slate-600 dark:text-slate-300`}
                            title={`Dòng ${uIdx + 1} (VI gốc) • Nhấp đúp để sửa`}
                          >
                            <span className="break-words">{u.sourceText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return elementUnits.map((u, uIdx) => {
                if (editingUnitId === u.id) return renderUnitEditor(u, uIdx);
                const transText = getTranslationText(u);
                const isHeading =
                  u.sourceText.startsWith("*") ||
                  u.location.isTitle ||
                  el.isTitle ||
                  isBold;

                const displayedContent =
                  activeViewMode === "target"
                    ? transText || u.sourceText
                    : activeViewMode === "source"
                    ? u.sourceText
                    : null;

                return (
                  <div
                    key={u.id}
                    onMouseDown={(e) => handleLineMiddleClick(e, u, elementUnits)}
                    onAuxClick={(e) => handleLineMiddleClick(e, u, elementUnits)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEdit(u, e);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (justFinishedRightDraggingRef.current) return;
                      const sel = window.getSelection()?.toString().trim();
                      const x = Math.min(e.clientX, window.innerWidth - 350);
                      const y = Math.min(e.clientY, window.innerHeight - 440);
                      setSelectedElementId(el.id);
                      setContextMenu({
                        x: Math.max(10, x),
                        y: Math.max(10, y),
                        element: { ...el, box: { ...el.box, left: pos?.left ?? el.box.left, top: pos?.top ?? el.box.top, width: size?.width ?? el.box.width, height: size?.height ?? el.box.height } },
                        unit: u,
                        unitIndex: uIdx,
                        elementUnits: elementUnits,
                        selectedPhrase: sel && sel.length > 0 ? sel : undefined,
                      });
                    }}
                    style={{
                      fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined,
                    }}
                    className={`group/line relative rounded px-1 -mx-1 ${
                      elementUnits.length > 2 ? "py-0 leading-snug" : "py-0.5"
                    } transition-colors cursor-text hover:bg-sky-500/10 dark:hover:bg-sky-400/10 ${
                      isHeading ? "font-bold" : "font-normal"
                    } ${uIdx > 0 ? (elementUnits.length > 2 ? "mt-0" : "mt-0.5") : ""} break-words`}
                    title={`Dòng ${uIdx + 1} • Nhấp đúp để sửa dòng này`}
                  >
                    {uIdx === 0 && isChecked && (
                      <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-sky-600 text-white text-[8px] font-bold mr-1 shrink-0 align-middle shadow-2xs pointer-events-none">
                        ✓
                      </span>
                    )}

                    {/* Prominent Badge for Multi-Line Translation Selection */}
                    {elementUnits.length > 1 && selectedUnitIds.has(u.id) && !isChecked && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-amber-500/25 text-amber-800 dark:text-amber-200 border border-amber-500/40 mr-1.5 align-middle shadow-2xs shrink-0 select-none"
                        title={`Đã chọn dịch dòng D${uIdx + 1}`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                        <span>Dịch D{uIdx + 1}</span>
                      </span>
                    )}

                    {displayedContent !== null ? (
                      <span className="break-words">
                        {renderHighlightedSopText(displayedContent, activeViewMode === "target")}
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white leading-tight break-words">
                          {renderHighlightedSopText(transText || u.sourceText, true)}
                        </div>
                        <div className="opacity-70 text-[0.88em] leading-tight break-words text-slate-600 dark:text-slate-400">
                          {u.sourceText}
                        </div>
                      </div>
                    )}

                    {/* Hover Quick Edit & Quick Multi-Select Line Icons */}
                    {elementUnits.length > 1 && (
                      <div className="opacity-0 group-hover/line:opacity-100 transition-opacity ml-1.5 inline-flex items-center gap-1 align-middle select-none">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(u, e);
                          }}
                          className="px-1 py-0.2 rounded text-[9px] font-medium bg-sky-500/20 hover:bg-sky-500 text-sky-700 hover:text-white dark:text-sky-300 dark:hover:text-white inline-flex items-center gap-0.5 shadow-2xs cursor-pointer"
                          title={`Sửa riêng dòng ${uIdx + 1}`}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span className="text-[8px] font-bold">Sửa D{uIdx + 1}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.altKey) selectOnlyThisUnit(u, elementUnits, e);
                            else toggleUnitSelection(u.id, e);
                          }}
                          className={`px-1 py-0.2 rounded text-[8.5px] font-bold border inline-flex items-center gap-0.5 shadow-2xs cursor-pointer transition-colors ${
                            selectedUnitIds.has(u.id)
                              ? "bg-amber-500 text-white border-amber-600 shadow-2xs"
                              : "bg-amber-500/20 hover:bg-amber-500 text-amber-700 hover:text-white dark:text-amber-300 dark:hover:text-white border-amber-500/40"
                          }`}
                          title={`Bấm để chọn/bỏ chọn dòng D${uIdx + 1} (Giữ Alt để chỉ chọn riêng dòng này)`}
                        >
                          <Sparkles className="w-2 h-2 text-amber-500 group-hover/line:text-white" />
                          <span>{selectedUnitIds.has(u.id) ? `✓ D${uIdx + 1}` : `D${uIdx + 1}`}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              });
            }

            if (el.text) {
              return (
                <div
                  style={{
                    fontSize: effectiveFontSizePt ? `${effectiveFontSizePt}pt` : undefined,
                  }}
                  className={`${isBold ? "font-bold" : "font-normal"} break-words`}
                >
                  {isChecked && (
                    <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-sky-600 text-white text-[8px] font-bold mr-1 shrink-0 align-middle shadow-2xs pointer-events-none">
                      ✓
                    </span>
                  )}
                  {renderHighlightedSopText(el.text, activeViewMode === "target")}
                </div>
              );
            }

            return null;
          };

          // Group table cells by tableId to render as true HTML <table> with dynamic row heights and zero cut-off
          const tableGroups = new Map<
            string,
            {
              tableBox: { left: number; top: number; width: number; height: number };
              tableCols?: number[];
              rows: Map<number, SlideVisualElement[]>;
            }
          >();
          const standaloneElements: SlideVisualElement[] = [];

          // Universal Cell Classification & Fallback Synthesizer:
          // Ensure EVERY cell across all slides (even if scanned before tableId/tableBox was added)
          // is grouped into a native HTML table instead of falling back to clipped absolute boxes.
          const rawCells = allEffective.filter((el) => el.type === "cell");
          const nonCells = allEffective.filter((el) => el.type !== "cell");
          standaloneElements.push(...nonCells);

          // If cells exist without tableId, synthesize tableId and bounding box
          for (const cell of rawCells) {
            const effectiveTableId = cell.tableId || `tbl_auto_s${slideNum}`;
            if (!tableGroups.has(effectiveTableId)) {
              tableGroups.set(effectiveTableId, {
                tableBox: cell.tableBox || { left: 0, top: 0, width: 100, height: 100 },
                tableCols: cell.tableCols,
                rows: new Map(),
              });
            }
            const tg = tableGroups.get(effectiveTableId)!;
            const r = cell.tableRow ?? 0;
            if (!tg.rows.has(r)) tg.rows.set(r, []);
            tg.rows.get(r)!.push(cell);
          }

          // Calculate bounding box and column percentages if synthesized or missing
          for (const [tid, tg] of tableGroups.entries()) {
            const allCells = Array.from(tg.rows.values()).flat();
            if (allCells.length > 0) {
              const needsBox = !tg.tableBox || (tg.tableBox.left === 0 && tg.tableBox.top === 0 && tg.tableBox.width === 100 && tg.tableBox.height === 100);
              if (needsBox) {
                const minLeft = Math.min(...allCells.map((c) => c.box.left));
                const minTop = Math.min(...allCells.map((c) => c.box.top));
                const maxRight = Math.max(...allCells.map((c) => c.box.left + c.box.width));
                const maxBottom = Math.max(...allCells.map((c) => c.box.top + c.box.height));
                tg.tableBox = {
                  left: Number(minLeft.toFixed(1)),
                  top: Number(minTop.toFixed(1)),
                  width: Number(Math.max(10, maxRight - minLeft).toFixed(1)),
                  height: Number(Math.max(10, maxBottom - minTop).toFixed(1)),
                };
              }
              // If tableCols is missing, derive from unique column X offsets
              if (!tg.tableCols || tg.tableCols.length === 0) {
                const colMap = new Map<number, number>();
                for (const c of allCells) {
                  const colIdx = c.tableCol ?? 0;
                  if (!colMap.has(colIdx) || (c.colSpan === 1 && c.box.width > (colMap.get(colIdx) || 0))) {
                    if (!c.colSpan || c.colSpan === 1) colMap.set(colIdx, c.box.width);
                  }
                }
                const sortedColKeys = Array.from(colMap.keys()).sort((a, b) => a - b);
                const totalColW = sortedColKeys.reduce((sum, k) => sum + (colMap.get(k) || 1), 0);
                if (totalColW > 0) {
                  tg.tableCols = sortedColKeys.map((k) => Number((((colMap.get(k) || 1) / totalColW) * 100).toFixed(2)));
                }
              }
            }
          }

          return (
            <>
              {/* 1. PPTX TABLES (Rendered as native HTML <table> with in-flow natural expansion, zero cut-off) */}
              {(() => {
                const tablesList = Array.from(tableGroups.entries());
                if (tablesList.length === 0) return null;

                const renderSingleTable = (tableId: string, tg: typeof tablesList[0][1]) => {
                  const sortedRowKeys = Array.from(tg.rows.keys()).sort((a, b) => a - b);

                  return (
                    <table
                      className="border-collapse table-fixed w-full select-none shadow-xs"
                      style={{
                        backgroundColor: "#FFFFFF",
                        borderSpacing: 0,
                      }}
                    >
                      {tg.tableCols && tg.tableCols.length > 0 && (
                        <colgroup>
                          {tg.tableCols.map((colW, idx) => (
                            <col key={`col_${idx}`} style={{ width: `${colW}%` }} />
                          ))}
                        </colgroup>
                      )}
                      <tbody>
                        {sortedRowKeys.map((rIdx) => {
                          const rowCells = tg.rows.get(rIdx) || [];
                          rowCells.sort((a, b) => (a.tableCol ?? 0) - (b.tableCol ?? 0));

                          // Exclude multi-row spanned cells (rowSpan > 1, such as [OQC]) from inflating the height of a single row
                          const singleRowCells = rowCells.filter((c) => !c.rowSpan || c.rowSpan === 1);
                          const heightSourceCells = singleRowCells.length > 0 ? singleRowCells : rowCells;
                          const rowHeights = heightSourceCells
                            .map((c) => (c.rowSpan && c.rowSpan > 1 ? (c.box.height || 0) / c.rowSpan : (c.box.height || 0)))
                            .filter((h) => h > 0);
                          const maxRowHeightPct = rowHeights.length > 0 ? Math.max(...rowHeights) : 0;
                          const nominalRowHeightPx = maxRowHeightPct > 0 ? Math.round((maxRowHeightPct / 100) * sheetHeight) : undefined;
                          const effectiveRowHeightPx = nominalRowHeightPx;

                          return (
                            <tr
                              key={`tr_${tableId}_${rIdx}`}
                              style={{
                                height: effectiveRowHeightPx ? `${effectiveRowHeightPx}px` : undefined,
                              }}
                            >
                              {rowCells.map((el) => {
                                const isSelected = selectedElementId === el.id || multiSelectedElementIds.has(el.id);
                                const isMultiSelected = multiSelectedElementIds.has(el.id);
                                const style = canvasState.styles[el.id] || {};
                                const elementUnits = (el.unitIds && el.unitIds.length > 0)
                                  ? el.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
                                  : el.unitId && unitById.get(el.unitId)
                                  ? [unitById.get(el.unitId)!]
                                  : [];
                                const primaryUnit = elementUnits[0];
                                const isChecked = elementUnits.length > 0 && elementUnits.every((u) => selectedUnitIds.has(u.id));
                                const isPartiallyChecked = !isChecked && elementUnits.some((u) => selectedUnitIds.has(u.id));

                                const bgColor =
                                  style.fill || el.fill || (el.tableRow === 0 ? "#FFFFFF" : "#FFFFFF");
                                const textColor = style.textColor || getElementTextColor(bgColor, el.textColor);
                                const isBold = style.isBold !== undefined ? style.isBold : Boolean(el.isBold);
                                const align = style.align || (el.tableRow === 0 || el.align === "center" || el.isTitle ? "center" : "left");
                                const effectiveFontSizePt = style.fontSizePt ?? el.fontSizePt;

                                // 1. OpenXML normAutofit fontScale (e.g. 0.85 = 85%)
                                const openXmlFontScale = el.fontScale;

                                // 2. Canvas Text Metrics Measurement for multi-line or overflowing text
                                const cellTextContent = elementUnits.map((u) => getTranslationText(u) || u.sourceText).join(" ");
                                const cellColW = ((el.box.width || 10) / 100) * sheetWidth - 8;
                                const cellNominalH = Math.max(20, ((el.box.height || 10) / 100) * sheetHeight - 6);
                                const canvasFit = computeCanvasTextFit(
                                  cellTextContent,
                                  cellColW,
                                  cellNominalH,
                                  effectiveFontSizePt || 10
                                );

                                // 3. Density-based scaling
                                const cellUnitCount = elementUnits.length;
                                const isDenseTableCell = cellUnitCount > 3 || (openXmlFontScale !== undefined && openXmlFontScale < 1.0);
                                const densityScale = isDenseTableCell
                                  ? Math.max(0.72, Math.min(1.0, (el.box.height || 12) / (cellUnitCount * 2.8)))
                                  : 1.0;

                                const isManuallyStyled = style.fontSizePt !== undefined;
                                const baseAutoFit = isManuallyStyled
                                  ? 1.0
                                  : (openXmlFontScale !== undefined
                                      ? openXmlFontScale
                                      : Math.min(densityScale, canvasFit.fontScale));

                                const finalAutoFitScale = Number(baseAutoFit.toFixed(2));
                                const displayFontSizePt = effectiveFontSizePt
                                  ? Number((effectiveFontSizePt * fontRatio * finalAutoFitScale).toFixed(1))
                                  : undefined;

                                const borderStyle = el.border || "1px solid #cbd5e1";
                                const paddingStyle = el.tableRow === 0 ? "3px 6px" : "2px 5px";

                                const isPending =
                                  primaryUnit &&
                                  (primaryUnit.status === "NEEDS_TRANSLATION" ||
                                    primaryUnit.status === "MIXED_LANGUAGE" ||
                                    primaryUnit.status === "REVIEW_REQUIRED");
                                const isDimmed = focusPendingOnly && !isPending && !isSelected && !isChecked;

                                const isMultiRowSpan = Boolean(el.rowSpan && el.rowSpan > 1);
                                const cellHeightPx = !isMultiRowSpan && el.box.height && el.box.height > 0
                                  ? Math.round((el.box.height / 100) * sheetHeight)
                                  : undefined;

                                return (
                                  <td
                                    key={el.id}
                                    data-element-id={el.id}
                                    rowSpan={el.rowSpan && el.rowSpan > 1 ? el.rowSpan : undefined}
                                    colSpan={el.colSpan && el.colSpan > 1 ? el.colSpan : undefined}
                                    onMouseDown={(e) => {
                                      if (e.button === 1) {
                                        handleMiddleClickElement(e, elementUnits);
                                        return;
                                      }
                                      if (e.button === 2 || (isAreaSelectMode && e.button === 0)) {
                                        handleStartAreaSelection(e);
                                      }
                                    }}
                                    onAuxClick={(e) => {
                                      if (e.button === 1) {
                                        handleMiddleClickElement(e, elementUnits);
                                      }
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (justFinishedDraggingRef.current || isAreaSelectMode) return;
                                      if (isFormatPainterActive) {
                                        handlePasteStyle(el.id);
                                        return;
                                      }
                                      if (e.shiftKey) {
                                        setMultiSelectedElementIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(el.id)) next.delete(el.id);
                                          else next.add(el.id);
                                          return next;
                                        });
                                      } else {
                                        // Bấm chuột trái đơn lẻ: xóa multiSelected để KHÔNG bị đè lớp tím
                                        setMultiSelectedElementIds(new Set());
                                      }
                                      setSelectedElementId(el.id);
                                      setLastActiveElementId(el.id);
                                      if (elementUnits.length > 0) {
                                        const shouldSelect = !elementUnits.every((u) => selectedUnitIds.has(u.id));
                                        for (const u of elementUnits) {
                                          if (shouldSelect) {
                                            if (!selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                                          } else {
                                            if (selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                                          }
                                        }
                                      }
                                    }}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      if (primaryUnit) startEdit(primaryUnit, e);
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (justFinishedRightDraggingRef.current) return;
                                      const sel = window.getSelection()?.toString().trim();
                                      const x = Math.min(e.clientX, window.innerWidth - 350);
                                      const y = Math.min(e.clientY, window.innerHeight - 440);
                                      setSelectedElementId(el.id);
                                      setContextMenu({
                                        x: Math.max(10, x),
                                        y: Math.max(10, y),
                                        element: el,
                                        unit: primaryUnit || null,
                                        unitIndex: 0,
                                        elementUnits: elementUnits,
                                        selectedPhrase: sel && sel.length > 0 ? sel : undefined,
                                      });
                                    }}
                                    style={{
                                      backgroundColor: isMultiSelected
                                        ? "#c7d2fe"
                                        : isChecked
                                        ? (bgColor && bgColor !== "transparent" && bgColor !== "#FFFFFF" ? bgColor : "#e0f2fe")
                                        : isPartiallyChecked
                                        ? (bgColor && bgColor !== "transparent" && bgColor !== "#FFFFFF" ? bgColor : "#f0f9ff")
                                        : bgColor,
                                      color: textColor,
                                      border: borderStyle,
                                      padding: paddingStyle,
                                      textAlign: align,
                                      verticalAlign: el.tableRow === 0 ? "middle" : "top",
                                      fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined,
                                      opacity: isDimmed ? 0.22 : 1.0,
                                      filter: isDimmed ? "grayscale(80%)" : "none",
                                      boxSizing: "border-box",
                                      minHeight: cellHeightPx ? `${cellHeightPx}px` : undefined,
                                    }}
                                    className={`group/cell transition-colors duration-150 ${isAreaSelectMode ? "cursor-crosshair" : "cursor-pointer"} select-none relative ${
                                      isMultiSelected
                                        ? "ring-[2.5px] ring-indigo-600 dark:ring-indigo-400 shadow-[0_0_0_1px_rgba(79,70,229,0.9),0_4px_16px_rgba(79,70,229,0.3)] z-20"
                                        : isChecked
                                        ? "ring-2 ring-sky-500 bg-sky-50 dark:bg-sky-950/60 shadow-xs"
                                        : isPartiallyChecked
                                        ? "ring-1 ring-sky-400/60 bg-sky-50/40"
                                        : isSelected
                                        ? "ring-2 ring-sky-500 shadow-sm"
                                        : isPending && focusPendingOnly
                                        ? "ring-2 ring-rose-500 shadow-xs animate-pulse"
                                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                    }`}
                                    title={`${el.shapeName || "Ô dữ liệu"}${
                                      isPartiallyChecked
                                        ? ` • Đang chọn dịch ${elementUnits.filter((u) => selectedUnitIds.has(u.id)).length}/${elementUnits.length} dòng`
                                        : ""
                                    } • Nhấp chuột trái để chọn • Chuột giữa để hủy ô dịch • Nhấp đúp để sửa`}
                                  >
                                    {/* Real-time Hover Font Size Badge via zero-lag GPU CSS group-hover */}
                                    <div className="hidden group-hover/cell:flex absolute top-0.5 right-0.5 pointer-events-none z-20 items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 text-white border border-sky-400/60 text-[9px] font-mono font-bold shadow-md">
                                      <span className="text-sky-300">{effectiveFontSizePt ?? 11}pt</span>
                                      <span className="text-[8px] text-slate-400 font-sans font-normal border-l border-slate-700 pl-1 hidden sm:inline">Alt+Cuộn</span>
                                    </div>
                                    {/* Warning Button Container (Only when overflowing) */}
                                    {canvasFit.isOverflowing && (() => {
                                      const isSmallCell = (el.box?.height && el.box.height <= 34) || (el.box?.width && el.box.width <= 95) || cellTextContent.trim().length <= 15;
                                      return (
                                        <div className="absolute top-0.5 right-0.5 z-20 flex items-center gap-1 pointer-events-auto">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleAutoFitText(el, cellTextContent);
                                            }}
                                            className={`group-hover/cell:hidden flex items-center gap-0.5 rounded bg-amber-500/95 hover:bg-amber-600 text-white text-[8px] font-bold shadow-md cursor-pointer transition-transform hover:scale-105 select-none shrink-0 ${
                                              isSmallCell ? "p-1" : "px-1.5 py-0.5"
                                            }`}
                                            title="Chữ có dấu hiệu tràn ô • Bấm để tự động co chữ (Auto-Fit)"
                                          >
                                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                            {!isSmallCell && <span>Tràn</span>}
                                          </button>
                                        </div>
                                      );
                                    })()}
                                    <div
                                      style={{
                                        fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined,
                                        lineHeight: displayFontSizePt
                                          ? `${Math.max(8.5, Math.round(displayFontSizePt * (isDenseTableCell || isPresentationMode ? 1.14 : 1.25)))}pt`
                                          : undefined,
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                      }}
                                      className={`w-full ${isDenseTableCell || isPresentationMode ? "space-y-0" : "space-y-0.5"}`}
                                    >
                                      {renderElementTextBody(
                                        el,
                                        elementUnits,
                                        isChecked,
                                        isBold,
                                        effectiveFontSizePt,
                                        displayFontSizePt,
                                        false,
                                        { left: el.box.left, top: el.box.top },
                                        { width: el.box.width, height: el.box.height }
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                };

                if (tablesList.length === 1) {
                  const [tableId, tg] = tablesList[0];
                  const tableCellZ = tg.rows ? Array.from(tg.rows.values()).flat().map((c) => canvasState.styles[c.id]?.zIndex).find((z) => z !== undefined) : undefined;
                  const effectiveTableZ = canvasState.styles[tableId]?.zIndex ?? tableCellZ ?? 5;
                  return (
                    <div
                      key={`table_wrapper_${tableId}`}
                      style={{
                        position: "relative",
                        marginLeft: `${tg.tableBox.left}%`,
                        marginTop: `${Math.round((tg.tableBox.top / 100) * sheetHeight)}px`,
                        width: `${tg.tableBox.width}%`,
                        zIndex: effectiveTableZ,
                        paddingBottom: "24px",
                      }}
                      className="select-none"
                    >
                      {renderSingleTable(tableId, tg)}
                    </div>
                  );
                }

                // Multiple tables: Check if side-by-side (like Slide 2)
                const sortedByLeft = [...tablesList].sort((a, b) => a[1].tableBox.left - b[1].tableBox.left);
                const isSideBySide = sortedByLeft[0][1].tableBox.left + sortedByLeft[0][1].tableBox.width <= sortedByLeft[1][1].tableBox.left + 5;
                const minTop = Math.min(...sortedByLeft.map(([, tg]) => tg.tableBox.top));

                if (isSideBySide) {
                  return (
                    <div
                      className="w-full flex items-start select-none"
                      style={{
                        position: "relative",
                        marginTop: `${Math.round((minTop / 100) * sheetHeight)}px`,
                        paddingBottom: "24px",
                        zIndex: 5,
                      }}
                    >
                      {sortedByLeft.map(([tableId, tg], idx) => {
                        const prevRight = idx === 0 ? 0 : (sortedByLeft[idx - 1][1].tableBox.left + sortedByLeft[idx - 1][1].tableBox.width);
                        const leftMarginPct = Math.max(0, tg.tableBox.left - prevRight);
                        const tableCellZ = tg.rows ? Array.from(tg.rows.values()).flat().map((c) => canvasState.styles[c.id]?.zIndex).find((z) => z !== undefined) : undefined;
                        const effectiveTableZ = canvasState.styles[tableId]?.zIndex ?? tableCellZ ?? 5;
                        return (
                          <div
                            key={`table_wrapper_${tableId}`}
                            style={{
                              width: `${tg.tableBox.width}%`,
                              marginLeft: `${leftMarginPct}%`,
                              zIndex: effectiveTableZ,
                            }}
                            className="select-none"
                          >
                            {renderSingleTable(tableId, tg)}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // Vertically stacked tables
                return (
                  <div
                    className="w-full flex flex-col select-none"
                    style={{
                      position: "relative",
                      marginTop: `${Math.round((minTop / 100) * sheetHeight)}px`,
                      paddingBottom: "24px",
                      zIndex: 5,
                    }}
                  >
                    {tablesList.map(([tableId, tg], idx) => {
                      const tableCellZ = tg.rows ? Array.from(tg.rows.values()).flat().map((c) => canvasState.styles[c.id]?.zIndex).find((z) => z !== undefined) : undefined;
                      const effectiveTableZ = canvasState.styles[tableId]?.zIndex ?? tableCellZ ?? 5;
                      return (
                        <div
                          key={`table_wrapper_${tableId}`}
                          style={{
                            width: `${tg.tableBox.width}%`,
                            marginLeft: `${tg.tableBox.left}%`,
                            marginTop: idx > 0 ? "16px" : undefined,
                            zIndex: effectiveTableZ,
                          }}
                          className="select-none"
                        >
                          {renderSingleTable(tableId, tg)}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 2. STANDALONE ELEMENTS (Pictures, Banners, Free-floating Shapes) */}
              {standaloneElements.map((el, elIdx) => {
                const isSelected = selectedElementId === el.id || multiSelectedElementIds.has(el.id);
                const isMultiSelected = multiSelectedElementIds.has(el.id);
                const pos = canvasState.positions[el.id] || { left: el.box.left, top: el.box.top };
                const size = canvasState.sizes[el.id] || { width: el.box.width, height: el.box.height };
                const style = canvasState.styles[el.id] || {};
                const isDragging = draggingElementId === el.id;
                const isResizing = resizingElementId === el.id;

                // Picture Shapes
                if (el.type === "image") {
                  if (imageVisibility === "hidden") return null;
                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => handleElementMouseDown(e, el, sheetWidth, sheetHeight)}
                      onClick={() => {
                        if (justFinishedDraggingRef.current) return;
                        setSelectedElementId(el.id);
                      }}
                      style={{
                        position: "absolute",
                        left: `${pos.left}%`,
                        top: `${Math.round((pos.top / 100) * sheetHeight)}px`,
                        width: `${size.width}%`,
                        height: `${Math.round((size.height / 100) * sheetHeight)}px`,
                        cursor: isDragging ? "grabbing" : "grab",
                        zIndex: isDragging ? 100 : (style.zIndex !== undefined ? style.zIndex : (10 + elIdx * 2)),
                      }}
                      className={`rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center p-1 overflow-hidden select-none ${
                        isDragging
                          ? "border-sky-500 bg-sky-950/60 ring-2 ring-sky-400 shadow-2xl scale-[1.01]"
                          : isSelected
                          ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-400"
                          : "border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/50 hover:border-sky-400 text-slate-500"
                      }`}
                      title={`${el.shapeName || "Khung ảnh"} • Giữ chuột trái để kéo di chuyển`}
                    >
                      {isDragging && (
                        <div className="absolute -top-6 left-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none z-50 flex items-center gap-1 border border-slate-700 whitespace-nowrap">
                          <Move className="w-2.5 h-2.5 text-sky-400" />
                          <span>X: {pos.left}% Y: {pos.top}%</span>
                        </div>
                      )}
                      {isSelected && !isDragging && (
                        <>
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "nw", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "ne", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "sw", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "se", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "n", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-2 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "s", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-2 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "w", el, sheetWidth, sheetHeight)} className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform" />
                          <div onMouseDown={(e) => handleResizeMouseDown(e, "e", el, sheetWidth, sheetHeight)} className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform" />
                        </>
                      )}
                      <Camera className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mb-0.5" />
                      <span className="text-[9px] font-semibold text-slate-600 dark:text-slate-400 text-center leading-tight line-clamp-1 px-1">
                        {el.shapeName || "Khung ảnh kỹ thuật"}
                      </span>
                    </div>
                  );
                }

                // Text Box or Free-floating Shape
                const elementUnits = (el.unitIds && el.unitIds.length > 0)
                  ? el.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
                  : el.unitId && unitById.get(el.unitId)
                  ? [unitById.get(el.unitId)!]
                  : [];

                const primaryUnit = elementUnits[0];
                const isChecked = elementUnits.length > 0 && elementUnits.every((u) => selectedUnitIds.has(u.id));
                const isPartiallyChecked = !isChecked && elementUnits.some((u) => selectedUnitIds.has(u.id));

                const isSmallMarker =
                  (size.width <= 5 && size.height <= 6) ||
                  (!primaryUnit && size.width <= 6 && size.height <= 6);
                const isOval =
                  el.shapeName?.toLowerCase().includes("oval") || el.shapeName?.toLowerCase().includes("circle");
                const isTopBanner =
                  el.fill === "#FF8810" || el.fill === "#ED7D31" || (pos.top < 3 && size.width >= 75);
                const isCyanHeader = el.fill === "#00B0F0";
                const isBadge = el.fill === "#92D050" || el.fill === "#FF0000" || el.fill === "#C00000";

                const bgColor =
                  style.fill || el.fill || (el.type === "cell" ? "#FFFFFF" : "transparent");
                const textColor = style.textColor || getElementTextColor(bgColor, el.textColor);

                const isBold = style.isBold !== undefined ? style.isBold : Boolean(el.isBold);
                const align = style.align || (isSmallMarker || isTopBanner || isCyanHeader || isBadge || el.align === "center" || el.isTitle ? "center" : "left");
                const effectiveFontSizePt = style.fontSizePt ?? el.fontSizePt;
                const baseDisplayFontSizePt = effectiveFontSizePt
                  ? Number((effectiveFontSizePt * fontRatio).toFixed(1))
                  : undefined;

                // 2.A PowerPoint AutoFit: shrink text proportionally when character/line count exceeds nominal box height
                const totalUnits = elementUnits.length;
                const openXmlShapeScale = el.fontScale;
                const shapeFullText = elementUnits.map((u) => getTranslationText(u) || u.sourceText).join(" ");
                const boxWpx = Math.max(40, ((size.width || 20) / 100) * sheetWidth);
                const boxHpx = Math.max(20, ((size.height || 10) / 100) * sheetHeight);

                // Canvas measurement for shapes
                const canvasFit = computeCanvasTextFit(
                  shapeFullText,
                  boxWpx,
                  boxHpx,
                  baseDisplayFontSizePt || 10
                );

                // Estimate wrapped line count per paragraph
                const charWidthPx = (baseDisplayFontSizePt || 10) * 0.58;
                const charsPerLine = Math.max(10, Math.floor(boxWpx / charWidthPx));
                const estimatedLines = elementUnits.reduce((acc, u) => {
                  const t = getTranslationText(u) || u.sourceText || "";
                  return acc + Math.max(1, Math.ceil(t.length / charsPerLine));
                }, 0);
                const singleLineHeightPx = (baseDisplayFontSizePt || 10) * 1.25 * 1.33;
                const totalRequiredHeightPx = estimatedLines * singleLineHeightPx;

                let estimatedScale = 1.0;
                if (totalRequiredHeightPx > boxHpx) {
                  // Co font tương ứng để vừa vặn hơn trong hộp
                  estimatedScale = Math.max(0.68, Math.min(1.0, (boxHpx / totalRequiredHeightPx) * 0.95));
                }

                const computedShapeScale = Math.min(canvasFit.fontScale, estimatedScale);
                const isDenseMultiLine = totalUnits > 2 || estimatedLines > 3 || computedShapeScale < 1.0;

                const isManuallyStyled = style.fontSizePt !== undefined;
                const autoFitScale = isManuallyStyled
                  ? 1.0
                  : (openXmlShapeScale !== undefined
                      ? Math.min(openXmlShapeScale, computedShapeScale)
                      : computedShapeScale < 1.0
                      ? computedShapeScale
                      : 1.0);

                const displayFontSizePt = baseDisplayFontSizePt
                  ? Number((baseDisplayFontSizePt * autoFitScale).toFixed(1))
                  : undefined;

                const isCentered = align === "center";

                // 1.A Title Width Expansion & Visibility:
                const isTransparentBox = !bgColor || bgColor === "transparent" || bgColor === "#FFFFFF";
                const isSingleLineHeader = (size.height <= 6.5 || el.isTitle) && elementUnits.length <= 1;

                const borderStyle = isSmallMarker
                  ? isOval
                    ? "1px solid rgba(0,0,0,0.15)"
                    : undefined
                  : el.border || (el.type === "cell" ? "1px solid #cbd5e1" : isSelected ? "2px solid #0284c7" : undefined);

                const isUltraCompact = size.height < 4.5;
                const isCompact = size.height < 7.0;

                const paddingStyle = isSmallMarker
                  ? "0"
                  : isTopBanner
                  ? "3px 8px"
                  : isCyanHeader
                  ? "3px 6px"
                  : el.type === "cell"
                  ? isUltraCompact
                    ? "1px 3px"
                    : isCompact
                    ? "2px 5px"
                    : "4px 8px"
                  : elementUnits.length > 3
                  ? "1px 3px"
                  : "2px 4px";

                const isPending =
                  primaryUnit &&
                  (primaryUnit.status === "NEEDS_TRANSLATION" ||
                    primaryUnit.status === "MIXED_LANGUAGE" ||
                    primaryUnit.status === "REVIEW_REQUIRED");
                const isDimmed = focusPendingOnly && !isPending && !isSelected && !isChecked;

                return (
                  <div
                    key={el.id}
                    data-element-id={el.id}
                    onMouseDown={(e) => handleElementMouseDown(e, el, sheetWidth, sheetHeight)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        handleMiddleClickElement(e, elementUnits);
                      }
                    }}
                    onClick={(e) => {
                      if (justFinishedDraggingRef.current || isAreaSelectMode) {
                        e.stopPropagation();
                        return;
                      }
                      e.stopPropagation();
                      if (isFormatPainterActive) {
                        handlePasteStyle(el.id);
                        return;
                      }
                      if (e.shiftKey) {
                        setMultiSelectedElementIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(el.id)) next.delete(el.id);
                          else next.add(el.id);
                          return next;
                        });
                      } else {
                        // Bấm chuột trái đơn lẻ: xóa multiSelected để KHÔNG bị đè lớp tím
                        setMultiSelectedElementIds(new Set());
                      }
                      setSelectedElementId(el.id);
                      setLastActiveElementId(el.id);
                      if (elementUnits.length > 0) {
                        const shouldSelect = !elementUnits.every((u) => selectedUnitIds.has(u.id));
                        for (const u of elementUnits) {
                          if (shouldSelect) {
                            if (!selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                          } else {
                            if (selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                          }
                        }
                      }
                    }}
                    onDoubleClick={(e) => {
                      if (justFinishedDraggingRef.current) return;
                      e.stopPropagation();
                      if (primaryUnit) startEdit(primaryUnit, e);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (justFinishedRightDraggingRef.current) return;
                      const sel = window.getSelection()?.toString().trim();
                      const x = Math.min(e.clientX, window.innerWidth - 350);
                      const y = Math.min(e.clientY, window.innerHeight - 440);
                      setSelectedElementId(el.id);
                      setContextMenu({
                        x: Math.max(10, x),
                        y: Math.max(10, y),
                        element: { ...el, box: { ...el.box, left: pos.left, top: pos.top, width: size.width, height: size.height } },
                        unit: primaryUnit || null,
                        unitIndex: 0,
                        elementUnits: elementUnits,
                        selectedPhrase: sel && sel.length > 0 ? sel : undefined,
                      });
                    }}
                    style={{
                      position: "absolute",
                      left: `${pos.left}%`,
                      top: `${Math.round((pos.top / 100) * sheetHeight)}px`,
                      width: isSingleLineHeader && isTransparentBox ? "auto" : `${size.width}%`,
                      minWidth: `${size.width}%`,
                      maxWidth: isSingleLineHeader && isTransparentBox ? `${Math.min(50, Math.max(size.width, 36))}%` : `${size.width}%`,
                      minHeight: `${Math.round((size.height / 100) * sheetHeight)}px`,
                      height: isResizing || isDragging ? `${Math.round((size.height / 100) * sheetHeight)}px` : undefined,
                      maxHeight: isResizing || isDragging ? `${Math.round((size.height / 100) * sheetHeight)}px` : undefined,
                      overflow: isResizing || isDragging ? "hidden" : "visible",
                      backgroundColor: isMultiSelected
                        ? "#c7d2fe"
                        : isChecked
                        ? (bgColor && bgColor !== "transparent" && bgColor !== "#FFFFFF" ? bgColor : "#e0f2fe")
                        : isPartiallyChecked
                        ? (bgColor && bgColor !== "transparent" && bgColor !== "#FFFFFF" ? bgColor : "#f0f9ff")
                        : bgColor,
                      color: textColor,
                      border: borderStyle,
                      padding: paddingStyle,
                      borderRadius: isOval ? "9999px" : isBadge ? "4px" : isTopBanner ? "0px" : undefined,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: isCentered ? "center" : "flex-start",
                      alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                      textAlign: align,
                      fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined,
                      opacity: isDimmed ? 0.22 : 1.0,
                      filter: isDimmed ? "grayscale(80%)" : "none",
                      transition: isDragging || isResizing
                        ? "none"
                        : "opacity 0.2s, filter 0.2s, border-color 0.15s, box-shadow 0.15s, background-color 0.15s",
                      boxSizing: "border-box",
                      cursor: isDragging ? "grabbing" : isResizing ? "default" : isAreaSelectMode ? "crosshair" : "grab",
                      zIndex: isDragging ? 100 : isResizing ? 90 : isSelected ? 80 : (style.zIndex !== undefined ? style.zIndex : isTopBanner ? 20 : (10 + elIdx * 2)),
                      userSelect: isDragging || isResizing ? "none" : undefined,
                    }}
                    className={`group select-none ${
                      isDragging
                        ? "ring-2 ring-indigo-500 shadow-2xl scale-[1.01]"
                        : isMultiSelected
                        ? "ring-[2.5px] ring-indigo-600 dark:ring-indigo-400 shadow-[0_0_0_1px_rgba(79,70,229,0.9),0_4px_16px_rgba(79,70,229,0.3)] z-20"
                        : isChecked
                        ? "ring-2 ring-sky-500 shadow-md"
                        : isPartiallyChecked
                        ? "ring-2 ring-sky-400/70 shadow-sm"
                        : isSelected
                        ? "ring-2 ring-sky-500 shadow-lg"
                        : isPending && focusPendingOnly
                        ? "ring-2 ring-rose-500 shadow-md animate-pulse"
                        : "hover:ring-1 hover:ring-sky-400/70"
                    }`}
                    title={`${el.shapeName || "Phần tử"}${
                      isPartiallyChecked
                        ? ` • Đang chọn dịch ${elementUnits.filter((u) => selectedUnitIds.has(u.id)).length}/${elementUnits.length} dòng`
                        : ""
                    } • Kéo để di chuyển • Chuột giữa để hủy ô dịch • 8 neo để co giãn • Nhấp đúp để sửa`}
                  >
                    {isDragging && (
                      <div className="absolute -top-6 left-0 bg-slate-900/95 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 flex items-center gap-1 border border-slate-700 whitespace-nowrap animate-in fade-in duration-100">
                        <Move className="w-2.5 h-2.5 text-sky-400" />
                        <span>X: {pos.left}% Y: {pos.top}%</span>
                      </div>
                    )}

                    {isSelected && !isDragging && (
                      <>
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "nw", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "ne", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "sw", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nesw-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "se", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-sky-500 rounded-2xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "n", el, sheetWidth, sheetHeight)} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-2 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "s", el, sheetWidth, sheetHeight)} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-2 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ns-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "w", el, sheetWidth, sheetHeight)} className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform" />
                        <div onMouseDown={(e) => handleResizeMouseDown(e, "e", el, sheetWidth, sheetHeight)} className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md cursor-ew-resize z-40 hover:scale-125 transition-transform" />
                      </>
                    )}

                    {resizeInfo && resizeInfo.elId === el.id && (
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 flex items-center gap-1 border border-slate-700 whitespace-nowrap animate-in fade-in duration-100">
                        <span>W: {resizeInfo.width}% • H: {resizeInfo.height}%</span>
                      </div>
                    )}

                    {/* Real-time Hover Font Size Badge via zero-lag GPU CSS group-hover */}
                    {!isDragging && (
                      <div className="hidden group-hover:flex absolute top-0.5 right-0.5 pointer-events-none z-20 items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 text-white border border-sky-400/60 text-[9px] font-mono font-bold shadow-md">
                        <span className="text-sky-300">{effectiveFontSizePt ?? 11}pt</span>
                        <span className="text-[8px] text-slate-400 font-sans font-normal border-l border-slate-700 pl-1 hidden sm:inline">Alt+Cuộn</span>
                      </div>
                    )}

                    {/* Warning Button Container (Only when overflowing) */}
                    {!isDragging && canvasFit.isOverflowing && (() => {
                      const isSmallShape = (el.box?.height && el.box.height <= 34) || (el.box?.width && el.box.width <= 95) || shapeFullText.trim().length <= 15;
                      return (
                        <div className="absolute top-0.5 right-0.5 z-20 flex items-center gap-1 pointer-events-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoFitText(el, shapeFullText);
                            }}
                            className={`group-hover:hidden flex items-center gap-0.5 rounded bg-amber-500/95 hover:bg-amber-600 text-white text-[8px] font-bold shadow-md cursor-pointer transition-transform hover:scale-105 select-none shrink-0 ${
                              isSmallShape ? "p-1" : "px-1.5 py-0.5"
                            }`}
                            title="Chữ có dấu hiệu tràn khung • Bấm để tự động co chữ (Auto-Fit)"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            {!isSmallShape && <span>Tràn</span>}
                          </button>
                        </div>
                      );
                    })()}

                    <div
                      style={{
                        fontSize: displayFontSizePt ? `${displayFontSizePt}pt` : undefined,
                        lineHeight: displayFontSizePt ? `${Math.max(8.5, Math.round(displayFontSizePt * (isDenseMultiLine ? 1.12 : 1.18)))}pt` : (isDenseMultiLine ? "1.12" : "1.2"),
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: isSingleLineHeader ? "normal" : undefined,
                      }}
                      className={`w-full ${
                        displayFontSizePt
                          ? (elementUnits.length > 2 ? "space-y-0" : "space-y-0.5")
                          : isTopBanner
                          ? "text-xs sm:text-sm font-bold tracking-wide"
                          : isCyanHeader
                          ? "text-[11px] sm:text-[12px] font-bold uppercase tracking-wider"
                          : isBadge
                          ? "text-[11px] sm:text-[12px] font-bold tracking-wider"
                          : isSmallMarker
                          ? "text-[9px] font-bold leading-none text-center"
                          : isUltraCompact
                          ? "text-[8.5px] sm:text-[9.5px] leading-tight"
                          : isCompact
                          ? "text-[9.5px] sm:text-[10.5px] leading-snug"
                          : "text-[10px] sm:text-[11px] lg:text-[12px] leading-snug space-y-0.5"
                      }`}
                    >
                      {renderElementTextBody(
                        el,
                        elementUnits,
                        isChecked,
                        isBold,
                        effectiveFontSizePt,
                        displayFontSizePt,
                        isUltraCompact,
                        pos,
                        size
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Floating Action Bar moved to Top Office 365 Ribbon Toolbar */}
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
      <div className="bg-slate-50 dark:bg-[#121622] px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Office 365 Ribbon Toolbar & Presentation Mode */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs transition-all overflow-x-auto no-scrollbar">
            {/* ISQ Dual View Mode Toggle (Shown only when partner slide exists) */}
            {partnerSlideNum && (
              <button
                type="button"
                onClick={() => setLayoutMode((m) => (m === "isq_dual" ? "pptx" : "isq_dual"))}
                className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  layoutMode === "isq_dual"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                title={`So sánh đối chiếu song song: Slide ${dualSlideInfo?.viNum} (VI) ⟷ Slide ${dualSlideInfo?.enNum} (EN)`}
              >
                <Columns className="w-3.5 h-3.5 text-sky-500" />
                <span className="text-[11px] font-bold hidden lg:inline">So sánh ISQ</span>
                <span className="text-[11px] font-bold lg:hidden">ISQ</span>
              </button>
            )}

            {/* Area Selection Mode Toggle Button (Quét chọn vùng) */}
            <button
              type="button"
              onClick={() => {
                onDeselectAllInSlide(currentSlide);
                setQuickActionNotice(`Đã bỏ dịch toàn bộ slide ${currentSlide}. Nội dung được giữ nguyên.`);
                if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 2200);
              }}
              className="px-2.5 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
              title="Bỏ dịch tất cả các ô trên slide đang xem, giữ nguyên các slide khác"
            >
              <Square className="w-3.5 h-3.5" /> Bỏ dịch slide này
            </button>
            <button
              type="button"
              onClick={() => setIsAreaSelectMode((prev) => !prev)}
              className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 select-none ${
                isAreaSelectMode
                  ? "bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
              title="Chế độ Quét chọn vùng (Bấm giữ chuột phải và kéo trên slide để quét chọn nhiều ô cùng lúc, hoặc bật nút này)"
            >
              <BoxSelect className={`w-3.5 h-3.5 ${isAreaSelectMode ? "text-white" : "text-indigo-500"}`} />
              <span className="text-[11px] font-bold hidden md:inline">
                {isAreaSelectMode ? "Đang Quét" : "Quét vùng"}
              </span>
            </button>

            {/* Microsoft Office 365 Formatting Ribbon - ALWAYS DISPLAYED */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 pl-1.5 border-l border-slate-200 dark:border-slate-800 transition-all">
              {/* UX Improvement 2: Multi-Select Batch Indicator */}
              {multiSelectedElementIds.size > 0 ? (
                <div className="flex items-center gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-150">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-2xs shrink-0 select-none flex items-center gap-1 border border-indigo-400/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{multiSelectedElementIds.size} ô</span>
                    <button
                      type="button"
                      onClick={() => setMultiSelectedElementIds(new Set())}
                      className="ml-0.5 text-white/80 hover:text-white cursor-pointer hover:bg-white/20 rounded-full w-3.5 h-3.5 flex items-center justify-center transition-colors"
                      title="Bỏ chọn hàng loạt (Esc)"
                    >
                      ✕
                    </button>
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleBatchTranslate}
                    className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold shadow-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                    title="Bấm để chọn dịch (hoặc bỏ chọn dịch) tất cả các dòng trong các ô đang quét chọn"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Dịch cả vùng</span>
                  </button>
                  <button type="button" onClick={handleSkipSelectedArea}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shrink-0 cursor-pointer"
                    title="Bỏ dịch tất cả các dòng trong vùng đã chọn; giữ nguyên nội dung">
                    <span>Bỏ dịch các ô này</span>
                  </button>
                </div>
              ) : activeFocusElement ? (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none hidden lg:inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-800"
                  title="Đã chọn ô này"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Đã chọn ô</span>
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none hidden lg:inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>Sẵn sàng</span>
                </span>
              )}

              {/* Typography: Font Size Group */}
              <div
                className={`flex items-center rounded-lg p-0.5 border shrink-0 transition-all ${
                  activeFocusElement
                    ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-2xs ring-1 ring-sky-400/30"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                }`}
              >
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleChangeFontSize(activeFocusElement.id, -1)}
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  title={activeFocusElement ? "Giảm cỡ chữ (Phím [ hoặc Alt + Cuộn chuột xuống)" : "Rê chuột vào ô văn bản để chỉnh cỡ chữ"}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span
                  className={`font-mono font-bold text-[11px] px-1 text-center min-w-[34px] select-none ${
                    activeFocusElement ? "text-sky-700 dark:text-sky-300 font-extrabold" : "text-slate-400"
                  }`}
                  title="Cỡ chữ hiện tại • Giữ Alt + Lăn chuột lên/xuống để chỉnh ngay lập tức"
                >
                  {activeFocusElement
                    ? `${canvasState.styles[activeFocusElement.id]?.fontSizePt ?? activeFocusElement.fontSizePt ?? 11}pt`
                    : "-- pt"}
                </span>
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleChangeFontSize(activeFocusElement.id, 1)}
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  title={activeFocusElement ? "Tăng cỡ chữ (Phím ] hoặc Alt + Cuộn chuột lên)" : "Rê chuột vào ô văn bản để chỉnh cỡ chữ"}
                >
                  <Plus className="w-3 h-3" />
                </button>
                {/* UX Improvement 3: Reset Font Size Button */}
                {activeFocusElement && canvasState.styles[activeFocusElement.id]?.fontSizePt !== undefined && (
                  <button
                    type="button"
                    onClick={() => handleResetFontSize(activeFocusElement.id)}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-amber-600 hover:text-amber-700 cursor-pointer transition-colors border-l border-slate-300 dark:border-slate-700 ml-0.5 pl-1"
                    title="Đặt lại cỡ chữ gốc ban đầu"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* Feature 1: Bộ Cỡ chữ Chuẩn SOP 1-Click (Typography Presets) */}
              <div className="flex items-center gap-0.5 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
                {SOP_TYPOGRAPHY_PRESETS.map((preset) => {
                  const currentSize = activeFocusElement
                    ? (canvasState.styles[activeFocusElement.id]?.fontSizePt ?? activeFocusElement.fontSizePt ?? 11)
                    : null;
                  const isPresetActive = currentSize === preset.fontSizePt;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={!activeFocusElement}
                      onClick={() => activeFocusElement && handleApplyTypographyPreset(activeFocusElement.id, preset)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 ${
                        isPresetActive
                          ? "bg-sky-600 text-white shadow-2xs font-bold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                      }`}
                      title={`${preset.label} (${preset.fontSizePt}pt) • ${preset.description}`}
                    >
                      <span className="hidden xl:inline">{preset.label}</span>
                      <span className="xl:hidden font-mono">{preset.fontSizePt}pt</span>
                      <span className="hidden xl:inline text-[8.5px] opacity-70 ml-0.5 font-mono">({preset.fontSizePt})</span>
                    </button>
                  );
                })}
              </div>

              {/* In đậm Bold */}
              <button
                type="button"
                disabled={!activeFocusElement}
                onClick={() => activeFocusElement && handleToggleBold(activeFocusElement)}
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                  !activeFocusElement
                    ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50 cursor-not-allowed"
                    : (canvasState.styles[activeFocusElement.id]?.isBold !== undefined
                        ? canvasState.styles[activeFocusElement.id]?.isBold
                        : Boolean(activeFocusElement.isBold))
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-slate-900 dark:border-white font-bold shadow-2xs cursor-pointer"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                }`}
                title={activeFocusElement ? "In đậm (Ctrl + B)" : "Rê chuột vào ô để đổi kiểu chữ"}
              >
                <Bold className="w-3 h-3" />
              </button>

              {/* UX Improvement 1: Format Painter (Chổi quét định dạng) */}
              <button
                type="button"
                disabled={!activeFocusElement && !copiedStyle}
                onClick={() => {
                  if (isFormatPainterActive) {
                    setIsFormatPainterActive(false);
                  } else if (activeFocusElement) {
                    handleCopyStyle(activeFocusElement.id);
                  }
                }}
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                  isFormatPainterActive
                    ? "bg-amber-500 text-white border-amber-600 shadow-2xs animate-pulse cursor-pointer"
                    : copiedStyle
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
                    : activeFocusElement
                    ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50 cursor-not-allowed"
                }`}
                title={
                  isFormatPainterActive
                    ? "Đang bật chổi quét - Bấm vào ô bất kỳ để dán định dạng (hoặc bấm để tắt)"
                    : "Chổi sao chép định dạng (Ctrl + Shift + C / V)"
                }
              >
                <Paintbrush className="w-3 h-3" />
              </button>

              {/* Căn lề Alignment */}
              <div
                className={`flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 ${
                  !activeFocusElement ? "opacity-50" : ""
                }`}
              >
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleChangeAlign(activeFocusElement.id, "left")}
                  className={`p-1 rounded transition-colors ${
                    !activeFocusElement
                      ? "text-slate-400 cursor-not-allowed"
                      : (canvasState.styles[activeFocusElement.id]?.align || activeFocusElement.align || "left") === "left"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs cursor-pointer"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  }`}
                  title="Căn trái"
                >
                  <AlignLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleChangeAlign(activeFocusElement.id, "center")}
                  className={`p-1 rounded transition-colors ${
                    !activeFocusElement
                      ? "text-slate-400 cursor-not-allowed"
                      : (canvasState.styles[activeFocusElement.id]?.align || activeFocusElement.align) === "center"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs cursor-pointer"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  }`}
                  title="Căn giữa"
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleChangeAlign(activeFocusElement.id, "right")}
                  className={`p-1 rounded transition-colors ${
                    !activeFocusElement
                      ? "text-slate-400 cursor-not-allowed"
                      : (canvasState.styles[activeFocusElement.id]?.align || activeFocusElement.align) === "right"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs cursor-pointer"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  }`}
                  title="Căn phải"
                >
                  <AlignRight className="w-3 h-3" />
                </button>
              </div>

              {/* Auto-Fit */}
              {activeFocusElement ? (
                <button
                  type="button"
                  onClick={() => handleAutoFitText(activeFocusElement, activeFocusFullText)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 font-bold text-[10px] cursor-pointer transition-colors border border-amber-400/40 shadow-2xs shrink-0"
                  title="Tự động co chữ vừa khung (Auto-Fit) chống tràn chữ"
                >
                  <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">Auto-Fit</span>
                </button>
              ) : null}

              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />

              {/* Màu sắc Colors */}
              {activeFocusElement ? (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setColorPopover((prev) =>
                          prev?.type === "textColor" && prev.elId === activeFocusElement.id
                            ? null
                            : { type: "textColor", elId: activeFocusElement.id }
                        )
                      }
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex flex-col items-center cursor-pointer transition-colors"
                      title="Màu chữ"
                    >
                      <Type className="w-3 h-3" />
                      <div
                        className="w-3.5 h-0.5 rounded-full mt-0.5"
                        style={{ backgroundColor: canvasState.styles[activeFocusElement.id]?.textColor || "#0f172a" }}
                      />
                    </button>
                    {colorPopover?.type === "textColor" && colorPopover.elId === activeFocusElement.id && (
                      <div
                        className="absolute top-full mt-1.5 left-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 shadow-2xl flex items-center gap-1.5 z-50 animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[
                          { label: "Đen", hex: "#0f172a" },
                          { label: "Trắng", hex: "#ffffff" },
                          { label: "Đỏ", hex: "#dc2626" },
                          { label: "Xanh", hex: "#2563eb" },
                          { label: "Cam", hex: "#d97706" },
                          { label: "Lục", hex: "#16a34a" },
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => {
                              handleChangeColor(activeFocusElement.id, "textColor", c.hex);
                              setColorPopover(null);
                            }}
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-125 transition-transform cursor-pointer shadow-xs"
                            style={{ backgroundColor: c.hex }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setColorPopover((prev) =>
                          prev?.type === "fill" && prev.elId === activeFocusElement.id
                            ? null
                            : { type: "fill", elId: activeFocusElement.id }
                        )
                      }
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex flex-col items-center cursor-pointer transition-colors"
                      title="Màu nền ô"
                    >
                      <Palette className="w-3 h-3" />
                      <div
                        className="w-3.5 h-0.5 rounded-full mt-0.5"
                        style={{ backgroundColor: canvasState.styles[activeFocusElement.id]?.fill || activeFocusElement.fill || "transparent" }}
                      />
                    </button>
                    {colorPopover?.type === "fill" && colorPopover.elId === activeFocusElement.id && (
                      <div
                        className="absolute top-full mt-1.5 left-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 shadow-2xl flex items-center gap-1.5 z-50 animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[
                          { label: "Trong suốt", hex: "transparent" },
                          { label: "Trắng", hex: "#ffffff" },
                          { label: "Cam SOP", hex: "#ED7D31" },
                          { label: "Cyan", hex: "#00B0F0" },
                          { label: "Lục", hex: "#70AD47" },
                          { label: "Xám tối", hex: "#1e293b" },
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => {
                              handleChangeColor(activeFocusElement.id, "fill", c.hex);
                              setColorPopover(null);
                            }}
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-125 transition-transform cursor-pointer shadow-xs"
                            style={{
                              backgroundColor: c.hex === "transparent" ? "#cbd5e1" : c.hex,
                            }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0 opacity-40">
                  <div className="p-1 text-slate-400 cursor-not-allowed" title="Rê chuột vào ô để chọn màu">
                    <Type className="w-3 h-3" />
                  </div>
                  <div className="p-1 text-slate-400 cursor-not-allowed" title="Rê chuột vào ô để chọn màu nền">
                    <Palette className="w-3 h-3" />
                  </div>
                </div>
              )}

              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />

              {/* Sắp xếp lớp Layer Ordering */}
              <div className={`flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 ${!activeFocusElement ? "opacity-50" : ""}`}>
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleLayerOrder(activeFocusElement.id, "forward")}
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  title={activeFocusElement ? `Đưa lên trên một lớp (Bring Forward) • Lớp hiện tại: ${canvasState.styles[activeFocusElement.id]?.zIndex ?? "mặc định"}` : "Rê chuột vào ô để chỉnh lớp"}
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={!activeFocusElement}
                  onClick={() => activeFocusElement && handleLayerOrder(activeFocusElement.id, "backward")}
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  title={activeFocusElement ? `Đưa xuống dưới một lớp (Send Backward) • Lớp hiện tại: ${canvasState.styles[activeFocusElement.id]?.zIndex ?? "mặc định"}` : "Rê chuột vào ô để chỉnh lớp"}
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>

              {/* Thao tác Duplicate & Delete: Đặt cố định cạnh Layer, không bị đẩy mất khi ô có nhiều dòng */}
              {activeFocusElement ? (
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDuplicateElement(activeFocusElement)}
                    className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 cursor-pointer transition-colors"
                    title="Nhân bản ô (Ctrl + D)"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteElement(activeFocusElement.id)}
                    className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer transition-colors"
                    title="Xóa ô này (Delete / Backspace)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : null}

              {/* Sửa & Chọn dịch khi ô có nhiều dòng: Chế độ Dịch / Sửa thông minh, toàn bộ các nút D1..Dn hiển thị trọn vẹn không bị che */}
              {activeFocusElement && activeFocusUnits.length > 1 ? (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2 py-0.5 border border-slate-200 dark:border-slate-700 min-w-0 flex-1">
                    {/* Chuyển đổi linh hoạt giữa Dịch và Sửa chữ */}
                    <div className="flex items-center bg-white dark:bg-slate-900 rounded-md p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setLineToolMode("translate")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          lineToolMode === "translate"
                            ? "bg-amber-500 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        title="Chế độ chọn dịch từng dòng"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Dịch ({activeFocusUnits.filter((u) => selectedUnitIds.has(u.id)).length}/{activeFocusUnits.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineToolMode("edit")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          lineToolMode === "edit"
                            ? "bg-sky-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        title="Chế độ sửa nhanh nội dung dòng"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>Sửa</span>
                      </button>
                    </div>

                    {/* Khi ở chế độ Dịch: Nút Chọn tất cả / Bỏ hết */}
                    {lineToolMode === "translate" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          const allSelected = activeFocusUnits.every((u) => selectedUnitIds.has(u.id));
                          if (allSelected) {
                            deselectAllUnitsInElement(activeFocusUnits, e);
                          } else {
                            selectAllUnitsInElement(activeFocusUnits, e);
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-white dark:bg-slate-700 hover:bg-amber-500 hover:text-white text-slate-600 dark:text-slate-300 shadow-2xs cursor-pointer transition-all shrink-0 whitespace-nowrap"
                        title={activeFocusUnits.every((u) => selectedUnitIds.has(u.id)) ? "Bỏ chọn tất cả các dòng" : "Chọn tất cả các dòng trong ô"}
                      >
                        {activeFocusUnits.every((u) => selectedUnitIds.has(u.id)) ? "Bỏ hết" : "Tất cả"}
                      </button>
                    )}

                    {/* Gộp dòng ở trên hoặc ở dưới trực tiếp trên thanh công cụ */}
                    {(() => {
                      const activeToolbarLineIdx = activeFocusUnits.findIndex((u) => u.id === editingUnitId || selectedUnitIds.has(u.id));
                      const safeToolbarLineIdx = activeToolbarLineIdx >= 0 ? activeToolbarLineIdx : 0;
                      return (
                        <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 rounded-md p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleMergeLine("up", activeFocusUnits[safeToolbarLineIdx], safeToolbarLineIdx, activeFocusUnits)}
                            disabled={safeToolbarLineIdx <= 0}
                            className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-0.5"
                            title={
                              safeToolbarLineIdx > 0
                                ? `Gộp dòng D${safeToolbarLineIdx + 1} với dòng D${safeToolbarLineIdx} ở trên`
                                : "Gộp dòng ở trên (Hãy chọn từ dòng D2 trở đi)"
                            }
                          >
                            <ArrowUp className="w-2.5 h-2.5 text-indigo-500" />
                            <span>Gộp trên</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMergeLine("down", activeFocusUnits[safeToolbarLineIdx], safeToolbarLineIdx, activeFocusUnits)}
                            disabled={safeToolbarLineIdx >= activeFocusUnits.length - 1}
                            className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-0.5"
                            title={
                              safeToolbarLineIdx < activeFocusUnits.length - 1
                                ? `Gộp dòng D${safeToolbarLineIdx + 1} với dòng D${safeToolbarLineIdx + 2} ở dưới`
                                : "Gộp dòng ở dưới (Dòng cuối cùng không thể gộp xuống)"
                            }
                          >
                            <ArrowDown className="w-2.5 h-2.5 text-indigo-500" />
                            <span>Gộp dưới</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Danh sách các nút D1..Dn: Dàn trải toàn diện, không còn bị cắt xén che mất */}
                    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                      {activeFocusUnits.map((u, idx) => {
                        const isSelected = selectedUnitIds.has(u.id);
                        if (lineToolMode === "translate") {
                          return (
                            <button
                              key={`sel_multi_${u.id}`}
                              type="button"
                              onClick={(e) => {
                                if (e.altKey) {
                                  selectOnlyThisUnit(u, activeFocusUnits, e);
                                } else {
                                  toggleUnitSelection(u.id, e);
                                }
                              }}
                              onDoubleClick={(e) => startEdit(u, e)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const x = Math.min(e.clientX, window.innerWidth - 350);
                                const y = Math.min(e.clientY, window.innerHeight - 440);
                                setSelectedElementId(activeFocusElement.id);
                                setContextMenu({
                                  x: Math.max(10, x),
                                  y: Math.max(10, y),
                                  element: activeFocusElement,
                                  unit: u,
                                  unitIndex: idx,
                                  elementUnits: activeFocusUnits,
                                });
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all flex items-center gap-0.5 shrink-0 whitespace-nowrap ${
                                isSelected
                                  ? "bg-amber-500 text-white shadow-xs scale-105 ring-1 ring-amber-600"
                                  : "bg-white dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-950/60 hover:text-amber-800 text-slate-700 dark:text-slate-200 shadow-2xs"
                              }`}
                              title={`Dòng ${idx + 1}: ${isSelected ? "Đang chọn dịch (Bấm để bỏ chọn)" : "Chưa chọn (Bấm để chọn)"} • "${u.sourceText.slice(0, 40)}..." (Giữ Alt để chỉ chọn dòng này • Chuột phải để gộp dòng / xem tùy chọn • Nhấp đúp để sửa)`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              <span>D{idx + 1}</span>
                            </button>
                          );
                        }

                        // Mode === 'edit'
                        return (
                          <button
                            key={`edit_line_${u.id}`}
                            type="button"
                            onClick={(e) => startEdit(u, e)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const x = Math.min(e.clientX, window.innerWidth - 350);
                              const y = Math.min(e.clientY, window.innerHeight - 440);
                              setSelectedElementId(activeFocusElement.id);
                              setContextMenu({
                                x: Math.max(10, x),
                                y: Math.max(10, y),
                                element: activeFocusElement,
                                unit: u,
                                unitIndex: idx,
                                elementUnits: activeFocusUnits,
                              });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                              editingUnitId === u.id
                                ? "bg-sky-600 text-white shadow-xs scale-105"
                                : "bg-white dark:bg-slate-700 hover:bg-sky-500 hover:text-white text-slate-700 dark:text-slate-200 shadow-2xs"
                            }`}
                            title={`Sửa dòng ${idx + 1}: "${u.sourceText.slice(0, 35)}..." (Chuột phải để gộp dòng)`}
                          >
                            D{idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : activeFocusElement && activeFocusUnits.length === 1 ? (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <button
                    type="button"
                    onClick={(e) => startEdit(activeFocusUnits[0], e)}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors shrink-0 flex items-center gap-1"
                    title="Sửa chữ trực tiếp (Enter / Nhấp đúp)"
                  >
                    <Pencil className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">Sửa chữ</span>
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 italic hidden 2xl:inline-flex items-center gap-1 pl-1 font-normal select-none">
                  <MousePointerClick className="w-3 h-3 text-slate-400" />
                  <span>Bấm chọn ô để đổi font size (Alt + Lăn chuột)</span>
                </span>
              )}
            </div>
          </div>

          {/* Right: Clean Grouped Control Blocks (Image 3: Đã dời lên ngang hàng với tab Trực quan Slide PPTX qua Portal, chỉ hiển thị tại đây khi ở chế độ toàn màn hình hoặc không có slot) */}
          {(() => {
            const isMountedInModalSlot = !isCanvasFullscreen && Boolean(headerSlot);
            const controlsContent = (
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                {/* Batch Selected Quick Action Pill */}
                {selectedInCurrentSlide.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-700 px-2.5 py-0.5 rounded-full text-xs text-sky-800 dark:text-sky-300 font-semibold shadow-2xs">
                    <span>Chọn: <strong>{selectedInCurrentSlide.length}</strong></span>
                    <button
                      type="button"
                      disabled={isTranslatingQuick}
                      onClick={handleBatchTranslateSelected}
                      className="px-2 py-0.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {isTranslatingQuick ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5 text-amber-300" />}
                      <span>Dịch</span>
                    </button>
                  </div>
                )}

                {/* Language Segmented Pill */}
                <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("source")}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      viewMode === "source"
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                    title="Bản gốc tiếng Việt"
                  >
                    VI
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("target")}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      viewMode === "target"
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                    title="Bản dịch tiếng Anh (chuẩn xuất slide)"
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("bilingual")}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      viewMode === "bilingual"
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                    title="Song ngữ đối chiếu"
                  >
                    Song ngữ
                  </button>
                  {/* UX Improvement 5: Before-After Split Slider Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsSplitCompareActive((prev) => !prev)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                      isSplitCompareActive
                        ? "bg-sky-600 text-white shadow-2xs font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                    title="So sánh Trước / Sau dạng thanh trượt kéo (Before-After Split Slider)"
                  >
                    <Split className="w-3 h-3 text-sky-400" />
                  </button>
                </div>

                {/* Zoom, Canvas Fit & Help Controls */}
                <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setZoomScale((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))))}
                    className="p-1 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    title="Thu nhỏ (- hoặc Ctrl + Cuộn chuột xuống)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFitMode("contain");
                      setZoomScale(1.0);
                      setPanOffset({ x: 0, y: 0 });
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1 transition-colors"
                    title="Tự động khớp khung hình (Visual Fit • Phím 0)"
                  >
                    <Scan className="w-3 h-3 text-sky-500" />
                    <span>{Math.round(zoomScale * 100)}%</span>
                  </button>
                  {(panOffset.x !== 0 || panOffset.y !== 0 || zoomScale !== 1.0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPanOffset({ x: 0, y: 0 });
                        setZoomScale(1.0);
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 rounded cursor-pointer transition-colors"
                      title="Đặt lại khung nhìn gốc (100% & giữa màn hình)"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setZoomScale((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))))}
                    className="p-1 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    title="Phóng to (+ hoặc Ctrl + Cuộn chuột lên)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setIsCanvasFullscreen((prev) => !prev)}
                    className="p-1 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    title={isCanvasFullscreen ? "Thu nhỏ về cửa sổ" : "Mở rộng toàn màn hình canvas"}
                  >
                    {isCanvasFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setShowShortcutsModal(true)}
                    className="p-1 rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    title="Bảng phím tắt & Hướng dẫn thao tác (Phím ?)"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Canvas View Tools Group (Focus, Inspector, Zero-Image, Snap, Shield, Fit) */}
                <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setFocusPendingOnly((prev) => !prev)}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      focusPendingOnly
                        ? "bg-rose-600 text-white shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title="Focus Tiêu Điểm: Làm mờ ô đã dịch, chỉ sáng ô cần dịch (Phím F)"
                  >
                    <Focus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageVisibility((v) => (v === "hidden" ? "wireframe" : "hidden"))}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      imageVisibility === "hidden"
                        ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                    title={imageVisibility === "hidden" ? "Zero-Image: Đã ẩn ảnh" : "Hiện khung ảnh gốc"}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMagneticSnapEnabled((prev) => {
                        const next = !prev;
                        setQuickActionNotice(next ? "Đã BẬT nam châm gióng hàng (Snap Guides)" : "Đã TẮT nam châm gióng hàng");
                        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                        return next;
                      });
                    }}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      isMagneticSnapEnabled
                        ? "bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 ring-1 ring-pink-500/40 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title={
                      isMagneticSnapEnabled
                        ? "Nam châm gióng hàng: Đang BẬT (Tự động hút trục 50% & mép ô khi kéo/resize)"
                        : "Nam châm gióng hàng: Đang TẮT (Bấm để bật)"
                    }
                  >
                    <Magnet className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsHighlightSopTerms((prev) => {
                        const next = !prev;
                        setQuickActionNotice(next ? "Đã BẬT tô sáng thuật ngữ chuẩn SOP & Glossary" : "Đã TẮT tô sáng thuật ngữ SOP");
                        if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                        quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                        return next;
                      });
                    }}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      isHighlightSopTerms
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title={
                      isHighlightSopTerms
                        ? "Tô sáng Thuật ngữ SOP & Glossary: Đang BẬT (Hiện huy hiệu xanh ngọc cho SPI, No-sew, Tip-quarter,...)"
                        : "Tô sáng Thuật ngữ SOP & Glossary: Đang TẮT (Bấm để bật)"
                    }
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setFitMode((prev) => (prev === "contain" ? "width" : "contain"))}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      fitMode === "width"
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title={fitMode === "width" ? "Chế độ Rộng rõ tối đa (W) - Nhấp để Vừa khung tiêu chuẩn" : "Chế độ Vừa khung tiêu chuẩn - Nhấp để Rộng rõ tối đa (W)"}
                  >
                    {fitMode === "width" ? <ArrowLeftRight className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* History Pill (Undo, Redo, Reset) */}
                <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="p-1 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-0.5"
                    title={`Hoàn tác (Ctrl + Z)${undoStack.length > 0 ? ` [${undoStack.length} bước]` : ""}`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    {undoStack.length > 0 && (
                      <span className="text-[9px] font-mono font-bold text-sky-600 dark:text-sky-400">{undoStack.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    className="p-1 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-0.5"
                    title={`Làm lại (Ctrl + Y hoặc Ctrl + Shift + Z)${redoStack.length > 0 ? ` [${redoStack.length} bước]` : ""}`}
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    {redoStack.length > 0 && (
                      <span className="text-[9px] font-mono font-bold text-sky-600 dark:text-sky-400">{redoStack.length}</span>
                    )}
                  </button>
                  {hasCustomPositionsOnCurrentSlide && (
                    <button
                      type="button"
                      onClick={handleResetPositions}
                      className="p-1 rounded text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer transition-colors"
                      title="Đặt lại bố cục gốc của slide này"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={() => setIsCanvasFullscreen((prev) => !prev)}
                  className="p-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs"
                  title={isCanvasFullscreen ? "Thu nhỏ về cửa sổ" : "Mở rộng toàn màn hình canvas"}
                >
                  {isCanvasFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>

                {/* Shortcuts & Guide Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className="p-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 cursor-pointer transition-colors shadow-2xs"
                  title="Bảng phím tắt & Hướng dẫn thao tác (?)"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            );

            return (
              <>
                {isMountedInModalSlot && headerSlot && createPortal(controlsContent, headerSlot)}
                {!isMountedInModalSlot && controlsContent}
              </>
            );
          })()}
        </div>

        {/* Compact Slide Strip Bar with Unified Pager Navigation */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800 shrink-0">
          {/* Pager controls moved from top header bar */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevSlide}
              disabled={currentSlide <= 1}
              className="px-2 py-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer flex items-center gap-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs"
              title="Slide trước (Phím A hoặc ←)"
            >
              <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-bold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                A
              </kbd>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs transition-all shrink-0">
              <Presentation className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span
                key={`slide_badge_${currentSlide}`}
                className="text-xs font-bold text-slate-800 dark:text-slate-100 animate-in fade-in duration-100 whitespace-nowrap"
              >
                Slide {currentSlide} / {report.totalSlides}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextSlide}
              disabled={currentSlide >= report.totalSlides}
              className="px-2 py-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 transition-colors cursor-pointer flex items-center gap-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs"
              title="Slide tiếp theo (Phím D hoặc →)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-bold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                D
              </kbd>
            </button>

            {pendingSlideNumbers.length > 0 && (
              <button
                type="button"
                onClick={handleNextPendingSlide}
                className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0"
                title="Chuyển tới slide có đoạn chưa dịch tiếp theo"
              >
                <Sparkles className="w-3 h-3 text-rose-500" />
                <span className="whitespace-nowrap hidden sm:inline">Đến slide thiếu ({pendingSlideNumbers.length})</span>
                <span className="whitespace-nowrap sm:hidden">Thiếu ({pendingSlideNumbers.length})</span>
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 shrink-0" />

          <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
            <span>Slide:</span>
            <label className="flex items-center gap-1 cursor-pointer text-slate-600 dark:text-slate-400 whitespace-nowrap">
              <input
                type="checkbox"
                checked={filterPendingOnly}
                onChange={(e) => setFilterPendingOnly(e.target.checked)}
                className="rounded text-rose-600 focus:ring-0 cursor-pointer w-3 h-3"
              />
              <span>Chỉ thiếu</span>
            </label>
          </div>

          <div
            ref={slideStripRef}
            className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-thin scroll-smooth"
          >
            {displayedSlideStrip.map((sNum) => {
              const uList = slideMap.get(sNum) || [];
              const summary = slideStatusSummary.get(sNum);
              const hasPending = summary ? summary.hasPending : false;
              const isSelected = sNum === currentSlide;
              const selectedCount = uList.filter((u) => selectedUnitIds.has(u.id)).length;

              return (
                <button
                  key={sNum}
                  ref={isSelected ? activeSlideBtnRef : undefined}
                  type="button"
                  onClick={() => {
                    setCurrentSlide(sNum);
                    setEditingUnitId(null);
                    setSelectedElementId(null);
                    setContextMenu(null);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold shrink-0 transition-all flex items-center gap-1 cursor-pointer border ${
                    isSelected
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-slate-900 dark:border-white shadow-2xs scale-105"
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
        onMouseDown={handleCanvasContainerMouseDown}
        style={{
          cursor: isSpacePressed ? (isPanningRef.current ? "grabbing" : "grab") : undefined,
        }}
        className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden w-full bg-slate-100 dark:bg-slate-950 rounded-xl select-none shadow-inner border border-slate-200 dark:border-slate-800 scroll-smooth"
      >
        {/* Real-time Font Size HUD Toast Feedback (Alt + Mouse Wheel) */}
        {fontSizeFeedback !== null && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 dark:bg-slate-950/98 backdrop-blur-md text-white font-mono text-xs px-4 py-1.5 rounded-full shadow-2xl pointer-events-none z-[100] flex items-center gap-2.5 border border-sky-400/80 animate-in fade-in zoom-in-95 duration-100">
            <Type className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-bold text-sky-300">Cỡ chữ: {fontSizeFeedback.sizePt}pt</span>
            <span className="text-slate-400 text-[10px] border-l border-slate-700 pl-2">Alt + Cuộn chuột</span>
          </div>
        )}

        {/* Slide Switching Notification Toast */}
        {slideSwitchNotice !== null && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-md text-white font-mono text-xs px-3.5 py-1 rounded-full shadow-2xl pointer-events-none z-50 flex items-center gap-2 border border-sky-500/50 animate-in fade-in zoom-in-95 duration-100">
            <Presentation className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-bold text-sky-300">Slide {slideSwitchNotice}</span>
            <span className="text-slate-400 text-[10px]">/ {report.totalSlides}</span>
          </div>
        )}
        {layoutMode === "isq_dual" && dualSlideInfo ? (
          // DUAL SLIDE ISQ SIDE-BY-SIDE
          <div
            className="w-full min-h-full flex items-start justify-center pt-3 pb-8 px-2"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanningRef.current ? "none" : "transform 0.05s ease-out",
              willChange: "transform",
            }}
          >
            <div className="flex items-start justify-center gap-3 shrink-0">
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
          </div>
        ) : (
          // STANDARD PPTX VISUAL REVIEW (1:1 SPATIAL)
          <div className="w-full min-h-full flex items-start justify-center pt-3 pb-8 px-2">
            <div
              key={`slide_canvas_${currentSlide}`}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                transition: isPanningRef.current ? "none" : "transform 0.05s ease-out",
                willChange: "transform",
              }}
              className="animate-in fade-in zoom-in-[0.99] duration-150 flex flex-col items-center shrink-0 shadow-2xl rounded-lg"
            >
              {/* UX Improvement 5: Visual Before-After Split Comparison Slider */}
              {isSplitCompareActive ? (
                <div
                  ref={splitContainerRef}
                  className="relative overflow-hidden rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 select-none bg-white shrink-0"
                  style={{
                    width: `${slideDimensions.width}px`,
                    minHeight: `${slideDimensions.height}px`,
                  }}
                >
                  {/* Layer 1: Source (Vietnamese Original) - Stacking context 1 */}
                  <div
                    className="relative w-full pointer-events-auto"
                    style={{ zIndex: 1, isolation: "isolate" }}
                  >
                    {renderSlideSheet(currentSlide, currentVisualLayout, unitById, "source")}
                  </div>
                  {/* Layer 2: Target (English Translated), clipped by split slider - Stacking context 10 */}
                  <div
                    className="absolute inset-0 pointer-events-auto overflow-hidden"
                    style={{
                      zIndex: 10,
                      isolation: "isolate",
                      clipPath: `polygon(${splitSliderPercent}% 0, 100% 0, 100% 100%, ${splitSliderPercent}% 100%)`,
                      WebkitClipPath: `polygon(${splitSliderPercent}% 0, 100% 0, 100% 100%, ${splitSliderPercent}% 100%)`,
                    }}
                  >
                    {renderSlideSheet(currentSlide, currentVisualLayout, unitById, "target")}
                  </div>
                  {/* Draggable Divider Handle */}
                  <div
                    className="absolute top-0 bottom-0 z-50 flex items-center justify-center cursor-ew-resize group select-none"
                    style={{
                      left: `${splitSliderPercent}%`,
                      transform: "translateX(-50%)",
                      width: "36px",
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingSplitter(true);
                      const handleMouseMove = (moveEvt: MouseEvent) => {
                        const containerRect = splitContainerRef.current?.getBoundingClientRect();
                        if (!containerRect || containerRect.width <= 0) return;
                        const clientX = moveEvt.clientX;
                        const rawPct = ((clientX - containerRect.left) / containerRect.width) * 100;
                        const newPct = Math.max(5, Math.min(95, rawPct));
                        setSplitSliderPercent(Number(newPct.toFixed(1)));
                      };
                      const handleMouseUp = () => {
                        setIsDraggingSplitter(false);
                        window.removeEventListener("mousemove", handleMouseMove);
                        window.removeEventListener("mouseup", handleMouseUp);
                      };
                      window.addEventListener("mousemove", handleMouseMove);
                      window.addEventListener("mouseup", handleMouseUp);
                    }}
                  >
                    <div className="w-[3px] h-full bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.9)]" />
                    <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/95 text-white font-mono text-[10px] font-bold shadow-2xl border border-sky-400 group-hover:scale-110 transition-transform whitespace-nowrap select-none">
                      <span className="text-amber-400">VI (Gốc)</span>
                      <span className="text-slate-500">◀ ❚ ▶</span>
                      <span className="text-sky-400">EN (Dịch)</span>
                    </div>
                  </div>
                </div>
              ) : (
                renderSlideSheet(currentSlide, currentVisualLayout, unitById, viewMode)
              )}
            </div>
          </div>
        )}



        {/* ================================================================== */}
        {/* POWERPOINT-STYLE RIGHT-CLICK CONTEXT MENU (AT CURSOR POSITION)      */}
        {/* ================================================================== */}
        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: `${Math.min(contextMenu.x, window.innerWidth - 300)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 480)}px`,
            }}
            className="w-[285px] bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border border-slate-300 dark:border-slate-700/80 rounded-xl shadow-2xl z-[999] text-xs text-slate-800 dark:text-slate-100 select-none animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
          >
            {/* 1. POWERPOINT MINI FORMATTING TOOLBAR */}
            <div className="p-1.5 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 space-y-1">
              {/* Row 1: Font Family + Font Size with Minus/Plus + Close button */}
              <div className="flex items-center gap-1">
                <div className="flex-1 flex items-center px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate" title="Phông chữ">
                  <Type className="w-3 h-3 text-slate-400 mr-1 shrink-0" />
                  <span className="truncate">Calibri / Aptos</span>
                </div>

                {/* Font Size controls */}
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => handleChangeFontSize(contextMenu.element.id, -1)}
                    className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Giảm cỡ chữ (A-)"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                  <span className="font-mono font-bold text-[11px] px-1 text-sky-600 dark:text-sky-400 min-w-[26px] text-center">
                    {`${canvasState.styles[contextMenu.element.id]?.fontSizePt ?? contextMenu.element.fontSizePt ?? 11}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleChangeFontSize(contextMenu.element.id, 1)}
                    className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Tăng cỡ chữ (A+)"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setContextMenu(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                  title="Đóng menu (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 2: Bold, Alignments, Color & SOP Presets */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5">
                  {/* Bold Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleBold(contextMenu.element)}
                    className={`p-1 rounded cursor-pointer transition-all ${
                      (canvasState.styles[contextMenu.element.id]?.isBold !== undefined
                        ? canvasState.styles[contextMenu.element.id]?.isBold
                        : contextMenu.element.isBold)
                        ? "bg-sky-600 text-white shadow-2xs font-bold"
                        : "hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                    }`}
                    title="In đậm (Bold - Ctrl+B)"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>

                  {/* Align Left */}
                  <button
                    type="button"
                    onClick={() => handleChangeAlign(contextMenu.element.id, "left")}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Căn trái"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Align Center */}
                  <button
                    type="button"
                    onClick={() => handleChangeAlign(contextMenu.element.id, "center")}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Căn giữa"
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>

                  {/* Align Right */}
                  <button
                    type="button"
                    onClick={() => handleChangeAlign(contextMenu.element.id, "right")}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Căn phải"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Text Color Popover */}
                  <button
                    type="button"
                    onClick={() => {
                      setColorPopover({
                        type: "textColor",
                        elId: contextMenu.element.id,
                      });
                    }}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-rose-500 cursor-pointer"
                    title="Màu chữ (Font Color)"
                  >
                    <Palette className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* SOP Presets Quick Chips */}
                <div className="flex items-center gap-0.5">
                  {SOP_TYPOGRAPHY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyTypographyPreset(contextMenu.element.id, preset)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 hover:border-indigo-600 transition-colors cursor-pointer"
                      title={`${preset.label} (${preset.fontSizePt}pt)`}
                    >
                      {preset.fontSizePt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. POWERPOINT CONTEXT MENU LIST */}
            <div className="p-1 max-h-[380px] overflow-y-auto space-y-0.5 text-[11.5px]">
              {/* Cut */}
              <button
                type="button"
                onClick={() => {
                  const textToCopy = contextMenu.unit?.sourceText || contextMenu.element.text || "";
                  navigator.clipboard.writeText(textToCopy);
                  setQuickActionNotice("Đã cắt văn bản vào bộ nhớ đệm!");
                  setContextMenu(null);
                  if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                  quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cắt (Cut)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Ctrl+X</span>
              </button>

              {/* Copy */}
              <button
                type="button"
                onClick={() => {
                  const textToCopy = contextMenu.unit?.sourceText || contextMenu.element.text || "";
                  navigator.clipboard.writeText(textToCopy);
                  setQuickActionNotice("Đã sao chép văn bản!");
                  setContextMenu(null);
                  if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                  quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sao chép (Copy)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Ctrl+C</span>
              </button>

              {/* Format Painter */}
              <button
                type="button"
                onClick={() => {
                  handleCopyStyle(contextMenu.element.id);
                  setQuickActionNotice("Đã sao chép định dạng!");
                  setContextMenu(null);
                  if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                  quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Paintbrush className="w-3.5 h-3.5 text-amber-500" />
                  <span>Sao chép định dạng</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Alt+C</span>
              </button>

              {copiedStyle && (
                <button
                  type="button"
                  onClick={() => {
                    handlePasteStyle(contextMenu.element.id);
                    setQuickActionNotice("Đã áp dụng định dạng!");
                    setContextMenu(null);
                    if (quickActionTimerRef.current) clearTimeout(quickActionTimerRef.current);
                    quickActionTimerRef.current = setTimeout(() => setQuickActionNotice(null), 1800);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Paintbrush className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Dán định dạng đã chép</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Alt+V</span>
                </button>
              )}

              {/* Separator */}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

              {/* Translation Section (Dịch thuật) */}
              <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-1">
                <Languages className="w-3 h-3 text-sky-500" />
                <span>Chức năng Dịch Thuật</span>
              </div>

              {/* Batch Translate All in Selection if multi-selected */}
              {multiSelectedElementIds.size > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleBatchTranslate();
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Dịch cả vùng ({multiSelectedElementIds.size} ô)</span>
                  </div>
                  <span className="text-[10px] text-amber-600 font-mono">Batch</span>
                </button>
              )}

              {multiSelectedElementIds.size > 0 && (
                <button type="button" onClick={() => { handleSkipSelectedArea(); setContextMenu(null); }}
                  className="w-full px-2.5 py-2 rounded-lg text-left text-rose-700 bg-rose-50 hover:bg-rose-100 font-semibold cursor-pointer">
                  Bỏ dịch các ô này ({multiSelectedElementIds.size} ô)
                </button>
              )}

              {/* Instant AI Translation */}
              <button
                type="button"
                disabled={isTranslatingQuick}
                onClick={() => {
                  const ctxUnits = (contextMenu.element?.unitIds && contextMenu.element.unitIds.length > 0)
                    ? contextMenu.element.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
                    : contextMenu.element?.unitId && unitById.get(contextMenu.element.unitId)
                    ? [unitById.get(contextMenu.element.unitId)!]
                    : contextMenu.unit ? [contextMenu.unit] : [];
                  if (ctxUnits.length > 0) {
                    handleTranslateUnits(ctxUnits);
                  }
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isTranslatingQuick ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                  <span>Dịch AI ô này ngay (In-place)</span>
                </div>
                <span className="text-[10px] text-sky-500 font-mono">AI</span>
              </button>

              {/* Toggle translate selection */}
              {contextMenu.unit && (() => {
                const ctxUnits = (contextMenu.element?.unitIds && contextMenu.element.unitIds.length > 0)
                  ? contextMenu.element.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
                  : contextMenu.element?.unitId && unitById.get(contextMenu.element.unitId)
                  ? [unitById.get(contextMenu.element.unitId)!]
                  : [contextMenu.unit];
                const isCtxAllChecked = ctxUnits.length > 0 && ctxUnits.every((u) => selectedUnitIds.has(u.id));

                return (
                  <button
                    type="button"
                    onClick={() => {
                      const shouldSelect = !isCtxAllChecked;
                      for (const u of ctxUnits) {
                        if (shouldSelect) {
                          if (!selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                        } else {
                          if (selectedUnitIds.has(u.id)) onToggleUnit(u.id);
                        }
                      }
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCtxAllChecked ? <CheckSquare className="w-3.5 h-3.5 text-sky-500" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{isCtxAllChecked ? "Bỏ chọn dịch ô này" : "Chọn dịch ô này"}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Space</span>
                  </button>
                );
              })()}

              {/* Edit Text */}
              {contextMenu.unit && (
                <button
                  type="button"
                  onClick={() => {
                    startEdit(contextMenu.unit!);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5 text-sky-500" />
                    <span>Sửa nội dung văn bản</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">F2</span>
                </button>
              )}

              {/* Gộp dòng ở trên hoặc ở dưới (Line Merge) */}
              {(() => {
                const units = (contextMenu.elementUnits && contextMenu.elementUnits.length > 0)
                  ? contextMenu.elementUnits
                  : (contextMenu.element?.unitIds && contextMenu.element.unitIds.length > 0)
                  ? contextMenu.element.unitIds.map((id) => unitById.get(id)).filter((u): u is ScannedTextUnit => Boolean(u))
                  : [];
                if (units.length <= 1) return null;

                const targetIdx = contextMenu.unitIndex !== undefined
                  ? contextMenu.unitIndex
                  : contextMenu.unit
                  ? units.findIndex((u) => u.id === contextMenu.unit?.id)
                  : 0;

                const canMergeUp = targetIdx > 0;
                const canMergeDown = targetIdx >= 0 && targetIdx < units.length - 1;

                return (
                  <>
                    <button
                      type="button"
                      disabled={!canMergeUp}
                      onClick={() => {
                        handleMergeLine("up", contextMenu.unit, targetIdx, units);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 transition-colors ${
                        canMergeUp
                          ? "hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          : "opacity-40 cursor-not-allowed"
                      }`}
                      title={canMergeUp ? `Gộp dòng D${targetIdx + 1} vào dòng D${targetIdx} ở trên` : "Dòng đầu tiên, không có dòng ở trên để gộp"}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Gộp dòng ở trên</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">D{targetIdx + 1} ↑ D{targetIdx}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!canMergeDown}
                      onClick={() => {
                        handleMergeLine("down", contextMenu.unit, targetIdx, units);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 transition-colors ${
                        canMergeDown
                          ? "hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          : "opacity-40 cursor-not-allowed"
                      }`}
                      title={canMergeDown ? `Gộp dòng D${targetIdx + 2} ở dưới vào dòng D${targetIdx + 1}` : "Dòng cuối cùng, không có dòng ở dưới để gộp"}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Gộp dòng ở dưới</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">D{targetIdx + 1} ↓ D{targetIdx + 2}</span>
                    </button>
                  </>
                );
              })()}

              {/* Glossary dictionary */}
              {onOpenGlossary && (
                <button
                  type="button"
                  onClick={() => {
                    const queryText = contextMenu.selectedPhrase || contextMenu.unit?.sourceText || contextMenu.element.text || "";
                    onOpenGlossary(queryText);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Tra cứu từ điển SOP Glossary</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Dict</span>
                </button>
              )}

              {/* Separator */}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

              {/* Group 3: Định dạng & Tiện ích */}
              <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Định dạng & Tiện ích
              </div>

              {/* Auto-Fit Text */}
              <button
                type="button"
                onClick={() => {
                  const cellText = contextMenu.unit?.sourceText || contextMenu.element.text || "";
                  handleAutoFitText(contextMenu.element, cellText);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tự động co chữ (Auto-Fit)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Fit</span>
              </button>

              {/* Reset Font Size */}
              {canvasState.styles[contextMenu.element.id]?.fontSizePt !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    handleResetFontSize(contextMenu.element.id);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                    <span>Khôi phục cỡ chữ gốc ban đầu</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Reset</span>
                </button>
              )}

              {/* Separator */}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

              {/* Group 4: Thứ tự lớp */}
              <button
                type="button"
                onClick={() => {
                  handleLayerOrder(contextMenu.element.id, "forward");
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>Đưa lên trên (Bring Forward)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">]</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleLayerOrder(contextMenu.element.id, "backward");
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>Đưa xuống dưới (Send Backward)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">[</span>
              </button>
            </div>
          </div>
        )}


      </div>



      {/* Shortcuts & Guide Modal (?) */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Bảng Phím Tắt & Hướng Dẫn Thao Tác Canvas
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Phím tắt & cử chỉ chuột tối ưu cho biên tập Slide & bảng dữ liệu SOP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content: 3 Logical Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Column 1: Thao tác Chuột & Di chuyển */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                <div className="font-bold text-[11px] text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5" />
                  <span>Chuột & Khung nhìn</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Kéo di chuyển ô</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Giữ chuột trái</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Co giãn kích thước</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">8 điểm neo</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Quét chọn nhiều ô</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Phím S / Shift+Kéo</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Trượt xem canvas</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Space + Kéo</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Thu phóng Zoom</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl + Cuộn</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Menu chuột phải</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Chuột phải</kbd>
                  </div>
                </div>
              </div>

              {/* Column 2: Định dạng & Cỡ chữ */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                <div className="font-bold text-[11px] text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>Định dạng & Font</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Chỉnh cỡ chữ nhanh</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-mono font-bold text-[10px]">Alt + Cuộn</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Tăng / Giảm 1pt</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">[ hoặc ]</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">In đậm chữ (Bold)</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl + B</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Sao chép Style</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl+Shift+C</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Dán Style</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl+Shift+V</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Đổi thứ tự lớp</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl + [ / ]</kbd>
                  </div>
                </div>
              </div>

              {/* Column 3: Dịch thuật & Thao tác */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                <div className="font-bold text-[11px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  <span>Dịch & Thao tác</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Chọn dịch ô đang trỏ</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Space</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Sửa nội dung ô</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">F2 / Nhấp đúp</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Chuyển đổi Slide</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">A / D hoặc ← / →</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Hoàn tác / Làm lại</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Ctrl+Z / Ctrl+Y</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Bỏ chọn / Đóng menu</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Esc</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Mở bảng hướng dẫn này</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[10px]">?</kbd>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-slate-400">
                <span>Mẹo: Bạn có thể nhấn phím</span>
                <kbd className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-700 dark:text-slate-300">?</kbd>
                <span>bất kỳ lúc nào để xem nhanh bảng này.</span>
              </span>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Marquee Rubberband Selection Overlay (Chỉ hiển thị khi thực sự kéo chuột > 4px, không hiện badge che chữ) */}
      {selectionBox && (Math.abs(selectionBox.currentX - selectionBox.startX) > 4 || Math.abs(selectionBox.currentY - selectionBox.startY) > 4) && (
        <div
          className="fixed pointer-events-none z-[9999] border-2 border-indigo-500/80 bg-indigo-500/10 rounded-sm shadow-sm"
          style={{
            left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
            top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
            width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
            height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
          }}
        />
      )}

      {/* Floating Multi-Selection HUD Toolbar (Phương án 4: Có khả năng tự động gập / thu nhỏ để không che slide) */}
      {multiSelectedElementIds.size > 0 && !selectionBox && (
        isHudCollapsed ? (
          /* Mini Collapsed Pill HUD */
          <div
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 dark:bg-slate-950/95 text-white shadow-2xl border border-indigo-500/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 select-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            <span className="text-xs font-bold text-indigo-300 whitespace-nowrap">
              {multiSelectedElementIds.size} ô đã chọn
            </span>

            <button
              type="button"
              onClick={handleToggleBatchTranslate}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-[11px] font-bold shadow-xs cursor-pointer transition-colors"
              title="Chọn dịch / bỏ chọn dịch các ô đang quét chọn"
            >
              <Sparkles className="w-3 h-3" />
              <span>Dịch</span>
            </button>
                  <button type="button" onClick={handleSkipSelectedArea}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shrink-0 cursor-pointer"
                    title="Bỏ dịch tất cả các dòng trong vùng đã chọn; giữ nguyên nội dung">
                    <span>Bỏ dịch các ô này</span>
                  </button>

            <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

            <button
              type="button"
              onClick={() => setIsHudCollapsed(false)}
              className="p-1 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Mở rộng bảng công cụ đầy đủ"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setMultiSelectedElementIds(new Set())}
              className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Bỏ chọn vùng (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Full Multi-Selection HUD Toolbar */
          <div
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] flex flex-wrap justify-center max-w-[calc(100vw-24px)] w-max items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white shadow-2xl border border-indigo-500/60 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Badge Count */}
            <div className="flex items-center gap-2 pr-2.5 border-r border-slate-700/80">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
              <span className="text-xs font-bold text-indigo-300 whitespace-nowrap">
                Đã chọn {multiSelectedElementIds.size} ô
              </span>
            </div>

            {/* Quick Font Size Adjusters */}
            {activeFocusElement && (
              <div className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-1 rounded-xl border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => handleChangeFontSize(activeFocusElement.id, -1)}
                  className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Giảm 1pt cho toàn bộ vùng chọn"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono font-bold text-sky-400 min-w-[32px] text-center">
                  {`${canvasState.styles[activeFocusElement.id]?.fontSizePt ?? activeFocusElement.fontSizePt ?? 11}pt`}
                </span>
                <button
                  type="button"
                  onClick={() => handleChangeFontSize(activeFocusElement.id, 1)}
                  className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Tăng 1pt cho toàn bộ vùng chọn"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {canvasState.styles[activeFocusElement.id]?.fontSizePt !== undefined && (
                  <button
                    type="button"
                    onClick={() => handleResetFontSize(activeFocusElement.id)}
                    className="p-1 rounded-lg hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer border-l border-slate-700 ml-0.5"
                    title="Khôi phục cỡ chữ gốc ban đầu"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* SOP Typography Presets */}
            {activeFocusElement && (
              <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-slate-700/80">
                {SOP_TYPOGRAPHY_PRESETS.map((preset) => {
                  const currentSize = canvasState.styles[activeFocusElement.id]?.fontSizePt ?? activeFocusElement.fontSizePt ?? 11;
                  const isPresetActive = currentSize === preset.fontSizePt;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyTypographyPreset(activeFocusElement.id, preset)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isPresetActive
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                      }`}
                      title={preset.description}
                    >
                      <span>{preset.label}</span>
                      <span className="text-[9px] opacity-70 ml-0.5 font-mono">({preset.fontSizePt})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Batch Translate, Collapse HUD & Deselect */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700/80">
              <button
                type="button"
                onClick={handleToggleBatchTranslate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                title="Chọn dịch tất cả các dòng trong các ô đang quét chọn"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Dịch cả vùng</span>
              </button>
                  <button type="button" onClick={handleSkipSelectedArea}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shrink-0 cursor-pointer"
                    title="Bỏ dịch tất cả các dòng trong vùng đã chọn; giữ nguyên nội dung">
                    <span>Bỏ dịch các ô này</span>
                  </button>

              {/* Thu nhỏ / Gập HUD */}
              <button
                type="button"
                onClick={() => setIsHudCollapsed(true)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Thu nhỏ thanh công cụ để không che nội dung slide"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Bỏ chọn */}
              <button
                type="button"
                onClick={() => setMultiSelectedElementIds(new Set())}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Bỏ chọn vùng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}



      {/* Floating Quick Action Notice Toast */}
      {quickActionNotice && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/95 text-white font-medium text-xs shadow-2xl border border-sky-500/50 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{quickActionNotice}</span>
        </div>
      )}
    </div>
  );
};
