import { DocumentProcessor, ExtractedDocument } from "./types";
import { XlsxProcessor } from "./xlsx";
import { DocxProcessor } from "./docx";
import { PptxProcessor } from "./pptx";
import { PdfProcessor } from "./pdf";
import { validateFileSignature } from "../security/validator";

export * from "./types";

export class DocumentProcessingService {
  private xlsxProcessor = new XlsxProcessor();
  private docxProcessor = new DocxProcessor();
  private pptxProcessor = new PptxProcessor();
  private pdfProcessor = new PdfProcessor();

  async processDocument(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    const validation = validateFileSignature(buffer, fileName);
    if (!validation.valid || !validation.detectedType) {
      throw new Error(validation.error || "Invalid file format or header mismatch.");
    }

    let processor: DocumentProcessor;
    switch (validation.detectedType) {
      case "xlsx":
        processor = this.xlsxProcessor;
        break;
      case "docx":
        processor = this.docxProcessor;
        break;
      case "pptx":
        processor = this.pptxProcessor;
        break;
      case "pdf":
        processor = this.pdfProcessor;
        break;
      default:
        throw new Error(`Unsupported document type: ${validation.detectedType}`);
    }

    return await processor.process(buffer, fileName);
  }
}

export const documentProcessingService = new DocumentProcessingService();
