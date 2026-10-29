// Gen 5, batch 1 (2026-10-28, the owner's "Build it": 22 jokers, #504-539; jokers/pokejokers_designs.js "Gen 5, batch 1"; PORTING.md
// "Gen 5, batch 1"). Prices by the DESIGN_GUIDE slots; evolution by rounds; Energy on each joker's main number (odds, Foresight, money and
// retriggers fixed).
//   Patrat 504 -> Watchog 505 (Colorless)               Lookout: +1 / +2 Foresight; each Foreseen card +6 / +10 Mult.
//   Lillipup 506 -> Herdier 507 -> Stoutland 508         Pickup: at end of round 1 in 4 a Tarot / 1 in 3 a Tarot or Planet / 1 in 2 (with
//     (Colorless)                                        room; no room, no roll); Stoutland +3 Mult per consumable held.
//   Purrloin 509 -> Liepard 510 (Dark)                   Pickpocket: $2 / $4 at end of round; the Joker to its right loses $1 of sell value
//                                                        (never below $1; none on the right: no loss, the $ still earned).
//   Pidove 519 -> Tranquill 520 -> Unfezant 521          Super Luck: Lucky cards' odds +1 (before Oops! doubles); a triggering Lucky card
//     (Colorless)                                        +5 Mult (Tranquill) / X1.5 (Unfezant).
//   Blitzle 522 -> Zebstrika 523 (Lightning)             Motor Drive: +4 Mult per hand played this round before any discard (this one
//                                                        included; 0 after a discard) / X1.5 if you haven't discarded this round.
//   Woobat 527 -> Swoobat 528 (Psychic)                  Heart Stamp: each scored Heart $1 / $1 and X1.1.
//   Timburr 532 -> Gurdurr 533 -> Conkeldurr 534         scored Stone cards +4 / +8 Mult / +8 Mult and X1.5.
//     (Fighting)
//   Tympole 535 -> Palpitoad 536 -> Seismitoad 537       Swift Swim: +30 / +50 / +50 Chips, doubled while raining (a working Kyogre, or a
//     (Water)                                            Clubs forecast on the round's first deal); Seismitoad's rain retriggers Clubs.
//   Throh 538, Sawk 539 (Fighting, Rare $7)              the lowest-ranked scored card X2 / the highest +30 Mult; Dojo Rivals: both
//                                                        held, X2.5 / +45.
// Every ability is FIRED through real hands, discards and rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen5_batch1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, winRound, G, P_CENTERS, P_CARDS, act, state, STATES } from './poke_helpers.mjs';
import { create_playing_card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { discard_cards_from_highlighted } from '../../js/engine/run.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { get_probability_vars } from '../../mods/pokermon/systems/utils.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const flat = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const C = (n) => P_CENTERS['j_poke_' + n];
const LINES = [['patrat', 'watchog'], ['lillipup', 'herdier', 'stoutland'], ['purrloin', 'liepard'], ['pidove', 'tranquill', 'unfezant'], ['blitzle', 'zebstrika'],
  ['woobat', 'swoobat'], ['timburr', 'gurdurr', 'conkeldurr'], ['tympole', 'palpitoad', 'seismitoad'], ['throh'], ['sawk']];
const NAMES = LINES.flat();
const DEX = { patrat: 504, watchog: 505, lillipup: 506, herdier: 507, stoutland: 508, purrloin: 509, liepard: 510, pidove: 519, tranquill: 520, unfezant: 521,
  blitzle: 522, zebstrika: 523, woobat: 527, swoobat: 528, timburr: 532, gurdurr: 533, conkeldurr: 534, tympole: 535, palpitoad: 536, seismitoad: 537, throh: 538, sawk: 539 };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function fresh(seed, jokers) { start(seed); return jokers.map((k) => add(k.startsWith('j_') || k.startsWith('c_') ? k : 'j_poke_' + k)); }
/** Play exactly these cards (keys, or {k, center, debuff, seal}); never the round's last hand unless `final`. */
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  const c = create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.center || 'c_base'] }, area);
  if (s.seal) c.set_seal(s.seal, true);
  if (s.debuff) { c.ability.debuff_sources = { test: true }; c.set_debuff(); }
  return c;
}
function play(specs, { handsLeft } = {}) {
  clearHand();
  const cs = specs.map((s) => mk(s, G.hand));
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (handsLeft) G.GAME.current_round.hands_left = handsLeft;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  const d0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), dollars: G.GAME.dollars - d0 };
}
/** A player discard (or The Hook's, with `hook`) of two cards. */
function discard({ hook = false } = {}) {
  clearHand();
  const cs = [mk('D_4', G.hand), mk('C_6', G.hand)];
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  if (hook) discard_cards_from_highlighted(true); else act({ type: 'discard' });
  flush();
}
/** Win the round, cash out, select the next Blind (The Wall). */
function nextRound() {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  if (state() === 'SHOP') act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** Win the round and stop at the cash-out: -> the cash-out rows. */
function toEval() { clearHand(); winRound(); flush(); return (G.GAME.round_eval && G.GAME.round_eval.rows) || []; }
const rowsOf = (rows, n) => rows.filter((r) => r.center === 'j_poke_' + n);
/** Make the deck exactly these cards so the next Blind's first deal is them (Castform's test). */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
function deal(seed, specs, jokers) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
const CLUBS = ['C_2', 'C_3', 'C_4', 'C_5', 'C_6', 'H_7', 'H_8', 'S_9'];   // Clubs 5, red 2, Spades 1: the forecast is Rainy
const REDS = ['H_2', 'H_3', 'D_4', 'D_5', 'H_6', 'C_7', 'C_8', 'S_9'];    // red 5, Clubs 2: Sunny
const TIE = ['H_2', 'H_3', 'D_4', 'C_5', 'C_6', 'C_7', 'S_8', 'S_9'];     // red 3, Clubs 3, Spades 2: Normal (a tie for the top)
const scry = () => (G.scry_view ? G.scry_view.cards : []);

// ------------------------------------------------------------------- pin, static data, order, families, art, precedence, energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 53 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 53+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const re = new RegExp('["\'](' + NAMES.join('|') + ')["\']|_(' + NAMES.join('|') + ')\\b', 'i');
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 22 (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G5B0');
  const S = 'poke_safari';
  const want = {
    patrat: [1, 5, 'Basic', 'Colorless'], watchog: [S, 8, 'One', 'Colorless'],
    lillipup: [2, 6, 'Basic', 'Colorless'], herdier: [S, 8, 'One', 'Colorless'], stoutland: [S, 10, 'Two', 'Colorless'],
    purrloin: [1, 5, 'Basic', 'Dark'], liepard: [S, 8, 'One', 'Dark'],
    pidove: [2, 6, 'Basic', 'Colorless'], tranquill: [S, 8, 'One', 'Colorless'], unfezant: [S, 10, 'Two', 'Colorless'],
    blitzle: [1, 5, 'Basic', 'Lightning'], zebstrika: [S, 8, 'One', 'Lightning'],
    woobat: [1, 5, 'Basic', 'Psychic'], swoobat: [S, 8, 'One', 'Psychic'],
    timburr: [2, 6, 'Basic', 'Fighting'], gurdurr: [S, 8, 'One', 'Fighting'], conkeldurr: [S, 10, 'Two', 'Fighting'],
    tympole: [2, 6, 'Basic', 'Water'], palpitoad: [S, 8, 'One', 'Water'], seismitoad: [S, 10, 'Two', 'Water'],
    throh: [3, 7, 'Basic', 'Fighting'], sawk: [3, 7, 'Basic', 'Fighting'],
  };
  for (const [n, w] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === w[0] && c.cost === w[1] && c.stage === w[2] && c.ptype === w[3] && c.gen === 5, n + ' (' + DEX[n] + '): ' + w.join(' ') + ', Gen 5', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  const cell = { patrat: [16, 33], watchog: [18, 33], lillipup: [20, 33], herdier: [22, 33], stoutland: [24, 33], purrloin: [26, 33], liepard: [28, 33],
    pidove: [16, 34], tranquill: [18, 34], blitzle: [22, 34], zebstrika: [24, 34], woobat: [2, 35], swoobat: [4, 35], timburr: [12, 35], gurdurr: [14, 35],
    conkeldurr: [16, 35], tympole: [18, 35], palpitoad: [20, 35], seismitoad: [22, 35], throh: [24, 35], sawk: [26, 35] };
  for (const [n, [x, y]] of Object.entries(cell)) ok(C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === x && C(n).pos.y === y && !C(n).soul_pos, n + ': upstream 3.9.1 cell Natdex {' + x + ',' + y + '}', [C(n).atlas, C(n).pos]);
  ok(C('unfezant').atlas === 'poke_AtlasJokersBasicGen05391' && C('unfezant').pos.x === 0 && C('unfezant').pos.y === 0, 'unfezant: upstream 3.9.1 cell Gen05 {0,0} (its first of 2)', [C('unfezant').atlas, C('unfezant').pos]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key.replace('j_poke_', ''));
  const run = (after, names, next) => { const i = keys.indexOf(after); return i >= 0 && names.every((n, k) => keys[i + 1 + k] === n) && keys[i + 1 + names.length] === next; };
  ok(run('samurott', ['patrat', 'watchog', 'lillipup', 'herdier', 'stoutland', 'purrloin', 'liepard'], 'pansage'), 'Pokédex order: Samurott (503), Patrat ... Liepard (504-510), Pansage (511)', keys.slice(keys.indexOf('samurott'), keys.indexOf('samurott') + 9));
  ok(run('musharna', ['pidove', 'tranquill', 'unfezant', 'blitzle', 'zebstrika'], 'roggenrola'), 'Musharna (518), Pidove ... Zebstrika (519-523), Roggenrola (524)');
  ok(run('gigalith', ['woobat', 'swoobat'], 'drilbur'), 'Gigalith (526), Woobat, Swoobat (527-528), Drilbur (529)');
  ok(run('excadrill', ['timburr', 'gurdurr', 'conkeldurr', 'tympole', 'palpitoad', 'seismitoad', 'throh', 'sawk'], 'darumaka'), 'Excadrill (530), Timburr ... Sawk (532-539), Darumaka (554)');
  for (const line of LINES) if (line.length > 1) ok(JSON.stringify(poke_get_family_list(line[0])) === JSON.stringify(line), line.join(' -> ') + ': one family', poke_get_family_list(line[0]));
  const E = (n) => C(n).config.extra;
  ok(E('patrat').rounds === 4 && E('lillipup').rounds === 4 && E('herdier').rounds === 5 && E('purrloin').rounds === 4 && E('pidove').rounds === 4 && E('tranquill').rounds === 5
    && E('blitzle').rounds === 5 && E('woobat').rounds === 5 && E('timburr').rounds === 5 && E('gurdurr').rounds === 5 && E('tympole').rounds === 5 && E('palpitoad').rounds === 5,
  'timers: Patrat / Lillipup / Purrloin / Pidove 4; Herdier, Tranquill, Blitzle, Woobat, Timburr, Gurdurr, Tympole, Palpitoad 5');
  ok(['watchog', 'stoutland', 'liepard', 'unfezant', 'zebstrika', 'swoobat', 'conkeldurr', 'seismitoad', 'throh', 'sawk'].every((n) => E(n).rounds === undefined), 'final stages and single-stage jokers never evolve');
  // Energy fields: each main number is one; odds, Foresight, money, the drain, the Lucky odds, retriggers, the rival bonuses are not
  ok(!['num', 'dem', 'scry', 'steal', 'drain', 'lucky_odds', 'stamp_money', 'retriggers', 'rival_x', 'rival_mult', 'rounds'].some((f) => f in energy_values)
    && near(energy_values.mult, 0.4) && near(energy_values.chips, 0.3) && near(energy_values.Xmult, 0.2) && near(energy_values.Xmult_multi, 0.05),
  'Energy: mult +40%, chips +30%, Xmult +20%, Xmult_multi +5%; odds, Foresight, $, drain, Lucky odds, retriggers and rival bonuses fixed');
  ok(C('purrloin').poke_no_energy_field && C('liepard').poke_no_energy_field && NAMES.filter((n) => !['purrloin', 'liepard'].includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Purrloin / Liepard are Energy-inert by design (their $ and drain are fixed); every other one has an Energy field');
});

// ------------------------------------------------------------------- Patrat / Watchog: Lookout
await sec('patrat', () => {
  const [p] = fresh('G5PA1', ['patrat']);
  ok(G.GAME.scry_amount === 1 && scry().length === 1, 'Patrat: +1 Foresight', G.GAME.scry_amount);
  let r = play(['S_2']);
  ok(r.chips === 7 && near(r.mult, 1 + 6), 'High Card: the Foreseen card gives +6 Mult (1 + 6)', r.total);
  debuff(scry()[0]);
  r = play(['S_2']);
  ok(near(r.mult, 1), 'a debuffed Foreseen card gives nothing', r.total);
  ok(/Lookout: each Foreseen card gives \+6 Mult/.test(flat(p)), 'tooltip', flat(p));
  p.remove(); flush();
  ok((G.GAME.scry_amount || 0) === 0, 'gone: the Foresight is taken back');
  const [w] = fresh('G5PA2', ['watchog']);
  ok(G.GAME.scry_amount === 2 && scry().length === 2, 'Watchog: +2 Foresight', G.GAME.scry_amount);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 20), 'two Foreseen cards: +10 each (1 + 20)', r.total);
  // Uxie's Foresight adds to it: 4 Foreseen cards, Watchog +10 on each, Uxie X1.3 on each
  add('j_poke_uxie');
  ok(scry().length === 4, 'with Uxie: 4 Foreseen cards', scry().length);
  r = play(['S_2']);
  ok(near(r.mult, ((((1 + 10) * 1.3 + 10) * 1.3 + 10) * 1.3 + 10) * 1.3), 'with Uxie: each of the 4 cards +10 (Watchog, left), then X1.3 (Uxie)', r.total);
  // Blueprint copies Lookout
  fresh('G5PA3', ['j_blueprint', 'patrat']);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 12), 'Blueprint copies it: +6 twice on the Foreseen card', r.total);
  ok(w, 'ok');
});

// ------------------------------------------------------------------- Lillipup / Herdier / Stoutland: Pickup
await sec('lillipup', () => {
  const [l] = fresh('G5LI1', ['lillipup']);
  ex(l).num = ex(l).dem; // forced odds: a guaranteed find
  nextRound();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'end of round (forced 4 in 4): a random Tarot', G.consumeables.cards.map(key));
  // no room: no roll at all (the seeded stream never moves)
  while (G.consumeables.cards.length < G.consumeables.config.card_limit) add('c_pluto');
  const before = G.GAME.pseudorandom.lillipup;
  nextRound();
  ok(G.consumeables.cards.length === G.consumeables.config.card_limit && G.GAME.pseudorandom.lillipup === before, 'full consumable slots: nothing made, and no roll (the "lillipup" stream unmoved)', [G.consumeables.cards.map(key), before, G.GAME.pseudorandom.lillipup]);
  // the real 1 in 4, over many seeded rounds
  let made = 0, n = 0;
  for (let s = 0; s < 6; s++) {
    const [ll] = fresh('G5LIRATE' + s, ['lillipup']);
    for (let i = 0; i < 3; i++) { for (const c of G.consumeables.cards.slice()) c.remove(); flush(); ex(ll).rounds = 99; nextRound(); n++; made += G.consumeables.cards.length; }
  }
  for (let s = 0; s < 40; s++) { const [ll] = fresh('G5LIR' + s, ['lillipup']); ex(ll).rounds = 99; nextRound(); n++; made += G.consumeables.cards.length; }
  ok(made / n > 0.1 && made / n < 0.45, '1 in 4 over ' + n + ' seeded rounds: ' + made + ' Tarots', made / n);
  // the odds go through pseudorandom_probability: Oops! All 6s shows 2 in 4
  const [l2] = fresh('G5LI2', ['lillipup', 'j_oops']);
  ok(/1 in 4|2 in 4/.test(flat(l2)) && JSON.stringify(get_probability_vars(l2, 1, 4, 'lillipup')) === '[2,4]', 'Oops! All 6s: 2 in 4 (pseudorandom_probability)', flat(l2));
  // the same seed finds the same card
  const pick = (seed) => { const [x] = fresh(seed, ['lillipup']); ex(x).num = 4; nextRound(); return G.consumeables.cards.map(key).join(); };
  const a = pick('G5LISEED'), b = pick('G5LISEED');
  ok(a && a === b, 'seeded: the same seed makes the same Tarot', [a, b]);
  ok(l, 'ok');
});
await sec('herdier', () => {
  const sets = new Set();
  for (let s = 0; s < 20 && sets.size < 2; s++) {
    const [h] = fresh('G5HE' + s, ['herdier']);
    ex(h).num = ex(h).dem; ex(h).rounds = 99;
    for (let i = 0; i < 3; i++) { for (const c of G.consumeables.cards.slice()) c.remove(); flush(); nextRound(); for (const c of G.consumeables.cards) sets.add(c.ability.set); }
  }
  ok(sets.size === 2 && sets.has('Tarot') && sets.has('Planet'), 'Herdier (forced odds): it finds Tarots and Planets', [...sets]);
  const [h2] = fresh('G5HE2', ['herdier']);
  ok(/1 in 3 chance to create a Tarot or Planet card/.test(flat(h2)), 'Herdier tooltip: 1 in 3', flat(h2));
});
await sec('stoutland', () => {
  const [s] = fresh('G5ST1', ['stoutland']);
  let r = play(['S_2']);
  ok(near(r.mult, 1), 'no consumable held: no Mult', r.total);
  add('c_pluto'); add('c_fool');
  r = play(['S_2']);
  ok(near(r.mult, 1 + 6), '2 consumables held: +3 each (1 + 6)', r.total);
  ok(/Currently \+6 Mult/.test(flat(s)) && /1 in 2 chance/.test(flat(s)), 'tooltip: 1 in 2; Currently +6', flat(s));
  for (const c of G.consumeables.cards.slice()) c.remove(); flush();
  ex(s).num = ex(s).dem;
  nextRound();
  ok(G.consumeables.cards.length === 1 && ['Tarot', 'Planet'].includes(G.consumeables.cards[0].ability.set), 'Stoutland (forced): a Tarot or Planet at end of round', G.consumeables.cards.map(key));
  r = play(['S_2']);
  ok(near(r.mult, 1 + 3), '... which it then counts: +3', r.total);
  // Blueprint copies the Mult, never the find
  const [, s2] = fresh('G5ST2', ['j_blueprint', 'stoutland']);
  add('c_pluto');
  r = play(['S_2']);
  ok(near(r.mult, 1 + 3 + 3), 'Blueprint copies +3 per consumable', r.total);
  ex(s2).num = ex(s2).dem;
  G.consumeables.cards[0].remove(); flush();
  nextRound();
  ok(G.consumeables.cards.length === 1, 'with Blueprint, still one find a round', G.consumeables.cards.map(key));
});

// ------------------------------------------------------------------- Purrloin / Liepard: Pickpocket
await sec('purrloin', () => {
  const sellOf = (j) => j.sell_cost;
  start('G5PU1');
  const left = add('j_blueprint'), p = add('j_poke_purrloin'), right = add('j_blueprint'), far = add('j_blueprint');
  ok([left, right, far].every((j) => sellOf(j) === 5), 'three Blueprints sell for $5');
  let rows = toEval();
  ok(rowsOf(rows, 'purrloin').length === 1 && rowsOf(rows, 'purrloin')[0].dollars === 2, 'the cash-out: a $2 Purrloin row', rows);
  ok(sellOf(right) === 4 && sellOf(left) === 5 && sellOf(far) === 5 && sellOf(p) === 2, 'only the Joker directly to its RIGHT loses $1 ($5 -> $4); left, further right and Purrloin itself unchanged',
    [left, p, right, far].map(sellOf));
  const d0 = G.GAME.dollars;
  act({ type: 'cash_out' }); flush();
  ok(G.GAME.dollars - d0 >= 2, 'the $2 is paid', [d0, G.GAME.dollars]);
  act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); clearHand();
  toEval();
  ok(sellOf(right) === 3, 'a second round: $3', sellOf(right));
  // edge: rightmost (nothing on its right) -> no loss, the money still earned
  start('G5PU2');
  const l2 = add('j_blueprint'); add('j_poke_purrloin');
  rows = toEval();
  ok(sellOf(l2) === 5 && rowsOf(rows, 'purrloin')[0] && rowsOf(rows, 'purrloin')[0].dollars === 2, 'rightmost Purrloin: nothing to its right, no loss; still $2', [sellOf(l2), rows]);
  // edge: alone
  start('G5PU3'); add('j_poke_purrloin');
  rows = toEval();
  ok(rowsOf(rows, 'purrloin')[0] && rowsOf(rows, 'purrloin')[0].dollars === 2, 'alone: $2', rows);
  // edge: the neighbour at its minimum ($1) loses nothing
  start('G5PU4');
  add('j_poke_purrloin'); const cheap = add('j_joker');
  ok(sellOf(cheap) === 1, 'a Joker sells for $1');
  toEval();
  ok(sellOf(cheap) === 1, 'at $1 it loses nothing (Drain\'s floor)', sellOf(cheap));
  // edge: $2 -> $1, then stays
  start('G5PU5');
  add('j_poke_purrloin'); const two = add('j_joker'); two.ability.extra_value = 1; two.set_cost();
  ok(sellOf(two) === 2, 'a $2 Joker');
  nextRound(); ok(sellOf(two) === 1, 'one round: $1', sellOf(two));
  nextRound(); ok(sellOf(two) === 1, 'the next: still $1', sellOf(two));
  // edge: a debuffed neighbour still loses it; a debuffed Purrloin takes and pays nothing
  start('G5PU6');
  add('j_poke_purrloin'); const db = debuff(add('j_blueprint'));
  toEval();
  ok(sellOf(db) === 4, 'a debuffed neighbour still loses $1 (sell value is no ability)', sellOf(db));
  start('G5PU7');
  const dp = debuff(add('j_poke_purrloin')); const r7 = add('j_blueprint');
  rows = toEval();
  ok(sellOf(r7) === 5 && rowsOf(rows, 'purrloin').length === 0, 'a debuffed Purrloin: no drain, no $', [sellOf(r7), rows]);
  // the row order is the decision: moving the Joker moves the theft
  start('G5PU8');
  const a = add('j_blueprint'), pp = add('j_poke_purrloin'), b = add('j_blueprint');
  G.jokers.cards.splice(0, 3, pp, a, b);
  toEval();
  ok(sellOf(a) === 4 && sellOf(b) === 5, 'Purrloin moved to the left end: the Joker now on its right pays', [sellOf(a), sellOf(b)]);
  // Liepard: $4
  start('G5LP1');
  add('j_poke_liepard'); const lr = add('j_blueprint');
  rows = toEval();
  ok(rowsOf(rows, 'liepard')[0] && rowsOf(rows, 'liepard')[0].dollars === 4 && sellOf(lr) === 4, 'Liepard: $4, and the right neighbour loses $1', [rows, sellOf(lr)]);
  ok(/earn \$4 at end of round; the Joker directly to its right loses \$1 of sell value/.test(flat(G.jokers.cards[0])), 'Liepard tooltip', flat(G.jokers.cards[0]));
  ok(dp, 'ok');
});

// ------------------------------------------------------------------- Pidove / Tranquill / Unfezant: Super Luck
await sec('super luck odds', () => {
  const [p] = fresh('G5PI1', ['pidove']);
  const lucky = mk({ k: 'S_2', center: 'm_lucky' }, G.hand);
  const v = (id, num, dem) => JSON.stringify(get_probability_vars(lucky, num, dem, id));
  ok(v('lucky_mult', 1, 5) === '[2,5]' && v('lucky_money', 1, 15) === '[2,15]', 'Pidove: a Lucky card\'s rolls are 2 in 5 (Mult) and 2 in 15 (money)', [v('lucky_mult', 1, 5), v('lucky_money', 1, 15)]);
  ok(v('glass', 1, 4) === '[1,4]' && v('wheel_of_fortune', 1, 4) === '[1,4]', 'only the Lucky rolls: Glass and Wheel of Fortune stay 1 in 4');
  add('j_oops');
  ok(v('lucky_mult', 1, 5) === '[4,5]', 'with Oops! All 6s: (1 + 1) x 2 = 4 in 5 (Super Luck is added before Oops! doubles)', v('lucky_mult', 1, 5));
  G.jokers.cards.find((j) => key(j) === 'j_oops').remove(); flush();
  add('j_poke_venonat');
  ok(v('lucky_mult', 1, 5) === '[3,5]', 'with Venonat: +1 each, 3 in 5', v('lucky_mult', 1, 5));
  add('j_poke_tranquill');
  ok(v('lucky_mult', 1, 5) === '[4,5]', 'and a Tranquill: 4 in 5 (each copy +1)', v('lucky_mult', 1, 5));
  add('j_poke_absol');
  ok(v('lucky_mult', 1, 5).startsWith('[0,'), 'Absol fixes it at 0', v('lucky_mult', 1, 5));
  // a debuffed Pidove adds nothing; Blueprint doesn't copy it
  const [, p2] = fresh('G5PI2', ['j_blueprint', 'pidove']);
  ok(v('lucky_mult', 1, 5) === '[2,5]', 'Blueprint does not copy Super Luck (still 2 in 5)', v('lucky_mult', 1, 5));
  debuff(p2);
  ok(v('lucky_mult', 1, 5) === '[1,5]', 'a debuffed Pidove adds nothing', v('lucky_mult', 1, 5));
  // the tooltip: live odds; a shop card counts its own +1
  start('G5PI3');
  const shop = add('j_poke_pidove'); shop.remove(); flush();
  ok(/Super Luck: \+1 to the odds of Lucky cards \(Currently 2 in 5 Mult, 2 in 15 money\)/.test(flat(shop)), 'a card not held yet shows what it would give: 2 in 5, 2 in 15', flat(shop));
  // the rate in real hands: 2 in 5 instead of 1 in 5
  const rate = (withPidove) => {
    fresh('G5PIRATE' + withPidove, withPidove ? ['pidove'] : ['j_joker']);
    let hits = 0, n = 150;
    for (let i = 0; i < n; i++) { const r = play([{ k: 'S_2', center: 'm_lucky' }]); if (r.mult > 15) hits++; }
    return hits / n;
  };
  const r0 = rate(false), r1 = rate(true);
  ok(r0 > 0.08 && r0 < 0.34 && r1 > 0.28 && r1 < 0.54 && r1 > r0, 'played Lucky cards trigger their +20 Mult about 1 in 5 alone, about 2 in 5 with Pidove', [r0, r1]);
});
await sec('tranquill unfezant', () => {
  // forced: Oops x2.5 makes (1 + 1) x 2.5 = 5 in 5 for the Mult roll
  const [t] = fresh('G5TR1', ['tranquill']);
  G.GAME.probabilities.normal = 2.5;
  let r = play([{ k: 'S_2', center: 'm_lucky' }]);
  ok(near(r.mult, 1 + 20 + 5), 'Tranquill: the Lucky card triggers (+20) and gives +5 Mult', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1), 'an unenhanced card: nothing', r.total);
  r = play([{ k: 'S_2', center: 'm_lucky' }, { k: 'H_2', center: 'm_lucky' }]);
  ok(near(r.mult, 2 + 25 + 25), 'a Pair of triggering Lucky cards: +25 each', r.total);
  G.GAME.probabilities.normal = 1;
  add('j_poke_absol'); // no Lucky card can trigger
  r = play([{ k: 'S_2', center: 'm_lucky' }]);
  ok(near(r.mult, 1 * 2), 'a Lucky card that doesn\'t trigger (Absol fixes its odds at 0): no +20, no +5 (only Absol\'s own X2)', r.total);
  ok(/When a Lucky card triggers, it also gives \+5 Mult/.test(flat(t)), 'Tranquill tooltip', flat(t));
  const [u] = fresh('G5UN1', ['unfezant']);
  G.GAME.probabilities.normal = 2.5;
  r = play([{ k: 'S_2', center: 'm_lucky' }]);
  ok(near(r.mult, (1 + 20) * 1.5), 'Unfezant: the triggering Lucky card X1.5 ((1 + 20) x 1.5)', r.total);
  r = play([{ k: 'S_2', center: 'm_lucky', seal: 'Red' }]);
  ok(near(r.mult, ((1 + 20) * 1.5 + 20) * 1.5), 'a Red Seal Lucky card: each scoring triggers and gets X1.5', r.total);
  ok(/gives X1.5 Mult/.test(flat(u)), 'Unfezant tooltip', flat(u));
  // Blueprint copies the payoff
  fresh('G5UN2', ['j_blueprint', 'unfezant']);
  G.GAME.probabilities.normal = 2;   // Unfezant +1 only (Blueprint never copies the odds): (1 + 1) x 2 = 4 in 5
  let hit = null;
  for (let i = 0; i < 30 && !hit; i++) { const rr = play([{ k: 'S_2', center: 'm_lucky' }]); if (rr.mult > 15) hit = rr; }
  ok(hit && near(hit.mult, (1 + 20) * 1.5 * 1.5), 'Blueprint copies the X1.5 on a triggering Lucky card', hit && hit.total);
  // Starly's flock counts all three (Colorless)
  fresh('G5FLOCK', ['starly', 'pidove', 'tranquill', 'unfezant']);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 2 * 4), 'Starly: +2 per Colorless Joker, the three birds included (4)', r.total);
});

// ------------------------------------------------------------------- Blitzle / Zebstrika: Motor Drive
await sec('blitzle', () => {
  const [b] = fresh('G5BL1', ['blitzle']);
  ok(/Currently \+4 Mult/.test(flat(b)), 'tooltip before the first hand: +4', flat(b));
  let r = play(['S_2']);
  ok(near(r.mult, 1 + 4), 'the round\'s 1st hand (no discard): +4 (this one counts)', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 8), 'the 2nd: +8', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 12), 'the 3rd: +12', r.total);
  discard({ hook: true });
  r = play(['S_2']);
  ok(near(r.mult, 1 + 16), 'a forced discard (The Hook) isn\'t yours: the 4th hand +16', r.total);
  discard();
  ok(/Currently \+0 Mult/.test(flat(b)), 'after a discard: Currently +0', flat(b));
  r = play(['S_2']);
  ok(near(r.mult, 1), 'after your discard: nothing for the rest of the round', r.total);
  nextRound();
  r = play(['S_2']);
  ok(near(r.mult, 1 + 4), 'the next round starts again: +4', r.total);
  // a discard BEFORE the first hand: the whole round is off
  nextRound(); discard();
  r = play(['S_2']);
  ok(near(r.mult, 1), 'a discard before the first hand: +0 all round', r.total);
  // Blueprint copies it
  fresh('G5BL2', ['j_blueprint', 'blitzle']);
  r = play(['S_2']); r = play(['S_2']);
  ok(near(r.mult, 1 + 8 + 8), 'Blueprint copies +8 on the 2nd hand', r.total);
});
await sec('zebstrika', () => {
  const [z] = fresh('G5ZE1', ['zebstrika']);
  let r = play(['S_2']);
  ok(near(r.mult, 1.5), 'no discard yet: X1.5', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1.5), 'still none: X1.5', r.total);
  ok(/Active!/.test(flat(z)), 'tooltip: Active!', flat(z));
  discard();
  r = play(['S_2']);
  ok(near(r.mult, 1), 'after a discard: X1 for the rest of the round', r.total);
  ok(/Inactive/.test(flat(z)), 'tooltip: Inactive', flat(z));
  nextRound();
  r = play(['S_2']);
  ok(near(r.mult, 1.5), 'the next round: X1.5 again', r.total);
});

// ------------------------------------------------------------------- Woobat / Swoobat: Heart Stamp
await sec('woobat', () => {
  const [w] = fresh('G5WO1', ['woobat']);
  let r = play(['H_2']);
  ok(r.dollars === 1 && near(r.mult, 1), 'a scored Heart: $1', r);
  r = play(['H_2', 'H_9', 'H_K', 'H_5', 'H_7']);
  ok(r.dollars === 5, 'a Flush of 5 Hearts: $5', r.dollars);
  r = play(['S_2']);
  ok(r.dollars === 0, 'a Spade: nothing', r.dollars);
  r = play([{ k: 'S_2', center: 'm_wild' }]);
  ok(r.dollars === 1, 'a Wild card counts as a Heart: $1', r.dollars);
  r = play([{ k: 'H_2', debuff: true }]);
  ok(r.dollars === 0, 'a debuffed Heart: nothing', r.dollars);
  r = play(['H_2', 'S_2']);
  ok(r.dollars === 1, 'a Pair with one Heart: $1', r.dollars);
  ok(/Heart Stamp: each scored Heart card earns \$1/.test(flat(w)), 'tooltip', flat(w));
  const [s] = fresh('G5SW1', ['swoobat']);
  r = play(['H_2']);
  ok(r.dollars === 1 && near(r.mult, 1.1), 'Swoobat: a Heart, $1 and X1.1', r);
  r = play(['H_2', 'D_2']);
  ok(r.dollars === 1 && near(r.mult, 2 * 1.1), 'a Pair, one Heart: X1.1 once', r);
  r = play(['H_2', 'H_9', 'H_K', 'H_5', 'H_7']);
  ok(r.dollars === 5 && near(r.mult, 4 * Math.pow(1.1, 5)), '5 Hearts: $5 and X1.1^5', r);
  fresh('G5SW2', ['j_blueprint', 'swoobat']);
  r = play(['H_2']);
  ok(r.dollars === 2 && near(r.mult, 1.21), 'Blueprint copies the $ and the X', r);
  ok(s, 'ok');
});

// ------------------------------------------------------------------- Timburr / Gurdurr / Conkeldurr: Stone cards
await sec('timburr', () => {
  const stone = () => ({ k: 'S_2', center: 'm_stone' });
  const [t] = fresh('G5TI1', ['timburr']);
  let r = play([stone()]);
  ok(r.chips === 5 + 50 && near(r.mult, 1 + 4), 'a scored Stone card: +4 Mult (its own +50 Chips)', r.total);
  r = play([stone(), stone(), 'S_K']);
  ok(near(r.mult, 1 + 8), 'two Stone cards (and a King): +4 each', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1), 'no Stone card: nothing', r.total);
  const [g] = fresh('G5GU1', ['gurdurr']);
  r = play([stone()]);
  ok(near(r.mult, 1 + 8), 'Gurdurr: +8', r.total);
  const [c] = fresh('G5CO1', ['conkeldurr']);
  r = play([stone()]);
  ok(near(r.mult, (1 + 8) * 1.5), 'Conkeldurr: +8 and X1.5', r.total);
  r = play([stone(), stone()]);
  ok(near(r.mult, ((1 + 8) * 1.5 + 8) * 1.5), 'two Stone cards: each +8 then X1.5', r.total);
  // stacks with Regirock (+100 instead of +50) and Hippowdon (+60 extra Chips)
  fresh('G5CO2', ['conkeldurr', 'regirock', 'hippowdon']);
  r = play([stone()]);
  ok(r.chips === 5 + 100 + 60 && near(r.mult, (1 + 8) * 1.5), 'with Regirock and Hippowdon: 5 + 100 + 60 Chips, +8 X1.5 Mult', r.total);
  ok(t && g && c, 'ok');
});

// ------------------------------------------------------------------- Tympole / Palpitoad / Seismitoad: Swift Swim
await sec('rain: forecast', () => {
  let [t] = deal('G5RA1', CLUBS, ['tympole']);
  ok(/Raining!/.test(flat(t)), 'first deal 5 Clubs / 2 red / 1 Spade (Rainy forecast): Raining!', flat(t));
  let r = play(['S_2']);
  ok(r.chips === 7 + 60, 'raining: +30 doubled (+60)', r.total);
  r = play(['S_2']);
  ok(r.chips === 7 + 60, 'the whole round', r.total);
  [t] = deal('G5RA2', REDS, ['tympole']);
  ok(/Not raining/.test(flat(t)), 'a red first deal: Not raining', flat(t));
  r = play(['S_2']);
  ok(r.chips === 7 + 30, 'not raining: +30', r.total);
  [t] = deal('G5RA3', TIE, ['tympole']);
  r = play(['S_2']);
  ok(r.chips === 7 + 30, 'a tie for the top (3 Clubs, 3 red): not raining', r.total);
  // the forecast is read once: later draws don't change it
  [t] = deal('G5RA4', CLUBS, ['palpitoad']);
  r = play(['S_2']);
  ok(r.chips === 7 + 100, 'Palpitoad in the rain: +50 doubled', r.total);
  // a Tympole bought after the first deal hasn't read this round
  [t] = deal('G5RA5', CLUBS, ['j_joker']);
  const late = add('j_poke_tympole');
  r = play(['S_2']);
  ok(r.chips === 7 + 30 && /Not raining yet/.test(flat(late)), 'bought after the first deal: no forecast this round (+30)', [r.total, flat(late)]);
  // in the shop: no rain without Kyogre
  [t] = deal('G5RA6', CLUBS, ['tympole']);
  clearHand(); winRound(); flush(); act({ type: 'cash_out' }); flush();
  ok(state() === 'SHOP' && /Not raining yet/.test(flat(t)), 'in the shop (no Kyogre): Not raining yet', flat(t));
  // with Castform reading the same first deal: Castform Rainy too
  const [tc, cf] = deal('G5RA7', CLUBS, ['tympole', 'castform']);
  ok(ex(cf).form === 'rainy' && /Raining!/.test(flat(tc)), 'Castform reads the same deal Rainy', [ex(cf).form]);
});
await sec('rain: kyogre', () => {
  // Kyogre alone: raining whatever is held
  let [t] = deal('G5KY1', REDS, ['tympole', 'kyogre']);
  let r = play(['S_2']);
  ok(r.chips === 7 + 60, 'a working Kyogre (red first deal): raining, +60', r.total);
  // a debuffed Kyogre: no
  let k;
  [t, k] = deal('G5KY2', REDS, ['tympole', 'kyogre']);
  debuff(k);
  r = play(['S_2']);
  ok(r.chips === 7 + 30, 'a debuffed Kyogre: not raining', r.total);
  // the shop: a held Kyogre keeps it raining
  [t] = deal('G5KY3', REDS, ['tympole', 'kyogre']);
  clearHand(); winRound(); flush(); act({ type: 'cash_out' }); flush();
  ok(/Raining!/.test(flat(t)), 'in the shop with Kyogre: Raining!', flat(t));
  // Primal Clash: Groudon wins (more red) -> no rain
  [t] = deal('G5KY4', REDS, ['tympole', 'kyogre', 'groudon']);
  ok(G.GAME.poke_primal && G.GAME.poke_primal.winner === 'groudon', 'Kyogre + Groudon, a red deal: Groudon\'s round', G.GAME.poke_primal);
  r = play(['S_2']);
  ok(r.chips === 7 + 30 && /Not raining/.test(flat(t)), 'Groudon won the clash: not raining (+30)', [r.total, flat(t)]);
  // Primal Clash: Kyogre wins (more Clubs) -> rain
  [t] = deal('G5KY5', CLUBS, ['tympole', 'kyogre', 'groudon']);
  r = play(['S_2']);
  ok(G.GAME.poke_primal.winner === 'kyogre' && r.chips === 7 + 60, 'Kyogre won the clash: raining (+60)', [G.GAME.poke_primal.winner, r.total]);
  // a tie: the one with more Energy -> Groudon -> no rain; no Energy -> Kyogre -> rain
  start('G5KY6', {}, { noBlind: true });
  t = add('j_poke_tympole'); add('j_poke_kyogre'); const gr = add('j_poke_groudon');
  increment_energy(gr, 'Earth');
  stackDeck(TIE); act({ type: 'select_blind' }); flush();
  r = play(['S_2']);
  ok(G.GAME.poke_primal.winner === 'groudon' && G.GAME.poke_primal.tie && r.chips === 7 + 30, 'a tie, Groudon has more Energy: Groudon\'s round, no rain', [G.GAME.poke_primal, r.total]);
  [t] = deal('G5KY7', TIE, ['tympole', 'kyogre', 'groudon']);
  r = play(['S_2']);
  ok(G.GAME.poke_primal.winner === 'kyogre' && r.chips === 7 + 60, 'a tie, no Energy: Kyogre (the listed first), raining', [G.GAME.poke_primal.winner, r.total]);
  // Rayquaza's calm: Kyogre works every round, so it rains even on a red deal with Groudon
  [t] = deal('G5KY8', REDS, ['tympole', 'kyogre', 'groudon', 'rayquaza']);
  r = play(['S_2']);
  ok(r.chips === 7 + 60, 'Rayquaza calms the clash: Kyogre works, raining', r.total);
  // Groudon alone doesn't stop a Clubs forecast (choice: the Cherrim rule the other way round)
  [t] = deal('G5KY9', CLUBS, ['tympole', 'groudon']);
  r = play(['S_2']);
  ok(r.chips === 7 + 60, 'Groudon alone + a Clubs first deal: still raining', r.total);
});
await sec('seismitoad', () => {
  let [s] = deal('G5SE1', CLUBS, ['seismitoad']);
  let r = play(['C_2']);
  ok(r.chips === 5 + 2 + 2 + 100, 'raining: +100 Chips and the scored Club retriggers (5 + 2 + 2 + 100)', r.total);
  r = play(['S_2']);
  ok(r.chips === 7 + 100, 'a Spade: no retrigger', r.total);
  r = play(['C_2', 'C_3', 'C_4', 'C_5', 'C_7']);
  ok(r.chips === 35 + 2 * (2 + 3 + 4 + 5 + 7) + 100, 'a Club Flush: every Club twice', r.total);
  [s] = deal('G5SE2', REDS, ['seismitoad']);
  r = play(['C_2']);
  ok(r.chips === 7 + 50, 'no rain: +50, no retrigger', r.total);
  [s] = deal('G5SE3', REDS, ['seismitoad', 'kyogre']);
  r = play(['C_2']);
  ok(r.chips === 5 + 2 * 3 + 100, 'with Kyogre (rain from Kyogre): the Club retriggers twice (Kyogre + Seismitoad)', r.total);
  ok(/While it's raining, every scored Club retriggers/.test(flat(s)), 'tooltip', flat(s));
});

// ------------------------------------------------------------------- Throh / Sawk: the Dojo Rivals
await sec('throh', () => {
  fresh('G5TH1', ['throh']);
  let r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2), 'Flush: the lowest-ranked scored card (3) gives X2', r.total);
  r = play(['S_3', 'H_3']);
  ok(near(r.mult, 2 * 2), 'a Pair of 3s (a tie): only the leftmost gives X2 (not X4)', r.total);
  r = play([{ k: 'S_3', debuff: true }, 'H_4', 'D_5', 'C_6', 'S_7']);
  ok(near(r.mult, 4 * 2), 'Straight with the 3 debuffed: the 4 gives X2 instead (a debuffed card is skipped)', r.total);
  r = play([{ k: 'S_2', center: 'm_stone' }, 'H_9']);
  ok(near(r.mult, 1 * 2), 'a Stone card (no rank) is skipped: the 9 gives X2', r.total);
  r = play(['S_A', 'H_2', 'D_3', 'C_4', 'S_5']);
  ok(near(r.mult, 4 * 2), 'a wheel (A-2-3-4-5): Aces are high, the 2 gives X2', r.total);
  r = play(['S_A', 'H_A']);
  ok(near(r.mult, 2 * 2), 'a Pair of Aces: the leftmost Ace', r.total);
  r = play([{ k: 'H_3', seal: 'Red' }, 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2 * 2), 'a Red Seal on the lowest: X2 each time it scores (X4)', r.total);
});
await sec('sawk', () => {
  fresh('G5SA1', ['sawk']);
  let r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 + 30), 'Flush: the highest-ranked scored card (the Ace) gives +30 Mult', r.total);
  r = play(['S_K', 'H_K']);
  ok(near(r.mult, 2 + 30), 'a Pair of Kings (a tie): the leftmost only, +30', r.total);
  r = play(['S_A', 'H_2', 'D_3', 'C_4', 'S_5']);
  ok(near(r.mult, 4 + 30), 'a wheel: the Ace is highest', r.total);
  r = play([{ k: 'S_A', debuff: true }, 'H_K', 'D_Q', 'C_J', 'S_T']);
  ok(near(r.mult, 4 + 30), 'Straight with the Ace debuffed: the King gives +30', r.total);
});
await sec('dojo rivals', () => {
  const [th, sa] = fresh('G5DO1', ['throh', 'sawk']);
  let r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2.5 + 45), 'both held: Throh X2.5 on the 3, Sawk +45 on the Ace (4 x 2.5 + 45)', r.total);
  ok(/Dojo Rivals: with Sawk, X0.5 more \(active: X2.5 ?\)/.test(flat(th)) && /\(active: \+45\)/.test(flat(sa)), 'tooltips: active', [flat(th), flat(sa)]);
  r = play(['S_5']);
  ok(near(r.mult, 1 * 2.5 + 45), 'a single card is both the lowest and the highest: X2.5 (Throh, left) then +45 (Sawk)', r.total);
  debuff(sa);
  r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2), 'Sawk debuffed: no rivalry, Throh X2', r.total);
  ok(/needs Sawk/.test(flat(th)), 'Throh tooltip: needs Sawk', flat(th));
  // a Blueprint copying Sawk is not Sawk
  fresh('G5DO2', ['throh', 'j_blueprint']);
  add('j_poke_sawk'); G.jokers.cards.find((j) => key(j) === 'j_poke_sawk').remove(); flush();
  r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2), 'no Sawk (a Blueprint isn\'t one): X2', r.total);
  // Energy: the base grows, the rival bonus is fixed
  const [t2, s2] = fresh('G5DO3', ['throh', 'sawk']);
  increment_energy(t2, 'Fighting'); increment_energy(s2, 'Fighting');
  ok(near(ex(t2).Xmult_multi, 2.1) && near(ex(s2).mult, 42) && ex(t2).rival_x === 0.5 && ex(s2).rival_mult === 15, 'one Energy: Throh X2.1 (+0.5 = X2.6), Sawk +42 (+15 = +57)', [ex(t2), ex(s2)]);
  r = play(['H_3', 'H_7', 'H_9', 'H_J', 'H_A']);
  ok(near(r.mult, 4 * 2.6 + 57), 'energized rivals: 4 x 2.6 + 57', r.total);
});

// ------------------------------------------------------------------- evolutions and Energy numbers
await sec('evolutions', () => {
  const evolve = (seed, from, type, rounds, to) => {
    start(seed);
    const j = add('j_poke_' + from);
    increment_energy(j, type);
    for (let i = 0; i < rounds - 1; i++) nextRound();
    const still = key(j) === 'j_poke_' + from;
    nextRound();
    return { j, still, now: key(j) === 'j_poke_' + to };
  };
  let e = evolve('G5EV1', 'patrat', 'Colorless', 4, 'watchog');
  ok(e.still && e.now && near(ex(e.j).mult, 14) && G.GAME.scry_amount === 2, 'Patrat -> Watchog after 4 rounds; its Energy re-applied (+10 -> +14); +2 Foresight (not 3)', [key(e.j), ex(e.j), G.GAME.scry_amount]);
  e = evolve('G5EV2', 'lillipup', 'Colorless', 4, 'herdier');
  ok(e.still && e.now && near(ex(e.j).mult, 4.2), 'Lillipup -> Herdier after 4; the carried Energy (3 -> 4.2)', [key(e.j), ex(e.j)]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(e.j) === 'j_poke_stoutland' && near(ex(e.j).mult, 4.2), '... -> Stoutland after 5 more: +4.2 per consumable (Energy from Lillipup)', [key(e.j), ex(e.j)]);
  e = evolve('G5EV3', 'purrloin', 'Dark', 4, 'liepard');
  ok(e.still && e.now && ex(e.j).steal === 4 && ex(e.j).drain === 1, 'Purrloin -> Liepard after 4 (Energy-inert: a Dark Energy changes nothing, $4 and $1)', [key(e.j), ex(e.j)]);
  e = evolve('G5EV4', 'pidove', 'Colorless', 4, 'tranquill');
  ok(e.still && e.now && near(ex(e.j).mult, 7), 'Pidove -> Tranquill after 4; the carried Energy (+5 -> +7)', [key(e.j), ex(e.j)]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(e.j) === 'j_poke_unfezant' && near(ex(e.j).Xmult_multi, 1.575), '... -> Unfezant after 5 more: X1.575', [key(e.j), ex(e.j)]);
  e = evolve('G5EV5', 'blitzle', 'Lightning', 5, 'zebstrika');
  ok(e.still && e.now && near(ex(e.j).Xmult, 1.8), 'Blitzle -> Zebstrika after 5: X1.8', [key(e.j), ex(e.j)]);
  e = evolve('G5EV6', 'woobat', 'Psychic', 5, 'swoobat');
  ok(e.still && e.now && near(ex(e.j).Xmult_multi, 1.155) && ex(e.j).stamp_money === 1, 'Woobat -> Swoobat after 5: X1.155, still $1', [key(e.j), ex(e.j)]);
  e = evolve('G5EV7', 'timburr', 'Fighting', 5, 'gurdurr');
  ok(e.still && e.now && near(ex(e.j).mult, 11.2), 'Timburr -> Gurdurr after 5: +11.2', [key(e.j), ex(e.j)]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(e.j) === 'j_poke_conkeldurr' && near(ex(e.j).mult, 11.2) && near(ex(e.j).Xmult_multi, 1.575), '... -> Conkeldurr after 5 more: +11.2 and X1.575', [key(e.j), ex(e.j)]);
  e = evolve('G5EV8', 'tympole', 'Water', 5, 'palpitoad');
  ok(e.still && e.now && near(ex(e.j).chips, 65), 'Tympole -> Palpitoad after 5: +65', [key(e.j), ex(e.j)]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(e.j) === 'j_poke_seismitoad' && near(ex(e.j).chips, 65) && ex(e.j).retriggers === 1, '... -> Seismitoad after 5 more: +65, the retrigger fixed', [key(e.j), ex(e.j)]);
});
await sec('energy', () => {
  const three = (n, type, field) => { const [j] = fresh('G5EN' + n, [n]); const v = []; for (let i = 0; i < 3; i++) { increment_energy(j, type); v.push(r3(ex(j)[field])); } return { j, v }; };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const want = {
    patrat: ['Colorless', 'mult', [8.4, 10.8, 13.2]], watchog: ['Colorless', 'mult', [14, 18, 22]], stoutland: ['Colorless', 'mult', [4.2, 5.4, 6.6]],
    tranquill: ['Colorless', 'mult', [7, 9, 11]], unfezant: ['Colorless', 'Xmult_multi', [1.575, 1.65, 1.725]],
    blitzle: ['Lightning', 'mult', [5.6, 7.2, 8.8]], zebstrika: ['Lightning', 'Xmult', [1.8, 2.1, 2.4]],
    swoobat: ['Psychic', 'Xmult_multi', [1.155, 1.21, 1.265]],
    timburr: ['Fighting', 'mult', [5.6, 7.2, 8.8]], gurdurr: ['Fighting', 'mult', [11.2, 14.4, 17.6]], conkeldurr: ['Fighting', 'Xmult_multi', [1.575, 1.65, 1.725]],
    tympole: ['Water', 'chips', [39, 48, 57]], palpitoad: ['Water', 'chips', [65, 80, 95]], seismitoad: ['Water', 'chips', [65, 80, 95]],
    throh: ['Fighting', 'Xmult_multi', [2.1, 2.2, 2.3]], sawk: ['Fighting', 'mult', [42, 54, 66]],
  };
  for (const [n, [type, field, vals]] of Object.entries(want)) {
    const { v } = three(n, type, field);
    ok(vals.every((x, i) => near(v[i], x)), n + ' Energy: ' + field + ' ' + vals.join(' / '), v);
  }
  // the fixed numbers stay
  const { j: l } = three('lillipup', 'Colorless', 'mult');
  ok(ex(l).num === 1 && ex(l).dem === 4, 'Lillipup: the 1 in 4 never energizes', ex(l));
  const { j: p } = three('pidove', 'Colorless', 'mult');
  ok(ex(p).lucky_odds === 1 && near(ex(p).mult, 11), 'Pidove: +1 Lucky odds fixed (the carried +5 grows: 11)', ex(p));
  const { j: w } = three('woobat', 'Psychic', 'Xmult_multi');
  ok(ex(w).stamp_money === 1, 'Woobat: the $1 fixed', ex(w));
  const { j: pa } = three('patrat', 'Colorless', 'mult');
  ok(ex(pa).scry === 1, 'Patrat: the Foresight fixed', ex(pa));
  // energized numbers really score
  const { j: tm } = three('timburr', 'Fighting', 'mult');
  const r = play([{ k: 'S_2', center: 'm_stone' }]);
  ok(near(r.mult, 1 + 8.8), 'Timburr with 3 Energy: a Stone card +8.8', r.total);
  // Seismitoad: energized Chips, doubled in rain
  const [s] = deal('G5ENSE', CLUBS, ['seismitoad']);
  increment_energy(s, 'Water');
  const rs = play(['S_2']);
  ok(rs.chips === 7 + 130, 'Seismitoad with 1 Energy in the rain: +65 doubled', rs.total);
  ok(tm, 'ok');
});

// ------------------------------------------------------------------- the in-game texts
await sec('texts', () => {
  start('G5T0');
  const X = {};
  for (const n of NAMES) { const j = add('j_poke_' + n); X[n] = flat(j); j.remove(); flush(); }
  console.log(JSON.stringify(X, null, 1));
  ok(/\+1 Foresight Lookout: each Foreseen card gives \+6 Mult/.test(X.patrat) && /Evolves after 4 rounds/.test(X.patrat), 'Patrat text', X.patrat);
  ok(/Pickup: at end of round, 1 in 4 chance to create a random Tarot card \(Must have room\)/.test(X.lillipup) && /Energy carries to Stoutland/.test(X.lillipup), 'Lillipup text', X.lillipup);
  ok(/\+3 Mult for each consumable card you hold/.test(X.stoutland), 'Stoutland text', X.stoutland);
  ok(/Pickpocket: earn \$2 at end of round; the Joker directly to its right loses \$1 of sell value \(Never below \$1\)/.test(X.purrloin), 'Purrloin text', X.purrloin);
  ok(/Super Luck: \+1 to the odds of Lucky cards/.test(X.pidove) && /Energy carries to Tranquill/.test(X.pidove), 'Pidove text', X.pidove);
  ok(/Motor Drive: \+4 Mult for each hand played this round before any discard/.test(X.blitzle), 'Blitzle text', X.blitzle);
  ok(/Motor Drive: X1.5 Mult if you haven't discarded this round/.test(X.zebstrika), 'Zebstrika text', X.zebstrika);
  ok(/Heart Stamp: each scored Heart card earns \$1 and gives X1.1 Mult/.test(X.swoobat), 'Swoobat text', X.swoobat);
  ok(/Scored Stone cards each give \+8 Mult and X1.5/.test(X.conkeldurr), 'Conkeldurr text', X.conkeldurr);
  ok(/Swift Swim: \+30 Chips, doubled while it's raining/.test(X.tympole) && /Rain: a working Kyogre, or Clubs held most/.test(X.tympole), 'Tympole text', X.tympole);
  ok(/Seismic Toss: the lowest ranked scored card gives X2 Mult/.test(X.throh) && /Karate Chop: the highest ranked scored card gives \+30 Mult/.test(X.sawk), 'Throh / Sawk text', [X.throh, X.sawk]);
  ok(!Object.values(X).some((s) => /ERROR|#\d#|undefined|NaN/.test(s)), 'no unfilled variables');
});

done();
