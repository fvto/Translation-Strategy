import JSZip from "jszip";
import { hasViDiacritics } from "../terminology/sanitizer";
import { normalizeSpiTerminology, normalizeInvertedNounPhrases, cleanTargetTerm } from "../translation/casing";
import { polishSopText } from "../translation/sop-polisher";
import { readIsqSlidePairs } from "../documents/pptx-slide-order";
import { db } from "../database/db";
import { AirGappedTranslationProvider } from "../translation/offline";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { replaceParagraphTranslation } from "../documents/pptx-text";
import { isVietnameseText } from "../translation/vietnamese-detector";
import { repairKnownToleranceNote } from "../translation/quality-tolerance";
import { PPTX_PARAGRAPH_PATTERN } from "../documents/pptx-text";

/** Escapes XML special characters for safe injection into <a:t> nodes. */
function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface PostFlightIssue {
  slide: string;
  type: "vi_leak" | "lost_bold" | "invalid_spi" | "inverted_phrase" | "typo_repair" | "rogue_heading" | "terminology" | "translation_quality";
  message: string;
  originalText?: string;
  targetText?: string;
  autoRepaired: boolean;
}

export interface PostFlightAuditReport {
  translationQuality?: import("../translation/translation-quality").TranslationQualityReport;
  terminologyConsistency?: import("../terminology/document-plan").DocumentTerminologyReport;
  passed: boolean;
  totalSlidesAudited: number;
  issues: PostFlightIssue[];
  repairedCount: number;
  auditedBuffer: Buffer;
  untranslatedRemaining?: { slide: string; text: string }[];
}

export interface PostFlightOptions {
  /** Unselected source paragraphs must survive every repair byte for byte. */
  protectedParagraphs?: Map<string, Set<string>>;
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
  mode: "replace_en" | "ipqc_bilingual" = "replace_en",
  targetLanguage: string = "en",
  options: PostFlightOptions = {}
): Promise<PostFlightAuditReport> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const isqPairs = await readIsqSlidePairs(zip);
  const isqEnPaths = new Set(isqPairs.map((p) => p.en));
  const isqViPaths = new Set(isqPairs.map((p) => p.vi));
  const issues: PostFlightIssue[] = [];
  let repairedCount = 0;
  let totalSlidesAudited = 0;

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!filename.startsWith("ppt/slides/slide") || !filename.endsWith(".xml")) continue;
    // CRITICAL: Original Vietnamese reference slides in ISQ pairs must be preserved intact!
    if (isqViPaths.has(filename)) {
      totalSlidesAudited++;
      continue;
    }
    totalSlidesAudited++;

    let xml = await file.async("string");
    let xmlModified = false;
    const preserved = new Map<string, string>();
    const protectedInSlide = options.protectedParagraphs?.get(filename);
    if (protectedInSlide) {
      xml = xml.replace(new RegExp(PPTX_PARAGRAPH_PATTERN), (paragraph) => {
        if (!protectedInSlide.has(paragraph)) return paragraph;
        const marker = `<a:p><a:r><a:t>__KEEP_REVIEW_PARAGRAPH_${preserved.size}__</a:t></a:r></a:p>`;
        preserved.set(marker, paragraph);
        return marker;
      });
    }

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
      // Preserve Vietnamese text runs intact (do NOT run English replacements or mangle Vietnamese backstitching)
      if (hasViDiacritics(tContent)) {
        return tMatch;
      }
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
          "Check if the upper is free of no-sew bond gaps and delamination"
        );
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: `Auto-corrected 'Check if nosew bond gap/delaminate on upper' to 'Check if the upper is free of no-sew bond gaps and delamination'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair forbidden 'Check with' -> standard 'Check if' (Worker Directive: Kiểm tra luôn luôn đi với Check if)
      if (/\bCheck\s+with\b/i.test(updated)) {
        const fixed = polishSopText(updated);
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "translation_quality",
            message: `Auto-corrected forbidden 'Check with' to standard 'Check if': '${updated.trim()}' -> '${fixed.trim()}'`,
            targetText: fixed,
            autoRepaired: true,
          });
          updated = escapeXmlText(fixed);
        }
      }

      // Only the complete, previously approved legacy sentence may change acceptance semantics.
      const repairedTolerance = repairKnownToleranceNote(updated);
      if (repairedTolerance !== updated) {
        xmlModified = true;
        repairedCount++;
        issues.push({ slide: filename, type: "typo_repair", message: "Repaired approved legacy QA note", targetText: repairedTolerance, autoRepaired: true });
        updated = repairedTolerance;
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

      // Auto-Repair unhyphenated "Nosew" / "nosew" to standard footwear SOP hyphenated "No-sew" / "no-sew" (Production Rule #3)
      if (/\b(?:Nosew|nosew|NOSEW)\b/.test(updated)) {
        const fixed = updated
          .replace(/\bNosew\b/g, "No-sew")
          .replace(/\bnosew\b/g, "no-sew")
          .replace(/\bNOSEW\b/g, "NO-SEW");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: "Auto-repaired unhyphenated 'Nosew'/'nosew' to standard footwear SOP hyphenated 'No-sew'/'no-sew'",
            targetText: fixed,
            autoRepaired: true,
          });
          updated = fixed;
        }
      }

      // Auto-Repair stuck/unhyphenated "Tipquarter" or "Tip quarter" to standard hyphenated "Tip-quarter"
      if (/\b(?:Tipquarter|tipquarter|TIPQUARTER|Tip\s+quarter|tip\s+quarter|TIP\s+QUARTER)\b/i.test(updated)) {
        const fixed = updated
          .replace(/\bTipquarter\b/g, "Tip-quarter")
          .replace(/\btipquarter\b/g, "tip-quarter")
          .replace(/\bTIPQUARTER\b/g, "TIP-QUARTER")
          .replace(/\bTip\s+quarter\b/g, "Tip-quarter")
          .replace(/\btip\s+quarter\b/g, "tip-quarter")
          .replace(/\bTIP\s+QUARTER\b/g, "TIP-QUARTER");
        if (fixed !== updated) {
          xmlModified = true;
          repairedCount++;
          issues.push({
            slide: filename,
            type: "typo_repair",
            message: "Auto-repaired stuck/unhyphenated 'Tipquarter'/'Tip quarter' to standard hyphenated 'Tip-quarter'",
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
        return tMatch.replace(tContent, () => updated);
      }
      return tMatch;
    });

    // 3. Audit for Lost Bold on Star Headings (*Heading)
    // Headings starting with '*' are standard industrial process titles and MUST be bold.
    // Supports Vietnamese diacritics using unicode property \p{L}\p{N}
    xml = xml.replace(/(<a:p\b[\s\S]*?<\/a:p>)/g, (pXml) => {
      if (/\*[\p{L}\p{N}\/\s&-]+:?/u.test(pXml) && !/<a:rPr[^>]*\bb=["'](?:1|true)["']/.test(pXml)) {
        // Headings must have b="1" on their text run
        let repairedPXml = pXml;
        if (/<a:rPr\b/.test(repairedPXml)) {
          repairedPXml = repairedPXml.replace(/<a:rPr\b([^>]*?)(\/?>)/, (_m, rawAttrs, slash) => {
            let attrs = rawAttrs.trimEnd();
            const isSelfClosing = slash === "/>" || attrs.endsWith("/");
            if (attrs.endsWith("/")) {
              attrs = attrs.slice(0, -1).trimEnd();
            }
            const newAttrs = /\bb=["'][^"']*["']/.test(attrs)
              ? attrs.replace(/\bb=["'][^"']*["']/, 'b="1"')
              : `${attrs} b="1"`;
            return `<a:rPr ${newAttrs.trim()}${isSelfClosing ? "/>" : ">"}`;
          });
        } else if (/<a:r(?:\s[^>]*)?>/.test(repairedPXml)) {
          repairedPXml = repairedPXml.replace(/(<a:r(?:\s[^>]*)?>)/, '$1<a:rPr b="1"/>');
        }
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

    // 5. Audit & Clean Vietnamese Leaks on English slides (replace_en mode and ISQ top EN slides)
    // Only applies if the target language is English!
    if ((mode === "replace_en" || isqEnPaths.has(filename)) && targetLanguage.toLowerCase().startsWith("en")) {
      const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
      for (const pXml of pMatches) {
        const rawRunTexts = Array.from(pXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g), (m) => m[1]);
        const fullRaw = rawRunTexts.join("");
        const fullText = fullRaw
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\s+/g, " ")
          .trim();
        if (hasViDiacritics(fullText) || isVietnameseText(fullText)) {
          // Auto-translate untranslated Vietnamese content using Glossary Review & Airgapped Provider
          // NEVER blindly delete paragraph XML into an empty string to avoid wiping manufacturing instructions!
          try {
            const glossary = db.getGlossaryReviewTerminology("vi", "en");
            const airgapped = new AirGappedTranslationProvider();
            const translated = airgapped.translateVietnameseToEnglish(fullText, glossary);
            const enforced = enforceTerminologyCompliance(fullText, translated, glossary, "vi", "en");
            const candidate = enforced.text.trim();

            if (candidate && !hasViDiacritics(candidate) && candidate.toLowerCase() !== fullText.toLowerCase()) {
              const repairedPXml = replaceParagraphTranslation(pXml, candidate, fullText);
              xml = xml.replace(pXml, () => repairedPXml);
              xmlModified = true;
              repairedCount++;
              issues.push({
                slide: filename,
                type: "vi_leak",
                message: `Auto-translated untranslated Vietnamese paragraph to English: "${fullText.slice(0, 60)}..." -> "${candidate.slice(0, 60)}..."`,
                originalText: fullText,
                targetText: candidate,
                autoRepaired: true,
              });
            } else if (fullText.length > 5) {
              issues.push({
                slide: filename,
                type: "vi_leak",
                message: `Detected untranslated Vietnamese content in English slide: "${fullText.slice(0, 60)}..."`,
                targetText: fullText,
                autoRepaired: false,
              });
            }
          } catch {
            if (fullText.length > 5) {
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
      }
    }

    // Schema Safety: Ensure every <p:txBody> has at least one <a:p> element
    xml = xml.replace(/<p:txBody\b([^>]*)>([\s\S]*?)<\/p:txBody>/g, (fullMatch, attrs, content) => {
      if (!/<a:p\b/.test(content)) {
        xmlModified = true;
        return `<p:txBody${attrs}>${content}<a:p><a:endParaRPr/></a:p></p:txBody>`;
      }
      return fullMatch;
    });

    if (xmlModified) {
      for (const [marker, original] of preserved) xml = xml.replace(marker, () => original);
      zip.file(filename, xml);
    }
  }

  const auditedBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });

  const untranslatedRemaining = issues
    .filter((i) => i.type === "vi_leak" && !i.autoRepaired)
    .map((i) => ({ slide: i.slide, text: i.targetText || i.message }));

  const passed = untranslatedRemaining.length === 0;

  return {
    passed,
    totalSlidesAudited,
    issues,
    repairedCount,
    auditedBuffer,
    untranslatedRemaining,
  };
}
