import { normalizeSourcePunctuation } from "./casing";

export interface InternalSopExample {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

// Text supplied by the user as the internal reference. Never auto-approve AI output.
export const INTERNAL_SOP_EXAMPLES: InternalSopExample[] = [
  {
    id: "internal-embroidery-buffing",
    sourceText: "Do liệu thêu sau mài sẽ có chỉ sùi, khi dán đế cần có thao tác ém chỉ thừa vào trong để hạn chế sùi chỉ.",
    translatedText: "After buffing embroidery will have broken threads. While assembling, operator need to tuck the thread inside the outsole to minimized the thread exposed.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
  {
    id: "internal-cement-buffing-line",
    sourceText: "Liệu khó vệ sinh keo thừa, khi quét keo và dán đế phải bằng đường mài, không được cao hay thấp hơn.",
    translatedText: "Due to material properties, Production need to control high cementing defects by correct cementing and attaching outsole strictly follow buffing line, not higher or lower.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
  {
    id: "internal-hot-shaping-temp",
    sourceText: "1. Kiểm tra nhiệt độ thực tế 80-90°C của định hình nóng, thời gian 30s, lực ép 4-6kg",
    translatedText: "1. Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
  {
    id: "internal-hot-shaping-upper-even",
    sourceText: "2. Kiểm tra đặt mặt giày vào khuôn định hình nóng phải bằng mí khuôn, đèn chiếu phải nằm ngay giữa gót. Khi ép đầu bò vừa ôm sát với mặt giày nhất là vị trí tiếp xúc với logo không được siết quá chặt gây cấn, trầy ,để lại dấu trên bề mặt logo. Điều chỉnh độ kéo vừa phải để tránh nứt rách gãy lớp lót bên trong mức độ dưới logo.",
    translatedText: "2. Check if upper is edge-even with hot mold, projector light centered on heel. Upper mold fits closely with upper, especially at contact with logo, do not over-tighten to avoid marks/scratches on logo. Adjust pull to avoid cracking lining under logo.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
  {
    id: "internal-upper-match-bpm",
    sourceText: "3. Kiểm tra mặt giày khớp với khuôn ép, đặt định vị chữ thao trên máy tránh tình trạng ngắn logo",
    translatedText: "3. Check if upper matches mold, mold mark matches machine to avoid mark on logo.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
  {
    id: "internal-bpm-logo-inspection",
    sourceText: "4. Kiểm tra sau khi dập BPM, logo không bị cấn, trầy, để lại dấu trên bề mặt logo.",
    translatedText: "4. Check if logo has no marks, scratches, or under-paint cracks after BPM.",
    sourceLanguage: "vi", targetLanguage: "en",
  },
];

export function internalSopKey(text: string): string {
  // Only normalize presentation differences. Keep numbers, negation and conditions.
  return normalizeSourcePunctuation(text.normalize("NFC")).replace(/\s+/g, " ").trim().toLowerCase();
}

export function findInternalSopExample(source: string, examples: InternalSopExample[]): string | undefined {
  const bySource = new Map<string, string>();
  for (const example of examples) {
    const key = internalSopKey(example.sourceText);
    if (!bySource.has(key)) bySource.set(key, example.translatedText);
  }
  const whole = bySource.get(internalSopKey(source));
  if (whole) return whole;
  const paragraphs = source.trim().split(/\r?\n+/);
  const targets = paragraphs.map((paragraph) => bySource.get(internalSopKey(paragraph)));
  if (targets.every(Boolean)) return targets.join("\n");
  // The reference in the user's image is one continuous remark.
  const referenceKey = internalSopKey(INTERNAL_SOP_EXAMPLES.map((e) => e.sourceText).join(" "));
  if (internalSopKey(source) === referenceKey) {
    return INTERNAL_SOP_EXAMPLES.map((e) => bySource.get(internalSopKey(e.sourceText)) || e.translatedText).join(" ");
  }
}

export function internalSopStyleGuide(): string {
  return `INTERNAL FACTORY SOP STYLE (MANDATORY):
- Write concise, telegraphic shop-floor instructions using familiar footwear wording (càng ngắn gọn càng tốt để vừa bảng slide). For an inspection instruction ("Kiểm tra ..."), ALWAYS use "Check if" followed by a concise grammatical clause (subject + finite verb + complete condition) adjusted for footwear context. Example: "Kiểm tra nhiệt độ thực tế 80-90°C của định hình nóng" -> "Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg". Strip unnecessary articles ("the", "a") and wordy filler connectors while retaining 100% of measurements and defects. NEVER use "Check with" under any circumstances — "Kiểm tra" ALWAYS goes with "Check if". Never mechanically prepend "Check if" to a bare noun phrase (e.g. NEVER "Check if real temp 80-90°C") or bare gerund (e.g. NEVER "Check if putting upper... must edge-even"). Ensure proper verb agreement ("upper matches", not "upper match"). Do not shorten this to "Check stitching line" or "Check if stitching line".
- Preserve "if" when shortening inspection sentences. Do not substitute "Check with", "Verify", "Ensure" or "Inspect" for "Check if" in a source inspection instruction. Keep physical operation commands direct: "Tuck ...", "Keep ...", "Do not ...". Do not add an inspection action to a source that only states a fact.
- Avoid explanatory prose such as "it is necessary to", "it should be noted that", "in order to" and repeated "during ... attaching". Keep essential reasons and purpose clauses.
- Preserve EVERY action, component, defect, location, direction, number, unit, limit, exception, prohibition and acceptance condition. "Not higher or lower" must retain BOTH limits. Never shorten by dropping content, merging numbered steps, or deleting repeated source instructions.
- Keep process names in their approved noun form in headings. In instructions use explicitly approved grammatical forms from the glossary; do not replace the technical meaning with a synonym.
- Keep the same approved defect label in headings, table rows and defect lists throughout the document. For "đứt chỉ", use its approved label "Broken thread"; do not alternate label wording with "breaking" or "breakage". In complete inspection clauses retain the correct predicate, e.g. "Check if the threads are broken." Do not treat fraying as thread breakage; they are different defects.
- Use internal examples as wording/style references ONLY. Never copy their defects, locations or specifications into a different source. Do not copy grammar errors into newly translated sentences.
- Keep clear English grammar and explicit subjects. Do not use ambiguous "it" when workers need to identify a component or operation.
- Do not target an arbitrary percentage reduction in length. Be as short as possible while retaining the complete instruction.`;
}

/** Remove a narrow, common filler while retaining the required action and negation. */
export function shortenInternalSopPhrasing(text: string): string {
  return text
    .replace(/(^|[.!?]\s+|\n|,\s+)it\s+is\s+necessary\s+to\s+not\s+([a-z])/gi,
      (_match, prefix: string, first: string) => prefix + (prefix.trim().endsWith(",") ? "do not " : "Do not ") + first.toLowerCase())
    .replace(/(^|[.!?]\s+|\n|,\s+)it\s+is\s+necessary\s+to\s+([a-z])/gi,
      (_match, prefix: string, first: string) => prefix + (prefix.trim().endsWith(",") ? first.toLowerCase() : first.toUpperCase()))
    .replace(/\bin\s+order\s+to\b/gi, "to");
}

export function internalSopInstructions(source: string, examples = INTERNAL_SOP_EXAMPLES): string {
  const words = (text: string) => new Set(internalSopKey(text).match(/[\p{L}\p{N}]{3,}/gu) || []);
  const sourceWords = words(source);
  const relevant = examples.map((example) => {
    const exampleWords = words(example.sourceText);
    const common = [...exampleWords].filter((word) => sourceWords.has(word)).length;
    return { example, score: common / Math.max(1, Math.min(exampleWords.size, sourceWords.size)) };
  }).filter((item) => item.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 2);
  return internalSopStyleGuide() + (relevant.length ? "\nINTERNAL WORDING REFERENCES (not additional input):\n" +
    relevant.map(({ example }) => JSON.stringify({ source: example.sourceText, approvedTranslation: example.translatedText })).join("\n") : "");
}
