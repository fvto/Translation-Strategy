import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../services/database/db.ts";

test("default provider should be Google AI Studio (gemini) or Google NMT", () => {
  const settings = db.getSettings();
  assert.ok(["gemini", "google_translate"].includes(settings.defaultProvider));
});
