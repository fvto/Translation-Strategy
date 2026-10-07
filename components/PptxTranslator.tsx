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
} from "lucide-react";
import { TranslationMemoryDrawer } from "./TranslationMemoryDrawer";
import { SlideReviewModal } from "./SlideReviewModal";
import { SmartAuditModal } from "./SmartAuditModal";
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

  const runSmartAudit = async (selectedFile?: File) => {
    const targetFile = selectedFile || file;
    if (!targetFile) return;

    setIsAuditing(true);
    setAuditReport(null);
    setIsAuditModalOpen(false);
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
        setIsAuditModalOpen(true);
      }
    } catch (e: any) {
      console.error("Smart audit error:", e);
      setErrorMessage(e.message || "Không thể quét PowerPoint.");
    } finally {
      setIsAuditing(false);
    }
  };

  const applyAuditSuggestions = async (unitIds: string[], customTranslations?: Record<string, string>) => {
    if (!file || !auditReport) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", "apply_audit");
    formData.append("sourceLanguage", srcLang);
    formData.append("targetLanguage", tgtLang);
    formData.append("mode", mode);
    formData.append("selectedUnitIds", JSON.stringify(unitIds));
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
    const blob = await response.blob();
    const updatedFile = new File([blob], file.name, { type: file.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name.replace(/\.pptx$/i, "-audited.pptx");
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setFile(updatedFile); setSlides([]); setStats(null); setSessionId(null); setUnmappedTerms([]);
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
    // Proactively scan document gaps on import
    runSmartAudit(selectedFile);
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
    if (options?.translateMissingOnly) {
      formData.append("translateMissingOnly", "true");
      if (options.selectedUnitIds) {
        formData.append("selectedUnitIds", JSON.stringify(options.selectedUnitIds));
      }
      if (options.customTranslations && Object.keys(options.customTranslations).length > 0) {
        formData.append("customTranslations", JSON.stringify(options.customTranslations));
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
                  });
                  setProcessingStatus(payload.message);
                } else if (eventType === "complete") {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 rounded-2xl border border-amber-800/30 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Presentation className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Dịch PowerPoint Chuyên Sâu (AI PPTX Translator)
            </h2>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {langDir === "vi-en" ? "VI ➔ EN" : "EN ➔ VI"}
            </span>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              MS MarkItDown + Gemini 3.5 Flash Lite
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Đọc cấu trúc bài thuyết trình bằng <b>Microsoft MarkItDown</b>, dịch chuẩn xác bằng <b>Google Gemini 3.5 Flash Lite</b> và xuất file PowerPoint <b>giữ nguyên 100% sơ đồ, biểu đồ &amp; bố cục gốc</b>.
          </p>
        </div>

        {/* Security Shield Badge */}
        <div className="flex items-center space-x-3 bg-emerald-950/50 border border-emerald-700/50 px-4 py-2.5 rounded-xl text-xs text-emerald-300 shadow-inner">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>Image &amp; Diagram Shield</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-[11px] text-emerald-300/80">
              0 hình ảnh gửi sang AI • 100% sơ đồ, biểu đồ, hình vẽ và layout được giữ nguyên vẹn
            </div>
          </div>
        </div>
      </div>

      {/* Upload & Engine Controls */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-300">Cấu hình Dịch thuật:</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsTmDrawerOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 hover:text-white border border-slate-800 hover:border-amber-500/50 transition-all text-xs font-semibold cursor-pointer shadow-sm"
              title="Tra cứu các file đã dịch & bộ nhớ câu dịch song ngữ"
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Lịch sử dịch &amp; Bộ nhớ TM</span>
            </button>

            <div className="flex items-center space-x-2 text-xs bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-slate-400">Engine Dịch:</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ctranslate2" className="bg-slate-900 text-cyan-300 font-semibold">
                  🚀 CTranslate2 Offline (NLLB-200 INT8 - 0 Quota)
                </option>
                <option value="antigravity_cli" className="bg-slate-900 text-purple-300 font-semibold">
                  ✨ Antigravity CLI (agy - Footwear QA Engine)
                </option>
                <option value="gemini" className="bg-slate-900 text-slate-200">
                  Google Gemini 3.5 Flash Lite (AI Studio - Khuyên dùng)
                </option>
                <option value="google_translate" className="bg-slate-900 text-slate-200">
                  Google NMT (Thuật ngữ chuẩn CAT)
                </option>
              </select>
            </div>

            <div className="flex items-center space-x-2 text-xs bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-slate-400">Chiều dịch:</span>
              <select
                value={langDir}
                onChange={(e) => setLangDir(e.target.value as "vi-en" | "en-vi")}
                className="bg-transparent text-blue-400 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="vi-en" className="bg-slate-900 text-slate-200">🇻🇳 Tiếng Việt ➔ 🇬🇧 Tiếng Anh</option>
                <option value="en-vi" className="bg-slate-900 text-slate-200">🇬🇧 Tiếng Anh ➔ 🇻🇳 Tiếng Việt</option>
              </select>
            </div>
          </div>
        </div>

        {/* Restore Previous Session Banner */}
        {restoredSession && slides.length === 0 && !isProcessing && (
          <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900 border border-blue-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Phát hiện phiên dịch trước đó:</span>
                  <span className="text-blue-300 font-mono">{restoredSession.fileName}</span>
                  {Object.keys(restoredSession.paragraphEdits || {}).filter((k) => !k.startsWith("text_")).length > 0 && (
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      {Object.keys(restoredSession.paragraphEdits || {}).filter((k) => !k.startsWith("text_")).length} câu bạn đã sửa
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Các câu chỉnh sửa của bạn vẫn được lưu an toàn trong trình duyệt. Bấm khôi phục để xem lại hoặc xuất file PPTX ngay mà không cần dịch lại.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleRestoreSession}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Khôi phục phiên này</span>
              </button>
              <button
                type="button"
                onClick={() => setRestoredSession(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
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
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all ${
            file
              ? "border-amber-500/50 bg-amber-950/10"
              : "border-slate-700 hover:border-amber-500 bg-slate-950/50 hover:bg-slate-950/80"
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
            <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400 shadow-inner">
              <Presentation className="w-8 h-8" />
            </div>
            {file ? (
              <div>
                <span className="text-sm font-bold text-white">{file.name}</span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • Sẵn sàng xử lý
                </span>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-white hover:text-amber-300">
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
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-3.5 shadow-xl shadow-amber-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-amber-300 flex items-center space-x-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>Quy chuẩn dịch &amp; Xuất bản (SOP Translation Strategy):</span>
              </span>
              <span className="text-[11px] text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                Ching Luh SOP Manual
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Unified Ching Luh SOP (IPQC & ISQ Merged) */}
              <button
                type="button"
                onClick={() => setMode("ipqc_bilingual")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  mode === "ipqc_bilingual"
                    ? "bg-amber-500/10 border-amber-500/80 text-white shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      1. Quy chuẩn SOP Ching Luh (Hợp nhất IPQC &amp; ISQ)
                    </span>
                    <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                      Chuẩn Chung • Tự động IPQC &amp; ISQ
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                    <p>
                      • <b>Slide IPQC (Bảng kiểm tra, quy trình):</b> Giữ nguyên 1 slide với <b>Song ngữ EN trên – VI dưới</b> trong từng ô/sơ đồ. Giữ nguyên cột <i>Inspection Item</i> defect codes trên 1 dòng duy nhất.
                    </p>
                    <p>
                      • <b>Slide ISQ (Khuôn dao, trạm CTQ/CTP hoặc file ISQ):</b> Tự động nhân đôi thành <b>1 Slide EN ở trên</b> (xóa tiếng Việt) và <b>1 Slide VI nguyên bản ở ngay dưới</b> liền kề.
                    </p>
                    <p>
                      • <b>Bảo toàn nội dung &amp; Font:</b> Đã có tiếng Anh thì giữ nguyên tiếng Anh, có tiếng Việt giữ nguyên tiếng Việt. Font chữ và font size <b>100% đồng nhất</b> với văn bản gốc.
                    </p>
                  </div>
                </div>
                {mode === "ipqc_bilingual" && (
                  <div className="mt-3 text-[11px] font-bold text-amber-400 flex items-center gap-1">
                    <span>✓ Đang chọn (Mặc định khuyên dùng)</span>
                  </div>
                )}
              </button>

              {/* Option 2: Full EN (Remove VI) */}
              <button
                type="button"
                onClick={() => setMode("replace_en")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  mode === "replace_en"
                    ? "bg-emerald-500/10 border-emerald-500/80 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                      2. Chỉ dịch Full EN (Xóa tiếng Việt)
                    </span>
                    <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                      SOP Slide 8 • 100% English
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
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
                  <div className="mt-3 text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    <span>✓ Đang chọn</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {file && !isProcessing && (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              onClick={() => executeAction("crawl")}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all shadow-md cursor-pointer"
            >
              <Eye className="w-4 h-4 text-blue-400" />
              <span>Chỉ cào cấu trúc slide</span>
            </button>

            <button
              onClick={() => runSmartAudit()}
              disabled={isProcessing || isAuditing}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-600/20 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-sky-200" />
              <span>Smart Audit (Quét phần thiếu)</span>
            </button>

            <button
              onClick={() => executeAction("translate")}
              className="flex items-center space-x-2.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-white text-xs font-bold transition-all shadow-lg shadow-amber-600/30 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>Dịch & Xuất File PowerPoint (.pptx)</span>
            </button>
          </div>
        )}

        {/* Rich Interactive Progress Dashboard */}
        {isProcessing && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-amber-500/30 p-6 shadow-2xl shadow-amber-950/20 space-y-5 animate-in fade-in zoom-in-95 duration-300">
            {/* Top row: Status, Spinner & Percentage */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="relative flex items-center justify-center">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white tracking-wide">
                      Tiến độ dịch PowerPoint ({langDir === "vi-en" ? "VI ➔ EN" : "EN ➔ VI"})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {provider === "antigravity_cli"
                        ? "Antigravity CLI (agy)"
                        : provider === "gemini"
                        ? "Google Gemini Flash"
                        : provider === "google_translate"
                        ? "Google NMT (CAT)"
                        : provider}
                    </span>
                  </div>
                  <p className="text-xs text-amber-300/90 font-medium mt-0.5">
                    {progressInfo?.message || processingStatus}
                  </p>
                </div>
              </div>

              {/* Big bold animated percentage */}
              <div className="text-right shrink-0">
                <div className="text-3xl font-black font-mono tracking-tight bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 bg-clip-text text-transparent">
                  {progressInfo?.percent ?? 10}%
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  {progressInfo?.stage === "extracting" && "Khởi tạo"}
                  {progressInfo?.stage === "crawling" && "Trích xuất"}
                  {progressInfo?.stage === "translating" && "Đang dịch AI"}
                  {progressInfo?.stage === "packaging" && "Đóng gói PPTX"}
                  {progressInfo?.stage === "done" && "Hoàn tất"}
                  {!progressInfo && "Đang xử lý"}
                </span>
              </div>
            </div>

            {/* Glowing animated progress bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-900/90 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 transition-all duration-500 ease-out relative"
                  style={{ width: `${progressInfo?.percent ?? 10}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono px-1">
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
                className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 20
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : progressInfo?.stage === "extracting"
                    ? "bg-amber-950/40 border-amber-500/50 text-amber-300 animate-pulse"
                    : "bg-slate-900/40 border-slate-800 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 20
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-800 text-slate-400"
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
                  <span className="text-[10px] text-slate-400 block truncate">
                    {(progressInfo?.percent ?? 0) >= 20 ? "Đã trích xuất" : "Đang đọc cấu trúc"}
                  </span>
                </div>
              </div>

              {/* Step 2: Image Shield */}
              <div
                className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 25
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-900/40 border-slate-800 text-slate-500"
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">2. Image Shield</span>
                  <span className="text-[10px] text-emerald-400/80 block truncate">0 ảnh gửi AI</span>
                </div>
              </div>

              {/* Step 3: AI Translation */}
              <div
                className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 90
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : progressInfo?.stage === "translating"
                    ? "bg-amber-950/40 border-amber-500/50 text-amber-300 animate-pulse"
                    : "bg-slate-900/40 border-slate-800 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 90
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
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
                  <span className="text-[10px] text-slate-400 block truncate">
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
                className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-2.5 ${
                  (progressInfo?.percent ?? 0) >= 100
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : progressInfo?.stage === "packaging"
                    ? "bg-amber-950/40 border-amber-500/50 text-amber-300 animate-pulse"
                    : "bg-slate-900/40 border-slate-800 text-slate-500"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    (progressInfo?.percent ?? 0) >= 100
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-800 text-slate-400"
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
                  <span className="text-[10px] text-slate-400 block truncate">
                    {(progressInfo?.percent ?? 0) >= 100 ? "Hoàn tất 100%" : "Giữ nguyên layout"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Results & PPTX Direct Export Section */}
      {stats && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Main Hero Card for PPTX Export */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-950/30 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Dịch Thành Công &amp; Sẵn Sàng Xuất File (.pptx)</span>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Hoàn tất 100%
                      </span>
                    </h3>
                  </div>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Toàn bộ văn bản thuyết trình đã được dịch sang Tiếng Anh. Toàn bộ hình ảnh, sơ đồ hình học, biểu đồ và bố cục slide gốc được bảo tồn nguyên vẹn 100%.
                </p>

                {/* Target File Info */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                  <span className="px-3 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                    <Presentation className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-400">Gốc:</span> {file?.name}
                  </span>
                  <span className="text-slate-500">➔</span>
                  <span className="px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 flex items-center gap-1.5 font-semibold">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                    {file ? file.name.replace(/\.pptx$/i, "") : "presentation"}_translated_EN.pptx
                  </span>
                    <span className="px-3 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-400">Thời gian xuất:</span>
                      <span className="text-amber-300">{new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      <span className="text-slate-500">{new Date().toLocaleDateString("vi-VN")}</span>
                    </span>
                    {restoredEditsCount > 0 && (
                      <span className="px-3 py-1 rounded-xl bg-blue-950/80 border border-blue-500/40 text-blue-300 flex items-center gap-1.5 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
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
                    className="flex items-center justify-center space-x-2 px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xl shadow-blue-950/50 hover:shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 text-blue-200" />
                    <span>DUYỆT &amp; CHỈNH SỬA SLIDE</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center justify-center space-x-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm shadow-xl shadow-emerald-950/50 hover:shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 cursor-pointer"
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
                <span className="text-[11px] text-slate-400 text-center sm:text-right">
                  Định dạng chuẩn Microsoft PowerPoint (.pptx)
                </span>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsReviewModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs font-semibold border border-blue-500/40 transition-all cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>Duyệt Song Ngữ &amp; Chỉnh Sửa Trực Tiếp</span>
                </button>

                <button
                  onClick={handleReset}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dịch File Khác</span>
                </button>

                <button
                  onClick={handleExportJson}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                  title="Tải văn bản song ngữ dự phòng dạng JSON"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Xuất Dữ Liệu (.json)</span>
                </button>
              </div>

              {stats.markitdownMarkdown && (
                <button
                  onClick={() => setShowMarkdown((prev) => !prev)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Cấu trúc MS MarkItDown</span>
                  {showMarkdown ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                Tổng số Slide
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-white">{stats.totalSlides}</span>
                <span className="text-xs text-slate-500">slides</span>
              </div>
              <p className="text-[10px] text-slate-500">Bảo toàn thứ tự &amp; layout</p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                Đoạn văn đã dịch
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-blue-400">{stats.totalParagraphs}</span>
                <span className="text-xs text-slate-500">đoạn</span>
              </div>
              <p className="text-[10px] text-slate-500">{stats.totalWords} từ • 100% VI ➔ EN</p>
            </div>

            <div className="bg-slate-900/80 border border-emerald-900/40 p-4 rounded-2xl shadow-lg space-y-1 bg-emerald-950/10">
              <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Hình ảnh bảo mật
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-emerald-300">
                  {stats.totalImagesProtected}
                </span>
                <span className="text-xs text-emerald-400/80">ảnh (0 gửi AI)</span>
              </div>
              <p className="text-[10px] text-emerald-400/70">Image Shield kích hoạt</p>
            </div>

            <div className="bg-slate-900/80 border border-amber-900/40 p-4 rounded-2xl shadow-lg space-y-1 bg-amber-950/10">
              <span className="text-[11px] uppercase tracking-wider text-amber-400 font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Sơ đồ &amp; Đồ họa
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-amber-300">100%</span>
                <span className="text-xs text-amber-400/80">nguyên gốc</span>
              </div>
              <p className="text-[10px] text-amber-400/70">Shape, connector &amp; format chuẩn</p>
            </div>
          </div>

          {/* Post-Flight QA Compliance Audit Report */}
          {qaReport && <QaAuditWidget report={qaReport} />}

          {/* Unmapped Terminology & AI Review Suggestions Card */}
          {unmappedTerms && unmappedTerms.length > 0 && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/40 p-6 sm:p-8 shadow-2xl shadow-amber-950/20 space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                      <BookMarked className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        <span>Đề Xuất Thuật Ngữ Chưa Có Trong Glossary Review</span>
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold px-2.5 py-0.5 rounded-full font-mono">
                          {unmappedTerms.length} thuật ngữ
                        </span>
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    Hệ thống tự động phát hiện các từ chuyên ngành giày/SOP xuất hiện trong slide nhưng chưa có trong <b>Glossary Review</b>. Dưới đây là vị trí cụ thể (slide mấy, phần nào) và các phương án dịch gợi ý để bạn xem xét và lưu trực tiếp vào cơ sở dữ liệu.
                  </p>
                </div>

                {/* Batch Action */}
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={handleBatchAddAll}
                    disabled={isBatchAdding || unmappedTerms.every((item) => addedTermIds.has(item.id))}
                    className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold text-xs shadow-lg shadow-amber-600/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isBatchAdding ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : unmappedTerms.every((item) => addedTermIds.has(item.id)) ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Đã gửi tất cả vào Chờ duyệt</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                        <span>Gửi tất cả vào Chờ duyệt ({unmappedTerms.filter((item) => !addedTermIds.has(item.id)).length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Batch Success Toast */}
              {batchAddSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-inner animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{batchAddSuccessMessage}</span>
                  </div>
                  <button
                    onClick={() => setBatchAddSuccessMessage(null)}
                    className="text-emerald-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      value={unmappedSearch}
                      onChange={(e) => setUnmappedSearch(e.target.value)}
                      placeholder="Tìm thuật ngữ hoặc ngữ cảnh..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs">
                    <span className="text-slate-400 text-[11px]">Slide:</span>
                    <select
                      value={unmappedSlideFilter}
                      onChange={(e) => setUnmappedSlideFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-semibold focus:outline-none cursor-pointer"
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
                    <span className="text-slate-400 text-[11px]">Phân loại:</span>
                    <select
                      value={unmappedCategoryFilter}
                      onChange={(e) => setUnmappedCategoryFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-blue-300 font-semibold focus:outline-none cursor-pointer"
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
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-2xl border border-slate-800/80">
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
                            ? "bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/20"
                            : "bg-slate-950/60 border-slate-800/90 hover:border-slate-700"
                        }`}
                      >
                        {/* Header Badges */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold font-mono text-[11px]">
                              Slide {item.slideIndex}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-medium text-[11px]">
                              Phần: {item.section}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-950/50 border border-blue-800/50 text-blue-300 font-medium text-[10px]">
                              {item.category}
                            </span>
                          </div>

                          {isAdded && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Đã lưu vào Glossary Review</span>
                            </span>
                          )}
                        </div>

                        {/* Content grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                          {/* Left: Term & Context */}
                          <div className="lg:col-span-5 space-y-2">
                            <div>
                              <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider block">
                                Thuật ngữ gốc (VI):
                              </span>
                              <span className="text-sm font-bold text-white tracking-wide">
                                {item.sourceTerm}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400 italic bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                              <span className="text-slate-500 font-mono not-italic mr-1">Ngữ cảnh:</span>
                              &ldquo;{item.contextSnippet}&rdquo;
                            </div>

                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-[11px] text-slate-400">Đang dịch trong slide:</span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-blue-300 font-mono text-[11px] border border-slate-800">
                                {item.currentTranslation}
                              </span>
                            </div>
                          </div>

                          {/* Right: Suggested Options & Action */}
                          <div className="lg:col-span-7 space-y-3 bg-slate-900/50 p-3.5 rounded-xl border border-slate-800/80">
                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
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
                                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                        isSelected
                                          ? "bg-amber-500/20 border-amber-500 text-amber-200 ring-1 ring-amber-500/40 shadow-sm"
                                          : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white"
                                      }`}
                                    >
                                      <span>{opt.targetTerm}</span>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded ${
                                          opt.isRecommended
                                            ? "bg-amber-500/30 text-amber-300"
                                            : "bg-slate-800 text-slate-400"
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
                                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSaveToGlossary(item)}
                                disabled={isSaving || isAdded}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md cursor-pointer ${
                                  isAdded
                                    ? "bg-emerald-950 border border-emerald-500/40 text-emerald-300 opacity-90 cursor-default"
                                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                                }`}
                              >
                                {isSaving ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang lưu...</span>
                                  </>
                                ) : isAdded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
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
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white">
                    Cấu trúc Markdown trích xuất bởi Microsoft MarkItDown
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(stats.markitdownMarkdown || "", "markitdown_all")}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                >
                  {copiedId === "markitdown_all" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Sao chép Markdown</span>
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-200 font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
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
        onApplySuggestions={applyAuditSuggestions}
        onTranslateMissingOnly={(selectedUnitIds, customTranslations) => {
          setIsAuditModalOpen(false);
          executeAction("translate", {
            translateMissingOnly: true,
            selectedUnitIds,
            customTranslations,
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
