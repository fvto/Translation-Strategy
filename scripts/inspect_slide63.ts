import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const s63Xml = await zip.file('ppt/slides/slide63.xml')!.async('string');
  
  const txBodies = s63Xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>|<a:txBody>[\s\S]*?<\/a:txBody>/g) || [];
  txBodies.forEach((tb, i) => {
    const ps = (tb.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || []).map(p => {
      return (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ');
    }).filter(Boolean);
    if (ps.length > 0) {
      console.log(`Slide 63 txBody #${i}:`);
      ps.forEach(p => console.log(`   "${p}"`));
    }
  });
}

test().catch(console.error);
