import crypto from "crypto";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { TerminologyEntry } from "../database/types";
import { db } from "../database/db";
import {
  canonicalizeText,
  exactCanonicalKey,
  DocumentTranslationMemory,
  documentTM,
} from "./document-tm";
import { normalizeSpiTerminology, cleanTargetTerm } from "./casing";
import { scanPptxTranslationIntelligence } from "./pptx-smart-audit";

export type TextUnitStatus =
  | "ALREADY_TRANSLATED"
  | "NEEDS_TRANSLATION"
  | "TM_REUSE"
  | "LOCKED_TERMINOLOGY"
  | "NON_TRANSLATABLE"
  | "MIXED_LANGUAGE"
  | "POSSIBLE_TRANSLATION"
  | "SUSPICIOUS_TRANSLATION"
  | "TRANSLATION_CONFLICT"
  | "REVIEW_REQUIRED";

export interface TextUnitLocation {
  partPath?: string;
  containerId?: string;
  slideIndex?: number;
  shapeIndex?: number;
  paragraphIndex?: number;
  runIndex?: number;
  sheetName?: string;
  cellAddress?: string;
  rowNumber?: number;
  colNumber?: number;
  isTable?: boolean;
  isTitle?: boolean;
  isInspectionItem?: boolean;
  isIsq?: boolean;
}

export interface ScannedTextUnit {
  id: string;
  sourceText: string;
  sourceHash: string;
  canonicalText: string;
  status: TextUnitStatus;
  location: TextUnitLocation;
  existingTranslation?: string;
  suggestedTranslation?: string;
  category?: "header" | "ctq" | "table_cell" | "acronym" | "code" | "body" | "notes";
  reason: string;
  selectedForTranslation: boolean;
  requiresTranslation?: boolean;
  confidence: number;
  safeToApply?: boolean;
  canApply?: boolean;
  matches?: import("./audit-intelligence").AuditMatch[];
  suspiciousSegments?: string[];
  glossaryCorrections?: { sourceTerm: string; expectedTarget: string }[];
  glossaryMismatches?: { sourceTerm: string; expectedTarget: string }[];
}

export interface TranslationAuditGroup {
  id: string;
  type: "translation" | "consistency" | "language_quality";
  title: string;
  unitIds: string[];
  suggestedTranslation?: string;
  variants?: { text: string; count: number; approved: boolean; slides: number[] }[];
  confidence: number;
  reason: string;
  safeToApply: boolean;
}

export interface SlidePairSummary {
  enSlide: number;
  viSlide: number;
  enPath: string;
  viPath: string;
  enTitle?: string;
  viTitle?: string;
  status: "auto" | "manual";
  itemCount?: number;
}

export interface SmartAuditReport {
  fileName: string;
  fileType: "pptx" | "xlsx";
  totalUnits: number;
  totalSlides: number;
  totalSheets?: number;
  alreadyTranslatedCount: number;
  needsTranslationCount: number;
  untranslatedCount?: number;
  translatableMissingCount?: number;
  tmReusableCount: number;
  lockedTerminologyCount: number;
  nonTranslatableCount: number;
  mixedLanguageCount: number;
  possibleTranslationCount: number;
  reviewRequiredCount: number;
  affectedSlides: number[];
  affectedSheets?: string[];
  estimatedGeminiRequests: number;
  units: ScannedTextUnit[];
  groups?: TranslationAuditGroup[];
  slidePairs?: SlidePairSummary[];
  attentionCount?: number;
  safeFixCount?: number;
  suspiciousTranslationCount?: number;
  translationConflictCount?: number;
}

/**
 * Checks for Vietnamese diacritics
 */
export function hasViDiacritics(str: string): boolean {
  if (!str) return false;
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(str);
}

/**
 * Checks whether text contains pure English characters and no Vietnamese diacritics
 */
export function isPureEnglish(str: string): boolean {
  if (!str || !str.trim()) return false;
  if (hasViDiacritics(str)) return false;
  // If string contains known Vietnamese footwear keywords without diacritics, it is NOT pure English
  if (
    /\b(may|dan|mai|keo|got|de|mui|lot|nhan|chay|rap|phom|khuon|bien|chi|lon|dap|cuon|xo|cot|day|ban|lo|dinh|quet|vien|bao|trung|eo|may\s+mudguard|may\s+lot\s+vong\s+co|may\s+vong\s+co|lap|ghep|ep|go|luoi|than|dem|lot\s+giay)\b/i.test(
      str
    )
  ) {
    return false;
  }
  return /[a-zA-Z]{2,}/.test(str);
}

/**
 * Known technical footwear acronyms and abbreviations that must never be treated as untranslated English.
 */
const TECHNICAL_ACRONYMS = new Set([
  "IPQC",
  "ISQ",
  "SPI",
  "CTQ",
  "QC",
  "QA",
  "QAM",
  "CAPA",
  "PFC",
  "SOP",
  "QMS",
  "ASTM",
  "PPM",
  "ERP",
  "MES",
  "OEE",
  "FMEA",
  "SPC",
  "TPU",
  "EVA",
  "PU",
  "RB",
  "LED",
  "UV",
  "N/A",
  "NA",
  "OK",
  "NG",
  "PASS",
  "FAIL",
  "ID",
  "NO",
  "NO.",
  "REV",
  "REV.",
  "STD",
  "MM",
  "CM",
  "KG",
  "PSI",
  "BAR",
  "SEC",
  "MIN",
  "HR",
  "DEG",
  "P/O",
  "PO",
  "BOM",
  "CFM",
  "DEV",
  "PROD",
  "PLC", "USB", "WI-FI", "HTTP", "HTTPS", "TCP", "IP", "AC", "DC",
]);

/**
 * Known brand names, shoe models, or standard series that are non-translatable
 */
const BRAND_AND_MODELS = new Set([
  "NIKE",
  "JORDAN",
  "AIR",
  "MAX",
  "ZOOM",
  "DUNK",
  "FORCE",
  "PEGASUS",
  "VAPORMAX",
  "METCON",
  "REACT",
  "BLAZER",
  "INVINCIBLE",
  "CHING LUH",
  "CHINGLUH",
]);

/**
 * Robust non-translatable detection.
 * Identifies:
 * - ISO standards (e.g., ISO 9001, ISO 14001)
 * - Footwear technical acronyms (e.g., IPQC, ISQ, SPI, CTQ, QC, QA, CAPA)
 * - Brand names (e.g., Nike, Air Jordan)
 * - Model numbers & product codes (e.g., Model XYZ-100, ABC-123, SB-077-A-1, (SBQ-083-6))
 * - Pure numbers, percentages, dates, measurements (e.g., 2026, 98.5%, 12/05/2024, 1.5mm, 10-12)
 * - Solitary punctuation, bullets, symbols (*, #, -, •)
 */
export function isNonTranslatable(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(?:AC|DC)\s*\d+(?:[.,]\d+)?\s*V$/i.test(trimmed)) return true;
  if (/^[A-Z]{2,6}\s+[A-Z]{1,6}\d+[A-Z0-9-]*$/.test(trimmed)) return true;
  if (/^https?:\/\/\S+$|^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(trimmed)) return true;

  // 1. Solitary bullets or symbols
  if (/^[\*•\-\#\:\/\,\.\(\)\[\]\{\}\_]+$/.test(trimmed)) return true;

  // 2. Pure numbers, decimals, percentages, ranges, or numeric codes (e.g. "2026", "98.5%", "10-12", "1.5mm")
  if (/^\d+(?:[.,]\d+)?(?:\s*(?:%|mm|cm|m|kg|g|spi|bar|psi|°c|°f|s|sec|min|h|hrs?))?$/i.test(trimmed)) {
    return true;
  }
  if (/^\d+(?:[.,]\d+)?\s*[-–—~]\s*\d+(?:[.,]\d+)?(?:\s*(?:%|mm|cm|m|kg|g|spi|bar|psi|°c|°f|s|sec|min|h|hrs?))?$/i.test(trimmed)) {
    return true;
  }

  // 3. Dates (e.g., "12/05/2024", "2026-10-02", "22/9/2026")
  if (/^\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}$/.test(trimmed)) return true;

  // 4. ISO standards (e.g., "ISO 9001", "ISO 14001", "ISO/IEC 17025")
  if (/^ISO(?:\s*|\/IEC\s*)\d+(?:[-:]\d+)?$/i.test(trimmed)) return true;

  // 5. Standard Model / Product code patterns (e.g., "Model XYZ-100", "ABC-123", "SB-077-A-1", "(SBQ-083-6)")
  if (/\d/.test(trimmed) && /^(?:model\s+)?[A-Z0-9]{1,6}(?:[-_][A-Z0-9]+)+(?:\s*\([A-Z0-9\-]+\))?$/i.test(trimmed)) {
    return true;
  }
  if (/^\(?[A-Z]{2,4}[-_]\d{2,4}(?:[-_][A-Z0-9]+)*\)?$/i.test(trimmed)) {
    return true;
  }

  // Purchase order, production batch, and style code patterns (e.g. "P/O 2026-X1", "PO #123", "LOT-45A")
  if (/^(?:P\/O|PO|BOM|LOT|STYLE|COLOR|SIZE|ITEM)(?:\s*[\#:]?\s*|\s+)[A-Z0-9\-_\/]+$/i.test(trimmed)) {
    return true;
  }

  // 6. Single acronym / technical token (e.g., "IPQC", "ISQ", "SPI", "QC", "Nike")
  const cleanWord = trimmed.replace(/^[#\(\[\{\.\:]+|[\)\]\}\.\:\,]+$/g, "").trim().toUpperCase();
  if (TECHNICAL_ACRONYMS.has(cleanWord)) return true;
  if (BRAND_AND_MODELS.has(cleanWord)) return true;

  // 7. Multi-word Brand / Model combinations (e.g., "Nike Air Jordan", "Model XYZ-100")
  if (/^(?:Model\s+[A-Z0-9\-]+|Nike(?:\s+[A-Za-z0-9\-]+)*)$/i.test(trimmed)) {
    const tokens = trimmed.split(/\s+/).map((t) => t.toUpperCase());
    if (tokens.every((t) => BRAND_AND_MODELS.has(t) || /^[A-Z0-9\-]+$/.test(t))) {
      return true;
    }
  }

  // 8. SPI Stitch density canonical pattern (e.g., "SPI 9-10 stitches/inch")
  if (/^SPI\s+\d+(?:-\d+)?\s+stitches\/inch$/i.test(trimmed)) return true;

  return false;
}

/**
 * Detects whether a string is bilingual containing both English and Vietnamese components
 * (e.g. "Final Inspection\nKiểm tra cuối cùng", or "Toe shape - Hình dạng mũi", or "X-ray-Cộm")
 */
export function isBilingualText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();

  // Multi-line bilingual check: at least one line pure English and at least one line with Vietnamese diacritics
  if (trimmed.includes("\n")) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const hasEn = lines.some((l) => isPureEnglish(l));
      const hasVi = lines.some((l) => hasViDiacritics(l));
      if (hasEn && hasVi) return true;
    }
  }

  // Single-line hyphen / slash / bracket delimited bilingual check
  if (/[-–—\/\(\)]/.test(trimmed)) {
    // Delimit by hyphen, slash, or parentheses
    const parts = trimmed.split(/[-–—\/]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const hasEn = parts.some((p) => isPureEnglish(p) && !isNonTranslatable(p));
      const hasVi = parts.some((p) => hasViDiacritics(p));
      if (hasEn && hasVi) return true;
    }
  }

  return false;
}

/**
 * Generates an MD5 source hash of canonical text for stable tracking across slides
 */
export function computeSourceHash(text: string): string {
  const canon = canonicalizeText(text);
  return crypto.createHash("md5").update(canon).digest("hex").slice(0, 16);
}

/**
 * Core text-unit classifier.
 * Categorizes each text unit into one of 8 statuses with high confidence and safety guardrails.
 */
export function classifyTextUnit(
  sourceText: string,
  location: TextUnitLocation,
  options: {
    sourceLang?: string;
    targetLang?: string;
    docTM?: DocumentTranslationMemory;
    approvedGlossary?: TerminologyEntry[];
    existingTranslation?: string;
    containerBilingual?: boolean;
    containerHasVietnamese?: boolean;
    containerHasEnglish?: boolean;
    isInspectionItem?: boolean;
  }
): {
  status: TextUnitStatus;
  reason: string;
  suggestedTranslation?: string;
  confidence: number;
} {
  const text = sourceText.trim();
  const sourceLang = options.sourceLang || "vi";
  const targetLang = options.targetLang || "en";

  // 1. Non-translatable Check (Numbers, Acronyms, Model Codes, ISO)
  if (isNonTranslatable(text)) {
    return {
      status: "NON_TRANSLATABLE",
      reason: "Technical acronym, standard, model code, ID, date, or numeric value",
      suggestedTranslation: text,
      confidence: 1.0,
    };
  }

  // 2. Inspection Item Column Handling (Production Rule #3 & SOP standard)
  if (options.isInspectionItem) {
    if (isBilingualText(text)) {
      return {
        status: "ALREADY_TRANSLATED",
        reason: "Inspection item already contains bilingual EN-VI specification",
        suggestedTranslation: text,
        confidence: 0.98,
      };
    }
  }

  // 3. Container-level Bilingual Check (e.g. English title with Vietnamese below in same shape/cell)
  if (options.containerBilingual) {
    return {
      status: "ALREADY_TRANSLATED",
      reason: "Text container already has bilingual pair (English & Vietnamese)",
      suggestedTranslation: options.existingTranslation || text,
      confidence: 0.95,
    };
  }

  // 4. In-text Bilingual Check
  if (isBilingualText(text)) {
    return {
      status: "MIXED_LANGUAGE",
      reason: "Text unit contains mixed English and Vietnamese content",
      confidence: 0.92,
    };
  }

  // 5. Explicit Existing Target Translation check
  if (options.existingTranslation && options.existingTranslation.trim()) {
    const ext = options.existingTranslation.trim();
    if (ext.toLowerCase() !== text.toLowerCase()) {
      return {
        status: "ALREADY_TRANSLATED",
        reason: "Slide or cell already provides a distinct translated version",
        suggestedTranslation: ext,
        confidence: 0.95,
      };
    }
  }

  // 6. Locked Terminology / Company Glossary Check (Priority 1)
  const canonKey = canonicalizeText(text);
  const exactKey = exactCanonicalKey(text);

  if (options.approvedGlossary && options.approvedGlossary.length > 0) {
    for (const entry of options.approvedGlossary) {
      if (!entry.sourceTerm || !entry.targetTerm) continue;
      const srcClean = entry.sourceTerm.trim();
      const tgtClean = cleanTargetTerm(entry.targetTerm).trim();
      if (!srcClean || !tgtClean) continue;

      if (exactCanonicalKey(srcClean) === exactKey || canonicalizeText(srcClean) === canonKey) {
        return {
          status: "LOCKED_TERMINOLOGY",
          reason: `Exact match in approved company glossary (${entry.category || "General"})`,
          suggestedTranslation: tgtClean,
          confidence: 1.0,
        };
      }
    }
  }

  // 7. Translation Memory (TM) Check (Priority 2)
  if (options.docTM) {
    const tmPlan = options.docTM.planTranslations([
      {
        id: "probe",
        sourceText: text,
        slideIndex: location.slideIndex,
        shapeIndex: location.shapeIndex,
        paragraphIndex: location.paragraphIndex,
        sheetName: location.sheetName,
        cellAddress: location.cellAddress,
      },
    ]);

    if (tmPlan.preResolved.has("probe")) {
      const match = tmPlan.preResolved.get("probe")!;
      return {
        status: "TM_REUSE",
        reason: "Exact or canonical match in Document Translation Memory",
        suggestedTranslation: match,
        confidence: 0.95,
      };
    }
  }

  // 8. Language Target Analysis
  // Scenario A: Document translation is Vietnamese -> English (SOP standard)
  if (sourceLang === "vi" && targetLang === "en") {
    // If text already has Vietnamese diacritics, it definitely needs translation!
    if (hasViDiacritics(text)) {
      return {
        status: "NEEDS_TRANSLATION",
        reason: "Vietnamese text requiring translation to English",
        confidence: 0.95,
      };
    }

    // If pure English and not non-translatable:
    if (isPureEnglish(text)) {
      // If the surrounding container already has both English and Vietnamese,
      // this English line is already the translated English counterpart!
      if (options.containerHasVietnamese) {
        return {
          status: "ALREADY_TRANSLATED",
          reason: "English line paired with Vietnamese in the same container",
          suggestedTranslation: text,
          confidence: 0.95,
        };
      }

      // In an already translated 80-slide deck, English text on translated slides (e.g. 1-62)
      // represents already translated output!
      // But new English content in newly added slides (e.g. 63-68) or new boxes might be
      // English-source needing translation into Vietnamese (or vice-versa).
      // If pure English without any paired translation and not acronym:
      return {
        status: "ALREADY_TRANSLATED",
        reason: "Already translated English text",
        suggestedTranslation: text,
        confidence: 0.9,
      };
    }
  }

  // Scenario B: Document translation is English -> Vietnamese (New English content arriving from HQ)
  if (sourceLang === "en" && targetLang === "vi") {
    // If text has Vietnamese diacritics, it is ALREADY translated into Vietnamese!
    if (hasViDiacritics(text)) {
      return {
        status: "ALREADY_TRANSLATED",
        reason: "Already in Vietnamese target language",
        suggestedTranslation: text,
        confidence: 0.95,
      };
    }

    // Pure English text without translation:
    if (isPureEnglish(text)) {
      // If container already has Vietnamese counterpart:
      if (options.containerHasVietnamese) {
        return {
          status: "ALREADY_TRANSLATED",
          reason: "English source text already paired with Vietnamese translation",
          suggestedTranslation: text,
          confidence: 0.95,
        };
      }

      // Genuinely new English content requiring translation:
      return {
        status: "NEEDS_TRANSLATION",
        reason: "New English content requiring translation to Vietnamese",
        confidence: 0.95,
      };
    }
  }

  // 9. Ambiguous or Mixed State -> REVIEW_REQUIRED (Conservative safety guardrail)
  return {
    status: "REVIEW_REQUIRED",
    reason: "Ambiguous language state or mixed format requiring user verification",
    confidence: 0.6,
  };
}

/**
 * Intelligent PPTX Gap Scanner.
 * Scans all slides in the presentation, inspects shapes, text containers, and tables,
 * builds Document TM, and classifies every text unit.
 */
export async function auditPptxGaps(
  buffer: Buffer,
  fileName: string,
  options?: {
    sourceLang?: string;
    targetLang?: string;
    mode?: string;
    customDocTM?: DocumentTranslationMemory;
    approvedGlossary?: TerminologyEntry[];
  }
): Promise<SmartAuditReport> {
  return scanPptxTranslationIntelligence(buffer, fileName, options);
}

/**
 * Intelligent XLSX Gap Scanner.
 * Scans all sheets in the workbook, inspects formulas and text cells,
 * builds Document TM, and classifies every cell unit.
 */
export async function auditXlsxGaps(
  buffer: Buffer,
  fileName: string,
  options?: {
    sourceLang?: string;
    targetLang?: string;
    mode?: string;
    customDocTM?: DocumentTranslationMemory;
    approvedGlossary?: TerminologyEntry[];
  }
): Promise<SmartAuditReport> {
  const sourceLang = options?.sourceLang || "en";
  const targetLang = options?.targetLang || "vi";

  const workbook = new ExcelJS.Workbook();
  // @ts-ignore
  await workbook.xlsx.load(buffer);

  const rawApprovedGlossary =
    options?.approvedGlossary || db.getApprovedTerminology(sourceLang, targetLang);
  const approvedGlossary = rawApprovedGlossary.filter((e) => e.sourceTerm && e.targetTerm);

  const docTM = options?.customDocTM || new DocumentTranslationMemory();

  interface ExtractedCellUnit {
    id: string;
    sourceText: string;
    location: TextUnitLocation;
    hasAdjacentTranslation?: boolean;
    adjacentTargetText?: string;
  }

  const rawUnits: ExtractedCellUnit[] = [];
  const affectedSheetsSet = new Set<string>();

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // Skip formulas
        if (
          cell.type === ExcelJS.ValueType.Formula ||
          (cell.value && typeof cell.value === "object" && "formula" in (cell.value as any))
        ) {
          return;
        }

        let strVal = "";
        if (typeof cell.value === "string") {
          strVal = cell.value;
        } else if (cell.value && typeof cell.value === "object" && "richText" in (cell.value as any)) {
          const rich = (cell.value as any).richText;
          if (Array.isArray(rich)) {
            strVal = rich.map((r: any) => r.text || "").join("");
          }
        } else if (cell.value && typeof cell.value === "object" && "text" in (cell.value as any)) {
          strVal = String((cell.value as any).text || "");
        }

        const text = strVal.trim();
        if (!text) return;

        // Check if next column has a translation
        const nextCell = row.getCell(colNumber + 1);
        let nextText = "";
        if (typeof nextCell.value === "string") nextText = nextCell.value.trim();
        const hasAdjacent =
          Boolean(nextText) &&
          ((isPureEnglish(text) && hasViDiacritics(nextText)) ||
            (hasViDiacritics(text) && isPureEnglish(nextText)));

        rawUnits.push({
          id: `cell_${worksheet.name}_r${rowNumber}_c${colNumber}`,
          sourceText: text,
          location: {
            sheetName: worksheet.name,
            cellAddress: cell.address,
            rowNumber,
            colNumber,
          },
          hasAdjacentTranslation: hasAdjacent,
          adjacentTargetText: hasAdjacent ? nextText : undefined,
        });
      });
    });
  });

  // Pre-seed Document TM with existing translated pairs found within the spreadsheet
  const establishedPairs: { source: string; target: string }[] = [];
  for (const r of rawUnits) {
    if (r.hasAdjacentTranslation && r.adjacentTargetText) {
      establishedPairs.push({
        source: r.sourceText,
        target: r.adjacentTargetText,
      });
    }
  }

  docTM.initializeDocumentTM(
    rawUnits.map((r) => ({
      id: r.id,
      sourceText: r.sourceText,
      sheetName: r.location.sheetName,
      cellAddress: r.location.cellAddress,
      rowNumber: r.location.rowNumber,
      colNumber: r.location.colNumber,
    })),
    approvedGlossary,
    establishedPairs.map((p) => ({
      source: p.source,
      target: p.target,
      origin: "DOCUMENT",
    }))
  );

  const scannedUnits: ScannedTextUnit[] = [];

  let alreadyTranslatedCount = 0;
  let needsTranslationCount = 0;
  let tmReusableCount = 0;
  let lockedTerminologyCount = 0;
  let nonTranslatableCount = 0;
  let mixedLanguageCount = 0;
  let possibleTranslationCount = 0;
  let reviewRequiredCount = 0;

  for (const r of rawUnits) {
    const classification = classifyTextUnit(r.sourceText, r.location, {
      sourceLang,
      targetLang,
      docTM,
      approvedGlossary,
      existingTranslation: r.adjacentTargetText,
    });

    const isSelected = classification.status === "NEEDS_TRANSLATION";

    switch (classification.status) {
      case "ALREADY_TRANSLATED":
        alreadyTranslatedCount++;
        break;
      case "NEEDS_TRANSLATION":
        needsTranslationCount++;
        if (r.location.sheetName) affectedSheetsSet.add(r.location.sheetName);
        break;
      case "TM_REUSE":
        tmReusableCount++;
        break;
      case "LOCKED_TERMINOLOGY":
        lockedTerminologyCount++;
        break;
      case "NON_TRANSLATABLE":
        nonTranslatableCount++;
        break;
      case "MIXED_LANGUAGE":
        mixedLanguageCount++;
        break;
      case "POSSIBLE_TRANSLATION":
        possibleTranslationCount++;
        break;
      case "REVIEW_REQUIRED":
        reviewRequiredCount++;
        break;
    }

    scannedUnits.push({
      id: r.id,
      sourceText: r.sourceText,
      sourceHash: computeSourceHash(r.sourceText),
      canonicalText: canonicalizeText(r.sourceText),
      status: classification.status,
      location: r.location,
      suggestedTranslation: classification.suggestedTranslation,
      reason: classification.reason,
      selectedForTranslation: isSelected,
      confidence: classification.confidence,
    });
  }

  const affectedSheets = Array.from(affectedSheetsSet);
  const estimatedGeminiRequests =
    needsTranslationCount > 0 ? Math.max(1, Math.ceil(needsTranslationCount / 25)) : 0;

  return {
    fileName,
    fileType: "xlsx",
    totalUnits: scannedUnits.length,
    totalSlides: 0,
    totalSheets: workbook.worksheets.length,
    alreadyTranslatedCount,
    needsTranslationCount,
    tmReusableCount,
    lockedTerminologyCount,
    nonTranslatableCount,
    mixedLanguageCount,
    possibleTranslationCount,
    reviewRequiredCount,
    affectedSlides: [],
    affectedSheets,
    estimatedGeminiRequests,
    units: scannedUnits,
  };
}
