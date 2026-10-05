import JSZip from 'jszip';
import fs from 'fs';

async function check(p: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  console.log(`${p}: ${rIds.length} slides in presentation.xml`);
}

async function main() {
  await check('data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx');
  await check('data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.trans.pptx');
}

main().catch(console.error);
