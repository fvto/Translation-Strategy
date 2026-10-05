import JSZip from 'jszip';
import fs from 'fs';

async function findMudguard(filePath) {
  if (!fs.existsSync(filePath)) return;
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a,b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i]).async('string');
    if (/mudguard/i.test(xml)) {
      const texts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
        .map(x => x.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      console.log(`[${filePath}] Slide ${i+1}:`);
      console.log('   ', texts.filter(t => /mudguard|crease|nhăn|may|stitch/i.test(t)).join(' | '));
    }
  }
}

async function main() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';

  await findMudguard(origPath);
  await findMudguard(codePath);
  await findMudguard(bmPath);
}

main().catch(console.error);
