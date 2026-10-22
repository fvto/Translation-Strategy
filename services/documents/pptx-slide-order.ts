import type JSZip from "jszip";
import { extractNumericParameters } from "../translation/vietnamese-detector";
import { AirGappedTranslationProvider } from "../translation/offline";

export const ISQ_PAIRS_PART = "customXml/smart-audit-isq-pairs.xml";
export interface IsqSlidePair { en: string; vi: string }
const VI_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

function extractSlideStep(texts: string[]): string | null {
  const steps: string[] = [];
  for (const t of texts.slice(0, 8)) {
    // Matches "1.", "1.1", "1 -", "1.EN", "1.VI", "1-EN", "Step 1", "Bước 1", "CTQ 1", "SOP 1", "Trạm 1", "Item 1"
    const m = t.match(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*(\d+(?:\.\d+)?)|#?\s*(\d+(?:\.\d+)?)\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)\b))/i);
    if (m) steps.push(m[1] || m[2]);
    const m2 = t.match(/\b(\d+(?:\.\d+)?)\s*[._-]?\s*(?:EN|VI|VN)\b/i);
    if (m2) steps.push(m2[1]);
  }
  // If a slide lists multiple distinct steps (e.g. CTQ 1 AND CTQ 2), it is an overview/agenda slide!
  const uniqueSteps = Array.from(new Set(steps));
  if (uniqueSteps.length > 1) return null;
  return uniqueSteps[0] || null;
}

function hasExplicitEnMarker(texts: string[]): boolean {
  return texts.slice(0, 6).some((t) => /\b(?:\d+[._-]?)?EN\b/i.test(t) || /\[EN\]|\(EN\)/i.test(t));
}

function hasExplicitViMarker(texts: string[]): boolean {
  return texts.slice(0, 6).some((t) => /\b(?:\d+[._-]?)?(?:VI|VN)\b/i.test(t) || /\[VI\]|\(VI\)/i.test(t));
}

export interface SlideProfile {
  path: string;
  slideIndex: number;
  viCount: number;
  enCount: number;
  totalTexts: number;
  viRatio: number;
  enRatio: number;
  stepNumber: string | null;
  hasEnMarker: boolean;
  hasViMarker: boolean;
  title1?: string;
  title2?: string;
  viLong: number;
  enLong: number;
  texts: string[];
}

/**
 * Deduces whether Slide A (EN) and Slide B (VI) are genuinely a bilingual counterpart pair
 * by deeply analyzing the actual slide content, technical measurements, component domain entities,
 * and semantic operations.
 */
export function deduceSlideContentBilingualPair(
  enSlide: SlideProfile,
  viSlide: SlideProfile
): { isPair: boolean; confidence: number; reason: string } {
  // 1. Explicit Step Conflict: If both declare step numbers, they must match
  if (enSlide.stepNumber && viSlide.stepNumber && enSlide.stepNumber !== viSlide.stepNumber) {
    return {
      isPair: false,
      confidence: 0,
      reason: `Số thứ tự bước không khớp (EN: bước ${enSlide.stepNumber}, VI: bước ${viSlide.stepNumber}).`
    };
  }

  const allEn = enSlide.texts.join(" ").toLowerCase();
  const allVi = viSlide.texts.join(" ").toLowerCase();

  // 2. Component Conflict Check (Physical positions on the footwear upper/sole)
  const enHasHeel = allEn.includes("heel");
  const enHasToe = allEn.includes("toe") || allEn.includes("tip");
  const viHasGót = allVi.includes("gót") || allVi.includes("hậu");
  const viHasMũi = allVi.includes("mũi");

  if (enHasHeel && !enHasToe && viHasMũi && !viHasGót) {
    return {
      isPair: false,
      confidence: 0,
      reason: "Xung đột vị trí chi tiết giày: Slide EN chuyên về Gót (Heel), Slide VI chuyên về Mũi (Toe)."
    };
  }
  if (enHasToe && !enHasHeel && viHasGót && !viHasMũi) {
    return {
      isPair: false,
      confidence: 0,
      reason: "Xung đột vị trí chi tiết giày: Slide EN chuyên về Mũi (Toe), Slide VI chuyên về Gót (Heel)."
    };
  }

  // 3. Manufacturing Department / Process Stage Conflict Check
  const isEnCutting = allEn.includes("cutting") && !allEn.includes("after cutting");
  const isViCutting = (allVi.includes("chặt") || allVi.includes("cutting")) && !allVi.includes("sau khi chặt");
  const isEnAssembly = allEn.includes("assembly") || allEn.includes("lasting") || allEn.includes("bpm") || allEn.includes("gò");
  const isViAssembly = allVi.includes("thành hình") || allVi.includes("lắp ráp") || allVi.includes("gò") || allVi.includes("bpm");
  const isEnStitching = allEn.includes("stitching") || allEn.includes("sewing");
  const isViStitching = allVi.includes("may") && !allVi.includes("may mắn");

  if ((isEnCutting && !isViCutting && (isViAssembly || isViStitching)) ||
      (isViCutting && !isEnCutting && (isEnAssembly || isEnStitching)) ||
      (isEnAssembly && !isViAssembly && (isViCutting || isViStitching)) ||
      (isViAssembly && !isEnAssembly && (isEnCutting || isEnStitching))) {
    return {
      isPair: false,
      confidence: 0,
      reason: "Xung đột bộ phận/công đoạn sản xuất (Cutting vs Stitching vs Assembly)."
    };
  }

  // 4. Technical Measurements / Tolerances Consistency
  const extractSpecNumbers = (texts: string[]) => {
    return texts
      .flatMap((t) => extractNumericParameters(t))
      .filter((n) => !["1", "2", "3", "4", "5"].includes(n));
  };

  const numEn = Array.from(new Set(extractSpecNumbers(enSlide.texts)));
  const numVi = Array.from(new Set(extractSpecNumbers(viSlide.texts)));

  const hasStepMatch = Boolean(enSlide.stepNumber && viSlide.stepNumber && enSlide.stepNumber === viSlide.stepNumber);
  const hasExplicitMarker = Boolean(enSlide.hasEnMarker && viSlide.hasViMarker);

  if (numEn.length >= 2 && numVi.length >= 1 && !hasStepMatch && !hasExplicitMarker) {
    const shared = numEn.filter((n) => numVi.includes(n));
    if (shared.length === 0) {
      return {
        isPair: false,
        confidence: 0,
        reason: `Thông số kỹ thuật không tương thích: EN có [${numEn.join(", ")}], VI có [${numVi.join(", ")}], không có thông số chung.`
      };
    }
  }

  // 5. Semantic Content Overlap via Translation Probe
  const offline = new AirGappedTranslationProvider();
  const probeEn = offline.translateVietnameseToEnglish(allVi, []).toLowerCase();

  const STOP_WORDS = new Set([
    "inspection", "strategy", "focuses", "focus", "standard", "standards",
    "manual", "procedure", "process", "check", "make", "sure", "before", "after",
    "must", "slide", "title", "step", "presentation", "company", "ching", "luh",
    "nike", "points", "shoe", "upper", "line", "into", "when", "just", "with",
    "from", "that", "this", "have", "been", "will", "need", "follow", "sample",
    "stop", "result", "results", "adjustment", "grade", "weekly", "completely",
    "time", "temperature", "pressure", "degree", "unit", "units", "pairs", "pair"
  ]);

  const extractContentTokens = (text: string) => {
    return text
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  };

  const enTokens = Array.from(new Set(extractContentTokens(allEn)));
  const probeTokens = Array.from(new Set(extractContentTokens(probeEn)));

  const sharedWords = probeTokens.filter((pw) => enTokens.some((ew) => ew.includes(pw) || pw.includes(ew)));
  const overlapRatio = probeTokens.length > 0 ? sharedWords.length / probeTokens.length : 0;

  if (overlapRatio < 0.22 && !hasStepMatch && !hasExplicitMarker) {
    return {
      isPair: false,
      confidence: overlapRatio,
      reason: `Độ tương đồng ngữ nghĩa nội dung quá thấp (${Math.round(overlapRatio * 100)}%), không phản ánh cùng một quy trình thao tác.`
    };
  }

  return {
    isPair: true,
    confidence: Math.max(overlapRatio, hasStepMatch ? 0.9 : 0.6),
    reason: `Nội dung tương đồng (${Math.round(overlapRatio * 100)}%), từ vựng và thao tác kỹ thuật phù hợp.`
  };
}

export async function detectDynamicSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const ordered = await orderedSlidePaths(zip);
  if (ordered.length < 2) return [];

  const profiles: SlideProfile[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const path = ordered[i];
    const xml = (await zip.file(path)?.async("string")) || "";
    const texts = Array.from(xml.matchAll(/<a:t\b[^>]*>(.*?)<\/a:t>/gs), (m) => m[1].trim()).filter(Boolean);
    const viCount = texts.filter((t) => VI_DIACRITICS_REGEX.test(t)).length;
    const enCount = texts.filter((t) => !VI_DIACRITICS_REGEX.test(t) && /[a-zA-Z]{2,}/.test(t)).length;
    const totalTexts = texts.length;
    const viLong = texts.filter((t) => VI_DIACRITICS_REGEX.test(t) && t.trim().length >= 25).length;
    const enLong = texts.filter((t) => !VI_DIACRITICS_REGEX.test(t) && /[a-zA-Z]{2,}/.test(t) && t.trim().length >= 25).length;
    const title1 = (texts[0] || "").trim().toLowerCase();
    const title2 = (texts[1] || "").trim().toLowerCase();
    profiles.push({
      path,
      slideIndex: i + 1,
      viCount,
      enCount,
      totalTexts,
      viRatio: totalTexts > 0 ? viCount / totalTexts : 0,
      enRatio: totalTexts > 0 ? enCount / totalTexts : 0,
      stepNumber: extractSlideStep(texts),
      hasEnMarker: hasExplicitEnMarker(texts),
      hasViMarker: hasExplicitViMarker(texts),
      title1,
      title2,
      viLong,
      enLong,
      texts,
    });
  }

  const rawCandidatePairs: { en: string; vi: string }[] = [];
  const pairedPaths = new Set<string>();

  const isEnSlide = (s: SlideProfile) => {
    if (s.hasEnMarker && !s.hasViMarker) return true;
    if (s.enLong >= 2 && s.enLong > s.viLong * 2) return true;
    return (s.viCount === 0 && (s.enRatio >= 0.20 || s.enCount >= 1)) ||
      (s.enCount > s.viCount && (s.viCount <= 1 || s.viRatio < 0.25));
  };

  const isViSlide = (s: SlideProfile) => {
    if (s.hasViMarker && !s.hasEnMarker) return true;
    if (s.viLong >= 2 && s.viLong > s.enLong) return true;
    return (s.viCount >= 1 && (s.viRatio >= 0.20 || s.viCount >= s.enCount)) ||
      (s.viCount >= 2);
  };

  const checkDeduction = (enS: SlideProfile, viS: SlideProfile) => {
    const res = deduceSlideContentBilingualPair(enS, viS);
    if (!res.isPair) {
      console.log(`[SlidePairDeduction] Không ghép cặp ${enS.path} (EN) và ${viS.path} (VI): ${res.reason}`);
    }
    return res.isPair;
  };

  // 1. Interleaved adjacent pairs [1.EN, 1.VI], [2.EN, 2.VI] or [1.VI, 1.EN], [2.VI, 2.EN]
  for (let i = 0; i < profiles.length - 1; i++) {
    const curr = profiles[i];
    const next = profiles[i + 1];
    if (pairedPaths.has(curr.path) || pairedPaths.has(next.path)) continue;

    const stepMatch = Boolean(curr.stepNumber && next.stepNumber && curr.stepNumber === next.stepNumber);
    const diffStep = Boolean(curr.stepNumber && next.stepNumber && curr.stepNumber !== next.stepNumber);
    if (diffStep) continue;

    const isGenericBanner = (t?: string) =>
      Boolean(t && /\b(?:assembly\s*inspection\s*strategy|inspection\s*strategy|chiến\s*lược\s*kiểm\s*tra|standard\s*operating\s*procedure|ipqc\s*manual|qa\/?ipqc\s*manual)\b/i.test(t));

    const sameMainTitle = Boolean(
      curr.title1 &&
      next.title1 &&
      !isGenericBanner(curr.title1) &&
      !isGenericBanner(next.title1) &&
      (curr.title1 === next.title1 || curr.title1.includes(next.title1) || next.title1.includes(curr.title1))
    );
    const sameSubTitle = Boolean(
      curr.title2 &&
      next.title2 &&
      !isGenericBanner(curr.title2) &&
      !isGenericBanner(next.title2) &&
      curr.title2 === next.title2
    );
    const titleTopicMatch = Boolean(
      ((sameMainTitle && curr.title1 && curr.title1.length >= 8) || (sameSubTitle && curr.title2 && curr.title2.length >= 8)) &&
      ((curr.enLong >= 2 && next.viLong >= 2) || (curr.viLong >= 2 && next.enLong >= 2))
    );

    const currIsEn = isEnSlide(curr);
    const nextIsVi = isViSlide(next);
    const currIsVi = isViSlide(curr);
    const nextIsEn = isEnSlide(next);
    const explicitMarker = (curr.hasEnMarker && next.hasViMarker) || (curr.hasViMarker && next.hasEnMarker);
    const hasTitleOrMarker = sameMainTitle || sameSubTitle || titleTopicMatch || explicitMarker;

    if (currIsEn && nextIsVi && (stepMatch || explicitMarker || titleTopicMatch) && hasTitleOrMarker) {
      if (checkDeduction(curr, next)) {
        rawCandidatePairs.push({ en: curr.path, vi: next.path });
        pairedPaths.add(curr.path);
        pairedPaths.add(next.path);
        i++;
      }
    } else if (currIsVi && nextIsEn && (stepMatch || explicitMarker || titleTopicMatch) && hasTitleOrMarker) {
      if (checkDeduction(next, curr)) {
        rawCandidatePairs.push({ en: next.path, vi: curr.path });
        pairedPaths.add(curr.path);
        pairedPaths.add(next.path);
        i++;
      }
    } else if (stepMatch && hasTitleOrMarker && (curr.viCount < next.viCount) && currIsEn && nextIsVi) {
      if (checkDeduction(curr, next)) {
        rawCandidatePairs.push({ en: curr.path, vi: next.path });
        pairedPaths.add(curr.path);
        pairedPaths.add(next.path);
        i++;
      }
    } else if (stepMatch && hasTitleOrMarker && (curr.viCount > next.viCount) && currIsVi && nextIsEn) {
      if (checkDeduction(next, curr)) {
        rawCandidatePairs.push({ en: next.path, vi: curr.path });
        pairedPaths.add(curr.path);
        pairedPaths.add(next.path);
        i++;
      }
    }
  }

  // Accept interleaved pairs if:
  // - at least 2 pairs found, OR
  // - 1 pair found in a small deck (<= 4 slides), OR
  // - pairs cover >= 40% of the entire presentation
  if (
    rawCandidatePairs.length >= 2 ||
    (rawCandidatePairs.length === 1 && profiles.length <= 4) ||
    (rawCandidatePairs.length * 2 >= profiles.length * 0.4)
  ) {
    return rawCandidatePairs;
  }

  // 2. Global Cross-Distance Deductive Matching (handles distant blocks like 3x-4x VI and 5x-6x EN, reordered slides, or arbitrary distances)
  const remainingVi = profiles.filter((s) => !pairedPaths.has(s.path) && isViSlide(s));
  const remainingEn = profiles.filter((s) => !pairedPaths.has(s.path) && isEnSlide(s));

  if (remainingVi.length > 0 && remainingEn.length > 0) {
    interface ScoredCandidatePair {
      en: SlideProfile;
      vi: SlideProfile;
      score: number;
      reason: string;
    }

    const isGenericBanner = (t?: string) =>
      Boolean(t && /\b(?:assembly\s*inspection\s*strategy|inspection\s*strategy|chiến\s*lược\s*kiểm\s*tra|standard\s*operating\s*procedure|ipqc\s*manual|qa\/?ipqc\s*manual)\b/i.test(t));

    const candidates: ScoredCandidatePair[] = [];

    for (const enS of remainingEn) {
      for (const viS of remainingVi) {
        if (enS.path === viS.path) continue;

        // Run deep content reasoning
        const deduction = deduceSlideContentBilingualPair(enS, viS);
        if (!deduction.isPair) continue;

        let score = Math.round(deduction.confidence * 100);

        // Step number match
        const stepMatch = Boolean(enS.stepNumber && viS.stepNumber && enS.stepNumber === viS.stepNumber);
        if (stepMatch) score += 60;

        // Explicit EN/VI markers
        const explicitMarker = Boolean(enS.hasEnMarker && viS.hasViMarker);
        if (explicitMarker) score += 40;

        // Title match
        const sameMainTitle = Boolean(
          enS.title1 && viS.title1 && !isGenericBanner(enS.title1) && !isGenericBanner(viS.title1) &&
          (enS.title1 === viS.title1 || enS.title1.includes(viS.title1) || viS.title1.includes(enS.title1))
        );
        const sameSubTitle = Boolean(
          enS.title2 && viS.title2 && !isGenericBanner(enS.title2) && !isGenericBanner(viS.title2) &&
          enS.title2 === viS.title2
        );
        if (sameMainTitle || sameSubTitle) score += 35;

        // Technical parameters match
        const extractSpecNumbers = (texts: string[]) =>
          texts.flatMap((t) => extractNumericParameters(t)).filter((n) => !["1", "2", "3", "4", "5"].includes(n));
        const numEn = Array.from(new Set(extractSpecNumbers(enS.texts)));
        const numVi = Array.from(new Set(extractSpecNumbers(viS.texts)));
        const sharedSpecs = numEn.filter((n) => numVi.includes(n));
        if (sharedSpecs.length > 0) score += 25;

        // Small adjacency tie-breaker if close
        if (Math.abs(enS.slideIndex - viS.slideIndex) === 1) score += 10;

        candidates.push({
          en: enS,
          vi: viS,
          score,
          reason: deduction.reason
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Greedy bipartite assignment
    const assignedEn = new Set<string>();
    const assignedVi = new Set<string>();
    const distantPairs: IsqSlidePair[] = [];

    for (const cand of candidates) {
      if (assignedEn.has(cand.en.path) || assignedVi.has(cand.vi.path)) continue;
      // Minimum confidence threshold
      if (cand.score >= 45) {
        assignedEn.add(cand.en.path);
        assignedVi.add(cand.vi.path);
        distantPairs.push({ en: cand.en.path, vi: cand.vi.path });
      }
    }

    if (distantPairs.length > 0) {
      distantPairs.sort((a, b) => {
        const aIdx = Number(a.vi.match(/slide(\d+)/)?.[1] || 0);
        const bIdx = Number(b.vi.match(/slide(\d+)/)?.[1] || 0);
        return aIdx - bIdx;
      });
      return [...rawCandidatePairs, ...distantPairs];
    }
  }

  return rawCandidatePairs.length > 0 ? rawCandidatePairs : [];
}

export async function readExplicitIsqSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const xml =
    (await zip.file(ISQ_PAIRS_PART)?.async("string")) ||
    (await zip.file(`ppt/${ISQ_PAIRS_PART}`)?.async("string")) ||
    (await zip.file("customXml/pairs.xml")?.async("string")) ||
    (await zip.file("ppt/customXml/pairs.xml")?.async("string")) ||
    "";
  return Array.from(
    xml.matchAll(/<pair en="(ppt\/slides\/slide\d+\.xml)" vi="(ppt\/slides\/slide\d+\.xml)"\/>/g),
    (m) => ({ en: m[1], vi: m[2] })
  ).filter((p) => zip.file(p.en) && zip.file(p.vi));
}

export async function readIsqSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const xmlPairs = await readExplicitIsqSlidePairs(zip);
  const dynamicPairs = await detectDynamicSlidePairs(zip);
  if (xmlPairs.length === 0) return dynamicPairs;

  const seenPaths = new Set<string>();
  for (const p of xmlPairs) {
    seenPaths.add(p.en);
    seenPaths.add(p.vi);
  }

  const merged = [...xmlPairs];
  for (const dp of dynamicPairs) {
    if (!seenPaths.has(dp.en) && !seenPaths.has(dp.vi)) {
      merged.push(dp);
      seenPaths.add(dp.en);
      seenPaths.add(dp.vi);
    }
  }

  return merged;
}
export async function orderedSlidePaths(zip: JSZip): Promise<string[]> {
  const presentation = await zip.file("ppt/presentation.xml")?.async("string") || "";
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string") || "";
  const targets = new Map<string,string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id=m[0].match(/\bId="([^"]+)"/)?.[1], target=m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target || !/\bType="[^"]*\/slide"/.test(m[0]) || /TargetMode="External"/.test(m[0])) continue;
    const part=target.startsWith('/')?target.slice(1):`ppt/${target.replace(/^\.\//,'')}`;
    if(/^ppt\/slides\/slide\d+\.xml$/.test(part) && zip.file(part)) targets.set(id,part);
  }
  const ordered=Array.from(presentation.matchAll(/<p:sldId\b[^>]*>/g),m => targets.get(m[0].match(/\br:id="([^"]+)"/)?.[1] || "")).filter((p):p is string=>!!p);
  return ordered.length ? ordered : Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a,b)=>Number(a.match(/slide(\d+)/)![1])-Number(b.match(/slide(\d+)/)![1]));
}

/**
 * Parses user-provided slide ranges like "1-5, 8, 10-12" into an array of 1-based slide numbers.
 */
export function parseSlideRange(rangeStr: string, maxSlides: number = 9999): number[] {
  if (!rangeStr || !rangeStr.trim()) return [];
  const indices = new Set<number>();
  // Normalize whitespace around hyphens e.g. "10 - 12" -> "10-12"
  const normalized = rangeStr.replace(/\s*-\s*/g, "-");
  const parts = normalized.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxSlides, Math.max(start, end));
        for (let i = min; i <= max; i++) {
          indices.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxSlides) {
        indices.add(num);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Duplicates specified ISQ slides in OpenXML package so that each slide becomes a pair:
 * 1. Top slide (en): targets English translation (residual VI removed).
 * 2. Bottom slide (vi): retains 100% original Vietnamese intact.
 *
 * Updates presentation.xml (<p:sldIdLst>), presentation.xml.rels, [Content_Types].xml,
 * and records pairs in ISQ_PAIRS_PART.
 */
export async function duplicateIsqSlides(
  zip: JSZip,
  targetSlidePaths: Set<string>
): Promise<IsqSlidePair[]> {
  const existingPairs = await readIsqSlidePairs(zip);
  const viReferencePaths = new Set(existingPairs.map((p) => p.vi));
  const existingEnPaths = new Set(existingPairs.map((p) => p.en));
  const newPairs = [...existingPairs];

  let presXml = await zip.file("ppt/presentation.xml")?.async("string");
  let relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  let contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  if (!presXml || !relsXml || !contentTypesXml) return existingPairs;

  const sldEntries = Array.from(
    presXml.matchAll(/<p:sldId\b[^>]*>/g)
  ).map((m) => {
    const fullTag = m[0];
    const idMatch = fullTag.match(/\bid="(\d+)"/);
    const rIdMatch = fullTag.match(/\br:id="([^"]+)"/);
    return {
      fullTag,
      id: idMatch ? parseInt(idMatch[1], 10) : 0,
      rId: rIdMatch ? rIdMatch[1] : "",
    };
  }).filter((s) => s.id > 0 && s.rId !== "");

  if (sldEntries.length === 0) return existingPairs;

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
  let didDuplicate = false;

  for (let i = 0; i < sldEntries.length; i++) {
    const orig = sldEntries[i];
    const targetFile = relTargetMap.get(orig.rId) || `slides/slide${i + 1}.xml`;
    const origSlidePath = targetFile.startsWith("ppt/") ? targetFile : `ppt/${targetFile}`;

    pairedEntries.push(orig.fullTag);

    // Skip if already a VI reference or already duplicated
    if (viReferencePaths.has(origSlidePath)) continue;
    if (existingEnPaths.has(origSlidePath)) continue;

    // Check if this slide needs duplication
    if (!targetSlidePaths.has(origSlidePath)) continue;

    let newSlideNum = 1000 + i + 1;
    while (zip.file(`ppt/slides/slide${newSlideNum}.xml`)) newSlideNum++;
    const newSlideTarget = `slides/slide${newSlideNum}.xml`;
    const newSlidePath = `ppt/${newSlideTarget}`;

    // 1. Copy slide XML (keeps original Vietnamese intact)
    const slideData = await zip.file(origSlidePath)?.async("nodebuffer");
    if (!slideData) continue;
    zip.file(newSlidePath, slideData);
    newPairs.push({ en: origSlidePath, vi: newSlidePath });

    // 2. Copy slide rels if exists (stripping notesSlide & comments to prevent 1-to-many relationship collision in PowerPoint)
    const origRelPath = origSlidePath.replace("slides/", "slides/_rels/") + ".rels";
    const relDataStr = await zip.file(origRelPath)?.async("string");
    if (relDataStr) {
      const cleanRelXml = relDataStr.replace(
        /<Relationship\b[^>]*Type="[^"]*(?:\/notesSlide|\/comments)"[^>]*\/>/g,
        ""
      );
      const newRelPath = newSlidePath.replace("slides/", "slides/_rels/") + ".rels";
      zip.file(newRelPath, cleanRelXml);
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

    // Insert duplicated slide immediately following original slide
    pairedEntries.push(`<p:sldId id="${newSldId}" r:id="${newRId}"/>`);
    didDuplicate = true;
  }

  if (didDuplicate) {
    zip.file(
      ISQ_PAIRS_PART,
      `<?xml version="1.0" encoding="UTF-8"?><pairs xmlns="urn:smart-audit:isq-pairs">${newPairs
        .map((p) => `<pair en="${p.en}" vi="${p.vi}"/>`)
        .join("")}</pairs>`
    );
    if (!existingPairs.length) {
      maxRId++;
      newRels.push(
        `<Relationship Id="rId${maxRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${ISQ_PAIRS_PART}"/>`
      );
      newOverrides.push(`<Override PartName="/${ISQ_PAIRS_PART}" ContentType="application/xml"/>`);
    }

    relsXml = relsXml.replace("</Relationships>", `${newRels.join("")}</Relationships>`);
    presXml = presXml.replace(
      /<p:sldIdLst\b[^>]*>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\b[^>]*\/>/,
      `<p:sldIdLst>${pairedEntries.join("")}</p:sldIdLst>`
    );
    contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);

    zip.file("ppt/_rels/presentation.xml.rels", relsXml);
    zip.file("ppt/presentation.xml", presXml);
    zip.file("[Content_Types].xml", contentTypesXml);
  }

  return newPairs;
}

/**
 * Duplicates specific VI reference slides into EN + VI pairs.
 * The new slide becomes the EN slide positioned immediately BEFORE the VI reference slide.
 * The original VI reference slide remains 100% intact.
 * Returns a mapping of viSlidePath -> newEnSlidePath.
 */
export async function duplicateViReferenceSlides(
  zip: JSZip,
  targetViPaths: Set<string>
): Promise<Map<string, string>> {
  const viToEnMap = new Map<string, string>();
  if (!targetViPaths || !targetViPaths.size) return viToEnMap;

  let presXml = await zip.file("ppt/presentation.xml")?.async("string");
  let relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  let contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  if (!presXml || !relsXml || !contentTypesXml) return viToEnMap;

  const existingPairs = await readIsqSlidePairs(zip);
  const newPairs = [...existingPairs];

  const sldEntries = Array.from(
    presXml.matchAll(/<p:sldId\b[^>]*>/g)
  ).map((m) => {
    const fullTag = m[0];
    const idMatch = fullTag.match(/\bid="(\d+)"/);
    const rIdMatch = fullTag.match(/\br:id="([^"]+)"/);
    return {
      fullTag,
      id: idMatch ? parseInt(idMatch[1], 10) : 0,
      rId: rIdMatch ? rIdMatch[1] : "",
    };
  }).filter((s) => s.id > 0 && s.rId !== "");

  if (sldEntries.length === 0) return viToEnMap;

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
  let didDuplicate = false;

  for (let i = 0; i < sldEntries.length; i++) {
    const orig = sldEntries[i];
    const targetFile = relTargetMap.get(orig.rId) || `slides/slide${i + 1}.xml`;
    const origSlidePath = targetFile.startsWith("ppt/") ? targetFile : `ppt/${targetFile}`;

    // If this is one of our target VI reference slides, create the EN slide immediately BEFORE it
    if (targetViPaths.has(origSlidePath)) {
      let newSlideNum = 1000 + i + 1;
      while (zip.file(`ppt/slides/slide${newSlideNum}.xml`)) newSlideNum++;
      const newSlideTarget = `slides/slide${newSlideNum}.xml`;
      const newSlidePath = `ppt/${newSlideTarget}`;

      // 1. Copy slide XML to new EN slide
      const slideData = await zip.file(origSlidePath)?.async("nodebuffer");
      if (slideData) {
        zip.file(newSlidePath, slideData);

        // 2. Copy slide rels if exists (stripping notesSlide & comments to prevent 1-to-many relationship collision in PowerPoint)
        const origRelPath = origSlidePath.replace("slides/", "slides/_rels/") + ".rels";
        const relDataStr = await zip.file(origRelPath)?.async("string");
        if (relDataStr) {
          const cleanRelXml = relDataStr.replace(
            /<Relationship\b[^>]*Type="[^"]*(?:\/notesSlide|\/comments)"[^>]*\/>/g,
            ""
          );
          const newRelPath = newSlidePath.replace("slides/", "slides/_rels/") + ".rels";
          zip.file(newRelPath, cleanRelXml);
        }

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

        // Insert new EN slide immediately BEFORE original VI reference slide
        pairedEntries.push(`<p:sldId id="${newSldId}" r:id="${newRId}"/>`);
        viToEnMap.set(origSlidePath, newSlidePath);
        newPairs.push({ en: newSlidePath, vi: origSlidePath });
        didDuplicate = true;
      }
    }

    pairedEntries.push(orig.fullTag);
  }

  if (didDuplicate) {
    zip.file(
      ISQ_PAIRS_PART,
      `<?xml version="1.0" encoding="UTF-8"?><pairs xmlns="urn:smart-audit:isq-pairs">${newPairs
        .map((p) => `<pair en="${p.en}" vi="${p.vi}"/>`)
        .join("")}</pairs>`
    );
    if (!existingPairs.length) {
      maxRId++;
      newRels.push(
        `<Relationship Id="rId${maxRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${ISQ_PAIRS_PART}"/>`
      );
      newOverrides.push(`<Override PartName="/${ISQ_PAIRS_PART}" ContentType="application/xml"/>`);
    }

    relsXml = relsXml.replace("</Relationships>", `${newRels.join("")}</Relationships>`);
    presXml = presXml.replace(
      /<p:sldIdLst\b[^>]*>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\b[^>]*\/>/,
      `<p:sldIdLst>${pairedEntries.join("")}</p:sldIdLst>`
    );
    contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);

    zip.file("ppt/_rels/presentation.xml.rels", relsXml);
    zip.file("ppt/presentation.xml", presXml);
    zip.file("[Content_Types].xml", contentTypesXml);
  }

  return viToEnMap;
}


