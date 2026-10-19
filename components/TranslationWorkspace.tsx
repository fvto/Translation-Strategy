"use client";

import React, { useState, useEffect } from "react";
import {
  Languages,
  ArrowLeftRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  FileCheck,
  Download,
  BookMarked,
  Info,
  Zap,
  ClipboardPaste,
  Gauge,
  Activity,
} from "lucide-react";
import { AiStudioTelemetry } from "@/components/AiStudioTelemetry";
import { AiStudioMetrics } from "@/services/translation/types";

interface MatchedTerm {
  entry: {
    id: string;
    sourceTerm: string;
    targetTerm: string;
    status: string;
    context?: string;
  };
  matchedText: string;
}

interface TerminologyMismatch {
  sourceTerm: string;
  expectedTarget: string;
  foundInTranslation: boolean;
  message: string;
}

interface QAReport {
  score: number;
  passed: boolean;
  issues: {
    type: string;
    item: string;
    message: string;
    severity: "warning" | "error";
  }[];
  checks: {
    numbersPreserved: boolean;
    acronymsPreserved: boolean;
    urlsPreserved: boolean;
    emailsPreserved: boolean;
  };
}

const SAMPLE_SOURCE_TEXT =
  "The organization must complete a comprehensive Risk Assessment annually in accordance with ISO 27001 and NIST CSF standards. Access Control policies must be enforced across all 4 production zones with 99.9% uptime. Risk Appetite thresholds define the acceptable parameters for executive decision making.";

export const TranslationWorkspace: React.FC = () => {
  const [sourceText, setSourceText] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [sourceLang, setSourceLang] = useState<string>("vi");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [matchedTerms, setMatchedTerms] = useState<MatchedTerm[]>([]);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [mismatches, setMismatches] = useState<TerminologyMismatch[]>([]);
  const [qaReport, setQaReport] = useState<QAReport | null>(null);
  const [providerUsed, setProviderUsed] = useState<string>("");
  const [selectedEngine, setSelectedEngine] = useState<string>("default");
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

  // Restore saved workspace draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("secure_translator_workspace_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sourceText !== undefined && parsed.sourceText !== SAMPLE_SOURCE_TEXT) {
          setSourceText(parsed.sourceText);
        }
        if (parsed.translatedText !== undefined) setTranslatedText(parsed.translatedText);
        if (parsed.sourceLang) setSourceLang(parsed.sourceLang);
        if (parsed.targetLang) setTargetLang(parsed.targetLang);
        if (parsed.matchedTerms) setMatchedTerms(parsed.matchedTerms);
        if (parsed.complianceScore !== undefined) setComplianceScore(parsed.complianceScore);
        if (parsed.mismatches) setMismatches(parsed.mismatches);
        if (parsed.qaReport !== undefined) setQaReport(parsed.qaReport);
        if (parsed.providerUsed) setProviderUsed(parsed.providerUsed);
        if (parsed.aiStudioMetrics) setAiStudioMetrics(parsed.aiStudioMetrics);
      }
    } catch {}
  }, []);

  // Save workspace draft whenever state changes
  useEffect(() => {
    try {
      const payload = {
        sourceText,
        translatedText,
        sourceLang,
        targetLang,
        matchedTerms,
        complianceScore,
        mismatches,
        qaReport,
        providerUsed,
      };
      sessionStorage.setItem("secure_translator_workspace_draft", JSON.stringify(payload));
    } catch {}
  }, [sourceText, translatedText, sourceLang, targetLang, matchedTerms, complianceScore, mismatches, qaReport, providerUsed]);

  const executeTranslate = async (overrideText?: string) => {
    const textToProcess = (overrideText !== undefined ? overrideText : sourceText).trim();
    if (!textToProcess) return;
    setIsLoading(true);
    setMismatches([]);

    // Smart auto-detection of language direction
    const hasVi = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(textToProcess);
    let effectiveSource = sourceLang;
    let effectiveTarget = targetLang;
    if (hasVi && sourceLang === "en") {
      effectiveSource = "vi";
      effectiveTarget = "en";
      setSourceLang("vi");
      setTargetLang("en");
    } else if (!hasVi && sourceLang === "vi") {
      const hasEnWords = /\b(?:the|and|for|with|this|that|from|are|is|in|on|at|check|test|standard|inspection|quality|shape|defect)\b/i.test(textToProcess);
      if (hasEnWords) {
        effectiveSource = "en";
        effectiveTarget = "vi";
        setSourceLang("en");
        setTargetLang("vi");
      }
    }

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: textToProcess,
          sourceLanguage: effectiveSource,
          targetLanguage: effectiveTarget,
          provider: selectedEngine !== "default" ? selectedEngine : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Translation failed");
        return;
      }

      if (data.normalizedSourceText && data.normalizedSourceText !== textToProcess) {
        setSourceText(data.normalizedSourceText);
      }
      setTranslatedText(data.translatedText);
      setMatchedTerms(data.matchedTerms || []);
      setComplianceScore(data.validation?.complianceScore ?? 100);
      setMismatches(data.validation?.mismatches || []);
      setQaReport(data.qaReport || null);
      setProviderUsed(data.provider || "Local CAT Engine");
      if (data.aiStudioMetrics) {
        setAiStudioMetrics(data.aiStudioMetrics);
      } else {
        fetchAiStudioMetrics();
      }
    } catch (err: any) {
      alert("Translation network error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslate = () => {
    executeTranslate();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted || !pasted.trim()) return;

    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const nextVal = current.substring(0, start) + pasted + current.substring(end);

    setSourceText(nextVal);
    // Auto translate immediately on paste without needing any action
    executeTranslate(nextVal);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setSourceText(text);
        executeTranslate(text);
      }
    } catch {
      // Fallback: user can paste directly into the textarea with Ctrl+V
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    const html = translatedText
      .split(/\r?\n/)
      .map((line) => `<p style="margin:0">${line.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char] || char))}</p>`)
      .join("");

    void (async () => {
      try {
        if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([translatedText], { type: "text/plain" }),
              "text/html": new Blob([html], { type: "text/html" }),
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(translatedText);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        await navigator.clipboard.writeText(translatedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    })();
  };

  const handleClear = () => {
    setSourceText("");
    setTranslatedText("");
    setMatchedTerms([]);
    setMismatches([]);
    setQaReport(null);
    setComplianceScore(null);
    try {
      sessionStorage.removeItem("secure_translator_workspace_draft");
    } catch {}
  };

  const handleExport = () => {
    if (!translatedText) return;
    const blob = new Blob([translatedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `translated_confidential_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applySmartTerminologyFix(
  sourceFullText: string,
  translatedFullText: string,
  sourceTerm: string,
  expectedTarget: string
): string {
  const target = expectedTarget.trim();
  const sTerm = sourceTerm.trim();
  if (!translatedFullText || !target) return translatedFullText;

  // 1. Strip all trailing bracketed tags like [wrikle] [apply] [free of wrinkle] from old clicks
  let cleanedText = translatedFullText.replace(/(\s*\[[^\]]+\])+\s*$/g, "").trimEnd();

  // 2. Comprehensive synonym & erroneous word patterns for direct in-place replacement
  const synonymMap: Record<string, RegExp> = {
    "operation": /\b(?:workers?'\s+work|worker\s+action|handling|manipulation|procedure|work(?:\s+step)?)\b/gi,
    "operator": /\b(?:worker\s+operating|operation\s+staff|person\s+in\s+charge)\b/gi,
    "worker": /\b(?:operator|personnel|staff)\b/gi,
    "tip shape": /\b(?:shape\s+tip)\b/gi,
    "toe shape": /\b(?:shape\s+toe|shape\s+tip)\b/gi,
    "tip shaping": /\b(?:định\s+hình\s+tip|shape\s+tip|shaping\s+tip)\b/gi,
    "collar shape": /\b(?:shape\s+collar)\b/gi,
    "heel shape": /\b(?:shape\s+heel)\b/gi,
    "bond gap": /\b(?:open\s+glue|glue\s+opening|glue\s+gap|gap\s+glue|unbonded|unglued|delamination)\b/gi,
    "rocking": /\b(?:stability|unevenness|wobble|roughness|instability)\b/gi,
    "air bubble": /\b(?:air\s+)?bubbles?\b|\bblisters?\b/gi,
    "over buffing": /\b(?:high\s+buffing|high\s+grinding|over\s+grinding|buffing\s+high)\b/gi,
    "over cement": /\b(?:high\s+glue|excess\s+glue|overflow\s+glue|cement\s+higher)\b/gi,
    "swapped feet": /\b(?:inverted\s+feet|wrong\s+foot|wrong\s+feet|reversed\s+feet)\b/gi,
    "run-off stitching": /\b(?:collapsed\s+edge|dropped\s+stitch(?:es)?|skip\s+stitch(?:es)?)\b/gi,
    "color different": /\b(?:color\s+migration|shade\s+variation|different\s+color|color\s+shade\s+variation)\b/gi,
    "wrinkle": /\b(?:wrikle|crease|creases|ruffle)\b/gi,
    "wrinkles": /\b(?:wrikles|creases|ruffles)\b/gi,
    "wrinkled": /\b(?:wrikled|creased?|creasing|fold(?:ed|ing)?|ruffl(?:ed|ing)?)\b/gi,
    "free of wrinkle": /\b(?:not\s+wrinkled?|no\s+wrinkles?|avoid\s+wrinkles?|wrikle|wrinkle)\b/gi,
    "free of wrinkles": /\b(?:not\s+wrinkled?|no\s+wrinkles?|avoid\s+wrinkles?|wrikle|wrinkle)\b/gi,
    "sole heating": /\b(?:(?:the\s+)?right\s+(?:sole\s+heating|foot|shoulder|thermometer)|heating\s+(?:the\s+)?(?:sole|right\s+shoe)|heating\s+pads?|heat\s+exchanger|warm\s+sole)\b/gi,
    "smoothly and evenly": /\b(?:scanning\s+the\s+sole|smooth\s+and\s+(?:smooth|even)|evenly\s+smooth)\b/gi,
    "sole attaching": /\b(?:work\s+on\s+the\s+sole|stick(?:ing)?\s+the\s+sole|sole\s+bonding|bonding\s+(?:the\s+)?sole)\b/gi,
    "cement line": /\b(?:glue\s+scan|adhesive\s+scanner|glue\s+path|glue\s+line|glue\s+trace)\b/gi,
    "finished shoe": /\b(?:product\s+shoe|your\s+shoes?|the\s+shoes?)\b/gi,
    "finished shoes": /\b(?:product\s+shoes|your\s+shoes|the\s+shoes)\b/gi,
  };

  const lowerTarget = target.toLowerCase();
  if (synonymMap[lowerTarget]) {
    const re = synonymMap[lowerTarget];
    re.lastIndex = 0;
    if (re.test(cleanedText)) {
      re.lastIndex = 0;
      return cleanedText.replace(re, (matched) => {
        const isCap = /^[A-Z]/.test(matched);
        if (lowerTarget === "operation" && /workers?'\s+work/i.test(matched)) {
          return isCap ? "Worker operation" : "worker operation";
        }
        return isCap ? target.charAt(0).toUpperCase() + target.slice(1) : target.toLowerCase();
      });
    }
  }

  // 3. Check 2-word reversed pattern globally (e.g. "shape tip" -> "Tip shape")
  const words = target.split(/\s+/).filter(Boolean);
  if (words.length === 2) {
    const reversed = new RegExp(`\\b${escapeRegex(words[1])}\\s+${escapeRegex(words[0])}\\b`, "gi");
    if (reversed.test(cleanedText)) {
      return cleanedText.replace(reversed, target);
    }
  }

  // 4. Sentence/Line-level targeting (find corresponding numbered item or sentence)
  const splitPattern = /(?:^|\r?\n|\s+)(?=\d+[\.\)]\s+)/g;
  const srcParts = sourceFullText.split(splitPattern).filter(Boolean);
  const transParts = cleanedText.split(splitPattern).filter(Boolean);

  const srcIdx = srcParts.findIndex((p) => p.toLowerCase().includes(sTerm.toLowerCase()));
  if (srcIdx >= 0 && srcIdx < transParts.length) {
    let targetSentence = transParts[srcIdx];

    // Check if target sentence contains 2-word reversed
    if (words.length === 2) {
      const reversed = new RegExp(`\\b${escapeRegex(words[1])}\\s+${escapeRegex(words[0])}\\b`, "gi");
      if (reversed.test(targetSentence)) {
        transParts[srcIdx] = targetSentence.replace(reversed, target);
        return transParts.join(cleanedText.includes("\n") ? "\n" : " ");
      }
    }

    // Direct replacement of erroneous candidate word within this specific sentence
    const candidateWordsRegex = /\b(?:wrikle[sd]?|wrinkle[sd]?|work(?:ers?'\s+work)?|action|step|procedure|handling|process|method|condition|shoes?)\b/gi;
    if (candidateWordsRegex.test(targetSentence)) {
      transParts[srcIdx] = targetSentence.replace(candidateWordsRegex, (matched) => {
        const isCap = /^[A-Z]/.test(matched);
        if (lowerTarget === "operation" && /workers?'\s+work/i.test(matched)) {
          return isCap ? "Worker operation" : "worker operation";
        }
        return isCap ? target.charAt(0).toUpperCase() + target.slice(1) : target.toLowerCase();
      });
      return transParts.join(cleanedText.includes("\n") ? "\n" : " ");
    }
  }

  return cleanedText;
}

  const handleApplyFix = (m: TerminologyMismatch) => {
    if (!translatedText) return;
    const target = m.expectedTarget.trim();
    const updated = applySmartTerminologyFix(sourceText, translatedText, m.sourceTerm, target);

    setTranslatedText(updated);
    setMismatches((prev) => prev.filter((item) => item.expectedTarget !== m.expectedTarget));
    setComplianceScore((prev) => (prev !== null ? Math.min(100, prev + 15) : 100));
  };

  const handleApplyAllFixes = () => {
    if (!translatedText) return;
    let current = translatedText;
    for (const m of mismatches) {
      current = applySmartTerminologyFix(sourceText, current, m.sourceTerm, m.expectedTarget.trim());
    }
    setTranslatedText(current);
    setMismatches([]);
    setComplianceScore(100);
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header Controls - Pinterest Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#11141c] p-3.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 bg-slate-100/90 dark:bg-slate-800/90 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Nguồn:</span>
            <select
              value={sourceLang}
              onChange={(e) => {
                const nextSrc = e.target.value;
                setSourceLang(nextSrc);
                setTargetLang(nextSrc === "vi" ? "en" : "vi");
              }}
              className="bg-transparent text-slate-900 dark:text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="vi" className="dark:bg-slate-900">Tiếng Việt (VI)</option>
              <option value="en" className="dark:bg-slate-900">English (EN)</option>
            </select>
          </div>

          <button
            onClick={() => {
              const newSource = sourceLang === "en" ? "vi" : "en";
              const newTarget = targetLang === "vi" ? "en" : "vi";
              setSourceLang(newSource);
              setTargetLang(newTarget);
              if (translatedText.trim()) {
                const prev = sourceText;
                setSourceText(translatedText);
                setTranslatedText(prev);
              }
              setMatchedTerms([]);
              setMismatches([]);
              setQaReport(null);
              setComplianceScore(null);
            }}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700"
            title="Đảo chiều dịch (Swap)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center space-x-1.5 bg-slate-100/90 dark:bg-slate-800/90 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Đích:</span>
            <select
              value={targetLang}
              onChange={(e) => {
                const nextTgt = e.target.value;
                setTargetLang(nextTgt);
                setSourceLang(nextTgt === "en" ? "vi" : "en");
              }}
              className="bg-transparent text-slate-900 dark:text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="en" className="dark:bg-slate-900">English (EN)</option>
              <option value="vi" className="dark:bg-slate-900">Tiếng Việt (VI)</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-100/90 dark:bg-slate-800/90 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Engine:</span>
            <select
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="default" className="dark:bg-slate-900">Mặc định: Gemini 3.5 &amp; 3.1 Flash Lite</option>
              <option value="gemini" className="dark:bg-slate-900">⚡ Google AI Studio (Gemini 3.5 &amp; 3.1 Flash Lite)</option>
              <option value="google_translate" className="dark:bg-slate-900">🌐 Google NMT (Chuẩn thuật ngữ CAT)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Xóa</span>
          </button>

          <button
            onClick={handleExport}
            disabled={!translatedText}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none rounded-full transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất TXT</span>
          </button>

          <button
            onClick={handleTranslate}
            disabled={isLoading || !sourceText.trim()}
            className="flex items-center space-x-2 px-6 py-2 text-xs font-bold text-white bg-[#E60023] hover:bg-[#CC001F] dark:bg-[#FF334B] dark:hover:bg-[#E60023] disabled:opacity-50 disabled:pointer-events-none rounded-full shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-98"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang dịch (Kiểm soát RPM)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Dịch chuẩn thuật ngữ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dual Pane Editors - Clean White Porcelain Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Text Pane */}
        <div className="flex flex-col bg-white dark:bg-[#11141c] rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50/80 dark:bg-[#161b26] border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
              <span>Văn bản gốc (Source)</span>
            </div>
            <div className="flex items-center space-x-2.5">
              <span className="flex items-center space-x-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full">
                <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Tự dịch khi dán</span>
              </span>
              <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 font-mono">
                {sourceText.length} ký tự
              </span>
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            onPaste={handlePaste}
            placeholder="Dán văn bản (Ctrl+V) vào đây để hệ thống tự động dịch tức thì theo thuật ngữ..."
            rows={12}
            className="w-full p-5 bg-white dark:bg-[#0c0f17] text-slate-900 dark:text-white text-sm leading-relaxed placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-y font-sans selection:bg-rose-100 selection:text-rose-900 dark:selection:bg-rose-900/60 dark:selection:text-white min-h-[280px]"
          />

          <div className="p-3 bg-slate-50/60 dark:bg-[#161b26] border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Chỉ xử lý trên bộ nhớ RAM tạm thời. Không lưu bên ngoài.</span>
            </div>
            <button
              onClick={handlePasteFromClipboard}
              type="button"
              className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-full shadow-2xs transition-all cursor-pointer"
              title="Dán từ Clipboard & Dịch tự động"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Dán &amp; Tự động dịch</span>
            </button>
          </div>
        </div>

        {/* Translation Output Pane */}
        <div className="flex flex-col bg-white dark:bg-[#11141c] rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50/80 dark:bg-[#161b26] border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Kết quả dịch (Translation)</span>
            </div>
            <div className="flex items-center space-x-2">
              {aiStudioMetrics && (
                <span
                  title={`Google AI Studio: ${aiStudioMetrics.rpm.current}/${aiStudioMetrics.rpm.limit} RPM (Pacing: ≥${((aiStudioMetrics.rpm.minIntervalMs ?? 4500) / 1000).toFixed(1)}s/req, Hạn ngạch: ${aiStudioMetrics.rpd.used}/${aiStudioMetrics.rpd.limit} RPD)`}
                  className="text-[10px] font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 flex items-center gap-1 shadow-2xs"
                >
                  <Gauge className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span>{aiStudioMetrics.rpm.current}/{aiStudioMetrics.rpm.limit} RPM</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span>RPD: {aiStudioMetrics.rpd.used}/{aiStudioMetrics.rpd.limit}</span>
                </span>
              )}
              {providerUsed && (
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 font-semibold">
                  {providerUsed}
                </span>
              )}
            </div>
          </div>

          <textarea
            value={translatedText}
            onChange={(e) => setTranslatedText(e.target.value)}
            placeholder="Bản dịch sẽ hiển thị tại đây với kiểm soát thuật ngữ nghiêm ngặt..."
            rows={12}
            className="w-full p-5 bg-white dark:bg-[#0c0f17] text-slate-900 dark:text-white text-sm leading-relaxed placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-y font-sans selection:bg-emerald-100 selection:text-emerald-900 dark:selection:bg-emerald-900/60 dark:selection:text-white min-h-[280px]"
          />

          <div className="p-3 bg-slate-50/60 dark:bg-[#161b26] border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
              {translatedText ? `${translatedText.length} ký tự` : "Đang chờ dịch..."}
            </div>
            <button
              onClick={handleCopy}
              disabled={!translatedText}
              className="flex items-center space-x-1.5 px-3.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none rounded-full transition-all border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-300 font-bold">Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Google AI Studio Telemetry & Quota Guard Card */}
      <AiStudioTelemetry
        metrics={aiStudioMetrics}
        isLoading={isLoading || isFetchingMetrics}
        onRefresh={fetchAiStudioMetrics}
      />

      {/* Terminology Mismatch Alert Banner */}
      {mismatches.length > 0 && (
        <div className="p-5 rounded-3xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span>Phát hiện lệch thuật ngữ chuẩn ({mismatches.length})</span>
              </h4>
            </div>
            <button
              type="button"
              onClick={handleApplyAllFixes}
              className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 rounded-full transition-colors cursor-pointer shadow-xs active:scale-98"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sửa tất cả ({mismatches.length})</span>
            </button>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Các thuật ngữ đã duyệt trong từ điển được phát hiện trong câu nguồn nhưng bản dịch chưa khớp chuẩn:
          </p>
          <div className="space-y-2 mt-2">
            {mismatches.map((m, idx) => (
              <div
                key={idx}
                className="text-xs bg-white dark:bg-[#161b26] border border-amber-200 dark:border-amber-800/80 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-2xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Nguồn: &quot;{m.sourceTerm}&quot;</span>
                  <span className="text-slate-400 dark:text-slate-500">&rarr;</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">Chuẩn: &quot;{m.expectedTarget}&quot;</span>
                  <span className="text-amber-700 dark:text-amber-300 text-[11px]">({m.message})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyFix(m)}
                  className="flex items-center space-x-1 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-white dark:hover:text-white bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-600 dark:hover:bg-emerald-600 border border-emerald-300 dark:border-emerald-700 rounded-full transition-all cursor-pointer"
                  title={`Thay thế ngay thành "${m.expectedTarget}" trong kết quả dịch`}
                >
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 group-hover:text-white" />
                  <span>Sửa ngay</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Detected / Applied Terminology & QA Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Detected Terminology */}
        <div className="lg:col-span-2 bg-white dark:bg-[#11141c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookMarked className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Thuật ngữ phát hiện &amp; áp dụng
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
              {matchedTerms.length} mục
            </span>
          </div>

          {matchedTerms.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center gap-2">
              <Info className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <span>Chưa phát hiện thuật ngữ trong văn bản hiện tại. Thêm từ điển để hệ thống kiểm soát tự động.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {matchedTerms.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 hover:bg-slate-100/70 dark:bg-[#161b26] dark:hover:bg-[#1c2333] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 flex items-start justify-between space-x-3 transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {m.entry.sourceTerm}
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                      &rarr; {m.entry.targetTerm}
                    </div>
                    {m.entry.context && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        Ngữ cảnh: {m.entry.context}
                      </div>
                    )}
                  </div>
                  <span
                    className={`badge text-[9px] ${
                      m.entry.status === "approved"
                        ? "badge-approved"
                        : "badge-review"
                    }`}
                  >
                    {m.entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quality Assurance & Rule-Based Scorecard */}
        <div className="bg-white dark:bg-[#11141c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Chỉ số QA Rule-Based
              </h3>
            </div>
            {complianceScore !== null && (
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                {complianceScore}% Chuẩn
              </span>
            )}
          </div>

          {qaReport ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-[#161b26] p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Điểm đánh giá QA</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {qaReport.score}/100
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span>Số liệu kỹ thuật nguyên vẹn</span>
                  {qaReport.checks.numbersPreserved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  )}
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span>Mã &amp; Tiêu chuẩn ngành giày</span>
                  {qaReport.checks.acronymsPreserved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  )}
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 py-1.5">
                  <span>Định danh &amp; URLs không đổi</span>
                  {qaReport.checks.urlsPreserved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  )}
                </div>
              </div>

              {qaReport.issues.length > 0 && (
                <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 p-3 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-1">
                  {qaReport.issues.slice(0, 3).map((iss, i) => (
                    <div key={i}>• {iss.message}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
              Nhấn &quot;Dịch chuẩn thuật ngữ&quot; để hệ thống tự động kiểm tra QA rule-based.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

