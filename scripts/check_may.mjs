import fs from 'fs';
const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
const mayTerms = db.terminology.filter(t => t.status === 'approved' && (t.sourceTerm.toLowerCase() === 'may' || t.targetTerm.toLowerCase() === 'may' || t.sourceTerm.toLowerCase().includes('đường may') || t.targetTerm.toLowerCase().includes('đường may')));
console.log('Terms with "may" or "đường may":');
mayTerms.forEach(t => console.log(`  [${t.sourceLanguage}->${t.targetLanguage}] "${t.sourceTerm}" -> "${t.targetTerm}"`));

// Also check the reverse: what happens when sourceLang=vi, targetLang=en
const reversed = db.terminology
  .filter(t => t.status === 'approved' && t.sourceLanguage === 'en' && t.targetLanguage === 'vi')
  .filter(t => t.targetTerm.toLowerCase() === 'may' || t.sourceTerm.toLowerCase() === 'stitching');

console.log('\nTerms where "stitching" or reverse "may":');
reversed.forEach(t => console.log(`  EN: "${t.sourceTerm}" -> VI: "${t.targetTerm}"`));
