import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { readPptxWithMarkItDown } from "../services/documents/markitdown.ts";

test("Microsoft MarkItDown - Extraction and Markdown Conversion", async (t) => {
  // Check if python is available in environment
  let hasPython = false;
  try {
    execSync("python --version", { stdio: "ignore" });
    hasPython = true;
  } catch (e) {
    hasPython = false;
  }

  if (!hasPython) {
    t.skip("Python is not installed on this host system; MarkItDown falls back gracefully to OpenXML parser");
    return;
  }

  let testPptxPath = "";
  if (fs.existsSync("data/secure_storage/pptx_sessions")) {
    const orig = fs.readdirSync("data/secure_storage/pptx_sessions").find(f => f.endsWith(".orig.pptx"));
    if (orig) testPptxPath = path.join("data/secure_storage/pptx_sessions", orig);
  }
  if (!testPptxPath && fs.existsSync("Test")) {
    const f = fs.readdirSync("Test").find(f => f.endsWith(".pptx"));
    if (f) testPptxPath = path.join("Test", f);
  }

  if (!testPptxPath) {
    t.skip("No sample PPTX found to test MarkItDown");
    return;
  }

  const buffer = fs.readFileSync(testPptxPath);
  const result = await readPptxWithMarkItDown(buffer);

  assert.equal(result.success, true);
  assert.ok(result.markdown.length > 100);
});
