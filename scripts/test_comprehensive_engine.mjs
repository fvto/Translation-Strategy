import { COMMON_PHRASES, OFFLINE_DICTIONARY } from '../services/translation/dictionary.ts';
import { db } from '../services/database/db.ts';

const text = `1.Kiểm tra rập lạng và cử máy lạng/mài phải đúng tiêu chuẩn theo từng bộ vị
2.Kiểm tra đặt liệu vào rập lạng/mài phải khớp rập hoặc vừa tới cử của máy
3.Kiểm tra sau khi lạng/mài độ rộng và độ dày phải theo tiêu chuẩn PFC cho từng bộ vị để tránh tình giày thành phẩm bị ngấn/cộm,trề biên liệu`;

console.log("Checking terms in database...");
const approved = db.getApprovedTerminology("vi", "en");
console.log("Total approved terms:", approved.length);

const matchedInText = [];
for (const entry of approved) {
  const raw = entry.sourceTerm.trim();
  if (!raw || raw.length < 2) continue;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, 'giu');
  let m;
  while ((m = reg.exec(text)) !== null) {
    matchedInText.push({ term: raw, target: entry.targetTerm, match: m[1] });
  }
}

console.log("Matched in text from DB:", matchedInText.length);
matchedInText.forEach(m => console.log(` -> "${m.match}" => "${m.target}"`));
