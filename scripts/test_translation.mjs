import fs from 'fs';

// Load dictionary
const dictContent = fs.readFileSync('services/translation/dictionary.ts', 'utf8');

// Extract COMMON_PHRASES
const phrasesMatch = dictContent.match(/COMMON_PHRASES[^=]*=\s*\[([\s\S]*?)\];/);
const dictMatch = dictContent.match(/OFFLINE_DICTIONARY[^=]*=\s*\{([\s\S]*?)\};/);

// Test Vietnamese text from user's screenshot
const testTexts = [
  '*Bao trung đế sau khi cắt laze.',
  'Kiểm tra đường cắt laze.',
  'Đường cắt cách biên trung đế.',
  'Các lỗ cắt laze phải đúng tiêu chuẩn file.',
  'Kiểm tra bao trung đế.',
];

// Read db to check terminology count
const dbData = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
const approved = dbData.terminology.filter(t => t.status === 'approved');
const review = dbData.terminology.filter(t => t.status === 'review');

console.log(`Total terminology: ${dbData.terminology.length}`);
console.log(`Approved: ${approved.length}`);
console.log(`Review: ${review.length}`);
console.log();

// Check for specific Vietnamese terms in the terminology
const viTerms = ['trung đế', 'đường cắt', 'laze', 'laser', 'cắt', 'biên', 'tiêu chuẩn', 'kiểm tra', 'bao', 'lỗ', 'file', 'đúng', 'sau khi', 'cách'];
console.log('=== Term presence in database (as source or target) ===');
for (const vt of viTerms) {
  const found = dbData.terminology.filter(t => 
    t.sourceTerm.toLowerCase().includes(vt.toLowerCase()) || 
    t.targetTerm.toLowerCase().includes(vt.toLowerCase())
  );
  console.log(`"${vt}": ${found.length} entries`);
  found.forEach(f => console.log(`  [${f.status}] "${f.sourceTerm}" -> "${f.targetTerm}" (${f.sourceLanguage}->${f.targetLanguage})`));
}

// Check approved terms that would be reversed for VI->EN
console.log('\n=== Approved terms for VI->EN (reversed EN->VI terms) ===');
const reversedForViEn = approved
  .filter(t => t.sourceLanguage === 'en' && t.targetLanguage === 'vi')
  .slice(0, 20);
for (const t of reversedForViEn) {
  console.log(`  VI: "${t.targetTerm}" -> EN: "${t.sourceTerm}"`);
}

console.log(`\nTotal reversed terms for VI->EN: ${reversedForViEn.length}`);
