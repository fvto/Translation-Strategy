import JSZip from 'jszip';
import fs from 'fs';
import { isPureEnglish, hasViDiacritics } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(origPath));
  
  for (let s = 1; s <= 86; s++) {
    const entry = zip.file(`ppt/slides/slide${s}.xml`);
    if (!entry) continue;
    const xml = await entry.async('string');
    const txBodies = xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>|<a:txBody>[\s\S]*?<\/a:txBody>/g) || [];
    
    txBodies.forEach((tb, i) => {
      const ps = (tb.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || []).map(p => {
        return (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');
      }).filter(Boolean);
      
      if (ps.length > 1) {
        const pureEn = ps.filter(p => isPureEnglish(p));
        const pureVi = ps.filter(p => hasViDiacritics(p));
        if (pureEn.length > 0 && pureVi.length > 0) {
          // Check if it's truly a bilingual mirror (equal or similar number of EN and VI, or EN block + VI block)
          console.log(`Slide ${s} txBody #${i}: ${pureEn.length} EN, ${pureVi.length} VI (Total: ${ps.length})`);
          ps.forEach(p => console.log(`   - "${p.slice(0, 60)}"`));
        }
      }
    });
  }
}

test().catch(console.error);
