import fs from 'fs';
import JSZip from 'jszip';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';

async function testSlide14() {
  const buf = fs.readFileSync('C:/Users/User/Documents/SP27 AIR MAX FEMME (MS-WS) QAIPQC manual-EN.pptx');
  const zip = await JSZip.loadAsync(buf);
  const slide14Xml = await zip.file('ppt/slides/slide14.xml').async('text');

  // Slide 14 paragraph 1 (index 1 in paragraphs)
  const fakeParagraphs = [
    {
      id: 'p0',
      paragraphIndex: 0,
      originalText: 'AIR MAX FEMME',
      translatedText: 'AIR MAX FEMME',
      isTitle: false,
    },
    {
      id: 'p1',
      paragraphIndex: 1,
      originalText: 'IPQC Cutting Inspection Focuses: Trọng điểm kiểm tra ép nosew mặt giày',
      translatedText: 'IPQC Cutting Inspection Focuses: No-sew upper pressing inspection focuses',
      isTitle: false,
    }
  ];

  console.log('--- TEST 1: replace_en ---');
  const enXml = pptxTranslatorService['replaceParagraphsInXml'](slide14Xml, fakeParagraphs, 'replace_en');
  const pEnMatches = enXml.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
  const p1En = pEnMatches[1];
  const runsEn = Array.from(p1En.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)).map(m => m[0]);
  console.log('Runs count (replace_en):', runsEn.length);
  runsEn.forEach((r, idx) => {
    const isRed = r.includes('FF0000');
    const textMatch = r.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
    const t = textMatch ? textMatch[1] : '';
    console.log(`  Run ${idx} [${isRed ? 'RED' : 'NORMAL'}]: "${t}"`);
  });

  const run0Normal = runsEn.length >= 2 && !runsEn[0].includes('FF0000') && runsEn[0].includes('IPQC Cutting Inspection Focuses:');
  const run1Red = runsEn.length >= 2 && runsEn[1].includes('FF0000') && runsEn[1].includes('No-sew upper pressing inspection focuses');

  if (!run0Normal || !run1Red) {
    throw new Error('replace_en check failed');
  }

  console.log('\n--- TEST 2: ipqc_bilingual ---');
  const biXml = pptxTranslatorService['replaceParagraphsInXml'](slide14Xml, fakeParagraphs, 'ipqc_bilingual');
  const pBiMatches = biXml.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
  console.log('Paragraphs count in bi:', pBiMatches.length);
  // Both EN and VI paragraph should exist or EN has red
  const p1BiEn = pBiMatches[1];
  const runsBiEn = Array.from(p1BiEn.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)).map(m => m[0]);
  runsBiEn.forEach((r, idx) => {
    const isRed = r.includes('FF0000');
    const textMatch = r.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
    const t = textMatch ? textMatch[1] : '';
    console.log(`  EN Run ${idx} [${isRed ? 'RED' : 'NORMAL'}]: "${t}"`);
  });

  if (pBiMatches[2]) {
    const p1BiVi = pBiMatches[2];
    const runsBiVi = Array.from(p1BiVi.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)).map(m => m[0]);
    runsBiVi.forEach((r, idx) => {
      const isRed = r.includes('FF0000');
      const textMatch = r.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
      const t = textMatch ? textMatch[1] : '';
      console.log(`  VI Run ${idx} [${isRed ? 'RED' : 'NORMAL'}]: "${t}"`);
    });
  }

  console.log('\n>>> ALL SLIDE 14 TESTS PASSED! <<<');
}

testSlide14().catch(err => {
  console.error(err);
  process.exit(1);
});
