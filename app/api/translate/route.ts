import { NextRequest, NextResponse } from "next/server";
import { getTranslationProvider, AntigravityCliTranslationProvider } from "@/services/translation";
import { matchTerminology } from "@/services/terminology/matcher";
import { validateTranslationTerminology } from "@/services/terminology/validator";
import { enforceTerminologyCompliance } from "@/services/terminology/enforcer";
import { runQualityAssurance } from "@/services/qa/checker";
import { db } from "@/services/database/db";
import { verifySessionToken } from "@/services/security/auth";
import { normalizeSourcePunctuation } from "@/services/translation/casing";

import { isVietnameseText, isPureEnglishText } from "@/services/translation/vietnamese-detector";
import { TerminologyEntry } from "@/services/database/types";

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
    const effSourceText = normalizeSourcePunctuation(sourceText);

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

    // 1. Fetch terminology from database for this language pair (including both approved and review, approved takes priority)
    const rawGlossary = db.getGlossaryReviewTerminology(effSource, effTarget);
    const approvedGlossaryMap = new Map<string, TerminologyEntry>();
    for (const t of rawGlossary) {
      const key = t.sourceTerm.toLowerCase().trim();
      const existing = approvedGlossaryMap.get(key);
      if (!existing || (existing.status === "review" && t.status === "approved")) {
        approvedGlossaryMap.set(key, t);
      }
    }
    const approvedGlossary = Array.from(approvedGlossaryMap.values());

    // 2. Identify all matched approved terms in source text
    const matchedTerms = matchTerminology(effSourceText, approvedGlossary);

    // 3. Dispatch to requested translation provider with graceful fallback
    const provider = getTranslationProvider(requestedProvider);
    let translationResult;
    try {
      translationResult = await provider.translate({
        sourceText: effSourceText,
        sourceLanguage: effSource,
        targetLanguage: effTarget,
        approvedTerminology: approvedGlossary,
      });
    } catch (providerErr: any) {
      console.warn(`[TranslateRoute] Provider "${provider.name}" failed: ${providerErr.message}. Falling back to AirGapped provider.`);
      const { AirGappedTranslationProvider } = await import("@/services/translation/offline");
      const fallback = new AirGappedTranslationProvider();
      translationResult = await fallback.translate({
        sourceText: effSourceText,
        sourceLanguage: effSource,
        targetLanguage: effTarget,
        approvedTerminology: approvedGlossary,
      });
      translationResult.provider = `${translationResult.provider} (Dự phòng từ ${provider.name})`;
    }

    // 4. Enforce strict terminology compliance on translated text (eliminating synonyms & deviations)
    const enforcementResult = enforceTerminologyCompliance(
      effSourceText,
      translationResult.translatedText,
      approvedGlossary,
      effSource,
      effTarget
    );
    translationResult.translatedText = enforcementResult.text;

    // 5. Run post-translation Terminology Validation (Section 18)
    const validationReport = validateTranslationTerminology(
      effSourceText,
      translationResult.translatedText,
      approvedGlossary
    );

    // 6. Run Quality Assurance checks (Section 19)
    const qaReport = runQualityAssurance(effSourceText, translationResult.translatedText);

    // 6. Zero-Leak Audit Logging (Section 25)
    // NEVER LOG: source_text, translated_text, document_content, confidential glossary
    db.addAuditLog({
      userId,
      userEmail,
      operation: "TRANSLATION_COMPLETED",
      status: "SUCCESS",
      durationMs: Date.now() - startTime,
      details: {
        provider: translationResult.provider,
        sourceLanguage,
        targetLanguage,
        sourceCharCount: effSourceText.length,
        matchedTermsCount: matchedTerms.length,
        complianceScore: validationReport.complianceScore,
        qaScore: qaReport.score,
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
      matchedTerms,
      validation: validationReport,
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
