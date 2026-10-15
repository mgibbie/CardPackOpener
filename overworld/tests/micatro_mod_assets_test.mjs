// micatro_mod_assets_test.mjs — every Micatro mod with art has a working redirect to the
// mod-art Pages project (magepunk-micatromods). Regression: a single
// `/micatro/mods/:mod/assets/*` rule (placeholder + splat) never matched on Cloudflare, so
// mod art fell through to the SPA's index.html.
//   node overworld/tests/micatro_mod_assets_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m); } };

const rules = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (const r of rules) {
  const from = r.split(/\s+/)[0];
  A(!(/\/:[a-z]/i.test(from) && from.endsWith('*')), `no rule mixes a :placeholder with a * splat (${from})`);
}
// Mods the site ships = AVAILABLE entries in micatro/js/mods/index.js that point at micatro/mods/<id>/
const idx = fs.readFileSync(path.join(ROOT, 'micatro/js/mods/index.js'), 'utf8');
const shipped = [...idx.matchAll(/import\(['"]\.\.\/\.\.\/mods\/([\w-]+)\/index\.js['"]\)/g)].map((m) => m[1]);
A(shipped.includes('pokermon'), 'pokermon is a shipped mod');
for (const id of shipped) {
  const want = `/micatro/mods/${id}/assets/* https://magepunk-micatromods.pages.dev/${id}/assets/:splat 301`;
  A(rules.includes(want), `${id}: art redirect rule present`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
