import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function checkPptx(filePath: string) {
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    if (!presXml) return;
    const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
    const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!relsXml) return;
    const idMap = new Map<string, string>();
    for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
      idMap.set(m[1], m[2]);
    }

    for (let i = 0; i < rIds.length; i++) {
      const target = idMap.get(rIds[i]);
      if (!target) continue;
      const xml = await zip.file(`ppt/${target}`)?.async('string');
      if (!xml) continue;
      if (xml.includes('May mudguard') || xml.includes('mudguard 1,2')) {
        const ts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        console.log(`FILE: ${filePath}`);
        console.log(`  Slide #${i + 1} (${target}) has ${rIds.length} total slides:`);
        console.log(`  Texts:`, ts.slice(0, 10).join(' // '));
      }
    }
  } catch (e: any) {
    // ignore
  }
}

async function main() {
  const dirs = [
    'Test',
    'C:\\Users\\User\\Downloads',
    'C:\\Users\\User\\Desktop',
    'data/secure_storage/pptx_sessions'
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const files = fs.readdirSync(d).filter(f => f.endsWith('.pptx') && !f.startsWith('~$'));
    for (const f of files) {
      await checkPptx(path.join(d, f));
    }
  }
}

main().catch(console.error);
