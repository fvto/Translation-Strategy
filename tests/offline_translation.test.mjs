import { test } from "node:test";
import assert from "node:assert/strict";
import { AirGappedTranslationProvider } from "../services/translation/offline.ts";

const provider = new AirGappedTranslationProvider();

const glossary = [
  {
    id: "term_1",
    sourceTerm: "Risk Assessment",
    targetTerm: "Đánh giá rủi ro",
    sourceLanguage: "en",
    targetLanguage: "vi",
    status: "approved",
    priority: 1,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "term_2",
    sourceTerm: "Access Control",
    targetTerm: "Kiểm soát truy cập",
    sourceLanguage: "en",
    targetLanguage: "vi",
    status: "approved",
    priority: 1,
    createdAt: "",
    updatedAt: "",
  },
];

test("offline translator should produce natural business sentence translation", async () => {
  const res = await provider.translate({
    sourceText: "The organization must complete a comprehensive Risk Assessment annually in accordance with ISO 27001 and NIST CSF standards.",
    sourceLanguage: "en",
    targetLanguage: "vi",
    approvedTerminology: glossary,
  });

  assert.match(res.translatedText, /tổ chức/i);
  assert.match(res.translatedText, /hoàn thành/i);
  assert.match(res.translatedText, /đánh giá rủi ro/i);
  assert.match(res.translatedText, /hàng năm/i);
  assert.match(res.translatedText, /ISO 27001/i);
});

test("offline translator should preserve operational metrics and policy wording", async () => {
  const res = await provider.translate({
    sourceText: "Access Control policies must be enforced across all 4 production zones with 99.9% uptime.",
    sourceLanguage: "en",
    targetLanguage: "vi",
    approvedTerminology: glossary,
  });

  assert.match(res.translatedText, /kiểm soát truy cập/i);
  assert.match(res.translatedText, /chính sách/i);
  assert.match(res.translatedText, /4/i);
  assert.match(res.translatedText, /99,9%|99.9%/i);
});
