import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { isVietnameseText, isPureEnglishText, isSemanticBilingualPair } from "../services/translation/vietnamese-detector.ts";
import { auditPptxGaps } from "../services/translation/smart-detector.ts";

test("Backend Detect EN - Disambiguates manufacturing homographs and date patterns", () => {
  // English date expressions with 'May'
  assert.equal(isVietnameseText("May 2026"), false, "'May 2026' must NOT be detected as Vietnamese");
  assert.equal(isVietnameseText("May 15, 2025"), false, "'May 15, 2025' must NOT be detected as Vietnamese");
  assert.equal(isPureEnglishText("May 2026"), true, "'May 2026' must be recognized as pure English");

  // Vietnamese code-switching with 'May' (sewing operations)
  assert.equal(isVietnameseText("May mudguard"), true, "'May mudguard' must be detected as Vietnamese operation");
  assert.equal(isVietnameseText("May 1 kim"), true, "'May 1 kim' must be detected as Vietnamese operation");
  assert.equal(isVietnameseText("May viền"), true, "'May viền' must be detected as Vietnamese operation");

  // English batch / manufacturing codes with 'Lot'
  assert.equal(isVietnameseText("Lot #123"), false, "'Lot #123' must NOT be detected as Vietnamese");
  assert.equal(isVietnameseText("Lot number: 45"), false, "'Lot number' must NOT be detected as Vietnamese");
  assert.equal(isPureEnglishText("Lot #123"), true, "'Lot #123' must be recognized as pure English");

  // English shift / schedule with 'Day'
  assert.equal(isVietnameseText("Day shift"), false, "'Day shift' must NOT be detected as Vietnamese");
  assert.equal(isPureEnglishText("Day shift"), true, "'Day shift' must be recognized as pure English");

  // English color with 'Tan'
  assert.equal(isVietnameseText("Tan color"), false, "'Tan color' must NOT be detected as Vietnamese");
  assert.equal(isPureEnglishText("Tan color"), true, "'Tan color' must be recognized as pure English");

  // English step with 'Last'
  assert.equal(isVietnameseText("Last inspection"), false, "'Last inspection' must NOT be detected as Vietnamese");
  assert.equal(isPureEnglishText("Last inspection"), true, "'Last inspection' must be recognized as pure English");

  // Standard footwear technical headings
  assert.equal(isPureEnglishText("*Buffing outsole"), true, "'*Buffing outsole' must be recognized as pure English");
  assert.equal(isPureEnglishText("*Vac tech eco fill process"), true, "'*Vac tech eco fill process' must be recognized as pure English");
});

test("Backend Detect EN - Semantic Bilingual Pair guarantees language polarity and semantics", () => {
  // Rejection: Both texts in Vietnamese
  const bothVi = isSemanticBilingualPair("May viền", "Dán đế");
  assert.equal(bothVi.isPair, false, "Two Vietnamese sentences must never pair");

  // Rejection: Both texts in English
  const bothEn = isSemanticBilingualPair("Stitch collar", "Buff outsole");
  assert.equal(bothEn.isPair, false, "Two English sentences must never pair");

  // Rejection: Step number conflict (Step 1 vs Step 2)
  const stepMismatch = isSemanticBilingualPair("1. May viền", "2. Stitch collar");
  assert.equal(stepMismatch.isPair, false, "Conflicting step numbers must never pair");

  // Rejection: Heading (*) vs body text
  const headingMismatch = isSemanticBilingualPair("*May viền", "Stitch collar");
  assert.equal(headingMismatch.isPair, false, "Heading must not pair with body text");

  // Rejection: Unrelated operations without shared terms
  const unrelated = isSemanticBilingualPair("Mài đế mặt ngoài", "Cold press upper");
  assert.equal(unrelated.isPair, false, "Unrelated operations must be rejected from pairing");

  // Acceptance: Valid matching step numbers and terms
  const matchingStep = isSemanticBilingualPair("1. May vòng cổ", "1. Stitch collar");
  assert.equal(matchingStep.isPair, true, "Matching step numbers with semantic terms must pair successfully");

  // Acceptance: Valid glossary match
  const glossary = [{ id: "g1", sourceTerm: "May viền", targetTerm: "Stitch binding", sourceLanguage: "vi", targetLanguage: "en" }];
  const matchingGlossary = isSemanticBilingualPair("May viền", "Stitch binding", glossary);
  assert.equal(matchingGlossary.isPair, true, "Valid glossary match must pair successfully");
});

test("Backend Smart Audit - Prevents blind index pairing on unnumbered mismatched operations", async () => {
  const zip = new JSZip();

  // Slide with two mismatched operations in box 1 and box 2
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:t>Mài da mặt trên</a:t></a:r></a:p>
        <a:p><a:r><a:t>Định hình mũi giày</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:t>Cold cementing bottom</a:t></a:r></a:p>
        <a:p><a:r><a:t>Heel lasting</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const auditReport = await auditPptxGaps(buffer, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    mode: "ipqc_bilingual",
  });

  // Verify that the Vietnamese operations were NOT falsely paired with the mismatched English operations
  const viUnits = auditReport.units.filter((u) => u.sourceText === "Mài da mặt trên" || u.sourceText === "Định hình mũi giày");
  assert.equal(viUnits.length, 2);

  for (const vu of viUnits) {
    assert.equal(vu.status, "NEEDS_TRANSLATION", `Mismatched operation "${vu.sourceText}" must NOT be ALREADY_TRANSLATED`);
  }
});
