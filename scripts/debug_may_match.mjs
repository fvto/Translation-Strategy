import fs from "fs";

const db = JSON.parse(fs.readFileSync("data/database.json", "utf-8"));
const text = "*May gót:";
for (const entry of db.terminology) {
  const rawTerm = entry.sourceTerm.trim();
  const escaped = rawTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "giu");
  if (regex.test(text)) {
    console.log("MATCH:", JSON.stringify(entry.sourceTerm), "->", JSON.stringify(entry.targetTerm), "ID:", entry.id);
  }
}
