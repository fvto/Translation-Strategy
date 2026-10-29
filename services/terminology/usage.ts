import type { TerminologyEntry } from "../database/types";

/** Approved internal noun/action forms; arbitrary synonyms are still disallowed. */
export function approvedTargetForms(entry: TerminologyEntry): string[] {
  if (entry.targetLanguage === "en" && /đứt\s+chỉ/iu.test(entry.sourceTerm) && /^broken threads?$/i.test(entry.targetTerm.trim())) {
    return [entry.targetTerm, "threads are broken", "thread is broken", "threads are not broken", "thread is not broken"];
  }
  if (entry.targetLanguage === "en" && /^kiểm tra\s*:?$/iu.test(entry.sourceTerm.trim()) && /^check$/i.test(entry.targetTerm.trim())) {
    return ["Check if"];
  }
  if (entry.targetLanguage === "en" && /^dán đế\s*:?$/iu.test(entry.sourceTerm.trim()) && /^bottom attaching$/i.test(entry.targetTerm.trim())) {
    return [entry.targetTerm, "outsole attaching", "attach the outsole", "attaching the outsole", "attach outsole", "attaching outsole"];
  }
  if (entry.targetLanguage === "en" && /^lộ$/iu.test(entry.sourceTerm.trim()) && /^expose$/i.test(entry.targetTerm.trim())) {
    return [entry.targetTerm, "exposed", "exposure"];
  }
  if (entry.targetLanguage === "en" && /^vệ sinh\s*:?$/iu.test(entry.sourceTerm.trim()) && /^clean(?:ness|liness)$/i.test(entry.targetTerm.trim())) {
    return [entry.targetTerm, "clean", "cleaning"];
  }
  if (entry.targetLanguage === "en" && /^quét keo\s*:?$/iu.test(entry.sourceTerm.trim()) && /^cementing$/i.test(entry.targetTerm.trim())) {
    return [entry.targetTerm, "apply cement"];
  }
  return [entry.targetTerm];
}
