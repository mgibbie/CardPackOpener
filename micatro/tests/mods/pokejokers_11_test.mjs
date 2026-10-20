// Pokermon pokejokers_11 (Aron -> Mega Camerupt): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_11_test.mjs
import { T, start, hand, add, play, winRound, nextRound, G, P_CENTERS } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const gone = (c) => !G.playing_cards.includes(c);

const FILE_JOKERS = ['aron', 'lairon', 'aggron', 'numel', 'camerupt', 'mega_camerupt'];
ok(P_CENTERS.j_poke_numel.config.extra && P_CENTERS.j_poke_mega_camerupt.config.extra.Xmult_mod === 0.5 && P_CENTERS.j_poke_mega_camerupt.config.extra.Xmult_multi === undefined, 'mega camerupt: Xmult_multi renamed Xmult_mod (Pokermon 3.9.1)');
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 6 pokejokers_11 jokers ported');
// (+ 15 new in 3.9.1: new-jokers sub-batch 12, pokermon_391_new_12_test.mjs)
ok(STATUS.PORTED_FILES['pokemon/pokejokers_11.lua'].length === 21, 'defs: 21 from pokejokers_11.lua (6 + 15 new in 3.9.1)');

// ---------------------------------------------------------------- Aron line
{
  start('ARON');
  const j = add('j_poke_aron');
  const steel = hand(['S_A'], { center: 'm_steel' });
  let r = play(steel);
  // High Card 5 + 11; eats the Steel card first: X1.25
  ok(r.total.chips === 16 && r.total.mult === 1.25, 'aron: +X0.25 per Steel card eaten, scored', r.total);
  ok(j.ability.extra.eaten === 1 && gone(steel[0]) && steel[0].destroyed, 'aron: the Steel card is destroyed', j.ability.extra);
  const plain = hand(['S_K']);
  r = play(plain);
  ok(r.total.mult === 1.25 && !gone(plain[0]), 'aron: plain cards are not eaten', r.total);
  const stone = hand(['H_K'], { center: 'm_stone' });
  play(stone);
  ok(!gone(stone[0]) && j.ability.extra.Xmult === 1.25, 'aron does not eat Stone', j.ability.extra);
  j.ability.extra.Xmult = 2;
  winRound();
  ok(key(j) === 'j_poke_lairon' && j.ability.extra.Xmult === 2 && j.ability.extra.Xmult_mod === 0.4, 'aron -> lairon at X2 (Xmult carried)', j.ability.extra);
  nextRound();
  const st = hand(['S_A'], { center: 'm_stone' });
  r = play(st);
  // Stone only: High Card 5 + 50; X2.4
  ok(r.total.chips === 55 && Math.abs(r.total.mult - 2.4) < 1e-9 && gone(st[0]), 'lairon eats Stone too (+X0.4)', r.total);
  const gold = hand(['S_Q'], { center: 'm_gold' });
  play(gold);
  ok(!gone(gold[0]), 'lairon does not eat Gold');
  j.ability.extra.Xmult = 4;
  winRound();
  ok(key(j) === 'j_poke_aggron' && j.ability.extra.Xmult === 4, 'lairon -> aggron at X4', j.ability.extra);
  nextRound();
  const g = hand(['S_A', 'H_A'], { center: 'm_gold' });
  r = play(g);
  // Pair 10 + 22 = 32 chips; 2 Mult * (4 + 0.8)
  ok(r.total.chips === 32 && Math.abs(r.total.mult - 2 * 4.8) < 1e-9 && gone(g[0]) && gone(g[1]), 'aggron eats Gold (+X0.4 each)', r.total);
  ok(j.ability.extra.eaten === 2, 'aggron eaten counter', j.ability.extra.eaten);
}

// ---------------------------------------------------------------- Numel line
{
  start('NUMEL');
  const j = add('j_poke_numel');
  play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.cards_scored === 2 && !j.ability.extra.active, 'numel counts scored cards', j.ability.extra);
  j.ability.extra.cards_scored = 19;
  let r = play(hand(['S_K']));
  ok(r.total.mult === 1 && j.ability.extra.active === true, 'numel: armed after 20 scored cards', j.ability.extra);
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 && r.total.mult === 3 && j.ability.extra.active === false && j.ability.extra.cards_scored === 1, 'numel: X3 on the next hand, count restarts', { t: r.total, e: j.ability.extra });
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_camerupt', 'numel -> camerupt after 4 rounds', key(j));
  nextRound();
  j.ability.extra.cards_scored = 18;
  play(hand(['S_K'], { center: 'm_mult' }));
  ok(j.ability.extra.cards_scored === 20 && j.ability.extra.active === true, 'camerupt: Mult cards count twice', j.ability.extra);
  r = play(hand(['S_K']));
  ok(r.total.mult === 4, 'camerupt: X4', r.total);
}
{
  start('MCAMER');
  const j = add('j_poke_mega_camerupt');
  let r = play(hand(['S_K']));
  ok(r.total.mult === 1 && j.ability.extra.Xmult === 1, 'mega camerupt: nothing without Mult cards', r.total);
  r = play(hand(['S_A', 'H_A'], { center: 'm_mult' }));
  // Pair 32 chips; 2 + 4 + 4 = 10 Mult, then X(1 + 0.5 * 2)
  ok(r.total.chips === 32 && r.total.mult === 20 && j.ability.extra.Xmult === 2, 'mega camerupt: +X0.5 (Xmult_mod) per Mult card scored (Pokermon 3.9.1)', r.total);
  winRound();
  ok(j.ability.extra.Xmult === 1, 'mega camerupt resets at end of round', j.ability.extra.Xmult);
}

done();
