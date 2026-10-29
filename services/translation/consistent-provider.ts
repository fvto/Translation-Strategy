import { checkInstructionQuality } from "./translation-quality";
import type { TranslationProvider, TranslationRequest, TranslationResponse, BatchTranslationRequest, BatchTranslationResponse } from "./types";
import { DocumentTerminologyPlan } from "../terminology/document-plan";

/** One session plan is shared by primary, retry and fallback providers. */
export function withDocumentTerminology(provider: TranslationProvider, plan: DocumentTerminologyPlan, options: { retryTerminology?: boolean } = {}): TranslationProvider {
  const enrich = (request: TranslationRequest, scope: string): TranslationRequest => ({ ...request,
    approvedTerminology: plan.glossaryFor(scope),
    context: `${plan.contextFor(scope)}\n${request.context || ""}`,
  });
  const single = async (request: TranslationRequest): Promise<TranslationResponse> => {
    const scope = plan.scopeFor(request.unitId, request.sourceText);
    const input = enrich(request, scope);
    let result = await provider.translate(input);
    let checked = plan.repair(input.sourceText, result.translatedText, scope, input.sourceLanguage, input.targetLanguage);
    const qualityIssues = input.sourceLanguage === "vi" && input.targetLanguage === "en" ? checkInstructionQuality(input.sourceText, checked.text) : [];
    if ((!checked.validation.isValid || qualityIssues.length) && options.retryTerminology !== false) {
      result = await provider.translate({ ...input, context: `${input.context}\nRepair the complete instruction using the required approved terms: ${checked.validation.mismatches.map((item) => `${item.sourceTerm} -> ${item.expectedTarget}`).join("; ")}. Repair these instruction defects: ${qualityIssues.map(issue => issue.message).join("; ")}. Preserve numbers, negation, locations and Check if with a complete subject and predicate. Do not append a term list.` });
      checked = plan.repair(input.sourceText, result.translatedText, scope, input.sourceLanguage, input.targetLanguage);
    }
    return { ...result, translatedText: checked.text };
  };
  const wrapped: TranslationProvider = { name: provider.name, translate: single };
  if (provider.translateBatch) wrapped.translateBatch = async (request: BatchTranslationRequest): Promise<BatchTranslationResponse> => {
    const started = Date.now();
    const groups = new Map<string, typeof request.items>();
    for (const item of request.items) {
      const scope = plan.scopeFor(item.id, item.sourceText);
      const group = groups.get(scope) || []; group.push(item); groups.set(scope, group);
    }
    const results = new Map<string, string>();
    let last: BatchTranslationResponse | undefined;
    for (const [scope, items] of groups) {
      const input = { ...request, items, approvedTerminology: plan.glossaryFor(scope), context: `${plan.contextFor(scope)}\n${request.context || ""}` };
      last = await provider.translateBatch!(input);
      const retry: typeof items = [];
      for (const item of items) {
        const target = last.results.get(item.id);
        if (!target?.trim()) continue; // Existing missing-ID recovery owns omitted results.
        const checked = plan.repair(item.sourceText, target, scope, input.sourceLanguage, input.targetLanguage);
        results.set(item.id, checked.text);
        if (!checked.validation.isValid || (input.sourceLanguage === "vi" && input.targetLanguage === "en" && checkInstructionQuality(item.sourceText, checked.text).length)) retry.push(item);
      }
      if (retry.length && options.retryTerminology !== false) {
        last = await provider.translateBatch!({ ...input, items: retry, context: `${input.context}\nThe previous output missed approved terminology or complete instruction conditions. Translate each complete source again with the mandatory terms. Inspection instructions and yes/no criteria must use Check if plus a subject and finite verb. Preserve all numbers, negation, signed tolerances and acceptance conditions. Do not append terms or summaries.` });
        for (const item of retry) {
          const target = last.results.get(item.id);
          if (target?.trim()) results.set(item.id, plan.repair(item.sourceText, target, scope, input.sourceLanguage, input.targetLanguage).text);
        }
      }
    }
    return { results, provider: last?.provider || provider.name, modelName: last?.modelName, aiStudioMetrics: last?.aiStudioMetrics, durationMs: Date.now() - started };
  };
  return wrapped;
}
