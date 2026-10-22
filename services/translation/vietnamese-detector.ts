import { auditTextForms } from "./audit-intelligence";
import { cleanTargetTerm } from "./casing";
import { TerminologyEntry } from "../database/types";
import { AirGappedTranslationProvider } from "./offline";

/**
 * Checks for Vietnamese diacritics in both NFC and NFD Unicode representations.
 */
export function hasVietnameseDiacritics(str: string): boolean {
  if (!str) return false;
  const nfc = str.normalize("NFC");
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(nfc);
}

/**
 * Common Vietnamese syllables that rarely or never occur as English words.
 * Used for detecting unaccented Vietnamese text.
 */
const DISTINCT_VI_SYLLABLES = new Set([
  "khong", "duoc", "nguoi", "nhung", "thiet", "huong", "trinh", "nguyen", "phom",
  "khuon", "quet", "chuyen", "xuong", "chuan", "thong", "thuat", "khoang", "nghieng",
  "chieu", "nhiet", "giay", "luoi", "chay", "thao", "khac", "phuc", "giang", "nhanh",
  "cham", "thang", "lech", "dinh", "kiem", "ngan", "trung", "bung", "ghep", "rach",
  "xuat", "buoc", "truoc", "ngoai", "hoac", "biet", "thay", "giua", "duoi",
  "nhieu", "trong", "dung", "tang", "giam", "canh", "vong", "diem", "doan", "bien",
  "luu", "chu", "yeu", "cau", "thuc", "hien", "dieu", "chinh", "thung",
  "mui", "dan", "mai", "keo", "lap", "nhan", "lon", "dap", "de", "got", "khau",
  "cuon", "xo", "cot", "vien", "bao", "kho", "uot", "nong", "lanh", "loi", "mau",
  "hinh", "bam", "nham", "sut", "sup", "tuot", "quang", "meo",
  "nut", "khe", "bui", "ban", "sach", "luc", "gian",
  "trang", "tay", "ve", "sinh", "vua", "toi", "lang", "dao", "kim",
  "chiu", "moc", "gioi", "han",
  "danh", "theo", "chua", "chong", "tran", "lem", "ho", "mo"
]);

/**
 * Characteristic Vietnamese multi-word phrases and collocations (in normalized compact form without spaces or accents)
 */
const VI_PHRASE_PATTERNS = [
  "kiemtra", "thietbi", "vuilong", "truockhi", "vanhanh", "huongdan", "antoan", "khancap",
  "quytrinh", "sanxuat", "nguyenlieu", "mugiay", "dungmay", "chuy", "luuy", "yeucau",
  "thaotac", "thuchien", "dieuchinh", "tieuchuan", "thongso", "kythuat", "quetkeo",
  "dande", "maide", "epde", "gomui", "gogot", "maylot", "mayvien", "hokeo", "trankeo",
  "botkhi", "supmi", "tuotmi", "dengoai", "degia", "lotgiay", "matgiay", "vongco",
  "muigiay", "gotgiay", "duongmay", "muimay", "muikim", "nhietdo", "apluc", "thoigian",
  "khongduoc", "canphai", "tranhde", "dambao", "chieudai", "doday", "khoangcach",
  "dobamdinh", "bannham", "doin", "inlogo", "khuontren", "khuonduoi", "khuondap",
  "daochat", "mangtpu", "mangbaove", "losay", "buongsay", "conghan", "totruong",
  "quandoc", "doivoi", "apdungcho", "danhcho", "theomau", "maugiay", "hinhdan",
  "chieucao", "chieurong", "vetcat", "vetrach", "lemkeo", "dinhkeo", "khoangkeo",
  "dapnoi", "chaymay", "mayupper", "danoutsole", "epnosew", "chayline", "kiemctq",
  "kiemisq", "datyeucau", "khongdat", "loikhuyettat", "bamdinh", "dandep", "maioutsole",
  "quettpu", "quetprimer", "longgot", "lechmui", "lechgot", "hoangmi", "chongchay",
  "chongnut", "vattudauvao", "kiemhang", "donggoi", "dandecal", "gannhan", "xuatkho",
  "maymudguard", "maylogo", "mayvien", "maylot", "mayvongco", "mayde", "maymui",
  "mayrap", "maycup", "maydrap", "may1kim", "may2kim", "mayzigzag"
];

/**
 * Standard English common words to distinguish genuine English text
 */
const COMMON_EN_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not",
  "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from",
  "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would",
  "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
  "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could", "them", "see",
  "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
  "is", "are", "was", "were", "been", "has", "had", "should", "must", "might",
  "inspection", "inspect", "standard", "quality", "check", "ensure", "verify", "attach",
  "apply", "buffing", "cement", "primer", "stitch", "stitching", "sew", "needle",
  "upper", "sole", "outsole", "midsole", "collar", "heel", "toe", "vamp", "lining",
  "temperature", "pressure", "duration", "machine", "device", "process", "operation",
  "defect", "clean", "surface", "guide", "manual", "safety", "warning", "note",
  "step", "tools", "operator", "production", "specification", "prevent", "during",
  "placed", "placing", "position", "positioned", "aligned", "alignment", "molding",
  "shaping", "hammering", "short", "even", "smooth", "wrinkles", "straight", "markers",
  "marking", "markings", "gauge", "last", "bottom", "size", "larger", "follow", "specifications",
  "lot", "die", "shift", "vamp", "tongue", "facing", "counter", "foxing", "mudguard",
  "overlay", "underlay", "insole", "foam", "rubber", "mesh", "leather", "textile", "knit",
  "tape", "film", "tpu", "eva", "phylon", "eyelet", "lace", "thread", "seam", "adhesive",
  "heat", "press", "pass", "fail", "reject", "accept", "rework", "scrap", "line",
  "station", "stage", "target", "actual", "result", "status", "remark", "dirty", "tight",
  "loose", "crooked", "bubble", "wrinkle", "crease", "crack", "tear", "burn", "stain",
  "glue", "oil", "dust", "width", "height", "thickness", "weight", "density", "hardness",
  "spi", "rpm", "psi", "bar", "deg", "sec", "min", "hr", "hrs", "date", "month", "code"
]);

/**
 * Determines whether a string is Vietnamese text (with diacritics, unaccented, or code-switching mixed).
 */
export function isVietnameseText(str: string): boolean {
  if (!str || !str.trim()) return false;
  const trimmed = str.trim();

  // 1. Accented Vietnamese
  if (hasVietnameseDiacritics(trimmed)) return true;

  // Contextual bigram/collocation disambiguation for English footwear manufacturing & date patterns
  // (Prevents homographs like May/Lot/Day/Tan/Last from being misclassified as unaccented Vietnamese)
  if (/\bmay\s+(?:20\d{2}|\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*20\d{2}|\s+20\d{2}|$))\b/i.test(trimmed)) {
    return false;
  }
  if (/\blot\s*(?:#|no\.?|number|id|code|size|qty)\b/i.test(trimmed)) {
    return false;
  }
  if (/\bday\s*(?:shift|off|time|work|\d+)\b/i.test(trimmed)) {
    return false;
  }
  if (/\btan\s*(?:color|colour|leather|suede)\b/i.test(trimmed)) {
    return false;
  }
  if (/\blast\s*(?:step|check|operation|stage|process|inspection)\b/i.test(trimmed)) {
    return false;
  }

  const form = auditTextForms(trimmed);
  const compact = form.compact.toLowerCase();

  // 2. Contains characteristic Vietnamese phrases (unaccented or accented)
  for (const pattern of VI_PHRASE_PATTERNS) {
    if (compact.includes(pattern)) return true;
  }

  // 2.5. Footwear operation commands (even with mixed code-switching like "May mudguard", "May 1 kim", "May logo", "Quét primer")
  if (/(?:^|\s)[\*•\-#]?\s*(?:\d+[.)]\s*)?(?:may|dan|mai|quet|go|chat|ep|kiem\s*tra|dinh\s*hinh|ve\s*sinh)\s+(?:mudguard|logo|vien|lot|vong\s*co|de|mui|than|luoi|upper|outsole|midsole|heel|toe|collar|lining|tongue|strap|eyestay|label|jig|khuon|keo|primer|\d+\s*kim|zigzag|chi|rap|cup|drap)/i.test(trimmed)) {
    return true;
  }

  // 3. Fast English guard: if text has common English words and high English word density, it is English
  const tokens = form.tokens.map((t) => t.toLowerCase());
  if (tokens.length === 0) return false;

  let enWordCount = 0;
  for (const token of tokens) {
    if (COMMON_EN_WORDS.has(token)) {
      enWordCount++;
    }
  }

  if (tokens.length >= 2 && enWordCount / tokens.length >= 0.35) {
    return false;
  }

  // 4. Syllable analysis on words without diacritics
  const wordTokens = tokens.filter((t) => /\p{L}/u.test(t));
  if (wordTokens.length === 0) return false;

  let viSyllableCount = 0;
  for (const token of wordTokens) {
    if (DISTINCT_VI_SYLLABLES.has(token) && !COMMON_EN_WORDS.has(token)) {
      viSyllableCount++;
    }
  }

  // If text has 2 or more distinct Vietnamese syllables, or > 40% of word tokens are distinct Vietnamese syllables
  if (viSyllableCount >= 2 || (wordTokens.length >= 2 && viSyllableCount / wordTokens.length >= 0.4)) {
    return true;
  }

  // Single word matching specific footwear operation
  if (wordTokens.length === 1 && DISTINCT_VI_SYLLABLES.has(wordTokens[0]) && !COMMON_EN_WORDS.has(wordTokens[0])) {
    return true;
  }

  return false;
}

/**
 * Strictly verifies whether text is pure English and has zero Vietnamese language evidence.
 */
export function isPureEnglishText(str: string): boolean {
  if (!str || !str.trim()) return false;
  const trimmed = str.trim();

  // Any Vietnamese diacritic immediately disqualifies as pure English
  if (hasVietnameseDiacritics(trimmed)) return false;

  // Any recognized Vietnamese phrase or syllable pattern disqualifies
  if (isVietnameseText(trimmed)) return false;

  const form = auditTextForms(trimmed);
  const tokens = form.tokens.map((t) => t.toLowerCase());
  if (tokens.length === 0) return false;

  // Check how many tokens are recognized English words or universal technical tokens
  let enWordCount = 0;
  for (const token of tokens) {
    if (COMMON_EN_WORDS.has(token) || /^[A-Z0-9\-\.\/]+$/i.test(token)) {
      enWordCount++;
    }
  }

  // Pure English if at least 60% of words are recognized English words/codes and not Vietnamese
  return enWordCount / tokens.length >= 0.6;
}

/**
 * Extracts numbers, measurements, and numerical parameters from a string.
 */
export function extractNumericParameters(str: string): string[] {
  const matches = str.match(/\b\d+(?:[.,]\d+)?(?:\s*(?:%|mm|cm|m|kg|g|spi|bar|psi|°c|°f|s|sec|min|h|hrs?))?\b/gi);
  return matches ? matches.map((m) => m.toLowerCase().replace(/\s+/g, "")) : [];
}

/**
 * Extracts step number prefix (e.g. "1.", "2)", "Step 3", "CTQ 1")
 */
function extractItemStepPrefix(str: string): string | null {
  const m = str.trim().match(/^(?:(?:\*|•|#)\s*)?(?:(?:ct[qp]|step|item|stt|no|bước|mục)\s*)?#?(\d{1,3})[.)\-:]/i);
  return m ? m[1] : null;
}

/**
 * Semantic Bilingual Pair Verifier:
 * Validates whether an English text and Vietnamese text are genuinely equivalent translations of each other.
 * Strictly prevents False Pairing (mismatched operations on the same step or shape).
 */
export function isSemanticBilingualPair(
  text1: string,
  text2: string,
  glossary: TerminologyEntry[] = []
): { isPair: boolean; confidence: number; reason: string } {
  if (!text1 || !text2) {
    return { isPair: false, confidence: 0, reason: "Một trong hai đoạn văn bản bị rỗng." };
  }

  const t1 = text1.trim();
  const t2 = text2.trim();

  // 1. Language orientation check: One must be Vietnamese, one must be English
  const t1IsVi = hasVietnameseDiacritics(t1) || isVietnameseText(t1);
  const t2IsVi = hasVietnameseDiacritics(t2) || isVietnameseText(t2);

  if (t1IsVi === t2IsVi) {
    return {
      isPair: false,
      confidence: 0,
      reason: t1IsVi
        ? "Cả hai đoạn văn bản đều là tiếng Việt (không phải cặp song ngữ VI/EN)."
        : "Cả hai đoạn văn bản đều là tiếng Anh (không phải cặp song ngữ VI/EN)."
    };
  }

  const viText = t1IsVi ? t1 : t2;
  const enText = t1IsVi ? t2 : t1;

  // 2. Heading structure check: process headings (*Heading) must only pair with process headings
  const isHeadingVi = /^[\*•#]/.test(viText);
  const isHeadingEn = /^[\*•#]/.test(enText);
  if (isHeadingVi !== isHeadingEn) {
    return {
      isPair: false,
      confidence: 0,
      reason: "Một bên là tiêu đề quy trình (*), bên kia là nội dung thường."
    };
  }

  // 3. Step number consistency check:
  // - If both have step numbers, they MUST match
  // - If one is a numbered step (e.g. "1. Kiểm tra...") and the other is an unnumbered title/heading/strategy, they cannot pair
  const stepVi = extractItemStepPrefix(viText);
  const stepEn = extractItemStepPrefix(enText);
  if (stepVi && stepEn && stepVi !== stepEn) {
    return {
      isPair: false,
      confidence: 0,
      reason: `Số thứ tự bước không khớp (VI: bước ${stepVi}, EN: bước ${stepEn}).`
    };
  }
  if ((stepVi && !stepEn) || (!stepVi && stepEn)) {
    const viIsHeading = isHeadingVi || /strategy|focus|tiêu điểm|trọng điểm|quy trình|tiêu chuẩn/i.test(viText);
    const enIsHeading = isHeadingEn || /strategy|focus|focuses|process|procedure|standard|title|manual/i.test(enText);
    if (viIsHeading || enIsHeading) {
      return {
        isPair: false,
        confidence: 0,
        reason: "Một bên là bước quy trình có đánh số, bên kia là tiêu đề hoặc chiến lược."
      };
    }
  }

  // 4. Numerical parameters check: If both contain measurements/numbers, they must be consistent
  // Exclude step numbers so bare step digits (1, 2, 3...) are not treated as shared technical measurements
  const numVi = extractNumericParameters(viText).filter((n) => n !== stepVi && (!/^\d{1,2}$/.test(n) || n.length > 2));
  const numEn = extractNumericParameters(enText).filter((n) => n !== stepEn && (!/^\d{1,2}$/.test(n) || n.length > 2));
  if (numVi.length > 0 && numEn.length > 0) {
    const sharedNumbers = numVi.filter((n) => numEn.includes(n));
    if (sharedNumbers.length === 0 && (numVi.length >= 2 || numEn.length >= 2)) {
      return {
        isPair: false,
        confidence: 0,
        reason: "Các thông số kỹ thuật/số đo không tương thích giữa hai câu."
      };
    }
  }

  // 5. Glossary alignment check: Check if core terminology in VI has target terms present in EN
  const viLower = viText.toLowerCase();
  const enLower = enText.toLowerCase();

  let matchedGlossaryCount = 0;
  for (const entry of glossary) {
    if (entry.sourceTerm && entry.targetTerm && entry.sourceTerm.length >= 3) {
      const src = entry.sourceTerm.toLowerCase().trim();
      const tgt = cleanTargetTerm(entry.targetTerm).toLowerCase().trim();
      if (viLower.includes(src) && enLower.includes(tgt)) {
        matchedGlossaryCount++;
      }
    }
  }

  // 6. Semantic Translation Probe using Offline Engine
  const offlineProvider = new AirGappedTranslationProvider();
  const probeEn = offlineProvider.translateVietnameseToEnglish(viText, glossary).toLowerCase();

  const EN_STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with",
    "is", "are", "was", "were", "be", "been", "that", "this", "it", "not", "no", "as",
    "if", "from", "into", "than", "then", "its", "all", "any", "both", "each", "such",
    // Generic meta-words / document structure terms that must not cause false pairings
    "inspection", "focuses", "focus", "strategy", "standard", "standards", "manual",
    "procedure", "process", "stage", "title", "sop", "qa", "qc", "ipqc", "oqc", "ctq",
    // Generic action verbs & routine instructional filler that appear on virtually every slide
    "check", "checking", "inspect", "inspecting", "use", "using", "make", "sure", "adjust",
    "adjusting", "need", "needed", "conduct", "conducted", "follow", "following", "before", "after",
    "operator", "operation", "method", "result", "results", "item", "items", "line", "lines",
    "have", "has", "had", "will", "would", "can", "could", "should", "must"
  ]);

  // Length ratio sanity check: If one is a single short word or header and the other is a long paragraph, reject early
  const lenRatio = Math.min(viText.length, enText.length) / Math.max(viText.length, enText.length);
  const sameStep = Boolean(stepVi && stepEn && stepVi === stepEn);
  if (lenRatio < 0.35 && !sameStep) {
    return {
      isPair: false,
      confidence: 0.1,
      reason: "Độ dài chênh lệch quá lớn, không đủ bằng chứng ngữ nghĩa để coi là cặp dịch."
    };
  }

  const probeTokens = probeEn.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !EN_STOP_WORDS.has(w));
  const enTokens = enLower.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !EN_STOP_WORDS.has(w));

  let sharedContentWords = 0;
  for (const pt of probeTokens) {
    if (enTokens.some((et) => et.includes(pt) || pt.includes(et))) {
      sharedContentWords++;
    }
  }

  const minTokens = Math.min(probeTokens.length, enTokens.length);
  const tokenRatio = minTokens > 0 ? sharedContentWords / minTokens : 0;

  // Criteria for genuine bilingual pair:
  // - High glossary alignment (shared domain terms), OR
  // - Significant content word overlap between probe translation and EN text (>= 0.35 AND shared >= 2), OR
  // - Matching step number WITH substantive content overlap (shared >= 2, or shared specs/glossary)
  if (matchedGlossaryCount >= 1 && (tokenRatio >= 0.25 || numVi.some((n) => numEn.includes(n)))) {
    return {
      isPair: true,
      confidence: 0.95,
      reason: `Khớp thuật ngữ từ điển (${matchedGlossaryCount} thuật ngữ) và thông số kỹ thuật.`
    };
  }

  if (sharedContentWords >= 2 && tokenRatio >= 0.35) {
    return {
      isPair: true,
      confidence: 0.88,
      reason: `Độ tương đồng ngữ nghĩa cao (${Math.round(tokenRatio * 100)}% từ khóa cốt lõi).`
    };
  }

  // Same step requires either multiple shared substantive technical words, identical numeric specs, or glossary match
  const hasSharedSpecs = numVi.length > 0 && numVi.some((n) => numEn.includes(n));
  const isShortStep = Math.max(viText.length, enText.length) <= 30;
  if (sameStep && (hasSharedSpecs || matchedGlossaryCount >= 1 || sharedContentWords >= 2 || (isShortStep && sharedContentWords >= 1))) {
    return {
      isPair: true,
      confidence: 0.85,
      reason: `Cùng số thứ tự bước ${stepVi} và có từ khóa kỹ thuật tương đồng.`
    };
  }

  // If no semantic overlap was found, REJECT pairing to prevent false skipping
  return {
    isPair: false,
    confidence: 0.2,
    reason: "Không tìm thấy bằng chứng tương đồng ngữ nghĩa; cần dịch độc lập thay vì ghép cặp."
  };
}
