/**
 * Automated Importer for Cuu-am-chan-kinh.xlsx
 * 
 * Re-reads Cuu-am-chan-kinh.xlsx, cleans and expands terms,
 * updates data/database.json, and ensures bidirectional terminology.
 * Run anytime Cuu-am-chan-kinh.xlsx is updated:
 *   node scripts/import_excel_terms.mjs
 */

import fs from 'fs';
import XLSX from 'xlsx';

const EXCEL_FILE = 'Cuu-am-chan-kinh.xlsx';
const DB_FILE = 'data/database.json';

if (!fs.existsSync(EXCEL_FILE)) {
  console.error(`File ${EXCEL_FILE} not found!`);
  process.exit(1);
}

const wb = XLSX.readFile(EXCEL_FILE);
const voca = XLSX.utils.sheet_to_json(wb.Sheets['voca'] || wb.Sheets[wb.SheetNames[0]]);
const sheet1 = wb.Sheets['Sheet1'] ? XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1 }) : [];
const defect = wb.Sheets['Defect Type'] ? XLSX.utils.sheet_to_json(wb.Sheets['Defect Type']) : [];

function clean(s) {
  if (!s) return '';
  return String(s).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanEn(s) {
  let res = clean(s);
  res = res.replace(/^\.{2,}/, '').trim();
  if (res.startsWith('(') && res.endsWith(')')) {
    res = res.slice(1, -1).trim();
  }
  return res.trim();
}

function cleanVn(s) {
  let res = clean(s);
  if (res.startsWith('(') && res.endsWith(')')) {
    res = res.slice(1, -1).trim();
  }
  return res.trim();
}

const mapViToEn = new Map();

function addPair(vi, en) {
  vi = clean(vi);
  en = clean(en);
  if (!vi || !en || vi.length < 2 || en.length < 2) return;
  vi = vi.replace(/^\d+\.\s*/, '').trim();
  en = en.replace(/^\d+\.\s*/, '').trim();
  
  const viLower = vi.toLowerCase();
  if (!mapViToEn.has(viLower)) {
    mapViToEn.set(viLower, en);
  }
}

// 1. voca
for (const r of voca) {
  if (!r.VN || !r.EN) continue;
  const rawVn = clean(r.VN);
  const rawEn = cleanEn(r.EN);
  addPair(rawVn, rawEn);

  if (rawVn.includes('/')) {
    const vParts = rawVn.split('/').map(p => cleanVn(p));
    const eParts = rawEn.includes('/') ? rawEn.split('/').map(p => cleanEn(p)) : [rawEn];
    for (let i = 0; i < vParts.length; i++) {
      addPair(vParts[i], eParts[i] || eParts[0]);
    }
  }

  if (rawVn.includes('(')) {
    const withoutParens = rawVn.replace(/\([^\)]+\)/g, '').replace(/\s+/g, ' ').trim();
    if (withoutParens.length >= 2) {
      addPair(withoutParens, rawEn);
    }
  }
}

// 2. Sheet1
for (const r of sheet1) {
  if (r && r.length >= 4 && r[1] && r[3]) {
    const vn = clean(r[1]);
    const en = cleanEn(r[3]);
    if (vn && en && !vn.startsWith('STT') && isNaN(Number(vn))) {
      addPair(vn, en);
      if (vn.includes('/')) {
        vn.split('/').forEach(p => addPair(cleanVn(p), en));
      }
    }
  }
}

// 3. Defect Type
for (const r of defect) {
  if (r.Issues) {
    const lines = String(r.Issues).split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      addPair(lines[0], lines[1]);
    }
  }
}

// Update DB
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const baseTerms = db.terminology.filter(t => t.sourceDocument !== 'Cuu-am-chan-kinh.xlsx');
let idCounter = 1000;

for (const [viLower, enTarget] of mapViToEn.entries()) {
  idCounter++;
  baseTerms.push({
    id: `term_footwear_${idCounter}`,
    sourceTerm: viLower,
    targetTerm: enTarget,
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    definition: 'Footwear specification term from Cuu-am-chan-kinh.xlsx',
    context: 'Footwear Manufacturing & Quality Assurance',
    category: 'Manufacturing',
    sourceDocument: 'Cuu-am-chan-kinh.xlsx',
    status: 'approved',
    priority: 1,
    confidence: 1.0,
    createdBy: 'admin@secure.local',
    approvedBy: 'reviewer@secure.local',
    version: 'v2.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

db.terminology = baseTerms;
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log(`Successfully imported ${mapViToEn.size} footwear terms from ${EXCEL_FILE} into ${DB_FILE}`);
