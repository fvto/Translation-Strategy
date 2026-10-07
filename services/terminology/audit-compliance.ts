import type { TerminologyEntry } from "../database/types";
import { enforceTerminologyCompliance } from "./enforcer";
import { validateTranslationTerminology } from "./validator";

/** Check reused text against the current glossary, rather than trusting its history origin. */
export function checkGlossaryTranslation(source: string, target: string, glossary: TerminologyEntry[], sourceLang: string, targetLang: string) {
  const initial = validateTranslationTerminology(source, target, glossary);
  // Avoid changing unrelated memory text through SOP polishing.
  const enforced = initial.totalApprovedTerms
    ? enforceTerminologyCompliance(source, target, glossary, sourceLang, targetLang)
    : { text: target, replacements: [] };
  const validation = validateTranslationTerminology(source, enforced.text, glossary);
  return { ...validation, text: enforced.text, corrections: enforced.replacements };
}
