import JSZip from 'jszip';
import fs from 'fs';
import { hasViDiacritics } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (1).pptx';
  
  const origZip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const transZip = await JSZip.loadAsync(fs.readFileSync(transPath));
  
  const presXml = await origZip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await origZip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  console.log(`Analyzing ${rIds.length} slides for MISSING text and UNTRANSLATED text...`);
  
  for (let i = 0; i < rIds.length; i++) {
    const target = idMap.get(rIds[i])!;
    const origSlideXml = await origZip.file(`ppt/${target}`)?.async('string');
    const transSlideXml = await transZip.file(`ppt/${target}`)?.async('string');
    
    if (!transSlideXml) {
      console.log(`[Slide #${i + 1} (${target})]: MISSING FROM TRANS ENTIRELY!`);
      continue;
    }
    
    const getParagraphs = (xml: string) => {
      const ps: string[] = [];
      const pMatches = xml.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
      for (const p of pMatches) {
        const ts = (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
        if (ts.length > 0) ps.push(ts.join(' '));
      }
      return ps;
    };
    
    const origPs = getParagraphs(origSlideXml || '');
    const transPs = getParagraphs(transSlideXml || '');
    
    // Check if trans has substantially fewer paragraphs
    if (transPs.length < origPs.length && origPs.length > 3) {
      console.log(`[Slide #${i + 1} (${target})]: FEWER PARAGRAPHS! ORIG has ${origPs.length}, TRANS has ${transPs.length}`);
      console.log(`   ORIG sample:  ${origPs.slice(0, 4).join(' // ')}`);
      console.log(`   TRANS sample: ${transPs.slice(0, 4).join(' // ')}`);
    }
    
    // Check if trans still has Vietnamese diacritics
    const viInTrans = transPs.filter(p => hasViDiacritics(p));
    if (viInTrans.length > 0) {
      console.log(`[Slide #${i + 1} (${target})]: STILL HAS VIETNAMESE (${viInTrans.length} items):`);
      viInTrans.slice(0, 3).forEach(v => console.log(`   - "${v.slice(0, 60)}"`));
    }
  }
}

test().catch(console.error);
