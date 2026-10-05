import fs from 'fs';

const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
console.log('Settings:', db.settings);
