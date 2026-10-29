"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, Moon, Settings, Sun, X } from "lucide-react";
import { NothingWordmark } from "./NothingIdentity";

export const WORKSPACE_TABS = [
  { id: "translate", label: "Văn bản", menuLabel: "Dịch văn bản", code: "01", note: "Dịch & đối chiếu từng câu" },
  { id: "pptx", label: "PowerPoint", menuLabel: "Dịch PowerPoint", code: "02", note: "Giữ nguyên hình thức tài liệu" },
  { id: "xlsx", label: "Excel", menuLabel: "Dịch Excel", code: "03", note: "Bảng tính & công thức" },
  { id: "documents", label: "Tài liệu", menuLabel: "Kho tài liệu", code: "04", note: "Quản lý tài liệu làm việc" },
  { id: "glossary", label: "Thuật ngữ", menuLabel: "Từ điển chuyên ngành", code: "05", note: "Một thuật ngữ, một tiêu chuẩn" },
  { id: "audit", label: "Nhật ký", menuLabel: "Nhật ký thao tác", code: "06", note: "Theo dõi quá trình xử lý" },
] as const;
export type WorkspaceTab = typeof WORKSPACE_TABS[number]["id"];

interface NavbarProps {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  openSettings: () => void;
  currentUserRole: string;
  setCurrentUserRole: (role: "admin" | "translator" | "reviewer" | "viewer") => void;
  providerName: string;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, openSettings, currentUserRole, setCurrentUserRole, providerName }) => {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  useEffect(() => { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);
  useEffect(() => {
    if (!isMenuOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [isMenuOpen]);
  const toggleTheme = () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  };
  const openMenu = () => { if (!menuRef.current?.open) { menuRef.current?.showModal(); setIsMenuOpen(true); } };
  const closeMenu = async (after?: () => void) => {
    const menu = menuRef.current;
    if (!menu || closingRef.current) return;
    closingRef.current = true;
    if (menu.open && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await menu.animate([{ opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, -8px)" }], { duration: 140, easing: "ease-in" }).finished.catch(() => {});
    }
    menu.close(); setIsMenuOpen(false); closingRef.current = false; after?.();
  };
  return <>
    <a className="n-skip-link" href="#workspace-main">Đến nội dung làm việc</a>
    <header className="n-topbar">
      <button className="n-shell-icon" onClick={openMenu} aria-label="Mở menu điều hướng" aria-expanded={isMenuOpen} aria-controls="nothing-navigation" aria-haspopup="dialog"><Menu size={19} strokeWidth={1.25} /></button>
      <button className="n-brand" onClick={() => setActiveTab("translate")} aria-label="Về không gian dịch văn bản"><NothingWordmark /></button>
      <div className="n-topbar-actions"><button className="n-shell-icon" onClick={toggleTheme} aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><button className="n-shell-icon" onClick={openSettings} aria-label="Cài đặt hệ thống" title="Cài đặt hệ thống"><Settings size={17} strokeWidth={1.25} /></button></div>
    </header>
    <dialog id="nothing-navigation" ref={menuRef} className="n-menu" aria-labelledby="nothing-menu-title" onClose={() => setIsMenuOpen(false)} onCancel={(event) => { event.preventDefault(); void closeMenu(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void closeMenu();
    }}>
      <div className="n-menu-topline"><span>CHINGLUH / WORKSPACE</span><button className="n-shell-icon" onClick={() => void closeMenu()} aria-label="Đóng menu điều hướng"><X size={19} strokeWidth={1.25} /></button></div>
      <div className="n-menu-body"><p className="n-eyebrow" id="nothing-menu-title">Mọi công cụ. Một không gian.</p><nav aria-label="Điều hướng chính">{WORKSPACE_TABS.map((tab) => <button key={tab.id} className={`n-menu-link ${activeTab === tab.id ? "is-current" : ""}`} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => void closeMenu(() => setActiveTab(tab.id))}><span className="n-menu-number">{tab.code}</span><span>{tab.menuLabel}<small>{tab.note}</small></span><ArrowUpRight size={18} strokeWidth={1.25} /></button>)}</nav></div>
      <div className="n-menu-bottomline"><span>{providerName}</span><label>Vai trò <select aria-label="Vai trò hiện tại" value={currentUserRole} onChange={(event) => setCurrentUserRole(event.target.value as "admin" | "translator" | "reviewer" | "viewer")}><option value="admin">Admin</option><option value="reviewer">Reviewer</option><option value="translator">Translator</option><option value="viewer">Viewer</option></select></label></div>
    </dialog>
  </>;
};
