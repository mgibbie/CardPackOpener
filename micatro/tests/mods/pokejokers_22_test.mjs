// Pokermon pokejokers_22 (Deino line): all 3 jokers fired through real plays (act), plus both
// evolutions.   node micatro/tests/mods/pokejokers_22_test.mjs
import { T, start, hand, add, play, winRound, nextRound, G, P_CENTERS } from './poke_helpers.mjs';
import { STATUS, POKERMON } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const close = (a, b) => Math.abs(a - b) < 1e-9;
ok(['deino', 'zweilous', 'hydreigon'].every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 3 pokejokers_22 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_22.lua'] || []).length === 3, 'defs: 3 from pokejokers_22.lua');

start('DEINO');
const j = add('j_poke_deino');
// Three of a Kind: 30 + 2+2+2 = 36 chips, 3 mult
let r = play(hand(['S_2', 'H_2', 'D_2']));
ok(r.total.chips === 36 && close(r.total.mult, 4.5) && j.ability.extra.hand_played === 1, 'deino: X1.5 on Three of a Kind', r.total);
r = play(hand(['S_3', 'H_3']));
ok(r.total.mult === 2 && j.ability.extra.hand_played === 1, 'deino: nothing on other hands', r.total);
// House rule (owner, 2026-10-18): any hand CONTAINING a Three of a Kind triggers it (the Lua needed an exact one).
r = play(hand(['S_4', 'H_4', 'D_4', 'C_5', 'S_5']));
ok(close(r.total.mult, 4 * 1.5) && j.ability.extra.hand_played === 2, 'deino: X1.5 on a Full House (contains a Three of a Kind)', [r.total, j.ability.extra]);
r = play(hand(['S_6', 'H_6', 'D_6', 'C_6']));
ok(close(r.total.mult, 7 * 1.5) && j.ability.extra.hand_played === 3, 'deino: X1.5 on Four of a Kind', [r.total, j.ability.extra]);
const deinoText = (k) => ((POKERMON.loc || POKERMON.content?.loc || POKERMON.def?.loc)?.descriptions?.Joker?.[k]?.text || []).join(' ');
ok(/contains a \{C:attention\}Three of a Kind/.test(deinoText('j_poke_deino')) && /contains a \{C:attention\}Three of a Kind/.test(deinoText('j_poke_zweilous')), 'deino / zweilous text says "contains a Three of a Kind"', [deinoText('j_poke_deino'), deinoText('j_poke_zweilous')]);
j.ability.extra.hand_played = 8;
winRound();
ok(key(j) === 'j_poke_zweilous', 'deino -> zweilous after 8 Three of a Kinds', key(j));
nextRound();
r = play(hand(['S_2', 'H_2', 'D_2']));
ok(close(r.total.mult, 6) && j.ability.extra.hand_played === 1, 'zweilous: X2 on Three of a Kind (count restarts)', [r.total, j.ability.extra]);
r = play(hand(['S_7', 'H_7', 'D_7', 'C_8', 'S_8']));
ok(close(r.total.mult, 4 * 2) && j.ability.extra.hand_played === 2, 'zweilous: X2 on a Full House', [r.total, j.ability.extra]);
j.ability.extra.hand_played = 10;
winRound();
ok(key(j) === 'j_poke_hydreigon', 'zweilous -> hydreigon after 10', key(j));
nextRound();
r = play(hand(['S_A']));
ok(close(r.total.mult, 3.33), 'hydreigon: X3.33 on any hand', r.total);
const cards = hand(['S_2', 'H_2', 'D_2', 'C_9', 'C_K']);
const n0 = G.playing_cards.length;
r = play(cards);
ok(close(r.total.mult, 3 * 3.33), 'hydreigon: X3.33 on the Three of a Kind', r.total);
ok(G.playing_cards.length === n0 - 2 && !G.playing_cards.includes(cards[3]) && !G.playing_cards.includes(cards[4]), 'hydreigon: unscored cards of a Three of a Kind are destroyed (destroy_card pass, cardarea unscored) (Pokermon 3.9.1)');
ok(close(j.ability.extra.Xmult, 3.33 + 2 * 0.33), 'hydreigon: +X0.33 per destroyed card', j.ability.extra.Xmult);
const c2 = hand(['S_5', 'H_5', 'D_8']);
play(c2);
ok(G.playing_cards.includes(c2[2]), 'hydreigon: other hands keep their kickers');
// Pokermon 3.9.1: Deino counts the hand at `before` (a Blueprint copy scores but does not count).
start('DEINO_BP');
add('j_blueprint');
const d = add('j_poke_deino');
r = play(hand(['S_9', 'H_9', 'D_9']));
ok(close(r.total.mult, 3 * 1.5 * 1.5) && d.ability.extra.hand_played === 1, 'deino: Blueprint copies the X1.5, the count goes up once (Pokermon 3.9.1)', [r.total, d.ability.extra]);

done();
