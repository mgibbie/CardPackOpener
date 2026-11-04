// Pokermon pokejokers_23 (Litleo / Pyroar): both jokers fired through real plays (act), plus the
// evolution.   node micatro/tests/mods/pokejokers_23_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
ok(['litleo', 'pyroar'].every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'both pokejokers_23 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_23.lua'] || []).length === 2, 'defs: 2 from pokejokers_23.lua');

start('LITLEO');
const j = add('j_poke_litleo');
// Flush: 35 + 2+4+6+8+10 = 65
let r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
ok(r.total.chips === 65 + 70, 'litleo: +70 chips on a Flush', r.total);
r = play(hand(['S_A']));
ok(r.total.chips === 16, 'litleo: nothing otherwise', r.total);
for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
ok(key(j) === 'j_poke_pyroar', 'litleo -> pyroar after 4 rounds', key(j));
nextRound();
r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
ok(r.total.chips === 65 + 90 && G.consumeables.cards.length === 0, 'pyroar: +90 chips on a Flush, no King/Queen -> no Energy', r.total);
r = play(hand(['H_2', 'H_4', 'H_6', 'H_8', 'H_K']));
ok(r.total.chips === 35 + 30 + 90, 'pyroar: +90 chips', r.total);
ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Energy', 'pyroar: a King/Queen in the Flush makes an Energy card', G.consumeables.cards.map(key));
ok(statusMsgs(r.events).length >= 2, 'pyroar: popups', statusMsgs(r.events));

done();
