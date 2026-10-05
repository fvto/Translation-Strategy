import JSZip from 'jszip';
import fs from 'fs';

async function checkSlide(filePath, slideNum) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entry = zip.file(`ppt/slides/slide${slideNum}.xml`);
  if (!entry) {
    console.log(`${filePath} has no slide ${slideNum}`);
    return;
  }
  const xml = await entry.async('string');
  const texts = (xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  
  console.log(`\n======================================================`);
  console.log(`FILE: ${filePath} | SLIDE ${slideNum} (${texts.length} text items)`);
  console.log(`======================================================`);
  texts.forEach((t, i) => console.log(`  [${i}]: ${t}`));
}

async function main() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const transPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.trans.pptx';
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';

  for (const s of [53, 56, 77, 80]) {
    await checkSlide(origPath, s);
    await checkSlide(transPath, s);
    await checkSlide(codePath, s);
    await checkSlide(bmPath, s);
  }
}

main().catch(console.error);
