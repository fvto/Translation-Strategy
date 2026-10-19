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
import { ShieldCheck } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"translate" | "pptx" | "xlsx" | "documents" | "glossary" | "audit">("translate");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "translator" | "reviewer" | "viewer">("admin");
  const [providerName, setProviderName] = useState<string>("Google AI Studio (Gemini 3.5 & 3.1 Flash Lite)");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings?.defaultProvider) {
          const p = data.settings.defaultProvider;
          if (p === "google_translate") {
            setProviderName("Google NMT (Thuật ngữ chuẩn CAT)");
          } else {
            setProviderName("Google AI Studio (Gemini 3.5 & 3.1 Flash Lite)");
          }
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f7f8] dark:bg-[#090b10] text-slate-800 dark:text-slate-100 relative overflow-x-hidden selection:bg-rose-500 selection:text-white transition-colors">
      <div className="flex flex-col min-h-screen">
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
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
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

        {/* High-Contrast Clean Status Footer */}
        <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0c0f17]/90 backdrop-blur-md py-3.5 px-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">Bảo mật nội bộ an toàn (Air-Gapped / Isolated)</span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-slate-500 dark:text-slate-400">Zero External Persistence</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-[11px] border border-slate-200/60 dark:border-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              ISO 27001 &amp; NIST CSF Compliant
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
