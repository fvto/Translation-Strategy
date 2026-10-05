import JSZip from 'jszip';
import fs from 'fs';

async function inspect() {
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const zip = await JSZip.loadAsync(fs.readFileSync(codePath));
  
  for (let s = 50; s <= 65; s++) {
    const entry = zip.file(`ppt/slides/slide${s}.xml`);
    if (!entry) continue;
    const xml = await entry.async('string');
    
    // Check if there are tables
    const hasTbl = xml.includes('<a:tbl>');
    console.log(`\n=== SLIDE ${s} (hasTable: ${hasTbl}) ===`);
    
    // Print all paragraphs/texts
    const pMatches = xml.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
    for (const p of pMatches) {
      const ts = (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(x => x.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      if (ts.length > 0) {
        // check font size
        const szMatch = p.match(/sz="(\d+)"/);
        const sz = szMatch ? szMatch[1] : 'default';
        console.log(`  [sz=${sz}]`, ts.join(' '));
      }
    }
  }
}

inspect().catch(console.error);
