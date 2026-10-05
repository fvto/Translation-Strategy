import { PptxSlideData, PptxParagraph } from "../documents/pptx-translator";

export interface QaViolation {
  id: string;
  slideIndex: number;
  type: "vi_leakage" | "spi_format" | "noun_adjunct" | "bold_parity";
  severity: "error" | "warning";
  title: string;
  description: string;
  snippet: string;
  suggestedFix?: string;
  autoRepaired?: boolean;
}

export interface QaScoreBreakdown {
  vietnameseLeakageScore: number; // 40% weight
  spiComplianceScore: number;      // 20% weight
  nounAdjunctScore: number;        // 20% weight
  formattingParityScore: number;   // 20% weight
  overallScore: number;            // 0 - 100
  grade: "A+" | "A" | "B" | "C";
  summary: string;
}

export interface QaAuditReport {
  timestamp: number;
  fileName: string;
  totalSlides: number;
  totalParagraphs: number;
  breakdown: QaScoreBreakdown;
  violations: QaViolation[];
  autoRepairedItems: Array<{
    slideIndex: number;
    rule: string;
    original: string;
    repaired: string;
  }>;
}

const VI_DIACRITICS_REGEX = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export function auditPresentationCompliance(
  slides: PptxSlideData[],
  fileName = "presentation.pptx"
): QaAuditReport {
  const violations: QaViolation[] = [];
  const autoRepairedItems: Array<{
    slideIndex: number;
    rule: string;
    original: string;
    repaired: string;
  }> = [];

  let totalParagraphs = 0;
  let viLeakageCount = 0;
  let spiIssueCount = 0;
  let nounAdjunctIssueCount = 0;
  let totalProcessHeadings = 0;
  let intactProcessHeadings = 0;

  for (const slide of slides) {
    for (const p of slide.paragraphs) {
      totalParagraphs++;
      const orig = p.originalText.trim();
      const trans = p.translatedText.trim();
      if (!trans) continue;

      // 1. Check Vietnamese leakage in English translated text
      // Skip if original had no Vietnamese or if text is purely alphanumeric/symbols
      if (VI_DIACRITICS_REGEX.test(trans)) {
        viLeakageCount++;
        violations.push({
          id: `leak_${slide.slideIndex}_${p.id}`,
          slideIndex: slide.slideIndex,
          type: "vi_leakage",
          severity: "error",
          title: "Ký tự tiếng Việt rò rỉ vào bản dịch",
          description: "Phát hiện dấu hoặc ký tự tiếng Việt trong đoạn văn tiếng Anh.",
          snippet: trans.slice(0, 80),
        });
      }

      // 2. Check SPI Standard: must be SPI <n> stitches/inch
      if (/\b\d+\s*spi\b/i.test(trans) || /\bspi\s+\d+-\d+\b(?![\s\w]*stitches\/inch)/i.test(trans)) {
        spiIssueCount++;
        violations.push({
          id: `spi_${slide.slideIndex}_${p.id}`,
          slideIndex: slide.slideIndex,
          type: "spi_format",
          severity: "warning",
          title: "Chưa chuẩn hóa mật độ mũi khâu Nike SPI",
          description: "Mật độ mũi khâu cần chuẩn hóa theo dạng 'SPI <n> stitches/inch'.",
          snippet: trans.slice(0, 80),
          suggestedFix: "SPI ... stitches/inch",
        });
      }

      // 3. Check CTQ Noun-Adjunct Order: must be [Component] shape, never Shape [Component]
      const badShapeMatch = trans.match(/\bshape\s+(tip|toe|collar|heel)\b/i);
      if (badShapeMatch) {
        nounAdjunctIssueCount++;
        const comp = badShapeMatch[1];
        const fixed = `${comp.charAt(0).toUpperCase() + comp.slice(1).toLowerCase()} shape`;
        violations.push({
          id: `noun_${slide.slideIndex}_${p.id}`,
          slideIndex: slide.slideIndex,
          type: "noun_adjunct",
          severity: "warning",
          title: "Sai thứ tự danh từ bổ nghĩa CTQ",
          description: `Tiêu chuẩn nhãn hàng yêu cầu dùng '${fixed}', không dùng 'Shape ${comp}'.`,
          snippet: trans.slice(0, 80),
          suggestedFix: fixed,
        });
      }

      // 4. Check Technical Process Headings (*Buffing:, *Cementing:, etc.)
      if (/^\s*\*[\w\s\/\-]+:/i.test(orig)) {
        totalProcessHeadings++;
        if (/^\s*\*[\w\s\/\-]+:/i.test(trans)) {
          intactProcessHeadings++;
        } else {
          violations.push({
            id: `bold_${slide.slideIndex}_${p.id}`,
            slideIndex: slide.slideIndex,
            type: "bold_parity",
            severity: "warning",
            title: "Mất ký hiệu tiêu đề kỹ thuật (*)",
            description: "Tiêu đề công đoạn kỹ thuật bị thiếu dấu '*' hoặc dấu ':' định dạng.",
            snippet: trans.slice(0, 80),
          });
        }
      }

      // Detect auto-repaired items
      if (
        (orig.includes("hở keo") && trans.toLowerCase().includes("bond gap")) ||
        (orig.includes("mũi/inch") && trans.toLowerCase().includes("stitches/inch")) ||
        (orig.includes("gập ghềnh") && trans.toLowerCase().includes("rocking")) ||
        (orig.includes("sụp mí") && trans.toLowerCase().includes("run-off stitching")) ||
        (orig.includes("mài cao") && trans.toLowerCase().includes("over buffing"))
      ) {
        autoRepairedItems.push({
          slideIndex: slide.slideIndex,
          rule: "SOP Footwear Jargon Compliance",
          original: orig.slice(0, 60),
          repaired: trans.slice(0, 60),
        });
      }
    }
  }

  // Calculate weighted scores
  const viScore = Math.max(0, 100 - viLeakageCount * 25);
  const spiScore = Math.max(0, 100 - spiIssueCount * 20);
  const nounScore = Math.max(0, 100 - nounAdjunctIssueCount * 20);
  const formatScore =
    totalProcessHeadings === 0
      ? 100
      : Math.round((intactProcessHeadings / totalProcessHeadings) * 100);

  const overallScore = Math.round(
    viScore * 0.4 + spiScore * 0.2 + nounScore * 0.2 + formatScore * 0.2
  );

  let grade: "A+" | "A" | "B" | "C" = "C";
  let summary = "";

  if (overallScore >= 98) {
    grade = "A+";
    summary = "Xuất sắc: Đạt chuẩn tuyệt đối chất lượng SOP xưởng Ching Luh (Zero Leakage, SPI chuẩn, CTQ chuẩn).";
  } else if (overallScore >= 90) {
    grade = "A";
    summary = "Đạt tiêu chuẩn: Bản dịch đáp ứng đầy đủ quy chuẩn SOP kỹ thuật, sẵn sàng ban hành trên chuyền.";
  } else if (overallScore >= 80) {
    grade = "B";
    summary = "Khá: Có một số điểm cần lưu ý về mật độ mũi khâu hoặc định dạng tiêu đề công đoạn.";
  } else {
    grade = "C";
    summary = "Cần kiểm tra lại: Phát hiện từ vựng tiếng Việt hoặc cấu trúc câu chưa chuẩn hóa.";
  }

  return {
    timestamp: Date.now(),
    fileName,
    totalSlides: slides.length,
    totalParagraphs,
    breakdown: {
      vietnameseLeakageScore: viScore,
      spiComplianceScore: spiScore,
      nounAdjunctScore: nounScore,
      formattingParityScore: formatScore,
      overallScore,
      grade,
      summary,
    },
    violations,
    autoRepairedItems,
  };
}
