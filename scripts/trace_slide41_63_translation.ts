import fs from 'fs';
import { pptxTranslatorService } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  const crawled = await pptxTranslatorService.crawl(buffer);
  
  for (const sNum of [41, 42, 43, 44, 45, 57, 63]) {
    const s = crawled.slides.find(sl => sl.slideIndex === sNum)!;
    console.log(`\n=== SLIDE ${sNum} PARAGRAPHS (${s.paragraphs.length}) ===`);
    for (const p of s.paragraphs) {
      console.log(`  [${p.id}]: "${p.originalText}"`);
    }
  }
}

test().catch(console.error);
