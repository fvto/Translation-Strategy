import fs from 'fs';
import path from 'path';

const downloadDir = 'C:\\Users\\User\\Downloads';
const files = fs.readdirSync(downloadDir).filter(f => f.includes('FA22') && f.endsWith('.pptx'));
for (const f of files) {
  const p = path.join(downloadDir, f);
  const s = fs.statSync(p);
  console.log(f, s.size, s.mtime.toISOString());
}
