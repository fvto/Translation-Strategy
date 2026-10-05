import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (2).pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(transPath));
  
  for (const s of [41, 42, 43, 44, 45, 63]) {
    const xml = await zip.file(`ppt/slides/slide${s}.xml`)?.async('string');
    if (!xml) continue;
    console.log(`\n=== SLIDE ${s} ===`);
    const ps = (xml.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || []).map(p => {
      return (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ');
    }).filter(Boolean);
    ps.forEach(p => console.log(`   "${p}"`));
  }
}

test().catch(console.error);
