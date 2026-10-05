import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const p = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (2).pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  console.log(`Total slides in (2): ${rIds.length}`);
  
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  for (const s of [53, 54, 55, 56, 57, 77, 80]) {
    const target = idMap.get(rIds[s - 1]);
    const xml = await zip.file(`ppt/${target}`)?.async('string');
    if (!xml) continue;
    const ts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    console.log(`Slide ${s} (${target}):`, ts.slice(0, 8).join(' // '));
  }
}

test().catch(console.error);
