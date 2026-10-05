import { db } from "@/services/database/db";
import { TerminologyEntry } from "@/services/database/types";

export interface HarvestResult {
  added: TerminologyEntry[];
  skipped: number;
}

const VI_DIACRITICS_REGEX = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/**
 * Normalizes text for clean dictionary storage.
 */
function cleanTerm(text: string): string {
  return text
    .replace(/^[\s\*\-\•\#\d+\.\:\)]+/, "") // strip bullet, numbers, asterisk at start
    .replace(/[\:\.\;\,\s]+$/, "")          // strip punctuation at end
    .trim();
}

/**
 * Checks whether a text is a concise specialized domain term rather than a full sentence or explanatory phrase.
 */
function isSpecializedTerm(text: string): boolean {
  if (!text || text.length < 2 || text.length > 40) return false;
  // Reject sentence ending punctuation or newlines
  if (/[\.\?\!\;\n\r]/.test(text)) return false;
  // Reject full sentences with modal/grammatical connectors
  if (/\b(phải|cần|nên|để|để không|không bị|sau đó|tiến hành|thực hiện|nhằm|nếu|khi|trong khi|bởi vì|trước khi|sau khi|tuyệt đối|chú ý|lưu ý|hãy|bị|được)\b/i.test(text)) {
    return false;
  }
  // Word count: specialized terminology is concise (1 to 5 words max)
  const words = text.trim().split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  return true;
}

/**
 * Extracts and auto-feeds standardized footwear terminology from translated presentation slides.
 * All harvested terms enter with status "review" so the user must approve them in Glossary Review.
 */
export function harvestTerminologyFromSlides(
  slides: any[],
  fileName: string,
  sourceLanguage: string = "vi",
  targetLanguage: string = "en"
): HarvestResult {
  const existingTerms = db.getApprovedTerminology(sourceLanguage, targetLanguage);
  const existingSourceMap = new Map<string, string>();
  for (const t of existingTerms) {
    existingSourceMap.set(t.sourceTerm.trim().toLowerCase(), t.targetTerm.trim().toLowerCase());
  }

  const candidateEntries: Omit<TerminologyEntry, "id" | "createdAt" | "updatedAt">[] = [];
  const seenInBatch = new Set<string>();
  let skipped = 0;

  const pushCandidate = (
    srcRaw: string,
    tgtRaw: string,
    category: string = "Auto-Harvested SOP",
    status: "approved" | "review" = "review",
    confidence: number = 0.95
  ) => {
    const src = cleanTerm(srcRaw);
    const tgt = cleanTerm(tgtRaw);

    // Validation & Hygiene rules: Only specialized terms, strictly NO full sentences
    if (!src || !tgt) return;
    if (!isSpecializedTerm(src) || !isSpecializedTerm(tgt)) return;

    // Strict Zero-Image Policy: Không feed hình ảnh, media paths, base64 hay file ảnh vào dữ liệu
    if (/\.(png|jpe?g|gif|bmp|webp|svg|tiff|emf|wmf|ico)$/i.test(src) || /\.(png|jpe?g|gif|bmp|webp|svg|tiff|emf|wmf|ico)$/i.test(tgt)) {
      return;
    }
    if (/^(data:image\/|image\d+|media\/|ppt\/media\/|rId\d+)/i.test(src) || /^(data:image\/|image\d+|media\/|ppt\/media\/|rId\d+)/i.test(tgt)) {
      return;
    }
    if (/\b(base64|image\/png|image\/jpeg|image\/webp|figure\s*\d+|picture\s*\d+)\b/i.test(src) || /\b(base64|image\/png|image\/jpeg)\b/i.test(tgt)) {
      return;
    }

    // Rule 1: Zero identical source/target
    if (src.toLowerCase() === tgt.toLowerCase()) return;

    // Rule 2: If translating VI -> EN, target must not leak Vietnamese diacritics
    if (sourceLanguage === "vi" && targetLanguage === "en") {
      if (VI_DIACRITICS_REGEX.test(tgt)) return;
      // Source must have Vietnamese characters or technical footwear terms
      if (!VI_DIACRITICS_REGEX.test(src) && !/\b(pfc|spi|eva|tpu|pu|airbag|jig|pallet|strobel|vamp|sole|foxing|in\s*sơn|mũi|gót)\b/i.test(src)) {
        return;
      }
    }

    const key = src.toLowerCase();
    if (seenInBatch.has(key)) return;

    // If identical term with identical translation already in DB, skip
    if (existingSourceMap.get(key) === tgt.toLowerCase()) {
      skipped++;
      return;
    }

    seenInBatch.add(key);
    candidateEntries.push({
      sourceTerm: src,
      targetTerm: tgt,
      sourceLanguage,
      targetLanguage,
      category,
      context: `SOP: ${fileName}`,
      definition: `Đề xuất thuật ngữ chuyên ngành từ tài liệu ${fileName}`,
      status: "review", // STRICT USER RULE: Terms from files must be reviewed and approved by user
      priority: 1,
      confidence,
      createdBy: "Auto-Harvester",
      sourceDocument: fileName,
      version: "v1.0",
    });
  };

  for (const slide of slides) {
    if (!Array.isArray(slide.paragraphs)) continue;

    for (const p of slide.paragraphs) {
      const orig = (p.originalText || "").trim();
      const trans = (p.translatedText || "").trim();
      if (!orig || !trans) continue;

      // 1. Process Headings: Only extract the specific process term (e.g. from "*Ép lạnh: thời gian 15\"" -> "Ép lạnh" / "Cold pressing")
      if (orig.startsWith("*")) {
        const cleanOrig = orig.replace(/^\*\s*/, "");
        const cleanTrans = trans.replace(/^\*\s*/, "");

        if (cleanOrig.includes(":") && cleanTrans.includes(":")) {
          const [oHead] = cleanOrig.split(":").map((s: string) => s.trim());
          const [tHead] = cleanTrans.split(":").map((s: string) => s.trim());
          if (oHead && tHead && isSpecializedTerm(oHead) && isSpecializedTerm(tHead)) {
            pushCandidate(oHead, tHead, "Quy trình (Process)", "review", 0.98);
          }
        } else if (isSpecializedTerm(cleanOrig) && isSpecializedTerm(cleanTrans)) {
          pushCandidate(cleanOrig, cleanTrans, "Quy trình (Process)", "review", 0.98);
        }
      }

      // 2. Inspection CTQ Criteria (e.g. "Hình dạng mũi", "Chất lượng logo in sơn", "Độ bám dính")
      if (/^(hình\s*dạng|chất\s*lượng|độ\s*bám\s*dính|tiêu\s*chuẩn|độ\s*bo|độ\s*lệch)\b/i.test(orig)) {
        const oClause = orig.split(/[:\-\–\n]/)[0].trim();
        const tClause = trans.split(/[:\-\–\n]/)[0].trim();
        if (isSpecializedTerm(oClause) && isSpecializedTerm(tClause)) {
          pushCandidate(oClause, tClause, "Tiêu chuẩn CTQ", "review", 0.96);
        }
      }

      // 3. Standard Defect Phrases (không lem sơn, không tưa liệu, tràn keo, trề biên, hở keo)
      if (/\b(không\s+lem|không\s+tưa|không\s+hở|tràn\s+keo|trề\s+biên|hở\s+keo|nhăn\s+da|bỏ\s+mũi|đứt\s+chỉ)\b/i.test(orig)) {
        const oClause = orig.split(/[:\-\–\n\.]/)[0].trim();
        const tClause = trans.split(/[:\-\–\n\.]/)[0].trim();
        if (isSpecializedTerm(oClause) && isSpecializedTerm(tClause)) {
          pushCandidate(oClause, tClause, "Lỗi chất lượng (Defect)", "review", 0.95);
        }
      }
    }
  }

  let added: TerminologyEntry[] = [];
  if (candidateEntries.length > 0) {
    added = db.addTerminology(candidateEntries);
    console.log(`[TerminologyHarvester] Harvested ${added.length} new candidate terms from "${fileName}" into review queue.`);
  }

  return { added, skipped };
}
