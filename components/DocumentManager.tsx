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
      <div className="p-4 rounded-3xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start space-x-3 text-xs shadow-2xs">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-blue-950">
            Zero-Leak Local Document Ingestion
          </span>
          <p className="text-blue-800/80 leading-relaxed">
            Uploaded files are stored strictly in protected server-side storage outside any public web paths. With the default &quot;Delete after processing&quot; policy, documents are parsed in temporary memory, terms are extracted for review, and the source file is immediately shredded from disk.
          </p>
        </div>
      </div>

      {/* Upload Box */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Ingest Reference Terminology Files
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Supported formats: .XLSX / .XLS / .CSV (Excel), .DOCX (Word), .PPTX (PowerPoint), .PDF (Text/Scanned)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Classification */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Classification:</span>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as any)}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer capitalize"
              >
                <option value="internal" className="bg-white text-slate-900">Internal</option>
                <option value="confidential" className="bg-white text-slate-900">Confidential</option>
                <option value="highly_confidential" className="bg-white text-slate-900">Highly Confidential</option>
              </select>
            </div>

            {/* Retention */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Retention:</span>
              <select
                value={retentionPolicy}
                onChange={(e) => setRetentionPolicy(e.target.value as any)}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="delete_immediately" className="bg-white text-slate-900">Delete after processing</option>
                <option value="persist_until_manual" className="bg-white text-slate-900">Keep until manually deleted</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dropzone Area */}
        <label className="relative border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-50 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.docx,.pptx,.pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
          <div className="p-3.5 rounded-2xl bg-rose-50 text-[#E60023] mb-3 transition-colors">
            {isUploading ? (
              <RefreshCw className="w-7 h-7 animate-spin text-[#E60023]" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>
          <span className="text-sm font-semibold text-slate-800 group-hover:text-[#E60023]">
            {isUploading ? "Extracting document structure & terminology..." : "Click or drag document to ingest"}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Max 25MB. Files are verified by binary signature (magic bytes).
          </span>
        </label>

        {uploadResult && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{uploadResult}</span>
            </div>
            <button
              onClick={onNavigateToGlossary}
              className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 font-semibold underline underline-offset-2 ml-4 shrink-0"
            >
              <span>Review in Glossary</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Ingested Documents List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Ingested Documents History
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {documents.length} recorded
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-slate-400" />
            <p className="font-medium text-slate-600">No reference documents ingested yet.</p>
            <p className="text-slate-400">Upload a policy or glossary file above to extract terminology pairs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-slate-900 flex items-center space-x-3">
                      {getFileIcon(doc.fileType)}
                      <span className="truncate max-w-xs font-semibold">{doc.fileName}</span>
                    </td>
                    <td className="px-4 py-3.5 uppercase font-mono text-[11px] text-slate-600">
                      .{doc.fileType}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="badge badge-security text-[10px]">
                        {doc.classification.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {doc.retentionPolicy === "delete_immediately" ? "Shredded" : "Preserved"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-emerald-700 font-mono">
                      {doc.termCount} terms
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
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
