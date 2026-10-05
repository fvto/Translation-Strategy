import fs from 'fs';

async function test() {
  const jsonPath = 'data/secure_storage/pptx_sessions/pptx_1790322439931_a05945ff.json';
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log('Session ID:', data.id);
  console.log('File Name:', data.fileName);
  console.log('Created At:', new Date(data.createdAt).toISOString());
  console.log('Total Slides:', data.slides?.length);
  
  // Check slide 41, 42, 43, 44, 45, 57, 63 in session JSON
  for (const sNum of [41, 42, 43, 44, 45, 57, 63]) {
    const s = data.slides?.find((sl: any) => sl.slideIndex === sNum);
    console.log(`\n=== SLIDE ${sNum} in JSON ===`);
    if (!s) {
      console.log('  NOT FOUND');
      continue;
    }
    for (const p of s.paragraphs) {
      console.log(`  [${p.id}] ORIG: "${p.originalText.slice(0, 50)}"`);
      console.log(`         TRANS: "${p.translatedText ? p.translatedText.slice(0, 50) : '(empty)'}"`);
    }
  }
}

test().catch(console.error);
