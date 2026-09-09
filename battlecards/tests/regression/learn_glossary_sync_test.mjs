// learn_glossary_sync_test.mjs (2026-09-08)
//
// The "Learn Magepunk" page (learnmagepunk/index.html) carries a keyword
// glossary generated from the engine's own glossary (battlecards/keywords.js)
// by tools/gen-learnmagepunk-glossary.mjs. It has silently drifted before
// (new keywords added to keywords.js but the generator not re-run). This guards
// that EVERY keyword in keywords.js appears on the page — re-run the generator
// if this fails:  node tools/gen-learnmagepunk-glossary.mjs
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { pathToFileURL } from 'url';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// keywords.js keeps its K array module-private — import a shimmed copy (same
// trick the generator uses) so the test reads the exact same source of truth.
const kwPath = new URL('../../keywords.js', import.meta.url);
const src = readFileSync(kwPath, 'utf8');
const shimPath = new URL('../../_kwsync_tmp.mjs', import.meta.url);
writeFileSync(shimPath, src.replace('if (typeof document', 'export { K };\nif (typeof document'));
let K;
try { ({ K } = await import(pathToFileURL(shimPath.pathname.replace(/^\/([A-Za-z]:)/, '$1')).href + '?t=' + src.length)); }
finally { try { rmSync(shimPath); } catch {} }

const page = readFileSync(new URL('../../../learnmagepunk/index.html', import.meta.url), 'utf8');
const grid = (page.match(/<dl class="kw-grid">[\s\S]*?<\/dl>/) || [''])[0];
ok('the Learn page has a kw-grid glossary block', grid.length > 0);

// the generator's only skip: the plane-flavored "Static" duplicate
const entries = K.filter(k => !(k.plane && k.p[0] === 'Static'));
// every glossary label (the primary phrase p[0]) must appear as a <dt> label.
// A label renders as `>Label<` (close of <dt>/<a>) or `>Label ` (space before an
// alias/plane <span>), so accept either delimiter after it.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onPage = label => new RegExp('>' + reEsc(esc(label)) + '[< ]').test(grid);
const missing = entries.filter(k => !onPage(k.p[0])).map(k => k.p[0]);
ok('every keyword in keywords.js is listed on the Learn page', missing.length === 0, missing);

// the rendered count should match the filtered glossary size (no stale extras)
const rendered = (grid.match(/<div class="kw">/g) || []).length;
ok('the page renders exactly one entry per glossary keyword', rendered === entries.length, [rendered, entries.length]);

// a couple of anchors: recently added / removed keywords
ok('Hexproof is on the page (post-split)', /<dt>[^]*?Hexproof/.test(grid));
ok('Bushido is NOT on the page (retired)', !/>Bushido</.test(grid));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
