// BETMMA — 5_legendary_challenges.lua: the run-time rules of its challenges (the data is CHALLENGES in
// index.js). Played by engine/challenge.js, active only in a challenge run.
//   * faster_scaling (Gotta Go Fast): a get_blind_amount wrap with its own, much steeper table.
//   * all_bosses_have_flint_ability (Overpowered Boss): a Blind:modify_hand wrap — every non-Small/Big
//     blind halves base Chips and Mult like The Flint (The Flint itself: a quarter).
import * as B from '../../js/engine/bignum.js';
import { G } from '../../js/engine/core.js';

/** get_blind_amount with faster_scaling (k 0.75; past ante 8 the vanilla formula on 500,000,000). */
function faster_amount(ante) {
  const k = 0.75;
  const amounts = [300, 1500, 8000, 50000, 300000, 2000000, 35000000, 500000000];
  if (ante < 1) return 100;
  if (ante <= 8) return amounts[ante - 1];
  const a = amounts[7], b = 1.6, c = ante - 8, d = 1 + 0.2 * (ante - 8);
  let amount = Math.floor(a * Math.pow(b + Math.pow(k * c, d), c));
  if (isFinite(amount)) return amount - amount % Math.pow(10, Math.floor(Math.log10(amount) - 1));
  const big = B.floor(B.mul(a, B.pow(B.add(b, B.pow(k * c, d)), c)));
  return B.isBig(big) ? new B.Decimal(Math.floor(big.m * 10) / 10, big.e) : big;
}

export const CHALLENGE_HOOKS = {
  blind_amount(amount, ante) { return G.GAME.modifiers.faster_scaling === true ? faster_amount(ante) : undefined; },
  blind_modify_hand(blind, cards, poker_hands, text, mult, hand_chips) {
    if (G.GAME.modifiers.all_bosses_have_flint_ability !== true || blind.name === 'Small Blind' || blind.name === 'Big Blind' || blind.disabled) return undefined;
    blind.triggered = true;
    if (blind.name === 'The Flint') return [Math.max(Math.floor(mult * 0.25 + 0.75), 1), Math.max(Math.floor(hand_chips * 0.25 + 0.75), 0), true];
    return [Math.max(Math.floor(mult * 0.5 + 0.5), 1), Math.max(Math.floor(hand_chips * 0.5 + 0.5), 0), true];
  },
};
