import { SopContextRule } from "../database/types";

/**
 * Curated initial seed rules for footwear manufacturing SOPs (Ching Luh / Nike).
 * These rules can be dynamically extended, toggled, and customized by users.
 */
export const DEFAULT_SOP_RULES: SopContextRule[] = [
  {
    id: "rule_surface_tolerance",
    name: "Dung sai kỹ thuật: Bề mặt không bằng phẳng chấp nhận mức độ tiêu chuẩn",
    category: "tolerance",
    triggerPatterns: ["không bằng phẳng", "chấp nhận", "mức độ tiêu chuẩn", "lồi lõm", "chảy sơn", "không suôn", "tolerance"],
    promptInstruction: `Khi gặp ngữ cảnh "không bằng phẳng chấp nhận mức độ tiêu chuẩn...", đây là quy định cho phép chấp nhận theo tiêu chuẩn chất lượng (ví dụ: "Due to the uneven surface design of [component], quality standards are acceptable for [defect]..."). TUYỆT ĐỐI KHÔNG dùng từ "tolerances" và TUYỆT ĐỐI KHÔNG dịch thành phủ định "flat does not accept" hay đảo ngược thành lỗi bị từ chối.`,
    prohibitedOutputs: ["flat does not accept", "flat does not accept the quality standard", "tolerances"],
    autoRepairReplacement: "quality standards are acceptable for surface unevenness within standard",
    examples: [
      {
        source: "Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn, chảy sơn nền sau khi nosew như hình QA manual cập nhật.",
        target: "Due to the uneven surface design of the tip quarter, quality standards are acceptable for unsmooth screen-printed logos and base paint bleeding after nosew as shown in the updated QA manual.",
        rationale: "Translates tolerance acceptance correctly with 'quality standards are acceptable' without the word 'tolerances'."
      }
    ],
    enabled: true,
    priority: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule_spi_formatting",
    name: "Quy chuẩn định dạng mật độ mũi may (SPI)",
    category: "grammar_adjunct",
    triggerPatterns: ["mũi/inch", "mật độ mũi", "mũi may", "spi"],
    promptInstruction: `Mật độ mũi may phải tuân thủ chuẩn: "SPI <số> stitches/inch" (ví dụ: "SPI 9-10 stitches/inch", "SPI 10-12 stitches/inch"). TUYỆT ĐỐI KHÔNG viết dạng đảo ngược "<số> SPI" hay để trần "SPI <số>".`,
    prohibitedOutputs: ["\\b(\\d+)\\s*SPI\\b", "\\bSPI:\\s*(\\d+)"],
    enabled: true,
    priority: 9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule_ctq_noun_adjunct",
    name: "Trật tự danh từ bổ ngữ hạng mục kiểm tra CTQ",
    category: "grammar_adjunct",
    triggerPatterns: ["hình dạng", "định hình", "độ bo"],
    promptInstruction: `Hạng mục kiểm tra CTQ phải dùng trật tự danh ngữ tiếng Anh: [Component] shape (ví dụ: "Tip shape", "Heel shape", "Collar shape"), KHÔNG ĐƯỢC dùng động từ mệnh lệnh "Shape tip", "Shape heel".`,
    prohibitedOutputs: ["Shape tip", "Shape heel", "Shape collar"],
    autoRepairReplacement: "Tip shape",
    enabled: true,
    priority: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule_process_headings_bold",
    name: "Bảo toàn định dạng in đậm tiêu đề quy trình (*Heading)",
    category: "process_constraint",
    triggerPatterns: ["*"],
    promptInstruction: `Mọi tiêu đề quy trình kỹ thuật bắt đầu bằng ký hiệu "*" (ví dụ: *Buffing:, *Cementing:, *Hot pressing:) bắt buộc phải giữ nguyên dấu "*" và giữ định dạng in đậm (bold b="1").`,
    enabled: true,
    priority: 7,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Matches relevant SOP rules against source text based on trigger patterns.
 * Only returns enabled rules that match at least one trigger keyword or regex.
 */
export function matchRelevantRules(
  sourceText: string,
  rules: SopContextRule[] = DEFAULT_SOP_RULES
): SopContextRule[] {
  if (!sourceText || !sourceText.trim()) return [];

  const lowerText = sourceText.toLowerCase();

  return rules
    .filter((r) => r.enabled)
    .filter((rule) => {
      return rule.triggerPatterns.some((pattern) => {
        try {
          if (pattern === "*") {
            return sourceText.includes("*");
          }
          const regex = new RegExp(pattern, "i");
          return regex.test(sourceText) || lowerText.includes(pattern.toLowerCase());
        } catch {
          return lowerText.includes(pattern.toLowerCase());
        }
      });
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Builds a lean, just-in-time prompt addition containing only the rules relevant
 * to the current slide/paragraph being translated.
 * 
 * Prevents prompt bloat and eliminates rule interference across unrelated slides.
 */
export function buildDynamicRulesPrompt(
  sourceText: string,
  rules: SopContextRule[] = DEFAULT_SOP_RULES
): string {
  const matched = matchRelevantRules(sourceText, rules);
  if (matched.length === 0) return "";

  const lines: string[] = ["\nCONTEXTUAL SOP RULES FOR THIS CONTENT:"];

  for (let i = 0; i < matched.length; i++) {
    const rule = matched[i];
    lines.push(`[Rule ${i + 1} - ${rule.name}]: ${rule.promptInstruction}`);

    if (rule.examples && rule.examples.length > 0) {
      lines.push("  Examples:");
      for (const ex of rule.examples) {
        lines.push(`  - Source: "${ex.source}"`);
        lines.push(`    Standard Target: "${ex.target}"`);
        if (ex.rationale) lines.push(`    Rationale: ${ex.rationale}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Checks translated output against prohibited patterns defined in active rules.
 */
export function checkProhibitedPhrases(
  translatedText: string,
  rules: SopContextRule[] = DEFAULT_SOP_RULES
): { ruleId: string; ruleName: string; prohibitedPhrase: string; autoRepairReplacement?: string }[] {
  if (!translatedText) return [];

  const violations: { ruleId: string; ruleName: string; prohibitedPhrase: string; autoRepairReplacement?: string }[] = [];

  for (const rule of rules.filter((r) => r.enabled && r.prohibitedOutputs && r.prohibitedOutputs.length > 0)) {
    for (const pattern of rule.prohibitedOutputs!) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(translatedText)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            prohibitedPhrase: pattern,
            autoRepairReplacement: rule.autoRepairReplacement,
          });
        }
      } catch {
        if (translatedText.toLowerCase().includes(pattern.toLowerCase())) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            prohibitedPhrase: pattern,
            autoRepairReplacement: rule.autoRepairReplacement,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Applies dynamic auto-repairs to translated text based on active rule definitions.
 */
export function applyDynamicAutoRepairs(
  translatedText: string,
  rules: SopContextRule[] = DEFAULT_SOP_RULES
): { text: string; repaired: boolean; repairs: string[] } {
  if (!translatedText) return { text: "", repaired: false, repairs: [] };

  let currentText = translatedText;
  let repaired = false;
  const repairs: string[] = [];

  for (const rule of rules.filter((r) => r.enabled && r.prohibitedOutputs && r.autoRepairReplacement)) {
    for (const pattern of rule.prohibitedOutputs!) {
      try {
        const regex = new RegExp(pattern, "gi");
        if (regex.test(currentText)) {
          currentText = currentText.replace(regex, rule.autoRepairReplacement!);
          repaired = true;
          repairs.push(`Auto-repaired prohibited pattern '${pattern}' with '${rule.autoRepairReplacement}' (Rule: ${rule.name})`);
        }
      } catch {
        // Fallback exact replace
        if (currentText.toLowerCase().includes(pattern.toLowerCase())) {
          currentText = currentText.split(pattern).join(rule.autoRepairReplacement!);
          repaired = true;
          repairs.push(`Auto-repaired prohibited pattern '${pattern}' with '${rule.autoRepairReplacement}' (Rule: ${rule.name})`);
        }
      }
    }
  }

  return { text: currentText, repaired, repairs };
}
