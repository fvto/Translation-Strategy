function formatUppercaseStructure(text) {
  if (!text) return "";

  // 1. Lock all decimal numbers, technical units, and measurements:
  // e.g. "1.8m", "1.8mm", "0.5cm", "2.5kg", "99.9%", "v1.0", "3.14"
  // This guarantees they NEVER have spaces inserted into them or get altered by dot rules.
  const decimalLocks = [];
  let res = text.replace(/\bv?\d+\.\d+(?:[a-zA-Z%°]+(?:\/[a-zA-Z]+)?)?/g, (match) => {
    const token = `___DECIMAL_LOCK_${decimalLocks.length}___`;
    decimalLocks.push(match);
    return token;
  });

  // 2. Spacing around punctuation:
  res = res.replace(/[^\S\r\n]+([,.:;!?])/g, "$1");
  res = res.replace(/,([^\s\d])/g, ", $1");
  res = res.replace(/:([^\s\r\n])/g, ": $1");
  res = res.replace(/([.!?])([A-Za-z])/g, "$1 $2");

  // 3. Capitalize after sentence-ending punctuation (. ! ?)
  res = res.replace(/([.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

  // 4. Capitalize start of lines, section titles (*Title:), and numbered items (1. Check, 2. Verify)
  res = res.replace(
    /(^|\n)(\s*[*•\-#]*\s*(?:\d+[.)]|[a-zA-Z][.)])?\s*)([a-z])/gu,
    (m, p1, p2, p3) => p1 + p2 + p3.toUpperCase()
  );

  // 5. Section headings like *Title: or # Title: -> Title Case
  res = res.replace(/(^|\n)(\s*[*•]\s*)([a-z])/gu, (m, p1, p2, p3) => p1 + p2 + p3.toUpperCase());

  // 6. Clean up duplicate spaces while preserving newlines
  res = res.replace(/[^\S\r\n]{2,}/g, " ").trim();

  // 7. Restore all protected decimal numbers and measurements exactly as original
  for (let i = 0; i < decimalLocks.length; i++) {
    res = res.replace(`___DECIMAL_LOCK_${i}___`, decimalLocks[i]);
  }

  return res;
}

const tests = [
  "The cable length is 1.8m.check tension.",
  "Use pin 1.8mm.without deformation.",
  "1.cut leather 1.8m.2.inspect edge.",
  "Uptime is 99.9%.all zones passed.",
  "Speed is 1.8m/s.test ok.",
  "1.8m",
  "1.8m is the length.",
  "Check tolerance ±0.5mm.pass if ok."
];

for (const t of tests) {
  console.log(t, "===>", formatUppercaseStructure(t));
}
