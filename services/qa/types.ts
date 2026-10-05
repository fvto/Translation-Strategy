export interface QAIssue {
  type: "number" | "percentage" | "date" | "currency" | "url" | "email" | "acronym" | "code";
  item: string;
  message: string;
  severity: "warning" | "error";
}

export interface QAReport {
  score: number; // 0 - 100
  passed: boolean;
  issues: QAIssue[];
  checks: {
    numbersPreserved: boolean;
    acronymsPreserved: boolean;
    urlsPreserved: boolean;
    emailsPreserved: boolean;
    datesPreserved: boolean;
  };
}
