// Pokermon pokejokers_03 (Poliwhirl -> Shellder): every one of the 33 jokers fired through real
// plays (act), plus each line's evolution (Slowpoke's shop Shell included).
//   node micatro/tests/mods/pokejokers_03_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { apply_type_sticker, calculate_context } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const rounds = (n) => { for (let i = 0; i < n; i++) { winRound(); if (i < n - 1) nextRound(); } };
const useOn = (cons, j) => act({ type: 'use', id: cons.sort_id, targets: [], joker_targets: [j.sort_id] });
/** Play the round's LAST hand (hands_left hits 0) and win with it. */
function lastHand(cards) {
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return res.events.find((e) => e.type === 'hand_total');
}

const FILE_JOKERS = ['poliwhirl', 'poliwrath', 'abra', 'kadabra', 'alakazam', 'mega_alakazam', 'machop', 'machoke', 'machamp', 'bellsprout', 'weepinbell',
  'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem', 'ponyta', 'rapidash', 'slowpoke', 'slowbro', 'mega_slowbro', 'shell',
  'magnemite', 'magneton', 'farfetchd', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk', 'shellder'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 33 pokejokers_03 jokers ported',
  FILE_JOKERS.filter((n) => P_CENTERS['j_poke_' + n].unported));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_03.lua'].length === 33, 'defs: 33 from pokejokers_03.lua', STATUS.PORTED_FILES['pokemon/pokejokers_03.lua'].length);

// ---------------------------------------------------------------- Poliwhirl / Poliwrath
{
  start('POLIW');
  const j = add('j_poke_poliwhirl');
  let r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 6 && G.GAME.poke_poli_suit === 'Hearts', 'poliwhirl: +6 Mult per Spade, suit -> Hearts', [r.total, G.GAME.poke_poli_suit]);
  r = play(hand(['H_2']));
  ok(r.total.mult === 1 + 6, 'poliwhirl: Hearts now', r.total);
  j.ability.extra.evolve = 'waterstone';
  winRound();
  ok(key(j) === 'j_poke_poliwrath', 'poliwhirl + Water Stone -> poliwrath', key(j));
  nextRound();
  const suit = G.GAME.poke_poli_suit;
  r = play(hand([suit[0] + '_2']));
  ok(near(r.total.mult, (1 + 3) * 1.3), 'poliwrath: +3 Mult and X1.3 per card of the Poli suit', [suit, r.total]);
}
{
  start('POLIK');
  const j = add('j_poke_poliwhirl');
  j.ability.extra.evolve = 'kingsrock';
  winRound();
  ok(key(j) === 'j_poke_politoed', "poliwhirl + King's Rock -> politoed", key(j));
}
{
  // Pokermon 3.9.1: the Poli suit cycles once after each scored hand (pokermon.lua mod calculate, context.after),
  // however many Poli jokers there are (3.2.1 cycled it in each one's joker_main).
  start('POLI2');
  add('j_poke_poliwhirl'); add('j_poke_poliwrath');
  G.GAME.poke_poli_suit = 'Clubs';
  const r = play(hand(['C_5']));
  ok(G.GAME.poke_poli_suit === 'Diamonds', 'poli suit: one step per hand with two Poli jokers (Pokermon 3.9.1)', G.GAME.poke_poli_suit);
  ok(near(r.total.mult, (1 + 6 + 3) * 1.3), 'poli suit: the Clubs card scored before the change (Pokermon 3.9.1)', r.total);
  play(hand(['S_2']));
  ok(G.GAME.poke_poli_suit === 'Spades', 'poli suit: Diamonds -> Spades next hand (Pokermon 3.9.1)', G.GAME.poke_poli_suit);
}

// ---------------------------------------------------------------- Abra line
{
  start('ABRA');
  const j = add('j_poke_abra');
  G.GAME.probabilities.normal = 2; // 1 in 2 -> sure
  play(hand(['S_2']));
  ok(G.consumeables.cards.length === 0, 'abra: nothing on the first High Card this round');
  play(hand(['S_3']));
  ok(G.consumeables.cards.length === 1 && ['Item', 'Tarot'].includes(G.consumeables.cards[0].ability.set), 'abra: repeated hand -> an Item or a Tarot', G.consumeables.cards.map(key));
  play(hand(['S_4'])); play(hand(['S_5']));
  ok(G.consumeables.cards.length === 2, 'abra: stops at the consumable limit', G.consumeables.cards.length);
  G.GAME.probabilities.normal = 1;
  rounds(5);
  ok(key(j) === 'j_poke_kadabra', 'abra -> kadabra after 5 rounds', key(j));
  nextRound();
  for (const c of G.consumeables.cards.slice()) c.remove();
  G.GAME.probabilities.normal = 2;
  play(hand(['S_2'])); play(hand(['S_3']));
  const c = G.consumeables.cards[0];
  ok(G.consumeables.cards.length === 1 && (key(c) === 'c_poke_twisted_spoon' || c.ability.set === 'Tarot'), 'kadabra: repeated hand -> Twisted Spoon or a Tarot', G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 1;
  j.ability.extra.evolve = true; // Link Cable
  const lim = G.consumeables.config.card_limit;
  winRound();
  G.E_MANAGER.flush();
  ok(key(j) === 'j_poke_alakazam', 'kadabra + Link Cable -> alakazam', key(j));
  ok(G.consumeables.config.card_limit === lim + 1, 'alakazam: +1 consumable slot after evolving', G.consumeables.config.card_limit);
}
{
  start('ALAKA');
  const lim = G.consumeables.config.card_limit;
  const j = add('j_poke_alakazam');
  ok(G.consumeables.config.card_limit === lim + 1, 'alakazam: +1 consumable slot', G.consumeables.config.card_limit);
  G.GAME.probabilities.normal = 2;
  play(hand(['S_2'])); play(hand(['S_3'])); play(hand(['S_4']));
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => ['c_poke_twisted_spoon', 'c_fool'].includes(key(c))), 'alakazam: Twisted Spoon or The Fool', G.consumeables.cards.map(key));
  j.remove();
  ok(G.consumeables.config.card_limit === lim, 'alakazam removed: slot back at once (Pokermon 3.9.1)', G.consumeables.config.card_limit);
  G.E_MANAGER.flush();
  ok(G.consumeables.config.card_limit === lim, 'alakazam removed: slot back', G.consumeables.config.card_limit);
}
{
  start('MALAKA');
  const lim = G.consumeables.config.card_limit;
  add('j_poke_mega_alakazam');
  ok(G.consumeables.config.card_limit === lim + 1, 'mega alakazam: +1 consumable slot', G.consumeables.config.card_limit);
  add('c_poke_twisted_spoon');
  add('c_fool');
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 * 2 * 1.5), 'mega alakazam: X2 per Twisted Spoon, X1.5 per other consumable', r.total);
  add('c_moon');
  r = play(hand(['S_K']));
  ok(near(r.total.mult, 1 * 2 * 1.5 * 1.5), 'mega alakazam: third consumable', r.total);
}

// ---------------------------------------------------------------- Machop line
{
  start('MACHOP');
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  const j = add('j_poke_machop');
  ok(G.GAME.round_resets.hands === h0 + 1 && G.GAME.round_resets.discards === d0 - 1, 'machop: +1 hand, -1 discard', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2, 'machop: +2 Mult', r.total);
  rounds(5);
  ok(key(j) === 'j_poke_machoke', 'machop -> machoke after 5 rounds', key(j));
  ok(G.GAME.round_resets.hands === h0 + 2 && G.GAME.round_resets.discards === d0 - 2, 'machoke: +2 hands, -2 discards', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 10, 'machoke: +10 Mult', r.total);
  j.ability.extra.evolve = true; // Link Cable
  winRound();
  ok(key(j) === 'j_poke_machamp' && G.GAME.round_resets.hands === h0 + 4 && G.GAME.round_resets.discards === d0 - 4, 'machoke -> machamp: +4 hands, -4 discards', [key(j), G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 20, 'machamp: +20 Mult', r.total);
  j.remove(); G.E_MANAGER.flush();
  ok(G.GAME.round_resets.hands === h0 && G.GAME.round_resets.discards === d0, 'machamp removed: hands/discards back', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
}

// ---------------------------------------------------------------- Bellsprout line
{
  start('BELL');
  const j = add('j_poke_bellsprout');
  let r = play(hand(['S_2', 'H_2']));
  ok(r.total.chips === 10 + 4 + 16 * 2, 'bellsprout: +16 chips per scored even card', r.total);
  r = play(hand(['S_3', 'H_3']));
  ok(r.total.chips === 16, 'bellsprout: nothing for odd cards', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_weepinbell', 'bellsprout -> weepinbell after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_T']));
  ok(r.total.chips === 5 + 10 + 32, 'weepinbell: +32 chips per even card', r.total);
  j.ability.extra.evolve = true; // Leaf Stone
  winRound();
  ok(key(j) === 'j_poke_victreebel', 'weepinbell + Leaf Stone -> victreebel', key(j));
  nextRound();
  r = play(hand(['S_2', 'H_2']));
  ok(r.total.chips === 10 + 2 * (2 + 24) * 2, 'victreebel: +24 chips per even card, and evens retrigger (Pokermon 3.9.1)', r.total);
  ok(j.ability.extra.round_retriggers === 2 && P_CENTERS.j_poke_victreebel.loc_vars(P_CENTERS.j_poke_victreebel, [], j).vars.join() === '24,4,2',
    'victreebel: 2 of its 4 retriggers used this round (Pokermon 3.9.1)', [j.ability.extra]);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'victreebel: Aces neither', r.total);
  // 5 evens, 2 retriggers left: only the first 2 scored cards come again.
  r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.total.chips === 35 + (2 + 24) * 2 + (4 + 24) * 2 + (6 + 24) + (8 + 24) + (10 + 24), 'victreebel: only the first 4 even cards each round retrigger (Pokermon 3.9.1)', r.total);
  winRound(); nextRound();
  ok(j.ability.extra.round_retriggers === 0, 'victreebel: the count resets at end of round (Pokermon 3.9.1)', j.ability.extra);
  r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.total.chips === 35 + (2 + 24) * 2 + (4 + 24) * 2 + (6 + 24) * 2 + (8 + 24) * 2 + (10 + 24), 'victreebel: 4 retriggers again next round (Pokermon 3.9.1)', r.total);
}

// ---------------------------------------------------------------- Tentacool / Tentacruel
{
  start('TENTA');
  const j = add('j_poke_tentacool');
  let r = play(hand(['S_T']));
  ok(r.total.mult === 1 + 7, 'tentacool: +7 Mult per scored 10', r.total);
  rounds(5);
  ok(key(j) === 'j_poke_tentacruel', 'tentacool -> tentacruel after 5 rounds', key(j));
  nextRound();
  r = play(hand(['S_T', 'H_T']));
  ok(r.total.mult === 2 + 20, 'tentacruel: +10 Mult per scored 10', r.total);
}

// ---------------------------------------------------------------- Geodude line
{
  start('GEO');
  const h0 = G.hand.config.card_limit;
  const j = add('j_poke_geodude');
  ok(G.hand.config.card_limit === h0 - 1, 'geodude: -1 hand size', G.hand.config.card_limit);
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 75, 'geodude: +75 chips', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_graveler' && G.hand.config.card_limit === h0 - 2, 'geodude -> graveler (-2 hand size)', [key(j), G.hand.config.card_limit]);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 175, 'graveler: +175 chips', r.total);
  j.ability.extra.evolve = true; // Link Cable
  winRound();
  ok(key(j) === 'j_poke_golem' && G.hand.config.card_limit === h0 - 3, 'graveler -> golem (-3 hand size)', [key(j), G.hand.config.card_limit]);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 275, 'golem: +275 chips', r.total);
  j.remove(); G.E_MANAGER.flush();
  ok(G.hand.config.card_limit === h0, 'golem removed: hand size back', G.hand.config.card_limit);
}

// ---------------------------------------------------------------- Ponyta / Rapidash
{
  start('PONY');
  const j = add('j_poke_ponyta');
  let r = play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(j.ability.extra.chips === 12 && r.total.chips === 30 + 51 + 12, 'ponyta: +12 chips per Straight', r.total);
  r = play(hand(['S_2']));
  ok(r.total.chips === 7 + 12, 'ponyta: keeps its chips', r.total);
  j.ability.extra.chips = 60;
  winRound();
  ok(key(j) === 'j_poke_rapidash' && j.ability.extra.chips === 60, 'ponyta -> rapidash at 60 (chips carried)', [key(j), j.ability.extra]);
  nextRound();
  play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(j.ability.extra.chips === 75 && j.ability.extra.chip_mod === 16, 'rapidash: +15, and the gain grows by 1', j.ability.extra);
  r = play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(j.ability.extra.chips === 91 && r.total.chips === 81 + 91, 'rapidash: +16 next time', [j.ability.extra, r.total]);
}

// ---------------------------------------------------------------- Slowpoke line (+ Shell)
{
  start('SLOWP');
  const j = add('j_poke_slowpoke');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 && j.ability.extra.last_counter === 0, 'slowpoke: nothing before the last hand', r.total);
  const t = lastHand(hand(['S_K']));
  ok(t.mult === 2 && j.ability.extra.last_counter === 1, 'slowpoke: X2 on the last hand', [t, j.ability.extra]);
  act({ type: 'cash_out' });
  // The shop: a reroll may add a free (Negative) Shell; 1 in 7 -> sure with x7 odds.
  G.GAME.probabilities.normal = 7;
  G.GAME.dollars = 100;
  act({ type: 'reroll_shop' });
  const shell = G.shop_jokers.cards.find((c) => key(c) === 'j_poke_shell');
  ok(shell && shell.cost === 0 && shell.edition && shell.edition.negative, 'slowpoke: reroll adds a free Negative Shell', G.shop_jokers.cards.map((c) => [key(c), c.cost]));
  ok(shell.ability.couponed === true, 'slowpoke: the Shell is couponed, so it stays free (Pokermon 3.9.1)', shell.ability.couponed);
  ok(P_CENTERS.j_poke_shell.in_pool(P_CENTERS.j_poke_shell) === false, 'shell: never in a pool (Pokermon 3.9.1 in_pool)', P_CENTERS.j_poke_shell.in_pool(P_CENTERS.j_poke_shell));
  G.GAME.probabilities.normal = 1;
  ok(act({ type: 'buy', id: shell.sort_id }).ok, 'buy the shell');
  G.E_MANAGER.flush();
  ok(j.ability.extra.shell_used === 1 && !G.jokers.cards.some((c) => key(c) === 'j_poke_shell'), 'shell: marks slowpoke and self-destructs', [j.ability.extra, G.jokers.cards.map(key)]);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(key(j) === 'j_poke_slowbro', 'slowpoke + shell -> slowbro', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.4), 'slowbro: X1.4 on the first hand', r.total);
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.8), 'slowbro: X1.8 on the second', r.total);
  const w = winRound();
  ok(statusMsgs(w.events).includes('Reset'), 'slowbro: "Reset" at end of round', statusMsgs(w.events));
  nextRound();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.4), 'slowbro: back to X1.4 next round', r.total);
}
{
  start('SLOWP2');
  const j = add('j_poke_slowpoke');
  j.ability.extra.last_counter = 4;
  winRound();
  ok(key(j) === 'j_poke_slowbro', 'slowpoke -> slowbro after 4 last-hand triggers', key(j));
  start('SLOWP3');
  const k = add('j_poke_slowpoke');
  k.ability.extra.evolve = true; // King's Rock
  winRound();
  ok(key(k) === 'j_poke_slowking', "slowpoke + King's Rock -> slowking", key(k));
}
{
  start('MSLOW');
  const j = add('j_poke_mega_slowbro');
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5), 'mega slowbro: X1.5 after 1 hand', r.total);
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 2), 'mega slowbro: X2 after 2 hands', r.total);
  winRound(); // small blind: no reset
  ok(j.ability.extra.hands_played === 3, 'mega slowbro: counts each hand in before, kept past a non-boss blind (Pokermon 3.9.1)', j.ability.extra.hands_played);
  nextRound(); winRound(); nextRound();
  ok(G.GAME.blind.boss, 'boss blind');
  winRound();
  ok(j.ability.extra.hands_played === 0, 'mega slowbro: resets after the boss', j.ability.extra.hands_played);
}

// ---------------------------------------------------------------- Magnemite / Magneton
{
  start('MAGNE');
  const j = add('j_poke_magnemite');
  let r = play(hand(['S_2'], { center: 'm_steel' }));
  ok(near(r.total.mult, 1.5), 'magnemite: X1.5 per scored Steel card', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_magneton', 'magnemite -> magneton after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_2'], { center: 'm_steel' }));
  ok(near(r.total.mult, 1.5), 'magneton: X1.5 with no Metal neighbours', r.total);
  const m = add('j_poke_caterpie');
  apply_type_sticker(m, 'Metal');
  r = play(hand(['S_3'], { center: 'm_steel' }));
  ok(near(r.total.mult, 1 * 1.7 + 3), 'magneton: X(1.5 + 0.2 per adjacent Metal joker) per Steel card (caterpie +3 after)', r.total);
  ok(P_CENTERS.j_poke_magneton.loc_vars(P_CENTERS.j_poke_magneton, [], j).vars[2] === 1.7, 'magneton tooltip: X1.7');
  const ts = add('c_poke_thunderstone');
  ok(useOn(ts, j).ok, 'thunder stone usable on magneton');
  winRound();
  ok(key(j) === 'j_poke_magnezone', 'magneton -> magnezone with a Thunder Stone', key(j));
}

// ---------------------------------------------------------------- Farfetch'd
{
  start('FARF');
  add('j_poke_farfetchd');
  const leek = G.consumeables.cards.find((c) => key(c) === 'c_poke_leek');
  ok(!!leek, "farfetch'd: comes holding a Leek", G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 4; // 1 in 4 -> sure
  const pl = add('c_pluto');
  let d0 = G.GAME.dollars;
  ok(act({ type: 'use', id: pl.sort_id }).ok, 'use Pluto');
  ok(G.GAME.dollars === d0 + 4, "farfetch'd: $4 when a consumable is used (odds)", G.GAME.dollars - d0);
  G.GAME.probabilities.normal = 0; // never on the odds: only the Leek pays
  d0 = G.GAME.dollars;
  calculate_context({ using_consumeable: true, consumeable: leek }); G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0 + 4, "farfetch'd: $4 guaranteed for a Leek", G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  ok(act({ type: 'use', id: add('c_pluto').sort_id }).ok && G.GAME.dollars === d0, "farfetch'd: nothing when the roll fails", G.GAME.dollars - d0);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Doduo / Dodrio
{
  start('DODUO');
  const j = add('j_poke_doduo');
  let r = play(hand(['S_K', 'H_K', 'D_K']));
  ok(r.total.mult === 3 + 6 * 2, 'doduo: first 2 scored face cards +6 Mult', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_dodrio', 'doduo -> dodrio after 4 rounds', key(j));
  nextRound();
  const h0 = G.hand.config.card_limit;
  r = play(hand(['S_K', 'H_K', 'D_K', 'C_K']));
  ok(r.total.mult === 7 + 7 * 3 && G.hand.config.card_limit === h0, 'dodrio: first 3 face cards +7 Mult (4 scoring: no hand size)', [r.total, G.hand.config.card_limit]);
  r = play(hand(['S_Q', 'H_Q', 'D_Q']));
  ok(r.total.mult === 3 + 21 && G.hand.config.card_limit === h0 + 1, 'dodrio: exactly 3 face cards -> +1 hand size', [r.total, G.hand.config.card_limit]);
  nextRound();
  ok(G.hand.config.card_limit === h0, 'dodrio: hand size back next round', G.hand.config.card_limit);
}

// ---------------------------------------------------------------- Seel / Dewgong
{
  start('SEEL');
  const j = add('j_poke_seel');
  G.GAME.probabilities.normal = 2; // 1 in 2 -> sure
  const c = hand(['S_A', 'H_A']);
  play(c);
  ok(!!c[0].seal && !c[1].seal, 'seel: the first hand seals its first scoring card', [c[0].seal, c[1].seal]);
  const d = hand(['S_K']);
  play(d);
  ok(!d[0].seal, 'seel: only the first hand of the round', d[0].seal);
  G.GAME.probabilities.normal = 1;
  rounds(5);
  ok(key(j) === 'j_poke_dewgong', 'seel -> dewgong after 5 rounds', key(j));
  nextRound();
  const e = hand(['S_9', 'H_9']);
  play(e);
  // SMODS.poll_seal draws from the whole Seal pool: Pokermon's own Pink/Silver seals (weight 5) are in it too.
ok(!!e[0].seal && ['Gold', 'Red', 'Blue', 'Purple', 'poke_pink_seal', 'poke_silver'].includes(e[0].seal), 'dewgong: always seals the first card of the first hand', e[0].seal);
}

// ---------------------------------------------------------------- Grimer / Muk
{
  start('GRIME');
  const j = add('j_poke_grimer');
  ok(G.playing_cards.length === G.GAME.starting_deck_size, 'deck at its starting size');
  // hand() creates new playing cards, so the deck is now over its starting size.
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 8, 'grimer: +8 Mult with more cards than the starting deck', r.total);
  const n0 = G.playing_cards.length;
  winRound(); // winRound adds 1 card itself
  ok(G.playing_cards.length === n0 + 2, 'grimer: adds a random card at end of round', G.playing_cards.length - n0);
  for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_muk', 'grimer -> muk after 5 rounds', key(j));
  nextRound();
  const over = G.playing_cards.length + 1 - G.GAME.starting_deck_size;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 * over, 'muk: +2 Mult per card over the starting size (Pokermon 3.9.1 mult_mod)', [r.total, over]);
  ok(P_CENTERS.j_poke_muk.loc_vars(P_CENTERS.j_poke_muk, [], j).vars[0] === 2, 'muk tooltip: +2 (Pokermon 3.9.1)');
  const before = G.playing_cards.slice();
  const n1 = G.playing_cards.length;
  winRound();
  G.E_MANAGER.flush();
  const gone = before.filter((c) => !G.playing_cards.includes(c));
  ok(G.playing_cards.length === n1 + 1 + 2 - 1, 'muk: +2 random cards, -1 destroyed', G.playing_cards.length - n1);
  ok(gone.length <= 1, 'muk: destroys one card', gone.length);
}

// ---------------------------------------------------------------- Shellder
{
  start('SHELL');
  const j = add('j_poke_shellder');
  G.GAME.probabilities.normal = 3; // 1 in 3 -> sure
  let r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.total.chips === 35 + 30 * 2, 'shellder: every card of a 5-card hand retriggers (odds)', r.total);
  r = play(hand(['S_2', 'H_2']));
  ok(r.total.chips === 14, 'shellder: not for smaller hands', r.total);
  ok(P_CENTERS.j_poke_shellder.loc_vars(P_CENTERS.j_poke_shellder, [], j).vars[2] === 1, 'shellder tooltip: retriggers 1 additional time (Pokermon 3.9.1)');
  G.GAME.probabilities.normal = 1;
  j.ability.extra.evolve = true; // Water Stone
  winRound();
  ok(key(j) === 'j_poke_cloyster', 'shellder + Water Stone -> cloyster', key(j));
}

done();
