import { db } from "../database/db";
import { TerminologyEntry } from "../database/types";
import { isSpecializedTermCandidate, generateSuggestions } from "./unmapped-detector";
import { GeminiTranslationProvider } from "../translation/gemini";
import * as fs from "fs";
import * as path from "path";

export interface PdfFeedResult {
  fileName: string;
  totalPages: number;
  totalCharacters: number;
  imageShieldActive: boolean;
  imagesExtracted: 0;
  extractedTermsCount: number;
  candidateTerms: Array<{
    sourceTerm: string;
    targetTerm: string;
    category: string;
    context: string;
    definition: string;
    page: number;
  }>;
  contextSummary: string;
}

export interface PdfFeedOptions {
  defaultStage?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  autoSaveToReview?: boolean;
}

/**
 * Smart PDF text renderer that preserves word spacing and line breaks,
 * preventing words from becoming glued/stuck together due to PDF font kerning offsets.
 */
function renderPdfPageWithSmartSpacing(pageData: any): Promise<string> {
  const renderOptions = {
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  };

  return pageData.getTextContent(renderOptions).then((textContent: any) => {
    let lastY: number | undefined;
    let lastX = 0;
    let lastWidth = 0;
    let text = "";

    for (const item of textContent.items) {
      const str = item.str;
      if (!str) continue;

      const currentX = item.transform[4];
      const currentY = item.transform[5];
      const itemWidth = item.width || 0;

      if (lastY === undefined || Math.abs(currentY - lastY) > 3) {
        // Line or paragraph break
        if (text.length > 0 && !text.endsWith("\n")) {
          if (lastY !== undefined && Math.abs(currentY - lastY) > 15) {
            text += "\n\n";
          } else {
            text += "\n";
          }
        }
        text += str;
      } else {
        // Same line: inspect distance to avoid stuck words
        const gap = currentX - (lastX + lastWidth);
        const prevEndsWithSpace = text.endsWith(" ") || text.endsWith("\t");
        const currStartsWithSpace = str.startsWith(" ") || str.startsWith("\t");

        if (!prevEndsWithSpace && !currStartsWithSpace) {
          if (gap > 1.2 || gap < -20) {
            text += " ";
          } else {
            const lastChar = text.slice(-1);
            const firstChar = str.charAt(0);
            if (
              /[a-zA-Z0-9À-ỹ]/.test(lastChar) &&
              /[a-zA-Z0-9À-ỹ(]/.test(firstChar) &&
              gap > 0.3
            ) {
              text += " ";
            }
          }
        }
        text += str;
      }

      lastY = currentY;
      lastX = currentX;
      lastWidth = itemWidth;
    }

    return text;
  });
}

/**
 * Normalizes glued words and strictly enforces footwear term standards (e.g. Tip-quarter with hyphen).
 */
export function normalizeFootwearTermSpacing(term: string): string {
  if (!term) return "";
  return term
    .replace(/\bTipquarter\b/g, "Tip-quarter")
    .replace(/\btipquarter\b/g, "tip-quarter")
    .replace(/\bTIPQUARTER\b/g, "TIP-QUARTER")
    .replace(/\bTip\s+quarter\b/gi, (m) => (m[0] === "T" ? "Tip-quarter" : "tip-quarter"));
}

/**
 * Feeds textual context from a PDF into the Glossary system.
 * STRICT SECURITY GUARANTEE:
 * - Reads digital text layer ONLY via pdf-parse.
 * - 0 images extracted, dumped, or sent to AI models.
 * - Extracts only concise domain terms (<= 4 words), setting status to "review" for user approval.
 */
export async function feedPdfContextToGlossary(
  pdfBuffer: Buffer,
  fileName: string,
  options: PdfFeedOptions = {}
): Promise<PdfFeedResult> {
  const defaultStage = options.defaultStage || "General";
  const sourceLang = options.sourceLanguage || "vi";
  const targetLang = options.targetLanguage || "en";

  let rawText = "";
  let totalPages = 1;

  // Support simulated test buffers in unit tests
  if (pdfBuffer.toString("utf8").startsWith("%PDF-MOCK")) {
    rawText = pdfBuffer.toString("utf8").replace(/^%PDF-MOCK[^\n]*\n/, "");
    totalPages = 1;
  } else {
    // 1. Text-only extraction using pdf-parse with custom smart spacing renderer (Zero image scanning)
    // @ts-ignore
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(pdfBuffer, {
      pagerender: renderPdfPageWithSmartSpacing,
    });

    rawText = data.text || "";
    totalPages = data.numpages || 1;
  }

  // Normalize any glued footwear terms in raw text
  rawText = normalizeFootwearTermSpacing(rawText);

  if (rawText.trim().length < 20) {
    throw new Error(
      "Tài liệu PDF không chứa lớp văn bản kỹ thuật số (có thể là file scan thuần ảnh). " +
      "Vì lý do bảo mật công ty (Zero-Image Shield), hệ thống tuyệt đối không thực hiện quét hình ảnh."
    );
  }

  // 2. Segment by pages
  const rawPages = rawText.split(/\f|\n\s*\n\s*\n/).filter((p) => p.trim());
  const pageEntries: Array<{ pageNumber: number; text: string }> = [];

  if (rawPages.length > 0) {
    rawPages.forEach((pText, i) => {
      pageEntries.push({ pageNumber: i + 1, text: pText.trim() });
    });
  } else {
    pageEntries.push({ pageNumber: 1, text: rawText.trim() });
  }

  // 3. Extract candidate terminology pairs
  const candidateTermsMap = new Map<
    string,
    { sourceTerm: string; targetTerm: string; category: string; context: string; definition: string; page: number }
  >();

  // Fetch existing approved terms to avoid duplicate noise
  const existingTerms = db.getTerminology({ status: "all" });
  const existingSourceSet = new Set(existingTerms.map((t) => t.sourceTerm.toLowerCase().trim()));

  // A. Deterministic pattern matching (Colon / Dash glossary pairs)
  for (const entry of pageEntries) {
    const lines = entry.text.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // e.g. "Mặt trước : Vamp" or "Đế ngoài - Outsole" or "Tip shape: Hình dạng mũi"
      const match = line.match(/^([A-Za-zÀ-ỹ0-9\s\/\-]{2,40})\s*[:\-=–—]\s*([A-Za-zÀ-ỹ0-9\s\/\-]{2,50})$/);
      if (match) {
        const p1 = match[1].trim();
        const p2 = match[2].trim();

        // Determine which is VI and which is EN
        const p1IsVi = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(p1);
        const p2IsVi = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(p2);

        let src = "";
        let tgt = "";

        if (p1IsVi && !p2IsVi) {
          src = p1;
          tgt = p2;
        } else if (!p1IsVi && p2IsVi) {
          src = p2;
          tgt = p1;
        } else if (sourceLang === "vi") {
          src = p1;
          tgt = p2;
        }

        src = normalizeFootwearTermSpacing(src);
        tgt = normalizeFootwearTermSpacing(tgt);

        if (src && tgt && src.toLowerCase() !== tgt.toLowerCase() && isSpecializedTermCandidate(src)) {
          const key = src.toLowerCase().trim();
          if (!candidateTermsMap.has(key) && !existingSourceSet.has(key)) {
            candidateTermsMap.set(key, {
              sourceTerm: src,
              targetTerm: tgt,
              category: defaultStage,
              context: `Trang ${entry.pageNumber}: ${line.slice(0, 120)}`,
              definition: `Trích xuất từ tài liệu PDF: ${fileName}`,
              page: entry.pageNumber,
            });
          }
        }
      }
    }
  }

  // B. Domain Dictionary & Unmapped Detector scanning
  for (const entry of pageEntries) {
    const lines = entry.text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length < 5 || line.length > 250) continue;

      // Extract words / phrases (1-4 words) that match known footwear domain keywords
      const words = line.split(/\s+/);
      for (let len = 4; len >= 1; len--) {
        for (let w = 0; w <= words.length - len; w++) {
          const phrase = words.slice(w, w + len).join(" ").replace(/^[^\wÀ-ỹ]+|[^\wÀ-ỹ]+$/g, "");
          if (isSpecializedTermCandidate(phrase)) {
            const normalizedPhrase = normalizeFootwearTermSpacing(phrase);
            const key = normalizedPhrase.toLowerCase().trim();
            if (!candidateTermsMap.has(key) && !existingSourceSet.has(key)) {
              const suggestions = generateSuggestions(normalizedPhrase, "", "Thuật ngữ chung (General)");
              if (suggestions.length > 0 && suggestions[0].targetTerm) {
                candidateTermsMap.set(key, {
                  sourceTerm: normalizedPhrase,
                  targetTerm: normalizeFootwearTermSpacing(suggestions[0].targetTerm),
                  category: defaultStage,
                  context: `Trang ${entry.pageNumber}: "${line.slice(0, 120)}"`,
                  definition: `Thuật ngữ đề xuất từ ngữ cảnh PDF: ${fileName}`,
                  page: entry.pageNumber,
                });
              }
            }
          }
        }
      }
    }
  }

  // C. AI-Powered Technical Term Harvester (if Gemini is available and we have pages)
  if (process.env.GEMINI_KEY && candidateTermsMap.size < 30) {
    try {
      const gemini = new GeminiTranslationProvider();
      // Sample 3 representative text pages for AI term discovery
      const sampleText = pageEntries
        .slice(0, 5)
        .map((p) => `[Trang ${p.pageNumber}]\n${p.text.slice(0, 1000)}`)
        .join("\n\n");

      const prompt = `You are a Footwear SOP Terminology Specialist for Nike / Ching Luh.
Analyze the following footwear technical manual / SOP digital text layer and extract specialized footwear manufacturing terms.
RULES:
1. Extract ONLY specific technical footwear terms (materials, operations, shoe components, quality defects, inspection standards).
2. Maximum 4 words per term. NO sentences, NO conversational phrases.
3. Source terms MUST be in Vietnamese (or English if bilingual manual).
4. Provide standard authoritative Nike/Ching Luh footwear translation (e.g. Tip shape, SPI 10-12 stitches/inch, Vamp, Bottom cementing, Buffing line).
5. Return strictly a JSON array of objects with format:
[
  {
    "sourceTerm": "mặt trước",
    "targetTerm": "vamp",
    "category": "Assembly",
    "context": "Kiểm tra mặt trước rập film",
    "page": 1
  }
]

Document Text:
${sampleText.slice(0, 4000)}`;

      const res = await gemini.translate({
        sourceText: prompt,
        sourceLanguage: "vi",
        targetLanguage: "en",
        approvedTerminology: [],
      });

      if (res && res.translatedText) {
        let cleanJson = res.translatedText.trim();
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (
              item.sourceTerm &&
              item.targetTerm &&
              isSpecializedTermCandidate(item.sourceTerm) &&
              item.sourceTerm.toLowerCase() !== item.targetTerm.toLowerCase()
            ) {
              const normSrc = normalizeFootwearTermSpacing(item.sourceTerm.trim());
              const normTgt = normalizeFootwearTermSpacing(item.targetTerm.trim());
              const k = normSrc.toLowerCase().trim();
              if (!candidateTermsMap.has(k) && !existingSourceSet.has(k)) {
                candidateTermsMap.set(k, {
                  sourceTerm: normSrc,
                  targetTerm: normTgt,
                  category: item.category || defaultStage,
                  context: `Trang ${item.page || 1}: ${item.context || ""}`,
                  definition: `AI trích xuất từ tài liệu PDF: ${fileName}`,
                  page: item.page || 1,
                });
              }
            }
          }
        }
      }
    } catch (aiErr) {
      console.warn("[PdfContextFeeder] AI extraction skipped or failed:", aiErr);
    }
  }

  const candidateTerms = Array.from(candidateTermsMap.values()).slice(0, 100);

  // 4. Save to persistent PDF context store for translation memory / reference
  try {
    const contextDir = path.resolve(process.cwd(), "data", "pdf_context");
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }
    const safeBase = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const contextFile = path.join(contextDir, `${safeBase}.json`);
    const contextData = {
      fileName,
      totalPages,
      totalCharacters: rawText.length,
      extractedAt: new Date().toISOString(),
      imageShieldActive: true,
      imagesExtracted: 0,
      sections: pageEntries.map((p) => ({
        page: p.pageNumber,
        snippet: p.text.slice(0, 500),
      })),
      harvestedTerms: candidateTerms,
    };
    fs.writeFileSync(contextFile, JSON.stringify(contextData, null, 2), "utf8");
  } catch (storageErr) {
    console.warn("[PdfContextFeeder] Failed to cache PDF context to file:", storageErr);
  }

  // 5. If autoSaveToReview is enabled, insert candidates into DB with status: "review"
  if (options.autoSaveToReview && candidateTerms.length > 0) {
    const toInsert = candidateTerms.map((c) => ({
      sourceTerm: c.sourceTerm,
      targetTerm: c.targetTerm,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      category: c.category || defaultStage,
      context: c.context,
      definition: c.definition,
      status: "review" as const, // STRICT USER RULE: Terms from files must enter as "review"
      sourceDocument: fileName,
      priority: 2,
    }));
    db.addTerminology(toInsert);
  }

  return {
    fileName,
    totalPages,
    totalCharacters: rawText.length,
    imageShieldActive: true,
    imagesExtracted: 0,
    extractedTermsCount: candidateTerms.length,
    candidateTerms,
    contextSummary: `Đã đọc thành công ${totalPages} trang (${rawText.length.toLocaleString()} ký tự văn bản số). Tuyệt đối không quét hoặc trích xuất hình ảnh.`,
  };
}
