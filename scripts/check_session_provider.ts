import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data/secure_storage/pptx_sessions/pptx_1790322439931_a05945ff.json', 'utf8'));
console.log('Mode:', data.mode);
console.log('Total slides:', data.slides?.length);
