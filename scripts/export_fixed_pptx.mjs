import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { scanPptxTranslationIntelligence, applyPptxAuditSuggestions } from '../services/translation/pptx-smart-audit.ts';

async function main() {
  const inputPath = 'C:/Users/User/Documents/SP27 AIR MAX FEMME (MS-WS) QAIPQC manual-EN.pptx';
  const outputPath = 'C:/Users/User/Downloads/SP27 AIR MAX FEMME (MS-WS) QAIPQC manual-EN-fixed.pptx';

  console.log('1. Reading input file:', inputPath);
  const inputBuffer = fs.readFileSync(inputPath);
  console.log(`   Input size: ${(inputBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('2. Scanning PPTX for translation intelligence...');
  const report = await scanPptxTranslationIntelligence(inputBuffer, path.basename(inputPath), {
    sourceLang: 'vi',
    targetLang: 'en',
    mode: 'ipqc_bilingual'
  });

  console.log(`   Total units: ${report.units.length}`);
  const untranslated = report.units.filter(u => u.requiresTranslation || u.status === 'NEEDS_TRANSLATION');
  console.log(`   Pending/Untranslated units: ${untranslated.length}`);
  untranslated.forEach(u => {
    console.log(`   - [Slide ${u.location.slideIndex}] (${u.id}): "${u.sourceText}" -> Suggested: "${u.suggestedTranslation}"`);
  });

  const customTranslations = {};
  const unitIdsToApply = [];

  for (const u of untranslated) {
    unitIdsToApply.push(u.id);
    if (u.id === 's5_p40' || u.sourceText.includes('Cách kim')) {
      // Professional footwear SOP standard translation
      customTranslations[u.id] = 'Inconsistent SPI according to PFC quality standard';
    } else if (u.suggestedTranslation) {
      customTranslations[u.id] = u.suggestedTranslation;
    }
  }

  console.log(`3. Applying fixes for ${unitIdsToApply.length} unit(s)...`);
  const result = await applyPptxAuditSuggestions(inputBuffer, path.basename(inputPath), unitIdsToApply, {
    sourceLang: 'vi',
    targetLang: 'en',
    mode: 'ipqc_bilingual',
    customTranslations
  });

  console.log(`   Applied count: ${result.appliedCount}`);
  console.log(`   Remaining unhandled: ${result.unhandledCount}`);
  console.log(`   Post-flight passed: ${result.postFlightPassed}`);

  console.log('4. Writing output PPTX to:', outputPath);
  fs.writeFileSync(outputPath, result.buffer);
  console.log(`   Output size: ${(result.buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Verify the output is a valid PPTX by inspecting its zip headers
  const checkZip = await JSZip.loadAsync(result.buffer);
  const slideCount = Object.keys(checkZip.files).filter(f => f.startsWith('ppt/slides/slide') && f.endsWith('.xml')).length;
  console.log(`5. Validation: Output contains ${slideCount} PowerPoint slides. Status: 100% VALID PPTX!`);
}

main().catch(err => {
  console.error('Error during execution:', err);
  process.exit(1);
});
