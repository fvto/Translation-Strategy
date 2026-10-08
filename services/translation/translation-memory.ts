import * as fs from "fs";
import * as path from "path";
import { AUDIT_CONFIDENCE } from "./audit-intelligence";
import type { AuditMemoryPair } from "./audit-intelligence";

export interface TranslationPair {
  id: string;
  sourceText: string;
  translatedText: string;
  isTitle?: boolean;
  isInspectionItem?: boolean;
  userCorrected?: boolean;
}

export interface SlideTranslationLog {
  slideIndex: number;
  title: string;
  pairs: TranslationPair[];
}

export interface TranslationSessionLog {
  sessionId: string;
  fileName: string;
  mode: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  slideCount: number;
  totalPairs: number;
  harvestedCount: number;
  slides: SlideTranslationLog[];
}

export interface SessionSummary {
  sessionId: string;
  fileName: string;
  mode: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  slideCount: number;
  totalPairs: number;
  harvestedCount: number;
}

const TM_DIR = path.join(process.cwd(), "data", "translation_memory");
const INDEX_FILE = path.join(TM_DIR, "index.json");

function ensureDirectoryExists() {
  if (!fs.existsSync(TM_DIR)) {
    fs.mkdirSync(TM_DIR, { recursive: true });
  }
}

/**
 * Persists a complete bilingual translation session log for PPTX presentations.
 */
export function recordTranslationSession(
  sessionId: string,
  fileName: string,
  slides: any[],
  mode: string = "ipqc_bilingual",
  sourceLanguage: string = "vi",
  targetLanguage: string = "en",
  harvestedCount: number = 0,
  userCorrectedIds: string[] = []
): TranslationSessionLog {
  ensureDirectoryExists();

  let totalPairs = 0;
  const slideLogs: SlideTranslationLog[] = [];

  for (const s of slides) {
    const pairs: TranslationPair[] = [];
    if (Array.isArray(s.paragraphs)) {
      for (const p of s.paragraphs) {
        if (!p.originalText || !p.originalText.trim()) continue;
        const orig = p.originalText.trim();
        const trans = (p.translatedText || p.originalText).trim();

        // Strict Zero-Image Policy: 절대 không lưu hình ảnh, base64 hay file path hình ảnh vào log
        if (/\.(png|jpe?g|gif|bmp|webp|svg|tiff|emf|wmf|ico)$/i.test(orig)) continue;
        if (/^(data:image\/|image\d+|media\/|ppt\/media\/|rId\d+)/i.test(orig)) continue;
        if (/\b(base64|image\/png|image\/jpeg)\b/i.test(orig)) continue;

        pairs.push({
          id: p.id || `p_${totalPairs}`,
          sourceText: orig,
          translatedText: trans,
          isTitle: !!p.isTitle,
          isInspectionItem: !!p.isInspectionItem,
          ...(userCorrectedIds.includes(p.id) ? { userCorrected: true } : {}),
        });
        totalPairs++;
      }
    }

    slideLogs.push({
      slideIndex: s.slideIndex ?? slideLogs.length + 1,
      title: s.title || `Slide ${s.slideIndex ?? slideLogs.length + 1}`,
      pairs,
    });
  }

  const sessionLog: TranslationSessionLog = {
    sessionId,
    fileName,
    mode,
    sourceLanguage,
    targetLanguage,
    createdAt: new Date().toISOString(),
    slideCount: slideLogs.length,
    totalPairs,
    harvestedCount,
    slides: slideLogs,
  };

  try {
    const logPath = path.join(TM_DIR, `${sessionId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(sessionLog, null, 2), "utf8");

    // Update index
    let index: SessionSummary[] = [];
    if (fs.existsSync(INDEX_FILE)) {
      try {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
      } catch {
        index = [];
      }
    }

    const summary: SessionSummary = {
      sessionId,
      fileName,
      mode,
      sourceLanguage,
      targetLanguage,
      createdAt: sessionLog.createdAt,
      slideCount: sessionLog.slideCount,
      totalPairs: sessionLog.totalPairs,
      harvestedCount,
    };

    // Filter out existing and unshift to top
    index = [summary, ...index.filter((i) => i.sessionId !== sessionId)].slice(0, 200);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
  } catch (err: any) {
    console.error("[TranslationMemory] Error saving session log:", err.message);
  }

  return sessionLog;
}

/**
 * Retrieves the index of all past translation sessions.
 */
export function getTranslationSessions(): SessionSummary[] {
  ensureDirectoryExists();
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    return Array.isArray(index) ? index.filter((s) => s && typeof s.sessionId === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Retrieves the full bilingual log for a specific translation session.
 */
export function getTranslationSessionById(sessionId: string): TranslationSessionLog | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return null;
  ensureDirectoryExists();
  const filePath = path.join(TM_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Bounded bulk read per audit, direction-specific. AI history is never promoted to approved memory. */
export function getAuditHistoryPairs(sourceLanguage: string, targetLanguage: string): AuditMemoryPair[] {
  const results: AuditMemoryPair[] = [];
  const seen = new Set<string>();
  const sessions = getTranslationSessions().filter((s) => s.sourceLanguage === sourceLanguage && s.targetLanguage === targetLanguage).slice(0, AUDIT_CONFIDENCE.historySessions);
  for (const summary of sessions) {
    const session = getTranslationSessionById(summary.sessionId);
    if (!session || !Array.isArray(session.slides) || session.sourceLanguage !== sourceLanguage || session.targetLanguage !== targetLanguage) continue;
    for (const slide of session.slides || []) for (const pair of Array.isArray(slide?.pairs) ? slide.pairs : []) {
      if (results.length >= AUDIT_CONFIDENCE.historyPairs) return results;
      if (!pair.sourceText || !pair.translatedText || pair.sourceText.trim().toLowerCase() === pair.translatedText.trim().toLowerCase()) continue;
      const origin = pair.userCorrected ? "correction" : "history";
      const key = JSON.stringify([pair.sourceText, pair.translatedText, origin]);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ source: pair.sourceText, target: pair.translatedText, origin, slideIndex: slide.slideIndex, fileName: summary.fileName });
    }
  }
  return results;
}

export interface TMSegmentResult {
  id: string;
  sessionId: string;
  fileName: string;
  createdAt: string;
  slideIndex: number;
  sourceText: string;
  translatedText: string;
  isTitle?: boolean;
  isInspectionItem?: boolean;
}

/**
 * Searches across all persisted translation memory segments with accurate timestamps.
 */
export function searchTranslationMemory(query?: string, limit: number = 100): TMSegmentResult[] {
  ensureDirectoryExists();
  const sessions = getTranslationSessions();
  const results: TMSegmentResult[] = [];
  const cleanQ = (query || "").trim().toLowerCase();

  for (const s of sessions) {
    if (results.length >= limit) break;
    const sessionLog = getTranslationSessionById(s.sessionId);
    if (!sessionLog || !Array.isArray(sessionLog.slides)) continue;

    for (const slide of sessionLog.slides) {
      if (results.length >= limit) break;
      if (!Array.isArray(slide.pairs)) continue;

      for (const pair of slide.pairs) {
        if (results.length >= limit) break;
        if (
          !cleanQ ||
          pair.sourceText.toLowerCase().includes(cleanQ) ||
          pair.translatedText.toLowerCase().includes(cleanQ) ||
          s.fileName.toLowerCase().includes(cleanQ)
        ) {
          results.push({
            id: `${s.sessionId}_${slide.slideIndex}_${pair.id}`,
            sessionId: s.sessionId,
            fileName: s.fileName,
            createdAt: s.createdAt,
            slideIndex: slide.slideIndex,
            sourceText: pair.sourceText,
            translatedText: pair.translatedText,
            isTitle: pair.isTitle,
            isInspectionItem: pair.isInspectionItem,
          });
        }
      }
    }
  }

  return results;
}

