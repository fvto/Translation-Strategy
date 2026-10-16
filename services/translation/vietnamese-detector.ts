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
  "marking", "markings", "gauge", "last", "bottom", "size", "larger", "follow", "specifications"
]);

/**
 * Determines whether a string is Vietnamese text (with diacritics, unaccented, or code-switching mixed).
 */
export function isVietnameseText(str: string): boolean {
  if (!str || !str.trim()) return false;
  const trimmed = str.trim();

  // 1. Accented Vietnamese
  if (hasVietnameseDiacritics(trimmed)) return true;

  const form = auditTextForms(trimmed);
  const compact = form.compact.toLowerCase();

  // 2. Contains characteristic Vietnamese phrases (unaccented or accented)
  for (const pattern of VI_PHRASE_PATTERNS) {
    if (compact.includes(pattern)) return true;
  }

  // 2.5. Footwear operation commands (even with mixed code-switching like "May mudguard", "May logo", "Quét primer")
  if (/(?:^|\s)[\*•\-#]?\s*(?:\d+[.)]\s*)?(?:may|dan|mai|quet|go|chat|ep|kiem\s*tra|dinh\s*hinh|ve\s*sinh)\s+(?:mudguard|logo|vien|lot|vong\s*co|de|mui|than|luoi|upper|outsole|midsole|heel|toe|collar|lining|tongue|strap|eyestay|label|jig|khuon|keo|primer)/i.test(trimmed)) {
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
function extractNumericParameters(str: string): string[] {
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
  const t1HasDiacritics = hasVietnameseDiacritics(t1);
  const t2HasDiacritics = hasVietnameseDiacritics(t2);

  let viText: string;
  let enText: string;

  if (t1HasDiacritics && !t2HasDiacritics) {
    viText = t1;
    enText = t2;
  } else if (!t1HasDiacritics && t2HasDiacritics) {
    viText = t2;
    enText = t1;
  } else {
    const t1IsVi = isVietnameseText(t1);
    const t2IsVi = isVietnameseText(t2);

    if ((t1IsVi && t2IsVi) || (!t1IsVi && !t2IsVi)) {
      return {
        isPair: false,
        confidence: 0,
        reason: "Cả hai đoạn văn bản đều cùng một ngôn ngữ (không phải cặp song ngữ VI/EN)."
      };
    }

    viText = t1IsVi ? t1 : t2;
    enText = t1IsVi ? t2 : t1;
  }

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

  // 3. Step number consistency check: If both have step numbers, they MUST match
  const stepVi = extractItemStepPrefix(viText);
  const stepEn = extractItemStepPrefix(enText);
  if (stepVi && stepEn && stepVi !== stepEn) {
    return {
      isPair: false,
      confidence: 0,
      reason: `Số thứ tự bước không khớp (VI: bước ${stepVi}, EN: bước ${stepEn}).`
    };
  }

  // 4. Numerical parameters check: If both contain measurements/numbers, they must be consistent
  const numVi = extractNumericParameters(viText);
  const numEn = extractNumericParameters(enText);
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

  const probeTokens = probeEn.split(/\s+/).filter((w) => w.length >= 3 && !COMMON_EN_WORDS.has(w));
  const enTokens = enLower.split(/\s+/).filter((w) => w.length >= 3 && !COMMON_EN_WORDS.has(w));

  let sharedContentWords = 0;
  for (const pt of probeTokens) {
    if (enTokens.some((et) => et.includes(pt) || pt.includes(et))) {
      sharedContentWords++;
    }
  }

  const tokenRatio = probeTokens.length > 0 ? sharedContentWords / probeTokens.length : 0;

  // Criteria for genuine bilingual pair:
  // - High glossary alignment (shared domain terms), OR
  // - Significant content word overlap between probe translation and EN text (>= 0.3), OR
  // - Matching step number WITH at least 1 shared content word or identical numbers
  if (matchedGlossaryCount >= 1 && (tokenRatio >= 0.2 || numVi.some((n) => numEn.includes(n)))) {
    return {
      isPair: true,
      confidence: 0.95,
      reason: `Khớp thuật ngữ từ điển (${matchedGlossaryCount} thuật ngữ) và thông số kỹ thuật.`
    };
  }

  if (tokenRatio >= 0.35) {
    return {
      isPair: true,
      confidence: 0.88,
      reason: `Độ tương đồng ngữ nghĩa cao (${Math.round(tokenRatio * 100)}% từ khóa cốt lõi).`
    };
  }

  if (stepVi && stepEn && stepVi === stepEn && (tokenRatio >= 0.2 || sharedContentWords >= 1)) {
    return {
      isPair: true,
      confidence: 0.85,
      reason: `Cùng số thứ tự bước ${stepVi} và có từ khóa kỹ thuật tương đồng.`
    };
  }

  // Length ratio sanity check: If one is a single short word and the other is a long paragraph, reject
  const lenRatio = Math.min(viText.length, enText.length) / Math.max(viText.length, enText.length);
  if (lenRatio < 0.25) {
    return {
      isPair: false,
      confidence: 0.1,
      reason: "Độ dài chênh lệch quá lớn, không đủ bằng chứng ngữ nghĩa để coi là cặp dịch."
    };
  }

  // If no semantic overlap was found, REJECT pairing to prevent false skipping
  return {
    isPair: false,
    confidence: 0.2,
    reason: "Không tìm thấy bằng chứng tương đồng ngữ nghĩa; cần dịch độc lập thay vì ghép cặp."
  };
}
