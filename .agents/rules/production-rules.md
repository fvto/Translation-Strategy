---
description: Production translation and document consistency rules for Footwear QA / SOP translations
trigger: always_on
---

# Production Rules: Footwear SOP & PPTX Translation

1. **Zero Vietnamese Leakage Rule**:
   - In English translated files (`replace_en` mode or English sections), no Vietnamese text or diacritics may leak into the output slides.
   - Any untranslated item must be flagged by the Post-Flight QA Gate before delivery.

2. **Formatting & Visual Parity Rule**:
   - Technical process headings (prefixed with `*`, e.g. `*Hot/cool shaping:`, `*Buffing:`, `*Cementing:`) must strictly preserve bold formatting (`b="1"`).
   - Never sample formatting only from the first character/symbol of a paragraph; inspect dominant substantive text runs.
   - Font size (`sz`), color (`srgbClr`), and font family must strictly match the original slide.

3. **Strict Terminology & Grammatical Adjunct Ordering**:
   - Inspection criteria (CTQ) must use English noun phrase adjunct order: `[Component] shape` (e.g., `Tip shape`, `Toe shape`, `Collar shape`, `Heel shape`), NEVER imperative verb phrases like `Shape tip`.
   - Stitch density must strictly follow `SPI <number> stitches/inch` (e.g. `SPI 9-10 stitches/inch`, `SPI 10-12 stitches/inch`, `SPI 7-8 stitches/inch`). Never write just `<number> SPI` or bare `SPI <number>`.
   - **No-sew Terminology**: In footwear manufacturing SOPs, always write `No-sew` or `no-sew` with a hyphen. NEVER use `Nosew` or `nosew`.
   - **Tip-quarter Terminology**: Always write `Tip-quarter` or `tip-quarter` with a hyphen. NEVER concatenate into `Tipquarter` or leave unhyphenated `Tip quarter`.

4. **Continuous Glossary Hygiene**:
   - Never allow identical `sourceTerm === targetTerm` in database or glossary sync.
   - Quarantining corrupted mappings takes precedence over fuzzy matching.

5. **Confidentiality & Image Extraction Prohibition Rule**:
   - Strictly forbidden from capturing, dumping, extracting, or saving image files from company documents (PPTX, PDF, etc.).
   - Process textual context, structure, and metadata only. Do not store or inspect visual image assets containing proprietary SOP details.

6. **Worker-facing Inspection Wording — User Directive**:
   - Inspection instructions ("Kiểm tra ...") must use **"Check if" + subject + finite verb + the complete source condition** in English, in both text translation and Smart Audit.
   - **Lean Shop-Floor Conciseness Principle (Càng ngắn gọn càng tốt để vừa bảng slide)**:
     * Slide and table cell space is strictly constrained: keep English shop-floor instructions as short, direct, and telegraphic as possible without wordy fluff.
     * Strip redundant articles (`the`, `a`), verbose connectors (`and the`, `it is necessary to`), and long explanatory relative clauses while strictly preserving numbers, units, defects, and the complete condition.
     * Prefer: `Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg` over verbose prose.
     * Prefer: `Check if upper is edge-even with hot mold, projector light centered on heel` over wordy relative clauses.
     * Prefer: `Check if upper matches mold, mold mark matches machine to avoid mark on logo`.
     * Prefer: `Check if logo has no marks, scratches, or under-paint cracks after BPM`.
   - **Grammar & Context Co-Adjustment Directive**: Using "Check if" strictly requires co-adjusting the subsequent clause for correct English grammar and footwear shop-floor context:
     * The clause following "Check if" MUST have a complete subject and finite verb (`is/are`, `matches`, `aligns with`, `is flush with / is edge-even with`, `has no / is free of`).
     * Never mechanically prepend "Check if" to a bare noun phrase (e.g. NEVER `Check if real temp 80-90°C` -> use `Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg`).
     * Never use a bare gerund without predicate (e.g. NEVER `Check if putting upper... must edge-even` -> use `Check if upper is edge-even with hot mold...`).
     * Never leave broken pidgin verbs (e.g. replace `is not scratch` with `has no scratches/marks`; replace `BOM sight with be at center` with `projector light centered on heel`; replace `upper match` with `upper matches`).
   - **Zero "Check with" Directive**: "Kiểm tra" ALWAYS pairs with **"Check if"**, NEVER **"Check with"**. NEVER translate "Kiểm tra ..." as "Check with ..." and strictly forbid "Check with" in all shop-floor inspection instructions.
   - Shortening must preserve **if**, negation, measurements and acceptance conditions. Do not replace the instruction with "Check" plus a noun phrase, "Check with", "Verify", "Ensure" or "Inspect".
   - Do not mechanically prepend "Check if" to a bare noun phrase. Produce a complete grammatical condition without inventing a requirement.
   - Physical operation commands and descriptive facts retain their original function.

7. **Consistent Thread Defect Naming — User Clarification**:
   - The reported `breaking / breakage` inconsistency refers to **đứt chỉ**. Use the approved **Broken thread** label consistently in defect labels/lists.
   - Keep grammatical predicates such as **threads are broken** in `Check if` sentences. Never globally replace `breaking` when it concerns another component or an action.
   - **Fraying** describes a separate defect; do not merge it into thread breakage.

