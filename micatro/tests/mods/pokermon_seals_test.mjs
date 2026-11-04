// Pokermon's seals (seals/seals1.lua), FIRED end to end through real play (tester Jack, jfost711: "the Pink Seal and Silver
// Seal don't work"). What each one does (3.9.1 + upstream main's Silver refactor, InertSteak/Pokermon af0b656 7ba51bb):
//   - Pink Seal: scored in the round's FIRST hand, with room: an Energy matching one of your jokers' types (else a random one);
//     every retrigger of the card scores it again (one more Energy each, while there is room)
//   - Silver Seal: held in hand while a hand scores: "+1 Item" and an Item if there is room, then the card is discarded through
//     the discard pipeline (pokermon.discard_cards on main: pre_discard, each joker's discard context WITH its effect applied,
//     counted as discarded) — a held-card retrigger (Mime) does not discard it twice
//   - DNA Seal (Deoxys's): a played hand of exactly 1 card makes a Sealless copy of it in hand
// How a player gets them: Obituary / Revenant (Spectral), the Obituary / Revenant decks and sleeves, AND (Steamodded) every
// base-game seal roll — a Standard Pack card's seal (lovely/seal.toml: SMODS.poll_seal({mod = 10})) and Certificate's card
// (better_calc.toml: SMODS.poll_seal({type_key = 'certsl', guaranteed = true})) — which draws from the whole Seal pool.
// What was broken (before this suite): Standard Packs and Certificate only ever rolled the 4 vanilla seals (Pink / Silver could
// never come up there), the Silver Seal's discard ignored the discard jokers' effects (Jolteon's / Wingull's $ never paid) and
// said nothing ("+1 Item"). Vanilla / non-Pokermon seal rolls must stay as they were (same RNG).
//   node micatro/tests/mods/pokermon_seals_test.mjs
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { Card, P_SEALS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import '../../mods/morefluff/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 500)); } };
const msgs = (r) => r.events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
const empty_consumables = () => { for (const c of G.consumeables.cards.slice()) c.remove(); G.consumeables.cards.length = 0; G.GAME.consumeable_buffer = 0; };
const set_of = (k) => P_CENTERS[k] && P_CENTERS[k].set;

ok(MODS.pokermon.contentRev >= 16 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 16 (the seals fix: pin 3.9.1+r16)', PINS.modPin('pokermon'));
ok(P_SEALS.poke_pink_seal && P_SEALS.poke_silver && P_SEALS.poke_dna_seal && P_SEALS.poke_pink_seal.mod && P_SEALS.poke_silver.calculate, 'the three Pokermon seals are registered with their behaviour');

// ------------------------------------------------------------------- Pink Seal
sec('pink seal', () => {
  start('SEAL_PINK');
  add('j_poke_charmander');
  empty_consumables();
  const [pc, x] = hand(['S_A', 'H_3']);
  pc.set_seal('poke_pink_seal', true);
  const r = play([pc]); flush();
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_fire_energy', 'Pink Seal scored in the first hand: an Energy of the owned joker\'s type (Charmander -> Fire)', G.consumeables.cards.map(key));
  ok(msgs(r).includes('+1 Energy'), '... with its "+1 Energy"', msgs(r));
  // the second hand of the round: nothing
  clearHand();
  const [pc2] = hand(['S_K']); pc2.set_seal('poke_pink_seal', true);
  play([pc2]); flush();
  ok(G.consumeables.cards.length === 1, 'not in the second hand of the round', G.consumeables.cards.map(key));

  // no room: nothing
  start('SEAL_PINK2');
  add('j_poke_squirtle');
  empty_consumables();
  for (let i = 0; i < G.consumeables.config.card_limit; i++) add('c_poke_grass_energy');
  const full = G.consumeables.cards.length;
  const [pc3] = hand(['S_Q']); pc3.set_seal('poke_pink_seal', true);
  const r3 = play([pc3]); flush();
  ok(G.consumeables.cards.length === full && !msgs(r3).includes('+1 Energy'), 'no room: no Energy, no message', G.consumeables.cards.map(key));

  // a retrigger (Hanging Chad: the first scoring card twice more) scores it again: one Energy per trigger while there is room
  start('SEAL_PINK3');
  add('j_poke_bulbasaur'); add('j_hanging_chad');
  empty_consumables();
  G.consumeables.config.card_limit = 5;
  const [pc4] = hand(['D_9']); pc4.set_seal('poke_pink_seal', true);
  play([pc4]); flush();
  ok(G.consumeables.cards.length === 3 && G.consumeables.cards.every((c) => key(c) === 'c_poke_grass_energy'), 'Hanging Chad retriggers it: 3 Grass Energies (1 + 2 retriggers)', G.consumeables.cards.map(key));

  // no typed joker: a random Energy
  start('SEAL_PINK4');
  empty_consumables();
  const [pc5] = hand(['C_5']); pc5.set_seal('poke_pink_seal', true);
  play([pc5]); flush();
  ok(G.consumeables.cards.length === 1 && set_of(key(G.consumeables.cards[0])) === 'Energy', 'no typed joker: a random Energy', G.consumeables.cards.map(key));
});

// ------------------------------------------------------------------- Silver Seal
sec('silver seal', () => {
  start('SEAL_SILVER');
  empty_consumables();
  const [a, s, b] = hand(['S_A', 'H_K', 'C_4']);
  s.set_seal('poke_silver', true);
  const d0 = G.GAME.round_scores.cards_discarded.amt;
  const r = play([a]); flush();
  ok(G.consumeables.cards.length === 1 && set_of(key(G.consumeables.cards[0])) === 'Item', 'Silver Seal held while a hand scores: an Item', G.consumeables.cards.map(key));
  ok(G.discard.cards.includes(s) && !G.hand.cards.includes(s) && s.ability.discarded, '... and the card is discarded', [s.area === G.hand, s.area === G.discard]);
  ok(G.GAME.round_scores.cards_discarded.amt === d0 + 1, '... counted as a discarded card', G.GAME.round_scores.cards_discarded.amt - d0);
  ok(G.hand.cards.includes(b) && !G.hand.highlighted.length, 'the other held card stays, nothing left highlighted', G.hand.highlighted.length);
  ok(msgs(r).includes('+1 Item'), 'it says "+1 Item" (upstream main\'s Silver refactor)', msgs(r));

  // full slots: still discarded, no Item, no message
  start('SEAL_SILVER2');
  empty_consumables();
  for (let i = 0; i < G.consumeables.config.card_limit; i++) add('c_poke_fire_energy');
  const [a2, s2] = hand(['S_2', 'H_9']);
  s2.set_seal('poke_silver', true);
  const r2 = play([a2]); flush();
  ok(G.consumeables.cards.every((c) => key(c) === 'c_poke_fire_energy') && G.discard.cards.includes(s2) && !msgs(r2).includes('+1 Item'), 'no room: no Item (and no "+1 Item"), still discarded', msgs(r2));

  // the discard jokers' effects land: Jolteon pays for a discarded Gold card
  start('SEAL_SILVER3');
  empty_consumables();
  const jolt = add('j_poke_jolteon');
  const [a3, g] = hand(['S_A', 'H_K']);
  g.set_ability(P_CENTERS.m_gold);
  g.set_seal('poke_silver', true);
  const $0 = G.GAME.dollars;
  play([a3]); flush();
  ok(G.discard.cards.includes(g) && G.GAME.dollars === $0 + jolt.ability.extra.money, 'a Silver-discarded Gold card pays Jolteon\'s $ (the discard pipeline applies the joker\'s effect)', [G.GAME.dollars - $0, jolt.ability.extra.money]);

  // Mime retriggers held cards: the Silver Seal still only fires once (one Item, one discard)
  start('SEAL_SILVER4');
  empty_consumables();
  G.consumeables.config.card_limit = 5;
  add('j_mime');
  const [a4, s4] = hand(['S_A', 'D_7']);
  s4.set_seal('poke_silver', true);
  const d4 = G.GAME.round_scores.cards_discarded.amt;
  play([a4]); flush();
  ok(G.consumeables.cards.length === 1 && G.GAME.round_scores.cards_discarded.amt === d4 + 1, 'Mime (held retrigger): one Item, one discard', [G.consumeables.cards.length, G.GAME.round_scores.cards_discarded.amt - d4]);

  // two Silver Seals held: both fire; the hand refills
  start('SEAL_SILVER5', {}, { noBlind: true });
  act({ type: 'select_blind' }); flush();
  empty_consumables();
  G.GAME.blind.chips = 1e15;
  const [h1, h2, h3] = G.hand.cards;
  h2.set_seal('poke_silver', true); h3.set_seal('poke_silver', true);
  act({ type: 'highlight', ids: [h1.sort_id] });
  const r5 = act({ type: 'play' });
  ok(r5.ok && G.consumeables.cards.length === 2 && G.discard.cards.includes(h2) && G.discard.cards.includes(h3), 'two held Silver Seals: 2 Items, both discarded', G.consumeables.cards.map(key));
  ok(G.hand.cards.length === G.hand.config.card_limit, 'the hand refills to its size after the Silver discards', G.hand.cards.length);
  // next round: they fire again (ability.discarded resets)
  G.GAME.chips = G.GAME.blind.chips; G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' });
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  ok(!h2.ability.discarded && !h3.ability.discarded, 'a new round clears the Silver cards\' discarded flag');
});

// ------------------------------------------------------------------- the seal spectrals (Obituary / Revenant)
sec('obituary / revenant', () => {
  for (const [sp, seal] of [['c_poke_obituary', 'poke_pink_seal'], ['c_poke_revenant', 'poke_silver']]) {
    start('SEAL_SPEC_' + seal);
    empty_consumables();
    const c = add(sp);
    const [t] = hand(['H_A']);
    const r = act({ type: 'use', id: c.sort_id, targets: [t.sort_id] });
    ok(r.ok && t.seal === seal, `${sp} on 1 hand card gives it the ${seal}`, [r.error, t.seal]);
  }
});

// ------------------------------------------------------------------- DNA Seal (the other Pokermon seal)
sec('dna seal', () => {
  start('SEAL_DNA');
  const [d] = hand(['S_7']);
  d.set_seal('poke_dna_seal', true);
  const n = G.playing_cards.length;
  const r = play([d]); flush();
  const copy = G.playing_cards.find((c) => c !== d && c.base.value === '7' && c.base.suit === 'Spades' && !c.seal && G.hand.cards.includes(c));
  ok(G.playing_cards.length === n + 1 && copy && msgs(r).includes('Copied!'), 'DNA Seal: a 1-card hand makes a Sealless copy in hand', [G.playing_cards.length - n, msgs(r)]);
});

// ------------------------------------------------------------------- how they come up: Standard Packs + Certificate
/** Open `n` Standard (Jumbo) Packs in a fresh run; -> {seal: count}. */
function standard_seals(run, n) {
  newRun(run);
  const cnt = {};
  for (let i = 0; i < n; i++) {
    G.STATE = STATES.SHOP;
    const b = new Card(undefined, P_CENTERS.p_standard_jumbo_1, {});
    b.cost = 0; G.shop_booster.emplace(b);
    const r = act({ type: 'buy', id: b.sort_id });
    if (!r.ok) { cnt.error = r.error; break; }
    for (const c of G.pack_cards.cards) cnt[c.seal || '-'] = (cnt[c.seal || '-'] || 0) + 1;
    act({ type: 'skip_booster' });
    G.GAME.round_resets.ante = 1 + (i % 8);
  }
  return cnt;
}
/** Certificate's first_hand_drawn card, `n` times; -> {seal: count}. */
function certificate_seals(run, n) {
  newRun(run);
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' });
  const cert = add('j_certificate');
  const cnt = {};
  for (let i = 0; i < n; i++) {
    const before = new Set(G.hand.cards);
    cert.calculate_joker({ first_hand_drawn: true }); flush();
    for (const c of G.hand.cards) if (!before.has(c)) { cnt[c.seal || '-'] = (cnt[c.seal || '-'] || 0) + 1; G.hand.remove_card(c); c.remove(); }
  }
  return cnt;
}
const POKE = (seed) => ({ seed, back: 'b_red', mods: ['pokermon'], modOptions: { pokermon: {} } });
sec('standard packs', () => {
  const cnt = standard_seals(POKE('SEAL_STD'), 300);
  ok(!cnt.error, 'Standard Packs open', cnt.error);
  ok(cnt.poke_pink_seal > 0 && cnt.poke_silver > 0, 'Pokermon on: Standard Pack cards can carry the Pink and Silver Seals (SMODS.poll_seal over the Seal pool)', cnt);
  ok(!cnt.poke_dna_seal, '... never the DNA Seal (in_pool false)', cnt);
  const sealed = Object.entries(cnt).filter(([k]) => k !== '-').reduce((s, [, v]) => s + v, 0), all = sealed + (cnt['-'] || 0);
  ok(sealed / all > 0.15 && sealed / all < 0.25, 'the seal rate stays ~20% (2% base x mod 10)', sealed / all);
  for (const s of ['Red', 'Blue', 'Gold', 'Purple']) ok(cnt[s] > 0, `... the vanilla ${s} Seal still comes up`, cnt);
  // vanilla and a non-Pokermon object_weights mod (MoreFluff, no seals of its own): the vanilla roll, the same cards as before
  const van = standard_seals({ seed: 'SEAL_STD', back: 'b_red' }, 60);
  ok(JSON.stringify(van) === JSON.stringify({ '-': 254, Blue: 17, Red: 13, Gold: 10, Purple: 6 }), 'no mods: Standard Pack seals unchanged (vanilla roll, same RNG)', van);
  const mf = standard_seals({ seed: 'SEAL_STD', back: 'b_red', mods: ['morefluff'] }, 60);
  ok(Object.keys(mf).every((k) => ['-', 'Red', 'Blue', 'Gold', 'Purple'].includes(k)) && JSON.stringify(mf) === JSON.stringify(van), 'MoreFluff alone (object_weights, no mod seals): unchanged too', mf);
});
sec('certificate', () => {
  const cnt = certificate_seals(POKE('SEAL_CERT'), 120);
  ok(cnt.poke_pink_seal > 0 && cnt.poke_silver > 0 && !cnt['-'], 'Pokermon on: Certificate\'s card can carry the Pink or Silver Seal (always sealed)', cnt);
  ok(!cnt.poke_dna_seal, '... never the DNA Seal', cnt);
  const van = certificate_seals({ seed: 'SEAL_CERT', back: 'b_red' }, 40);
  ok(Object.keys(van).every((k) => ['Red', 'Blue', 'Gold', 'Purple'].includes(k)), 'no mods: Certificate rolls only the 4 vanilla seals', van);
});

done();
