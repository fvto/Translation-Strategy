import JSZip from "jszip";
import { DocumentProcessor, ExtractedDocument, ExtractedTermCandidate, DocumentSection } from "./types";

export class PptxProcessor implements DocumentProcessor {
  async process(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    const zip = await JSZip.loadAsync(buffer);
    const sections: DocumentSection[] = [];
    const termCandidates: ExtractedTermCandidate[] = [];
    const fullTextParts: string[] = [];

    // Find all slide XML files: ppt/slides/slide{N}.xml
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)![0], 10);
        const numB = parseInt(b.match(/\d+/)![0], 10);
        return numA - numB;
      });

    let slideIndex = 1;
    for (const slidePath of slideFiles) {
      const slideXml = await zip.file(slidePath)?.async("string");
      if (!slideXml) continue;

      // Extract all text elements: <a:t>...</a:t>
      const textMatches = slideXml.match(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g) || [];
      const slideTexts = textMatches
        .map((m) => m.replace(/<[^>]+>/g, "").trim())
        .filter((t) => t.length > 0);

      if (slideTexts.length === 0) {
        slideIndex++;
        continue;
      }

      const slideTitle = slideTexts[0] || `Slide ${slideIndex}`;
      const slideBody = slideTexts.slice(1).join("\n");

      sections.push({
        title: `Slide ${slideIndex}: ${slideTitle}`,
        content: slideBody || slideTitle,
        level: 1,
      });

      fullTextParts.push(`[Slide ${slideIndex}: ${slideTitle}]\n${slideBody}`);

      // Extract term definitions or pairs in slide bullet points
      for (const line of slideTexts) {
        const match = line.match(/^([A-Za-z0-9\s]{3,35})\s*[:\-=–—]\s*(.+)$/);
        if (match) {
          const src = match[1].trim();
          const tgt = match[2].trim();
          if (src.length > 2 && tgt.length > 1) {
            termCandidates.push({
              sourceTerm: src,
              targetTerm: tgt,
              sourceLanguage: "en",
              targetLanguage: "vi",
              context: `Slide ${slideIndex}: ${slideTitle}`,
              confidence: 0.8,
            });
          }
        }
      }

      slideIndex++;
    }

    return {
      fileName,
      fileType: "pptx",
      fullText: fullTextParts.join("\n\n"),
      sections,
      termCandidates,
      metadata: {
        pageOrSlideCount: slideFiles.length,
      },
    };
  }
}
