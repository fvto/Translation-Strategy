import fs from 'fs';

const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
const terms = db.terminology || [];
const matched = terms.filter((t: any) => /mudguard|may/i.test(t.sourceTerm));
console.log(`Matched ${matched.length} terms:`);
matched.forEach((t: any) => console.log(`  "${t.sourceTerm}" -> "${t.targetTerm}"`));
