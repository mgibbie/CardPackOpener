// Pokermon pokejokers_33 (Wugtrio -> Kingambit): every joker fired through real plays (act).
//   node micatro/tests/mods/pokejokers_33_test.mjs
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, P_CARDS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { smods_create_card } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['wugtrio', 'annihilape', 'farigiraf', 'dudunsparce', 'kingambit'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 5 pokejokers_33 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_33.lua'].length === 5, 'defs: 5 from pokejokers_33.lua');

// ---------------------------------------------------------------- Wugtrio
{
  start('WUGTRIO');
  add('j_poke_wugtrio');
  let r = play(hand(['S_5', 'H_5', 'D_5']));
  ok(r.total.chips === 30 + 15 + 120 && near(r.total.mult, 4.5), 'wugtrio: Three of a Kind with a 5 -> +120 Chips, X1.5', r.total);
  r = play(hand(['S_7']));
  ok(r.total.chips === 5 + 7 + 120 && r.total.mult === 1, 'wugtrio: a 5/6/7 -> +120 Chips', r.total);
  r = play(hand(['S_K', 'H_K', 'D_K']));
  ok(r.total.chips === 60 && near(r.total.mult, 4.5), 'wugtrio: Three of a Kind -> X1.5', r.total);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 && r.total.mult === 1, 'wugtrio: nothing otherwise', r.total);
}

// ---------------------------------------------------------------- Annihilape
{
  start('ANNIHILAPE');
  add('j_poke_annihilape');
  let r = play(hand(['S_2', 'H_2']));
  ok(r.total.chips === 10 + 4 + 14 && r.total.mult === 2 + 10, 'annihilape: 2/3/5/7 give +7 Chips +5 Mult (first hand)', r.total);
  r = play(hand(['S_3', 'H_3']));
  ok(r.total.chips === 10 + 6 + 28 && r.total.mult === 2 + 20, 'annihilape: x2 on the second hand', r.total);
  r = play(hand(['S_4', 'H_4']));
  ok(r.total.chips === 18 && r.total.mult === 2, 'annihilape: other ranks nothing', r.total);
}

// ---------------------------------------------------------------- Farigiraf
{
  start('FARIGIRAF');
  add('j_poke_farigiraf');
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === 'c_cryptid', 'farigiraf: holding Cryptid');
  let r = play(hand(['S_K', 'H_K', 'S_Q', 'H_Q', 'D_J']));
  // Two Pair: 20 + 40 chips; first (K) and last (Q) face X2.2 each.
  ok(r.total.chips === 60 && near(r.total.mult, 2 * 2.2 * 2.2), 'farigiraf: first and last face X2.2 on a Two Pair', r.total);
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2, 'farigiraf: no Two Pair -> nothing', r.total);
  // A full consumable row: no Cryptid.
  start('FARIGIRAF2');
  add('c_poke_pokeball'); add('c_poke_pokeball');
  add('j_poke_farigiraf');
  ok(G.consumeables.cards.length === 2 && !G.consumeables.cards.some((c) => c.config.center.key === 'c_cryptid'), 'farigiraf: no room, no Cryptid');
}

// ---------------------------------------------------------------- Dudunsparce
{
  start('DUDUNSPARCE');
  const j = add('j_poke_dudunsparce');
  ok(G.GAME.shop.joker_max === 3 && G.GAME.modifiers.extra_boosters === 1 && G.GAME.modifiers.extra_vouchers === 1, 'dudunsparce: +1 shop / booster / voucher slot',
    [G.GAME.shop.joker_max, G.GAME.modifiers.extra_boosters, G.GAME.modifiers.extra_vouchers]);
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.length === 3 && G.shop_booster.cards.length === 3 && G.shop_vouchers.cards.length === 2, 'dudunsparce: the shop shows 3 cards, 3 packs, 2 vouchers',
    [G.shop_jokers.cards.length, G.shop_booster.cards.length, G.shop_vouchers.cards.length]);
  ok(G.shop_vouchers.cards[0].config.center.key !== G.shop_vouchers.cards[1].config.center.key, 'two different vouchers');
  // The extra voucher can be bought.
  G.GAME.dollars = 100;
  const v2 = G.shop_vouchers.cards[1];
  ok(act({ type: 'buy', id: v2.sort_id }).ok && G.GAME.used_vouchers[v2.config.center.key], 'extra voucher redeemed');
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.shop.joker_max === 2 && G.GAME.modifiers.extra_boosters === 0 && G.GAME.modifiers.extra_vouchers === 0, 'dudunsparce sold: slots back to normal');
  ok(['form', 'card_slots'].every((k) => j.ability.extra[k] !== undefined), 'dudunsparce data');
}
{
  // Three-segment form (1 in 6): also a Coupon Tag when obtained.
  start('DUDUN3');
  const j = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_dudunsparce' });
  j.ability.extra.form = 1;
  j.add_to_deck(); G.jokers.emplace(j); G.E_MANAGER.flush();
  ok(G.GAME.tags.some((t) => t.key === 'tag_coupon'), 'dudunsparce (three-segment): Coupon Tag');
  ok(P_CENTERS.j_poke_dudunsparce.loc_vars(P_CENTERS.j_poke_dudunsparce, [], j).key === 'j_poke_dudunsparce2', 'three-segment description');
  // Form roll is seeded: 1 in 6.
  let threes = 0;
  for (let i = 0; i < 60; i++) if (smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_dudunsparce' }).ability.extra.form === 1) threes++;
  ok(threes > 0 && threes < 30, 'dudunsparce: three-segment form is the rare one', threes);
}

// ---------------------------------------------------------------- Kingambit
{
  start('KINGAMBIT');
  const j = add('j_poke_kingambit');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'kingambit: X2 Mult', r.total);
  // Make the played King the only one in the deck.
  for (const c of G.playing_cards) if (c.get_id() === 13) c.set_base(P_CARDS[c.base.suit[0] + '_2']);
  j.ability.extra.Xmult = 4;
  r = play(hand(['S_5', 'H_5', 'D_K']));
  // Pair of 5s: each scored nonface card X(4/2), then X4.
  ok(r.total.chips === 10 + 10 && near(r.total.mult, 2 * 2 * 2 * 4), 'kingambit: only King played -> nonface cards give half its XMult', r.total);
  j.ability.extra.Xmult = 2;
  r = play(hand(['S_5', 'H_5', 'D_K']));
  ok(near(r.total.mult, 2 * 2), 'kingambit: half of X2 is X1 -> no card XMult', r.total);
  j.ability.extra.Xmult = 4;
  clearHand();
  hand(['C_K']); // a second King in the deck (held)
  r = play(hand(['S_5', 'H_5', 'D_K']));
  ok(near(r.total.mult, 2 * 4), 'kingambit: two Kings in the deck -> nothing per card', r.total);
}

done();
