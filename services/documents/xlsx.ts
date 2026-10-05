import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { DocumentProcessor, ExtractedDocument, ExtractedTermCandidate, DocumentTable } from "./types";
import { getTranslationProvider, TranslationProvider } from "../translation";
import { db } from "../database/db";
import { translationCache } from "../translation/cache";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { normalizeSpiTerminology } from "../translation/casing";

export class XlsxProcessor implements DocumentProcessor {
  async process(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const tables: DocumentTable[] = [];
    const termCandidates: ExtractedTermCandidate[] = [];
    const fullTextParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert sheet to array of rows
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      if (rows.length === 0) continue;

      fullTextParts.push(`--- Sheet: ${sheetName} ---`);

      // Try to identify header row
      const headers = rows[0].map((h) => String(h || "").trim());
      const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim().length > 0));

      tables.push({
        headers,
        rows: dataRows,
      });

      // Detect terminology pair columns
      let sourceColIdx = -1;
      let targetColIdx = -1;
      let defColIdx = -1;
      let contextColIdx = -1;

      headers.forEach((h, idx) => {
        const lower = h.toLowerCase().trim();
        const isStt = lower === "stt" || lower === "no" || lower === "no." || lower === "#" || lower === "index" || lower === "id";
        if (isStt) return; // Skip row number column

        if (
          lower === "en" ||
          lower === "eng" ||
          lower.includes("english") ||
          lower === "source" ||
          lower === "term" ||
          lower.includes("tiếng anh") ||
          lower.includes("tieng anh")
        ) {
          if (sourceColIdx === -1) sourceColIdx = idx;
        } else if (
          lower === "vn" ||
          lower === "vi" ||
          lower.includes("vietnamese") ||
          lower.includes("tiếng việt") ||
          lower.includes("tieng viet") ||
          lower === "target" ||
          lower.includes("translation")
        ) {
          if (targetColIdx === -1) targetColIdx = idx;
        } else if (lower.includes("definition") || lower.includes("định nghĩa") || lower.includes("meaning")) {
          defColIdx = idx;
        } else if (lower.includes("context") || lower.includes("ngữ cảnh") || lower.includes("category")) {
          contextColIdx = idx;
        }
      });

      // Auto-detect from data rows if headers didn't match
      if (sourceColIdx === -1 || targetColIdx === -1) {
        // Inspect sample data rows to detect language by accent marks vs ASCII
        let bestEnCol = -1;
        let bestVnCol = -1;
        const viRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

        for (let col = 0; col < headers.length; col++) {
          const colHeader = headers[col].toLowerCase().trim();
          if (colHeader === "stt" || colHeader === "no" || colHeader === "no." || colHeader === "#") continue;

          let viCount = 0;
          let enCount = 0;
          let numericCount = 0;

          const sampleRows = dataRows.slice(0, 20);
          for (const row of sampleRows) {
            const val = String(row[col] || "").trim();
            if (!val) continue;
            if (/^\d+$/.test(val)) {
              numericCount++;
            } else if (viRegex.test(val)) {
              viCount++;
            } else if (/[a-zA-Z]{2,}/.test(val)) {
              enCount++;
            }
          }

          if (numericCount > 10) continue; // Skip numeric index column
          if (viCount > 3 && bestVnCol === -1) bestVnCol = col;
          if (enCount > 3 && viCount === 0 && bestEnCol === -1) bestEnCol = col;
        }

        if (sourceColIdx === -1 && bestEnCol !== -1) sourceColIdx = bestEnCol;
        if (targetColIdx === -1 && bestVnCol !== -1) targetColIdx = bestVnCol;
      }

      // Fallback: If 2 columns and neither found, assume col 0 is source and col 1 is target
      if (sourceColIdx === -1 && targetColIdx === -1 && headers.length >= 2) {
        sourceColIdx = 0;
        targetColIdx = 1;
      }

      for (const row of dataRows) {
        const rowText = row.filter((c) => c.trim().length > 0).join(" | ");
        if (rowText) fullTextParts.push(rowText);

        let src = sourceColIdx !== -1 ? row[sourceColIdx]?.trim() : "";
        let tgt = targetColIdx !== -1 ? row[targetColIdx]?.trim() : "";

        // If target is empty, but source cell contains multiple lines (e.g., 'Ngấn\nDemolding mark')
        if (src && !tgt && src.includes("\n")) {
          const lines = src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 2);
          if (lines.length >= 2) {
            const viRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
            if (viRegex.test(lines[0]) && !viRegex.test(lines[1])) {
              tgt = lines[0]; // Vietnamese
              src = lines[1]; // English
            } else if (!viRegex.test(lines[0]) && viRegex.test(lines[1])) {
              src = lines[0]; // English
              tgt = lines[1]; // Vietnamese
            } else {
              src = lines[1];
              tgt = lines[0];
            }
          }
        }

        // Also check if any cell in the row has newline-separated Vietnamese and English
        if (!src || !tgt) {
          for (const cell of row) {
            const text = cell?.trim();
            if (text && text.includes("\n")) {
              const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 2);
              if (lines.length >= 2) {
                const viRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
                if (viRegex.test(lines[0]) && !viRegex.test(lines[1])) {
                  tgt = lines[0];
                  src = lines[1];
                  break;
                } else if (!viRegex.test(lines[0]) && viRegex.test(lines[1])) {
                  src = lines[0];
                  tgt = lines[1];
                  break;
                }
              }
            }
          }
        }

        if (src && tgt) {
          // Skip empty or pure numeric entries (e.g. row IDs "1", "2", "3")
          if (src === tgt) continue;
          if (/^\d+$/.test(src) || /^\d+$/.test(tgt)) continue;
          if (src.length < 2 || tgt.length < 2) continue;

          // Clean leading numbered bullet markers like "1. ", "2) " while preserving terms like "3D shaping"
          src = src.replace(/^(\(\d+\)|\d+[\.\)\-–—])\s*/, "").trim();
          tgt = tgt.replace(/^(\(\d+\)|\d+[\.\)\-–—])\s*/, "").trim();
          if (!src || !tgt) continue;

          const viRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
          let sourceLang = "en";
          let targetLang = "vi";

          // Intelligently detect actual language based on Vietnamese diacritics
          if (viRegex.test(src) && !viRegex.test(tgt)) {
            // src is Vietnamese, tgt is English
            sourceLang = "vi";
            targetLang = "en";
          } else if (!viRegex.test(src) && viRegex.test(tgt)) {
            // src is English, tgt is Vietnamese
            sourceLang = "en";
            targetLang = "vi";
          } else if (sourceColIdx !== -1 && targetColIdx !== -1) {
            // Check headers if diacritics were absent in both (e.g. acronyms)
            const srcHeader = headers[sourceColIdx]?.toLowerCase() || "";
            const tgtHeader = headers[targetColIdx]?.toLowerCase() || "";
            if (srcHeader.includes("vi") || srcHeader.includes("vn") || srcHeader.includes("tiếng việt")) {
              sourceLang = "vi";
              targetLang = "en";
            }
          }

          const def = defColIdx !== -1 ? row[defColIdx]?.trim() : undefined;
          const ctx = contextColIdx !== -1 ? row[contextColIdx]?.trim() : sheetName;

          termCandidates.push({
            sourceTerm: src,
            targetTerm: tgt,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            definition: def || undefined,
            context: ctx || undefined,
            category: sheetName,
            confidence: 0.95,
          });
        }
      }
    }

    return {
      fileName,
      fileType: "xlsx",
      fullText: fullTextParts.join("\n"),
      sections: workbook.SheetNames.map((sheet) => ({
        title: `Sheet: ${sheet}`,
        content: `Contained in sheet ${sheet}`,
      })),
      tables,
      termCandidates,
      metadata: {
        sheetNames: workbook.SheetNames,
      },
    };
  }
}

export type XlsxTranslationMode = "replace_en" | "bilingual_columns" | "bilingual_sheets";

export interface XlsxTranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  provider?: string | TranslationProvider;
  mode?: XlsxTranslationMode;
  onProgress?: (progress: {
    stage: "extracting" | "translating" | "writing" | "done";
    percent: number;
    message: string;
    translatedItems?: number;
    totalItems?: number;
    totalSheets?: number;
  }) => void;
}

export interface XlsxTranslationStats {
  totalSheets: number;
  totalRows: number;
  totalCells: number;
  translatedCells: number;
  formulasPreserved: number;
  columnsInserted?: number;
  sheetsDuplicated?: number;
}

export interface XlsxTranslationResult {
  translatedBuffer: Buffer;
  stats: XlsxTranslationStats;
  sampleTranslations: {
    sheetName: string;
    cellAddress: string;
    originalText: string;
    translatedText: string;
  }[];
}

function colLetterToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index;
}

function indexToColLetter(index: number): string {
  let letter = "";
  while (index > 0) {
    const mod = (index - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    index = Math.floor((index - mod) / 26);
  }
  return letter;
}

export function shiftFormulaColumns(formula: string, insertedColIdx: number, shiftCount: number = 1): string {
  if (!formula || typeof formula !== "string") return formula;
  return formula.replace(/(\$?[A-Z]+)(\$?\d+)/g, (match, colPart, rowPart) => {
    const isAbs = colPart.startsWith("$");
    const rawCol = isAbs ? colPart.slice(1) : colPart;
    const colIdx = colLetterToIndex(rawCol);
    if (colIdx >= insertedColIdx) {
      const newCol = indexToColLetter(colIdx + shiftCount);
      return (isAbs ? "$" : "") + newCol + rowPart;
    }
    return match;
  });
}

const VI_DIACRITICS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export function isTranslatableText(val: any): boolean {
  if (typeof val !== "string") return false;
  const s = val.trim();
  if (s.length < 2) return false;
  if (/^\d+(\.\d+)?%?$/.test(s)) return false; // numbers or percentages
  if (/^(stt|no\.?|id|#)$/i.test(s)) return false;
  if (/^[A-Z0-9_\-\.\/]+$/i.test(s) && /\d/.test(s) && !VI_DIACRITICS.test(s)) {
    // Model/Part codes like "SB-077-A-1", "FA25", "100%", "2026/09/25"
    return false;
  }
  return VI_DIACRITICS.test(s) || (/[a-zA-Z]{2,}/.test(s) && s.includes(" "));
}

export class XlsxTranslatorService {
  async translateSpreadsheet(
    buffer: Buffer,
    options?: XlsxTranslationOptions
  ): Promise<XlsxTranslationResult> {
    const sourceLanguage = options?.sourceLanguage || "vi";
    const targetLanguage = options?.targetLanguage || "en";
    const mode = options?.mode || "replace_en";
    const workbook = new ExcelJS.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(buffer);

    const provider: TranslationProvider =
      typeof options?.provider === "object"
        ? options.provider
        : getTranslationProvider(typeof options?.provider === "string" ? options.provider : undefined);

    const approvedGlossary = db.getApprovedTerminology(sourceLanguage, targetLanguage);

    // Map exact approved glossary terms
    const approvedExactMap = new Map<string, string>();
    for (const entry of approvedGlossary) {
      if (entry.sourceTerm && entry.targetTerm) {
        approvedExactMap.set(entry.sourceTerm.trim().toLowerCase().replace(/\s+/g, " "), entry.targetTerm.trim());
      }
    }

    let totalRows = 0;
    let totalCells = 0;
    let formulasPreserved = 0;
    let translatedCellsCount = 0;
    let columnsInserted = 0;
    let sheetsDuplicated = 0;

    interface CellTarget {
      sheetName: string;
      rowNumber: number;
      colNumber: number;
      address: string;
      originalText: string;
      isRichText?: boolean;
    }

    const cellsToTranslate: CellTarget[] = [];
    const textToCells = new Map<string, CellTarget[]>();

    options?.onProgress?.({
      stage: "extracting",
      percent: 10,
      message: `Đang quét cấu trúc bảng tính Excel (${workbook.worksheets.length} sheet)...`,
      totalSheets: workbook.worksheets.length,
    });

    // 1. Scan and collect all translatable text cells
    workbook.eachSheet((worksheet) => {
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        totalRows++;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          totalCells++;

          // Check if formula cell
          if (
            cell.type === ExcelJS.ValueType.Formula ||
            (cell.value && typeof cell.value === "object" && "formula" in (cell.value as any))
          ) {
            formulasPreserved++;
            return; // Never overwrite formula definitions
          }

          // Check for string value
          let strVal = "";
          let isRich = false;

          if (typeof cell.value === "string") {
            strVal = cell.value;
          } else if (cell.value && typeof cell.value === "object" && "richText" in (cell.value as any)) {
            const rich = (cell.value as any).richText;
            if (Array.isArray(rich)) {
              strVal = rich.map((r: any) => r.text || "").join("");
              isRich = true;
            }
          } else if (cell.value && typeof cell.value === "object" && "text" in (cell.value as any)) {
            strVal = String((cell.value as any).text || "");
          }

          if (strVal && isTranslatableText(strVal)) {
            const target: CellTarget = {
              sheetName: worksheet.name,
              rowNumber,
              colNumber,
              address: cell.address,
              originalText: strVal,
              isRichText: isRich,
            };
            cellsToTranslate.push(target);

            const norm = strVal.trim();
            if (!textToCells.has(norm)) {
              textToCells.set(norm, []);
            }
            textToCells.get(norm)!.push(target);
          }
        });
      });
    });

    const uniqueTexts = Array.from(textToCells.keys());
    const translationMap = new Map<string, string>();
    const pendingTexts: string[] = [];

    // 2. Check TM and exact glossary matches
    for (const text of uniqueTexts) {
      const normKey = text.toLowerCase().replace(/\s+/g, " ");

      // Exact approved glossary match
      if (approvedExactMap.has(normKey)) {
        translationMap.set(text, approvedExactMap.get(normKey)!);
        continue;
      }

      // Check stripped bullet
      const unstarred = normKey.replace(/^\s*[\*•\-#\d\.]+\s*/, "");
      if (unstarred && approvedExactMap.has(unstarred)) {
        translationMap.set(text, approvedExactMap.get(unstarred)!);
        continue;
      }

      // Cache check
      const cached = translationCache.get(text, sourceLanguage, targetLanguage);
      if (cached) {
        translationMap.set(text, cached);
        continue;
      }

      pendingTexts.push(text);
    }

    options?.onProgress?.({
      stage: "translating",
      percent: 30,
      message: `Đã tìm thấy ${cellsToTranslate.length} ô văn bản (${pendingTexts.length} cụm từ độc nhất cần dịch AI)...`,
      translatedItems: translationMap.size,
      totalItems: uniqueTexts.length,
    });

    // 3. Batch translate pending texts using provider
    const chunkSize = provider.name === "airgapped" ? 40 : 20;
    const chunks: string[][] = [];
    for (let i = 0; i < pendingTexts.length; i += chunkSize) {
      chunks.push(pendingTexts.slice(i, i + chunkSize));
    }

    let processedCount = translationMap.size;
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      if (cIdx > 0 && provider.name.toLowerCase().includes("gemini")) {
        await new Promise((r) => setTimeout(r, 2500));
      }
      const chunk = chunks[cIdx];
      const items = chunk.map((text, idx) => ({ id: `xlsx_item_${cIdx}_${idx}`, sourceText: text }));
      const chunkResults = new Map<string, string>();

      try {
        if (typeof provider.translateBatch === "function") {
          const res = await provider.translateBatch({
            items,
            sourceLanguage,
            targetLanguage,
            approvedTerminology: approvedGlossary,
          });
          if (res?.results) {
            for (const [id, trans] of res.results.entries()) {
              chunkResults.set(id, trans);
            }
          }
        } else {
          for (const it of items) {
            const single = await provider.translate({
              sourceText: it.sourceText,
              sourceLanguage,
              targetLanguage,
              approvedTerminology: approvedGlossary,
            });
            chunkResults.set(it.id, single.translatedText);
          }
        }
      } catch (err) {
        console.warn(`[XlsxTranslator] Batch ${cIdx + 1} failed, falling back to sequential:`, err);
        for (const it of items) {
          try {
            const single = await provider.translate({
              sourceText: it.sourceText,
              sourceLanguage,
              targetLanguage,
              approvedTerminology: approvedGlossary,
            });
            chunkResults.set(it.id, single.translatedText);
          } catch {
            chunkResults.set(it.id, it.sourceText);
          }
        }
      }

      for (let i = 0; i < chunk.length; i++) {
        const orig = chunk[i];
        const id = `xlsx_item_${cIdx}_${i}`;
        let translated = chunkResults.get(id) || orig;

        // Post-translation enforcement: Footwear SOP QA compliance + SPI normalization
        translated = enforceTerminologyCompliance(orig, translated, approvedGlossary, sourceLanguage, targetLanguage).text;
        translated = normalizeSpiTerminology(translated);

        translationMap.set(orig, translated);

        // Cache translation for fast persistent re-use
        translationCache.set(orig, translated, sourceLanguage, targetLanguage);
      }

      processedCount += chunk.length;
      const pct = Math.round(30 + ((processedCount / Math.max(1, uniqueTexts.length)) * 50));
      options?.onProgress?.({
        stage: "translating",
        percent: pct,
        message: `Đang dịch bảng tính (gói ${cIdx + 1}/${chunks.length})...`,
        translatedItems: processedCount,
        totalItems: uniqueTexts.length,
      });
    }

    options?.onProgress?.({
      stage: "writing",
      percent: 85,
      message: `Đang ghi bản dịch vào file Excel (chế độ ${mode})...`,
    });

    const sampleTranslations: { sheetName: string; cellAddress: string; originalText: string; translatedText: string }[] = [];

    // 4. Apply translations according to selected mode
    if (mode === "replace_en") {
      // Mode 1: In-place replacement
      for (const target of cellsToTranslate) {
        const worksheet = workbook.getWorksheet(target.sheetName);
        if (!worksheet) continue;
        const cell = worksheet.getCell(target.rowNumber, target.colNumber);
        const translated = translationMap.get(target.originalText.trim()) || target.originalText;

        if (target.isRichText) {
          cell.value = translated;
        } else {
          cell.value = translated;
        }

        translatedCellsCount++;
        if (sampleTranslations.length < 50) {
          sampleTranslations.push({
            sheetName: target.sheetName,
            cellAddress: target.address,
            originalText: target.originalText,
            translatedText: translated,
          });
        }
      }
    } else if (mode === "bilingual_sheets") {
      // Mode 2: Duplicate sheets (ISQ style: 1 VI sheet + 1 EN sheet)
      const originalSheetNames = workbook.worksheets.map((s) => s.name);
      for (const sName of originalSheetNames) {
        const srcSheet = workbook.getWorksheet(sName);
        if (!srcSheet) continue;

        srcSheet.name = `${sName} (VI)`;
        const enSheet = workbook.addWorksheet(`${sName} (EN)`);
        sheetsDuplicated++;

        // Copy columns, widths and rows
        enSheet.columns = srcSheet.columns.map((c) => ({
          header: c.header,
          key: c.key,
          width: c.width,
          style: c.style,
        }));

        srcSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          const enRow = enSheet.getRow(rowNumber);
          enRow.height = row.height;

          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const enCell = enRow.getCell(colNumber);

            // Copy cell styling
            enCell.style = { ...cell.style };

            let cellVal = cell.value;
            if (
              cell.type === ExcelJS.ValueType.Formula ||
              (cellVal && typeof cellVal === "object" && "formula" in (cellVal as any))
            ) {
              enCell.value = cellVal;
            } else if (typeof cellVal === "string" && isTranslatableText(cellVal)) {
              const trans = translationMap.get(cellVal.trim()) || cellVal;
              enCell.value = trans;
              translatedCellsCount++;
            } else {
              enCell.value = cellVal;
            }
          });
        });
      }
    } else if (mode === "bilingual_columns") {
      // Mode 3: Insert parallel translation column next to each translated text column
      workbook.eachSheet((worksheet) => {
        // Find which columns contain translated cells in this sheet
        const sheetCells = cellsToTranslate.filter((c) => c.sheetName === worksheet.name);
        const colSet = new Set<number>();
        for (const c of sheetCells) {
          colSet.add(c.colNumber);
        }

        // Sort columns descending (right-to-left) to keep earlier column indices stable during insertion
        const transCols = Array.from(colSet).sort((a, b) => b - a);

        for (const colIdx of transCols) {
          const insertIdx = colIdx + 1;
          worksheet.spliceColumns(insertIdx, 0, []);
          columnsInserted++;

          // Copy column width
          const origCol = worksheet.getColumn(colIdx);
          const newCol = worksheet.getColumn(insertIdx);
          newCol.width = Math.max(16, (origCol.width || 15) * 1.05);

          // Populate new column
          worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const origCell = row.getCell(colIdx);
            const newCell = row.getCell(insertIdx);

            // Inherit styles
            if (origCell.font) newCell.font = { ...origCell.font };
            if (origCell.fill) newCell.fill = { ...origCell.fill };
            if (origCell.border) newCell.border = { ...origCell.border };
            if (origCell.alignment) newCell.alignment = { ...origCell.alignment };

            const origStr = typeof origCell.value === "string" ? origCell.value : "";
            if (origStr && isTranslatableText(origStr)) {
              const trans = translationMap.get(origStr.trim()) || origStr;
              newCell.value = trans;
              translatedCellsCount++;

              if (sampleTranslations.length < 50) {
                sampleTranslations.push({
                  sheetName: worksheet.name,
                  cellAddress: newCell.address,
                  originalText: origStr,
                  translatedText: trans,
                });
              }
            } else if (rowNumber === 1 && typeof origCell.value === "string") {
              // Header row
              newCell.value = `${origCell.value} (EN)`;
            }
          });

          // Shift formula column references across all formula cells in this sheet
          worksheet.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
              if (
                cell.type === ExcelJS.ValueType.Formula ||
                (cell.value && typeof cell.value === "object" && "formula" in (cell.value as any))
              ) {
                const formulaObj = cell.value as any;
                if (formulaObj && formulaObj.formula) {
                  const newFormula = shiftFormulaColumns(formulaObj.formula, insertIdx, 1);
                  cell.value = {
                    ...formulaObj,
                    formula: newFormula,
                  };
                }
              }
            });
          });
        }
      });
    }

    options?.onProgress?.({
      stage: "done",
      percent: 100,
      message: `Đã hoàn tất dịch bảng tính Excel (${translatedCellsCount} ô đã dịch, ${formulasPreserved} công thức bảo toàn).`,
      translatedItems: translatedCellsCount,
    });

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const translatedBuffer = Buffer.from(rawBuffer);

    return {
      translatedBuffer,
      stats: {
        totalSheets: workbook.worksheets.length,
        totalRows,
        totalCells,
        translatedCells: translatedCellsCount,
        formulasPreserved,
        columnsInserted: mode === "bilingual_columns" ? columnsInserted : undefined,
        sheetsDuplicated: mode === "bilingual_sheets" ? sheetsDuplicated : undefined,
      },
      sampleTranslations,
    };
  }
}

export const xlsxTranslatorService = new XlsxTranslatorService();

