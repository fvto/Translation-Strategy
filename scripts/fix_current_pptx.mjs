import fs from "fs";
import JSZip from "jszip";

function normalizeSpi(text) {
  if (!text) return "";
  let res = text;
  res = res.replace(/\bstiches\b/gi, "stitches");
  res = res.replace(/\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*(?:SPI|(?:stitches?)\s*(?:\/|\s*per\s*)\s*inch)\b/gi, "SPI $1 stitches/inch");
  res = res.replace(/\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s*mũi(?:\s*\/\s*inch)?\b/giu, "SPI $1 stitches/inch");
  res = res.replace(/\b(\d+(?:[.,]\d+)?)\s*mũi\s*\/\s*inch\b/giu, "SPI $1 stitches/inch");
  res = res.replace(/\bSPI\s*[:\-]?\s*(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:\s*(?:SPI|stitches\s*(?:\/|\s*per\s*)\s*inch))?\b/gi, "SPI $1 stitches/inch");
  res = res.replace(
    /\b(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:SPI|stitches\s*(?:\/|\s*per\s*)\s*inch)\b/gi,
    (match, p1, offset, fullStr) => {
      const before = fullStr.slice(Math.max(0, offset - 10), offset);
      if (/\bSPI\s*[:\-]?\s*$/i.test(before)) return match;
      return `SPI ${p1} stitches/inch`;
    }
  );
  res = res.replace(/\bSPI\s+SPI\b/gi, "SPI");
  res = res.replace(/\b(stitches\s*\/\s*inch)(\s+\1)+\b/gi, "$1");
  res = res.replace(/\bspi\b/gi, "SPI");
  return res;
}

async function fixPresentation(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(content);
  let updatedCount = 0;

  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith("ppt/slides/slide") && filename.endsWith(".xml")) {
      let xml = await zip.files[filename].async("string");
      let slideModified = false;

      // Replace text inside <a:t> tags
      const updatedXml = xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (match, textContent) => {
        const normalized = normalizeSpi(textContent);
        if (normalized !== textContent) {
          slideModified = true;
          updatedCount++;
          console.log(`[${filename}] "${textContent}" -> "${normalized}"`);
          return match.replace(textContent, normalized);
        }
        return match;
      });

      if (slideModified) {
        zip.file(filename, updatedXml);
      }
    }
  }

  if (updatedCount > 0) {
    const newBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
    fs.writeFileSync(filePath, newBuffer);
    console.log(`Successfully updated ${updatedCount} occurrences in ${filePath}`);
  } else {
    console.log("No occurrences found that needed updating.");
  }
}

const targetFile = "HO26\u00a0NIKE\u00a0CPFM\u00a0AIR\u00a0FLEA\u00a01QA\u00a0IPQC\u00a0manual-EN (1).pptx";
fixPresentation(targetFile);
