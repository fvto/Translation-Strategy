import fs from "fs";

const dbPath = "data/database.json";
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// 1. Remove bad entries that map "may" or "/may" or "may (...)" to "edge" or "margin"
const badIds = new Set([
  "term_footwear_1234",
  "term_footwear_1236",
  "term_footwear_1237",
  "term_footwear_1432",
  "term_footwear_1434",
  "term_footwear_1917",
  "term_footwear_1918",
  "term_may_stitching",
  "term_may_mudguard"
]);

db.terminology = db.terminology.filter((t: any) => !badIds.has(t.id));

// 2. Add correct, fully qualified approved terminology
const newTerms = [
  {
    id: "term_curated_may_stitching",
    sourceTerm: "may",
    targetTerm: "stitching",
    sourceLanguage: "vi",
    targetLanguage: "en",
    definition: "Manufacturing stitching / sewing operation",
    context: "Footwear Manufacturing & Quality Assurance",
    category: "Manufacturing",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v2.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "term_curated_may_mudguard",
    sourceTerm: "may mudguard",
    targetTerm: "stitching mudguard",
    sourceLanguage: "vi",
    targetLanguage: "en",
    definition: "Mudguard stitching operation",
    context: "Footwear Manufacturing & Quality Assurance",
    category: "Manufacturing",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v2.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "term_curated_may_lot_vong_co",
    sourceTerm: "may lót vòng cổ",
    targetTerm: "stitching collar lining",
    sourceLanguage: "vi",
    targetLanguage: "en",
    definition: "Collar lining stitching operation",
    context: "Footwear Manufacturing & Quality Assurance",
    category: "Manufacturing",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v2.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

for (const term of newTerms) {
  db.terminology.push(term);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
console.log("Cleaned and updated database.json successfully!");
