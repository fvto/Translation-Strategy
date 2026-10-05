import fs from 'fs';
import JSZip from 'jszip';
import { pptxTranslatorService } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  
  const crawled = await pptxTranslatorService.crawl(buffer);
  console.log(`Total crawled slides: ${crawled.slides.length}`);
  
  // Find slide 57
  const s57 = crawled.slides.find(s => s.slideFileName.includes('slide57.xml') || s.slideIndex === 57);
  console.log(`Slide 57 found:`, s57 ? {
    index: s57.slideIndex,
    file: s57.slideFileName,
    paragraphsCount: s57.paragraphs.length,
    paragraphs: s57.paragraphs.map(p => ({ id: p.id, text: p.originalText.slice(0, 60) }))
  } : 'NOT FOUND');
}

test().catch(console.error);
