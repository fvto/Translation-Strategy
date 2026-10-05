import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origZip = await JSZip.loadAsync(fs.readFileSync('data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx'));
  const s86 = await origZip.file('ppt/slides/slide86.xml')?.async('string');
  console.log('Slide 86 in ORIG exists?', !!s86);
  if (s86) {
    const ts = (s86.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    console.log('Slide 86 text:', ts.join(' // '));
  }
}
test().catch(console.error);
