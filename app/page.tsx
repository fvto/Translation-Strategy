"use client";

import React, { useState, useEffect } from "react";
import { Navbar, WORKSPACE_TABS, WorkspaceTab } from "@/components/Navbar";
import { NothingWorkspaceHero } from "@/components/NothingIdentity";
import { TranslationWorkspace } from "@/components/TranslationWorkspace";
import { PptxTranslator } from "@/components/PptxTranslator";
import { XlsxTranslator } from "@/components/XlsxTranslator";
import { DocumentManager } from "@/components/DocumentManager";
import { GlossaryReview } from "@/components/GlossaryReview";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { SettingsModal } from "@/components/SettingsModal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("translate");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "translator" | "reviewer" | "viewer">("admin");
  const [providerName, setProviderName] = useState("Google AI Studio");

  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => {
      const names: Record<string, string> = { gemini: "Google AI Studio", google_translate: "Google NMT", airgapped: "Offline CAT", local_llm: "Local LLM", antigravity_cli: "Antigravity CLI", openai: "OpenAI", huggingface: "Hugging Face", ctranslate2: "Local NMT" };
      if (data.settings?.defaultProvider) setProviderName(names[data.settings.defaultProvider] || data.settings.defaultProvider);
    }).catch(() => {});
  }, []);

  const switchTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const toolPanel = (tab: WorkspaceTab, children: React.ReactNode) => <section id={`tool-panel-${tab}`} key={tab} data-tool={tab} role="tabpanel" aria-labelledby={`tool-tab-${tab}`} hidden={activeTab !== tab} className={`n-tool-panel ${activeTab !== tab ? "hidden" : ""}`}>{children}</section>;

  return <div className="n-app-shell">
    <Navbar activeTab={activeTab} setActiveTab={switchTab} openSettings={() => setIsSettingsOpen(true)} currentUserRole={currentUserRole} setCurrentUserRole={setCurrentUserRole} providerName={providerName} />
    <main id="workspace-main" className="n-main" tabIndex={-1}>
      {activeTab === "translate" && <NothingWorkspaceHero />}
      <section className="n-workspace-tools" aria-label="Công cụ làm việc">
        <div className="n-section-topline"><p className="n-eyebrow">01 / KHÔNG GIAN LÀM VIỆC</p><span className="n-engine-indicator"><i />{providerName}</span></div>
        <div className="n-tool-tabs" role="tablist" aria-label="Chọn công cụ" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = tabs.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next].focus(); tabs[next].click();
        }}>
          {WORKSPACE_TABS.map((tab) => <button id={`tool-tab-${tab.id}`} key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`tool-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} className={`n-tool-tab ${activeTab === tab.id ? "is-active" : ""}`} onClick={() => switchTab(tab.id)}><span>{tab.code}</span>{tab.label}<i /></button>)}
        </div>
      </section>
      {toolPanel("translate", <TranslationWorkspace />)}
      {toolPanel("pptx", <PptxTranslator />)}
      {toolPanel("xlsx", <XlsxTranslator />)}
      {toolPanel("documents", <DocumentManager onNavigateToGlossary={() => switchTab("glossary")} />)}
      {toolPanel("glossary", <GlossaryReview currentUserRole={currentUserRole} />)}
      {toolPanel("audit", <AuditLogViewer />)}
    </main>
    <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSettingsSaved={setProviderName} />
    <footer className="n-footer"><span>CHINGLUH / TRANSLATION WORKSPACE</span><span>VI ⇄ EN <i /> TỪ NGỮ CHÍNH XÁC. TÀI LIỆU NHẤT QUÁN.</span></footer>
  </div>;
}
