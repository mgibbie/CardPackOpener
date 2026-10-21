// More Fluff 1.9.9999 batch B (micatro/mods/morefluff: jokers_d.js, planeswalker.js, letters.js, rot.js; the
// Steamodded seams in js/engine/smods.js + jokers.js): every effect FIRED through the real engine (act() plays,
// sells, buys, shops, the seam passes), with the mod's own numbers.
//   1. after-pkseams: object_weights on (and with Pokermon), MoreFluff's polls through SMODS.poll_object, the
//      engine's scale_card (+ the scaling_card listener pass, the base game's scaling jokers routed through it),
//      More Fluff's attributes, Tall Joker's and Triangle's 1.9.9999 reworks
//   2. B1: the 13 new jokers with real art (+ Fish / Forge Residue / John Balatro), the Planeswalker loyalty system
//   3. B2: the 26 Letter jokers and the 3 Purple jokers
//   4. B3: the 7 rot legendaries, their prepared Spectral cards and The Soul!
//   node micatro/tests/mods/morefluff_batch_b_test.mjs
import {
  ok, done, start, hand, add, play, discard, winRound, nextRound, toShop, clearHand, clearJokers, clearConsumables,
  msgs, tot, filled, flush, near, G, P_CENTERS, P_CARDS, act, STATES,
} from './morefluff_helpers.mjs';
import { create_card, create_playing_card, P_JOKER_RARITY_POOLS } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { loadMods } from '../../js/mods/index.js';
import { MODS, ATTRIBUTES, feature } from '../../js/mods/registry.js';
import * as SM from '../../js/engine/smods.js';
import * as MF from '../../mods/morefluff/index.js';
import * as U from '../../mods/morefluff/util.js';

import { probability_vars, quantum_enhancements, get_blind_amount } from '../../js/engine/core.js';
const quantumLucky = (c) => quantum_enhancements(c).includes('m_lucky');
const probability = (obj, n, d) => probability_vars(obj, n, d, 'test');
const SM_blind = () => Number(get_blind_amount(G.GAME.round_resets.ante)) * G.GAME.blind.mult * G.GAME.starting_params.ante_scaling;
await loadMods(['morefluff', 'pokermon']); // (Pokermon only for the object_weights interaction check)
const J = (k) => 'j_mf_' + k;
/** Each block runs on its own: one that throws (on a build without batch B) counts as a failure, the rest still run. */
const section = (fn) => { try { fn(); } catch (e) { ok(false, 'section threw: ' + String(e && e.message).split('\n')[0]); } };
const has = (k) => !!P_CENTERS[k];
const jview = (c) => toView().areas.jokers.find((x) => x.id === c.sort_id);
const snapRng = () => JSON.parse(JSON.stringify(G.GAME.pseudorandom));
const restoreRng = (s) => { G.GAME.pseudorandom = JSON.parse(JSON.stringify(s)); };
const mult = (r) => r.total && r.total.mult;
const chips = (r) => r.total && r.total.chips;
/** A fake modify_weights pass over `keys` (each weight 10) — the listeners More Fluff's jokers answer. */
const weights = (keys, types = { Joker: true }) => {
  const pool = keys.map((k) => ({ key: k, weight: 10 }));
  for (const p of pool) pool[p.key] = p;
  SM.calculate_seam({ modify_weights: true, pool, pool_types: types, args: {} }, 'modify_weights');
  return Object.fromEntries(pool.map((p) => [p.key, p.weight]));
};

// ===================================================================== 1. after-pkseams
section(() => {
  ok(MODS.morefluff.contentRev === 2, 'More Fluff contentRev 2 (batch B)', MODS.morefluff.contentRev);
  // object_weights: 1.9.9999 src/misc.lua turns it on
  newRun({ seed: 'MFBOW0', mods: [] }); flush();
  ok(!SM.object_weights(), 'vanilla run: object_weights off');
  newRun({ seed: 'MFBOW1', mods: ['morefluff'] }); flush();
  ok(SM.object_weights() && feature('object_weights'), 'More Fluff alone: object_weights on (SMODS.poll_object routes)');
  newRun({ seed: 'MFBOW2', mods: ['morefluff', 'pokermon'] }); flush();
  ok(SM.object_weights(), 'More Fluff + Pokermon: object_weights on (one Steamodded flag: either mod turns it on)');
  newRun({ seed: 'MFBOW3', mods: ['pokermon'] }); flush();
  ok(SM.object_weights(), 'Pokermon alone: object_weights on (as before)');
  // More Fluff's SMODS.poll_seal / poll_enhancement are SMODS.poll_object's while it's on (same RNG -> same pick)
  start('MFBOW4');
  let s = snapRng();
  const a = U.poll_seal({ guaranteed: true, type_key: 'styledcard' });
  restoreRng(s);
  const b = SM.poll_seal_weighted({ guaranteed: true, type_key: 'styledcard' });
  ok(a && a === b, 'util.poll_seal = SMODS.poll_object over the Seal set under object_weights', [a, b]);
  s = snapRng();
  const e1 = U.poll_enhancement({ key: 'mf_seaweed', guaranteed: true, no_replace: true });
  restoreRng(s);
  const e2 = SM.poll_enhancement_weighted({ key: 'mf_seaweed', guaranteed: true, no_replace: true });
  ok(e1 && e1 === e2 && !P_CENTERS[e1].replace_base_card, 'util.poll_enhancement = SMODS.poll_object over the Enhanced set (no_replace kept)', [e1, e2]);
  // the shop rolls through SMODS.create_shop_card: its modify_shop_card context reaches More Fluff's jokers (Gem Alert below)
  // More Fluff's attributes are registered (colour, rotarot, exile, sliver, freaky + tetration's emult / hypermult / hyperchips)
  ok(['colour', 'rotarot', 'exile', 'sliver', 'freaky', 'emult', 'hypermult', 'hyperchips'].every((k) => ATTRIBUTES[k]), "More Fluff's SMODS.Attributes registered", Object.keys(ATTRIBUTES).length);
  ok(SM.has_attribute(P_CENTERS.c_mf_white, 'colour') && SM.get_attribute_pool('colour').includes('c_mf_white'), 'a Colour card has the colour attribute (its own `attributes`)');
  ok(U.scale_card === SM.scale_card, "util.scale_card IS the engine's scale_card");
});

// ---- the scaling_card listener pass + the base game's scaling jokers (Steamodded lovely/scaling.toml)
section(() => {
  start('MFBSC0', { mods: [] });
  ok(!SM.wanted('scaling_card'), 'vanilla run: nobody listens to scaling_card (vanilla scaling untouched)');
  let rtb = add('j_ride_the_bus');
  play(hand(['S_2']));
  ok(rtb.ability.mult === 1, 'vanilla: Ride the Bus +1', rtb.ability.mult);

  start('MFBSC1');
  ok(SM.wanted('scaling_card'), 'More Fluff run: Triangle / Doubled Scale listen to scaling_card');
  rtb = add('j_ride_the_bus');
  play(hand(['S_2']));
  ok(rtb.ability.mult === 1, 'More Fluff, no listener held: Ride the Bus still +1', rtb.ability.mult);
  const tri = add(J('triangle'));
  play(hand(['S_3']));
  ok(rtb.ability.mult === 2, 'Triangle X1: Ride the Bus +1', rtb.ability.mult);
  const r3 = play(hand(['S_4', 'H_4', 'D_4']));
  ok(tri.ability.extra.scaling_mod === 1.5 && rtb.ability.mult === 3, 'Three of a Kind: Triangle X1 -> X1.5 (Ride the Bus, left of it, already scaled +1)', [tri.ability.extra, rtb.ability.mult]);
  play(hand(['S_5']));
  ok(rtb.ability.mult === 4.5, 'Triangle X1.5: Ride the Bus +1.5', rtb.ability.mult);
  // 'X' scalings: the scalar ^ rate
  const t = { v: 2, s: 4 };
  SM.scale_card(rtb, { ref_table: t, ref_value: 'v', scalar_value: 's', operation: 'X', no_message: true });
  ok(near(t.v, 2 * Math.pow(4, 1.5)), "Triangle on an 'X' scaling: scalar ^ 1.5", t.v);
  // a More Fluff joker scaling through scale_card (Lollipop's '-'), and Triangle doesn't speed up Triangle
  const tri2 = add(J('triangle'));
  play(hand(['S_6', 'H_6', 'D_6']));
  ok(tri.ability.extra.scaling_mod === 2 && tri2.ability.extra.scaling_mod === 1.5, 'Triangle copies never boost each other (+0.5 each)', [tri.ability.extra.scaling_mod, tri2.ability.extra.scaling_mod]);
  ok(describe(tri).name === 'Triangle' && describe(tri).lines.some((l) => /Does not modify other copies/.test(l)), 'two Triangles: the "_lame" text', describe(tri).lines);
  // Doubled Scale: twice as fast; X scalings squared
  clearJokers();
  rtb = add('j_ride_the_bus');
  add(J('doubledscale'));
  play(hand(['S_7']));
  ok(rtb.ability.mult === 2, 'Doubled Scale: Ride the Bus +2', rtb.ability.mult);
  const t2 = { v: 1, s: 3 };
  SM.scale_card(rtb, { ref_table: t2, ref_value: 'v', scalar_value: 's', operation: 'X', no_message: true });
  ok(t2.v === 9, "Doubled Scale on an 'X' scaling: scalar squared", t2.v);
  // the decaying ones scale too (Ice Cream loses chips twice as fast; Turtle Bean's hand shrinks by the scaled step)
  const ice = add('j_ice_cream');
  play(hand(['S_8']));
  ok(ice.ability.extra.chips === 90, 'Doubled Scale: Ice Cream -10 per hand', ice.ability.extra.chips);
  const hs = G.hand.config.card_limit;
  const bean = add('j_turtle_bean');
  const hs2 = G.hand.config.card_limit;
  winRound(); flush();
  ok(bean.ability.extra.h_size === 3 && G.hand.config.card_limit === hs2 - 2, 'Doubled Scale: Turtle Bean -2 hand size (and the hand shrinks by 2)', [bean.ability.extra.h_size, hs, hs2, G.hand.config.card_limit]);
});

// ---- Tall Joker (1.9.9999): +44 Mult unless another joker has a Mult / XMult / ^Mult attribute
section(() => {
  start('MFBTALL');
  const tall = add(J('talljoker'));
  ok(play(hand(['S_A'])).total.mult === 45, 'Tall Joker alone: +44 Mult');
  const ff = add('j_four_fingers');
  ok(play(hand(['S_A'])).total.mult === 45, 'with a passive joker (Four Fingers): still +44');
  ff.remove(); flush();
  const jj = add('j_joker');
  ok(play(hand(['S_A'])).total.mult === 5, 'with Joker (mult attribute): no +44 (Joker\'s +4 only)', mult(play(hand(['S_K']))));
  jj.remove(); flush();
  const bb = add('j_cavendish');
  ok(play(hand(['S_A'])).total.mult === 3, 'with Cavendish (xmult attribute): no +44', mult(play(hand(['S_K']))));
  bb.remove(); flush();
  const fish = add(J('fish'));
  ok(play(hand(['S_A'])).total.mult === 5, "with a More Fluff mult joker (Fish's `attributes`): no +44", mult(play(hand(['S_Q']))));
  fish.remove(); flush();
  ok(describe(tall).lines.join(' ').includes('no other') && P_CENTERS[J('talljoker')].atlas === 'mf_vanilla_jokers', "Tall Joker: 1.9.9999 text, Jimbo's art (as 1.9.9999)", describe(tall).lines);
});

// ===================================================================== 2. B1
const B1 = ['dinner', 'forge', 'doubledscale', 'bouncer', 'jokesforminecrafters', 'applefriends', 'gemalert', 'gentlemelon',
  'jokerreacts', 'retrigger_joker', 'digital_exclusive', 'mindsculptor', 'johnbalatro'].map(J);
section(() => {
  ok(B1.every(has) && B1.every((k) => MF.STATUS.active_jokers.includes(k)), 'B1: the 13 new jokers are registered and in the pools', B1.filter((k) => !has(k)));
  ok([J('fish'), J('forgeslop'), J('johnbalatrotrue')].every((k) => has(k) && !MF.STATUS.active_jokers.includes(k)), 'their Tokens / John Balatro: registered, hidden');
  ok(B1.every((k) => P_CENTERS[k].atlas === 'mf_jokers'), 'B1: drawn from the 1.9.9999 joker sheet (real art)');
  start('MFBDESC');
  for (const k of [...B1, J('fish'), J('forgeslop'), J('johnbalatrotrue')]) {
    const c = add(k);
    const d = describe(c);
    ok(filled(d) && d.lines.length > 0, 'describe filled: ' + k, d.lines);
    c.remove();
  }
  flush();
  // the pools reach them: 2000 shop joker rolls
  start('MFBPOOL');
  const seen = new Set();
  for (let i = 0; i < 2500; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, null, 'sho'); seen.add(c.config.center.key); c.remove(); }
  ok(B1.filter((k) => seen.has(k)).length >= 10, 'B1 jokers turn up in shop rolls', B1.filter((k) => !seen.has(k)));
  ok(![J('fish'), J('forgeslop'), J('johnbalatrotrue')].some((k) => seen.has(k)), 'never their tokens');
});

section(() => { // Dinner: retriggers the joker to its right for 5 rounds, then eaten
  start('MFBDIN');
  const din = add(J('dinner')); add('j_joker');
  ok(play(hand(['S_2'])).total.mult === 9, 'Dinner: Joker retriggered (+4 twice)');
  for (let i = 0; i < 4; i++) nextRound();
  ok(din.ability.extra.rounds_left === 1 && G.jokers.cards.includes(din), 'Dinner: 1 round left after 4', din.ability.extra.rounds_left);
  winRound(); flush();
  ok(!G.jokers.cards.includes(din), 'Dinner: eaten after its 5th round');
});
section(() => { // Forge: every 2 Jokers sold -> a random Joker; a second Forge makes Forge Residue
  start('MFBFORGE');
  const f = add(J('forge'));
  let a = add('j_joker'); act({ type: 'sell', id: a.sort_id }); flush();
  ok(f.ability.partial_rounds === 1 && G.jokers.cards.length === 1, 'Forge: 1/2 after one sale', f.ability.partial_rounds);
  a = add('j_joker'); act({ type: 'sell', id: a.sort_id }); flush();
  ok(f.ability.partial_rounds === 0 && G.jokers.cards.length === 2 && G.jokers.cards[1] !== f, 'Forge: the 2nd sale forges a Joker', G.jokers.cards.map((c) => c.config.center.key));
  const made = G.jokers.cards[1];
  act({ type: 'sell', id: made.sort_id }); flush();
  const f2 = add(J('forge'));
  a = add('j_joker'); act({ type: 'sell', id: a.sort_id }); flush(); // (Forge 1 forges a Joker; Forge 2 at 1/2)
  for (const c of G.jokers.cards.slice()) if (c !== f && c !== f2) c.remove(); flush();
  a = add('j_joker'); act({ type: 'sell', id: a.sort_id }); flush(); // (Forge 2 forges: not the first Forge -> Residue)
  ok(G.jokers.cards.length === 3 && G.jokers.cards[2].config.center.key === J('forgeslop'), 'two Forges: the later one forges Forge Residue', G.jokers.cards.map((c) => c.config.center.key));
  const slop = G.jokers.cards.find((c) => c.config.center.key === J('forgeslop'));
  const before = [f.ability.partial_rounds, f2.ability.partial_rounds];
  act({ type: 'sell', id: slop.sort_id }); flush();
  ok(f.ability.partial_rounds === before[0] && f2.ability.partial_rounds === before[1], 'selling Forge Residue doesn\'t count', [before, f.ability.partial_rounds, f2.ability.partial_rounds]);
});
section(() => { // Bouncer: the joker to its right goes back to the shop; +3 Chips per $1 of its sell value; a Fish for a Joker
  start('MFBBOUNCE');
  const bo = add(J('bouncer'));
  const right = add('j_joker');
  const sell = right.sell_cost;
  toShop(); flush();
  ok(G.shop_jokers.cards.includes(right) && !G.jokers.cards.includes(right), 'Bouncer: Joker returned to the shop', G.shop_jokers.cards.map((c) => c.config.center.key));
  ok(bo.ability.extra.chips === sell * 3, 'Bouncer: +3 Chips per $1 of sell value', [bo.ability.extra.chips, sell]);
  ok(G.jokers.cards.some((c) => c.config.center.key === J('fish')), 'Bouncer: a Fish for the Joker');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const fish = G.jokers.cards.find((c) => c.config.center.key === J('fish'));
  fish.remove(); flush();
  const r = play(hand(['S_2']));
  ok(chips(r) === 7 + sell * 3, 'Bouncer: its Chips score', tot(r));
  // nothing to its right: the first consumable goes back (no Fish)
  G.consumeables.emplace(create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool')); flush();
  toShop(); flush();
  ok(G.consumeables.cards.length === 0 && G.shop_jokers.cards.some((c) => c.config.center.key === 'c_fool') && !G.jokers.cards.some((c) => c.config.center.key === J('fish')), 'Bouncer: no joker to its right -> the consumable goes back, no Fish');
});
section(() => { // Jokes for Minecrafters: the joke names the first discarded card destroyed; a new joke each round
  start('MFBJOKES');
  const j = add(J('jokesforminecrafters'));
  ok(Object.keys({ none: 1, hearts: 1, diamonds: 1, clubs: 1, spades: 1, face: 1, hack: 1, odd: 1, even: 1, fib: 1 }).includes(j.ability.extra.current_joke), 'a joke is picked when made (set_ability)', j.ability.extra.current_joke);
  j.ability.extra.current_joke = 'hearts';
  ok(describe(j).lines.some((l) => /Hearts/.test(l)), 'its text is the joke\'s', describe(j).lines);
  const cards = hand(['S_2', 'H_5', 'H_9']);
  const n0 = G.playing_cards.length;
  discard(cards); flush();
  ok(G.playing_cards.length === n0 - 1 && !G.playing_cards.includes(cards[1]) && G.playing_cards.includes(cards[2]), 'Hearts joke: the first discarded Heart is destroyed (only one)', G.playing_cards.length - n0);
  discard(hand(['H_K'])); flush();
  ok(G.playing_cards.length === n0, 'once a round', G.playing_cards.length - n0);
  const r = winRound(); flush();
  ok(j.ability.extra.has_triggered === false && msgs(r.events).includes('Page turn'), 'end of round: page turn', msgs(r.events));
});
section(() => { // Apple Friends: every +Chips / +Mult doubled; destroyed when another Joker is sold
  start('MFBAPPLE');
  const ap = add(J('applefriends'));
  add('j_joker');
  let r = play(hand(['S_K']));
  ok(chips(r) === 5 + 20 && mult(r) === 1 + 8, 'Apple Friends: the King\'s +10 Chips -> +20, Joker\'s +4 Mult -> +8', tot(r));
  ok(msgs(r.events).includes('+8 Mult') || msgs(r.events).some((m) => /\+8/.test(m)), 'the popup shows the doubled amount', msgs(r.events));
  const ap2 = add(J('applefriends'));
  r = play(hand(['S_K']));
  ok(chips(r) === 5 + 40 && mult(r) === 1 + 16, 'two Apple Friends: X4', tot(r));
  const other = add('j_joker');
  act({ type: 'sell', id: other.sort_id }); flush();
  ok(!G.jokers.cards.includes(ap) && !G.jokers.cards.includes(ap2), 'Apple Friends: destroyed when a Joker is sold', G.jokers.cards.map((c) => c.config.center.key));
});
section(() => { // Gem Alert: Rares X6.7 as common; +X0.1 per Rare / Editioned Joker in the shop
  start('MFBGEM');
  ok((G.GAME.rare_mod ?? 1) === 1, 'no rare_mod before');
  const gem = add(J('gemalert'));
  ok(near(G.GAME.rare_mod, 6.7), 'Gem Alert: rare_mod X6.7', G.GAME.rare_mod);
  let rares = 0;
  for (let i = 0; i < 600; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, null, 'sho'); if (c.config.center.rarity === 3) rares++; c.remove(); }
  ok(rares > 150, 'Gem Alert: Rares roll ~26% of the time (5% without)', rares);
  const c0 = gem.ability.extra.xmult;
  const rare = create_card('Joker', G.shop_jokers, null, 3, null, null, null, 'sho');
  SM.calculate_seam({ modify_shop_card: true, card: rare }, 'modify_shop_card');
  ok(near(gem.ability.extra.xmult, c0 + 0.1), 'a Rare in the shop: +X0.1', gem.ability.extra.xmult);
  const com = create_card('Joker', G.shop_jokers, null, 1, null, null, 'j_joker', 'sho');
  SM.calculate_seam({ modify_shop_card: true, card: com }, 'modify_shop_card');
  ok(near(gem.ability.extra.xmult, c0 + 0.1), 'a plain Common: nothing', gem.ability.extra.xmult);
  com.set_edition({ foil: true }, true, true);
  SM.calculate_seam({ modify_shop_card: true, card: com }, 'modify_shop_card');
  ok(near(gem.ability.extra.xmult, c0 + 0.2), 'an Editioned joker: +X0.1', gem.ability.extra.xmult);
  rare.remove(); com.remove(); flush();
  // the real shop roll fires it (SMODS.create_shop_card)
  G.GAME.rare_mod = 1e6; G.GAME.joker_rate = 1e6; // (only Rare jokers in the shop slots)
  toShop(); flush();
  ok(gem.ability.extra.xmult > c0 + 0.2 + 0.05, 'the shop\'s own rolls fire it (modify_shop_card)', gem.ability.extra.xmult);
  G.GAME.rare_mod = 6.7;
  gem.remove(); flush();
  ok(near(G.GAME.rare_mod, 1), 'removed: rare_mod back to 1', G.GAME.rare_mod);
  ok(jview(add(J('gemalert'))).mod_stickers.some((s) => s.pos.x === 6 && s.pos.y === 18), 'its diamond layer (mf_jokers 6,18) is drawn over the card');
});
section(() => { // Gentlemelon: duplicates may appear; owned cards' duplicates X100; dies after 4 purchases / packs
  start('MFBMELON');
  const gm = add(J('gentlemelon'));
  add('j_joker');
  const w = weights(['j_joker', 'j_greedy_joker', J('gentlemelon')]);
  ok(w.j_joker === 1000 && w.j_greedy_joker === 10 && w[J('gentlemelon')] === 10, 'modify_weights: an owned card X100 (Gentlemelon itself not counted)', w);
  const dup = [];
  for (let i = 0; i < 200; i++) { const c = create_card('Joker', G.shop_jokers, null, 0, null, null, null, 'sho'); dup.push(c.config.center.key); c.remove(); }
  ok(dup.filter((k) => k === 'j_joker').length > 100, 'Joker (owned) now dominates the Common rolls (duplicates allowed)', dup.filter((k) => k === 'j_joker').length);
  toShop(); flush();
  G.GAME.dollars = 100;
  for (let i = 0; i < 3; i++) {
    const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_greedy_joker', 'sho'); c.set_cost(); G.shop_jokers.emplace(c);
    const r = act({ type: 'buy', id: c.sort_id }); flush();
    ok(r.ok && gm.ability.extra.purchases === 3 - i, 'Gentlemelon: a purchase counts down', [r.error, gm.ability.extra.purchases]);
  }
  const pk = G.shop_booster.cards[0];
  act({ type: 'buy', id: pk.sort_id }); flush();
  ok(!G.jokers.cards.includes(gm), 'Gentlemelon: gone after the 4th (a pack opened)', gm.ability.extra.purchases);
});
section(() => { // Joker Reacts To Broccoli: Food X3, face down in the shop; buying one: $2 and +1 Mult
  start('MFBBROC');
  const jr = add(J('jokerreacts'));
  const w = weights(['j_gros_michel', 'j_ice_cream', 'j_joker']);
  ok(w.j_gros_michel === 30 && w.j_ice_cream === 30 && w.j_joker === 10, 'modify_weights: Food jokers X3', w);
  ok(weights(['j_gros_michel'], { Tarot: true }).j_gros_michel === 10, 'only Joker pools');
  toShop(); flush();
  const food = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_gros_michel', 'sho');
  SM.calculate_seam({ modify_shop_card: true, card: food }, 'modify_shop_card');
  food.set_cost(); G.shop_jokers.emplace(food); flush();
  ok(food.facing === 'back', 'a Food joker in the shop is face down', food.facing);
  G.GAME.dollars = 50;
  const d0 = G.GAME.dollars;
  act({ type: 'buy', id: food.sort_id }); flush();
  ok(jr.ability.extra.mult === 1 && G.GAME.dollars === d0 - food.cost + 2 && food.facing !== 'back', 'buying it: +1 Mult, $2, and it turns face up', [jr.ability.extra.mult, G.GAME.dollars - d0, food.facing]);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  for (const c of G.jokers.cards.slice()) if (c !== jr) c.remove(); flush();
  ok(play(hand(['S_2'])).total.mult === 2, 'Joker Reacts: its Mult scores');
});
section(() => { // Retrigger Joker: retriggers jokers that retrigger (Mime) and the 5th scoring card
  start('MFBRETRIG');
  add(J('retrigger_joker'));
  let r = play(hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6']));
  ok(chips(r) === 100 + 2 + 3 + 4 + 5 + 6 * 2, 'Retrigger Joker: the 5th scoring card scores twice (a Straight Flush)', tot(r));
  clearJokers();
  add('j_mime');
  const steel = hand(['S_K'], 'm_steel');
  r = play(hand(['S_2']), { keepHand: true });
  const m1 = mult(r);
  add(J('retrigger_joker'));
  r = play(hand(['S_2']), { keepHand: true });
  ok(near(m1, 1.5 * 1.5) && near(mult(r), Math.pow(1.5, 3)), 'Mime (a "retrigger" joker) is retriggered: the Steel King X1.5 three times', [m1, mult(r)]);
  steel.length = 0; clearHand();
  ok(SM.has_attribute(P_CENTERS.j_mime, 'retrigger') && !SM.has_attribute(P_CENTERS.j_joker, 'retrigger'), "the retrigger attribute is Steamodded's built-in pool");
});
section(() => { // Alchemy Joker: sold -> a passive Joker with the perpetual A-Hit the Road
  start('MFBALCH');
  const al = add(J('digital_exclusive'));
  act({ type: 'sell', id: al.sort_id }); flush();
  const made = G.jokers.cards[0];
  ok(made && SM.has_attribute(made.config.center, 'passive') && made.ability.mf_alchemy_hit_the_road === 1, 'sold: a random passive Joker with A-Hit the Road', made && made.config.center.key);
  ok(describe(made).info.some((i) => i.key === 'mf_alchemy_hit_the_road_perpetual'), 'its box shows the perpetual ability');
  let r = play(hand(['S_2']));
  ok(mult(r) === 1, 'no exiled card: X1', tot(r));
  const jack = hand(['S_J', 'H_3']);
  discard(jack); flush();
  ok(G.mf_exile.cards.includes(jack[0]) && !G.mf_exile.cards.includes(jack[1]) && jack[0].ability.mf_unexile_eoa, 'a discarded Jack is exiled until the end of the Ante');
  r = play(hand(['S_2']));
  ok(mult(r) === 1.5, 'X1.5 with one card in exile', tot(r));
});
section(() => { // Planeswalkers: Jimbo, the Mind Sculptor
  start('MFBJACE');
  const js = add(J('mindsculptor'));
  ok(jview(js).mod_actions.slice(0, 3).every((a) => a.disabled), 'an empty hand: +2 / 0 / -1 greyed out');
  hand(['S_2', 'S_3']);
  const v = jview(js);
  ok(v.mod_actions.map((a) => a.label).join() === '+2,0,-1,-12' && v.mod_stickers.length === 2 && v.mod_stickers[1].pos.x === 3, 'loyalty buttons +2 / 0 / -1 / -12, loyalty 3 drawn', v.mod_actions.map((a) => a.label));
  ok(v.mod_actions[3].disabled && !v.mod_actions[0].disabled, '-12 greyed out (loyalty 3)');
  const n0 = G.hand.cards.length, d0 = G.deck.cards.length;
  let r = act({ type: 'mf_loyalty', id: js.sort_id, idx: 1 }); flush();
  ok(r.ok && G.hand.cards.length === n0 + 1 && js.ability.extra.loyalty === 5 && js.ability.extra.uses === 0, '+2: draw a card, loyalty 5', [G.hand.cards.length - n0, js.ability.extra]);
  r = act({ type: 'mf_loyalty', id: js.sort_id, idx: 2 });
  ok(!r.ok, 'once per round', r.error);
  nextRound();
  ok(js.ability.extra.uses === 1, 'a new Blind: a use again');
  hand(['S_4', 'S_5', 'S_6']);
  const left = G.hand.cards.slice(0, 3);
  r = act({ type: 'mf_loyalty', id: js.sort_id, idx: 2 }); flush();
  ok(r.ok && G.hand.cards.length === 3 + 1 && js.ability.extra.loyalty === 5, '0: draw four, put three back (hand +1)', G.hand.cards.length);
  nextRound();
  hand(['S_7', 'S_8']);
  const dk = G.deck.cards.length;
  r = act({ type: 'mf_loyalty', id: js.sort_id, idx: 3 }); flush();
  ok(r.ok && G.hand.cards.length === 0 && G.deck.cards.length === dk + 2 && js.ability.extra.loyalty === 4, '-1: the whole hand goes into the deck', [G.hand.cards.length, G.deck.cards.length - dk]);
  js.ability.extra.loyalty = 12;
  nextRound();
  hand(['S_9']);
  r = act({ type: 'mf_loyalty', id: js.sort_id, idx: 4 }); flush();
  ok(r.ok && G.deck.cards.length === 0 && js.ability.extra.loyalty === 0, '-12: every card left in the deck destroyed', G.deck.cards.length);
  ok(describe(js).info.some((i) => i.key === 'planeswalker_explainer' && i.lines.some((l) => /3/.test(l))), 'the Planeswalker explainer (starts with 3)');
});
section(() => { // John Balatro?: +1 on five selected cards; -11 unleashes John Balatro (^2 Mult before scoring)
  start('MFBJOHN');
  const jb = add(J('johnbalatro'));
  const five = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_7']);
  ok(jview(jb).mod_actions[0].disabled, '+1 needs five selected cards');
  act({ type: 'highlight', ids: five.map((c) => c.sort_id) });
  let r = act({ type: 'mf_loyalty', id: jb.sort_id, idx: 1 }); flush();
  ok(r.ok && five.every((c) => c.ability.perma_mult === 4) && jb.ability.extra.loyalty === 2, '+1: five cards +4 Mult (perma), loyalty 2', five.map((c) => c.ability.perma_mult));
  nextRound();
  const again = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_8']);
  again[0].ability.perma_mult = 4;
  act({ type: 'highlight', ids: again.map((c) => c.sort_id) });
  ok(!act({ type: 'mf_loyalty', id: jb.sort_id, idx: 1 }).ok, '+1 refuses cards that already have a Mult bonus');
  clearHand();
  ok(!act({ type: 'mf_loyalty', id: jb.sort_id, idx: 2 }).ok, '-11 needs 11 loyalty');
  jb.ability.extra.loyalty = 11;
  r = act({ type: 'mf_loyalty', id: jb.sort_id, idx: 2 }); flush();
  ok(r.ok && jb.config.center.key === J('johnbalatrotrue') && !jview(jb).mod_actions, '-11: she becomes John Balatro (no more abilities)', jb.config.center.key);
  r = play(hand(['S_K']));
  ok(mult(r) === 1 && chips(r) === 15, 'John Balatro: ^2 of 1 Mult', tot(r));
  add('j_joker');
  G.jokers.cards.reverse(); // (Joker first: its +4 comes AFTER the ^2 — ^2 is before any card scores)
  r = play(hand(['S_K']));
  ok(mult(r) === 5 && msgs(r.events).includes('^2 Mult'), '^2 Mult before scoring', [tot(r), msgs(r.events)]);
  r = play(hand(['S_K', 'H_K']));
  ok(mult(r) === 2 * 2 + 4, 'a Pair: 2^2 then +4', tot(r));
});

// ===================================================================== 3. B2: the Letter and Purple jokers
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => J('lettergem_' + c));
const PURPLE = ['aura_farm', 'crad_shuffler', 'purple_economy_joker'].map(J);
section(() => {
  ok(LETTERS.every(has) && PURPLE.every(has), 'B2: the 26 Letter jokers and the 3 Purple jokers are registered', [...LETTERS, ...PURPLE].filter((k) => !has(k)));
  ok(LETTERS.every((k) => P_CENTERS[k].rarity === 'mf_letter' && P_CENTERS[k].atlas === 'mf_letterjokers_b') && PURPLE.every((k) => P_CENTERS[k].rarity === 'mf_oldfluff' && P_CENTERS[k].atlas === 'mf_purple'), 'their rarities (Letter / Scrapped) and their real art sheets');
  ok(MODS.morefluff.content.rarities.find((r) => r.key === 'mf_letter').weight === 0, 'the Letter rarity weighs 0 (only Lettergem F, the Old Deck and Bonus Sheet roll it)');
  start('MFBL0');
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, null, 'sho'); seen.add(c.config.center.key); c.remove(); }
  ok(![...LETTERS, ...PURPLE].some((k) => seen.has(k)), 'never offered in the shop (2000 rolls)');
  for (const k of [...LETTERS, ...PURPLE]) { const c = add(k); ok(filled(describe(c)), 'describe filled: ' + k, describe(c).lines); c.remove(); }
  flush();
  const nd = describe(add(J('lettergem_n'))).lines.join(' ');
  ok(nd.includes('Joker') && !nd.includes('vremade'), "N's text names a Joker (upstream's unlocalized key fixed)", nd);
  const dpic = describe(add(J('lettergem_d'))).imgs;
  ok(dpic && dpic[0].src.endsWith('lettergem_destroy_b.png') && dpic[0].frames === 5, 'D: its tooltip line is the animated "Destroy" picture', dpic);
  ok(describe(add(J('lettergem_g'))).imgs[0].src.endsWith('lettergem_g_b.png') && describe(add(J('lettergem_z'))).imgs[0].at === 1, 'G / Z: their pictures');
});
section(() => { // A, H, S, Y, C, E, G, Q, U, X: scoring
  start('MFBLA'); add(J('lettergem_a'));
  let r = play(hand(['S_A']));
  ok(chips(r) === 5 + 22 && mult(r) === 1 + 4, 'A: an Ace +2 Mult and retriggered', tot(r));
  start('MFBLH'); add(J('lettergem_h'));
  r = play(hand(['S_K', 'H_K']));
  ok(chips(r) === 10 + 10 + 20, 'H: every scoring card but the first retriggered', tot(r));
  start('MFBLS'); add(J('lettergem_s'));
  hand(['H_6']);
  r = play(hand(['S_7']), { keepHand: true });
  ok(chips(r) === 5 + 7 + 6 + 6 && mult(r) === 1 + 7 + 7, 'S: a scored 7 and a held 6 each +6 Chips +7 Mult', tot(r));
  clearHand();
  start('MFBLY'); const y = add(J('lettergem_y'));
  y.ability.extra.cards_scored = 11;
  const d0 = G.GAME.dollars;
  play(hand(['S_2', 'H_2'])); flush();
  ok(G.GAME.dollars === d0 + 10 && y.ability.extra.cards_scored === 0, 'Y: $10 for the 13th card scored', [G.GAME.dollars - d0, y.ability.extra]);
  start('MFBLC'); const cc = add(J('lettergem_c'));
  r = play(hand(['S_K', 'H_K', 'D_K', 'C_K']));
  ok(cc.ability.extra.counter === 40 && mult(r) === 7, 'C: 40 chips worth of cards scored: no X5 yet', [cc.ability.extra, tot(r)]);
  cc.ability.extra.counter = 95;
  r = play(hand(['S_K']));
  ok(cc.ability.extra.counter === 5 && near(mult(r), 5), 'C: past 100 chips: X5 (and the rest carried)', [cc.ability.extra, tot(r)]);
  start('MFBLE'); add('j_joker'); add(J('lettergem_e'));
  r = play(hand(['S_2']));
  ok(near(mult(r), Math.pow(5, 1.4)), 'E: ^1.4 Mult', tot(r));
  start('MFBLG'); add(J('lettergem_g'));
  r = play(hand(['S_2', 'H_2']));
  ok(near(mult(r), 2 * 1.01 * 1.01), 'G: X1.01 per scored card', tot(r));
  start('MFBLQ'); add(J('lettergem_q'));
  hand(['S_2', 'H_Q', 'D_3', 'C_9']);
  r = play(hand(['S_A']), { keepHand: true });
  ok(near(mult(r), 1.3 * 1.3), 'Q: the two cards next to the held Queen X1.3 each', tot(r));
  clearHand();
  start('MFBLU'); add(J('lettergem_u'));
  r = play(hand(['S_K', 'H_K']));
  ok(chips(r) === 10 && mult(r) === 2 + 26, 'U: no card scores; +13 Mult per played card', tot(r));
  start('MFBLX'); const xx = add(J('lettergem_x')); add('j_cavendish');
  r = play(hand(['S_2']));
  ok(near(mult(r), 3.02) && near(xx.ability.extra.current_increase, 0.02), 'X: an XMult trigger +X0.02 (and X grows)', [tot(r), xx.ability.extra]);
  r = play(hand(['S_2']));
  ok(near(mult(r), 3.04), 'X: +X0.04 the next time', tot(r));
});
section(() => { // B, F, K, M, N, R, W, V: generation
  start('MFBLB', { noBlind: true }); add(J('lettergem_b'));
  act({ type: 'select_blind' }); clearHand(); toShop(); flush();
  const bp = G.shop_booster.cards.filter((c) => c.config.center.key === 'p_buffoon_normal_1');
  ok(bp.some((c) => c.cost === 7), 'B: an extra $7 Buffoon Pack in the shop', G.shop_booster.cards.map((c) => c.config.center.key + ':' + c.cost));
  start('MFBLF', { noBlind: true }); add(J('lettergem_f'));
  act({ type: 'select_blind' }); flush();
  ok(G.jokers.cards.length === 2 && G.jokers.cards[1].config.center.rarity === 'mf_letter', 'F: a Letter joker when a Blind is selected', G.jokers.cards.map((c) => c.config.center.key));
  start('MFBLK'); nextRound(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); // (the Boss Blind is next)
  for (const c of G.jokers.cards.slice()) c.remove(); flush();
  add(J('lettergem_k')); add(J('lettergem_m')); add(J('lettergem_n'));
  act({ type: 'select_blind' }); flush();
  const cav = G.jokers.cards.find((c) => c.config.center.key === 'j_cavendish');
  const jolly = G.jokers.cards.find((c) => c.config.center.key === 'j_jolly');
  const nj = G.jokers.cards.find((c) => c.config.center.key === 'j_joker');
  ok(cav && cav.edition && cav.edition.negative && cav.ability.extra.odds === 2, 'K: a Negative Cavendish, 1 in 2 to die', cav && cav.ability.extra);
  ok(jolly && jolly.ability.extra_value === 3, 'M: a Jolly Joker with +$3 sell value', jolly && jolly.ability.extra_value);
  ok(G.GAME.blind.boss && nj && nj.edition && nj.edition.negative, 'N: a Negative Joker on the Boss Blind', G.jokers.cards.map((c) => c.config.center.key));
  start('MFBLR', { noBlind: true }); add(J('lettergem_r'));
  const round0 = G.GAME.round;
  act({ type: 'select_blind' }); clearHand(); flush();
  ok(G.GAME.round === round0 + 2, 'R: +1 Round when a Blind is selected', [round0, G.GAME.round]);
  const rr = play(hand(['S_2']));
  ok(mult(rr) === 1 + G.GAME.round, 'R: +1 Mult per Round', tot(rr));
  start('MFBLW', { noBlind: true }); add(J('lettergem_w'));
  act({ type: 'select_blind' }); flush();
  const wheel = G.consumeables.cards.find((c) => c.config.center.key === 'c_wheel_of_fortune');
  ok(wheel && wheel.ability.extra === 5, 'W: a Wheel of Fortune at 1 in 5', wheel && wheel.ability.extra);
  start('MFBLV', { noBlind: true }); add(J('lettergem_v'));
  act({ type: 'select_blind' }); clearHand(); toShop(); flush();
  G.GAME.dollars = 50;
  const t0 = G.GAME.tags.length;
  act({ type: 'buy', id: G.shop_jokers.cards[0].sort_id }); flush();
  ok(G.GAME.tags.length === t0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_voucher', 'V: a Voucher Tag whenever a card is bought', G.GAME.tags.map((t) => t.key));
});
section(() => { // D, I, J, L, O, P, T, Z: rules
  start('MFBLD'); add(J('lettergem_d'));
  const n0 = G.playing_cards.length;
  winRound(); flush();
  ok(G.playing_cards.length === n0 + 1 - 2, 'D: 2 playing cards destroyed at the end of the round', n0 + 1 - G.playing_cards.length);
  start('MFBLI'); add(J('lettergem_i'));
  let r = play(hand(['S_2', 'H_3', 'D_4']));
  ok(G.GAME.last_hand_played === 'Straight', 'I: a three-card Straight', G.GAME.last_hand_played);
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'H_6']));
  ok(near(mult(r), 4 * 2), 'I: X2 with a five-card Straight', tot(r));
  start('MFBLJ'); add(J('lettergem_j')); add('j_joker'); add('j_joker'); add('j_joker');
  const dj = G.GAME.dollars;
  r = play(hand(['S_2'])); flush();
  ok(mult(r) === 1 + 4 * 2 * 2 + 4 && G.GAME.dollars === dj - 2, 'J: the two jokers to its right retriggered, -$0.5 per trigger (post_trigger)', [tot(r), G.GAME.dollars - dj]);
  start('MFBLL'); add(J('lettergem_l'));
  const first = hand(['S_K'])[0];
  G.hand.remove_card(first); G.play.emplace(first);
  ok(quantumLucky(first), 'L: the first played card counts as Lucky (quantum)');
  const [ln, ld] = probability(first, 1, 5);
  ok(ln === 3 && ld === 5, 'L: its chances X3', [ln, ld]);
  G.play.remove_card(first); G.hand.emplace(first); clearHand();
  start('MFBLO'); add(J('lettergem_o'));
  const [nu, de] = probability(G.jokers.cards[0], 1, 4);
  ok(nu === 1 && de === 2, 'O: every probability is 1 in 2', [nu, de]);
  start('MFBLP', { noBlind: true }); add(J('lettergem_p'));
  G.GAME.round_resets.ante = 3;
  act({ type: 'select_blind' }); flush();
  ok(near(Number(G.GAME.blind.chips), SM_blind() * Math.pow(0.9, 3), 1), 'P: X0.9 Blind size per Ante (ante 3: X0.729)', [String(G.GAME.blind.chips), SM_blind()]);
  start('MFBLT', { noBlind: true }); add(J('lettergem_t'));
  for (const c of G.deck.cards) c.set_ability(P_CENTERS.m_wild);
  act({ type: 'select_blind' }); flush();
  ok(G.deck.cards.length === 0 && G.hand.cards.length === 52, 'T: every Wild Card drawn draws another (an all-Wild deck: the whole deck)', [G.hand.cards.length, G.deck.cards.length]);
  start('MFBLZ'); add(J('lettergem_z'));
  const nz = G.playing_cards.length;
  G.GAME.chips = 0; G.GAME.blind.chips = 1e9; G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) });
  act({ type: 'play' }); flush();
  ok(G.STATE !== STATES.GAME_OVER && G.GAME.saved_by === J('lettergem_z'), 'Z: prevents death', [G.STATE, G.GAME.saved_by]);
  ok(G.playing_cards.length === nz + 1 - 13, 'Z: 13 playing cards destroyed', [nz, G.playing_cards.length]);
});
section(() => { // Purple: Aura Farm, crad shuffler, Purple Economy Joker
  start('MFBAURA');
  add(J('aura_farm'));
  const tarot = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool'); tarot.add_to_deck(); G.consumeables.emplace(tarot);
  let v = toView().areas.consumeables.find((x) => x.id === tarot.sort_id);
  const btn = (v.mod_actions || []).find((a) => a.action.type === 'mf_use_prepared');
  ok(btn && /Aura/.test(btn.label) && btn.disabled, 'Aura Farm: a held Tarot has a prepared Aura (greyed out with no card selected)', v.mod_actions);
  const c = hand(['S_5'])[0];
  act({ type: 'highlight', ids: [c.sort_id] });
  let r = act({ type: 'mf_use_prepared', id: tarot.sort_id }); flush();
  ok(r.ok && c.edition && G.consumeables.cards.includes(tarot), 'Aura Farm: its Aura used on the selected card (the Tarot stays)', [r.error, c.edition]);
  v = toView().areas.consumeables.find((x) => x.id === tarot.sort_id);
  ok(v.mod_actions.find((a) => a.action.type === 'mf_use_prepared').disabled && !act({ type: 'mf_use_prepared', id: tarot.sort_id }).ok, 'and the Tarot is no longer prepared');
  start('MFBCRAD');
  add(J('crad_shuffler'));
  for (const b of G.deck.cards.slice(0, 3)) b.set_ability(P_CENTERS.m_mult);
  r = play(hand(['S_2']));
  ok(mult(r) === 1 + 4 * 3, 'crad shuffler: the bottom three deck cards also score (three Mult cards: +12)', tot(r));
  const order = G.deck.cards.map((x) => x.sort_id).join();
  r = discard(hand(['S_3'])); flush();
  ok(msgs(r.events).includes('Shuffled!') && G.deck.cards.map((x) => x.sort_id).join() !== order, 'crad shuffler: a discard shuffles the deck', msgs(r.events));
  start('MFBPECO', { noBlind: true });
  add(J('purple_economy_joker'));
  const de0 = G.GAME.dollars;
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.dollars === de0 + 2, 'Purple Economy Joker: $2 when the deck is shuffled (the round starts)', G.GAME.dollars - de0);
});

// ===================================================================== 4. B3: the rot legendaries, their Spectrals, The Soul!
const ROT = ['canio', 'triboulet', 'yorick', 'chicot', 'perkeo', 'triangle', 'marigold'].map((k) => J('rot_' + k));
const ROT_SPEC = ['doomblade', 'reinforcements', 'windfall', 'negate', 'mirror', 'refraction', 'lotusbloom'].map((k) => 'c_mf_' + k);
const useP = (j) => act({ type: 'mf_use_prepared', id: j.sort_id });
section(() => {
  ok(ROT.every(has) && ROT_SPEC.every(has) && has('c_mf_rot_soul'), 'B3: 7 rot legendaries, their 7 Spectrals and The Soul! registered');
  ok(ROT.every((k) => P_CENTERS[k].rarity === 'mf_rot_legendary' && P_CENTERS[k].atlas === 'mf_rot_jokers_b'), 'the rot legendaries: their rarity, pre-turned art');
  ok(ROT_SPEC.every((k, i) => P_CENTERS[k].atlas === 'mf_rot_spectrals_b' && P_CENTERS[k].pos.x === i), 'their Spectrals: the composed art sheet (no placeholder)');
  ok(P_CENTERS.c_mf_rot_soul.hidden && P_CENTERS.c_mf_rot_soul.soul_set === 'Rotarot', 'The Soul!: hidden, rolls in Rotarot packs');
  start('MFBROT0');
  ok(!P_CENTERS.c_mf_doomblade.in_pool(P_CENTERS.c_mf_doomblade), 'Doom Blade is out of the pool without Canio!');
  const soul = add('c_mf_rot_soul');
  const r = act({ type: 'use', id: soul.sort_id }); flush();
  ok(r.ok && G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.rarity === 'mf_rot_legendary', 'The Soul!: a rot legendary', G.jokers.cards.map((c) => c.config.center.key));
  ok(P_CENTERS['c_mf_' + ['doomblade', 'reinforcements', 'windfall', 'negate', 'mirror', 'refraction', 'lotusbloom'][ROT.indexOf(G.jokers.cards[0].config.center.key)]].in_pool(), "its Spectral is in the pool while it's held");
  for (const k of [...ROT, ...ROT_SPEC]) { const c = add(k); ok(filled(describe(c)), 'describe filled: ' + k, describe(c).lines); c.remove(); }
  flush();
});
section(() => { // Canio! / Doom Blade
  start('MFBCANIO');
  const canio = add(J('rot_canio'));
  ok(describe(canio).info.some((i) => i.name === 'Doom Blade' && i.lines.some((l) => /prepared/.test(l))), 'its tooltip shows Doom Blade (prepared)', describe(canio).info);
  const kings = hand(['S_K', 'H_K']);
  const seven = hand(['S_7'])[0];
  act({ type: 'highlight', ids: kings.map((c) => c.sort_id) });
  let r = useP(canio); flush();
  ok(r.ok && !G.playing_cards.includes(kings[0]) && near(seven.ability.perma_x_blind_size, -0.1) && !canio.ability.extra.is_prepared, 'Doom Blade: 2 faces destroyed, the held 7 -X0.1 Blind size; Canio! unprepared', [r.error, seven.ability.perma_x_blind_size]);
  ok(!useP(canio).ok, 'not prepared: no use');
  G.GAME.chips = 0; G.GAME.blind.chips = 1000;
  play([seven], { keepChips: true });
  ok(near(Number(G.GAME.blind.chips), 900), 'the 7 scored: Blind size X0.9', String(G.GAME.blind.chips));
  U.destroy_cards([hand(['S_2'])[0]]); flush();
  ok(canio.ability.extra.is_prepared, 'a non-face card destroyed: prepared again');
});
section(() => { // Triboulet! / Royal Decree
  start('MFBTRIB');
  const tr = add(J('rot_triboulet'));
  let r = useP(tr); flush();
  ok(r.ok && G.GAME.rot_trib_count === 1, 'Royal Decree: 1 trigger this round', [r.error, G.GAME.rot_trib_count]);
  const n0 = G.playing_cards.length;
  r = play(hand(['S_2']));
  ok(near(mult(r), 9) && chips(r) === 5 + 2 + 10 + 10 && G.playing_cards.length === n0 + 1, 'a King and a Queen join the scoring hand (X3 each), then are destroyed', [tot(r), G.playing_cards.length - n0]);
  winRound(); flush();
  ok(!G.GAME.rot_trib_count, 'it wears off at the end of the round');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  discard(hand(['S_5', 'H_5'])); flush();
  ok(tr.ability.extra.is_prepared, 'a Pair discarded: prepared again');
});
section(() => { // Yorick! / Windfall
  start('MFBYOR');
  const yo = add(J('rot_yorick'));
  const cs = hand(['S_5', 'H_6']);
  const dis = G.discard.cards.length;
  let r = useP(yo); flush();
  ok(r.ok && cs.every((c) => near(c.ability.perma_x_chips, 0.2)) && G.discard.cards.length === dis + 2, 'Windfall: every hand card X0.2 Chips, then the hand is discarded', [r.error, cs.map((c) => c.ability.perma_x_chips), G.discard.cards.length - dis]);
  const c = cs[0]; G.discard.remove_card(c); G.hand.emplace(c);
  r = play([c]);
  ok(near(chips(r), (5 + 5) * 1.2), 'a Windfall card: X1.2 Chips when scored', tot(r));
  yo.ability.extra.discards_remaining = 1;
  discard(hand(['S_9'])); flush();
  ok(yo.ability.extra.is_prepared && yo.ability.extra.discards_remaining === 23, 'every 23 discards: prepared again', yo.ability.extra);
});
section(() => { // Chicot! / Negate
  start('MFBCHI');
  const ch = add(J('rot_chicot'));
  G.GAME.blind.chips = 10000;
  const r = useP(ch); flush();
  ok(r.ok && G.GAME.blind.disabled && near(Number(G.GAME.blind.chips), Math.pow(10000, 0.8), 1e-3), 'Negate: the Blind disabled, its size ^0.8', [r.error, String(G.GAME.blind.chips)]);
  start('MFBCHI2', { noBlind: true });
  const ch2 = add(J('rot_chicot')); ch2.ability.extra.is_prepared = false;
  G.GAME.round_resets.blind_tags = { Small: 'tag_d_six', Big: 'tag_d_six' };
  act({ type: 'skip_blind' }); flush();
  ok(ch2.ability.extra.is_prepared, 'a Blind skipped: prepared again');
});
section(() => { // Perkeo! / Mirrorform
  start('MFBPERK');
  const pk = add(J('rot_perkeo'));
  add('c_fool');
  let r = useP(pk); flush();
  ok(r.ok && G.consumeables.cards.length === 3 && G.consumeables.cards.slice(1).every((c) => c.edition && c.edition.negative), 'Mirrorform: two Negative copies of a held consumable', G.consumeables.cards.map((c) => c.config.center.key));
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(pk.ability.extra.should_prep && msgs(r.events).includes('Ready!'), 'four suits scored: Ready!', msgs(r.events));
  winRound(); flush();
  ok(pk.ability.extra.is_prepared, 'prepared at the end of the round');
});
section(() => { // Triangle! / Manamorphose
  start('MFBTRI2');
  const tri = add(J('rot_triangle'));
  const r = useP(tri); flush();
  const used = r.events.filter((e) => e.type === 'use' && P_CENTERS[e.center] && P_CENTERS[e.center].set === 'Colour');
  ok(r.ok && !tri.ability.extra.is_prepared && used.length === 5, 'Manamorphose: five Colour cards used', [r.error, r.events.filter((e) => e.type === 'use').map((e) => e.center)]);
  play(hand(['S_4', 'H_4', 'D_4']));
  winRound(); flush();
  ok(tri.ability.extra.is_prepared, 'a Three of a Kind: prepared at the end of the round');
});
section(() => { // Marigold! / Lotus Bloom
  start('MFBMARI');
  const mg = add(J('rot_marigold'));
  for (const c of G.deck.cards.slice(0, 2)) c.set_ability(P_CENTERS.m_mf_marigold);
  const sel = hand(['S_4'])[0];
  act({ type: 'highlight', ids: [sel.sort_id] });
  const h0 = G.hand.cards.length;
  const r = useP(mg); flush();
  ok(r.ok && sel.config.center.key === 'm_mf_marigold' && G.hand.cards.length === h0 + 2, 'Lotus Bloom: the selected card becomes Marigold, every Marigold in the deck is drawn', [r.error, sel.config.center.key, G.hand.cards.length - h0]);
  hand(['S_9'])[0].set_ability(P_CENTERS.m_bonus); flush();
  ok(mg.ability.extra.is_prepared, 'a card enhanced (not to Marigold): prepared again');
});

done();
