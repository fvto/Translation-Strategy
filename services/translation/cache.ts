import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface CacheStats {
  hits: number;
  misses: number;
  dedupSavedItems: number;
  hitRatio: number;
}

const CACHE_FILE_PATH = path.join(process.cwd(), "data", "translation_cache.json");

const globalForCache = globalThis as unknown as {
  _translationCacheMap?: Map<string, string>;
  _translationCacheHits?: number;
  _translationCacheMisses?: number;
};

export class TranslationCacheService {
  private cache: Map<string, string>;
  private _hits: number;
  private _misses: number;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Reuse the existing map if the module was hot-reloaded
    if (!globalForCache._translationCacheMap) {
      globalForCache._translationCacheMap = new Map<string, string>();
      globalForCache._translationCacheHits = 0;
      globalForCache._translationCacheMisses = 0;
      this.loadFromDisk(globalForCache._translationCacheMap);
    }
    this.cache = globalForCache._translationCacheMap;
    this._hits = globalForCache._translationCacheHits ?? 0;
    this._misses = globalForCache._translationCacheMisses ?? 0;
  }

  private loadFromDisk(targetMap: Map<string, string>) {
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const raw = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") targetMap.set(k, v);
          }
        }
      }
    } catch (e) {
      // non-fatal
    }
  }

  private scheduleSaveToDisk() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const dir = path.dirname(CACHE_FILE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const obj: Record<string, string> = {};
        for (const [k, v] of this.cache.entries()) obj[k] = v;
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(obj, null, 2), "utf-8");
      } catch (e) {
        // non-fatal
      }
    }, 1500);
  }

  private get hits(): number { return globalForCache._translationCacheHits ?? 0; }
  private set hits(v: number) { globalForCache._translationCacheHits = v; }
  private get misses(): number { return globalForCache._translationCacheMisses ?? 0; }
  private set misses(v: number) { globalForCache._translationCacheMisses = v; }

  private generateKey(sourceText: string, sourceLang: string, targetLang: string, namespace = ""): string {
    const normalized = sourceText.trim().replace(/\s+/g, " ").toLowerCase();
    const hash = crypto.createHash("sha256").update(`${namespace ? namespace + ":" : ""}${sourceLang}:${targetLang}:${normalized}`).digest("hex");
    return hash;
  }

  private hasViDiacritics(str: string): boolean {
    return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(str);
  }

  get(sourceText: string, sourceLang: string, targetLang: string, namespace = ""): string | undefined {
    const key = this.generateKey(sourceText, sourceLang, targetLang, namespace);
    const result = this.cache.get(key);
    if (result !== undefined) {
      if (sourceLang === "vi" && targetLang === "en" && (this.hasViDiacritics(result) || (this.hasViDiacritics(sourceText) && sourceText.trim().toLowerCase() === result.trim().toLowerCase()))) {
        this.cache.delete(key);
        this.misses++;
        return undefined;
      }
      this.hits++;
      return result;
    }
    this.misses++;
    return undefined;
  }

  set(sourceText: string, translatedText: string, sourceLang: string, targetLang: string, namespace = ""): void {
    if (!sourceText.trim() || !translatedText.trim()) return;
    if (sourceLang === "vi" && targetLang === "en" && (this.hasViDiacritics(translatedText) || (this.hasViDiacritics(sourceText) && sourceText.trim().toLowerCase() === translatedText.trim().toLowerCase()))) {
      return;
    }
    const key = this.generateKey(sourceText, sourceLang, targetLang, namespace);
    this.cache.set(key, translatedText.trim());
    this.scheduleSaveToDisk();
  }

  /**
   * Pre-flight deduplication across all items in a presentation:
   * Returns items that need translation, alongside a resolver function
   * for instantly mapping identical repeated items with zero LLM tokens.
   */
  deduplicateItems<T extends { id: string; sourceText: string }>(
    items: T[],
    sourceLang: string,
    targetLang: string,
    bypassCacheTexts?: Set<string>,
    bypassAllCache = false,
    namespaceFor: (item: T) => string = () => ""
  ): {
    uniqueToTranslate: T[];
    resolveAll: (freshTranslations: Map<string, string>) => Map<string, string>;
    stats: { total: number; unique: number; cachedHits: number; dedupSaved: number };
  } {
    const total = items.length;
    const uniqueMap = new Map<string, T>();
    const textToAllIds = new Map<string, string[]>();
    const resolvedTranslations = new Map<string, string>();
    let cachedHits = 0;

    for (const item of items) {
      const normText = item.sourceText.trim();
      if (!normText) continue;

      const itemKey = JSON.stringify([namespaceFor(item), normText]);
      if (!textToAllIds.has(itemKey)) {
        textToAllIds.set(itemKey, []);
      }
      textToAllIds.get(itemKey)!.push(item.id);

      // Check if already in persistent memory cache
      const cached = (bypassAllCache || bypassCacheTexts?.has(normText)) ? undefined : this.get(normText, sourceLang, targetLang, namespaceFor(item));
      if (cached) {
        resolvedTranslations.set(item.id, cached);
        cachedHits++;
      } else if (!uniqueMap.has(itemKey)) {
        uniqueMap.set(itemKey, item);
      }
    }

    const uniqueToTranslate = Array.from(uniqueMap.values());
    const dedupSaved = total - uniqueToTranslate.length;

    const resolveAll = (freshTranslations: Map<string, string>): Map<string, string> => {
      // 1. Store fresh translations into cache
      for (const item of uniqueToTranslate) {
        const trans = freshTranslations.get(item.id);
        if (trans) {
          this.set(item.sourceText, trans, sourceLang, targetLang, namespaceFor(item));
          // Broadcast to all duplicates in this deck
          const siblingIds = textToAllIds.get(JSON.stringify([namespaceFor(item), item.sourceText.trim()])) || [];
          for (const sId of siblingIds) {
            resolvedTranslations.set(sId, trans);
          }
        }
      }
      return resolvedTranslations;
    };

    return {
      uniqueToTranslate,
      resolveAll,
      stats: {
        total,
        unique: uniqueToTranslate.length,
        cachedHits,
        dedupSaved,
      },
    };
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      dedupSavedItems: this.hits,
      hitRatio: total > 0 ? parseFloat((this.hits / total).toFixed(3)) : 0,
    };
  }

  clear(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) fs.unlinkSync(CACHE_FILE_PATH);
    } catch (e) {
      // non-fatal
    }
  }
}

export const translationCache = new TranslationCacheService();

