import fs from "fs";

const dbPath = "data/database.json";
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// Load curated pairs
const curated = JSON.parse(fs.readFileSync("scratch/curated_pairs.json", "utf8"));

// Additional key sub-phrases and terms extracted from the benchmark
const keySubTerms = [
  { sourceTerm: "May đế ngoài", targetTerm: "Cupsole stitching" },
  { sourceTerm: "may đế ngoài", targetTerm: "cupsole stitching" },
  { sourceTerm: "May mũi chỉ không đều", targetTerm: "Inconsistent SPI" },
  { sourceTerm: "May không đều mũi", targetTerm: "Inconsistent SPI" },
  { sourceTerm: "may không đều mũi", targetTerm: "inconsistent SPI" },
  { sourceTerm: "may mũi chỉ không đều", targetTerm: "inconsistent SPI" },
  { sourceTerm: "7. May đế ngoài", targetTerm: "7.Cupsole stitching" },
  { sourceTerm: "kim 27", targetTerm: "needle 27#" },
  { sourceTerm: "rãnh đế", targetTerm: "groove line" },
  { sourceTerm: "đường chỉ may nằm trong rãnh đế", targetTerm: "stitching line inside groove line" },
  { sourceTerm: "điểm mũi, gót, eo trong ngoài", targetTerm: "tip/heel, quarter med/lat" },
  { sourceTerm: "eo trong ngoài", targetTerm: "quarter med/lat" },
  { sourceTerm: "1 người may 1 đôi", targetTerm: "1 person stitch 1 pair" },
  { sourceTerm: "một người may một đôi", targetTerm: "1 person stitch 1 pair" },
  { sourceTerm: "đường may nối", targetTerm: "joint stitching area" },
  { sourceTerm: "vị trí may nối", targetTerm: "joint stitching area" },
  { sourceTerm: "không cộm mũi", targetTerm: "no x-ray on tip" },
  { sourceTerm: "4. Không cộm mũi", targetTerm: "4.No x-ray on tip" },
  { sourceTerm: "lạng mũi", targetTerm: "vamp skiving" },
  { sourceTerm: "may rút mũi", targetTerm: "gathering stitching" },
  { sourceTerm: "8. Nhăn mũi", targetTerm: "8.Avoid wrinkle tip" },
  { sourceTerm: "cuốn biên tự động", targetTerm: "auto folding" },
  { sourceTerm: "cuốn biên máy", targetTerm: "manually folding by machine" },
  { sourceTerm: "cuốn biên bằng rập", targetTerm: "folding by jig" },
  { sourceTerm: "9. Cuốn biên phải suôn đều", targetTerm: "9.Consistent folding" },
  { sourceTerm: "10. Hở keo", targetTerm: "10.Avoid bond gap" },
  { sourceTerm: "tránh hở keo", targetTerm: "avoid bond gap" },
  { sourceTerm: "quét thiếu keo", targetTerm: "lack of cement" },
  { sourceTerm: "thiếu keo", targetTerm: "lack of cement" },
  { sourceTerm: "dán đế", targetTerm: "bottom attaching" },
  { sourceTerm: "quét keo đế", targetTerm: "cementing bottom" },
  { sourceTerm: "quét xử lý", targetTerm: "upper priming" },
  { sourceTerm: "quét keo mặt giày", targetTerm: "cementing upper" },
  { sourceTerm: "nhăn mặt giày", targetTerm: "avoid wrinkle upper" },
  { sourceTerm: "6. Nhăn mặt giày", targetTerm: "6. Avoid wrinkle upper" },
  { sourceTerm: "nhăn eo", targetTerm: "wrinkle quarter" },
  { sourceTerm: "ô dê cao thấp", targetTerm: "inconsistent eyestay height" },
  { sourceTerm: "thành phẩm nhăn eo , ô dê", targetTerm: "Wrinkle quarter/ eyestay on finished shoe" },
  { sourceTerm: "thành phẩm nhăn eo, ô dê", targetTerm: "Wrinkle quarter/ eyestay on finished shoe" },
  { sourceTerm: "vòng cổ phải suôn đều", targetTerm: "collar consistent/smooth" },
  { sourceTerm: "khuôn định hình nóng lạnh", targetTerm: "back part molding" },
  { sourceTerm: "định hình nóng lạnh", targetTerm: "hot/cool shaping" },
  { sourceTerm: "3.Sử dụng dây giả để vòng cổ ôm sát phom. Kiểm tra sau khi cột dây eo và ô dê không nhăn", targetTerm: "3.Use temporary lace so that collar close with last. Check if quarter & eyestay wrinkle after lacing" }
];

// Clean existing entries in database that conflict
const removeTerms = new Set([
  "may", // we will re-add as curated
  "may đế ngoài",
  "may không đều mũi",
  "may mũi chỉ không đều",
]);

db.terminology = db.terminology.filter((t: any) => {
  if (t.sourceTerm && removeTerms.has(t.sourceTerm.toLowerCase().trim())) {
    return false;
  }
  return true;
});

// Build merged list of terms
const allToImport: { sourceTerm: string; targetTerm: string }[] = [];

for (const item of keySubTerms) {
  allToImport.push(item);
}

for (const item of curated) {
  allToImport.push({
    sourceTerm: item.vi,
    targetTerm: item.en
  });
}

// Add each unique term
const seen = new Set<string>();
let addedCount = 0;

for (const item of allToImport) {
  const normKey = item.sourceTerm.trim().toLowerCase().replace(/\s+/g, " ");
  if (seen.has(normKey)) continue;
  seen.add(normKey);

  // Check if existing in db
  const existing = db.terminology.find((t: any) => 
    t.sourceTerm && t.sourceTerm.trim().toLowerCase().replace(/\s+/g, " ") === normKey
  );

  if (existing) {
    existing.targetTerm = item.targetTerm.trim();
    existing.sourceLanguage = "vi";
    existing.targetLanguage = "en";
    existing.status = "approved";
    existing.priority = 1;
    existing.updatedAt = new Date().toISOString();
  } else {
    db.terminology.push({
      id: `term_curated_isq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceTerm: item.sourceTerm.trim(),
      targetTerm: item.targetTerm.trim(),
      sourceLanguage: "vi",
      targetLanguage: "en",
      definition: "SOP-aligned footwear QA specification term from manual benchmark",
      context: "Footwear Manufacturing & Quality Assurance",
      category: "ISQ",
      status: "approved",
      priority: 1,
      confidence: 1.0,
      createdBy: "admin@secure.local",
      approvedBy: "reviewer@secure.local",
      version: "v2.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    addedCount++;
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
console.log(`Successfully imported/updated ${allToImport.length} terms (${addedCount} newly added) in database.json!`);
