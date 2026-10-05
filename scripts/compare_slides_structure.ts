import JSZip from 'jszip';
import fs from 'fs';

async function getSlidesInfo(filePath: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  const slides = [];
  for (let idx = 0; idx < rIds.length; idx++) {
    const target = idMap.get(rIds[idx])!;
    const entry = zip.file(`ppt/${target}`);
    if (!entry) {
      slides.push({ idx: idx + 1, target, title: 'MISSING ENTRY', sample: '' });
      continue;
    }
    const xml = await entry.async('string');
    const ts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
      .map(x => x.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const sample = ts.slice(0, 3).join(' // ');
    slides.push({ idx: idx + 1, target, sample, totalTexts: ts.length });
  }
  return slides;
}

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (1).pptx';
  
  const origSlides = await getSlidesInfo(origPath);
  const bmSlides = await getSlidesInfo(bmPath);
  const transSlides = await getSlidesInfo(transPath);
  
  console.log(`ORIG: ${origSlides.length}, BM: ${bmSlides.length}, TRANS: ${transSlides.length}`);
  
  for (let i = 35; i < 65; i++) {
    const orig = origSlides[i];
    const bm = bmSlides[i];
    const tr = transSlides[i];
    console.log(`Index ${i + 1}:`);
    console.log(`  ORIG:  ${orig?.target} -> ${orig?.sample}`);
    console.log(`  BM:    ${bm?.target} -> ${bm?.sample}`);
    console.log(`  TRANS: ${tr?.target} -> ${tr?.sample}`);
  }
}

test().catch(console.error);
