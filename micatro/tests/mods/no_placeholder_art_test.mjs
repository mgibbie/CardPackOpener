// no_placeholder_art_test.mjs — no mod card is drawn with placeholder art.
// Loads every shipped mod (micatro/js/mods/index.js AVAILABLE) and checks every center, tag, blind, seal,
// sticker, suit and sleeve that names an atlas:
//   - the atlas is registered (an unregistered one draws the UI's placeholder face),
//   - it isn't a placeholder sheet (Pokermon's placeholder_joker / _item / _deck / _sleeve, the fallback of
//     index.js atlasName() for an atlas the port has no file for),
//   - and, when the mod's art is on disk, the atlas image exists and the card's cell lies inside it.
// Mod art is gitignored (deployed to the magepunk-micatromods Pages project), so it's looked up in this
// checkout first, then in the main checkout of a git worktree; with no art on disk the image checks are skipped.
//   node micatro/tests/mods/no_placeholder_art_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { T } from './poke_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const { loadMods, AVAILABLE, MODS, ATLASES } = await import('../../js/mods/index.js');
await loadMods(AVAILABLE.map((m) => m.id));

// Where a mod's assets folder is: here, else the main checkout (this may be a worktree).
const roots = [ROOT];
try {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const main = path.dirname(common);
  if (path.resolve(main) !== path.resolve(ROOT)) roots.push(main);
} catch { /* not a git checkout */ }
const assetRoot = (id) => roots.find((r) => fs.existsSync(path.join(r, 'micatro/mods', id, 'assets')));

/** PNG size (IHDR). */
const pngSize = (file) => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const isPlaceholder = (name) => /(^|_)placeholder_/i.test(name) || /(^|\/)placeholder_[^/]*$/i.test(decodeURIComponent((ATLASES[name] || {}).src || ''));

let checked = 0, images = 0;
const bad = [], unregistered = [], missing = [], outside = [];
const sizes = {};
for (const [id, m] of Object.entries(MODS)) {
  if (!AVAILABLE.some((a) => a.id === id)) continue; // (test fixtures)
  const C = m.content || {};
  const things = [...(C.centers || []), ...(C.tags || []), ...(C.blinds || []), ...(C.seals || []), ...(C.stickers || []), ...(C.suits || []), ...(m.sleeves || [])];
  for (const c of things) {
    if (!c.atlas) continue;
    checked++;
    if (!ATLASES[c.atlas]) { unregistered.push(`${c.key} (${c.atlas})`); continue; }
    if (isPlaceholder(c.atlas)) bad.push(`${c.key} (${c.atlas})`);
  }
}
// Every atlas a mod registers that points into its own assets folder: the image is there (and its size, for the cell check above).
for (const [name, a] of Object.entries(ATLASES)) {
  const mm = /^\/micatro\/mods\/([\w-]+)\/(assets\/.*)$/.exec(a.src || '');
  if (!mm) continue;
  const root = assetRoot(mm[1]);
  if (!root) continue;
  const file = path.join(root, 'micatro/mods', mm[1], decodeURIComponent(mm[2]));
  images++;
  if (!fs.existsSync(file)) missing.push(`${name} -> ${mm[1]}/${decodeURIComponent(mm[2])}`);
  else if (/\.png$/i.test(file)) sizes[name] = pngSize(file);
}
// Each card's sprite cell lies inside its atlas image (a cell past the edge draws nothing).
for (const [id, m] of Object.entries(MODS)) {
  if (!AVAILABLE.some((a) => a.id === id)) continue;
  const C = m.content || {};
  for (const c of [...(C.centers || []), ...(C.tags || []), ...(C.blinds || []), ...(C.seals || []), ...(m.sleeves || [])]) {
    const a = ATLASES[c.atlas], sz = sizes[c.atlas];
    if (!a || !sz || !c.pos || c.pos.x === undefined || isPlaceholder(c.atlas)) continue;
    const scale = /\/2x\//.test(a.src) ? 2 : 1, px = (a.px || 71) * scale, py = (a.py || 95) * scale;
    if ((c.pos.x + 1) * px > sz.w || (c.pos.y + 1) * py > sz.h) outside.push(`${c.key} (${c.atlas} ${c.pos.x},${c.pos.y} in ${sz.w}x${sz.h})`);
  }
}

ok(checked > 1000, `cards with art checked (${checked})`);
ok(unregistered.length === 0, 'every card\'s atlas is registered', unregistered);
ok(bad.length === 0, 'no card is drawn with a placeholder atlas', bad);
if (images) {
  ok(missing.length === 0, `every registered mod atlas image exists (${images} checked)`, missing);
  ok(outside.length === 0, 'every card\'s sprite cell lies inside its atlas image', [...new Set(outside)]);
} else console.log('(mod art not on disk: image checks skipped)');
// The cards that used to be placeholders, by name (Pokermon 3.2.1 shipped them that way).
const P = (k) => MODS.pokermon.content.centers.find((c) => c.key === k);
const rd = P('j_poke_rotomdex');
ok(rd && rd.atlas === 'poke_AtlasJokersBasicOthers391' && rd.pos.x === 0 && rd.pos.y === 4, 'Rotom Dex: its Pokermon 3.9.1 art (Others sheet, 0,4)', rd && [rd.atlas, rd.pos]);
for (const [k, x] of [['b_poke_stadiumdeck', 8], ['b_poke_megadeck', 9]]) {
  const d = P(k);
  ok(d && d.atlas === 'poke_AtlasDecksBasic391' && d.pos.x === x && d.pos.y === 0, `${k}: its Pokermon 3.9.1 deck art`, d && [d.atlas, d.pos]);
}
for (const [k, x] of [['sleeve_poke_stadiumsleeve', 8], ['sleeve_poke_megasleeve', 9]]) {
  const s = MODS.pokermon.sleeves.find((v) => v.key === k);
  ok(s && s.atlas === 'poke_AtlasDecksBasic391' && s.pos.x === x && s.pos.y === 1, `${k}: its Pokermon 3.9.1 sleeve art`, s && [s.atlas, s.pos]);
}
for (const k of ['banker', 'booster', 'power', 'negging', 'copy', 'fixer']) {
  const c = P('c_poke_fake_' + k);
  ok(c && c.atlas === 'poke_AtlasJokersSeriesAGen03', `c_poke_fake_${k}: the Series A Jirachi art martz.lua names`, c && c.atlas);
}
done();
