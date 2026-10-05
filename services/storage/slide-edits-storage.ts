import { PptxSlideData, PptxParagraph } from "@/components/PptxTranslator";

export interface StoredPresentationSession {
  fileName: string;
  sessionId?: string | null;
  updatedAt: number;
  paragraphEdits: Record<string, string>;
  initialAiTranslations: Record<string, string>;
  slides?: PptxSlideData[];
  stats?: any;
}

const STORAGE_PREFIX = "pptx_user_edits_";
const LATEST_KEY = "pptx_user_edits_latest";

function getStorageKey(fileName?: string): string {
  if (!fileName || !fileName.trim()) return LATEST_KEY;
  // Sanitize key
  return `${STORAGE_PREFIX}${fileName.trim().toLowerCase()}`;
}

/**
 * Save user edits and session snapshot into browser localStorage.
 */
export function saveUserSlideEdits(
  fileName: string | undefined,
  edits: Record<string, string>,
  slides: PptxSlideData[],
  initialAiTranslations: Record<string, string> = {},
  sessionId?: string | null,
  stats?: any
): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const payload: StoredPresentationSession = {
      fileName: fileName || "presentation.pptx",
      sessionId: sessionId || null,
      updatedAt: Date.now(),
      paragraphEdits: edits,
      initialAiTranslations,
      slides,
      stats,
    };

    const serialized = JSON.stringify(payload);
    const key = getStorageKey(fileName);
    window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(LATEST_KEY, serialized);
  } catch (err) {
    console.warn("[SlideStorage] Failed to save edits to localStorage:", err);
  }
}

/**
 * Load stored edits for a specific file name, or fallback to latest session.
 */
export function getUserSlideEdits(fileName?: string): StoredPresentationSession | null {
  if (typeof window === "undefined" || !window.localStorage) return null;

  try {
    const key = getStorageKey(fileName);
    let dataStr = window.localStorage.getItem(key);

    if (!dataStr && fileName) {
      // Check latest session in case fileName matched closely
      const latestStr = window.localStorage.getItem(LATEST_KEY);
      if (latestStr) {
        const parsed = JSON.parse(latestStr) as StoredPresentationSession;
        if (
          parsed.fileName &&
          (parsed.fileName.toLowerCase() === fileName.toLowerCase() ||
            parsed.fileName.toLowerCase().includes(fileName.toLowerCase()) ||
            fileName.toLowerCase().includes(parsed.fileName.toLowerCase()))
        ) {
          dataStr = latestStr;
        }
      }
    }

    if (!dataStr) return null;
    return JSON.parse(dataStr) as StoredPresentationSession;
  } catch (err) {
    console.warn("[SlideStorage] Failed to load edits from localStorage:", err);
    return null;
  }
}

/**
 * Retrieve the most recently modified presentation session.
 */
export function getLatestPresentationSession(): StoredPresentationSession | null {
  if (typeof window === "undefined" || !window.localStorage) return null;

  try {
    const latestStr = window.localStorage.getItem(LATEST_KEY);
    if (!latestStr) return null;
    return JSON.parse(latestStr) as StoredPresentationSession;
  } catch (err) {
    console.warn("[SlideStorage] Failed to load latest session:", err);
    return null;
  }
}

/**
 * Merge user edits onto an array of slides.
 * Matches by paragraph id or by exact trimmed originalText.
 */
export function applyEditsToSlides(
  slides: PptxSlideData[],
  edits: Record<string, string>
): { slides: PptxSlideData[]; appliedCount: number } {
  if (!slides || slides.length === 0 || !edits || Object.keys(edits).length === 0) {
    return { slides, appliedCount: 0 };
  }

  let appliedCount = 0;

  const newSlides = slides.map((slide) => ({
    ...slide,
    paragraphs: slide.paragraphs.map((p) => {
      // 1. Direct ID match
      if (edits[p.id] !== undefined && edits[p.id] !== p.translatedText) {
        appliedCount++;
        return { ...p, translatedText: edits[p.id] };
      }

      // 2. Original text fallback match (in case paragraph id shifted)
      const textKey = `text_${p.originalText.trim()}`;
      if (edits[textKey] !== undefined && edits[textKey] !== p.translatedText) {
        appliedCount++;
        return { ...p, translatedText: edits[textKey] };
      }

      return p;
    }),
  }));

  return { slides: newSlides, appliedCount };
}

/**
 * Clear stored edits for a file.
 */
export function clearUserSlideEdits(fileName?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const key = getStorageKey(fileName);
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn("[SlideStorage] Failed to clear edits:", err);
  }
}
