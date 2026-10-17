"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Settings,
  Globe,
  ShieldCheck,
  HardDrive,
  Save,
  Check,
  Sparkles,
} from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: (providerName: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [provider, setProvider] = useState<"gemini" | "google_translate">("gemini");
  const [retentionPolicy, setRetentionPolicy] = useState<string>("delete_immediately");
  const [googleKey, setGoogleKey] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [geminiModel, setGeminiModel] = useState<string>("gemini-3.5-flash-lite");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          if (data.settings) {
            const p = data.settings.defaultProvider;
            setProvider(p === "google_translate" ? "google_translate" : "gemini");
            setRetentionPolicy(data.settings.retentionPolicy || "delete_immediately");
            if (data.settings.googleApiKey) setGoogleKey(data.settings.googleApiKey);
            if (data.settings.geminiApiKey) setGeminiKey(data.settings.geminiApiKey);
            if (data.settings.geminiModel) setGeminiModel(data.settings.geminiModel);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider: provider,
          retentionPolicy,
          googleApiKey: googleKey,
          geminiApiKey: geminiKey,
          geminiModel,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        const name =
          provider === "gemini"
            ? `Google Gemini (${geminiModel || "3.5 Flash Lite"})`
            : "Google NMT (Google Translate CAT)";
        onSettingsSaved(name);
        setTimeout(() => {
          setSavedSuccess(false);
          onClose();
        }, 800);
      } else {
        alert("Failed to save settings");
      }
    } catch (e: any) {
      alert("Error saving settings: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-white">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-white">Cấu Hình Engine Dịch Thuật</h3>
              <p className="text-[11px] text-slate-400">Chọn và thiết lập khóa API cho 2 Engine tiêu chuẩn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* Provider Selection - Only 2 Engines */}
          <div className="space-y-2.5">
            <label className="font-semibold text-slate-200 block text-xs">
              Chọn Translation Engine Đang Hoạt Động
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Google AI Studio (Gemini) */}
              <div
                onClick={() => setProvider("gemini")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                  provider === "gemini"
                    ? "bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                    <span className="font-bold text-xs">Google AI Studio</span>
                  </div>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                    Khuyên Dùng
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Ưu tiên <strong>3.5 Flash Lite</strong>, tự động fallback sang <strong>3.1 Flash Lite</strong> khi chạm quota limit (429).
                </p>
                <div className="text-[10px] text-amber-300/80 font-mono flex items-center gap-1">
                  <span>⚡ 15 RPM • 500 RPD</span>
                </div>
              </div>

              {/* Option 2: Google NMT */}
              <div
                onClick={() => setProvider("google_translate")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                  provider === "google_translate"
                    ? "bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-blue-400">
                    <Globe className="w-4 h-4" />
                    <span className="font-bold text-xs">Google NMT</span>
                  </div>
                  <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                    Thuật Ngữ CAT
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Dịch máy thần kinh Google NMT kết hợp bộ từ điển chuẩn hóa SOP Cuu-am-chan-kinh.
                </p>
                <div className="text-[10px] text-blue-300/80 font-mono flex items-center gap-1">
                  <span>🌐 0 Cần Key • Miễn phí</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration for Google AI Studio */}
          {provider === "gemini" && (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-900/40 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white block flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Cấu Hình Google AI Studio API Key
                </span>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {geminiKey ? "Đã nhập API Key" : "Nhận từ .env (GEMINI_KEY)"}
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1 text-xs">
                  Google AI Studio API Key:
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy... (để trống nếu đã có trong file .env)"
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500 font-mono text-xs shadow-inner"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Chỉ cần duy nhất Google AI Studio API Key để dịch thuật trọn vẹn Slide PPTX, Excel và văn bản.
                </p>
              </div>

              {/* Automatic Fallback Flow */}
              <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                  ⚡ Cơ chế Fallback Tự Động (Tự chuyển model khi chạm Quota Limit)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/30 flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-white flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        1. Ưu tiên (Primary):
                      </span>
                      <p className="text-amber-200/90 font-mono text-[10px] mt-0.5">gemini-3.5-flash-lite</p>
                      <p className="text-slate-400 text-[10px] mt-1">
                        Tốc độ cao nhất, 500 requests/ngày, độ chính xác thuật ngữ tuyệt đối.
                      </p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/30 flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-white flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        2. Dự phòng (Auto-Fallback):
                      </span>
                      <p className="text-cyan-200/90 font-mono text-[10px] mt-0.5">gemini-3.1-flash-lite</p>
                      <p className="text-slate-400 text-[10px] mt-1">
                        Tự kích hoạt tức thì khi 3.5 gặp 429 / Quota Limit, đảm bảo không bị dừng dịch.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 block font-medium">Model khởi đầu:</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGeminiModel("gemini-3.5-flash-lite")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                        geminiModel === "gemini-3.5-flash-lite"
                          ? "bg-amber-600 text-white font-bold shadow-xs"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      3.5 Flash Lite (Mặc định)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeminiModel("gemini-3.1-flash-lite")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                        geminiModel === "gemini-3.1-flash-lite"
                          ? "bg-amber-600 text-white font-bold shadow-xs"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      3.1 Flash Lite
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  placeholder="gemini-3.5-flash-lite"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Configuration for Google NMT */}
          {provider === "google_translate" && (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-blue-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white block flex items-center gap-1.5 text-xs">
                  <Globe className="w-4 h-4 text-blue-400" />
                  Cấu Hình Google NMT
                </span>
                <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  Miễn phí & Tức thì
                </span>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  Google Cloud Translation API Key (Tùy chọn)
                </label>
                <input
                  type="password"
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  placeholder="Để trống để dùng Google NMT CAT miễn phí, hoặc nhập key"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tất cả bản dịch tự động áp dụng đúng chuẩn thuật ngữ sản xuất giày từ Cuu-am-chan-kinh.xlsx.
                </p>
              </div>
            </div>
          )}

          {/* Retention Policy Setting */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <label className="font-semibold text-slate-200 block text-xs">
              Chính Sách Lưu Trữ Dữ Liệu (Security Retention)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-2xl border cursor-pointer flex items-center space-x-2 ${
                  retentionPolicy === "delete_immediately"
                    ? "bg-blue-950/30 border-blue-500 text-white"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}
              >
                <input
                  type="radio"
                  name="retention"
                  checked={retentionPolicy === "delete_immediately"}
                  onChange={() => setRetentionPolicy("delete_immediately")}
                  className="hidden"
                />
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs">Xóa ngay sau khi dịch xong (Bảo mật cao)</span>
              </label>

              <label
                className={`p-3 rounded-2xl border cursor-pointer flex items-center space-x-2 ${
                  retentionPolicy === "persist_until_manual"
                    ? "bg-blue-950/30 border-blue-500 text-white"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}
              >
                <input
                  type="radio"
                  name="retention"
                  checked={retentionPolicy === "persist_until_manual"}
                  onChange={() => setRetentionPolicy("persist_until_manual")}
                  className="hidden"
                />
                <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs">Lưu trữ cục bộ cho đến khi xóa thủ công</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-[11px] text-slate-500">
              API key được bảo mật ở server, không bao giờ gửi tới browser.
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-slate-400 hover:text-white bg-slate-800 transition-colors cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-full text-white bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Đã lưu!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? "Đang lưu..." : "Lưu Cài Đặt"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
