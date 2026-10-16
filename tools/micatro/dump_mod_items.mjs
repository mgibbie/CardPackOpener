// dump_mod_items.mjs — print (JSON on stdout) every player-facing item each Micatro mod registers,
// for the micatro/ tree under <root> (a checkout or a `git archive` snapshot of a past commit).
// Used by tools/gen-magepunknews.mjs to find new mod cards between commits (the mods' content is
// JS, not data, so it has to be loaded to be listed). Mods are loaded headlessly like micatro/tests do.
//   node tools/micatro/dump_mod_items.mjs <root>
// -> {mods: {<id>: {name, items: [{key, name, set, rarity?, cost?, atlas?, pos?, soul?}]}}}
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const root = path.resolve(process.argv[2] || '.');
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const out = { mods: {} };
const log = console.log;
console.log = console.warn = () => { }; // mods may log while loading: stdout is the JSON only
try {
  if (!fs.existsSync(path.join(root, 'micatro/js/mods/index.js'))) throw new Error('no mods');
  const IDX = await imp('micatro/js/mods/index.js');
  const REG = await imp('micatro/js/mods/registry.js');
  const core = await imp('micatro/js/engine/core.js');
  const failed = new Set();
  for (const m of IDX.AVAILABLE || []) {
    try { await m.load(); } catch (e) { failed.add(m.id); }
  }
  const L = REG.MOD_LOC || { descriptions: {}, misc: {} };
  const name = (set, key, dflt) => String(((L.descriptions[set] || {})[key] || {}).name || dflt || key).replace(/\{[^}]*\}/g, '').trim();
  const RARITY = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'legendary' };
  const SET = { Back: 'Deck', Enhanced: 'Enhancement' };
  const add = (id, it) => { (out.mods[id] ||= { name: (IDX.AVAILABLE.find((m) => m.id === id) || {}).name || id, items: [] }).items.push(it); };
  const art = (o) => ({ ...(o.atlas ? { atlas: '@' + o.atlas } : {}), ...(o.pos ? { pos: { x: o.pos.x || 0, y: o.pos.y || 0 } } : {}), ...(o.soul_pos ? { soul: { x: o.soul_pos.x || 0, y: o.soul_pos.y || 0 } } : {}) });
  for (const c of Object.values(core.P_CENTERS)) {
    if (!c.mod || c.unported || failed.has(c.mod) || ['Shader', 'Other', 'Default'].includes(c.set)) continue;
    const rar = c.set === 'Joker' ? (REG.RARITIES && REG.RARITIES[c.rarity] ? (REG.RARITIES[c.rarity].name || c.rarity) : RARITY[c.rarity] || 'common') : null;
    const nm = name(c.set, c.key, null) !== c.key ? name(c.set, c.key) : name('Other', c.key, c.name);
    add(c.mod, { key: c.key, name: nm, set: SET[c.set] || c.set, ...(rar ? { rarity: String(rar).toLowerCase() } : {}), ...(c.cost != null && c.set !== 'Back' ? { cost: c.cost } : {}), ...art(c) });
  }
  for (const t of Object.values(core.P_TAGS)) if (t.mod && !failed.has(t.mod)) add(t.mod, { key: t.key, name: name('Tag', t.key, t.name), set: 'Tag', ...art(t) });
  for (const b of Object.values(core.P_BLINDS)) if (b.mod && !failed.has(b.mod)) add(b.mod, { key: b.key, name: name('Blind', b.key, b.name), set: b.boss ? 'Boss Blind' : 'Blind', ...art(b) });
  for (const s of Object.values(core.P_STAKES)) if (s.mod && !failed.has(s.mod)) add(s.mod, { key: s.key, name: name('Stake', s.key, s.name), set: 'Stake', ...art(s) });
  for (const s of Object.values(core.P_SEALS)) if (s.mod && !failed.has(s.mod)) add(s.mod, { key: s.key, name: String(s.display_name || name('Other', s.key.toLowerCase() + '_seal', s.name)), set: s.set === 'Stamp' ? 'Stamp' : 'Seal', ...art(s) });
  // a mod that failed to load in this snapshot is reported so the caller keeps its previous list
  out.failed = [...failed];
  out.atlases = {};
  for (const [n, a] of Object.entries(REG.ATLASES || {})) if (a && a.src) out.atlases[n] = { src: a.src, cw: a.px * 2, ch: a.py * 2 };
} catch (e) {
  out.error = String(e && e.message || e);
}
log(JSON.stringify(out));
process.exit(0);
