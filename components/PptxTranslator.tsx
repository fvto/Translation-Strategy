"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Presentation,
  UploadCloud,
  ShieldCheck,
  CheckCircle2,
  Download,
  RefreshCw,
  FileText,
  Layers,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileCheck,
  History,
  BookMarked,
  BookOpen,
  Search,
  X,
  Plus,
  Clock,
  Calendar,
  Zap,
  Gauge,
  Activity,
  Loader2,
} from "lucide-react";
import { AiStudioTelemetry } from "./AiStudioTelemetry";
import { AiStudioMetrics } from "@/services/translation/types";
import { TranslationMemoryDrawer } from "./TranslationMemoryDrawer";
import { SlideReviewModal } from "./SlideReviewModal";
import { SmartAuditModal, ViHandlingOptions } from "./SmartAuditModal";
import { SmartAuditReport } from "@/services/translation/smart-detector";
import { QaAuditWidget } from "./QaAuditWidget";
import { auditPresentationCompliance } from "@/services/qa/compliance-scorer";
import { UnmappedTermItem } from "@/services/terminology/unmapped-detector";
import {
  getUserSlideEdits,
  saveUserSlideEdits,
  applyEditsToSlides,
  getLatestPresentationSession,
  StoredPresentationSession,
} from "@/services/storage/slide-edits-storage";

export interface PptxParagraph {
  id: string;
  slideIndex: number;
  shapeIndex: number;
  paragraphIndex: number;
  originalText: string;
  translatedText: string;
}

export interface PptxSlideData {
  slideIndex: number;
  slideFileName: string;
  title: string;
  paragraphs: PptxParagraph[];
  notes?: string;
  translatedNotes?: string;
}

export interface PptxExtractionStats {
  totalSlides: number;
  totalParagraphs: number;
  totalWords: number;
  totalCharacters: number;
  totalImagesProtected: number;
  protectedImageNames: string[];
  imageShieldActive: boolean;
  markitdownMarkdown?: string;
  markitdownLoaded?: boolean;
}

export interface TranslationProgressState {
  stage: "extracting" | "crawling" | "translating" | "packaging" | "done";
  percent: number;
  message: string;
  currentBatch?: number;
  totalBatches?: number;
  translatedItems?: number;
  totalItems?: number;
  totalSlides?: number;
  aiStudioMetrics?: AiStudioMetrics;
}

export type PptxTranslationMode = "ipqc_bilingual" | "isq_duplicate" | "replace_en";

export function formatSopFileName(originalName: string): string {
  if (!originalName) return "presentation-EN.pptx";
  const baseName = originalName.replace(/\.pptx$/i, "").trim();
  let enBaseName = baseName;
  if (/[-_]VN$/i.test(baseName)) {
    enBaseName = baseName.replace(/[-_]VN$/i, "-EN");
  } else if (/[-_]VI$/i.test(baseName)) {
    enBaseName = baseName.replace(/[-_]VI$/i, "-EN");
  } else if (!/[-_]EN$/i.test(baseName)) {
    enBaseName = `${baseName}-EN`;
  }
  return `${enBaseName}.pptx`;
}

export const PptxTranslator: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [progressInfo, setProgressInfo] = useState<TranslationProgressState | null>(null);
  const [stats, setStats] = useState<PptxExtractionStats | null>(null);
  const [slides, setSlides] = useState<PptxSlideData[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("gemini");
  const [mode, setMode] = useState<PptxTranslationMode>("ipqc_bilingual");
  const [langDir, setLangDir] = useState<"vi-en" | "en-vi">("vi-en");
  const [slideScope, setSlideScope] = useState<"all" | "custom">("all");
  const [slideRangeInput, setSlideRangeInput] = useState<string>("");
  const [aiStudioMetrics, setAiStudioMetrics] = useState<AiStudioMetrics | null>(null);
  const [isFetchingMetrics, setIsFetchingMetrics] = useState<boolean>(false);

  const fetchAiStudioMetrics = async () => {
    try {
      setIsFetchingMetrics(true);
      const res = await fetch("/api/gemini/metrics");
      if (res.ok) {
        const data = await res.json();
        setAiStudioMetrics((prev) => ({
          model: data.model,
          rpm: data.rpm,
          rpd: data.rpd,
          tokens: prev?.tokens,
          latencyMs: prev?.latencyMs ?? 0,
          status: "HEALTHY",
          queueLength: data.queueLength,
          timestamp: data.timestamp,
        }));
      }
    } catch {
      // non-blocking
    } finally {
      setIsFetchingMetrics(false);
    }
  };

  useEffect(() => {
    fetchAiStudioMetrics();
  }, []);

  const srcLang = langDir === "vi-en" ? "vi" : "en";
  const tgtLang = langDir === "vi-en" ? "en" : "vi";
  const [showMarkdown, setShowMarkdown] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTmDrawerOpen, setIsTmDrawerOpen] = useState<boolean>(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [isSavingCustomSlides, setIsSavingCustomSlides] = useState<boolean>(false);
  const [auditReport, setAuditReport] = useState<SmartAuditReport | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // Unmapped specialized terminology detection & suggestion states
  const [unmappedTerms, setUnmappedTerms] = useState<UnmappedTermItem[]>([]);
  const [unmappedSearch, setUnmappedSearch] = useState<string>("");
  const [unmappedSlideFilter, setUnmappedSlideFilter] = useState<string>("all");
  const [unmappedCategoryFilter, setUnmappedCategoryFilter] = useState<string>("all");
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, string>>({});
  const [savingTermId, setSavingTermId] = useState<string | null>(null);
  const [addedTermIds, setAddedTermIds] = useState<Set<string>>(new Set());
  const [isBatchAdding, setIsBatchAdding] = useState<boolean>(false);
  const [batchAddSuccessMessage, setBatchAddSuccessMessage] = useState<string | null>(null);

  // Session restoration from localStorage
  const [restoredSession, setRestoredSession] = useState<StoredPresentationSession | null>(null);
  const [restoredEditsCount, setRestoredEditsCount] = useState<number>(0);

  // Post-Flight QA Compliance Report
  const qaReport = useMemo(() => {
    if (!slides || slides.length === 0) return null;
    return auditPresentationCompliance(slides, file?.name || "presentation.pptx");
  }, [slides, file]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings?.defaultProvider) {
          setProvider(data.settings.defaultProvider);
        }
      })
      .catch(() => {});

    // Check for previous saved session
    try {
      const latest = getLatestPresentationSession();
      if (latest && latest.slides && latest.slides.length > 0) {
        setRestoredSession(latest);
      }
    } catch (e) {}
  }, []);

  const handleRestoreSession = () => {
    if (!restoredSession || !restoredSession.slides) return;
    setSlides(restoredSession.slides);
    setSessionId(restoredSession.sessionId || null);
    if (restoredSession.stats) {
      setStats(restoredSession.stats);
    } else {
      setStats({
        totalSlides: restoredSession.slides.length,
        totalParagraphs: restoredSession.slides.reduce(
          (acc, s) => acc + s.paragraphs.length,
          0
        ),
        totalWords: 0,
        totalCharacters: 0,
        totalImagesProtected: 0,
        protectedImageNames: [],
        imageShieldActive: true,
      });
    }
    const editsCount = Object.keys(restoredSession.paragraphEdits || {}).filter(
      (k) => !k.startsWith("text_")
    ).length;
    setRestoredEditsCount(editsCount);
    setRestoredSession(null);
  };

  const handleReset = () => {
    setFile(null);
    setStats(null);
    setSlides([]);
    setSessionId(null);
    setProgressInfo(null);
    setErrorMessage(null);
    setShowMarkdown(false);
    setMode("ipqc_bilingual");
    setLangDir("vi-en");
    setUnmappedTerms([]);
    setAddedTermIds(new Set());
    setSelectedOptionsMap({});
    setBatchAddSuccessMessage(null);
  };

  const runSmartAudit = async (selectedFile?: File, openModal: boolean = true) => {
    const targetFile = selectedFile || file;
    if (!targetFile) return;

    setIsAuditing(true);
    setAuditReport(null);
    if (openModal) {
      setIsAuditModalOpen(true);
    }
    setProcessingStatus("Đang quét toàn diện cấu trúc tài liệu để phát hiện khoảng trống dịch thuật...");
    const formData = new FormData();
    formData.append("file", targetFile);
    formData.append("action", "audit");
    formData.append("sourceLanguage", srcLang);
    formData.append("targetLanguage", tgtLang);
    formData.append("mode", mode);

    try {
      const res = await fetch("/api/documents/translate-pptx", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Không thể quét PowerPoint.");
      if (data.success && data.auditReport) {
        setAuditReport(data.auditReport);
        if (openModal) {
          setIsAuditModalOpen(true);
        }
      }
    } catch (e: any) {
      console.error("Smart audit error:", e);
      setErrorMessage(e.message || "Không thể quét PowerPoint.");
      if (openModal) {
        setIsAuditModalOpen(false);
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const applyAuditSuggestions = async (
    unitIds: string[],
    customTranslations?: Record<string, string>,
    options?: ViHandlingOptions
  ) => {
    if (!file || !auditReport) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", "apply_audit");
    formData.append("sourceLanguage", srcLang);
    formData.append("targetLanguage", tgtLang);
    formData.append("mode", mode);
    formData.append("selectedUnitIds", JSON.stringify(unitIds));
    if (options?.viHandlingMode) {
      formData.append("viRefAction", options.viHandlingMode);
    }
    if (options?.slideViHandling && Object.keys(options.slideViHandling).length > 0) {
      formData.append("slideViHandling", JSON.stringify(options.slideViHandling));
    }
    const previewList = auditReport.units.filter((u) => unitIds.includes(u.id)).map((u) => ({
      id: u.id,
      sourceText: u.sourceText,
      suggestedTranslation: customTranslations?.[u.id] !== undefined ? customTranslations[u.id] : u.suggestedTranslation,
    }));
    formData.append("auditPreview", JSON.stringify(previewList));
    if (customTranslations && Object.keys(customTranslations).length > 0) {
      formData.append("customTranslations", JSON.stringify(customTranslations));
    }
    const response = await fetch("/api/documents/translate-pptx", { method: "POST", body: formData });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Không thể áp dụng gợi ý."); }
    const appliedCount = response.headers.get("X-Audit-Applied-Count") || String(unitIds.length);
    const unhandledCount = parseInt(response.headers.get("X-Audit-Unhandled-Count") || "0", 10);
    const unhandledSlidesHeader = response.headers.get("X-Audit-Unhandled-Slides");
    let unhandledSlidesText = "";
    if (unhandledSlidesHeader) {
      try {
        const slides = JSON.parse(unhandledSlidesHeader);
        if (Array.isArray(slides) && slides.length > 0) {
          unhandledSlidesText = ` tại các slide: ${slides.join(", ")}`;
        }
      } catch {}
    }
    const blob = await response.blob();
    const updatedFile = new File([blob], file.name, { type: file.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name.replace(/\.pptx$/i, "-audited.pptx");
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setFile(updatedFile); setSlides([]); setStats(null); setSessionId(null); setUnmappedTerms([]);
    if (unhandledCount > 0) {
      setErrorMessage(`Đã áp dụng ${appliedCount} vị trí. Vẫn còn ${unhandledCount} mục chưa được xử lý${unhandledSlidesText}. Đang tự động quét lại...`);
    }
    await runSmartAudit(updatedFile);
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pptx")) {
      alert("Vui lòng chọn file trình chiếu PowerPoint định dạng .pptx");
      return;
    }
    setFile(selectedFile);
    setStats(null);
    setSlides([]);
    setSessionId(null);
    setProgressInfo(null);
    setErrorMessage(null);
    setShowMarkdown(false);
    setUnmappedTerms([]);
    setAddedTermIds(new Set());
    setSelectedOptionsMap({});
    setBatchAddSuccessMessage(null);
    // Proactively scan document gaps on import in the background
    runSmartAudit(selectedFile, false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const executeAction = async (
    action: "crawl" | "translate",
    options?: {
      translateMissingOnly?: boolean;
      selectedUnitIds?: string[];
      customTranslations?: Record<string, string>;
      viRefAction?: string;
      slideViHandling?: Record<number, string>;
    }
  ) => {
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setProgressInfo({
      stage: "extracting",
      percent: 8,
      message:
        action === "crawl"
          ? "Đang khởi tạo & trích xuất cấu trúc văn bản..."
          : options?.translateMissingOnly
          ? "Đang dịch bổ sung CHỈ các phần còn thiếu (Translate Missing Only)..."
          : "Đang đọc cấu trúc file PowerPoint bằng Microsoft MarkItDown...",
    });
    setProcessingStatus(
      action === "crawl"
        ? "Đang cào dữ liệu slide, trích xuất cấu trúc văn bản..."
        : options?.translateMissingOnly
        ? "Đang dịch các phần còn thiếu, bảo toàn 100% bản dịch cũ..."
        : "Đang cào dữ liệu & dịch toàn bộ PowerPoint từ Tiếng Việt sang Tiếng Anh..."
    );

    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", action);
    formData.append("sourceLanguage", srcLang);
    formData.append("targetLanguage", tgtLang);
    formData.append("provider", provider);
    formData.append("mode", mode);
    formData.append("stage", "all");
    if (slideScope === "custom" && slideRangeInput.trim()) {
      formData.append("slideRange", slideRangeInput.trim());
    }
    if (options?.translateMissingOnly) {
      formData.append("translateMissingOnly", "true");
      if (options.selectedUnitIds) {
        formData.append("selectedUnitIds", JSON.stringify(options.selectedUnitIds));
      }
      if (options.customTranslations && Object.keys(options.customTranslations).length > 0) {
        formData.append("customTranslations", JSON.stringify(options.customTranslations));
      }
      if (options.viRefAction) {
        formData.append("viRefAction", options.viRefAction);
      }
      if (options.slideViHandling && Object.keys(options.slideViHandling).length > 0) {
        formData.append("slideViHandling", JSON.stringify(options.slideViHandling));
      }
    }

    const finishMissingTranslation = async (payload: any) => {
      if (!payload.sessionId) throw new Error("Không tìm thấy file đã sửa để tải về.");
      // GET serves the already packaged incremental result. Rebuilding through
      // the full-deck export path would change paragraphs outside the selection.
      const response = await fetch(`/api/documents/translate-pptx/download?id=${encodeURIComponent(payload.sessionId)}`);
      if (!response.ok) throw new Error("Đã dịch xong nhưng chưa tải được PPTX. Vui lòng thử tải lại.");
      const blob = await response.blob();
      const updatedFile = new File([blob], file.name, { type: file.type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name.replace(/\.pptx$/i, "-fixed.pptx");
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setFile(updatedFile); setSlides([]); setStats(null); setSessionId(null); setUnmappedTerms([]);
      setProgressInfo({ stage: "done", percent: 100, message: "Đã sửa phần chưa dịch và tải PPTX. Đang kiểm tra lại..." });
      await runSmartAudit(updatedFile);
    };

    try {
      if (action === "translate") {
        const res = await fetch("/api/documents/translate-pptx?stream=true", {
          method: "POST",
          body: formData,
          headers: {
            Accept: "text/event-stream",
          },
        });

        if (res.headers.get("content-type")?.includes("text/event-stream")) {
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              streamBuffer += decoder.decode(value, { stream: true });
              const blocks = streamBuffer.split("\n\n");
              streamBuffer = blocks.pop() || "";

              for (const block of blocks) {
                const eventMatch = block.match(/^event:\s*(.+)$/m);
                const dataMatch = block.match(/^data:\s*(.+)$/m);
                if (!eventMatch || !dataMatch) continue;

                const eventType = eventMatch[1].trim();
                const payload = JSON.parse(dataMatch[1].trim());

                if (eventType === "progress") {
                  setProgressInfo({
                    stage: payload.stage,
                    percent: payload.progress,
                    message: payload.message,
                    currentBatch: payload.currentBatch,
                    totalBatches: payload.totalBatches,
                    translatedItems: payload.translatedItems,
                    totalItems: payload.totalItems,
                    totalSlides: payload.totalSlides,
                    aiStudioMetrics: payload.aiStudioMetrics,
                  });
                  if (payload.aiStudioMetrics) {
                    setAiStudioMetrics(payload.aiStudioMetrics);
                  }
                  setProcessingStatus(payload.message);
                } else if (eventType === "complete") {
                  if (payload.aiStudioMetrics) {
                    setAiStudioMetrics(payload.aiStudioMetrics);
                  } else {
                    fetchAiStudioMetrics();
                  }
                  if (options?.translateMissingOnly) {
                    await finishMissingTranslation(payload);
                    continue;
                  }
                  setStats(payload.stats);

                  // Auto-merge any previously saved edits for this file
                  const stored = getUserSlideEdits(file?.name);
                  let finalSlides = payload.slides;
                  if (stored && stored.paragraphEdits && Object.keys(stored.paragraphEdits).length > 0) {
                    const { slides: merged, appliedCount } = applyEditsToSlides(
                      payload.slides,
                      stored.paragraphEdits
                    );
                    finalSlides = merged;
                    if (appliedCount > 0) {
                      setRestoredEditsCount(appliedCount);
                    }
                  }

                  setSlides(finalSlides);
                  setSessionId(payload.sessionId);

                  // Persist latest state
                  saveUserSlideEdits(
                    file?.name,
                    stored?.paragraphEdits || {},
                    finalSlides,
                    stored?.initialAiTranslations,
                    payload.sessionId,
                    payload.stats
                  );

                  if (payload.unmappedTerms) {
                    setUnmappedTerms(payload.unmappedTerms);
                  }
                  setProgressInfo({
                    stage: "done",
                    percent: 100,
                    message: "Hoàn tất! File PowerPoint đã sẵn sàng xuất & tải về.",
                  });
                } else if (eventType === "error") {
                  throw new Error(payload.error || "Xử lý file PowerPoint thất bại");
                }
              }
            }
          }
          return;
        }

        // Fallback for non-streaming response
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Xử lý file PowerPoint thất bại");
        }
        if (options?.translateMissingOnly) {
          await finishMissingTranslation(data);
          return;
        }
        setStats(data.stats);

        const stored = getUserSlideEdits(file?.name);
        let finalSlides = data.slides;
        if (stored && stored.paragraphEdits && Object.keys(stored.paragraphEdits).length > 0) {
          const { slides: merged, appliedCount } = applyEditsToSlides(
            data.slides,
            stored.paragraphEdits
          );
          finalSlides = merged;
          if (appliedCount > 0) {
            setRestoredEditsCount(appliedCount);
          }
        }

        setSlides(finalSlides);
        setSessionId(data.sessionId);

        saveUserSlideEdits(
          file?.name,
          stored?.paragraphEdits || {},
          finalSlides,
          stored?.initialAiTranslations,
          data.sessionId,
          data.stats
        );

        if (data.unmappedTerms) {
          setUnmappedTerms(data.unmappedTerms);
        }
        if (data.aiStudioMetrics) {
          setAiStudioMetrics(data.aiStudioMetrics);
        } else {
          fetchAiStudioMetrics();
        }
      } else {
        // Crawl only
        const res = await fetch("/api/documents/translate-pptx", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Xử lý file PowerPoint thất bại");
        }

        setStats(data.stats);
        setSlides(data.slides);
        setSessionId(data.sessionId);
        if (data.unmappedTerms) {
          setUnmappedTerms(data.unmappedTerms);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Đã xảy ra lỗi khi xử lý bài trình chiếu.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleDownload = async () => {
    if (!slides || slides.length === 0) return;
    setIsDownloading(true);

    try {
      let res: Response | null = null;

      // Standard POST with session ID, latest slides and mode (preserves any manual edits)
      res = await fetch("/api/documents/translate-pptx/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          slides,
          mode,
          fileName: file?.name,
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
        }),
      });

      // 3. Fallback: Re-upload buffer if session was lost/expired
      if (!res.ok && file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("slides", JSON.stringify(slides));
        formData.append("sourceLanguage", srcLang);
        formData.append("targetLanguage", tgtLang);
        formData.append("mode", mode);
        if (sessionId) formData.append("id", sessionId);
        res = await fetch("/api/documents/translate-pptx/download", {
          method: "POST",
          body: formData,
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Không thể tải file PowerPoint đã dịch");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = formatSopFileName(file ? file.name : "presentation");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Lỗi tải file: " + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveSlides = async (updatedSlides: PptxSlideData[]) => {
    setIsSavingCustomSlides(true);
    try {
      setSlides(updatedSlides);

      const res = await fetch("/api/documents/translate-pptx/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          slides: updatedSlides,
          mode,
          fileName: file?.name,
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Không thể xuất file PPTX với nội dung đã sửa.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = formatSopFileName(file ? file.name : "presentation.pptx");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Lỗi lưu và xuất file: " + err.message);
    } finally {
      setIsSavingCustomSlides(false);
    }
  };

  const handleExportJson = () => {
    if (!slides || slides.length === 0) return;
    const exportData = {
      presentationName: file?.name,
      stats,
      slides: slides.map((s) => ({
        slideIndex: s.slideIndex,
        title: s.title,
        content: s.paragraphs.map((p) => ({
          vi: p.originalText,
          en: p.translatedText,
        })),
        notesVi: s.notes,
        notesEn: s.translatedNotes,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.pptx$/i, "")}_bilingual_data.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSelectOption = (itemId: string, targetTerm: string) => {
    setSelectedOptionsMap((prev) => ({ ...prev, [itemId]: targetTerm }));
  };

  const handleSaveToGlossary = async (item: UnmappedTermItem) => {
    const chosenTarget =
      selectedOptionsMap[item.id] ||
      item.suggestedOptions[0]?.targetTerm ||
      item.currentTranslation;
    if (!chosenTarget || !chosenTarget.trim()) return;

    setSavingTermId(item.id);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTerm: item.sourceTerm.trim(),
          targetTerm: chosenTarget.trim(),
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
          category: item.category,
          context: `Slide ${item.slideIndex} - ${item.section}`,
          definition: `Thuật ngữ chuyên ngành đề xuất từ bài trình chiếu PowerPoint`,
          status: "review", // STRICT USER RULE: terms from files must enter "review" status
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không thể gửi vào Glossary Review");
      }

      setAddedTermIds((prev) => new Set([...prev, item.id]));
    } catch (err: any) {
      alert("Lỗi khi thêm vào Glossary: " + err.message);
    } finally {
      setSavingTermId(null);
    }
  };

  const handleBatchAddAll = async () => {
    const unadded = unmappedTerms.filter((it) => !addedTermIds.has(it.id));
    if (unadded.length === 0) return;

    setIsBatchAdding(true);
    setBatchAddSuccessMessage(null);
    let successCount = 0;

    for (const item of unadded) {
      const chosenTarget =
        selectedOptionsMap[item.id] ||
        item.suggestedOptions[0]?.targetTerm ||
        item.currentTranslation;
      try {
        const res = await fetch("/api/glossary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTerm: item.sourceTerm.trim(),
            targetTerm: chosenTarget.trim(),
            sourceLanguage: srcLang,
            targetLanguage: tgtLang,
            category: item.category,
            context: `Slide ${item.slideIndex} - ${item.section}`,
            definition: `Thuật ngữ chuyên ngành đề xuất từ bài trình chiếu PowerPoint`,
            status: "review", // STRICT USER RULE: terms from files must enter "review" status
          }),
        });
        if (res.ok) {
          successCount++;
          setAddedTermIds((prev) => new Set([...prev, item.id]));
        }
      } catch (e) {}
    }

    setIsBatchAdding(false);
    if (successCount > 0) {
      setBatchAddSuccessMessage(`Đã gửi ${successCount} thuật ngữ vào danh sách Chờ duyệt. Vui lòng vào Glossary Review để duyệt thuật ngữ trước khi áp dụng.`);
    }
  };

  const filteredUnmappedTerms = unmappedTerms.filter((item) => {
    if (unmappedSlideFilter !== "all" && item.slideIndex.toString() !== unmappedSlideFilter) {
      return false;
    }
    if (unmappedCategoryFilter !== "all" && item.category !== unmappedCategoryFilter) {
      return false;
    }
    if (unmappedSearch.trim()) {
      const q = unmappedSearch.toLowerCase();
      const matchSource = item.sourceTerm.toLowerCase().includes(q);
      const matchTrans = item.currentTranslation.toLowerCase().includes(q);
      const matchContext = item.contextSnippet.toLowerCase().includes(q);
      const matchOptions = item.suggestedOptions.some((opt) => opt.targetTerm.toLowerCase().includes(q));
      if (!matchSource && !matchTrans && !matchContext && !matchOptions) return false;
    }
    return true;
  });

  const slideNumbers = Array.from(new Set(unmappedTerms.map((t) => t.slideIndex))).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-50 text-[#E60023] flex items-center justify-center">
              <Presentation className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Dịch PowerPoint Chuyên Sâu (AI PPTX Translator)
            </h2>
            <span className="bg-rose-50 text-[#E60023] border border-rose-200 text-xs font-semibold px-3 py-0.5 rounded-full">
              {langDir === "vi-en" ? "VI ➔ EN" : "EN ➔ VI"}
            </span>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-3 py-0.5 rounded-full flex items-center gap-1">
              MS MarkItDown + Gemini 3.5 &amp; 3.1 Flash Lite
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Đọc cấu trúc bài thuyết trình bằng <b className="text-slate-700">Microsoft MarkItDown</b>, dịch chuẩn xác bằng <b className="text-slate-700">Google Gemini 3.5 &amp; 3.1 Flash Lite</b> và xuất file PowerPoint <b className="text-slate-700">giữ nguyên 100% sơ đồ, biểu đồ &amp; bố cục gốc</b>.
          </p>
        </div>

        {/* Security Shield Badge */}
        <div className="flex items-center space-x-3 bg-emerald-50/80 border border-emerald-200/80 px-4 py-2.5 rounded-2xl text-xs text-emerald-800 shadow-2xs">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
              <span>Image &amp; Diagram Shield</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-[11px] text-emerald-700/80">
              0 hình ảnh gửi sang AI • 100% sơ đồ, biểu đồ, hình vẽ và layout được bảo vệ
            </div>
          </div>
        </div>
      </div>

      {/* Upload & Engine Controls */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-800">Cấu hình Dịch thuật:</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsTmDrawerOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all text-xs font-semibold cursor-pointer"
              title="Tra cứu các file đã dịch & bộ nhớ câu dịch song ngữ"
            >
              <History className="w-3.5 h-3.5 text-slate-600" />
              <span>Lịch sử dịch &amp; Bộ nhớ TM</span>
            </button>

            <div className="flex items-center space-x-2 text-xs bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <span className="text-slate-500 font-medium">Engine Dịch:</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="gemini" className="bg-white text-slate-900">
                  Google AI Studio (Gemini 3.5 &amp; 3.1 Flash Lite)
                </option>
                <option value="google_translate" className="bg-white text-slate-900">
                  Google NMT (Thuật ngữ chuẩn CAT)
                </option>
              </select>
            </div>

            <div className="flex items-center space-x-2 text-xs bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <span className="text-slate-500 font-medium">Chiều dịch:</span>
              <select
                value={langDir}
                onChange={(e) => setLangDir(e.target.value as "vi-en" | "en-vi")}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="vi-en" className="bg-white text-slate-900">🇻🇳 Tiếng Việt ➔ 🇬🇧 Tiếng Anh</option>
                <option value="en-vi" className="bg-white text-slate-900">🇬🇧 Tiếng Anh ➔ 🇻🇳 Tiếng Việt</option>
              </select>
            </div>
          </div>
        </div>

        {/* Restore Previous Session Banner */}
        {restoredSession && slides.length === 0 && !isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>Phát hiện phiên dịch trước đó:</span>
                  <span className="text-blue-700 font-mono">{restoredSession.fileName}</span>
                  {Object.keys(restoredSession.paragraphEdits || {}).filter((k) => !k.startsWith("text_")).length > 0 && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {Object.keys(restoredSession.paragraphEdits || {}).filter((k) => !k.startsWith("text_")).length} câu bạn đã sửa
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Các câu chỉnh sửa của bạn vẫn được lưu an toàn trong trình duyệt. Bấm khôi phục để xem lại hoặc xuất file PPTX ngay mà không cần dịch lại.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleRestoreSession}
                className="px-4 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Khôi phục phiên này</span>
              </button>
              <button
                type="button"
                onClick={() => setRestoredSession(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                title="Bỏ qua"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all ${
            file
              ? "border-rose-300 bg-rose-50/40"
              : "border-slate-300 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-50"
          }`}
        >
          <input
            type="file"
            id="pptx-file-input"
            accept=".pptx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <label
            htmlFor="pptx-file-input"
            className="cursor-pointer flex flex-col items-center text-center space-y-2"
          >
            <div className="p-4 rounded-2xl bg-rose-50 text-[#E60023] shadow-2xs">
              <Presentation className="w-8 h-8" />
            </div>
            {file ? (
              <div>
                <span className="text-sm font-bold text-slate-900">{file.name}</span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • Sẵn sàng xử lý
                </span>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-slate-800 hover:text-[#E60023]">
                  Kéo thả file .pptx vào đây hoặc bấm để chọn file
                </span>
                <span className="text-xs text-slate-500 block mt-1">
                  Định dạng hỗ trợ: Microsoft PowerPoint (.pptx)
                </span>
              </div>
            )}
          </label>
        </div>

        {/* SOP Translation Strategy Selector (3 Options theo chuẩn SOP Ching Luh) */}
        {file && !isProcessing && (
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
              <span className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                <span>Quy chuẩn dịch &amp; Xuất bản (SOP Translation Strategy):</span>
              </span>
              <span className="text-[11px] text-slate-600 font-semibold bg-white px-3 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                Ching Luh SOP Manual
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Unified Ching Luh SOP (IPQC & ISQ Merged) */}
              <button
                type="button"
                onClick={() => setMode("ipqc_bilingual")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  mode === "ipqc_bilingual"
                    ? "bg-white border-2 border-slate-900 text-slate-900 shadow-md"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#E60023]" />
                      1. Quy chuẩn SOP Ching Luh
                    </span>
                    <span className="text-[10px] font-semibold bg-rose-50 text-[#E60023] px-2 py-0.5 rounded-full border border-rose-200">
                      Chuẩn Chung • Tự động chuẩn hóa
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                    <p>
                      • <b>Slide quy trình (Bảng kiểm tra, quy trình):</b> Giữ nguyên 1 slide với <b>Song ngữ EN trên – VI dưới</b> trong từng ô/sơ đồ. Giữ nguyên cột <i>Inspection Item</i> defect codes trên 1 dòng duy nhất.
                    </p>
                    <p>
                      • <b>Slide chuyên biệt (Khuôn dao, trạm CTQ/CTP):</b> Tự động nhân đôi thành <b>1 Slide EN ở trên</b> (xóa tiếng Việt) và <b>1 Slide VI nguyên bản ở ngay dưới</b> liền kề.
                    </p>
                    <p>
                      • <b>Bảo toàn nội dung &amp; Font:</b> Đã có tiếng Anh thì giữ nguyên tiếng Anh, có tiếng Việt giữ nguyên tiếng Việt. Font chữ và font size <b>100% đồng nhất</b> với văn bản gốc.
                    </p>
                  </div>
                </div>
                {mode === "ipqc_bilingual" && (
                  <div className="mt-3 text-[11px] font-bold text-slate-900 flex items-center gap-1">
                    <span>✓ Đang chọn (Mặc định khuyên dùng)</span>
                  </div>
                )}
              </button>

              {/* Option 2: Full EN (Remove VI) */}
              <button
                type="button"
                onClick={() => setMode("replace_en")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  mode === "replace_en"
                    ? "bg-white border-2 border-slate-900 text-slate-900 shadow-md"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                      2. Chỉ dịch Full EN (Xóa tiếng Việt)
                    </span>
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                      SOP Slide 8 • 100% English
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                    <p>
                      • Dịch toàn bộ nội dung sang <b>Tiếng Anh chuẩn, xóa bỏ hoàn toàn tiếng Việt</b> trên toàn bộ slide.
                    </p>
                    <p>
                      • <b>Giữ nguyên layout &amp; số trang:</b> Không nhân đôi slide, giữ nguyên 100% số lượng trang, hình ảnh minh họa, biểu đồ và bố cục gốc.
                    </p>
                    <p>
                      • Áp dụng thuật ngữ kỹ thuật giày thể thao chuẩn hóa theo từ điển SOP Ching Luh.
                    </p>
                  </div>
                </div>
                {mode === "replace_en" && (
                  <div className="mt-3 text-[11px] font-bold text-slate-900 flex items-center gap-1">
                    <span>✓ Đang chọn</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Slide Selection Scope (Chọn slide cần dịch) */}
        {file && !isProcessing && (
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
              <span className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                <span>Phạm vi slide cần dịch (Slide Scope):</span>
              </span>
              <span className="text-[11px] text-slate-600 font-medium">
                {slideScope === "all" ? "Toàn bộ bài thuyết trình" : `Chỉ dịch slide: ${slideRangeInput || "(Chưa nhập)"}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSlideScope("all")}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  slideScope === "all"
                    ? "bg-white border-2 border-slate-900 text-slate-900 shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="text-xs font-bold text-slate-900">Dịch tất cả các slide (Mặc định)</div>
                <div className="text-[11px] text-slate-500 mt-1">Quét và dịch toàn bộ nội dung từ trang đầu đến trang cuối.</div>
              </button>

              <button
                type="button"
                onClick={() => setSlideScope("custom")}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  slideScope === "custom"
                    ? "bg-white border-2 border-slate-900 text-slate-900 shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="text-xs font-bold text-slate-900">Chỉ dịch các slide được chọn</div>
                <div className="text-[11px] text-slate-500 mt-1">Chỉ dịch các slide cụ thể, các slide khác giữ nguyên 100% không đổi.</div>
              </button>
            </div>

            {slideScope === "custom" && (
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Nhập khoảng slide, ví dụ: 1-5, 8, 12-14..."
                  value={slideRangeInput}
                  onChange={(e) => setSlideRangeInput(e.target.value)}
                  className="px-3.5 py-2 rounded-full bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 flex-1 shadow-2xs"
                />
                <span className="text-[11px] text-slate-500">
                  (Định dạng: số đơn lẻ hoặc dải slide cách nhau bằng dấu phẩy)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons & AI Studio Telemetry Badge */}
        {file && !isProcessing && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2">
              {aiStudioMetrics && (
                <span
                  title={`Google AI Studio: ${aiStudioMetrics.rpm.current}/${aiStudioMetrics.rpm.limit} RPM (Pacing: ≥${((aiStudioMetrics.rpm.minIntervalMs ?? 4500) / 1000).toFixed(1)}s/req, Hạn ngạch: ${aiStudioMetrics.rpd.used}/${aiStudioMetrics.rpd.limit} RPD)`}
                  className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 px-3.5 py-2 rounded-full border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 shadow-2xs"
                >
                  <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>AI Studio: {aiStudioMetrics.rpm.current}/{aiStudioMetrics.rpm.limit} RPM</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span>RPD: {aiStudioMetrics.rpd.used}/{aiStudioMetrics.rpd.limit}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => executeAction("crawl")}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-slate-600" />
                <span>Chỉ cào cấu trúc slide</span>
              </button>

              <button
                onClick={() => {
                  if (auditReport) {
                    setIsAuditModalOpen(true);
                  } else {
                    runSmartAudit(file, true);
                  }
                }}
                disabled={isProcessing}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isAuditing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Đang quét Smart Audit...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Smart Audit (Quét phần thiếu)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => executeAction("translate")}
                className="flex items-center space-x-2.5 px-7 py-2.5 rounded-full bg-[#E60023] hover:bg-[#CC001F] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-rose-200" />
                <span>Dịch &amp; Xuất File PowerPoint (.pptx)</span>
              </button>
            </div>
          </div>
        )}

        {/* Rich Interactive Progress Dashboard */}
        {isProcessing && (
          <div className="rounded-3xl bg-slate-50/90 border border-slate-200 p-6 shadow-sm space-y-5 animate-in fade-in duration-300">
            {/* Top row: Status, Spinner & Percentage */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-[#E60023] flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900 tracking-wide">
                      Tiến độ dịch PowerPoint ({langDir === "vi-en" ? "VI ➔ EN" : "EN ➔ VI"})
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                      {provider === "antigravity_cli"
                        ? "Antigravity CLI (agy)"
                        : provider === "gemini"
                        ? "Google Gemini 3.5 & 3.1 Flash Lite"
                        : provider === "google_translate"
                        ? "Google NMT (CAT)"
                        : provider}
                    </span>
                    {aiStudioMetrics && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-blue-600" />
                        <span>RPM: {aiStudioMetrics.rpm.current}/{aiStudioMetrics.rpm.limit}</span>
                        <span>|</span>
                        <span>RPD: {aiStudioMetrics.rpd.used}/{aiStudioMetrics.rpd.limit}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {progressInfo?.message || processingStatus}
                  </p>
                </div>
              </div>

              {/* Big bold percentage */}
              <div className="text-right shrink-0">
                <div className="text-3xl font-black font-mono tracking-tight text-[#E60023]">
                  {progressInfo?.percent ?? 10}%
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  {progressInfo?.stage === "extracting" && "Khởi tạo"}
                  {progressInfo?.stage === "crawling" && "Trích xuất"}
                  {progressInfo?.stage === "translating" && "Đang dịch AI"}
                  {progressInfo?.stage === "packaging" && "Đóng gói PPTX"}
                  {progressInfo?.stage === "done" && "Hoàn tất"}
                  {!progressInfo && "Đang xử lý"}
                </span>
              </div>
            </div>

            {/* Clean Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-[#E60023] transition-all duration-500 ease-out"
                  style={{ width: `${progressInfo?.percent ?? 10}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 font-mono px-1">
                <span>
                  {progressInfo?.translatedItems !== undefined && progressInfo?.totalItems
                    ? `Đã dịch: ${progressInfo.translatedItems}/${progressInfo.totalItems} đoạn văn`
                    : progressInfo?.totalSlides
                    ? `${progressInfo.totalSlides} slide được tìm thấy`
                    : "Đang nạp dữ liệu slide..."}
                </span>
                <span>
                  {progressInfo?.currentBatch && progressInfo?.totalBatches
                    ? `Gói batch: ${progressInfo.currentBatch}/${progressInfo.totalBatches}`
                    : "Bảo vệ 100% sơ đồ & ảnh"}
                </span>
              </div>
            </div>

            {/* 4 Interactive Pipeline Stage Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {/* Step 1: MarkItDown */}
              <div
                className={`p-3 rounded-2xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 20
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : progressInfo?.stage === "extracting"
                    ? "bg-white border-[#E60023] text-[#E60023]"
                    : "bg-white border-slate-200 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 20
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {(progressInfo?.percent ?? 0) >= 20 ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">1. MS MarkItDown</span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {(progressInfo?.percent ?? 0) >= 20 ? "Đã trích xuất" : "Đang đọc cấu trúc"}
                  </span>
                </div>
              </div>

              {/* Step 2: Image Shield */}
              <div
                className={`p-3 rounded-2xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 25
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-white border-slate-200 text-slate-500"
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">2. Image Shield</span>
                  <span className="text-[10px] text-emerald-700 block truncate">0 ảnh gửi AI</span>
                </div>
              </div>

              {/* Step 3: AI Translation */}
              <div
                className={`p-3 rounded-2xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 90
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : progressInfo?.stage === "translating"
                    ? "bg-white border-[#E60023] text-[#E60023]"
                    : "bg-white border-slate-200 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 90
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-rose-50 text-[#E60023]"
                  }`}
                >
                  {(progressInfo?.percent ?? 0) >= 90 ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">3. Dịch AI Gemini</span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {progressInfo?.stage === "translating"
                      ? progressInfo.currentBatch
                        ? `Gói ${progressInfo.currentBatch}/${progressInfo.totalBatches}`
                        : "Đang dịch..."
                      : (progressInfo?.percent ?? 0) >= 90
                      ? "Đã dịch xong"
                      : "Chờ xử lý"}
                  </span>
                </div>
              </div>

              {/* Step 4: Packaging */}
              <div
                className={`p-3 rounded-2xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 100
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : progressInfo?.stage === "packaging"
                    ? "bg-white border-[#E60023] text-[#E60023]"
                    : "bg-white border-slate-200 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 100
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {(progressInfo?.percent ?? 0) >= 100 ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Layers className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">4. Đóng gói PPTX</span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {(progressInfo?.percent ?? 0) >= 100 ? "Hoàn tất 100%" : "Giữ nguyên layout"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Google AI Studio Telemetry & Quota Guard for PPTX */}
        {file && (
          <div className="pt-2">
            <AiStudioTelemetry
              metrics={aiStudioMetrics}
              isLoading={isProcessing || isFetchingMetrics}
              onRefresh={fetchAiStudioMetrics}
            />
          </div>
        )}
      </div>

      {/* Results & PPTX Direct Export Section */}
      {stats && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Main Hero Card for PPTX Export */}
          <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span>Dịch Thành Công &amp; Sẵn Sàng Xuất File (.pptx)</span>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Hoàn tất 100%
                      </span>
                    </h3>
                  </div>
                </div>
                <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                  Toàn bộ văn bản thuyết trình đã được dịch sang Tiếng Anh. Toàn bộ hình ảnh, sơ đồ hình học, biểu đồ và bố cục slide gốc được bảo tồn nguyên vẹn 100%.
                </p>

                {/* Target File Info */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                  <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1.5">
                    <Presentation className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-500">Gốc:</span> {file?.name}
                  </span>
                  <span className="text-slate-400">➔</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5 font-semibold">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {file ? file.name.replace(/\.pptx$/i, "") : "presentation"}_translated_EN.pptx
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-500">Thời gian:</span>
                    <span className="text-slate-800 font-semibold">{new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  {restoredEditsCount > 0 && (
                    <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center gap-1.5 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Đã áp dụng {restoredEditsCount} câu bạn chỉnh sửa
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
                <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                  <button
                    onClick={() => setIsReviewModalOpen(true)}
                    className="flex items-center justify-center space-x-2 px-6 py-3.5 rounded-full bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 text-slate-300" />
                    <span>DUYỆT &amp; CHỈNH SỬA SLIDE</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center justify-center space-x-3 px-8 py-3.5 rounded-full bg-[#E60023] hover:bg-[#CC001F] text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isDownloading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Đang tạo và tải file...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        <span>TẢI FILE PPTX ĐÃ DỊCH</span>
                      </>
                    )}
                  </button>
                </div>
                <span className="text-[11px] text-slate-500 text-center sm:text-right">
                  Định dạng chuẩn Microsoft PowerPoint (.pptx)
                </span>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsReviewModalOpen(true)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-slate-600" />
                  <span>Duyệt Song Ngữ &amp; Chỉnh Sửa Trực Tiếp</span>
                </button>

                <button
                  onClick={handleReset}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dịch File Khác</span>
                </button>

                <button
                  onClick={handleExportJson}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                  title="Tải văn bản song ngữ dự phòng dạng JSON"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Xuất Dữ Liệu (.json)</span>
                </button>
              </div>

              {stats.markitdownMarkdown && (
                <button
                  onClick={() => setShowMarkdown((prev) => !prev)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Cấu trúc MS MarkItDown</span>
                  {showMarkdown ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Tổng số Slide
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-slate-900">{stats.totalSlides}</span>
                <span className="text-xs text-slate-500">slides</span>
              </div>
              <p className="text-[10px] text-slate-400">Bảo toàn thứ tự &amp; layout</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Đoạn văn đã dịch
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-slate-900">{stats.totalParagraphs}</span>
                <span className="text-xs text-slate-500">đoạn</span>
              </div>
              <p className="text-[10px] text-slate-400">{stats.totalWords} từ • 100% VI ➔ EN</p>
            </div>

            <div className="bg-white border border-emerald-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-1 bg-emerald-50/20">
              <span className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Hình ảnh bảo mật
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-emerald-800">
                  {stats.totalImagesProtected}
                </span>
                <span className="text-xs text-emerald-700">ảnh (0 gửi AI)</span>
              </div>
              <p className="text-[10px] text-emerald-600/80">Image Shield kích hoạt</p>
            </div>

            <div className="bg-white border border-rose-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-1 bg-rose-50/20">
              <span className="text-[11px] uppercase tracking-wider text-[#E60023] font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#E60023]" />
                Sơ đồ &amp; Đồ họa
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-[#E60023]">100%</span>
                <span className="text-xs text-rose-600">nguyên gốc</span>
              </div>
              <p className="text-[10px] text-rose-600/80">Shape, connector &amp; format chuẩn</p>
            </div>
          </div>

          {/* Post-Flight QA Compliance Audit Report */}
          {qaReport && <QaAuditWidget report={qaReport} />}

          {/* Unmapped Terminology & AI Review Suggestions Card */}
          {unmappedTerms && unmappedTerms.length > 0 && (
            <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-[#E60023] flex items-center justify-center shrink-0">
                      <BookMarked className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <span>Đề Xuất Thuật Ngữ Chưa Có Trong Glossary Review</span>
                        <span className="bg-rose-50 text-[#E60023] border border-rose-200 text-xs font-semibold px-2.5 py-0.5 rounded-full font-mono">
                          {unmappedTerms.length} thuật ngữ
                        </span>
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                    Hệ thống tự động phát hiện các từ chuyên ngành giày/SOP xuất hiện trong slide nhưng chưa có trong <b className="text-slate-700">Glossary Review</b>. Dưới đây là vị trí cụ thể và các phương án dịch gợi ý để bạn xem xét và lưu trực tiếp vào cơ sở dữ liệu.
                  </p>
                </div>

                {/* Batch Action */}
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={handleBatchAddAll}
                    disabled={isBatchAdding || unmappedTerms.every((item) => addedTermIds.has(item.id))}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-[#E60023] hover:bg-[#CC001F] text-white font-bold text-xs shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isBatchAdding ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : unmappedTerms.every((item) => addedTermIds.has(item.id)) ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>Đã gửi tất cả vào Chờ duyệt</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-rose-200" />
                        <span>Gửi tất cả vào Chờ duyệt ({unmappedTerms.filter((item) => !addedTermIds.has(item.id)).length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Batch Success Toast */}
              {batchAddSuccessMessage && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{batchAddSuccessMessage}</span>
                  </div>
                  <button
                    onClick={() => setBatchAddSuccessMessage(null)}
                    className="text-emerald-600 hover:text-emerald-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={unmappedSearch}
                      onChange={(e) => setUnmappedSearch(e.target.value)}
                      placeholder="Tìm thuật ngữ hoặc ngữ cảnh..."
                      className="w-full bg-white border border-slate-200 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs">
                    <span className="text-slate-500 text-[11px] font-medium">Slide:</span>
                    <select
                      value={unmappedSlideFilter}
                      onChange={(e) => setUnmappedSlideFilter(e.target.value)}
                      className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer shadow-2xs"
                    >
                      <option value="all">Tất cả ({unmappedTerms.length})</option>
                      {slideNumbers.map((sNum) => (
                        <option key={sNum} value={sNum.toString()}>
                          Slide {sNum}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs">
                    <span className="text-slate-500 text-[11px] font-medium">Phân loại:</span>
                    <select
                      value={unmappedCategoryFilter}
                      onChange={(e) => setUnmappedCategoryFilter(e.target.value)}
                      className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer shadow-2xs"
                    >
                      <option value="all">Tất cả phân loại</option>
                      <option value="Bộ vị (Component)">Bộ vị (Component)</option>
                      <option value="Quy trình (Process)">Quy trình (Process)</option>
                      <option value="Lỗi chất lượng (CTQ Defect)">Lỗi chất lượng (CTQ Defect)</option>
                      <option value="Vật liệu & Thông số (Material/Spec)">Vật liệu &amp; Thông số</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Terms Cards */}
              <div className="grid grid-cols-1 gap-4">
                {filteredUnmappedTerms.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-slate-200">
                    Không tìm thấy thuật ngữ nào phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  filteredUnmappedTerms.map((item) => {
                    const isAdded = addedTermIds.has(item.id);
                    const isSaving = savingTermId === item.id;
                    const chosenTarget =
                      selectedOptionsMap[item.id] ||
                      item.suggestedOptions[0]?.targetTerm ||
                      item.currentTranslation;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                          isAdded
                            ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                            : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
                        }`}
                      >
                        {/* Header Badges */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold font-mono text-[11px]">
                              Slide {item.slideIndex}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px]">
                              Phần: {item.section}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[#E60023] font-medium text-[10px]">
                              {item.category}
                            </span>
                          </div>

                          {isAdded && (
                            <span className="inline-flex items-center space-x-1 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Đã lưu vào Glossary Review</span>
                            </span>
                          )}
                        </div>

                        {/* Content grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                          {/* Left: Term & Context */}
                          <div className="lg:col-span-5 space-y-2">
                            <div>
                              <span className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider block">
                                Thuật ngữ gốc (VI):
                              </span>
                              <span className="text-sm font-bold text-slate-900 tracking-wide">
                                {item.sourceTerm}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                              <span className="text-slate-400 font-mono not-italic mr-1">Ngữ cảnh:</span>
                              &ldquo;{item.contextSnippet}&rdquo;
                            </div>

                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-[11px] text-slate-500">Đang dịch trong slide:</span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[11px] border border-slate-200">
                                {item.currentTranslation}
                              </span>
                            </div>
                          </div>

                          {/* Right: Suggested Options & Action */}
                          <div className="lg:col-span-7 space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                            <div>
                              <span className="text-[11px] text-slate-700 font-semibold flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-[#E60023]" />
                                <span>Gợi ý phương án dịch chuẩn SOP (chọn hoặc chỉnh sửa):</span>
                              </span>

                              {/* Option Pills */}
                              <div className="flex flex-wrap gap-2">
                                {item.suggestedOptions.map((opt, oIdx) => {
                                  const isSelected = chosenTarget.toLowerCase() === opt.targetTerm.toLowerCase();
                                  return (
                                    <button
                                      key={oIdx}
                                      type="button"
                                      onClick={() => handleSelectOption(item.id, opt.targetTerm)}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                        isSelected
                                          ? "bg-slate-900 border-slate-900 text-white shadow-2xs"
                                          : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                                      }`}
                                    >
                                      <span>{opt.targetTerm}</span>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                                          isSelected
                                            ? "bg-slate-700 text-slate-200"
                                            : opt.isRecommended
                                            ? "bg-rose-50 text-[#E60023]"
                                            : "bg-slate-100 text-slate-500"
                                        }`}
                                      >
                                        {opt.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Custom Edit & Save Action */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <div className="flex-1 min-w-[200px]">
                                <input
                                  type="text"
                                  value={chosenTarget}
                                  onChange={(e) => handleSelectOption(item.id, e.target.value)}
                                  placeholder="Nhập hoặc chỉnh sửa bản dịch tiếng Anh..."
                                  className="w-full bg-white border border-slate-300 rounded-full px-3.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-slate-900 font-mono shadow-2xs"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSaveToGlossary(item)}
                                disabled={isSaving || isAdded}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer ${
                                  isAdded
                                    ? "bg-emerald-50 border border-emerald-300 text-emerald-800 opacity-90 cursor-default"
                                    : "bg-slate-900 hover:bg-black text-white"
                                }`}
                              >
                                {isSaving ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang lưu...</span>
                                  </>
                                ) : isAdded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Đã gửi vào Chờ duyệt</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Gửi vào Chờ duyệt</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Optional MS MarkItDown Accordion View */}
          {showMarkdown && stats.markitdownMarkdown && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Cấu trúc Markdown trích xuất bởi Microsoft MarkItDown
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(stats.markitdownMarkdown || "", "markitdown_all")}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 transition-colors cursor-pointer"
                >
                  {copiedId === "markitdown_all" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Sao chép Markdown</span>
                </button>
              </div>
              <pre className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                {stats.markitdownMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Interactive Slide Reviewer & In-line Editor Modal */}
      <SlideReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        slides={slides}
        onSaveSlides={handleSaveSlides}
        onUpdateSlides={(updated) => {
          setSlides(updated);
          const stored = getUserSlideEdits(file?.name);
          saveUserSlideEdits(
            file?.name,
            stored?.paragraphEdits || {},
            updated,
            stored?.initialAiTranslations,
            sessionId,
            stats
          );
        }}
        fileName={file?.name}
        isSaving={isSavingCustomSlides}
      />

      {/* Translation Memory Drawer */}
      <TranslationMemoryDrawer
        isOpen={isTmDrawerOpen}
        onClose={() => setIsTmDrawerOpen(false)}
      />

      {/* Smart Translation Audit Gap Modal */}
      <SmartAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        auditReport={auditReport}
        file={file}
        onApplySuggestions={applyAuditSuggestions}
        onTranslateMissingOnly={(selectedUnitIds, customTranslations, viOptions) => {
          setIsAuditModalOpen(false);
          executeAction("translate", {
            translateMissingOnly: true,
            selectedUnitIds,
            customTranslations,
            viRefAction: viOptions?.viHandlingMode,
            slideViHandling: viOptions?.slideViHandling,
          });
        }}
        onTranslateAll={() => {
          setIsAuditModalOpen(false);
          executeAction("translate");
        }}
        isLoading={isProcessing || isAuditing}
      />
    </div>
  );
};
