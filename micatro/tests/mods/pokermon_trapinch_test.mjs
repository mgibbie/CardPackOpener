// The owner's Trapinch line (2026-10-27; jokers/pokejokers_designs.js LINE F5; PORTING.md "The owner's Trapinch line"):
//   Trapinch (328) -> Vibrava (329) -> Flygon (330), Earth. Sand Pit: every card the PLAYER discards permanently banks Chips on the
//   joker (Trapinch +2, Vibrava +3 per card; `chip_mod`, energized +20% of its base each), given every hand. Effect discards (The
//   Hook, seals: `hook`) don't count. Trapinch evolves after 40 discarded cards, Vibrava after 60 more. Vibrava: +1 discard each
//   round while held (fixed). Flygon keeps the bank (banks no more) and gives X(1 + 0.25 per discard used this round; `Xmult_mod`,
//   energized). The bank is in no energy field (Energy is never retroactive); the bank and the Energy carry through evolution.
// Every ability is FIRED through real discards / plays / rounds (act) with exact numbers.
//   node micatro/tests/mods/pokermon_trapinch_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { discard_cards_from_highlighted } from '../../js/engine/run.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const LINE = ['trapinch', 'vibrava', 'flygon'];
const ex = (j) => j.ability.extra;
const cr = () => G.GAME.current_round;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
let ri = 0;
const fresh = (n) => Array.from({ length: n }, () => 'S_' + RANKS[ri++ % RANKS.length]);
/** A real player discard of n new cards (act 'discard'); the drawn replacements go back to the deck. */
function discard(n, { keepLeft } = {}) {
  clearHand();
  if (!keepLeft && cr().discards_left < 1) cr().discards_left = 1;
  const cs = hand(fresh(n));
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  clearHand();
  return r;
}
/** Discard `total` cards in player discards of up to 5. */
function discardCards(total) { while (total > 0) { const n = Math.min(5, total); discard(n); total -= n; } }
/** An effect discard (The Hook's path: discard_cards_from_highlighted(true)) of n cards. */
function hookDiscard(n) {
  clearHand();
  const cs = hand(fresh(n));
  G.hand.highlighted = cs.slice();
  discard_cards_from_highlighted(true);
  flush();
  clearHand();
}
function endRound() { winRound(hand(['C_2'])); flush(); }
function next() { nextRound(); clearHand(); }

// ------------------------------------------------------------------- pin, static data, order, family, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 25 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 25+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'all three registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('TRAP0');
  const want = { trapinch: [2, 6, 'Basic'], vibrava: ['poke_safari', 8, 'One'], flygon: ['poke_safari', 10, 'Two'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c && c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Earth' && c.config.extra.ptype === 'Earth' && c.gen === 3,
      `${n}: rarity / cost / stage / Earth / Gen 3`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_spinda');
  ok(i > 0 && keys[i + 1] === 'j_poke_trapinch' && keys[i + 2] === 'j_poke_vibrava' && keys[i + 3] === 'j_poke_flygon' && keys[i + 4] === 'j_poke_cacnea',
    'Pokédex order: after Spinda (327), before Cacnea (331)', keys.slice(i, i + 5));
  ok(JSON.stringify(poke_get_family_list('trapinch')) === JSON.stringify(LINE), 'one family', poke_get_family_list('trapinch'));
  const SPR = { trapinch: 24, vibrava: 26, flygon: 28 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 21 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 24 / 26 / 28 at row 21)', LINE.map((n) => C(n) && [C(n).atlas, C(n).pos]));
  ok(!('sand_chips' in energy_values) && !('sand_cards' in energy_values) && !('d_size' in energy_values) && near(energy_values.chip_mod, 0.2) && near(energy_values.Xmult_mod, 0.2),
    'Energy: the bank, the count and the discard are not energy fields; the gains (chip_mod, Xmult_mod) grow 20% of their base');
});

// ------------------------------------------------------------------- Trapinch: +2 Chips banked per discarded card
sec('trapinch bank', () => {
  start('TRAP1');
  const j = add('j_poke_trapinch');
  let t = play(hand(['S_K'])).total;
  ok(t.chips === 5 + 10, 'nothing banked yet: no Chips', t);
  discard(3);
  ok(ex(j).sand_chips === 6 && ex(j).sand_cards === 3, 'a discard of 3 cards banks +6 Chips (3 x +2) and counts 3', ex(j));
  discard(5);
  ok(ex(j).sand_chips === 16 && ex(j).sand_cards === 8, 'a discard of 5: +10 more (16), count 8', ex(j));
  discard(1);
  ok(ex(j).sand_chips === 18 && ex(j).sand_cards === 9, 'a discard of 1: +2 (18), count 9', ex(j));
  t = play(hand(['S_K'])).total;
  ok(t.chips === 5 + 10 + 18 && t.mult === 1, 'a played King: +18 banked Chips', t);
  t = play(hand(['H_9'])).total;
  ok(t.chips === 5 + 9 + 18, 'given every hand (the bank is permanent)', t);
  // an effect's discard (The Hook's path) doesn't count
  hookDiscard(2);
  ok(ex(j).sand_chips === 18 && ex(j).sand_cards === 9, 'an effect discard (hook) banks nothing and counts nothing', ex(j));
  // the bank survives the round
  next();
  t = play(hand(['S_K'])).total;
  ok(t.chips === 5 + 10 + 18, 'next round: still +18', t);
  // Blueprint copies the Chips, never the banking
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  discard(2);
  ok(ex(j).sand_chips === 22 && ex(j).sand_cards === 11, 'with a Blueprint copying it: a discard of 2 banks +4 once (22)', ex(j));
  t = play(hand(['S_K'])).total;
  ok(t.chips === 5 + 10 + 22 + 22, 'the Blueprint gives the banked Chips too (+22 twice)', t);
  const d = JSON.stringify(describe(j));
  ok(/\+22/.test(d) && /\+2\{/.test(d) && /11\/40/.test(d) && /Evolves after/.test(d) && /40/.test(d), 'the tooltip shows +22 banked, +2 per card, "Discarded: 11/40", "Evolves after 40 discarded cards"', d.slice(0, 900));
});

// ------------------------------------------------------------------- evolution at exactly 40, then exactly 60 more; the bank carries
sec('evolution', () => {
  start('TRAP2');
  const j = add('j_poke_trapinch');
  const base = G.GAME.round_resets.discards;
  discardCards(39);
  ok(ex(j).sand_cards === 39 && ex(j).sand_chips === 78, '39 discarded cards: 78 Chips banked', ex(j));
  endRound();
  ok(key(j) === 'j_poke_trapinch', '39: still Trapinch at end of round', key(j));
  next();
  discard(1);
  ok(ex(j).sand_cards === 40, '40 discarded cards', ex(j).sand_cards);
  endRound();
  ok(key(j) === 'j_poke_vibrava', 'the end of the round it reached 40: evolves into Vibrava', key(j));
  ok(ex(j).sand_chips === 80 && ex(j).sand_cards === 0 && ex(j).chip_mod === 3 && ex(j).d_size === 1, 'Vibrava keeps the 80 Chips; its count starts over; +3 per card', ex(j));
  ok(G.GAME.round_resets.discards === base + 1, 'evolving into Vibrava: +1 discard each round', [base, G.GAME.round_resets.discards]);
  next();
  ok(cr().discards_left === base + 1, 'next round starts with ' + (base + 1) + ' discards', cr().discards_left);
  discard(2);
  ok(ex(j).sand_chips === 86 && ex(j).sand_cards === 2, 'Vibrava: +3 per discarded card (80 + 6)', ex(j));
  let t = play(hand(['S_K'])).total;
  ok(t.chips === 5 + 10 + 86, 'Vibrava gives the whole bank (+86)', t);
  discardCards(57);
  ok(ex(j).sand_cards === 59 && ex(j).sand_chips === 80 + 59 * 3, '59 more: 257 banked', ex(j));
  endRound();
  ok(key(j) === 'j_poke_vibrava', '59: still Vibrava', key(j));
  next();
  discard(1);
  endRound();
  ok(key(j) === 'j_poke_flygon', '60 more discarded cards: evolves into Flygon', key(j));
  ok(ex(j).sand_chips === 260 && !('d_size' in ex(j)), 'Flygon keeps all 260 banked Chips (80 + 60 x 3)', ex(j));
  ok(G.GAME.round_resets.discards === base, 'Vibrava\'s +1 discard is removed when it evolves', [base, G.GAME.round_resets.discards]);
  next();
  ok(cr().discards_left === base, 'next round: back to ' + base + ' discards', cr().discards_left);
  discard(5);
  ok(ex(j).sand_chips === 260 && !ex(j).sand_cards, 'Flygon banks no more Chips from discards', ex(j));
  t = play(hand(['S_K'])).total;
  ok(near(t.chips, 5 + 10 + 260) && near(t.mult, 1.25), 'Flygon: +260 Chips and X1.25 (1 discard used)', t);
});

// ------------------------------------------------------------------- Vibrava's +1 discard: on gain, off on sale
sec('vibrava discard', () => {
  start('TRAP3');
  const base = G.GAME.round_resets.discards, left = cr().discards_left;
  const v = add('j_poke_vibrava');
  ok(G.GAME.round_resets.discards === base + 1 && cr().discards_left === left + 1, 'Vibrava gained: +1 discard each round, and +1 now', [base, G.GAME.round_resets.discards, left, cr().discards_left]);
  next();
  ok(cr().discards_left === base + 1, 'a new round with Vibrava: ' + (base + 1) + ' discards', cr().discards_left);
  // use them all: the 5th is Vibrava's
  for (let i = 0; i < base + 1; i++) { const r = discard(1, { keepLeft: true }); ok(r.ok, 'discard ' + (i + 1) + ' of ' + (base + 1) + ' allowed', r.error); }
  ok(cr().discards_left === 0 && cr().discards_used === base + 1, 'all ' + (base + 1) + ' used', [cr().discards_left, cr().discards_used]);
  act({ type: 'sell', id: v.sort_id }); flush();
  ok(G.GAME.round_resets.discards === base, 'sold: the +1 discard each round is gone', G.GAME.round_resets.discards);
  next();
  ok(cr().discards_left === base, 'next round after selling: ' + base + ' discards', cr().discards_left);
  const v2 = add('j_poke_vibrava');
  for (let i = 0; i < 3; i++) increment_energy(v2, 'Earth');
  ok(ex(v2).d_size === 1 && G.GAME.round_resets.discards === base + 1, 'Energy never touches the +1 discard (fixed)', ex(v2).d_size);
  v2.remove(); flush();
  ok(G.GAME.round_resets.discards === base, 'destroyed: the discard is removed too', G.GAME.round_resets.discards);
  const d = JSON.stringify(describe(add('j_poke_vibrava')));
  ok(/\+1\{\} discard/.test(d) && /Supersonic/.test(d) && /0\/60/.test(d) && /\+3\{/.test(d), 'Vibrava\'s tooltip: +1 discard, Supersonic +3, "Discarded: 0/60"', d.slice(0, 900));
});

// ------------------------------------------------------------------- Flygon: X(1 + 0.25 per discard USE this round), reset each round
sec('flygon x', () => {
  start('TRAP4');
  const f = add('j_poke_flygon');
  ex(f).sand_chips = 0;
  const xs = [];
  for (let k = 0; k <= 4; k++) {
    if (k > 0) discard(k === 2 ? 5 : 1); // (the 2nd use is 5 cards: still one use)
    xs.push(play(hand(['S_K'])).total.mult);
  }
  ok(xs.every((m, k) => near(m, 1 + 0.25 * k)), 'Flygon with 0 / 1 / 2 / 3 / 4 discards used: X1 / X1.25 / X1.5 / X1.75 / X2 (a 5-card discard counts once)', xs);
  const d = JSON.stringify(describe(f));
  ok(/X2 /.test(d) && /X0\.25/.test(d) && /poke_sand/.test(d) && /Sandstorm/.test(d), 'the tooltip: Sandstorm (poke_sand), X0.25 per discard, "Currently X2"', d.slice(0, 900));
  hookDiscard(3);
  ok(near(play(hand(['S_K'])).total.mult, 2), 'an effect discard (hook) is not a discard used: still X2');
  next();
  ok(cr().discards_used === 0 && near(play(hand(['S_K'])).total.mult, 1), 'next round: reset to X1');
  discard(2);
  ok(near(play(hand(['S_K'])).total.mult, 1.25), 'and grows again from there (X1.25)');
});

// ------------------------------------------------------------------- Energy: the gains, never retroactive; carried through evolution
sec('energy', () => {
  start('TRAP5');
  const j = add('j_poke_trapinch');
  discard(2);
  ok(ex(j).sand_chips === 4, 'before Energy: 2 cards bank 4', ex(j).sand_chips);
  const e = add('c_poke_earth_energy');
  act({ type: 'use', id: e.sort_id }); flush();
  ok(ex(j).energy_count === 1 && near(ex(j).chip_mod, 2.4), 'an Earth Energy used on Trapinch: +2.4 per card', ex(j));
  ok(ex(j).sand_chips === 4, 'not retroactive: the 4 banked stay 4', ex(j).sand_chips);
  discard(1);
  ok(near(ex(j).sand_chips, 6.4), 'the next card banks 2.4 (6.4)', ex(j).sand_chips);
  ok(near(play(hand(['S_K'])).total.chips, 5 + 10 + 6.4), 'and scores +6.4 Chips');
  increment_energy(j, 'Earth');
  ok(near(ex(j).chip_mod, 2.8), '2 Energy: +2.8', ex(j).chip_mod);
  increment_energy(j, 'Earth');
  ok(near(ex(j).chip_mod, 3.2), '3 Energy: +3.2', ex(j).chip_mod);
  const g = add('j_poke_trapinch');
  increment_energy(g, 'Colorless');
  ok(near(ex(g).chip_mod, 2.2), 'a Colorless Energy (half): +2.2', ex(g).chip_mod);
  g.remove(); flush();
  // the Energy carries: Trapinch (3 Energy) -> Vibrava +4.8 -> Flygon X0.4
  ex(j).sand_cards = 40;
  next(); endRound();
  ok(key(j) === 'j_poke_vibrava' && ex(j).energy_count === 3 && near(ex(j).chip_mod, 4.8) && near(ex(j).sand_chips, 6.4),
    'Vibrava keeps 3 Energy: +4.8 per card (3 + 3 x 0.6), and the 6.4 banked', ex(j));
  next();
  discard(1);
  ok(near(ex(j).sand_chips, 11.2), 'Vibrava energized: a card banks 4.8 (11.2)', ex(j).sand_chips);
  ex(j).sand_cards = 60;
  endRound();
  ok(key(j) === 'j_poke_flygon' && ex(j).energy_count === 3 && near(ex(j).Xmult_mod, 0.4) && near(ex(j).sand_chips, 11.2),
    'Flygon keeps 3 Energy: X0.4 per discard (0.25 + 3 x 0.05), and the bank', ex(j));
  next();
  discard(1); discard(1);
  const t = play(hand(['S_K'])).total;
  ok(near(t.mult, 1.8) && near(t.chips, 5 + 10 + 11.2), 'Flygon with 3 Energy and 2 discards used: X1.8, +11.2 Chips', t);
  const f1 = add('j_poke_flygon');
  increment_energy(f1, 'Earth');
  ok(near(ex(f1).Xmult_mod, 0.3), '1 Energy on Flygon: X0.3 per discard', ex(f1).Xmult_mod);
  increment_energy(f1, 'Earth');
  ok(near(ex(f1).Xmult_mod, 0.35), '2 Energy: X0.35', ex(f1).Xmult_mod);
  const v = add('j_poke_vibrava');
  increment_energy(v, 'Earth');
  ok(near(ex(v).chip_mod, 3.6), '1 Energy on Vibrava: +3.6 per card', ex(v).chip_mod);
});

sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 3 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(J.j_poke_trapinch.text.some((l) => /Sand Pit/.test(l)) && J.j_poke_vibrava.text.some((l) => /Supersonic/.test(l)) && J.j_poke_flygon.text.some((l) => /\{C:poke_sand\}Sandstorm/.test(l))
    && J.j_poke_trapinch.text.some((l) => /Evolves after/.test(l)) && J.j_poke_vibrava.text.some((l) => /Evolves after/.test(l)) && !J.j_poke_flygon.text.some((l) => /Evolves/.test(l)),
  'Sand Pit / Supersonic / Sandstorm in poke_sand; evolution footers on Trapinch and Vibrava only');
});

done();
