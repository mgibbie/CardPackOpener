// Pokermon pokejokers_25 (Grubbin line, Rockruff + 3 Lycanroc): all 7 jokers fired through real
// plays (act), plus every evolution.   node micatro/tests/mods/pokejokers_25_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const close = (a, b) => Math.abs(a - b) < 1e-9;
const NAMES = ['grubbin', 'charjabug', 'vikavolt', 'rockruff', 'lycanroc_day', 'lycanroc_night', 'lycanroc_dusk'];
ok(NAMES.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 7 pokejokers_25 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_25.lua'] || []).length === 7, 'defs: 7 from pokejokers_25.lua');
const rounds = (n) => { for (let i = 0; i < n; i++) { winRound(); if (i < n - 1) nextRound(); } };

// ------------------------------------------------------------- Grubbin line
{
  start('GRUBBIN');
  const j = add('j_poke_grubbin');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 4, 'grubbin: +3 Mult', r.total);
  const p = add('j_poke_pikachu');
  r = play(hand(['S_A']));
  ok(r.total.mult === 10, 'grubbin: X3 (+9) with a Lightning joker', r.total);
  p.remove();
  rounds(3);
  ok(key(j) === 'j_poke_grubbin', 'grubbin: not yet after 3 rounds' + ' (Pokermon 3.9.1 data)', key(j));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_charjabug', 'grubbin -> charjabug after 4 rounds' + ' (Pokermon 3.9.1 data)', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 7, 'charjabug: +7 per Lightning joker (itself)' + ' (Pokermon 3.9.1 data)', r.total);
  const p2 = add('j_poke_pikachu');
  G.GAME.dollars = 0; // (Pikachu, Pokermon 3.9.1: +10 Mult at $25 or more — kept off: it stands in for any Lightning joker here)
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 14, 'charjabug: two Lightning jokers -> +14', r.total);
  p2.remove();
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_vikavolt', 'charjabug -> vikavolt with a Thunder Stone', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 12, 'vikavolt: +12 Mult, X1 alone', r.total);
  add('j_poke_pikachu'); add('j_poke_pikachu');
  G.GAME.dollars = 0;
  r = play(hand(['S_A']));
  ok(close(r.total.mult, 13 * 2.5), 'vikavolt: X(1 + 0.75 per other Lightning joker)', r.total);
}

// ------------------------------------------------------------- Rockruff + Lycanroc
function rockruffTo(seed, even, odd) {
  start(seed);
  const j = add('j_poke_rockruff');
  j.ability.extra.even_to_score = even; j.ability.extra.odd_to_score = odd;
  winRound();
  return j;
}
{
  start('ROCKRUFF');
  const j = add('j_poke_rockruff');
  // 2,2,3: 3 non-face scoring (pair of 2s scores 2 cards) -> pair 2s: +2 each
  let r = play(hand(['S_2', 'H_2', 'D_3']));
  ok(r.total.mult === 2 + 4 && j.ability.extra.even_to_score === 18 && j.ability.extra.odd_to_score === 20, 'rockruff: +2 Mult per scored non-face card, counts evens', [r.total, j.ability.extra]);
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2, 'rockruff: face cards give nothing', r.total);
  r = play(hand(['S_A']));
  ok(r.total.mult === 3 && j.ability.extra.odd_to_score === 19, 'rockruff: Aces are odd', [r.total, j.ability.extra]);
  ok(key(rockruffTo('RR1', 0, 5)) === 'j_poke_lycanroc_day', 'rockruff -> Lycanroc Midday after 20 evens');
  ok(key(rockruffTo('RR2', 5, 0)) === 'j_poke_lycanroc_night', 'rockruff -> Lycanroc Midnight after 20 odds');
  ok(key(rockruffTo('RR3', 0, 0)) === 'j_poke_lycanroc_dusk', 'rockruff -> Lycanroc Dusk after both');
}
{
  start('LYCDAY');
  add('j_poke_lycanroc_day');
  const h0 = G.GAME.current_round.hands_left;
  let r = play(hand(['S_4']));
  // 5 + 4 + 40 chips, 1 + 4 mult; +1 hand
  ok(r.total.chips === 49 && r.total.mult === 5 && G.GAME.current_round.hands_left === h0, 'lycanroc day: lone first-hand even card: +40 chips, +4 Mult, +1 hand', [r.total, G.GAME.current_round.hands_left, h0]);
  r = play(hand(['S_6', 'H_6']));
  ok(r.total.mult === 2 + 8 && r.total.chips === 22, 'lycanroc day: later, +4 Mult per even card', r.total);
  winRound(); nextRound();
  const h1 = G.GAME.current_round.hands_left;
  r = play(hand(['S_5']));
  ok(r.total.chips === 50 && r.total.mult === 1 && G.GAME.current_round.hands_left === h1, 'lycanroc day: lone odd card: +40 chips, +1 hand', [r.total, G.GAME.current_round.hands_left, h1]);
}
{
  start('LYCNIGHT');
  add('j_poke_lycanroc_night');
  let r = play(hand(['S_3', 'H_3']));
  ok(r.total.mult === 2 + 10, 'lycanroc night: +5 Mult per odd card', r.total);
  r = play(hand(['S_4']));
  ok(r.total.mult === 1, 'lycanroc night: evens give nothing', r.total);
  winRound(); nextRound(); winRound();
  const hs = G.hand.config.card_limit;
  nextRound();
  ok(G.GAME.blind.boss, 'boss blind');
  ok(G.GAME.current_round.hands_left === G.GAME.round_resets.hands + 1 && G.GAME.current_round.discards_left === G.GAME.round_resets.discards + 1 && G.hand.config.card_limit === hs + 1,
    'lycanroc night: +1 hand, discard and hand size on boss blinds', [G.GAME.current_round.hands_left, G.GAME.current_round.discards_left, G.hand.config.card_limit]);
  winRound(); nextRound();
  ok(G.hand.config.card_limit === hs, 'lycanroc night: the hand size was for that round only', G.hand.config.card_limit);
}
{
  start('LYCDUSK');
  add('j_poke_lycanroc_dusk');
  // 2,2,3,3 two pair: 20 + 2+2+3+3 = 30 chips; first 2 and first 3 retriggered (+5 chips, +8 Mult)
  let r = play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  ok(r.total.chips === 30 + 5 && r.total.mult === 2 + 4 * 6, 'lycanroc dusk: +4 per non-face card, first even and first odd retriggered', r.total);
  r = play(hand(['D_2', 'C_2', 'D_3', 'C_3']));
  ok(r.total.chips === 30 && r.total.mult === 2 + 16, 'lycanroc dusk: retriggers once per round', r.total);
  winRound(); nextRound();
  r = play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  ok(r.total.chips === 35, 'lycanroc dusk: again next round', r.total);
}

done();
