import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = process.argv.slice(2);
const files = requested.length ? requested.map((file) => path.resolve(root, file)) : readdirSync(path.join(root, 'tests')).filter((file) => file.endsWith('.test.mjs')).map((file) => path.join(root, 'tests', file));
const env = { ...process.env, TRANSLATOR_TEST_ROOT: root, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') };
for (const key of Object.keys(env)) {
  if (/API_KEY|GEMINI_KEY|JWT_SECRET|ENCRYPTION_SECRET/.test(key)) delete env[key];
}
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--import', pathToFileURL(path.join(root, 'tests/setup.mjs')).href, '--test', ...files], { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
