import fs from 'fs';
import { pptxTranslatorService, splitBilingualText, isPureEnglish, hasViDiacritics } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  const crawled = await pptxTranslatorService.crawl(buffer);
  
  const allItemsToTranslate: any[] = [];
  const skippedHybrid: any[] = [];
  const skippedPureEn: any[] = [];
  const skippedNoAlpha: any[] = [];
  
  for (const slide of crawled.slides) {
    for (const p of slide.paragraphs) {
      const hybrid = splitBilingualText(p.originalText);
      if (hybrid) {
        skippedHybrid.push({ id: p.id, text: p.originalText, en: hybrid.en });
        continue;
      }
      if (isPureEnglish(p.originalText) && !hasViDiacritics(p.originalText)) {
        skippedPureEn.push({ id: p.id, text: p.originalText });
        continue;
      }
      if (!/[a-zA-Z\u00C0-\u1EF9]/i.test(p.originalText)) {
        skippedNoAlpha.push({ id: p.id, text: p.originalText });
        continue;
      }
      allItemsToTranslate.push({ id: p.id, slideIndex: p.slideIndex, text: p.originalText });
    }
  }
  
  console.log(`Total crawled paragraphs: ${crawled.stats.totalParagraphs}`);
  console.log(`Items to translate: ${allItemsToTranslate.length}`);
  console.log(`Skipped hybrid: ${skippedHybrid.length}`);
  console.log(`Skipped pure EN: ${skippedPureEn.length}`);
  console.log(`Skipped no alpha: ${skippedNoAlpha.length}`);
  
  // Check slide 41-45, 57, 63
  for (const sNum of [41, 42, 43, 44, 45, 57, 63]) {
    const toTrans = allItemsToTranslate.filter(it => it.slideIndex === sNum);
    const pureEn = skippedPureEn.filter(it => it.id.startsWith(`s${sNum}_`));
    console.log(`\nSlide ${sNum}: ${toTrans.length} to translate, ${pureEn.length} skipped as pure EN`);
    pureEn.forEach(pe => console.log(`   [SKIPPED AS EN]: "${pe.text}"`));
    toTrans.slice(0, 3).forEach(tt => console.log(`   [TO TRANSLATE]: "${tt.text.slice(0, 50)}"`));
  }
}

test().catch(console.error);
