// Pokermon 3.9.1 data overlay (Plans/MICATRO_MODS_UPGRADES.md batch 5): the subset of 3.9.1's static data for the jokers
// our 3.2.1 port already has, on top of micatro/mods/pokermon/data.js (3.2.1, untouched).
//
//   1. extract 3.9.1 with the same extractor as data.js (fengari on NODE_PATH; InertSteak/Pokermon at tag 3.9.1):
//        NODE_PATH=<dir with fengari> node tools/micatro/extract_mod_data.cjs <Pokermon 3.9.1> <tmp>/pokermon391.js tools/micatro/specs/pokermon_391.json
//   2. node tools/micatro/gen_pokermon_391_overlay.mjs <tmp>/pokermon391.js
//      -> micatro/mods/pokermon/data391.js (GENERATED: never hand-edit; the decisions are in
//         tools/micatro/specs/pokermon_391_overlay.json)
//
// What it emits (index.js applies it before building the centers):
//   jokers   {name: {rarity, cost, blueprint_compat, perishable_compat, eternal_compat, enhancement_gate, attributes, config: {path: value}}}
//            only the changes the spec takes (take_always fields for every joker, `take` paths per joker)
//   sprites  {name: {atlas, pos, soul_pos?, multi?}} 3.9.1's PokemonSprites (pokespriteload.lua) for every joker data.js
//            has, resolved to the sheet name (pokermon.sprites.get_atlas_string), minus sprite_hold
//   blinds   the renamed blind (bl_poke_cgoose -> bl_poke_iridescent_hacker) with 3.9.1's look (pos, boss_colour)
//   loc      the 3.9.1 loc entries those need (+ the reworked jokers' Joker entries and the spec's loc_extra)
//   reworked the jokers on their 3.9.1 behaviour (spec rework_files minus rework_hold): config_all = the whole 3.9.1
//            config, every compat flag, the loc entry
//   rework_deferred  [name, why] (spec rework_deferred, batch 7+): reworked jokers ported without one 3.9.1 part that
//            belongs to other content not ported yet (inert: for the docs and tests)
//   skipped  every 3.9.1 change to an existing joker's static data that is NOT taken, with the reason
// It fails when a value change of an existing config key, or a blueprint_compat flip, has no decision in the spec.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/micatro/gen_pokermon_391_overlay.mjs <3.9.1 extract .js>'); process.exit(1); }
const OUT = 'micatro/mods/pokermon/data391.js';
const SPEC = JSON.parse(fs.readFileSync('tools/micatro/specs/pokermon_391_overlay.json', 'utf8'));
const BASE = (await import(pathToFileURL(path.resolve('micatro/mods/pokermon/data.js')).href)).default;
const NEW = (await import(pathToFileURL(path.resolve(SRC)).href)).default;
if (NEW.errors && NEW.errors.length) throw new Error('the 3.9.1 extract has errors: ' + NEW.errors.join('; '));

const listOf = (f) => (f && f.ret && Array.isArray(f.ret.list) ? f.ret.list : []);
const items = (D, g) => { const m = {}; for (const f of D.groups[g] || []) for (const it of listOf(f)) m[it.name || it.key] = { it, file: f.file }; return m; };
const BJ = items(BASE, 'jokers'), NJ = items(NEW, 'jokers');
const isTable = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const flat = (o, p = '', r = {}) => { if (isTable(o)) { for (const [k, v] of Object.entries(o)) flat(v, p ? p + '.' + k : k, r); } else if (p) r[p] = o; return r; };
const J = (v) => JSON.stringify(v);
// The engine's reading of a missing flag (index.js jokerCenter): blueprint off, Perishable / Eternal allowed.
const EFFECTIVE = { blueprint_compat: (v) => !!v, perishable_compat: (v) => v !== false, eternal_compat: (v) => v !== false };
const eff = (f, v) => (EFFECTIVE[f] ? EFFECTIVE[f](v) : v);
const formatOnly = (a, b) => J(a).replace(/"(-?\d+(?:\.\d+)?)"/g, '$1') === J(b).replace(/"(-?\d+(?:\.\d+)?)"/g, '$1');

const take = SPEC.take || {}, reasons = SPEC.reasons || {}, always = new Set(SPEC.take_always || []);
const jokers = {}, skipped = [], missing = [];
const counts = {};
const count = (k) => { counts[k] = (counts[k] || 0) + 1; };
const put = (name, field, value) => { (jokers[name] || (jokers[name] = {}))[field] = value; };
const skip = (name, field, from, to, reason) => skipped.push([name, field, from === undefined ? null : from, to === undefined ? null : to, reason]);
// Reworked files (batch 6+): every existing joker of a file in rework_files is on its 3.9.1 behaviour (ported by hand in
// jokers/<file>.js), so it takes ALL of its 3.9.1 static data: the whole config (config_all: replaces data.js's), every
// compat flag, and its 3.9.1 loc entry. rework_hold: jokers of those files still on 3.2.1 (they go through take / reasons).
const reworkFiles = new Set(SPEC.rework_files || []), reworkHold = SPEC.rework_hold || {};
for (const name of Object.keys(reworkHold)) if (!BJ[name]) throw new Error(`rework_hold: '${name}' is not a 3.2.1 joker`);
const reworkDeferred = SPEC.rework_deferred || {};
for (const name of Object.keys(reworkDeferred)) {
  if (!BJ[name]) throw new Error(`rework_deferred: '${name}' is not a 3.2.1 joker`);
  if (reworkHold[name] || !reworkFiles.has(BJ[name].file.replace('pokemon/', '').replace('.lua', ''))) throw new Error(`rework_deferred: '${name}' is not reworked`);
}
const BLOC = (BASE.loc && BASE.loc.descriptions) || {}, NLOC = NEW.loc.descriptions;
const reworked = [], jokerLoc = {};
for (const [name, { it: a, file }] of Object.entries(BJ)) {
  const n = NJ[name];
  if (!n) { skip(name, '*', null, null, 'not in 3.9.1'); continue; }
  const b = n.it;
  if (reworkFiles.has(file.replace('pokemon/', '').replace('.lua', '')) && !reworkHold[name]) {
    reworked.push(name);
    for (const f of ['rarity', 'cost', 'blueprint_compat', 'perishable_compat', 'eternal_compat', 'enhancement_gate', 'attributes']) {
      if (J(eff(f, a[f])) === J(eff(f, b[f]))) continue;
      put(name, f, b[f] === undefined ? null : b[f]); count(f);
    }
    if (J(a.config || {}) !== J(b.config || {})) { put(name, 'config_all', b.config || {}); count('config_all'); }
    const key = 'j_poke_' + name, nl = NLOC.Joker && NLOC.Joker[key];
    if (!nl) throw new Error(`3.9.1 en-us has no ${key}`);
    if (J(nl) !== J(BLOC.Joker && BLOC.Joker[key])) { jokerLoc[key] = nl; count('loc'); }
    continue;
  }
  const tk = new Set(take[name] || []);
  const why = (dflt) => (reasons[name] ? reasons[name] + ` (${file.replace('pokemon/', '').replace('.lua', '')})` : dflt);
  for (const f of ['rarity', 'cost', 'blueprint_compat', 'perishable_compat', 'eternal_compat', 'enhancement_gate', 'attributes']) {
    if (J(eff(f, a[f])) === J(eff(f, b[f]))) continue;
    if (always.has(f) || tk.has(f)) { put(name, f, b[f] === undefined ? null : b[f]); count(f); continue; }
    if (!reasons[name]) missing.push(`${name}.${f}: ${J(a[f])} -> ${J(b[f])}`);
    skip(name, f, a[f], b[f], why('?'));
  }
  const fa = flat(a.config || {}, 'config'), fb = flat(b.config || {}, 'config');
  for (const k of [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()) {
    const va = fa[k], vb = fb[k];
    if (J(va) === J(vb)) continue;
    if (tk.has(k)) {
      if (va === undefined || vb === undefined) throw new Error(`${name}.${k}: only a value change of a key both versions have can be taken`);
      (jokers[name] || (jokers[name] = {})).config = { ...((jokers[name] || {}).config || {}), [k.replace(/^config\./, '')]: vb };
      count('config'); continue;
    }
    if (va === undefined) skip(name, k, va, vb, why('new key: only the 3.9.1 logic reads it'));
    else if (vb === undefined) skip(name, k, va, vb, why('key dropped by 3.9.1: the ported 3.2.1 logic still reads it'));
    else if (formatOnly(va, vb)) skip(name, k, va, vb, 'format only (a string id became a number): no change');
    else { if (!reasons[name]) missing.push(`${name}.${k}: ${J(va)} -> ${J(vb)}`); skip(name, k, va, vb, why('?')); }
  }
}
for (const name of Object.keys(take)) if (!BJ[name]) throw new Error(`take: '${name}' is not a 3.2.1 joker`);
if (missing.length) { console.error('no decision (take it or give a reason in the spec):\n  ' + missing.join('\n  ')); process.exit(1); }

// ---- sprites (3.9.1 functions/pokespriteload.lua; get_atlas_string: gen_atlas is the gen number now)
const SPR = {};
for (const s of (NEW.globals.PokemonSprites && NEW.globals.PokemonSprites.list) || []) SPR[s.name] = s;
const sprites = {}, held = [];
for (const name of Object.keys(BJ)) {
  const s = SPR[name];
  if (!s) continue;
  if (SPEC.sprite_hold && SPEC.sprite_hold[name]) { held.push([name, SPEC.sprite_hold[name]]); continue; }
  const g = typeof s.gen_atlas === 'number' ? s.gen_atlas : s.gen_atlas ? BJ[name].it.gen : null;
  const atlas = g ? 'AtlasJokersBasicGen' + String(g).padStart(2, '0') : s.others_atlas ? 'AtlasJokersBasicOthers' : 'AtlasJokersBasicNatdex';
  const pos = Array.isArray(s.base.pos) ? s.base.pos[0] : s.base.pos;
  const e = { atlas, pos: { x: pos.x, y: pos.y } };
  if (s.base.soul_pos) e.soul_pos = { x: s.base.soul_pos.x, y: s.base.soul_pos.y };
  if (Array.isArray(s.base.pos)) e.multi = true;
  sprites[name] = e;
}

// ---- the renamed blind (3.9.1 blinds/pokebossblind.lua): our cgoose behaviour under the new key + 3.9.1's look
const NB = items(NEW, 'blinds');
const hacker = NB.iridescent_hacker && NB.iridescent_hacker.it;
if (!hacker) throw new Error('3.9.1 has no iridescent_hacker blind');
const blinds = { cgoose: { key: 'iridescent_hacker', boss_colour: hacker.boss_colour, pos: hacker.pos, atlas: hacker.atlas } };
const loc = { Blind: { bl_poke_iridescent_hacker: NEW.loc.descriptions.Blind.bl_poke_iridescent_hacker } };
if (!loc.Blind.bl_poke_iridescent_hacker) throw new Error('3.9.1 en-us has no bl_poke_iridescent_hacker');
if (Object.keys(jokerLoc).length) loc.Joker = jokerLoc;
// loc_extra: other 3.9.1 loc entries the reworked jokers show ("Set.key": tooltips, alt texts, dictionary words).
for (const p of SPEC.loc_extra || []) {
  const [set, ...rest] = p.split('.'), key = rest.join('.');
  const src = set === 'dictionary' || set === 'v_dictionary' ? NEW.loc.misc && NEW.loc.misc[set] : NLOC[set];
  if (!src || src[key] === undefined) throw new Error(`loc_extra: 3.9.1 en-us has no ${p}`);
  (loc[set] || (loc[set] = {}))[key] = src[key];
}

const out = {
  version: '3.9.1',
  source: 'InertSteak/Pokermon tag 3.9.1 (GPL-3.0)',
  counts: { ...counts, jokers_changed: Object.keys(jokers).length, sprites: Object.keys(sprites).length, skipped: skipped.length },
  reworked: reworked.sort(), rework_hold: Object.entries(reworkHold), rework_deferred: Object.entries(reworkDeferred),
  jokers, sprites, sprite_hold: held, blinds, loc, skipped,
};
const json = JSON.stringify(out);
fs.writeFileSync(OUT, '// GENERATED by tools/micatro/gen_pokermon_391_overlay.mjs from the Pokermon 3.9.1 extract + tools/micatro/specs/pokermon_391_overlay.json.\r\n'
  + '// Never edit: change the spec and regenerate. Applied by index.js on top of data.js (3.2.1).\r\nexport default ' + json + ';\r\n');
console.log('wrote', OUT, JSON.stringify(out.counts));
