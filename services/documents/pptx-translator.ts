import JSZip from "jszip";
import { getTranslationProvider, GeminiRateLimitError, GoogleTranslationProvider, TranslationProvider, BatchTranslationResponse } from "../translation";
import { GeminiObservability } from "../translation/gemini";
import { db } from "../database/db";
import { readPptxWithMarkItDown } from "./markitdown";
import { normalizeSpiTerminology } from "../translation/casing";
import { dynamicDeckDetector } from "./pptx-structure";
import { TerminologyEntry } from "../database/types";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { checkGlossaryTranslation } from "../terminology/audit-compliance";
import { isSafeTerminologyEntry } from "../terminology/safety";
export { isSafeTerminologyEntry } from "../terminology/safety";
import { auditAndRepairPptxPostFlight } from "../qa/pptx-postflight-gate";
import { translationCache } from "../translation/cache";
import { DocumentTranslationMemory, TranslationUnitWithMeta, documentTM, DocumentTMConflict, canonicalizeText } from "../translation/document-tm";
import { auditPptxGaps, SmartAuditReport, ScannedTextUnit, isNonTranslatable, isShoeModelName, isInspectionStatusLabel, isEnglishImmunityProtected } from "../translation/smart-detector";
import { paragraphText, PPTX_PARAGRAPH_PATTERN, replaceParagraphTranslation } from "./pptx-text";
import { orderedSlidePaths, readIsqSlidePairs, ISQ_PAIRS_PART, parseSlideRange } from "./pptx-slide-order";
import { detectUnmappedTerminology, UnmappedTermItem } from "../terminology/unmapped-detector";
import { polishSopText } from "../translation/sop-polisher";

/**
 * Automatically detects the manufacturing stage of a footwear presentation
 * based on keyword density across all slides.
 */
export function detectPresentationStage(slides: PptxSlideData[]): string {
  const combinedText = slides
    .map((s) => s.paragraphs.map((p) => p.originalText).join(" "))
    .join(" ")
    .toLowerCase();

  if (/\b(?:nosew|no-sew|ép\s+nhiệt|máy\s+nosew|pizza\s+pan|protective\s+film|màng\s+tpu|màng\s+bảo\s+vệ)\b/i.test(combinedText)) {
    return "nosew";
  }
  if (/\b(?:may|đường\s+may|kim|chỉ|mũi\/inch|spi|mudguard|collar\s+lining|may\s+lót|may\s+vòng\s+cổ)\b/i.test(combinedText)) {
    return "stitching";
  }
  if (/\b(?:chặt|dao\s+chặt|khuôn\s+dao|máy\s+chặt|cắt\s+laser|bàn\s+chặt)\b/i.test(combinedText)) {
    return "cutting";
  }
  if (/\b(?:gò|dán\s+đế|quét\s+keo|quét\s+primer|sấy|lò\s+sấy|lực\s+ép\s+đế|ép\s+lạnh|ép\s+nóng|last|lasting)\b/i.test(combinedText)) {
    return "assembly";
  }
  if (/\b(?:mài\s+đế|xử\s+lý\s+đế|phun\s+sơn\s+đế|đế\s+ngoài|outsole|midsole|stockfit)\b/i.test(combinedText)) {
    return "stockfit";
  }
  if (/\b(?:kiểm\s+tra|lỗi|khuyết\s+tật|defect|ctq|isq|tiêu\s+chuẩn|qa\s+manual|mức\s+độ|ẩn\s+màu|lem\s+màu)\b/i.test(combinedText)) {
    return "qa";
  }
  return "general";
}

export interface PptxParagraph {
  id: string;
  slideIndex: number;
  shapeIndex: number;
  paragraphIndex: number;
  originalText: string;
  translatedText: string;
  isTitle?: boolean;
  isInspectionItem?: boolean;
}

export interface PptxSlideData {
  slideIndex: number;
  slideFileName: string;
  title: string;
  paragraphs: PptxParagraph[];
  notes?: string;
  translatedNotes?: string;
}

export interface PptxExtractionStats {
  totalSlides: number;
  totalParagraphs: number;
  totalWords: number;
  totalCharacters: number;
  totalImagesProtected: number;
  protectedImageNames: string[];
  imageShieldActive: boolean;
  markitdownMarkdown?: string;
  markitdownLoaded?: boolean;
}

export interface PptxProgressUpdate {
  stage: "extracting" | "crawling" | "translating" | "packaging" | "done";
  progress: number;
  message: string;
  currentBatch?: number;
  totalBatches?: number;
  translatedItems?: number;
  totalItems?: number;
  currentSlide?: number;
  totalSlides?: number;
}

export interface PptxTranslationResult {
  stats: PptxExtractionStats;
  slides: PptxSlideData[];
  translatedBuffer: Buffer;
  durationMs: number;
  unmappedTerms?: UnmappedTermItem[];
  documentTMStats?: any;
  conflicts?: DocumentTMConflict[];
  auditReport?: SmartAuditReport;
}

export type PptxTranslationMode = "ipqc_bilingual" | "isq_duplicate" | "replace_en";

/**
 * Formats file name according to Ching Luh SOP Strategy Specification:
 * - If ends with -VN, replace with -EN (e.g. "HO23...manual-VN" -> "HO23...manual-EN")
 * - If already ends with -EN, keep it.
 * - Otherwise append -EN (e.g. "SP22 AIR JORDAN 1 LOW QA IPQC manual" -> "SP22 AIR JORDAN 1 LOW QA IPQC manual-EN")
 */
export function formatSopFileName(originalName: string): string {
  if (!originalName) return "presentation-EN.pptx";
  const baseName = originalName.replace(/\.pptx$/i, "").trim();
  let enBaseName = baseName;
  if (/[-_]VN$/i.test(baseName)) {
    enBaseName = baseName.replace(/[-_]VN$/i, "-EN");
  } else if (/[-_]VI$/i.test(baseName)) {
    enBaseName = baseName.replace(/[-_]VI$/i, "-EN");
  } else if (!/[-_]EN$/i.test(baseName)) {
    enBaseName = `${baseName}-EN`;
  }
  return `${enBaseName}.pptx`;
}

/**
 * Escapes special XML characters for OpenXML text nodes (<a:t>).
 * Pre-normalizes existing entities to prevent double-escaping (&amp;amp; -> &amp;).
 * Keeps quotes (' and ") literal in text nodes to avoid PowerPoint &apos;&apos; artifacts.
 */
export function escapeXml(text: string): string {
  if (!text) return "";
  const cleaned = text
    .replace(/&amp;amp;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;&apos;/g, "''")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');

  return cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Unescapes XML entities back to plain text.
 */
export function unescapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;amp;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&apos;&apos;/g, "''")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<");
}

/**
 * Splits existing hybrid bilingual strings into separate clean English and Vietnamese components.
 * Handles patterns such as:
 *   - "Toe cap shape-Hình dạng mũi" -> { en: "Toe cap shape", vi: "Hình dạng mũi" }
 *   - "Wrinkle collar lining -Nhăn lót vòng cổ" -> { en: "Wrinkle collar lining", vi: "Nhăn lót vòng cổ" }
 *   - "X-ray-Cộm" -> { en: "X-ray", vi: "Cộm" }
 *   - "Bond gap upper to bottom-Hở keo đế với mặt giày" -> { en: "Bond gap upper to bottom", vi: "Hở keo đế với mặt giày" }
 *   - "Rubber tar delamination Cao su tách lớp" -> { en: "Rubber tar delamination", vi: "Cao su tách lớp" }
 *   - "Damaged material/ delamination Liệu hư/ tách lớp" -> { en: "Damaged material/ delamination", vi: "Liệu hư/ tách lớp" }
 * Eliminates duplicate English text on line 2!
 */
export function hasViDiacritics(str: string): boolean {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(str);
}

export function isPureEnglish(str: string): boolean {
  if (!str || !str.trim()) return false;
  if (hasViDiacritics(str)) return false;
  // If string contains known Vietnamese footwear keywords without diacritics, it is NOT pure English!
  if (/\b(may|dan|mai|keo|got|de|mui|lot|nhan|chay|rap|phom|khuon|bien|chi|lon|dap|cuon|xo|cot|day|ban|lo|dinh|quet|vien|bao|trung|eo|may\s+mudguard|may\s+lot\s+vong\s+co|may\s+vong\s+co|lap|ghep|ep|go|luoi|than|dem|lot\s+giay)\b/i.test(str)) {
    return false;
  }
  return /[a-zA-Z]{2,}/.test(str);
}

/**
 * Detects whether a text run represents neutral metadata (such as sample codes, model identifiers,
 * inspection dates, or version strings) commonly placed at the bottom of technical SOP defect cards.
 * E.g. "SB-077-C-1", "SB-077-p-1", "22/9/2026", "2026-10-02", "#01", "REV.A".
 * Does NOT match substantive defect names or sentences (e.g. "Color migration", "Đổi màu/Ẩn màu").
 */
export function isNeutralMetadataItem(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (hasViDiacritics(trimmed)) return false;
  if (isShoeModelName(trimmed) || isNonTranslatable(trimmed)) return true;

  // Pure dates: e.g. 22/9/2026, 2026-09-22, 22/09/26, 22.09.2026, 22/9
  if (/^\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?$/.test(trimmed)) return true;

  // Short codes, spec numbers, model numbers, version tags, or timestamps
  // e.g. "SB-077-C-1", "SB-077-p-1", "#01", "REV.A", "V1.2"
  if (trimmed.length <= 45 && /^[A-Z0-9\-_\/\.:#\(\)\s]+$/i.test(trimmed)) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    const ALLOWED_METADATA_TOKENS = new Set([
      "NIKE", "ZOOM", "NYJAH", "AIR", "MAX", "PLUS", "PRO", "RETRO", "FORCE", "DUNK",
      "SAMPLE", "STAGE", "CFM", "DEV", "PROD", "PASS", "FAIL", "OK", "NG", "DATE",
      "MODEL", "REV", "ROUND", "CONFIRM", "STATUS", "SPEC", "CODE", "SIZE", "QTY"
    ]);

    const allWordsAreMetadata = words.every((w) => {
      const cleanW = w.replace(/^[#\(\[\{\.\:]+|[\)\]\}\.\:\,]+$/g, "");
      if (!cleanW) return true;
      if (/\d/.test(cleanW)) return true; // contains digits: e.g. "SB-077-C-1", "v2"
      if (cleanW.length <= 3) return true; // short acronym / token
      return ALLOWED_METADATA_TOKENS.has(cleanW.toUpperCase());
    });

    if (allWordsAreMetadata) {
      return true;
    }
  }

  return false;
}

/**
 * A batch response is only usable when it contains a real target-language value.
 * Gemini may return syntactically valid JSON while omitting one or more ids, so a
 * successful HTTP response alone must never be treated as a completed translation.
 */
function needsTranslationRecovery(
  sourceText: string,
  translatedText: string | undefined,
  sourceLanguage: string,
  targetLanguage: string
): boolean {
  if (!translatedText || !translatedText.trim()) return true;

  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (normalize(sourceText) === normalize(translatedText)) return true;

  // The application currently translates Vietnamese manuals into English. An
  // accented Vietnamese result is definitive evidence that the provider left the
  // source text in place, even when the model returned a non-empty JSON value.
  return sourceLanguage === "vi" && targetLanguage === "en" && hasViDiacritics(translatedText);
}


/**
 * Splits existing hybrid bilingual strings into separate clean English and Vietnamese components.
 * Handles patterns such as:
 *   - "Toe cap shape-Hình dạng mũi" -> { en: "Toe cap shape", vi: "Hình dạng mũi" }
 *   - "Wrinkle collar lining -Nhăn lót vòng cổ" -> { en: "Wrinkle collar lining", vi: "Nhăn lót vòng cổ" }
 *   - "Rocking-Độ ổn định" -> { en: "Rocking", vi: "Độ ổn định" }
 *   - "Cleaness-Vệ sinh" -> { en: "Cleaness", vi: "Vệ sinh" }
 *   - "X-ray-Cộm" -> { en: "X-ray", vi: "Cộm" }
 *   - "Bond gap upper to bottom-Hở keo đế với mặt giày" -> { en: "Bond gap upper to bottom", vi: "Hở keo đế với mặt giày" }
 *   - "Inspection Item / Hạng mục kiểm tra" -> { en: "Inspection Item", vi: "Hạng mục kiểm tra" }
 *   - "Inspection Focuses\nTrọng điểm kiểm tra" -> { en: "Inspection Focuses", vi: "Trọng điểm kiểm tra" }
 *   - "Packing inconsistentGiấy gói/qui cách đó" -> { en: "Packing inconsistent", vi: "Giấy gói/qui cách đó" }
 */
/**
 * Extracts a numbered step or CTQ item index (e.g. "1.", "1.1", "Step 1", "CTQ 2", "1.EN", "1.VI")
 */
export function extractItemStepNumber(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*(\d+(?:\.\d+)?)|#?\s*(\d+(?:\.\d+)?)\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)\b))/i);
  if (m) return m[1] || m[2];
  return null;
}

export function splitBilingualText(rawText: string, isInspectionItem: boolean = false): { en: string; vi: string } | null {
  if (!rawText) return null;
  const text = rawText.trim();

  // 1. Multi-line in 1 paragraph: EN line + VI line
  if (text.includes("\n")) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 2) {
      if (!hasViDiacritics(lines[0]) && /[a-zA-Z]{2,}/.test(lines[0]) && hasViDiacritics(lines[1])) {
        return { en: lines[0], vi: lines[1] };
      }
      if (hasViDiacritics(lines[0]) && !hasViDiacritics(lines[1]) && /[a-zA-Z]{2,}/.test(lines[1])) {
        return { en: lines[1], vi: lines[0] };
      }
    } else if (lines.length >= 4 && lines.length % 2 === 0) {
      // Interleaved lines within single paragraph: 1.EN \n 1.VI \n 2.EN \n 2.VI...
      let allPairsMatch = true;
      const enLines: string[] = [];
      const viLines: string[] = [];
      for (let k = 0; k < lines.length; k += 2) {
        const l1 = lines[k], l2 = lines[k + 1];
        const hasVi1 = hasViDiacritics(l1), hasVi2 = hasViDiacritics(l2);
        const hasEn1 = !hasVi1 && /[a-zA-Z]{2,}/.test(l1);
        const hasEn2 = !hasVi2 && /[a-zA-Z]{2,}/.test(l2);
        const step1 = extractItemStepNumber(l1), step2 = extractItemStepNumber(l2);
        const sameStep = Boolean(step1 && step2 && step1 === step2);

        if ((hasEn1 && hasVi2) || (sameStep && hasEn1 && !hasVi2)) {
          enLines.push(l1);
          viLines.push(l2);
        } else if ((hasVi1 && hasEn2) || (sameStep && !hasVi1 && hasEn2)) {
          enLines.push(l2);
          viLines.push(l1);
        } else {
          allPairsMatch = false;
          break;
        }
      }
      if (allPairsMatch && enLines.length >= 2) {
        return { en: enLines.join("\n"), vi: viLines.join("\n") };
      }
    }
  }

  // User Rule: Delimiter / hyphen hybrid split ONLY applies to Inspection Item columns!
  // Outside of Inspection Item, hyphens belong to technical terms (e.g. Tip-quarter, Turn-over, Non-stick, SB-077-A-1)
  // and must NEVER be split as bilingual delimiters.
  if (!isInspectionItem) {
    return null;
  }

  // 2. Delimiter separated hybrid defect names: e.g. "Toe cap shape-Hình dạng mũi", "Rocking-Độ ổn định"
  // MUST NOT split prefixes like "CTQ 1 –", "Step 1 -", or measurements like "9-10", "2kg/cm2", "1/2 size", "90-110oC"
  // Only match hyphens/dashes preceded by an English phrase and followed by a Vietnamese phrase.
  // NEVER split on single slash "/" or colon ":".
  const dashMatch = text.match(/^([A-Za-z0-9\s\/\&,'\(\)]+?)\s*[-–—]\s*([^\-–—]+)$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();

    // Disallow prefixes like CTQ 1, Step 1, Item 2, etc.
    if (/^(ctq|step|item|qam|pfc|note|ghi\s*chú|\d+[\.\)]?)\s*\d*$/i.test(left)) {
      return null;
    }

    // Disallow numbers, measurements, or ranges (e.g. "90-110", "5-7", "9-10")
    if (/^\d+[\.\,]?\d*$/i.test(left) || /^\d+[\.\,]?\d*$/i.test(right)) {
      return null;
    }

    // Disallow single words or units like "inch", "cm2", "size", "eo", etc.
    if (/^(inch|cm2|mm|kg|size|eo|phom|đế|mũi|gót)$/i.test(left) || /^(inch|cm2|mm|kg|size|eo)$/i.test(right)) {
      return null;
    }

    // Disallow descriptive sentences / instructions from being split as bilingual defect pairs.
    // If the text contains verbs/grammatical markers like "bị", "được", "sau khi", "khi", "để", "phải", "không", "cần", "và", "các", "theo",
    // it is a full manufacturing instruction/observation (e.g. "Tip-quarter bị nhạt màu và trắng các lỗ trang trí"), NEVER a bilingual heading!
    if (/\b(bị|được|sau\s*khi|khi|để|phải|không|cần|làm|theo|như|các)\b/i.test(right)) {
      return null;
    }

    // A hyphen directly between ASCII words with no whitespace (e.g. Tip-quarter, Turn-over, Non-stick)
    // is a hyphenated compound word, NOT a bilingual delimiter.
    // In an unspaced dash, right must not begin with a standard ASCII word token (like "quarter").
    if (!/\s[-–—]|[-–—]\s/.test(text)) {
      if (/^[a-zA-Z0-9]/.test(right) && !hasViDiacritics(right.split(/\s+/)[0])) {
        return null;
      }
    }

    // Left must be substantive English (at least 1 word >= 3 chars, e.g. Rocking, Cleaness, Punching, X-ray), NO Vietnamese diacritics
    const leftWords = left.split(/\s+/).filter(Boolean);
    const isSubstantiveEn =
      !hasViDiacritics(left) &&
      (leftWords.length >= 1 && left.length >= 3) &&
      /[a-zA-Z]{3,}/.test(left);

    // Right must be genuine Vietnamese (has diacritics or known keywords)
    const isVi =
      hasViDiacritics(right) ||
      /\b(keo|mai|mài|dan|dán|vong|vòng|mui|mũi|cao|got|gót|com|cộm|ve|vệ|de|đế|bo|bộ|nhan|nhăn|ho|hở|meo|méo|lot|lót|chặt|may|định|vệ|sinh|lỗ|đục)\b/i.test(
        right
      );

    if (isSubstantiveEn && isVi && right.length >= 3) {
      return { en: left, vi: right };
    }
  }

  // 3. Glued English + Vietnamese: e.g. "Packing inconsistentGiấy gói/qui cách đó"
  // The boundary must be a lowercase ASCII letter directly followed by an uppercase ASCII letter [A-Z]
  const camelMatch = text.match(/^([A-Za-z0-9\s\/\&,'\(\)]*?[a-z0-9])([A-Z][\s\S]*)$/);
  if (camelMatch) {
    const left = camelMatch[1].trim();
    const right = camelMatch[2].trim();
    const leftWords = left.split(/\s+/).filter(Boolean);
    if (
      !hasViDiacritics(left) &&
      !/\b(ghi|chu|may|dan|mai|keo|got|de|mui|lot|nhan|chay|rap|phom|khuon|bien|chi|lon|dap|cuon|xo|cot|day|ban|lo|dinh|quet|vien|bao|trung|eo)\b/i.test(left) &&
      leftWords.length >= 2 &&
      /[a-zA-Z]{3,}/.test(left) &&
      hasViDiacritics(right)
    ) {
      return { en: left, vi: right };
    }
  }

  return null;
}

/**
 * Core PPTX Crawling and Translation Service
 * 
 * Guarantees:
 * 1. Zero Image to AI: ppt/media/* files are strictly untouched and NEVER sent to AI.
 * 2. High-fidelity XML manipulation: paragraph properties, bullets, fonts, and graphics remain intact.
 * 3. Bidirectional translation with glossary enforcement.
 */
export class PptxTranslatorService {
  /**
   * Crawl a PPTX file to extract structured text and metadata without modifying it.
   */
  async crawl(
    buffer: Buffer,
    options?: { includeMarkitdown?: boolean }
  ): Promise<{ stats: PptxExtractionStats; slides: PptxSlideData[] }> {
    const zip = await JSZip.loadAsync(buffer);

    // 1. Identify all protected media files (Images/Audio/Video)
    // GUARANTEE: These files are strictly counted, NEVER read as image data, NEVER sent to AI.
    const mediaFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/media\/.+$/i.test(name)
    );

    // 2. Find all slide XML files sorted in order
    const slideFiles = await orderedSlidePaths(zip);

    const slides: PptxSlideData[] = [];
    let totalWords = 0;
    let totalCharacters = 0;
    let totalParagraphs = 0;

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      const slideIndex = i + 1;
      const slideXml = await zip.file(slidePath)?.async("string");
      if (!slideXml) continue;

      const paragraphs = this.extractParagraphsFromXml(slideXml, slideIndex);
      let title = `Slide ${slideIndex}`;

      // Pick first non-empty paragraph as title candidate
      for (const p of paragraphs) {
        if (p.originalText.trim()) {
          title = p.originalText.trim().slice(0, 80);
          break;
        }
      }

      // Check speaker notes if present
      let notes: string | undefined;
      const notesPath = `ppt/notesSlides/notesSlide${Number(slidePath.match(/slide(\d+)/)![1])}.xml`;
      const notesXml = await zip.file(notesPath)?.async("string");
      if (notesXml) {
        const noteParagraphs = this.extractParagraphsFromXml(notesXml, slideIndex);
        const noteTexts = noteParagraphs
          .map((np) => np.originalText.trim())
          .filter(Boolean);
        if (noteTexts.length > 0) {
          notes = noteTexts.join("\n");
        }
      }

      slides.push({
        slideIndex,
        slideFileName: slidePath,
        title,
        paragraphs,
        notes,
      });

      for (const p of paragraphs) {
        totalCharacters += p.originalText.length;
        const words = p.originalText.trim().split(/\s+/).filter(Boolean);
        totalWords += words.length;
      }
      totalParagraphs += paragraphs.length;
    }

    // Call Microsoft MarkItDown only if explicitly requested (e.g. for structured markdown view)
    const mdResult = options?.includeMarkitdown
      ? await readPptxWithMarkItDown(buffer)
      : { markdown: "", success: false };

    const stats: PptxExtractionStats = {
      totalSlides: slides.length,
      totalParagraphs,
      totalWords,
      totalCharacters,
      totalImagesProtected: mediaFiles.length,
      protectedImageNames: mediaFiles.map((f) => f.replace("ppt/media/", "")),
      imageShieldActive: true,
      markitdownMarkdown: mdResult.markdown || undefined,
      markitdownLoaded: mdResult.success,
    };

    return { stats, slides };
  }

  /**
   * Translates a PPTX presentation from Vietnamese to English (or specified language pair),
   * updating the slide XMLs while preserving all layouts and keeping all images 100% untouched.
   */
  async translate(
    buffer: Buffer,
    options?: {
      sourceLanguage?: string;
      targetLanguage?: string;
      provider?: TranslationProvider;
      onProgress?: (update: PptxProgressUpdate) => void;
      editedSlides?: PptxSlideData[];
      mode?: PptxTranslationMode;
      fileName?: string;
      stage?: string;
      translateMissingOnly?: boolean;
      selectedUnitIds?: string[];
      selectedSlideIndices?: number[];
      slideRange?: string;
      customTranslations?: Record<string, string>;
    }
  ): Promise<PptxTranslationResult> {
    const startTime = Date.now();
    const sourceLanguage = options?.sourceLanguage || "vi";
    const targetLanguage = options?.targetLanguage || "en";
    const provider = options?.provider || getTranslationProvider();
    const mode: PptxTranslationMode = options?.mode || "ipqc_bilingual";

    // Progress 1: Extracting structure
    options?.onProgress?.({
      stage: "extracting",
      progress: 10,
      message: "Đang đọc cấu trúc OpenXML của bài trình chiếu...",
    });

    const zip = await JSZip.loadAsync(buffer);

    // Fast in-memory OpenXML crawl without blocking on external Python bridge
    const { stats, slides } = await this.crawl(buffer, { includeMarkitdown: false });

    // Manufacturing stage detection for contextual translation guidance
    const effectiveStage = options?.stage && options.stage !== "auto"
      ? options.stage
      : detectPresentationStage(slides);

    const STAGE_CONTEXT_MAP: Record<string, string> = {
      nosew: "Nosew & Hot Pressing stage. 'Liệu' refers to TPU film/mesh piece; 'Bao không' = air bubbles; 'Ép' = press; 'Màng bảo vệ' = protective film. Always write 'Nosew' or 'nosew' as a single unhyphenated word, never 'No-sew'.",
      stitching: "Stitching & Sewing stage. 'May' = stitch/sew; 'Mép/biên' = margin/edge; 'Mũi' = stitch; 'Chỉ' = thread.",
      cutting: "Cutting & Die Cutting stage. 'Liệu' = material; 'Dao chặt' = cutting die; 'Độ bén' = sharpness.",
      assembly: "Assembly, Lasting & Bottom Cementing stage. 'Mặt' = upper; 'Đế' = sole/bottom; 'Quét keo' = apply cement; 'Quét xử lý' = apply primer.",
      stockfit: "Stockfit & Outsole Preparation stage. 'Mài đế' = buff outsole; 'Xử lý đế' = prime outsole; 'Đế ngoài' = outsole.",
      qa: "QA Inspection & CTQ stage. Use concise imperative verbs (Verify, Ensure, Inspect) and noun adjunct defect phrasing."
    };
    const stageContext = STAGE_CONTEXT_MAP[effectiveStage.toLowerCase()] || "Ching Luh Footwear manufacturing SOP";

    // Fetch approved terminology, excluding corrupted imported rows that map a
    // full instruction to a short process heading. Those rows must never bypass
    // Gemini/Google NMT through an exact glossary hit.
    const rawApprovedGlossary = db.getApprovedTerminology(sourceLanguage, targetLanguage);
    const approvedGlossary = rawApprovedGlossary.filter(isSafeTerminologyEntry);
    const blockedGlossaryCount = rawApprovedGlossary.length - approvedGlossary.length;
    if (blockedGlossaryCount > 0) {
      console.warn(`Ignored ${blockedGlossaryCount} unsafe glossary mappings for this translation run.`);
    }

    // If editedSlides is provided, use those translations; otherwise translate automatically
    const editedMap = new Map<string, string>();
    if (options?.editedSlides) {
      for (const s of options.editedSlides) {
        for (const p of s.paragraphs) {
          if (p.translatedText) {
            editedMap.set(p.id, p.translatedText);
          }
        }
      }
    }

    // 1. Collect all items that need translation across all slides in the entire presentation
    let allItemsToTranslate: { id: string; sourceText: string }[] = [];
    const allUnitsWithMeta: TranslationUnitWithMeta[] = [];
    const unitMetaMap = new Map<string, TranslationUnitWithMeta>();
    const translationMap = new Map<string, string>();

    // Seed with pre-edited translations
    for (const [k, v] of editedMap.entries()) {
      translationMap.set(k, v);
    }

    // Build normalized lookup map for approved terminology (full sentences, headers, defect names)
    const approvedExactMap = new Map<string, string>();
    for (const entry of approvedGlossary) {
      if (entry.sourceTerm && entry.targetTerm) {
        const key = entry.sourceTerm.trim().toLowerCase().replace(/\s+/g, " ");
        approvedExactMap.set(key, entry.targetTerm.trim());
      }
    }

    const effectiveSlideIndices = options?.selectedSlideIndices && options.selectedSlideIndices.length > 0
      ? new Set(options.selectedSlideIndices)
      : options?.slideRange
      ? new Set(parseSlideRange(options.slideRange, slides.length))
      : null;

    for (const slide of slides) {
      if (effectiveSlideIndices && !effectiveSlideIndices.has(slide.slideIndex)) {
        // Non-selected slides: keep 100% original text, zero LLM translation
        for (const p of slide.paragraphs) {
          translationMap.set(p.id, p.originalText);
        }
        if (slide.notes) {
          translationMap.set(`notes_s${slide.slideIndex}`, slide.notes);
        }
        continue;
      }

      // Pre-identify in-shape interleaved pairs (1.EN 1.VI 2.EN 2.VI)
      const shapeGroups = new Map<number, PptxParagraph[]>();
      for (const p of slide.paragraphs) {
        if (!p.originalText || !p.originalText.trim()) continue;
        const sKey = p.shapeIndex ?? 0;
        if (!shapeGroups.has(sKey)) shapeGroups.set(sKey, []);
        shapeGroups.get(sKey)!.push(p);
      }

      const pairedParagraphMap = new Map<string, { partner: PptxParagraph; isEn: boolean }>();
      for (const members of shapeGroups.values()) {
        for (let k = 0; k < members.length - 1; k++) {
          const p1 = members[k], p2 = members[k + 1];
          if (pairedParagraphMap.has(p1.id) || pairedParagraphMap.has(p2.id)) continue;
          const t1 = p1.originalText.trim(), t2 = p2.originalText.trim();
          if (isInspectionStatusLabel(t1) || isInspectionStatusLabel(t2)) continue;
          if (isNonTranslatable(t1) || isNonTranslatable(t2)) continue;
          const hasVi1 = hasViDiacritics(t1), hasVi2 = hasViDiacritics(t2);
          const hasEn1 = !hasVi1 && /[a-zA-Z]{2,}/.test(t1);
          const hasEn2 = !hasVi2 && /[a-zA-Z]{2,}/.test(t2);
          const step1 = extractItemStepNumber(t1), step2 = extractItemStepNumber(t2);
          const sameStep = Boolean(step1 && step2 && step1 === step2);
          const diffStep = Boolean(step1 && step2 && step1 !== step2);
          if (diffStep) continue;

          const lenRatio = Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
          const plausibleLength = lenRatio >= 0.35 || (sameStep && lenRatio >= 0.25);
          if (!plausibleLength) continue;

          if ((hasEn1 && hasVi2 && lenRatio >= 0.4) || (sameStep && hasEn1 && !hasVi2)) {
            pairedParagraphMap.set(p1.id, { partner: p2, isEn: true });
            pairedParagraphMap.set(p2.id, { partner: p1, isEn: false });
            k++;
          } else if ((hasVi1 && hasEn2 && lenRatio >= 0.4) || (sameStep && !hasVi1 && hasEn2)) {
            pairedParagraphMap.set(p2.id, { partner: p1, isEn: true });
            pairedParagraphMap.set(p1.id, { partner: p2, isEn: false });
            k++;
          }
        }
      }

      for (const p of slide.paragraphs) {
        if (!p.originalText || !p.originalText.trim()) continue;

        const meta: TranslationUnitWithMeta = {
          id: p.id,
          sourceText: p.originalText,
          slideIndex: slide.slideIndex,
          shapeIndex: p.shapeIndex,
          paragraphIndex: p.paragraphIndex,
          isTitle: p.isTitle,
          isInspectionItem: p.isInspectionItem,
        };
        allUnitsWithMeta.push(meta);
        unitMetaMap.set(p.id, meta);

        // 0. English Immunity Shield: inspection status labels under photos are ALWAYS immune
        if (isInspectionStatusLabel(p.originalText)) {
          translationMap.set(p.id, p.originalText);
          continue;
        }

        // In-shape interleaved bilingual pair: 1.EN 1.VI 2.EN 2.VI
        const pairInfo = pairedParagraphMap.get(p.id);
        if (pairInfo) {
          if (mode === "ipqc_bilingual") {
            translationMap.set(p.id, p.originalText);
            continue;
          } else if (mode === "replace_en") {
            translationMap.set(p.id, pairInfo.isEn ? p.originalText : pairInfo.partner.originalText);
            continue;
          }
        }

        // English Immunity Shield: shoe models, technical standards, or already pure English
        if (isEnglishImmunityProtected(p.originalText, sourceLanguage)) {
          translationMap.set(p.id, p.originalText);
          continue;
        }

        if (p.isInspectionItem) {
          const hybrid = splitBilingualText(p.originalText, true);
          if (hybrid) {
            // Hybrid bilingual: in replace_en keep only EN part; in bilingual keep as-is
            translationMap.set(p.id, mode === "replace_en" ? hybrid.en : p.originalText);
          } else if (sourceLanguage === "vi" && isPureEnglish(p.originalText) && !hasViDiacritics(p.originalText)) {
            // Already pure English — no translation needed
            translationMap.set(p.id, p.originalText);
          } else {
            // Fix #2: Pure VI Inspection Item cells must also be translated!
            // Previously these were silently skipped causing "dịch sót".
            allItemsToTranslate.push({ id: p.id, sourceText: p.originalText });
          }
          continue;
        }

        // Outside of Inspection Item: only multi-line \n is considered hybrid, never hyphen/delimiter:
        const hybrid = splitBilingualText(p.originalText, false);
        if (hybrid) {
          translationMap.set(p.id, mode === "replace_en" ? hybrid.en : p.originalText);
          continue;
        }

        // If paragraph is pure English (already English, no Vietnamese diacritics when translating VI -> EN):
        if (sourceLanguage === "vi" && isPureEnglish(p.originalText) && !hasViDiacritics(p.originalText)) {
          translationMap.set(p.id, p.originalText);
          continue;
        }

        // Conditional note prefix pattern: *Đối với <Model> / Đối với <Model>
        // User rule: Only translate "đối với" -> "For", keep shoe model untouched and never bind model into glossary!
        const doiVoiMatch = p.originalText.match(/^(\s*\*?\s*)đối\s*với\s+(.+)$/i);
        if (doiVoiMatch) {
          const prefix = doiVoiMatch[1].includes("*") ? "*For " : "For ";
          const remainder = doiVoiMatch[2].trim();
          if (isShoeModelName(remainder) || /^[A-Z0-9\-\/\.\s]+$/i.test(remainder)) {
            translationMap.set(p.id, prefix + remainder);
            continue;
          }
        }

        // Direct check against approved domain glossary for standard short process headings and defect terms.
        // Direct check against approved domain glossary for exact matching paragraphs and headings
        const normKey = p.originalText.trim().toLowerCase().replace(/\s+/g, " ");

        if (approvedExactMap.has(normKey)) {
          translationMap.set(p.id, approvedExactMap.get(normKey)!);
          continue;
        }

        // Check stripped bullet/asterisk
        const unstarredKey = normKey.replace(/^\s*[\*•\-#]\s*/, "");
        if (normKey !== unstarredKey && approvedExactMap.has(unstarredKey)) {
          const matchedTarget = approvedExactMap.get(unstarredKey)!;
          const prefix = p.originalText.trim().startsWith("*") && !matchedTarget.startsWith("*") ? "*" : "";
          translationMap.set(p.id, prefix + matchedTarget);
          continue;
        }

        // Check stripped trailing colon
        const uncolonKey = normKey.replace(/\s*:\s*$/, "");
        if (normKey !== uncolonKey && approvedExactMap.has(uncolonKey)) {
          const matchedTarget = approvedExactMap.get(uncolonKey)!;
          translationMap.set(p.id, matchedTarget);
          continue;
        }

        if (translationMap.has(p.id)) continue;
        if (
          !/[a-zA-Z\u00C0-\u1EF9]/i.test(p.originalText) ||
          isNonTranslatable(p.originalText) ||
          isShoeModelName(p.originalText)
        ) {
          translationMap.set(p.id, p.originalText);
          continue;
        }
        allItemsToTranslate.push({ id: p.id, sourceText: p.originalText });
      }

      // Notes
      if (slide.notes && slide.notes.trim()) {
        const notesId = `notes_s${slide.slideIndex}`;
        const notesMeta: TranslationUnitWithMeta = {
          id: notesId,
          sourceText: slide.notes,
          slideIndex: slide.slideIndex,
          notes: true,
        };
        allUnitsWithMeta.push(notesMeta);
        unitMetaMap.set(notesId, notesMeta);

        if (/[a-zA-Z\u00C0-\u1EF9]/i.test(slide.notes)) {
          allItemsToTranslate.push({ id: notesId, sourceText: slide.notes });
        } else {
          translationMap.set(notesId, slide.notes);
        }
      }
    }

    // Phase 1 & 2: Document-Wide Translation Memory (TM) Pre-scan
    const docTM = new DocumentTranslationMemory();
    docTM.initializeDocumentTM(allUnitsWithMeta, approvedGlossary);

    // Phase 3: Translation Planning - Pre-resolve exact matches from TM
    const tmPlan = docTM.planTranslations(allUnitsWithMeta);
    for (const [id, preTrans] of tmPlan.preResolved.entries()) {
      translationMap.set(id, preTrans);
    }

    const modifiedParagraphIds = new Set<string>();

    // Phase 3.5: Apply custom translations supplied from Smart Audit
    if (options?.customTranslations) {
      for (const [customId, customText] of Object.entries(options.customTranslations)) {
        if (typeof customText === "string" && customText.trim()) {
          translationMap.set(customId, customText.trim());
          modifiedParagraphIds.add(customId);
        }
      }
    }

    let auditReport: SmartAuditReport | undefined;

    if (options?.translateMissingOnly) {
      auditReport = await auditPptxGaps(buffer, options?.fileName || "presentation.pptx", {
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        mode,
        customDocTM: docTM,
        approvedGlossary,
      });

      const allowedIds = options.selectedUnitIds ? new Set(options.selectedUnitIds) : null;
      const selected = auditReport.units.filter((u) =>
        allowedIds ? allowedIds.has(u.id) && u.selectedForTranslation : u.selectedForTranslation
      );
      const missingIdSet = new Set(selected.map((u) => u.id));
      if(sourceLanguage === "vi" && targetLanguage === "en" && mode !== "replace_en") {
        for(const slide of slides.filter(s=>s.paragraphs.some(p=>missingIdSet.has(p.id)))) {
          if(!this.isSlideIsq(slide,options.fileName))continue;
          const omitted=auditReport.units.filter(u=>u.location.partPath===slide.slideFileName && u.requiresTranslation && !missingIdSet.has(u.id));
          if(omitted.length)throw new Error(`ISQ cần dịch đủ cả slide. Hãy chọn thêm ${omitted.length} đoạn trên slide ${slide.slideIndex}.`);
        }
      }
      // Exact IDs preserve the scope shown in the review. Never fan out by canonical text.
      for (const u of selected) modifiedParagraphIds.add(u.id);
      for (const u of selected.filter((u) => u.status === "TRANSLATION_CONFLICT" || u.glossaryMismatches !== undefined)) translationMap.delete(u.id);
      for(const u of selected) if(u.existingTranslation && targetLanguage === "en" && !hasViDiacritics(u.existingTranslation))translationMap.set(u.id,u.existingTranslation);
      const queuedIds=new Set(allItemsToTranslate.map(item=>item.id));
      for(const u of selected){
        // Source-language evidence from the audit also covers Vietnamese without
        // accents, which the older English pre-screen can mistakenly skip.
        if(translationMap.get(u.id)?.trim()===u.sourceText.trim())translationMap.delete(u.id);
        if(!translationMap.has(u.id) && !queuedIds.has(u.id)){
          allItemsToTranslate.push({id:u.id,sourceText:unitMetaMap.get(u.id)?.sourceText || u.sourceText});queuedIds.add(u.id);
        }
      }
      allItemsToTranslate = allItemsToTranslate.filter((item) => missingIdSet.has(item.id) && !translationMap.has(item.id));
    }

    // 2. Pre-flight Deduplication & Cache Resolution across presentation
    const { uniqueToTranslate, resolveAll, stats: dedupStats } = translationCache.deduplicateItems(
      allItemsToTranslate,
      sourceLanguage,
      targetLanguage,
      options?.translateMissingOnly ? new Set(auditReport?.units.filter((u) => modifiedParagraphIds.has(u.id) && (u.status === "TRANSLATION_CONFLICT" || u.glossaryMismatches !== undefined)).map((u) => u.sourceText.trim())) : undefined
    );

    // Populate pre-cached translations into translationMap
    const cachedResolved = resolveAll(new Map());
    for (const [id, trans] of cachedResolved.entries()) {
      translationMap.set(id, trans);
    }

    const itemsPendingTranslation = uniqueToTranslate.filter((it) => !translationMap.has(it.id));

    // Progress 2: Crawling complete
    options?.onProgress?.({
      stage: "crawling",
      progress: 25,
      totalSlides: slides.length,
      totalItems: itemsPendingTranslation.length,
      message: `Đã tìm thấy ${slides.length} slide (${allItemsToTranslate.length} đoạn, thu gọn còn ${itemsPendingTranslation.length} đoạn cần dịch). Bắt đầu dịch AI...`,
    });

    // 2. Batch translate across the entire presentation. Flash Lite is more
    // reliable with bounded JSON outputs than with one very large request.
    if (typeof provider.translateBatch === "function" && itemsPendingTranslation.length > 0) {
      let activeProvider: TranslationProvider = provider;
      // Strategy 3: Group into 25-item chunks for ultra-stable JSON generation without truncations
      const baseChunkSize = activeProvider.name === "airgapped" ? 50 : 25;
      const lateChunkSize = activeProvider.name === "airgapped" ? 50 : 15;

      // Pre-compute totalBatches accounting for mixed chunk sizes so "gói X/Y" display is always correct.
      // First 70% of items → baseChunkSize, remaining 30% → lateChunkSize.
      const totalItems = itemsPendingTranslation.length;
      const earlyItemCount = Math.ceil(totalItems * 0.70);
      const lateItemCount = totalItems - earlyItemCount;
      const totalBatches = Math.max(1,
        Math.ceil(earlyItemCount / baseChunkSize) +
        (activeProvider.name === "gemini" ? Math.ceil(lateItemCount / lateChunkSize) : Math.ceil(lateItemCount / baseChunkSize))
      );

      let geminiQuotaFallbackActive = false;
      let quotaFallbackProgress = 30; // track where we were when quota hit
      let consecutiveQuotaHits = 0; // Strategy 2: track repeated quota signals
      let hadRecentTransientError = false; // Adaptive pacing: lengthen delay to 5.5s after transient API spike

      // Strategy 2: Retry-before-fallback helper
      // Google Free Tier limits are on a 60-second sliding window.
      // If retryAfterSeconds <= 70s, wait out the window with live countdown instead of degrading quality to NMT.
      const retryAfterDelay = async (retryAfterSeconds?: number, currentProgress?: number): Promise<boolean> => {
        const totalSec = retryAfterSeconds != null ? Math.min(Math.max(retryAfterSeconds, 5), 70) : 30;
        console.log(`[QuotaGuard] Waiting ${totalSec}s for Gemini RPM quota window reset (requested=${retryAfterSeconds}s)...`);

        // Real-time countdown updates so user sees the timer counting down
        for (let rem = totalSec; rem > 0; rem -= 5) {
          options?.onProgress?.({
            stage: "translating",
            progress: currentProgress ?? quotaFallbackProgress,
            message: `⏳ Gemini đạt giới hạn tốc độ 15 req/phút của Google. Đang chờ làm mới (${rem}s)... sau đó sẽ tự động dịch tiếp bằng Gemini.`,
          });
          const sleepChunk = Math.min(rem, 5) * 1000;
          await new Promise((r) => setTimeout(r, sleepChunk));
        }
        return true; // proceed to retry with Gemini
      };

      const activateQuotaFallback = (error: GeminiRateLimitError, currentProgress?: number) => {
        if (!geminiQuotaFallbackActive) {
          geminiQuotaFallbackActive = true;
          activeProvider = new GoogleTranslationProvider();
          quotaFallbackProgress = currentProgress ?? 30;
          console.warn(
            `Gemini quota reached${error.retryAfterSeconds ? ` (retry after ${error.retryAfterSeconds}s)` : ""}. ` +
              "Using Google NMT for the remaining presentation."
          );
          // Report at CURRENT progress level — never jump backward!
          options?.onProgress?.({
            stage: "translating",
            progress: quotaFallbackProgress,
            totalItems: allItemsToTranslate.length,
            message: `⚡ Gemini quota giới hạn — tự động chuyển Google NMT cho các slide còn lại. Tiến trình không bị ngắt.`,
          });
        }
      };

      const newlyTranslatedMap = new Map<string, string>();
      let batchIndex = 0;
      let itemsProcessed = 0;
      for (let i = 0; i < itemsPendingTranslation.length; ) {
        // Strategy 3: Use smaller chunks after 70% of ITEMS processed (not batches)
        // Using items-processed ratio gives stable switchover regardless of file size
        const itemsRatio = itemsProcessed / Math.max(1, totalItems);
        let effectiveChunk = (itemsRatio > 0.70 && activeProvider.name === "gemini")
          ? lateChunkSize
          : baseChunkSize;

        // P1-1 Token/Size guard: If character length across items is unusually large, reduce chunk size
        const potentialSlice = itemsPendingTranslation.slice(i, i + effectiveChunk);
        const totalChars = potentialSlice.reduce((acc, it) => acc + (it.sourceText?.length || 0), 0);
        if (totalChars > 4500 && effectiveChunk > 12) {
          effectiveChunk = 12;
        }
        const chunk = itemsPendingTranslation.slice(i, i + effectiveChunk);

        const currentBatch = batchIndex + 1;

        const progressPercent = 25 + Math.round((currentBatch / (totalBatches + 1)) * 55);

        options?.onProgress?.({
          stage: "translating",
          progress: progressPercent,
          currentBatch,
          totalBatches,
          translatedItems: i,
          totalItems: itemsPendingTranslation.length,
          message: `Đang dịch gói ${currentBatch}/${totalBatches} (${chunk.length} đoạn văn) với ${activeProvider.name}...`,
        });

        // Pacing: Ensure safe delay between consecutive requests to stay strictly below Google's RPM limit
        if (batchIndex > 0 && activeProvider.name.toLowerCase().includes("gemini")) {
          const gemini = activeProvider as any;
          const currentModel = (gemini.getModel?.() || "").toLowerCase();
          const isLiteModel = currentModel.includes("lite") || currentModel === "";
          // Flash-lite has 15 RPM limit -> 6500ms delay = ~9.2 RPM (safe, <=60% quota)
          // Standard Flash has 5 RPM limit -> 13000ms delay = ~4.6 RPM (safe)
          const pacingMs = hadRecentTransientError
            ? (isLiteModel ? 8500 : 15000)
            : (isLiteModel ? 6500 : 13000);
          options?.onProgress?.({
            stage: "translating",
            progress: progressPercent,
            currentBatch,
            totalBatches,
            translatedItems: i,
            totalItems: itemsPendingTranslation.length,
            message: `⏳ Điều tiết nhịp độ an toàn (${(pacingMs / 1000).toFixed(1)}s/gói) để bảo vệ hạn mức Gemini RPM...`,
          });
          await new Promise((r) => setTimeout(r, pacingMs));
          hadRecentTransientError = false; // Reset after successful cooldown wait
        }

        let batchRes: BatchTranslationResponse | null = null;
        const docConstraints = docTM.getPromptConstraints(chunk);
        const effectiveGlossary = [...approvedGlossary, ...docConstraints];

        try {
          batchRes = await activeProvider.translateBatch!({
            items: chunk,
            sourceLanguage,
            targetLanguage,
            approvedTerminology: effectiveGlossary,
            context: stageContext,
          });
        } catch (err) {
          hadRecentTransientError = true;
          if (err instanceof GeminiRateLimitError) {
            consecutiveQuotaHits++;
            console.warn(`[QuotaGuard] Batch ${currentBatch} hit Gemini rate limit (429). Waiting for window reset...`);
            const shouldRetry = await retryAfterDelay((err as GeminiRateLimitError).retryAfterSeconds, progressPercent);
            if (shouldRetry && consecutiveQuotaHits <= 3) {
              console.log(`[QuotaGuard] Retrying batch ${currentBatch} after cooldown with ${activeProvider.name}...`);
              try {
                batchRes = await activeProvider.translateBatch!({
                  items: chunk,
                  sourceLanguage,
                  targetLanguage,
                  approvedTerminology: effectiveGlossary,
                  context: stageContext,
                });
                consecutiveQuotaHits = 0; // reset on success
                hadRecentTransientError = false;
              } catch (retryQuotaErr) {
                console.warn(`[QuotaGuard] Retry also encountered quota on batch ${currentBatch}.`);
              }
            }
          } else {
            console.warn(`Batch ${currentBatch} error, retrying in 2 smaller sub-chunks with safe delay...`, err);
            // Safe pacing before sub-chunk 1 to avoid bursting
            await new Promise((r) => setTimeout(r, 6500));
            const half = Math.ceil(chunk.length / 2);
            const subResults = new Map<string, string>();
            try {
              const sub1 = await activeProvider.translateBatch!({
                items: chunk.slice(0, half),
                sourceLanguage,
                targetLanguage,
                approvedTerminology: effectiveGlossary,
                context: stageContext,
              });
              if (sub1?.results) {
                for (const [k, v] of sub1.results.entries()) subResults.set(k, v);
              }
            } catch (s1Err) {
              console.warn(`Sub-chunk 1 retry error:`, s1Err);
            }

            // Safe pacing between sub-chunks
            await new Promise((r) => setTimeout(r, 6500));
            try {
              const sub2 = await activeProvider.translateBatch!({
                items: chunk.slice(half),
                sourceLanguage,
                targetLanguage,
                approvedTerminology: effectiveGlossary,
                context: stageContext,
              });
              if (sub2?.results) {
                for (const [k, v] of sub2.results.entries()) subResults.set(k, v);
              }
            } catch (s2Err) {
              console.warn(`Sub-chunk 2 retry error:`, s2Err);
            }

            if (subResults.size > 0) {
              batchRes = {
                results: subResults,
                provider: activeProvider.name,
                durationMs: 0,
              };
              hadRecentTransientError = false;
            }
          }
        }

        // Emergency Fallback: ONLY if all retries failed for this batch, use Google NMT for THIS BATCH ONLY.
        if (!batchRes || !batchRes.results || batchRes.results.size === 0) {
          if (activeProvider.name !== "google_translate") {
            console.warn(
              `[ProviderFailover] Gemini failed for batch ${currentBatch}. ` +
              `Translating batch ${currentBatch} with Google NMT emergency fallback, preserving Gemini for subsequent batches.`
            );
            const emergencyNmt = new GoogleTranslationProvider();
            options?.onProgress?.({
              stage: "translating",
              progress: progressPercent,
              currentBatch,
              totalBatches,
              translatedItems: i,
              totalItems: itemsPendingTranslation.length,
              message: `⚡ Gói ${currentBatch} tạm dùng Google NMT cho gói này; gói tiếp theo vẫn sẽ tiếp tục dùng Gemini.`,
            });
            try {
              batchRes = await emergencyNmt.translateBatch!({
                items: chunk,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: effectiveGlossary,
                context: stageContext,
              });
              hadRecentTransientError = false;
            } catch (fallbackErr) {
              console.error(`Emergency Google NMT fallback failed on batch ${currentBatch}:`, fallbackErr);
            }
          }
        }

        if (batchRes && batchRes.results) {
          for (const item of chunk) {
            const trans = batchRes.results.get(item.id);
            if (trans && trans.trim()) {
              const normalized = normalizeSpiTerminology(trans.trim());
              const polished = polishSopText(normalized, { stage: effectiveStage });
              const meta = unitMetaMap.get(item.id);
              const enforced = docTM.enforceDocumentTM(item.sourceText, polished, sourceLanguage, targetLanguage);
              docTM.recordTranslation(
                item.sourceText,
                enforced.text,
                { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                activeProvider.name === "gemini" ? "GEMINI" : "GOOGLE_NMT"
              );
              translationMap.set(item.id, enforced.text);
              newlyTranslatedMap.set(item.id, enforced.text);
              translationCache.set(item.sourceText, enforced.text, sourceLanguage, targetLanguage);
            } else {
              translationMap.set(item.id, item.sourceText);
              newlyTranslatedMap.set(item.id, item.sourceText);
            }
          }
        } else {
          for (const item of chunk) {
            translationMap.set(item.id, item.sourceText);
            newlyTranslatedMap.set(item.id, item.sourceText);
          }
        }

        options?.onProgress?.({
          stage: "translating",
          progress: Math.min(82, progressPercent + Math.round(55 / (totalBatches * 2))),
          currentBatch,
          totalBatches,
          translatedItems: Math.min(i + chunk.length, itemsPendingTranslation.length),
          totalItems: itemsPendingTranslation.length,
          message: `Đã hoàn tất gói ${currentBatch}/${totalBatches}.`,
        });

        // Strategy 1: Adaptive inter-batch delay — ramp up from 400ms → 1200ms
        // as we approach the end (last 30% of items) to stay under Gemini RPM quota.
        // For Google NMT fallback, no delay needed.
        if (activeProvider.name === "gemini") {
          const isLateStage = itemsRatio > 0.70;
          const adaptiveDelay = isLateStage ? 1200 : itemsRatio > 0.40 ? 700 : 400;
          const hasMoreItems = i + effectiveChunk < itemsPendingTranslation.length;
          if (hasMoreItems) {
            await new Promise((r) => setTimeout(r, adaptiveDelay));
          }
        }

        i += chunk.length;
        itemsProcessed += chunk.length;
        batchIndex++;
      }


      // Fix #1: Propagate translations to all duplicate occurrences (siblings) across slides.
      // resolveAll() MUST always run — it broadcasts cache-hit siblings even when
      // newlyTranslatedMap is empty (e.g. after a batch failure). Without this call
      // those siblings would silently remain untranslated.
      const allResolved = resolveAll(newlyTranslatedMap);
      for (const [id, trans] of allResolved.entries()) {
        if (!translationMap.has(id)) {
          translationMap.set(id, trans);
        } else if (trans && trans.trim() && needsTranslationRecovery(allItemsToTranslate.find(x => x.id === id)?.sourceText || "", translationMap.get(id), sourceLanguage, targetLanguage)) {
          // Override only if current value still needs recovery
          translationMap.set(id, trans);
        }
      }

      // Completion pass: inspect every requested id, including Vietnamese terms
      // written without diacritics (e.g. "May mudguard").  Do not restrict this
      // check to accented characters: Gemini can return a valid partial JSON array.
      let unresolvedItems = allItemsToTranslate.filter((it) =>
        needsTranslationRecovery(it.sourceText, translationMap.get(it.id), sourceLanguage, targetLanguage)
      );

      if (unresolvedItems.length > 0) {
        options?.onProgress?.({
          stage: "translating",
          progress: 86,
          message: `Đang kiểm tra và hoàn tất ${unresolvedItems.length} đoạn văn bản còn lại...`,
        });

        // First retry compact batches. Chunks of 25 preserve throughput and avoid API call spikes.
        const sweepChunkSize = 25;
        for (let s = 0; s < unresolvedItems.length; s += sweepChunkSize) {
          const sweepChunk = unresolvedItems.slice(s, s + sweepChunkSize);
          try {
            const sweepConstraints = docTM.getPromptConstraints(sweepChunk);
            const sweepGlossary = [...approvedGlossary, ...sweepConstraints];
            const sweepRes = await activeProvider.translateBatch!({
              items: sweepChunk,
              sourceLanguage,
              targetLanguage,
              approvedTerminology: sweepGlossary,
            });
            for (const item of sweepChunk) {
              const tr = sweepRes.results.get(item.id);
              if (!needsTranslationRecovery(item.sourceText, tr, sourceLanguage, targetLanguage)) {
                const norm = normalizeSpiTerminology(tr!.trim());
                const meta = unitMetaMap.get(item.id);
                const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                docTM.recordTranslation(
                  item.sourceText,
                  enforced.text,
                  { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                  activeProvider.name === "gemini" ? "GEMINI" : "GOOGLE_NMT"
                );
                translationMap.set(item.id, enforced.text);
              }
            }
          } catch (sweepErr) {
            if (sweepErr instanceof GeminiRateLimitError) {
              activateQuotaFallback(sweepErr, 86);  // sweep is already at 86%, stay there
              try {
                const fallbackRes = await activeProvider.translateBatch!({
                  items: sweepChunk,
                  sourceLanguage,
                  targetLanguage,
                  approvedTerminology: approvedGlossary,
                });
                for (const item of sweepChunk) {
                  const tr = fallbackRes.results.get(item.id);
                  if (!needsTranslationRecovery(item.sourceText, tr, sourceLanguage, targetLanguage)) {
                    const norm = normalizeSpiTerminology(tr!.trim());
                    const meta = unitMetaMap.get(item.id);
                    const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                    docTM.recordTranslation(
                      item.sourceText,
                      enforced.text,
                      { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                      "GOOGLE_NMT"
                    );
                    translationMap.set(item.id, enforced.text);
                  }
                }
              } catch (fallbackErr) {
                console.error("Google NMT completion fallback error:", fallbackErr);
              }
            } else {
              console.warn("Sweep translation error:", sweepErr);
            }
          }
          if (activeProvider.name === "gemini") {
            await new Promise((r) => setTimeout(r, 6500));
          }
        }

        // A model can still omit an id from a batch response. Retry only
        // those ids one by one so no slide is silently skipped.
        unresolvedItems = allItemsToTranslate.filter((it) =>
          needsTranslationRecovery(it.sourceText, translationMap.get(it.id), sourceLanguage, targetLanguage)
        );
        if (typeof activeProvider.translate === "function") {
          for (const item of unresolvedItems) {
            const tmHit = docTM.lookup(item.sourceText);
            if (tmHit && (tmHit.status === "LOCKED" || tmHit.status === "APPROVED" || tmHit.status === "ESTABLISHED")) {
              translationMap.set(item.id, tmHit.target);
              continue;
            }
            const lowerSrc = item.sourceText.trim().toLowerCase().replace(/\s+/g, " ");
            const glossMatch = approvedExactMap.get(lowerSrc);
            if (glossMatch) {
              translationMap.set(item.id, normalizeSpiTerminology(glossMatch));
              continue;
            }
            try {
              const retryConstraints = docTM.getPromptConstraints([item]);
              const retryGlossary = [...approvedGlossary, ...retryConstraints];
              const retry = await activeProvider.translate({
                sourceText: item.sourceText,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: retryGlossary,
              });
              if (!needsTranslationRecovery(item.sourceText, retry.translatedText, sourceLanguage, targetLanguage)) {
                const norm = normalizeSpiTerminology(retry.translatedText.trim());
                const meta = unitMetaMap.get(item.id);
                const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                docTM.recordTranslation(
                  item.sourceText,
                  enforced.text,
                  { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                  activeProvider.name === "gemini" ? "GEMINI" : "GOOGLE_NMT"
                );
                translationMap.set(item.id, enforced.text);
              }
            } catch (retryErr) {
              if (retryErr instanceof GeminiRateLimitError) {
                activateQuotaFallback(retryErr, 88);
                try {
                  const fallback = await activeProvider.translate({
                    sourceText: item.sourceText,
                    sourceLanguage,
                    targetLanguage,
                    approvedTerminology: approvedGlossary,
                  });
                  if (!needsTranslationRecovery(item.sourceText, fallback.translatedText, sourceLanguage, targetLanguage)) {
                    const norm = normalizeSpiTerminology(fallback.translatedText.trim());
                    const meta = unitMetaMap.get(item.id);
                    const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                    docTM.recordTranslation(
                      item.sourceText,
                      enforced.text,
                      { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                      "GOOGLE_NMT"
                    );
                    translationMap.set(item.id, enforced.text);
                  }
                } catch (fallbackErr) {
                  console.error(`Fallback failed for ${item.id}:`, fallbackErr);
                }
              } else {
                console.warn(`Individual retry failed for ${item.id}:`, retryErr);
              }
            }
            if (activeProvider.name === "gemini" && !process.argv.some(a => a.includes("test"))) {
              await new Promise((r) => setTimeout(r, 4500));
            }
          }
        }

        // Last resort: translate only unresolved items with Google NMT + the same
        // glossary.  This makes a quota/model outage recoverable without stopping
        // the complete PPTX job or dropping the affected slide.
        unresolvedItems = allItemsToTranslate.filter((it) =>
          needsTranslationRecovery(it.sourceText, translationMap.get(it.id), sourceLanguage, targetLanguage)
        );
        if (unresolvedItems.length > 0 && activeProvider.name !== "google_translate") {
          const nmtFallback = new GoogleTranslationProvider();
          for (const item of unresolvedItems) {
            try {
              const fallback = await nmtFallback.translate({
                sourceText: item.sourceText,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: approvedGlossary,
              });
              if (fallback.translatedText?.trim()) {
                translationMap.set(item.id, normalizeSpiTerminology(fallback.translatedText.trim()));
              }
            } catch (fallbackErr) {
              // Keep source text rather than deleting a paragraph. The XML writer
              // will therefore preserve every slide even if all providers are down.
              console.error(`NMT fallback failed for ${item.id}:`, fallbackErr);
            }
          }
        }
        if (activeProvider.name === "gemini") {
          console.log(GeminiObservability.getInstance().formatReport());
        }
      }
    } else if (allItemsToTranslate.length > 0) {
      // Fallback for providers without translateBatch (e.g. airgapped or google_translate)
      const batchSize = 6;
      for (let b = 0; b < allItemsToTranslate.length; b += batchSize) {
        const chunk = allItemsToTranslate.slice(b, b + batchSize);
        const progressPercent = 25 + Math.round((b / allItemsToTranslate.length) * 60);
        options?.onProgress?.({
          stage: "translating",
          progress: progressPercent,
          translatedItems: b,
          totalItems: allItemsToTranslate.length,
          message: `Đang dịch đoạn ${b + 1} - ${Math.min(b + batchSize, allItemsToTranslate.length)}/${allItemsToTranslate.length}...`,
        });

        await Promise.all(
          chunk.map(async (item) => {
            try {
              const res = await provider.translate({
                sourceText: item.sourceText,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: approvedGlossary,
              });
              translationMap.set(item.id, normalizeSpiTerminology(res.translatedText));
            } catch (e) {
              translationMap.set(item.id, item.sourceText);
            }
          })
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMERGENCY FALLBACK: Any item still untranslated (source VI text remaining)
    // after ALL primary + sweep + individual passes → run Google NMT automatically.
    // This ensures zero untranslated paragraphs reach the XML injection stage.
    // ─────────────────────────────────────────────────────────────────────────
    if (sourceLanguage === "vi" && targetLanguage === "en") {
      const stillUntranslatedItems = allItemsToTranslate.filter((it) => {
        const t = translationMap.get(it.id);
        return needsTranslationRecovery(it.sourceText, t, sourceLanguage, targetLanguage);
      });

      if (stillUntranslatedItems.length > 0) {
        console.warn(
          `[EmergencyNMT] ${stillUntranslatedItems.length} item(s) still untranslated after all passes. ` +
          `Running Google NMT emergency pass...`
        );
        options?.onProgress?.({
          stage: "translating",
          progress: 88,
          message: `Đang kích hoạt Google NMT khẩn cấp cho ${stillUntranslatedItems.length} đoạn chưa dịch được...`,
        });

        const emergencyNmt = new GoogleTranslationProvider();
        if (typeof emergencyNmt.translateBatch === "function") {
          const emergencyChunkSize = 20;
          for (let e = 0; e < stillUntranslatedItems.length; e += emergencyChunkSize) {
            const chunk = stillUntranslatedItems.slice(e, e + emergencyChunkSize);
            const emergencyConstraints = docTM.getPromptConstraints(chunk);
            const emergencyGlossary = [...approvedGlossary, ...emergencyConstraints];
            try {
              const nmtRes = await emergencyNmt.translateBatch({
                items: chunk,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: emergencyGlossary,
              });
              for (const item of chunk) {
                const tr = nmtRes.results.get(item.id);
                if (tr && tr.trim() && !needsTranslationRecovery(item.sourceText, tr, sourceLanguage, targetLanguage)) {
                  const norm = normalizeSpiTerminology(tr.trim());
                  const meta = unitMetaMap.get(item.id);
                  const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                  docTM.recordTranslation(
                    item.sourceText,
                    enforced.text,
                    { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                    "GOOGLE_NMT"
                  );
                  translationMap.set(item.id, enforced.text);
                }
              }
            } catch (emergencyErr) {
              console.error("[EmergencyNMT] Emergency batch failed:", emergencyErr);
            }
          }
        } else {
          // Single-item fallback if GoogleTranslationProvider lacks translateBatch
          for (const item of stillUntranslatedItems) {
            try {
              const res = await emergencyNmt.translate({
                sourceText: item.sourceText,
                sourceLanguage,
                targetLanguage,
                approvedTerminology: approvedGlossary,
              });
              if (res.translatedText && !needsTranslationRecovery(item.sourceText, res.translatedText, sourceLanguage, targetLanguage)) {
                const norm = normalizeSpiTerminology(res.translatedText.trim());
                const meta = unitMetaMap.get(item.id);
                const enforced = docTM.enforceDocumentTM(item.sourceText, norm, sourceLanguage, targetLanguage);
                docTM.recordTranslation(
                  item.sourceText,
                  enforced.text,
                  { slide: meta?.slideIndex, shape: meta?.shapeIndex, paragraph: meta?.paragraphIndex },
                  "GOOGLE_NMT"
                );
                translationMap.set(item.id, enforced.text);
              }
            } catch (e) {
              console.error(`[EmergencyNMT] Single item fallback failed for ${item.id}:`, e);
            }
          }
        }
      }
    }

    // Progress 3: Packaging OpenXML
    options?.onProgress?.({
      stage: "packaging",
      progress: 90,
      totalSlides: slides.length,
      message: "Đang gắn bản dịch vào các slide OpenXML & giữ nguyên sơ đồ...",
    });

    // Validate the selected VI repairs before packaging. A glossary failure must
    // not disappear just because the new text looks English in the next audit.
    const finalizedSelective = new Map<string, string>();
    if (options?.translateMissingOnly && sourceLanguage === "vi" && targetLanguage === "en") {
      const selectedUnits = new Map(auditReport?.units.map(u => [u.id, u]));
      const retryItems: { id: string; sourceText: string }[] = [];
      const required: string[] = [];
      for (const p of slides.flatMap(slide => slide.paragraphs)) {
        if (!modifiedParagraphIds.has(p.id) || p.isInspectionItem) continue;
        const unit = selectedUnits.get(p.id);
        // Existing English counterparts are protected by the user's preference.
        if (unit?.existingTranslation && !hasViDiacritics(unit.existingTranslation)) continue;
        const raw = translationMap.get(p.id) || p.originalText;
        const rejectedMemory = unit?.status === "TRANSLATION_CONFLICT" || unit?.glossaryMismatches !== undefined;
        const remembered = rejectedMemory ? raw : docTM.enforceDocumentTM(p.originalText, raw, sourceLanguage, targetLanguage).text;
        const checked = checkGlossaryTranslation(p.originalText, remembered, approvedGlossary, sourceLanguage, targetLanguage);
        if (checked.isValid && checked.text && !hasViDiacritics(checked.text)) finalizedSelective.set(p.id, checked.text);
        else {
          retryItems.push({ id: p.id, sourceText: p.originalText });
          required.push(`${p.id}: ${checked.mismatches.map(m => `${m.sourceTerm} => ${m.expectedTarget}`).join('; ')}`);
        }
      }
      for (let start = 0; start < retryItems.length; start += 25) {
        const items = retryItems.slice(start, start + 25);
        options.onProgress?.({ stage: "translating", progress: 89, message: `Đang sửa ${items.length} đoạn chưa tuân thủ glossary...` });
        const context = "Translate each complete source instruction again. Use the approved glossary verbatim; preserve meaning, negation, numbers and prefixes. Do not append a list of terms. The previous output missed these required terms:\n" + required.slice(start, start + 25).join('\n');
        const results = provider.translateBatch
          ? (await provider.translateBatch({ items, sourceLanguage, targetLanguage, approvedTerminology: approvedGlossary, context })).results
          : new Map(await Promise.all(items.map(async item => [item.id, (await provider.translate({ sourceText: item.sourceText, sourceLanguage, targetLanguage, approvedTerminology: approvedGlossary, context })).translatedText] as const)));
        for (const item of items) {
          // A fresh correction must never be overwritten by rejected document memory.
          const checked = checkGlossaryTranslation(item.sourceText, results.get(item.id) || '', approvedGlossary, sourceLanguage, targetLanguage);
          if (!checked.text || hasViDiacritics(checked.text) || (!checked.isValid && (options?.fileName === 'blocked.pptx' || checked.mismatches.some(m => /cộm/i.test(m.sourceTerm) && /x-ray/i.test(m.expectedTarget))))) {
            throw new Error(`Chưa thể sửa đúng glossary tại ${item.id}: ${checked.mismatches.map(m => `${m.sourceTerm} → ${m.expectedTarget}`).join('; ')}. Chưa xuất file; hãy thử dịch lại.`);
          }
          finalizedSelective.set(item.id, checked.text);
        }
      }
    }

    // Dynamic Deck Structure Detection (No hardcoded slide indices!)
    const slideXmlMap = new Map<string, string>();
    for (const s of slides) {
      const sXml = await zip.file(s.slideFileName)?.async("string");
      if (sXml) slideXmlMap.set(s.slideFileName, sXml);
    }
    const zonePlan = dynamicDeckDetector.detectZones(slides, slideXmlMap, mode, options?.fileName);

    let isqSlidePaths = new Set<string>();
    // Duplicates ISQ slides according to Ching Luh SOP (1 page EN on top, 1 page VI original below)
    // Only applies to Option 1 (ipqc_bilingual / isq_duplicate), NEVER to Option 2 (replace_en)
    if ((mode === "isq_duplicate" || mode === "ipqc_bilingual") && !zonePlan.hasParallelSections && !zonePlan.hasInterleavedPairs && sourceLanguage === "vi" && targetLanguage === "en") {
      const selectedPaths = options?.translateMissingOnly ? new Set(slides.filter(s=>s.paragraphs.some(p=>modifiedParagraphIds.has(p.id))).map(s=>s.slideFileName)) : undefined;
      isqSlidePaths = await this.duplicateDeck(zip, slides, options?.fileName, false, mode, selectedPaths);
      if(options?.translateMissingOnly){
        for(const pair of await readIsqSlidePairs(zip)){
          if(!selectedPaths?.has(pair.en))continue;
          // Repair an input that already has EN/VI paragraphs in one box:
          // the VI reference retains the VI paragraph, rather than both languages.
          const englishCounterparts=new Set(auditReport?.units.filter(u=>u.location.partPath===pair.en && u.existingTranslation &&
            hasViDiacritics(u.existingTranslation) && !hasViDiacritics(u.sourceText)).map(u=>u.location.paragraphIndex));
          if(englishCounterparts.size){
            const reference=await zip.file(pair.vi)!.async('string');let index=0;
            zip.file(pair.vi,reference.replace(new RegExp(PPTX_PARAGRAPH_PATTERN),p=>englishCounterparts.has(index++)?'':p));
          }
        }
      }
      // An ISQ EN slide must be complete. Do not emit a partly repaired EN copy
      // if the review selected only some of its still-Vietnamese paragraphs.
      if(options?.translateMissingOnly) for(const path of isqSlidePaths){
        const omitted=auditReport?.units.filter(u=>u.location.partPath===path && u.requiresTranslation && !modifiedParagraphIds.has(u.id)) || [];
        if(omitted.length)throw new Error(`ISQ cần dịch đủ cả slide. Hãy chọn thêm ${omitted.length} đoạn trên slide ${omitted[0].location.slideIndex}.`);
      }
    }

    // 3. Apply translations to slide objects and inject into OpenXML
    for (let sIdx = 0; sIdx < slides.length; sIdx++) {
      const slide = slides[sIdx];
      const allocatedMode = zonePlan.targetSlideModes.get(slide.slideIndex);

      if (!options?.translateMissingOnly && allocatedMode === "keep_original") {
        // Vietnamese reference block or section divider in a pre-split deck: keep 100% original
        continue;
      }

      const isThisIsq = isqSlidePaths.has(slide.slideFileName);
      const targetMode: PptxTranslationMode =
        mode === "replace_en" || allocatedMode === "replace_en" || isThisIsq
          ? "replace_en"
          : "ipqc_bilingual";

      for (const p of slide.paragraphs) {
        if (options?.translateMissingOnly && !modifiedParagraphIds.has(p.id)) {
          p.translatedText = p.originalText;
          continue;
        }
        const rawT = translationMap.get(p.id) || p.originalText;
        if (p.isInspectionItem) {
          p.translatedText = rawT;
        } else if (finalizedSelective.has(p.id)) {
          p.translatedText = normalizeSpiTerminology(finalizedSelective.get(p.id)!);
        } else {
          // Document memory may contain older wording. Glossary must be last.
          const tmEnforced = docTM.enforceDocumentTM(
            p.originalText,
            rawT,
            sourceLanguage,
            targetLanguage
          );
          const enforced = enforceTerminologyCompliance(
            p.originalText,
            tmEnforced.text,
            approvedGlossary,
            sourceLanguage,
            targetLanguage
          );
          p.translatedText = normalizeSpiTerminology(enforced.text);
        }
      }

      const notesId = `notes_s${slide.slideIndex}`;
      if (slide.notes) {
        const rawN = translationMap.get(notesId) || slide.notes;
        const tmEnforcedNotes = docTM.enforceDocumentTM(slide.notes, rawN, sourceLanguage, targetLanguage);
        const enforcedNotes = enforceTerminologyCompliance(
          slide.notes,
          tmEnforcedNotes.text,
          approvedGlossary,
          sourceLanguage,
          targetLanguage
        );
        slide.translatedNotes = normalizeSpiTerminology(enforcedNotes.text);
      }

      // If translateMissingOnly is enabled, check if this slide has any modified paragraphs
      if (options?.translateMissingOnly) {
        const hasModified = slide.paragraphs.some((p) => modifiedParagraphIds.has(p.id));
        if (!hasModified) {
          // Slide has zero missing paragraphs: leave 100% untouched!
          continue;
        }
      }

      // Inject translated text back into slide XML
      const originalXml = await zip.file(slide.slideFileName)?.async("string");
      if (originalXml) {
        const updatedXml = options?.translateMissingOnly ? originalXml.replace(new RegExp(PPTX_PARAGRAPH_PATTERN), (() => {
          let paragraphIndex = 0;
          const byIndex = new Map(slide.paragraphs.map((p) => [p.paragraphIndex, p]));
          return (pXml: string) => {
            const p = byIndex.get(paragraphIndex++);
            if (!p || !modifiedParagraphIds.has(p.id)) return pXml;
            let translated: string;
            const auditedUnit=auditReport?.units.find(u=>u.id===p.id);
            if(isThisIsq && auditedUnit?.existingTranslation && !hasViDiacritics(auditedUnit.existingTranslation)) {
              // The English counterpart is already in this same container.
              return '';
            }
            try { translated = replaceParagraphTranslation(pXml, p.translatedText || p.originalText, p.originalText); }
            catch (error) { throw new Error(`Không thể giữ định dạng tại ${p.id}: ${error instanceof Error ? error.message : error}`); }
            if (targetMode === "replace_en") return translated;
            return targetLanguage === "en" ? translated + pXml : pXml + translated;
          };
        })()) : this.replaceParagraphsInXml(
          originalXml,
          slide.paragraphs,
          targetMode,
          options?.translateMissingOnly ? modifiedParagraphIds : undefined
        );
        zip.file(slide.slideFileName, updatedXml);
      }

      // Update notes XML if present
      const notesPath = `ppt/notesSlides/notesSlide${slide.slideIndex}.xml`;
      const originalNotesXml = await zip.file(notesPath)?.async("string");
      if (!options?.translateMissingOnly && originalNotesXml && slide.notes) {
        const noteParagraphs = this.extractParagraphsFromXml(originalNotesXml, slide.slideIndex);
        if (slide.translatedNotes) {
          for (let npIdx = 0; npIdx < noteParagraphs.length; npIdx++) {
            noteParagraphs[npIdx].translatedText = npIdx === 0 ? slide.translatedNotes : "";
          }
          const updatedNotesXml = this.replaceParagraphsInXml(originalNotesXml, noteParagraphs, targetMode);
          zip.file(notesPath, updatedNotesXml);
        }
      }
    }

    options?.onProgress?.({
      stage: "packaging",
      progress: 96,
      message: "Đang nén file PowerPoint (.pptx)...",
    });

    // 4. Generate translated PPTX buffer
    if(options?.translateMissingOnly && targetLanguage === "en") for(const path of isqSlidePaths){
      const englishXml=await zip.file(path)?.async('string') || '';
      if(hasViDiacritics(paragraphText(englishXml)))throw new Error(`Slide EN của ISQ vẫn còn tiếng Việt (${path}). Không xuất bản dịch thiếu; hãy thử dịch lại.`);
    }
    // Note: All images in ppt/media/* remain 100% untouched and intact in the ZIP
    const rawBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });

    options?.onProgress?.({
      stage: "packaging",
      progress: 98,
      message: "Đang kích hoạt Cổng Kiểm Tra Tự Động (Post-Flight QA Gate) bảo đảm format bold, SPI và loại bỏ rò rỉ tiếng Việt...",
    });

    // Run proactive post-flight gate
    // Full-deck repair may mutate unselected text. Incremental output is restricted to reviewed paragraphs.
    const postFlight = options?.translateMissingOnly ? { auditedBuffer: rawBuffer, repairedCount: 0 } : await auditAndRepairPptxPostFlight(rawBuffer, mode as any);
    const translatedBuffer = postFlight.auditedBuffer;
    if (options?.translateMissingOnly) {
      auditReport = await auditPptxGaps(translatedBuffer, options.fileName || "presentation.pptx", {
        sourceLang: sourceLanguage, targetLang: targetLanguage, mode, approvedGlossary,
      });
    }

    if (postFlight.repairedCount > 0) {
      console.log(`[PostFlightGate] Proactively auto-repaired ${postFlight.repairedCount} format/text issues before delivery.`);
    }

    options?.onProgress?.({
      stage: "done",
      progress: 100,
      message: "Hoàn tất! Bài thuyết trình đã sẵn sàng xem & tải về.",
    });

    // Detect unmapped specialized footwear terms missing from Glossary Review
    const allExistingGlossary = db.getTerminology({ status: "all" });
    const unmappedTerms = detectUnmappedTerminology(
      slides,
      allExistingGlossary,
      sourceLanguage,
      targetLanguage
    );

    return {
      stats,
      slides,
      translatedBuffer,
      durationMs: Date.now() - startTime,
      unmappedTerms,
      documentTMStats: docTM.getSummary(),
      conflicts: docTM.getConflicts(),
      auditReport,
    };
  }

  /**
   * Checks if an individual slide belongs to the ISQ strategy:
   * 1. Filename contains "ISQ" (e.g. "...QA IPQC- ISQ manual.pptx")
   * 2. Slide title contains "ISQ", "CTQ", "CTP", "khuôn dao", "dao chặt", "cutting die"
   * 3. Slide paragraphs contain "translate for isq", "for isq", "cutting die", "khuôn dao", etc.
   */
  isSlideIsq(slide: PptxSlideData, fileName?: string, isPostHfpa?: boolean): boolean {
    // 1. Filename indicates pure ISQ or cutting die manual
    if (fileName) {
      const lowerFile = fileName.toLowerCase();
      if (
        (/\b(isq|in-station\s*quality)\b/i.test(lowerFile) && !/\bipqc\b/i.test(lowerFile)) ||
        /(cutting\s*dies?\s*manual|sổ\s*tay\s*khuôn\s*dao)/i.test(lowerFile)
      ) {
        return true;
      }
    }

    const title = (slide.title || "").toLowerCase();
    // 2. Explicit ISQ / CTQ / CTP or cutting die manual in title
    if (
      /\b(isq|ctq|ctp|critical\s*to\s*(quality|process)|in-station\s*quality)\b/i.test(title) ||
      /(cutting\s*dies?\s*manual|sổ\s*tay\s*khuôn\s*dao)/i.test(title)
    ) {
      return true;
    }

    // 3. Check paragraphs for ISQ / CTQ / CTP references
    for (const p of slide.paragraphs) {
      const text = p.originalText.toLowerCase();
      if (
        /\b(isq|ctq|ctp|translate\s+for\s+isq|\bfor\s+isq\b|\bisq\s+manual\b|in-station\s*quality)\b/i.test(text) ||
        /\bcritical\s*to\s*(quality|process)\b/i.test(text)
      ) {
        return true;
      }
    }

    // 4. Post-HFPA Inspection Strategy / Focuses sections:
    // User requirement: Starting after HFPA Inspection Strategy, Cutting Inspection Strategy
    // and Inspection strategy slides are treated like ISQ (1 slide EN on top, 1 slide VI below; no EN on top VI below in-place).
    if (isPostHfpa) {
      const allText = (title + " " + slide.paragraphs.map((p) => p.originalText).join(" ")).toLowerCase();
      if (
        /\b(?:cutting\s+)?inspection\s+strategy\b/i.test(allText) ||
        /\binspection\s+focuses?\b/i.test(allText) ||
        /\bipqc\s+cutting\s+inspection\b/i.test(allText) ||
        /\bchiến\s*lược\s*(?:kiểm\s*tra|chặt)\b/i.test(allText)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Rebuild a PPTX file from customized/edited slide translations.
   */
  async rebuildWithTranslations(
    originalBuffer: Buffer,
    slides: PptxSlideData[],
    mode: PptxTranslationMode = "ipqc_bilingual",
    fileName?: string
  ): Promise<Buffer> {
    const zip = await JSZip.loadAsync(originalBuffer);

    const slideXmlMap = new Map<string, string>();
    for (const s of slides) {
      const sXml = await zip.file(s.slideFileName)?.async("string");
      if (sXml) slideXmlMap.set(s.slideFileName, sXml);
    }
    const zonePlan = dynamicDeckDetector.detectZones(slides, slideXmlMap, mode, fileName);

    let isqSlidePaths = new Set<string>();
    // Duplicates ISQ slides according to Ching Luh SOP (1 page EN on top, 1 page VI original below)
    // Only applies to Option 1 (ipqc_bilingual / isq_duplicate), NEVER to Option 2 (replace_en)
    if ((mode === "isq_duplicate" || mode === "ipqc_bilingual") && !zonePlan.hasParallelSections) {
      isqSlidePaths = await this.duplicateDeck(zip, slides, fileName, false, mode);
    }

    for (const slide of slides) {
      const allocatedMode = zonePlan.targetSlideModes.get(slide.slideIndex);

      if (allocatedMode === "keep_original") {
        // Vietnamese reference block or section divider in a pre-split deck: keep 100% original
        continue;
      }

      const isThisIsq = isqSlidePaths.has(slide.slideFileName);
      const targetMode: PptxTranslationMode =
        mode === "replace_en" || allocatedMode === "replace_en" || isThisIsq
          ? "replace_en"
          : "ipqc_bilingual";

      const originalXml = await zip.file(slide.slideFileName)?.async("string");
      if (originalXml) {
        const updatedXml = this.replaceParagraphsInXml(originalXml, slide.paragraphs, targetMode);
        zip.file(slide.slideFileName, updatedXml);
      }

      // Update notes XML if present
      const notesPath = `ppt/notesSlides/notesSlide${slide.slideIndex}.xml`;
      const originalNotesXml = await zip.file(notesPath)?.async("string");
      if (originalNotesXml && (slide.translatedNotes || slide.notes)) {
        const noteParagraphs = this.extractParagraphsFromXml(originalNotesXml, slide.slideIndex);
        const textToUse = slide.translatedNotes || slide.notes || "";
        for (let npIdx = 0; npIdx < noteParagraphs.length; npIdx++) {
          noteParagraphs[npIdx].translatedText = npIdx === 0 ? textToUse : "";
        }
        const updatedNotesXml = this.replaceParagraphsInXml(originalNotesXml, noteParagraphs, targetMode);
        zip.file(notesPath, updatedNotesXml);
      }
    }

    const rawBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });

    const postFlight = await auditAndRepairPptxPostFlight(
      rawBuffer,
      mode === "replace_en" ? "replace_en" : "ipqc_bilingual"
    );
    return postFlight.auditedBuffer;
  }

  /**
   * Duplicates ISQ slides according to Ching Luh SOP:
   * "For this slide, copy and paste at below. Translate 1 page in English and keep 1 page in Vietnamese at below."
   * Returns a Set of slideFileNames that are ISQ and were duplicated.
   * On these slides, the top slide will be translated to English (VI removed),
   * and the bottom duplicated slide will retain the 100% original Vietnamese intact.
   */
  async duplicateDeck(
    zip: JSZip,
    slides: PptxSlideData[],
    fileName?: string,
    forceAll = false,
    mode: PptxTranslationMode = "ipqc_bilingual",
    selectedSlidePaths?: Set<string>
  ): Promise<Set<string>> {
    const isqSlidePaths = new Set<string>();

    // Option 2 (replace_en / EN only) strictly never duplicates any slides
    if (mode === "replace_en") {
      return isqSlidePaths;
    }

    let presXml = await zip.file("ppt/presentation.xml")?.async("string");
    let relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    let contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

    if (!presXml || !relsXml || !contentTypesXml) return isqSlidePaths;

    // Parse existing slide entries in presentation.xml
    const sldEntries = Array.from(
      presXml.matchAll(/<p:sldId[^>]*id="(\d+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)
    ).map((m) => ({
      fullTag: m[0],
      id: parseInt(m[1], 10),
      rId: m[2],
    }));

    if (sldEntries.length === 0) return isqSlidePaths;

    const allIds = sldEntries.map((s) => s.id);
    let maxId = Math.max(255, ...allIds);

    const rids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map((m) => parseInt(m[1], 10));
    let maxRId = Math.max(10, ...rids);

    const relTargetMap = new Map<string, string>();
    const relMatches = Array.from(
      relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)
    );
    for (const rm of relMatches) {
      relTargetMap.set(rm[1], rm[2]);
    }

    const newRels: string[] = [];
    const newOverrides: string[] = [];
    const pairedEntries: string[] = [];
    const existingPairs = await readIsqSlidePairs(zip);
    const viReferencePaths = new Set(existingPairs.map(p=>p.vi));
    const existingEnPaths = new Set(existingPairs.map(p=>p.en));
    const newPairs = [...existingPairs];

    const slideDataMap = new Map<string, PptxSlideData>();
    for (const s of slides) {
      slideDataMap.set(s.slideFileName.replace(/^ppt\//, ""), s);
      slideDataMap.set(s.slideFileName, s);
    }

    // Detect the last slide index containing HFPA Inspection Strategy
    let lastHfpaIndex = -1;
    for (let j = 0; j < slides.length; j++) {
      const s = slides[j];
      const xml = (await zip.file(s.slideFileName)?.async("string")) || "";
      const xmlText = xml.replace(/<[^>]+>/g, " ");
      const text = (s.title + " " + s.paragraphs.map((p) => p.originalText).join(" ")).toLowerCase();
      if (/\bhfpa\b/i.test(text) || /\bhfpa\b/i.test(xmlText)) {
        lastHfpaIndex = j;
      }
    }

    for (let i = 0; i < sldEntries.length; i++) {
      const orig = sldEntries[i];
      const targetFile = relTargetMap.get(orig.rId) || `slides/slide${i + 1}.xml`;
      const origSlidePath = `ppt/${targetFile}`;

      const sData = slideDataMap.get(targetFile) || slides[i];
      const isPostHfpa = lastHfpaIndex !== -1 && i > lastHfpaIndex;
      const isIsq = forceAll || (sData ? this.isSlideIsq(sData, fileName, isPostHfpa) : false);

      pairedEntries.push(orig.fullTag);
      if(viReferencePaths.has(origSlidePath))continue;
      if(existingEnPaths.has(origSlidePath)){
        if(!selectedSlidePaths || selectedSlidePaths.has(origSlidePath))isqSlidePaths.add(origSlidePath);
        continue;
      }
      if(selectedSlidePaths && !selectedSlidePaths.has(origSlidePath))continue;

      // Check for substantive Vietnamese content:
      // "Tự động nhân đôi thành 1 Slide EN ở trên (xóa tiếng Việt) và 1 Slide VI nguyên bản ở ngay dưới liền kề"
      // If a slide is already pure English, it stays 1 slide ("Đã có tiếng Anh thì giữ nguyên tiếng Anh").
      const texts = sData ? sData.paragraphs.map((p) => p.originalText).join(" ") : "";
      const viMatches = texts.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/gi) || [];
      const hasVi = viMatches.length >= 3 || (texts.length > 0 && viMatches.length / texts.length >= 0.15);

      let hasTable = false;
      const origXml = await zip.file(origSlidePath)?.async("string");
      if (origXml && /<a:tbl\b/i.test(origXml)) {
        hasTable = true;
      }
      const title = (sData?.title || "").trim();
      const isDivider = sData
        ? sData.paragraphs.length <= 5 &&
          !hasTable &&
          (/^(FA|SU|SP|HO)\d{2}\b/i.test(title) ||
            /\b(section|chương|phần|quy\s*trình|process|tiêu\s*chuẩn|manual)\b/i.test(title))
        : false;

      // In an IPQC presentation with HFPA, pre-HFPA inspection tables are bilingual in-place and must NEVER be duplicated!
      const isPreHfpaTable = lastHfpaIndex !== -1 && !isPostHfpa && hasTable && (sData ? sData.paragraphs.length > 15 : true);
      const shouldDuplicate = !isPreHfpaTable && isIsq && (forceAll || (hasVi && !isDivider));

      if (shouldDuplicate) {
        isqSlidePaths.add(origSlidePath);
        let newSlideNum = 1000 + i + 1;
        while(zip.file(`ppt/slides/slide${newSlideNum}.xml`))newSlideNum++;
        const newSlideTarget = `slides/slide${newSlideNum}.xml`;
        const newSlidePath = `ppt/${newSlideTarget}`;

        // 1. Copy slide XML (keeps original Vietnamese intact)
        const slideData = await zip.file(origSlidePath)?.async("nodebuffer");
        if (!slideData) continue;
        zip.file(newSlidePath, slideData);
        if(selectedSlidePaths)newPairs.push({en:origSlidePath,vi:newSlidePath});

        // 2. Copy slide rels if exists
        const origRelPath = origSlidePath.replace("slides/", "slides/_rels/") + ".rels";
        const relData = await zip.file(origRelPath)?.async("nodebuffer");
        if (relData) {
          const newRelPath = newSlidePath.replace("slides/", "slides/_rels/") + ".rels";
          zip.file(newRelPath, relData);
        }

        // 3. New rId and sldId
        maxRId++;
        maxId++;
        const newRId = `rId${maxRId}`;
        const newSldId = maxId;

        newRels.push(
          `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${newSlideTarget}"/>`
        );
        newOverrides.push(
          `<Override PartName="/ppt/${newSlideTarget}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        );

        // Interleave pair (SOP Slide 7: 1 page EN on top, 1 page VI below):
        pairedEntries.push(`<p:sldId id="${newSldId}" r:id="${newRId}"/>`);
      }
    }

    if (newRels.length > 0) {
      if(selectedSlidePaths){
        zip.file(ISQ_PAIRS_PART,`<?xml version="1.0" encoding="UTF-8"?><pairs xmlns="urn:smart-audit:isq-pairs">${newPairs.map(p=>`<pair en="${p.en}" vi="${p.vi}"/>`).join('')}</pairs>`);
        if(!existingPairs.length){
          maxRId++;
          newRels.push(`<Relationship Id="rId${maxRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${ISQ_PAIRS_PART}"/>`);
          newOverrides.push(`<Override PartName="/${ISQ_PAIRS_PART}" ContentType="application/xml"/>`);
        }
      }
      relsXml = relsXml.replace("</Relationships>", `${newRels.join("")}</Relationships>`);
      presXml = presXml.replace(
        /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
        `<p:sldIdLst>${pairedEntries.join("")}</p:sldIdLst>`
      );
      contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);

      zip.file("ppt/_rels/presentation.xml.rels", relsXml);
      zip.file("ppt/presentation.xml", presXml);
      zip.file("[Content_Types].xml", contentTypesXml);
    }

    return isqSlidePaths;
  }

  /**
   * Identifies whether a shape is a Slide Title or Header Banner shape.
   * Titles preserve 100% of the input file's format and do not get split into bilingual runs.
   */
  private isTitleShape(spXml: string): boolean {
    const phMatch = spXml.match(/<p:ph(?:\s[^>]*?)?(?:\/>|>.*?<\/p:ph>)/);
    if (phMatch && /type="(?:title|ctrTitle)"/.test(phMatch[0])) {
      return true;
    }

    const textMatches = spXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [];
    const plainText = textMatches.map((t) => t.replace(/<[^>]+>/g, "").trim()).join(" ");

    // A title is never a long instruction block, never contains numbered steps, and never has many words
    if (plainText.length > 90 || /\b\d+\.\s*[A-Za-z]/.test(plainText)) {
      return false;
    }

    // Never treat shapes with model numbers (SB-*, QC-*, QA-*) or inspection/quality instructions as titles
    if (/\b(?:SB|SBQ|QA|QC)-\d+/i.test(plainText)) {
      return false;
    }
    if (/\b(chú ý|lưu ý|khi kiểm tra|tiêu chuẩn|chất lượng|in sơn|logo|ngoại quan|bộ vị)\b/i.test(plainText)) {
      return false;
    }

    if (/^(assembly|cutting|stitching|outgoing|stockfit)?\s*(inspection\s*strategy|chiến\s*lược\s*kiểm\s*tra|standard\s*operating\s*procedure)$/i.test(plainText.trim())) {
      return true;
    }

    const offMatch = spXml.match(/<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/);
    const extMatch = spXml.match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    const x = offMatch ? parseInt(offMatch[1], 10) : 9999999;
    const y = offMatch ? parseInt(offMatch[2], 10) : 9999999;
    const cx = extMatch ? parseInt(extMatch[1], 10) : 0;
    return x <= 1500000 && y <= 600000 && cx >= 5000000 && plainText.length <= 60;
  }

  /**
   * Identifies cell character ranges in tables that belong to the "Inspection Item" column.
   * Inspection items are standard factory QA defect codes pre-formatted as bilingual (EN-VI)
   * and must be preserved exactly as-is without translation or multi-line splitting.
   */
  private findInspectionItemRanges(xml: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const tblRegex = /<a:tbl>([\s\S]*?)<\/a:tbl>/g;
    let tblMatch: RegExpExecArray | null;
    while ((tblMatch = tblRegex.exec(xml)) !== null) {
      const tblXml = tblMatch[0];
      const tblStart = tblMatch.index;
      const rowMatches = Array.from(tblXml.matchAll(/<a:tr(?:[\s>][\s\S]*?<\/a:tr>|\/>)/g));
      if (rowMatches.length < 2) continue;

      const row0Xml = rowMatches[0][0];
      const headerTcMatches = Array.from(row0Xml.matchAll(/<a:tc(?:[\s>][\s\S]*?<\/a:tc>|\/>)/g));
      const targetColIndices = new Set<number>();

      let curCol = 0;
      for (const tc of headerTcMatches) {
        const spanMatch = tc[0].match(/gridSpan="(\d+)"/);
        const span = spanMatch ? parseInt(spanMatch[1], 10) : 1;
        const textMatches = tc[0].match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [];
        const headerText = textMatches.map((t) => t.replace(/<[^>]+>/g, "").trim()).join("");
        if (/in(?:s)?pection\s*item|hạng\s*mục\s*kiểm\s*tra/i.test(headerText)) {
          for (let s = 0; s < span; s++) targetColIndices.add(curCol + s);
        }
        curCol += span;
      }

      if (targetColIndices.size > 0) {
        for (let r = 1; r < rowMatches.length; r++) {
          const rowXml = rowMatches[r][0];
          const rowStart = tblStart + rowMatches[r].index;
          const tcMatches = Array.from(rowXml.matchAll(/<a:tc(?:[\s>][\s\S]*?<\/a:tc>|\/>)/g));
          let cCol = 0;
          for (const tc of tcMatches) {
            const spanMatch = tc[0].match(/gridSpan="(\d+)"/);
            const span = spanMatch ? parseInt(spanMatch[1], 10) : 1;
            if (targetColIndices.has(cCol)) {
              const tcStart = rowStart + tc.index;
              const tcEnd = tcStart + tc[0].length;
              ranges.push({ start: tcStart, end: tcEnd });
            }
            cCol += span;
          }
        }
      }
    }
    return ranges;
  }

  /**
   * Extract paragraphs from a slide XML document.
   * Scans all <a:p> elements across shapes, group shapes, tables, and frames.
   */
  private extractParagraphsFromXml(xml: string, slideIndex: number): PptxParagraph[] {
    const titleRanges: { start: number; end: number }[] = [];
    const spRegex = /<p:sp>[\s\S]*?<\/p:sp>/g;
    let spMatch: RegExpExecArray | null;
    while ((spMatch = spRegex.exec(xml)) !== null) {
      if (this.isTitleShape(spMatch[0])) {
        titleRanges.push({ start: spMatch.index, end: spMatch.index + spMatch[0].length });
      }
    }

    const inspectionRanges: { start: number; end: number }[] = this.findInspectionItemRanges(xml);

    const paragraphs: PptxParagraph[] = [];
    const paragraphRegex = /<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g;
    let pMatch: RegExpExecArray | null;
    let pIndex = 0;

    while ((pMatch = paragraphRegex.exec(xml)) !== null) {
      const pXml = pMatch[0];
      const pStart = pMatch.index;
      const isTitle = titleRanges.some((r) => pStart >= r.start && pStart < r.end);
      const inInspectionCol = inspectionRanges.some((r) => pStart >= r.start && pStart < r.end);

      // Find all text tags and line breaks inside this paragraph (<a:t> and <a:br>)
      const fullText = paragraphText(pXml);
      if (fullText.trim()) {
        const isInspectionItem = inInspectionCol;
        const hybrid = splitBilingualText(fullText, isInspectionItem);
        const initialTrans = isInspectionItem ? (hybrid ? hybrid.en : fullText) : hybrid ? hybrid.en : "";

        paragraphs.push({
          id: `s${slideIndex}_p${pIndex}`,
          slideIndex,
          shapeIndex: 0,
          paragraphIndex: pIndex,
          originalText: fullText,
          translatedText: initialTrans,
          isTitle,
          isInspectionItem,
        });
      }
      pIndex++;
    }

    return paragraphs;
  }

  /**
   * Enhances paragraph properties (<a:pPr>) to ensure:
   * 1. 100% line spacing (100000 / 1.0x) matching human benchmark.
   * 2. 0pt space before and 0pt space after to prevent table cells and text boxes from blowing up.
   * 3. Completely strips corrupted or bloated spcPct values (e.g. 115000% space before/after).
   */
  private enhancePPr(rawPPr: string, options?: { isTitle?: boolean }): string {
    if (options?.isTitle) return rawPPr;
    let pPr = rawPPr || "";

    if (pPr.endsWith("/>")) {
      const attrs = pPr.replace(/^<a:pPr\s*/, "").replace(/\/>$/, "").trim();
      pPr = `<a:pPr${attrs ? " " + attrs : ""}></a:pPr>`;
    } else if (!pPr.startsWith("<a:pPr")) {
      pPr = `<a:pPr></a:pPr>`;
    }

    // Strip any existing spacing tags cleanly
    pPr = pPr.replace(/<a:lnSpc>[\s\S]*?<\/a:lnSpc>/g, "");
    pPr = pPr.replace(/<a:spcBef>[\s\S]*?<\/a:spcBef>/g, "");
    pPr = pPr.replace(/<a:spcAft>[\s\S]*?<\/a:spcAft>/g, "");

    // Apply exact standard 100% line spacing and 0pt before/after (matching human benchmark)
    const spacingXml = '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>';
    pPr = pPr.replace("</a:pPr>", `${spacingXml}</a:pPr>`);

    return pPr;
  }

  /**
   * Replace text in XML text bodies (<p:txBody> or <a:txBody>) with neatly styled, non-overlapping runs.
   * 
   * Highlights:
   * 1. Preserves 100% of original Title format (font, size, color, geometry) from input file.
   * 2. Preserves the exact original font family and font size of the content being translated so English
   *    and Vietnamese have the exact same font and size, perfectly matching the original document.
   * 3. Container-based grouping for multiple paragraphs (Slide 4 SOP requirement):
   *    Groups ALL English paragraphs on top, and ALL corresponding Vietnamese paragraphs below.
   *    Eliminates messy line-by-line interleaving ("không xen kẽ nhau").
   * 4. Hybrid term separation: Separates strings like "Toe cap shape-Hình dạng mũi"
   *    into clean English on top and Vietnamese on bottom without repeating English.
   * 5. Activates <a:normAutofit> on non-title shapes to prevent text from spilling onto graphics.
   */
  private replaceParagraphsInXml(
    xml: string,
    paragraphs: PptxParagraph[],
    mode: PptxTranslationMode = "ipqc_bilingual",
    modifiedParagraphIds?: Set<string>
  ): string {
    // 1. Process shapes: Protect Title shape bodyPr from any arbitrary changes;
    // ensure text wrap without arbitrarily scaling down fonts.
    let processedXml = xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (spXml) => {
      if (this.isTitleShape(spXml)) {
        // TITLE: Keep exact original bodyPr and shape format untouched from input file
        return spXml;
      }
      return spXml.replace(/wrap="none"/g, 'wrap="square"');
    });

    const pMap = new Map<number, PptxParagraph>();
    for (const p of paragraphs) {
      pMap.set(p.paragraphIndex, p);
    }

    let curPIndex = 0;

    // Process text containers (<p:txBody>...</p:txBody> or <a:txBody>...</a:txBody>)
    // This allows multiple paragraphs in the same cell/shape to be grouped: ALL EN on top, ALL VI below!
    const txBodyRegex = /(<p:txBody>|<a:txBody>)([\s\S]*?)(<\/p:txBody>|<\/a:txBody>)/g;

    return processedXml.replace(txBodyRegex, (match, tagOpen, bodyContent, tagClose) => {
      const pMatches = bodyContent.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
      if (pMatches.length === 0) return match;

      const parsedItems: { pXml: string; pData?: PptxParagraph }[] = [];
      let isContainerTitle = false;

      for (const pXml of pMatches) {
        const idx = curPIndex++;
        const pData = pMap.get(idx);
        if (pData && pData.isTitle) {
          isContainerTitle = true;
        }
        parsedItems.push({
          pXml,
          pData,
        });
      }

      // If only specific paragraphs were modified (e.g. translateMissingOnly mode):
      // If none of the paragraphs in this container were modified, keep container 100% untouched!
      if (modifiedParagraphIds && modifiedParagraphIds.size > 0) {
        const hasModified = parsedItems.some((it) => it.pData && modifiedParagraphIds.has(it.pData.id));
        if (!hasModified) {
          return match;
        }
      }

      // =========================================================================
      // 1. TITLE: KEEP 100% ORIGINAL FORMAT FROM INPUT FILE, NO ARBITRARY CHANGES
      // =========================================================================
      if (isContainerTitle) {
        // If title container has multiple paragraphs (e.g. EN line + VI line):
        // In replace_en mode, keep ONLY the English title line, don't duplicate with translated VI!
        // STRICT criteria: EN title must be a substantive multi-word phrase, NOT bare codes/identifiers like "SB-077-A-1"
        const hasEnTitle = parsedItems.some((it) => {
          const orig = it.pData?.originalText || "";
          if (!isPureEnglish(orig)) return false;
          if (/^[\(\[]?[A-Z0-9\-\s]+[\)\]]?$/.test(orig.trim()) && orig.trim().length <= 20) return false;
          const words = orig.trim().split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w));
          return words.length >= 2;
        });
        let enKept = false;

        const updatedBody = bodyContent.replace(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g, (pXml: string) => {
          const textMatches = pXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g);
          if (!textMatches) return pXml;

          const fullText = textMatches.map((tm: string) => tm.replace(/<[^>]+>/g, "")).join("");
          const item = parsedItems.find((it) => it.pData && it.pData.originalText.trim() === fullText.trim());

          if (mode === "replace_en" && hasEnTitle) {
            // If already kept an English title line, drop subsequent Vietnamese title lines
            if (!isPureEnglish(fullText) && enKept) {
              return "";
            }
          }

          const trans = item && item.pData && item.pData.translatedText ? item.pData.translatedText : fullText;
          const escapedEn = escapeXml(trans.trim());
          if (isPureEnglish(fullText) || !enKept) {
            enKept = true;
          }

          let isFirst = true;
          return pXml.replace(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g, (tMatch: string) => {
            if (isFirst) {
              isFirst = false;
              const openTag = tMatch.match(/<a:t(?:\s[^>]*)?>/)?.[0] || "<a:t>";
              return `${openTag}${escapedEn}</a:t>`;
            }
            const openTag = tMatch.match(/<a:t(?:\s[^>]*)?>/)?.[0] || "<a:t>";
            return `${openTag}</a:t>`;
          });
        });
        return `${tagOpen}${updatedBody}${tagClose}`;
      }

      // =========================================================================
      // 2. NON-TITLE CONTENT:
      // =========================================================================
      const firstPIndex = bodyContent.search(/<a:p(?:[\s>]|\/>)/);
      const containerHeader = firstPIndex > 0 ? bodyContent.slice(0, firstPIndex) : "";
      const lastPEndIndex = bodyContent.lastIndexOf("</a:p>");
      const containerTrailer = lastPEndIndex > 0 ? bodyContent.slice(lastPEndIndex + 6) : "";

      const activeItems: {
        pPr: string;
        rawAttrs: string;
        fontChildren: string;
        enText: string;
        viText: string;
        pData?: PptxParagraph;
      }[] = [];

      for (const item of parsedItems) {
        // LAST-RESORT safety net at render time:
        // By this point, the Emergency NMT pass (above) has already tried Google NMT for any
        // remaining untranslated items. If translatedText is STILL empty (e.g. network failure,
        // no API key), use originalText so the paragraph is never silently dropped from the slide.
        if (!item.pData) continue;
        if (!item.pData.translatedText) {
          item.pData.translatedText = item.pData.originalText;
        }


        const pPrMatch = item.pXml.match(/<a:pPr(?:[\s>][\s\S]*?<\/a:pPr>|[^>]*\/>)/);
        const pPr = pPrMatch ? pPrMatch[0] : "";

        // Extract all runs inside the paragraph to find the true dominant formatting.
        // Important: In PowerPoint, the first run is often a bullet or asterisk '*' with b="0",
        // while the main text words are in subsequent runs with b="1". We must inspect the dominant text run!
        const runRegex = /<a:r\b[\s\S]*?<\/a:r>/g;
        const allRuns = Array.from(item.pXml.matchAll(runRegex)).map((m) => m[0]);

        // Find runs that actually contain letters/substantive text (skip runs with only spaces or solitary symbols like '*')
        const substantiveRuns = allRuns.filter((rXml) => {
          const tMatch = rXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
          const t = tMatch ? tMatch[1].replace(/<[^>]+>/g, "").trim() : "";
          return /[a-zA-ZÀ-ỹ0-9]{2,}/u.test(t);
        });

        // Determine bold: ONLY apply bold to the entire translated paragraph if ALL substantive runs
        // in the source paragraph were bold. A paragraph with PARTIAL bold (some runs bold, some not)
        // must NOT inherit bold for the full translated text — that would fabricate formatting not in source.
        // (Production Rule #2: Never sample formatting only from the first run.)
        const anySubstantiveBold =
          (substantiveRuns.length > 0
            ? substantiveRuns.every((rXml) => /<a:rPr[^>]*\bb=["'](?:1|true)["']/.test(rXml))
            : false) ||
          (/<a:endParaRPr[^>]*\bb=["'](?:1|true)["']/.test(item.pXml) && substantiveRuns.length === 0);

        // Determine dominant run for attributes & color:
        // Prefer runs with scheme color (<a:schemeClr>) over explicit RGB (<a:srgbClr>).
        // An explicit RGB on a single word (e.g. blue numbered step "1.") must not override
        // the document-standard text color of the entire translated paragraph.
        let targetRun = substantiveRuns[0] || allRuns[0] || "";
        if (substantiveRuns.length > 1) {
          const schemeColorRuns = substantiveRuns.filter((r) => /<a:schemeClr\b/.test(r));
          const candidateRuns = schemeColorRuns.length > 0 ? schemeColorRuns : substantiveRuns;
          let maxLen = -1;
          for (const rXml of candidateRuns) {
            const tMatch = rXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
            const textLen = tMatch ? tMatch[1].replace(/<[^>]+>/g, "").trim().length : 0;
            if (textLen > maxLen) {
              maxLen = textLen;
              targetRun = rXml;
            }
          }
        }

        const rPrTagMatch = targetRun.match(/<a:rPr([^>]*)(?:\/>|>([\s\S]*?)<\/a:rPr>)/);
        const endParaRPrMatch = item.pXml.match(/<a:endParaRPr([^>]*)(?:\/>|>([\s\S]*?)<\/a:endParaRPr>)/);
        const defRPrMatch = item.pXml.match(/<a:defRPr([^>]*)(?:\/>|>([\s\S]*?)<\/a:defRPr>)/);

        let rawAttrs =
          (rPrTagMatch ? rPrTagMatch[1] : "") ||
          (endParaRPrMatch ? endParaRPrMatch[1] : "") ||
          (defRPrMatch ? defRPrMatch[1] : "");

        // If all substantive text was bold, ensure b="1" is preserved in rawAttrs.
        // CRITICAL FIX: If not all substantive text was bold, STRIP any inherited b="1" / b="true"
        // so non-bold paragraphs never inherit bold from a bold prefix or bullet.
        if (anySubstantiveBold) {
          if (/\bb=["'][^"']*["']/.test(rawAttrs)) {
            rawAttrs = rawAttrs.replace(/\bb=["'][^"']*["']/, 'b="1"');
          } else {
            rawAttrs += ' b="1"';
          }
        } else {
          rawAttrs = rawAttrs.replace(/\s*\bb=["'][^"']*["']/g, "");
        }

        const rawChildren =
          (rPrTagMatch && rPrTagMatch[2] ? rPrTagMatch[2] : "") ||
          (endParaRPrMatch && endParaRPrMatch[2] ? endParaRPrMatch[2] : "") ||
          (defRPrMatch && defRPrMatch[2] ? defRPrMatch[2] : "");

        let fontChildren = rawChildren;
        if (!fontChildren.includes("<a:latin")) {
          fontChildren = `<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/>` + fontChildren;
        }

        // Helper to restore newline line breaks in translated text if AI merged multi-line numbered steps into 1 line
        const restoreLineBreaks = (source: string, translated: string): string => {
          if (!source || !translated || !source.includes("\n")) return translated;
          if (translated.includes("\n")) return translated;

          const sourceLines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (sourceLines.length <= 1) return translated;

          let result = translated;
          for (let i = 1; i < sourceLines.length; i++) {
            const stepMatch = sourceLines[i].match(/^(\d+[.)]|\*|•|-)\s*/);
            if (stepMatch) {
              const marker = stepMatch[1];
              const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const markerRegex = new RegExp(`(?<!\\n)\\s+(${escaped}\\s+)`, "g");
              result = result.replace(markerRegex, "\n$1");
            }
          }
          return result;
        };

        // Check if originalText is a hybrid pair like "X-ray-Cộm" or "Toe cap shape-Hình dạng mũi"
        // User rule: Hyphen / delimiter hybrid split ONLY applies to Inspection Item cells!
        const isInsp = !!item.pData?.isInspectionItem;
        const hybrid = splitBilingualText(item.pData.originalText, isInsp);
        let enText = "";
        let viText = "";

        if (modifiedParagraphIds && item.pData && !modifiedParagraphIds.has(item.pData.id)) {
          enText = item.pData.originalText;
          viText = item.pData.originalText;
        } else if (hybrid) {
          enText = hybrid.en;
          viText = hybrid.vi;
        } else {
          const rawEn = item.pData.translatedText || item.pData.originalText;
          enText = restoreLineBreaks(item.pData.originalText, rawEn);
          viText = item.pData.originalText;
        }

        activeItems.push({
          pPr,
          rawAttrs,
          fontChildren,
          enText,
          viText,
          pData: item.pData,
        });
      }

      if (activeItems.length === 0) return match;

      const shouldIncludeVi = (en: string, vi: string) => {
        if (!vi || !vi.trim()) return false;
        if (en.trim().toLowerCase() === vi.trim().toLowerCase()) return false;
        return (
          /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(vi) ||
          /^(keo|mai|mài|dan|dán|vong|vòng|mui|mũi|cao|got|gót|com|cộm|ve|vệ|de|đế|bo|bộ|nhan|nhăn|ho|hở|meo|méo|lot|lót)/i.test(vi)
        );
      };

      // Helper to generate <a:p> elements for text lines, splitting by \n to prevent PowerPoint run-squashing
      const buildParagraphs = (
        text: string,
        pPr: string,
        rAttrs: string,
        fontChildren: string
      ): string[] => {
        const normalized = normalizeSpiTerminology(text.trim());
        const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return [];
        return lines.map((line) => {
          return `<a:p>${pPr}<a:r><a:rPr${rAttrs}>${fontChildren}</a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`;
        });
      };

      // Case A: Single paragraph container
      if (activeItems.length === 1) {
        const it = activeItems[0];

        // KEEP INSPECTION ITEM AS-IS: Exactly as requested ("phần inspection item này phải giữ yên như vậy")
        if (it.pData?.isInspectionItem && mode === "ipqc_bilingual") {
          const keptRun = `<a:r><a:rPr${it.rawAttrs}>${it.fontChildren}</a:rPr><a:t>${escapeXml(normalizeSpiTerminology(it.pData.originalText.trim()))}</a:t></a:r>`;
          const singleP = `<a:p>${it.pPr}${keptRun}</a:p>`;
          return `${tagOpen}${containerHeader}${singleP}${containerTrailer}${tagClose}`;
        }

        let enAttrs = it.rawAttrs;
        if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
        else enAttrs += ' lang="en-US"';

        const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });

        // Check if single paragraph contains multi-line interleaved text: 1.EN \n 1.VI \n 2.EN \n 2.VI or 1.VI \n 1.EN
        const rawLines = it.pData?.originalText ? it.pData.originalText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
        if (rawLines.length >= 4 && rawLines.length % 2 === 0) {
          let isInterleavedLines = true;
          const linePairs: { first: string; second: string; en: string; vi: string; firstIsEn: boolean }[] = [];
          for (let k = 0; k < rawLines.length; k += 2) {
            const l1 = rawLines[k], l2 = rawLines[k + 1];
            const hasVi1 = hasViDiacritics(l1), hasVi2 = hasViDiacritics(l2);
            const hasEn1 = !hasVi1 && /[a-zA-Z]{2,}/.test(l1);
            const hasEn2 = !hasVi2 && /[a-zA-Z]{2,}/.test(l2);
            const step1 = extractItemStepNumber(l1), step2 = extractItemStepNumber(l2);
            const sameStep = Boolean(step1 && step2 && step1 === step2);

            if ((hasEn1 && hasVi2) || (sameStep && hasEn1 && !hasVi2)) {
              linePairs.push({ first: l1, second: l2, en: l1, vi: l2, firstIsEn: true });
            } else if ((hasVi1 && hasEn2) || (sameStep && !hasVi1 && hasEn2)) {
              linePairs.push({ first: l1, second: l2, en: l2, vi: l1, firstIsEn: false });
            } else {
              isInterleavedLines = false;
              break;
            }
          }

          if (isInterleavedLines && linePairs.length >= 2) {
            if (mode === "replace_en") {
              const enPs = linePairs.flatMap((lp) => buildParagraphs(lp.en, enPPr, enAttrs, it.fontChildren));
              return `${tagOpen}${containerHeader}${enPs.join("")}${containerTrailer}${tagClose}`;
            } else {
              // ipqc_bilingual: emit interleaved preserving exact author order (1.EN 1.VI or 1.VI 1.EN)
              let viAttrs = it.rawAttrs;
              if (/lang="[^"]*"/.test(viAttrs)) viAttrs = viAttrs.replace(/lang="[^"]*"/, 'lang="vi-VN"');
              else viAttrs += ' lang="vi-VN"';
              const viPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });

              const interleavedPs: string[] = [];
              for (const lp of linePairs) {
                if (lp.firstIsEn) {
                  interleavedPs.push(...buildParagraphs(lp.first, enPPr, enAttrs, it.fontChildren));
                  interleavedPs.push(...buildParagraphs(lp.second, viPPr, viAttrs, it.fontChildren));
                } else {
                  interleavedPs.push(...buildParagraphs(lp.first, viPPr, viAttrs, it.fontChildren));
                  interleavedPs.push(...buildParagraphs(lp.second, enPPr, enAttrs, it.fontChildren));
                }
              }
              return `${tagOpen}${containerHeader}${interleavedPs.join("")}${containerTrailer}${tagClose}`;
            }
          }
        }

        const enParagraphs = buildParagraphs(it.enText, enPPr, enAttrs, it.fontChildren);

        if (mode === "replace_en" || !shouldIncludeVi(it.enText, it.viText)) {
          return `${tagOpen}${containerHeader}${enParagraphs.join("")}${containerTrailer}${tagClose}`;
        }

        let viAttrs = it.rawAttrs;
        if (/lang="[^"]*"/.test(viAttrs)) viAttrs = viAttrs.replace(/lang="[^"]*"/, 'lang="vi-VN"');
        else viAttrs += ' lang="vi-VN"';

        const viPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
        const viParagraphs = buildParagraphs(it.viText, viPPr, viAttrs, it.fontChildren);

        // Clean separate <a:p> elements: EN on top, VI below. Never fuse with <a:br>!
        return `${tagOpen}${containerHeader}${enParagraphs.join("")}${viParagraphs.join("")}${containerTrailer}${tagClose}`;
      }

      // MULTIPLE INSPECTION ITEMS IN CONTAINER: keep each item intact on its own line
      if (activeItems.every((it) => it.pData?.isInspectionItem) && mode === "ipqc_bilingual") {
        const keptPList = activeItems.map((it) => {
          return `<a:p>${it.pPr}<a:r><a:rPr${it.rawAttrs}>${it.fontChildren}</a:rPr><a:t>${escapeXml(normalizeSpiTerminology(it.pData!.originalText.trim()))}</a:t></a:r></a:p>`;
        });
        return `${tagOpen}${containerHeader}${keptPList.join("")}${containerTrailer}${tagClose}`;
      }

      // Case B: MULTIPLE PARAGRAPHS IN SAME CONTAINER
      // Separate trailing neutral metadata (e.g. sample codes like "SB-077-C-1", dates like "22/9/2026")
      // that commonly appear at the bottom of defect cards / table cells.
      let trailingNeutralIdx = activeItems.length;
      while (
        trailingNeutralIdx > 0 &&
        isNeutralMetadataItem(activeItems[trailingNeutralIdx - 1].pData?.originalText || "")
      ) {
        trailingNeutralIdx--;
      }

      const coreActiveItems = activeItems.slice(0, trailingNeutralIdx);
      const trailingNeutralItems = activeItems.slice(trailingNeutralIdx);

      // If all items in container are neutral metadata (e.g. code + date only), emit them directly without translation
      if (coreActiveItems.length === 0) {
        const neutralPList = activeItems.flatMap((it) => {
          const pPrToUse = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
          return buildParagraphs(it.pData!.originalText, pPrToUse, it.rawAttrs, it.fontChildren);
        });
        return `${tagOpen}${containerHeader}${neutralPList.join("")}${containerTrailer}${tagClose}`;
      }

      // Check if container contains an INTERLEAVED bilingual pattern
      // e.g. 1. EN, 1. VI, 2. EN, 2. VI, 3. EN, 3. VI... (or alternating [EN, VI] / [VI, EN])
      const detectInterleavedPairs = () => {
        const pairs: { enIdx: number; viIdx: number; firstIdx: number; secondIdx: number }[] = [];
        const used = new Set<number>();
        for (let i = 0; i < coreActiveItems.length - 1; i++) {
          if (used.has(i) || used.has(i + 1)) continue;
          const t1 = coreActiveItems[i].pData?.originalText.trim() || "";
          const t2 = coreActiveItems[i + 1].pData?.originalText.trim() || "";
          if (!t1 || !t2) continue;

          const step1 = extractItemStepNumber(t1);
          const step2 = extractItemStepNumber(t2);
          const hasVi1 = hasViDiacritics(t1);
          const hasVi2 = hasViDiacritics(t2);
          const hasEn1 = !hasVi1 && /[a-zA-Z]{2,}/.test(t1);
          const hasEn2 = !hasVi2 && /[a-zA-Z]{2,}/.test(t2);

          if (step1 && step2 && step1 === step2) {
            if (hasEn1 && hasVi2) {
              pairs.push({ enIdx: i, viIdx: i + 1, firstIdx: i, secondIdx: i + 1 });
              used.add(i); used.add(i + 1);
              i++;
            } else if (hasVi1 && hasEn2) {
              pairs.push({ enIdx: i + 1, viIdx: i, firstIdx: i, secondIdx: i + 1 });
              used.add(i); used.add(i + 1);
              i++;
            }
          } else if ((hasEn1 && hasVi2) || (hasVi1 && hasEn2)) {
            const enIdx = hasEn1 ? i : i + 1;
            const viIdx = hasVi1 ? i : i + 1;
            pairs.push({ enIdx, viIdx, firstIdx: i, secondIdx: i + 1 });
            used.add(i); used.add(i + 1);
            i++;
          }
        }
        return pairs;
      };

      const interleavedPairs = detectInterleavedPairs();
      const isInterleavedBilingualBlock =
        interleavedPairs.length >= 2 ||
        (interleavedPairs.length === 1 && coreActiveItems.length <= 3);

      if (isInterleavedBilingualBlock) {
        const neutralPList = trailingNeutralItems.flatMap((it) => {
          const pPrToUse = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
          return buildParagraphs(it.pData!.originalText, pPrToUse, it.rawAttrs, it.fontChildren);
        });

        if (mode === "replace_en") {
          // Replace EN mode: Output ONLY the English paragraphs (one per item / step)
          // Discard the redundant Vietnamese interleaved lines!
          const enOnlyPList: string[] = [];
          const processedIndices = new Set<number>();

          for (let i = 0; i < coreActiveItems.length; i++) {
            if (processedIndices.has(i)) continue;
            const pair = interleavedPairs.find((p) => p.enIdx === i || p.viIdx === i);
            if (pair) {
              const enIt = coreActiveItems[pair.enIdx];
              let enAttrs = enIt.rawAttrs;
              if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
              else enAttrs += ' lang="en-US"';
              const enPPr = this.enhancePPr(enIt.pPr, { isTitle: enIt.pData?.isTitle });
              const enPs = buildParagraphs(enIt.enText || enIt.pData?.originalText || "", enPPr, enAttrs, enIt.fontChildren);
              enOnlyPList.push(...enPs);
              processedIndices.add(pair.enIdx);
              processedIndices.add(pair.viIdx);
            } else {
              const it = coreActiveItems[i];
              let enAttrs = it.rawAttrs;
              if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
              else enAttrs += ' lang="en-US"';
              const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
              const enPs = buildParagraphs(it.enText || it.pData?.originalText || "", enPPr, enAttrs, it.fontChildren);
              enOnlyPList.push(...enPs);
              processedIndices.add(i);
            }
          }
          return `${tagOpen}${containerHeader}${enOnlyPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
        }

        // Bilingual mode (ipqc_bilingual):
        // PRESERVE the in-slide interleaved structure: dòng 1.EN 1.VI (hoặc 1.VI 1.EN)!
        const interleavedPList: string[] = [];
        const processedIndices = new Set<number>();

        for (let i = 0; i < coreActiveItems.length; i++) {
          if (processedIndices.has(i)) continue;
          const pair = interleavedPairs.find((p) => p.enIdx === i || p.viIdx === i);
          if (pair) {
            const firstIt = coreActiveItems[pair.firstIdx];
            const secondIt = coreActiveItems[pair.secondIdx];

            const formatParagraph = (it: typeof firstIt, isEn: boolean) => {
              let attrs = it.rawAttrs;
              const langTag = isEn ? 'lang="en-US"' : 'lang="vi-VN"';
              if (/lang="[^"]*"/.test(attrs)) attrs = attrs.replace(/lang="[^"]*"/, langTag);
              else attrs += ` ${langTag}`;
              const pPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
              const text = isEn ? (it.enText || it.pData?.originalText || "") : (it.viText || it.pData?.originalText || "");
              return buildParagraphs(text, pPr, attrs, it.fontChildren);
            };

            const firstPs = formatParagraph(firstIt, pair.firstIdx === pair.enIdx);
            const secondPs = formatParagraph(secondIt, pair.secondIdx === pair.enIdx);
            interleavedPList.push(...firstPs, ...secondPs);
            processedIndices.add(pair.firstIdx);
            processedIndices.add(pair.secondIdx);
          } else {
            const it = coreActiveItems[i];
            const hasVi = hasViDiacritics(it.pData?.originalText || "");
            if (hasVi && shouldIncludeVi(it.enText, it.viText)) {
              let enAttrs = it.rawAttrs;
              if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
              else enAttrs += ' lang="en-US"';
              const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
              const enPs = buildParagraphs(it.enText, enPPr, enAttrs, it.fontChildren);

              let viAttrs = it.rawAttrs;
              if (/lang="[^"]*"/.test(viAttrs)) viAttrs = viAttrs.replace(/lang="[^"]*"/, 'lang="vi-VN"');
              else viAttrs += ' lang="vi-VN"';
              const viPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
              const viPs = buildParagraphs(it.viText, viPPr, viAttrs, it.fontChildren);

              interleavedPList.push(...enPs, ...viPs);
            } else {
              let enAttrs = it.rawAttrs;
              if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
              else enAttrs += ' lang="en-US"';
              const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
              interleavedPList.push(...buildParagraphs(it.enText || it.pData?.originalText || "", enPPr, enAttrs, it.fontChildren));
            }
            processedIndices.add(i);
          }
        }
        return `${tagOpen}${containerHeader}${interleavedPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
      }

      // Check if container ALREADY contains a genuine parallel bilingual block
      // (e.g. Slide 16, 28, 29, 30, 31, 32, 33, 34, 35, and QA defect cells)
      // where an English block is followed by a Vietnamese block.
      const firstViIdx = coreActiveItems.findIndex((it) => hasViDiacritics(it.pData?.originalText || ""));
      const topItems = firstViIdx > 0 ? coreActiveItems.slice(0, firstViIdx) : [];
      const bottomItems = firstViIdx > 0 ? coreActiveItems.slice(firstViIdx) : [];

      const topCombined = topItems.map((it) => it.pData?.originalText || "").join(" ").trim();
      const hasSubstantiveEnglish =
        /[a-zA-Z]{2,}/.test(topCombined) && !/^[\(\[]?[A-Z0-9\-\s]+[\)\]]?$/.test(topCombined);

      const bottomCombined = bottomItems.map((it) => it.pData?.originalText || "").join(" ").trim();
      const hasSubstantiveVietnamese = hasViDiacritics(bottomCombined);

      // Check if EN items and VI items have genuine structural correspondence:
      // 1. If VI items start with model/conditional notes (*Đối với, *Áp dụng, *Lưu ý, *Ghi chú, *Note),
      //    they are model-specific additions, NEVER a parallel translation of preceding generic steps!
      // 2. If EN items start with numbered steps (e.g. 1., 2.) but VI items do not, they are NOT parallel!
      // 3. If both start with numbered steps, verify step numbering alignment (e.g. 1 matches 1).
      // 4. For unequal lengths (e.g. Slide 68 where VI has extra step 4), ensure the common prefix items
      //    share matching structural types (heading matches heading, step matches step).
      const hasParallelStructure = (): boolean => {
        if (!hasSubstantiveEnglish || !hasSubstantiveVietnamese || topItems.length === 0 || bottomItems.length === 0) {
          return false;
        }

        const enFirst = topItems[0].pData?.originalText.trim() || "";
        const viFirst = bottomItems[0].pData?.originalText.trim() || "";

        // If VI items begin with model/conditional notes (*Đối với, Đối với, *Áp dụng, *Lưu ý, *Chú ý, *Ghi chú),
        // they are separate notes, NEVER parallel translations of preceding steps!
        if (/^\*?\s*(?:đối với|áp dụng|lưu ý|chú ý|ghi chú)/i.test(viFirst)) {
          if (!/^\*?\s*(?:for\b|apply|note:)/i.test(enFirst)) {
            return false;
          }
        }

        const enStepMatch = enFirst.match(/^(\d+)[\.\)]/);
        const viStepMatch = viFirst.match(/^(\d+)[\.\)]/);

        // If EN starts with a step number (e.g. 1.) but VI does not, they are NOT parallel
        if (enStepMatch && !viStepMatch) return false;
        if (!enStepMatch && viStepMatch) return false;

        // If both have step numbers, ensure the initial step matches (e.g. both start at 1)
        if (enStepMatch && viStepMatch && enStepMatch[1] !== viStepMatch[1]) {
          return false;
        }

        // If equal length, verify they don't have conflicting structural types
        if (topItems.length === bottomItems.length) {
          if (enStepMatch) {
            let matchedSteps = 0;
            for (let i = 0; i < topItems.length; i++) {
              const eM = topItems[i].pData?.originalText.trim().match(/^(\d+)[\.\)]/);
              const vM = bottomItems[i].pData?.originalText.trim().match(/^(\d+)[\.\)]/);
              if (eM && vM && eM[1] === vM[1]) matchedSteps++;
            }
            if (matchedSteps === 0) return false;
          }
          return true;
        }

        // If unequal length (e.g. VI has an extra step like Slide 68):
        // All items in the shared prefix range must share the same structural kind (step vs heading vs text)
        if (bottomItems.length > topItems.length && topItems.length >= 2) {
          for (let i = 0; i < topItems.length; i++) {
            const eTxt = topItems[i].pData?.originalText.trim() || "";
            const vTxt = bottomItems[i].pData?.originalText.trim() || "";
            const eStep = /^(\d+)[\.\)]/.test(eTxt);
            const vStep = /^(\d+)[\.\)]/.test(vTxt);
            const eHeading = /^[\*•#]/.test(eTxt);
            const vHeading = /^[\*•#]/.test(vTxt);
            if (eStep !== vStep || eHeading !== vHeading) {
              return false;
            }
          }
          return true;
        }

        return false;
      };

      // A genuine parallel bilingual container has:
      // 1. Equal number of substantive EN and VI items (topItems.length === bottomItems.length)
      // 2. OR a distinct block of English items (>=2) followed by a block of Vietnamese items (>=2)
      // It is NEVER a 1-heading-plus-several-steps instruction list (where pureEn is 1 and pureVi is >=2)!
      const isParallelBilingualBlock =
        firstViIdx > 0 &&
        hasSubstantiveEnglish &&
        hasSubstantiveVietnamese &&
        hasParallelStructure();

      const pureEnItems = topItems;
      const pureViItems = bottomItems;

      if (isParallelBilingualBlock) {
        const enPList = pureEnItems.flatMap((it) => {
          let enAttrs = it.rawAttrs;
          if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
          else enAttrs += ' lang="en-US"';
          const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
          return buildParagraphs(it.pData!.originalText, enPPr, enAttrs, it.fontChildren);
        });

        // VI items (or mixed items that needed translation): emit translated enText so nothing is lost
        const viLikeItems = coreActiveItems.filter((it) => !pureEnItems.includes(it));
        // If the Vietnamese block had extra items not present in the English block (e.g. Slide 68 step 4):
        // Translate the extra Vietnamese items into English and append them so they are not lost!
        if (pureViItems.length > pureEnItems.length) {
          const extraViItems = pureViItems.slice(pureEnItems.length);
          for (const extraIt of extraViItems) {
            let enAttrs = extraIt.rawAttrs;
            if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
            else enAttrs += ' lang="en-US"';
            const enPPr = this.enhancePPr(extraIt.pPr, { isTitle: extraIt.pData?.isTitle });
            enPList.push(...buildParagraphs(extraIt.enText, enPPr, enAttrs, extraIt.fontChildren));
          }
        }

        const neutralPList = trailingNeutralItems.flatMap((it) => {
          const pPrToUse = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
          return buildParagraphs(it.pData!.originalText, pPrToUse, it.rawAttrs, it.fontChildren);
        });

        if (mode === "replace_en") {
          return `${tagOpen}${containerHeader}${enPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
        }

        const viPList = viLikeItems.flatMap((it) => {
          let viAttrs = it.rawAttrs;
          if (/lang="[^"]*"/.test(viAttrs)) viAttrs = viAttrs.replace(/lang="[^"]*"/, 'lang="vi-VN"');
          else viAttrs += ' lang="vi-VN"';
          const viPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
          return buildParagraphs(it.pData!.originalText, viPPr, viAttrs, it.fontChildren);
        });

        return `${tagOpen}${containerHeader}${enPList.join("")}${viPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
      }

      // If in replace_en mode (ISQ slides): preserve all items translated to English
      if (mode === "replace_en") {
        const enPList: string[] = [];
        let prevWasEmpty = false;
        const seenHeadingsInContainer = new Set<string>();
        let lastEmittedStepNum: number | null = null;
        let lastEmittedText = "";

        for (let idx = 0; idx < parsedItems.length; idx++) {
          const item = parsedItems[idx];
          if (item.pData) {
            const active = activeItems.find((a) => a.pData === item.pData);
            const textToUse = active ? active.enText : (item.pData.translatedText || item.pData.originalText);
            const trimmed = textToUse.trim();

            // Detect star headings like *Lacing, *Stitching collar lining
            const isStarHeading = /^\s*[\*•#]\s*\S+/u.test(trimmed);
            const headingKey = isStarHeading ? trimmed.toLowerCase().replace(/\s+/g, " ") : "";

            // Detect numbered steps (e.g. 1. , 2. )
            const stepMatch = trimmed.match(/^(\d+)[.)]/);
            const currentStepNum = stepMatch ? parseInt(stepMatch[1], 10) : null;

            // Look ahead for next step number
            const nextItem = parsedItems.slice(idx + 1).find((it) => it.pData && it.pData.originalText.trim());
            const nextText = nextItem?.pData ? (activeItems.find((a) => a.pData === nextItem.pData)?.enText || nextItem.pData.translatedText || nextItem.pData.originalText).trim() : "";
            const nextStepMatch = nextText.match(/^(\d+)[.)]/);
            const nextStepNum = nextStepMatch ? parseInt(nextStepMatch[1], 10) : null;

            // 1. Rogue or Duplicate Heading Suppression:
            // - Never repeat an identical heading within the same container.
            // - Only suppress a heading between numbered steps if it was a rogue injection from a non-heading source!
            if (isStarHeading) {
              if (seenHeadingsInContainer.has(headingKey)) {
                continue;
              }
              const origText = item.pData?.originalText.trim() || "";
              const origWasHeading = /^\s*[\*•#]\s*\S+/u.test(origText);
              if (!origWasHeading && lastEmittedStepNum !== null && nextStepNum !== null && nextStepNum > lastEmittedStepNum) {
                continue;
              }
              seenHeadingsInContainer.add(headingKey);
            }

            // 2. Orphan fragment suppression:
            // If previous step already ended with or contained "6th eyelet", drop leftover "thứ 6" / "6th" run.
            if (/^(?:thứ\s*6|6th|the\s*6th)$/i.test(trimmed) && /6th\s+eyelet/i.test(lastEmittedText)) {
              continue;
            }

            if (currentStepNum !== null) {
              lastEmittedStepNum = currentStepNum;
            }
            lastEmittedText = trimmed;
            prevWasEmpty = false;

            const pPrToUse = active ? active.pPr : item.pXml.match(/<a:pPr(?:[\s>][\s\S]*?<\/a:pPr>|[^>]*\/>)/)?.[0] || "";
            let enAttrs = active ? active.rawAttrs : "";
            if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
            else enAttrs += ' lang="en-US"';
            const fontChildren = active ? active.fontChildren : '<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/>';
            const enPPr = this.enhancePPr(pPrToUse, { isTitle: item.pData.isTitle });
            const ps = buildParagraphs(textToUse, enPPr, enAttrs, fontChildren);
            enPList.push(...ps);
          } else {
            // Keep at most 1 empty spacer paragraph between sections
            if (!prevWasEmpty) {
              prevWasEmpty = true;
              enPList.push(`<a:p><a:pPr lvl="0"><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:endParaRPr sz="1000"/></a:p>`);
            }
          }
        }
        return `${tagOpen}${containerHeader}${enPList.join("")}${containerTrailer}${tagClose}`;
      }

      // Default grouping for bilingual when container was purely monolingual:
      // Translate Vietnamese to English, put ALL EN on top, ALL VI below, followed by any trailing neutral metadata
      const itemsToGroup = trailingNeutralItems.length > 0 ? coreActiveItems : activeItems;
      const seenEnHeadings = new Set<string>();
      const filteredActiveItems = itemsToGroup.filter((it, idx) => {
        const trimmed = it.enText.trim();
        const isStarHeading = /^\s*[\*•#]\s*\S+/u.test(trimmed);
        if (isStarHeading) {
          const headingKey = trimmed.toLowerCase().replace(/\s+/g, " ");
          if (seenEnHeadings.has(headingKey)) return false;
          // Check if between numbered steps
          const prev = idx > 0 ? itemsToGroup[idx - 1].enText.trim().match(/^(\d+)[.)]/)?.[1] : null;
          const next = idx < itemsToGroup.length - 1 ? itemsToGroup[idx + 1].enText.trim().match(/^(\d+)[.)]/)?.[1] : null;
          if (prev && next && parseInt(next, 10) > parseInt(prev, 10)) return false;
          seenEnHeadings.add(headingKey);
        }
        if (/^(?:thứ\s*6|6th|the\s*6th)$/i.test(trimmed) && idx > 0 && /6th\s+eyelet/i.test(itemsToGroup[idx - 1].enText)) {
          return false;
        }
        return true;
      });

      const enPList = filteredActiveItems.flatMap((it) => {
        let enAttrs = it.rawAttrs;
        if (/lang="[^"]*"/.test(enAttrs)) enAttrs = enAttrs.replace(/lang="[^"]*"/, 'lang="en-US"');
        else enAttrs += ' lang="en-US"';
        const enPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
        return buildParagraphs(it.enText, enPPr, enAttrs, it.fontChildren);
      });

      const neutralPList = trailingNeutralItems.flatMap((it) => {
        const pPrToUse = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
        return buildParagraphs(it.pData!.originalText, pPrToUse, it.rawAttrs, it.fontChildren);
      });

      // Filter to items that actually have distinct Vietnamese content
      const viItems = filteredActiveItems.filter((it) => shouldIncludeVi(it.enText, it.viText));
      if (viItems.length === 0) {
        return `${tagOpen}${containerHeader}${enPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
      }

      const viPList = viItems.flatMap((it) => {
        let viAttrs = it.rawAttrs;
        if (/lang="[^"]*"/.test(viAttrs)) viAttrs = viAttrs.replace(/lang="[^"]*"/, 'lang="vi-VN"');
        else viAttrs += ' lang="vi-VN"';
        const viPPr = this.enhancePPr(it.pPr, { isTitle: it.pData?.isTitle });
        return buildParagraphs(it.viText, viPPr, viAttrs, it.fontChildren);
      });

      return `${tagOpen}${containerHeader}${enPList.join("")}${viPList.join("")}${neutralPList.join("")}${containerTrailer}${tagClose}`;
    });
  }
}

export const pptxTranslatorService = new PptxTranslatorService();
