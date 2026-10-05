import fs from "fs";

const filePath = "./services/translation/dictionary.ts";
let content = fs.readFileSync(filePath, "utf-8");

const marker = "export const OFFLINE_DICTIONARY: Record<string, string> = {";
const idx = content.indexOf(marker);
if (idx === -1) {
  console.error("Marker not found");
  process.exit(1);
}

const before = content.slice(0, idx + marker.length);
const rest = content.slice(idx + marker.length);
const closingIdx = rest.lastIndexOf("};");
if (closingIdx === -1) {
  console.error("Closing not found");
  process.exit(1);
}

const dictBody = rest.slice(0, closingIdx);
const after = rest.slice(closingIdx);

// Parse lines inside dictBody while preserving comments and keeping last occurrence of duplicate keys
const lines = dictBody.split("\n");
const seenKeys = new Set();
const processedLines = [];

// Reverse iterate to keep the later (more specialized) entries or earlier? Either way, only unique keys
for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  const match = line.match(/^\s*"([^"]+)"\s*:/);
  if (match) {
    const key = match[1];
    if (seenKeys.has(key)) {
      // Skip duplicate key
      continue;
    }
    seenKeys.add(key);
  }
  processedLines.unshift(line);
}

const newContent = before + "\n" + processedLines.join("\n") + after;
fs.writeFileSync(filePath, newContent, "utf-8");
console.log(`Deduplication complete. Total unique keys in OFFLINE_DICTIONARY: ${seenKeys.size}`);
