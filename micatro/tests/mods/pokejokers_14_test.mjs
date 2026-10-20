// Pokermon pokejokers_14 (Bidoof -> Floatzel): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_14_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['bidoof', 'bibarel', 'kricketot', 'kricketune', 'buizel', 'floatzel'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 6 pokejokers_14 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_14.lua'].length === 6, 'defs: 6 from pokejokers_14.lua');

/** Win, cash out -> shop. */
const toShop = () => { winRound(); act({ type: 'cash_out' }); };

// ---------------------------------------------------------------- Bidoof / Bibarel
{
  start('BIDOOF');
  const j = add('j_poke_bidoof');
  ok(G.GAME.current_round.free_rerolls === 1 && G.GAME.current_round.reroll_cost === 0, 'bidoof: 1 free reroll', G.GAME.current_round);
  toShop();
  ok(G.STATE === STATES.SHOP && G.GAME.current_round.reroll_cost === 0, 'bidoof: the shop reroll is free');
  let d0 = G.GAME.dollars;
  act({ type: 'reroll_shop' });
  ok(G.GAME.dollars === d0 && j.ability.extra.rerolls_to_evolve === 6, 'bidoof: free reroll counts toward evolving', [G.GAME.dollars - d0, j.ability.extra.rerolls_to_evolve]);
  ok(G.GAME.current_round.reroll_cost > 0, 'bidoof: only 1 free per shop', G.GAME.current_round.reroll_cost);
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  toShop();
  d0 = G.GAME.dollars;
  act({ type: 'reroll_shop' });
  ok(G.GAME.dollars === d0 && j.ability.extra.rerolls_to_evolve === 5, 'bidoof: a free reroll again in the next shop', [G.GAME.dollars - d0, j.ability.extra.rerolls_to_evolve]);
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  j.ability.extra.rerolls_to_evolve = 0;
  winRound();
  ok(key(j) === 'j_poke_bibarel' && G.GAME.round_resets.free_rerolls === 1, 'bidoof -> bibarel after 7 rerolls (still 1 free)', [key(j), G.GAME.round_resets.free_rerolls]);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' });
  G.GAME.blind.boss = true;
  const w = winRound();
  ok(j.ability.extra.rerolls === 2 && G.GAME.round_resets.free_rerolls === 2 && statusMsgs(w.events).includes('Upgrade!'), 'bibarel: +1 free reroll per Boss Blind', [j.ability.extra.rerolls, G.GAME.round_resets.free_rerolls]);
  act({ type: 'cash_out' });
  d0 = G.GAME.dollars;
  act({ type: 'reroll_shop' }); act({ type: 'reroll_shop' });
  ok(G.GAME.dollars === d0, 'bibarel: 2 free rerolls in the shop', G.GAME.dollars - d0);
  j.remove();
  ok(G.GAME.round_resets.free_rerolls === 0, 'bibarel removed: free rerolls gone', G.GAME.round_resets.free_rerolls);
}

// ---------------------------------------------------------------- Kricketot / Kricketune
{
  start('KRICKET');
  const j = add('j_poke_kricketot');
  let d0 = G.GAME.dollars;
  let r = play(hand(['S_2', 'H_5', 'D_8', 'C_J']));
  ok(G.GAME.dollars === d0 + 4 && statusMsgs(r.events).includes('$4'), 'kricketot: $4 for exactly 4 cards of 4 suits' + ' (Pokermon 3.9.1 data)', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  play(hand(['S_2', 'H_5', 'D_8', 'D_J']));
  play(hand(['S_2', 'H_5', 'D_8', 'C_J', 'C_3']));
  ok(G.GAME.dollars === d0, 'kricketot: not with 3 suits or 5 cards');
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_kricketune', 'kricketot -> kricketune after 4 rounds', key(j));
  nextRound();
  G.GAME.probabilities.normal = 1000;
  d0 = G.GAME.dollars;
  r = play(hand(['S_2', 'H_5', 'D_8', 'C_J']));
  ok(G.GAME.dollars === d0 + 4 && G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'kricketune: $4 and (1 in 2) a Tarot (Pokermon 3.9.1)', G.consumeables.cards.map(key));
  ok(statusMsgs(r.events).includes('+1 Tarot'), 'kricketune: "+1 Tarot" popup', statusMsgs(r.events));
  G.consumeables.config.card_limit = 1;
  clearHand();
  d0 = G.GAME.dollars;
  r = play(hand(['S_3', 'H_6', 'D_9', 'C_Q']));
  ok(G.GAME.dollars === d0 + 4 && G.consumeables.cards.length === 1 && G.GAME.consumeable_buffer === 0 && statusMsgs(r.events).includes('$4') && !statusMsgs(r.events).includes('+1 Tarot'), 'kricketune: no Tarot without room, still $4 (Pokermon 3.9.1)', [G.consumeables.cards.map(key), statusMsgs(r.events)]);
  G.consumeables.config.card_limit = 2;
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Buizel / Floatzel
{
  start('BUIZEL');
  const j = add('j_poke_buizel');
  let r = play(hand(['S_A', 'H_2', 'D_5']));
  // High Card (Ace) 16 chips; 2 unscored cards * 30
  ok(r.total.chips === 16 + 60, 'buizel: +30 chips per unscored card', r.total);
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === 32, 'buizel: nothing when every card scores', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_floatzel', 'buizel -> floatzel after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_K', 'H_K', 'D_3', 'C_4', 'S_6']));
  ok(r.total.chips === 10 + 20 + 3 * 45, 'floatzel: +45 chips per unscored card', r.total);
}

done();
