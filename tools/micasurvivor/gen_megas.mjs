// gen_megas.mjs — MicaSurvivor DLC D14: generates micasurvivor/js/data/mega-data.js (the Expedition's Mega Evolutions).
//   node tools/micasurvivor/gen_megas.mjs            (from the cached tools/micasurvivor/megas_pokeapi.json)
//   node tools/micasurvivor/gen_megas.mjs --fetch    (refresh the cache from PokéAPI first)
// Nothing is hand-typed that a data file already knows:
//   the Megas     PokéAPI's "-mega" varieties (https://pokeapi.co/api/v2/pokemon/<id>): their species, types and base stats
//                 (cached in megas_pokeapi.json, with the date). 97 varieties of 87 species (the owner's count); a League run
//                 uses 93: the colour / shape variants that are the same Mega (Magearna's Original Color, Tatsugiri's Droopy and
//                 Stretchy, Meowstic's female) fold into the base form's
//   the Primals   PokéAPI's "-primal" varieties (Primal Kyogre 10077, Primal Groudon 10078, cached with the Megas): they work
//                 exactly like a Mega here (the Lv-40 card, the elites and bosses) and are named "Primal ..." (kind: 'primal').
//                 2026-11-03: the generator used to read only "-mega", so both were missing
//   the art       EXISTING ART ONLY (owner): the overworld battle system's own Mega sprites, overworld/data/pokemon/s<num x 32 +
//                 form>.png (unused by the overworld so far; checked by eye, 2026-10-26: the 48 Megas of Gen 6-7). A Mega with no
//                 sprite there (the Legends Z-A ones, the Z forms) is COMPOSED at runtime from the member's own sheet plus the
//                 Mega aura and keystone drawn in code (js/expedition/mega.js): never a placeholder.
//                 2026-11-03: the 45 Legends Z-A / Mega Dimension Megas (Z forms included) have their own overworld battle
//                 sprites too (tools/gen_mega_sprites.py -> tools/data/mega_sprites.json: PokeAPI/sprites' pixel art, Mega
//                 Zygarde composed from the Legends Z-A renders), so all 93 now draw their own picture and none is composed
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'tools/micasurvivor/megas_pokeapi.json');
const OUT = path.join(ROOT, 'micasurvivor/js/data/mega-data.js');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;

if (process.argv.includes('--fetch')) {
  const list = await (await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000')).json();
  const forms = [];
  for (const r of list.results.filter(r => /-mega|-primal$/.test(r.name))) {
    const p = await (await fetch(r.url)).json();
    forms.push({ name: r.name, id: p.id, species: +p.species.url.split('/').slice(-2)[0], types: p.types.map(t => t.type.name), stats: p.stats.map(s => s.base_stat) });
  }
  fs.writeFileSync(CACHE, JSON.stringify({ source: 'https://pokeapi.co/api/v2/pokemon/<id> (the -mega and -primal varieties)', fetched: new Date().toISOString().slice(0, 10), forms }, null, 1) + '\n');
  console.log('fetched ' + forms.length + ' Mega varieties');
}
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

// the game's own tables
const ctx = { G: {}, console };
vm.createContext(ctx);
for (const f of ['micasurvivor/js/data/pokedex.js', 'micasurvivor/js/expedition/league-data.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { DEX_BY, EXP_LEAGUE_DATA: L } = ctx.G;
const FAM = {};
for (const m of L.members) { const st = [m.dex]; for (let i = 0; i < st.length; i++) for (const [to] of m.evo[st[i]] || []) if (!st.includes(to)) st.push(to); for (const d of st) FAM[d] = m.dex; }

// the same Mega in another colour / shape: one League Mega (the base form's)
const FOLD = new Set(['magearna-original-mega', 'tatsugiri-droopy-mega', 'tatsugiri-stretchy-mega', 'meowstic-female-mega']);
// the overworld battle sprites of the Megas (overworld/data/pokemon/s<num x 32 + form>.png): the form index of each, by eye
const SPRITE_FORM = { 'charizard-mega-x': 1, 'charizard-mega-y': 2, 'mewtwo-mega-x': 1, 'mewtwo-mega-y': 2 };
const ONE = [3, 9, 15, 18, 65, 80, 94, 115, 127, 130, 142, 181, 208, 212, 214, 229, 248, 254, 257, 260, 282, 302, 303, 306, 308, 310, 319, 323, 334, 354,
  359, 362, 373, 376, 380, 381, 382, 383, 384, 428, 445, 448, 460, 475, 531, 719];   // (form 1: the Gen 6-7 Mega or Primal; the Z forms of Absol / Garchomp / Lucario have none)
// the newer Megas' sprites (wave 2): PokéAPI id -> sprite, from tools/gen_mega_sprites.py's list
const WAVE2 = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/mega_sprites.json'), 'utf8')).megas
  .filter(m => m.wave === 2).map(m => [m.pokeapi, m.sprite]));
const suffix = n => { const m = /-mega-([xyz])$/.exec(n); return m ? m[1].toUpperCase() : ''; };

const megas = [];
for (const f of cache.forms) {
  if (FOLD.has(f.name)) continue;
  if (!DEX_BY[f.species]) throw new Error('no species ' + f.species + ' for ' + f.name);
  if (!FAM[f.species]) throw new Error(f.name + ': its species is in no League family');
  const suf = suffix(f.name);
  let form = SPRITE_FORM[f.name] || (ONE.includes(f.species) && suf !== 'Z' ? 1 : 0);
  let spr = form ? 's' + (f.species * 32 + form) + '.png' : WAVE2.get(f.id) || null;
  if (spr) {
    if (!fs.existsSync(path.join(AROOT, 'overworld/data/pokemon', spr))) throw new Error(f.name + ': no sprite ' + spr + ' (MAGEPUNK_ASSET_ROOT?)');
  }
  if (f.stats.length !== 6 || !f.types.length) throw new Error(f.name + ': bad data');
  megas.push({ id: f.id, sp: f.species, suf, types: f.types, base: f.stats, spr, ...(/-primal$/.test(f.name) ? { kind: 'primal' } : {}) });
}
megas.sort((a, b) => a.sp - b.sp || a.id - b.id);
const species = [...new Set(megas.map(m => m.sp))];
if (megas.length !== 95 || species.length !== 89 || megas.filter(m => m.kind === 'primal').length !== 2) throw new Error('Megas: ' + megas.length + ' of ' + species.length + ' species');

const J = o => JSON.stringify(o);
const lines = [
  "'use strict';",
  '/* ============ data/mega-data.js — GENERATED by tools/micasurvivor/gen_megas.mjs, do not edit by hand ============',
  ' * The Expedition\'s Mega Evolutions (MicaSurvivor DLC D14): ' + megas.length + ' Megas of ' + species.length + ' species (PokéAPI\'s -mega varieties, fetched ' + cache.fetched + ').',
  ' *   {id: the PokéAPI form id, sp: the species that Mega Evolves, suf: X / Y / Z or \'\', types, base: [hp, atk, def, spa, spd, spe],',
  ' *    spr: the overworld battle sprite (overworld/data/pokemon/<spr>), or null: composed at runtime (js/expedition/mega.js),',
  ' *    kind: "primal" for Primal Kyogre / Groudon (a Mega in every way but the name)}',
  ' */',
  'G.EXP_MEGA_DATA = [',
  ...megas.map((m, i) => '  ' + J(m) + (i < megas.length - 1 ? ',' : '')),
  '];',
  '',
];
fs.writeFileSync(OUT, lines.join('\r\n'));
console.log('wrote ' + path.relative(ROOT, OUT) + ': ' + megas.length + ' Megas of ' + species.length + ' species, ' + megas.filter(m => m.spr).length + ' with a battle sprite');
