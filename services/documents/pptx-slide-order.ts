import type JSZip from "jszip";
export const ISQ_PAIRS_PART = "customXml/smart-audit-isq-pairs.xml";
export interface IsqSlidePair { en: string; vi: string }
const VI_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

export async function detectDynamicSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const ordered = await orderedSlidePaths(zip);
  if (ordered.length < 2) return [];

  interface SlideProfile {
    path: string;
    slideIndex: number;
    viCount: number;
    enCount: number;
    totalTexts: number;
    viRatio: number;
    enRatio: number;
  }

  const profiles: SlideProfile[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const path = ordered[i];
    const xml = (await zip.file(path)?.async("string")) || "";
    const texts = Array.from(xml.matchAll(/<a:t\b[^>]*>(.*?)<\/a:t>/gs), (m) => m[1].trim()).filter(Boolean);
    const viCount = texts.filter((t) => VI_DIACRITICS_REGEX.test(t)).length;
    const enCount = texts.filter((t) => !VI_DIACRITICS_REGEX.test(t) && /[a-zA-Z]{2,}/.test(t)).length;
    const totalTexts = texts.length;
    profiles.push({
      path,
      slideIndex: i + 1,
      viCount,
      enCount,
      totalTexts,
      viRatio: totalTexts > 0 ? viCount / totalTexts : 0,
      enRatio: totalTexts > 0 ? enCount / totalTexts : 0,
    });
  }

  const rawCandidatePairs: { en: string; vi: string }[] = [];
  const pairedPaths = new Set<string>();

  // 1. Interleaved adjacent pairs [EN, VI] or [VI, EN]
  for (let i = 0; i < profiles.length - 1; i++) {
    const curr = profiles[i];
    const next = profiles[i + 1];
    if (pairedPaths.has(curr.path) || pairedPaths.has(next.path)) continue;

    const currIsEn = curr.viCount === 0 && (curr.enRatio >= 0.25 || curr.enCount >= 2);
    const nextIsVi = next.viCount >= 2;
    const currIsVi = curr.viCount >= 2;
    const nextIsEn = next.viCount === 0 && (next.enRatio >= 0.25 || next.enCount >= 2);

    if (currIsEn && nextIsVi) {
      rawCandidatePairs.push({ en: curr.path, vi: next.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
    } else if (currIsVi && nextIsEn) {
      rawCandidatePairs.push({ en: next.path, vi: curr.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
    }
  }

  // An alternating paired presentation (Option 1) must have at least 3 alternating pairs
  if (rawCandidatePairs.length >= 3) {
    return rawCandidatePairs;
  }

  // 2. Parallel block pairs (e.g. block of VI slides, followed by block of EN slides)
  const viSlides = profiles.filter((s) => !pairedPaths.has(s.path) && (s.viCount >= 2 || s.viRatio >= 0.2));
  const enSlides = profiles.filter((s) => !pairedPaths.has(s.path) && s.viCount === 0 && (s.enRatio >= 0.25 || s.enCount >= 2));
  if (viSlides.length >= 3 && enSlides.length >= 3 && Math.abs(viSlides.length - enSlides.length) <= 5) {
    const pairs: IsqSlidePair[] = [];
    const minLen = Math.min(viSlides.length, enSlides.length);
    for (let k = 0; k < minLen; k++) {
      pairs.push({ en: enSlides[k].path, vi: viSlides[k].path });
    }
    return pairs;
  }

  return [];
}

export async function readIsqSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const xml = (await zip.file(ISQ_PAIRS_PART)?.async("string")) || "";
  const xmlPairs = Array.from(
    xml.matchAll(/<pair en="(ppt\/slides\/slide\d+\.xml)" vi="(ppt\/slides\/slide\d+\.xml)"\/>/g),
    (m) => ({ en: m[1], vi: m[2] })
  ).filter((p) => zip.file(p.en) && zip.file(p.vi));
  if (xmlPairs.length > 0) return xmlPairs;
  return detectDynamicSlidePairs(zip);
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

