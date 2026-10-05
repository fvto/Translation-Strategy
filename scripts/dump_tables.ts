import JSZip from 'jszip';
import fs from 'fs';

async function dumpTables(filePath, slideNum) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entry = zip.file(`ppt/slides/slide${slideNum}.xml`);
  if (!entry) return;
  const xml = await entry.async('string');
  console.log(`\n======================================================`);
  console.log(`${filePath} - Slide ${slideNum} TABLES`);
  console.log(`======================================================`);
  const tbls = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || [];
  console.log(`Found ${tbls.length} tables`);
  tbls.forEach((tbl, ti) => {
    console.log(`--- Table ${ti} ---`);
    const rows = tbl.match(/<a:tr(?:[\s>][\s\S]*?<\/a:tr>|\/>)/g) || [];
    rows.forEach((row, ri) => {
      const cells = row.match(/<a:tc(?:[\s>][\s\S]*?<\/a:tc>|\/>)/g) || [];
      cells.forEach((cell, ci) => {
        const ts = (cell.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(x => x.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
        if (ts.length > 0) {
          console.log(`  Row ${ri}, Cell ${ci}:`, ts.join(' // '));
        }
      });
    });
  });
}

async function main() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const codePath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN-code.pptx';
  const bmPath = 'Test/FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS) QA\u00a0IPQC manual-EN.pptx';

  for (const s of [53, 54, 56, 57, 77, 80]) {
    await dumpTables(origPath, s);
    await dumpTables(codePath, s);
    await dumpTables(bmPath, s);
  }
}

main().catch(console.error);
