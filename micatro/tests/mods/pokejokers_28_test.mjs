// Pokermon pokejokers_28 (Nickit -> Boltund): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_28_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['nickit', 'thievul', 'yamper', 'boltund'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 4 pokejokers_28 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_28.lua'].length === 4, 'defs: 4 from pokejokers_28.lua');

const STRAIGHT = ['S_2', 'H_3', 'D_4', 'C_5', 'S_6']; // 30 + 20 chips, mult 4

// ---------------------------------------------------------------- Nickit -> Thievul
{
  start('NICKIT');
  const j = add('j_poke_nickit');
  ok(j.calculate_dollar_bonus() === 3, 'nickit: $3 at end of round', j.calculate_dollar_bonus());
  const d0 = G.GAME.dollars;
  winRound();
  ok(G.GAME.round_eval && JSON.stringify(G.GAME.round_eval).includes('3'), 'nickit: cash-out row');
  ok(j.ability.extra.rounds === 4 && key(j) === 'j_poke_nickit', 'nickit: level countdown 5 -> 4', j.ability.extra.rounds);
  nextRound();
  ok(G.GAME.dollars >= d0 + 3, 'nickit paid at cash out');
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_thievul', 'nickit evolves into thievul', key(j));
  // Thievul alone: nothing (it is the leftmost joker).
  ok(j.calculate_dollar_bonus() === undefined, 'thievul: leftmost itself -> no payout');
}
{
  start('THIEVUL');
  const y = add('j_poke_yamper');
  const t = add('j_poke_thievul');
  // Yamper costs $5 -> sells for $2: double = $4 (max $15).
  ok(y.sell_cost === 2 && t.calculate_dollar_bonus() === 4, 'thievul: double the leftmost sell value', [y.sell_cost, t.calculate_dollar_bonus()]);
  y.ability.extra_value = 10; y.set_cost();
  ok(t.calculate_dollar_bonus() === 15, 'thievul: capped at $15', t.calculate_dollar_bonus());
  ok(P_CENTERS.j_poke_thievul.loc_vars(P_CENTERS.j_poke_thievul, [], t).vars[0] === 15, 'thievul loc_vars');
}

// ---------------------------------------------------------------- Yamper -> Boltund
{
  start('YAMPER');
  const j = add('j_poke_yamper');
  const d0 = G.GAME.dollars;
  const r = play(hand(STRAIGHT));
  ok(r.total.chips === 50 && r.total.mult === 7, 'yamper: +3 Mult on a Straight', r.total);
  ok(G.GAME.dollars === d0 + 3, 'yamper: $3 on a Straight', G.GAME.dollars - d0);
  ok(statusMsgs(r.events).includes('+3 Mult'), 'yamper popup');
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 1 && G.GAME.dollars === d0 + 3, 'yamper: nothing without a Straight', r2.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_boltund', 'yamper evolves into boltund', key(j));
  nextRound();
  const d1 = G.GAME.dollars;
  const r3 = play(hand(STRAIGHT));
  ok(r3.total.mult === 8 && G.GAME.dollars === d1 + 4, 'boltund: X2 Mult and $4 on a Straight', [r3.total, G.GAME.dollars - d1]);
  const r4 = play(hand(['S_A', 'H_A']));
  ok(r4.total.mult === 2, 'boltund: nothing without a Straight', r4.total);
}

done();
