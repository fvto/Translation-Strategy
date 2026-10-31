import { DocumentTerminologyPlan } from "@/services/terminology/document-plan";
import { detectTerminologyStage } from "@/services/translation/document-stage";
import { withDocumentTerminology } from "@/services/translation/consistent-provider";
import { NextRequest, NextResponse } from "next/server";
import { getTranslationProvider } from "@/services/translation";
import { matchTerminology } from "@/services/terminology/matcher";
import { validateTranslationTerminology } from "@/services/terminology/validator";
import { enforceTerminologyCompliance } from "@/services/terminology/enforcer";
import { runQualityAssurance } from "@/services/qa/checker";
import { db } from "@/services/database/db";
import { verifySessionToken } from "@/services/security/auth";
import { normalizeSourcePunctuation } from "@/services/translation/casing";

import { isVietnameseText, isPureEnglishText } from "@/services/translation/vietnamese-detector";
import { INTERNAL_SOP_EXAMPLES, findInternalSopExample } from "@/services/translation/internal-sop";
import { polishSopText } from "@/services/translation/sop-polisher";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const token =
      req.cookies.get("secure_session")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    const session = token ? verifySessionToken(token) : null;

    const userEmail = session?.email || "anonymous@secure.local";
    const userId = session?.id || "anonymous";

    const body = await req.json();
    const {
      sourceText,
      sourceLanguage = "en",
      targetLanguage = "vi",
      provider: requestedProvider,
    } = body;

    if (!sourceText || typeof sourceText !== "string" || !sourceText.trim()) {
      return NextResponse.json({ error: "Source text is required" }, { status: 400 });
    }

    // Normalize source punctuation (e.g. ".Do" -> ". Do", "thẳng,đường" -> "thẳng, đường")
    // while strictly safeguarding technical decimals/measurements (1.8m, 1.8mm, etc.)
    const effSourceText = normalizeSourcePunctuation(sourceText.normalize("NFC"));

    let effSource = sourceLanguage;
    let effTarget = targetLanguage;

    const isVi = isVietnameseText(effSourceText);
    const isPureEn = isPureEnglishText(effSourceText);
    if (isVi && sourceLanguage === "en") {
      effSource = "vi";
      effTarget = "en";
    } else if (isPureEn && sourceLanguage === "vi") {
      effSource = "en";
      effTarget = "vi";
    }

    // Only approved terminology may constrain a translation; review entries are suggestions.
    const rawGlossary = db.getApprovedTerminology(effSource, effTarget);
    const scope = detectTerminologyStage(effSourceText);
    const terminologyPlan = new DocumentTerminologyPlan(rawGlossary, [{ id: "text", sourceText: effSourceText, scope, context: scope }]);
    const approvedGlossary = terminologyPlan.glossaryFor(scope);

    // 2. Identify all matched approved terms in source text
    const matchedTerms = matchTerminology(effSourceText, approvedGlossary);
    const internalExamples = [...db.getInternalSopExamples(effSource, effTarget), ...INTERNAL_SOP_EXAMPLES.filter((e) => e.sourceLanguage === effSource && e.targetLanguage === effTarget)];
    const internalText = findInternalSopExample(effSourceText, internalExamples);

    // 3. Dispatch to requested translation provider with graceful fallback
    const provider = withDocumentTerminology(getTranslationProvider(requestedProvider), terminologyPlan);
    let translationResult;
    if (internalText) {
      translationResult = { translatedText: internalText, provider: "Mẫu nội bộ đã duyệt", durationMs: 0 };
    } else {
    try {
      translationResult = await provider.translate({
        unitId: "text", sourceText: effSourceText,
        sourceLanguage: effSource,
        targetLanguage: effTarget,
        approvedTerminology: approvedGlossary,
        internalExamples,
      });
    } catch (providerErr: any) {
      console.warn(`[TranslateRoute] Provider "${provider.name}" failed: ${providerErr.message}. Falling back to AirGapped provider.`);
      const { AirGappedTranslationProvider } = await import("@/services/translation/offline");
      const fallback = withDocumentTerminology(new AirGappedTranslationProvider(), terminologyPlan);
      translationResult = await fallback.translate({
        unitId: "text", sourceText: effSourceText,
        sourceLanguage: effSource,
        targetLanguage: effTarget,
        approvedTerminology: approvedGlossary,
      });
      translationResult.provider = `${translationResult.provider} (Dự phòng từ ${provider.name})`;
    }
    }

    // 4. Enforce strict terminology compliance on translated text (eliminating synonyms & deviations)
    const enforcementResult = enforceTerminologyCompliance(
      effSourceText,
      translationResult.translatedText,
      approvedGlossary,
      effSource,
      effTarget
    );
    if (!internalText) translationResult.translatedText = enforcementResult.text;
    translationResult.translatedText = polishSopText(translationResult.translatedText);

    // 5. Run post-translation Terminology Validation (Section 18)
    const validationReport = validateTranslationTerminology(
      effSourceText,
      translationResult.translatedText,
      approvedGlossary
    );

    const terminologyConsistency = terminologyPlan.audit([{ id: "text", sourceText: effSourceText, targetText: translationResult.translatedText, scope, protected: Boolean(internalText) }]);

    // 6. Run Quality Assurance checks (Section 19)
    const qaReport = runQualityAssurance(effSourceText, translationResult.translatedText);

    // 6. Zero-Leak Audit Logging (Section 25)
    // NEVER LOG: source_text, translated_text, document_content, confidential glossary
    db.addAuditLog({
      userId,
      userEmail,
      operation: "TRANSLATION_COMPLETED",
      status: terminologyConsistency.passed ? "SUCCESS" : "WARNING",
      durationMs: Date.now() - startTime,
      details: {
        provider: translationResult.provider,
        sourceLanguage,
        targetLanguage,
        sourceCharCount: effSourceText.length,
        matchedTermsCount: matchedTerms.length,
        complianceScore: validationReport.complianceScore,
        qaScore: qaReport.score,
        terminologyVersion: terminologyConsistency.version,
        terminologyConflictCount: terminologyConsistency.groups.length,
      },
    });

    return NextResponse.json({
      success: true,
      translatedText: translationResult.translatedText,
      normalizedSourceText: effSourceText,
      provider: translationResult.provider,
      modelName: translationResult.modelName,
      durationMs: translationResult.durationMs,
      aiStudioMetrics: translationResult.aiStudioMetrics,
      approvedInternalExample: Boolean(internalText),
      matchedTerms,
      validation: validationReport,
      terminologyConsistency,
      qaReport,
    });
  } catch (e: any) {
    db.addAuditLog({
      userId: "unknown",
      userEmail: "unknown",
      operation: "TRANSLATION_FAILED",
      status: "FAILURE",
      durationMs: Date.now() - startTime,
      errorCode: e.message,
    });

    return NextResponse.json(
      { error: e.message || "Translation execution failed" },
      { status: 500 }
    );
  }
}
