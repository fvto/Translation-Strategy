"use client";

import React, { useState, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Presentation,
  FileCode,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowUpRight,
} from "lucide-react";

interface DocumentRecord {
  id: string;
  fileName: string;
  fileType: "xlsx" | "docx" | "pptx" | "pdf";
  classification: "internal" | "confidential" | "highly_confidential";
  retentionPolicy: "delete_immediately" | "persist_until_manual";
  termCount: number;
  status: "processed" | "deleted";
  createdAt: string;
}

interface DocumentManagerProps {
  onNavigateToGlossary: () => void;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({ onNavigateToGlossary }) => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [classification, setClassification] = useState<"internal" | "confidential" | "highly_confidential">("confidential");
  const [retentionPolicy, setRetentionPolicy] = useState<"delete_immediately" | "persist_until_manual">("delete_immediately");
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("classification", classification);
    formData.append("retentionPolicy", retentionPolicy);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText || "Invalid JSON response"}`);
      }

      if (!res.ok) {
        alert(data.error || "Tải lên hoặc xử lý tệp thất bại.");
        return;
      }

      setUploadResult(
        `Đã tải lên và trích xuất thành công "${file.name}". Tìm thấy ${data.extractedTermsCount} thuật ngữ đang chờ duyệt.`
      );
      fetchDocuments();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        alert(
          "Lỗi kết nối tới máy chủ (Failed to fetch).\n\n" +
          "• Máy chủ đang chạy tại: http://localhost:3000 và proxy tại http://localhost:3001.\n" +
          "• Hệ thống đã tự động kết nối lại. Vui lòng bấm OK và chọn tệp để tải lại."
        );
      } else {
        alert("Lỗi tải tệp: " + msg);
      }
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document record and any associated storage?")) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } else {
        alert("Failed to delete document");
      }
    } catch (e: any) {
      alert("Delete error: " + e.message);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "xlsx":
        return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
      case "docx":
        return <FileText className="w-5 h-5 text-blue-400" />;
      case "pptx":
        return <Presentation className="w-5 h-5 text-amber-400" />;
      case "pdf":
        return <FileCode className="w-5 h-5 text-rose-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy Notice Banner */}
      <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-800/40 text-blue-200 flex items-start space-x-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-white">
            Zero-Leak Local Document Ingestion
          </span>
          <p className="text-blue-200/80">
            Uploaded files are stored strictly in protected server-side storage outside any public web paths. With the default &quot;Delete after processing&quot; policy, documents are parsed in temporary memory, terms are extracted for review, and the source file is immediately shredded from disk.
          </p>
        </div>
      </div>

      {/* Upload Box */}
      <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Ingest Reference Terminology Files
            </h2>
            <p className="text-xs text-slate-400">
              Supported formats: .XLSX / .XLS / .CSV (Excel), .DOCX (Word), .PPTX (PowerPoint), .PDF (Text/Scanned)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Classification */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Classification:</span>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as any)}
                className="bg-transparent text-blue-400 font-semibold focus:outline-none cursor-pointer capitalize"
              >
                <option value="internal" className="bg-slate-900 text-slate-200">Internal</option>
                <option value="confidential" className="bg-slate-900 text-slate-200">Confidential</option>
                <option value="highly_confidential" className="bg-slate-900 text-slate-200">Highly Confidential</option>
              </select>
            </div>

            {/* Retention */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Retention:</span>
              <select
                value={retentionPolicy}
                onChange={(e) => setRetentionPolicy(e.target.value as any)}
                className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="delete_immediately" className="bg-slate-900 text-slate-200">Delete after processing</option>
                <option value="persist_until_manual" className="bg-slate-900 text-slate-200">Keep until manually deleted</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dropzone Area */}
        <label className="relative border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950/50 hover:bg-slate-950/80 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.docx,.pptx,.pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
          <div className="p-3 rounded-full bg-blue-900/20 group-hover:bg-blue-900/30 text-blue-400 mb-3 transition-colors">
            {isUploading ? (
              <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
            ) : (
              <UploadCloud className="w-8 h-8" />
            )}
          </div>
          <span className="text-sm font-semibold text-white group-hover:text-blue-300">
            {isUploading ? "Extracting document structure & terminology..." : "Click or drag document to ingest"}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Max 25MB. Files are verified by binary signature (magic bytes).
          </span>
        </label>

        {uploadResult && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{uploadResult}</span>
            </div>
            <button
              onClick={onNavigateToGlossary}
              className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-200 font-semibold underline underline-offset-2 ml-4 shrink-0"
            >
              <span>Review in Glossary</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Ingested Documents List */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm text-white">
              Ingested Documents History
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {documents.length} recorded
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-slate-600" />
            <p>No reference documents ingested yet.</p>
            <p className="text-slate-600">Upload a policy or glossary file above to extract terminology pairs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Document Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3">Terms Extracted</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-white flex items-center space-x-3">
                      {getFileIcon(doc.fileType)}
                      <span className="truncate max-w-xs">{doc.fileName}</span>
                    </td>
                    <td className="px-4 py-3.5 uppercase font-mono text-[11px] text-slate-300">
                      .{doc.fileType}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="badge badge-security text-[10px]">
                        {doc.classification.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {doc.retentionPolicy === "delete_immediately" ? "Shredded" : "Preserved"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-emerald-400 font-mono">
                      {doc.termCount} terms
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Explicit Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
