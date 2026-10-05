import { TerminologyEntry } from "../database/types";

export interface MatchedTerm {
  entry: TerminologyEntry;
  startIndex: number;
  endIndex: number;
  matchedText: string;
}

export interface TerminologyMismatch {
  sourceTerm: string;
  expectedTarget: string;
  foundInTranslation: boolean;
  detectedAlternative?: string;
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  complianceScore: number; // 0 - 100
  totalApprovedTerms: number;
  matchedTerms: MatchedTerm[];
  mismatches: TerminologyMismatch[];
}
