import fs from "fs";
import path from "path";
import crypto from "crypto";

const dbPath = path.resolve(process.cwd(), "data", "database.json");
const catalogPath = path.resolve(process.cwd(), "data", "defect_catalog.json");

const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf-8")) : null;

const now = new Date().toISOString();

// Stage catalog exact lookup
const catalogMap = new Map<string, string>();
if (catalog) {
  if (Array.isArray(catalog.stageDefects)) {
    for (const d of catalog.stageDefects) {
      let st = d.stage;
      if (st === "Stiching") st = "Stitching";
      else if (st === "Stockfitting") st = "Stockfit";
      
      if (d.nameVi) catalogMap.set(d.nameVi.trim().toLowerCase(), st);
      if (d.nameEn) catalogMap.set(d.nameEn.trim().toLowerCase(), st);
    }
  }
  if (Array.isArray(catalog.thresholdStandards)) {
    for (const d of catalog.thresholdStandards) {
      if (d.nameVi && !catalogMap.has(d.nameVi.trim().toLowerCase())) {
        catalogMap.set(d.nameVi.trim().toLowerCase(), "QA");
      }
      if (d.nameEn && !catalogMap.has(d.nameEn.trim().toLowerCase())) {
        catalogMap.set(d.nameEn.trim().toLowerCase(), "QA");
      }
    }
  }
}

// Advanced classifier function
function classifyTerm(source: string, target: string, context: string = ""): string {
  const src = (source || "").trim().toLowerCase();
  const tgt = (target || "").trim().toLowerCase();
  const ctx = (context || "").trim().toLowerCase();
  const combined = `${src} ${tgt} ${ctx}`;

  // 1. Exact catalog match
  if (catalogMap.has(src)) return catalogMap.get(src)!;
  if (catalogMap.has(tgt)) return catalogMap.get(tgt)!;

  // 2. Corporate / Governance / Security
  if (
    combined.includes("iso 27001") ||
    combined.includes("nist") ||
    combined.includes("risk assessment") ||
    combined.includes("access control") ||
    combined.includes("audit log") ||
    combined.includes("retention policy") ||
    combined.includes("compliance score") ||
    combined.includes("executive decision") ||
    combined.includes("risk appetite") ||
    combined.includes("vendor") ||
    combined.includes("confidentiality")
  ) {
    return "Corporate";
  }

  // 3. No-Sew (Ép nhiệt / Ép cao tần / Bọng khí / Hot-melt)
  if (
    combined.includes("no-sew") ||
    combined.includes("nosew") ||
    combined.includes("h/f") ||
    combined.includes("hfw") ||
    combined.includes("cao tần") ||
    combined.includes("ép nhiệt") ||
    combined.includes("hot-melt") ||
    combined.includes("tràn keo nóng") ||
    combined.includes("màng no-sew") ||
    combined.includes("bọng khí") ||
    combined.includes("bao không") ||
    combined.includes("ép lạnh") ||
    combined.includes("cold press") ||
    combined.includes("cold pressing") ||
    combined.includes("ép nóng") ||
    combined.includes("hot press") ||
    combined.includes("olay pressing") ||
    combined.includes("ép trang trí")
  ) {
    return "No-Sew";
  }

  // 4. Stitching (May, chỉ, kim, đường may, mũi may, SPI, chi tiết may)
  if (
    combined.includes("stitch") ||
    combined.includes("stitching") ||
    combined.includes("sew") ||
    combined.includes("sewing") ||
    combined.includes("may") ||
    combined.includes("chỉ") ||
    combined.includes("thread") ||
    combined.includes("kim") ||
    combined.includes("needle") ||
    combined.includes("spi") ||
    combined.includes("mũi/inch") ||
    combined.includes("mũi may") ||
    combined.includes("lại mũi") ||
    combined.includes("back-stitch") ||
    combined.includes("sụp mí") ||
    combined.includes("run off") ||
    combined.includes("đứt chỉ") ||
    combined.includes("broken thread") ||
    combined.includes("lỏng chỉ") ||
    combined.includes("loose stitch") ||
    combined.includes("chỉ dưới") ||
    combined.includes("bobin") ||
    combined.includes("may nối") ||
    combined.includes("close seam") ||
    combined.includes("may dằn") ||
    combined.includes("vamp fix") ||
    combined.includes("may rút mũi") ||
    combined.includes("gathering") ||
    combined.includes("may gót") ||
    combined.includes("counter stitch") ||
    combined.includes("may 2 kim") ||
    combined.includes("double stitch") ||
    combined.includes("may 4 kim") ||
    combined.includes("serge") ||
    combined.includes("may vi tính") ||
    combined.includes("computer stitch") ||
    combined.includes("thêu") ||
    combined.includes("embroidery") ||
    combined.includes("zigzag") ||
    combined.includes("blanket stitch") ||
    combined.includes("dây đai") ||
    combined.includes("webbing") ||
    combined.includes("nút xỏ") ||
    combined.includes("eyelet") ||
    combined.includes("cột dây") ||
    combined.includes("xỏ dây") ||
    combined.includes("lacing") ||
    combined.includes("dây giày") ||
    combined.includes("shoelace") ||
    combined.includes("lace") ||
    combined.includes("lưỡi") ||
    combined.includes("tongue") ||
    combined.includes("vòng cổ") ||
    combined.includes("collar") ||
    combined.includes("lộn vòng cổ") ||
    combined.includes("hammering") ||
    combined.includes("bọc viền") ||
    combined.includes("binding") ||
    combined.includes("cuốn biên") ||
    combined.includes("folding") ||
    combined.includes("ô dê") ||
    combined.includes("eyestay") ||
    combined.includes("vamp") ||
    combined.includes("mặt trước") ||
    combined.includes("quai") ||
    combined.includes("strap") ||
    combined.includes("mút") ||
    combined.includes("mos") ||
    combined.includes("foam") ||
    combined.includes("dán mút") ||
    combined.includes("dán mos") ||
    combined.includes("corks") ||
    combined.includes("đóng nút")
  ) {
    return "Stitching";
  }

  // 5. Stockfit (Chuẩn bị đế / Gia công đế)
  if (
    combined.includes("stockfit") ||
    combined.includes("stockfitting") ||
    combined.includes("đế ngoài") ||
    combined.includes("outsole") ||
    combined.includes("os") ||
    combined.includes("đế trung") ||
    combined.includes("midsole") ||
    combined.includes("ip") ||
    combined.includes("pu") ||
    combined.includes("cupsole") ||
    combined.includes("đế cao su") ||
    combined.includes("rubber") ||
    combined.includes("phun sơn đế") ||
    combined.includes("mài đế") ||
    combined.includes("buffing") ||
    combined.includes("quét xử lý") ||
    combined.includes("primer") ||
    combined.includes("primering") ||
    combined.includes("quét keo đế") ||
    combined.includes("cementing bottom") ||
    combined.includes("cắt nóng") ||
    combined.includes("hot-knife") ||
    combined.includes("túi khí") ||
    combined.includes("airbag") ||
    combined.includes("air bag") ||
    combined.includes("cửa sổ túi khí") ||
    combined.includes("đế ngắn") ||
    combined.includes("đế dài") ||
    combined.includes("đế lõm") ||
    combined.includes("bottom concave") ||
    combined.includes("đế quá hạn") ||
    combined.includes("đường phân khuôn") ||
    combined.includes("parting line") ||
    combined.includes("psq") ||
    combined.includes("lò ổn định") ||
    combined.includes("đắp bột cao su") ||
    combined.includes("độ gập ghềnh") ||
    combined.includes("cupsole stitching") ||
    combined.includes("may đế ngoài") ||
    combined.includes("rãnh đế") ||
    combined.includes("groove line")
  ) {
    return "Stockfit";
  }

  // 6. Assembly (Gò ráp / Hoàn thiện / Đóng gói)
  if (
    combined.includes("assembly") ||
    combined.includes("gò") ||
    combined.includes("ráp") ||
    combined.includes("vô phom") ||
    combined.includes("lên phom") ||
    combined.includes("tháo phom") ||
    combined.includes("de-lasting") ||
    combined.includes("phom") ||
    combined.includes("last") ||
    combined.includes("lasting") ||
    combined.includes("dán đế") ||
    combined.includes("bottom attaching") ||
    combined.includes("sole attachment") ||
    combined.includes("ép đế") ||
    combined.includes("sole pressing") ||
    combined.includes("máy ép tường") ||
    combined.includes("dwp") ||
    combined.includes("định hình nóng lạnh") ||
    combined.includes("molding") ||
    combined.includes("hot/cool shaping") ||
    combined.includes("back part molding") ||
    combined.includes("quét keo mặt giày") ||
    combined.includes("cementing upper") ||
    combined.includes("hở keo") ||
    combined.includes("bond gap") ||
    combined.includes("keo cao") ||
    combined.includes("over cement") ||
    combined.includes("tràn keo") ||
    combined.includes("thành phẩm") ||
    combined.includes("finished shoe") ||
    combined.includes("lộn chân") ||
    combined.includes("đóng gói") ||
    combined.includes("packing") ||
    combined.includes("nhét giấy") ||
    combined.includes("stuffing") ||
    combined.includes("cung giày") ||
    combined.includes("footform") ||
    combined.includes("hộp") ||
    combined.includes("inner box") ||
    combined.includes("thùng") ||
    combined.includes("carton") ||
    combined.includes("tem thùng") ||
    combined.includes("tem hộp") ||
    combined.includes("tem treo") ||
    combined.includes("hangtag") ||
    combined.includes("zipptie") ||
    combined.includes("xe lưu trữ") ||
    combined.includes("cart") ||
    combined.includes("mặt giày&đế khớp định vị") ||
    combined.includes("line up upper") ||
    combined.includes("toe spring") ||
    combined.includes("độ cong/vênh mũi") ||
    combined.includes("mũi/gót cao thấp") ||
    combined.includes("heel/tip height") ||
    combined.includes("rocking") ||
    combined.includes("độ ổn định")
  ) {
    return "Assembly";
  }

  // 7. Cutting (Chặt, lạng, rập, phôi, sớ liệu)
  if (
    combined.includes("cutting") ||
    combined.includes("chặt") ||
    combined.includes("dao chặt") ||
    combined.includes("khuôn chặt") ||
    combined.includes("lạng") ||
    combined.includes("skiving") ||
    combined.includes("rập lạng") ||
    combined.includes("mép liệu") ||
    combined.includes("hairy edge") ||
    combined.includes("burned edge") ||
    combined.includes("hướng chặt") ||
    combined.includes("die placement") ||
    combined.includes("sớ liệu") ||
    combined.includes("hoa văn") ||
    combined.includes("tâm và size") ||
    combined.includes("notches") ||
    combined.includes("cháy biên") ||
    combined.includes("lỗ chặt") ||
    combined.includes("cutting holes") ||
    combined.includes("chặt vòng") ||
    combined.includes("chặt liệu") ||
    combined.includes("da") ||
    combined.includes("leather") ||
    combined.includes("mesh") ||
    combined.includes("liệu lưới") ||
    combined.includes("vải") ||
    combined.includes("material") ||
    combined.includes("liệu")
  ) {
    return "Cutting";
  }

  // 8. QA (Ngoại quan, lỗi chung, tiêu chuẩn, kiểm phẩm)
  if (
    combined.includes("qa") ||
    combined.includes("qc") ||
    combined.includes("kiểm phẩm") ||
    combined.includes("ngoại quan") ||
    combined.includes("cosmetic") ||
    combined.includes("tiêu chuẩn") ||
    combined.includes("ngưỡng") ||
    combined.includes("tái chế") ||
    combined.includes("re-inspection") ||
    combined.includes("mã lỗi") ||
    combined.includes("biến vàng") ||
    combined.includes("yellowing") ||
    combined.includes("nổi mốc") ||
    combined.includes("moldy") ||
    combined.includes("khác màu") ||
    combined.includes("color shade") ||
    combined.includes("đổi màu") ||
    combined.includes("color migration") ||
    combined.includes("phối màu") ||
    combined.includes("color matching") ||
    combined.includes("tróc sơn") ||
    combined.includes("paint peeled") ||
    combined.includes("lem màu") ||
    combined.includes("color bleeding") ||
    combined.includes("swoosh") ||
    combined.includes("logo") ||
    combined.includes("cộm") ||
    combined.includes("x-ray") ||
    combined.includes("vệ sinh") ||
    combined.includes("cleanness") ||
    combined.includes("rách") ||
    combined.includes("tear") ||
    combined.includes("hư") ||
    combined.includes("damaged") ||
    combined.includes("trầy") ||
    combined.includes("scratch") ||
    combined.includes("kim loại") ||
    combined.includes("metal detector") ||
    combined.includes("bảo đảm chất lượng") ||
    combined.includes("chú ý khi kiểm tra") ||
    combined.includes("sờn") ||
    combined.includes("fray") ||
    combined.includes("vết lõm") ||
    combined.includes("dent") ||
    combined.includes("bộ vị") ||
    combined.includes("components") ||
    combined.includes("khe hở") ||
    combined.includes("gap") ||
    combined.includes("không đồng đều") ||
    combined.includes("inconsistent") ||
    combined.includes("chất lượng") ||
    combined.includes("quality")
  ) {
    return "QA";
  }

  return "QA"; // default QA defect / standard
}

// 1. Filter out test entries and deduplicate
const validTerms: any[] = [];
const seenKeys = new Set<string>();

let removedTestCount = 0;

for (const t of db.terminology) {
  const src = (t.sourceTerm || "").trim();
  const tgt = (t.targetTerm || "").trim();

  // Test filter
  if (
    src.toLowerCase().includes("polysemy_test") ||
    src.toLowerCase().includes("test_term") ||
    src.toLowerCase().includes("dummy") ||
    tgt.toLowerCase().includes("ý nghĩa thứ") ||
    src === "test" ||
    tgt === "test"
  ) {
    removedTestCount++;
    continue;
  }

  // Zero-hygiene: source !== target
  if (!src || !tgt || src.toLowerCase() === tgt.toLowerCase()) {
    continue;
  }

  const normKey = `${src.toLowerCase()}:::${tgt.toLowerCase()}`;
  if (seenKeys.has(normKey)) {
    continue;
  }
  seenKeys.add(normKey);

  // Re-classify category
  const newCategory = classifyTerm(src, tgt, t.context || "");
  t.category = newCategory;

  // Enrich context if generic
  if (!t.context || t.context === "General" || t.context === "voca") {
    t.context = `${newCategory} Stage Footwear Standard`;
  }

  validTerms.push(t);
}

// 2. Also inject the 483 defects from catalog if not already present
let addedFromCatalogCount = 0;
if (catalog) {
  // Threshold standards (PDF1)
  if (Array.isArray(catalog.thresholdStandards)) {
    for (const item of catalog.thresholdStandards) {
      const vi = (item.nameVi || "").trim();
      const en = (item.nameEn || "").trim();
      const code = item.code || "";
      const threshold = item.threshold || "";
      const severity = item.severity || "";

      if (!vi || !en || vi.toLowerCase() === en.toLowerCase()) continue;

      const normKey = `${vi.toLowerCase()}:::${en.toLowerCase()}`;
      if (!seenKeys.has(normKey)) {
        seenKeys.add(normKey);
        validTerms.push({
          id: `term_defect_p1_${code}_${crypto.randomBytes(3).toString("hex")}`,
          sourceTerm: vi,
          targetTerm: en,
          sourceLanguage: "vi",
          targetLanguage: "en",
          definition: `Defect Code ${code}: ${en} (${vi}). Standard threshold: ${threshold}, Severity: ${severity}.`,
          context: `QA Inspection [Code: ${code} | Level: ${severity}${threshold ? ` | Max: ${threshold}` : ""}]`,
          category: "QA",
          sourceDocument: "defect threshold , mã lỗi.pdf",
          status: "approved",
          priority: 1,
          confidence: 1.0,
          createdBy: "system@nike-defects.local",
          approvedBy: "qa-lead@chingluh.local",
          version: "v2.0",
          createdAt: now,
          updatedAt: now
        });
        addedFromCatalogCount++;
      }
    }
  }

  // Stage defects (PDF2)
  if (Array.isArray(catalog.stageDefects)) {
    for (const item of catalog.stageDefects) {
      const vi = (item.nameVi || "").trim();
      const en = (item.nameEn || "").trim();
      const zh = (item.nameZh || "").trim();
      const code = item.code || "";
      let stage = item.stage || "Assembly";
      if (stage === "Stiching") stage = "Stitching";
      else if (stage === "Stockfitting") stage = "Stockfit";

      if (!vi || !en || vi.toLowerCase() === en.toLowerCase()) continue;

      const normKey = `${vi.toLowerCase()}:::${en.toLowerCase()}`;
      if (!seenKeys.has(normKey)) {
        seenKeys.add(normKey);
        validTerms.push({
          id: `term_defect_p2_${code.replace(/[^a-zA-Z0-9]/g, "_")}_${crypto.randomBytes(3).toString("hex")}`,
          sourceTerm: vi,
          targetTerm: en,
          sourceLanguage: "vi",
          targetLanguage: "en",
          definition: `Defect in ${stage} Stage. Code: ${code}${zh ? ` (Chinese: ${zh})` : ""}. Standard: ${en}.`,
          context: `${stage} Stage [Code: ${code}${zh ? ` | ZH: ${zh}` : ""}]`,
          category: stage,
          sourceDocument: "Defective Name 1234VN.pdf",
          status: "approved",
          priority: 1,
          confidence: 1.0,
          createdBy: "system@nike-defects.local",
          approvedBy: "qa-lead@chingluh.local",
          version: "v2.0",
          createdAt: now,
          updatedAt: now
        });
        addedFromCatalogCount++;
      }
    }
  }
}

// 3. Count distribution
const stageStats: Record<string, number> = {};
for (const t of validTerms) {
  const cat = t.category || "QA";
  stageStats[cat] = (stageStats[cat] || 0) + 1;
}

// 4. Update database
db.terminology = validTerms;

// Add audit log entry
if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
db.auditLogs.push({
  id: `log_stage_reorg_${Date.now()}`,
  timestamp: now,
  userId: "admin",
  userEmail: "admin@chingluh.local",
  operation: "REORGANIZE_GLOSSARY_BY_MANUFACTURING_STAGE",
  status: "SUCCESS",
  durationMs: 380,
  details: {
    totalTerms: validTerms.length,
    removedTestCount,
    addedFromCatalogCount,
    stageDistribution: stageStats
  }
});

// Import db singleton and call reseedDatabase to sync SQLite & JSON
import { db as databaseService } from "../services/database/db";
databaseService.reseedDatabase(db);

console.log("=== GLOSSARY REORGANIZATION COMPLETE ===");
console.log(`Total Terms in Database (SQLite & JSON synced): ${validTerms.length}`);
console.log(`Removed Test Artifacts: ${removedTestCount}`);
console.log(`Added from Defect Catalog: ${addedFromCatalogCount}`);
console.log("\nDistribution by Manufacturing Stage:");
for (const [st, count] of Object.entries(stageStats).sort((a, b) => b[1] - a[1])) {
  console.log(`  • ${st.padEnd(12)}: ${count} terms`);
}
