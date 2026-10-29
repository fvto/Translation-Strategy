// Loaded before any service imports: every test process gets its own disposable data and no live network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.env.TRANSLATOR_TEST_ROOT;
if (!root) throw new Error('Use npm test so tests cannot write to application data.');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-translator-tests-'));
process.chdir(workspace);
fs.mkdirSync('data', { recursive: true });
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/database.json'), 'utf8'));
fs.writeFileSync('data/database.json', JSON.stringify({ terminology: source.terminology, documents: [], auditLogs: [], savedTranslations: [], settings: { defaultProvider: 'gemini', retentionPolicy: 'delete_immediately', localLlmModel: 'qwen3:4b' } }));
const catalog = path.join(root, 'data/defect_catalog.json');
if (fs.existsSync(catalog)) fs.copyFileSync(catalog, path.join(workspace, 'data/defect_catalog.json'));
// Existing document fixtures and the Python helper are read through their original directories.
for (const dir of ['Database', 'scripts', '.agents']) {
  const target = path.join(root, dir);
  if (fs.existsSync(target)) fs.symlinkSync(target, path.join(workspace, dir), process.platform === 'win32' ? 'junction' : 'dir');
}
globalThis.fetch = async () => { throw new Error('Live network is disabled in unit tests; mock fetch explicitly.'); };
