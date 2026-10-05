import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';
  
  const origZip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const bmZip = await JSZip.loadAsync(fs.readFileSync(bmPath));
  
  // Check slide 54, 57, 77, 80 in ORIG
  for (const s of [53, 54, 56, 57, 76, 77, 79, 80]) {
    const origXml = await origZip.file(`ppt/slides/slide${s}.xml`)?.async('string');
    const bmXml = await bmZip.file(`ppt/slides/slide${s}.xml`)?.async('string');
    
    const getTexts = (xml?: string) => {
      if (!xml) return 'NOT PRESENT';
      return (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(' // ');
    };
    
    console.log(`Slide ${s}:`);
    console.log(`  ORIG: ${getTexts(origXml)}`);
    console.log(`  BM:   ${getTexts(bmXml)}`);
  }
}

test().catch(console.error);
