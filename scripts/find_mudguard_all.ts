import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (1).pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';

  for (const [name, p] of [['ORIG', origPath], ['TRANS_DOWNLOAD', transPath], ['BENCHMARK', bmPath]]) {
    console.log(`\n=== Checking ${name} ===`);
    const zip = await JSZip.loadAsync(fs.readFileSync(p));
    
    // Check slide order in presentation.xml
    const presXml = await zip.file('ppt/presentation.xml').async('string');
    const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
    const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const idMap = new Map();
    for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
      idMap.set(m[1], m[2]);
    }
    
    rIds.forEach((rid, idx) => {
      const target = idMap.get(rid);
      const entry = zip.file(`ppt/${target}`);
      if (!entry) return;
      // We check synchronous-like after async in batch
    });

    for (let idx = 0; idx < rIds.length; idx++) {
      const target = idMap.get(rIds[idx]);
      const entry = zip.file(`ppt/${target}`);
      if (!entry) continue;
      const xml = await entry.async('string');
      if (xml.toLowerCase().includes('mudguard') || xml.toLowerCase().includes('collar') || xml.toLowerCase().includes('vòng cổ')) {
        const ts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(x => x.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
        const mud = ts.filter(t => /mudguard|vòng cổ|collar/i.test(t));
        console.log(`  [Slide #${idx + 1} (${target})]: matched -> ${mud.slice(0, 5).join(' | ')}`);
      }
    }
  }
}

test().catch(console.error);
