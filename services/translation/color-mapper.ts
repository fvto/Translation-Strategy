/**
 * Color Run Mapping Engine
 * 
 * Preserves intentional text color styling (e.g., RED warnings, critical focuses, inspection highlights)
 * across source-to-target PPTX translation.
 * 
 * Extensible design: Currently configured for RED, with pluggable color rules for future additions.
 */

export interface ColorRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Matches hex or OpenXML chunk */
  matches: (hex?: string, xmlChunk?: string) => boolean;
  defaultSolidFill: string;
}

/**
 * Registry of preserved colors.
 * Currently active: RED (FF0000, ED1C24, C00000, E60023, FF0033, etc.)
 * Easily extensible by adding new rules or calling registerPreservedColor().
 */
export const PRESERVED_COLOR_RULES: ColorRule[] = [
  {
    id: "red",
    name: "Red (Màu đỏ cảnh báo / trọng điểm)",
    enabled: true,
    matches: (hex?: string, xmlChunk?: string) => {
      if (xmlChunk && /val="(?:FF0000|ff0000|C00000|c00000|ED1C24|ed1c24|E60023|e60023|FF0033|FE0000|CC0000|D9534F)"/i.test(xmlChunk)) {
        return true;
      }
      if (!hex) return false;
      const clean = hex.replace("#", "").toUpperCase();
      if (["FF0000", "ED1C24", "C00000", "E60023", "FF0033", "FE0000", "CC0000", "D9534F"].includes(clean)) {
        return true;
      }
      if (clean.length === 6) {
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        // Dominant red hue
        return r > 160 && g < 100 && b < 100;
      }
      return false;
    },
    defaultSolidFill: '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>',
  },
];

/** Register additional colors in the future (e.g., blue, yellow, green) */
export function registerPreservedColor(rule: ColorRule): void {
  const existingIdx = PRESERVED_COLOR_RULES.findIndex((r) => r.id === rule.id);
  if (existingIdx >= 0) {
    PRESERVED_COLOR_RULES[existingIdx] = rule;
  } else {
    PRESERVED_COLOR_RULES.push(rule);
  }
}

/** Check if an XML chunk or hex code represents a preserved color */
export function isPreservedColor(colorHex?: string, xmlChunk?: string): { isPreserved: boolean; ruleId?: string; solidFill?: string } {
  for (const rule of PRESERVED_COLOR_RULES) {
    if (rule.enabled && rule.matches(colorHex, xmlChunk)) {
      const solidFill = xmlChunk?.match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/)?.[0] || rule.defaultSolidFill;
      return { isPreserved: true, ruleId: rule.id, solidFill };
    }
  }
  return { isPreserved: false };
}

export interface AnalyzedRun {
  xml: string;
  text: string;
  isPreserved: boolean;
  solidFill?: string;
  rPrAttrs: string;
  rPrChildren: string;
}

export interface ParagraphColorAnalysis {
  hasPreservedColor: boolean;
  isAllPreservedColor: boolean;
  runs: AnalyzedRun[];
  // Prefix / Suffix split details
  hasPrefixSuffixSplit: boolean;
  splitType?: "NORMAL_PREFIX_RED_SUFFIX" | "RED_PREFIX_NORMAL_SUFFIX";
  prefixText?: string;
  suffixText?: string;
  normalRunTemplate?: AnalyzedRun;
  preservedRunTemplate?: AnalyzedRun;
}

/**
 * Extracts and analyzes all text runs in a paragraph for color properties.
 */
export function analyzeParagraphColors(pXml: string): ParagraphColorAnalysis {
  const runMatches = Array.from(pXml.matchAll(/<a:r\b[\s\S]*?<\/a:r>/g)).map((m) => m[0]);
  const runs: AnalyzedRun[] = [];

  for (const rXml of runMatches) {
    const tMatch = rXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
    const text = tMatch ? tMatch[1].replace(/<[^>]+>/g, "") : "";

    const rPrMatch = rXml.match(/<a:rPr([^>]*)(?:\/>|>([\s\S]*?)<\/a:rPr>)/);
    const rPrAttrs = rPrMatch ? rPrMatch[1] : "";
    const rPrChildren = rPrMatch && rPrMatch[2] ? rPrMatch[2] : "";

    const { isPreserved, solidFill } = isPreservedColor(undefined, rXml);

    runs.push({
      xml: rXml,
      text,
      isPreserved,
      solidFill,
      rPrAttrs,
      rPrChildren,
    });
  }

  const substantiveRuns = runs.filter((r) => /[a-zA-ZÀ-ỹ0-9]{2,}/u.test(r.text.trim()));
  const preservedSubstantive = substantiveRuns.filter((r) => r.isPreserved);
  const normalSubstantive = substantiveRuns.filter((r) => !r.isPreserved);

  const hasPreservedColor = preservedSubstantive.length > 0 || runs.some((r) => r.isPreserved && r.text.trim().length > 0);
  const isAllPreservedColor = hasPreservedColor && normalSubstantive.length === 0;

  if (!hasPreservedColor) {
    return {
      hasPreservedColor: false,
      isAllPreservedColor: false,
      runs,
      hasPrefixSuffixSplit: false,
    };
  }

  if (isAllPreservedColor) {
    const preservedTemplate = preservedSubstantive[0] || runs.find((r) => r.isPreserved);
    return {
      hasPreservedColor: true,
      isAllPreservedColor: true,
      runs,
      hasPrefixSuffixSplit: false,
      preservedRunTemplate: preservedTemplate,
    };
  }

  // Mixed paragraph: find split between Normal and Preserved
  const firstPreservedIdx = runs.findIndex((r) => r.isPreserved && r.text.trim().length > 0);
  const lastNormalIdx = runs.findLastIndex((r) => !r.isPreserved && r.text.trim().length > 0);

  let hasPrefixSuffixSplit = false;
  let splitType: "NORMAL_PREFIX_RED_SUFFIX" | "RED_PREFIX_NORMAL_SUFFIX" | undefined;
  let prefixText: string | undefined;
  let suffixText: string | undefined;

  if (firstPreservedIdx > 0 && lastNormalIdx < firstPreservedIdx) {
    // Normal Prefix + Preserved Suffix (e.g. "IPQC Cutting Inspection Focuses: " + "Trọng điểm kiểm tra...")
    hasPrefixSuffixSplit = true;
    splitType = "NORMAL_PREFIX_RED_SUFFIX";
    prefixText = runs.slice(0, firstPreservedIdx).map((r) => r.text).join("");
    suffixText = runs.slice(firstPreservedIdx).map((r) => r.text).join("");
  } else if (firstPreservedIdx === 0 && lastNormalIdx > firstPreservedIdx) {
    // Preserved Prefix + Normal Suffix (e.g. "Chú ý: " + "Kiểm tra nhiệt độ...")
    hasPrefixSuffixSplit = true;
    splitType = "RED_PREFIX_NORMAL_SUFFIX";
    prefixText = runs.slice(0, lastNormalIdx).filter((r) => r.isPreserved).map((r) => r.text).join("");
    suffixText = runs.slice(lastNormalIdx).map((r) => r.text).join("");
  }

  const normalTemplate = normalSubstantive[0] || runs.find((r) => !r.isPreserved);
  const preservedTemplate = preservedSubstantive[0] || runs.find((r) => r.isPreserved);

  return {
    hasPreservedColor: true,
    isAllPreservedColor: false,
    runs,
    hasPrefixSuffixSplit,
    splitType,
    prefixText,
    suffixText,
    normalRunTemplate: normalTemplate,
    preservedRunTemplate: preservedTemplate,
  };
}

const escapeXml = (str: string): string =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Builds formatted <a:r> runs for a translated paragraph, preserving red/custom colors.
 * Returns null if the paragraph does not contain preserved colors (allowing default flow).
 */
export function mapAndBuildParagraphRuns(
  sourcePXml: string,
  targetText: string,
  options?: {
    lang?: string;
    overrideFontSizePt?: number;
    isBold?: boolean;
    defaultAttrs?: string;
    defaultChildren?: string;
  }
): string | null {
  const analysis = analyzeParagraphColors(sourcePXml);
  if (!analysis.hasPreservedColor) return null;

  const targetLang = options?.lang || "en-US";
  const szAttr = options?.overrideFontSizePt != null && !isNaN(options?.overrideFontSizePt)
    ? ` sz="${Math.round(options.overrideFontSizePt * 100)}"`
    : "";

  const applyAttrs = (attrs: string, isPreservedRun: boolean): string => {
    let result = attrs;
    // Language
    if (/lang="[^"]*"/.test(result)) {
      result = result.replace(/lang="[^"]*"/, `lang="${targetLang}"`);
    } else {
      result += ` lang="${targetLang}"`;
    }
    // Font size
    if (szAttr) {
      if (/\bsz=["']\d+["']/.test(result)) {
        result = result.replace(/\bsz=["']\d+["']/, szAttr.trim());
      } else {
        result = `${szAttr}${result}`;
      }
    }
    // Bold option if specified
    if (options?.isBold !== undefined) {
      if (options.isBold) {
        if (/\bb=["'][^"']*["']/.test(result)) result = result.replace(/\bb=["'][^"']*["']/, 'b="1"');
        else result += ' b="1"';
      } else {
        result = result.replace(/\s*\bb=["'][^"']*["']/g, "");
      }
    }
    return result;
  };

  const cleanFontChildren = (children: string, ensurePreservedFill?: string): string => {
    let res = children;
    if (!res.includes("<a:latin")) {
      res = `<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/>` + res;
    }
    if (ensurePreservedFill) {
      if (/<a:solidFill\b[\s\S]*?<\/a:solidFill>/.test(res)) {
        res = res.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, ensurePreservedFill);
      } else {
        res = ensurePreservedFill + res;
      }
    }
    return res;
  };

  // Case 1: Entire paragraph is RED (Uniform Preserved Color)
  if (analysis.isAllPreservedColor && analysis.preservedRunTemplate) {
    const tmpl = analysis.preservedRunTemplate;
    const attrs = applyAttrs(tmpl.rPrAttrs, true);
    const children = cleanFontChildren(tmpl.rPrChildren, tmpl.solidFill || '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');
    return `<a:r><a:rPr${attrs}>${children}</a:rPr><a:t>${escapeXml(targetText)}</a:t></a:r>`;
  }

  // Case 2: Normal Prefix + Red Suffix (e.g. "IPQC Cutting Inspection Focuses: " + "No-sew upper pressing...")
  if (analysis.hasPrefixSuffixSplit && analysis.splitType === "NORMAL_PREFIX_RED_SUFFIX" && analysis.normalRunTemplate && analysis.preservedRunTemplate) {
    const normTmpl = analysis.normalRunTemplate;
    const redTmpl = analysis.preservedRunTemplate;

    const normAttrs = applyAttrs(normTmpl.rPrAttrs.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, ""), false);
    const normChildren = cleanFontChildren(normTmpl.rPrChildren.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, ""));

    const redAttrs = applyAttrs(redTmpl.rPrAttrs, true);
    const redChildren = cleanFontChildren(redTmpl.rPrChildren, redTmpl.solidFill || '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');

    // Determine how to split targetText into prefix and suffix
    const cleanPrefix = analysis.prefixText?.trim() || "";
    let splitPos = -1;

    // Check if targetText starts with cleanPrefix (e.g. "IPQC Cutting Inspection Focuses:")
    if (cleanPrefix.length > 0) {
      const lowerTarget = targetText.toLowerCase();
      const lowerPrefix = cleanPrefix.toLowerCase();
      if (lowerTarget.startsWith(lowerPrefix)) {
        splitPos = lowerPrefix.length;
        // Include any following spaces or colon
        while (splitPos < targetText.length && /[\s:：]/.test(targetText[splitPos])) {
          splitPos++;
        }
      } else if (cleanPrefix.includes(":")) {
        // Find colon in target text
        const colonIdx = targetText.indexOf(":");
        if (colonIdx > 0 && colonIdx <= 45) {
          splitPos = colonIdx + 1;
          while (splitPos < targetText.length && targetText[splitPos] === " ") {
            splitPos++;
          }
        }
      }
    }

    if (splitPos > 0 && splitPos < targetText.length) {
      const targetPrefix = targetText.substring(0, splitPos);
      const targetSuffix = targetText.substring(splitPos);

      const run1 = `<a:r><a:rPr${normAttrs}>${normChildren}</a:rPr><a:t>${escapeXml(targetPrefix)}</a:t></a:r>`;
      const run2 = `<a:r><a:rPr${redAttrs}>${redChildren}</a:rPr><a:t>${escapeXml(targetSuffix)}</a:t></a:r>`;
      return `${run1}${run2}`;
    }
  }

  // Case 3: Red Prefix + Normal Suffix (e.g. "Note: " + instruction)
  if (analysis.hasPrefixSuffixSplit && analysis.splitType === "RED_PREFIX_NORMAL_SUFFIX" && analysis.normalRunTemplate && analysis.preservedRunTemplate) {
    const redTmpl = analysis.preservedRunTemplate;
    const normTmpl = analysis.normalRunTemplate;

    const redAttrs = applyAttrs(redTmpl.rPrAttrs, true);
    const redChildren = cleanFontChildren(redTmpl.rPrChildren, redTmpl.solidFill || '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');

    const normAttrs = applyAttrs(normTmpl.rPrAttrs.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, ""), false);
    const normChildren = cleanFontChildren(normTmpl.rPrChildren.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, ""));

    const colonIdx = targetText.indexOf(":");
    let splitPos = colonIdx > 0 && colonIdx <= 30 ? colonIdx + 1 : -1;
    if (splitPos > 0) {
      while (splitPos < targetText.length && targetText[splitPos] === " ") splitPos++;
      const targetPrefix = targetText.substring(0, splitPos);
      const targetSuffix = targetText.substring(splitPos);

      const run1 = `<a:r><a:rPr${redAttrs}>${redChildren}</a:rPr><a:t>${escapeXml(targetPrefix)}</a:t></a:r>`;
      const run2 = `<a:r><a:rPr${normAttrs}>${normChildren}</a:rPr><a:t>${escapeXml(targetSuffix)}</a:t></a:r>`;
      return `${run1}${run2}`;
    }
  }

  // Fallback: If paragraph has red runs, apply red formatting to the substantive translated text
  if (analysis.preservedRunTemplate) {
    const tmpl = analysis.preservedRunTemplate;
    const attrs = applyAttrs(tmpl.rPrAttrs, true);
    const children = cleanFontChildren(tmpl.rPrChildren, tmpl.solidFill || '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');
    return `<a:r><a:rPr${attrs}>${children}</a:rPr><a:t>${escapeXml(targetText)}</a:t></a:r>`;
  }

  return null;
}
