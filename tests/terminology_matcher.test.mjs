import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTerminology } from "../services/terminology/matcher.ts";

test("Terminology Matcher - Exact and Case-Insensitive Matching", () => {
  const glossary = [
    {
      id: "term_1",
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

  // Exact match
  const matches1 = matchTerminology("Strict Access Control is enforced.", glossary);
  assert.equal(matches1.length, 1);
  assert.equal(matches1[0].entry.targetTerm, "Kiểm soát truy cập");
  assert.equal(matches1[0].matchedText, "Access Control");

  // Lowercase match
  const matches2 = matchTerminology("Ensure proper access control.", glossary);
  assert.equal(matches2.length, 1);
  assert.equal(matches2[0].matchedText, "access control");

  // Uppercase match
  const matches3 = matchTerminology("ACCESS CONTROL policy.", glossary);
  assert.equal(matches3.length, 1);
  assert.equal(matches3[0].matchedText, "ACCESS CONTROL");
});

test("Terminology Matcher - Longest Phrase Prioritization", () => {
  const glossary = [
    {
      id: "term_short",
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
      id: "term_long",
      sourceTerm: "Risk Assessment Methodology",
      targetTerm: "Phương pháp luận đánh giá rủi ro",
      sourceLanguage: "en",
      targetLanguage: "vi",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
  ];

  const text = "We apply the Risk Assessment Methodology across all units.";
  const matches = matchTerminology(text, glossary);

  // Must match the longest term, not the shorter sub-phrase
  assert.equal(matches.length, 1);
  assert.equal(matches[0].entry.id, "term_long");
  assert.equal(matches[0].matchedText, "Risk Assessment Methodology");
});

test("Terminology Matcher - Prevents False Partial Word Matches", () => {
  const glossary = [
    {
      id: "term_1",
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

  // "controlled access" must NOT match "Access Control"
  const matches = matchTerminology("We provide controlled access to records.", glossary);
  assert.equal(matches.length, 0);
});

test("Terminology Matcher - Safe Plural Variation", () => {
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
  ];

  const matches = matchTerminology("All Risk Assessments must be reviewed.", glossary);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchedText, "Risk Assessments");
});

test("Terminology Matcher - Vietnamese Unicode Diacritic Matching", () => {
  const glossary = [
    {
      id: "term_vn_1",
      sourceTerm: "đường cắt",
      targetTerm: "cutting line",
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "term_vn_2",
      sourceTerm: "trung đế",
      targetTerm: "strobel",
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "term_vn_3",
      sourceTerm: "biên",
      targetTerm: "edge",
      sourceLanguage: "vi",
      targetLanguage: "en",
      status: "approved",
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
  ];

  const text = "Kiểm tra đường cắt laze cách biên trung đế 15mm.";
  const matches = matchTerminology(text, glossary);

  assert.equal(matches.length, 3);
  assert.equal(matches[0].matchedText, "đường cắt");
  assert.equal(matches[0].entry.targetTerm, "cutting line");
  assert.equal(matches[1].matchedText, "biên");
  assert.equal(matches[1].entry.targetTerm, "edge");
  assert.equal(matches[2].matchedText, "trung đế");
  assert.equal(matches[2].entry.targetTerm, "strobel");
});

