import fs from "fs";
import path from "path";
import crypto from "crypto";
import DatabaseConstructor, { Database as SqliteDatabase } from "better-sqlite3";
import {
  DatabaseSchema,
  User,
  DocumentRecord,
  TerminologyEntry,
  AuditLogEntry,
  AppSettings,
} from "./types";
import { sanitizeTerminologyEntry } from "../terminology/sanitizer";
import { isSafeTerminologyEntry } from "../terminology/safety";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const SQLITE_FILE = path.join(DATA_DIR, "database.sqlite");

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultProvider: "airgapped",
  retentionPolicy: "delete_immediately",
  localLlmUrl: "http://127.0.0.1:11434/v1",
  localLlmModel: "qwen3:4b",
  openaiModel: "gpt-4o-mini",
  geminiModel: "gemini-3.8-flash",
  huggingFaceModel: "Helsinki-NLP/opus-mt-en-vi",
};

const INITIAL_USERS: User[] = [
  {
    id: "user_admin_01",
    email: "admin@secure.local",
    passwordHash: hashPassword("Admin@123!"),
    name: "System Administrator",
    role: "admin",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user_translator_01",
    email: "translator@secure.local",
    passwordHash: hashPassword("Translator@123!"),
    name: "Senior Translator",
    role: "translator",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user_reviewer_01",
    email: "reviewer@secure.local",
    passwordHash: hashPassword("Reviewer@123!"),
    name: "Chief Quality Reviewer",
    role: "reviewer",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user_viewer_01",
    email: "viewer@secure.local",
    passwordHash: hashPassword("Viewer@123!"),
    name: "Auditor / Viewer",
    role: "viewer",
    createdAt: new Date().toISOString(),
  },
];

const INITIAL_TERMINOLOGY: TerminologyEntry[] = [
  {
    id: "term_001",
    sourceTerm: "Access Control",
    targetTerm: "Kiểm soát truy cập",
    sourceLanguage: "en",
    targetLanguage: "vi",
    definition: "Security mechanism to regulate who or what can view or use resources in a computing environment.",
    context: "Information Security & ISO 27001",
    category: "Security",
    sourceDocument: "Corporate_Security_Guidelines.docx",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_002",
    sourceTerm: "Risk Assessment",
    targetTerm: "Đánh giá rủi ro",
    sourceLanguage: "en",
    targetLanguage: "vi",
    definition: "The overall process of risk identification, risk analysis and risk evaluation.",
    context: "Risk Management & NIST CSF",
    category: "Risk",
    sourceDocument: "Risk_Management_Policy.xlsx",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_003",
    sourceTerm: "Risk Appetite",
    targetTerm: "Mức độ chấp nhận rủi ro",
    sourceLanguage: "en",
    targetLanguage: "vi",
    definition: "The amount and type of risk that an organisation is willing to pursue or retain.",
    context: "Enterprise Risk Strategy",
    category: "Strategy",
    sourceDocument: "Enterprise_Strategy_2026.pptx",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_004",
    sourceTerm: "Business Continuity",
    targetTerm: "Tính liên tục kinh doanh",
    sourceLanguage: "en",
    targetLanguage: "vi",
    definition: "Capability of an organization to continue delivery of products or services at acceptable levels following a disruptive incident.",
    context: "Disaster Recovery & ISO 22301",
    category: "Operations",
    sourceDocument: "BCP_Standard.pdf",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "admin@secure.local",
    approvedBy: "reviewer@secure.local",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_001",
    sourceTerm: "hở keo",
    targetTerm: "bond gap",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_002",
    sourceTerm: "bọt khí",
    targetTerm: "air bubble",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_003",
    sourceTerm: "ngấn",
    targetTerm: "visible mark",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_004",
    sourceTerm: "độ gập ghềnh/ổn định",
    targetTerm: "rocking",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_005",
    sourceTerm: "tính chất liệu",
    targetTerm: "natural material",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_006",
    sourceTerm: "tưa liệu",
    targetTerm: "frayed material",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_007",
    sourceTerm: "lưỡi",
    targetTerm: "tongue",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_008",
    sourceTerm: "sớ liệu",
    targetTerm: "material grain",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_009",
    sourceTerm: "mũi giày",
    targetTerm: "vamp",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_010",
    sourceTerm: "May đế ngoài",
    targetTerm: "Cupsole stitching",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_011",
    sourceTerm: "May mũi chỉ không đều",
    targetTerm: "Inconsistent SPI",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_012",
    sourceTerm: "sụp mí",
    targetTerm: "run-off stitching",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_013",
    sourceTerm: "mài cao",
    targetTerm: "over buffing",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_014",
    sourceTerm: "lộn chân",
    targetTerm: "swapped feet",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_015",
    sourceTerm: "keo cao",
    targetTerm: "over cement",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_qa_001",
    sourceTerm: "Mặt giày in sơn trên trang trí vòng cổ bị tróc",
    targetTerm: "The painted shoe surface on the necklace decoration is peeling off",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_qa_002",
    sourceTerm: "Vệ sinh keo làm tróc sơn trên bề mặt liệu",
    targetTerm: "Cleaning cement will peel off paint on the surface of the material",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_qa_003",
    sourceTerm: "Màu sắc liệu không giống giày mẫu",
    targetTerm: "The color of the material is not the same as the sample shoe",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_qa_004",
    sourceTerm: "Kiểm tra đường chỉ thêu không đứt chỉ, nổi chi, bỏ mũi,lệch",
    targetTerm: "Check the embroidery thread is not broken, raised, missing stitches, or misaligned",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Stitching",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_016",
    sourceTerm: "lót vòng cổ",
    targetTerm: "collar lining",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_017",
    sourceTerm: "vòng cổ",
    targetTerm: "collar opening",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_018",
    sourceTerm: "đế trung",
    targetTerm: "midsole",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_019",
    sourceTerm: "đế ngoài",
    targetTerm: "outsole",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_020",
    sourceTerm: "mặt trước",
    targetTerm: "vamp",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_021",
    sourceTerm: "bộ vị",
    targetTerm: "component",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_022",
    sourceTerm: "không hở keo nosew",
    targetTerm: "no nosew bond gap",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_023",
    sourceTerm: "lỗ trang trí",
    targetTerm: "perforation holes",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_024",
    sourceTerm: "tràn keo các lỗ trang trí",
    targetTerm: "cement overflow at perforation holes",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_025",
    sourceTerm: "mức độ trắng các lỗ trang trí và biên tip quarter",
    targetTerm: "whitening at perforation holes and tip quarter edges",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_026",
    sourceTerm: "được đi chung không cần phối",
    targetTerm: "used together without color matching",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_027",
    sourceTerm: "dao động khác màu",
    targetTerm: "color shade variation",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_028",
    sourceTerm: "thành phẩm mặt giày",
    targetTerm: "finished upper",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_029",
    sourceTerm: "chất lượng logo in sơn khi kiểm tra cần chú ý",
    targetTerm: "Screen-printed logo quality requires attention during inspection",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_030",
    sourceTerm: "logo in sơn",
    targetTerm: "screen-printed logo",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_031",
    sourceTerm: "khi kiểm tra cần chú ý",
    targetTerm: "requires attention during inspection",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_032",
    sourceTerm: "tip-quarter bị nhạt màu và trắng các lỗ trang trí",
    targetTerm: "Tip-quarter color fading and whitening at perforation holes",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_033",
    sourceTerm: "trắng các lỗ trang trí",
    targetTerm: "whitening at perforation holes",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_034",
    sourceTerm: "bị nhạt màu",
    targetTerm: "color fading",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_035",
    sourceTerm: "tip-quarter khác màu",
    targetTerm: "Tip-quarter color variation",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_036",
    sourceTerm: "ép lạnh: thời gian 15”",
    targetTerm: "Cold press: time 15\"",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_037",
    sourceTerm: "ép lạnh",
    targetTerm: "cold press",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "term_footwear_038",
    sourceTerm: "ép nóng",
    targetTerm: "hot press",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Footwear",
    status: "approved",
    priority: 1,
    confidence: 1.0,
    createdBy: "system",
    version: "v1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class Database {
  private inMemoryData: DatabaseSchema | null = null;
  private sqlite!: SqliteDatabase;
  private approvedTermCache = new Map<string, TerminologyEntry[]>();

  constructor() {
    this.ensureDatabase();
  }

  private ensureDatabase(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.sqlite = new DatabaseConstructor(SQLITE_FILE);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("synchronous = NORMAL");

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        passwordHash TEXT,
        name TEXT,
        role TEXT,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        ownerId TEXT,
        fileName TEXT,
        fileType TEXT,
        classification TEXT,
        retentionPolicy TEXT,
        termCount INTEGER,
        status TEXT,
        storagePath TEXT,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS terminology (
        id TEXT PRIMARY KEY,
        sourceTerm TEXT,
        targetTerm TEXT,
        sourceLanguage TEXT,
        targetLanguage TEXT,
        definition TEXT,
        context TEXT,
        category TEXT,
        sourceDocument TEXT,
        status TEXT,
        priority INTEGER,
        confidence REAL,
        createdBy TEXT,
        approvedBy TEXT,
        version TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        editHistory TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_terminology_lang ON terminology (sourceLanguage, targetLanguage, status);
      CREATE INDEX IF NOT EXISTS idx_terminology_src ON terminology (sourceTerm);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        userId TEXT,
        userEmail TEXT,
        operation TEXT,
        documentId TEXT,
        status TEXT,
        durationMs INTEGER,
        errorCode TEXT,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    try {
      this.sqlite.exec("ALTER TABLE terminology ADD COLUMN editHistory TEXT;");
    } catch {}

    // Check if SQLite is empty
    const userCount = (this.sqlite.prepare("SELECT count(*) as c FROM users").get() as any).c;
    const termCount = (this.sqlite.prepare("SELECT count(*) as c FROM terminology").get() as any).c;

    if (userCount === 0 || termCount === 0) {
      let sourceData: DatabaseSchema;
      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, "utf-8").trim();
          sourceData = JSON.parse(raw);
        } catch {
          sourceData = {
            users: INITIAL_USERS,
            documents: [],
            terminology: INITIAL_TERMINOLOGY,
            auditLogs: [],
            savedTranslations: [],
            settings: DEFAULT_SETTINGS,
          };
        }
      } else {
        sourceData = {
          users: INITIAL_USERS,
          documents: [],
          terminology: INITIAL_TERMINOLOGY,
          auditLogs: [],
          savedTranslations: [],
          settings: DEFAULT_SETTINGS,
        };
      }

      this.seedSqlite(sourceData);
    }

    this.inMemoryData = this.loadFromSqlite();
    this.syncJsonBackup(this.inMemoryData);
  }

  private seedSqlite(data: DatabaseSchema): void {
    const insertUser = this.sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, email, passwordHash, name, role, createdAt)
      VALUES (@id, @email, @passwordHash, @name, @role, @createdAt)
    `);
    const insertDoc = this.sqlite.prepare(`
      INSERT OR REPLACE INTO documents (id, ownerId, fileName, fileType, classification, retentionPolicy, termCount, status, storagePath, createdAt)
      VALUES (@id, @ownerId, @fileName, @fileType, @classification, @retentionPolicy, @termCount, @status, @storagePath, @createdAt)
    `);
    const insertTerm = this.sqlite.prepare(`
      INSERT OR REPLACE INTO terminology (
        id, sourceTerm, targetTerm, sourceLanguage, targetLanguage,
        definition, context, category, sourceDocument, status,
        priority, confidence, createdBy, approvedBy, version, createdAt, updatedAt, editHistory
      ) VALUES (
        @id, @sourceTerm, @targetTerm, @sourceLanguage, @targetLanguage,
        @definition, @context, @category, @sourceDocument, @status,
        @priority, @confidence, @createdBy, @approvedBy, @version, @createdAt, @updatedAt, @editHistory
      )
    `);
    const insertLog = this.sqlite.prepare(`
      INSERT OR REPLACE INTO audit_logs (id, timestamp, userId, userEmail, operation, documentId, status, durationMs, errorCode, details)
      VALUES (@id, @timestamp, @userId, @userEmail, @operation, @documentId, @status, @durationMs, @errorCode, @details)
    `);
    const insertSetting = this.sqlite.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);

    const seedTx = this.sqlite.transaction(() => {
      for (const u of data.users || INITIAL_USERS) {
        insertUser.run({
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          name: u.name,
          role: u.role || "viewer",
          createdAt: u.createdAt || new Date().toISOString(),
        });
      }
      for (const d of data.documents || []) {
        insertDoc.run({
          id: d.id,
          ownerId: d.ownerId || "system",
          fileName: d.fileName || "",
          fileType: d.fileType || "xlsx",
          classification: d.classification || "internal",
          retentionPolicy: d.retentionPolicy || "delete_immediately",
          termCount: d.termCount ?? 0,
          status: d.status || "processed",
          storagePath: d.storagePath ?? null,
          createdAt: d.createdAt || new Date().toISOString(),
        });
      }
      for (const t of data.terminology || INITIAL_TERMINOLOGY) {
        insertTerm.run({
          id: t.id,
          sourceTerm: t.sourceTerm,
          targetTerm: t.targetTerm,
          sourceLanguage: t.sourceLanguage,
          targetLanguage: t.targetLanguage,
          definition: t.definition || null,
          context: t.context || null,
          category: t.category || null,
          sourceDocument: t.sourceDocument || null,
          status: t.status || "approved",
          priority: t.priority ?? 1,
          confidence: t.confidence ?? 1.0,
          createdBy: t.createdBy || null,
          approvedBy: t.approvedBy || null,
          version: t.version || null,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
          editHistory: t.editHistory ? JSON.stringify(t.editHistory) : null,
        });
      }
      for (const l of data.auditLogs || []) {
        insertLog.run({
          id: l.id,
          timestamp: l.timestamp,
          userId: l.userId,
          userEmail: l.userEmail,
          operation: l.operation,
          documentId: l.documentId || null,
          status: l.status,
          durationMs: l.durationMs,
          errorCode: l.errorCode || null,
          details: l.details ? JSON.stringify(l.details) : null,
        });
      }
      insertSetting.run("settings", JSON.stringify(data.settings || DEFAULT_SETTINGS));
    });

    seedTx();
  }

  private loadFromSqlite(): DatabaseSchema {
    const users = this.sqlite.prepare("SELECT * FROM users").all() as User[];
    const documents = this.sqlite.prepare("SELECT * FROM documents").all() as DocumentRecord[];
    const rawTerms = this.sqlite.prepare("SELECT * FROM terminology").all() as any[];
    const terminology: TerminologyEntry[] = rawTerms.map((t) => ({
      ...t,
      editHistory: t.editHistory
        ? typeof t.editHistory === "string"
          ? JSON.parse(t.editHistory)
          : t.editHistory
        : undefined,
    }));
    const rawLogs = this.sqlite.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 1000").all() as any[];
    const auditLogs: AuditLogEntry[] = rawLogs.map((r) => ({
      ...r,
      details: r.details ? JSON.parse(r.details) : undefined,
    }));
    const settingRow = this.sqlite.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as any;
    const settings: AppSettings = settingRow ? JSON.parse(settingRow.value) : DEFAULT_SETTINGS;

    return {
      users: users.length > 0 ? users : INITIAL_USERS,
      documents: documents || [],
      terminology: terminology.length > 0 ? terminology : INITIAL_TERMINOLOGY,
      auditLogs: auditLogs || [],
      savedTranslations: [],
      settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
      },
    };
  }

  private syncJsonBackup(data: DatabaseSchema): void {
    try {
      const sanitizedData = {
        ...data,
        settings: {
          ...data.settings,
          geminiApiKey: "",
          googleApiKey: "",
          openaiApiKey: "",
          huggingFaceApiKey: "",
        },
      };
      const tempFile = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(sanitizedData, null, 2), "utf-8");
      try {
        fs.renameSync(tempFile, DB_FILE);
      } catch {
        fs.copyFileSync(tempFile, DB_FILE);
      }
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    } catch (e) {
      console.warn("Could not sync database.json backup:", e);
    }
  }

  private readDb(): DatabaseSchema {
    if (this.inMemoryData) {
      return this.inMemoryData;
    }
    this.inMemoryData = this.loadFromSqlite();
    return this.inMemoryData;
  }

  private writeDb(data: DatabaseSchema): void {
    this.inMemoryData = data;
    this.approvedTermCache.clear();
    this.seedSqlite(data);
    this.syncJsonBackup(data);
  }

  // Users
  getUserByEmail(email: string): User | undefined {
    const db = this.readDb();
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserById(id: string): User | undefined {
    const db = this.readDb();
    return db.users.find((u) => u.id === id);
  }

  verifyPassword(user: User, pass: string): boolean {
    return user.passwordHash === hashPassword(pass);
  }

  // Terminology
  getTerminology(filters?: {
    status?: string;
    search?: string;
    sourceLang?: string;
    targetLang?: string;
    sortBy?: string;
  }): TerminologyEntry[] {
    const db = this.readDb();
    let terms = db.terminology;

    if (filters?.status && filters.status !== "all") {
      if (filters.status === "auto_harvested") {
        terms = terms.filter((t) => t.createdBy === "Auto-Harvester");
      } else {
        terms = terms.filter((t) => t.status === filters.status);
      }
    }
    if (filters?.sourceLang) {
      terms = terms.filter((t) => t.sourceLanguage === filters.sourceLang);
    }
    if (filters?.targetLang) {
      terms = terms.filter((t) => t.targetLanguage === filters.targetLang);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      terms = terms.filter(
        (t) =>
          t.sourceTerm.toLowerCase().includes(q) ||
          t.targetTerm.toLowerCase().includes(q) ||
          (t.context && t.context.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q))
      );
    }

    const sortBy = filters?.sortBy || "newest";

    return terms.sort((a, b) => {
      if (sortBy === "az_en") {
        return a.sourceTerm.localeCompare(b.sourceTerm);
      }
      if (sortBy === "az_vi") {
        return a.targetTerm.localeCompare(b.targetTerm, "vi");
      }
      if (sortBy === "priority") {
        return (a.priority - b.priority) || b.sourceTerm.length - a.sourceTerm.length;
      }
      if (sortBy === "oldest") {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.priority - b.priority) || b.sourceTerm.length - a.sourceTerm.length;
      }
      // Default: "newest" (most recently added/updated terms sorted to top of table)
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (a.priority - b.priority) || b.sourceTerm.length - a.sourceTerm.length;
    });
  }

  getApprovedTerminology(sourceLang = "en", targetLang = "vi"): TerminologyEntry[] {
    // Fix #6: Return cached result if available (invalidated on every write)
    const cacheKey = `${sourceLang}_${targetLang}`;
    const cached = this.approvedTermCache.get(cacheKey);
    if (cached) return cached;

    const db = this.readDb();

    // 1. Direct matches
    const direct = db.terminology
      .filter(
        (t) =>
          t.status === "approved" &&
          t.sourceLanguage === sourceLang &&
          t.targetLanguage === targetLang
      )
      .map((t) => ({ ...t, isDirect: true }));

    // 2. Reverse matches (e.g. if translating VI -> EN, terms defined as EN -> VI are reversed)
    const reversed = db.terminology
      .filter(
        (t) =>
          t.status === "approved" &&
          t.sourceLanguage === targetLang &&
          t.targetLanguage === sourceLang
      )
      .map((t) => ({
        ...t,
        sourceTerm: t.targetTerm,
        targetTerm: t.sourceTerm,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        isDirect: false,
      }));

    const combined = [...direct, ...reversed];
    const viRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const validCombined = combined.filter((t) => {
      const src = t.sourceTerm?.trim() || "";
      const tgt = t.targetTerm?.trim() || "";
      if (!src || !tgt) return false;
      if (src.toLowerCase() === tgt.toLowerCase()) return false;
      if (sourceLang === "vi" && targetLang === "en") {
        if (viRegex.test(tgt) && !/[a-zA-Z]{3,}/.test(tgt.replace(viRegex, ""))) {
          return false;
        }
      }
      return isSafeTerminologyEntry(t);
    });

    const expanded: (TerminologyEntry & { isDirect?: boolean })[] = [];

    const cleanGlossaryTarget = (raw: string): string => {
      if (!raw) return "";
      let t = raw.trim();
      // If designated "(ưu tiên)", extract that variant
      const prefMatch = t.match(/([A-Za-z0-9\s\-]+)\s*\(\s*ưu\s*tiên\s*\)/i);
      if (prefMatch) return prefMatch[1].trim();
      // Remove trailing slash
      t = t.replace(/\/+$/, "").trim();
      // Remove annotations like (tên lỗi), (dùng khi dịch bth), (dành cho lỗi hệ thống)
      t = t.replace(/\s*\([^)]*(?:ưu tiên|khi cần|tên lỗi|dịch bth|lỗi hệ thống|trong tiêu chuẩn|định vị|hình)[^)]*\)/gi, "").trim();
      return t;
    };

    for (const item of validCombined) {
      let cleanTarget = cleanGlossaryTarget(item.targetTerm);
      cleanTarget = cleanTarget.replace(/^[/\\,;:.\s]+|[/\\,;:.\s]+$/g, "").trim();
      const baseItem = { ...item, targetTerm: cleanTarget || item.targetTerm };
      if (isSafeTerminologyEntry(baseItem)) {
        expanded.push(baseItem);
      }

      // Expand slash-separated term variations (e.g. "lỗ đinh/lỗ định vị" -> "lỗ đinh", "lỗ định vị")
      // Do NOT split units of measurement (e.g. "mũi/inch", "kg/cm2", "km/h") or fractions ("1/2")
      const isUnitOrMeasurement = /\b(mũi\s*\/\s*inch|kg\s*\/\s*cm2|g\s*\/\s*cm2|km\s*\/\s*h|\d+\s*\/\s*\d+)\b/i.test(item.sourceTerm);
      if (item.sourceTerm.includes("/") && !isUnitOrMeasurement) {
        const parts = item.sourceTerm
          .split("/")
          .map((p) => p.replace(/^[/\\,;:.\s]+|[/\\,;:.\s]+$/g, "").trim())
          .filter((p) => p.length >= 2 && !/^(inch|cm2|mm|kg|size|mũi|gót|đế)$/i.test(p));
        const targetParts = item.targetTerm.includes("/")
          ? item.targetTerm.split("/").map((p) => cleanGlossaryTarget(p).replace(/^[/\\,;:.\s]+|[/\\,;:.\s]+$/g, "").trim()).filter((p) => p.length >= 2)
          : [];

        if (targetParts.length === parts.length && parts.length > 0) {
          for (let i = 0; i < parts.length; i++) {
            const variant = { ...baseItem, sourceTerm: parts[i], targetTerm: targetParts[i] };
            if (isSafeTerminologyEntry(variant)) {
              expanded.push(variant);
            }
          }
        } else if (parts.length >= 2 && item.sourceTerm.length <= 35) {
          // Shared target for short synonym phrases: e.g. "độ gập ghềnh/ổn định" -> "rocking"
          const firstWords = parts[0].split(/\s+/);
          const prefix = (firstWords.length >= 2 && firstWords.length <= 3) ? firstWords[0] : "";

          for (let i = 0; i < parts.length; i++) {
            let candidateSrc = "";
            if (i > 0 && prefix && !parts[i].startsWith(prefix)) {
              candidateSrc = `${prefix} ${parts[i]}`;
            } else if (parts[i].split(/\s+/).length >= 2 || parts[0].split(/\s+/).length <= 2) {
              candidateSrc = parts[i];
            }
            if (candidateSrc) {
              const variant = { ...baseItem, sourceTerm: candidateSrc, targetTerm: baseItem.targetTerm };
              if (isSafeTerminologyEntry(variant)) {
                expanded.push(variant);
              }
            }
          }
        }
      }

      // Expand parenthetical notes (e.g. "Trung đế (bao)" -> "Trung đế", "bao trung đế")
      if (/\([^\)]+\)/.test(item.sourceTerm)) {
        let cleaned = item.sourceTerm.replace(/\([^\)]+\)/g, "").replace(/\s+/g, " ").trim();
        cleaned = cleaned.replace(/^[/\\,;:.\s]+|[/\\,;:.\s]+$/g, "").trim();
        if (cleaned.length >= 2) {
          const variant = { ...baseItem, sourceTerm: cleaned };
          if (isSafeTerminologyEntry(variant)) {
            expanded.push(variant);
          }
        }
        const parenMatch = item.sourceTerm.match(/\(([^\)]+)\)/);
        if (parenMatch && cleaned) {
          const inside = parenMatch[1].replace(/^[/\\,;:.\s]+|[/\\,;:.\s]+$/g, "").trim();
          if (inside.length >= 2 && inside.length < 20 && !/^\d+$/.test(inside)) {
            const v1 = { ...baseItem, sourceTerm: `${inside} ${cleaned}`.trim() };
            if (isSafeTerminologyEntry(v1)) expanded.push(v1);
            const v2 = { ...baseItem, sourceTerm: `${cleaned} ${inside}`.trim() };
            if (isSafeTerminologyEntry(v2)) expanded.push(v2);
          }
        }
      }
    }

    // Sort to prioritize specific terms, direct mappings, user recency, and canonical domain terms
    expanded.sort((a, b) => {
      const aLower = a.sourceTerm.toLowerCase().trim();
      const bLower = b.sourceTerm.toLowerCase().trim();

      // Canonical footwear domain overrides
      if (aLower === "hở keo" && bLower === "hở keo") {
        if (/bond\s*gap/i.test(a.targetTerm)) return -1;
        if (/bond\s*gap/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "bọt khí" && bLower === "bọt khí") {
        if (/air\s*bubble/i.test(a.targetTerm)) return -1;
        if (/air\s*bubble/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "mũi giày" && bLower === "mũi giày") {
        if (/vamp/i.test(a.targetTerm)) return -1;
        if (/vamp/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "tiêu chuẩn" && bLower === "tiêu chuẩn") {
        if (/standard/i.test(a.targetTerm)) return -1;
        if (/standard/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "ngấn" && bLower === "ngấn") {
        if (/visible mark|demolding mark/i.test(a.targetTerm)) return -1;
        if (/visible mark|demolding mark/i.test(b.targetTerm)) return 1;
      }
      if ((aLower === "độ ổn định" || aLower === "độ gập ghềnh") && (bLower === "độ ổn định" || bLower === "độ gập ghềnh")) {
        if (/rocking/i.test(a.targetTerm)) return -1;
        if (/rocking/i.test(b.targetTerm)) return 1;
      }
      if (aLower === "sụp mí" && bLower === "sụp mí") {
        if (/run-off\s*stitching/i.test(a.targetTerm)) return -1;
        if (/run-off\s*stitching/i.test(b.targetTerm)) return 1;
      }

      // Direct matches over reversed matches
      if (a.isDirect && !b.isDirect) return -1;
      if (!a.isDirect && b.isDirect) return 1;

      // Priority comparison
      const prioDiff = (b.priority ?? 1) - (a.priority ?? 1);
      if (prioDiff !== 0) return prioDiff;

      // Recency comparison (newly added or updated user terminology wins)
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const timeDiff = timeB - timeA;
      if (timeDiff !== 0) return timeDiff;

      // Prefer clean target without slashes
      if (!a.targetTerm.includes("/") && b.targetTerm.includes("/")) return -1;
      if (a.targetTerm.includes("/") && !b.targetTerm.includes("/")) return 1;

      return 0;
    });

    // Deduplicate by composite key (sourceTerm + targetTerm) to allow polysemy (multiple meanings)
    const seen = new Set<string>();
    const unique = expanded.filter((t) => {
      const lowerSrc = t.sourceTerm.toLowerCase().trim();
      const lowerTgt = t.targetTerm.toLowerCase().trim();
      // Filter out corrupted reversed annotations where "may" was extracted as "margin"
      if (lowerSrc === "may" && /margin/i.test(lowerTgt)) return false;
      const pairKey = `${lowerSrc}===>${lowerTgt}`;
      if (seen.has(pairKey)) return false;
      seen.add(pairKey);
      return true;
    });

    const result = unique.sort((a, b) => {
      const lenDiff = b.sourceTerm.length - a.sourceTerm.length;
      if (lenDiff !== 0) return lenDiff;
      const aLower = a.sourceTerm.toLowerCase().trim();
      const bLower = b.sourceTerm.toLowerCase().trim();
      if (aLower === "bọt khí" && bLower === "bọt khí") {
        if (/air\s*bubble/i.test(a.targetTerm)) return -1;
        if (/air\s*bubble/i.test(b.targetTerm)) return 1;
      }
      return 0;
    });
    // Fix #6: Store in cache for next call
    this.approvedTermCache.set(cacheKey, result);
    return result;
  }

  addTerminology(entries: Omit<TerminologyEntry, "id" | "createdAt" | "updatedAt">[]): TerminologyEntry[] {
    const db = this.readDb();
    const now = new Date().toISOString();
    const created: TerminologyEntry[] = [];

    for (const item of entries) {
      // Proactive Terminology Sanitizer & Anomaly Sentinel Agent
      const check = sanitizeTerminologyEntry(item);
      if (!check.valid) {
        console.warn(`[TerminologySentinel] Proactively rejected invalid entry: ${check.reason}`);
        continue;
      }
      if (check.autoCorrected && check.suggestedTarget) {
        item.targetTerm = check.suggestedTarget;
      }

      // Check if term exists with same source and same target (polysemy: distinct meanings coexist)
      const existing = db.terminology.find(
        (t) =>
          t.sourceTerm.toLowerCase().trim() === item.sourceTerm.toLowerCase().trim() &&
          t.targetTerm.toLowerCase().trim() === item.targetTerm.toLowerCase().trim() &&
          t.sourceLanguage === item.sourceLanguage &&
          t.targetLanguage === item.targetLanguage
      );

      if (existing) {
        // Update existing term with new metadata and refresh updatedAt timestamp
        const oldTarget = existing.targetTerm;
        const oldStatus = existing.status;
        if (item.status === "approved") {
          existing.status = "approved";
        }
        existing.targetTerm = item.targetTerm;
        if (item.context) existing.context = item.context;
        if (item.category) existing.category = item.category;
        if (item.definition) existing.definition = item.definition;
        existing.updatedAt = now;

        if (!existing.editHistory) existing.editHistory = [];
        existing.editHistory.unshift({
          id: `hist_${crypto.randomBytes(4).toString("hex")}`,
          timestamp: now,
          editedBy: item.createdBy || "system",
          action: "updated",
          changes: [
            ...(oldTarget !== item.targetTerm ? [{ field: "targetTerm", oldValue: oldTarget, newValue: item.targetTerm }] : []),
            ...(oldStatus !== existing.status ? [{ field: "status", oldValue: oldStatus, newValue: existing.status }] : []),
          ],
          note: "Cập nhật dữ liệu từ lần nhập mới",
        });

        created.push(existing);
      } else {
        const newEntry: TerminologyEntry = {
          ...item,
          id: `term_${crypto.randomBytes(6).toString("hex")}`,
          createdAt: now,
          updatedAt: now,
          editHistory: item.editHistory || [
            {
              id: `hist_${crypto.randomBytes(4).toString("hex")}`,
              timestamp: now,
              editedBy: item.createdBy || "system",
              action: item.createdBy === "Auto-Harvester" ? "auto_harvested" : "created",
              note: item.createdBy === "Auto-Harvester" ? "Tự động trích xuất từ tài liệu" : "Khởi tạo thuật ngữ ban đầu",
            },
          ],
        };
        db.terminology.unshift(newEntry);
        created.push(newEntry);
      }
    }

    this.writeDb(db);
    return created;
  }

  updateTermStatus(id: string, status: "approved" | "review" | "rejected" | "deprecated", approvedBy?: string): TerminologyEntry | null {
    const db = this.readDb();
    const term = db.terminology.find((t) => t.id === id);
    if (!term) return null;

    const oldStatus = term.status;
    term.status = status;
    if (approvedBy && status === "approved") {
      term.approvedBy = approvedBy;
    }
    const now = new Date().toISOString();
    term.updatedAt = now;

    if (!term.editHistory) term.editHistory = [];
    term.editHistory.unshift({
      id: `hist_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: now,
      editedBy: approvedBy || "reviewer@secure.local",
      action: "status_changed",
      changes: [
        {
          field: "status",
          oldValue: oldStatus,
          newValue: status,
        },
      ],
      note: `Thay đổi trạng thái từ '${oldStatus}' sang '${status}'`,
    });

    this.writeDb(db);
    return term;
  }

  updateTerm(id: string, updates: Partial<TerminologyEntry>): TerminologyEntry | null {
    const db = this.readDb();
    const term = db.terminology.find((t) => t.id === id);
    if (!term) return null;

    const merged = { ...term, ...updates };
    const check = sanitizeTerminologyEntry(merged);
    if (!check.valid) {
      console.warn(`[TerminologySentinel] Proactively rejected update for ${id}: ${check.reason}`);
      return null;
    }
    if (check.autoCorrected && check.suggestedTarget) {
      updates.targetTerm = check.suggestedTarget;
    }

    const changes: { field: string; oldValue?: string; newValue?: string }[] = [];
    for (const key of Object.keys(updates) as (keyof TerminologyEntry)[]) {
      if (key !== "updatedAt" && key !== "editHistory" && (term as any)[key] !== (updates as any)[key]) {
        changes.push({
          field: String(key),
          oldValue: String((term as any)[key] ?? ""),
          newValue: String((updates as any)[key] ?? ""),
        });
      }
    }

    const now = new Date().toISOString();
    if (!term.editHistory) term.editHistory = [];
    if (changes.length > 0) {
      term.editHistory.unshift({
        id: `hist_${crypto.randomBytes(4).toString("hex")}`,
        timestamp: now,
        editedBy: (updates as any).editedBy || updates.createdBy || term.createdBy || "user@secure.local",
        action: "updated",
        changes,
        note: `Chỉnh sửa: ${changes.map((c) => c.field).join(", ")}`,
      });
    }

    Object.assign(term, updates, { updatedAt: now });
    this.writeDb(db);
    return term;
  }

  deleteTerm(id: string): boolean {
    const db = this.readDb();
    const index = db.terminology.findIndex((t) => t.id === id);
    if (index === -1) return false;
    db.terminology.splice(index, 1);
    try {
      this.sqlite.prepare("DELETE FROM terminology WHERE id = ?").run(id);
    } catch (e) {
      console.warn("Could not delete from SQLite:", e);
    }
    this.writeDb(db);
    return true;
  }

  // Documents
  addDocument(doc: Omit<DocumentRecord, "id" | "createdAt">): DocumentRecord {
    const db = this.readDb();
    const newDoc: DocumentRecord = {
      ...doc,
      id: `doc_${crypto.randomBytes(6).toString("hex")}`,
      createdAt: new Date().toISOString(),
    };
    db.documents.unshift(newDoc);
    this.writeDb(db);
    return newDoc;
  }

  getDocuments(): DocumentRecord[] {
    const db = this.readDb();
    return db.documents;
  }

  getDocumentById(id: string): DocumentRecord | undefined {
    const db = this.readDb();
    return db.documents.find((d) => d.id === id);
  }

  deleteDocument(id: string): boolean {
    const db = this.readDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) return false;

    doc.status = "deleted";
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      try {
        fs.unlinkSync(doc.storagePath);
      } catch (e) {
        console.error("Error deleting file:", e);
      }
    }
    doc.storagePath = undefined;
    this.writeDb(db);
    return true;
  }

  // Audit Logs (CRITICAL: NEVER LOG SENSITIVE CONTENT)
  addAuditLog(entry: {
    userId: string;
    userEmail: string;
    operation: string;
    documentId?: string;
    status: "SUCCESS" | "FAILURE" | "WARNING";
    durationMs: number;
    errorCode?: string;
    details?: Record<string, any>;
  }): void {
    const db = this.readDb();
    const sanitizedDetails = entry.details ? { ...entry.details } : {};

    // Strict sanitization: Delete any key that could contain text content
    const forbiddenKeys = [
      "text",
      "sourceText",
      "source_text",
      "targetText",
      "target_text",
      "translation",
      "prompt",
      "content",
      "body",
    ];
    for (const key of forbiddenKeys) {
      delete sanitizedDetails[key];
    }

    const log: AuditLogEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: new Date().toISOString(),
      userId: entry.userId,
      userEmail: entry.userEmail,
      operation: entry.operation,
      documentId: entry.documentId,
      status: entry.status,
      durationMs: entry.durationMs,
      errorCode: entry.errorCode,
      details: sanitizedDetails,
    };

    db.auditLogs.unshift(log);
    // Keep max 1000 logs
    if (db.auditLogs.length > 1000) {
      db.auditLogs = db.auditLogs.slice(0, 1000);
    }
    this.writeDb(db);
  }

  getAuditLogs(): AuditLogEntry[] {
    const db = this.readDb();
    return db.auditLogs;
  }

  getSettings(): AppSettings {
    const db = this.readDb();
    const settings = { ...(db.settings || DEFAULT_SETTINGS) };
    if (!settings.defaultProvider && process.env.DEFAULT_TRANSLATION_PROVIDER) {
      settings.defaultProvider = process.env.DEFAULT_TRANSLATION_PROVIDER as any;
    }
    if (process.env.GEMINI_MODEL) {
      settings.geminiModel = process.env.GEMINI_MODEL;
    }
    return settings;
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    const db = this.readDb();
    db.settings = { ...db.settings, ...settings };
    this.writeDb(db);
    return db.settings;
  }

  reseedDatabase(data: DatabaseSchema): void {
    try {
      this.sqlite.exec("DELETE FROM terminology;");
    } catch {}
    this.inMemoryData = data;
    this.approvedTermCache.clear();
    this.seedSqlite(data);
    this.syncJsonBackup(data);
  }
}

export const db = new Database();
