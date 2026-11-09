// designwiki_joker_forms_test.mjs — the design wiki lists every form of a Micatro joker (tools/micatro/designwiki_forms.mjs,
// put on each joker's item as `forms` by tools/micatro/gen_designwiki_mods.mjs; designwiki/app.js mcForms draws the "Forms" box).
//   1. Deoxys: all four formes (Normal / Attack / Defense / Speed), each with its own resolved text (Attack: DNA copies gain a
//      permanent X0.25 Mult; Defense: $2 at end of round; Speed: +40 Chips; Normal: adds the DNA Seal) and its own floating
//      sprite; the card's info still names the Meteorite (cycles the formes) and the DNA Seal (applies the bonus).
//   2. generic: EVERY joker with alternate loc keys (descriptions.Joker '<key>_<suffix>' that are not cards of their own and that its
//      not in a mod's upstream card data — designwiki_forms.mjs altKeysOf) lists each one as a form, with its text; every form has a name and either
//      text, `cosmetic` or `state`; the owner's list of form-changing jokers each has a Forms section.
//   3. the data is what the resolver gives now (run against the live mods): no drift.
//   node overworld/tests/designwiki_joker_forms_test.mjs        (regen: node tools/micatro/gen_designwiki.mjs)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const REGEN = 'regen: node tools/micatro/gen_designwiki.mjs';

globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
const core = await imp('micatro/js/engine/core.js');
const IDX = await imp('micatro/js/mods/index.js');
const REG = await imp('micatro/js/mods/registry.js');
await IDX.loadMods(IDX.AVAILABLE.map((m) => m.id));
REG.activateMods(IDX.AVAILABLE.map((m) => m.id));

// every joker item of every mod file
const items = new Map();
for (const m of IDX.AVAILABLE) {
  const f = path.join(ROOT, 'designwiki/data/micatro_mods', m.id + '.json');
  if (!fs.existsSync(f)) continue;
  for (const s of JSON.parse(fs.readFileSync(f, 'utf8')).sections) if (s.id === 'jokers') for (const it of s.items) items.set(it.key, it);
}

// ---------- 1. Deoxys
const dx = items.get('j_poke_deoxys') || {};
const F = dx.forms || [];
const byName = Object.fromEntries(F.map((f) => [f.name, f]));
const txt = (f) => ((f && f.lines) || []).join(' ');
A(F.length === 4 && ['Normal', 'Attack', 'Defense', 'Speed'].every((n) => byName[n]), 'Deoxys: all four formes listed (Normal / Attack / Defense / Speed)', JSON.stringify(F.map((f) => f.name)) + ' — ' + REGEN);
A(byName.Normal && byName.Normal.base && /DNA\{\} seal/.test(txt(byName.Normal)), 'Deoxys Normal (the card as bought): adds the DNA Seal', txt(byName.Normal));
A(byName.Attack && byName.Attack.key === 'j_poke_deoxys_attack' && /X0\.25\{\} Mult/.test(txt(byName.Attack)) && /permanent/.test(txt(byName.Attack)), 'Deoxys Attack: DNA copies gain a permanent X0.25 Mult (its loc key, vars resolved)', txt(byName.Attack));
A(byName.Defense && byName.Defense.key === 'j_poke_deoxys_defense' && /\$2\{\} payout/.test(txt(byName.Defense)) && /end of round/.test(txt(byName.Defense)), 'Deoxys Defense: $2 at end of round', txt(byName.Defense));
A(byName.Speed && byName.Speed.key === 'j_poke_deoxys_speed' && /\+40\{\} Chips/.test(txt(byName.Speed)), 'Deoxys Speed: +40 Chips', txt(byName.Speed));
const souls = ['Attack', 'Defense', 'Speed'].map((n) => byName[n] && byName[n].art && JSON.stringify(byName[n].art[0]));
A(souls.every(Boolean) && new Set(souls).size === 3, "Deoxys: each forme has its own art (the forme's floating sprite)", JSON.stringify(souls));
A((dx.info || []).some((i) => i.name === 'Meteorite') && (dx.info || []).some((i) => i.name === 'DNA Seal'), 'Deoxys: its info names the Meteorite and the DNA Seal');

// ---------- 2. generic: every alternate loc key is a listed form
const { altKeysOf, loadRawCards } = await imp('tools/micatro/designwiki_forms.mjs');
await loadRawCards(ROOT);
const JD = REG.MOD_LOC.descriptions.Joker || {};
let fams = 0; const famKeys = [];
const missing = [];
for (const [key, it] of items) {
  const alts = altKeysOf(core.P_CENTERS[key], JD, core.P_CENTERS);
  if (!alts.length) continue;
  fams++; famKeys.push(key);
  for (const k of alts) {
    const f = (it.forms || []).find((x) => (x.key || key) === k);
    if (!f || !((f.lines && f.lines.length) || f.cosmetic)) missing.push(k);
  }
}
A(fams >= 18 && !missing.length, `every joker with alternate loc keys (${fams}) lists each one as a form, with its text`, missing.join(', ') + ' [' + famKeys.join(' ') + ']' + ' — ' + REGEN);
const all = [...items.values()].filter((it) => it.forms);
const bad = all.filter((it) => it.forms.length < 2 || it.forms.filter((f) => f.base).length !== 1 || it.forms.some((f) => !f.name || !((f.lines && f.lines.length) || f.cosmetic || f.state)));
A(all.length >= 50 && !bad.length, `every form section (${all.length} jokers) has one base form and each form a name + text / cosmetic / state`, bad.map((x) => x.key).join(', '));
const OWNER = ['castform', 'oricorio', 'silvally', 'meloetta', 'ogerpon', 'zygarde', 'wishiwashi', 'morpeko', 'eiscue', 'toxtricity', 'indeedee', 'meowstic', 'salandit',
  'basculin', 'flabebe', 'vivillon', 'furfrou', 'paldean_tauros', 'kyurem', 'necrozma', 'hoopa', 'tornadus', 'thundurus', 'landorus', 'enamorus', 'keldeo', 'giratina',
  'galarian_darmanitan', 'shellos', 'burmy', 'wormadam', 'cherrim', 'pumpkaboo', 'tatsugiri', 'unown', 'alcremie', 'deerling'];
const noForms = OWNER.filter((n) => !(items.get('j_poke_' + n) || {}).forms);
A(!noForms.length, `the form-changing jokers (${OWNER.length}: Castform's forecast, Oricorio's styles, Silvally's memories, ...) each have a Forms section`, noForms.join(', '));
const viv = items.get('j_poke_vivillon');
A(viv && viv.forms.length === 20 && viv.forms.filter((f) => f.cosmetic).length === 19, 'Vivillon: 20 patterns, the 19 others cosmetic (same text)', viv && JSON.stringify(viv.forms.map((f) => f.name + (f.cosmetic ? '·c' : ''))));

// ---------- 3. no drift: the resolver run now gives the same forms
const { makeFormsOf } = await imp('tools/micatro/designwiki_forms.mjs');
const { describe } = await imp('micatro/js/engine/describe.js');
const { init_game_object, STATES, HANDLIST } = await imp('micatro/js/engine/run.js');
const G = core.G;
for (const k of Object.keys(G)) delete G[k];
G.STATES = STATES; G.E_MANAGER = core.E_MANAGER; G.handlist = HANDLIST; G.GAME = init_game_object();
const formsOf = await makeFormsOf({ ROOT, G, P_CENTERS: core.P_CENTERS, MOD_LOC: REG.MOD_LOC, describe });
const drift = [];
for (const k of ['j_poke_deoxys', 'j_poke_castform', 'j_poke_eiscue', 'j_poke_toxtricity', 'j_poke_zygarde', 'j_bunc_cassette']) {
  const now = formsOf(core.P_CENTERS[k]);
  const names = ((now && now.forms) || []).map((f) => f.name).join();
  if (names !== ((items.get(k) || {}).forms || []).map((f) => f.name).join()) drift.push(k + ': ' + names);
}
A(!drift.length, "the wiki's forms are what the resolver gives now (no drift)", drift.join(' | ') + ' — ' + REGEN);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
