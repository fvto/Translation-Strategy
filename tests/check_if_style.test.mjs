import test from 'node:test';
import assert from 'node:assert/strict';
import { polishSopText } from '../services/translation/sop-polisher.ts';
import { internalSopInstructions, shortenInternalSopPhrasing } from '../services/translation/internal-sop.ts';
import { buildStructuredPrompt } from '../services/translation/context.ts';
import { approvedTargetForms } from '../services/terminology/usage.ts';
import { checkInstructionQuality } from '../services/translation/translation-quality.ts';

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

test('Zero "Check with" rule: Kiểm tra must strictly pair with Check if and Check with is auto-corrected', () => {
  const source = 'Kiểm tra nhiệt độ thực tế 80-90°C.';
  const prompt = buildStructuredPrompt({ sourceText: source, sourceLanguage: 'vi', targetLanguage: 'en', approvedTerminology: [] }).systemPrompt;
  assert.match(prompt, /NEVER use "Check with"/);
  assert.match(prompt, /ALWAYS translates to "Check if"/);

  // Check with auto-correction in sop-polisher (Lean & Concise Shop-Floor SOP format)
  assert.equal(
    polishSopText('1. Check with real temp 80-90°C of hold mold, time 30s, pressure 4-6kg.'),
    '1. Check if hot mold temp is 80-90°C, time 30s, pressure 4-6kg.'
  );
  assert.equal(
    polishSopText('2. Check with putting upper onto hot mold must edge-even with mold, BOM sight with be at center of Heel.'),
    '2. Check if upper is edge-even with hot mold, projector light centered on heel.'
  );
  assert.equal(
    polishSopText('3. Check with upper match with BPM, mark on mold must match with mark on machine to avoid mark on logo.'),
    '3. Check if upper matches BPM, mold mark matches machine to avoid mark on logo.'
  );
  assert.equal(
    polishSopText('Check with logo and Qtr must have same size'),
    'Check if logo and Qtr have same size'
  );
  assert.equal(
    polishSopText('Check with finished shoe must not have color contamination'),
    'Check if finished shoe has no color contamination'
  );
  assert.equal(
    polishSopText('Check with collar shape must consistent'),
    'Check if collar shape is consistent'
  );

  assert.equal(
    polishSopText('4. Check after BPM, logo is not scratch, mark on logo, no cracking under logo.'),
    '4. Check if logo has no marks, scratches, or under-paint cracks after BPM.'
  );

  // QA check flags Check with and ungrammatical clauses following Check if
  const qualityIssues = checkInstructionQuality('Kiểm tra nhiệt độ.', 'Check with real temp 80-90°C.');
  assert.ok(qualityIssues.some(issue => issue.type === 'check_if_required'));
  assert.match(qualityIssues[0].message, /Check with/);

  const missingVerbIssues = checkInstructionQuality(undefined, 'Check if real temp 80-90°C.');
  assert.ok(missingVerbIssues.some(issue => issue.type === 'incomplete_condition'));

  const brokenAgreementIssues = checkInstructionQuality(undefined, 'Check if upper match with BPM.');
  assert.ok(brokenAgreementIssues.some(issue => issue.type === 'incomplete_condition'));

  const brokenPidginIssues = checkInstructionQuality(undefined, 'Check if putting upper onto hot mold must edge-even with mold.');
  assert.ok(brokenPidginIssues.some(issue => issue.type === 'incomplete_condition'));
});
