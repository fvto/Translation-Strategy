import JSZip from 'jszip';
import fs from 'fs';

async function checkSlide56() {
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';

  for (const [name, p] of [['ORIG', origPath], ['CODE', codePath], ['BENCHMARK', bmPath]]) {
    console.log(`\n================== ${name} SLIDE 56 ==================`);
    const zip = await JSZip.loadAsync(fs.readFileSync(p));
    const xml = await zip.file('ppt/slides/slide56.xml')?.async('string');
    if (!xml) continue;
    const txBodies = xml.match(/<(?:p|a):txBody>[\s\S]*?<\/(?:p|a):txBody>/g) || [];
    txBodies.forEach((tb, i) => {
      const ps = tb.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
      const lines = ps.map(pXml => {
        return (pXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(x => x.replace(/<[^>]+>/g, ''))
          .join('');
      }).filter(x => x.trim());
      if (lines.length > 0) {
        console.log(`txBody ${i}:`, lines);
      }
    });
  }
}

checkSlide56().catch(console.error);
