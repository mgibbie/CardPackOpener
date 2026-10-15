// Pokermon pokejokers_12 (Feebas -> Wynaut): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_12_test.mjs
import { T, start, hand, add, play, winRound, nextRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { probability_vars } from '../../js/engine/core.js';
import { pseudorandom_probability, get_probability_vars } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
/** Play the round's LAST hand (hands_left reaches 0) and win with it. */
function lastHand(cards) {
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}

const FILE_JOKERS = ['feebas', 'milotic', 'duskull', 'dusclops', 'absol', 'wynaut'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 6 pokejokers_12 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_12.lua'].length === 6, 'defs: 6 from pokejokers_12.lua');

// ---------------------------------------------------------------- Feebas / Milotic
{
  start('FEEBAS');
  const j = add('j_poke_feebas');
  const r = play(hand(['S_A', 'H_2']));
  // Splash: both cards score. High Card 5 + 11 + 2; 1 + 1 Mult
  ok(r.total.chips === 18 && r.total.mult === 2, 'feebas: +1 Mult and Splash', r.total);
  j.ability.extra.evolve = true; // (what the Prism Scale sets)
  winRound();
  ok(key(j) === 'j_poke_milotic', 'feebas -> milotic with a Prism Scale', key(j));
  nextRound();
  let r2 = play(hand(['S_A', 'S_K']));
  // High Card: only the Ace scores -> mono-suit; retriggered: 5 + 11 + 11
  ok(r2.total.chips === 27 && !j.ability.extra.active, 'milotic: retriggers a mono-suit scoring hand', r2.total);
  r2 = play(hand(['S_A', 'H_A']));
  ok(r2.total.chips === 32, 'milotic: mixed suits, no retrigger', r2.total);
  r2 = play(hand(['S_2', 'S_5', 'S_8', 'S_T', 'S_Q']));
  // Flush 35 + (2+5+8+10+10) * 2
  ok(r2.total.chips === 35 + 70, 'milotic: a Flush is retriggered', r2.total);
}

// ---------------------------------------------------------------- Duskull / Dusclops / Dusknoir
{
  start('DUSKULL');
  const j = add('j_poke_duskull');
  let r = play(hand(['S_2', 'H_2', 'D_2', 'C_2', 'S_K']));
  ok(r.total.chips === 60 + 8, 'duskull: no retrigger before the final hand', r.total);
  r = lastHand(hand(['S_2', 'H_2', 'D_2', 'C_2', 'S_K']));
  // Four of a Kind 60 + 4 * 2, first 4 retriggered: + 8
  ok(r.total.chips === 60 + 16, 'duskull: retriggers the first 4 scored cards of the final hand', r.total);
  ok(j.ability.extra.rounds === 4, 'duskull: counting down', j.ability.extra.rounds);
  for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_dusclops', 'duskull -> dusclops after 5 rounds', key(j));
  nextRound();
  const n0 = G.playing_cards.length;
  const k = hand(['S_K']);
  r = lastHand(hand(['S_3', 'H_3', 'D_3', 'C_3']).concat(k));
  ok(r.total.chips === 60 + 24, 'dusclops: retriggers the first 4', r.total);
  ok(!G.playing_cards.includes(k[0]) && G.playing_cards.length === n0 + 4, 'dusclops: destroys the single unscored card', G.playing_cards.length - n0);
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'dusclops: ... and makes a Spectral card', G.consumeables.cards.map(key));
  j.ability.extra.evolve = true; // (Linking Cord)
  nextRound();
  winRound();
  ok(key(j) === 'j_poke_dusknoir', 'dusclops -> dusknoir with a Linking Cord', key(j));
  nextRound();
  r = lastHand(hand(['S_4', 'H_4', 'D_4', 'C_4', 'S_5']));
  ok(r.total.chips === 60 + 16 + 16, 'dusknoir: retriggers every scored card of the final hand', r.total);
}

// ---------------------------------------------------------------- Absol
{
  start('ABSOL');
  add('j_poke_absol');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'absol: X2 Mult', r.total);
  ok(probability_vars(null, 1, 4)[0] === 0 && get_probability_vars(null, 1, 4)[0] === 0, 'absol: listed probabilities are 0', [probability_vars(null, 1, 4), get_probability_vars(null, 1, 4)]);
  G.GAME.probabilities.normal = 1000;
  let any = false;
  for (let i = 0; i < 20; i++) any = any || pseudorandom_probability(null, 'absol_t' + i, 1, 2);
  ok(!any, 'absol: a 1000-in-2 roll never hits');
  r = play(hand(['S_K'], { center: 'm_lucky' }));
  ok(r.total.mult === 2, 'absol: Lucky cards never trigger', r.total);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Wynaut
{
  start('WYNAUT');
  const j = add('j_poke_wynaut');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.75, 'wynaut: X0.75 Mult', r.total);
  winRound();
  const f = G.consumeables.cards.filter((c) => key(c) === 'c_fool');
  ok(f.length === 1 && f[0].edition && f[0].edition.negative, 'wynaut: a Negative Fool at end of round', G.consumeables.cards.map(key));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_wobbuffet', 'wynaut -> wobbuffet after 2 rounds', key(j));
}

done();
