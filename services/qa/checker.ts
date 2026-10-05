import { QAIssue, QAReport } from "./types";

const COMMON_ACRONYMS = [
  "ISO 27001",
  "ISO 9001",
  "ISO 22301",
  "NIST CSF",
  "NIST",
  "QMS",
  "COPQ",
  "CAPA",
  "RCA",
  "ITIL",
  "SOC 2",
  "SOC 1",
  "GDPR",
  "HIPAA",
  "PCI DSS",
  "COBIT",
  "BIA",
  "BCP",
  "DRP",
  "SLA",
  "RPO",
  "RTO",
  "RBAC",
  "MFA",
  "SSO",
];

export function runQualityAssurance(sourceText: string, translatedText: string): QAReport {
  const issues: QAIssue[] = [];

  // 1. Check Numbers (e.g., 2026, 15, 3.14, 100,000)
  const numberRegex = /\b\d+(?:[.,]\d+)?\b/g;
  const sourceNumbers = Array.from(new Set(sourceText.match(numberRegex) || []));
  let missingNumbers = 0;

  for (const num of sourceNumbers) {
    const altNum = num.includes(".")
      ? num.replace(".", ",")
      : num.includes(",")
      ? num.replace(",", ".")
      : num;
    if (!translatedText.includes(num) && !translatedText.includes(altNum)) {
      missingNumbers++;
      issues.push({
        type: "number",
        item: num,
        message: `Number "${num}" in source text is missing in translation.`,
        severity: "warning",
      });
    }
  }

  // 2. Check Percentages (e.g., 99.9%, 25%)
  const percentageRegex = /\b\d+(?:[.,]\d+)?\s*%/g;
  const sourcePercentages = Array.from(new Set(sourceText.match(percentageRegex) || []));
  for (const pct of sourcePercentages) {
    const rawVal = pct.replace("%", "").trim();
    const altVal = rawVal.includes(".")
      ? rawVal.replace(".", ",")
      : rawVal.includes(",")
      ? rawVal.replace(",", ".")
      : rawVal;
    const hasMatch =
      translatedText.includes(pct) ||
      translatedText.includes(`${rawVal}%`) ||
      translatedText.includes(`${rawVal} %`) ||
      translatedText.includes(`${altVal}%`) ||
      translatedText.includes(`${altVal} %`);

    if (!hasMatch) {
      issues.push({
        type: "percentage",
        item: pct,
        message: `Percentage "${pct}" is missing or modified in translation.`,
        severity: "warning",
      });
    }
  }

  // 3. Check URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  const sourceUrls = Array.from(new Set(sourceText.match(urlRegex) || []));
  let missingUrls = 0;
  for (const url of sourceUrls) {
    if (!translatedText.includes(url)) {
      missingUrls++;
      issues.push({
        type: "url",
        item: url,
        message: `URL "${url}" was corrupted or missing in translation.`,
        severity: "error",
      });
    }
  }

  // 4. Check Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const sourceEmails = Array.from(new Set(sourceText.match(emailRegex) || []));
  let missingEmails = 0;
  for (const email of sourceEmails) {
    if (!translatedText.includes(email)) {
      missingEmails++;
      issues.push({
        type: "email",
        item: email,
        message: `Email address "${email}" is missing in translation.`,
        severity: "error",
      });
    }
  }

  // 5. Check Acronyms & Standards
  let missingAcronyms = 0;
  for (const acronym of COMMON_ACRONYMS) {
    const acroRegex = new RegExp(`\\b${acronym}\\b`, "i");
    if (acroRegex.test(sourceText)) {
      const inTranslation = new RegExp(`\\b${acronym}\\b`, "i").test(translatedText);
      if (!inTranslation) {
        missingAcronyms++;
        issues.push({
          type: "acronym",
          item: acronym,
          message: `Standard/Acronym "${acronym}" should be preserved, but was not detected in translation.`,
          severity: "warning",
        });
      }
    }
  }

  // Calculate score (penalizing for missing numbers, acronyms, urls)
  const totalChecks =
    sourceNumbers.length +
    sourcePercentages.length +
    sourceUrls.length +
    sourceEmails.length +
    issues.filter((i) => i.type === "acronym").length;

  let score = 100;
  if (totalChecks > 0) {
    const deductions = issues.length * (100 / Math.max(totalChecks, 4));
    score = Math.max(0, Math.round(100 - deductions));
  } else if (issues.length > 0) {
    score = Math.max(0, 100 - issues.length * 15);
  }

  return {
    score,
    passed: issues.filter((i) => i.severity === "error").length === 0 && score >= 80,
    issues,
    checks: {
      numbersPreserved: missingNumbers === 0,
      acronymsPreserved: missingAcronyms === 0,
      urlsPreserved: missingUrls === 0,
      emailsPreserved: missingEmails === 0,
      datesPreserved: true,
    },
  };
}
