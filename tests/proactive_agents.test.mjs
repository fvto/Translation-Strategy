import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { auditAndRepairPptxPostFlight } from '../services/qa/pptx-postflight-gate.ts';
import { sanitizeTerminologyEntry, auditTerminologyHealth } from '../services/terminology/sanitizer.ts';
import { TranslationCacheService } from '../services/translation/cache.ts';

test('Proactive Agent 1: PPTX Post-Flight Gate - Auto-repairs Inverted Phrases & Normalizes SPI', async () => {
  const zip = new JSZip();
  const sampleSlideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:rPr sz="1800"/><a:t>1. Shape tip</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1400"/><a:t>Check 10-12 mũi/inch at tip</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1600"/><a:t>*Hot/cool shaping:</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file('ppt/slides/slide1.xml', sampleSlideXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  const report = await auditAndRepairPptxPostFlight(buffer, 'replace_en');
  assert.equal(report.passed, true);
  assert.ok(report.repairedCount >= 2);

  const repairedZip = await JSZip.loadAsync(report.auditedBuffer);
  const repairedXml = await repairedZip.file('ppt/slides/slide1.xml').async('string');

  // Verify 'Shape tip' was auto-corrected to 'Tip shape'
  assert.ok(repairedXml.includes('1. Tip shape'), 'Shape tip must be auto-corrected to Tip shape');
  assert.ok(!repairedXml.includes('Shape tip'), 'Shape tip must not remain');

  // Verify SPI was normalized
  assert.ok(repairedXml.includes('SPI 10-12 stitches/inch'), 'SPI must be normalized to SPI 10-12 stitches/inch');

  // Verify star heading has bold injected
  assert.ok(repairedXml.includes('b="1"'), 'Star heading must have b="1" injected');
});

test('Proactive Agent 2: Terminology Sanitizer - Rejects Corrupted Terms & Auto-corrects Inversions', () => {
  // 1. Rejects identical source and target
  const identicalRes = sanitizeTerminologyEntry({
    sourceTerm: 'Kiểm tra sau khi ép liệu gót',
    targetTerm: 'Kiểm tra sau khi ép liệu gót',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(identicalRes.valid, false);
  assert.match(identicalRes.reason, /identical/i);

  // 2. Rejects Vietnamese diacritics in English target
  const diacriticRes = sanitizeTerminologyEntry({
    sourceTerm: 'Quét keo',
    targetTerm: 'Quét keo việt nam',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(diacriticRes.valid, false);
  assert.match(diacriticRes.reason, /diacritical/i);

  // 3. Rejects instruction-heading collapse
  const headingCollapseRes = sanitizeTerminologyEntry({
    sourceTerm: '1. Điều chỉnh máy may cách biên 1.5mm và cách kim 9-10 mũi/inch',
    targetTerm: '*Stitching heel',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(headingCollapseRes.valid, false);
  assert.match(headingCollapseRes.reason, /collapsed/i);

  // 4. Auto-corrects inverted noun phrases
  const invertedRes = sanitizeTerminologyEntry({
    sourceTerm: 'Hình dạng mũi',
    targetTerm: '1. Shape tip',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(invertedRes.valid, true);
  assert.equal(invertedRes.autoCorrected, true);
  assert.equal(invertedRes.suggestedTarget, '1. Tip shape');

  // 5. Rejects rogue process heading mapped from non-heading source (e.g. 'thứ 6' -> '*Lacing')
  const rogueHeadingRes = sanitizeTerminologyEntry({
    sourceTerm: 'thứ 6',
    targetTerm: '*Lacing',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(rogueHeadingRes.valid, false);
  assert.match(rogueHeadingRes.reason, /process heading prefix/i);

  // 6. Rejects ordinal fragments (e.g. 'nấc 3', 'bước 2')
  const ordinalRes = sanitizeTerminologyEntry({
    sourceTerm: 'nấc 2',
    targetTerm: 'notch 2',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(ordinalRes.valid, false);
  assert.match(ordinalRes.reason, /ordinal number or step fragment/i);

  // 7. Auto-corrects domain typos: 'aplly' and 'apply cement foam'
  const typoRes = sanitizeTerminologyEntry({
    sourceTerm: '*Phun keo và dán mos',
    targetTerm: '*Spray cement and aplly cement foam',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });
  assert.equal(typoRes.valid, true);
  assert.equal(typoRes.autoCorrected, true);
  assert.equal(typoRes.suggestedTarget, '*Spray cement and attach cement foam');

  // 8. Health audit across database entries
  const auditReport = auditTerminologyHealth([
    { id: '1', sourceTerm: 'May gót', targetTerm: 'Heel stitching', sourceLanguage: 'vi', targetLanguage: 'en', status: 'approved', priority: 1, confidence: 1, createdBy: 'admin', version: 'v1.0', createdAt: '', updatedAt: '' },
    { id: '2', sourceTerm: 'Lỗi', targetTerm: 'Lỗi', sourceLanguage: 'vi', targetLanguage: 'en', status: 'approved', priority: 1, confidence: 1, createdBy: 'admin', version: 'v1.0', createdAt: '', updatedAt: '' },
    { id: '3', sourceTerm: 'thứ 6', targetTerm: '*Lacing', sourceLanguage: 'vi', targetLanguage: 'en', status: 'approved', priority: 1, confidence: 1, createdBy: 'admin', version: 'v1.0', createdAt: '', updatedAt: '' },
  ]);
  assert.equal(auditReport.totalTerms, 3);
  assert.equal(auditReport.anomaliesFound, 2);
  assert.equal(auditReport.healthyTerms, 1);
});

test('Proactive Agent 1b: PPTX Post-Flight Gate - Auto-repairs Typos & Removes Rogue Injected Headings', async () => {
  const zip = new JSZip();
  const sampleSlideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:rPr sz="1600"/><a:t>*Spray cement and aplly cement foam</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1400"/><a:t>1. Spray cement must reach marking</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:rPr sz="1600"/><a:t>*Lacing</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1400"/><a:t>1. Use jig to check eyestay opening after lacing</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1400"/><a:t>2. Check if lacing too tight (lace close with last). Only lacing reach to the 6th eyelet</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1600"/><a:t>*Lacing</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:rPr sz="1400"/><a:t>3. Use temporary lace so that collar close with last. Check if quarter &amp; eyestay wrinkle after lacing</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file('ppt/slides/slide1.xml', sampleSlideXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  const report = await auditAndRepairPptxPostFlight(buffer, 'replace_en');
  assert.equal(report.passed, true);
  assert.ok(report.repairedCount >= 2);

  const repairedZip = await JSZip.loadAsync(report.auditedBuffer);
  const repairedXml = await repairedZip.file('ppt/slides/slide1.xml').async('string');

  // Verify typo 'aplly' is gone and replaced with canonical 'Spray cement and attach cement foam'
  assert.ok(!repairedXml.includes('aplly'), 'Typo aplly must be auto-repaired');
  assert.ok(repairedXml.includes('*Spray cement and attach cement foam'), 'Must be *Spray cement and attach cement foam');

  // Verify the spurious *Lacing between step 2 and step 3 was removed
  const lacingCount = (repairedXml.match(/\*Lacing/g) || []).length;
  assert.equal(lacingCount, 1, 'Only the initial section heading *Lacing must remain; rogue heading between steps 2 and 3 must be eliminated');
});

test('Proactive Agent 3: Translation Cache Optimizer - Eliminates Redundant Tokens & Broadcasts', () => {
  const cache = new TranslationCacheService();

  const deckItems = [
    { id: 's1_p1', sourceText: 'GOOD' },
    { id: 's1_p2', sourceText: 'NO GOOD' },
    { id: 's2_p1', sourceText: 'GOOD' },
    { id: 's2_p2', sourceText: 'NO GOOD' },
    { id: 's3_p1', sourceText: 'GOOD' },
    { id: 's3_p2', sourceText: '1. Điều chỉnh lập trình theo rập' },
  ];

  // 1. First run: deduplicate items across deck
  const { uniqueToTranslate, resolveAll, stats } = cache.deduplicateItems(deckItems, 'vi', 'en');
  assert.equal(stats.total, 6);
  assert.equal(stats.unique, 3); // 'GOOD', 'NO GOOD', and instruction
  assert.equal(stats.dedupSaved, 3);

  // 2. Simulate LLM translation of only the unique items
  const freshTranslations = new Map([
    ['s1_p1', 'GOOD'],
    ['s1_p2', 'NO GOOD'],
    ['s3_p2', '1. To align programmed according to pattern'],
  ]);

  const allResolved = resolveAll(freshTranslations);

  // All 6 items must be resolved accurately
  assert.equal(allResolved.get('s1_p1'), 'GOOD');
  assert.equal(allResolved.get('s2_p1'), 'GOOD');
  assert.equal(allResolved.get('s3_p1'), 'GOOD');
  assert.equal(allResolved.get('s1_p2'), 'NO GOOD');
  assert.equal(allResolved.get('s2_p2'), 'NO GOOD');

  // 3. Second run: items should now hit cache immediately
  const secondPass = cache.deduplicateItems([{ id: 's99_p1', sourceText: 'GOOD' }], 'vi', 'en');
  assert.equal(secondPass.stats.cachedHits, 1);
  assert.equal(secondPass.uniqueToTranslate.length, 0); // 0 LLM calls needed!
});
