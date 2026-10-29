export function detectTerminologyStage(text: string): string {
  const combinedText = text.toLowerCase();

  if (/\b(?:nosew|no-sew|ép\s+nhiệt|máy\s+nosew|pizza\s+pan|protective\s+film|màng\s+tpu|màng\s+bảo\s+vệ)\b/i.test(combinedText)) {
    return "nosew";
  }
  if (/\b(?:may|đường\s+may|kim|chỉ|mũi\/inch|spi|mudguard|collar\s+lining|may\s+lót|may\s+vòng\s+cổ)\b/i.test(combinedText)) {
    return "stitching";
  }
  if (/\b(?:chặt|dao\s+chặt|khuôn\s+dao|máy\s+chặt|cắt\s+laser|bàn\s+chặt)\b/i.test(combinedText)) {
    return "cutting";
  }
  if (/\b(?:gò|dán\s+đế|quét\s+keo|quét\s+primer|sấy|lò\s+sấy|lực\s+ép\s+đế|ép\s+lạnh|ép\s+nóng|last|lasting)\b/i.test(combinedText)) {
    return "assembly";
  }
  if (/\b(?:mài\s+đế|xử\s+lý\s+đế|phun\s+sơn\s+đế|đế\s+ngoài|outsole|midsole|stockfit)\b/i.test(combinedText)) {
    return "stockfit";
  }
  if (/\b(?:kiểm\s+tra|lỗi|khuyết\s+tật|defect|ctq|isq|tiêu\s+chuẩn|qa\s+manual|mức\s+độ|ẩn\s+màu|lem\s+màu)\b/i.test(combinedText)) {
    return "qa";
  }
  return "general";
}
