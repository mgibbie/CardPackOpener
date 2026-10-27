// The owner's Whismur line (2026-10-27; jokers/pokejokers_designs.js LINE F3; PORTING.md "The owner's Whismur line"):
//   Whismur (293) -> Loudred (294) -> Exploud (295), Colorless. Each grows when a Glass card breaks (its 1 in 4 shatter: the event
//   Glass Joker counts, `removed` cards with `shattered`), once per broken Glass card:
//     Whismur  +30 Chips,  +20 Chips per break           (glass_chips;  the gain chip_mod)
//     Loudred  +4 Mult,    +3 Mult per break, + Whismur's Chips      (glass_mult;   mult_mod)
//     Exploud  X1.5 Mult,  +X0.2 per break, + the Chips and the Mult (glass_Xmult;  Xmult_mod)
//   Energy grows ONLY the gain (+20% of its base each: +4 / +0.6 / +X0.04); the starting and banked totals are in fields energize
//   ignores, so they never re-scale (not retroactive). 4 rounds, then 5; each evolution creates a Negative Justice (one each).
// Every ability is FIRED through real plays (act) with exact numbers.
//   node micatro/tests/mods/pokermon_whismur_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const roundWon = () => { winRound(); nextRound(); };
/** Glass rolls: 'all' = every Glass card breaks (4 in 4), 'none' = none does. */
const glass = (m) => { G.GAME.probabilities.normal = m === 'all' ? 4 : 0; };
const glassCards = (keys) => hand(keys, { center: 'm_glass' });
/** Play these cards -> the hand total {chips, mult, total}. */
function score(cards) { const r = play(cards); flush(); return r.total; }
/** A plain High Card (a King, 10 chips): High Card 5 + 10 = 15 base chips, 1 Mult. */
const plainK = () => { clearHand(); return score(hand(['S_K'])); };
const justices = () => G.consumeables.cards.filter((c) => key(c) === 'c_justice');
const negJustices = () => justices().filter((c) => c.edition && c.edition.negative);
const LINE = ['whismur', 'loudred', 'exploud'];

// ------------------------------------------------------------------- pin, static data, order, family, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev === 21 && PINS.modPin('pokermon') === '3.9.1+r21', 'Pokermon contentRev 21 (pin 3.9.1+r21)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'all 3 registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('WHIS0');
  const S = 'poke_safari';
  const want = { whismur: [2, 6, 'Basic'], loudred: [S, 8, 'One'], exploud: [S, 10, 'Two'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c && c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Colorless' && c.config.extra.ptype === 'Colorless' && c.gen === 3,
      `${n}: rarity / cost / stage / Colorless / Gen 3`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  ok(C('whismur').config.extra.rounds === 4 && C('loudred').config.extra.rounds === 5 && C('exploud').config.extra.rounds === undefined, 'evolves after 4 rounds, then 5');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_shedinja');
  ok(i > 0 && keys.slice(i + 1, i + 4).join() === LINE.map((n) => 'j_poke_' + n).join() && keys[i + 4] === 'j_poke_makuhita', 'Pokédex order: after Shedinja (292), before Makuhita (296)', keys.slice(i, i + 5));
  ok(JSON.stringify(poke_get_family_list('whismur')) === JSON.stringify(LINE), 'one family', poke_get_family_list('whismur'));
  const SPR = { whismur: 14, loudred: 16, exploud: 18 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 19 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 14 / 16 / 18 at row 19)', LINE.map((n) => C(n) && [C(n).atlas, C(n).pos]));
});

// ------------------------------------------------------------------- Whismur
sec('whismur', () => {
  start('WHIS');
  const j = add('j_poke_whismur');
  glass('none');
  let t = plainK();
  ok(t.chips === 15 + 30 && t.mult === 1, 'whismur: starts at +30 Chips', t);
  // a Glass card that doesn't break: no gain
  clearHand();
  t = score(glassCards(['S_A']));
  ok(t.chips === 5 + 11 + 30 && t.mult === 2 && j.ability.extra.glass_chips === 30, 'whismur: an unbroken Glass card -> no gain (+30, Glass X2)', [t, j.ability.extra.glass_chips]);
  // a break: +20 (after the hand, as Glass Joker)
  glass('all');
  clearHand();
  t = score(glassCards(['S_A']));
  ok(t.chips === 5 + 11 + 30 && j.ability.extra.glass_chips === 50, 'whismur: a Glass card breaks -> +20 Chips (from the next hand)', [t, j.ability.extra.glass_chips]);
  glass('none');
  t = plainK();
  ok(t.chips === 15 + 50, 'whismur: and scores +50', t);
  // several breaks in one hand: each counts
  glass('all');
  clearHand();
  score(glassCards(['S_A', 'H_A', 'D_A']));
  ok(j.ability.extra.glass_chips === 50 + 3 * 20, 'whismur: 3 Glass cards break in one hand -> +60 (each counts)', j.ability.extra.glass_chips);
  // a card destroyed some other way (not a shatter) doesn't count; nor does a plain card
  glass('all');
  clearHand();
  score(hand(['S_Q']));
  ok(j.ability.extra.glass_chips === 110, 'whismur: a plain card -> no gain', j.ability.extra.glass_chips);
  const d = JSON.stringify(describe(j));
  ok(/110/.test(d) && /\b20\b/.test(d) && /Glass/.test(d) && /Justice/.test(d) && /Evolves after/.test(d), 'whismur: the tooltip shows +110, the +20 gain, Glass, the Negative Justice, the rounds', d.slice(0, 700));
  ok(justices().length === 0, 'whismur: no Justice outside an evolution');
});

// ------------------------------------------------------------------- Energy: only the gain, never the totals
sec('whismur energy', () => {
  start('WHISE');
  const j = add('j_poke_whismur');
  increment_energy(j, 'Colorless'); increment_energy(j, 'Colorless');
  ok(j.ability.extra.chip_mod === 28 && j.ability.extra.glass_chips === 30, 'whismur: 2 Energy -> +28 per break (+4 each); the starting +30 unscaled', j.ability.extra);
  glass('none');
  let t = plainK();
  ok(t.chips === 15 + 30, 'whismur (2 Energy): still scores +30', t);
  glass('all');
  clearHand();
  score(glassCards(['S_A']));
  ok(j.ability.extra.glass_chips === 58, 'whismur (2 Energy): a break -> +28 (58)', j.ability.extra.glass_chips);
  increment_energy(j, 'Colorless');
  ok(j.ability.extra.chip_mod === 32 && j.ability.extra.glass_chips === 58, 'whismur: a 3rd Energy -> +32 per break; the banked 58 is not re-scaled (not retroactive)', j.ability.extra);
  const d = JSON.stringify(describe(j));
  ok(/\b32\b/.test(d) && /\b58\b/.test(d), 'whismur: the tooltip shows the energized +32 and the current +58', d.slice(0, 700));
  glass('none');
  t = plainK();
  ok(t.chips === 15 + 58, 'whismur: scores +58', t);
});

// ------------------------------------------------------------------- the line: evolution, carry-over, Justice, Loudred, Exploud
sec('line', () => {
  start('WHISL');
  const j = add('j_poke_whismur');
  increment_energy(j, 'Colorless');
  glass('all');
  clearHand();
  score(glassCards(['S_A'])); // 30 + 24
  ok(j.ability.extra.glass_chips === 54, 'whismur (1 Energy): +24 per break', j.ability.extra.glass_chips);
  // fill the consumable slots: the Negative Justice needs no slot
  while (G.consumeables.cards.length < G.consumeables.config.card_limit) add('c_fool');
  const full = G.consumeables.cards.length;
  ok(full >= 2 && full === G.consumeables.config.card_limit, 'the consumable slots are full', [full, G.consumeables.config.card_limit]);
  glass('none');
  for (let i = 0; i < 3; i++) roundWon();
  ok(key(j) === 'j_poke_whismur' && j.ability.extra.rounds === 1 && justices().length === 0, 'whismur: 3 rounds in, 1 to go; no Justice yet', [key(j), j.ability.extra.rounds]);
  winRound();
  flush();
  ok(key(j) === 'j_poke_loudred', 'whismur -> loudred after 4 rounds', key(j));
  ok(negJustices().length === 1 && justices().length === 1 && G.consumeables.cards.length === full + 1, 'the evolution creates exactly one Negative Justice (slots full)', [justices().length, negJustices().length, G.consumeables.cards.length]);
  nextRound();
  const ex = j.ability.extra;
  ok(ex.glass_chips === 54 && ex.glass_mult === 4 && near(ex.mult_mod, 3.6) && ex.energy_count === 1 && ex.rounds === 5,
    'loudred: keeps Whismur\'s +54 Chips; starts at +4 Mult; its Energy -> +3.6 per break; 5 rounds', ex);
  glass('none');
  let t = plainK();
  ok(t.chips === 15 + 54 && t.mult === 1 + 4, 'loudred: scores Whismur\'s +54 Chips and +4 Mult', t);
  glass('all');
  clearHand();
  score(glassCards(['S_A', 'H_A']));
  ok(ex.glass_chips === 54 && near(ex.glass_mult, 4 + 2 * 3.6), 'loudred: 2 breaks -> +7.2 Mult (the Chips stay)', [ex.glass_chips, ex.glass_mult]);
  increment_energy(j, 'Colorless');
  ok(near(ex.mult_mod, 4.2) && near(ex.glass_mult, 11.2) && ex.glass_chips === 54, 'loudred: a 2nd Energy -> +4.2 per break; the totals unscaled', ex);
  const d = JSON.stringify(describe(j));
  ok(/\b54\b/.test(d) && /11\.2/.test(d) && /4\.2/.test(d) && /Justice/.test(d) && /Evolves after/.test(d), 'loudred: the tooltip shows +54 Chips, +11.2 Mult, the +4.2 gain, the Justice, the rounds', d.slice(0, 700));
  glass('none');
  for (let i = 0; i < 4; i++) roundWon();
  ok(key(j) === 'j_poke_loudred' && j.ability.extra.rounds === 1 && justices().length === 1, 'loudred: 4 rounds in, 1 to go; still one Justice', [key(j), j.ability.extra.rounds, justices().length]);
  winRound();
  flush();
  ok(key(j) === 'j_poke_exploud', 'loudred -> exploud after 5 more rounds', key(j));
  ok(negJustices().length === 2 && justices().length === 2, 'the second evolution creates one more Negative Justice (two over the line)', justices().length);
  nextRound();
  const ex3 = j.ability.extra;
  ok(ex3.glass_chips === 54 && near(ex3.glass_mult, 11.2) && ex3.glass_Xmult === 1.5 && near(ex3.Xmult_mod, 0.28) && ex3.energy_count === 2,
    'exploud: keeps +54 Chips and +11.2 Mult; starts at X1.5; its 2 Energy -> +X0.28 per break', ex3);
  t = plainK();
  ok(t.chips === 15 + 54 && near(t.mult, (1 + 11.2) * 1.5), 'exploud: scores the Chips, the Mult and X1.5', t);
  glass('all');
  clearHand();
  score(glassCards(['S_A']));
  ok(near(ex3.glass_Xmult, 1.78) && ex3.glass_chips === 54 && near(ex3.glass_mult, 11.2), 'exploud: a break -> +X0.28 (X1.78)', ex3);
  increment_energy(j, 'Colorless');
  ok(near(ex3.Xmult_mod, 0.32) && near(ex3.glass_Xmult, 1.78), 'exploud: a 3rd Energy -> +X0.32 per break; X1.78 unscaled', ex3);
  const d3 = JSON.stringify(describe(j));
  ok(/\b54\b/.test(d3) && /11\.2/.test(d3) && /1\.78/.test(d3) && /0\.32/.test(d3), 'exploud: the tooltip shows all of it (+54, +11.2, X1.78, +X0.32)', d3.slice(0, 700));
  glass('none');
  t = plainK();
  ok(t.chips === 15 + 54 && near(t.mult, (1 + 11.2) * 1.78), 'exploud: scores +54 Chips, +11.2 Mult, X1.78', t);
  for (let i = 0; i < 3; i++) roundWon();
  ok(justices().length === 2, 'exploud: no more Justice afterwards', justices().length);
});

// ------------------------------------------------------------------- the stages fresh (a Safari pick): starting values, exact gains
sec('fresh stages', () => {
  start('WHISF');
  const l = add('j_poke_loudred');
  glass('none');
  let t = plainK();
  ok(t.chips === 15 + 30 && t.mult === 1 + 4, 'loudred (fresh): Whismur\'s starting +30 Chips and +4 Mult', t);
  glass('all');
  clearHand();
  score(glassCards(['S_A']));
  ok(l.ability.extra.glass_mult === 7 && l.ability.extra.glass_chips === 30, 'loudred: a break -> exactly +3 Mult', l.ability.extra);
  l.remove_from_deck(); l.remove(); flush();
  const e = add('j_poke_exploud');
  glass('none');
  t = plainK();
  ok(t.chips === 15 + 30 && near(t.mult, (1 + 4) * 1.5), 'exploud (fresh): +30 Chips, +4 Mult, X1.5', t);
  glass('all');
  clearHand();
  score(glassCards(['S_A', 'H_A', 'D_A']));
  ok(near(e.ability.extra.glass_Xmult, 1.5 + 3 * 0.2), 'exploud: 3 breaks in one hand -> +X0.6 (X2.1)', e.ability.extra.glass_Xmult);
  increment_energy(e, 'Colorless');
  ok(near(e.ability.extra.Xmult_mod, 0.24) && near(e.ability.extra.glass_Xmult, 2.1), 'exploud: 1 Energy -> +X0.24 per break; X2.1 unscaled', e.ability.extra);
  ok(justices().length === 0, 'no Justice without an evolution');
});

sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 3 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(LINE.every((n) => J['j_poke_' + n].text.some((l) => /Glass/.test(l))) && J.j_poke_whismur.text.some((l) => /Evolves after/.test(l))
    && J.j_poke_whismur.text.some((l) => /Justice/.test(l)) && J.j_poke_loudred.text.some((l) => /Justice/.test(l)) && !J.j_poke_exploud.text.some((l) => /Justice/.test(l)),
  'Glass / Evolves / Justice in the text');
});

done();
