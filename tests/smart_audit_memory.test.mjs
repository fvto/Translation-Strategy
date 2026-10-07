import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Audit history persists real user corrections and keeps language directions isolated', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'smart-audit-memory-test-'));
  const memoryUrl = new URL('../services/translation/translation-memory.ts', import.meta.url).href;
  const tsxPath = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const code = `
    import assert from 'node:assert/strict';
    import { recordTranslationSession, getAuditHistoryPairs, getTranslationSessionById } from ${JSON.stringify(memoryUrl)};
    const slides = [{ slideIndex: 1, paragraphs: [{ id: 'corrected', originalText: 'Emergency Stop', translatedText: 'Dừng khẩn cấp' }, { id: 'ai', originalText: 'Safety Instructions', translatedText: 'Hướng dẫn an toàn' }] }];
    recordTranslationSession('forward', 'forward.pptx', slides, 'replace_en', 'en', 'vi', 0, ['corrected']);
    recordTranslationSession('reverse', 'reverse.pptx', [{ slideIndex: 2, paragraphs: [{ id: 'reverse', originalText: 'Dừng khẩn cấp', translatedText: 'Emergency Stop' }] }], 'replace_en', 'vi', 'en');
    const pairs = getAuditHistoryPairs('en', 'vi');
    assert.equal(pairs.length, 2);
    assert.equal(pairs.find(p => p.source === 'Emergency Stop').origin, 'correction');
    assert.equal(pairs.find(p => p.source === 'Safety Instructions').origin, 'history');
    assert.equal(getAuditHistoryPairs('vi', 'en').length, 1);
    assert.equal(getTranslationSessionById('../forward'), null);
    assert.equal(getTranslationSessionById('forward').slides[0].pairs[0].userCorrected, true);
  `;
  try {
    const result = spawnSync(process.execPath, [tsxPath, '--eval', code], { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('smart-audit-memory-test-')) throw new Error('Unexpected test cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});
