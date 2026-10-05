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

export default function Home() {
  const [activeTab, setActiveTab] = useState<"translate" | "pptx" | "xlsx" | "documents" | "glossary" | "audit">("translate");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "translator" | "reviewer" | "viewer">("admin");
  const [providerName, setProviderName] = useState<string>("Air-Gapped CAT (Offline)");

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
    <div className="flex flex-col min-h-screen bg-[#070b14]">
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

      {/* Subtle Bottom Status Bar */}
      <footer className="border-t border-slate-900 bg-[#090d16] py-3 px-6 text-center text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Local Security Policy Active</span>
          <span>•</span>
          <span>Zero External Persistence</span>
        </div>
        <div className="font-mono text-[11px] text-slate-600">
          Compliant with ISO 27001 & NIST CSF Guidelines
        </div>
      </footer>
    </div>
  );
}
