import test from 'node:test';
import assert from 'node:assert/strict';
import { polishSopText } from '../services/translation/sop-polisher.ts';
import { internalSopInstructions, shortenInternalSopPhrasing } from '../services/translation/internal-sop.ts';
import { buildStructuredPrompt } from '../services/translation/context.ts';
import { approvedTargetForms } from '../services/terminology/usage.ts';

test('Text and batch SOP instructions require Check if with a complete condition', () => {
  const source = 'Kiểm tra đường may có thẳng không.';
  const text = buildStructuredPrompt({ sourceText: source, sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [] }).systemPrompt;
  for (const prompt of [text, internalSopInstructions(source)]) {
    assert.match(prompt, /ALWAYS use "Check if"/);
    assert.match(prompt, /finite verb/);
    assert.match(prompt, /Preserve "if"/);
  }
  assert.deepEqual(approvedTargetForms({ sourceTerm: 'Kiểm tra', targetTerm: 'Check', targetLanguage: 'en' }), ['Check if']);
});

test('SOP polishing retains Check if predicates, dimensions and negation', () => {
  const inputs = [
    'Check if the heel seam of the upper is centered within 2mm.',
    'Check if the lasting and tip lasting are aligned with the marking line.',
    'Check that the finished shoe has no wrinkles.',
    'Check whether the margin exceeds 2mm.',
  ];
  for (const input of inputs) {
    const result = polishSopText(input);
    assert.match(result, /^Check if /);
    if (input.includes('2mm')) assert.match(result, /2mm/);
    if (input.includes('has no')) assert.match(result, /has no wrinkles/);
  }
  assert.equal(shortenInternalSopPhrasing('It is necessary to check if the margin exceeds 2mm.'), 'Check if the margin exceeds 2mm.');
});

test('An operation command is not converted into an inspection', () => {
  assert.equal(polishSopText('Tuck excess threads inside the outsole.'), 'Tuck excess threads inside the outsole.');
});
