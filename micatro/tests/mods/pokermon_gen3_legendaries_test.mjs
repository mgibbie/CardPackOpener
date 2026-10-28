// The owner's Gen 3 Legendaries (2026-10-28; jokers/pokejokers_designs.js "The weather trio" / "The Eon duo"; PORTING.md):
//   Kyogre 382 (Legendary $20, Water)    Primordial Sea: +1 hand each round; every scored Club retriggers once; Castform locked Rainy.
//   Groudon 383 (Legendary $20, Earth)   Desolate Land: +1 discard each round; scored Hearts / Diamonds X1.25 each; Castform locked Sunny.
//   Primal Clash (both, no Rayquaza): on the round's first deal the cards held decide (Clubs: Kyogre; Hearts + Diamonds: Groudon; Wild
//     both; debuffed / Stone / Hazard neither); a tie: more Energy, else Kyogre. The other does nothing that round (its +1 too).
//   Rayquaza 384 (Legendary $20, Dragon) Delta Stream: both work every round (Castform reads its normal forecast); Dragon Ascent: X0.2
//     per played hand containing a Straight or a Flush (a Straight Flush once).
//   Latias 380 / Latios 381 (Legendary $20, Psychic): X0.15 per Tarot / per Planet used; Soul Dew (both held): either grows both.
//   Energy: Groudon X1.25 -> X1.3125 / X1.375 / X1.4375; Rayquaza's gain 0.2 -> 0.24 / 0.28 / 0.32; Latias / Latios 0.15 -> 0.18 / 0.21
//     / 0.24; Kyogre Energy-inert (poke_no_energy_field).
// Every ability is FIRED through real rounds (act: select_blind deals the first hand) with exact numbers.
//   node micatro/tests/mods/pokermon_gen3_legendaries_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, create_card, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const key = (c) => c.config.center.key;
const lines = (j) => describe(j).lines.join(' | ');
const NEW = ['latias', 'latios', 'kyogre', 'groudon', 'rayquaza'];
const cr = () => G.GAME.current_round;
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
const castform = () => G.jokers.cards.find((c) => key(c) === 'j_poke_castform');

/** Spec of a card: 'H_K', or {k: 'C_2', wild: true} / {k, stone: true} / {k, debuff: true}. */
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  const c = create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.wild ? 'm_wild' : s.stone ? 'm_stone' : 'c_base'] }, area);
  if (s.debuff) { c.ability.debuff_sources = { test: true }; c.set_debuff(); }
  return c;
}
/** Make the deck exactly these cards (the rest wait in the discard pile), so the blind's first deal is exactly them. */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
/** A new run at the first blind select with these jokers (prep(js) before the blind); the first deal is `specs`. -> the jokers */
function deal(seed, specs, jokers, prep) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  if (prep) prep(js);
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
/** From the round in progress: win it, cash out, next blind with this first deal. */
function nextDeal(specs) {
  clearHand();
  winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
}
const play2 = (keys) => { clearHand(); return play(hand(keys)).total; };
const CLUBS = ['C_2', 'C_3', 'C_4', 'C_5', 'H_9'];   // 4 Clubs vs 1 red
const REDS = ['H_2', 'H_3', 'D_4', 'D_5', 'C_9'];    // 4 red vs 1 Club
const TIE = ['C_2', 'C_3', 'H_4', 'D_5', 'S_9'];     // 2 vs 2
/** Use a consumable by key (it sits in the consumable slots first). */
function use(k) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [] }); flush(); return r; }

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 33 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 33+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NEW) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /kyogre|groudon|rayquaza|latias|latios/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the five (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('G3L0');
  const want = { latias: ['Psychic', 8], latios: ['Psychic', 10], kyogre: ['Water', 12], groudon: ['Earth', 14], rayquaza: ['Dragon', 16] };
  for (const n of NEW) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === want[n][0] && c.gen === 3, n + ': Legendary $20, ' + want[n][0] + ' (its card art), Gen 3', [c.rarity, c.cost, c.stage, c.ptype]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === want[n][1] && c.pos.y === 25 && c.soul_pos && c.soul_pos.x === want[n][1] + 1 && c.soul_pos.y === 25,
      n + ': upstream 3.9.1 cell + its floating soul (Natdex ' + want[n][1] + ',25)', [c.atlas, c.pos, c.soul_pos]);
  }
  ok(P_CENTERS.j_poke_kyogre.poke_no_energy_field === true && !P_CENTERS.j_poke_groudon.poke_no_energy_field, 'Kyogre is Energy-inert by design (poke_no_energy_field); the others have energy fields');
  ok(energy_values.Xmult_multi === 0.05 && energy_values.Xmult_mod === 0.2 && !('hands' in energy_values) && !('retriggers' in energy_values) && !('d_size' in energy_values), 'energy fields: Xmult_multi +5%, Xmult_mod +20%; hands / retriggers / d_size none');
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_registeel');
  ok(keys.slice(i, i + 7).join() === 'j_poke_registeel,j_poke_latias,j_poke_latios,j_poke_kyogre,j_poke_groudon,j_poke_rayquaza,j_poke_jirachi', 'Pokédex order: Registeel (379), Latias ... Rayquaza (384), Jirachi (385)', keys.slice(i, i + 7));
  const [leg] = get_current_pool('Joker', 4, true);
  ok(NEW.every((n) => leg.includes('j_poke_' + n)), 'all five are in the Legendary pool', leg.filter((k) => NEW.some((n) => k.includes(n))));
  for (const r of [1, 2, 3]) { const [p] = get_current_pool('Joker', r); ok(!NEW.some((n) => p.includes('j_poke_' + n)), 'not in the rarity ' + r + ' pool'); }
  const seen = new Set();
  for (let k = 0; k < 800 && seen.size < 5; k++) { const c = create_card('Joker', G.jokers, true, null, null, null, null, 'soul' + k); if (NEW.some((n) => key(c) === 'j_poke_' + n)) seen.add(key(c)); c.remove(); }
  ok(seen.size === 5, 'The Soul\'s legendary roll can make each of them', [...seen]);
});

// ------------------------------------------------------------------- Kyogre: +1 hand, Clubs retrigger
sec('kyogre', () => {
  start('G3L1');
  const h0 = cr().hands_left, rr = G.GAME.round_resets.hands;
  const k = add('j_poke_kyogre'); flush();
  ok(cr().hands_left === h0 + 1 && G.GAME.round_resets.hands === rr + 1, '+1 hand on gain (this round and each round)', [h0, cr().hands_left]);
  let t = play2(['C_A']);
  ok(t.chips === 5 + 11 + 11, 'a Club High Card retriggers once: 5 + 11 + 11 = 27 Chips', t);
  t = play2(['H_A']);
  ok(t.chips === 5 + 11, 'a Heart does not: 16', t);
  t = play2(['C_K', 'S_K']);
  ok(t.chips === 10 + 10 + 10 + 10, 'a Pair of Kings, one Club: only the Club retriggers (10 + 10 + 10 + 10 = 40)', t);
  nextDeal(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9']);
  ok(cr().hands_left === rr + 1, 'next round: still +1 hand (' + (rr + 1) + ')', cr().hands_left);
  const before = cr().hands_left;
  k.remove(); flush();
  ok(cr().hands_left === before - 1 && G.GAME.round_resets.hands === rr, 'sold: the hand goes (this round and the next)', [cr().hands_left, G.GAME.round_resets.hands]);
  // Kyogre's Energy changes nothing (Energy-inert)
  start('G3L1b');
  const k2 = add('j_poke_kyogre');
  for (let n = 0; n < 3; n++) increment_energy(k2, 'Water');
  ok(ex(k2).hands === 1 && ex(k2).retriggers === 1, 'three Water Energy: still +1 hand, 1 retrigger', ex(k2));
  ok(/\{C:chips\}\+1\{\} hand/.test(lines(k2)) && /no Groudon/.test(lines(k2)), 'tooltip: +1 hand, Primal Clash "no Groudon"', lines(k2));
});

// ------------------------------------------------------------------- Groudon: +1 discard, Hearts / Diamonds X1.25
sec('groudon', () => {
  start('G3L2');
  const d0 = cr().discards_left, rr = G.GAME.round_resets.discards;
  const g = add('j_poke_groudon'); flush();
  ok(cr().discards_left === d0 + 1 && G.GAME.round_resets.discards === rr + 1, '+1 discard on gain', [d0, cr().discards_left]);
  let t = play2(['H_K']);
  ok(near(t.mult, 1.25), 'a Heart High Card: X1.25 (1 x 1.25)', t);
  t = play2(['H_K', 'D_K']);
  ok(near(t.mult, 2 * 1.25 * 1.25), 'a Heart + Diamond Pair: 2 x 1.25 x 1.25 = 3.125', t);
  t = play2(['C_K', 'S_K']);
  ok(near(t.mult, 2), 'black cards: nothing (2)', t);
  t = play2([]);
  const xs = [];
  for (let n = 0; n < 3; n++) { increment_energy(g, 'Earth'); xs.push(ex(g).Xmult_multi); }
  ok(xs.every((v, n) => near(v, 1.25 + 0.0625 * (n + 1))), 'Earth Energy: X1.25 -> X1.3125 / X1.375 / X1.4375 (+5% of base)', xs);
  t = play2(['H_K']);
  ok(near(t.mult, 1.4375), 'and it scores X1.4375', t);
  ok(ex(g).d_size === 1, 'the +1 discard is fixed', ex(g).d_size);
  ok(/\{C:red\}\+1\{\} discard/.test(lines(g)) && /X1\.438|X1\.4375/.test(lines(g)), 'tooltip: +1 discard, X1.4375', lines(g));
  g.remove(); flush();
  ok(G.GAME.round_resets.discards === rr && cr().discards_left === d0, 'sold: the discard goes', [G.GAME.round_resets.discards, cr().discards_left]);
});

// ------------------------------------------------------------------- Primal Clash
sec('clash', () => {
  // the red deck: 4 hands, 4 discards (+1 each with Kyogre / Groudon)
  let js = deal('G3L3a', CLUBS, ['j_poke_kyogre', 'j_poke_groudon']);
  const base = { h: G.GAME.round_resets.hands - 1, d: G.GAME.round_resets.discards - 1 };
  ok(G.GAME.poke_primal && G.GAME.poke_primal.winner === 'kyogre' && G.GAME.poke_primal.clubs === 4 && G.GAME.poke_primal.red === 1, '4 Clubs vs 1 red held: Kyogre\'s round', G.GAME.poke_primal);
  ok(cr().hands_left === base.h + 1 && cr().discards_left === base.d, 'Kyogre\'s +1 hand applies, Groudon\'s +1 discard does NOT', [cr().hands_left, cr().discards_left, base]);
  let t = play2(['C_A']);
  ok(t.chips === 27 && near(t.mult, 1), 'a Club retriggers (27)', t);
  t = play2(['H_K']);
  ok(near(t.mult, 1), 'a Heart gets no X1.25 (Groudon sits out)', t);
  ok(/Kyogre's round/.test(lines(js[1])) && /4 Clubs, 1 red/.test(lines(js[0])), 'the tooltips say it', [lines(js[0]), lines(js[1])]);
  // the round's decision holds; the next deal re-reads
  nextDeal(REDS);
  ok(G.GAME.poke_primal.winner === 'groudon' && cr().hands_left === base.h && cr().discards_left === base.d + 1, 'next round, 4 red vs 1 Club: Groudon\'s round — +1 discard, no +1 hand', [G.GAME.poke_primal, cr().hands_left, cr().discards_left]);
  t = play2(['C_A']);
  ok(t.chips === 16, 'a Club no longer retriggers (16)', t);
  t = play2(['H_K', 'D_K']);
  ok(near(t.mult, 3.125), 'Hearts / Diamonds X1.25 each (3.125)', t);
  // the loser sold this round: nothing taken twice
  const hl = cr().hands_left;
  js[0].remove(); flush();
  ok(cr().hands_left === hl && G.GAME.round_resets.hands === base.h, 'selling the losing Kyogre this round takes no second hand (its +1 was already off)', [hl, cr().hands_left]);
  js[0] = add('j_poke_kyogre'); flush();
  ok(cr().hands_left === hl && G.GAME.round_resets.hands === base.h + 1, 'a Kyogre gained during Groudon\'s round gives no hand this round (each round from now on)', [cr().hands_left, G.GAME.round_resets.hands]);
  ok(play2(['C_A']).chips === 16, '... nor its retrigger: the round is Groudon\'s');
  const hl2 = cr().hands_left;
  js[0].remove(); flush();
  ok(cr().hands_left === hl2 && G.GAME.round_resets.hands === base.h, '... and sold again, it takes none back', [hl2, cr().hands_left, G.GAME.round_resets.hands]);
  nextDeal(['C_2', 'C_3', 'H_4']);
  ok(G.GAME.poke_primal.winner === null && cr().hands_left === base.h && cr().discards_left === base.d + 1, 'Groudon alone next round: no clash, its +1 discard', [G.GAME.poke_primal, cr().discards_left]);
  // ties
  js = deal('G3L3b', TIE, ['j_poke_kyogre', 'j_poke_groudon']);
  ok(G.GAME.poke_primal.winner === 'kyogre' && G.GAME.poke_primal.tie, 'a 2 vs 2 tie, no Energy: Kyogre', G.GAME.poke_primal);
  js = deal('G3L3c', TIE, ['j_poke_kyogre', 'j_poke_groudon'], (j) => increment_energy(j[1], 'Earth'));
  ok(G.GAME.poke_primal.winner === 'groudon', 'a tie with an Energized Groudon: Groudon', G.GAME.poke_primal);
  js = deal('G3L3d', TIE, ['j_poke_kyogre', 'j_poke_groudon'], (j) => { increment_energy(j[1], 'Earth'); increment_energy(j[0], 'Water'); });
  ok(G.GAME.poke_primal.winner === 'kyogre', 'a tie with both Energized once: Kyogre', G.GAME.poke_primal);
  js = deal('G3L3e', TIE, ['j_poke_kyogre', 'j_poke_groudon'], (j) => { increment_energy(j[1], 'Earth'); increment_energy(j[1], 'Earth'); increment_energy(j[0], 'Water'); });
  ok(G.GAME.poke_primal.winner === 'groudon', 'a tie, Groudon with more Energy (2 vs 1): Groudon', G.GAME.poke_primal);
  // the counting rules (Castform's): Wild counts for both, debuffed / Stone count for neither, Spades nothing
  deal('G3L3f', [{ k: 'H_2', wild: true }, { k: 'H_3', wild: true }, 'H_4', { k: 'C_5', debuff: true }, { k: 'C_6', stone: true }, 'C_7', 'S_8', 'S_9'], ['j_poke_kyogre', 'j_poke_groudon']);
  ok(G.GAME.poke_primal.red === 3 && G.GAME.poke_primal.clubs === 3 && G.GAME.poke_primal.winner === 'kyogre', '2 Wild + 1 Heart vs 2 Wild + 1 Club (the debuffed Club, the Stone and the Spades count for nothing): 3 vs 3, Kyogre', G.GAME.poke_primal);
  // a debuffed partner: no clash at all (each works)
  deal('G3L3g', REDS, ['j_poke_kyogre', 'j_poke_groudon'], (j) => debuff(j[1]));
  ok(G.GAME.poke_primal.winner === null && cr().hands_left === base.h + 1, 'a debuffed Groudon: no clash, Kyogre works (+1 hand)', [G.GAME.poke_primal, cr().hands_left]);
  ok(play2(['C_A']).chips === 27, '... its Clubs retrigger on a red deal');
});

// ------------------------------------------------------------------- Rayquaza: Delta Stream, Dragon Ascent
sec('rayquaza calm', () => {
  deal('G3L4a', CLUBS, ['j_poke_kyogre', 'j_poke_groudon', 'j_poke_rayquaza']);
  const rr = G.GAME.round_resets;
  ok(G.GAME.poke_primal.winner === null && G.GAME.poke_primal.rayquaza && cr().hands_left === rr.hands && cr().discards_left === rr.discards, 'with Rayquaza: no clash, +1 hand AND +1 discard', [G.GAME.poke_primal, cr().hands_left, cr().discards_left]);
  const t = play2(['C_A', 'S_A']);
  ok(t.chips === 10 + 11 + 11 + 11 && near(t.mult, 2), 'both work: the Club retriggers', t);
  ok(near(play2(['H_K', 'D_K']).mult, 3.125), '... and the Hearts / Diamonds X1.25 each');
  ok(/calmed by Rayquaza/.test(lines(G.jokers.cards[0])), 'Kyogre\'s tooltip: calmed by Rayquaza', lines(G.jokers.cards[0]));
  // a debuffed Rayquaza calms nothing
  deal('G3L4b', CLUBS, ['j_poke_kyogre', 'j_poke_groudon', 'j_poke_rayquaza'], (j) => debuff(j[2]));
  ok(G.GAME.poke_primal.winner === 'kyogre', 'a debuffed Rayquaza: the clash is back', G.GAME.poke_primal);
});
sec('dragon ascent', () => {
  start('G3L5');
  const r = add('j_poke_rayquaza');
  let t = play2(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(r).ascent_Xmult, 1.2) && near(t.mult, 4 * 1.2), 'a Straight: +X0.2, and it scores X1.2 at once (4 x 1.2)', [ex(r).ascent_Xmult, t]);
  t = play2(['H_2', 'H_7', 'H_9', 'H_J', 'H_K']);
  ok(near(ex(r).ascent_Xmult, 1.4) && near(t.mult, 4 * 1.4), 'a Flush: X1.4', [ex(r).ascent_Xmult, t]);
  t = play2(['S_5', 'S_6', 'S_7', 'S_8', 'S_9']);
  ok(near(ex(r).ascent_Xmult, 1.6), 'a Straight Flush grows ONCE: X1.6', ex(r).ascent_Xmult);
  t = play2(['S_5', 'H_5']);
  ok(near(ex(r).ascent_Xmult, 1.6) && near(t.mult, 2 * 1.6), 'a Pair: no growth, X1.6 still given', [ex(r).ascent_Xmult, t]);
  // Blueprint: copies the X, doesn't grow
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers; G.jokers.set_ranks && G.jokers.set_ranks();
  t = play2(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(r).ascent_Xmult, 1.8) && near(t.mult, 4 * 1.8 * 1.8), 'Blueprint copies the X (X1.8 twice) but the Straight grows it once', [ex(r).ascent_Xmult, t]);
  bp.remove(); flush();
  const gains = [];
  for (let n = 0; n < 3; n++) { increment_energy(r, 'Dragon'); gains.push(ex(r).Xmult_mod); }
  ok(gains.every((v, n) => near(v, 0.2 + 0.04 * (n + 1))) && near(ex(r).ascent_Xmult, 1.8), 'Dragon Energy: the gain 0.2 -> 0.24 / 0.28 / 0.32 (the banked X1.8 unchanged)', [gains, ex(r).ascent_Xmult]);
  play2(['H_2', 'H_7', 'H_9', 'H_J', 'H_K']);
  ok(near(ex(r).ascent_Xmult, 2.12), 'a 3-Energy Flush: +X0.32 (X2.12)', ex(r).ascent_Xmult);
  ok(/X2\.12/.test(lines(r)) && /X0\.32/.test(lines(r)), 'tooltip: Currently X2.12, gains X0.32', lines(r));
});

// ------------------------------------------------------------------- Latias / Latios, Soul Dew
sec('eon duo', () => {
  start('G3L6');
  const la = add('j_poke_latias');
  use('c_hermit');
  ok(near(ex(la).eon_Xmult, 1.15), 'Latias: a Tarot (The Hermit) +X0.15', ex(la).eon_Xmult);
  use('c_mercury');
  ok(near(ex(la).eon_Xmult, 1.15), 'Latias alone: a Planet does nothing', ex(la).eon_Xmult);
  let t = play2(['S_2']);
  ok(near(t.mult, 1.15), 'it scores X1.15', t);
  const lo = add('j_poke_latios');
  use('c_mercury');
  ok(near(ex(lo).eon_Xmult, 1.15) && near(ex(la).eon_Xmult, 1.3), 'Soul Dew: a Planet grows Latios AND Latias', [ex(lo).eon_Xmult, ex(la).eon_Xmult]);
  use('c_hermit');
  ok(near(ex(lo).eon_Xmult, 1.3) && near(ex(la).eon_Xmult, 1.45), 'Soul Dew: a Tarot grows both too', [ex(lo).eon_Xmult, ex(la).eon_Xmult]);
  use('c_ectoplasm');
  ok(near(ex(lo).eon_Xmult, 1.3) && near(ex(la).eon_Xmult, 1.45), 'a Spectral grows neither', [ex(lo).eon_Xmult, ex(la).eon_Xmult]);
  // a debuffed partner breaks Soul Dew
  debuff(la);
  use('c_hermit');
  ok(near(ex(lo).eon_Xmult, 1.3) && near(ex(la).eon_Xmult, 1.45), 'a debuffed Latias: a Tarot grows neither (Latios needs Soul Dew, Latias is out)', [ex(lo).eon_Xmult, ex(la).eon_Xmult]);
  use('c_venus');
  ok(near(ex(lo).eon_Xmult, 1.45) && near(ex(la).eon_Xmult, 1.45), '... a Planet grows only Latios', [ex(lo).eon_Xmult, ex(la).eon_Xmult]);
  ok(/needs Latias/.test(lines(lo)), 'Latios\'s tooltip: Soul Dew needs Latias', lines(lo));
  la.ability.debuff_sources = {}; la.set_debuff();
  ok(!la.debuff && /Soul Dew: \{C:attention\}?active|Soul Dew: active/.test(lines(lo)), 'undebuffed: Soul Dew active', lines(lo));
  // Blueprint copies the X, never grows
  start('G3L6b');
  const la2 = add('j_poke_latias');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  use('c_hermit');
  ok(near(ex(la2).eon_Xmult, 1.15), 'a Blueprint beside Latias: one Tarot, one growth (X1.15)', ex(la2).eon_Xmult);
  t = play2(['S_2']);
  ok(near(t.mult, 1.15 * 1.15), '... and it copies the X (1.15 x 1.15)', t);
  // Energy: the gain
  start('G3L6c');
  const la3 = add('j_poke_latias'), lo3 = add('j_poke_latios');
  const g = [];
  for (let n = 0; n < 3; n++) { increment_energy(la3, 'Psychic'); g.push(ex(la3).Xmult_mod); }
  ok(g.every((v, n) => near(v, 0.15 + 0.03 * (n + 1))), 'Psychic Energy: Latias 0.15 -> 0.18 / 0.21 / 0.24', g);
  increment_energy(lo3, 'Psychic');
  use('c_hermit');
  ok(near(ex(la3).eon_Xmult, 1.24) && near(ex(lo3).eon_Xmult, 1.18), 'a Tarot: Latias +0.24, Latios (1 Energy, via Soul Dew) +0.18', [ex(la3).eon_Xmult, ex(lo3).eon_Xmult]);
  ok(/X1\.24/.test(lines(la3)) && /X0\.24/.test(lines(la3)) && /Soul Dew: active/.test(lines(la3).replace(/\{[^}]*\}/g, '')), 'Latias tooltip: Currently X1.24, X0.24, Soul Dew active', lines(la3));
});

// ------------------------------------------------------------------- Castform locked by Kyogre / Groudon
sec('castform', () => {
  // Kyogre: Rainy even on a Spade / red deal; Castform's Rainy effect fires
  deal('G3L7a', ['S_2', 'S_3', 'S_4', 'S_5', 'H_6', 'H_7'], ['j_poke_castform', 'j_poke_kyogre']);
  ok(ex(castform()).form === 'rainy' && ex(castform()).ptype === 'Water', 'Kyogre held (Castform to its LEFT, reading first): a Spade deal is Rainy anyway (Water)', [ex(castform()).form]);
  let t = play2(['C_A']);
  ok(t.chips === 5 + (11 + 30) * 3, 'a Club: Kyogre\'s retrigger + Rainy\'s first-Club retrigger and +30 Chips each (5 + 41 x 3 = 128)', t);
  // Groudon: Sunny even on a Club deal
  deal('G3L7b', CLUBS.concat(['C_6', 'C_7']), ['j_poke_groudon', 'j_poke_castform']);
  ok(ex(castform()).form === 'sunny' && ex(castform()).ptype === 'Fire', 'Groudon held: a Club deal is Sunny (Fire)', ex(castform()).form);
  t = play2(['H_K']);
  ok(near(t.mult, 1 * 1.25 + 4), 'a Heart: Groudon (left) X1.25, then Sunny +4 Mult (1 x 1.25 + 4 = 5.25)', t);
  // both: the clash winner's weather
  deal('G3L7c', REDS, ['j_poke_castform', 'j_poke_kyogre', 'j_poke_groudon']);
  ok(ex(castform()).form === 'sunny' && G.GAME.poke_primal.winner === 'groudon', 'the clash (red deal): Groudon\'s round, Castform Sunny', [ex(castform()).form, G.GAME.poke_primal.winner]);
  deal('G3L7d', CLUBS, ['j_poke_castform', 'j_poke_kyogre', 'j_poke_groudon']);
  ok(ex(castform()).form === 'rainy', 'the clash (Club deal): Kyogre\'s round, Castform Rainy', ex(castform()).form);
  // Rayquaza: the normal forecast (Spades -> Snowy)
  deal('G3L7e', ['S_2', 'S_3', 'S_4', 'S_5', 'C_6'], ['j_poke_castform', 'j_poke_kyogre', 'j_poke_groudon', 'j_poke_rayquaza']);
  ok(ex(castform()).form === 'snowy', 'with Rayquaza the weather is calm: Castform reads the normal forecast (Spades: Snowy)', ex(castform()).form);
  deal('G3L7f', ['S_2', 'S_3', 'S_4', 'S_5', 'C_6'], ['j_poke_castform', 'j_poke_kyogre', 'j_poke_rayquaza']);
  ok(ex(castform()).form === 'snowy', 'Kyogre + Rayquaza: the normal forecast too', ex(castform()).form);
  // a debuffed Kyogre locks nothing
  deal('G3L7g', ['S_2', 'S_3', 'S_4', 'S_5', 'C_6'], ['j_poke_castform', 'j_poke_kyogre'], (j) => debuff(j[1]));
  ok(ex(castform()).form === 'snowy', 'a debuffed Kyogre: no lock (Snowy)', ex(castform()).form);
  // the lock holds every round, and Castform is Normal again in the shop
  deal('G3L7h', ['S_2', 'S_3', 'S_4'], ['j_poke_castform', 'j_poke_kyogre']);
  clearHand(); winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && ex(castform()).form === 'normal', 'in the shop Castform is Normal again (its own card)', [ex(castform()).form]);
  act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(['H_2', 'H_3', 'D_4']); act({ type: 'select_blind' }); flush();
  ok(ex(castform()).form === 'rainy', 'next round (a red deal): Rainy again', ex(castform()).form);
  // no legend: Castform unchanged
  deal('G3L7i', REDS, ['j_poke_castform']);
  ok(ex(castform()).form === 'sunny' && G.GAME.poke_primal.winner === null, 'no Kyogre / Groudon: the usual forecast (red: Sunny)', ex(castform()).form);
});

done();
