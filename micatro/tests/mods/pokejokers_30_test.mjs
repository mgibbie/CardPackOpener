// Pokermon pokejokers_30 (Dreepy -> Kleavor): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_30_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['dreepy', 'drakloak', 'dragapult', 'dreepy_dart', 'wyrdeer', 'kleavor'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 6 pokejokers_30 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_30.lua'].length === 6, 'defs: 6 from pokejokers_30.lua');

const SF = ['S_2', 'S_3', 'S_4', 'S_5', 'S_6']; // Straight Flush: 100 + 20 chips, mult 8

// ---------------------------------------------------------------- Dreepy
{
  start('DREEPY');
  const y = add('j_poke_yamper');
  const j = add('j_poke_dreepy');
  hand(['H_2', 'D_K', 'C_9']);
  const ysell = y.sell_cost, jsell = j.sell_cost, d0 = G.GAME.dollars;
  const r = act({ type: 'sell', id: j.sort_id });
  ok(r.ok && y.sell_cost === ysell + 1, 'dreepy sold: +$1 sell value to every joker', [ysell, y.sell_cost]);
  ok(G.GAME.dollars === d0 + jsell + 1, 'dreepy sells for its value +1', G.GAME.dollars - d0);
  ok(G.hand.cards.length === 3 && G.hand.cards.every((c) => c.base.suit === G.hand.cards[0].base.suit) && G.hand.cards[0].base.suit !== 'Spades',
    'dreepy sold: the hand turns to the leftmost held card\'s suit (not Spades) (Pokermon 3.9.1)', G.hand.cards.map((c) => c.base.suit));
}
{
  // A suitless leftmost card (Stone): no conversion (Pokermon 3.9.1).
  start('DREEPY_STONE');
  const j = add('j_poke_dreepy');
  hand(['H_2'], { center: 'm_stone' }); hand(['D_K', 'C_9']);
  act({ type: 'sell', id: j.sort_id });
  ok(G.hand.cards.map((c) => c.base.suit).join() === 'Hearts,Diamonds,Clubs', 'dreepy sold: a Stone leftmost card converts nothing (Pokermon 3.9.1)', G.hand.cards.map((c) => c.base.suit));
}
{
  start('DREEPY2');
  const j = add('j_poke_dreepy');
  play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.straight_flush_played === 0, 'dreepy: a pair does not count');
  play(hand(SF));
  ok(j.ability.extra.straight_flush_played === 1, 'dreepy: straight flush counted');
  winRound();
  ok(key(j) === 'j_poke_drakloak', 'dreepy evolves into drakloak after a straight flush', key(j));
}

// ---------------------------------------------------------------- Drakloak
{
  start('DRAKLOAK');
  const j = add('j_poke_drakloak');
  ok(j.sell_cost === 4, 'drakloak sells for $4', j.sell_cost);
  let r = play(hand(['S_A']));
  // High card 16 chips; X(1 + 4 * 0.01)
  ok(Math.abs(r.total.mult - 1.04) < 1e-9 && j.ability.extra.total_sell_value === 4, 'drakloak: X0.01 per $ of joker sell value', r.total);
  r = play(hand(SF));
  ok(Math.abs(r.total.mult - 8 * 1.04) < 1e-9 && j.sell_cost === 5, 'drakloak: straight flush -> +$1 sell value to every joker', [r.total, j.sell_cost]);
  ok(statusMsgs(r.events).some((m) => /value/i.test(m)), 'drakloak: value up popup');
  r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.05) < 1e-9, 'drakloak: X1.05 at $5', r.total);
  j.ability.extra_value = 40; j.set_cost();
  winRound();
  ok(key(j) === 'j_poke_dragapult', 'drakloak evolves at $40 of sell value', key(j));
}

// ---------------------------------------------------------------- Dragapult + Dreepy Darts
{
  start('DRAGAPULT');
  const j = add('j_poke_dragapult');
  ok(j.sell_cost === 5, 'dragapult sells for $5', j.sell_cost);
  let r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.15) < 1e-9, 'dragapult: X0.03 per $ of sell value', r.total);
  const slots = G.jokers.config.card_limit;
  r = play(hand(SF));
  const darts = G.jokers.cards.filter((c) => key(c) === 'j_poke_dreepy_dart');
  ok(darts.length === 2 && darts.every((d) => d.edition && d.edition.negative), 'dragapult: straight flush -> 2 Negative Dreepy Darts', darts.map((d) => d.edition));
  ok(G.jokers.config.card_limit === slots + 2, 'darts are Negative (+2 slots)', G.jokers.config.card_limit);
  ok(Math.abs(r.total.mult - 8 * 1.15) < 1e-9, 'dragapult: Xmult on the straight flush', r.total);
  // darts sell for (6/2=3) + $5 negative... sell value now counts them.
  r = play(hand(SF));
  ok(G.jokers.cards.filter((c) => key(c) === 'j_poke_dreepy_dart').length === 2, 'dragapult: no more darts while one is owned');
  const total = G.jokers.cards.reduce((s, c) => s + c.sell_cost, 0);
  ok(Math.abs(r.total.mult - 8 * (1 + total * 0.03)) < 1e-9, 'dragapult: darts add their sell value', [r.total, total]);
  // Selling a dart: +$1 to every joker, hand to Spades.
  clearHand();
  hand(['H_2', 'D_3']);
  const before = j.sell_cost;
  act({ type: 'sell', id: darts[0].sort_id });
  ok(j.sell_cost === before + 1 && G.hand.cards.every((c) => c.base.suit === 'Hearts'), 'dreepy dart sold: +$1 sell value, hand -> the leftmost card\'s suit (Pokermon 3.9.1)', [before, j.sell_cost, G.hand.cards.map((c) => c.base.suit)]);
  ok(P_CENTERS.j_poke_dreepy_dart.in_pool(P_CENTERS.j_poke_dreepy_dart) === false, 'dreepy dart: never in a pool (Pokermon 3.9.1)');
}

// ---------------------------------------------------------------- Wyrdeer
{
  start('WYRDEER');
  const j = add('j_poke_wyrdeer');
  ok(G.GAME.scry_amount === 2, 'wyrdeer: +2 Foresight', G.GAME.scry_amount);
  // Top 3 deck cards are foreseen once the hand is played (+1 Foresight before scoring).
  const top = G.deck.cards.slice(-3);
  let best = null;
  for (const v of top.slice().reverse()) if (best === null || v.base.id > best.base.id) best = v;
  const r = play(hand(['S_A']));
  ok(G.GAME.scry_amount === 3 && j.ability.extra.scry_added === 1, 'wyrdeer: +1 Foresight per hand', G.GAME.scry_amount);
  ok(r.total.mult === 1 + 2 * best.base.nominal, 'wyrdeer: double the highest foreseen rank as Mult', [r.total, best.base.value]);
  // Pokermon 3.9.1: leaving / rejoining mid-round takes the Foresight gained this round with it.
  j.remove_from_deck(true);
  ok(G.GAME.scry_amount === 0, 'wyrdeer: removed mid-round takes its +2 and this round\'s +1 (Pokermon 3.9.1)', G.GAME.scry_amount);
  j.add_to_deck(true);
  ok(G.GAME.scry_amount === 3, 'wyrdeer: re-added mid-round brings them back (Pokermon 3.9.1)', G.GAME.scry_amount);
  winRound();
  ok(G.GAME.scry_amount === 2 && j.ability.extra.scry_added === 0, 'wyrdeer: Foresight resets at end of round', G.GAME.scry_amount);
  nextRound();
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.scry_amount === 0, 'wyrdeer sold: Foresight removed', G.GAME.scry_amount);
}

// ---------------------------------------------------------------- Kleavor
{
  start('KLEAVOR', {}, { noBlind: true });
  const j = add('j_poke_kleavor');
  const victim = add('j_poke_yamper'); // common: no Stone card
  const n0 = G.playing_cards.length;
  act({ type: 'select_blind' }); clearHand();
  ok(victim.removed && !G.jokers.cards.includes(victim) && j.ability.extra.mult === 4, 'kleavor slices the joker to its right, +4 Mult', j.ability.extra.mult);
  ok(G.playing_cards.length === n0, 'kleavor: common victim -> no Stone card');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 5, 'kleavor: +4 Mult scored', r.total);
  nextRound();
  // (nothing to its right this time)
  ok(j.ability.extra.mult === 4, 'kleavor: nothing to slice');
  winRound();
  if (G.STATE === 8) act({ type: 'cash_out' });
  const rare = add('j_poke_boltund'); // rare: Stone card with an edition
  act({ type: 'next_round' });
  const n1 = G.playing_cards.length;
  act({ type: 'select_blind' }); clearHand();
  const stone = G.playing_cards[G.playing_cards.length - 1];
  ok(rare.removed && j.ability.extra.mult === 8, 'kleavor slices a rare joker', j.ability.extra.mult);
  ok(G.playing_cards.length === n1 + 1 && stone.config.center.key === 'm_stone' && stone.edition && (stone.edition.foil || stone.edition.holo || stone.edition.polychrome),
    'kleavor: uncommon+ victim -> Stone card with Foil/Holo/Polychrome', stone.edition);
}

done();
