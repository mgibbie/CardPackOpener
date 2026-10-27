// The owner's Sprigatito line (2026-10-27; reworked in contentRev 23; jokers/pokejokers_designs.js LINE F2; PORTING.md "The owner's
// Sprigatito line" + "The Sprigatito rework"):
//   Sprigatito (906) -> Floragato (907) -> Meowscarada (908), a Grass starter. Hiker for Lucky cards: when a Lucky card triggers
//   (1 in 5 Mult / 1 in 15 money) it permanently gains +1 Mult and +$1 when scored (Floragato +2 / +$2) — Steamodded's perma_mult /
//   perma_p_dollars on the card, scored every time after, kept through evolution and selling. Sprigatito evolves after 8 Lucky
//   triggers, Floragato after 12 more (every roll that hits counts: a card hitting both counts 2, but grows once); each evolution
//   creates a Negative The Magician. Meowscarada: a Lucky card that triggers permanently gains X0.5 Mult (perma_x_mult: X1.5, X2...;
//   Energy +X0.1 on the gain, not retroactive); no more +Mult / +$, and no held-Steel X Mult.
// Every ability is FIRED through real plays (act) with exact numbers.
//   node micatro/tests/mods/pokermon_sprigatito_test.mjs
import { readFileSync } from 'fs';
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { Session } from '../../js/engine/session.js';
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
/** A Lucky card that can only hit its Mult roll (no money to roll for): one trigger is exactly 1 proc. */
const luckyMultOnly = (k = 'S_A') => { const c = lucky(k); c.ability.p_dollars = 0; return c; };
/** Play these cards; [hand_total, $ earned]. */
function score(cards) {
  const m0 = money();
  const r = play(cards);
  flush();
  return [r.total, money() - m0, r];
}
const magicians = () => G.consumeables.cards.filter((c) => key(c) === 'c_magician');
const negMagicians = () => magicians().filter((c) => c.edition && c.edition.negative);
const fillSlots = () => { while (G.consumeables.cards.length < G.consumeables.config.card_limit) add('c_fool'); return G.consumeables.cards.length; };
const LINE = ['sprigatito', 'floragato', 'meowscarada'];

// ------------------------------------------------------------------- pin, static data, order, family, starter
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 23 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 23+ (the Sprigatito rework; 20 the line, 21 the Whismur line, 22 the Type Sleeves)', PINS.modPin('pokermon'));
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
  const x = (n) => C(n).config.extra;
  ok(C('sprigatito').config.evo_rqmt === 8 && C('floragato').config.evo_rqmt === 12 && C('meowscarada').config.evo_rqmt === undefined
    && x('sprigatito').lucky_triggers === 0 && x('floragato').lucky_triggers === 0 && LINE.every((n) => x(n).rounds === undefined),
  'evolves after 8 Lucky triggers, then 12 more (no round counter any more)', LINE.map((n) => [C(n).config.evo_rqmt, x(n)]));
  ok(C('sprigatito').attributes.includes('trigger_evo') && !C('sprigatito').attributes.includes('round_evo') && C('floragato').attributes.includes('trigger_evo'),
    'attributes: trigger_evo, not round_evo', C('sprigatito').attributes);
  ok(x('sprigatito').mult_mod === 1 && x('sprigatito').dollars === 1 && x('floragato').mult_mod === 2 && x('floragato').dollars === 2
    && x('meowscarada').Xmult_mod === 0.5 && x('meowscarada').Xmult_multi === undefined && x('meowscarada').mult_mod === undefined && x('meowscarada').dollars === undefined,
  'steps: +1 / +$1, +2 / +$2; Meowscarada X0.5 (no +Mult / +$, no held X)', LINE.map(x));
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
  ok(c.ability.perma_mult === 1 && c.ability.perma_p_dollars === 1, 'sprigatito: the triggered card permanently gains +1 Mult and +$1 (once, though both rolls hit)', [c.ability.perma_mult, c.ability.perma_p_dollars]);
  ok(j.ability.extra.lucky_triggers === 2, 'sprigatito: both rolls hit (Mult and money) -> 2 Lucky triggers toward evolving', j.ability.extra.lucky_triggers);
  ok(r.events.some((e) => e.type === 'status' && /Upgrade/.test(e.message || '')), 'sprigatito: "Upgrade!"');
  const cl = describe(c).lines;
  ok(cl.includes('{C:mult}+1{} extra Mult') && cl.includes('{C:money}+$1{} when scored'), 'sprigatito: the card tooltip shows its +1 extra Mult and +$1 when scored', cl);
  luck('none');
  [t, $] = score([back(c)]);
  ok(t.mult === 1 + 1 && $ === 1 && c.ability.perma_mult === 1 && j.ability.extra.lucky_triggers === 2, 'sprigatito: scored again WITHOUT a Lucky trigger: still +1 Mult and +$1 (no growth, no count)', [t, $, c.ability.perma_mult, j.ability.extra.lucky_triggers]);
  // a plain (not Lucky) card never grows nor counts
  const plain = hand(['S_K'])[0];
  luck('all');
  score([plain]);
  ok(!plain.ability.perma_mult && !plain.ability.perma_p_dollars && j.ability.extra.lucky_triggers === 2, 'sprigatito: a non-Lucky card doesn\'t grow or count');
  // a second trigger stacks
  score([back(c)]);
  ok(c.ability.perma_mult === 2 && c.ability.perma_p_dollars === 2 && j.ability.extra.lucky_triggers === 4, 'sprigatito: a second trigger -> +2 Mult / +$2 (4 triggers counted)', [c.ability.perma_mult, c.ability.perma_p_dollars, j.ability.extra.lucky_triggers]);
  // a Mult-only hit counts 1
  const m1 = luckyMultOnly('H_A');
  score([m1]);
  ok(m1.ability.perma_mult === 1 && j.ability.extra.lucky_triggers === 5, 'sprigatito: a card hitting only its Mult roll counts 1', j.ability.extra.lucky_triggers);
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
  // Blueprint copies the growth (Hiker) but not the count
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  luck('all');
  const n0 = j.ability.extra.lucky_triggers;
  const c3 = lucky('D_A');
  score([c3]);
  ok(c3.ability.perma_mult === 2 && c3.ability.perma_p_dollars === 2 && j.ability.extra.lucky_triggers === n0 + 2, 'sprigatito + Blueprint: the card grows twice, the count still +2', [c3.ability.perma_mult, j.ability.extra.lucky_triggers - n0]);
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
  // the tooltip shows the energized step and the Lucky-trigger progress
  const d = JSON.stringify(describe(j));
  ok(/1\.6/.test(d) && /Lucky/.test(d) && /Evolves after \{C:attention,s:0\.8\}6\{C:inactive,s:0\.8\} Lucky triggers/.test(d) && /Lucky triggers: 2\/8/.test(d) && /Magician/.test(d),
    'sprigatito: the tooltip shows the energized +1.6, "Evolves after 6 Lucky triggers" (2/8) and the Negative The Magician', d.slice(0, 900));
  // evolution re-applies the Energy to Floragato's base: 2 + 2 x 0.2 x 3 = 3.2; money $2
  for (let i = 0; i < 3; i++) score([back(c)].map((x) => (luck('all'), x)));
  ok(j.ability.extra.lucky_triggers === 8 && key(j) === 'j_poke_sprigatito', 'sprigatito: 8 triggers, waits for the end of the round', [j.ability.extra.lucky_triggers, key(j)]);
  winRound(); flush();
  ok(key(j) === 'j_poke_floragato' && near(j.ability.extra.mult_mod, 3.2) && j.ability.extra.dollars === 2 && j.ability.extra.energy_count === 3 && j.ability.extra.lucky_triggers === 0,
    'sprigatito -> floragato keeps its 3 Energy: +3.2 Mult per trigger, the money $2; the count starts over', [key(j), j.ability.extra]);
  nextRound();
});

// ------------------------------------------------------------------- evolution by Lucky triggers, The Magician
sec('evolution', () => {
  start('SPRIGV');
  const j = add('j_poke_sprigatito');
  const full = fillSlots();
  ok(full >= 2 && full === G.consumeables.config.card_limit, 'the consumable slots are full', [full, G.consumeables.config.card_limit]);
  // rounds no longer evolve it
  for (let i = 0; i < 6; i++) roundWon();
  ok(key(j) === 'j_poke_sprigatito' && magicians().length === 0, 'sprigatito: 6 rounds and no Lucky trigger: still Sprigatito, no Magician', key(j));
  luck('all');
  const c = lucky();
  for (let i = 0; i < 3; i++) score([back(c)]); // 3 double procs = 6
  luck('all');
  score([luckyMultOnly('H_A')]); // 7
  ok(j.ability.extra.lucky_triggers === 7, 'sprigatito: 3 double hits + 1 single = 7', j.ability.extra.lucky_triggers);
  luck('none');
  winRound(); flush();
  ok(key(j) === 'j_poke_sprigatito' && magicians().length === 0, 'sprigatito: 7 Lucky triggers at the end of the round: not yet', key(j));
  nextRound();
  luck('all');
  score([luckyMultOnly('C_A')]); // 8
  ok(j.ability.extra.lucky_triggers === 8 && key(j) === 'j_poke_sprigatito', 'sprigatito: the 8th trigger (evolves at the end of the round)', j.ability.extra.lucky_triggers);
  luck('none');
  winRound(); flush();
  ok(key(j) === 'j_poke_floragato' && j.ability.extra.lucky_triggers === 0, 'sprigatito -> floragato after exactly 8 Lucky triggers', [key(j), j.ability.extra]);
  ok(negMagicians().length === 1 && magicians().length === 1 && G.consumeables.cards.length === full + 1,
    'the evolution creates exactly one Negative The Magician (slots full)', [magicians().length, negMagicians().length, G.consumeables.cards.length]);
  nextRound();
  ok(magicians().length === 1, 'no other Magician at the next round', magicians().length);
  // Floragato: 12 more; a double hit counts 2
  luck('all');
  for (let i = 0; i < 5; i++) score([back(c)]); // 10
  score([luckyMultOnly('D_K')]); // 11
  ok(j.ability.extra.lucky_triggers === 11 && c.ability.perma_mult === 3 * 1 + 5 * 2, 'floragato: 5 double hits + 1 single = 11; the card grew +1 x3, +2 x5', [j.ability.extra.lucky_triggers, c.ability.perma_mult]);
  luck('none');
  winRound(); flush();
  ok(key(j) === 'j_poke_floragato' && magicians().length === 1, 'floragato: 11 at the end of the round: not yet', key(j));
  nextRound();
  luck('all');
  score([back(c)]); // 13
  luck('none');
  winRound(); flush();
  ok(key(j) === 'j_poke_meowscarada', 'floragato -> meowscarada after 12+ Lucky triggers (a double hit crossing 12)', key(j));
  ok(negMagicians().length === 2 && magicians().length === 2 && G.consumeables.cards.length === full + 2, 'the second evolution: one more Negative The Magician (two over the line)', magicians().length);
  nextRound();
  ok(magicians().length === 2, 'Meowscarada makes no more', magicians().length);
  // a Floragato bought fresh, evolved by triggers: exactly 12
  start('SPRIGV2');
  const f = add('j_poke_floragato');
  luck('all');
  for (let i = 0; i < 11; i++) score([luckyMultOnly()]);
  luck('none'); winRound(); flush();
  ok(key(f) === 'j_poke_floragato', 'floragato: 11 single triggers -> not yet', key(f));
  nextRound(); luck('all'); score([luckyMultOnly()]); luck('none'); winRound(); flush();
  ok(key(f) === 'j_poke_meowscarada' && negMagicians().length === 1, 'floragato -> meowscarada at exactly 12 (+ its Magician)', [key(f), magicians().length]);
});

// ------------------------------------------------------------------- Meowscarada
sec('meowscarada', () => {
  start('MEOW');
  const j = add('j_poke_meowscarada');
  luck('all');
  const c = lucky();
  c.ability.perma_mult = 3; c.ability.perma_p_dollars = 3; // (what Sprigatito / Floragato gave it)
  let [t, $] = score([c]);
  // 1 + 20 (Lucky) + 3 (kept) Mult, $20 + $3; the X lands after the card scored (Hiker)
  ok(t.chips === 16 && t.mult === 1 + 20 + 3 && $ === 20 + 3, 'meowscarada: the triggering card scores its kept +3 / $3 (no new +Mult / +$)', [t, $]);
  ok(near(c.ability.perma_x_mult, 0.5) && c.ability.perma_mult === 3 && c.ability.perma_p_dollars === 3, 'meowscarada: one trigger -> X0.5 permanent (perma_x_mult 0.5); +Mult / +$ unchanged', c.ability);
  ok(describe(c).lines.includes('{X:mult,C:white}X1.5{} Mult'), 'meowscarada: the card tooltip shows X1.5 Mult', describe(c).lines);
  luck('none');
  [t, $] = score([back(c)]);
  ok(near(t.mult, (1 + 3) * 1.5) && $ === 3, 'meowscarada: scored later WITHOUT a trigger: X1.5 (on its +3 Mult)', [t, $]);
  luck('all');
  [t] = score([back(c)]);
  ok(near(t.mult, (1 + 20 + 3) * 1.5) && near(c.ability.perma_x_mult, 1), 'meowscarada: a second trigger scores X1.5, then X2 (perma 1.0)', [t.mult, c.ability.perma_x_mult]);
  luck('none');
  [t] = score([back(c)]);
  ok(near(t.mult, (1 + 3) * 2), 'meowscarada: X2 after two triggers', t.mult);
  // a double hit grows once
  luck('all');
  const d1 = lucky('H_A');
  score([d1]);
  ok(near(d1.ability.perma_x_mult, 0.5), 'meowscarada: a card hitting both rolls grows X0.5 once', d1.ability.perma_x_mult);
  // no held-Steel effect any more
  luck('none');
  back(c); const c2 = lucky('H_Q');
  [t] = score([hand(['S_K'])[0]]);
  ok(t.chips === 5 + 10 && t.mult === 1, 'meowscarada: Lucky cards held in hand give nothing (no held X Mult)', [t, c2.ability.name]);
  // a plain card never grows
  luck('all');
  const p = hand(['S_K'])[0];
  score([p]);
  ok(!p.ability.perma_x_mult, 'meowscarada: a non-Lucky card doesn\'t grow');
  // Energy: X0.5 + 0.5 x 0.2 per Energy -> X0.6, X0.7, X0.8 gains; not retroactive
  increment_energy(j, 'Grass');
  ok(near(j.ability.extra.Xmult_mod, 0.6), 'meowscarada: 1 Grass Energy -> +X0.6 per trigger', j.ability.extra);
  const e = lucky('C_A');
  luck('all');
  score([e]);
  ok(near(e.ability.perma_x_mult, 0.6), 'meowscarada (1 Energy): the card gains X0.6 (X1.6)', e.ability.perma_x_mult);
  increment_energy(j, 'Grass');
  ok(near(j.ability.extra.Xmult_mod, 0.7) && near(e.ability.perma_x_mult, 0.6) && near(c.ability.perma_x_mult, 1), 'meowscarada: a 2nd Energy -> X0.7; the banked X1.6 / X2 stay', [j.ability.extra.Xmult_mod, e.ability.perma_x_mult, c.ability.perma_x_mult]);
  luck('none');
  [t] = score([back(e)]);
  ok(near(t.mult, 1.6), 'meowscarada: the X0.6 card still scores X1.6', t.mult);
  luck('all');
  score([back(e)]);
  ok(near(e.ability.perma_x_mult, 1.3), 'meowscarada (2 Energy): its next trigger adds X0.7 -> X2.3', e.ability.perma_x_mult);
  increment_energy(j, 'Grass');
  ok(near(j.ability.extra.Xmult_mod, 0.8), 'meowscarada: 3 Energy -> X0.8', j.ability.extra.Xmult_mod);
  const d = JSON.stringify(describe(j));
  ok(/X0\.8 /.test(d) && /Lucky/.test(d) && /permanently/.test(d) && !/Steel/.test(d) && !/held in hand/.test(d), 'meowscarada: the tooltip shows the energized X0.8 (no Steel / held text)', d.slice(0, 700));
  // selling the joker: the cards keep their X Mult
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(!G.jokers.cards.includes(j), 'meowscarada sold');
  luck('none');
  [t, $] = score([back(c)]);
  ok(near(t.mult, (1 + 3) * 2) && $ === 3, 'after selling the joker the card still scores +3 Mult, X2 and $3', [t, $]);
});
sec('meowscarada evolved energy + Pokermon+', () => {
  start('MEOWE');
  const j = add('j_poke_floragato');
  increment_energy(j, 'Grass'); increment_energy(j, 'Grass');
  luck('all');
  for (let i = 0; i < 6; i++) score([lucky()]); // 12 (double hits)
  luck('none'); winRound(); flush();
  ok(key(j) === 'j_poke_meowscarada' && near(j.ability.extra.Xmult_mod, 0.7) && j.ability.extra.energy_count === 2, 'floragato (2 Energy) -> meowscarada: X0.5 + 2 x 0.1 = X0.7 gain', [key(j), j.ability.extra]);
  // Pokermon+ on: perma_x_mult is scored once (the engine's), with the Heatran perma fields alongside
  start('MEOWP', {}, { mods: ['pokermonplus'] });
  const k = lucky();
  k.ability.perma_x_mult = 0.5; k.ability.perma_mult = 2;
  luck('none');
  const [t] = score([back(k)]);
  ok(near(t.mult, (1 + 2) * 1.5), 'with Pokermon+ on, X1.5 from perma_x_mult scores once (not X2.25)', t.mult);
  add('j_poke_meowscarada');
  luck('all');
  const [t2] = score([back(k)]);
  ok(near(t2.mult, (1 + 20 + 2) * 1.5) && near(k.ability.perma_x_mult, 1), 'with Pokermon+ on, Meowscarada grows it once (X2 next)', [t2.mult, k.ability.perma_x_mult]);
});

// ------------------------------------------------------------------- an old save (contentRev 22: round counters)
sec('legacy extra', () => {
  start('SPRIGOLD');
  const j = add('j_poke_sprigatito');
  // the contentRev-22 shape: a round counter, no Lucky-trigger count
  j.ability.extra = { mult_mod: 1, dollars: 1, rounds: 1, ptype: 'Grass', juiced: true };
  let d;
  try { d = describe(j); } catch (e) { d = null; }
  ok(d && JSON.stringify(d).includes('Lucky triggers: 0/8'), 'an old Sprigatito\'s tooltip reads 0/8 (the count starts at 0)', d && d.lines);
  roundWon(); roundWon();
  ok(key(j) === 'j_poke_sprigatito' && j.ability.extra.lucky_triggers === 0 && j.ability.extra.rounds === undefined, 'an old Sprigatito (1 round left) doesn\'t evolve by rounds; its counter is 0', [key(j), j.ability.extra]);
  luck('all');
  for (let i = 0; i < 4; i++) score([lucky()]);
  luck('none'); winRound(); flush();
  ok(key(j) === 'j_poke_floragato', '... and evolves after 8 Lucky triggers', key(j));
  nextRound();
  // an old Floragato (alone: the one that just evolved goes)
  j.remove_from_deck(); j.remove(); flush();
  const f = add('j_poke_floragato');
  f.ability.extra = { mult_mod: 2.4, dollars: 2, rounds: 3, ptype: 'Grass', energy_count: 1 };
  luck('all');
  const c = lucky();
  score([c]);
  ok(near(c.ability.perma_mult, 2.4) && f.ability.extra.lucky_triggers === 2 && f.ability.extra.rounds === undefined, 'an old Floragato keeps its energized +2.4 and counts from 0', f.ability.extra);
  // an old Meowscarada (held X1.3125 with 1 Energy): the new ability, its Energy kept
  const m = add('j_poke_meowscarada');
  m.ability.extra = { Xmult_multi: 1.3125, ptype: 'Grass', energy_count: 1 };
  const banked = lucky('H_A'); banked.ability.perma_mult = 3; banked.ability.perma_p_dollars = 3;
  for (const x of G.jokers.cards.slice()) if (x !== m) { x.remove_from_deck(); x.remove(); }
  flush();
  luck('all');
  score([back(banked)]);
  ok(near(m.ability.extra.Xmult_mod, 0.6) && m.ability.extra.Xmult_multi === undefined && near(banked.ability.perma_x_mult, 0.6) && banked.ability.perma_mult === 3 && banked.ability.perma_p_dollars === 3,
    'an old Meowscarada switches to the new ability (1 Energy: X0.6); the card keeps its +3 / +$3', [m.ability.extra, banked.ability]);
  luck('none');
  back(banked);
  const [t] = score([hand(['S_K'])[0]]);
  ok(t.mult === 1, 'an old Meowscarada: no held Lucky X Mult', t.mult);
  ok(JSON.stringify(describe(m)).includes('X0.6 '), 'an old Meowscarada\'s tooltip shows X0.6', describe(m).lines);
});
sec('old recipe', () => {
  // a run recorded on contentRev 22 (fixtures: a Lucky deck + a starting Sprigatito, rounds 7 and 12): resuming re-simulates it on
  // the new rules ("Continue anyway" re-pins) — every move replays, the joker is never lost.
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_sprigatito_r22_recipe.json', import.meta.url), 'utf8'));
  for (const [name, rec] of [['mid', FIX.mid], ['full', FIX.full]]) {
    ok(rec.modVersions.pokermon === '3.9.1+r22', `${name}: recorded on 3.9.1+r22`, rec.modVersions);
    const diff = Session.pinDiff(rec);
    ok(diff.length === 1 && diff[0].id === 'pokermon' && diff[0].current === PINS.modPin('pokermon'), `${name}: the resume prompt names the Pokermon change`, diff);
    let s = null;
    try { s = Session.fromRecipe(rec, { repin: true }); } catch (e) { ok(false, name + ': fromRecipe threw ' + e.message); continue; }
    const jk = G.jokers.cards.filter((c) => LINE.includes(c.config.center.name));
    // (the new rules score differently, so a later move may no longer apply — a round won sooner or later: the rebuild stops there, as
    //  any resume after a rules change; never an engine error)
    ok(!s.stoppedAt || (!/engine error/.test(s.stoppedAt.error) && s.stoppedAt.index > 0), `${name}: the moves replay (or stop at a move the new rules reject, no engine error)`, s.stoppedAt);
    if (name === 'mid') ok(!s.stoppedAt && s.recipe.actions.length === rec.actions.length, 'mid: every move replays', s.stoppedAt);
    ok(jk.length === 1 && typeof jk[0].ability.extra === 'object' && jk[0].ability.extra.rounds === undefined, `${name}: the joker is there, no round counter`, jk.map((c) => [key(c), c.ability.extra]));
    const ex = jk[0] && jk[0].ability.extra;
    ok(ex && (key(jk[0]) === 'j_poke_meowscarada' ? near(ex.Xmult_mod, 0.5) : typeof ex.lucky_triggers === 'number' && ex.lucky_triggers >= 0), `${name}: ${jk[0] && key(jk[0])} on the new counter / ability`, ex);
    ok(s.recipe.modVersions.pokermon === PINS.modPin('pokermon') && Session.pinDiff(s.recipe).length === 0, `${name}: re-pinned to the current version`, s.recipe.modVersions);
    // and it keeps playing
    const st = G.STATE;
    ok(st === STATES.BLIND_SELECT || st === STATES.SELECTING_HAND || st === STATES.SHOP || st === STATES.ROUND_EVAL, `${name}: a live run state`, st);
  }
});
sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 3 texts', LINE.filter((n) => !J['j_poke_' + n]));
  const txt = (n) => J['j_poke_' + n].text.join(' ');
  ok(/Lucky triggers\)/.test(txt('sprigatito')) && /Magician/.test(txt('sprigatito')) && /Magician/.test(txt('floragato')) && !/rounds\)/.test(txt('sprigatito')),
    'Sprigatito / Floragato: "Evolves after N Lucky triggers", a Negative The Magician', J.j_poke_sprigatito.text);
  ok(/permanently gains/.test(txt('meowscarada')) && /X#1#/.test(txt('meowscarada')) && !/Steel/.test(txt('meowscarada')) && !/held/.test(txt('meowscarada')),
    'Meowscarada: permanently gains X#1# Mult; no Steel / held text', J.j_poke_meowscarada.text);
});

done();
