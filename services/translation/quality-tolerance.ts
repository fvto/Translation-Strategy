/** The approved exception is a complete sentence, never a rule for arbitrary rejection criteria. */
export const APPROVED_TIP_QUARTER_NOTE = "Due to the uneven surface design of the Tip-quarter, quality standard are acceptable for non-smooth screen-printed logos and base paint bleeding after no-sew, as shown in the updated QA manual";

const LEGACY_NOTE = "Due to the surface Tip quarter design, flat does not accept the quality standard swoosh paint printing level, it is not smooth, the base paint flows after nosew as shown in the updated QA manual";
const SOURCE_NOTE = "Do thiết kế bề mặt Tip quarter không bằng phẳng chấp nhận mức độ tiêu chuẩn logo in sơn không suôn, chảy sơn nền sau khi nosew như hình QA manual cập nhật";
const normalized = (text: string) => text.trim().replace(/[.]$/, "").replace(/tip-quarter/gi, "tip quarter").replace(/no-sew/gi, "nosew").replace(/\s+/g, " ").toLowerCase();

export function repairKnownToleranceNote(text: string): string {
  return normalized(text) === normalized(LEGACY_NOTE)
    ? APPROVED_TIP_QUARTER_NOTE + (text.trim().endsWith(".") ? "." : "")
    : text;
}

export function isApprovedToleranceSource(text: string): boolean {
  return normalized(text) === normalized(SOURCE_NOTE);
}
