import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { db } from '../services/database/db.ts';
import { auditPptxGaps } from '../services/translation/smart-detector.ts';
import { applyPptxAuditSuggestions } from '../services/translation/pptx-smart-audit.ts';
import { pptxTranslatorService } from '../services/documents/pptx-translator.ts';
import { paragraphText } from '../services/documents/pptx-text.ts';
import { checkGlossaryTranslation } from '../services/terminology/audit-compliance.ts';
import { translationCache } from '../services/translation/cache.ts';
const source = 'Không bơm tràn ra ngoài tránh bị cộm';
const old = 'Do not overfill or overflow cement to avoid being lumpy.';
const term = (sourceTerm, targetTerm, id='term') => ({ id, sourceTerm, targetTerm, sourceLanguage:'vi',targetLanguage:'en',status:'approved',priority:1 });
const opts = { sourceLang:'vi',targetLang:'en',mode:'replace_en',approvedGlossary:[term('Cộm','X-ray')],historyPairs:[] };
const escape = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;');
async function deck(texts) {
  const zip = new JSZip();
  const shapes = texts.map(t=>`<p:sp><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1400"/><a:t>${escape(t)}</a:t></a:r></a:p></p:txBody></p:sp>`).join('');
  zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({type:'nodebuffer'});
}

test('Screenshot history candidate is corrected using the actual approved Cộm glossary entry', async()=>{
  const glossary = db.getApprovedTerminology('vi','en');
  assert.equal(glossary.find(e=>e.sourceTerm.toLowerCase()==='cộm').targetTerm,'X-ray');
  const report = await auditPptxGaps(await deck([source,'Cutting die']), 'glossary.pptx', {
    ...opts,approvedGlossary:glossary,historyPairs:[{source,target:old,origin:'history'}],
  });
  const unit=report.units[0];
  assert.equal(unit.suggestedTranslation,'Do not overfill or overflow cement to avoid X-ray.');
  assert.equal(checkGlossaryTranslation(source,unit.suggestedTranslation,glossary,'vi','en').isValid,true);
  assert.match(unit.reason,/glossary/);assert.ok(unit.glossaryCorrections.some(c=>c.expectedTarget==='X-ray'));
  assert.ok(unit.confidence <= .85, 'Source match is not a 99% guarantee of target quality');
  assert.equal(report.units[1].suggestedTranslation,undefined);
  assert.ok(!report.groups.some(g=>g.unitIds.includes(report.units[1].id)));
});

test('Direct apply rechecks glossary instead of writing the old historical wording', async()=>{
  const buffer=await deck([source]);
  const result=await applyPptxAuditSuggestions(buffer,'apply.pptx',['s1_p0'],{...opts,historyPairs:[{source,target:old,origin:'history'}]});
  const zip=await JSZip.loadAsync(result.buffer);
  const text=paragraphText(await zip.file('ppt/slides/slide1.xml').async('string'));
  assert.match(text,/X-ray/);assert.doesNotMatch(text,/lump/i);
});

test('Unrepairable historical/corrected targets are withheld and remain selected for fresh translation', async()=>{
  const text='Kiểm tra cộm trước khi đóng thùng';
  const report=await auditPptxGaps(await deck([text]),'missing.pptx',{...opts,historyPairs:[{source:text,target:'Inspect before packing.',origin:'correction'}]});
  const unit=report.units[0];
  assert.equal(unit.suggestedTranslation,undefined);assert.equal(unit.canApply,false);assert.equal(unit.safeToApply,false);
  assert.equal(unit.status,'REVIEW_REQUIRED');assert.equal(unit.selectedForTranslation,true);
  assert.deepEqual(unit.glossaryMismatches,[{sourceTerm:'Cộm',expectedTarget:'X-ray'}]);
  assert.equal(report.groups[0].suggestedTranslation,undefined);
  await assert.rejects(applyPptxAuditSuggestions(await deck([text]),'missing.pptx',['s1_p0'],{...opts,historyPairs:[{source:text,target:'Inspect before packing.',origin:'correction'}]}),/không còn hợp lệ/);
});

test('A compliant history candidate is chosen over an unresolved glossary deviation',async()=>{
  const report=await auditPptxGaps(await deck([source]),'choice.pptx',{...opts,historyPairs:[
    {source,target:'Avoid overflow and surface defects.',origin:'correction'},
    {source,target:'Do not overflow cement to avoid X-ray.',origin:'history'},
  ]});
  assert.equal(report.units[0].suggestedTranslation,'Do not overflow cement to avoid X-ray.');
  assert.ok(report.units[0].matches.every(m=>/X-ray/i.test(m.target)));
});

test('Unsafe approved instruction-to-heading mappings cannot bypass Smart Audit',async()=>{
  const text='1. Kiểm tra cộm trước khi đóng thùng';
  const report=await auditPptxGaps(await deck([text]),'unsafe.pptx',{...opts,approvedGlossary:[term(text,'*Packing')],historyPairs:[]});
  assert.equal(report.units[0].suggestedTranslation,undefined);
  assert.equal(report.units[0].selectedForTranslation,true);
});

test('X-ray substitution is scoped to a matching approved source term',()=>{
  assert.equal(checkGlossaryTranslation('Nhăn TR','Avoid lumps.',opts.approvedGlossary,'vi','en').text,'Avoid lumps.');
  for(const target of ['Avoid lumpy feeling.','Avoid lumps.','Prevent lumpiness.','Prevent lumping.']) {
    const checked=checkGlossaryTranslation('Tránh bị cộm',target,opts.approvedGlossary,'vi','en');
    assert.equal(checked.isValid,true);assert.match(checked.text,/X-ray/);assert.doesNotMatch(checked.text,/lump/i);
  }
});

test('Incremental repair enforces current glossary on selected output without touching existing EN',async()=>{
  translationCache.clear();
  const buffer=await deck([source,'Cutting die']);
  const provider={name:'mock',translateBatch:async({items})=>({results:new Map(items.map(i=>[i.id,old])),provider:'mock',durationMs:0})};
  const result=await pptxTranslatorService.translate(buffer,{sourceLanguage:'vi',targetLanguage:'en',mode:'replace_en',fileName:'repair.pptx',translateMissingOnly:true,selectedUnitIds:['s1_p0'],provider});
  const after=await JSZip.loadAsync(result.translatedBuffer);
  const text=paragraphText(await after.file('ppt/slides/slide1.xml').async('string'));
  assert.match(text,/X-ray/);assert.doesNotMatch(text,/lump/i);assert.match(text,/Cutting die/);
});

test('Incremental repair retries a missing glossary term, preserving fresh correction over memory',async()=>{
  translationCache.clear();let calls=0;
  const provider={name:'mock',translateBatch:async({items,context})=>{
    calls++;
    return {results:new Map(items.map(i=>[i.id,context?.includes('previous output missed')?'Do not overflow cement to avoid X-ray.':'Avoid overflow and surface defects.'])),provider:'mock',durationMs:0};
  }};
  const result=await pptxTranslatorService.translate(await deck([source]),{sourceLanguage:'vi',targetLanguage:'en',mode:'replace_en',fileName:'retry.pptx',translateMissingOnly:true,selectedUnitIds:['s1_p0'],provider});
  assert.equal(calls,2);
  const after=await JSZip.loadAsync(result.translatedBuffer);
  assert.match(paragraphText(await after.file('ppt/slides/slide1.xml').async('string')),/X-ray/);
});

test('Incremental repair refuses delivery if the corrective pass still violates glossary',async()=>{
  translationCache.clear();let calls=0;
  const provider={name:'mock',translateBatch:async({items})=>{calls++;return {results:new Map(items.map(i=>[i.id,'Avoid overflow and surface defects.'])),provider:'mock',durationMs:0};}};
  await assert.rejects(pptxTranslatorService.translate(await deck([source]),{sourceLanguage:'vi',targetLanguage:'en',mode:'replace_en',fileName:'blocked.pptx',translateMissingOnly:true,selectedUnitIds:['s1_p0'],provider}),/Chưa thể sửa đúng glossary.*Cộm → X-ray/);
  assert.equal(calls,2);
});

test('Corrupt Vietnamese history targets cannot bypass glossary checks through target matching',async()=>{
  const text='Kiểm tra cộm trước khi đóng thùng';
  const report=await auditPptxGaps(await deck([text]),'leaked-history.pptx',{...opts,historyPairs:[{source:'Check equipment',target:text,origin:'correction'}]});
  const unit=report.units[0];
  assert.equal(unit.suggestedTranslation,undefined);assert.equal(unit.canApply,false);assert.equal(unit.safeToApply,false);
  assert.equal(unit.selectedForTranslation,true);assert.equal(unit.status,'NEEDS_TRANSLATION');
});

test('Poisoned generic stopword glossary mappings (such as vị trí -> at) are filtered and do not block translation', async () => {
  translationCache.clear();
  const textWithViTri = 'Kiểm tra vị trí đế trước khi dán keo';
  const provider = {
    name: 'mock',
    translateBatch: async ({ items }) => ({
      results: new Map(items.map(i => [i.id, 'Inspect sole position before applying cement.'])),
      provider: 'mock',
      durationMs: 0
    })
  };
  const result = await pptxTranslatorService.translate(await deck([textWithViTri]), {
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    mode: 'replace_en',
    fileName: 'vi_tri_safe.pptx',
    translateMissingOnly: true,
    selectedUnitIds: ['s1_p0'],
    provider
  });
  const after = await JSZip.loadAsync(result.translatedBuffer);
  const text = paragraphText(await after.file('ppt/slides/slide1.xml').async('string'));
  assert.equal(text, 'Inspect sole position before applying cement.');
});

test('Compound tooling term (Khuôn trên - dưới) is automatically enforced as top and bottom plates without delivery errors', async () => {
  translationCache.clear();
  const textWithKhuon = 'Khuôn trên - dưới đúng size,đặt khớp lỗ định vị';
  const provider = {
    name: 'mock',
    translateBatch: async ({ items }) => ({
      results: new Map(items.map(i => [i.id, 'Top and bottom molds must be of the correct size, align with position holes'])),
      provider: 'mock',
      durationMs: 0
    })
  };
  const result = await pptxTranslatorService.translate(await deck([textWithKhuon]), {
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    mode: 'replace_en',
    fileName: 'khuon_safe.pptx',
    translateMissingOnly: true,
    selectedUnitIds: ['s1_p0'],
    provider
  });
  const after = await JSZip.loadAsync(result.translatedBuffer);
  const text = paragraphText(await after.file('ppt/slides/slide1.xml').async('string'));
  assert.match(text, /top and bottom plates/i);
});

