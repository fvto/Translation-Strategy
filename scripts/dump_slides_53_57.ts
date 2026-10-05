import JSZip from 'jszip';
import fs from 'fs';

async function dumpSlide(filePath, slideNum) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entry = zip.file(`ppt/slides/slide${slideNum}.xml`);
  if (!entry) return;
  const xml = await entry.async('string');
  console.log(`\n======================================================`);
  console.log(`${filePath} - Slide ${slideNum}`);
  console.log(`======================================================`);
  const sps = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  sps.forEach((sp, i) => {
    const ts = (sp.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
      .map(x => x.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (ts.length > 0) {
      console.log(`Shape ${i}:`, ts.join(' // '));
    }
  });
}

async function main() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';

  for (const s of [53, 54, 55, 56, 57]) {
    await dumpSlide(origPath, s);
    await dumpSlide(codePath, s);
    await dumpSlide(bmPath, s);
  }
}

main().catch(console.error);
