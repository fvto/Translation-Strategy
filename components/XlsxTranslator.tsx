"use client";

import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Table,
  Check,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Columns,
  Layers,
  FileCheck2,
} from "lucide-react";

export function XlsxTranslator() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"bilingual_columns" | "replace_en" | "bilingual_sheets">("bilingual_columns");
  const [provider, setProvider] = useState<string>("gemini");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: "" });
  const [result, setResult] = useState<{
    sessionId: string;
    fileName: string;
    downloadUrl: string;
    stats: {
      totalSheets: number;
      totalRows: number;
      totalCells: number;
      translatedCells: number;
      formulasPreserved: number;
      columnsInserted?: number;
      sheetsDuplicated?: number;
    };
    sampleTranslations?: Array<{
      sheetName: string;
      cellAddress: string;
      originalText: string;
      translatedText: string;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.toLowerCase().endsWith(".xlsx")) {
        setError("Chỉ hỗ trợ file Excel (.xlsx).");
        return;
      }
      setFile(selected);
      setError(null);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (!selected.name.toLowerCase().endsWith(".xlsx")) {
        setError("Chỉ hỗ trợ file Excel (.xlsx).");
        return;
      }
      setFile(selected);
      setError(null);
      setResult(null);
    }
  };

  const handleTranslate = async () => {
    if (!file) return;

    setIsTranslating(true);
    setError(null);
    setProgress({ percent: 10, message: "Đang tải tệp Excel lên máy chủ..." });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      formData.append("provider", provider);
      formData.append("sourceLanguage", "vi");
      formData.append("targetLanguage", "en");

      const response = await fetch("/api/documents/translate-xlsx?stream=true", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errMsg = "Dịch thất bại.";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error("Không nhận được dữ liệu phản hồi.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const match = block.match(/event: (.*)\ndata: (.*)/s);
          if (!match) continue;

          const [, event, dataStr] = match;
          const data = JSON.parse(dataStr);

          if (event === "progress") {
            setProgress({
              percent: data.percent || 10,
              message: data.message || "Đang xử lý...",
            });
          } else if (event === "complete") {
            setResult(data);
            setIsTranslating(false);
            setProgress({ percent: 100, message: "Hoàn tất dịch file Excel!" });
          } else if (event === "error") {
            throw new Error(data.error || "Quá trình dịch bị lỗi.");
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Đã xảy ra lỗi trong quá trình dịch.");
      setIsTranslating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              Dịch Bảng Tính Excel (Tech Pack, BOM, IPQC)
            </h1>
            <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Formula Protected
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Bảo toàn 100% công thức (=SUM, =VLOOKUP), bảng gộp cell và định dạng kỹ thuật nhà máy Ching Luh.
          </p>
        </div>

        {/* Engine Provider Selector */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Engine AI:</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isTranslating}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="gemini">Google Gemini (Khuyến nghị)</option>
            <option value="ctranslate2">CTranslate2 Offline (NLLB-200)</option>
            <option value="google_translate">Google Translate CAT</option>
            <option value="antigravity_cli">Antigravity CLI (agy)</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Upload & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Dropzone & File Status */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
              file
                ? "border-emerald-500/50 bg-emerald-950/10"
                : "border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div
                className={`p-4 rounded-2xl ${
                  file ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-600/10 text-blue-400"
                }`}
              >
                {file ? <FileCheck2 className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {file ? file.name : "Kéo thả file Excel (.xlsx) vào đây hoặc bấm để chọn tệp"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB • Sẵn sàng xử lý`
                    : "Hỗ trợ Tech Pack, BOM, Bảng kiểm tra IPQC/ISQ, Bảng thông số đo"}
                </p>
              </div>
            </div>
          </div>

          {/* Translation Mode Selection Cards */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Chế Độ Định Dạng Bản Dịch
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMode("bilingual_columns")}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mode === "bilingual_columns"
                    ? "border-emerald-500 bg-emerald-950/30 text-white shadow-lg shadow-emerald-950/20"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Columns className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                    Khuyến nghị
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-200">Chèn Cột Song Ngữ</div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Tự động chèn cột tiếng Anh kế bên cột gốc tiếng Việt. Phù hợp bảng in chuyền may & gò.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("replace_en")}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mode === "replace_en"
                    ? "border-blue-500 bg-blue-950/30 text-white shadow-lg shadow-blue-950/20"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-xs font-semibold text-slate-200">Thay Thế (100% EN)</div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Thay thế toàn bộ chữ tiếng Việt thành tiếng Anh chuẩn SOP, giữ nguyên công thức.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("bilingual_sheets")}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mode === "bilingual_sheets"
                    ? "border-amber-500 bg-amber-950/30 text-white shadow-lg shadow-amber-950/20"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Layers className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-xs font-semibold text-slate-200">Nhân Bản Sheet Song Ngữ</div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Tạo 2 sheet song song: 1 Sheet Tiếng Việt (VI) và 1 Sheet Tiếng Anh (EN).
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Action & Summary */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-400" />
              Quy Trình Kiểm Tra Kỹ Thuật
            </h3>

            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-300">Từ điển 936 thuật ngữ chuẩn:</strong> Áp dụng chính xác từ vựng SOP Ching Luh & Nike.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-300">Bảo vệ công thức:</strong> Tự động điều chỉnh tọa độ tham chiếu khi chèn thêm cột.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-300">Bỏ qua mã code/số:</strong> Không dịch nhầm mã part, mã PO, số lượng, ngày tháng.
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {error && (
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleTranslate}
              disabled={!file || isTranslating}
              className={`w-full py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                !file || isTranslating
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25"
              }`}
            >
              {isTranslating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang Dịch Bảng Tính... ({progress.percent}%)</span>
                </>
              ) : (
                <>
                  <span>Bắt Đầu Dịch File Excel</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Live Progress Bar */}
      {isTranslating && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              {progress.message}
            </span>
            <span className="font-mono text-emerald-400 font-semibold">{progress.percent}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Result Section */}
      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {/* Download & Stats Banner */}
          <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Dịch Bảng Tính Thành Công!</h3>
              </div>
              <p className="text-xs text-slate-300">
                File: <span className="font-semibold text-emerald-300">{result.fileName}</span> • Bảo toàn trọn vẹn cấu trúc và công thức.
              </p>
            </div>

            <a
              href={result.downloadUrl}
              download
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Tải File Excel Đã Dịch (.xlsx)</span>
            </a>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Số Sheet</span>
              <p className="text-xl font-bold text-white mt-1">{result.stats.totalSheets}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Ô Đã Dịch</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">{result.stats.translatedCells}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Công Thức Bảo Toàn</span>
              <p className="text-xl font-bold text-blue-400 mt-1">{result.stats.formulasPreserved}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Cột Song Ngữ Tạo Mới</span>
              <p className="text-xl font-bold text-amber-400 mt-1">{result.stats.columnsInserted || 0}</p>
            </div>
          </div>

          {/* Sample Preview Table */}
          {result.sampleTranslations && result.sampleTranslations.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-400" />
                  Xem Trước Các Ô Đã Dịch Mẫu ({result.sampleTranslations.length} ô)
                </h4>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Vị Trí Ô</th>
                      <th className="px-4 py-2.5 font-semibold">Sheet</th>
                      <th className="px-4 py-2.5 font-semibold">Nội Dung Tiếng Việt</th>
                      <th className="px-4 py-2.5 font-semibold">Bản Dịch Tiếng Anh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {result.sampleTranslations.map((sample, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-emerald-400 font-semibold">{sample.cellAddress}</td>
                        <td className="px-4 py-2.5 text-slate-400">{sample.sheetName}</td>
                        <td className="px-4 py-2.5 text-slate-200">{sample.originalText}</td>
                        <td className="px-4 py-2.5 text-emerald-300 font-medium">{sample.translatedText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
