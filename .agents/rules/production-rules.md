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

4. **Continuous Glossary Hygiene**:
   - Never allow identical `sourceTerm === targetTerm` in database or glossary sync.
   - Quarantining corrupted mappings takes precedence over fuzzy matching.

5. **Confidentiality & Image Extraction Prohibition Rule**:
   - Strictly forbidden from capturing, dumping, extracting, or saving image files from company documents (PPTX, PDF, etc.).
   - Process textual context, structure, and metadata only. Do not store or inspect visual image assets containing proprietary SOP details.

