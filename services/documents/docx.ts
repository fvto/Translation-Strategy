import mammoth from "mammoth";
import JSZip from "jszip";
import { DocumentProcessor, ExtractedDocument, ExtractedTermCandidate, DocumentSection, DocumentTable } from "./types";

export class DocxProcessor implements DocumentProcessor {
  async process(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    const rawResult = await mammoth.extractRawText({ buffer });
    const fullText = rawResult.value;

    const sections: DocumentSection[] = [];
    const termCandidates: ExtractedTermCandidate[] = [];
    const tables: DocumentTable[] = [];

    // Parse docx document.xml with JSZip to get structured headings & tables
    try {
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");

      if (docXml) {
        // Extract paragraph texts with style hints
        const pMatches = docXml.match(/<w:p(?:\s|>)[^]*?<\/w:p>/g) || [];
        let currentSection: DocumentSection = {
          title: "Introduction",
          level: 1,
          content: "",
        };

        for (const pXml of pMatches) {
          // Extract text runs
          const tMatches = pXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [];
          const text = tMatches
            .map((m) => m.replace(/<[^>]+>/g, ""))
            .join("")
            .trim();

          if (!text) continue;

          // Check if heading
          const isHeading = /<w:pStyle\s+w:val="Heading(\d)"/.test(pXml);
          if (isHeading) {
            if (currentSection.content.trim()) {
              sections.push({ ...currentSection });
            }
            const levelMatch = pXml.match(/<w:pStyle\s+w:val="Heading(\d)"/);
            currentSection = {
              title: text,
              level: levelMatch ? parseInt(levelMatch[1], 10) : 1,
              content: "",
            };
          } else {
            currentSection.content += (currentSection.content ? "\n" : "") + text;
          }

          // Extract potential terminology patterns like:
          // "Access Control: Kiểm soát truy cập" or "Access Control (Kiểm soát truy cập)"
          const colonMatch = text.match(/^([A-Za-z0-9\s]{3,40})\s*[:\-=–—]\s*(.+)$/);
          if (colonMatch) {
            const src = colonMatch[1].trim();
            const tgt = colonMatch[2].trim();
            if (src.length > 2 && tgt.length > 1 && !src.toLowerCase().startsWith("http")) {
              termCandidates.push({
                sourceTerm: src,
                targetTerm: tgt,
                sourceLanguage: "en",
                targetLanguage: "vi",
                context: currentSection.title,
                confidence: 0.85,
              });
            }
          }
        }

        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }
      }
    } catch (e) {
      console.warn("Structured XML parse warning for DOCX, using fallback:", e);
    }

    // Fallback if no sections extracted from XML
    if (sections.length === 0 && fullText.trim()) {
      const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim());
      paragraphs.forEach((p, i) => {
        sections.push({
          title: `Paragraph ${i + 1}`,
          content: p.trim(),
        });
      });
    }

    return {
      fileName,
      fileType: "docx",
      fullText,
      sections,
      tables,
      termCandidates,
    };
  }
}
