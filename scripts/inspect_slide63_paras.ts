import fs from 'fs';
import { pptxTranslatorService } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  const crawled = await pptxTranslatorService.crawl(buffer);
  const s63 = crawled.slides.find(s => s.slideIndex === 63)!;
  
  console.log('Slide 63 paragraphs:');
  for (const p of s63.paragraphs) {
    console.log(`  id: ${p.id}, text: "${p.originalText}"`);
  }
}

test().catch(console.error);
