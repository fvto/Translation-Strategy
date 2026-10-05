import { TerminologyEntry } from "../database/types";
import { COMMON_PHRASES } from "../translation/dictionary";
import { adaptTermCasing, cleanTargetTerm, normalizeSpiTerminology } from "../translation/casing";
import { hasViDiacritics } from "./sanitizer";

export interface SlideParagraphLike {
  id?: string;
  slideIndex?: number;
  originalText: string;
  translatedText?: string;
  isInspectionItem?: boolean;
  isTitle?: boolean;
  shapeIndex?: number;
  paragraphIndex?: number;
}

export interface SlideDataLike {
  slideIndex: number;
  slideFileName?: string;
  title?: string;
  paragraphs: SlideParagraphLike[];
  notes?: string;
  translatedNotes?: string;
}

export interface UnmappedTermOption {
  targetTerm: string;
  label: string; // e.g. "Khuyên dùng (Chuẩn SOP)", "Phương án thay thế", "Thuật ngữ mở rộng"
  isRecommended?: boolean;
}

export interface UnmappedTermItem {
  id: string;
  slideIndex: number;
  slideFileName?: string;
  section: string; // "Tiêu đề Slide", "Hạng mục kiểm tra (Inspection Item)", "Quy trình chính (*Heading)", "Ghi chú slide", "Nội dung kỹ thuật"
  sourceTerm: string;
  currentTranslation: string;
  contextSnippet: string;
  category: "Bộ vị (Component)" | "Quy trình (Process)" | "Lỗi chất lượng (CTQ Defect)" | "Vật liệu & Thông số (Material/Spec)" | "Thuật ngữ chung (General)";
  suggestedOptions: UnmappedTermOption[];
  addedToGlossary?: boolean;
}

/**
 * Domain-specific alternatives and synonym mapping for athletic footwear manufacturing (Nike/Ching Luh SOP).
 */
const DOMAIN_SUGGESTION_MAP: Record<string, { category: UnmappedTermItem["category"]; options: string[] }> = {
  // Processes & Operations
  "dập gân": {
    category: "Quy trình (Process)",
    options: ["Rib debossing", "Rib embossing", "Fluting / Creasing"],
  },
  "lăn keo đáy": {
    category: "Quy trình (Process)",
    options: ["Bottom roller cementing", "Bottom roll cementing", "Outsole roll-gluing"],
  },
  "lăn keo": {
    category: "Quy trình (Process)",
    options: ["Roll cementing", "Roller glue application", "Roll-coating cement"],
  },
  "quét keo": {
    category: "Quy trình (Process)",
    options: ["Cement brushing", "Applying cement", "Brush cementing"],
  },
  "phun keo": {
    category: "Quy trình (Process)",
    options: ["Spray cementing", "Cement spraying", "Air-spray gluing"],
  },
  "sấy keo": {
    category: "Quy trình (Process)",
    options: ["Cement drying", "Heat activation", "Thermal tunnel drying"],
  },
  "quét primer": {
    category: "Quy trình (Process)",
    options: ["Primer application", "Applying primer", "Chemical priming"],
  },
  "quét chất xử lý": {
    category: "Quy trình (Process)",
    options: ["Primer application", "Surface treatment application", "Applying chemical primer"],
  },
  "mài da": {
    category: "Quy trình (Process)",
    options: ["Upper buffing", "Leather buffing", "Surface grinding"],
  },
  "mài đế": {
    category: "Quy trình (Process)",
    options: ["Sole buffing", "Outsole buffing", "Bottom grinding"],
  },
  "lạng da": {
    category: "Quy trình (Process)",
    options: ["Leather skiving", "Bevel skiving", "Edge skiving"],
  },
  "vô phom": {
    category: "Quy trình (Process)",
    options: ["Lasting", "Shoe lasting", "Upper lasting onto last"],
  },
  "kéo phom": {
    category: "Quy trình (Process)",
    options: ["Pulling over last", "Shoe lasting pull", "Last stretching"],
  },
  "định hình mũi": {
    category: "Quy trình (Process)",
    options: ["Tip shaping", "Toe shaping", "Vamp pre-forming"],
  },
  "định hình gót": {
    category: "Quy trình (Process)",
    options: ["Heel shaping", "Counter forming", "Heel pre-forming"],
  },
  "định hình nóng": {
    category: "Quy trình (Process)",
    options: ["Hot shaping", "Thermal molding", "Heat pre-forming"],
  },
  "định hình lạnh": {
    category: "Quy trình (Process)",
    options: ["Cold shaping", "Cold molding", "Chilled pre-forming"],
  },
  "ép nóng": {
    category: "Quy trình (Process)",
    options: ["Hot pressing", "Thermal pressing", "Heat compression"],
  },
  "ép lạnh": {
    category: "Quy trình (Process)",
    options: ["Cold pressing", "Chilled pressing", "Cold compression"],
  },
  "ép đáy": {
    category: "Quy trình (Process)",
    options: ["Sole attaching", "Bottom pressing", "Outsole pressing"],
  },
  "may viền": {
    category: "Quy trình (Process)",
    options: ["Binding stitching", "Collar binding", "Edge piping stitching"],
  },
  "may diễu": {
    category: "Quy trình (Process)",
    options: ["Topstitching", "Ornamental stitching", "Decorative surface stitching"],
  },
  "may lộn": {
    category: "Quy trình (Process)",
    options: ["Fold stitching", "Turned seam stitching", "Inside-out stitching"],
  },
  "đục lỗ": {
    category: "Quy trình (Process)",
    options: ["Hole punching", "Perforating", "Die punching"],
  },
  "đóng mắt cáo": {
    category: "Quy trình (Process)",
    options: ["Eyelet setting", "Eyeletting", "Eyelet riveting"],
  },
  "chiếu tia uv": {
    category: "Quy trình (Process)",
    options: ["UV irradiation", "UV curing", "Ultraviolet light treatment"],
  },

  // Components & Anatomy
  "mũi giày": {
    category: "Bộ vị (Component)",
    options: ["Vamp", "Toe cap", "Tip / Front upper"],
  },
  "gót giày": {
    category: "Bộ vị (Component)",
    options: ["Heel", "Heel counter", "Rear counter"],
  },
  "má trong": {
    category: "Bộ vị (Component)",
    options: ["Medial side (Med)", "Medial quarter", "Inner waist"],
  },
  "má ngoài": {
    category: "Bộ vị (Component)",
    options: ["Lateral side (Lat)", "Lateral quarter", "Outer waist"],
  },
  "lưỡi gà": {
    category: "Bộ vị (Component)",
    options: ["Tongue", "Shoe tongue", "Center tongue"],
  },
  "vòng cổ": {
    category: "Bộ vị (Component)",
    options: ["Collar opening", "Collar", "Shoe opening collar"],
  },
  "lót vòng cổ": {
    category: "Bộ vị (Component)",
    options: ["Collar lining", "Neck lining", "Collar pad lining"],
  },
  "đế giữa": {
    category: "Bộ vị (Component)",
    options: ["Midsole", "Phylon / EVA midsole", "Cushioning midsole"],
  },
  "đế ngoài": {
    category: "Bộ vị (Component)",
    options: ["Outsole", "Rubber outsole", "Bottom sole"],
  },
  "lót giày": {
    category: "Bộ vị (Component)",
    options: ["Sockliner", "Insole", "Removable footbed"],
  },
  "cúp gót": {
    category: "Bộ vị (Component)",
    options: ["Heel counter", "Heel cup", "Internal counter stiffener"],
  },
  "thanh giằng": {
    category: "Bộ vị (Component)",
    options: ["Shank", "Arch shank", "Midfoot stabilizer"],
  },
  "rập lạng": {
    category: "Bộ vị (Component)",
    options: ["Skiving pallet", "Skiving jig", "Skiving template"],
  },
  "khuôn dao": {
    category: "Bộ vị (Component)",
    options: ["Cutting die", "Clicker die", "Steel rule die"],
  },
  "lỗ trang trí": {
    category: "Bộ vị (Component)",
    options: ["Perforation holes", "Decorative holes", "Punch perforations"],
  },
  "ván lót": {
    category: "Bộ vị (Component)",
    options: ["Strobel board", "Insole board", "Lasting board"],
  },

  // Defects & CTQ Criteria
  "hở keo": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Bond gap", "Delamination / Open glue", "Unbonded seam"],
  },
  "sụp mí": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Dropped stitch", "Run-off stitching", "Collapsed seam edge"],
  },
  "lệch mí": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Seam misalignment", "Misaligned edge", "Uneven margin"],
  },
  "lệch tâm": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Off-center", "Misaligned center line", "Eccentric deviation"],
  },
  "đứt chỉ": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Broken thread", "Thread breakage", "Snapped stitch"],
  },
  "nhảy chỉ": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Skip stitch", "Skipped stitching", "Missed needle stitch"],
  },
  "xơ chỉ": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Frayed thread", "Fuzzy thread end", "Uncut thread fraying"],
  },
  "bọt khí": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Air bubble", "Blister", "Gas pocket / Foaming void"],
  },
  "lem keo": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Cement overflow", "Glue stain / Smear", "Excess cement spillage"],
  },
  "tràn keo": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Cement overflow", "Excess glue squeeze-out", "Glue flashing"],
  },
  "thiếu keo": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Lack of cement", "Starved glue line", "Insufficient cement coverage"],
  },
  "nhăn da": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Wrinkled leather", "Surface creasing", "Leather puckering"],
  },
  "nhăn lót": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Wrinkled lining", "Lining gather / fold", "Lining puckering"],
  },
  "trề biên": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Flashing", "Material edge overflow", "Protruding edge flash"],
  },
  "lộn chân": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Swapped feet", "Reversed shoes / feet", "Inside-out shoe match"],
  },
  "bấp bênh": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Rocking", "Instability / Wobble", "Uneven tread balance"],
  },
  "mài cao": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Over buffing", "Excessive grinding", "High buffing gouge"],
  },
  "biến dạng": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Deformation", "Distorted shape", "Warpage"],
  },
  "khác màu": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Color shade variation", "Color mismatch", "Shade variation"],
  },
  "độ bám dính": {
    category: "Lỗi chất lượng (CTQ Defect)",
    options: ["Bond strength", "Adhesion strength", "Peel adhesion"],
  },

  // Specifications & Tolerances
  "mật độ mũi may": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Stitch density (SPI)", "Stitches per inch", "SPI needle count"],
  },
  "độ sâu rãnh": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Groove depth", "Channel depth", "Trench depth"],
  },
  "độ sâu rãnh mài": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Buffing groove depth", "Buffed channel depth", "Grinding groove tolerance"],
  },
  "khoảng cách biên": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Edge margin", "Margin distance", "Border clearance"],
  },
  "cách biên": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Margin", "Edge allowance", "Border distance"],
  },
  "lực dán": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Bond strength (kg/cm)", "Adhesion force", "Peel bond strength"],
  },
  "thời gian ép": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Pressing time (seconds)", "Dwell time", "Compression duration"],
  },
  "nhiệt độ sấy": {
    category: "Vật liệu & Thông số (Material/Spec)",
    options: ["Drying temperature (°C)", "Oven temperature", "Tunnel temperature"],
  },
};

/**
 * Normalizes text to lowercase single-spaced string for fuzzy lookups.
 */
function normalizeKey(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Helper to determine which section a paragraph belongs to.
 */
function identifySection(p: any, slideIndex: number): string {
  if (p.isInspectionItem) {
    return "Hạng mục kiểm tra (Inspection Item)";
  }
  if (p.isTitle || p.shapeIndex === 0) {
    return "Tiêu đề Slide (Slide Title)";
  }
  const text = (p.originalText || "").trim();
  if (text.startsWith("*")) {
    return "Quy trình chính (Process Heading)";
  }
  if (text.startsWith("•") || text.startsWith("-") || /^\d+[\.\)]/.test(text)) {
    return "Bước quy trình (Process Step)";
  }
  if (p.id?.startsWith("notes_")) {
    return "Ghi chú thuyết trình (Slide Notes)";
  }
  return "Nội dung kỹ thuật (Technical Content)";
}

/**
 * Checks whether a candidate string is a concise domain term rather than a full sentence or explanatory phrase.
 * Enforces:
 * - Word count <= 4 words
 * - Length <= 40 characters
 * - No sentence punctuation (. ? ! ; \n)
 * - No modal verbs / sentential connectors (phải, để, không bị, sau đó, tiến hành, v.v.)
 */
export function isSpecializedTermCandidate(text: string): boolean {
  if (!text || text.trim().length < 2 || text.trim().length > 40) return false;
  const trimmed = text.trim();
  if (/[\.\?\!\;\n\r]/.test(trimmed)) return false;
  if (/\b(phải|cần|nên|để|để không|không bị|sau đó|tiến hành|thực hiện|nhằm|nếu|khi|trong khi|bởi vì|trước khi|sau khi|tuyệt đối|chú ý|lưu ý|hãy|bị|được)\b/i.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return true;
}

/**
 * Determines whether a candidate term is legitimately a Vietnamese term (for VI -> EN translation).
 * Filters out pure English headings, acronyms, and alphanumeric model codes.
 */
export function isVietnameseCandidate(term: string): boolean {
  if (!term || term.trim().length < 2) return false;
  const trimmed = term.trim();
  if (!isSpecializedTermCandidate(trimmed)) return false;

  // If it has Vietnamese diacritical marks, it is genuine Vietnamese
  if (hasViDiacritics(trimmed)) return true;

  // If it directly matches a known Vietnamese key in DOMAIN_SUGGESTION_MAP
  const norm = normalizeKey(trimmed);
  if (DOMAIN_SUGGESTION_MAP[norm]) return true;

  // Without Vietnamese diacritics, it is NOT considered a Vietnamese source term.
  return false;
}

/**
 * Generates 2-3 tailored footwear domain suggestions for an unmapped term.
 * Strictly guarantees:
 * 1. Target terms are valid English (zero Vietnamese diacritics).
 * 2. Target terms are NEVER identical to source term (eliminates EN -> EN suggestions).
 */
export function generateSuggestions(
  sourceTerm: string,
  currentTranslation: string = "",
  category: UnmappedTermItem["category"] = "Thuật ngữ chung (General)"
): UnmappedTermOption[] {
  const norm = normalizeKey(sourceTerm);
  const rawOptions: UnmappedTermOption[] = [];

  // 1. Direct hit from domain suggestion map
  if (DOMAIN_SUGGESTION_MAP[norm]) {
    const entry = DOMAIN_SUGGESTION_MAP[norm];
    rawOptions.push(
      { targetTerm: entry.options[0], label: "Khuyên dùng (Chuẩn SOP)", isRecommended: true },
      { targetTerm: entry.options[1] || currentTranslation, label: "Phương án thay thế" },
      { targetTerm: entry.options[2] || "International Variant", label: "Thuật ngữ mở rộng" }
    );
  } else {
    // 2. Lookup in Cuu-am-chan-kinh COMMON_PHRASES dictionary
    const dictHit = COMMON_PHRASES.find((item) => normalizeKey(item.vi) === norm);
    if (dictHit) {
      const cleanEn = cleanTargetTerm(dictHit.en);
      const casedEn = adaptTermCasing(cleanEn, true);
      rawOptions.push(
        { targetTerm: casedEn, label: "Khuyên dùng (Chuẩn SOP)", isRecommended: true },
        { targetTerm: currentTranslation && currentTranslation !== casedEn ? currentTranslation : `${casedEn} (Process Variant)`, label: "Phương án thay thế" },
        { targetTerm: `Standard ${casedEn}`, label: "Thuật ngữ mở rộng" }
      );
    } else {
      // 3. CTQ Noun-Adjunct Rule: "Hình dạng [Bộ vị]" -> "[Component] shape"
      const shapeMatch = sourceTerm.match(/^(?:hình\s*dạng|độ\s*bo)\s+(.+)$/i);
      if (shapeMatch) {
        const compVi = shapeMatch[1].trim();
        let compEn = "Component";
        if (/mũi/i.test(compVi)) compEn = "Tip / Toe";
        else if (/gót/i.test(compVi)) compEn = "Heel";
        else if (/vòng\s*cổ/i.test(compVi)) compEn = "Collar";
        else if (/lưỡi/i.test(compVi)) compEn = "Tongue";

        rawOptions.push(
          { targetTerm: `${compEn} shape`, label: "Khuyên dùng (CTQ Adjunct Order)", isRecommended: true },
          { targetTerm: `${compEn} contour / profile`, label: "Phương án thay thế" },
          { targetTerm: `${compEn} symmetry`, label: "Thuật ngữ mở rộng" }
        );
      } else {
        // 4. Default intelligent fallback using the current slide translation
        const primaryOption = currentTranslation && currentTranslation.trim()
          ? normalizeSpiTerminology(currentTranslation.trim())
          : adaptTermCasing(sourceTerm, true);

        rawOptions.push(
          { targetTerm: primaryOption, label: "Khuyên dùng (Bản dịch AI)", isRecommended: true },
          { targetTerm: `${primaryOption} standard`, label: "Phương án thay thế" },
          { targetTerm: `${primaryOption} specification`, label: "Thuật ngữ mở rộng" }
        );
      }
    }
  }

  // Strictly filter options:
  // - No EN -> EN: target must NEVER be identical to sourceTerm
  // - No EN -> VI or VI -> VI: target must NEVER have Vietnamese diacritics
  // - Clean target terms and deduplicate
  const seenTargets = new Set<string>();
  const sanitizedOptions: UnmappedTermOption[] = [];

  for (const opt of rawOptions) {
    const cleaned = cleanTargetTerm(opt.targetTerm).trim();
    if (!cleaned || cleaned.length < 2) continue;
    if (normalizeKey(cleaned) === norm) continue; // Reject EN -> EN or identical
    if (hasViDiacritics(cleaned)) continue; // Reject Vietnamese leakage in target
    const key = normalizeKey(cleaned);
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);

    sanitizedOptions.push({
      targetTerm: cleaned,
      label: opt.label,
      isRecommended: sanitizedOptions.length === 0,
    });
  }

  return sanitizedOptions;
}

/**
 * Detects specialized footwear manufacturing terms across translated presentation slides
 * that are currently missing from the Glossary Review database.
 * 
 * STRICT RULES:
 * - Only detects VI -> EN terminology (never EN -> VI or EN -> EN).
 * - Candidate source terms MUST be authentic Vietnamese text. Pure English headings are excluded.
 * - Suggestions are strictly validated English terms and never equal the source term.
 */
export function detectUnmappedTerminology(
  slides: SlideDataLike[],
  existingGlossary: TerminologyEntry[],
  sourceLanguage: string = "vi",
  targetLanguage: string = "en"
): UnmappedTermItem[] {
  // STRICT RULE: Only suggest unmapped terms for VI -> EN direction.
  // Never suggest EN -> VI or EN -> EN.
  const srcLang = (sourceLanguage || "vi").toLowerCase().trim();
  const tgtLang = (targetLanguage || "en").toLowerCase().trim();
  if (srcLang !== "vi" || tgtLang !== "en") {
    return [];
  }

  // Build lookup index of all existing terms in database (approved + review)
  const existingSourceKeys = new Set<string>();
  const existingTargetKeys = new Set<string>();

  for (const entry of existingGlossary) {
    if (entry.sourceTerm) existingSourceKeys.add(normalizeKey(entry.sourceTerm));
    if (entry.targetTerm) existingTargetKeys.add(normalizeKey(entry.targetTerm));
  }

  const unmappedItems: UnmappedTermItem[] = [];
  const seenTermPerSlide = new Set<string>();

  for (const slide of slides) {
    const slideNumber = slide.slideIndex || 1;
    const allParagraphs = [...(slide.paragraphs || [])];

    // Also include slide notes if present
    if (slide.notes && slide.notes.trim()) {
      allParagraphs.push({
        id: `notes_s${slideNumber}`,
        slideIndex: slideNumber,
        shapeIndex: 999,
        paragraphIndex: 0,
        originalText: slide.notes,
        translatedText: slide.translatedNotes || "",
      });
    }

    for (const p of allParagraphs) {
      const origText = (p.originalText || "").trim();
      const transText = (p.translatedText || "").trim();
      if (!origText || origText.length < 3) continue;

      const section = identifySection(p, slideNumber);

      // --- Pattern A: Process Headings starting with '*' (e.g. *Ép lạnh:, *Mài da:, *Dập gân:) ---
      if (origText.startsWith("*")) {
        const headingMatch = origText.match(/^\*\s*([^:\n\r]+)(?::|$)/);
        if (headingMatch) {
          const rawTerm = headingMatch[1].trim();

          // Strict VI -> EN check: Candidate MUST be authentic Vietnamese text
          if (isVietnameseCandidate(rawTerm)) {
            const normTerm = normalizeKey(rawTerm);

            if (normTerm.length >= 3 && !existingSourceKeys.has(normTerm)) {
              const dedupKey = `${slideNumber}_${normTerm}`;
              if (!seenTermPerSlide.has(dedupKey)) {
                seenTermPerSlide.add(dedupKey);

                // Extract translated heading counterpart
                const transMatch = transText.match(/^\*\s*([^:\n\r]+)(?::|$)/);
                const transHeading = transMatch ? transMatch[1].trim() : transText.slice(0, 40);

                const suggestions = generateSuggestions(rawTerm, transHeading, "Quy trình (Process)");
                if (suggestions.length > 0) {
                  const currentTranslationValid = transHeading && normalizeKey(transHeading) !== normTerm && !hasViDiacritics(transHeading);

                  unmappedItems.push({
                    id: `unmapped_${slideNumber}_${unmappedItems.length + 1}`,
                    slideIndex: slideNumber,
                    slideFileName: slide.slideFileName,
                    section,
                    sourceTerm: rawTerm,
                    currentTranslation: currentTranslationValid ? transHeading : suggestions[0].targetTerm,
                    contextSnippet: origText.length > 100 ? `${origText.slice(0, 97)}...` : origText,
                    category: "Quy trình (Process)",
                    suggestedOptions: suggestions,
                  });
                }
              }
            }
          }
        }
      }

      // --- Pattern B: Inspection Items (CTQ) or specific criteria headers ---
      if (p.isInspectionItem || /^(?:hình\s*dạng|độ\s*bo|độ\s*sâu|chất\s*lượng|khoảng\s*cách|mức\s*độ|tiêu\s*chuẩn)\b/i.test(origText)) {
        const clause = origText.split(/[:\-\–\n]/)[0].trim();

        // Strict VI -> EN check: Candidate MUST be authentic Vietnamese text
        if (isVietnameseCandidate(clause)) {
          const normClause = normalizeKey(clause);

          if (normClause.length >= 3 && normClause.split(" ").length <= 4 && !existingSourceKeys.has(normClause)) {
            const dedupKey = `${slideNumber}_${normClause}`;
            if (!seenTermPerSlide.has(dedupKey)) {
              seenTermPerSlide.add(dedupKey);

              const transClause = transText.split(/[:\-\–\n]/)[0].trim();
              const suggestions = generateSuggestions(clause, transClause, "Lỗi chất lượng (CTQ Defect)");
              if (suggestions.length > 0) {
                const currentTranslationValid = transClause && normalizeKey(transClause) !== normClause && !hasViDiacritics(transClause);

                unmappedItems.push({
                  id: `unmapped_${slideNumber}_${unmappedItems.length + 1}`,
                  slideIndex: slideNumber,
                  slideFileName: slide.slideFileName,
                  section,
                  sourceTerm: clause,
                  currentTranslation: currentTranslationValid ? transClause : suggestions[0].targetTerm,
                  contextSnippet: origText.length > 100 ? `${origText.slice(0, 97)}...` : origText,
                  category: "Lỗi chất lượng (CTQ Defect)",
                  suggestedOptions: suggestions,
                });
              }
            }
          }
        }
      }

      // --- Pattern C: Known specialized footwear terms from DOMAIN_SUGGESTION_MAP ---
      const lowerOrig = origText.toLowerCase();
      for (const [keyTerm, meta] of Object.entries(DOMAIN_SUGGESTION_MAP)) {
        if (lowerOrig.includes(keyTerm)) {
          const norm = normalizeKey(keyTerm);
          if (!existingSourceKeys.has(norm)) {
            const dedupKey = `${slideNumber}_${norm}`;
            if (!seenTermPerSlide.has(dedupKey)) {
              seenTermPerSlide.add(dedupKey);

              const suggestions = generateSuggestions(keyTerm, meta.options[0], meta.category);
              if (suggestions.length > 0) {
                unmappedItems.push({
                  id: `unmapped_${slideNumber}_${unmappedItems.length + 1}`,
                  slideIndex: slideNumber,
                  slideFileName: slide.slideFileName,
                  section,
                  sourceTerm: adaptTermCasing(keyTerm, true),
                  currentTranslation: meta.options[0],
                  contextSnippet: origText.length > 100 ? `${origText.slice(0, 97)}...` : origText,
                  category: meta.category,
                  suggestedOptions: suggestions,
                });
              }
            }
          }
        }
      }
    }
  }

  return unmappedItems;
}
