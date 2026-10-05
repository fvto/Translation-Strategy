import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { execSync } from "child_process";

// Helper functions for OpenXML escaping
function escapeXml(text) {
  if (!text) return "";
  const cleaned = text
    .replace(/&amp;amp;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;&apos;/g, "''")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');

  return cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(text) {
  if (!text) return "";
  return text
    .replace(/&amp;amp;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&apos;&apos;/g, "''")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<");
}

// Read GEMINI_KEY from .env if present
function getGeminiKey() {
  if (process.env.GEMINI_KEY) return process.env.GEMINI_KEY;
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("GEMINI_KEY=")) {
          return trimmed.split("=")[1].trim();
        }
      }
    }
  } catch (e) {}
  return "";
}

function getGeminiModel() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("GEMINI_MODEL=")) {
          return trimmed.split("=")[1].trim();
        }
      }
    }
  } catch (e) {}
  return "gemini-3.5-flash-lite";
}

const geminiApiKey = getGeminiKey();
const geminiModel = getGeminiModel();

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

// Batch Translation using Gemini
async function translateBatch(items, srcLang = "vi", tgtLang = "en") {
  if (!items || items.length === 0) return new Map();
  const results = new Map();

  if (geminiApiKey) {
    const models = Array.from(new Set([
      geminiModel,
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.8-flash"
    ]));

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
          const prompt = `You are a professional athletic footwear manufacturing quality assurance (QA/QC) translation engine for Ching Luh / Nike production manuals (IPQC/ISQ).
Translate the following Vietnamese technical texts into accurate, fluent, technical English.
Key footwear terms:
- "mặt trước" -> "vamp", "mặt giày" -> "upper", "lót vòng cổ" -> "collar lining", "vòng cổ" -> "collar opening", "lưỡi gà" -> "tongue", "gót" -> "heel", "ô dê" -> "eyestay", "eo ngoài" -> "lateral / lat", "eo trong" -> "medial / med", "phom" -> "last", "đế trung" -> "midsole", "đế ngoài" -> "outsole".
- "lập thể nổi đều" -> "consistent deboss / 3D emboss", "độ bo mũi" -> "toe curve", "mũi/gót thẳng hàng" -> "toe/heel alignment", "cách biên" -> "margin", "cách kim" -> "stitch spacing / SPI", "vô phom" -> "lasting", "định hình lạnh" -> "cold molding / cold shaping", "dập bằng" -> "hammering flat", "phun keo và dán mos" / "phun keo và dán mút" -> "*Spray cement and attach cement foam", "dán mos" / "dán mút" -> "attach cement foam" (always use "attach", NEVER "apply" or typo "aplly" for foam attachment), "lộn chân" -> "swapped feet".
- Lists & Headings: Process titles starting with '*' (e.g. *Lacing) mark process sections; NEVER create or duplicate process headings inside numbered lists (e.g. between step 2 and step 3).
Strictly preserve numbers, dimensions (mm, cm, kg/cm2), temperature ranges (90-110oC), fractions (1/2 size), acronyms (PFC, SPI, QA, QAM, CTQ, CTP, ISQ, H/F), and technical context.
Return ONLY a valid JSON array of objects with "id" and "translatedText":
${JSON.stringify(items.map(it => ({ id: it.id, text: it.text })), null, 2)}`;

          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
              }
            })
          });

          if (res.status === 429 || res.status === 503) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error?.message || "";
            const retryMatch = errMsg.match(/retry in\s+([\d\.]+)\s*s/i);
            const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + 1 : 5 * (attempt + 1);
            process.stdout.write(` [429 rate limit, wait ${waitSec}s] `);
            await new Promise((r) => setTimeout(r, Math.min(waitSec, 35) * 1000));
            continue;
          }

          if (res.ok) {
            const data = await res.json();
            let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "[]";
            rawText = rawText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed)) {
              for (const p of parsed) {
                if (p.id && typeof p.translatedText === "string") {
                  results.set(p.id, normalizeSpi(p.translatedText.trim()));
                }
              }
              return results;
            }
          }
        } catch (e) {
          break;
        }
      }
    }
  }

  // Fallback to individual
  for (const item of items) {
    results.set(item.id, await translateText(item.text, srcLang, tgtLang));
  }
  return results;
}

// Single text translation function: Uses Gemini if available, with automatic fallback
async function translateText(text, srcLang = "vi", tgtLang = "en") {
  if (!text || !text.trim() || !/[a-zA-Z\u00C0-\u1EF9]/.test(text)) {
    return text;
  }

  // 1. Try Gemini
  if (geminiApiKey) {
    const models = Array.from(new Set([
      geminiModel,
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.8-flash"
    ]));
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Translate the following ${srcLang.toUpperCase()} text into clear, accurate ${tgtLang.toUpperCase()}. Keep numbers, punctuation, and technical terms intact. Return ONLY the translation, without quotes or explanation:\n\n${text}`
                    }
                  ]
                }
              ],
              generationConfig: { temperature: 0.1 }
            })
          });

          if (res.status === 429 || res.status === 503) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error?.message || "";
            const retryMatch = errMsg.match(/retry in\s+([\d\.]+)\s*s/i);
            const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + 1 : 5 * (attempt + 1);
            await new Promise((r) => setTimeout(r, Math.min(waitSec, 35) * 1000));
            continue;
          }

          if (res.ok) {
            const data = await res.json();
            let translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            translated = translated.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
            if (translated) return translated;
          }
        } catch (e) {
          break;
        }
      }
    }
  }

  // 2. Fallback to Google Translate NMT
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${srcLang}&tl=${tgtLang}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const translated = Array.isArray(json) ? json.filter(Boolean).join(" ") : String(json);
    return translated || text;
  } catch (err) {
    console.warn(`Translation fallback for: "${text.slice(0, 30)}..." - ${err.message}`);
    return text;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
Usage:
  node scripts/translate_pptx.mjs <input.pptx> [output.pptx]

Options:
  <input.pptx>    Path to the input PowerPoint file (.pptx)
  [output.pptx]   (Optional) Path to save the translated PowerPoint file
    `);
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found at "${inputPath}"`);
    process.exit(1);
  }

  const defaultOutput = inputPath.replace(/\.pptx$/i, "_translated_EN.pptx");
  const outputPath = args[1] ? path.resolve(process.cwd(), args[1]) : defaultOutput;

  console.log(`\n======================================================`);
  console.log(`   POWERPOINT AI TRANSLATOR (VIETNAMESE -> ENGLISH)   `);
  console.log(`======================================================`);
  console.log(`Source File : ${inputPath}`);
  console.log(`Output File : ${outputPath}`);

  const buffer = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(buffer);

  // 1. IMAGE SHIELD GUARANTEE
  const mediaFiles = Object.keys(zip.files).filter((name) => /^ppt\/media\/.+$/i.test(name));
  console.log(`\n[IMAGE SHIELD CHECK]`);
  console.log(`🛡️  Media files detected in PPTX : ${mediaFiles.length}`);
  console.log(`🔒 Image Shield Status            : ACTIVE`);
  console.log(`✅ Policy Guarantee               : ZERO (0) images sent to AI.`);
  console.log(`   All images stay 100% untouched and preserved in local OpenXML binary.`);

  // 2. MICROSOFT MARKITDOWN PARSING
  console.log(`\n[MICROSOFT MARKITDOWN READ]`);
  try {
    const mdScript = path.resolve(process.cwd(), "scripts", "markitdown_reader.py");
    const mdOutput = execSync(`python "${mdScript}" "${inputPath}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const parsedMd = JSON.parse(mdOutput.trim());
    if (parsedMd.markdown) {
      console.log(`✅ Read presentation structure with MS MarkItDown successfully!`);
      const preview = parsedMd.markdown.split("\n").filter(Boolean)[0] || "";
      console.log(`   Sample Markdown heading: "${preview.slice(0, 60)}..."`);
    }
  } catch (e) {
    console.log(`ℹ️  MarkItDown extraction fallback to OpenXML parser.`);
  }

  // 3. CRAWL SLIDES
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      const numA = matchA ? parseInt(matchA[0], 10) : 0;
      const numB = matchB ? parseInt(matchB[0], 10) : 0;
      return numA - numB;
    });

  console.log(`\n[CRAWLING DATA]`);
  console.log(`Total Slides Found: ${slideFiles.length}`);

  const allItemsToTranslate = [];
  const translationMap = new Map();
  const slideDataMap = new Map();

  let totalParagraphs = 0;
  let totalCharacters = 0;

  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const slidePath = slideFiles[sIdx];
    const slideIndex = sIdx + 1;
    const slideXml = await zip.file(slidePath)?.async("string");
    if (!slideXml) continue;

    const paragraphRegex = /<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g;
    let pMatch;
    let pIndex = 0;
    const pList = [];

    while ((pMatch = paragraphRegex.exec(slideXml)) !== null) {
      const pXml = pMatch[0];
      const textMatches = pXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g);
      if (textMatches && textMatches.length > 0) {
        const fullText = textMatches
          .map((tm) => {
            const raw = tm.replace(/<a:t(?:\s[^>]*)?>/, "").replace(/<\/a:t>$/, "");
            return unescapeXml(raw);
          })
          .join("");

        if (fullText.trim()) {
          const itemId = `${slidePath}_p${pIndex}`;
          pList.push({ pIndex, itemId, originalText: fullText });
          totalCharacters += fullText.length;
          totalParagraphs++;

          if (/[a-zA-Z\u00C0-\u1EF9]/.test(fullText)) {
            allItemsToTranslate.push({ id: itemId, text: fullText });
          } else {
            translationMap.set(itemId, fullText);
          }
        }
      }
      pIndex++;
    }

    slideDataMap.set(slidePath, { slideIndex, slideXml, pList });
  }

  // Also collect notes
  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const slideIndex = sIdx + 1;
    const notesPath = `ppt/notesSlides/notesSlide${slideIndex}.xml`;
    const notesXml = await zip.file(notesPath)?.async("string");
    if (notesXml) {
      const textMatches = notesXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g);
      if (textMatches && textMatches.length > 0) {
        const fullNotes = textMatches
          .map((tm) => unescapeXml(tm.replace(/<a:t(?:\s[^>]*)?>/, "").replace(/<\/a:t>$/, "")))
          .join(" ");

        if (fullNotes.trim() && /[a-zA-Z\u00C0-\u1EF9]/.test(fullNotes)) {
          allItemsToTranslate.push({ id: `notes_${slideIndex}`, text: fullNotes });
        }
      }
    }
  }

  console.log(`Total Paragraphs Extracted: ${totalParagraphs} (${totalCharacters} characters)`);
  console.log(`Paragraphs requiring translation: ${allItemsToTranslate.length}`);
  console.log(`[TRANSLATING WITH ${geminiModel.toUpperCase()}]`);

  // Batch translate in chunks of 50 items
  const chunkSize = 50;
  for (let i = 0; i < allItemsToTranslate.length; i += chunkSize) {
    const chunk = allItemsToTranslate.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(allItemsToTranslate.length / chunkSize);
    process.stdout.write(`Translating batch ${chunkNum}/${totalChunks} (${chunk.length} items)... `);

    const batchRes = await translateBatch(chunk, "vi", "en");
    for (const item of chunk) {
      const trans = batchRes.get(item.id);
      translationMap.set(item.id, trans && trans.trim() ? trans : item.text);
    }
    console.log(`[DONE]`);

    if (i + chunkSize < allItemsToTranslate.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // Inject translations back into slides
  for (const [slidePath, { slideIndex, slideXml, pList }] of slideDataMap.entries()) {
    const pMap = new Map();
    for (const p of pList) {
      const rawText = translationMap.get(p.itemId) || p.originalText;
      pMap.set(p.pIndex, normalizeSpi(rawText));
    }

    let curPIdx = 0;
    const updatedXml = slideXml.replace(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g, (pXml) => {
      const idx = curPIdx++;
      const translatedText = pMap.get(idx);
      if (!translatedText) return pXml;

      const escapedTranslated = escapeXml(translatedText);
      let isFirst = true;

      return pXml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (tMatch) => {
        const tagMatch = tMatch.match(/<a:t(?:\s[^>]*)?>/);
        const openTag = tagMatch ? tagMatch[0] : "<a:t>";
        if (isFirst) {
          isFirst = false;
          return `${openTag}${escapedTranslated}</a:t>`;
        } else {
          return `${openTag}</a:t>`;
        }
      });
    });

    zip.file(slidePath, updatedXml);
  }

  // Update notes
  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const slideIndex = sIdx + 1;
    const notesPath = `ppt/notesSlides/notesSlide${slideIndex}.xml`;
    const notesXml = await zip.file(notesPath)?.async("string");
    const translatedNotes = translationMap.get(`notes_${slideIndex}`);
    if (notesXml && translatedNotes) {
      const escapedNotes = escapeXml(normalizeSpi(translatedNotes));
      let isFirst = true;
      const updatedNotesXml = notesXml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (tMatch) => {
        const tagMatch = tMatch.match(/<a:t(?:\s[^>]*)?>/);
        const openTag = tagMatch ? tagMatch[0] : "<a:t>";
        if (isFirst) {
          isFirst = false;
          return `${openTag}${escapedNotes}</a:t>`;
        } else {
          return `${openTag}</a:t>`;
        }
      });
      zip.file(notesPath, updatedNotesXml);
    }
  }

  // Generate output buffer
  console.log(`\n[PACKAGING PRESENTATION]`);
  const outputBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  fs.writeFileSync(outputPath, outputBuffer);
  console.log(`🎉 SUCCESS! Translated presentation saved to:`);
  console.log(`   ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`- Slides translated    : ${slideFiles.length}`);
  console.log(`- Paragraphs translated : ${totalParagraphs}`);
  console.log(`- Characters processed  : ${totalCharacters}`);
  console.log(`- Images preserved      : ${mediaFiles.length} (100% kept intact, 0 sent to AI)`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Translation script failed:", err);
  process.exit(1);
});
