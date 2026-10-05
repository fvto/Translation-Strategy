"use client";

import React from "react";
import {
  ShieldCheck,
  Languages,
  BookOpen,
  FileText,
  Activity,
  Settings,
  Lock,
  UserCheck,
  Presentation,
  FileSpreadsheet,
} from "lucide-react";

interface NavbarProps {
  activeTab: "translate" | "pptx" | "xlsx" | "documents" | "glossary" | "audit";
  setActiveTab: (tab: "translate" | "pptx" | "xlsx" | "documents" | "glossary" | "audit") => void;
  openSettings: () => void;
  currentUserRole: string;
  setCurrentUserRole: (role: "admin" | "translator" | "reviewer" | "viewer") => void;
  providerName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  openSettings,
  currentUserRole,
  setCurrentUserRole,
  providerName,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#0c1222]/90 backdrop-blur-md sticky top-0 z-40">
      {/* Top Security Banner */}
      <div className="bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-950 border-b border-blue-900/30 px-4 py-1 text-xs flex items-center justify-between text-blue-300">
        <div className="flex items-center space-x-2">
          <Lock className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold tracking-wider uppercase">
            Confidential Internal Workspace
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 text-[11px]">
            Zero-Persist Temporary Mode Active
          </span>
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Provider: {providerName}
          </span>
          <span className="text-slate-400 hidden sm:inline">
            Local Isolated Storage
          </span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg text-white tracking-tight">
                SecureTranslator
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-700">
                CAT v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Controlled Business Vocabulary & QA
            </p>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab("translate")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "translate"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pptx")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "pptx"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Presentation className="w-4 h-4 text-amber-400" />
            <span>Dịch PPTX (VI ➔ EN)</span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] px-1 rounded font-mono">
              Shield
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("xlsx")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "xlsx"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Dịch Excel (XLSX)</span>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] px-1 rounded font-mono">
              Tech Pack
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "documents"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Reference Files</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("glossary")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "glossary"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Glossary Review</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeTab === "audit"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Audit Logs</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center space-x-3">
          {/* Role selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] text-slate-400 hidden sm:inline">Role:</span>
            <select
              value={currentUserRole}
              onChange={(e) => setCurrentUserRole(e.target.value as any)}
              className="bg-transparent text-xs text-blue-300 font-semibold focus:outline-none cursor-pointer capitalize"
            >
              <option value="admin" className="bg-slate-900 text-slate-200">Admin</option>
              <option value="reviewer" className="bg-slate-900 text-slate-200">Reviewer</option>
              <option value="translator" className="bg-slate-900 text-slate-200">Translator</option>
              <option value="viewer" className="bg-slate-900 text-slate-200">Viewer</option>
            </select>
          </div>

          <button
            onClick={openSettings}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title="System Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
