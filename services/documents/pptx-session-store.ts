import fs from "fs";
import path from "path";
import { PptxSlideData, PptxExtractionStats, PptxTranslationMode } from "./pptx-translator";

export interface PptxSession {
  id: string;
  fileName: string;
  originalBuffer: Buffer;
  translatedBuffer?: Buffer;
  slides: PptxSlideData[];
  stats: PptxExtractionStats;
  mode?: PptxTranslationMode;
  createdAt: number;
  unmappedTerms?: any[];
}

const STORAGE_DIR = path.resolve(process.cwd(), "data", "secure_storage", "pptx_sessions");

if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (e) {}
}

interface SessionMetadata {
  id: string;
  fileName: string;
  slides: PptxSlideData[];
  stats: PptxExtractionStats;
  mode?: PptxTranslationMode;
  createdAt: number;
  unmappedTerms?: any[];
}

const globalForPptx = globalThis as unknown as {
  pptxSessions?: Map<string, SessionMetadata>;
};

const metaStore = globalForPptx.pptxSessions ?? new Map<string, SessionMetadata>();
if (process.env.NODE_ENV !== "production") globalForPptx.pptxSessions = metaStore;

// Lightweight LRU buffer cache for active download requests (max 2 items)
const bufferCache = new Map<string, { originalBuffer: Buffer; translatedBuffer?: Buffer; accessTime: number }>();
const MAX_BUFFER_CACHE_ITEMS = 2;

function purgeBufferCacheIfNeeded() {
  if (bufferCache.size > MAX_BUFFER_CACHE_ITEMS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, val] of bufferCache.entries()) {
      if (val.accessTime < oldestTime) {
        oldestTime = val.accessTime;
        oldestKey = key;
      }
    }
    if (oldestKey) bufferCache.delete(oldestKey);
  }
}

export const pptxSessionStore = {
  get(id: string): PptxSession | null {
    const metaFile = path.join(STORAGE_DIR, `${id}.json`);
    const origFile = path.join(STORAGE_DIR, `${id}.orig.pptx`);
    const transFile = path.join(STORAGE_DIR, `${id}.trans.pptx`);

    // 1. Get metadata from memory or disk
    let meta = metaStore.get(id);
    if (!meta && fs.existsSync(metaFile)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
        if (meta) metaStore.set(id, meta);
      } catch (e) {
        console.warn("[PptxSessionStore] Failed to parse meta file:", e);
      }
    }

    if (!meta) return null;

    // 2. Check LRU buffer cache
    const cached = bufferCache.get(id);
    if (cached) {
      cached.accessTime = Date.now();
      return {
        ...meta,
        originalBuffer: cached.originalBuffer,
        translatedBuffer: cached.translatedBuffer,
      };
    }

    // 3. Load buffers on demand from disk storage
    try {
      if (fs.existsSync(origFile)) {
        const originalBuffer = fs.readFileSync(origFile);
        const translatedBuffer = fs.existsSync(transFile) ? fs.readFileSync(transFile) : undefined;

        bufferCache.set(id, {
          originalBuffer,
          translatedBuffer,
          accessTime: Date.now(),
        });
        purgeBufferCacheIfNeeded();

        return {
          ...meta,
          originalBuffer,
          translatedBuffer,
        };
      }
    } catch (e) {
      console.warn("[PptxSessionStore] Failed to load buffer from disk:", e);
    }

    return null;
  },

  set(id: string, session: PptxSession): void {
    const meta: SessionMetadata = {
      id: session.id,
      fileName: session.fileName,
      slides: session.slides,
      stats: session.stats,
      mode: session.mode,
      createdAt: session.createdAt,
    };

    metaStore.set(id, meta);

    // Save to disk storage asynchronously / synchronously
    try {
      const metaFile = path.join(STORAGE_DIR, `${id}.json`);
      const origFile = path.join(STORAGE_DIR, `${id}.orig.pptx`);
      const transFile = path.join(STORAGE_DIR, `${id}.trans.pptx`);

      fs.writeFileSync(metaFile, JSON.stringify(meta), "utf-8");
      fs.writeFileSync(origFile, session.originalBuffer);
      if (session.translatedBuffer) {
        fs.writeFileSync(transFile, session.translatedBuffer);
      }

      // Add to buffer cache with bounded capacity
      bufferCache.set(id, {
        originalBuffer: session.originalBuffer,
        translatedBuffer: session.translatedBuffer,
        accessTime: Date.now(),
      });
      purgeBufferCacheIfNeeded();
    } catch (e) {
      console.warn("[PptxSessionStore] Failed to persist session to disk:", e);
    }
  },

  cleanup(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, meta] of metaStore.entries()) {
      if (meta.createdAt < cutoff) {
        metaStore.delete(id);
        bufferCache.delete(id);
      }
    }

    try {
      if (fs.existsSync(STORAGE_DIR)) {
        const files = fs.readdirSync(STORAGE_DIR);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const filePath = path.join(STORAGE_DIR, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) {
              const id = file.replace(".json", "");
              fs.unlinkSync(filePath);
              const orig = path.join(STORAGE_DIR, `${id}.orig.pptx`);
              const trans = path.join(STORAGE_DIR, `${id}.trans.pptx`);
              if (fs.existsSync(orig)) fs.unlinkSync(orig);
              if (fs.existsSync(trans)) fs.unlinkSync(trans);
              bufferCache.delete(id);
            }
          }
        }
      }
    } catch (e) {}
  },
};
