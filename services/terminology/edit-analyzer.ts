import { db } from "../database/db";
import { COMMON_PHRASES, OFFLINE_DICTIONARY, VI_EN_DICTIONARY } from "../translation/dictionary";
import { GeminiTranslationProvider } from "../translation/gemini";
import { isSpecializedTermCandidate } from "./unmapped-detector";

export interface AnalyzedEditSuggestion {
  sourceTerm: string;
  targetTerm: string;
  oldTerm?: string;
  category: "Bộ vị (Component)" | "Quy trình (Process)" | "Lỗi chất lượng (CTQ Defect)" | "Vật liệu & Thông số (Material/Spec)" | "Thuật ngữ chung (General)";
  reason: string;
  confidence: number;
  occurrencesInDeck?: number;
  matchingParagraphIds?: string[];
  isAlreadyInGlossary?: boolean;
}

export interface AnalyzeEditRequest {
  paragraphId: string;
  originalText: string;
  oldTranslatedText: string;
  newTranslatedText: string;
  stageContext?: string;
  deckSlides?: Array<{
    slideIndex: number;
    paragraphs: Array<{ id: string; originalText: string; translatedText: string }>;
  }>;
}

/**
 * Extracts difference between two strings by trimming common prefix and suffix words.
 */
function extractWordDiff(oldText: string, newText: string): { oldSub: string; newSub: string } | null {
  const oldWords = oldText.trim().split(/\s+/);
  const newWords = newText.trim().split(/\s+/);

  // Common prefix length
  let prefixLen = 0;
  while (
    prefixLen < oldWords.length &&
    prefixLen < newWords.length &&
    oldWords[prefixLen].toLowerCase() === newWords[prefixLen].toLowerCase()
  ) {
    prefixLen++;
  }

  // Common suffix length
  let oldSuffixIdx = oldWords.length - 1;
  let newSuffixIdx = newWords.length - 1;
  while (
    oldSuffixIdx >= prefixLen &&
    newSuffixIdx >= prefixLen &&
    oldWords[oldSuffixIdx].toLowerCase() === newWords[newSuffixIdx].toLowerCase()
  ) {
    oldSuffixIdx--;
    newSuffixIdx--;
  }

  const oldDiffWords = oldWords.slice(prefixLen, oldSuffixIdx + 1);
  const newDiffWords = newWords.slice(prefixLen, newSuffixIdx + 1);

  if (newDiffWords.length === 0) return null;

  const oldSub = oldDiffWords.join(" ").replace(/^[,\.\;\:\(\)\[\]"\']+|[,\.\;\:\(\)\[\]"\']+$/g, "").trim();
  const newSub = newDiffWords.join(" ").replace(/^[,\.\;\:\(\)\[\]"\']+|[,\.\;\:\(\)\[\]"\']+$/g, "").trim();

  return { oldSub, newSub };
}

/**
 * Categorizes a footwear term based on keywords.
 */
function detectCategory(
  term: string
): "Bộ vị (Component)" | "Quy trình (Process)" | "Lỗi chất lượng (CTQ Defect)" | "Vật liệu & Thông số (Material/Spec)" | "Thuật ngữ chung (General)" {
  const lower = term.toLowerCase();
  if (/\b(?:vamp|quarter|heel|tongue|toe|collar|eyestay|outsole|midsole|lining|foxing|insole|sockliner|mudguard|tip)\b/i.test(lower)) {
    return "Bộ vị (Component)";
  }
  if (/\b(?:gap|wrinkle|crack|defect|bubble|overflow|stain|fading|crooked|skew|delaminat|peel|blemish)\b/i.test(lower)) {
    return "Lỗi chất lượng (CTQ Defect)";
  }
  if (/\b(?:cement|buff|press|stitch|cut|sew|mold|shape|last|weld|prim|heat|cool)\b/i.test(lower)) {
    return "Quy trình (Process)";
  }
  if (/\b(?:tpu|eva|mesh|foam|leather|rubber|spec|spi|temp|mm|gauge|margin)\b/i.test(lower)) {
    return "Vật liệu & Thông số (Material/Spec)";
  }
  return "Thuật ngữ chung (General)";
}

/**
 * Analyzes what specific domain term was changed when a user edits a paragraph in SlideReviewModal.
 */
export async function analyzeParagraphEdit(
  req: AnalyzeEditRequest
): Promise<AnalyzedEditSuggestion | null> {
  const { originalText, oldTranslatedText, newTranslatedText, deckSlides } = req;

  if (!newTranslatedText || !originalText) return null;
  if (oldTranslatedText.trim() === newTranslatedText.trim()) return null;

  const diff = extractWordDiff(oldTranslatedText, newTranslatedText);
  if (!diff || !diff.newSub) return null;

  const { oldSub, newSub } = diff;

  // Filter out pure punctuation or trivial whitespace changes
  if (newSub.length < 2 || newSub.split(/\s+/).length > 5) return null;

  let candidateSource = "";
  let candidateTarget = newSub;
  let detectedReason = `Bạn vừa chuẩn hóa "${oldSub || "bản dịch cũ"}" thành "${newSub}"`;
  const lowerNew = newSub.toLowerCase();

  // 1. Check exact match in OFFLINE_DICTIONARY (en -> vi)
  if (OFFLINE_DICTIONARY[lowerNew]) {
    const vi = OFFLINE_DICTIONARY[lowerNew];
    const viVariants = vi.split(/[\/,]/).map(v => v.trim().toLowerCase());
    for (const variant of viVariants) {
      if (variant && originalText.toLowerCase().includes(variant)) {
        candidateSource = variant;
        candidateTarget = newSub;
        break;
      }
    }
    if (!candidateSource && viVariants.length > 0) {
      candidateSource = viVariants[0];
      candidateTarget = newSub;
    }
  }

  // 2. Check exact match in COMMON_PHRASES (en === newSub)
  if (!candidateSource) {
    const exactPhrase = COMMON_PHRASES.find(
      (p) => p.en.toLowerCase() === lowerNew && originalText.toLowerCase().includes(p.vi.toLowerCase())
    );
    if (exactPhrase) {
      candidateSource = exactPhrase.vi;
      candidateTarget = exactPhrase.en;
    }
  }

  // 3. Direct alignment check in originalText (e.g. Tip-quarter, SPI, Nike model codes)
  if (!candidateSource) {
    // Check if newSub (e.g. Tip-quarter) matches an unhyphenated form in originalText (e.g. Tip quarter)
    const spacedPattern = newSub.replace(/[\-_]/g, " ");
    const origWords = originalText.split(/[\s,;:.]+/);
    for (let len = 4; len >= 1; len--) {
      for (let w = 0; w <= origWords.length - len; w++) {
        const phrase = origWords.slice(w, w + len).join(" ");
        if (
          phrase.toLowerCase() === spacedPattern.toLowerCase() ||
          phrase.toLowerCase() === newSub.toLowerCase()
        ) {
          candidateSource = phrase;
          break;
        }
      }
      if (candidateSource) break;
    }
  }

  // 4. Partial match in COMMON_PHRASES (only if candidateSource not found yet)
  if (!candidateSource) {
    const partialPhrase = COMMON_PHRASES.find(
      (p) => p.en.toLowerCase().includes(lowerNew) && originalText.toLowerCase().includes(p.vi.toLowerCase())
    );
    if (partialPhrase) {
      candidateSource = partialPhrase.vi;
      candidateTarget = partialPhrase.en;
    }
  }

  // 5. Fallback to AI-assisted analysis if Gemini is available and candidateSource is still fuzzy
  if (!candidateSource && process.env.GEMINI_KEY) {
    try {
      const gemini = new GeminiTranslationProvider();
      const prompt = `You are a Footwear Translation Specialist for Nike / Ching Luh.
The user just edited a translated sentence. Analyze the exact domain term they modified.
Source sentence (Vietnamese): "${originalText}"
Previous translation: "${oldTranslatedText}"
User corrected translation: "${newTranslatedText}"

Extracted modified English phrase: "${newSub}"

Task:
1. Identify the exact corresponding source term in the Vietnamese sentence (1 to 4 words).
2. Clean the target English term (1 to 4 words).
3. If this is just minor punctuation or word-order polish, return null.

Return strictly a JSON object with format:
{
  "sourceTerm": "...",
  "targetTerm": "...",
  "category": "Bộ vị (Component)" | "Quy trình (Process)" | "Lỗi chất lượng (CTQ Defect)" | "Vật liệu & Thông số (Material/Spec)" | "Thuật ngữ chung (General)",
  "reason": "..."
}
or return null if no distinct domain terminology was changed.`;

      const res = await gemini.translate({
        sourceText: prompt,
        sourceLanguage: "vi",
        targetLanguage: "en",
        approvedTerminology: [],
      });

      if (res && res.translatedText) {
        let cleanJson = res.translatedText.trim();
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
        if (cleanJson !== "null" && cleanJson.startsWith("{")) {
          const parsed = JSON.parse(cleanJson);
          if (parsed && parsed.sourceTerm && parsed.targetTerm) {
            candidateSource = parsed.sourceTerm.trim();
            candidateTarget = parsed.targetTerm.trim();
            if (parsed.reason) detectedReason = parsed.reason;
          }
        }
      }
    } catch (e) {
      // Ignore AI errors and fall back to heuristics
    }
  }

  // If still no source, fallback to diff if it has viable candidates
  if (!candidateSource) {
    // If originalText contains parts of oldSub or if newSub itself is a technical acronym
    if (/^[A-Z0-9\-\/]{2,15}$/.test(newSub)) {
      candidateSource = newSub;
    } else {
      return null;
    }
  }

  // Check if this term already exists in approved database with exact mapping
  const existingTerms = db.getTerminology();
  const isAlreadyInGlossary = existingTerms.some(
    (t) =>
      t.sourceTerm.toLowerCase().trim() === candidateSource.toLowerCase().trim() &&
      t.targetTerm.toLowerCase().trim() === candidateTarget.toLowerCase().trim() &&
      t.status === "approved"
  );

  // Scan presentation slides to see how many other paragraphs in this deck contain the old term or source term
  let occurrencesInDeck = 0;
  const matchingParagraphIds: string[] = [];

  if (deckSlides && deckSlides.length > 0) {
    const searchTarget = (oldSub || candidateTarget).toLowerCase();
    const searchSource = candidateSource.toLowerCase();

    for (const slide of deckSlides) {
      for (const p of slide.paragraphs) {
        if (p.id === req.paragraphId) continue;
        const matchesTarget = p.translatedText.toLowerCase().includes(searchTarget);
        const matchesSource = p.originalText.toLowerCase().includes(searchSource);
        if (matchesTarget || matchesSource) {
          occurrencesInDeck++;
          matchingParagraphIds.push(p.id);
        }
      }
    }
  }

  return {
    sourceTerm: candidateSource,
    targetTerm: candidateTarget,
    oldTerm: oldSub,
    category: detectCategory(candidateTarget),
    reason: isAlreadyInGlossary 
      ? `Thuật ngữ chuẩn "${candidateTarget}" (${candidateSource}) đã có trong Glossary` 
      : detectedReason,
    confidence: candidateSource && candidateTarget ? 0.95 : 0.7,
    occurrencesInDeck,
    matchingParagraphIds,
    isAlreadyInGlossary,
  };
}
