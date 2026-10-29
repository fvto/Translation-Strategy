export function formatSopFileName(originalName: string, targetLanguage = "en"): string {
  const suffix = targetLanguage.toLowerCase().startsWith("vi") ? "VI" : "EN";
  const base = (originalName || "presentation").replace(/\.pptx$/i, "").trim();
  const alreadyTarget = suffix === "VI" ? /[-_](VI|VN)$/i.test(base) : /[-_]EN$/i.test(base);
  if (alreadyTarget) return `${base}.pptx`;
  const name = /[-_](EN|VI|VN)$/i.test(base) ? base.replace(/[-_](EN|VI|VN)$/i, `-${suffix}`) : `${base}-${suffix}`;
  return `${name}.pptx`;
}
