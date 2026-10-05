"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Search,
  Check,
  X,
  Trash2,
  Plus,
  Filter,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Edit2,
  ArrowUpDown,
  Sparkles,
  Clock,
  Calendar,
  History,
  ArrowLeftRight,
  Download,
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  FileText,
} from "lucide-react";
import { PdfContextFeedModal } from "./PdfContextFeedModal";

interface TermEditChange {
  field: string;
  oldValue?: string;
  newValue?: string;
}

interface TermEditHistoryEntry {
  id: string;
  timestamp: string;
  editedBy: string;
  action: "created" | "updated" | "status_changed" | "auto_harvested";
  changes?: TermEditChange[];
  note?: string;
}

interface TerminologyEntry {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLanguage: string;
  targetLanguage: string;
  definition?: string;
  context?: string;
  category?: string;
  sourceDocument?: string;
  status: "approved" | "review" | "rejected" | "deprecated";
  priority: number;
  confidence?: number;
  approvedBy?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  editHistory?: TermEditHistoryEntry[];
}

const formatTimestamp = (dateStr?: string): string => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatRelativeTime = (dateStr?: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "vừa xong";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "vừa xong";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d trước`;
  return `${Math.floor(diffDay / 30)}mo trước`;
};

interface GlossaryReviewProps {
  currentUserRole: string;
}

export const GlossaryReview: React.FC<GlossaryReviewProps> = ({ currentUserRole }) => {
  const [terms, setTerms] = useState<TerminologyEntry[]>([]);
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [isAddingTerm, setIsAddingTerm] = useState<boolean>(false);
  const [editingTerm, setEditingTerm] = useState<TerminologyEntry | null>(null);
  const [historyTerm, setHistoryTerm] = useState<TerminologyEntry | null>(null);
  const [isPdfFeedModalOpen, setIsPdfFeedModalOpen] = useState<boolean>(false);
  // Fix #12: Pagination to prevent DOM slowdown with large glossaries
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Auto-clear recentlyAdded highlight after 10 seconds
  useEffect(() => {
    if (recentlyAddedId) {
      const timer = setTimeout(() => {
        setRecentlyAddedId(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [recentlyAddedId]);

  // New term form state
  const [newDirection, setNewDirection] = useState<"vi_en" | "en_vi">("vi_en");
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newCategory, setNewCategory] = useState("Corporate");
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [suggestNotice, setSuggestNotice] = useState<string | null>(null);

  // Excel Import / Export States & Handlers
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<{
    totalRead: number;
    importedCount: number;
    skippedDuplicateCount: number;
    skippedInvalidCount: number;
  } | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/glossary/export");
      if (!res.ok) throw new Error("Xuất file Excel thất bại");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ChingLuh_Footwear_Glossary_${terms.length}_terms.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Lỗi xuất Excel: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/glossary/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nhập file Excel thất bại");
      }

      setImportSummary({
        totalRead: data.totalRead,
        importedCount: data.importedCount,
        skippedDuplicateCount: data.skippedDuplicateCount,
        skippedInvalidCount: data.skippedInvalidCount,
      });

      fetchTerms("newest", "all", "");
    } catch (err: any) {
      alert("Lỗi khi nhập Excel: " + err.message);
    } finally {
      setIsImporting(false);
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = "";
      }
    }
  };

  // Swap direction for editing term
  const handleSwapEditingTerm = () => {
    if (!editingTerm) return;
    const newSrc = editingTerm.targetTerm;
    const newTgt = editingTerm.sourceTerm;
    const newSrcLang = editingTerm.targetLanguage || (editingTerm.sourceLanguage === "vi" ? "en" : "vi");
    const newTgtLang = editingTerm.sourceLanguage || (editingTerm.targetLanguage === "en" ? "vi" : "en");
    setEditingTerm({
      ...editingTerm,
      sourceTerm: newSrc,
      targetTerm: newTgt,
      sourceLanguage: newSrcLang,
      targetLanguage: newTgtLang,
    });
  };

  // 1-Click swap term direction directly from table row
  const handleSwapTermDirection = async (id: string) => {
    try {
      const res = await fetch(`/api/glossary/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapDirection: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.term) {
          setTerms((prev) => prev.map((t) => (t.id === id ? data.term : t)));
          if (editingTerm?.id === id) {
            setEditingTerm(data.term);
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Không thể đảo chiều thuật ngữ");
      }
    } catch (e: any) {
      alert("Lỗi đảo chiều: " + e.message);
    }
  };

  const handleSuggestWithAntigravity = async (
    inputText: string,
    contextText: string,
    isEditing: boolean = false
  ) => {
    if (!inputText.trim()) {
      alert("Vui lòng nhập thuật ngữ trước khi yêu cầu Antigravity CLI gợi ý dịch.");
      return;
    }

    setIsSuggesting(true);
    setSuggestNotice(null);

    const sourceLanguage = isEditing
      ? (editingTerm?.sourceLanguage || "vi")
      : (newDirection === "vi_en" ? "vi" : "en");
    const targetLanguage = isEditing
      ? (editingTerm?.targetLanguage || "en")
      : (newDirection === "vi_en" ? "en" : "vi");

    try {
      const res = await fetch("/api/glossary/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTerm: inputText.trim(),
          context: contextText.trim() || undefined,
          sourceLanguage,
          targetLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể lấy gợi ý từ Antigravity CLI");
      }

      if (data.targetTerm) {
        if (!isEditing) {
          setNewTarget(data.targetTerm);
          if (data.category && (!newCategory || newCategory === "Corporate")) {
            setNewCategory(data.category);
          }
        } else if (editingTerm) {
          setEditingTerm({
            ...editingTerm,
            targetTerm: data.targetTerm,
            category: data.category || editingTerm.category,
          });
        }

        if (data.authRequired) {
          setSuggestNotice("💡 Antigravity CLI chưa đăng nhập Google. Hãy mở Terminal và gõ 'agy' để xác thực một lần duy nhất.");
        } else if (data.notes) {
          setSuggestNotice(data.notes);
        } else if (data.provider) {
          setSuggestNotice(`Được gợi ý theo quy chuẩn giày bởi ${data.provider}`);
        }
      }
    } catch (err: any) {
      alert("Lỗi Antigravity CLI: " + err.message);
    } finally {
      setIsSuggesting(false);
    }
  };

  const canApprove = ["admin", "reviewer"].includes(currentUserRole);

  const allSelected = terms.length > 0 && terms.every((t) => selectedTermIds.includes(t.id));
  const isIndeterminate = selectedTermIds.length > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedTermIds([]);
    } else {
      setSelectedTermIds(terms.map((t) => t.id));
    }
  };

  const handleToggleSelectTerm = (id: string) => {
    setSelectedTermIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchStatus = async (status: "approved" | "rejected") => {
    if (selectedTermIds.length === 0) return;
    try {
      const res = await fetch("/api/glossary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedTermIds, status }),
      });
      if (res.ok) {
        setTerms((prev) =>
          prev.map((t) => (selectedTermIds.includes(t.id) ? { ...t, status } : t))
        );
        setSelectedTermIds([]);
      } else {
        alert("Failed to update status in bulk");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedTermIds.length === 0) return;
    if (!confirm(`Delete ${selectedTermIds.length} selected terminology entries?`)) return;
    try {
      const res = await fetch("/api/glossary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedTermIds }),
      });
      if (res.ok) {
        setTerms((prev) => prev.filter((t) => !selectedTermIds.includes(t.id)));
        setSelectedTermIds([]);
      } else {
        alert("Failed to delete selected entries");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const fetchTerms = async (forcedSort?: string, forcedStatus?: string, forcedSearch?: string) => {
    try {
      const activeStatus = forcedStatus !== undefined ? forcedStatus : statusFilter;
      const activeSearch = forcedSearch !== undefined ? forcedSearch : searchQuery;
      const activeSort = forcedSort !== undefined ? forcedSort : sortBy;

      const params = new URLSearchParams();
      if (activeStatus !== "all") params.append("status", activeStatus);
      if (activeSearch) params.append("search", activeSearch);
      if (activeSort) params.append("sortBy", activeSort);
      params.append("_t", Date.now().toString());

      const res = await fetch(`/api/glossary?${params.toString()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (data.terms) {
        setTerms(data.terms);
        setCurrentPage(1); // Fix #12: Reset to first page on filter/search change
      }
    } catch (e) {
      console.error("Failed to fetch terminology:", e);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, [statusFilter, searchQuery, sortBy]);

  const handleUpdateStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/glossary/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setTerms((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t))
        );
      } else {
        alert("Failed to update status");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this terminology entry?")) return;
    try {
      const res = await fetch(`/api/glossary/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTerms((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    }
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.trim() || !newTarget.trim()) return;

    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTerm: newSource.trim(),
          targetTerm: newTarget.trim(),
          sourceLanguage: newDirection === "vi_en" ? "vi" : "en",
          targetLanguage: newDirection === "vi_en" ? "en" : "vi",
          context: newContext.trim() || undefined,
          category: newCategory.trim() || "User-Defined",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsAddingTerm(false);
        setNewSource("");
        setNewTarget("");
        setNewContext("");

        if (data.term) {
          // Highlight the newly created term
          setRecentlyAddedId(data.term.id);
          // If searching, clear search so the new term is visible
          if (searchQuery) {
            setSearchQuery("");
          }
          // Ensure sort is newest
          setSortBy("newest");
          if (statusFilter === "review" || statusFilter === "rejected") {
            setStatusFilter("all");
          }
          // Put the new term immediately at the very top (index 0) of the table
          setTerms((prev) => [data.term, ...prev.filter((t) => t.id !== data.term.id)]);
          // Fetch freshest list from server
          fetchTerms("newest", "all", "");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Không thể thêm từ vựng");
      }
    } catch (e: any) {
      alert("Failed to create term: " + e.message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTerm) return;

    try {
      const res = await fetch(`/api/glossary/${editingTerm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTerm: editingTerm.sourceTerm.trim(),
          targetTerm: editingTerm.targetTerm.trim(),
          sourceLanguage: editingTerm.sourceLanguage,
          targetLanguage: editingTerm.targetLanguage,
          context: editingTerm.context,
          category: editingTerm.category,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = data.term || editingTerm;
        setRecentlyAddedId(updated.id);
        setEditingTerm(null);
        // Put the edited term at the top of the table
        setTerms((prev) => [updated, ...prev.filter((t) => t.id !== updated.id)]);
        fetchTerms("newest", statusFilter, searchQuery);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Không thể lưu chỉnh sửa");
      }
    } catch (e: any) {
      alert("Failed to save edits: " + e.message);
    }
  };

  const reviewCount = terms.filter((t) => t.status === "review").length;
  const approvedCount = terms.filter((t) => t.status === "approved").length;
  const autoHarvestCount = terms.filter((t) => t.createdBy === "Auto-Harvester").length;
  const viToEnCount = terms.filter((t) => t.sourceLanguage === "vi").length;
  const enToViCount = terms.filter((t) => t.sourceLanguage === "en").length;

  const stageCounts = React.useMemo(() => {
    const res: Record<string, number> = {
      all: terms.length,
      cutting: 0,
      nosew: 0,
      stitching: 0,
      assembly: 0,
      stockfit: 0,
      qa: 0,
    };
    for (const t of terms) {
      const cat = (t.category || "").toLowerCase();
      if (cat === "cutting") res.cutting++;
      else if (cat === "no-sew" || cat === "nosew") res.nosew++;
      else if (cat === "stitching") res.stitching++;
      else if (cat === "assembly") res.assembly++;
      else if (cat === "stockfit") res.stockfit++;
      else if (cat === "qa") res.qa++;
    }
    return res;
  }, [terms]);

  const displayedTerms = terms.filter((t) => {
    if (directionFilter === "vi_en") return t.sourceLanguage === "vi";
    if (directionFilter === "en_vi") return t.sourceLanguage === "en";
    return true;
  }).filter((t) => {
    if (categoryFilter === "all") return true;
    const catLower = categoryFilter.toLowerCase();
    const tCat = (t.category || "").toLowerCase();
    if (catLower === "nosew") {
      return tCat === "no-sew" || tCat === "nosew";
    }
    return tCat === catLower;
  });

  return (
    <div className="space-y-6">
      {/* Workflow Rule Notice (Section 14) */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-300 flex items-start space-x-3 text-xs shadow-lg">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-white">
            Controlled Vocabulary Approval Gate (Section 14)
          </span>
          <p className="text-slate-400">
            Terms extracted from uploaded documents always enter in &quot;Review&quot; status. Only terms explicitly approved by a Reviewer or Administrator will be applied with maximum priority during translation.
          </p>
        </div>
      </div>

      {/* Action Header: 2 Clean Rows */}
      <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3">
        {/* Row 1: Filters (Status & Direction) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All Terms ({terms.length})
            </button>
            <button
              onClick={() => setStatusFilter("review")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                statusFilter === "review"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-amber-400/80 hover:text-amber-300"
              }`}
            >
              <span>Needs Review</span>
              {reviewCount > 0 && (
                <span className="bg-amber-950 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full border border-amber-800 font-mono">
                  {reviewCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("approved")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "approved"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-emerald-400/80 hover:text-emerald-300"
              }`}
            >
              Approved ({approvedCount})
            </button>
            <button
              onClick={() => setStatusFilter("auto_harvested")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                statusFilter === "auto_harvested"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-purple-400/80 hover:text-purple-300"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Auto-Harvested</span>
              {autoHarvestCount > 0 && (
                <span className="bg-purple-950 text-purple-300 text-[10px] px-1.5 py-0.2 rounded-full border border-purple-800 font-mono">
                  {autoHarvestCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("rejected")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "rejected"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-rose-400/80 hover:text-rose-300"
              }`}
            >
              Rejected
            </button>
          </div>

          {/* Direction Filter Segmented Control */}
          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => { setDirectionFilter("all"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                directionFilter === "all"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All Directions
            </button>
            <button
              onClick={() => { setDirectionFilter("vi_en"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                directionFilter === "vi_en"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-emerald-400/80 hover:text-emerald-300"
              }`}
              title="Vietnamese ➔ English (SOP Standard)"
            >
              <span className="font-semibold">VI ➔ EN</span>
              <span className="bg-emerald-950 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full border border-emerald-800 font-mono">
                {viToEnCount}
              </span>
            </button>
            <button
              onClick={() => { setDirectionFilter("en_vi"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                directionFilter === "en_vi"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-400/80 hover:text-blue-300"
              }`}
              title="English ➔ Vietnamese"
            >
              <span className="font-semibold">EN ➔ VI</span>
              <span className="bg-blue-950 text-blue-300 text-[10px] px-1.5 py-0.2 rounded-full border border-blue-800 font-mono">
                {enToViCount}
              </span>
            </button>
          </div>

          {/* Stage / Category Filters */}
          <div className="flex flex-wrap items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-1.5 font-medium">Công đoạn:</span>
            {[
              { id: "all", label: "Tất cả", count: stageCounts.all },
              { id: "cutting", label: "✂️ Cutting", count: stageCounts.cutting },
              { id: "nosew", label: "⚡ No-Sew", count: stageCounts.nosew },
              { id: "stitching", label: "🧵 Stitching", count: stageCounts.stitching },
              { id: "assembly", label: "👟 Assembly", count: stageCounts.assembly },
              { id: "stockfit", label: "📦 Stockfit", count: stageCounts.stockfit },
              { id: "qa", label: "🛡️ QA", count: stageCounts.qa },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setCategoryFilter(cat.id); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
                  categoryFilter === cat.id
                    ? "bg-amber-600 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>{cat.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  categoryFilter === cat.id ? "bg-amber-950/80 text-amber-200" : "bg-slate-900 text-slate-500"
                }`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Search, Sort & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search source or target term..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-950/80 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Sort Selection */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-slate-300 font-medium focus:outline-none cursor-pointer text-xs"
                title="Sort Order"
              >
                <option value="newest" className="bg-slate-900 text-slate-200">Newest First</option>
                <option value="oldest" className="bg-slate-900 text-slate-200">Oldest First</option>
                <option value="az_en" className="bg-slate-900 text-slate-200">A - Z (English)</option>
                <option value="az_vi" className="bg-slate-900 text-slate-200">A - Z (Tiếng Việt)</option>
                <option value="priority" className="bg-slate-900 text-slate-200">Priority & Length</option>
              </select>
            </div>

            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-purple-950/40 border border-purple-800/40 text-[11px] text-purple-300 font-medium shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Antigravity CLI</span>
            </div>

            {/* Hidden Excel File Input */}
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportExcel}
              className="hidden"
            />

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              title="Xuất 936 thuật ngữ ra file Excel (.xlsx)"
            >
              {isExporting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{isExporting ? "Đang xuất..." : "Xuất Excel"}</span>
            </button>

            {/* Import Excel Button */}
            <button
              type="button"
              onClick={() => excelFileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              title="Nhập thêm thuật ngữ từ file Excel (.xlsx)"
            >
              {isImporting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span>{isImporting ? "Đang nạp..." : "Nhập Excel"}</span>
            </button>

            {/* Feed Context PDF Button */}
            <button
              type="button"
              onClick={() => setIsPdfFeedModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-red-300 bg-red-950/60 hover:bg-red-900/60 border border-red-800/60 rounded-xl transition-all cursor-pointer shadow-sm"
              title="Nạp ngữ cảnh & thuật ngữ từ tài liệu PDF (Zero-Image Confidentiality Shield)"
            >
              <FileText className="w-3.5 h-3.5 text-red-400" />
              <span>Feed Context PDF</span>
            </button>

            <button
              onClick={() => setIsAddingTerm(true)}
              className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Term</span>
            </button>
          </div>
        </div>

        {/* Excel Import Result Banner */}
        {importSummary && (
          <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-inner animate-in fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Đã xử lý file Excel: Đã thêm mới <strong>{importSummary.importedCount}</strong> thuật ngữ • Đã bỏ qua <strong>{importSummary.skippedDuplicateCount}</strong> từ trùng lặp • Bỏ qua <strong>{importSummary.skippedInvalidCount}</strong> dòng không hợp lệ.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Add Term Modal */}
      {isAddingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-inner">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Define New Controlled Terminology</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60">
                      Standard Glossary
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Thêm thuật ngữ quy chuẩn mới và xác định ngữ cảnh dịch
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingTerm(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Direction selector toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-medium">Chiều dịch:</span>
                  <button
                    type="button"
                    onClick={() => setNewDirection("vi_en")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      newDirection === "vi_en"
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                        : "text-slate-400 hover:text-white bg-slate-800/60"
                    }`}
                  >
                    Tiếng Việt ➔ Tiếng Anh (SOP chuẩn)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewDirection("en_vi")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      newDirection === "en_vi"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                        : "text-slate-400 hover:text-white bg-slate-800/60"
                    }`}
                  >
                    Tiếng Anh ➔ Tiếng Việt
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const tempS = newSource;
                    setNewSource(newTarget);
                    setNewTarget(tempS);
                    setNewDirection((prev) => (prev === "vi_en" ? "en_vi" : "vi_en"));
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/80 rounded-xl border border-cyan-800/50 transition-all cursor-pointer"
                  title="Đảo chiều và hoán đổi ô nhập"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Đảo chiều (VI ⇄ EN)</span>
                </button>
              </div>

              <form id="add-term-form" onSubmit={handleCreateTerm} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                      <span>Source Term</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                        newDirection === "vi_en"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800"
                      }`}>
                        {newDirection === "vi_en" ? "VI" : "EN"}
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={isSuggesting || (!newTarget.trim() && !newSource.trim())}
                      onClick={() => handleSuggestWithAntigravity(newSource.trim() || newTarget.trim(), newContext, false)}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-400 hover:text-purple-300 bg-purple-950/60 hover:bg-purple-900/80 px-2 py-0.5 rounded-lg border border-purple-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                      title="Sử dụng Antigravity CLI để gợi ý dịch theo quy chuẩn giày Ching Luh"
                    >
                      <Sparkles className={`w-3 h-3 ${isSuggesting ? "animate-spin text-purple-300" : "text-purple-400"}`} />
                      <span>{isSuggesting ? "Đang dịch..." : "Dịch với Antigravity CLI"}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newSource}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewSource(val);
                      if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(val) && newDirection !== "vi_en") {
                        setNewDirection("vi_en");
                      }
                    }}
                    placeholder={newDirection === "vi_en" ? "Ví dụ: dao động khác màu, mũi giày, tràn keo..." : "e.g. color shade variation, vamp, cement overflow..."}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="flex items-center space-x-1.5 text-slate-300 font-semibold mb-1.5">
                    <span>Target Term</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                      newDirection === "vi_en"
                        ? "bg-blue-950 text-blue-300 border border-blue-800"
                        : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    }`}>
                      {newDirection === "vi_en" ? "EN" : "VI"}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    placeholder={newDirection === "vi_en" ? "e.g. color shade variation, vamp, cement overflow..." : "Ví dụ: dao động khác màu, mũi giày, tràn keo..."}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Context / Standard</label>
                  <input
                    type="text"
                    value={newContext}
                    onChange={(e) => setNewContext(e.target.value)}
                    placeholder="e.g. Footwear SOP, Stitching, Assembly"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-medium">Category / Công đoạn</label>
                    <div className="flex items-center gap-1">
                      {["No-Sew", "Stitching", "Cutting", "Assembly", "QA"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewCategory(c)}
                          className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    list="stage-category-options"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. No-Sew, Stitching, Assembly, QA"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <datalist id="stage-category-options">
                    <option value="No-Sew" />
                    <option value="Stitching" />
                    <option value="Cutting" />
                    <option value="Assembly" />
                    <option value="Stockfit" />
                    <option value="QA" />
                    <option value="General" />
                  </datalist>
                </div>

                {suggestNotice && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 text-[11px] text-purple-200 flex items-start justify-between gap-2 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{suggestNotice}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuggestNotice(null)}
                      className="text-purple-400 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsAddingTerm(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-term-form"
                className="px-4 py-2 rounded-xl text-white bg-blue-600 hover:bg-blue-500 text-xs font-semibold shadow-md shadow-blue-600/30 transition-all cursor-pointer"
              >
                Save & Approve Term
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Term Modal */}
      {editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-inner">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Edit Terminology Entry</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      ID: {editingTerm.id}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Chỉnh sửa thuật ngữ, chiều dịch và ngữ cảnh kiểm soát
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSwapEditingTerm}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/80 rounded-xl border border-cyan-800/60 transition-all cursor-pointer shadow-sm"
                  title="Đảo chiều Source và Target (VI ⇄ EN)"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Đảo chiều (VI ⇄ EN)</span>
                </button>
                <button
                  onClick={() => setEditingTerm(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <form id="edit-term-form" onSubmit={handleSaveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                      <span>Source Term</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                        editingTerm.sourceLanguage === "vi"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800"
                      }`}>
                        {editingTerm.sourceLanguage ? editingTerm.sourceLanguage.toUpperCase() : "VI"}
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={isSuggesting || (!editingTerm.targetTerm?.trim() && !editingTerm.sourceTerm?.trim())}
                      onClick={() =>
                        handleSuggestWithAntigravity(
                          editingTerm.sourceTerm?.trim() || editingTerm.targetTerm?.trim() || "",
                          editingTerm.context || "",
                          true
                        )
                      }
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-400 hover:text-purple-300 bg-purple-950/60 hover:bg-purple-900/80 px-2 py-0.5 rounded-lg border border-purple-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                      title="Sử dụng Antigravity CLI để dịch sang ngôn ngữ đích theo quy chuẩn giày Ching Luh"
                    >
                      <Sparkles className={`w-3 h-3 ${isSuggesting ? "animate-spin text-purple-300" : "text-purple-400"}`} />
                      <span>{isSuggesting ? "Đang dịch..." : "Dịch với Antigravity CLI"}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editingTerm.sourceTerm}
                    onChange={(e) =>
                      setEditingTerm({ ...editingTerm, sourceTerm: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="flex items-center space-x-1.5 text-slate-300 font-semibold mb-1.5">
                    <span>Target Term</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                      editingTerm.targetLanguage === "en"
                        ? "bg-blue-950 text-blue-300 border border-blue-800"
                        : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    }`}>
                      {editingTerm.targetLanguage ? editingTerm.targetLanguage.toUpperCase() : "EN"}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editingTerm.targetTerm}
                    onChange={(e) =>
                      setEditingTerm({ ...editingTerm, targetTerm: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Context / Standard</label>
                  <input
                    type="text"
                    value={editingTerm.context || ""}
                    onChange={(e) =>
                      setEditingTerm({ ...editingTerm, context: e.target.value })
                    }
                    placeholder="e.g. Footwear SOP, Stitching, Assembly"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Category</label>
                  <input
                    type="text"
                    value={editingTerm.category || ""}
                    onChange={(e) =>
                      setEditingTerm({ ...editingTerm, category: e.target.value })
                    }
                    placeholder="e.g. Footwear, Quality, Production"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                {suggestNotice && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 text-[11px] text-purple-200 flex items-start justify-between gap-2 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{suggestNotice}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuggestNotice(null)}
                      className="text-purple-400 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditingTerm(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-term-form"
                className="px-4 py-2 rounded-xl text-white bg-amber-600 hover:bg-amber-500 text-xs font-semibold shadow-md shadow-amber-600/30 transition-all cursor-pointer"
              >
                Update Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Action Toolbar when items are selected */}
      {selectedTermIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-950/60 border border-blue-500/40 px-4 py-2.5 rounded-2xl shadow-lg backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex items-center space-x-2 text-xs text-blue-200">
            <span className="font-bold text-white bg-blue-600 px-2 py-0.5 rounded-md font-mono text-[11px]">
              {selectedTermIds.length}
            </span>
            <span>of {terms.length} terms selected</span>
          </div>

          <div className="flex items-center space-x-2">
            {canApprove && (
              <>
                <button
                  onClick={() => handleBatchStatus("approved")}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve Selected</span>
                </button>
                <button
                  onClick={() => handleBatchStatus("rejected")}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject Selected</span>
                </button>
              </>
            )}
            <button
              onClick={handleBatchDelete}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/50 hover:bg-rose-600 rounded-xl border border-rose-800/50 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
            <button
              onClick={() => setSelectedTermIds([])}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Terminology Review Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        {displayedTerms.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-slate-600" />
            <p>Không có thuật ngữ nào phù hợp với bộ lọc hiện tại.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950">
              <table className="w-full min-w-[880px] text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all terms"
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer accent-blue-600 align-middle"
                      />
                    </th>
                    <th className="px-4 py-3 min-w-[170px]">SOURCE TERM</th>
                    <th className="px-2 py-3 w-24 text-center">DIRECTION</th>
                    <th className="px-4 py-3 min-w-[170px]">TARGET TERM</th>
                    <th className="px-3 py-3 w-40">CONTEXT & SOURCE</th>
                    <th className="px-3 py-3 w-32 whitespace-nowrap">
                      <div className="flex items-center space-x-1 text-blue-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>TIMESTAMP</span>
                      </div>
                    </th>
                    <th className="px-3 py-3 w-28 text-center whitespace-nowrap">STATUS</th>
                    <th className="px-3 py-3 w-36 text-right sticky right-0 bg-slate-950/95 shadow-[-12px_0_16px_-4px_rgba(0,0,0,0.6)] border-l border-slate-800 whitespace-nowrap z-10">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayedTerms.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((term) => {
                    const isRecent = term.id === recentlyAddedId;
                    const isSelected = selectedTermIds.includes(term.id);
                    return (
                      <tr
                        key={term.id}
                        className={`group transition-all duration-150 ${
                          isRecent
                            ? "bg-emerald-950/40 border-l-4 border-l-emerald-400"
                            : isSelected
                            ? "bg-blue-950/40 border-l-2 border-l-blue-500"
                            : "hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="w-10 px-3 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectTerm(term.id)}
                            aria-label={`Select ${term.sourceTerm}`}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer accent-blue-600 align-middle"
                          />
                        </td>

                        {/* Source Term */}
                        <td className="px-4 py-3.5 font-medium text-white">
                          <div className="flex items-start space-x-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 mt-0.5 ${
                              term.sourceLanguage === "vi"
                                ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800/80"
                                : "bg-blue-950/90 text-blue-300 border border-blue-800/80"
                            }`}>
                              {term.sourceLanguage ? term.sourceLanguage.toUpperCase() : "VI"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="break-words">{term.sourceTerm}</span>
                              {isRecent && (
                                <span className="ml-1.5 inline-flex items-center space-x-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>Mới</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Direction Arrow & 1-click swap */}
                        <td className="px-2 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleSwapTermDirection(term.id)}
                            title="Click để đảo chiều nhanh (VI ⇄ EN)"
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium font-mono hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                              term.sourceLanguage === "vi"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                : "bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20"
                            }`}
                          >
                            <span>{term.sourceLanguage === "vi" ? "VI ➔ EN" : "EN ➔ VI"}</span>
                          </button>
                        </td>

                        {/* Target Term */}
                        <td className="px-4 py-3.5 font-semibold text-emerald-400">
                          <div className="flex items-start space-x-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 mt-0.5 ${
                              term.targetLanguage === "en"
                                ? "bg-blue-950/90 text-blue-300 border border-blue-800/80"
                                : "bg-emerald-950/90 text-emerald-300 border border-emerald-800/80"
                            }`}>
                              {term.targetLanguage ? term.targetLanguage.toUpperCase() : "EN"}
                            </span>
                            <span className="break-words">{term.targetTerm}</span>
                          </div>
                        </td>

                        {/* Combined Context & Source */}
                        <td className="px-3 py-3.5">
                          <div className="flex flex-col space-y-1 max-w-[160px]">
                            {term.category && (
                              <div>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider ${
                                  /nosew|no-sew/i.test(term.category) ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" :
                                  /stitch/i.test(term.category) ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" :
                                  /cut/i.test(term.category) ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" :
                                  /assembl|gò|dán/i.test(term.category) ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                                  /stock/i.test(term.category) ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" :
                                  /qa|qc|defect|lỗi/i.test(term.category) ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
                                  "bg-slate-800 text-slate-300 border border-slate-700"
                                }`}>
                                  {term.category}
                                </span>
                              </div>
                            )}
                            <span className="text-slate-200 font-medium text-xs truncate" title={term.context || term.category || "General"}>
                              {term.context || term.category || "General"}
                            </span>
                            <span className="text-slate-500 font-mono text-[10px] truncate" title={term.sourceDocument || "Manual Entry"}>
                              {term.sourceDocument || "Manual Entry"}
                            </span>
                          </div>
                        </td>

                        {/* Timestamp */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col space-y-0.5 font-mono">
                            <div className="flex items-center space-x-1.5 text-slate-300 text-[11px]">
                              <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{formatTimestamp(term.updatedAt || term.createdAt)}</span>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] pl-4 font-sans text-blue-400">
                              <span>{formatRelativeTime(term.updatedAt || term.createdAt)}</span>
                              {term.updatedAt && term.createdAt && term.updatedAt !== term.createdAt && (
                                <span className="text-slate-500">• đã sửa</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                term.status === "approved"
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : term.status === "review"
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {term.status}
                            </span>
                            {term.createdBy === "Auto-Harvester" && (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[8px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60">
                                <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                                <span>Auto</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions (Sticky Right column) */}
                        <td className={`px-3 py-3.5 text-right whitespace-nowrap sticky right-0 shadow-[-12px_0_16px_-4px_rgba(0,0,0,0.6)] border-l border-slate-800/80 z-10 ${
                          isRecent
                            ? "bg-slate-900"
                            : isSelected
                            ? "bg-slate-900"
                            : "bg-slate-900 group-hover:bg-slate-850"
                        }`}>
                          <div className="inline-flex items-center justify-end space-x-1">
                            {term.status === "review" && canApprove && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(term.id, "approved")}
                                  className="p-1.5 text-emerald-400 hover:text-white bg-emerald-950/40 hover:bg-emerald-600 rounded-lg border border-emerald-800/50 transition-colors cursor-pointer"
                                  title="Approve Term"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(term.id, "rejected")}
                                  className="p-1.5 text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-600 rounded-lg border border-rose-800/50 transition-colors cursor-pointer"
                                  title="Reject Term"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                            {term.status === "approved" && canApprove && (
                              <button
                                onClick={() => handleUpdateStatus(term.id, "rejected")}
                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                                title="Revoke Approval"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => handleSwapTermDirection(term.id)}
                              className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Đảo chiều thuật ngữ (VI ⇄ EN)"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setEditingTerm(term)}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-950/30 rounded-lg transition-colors cursor-pointer"
                              title="Edit Term"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setHistoryTerm(term)}
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-950/30 rounded-lg transition-colors cursor-pointer"
                              title="Xem lịch sử chỉnh sửa thuật ngữ"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDelete(term.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                              title="Delete Term"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          {/* Fix #12: Pagination controls */}
          {displayedTerms.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800/60 bg-slate-900/50">
              <span className="text-sm text-slate-400">
                Hiển thị {Math.min((currentPage - 1) * PAGE_SIZE + 1, displayedTerms.length)}–{Math.min(currentPage * PAGE_SIZE, displayedTerms.length)} / {displayedTerms.length} thuật ngữ
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >← Trước</button>
                {Array.from({ length: Math.ceil(displayedTerms.length / PAGE_SIZE) }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === Math.ceil(displayedTerms.length / PAGE_SIZE) || Math.abs(p - currentPage) <= 2)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`ellipsis-${i}`} className="text-slate-500 px-1">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          currentPage === p
                            ? "bg-blue-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >{p}</button>
                    )
                  )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(Math.ceil(displayedTerms.length / PAGE_SIZE), p + 1))}
                  disabled={currentPage >= Math.ceil(displayedTerms.length / PAGE_SIZE)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >Tiếp →</button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Term Edit History Modal */}
      {historyTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-inner">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Lịch sử Chỉnh sửa Thuật ngữ</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      ID: {historyTerm.id}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <b>{historyTerm.sourceTerm}</b> ➔ <span className="text-emerald-400 font-semibold">{historyTerm.targetTerm}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHistoryTerm(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(!historyTerm.editHistory || historyTerm.editHistory.length === 0) ? (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Khởi tạo ban đầu</span>
                    <span className="font-mono text-slate-400 text-[11px]">{formatTimestamp(historyTerm.createdAt)}</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Thuật ngữ được thêm bởi <span className="text-blue-400 font-mono">{historyTerm.createdBy || "system"}</span>.
                  </p>
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-800 ml-3 pl-5 space-y-4 text-xs">
                  {historyTerm.editHistory.map((item, idx) => (
                    <div key={item.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900 group-hover:scale-125 transition-transform" />

                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              item.action === "created"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : item.action === "status_changed"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : item.action === "auto_harvested"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            }`}>
                              {item.action === "created" ? "Khởi tạo" : item.action === "status_changed" ? "Đổi trạng thái" : item.action === "auto_harvested" ? "Tự học" : "Cập nhật"}
                            </span>
                            <span className="text-slate-400 text-[11px]">bởi <b className="text-slate-300">{item.editedBy || "user"}</b></span>
                          </div>

                          <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-400">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{formatTimestamp(item.timestamp)}</span>
                            <span className="text-slate-500 text-[10px]">({formatRelativeTime(item.timestamp)})</span>
                          </div>
                        </div>

                        {item.note && (
                          <p className="text-slate-300 text-[11px]">{item.note}</p>
                        )}

                        {item.changes && item.changes.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {item.changes.map((ch, cIdx) => (
                              <div key={cIdx} className="text-[11px] font-mono bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center space-x-2">
                                <span className="text-slate-400 font-semibold">{ch.field}:</span>
                                <span className="text-rose-400 line-through truncate max-w-[150px]">{ch.oldValue || "(trống)"}</span>
                                <span className="text-slate-500">➔</span>
                                <span className="text-emerald-400 font-medium truncate max-w-[180px]">{ch.newValue || "(trống)"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setHistoryTerm(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zero-Image Shield PDF Context Feed Modal */}
      <PdfContextFeedModal
        isOpen={isPdfFeedModalOpen}
        onClose={() => setIsPdfFeedModalOpen(false)}
        onTermsAdded={() => {
          fetchTerms();
        }}
      />
    </div>
  );
};

