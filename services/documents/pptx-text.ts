/** Shared, read-only DrawingML paragraph reconstruction. Run boundaries are not word boundaries. */
export const PPTX_PARAGRAPH_PATTERN = /<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g;

export function decodePptxText(text: string): string {
  return text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (entity, code, name) => {
    if (code) {
      const value = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()];
  });
}

export function paragraphText(xml: string): string {
  return Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/a:br>)/g),
    (match) => match[1] === undefined ? "\n" : decodePptxText(match[1])).join("");
}

export function canReplaceParagraphText(xml: string, target: string): boolean {
  if (/<a:fld\b|<a:br\b/.test(xml) || /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(target)) return false;
  const runs = Array.from(xml.matchAll(/<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>/g), (m) => m[0]);
  // Same-length accent corrections retain every run boundary. Length changes require uniform styling.
  const sameLength = Array.from(paragraphText(xml)).length === Array.from(target).length;
  const accentFold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
  const accentOnly = sameLength && accentFold(paragraphText(xml)) === accentFold(target);
  // Proofing/language metadata does not change visual formatting. Keep it in the
  // output, but do not mistake it for a difference in font, color or emphasis.
  const styles = new Set(runs.filter((r) => paragraphText(r)).map((r) => {
    const properties = r.match(/<a:rPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/)?.[0] || "";
    return properties.replace(/\s+(?:lang|altLang|dirty|err|smtClean|smtId|noProof)=["'][^"']*["']/g, "").replace(/<a:rPr><\/a:rPr>/, "<a:rPr/>");
  }));
  return runs.length > 0 && (accentOnly || styles.size <= 1);
}

/** Only text node contents change; paragraph/run properties and all surrounding XML remain verbatim. */
export function replaceParagraphText(xml: string, target: string): string {
  if (!canReplaceParagraphText(xml, target)) throw new Error("This paragraph requires manual review to preserve mixed formatting, fields or line breaks.");
  const nodes = Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g));
  const lastSubstantiveNode = nodes.findLastIndex((node) => decodePptxText(node[1]).length > 0);
  const chars = Array.from(target);
  let offset = 0;
  let index = 0;
  return xml.replace(/(<a:t(?:\s[^>]*)?>)([\s\S]*?)(<\/a:t>)/g, (_, open, raw, close) => {
    const length = Array.from(decodePptxText(raw)).length;
    const text = length ? chars.slice(offset, index === lastSubstantiveNode ? chars.length : offset + length).join("") : "";
    offset += length;
    index++;
    return open + text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + close;
  });
}

/** AI translation may consolidate text into its dominant substantive source run.
 * Keep paragraph geometry/properties and every existing run property. Unlike
 * spelling suggestions, a translation is not constrained to the old run lengths.
 */
export function canTranslateParagraphText(xml: string): boolean {
  return !/<a:fld\b/.test(xml) && /<a:r(?:\s[^>]*)?>[\s\S]*?<a:t(?:\s[^>]*)?>/.test(xml);
}

export function replaceParagraphTranslation(xml: string, target: string): string {
  if (canReplaceParagraphText(xml, target)) return replaceParagraphText(xml, target);
  if (!canTranslateParagraphText(xml) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(target)) {
    throw new Error("This paragraph contains unsupported fields or explicit breaks.");
  }
  const runs = Array.from(xml.matchAll(/<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>/g));
  const substantive = runs.filter(r => /[\p{L}\p{N}]{2}/u.test(paragraphText(r[0])));
  const candidates = substantive.length ? substantive : runs;
  const visualKey = (r: string) => (r.match(/<a:rPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/)?.[0] || "")
    .replace(/\s+(?:lang|altLang|dirty|err|smtClean|smtId|noProof)=["'][^"']*["']/g, "");
  const weight = new Map<string, number>();
  for (const r of candidates) weight.set(visualKey(r[0]), (weight.get(visualKey(r[0])) || 0) + paragraphText(r[0]).trim().length);
  const dominant = [...candidates].sort((a,b) => (weight.get(visualKey(b[0]))! - weight.get(visualKey(a[0]))!) || paragraphText(b[0]).trim().length - paragraphText(a[0]).trim().length)[0];
  const chosen = runs.indexOf(dominant);
  const hasBold = (r: string) => /<a:rPr\b[^>]*\bb=["'](?:1|true)["']/.test(r);
  const partialBold = substantive.some(r => hasBold(r[0])) && !substantive.every(r => hasBold(r[0]));
  const lines = target.split(/\r?\n/).map(line => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  let index = 0;
  return xml.replace(/<a:br\b[^>]*(?:\/>|>[\s\S]*?<\/a:br>)/g, "").replace(/<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>/g, r => {
    const selected = index++ === chosen;
    let firstText = true;
    let updated = r.replace(/(<a:t(?:\s[^>]*)?>)[\s\S]*?(<\/a:t>)/g, (_,open,close) => {
      const text = selected && firstText ? lines[0] : ""; firstText = false;
      return open + text + close;
    });
    if (selected && partialBold) {
      if (/<a:rPr\b/.test(updated)) updated = updated.replace(/<a:rPr\b([^>]*?)(\/?>)/, (_,attrs,end) => `<a:rPr${attrs.replace(/\s+b=["'][^"']*["']/g, "")} b="0"${end}`);
      else updated = updated.replace(/(<a:r(?:\s[^>]*)?>)/, '$1<a:rPr b="0"/>');
    }
    if (selected && lines.length > 1) return lines.map(line => {
      let first = true;
      return updated.replace(/(<a:t(?:\s[^>]*)?>)[\s\S]*?(<\/a:t>)/g, (_,open,close) => {const text=first?line:"";first=false;return open+text+close;});
    }).join('<a:br/>');
    return updated;
  });
}
