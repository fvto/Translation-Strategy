export interface DocumentSection {
  title?: string;
  level?: number;
  content: string;
}

export interface DocumentTable {
  headers: string[];
  rows: string[][];
}

export interface ExtractedTermCandidate {
  sourceTerm: string;
  targetTerm: string;
  sourceLanguage: string;
  targetLanguage: string;
  definition?: string;
  context?: string;
  category?: string;
  confidence: number;
}

export interface ExtractedDocument {
  fileName: string;
  fileType: "xlsx" | "docx" | "pptx" | "pdf";
  fullText: string;
  sections: DocumentSection[];
  tables?: DocumentTable[];
  termCandidates: ExtractedTermCandidate[];
  metadata?: {
    pageOrSlideCount?: number;
    sheetNames?: string[];
    isScanned?: boolean;
  };
}

export interface DocumentProcessor {
  process(buffer: Buffer, fileName: string): Promise<ExtractedDocument>;
}
