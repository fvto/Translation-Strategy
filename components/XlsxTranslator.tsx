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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              Excel, rõ từng ô.
            </h1>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Giữ công thức
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dịch nội dung bảng tính, giữ công thức, ô gộp và định dạng gốc.
          </p>
        </div>

        {/* Engine Provider Selector */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500 font-medium">Engine AI:</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isTranslating}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-full px-3 py-1.5 focus:outline-none cursor-pointer font-semibold shadow-2xs"
          >
            <option value="gemini" className="bg-white text-slate-900">Google AI Studio (Gemini)</option>
            <option value="google_translate" className="bg-white text-slate-900">Google NMT</option>
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
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
              file
                ? "border-emerald-300 bg-emerald-50/40"
                : "border-slate-300 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-50"
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
                  file ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-[#E60023]"
                }`}
              >
                {file ? <FileCheck2 className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
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
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Chế Độ Định Dạng Bản Dịch
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMode("bilingual_columns")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  mode === "bilingual_columns"
                    ? "border-2 border-slate-900 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Columns className="w-5 h-5 text-emerald-600" />
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                    Khuyến nghị
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900">Chèn Cột Song Ngữ</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Tự động chèn cột tiếng Anh kế bên cột gốc tiếng Việt. Phù hợp bảng in chuyền may & gò.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("replace_en")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  mode === "replace_en"
                    ? "border-2 border-slate-900 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-xs font-bold text-slate-900">Thay Thế (100% EN)</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Thay thế toàn bộ chữ tiếng Việt thành tiếng Anh chuẩn SOP, giữ nguyên công thức.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("bilingual_sheets")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  mode === "bilingual_sheets"
                    ? "border-2 border-slate-900 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Layers className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-xs font-bold text-slate-900">Nhân Bản Sheet Song Ngữ</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Tạo 2 sheet song song: 1 Sheet Tiếng Việt (VI) và 1 Sheet Tiếng Anh (EN).
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Action & Summary */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-600" />
              Quy Trình Kiểm Tra Kỹ Thuật
            </h3>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800">Từ điển 936 thuật ngữ chuẩn:</strong> Áp dụng chính xác từ vựng SOP Ching Luh & Nike.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800">Bảo vệ công thức:</strong> Tự động điều chỉnh tọa độ tham chiếu khi chèn thêm cột.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800">Bỏ qua mã code/số:</strong> Không dịch nhầm mã part, mã PO, số lượng, ngày tháng.
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleTranslate}
              disabled={!file || isTranslating}
              className={`w-full py-3.5 rounded-full font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                !file || isTranslating
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#E60023] hover:bg-[#CC001F] text-white shadow-sm"
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
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-700 font-medium flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-[#E60023] animate-spin" />
              {progress.message}
            </span>
            <span className="font-mono text-[#E60023] font-bold">{progress.percent}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#E60023] h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Result Section */}
      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {/* Download & Stats Banner */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Dịch Bảng Tính Thành Công!</h3>
              </div>
              <p className="text-xs text-slate-500">
                File: <span className="font-semibold text-slate-800">{result.fileName}</span> • Bảo toàn trọn vẹn cấu trúc và công thức.
              </p>
            </div>

            <a
              href={result.downloadUrl}
              download
              className="px-7 py-3.5 bg-[#E60023] hover:bg-[#CC001F] text-white font-bold text-xs rounded-full shadow-md flex items-center gap-2 transition-all cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Tải File Excel Đã Dịch (.xlsx)</span>
            </a>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Số Sheet</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{result.stats.totalSheets}</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Ô Đã Dịch</span>
              <p className="text-xl font-bold text-emerald-700 mt-1">{result.stats.translatedCells}</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Công Thức Bảo Toàn</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{result.stats.formulasPreserved}</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Cột Song Ngữ Tạo Mới</span>
              <p className="text-xl font-bold text-[#E60023] mt-1">{result.stats.columnsInserted || 0}</p>
            </div>
          </div>

          {/* Sample Preview Table */}
          {result.sampleTranslations && result.sampleTranslations.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-600" />
                  Xem Trước Các Ô Đã Dịch Mẫu ({result.sampleTranslations.length} ô)
                </h4>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Vị Trí Ô</th>
                      <th className="px-4 py-2.5 font-bold">Sheet</th>
                      <th className="px-4 py-2.5 font-bold">Nội Dung Tiếng Việt</th>
                      <th className="px-4 py-2.5 font-bold">Bản Dịch Tiếng Anh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {result.sampleTranslations.map((sample, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-emerald-700 font-bold">{sample.cellAddress}</td>
                        <td className="px-4 py-2.5 text-slate-500">{sample.sheetName}</td>
                        <td className="px-4 py-2.5 text-slate-900 font-medium">{sample.originalText}</td>
                        <td className="px-4 py-2.5 text-slate-900 font-semibold">{sample.translatedText}</td>
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
