// Þe Autumn Circus — the 28 Oddities of BasicOddities.lua (+ Ritual Page with More Fluff on), each used through
// real act() calls with the mod's numbers; rarities, pools (the Jollars only in packs), descriptions.
//   node micatro/tests/mods/autumncircus_oddities_test.mjs
import {
  start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, use, winRound, nextRound, toShop, destroy, msgs, tot, filled,
  ok, near, flush, done, G, P_CENTERS, P_CARDS, act, STATES, describe, describeCenter, AMM,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, add_joker, get_current_pool } from '../../js/engine/core.js';
import { STATUS } from '../../mods/autumncircus/index.js';

const cons = (key) => { const c = add_joker(key); flush(); return c; };
const K = (k) => 'c_thac_' + k;
const BASE = ['one_jollar', 'two_jollar', 'five_jollar', 'ten_jollar', 'twenty_jollar', 'green_chip', 'yellow_chip', 'red_blue_chip', 'purple_chip', 'power_chip',
  'pot_of_joker', 'jimbobread_man', 'jimbobread_man_half', 'cultist_potion', 'fire_potion', 'snecko_potion', 'energy_potion', 'estradiol', 'faded_voucher',
  'empty_bottle', 'trick_deck', 'box_of_rocks', 'calcium', 'scrap_metal', 'fossil', 'gift_of_the_knight', 'dance_with_the_dead', 'memorial_ticket'];

// ===================================================================== registration
{
  start('ODDREG');
  ok(STATUS.oddities.length === 29 && BASE.every((k) => STATUS.oddities.includes(K(k))) && STATUS.oddities.includes(K('ritual_page')), '29 Oddities registered (28 + Ritual Page)', STATUS.oddities.length);
  const pool = P_CENTER_POOLS.Oddity.map((c) => c.key);
  ok(pool.length === 28 && !pool.includes(K('ritual_page')), 'More Fluff off: 28 in the pool, no Ritual Page');
  const R = (k) => P_CENTERS[K(k)].rarity;
  ok(R('one_jollar') === 1 && R('five_jollar') === 2 && R('twenty_jollar') === 3 && R('estradiol') === 4 && R('faded_voucher') === 4 && R('gift_of_the_knight') === 4 && R('cultist_potion') === 3, 'rarities as in the mod');
  const bad = [];
  for (const k of BASE) {
    const c = cons(K(k));
    if (!filled(describe(c)) || !filled(describeCenter(K(k)))) bad.push(k);
    c.remove(); flush();
  }
  ok(!bad.length, 'describe(): every Oddity text filled', bad);
  const d = describe(cons(K('one_jollar')));
  ok(d.badges.some((b) => b.label === 'Common'), 'Oddity rarity badge');
  start('ODDREGMF', { mods: ['autumncircus', 'morefluff'] });
  ok(P_CENTER_POOLS.Oddity.some((c) => c.key === K('ritual_page')), 'More Fluff on: Ritual Page in the pool');
}

// ===================================================================== Jollars
{
  start('ODDJOL');
  for (const [k, n] of [['one_jollar', 1], ['two_jollar', 2], ['five_jollar', 5], ['ten_jollar', 10], ['twenty_jollar', 20]]) {
    const c = cons(K(k));
    ok(c.sell_cost === n, k + ': sells for $' + n, c.sell_cost);
    const d0 = G.GAME.dollars;
    ok(act({ type: 'use', id: c.sort_id }).ok && G.GAME.dollars === d0 + n, k + ': +$' + n);
  }
  const [pool] = get_current_pool('Oddity', 1);
  ok(!pool.includes(K('one_jollar')) && !pool.includes(K('two_jollar')), 'the Jollars stay out of the shop (only packs)');
  G.STATE = G.STATES.MOD_PACK;
  const [pool2] = get_current_pool('Oddity', 1);
  ok(pool2.includes(K('one_jollar')), '... and appear in packs');
  G.STATE = G.STATES.SELECTING_HAND;
}

// ===================================================================== Chips
{
  start('ODDCHIP');
  for (const [k, max, ch] of [['green_chip', 2, 15], ['yellow_chip', 4, 10], ['red_blue_chip', 2, 30], ['purple_chip', 4, 15], ['power_chip', 1, 75]]) {
    const c = cons(K(k));
    ok(c.ability.consumeable.max_highlighted === max && c.ability.extra.chips === ch, k + ': up to ' + max + ' cards, +' + ch);
    const cards = hand(Array.from({ length: max + 1 }, (_, i) => ['S_2', 'S_3', 'S_4', 'S_5', 'S_6'][i]));
    act({ type: 'highlight', ids: cards.map((x) => x.sort_id) });
    ok(!c.can_use_consumeable(), k + ': not on ' + (max + 1) + ' cards');
    const r = use(c, cards.slice(0, max));
    ok(r.ok && cards.slice(0, max).every((x) => x.ability.perma_bonus === ch) && !cards[max].ability.perma_bonus && G.hand.highlighted.length === 0, k + ': each selected card +' + ch + ' chips permanently, then unselected');
    const t = play([cards[0]]);
    ok(tot(t)[0] === 5 + 2 + ch, k + ': the card scores its bonus', tot(t));
  }
}

// ===================================================================== draw / hands
{
  start('ODDDRAW');
  hand(['S_2', 'S_3']);
  const pot = cons(K('pot_of_joker'));
  const n = G.hand.cards.length;
  act({ type: 'use', id: pot.sort_id });
  ok(G.hand.cards.length === n + 2, 'Pot of Joker: draw 2 cards');
  clearHand();
  const jim = cons(K('jimbobread_man'));
  const h0 = G.GAME.current_round.hands_left;
  act({ type: 'use', id: jim.sort_id });
  ok(G.GAME.current_round.hands_left === h0 + 1 && jim.config.center.key === K('jimbobread_man_half') && G.consumeables.cards.includes(jim), 'Jimbobread Man: +1 hand, then it is Half-Eaten (stays)');
  act({ type: 'use', id: jim.sort_id });
  ok(G.GAME.current_round.hands_left === h0 + 2 && !G.consumeables.cards.includes(jim), 'Half-Eaten Jimbobread Man: +1 hand, eaten');
  ok(!P_CENTERS[K('jimbobread_man_half')].in_pool(), 'the Half-Eaten one never spawns on its own');
}

// ===================================================================== potions
{
  start('ODDPOT');
  // Cultist Potion: ACTIVE: X1 more Mult per hand (X1 on the first, X2 the second), gone after the round
  const cu = cons(K('cultist_potion'));
  act({ type: 'use', id: cu.sort_id });
  ok(cu.ability.extra.active && G.consumeables.cards.includes(cu) && !cu.can_use_consumeable(), 'Cultist Potion: activated (kept, can\'t re-activate)');
  let r = play(hand(['H_A']));
  ok(tot(r).join() === '16,1,16', 'Cultist Potion: X1 on the first hand', tot(r));
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,2,32', 'Cultist Potion: X2 on the second', tot(r));
  winRound(); flush();
  ok(!G.consumeables.cards.includes(cu), 'Cultist Potion: self-destructs after the round');
}
{
  start('ODDPOT2');
  const fi = cons(K('fire_potion'));
  act({ type: 'use', id: fi.sort_id });
  let r = play(hand(['H_A']));
  ok(tot(r).join() === '16,21,336', 'Fire Potion: +20 Mult', tot(r));
  ok(!G.consumeables.cards.includes(fi), 'Fire Potion: self-destructs after the hand');
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,1,16', 'only once');
  const en = cons(K('energy_potion'));
  act({ type: 'use', id: en.sort_id });
  r = play(hand(['H_A', 'S_A']));
  // Pair: 10 x 2; each Ace scores 3 times: 10 + 6 x 11 = 76 -> 152
  ok(tot(r).join() === '76,2,152', 'Energy Potion: every played card retriggered 2 times', tot(r));
  ok(!G.consumeables.cards.includes(en), 'Energy Potion: self-destructs after the hand');
}
{
  start('ODDSNEK');
  hand(['S_2', 'S_3']);
  const sn = cons(K('snecko_potion'));
  const n = G.hand.cards.length;
  const before = G.hand.cards.map((c) => c.base.value).join();
  act({ type: 'use', id: sn.sort_id });
  ok(G.hand.cards.length === n + 5, 'Snecko Oil: draw 5');
  ok(G.hand.cards.map((c) => c.base.value).join() !== before, 'Snecko Oil: ranks randomized');
}

// ===================================================================== deck changes
{
  start('ODDEST');
  const kj = G.playing_cards.filter((c) => c.base.value === 'King' || c.base.value === 'Jack').length;
  const q0 = G.playing_cards.filter((c) => c.base.value === 'Queen').length;
  const es = cons(K('estradiol'));
  act({ type: 'use', id: es.sort_id });
  ok(G.playing_cards.filter((c) => c.base.value === 'Queen').length === q0 + kj && !G.playing_cards.some((c) => c.base.value === 'King' || c.base.value === 'Jack'), 'Estradiol: every King and Jack in the deck becomes a Queen');
  const fv = cons(K('faded_voucher'));
  const v0 = Object.keys(G.GAME.used_vouchers).length;
  act({ type: 'use', id: fv.sort_id });
  ok(Object.keys(G.GAME.used_vouchers).length === v0 + 1, 'Faded Voucher: redeems a random voucher');
  const [c1] = hand(['S_9']);
  const bo = cons(K('empty_bottle'));
  act({ type: 'highlight', ids: [c1.sort_id] });
  ok(bo.can_use_consumeable(), 'Empty Bottle: usable on 1 card');
  use(bo, [c1]);
  ok(c1.bottle === true, 'Empty Bottle: bottles the card');
  const bo2 = cons(K('empty_bottle'));
  act({ type: 'highlight', ids: [c1.sort_id] });
  ok(!bo2.can_use_consumeable(), 'not on a card that is already bottled');
}
{
  start('ODDMAKE');
  hand(['S_2', 'S_3']);
  const n = G.hand.cards.length, p0 = G.playing_cards.length;
  act({ type: 'use', id: cons(K('trick_deck')).sort_id });
  const trick = ['m_bonus', 'm_mult', 'm_wild', 'm_lucky', 'm_thac_star', 'm_thac_soulbound'];
  const made = G.hand.cards.slice(n);
  ok(made.length === 4 && made.every((c) => trick.includes(c.config.center.key)) && G.playing_cards.length === p0 + 4, 'Trick Deck: 4 non-material enhanced cards in hand', made.map((c) => c.config.center.key));
  clearHand(); hand(['S_2', 'S_3']);
  act({ type: 'use', id: cons(K('box_of_rocks')).sort_id });
  ok(G.hand.cards.filter((c) => c.config.center.key === 'm_stone').length === 2, 'Box of Rocks: 2 Stone Cards in hand');
  act({ type: 'use', id: cons(K('calcium')).sort_id });
  ok(G.hand.cards.filter((c) => c.config.center.key === 'm_thac_bone').length === 2, 'Calcium: 2 Bone Cards in hand');
  const g0 = G.graveyard.length;
  act({ type: 'use', id: cons(K('scrap_metal')).sort_id });
  ok(G.graveyard.length === g0 + 4 && G.graveyard.slice(-4).every((c) => ['m_steel', 'm_gold'].includes(c.config.center.key)), 'Scrap Metal: 4 metal cards into the graveyard');
  act({ type: 'use', id: cons(K('fossil')).sort_id });
  ok(G.graveyard.length === g0 + 8 && G.graveyard.slice(-4).every((c) => c.config.center.key === 'm_thac_bone'), 'Fossil: 4 Bone Cards into the graveyard');
  const k0 = G.hand.cards.length;
  act({ type: 'use', id: cons(K('gift_of_the_knight')).sort_id });
  const gk = G.hand.cards[k0];
  ok(gk && gk.base.value === '3' && gk.base.suit === 'Hearts' && gk.edition && gk.edition.polychrome && gk.aspect === 'thac_heart', 'Gift of the Knight: a Polychrome 3 of Hearts with the Heart Aspect');
  const mt = cons(K('memorial_ticket'));
  const d0 = G.GAME.dollars, gy = G.graveyard.length;
  act({ type: 'use', id: mt.sort_id });
  ok(G.GAME.dollars === d0 + Math.min(40, gy), 'Memorial Ticket: $1 per graveyard card', [G.GAME.dollars - d0, gy]);
}
{
  start('ODDMAKEMF', { mods: ['autumncircus', 'morefluff'] });
  const rp = cons(K('ritual_page'));
  act({ type: 'use', id: rp.sort_id });
  ok(G.graveyard.length === 4 && G.graveyard.every((c) => c.config.center.key === 'm_mf_cult'), 'Ritual Page (More Fluff): 4 Cult Cards into the graveyard');
  hand(['S_2', 'S_3']);
  const n = G.hand.cards.length;
  act({ type: 'use', id: cons(K('trick_deck')).sort_id });
  ok(G.hand.cards.slice(n).every((c) => ['m_bonus', 'm_mult', 'm_wild', 'm_lucky', 'm_mf_monus', 'm_mf_cult', 'm_mf_styled', 'm_mf_teal', 'm_thac_star', 'm_thac_soulbound'].includes(c.config.center.key)), 'Trick Deck with More Fluff: its enhancements join the list');
}
{
  start('ODDDANCE');
  for (const c of hand(['D_2', 'D_3', 'D_4', 'D_5', 'D_6'])) destroy(c);
  const held = hand(['S_9', 'S_8', 'S_7']);
  const dd = cons(K('dance_with_the_dead'));
  act({ type: 'use', id: dd.sort_id });
  ok(G.hand.cards.length === 3 && G.graveyard.length === 5 && held.filter((c) => c.graveyard).length + G.hand.cards.filter((c) => held.includes(c)).length === 3, 'Dance of the Dead: the hand goes to the graveyard, as many come back', [G.hand.cards.length, G.graveyard.length]);
}

done();
