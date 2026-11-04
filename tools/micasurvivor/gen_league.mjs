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
// The roster (owner, 2026-10-19, Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md): 249 League entries (248 families: the owner's
// count lists Snorunt twice, as Glalie and as Froslass). D4 built 78 of them; D13 builds the other 170 (D4b / D4c / D4d), so
// the League is complete and there are no stubs. The 78 keep their D4 data byte for byte: they are generated first, in
// the same order, so the challenge rotation they took is the same; the 170 continue it.
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
for (const f of ['data/pokedex.js', 'data/moves.js', 'data/families.js']) vm.runInContext(fs.readFileSync(path.join(MS, f), 'utf8'), ctx, { filename: f });
const { DEX_BY, Moves, Families } = ctx.G;
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
const STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393];   // the starter trios: free (owner: all 12 Gen 1-4 starters)
// D19 (owner decision #15, 2026-10-26: "all 27 starter trios free"): the Gen 5-9 starters are free too. They keep their D13 rank and
// challenge in `members` (the 245 stay byte-identical); the data's `free` list is what the game and the server read.
const FREE27 = [...STARTERS, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];

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
  // (D13: the Gen 6-9 ones the tables don't carry either)
  flabebe: [{ type: 'level', param: 19, target: 'floette' }],   // Gen 6 (Lv 19)
  steenee: [{ type: 'move', param: 'stomp', target: 'tsareena' }],   // Gen 7 (level up knowing Stomp)
  pawmo: [{ type: 'other', param: 'walk1000', target: 'pawmot' }],   // Gen 9 (level up after 1,000 steps in Let's Go mode)
  dipplin: [{ type: 'move', param: 'dragoncheer', target: 'hydrapple' }],   // Gen 9 (level up knowing Dragon Cheer)
  kubfu: [{ type: 'item', param: 'scrollofdarkness', target: 'urshifu' }],   // Gen 8 (the Scroll of Darkness / of Waters)
  meltan: [{ type: 'other', param: 'candy400', target: 'melmetal' }],   // Pokémon GO (400 Meltan Candy)
  // (D19, the full League: the cross-generation evolutions js/data/families.js already counts (gen_families.mjs SUPPLEMENT),
  //  so the League and the shop agree on every family. Bisharp's is the only one inside a D4-D13 member: Pawniard gains Kingambit)
  eevee: [{ type: 'friendship', param: 'fairy', target: 'sylveon' }],   // Gen 6 (affection + a Fairy move)
  meowth: [{ type: 'level', param: 28, target: 'perrserker' }],   // Gen 8 (Galarian Meowth, Lv 28)
  corsola: [{ type: 'level', param: 38, target: 'cursola' }],   // Gen 8 (Galarian Corsola, Lv 38)
  farfetchd: [{ type: 'other', param: 'crits3', target: 'sirfetchd' }],   // Gen 8 (3 critical hits in one battle)
  yamask: [{ type: 'level', param: 34, target: 'runerigus' }],   // Gen 8 (Galarian Yamask: 49 damage, then the arch; ours: Cofagrigus' level)
  stantler: [{ type: 'move', param: 'psyshieldbash', target: 'wyrdeer' }],   // Legends: Arceus (Psyshield Bash 20 times)
  basculin: [{ type: 'other', param: 'recoil294', target: 'basculegion' }],   // Legends: Arceus (294 recoil damage, white-striped)
  sneasel: [{ type: 'item', param: 'razorclaw', target: 'sneasler' }],   // Legends: Arceus (Hisuian Sneasel, Razor Claw by day)
  qwilfish: [{ type: 'move', param: 'barbbarrage', target: 'overqwil' }],   // Legends: Arceus (Barb Barrage 20 times)
  wooper: [{ type: 'level', param: 20, target: 'clodsire' }],   // Gen 9 (Paldean Wooper, Lv 20)
  girafarig: [{ type: 'move', param: 'twinbeam', target: 'farigiraf' }],   // Gen 9 (level up knowing Twin Beam)
  dunsparce: [{ type: 'move', param: 'hyperdrill', target: 'dudunsparce' }],   // Gen 9 (level up knowing Hyper Drill)
  bisharp: [{ type: 'other', param: 'leaderscrest', target: 'kingambit' }],   // Gen 9 (3 Leader's Crest Bisharp)
  gimmighoul: [{ type: 'other', param: 'coins999', target: 'gholdengo' }],   // Gen 9 (999 Gimmighoul Coins)
};
// (D19: `old` leaves out D19's supplement, for the D4-D13 members' rank, role and challenge: Pawniard gains Kingambit, a stage, but
//  keeps the rank, role and challenge it had, so the rotation every later member drew from is the same)
const D19_SUPP = new Set(['eevee', 'meowth', 'corsola', 'farfetchd', 'yamask', 'stantler', 'basculin', 'sneasel', 'qwilfish', 'wooper', 'girafarig', 'dunsparce', 'bisharp', 'gimmighoul']);
let old = false;
const evosOf = k => (extra[k] && extra[k].evos || []).concat(old && D19_SUPP.has(k) ? [] : SUPPLEMENT[k] || []);
// PokéBonk's level overrides (study 2.1): the bug lines that evolve twice before Lv 10 go at 8 / 36; Magikarp at 40.
const OVERRIDE = { metapod: 8, butterfree: 36, kakuna: 8, beedrill: 36, silcoon: 8, cascoon: 8, beautifly: 36, dustox: 36, gyarados: 40,
  // (D13, ours in the same spirit: the League's latest evolution stays Lv 55, Dragonite's and Tyranitar's, which a Classic clear
  //  reaches with room to spare; the real 64 / 60 would need ~90 % of a full clear's XP)
  zweilous: 49, drakloak: 49, hydreigon: 55, dragapult: 55,
  // (D19, the same: Volcarona at 55, not 59; Kingambit at 55 too, only 3 levels after Pawniard's D13 Bisharp at 52 (NO_FLOOR):
  //  the League's latest evolution stays Lv 55)
  volcarona: 55, kingambit: 55 };
const NO_FLOOR = new Set(['kingambit']);   // (their middle stages a level sooner: a stage comes at least 6 levels after the last)
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
      if (!NO_FLOOR.has(e.target)) lv = Math.max(lv, (stageLv[from] || 0) + 6);
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
  // D13 (D4b / D4c / D4d): where the score picked a filler (Tackle, Substitute) over the line's own moves
  495: ['vine-whip', 'razor-leaf', 'giga-drain', 'leaf-storm'],     // Snivy
  498: ['ember', 'flame-wheel', 'karate-chop', 'flamethrower'],     // Tepig (Emboar: Fire / Fighting)
  501: ['water-gun', 'bubble-beam', 'swords-dance', 'hydro-pump'],  // Oshawott
  656: ['water-gun', 'quick-attack', 'dark-pulse', 'hydro-pump'],   // Froakie (Greninja: Water / Dark)
  722: ['razor-leaf', 'aerial-ace', 'hex', 'leaf-storm'],           // Rowlet (Decidueye: Grass / Ghost)
  813: ['ember', 'quick-attack', 'flame-wheel', 'flamethrower'],    // Scorbunny
  816: ['water-gun', 'bubble', 'bubble-beam', 'hydro-pump'],        // Sobble
  906: ['razor-leaf', 'bite', 'giga-drain', 'leaf-storm'],          // Sprigatito (Meowscarada: Grass / Dark)
  912: ['water-gun', 'aerial-ace', 'karate-chop', 'hydro-pump'],    // Quaxly (Quaquaval: Water / Fighting)
  382: ['water-gun', 'bubble-beam', 'ice-beam', 'hydro-pump'],      // Kyogre
  383: ['mud-shot', 'bulldoze', 'flamethrower', 'rock-slide'],      // Groudon
  483: ['metal-claw', 'dragon-rage', 'flash-cannon', 'meteor-mash'], // Dialga
  484: ['water-gun', 'dragon-rage', 'bubble-beam', 'hydro-pump'],   // Palkia
  487: ['hex', 'dragon-rage', 'shadow-ball', 'will-o-wisp'],        // Giratina
  493: ['hyper-voice', 'psychic', 'shadow-ball', 'meteor-mash'],    // Arceus
  716: ['fairy-wind', 'dazzling-gleam', 'psybeam', 'aqua-ring'],    // Xerneas
  800: ['confusion', 'psycho-cut', 'psychic', 'flash-cannon'],      // Necrozma
  888: ['metal-claw', 'dazzling-gleam', 'quick-attack', 'swords-dance'], // Zacian
  889: ['metal-claw', 'aura-sphere', 'karate-chop', 'harden'],      // Zamazenta
  890: ['sludge', 'dragon-rage', 'toxic', 'dragon-dance'],          // Eternatus
  1024: ['tackle', 'rock-throw', 'hyper-voice', 'harden'],          // Terapagos
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
//   hard    maps won on Hard or Nightmare   night  maps won on Nightmare (D13: the legendaries' challenges)
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
const PSEUDO = new Set([147, 246, 371, 374, 443, 633, 704, 782, 885, 996]);   // the 600-BST lines: a win AND a long run (D13: + Deino, Goomy, Jangmo-o, Dreepy, Frigibax)
// D13 (D4d): every other legendary / mythical, PokéBonk-style "a special challenge" (study 2.1: the birds "KO with a type +
// win", Mewtwo "N League members + wins"). Ours, by the final stage's base-stat total:
//   >= 670 (the box legendaries: Lugia, Kyogre, Dialga, Zekrom, Xerneas, Solgaleo, Zacian, Koraidon...): 60 League members and a
//          map won on Hard (or Nightmare)
//   600-669 (the mythicals and the other big ones: Latias, Jirachi, Heatran, Victini, Meloetta, Diancie, Magearna...): KO 1,500
//          with a member of its type and win 3 maps
//   < 600 (the trios and quartets: the beasts, the Regis, the lake trio, the Swords, the Tapus, the Treasures of Ruin, the
//          Paradox, Kubfu, Type: Null...): KO 1,000 with a member of its type and win a map (the birds' own challenge)
//   Arceus: 150 League members and a map won on Nightmare
const legendCh = (d, fb) => {
  const t = DEX_BY[d].types[0];
  if (d === 493) return { all: [{ k: 'league', n: 150 }, { k: 'night', n: 1 }] };
  if (fb >= 670) return { all: [{ k: 'league', n: 60 }, { k: 'hard', n: 1 }] };
  if (fb >= 600) return { all: [{ k: 'kot', t, n: 1500 }, { k: 'wins', n: 3 }] };
  return { all: [{ k: 'kot', t, n: 1000 }, { k: 'wins', n: 1 }] };
};

// ---------------- build ----------------
const built = [...D4A, ...MEGA12, ...LEG1];
if (built.length !== 78 || new Set(built).size !== 78) throw new Error('roster: ' + built.length);
// D13: the other 170 (D4b's 54 three-stage Gen 5-9 families, D4c's 31 Mega families, D4d's 85 legendaries and mythicals)
// (each FAMILY is one member, starting at its first stage: Silvally, Urshifu and Melmetal are Type: Null's, Kubfu's and Meltan's
//  evolutions, so the owner's 170 species are 167 families: 245 members in all)
const D13all = [...new Set([...D4B, ...MEGA_REST, ...LEG_REST])];
if (D13all.length !== 170 || D13all.some(d => built.includes(d))) throw new Error('D13 roster: ' + D13all.length);
const laterStage = new Set();
for (const d of [...built, ...D13all]) { const t = treeOf(d); for (const s of stagesOf(d, t)) if (s !== d) laterStage.add(s); }
const D13 = D13all.filter(d => !laterStage.has(d));
if (D13.length !== 167) throw new Error('D13 families: ' + D13.length + ' (' + D13all.filter(d => laterStage.has(d)) + ')');
// D19 (owner 2026-10-26: "increase coverage to the full 1025 ... playable characters"): every other FAMILY of js/data/families.js
// (G.Families, generated by gen_families.mjs: the shop's families, so the League and the shop agree), from its first stage. They come
// after the 245, sorted, continuing the challenge rotation, so the 245 keep their data.
const ROOTS = [...new Set(Array.from({ length: 1025 }, (_, i) => Families.rootOf(i + 1)))].sort((a, b) => a - b);
const D19 = ROOTS.filter(d => !built.includes(d) && !D13.includes(d));
const BATCH = {};
for (const d of D4B) BATCH[d] = 'D4b';
for (const d of MEGA_REST) BATCH[d] = 'D4c';
for (const d of LEG_REST) BATCH[d] = 'D4d';
for (const d of D19) BATCH[d] = 'D19';
const base = {}, members = [], rot = { common: 0, uncommon: 0, rare: 0 };
// (the D4 78 first, in their order, so their challenges are the same as D4's; then the 170, continuing the rotation)
for (const d of [...built.slice().sort((a, b) => a - b), ...D13.slice().sort((a, b) => a - b), ...D19]) {
  if (!KEY[d] || !DEX_BY[d]) throw new Error('no species ' + d);
  const tree = treeOf(d), line = stagesOf(d, tree);
  for (const s of line) base[s] = bs(s);
  old = BATCH[d] !== 'D19';
  const tree0 = old ? treeOf(d) : tree, line0 = stagesOf(d, tree0);
  old = false;
  const finals = line0.filter(s => !tree0[s]), fb = Math.max(...finals.map(bstOf));
  const rank = rankOf(d, fb);
  let ch = null;
  if (rank === 'legendary') ch = LEGEND_CH[d] || legendCh(d, fb);
  else if (PSEUDO.has(d)) ch = { all: [{ k: 'wins', n: 2 }, { k: 'lv', n: 35 }] };
  else if (rank !== 'starter') { const l = ROT[rank]; ch = l[rot[rank]++ % l.length](DEX_BY[d].types[0]); }
  const kit = kitOf(d, tree);
  for (const id of kit) if (!Moves.BY_ID[id]) throw new Error('kit move ' + id + ' of ' + d);
  members.push(Object.assign({ dex: d, rank, role: roleOf(finals[0]), kit, evo: tree, ch }, BATCH[d] ? { b: BATCH[d] } : {}));
}
members.sort((a, b) => a.dex - b.dex);
const stubs = [];   // (D13: none left)
const pre19 = members.filter(m => m.b !== 'D19');
if (pre19.length !== 245) throw new Error('League D4-D13 members: ' + pre19.length);
// D19: every family is a member, and every species 1-1025 is a stage of exactly one member (the families' own split)
if (members.length !== ROOTS.length || D19.length + 245 !== ROOTS.length) throw new Error('League members: ' + members.length + ' / ' + ROOTS.length + ' families');
{
  const famOf = {};
  for (const m of members) for (const s of stagesOf(m.dex, m.evo)) { if (famOf[s]) throw new Error('stage ' + s + ' twice'); famOf[s] = m.dex; }
  for (let d = 1; d <= 1025; d++) if (famOf[d] !== Families.rootOf(d)) throw new Error('species ' + d + ': League ' + famOf[d] + ', families.js ' + Families.rootOf(d));
}
const entries = members.length;

const J = o => JSON.stringify(o);
const lines = [
  "'use strict';",
  '/* ============ expedition/league-data.js — GENERATED by tools/micasurvivor/gen_league.mjs, do not edit by hand ============',
  ' * The Expedition League (MicaSurvivor DLC D4, D13; D19: every family): ' + members.length + ' members, one a family of js/data/families.js, every species 1-1025.',
  ' *   members  {dex (the family\'s first stage), rank, role, kit: 4 move ids (unlocked at Lv 1 / 2 / 4 / 7), evo: {dex: [[toDex, level]]},',
  ' *            ch: the challenge (null: free), b: the batch that built it (D4b / D4c / D4d / D19; none: D4)}',
  ' *   free     the free members (D19, owner: all 27 starter trios; the Gen 5-9 ones keep their D13 rank and challenge in members)',
  ' *   base     the real base stats of every stage: [hp, atk, def, spa, spd, spe] (overworld/data/species_battle.json)',
  ' *   stubs    none since D13 (the D4b three-stage Gen 5-9 families, the D4c Mega families and the D4d legendaries are members now)',
  ' * Evolutions come from overworld/data/species_extra.json (+ 7 newer ones, cited in the generator), stones / trades /',
  ' * friendship mapped to a level (study 2.1).',
  ' */',
  'G.EXP_LEAGUE_DATA = {',
  '  members: [',
  ...members.map((m, i) => '    ' + J(m) + (i < members.length - 1 ? ',' : '')),
  '  ],',
  '  base: ' + J(base) + ',',
  '  free: ' + J(FREE27) + ',',
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
