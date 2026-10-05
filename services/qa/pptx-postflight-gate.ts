import JSZip from "jszip";
import { hasViDiacritics } from "../terminology/sanitizer";
import { normalizeSpiTerminology, normalizeInvertedNounPhrases } from "../translation/casing";
import { polishSopText } from "../translation/sop-polisher";

/** Escapes XML special characters for safe injection into <a:t> nodes. */
function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface PostFlightIssue {
  slide: string;
  type: "vi_leak" | "lost_bold" | "invalid_spi" | "inverted_phrase" | "typo_repair" | "rogue_heading";
  message: string;
  originalText?: string;
  targetText?: string;
  autoRepaired: boolean;
}

export interface PostFlightAuditReport {
  passed: boolean;
  totalSlidesAudited: number;
  issues: PostFlightIssue[];
  repairedCount: number;
  auditedBuffer: Buffer;
}

/**
 * Proactive PPTX Post-Flight Verification Gate Agent
 * 
 * Automatically audits and self-repairs OpenXML slides before the final presentation
 * is packaged and returned to the user:
 * 1. Detects and auto-repairs lost bold tags on key headings and instructions.
 * 2. Detects Vietnamese leakage in English target blocks.
 * 3. Enforces strict SPI (stitches per inch) formatting.
 * 4. Corrects common inverted noun phrases (e.g. 'Shape tip' -> 'Tip shape').
 * 5. Auto-repairs domain typos (e.g. 'aplly' -> 'apply', 'apply cement foam' -> 'attach cement foam').
 * 6. Eliminates rogue or duplicate headings injected between numbered steps (e.g. spurious *Lacing between step 2 and step 3).
 */
export async function auditAndRepairPptxPostFlight(
  pptxBuffer: Buffer,
  mode: "replace_en" | "ipqc_bilingual" = "replace_en"
): Promise<PostFlightAuditReport> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const issues: PostFlightIssue[] = [];
  let repairedCount = 0;
  let totalSlidesAudited = 0;

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!filename.startsWith("ppt/slides/slide") || !filename.endsWith(".xml")) continue;
    totalSlidesAudited++;

    let xml = await file.async("string");
    let xmlModified = false;

    // 1. Audit and Auto-Repair Inverted Noun Phrases (e.g. "Shape tip" -> "Tip shape")
    const invertedRules = [
      { regex: /\b(\d+[.)]\s*)?Shape\s+tip\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Tip shape` },
      { regex: /\b(\d+[.)]\s*)?Shape\s+toe\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Toe shape` },
      { regex: /\b(\d+[.)]\s*)?Shape\s+collar\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Collar shape` },
      { regex: /\b(\d+[.)]\s*)?Shape\s+heel\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Heel shape` },
      { regex: /\b(\d+[.)]\s*)?Shape\s+vamp\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Vamp shape` },
      { regex: /\b(\d+[.)]\s*)?Shape\s+tongue\b/gi, fix: (_m: string, p1?: string) => `${p1 || ""}Tongue shape` },
    ];

    for (const rule of invertedRules) {
      if (rule.regex.test(xml)) {
        xml = xml.replace(rule.regex, (match, p1) => {
          xmlModified = true;
          repairedCount++;
          const replacement = rule.fix(match, p1);
          issues.push({
            slide: filename,
            type: "inverted_phrase",
            message: `Auto-corrected inverted noun phrase '${match}' to standard form '${replacement}'`,
            targetText: replacement,
            autoRepaired: true,
          });
          return replacement;
        });
      }
    }

    // 2. Audit and Auto-Repair Stitch Density & Domain Phrasing/Typos in <a:t>
    xml = xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (tMatch, tContent) => {
      let updated = tContent;

      // Normalize SPI
      const normalizedSpi = normalizeSpiTerminology(updated);
      if (normalizedSpi !== updated) {
        xmlModified = true;
        repairedCount++;
        issues.push({
          slide: filename,
          type: "invalid_spi",
          message: `Auto-corrected stitch density in '${tContent.trim()}' to standard '${normalizedSpi.trim()}'`,
          targetText: normalizedSpi,
          autoRepaired: true,
        });
        updated = normalizedSpi;
      }

      // Normalize Inverted CTQ phrases inside run
      const normalizedInv = normalizeInvertedNounPhrases(updated);
      if (normalizedInv !== updated) {
        xmlModified = true;
        repairedCount++;
        issues.push({
          slide: filename,
          type: "inverted_phrase",
          message: `Auto-corrected inverted noun phrase in '${tContent.trim()}' to standard '${normalizedInv.trim()}'`,
          targetText: normalizedInv,
          autoRepaired: true,
        });
        updated = normalizedInv;
      }

      // Auto-Repair Footwear Spray Cement & Foam phrasing
      if (/\*?Spray\s+cement\s+and\s+(?:aplly|apply)\s+(?:cement\s+)?foam/i.test(updated)) {
        const fixed = updated.replace(
          /\*?Spray\s+cement\s+and\s+(?:aplly|apply)\s+(?:cement\s+)?foam/gi,
          "*Spray cement and attach cement foam"
        );
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected spray cement heading to standard '*Spray cement and attach cement foam'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = escapeXmlText(fixed);
        }
      }

      // Auto-Repair attach cement foam
      if (/\b(?:apply|aplly)\s+cement\s+foam\b/i.test(updated)) {
        const fixed = updated.replace(/\b(?:apply|aplly)\s+cement\s+foam\b/gi, "attach cement foam");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected foam phrasing to 'attach cement foam'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = escapeXmlText(fixed);
        }
      }

      // Auto-Repair any remaining typo 'aplly'
      if (/\baplly\b/i.test(updated)) {
        const fixed = updated.replace(/\baplly\b/gi, "apply");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected spelling error 'aplly' to 'apply'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair logo/swoosh color matching phrasing
      if (/(?:swoosh|logo)\s+is\s+printed\s+together\s+without\s+matching/i.test(updated)) {
        const fixed = updated.replace(
          /(?:the\s+)?(?:swoosh|logo)\s+is\s+printed\s+together\s+without\s+matching/gi,
          "logos can be used together without color matching"
        );
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected 'printed together without matching' to 'logos can be used together without color matching'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair clumsy nosew bond gap check phrasing
      if (/\bCheck\s+if\s+nosew\s+bond\s+gap\/delaminate\s+on\s+upper\b/i.test(updated)) {
        const fixed = updated.replace(
          /\bCheck\s+if\s+nosew\s+bond\s+gap\/delaminate\s+on\s+upper\b/gi,
          "Check upper for no nosew bond gap/delamination"
        );
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected 'Check if nosew bond gap/delaminate on upper' to 'Check upper for no nosew bond gap/delamination'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair QA Tolerance sentence on Tip quarter uneven surface
      if (/\bflat\s+does\s+not\s+accept\b/i.test(updated) || /\bdoes\s+not\s+accept\s+(?:the\s+)?quality\s+standard\s+(?:swoosh|logo)?\s*paint\b/i.test(updated)) {
        const fixed = updated.replace(
          /(?:Due\s+to\s+(?:the\s+)?surface\s+Tip\s*quarter\s+design,?\s*)?flat\s+does\s+not\s+accept\s+(?:the\s+)?quality\s+standard\s+(?:swoosh|logo)?\s*paint\s+printing\s+level,?\s*(?:it\s+is\s+)?not\s+smooth,?\s*(?:the\s+)?base\s+paint\s+flows\s+after\s+nosew(?:\s+as\s+shown\s+in\s+(?:the\s+)?updated\s+QA\s+manual(?:\s+cập\s+nhật)?)?/gi,
          "Due to the uneven surface design of the Tip quarter, quality standard are acceptable for non-smooth screen-printed logos and base paint bleeding after nosew, as shown in the updated QA manual"
        );
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: "Auto-repaired QA standard sentence from inverted 'flat does not accept' to 'quality standard are acceptable'",
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair any remaining 'tolerances' in quality standard phrasing to match user QA standard
      if (/\bquality\s+standard\s+tolerances\s+are\s+acceptable\b/i.test(updated)) {
        const fixed = updated.replace(/\bquality\s+standard\s+tolerances\s+are\s+acceptable\b/gi, "quality standard are acceptable");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: "Auto-normalized 'quality standard tolerances are acceptable' to 'quality standard are acceptable'",
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair "no-sew" / "No-sew" to "Nosew" / "nosew" (strict footwear SOP terminology standard)
      if (/\b(?:no-sew|No-sew|No-Sew|NO-SEW)\b/.test(updated)) {
        const fixed = updated
          .replace(/\bNo-[sS]ew\b/g, "Nosew")
          .replace(/\bno-sew\b/g, "nosew")
          .replace(/\bNO-SEW\b/g, "NOSEW");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: "Auto-repaired hyphenated 'no-sew' to standard footwear SOP unhyphenated 'Nosew' / 'nosew'",
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Refine technical phrasing using SOP Grammar & Polish Engine
      const polished = polishSopText(updated);
      if (polished !== updated) {
        xmlModified = true;
        repairedCount++;
        issues.push({
          slide: filename,
          type: "typo_repair",
          message: "SOP Grammar Polisher: Refined phrasing to imperative SOP standard",
          targetText: polished,
          autoRepaired: true,
        });
        updated = polished;
      }

      if (updated !== tContent) {
        return tMatch.replace(tContent, updated);
      }
      return tMatch;
    });

    // 3. Audit for Lost Bold on Star Headings (*Heading)
    // Headings starting with '*' are standard industrial process titles and MUST be bold.
    // Fix #5: Pattern tightened to require a real leading word so stray *1 or *- do NOT trigger bold injection.
    xml = xml.replace(/(<a:p\b[\s\S]*?<\/a:p>)/g, (pXml) => {
      if (/\*[\w\/\s&-]+:?/u.test(pXml) && !/<a:rPr[^>]*\bb=["'](?:1|true)["']/.test(pXml)) {
        // Headings must have b="1" on their text run
        const repairedPXml = pXml.replace(/<a:rPr([^>]*)>/, (_m, attrs) => {
          const newAttrs = /\bb=["'][^"']*["']/.test(attrs)
            ? attrs.replace(/\bb=["'][^"']*["']/, 'b="1"')
            : `${attrs} b="1"`;
          return `<a:rPr${newAttrs}>`;
        });
        if (repairedPXml !== pXml) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "lost_bold",
            message: "Auto-restored bold formatting on technical process heading",
            autoRepaired: true,
          });
          return repairedPXml;
        }
      }
      return pXml;
    });

    // 4. Audit & Auto-Repair Rogue / Duplicate Headings inside Text Bodies (<p:txBody>)
    xml = xml.replace(/(<p:txBody\b[\s\S]*?<\/p:txBody>|<a:txBody\b[\s\S]*?<\/a:txBody>)/g, (bodyXml) => {
      const pMatches = Array.from(bodyXml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)).map((m) => m[0]);
      if (pMatches.length <= 2) return bodyXml;

      const seenHeadings = new Set<string>();
      const pIndicesToRemove = new Set<number>();

      for (let i = 0; i < pMatches.length; i++) {
        const pXml = pMatches[i];
        const tMatches = Array.from(pXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) => m[1]);
        const text = tMatches.map((t) => t.replace(/<[^>]+>/g, "").trim()).join(" ").trim();
        const isStarHeading = /^\s*[\*•#]\s*\S+/u.test(text);

        if (isStarHeading) {
          const headingKey = text.toLowerCase().replace(/\s+/g, " ");

          // A duplicate heading within the same text body (e.g. *Lacing repeated)
          if (seenHeadings.has(headingKey)) {
            pIndicesToRemove.add(i);
            continue;
          }

          // A heading sandwiched between numbered steps (e.g. between step 2 and step 3)
          const prevText = i > 0 ? Array.from(pMatches[i - 1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) => m[1]).join(" ").trim() : "";
          const nextText = i < pMatches.length - 1 ? Array.from(pMatches[i + 1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) => m[1]).join(" ").trim() : "";

          const prevStep = prevText.match(/^(\d+)[.)]/)?.[1];
          const nextStep = nextText.match(/^(\d+)[.)]/)?.[1];

          if (prevStep && nextStep && parseInt(nextStep, 10) > parseInt(prevStep, 10)) {
            pIndicesToRemove.add(i);
            continue;
          }

          seenHeadings.add(headingKey);
        }
      }

      if (pIndicesToRemove.size > 0) {
        let updatedBody = bodyXml;
        for (const idx of pIndicesToRemove) {
          xmlModified = true;
          repairedCount++;
          const targetP = pMatches[idx];
          issues.push({
            slide: filename,
            type: "rogue_heading",
            message: "Auto-removed rogue/duplicate heading injected between list steps",
            autoRepaired: true,
          });
          updatedBody = updatedBody.replace(targetP, "");
        }
        return updatedBody;
      }

      return bodyXml;
    });

    // 5. Audit Vietnamese Leaks in English Replace Mode
    if (mode === "replace_en") {
      const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
      for (const pXml of pMatches) {
        const tMatches = pXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [];
        const fullText = tMatches.map((t) => t.replace(/<[^>]+>/g, "").trim()).join(" ");
        if (fullText.length > 10 && hasViDiacritics(fullText)) {
          issues.push({
            slide: filename,
            type: "vi_leak",
            message: `Detected untranslated Vietnamese content in English slide: "${fullText.slice(0, 60)}..."`,
            targetText: fullText,
            autoRepaired: false,
          });
        }
      }
    }

    if (xmlModified) {
      zip.file(filename, xml);
    }
  }

  const auditedBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });

  const passed = issues.filter((i) => !i.autoRepaired).length === 0;

  return {
    passed,
    totalSlidesAudited,
    issues,
    repairedCount,
    auditedBuffer,
  };
}
