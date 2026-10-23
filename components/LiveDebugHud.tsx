"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Bug,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Activity,
  Send,
  X,
  Check,
  Loader2,
  Sparkles,
  Cpu,
  Layers,
} from "lucide-react";

interface DebugEvent {
  id: string;
  type: "error" | "unhandledrejection" | "fetch_error" | "warn" | "action";
  message: string;
  source?: string;
  stack?: string;
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  payload?: any;
  responsePreview?: string;
  breadcrumbs?: Array<{ action: string; target?: string; timestamp: string }>;
  timestamp: string;
}

interface CliEntry {
  id: string;
  input: string;
  output: string;
  durationMs?: number;
  timestamp: string;
}

export function LiveDebugHud() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"cli" | "errors">("cli");
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "errors" | "api">("all");
  const [copied, setCopied] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Antigravity CLI state
  const [cliEntries, setCliEntries] = useState<CliEntry[]>([
    {
      id: "cli_init",
      input: "agy --version",
      output:
        "🚀 Google Antigravity CLI (agy) Web Bridge v2.0\nPhiên bản CLI: agy.exe kết nối trực tiếp tại C:\\Users\\User\\AppData\\Local\\agy\\bin\\agy.exe\nGõ 'agy models', '/help' hoặc đặt câu hỏi bất kỳ để Antigravity xử lý.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [cliInput, setCliInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const historyInputs = useRef<string[]>([]);
  const cliBottomRef = useRef<HTMLDivElement | null>(null);

  const breadcrumbsRef = useRef<Array<{ action: string; target?: string; timestamp: string }>>([]);

  const addBreadcrumb = (action: string, target?: string) => {
    const item = {
      action,
      target: target?.substring(0, 100),
      timestamp: new Date().toLocaleTimeString(),
    };
    breadcrumbsRef.current = [...breadcrumbsRef.current.slice(-15), item];
  };

  const dispatchEventToServer = async (event: Partial<DebugEvent>) => {
    try {
      const fullEvent: DebugEvent = {
        id: "dbg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        type: event.type || "error",
        message: event.message || "Unknown error",
        source: event.source,
        stack: event.stack,
        url: event.url,
        method: event.method,
        status: event.status,
        statusText: event.statusText,
        payload: event.payload,
        responsePreview: event.responsePreview,
        breadcrumbs: [...breadcrumbsRef.current],
        timestamp: new Date().toISOString(),
      };

      setEvents((prev) => [fullEvent, ...prev.slice(0, 99)]);

      await fetch("/api/debug-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullEvent),
      });
    } catch (_) {}
  };

  useEffect(() => {
    // 1. Initial fetch of existing debug logs
    fetch("/api/debug-live")
      .then((res) => res.json())
      .then((data) => {
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      })
      .catch(() => {});

    // 2. Global Runtime Error Interceptor
    const handleGlobalError = (event: ErrorEvent) => {
      dispatchEventToServer({
        type: "error",
        message: event.message || "Runtime script error",
        source: `${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`,
        stack: event.error?.stack,
      });
    };

    // 3. Unhandled Promise Rejection Interceptor
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      let msg = "Unhandled Promise Rejection";
      let stack = "";
      if (typeof event.reason === "string") {
        msg = event.reason;
      } else if (event.reason instanceof Error) {
        msg = event.reason.message;
        stack = event.reason.stack || "";
      } else {
        try {
          msg = JSON.stringify(event.reason);
        } catch (_) {}
      }

      dispatchEventToServer({
        type: "unhandledrejection",
        message: msg,
        stack,
      });
    };

    // 4. Wrap window.fetch for real-time API failure capture
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
      const method = (args[1]?.method || "GET").toUpperCase();

      if (url.includes("/api/debug-live") || url.includes("/api/antigravity-cli")) {
        return originalFetch(...args);
      }

      try {
        const response = await originalFetch(...args);
        if (!response.ok && response.status >= 400) {
          let preview = "";
          try {
            const clone = response.clone();
            const text = await clone.text();
            preview = text.substring(0, 300);
          } catch (_) {}

          dispatchEventToServer({
            type: "fetch_error",
            message: `HTTP ${response.status} ${response.statusText || ""} on ${method} ${url}`,
            url,
            method,
            status: response.status,
            statusText: response.statusText,
            responsePreview: preview,
          });
        }
        return response;
      } catch (err: any) {
        dispatchEventToServer({
          type: "fetch_error",
          message: `Network/Fetch Failure: ${err?.message || "Failed to fetch"} on ${method} ${url}`,
          url,
          method,
          stack: err?.stack,
        });
        throw err;
      }
    };

    // 5. Track User Click Breadcrumbs
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("#live-debug-hud-container")) return;

      const btn = target.closest("button");
      const a = target.closest("a");
      const input = target.closest("input, select, textarea");

      let desc = "";
      if (btn) {
        desc = `Click Button: "${btn.innerText?.trim() || btn.getAttribute("aria-label") || btn.id || "unnamed"}"`;
      } else if (a) {
        desc = `Click Link: "${a.innerText?.trim() || a.getAttribute("href") || ""}"`;
      } else if (input) {
        desc = `Interacted with ${input.tagName.toLowerCase()}: "${input.getAttribute("name") || input.id || input.getAttribute("placeholder") || ""}"`;
      } else {
        const text = target.innerText?.trim()?.substring(0, 30);
        if (text) {
          desc = `Click on <${target.tagName.toLowerCase()}> "${text}"`;
        }
      }

      if (desc) {
        addBreadcrumb(desc);
      }
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      document.removeEventListener("click", handleDocumentClick, true);
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (activeTab === "cli") {
      cliBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [cliEntries, activeTab]);

  const errorsList = events.filter((e) =>
    ["error", "unhandledrejection", "fetch_error"].includes(e.type)
  );
  const errorCount = errorsList.length;

  const filteredEvents = events.filter((e) => {
    if (filter === "errors") return ["error", "unhandledrejection", "fetch_error"].includes(e.type);
    if (filter === "api") return e.type === "fetch_error";
    return true;
  });

  const handleExecuteCli = async (cmdToRun?: string) => {
    const command = (cmdToRun || cliInput).trim();
    if (!command || isExecuting) return;

    if (command === "/clear") {
      setCliEntries([]);
      setCliInput("");
      return;
    }

    // Save to history
    historyInputs.current.push(command);
    setHistoryIndex(null);

    setCliInput("");
    setIsExecuting(true);
    const entryId = "cli_" + Date.now();
    const startTime = Date.now();

    // Immediately insert entry with empty output so user sees command registered at 0ms
    setCliEntries((prev) => [
      ...prev,
      {
        id: entryId,
        input: command,
        output: "",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const res = await fetch("/api/antigravity-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: command,
          context: {
            recentErrors: errorsList.slice(0, 3),
            breadcrumbs: breadcrumbsRef.current.slice(-5),
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setCliEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, output: `[Lỗi máy chủ]: ${errorText || res.statusText}`, durationMs: Date.now() - startTime }
              : e
          )
        );
        return;
      }

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder("utf-8");
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setCliEntries((prev) =>
            prev.map((e) =>
              e.id === entryId
                ? { ...e, output: accumulated, durationMs: Date.now() - startTime }
                : e
            )
          );
        }
      } else {
        const text = await res.text();
        setCliEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, output: text, durationMs: Date.now() - startTime }
              : e
          )
        );
      }
    } catch (err: any) {
      setCliEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, output: `[Lỗi kết nối Antigravity CLI]: ${err.message}`, durationMs: Date.now() - startTime }
            : e
        )
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyInputs.current.length === 0) return;
      const nextIndex = historyIndex === null ? historyInputs.current.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCliInput(historyInputs.current[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= historyInputs.current.length) {
        setHistoryIndex(null);
        setCliInput("");
      } else {
        setHistoryIndex(nextIndex);
        setCliInput(historyInputs.current[nextIndex]);
      }
    }
  };

  const handleCopyReport = () => {
    const latestErrors = errorsList.slice(0, 5);
    const report = {
      summary: `Antigravity CLI Live Bug Report: ${errorCount} errors captured`,
      timestamp: new Date().toISOString(),
      recentBreadcrumbs: breadcrumbsRef.current,
      errors: latestErrors.map((err) => ({
        type: err.type,
        message: err.message,
        source: err.source,
        url: err.url,
        status: err.status,
        stack: err.stack?.split("\n").slice(0, 4).join("\n"),
        responsePreview: err.responsePreview,
      })),
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleClearLogs = async () => {
    await fetch("/api/debug-live", { method: "DELETE" });
    setEvents([]);
    breadcrumbsRef.current = [];
  };

  const triggerTestError = () => {
    addBreadcrumb("User triggered test error button");
    setTimeout(() => {
      throw new Error("Test UI Runtime Error: Antigravity Sentinel captured this successfully!");
    }, 50);
  };

  return (
    <div id="live-debug-hud-container" className="fixed bottom-4 right-4 z-[9999] font-sans">
      {/* Floating Indicator Pill */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-200 cursor-pointer text-xs font-semibold ${
            errorCount > 0
              ? "bg-rose-600/95 text-white border-rose-500 hover:bg-rose-700 animate-pulse ring-4 ring-rose-500/20"
              : "bg-slate-950/95 dark:bg-[#07090e]/95 text-slate-200 border-slate-700/80 hover:bg-slate-900 ring-2 ring-emerald-500/20"
          }`}
          title="Mở Antigravity CLI & Live Debug Terminal"
        >
          {errorCount > 0 ? (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-300 animate-bounce" />
              <span>{errorCount} Lỗi phát hiện</span>
            </>
          ) : (
            <>
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-mono font-bold tracking-tight">agy CLI</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40"></span>
            </>
          )}
          <span className="text-[10px] opacity-75 ml-1 border-l pl-2 border-white/20 font-mono">v2.0</span>
        </button>
      )}

      {/* Expanded Modal / HUD Drawer */}
      {isOpen && (
        <div className="w-[580px] max-w-[95vw] h-[640px] max-h-[88vh] flex flex-col bg-[#07090e]/98 text-slate-200 rounded-2xl shadow-2xl border border-slate-800/90 backdrop-blur-2xl overflow-hidden transition-all animate-in fade-in zoom-in-95 font-mono">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/90 bg-slate-950/90 font-sans">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="font-mono text-emerald-400">agy</span> Antigravity CLI Terminal
                  {errorCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      {errorCount} lỗi
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">Kết nối trực tiếp binary `agy.exe` trên hệ điều hành</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-sans">
              <button
                onClick={handleCopyReport}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 transition-colors"
                title="Sao chép báo cáo lỗi cho Antigravity"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Đã chép!" : "Sync Antigravity"}</span>
              </button>

              <button
                onClick={handleClearLogs}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Xóa nhật ký lỗi"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Thu nhỏ"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 text-xs font-sans">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("cli")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                  activeTab === "cli"
                    ? "bg-emerald-600 text-white shadow-sm font-mono"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Antigravity CLI</span>
              </button>

              <button
                onClick={() => setActiveTab("errors")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                  activeTab === "errors"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Nhật ký Lỗi ({errorCount})</span>
              </button>
            </div>

            {activeTab === "errors" && (
              <button
                onClick={triggerTestError}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 hover:underline cursor-pointer"
                title="Kích hoạt 1 lỗi thử nghiệm"
              >
                🧪 Test lỗi
              </button>
            )}
          </div>

          {/* TAB 1: ANTIGRAVITY CLI INTERACTIVE TERMINAL */}
          {activeTab === "cli" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#06080d]">
              {/* Quick Command Chips */}
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60 overflow-x-auto text-[11px] shrink-0 no-scrollbar font-mono">
                <button
                  onClick={() => handleExecuteCli("agy mcp list")}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 transition-colors font-bold"
                >
                  ⚡ agy mcp list
                </button>
                <button
                  onClick={() => handleExecuteCli('agy -p "Gọi MCP tool get_web_status để kiểm tra web app localhost:3000"')}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/60 text-emerald-400 transition-colors"
                >
                  🌐 MCP Web Status
                </button>
                <button
                  onClick={() => handleExecuteCli('agy -p "Dùng MCP tool validate_sop_compliance kiểm tra câu: Nosew tip quarter 9 SPI"')}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/60 text-amber-300 transition-colors"
                >
                  🛡️ MCP Audit SOP
                </button>
                <button
                  onClick={() => handleExecuteCli("agy models")}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/60 text-sky-400 transition-colors"
                >
                  $ agy models
                </button>
                <button
                  onClick={() => handleExecuteCli("/help")}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/60 text-slate-300 transition-colors"
                >
                  $ /help
                </button>
              </div>

              {/* Terminal Output Area */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs leading-relaxed select-text font-mono">
                {cliEntries.map((entry) => (
                  <div key={entry.id} className="space-y-1">
                    {/* Command prompt line */}
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span className="font-bold">agy&gt;</span>
                        <span className="text-white">{entry.input}</span>
                      </div>
                      <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
                        {entry.durationMs && <span>({entry.durationMs}ms)</span>}
                        <span>{entry.timestamp}</span>
                      </div>
                    </div>

                    {/* Output block */}
                    <pre className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/60 text-slate-300 text-[11px] whitespace-pre-wrap break-words leading-relaxed overflow-x-auto selection:bg-emerald-600 selection:text-white">
                      {entry.output}
                    </pre>
                  </div>
                ))}

                {isExecuting && (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-mono">Antigravity CLI (agy) đang thực thi...</span>
                  </div>
                )}
                <div ref={cliBottomRef} />
              </div>

              {/* Terminal Input Bar */}
              <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 font-mono">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleExecuteCli();
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-emerald-400 font-bold select-none text-xs">agy&gt;</span>
                  <input
                    type="text"
                    value={cliInput}
                    onChange={(e) => setCliInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhập lệnh agy (models, changelog, /help...) hoặc câu hỏi..."
                    disabled={isExecuting}
                    className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isExecuting || !cliInput.trim()}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors cursor-pointer shrink-0"
                    title="Chạy lệnh"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
                <div className="text-[10px] text-slate-500 mt-1.5 flex items-center justify-between font-sans">
                  <span>⚡ Nhấn <strong>Enter</strong> để chạy | <strong>↑/↓</strong> xem lại lệnh trước</span>
                  <span>Tự động đính kèm lỗi &amp; vết thao tác</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BUG & NETWORK ERROR LOGS */}
          {activeTab === "errors" && (
            <div className="flex-1 flex flex-col overflow-hidden font-sans">
              <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/40 border-b border-slate-800/60 text-xs">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    filter === "all" ? "bg-slate-800 text-white font-medium" : "text-slate-400"
                  }`}
                >
                  Tất cả ({events.length})
                </button>
                <button
                  onClick={() => setFilter("errors")}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    filter === "errors" ? "bg-rose-500/20 text-rose-300 font-medium" : "text-slate-400"
                  }`}
                >
                  Lỗi ({errorCount})
                </button>
                <button
                  onClick={() => setFilter("api")}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    filter === "api" ? "bg-amber-500/20 text-amber-300 font-medium" : "text-slate-400"
                  }`}
                >
                  API Thất bại
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs select-text">
                {filteredEvents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 font-sans">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mb-2" />
                    <div className="text-sm text-slate-300 font-semibold">Chưa có lỗi nào phát sinh!</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Hệ thống đang hoạt động trơn tru. Bất kỳ sự cố nào sẽ xuất hiện tại đây.
                    </div>
                  </div>
                ) : (
                  filteredEvents.map((ev) => {
                    const isError = ["error", "unhandledrejection", "fetch_error"].includes(ev.type);
                    const isExpanded = expandedEventId === ev.id;

                    return (
                      <div
                        key={ev.id}
                        className={`rounded-xl border p-3 transition-all ${
                          isError
                            ? "bg-rose-950/20 border-rose-900/50 hover:border-rose-700/60"
                            : "bg-slate-900/40 border-slate-800"
                        }`}
                      >
                        <div
                          className="flex items-start justify-between gap-2 cursor-pointer"
                          onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        >
                          <div className="flex items-start gap-2 flex-1 overflow-hidden">
                            {isError ? (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            ) : (
                              <Activity className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 overflow-hidden">
                              <div className="text-[11px] font-bold text-slate-200 break-words leading-snug">
                                {ev.message}
                              </div>
                              {ev.source && (
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                  📍 {ev.source}
                                </div>
                              )}
                              {ev.url && (
                                <div className="text-[10px] text-amber-300/80 truncate mt-0.5">
                                  🌐 {ev.method} {ev.url} {ev.status ? `(Status: ${ev.status})` : ""}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-500">
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] space-y-2">
                            {ev.responsePreview && (
                              <div>
                                <div className="text-slate-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
                                  Server Response:
                                </div>
                                <pre className="bg-slate-950 p-2 rounded-lg text-rose-300 overflow-x-auto text-[10px] mt-1 border border-slate-800/60">
                                  {ev.responsePreview}
                                </pre>
                              </div>
                            )}

                            {ev.stack && (
                              <div>
                                <div className="text-slate-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
                                  Stack Trace:
                                </div>
                                <pre className="bg-slate-950 p-2 rounded-lg text-slate-300 overflow-x-auto text-[10px] mt-1 border border-slate-800/60 max-h-36">
                                  {ev.stack}
                                </pre>
                              </div>
                            )}

                            {ev.breadcrumbs && ev.breadcrumbs.length > 0 && (
                              <div>
                                <div className="text-slate-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
                                  Thao tác trước khi lỗi (Breadcrumbs):
                                </div>
                                <ul className="mt-1 space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800/60">
                                  {ev.breadcrumbs.slice(-5).map((b, i) => (
                                    <li key={i} className="text-[10px] text-slate-300 flex items-center justify-between gap-2">
                                      <span>👉 {b.action}</span>
                                      <span className="text-slate-500 text-[9px]">{b.timestamp}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
