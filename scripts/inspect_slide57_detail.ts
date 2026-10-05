import JSZip from 'jszip';
import fs from 'fs';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790319031612_5b1eaded.orig.pptx';
  const transPath = 'C:\\Users\\User\\Downloads\\FA22\u00a0AIR\u00a0JORDAN\u00a01\u00a0MID\u00a0(MS-WS)\u00a0QA\u00a0IPQC\u00a0manual-EN (1).pptx';
  
  const origZip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const transZip = await JSZip.loadAsync(fs.readFileSync(transPath));
  
  const origXml = await origZip.file('ppt/slides/slide57.xml').async('string');
  const transXml = await transZip.file('ppt/slides/slide57.xml').async('string');
  
  fs.writeFileSync('scratch/orig_slide57.xml', origXml, 'utf8');
  fs.writeFileSync('scratch/trans_slide57.xml', transXml, 'utf8');
  console.log('Saved orig_slide57.xml and trans_slide57.xml');
}

test().catch(console.error);
