// Pokermon pokejokers_17 (Shaymin): both forms fired through real plays (act), plus the
// Land <-> Sky transformations.
//   node micatro/tests/mods/pokejokers_17_test.mjs
import { T, start, hand, add, play, winRound, nextRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['shaymin', 'shaymin_sky'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'both pokejokers_17 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_17.lua'].length === 2, 'defs: 2 from pokejokers_17.lua');
ok(P_CENTERS.j_poke_shaymin_sky.in_pool(P_CENTERS.j_poke_shaymin_sky) === false, 'shaymin sky never appears in a pool');

{
  start('SHAYMIN');
  const j = add('j_poke_shaymin');
  const first = hand(['S_A', 'H_K']);
  play(first);
  ok(key(first[0]) === 'm_poke_flower' && key(first[1]) === 'c_base', 'shaymin: the last scoring card of the first hand becomes a Flower card', first.map(key));
  ok(j.ability.extra.flowers_scored === 1, 'shaymin: ... and it counts as a Flower scored', j.ability.extra);
  const second = hand(['D_A']);
  play(second);
  ok(key(second[0]) === 'c_base' && j.ability.extra.flowers_scored === 1, 'shaymin: only the first hand of the round');
  const f = hand(['C_7'], { center: 'm_poke_flower' });
  play(f);
  ok(j.ability.extra.flowers_scored === 2, 'shaymin: +1 per Flower card scored', j.ability.extra);
  winRound();
  ok(key(j) === 'j_poke_shaymin', 'shaymin: not yet (10 Flowers)');
  nextRound();
  j.ability.extra.flowers_scored = 10;
  winRound();
  ok(key(j) === 'j_poke_shaymin_sky', 'shaymin -> shaymin sky after 10 Flowers', key(j));
  nextRound();
  // Sky form: Flower cards are also Wild cards (Steamodded quantum enhancement).
  const fl = hand(['H_2'], { center: 'm_poke_flower' });
  ok(fl[0].is_suit('Spades') && fl[0].is_suit('Clubs') && fl[0].is_suit('Hearts'), 'shaymin sky: Flower cards count as every suit');
  const r = play(hand(['S_3', 'S_5', 'S_7', 'S_9']).concat(fl));
  ok(r.total.chips === 35 + 3 + 5 + 7 + 9 + 2, 'shaymin sky: so they make Flushes', r.total);
  ok(!hand(['H_4'])[0].is_suit('Spades'), 'shaymin sky: plain cards keep their suit');
  // A Death card turns it back.
  const death = add('c_death');
  const two = hand(['S_K', 'H_Q']);
  ok(act({ type: 'use', id: death.sort_id, targets: [two[0].sort_id, two[1].sort_id] }).ok && j.ability.extra.death_used === 1, 'shaymin sky: counts a Death used', j.ability.extra);
  winRound();
  ok(key(j) === 'j_poke_shaymin', 'shaymin sky -> shaymin after a Death', key(j));
  nextRound();
  ok(!hand(['H_2'], { center: 'm_poke_flower' })[0].is_suit('Spades'), 'land form: Flower cards are not Wild');
}

done();
