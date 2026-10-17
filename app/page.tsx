"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { TranslationWorkspace } from "@/components/TranslationWorkspace";
import { PptxTranslator } from "@/components/PptxTranslator";
import { XlsxTranslator } from "@/components/XlsxTranslator";
import { DocumentManager } from "@/components/DocumentManager";
import { GlossaryReview } from "@/components/GlossaryReview";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { SettingsModal } from "@/components/SettingsModal";
import { ThreeBackground } from "@/components/ThreeBackground";
import { Sparkles, Activity } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"translate" | "pptx" | "xlsx" | "documents" | "glossary" | "audit">("translate");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "translator" | "reviewer" | "viewer">("admin");
  const [providerName, setProviderName] = useState<string>("Air-Gapped CAT (Offline)");
  const [threeMode, setThreeMode] = useState<"hybrid" | "constellation" | "cybergrid" | "off">("hybrid");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings?.defaultProvider) {
          const p = data.settings.defaultProvider;
          if (p === "antigravity_cli") setProviderName("Antigravity CLI (agy)");
          else if (p === "gemini") setProviderName(`Google Gemini (${data.settings.geminiModel || "gemini-3.8-flash"})`);
          else if (p === "google_translate") setProviderName("Google Translate + Glossary CAT");
          else if (p === "airgapped") setProviderName("Air-Gapped CAT (Offline)");
          else if (p === "openai") setProviderName(`Cloud (${data.settings.openaiModel || "gpt-4o-mini"})`);
          else if (p === "local_llm") setProviderName(`Local LLM (${data.settings.localLlmModel || "llama3"})`);
          else if (p === "huggingface") setProviderName(`Hugging Face (${data.settings.huggingFaceModel || "opus-mt-en-vi"})`);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#070b14] relative overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      {/* Three.js Dynamic 3D WebGL Background */}
      {threeMode !== "off" && (
        <ThreeBackground mode={threeMode} intensity={0.85} />
      )}

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          openSettings={() => setIsSettingsOpen(true)}
          currentUserRole={currentUserRole}
          setCurrentUserRole={setCurrentUserRole}
          providerName={providerName}
        />

        {/* Main Container - components stay mounted so state is never lost when switching tabs */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
          <div
            className={activeTab === "translate" ? "block" : "hidden"}
            style={{ display: activeTab === "translate" ? "block" : "none" }}
          >
            <TranslationWorkspace />
          </div>
          <div
            className={activeTab === "pptx" ? "block" : "hidden"}
            style={{ display: activeTab === "pptx" ? "block" : "none" }}
          >
            <PptxTranslator />
          </div>
          <div
            className={activeTab === "xlsx" ? "block" : "hidden"}
            style={{ display: activeTab === "xlsx" ? "block" : "none" }}
          >
            <XlsxTranslator />
          </div>
          <div
            className={activeTab === "documents" ? "block" : "hidden"}
            style={{ display: activeTab === "documents" ? "block" : "none" }}
          >
            <DocumentManager onNavigateToGlossary={() => setActiveTab("glossary")} />
          </div>
          <div
            className={activeTab === "glossary" ? "block" : "hidden"}
            style={{ display: activeTab === "glossary" ? "block" : "none" }}
          >
            <GlossaryReview currentUserRole={currentUserRole} />
          </div>
          <div
            className={activeTab === "audit" ? "block" : "hidden"}
            style={{ display: activeTab === "audit" ? "block" : "none" }}
          >
            <AuditLogViewer />
          </div>
        </main>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSettingsSaved={(name) => setProviderName(name)}
        />

        {/* High-Tech Bottom Status Bar with Three.js Controls */}
        <footer className="border-t border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md py-3 px-6 text-center text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 font-medium">Local Security Policy Active</span>
            <span className="text-slate-600">•</span>
            <span>Zero External Persistence</span>
          </div>

          {/* Three.js Mode Controller */}
          <div className="flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl px-2 py-1 text-[11px]">
            <span className="text-slate-400 flex items-center gap-1 font-mono">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              3D Engine:
            </span>
            <button
              type="button"
              onClick={() => setThreeMode("hybrid")}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                threeMode === "hybrid"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Hybrid
            </button>
            <button
              type="button"
              onClick={() => setThreeMode("constellation")}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                threeMode === "constellation"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Constellation
            </button>
            <button
              type="button"
              onClick={() => setThreeMode("cybergrid")}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                threeMode === "cybergrid"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              CyberGrid
            </button>
            <button
              type="button"
              onClick={() => setThreeMode("off")}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                threeMode === "off"
                  ? "bg-slate-800 text-slate-300 border border-slate-700 font-semibold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              2D Eco
            </button>
          </div>

          <div className="font-mono text-[11px] text-slate-600 hidden md:inline">
            Compliant with ISO 27001 & NIST CSF Guidelines
          </div>
        </footer>
      </div>
    </div>
  );
}
