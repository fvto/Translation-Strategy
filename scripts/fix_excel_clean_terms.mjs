import fs from "fs";

const dbPath = "data/database.json";
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// 1. Remove corrupted "may" entries that map to "margin" or "edge"
const removeIds = new Set([
  "term_footwear_1434",
  "term_footwear_1236",
  "term_footwear_1237",
  "term_footwear_1432",
  "term_footwear_1917",
  "term_footwear_1918",
]);

db.terminology = db.terminology.filter((t) => !removeIds.has(t.id));

// 2. Add high-accuracy manufacturing terminology for sewing and heel operations
const newOrUpdated = [
  { sourceTerm: "may", targetTerm: "stitching" },
  { sourceTerm: "may gót", targetTerm: "heel stitching" },
  { sourceTerm: "may gót thẳng", targetTerm: "heel stitching is straight" },
  { sourceTerm: "tâm eo", targetTerm: "quarter notch" },
  { sourceTerm: "tâm giữa gót", targetTerm: "heel center notch" },
  { sourceTerm: "đường zigzag eo", targetTerm: "quarter zigzag line" },
  { sourceTerm: "đường zigzag", targetTerm: "zigzag line" },
  { sourceTerm: "lỗ định vị", targetTerm: "positioning holes" },
  { sourceTerm: "biên liệu", targetTerm: "material edge" },
  { sourceTerm: "biên liệu logo", targetTerm: "logo material edge" },
  { sourceTerm: "phần biên gót", targetTerm: "heel margin portion" },
  { sourceTerm: "biên gót", targetTerm: "heel margin" },
  { sourceTerm: "ôm sát biên logo", targetTerm: "hug closely along the logo margin" },
  { sourceTerm: "ôm sát", targetTerm: "hug closely along" },
  { sourceTerm: "thành phẩm", targetTerm: "finished product" },
  { sourceTerm: "tránh tình trạng", targetTerm: "avoid situation where" },
  { sourceTerm: "hở/lấp logo", targetTerm: "open or covering logo" },
  { sourceTerm: "lấp logo", targetTerm: "covering logo" },
  { sourceTerm: "lấp", targetTerm: "overlap" },
  { sourceTerm: "tâm", targetTerm: "notch" },
  { sourceTerm: "eo", targetTerm: "quarter" },
];

for (const item of newOrUpdated) {
  const existing = db.terminology.find(
    (t) => t.sourceTerm.toLowerCase() === item.sourceTerm.toLowerCase()
  );
  if (existing) {
    existing.targetTerm = item.targetTerm;
    existing.status = "approved";
  } else {
    db.terminology.push({
      id: `term_curated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceTerm: item.sourceTerm,
      targetTerm: item.targetTerm,
      sourceLanguage: "vi",
      targetLanguage: "en",
      definition: "Curated footwear terminology for heel & stitching operations",
      context: "Footwear Manufacturing & Quality Assurance",
      category: "Manufacturing",
      sourceDocument: "Cuu-am-chan-kinh.xlsx",
      status: "approved",
      priority: 3,
      confidence: 1,
      createdBy: "admin@secure.local",
      approvedBy: "reviewer@secure.local",
      version: "v2.1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

// 3. Clean all targetTerms in the database from raw annotations like "(ưu tiên)"
for (const t of db.terminology) {
  if (typeof t.targetTerm === "string") {
    // If has "(ưu tiên)"
    const pref = t.targetTerm.match(/([A-Za-z0-9\s\-]+)\s*\(\s*ưu\s*tiên\s*\)/i);
    if (pref) {
      t.targetTerm = pref[1].trim();
    }
    // Remove other Vietnamese parenthetical comments in targetTerm
    t.targetTerm = t.targetTerm
      .replace(/\s*\([^)]*[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ][^)]*\)/gi, "")
      .trim();
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
console.log(`Updated database.json. Total terms: ${db.terminology.length}`);
