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
//   jokers   {name: {rarity, cost, blueprint_compat, perishable_compat, eternal_compat, enhancement_gate, attributes, megas, config: {path: value}}}
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
//   new_jokers (new-jokers stack, sub-batch 11+: spec new_jokers {sub_batch: [names]}) jokers 3.9.1 adds, with their whole
//            3.9.1 static data: {name: {item, file, after, sub_batch}} (item = the 3.9.1 item, "__fn" markers kept; `after` =
//            the joker before it in 3.9.1's file order that the port has: index.js inserts it there). Their sprites and
//            Joker loc entries join `sprites` / `loc`. spec new_deferred {name: {why, drop?: [fields]}}: a new joker ported
//            without one 3.9.1 part (e.g. an item evolution into a joker of a later sub-batch); `drop` removes those static
//            fields and `text_drop` the text lines naming it until then (copied to data391.js new_deferred).
//            spec unregistered_sprites (sub-batch 15): jokers 3.9.1 writes but never registers (Hisuian Qwilfish / Overqwil) also
//            take their 3.9.1 sprite (the port defines the rest).
//   upstream_main (sub-batch 15b: spec upstream_main {repo, commit, version, date, new_jokers {sub_batch: [names]}}) a few
//            jokers upstream added on main AFTER 3.9.1, from a second extract (the main tree at that commit, same extractor):
//            each joins new_jokers (+ upstream: 'main') with main's static data, Joker loc entry, sprite, family and file
//            order. Nothing else is read from main. data391.js upstream_main records the pin.
//              node tools/micatro/gen_pokermon_391_overlay.mjs <tmp>/pokermon391.js <tmp>/pokermon_main.js
//   families 3.9.1's families (functions/pokefamily.lua, the extract's `family` global) that hold a new joker, minus the
//            names the port doesn't have yet (index.js adds them to systems/evolution.js `family`)
// It fails when a value change of an existing config key, or a blueprint_compat flip, has no decision in the spec.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/micatro/gen_pokermon_391_overlay.mjs <3.9.1 extract .js> [<upstream main extract .js>]'); process.exit(1); }
// Sub-batch 15b: the spec's upstream_main takes a few jokers from upstream main (post-3.9.1), pinned at upstream_main.commit; the
// extract of that tree is the second argument (same extractor + specs/pokermon_391.json). Nothing else is read from it.
const MAIN_SRC = process.argv[3];
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
    // batch 16: a reworked joker takes its 3.9.1 Mega list (`megas`), checked below against the registered jokers (a Mega
    // the port doesn't have yet would make the Mega Stone target a joker it can't evolve)
    if (J(a.megas) !== J(b.megas)) { put(name, 'megas', b.megas === undefined ? null : b.megas); count('megas'); }
    const key = 'j_poke_' + name, nl = NLOC.Joker && NLOC.Joker[key];
    // A joker whose loc_vars always names a form entry (Pumpkaboo / Gourgeist: j_poke_<name>_<form>, batch 8) has no
    // entry of its own: it takes its forms' entries (keys key_*, minus other jokers' own keys).
    const forms = nl ? [key] : Object.keys((NLOC.Joker) || {}).filter((k) => k.startsWith(key + '_') && !NJ[k.slice(7)]);
    if (!forms.length) throw new Error(`3.9.1 en-us has no ${key}`);
    for (const k of forms) if (J(NLOC.Joker[k]) !== J(BLOC.Joker && BLOC.Joker[k])) { jokerLoc[k] = NLOC.Joker[k]; count('loc'); }
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

// ---- new jokers (the new-jokers stack): the whole 3.9.1 static data of the jokers the spec lists
const NEWSPEC = SPEC.new_jokers || {}, newDeferred = SPEC.new_deferred || {};
const newNames = new Map();
for (const [sub, names] of Object.entries(NEWSPEC)) for (const name of names) {
  if (BJ[name]) throw new Error(`new_jokers: '${name}' is a 3.2.1 joker`);
  if (!NJ[name]) throw new Error(`new_jokers: 3.9.1 has no joker '${name}'`);
  if (newNames.has(name)) throw new Error(`new_jokers: '${name}' listed twice`);
  newNames.set(name, sub);
}
for (const name of Object.keys(newDeferred)) if (!newNames.has(name)) throw new Error(`new_deferred: '${name}' is not in new_jokers`);
const new_jokers = {};
{
  let prev = null;
  for (const f of NEW.groups.jokers || []) for (const it of listOf(f)) {
    const name = it.name || it.key;
    if (newNames.has(name)) {
      const item = JSON.parse(JSON.stringify(it));
      for (const k of (newDeferred[name] && newDeferred[name].drop) || []) delete item[k];
      new_jokers[name] = { item, file: f.file, after: prev, sub_batch: newNames.get(name) };
      const key = 'j_poke_' + name;
      if (!NLOC.Joker || !NLOC.Joker[key]) throw new Error(`3.9.1 en-us has no ${key}`);
      const loc = JSON.parse(JSON.stringify(NLOC.Joker[key]));
      // new_deferred text_drop: the text lines naming the deferred part (e.g. "(Evolves with a Dawn Stone)") wait with it
      for (const t of (newDeferred[name] && newDeferred[name].text_drop) || []) {
        const n = loc.text.length;
        loc.text = loc.text.filter((l) => !l.includes(t));
        if (loc.text.length !== n - 1) throw new Error(`new_deferred ${name}: text_drop '${t}' must match exactly one line`);
      }
      jokerLoc[key] = loc; count('new_loc');
    }
    if (BJ[name] || newNames.has(name)) prev = name;
  }
}
// ---- jokers from upstream main (sub-batch 15b: spec upstream_main {commit, version, new_jokers {sub_batch: [names]}}): jokers
// upstream added AFTER 3.9.1. Each takes its whole static data, Joker loc entry, sprite and family from the main extract, and
// `after` from main's file order. Only these names are read from main: the rest of main's changes are drift (PORTING.md).
const UM = SPEC.upstream_main || null;
const mainNames = new Map();
for (const [sub, names] of Object.entries((UM && UM.new_jokers) || {})) for (const name of names) {
  if (mainNames.has(name)) throw new Error(`upstream_main: '${name}' listed twice`);
  mainNames.set(name, sub);
}
let MAIN = null;
if (mainNames.size) {
  if (!MAIN_SRC) throw new Error('the spec takes jokers from upstream main (upstream_main): pass its extract as the second argument');
  MAIN = (await import(pathToFileURL(path.resolve(MAIN_SRC)).href)).default;
  if (MAIN.errors && MAIN.errors.length) throw new Error('the upstream main extract has errors: ' + MAIN.errors.join('; '));
  const MJ = items(MAIN, 'jokers'), MLOC = MAIN.loc.descriptions;
  for (const name of mainNames.keys()) {
    if (BJ[name] || NJ[name]) throw new Error(`upstream_main: '${name}' is already in 3.9.1 (or 3.2.1)`);
    if (newNames.has(name)) throw new Error(`upstream_main: '${name}' is also in new_jokers`);
    if (!MJ[name]) throw new Error(`upstream_main: main has no joker '${name}'`);
    if (newDeferred[name]) throw new Error(`new_deferred: '${name}' is an upstream_main joker (not supported)`);
  }
  let prev = null;
  for (const f of MAIN.groups.jokers || []) for (const it of listOf(f)) {
    const name = it.name || it.key;
    if (mainNames.has(name)) {
      new_jokers[name] = { item: JSON.parse(JSON.stringify(it)), file: f.file, after: prev, sub_batch: mainNames.get(name), upstream: 'main' };
      const key = 'j_poke_' + name;
      if (!MLOC.Joker || !MLOC.Joker[key]) throw new Error(`main en-us has no ${key}`);
      jokerLoc[key] = JSON.parse(JSON.stringify(MLOC.Joker[key])); count('new_loc');
    }
    if (BJ[name] || newNames.has(name) || mainNames.has(name)) prev = name;
  }
}
counts.new_jokers = Object.keys(new_jokers).length;
// 3.9.1 families holding a new joker, minus the names the port doesn't have yet (later sub-batches add them back); then main's
// families holding an upstream_main joker
const families = [];
const have = (n) => BJ[n] || newNames.has(n) || mainNames.has(n);
const famSeen = new Set();
for (const [list, takes] of [[NEW.globals.family || [], newNames], [(MAIN && MAIN.globals.family) || [], mainNames]]) {
  for (const fam of list) {
    const names = fam.map((y) => (typeof y === 'string' ? y : y.key));
    if (!names.some((n) => takes.has(n))) continue;
    const kept = fam.filter((y) => have(typeof y === 'string' ? y : y.key));
    if (famSeen.has(JSON.stringify(kept))) continue;
    famSeen.add(JSON.stringify(kept));
    families.push(kept);
  }
}
if (newNames.size && !(NEW.globals.family || []).length) throw new Error('the 3.9.1 extract has no family global (specs/pokermon_391.json)');
if (missing.length) { console.error('no decision (take it or give a reason in the spec):\n  ' + missing.join('\n  ')); process.exit(1); }

// ---- sprites (3.9.1 functions/pokespriteload.lua; get_atlas_string: gen_atlas is the gen number now)
const SPR = {};
for (const s of (NEW.globals.PokemonSprites && NEW.globals.PokemonSprites.list) || []) SPR[s.name] = s;
const sprites = {}, held = [];
// unregistered_sprites (sub-batch 15): jokers 3.9.1 writes but never registers (the port defines them in full) take their sprite too
const UNREG = SPEC.unregistered_sprites || [];
for (const name of UNREG) if (BJ[name] || NJ[name] || !SPR[name]) throw new Error(`unregistered_sprites: '${name}' is registered by 3.9.1 or has no 3.9.1 sprite`);
// (an upstream_main joker takes main's pokespriteload.lua entry)
const MSPR = {};
for (const s of (MAIN && MAIN.globals.PokemonSprites && MAIN.globals.PokemonSprites.list) || []) MSPR[s.name] = s;
for (const name of [...Object.keys(BJ), ...Object.keys(new_jokers), ...UNREG]) {
  const s = mainNames.has(name) ? MSPR[name] : SPR[name];
  if (!s) continue;
  if (SPEC.sprite_hold && SPEC.sprite_hold[name]) { held.push([name, SPEC.sprite_hold[name]]); continue; }
  const g = typeof s.gen_atlas === 'number' ? s.gen_atlas : s.gen_atlas ? (BJ[name] ? BJ[name].it : new_jokers[name] ? new_jokers[name].item : {}).gen : null;
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
  const src = set === 'dictionary' || set === 'v_dictionary' || set === 'labels' ? NEW.loc.misc && NEW.loc.misc[set] : NLOC[set];
  if (!src || src[key] === undefined) throw new Error(`loc_extra: 3.9.1 en-us has no ${p}`);
  (loc[set] || (loc[set] = {}))[key] = src[key];
}

const out = {
  version: '3.9.1',
  source: 'InertSteak/Pokermon tag 3.9.1 (GPL-3.0)',
  counts: { ...counts, jokers_changed: Object.keys(jokers).length, sprites: Object.keys(sprites).length, skipped: skipped.length },
  reworked: reworked.sort(), rework_hold: Object.entries(reworkHold), rework_deferred: Object.entries(reworkDeferred),
  jokers, sprites, sprite_hold: held, blinds, loc, skipped,
  new_jokers, new_deferred: Object.entries(newDeferred).map(([n, d]) => [n, d.why, d.drop || []]), families,
};
if (mainNames.size) {
  out.upstream_main = { repo: UM.repo, commit: UM.commit, version: UM.version, date: UM.date, jokers: [...mainNames.keys()] };
  out.source += `; + ${mainNames.size} jokers from ${UM.repo} main @ ${String(UM.commit).slice(0, 7)} (${UM.version})`;
}
for (const name of Object.keys(new_jokers)) if (!sprites[name]) throw new Error(`3.9.1 has no sprite for the new joker '${name}'`);
for (const [name, o] of Object.entries(jokers)) for (const m of o.megas || []) if (!BJ[m] && !new_jokers[m]) throw new Error(`megas: ${name}'s Mega '${m}' is not a registered joker (add it to new_jokers)`);
for (const [name, { item }] of Object.entries(new_jokers)) for (const m of item.megas || []) if (!BJ[m] && !new_jokers[m]) throw new Error(`megas: ${name}'s Mega '${m}' is not a registered joker (add it to new_jokers or new_deferred drop)`);
const json = JSON.stringify(out);
fs.writeFileSync(OUT, '// GENERATED by tools/micatro/gen_pokermon_391_overlay.mjs from the Pokermon 3.9.1 extract + tools/micatro/specs/pokermon_391_overlay.json.\r\n'
  + '// Never edit: change the spec and regenerate. Applied by index.js on top of data.js (3.2.1).\r\nexport default ' + json + ';\r\n');
console.log('wrote', OUT, JSON.stringify(out.counts));
