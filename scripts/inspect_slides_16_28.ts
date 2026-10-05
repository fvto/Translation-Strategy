import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(origPath));
  
  for (const s of [16, 28, 31, 32]) {
    const entry = zip.file(`ppt/slides/slide${s}.xml`);
    if (!entry) continue;
    const xml = await entry.async('string');
    console.log(`\n=================== SLIDE ${s} ===================`);
    const txBodies = xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>|<a:txBody>[\s\S]*?<\/a:txBody>/g) || [];
    txBodies.forEach((tb, i) => {
      const ps = (tb.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || []).map(p => {
        return (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');
      }).filter(Boolean);
      if (ps.length > 1) {
        console.log(`  txBody #${i} (${ps.length} paragraphs):`);
        ps.forEach((p, pi) => console.log(`    [p${pi}]: ${p}`));
      }
    });
  }
}

test().catch(console.error);
