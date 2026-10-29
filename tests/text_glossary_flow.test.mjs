import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db } from '../services/database/db.ts';
import { matchTerminology } from '../services/terminology/matcher.ts';
import { enforceTerminologyCompliance } from '../services/terminology/enforcer.ts';
import { buildStructuredPrompt } from '../services/translation/context.ts';
import { GoogleTranslationProvider } from '../services/translation/google.ts';
import { POST } from '../app/api/translate/route.ts';

const source = 'Kiểm tra đường vẽ chỉ cách biên 2mm.';
const glossary = () => db.getApprovedTerminology('vi', 'en');
const request = (sourceText) => new NextRequest('http://localhost/api/translate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourceText, sourceLanguage: 'vi', targetLanguage: 'en', provider: 'google_translate' }),
});

test('Text glossary recognizes the full marking-line alias before shorter process terms', () => {
  const matched = matchTerminology(source, glossary());
  const line = matched.find((m) => m.matchedText.toLowerCase() === 'đường vẽ chỉ');
  assert.equal(line?.entry.targetTerm.toLowerCase(), 'gauge marking line');
  assert.ok(!matched.some((m) => m.matchedText.toLowerCase() === 'vẽ chỉ'));
  for (const alias of ['đường vẽ chỉ', 'đường định vị']) {
    assert.equal(matchTerminology(alias, glossary())[0]?.entry.targetTerm.toLowerCase(), 'gauge marking line');
  }
});

test('Text glossary tolerates pasted whitespace and retains original match offsets', () => {
  const text = 'Kiểm tra đường\u00a0  vẽ\tchỉ cách biên 2mm.';
  const match = matchTerminology(text, glossary()).find((m) => m.entry.targetTerm.toLowerCase() === 'gauge marking line');
  assert.ok(match);
  assert.equal(text.slice(match.startIndex, match.endIndex), 'đường\u00a0  vẽ\tchỉ');
});

test('Marking-line enforcement repairs the incorrect thread phrase without dropping dimensions', () => {
  for (const wrong of ['thread line drawing', 'threads line', 'thread lines']) {
    const fixed = enforceTerminologyCompliance(source, `Check the ${wrong} at 2mm from the edge.`, glossary(), 'vi', 'en');
    assert.match(fixed.text, /gauge marking line/i);
    assert.doesNotMatch(fixed.text, /threads? line/i);
    assert.match(fixed.text, /2mm/);
  }
});

test('Text prompt requires approved terminology instead of authorizing synonyms', () => {
  const prompt = buildStructuredPrompt({ sourceText: source, sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: glossary() });
  assert.match(prompt.userPrompt, /đường vẽ chỉ.*gauge marking line/i);
  assert.match(prompt.systemPrompt, /MUST.*approved.*terminology/i);
  assert.doesNotMatch(prompt.systemPrompt + prompt.userPrompt, /NOT 100% FORCED|do NOT need to force-apply|adapt naturally/i);
});

test('Marking-line repair does not override the separate approved drawing process', () => {
  const result = enforceTerminologyCompliance('Vẽ chỉ', 'Thread line drawing', glossary(), 'vi', 'en');
  assert.match(result.text, /^Thread line drawing$/i);
  assert.doesNotMatch(result.text, /gauge marking line/i);
});

test('Text API returns corrected glossary terms even when the provider ignores the prompt', async (t) => {
  t.mock.method(GoogleTranslationProvider.prototype, 'translate', async () => ({
    translatedText: 'Check the threads line with a 2mm margin.', provider: 'mock NMT', durationMs: 0,
  }));
  const response = await POST(request(source));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.translatedText, /gauge marking line/i);
  assert.doesNotMatch(result.translatedText, /threads? line/i);
  assert.equal(result.validation.isValid, true);
  assert.ok(result.matchedTerms.some((m) => m.entry.targetTerm.toLowerCase() === 'gauge marking line'));
});

test('Text API does not send unapproved review entries to the translation provider', async (t) => {
  t.mock.method(GoogleTranslationProvider.prototype, 'translate', async (input) => {
    assert.ok(input.approvedTerminology.length > 0);
    assert.ok(input.approvedTerminology.every((entry) => entry.status === 'approved'));
    return { translatedText: 'Check the gauge marking line at 2mm from the edge.', provider: 'mock NMT', durationMs: 0 };
  });
  const response = await POST(request(source));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).provider, 'mock NMT');
});
