import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';
  
  const origZip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const bmZip = await JSZip.loadAsync(fs.readFileSync(bmPath));
  
  const presXml = await origZip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await origZip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  console.log(`Checking differences between ORIG and BENCHMARK across ${rIds.length} slides...\n`);
  
  let diffCount = 0;
  for (let i = 0; i < rIds.length; i++) {
    const target = idMap.get(rIds[i])!;
    const origXml = await origZip.file(`ppt/${target}`)?.async('string');
    const bmXml = await bmZip.file(`ppt/${target}`)?.async('string');
    if (!origXml || !bmXml) continue;
    
    const getTs = (xml: string) => {
      return (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
    };
    
    const origTs = getTs(origXml);
    const bmTs = getTs(bmXml);
    
    const origStr = origTs.join(' // ');
    const bmStr = bmTs.join(' // ');
    
    if (origStr !== bmStr) {
      diffCount++;
      console.log(`Slide #${i + 1} (${target}) has differences:`);
      // show what changed
      const origUnique = origTs.filter(t => !bmTs.includes(t));
      const bmUnique = bmTs.filter(t => !origTs.includes(t));
      if (origUnique.length > 0) console.log(`   ORIG had: ${origUnique.slice(0, 3).join(' | ')}`);
      if (bmUnique.length > 0)   console.log(`   BM had:   ${bmUnique.slice(0, 3).join(' | ')}`);
    }
  }
  
  console.log(`\nTotal slides with differences between ORIG and BM: ${diffCount} / ${rIds.length}`);
}

test().catch(console.error);
