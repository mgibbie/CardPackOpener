// The owner's Drifloon line (2026-10-28; jokers/pokejokers_designs.js LINE F9; PORTING.md "The owner's Drifloon line"):
//   Drifloon (425) -> Drifblim (426), Psychic (Ghost/Flying; the card art). Stockpile (Gulpin's counter and its `stockpile_max`
//   energy field): each PLAYER discard action gains 1 Stockpile (once per discard, not per card; effect discards don't count) up to
//   max (Drifloon 3, Drifblim 5; +1 per Energy, Colorless +0.5 floored). Spit Up: on the round's FINAL hand (hands_left 0), X(1 + 0.5
//   per Stockpile), then the Stockpile resets to 0; 0 Stockpile gives nothing and doesn't count. Drifloon evolves after 4 Spit Ups.
//   Drifblim's Aftermath: sold or destroyed -> a Negative Spectral card (seeded); not on evolving / transforming, not a Blueprint.
//   Blueprint copies the X, never charges or resets.
// Every ability is FIRED through real discards / plays / rounds / sales (act) with exact numbers.
//   node micatro/tests/mods/pokermon_drifloon_test.mjs
import { T, start, hand, add, play, nextRound, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
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
const LINE = ['drifloon', 'drifblim'];
const ex = (j) => j.ability.extra;
const cr = () => G.GAME.current_round;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
let ri = 0;
const fresh = (n) => Array.from({ length: n }, () => 'S_' + RANKS[ri++ % RANKS.length]);
/** A real player discard of n new cards (act 'discard'); the drawn replacements go back to the deck. */
function discard(n = 1) {
  clearHand();
  if (cr().discards_left < 1) cr().discards_left = 1;
  const cs = hand(fresh(n));
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  clearHand();
  return r;
}
/** An effect discard (The Hook's path: discard_cards_from_highlighted(true)) of n cards. */
function hookDiscard(n) {
  clearHand();
  const cs = hand(fresh(n));
  G.hand.highlighted = cs.slice();
  discard_cards_from_highlighted(true);
  flush();
  clearHand();
}
/** The round's FINAL hand (hands_left 1 -> 0 as it is played), forced to win so the round ends: a lone King (High Card 5 + 10 Chips,
 *  1 Mult before jokers). -> the hand's total. */
function finalHand() {
  clearHand();
  const cs = hand(['S_K']);
  cr().hands_left = 1;
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  flush();
  return res.events.find((e) => e.type === 'hand_total');
}
/** A round ended by a winning NON-final hand (2+ hands left). */
function winEarly() { clearHand(); G.GAME.chips = G.GAME.blind.chips; play(hand(['C_2']), { keepChips: true }); flush(); }
function next() { nextRound(); clearHand(); }
const negSpectrals = () => G.consumeables.cards.filter((c) => c.ability.set === 'Spectral' && c.edition && c.edition.negative);
const toFront = (j) => { G.jokers.cards.splice(G.jokers.cards.indexOf(j), 1); G.jokers.cards.unshift(j); };

// ------------------------------------------------------------------- pin, static data, order, family, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'both registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('DRIFT0');
  const want = { drifloon: [1, 5, 'Basic'], drifblim: ['poke_safari', 8, 'One'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c && c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Psychic' && c.config.extra.ptype === 'Psychic' && c.gen === 4,
      `${n}: rarity / cost / stage / Psychic / Gen 4`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_ambipom');
  ok(i > 0 && keys[i + 1] === 'j_poke_drifloon' && keys[i + 2] === 'j_poke_drifblim', 'Pokédex order: right after Ambipom (424)', keys.slice(i, i + 4));
  ok(JSON.stringify(poke_get_family_list('drifloon')) === JSON.stringify(LINE), 'one family', poke_get_family_list('drifloon'));
  const SPR = { drifloon: 8, drifblim: 10 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 28 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 8 / 10 at row 28)', LINE.map((n) => C(n) && [C(n).atlas, C(n).pos]));
  ok(['stockpile', 'spit_Xmult', 'spit_ups', 'stockpile_bonus'].every((f) => !(f in energy_values)) && near(energy_values.stockpile_max, 1 / 3),
    'Energy: only `stockpile_max` (a third of its base 3: +1) is an energy field; the X0.5, the count, Drifblim\'s +2 are not');
});

// ------------------------------------------------------------------- Stockpile: +1 per player discard ACTION, up to the cap
sec('charge', () => {
  start('DRIFT1');
  const j = add('j_poke_drifloon');
  discard(1);
  ok(ex(j).stockpile === 1, 'a discard of 1 card: 1 Stockpile', ex(j).stockpile);
  discard(5);
  ok(ex(j).stockpile === 2, 'a discard of 5 cards: +1 only (once per discard, not per card)', ex(j).stockpile);
  hookDiscard(3);
  ok(ex(j).stockpile === 2, 'an effect discard (The Hook\'s path) gains nothing', ex(j).stockpile);
  discard(2);
  ok(ex(j).stockpile === 3, 'the 3rd discard: 3 (the max)', ex(j).stockpile);
  discard(1); discard(4);
  ok(ex(j).stockpile === 3, 'at max: more discards gain nothing (3/3)', ex(j).stockpile);
  // not a Spit Up yet: an ordinary hand gives nothing and keeps the Stockpile
  const t = play(hand(['S_K'])).total;
  ok(near(t.mult, 1) && ex(j).stockpile === 3 && ex(j).spit_ups === 0, 'a hand that isn\'t the final one: no X, Stockpile kept', [t, ex(j)]);
  const d = JSON.stringify(describe(j));
  ok(/Stockpile/.test(d) && /3\{C:inactive\}\/3/.test(d) && /once per discard/.test(d) && /Spit Up/.test(d) && /X2\.5 /.test(d) && /0\/4/.test(d) && /Each Energy: \+1 max Stockpile/.test(d),
    'tooltip: "3/3 Stockpile", once per discard, Spit Up "Currently X2.5", "Spit Ups: 0/4", +1 max per Energy', d.slice(0, 1200));
  // the Stockpile stays across rounds (only a Spit Up resets it)
  winEarly(); next();
  ok(ex(j).stockpile === 3, 'a round won before the final hand: Stockpile kept into the next round', ex(j).stockpile);
});

// ------------------------------------------------------------------- Spit Up: exact X on the final hand only; reset; counting
sec('spit up', () => {
  start('DRIFT2');
  const j = add('j_poke_drifloon');
  discard(); discard();
  let t = finalHand();
  ok(near(t.mult, 2) && t.chips === 15, 'final hand with 2 Stockpile: X2 (1 + 2 x 0.5)', t);
  ok(ex(j).stockpile === 0 && ex(j).spit_ups === 1 && !ex(j).spitting, 'then the Stockpile resets to 0; Spit Ups 1', ex(j));
  next();
  discard(); discard(); discard();
  t = play(hand(['S_K'])).total;
  ok(near(t.mult, 1) && ex(j).stockpile === 3, 'not on the round\'s other hands', [t, ex(j).stockpile]);
  t = finalHand();
  ok(near(t.mult, 2.5) && ex(j).stockpile === 0 && ex(j).spit_ups === 2, 'final hand with 3 Stockpile: X2.5, reset, Spit Ups 2', [t, ex(j)]);
  next();
  discard();
  t = finalHand();
  ok(near(t.mult, 1.5) && ex(j).spit_ups === 3, '1 Stockpile: X1.5; Spit Ups 3', [t, ex(j)]);
});
sec('zero', () => {
  start('DRIFT3');
  const j = add('j_poke_drifloon');
  const t = finalHand();
  ok(near(t.mult, 1) && ex(j).stockpile === 0 && ex(j).spit_ups === 0, '0 Stockpile: the final hand gives nothing, and it doesn\'t count as a Spit Up', [t, ex(j)]);
  ok(key(j) === 'j_poke_drifloon', 'still Drifloon');
});

// ------------------------------------------------------------------- evolution after 4 Spit Ups; Stockpile + Energy carry; Drifblim cap 5
sec('evolution', () => {
  start('DRIFT4');
  const j = add('j_poke_drifloon');
  for (let k = 1; k <= 3; k++) { discard(); finalHand(); ok(key(j) === 'j_poke_drifloon' && ex(j).spit_ups === k, 'Spit Up ' + k + ': still Drifloon (' + k + '/4)', [key(j), ex(j).spit_ups]); next(); }
  ok(/3\/4/.test(JSON.stringify(describe(j))), 'the tooltip shows "Spit Ups: 3/4"');
  finalHand();
  ok(key(j) === 'j_poke_drifloon' && ex(j).spit_ups === 3, 'a 0-Stockpile final hand doesn\'t count (still 3/4)', [key(j), ex(j).spit_ups]);
  next();
  discard();
  finalHand();
  ok(key(j) === 'j_poke_drifblim', 'the 4th Spit Up: evolves into Drifblim at that round\'s end', key(j));
  ok(negSpectrals().length === 0, 'evolving makes no Aftermath Spectral', negSpectrals().length);
  next();
  for (let k = 0; k < 7; k++) discard();
  ok(ex(j).stockpile === 5, 'Drifblim: max Stockpile 5', ex(j).stockpile);
  const t = finalHand();
  ok(near(t.mult, 3.5) && ex(j).stockpile === 0, 'Drifblim\'s Spit Up with 5: X3.5, then reset', [t, ex(j).stockpile]);
  // the Stockpile carries through evolution
  next();
  const k2 = add('j_poke_drifloon');
  discard(); discard();
  ex(k2).spit_ups = 4;
  winEarly();
  ok(key(k2) === 'j_poke_drifblim' && ex(k2).stockpile === 2, 'evolving keeps the Stockpile (2)', [key(k2), ex(k2).stockpile]);
  const d = JSON.stringify(describe(k2));
  ok(/2\{C:inactive\}\/5/.test(d) && /Aftermath/.test(d) && /Negative/.test(d) && /Spectral/.test(d) && !/Evolves/.test(d), 'Drifblim tooltip: "2/5 Stockpile", Aftermath (Negative Spectral), no evolution line', d.slice(0, 1400));
});

// ------------------------------------------------------------------- Energy: +1 max per Energy (Colorless half, floored); X not energized
sec('energy', () => {
  start('DRIFT5');
  const j = add('j_poke_drifloon');
  const e = add('c_poke_psychic_energy');
  act({ type: 'use', id: e.sort_id }); flush();
  ok(ex(j).energy_count === 1 && near(ex(j).stockpile_max, 4) && ex(j).spit_Xmult === 0.5, 'a Psychic Energy used on Drifloon: max 4; X0.5 per Stockpile unchanged', ex(j));
  increment_energy(j, 'Psychic'); increment_energy(j, 'Psychic');
  for (let k = 0; k < 8; k++) discard();
  ok(ex(j).stockpile === 6, '3 Energy: max 6 (discards stop there)', ex(j).stockpile);
  const t = finalHand();
  ok(near(t.mult, 4), 'Spit Up with 6: X4 (1 + 6 x 0.5: the X is not energized)', t);
  // Colorless: half, floored
  const c = add('j_poke_drifloon');
  increment_energy(c, 'Colorless');
  ok(ex(c).c_energy_count === 1 && describe(c) && JSON.stringify(describe(c)).includes('/3 Stockpile'), 'one Colorless Energy: still max 3 (3.5 floored)', ex(c));
  increment_energy(c, 'Colorless');
  ok(JSON.stringify(describe(c)).includes('/4 Stockpile'), 'two Colorless: max 4', ex(c).stockpile_max);
  c.remove(); flush();
  // the Energy carries into Drifblim: 5 + 3 = 8
  next();
  ex(j).spit_ups = 4;
  winEarly();
  ok(key(j) === 'j_poke_drifblim' && ex(j).energy_count === 3, 'Drifblim keeps 3 Energy', [key(j), ex(j).energy_count]);
  next();
  for (let k = 0; k < 10; k++) discard();
  ok(ex(j).stockpile === 8, 'Drifblim with 3 Energy: max 8 (5 + 3)', ex(j).stockpile);
  ok(near(finalHand().mult, 5), 'its Spit Up with 8: X5');
  next();
  const b = add('j_poke_drifblim');
  increment_energy(b, 'Psychic');
  for (let k = 0; k < 7; k++) discard();
  ok(ex(b).stockpile === 6, 'a fresh Drifblim with 1 Energy: max 6', ex(b).stockpile);
});

// ------------------------------------------------------------------- Aftermath: sold or destroyed -> a Negative Spectral; not otherwise
sec('aftermath sell', () => {
  start('DRIFT6');
  const j = add('j_poke_drifblim');
  add('c_fool'); add('c_hermit');
  ok(G.consumeables.cards.length >= G.consumeables.config.card_limit, 'the consumable slots are full', [G.consumeables.cards.length, G.consumeables.config.card_limit]);
  act({ type: 'sell', id: j.sort_id }); flush();
  const s = negSpectrals();
  ok(s.length === 1 && !G.jokers.cards.includes(j), 'sold (with full slots): a Negative Spectral card is created', G.consumeables.cards.map((c) => [key(c), c.edition]));
  const first = s[0] && key(s[0]);
  // the roll is the run's seeded one: the same seed and moves give the same Spectral
  start('DRIFT6');
  const j2 = add('j_poke_drifblim');
  add('c_fool'); add('c_hermit');
  act({ type: 'sell', id: j2.sort_id }); flush();
  ok(negSpectrals().length === 1 && key(negSpectrals()[0]) === first, 'seeded: the same Spectral again (' + first + ')', negSpectrals().map(key));
  // Drifloon has no Aftermath
  start('DRIFT6b');
  const l = add('j_poke_drifloon');
  act({ type: 'sell', id: l.sort_id }); flush();
  ok(negSpectrals().length === 0, 'selling a Drifloon creates nothing');
});
sec('aftermath destroy', () => {
  start('DRIFT7');
  const j = add('j_poke_drifblim');
  j.start_dissolve(); flush();
  ok(negSpectrals().length === 1, 'destroyed (start_dissolve: Hex / Ankh\'s path): a Negative Spectral', negSpectrals().length);
  // a joker eaten by Ceremonial Dagger (getting_sliced -> joker_type_destroyed -> dissolve)
  start('DRIFT8', {}, { noBlind: true });
  const dagger = add('j_ceremonial');
  const b = add('j_poke_drifblim');
  toFront(dagger);
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(!G.jokers.cards.includes(b) && negSpectrals().length === 1, 'sliced by Ceremonial Dagger: a Negative Spectral', [G.jokers.cards.map(key), negSpectrals().length]);
  // a transform (set_ability, as evolution) is not a destruction
  start('DRIFT9');
  const t = add('j_poke_drifblim');
  t.set_ability(P_CENTERS.j_poke_drifloon, true); flush();
  ok(key(t) === 'j_poke_drifloon' && negSpectrals().length === 0, 'transformed into another joker: no Spectral', negSpectrals().length);
  // a debuffed Drifblim has no abilities
  const d = add('j_poke_drifblim');
  d.debuff = true;
  act({ type: 'sell', id: d.sort_id }); flush();
  ok(negSpectrals().length === 0, 'sold while debuffed: no Spectral', negSpectrals().length);
});

// ------------------------------------------------------------------- Blueprint / Brainstorm: copy the X; never charge, reset or Aftermath
sec('blueprint', () => {
  start('DRIFT10');
  const j = add('j_poke_drifloon');
  const bp = add('j_blueprint');
  toFront(bp);                              // Blueprint left of Drifloon: copies it, scored BEFORE it
  discard(3);
  ok(ex(j).stockpile === 1, 'with a Blueprint copying it: a discard still gains 1 once', ex(j).stockpile);
  discard(); discard();
  let t = finalHand();
  ok(near(t.mult, 2.5 * 2.5), 'Blueprint (scored first) copies the X2.5: X6.25 in all', t);
  ok(ex(j).stockpile === 0 && ex(j).spit_ups === 1, 'reset once; one Spit Up counted', ex(j));
  next();
  // Brainstorm copies the leftmost joker and is scored AFTER it: the Stockpile is still there for it
  const bs = add('j_brainstorm');
  toFront(j);
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.push(bp); // (Blueprint at the far right copies nothing)
  discard(); discard();
  t = finalHand();
  ok(near(t.mult, 2 * 2) && ex(j).stockpile === 0 && ex(j).spit_ups === 2, 'Brainstorm (scored after) copies the X2: X4; reset once, Spit Ups 2', [t, ex(j)]);
  bs.remove(); bp.remove(); flush();
  // a Blueprint copying Drifblim: sold or destroyed, it makes no Spectral
  next();
  const b = add('j_poke_drifblim');
  const bp2 = add('j_blueprint');
  toFront(bp2);
  act({ type: 'sell', id: bp2.sort_id }); flush();
  ok(negSpectrals().length === 0 && G.jokers.cards.includes(b), 'selling a Blueprint copying Drifblim: no Spectral', negSpectrals().length);
  const bp3 = add('j_blueprint');
  toFront(bp3);
  bp3.start_dissolve(); flush();
  ok(negSpectrals().length === 0, 'destroying a Blueprint copying Drifblim: no Spectral', negSpectrals().length);
});

sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 2 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(J.j_poke_drifloon.text.some((l) => /Spit Up/.test(l)) && J.j_poke_drifloon.text.some((l) => /Evolves after/.test(l)) && !J.j_poke_drifloon.text.some((l) => /Aftermath/.test(l))
    && J.j_poke_drifblim.text.some((l) => /Aftermath/.test(l)) && !J.j_poke_drifblim.text.some((l) => /Evolves/.test(l)),
  'Spit Up on both; evolution footer on Drifloon only; Aftermath on Drifblim only');
});

done();
