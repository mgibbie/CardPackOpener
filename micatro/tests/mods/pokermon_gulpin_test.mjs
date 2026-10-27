// The owner's Gulpin line (2026-10-27; jokers/pokejokers_designs.js LINE F4; PORTING.md "The owner's Gulpin line"):
//   Gulpin (316) -> Swalot (317), Dark. Stockpile: at the end of each round it swallows (destroys) the leftmost Hazard card held in
//   hand, else the leftmost Diamond card held in hand, and gains 1 Stockpile up to max (3; each Energy +1 — the house energy field
//   `stockpile_max`, a mismatched Colorless +0.5). Scored Diamonds give +2 Mult per Stockpile (not energized). Gulpin at max swallows
//   only Hazards; it evolves at exactly 3 Stockpile (Energy never slows it). Swalot keeps the Stockpile; a swallowed Diamond also
//   pays its rank in $ (get_id: 2-10, J 11, Q 12, K 13, A 14; fixed), even at max; and X0.1 Mult per card the deck is below its
//   starting size (energized: +X0.02 per Energy), never below X1.
// Every ability is FIRED through real rounds (act) with exact numbers.
//   node micatro/tests/mods/pokermon_gulpin_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const LINE = ['gulpin', 'swalot'];
const hz = (keys) => hand(keys, { center: 'm_poke_hazard' });
const isHz = (c) => c.config.center.key === 'm_poke_hazard';
const inDeck = (c) => G.playing_cards.includes(c);
/** Hold `held` (already in hand), win the round with one other card; -> the $ earned at end of round. */
function endRound(opts = {}) {
  G.GAME.probabilities.normal = opts.normal ?? 0; // (the Hazards' own 1 in 3: off unless asked)
  const $0 = G.GAME.dollars;
  winRound(hand(['C_2']));
  flush();
  return G.GAME.dollars - $0;
}
/** Next round, hand emptied; the Hazard layer's deal (if any) cleared out of the hand too. */
function next() { nextRound(); clearHand(); }
const ex = (j) => j.ability.extra;
/** Shrink the full deck by n (cards out of the draw pile, destroyed outright). */
function shrink(n) {
  for (let i = 0; i < n; i++) { const c = G.deck.cards[G.deck.cards.length - 1]; c.remove(); }
  flush();
}

// ------------------------------------------------------------------- pin, static data, order, family, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 24 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 24+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'both registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('GULP0');
  const want = { gulpin: [2, 6, 'Basic'], swalot: ['poke_safari', 8, 'One'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c && c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Dark' && c.config.extra.ptype === 'Dark' && c.gen === 3,
      `${n}: rarity / cost / stage / Dark / Gen 3`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_roselia');
  ok(i > 0 && keys[i + 1] === 'j_poke_gulpin' && keys[i + 2] === 'j_poke_swalot' && keys[i + 3] === 'j_poke_carvanha', 'Pokédex order: after Roselia (315), before Carvanha (318)', keys.slice(i, i + 4));
  ok(JSON.stringify(poke_get_family_list('gulpin')) === JSON.stringify(LINE), 'one family', poke_get_family_list('gulpin'));
  const SPR = { gulpin: 0, swalot: 2 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 21 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 0 / 2 at row 21)', LINE.map((n) => C(n) && [C(n).atlas, C(n).pos]));
  ok(near(energy_values.stockpile_max, 1 / 3) && C('gulpin').config.extra.stockpile_max === 3 && !('stockpile_mult' in energy_values) && !('stockpile' in energy_values),
    'Energy: the max Stockpile field grows 1/3 of its base (+1); the Mult per Stockpile and the Stockpile are not energy fields');
});

// ------------------------------------------------------------------- Gulpin: swallowing at the end of the round
sec('gulpin swallow', () => {
  start('GULP1');
  const j = add('j_poke_gulpin');
  const [h] = hz(['S_2']);
  const [d] = hand(['D_K']);
  endRound();
  ok(!inDeck(h) && !G.hand.cards.includes(h) && inDeck(d) && ex(j).stockpile === 1, 'a held Hazard is swallowed (destroyed) at end of round: +1 Stockpile; the Diamond is left alone', [inDeck(h), inDeck(d), ex(j).stockpile]);
  next();
  const [d3, dk] = hand(['D_3', 'D_K']);
  const [s9] = hand(['S_9']);
  endRound();
  ok(!inDeck(d3) && inDeck(dk) && inDeck(s9) && ex(j).stockpile === 2, 'no Hazard held: the leftmost held Diamond is swallowed instead (+1 Stockpile)', [inDeck(d3), inDeck(dk), ex(j).stockpile]);
  next();
  const [s] = hand(['S_9']);
  endRound();
  ok(inDeck(s) && ex(j).stockpile === 2 && key(j) === 'j_poke_gulpin', 'nothing to swallow (no Hazard, no Diamond): no change', [ex(j).stockpile]);
  next();
  // a played Diamond / Hazard is not held at end of round: nothing
  clearHand();
  const [pd] = hand(['D_5']);
  G.GAME.probabilities.normal = 0;
  G.GAME.chips = G.GAME.blind.chips;
  play([pd], { keepChips: true }); flush();
  ok(inDeck(pd) && ex(j).stockpile === 2, 'a played Diamond (not held) is never swallowed', ex(j).stockpile);
});

sec('gulpin hazard plumbing', () => {
  // the Hazard's own end-of-round roll (certain here) skips the one Gulpin swallowed: Qwilfish counts each destroyed card ONCE
  start('GULP2');
  const j = add('j_poke_gulpin');
  const q = add('j_poke_qwilfish');
  const q0 = ex(q).chips;
  const [a, b] = hz(['S_2', 'S_3']);
  endRound({ normal: 3 });
  ok(!inDeck(a) && !inDeck(b) && ex(j).stockpile === 1, 'two held Hazards, a sure roll: Gulpin swallows the first, the second rolls its own destroy', [inDeck(a), inDeck(b), ex(j).stockpile]);
  ok(ex(q).chips === q0 + 2 * ex(q).chip_mod, 'Qwilfish: +' + ex(q).chip_mod + ' per destroyed Hazard — the swallowed one counted once (no second roll)', [ex(q).chips - q0, ex(q).chip_mod]);
  next();
  // Spiritomb gains a spirit per destroyed playing card: a swallow is one
  const sp = add('j_poke_spiritomb');
  const s0 = ex(sp).spirits;
  hz(['S_4']);
  endRound();
  ok(ex(sp).spirits === s0 + 1 && ex(j).stockpile === 2, 'Spiritomb: +1 spirit for the swallowed Hazard', [ex(sp).spirits - s0]);
});

// ------------------------------------------------------------------- the max (Everstone keeps Gulpin at 3 / 3)
sec('gulpin max', () => {
  start('GULP3');
  const j = add('j_poke_gulpin');
  add('j_poke_everstone');
  ex(j).stockpile = 3;
  const [d] = hand(['D_K']);
  endRound();
  ok(key(j) === 'j_poke_gulpin' && inDeck(d) && ex(j).stockpile === 3, 'at max (3/3): Gulpin does NOT swallow a Diamond (it would gain nothing)', [key(j), inDeck(d), ex(j).stockpile]);
  next();
  const [h] = hz(['S_2']);
  const [d2] = hand(['D_Q']);
  endRound();
  ok(!inDeck(h) && inDeck(d2) && ex(j).stockpile === 3, 'at max: a held Hazard is still swallowed (cleared), no Stockpile gained', [inDeck(h), ex(j).stockpile]);
});

// ------------------------------------------------------------------- +2 Mult per Stockpile on scored Diamonds only
sec('gulpin mult', () => {
  start('GULP4');
  const j = add('j_poke_gulpin');
  let t = play(hand(['D_K'])).total;
  ok(t.mult === 1, 'Stockpile 0: a scored Diamond gives nothing', t);
  ex(j).stockpile = 2;
  clearHand();
  t = play(hand(['D_K'])).total;
  ok(t.chips === 5 + 10 && t.mult === 1 + 4, 'Stockpile 2: a scored Diamond gives +4 Mult (+2 per Stockpile)', t);
  clearHand();
  t = play(hand(['S_K'])).total;
  ok(t.mult === 1, 'a scored Spade gives nothing', t);
  clearHand();
  t = play(hand(['D_K', 'S_K', 'D_9'])).total;
  ok(t.mult === 2 + 4 + 4 - 4 && t.mult === 6, 'a Pair of Kings with a Diamond 9 kicker: only the scored Diamond King gives +4 (Pair 2 + 4)', t);
  clearHand();
  t = play(hand(['D_K', 'D_5', 'D_2', 'D_8', 'D_J'])).total;
  ok(t.mult === 4 + 5 * 4, 'a Diamond Flush: 5 scored Diamonds, +4 each', t);
  // Energy doesn't touch the +2 per Stockpile
  increment_energy(j, 'Dark');
  ok(ex(j).stockpile_mult === 2, 'an Energy leaves the +2 per Stockpile alone (not energized)', ex(j).stockpile_mult);
  clearHand();
  t = play(hand(['D_K'])).total;
  ok(t.mult === 1 + 4, 'with 1 Energy: still +4 for Stockpile 2', t);
  const d = JSON.stringify(describe(j));
  ok(/2\{C:inactive\}\/4 Stockpile|2.{0,20}\/4.{0,10}Stockpile/.test(d) && /\+4/.test(d) && /Evolves at/.test(d) && /\b3\b/.test(d) && /Hazard/.test(d) && /Diamond/.test(d),
    'the tooltip shows Stockpile 2/4, the current +4 Mult, Hazard / Diamond, "Evolves at 3 Stockpile"', d.slice(0, 900));
});

// ------------------------------------------------------------------- Energy: max Stockpile 3 -> 4 -> 5 (-> 6); Colorless counts half
sec('energy max', () => {
  start('GULP5');
  const j = add('j_poke_gulpin');
  ok(ex(j).stockpile_max === 3, 'max Stockpile starts at 3');
  // a real Darkness Energy card can go on Gulpin (it has an energy field)
  const e = add('c_poke_darkness_energy');
  act({ type: 'use', id: e.sort_id }); flush();
  ok(ex(j).energy_count === 1 && near(ex(j).stockpile_max, 4), 'a Darkness Energy used: max Stockpile 4', ex(j));
  increment_energy(j, 'Dark');
  ok(near(ex(j).stockpile_max, 5), '2 Energy: max 5', ex(j).stockpile_max);
  increment_energy(j, 'Dark');
  ok(near(ex(j).stockpile_max, 6), '3 Energy: max 6', ex(j).stockpile_max);
  const g = add('j_poke_gulpin');
  increment_energy(g, 'Colorless');
  ok(near(ex(g).stockpile_max, 3.5) && /\/3 Stockpile|0.{0,20}\/3/.test(JSON.stringify(describe(g))), 'a Colorless Energy on (Dark) Gulpin counts half: +0.5, still max 3', ex(g).stockpile_max);
  increment_energy(g, 'Colorless');
  ok(near(ex(g).stockpile_max, 4), 'two Colorless: max 4', ex(g).stockpile_max);
});

// ------------------------------------------------------------------- evolution at exactly 3 (Energy never slows it), carry-over
sec('evolution', () => {
  start('GULP6');
  const j = add('j_poke_gulpin');
  increment_energy(j, 'Dark'); // max 4
  for (let i = 0; i < 2; i++) { hz(['S_2']); endRound(); next(); }
  ok(key(j) === 'j_poke_gulpin' && ex(j).stockpile === 2, 'Stockpile 2: still Gulpin', [key(j), ex(j).stockpile]);
  hand(['D_7']);
  endRound();
  ok(key(j) === 'j_poke_swalot', 'the 3rd swallow (Stockpile 3, max 4): evolves into Swalot that end of round', key(j));
  ok(ex(j).stockpile === 3 && near(ex(j).stockpile_max, 4) && ex(j).energy_count === 1 && near(ex(j).Xmult_mod, 0.12) && ex(j).stockpile_mult === 2,
    'Swalot keeps Stockpile 3, its Energy (max 4, X0.12 per card)', ex(j));
  next();
  // Swalot gains up to its max (4), then stops
  hz(['S_2']); endRound(); next();
  ok(ex(j).stockpile === 4, 'Swalot: +1 Stockpile up to max (4)', ex(j).stockpile);
  hz(['S_3']); endRound();
  ok(ex(j).stockpile === 4, 'Swalot at max: swallows the Hazard, no more Stockpile', ex(j).stockpile);
  const t0 = MODS.pokermon.content.loc.descriptions.Joker.j_poke_gulpin.text.join(' ');
  ok(/Evolves at/.test(t0), 'Gulpin\'s text says "Evolves at"');
});

// ------------------------------------------------------------------- Swalot: $ by rank (fixed), the deck-size X Mult
sec('swalot money', () => {
  start('GULP7');
  const s = add('j_poke_swalot');
  const pays = [];
  for (const k of ['D_A', 'D_K', 'D_Q', 'D_J', 'D_T', 'D_7', 'D_2']) {
    hand([k]);
    pays.push(endRound());
    next();
  }
  ok(JSON.stringify(pays) === JSON.stringify([14, 13, 12, 11, 10, 7, 2]), 'Swalot: a swallowed Diamond earns its rank in $ (A 14, K 13, Q 12, J 11, 10, 7, 2)', pays);
  ok(ex(s).stockpile === 3, 'Swalot (fresh): +1 Stockpile per swallow up to max 3', ex(s).stockpile);
  // at max it still swallows a Diamond for the money
  const [d] = hand(['D_9']);
  const $ = endRound();
  ok(!inDeck(d) && $ === 9 && ex(s).stockpile === 3, 'Swalot at max: still swallows a Diamond and earns $9', [$, inDeck(d)]);
  next();
  // a Hazard first: no money
  hz(['S_2']); hand(['D_A']);
  ok(endRound() === 0, 'Swalot: a held Hazard is swallowed first (no $; the Diamond stays)');
  next();
  // Energy never touches the money
  for (let i = 0; i < 3; i++) increment_energy(s, 'Dark');
  hand(['D_A']);
  ok(endRound() === 14 && ex(s).energy_count === 3 && near(ex(s).stockpile_max, 6) && ex(s).stockpile === 4, 'Swalot with 3 Energy: still $14 for an Ace (money not energized); max 6, so Stockpile 4', ex(s));
  next();
  // Scored Diamonds: +2 per Stockpile (Stockpile 4: +8)
  const t = play(hand(['D_K'])).total;
  const x = Math.max(1, 1 + ex(s).Xmult_mod * (G.GAME.starting_deck_size - G.playing_cards.length)); // (the swallows shrank the deck)
  ok(near(t.mult, (1 + 8) * x), 'Swalot: a scored Diamond gives +8 Mult at Stockpile 4 (then its deck X' + x + ')', [t, x]);
});

sec('swalot xmult', () => {
  start('GULP8');
  const s = add('j_poke_swalot');
  const size0 = G.GAME.starting_deck_size;
  ok(size0 === 52 && G.playing_cards.length === 52, 'the run starts with 52 cards', [size0, G.playing_cards.length]);
  // the deck bigger than at the start: X1 (never below), no X shown
  let t = play(hand(['S_K'])).total;
  ok(t.mult === 1, 'deck at 53 (above its start): X1, never below', [t, G.playing_cards.length]);
  clearHand();
  shrink(6); // 52 + 1 (the King above) - 6 = 47; the next hand's card makes 48: 4 below
  t = play(hand(['S_Q'])).total;
  ok(G.playing_cards.length === 48 && near(t.mult, 1.4), '4 cards below the starting 52: X1.4', [t, G.playing_cards.length]);
  const d = JSON.stringify(describe(s));
  ok(/X1\.4/.test(d) && /0\.1/.test(d) && /starting deck/.test(d), 'the tooltip shows X0.1 per card and "(Currently X1.4)"', d.slice(0, 900));
  clearHand();
  shrink(6); // 42: 10 below
  t = play(hand(['S_J'])).total; // 43: 9 below
  ok(near(t.mult, 1.9), '9 below: X1.9', [t, G.playing_cards.length]);
  // energized per-card X: +0.02 per Darkness Energy, +0.01 per Colorless
  increment_energy(s, 'Dark');
  ok(near(ex(s).Xmult_mod, 0.12), '1 Darkness Energy: X0.12 per card', ex(s).Xmult_mod);
  clearHand();
  t = play(hand(['S_T'])).total; // 44: 8 below
  ok(near(t.mult, 1 + 0.12 * 8), '8 below with 1 Energy: X1.96', [t, G.playing_cards.length]);
  increment_energy(s, 'Dark');
  ok(near(ex(s).Xmult_mod, 0.14), '2 Energy: X0.14 per card', ex(s).Xmult_mod);
  increment_energy(s, 'Colorless');
  ok(near(ex(s).Xmult_mod, 0.15), '+ a Colorless (half): X0.15 per card', ex(s).Xmult_mod);
  const s2 = add('j_poke_swalot');
  for (let i = 0; i < 3; i++) increment_energy(s2, 'Dark');
  ok(near(ex(s2).Xmult_mod, 0.16), '3 Darkness Energy: X0.16 per card', ex(s2).Xmult_mod);
  // the swallow itself shrinks the deck
  s2.remove(); flush();
  nextRound(); clearHand();
  const n0 = G.playing_cards.length;
  const [d4] = hand(['D_4']);
  endRound(); // (+ the C_2 that wins it)
  ok(!inDeck(d4) && G.playing_cards.length === n0 + 1, 'a swallowed card leaves the full deck (D_4 and the winning C_2 added, D_4 gone)', [n0, G.playing_cards.length]);
});

sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 2 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(LINE.every((n) => J['j_poke_' + n].text.some((l) => /Hazard/.test(l)) && J['j_poke_' + n].text.some((l) => /Diamond/.test(l)) && J['j_poke_' + n].text.some((l) => /Stockpile/.test(l)))
    && J.j_poke_swalot.text.some((l) => /rank/.test(l)) && J.j_poke_swalot.text.some((l) => /starting deck/.test(l)) && !J.j_poke_swalot.text.some((l) => /Evolves/.test(l)),
  'Hazard / Diamond / Stockpile in both; Swalot\'s rank money and deck X');
});

done();
