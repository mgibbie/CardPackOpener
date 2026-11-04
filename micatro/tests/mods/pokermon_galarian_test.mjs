// Regional batch B (the owner's "yes", 2026-11-03; jokers/pokejokers_galarian.js; PORTING.md "Regional batch B"): the 19 Galarian forms, on the
// regional pill of batch A. Own lines (their own pool entries beside the originals), natural evolutions into the existing Galarian
// evolutions, and one BRANCH evolution of a Kanto Basic by an Energy (gated by Pokermon rules rev GALAR_FORMS_REV):
//   G-Ponyta -> G-Rapidash      Pastel Veil: Lucky cards always trigger their Mult; Rapidash doubles Lucky odds, X1.2 per Lucky trigger.
//   G-Slowpoke -> G-Slowbro / G-Slowking (by position)   +1 Mult banked each round; Slowbro 1 in 3 retrigger all; Slowking X0.25 per Spectral.
//   G-Farfetch'd -> Sirfetch'd   +5 Mult per Lucky trigger; 3 Lucky triggers in a round (Farfetch'd's rule).
//   Koffing -> G-Weezing (Fairy Energy)   Neutralizing Gas X1.5; a Hazard card unenhanced per Blind, +X0.1.
//   G-Mr. Mime -> Mr. Rime       held Glass +10 Mult; 5 rounds.
//   G-Corsola -> Cursola (Psychic Energy)   Cursed Body: +X0.1 per playing card destroyed while held.
//   G-Zigzagoon -> G-Linoone -> Obstagoon   scored Spades +4 Mult / X1.15; 4 / 5 rounds.
//   G-Darumaka -> G-Darmanitan   Gorilla Tactics: most-played hand +12 Mult / X3; Zen Mode X4 on the final hand (its Zen card).
//   G-Yamask -> Runerigus        scored Stone +5 Mult; 10 Stones (Yamask's rule).
//   G-Stunfisk                   Snap Trap: the first discard each round is free.
//   G-Articuno / G-Zapdos / G-Moltres   final-hand retrigger all / first card retriggers 3 times / +1 discard, X3.5 on the final hand.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_galarian_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { P_CARDS, create_playing_card, get_current_pool } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import '../../mods/nacho/index.js';
import { poke_get_family_list, get_highest_evo, get_previous_evo } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, GALAR_FORMS_REV } from '../../mods/pokermon/systems/energy.js';
import { get_type, REGIONS } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const NEW = ['galarian_ponyta', 'galarian_rapidash', 'galarian_slowpoke', 'galarian_slowbro', 'galarian_slowking', 'galarian_farfetchd', 'galarian_weezing',
  'galarian_mrmime', 'galarian_articuno', 'galarian_zapdos', 'galarian_moltres', 'galarian_corsola', 'galarian_zigzagoon', 'galarian_linoone',
  'galarian_darumaka', 'galarian_darmanitan', 'galarian_yamask', 'galarian_stunfisk'];
const OLD = { pokermon: '3.9.1+r' + (GALAR_FORMS_REV - 1) };
const oldRules = (fn) => { PINS.RULES.pins = OLD; try { return fn(); } finally { PINS.RULES.pins = null; } };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function mk(spec, area, center) { return create_playing_card({ front: P_CARDS[spec], center: P_CENTERS[center || 'c_base'] }, area); }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
function play(list, opt) { clearHand(); return playCards(cards(list), opt); }
/** Play these cards; `final`: as the round's final hand (1 hand left; the Blind is beaten by it, so the round ends). */
function playCards(cs, { final = false } = {}) {
  G.GAME.chips = 0;
  if (final) { G.GAME.blind.chips = 1; G.GAME.current_round.hands_left = 1; }
  else {
    if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
    if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  }
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
function endRound(heldList) {
  clearHand();
  const held = heldList ? cards(heldList) : [];
  const c = hand(['S_2']);
  G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  return held;
}
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
function fresh(seed, jokers, mods) {
  start(seed, {}, { noBlind: true, mods });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers ? jokers.map((j) => j.sort_id) : undefined }); flush(); return r; };
const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
/** Every probability roll hits (Oops!-style: the base numerator raised far past any denominator). */
const allHit = (on) => { G.GAME.probabilities.normal = on ? 1e6 : 1; };

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= GALAR_FORMS_REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev ' + GALAR_FORMS_REV + '+ (regional batch B)', PINS.modPin('pokermon'));
  const mine = STATUS.PORTED_FILES['micatro/pokejokers_galarian'] || [];
  for (const n of NEW) ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n) && mine.includes(n), n + ': registered, ported, with the Galarian forms');
  ok(mine.length === 18 && NEW.length === 18, '18 Galarian jokers (19 forms: Darmanitan\'s Zen Mode is its form)', mine.length);
});
await sec('static', () => {
  start('GALARS');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, gen, rounds|undefined, sheet, x, y]
  const WANT = {
    galarian_ponyta: [1, 5, 'Basic', 'Psychic', 1, 5, 'Gen01', 10, 4], galarian_rapidash: [S, 8, 'One', 'Psychic', 1, undefined, 'Gen01', 12, 4],
    galarian_slowpoke: [1, 5, 'Basic', 'Psychic', 1, 5, 'Gen01', 14, 4], galarian_slowbro: [S, 8, 'One', 'Dark', 1, undefined, 'Gen01', 0, 5],
    galarian_slowking: [S, 8, 'One', 'Dark', 2, undefined, 'Gen02', 6, 4],
    galarian_farfetchd: [1, 5, 'Basic', 'Fighting', 1, undefined, 'Gen01', 2, 5], galarian_weezing: [S, 8, 'One', 'Fairy', 1, undefined, 'Gen01', 4, 5],
    galarian_mrmime: [3, 8, 'Basic', 'Water', 1, 5, 'Gen01', 6, 5],
    galarian_articuno: [4, 20, 'Legendary', 'Psychic', 1, undefined, 'Gen01', 8, 5], galarian_zapdos: [4, 20, 'Legendary', 'Fighting', 1, undefined, 'Gen01', 10, 5],
    galarian_moltres: [4, 20, 'Legendary', 'Dark', 1, undefined, 'Gen01', 12, 5],
    galarian_corsola: [3, 7, 'Basic', 'Psychic', 2, undefined, 'Gen02', 8, 4],
    galarian_zigzagoon: [2, 6, 'Basic', 'Dark', 3, 4, 'Gen03', 8, 7], galarian_linoone: [S, 8, 'One', 'Dark', 3, 5, 'Gen03', 10, 7],
    galarian_darumaka: [1, 5, 'Basic', 'Water', 5, 4, 'Gen05', 10, 7], galarian_darmanitan: [S, 8, 'One', 'Water', 5, undefined, 'Gen05', 0, 8],
    galarian_yamask: [1, 5, 'Basic', 'Earth', 5, undefined, 'Gen05', 4, 8], galarian_stunfisk: [3, 7, 'Basic', 'Metal', 5, undefined, 'Gen05', 6, 8],
  };
  for (const [n, [rarity, cost, stage, type, gen, rnds, sheet, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === gen && c.poke_region === 'galarian',
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen ${gen} (its base species'), Galarian`, [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.poke_region]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y, `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
    ok(/^Galarian /.test(describe(add('j_poke_' + n)).name), n + ': named "Galarian ..."');
  }
  for (const [n, s] of [['galarian_articuno', [9, 5]], ['galarian_zapdos', [11, 5]], ['galarian_moltres', [13, 5]]]) ok(C(n).soul_pos && C(n).soul_pos.x === s[0] && C(n).soul_pos.y === s[1], n + ': its floating soul ' + s, C(n).soul_pos);
  ok(C('ponyta').ptype === 'Fire' && C('slowpoke').ptype === 'Water' && C('koffing').ptype === 'Dark' && C('weezing').ptype === 'Dark' && C('farfetchd').ptype === 'Colorless'
    && C('zigzagoon').rarity === 1 && C('corsola').ptype === 'Water' && C('articuno').ptype === 'Water', 'the originals keep their own data');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (list) => { const i = keys.indexOf('j_poke_' + list[0]); return i >= 0 && list.every((k, n) => keys[i + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  for (const ch of [['rapidash', 'galarian_ponyta', 'galarian_rapidash', 'slowpoke'], ['mega_slowbro', 'galarian_slowpoke', 'galarian_slowbro'], ['slowking', 'galarian_slowking'],
    ['farfetchd', 'galarian_farfetchd'], ['weezing', 'galarian_weezing'], ['mrmime', 'galarian_mrmime'], ['articuno', 'galarian_articuno', 'zapdos', 'galarian_zapdos', 'moltres', 'galarian_moltres'],
    ['corsola', 'galarian_corsola'], ['linoone', 'galarian_zigzagoon', 'galarian_linoone'], ['darmanitan', 'galarian_darumaka', 'galarian_darmanitan'],
    ['cofagrigus', 'galarian_yamask'], ['stunfisk', 'galarian_stunfisk']]) ok(run(ch) === true, 'Pokédex order: ' + ch.join(' > '), run(ch));
  const FAM = {
    galarian_ponyta: 'galarian_ponyta,galarian_rapidash', galarian_slowpoke: 'galarian_slowpoke,galarian_slowbro,galarian_slowking',
    galarian_darumaka: 'galarian_darumaka,galarian_darmanitan', galarian_zigzagoon: 'galarian_zigzagoon,galarian_linoone,obstagoon',
    galarian_farfetchd: 'galarian_farfetchd,sirfetchd', galarian_corsola: 'galarian_corsola,cursola', galarian_mrmime: 'galarian_mrmime,mrrime',
    galarian_yamask: 'galarian_yamask,runerigus', koffing: 'koffing,weezing,galarian_weezing', galarian_stunfisk: 'galarian_stunfisk',
    // the shared finals keep their original lines
    obstagoon: 'zigzagoon,linoone,obstagoon', sirfetchd: 'farfetchd,sirfetchd', cursola: 'corsola,cursola', mrrime: 'mimejr,mrmime,mrrime', runerigus: 'yamask,cofagrigus,runerigus',
    ponyta: 'ponyta,rapidash',
  };
  for (const [n, f] of Object.entries(FAM)) ok(fam(n) === f, 'family of ' + n + ': ' + f, fam(n));
  oldRules(() => ok(fam('koffing') === 'koffing,weezing', 'old rules: Koffing\'s line without Galarian Weezing', fam('koffing')));
  ok(get_highest_evo(add('j_poke_galarian_zigzagoon')) === 'obstagoon' && get_previous_evo(add('j_poke_galarian_linoone')) === 'galarian_zigzagoon'
    && get_previous_evo(add('j_poke_obstagoon')) === 'linoone' && get_previous_evo(add('j_poke_sirfetchd')) === 'farfetchd', 'highest / previous evo: the Galarian line\'s own; Obstagoon / Sirfetch\'d still devolve to the Kanto / Hoenn form');
  ok(['slow_mult', 'med_Xmult', 'gas_Xmult', 'curse_Xmult', 'quick_num', 'quick_dem', 'd_size', 'retriggers', 'stones_scored', 'rounds'].every((f) => !(f in energy_values)),
    'fixed: the odds, retriggers, discard; the banks never take Energy');
});

// ------------------------------------------------------------------- the regional pill
await sec('pills', () => {
  start('GALARPILL', {}, { mods: ['nacho'] });
  const pills = (k) => describe(add(k)).badges.filter((b) => b && b.key !== 'mod').map((b) => [b.label, b.colour]);
  for (const n of NEW) {
    const b = pills('j_poke_' + n);
    ok(b.length === 3 && b[1][0] === 'Galarian' && b[1][1] === REGIONS.galarian.colour && b[2][0] === C(n).ptype, n + ': its pills are its rarity, "Galarian", then its type', b);
  }
  const gm = pills('j_nacho_galarian_meowth');
  ok(gm.length === 3 && gm[1][0] === 'Galarian', 'Nacho\'s Galarian Meowth carries the same pill', gm);
  for (const k of ['j_poke_ponyta', 'j_poke_koffing', 'j_poke_weezing', 'j_poke_obstagoon', 'j_poke_sirfetchd', 'j_poke_cursola', 'j_poke_mrrime', 'j_poke_runerigus']) {
    const b = pills(k);
    ok(b.length === 2 && !b.some(([l]) => /Galarian/.test(l)), k + ': no region pill', b);
  }
});

// ------------------------------------------------------------------- the pool
await sec('pool', () => {
  start('GALARPOOL');
  const [common] = get_current_pool('Joker', 0.1);
  const [unc] = get_current_pool('Joker', 0.8);
  const [rare] = get_current_pool('Joker', 0.99);
  const [leg] = get_current_pool('Joker', null, true);
  ok(['galarian_ponyta', 'galarian_slowpoke', 'galarian_farfetchd', 'galarian_darumaka', 'galarian_yamask'].every((n) => common.includes('j_poke_' + n)), 'the Common Basics are in the Common pool');
  ok(unc.includes('j_poke_galarian_zigzagoon'), 'Galarian Zigzagoon: the Uncommon pool');
  ok(['galarian_mrmime', 'galarian_corsola', 'galarian_stunfisk'].every((n) => rare.includes('j_poke_' + n)), 'Mr. Mime / Corsola / Stunfisk: the Rare pool');
  ok(['galarian_articuno', 'galarian_zapdos', 'galarian_moltres'].every((n) => leg.includes('j_poke_' + n)), 'the three birds: the Legendary pool', leg.filter((k) => /galarian/.test(k)));
  ok(NEW.filter((n) => C(n).rarity === 'poke_safari').every((n) => ![common, unc, rare].some((p) => p.includes('j_poke_' + n))), 'the Safari ones never roll');
  // own pool entries: a Kanto Linoone / Farfetch'd / Corsola held doesn't keep the Galarian form out, and the other way round
  add('j_poke_linoone'); add('j_poke_farfetchd'); add('j_poke_galarian_corsola'); add('j_poke_galarian_ponyta');
  const [c2] = get_current_pool('Joker', 0.1), [u2] = get_current_pool('Joker', 0.8), [r2] = get_current_pool('Joker', 0.99);
  ok(u2.includes('j_poke_galarian_zigzagoon') && c2.includes('j_poke_galarian_farfetchd') && r2.includes('j_poke_corsola') && c2.includes('j_poke_ponyta')
    && !c2.includes('j_poke_galarian_ponyta') && !r2.includes('j_poke_galarian_corsola'), 'Kanto / Hoenn held: the Galarian forms still offered; Galarian held: the originals still offered (only the held ones are out)');
  add('j_poke_obstagoon');
  const [u3] = get_current_pool('Joker', 0.8);
  ok(!u3.includes('j_poke_galarian_zigzagoon'), 'an Obstagoon held: Galarian Zigzagoon is out (its line\'s final)');
});

// ------------------------------------------------------------------- Galarian Ponyta / Rapidash, Pastel Veil
await sec('ponyta', () => {
  const [p] = fresh('GPONY', ['galarian_ponyta']);
  let all = true;
  for (let i = 0; i < 12; i++) { const t = play([['S_K', 'm_lucky']]); if (!near(t.mult, 1 + 20)) all = false; }
  ok(all, 'Galarian Ponyta: a scored Lucky card triggers its +20 Mult every time (12 of 12)');
  p.remove(); flush();
  let misses = 0;
  for (let i = 0; i < 12; i++) { const t = play([['S_K', 'm_lucky']]); if (near(t.mult, 1)) misses++; }
  ok(misses > 0, 'without it, the 1 in 5 misses', misses);
  const [q] = fresh('GPONY2', ['galarian_ponyta']);
  rounds(5);
  ok(key(q) === 'j_poke_galarian_rapidash' && get_type(q) === 'Psychic', 'Galarian Ponyta -> Galarian Rapidash after 5 rounds', key(q));
  ok(/Mult 2 in 5, money 2 in 15/.test(plain(q)), 'Rapidash: the Lucky odds doubled (2 in 5, 2 in 15)', plain(q));
  allHit(true);
  let t = play([['S_K', 'm_lucky']]);
  ok(near(t.mult, (1 + 20) * 1.2 * 1.2), 'both rolls hit: +20 Mult, then X1.2 per trigger (2 triggers: X1.44)', t.total);
  allHit(false);
  // the doubling, statistically: 400 Lucky cards scored with and without it
  const rate = (withIt) => {
    const [r] = fresh('GPONYR' + withIt, withIt ? ['galarian_rapidash'] : ['j_joker']);
    let hits = 0;
    for (let i = 0; i < 200; i++) { const t2 = play([['S_K', 'm_lucky']]); if (t2.mult > 1 + 4 + (withIt ? 0 : 4)) hits++; }
    return hits / 200;
  };
  const a = rate(false), b = rate(true);
  ok(a > 0.1 && a < 0.32 && b > 0.3 && b < 0.52, 'the Mult roll: about 1 in 5 without, 2 in 5 with Galarian Rapidash', [a, b]);
  // Ponyta + Rapidash: the Mult always, X1.2 for it
  fresh('GPONY3', ['galarian_ponyta', 'galarian_rapidash']);
  let x = 0;
  for (let i = 0; i < 8; i++) { const t3 = play([['S_K', 'm_lucky']]); if (near(t3.mult, 21 * 1.2) || near(t3.mult, 21 * 1.44)) x++; }
  ok(x === 8, 'Ponyta + Rapidash: every Lucky card gives +20 and at least one X1.2', x);
});

// ------------------------------------------------------------------- Galarian Slowpoke -> Slowbro / Slowking by position
await sec('slowpoke', () => {
  const [s] = fresh('GSLOW', ['galarian_slowpoke']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Galarian Slowpoke: nothing banked yet', t.total);
  rounds(2);
  ok(near(ex(s).slow_mult, 2) && ex(s).rounds === 3, '2 rounds: +2 Mult banked, 3 rounds left', ex(s));
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 2), 'it gives its bank: +2 Mult', t.total);
  // leftmost -> Slowbro, rightmost -> Slowking (another Slowpoke, Kanto, beside it)
  const [l, kanto] = fresh('GSLOW2', ['galarian_slowpoke', 'slowpoke']);
  ok(/now: Slowbro: leftmost/.test(plain(l)), 'its text names the branch: leftmost', plain(l));
  rounds(5);
  ok(key(l) === 'j_poke_galarian_slowbro' && near(ex(l).slow_mult, 5) && get_type(l) === 'Dark', 'leftmost of two Slowpokes: Galarian Slowbro, the +5 Mult bank kept', [key(l), ex(l).slow_mult]);
  ok(key(kanto) === 'j_poke_slowpoke', 'the Kanto Slowpoke is untouched');
  const [k2, r] = fresh('GSLOW3', ['slowpoke', 'galarian_slowpoke']);
  rounds(5);
  ok(key(r) === 'j_poke_galarian_slowking' && near(ex(r).slow_mult, 5), 'rightmost: Galarian Slowking (bank kept)', [key(r), ex(r).slow_mult]);
  ok(key(k2) === 'j_poke_slowpoke', '...');
  // alone: a seeded pick (the same seed, the same branch; over seeds, both)
  const lone = (seed) => { const [x] = fresh(seed, ['galarian_slowpoke']); rounds(5); return key(x); };
  const picks = new Set(['GSL0', 'GSL1', 'GSL2', 'GSL3', 'GSL4', 'GSL5', 'GSL6', 'GSL7'].map(lone));
  ok(picks.has('j_poke_galarian_slowbro') && picks.has('j_poke_galarian_slowking') && picks.size === 2, 'alone: Slowbro or Slowking (seeded)', [...picks]);
  ok(lone('GSL3') === lone('GSL3'), 'the same seed picks the same branch');
  // Slowbro, Quick Draw: forced hit -> every scored card twice; with odds 0 never
  const [b] = fresh('GSLOWB', ['galarian_slowbro']);
  ex(b).slow_mult = 3;
  allHit(true);
  t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 2 * (10 + 10)) && near(t.mult, 2 + 3), 'Quick Draw hit: both Kings retrigger (+20 Chips more), the bank +3 Mult', t.total);
  allHit(false);
  let hits = 0;
  for (let i = 0; i < 150; i++) { const t2 = play(['S_K', 'H_K']); if (near(t2.chips, 50)) hits++; else if (!near(t2.chips, 30)) hits = -999; }
  ok(hits > 30 && hits < 72, 'Quick Draw: about 1 in 3 hands retrigger all (and the rest none)', hits);
  ok(/1 in 3 chance to retrigger every scored card/.test(plain(b)), 'its text', plain(b));
  // Slowking, Curious Medicine: Spectral cards used
  const [k] = fresh('GSLOWK', ['galarian_slowking']);
  ex(k).slow_mult = 2;
  clearHand(); cards(['D_9', 'C_8']);
  use(add('c_familiar'), []);
  use(add('c_pluto'), []);
  t = play(['S_K', 'H_K']);
  ok(near(ex(k).med_Xmult, 1.25) && near(t.mult, (2 + 2) * 1.25), 'Galarian Slowking: a Spectral used X1.25 (a Planet nothing); with its +2 Mult', [ex(k).med_Xmult, t.total]);
});

// ------------------------------------------------------------------- Galarian Farfetch'd -> Sirfetch'd
await sec('farfetchd', () => {
  const [f] = fresh('GFARF', ['galarian_farfetchd']);
  allHit(true);
  let t = play([['S_K', 'm_lucky']]);
  ok(near(t.mult, 1 + 20 + 5 * 2), 'Galarian Farfetch\'d: a Lucky card whose two rolls hit: +5 Mult per trigger (+10)', t.total);
  allHit(false);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'no Lucky card: nothing', t.total);
  ok(/this round: 2\/3/.test(plain(f)), 'its text counts this round\'s triggers', plain(f));
  endRound(); flush();
  ok(key(f) === 'j_poke_galarian_farfetchd', '2 triggers: no evolution', key(f));
  advance();
  allHit(true);
  play([['S_K', 'm_lucky'], ['H_K', 'm_lucky']]);
  allHit(false);
  endRound(); flush();
  ok(key(f) === 'j_poke_sirfetchd', '4 triggers in a round: Sirfetch\'d', key(f));
  // the Kanto path: Farfetch'd still evolves the same way
  const [k] = fresh('GFARK', ['farfetchd']);
  allHit(true); play([['S_K', 'm_lucky'], ['H_K', 'm_lucky']]); allHit(false);
  endRound(); flush();
  ok(key(k) === 'j_poke_sirfetchd', 'Kanto Farfetch\'d: Sirfetch\'d on its 3-trigger rule, as ever', key(k));
});

// ------------------------------------------------------------------- Koffing -> Galarian Weezing (Fairy Energy); Neutralizing Gas
await sec('weezing', () => {
  start('GWEEZ1');
  let k = add('j_poke_koffing');
  ok(/Galarian form: a Fairy Energy used on it evolves it into Galarian Weezing/.test(plain(k)), 'Koffing\'s text: its 3.9.1 box, then the Galarian box', plain(k));
  let r = use(add('c_poke_fairy_energy'), [k]);
  ok(r && r.ok !== false && key(k) === 'j_poke_galarian_weezing' && get_type(k) === 'Fairy', 'Koffing + a Fairy Energy: Galarian Weezing (Fairy)', [key(k), r && r.ok]);
  start('GWEEZ2');
  k = add('j_poke_koffing');
  const en = add('c_poke_fairy_energy');
  debuff(k); use(en, [k]);
  ok(key(k) === 'j_poke_koffing' && G.consumeables.cards.includes(en), 'a debuffed Koffing: refused');
  undebuff(k);
  const es = add('j_poke_everstone'); use(en, [k]);
  ok(key(k) === 'j_poke_koffing' && G.consumeables.cards.includes(en), 'an Everstone: refused');
  es.remove(); flush();
  oldRules(() => use(en, [k]));
  ok(key(k) === 'j_poke_koffing' && G.consumeables.cards.includes(en), 'a move recorded on r' + (GALAR_FORMS_REV - 1) + ': refused, as it was');
  use(add('c_poke_darkness_energy'), [k]);
  ok(key(k) === 'j_poke_koffing' && ex(k).energy_count === 1, 'a Darkness Energy: energized as ever');
  use(en, [k]);
  ok(key(k) === 'j_poke_galarian_weezing' && ex(k).energy_count === 1 && near(ex(k).Xmult, 1.8), '... live: Galarian Weezing, Koffing\'s Energy carried (X1.8)', [key(k), ex(k).Xmult]);
  // the Kanto path: 2 rounds -> Weezing
  // (a Joker to its left keeps its Volatile Left from exploding — an exploded Koffing is debuffed for the round, no countdown)
  const [, kk] = fresh('GWEEZ3', ['j_joker', 'koffing']);
  rounds(2);
  ok(key(kk) === 'j_poke_weezing', 'Koffing after 2 rounds: Weezing, as ever', key(kk));
  // Neutralizing Gas: one Hazard card a Blind
  start('GWEEZ4', {}, { noBlind: true });
  const w = add('j_poke_galarian_weezing');
  const hz = [mk('S_5', G.deck, 'm_poke_hazard'), mk('H_6', G.deck, 'm_poke_hazard')];
  act({ type: 'select_blind' }); flush(); clearHand();
  const cleared = hz.filter((c) => !has_hz(c));
  ok(cleared.length === 1 && cleared[0].config.center.key === 'c_base' && near(ex(w).gas_Xmult, 0.1), 'a Blind selected: one Hazard card unenhanced, +X0.1 banked', [cleared.length, ex(w).gas_Xmult]);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.6), 'X1.5 + X0.1: X1.6', t.total);
  endRound(); advance();
  ok(hz.every((c) => !has_hz(c)) && near(ex(w).gas_Xmult, 0.2), 'the next Blind: the other one, X0.2', ex(w).gas_Xmult);
  endRound(); advance();
  ok(near(ex(w).gas_Xmult, 0.2), 'no Hazard card left: nothing gained', ex(w).gas_Xmult);
});
function has_hz(c) { return c.config.center.key === 'm_poke_hazard'; }

// ------------------------------------------------------------------- Galarian Mr. Mime -> Mr. Rime
await sec('mrmime', () => {
  const [m] = fresh('GMIME', ['galarian_mrmime']);
  clearHand();
  cards([['D_3', 'm_glass'], ['C_4', 'm_glass'], 'D_7']);
  const pl = cards(['S_K', 'H_K']);
  let t = playCards(pl);
  ok(near(t.mult, 2 + 20), 'Galarian Mr. Mime: 2 Glass cards held, +10 Mult each', t.total);
  rounds(5);
  ok(key(m) === 'j_poke_mrrime', 'after 5 rounds: Mr. Rime', key(m));
  // the Kanto path: a Water Energy on Mr. Mime still makes Mr. Rime
  start('GMIMEK');
  const k = add('j_poke_mrmime');
  use(add('c_poke_water_energy'), [k]);
  ok(key(k) === 'j_poke_mrrime', 'Kanto Mr. Mime + a Water Energy: Mr. Rime, as ever', key(k));
});

// ------------------------------------------------------------------- Galarian Corsola, Cursed Body; -> Cursola
await sec('corsola', () => {
  const [c] = fresh('GCORS', ['galarian_corsola']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Galarian Corsola: X1 at first', t.total);
  clearHand();
  const hc = cards(['D_3', 'C_4']);
  act({ type: 'highlight', ids: hc.map((x) => x.sort_id) });
  const hm = add('c_hanged_man');
  act({ type: 'use', id: hm.sort_id, targets: hc.map((x) => x.sort_id) }); flush();
  ok(hc.every((x) => x.removed) && near(ex(c).curse_Xmult, 1.2), 'The Hanged Man destroys 2 cards: X1.2', ex(c).curse_Xmult);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.2), 'it gives X1.2', t.total);
  debuff(c);
  const hc2 = cards(['D_5']);
  act({ type: 'highlight', ids: hc2.map((x) => x.sort_id) });
  const hm2 = add('c_hanged_man');
  act({ type: 'use', id: hm2.sort_id, targets: hc2.map((x) => x.sort_id) }); flush();
  ok(hc2[0].removed && near(ex(c).curse_Xmult, 1.2), 'while debuffed: nothing gained', ex(c).curse_Xmult);
  undebuff(c);
  ok(/Currently X1.2 Mult/.test(plain(c)), 'its text shows the bank', plain(c));
  use(add('c_poke_psychic_energy'), [c]);
  ok(key(c) === 'j_poke_cursola' && ex(c).energy_count === 1, 'a Psychic Energy: energized, then Cursola', [key(c), ex(c).energy_count]);
  oldRules(() => { const c2 = add('j_poke_galarian_corsola'); const en = add('c_poke_psychic_energy'); use(en, [c2]); ok(key(c2) === 'j_poke_galarian_corsola', 'old rules: no evolution'); });
  start('GCORSK');
  const k = add('j_poke_corsola');
  use(add('c_poke_psychic_energy'), [k]);
  ok(key(k) === 'j_poke_cursola', 'Kanto (Johto) Corsola + a Psychic Energy: Cursola, as ever', key(k));
});

// ------------------------------------------------------------------- Galarian Zigzagoon -> Linoone -> Obstagoon
await sec('zigzagoon', () => {
  const [z] = fresh('GZIG', ['galarian_zigzagoon']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 4), 'Galarian Zigzagoon: one scored Spade, +4 Mult', t.total);
  rounds(4);
  ok(key(z) === 'j_poke_galarian_linoone' && ex(z).rounds === 5, 'after 4 rounds: Galarian Linoone', key(z));
  t = play(['S_K', 'S_Q', 'S_9', 'S_5', 'S_3']);
  ok(near(t.mult, 4 * 1.15 ** 5), 'Galarian Linoone: a Spade Flush, X1.15 each', t.total);
  rounds(5);
  ok(key(z) === 'j_poke_obstagoon', 'after 5 more: Obstagoon', key(z));
  start('GZIGK');
  const k = add('j_poke_linoone');
  use(add('c_poke_darkness_energy'), [k]);
  ok(key(k) === 'j_poke_obstagoon', 'Hoenn Linoone + a Darkness Energy: Obstagoon, as ever', key(k));
});

// ------------------------------------------------------------------- Galarian Darumaka / Darmanitan, Gorilla Tactics + Zen Mode
await sec('darmanitan', () => {
  const [d] = fresh('GDARU', ['galarian_darumaka']);
  for (const h of Object.values(G.GAME.hands)) h.played = 0;
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 12), 'Galarian Darumaka: the first hand (a Pair) is the most played: +12 Mult', t.total);
  t = play(['S_K', 'H_K', 'D_K']);
  ok(near(t.mult, 3 + 12), 'Three of a Kind ties the Pair (1 each): a tie counts, +12', t.total);
  t = play(['S_K', 'H_K']);
  t = play(['S_K', 'H_K', 'D_K']);
  t = play(['S_K', 'H_K', 'D_K']);
  ok(near(t.mult, 3 + 12), 'Three of a Kind, now 3: +12', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 12), 'the Pair again: 3 each, tied for the most: +12', t.total);
  t = play(['S_K', 'H_K', 'D_K', 'C_K']);
  ok(near(t.mult, 7), 'Four of a Kind (1, the Pair and Three 3): nothing', t.total);
  rounds(4);
  ok(key(d) === 'j_poke_galarian_darmanitan', 'after 4 rounds: Galarian Darmanitan', key(d));
  for (const h of Object.values(G.GAME.hands)) h.played = 0;
  G.GAME.hands['Flush'].played = 5;
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Galarian Darmanitan: a Pair, not the most played (Flush 5): nothing', t.total);
  G.GAME.hands['Pair'].played = 5;
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 3), 'the Pair now most played: X3', t.total);
  const v = {}; view_card(d, v);
  ok(!(v.poke && v.poke.form === 'zen'), 'not the final hand: Standard Mode face', v.poke);
  ok(/Standard Mode/.test(plain(d)), 'its text: Standard Mode', plain(d));
  G.GAME.current_round.hands_left = 1;
  const v2 = {}; view_card(d, v2);
  const face = POKE_UI.face({ center: key(d), mod: 'pokermon', atlas: C('galarian_darmanitan').atlas, pos: C('galarian_darmanitan').pos, poke: v2.poke });
  ok(v2.poke && v2.poke.form === 'zen' && face && face.atlas === 'poke_AtlasJokersBasicGen05391' && face.pos.x === 2 && face.pos.y === 8, 'the final hand next: Zen Mode, drawn as upstream\'s Zen card Gen05 {2,8}', [v2.poke, face && face.atlas, face && face.pos]);
  const sface = POKE_UI.face({ center: key(d), mod: 'pokermon', edition: 'poke_shiny', atlas: C('galarian_darmanitan').atlas, pos: C('galarian_darmanitan').pos, poke: v2.poke });
  ok(sface && sface.atlas === 'poke_AtlasJokersBasicGen05Shiny391' && sface.pos.x === 2, 'Shiny: the Shiny sheet\'s Zen card', sface && sface.atlas);
  ok(/Zen Mode!/.test(plain(d)), 'its text: Zen Mode!', plain(d));
  G.GAME.hands['Pair'].played = 0;
  t = play(['S_7', 'H_2', 'D_9'], { final: true });
  ok(near(t.mult, 1 * 4), 'the round\'s final hand: Zen Mode X4 whatever the hand (High Card, not the most played)', t.total);
});

// ------------------------------------------------------------------- Galarian Yamask -> Runerigus
await sec('yamask', () => {
  const [y] = fresh('GYAM', ['galarian_yamask']);
  let t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(near(t.mult, 1 + 10), 'Galarian Yamask: 2 Stone cards, +5 Mult each', t.total);
  ok(ex(y).stones_scored === 2 && /Stone cards scored: 2\/10/.test(plain(y)), '2 Stones counted', plain(y));
  for (let i = 0; i < 4; i++) play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  endRound(); flush();
  ok(key(y) === 'j_poke_runerigus', '10 Stones scored: Runerigus at the end of the round', key(y));
  const [k] = fresh('GYAMK', ['yamask']);
  for (let i = 0; i < 5; i++) play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  rounds(5);
  ok(key(k) === 'j_poke_runerigus', 'Unova Yamask: still Runerigus on its 10-Stones rule', key(k));
});

// ------------------------------------------------------------------- Galarian Stunfisk, Snap Trap
await sec('stunfisk', () => {
  fresh('GSTUN', ['galarian_stunfisk']);
  const d0 = G.GAME.current_round.discards_left;
  const disc = () => { clearHand(); const cs = cards(['S_2', 'H_3']); act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); act({ type: 'discard' }); flush(); };
  disc();
  ok(G.GAME.current_round.discards_left === d0 && G.GAME.current_round.discards_used === 1, 'the first discard: free (discards left unchanged)', [d0, G.GAME.current_round.discards_left]);
  disc();
  ok(G.GAME.current_round.discards_left === d0 - 1, 'the second: uses one', G.GAME.current_round.discards_left);
  endRound(); advance();
  const d1 = G.GAME.current_round.discards_left;
  disc();
  ok(G.GAME.current_round.discards_left === d1, 'the next round: the first is free again');
});

// ------------------------------------------------------------------- the birds
await sec('birds', () => {
  fresh('GART', ['galarian_articuno']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 20), 'Galarian Articuno: not the final hand, nothing', t.total);
  t = play(['S_K', 'H_K'], { final: true });
  ok(near(t.chips, 10 + 40), 'the final hand: both Kings retrigger', t.total);
  fresh('GZAP', ['galarian_zapdos']);
  t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 10 * 4 + 10), 'Galarian Zapdos: the first scored card x4 (3 retriggers), the second once', t.total);
  fresh('GMOL0', []);
  const base = G.GAME.round_resets.discards;
  const [m] = fresh('GMOL', ['galarian_moltres']);
  ok(G.GAME.current_round.discards_left === base + 1 && G.GAME.round_resets.discards === base + 1, 'Galarian Moltres: +1 discard', [base, G.GAME.current_round.discards_left, G.GAME.round_resets.discards]);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'not the final hand: nothing', t.total);
  t = play(['S_K', 'H_K'], { final: true });
  ok(near(t.mult, 2 * 3.5), 'the final hand: X3.5', t.total);
  m.remove(); flush();
  ok(G.GAME.round_resets.discards === base, 'sold: the discard goes');
});

// ------------------------------------------------------------------- Energy
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const steps = (n, field, type, want) => {
    start('GEN' + n);
    const j = add('j_poke_' + n), got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('galarian_ponyta', 'Xmult_multi', 'Psychic', [1.26, 1.32, 1.38]);
  steps('galarian_rapidash', 'Xmult_multi', 'Psychic', [1.26, 1.32, 1.38]);
  const sp = steps('galarian_slowpoke', 'mult_mod', 'Psychic', [1.2, 1.4, 1.6]); ok(ex(sp).slow_mult === 0, 'Galarian Slowpoke: the bank untouched');
  steps('galarian_slowking', 'Xmult_mod', 'Dark', [0.3, 0.35, 0.4]);
  steps('galarian_farfetchd', 'mult', 'Fighting', [7, 9, 11]);
  const w = steps('galarian_weezing', 'Xmult', 'Fairy', [1.8, 2.1, 2.4]); ok(near(ex(w).Xmult_mod, 0.16) && ex(w).gas_Xmult === 0, 'Galarian Weezing: gain X0.16, the bank untouched');
  steps('galarian_mrmime', 'mult', 'Water', [14, 18, 22]);
  steps('galarian_corsola', 'Xmult_mod', 'Psychic', [0.12, 0.14, 0.16]);
  steps('galarian_zigzagoon', 'mult', 'Dark', [5.6, 7.2, 8.8]);
  steps('galarian_linoone', 'Xmult_multi', 'Dark', [1.2075, 1.265, 1.3225]);
  steps('galarian_darumaka', 'mult', 'Water', [16.8, 21.6, 26.4]);
  steps('galarian_darmanitan', 'Xmult', 'Water', [3.6, 4.2, 4.8]); steps('galarian_darmanitan', 'Xmult2', 'Water', [4.8, 5.6, 6.4]);
  steps('galarian_yamask', 'mult', 'Earth', [7, 9, 11]);
  const mo = steps('galarian_moltres', 'Xmult', 'Dark', [4.2, 4.9, 5.6]); ok(ex(mo).d_size === 1, 'Galarian Moltres: +1 discard stays');
  for (const n of ['galarian_slowbro', 'galarian_stunfisk', 'galarian_articuno', 'galarian_zapdos']) {
    start('GENI' + n);
    const j = add('j_poke_' + n), en = add('c_poke_' + ({ Dark: 'darkness', Metal: 'metal', Psychic: 'psychic', Fighting: 'fighting' }[C(n).ptype]) + '_energy');
    use(en, [j]);
    ok(!ex(j).energy_count && G.consumeables.cards.includes(en) && C(n).poke_no_energy_field, n + ': Energy-inert (no number to raise: odds / retriggers / the free discard are fixed)', ex(j).energy_count);
  }
});

// ------------------------------------------------------------------- a run recorded on the old rules replays as recorded
await sec('old-rev replay', () => {
  const deck = { name: 'Galar', mods: ['pokermon'], params: { blind_scaling: 0.05 }, consumables: [{ key: 'c_poke_fairy_energy' }], jokers: [{ key: 'j_poke_koffing' }] };
  const record = (seed, pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed, mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_fairy_energy');
      s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [G.jokers.cards[0].sort_id] }); flush();
      for (let b = 0; b < 2; b++) {
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const y = () => G.jokers.cards.map(key).join();
  const snap = () => ({ jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars, cons: G.consumeables.cards.length });
  record('GALARREC', null);
  ok(y() === 'j_poke_galarian_weezing', 'live: the Fairy Energy makes Galarian Weezing', y());
  const sOld = record('GALARREC', OLD);
  const wantOld = snap();
  ok(wantOld.jokers === 'j_poke_koffing' && wantOld.cons === 1, 'the same moves on the old rules: Koffing stays (the Energy refused, still held)', wantOld);
  const recOld = JSON.parse(JSON.stringify(sOld.recipe));
  recOld.modVersions.pokermon = OLD.pokermon;
  ok(Session.pinDiff(recOld).length === 1, 'an old-rev recipe differs from the current pin (the resume prompt)');
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(recOld)), { repin: true }); flush();
  const gotOld = snap();
  ok(!r.stoppedAt && JSON.stringify(gotOld) === JSON.stringify(wantOld), 'resumed: every old move replays on the old rules', { wantOld, gotOld });
  const st = Session.stepper(JSON.parse(JSON.stringify(recOld)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === recOld.actions.length && y() === 'j_poke_koffing', 'the replay stepper: the same', [st.error, y()]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'GALARRES', customDeck: { name: 'Galar', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_J', 0, 0, 0, 12], ['H_9', 'm_poke_hazard', 0, 0, 4], ['D_5', 'm_lucky', 0, 0, 8], ['C_2', 'm_glass', 0, 0, 8], ['S_7', 'm_stone', 0, 0, 8], ['S_4', 0, 0, 0, 12]],
    consumables: [{ key: 'c_poke_fairy_energy' }, { key: 'c_familiar' }],
    jokers: [{ key: 'j_poke_koffing' }, { key: 'j_poke_galarian_slowking' }, { key: 'j_poke_galarian_corsola' }, { key: 'j_poke_galarian_slowpoke' }, { key: 'j_poke_galarian_stunfisk' }] } });
  s.act({ type: 'select_blind' }); flush();
  const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_fairy_energy'), ko = G.jokers.cards[0];
  s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [ko.sort_id] }); flush();
  const fm = G.consumeables.cards.find((c) => key(c) === 'c_familiar');
  s.act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  s.act({ type: 'use', id: fm.sort_id, targets: [G.hand.cards[0].sort_id] }); flush();
  ok(key(ko) === 'j_poke_galarian_weezing', 'the run: Koffing + its Fairy Energy -> Galarian Weezing');
  for (let b = 0; b < 3; b++) {
    if (G.STATE === STATES.SELECTING_HAND) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush(); }
    for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
    if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
    if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
    if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
  }
  const look = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).slow_mult, ex(j).med_Xmult, ex(j).curse_Xmult, ex(j).gas_Xmult, ex(j).rounds, ex(j).snap_round]),
    deck: G.playing_cards.length, hazards: G.playing_cards.filter((c) => c.config.center.key === 'm_poke_hazard').length,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round, discards: G.GAME.current_round.discards_left,
  });
  const want = look();
  ok(want.round >= 3 && want.jokers[1][2] > 1 && want.jokers[3][1] >= 2 && want.jokers[0][4] > 0, 'the run: Slowking banked the Spectral, Slowpoke its Mult, Weezing a Hazard', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = look();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the evolution, the banks, the Hazards, the free discards and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: each 3.9.1 cell shows the type
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NEW) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    const zen = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen05', pos: [2, 8] });
    if (!zen || zen.ptype !== 'Water') bad.push(['zen', 'Water', zen && zen.ptype]);
    ok(!bad.length, 'each of the 18 (and the Zen Mode card) is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
