import { PptxSlideData, PptxParagraph, PptxTranslationMode, hasViDiacritics, isPureEnglish } from "./pptx-translator";

export type DynamicZoneType =
  | "IPQC_TABLE"
  | "SECTION_DIVIDER"
  | "ISQ_VI_BLOCK"
  | "ISQ_EN_BLOCK"
  | "STANDARD";

export interface DynamicSlideProfile {
  slideIndex: number;
  slideFileName: string;
  title: string;
  hasTable: boolean;
  totalTexts: number;
  viCount: number;
  enCount: number;
  viRatio: number;
  enRatio: number;
  isDivider: boolean;
  isIsq: boolean;
  isPostHfpa?: boolean;
}

export interface DynamicZone {
  zoneType: DynamicZoneType;
  startSlideIndex: number;
  endSlideIndex: number;
  slideCount: number;
}

export interface DynamicZonePlan {
  totalSlides: number;
  zones: DynamicZone[];
  hasParallelSections: boolean;
  targetSlideModes: Map<number, "ipqc_bilingual" | "replace_en" | "keep_original">;
}

/**
 * Dynamic Deck Structure Detector
 * 
 * Inspects any arbitrary presentation dynamically without hardcoding slide ranges.
 * Identifies:
 * 1. IPQC table sections (bilingual inspection grids)
 * 2. Section divider slides (cover pages/transitions)
 * 3. Pre-existing parallel ISQ sections (VI reference vs EN target)
 * 
 * Guarantees:
 * - Slide count is preserved (86 input slides -> exactly 86 output slides).
 * - Zero duplicated slides on pre-partitioned decks.
 */
export class DynamicDeckDetector {
  /**
   * Profiles an individual slide based on its extracted paragraph data and OpenXML features.
   */
  profileSlide(
    slide: PptxSlideData,
    rawXml?: string,
    fileName?: string,
    isPostHfpa?: boolean
  ): DynamicSlideProfile {
    const texts = slide.paragraphs
      .map((p) => p.originalText.trim())
      .filter(Boolean);

    const totalTexts = texts.length;
    let viCount = 0;
    let enCount = 0;

    for (const t of texts) {
      if (hasViDiacritics(t)) {
        viCount++;
      } else if (isPureEnglish(t)) {
        enCount++;
      }
    }

    const viRatio = totalTexts > 0 ? viCount / totalTexts : 0;
    const enRatio = totalTexts > 0 ? enCount / totalTexts : 0;

    const hasTable = rawXml ? /<a:tbl\b/i.test(rawXml) : false;

    // Check for Section Divider / Cover slide:
    // Has very few text tags (<= 5), no large tables, and short title/season code
    const title = (slide.title || "").trim();
    const isDivider =
      totalTexts <= 5 &&
      !hasTable &&
      (/^(FA|SU|SP|HO)\d{2}\b/i.test(title) ||
        /\b(section|chương|phần|quy\s*trình|process|tiêu\s*chuẩn|manual)\b/i.test(title));

    // Check if slide matches ISQ / CTQ / CTP criteria
    let isIsq = false;
    if (fileName) {
      const lowerFile = fileName.toLowerCase();
      if (
        (/\b(isq|in-station\s*quality)\b/i.test(lowerFile) && !/\bipqc\b/i.test(lowerFile)) ||
        /(cutting\s*dies?\s*manual|sổ\s*tay\s*khuôn\s*dao)/i.test(lowerFile)
      ) {
        isIsq = true;
      }
    }

    if (!isIsq) {
      isIsq =
        /\b(isq|ctq|ctp|critical\s*to\s*(quality|process)|in-station\s*quality)\b/i.test(title) ||
        /(cutting\s*dies?\s*manual|sổ\s*tay\s*khuôn\s*dao)/i.test(title) ||
        slide.paragraphs.some((p) =>
          /\b(isq|ctq|ctp|critical\s*to\s*(quality|process)|translate\s+for\s+isq|\bfor\s+isq\b|\bisq\s+manual\b|in-station\s*quality)\b/i.test(p.originalText)
        );
    }

    // Post-HFPA Inspection Strategy / Focuses sections:
    // User requirement: Starting after HFPA Inspection Strategy, Cutting Inspection Strategy
    // and Inspection strategy slides are treated like ISQ (1 slide EN on top, 1 slide VI below; no EN on top VI below in-place).
    if (!isIsq && isPostHfpa) {
      const allText = (title + " " + slide.paragraphs.map((p) => p.originalText).join(" ")).toLowerCase();
      if (
        /\b(?:cutting\s+)?inspection\s+strategy\b/i.test(allText) ||
        /\binspection\s+focuses?\b/i.test(allText) ||
        /\bipqc\s+cutting\s+inspection\b/i.test(allText) ||
        /\bchiến\s*lược\s*(?:kiểm\s*tra|chặt)\b/i.test(allText)
      ) {
        isIsq = true;
      }
    }

    return {
      slideIndex: slide.slideIndex,
      slideFileName: slide.slideFileName,
      title,
      hasTable,
      totalTexts,
      viCount,
      enCount,
      viRatio,
      enRatio,
      isDivider,
      isIsq,
      isPostHfpa,
    };
  }

  /**
   * Analyzes an entire presentation and returns a dynamic zone plan.
   * Completely avoids hardcoded slide indices.
   */
  detectZones(
    slides: PptxSlideData[],
    slideXmlMap?: Map<string, string>,
    requestedMode: PptxTranslationMode = "ipqc_bilingual",
    fileName?: string
  ): DynamicZonePlan {
    const totalSlides = slides.length;

    // Detect the last slide containing HFPA Inspection Strategy
    let lastHfpaIndex = -1;
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const xml = slideXmlMap?.get(s.slideFileName) || "";
      // Fix #9: Strip XML tags before regex so "HFPA" is detected even when it's split
      // across multiple <a:r> text runs (e.g. <a:t>HF</a:t><a:t>PA</a:t>).
      const xmlText = xml.replace(/<[^>]+>/g, " ");
      const text = (s.title + " " + s.paragraphs.map((p) => p.originalText).join(" ")).toLowerCase();
      if (/\bhfpa\b/i.test(text) || /\bhfpa\b/i.test(xmlText)) {
        lastHfpaIndex = i;
      }
    }

    const profiles: DynamicSlideProfile[] = slides.map((s, idx) => {
      const xml = slideXmlMap?.get(s.slideFileName);
      const isPostHfpa = requestedMode !== "replace_en" && lastHfpaIndex !== -1 && idx > lastHfpaIndex;
      return this.profileSlide(s, xml, fileName, isPostHfpa);
    });

    // 1. Detect if the deck has pre-existing parallel ISQ sections:
    // A pre-split deck has a substantial block of Vietnamese ISQ slides (viRatio >= 0.40)
    // AND a SUBSEQUENT block of pure English target slides (viRatio <= 0.05 && enRatio >= 0.60)
    const viIsqSlides = profiles.filter((p) => !p.isDivider && p.isIsq && p.viRatio >= 0.4);
    const enIsqSlides = profiles.filter((p) => !p.isDivider && p.isIsq && p.viRatio <= 0.05 && p.enRatio >= 0.6);

    const hasParallelSections =
      viIsqSlides.length >= 5 &&
      enIsqSlides.length >= 5 &&
      Math.abs(viIsqSlides.length - enIsqSlides.length) <= 10 &&
      Math.min(...enIsqSlides.map((s) => s.slideIndex)) > Math.max(...viIsqSlides.map((s) => s.slideIndex));

    // 2. Classify each slide into dynamic zones
    const zones: DynamicZone[] = [];
    let currentZone: DynamicZone | null = null;

    for (const p of profiles) {
      let zoneType: DynamicZoneType = "STANDARD";

      if (p.isDivider) {
        zoneType = "SECTION_DIVIDER";
      } else if (!p.isPostHfpa && p.hasTable && p.totalTexts > 15) {
        // Pre-HFPA inspection tables take strict priority over loose text matches!
        zoneType = "IPQC_TABLE";
      } else if (p.isIsq) {
        if (p.viRatio <= 0.05 && p.enRatio >= 0.6) {
          zoneType = "ISQ_EN_BLOCK";
        } else if (p.viRatio >= 0.35) {
          zoneType = "ISQ_VI_BLOCK";
        } else {
          zoneType = "STANDARD";
        }
      } else if (p.hasTable && p.totalTexts > 30) {
        zoneType = "IPQC_TABLE";
      }

      if (!currentZone || currentZone.zoneType !== zoneType) {
        if (currentZone) {
          zones.push(currentZone);
        }
        currentZone = {
          zoneType,
          startSlideIndex: p.slideIndex,
          endSlideIndex: p.slideIndex,
          slideCount: 1,
        };
      } else {
        currentZone.endSlideIndex = p.slideIndex;
        currentZone.slideCount++;
      }
    }

    if (currentZone) {
      zones.push(currentZone);
    }

    // 3. Map target translation mode per slide index
    const targetSlideModes = new Map<number, "ipqc_bilingual" | "replace_en" | "keep_original">();

    for (const p of profiles) {
      if (requestedMode === "replace_en") {
        // In replace_en mode, user wants pure English everywhere without duplication
        targetSlideModes.set(p.slideIndex, "replace_en");
        continue;
      }

      if (hasParallelSections) {
        if (p.isDivider) {
          targetSlideModes.set(p.slideIndex, "keep_original");
        } else if (p.isIsq) {
          if (p.viRatio >= 0.35) {
            // Pre-existing Vietnamese ISQ reference block kept as-is
            targetSlideModes.set(p.slideIndex, "keep_original");
          } else {
            // Target English ISQ block translated in-place
            targetSlideModes.set(p.slideIndex, "replace_en");
          }
        } else {
          // IPQC tables & standard inspection focuses: bilingual
          targetSlideModes.set(p.slideIndex, "ipqc_bilingual");
        }
      } else {
        // Monolithic deck
        if (p.isDivider) {
          targetSlideModes.set(p.slideIndex, "keep_original");
        } else if (p.isIsq && (requestedMode === "ipqc_bilingual" || requestedMode === "isq_duplicate")) {
          // In Ching Luh Option 1 (unified SOP):
          // ISQ slides are translated to pure English (replace_en) for the top slide,
          // while duplicateDeck generates the paired Vietnamese original slide below.
          targetSlideModes.set(p.slideIndex, "replace_en");
        } else {
          targetSlideModes.set(p.slideIndex, requestedMode === "isq_duplicate" ? "replace_en" : requestedMode);
        }
      }
    }

    return {
      totalSlides,
      zones,
      hasParallelSections,
      targetSlideModes,
    };
  }
}

export const dynamicDeckDetector = new DynamicDeckDetector();
