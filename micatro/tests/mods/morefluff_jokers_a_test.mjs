// More Fluff jokers, part A (micatro/mods/morefluff/jokers_a.js): every joker fired through real act()
// plays with the mod's numbers, every describe() filled, and the Expansion Pack vanilla-ban fix.
//   node micatro/tests/mods/morefluff_jokers_a_test.mjs
import {
  ok, near, done, flush, start, clearHand, hand, add, clearJokers, clearConsumables, play, winRound, nextRound, toShop,
  msgs, tot, filled, G, P_CENTERS, act, STATES,
} from './morefluff_helpers.mjs';
import { P_CENTER_POOLS, get_current_pool, create_card } from '../../js/engine/core.js';
import { check_for_buy_space } from '../../js/engine/run.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { modded_begin, modded_end } from '../../mods/morefluff/util.js';
import { centers } from '../../mods/morefluff/jokers_a.js';

const KEYS = 'basepaul_card blahaj clownfish expansion_pack hollow jackofalltrades jester lollipop luckycharm mspaint philosophical simplified spiral treasuremap unregisteredhypercam dropkick bladedance hyperbeam blasphemy dramaticentrance badlegaldefence blunder brilliant broomcloset rot_cartomancer clipart coupon_catalogue css'.split(' ').map((k) => 'j_mf_' + k);

// ------------------------------------------------------------------ off
start('MFAOFF', { mods: [] });
ok(!KEYS.some((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'off: no part-A joker in the pool');

// ------------------------------------------------------------------ registration
start('MFAON');
ok(centers.length === 28 && KEYS.every((k) => centers.some((c) => c.key === k)), '28 jokers in part A', centers.length);
ok(KEYS.every((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'on: all in the joker pool');
ok(P_CENTERS.j_mf_jester.cost === 2 && P_CENTERS.j_mf_blahaj.cost === 1 && P_CENTERS.j_mf_hyperbeam.rarity === 2 && P_CENTERS.j_mf_basepaul_card.pos.x === 1
  && P_CENTERS.j_mf_rot_cartomancer.atlas === 'mf_rot_cartomancer' && P_CENTERS.j_mf_lollipop.eternal_compat === false, 'data: costs / rarity / atlas / compat');
for (const k of KEYS) {
  const c = add(k);
  ok(filled(describe(c)), 'describe filled: ' + k, describe(c));
  ok(filled(describeCenter(k)), 'describeCenter filled: ' + k, describeCenter(k));
  c.remove();
}
flush();

// ------------------------------------------------------------------ jokers
const hc = (k = 'S_2') => play(hand([k]));
{ // Basepaul Card: X1.25 (no Balatro profile name -> never "Paul")
  start('MFA1'); add('j_mf_basepaul_card');
  const r = hc(); ok(r.total.chips === 7 && near(r.total.mult, 1.25) && r.total.total === 8, 'Basepaul X1.25', tot(r));
}
{ // Blahaj swaps chips and mult
  start('MFA2'); add('j_mf_blahaj');
  const r = hc('S_A'); ok(r.total.chips === 1 && r.total.mult === 16 && r.total.total === 16, 'Blahaj swap', tot(r));
  ok(msgs(r.events).includes('Swap!'), 'Blahaj "Swap!"', msgs(r.events));
}
{ // Clownfish: enhanced cards +15 chips +4 mult
  start('MFA3'); add('j_mf_clownfish');
  let r = play(hand(['S_2'], 'm_bonus')); ok(r.total.chips === 5 + 2 + 30 + 15 && r.total.mult === 5, 'Clownfish on Bonus card', tot(r));
  r = hc(); ok(r.total.chips === 7 && r.total.mult === 1, 'Clownfish ignores base cards', tot(r));
}
{ // Expansion Pack: a modded joker when a blind is selected (must have room)
  start('MFA4', { noBlind: true }); add('j_mf_expansion_pack');
  act({ type: 'select_blind' });
  ok(G.jokers.cards.length === 2 && G.jokers.cards[1].config.center.mod === 'morefluff', 'Expansion Pack made a modded joker', G.jokers.cards.map((c) => c.config.center.key));
  ok(!G.GAME.mf_modded_only && G.GAME.joker_buffer === 0, 'ban lifted, buffer reset');
  // fix: every base-game joker is left out (the Lua's list misses Jolly Joker)
  modded_begin();
  const [pool] = get_current_pool('Joker', 0, null, 'exp');
  ok(!pool.includes('j_jolly') && pool.filter((k) => k !== 'UNAVAILABLE').every((k) => P_CENTERS[k].mod), 'FIX: no base joker (not even Jolly Joker) while banned');
  modded_end();
  const [pool2] = get_current_pool('Joker', 0, null, 'exp');
  ok(pool2.includes('j_jolly'), 'unbanned afterwards');
  // full slots: nothing
  G.jokers.config.card_limit = 2; clearHand(); nextRound();
  ok(G.jokers.cards.length === 2, 'Expansion Pack needs room');
}
{ // Hollow Joker: -1 hand size, +10 mult per hand size below 9
  start('MFA5'); add('j_mf_hollow');
  ok(G.hand.config.card_limit === 7, 'Hollow -1 hand size', G.hand.config.card_limit);
  const r = hc(); ok(r.total.mult === 1 + 20, 'Hollow +20 mult at 7', tot(r));
}
{ // Jack of all Trades: held Jacks +2 mult +10 chips +$1
  start('MFA6'); add('j_mf_jackofalltrades');
  hand(['H_J']); const d0 = G.GAME.dollars;
  const r = play([hand(['S_2'])[0]]);
  ok(r.total.chips === 17 && r.total.mult === 3 && G.GAME.dollars === d0 + 1, 'Jack of all Trades held Jack', [tot(r), G.GAME.dollars - d0]);
}
{ // Jester +40 chips
  start('MFA7'); add('j_mf_jester');
  const r = hc(); ok(r.total.chips === 47, 'Jester +40 chips', tot(r));
}
{ // Lollipop: X1.75, -X0.15 per round, eaten at <= 1.01
  start('MFA8'); const j = add('j_mf_lollipop');
  const r = hc(); ok(near(r.total.mult, 1.75), 'Lollipop X1.75', tot(r));
  const rr = (nextRound(), G.jokers.cards.includes(j)); ok(rr && near(j.ability.extra.xmult, 1.6), 'Lollipop -0.15 per round (1.9.9999: ability.extra.xmult)', j.ability.extra);
  j.ability.extra.xmult = 1.15; nextRound(); ok(!G.jokers.cards.includes(j), 'Lollipop eaten');
}
{ // Lucky Charm: 1 in 3 +20 mult, 1 in 8 $20 at end of round
  start('MFA9'); add('j_mf_luckycharm'); G.GAME.probabilities.normal = 1000;
  const r = hc(); ok(r.total.mult === 21, 'Lucky Charm +20 mult', tot(r));
  const d0 = G.GAME.dollars; winRound(); flush();
  ok(G.GAME.dollars >= d0 + 20, 'Lucky Charm $20 at end of round', G.GAME.dollars - d0);
  start('MFA9b'); add('j_mf_luckycharm'); G.GAME.probabilities.normal = 0;
  ok(hc().total.mult === 1, 'Lucky Charm misses');
}
{ // MS Paint Joker (1.9.9999): +3 hand size from blind select until the first hand is played
  start('MFA10', { noBlind: true }); add('j_mf_mspaint');
  act({ type: 'select_blind' });
  ok(G.hand.config.card_limit === 11 && G.hand.cards.length === 11, 'MS Paint +3 hand size, 11 drawn', [G.hand.config.card_limit, G.hand.cards.length]);
  G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' });
  ok(G.hand.config.card_limit === 8 && G.hand.cards.length === 10, 'MS Paint back to 8 after the hand (the 10 held stay)', [G.hand.config.card_limit, G.hand.cards.length]);
}
{ // Philosophical Joker: +1 joker slot; always fits
  start('MFA11'); const lim = G.jokers.config.card_limit; const j = add('j_mf_philosophical');
  ok(G.jokers.config.card_limit === lim + 1, 'Philosophical +1 slot');
  j.remove(); flush(); ok(G.jokers.config.card_limit === lim, 'slot given back');
  while (G.jokers.cards.length < G.jokers.config.card_limit) add('j_joker');
  const shopcard = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mf_philosophical');
  const other = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mf_jester');
  ok(check_for_buy_space(shopcard) === true && check_for_buy_space(other) === false, 'Philosophical buyable with full slots (buy_space)');
}
{ // Simplified Joker: every Common joker +4 mult (itself included)
  start('MFA12'); add('j_mf_simplified'); add('j_mf_jester'); add('j_mf_hyperbeam');
  const r = hc(); ok(r.total.mult === (1 + 8) * 3 && r.total.chips === 47, 'Simplified: 2 commons x +4', tot(r));
}
{ // Spiral Joker: 10 + floor(7 cos(pi/8 * $) + 0.5)
  start('MFA13'); add('j_mf_spiral');
  G.GAME.dollars = 0; ok(hc().total.mult === 18, 'Spiral at $0: +17');
  G.GAME.dollars = 8; ok(hc().total.mult === 4, 'Spiral at $8: +3');
  G.GAME.dollars = 4; ok(hc().total.mult === 11, 'Spiral at $4: +10');
}
{ // Treasure Map: after 2 rounds, sell for $13
  start('MFA14'); const j = add('j_mf_treasuremap');
  nextRound(); ok(j.ability.extra.c_rounds === 1, 'Treasure Map 1/2');
  let d0 = G.GAME.dollars; act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.dollars === d0 + j.sell_cost, 'not yet: sell price only', G.GAME.dollars - d0);
  const j2 = add('j_mf_treasuremap'); j2.ability.extra.c_rounds = 2;
  d0 = G.GAME.dollars; act({ type: 'sell', id: j2.sort_id });
  ok(G.GAME.dollars === d0 + 13 + j2.sell_cost, 'sold after 2 rounds: +$13', G.GAME.dollars - d0);
}
{ // Unregistered Hypercam 2: mult -> mult^(mult^0.04) before cards score
  start('MFA15'); add('j_mf_unregisteredhypercam');
  const r = play(hand(['S_A', 'H_A']));
  const m = Math.pow(2, Math.pow(2, 0.04));
  ok(r.total.chips === 32 && near(r.total.mult, m) && r.total.total === Math.floor(32 * m), 'Hypercam ^^1.04 on the base mult', tot(r));
  ok(msgs(r.events).includes('^^1.04 Mult'), 'Hypercam message');
  G.jokers.cards[0].set_debuff(true);
  ok(play(hand(['S_A', 'H_A'])).total.mult === 2, 'debuffed Hypercam does nothing');
}
{ // Dropkick: +1 hand when the hand contains a Straight
  start('MFA16'); add('j_mf_dropkick');
  G.GAME.current_round.hands_left = 3;
  play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']), { left: 3 });
  const dk = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']), { left: 3 });
  ok(G.GAME.current_round.hands_left === 3 && msgs(dk.events).includes('+1 Hand '), 'Dropkick: straight played, hand given back ("+1 Hand ")', [G.GAME.current_round.hands_left, msgs(dk.events)]);
  play(hand(['S_2']), { left: 3 }); ok(G.GAME.current_round.hands_left === 2, 'no straight: no hand');
}
{ // Blade Dance: 2 temporary Steel cards when blind selected
  start('MFA17', { noBlind: true }); add('j_mf_bladedance');
  const n = G.playing_cards.length;
  act({ type: 'select_blind' });
  const temp = G.playing_cards.filter((c) => c.ability.mf_temporary);
  ok(G.playing_cards.length === n + 2 && temp.length === 2 && temp.every((c) => c.config.center.key === 'm_steel' && c.area === G.hand), 'Blade Dance: 2 temporary Steel cards in hand', temp.length);
}
{ // Hyper Beam: X3, lose all discards when blind selected
  start('MFA18', { noBlind: true }); add('j_mf_hyperbeam');
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.current_round.discards_left === 0, 'Hyper Beam: no discards');
  ok(hc().total.mult === 3, 'Hyper Beam X3');
}
{ // Blasphemy: X4, lose every hand when a hand is played
  start('MFA19'); add('j_mf_blasphemy');
  G.GAME.current_round.hands_left = 4; G.GAME.chips = 0; G.GAME.blind.chips = 1;
  const r = play(hand(['S_2']), { keepChips: true });
  ok(r.total.mult === 4 && G.STATE === STATES.ROUND_EVAL && G.GAME.current_round.hands_left === 0, 'Blasphemy X4, hands gone', [tot(r), G.GAME.current_round.hands_left]);
}
{ // Dramatic Entrance: +150 chips on the first hand of the round
  start('MFA20'); add('j_mf_dramaticentrance');
  ok(hc().total.chips === 157, 'Dramatic Entrance first hand +150');
  ok(hc().total.chips === 7, 'second hand: nothing');
}
{ // Bad Legal Defence: a Death when the Boss Blind is selected
  start('MFA21', { noBlind: true }); add('j_mf_badlegaldefence');
  G.GAME.round_resets.blind_tags = { Small: 'tag_d_six', Big: 'tag_d_six' }; // (1.9.9999+r2: object_weights rolls the tags; a plain one here)
  act({ type: 'skip_blind' }); act({ type: 'skip_blind' });
  clearConsumables(); act({ type: 'select_blind' });
  ok(G.GAME.blind.boss && G.consumeables.cards.some((c) => c.config.center.key === 'c_death'), 'Bad Legal Defence: Death on the boss');
  start('MFA21b', { noBlind: true }); add('j_mf_badlegaldefence'); act({ type: 'select_blind' });
  ok(G.consumeables.cards.length === 0, 'not on the small blind');
}
{ // Blunder: X3, forces one card selected
  start('MFA22', { noBlind: true }); add('j_mf_blunder');
  act({ type: 'select_blind' });
  const forced = G.hand.cards.filter((c) => c.ability.forced_selection);
  ok(forced.length === 1 && G.hand.highlighted.length === 1 && G.hand.highlighted[0] === forced[0], 'Blunder forces one card');
  G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  const r = act({ type: 'play' }); const t = r.events.find((e) => e.type === 'hand_total');
  ok(t && t.mult === 3 * (t.hand === 'High Card' ? 1 : t.mult / 3), 'Blunder X3', t);
  ok(G.hand.cards.filter((c) => c.ability.forced_selection).length === 1, 'forced again after the redraw');
  act({ type: 'sell', id: G.jokers.cards[0].sort_id });
  ok(!G.hand.cards.some((c) => c.ability.forced_selection) && G.hand.highlighted.length === 0, 'selling Blunder frees the hand');
}
{ // Brilliant: a Spectral if the blind was beaten in one hand
  start('MFA23'); add('j_mf_brilliant');
  winRound(); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'Brilliant: Spectral after a one-hand win');
  clearConsumables(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  hc(); winRound(); flush();
  ok(G.consumeables.cards.length === 0, 'two hands: nothing');
}
{ // The Broom Closet: X4 until something is bought / opened, reset at end of round
  start('MFA24'); const j = add('j_mf_broomcloset');
  ok(hc().total.mult === 4, 'Broom Closet X4');
  toShop(); G.GAME.dollars = 100;
  const buy = G.shop_jokers.cards[0]; act({ type: 'buy', id: buy.sort_id });
  ok(j.ability.active === false, 'disabled by a purchase');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(hc().total.mult === 1, 'inactive this round');
  winRound(); ok(j.ability.active === true, 'reset at end of round');
}
{ // Cartomancer!: a Rotarot when blind selected
  start('MFA25', { noBlind: true }); add('j_mf_rot_cartomancer'); act({ type: 'select_blind' });
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Rotarot', 'Cartomancer! makes a Rotarot', G.consumeables.cards.map((c) => c.config.center.key));
}
{ // Clipart Joker: a Colour when blind selected
  start('MFA26', { noBlind: true }); add('j_mf_clipart'); act({ type: 'select_blind' });
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Colour', 'Clipart makes a Colour', G.consumeables.cards.map((c) => c.config.center.key));
  G.consumeables.config.card_limit = 1; nextRound(); ok(G.consumeables.cards.length === 1, 'Clipart needs room');
}
{ // Coupon Catalogue: +15 mult per voucher redeemed
  start('MFA27'); add('j_mf_coupon_catalogue');
  ok(hc().total.mult === 1, 'no vouchers: nothing');
  G.GAME.used_vouchers.v_grabber = true; G.GAME.used_vouchers.v_wasteful = true;
  ok(hc().total.mult === 31, 'two vouchers: +30');
}
{ // CSS: a Colour when the hand contains a Flush
  start('MFA28'); add('j_mf_css');
  play(hand(['S_2', 'S_5', 'S_7', 'S_9', 'S_K']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Colour', 'CSS makes a Colour on a Flush');
  hc(); ok(G.consumeables.cards.length === 1, 'no flush: nothing');
}
done();
