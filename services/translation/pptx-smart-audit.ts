import JSZip from "jszip";
import { db } from "../database/db";
import type { TerminologyEntry } from "../database/types";
import { DocumentTranslationMemory, canonicalizeText } from "./document-tm";
import { cleanTargetTerm } from "./casing";
import { isSafeTerminologyEntry } from "../terminology/safety";
import { checkGlossaryTranslation } from "../terminology/audit-compliance";
import { getAuditHistoryPairs } from "./translation-memory";
import { AUDIT_CONFIDENCE, AuditMemoryIndex, auditTextForms, chooseAuditMatch, languageEvidence, memoryPriority, vietnameseQuality } from "./audit-intelligence";
import type { AuditMemoryPair } from "./audit-intelligence";
import { PPTX_PARAGRAPH_PATTERN, paragraphText, canReplaceParagraphText, replaceParagraphText, canTranslateParagraphText, replaceParagraphTranslation } from "../documents/pptx-text";
import { orderedSlidePaths, readIsqSlidePairs, duplicateIsqSlides, duplicateViReferenceSlides } from "../documents/pptx-slide-order";
import { dynamicDeckDetector } from "../documents/pptx-structure";
import { auditAndRepairPptxPostFlight } from "../qa/pptx-postflight-gate";
import { classifyTextUnit, computeSourceHash, hasViDiacritics, isInspectionStatusLabel, isNonTranslatable, isPureEnglish, isShoeModelName, isEnglishImmunityProtected, isBilingualText, isItemPrefixOrCode } from "./smart-detector";
import type { BoundingBox, ScannedTextUnit, SlideVisualElement, SlideVisualLayout, SmartAuditReport, TextUnitLocation, TranslationAuditGroup } from "./smart-detector";
import { AirGappedTranslationProvider } from "./offline";
import { matchTerminology } from "../terminology/matcher";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { isVietnameseText, isSemanticBilingualPair, extractNumericParameters } from "./vietnamese-detector";

interface RawUnit { id: string; text: string; xml: string; location: TextUnitLocation; containerId: string; readOnly?: boolean }
interface ScanOptions {
  sourceLang?: string;
  targetLang?: string;
  mode?: string;
  customDocTM?: DocumentTranslationMemory;
  approvedGlossary?: TerminologyEntry[];
  historyPairs?: AuditMemoryPair[];
  expectedSuggestions?: { id: string; sourceText: string; suggestedTranslation: string }[];
  customTranslations?: Record<string, string>;
  customFontSizes?: Record<string, number>;
  viRefAction?: "duplicate" | "overwrite" | "bilingual";
  slideViHandling?: Record<number, "duplicate" | "overwrite" | "bilingual">;
}

function sourceEvidence(text: string, sourceLang: string): boolean {
  if (isNonTranslatable(text)) return false;
  const language = languageEvidence(text);
  return sourceLang === "vi"
    ? hasViDiacritics(text) || isVietnameseText(text) || language.vi.length > 0
    : !hasViDiacritics(text) && !isVietnameseText(text) && !language.vi.length && (language.likelyEnglish || isPureEnglish(text));
}

function targetEvidence(text: string, targetLang: string): boolean {
  return sourceEvidence(text, targetLang);
}

interface GroupTransformContext {
  x: number;
  y: number;
  w: number;
  h: number;
  chX: number;
  chY: number;
  chW: number;
  chH: number;
}

interface ParsedSlideShape {
  absStart: number;
  absEnd: number;
  type: "text" | "image" | "table" | "cell";
  shapeName: string;
  isTitle: boolean;
  box: BoundingBox;
  fill?: string;
  textColor?: string;
  fontSizePt?: number;
  isBold?: boolean;
  align?: "left" | "center" | "right";
  border?: string;
  tableRow?: number;
  tableCol?: number;
  rowSpan?: number;
  colSpan?: number;
  isMerged?: boolean;
  tableId?: string;
  tableBox?: BoundingBox;
  tableCols?: number[];
  fontScale?: number;
  lnSpcReduction?: number;
  isSpAutoFit?: boolean;
}

function parseXmlColor(chunk?: string): string | undefined {
  if (!chunk) return undefined;
  const srgb = chunk.match(/<a:srgbClr\b[^>]*\bval="([A-Fa-f0-9]{6})"/);
  if (srgb) return `#${srgb[1].toUpperCase()}`;
  const scheme = chunk.match(/<a:schemeClr\b[^>]*\bval="([^"]+)"/);
  if (scheme) {
    const val = scheme[1].toLowerCase();
    if (val === "tx1" || val === "dk1") return "#000000";
    if (val === "bg1" || val === "lt1") return "#FFFFFF";
    if (val === "accent1") return "#4472C4";
    if (val === "accent2") return "#ED7D31";
    if (val === "accent3") return "#A5A5A5";
    if (val === "accent4") return "#FFC000";
    if (val === "accent5") return "#5B9BD5";
    if (val === "accent6") return "#70AD47";
  }
  return undefined;
}

function parseXfrm(xmlChunk: string): { x: number; y: number; w: number; h: number } | null {
  const off = xmlChunk.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const ext = xmlChunk.match(/<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  if (!off || !ext) return null;
  return {
    x: parseInt(off[1], 10),
    y: parseInt(off[2], 10),
    w: parseInt(ext[1], 10),
    h: parseInt(ext[2], 10),
  };
}

function parseGrpXfrm(xmlChunk: string): GroupTransformContext | null {
  const prMatch = xmlChunk.match(/<p:grpSpPr\b[\s\S]*?<\/p:grpSpPr>/);
  if (!prMatch) return null;
  const prXml = prMatch[0];
  const off = prXml.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const ext = prXml.match(/<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  const chOff = prXml.match(/<a:chOff\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const chExt = prXml.match(/<a:chExt\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  if (!off || !ext) return null;
  return {
    x: parseInt(off[1], 10),
    y: parseInt(off[2], 10),
    w: parseInt(ext[1], 10),
    h: parseInt(ext[2], 10),
    chX: chOff ? parseInt(chOff[1], 10) : parseInt(off[1], 10),
    chY: chOff ? parseInt(chOff[2], 10) : parseInt(off[2], 10),
    chW: chExt ? parseInt(chExt[1], 10) : parseInt(ext[1], 10),
    chH: chExt ? parseInt(chExt[2], 10) : parseInt(ext[2], 10),
  };
}

function applyGroupTransform(
  raw: { x: number; y: number; w: number; h: number },
  stack: GroupTransformContext[]
): { x: number; y: number; w: number; h: number } {
  let cur = { ...raw };
  for (let i = stack.length - 1; i >= 0; i--) {
    const g = stack[i];
    const scaleX = g.chW > 0 ? g.w / g.chW : 1;
    const scaleY = g.chH > 0 ? g.h / g.chH : 1;
    cur.x = g.x + (cur.x - g.chX) * scaleX;
    cur.y = g.y + (cur.y - g.chY) * scaleY;
    cur.w = cur.w * scaleX;
    cur.h = cur.h * scaleY;
  }
  return cur;
}

function toBoundingBox(
  t: { x: number; y: number; w: number; h: number },
  slideW: number,
  slideH: number
): BoundingBox {
  const left = Math.max(0, Math.min(100, (t.x / slideW) * 100));
  const top = Math.max(0, Math.min(100, (t.y / slideH) * 100));
  const width = Math.max(0.5, Math.min(100 - left, (t.w / slideW) * 100));
  const height = Math.max(0.5, Math.min(100 - top, (t.h / slideH) * 100));
  return {
    left: Math.round(left * 10) / 10,
    top: Math.round(top * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

function parseSlideShapes(
  containerXml: string,
  baseOffset: number,
  slideW: number,
  slideH: number,
  stack: GroupTransformContext[] = [],
  out: ParsedSlideShape[] = []
): ParsedSlideShape[] {
  let i = 0;
  while (i < containerXml.length) {
    const openMatch = containerXml.slice(i).match(/<p:(sp|pic|graphicFrame|grpSp)\b/);
    if (!openMatch) break;
    const tagType = openMatch[1];
    const startIdx = i + openMatch.index!;
    const openTag = `<p:${tagType}`;
    const closeTag = `</p:${tagType}>`;

    let depth = 0;
    let pos = startIdx;
    let endIdx = -1;

    while (pos < containerXml.length) {
      let nextOpen = -1;
      let searchPos = pos;
      while (searchPos < containerXml.length) {
        const found = containerXml.indexOf(openTag, searchPos);
        if (found === -1) break;
        const nextChar = containerXml[found + openTag.length];
        if (nextChar === " " || nextChar === ">" || nextChar === "/" || nextChar === "\n" || nextChar === "\r") {
          nextOpen = found;
          break;
        }
        searchPos = found + openTag.length;
      }

      const nextClose = containerXml.indexOf(closeTag, pos);
      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) {
          endIdx = nextClose + closeTag.length;
          break;
        }
        pos = nextClose + closeTag.length;
      }
    }

    if (endIdx === -1) {
      i = startIdx + openTag.length;
      continue;
    }

    const shapeXml = containerXml.slice(startIdx, endIdx);
    const absStart = baseOffset + startIdx;
    const absEnd = baseOffset + endIdx;

    if (tagType === "grpSp") {
      const grpXfrm = parseGrpXfrm(shapeXml);
      const newStack = grpXfrm ? [...stack, grpXfrm] : stack;
      const openTagEnd = shapeXml.indexOf(">") + 1;
      const closeTagStart = shapeXml.lastIndexOf("</p:grpSp>");
      if (openTagEnd > 0 && closeTagStart > openTagEnd) {
        let innerContent = shapeXml.slice(openTagEnd, closeTagStart);
        innerContent = innerContent.replace(/<p:grpSpPr\b[\s\S]*?<\/p:grpSpPr>/, (m) => " ".repeat(m.length));
        parseSlideShapes(innerContent, absStart + openTagEnd, slideW, slideH, newStack, out);
      }
    } else if (tagType === "graphicFrame") {
      const rawXfrm = parseXfrm(shapeXml);
      const nameMatch = shapeXml.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/);
      const shapeName = nameMatch ? nameMatch[1] : "Bảng dữ liệu";

      if (rawXfrm && /<a:tbl\b/.test(shapeXml)) {
        const tableTrans = applyGroupTransform(rawXfrm, stack);
        const tableBox = toBoundingBox(tableTrans, slideW, slideH);
        const tableId = `tbl_${absStart}`;

        // Decompose table into individual cell elements with exact bounding boxes and cell styling
        const gridCols = Array.from(shapeXml.matchAll(/<a:gridCol\b[^>]*\bw="(\d+)"/g)).map((m) => parseInt(m[1], 10));
        const colOffsets: number[] = [];
        let curColX = 0;
        for (const w of gridCols) {
          colOffsets.push(curColX);
          curColX += w;
        }
        const totalGridW = curColX || rawXfrm.w;
        const tableCols = gridCols.map((w) => Number(((w / (totalGridW || 1)) * 100).toFixed(2)));

        const rowMatches = Array.from(shapeXml.matchAll(/<a:tr\b[^>]*\bh="(\d+)"[^>]*>([\s\S]*?)<\/a:tr>/g));
        const rowHeights: number[] = rowMatches.map((m) => {
          const parsed = parseInt(m[1], 10);
          return isNaN(parsed) || parsed < 0 ? 0 : parsed;
        });
        const rowOffsets: number[] = [];
        let curRowOffset = 0;
        for (const h of rowHeights) {
          rowOffsets.push(curRowOffset);
          curRowOffset += h;
        }
        const totalGridH = curRowOffset || rawXfrm.h;
        const effectiveTableH = Math.max(rawXfrm.h, totalGridH);
        const rowScale = totalGridH > 0 ? (effectiveTableH / totalGridH) : 1;

        let cellSearchPos = 0;
        for (let r = 0; r < rowMatches.length; r++) {
          const rowInner = rowMatches[r][2];
          const cellMatches = Array.from(rowInner.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g));

          for (let c = 0; c < cellMatches.length; c++) {
            const cellXml = cellMatches[c][0];
            const cellRelIndex = shapeXml.indexOf(cellXml, cellSearchPos);
            const cellAbsStart = cellRelIndex >= 0 ? absStart + cellRelIndex : absStart;
            const cellAbsEnd = cellAbsStart + cellXml.length;
            if (cellRelIndex >= 0) cellSearchPos = cellRelIndex + cellXml.length;

            // Detect merge attributes
            const isVMerge = /\bvMerge="(?:1|true)"/.test(cellXml);
            const isHMerge = /\bhMerge="(?:1|true)"/.test(cellXml);

            // Skip subordinate merged cells (placeholder cells with no independent content)
            if (isVMerge || isHMerge) {
              continue;
            }

            const rowSpanMatch = cellXml.match(/\browSpan="(\d+)"/);
            const rowSpan = rowSpanMatch ? Math.max(1, parseInt(rowSpanMatch[1], 10)) : 1;

            const gridSpanMatch = cellXml.match(/\bgridSpan="(\d+)"/);
            const gridSpan = gridSpanMatch ? Math.max(1, parseInt(gridSpanMatch[1], 10)) : 1;

            const isMerged = rowSpan > 1 || gridSpan > 1;

            // Compute span height
            let spanH = 0;
            if (rowHeights.length > 0) {
              for (let spanR = 0; spanR < rowSpan && (r + spanR) < rowHeights.length; spanR++) {
                spanH += rowHeights[r + spanR] || 0;
              }
            }
            if (!spanH) {
              spanH = Math.round(rowSpan * (rawXfrm.h / (rowMatches.length || 1)));
            }

            // Compute span width
            let spanW = 0;
            if (gridCols.length > 0) {
              for (let spanC = 0; spanC < gridSpan && (c + spanC) < gridCols.length; spanC++) {
                spanW += gridCols[c + spanC] || 0;
              }
            }
            if (!spanW) {
              spanW = Math.round(gridSpan * (rawXfrm.w / (cellMatches.length || 1)));
            }

            const colX = colOffsets[c] !== undefined ? colOffsets[c] : Math.round(c * (rawXfrm.w / (cellMatches.length || 1)));
            const rowY = rowOffsets[r] !== undefined ? rowOffsets[r] : Math.round(r * (rawXfrm.h / (rowMatches.length || 1)));

            const cellRaw = {
              x: rawXfrm.x + Math.round(colX * (rawXfrm.w / (totalGridW || 1))),
              y: rawXfrm.y + Math.round(rowY * rowScale),
              w: Math.round(spanW * (rawXfrm.w / (totalGridW || 1))),
              h: Math.round(spanH * rowScale),
            };
            const cellTrans = applyGroupTransform(cellRaw, stack);
            const cellBox = toBoundingBox(cellTrans, slideW, slideH);

            const tcPr = cellXml.match(/<a:tcPr[\s\S]*?<\/a:tcPr>/)?.[0] || "";
            // Strip line borders (<a:ln*...>) before checking solidFill/noFill so borders aren't mistaken for cell background
            const tcPrNoLines = tcPr.replace(/<a:ln[A-Za-z0-9]*\b[\s\S]*?<\/a:ln[A-Za-z0-9]*>/g, "");
            const isNoFill = /<a:noFill\/>/.test(tcPrNoLines);
            const fill = isNoFill ? undefined : parseXmlColor(tcPrNoLines.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]);
            const border = "1px solid #cbd5e1"; // Clean presentation table cell border

            const algnMatch = cellXml.match(/<a:pPr\b[^>]*\balgn="([^"]+)"/);
            const align = algnMatch ? (algnMatch[1] === "ctr" ? "center" : algnMatch[1] === "r" ? "right" : "left") : undefined;

            // Inspect dominant substantive text runs per Production Rule 2
            const runs = Array.from(cellXml.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g));
            const szCounts = new Map<number, number>();
            let dominantSz: number | undefined;
            let maxCount = 0;
            let dominantBold = false;
            let dominantColor: string | undefined;

            for (const rMatch of runs) {
              const rXml = rMatch[0];
              const tMatch = rXml.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/);
              const textLen = tMatch ? tMatch[1].trim().length : 0;
              if (textLen === 0) continue;

              const rPrMatch = rXml.match(/<a:rPr\b[\s\S]*?(?:<\/a:rPr>|\/>)/)?.[0] || "";
              const szM = rPrMatch.match(/\bsz="(\d+)"/);
              if (szM) {
                const szVal = Math.round(parseInt(szM[1], 10) / 100);
                const count = (szCounts.get(szVal) || 0) + textLen;
                szCounts.set(szVal, count);
                if (count > maxCount) {
                  maxCount = count;
                  dominantSz = szVal;
                  dominantBold = /\bb="1"/.test(rPrMatch);
                  dominantColor = parseXmlColor(rPrMatch.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]);
                }
              }
            }

            const fallbackRPr = cellXml.match(/<a:rPr\b[\s\S]*?(?:<\/a:rPr>|\/>)/)?.[0] || "";
            const szMatch = fallbackRPr.match(/\bsz="(\d+)"/);
            const fontSizePt = dominantSz !== undefined ? dominantSz : (szMatch ? Math.round(parseInt(szMatch[1], 10) / 100) : (r === 0 ? 10 : 9));
            const isBold = dominantSz !== undefined ? dominantBold : (/\bb="1"/.test(fallbackRPr) || r === 0);
            const textColor = dominantColor || parseXmlColor(fallbackRPr.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]);

            const rowDesc = rowSpan > 1 ? `Hàng ${r + 1}-${r + rowSpan}` : `Hàng ${r + 1}`;
            const colDesc = gridSpan > 1 ? `Cột ${c + 1}-${c + gridSpan}` : `Cột ${c + 1}`;
            const cellName = `${shapeName} [${rowDesc}, ${colDesc}]`;

            const bodyPr = cellXml.match(/<a:bodyPr\b[\s\S]*?(?:<\/a:bodyPr>|\/>)/)?.[0] || "";
            const normAutofitMatch = bodyPr.match(/<a:normAutofit\b[^>]*>/) || cellXml.match(/<a:normAutofit\b[^>]*>/);
            let cellFontScale: number | undefined;
            let cellLnSpcReduction: number | undefined;
            if (normAutofitMatch) {
              const fsM = normAutofitMatch[0].match(/\bfontScale="(\d+)"/);
              if (fsM) cellFontScale = parseInt(fsM[1], 10) / 100000;
              const lnsM = normAutofitMatch[0].match(/\blnSpcReduction="(\d+)"/);
              if (lnsM) cellLnSpcReduction = parseInt(lnsM[1], 10) / 100000;
            }
            const isSpAutoFit = /<a:spAutoFit\b/.test(bodyPr) || /<a:spAutoFit\b/.test(cellXml);

            out.push({
              absStart: cellAbsStart,
              absEnd: cellAbsEnd,
              type: "cell",
              shapeName: cellName,
              isTitle: r === 0,
              box: cellBox,
              fill,
              textColor,
              fontSizePt,
              isBold,
              align,
              border,
              tableRow: r,
              tableCol: c,
              rowSpan,
              colSpan: gridSpan,
              isMerged,
              tableId,
              tableBox,
              tableCols,
              fontScale: cellFontScale,
              lnSpcReduction: cellLnSpcReduction,
              isSpAutoFit,
            });
          }
        }
      } else if (rawXfrm) {
        const trans = applyGroupTransform(rawXfrm, stack);
        const box = toBoundingBox(trans, slideW, slideH);
        out.push({
          absStart,
          absEnd,
          type: "table",
          shapeName,
          isTitle: false,
          box,
        });
      }
    } else {
      const rawXfrm = parseXfrm(shapeXml);
      if (rawXfrm) {
        const trans = applyGroupTransform(rawXfrm, stack);
        const box = toBoundingBox(trans, slideW, slideH);
        const nameMatch = shapeXml.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/);
        const shapeName = nameMatch ? nameMatch[1] : "";
        const isTitle = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(shapeXml);

        const spPr = shapeXml.match(/<p:spPr[\s\S]*?<\/p:spPr>/)?.[0] || "";
        const spPrNoLines = spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, "");
        const isShapeNoFill = /<a:noFill\/>/.test(spPrNoLines);
        const fill = isShapeNoFill ? undefined : parseXmlColor(spPrNoLines.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]);

        const rPr = shapeXml.match(/<a:rPr\b[\s\S]*?(?:<\/a:rPr>|\/>)/)?.[0] || "";
        const textColor = parseXmlColor(rPr.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]);
        const szMatch = rPr.match(/\bsz="(\d+)"/);
        const fontSizePt = szMatch ? Math.round(parseInt(szMatch[1], 10) / 100) : undefined;
        const isBold = /\bb="1"/.test(rPr) || isTitle;
        const algnMatch = shapeXml.match(/<a:pPr\b[^>]*\balgn="([^"]+)"/);
        const align = algnMatch ? (algnMatch[1] === "ctr" ? "center" : algnMatch[1] === "r" ? "right" : "left") : undefined;

        const bodyPr = shapeXml.match(/<a:bodyPr\b[\s\S]*?(?:<\/a:bodyPr>|\/>)/)?.[0] || "";
        const normAutofitMatch = bodyPr.match(/<a:normAutofit\b[^>]*>/) || shapeXml.match(/<a:normAutofit\b[^>]*>/);
        let shapeFontScale: number | undefined;
        let shapeLnSpcReduction: number | undefined;
        if (normAutofitMatch) {
          const fsM = normAutofitMatch[0].match(/\bfontScale="(\d+)"/);
          if (fsM) shapeFontScale = parseInt(fsM[1], 10) / 100000;
          const lnsM = normAutofitMatch[0].match(/\blnSpcReduction="(\d+)"/);
          if (lnsM) shapeLnSpcReduction = parseInt(lnsM[1], 10) / 100000;
        }
        const isShapeSpAutoFit = /<a:spAutoFit\b/.test(bodyPr) || /<a:spAutoFit\b/.test(shapeXml);

        out.push({
          absStart,
          absEnd,
          type: tagType === "pic" ? "image" : "text",
          shapeName,
          isTitle,
          box,
          fill,
          textColor,
          fontSizePt,
          isBold,
          align,
          fontScale: shapeFontScale,
          lnSpcReduction: shapeLnSpcReduction,
          isSpAutoFit: isShapeSpAutoFit,
        });
      }
    }
    i = endIdx;
  }
  return out;
}

async function extractUnits(zip: JSZip): Promise<{ units: RawUnit[]; slides: number; visualLayouts: SlideVisualLayout[] }> {
  let slideWidthEmu = 9144000;
  let slideHeightEmu = 6858000;
  const presXml = await zip.file("ppt/presentation.xml")?.async("string");
  if (presXml) {
    const sldSzMatch = presXml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (sldSzMatch) {
      slideWidthEmu = parseInt(sldSzMatch[1], 10) || 9144000;
      slideHeightEmu = parseInt(sldSzMatch[2], 10) || 6858000;
    }
  }
  const aspectRatio = Math.round((slideWidthEmu / slideHeightEmu) * 100) / 100;

  const paths = await orderedSlidePaths(zip);
  const units: RawUnit[] = [];
  const visualLayouts: SlideVisualLayout[] = [];

  for (let s = 0; s < paths.length; s++) {
    const partPath = paths[s], slideIndex = s + 1;
    const xml = await zip.file(partPath)!.async("string");
    const containers = Array.from(xml.matchAll(/<(?:p|a):txBody(?:\s[^>]*)?>[\s\S]*?<\/(?:p|a):txBody>/g));
    const titleRanges = Array.from(xml.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g)).filter((m) => /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(m[0]));
    
    // Parse shapes and bounding boxes
    const slideShapes = parseSlideShapes(xml, 0, slideWidthEmu, slideHeightEmu);
    const shapeUnitMap = new Map<ParsedSlideShape, string[]>();

    let paragraphIndex = 0;
    let containerPointer = 0;
    for (const match of xml.matchAll(new RegExp(PPTX_PARAGRAPH_PATTERN))) {
      const index = paragraphIndex++;
      const text = paragraphText(match[0]).trim();
      if (!text) continue;
      const offset = match.index!;
      while (containerPointer < containers.length && offset >= containers[containerPointer].index! + containers[containerPointer][0].length) containerPointer++;
      const current = containers[containerPointer];
      const containerIndex = current && offset >= current.index! && offset < current.index! + current[0].length ? containerPointer : -1;
      const containerId = `s${slideIndex}_c${containerIndex < 0 ? `p${index}` : containerIndex}`;

      const matchingShapes = slideShapes.filter((shape) => offset >= shape.absStart && offset < shape.absEnd);
      const parentShape = matchingShapes.sort((a, b) => (a.absEnd - a.absStart) - (b.absEnd - b.absStart))[0];
      const unitId = `s${slideIndex}_p${index}`;
      if (parentShape) {
        if (!shapeUnitMap.has(parentShape)) shapeUnitMap.set(parentShape, []);
        shapeUnitMap.get(parentShape)!.push(unitId);
      }

      units.push({ id: unitId, text, xml: match[0], containerId,
        location: { partPath, containerId, slideIndex, shapeIndex: containerIndex + 1, paragraphIndex: index,
          isTitle: titleRanges.some((m) => offset >= m.index! && offset < m.index! + m[0].length) || Boolean(parentShape?.isTitle),
          isTable: xml.lastIndexOf("<a:tc", offset) > xml.lastIndexOf("</a:tc>", offset) || parentShape?.type === "table" || parentShape?.type === "cell",
          box: parentShape?.box },
      });
    }

    // Follow relationships instead of assuming notesSlideN corresponds to slideN.
    const relsPath = partPath.replace("slides/", "slides/_rels/") + ".rels";
    const rels = await zip.file(relsPath)?.async("string") || "";
    const relatedParts = Array.from(rels.matchAll(/<Relationship\b[^>]*>/g)).map((m) => {
      const target = m[0].match(/Target="([^"]+)"/)?.[1];
      const type = m[0].match(/Type="([^"]+)"/)?.[1] || "";
      if (!target || !/\/(?:notesSlide|diagramData)$/.test(type) || /TargetMode="External"/.test(m[0])) return undefined;
      // Only internal text parts are read. Never load media or arbitrary ZIP paths.
      const path = target.startsWith("/") ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, "")}`;
      return /^(?:ppt\/notesSlides\/notesSlide\d+|ppt\/diagrams\/data\d+)\.xml$/.test(path) ? path : undefined;
    }).filter((p): p is string => Boolean(p));
    // Tolerate lightweight fixtures/legacy decks without relationships.
    const physicalIndex = Number(partPath.match(/slide(\d+)/)![1]);
    if (!relatedParts.some((p) => p.includes("notesSlides")) && zip.file(`ppt/notesSlides/notesSlide${physicalIndex}.xml`)) relatedParts.push(`ppt/notesSlides/notesSlide${physicalIndex}.xml`);
    for (const relatedPath of new Set(relatedParts)) {
      const relatedXml = await zip.file(relatedPath)?.async("string");
      if (!relatedXml) continue;
      let pIndex = 0;
      for (const match of relatedXml.matchAll(new RegExp(PPTX_PARAGRAPH_PATTERN))) {
        const index = pIndex++, text = paragraphText(match[0]).trim();
        if (!text || isNonTranslatable(text)) continue;
        const id = `${relatedPath.includes("notesSlides") ? "notes" : "diagram"}_s${slideIndex}_p${index}`;
        units.push({ id, text, xml: match[0], containerId: id, readOnly: true,
          location: { partPath: relatedPath, slideIndex, paragraphIndex: index, containerId: id } });
      }
    }

    // Detect slide background color
    const bgMatch = xml.match(/<p:bg\b[\s\S]*?<\/p:bg>/);
    const slideBg = parseXmlColor(bgMatch?.[0]?.match(/<a:solidFill[\s\S]*?<\/a:solidFill>/)?.[0]) || "#FFFFFF";

    // Construct SlideVisualLayout for this slide
    const visualElements: SlideVisualElement[] = slideShapes.map((shape, shIdx) => {
      const uIds = shapeUnitMap.get(shape) || [];
      return {
        id: `s${slideIndex}_el${shIdx}`,
        type: shape.type,
        box: shape.box,
        shapeName: shape.shapeName || (shape.type === "image" ? "Hình ảnh kỹ thuật (Zero-Image)" : `Phần tử ${shIdx + 1}`),
        isTitle: shape.isTitle,
        unitId: uIds[0],
        unitIds: uIds,
        fill: shape.fill,
        textColor: shape.textColor,
        fontSizePt: shape.fontSizePt,
        isBold: shape.isBold,
        align: shape.align,
        border: shape.border,
        tableRow: shape.tableRow,
        tableCol: shape.tableCol,
        rowSpan: shape.rowSpan,
        colSpan: shape.colSpan,
        isMerged: shape.isMerged,
        tableId: shape.tableId,
        tableBox: shape.tableBox,
        tableCols: shape.tableCols,
        fontScale: shape.fontScale,
        lnSpcReduction: shape.lnSpcReduction,
        isSpAutoFit: shape.isSpAutoFit,
      };
    });

    visualLayouts.push({
      slideIndex,
      widthEmu: slideWidthEmu,
      heightEmu: slideHeightEmu,
      aspectRatio,
      elements: visualElements,
      backgroundColor: slideBg,
    });
  }
  return { units, slides: paths.length, visualLayouts };
}

function buildGroups(units: ScannedTextUnit[], pairs: AuditMemoryPair[], preservedIds = new Set<string>()): TranslationAuditGroup[] {
  const groups: TranslationAuditGroup[] = [];
  const bySource = new Map<string, AuditMemoryPair[]>();
  for (const pair of pairs) {
    if (pair.targetOnly) continue;
    const key = auditTextForms(pair.source).normalized;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(pair);
  }
  const grouped = new Set<string>();
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const [key, entries] of bySource) {
    const present = entries.filter((p) => p.origin === "presentation" && p.targetUnitId);
    if (!present.length) continue;
    const variants = new Map<string, { text: string; count: number; approved: boolean; slides: number[] }>();
    for (const pair of entries) {
      if (!pair.target || !pair.target.trim()) continue;
      // Only presentation translations and approved glossary entries participate in consistency variant grouping.
      // Historical memory (history / correction) must never create consistency conflicts against existing deck translations.
      if (pair.origin !== "presentation" && pair.origin !== "approved") continue;
      const trimmedTarget = pair.target.trim();
      // Bare numbers, non-translatables, and single-char targets must NEVER be treated as valid translation variants
      if (/^\d+(?:[.,]\d+)?$/.test(trimmedTarget) || isNonTranslatable(trimmedTarget) || trimmedTarget.length <= 1) continue;
      const targetKey = auditTextForms(pair.target).normalized;
      if (!variants.has(targetKey)) variants.set(targetKey, { text: pair.target, count: 0, approved: pair.origin === "approved", slides: [] });
      const variant = variants.get(targetKey)!;
      variant.approved ||= pair.origin === "approved";
      if (pair.origin === "presentation") { variant.count++; if (pair.slideIndex && !variant.slides.includes(pair.slideIndex)) variant.slides.push(pair.slideIndex); }
    }
    if (variants.size < 2) continue;
    const sorted = [...variants.values()].sort((a, b) => Number(b.approved) - Number(a.approved) || b.count - a.count);
    const ids = new Set(present.map((p) => p.targetUnitId!));
    const affected = [...ids].map((id) => byId.get(id)).filter((u): u is ScannedTextUnit => Boolean(u) && auditTextForms(u!.sourceText).normalized !== auditTextForms(sorted[0].text).normalized);
    if (!affected.length) continue;
    for (const unit of affected) {
      unit.status = "TRANSLATION_CONFLICT"; unit.selectedForTranslation = false;
      unit.suggestedTranslation = sorted[0].text; unit.safeToApply = false;
      unit.reason = sorted[0].approved ? "Thuật ngữ đã xác nhận khác với bản dịch hiện tại." : "Cùng nội dung nguồn có nhiều bản dịch; bản dùng nhiều nhất vẫn cần xác nhận.";
      grouped.add(unit.id);
    }
    groups.push({ id: `consistency:${key}`, type: "consistency", title: entries[0].source, unitIds: affected.map((u) => u.id),
      suggestedTranslation: sorted[0].text, variants: sorted, confidence: sorted[0].approved ? 0.99 : 0.85,
      safeToApply: false, reason: affected[0].reason });
  }
  const buckets = new Map<string, ScannedTextUnit[]>();
  for (const unit of units) {
    if (grouped.has(unit.id) || ["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status)) continue;
    const key = `${unit.status}:${auditTextForms(unit.suggestedTranslation || unit.sourceText).compact}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(unit);
  }
  for (const [key, members] of buckets) groups.push({ id: key,
    type: members[0].status === "SUSPICIOUS_TRANSLATION" ? "language_quality" : members[0].status === "TRANSLATION_CONFLICT" ? "consistency" : "translation",
    title: members[0].sourceText, unitIds: members.map((u) => u.id), suggestedTranslation: members[0].suggestedTranslation,
    confidence: Math.min(...members.map((u) => u.confidence)), reason: members[0].reason,
    safeToApply: members.every((u) => u.safeToApply && u.canApply) });
  return groups.sort((a, b) => Number(a.safeToApply) - Number(b.safeToApply) || b.confidence - a.confidence);
}

export async function scanPptxTranslationIntelligence(
  buffer: Buffer,
  fileNameOrOptions: string | ScanOptions = "presentation.pptx",
  rawOptions: ScanOptions = {}
): Promise<SmartAuditReport> {
  const fileName = typeof fileNameOrOptions === "string" ? fileNameOrOptions : "presentation.pptx";
  const options = typeof fileNameOrOptions === "object" ? fileNameOrOptions : (rawOptions || {});
  const sourceLang = (options.sourceLang || (options as any).sourceLanguage || "vi").toLowerCase();
  const targetLang = (options.targetLang || (options as any).targetLanguage || "en").toLowerCase();
  const zip = await JSZip.loadAsync(buffer);
  const extracted = await extractUnits(zip);
  const isqSlidePairs = await readIsqSlidePairs(zip);
  const referencePaths = new Set(isqSlidePairs.map(p=>p.vi));
  const isqPaths = new Set<string>();
  if (sourceLang === "vi" && targetLang === "en" && options.mode !== "replace_en") {
    const slideUnits = new Map<string,RawUnit[]>();
    for (const raw of extracted.units.filter(u=>/^ppt\/slides\//.test(u.location.partPath || ""))) {
      const part=raw.location.partPath!; if(!slideUnits.has(part))slideUnits.set(part,[]);slideUnits.get(part)!.push(raw);
    }
    let afterHfpa=false;
    for(const [part,members] of slideUnits){
      const containsHfpa=members.some(u=>/\bhfpa\b/i.test(u.text));
      const profile=dynamicDeckDetector.profileSlide({slideIndex:members[0].location.slideIndex!,slideFileName:part,title:members[0].text,
        paragraphs:members.map(u=>({id:u.id,originalText:u.text,translatedText:'',slideIndex:u.location.slideIndex!,shapeIndex:0,paragraphIndex:u.location.paragraphIndex!}))},await zip.file(part)!.async('string'),fileName,afterHfpa);
      const ipqcTable=/\bIPQC\b/i.test(fileName) && !afterHfpa && profile.hasTable && profile.totalTexts>15;
      const hasVi = profile.viCount > 0 || members.some(u => sourceEvidence(u.text, "vi"));
      const isModeIsq = options.mode === "isq_duplicate" && hasVi;
      if((profile.isIsq || isModeIsq) && !profile.isDivider && !ipqcTable && !referencePaths.has(part))isqPaths.add(part);
      if(containsHfpa)afterHfpa=true;
    }
  }
  const rawGlossary = options.approvedGlossary || db.getGlossaryReviewTerminology(sourceLang, targetLang);
  const glossary = rawGlossary.filter((e) => (e.status === "approved" || e.status === "review") && isSafeTerminologyEntry(e) &&
    !(sourceLang === "vi" && targetLang === "en" && hasViDiacritics(cleanTargetTerm(e.targetTerm))) &&
    auditTextForms(e.sourceTerm).compact !== auditTextForms(e.targetTerm).compact);
  const pairs: AuditMemoryPair[] = glossary.map((e) => ({ source: e.sourceTerm, target: cleanTargetTerm(e.targetTerm), origin: e.status === "approved" ? "approved" : "review" }));
  pairs.push(...(options.historyPairs || getAuditHistoryPairs(sourceLang, targetLang)));
  for (const entry of options.customDocTM?.getAllEntries() || []) pairs.push({ source: entry.sourceOriginal, target: entry.target,
    origin: entry.status === "LOCKED" || entry.status === "APPROVED" ? "approved" : "presentation", slideIndex: entry.sourceLocation.slide });
  const extractItemStepNumber = (text: string): string | null => {
    if (!text) return null;
    const m = text.match(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*(\d+(?:\.\d+)?)|#?\s*(\d+(?:\.\d+)?)\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)\b))/i);
    if (m) return m[1] || m[2];
    return null;
  };

  const cleanStepPrefix = (text: string): string => {
    return text.replace(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*\d+(?:\.\d+)?[:.]?|#?\s*\d+(?:\.\d+)?\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)[:.]?))\s*/i, "").trim();
  };

  const isModelSectionHeading = (text: string): boolean => {
    if (!text) return false;
    const clean = text.trim();
    if (/^\s*\*?\s*(?:model|mẫu)\s*[:\s\-]/i.test(clean)) return true;
    const m = clean.match(/^\s*\*?\s*(?:đối\s*với|for|áp\s*dụng\s*cho|apply\s*to|dành\s*cho)\s*(?:mẫu|model)?\s*[:\s\-]?\s*(.+)$/i);
    if (m) {
      const candidate = m[1].trim();
      if (/^sizes?\b/i.test(candidate)) return false;
      if (candidate.length > 50) return false;
      if (hasViDiacritics(candidate)) return false;
      if (isShoeModelName(candidate)) return true;
      if (/[A-Z0-9]+-[A-Z0-9]+/i.test(candidate)) return true;
      if (/^[A-Z0-9\s\-\/\#]+$/i.test(candidate)) return true;
    }
    return false;
  };

  const containers = new Map<string, RawUnit[]>();
  for (const unit of extracted.units) { if (!containers.has(unit.containerId)) containers.set(unit.containerId, []); containers.get(unit.containerId)!.push(unit); }
  const paired = new Map<string, string>();
  const pairedPartnerId = new Map<string, string>();
  const inlineBilingual = new Set<string>();
  for (const raw of extracted.units) {
    if (isModelSectionHeading(raw.text)) {
      continue;
    }
    if (isBilingualText(raw.text)) {
      inlineBilingual.add(raw.id);
    }
    const parts = raw.text.split(/\r?\n|\s+[-–—/|:]\s+|[-–—/|:]/).map((t) => t.replace(/^(?:EN|VI|VN)\s*:\s*/i, "").trim()).filter(Boolean);
    if (parts.length === 2) {
      const s = parts.find((t) => sourceEvidence(t, sourceLang) && !isItemPrefixOrCode(t));
      const t = parts.find((t) => targetEvidence(t, targetLang) && !isItemPrefixOrCode(t));
      if (s && t && !isNonTranslatable(s) && !isNonTranslatable(t) && !/^\d+(?:[.,]\d+)?$/.test(s) && !/^\d+(?:[.,]\d+)?$/.test(t)) {
        pairs.push({ source: s, target: t, origin: "presentation", slideIndex: raw.location.slideIndex });
        inlineBilingual.add(raw.id);
      }
    } else if (parts.length > 2) {
      // Check block bilingual lines within same paragraph: (1.EN..4.EN ... 1.VI..4.VI OR 1.VI..4.VI ... 1.EN..4.EN)
      const firstIsVi = hasViDiacritics(parts[0]);
      const transIdx = firstIsVi
        ? parts.findIndex((p) => !hasViDiacritics(p) && (targetEvidence(p, targetLang) || isPureEnglish(p)))
        : parts.findIndex((p) => hasViDiacritics(p) || sourceEvidence(p, sourceLang));

      let handledBlock = false;
      if (transIdx > 0 && transIdx < parts.length) {
        const b1 = parts.slice(0, transIdx);
        const b2 = parts.slice(transIdx);
        if (b1.length === b2.length || (b1.length >= 2 && b2.length >= 2)) {
          for (const it1 of b1) {
            const s1 = extractItemStepNumber(it1);
            const partner = s1 ? b2.find((it2) => extractItemStepNumber(it2) === s1) : b1.length === b2.length ? b2[b1.indexOf(it1)] : undefined;
            if (partner && !isNonTranslatable(it1) && !isNonTranslatable(partner)) {
              const src = firstIsVi ? it1 : partner;
              const tgt = firstIsVi ? partner : it1;
              pairs.push({ source: src, target: tgt, origin: "presentation", slideIndex: raw.location.slideIndex });
              inlineBilingual.add(raw.id);
              handledBlock = true;
            }
          }
        }
      }
      if (handledBlock) continue;

      // Interleaved lines within the same paragraph: 1.EN, 1.VI, 2.EN, 2.VI...
      for (let k = 0; k < parts.length - 1; k++) {
        const l1 = parts[k], l2 = parts[k + 1];
        if (isInspectionStatusLabel(l1) || isInspectionStatusLabel(l2)) continue;
        const s1 = sourceEvidence(l1, sourceLang), t1 = targetEvidence(l1, targetLang);
        const s2 = sourceEvidence(l2, sourceLang), t2 = targetEvidence(l2, targetLang);
        const step1 = extractItemStepNumber(l1), step2 = extractItemStepNumber(l2);
        const sameStep = Boolean(step1 && step2 && step1 === step2);
        const diffStep = Boolean(step1 && step2 && step1 !== step2);
        if (diffStep) continue;

        const lenRatio = Math.min(l1.trim().length, l2.trim().length) / Math.max(l1.trim().length, l2.trim().length);
        const plausibleLength = lenRatio >= 0.35 || (sameStep && lenRatio >= 0.25);

        if (plausibleLength && ((s1 && t2 && lenRatio >= 0.4) || (sameStep && s1 && !s2))) {
          if (!isNonTranslatable(l1) && !isNonTranslatable(l2) && !/^\d+(?:[.,]\d+)?$/.test(l1) && !/^\d+(?:[.,]\d+)?$/.test(l2)) {
            pairs.push({ source: l1, target: l2, origin: "presentation", slideIndex: raw.location.slideIndex });
            inlineBilingual.add(raw.id);
            k++;
          }
        } else if (plausibleLength && ((t1 && s2 && lenRatio >= 0.4) || (sameStep && !s1 && s2))) {
          if (!isNonTranslatable(l1) && !isNonTranslatable(l2) && !/^\d+(?:[.,]\d+)?$/.test(l1) && !/^\d+(?:[.,]\d+)?$/.test(l2)) {
            pairs.push({ source: l2, target: l1, origin: "presentation", slideIndex: raw.location.slideIndex });
            inlineBilingual.add(raw.id);
            k++;
          }
        }
      }
    }
  }
  const known = new AuditMemoryIndex(pairs);
  const addPair = (source: RawUnit, target: RawUnit) => {
    if (isNonTranslatable(source.text) || isNonTranslatable(target.text)) return;
    if (isInspectionStatusLabel(source.text) || isInspectionStatusLabel(target.text)) return;
    const sTrim = source.text.trim();
    const tTrim = target.text.trim();
    if (sTrim.toLowerCase() === tTrim.toLowerCase()) return;
    if (/^\d+(?:[.,]\d+)?$/.test(sTrim) || /^\d+(?:[.,]\d+)?$/.test(tTrim)) return;
    if (sTrim.length <= 1 || tTrim.length <= 1) return;

    // Heading structure parity: A process heading (*Heading) cannot pair with body text
    const sIsHeading = /^[\*•#]/.test(sTrim);
    const tIsHeading = /^[\*•#]/.test(tTrim);
    if (sIsHeading !== tIsHeading) return;

    // Shoe size specification guard: Two rows specifying different sizes (e.g. Size #5-#6 vs Size #6.5-#9) cannot be a translation pair
    if (/size\s*#?\d+/i.test(sTrim) && /size\s*#?\d+/i.test(tTrim)) {
      const sizeS = sTrim.match(/size\s*#?\d+(?:[.,]\d+)?(?:\s*-\s*#?\d+(?:[.,]\d+)?)?/i)?.[0];
      const sizeT = tTrim.match(/size\s*#?\d+(?:[.,]\d+)?(?:\s*-\s*#?\d+(?:[.,]\d+)?)?/i)?.[0];
      if (sizeS && sizeT && sizeS.toLowerCase().replace(/\s+/g, "") !== sizeT.toLowerCase().replace(/\s+/g, "")) {
        return;
      }
    }

    // Numerical parameter compatibility check
    const numS = extractNumericParameters(sTrim);
    const numT = extractNumericParameters(tTrim);
    if (numS.length > 0 && numT.length > 0) {
      const shared = numS.filter((n) => numT.includes(n));
      if (shared.length === 0 && (numS.length >= 2 || numT.length >= 2)) return;
    }

    // Strict length disparity guard: a long paragraph cannot pair with a short label
    const minLen = Math.min(sTrim.length, tTrim.length);
    const maxLen = Math.max(sTrim.length, tTrim.length);
    if (maxLen >= 15 && minLen < 5) return;
    if (maxLen >= 25 && minLen / maxLen < 0.25) return;

    pairs.push({ source: source.text, target: target.text, origin: "presentation", slideIndex: source.location.slideIndex, sourceUnitId: source.id, targetUnitId: target.id });
    paired.set(source.id, target.text); paired.set(target.id, source.text);
    pairedPartnerId.set(source.id, target.id); pairedPartnerId.set(target.id, source.id);

    const cleanSrc = cleanStepPrefix(source.text);
    const cleanTgt = cleanStepPrefix(target.text);
    if (cleanSrc && cleanTgt && cleanSrc.length > 2 && cleanTgt.length > 2 && (cleanSrc !== source.text || cleanTgt !== target.text)) {
      pairs.push({ source: cleanSrc, target: cleanTgt, origin: "presentation", slideIndex: source.location.slideIndex });
    }
  };
  const isHeadingLike = (text: string): boolean => {
    if (!text) return false;
    const t = text.trim();
    if (/[\*•#]/.test(t) || /:\s*$/.test(t)) return true;
    if (/\b(?:focus|focuses|trọng\s*điểm|tiêu\s*chuẩn|inspection|kiểm\s*tra|standard|criterion|critical|ctq|ctp|sop|quy\s*trình|hướng\s*dẫn|yêu\s*cầu|swoosh|may\s*logo)\b/i.test(t)) return true;
    if (/^[A-Z0-9\s\-_:\/]{4,}$/.test(t) && !/\b\d+\s+stitches\b/i.test(t)) return true;
    return false;
  };
  const modelSubScopeUnitIds = new Set<string>();

  for (const members of containers.values()) {
    // Partition members into sub-scopes if there are model-specific section headings (*Đối với..., For...)
    const subScopes: RawUnit[][] = [];
    let currentScope: RawUnit[] = [];
    let currentIsModel = false;

    for (const u of members) {
      if (isModelSectionHeading(u.text)) {
        if (currentScope.length > 0) {
          subScopes.push(currentScope);
          currentScope = [];
        }
        currentIsModel = true;
      }
      if (currentIsModel) {
        modelSubScopeUnitIds.add(u.id);
      }
      currentScope.push(u);
    }
    if (currentScope.length > 0) {
      subScopes.push(currentScope);
    }

    for (const scopeMembers of subScopes) {
      // 0. Check if container itself is a block bilingual layout:
      // (e.g. [E1, E2, E3, V1, V2, V3] or [V1, V2, V3, E1, E2, E3])
      const firstIsVi = scopeMembers.length > 0 && hasViDiacritics(scopeMembers[0].text);
      const transIdx = firstIsVi
        ? scopeMembers.findIndex((u) => !hasViDiacritics(u.text) && (targetEvidence(u.text, targetLang) || /[a-zA-Z]{2,}/.test(u.text)))
        : scopeMembers.findIndex((u) => hasViDiacritics(u.text) || sourceEvidence(u.text, sourceLang));

      const isBlockLayout =
        transIdx >= 2 &&
        scopeMembers.length - transIdx >= 2 &&
        (firstIsVi
          ? scopeMembers.slice(0, transIdx).every((u) => hasViDiacritics(u.text)) &&
            scopeMembers.slice(transIdx).every((u) => !hasViDiacritics(u.text))
          : scopeMembers.slice(0, transIdx).every((u) => !hasViDiacritics(u.text)) &&
            scopeMembers.slice(transIdx).every((u) => hasViDiacritics(u.text)));

      if (isBlockLayout) {
        const b1 = scopeMembers.slice(0, transIdx);
        const b2 = scopeMembers.slice(transIdx);
        // Step matching within block
        for (const u1 of b1) {
          const s1 = extractItemStepNumber(u1.text);
          if (s1) {
            const u2 = b2.find((cand) => !paired.has(cand.id) && extractItemStepNumber(cand.text) === s1);
            if (u2) addPair(u1, u2);
          }
        }
        // Match unnumbered items by index if equal length
        if (b1.length === b2.length) {
          for (let i = 0; i < b1.length; i++) {
            if (!paired.has(b1[i].id) && !paired.has(b2[i].id)) {
              addPair(b1[i], b2[i]);
            }
          }
        } else {
          const rem1 = b1.filter((u) => !paired.has(u.id));
          const rem2 = b2.filter((u) => !paired.has(u.id));
          // First match sub-headings if present (e.g. *For the eyestay: <-> *Đối với ô dê)
          const h1 = rem1.find((u) => /^\s*\*?\s*(?:for|đối\s*với)\b/i.test(u.text));
          const h2 = rem2.find((u) => /^\s*\*?\s*(?:for|đối\s*với)\b/i.test(u.text));
          if (h1 && h2) {
            addPair(h1, h2);
          }
          const subRem1 = rem1.filter((u) => !paired.has(u.id));
          const subRem2 = rem2.filter((u) => !paired.has(u.id));
          if (subRem1.length === 1 && subRem2.length >= 1) {
            const bestMatch = subRem2.find((u) => u.text.trim().length >= 20) || subRem2[subRem2.length - 1];
            if (bestMatch) addPair(subRem1[0], bestMatch);
          } else {
            const minRem = Math.min(subRem1.length, subRem2.length);
            for (let i = 0; i < minRem; i++) {
              addPair(subRem1[i], subRem2[i]);
            }
          }
        }
      } else {
        // 1. Interleaved adjacent [EN, VI] or [VI, EN] paragraphs within container (1.EN 1.VI or 1.VI 1.EN)
        for (let k = 0; k < scopeMembers.length - 1; k++) {
          const u1 = scopeMembers[k], u2 = scopeMembers[k + 1];
          if (paired.has(u1.id) || paired.has(u2.id)) continue;
          if (isInspectionStatusLabel(u1.text) || isInspectionStatusLabel(u2.text)) continue;

          const s1 = sourceEvidence(u1.text, sourceLang), t1 = targetEvidence(u1.text, targetLang);
          const s2 = sourceEvidence(u2.text, sourceLang), t2 = targetEvidence(u2.text, targetLang);
          const step1 = extractItemStepNumber(u1.text), step2 = extractItemStepNumber(u2.text);
          const sameStep = Boolean(step1 && step2 && step1 === step2);
          const diffStep = Boolean(step1 && step2 && step1 !== step2);
          if (diffStep) continue;
          if (!sameStep && Boolean(step1) !== Boolean(step2)) continue;

          const lenRatio = Math.min(u1.text.trim().length, u2.text.trim().length) / Math.max(u1.text.trim().length, u2.text.trim().length);
          const plausibleLength = lenRatio >= 0.35 || (sameStep && lenRatio >= 0.25);

          if (plausibleLength && ((s1 && t2 && lenRatio >= 0.4) || (sameStep && s1 && !s2))) {
            addPair(u1, u2);
            k++;
          } else if (plausibleLength && ((t1 && s2 && lenRatio >= 0.4) || (sameStep && !s1 && s2))) {
            addPair(u2, u1);
            k++;
          }
        }
      }

      // 2. Existing relationships from memory index
      const sources = scopeMembers.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang));
      const targets = scopeMembers.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang));
      for (const source of sources) {
        if (paired.has(source.id)) continue;
        const relationship = chooseAuditMatch(known.lookup(source.text));
        if (!relationship.match || relationship.conflict) continue;
        const target = targets.find((t) => !paired.has(t.id) && auditTextForms(t.text).compact === auditTextForms(relationship.match!.target).compact);
        if (target) addPair(source, target);
      }

      // 3. Step-number & Block matching within container sub-scope
      // (e.g. all EN items 1,2,3,4 followed by all VI items 1,2,3,4 OR all VI items 1,2,3,4 followed by all EN items 1,2,3,4)
      const remSources = scopeMembers.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang));
      const remTargets = scopeMembers.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang));
      for (const src of remSources) {
        if (paired.has(src.id)) continue;
        const srcStep = extractItemStepNumber(src.text);
        if (srcStep) {
          const matchingTgt = remTargets.find((tgt) => !paired.has(tgt.id) && extractItemStepNumber(tgt.text) === srcStep);
          if (matchingTgt) {
            addPair(src, matchingTgt);
          }
        } else if (remSources.length === remTargets.length && remSources.length >= 2) {
          const idx = remSources.indexOf(src);
          const cand = remTargets[idx];
          if (cand && !paired.has(cand.id)) {
            addPair(src, cand);
          }
        }
      }

      // 4. Unique complementary pair fallback
      const unpairedSources = scopeMembers.filter((u) => !paired.has(u.id) && sourceEvidence(u.text, sourceLang) && !isInspectionStatusLabel(u.text));
      const unpairedTargets = scopeMembers.filter((u) => !paired.has(u.id) && targetEvidence(u.text, targetLang) && !isInspectionStatusLabel(u.text));
      if (unpairedSources.length === 1 && unpairedTargets.length === 1) {
        const s = unpairedSources[0], t = unpairedTargets[0];
        const pairCheck = isSemanticBilingualPair(s.text, t.text, glossary);
        if (pairCheck.isPair) {
          addPair(s, t);
        }
      }
    }
  }

  // 5. Cross-container / Same-slide pairing (Block bilingual layout on the same slide:
  // e.g. Textbox 1 has EN steps 1, 2, 3, 4; Textbox 2 has VI steps 1, 2, 3, 4 or vice-versa)
  const slideUnitsMap = new Map<number, RawUnit[]>();
  for (const unit of extracted.units) {
    const sIdx = unit.location.slideIndex ?? 0;
    if (!slideUnitsMap.has(sIdx)) slideUnitsMap.set(sIdx, []);
    slideUnitsMap.get(sIdx)!.push(unit);
  }



  for (const [, slideUnits] of slideUnitsMap) {
    const isEnSlideUnit = (u: RawUnit) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text) && !isNonTranslatable(u.text) && !hasViDiacritics(u.text) && languageEvidence(u.text).vi.length === 0 && (isPureEnglish(u.text) || languageEvidence(u.text).likelyEnglish);
    const unpairedVi = slideUnits.filter((u) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text) && !isNonTranslatable(u.text) && (hasViDiacritics(u.text) || languageEvidence(u.text).vi.length > 0));
    const unpairedEn = slideUnits.filter(isEnSlideUnit);

    // A. Match by step number on the same slide (e.g. 1.EN with 1.VI, 2.EN with 2.VI...)
    for (const viUnit of unpairedVi) {
      if (paired.has(viUnit.id)) continue;
      const vStep = extractItemStepNumber(viUnit.text);
      if (vStep) {
        const matchingEn = unpairedEn.find((eu) => !paired.has(eu.id) && extractItemStepNumber(eu.text) === vStep);
        if (matchingEn) {
          const pairCheck = isSemanticBilingualPair(viUnit.text, matchingEn.text, glossary);
          if (pairCheck.isPair) {
            addPair(viUnit, matchingEn);
          }
        }
      }
    }

    // A2. Anchored container pairing:
    // When two containers on the same slide already share at least one paired pair (e.g., Step 1 VI <-> Step 1 EN),
    // align their remaining unpaired items in sequential order if they have matching count or structure.
    const slideContainers = new Map<string, RawUnit[]>();
    for (const u of slideUnits) {
      if (!slideContainers.has(u.containerId)) slideContainers.set(u.containerId, []);
      slideContainers.get(u.containerId)!.push(u);
    }

    const containerIds = Array.from(slideContainers.keys());
    for (let i = 0; i < containerIds.length; i++) {
      for (let j = i + 1; j < containerIds.length; j++) {
        const c1 = containerIds[i];
        const c2 = containerIds[j];
        const units1 = slideContainers.get(c1)!;
        const units2 = slideContainers.get(c2)!;

        // Check if c1 and c2 are anchored by an existing pair
        const isAnchored = units1.some((u1) => {
          const partnerId = pairedPartnerId.get(u1.id);
          return partnerId && units2.some((u2) => u2.id === partnerId);
        });

        if (isAnchored) {
          const rem1 = units1.filter((u) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text));
          const rem2 = units2.filter((u) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text));

          if (rem1.length > 0 && rem1.length === rem2.length) {
            for (let k = 0; k < rem1.length; k++) {
              const u1 = rem1[k];
              const u2 = rem2[k];
              const u1IsVi = hasViDiacritics(u1.text) || languageEvidence(u1.text).vi.length > 0;
              const u2IsVi = hasViDiacritics(u2.text) || languageEvidence(u2.text).vi.length > 0;
              if (u1IsVi !== u2IsVi) {
                const src = u1IsVi ? u1 : u2;
                const tgt = u1IsVi ? u2 : u1;
                addPair(src, tgt);
              }
            }
          }
        }
      }
    }

    // B. Match technical process/inspection headings on the same slide
    // (e.g. 'IPQC Stitching Inspection Focuses: Swoosh stitching' with 'Trọng điểm kiểm tra may logo')
    const remViHeadings = slideUnits.filter((u) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text) && (hasViDiacritics(u.text) || languageEvidence(u.text).vi.length > 0) && isHeadingLike(u.text));
    const remEnHeadings = slideUnits.filter((u) => isEnSlideUnit(u) && isHeadingLike(u.text));
    for (const vh of remViHeadings) {
      if (paired.has(vh.id)) continue;
      const matchedEn = remEnHeadings.find((eh) => !paired.has(eh.id) && isSemanticBilingualPair(vh.text, eh.text, glossary).isPair);
      if (matchedEn) {
        addPair(vh, matchedEn);
      }
    }

    // C. Match trailing notes / unnumbered items following step blocks on the same slide
    // (e.g. 'Due to the design...' with 'Do thiết kế phần eo...')
    const hasAnchoredSteps = slideUnits.some((u) => paired.has(u.id) && extractItemStepNumber(u.text));
    if (hasAnchoredSteps) {
      const remViNotes = slideUnits.filter((u) => !paired.has(u.id) && !modelSubScopeUnitIds.has(u.id) && !isInspectionStatusLabel(u.text) && (hasViDiacritics(u.text) || languageEvidence(u.text).vi.length > 0));
      const remEnNotes = slideUnits.filter(isEnSlideUnit);
      for (const vn of remViNotes) {
        if (paired.has(vn.id)) continue;
        const matchedEn = remEnNotes.find((en) => !paired.has(en.id) && isSemanticBilingualPair(vn.text, en.text, glossary).isPair);
        if (matchedEn) {
          addPair(vn, matchedEn);
        }
      }
    }
  }

  // Cross-slide pairing between paired EN and VI slides (Ching Luh SOP Option 1 pairs)
  const slidePartUnits = new Map<string, RawUnit[]>();
  for (const unit of extracted.units) {
    if (unit.location.partPath) {
      if (!slidePartUnits.has(unit.location.partPath)) slidePartUnits.set(unit.location.partPath, []);
      slidePartUnits.get(unit.location.partPath)!.push(unit);
    }
  }
  for (const pair of isqSlidePairs) {
    const enUnits = (slidePartUnits.get(pair.en) || []).filter((u) => !isNonTranslatable(u.text) && !isInspectionStatusLabel(u.text) && !/^\d+(?:[.,]\d+)?$/.test(u.text.trim()) && u.text.trim().length > 1);
    const viUnits = (slidePartUnits.get(pair.vi) || []).filter((u) => !isNonTranslatable(u.text) && !isInspectionStatusLabel(u.text) && !/^\d+(?:[.,]\d+)?$/.test(u.text.trim()) && u.text.trim().length > 1);
    // Match by step number across slides
    for (const vu of viUnits) {
      if (paired.has(vu.id)) continue;
      const vStep = extractItemStepNumber(vu.text);
      if (vStep) {
        const matchingEu = enUnits.find((eu) => !paired.has(eu.id) && extractItemStepNumber(eu.text) === vStep);
        if (matchingEu) {
          const pairCheck = isSemanticBilingualPair(vu.text, matchingEu.text, glossary);
          if (pairCheck.isPair) {
            addPair(vu, matchingEu);
          }
        }
      }
    }
  }
  // Vietnamese already present in the deck also supplies spelling evidence without inventing a source/target relationship.
  if (targetLang === "vi") for (const raw of extracted.units) {
    if (inlineBilingual.has(raw.id) || languageEvidence(raw.text).en.length >= 2 || (!hasViDiacritics(raw.text) && !languageEvidence(raw.text).vi.length)) continue;
    const quality = vietnameseQuality(raw.text);
    pairs.push({ source: "", target: quality.suggestion || raw.text, origin: "presentation", slideIndex: raw.location.slideIndex, targetOnly: true, inferred: Boolean(quality.suggestion) });
  }
  const sourceIndex = new AuditMemoryIndex(pairs), targetIndex = new AuditMemoryIndex(pairs, "target");
  const docTM = options.customDocTM || new DocumentTranslationMemory();
  // Keep existing TM intact. Presentation observations are ESTABLISHED, never falsely APPROVED.
  if (!options.customDocTM) docTM.initializeDocumentTM([], glossary);
  for (const pair of pairs.filter((p) => p.origin === "presentation" && p.source)) docTM.recordTranslation(pair.source, pair.target, { slide: pair.slideIndex }, "DOCUMENT", 0.9, "ESTABLISHED");
  const memo = new Map<string, ReturnType<AuditMemoryIndex["lookup"]>>();
  const decisionMemo = new Map<string, ReturnType<typeof chooseAuditMatch>>();
  const glossaryChecks = new Map<string, ReturnType<typeof checkGlossaryTranslation>>();
  const checkCandidate = (source: string, target: string) => {
    const key = JSON.stringify([source, target]);
    if (!glossaryChecks.has(key)) glossaryChecks.set(key, checkGlossaryTranslation(source, target, glossary, sourceLang, targetLang));
    return glossaryChecks.get(key)!;
  };
  const lookup = (index: AuditMemoryIndex, text: string, field: string) => {
    const key = `${field}:${text}`;
    if (!memo.has(key)) memo.set(key, index.lookup(text));
    return memo.get(key)!;
  };
  const preservedIds = new Set<string>();
  const partToPair = new Map<string, { role: "en" | "vi"; partnerSlide: number; partnerPart: string; pairNum: number }>();
  for (let idx = 0; idx < isqSlidePairs.length; idx++) {
    const pair = isqSlidePairs[idx];
    const enUnits = (slidePartUnits.get(pair.en) || []);
    const viUnits = (slidePartUnits.get(pair.vi) || []);
    const enSlide = enUnits[0]?.location.slideIndex || Number(pair.en.match(/slide(\d+)/)?.[1] || 0);
    const viSlide = viUnits[0]?.location.slideIndex || Number(pair.vi.match(/slide(\d+)/)?.[1] || 0);
    partToPair.set(pair.en, { role: "en", partnerSlide: viSlide, partnerPart: pair.vi, pairNum: idx + 1 });
    partToPair.set(pair.vi, { role: "vi", partnerSlide: enSlide, partnerPart: pair.en, pairNum: idx + 1 });
  }

  const units: ScannedTextUnit[] = extracted.units.map((raw) => {
    const language = languageEvidence(raw.text);
    const base = classifyTextUnit(raw.text, raw.location, { sourceLang, targetLang,
      existingTranslation: paired.has(raw.id) ? paired.get(raw.id) : undefined });
    const unit: ScannedTextUnit = { id: raw.id, sourceText: raw.text, sourceHash: computeSourceHash(raw.text), canonicalText: canonicalizeText(raw.text),
      location: { ...raw.location }, ...base, selectedForTranslation: false, safeToApply: false, canApply: false };

    if (raw.location.partPath && partToPair.has(raw.location.partPath)) {
      const pInfo = partToPair.get(raw.location.partPath)!;
      unit.location.pairedSlideIndex = pInfo.partnerSlide;
      if (pInfo.role === "vi") {
        unit.location.isIsqReference = true;
      }
    }

    if (referencePaths.has(raw.location.partPath!)) {
      preservedIds.add(unit.id);
      unit.status = "ALREADY_TRANSLATED";
      const partnerSlide = unit.location.pairedSlideIndex ? ` (thuộc cặp ISQ với Slide ${unit.location.pairedSlideIndex} EN trên)` : "";
      unit.reason = `Slide tiếng Việt tham chiếu của cặp ISQ${partnerSlide}; giữ nguyên 100% tiếng Việt đối chiếu, không cần dịch lại.`;
      unit.selectedForTranslation = false;
      unit.requiresTranslation = false;
      unit.location.isIsqReference = true;
      if (paired.has(raw.id)) unit.existingTranslation = paired.get(raw.id);
      delete unit.suggestedTranslation;
      return unit;
    }

    // Early guard: Inspection labels and Non-translatable tokens (numbers, acronyms, shoe models)
    if (isInspectionStatusLabel(raw.text) || isNonTranslatable(raw.text)) {
      preservedIds.add(unit.id);
      unit.status = "NON_TRANSLATABLE";
      unit.reason = isInspectionStatusLabel(raw.text)
        ? "Ký hiệu nhãn đánh giá đạt chuẩn (GOOD / NO GOOD / OK / NG); giữ nguyên."
        : isShoeModelName(raw.text)
        ? "Tên model giày, thương hiệu hoặc mã mẫu kỹ thuật; giữ nguyên."
        : "Thuật ngữ kỹ thuật / mã chuẩn / số liệu; giữ nguyên.";
      unit.requiresTranslation = false;
      unit.selectedForTranslation = false;
      if (paired.has(raw.id)) unit.existingTranslation = paired.get(raw.id);
      delete unit.suggestedTranslation;
      return unit;
    }

    if (isEnglishImmunityProtected(raw.text, sourceLang)) {
      preservedIds.add(unit.id);
      unit.status = "ALREADY_TRANSLATED";
      unit.reason = isPureEnglish(raw.text)
        ? "Nội dung đã là tiếng Anh chuẩn; giữ nguyên, không cần dịch lại."
        : "Nội dung đã ở ngôn ngữ đích; giữ nguyên.";
      unit.requiresTranslation = false;
      unit.selectedForTranslation = false;
      if (paired.has(raw.id)) unit.existingTranslation = paired.get(raw.id);
      delete unit.suggestedTranslation;
      return unit;
    }
    const isqSource = isqPaths.has(raw.location.partPath!) && sourceEvidence(raw.text,sourceLang);
    unit.location.isIsq=isqPaths.has(raw.location.partPath!);
    if (paired.has(raw.id)) {
      unit.existingTranslation = paired.get(raw.id);
      const isPureIsqCtq = Boolean(isqSource);
      if (!isPureIsqCtq) {
        preservedIds.add(unit.id);
        unit.status = "ALREADY_TRANSLATED";
        unit.reason = "Đã có bản dịch song ngữ tương ứng trong cùng slide/hộp văn bản.";
        unit.requiresTranslation = false;
        unit.selectedForTranslation = false;
        delete unit.suggestedTranslation;
        return unit;
      }
    }
    if(sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text,"vi") && !paired.has(raw.id) && !inlineBilingual.has(raw.id) && !isBilingualText(raw.text) && unit.status === "ALREADY_TRANSLATED") {
      unit.status="NEEDS_TRANSLATION"; delete unit.suggestedTranslation;
    }
    if (unit.status === "NEEDS_TRANSLATION") unit.reason = "Nội dung có bằng chứng ngôn ngữ nguồn và chưa tìm thấy bản dịch.";
    if (unit.status === "ALREADY_TRANSLATED") unit.reason = paired.has(raw.id) ? "Đã có cặp dịch trong cùng hộp văn bản." : "Nội dung đã ở ngôn ngữ đích.";
    if (isNonTranslatable(raw.text)) {
      delete unit.suggestedTranslation;
      return unit;
    }
    // In VI -> EN repair, existing English is final content. Do not turn casing,
    // wording or historical/glossary variants into a request to edit it again.
    if (sourceLang === "vi" && targetLang === "en" && !sourceEvidence(raw.text,"vi")) {
      preservedIds.add(unit.id); unit.status="ALREADY_TRANSLATED";
      unit.reason=isPureEnglish(raw.text) || language.likelyEnglish ? "Nội dung đã là tiếng Anh; giữ nguyên, không dịch hoặc chỉnh lại." : "Không có bằng chứng tiếng Việt; giữ nguyên, không gợi ý chỉnh sửa.";
      unit.requiresTranslation=false; delete unit.suggestedTranslation; return unit;
    }
    if ((inlineBilingual.has(raw.id) || isBilingualText(raw.text)) && !isqSource) {
      if (options.mode === "replace_en" || options.mode === "isq_duplicate" || unit.location.isIsq) {
        unit.status = "NEEDS_TRANSLATION";
        unit.requiresTranslation = true;
        unit.selectedForTranslation = true;
      } else {
        preservedIds.add(unit.id);
        unit.status = "ALREADY_TRANSLATED";
        unit.reason = "Nội dung đã có sẵn cả tiếng Anh và tiếng Việt trong cùng đoạn văn (song ngữ).";
        unit.requiresTranslation = false;
        unit.selectedForTranslation = false;
        delete unit.suggestedTranslation;
        return unit;
      }
    }
    // A leaked VI history target cannot prove that a VI paragraph is translated.
    const targetMatches = lookup(targetIndex, raw.text, "target").filter(match =>
      !(sourceLang === "vi" && targetLang === "en" && hasViDiacritics(match.target)));
    const targetMatch = [...targetMatches].sort((a, b) => memoryPriority(b.origin) - memoryPriority(a.origin) || Number(Boolean(a.inferred)) - Number(Boolean(b.inferred)) || Number(Boolean(vietnameseQuality(a.target).suggestion)) - Number(Boolean(vietnameseQuality(b.target).suggestion)) || b.confidence - a.confidence)[0];
    if (targetMatch && targetMatch.confidence >= AUDIT_CONFIDENCE.variant && (targetLang !== "vi" || hasViDiacritics(targetMatch.target))) {
      unit.matches = targetMatches.filter((match) => !match.inferred).slice(0, 5);
      if (raw.text.normalize("NFC") !== targetMatch.target.normalize("NFC")) {
        unit.status = "SUSPICIOUS_TRANSLATION"; unit.suggestedTranslation = targetMatch.target; unit.confidence = targetMatch.confidence;
        unit.reason = "Biến thể gần với bản dịch đã dùng: kiểm tra dấu, cách viết hoặc khoảng trắng.";
        if (targetLang === "vi") {
          const quality = vietnameseQuality(raw.text);
          unit.suspiciousSegments = quality.segments;
          if (targetMatch.inferred) {
            unit.reason = "Có cụm tiếng Việt có thể thiếu/sai dấu hoặc dính chữ; cần kiểm tra trước khi sửa.";
            unit.confidence = 0.86;
          }
        }
        unit.safeToApply = raw.text.replace(/\s+/g, " ").trim() === targetMatch.target.replace(/\s+/g, " ").trim();
      } else { unit.status = "ALREADY_TRANSLATED"; unit.reason = "Khớp với bản dịch đã có."; }
    } else if (targetLang === "vi" && (hasViDiacritics(raw.text) || language.vi.length)) {
      const quality = vietnameseQuality(raw.text);
      if (quality.suggestion) {
        unit.status = "SUSPICIOUS_TRANSLATION"; unit.suggestedTranslation = quality.suggestion; unit.suspiciousSegments = quality.segments; unit.confidence = 0.86;
        unit.reason = "Có cụm tiếng Việt có thể thiếu/sai dấu hoặc dính chữ; cần kiểm tra trước khi sửa.";
      } else if (language.en.length >= 2 && !paired.has(raw.id)) {
        unit.status = "MIXED_LANGUAGE"; unit.reason = "Có cụm tiếng Anh trong nội dung tiếng Việt; cần xem ngữ cảnh."; unit.confidence = 0.83;
      } else { unit.status = "ALREADY_TRANSLATED"; }
    } else if (!paired.has(raw.id)) {
      // Check conditional prefix pattern: *Đối với <Model> / *Áp dụng cho <Model> / *Dành cho <Model>
      // Rule: Translate prefix -> "For", shoe model name stays as-is, never binds model into glossary!
      const doiVoiAuditMatch = raw.text.match(/^(\s*\*?\s*)(?:đối\s*với|áp\s*dụng\s*cho|dành\s*cho)\s+(.+)$/i);
      const isModelNote = doiVoiAuditMatch && !hasViDiacritics(doiVoiAuditMatch[2].trim()) && (isShoeModelName(doiVoiAuditMatch[2].trim()) || /^[A-Z0-9\-\/\.\s\(\)\'\"\#\:\,]+$/i.test(doiVoiAuditMatch[2].trim()));

      const modelAuditMatch = !isModelNote && raw.text.match(/^(\s*\*?\s*)(?:model|mẫu)\s*[:：\-]\s*(.+)$/i);
      const isModelLabel = modelAuditMatch && !hasViDiacritics(modelAuditMatch[2].trim()) && (isShoeModelName(modelAuditMatch[2].trim()) || /^[A-Z0-9\-\/\.\s\(\)\'\"\#\:\,]+$/i.test(modelAuditMatch[2].trim()));

      if (isModelNote) {
        const prefix = doiVoiAuditMatch![1].includes("*") ? "*For " : "For ";
        const remainder = doiVoiAuditMatch![2].trim();
        unit.suggestedTranslation = prefix + remainder;
        unit.status = "LOCKED_TERMINOLOGY";
        unit.safeToApply = true;
        unit.canApply = true;
        unit.confidence = 1.0;
        unit.reason = "Dịch tiền tố điều kiện thành 'For' theo quy chuẩn động (tên model giày giữ nguyên).";
        unit.glossaryCorrections = [{ sourceTerm: "Đối với", expectedTarget: "For" }];
      } else if (isModelLabel) {
        const prefix = modelAuditMatch![1].includes("*") ? "*Model: " : "Model: ";
        const remainder = modelAuditMatch![2].trim();
        unit.suggestedTranslation = prefix + remainder;
        unit.status = "LOCKED_TERMINOLOGY";
        unit.safeToApply = true;
        unit.canApply = true;
        unit.confidence = 1.0;
        unit.reason = "Quy chuẩn tiêu đề Model (tên model giữ nguyên).";
      } else {
        const rawMatches = lookup(sourceIndex, raw.text, "source");
        const enforceGlossary = sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text, sourceLang);
        const checked = enforceGlossary ? rawMatches.map(match => ({ match, check: checkCandidate(raw.text, match.target) })) : [];
        // Historical source similarity says nothing about glossary compliance.
        // Exclude unresolved targets before choosing, comparing or exposing a suggestion.
        const matches = enforceGlossary ? checked.filter(({ check }) => check.isValid && !hasViDiacritics(check.text)).map(({ match, check }) => ({ ...match, target: check.text })) : rawMatches;
        if (!decisionMemo.has(raw.text)) decisionMemo.set(raw.text, chooseAuditMatch(matches));
        const decision = decisionMemo.get(raw.text)!;
        if (decision.match) {
          unit.matches = matches.slice(0, 5); unit.confidence = decision.match.confidence;
          const prefix = raw.text.match(/^\s*(?:[\*•\#]|[-–—]\s+|\d{1,3}[.)]\s*)/)?.[0] || "";
          unit.suggestedTranslation = prefix && !decision.match.target.startsWith(prefix.trim()) ? prefix + decision.match.target : decision.match.target;
          unit.safeToApply = decision.safe;
          unit.status = decision.conflict ? "TRANSLATION_CONFLICT" : decision.safe ? decision.match.origin === "approved" ? "LOCKED_TERMINOLOGY" : "TM_REUSE" : "POSSIBLE_TRANSLATION";
          unit.reason = decision.conflict ? "Có nhiều bản dịch phù hợp; cần chọn theo ngữ cảnh." : decision.match.origin === "approved" ? "Bản dịch từ thuật ngữ đã duyệt." : decision.match.origin === "review" ? "Bản dịch từ thuật ngữ trong Glossary Review." : decision.match.origin === "correction" ? "Bản dịch đã được người dùng chỉnh sửa và lưu." : decision.match.origin === "presentation" ? "Tìm thấy bản dịch trong PowerPoint hiện tại." : "Tìm thấy bản dịch trong tài liệu trước; cần xác nhận.";
          if (enforceGlossary) {
          const selectedCheck = checked.find(({ check }) => check.isValid && check.text === decision.match!.target)?.check;
          if (selectedCheck?.corrections.length) {
            unit.glossaryCorrections = selectedCheck.corrections.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
            unit.reason += " Đã sửa theo glossary: " + unit.glossaryCorrections.map(c => `${c.sourceTerm} → ${c.expectedTarget}`).join("; ") + ".";
          }
          if (!decision.safe) unit.confidence = Math.min(unit.confidence, 0.85);
        }
      } else if (checked.some(({ check }) => !check.isValid || hasViDiacritics(check.text))) {
        unit.glossaryMismatches = [...new Map(checked.flatMap(({ check }) => check.mismatches).map(m => [m.sourceTerm, { sourceTerm: m.sourceTerm, expectedTarget: m.expectedTarget }])).values()];
        unit.status = "REVIEW_REQUIRED"; unit.confidence = 0.6;
        delete unit.suggestedTranslation;
        unit.reason = unit.glossaryMismatches.length
          ? "Bản dịch lưu chưa tuân thủ glossary; cần dịch lại với thuật ngữ: " + unit.glossaryMismatches.map(m => `${m.sourceTerm} → ${m.expectedTarget}`).join("; ") + "."
          : "Bản dịch lưu còn tiếng Việt; cần dịch lại sang tiếng Anh.";
      } else if (sourceLang === "en" && targetLang === "vi" && !language.likelyEnglish) {
        unit.status = "REVIEW_REQUIRED"; unit.reason = "Chưa đủ bằng chứng ngôn ngữ; có thể là tên, mã hoặc tiếng Việt không dấu."; unit.confidence = 0.5;
      } else if (sourceLang === "en" && targetLang === "vi" && auditTextForms(raw.text).tokens.length === 1) {
        unit.status = "REVIEW_REQUIRED"; unit.reason = "Từ đơn cần ngữ cảnh để chọn nghĩa phù hợp."; unit.confidence = 0.6;
      } else if (sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text, sourceLang) && !isInspectionStatusLabel(raw.text) && !isShoeModelName(raw.text)) {
        const matchedGlossary = matchTerminology(raw.text, glossary);
        if (matchedGlossary.length > 0) {
          const airgapped = new AirGappedTranslationProvider();
          const translated = airgapped.translateVietnameseToEnglish(raw.text, glossary);
          const enforced = enforceTerminologyCompliance(raw.text, translated, glossary, sourceLang, targetLang);
          const candidate = cleanTargetTerm(enforced.text);
          if (candidate && !hasViDiacritics(candidate) && candidate.toLowerCase() !== raw.text.toLowerCase()) {
            unit.suggestedTranslation = candidate;
            unit.status = "NEEDS_TRANSLATION";
            unit.confidence = 0.85;
            unit.safeToApply = true;
            unit.canApply = !raw.readOnly && canReplaceParagraphText(raw.xml, candidate);
            const matchedTermsStr = [...new Set(matchedGlossary.map((m) => `${m.entry.sourceTerm} → ${cleanTargetTerm(m.entry.targetTerm)}`))].join("; ");
            unit.reason = "Gợi ý dịch sử dụng thuật ngữ từ Glossary Review: " + matchedTermsStr + ".";
            if (enforced.replacements.length) {
              unit.glossaryCorrections = enforced.replacements.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
            }
          }
        }
      }
      }
    }
    // Also guard target-variant suggestions: corrupt history can contain VI
    // targets and otherwise bypass the source-memory branch above.
    if (sourceLang === "vi" && targetLang === "en" && sourceEvidence(raw.text, sourceLang) && unit.suggestedTranslation) {
      const checked = checkCandidate(raw.text, unit.suggestedTranslation);
      if (!checked.isValid || hasViDiacritics(checked.text)) {
        unit.glossaryMismatches = checked.mismatches.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
        delete unit.suggestedTranslation; unit.safeToApply = false; unit.status = "REVIEW_REQUIRED"; unit.confidence = 0.6;
        unit.reason = unit.glossaryMismatches.length
          ? "Gợi ý chưa tuân thủ glossary; cần dịch lại: " + unit.glossaryMismatches.map(m => `${m.sourceTerm} → ${m.expectedTarget}`).join("; ") + "."
          : "Gợi ý còn tiếng Việt; cần dịch lại sang tiếng Anh.";
      } else {
        unit.suggestedTranslation = checked.text;
        if (checked.corrections.length) {
          unit.glossaryCorrections = checked.corrections.map(({ sourceTerm, expectedTarget }) => ({ sourceTerm, expectedTarget }));
          unit.reason += " Đã sửa theo glossary: " + unit.glossaryCorrections.map(c => `${c.sourceTerm} → ${c.expectedTarget}`).join("; ") + ".";
        }
      }
    }
    if (!["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status) && unit.suggestedTranslation && unit.suggestedTranslation !== raw.text) {
      unit.canApply = !raw.readOnly && canReplaceParagraphText(raw.xml, unit.suggestedTranslation);
    }
    unit.safeToApply = Boolean(unit.safeToApply && unit.canApply);
    // A candidate in memory is not a translation already present in the file.
    // Include unresolved source text even when history disagrees or a glossary
    // suggestion exists; the translator resolves trusted mappings and translates
    // conflicts afresh instead of choosing an arbitrary historical candidate.
    unit.requiresTranslation = isqSource || !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(unit.status) && sourceEvidence(raw.text, sourceLang);
    if(isqSource && unit.status === "ALREADY_TRANSLATED")unit.status=unit.existingTranslation?"TM_REUSE":"MIXED_LANGUAGE";
    unit.selectedForTranslation = unit.requiresTranslation && !raw.readOnly && canTranslateParagraphText(raw.xml);
    if (isqSource) {unit.reason += " ISQ: xuất slide EN riêng, slide VI ở ngay sau.";unit.canApply=false;}
    if (unit.requiresTranslation && !unit.selectedForTranslation) unit.reason += raw.readOnly ? " Ghi chú/SmartArt cần chỉnh thủ công." : " Cần chỉnh thủ công để giữ định dạng hoặc ngắt dòng.";
    if (unit.status !== "SUSPICIOUS_TRANSLATION" && unit.suggestedTranslation && unit.suggestedTranslation.trim().toLowerCase() === raw.text.trim().toLowerCase()) {
      delete unit.suggestedTranslation;
    }
    return unit;
  });
  const groups = buildGroups(units, pairs, preservedIds);
  // Consistency suggestions may change after grouping.
  const rawById = new Map(extracted.units.map((r) => [r.id, r]));
  for (const unit of units) {
    const raw = rawById.get(unit.id)!;
    if (unit.status === "TRANSLATION_CONFLICT" && unit.suggestedTranslation) {
      unit.canApply = !raw.readOnly && canReplaceParagraphText(raw.xml, unit.suggestedTranslation);
    }
    if(unit.location.isIsq && unit.requiresTranslation){unit.canApply=false;unit.safeToApply=false;}
  }
  const count = (status: ScannedTextUnit["status"]) => units.filter((u) => u.status === status).length;
  const pending = units.filter((u) => u.status === "NEEDS_TRANSLATION");
  const translatableMissing = units.filter((u) => u.selectedForTranslation);
  const slidePairs: import("./smart-detector").SlidePairSummary[] = [];
  for (const pair of isqSlidePairs) {
    const enUnits = slidePartUnits.get(pair.en) || [];
    const viUnits = slidePartUnits.get(pair.vi) || [];
    const enSlide = enUnits[0]?.location.slideIndex || Number(pair.en.match(/slide(\d+)/)?.[1] || 0);
    const viSlide = viUnits[0]?.location.slideIndex || Number(pair.vi.match(/slide(\d+)/)?.[1] || 0);
    const enTitle = enUnits.find((u) => u.text.trim())?.text || "";
    const viTitle = viUnits.find((u) => u.text.trim())?.text || "";
    slidePairs.push({
      enSlide,
      viSlide,
      enPath: pair.en,
      viPath: pair.vi,
      enTitle,
      viTitle,
      status: "auto",
      itemCount: viUnits.length,
    });
  }
  const uniquePending = new Set(translatableMissing.filter((u) => !u.safeToApply && !["TM_REUSE", "LOCKED_TERMINOLOGY"].includes(u.status)).map((u) => u.canonicalText));
  return { fileName, fileType: "pptx", totalUnits: units.length, totalSlides: extracted.slides,
    alreadyTranslatedCount: count("ALREADY_TRANSLATED"), needsTranslationCount: pending.length, tmReusableCount: count("TM_REUSE"), lockedTerminologyCount: count("LOCKED_TERMINOLOGY"),
    untranslatedCount: units.filter((u) => u.requiresTranslation).length, translatableMissingCount: translatableMissing.length,
    nonTranslatableCount: count("NON_TRANSLATABLE"), mixedLanguageCount: count("MIXED_LANGUAGE"), possibleTranslationCount: count("POSSIBLE_TRANSLATION"), reviewRequiredCount: count("REVIEW_REQUIRED"),
    suspiciousTranslationCount: count("SUSPICIOUS_TRANSLATION"), translationConflictCount: count("TRANSLATION_CONFLICT"),
    attentionCount: groups.filter((g) => !g.safeToApply).length, safeFixCount: units.filter((u) => u.safeToApply).length,
    affectedSlides: [...new Set(units.filter((u) => !["ALREADY_TRANSLATED", "NON_TRANSLATABLE"].includes(u.status)).map((u) => u.location.slideIndex!))].sort((a, b) => a - b),
    estimatedGeminiRequests: Math.ceil(uniquePending.size / 25), units, groups, slidePairs, visualLayouts: extracted.visualLayouts };
}

/** Re-scan on the server and apply only the selected suggestions. Duplicates ISQ slides into EN and VI pairs. */
export async function applyPptxAuditSuggestions(buffer: Buffer, fileName: string, unitIds: string[], options: ScanOptions = {}) {
  const report = await scanPptxTranslationIntelligence(buffer, fileName, options);
  const requested = new Set(unitIds);
  const selected = report.units.filter((u) => requested.has(u.id));
  if (options.customTranslations) {
    for (const unit of selected) {
      if (typeof options.customTranslations[unit.id] === "string" && options.customTranslations[unit.id].trim()) {
        unit.suggestedTranslation = options.customTranslations[unit.id].trim();
        unit.canApply = true;
      }
    }
  }
  if (!selected.length || selected.length !== requested.size || selected.some((u) => (!u.canApply && !u.location.isIsq && !options.customTranslations?.[u.id]) || !u.suggestedTranslation)) {
    throw new Error("Một số gợi ý không còn hợp lệ hoặc cần chỉnh sửa thủ công để giữ định dạng. Hãy quét lại.");
  }
  if (options.expectedSuggestions) {
    const expected = new Map(options.expectedSuggestions.map((u) => [u.id, u]));
    if (selected.some((u) => expected.get(u.id)?.sourceText !== u.sourceText || expected.get(u.id)?.suggestedTranslation !== u.suggestedTranslation)) {
      throw new Error("Gợi ý đã thay đổi kể từ lúc xem trước. Hãy quét lại.");
    }
  }
  const zip = await JSZip.loadAsync(buffer);
  const defaultViMode = options.viRefAction || "duplicate";

  // Check which VI reference slides should be duplicated vs overwritten
  const viRefSlidesToDuplicate = new Set<string>();
  for (const u of selected) {
    if (u.location.isIsqReference && u.location.partPath) {
      const sIndex = u.location.slideIndex || 0;
      const handling = options.slideViHandling?.[sIndex] || defaultViMode;
      if (handling === "duplicate") {
        viRefSlidesToDuplicate.add(u.location.partPath);
      }
    }
  }

  // Duplicate VI reference slides where user chose "duplicate"
  let viToEnMap = new Map<string, string>();
  if (viRefSlidesToDuplicate.size > 0) {
    viToEnMap = await duplicateViReferenceSlides(zip, viRefSlidesToDuplicate);
  }

  // Identify normal ISQ slides to duplicate (skip if user explicitly chose "overwrite")
  const isqSlideParts = new Set<string>();
  if (options.mode !== "replace_en") {
    for (const u of report.units) {
      if (u.location.isIsq && u.location.partPath && !u.location.isIsqReference && !viRefSlidesToDuplicate.has(u.location.partPath)) {
        const sIndex = u.location.slideIndex || 0;
        const handling = options.slideViHandling?.[sIndex] || defaultViMode;
        if (handling !== "overwrite") {
          isqSlideParts.add(u.location.partPath);
        }
      }
    }
  }

  // Duplicate ISQ slides into 2 slides (Slide EN on top, Slide VI original below)
  let duplicatedPairs: import("../documents/pptx-slide-order").IsqSlidePair[] = [];
  if (isqSlideParts.size > 0) {
    duplicatedPairs = await duplicateIsqSlides(zip, isqSlideParts);
  }
  const isqEnPaths = new Set([
    ...duplicatedPairs.map((p) => p.en),
    ...Array.from(viToEnMap.values()),
  ]);

  const byPart = new Map<string, Map<number, ScannedTextUnit>>();
  for (const unit of selected) {
    const origPart = unit.location.partPath!;
    const targetPart = (unit.location.isIsqReference && viToEnMap.has(origPart))
      ? viToEnMap.get(origPart)!
      : origPart;
    if (!byPart.has(targetPart)) byPart.set(targetPart, new Map());
    byPart.get(targetPart)!.set(unit.location.paragraphIndex!, unit);
  }
  for (const [part, replacements] of byPart) {
    const xml = await zip.file(part)!.async("string");
    let index = 0;
    const result = xml.replace(new RegExp(PPTX_PARAGRAPH_PATTERN), (pXml) => {
      const unit = replacements.get(index++);
      if (!unit) return pXml;
      if (paragraphText(pXml).trim() !== unit.sourceText) throw new Error("Nội dung đã thay đổi; hãy quét lại trước khi áp dụng.");
      const overrideFontSizePt = options.customFontSizes?.[unit.id];
      return replaceParagraphTranslation(pXml, unit.suggestedTranslation!, unit.sourceText, overrideFontSizePt);
    });
    zip.file(part, result);
  }

  // On top English ISQ slides: strip paired Vietnamese counterparts & residual Vietnamese runs
  for (const enPath of isqEnPaths) {
    let enXml = await zip.file(enPath)?.async("string");
    if (!enXml) continue;
    const slideReportUnits = report.units.filter((u) => u.location.partPath === enPath);
    const selectedIndices = new Set(selected.filter((u) => u.location.partPath === enPath).map((u) => u.location.paragraphIndex));
    const viParagraphsWithEn = new Set(
      slideReportUnits
        .filter((u) => !selectedIndices.has(u.location.paragraphIndex) && u.existingTranslation && !hasViDiacritics(u.existingTranslation) && hasViDiacritics(u.sourceText))
        .map((u) => u.location.paragraphIndex)
    );
    if (viParagraphsWithEn.size > 0) {
      let pIdx = 0;
      enXml = enXml.replace(new RegExp(PPTX_PARAGRAPH_PATTERN), (p) => (viParagraphsWithEn.has(pIdx++) ? "" : p));
    }
    zip.file(enPath, enXml);
  }

  const rawBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const postFlight = await auditAndRepairPptxPostFlight(rawBuffer, (options.mode || "ipqc_bilingual") as any);

  // Compute remaining unhandled Vietnamese units and their slide locations
  const allViUnits = report.units.filter((u) => u.requiresTranslation || isVietnameseText(u.sourceText));
  const appliedIds = new Set(selected.map((u) => u.id));
  const unhandled = allViUnits.filter((u) => !appliedIds.has(u.id));
  const unhandledSlides = [...new Set(unhandled.map((u) => u.location.slideIndex || 1))].sort((a, b) => a - b);

  return {
    buffer: postFlight.auditedBuffer,
    appliedCount: selected.length,
    unhandledCount: unhandled.length,
    unhandledSlides,
    postFlightPassed: postFlight.passed,
    postFlightIssues: postFlight.issues,
  };
}
