import type JSZip from "jszip";
export const ISQ_PAIRS_PART = "customXml/smart-audit-isq-pairs.xml";
export interface IsqSlidePair { en: string; vi: string }
export async function readIsqSlidePairs(zip: JSZip): Promise<IsqSlidePair[]> {
  const xml = await zip.file(ISQ_PAIRS_PART)?.async("string") || "";
  return Array.from(xml.matchAll(/<pair en="(ppt\/slides\/slide\d+\.xml)" vi="(ppt\/slides\/slide\d+\.xml)"\/>/g), m => ({en:m[1],vi:m[2]}))
    .filter(p => zip.file(p.en) && zip.file(p.vi));
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
