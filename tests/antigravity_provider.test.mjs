import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

test('Antigravity CLI Binary Installation & Path Detection', async (t) => {
  const localAppData = process.env.LOCALAPPDATA;
  assert.ok(localAppData, 'LOCALAPPDATA environment variable should be present');

  const agyExePath = path.join(localAppData, 'agy', 'bin', 'agy.exe');
  const exists = fs.existsSync(agyExePath);
  assert.ok(exists, `agy.exe should be installed at ${agyExePath} without admin elevation`);

  const stat = fs.statSync(agyExePath);
  assert.ok(stat.size > 1000000, `agy.exe should be a valid binary executable (size: ${stat.size} bytes)`);
});

test('Antigravity CLI Translation Provider & Rules Integrity', async (t) => {
  const antigravityModule = await import('../services/translation/antigravity.ts');
  assert.ok(antigravityModule.AntigravityCliTranslationProvider, 'AntigravityCliTranslationProvider should be exported');
  assert.ok(antigravityModule.AntigravityAuthRequiredError, 'AntigravityAuthRequiredError should be exported');

  const provider = new antigravityModule.AntigravityCliTranslationProvider();
  assert.equal(provider.name, 'antigravity_cli');

  const resolvedPath = provider.resolveBinaryPath();
  assert.ok(resolvedPath.toLowerCase().includes('agy.exe'), `Resolved path should point to agy.exe: ${resolvedPath}`);
});

test('Glossary Suggestion Fallback on Unauthenticated CLI', async (t) => {
  const antigravityModule = await import('../services/translation/antigravity.ts');
  const provider = new antigravityModule.AntigravityCliTranslationProvider();

  // Test suggestTerm with a footwear inspection term
  const suggestion = await provider.suggestTerm(
    'Hình dạng gót',
    'Ching Luh Footwear Quality Criteria IPQC',
    'vi',
    'en'
  );

  assert.ok(suggestion, 'Should return a suggestion result');
  assert.ok(suggestion.targetTerm, 'Should provide targetTerm');
  // Must satisfy strict zero-leak and noun-phrase adjunct order rules
  assert.notEqual(suggestion.targetTerm.toLowerCase(), 'shape heel', 'Must never invert to verb phrase Shape heel');
});

test('SPI Stitches/Inch Formatting Rule in Context', async (t) => {
  const { normalizeSpiTerminology } = await import('../services/translation/casing.ts');
  
  const formatted = normalizeSpiTerminology('10-12 mũi/inch');
  assert.equal(formatted, 'SPI 10-12 stitches/inch');

  const formatted2 = normalizeSpiTerminology('7-8 mũi');
  assert.equal(formatted2, 'SPI 7-8 stitches/inch');
});

test('Footwear Spray Cement & Attach Foam Standard', async (t) => {
  const { sanitizeTerminologyEntry } = await import('../services/terminology/sanitizer.ts');

  // Verify that any typo "aplly" or "apply cement foam" is prevented and autocorrected
  const check = sanitizeTerminologyEntry({
    sourceTerm: '*Phun keo và dán mos',
    targetTerm: '*Spray cement and aplly cement foam',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });

  assert.equal(check.autoCorrected, true, 'Must auto-correct');
  assert.equal(check.suggestedTarget, '*Spray cement and attach cement foam');
});

test('Engine Factory Resolution for Antigravity CLI', async (t) => {
  const { getTranslationProvider, AntigravityCliTranslationProvider } = await import('../services/translation/index.ts');
  const { db } = await import('../services/database/db.ts');

  const origSettings = db.getSettings();
  try {
    db.updateSettings({ defaultProvider: 'antigravity_cli' });
    const provider = getTranslationProvider();
    assert.equal(provider.name, 'antigravity_cli');
    assert.ok(provider instanceof AntigravityCliTranslationProvider);
  } finally {
    db.updateSettings({ defaultProvider: origSettings.defaultProvider });
  }
});

