import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../services/database/db.ts";

test("default provider should be air-gapped offline to avoid Local LLM connection failures", () => {
  const settings = db.getSettings();
  assert.equal(settings.defaultProvider, "airgapped");
});
