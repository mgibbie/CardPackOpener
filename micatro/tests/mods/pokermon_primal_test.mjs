// Pokermon batch E, the Primal Reversions (contentRev PRIMAL_REV; mods/pokermon/primal.js, jokers/pokejokers_designs.js; the owner's
// "orb version yes", 2026-11-03):
//   - the Blue Orb / Red Orb (Items, $4): the selected (else the leftmost) undebuffed Kyogre / Groudon becomes Primal Kyogre / Primal Groudon
//     for good; refused with none; nothing else touched (a Mega Stone's state, the other species); Energy carries over; save / resume;
//   - Primal Kyogre: +2 hands, every scored Club retriggers twice, always raining (Swift Swim's rain check, Castform Rainy);
//     Primal Groudon: +2 discards, scored Hearts / Diamonds X1.5 each (Energy +5%), always sunny (Cherrim's sun check, Castform Sunny);
//   - the Primal Clash: a Primal always beats the other's normal form; Primal vs Primal the first deal decides; Rayquaza calms both;
//   - where the Orbs turn up: Items (the Pocket Packs) and the Ancient (Red) / Future (Blue) Packs' first card, only while you hold the
//     Legendary, only on PRIMAL_REV (a run recorded before it replays as recorded); never a Primal in a pool; the art.
//   node micatro/tests/mods/pokermon_primal_test.mjs
import fs from 'fs';
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, create_card, get_current_pool } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';
import { megastone_can_use } from '../../mods/pokermon/systems/items.js';
import { PRIMAL_REV, swift_swim_raining, cherrim_sunny } from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { ORBS, primal_pack_orb } from '../../mods/pokermon/primal.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const key = (c) => c.config.center.key;
const lines = (j) => describe(j).lines.join(' | ');
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const cr = () => G.GAME.current_round;
const J = (k) => G.jokers.cards.find((c) => key(c) === k);
const castform = () => J('j_poke_castform');
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
const OLD = { pokermon: '3.9.1+r' + (PRIMAL_REV - 1) };
const oldRules = (fn) => { PINS.RULES.pins = OLD; try { return fn(); } finally { PINS.RULES.pins = null; } };

function mk(s, area) { return create_playing_card({ front: P_CARDS[s], center: P_CENTERS.c_base }, area); }
function stackDeck(specs) { for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); } return specs.map((s) => mk(s, G.deck)); }
/** A new run at the first blind select with these jokers (prep(js) before the blind); the first deal is `specs`. -> the jokers */
function deal(seed, specs, jokers, prep) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  if (prep) prep(js);
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
function nextDeal(specs) {
  clearHand(); winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
}
const play2 = (keys) => { clearHand(); return play(hand(keys)).total; };
/** Use the Orb (added to the consumables first) -> the act result. */
function useOrb(k, orb, pick) { const c = orb || add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(pick ? { joker_targets: [pick.sort_id] } : {}) }); flush(); return { r, c }; }
const CLUBS = ['C_2', 'C_3', 'C_4', 'C_5', 'H_9'];   // 4 Clubs vs 1 red
const REDS = ['H_2', 'H_3', 'D_4', 'D_5', 'C_9'];    // 4 red vs 1 Club
const SPADES = ['S_2', 'S_3', 'S_4', 'S_5', 'H_6'];

// ------------------------------------------------------------------- static data, pools
sec('static', () => {
  start('PRM0');
  ok(MODS.pokermon.contentRev >= PRIMAL_REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev ' + PRIMAL_REV + '+', PINS.modPin('pokermon'));
  for (const [n, t, x] of [['primal_kyogre', 'Water', 4], ['primal_groudon', 'Earth', 2]]) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 3 && c.poke_primal, n + ': Legendary $20, stage Legendary, ' + t + ', Gen 3', c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c && c.atlas === 'poke_AtlasJokersBasicGen03391' && c.pos.x === x && c.pos.y === 7 && c.soul_pos.x === x + 1 && c.soul_pos.y === 7, n + ': upstream 3.9.1 Gen 3 cell {' + x + ',7} + its soul', c && [c.atlas, c.pos, c.soul_pos]);
  }
  for (const [k, x] of [['c_poke_blueorb', 0], ['c_poke_redorb', 1]]) {
    const c = P_CENTERS[k];
    ok(c && c.set === 'Item' && c.cost === 4 && c.atlas === 'poke_primal_orbs' && c.pos.x === x && c.pos.y === 0 && c.saveable, k + ': an Item, $4, its composed card, saveable', c && [c.set, c.cost, c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_kyogre');
  ok(keys.slice(i, i + 5).join() === 'j_poke_kyogre,j_poke_primal_kyogre,j_poke_groudon,j_poke_primal_groudon,j_poke_rayquaza', 'Pokédex order (3.9.1 dex_order): Kyogre, Primal Kyogre, Groudon, Primal Groudon, Rayquaza', keys.slice(i, i + 5));
  const [leg] = get_current_pool('Joker', 4, true);
  ok(!leg.includes('j_poke_primal_kyogre') && !leg.includes('j_poke_primal_groudon') && leg.includes('j_poke_kyogre'), 'never in the Legendary pool (Kyogre is)');
  let made = 0;
  for (let k = 0; k < 600; k++) { const c = create_card('Joker', G.jokers, true, null, null, null, null, 'psoul' + k); if (P_CENTERS[key(c)].poke_primal) made++; c.remove(); }
  ok(made === 0, "The Soul's legendary roll never makes a Primal", made);
});

// ------------------------------------------------------------------- the Orbs: use, refusal, permanence
sec('orb use', () => {
  start('PRM1');
  // nothing to turn: refused, kept
  let { r, c } = useOrb('c_poke_blueorb');
  ok(r.ok === false && G.consumeables.cards.includes(c), 'no Kyogre: the Blue Orb can\'t be used (kept)', r);
  const gr = add('j_poke_groudon');
  ({ r } = useOrb('c_poke_blueorb', c));
  ok(r.ok === false && key(gr) === 'j_poke_groudon', '... a Groudon is no target for the Blue Orb');
  const ky = debuff(add('j_poke_kyogre'));
  ({ r } = useOrb('c_poke_blueorb', c));
  ok(r.ok === false && key(ky) === 'j_poke_kyogre', '... nor a debuffed Kyogre');
  ky.ability.debuff_sources = {}; ky.set_debuff();
  // two Kyogres: the selected one turns, not the leftmost
  const ky2 = add('j_poke_kyogre');
  ({ r } = useOrb('c_poke_blueorb', c, ky2));
  ok(r.ok !== false && key(ky2) === 'j_poke_primal_kyogre' && key(ky) === 'j_poke_kyogre' && (c.removed || !G.consumeables.cards.includes(c)), 'the selected Kyogre becomes Primal Kyogre; the leftmost stays; the Orb is used up', [key(ky), key(ky2), r]);
  ({ r } = useOrb('c_poke_blueorb'));
  ok(r.ok !== false && key(ky) === 'j_poke_primal_kyogre', 'nothing selected: the leftmost Kyogre turns');
  // Red Orb
  ({ r } = useOrb('c_poke_redorb'));
  ok(r.ok !== false && key(gr) === 'j_poke_primal_groudon', 'the Red Orb: Groudon -> Primal Groudon');
  // permanent: rounds pass, it stays; no Mega Stone targets it
  const stone = add('c_poke_megastone');
  ok(!megastone_can_use(stone), 'a Mega Stone has no target among the Primals (not Megas, no megas list)');
  G.GAME.modifiers.poke_infinite_megastone = true;
  ok(!megastone_can_use(stone), '... not even the Mega Sleeve\'s endless stone (it never reverts a Primal)');
  delete G.GAME.modifiers.poke_infinite_megastone;
  for (let n = 0; n < 2; n++) { clearHand(); winRound(); flush(); act({ type: 'cash_out' }); act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); }
  ok(key(ky) === 'j_poke_primal_kyogre' && key(gr) === 'j_poke_primal_groudon' && key(ky2) === 'j_poke_primal_kyogre', 'two rounds later they are still Primal (for good)');
  // a used Mega Stone's state is untouched by an Orb
  start('PRM1b');
  const ch = add('j_poke_charizard');
  const st = add('c_poke_megastone');
  act({ type: 'use', id: st.sort_id, targets: [] }); flush();
  const used_on = ex(st).used_on, usable = ex(st).usable;
  add('j_poke_kyogre');
  useOrb('c_poke_blueorb');
  ok(/mega_charizard/.test(key(ch)) && ex(st).used_on === used_on && ex(st).usable === usable && J('j_poke_primal_kyogre'), 'an Orb leaves a Mega Stone and its Mega as they were', [key(ch), ex(st).used_on, used_on]);
  // no evolution context: an Everstone-free evolution counter ... (Primal Reversion is not an evolution)
  ok(/Primal Kyogre/.test(plain(J('j_poke_primal_kyogre'))) || /Primordial Sea/.test(plain(J('j_poke_primal_kyogre'))), 'its tooltip reads', plain(J('j_poke_primal_kyogre')));
  // tooltips
  const bo = add('c_poke_blueorb');
  ok(/The selected or leftmost Kyogre becomes Primal Kyogre for good/.test(plain(bo)), 'Blue Orb text', plain(bo));
});

// ------------------------------------------------------------------- Energy carries
sec('energy', () => {
  start('PRM2');
  const g = add('j_poke_groudon');
  increment_energy(g, 'Earth'); increment_energy(g, 'Earth');
  ok(near(ex(g).Xmult_multi, 1.375), 'Groudon, 2 Earth Energy: X1.375');
  useOrb('c_poke_redorb');
  ok(key(g) === 'j_poke_primal_groudon' && ex(g).energy_count === 2 && near(ex(g).Xmult_multi, 1.65), 'Primal Groudon keeps the 2 Energy: X1.5 -> X1.65 (+5% of base each)', [ex(g).energy_count, ex(g).Xmult_multi]);
  increment_energy(g, 'Earth');
  ok(near(ex(g).Xmult_multi, 1.725) && ex(g).d_size === 2, 'a third: X1.725; the +2 discards fixed', [ex(g).Xmult_multi, ex(g).d_size]);
  ok(near(play2(['H_K']).mult, 1.725), 'and it scores X1.725');
  const k = add('j_poke_kyogre');
  increment_energy(k, 'Water');
  useOrb('c_poke_blueorb');
  ok(key(k) === 'j_poke_primal_kyogre' && ex(k).energy_count === 1 && ex(k).hands === 2 && ex(k).retriggers === 2 && P_CENTERS.j_poke_primal_kyogre.poke_no_energy_field,
    'Primal Kyogre keeps the Energy; its numbers are fixed (Energy-inert, as Kyogre)', ex(k));
});

// ------------------------------------------------------------------- Primal effects in real hands
sec('primal kyogre', () => {
  start('PRM3');
  const rr = G.GAME.round_resets.hands, h0 = cr().hands_left;
  const k = add('j_poke_kyogre'); flush();
  ok(cr().hands_left === h0 + 1, 'Kyogre: +1 hand');
  useOrb('c_poke_blueorb');
  ok(key(k) === 'j_poke_primal_kyogre' && cr().hands_left === h0 + 2 && G.GAME.round_resets.hands === rr + 2, 'Primal Kyogre: +2 hands (this round and each round)', [cr().hands_left, G.GAME.round_resets.hands]);
  let t = play2(['C_A']);
  ok(t.chips === 5 + 11 * 3, 'a Club High Card retriggers twice: 5 + 11 x 3 = 38 Chips', t);
  t = play2(['H_A']);
  ok(t.chips === 5 + 11, 'a Heart does not: 16', t);
  ok(swift_swim_raining({ ability: { extra: {} } }), 'it\'s raining (Swift Swim\'s rain check)');
  ok(/\+2\{\} hands/.test(lines(k)) && /retriggers \{C:attention\}twice/.test(lines(k)) && /no Groudon/.test(lines(k)), 'tooltip: +2 hands, twice, no Groudon', lines(k));
  const before = cr().hands_left;
  k.remove(); flush();
  ok(cr().hands_left === before - 2 && G.GAME.round_resets.hands === rr, 'sold: both hands go', [cr().hands_left, G.GAME.round_resets.hands]);
});
sec('primal groudon', () => {
  start('PRM4');
  const rr = G.GAME.round_resets.discards, d0 = cr().discards_left;
  const g = add('j_poke_groudon'); flush();
  useOrb('c_poke_redorb');
  ok(key(g) === 'j_poke_primal_groudon' && cr().discards_left === d0 + 2 && G.GAME.round_resets.discards === rr + 2, 'Primal Groudon: +2 discards', [cr().discards_left, G.GAME.round_resets.discards]);
  ok(near(play2(['H_K', 'D_K']).mult, 2 * 1.5 * 1.5), 'a Heart + Diamond Pair: 2 x 1.5 x 1.5 = 4.5');
  ok(near(play2(['C_K', 'S_K']).mult, 2), 'black cards: nothing');
  ok(cherrim_sunny({ ability: { extra: {} } }), 'it\'s sunny (Cherrim\'s sun check)');
  ok(/X1\.5 \{\} Mult/.test(lines(g)) && /\+2\{\} discards/.test(lines(g)), 'tooltip', lines(g));
});
sec('castform', () => {
  deal('PRM5a', SPADES.concat(['S_6', 'S_7']), ['j_poke_castform', 'j_poke_kyogre'], () => { useOrb('c_poke_blueorb'); });
  ok(J('j_poke_primal_kyogre') && ex(castform()).form === 'rainy', 'Primal Kyogre held: a Spade deal is Rainy', ex(castform()).form);
  deal('PRM5b', CLUBS.concat(['C_6', 'C_7']), ['j_poke_groudon', 'j_poke_castform'], () => { useOrb('c_poke_redorb'); });
  ok(J('j_poke_primal_groudon') && ex(castform()).form === 'sunny', 'Primal Groudon held: a Club deal is Sunny', ex(castform()).form);
});

// ------------------------------------------------------------------- the Primal Clash
sec('clash', () => {
  // Primal Kyogre vs a normal Groudon, on a RED deal (normally Groudon's round): the Primal wins anyway
  deal('PRM6a', REDS, ['j_poke_castform', 'j_poke_kyogre', 'j_poke_groudon'], () => { useOrb('c_poke_blueorb'); });
  const base = { h: G.GAME.round_resets.hands - 2, d: G.GAME.round_resets.discards - 1 };
  ok(G.GAME.poke_primal.winner === 'kyogre' && G.GAME.poke_primal.primal === 'kyogre', 'Primal Kyogre vs Groudon, 4 red vs 1 Club held: Primal Kyogre\'s round anyway', G.GAME.poke_primal);
  ok(cr().hands_left === base.h + 2 && cr().discards_left === base.d, 'its +2 hands apply; Groudon\'s +1 discard does not', [cr().hands_left, cr().discards_left, base]);
  ok(play2(['C_A']).chips === 5 + (11 + 30) * 4 && near(play2(['H_K']).mult, 1), "a Club: Primal Kyogre's two retriggers + Rainy Castform's one, +30 Chips each (5 + 41 x 4 = 169); Hearts get nothing (Groudon sits out)");
  ok(ex(castform()).form === 'rainy' && swift_swim_raining({ ability: { extra: {} } }) && !cherrim_sunny({ ability: { extra: {} } }), 'raining, not sunny; Castform Rainy');
  ok(/Primal Kyogre's round \(every round\)/.test(lines(J('j_poke_groudon'))), 'Groudon\'s tooltip says it', lines(J('j_poke_groudon')));
  nextDeal(REDS);
  ok(G.GAME.poke_primal.winner === 'kyogre' && cr().discards_left === base.d, 'next round, red again: still Primal Kyogre\'s (every round)', G.GAME.poke_primal);
  // the reverse: Primal Groudon vs Kyogre on a Club deal
  deal('PRM6b', CLUBS, ['j_poke_kyogre', 'j_poke_groudon'], () => { useOrb('c_poke_redorb'); });
  ok(G.GAME.poke_primal.winner === 'groudon' && G.GAME.poke_primal.primal === 'groudon', 'Primal Groudon vs Kyogre, a Club deal: Primal Groudon\'s round', G.GAME.poke_primal);
  ok(play2(['C_A']).chips === 16 && near(play2(['H_K', 'D_K']).mult, 4.5), 'no Club retrigger; Hearts / Diamonds X1.5');
  // both Primal: the deal decides, as before
  deal('PRM6c', REDS, ['j_poke_kyogre', 'j_poke_groudon'], () => { useOrb('c_poke_blueorb'); useOrb('c_poke_redorb'); });
  ok(G.GAME.poke_primal.winner === 'groudon' && !G.GAME.poke_primal.primal, 'both Primal, a red deal: Primal Groudon\'s round (the cards held decide)', G.GAME.poke_primal);
  const hl = cr().hands_left;
  ok(play2(['C_A']).chips === 16, '... Primal Kyogre sits out (no retrigger)');
  ok(hl === G.GAME.round_resets.hands - 2, '... and its +2 hands are taken back this round', [hl, G.GAME.round_resets.hands]);
  deal('PRM6d', CLUBS, ['j_poke_kyogre', 'j_poke_groudon'], () => { useOrb('c_poke_blueorb'); useOrb('c_poke_redorb'); });
  ok(G.GAME.poke_primal.winner === 'kyogre', 'both Primal, a Club deal: Primal Kyogre\'s', G.GAME.poke_primal);
  // a normal Kyogre beside Primal Kyogre: their side has a Primal, so it wins too
  deal('PRM6e', REDS, ['j_poke_kyogre', 'j_poke_kyogre', 'j_poke_groudon'], (js) => { useOrb('c_poke_blueorb', null, js[1]); });
  ok(G.GAME.poke_primal.winner === 'kyogre' && play2(['C_A']).chips === 5 + 11 * 4, 'Kyogre + Primal Kyogre vs Groudon: the Kyogre side wins; both retrigger (1 + 2 + 1)');
  // Rayquaza calms everything
  deal('PRM6f', REDS, ['j_poke_kyogre', 'j_poke_groudon', 'j_poke_rayquaza'], () => { useOrb('c_poke_blueorb'); });
  ok(G.GAME.poke_primal.winner === null && G.GAME.poke_primal.rayquaza, 'with Rayquaza: no clash', G.GAME.poke_primal);
  ok(play2(['C_A']).chips === 38 && near(play2(['H_K']).mult, 1.25), 'both work: Clubs twice, Hearts X1.25');
  ok(/calmed by Rayquaza/.test(lines(J('j_poke_primal_kyogre'))), 'tooltip: calmed by Rayquaza');
  // the round's decision holds: an Orb used mid-round on the losing Kyogre gives nothing this round, wins from the next
  deal('PRM6g', REDS, ['j_poke_kyogre', 'j_poke_groudon']);
  ok(G.GAME.poke_primal.winner === 'groudon', 'Kyogre vs Groudon, red: Groudon\'s round');
  const h1 = cr().hands_left;
  useOrb('c_poke_blueorb');
  ok(key(G.jokers.cards[0]) === 'j_poke_primal_kyogre' && cr().hands_left === h1 && play2(['C_A']).chips === 16, 'the Orb used mid-round: Primal Kyogre gives nothing this round (the decision holds)', [cr().hands_left, h1]);
  nextDeal(REDS);
  ok(G.GAME.poke_primal.winner === 'kyogre' && G.GAME.poke_primal.primal === 'kyogre', 'next round: Primal Kyogre wins', G.GAME.poke_primal);
});

// ------------------------------------------------------------------- where the Orbs turn up
sec('pools', () => {
  start('PRM7');
  const inItems = (k) => get_current_pool('Item')[0].includes(k);
  ok(!inItems('c_poke_blueorb') && !inItems('c_poke_redorb'), 'no Kyogre / Groudon: neither Orb is in the Item pool');
  const k = add('j_poke_kyogre');
  ok(inItems('c_poke_blueorb') && !inItems('c_poke_redorb'), 'holding Kyogre: the Blue Orb is (the Red one isn\'t)');
  ok(oldRules(() => !inItems('c_poke_blueorb')), '... but not on the rules before r' + PRIMAL_REV + ' (a run recorded then)');
  debuff(k);
  ok(inItems('c_poke_blueorb'), 'a debuffed Kyogre still counts as held');
  k.remove(); flush();
  add('j_poke_groudon');
  ok(inItems('c_poke_redorb') && !inItems('c_poke_blueorb'), 'holding Groudon: the Red Orb');
  // a Primal held keeps its species out of the pools (Showman lets it back)
  start('PRM7b');
  add('j_poke_kyogre'); useOrb('c_poke_blueorb');
  const [leg] = get_current_pool('Joker', 4, true);
  ok(!leg.includes('j_poke_kyogre') && leg.includes('j_poke_groudon'), 'holding Primal Kyogre: no second Kyogre in the pools (Groudon still)');
  ok(!inItems('c_poke_blueorb'), '... and no Blue Orb (no Kyogre left to turn)');
  add('j_ring_master');
  ok(get_current_pool('Joker', 4, true)[0].includes('j_poke_kyogre'), 'with Showman: Kyogre again');
  // a Pocket Pack's Item slots can deal one
  let seen = 0;
  for (let n = 0; n < 60 && !seen; n++) {
    start('PRM7p' + n);
    add('j_poke_kyogre');
    clearHand(); winRound(); flush(); act({ type: 'cash_out' }); flush();
    G.GAME.dollars = 100;
    const p = create_card('Booster', G.shop_booster, null, null, null, null, 'p_poke_pokepack_jumbo_1'); G.shop_booster.emplace(p); flush();
    act({ type: 'buy', id: p.sort_id }); flush();
    if (G.pack_cards.cards.some((c) => key(c) === 'c_poke_blueorb')) seen = n + 1;
  }
  ok(seen > 0, 'a Jumbo Pocket Pack, holding Kyogre: a Blue Orb turns up (seed ' + seen + ')');
});
sec('paradox packs', () => {
  const open = (seed, packKey, jokers, rules) => {
    start(seed);
    for (const j of jokers) add(j);
    clearHand(); winRound(); flush(); act({ type: 'cash_out' }); flush();
    G.GAME.dollars = 100;
    const p = create_card('Booster', G.shop_booster, null, null, null, null, packKey); G.shop_booster.emplace(p); flush();
    const buy = () => { act({ type: 'buy', id: p.sort_id }); flush(); };
    if (rules) oldRules(buy); else buy();
    return G.pack_cards.cards.map(key);
  };
  let hit = 0, n = 0, nonfirst = 0;
  for (; n < 40; n++) {
    const got = open('PRM8a' + n, 'p_poke_pokepack_ancient_jumbo', ['j_poke_groudon']);
    if (got[0] === 'c_poke_redorb') hit++;
    if (got.slice(1).includes('c_poke_redorb') || got.includes('c_poke_blueorb')) nonfirst++;
  }
  ok(hit >= 4 && hit <= 20 && nonfirst === 0, 'an Ancient Jumbo, holding Groudon: its first card is the Red Orb about 1 time in 4 (' + hit + ' of 40), never elsewhere', [hit, nonfirst]);
  let futureHit = 0;
  for (let m = 0; m < 40; m++) if (open('PRM8b' + m, 'p_poke_pokepack_future_normal', ['j_poke_kyogre'])[0] === 'c_poke_blueorb') futureHit++;
  ok(futureHit > 0, 'a Future Pack, holding Kyogre: the Blue Orb (' + futureHit + ' of 40)');
  let wrong = 0;
  for (let m = 0; m < 20; m++) {
    const a = open('PRM8c' + m, 'p_poke_pokepack_ancient_normal', ['j_poke_kyogre']);
    const b = open('PRM8d' + m, 'p_poke_pokepack_future_normal', ['j_poke_groudon']);
    if (a.concat(b).some((k) => ORBS[k])) wrong++;
  }
  ok(wrong === 0, 'never the other era\'s Orb, nor one without its Legendary', wrong);
  // the rules before r PRIMAL_REV: never, and its seed is never drawn
  let old = 0, drawn = 0;
  for (let m = 0; m < 20; m++) {
    const got = open('PRM8e' + m, 'p_poke_pokepack_ancient_jumbo', ['j_poke_groudon'], true);
    if (got.some((k) => ORBS[k])) old++;
    if (Object.keys(G.GAME.pseudorandom || {}).some((s) => /orb/.test(s))) drawn++;
  }
  ok(old === 0 && drawn === 0, 'on the old rules: never an Orb, its roll never drawn (the pack deals as recorded)', [old, drawn]);
  // taken from the pack: saved, then used
  let found = false;
  for (let m = 0; m < 40 && !found; m++) {
    const got = open('PRM8f' + m, 'p_poke_pokepack_ancient_normal', ['j_poke_groudon']);
    if (got[0] !== 'c_poke_redorb') continue;
    found = true;
    const orb = G.pack_cards.cards[0];
    const r = act({ type: 'reserve', id: orb.sort_id }); flush();
    ok(r.ok !== false && G.consumeables.cards.includes(orb), 'the Red Orb can be saved from the pack', r);
    if (G.STATE !== STATES.SHOP) act({ type: 'skip_booster' });
    flush();
    useOrb(null, orb);
    ok(J('j_poke_primal_groudon'), '... and used: Primal Groudon');
  }
  ok(found, 'an Ancient Pack with the Red Orb was found to take it from');
  ok(primal_pack_orb('nowhere') === null, 'no Orb for another pack');
});

// ------------------------------------------------------------------- save / resume, and an old run replays as recorded
sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'PRMRESUME', customDeck: { name: 'Primal', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 6, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_kyogre' }, { key: 'j_poke_groudon' }, { key: 'j_poke_castform' }],
    consumables: [{ key: 'c_poke_blueorb' }, { key: 'c_poke_earth_energy' }, { key: 'c_poke_redorb' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  const C = (k) => G.consumeables.cards.find((c) => key(c) === k);
  must({ type: 'use', id: C('c_poke_blueorb').sort_id, targets: [] });
  must({ type: 'use', id: C('c_poke_earth_energy').sort_id, targets: [] });
  let rounds = 0;
  while (rounds < 2 && G.STATE !== STATES.GAME_OVER) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  must({ type: 'use', id: C('c_poke_redorb').sort_id, targets: [] });
  if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
  const snap = () => [G.jokers.cards.map(key).join(','), G.jokers.cards.map((j) => JSON.stringify(j.ability.extra)).join('|'), JSON.stringify(G.GAME.poke_primal), G.GAME.round_resets.hands,
    G.GAME.round_resets.discards, cr().hands_left, cr().discards_left, G.GAME.dollars, String(G.GAME.chips), G.consumeables.cards.map(key).join(',')];
  const live = snap();
  ok(/primal_kyogre/.test(live[0]) && /primal_groudon/.test(live[0]), 'live: both Primal', live[0]);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed: the Primals, their Energy, the clash and the hands / discards come back exactly', [r.stoppedAt, snap(), live]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too');
});
sec('old run', () => {
  // A run recorded on the rules before PRIMAL_REV (the pins say r(PRIMAL_REV - 1)): Kyogre + Groudon held through shops and Pocket Packs.
  // Its resume re-plays every move on those rules, so it ends exactly where it was recorded.
  const was = MODS.pokermon.contentRev;
  MODS.pokermon.contentRev = PRIMAL_REV - 1;
  let rec, live;
  const snap = () => [G.jokers.cards.map(key).join(','), G.consumeables.cards.map(key).join(','), (G.shop_jokers ? G.shop_jokers.cards.map(key) : []).join(','), G.GAME.dollars, String(G.GAME.chips), JSON.stringify(G.GAME.poke_primal)];
  try {
    const s = new Session();
    s.start({ seed: 'PRMOLD', customDeck: { name: 'Old', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 6, blind_scaling: 0.05 },
      jokers: [{ key: 'j_poke_kyogre' }, { key: 'j_poke_groudon' }], consumables: [] } });
    flush();
    ok(s.recipe.modVersions.pokermon === OLD.pokermon, 'recorded on ' + OLD.pokermon, s.recipe.modVersions);
    const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
    for (let rounds = 0; rounds < 3 && G.STATE !== STATES.GAME_OVER;) {
      if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
      must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
      must({ type: 'play' });
      if (G.STATE === STATES.ROUND_EVAL) {
        must({ type: 'cash_out' });
        for (let k = 0; k < 2; k++) { G.GAME.dollars = Math.max(G.GAME.dollars, 0); const r = s.act({ type: 'reroll' }); flush(); if (!r.ok) break; }
        must({ type: 'next_round' }); rounds++;
      }
    }
    rec = JSON.parse(JSON.stringify(s.recipe));
    live = snap();
  } finally { MODS.pokermon.contentRev = was; }
  const r = Session.fromRecipe(rec); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed on the current code: every move re-plays on its recorded rules and ends where it was recorded (no Orb dealt)', [r.stoppedAt, snap(), live]);
  ok(!G.consumeables.cards.some((c) => ORBS[key(c)]) && !(G.shop_jokers && G.shop_jokers.cards.some((c) => ORBS[key(c)])), 'no Orb anywhere in the old run');
});

// ------------------------------------------------------------------- the art
if (ART) {
  sec('art', () => {
    const p = path.join(ART, 'primal_orbs.png');
    ok(fs.existsSync(p), 'the composed Orb cards are on disk (assets/2x/primal_orbs.png)', p);
    if (fs.existsSync(p)) { const b = fs.readFileSync(p); ok(b.readUInt32BE(16) === 284 && b.readUInt32BE(20) === 190, 'two Item cards, 142 x 190 each', [b.readUInt32BE(16), b.readUInt32BE(20)]); }
    ok(MODS.pokermon.content.atlases.poke_primal_orbs && /primal_orbs\.png$/.test(MODS.pokermon.content.atlases.poke_primal_orbs.src), 'registered atlas');
    const g3 = path.join(ART, 'Basic Series', 'AtlasJokersBasicGen03-391.png');
    ok(fs.existsSync(g3), 'the Primals draw from the vendored 3.9.1 Gen 3 sheet');
  });
} else console.log('(Pokermon art not on disk: the art checks are skipped; set MICATRO_MAIN)');

done();
