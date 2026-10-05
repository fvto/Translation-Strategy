import fs from 'fs';

const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
let terms = db.terminology || [];
const badEntries = terms.filter((t: any) => t.sourceTerm === 'may' || t.sourceTerm === '/may');
console.log('Bad entries found:', badEntries);

// Fix them: "may" in Vietnamese footwear is "stitching" or remove it if invalid
db.terminology = terms.filter((t: any) => t.sourceTerm !== 'may' && t.sourceTerm !== '/may' && t.sourceTerm !== '(biên)/may');
// Add correct entries
db.terminology.push({
  id: 'term_may_stitching',
  sourceTerm: 'may',
  targetTerm: 'stitching',
  category: 'production',
  status: 'approved',
  createdAt: Date.now(),
  updatedAt: Date.now()
});
db.terminology.push({
  id: 'term_may_mudguard',
  sourceTerm: 'may mudguard',
  targetTerm: 'stitching mudguard',
  category: 'production',
  status: 'approved',
  createdAt: Date.now(),
  updatedAt: Date.now()
});

fs.writeFileSync('data/database.json', JSON.stringify(db, null, 2), 'utf8');
console.log('Fixed database.json terminology!');
