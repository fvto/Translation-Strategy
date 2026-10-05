import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "database.sqlite");
const jsonPath = path.resolve(process.cwd(), "data", "database.json");

const sqlite = new Database(dbPath);
const res = sqlite.prepare(`
  UPDATE terminology 
  SET sourceTerm = REPLACE(sourceTerm, 'wrikle', 'wrinkle'), 
      targetTerm = REPLACE(targetTerm, 'wrikle', 'wrinkle') 
  WHERE sourceTerm LIKE '%wrikle%' OR targetTerm LIKE '%wrikle%'
`).run();
console.log("Updated rows in SQLite:", res.changes);

if (fs.existsSync(jsonPath)) {
  const content = fs.readFileSync(jsonPath, "utf-8");
  const updated = content.split("wrikle").join("wrinkle");
  fs.writeFileSync(jsonPath, updated, "utf-8");
  console.log("Updated database.json successfully");
}
