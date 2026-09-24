// undef_test.mjs — no overworld module uses a name it doesn't declare or import.
//
// The main.js split (Plans/MAIN_JS_SPLIT_PLAN.md) moves code between modules. A
// name left behind only throws ReferenceError when that path RUNS, so the rest of
// the gate can pass while a rare branch is broken. This is the static check: ESLint
// `no-undef` over overworld/*.js with tools/eslint.undef.config.mjs (browser
// globals allowed, minus confusable ones like `screen`).
//
//   node overworld/tests/undef_test.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: path.join(ROOT, 'tools/eslint.undef.config.mjs'), allowInlineConfig: false });
const results = await eslint.lintFiles(['overworld/*.js']);
A(results.length >= 40, `linted every overworld module (${results.length})`);
const problems = results.flatMap(r => r.messages.map(m => `${path.basename(r.filePath)}:${m.line} ${m.message}`));
A(!problems.length, 'no module uses an undeclared, un-imported name', problems.slice(0, 10).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
