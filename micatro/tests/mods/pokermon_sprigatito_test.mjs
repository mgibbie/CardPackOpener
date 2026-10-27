// The owner's Sprigatito line (2026-10-27; jokers/pokejokers_designs.js LINE F2; PORTING.md "The owner's Sprigatito line"):
//   Sprigatito (906) -> Floragato (907) -> Meowscarada (908), a Grass starter. Hiker for Lucky cards: when a Lucky card triggers
//   (1 in 5 Mult / 1 in 15 money) it permanently gains +1 Mult and +$1 when scored (Floragato +2 / +$2) — Steamodded's perma_mult /
//   perma_p_dollars on the card, scored every time after, kept through evolution and selling. Meowscarada stops the growth; Lucky
//   cards held in hand give X1.25 Mult like Steel (Energy +5% of the base each: its per-card Xmult_multi). The Mult step takes
//   Energy (mult_mod, +20% each), the money step never (dollars); a card keeps the step it was given.
// Every ability is FIRED through real plays (act) with exact numbers.
//   node micatro/tests/mods/pokermon_sprigatito_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { has_enhancement } from '../../mods/pokermon/api.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const money = () => G.GAME.dollars;
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const roundWon = () => { winRound(); nextRound(); };
/** Lucky rolls: 'all' = every Lucky roll hits (15 in 5 / 15 in 15), 'none' = none does. */
const luck = (m) => { G.GAME.probabilities.normal = m === 'all' ? 15 : 0; };
/** A played card back into the hand (from the discard pile or the deck), the rest of the hand emptied. */
const back = (c) => { clearHand(); if (c.area) c.area.remove_card(c); G.hand.emplace(c); return c; };
const lucky = (k = 'S_A') => hand([k], { center: 'm_lucky' })[0];
/** Play these cards; [hand_total, $ earned]. */
function score(cards) {
  const m0 = money();
  const r = play(cards);
  flush();
  return [r.total, money() - m0, r];
}
const LINE = ['sprigatito', 'floragato', 'meowscarada'];

// ------------------------------------------------------------------- pin, static data, order, family, starter
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 20 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 20+ (21 since the Whismur line)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'all 3 registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  // base Pokermon owns the species: no add-on copy
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('SPRIG0');
  const S = 'poke_safari';
  const want = { sprigatito: [2, 5, 'Basic'], floragato: [S, 8, 'One'], meowscarada: [S, 10, 'Two'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Grass' && c.config.extra.ptype === 'Grass' && c.gen === 9,
      `${n}: rarity / cost / stage / Grass / Gen 9`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  ok(C('sprigatito').config.extra.rounds === 5 && C('floragato').config.extra.rounds === 5 && C('meowscarada').config.extra.rounds === undefined,
    'evolves after 5 rounds, then 5 more (the starter pace: Chikorita / Totodile 5)');
  ok(C('sprigatito').config.extra.mult_mod === 1 && C('sprigatito').config.extra.dollars === 1 && C('floragato').config.extra.mult_mod === 2
    && C('floragato').config.extra.dollars === 2 && C('meowscarada').config.extra.Xmult_multi === 1.25, 'steps: +1 / +$1, +2 / +$2; X1.25');
  ok(C('sprigatito').starter === true && C('sprigatito').attributes.includes('starter') && starter_lists().grass.includes('j_poke_sprigatito')
    && !starter_lists().grass.includes('j_poke_floragato') && !starter_lists().grass.includes('j_poke_meowscarada'), 'Sprigatito is a Grass starter (the Starter Pack); its evolutions are not');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_ursaluna');
  ok(i > 0 && keys.slice(i + 1, i + 4).join() === LINE.map((n) => 'j_poke_' + n).join(), 'Pokédex order: after Ursaluna (901)', keys.slice(i, i + 5));
  ok(JSON.stringify(poke_get_family_list('sprigatito')) === JSON.stringify(LINE), 'one family', poke_get_family_list('sprigatito'));
  const SPR = { sprigatito: 10, floragato: 12, meowscarada: 14 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 60 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 10 / 12 / 14 at row 60)', LINE.map((n) => [C(n).atlas, C(n).pos]));
});

// ------------------------------------------------------------------- Sprigatito
sec('sprigatito', () => {
  start('SPRIG');
  const j = add('j_poke_sprigatito');
  luck('all');
  const c = lucky();
  let [t, $, r] = score([c]);
  // this scoring: High Card 5 + Ace 11 chips; 1 + Lucky's +20 Mult; Lucky's $20. The growth lands after the card scored (Hiker).
  ok(t.chips === 16 && t.mult === 21 && $ === 20, 'sprigatito: the Lucky card triggers (+20 Mult, $20)', [t, $]);
  ok(c.ability.perma_mult === 1 && c.ability.perma_p_dollars === 1, 'sprigatito: the triggered card permanently gains +1 Mult and +$1', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  ok(r.events.some((e) => e.type === 'status' && /Upgrade/.test(e.message || '')), 'sprigatito: "Upgrade!"');
  const cl = describe(c).lines;
  ok(cl.includes('{C:mult}+1{} extra Mult') && cl.includes('{C:money}+$1{} when scored'), 'sprigatito: the card tooltip shows its +1 extra Mult and +$1 when scored', cl);
  luck('none');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 1 && $ === 1 && c.ability.perma_mult === 1, 'sprigatito: scored again WITHOUT a Lucky trigger: still +1 Mult and +$1 (no growth)', [t, $, c.ability.perma_mult]);
  // a plain (not Lucky) card never grows
  const plain = hand(['S_K'])[0];
  luck('all');
  score([plain]);
  ok(!plain.ability.perma_mult && !plain.ability.perma_p_dollars, 'sprigatito: a non-Lucky card doesn\'t grow');
  // a second trigger stacks
  score([back(c)]);
  ok(c.ability.perma_mult === 2 && c.ability.perma_p_dollars === 2, 'sprigatito: a second trigger -> +2 Mult / +$2', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  luck('none');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 2 && $ === 2, 'sprigatito: and it scores +2 Mult / $2', [t, $]);
  // a non-Lucky played card's perma bonus: the enhancement may change, the bonus stays (Steamodded keeps perma_*)
  c.set_ability(P_CENTERS.m_bonus, null, true);
  [t, $] = score([back(c)]);
  ok(t.chips === 5 + 11 + 30 && t.mult === 1 + 2 && $ === 2, 'sprigatito: the card turned Bonus keeps +2 Mult / +$2', [t, $]);
  c.set_ability(P_CENTERS.m_lucky, null, true);
  // a debuffed card scores nothing (perma money included)
  c.ability.perma_debuff = true; c.set_debuff(true);
  [t, $] = score([back(c)]);
  ok($ === 0, 'sprigatito: a debuffed card pays nothing', [t, $]);
  c.ability.perma_debuff = undefined; c.set_debuff(false);
  ok(key(j) === 'j_poke_sprigatito', 'still Sprigatito');
});
sec('sprigatito energy', () => {
  start('SPRIGE');
  const j = add('j_poke_sprigatito');
  increment_energy(j, 'Grass'); increment_energy(j, 'Grass');
  ok(near(j.ability.extra.mult_mod, 1.4) && j.ability.extra.dollars === 1, 'sprigatito: 2 Grass Energy -> +1.4 Mult per trigger; the money stays $1', j.ability.extra);
  luck('all');
  const c = lucky();
  score([c]);
  ok(near(c.ability.perma_mult, 1.4) && c.ability.perma_p_dollars === 1, 'sprigatito (2 Energy): the card gains +1.4 Mult and +$1', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  increment_energy(j, 'Grass');
  ok(near(j.ability.extra.mult_mod, 1.6) && j.ability.extra.dollars === 1, 'sprigatito: a 3rd Energy -> +1.6; money $1', j.ability.extra);
  ok(near(c.ability.perma_mult, 1.4), 'sprigatito: later Energy doesn\'t re-grow a card already grown (it keeps +1.4)', c.ability.perma_mult);
  luck('none');
  const [t, $] = score([back(c)]);
  ok(near(t.mult, 1 + 1.4) && $ === 1, 'sprigatito: the card scores its +1.4 Mult and $1', [t, $]);
  // the tooltip shows the energized step
  const d = JSON.stringify(describe(j));
  ok(/1\.6/.test(d) && /Lucky/.test(d) && /Evolves after/.test(d), 'sprigatito: the tooltip shows the energized +1.6 (and the rounds)', d.slice(0, 600));
  // evolution re-applies the Energy to Floragato's base: 2 + 2 x 0.2 x 3 = 3.2; money $2
  for (let i = 0; i < 4; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_floragato' && near(j.ability.extra.mult_mod, 3.2) && j.ability.extra.dollars === 2 && j.ability.extra.energy_count === 3,
    'sprigatito -> floragato keeps its 3 Energy: +3.2 Mult per trigger, the money $2', [key(j), j.ability.extra]);
  nextRound();
});

// ------------------------------------------------------------------- evolution timing, Floragato, Meowscarada
sec('line', () => {
  start('SPRIGL');
  const j = add('j_poke_sprigatito');
  luck('all');
  const c = lucky();
  score([c]); // +1 / +$1
  for (let i = 0; i < 4; i++) roundWon();
  ok(key(j) === 'j_poke_sprigatito' && j.ability.extra.rounds === 1, 'sprigatito: 4 rounds in, 1 to go', [key(j), j.ability.extra.rounds]);
  winRound();
  ok(key(j) === 'j_poke_floragato' && j.ability.extra.rounds === 5, 'sprigatito -> floragato after 5 rounds', [key(j), j.ability.extra.rounds]);
  nextRound();
  ok(c.ability.perma_mult === 1 && c.ability.perma_p_dollars === 1, 'the card keeps its +1 / +$1 through the evolution', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  luck('all');
  let [t, $] = score([back(c)]);
  ok(t.mult === 1 + 20 + 1 && $ === 20 + 1, 'floragato: the card scores its +1 / $1 with the Lucky trigger', [t, $]);
  ok(c.ability.perma_mult === 3 && c.ability.perma_p_dollars === 3, 'floragato: a Lucky trigger adds +2 Mult and +$2 (now +3 / +$3)', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  luck('none');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 3 && $ === 3, 'floragato: no trigger, +3 Mult / $3 still', [t, $]);
  for (let i = 0; i < 4; i++) roundWon();
  ok(key(j) === 'j_poke_floragato' && j.ability.extra.rounds === 1, 'floragato: 4 rounds in, 1 to go', [key(j), j.ability.extra.rounds]);
  winRound();
  ok(key(j) === 'j_poke_meowscarada', 'floragato -> meowscarada after 5 more rounds', key(j));
  nextRound();

  // Meowscarada: no more growth (the card keeps +3 / +$3); a played Lucky card doesn't get the held X Mult
  luck('all');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 20 + 3 && $ === 20 + 3 && c.ability.perma_mult === 3 && c.ability.perma_p_dollars === 3,
    'meowscarada: a Lucky trigger no longer grows the card (+3 / +$3 kept), and the played Lucky card gets no X Mult', [t, $, c.ability.perma_mult]);
  luck('none');
  // a held Lucky card: X1.25
  back(c);
  const pc = hand(['S_K'])[0];
  [t] = score([pc]);
  ok(t.chips === 5 + 10 && near(t.mult, 1.25), 'meowscarada: a Lucky card held in hand gives X1.25 Mult', t);
  // two held: X1.25 twice
  back(c); const c2 = lucky('H_Q');
  [t] = score([hand(['S_K'])[0]]);
  ok(near(t.mult, 1.25 * 1.25), 'meowscarada: two held Lucky cards -> X1.25 each', [t.mult, c2.ability.name]);
  // a held non-Lucky card: nothing
  clearHand(); hand(['H_Q']);
  [t] = score([hand(['S_K'])[0]]);
  ok(t.mult === 1, 'meowscarada: a held plain card gives nothing', t);
  // Energy: X1.25 + 1.25 x 0.05 per Energy -> X1.3125, X1.375, X1.4375
  const xs = [];
  for (let e = 1; e <= 3; e++) {
    increment_energy(j, 'Grass');
    back(c);
    [t] = score([hand(['S_K'])[0]]);
    xs.push(t.mult);
  }
  ok(near(xs[0], 1.3125) && near(xs[1], 1.375) && near(xs[2], 1.4375) && near(j.ability.extra.Xmult_multi, 1.4375),
    'meowscarada: Energy +5% of X1.25 each -> X1.3125 / X1.375 / X1.4375 per held Lucky card', xs);
  const d = JSON.stringify(describe(j));
  ok(/1\.4375/.test(d) && /Steel/.test(d), 'meowscarada: the tooltip shows the energized X1.4375', d.slice(0, 600));
  // a Red Seal on the held Lucky card retriggers it, as a Steel card
  back(c); c.set_seal('Red', true, true);
  [t] = score([hand(['S_K'])[0]]);
  ok(near(t.mult, 1.4375 * 1.4375), 'meowscarada: a Red Seal retriggers the held Lucky card\'s X Mult (as Steel)', t.mult);
  c.set_seal(undefined, true, true);
  // Not a Steel card: has_enhancement, Steel Joker
  ok(!has_enhancement(c, 'm_steel'), 'meowscarada: a Lucky card is not counted as Steel');
  const sj = add('j_steel_joker');
  const before = G.playing_cards.filter((x) => x.config.center.key === 'm_steel').length;
  back(c);
  [t] = score([hand(['S_K'])[0]]);
  ok(before === 0 && near(t.mult, 1.4375), 'meowscarada: Steel Joker doesn\'t count the Lucky cards (X1, only the held X1.4375)', [before, t.mult]);
  sj.remove_from_deck(); sj.remove(); flush();

  // selling the joker: the card's bonus stays
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(!G.jokers.cards.includes(j), 'meowscarada sold');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 3 && $ === 3, 'after selling the joker the card still scores +3 Mult / $3', [t, $]);
  back(c);
  [t] = score([hand(['S_K'])[0]]);
  ok(t.mult === 1, '... and the held X Mult is gone with the joker', t);
});
sec('sprigatito sold', () => {
  start('SPRIGS');
  const j = add('j_poke_sprigatito');
  luck('all');
  const c = lucky();
  score([c]);
  act({ type: 'sell', id: j.sort_id }); flush();
  luck('none');
  const [t, $] = score([back(c)]);
  ok(!G.jokers.cards.includes(j) && t.mult === 1 + 1 && $ === 1 && c.ability.perma_mult === 1, 'sprigatito sold: the card keeps +1 Mult / +$1', [t, $]);
  // Pokermon+ on: the perma money is paid once (one hook)
  start('SPRIGP', {}, { mods: ['pokermonplus'] });
  const k = lucky();
  k.ability.perma_p_dollars = 2;
  luck('none');
  const [, $2] = score([back(k)]);
  ok($2 === 2, 'with Pokermon+ on, +$2 when scored pays $2 (not twice)', $2);
});
sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 3 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(J.j_poke_sprigatito.text.some((l) => /Lucky/.test(l)) && J.j_poke_sprigatito.text.some((l) => /Evolves after/.test(l)) && J.j_poke_meowscarada.text.some((l) => /Steel/.test(l)), 'Lucky / Evolves / Steel in the text');
});

done();
