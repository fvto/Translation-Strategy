import JSZip from 'jszip';
import fs from 'fs';

async function inspect(filePath: string, name: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  console.log(`=== ${name} ===`);
  console.log(`Total slides in presentation.xml: ${rIds.length}`);
  const targets = rIds.map((rid, i) => `${i + 1}:${idMap.get(rid)}`);
  console.log(targets.join(', '));
}

async function main() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (1).pptx';
  
  await inspect(origPath, 'ORIG');
  await inspect(bmPath, 'BENCHMARK');
  await inspect(transPath, 'TRANS_USER');
}

main().catch(console.error);
