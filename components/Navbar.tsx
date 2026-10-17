"use client";

import React, { useState, useEffect } from "react";
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
  Sun,
  Moon,
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
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);

      if (isDark) {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      } else {
        setTheme("light");
        document.documentElement.classList.remove("dark");
      }
    } catch {}
  }, []);

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains("dark");
    const nextTheme = isCurrentlyDark ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#0c0f17]/95 backdrop-blur-md sticky top-0 z-40 transition-colors shadow-2xs">
      {/* Top Security Banner - High Contrast Editorial Style */}
      <div className="bg-slate-50 dark:bg-[#080a10] border-b border-slate-200/60 dark:border-slate-800/80 px-4 sm:px-6 py-1.5 text-xs flex items-center justify-between text-slate-600 dark:text-slate-400">
        <div className="flex items-center space-x-2">
          <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="font-semibold tracking-wider text-slate-700 dark:text-slate-200 text-[11px] uppercase">
            Không gian dịch thuật bảo mật nội bộ
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
            Chế độ biệt lập Air-Gapped / Zero-Persist
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-0.5 rounded-full border border-slate-200/80 dark:border-slate-700 font-medium shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Engine: {providerName}
          </span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-4">
        {/* Brand Logo - Pinterest Accent */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-[#E60023] dark:bg-[#FF334B] text-white flex items-center justify-center font-bold text-sm shadow-sm transition-transform hover:scale-105">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                SecureTranslator
              </span>
              <span className="bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                SOP Pro
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Từ điển chuẩn hóa &amp; Đảm bảo chất lượng sản xuất
            </p>
          </div>
        </div>

        {/* Center Tabs - Pinterest Signature Pill Navigation */}
        <nav className="flex items-center space-x-1 bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-full border border-slate-200/70 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("translate")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "translate"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pptx")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "pptx"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <Presentation className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Dịch PPTX</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === "pptx"
                  ? "bg-rose-600 dark:bg-rose-500 text-white"
                  : "bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300"
              }`}
            >
              ISQ
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("xlsx")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "xlsx"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Dịch Excel</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === "xlsx"
                  ? "bg-emerald-600 dark:bg-emerald-500 text-white"
                  : "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              Tech Pack
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "documents"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Tài liệu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("glossary")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "glossary"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Thuật ngữ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeTab === "audit"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Light / High-Contrast Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối (tương phản cao)"}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-amber-400 transition-colors cursor-pointer"
            title={theme === "dark" ? "Giao diện sáng (Pinterest Light)" : "Giao diện tối (High-Contrast Dark)"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Role selector - Pill */}
          <div className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-colors">
            <UserCheck className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">Role:</span>
            <select
              value={currentUserRole}
              onChange={(e) => setCurrentUserRole(e.target.value as any)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer capitalize"
            >
              <option value="admin" className="dark:bg-slate-900">Admin</option>
              <option value="reviewer" className="dark:bg-slate-900">Reviewer</option>
              <option value="translator" className="dark:bg-slate-900">Translator</option>
              <option value="viewer" className="dark:bg-slate-900">Viewer</option>
            </select>
          </div>

          <button
            onClick={openSettings}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="Cài đặt hệ thống"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
