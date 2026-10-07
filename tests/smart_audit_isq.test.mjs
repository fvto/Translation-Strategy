import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {pptxTranslatorService} from '../services/documents/pptx-translator.ts';
import {auditPptxGaps,hasViDiacritics} from '../services/translation/smart-detector.ts';
import {paragraphText,replaceParagraphTranslation,canTranslateParagraphText} from '../services/documents/pptx-text.ts';
import {orderedSlidePaths,readIsqSlidePairs} from '../services/documents/pptx-slide-order.ts';
import {translationCache} from '../services/translation/cache.ts';
const ctq1='CTQ 1-Lập thể mặt trước ép phải nổi';
const ctq5='CTQ 5-Màu chỉ may đế trung đúng màu đường may suôn đều,đúng vị trí';
const p=t=>`<a:p><a:r><a:rPr sz="1200"/><a:t>${t}</a:t></a:r></a:p>`;
const box=(...paras)=>`<p:sp><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paras.join('')}</p:txBody></p:sp>`;
const mixed1='<a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="1200"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>CTQ 1-</a:t></a:r><a:r><a:rPr lang="vi-VN" sz="1200"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:sym typeface="Arial"/></a:rPr><a:t>Lập thể mặt trước ép phải nổi</a:t></a:r></a:p>';
const mixed5=`<a:p><a:r><a:rPr sz="1200"><a:latin typeface="Arial"/></a:rPr><a:t>CTQ 5-</a:t></a:r><a:r><a:rPr sz="1200"><a:ea typeface="SimSun"/><a:latin typeface="Arial"/></a:rPr><a:t>${ctq5.slice(6)}</a:t></a:r></a:p>`;
async function deck(content){
  const zip=new JSZip();
  zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${box(p('Safety Instructions'))}</p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/slide2.xml',`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${box(p('ISQ STRATEGY-CTQ-CTP'))}${content}</p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>');
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  zip.file('ppt/slides/_rels/slide2.xml.rels','<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test" TargetMode="External"/></Relationships>');
  return zip.generateAsync({type:'nodebuffer'});
}
const targets=new Map([[ctq1,'CTQ 1-Press vamp embossing to obtain clear relief'],[ctq5,'CTQ 5-Strobel stitching thread color correct; stitch smoothly and evenly at the correct position']]);
const opts={sourceLang:'vi',targetLang:'en',mode:'ipqc_bilingual',approvedGlossary:[],historyPairs:[]};
const mock={name:'mock',translateBatch:async({items})=>({results:new Map(items.map(i=>[i.id,targets.get(i.sourceText.trim())||'Verify the inspection requirement'])),provider:'mock',durationMs:0})};

test('ISQ audit includes CTQ 1 and CTQ 5 despite mixed fonts',async()=>{
  const audit=await auditPptxGaps(await deck(box(mixed1)+box(mixed5)),'ISQ-manual.pptx',opts);
  assert.equal(audit.untranslatedCount,2);
  assert.equal(audit.translatableMissingCount,2);
  for(const source of [ctq1,ctq5])assert.equal(audit.units.find(u=>u.sourceText===source).selectedForTranslation,true);
  assert.ok(audit.units.filter(u=>u.requiresTranslation).every(u=>!u.canApply),'ISQ source edits must use slide pairing rather than direct text replacement');
});

for(const mode of ['ipqc_bilingual','isq_duplicate'])test(`Incremental ${mode}: EN then original VI; CTQ 1/5 translated; repeated audit stays stable`,async()=>{
  translationCache.clear();
  const original=await deck(box(mixed1)+box(mixed5));
  const audit=await auditPptxGaps(original,'ISQ-manual.pptx',opts);
  const result=await pptxTranslatorService.translate(original,{sourceLanguage:'vi',targetLanguage:'en',mode,fileName:'ISQ-manual.pptx',provider:mock,translateMissingOnly:true,selectedUnitIds:audit.units.filter(u=>u.selectedForTranslation).map(u=>u.id)});
  const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(result.translatedBuffer);
  const order=await orderedSlidePaths(after),pairs=await readIsqSlidePairs(after);
  assert.equal(order.length,3);assert.equal(pairs.length,1);
  assert.deepEqual(order,['ppt/slides/slide1.xml',pairs[0].en,pairs[0].vi]);
  const en=await after.file(pairs[0].en).async('string');
  assert.equal(hasViDiacritics(paragraphText(en)),false);
  assert.match(paragraphText(en),/CTQ 1-/);assert.match(paragraphText(en),/CTQ 5-/);
  assert.match(en,/val="FF0000"/);assert.match(en,/sz="1200"/);assert.match(en,/cx="300" cy="400"/);
  assert.equal(await after.file(pairs[0].vi).async('string'),await before.file('ppt/slides/slide2.xml').async('string'));
  assert.equal(await after.file('ppt/slides/slide1.xml').async('string'),await before.file('ppt/slides/slide1.xml').async('string'));
  assert.equal(await after.file(pairs[0].vi.replace('slides/','slides/_rels/')+'.rels').async('string'),await before.file('ppt/slides/_rels/slide2.xml.rels').async('string'));
  const again=await auditPptxGaps(result.translatedBuffer,'ISQ-manual.pptx',opts);
  assert.equal(again.untranslatedCount,0);
  assert.ok(again.units.filter(u=>u.location.partPath===pairs[0].vi).every(u=>!u.selectedForTranslation));
  const crawl=await pptxTranslatorService.crawl(result.translatedBuffer,{includeMarkitdown:false});
  assert.deepEqual(crawl.slides.map(s=>s.slideFileName),order);
  assert.deepEqual(crawl.slides.flatMap(s=>s.paragraphs.map(p=>p.id)),again.units.map(u=>u.id));
  const rerun=await pptxTranslatorService.translate(result.translatedBuffer,{sourceLanguage:'vi',targetLanguage:'en',mode,fileName:'ISQ-manual.pptx',provider:mock,translateMissingOnly:true,selectedUnitIds:[]});
  assert.deepEqual(await orderedSlidePaths(await JSZip.loadAsync(rerun.translatedBuffer)),order);
});

test('Explicit English-only mode never creates a VI copy',async()=>{
  translationCache.clear();
  const original=await deck(box(mixed1)+box(mixed5));
  const result=await pptxTranslatorService.translate(original,{sourceLanguage:'vi',targetLanguage:'en',mode:'replace_en',fileName:'ISQ-manual.pptx',provider:mock,translateMissingOnly:true});
  const zip=await JSZip.loadAsync(result.translatedBuffer);
  assert.equal((await orderedSlidePaths(zip)).length,2);
  assert.equal(hasViDiacritics(paragraphText(await zip.file('ppt/slides/slide2.xml').async('string'))),false);
});

test('Mixed emphasis keeps dominant font, size and color without making the whole translation bold',()=>{
  const xml='<a:p><a:pPr algn="r"/><a:r><a:rPr b="1" sz="2000"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Short </a:t></a:r><a:r><a:rPr b="0" sz="2000"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>longer substantive source instruction</a:t></a:r></a:p>';
  const edited=replaceParagraphTranslation(xml,'Check the equipment before operation');
  assert.equal(paragraphText(edited),'Check the equipment before operation');
  assert.match(edited,/<a:pPr algn="r"\/>/);
  const populated=Array.from(edited.matchAll(/<a:r>.*?<\/a:r>/g)).find(m=>paragraphText(m[0]));
  assert.match(populated[0],/b="0"/);assert.match(populated[0],/val="0000FF"/);assert.match(populated[0],/sz="2000"/);assert.match(populated[0],/typeface="Arial"/);
  assert.equal(canTranslateParagraphText('<a:p><a:fld id="x"><a:t>Kiểm tra</a:t></a:fld></a:p>'),false);
});

test('ISQ partial slide selection fails before spending translation requests',async()=>{
  let calls=0;const provider={...mock,translateBatch:async req=>{calls++;return mock.translateBatch(req);}};
  await assert.rejects(pptxTranslatorService.translate(await deck(box(mixed1)+box(mixed5)),{sourceLanguage:'vi',targetLanguage:'en',mode:'ipqc_bilingual',fileName:'ISQ-manual.pptx',provider,translateMissingOnly:true,selectedUnitIds:['s2_p1']}),/ISQ cần dịch đủ cả slide/);
  assert.equal(calls,0);
});

test('An existing in-place EN/VI box becomes separate EN and VI slides without translating its approved counterpart again',async()=>{
  translationCache.clear();
  const en='CTQ 4-Toe, heel and heel strap alignment',vi='CTQ 4-Mũi, gót-dây đai gót thẳng';
  const original=await deck(box(p(en),p(vi)));
  const audit=await auditPptxGaps(original,'ISQ-manual.pptx',opts);
  const source=audit.units.find(u=>u.sourceText===vi);
  assert.equal(source.selectedForTranslation,true);
  let sent=0;const provider={...mock,translateBatch:async req=>{sent+=req.items.length;return mock.translateBatch(req);}};
  const result=await pptxTranslatorService.translate(original,{sourceLanguage:'vi',targetLanguage:'en',mode:'ipqc_bilingual',fileName:'ISQ-manual.pptx',provider,translateMissingOnly:true,selectedUnitIds:[source.id]});
  const zip=await JSZip.loadAsync(result.translatedBuffer),[pair]=await readIsqSlidePairs(zip);
  const english=paragraphText(await zip.file(pair.en).async('string')),vietnamese=paragraphText(await zip.file(pair.vi).async('string'));
  assert.equal((english.match(/CTQ 4-Toe/g)||[]).length,1);assert.ok(!english.includes(vi));
  assert.ok(vietnamese.includes(vi));assert.ok(!vietnamese.includes(en));
  assert.equal(sent,0);
});

test('Multiline translation preserves line breaks while using the dominant source formatting',()=>{
  const xml='<a:p><a:r><a:rPr sz="1200"/><a:t>1.Kiểm tra</a:t></a:r><a:br/><a:r><a:rPr sz="1200"/><a:t>2.Vận hành</a:t></a:r></a:p>';
  const edited=replaceParagraphTranslation(xml,'1.Check\n2.Operate');
  assert.equal(paragraphText(edited),'1.Check\n2.Operate');
  assert.equal((edited.match(/<a:br\/>/g)||[]).length,1);
  assert.ok(!hasViDiacritics(paragraphText(edited)));
});
