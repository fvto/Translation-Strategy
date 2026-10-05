"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Settings,
  Cpu,
  Cloud,
  HardDrive,
  Globe,
  ShieldCheck,
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
  const [provider, setProvider] = useState<string>("gemini");
  const [retentionPolicy, setRetentionPolicy] = useState<string>("delete_immediately");
  const [googleKey, setGoogleKey] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [geminiModel, setGeminiModel] = useState<string>("gemini-3.5-flash-lite");
  const [localUrl, setLocalUrl] = useState<string>("http://localhost:11434/v1");
  const [localModel, setLocalModel] = useState<string>("qwen3:4b");
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [openaiModel, setOpenaiModel] = useState<string>("gpt-4o-mini");
  const [huggingFaceKey, setHuggingFaceKey] = useState<string>("");
  const [huggingFaceModel, setHuggingFaceModel] = useState<string>("Helsinki-NLP/opus-mt-en-vi");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          if (data.settings) {
            setProvider(data.settings.defaultProvider || "gemini");
            setRetentionPolicy(data.settings.retentionPolicy || "delete_immediately");
            if (data.settings.googleApiKey) setGoogleKey(data.settings.googleApiKey);
            if (data.settings.geminiApiKey) setGeminiKey(data.settings.geminiApiKey);
            if (data.settings.geminiModel) setGeminiModel(data.settings.geminiModel);
            if (data.settings.localLlmUrl) setLocalUrl(data.settings.localLlmUrl);
            if (data.settings.localLlmModel) setLocalModel(data.settings.localLlmModel);
            if (data.settings.openaiApiKey) setOpenaiKey(data.settings.openaiApiKey);
            if (data.settings.openaiModel) setOpenaiModel(data.settings.openaiModel);
            if (data.settings.huggingFaceApiKey) setHuggingFaceKey(data.settings.huggingFaceApiKey);
            if (data.settings.huggingFaceModel) setHuggingFaceModel(data.settings.huggingFaceModel);
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
          localLlmUrl: localUrl,
          localLlmModel: localModel,
          openaiApiKey: openaiKey,
          openaiModel,
          huggingFaceApiKey: huggingFaceKey,
          huggingFaceModel,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        let name = "Google Gemini (gemini-3.8-flash)";
        if (provider === "antigravity_cli") name = "Antigravity CLI (agy)";
        else if (provider === "ctranslate2") name = "CTranslate2 Offline (NLLB-200 INT8)";
        else if (provider === "gemini") name = `Google Gemini (${geminiModel || "gemini-3.8-flash"})`;
        else if (provider === "google_translate") name = "Google Translate + Glossary CAT";
        else if (provider === "huggingface") name = `Hugging Face (${huggingFaceModel})`;
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-white">
            <Settings className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">System & Provider Configuration</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto text-xs">
          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="font-semibold text-slate-200 block text-xs">
              Active Translation Provider
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Antigravity CLI option */}
              <div
                onClick={() => setProvider("antigravity_cli")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  provider === "antigravity_cli"
                    ? "bg-purple-950/40 border-purple-500 text-white shadow-lg shadow-purple-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center space-x-2 text-purple-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-xs">Antigravity CLI (agy)</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Ching Luh footwear context engine via agy CLI. No Google API key needed.
                </p>
                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] w-fit font-semibold px-1.5 py-0.5 rounded">
                  CLI v1.2.13 Ready
                </span>
              </div>

              {/* Gemini 3.8 Flash option */}
              <div
                onClick={() => setProvider("gemini")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  provider === "gemini"
                    ? "bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center space-x-2 text-amber-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-xs">Gemini 3.8 Flash</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Google AI Studio 3.8 Flash with custom footwear glossary adherence and smart failover.
                </p>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] w-fit font-semibold px-1.5 py-0.5 rounded">
                  Active in .env
                </span>
              </div>

              {/* Google Translate option */}
              <div
                onClick={() => setProvider("google_translate")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  provider === "google_translate"
                    ? "bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center space-x-2 text-cyan-400">
                  <Globe className="w-4 h-4" />
                  <span className="font-semibold text-xs">Google Translate</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Natural English fluency + strict adherence to Cuu-am-chan-kinh.xlsx glossary. 100% Free & instant.
                </p>
                <span className="badge badge-approved text-[9px] w-fit font-medium">
                  Fast & Free
                </span>
              </div>

              {/* CTranslate2 Offline option */}
              <div
                onClick={() => setProvider("ctranslate2")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  provider === "ctranslate2"
                    ? "bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center space-x-2 text-cyan-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-xs">CTranslate2 (NLLB-200)</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  100% Offline Python engine (INT8). ~500MB RAM, CPU-friendly, zero quota, zero external API.
                </p>
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] w-fit font-semibold px-1.5 py-0.5 rounded">
                  Local Ready
                </span>
              </div>
            </div>
          </div>

          {/* Conditional Provider Inputs */}
          {provider === "antigravity_cli" && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-purple-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white block flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Antigravity CLI (agy) Engine Configuration
                </span>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Installed (Without Admin Privilege)
                </span>
              </div>
              <div className="space-y-1.5 text-slate-300 text-xs">
                <p>
                  Đường dẫn nhị phân:{" "}
                  <code className="text-purple-300 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-purple-900/40">
                    %LOCALAPPDATA%\agy\bin\agy.exe
                  </code>
                </p>
                <p className="text-[11px] text-slate-400">
                  Phiên bản: <strong className="text-white">v1.2.13</strong> • Chế độ: <strong className="text-purple-300">Footwear QA & SOP Context Agent</strong>
                </p>
              </div>
              <div className="p-3 bg-purple-950/30 border border-purple-800/30 rounded-lg text-purple-200 text-[11px] leading-relaxed">
                <strong>💡 Hướng dẫn xác thực một lần:</strong> Nếu là lần đầu sử dụng, bạn chỉ cần mở terminal (PowerShell hoặc CMD) và gõ lệnh <code className="text-white font-mono bg-purple-900/60 px-1 py-0.5 rounded">agy</code> để hoàn tất xác thực Google bằng trình duyệt. Sau đó CLI sẽ tự động hoạt động mà không cần bất kỳ API key nào!
              </div>
            </div>
          )}

          {provider === "gemini" && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white block flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Google Gemini AI Configuration
                </span>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Key active from .env (GEMINI_KEY)
                </span>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  Gemini API Key (Leave blank to use GEMINI_KEY from .env)
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Loaded from .env"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 block">Model Selection</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGeminiModel("gemini-3.5-flash-lite")}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                        geminiModel === "gemini-3.5-flash-lite"
                          ? "bg-amber-600 text-white font-bold"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      gemini-3.5-flash-lite
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeminiModel("gemini-3.8-flash")}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                        geminiModel === "gemini-3.8-flash"
                          ? "bg-amber-600 text-white font-bold"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      gemini-3.8-flash
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeminiModel("gemini-3.5-flash")}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                        geminiModel === "gemini-3.5-flash"
                          ? "bg-amber-600 text-white font-bold"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      gemini-3.5-flash
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  placeholder="gemini-3.8-flash"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Includes automatic 503 spike backoff & fallback to ensure your translations never interrupt.
                </p>
              </div>
            </div>
          )}
          {provider === "google_translate" && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white block">
                  Google Translate Configuration
                </span>
                <span className="text-[10px] text-emerald-400 font-medium">
                  Free & Instant (0 Setup Required)
                </span>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  Google Cloud Translation API Key (Optional)
                </label>
                <input
                  type="password"
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  placeholder="Leave blank for free instant Google Translate, or enter API key"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  All translations automatically enforce your custom footwear terms from Cuu-am-chan-kinh.xlsx with seamless offline fallback.
                </p>
              </div>
            </div>
          )}

          {/* Retention Policy Setting */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-200 block text-xs">
              Default Document Retention Policy (Section 23)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center space-x-2 ${
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
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs">Delete immediately after processing (Default)</span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center space-x-2 ${
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
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span className="text-xs">Keep in private storage until manual deletion</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-[11px] text-slate-500">
              API keys are never transmitted to client browsers.
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-xl text-white bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? "Saving..." : "Save Settings"}</span>
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
