import fs from 'fs';
import { pptxTranslatorService } from '../services/documents/pptx-translator';
import { dictionaryEngine } from '../services/translation/dictionary';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  const crawled = await pptxTranslatorService.crawl(buffer);
  const s57 = crawled.slides.find(s => s.slideIndex === 57)!;
  
  console.log('Slide 57 original paragraphs and dictionary translations:');
  for (const p of s57.paragraphs) {
    const dictTrans = dictionaryEngine.translate(p.originalText, 'vi', 'en');
    console.log(`[${p.id}]:`);
    console.log(`  ORIG: "${p.originalText}"`);
    console.log(`  DICT: "${dictTrans.translatedText}"`);
  }
}

test().catch(console.error);
