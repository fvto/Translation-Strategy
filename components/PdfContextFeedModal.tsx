"use client";

import React, { useState, useRef } from "react";
import {
  FileText,
  ShieldCheck,
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  BookOpen,
  Check,
  RefreshCw,
  Plus,
} from "lucide-react";

interface PdfCandidateTerm {
  sourceTerm: string;
  targetTerm: string;
  category: string;
  context: string;
  definition: string;
  page: number;
}

interface PdfFeedResultData {
  fileName: string;
  totalPages: number;
  totalCharacters: number;
  imageShieldActive: boolean;
  imagesExtracted: number;
  extractedTermsCount: number;
  candidateTerms: PdfCandidateTerm[];
  contextSummary: string;
}

interface PdfContextFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTermsAdded?: () => void;
}

export const PdfContextFeedModal: React.FC<PdfContextFeedModalProps> = ({
  isOpen,
  onClose,
  onTermsAdded,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [defaultStage, setDefaultStage] = useState<string>("Assembly");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedResult, setFeedResult] = useState<PdfFeedResultData | null>(null);
  const [selectedTerms, setSelectedTerms] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Vui lòng chọn file định dạng PDF (.pdf)");
      return;
    }
    setFile(selectedFile);
    setErrorMsg(null);
    setFeedResult(null);
    setSelectedTerms(new Set());
    setSaveSuccessMsg(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleExtractContext = async () => {
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setFeedResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("defaultStage", defaultStage);
    formData.append("autoSave", "false"); // We let user preview and select

    try {
      const res = await fetch("/api/glossary/feed-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể nạp ngữ cảnh từ file PDF");
      }

      setFeedResult(data);
      // Select all candidates by default
      const allIdxs = new Set<number>();
      data.candidateTerms.forEach((_: any, idx: number) => allIdxs.add(idx));
      setSelectedTerms(allIdxs);
    } catch (err: any) {
      setErrorMsg(err.message || "Đã xảy ra lỗi khi trích xuất PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleTermSelection = (idx: number) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleSaveToReview = async () => {
    if (!feedResult || selectedTerms.size === 0) return;

    setIsSaving(true);
    setErrorMsg(null);

    const chosenTerms = feedResult.candidateTerms.filter((_, idx) => selectedTerms.has(idx));
    let count = 0;

    try {
      for (const item of chosenTerms) {
        const res = await fetch("/api/glossary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTerm: item.sourceTerm.trim(),
            targetTerm: item.targetTerm.trim(),
            sourceLanguage: "vi",
            targetLanguage: "en",
            category: item.category || defaultStage,
            context: item.context,
            definition: item.definition || `Trích xuất ngữ cảnh PDF: ${feedResult.fileName}`,
            status: "review", // STRICT RULE: All terms from files must enter "review" status
          }),
        });

        if (res.ok) count++;
      }

      setSaveSuccessMsg(`Đã gửi ${count} thuật ngữ vào danh sách Chờ duyệt (Review)!`);
      onTermsAdded?.();
      setTimeout(() => {
        setSaveSuccessMsg(null);
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMsg("Lỗi khi lưu thuật ngữ: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b101d] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-red-600/10 border border-red-500/30 rounded-xl text-red-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Nạp Ngữ Cảnh PDF Cho Glossary
                </h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Zero-Image Shield
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Đọc văn bản kỹ thuật số SOP/Spec từ tài liệu PDF để phát hiện thuật ngữ &amp; ngữ cảnh.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Alert Banner */}
        <div className="px-4 sm:px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40 flex items-center justify-between gap-3 text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <b>Bảo Mật Tuyệt Đối (Image Shield)</b>: Hệ thống chỉ đọc lớp văn bản số (digital text). Tuyệt đối <b>không quét, không chụp, không OCR và không lưu trữ hình ảnh</b> từ tài liệu.
            </span>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
            0 hình ảnh trích xuất
          </span>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Controls: Stage Selector & File Dropzone */}
          {!feedResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-xs font-semibold text-slate-300">
                  Công đoạn sản xuất mặc định (Category):
                </label>
                <select
                  value={defaultStage}
                  onChange={(e) => setDefaultStage(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-amber-300 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Assembly">Assembly (Gò ráp / Hoàn thiện)</option>
                  <option value="Stitching">Stitching (May mũi/vamp/collar)</option>
                  <option value="Stockfit">Stockfit (Chuẩn bị đế/midsole/outsole)</option>
                  <option value="Cutting">Cutting (Chặt liệu/khuôn dao)</option>
                  <option value="QA/QC">QA/QC (Kiểm định chất lượng/CTQ)</option>
                  <option value="General">General (Chung)</option>
                </select>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${
                  file
                    ? "border-red-500/50 bg-red-950/10"
                    : "border-slate-800 hover:border-red-500/50 bg-slate-900/40 hover:bg-slate-900/80"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                <div className="p-3.5 rounded-2xl bg-red-500/10 text-red-400 mb-2 shadow-inner">
                  <UploadCloud className="w-8 h-8" />
                </div>
                {file ? (
                  <div className="text-center">
                    <span className="text-sm font-bold text-white">{file.name}</span>
                    <p className="text-xs text-slate-400 mt-1">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Nhấp để đổi file khác
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <span className="text-sm font-semibold text-slate-200">
                      Kéo thả file PDF vào đây hoặc bấm để chọn file
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      Hỗ trợ tài liệu SOP, Tech Spec, Bảng tiêu chuẩn kiểm định định dạng .pdf
                    </p>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleExtractContext}
                  disabled={!file || isProcessing}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Đọc Lớp Văn Bản Số (0 Ảnh)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Trích Xuất Ngữ Cảnh &amp; Thuật Ngữ</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Results View */}
          {feedResult && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Summary Metrics Banner */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-white text-sm block">
                      {feedResult.fileName}
                    </span>
                    <p className="text-slate-400 text-[11px]">
                      {feedResult.contextSummary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 font-mono">
                  <span className="px-3 py-1 bg-slate-950 rounded-lg text-emerald-400 border border-slate-800">
                    {feedResult.totalPages} Trang
                  </span>
                  <span className="px-3 py-1 bg-slate-950 rounded-lg text-blue-400 border border-slate-800">
                    {feedResult.extractedTermsCount} Thuật ngữ phát hiện
                  </span>
                </div>
              </div>

              {saveSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Terms Table */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-semibold">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedTerms.size === feedResult.candidateTerms.length && feedResult.candidateTerms.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const all = new Set<number>();
                          feedResult.candidateTerms.forEach((_, i) => all.add(i));
                          setSelectedTerms(all);
                        } else {
                          setSelectedTerms(new Set());
                        }
                      }}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Chọn tất cả ({selectedTerms.size}/{feedResult.candidateTerms.length})</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Tất cả thuật ngữ sẽ được thêm vào danh sách &quot;Chờ duyệt&quot;
                  </span>
                </div>

                <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-800/60 text-xs">
                  {feedResult.candidateTerms.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Không tìm thấy thuật ngữ chuyên ngành mới nào chưa có trong Glossary.
                    </div>
                  ) : (
                    feedResult.candidateTerms.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleTermSelection(idx)}
                        className={`p-3.5 flex items-start space-x-3 transition-colors cursor-pointer ${
                          selectedTerms.has(idx)
                            ? "bg-blue-950/20 hover:bg-blue-950/30"
                            : "hover:bg-slate-900/40 opacity-70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTerms.has(idx)}
                          onChange={() => {}} // handled by parent onClick
                          className="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">{item.sourceTerm}</span>
                            <span className="text-slate-500">➔</span>
                            <span className="font-semibold text-emerald-400">{item.targetTerm}</span>
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
                              {item.category}
                            </span>
                            <span className="bg-blue-500/10 text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              Trang {item.page}
                            </span>
                          </div>
                          {item.context && (
                            <p className="text-[11px] text-slate-400 line-clamp-2 italic font-sans">
                              &ldquo;{item.context}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFeedResult(null);
                    setFile(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Nạp File PDF Khác
                </button>

                <button
                  type="button"
                  onClick={handleSaveToReview}
                  disabled={selectedTerms.size === 0 || isSaving}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Gửi Vào Chờ Duyệt...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Gửi {selectedTerms.size} Thuật Ngữ Vào Chờ Duyệt (Review)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
