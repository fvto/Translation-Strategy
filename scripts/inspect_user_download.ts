import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function test() {
  const downloadDir = 'C:\\Users\\User\\Downloads';
  const files = fs.readdirSync(downloadDir).filter(f => f.includes('FA22') && f.endsWith('.pptx'));
  console.log('Found FA22 files in Downloads:', files);
  
  for (const f of files) {
    const filePath = path.join(downloadDir, f);
    const stat = fs.statSync(filePath);
    console.log(`\nFile: ${f}, size: ${stat.size}, modified: ${stat.mtime.toISOString()}`);
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const presXml = await zip.file('ppt/presentation.xml').async('string');
    const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
    const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
    console.log(`  Total slides in presentation.xml: ${rIds.length}`);
    
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const idMap = new Map();
    for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
      idMap.set(m[1], m[2]);
    }
    
    // Inspect slide 53, 54, 55, 56, 57
    for (let i = 50; i < Math.min(rIds.length, 60); i++) {
      const target = idMap.get(rIds[i]);
      const slideEntry = zip.file(`ppt/${target}`);
      if (!slideEntry) continue;
      const xml = await slideEntry.async('string');
      const ts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(x => x.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      console.log(`  [Slide idx ${i + 1} (${target})]:`, ts.slice(0, 8).join(' // '));
    }
  }
}

test().catch(console.error);
