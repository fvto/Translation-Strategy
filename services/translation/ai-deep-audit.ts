import { SmartAuditReport, ScannedTextUnit } from "./smart-detector";
import { GeminiCircuitBreaker } from "./gemini/circuit-breaker";
import { GeminiRateLimiter } from "./gemini/rate-limiter";
import { GeminiQuotaManager } from "./gemini/quota-manager";

export interface AiDeepAuditOptions {
  apiKey?: string;
  model?: string;
  sourceLang?: string;
  targetLang?: string;
}

export interface AiDeepAuditResult {
  report: SmartAuditReport;
  pairedCount: number;
  immuneCount: number;
  verifiedCount: number;
  error?: string;
}

interface AiAuditVerdict {
  id: string;
  verdict: "PAIR" | "ALREADY_TRANSLATED" | "NON_TRANSLATABLE" | "NEEDS_TRANSLATION";
  pairedWithId?: string | null;
  translation?: string | null;
  reason?: string;
}

/**
 * AI Studio-Powered Deep Audit for PPTX Presentations
 * 
 * Uses Gemini semantic intelligence to inspect slides, eliminate hallucinated gaps,
 * and automatically pair interleaved/bilingual defect terms (e.g. 'Wrong material' <-> 'Sai liệu')
 * while protecting factory standards from wasteful re-translation.
 */
export async function runAiDeepAudit(
  report: SmartAuditReport,
  options: AiDeepAuditOptions = {}
): Promise<AiDeepAuditResult> {
  const key = options.apiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const model = options.model || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  // Identify candidate units that are marked as needing attention
  const candidateUnits = report.units.filter(
    (u) =>
      u.selectedForTranslation ||
      u.requiresTranslation ||
      u.status === "NEEDS_TRANSLATION" ||
      u.status === "REVIEW_REQUIRED" ||
      u.status === "POSSIBLE_TRANSLATION"
  );

  if (candidateUnits.length === 0) {
    return {
      report: { ...report, aiAudited: true, aiAuditedItemCount: 0 },
      pairedCount: 0,
      immuneCount: 0,
      verifiedCount: 0,
    };
  }

  // If no Gemini key is provided, return gracefully
  if (!key) {
    return {
      report,
      pairedCount: 0,
      immuneCount: 0,
      verifiedCount: 0,
      error: "Chưa cấu hình GEMINI_KEY / Google AI Studio API key.",
    };
  }

  // Group candidate units by slide, including all sibling units on the same slide for full context
  const unitsBySlide = new Map<number, ScannedTextUnit[]>();
  for (const u of report.units) {
    const s = u.location.slideIndex ?? 1;
    if (!unitsBySlide.has(s)) unitsBySlide.set(s, []);
    unitsBySlide.get(s)!.push(u);
  }

  // Only inspect slides that actually have candidate units
  const candidateSlideIndices = new Set(candidateUnits.map((u) => u.location.slideIndex ?? 1));
  const slidesToAudit: { slideIndex: number; units: ScannedTextUnit[] }[] = [];
  for (const sIdx of candidateSlideIndices) {
    slidesToAudit.push({
      slideIndex: sIdx,
      units: unitsBySlide.get(sIdx) || [],
    });
  }

  let pairedCount = 0;
  let immuneCount = 0;
  let verifiedCount = 0;
  const unitMap = new Map(report.units.map((u) => [u.id, u]));

  // Process in chunks of 5 slides to keep prompt concise and within token bounds
  const CHUNK_SIZE = 5;
  for (let c = 0; c < slidesToAudit.length; c += CHUNK_SIZE) {
    const chunk = slidesToAudit.slice(c, c + CHUNK_SIZE);

    const payload = chunk.map((s) => ({
      slide: s.slideIndex,
      items: s.units.map((u) => ({
        id: u.id,
        text: u.sourceText,
        currentStatus: u.status,
        isCandidate: candidateUnits.some((cu) => cu.id === u.id),
      })),
    }));

    const systemPrompt = `You are a Senior Bilingual QA Auditor for footwear manufacturing SOP presentations (Ching Luh standard).
Your task is to review slide text items that are candidates for translation and determine their true status based on full slide context:

1. 'PAIR': The item is Vietnamese, but it ALREADY has an English translation present on this slide (for instance, defect titles like 'Wrong material' and 'Sai liệu', or step titles 'Inconsistent pair matching label' and 'Tem số phối đôi không đồng bộ.').
   -> Set verdict: 'PAIR', pairedWithId: '<id of English item>', translation: '<English text>', reason: '<Brief explanation in Vietnamese>'.

2. 'ALREADY_TRANSLATED': The item is already English, an in-line bilingual string containing both English and Vietnamese (e.g. 'Color matching-Phối màu liệu', 'Toe shape - Hình dạng mũi'), an inspection evaluation label (GOOD, NO GOOD, OK, NG, PASS, FAIL), a shoe model name, or technical standard that must NOT be translated.
   -> Set verdict: 'ALREADY_TRANSLATED', reason: '<Brief explanation in Vietnamese>'.

3. 'NON_TRANSLATABLE': The item is a numeric dimension, date, ISO code, or non-word symbol.
   -> Set verdict: 'NON_TRANSLATABLE', reason: '<Brief explanation in Vietnamese>'.

4. 'NEEDS_TRANSLATION': The item is genuine Vietnamese text that has NO English counterpart on this slide.
   -> Set verdict: 'NEEDS_TRANSLATION'.

OUTPUT FORMAT:
Respond ONLY with a valid JSON array of verdicts for candidate items:
[
  {
    "id": "item_id",
    "verdict": "PAIR" | "ALREADY_TRANSLATED" | "NON_TRANSLATABLE" | "NEEDS_TRANSLATION",
    "pairedWithId": "partner_id_or_null",
    "translation": "English_text_or_null",
    "reason": "Giải thích ngắn gọn bằng tiếng Việt"
  }
]`;

    try {
      await GeminiRateLimiter.throttle(model);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!res.ok) {
        console.warn(`[AiDeepAudit] Gemini returned HTTP ${res.status}`);
        continue;
      }

      const resData = await res.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!rawText) continue;

      let verdicts: AiAuditVerdict[] = [];
      try {
        verdicts = JSON.parse(rawText);
      } catch (pe) {
        const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) verdicts = JSON.parse(jsonMatch[0]);
      }

      if (Array.isArray(verdicts)) {
        for (const v of verdicts) {
          const unit = unitMap.get(v.id);
          if (!unit) continue;

          if (v.verdict === "PAIR") {
            unit.status = "ALREADY_TRANSLATED";
            unit.requiresTranslation = false;
            unit.selectedForTranslation = false;
            unit.existingTranslation = v.translation || (v.pairedWithId ? unitMap.get(v.pairedWithId)?.sourceText : undefined);
            unit.reason = v.reason || "AI Studio xác nhận: đã có bản dịch tiếng Anh tương ứng trên slide.";
            delete unit.suggestedTranslation;
            pairedCount++;
            verifiedCount++;
          } else if (v.verdict === "ALREADY_TRANSLATED") {
            unit.status = "ALREADY_TRANSLATED";
            unit.requiresTranslation = false;
            unit.selectedForTranslation = false;
            unit.reason = v.reason || "AI Studio xác nhận: nội dung đã là tiếng Anh / chuẩn quốc tế.";
            delete unit.suggestedTranslation;
            immuneCount++;
            verifiedCount++;
          } else if (v.verdict === "NON_TRANSLATABLE") {
            unit.status = "NON_TRANSLATABLE";
            unit.requiresTranslation = false;
            unit.selectedForTranslation = false;
            unit.reason = v.reason || "AI Studio xác nhận: ký hiệu / mã kỹ thuật bất biến.";
            delete unit.suggestedTranslation;
            immuneCount++;
            verifiedCount++;
          }
        }
      }
    } catch (err: any) {
      console.error("[AiDeepAudit] Error calling AI Studio:", err);
    }
  }

  // Update summary statistics in the report
  const updatedReport: SmartAuditReport = {
    ...report,
    alreadyTranslatedCount: report.units.filter((u) => u.status === "ALREADY_TRANSLATED").length,
    needsTranslationCount: report.units.filter((u) => u.status === "NEEDS_TRANSLATION").length,
    nonTranslatableCount: report.units.filter((u) => u.status === "NON_TRANSLATABLE").length,
    translatableMissingCount: report.units.filter((u) => u.selectedForTranslation).length,
    aiAudited: true,
    aiAuditedItemCount: verifiedCount,
  };

  return {
    report: updatedReport,
    pairedCount,
    immuneCount,
    verifiedCount,
  };
}
