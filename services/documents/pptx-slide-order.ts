import type JSZip from "jszip";
export const ISQ_PAIRS_PART = "customXml/smart-audit-isq-pairs.xml";
export interface IsqSlidePair { en: string; vi: string }
const VI_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

function extractSlideStep(texts: string[]): string | null {
  for (const t of texts.slice(0, 6)) {
    // Matches "1.", "1.1", "1 -", "1.EN", "1.VI", "1-EN", "Step 1", "Bước 1", "CTQ 1", "SOP 1", "Trạm 1", "Item 1"
    const m = t.match(/^\s*(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*(\d+(?:\.\d+)?)|#?\s*(\d+(?:\.\d+)?)\s*(?:[.:\-\/)]|\s*(?:en|vi|vn)\b))/i);
    if (m) return m[1] || m[2];
    const m2 = t.match(/\b(\d+(?:\.\d+)?)\s*[._-]?\s*(?:EN|VI|VN)\b/i);
    if (m2) return m2[1];
  }
  return null;
}

function hasExplicitEnMarker(texts: string[]): boolean {
  return texts.slice(0, 6).some((t) => /\b(?:\d+[._-]?)?EN\b/i.test(t) || /\[EN\]|\(EN\)/i.test(t));
}

function hasExplicitViMarker(texts: string[]): boolean {
  return texts.slice(0, 6).some((t) => /\b(?:\d+[._-]?)?(?:VI|VN)\b/i.test(t) || /\[VI\]|\(VI\)/i.test(t));
}

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
    stepNumber: string | null;
    hasEnMarker: boolean;
    hasViMarker: boolean;
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
      stepNumber: extractSlideStep(texts),
      hasEnMarker: hasExplicitEnMarker(texts),
      hasViMarker: hasExplicitViMarker(texts),
    });
  }

  const rawCandidatePairs: { en: string; vi: string }[] = [];
  const pairedPaths = new Set<string>();

  const isEnSlide = (s: SlideProfile) => {
    if (s.hasEnMarker && !s.hasViMarker) return true;
    return (s.viCount === 0 && (s.enRatio >= 0.20 || s.enCount >= 1)) ||
      (s.enCount > s.viCount && (s.viCount <= 1 || s.viRatio < 0.25));
  };

  const isViSlide = (s: SlideProfile) => {
    if (s.hasViMarker && !s.hasEnMarker) return true;
    return (s.viCount >= 1 && (s.viRatio >= 0.20 || s.viCount >= s.enCount)) ||
      (s.viCount >= 2);
  };

  // 1. Interleaved adjacent pairs [1.EN, 1.VI], [2.EN, 2.VI] or [1.VI, 1.EN], [2.VI, 2.EN]
  for (let i = 0; i < profiles.length - 1; i++) {
    const curr = profiles[i];
    const next = profiles[i + 1];
    if (pairedPaths.has(curr.path) || pairedPaths.has(next.path)) continue;

    const stepMatch = Boolean(curr.stepNumber && next.stepNumber && curr.stepNumber === next.stepNumber);
    const diffStep = Boolean(curr.stepNumber && next.stepNumber && curr.stepNumber !== next.stepNumber);
    if (diffStep) continue;

    const currIsEn = isEnSlide(curr);
    const nextIsVi = isViSlide(next);
    const currIsVi = isViSlide(curr);
    const nextIsEn = isEnSlide(next);
    const explicitMarker = (curr.hasEnMarker && next.hasViMarker) || (curr.hasViMarker && next.hasEnMarker);

    if ((currIsEn && nextIsVi && (stepMatch || explicitMarker)) || (stepMatch && curr.hasEnMarker && next.hasViMarker)) {
      rawCandidatePairs.push({ en: curr.path, vi: next.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
    } else if ((currIsVi && nextIsEn && (stepMatch || explicitMarker)) || (stepMatch && curr.hasViMarker && next.hasEnMarker)) {
      rawCandidatePairs.push({ en: next.path, vi: curr.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
    } else if (stepMatch && (curr.viCount < next.viCount)) {
      rawCandidatePairs.push({ en: curr.path, vi: next.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
    } else if (stepMatch && (curr.viCount > next.viCount)) {
      rawCandidatePairs.push({ en: next.path, vi: curr.path });
      pairedPaths.add(curr.path);
      pairedPaths.add(next.path);
      i++;
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

  // 2. Parallel block pairs (e.g. block of VI slides, followed by block of EN slides)
  const viSlides = profiles.filter((s) => !pairedPaths.has(s.path) && isViSlide(s));
  const enSlides = profiles.filter((s) => !pairedPaths.has(s.path) && isEnSlide(s));
  if (viSlides.length >= 2 && enSlides.length >= 2 && Math.abs(viSlides.length - enSlides.length) <= 5) {
    const pairs: IsqSlidePair[] = [];
    const minLen = Math.min(viSlides.length, enSlides.length);
    for (let k = 0; k < minLen; k++) {
      pairs.push({ en: enSlides[k].path, vi: viSlides[k].path });
    }
    return pairs;
  }

  return rawCandidatePairs.length > 0 ? rawCandidatePairs : [];
}

export async function readIsqSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const xml =
    (await zip.file(ISQ_PAIRS_PART)?.async("string")) ||
    (await zip.file(`ppt/${ISQ_PAIRS_PART}`)?.async("string")) ||
    (await zip.file("customXml/pairs.xml")?.async("string")) ||
    (await zip.file("ppt/customXml/pairs.xml")?.async("string")) ||
    "";
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
    presXml.matchAll(/<p:sldId[^>]*id="(\d+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)
  ).map((m) => ({
    fullTag: m[0],
    id: parseInt(m[1], 10),
    rId: m[2],
  }));

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
      /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
      `<p:sldIdLst>${pairedEntries.join("")}</p:sldIdLst>`
    );
    contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);

    zip.file("ppt/_rels/presentation.xml.rels", relsXml);
    zip.file("ppt/presentation.xml", presXml);
    zip.file("[Content_Types].xml", contentTypesXml);
  }

  return newPairs;
}

