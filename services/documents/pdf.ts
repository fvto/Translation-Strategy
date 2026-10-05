import { DocumentProcessor, ExtractedDocument, ExtractedTermCandidate, DocumentSection } from "./types";

export class PdfProcessor implements DocumentProcessor {
  async process(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    // Dynamic import to handle pdf-parse in Next.js/Node environment safely
    // @ts-ignore
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(buffer);

    const fullText = data.text || "";
    const isScanned = fullText.trim().length < 50; // Very little text suggests image-only scanned PDF

    const sections: DocumentSection[] = [];
    const termCandidates: ExtractedTermCandidate[] = [];

    // Split into pages or paragraphs
    const pages = fullText.split(/\f|\n\s*\n\s*\n/).filter((p: string) => p.trim());
    pages.forEach((pageText: string, idx: number) => {
      const lines = pageText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const pageTitle = lines[0] ? lines[0].slice(0, 60) : `Page ${idx + 1}`;

      sections.push({
        title: `Section ${idx + 1}: ${pageTitle}`,
        content: pageText.trim(),
        level: 1,
      });

      // Scan lines for potential glossary definitions:
      // e.g. "Access Control — A security technique..."
      for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9\s]{3,35})\s*[:\-=–—]\s*(.+)$/);
        if (match) {
          const src = match[1].trim();
          const tgtOrDef = match[2].trim();
          if (src.length > 2 && tgtOrDef.length > 2 && !src.toLowerCase().startsWith("http")) {
            termCandidates.push({
              sourceTerm: src,
              targetTerm: tgtOrDef,
              sourceLanguage: "en",
              targetLanguage: "vi",
              definition: tgtOrDef,
              context: pageTitle,
              confidence: 0.75,
            });
          }
        }
      }
    });

    return {
      fileName,
      fileType: "pdf",
      fullText,
      sections,
      termCandidates,
      metadata: {
        pageOrSlideCount: data.numpages,
        isScanned,
      },
    };
  }
}
