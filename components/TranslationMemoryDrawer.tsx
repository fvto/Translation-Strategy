"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  History,
  Search,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ShieldCheck,
  Layers,
  Calendar,
  Clock,
  Database,
  ArrowRight,
  RefreshCw,
  BookOpen,
} from "lucide-react";

export interface SessionSummary {
  sessionId: string;
  fileName: string;
  mode: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  slideCount: number;
  totalPairs: number;
  harvestedCount: number;
}

export interface TranslationPair {
  id: string;
  sourceText: string;
  translatedText: string;
  isTitle?: boolean;
  isInspectionItem?: boolean;
}

export interface SlideTranslationLog {
  slideIndex: number;
  title: string;
  pairs: TranslationPair[];
}

export interface TranslationSessionLog extends SessionSummary {
  slides: SlideTranslationLog[];
}

export interface TMSegmentResult {
  id: string;
  sessionId: string;
  fileName: string;
  createdAt: string;
  slideIndex: number;
  sourceText: string;
  translatedText: string;
  isTitle?: boolean;
  isInspectionItem?: boolean;
}

interface TranslationMemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDateTime = (isoString?: string): string => {
  if (!isoString) return "N/A";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return "";
  const d = new Date(isoString);
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

export const TranslationMemoryDrawer: React.FC<TranslationMemoryDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"sessions" | "segments">("sessions");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailedSession, setDetailedSession] = useState<TranslationSessionLog | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSlideIndex, setExpandedSlideIndex] = useState<number | null>(null);

  // TM Segments state
  const [segments, setSegments] = useState<TMSegmentResult[]>([]);
  const [isSegmentsLoading, setIsSegmentsLoading] = useState<boolean>(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/documents/translation-logs");
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error("Failed to load translation logs:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSegments = async (query: string = "") => {
    setIsSegmentsLoading(true);
    try {
      const params = new URLSearchParams({ mode: "segments", limit: "120" });
      if (query.trim()) params.append("query", query.trim());
      const res = await fetch(`/api/documents/translation-logs?${params.toString()}`);
      const data = await res.json();
      if (data.segments) {
        setSegments(data.segments);
      }
    } catch (e) {
      console.error("Failed to load TM segments:", e);
    } finally {
      setIsSegmentsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
      if (activeTab === "segments") {
        fetchSegments(searchQuery);
      }
    } else {
      setSelectedSessionId(null);
      setDetailedSession(null);
    }
  }, [isOpen, activeTab]);

  const handleTabChange = (tab: "sessions" | "segments") => {
    setActiveTab(tab);
    if (tab === "segments" && segments.length === 0) {
      fetchSegments(searchQuery);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (activeTab === "segments") {
      fetchSegments(searchQuery);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
      setDetailedSession(null);
      return;
    }

    setSelectedSessionId(sessionId);
    setIsDetailLoading(true);
    setExpandedSlideIndex(null);

    try {
      const res = await fetch(`/api/documents/translation-logs?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.session) {
        setDetailedSession(data.session);
      }
    } catch (e) {
      console.error("Failed to load session details:", e);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredSessions = sessions.filter((s) =>
    s.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.sessionId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPairsCount = sessions.reduce((acc, s) => acc + (s.totalPairs || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Lịch sử Dịch &amp; Bộ nhớ Translation Memory
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Pure Text Only
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Xem lại phiên dịch PowerPoint, tra cứu mốc thời gian và bộ nhớ cặp câu song ngữ đã dịch.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                fetchSessions();
                if (activeTab === "segments") fetchSegments(searchQuery);
              }}
              disabled={isLoading || isSegmentsLoading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading || isSegmentsLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-6 pt-3 space-x-4 text-xs font-semibold">
          <button
            onClick={() => handleTabChange("sessions")}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === "sessions"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Lịch sử Phiên Dịch</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
              {sessions.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange("segments")}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === "segments"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Bộ nhớ Cặp câu TM</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
              {totalPairsCount} câu
            </span>
          </button>
        </div>

        {/* Search & Stats Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="p-4 bg-slate-950/60 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={
                activeTab === "sessions"
                  ? "Tìm kiếm file PowerPoint đã dịch..."
                  : "Tìm kiếm câu trong bộ nhớ TM (Tiếng Việt hoặc Tiếng Anh)..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="flex items-center space-x-3 text-slate-400 font-mono text-[11px]">
            {activeTab === "sessions" ? (
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Tổng cộng: <b className="text-white">{sessions.length}</b> phiên</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Hiển thị: <b className="text-white">{segments.length}</b> cặp câu TM</span>
              </span>
            )}
          </div>
        </form>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "sessions" ? (
            /* TAB 1: SESSIONS LIST (LỊCH SỬ DỊCH) */
            isLoading ? (
              <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                <span>Đang tải lịch sử phiên dịch...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-slate-600" />
                <span>Chưa có phiên dịch nào phù hợp trong bộ nhớ.</span>
                <p className="text-[11px] text-slate-600">
                  Các file PowerPoint được dịch sẽ tự động ghi nhớ toàn bộ cặp câu thuần văn bản vào đây.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map((s) => {
                  const isSelected = selectedSessionId === s.sessionId;
                  return (
                    <div
                      key={s.sessionId}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isSelected
                          ? "bg-slate-900 border-amber-500/50 shadow-lg ring-1 ring-amber-500/20"
                          : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      {/* Session Summary Card */}
                      <div
                        onClick={() => handleSelectSession(s.sessionId)}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="font-semibold text-sm text-white">{s.fileName}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                              {s.mode === "replace_en" ? "Option 2: EN Only" : "Option 1: Bilingual"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px]">
                            {/* Timestamp Highlight Badge */}
                            <div className="flex items-center space-x-1.5 text-amber-300 font-mono bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg shadow-sm">
                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="font-semibold">{formatDateTime(s.createdAt)}</span>
                              <span className="text-[10px] text-amber-400/80 font-normal">
                                ({formatRelativeTime(s.createdAt)})
                              </span>
                            </div>

                            <span className="text-slate-500">•</span>
                            <span className="flex items-center gap-1 text-slate-400">
                              <Layers className="w-3 h-3 text-slate-500" />
                              {s.slideCount} slides ({s.totalPairs} cặp câu)
                            </span>

                            {s.harvestedCount > 0 && (
                              <>
                                <span className="text-slate-500">•</span>
                                <span className="flex items-center gap-1 text-purple-400 font-semibold">
                                  <Sparkles className="w-3 h-3" />
                                  {s.harvestedCount} từ đã tự học
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                            }`}
                          >
                            <span>{isSelected ? "Thu gọn" : "Xem chi tiết"}</span>
                            {isSelected ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Detailed Accordion View */}
                      {isSelected && (
                        <div className="border-t border-slate-800/80 p-5 bg-slate-950/90 space-y-4 animate-in fade-in duration-200">
                          {isDetailLoading ? (
                            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                              <span>Đang nạp các cặp câu song ngữ...</span>
                            </div>
                          ) : !detailedSession || detailedSession.slides.length === 0 ? (
                            <div className="py-6 text-center text-xs text-slate-500">
                              Không tìm thấy dữ liệu văn bản cho phiên này.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Session Metadata Banner */}
                              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2.5 gap-2">
                                <div className="flex items-center space-x-2 font-mono text-[11px]">
                                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="text-slate-300">Thời gian dịch hoàn tất:</span>
                                  <span className="text-amber-300 font-semibold">{formatDateTime(detailedSession.createdAt)}</span>
                                  <span className="text-slate-500">({formatRelativeTime(detailedSession.createdAt)})</span>
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {detailedSession.slides.length} slides • {detailedSession.totalPairs} đoạn câu
                                </span>
                              </div>

                              {detailedSession.slides.map((slide) => {
                                const isSlideOpen = expandedSlideIndex === slide.slideIndex;
                                return (
                                  <div
                                    key={slide.slideIndex}
                                    className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/60"
                                  >
                                    <div
                                      onClick={() =>
                                        setExpandedSlideIndex(isSlideOpen ? null : slide.slideIndex)
                                      }
                                      className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none text-xs"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[10px]">
                                          Slide #{slide.slideIndex}
                                        </span>
                                        <span className="text-slate-200 font-medium">
                                          {slide.title || "(Slide không có tiêu đề)"}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-2 text-slate-400">
                                        <span className="text-[11px] font-mono">{slide.pairs.length} đoạn</span>
                                        {isSlideOpen ? (
                                          <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                      </div>
                                    </div>

                                    {isSlideOpen && (
                                      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-slate-950/80">
                                        {slide.pairs.map((p, idx) => (
                                          <div
                                            key={idx}
                                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5 font-sans"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="space-y-1 flex-1">
                                                <div className="text-slate-400 flex items-start gap-1.5">
                                                  <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0 mt-0.5">
                                                    VI:
                                                  </span>
                                                  <span className="text-slate-300 leading-relaxed">
                                                    {p.sourceText}
                                                  </span>
                                                </div>
                                                <div className="text-emerald-300 flex items-start gap-1.5 font-medium">
                                                  <span className="text-[10px] font-mono text-emerald-500 uppercase shrink-0 mt-0.5">
                                                    EN:
                                                  </span>
                                                  <span className="leading-relaxed">
                                                    {p.translatedText}
                                                  </span>
                                                </div>
                                              </div>
                                              <button
                                                onClick={() => handleCopy(p.translatedText, `${slide.slideIndex}_${idx}`)}
                                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0 cursor-pointer"
                                                title="Sao chép tiếng Anh"
                                              >
                                                {copiedId === `${slide.slideIndex}_${idx}` ? (
                                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                ) : (
                                                  <Copy className="w-3.5 h-3.5" />
                                                )}
                                              </button>
                                            </div>

                                            {/* Timestamp Tag on Translation Pair */}
                                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-slate-800/60 pt-1 mt-1">
                                              <span className="flex items-center gap-1">
                                                <Clock className="w-2.5 h-2.5 text-slate-500" />
                                                <span>Thời gian lưu TM: {formatDateTime(detailedSession.createdAt)}</span>
                                              </span>
                                              <span>Slide #{slide.slideIndex}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* TAB 2: TRANSLATION MEMORY SEGMENTS (BỘ NHỚ TM) */
            isSegmentsLoading ? (
              <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                <span>Đang tra cứu cặp câu trong bộ nhớ TM...</span>
              </div>
            ) : segments.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs flex flex-col items-center gap-2">
                <BookOpen className="w-8 h-8 text-slate-600" />
                <span>Không tìm thấy cặp câu nào phù hợp với từ khóa tra cứu.</span>
                <p className="text-[11px] text-slate-600">
                  Hãy thử tìm kiếm bằng từ khóa ngắn hơn hoặc kiểm tra lại file đã dịch.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-amber-500/40 transition-all space-y-2 text-xs"
                  >
                    {/* Segment Meta Bar with Timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[10px]">
                          Slide #{seg.slideIndex}
                        </span>
                        <span className="font-semibold text-slate-300 text-[11px] truncate max-w-[200px] sm:max-w-xs">
                          {seg.fileName}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Timestamp badge */}
                        <div className="flex items-center space-x-1.5 text-slate-400 font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-slate-300">{formatDateTime(seg.createdAt)}</span>
                          <span className="text-amber-400/80">({formatRelativeTime(seg.createdAt)})</span>
                        </div>

                        <button
                          onClick={() => handleCopy(seg.translatedText, seg.id)}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0 cursor-pointer"
                          title="Sao chép tiếng Anh"
                        >
                          {copiedId === seg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Bilingual Pair Display */}
                    <div className="space-y-1.5">
                      <div className="text-slate-400 flex items-start gap-2">
                        <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0 mt-0.5">
                          VI:
                        </span>
                        <span className="text-slate-300 leading-relaxed font-sans">
                          {seg.sourceText}
                        </span>
                      </div>
                      <div className="text-emerald-300 flex items-start gap-2 font-medium">
                        <span className="text-[10px] font-mono text-emerald-500 uppercase shrink-0 mt-0.5">
                          EN:
                        </span>
                        <span className="leading-relaxed font-sans">
                          {seg.translatedText}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Chính sách Zero-Image: Tuyệt đối không lưu trữ hay gửi hình ảnh.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors font-medium cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
