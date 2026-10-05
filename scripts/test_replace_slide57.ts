import fs from 'fs';
import JSZip from 'jszip';
import { pptxTranslatorService, PptxTranslationMode } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const buffer = fs.readFileSync(origPath);
  const zip = await JSZip.loadAsync(buffer);
  
  const crawled = await pptxTranslatorService.crawl(buffer);
  const s57 = crawled.slides.find(s => s.slideIndex === 57)!;
  
  const xml = await zip.file(s57.slideFileName)!.async('string');
  
  // Set mock translated texts
  for (const p of s57.paragraphs) {
    p.translatedText = '[EN] ' + p.originalText;
  }
  
  // Call replaceParagraphsInXml with both modes
  for (const mode of ['ipqc_bilingual', 'replace_en'] as PptxTranslationMode[]) {
    console.log(`\n=== Testing mode: ${mode} ===`);
    const replaced = (pptxTranslatorService as any).replaceParagraphsInXml(xml, s57.paragraphs, mode);
    
    // Check what text is inside replaced XML
    const ts = (replaced.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
      .map(x => x.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    console.log(`Replaced total texts: ${ts.length}`);
    console.log(`Texts:`, ts.join(' // '));
  }
}

test().catch(console.error);
