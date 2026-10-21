// gen_league.mjs — MicaSurvivor DLC D4: generates micasurvivor/js/expedition/league-data.js (the Expedition League).
//   node tools/micasurvivor/gen_league.mjs
// Nothing is hand-typed that a data file already knows:
//   evolutions   overworld/data/species_extra.json `evos` (the overworld's own evolution tables), plus SUPPLEMENT below:
//                the 7 newer-generation evolutions those Gen 1-4 tables don't carry (each one cited)
//   base stats   overworld/data/species_battle.json `baseStats` (hp, atk, def, spa, spd, spe) by national dex `num`
//   learnsets    species_battle.json `learnset` (level-up) + species_extra.json `learn` (everything a species can learn):
//                a kit is 4 of MicaSurvivor's own 66 moves (owner decision #12: hand-picked from our move set), scored
//                by what the line really learns; HAND overrides the picks where the score alone reads wrong
//   types, names G.DEX (micasurvivor/js/data/pokedex.js); the abilities (class passives) are G.Abilities at runtime
// The roster (owner, 2026-10-19, Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md): 249 League entries. D4 builds 78 of them
// (BUILT below); the other 171 are STUBS with the batch that builds them (D4b / D4c / D4d).
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MS = path.join(ROOT, 'micasurvivor/js');
const OUT = path.join(MS, 'expedition/league-data.js');

// ---------------- the game's own tables (loaded as the browser would) ----------------
const ctx = { G: {}, console };
vm.createContext(ctx);
for (const f of ['data/pokedex.js', 'data/moves.js']) vm.runInContext(fs.readFileSync(path.join(MS, f), 'utf8'), ctx, { filename: f });
const { DEX_BY, Moves } = ctx.G;
const battle = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_extra.json'), 'utf8'));

// national dex -> the overworld's species key (the base form: the shortest key with that number)
const KEY = {};
for (const [k, s] of Object.entries(battle)) if (s.num > 0 && s.num <= 1025 && (!KEY[s.num] || k.length < KEY[s.num].length)) KEY[s.num] = k;
const numOf = k => (battle[k] && battle[k].num) || 0;

// ---------------- the roster ----------------
// BUILT (78): D4a's 62 three-stage Gen 1-4 families, the 11 Gen 1-2 Mega families (D4c's first part: every evolution
// shape the League needs, and the first members that never evolve), the 5 Kanto legendaries (D4d's first part: the
// Expedition's own launch-map legendaries, Mew at the Viridian shrine and Zapdos at Cerulean Cape).
const D4A = [1, 4, 7, 10, 13, 16, 29, 32, 41, 43, 56, 60, 63, 66, 69, 74, 81, 92, 111, 116, 137, 147,   // Gen 1 (22)
  152, 155, 158, 172, 173, 174, 175, 179, 187, 216, 220, 239, 240, 246,                               // Gen 2 (14)
  252, 255, 258, 263, 265, 270, 273, 280, 287, 293, 298, 304, 328, 355, 363, 371, 374,                 // Gen 3 (17)
  387, 390, 393, 396, 403, 406, 439, 440, 443];                                                        // Gen 4 (9)
const MEGA12 = [79, 115, 120, 127, 129, 142, 95, 123, 214, 227, 228];                                   // Gen 1-2 Mega families (11)
const LEG1 = [144, 145, 146, 150, 151];                                                                // Kanto legendaries (5)
// STUBS (171): built by later batches
const D4B = [495, 498, 501, 506, 519, 524, 532, 535, 540, 543, 551, 574, 577, 582, 599, 602, 607, 610, 624, 633,
  650, 653, 656, 661, 664, 669, 679, 704, 722, 725, 728, 731, 736, 761, 782, 789, 810, 813, 816, 821, 824, 837, 840,
  856, 859, 885, 906, 909, 912, 921, 928, 932, 957, 996];
// the other Mega families (the owner's list counts Snorunt twice, as Glalie and as Froslass: one family, two Megas)
const MEGA_REST = [302, 303, 307, 309, 318, 322, 333, 353, 433, 359, 361, 427, 447, 459, 361, 529, 531, 559, 622, 667,
  677, 686, 688, 690, 701, 739, 767, 780, 870, 951, 969, 978];
const LEG_ALL = Object.values(DEX_BY).filter(p => p.leg).map(p => p.dex);
const LEG_REST = LEG_ALL.filter(d => !LEG1.includes(d) && !(d >= 789 && d <= 792));   // (Cosmog's line is three-stage: D4b)
const STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393];   // the starter trios: free (owner)

// ---------------- evolutions ----------------
// The 7 the overworld tables (Gen 1-4 era) don't carry, from the games' own rules (Bulbapedia "Evolution" pages):
const SUPPLEMENT = {
  linoone: [{ type: 'level', param: 35, target: 'obstagoon' }],   // Gen 8 (Galarian Linoone, Lv 35 at night)
  primeape: [{ type: 'move', param: 'ragefist', target: 'annihilape' }],   // Gen 9 (Rage Fist 20 times)
  ursaring: [{ type: 'item', param: 'peatblock', target: 'ursaluna' }],   // Legends: Arceus (Peat Block, full moon)
  piloswine: [{ type: 'move', param: 'ancientpower', target: 'mamoswine' }],   // Gen 4 (level up knowing Ancient Power)
  mimejr: [{ type: 'move', param: 'mimic', target: 'mrmime' }],   // Gen 4 (level up knowing Mimic)
  mrmime: [{ type: 'level', param: 42, target: 'mrrime' }],   // Gen 8 (Galarian Mr. Mime, Lv 42)
  scyther: [{ type: 'item', param: 'blackaugurite', target: 'kleavor' }],   // Legends: Arceus (Black Augurite)
};
const evosOf = k => (extra[k] && extra[k].evos || []).concat(SUPPLEMENT[k] || []);
// PokéBonk's level overrides (study 2.1): the bug lines that evolve twice before Lv 10 go at 8 / 36; Magikarp at 40.
const OVERRIDE = { metapod: 8, butterfree: 36, kakuna: 8, beedrill: 36, silcoon: 8, cascoon: 8, beautifly: 36, dustox: 36, gyarados: 40 };
/**
 * The evolution tree of a family: {dex: [[toDex, level], ...]}. A level evolution keeps its level; a stone / trade /
 * friendship / move one gets a level (study 2.1: "stones mapped to a level"): 18 from a base form of a three-stage
 * family (the babies), 30 from a two-stage one, 36 from a middle stage; never sooner than 6 levels after the stage
 * before. Branches (two or more targets) become an in-run choice at the earliest of their levels.
 */
function treeOf(base) {
  const tree = {}, stageLv = { [base]: 0 }, seen = new Set([base]);
  const depth = k => { let d = 0; const q = [[k, 0]]; while (q.length) { const [x, n] = q.shift(); d = Math.max(d, n); for (const e of evosOf(x)) if (numOf(e.target) && numOf(e.target) !== numOf(x)) q.push([e.target, n + 1]); } return d; };
  const stages = depth(KEY[base]) + 1;
  const walk = (k, stage) => {
    const from = numOf(k), out = [];
    for (const e of evosOf(k)) {
      const to = numOf(e.target);
      if (!to || to > 1025 || seen.has(to) || !DEX_BY[to] || KEY[to] !== e.target) continue;   // (forms: Lycanroc Midnight, Toxtricity Low Key, Wormadam's cloaks...)
      seen.add(to);
      let lv = e.type === 'level' ? e.param : stage === 0 ? (stages >= 3 ? 18 : 30) : 36;
      if (OVERRIDE[e.target]) lv = OVERRIDE[e.target];
      lv = Math.max(lv, (stageLv[from] || 0) + 6);
      stageLv[to] = lv;
      out.push([to, lv]);
      walk(e.target, stage + 1);
    }
    if (out.length) tree[from] = out;
  };
  walk(KEY[base], 0);
  return tree;
}

// ---------------- kits ----------------
const sid = id => id.replace(/-/g, '');
const MOVES = Moves.ALL;
const BUFF = new Set(MOVES.filter(m => m.kind === 'buff').map(m => m.id));
// Hand picks (owner #12: "hand-picked"): where the learnset score alone reads wrong, or a signature feel matters.
// Order = unlock order (levels 1 / 2 / 4 / 7).
const HAND = {
  1: ['vine-whip', 'razor-leaf', 'toxic', 'leaf-storm'],            // Bulbasaur: the Healer
  4: ['ember', 'flame-wheel', 'flamethrower', 'wing-attack'],       // Charmander
  7: ['water-gun', 'bubble', 'aqua-ring', 'hydro-pump'],            // Squirtle: the Defender
  10: ['bug-bite', 'string-shot', 'gust', 'psybeam'],               // Caterpie (Butterfree)
  13: ['poison-sting', 'bug-bite', 'toxic-spikes', 'agility'],      // Weedle (Beedrill)
  16: ['gust', 'quick-attack', 'wing-attack', 'aerial-ace'],        // Pidgey
  63: ['confusion', 'psycho-cut', 'psybeam', 'psychic'],            // Abra
  92: ['lick', 'hex', 'shadow-ball', 'hypnosis'],                   // Gastly (Gengar)
  129: ['tackle', 'bubble', 'bite', 'hydro-pump'],                  // Magikarp: Splash-weak until Gyarados
  137: ['thunder-shock', 'psybeam', 'ice-beam', 'substitute'],      // Porygon
  147: ['dragon-rage', 'thunderbolt', 'aqua-ring', 'dragon-dance'], // Dratini
  150: ['confusion', 'psychic', 'aura-sphere', 'psycho-cut'],       // Mewtwo
  151: ['psycho-cut', 'aura-sphere', 'shadow-ball', 'psychic'],     // Mew
  144: ['powder-snow', 'gust', 'ice-beam', 'hail'],                 // Articuno
  145: ['thunder-shock', 'aerial-ace', 'thunderbolt', 'discharge'], // Zapdos
  146: ['ember', 'wing-attack', 'fire-spin', 'heat-wave'],          // Moltres
  172: ['thunder-shock', 'quick-attack', 'thunderbolt', 'discharge'], // Pichu (Pikachu, Raichu)
  175: ['fairy-wind', 'psybeam', 'aerial-ace', 'dazzling-gleam'],   // Togepi
  280: ['confusion', 'fairy-wind', 'hypnosis', 'psychic'],          // Ralts
  374: ['metal-claw', 'confusion', 'meteor-mash', 'flash-cannon'],  // Beldum
  443: ['dragon-rage', 'bulldoze', 'metal-claw', 'dragon-dance'],   // Gible
  246: ['bite', 'rock-throw', 'rock-slide', 'dark-pulse'],          // Larvitar
  371: ['dragon-rage', 'bite', 'flamethrower', 'aerial-ace'],       // Bagon
  // (the score picked a filler Normal move, or a buff where the line has a better move of its own)
  41: ['poison-sting', 'wing-attack', 'aerial-ace', 'toxic'],       // Zubat
  56: ['karate-chop', 'quick-attack', 'aura-sphere', 'shadow-ball'], // Mankey (Annihilape: Ghost)
  66: ['karate-chop', 'body-slam', 'aura-sphere', 'harden'],        // Machop
  74: ['rock-throw', 'bulldoze', 'rock-slide', 'harden'],           // Geodude
  79: ['water-gun', 'confusion', 'psychic', 'hydro-pump'],          // Slowpoke
  81: ['thunder-shock', 'flash-cannon', 'discharge', 'thunderbolt'], // Magnemite
  111: ['rock-throw', 'bulldoze', 'rock-slide', 'spikes'],          // Rhyhorn
  120: ['water-gun', 'psybeam', 'bubble-beam', 'hydro-pump'],       // Staryu
  123: ['bug-bite', 'aerial-ace', 'swords-dance', 'metal-claw'],    // Scyther (Scizor / Kleavor)
  127: ['bug-bite', 'bug-buzz', 'swords-dance', 'string-shot'],     // Pinsir
  152: ['razor-leaf', 'vine-whip', 'giga-drain', 'leaf-storm'],     // Chikorita
  155: ['ember', 'flame-wheel', 'flamethrower', 'heat-wave'],       // Cyndaquil
  158: ['water-gun', 'bite', 'bubble-beam', 'hydro-pump'],          // Totodile
  179: ['thunder-shock', 'discharge', 'thunderbolt', 'body-slam'],  // Mareep
  214: ['bug-bite', 'karate-chop', 'aura-sphere', 'bug-buzz'],      // Heracross
  220: ['powder-snow', 'mud-shot', 'hail', 'bulldoze'],             // Swinub
  252: ['razor-leaf', 'quick-attack', 'giga-drain', 'leaf-storm'],  // Treecko
  258: ['water-gun', 'mud-shot', 'hydro-pump', 'bulldoze'],         // Mudkip
  270: ['water-gun', 'giga-drain', 'bubble', 'leaf-storm'],         // Lotad
  273: ['razor-leaf', 'bite', 'giga-drain', 'dark-pulse'],          // Seedot
  298: ['tackle', 'bubble', 'water-gun', 'dazzling-gleam'],         // Azurill
  355: ['lick', 'hex', 'shadow-ball', 'will-o-wisp'],               // Duskull
  387: ['razor-leaf', 'bulldoze', 'leaf-storm', 'giga-drain'],      // Turtwig
  403: ['thunder-shock', 'bite', 'discharge', 'thunderbolt'],       // Shinx
};
/** The line's species keys (every stage of the tree, base first). */
function stagesOf(base, tree) { const out = [base], q = [base]; while (q.length) { const d = q.shift(); for (const [to] of tree[d] || []) { out.push(to); q.push(to); } } return out; }
/** A kit: 4 distinct moves of ours the line learns, kit[0] a damaging move of the base form's first type. */
function kitOf(base, tree) {
  if (HAND[base]) return HAND[base];
  const line = stagesOf(base, tree), types = [];
  for (const d of line) for (const t of DEX_BY[d].types) if (!types.includes(t)) types.push(t);
  const lvl = {}, any = new Set();
  for (const d of line) {
    const k = KEY[d], b = battle[k], x = extra[k];
    for (const [l, m] of (b && b.learnset) || []) if (lvl[m] == null || l < lvl[m]) lvl[m] = l;
    for (const m of (x && x.learn) || []) any.add(m);
  }
  const score = m => {
    const s = sid(m.id);
    let v = lvl[s] != null ? 6 - Math.min(4, lvl[s] / 12) : any.has(s) ? 2 : 0;
    if (types.includes(m.type)) v += 3; else if (m.type !== 'normal') v -= 6;
    if (m.type === DEX_BY[base].types[0]) v += 1;
    return v;
  };
  const cand = MOVES.filter(m => score(m) > 0).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const t0 = DEX_BY[base].types[0];
  const first = cand.find(m => m.type === t0 && !BUFF.has(m.id) && lvl[sid(m.id)] != null && lvl[sid(m.id)] <= 20)
    || cand.find(m => m.type === t0 && !BUFF.has(m.id)) || MOVES.find(m => m.id === Moves.startFor(DEX_BY[base]));
  const kit = [first.id];
  // the rest: best score, a new kind, a type not covered yet, at most one buff
  while (kit.length < 4) {
    const kinds = kit.map(id => Moves.BY_ID[id].kind), tys = kit.map(id => Moves.BY_ID[id].type);
    let best = null, bv = -1e9;
    for (const m of cand.concat(MOVES)) {
      if (kit.includes(m.id) || (BUFF.has(m.id) && kit.some(id => BUFF.has(id)))) continue;
      if (!types.includes(m.type) && m.type !== 'normal') continue;
      let v = score(m) + (kinds.includes(m.kind) ? -3 : 0) + (!tys.includes(m.type) && types.includes(m.type) ? 3 : 0) + (BUFF.has(m.id) ? -2 : 0);
      if (tys.filter(t => t === m.type).length >= 2) v -= 3;
      if (v > bv) { bv = v; best = m; }
    }
    kit.push(best.id);
  }
  return kit;
}

// ---------------- roles, ranks and challenges ----------------
const bs = d => { const s = battle[KEY[d]].baseStats; return [s.hp, s.atk, s.def, s.spa, s.spd, s.spe]; };
/** The class role from the final stage's base stats (PokéBonk's role names: Healer, Assault, Defender + Speedster). */
function roleOf(final) {
  const [hp, atk, def, spa, spd, spe] = bs(final), t = DEX_BY[final].types;
  const heal = hp + (t.includes('grass') || t.includes('fairy') ? 25 : 0);
  const r = [['assault', Math.max(atk, spa)], ['defender', (def + spd) / 2], ['healer', heal], ['speedster', spe]];
  r.sort((a, b) => b[1] - a[1]);
  return r[0][0];
}
const bstOf = d => bs(d).reduce((a, b) => a + b, 0);
function rankOf(base, finalBst) {
  if (STARTERS.includes(base)) return 'starter';
  if (DEX_BY[base].leg) return 'legendary';
  return finalBst >= 535 ? 'rare' : finalBst >= 470 ? 'uncommon' : 'common';
}
// challenge = {k: kind, n, t?} or {all: [...]}: what the Expedition save must show (js/expedition/league.js progress()).
//   runs  Expedition runs finished     zone  furthest zone reached      wins  maps won
//   ko    KOs in Expedition runs       kot   KOs with a member of type t guard guardians beaten
//   evo   evolutions in runs           mat   Maturity reached (1 / 2)   lv    a run's best level
//   league  League members you can play
const ROT = {
  common: [t => ({ k: 'runs', n: 1 }), t => ({ k: 'kot', t, n: 150 }), t => ({ k: 'zone', n: 2 }), t => ({ k: 'lv', n: 12 }), t => ({ k: 'runs', n: 3 })],
  uncommon: [t => ({ k: 'kot', t, n: 500 }), t => ({ k: 'guard', n: 2 }), t => ({ k: 'evo', n: 2 }), t => ({ k: 'lv', n: 20 }), t => ({ k: 'zone', n: 3 })],
  rare: [t => ({ k: 'wins', n: 1 }), t => ({ k: 'guard', n: 6 }), t => ({ k: 'evo', n: 5 }), t => ({ k: 'lv', n: 30 }), t => ({ k: 'kot', t, n: 1500 })],
};
const LEGEND_CH = {
  151: { k: 'wins', n: 3 },                                                     // Mew: beat it at its shrine 3 times
  144: { all: [{ k: 'kot', t: 'ice', n: 1000 }, { k: 'wins', n: 1 }] },          // Articuno
  145: { all: [{ k: 'kot', t: 'electric', n: 1000 }, { k: 'wins', n: 1 }] },     // Zapdos
  146: { all: [{ k: 'kot', t: 'fire', n: 1000 }, { k: 'wins', n: 1 }] },         // Moltres
  150: { all: [{ k: 'league', n: 30 }, { k: 'wins', n: 5 }] },                  // Mewtwo
};
const PSEUDO = new Set([147, 246, 371, 374, 443]);   // the 600-BST lines: a win AND a long run

// ---------------- build ----------------
const built = [...D4A, ...MEGA12, ...LEG1];
if (built.length !== 78 || new Set(built).size !== 78) throw new Error('roster: ' + built.length);
const base = {}, members = [], rot = { common: 0, uncommon: 0, rare: 0 };
for (const d of built.slice().sort((a, b) => a - b)) {
  if (!KEY[d] || !DEX_BY[d]) throw new Error('no species ' + d);
  const tree = treeOf(d), line = stagesOf(d, tree);
  for (const s of line) base[s] = bs(s);
  const finals = line.filter(s => !tree[s]), fb = Math.max(...finals.map(bstOf));
  const rank = rankOf(d, fb);
  let ch = null;
  if (rank === 'legendary') ch = LEGEND_CH[d];
  else if (PSEUDO.has(d)) ch = { all: [{ k: 'wins', n: 2 }, { k: 'lv', n: 35 }] };
  else if (rank !== 'starter') { const l = ROT[rank]; ch = l[rot[rank]++ % l.length](DEX_BY[d].types[0]); }
  const kit = kitOf(d, tree);
  for (const id of kit) if (!Moves.BY_ID[id]) throw new Error('kit move ' + id + ' of ' + d);
  members.push({ dex: d, rank, role: roleOf(finals[0]), kit, evo: tree, ch });
}
const stubs = [];
for (const d of D4B) stubs.push({ dex: d, batch: 'D4b' });
for (const d of [...new Set(MEGA_REST)]) stubs.push({ dex: d, batch: 'D4c' });
for (const d of LEG_REST) stubs.push({ dex: d, batch: 'D4d' });
const entries = members.length + D4B.length + MEGA_REST.length + LEG_REST.length;   // (the owner's count: Snorunt twice)
if (entries !== 249) throw new Error('League entries: ' + entries);
for (const s of stubs) if (!DEX_BY[s.dex]) throw new Error('stub ' + s.dex);

const J = o => JSON.stringify(o);
const lines = [
  "'use strict';",
  '/* ============ expedition/league-data.js — GENERATED by tools/micasurvivor/gen_league.mjs, do not edit by hand ============',
  ' * The Expedition League (MicaSurvivor DLC D4): ' + members.length + ' members built, ' + stubs.length + ' stubs for later batches (' + entries + ' League entries, owner 2026-10-19).',
  ' *   members  {dex (the family\'s first stage), rank, role, kit: 4 move ids (unlocked at Lv 1 / 2 / 4 / 7), evo: {dex: [[toDex, level]]},',
  ' *            ch: the challenge (null: free)}',
  ' *   base     the real base stats of every stage: [hp, atk, def, spa, spd, spe] (overworld/data/species_battle.json)',
  ' *   stubs    {dex, batch}: League entries a later batch builds (D4b three-stage Gen 5-9, D4c Mega families, D4d legendaries)',
  ' * Evolutions come from overworld/data/species_extra.json (+ 7 newer ones, cited in the generator), stones / trades /',
  ' * friendship mapped to a level (study 2.1).',
  ' */',
  'G.EXP_LEAGUE_DATA = {',
  '  members: [',
  ...members.map((m, i) => '    ' + J(m) + (i < members.length - 1 ? ',' : '')),
  '  ],',
  '  base: ' + J(base) + ',',
  '  stubs: ' + J(stubs),
  '};',
  '',
];
fs.writeFileSync(OUT, lines.join('\r\n'));
console.log('wrote ' + path.relative(ROOT, OUT) + ': ' + members.length + ' members, ' + stubs.length + ' stubs, ' + Object.keys(base).length + ' species');
for (const m of members) {
  const names = d => DEX_BY[d].name;
  const evo = Object.entries(m.evo).map(([f, l]) => names(+f) + '>' + l.map(([t, lv]) => names(t) + '@' + lv).join('/')).join(' ');
  console.log([m.dex, names(m.dex), m.rank, m.role, m.kit.join(','), evo, J(m.ch)].join(' | '));
}
