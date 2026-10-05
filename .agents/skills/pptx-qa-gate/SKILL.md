---
name: pptx-qa-gate
description: Proactive verification gate that audits and self-repairs OpenXML PowerPoint presentations before delivery to eliminate Vietnamese leaks, lost bold formatting, and invalid SPI.
---

# PPTX Post-Flight Verification Gate Agent

## Purpose
Solves **Inefficiency #1 (Late Defect Discovery & Formatting Drift)** by automatically intercepting the generated PPTX binary before the user downloads it.

## Execution Workflow
1. **Unpack & Scan**: Loads generated PPTX via JSZip and iterates through every `ppt/slides/slide*.xml`.
2. **Grammar & Inversion Audit**:
   - Detects inverted noun phrases: `Shape tip` -> `Tip shape`, `Shape collar` -> `Collar shape`.
   - Auto-repairs XML text runs in place.
3. **Bold Preservation Audit**:
   - Checks all headings with prefix `*` (e.g. `*Hot/cool shaping:`).
   - If missing `b="1"`, auto-injects `b="1"` into the `<a:rPr>` element.
4. **SPI Standardization Check**:
   - Detects untranslated `mũi/inch`, bare `<number> SPI`, or bare `SPI <number>`.
   - Normalizes to canonical `SPI <number> stitches/inch` (e.g. `SPI 9-10 stitches/inch`, `SPI 10-12 stitches/inch`).
5. **Vietnamese Leak Detection**:
   - In `replace_en` mode, verifies that no pure Vietnamese diacritics remain.
6. **Repackage & Seal**: Re-generates clean, verified `.pptx` buffer with zero defects.

## Integration Point
- Function: `auditAndRepairPptxPostFlight(buffer, mode)` in `services/qa/pptx-postflight-gate.ts`.
- Invoked automatically in `PptxTranslatorService.translatePptx()` right before returning final presentation.
