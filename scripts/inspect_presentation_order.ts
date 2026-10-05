import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(codePath));
  const presXml = await zip.file('ppt/presentation.xml').async('string');
  const slideIds = presXml.match(/<p:sldId\s+[^>]*\/>/g) || [];
  console.log('Total sldId in presentation.xml:', slideIds.length);
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const idMap = new Map();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  console.log('Slide order:');
  rIds.forEach((rid, idx) => {
    const target = idMap.get(rid);
    if (idx >= 50 && idx <= 60) {
      console.log(`  Slide index ${idx + 1} -> ${target}`);
    }
  });
}
test().catch(console.error);
