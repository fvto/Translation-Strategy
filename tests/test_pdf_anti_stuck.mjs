import test from "node:test";
import assert from "node:assert";

// Test the anti-stuck words algorithm for pdf text stream items
function renderPdfItems(items) {
  let lastY;
  let lastX = 0;
  let lastWidth = 0;
  let text = "";

  for (const item of items) {
    const str = item.str;
    if (!str) continue;

    const currentX = item.transform[4];
    const currentY = item.transform[5];
    const itemWidth = item.width || 0;

    if (lastY === undefined || Math.abs(currentY - lastY) > 3) {
      if (text.length > 0 && !text.endsWith("\n")) {
        text += "\n";
      }
      text += str;
    } else {
      const gap = currentX - (lastX + lastWidth);
      const prevEndsWithSpace = text.endsWith(" ") || text.endsWith("\t");
      const currStartsWithSpace = str.startsWith(" ") || str.startsWith("\t");

      if (!prevEndsWithSpace && !currStartsWithSpace) {
        if (gap > 1.2 || gap < -20) {
          text += " ";
        } else {
          const lastChar = text.slice(-1);
          const firstChar = str.charAt(0);
          if (/[a-zA-Z0-9À-ỹ]/.test(lastChar) && /[a-zA-Z0-9À-ỹ(]/.test(firstChar) && gap > 0.3) {
            text += " ";
          }
        }
      }
      text += str;
    }

    lastY = currentY;
    lastX = currentX;
    lastWidth = itemWidth;
  }

  // Anti-stuck post-processing for known footwear terms
  return text
    .replace(/\bTipquarter\b/g, "Tip-quarter")
    .replace(/\btipquarter\b/g, "tip-quarter")
    .replace(/\bTIPQUARTER\b/g, "TIP-QUARTER")
    .replace(/\bTip\s+quarter\b/gi, (m) => m[0] === "T" ? "Tip-quarter" : "tip-quarter");
}

test("PDF items on same line with X gap are separated by space, preventing stuck words", () => {
  const mockItems = [
    { str: "Tip", transform: [1, 0, 0, 1, 100, 500], width: 20 },
    { str: "Quarter", transform: [1, 0, 0, 1, 126, 500], width: 45 },
    { str: "ép", transform: [1, 0, 0, 1, 178, 500], width: 15 },
    { str: "bị", transform: [1, 0, 0, 1, 198, 500], width: 15 },
    { str: "hở", transform: [1, 0, 0, 1, 218, 500], width: 15 },
    { str: "keo", transform: [1, 0, 0, 1, 238, 500], width: 25 },
  ];

  const result = renderPdfItems(mockItems);
  assert.strictEqual(result, "Tip-quarter ép bị hở keo");
});

test("PDF items already glued as Tipquarter are auto-repaired to Tip-quarter", () => {
  const mockItems = [
    { str: "Kiểm tra", transform: [1, 0, 0, 1, 100, 500], width: 50 },
    { str: "Tipquarter", transform: [1, 0, 0, 1, 160, 500], width: 60 },
  ];

  const result = renderPdfItems(mockItems);
  assert.strictEqual(result, "Kiểm tra Tip-quarter");
});
