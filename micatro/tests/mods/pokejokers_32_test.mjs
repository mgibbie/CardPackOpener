// Pokermon pokejokers_32 (Charcadet -> Wiglett): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_32_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { has_enhancement } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['charcadet', 'armarouge', 'ceruledge', 'tinkatink', 'tinkatuff', 'tinkaton', 'wiglett'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 7 pokejokers_32 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_32.lua'].length === 7, 'defs: 7 from pokejokers_32.lua');
const debuffed = () => G.playing_cards.filter((c) => c.debuff).length;

// ---------------------------------------------------------------- Charcadet -> Armarouge / Ceruledge
{
  start('CHARCADET');
  const j = add('j_poke_charcadet');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 && j.ability.extra.mult === 5, 'charcadet: +5 Mult after each hand', [r.total, j.ability.extra.mult]);
  r = play(hand(['S_A']));
  ok(r.total.mult === 6 && j.ability.extra.mult === 10, 'charcadet: scores the growing Mult', r.total);
  j.ability.extra.evolve = 'dawnstone';
  winRound();
  ok(key(j) === 'j_poke_armarouge', 'charcadet + Dawn Stone -> armarouge', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 3 && j.ability.extra.Xmult === 2, 'armarouge: X3, then -X1', [r.total, j.ability.extra.Xmult]);
  r = play(hand(['S_A']));
  ok(r.total.mult === 2 && j.ability.extra.Xmult === 1, 'armarouge: X2, then X1', [r.total, j.ability.extra.Xmult]);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 && j.ability.extra.Xmult === 1, 'armarouge: X1 scores nothing', r.total);
  winRound();
  ok(j.ability.extra.Xmult === 3, 'armarouge: resets to X3 at end of round', j.ability.extra.Xmult);
}
{
  start('CHARCADET2');
  const j = add('j_poke_charcadet');
  play(hand(['S_A']));
  winRound();
  ok(j.ability.extra.mult === 0, 'charcadet: Mult resets at end of round', j.ability.extra.mult);
  nextRound();
  j.ability.extra.evolve = 'duskstone';
  winRound();
  ok(key(j) === 'j_poke_ceruledge', 'charcadet + Dusk Stone -> ceruledge', key(j));
}
{
  start('CERULEDGE');
  const y = add('j_poke_yamper');
  const j = add('j_poke_ceruledge');
  const ys = y.sell_cost, js = j.sell_cost;
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 && near(j.ability.extra.Xmult, 1.75), 'ceruledge: X1 scores nothing, +X0.75 after the hand', [r.total, j.ability.extra.Xmult]);
  ok(y.sell_cost === ys - 1 && j.sell_cost === js + 1, 'ceruledge: drains $1 of sell value from another joker', [ys, y.sell_cost, js, j.sell_cost]);
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.75) && near(j.ability.extra.Xmult, 2.5), 'ceruledge: X1.75 scored', r.total);
  ok(y.sell_cost === 1, 'ceruledge: never drains below $1', y.sell_cost);
  winRound();
  ok(j.ability.extra.Xmult === 1, 'ceruledge: resets at end of round');
}

// ---------------------------------------------------------------- Tinkatink line
{
  start('TINKATINK', {}, { noBlind: true });
  const j = add('j_poke_tinkatink');
  act({ type: 'select_blind' });
  ok(debuffed() === 12, 'tinkatink: debuffs 12 cards on blind select', debuffed());
  clearHand();
  let r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 + 10, 'tinkatink: +5 Mult per played card', r.total);
  winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  act({ type: 'next_round' });
  ok(G.playing_cards.every((c) => !c.ability.debuff_sources || !Object.keys(c.ability.debuff_sources).length), 'tinkatink: debuffs reset at end of round');
  act({ type: 'select_blind' });
  ok(debuffed() === 12, 'tinkatink: new debuffs next blind', debuffed());
  clearHand();
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_tinkatuff', 'tinkatink evolves into tinkatuff', key(j));
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(debuffed() === 16, 'tinkatuff: debuffs 16 cards', debuffed());
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.mult === 11, 'tinkatuff: +10 Mult per played card', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_tinkaton', 'tinkatuff evolves into tinkaton', key(j));
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(debuffed() === 20, 'tinkaton: debuffs 20 cards', debuffed());
  // Selling it clears its debuffs (remove_from_deck).
  clearHand();
  act({ type: 'sell', id: j.sort_id });
  ok(G.playing_cards.every((c) => !c.ability.debuff_sources || !Object.keys(c.ability.debuff_sources).length), 'tinkaton sold: debuff sources cleared');
}
{
  start('TINKATON');
  add('j_poke_tinkaton'); // added after the blind: nothing debuffed
  const k = hand(['S_K'], { center: 'm_steel' })[0];
  ok(has_enhancement(k, 'm_glass') && has_enhancement(k, 'm_steel'), 'tinkaton: Steel cards are also Glass cards');
  const r = play([k]);
  // High card 5 + 10 chips; the card's (quantum) Glass X2 first, then Tinkaton's +15.
  ok(r.total.chips === 15 && r.total.mult === 2 + 15, 'tinkaton: played Steel card gives Glass X2 and +15 Mult', r.total);
  // Steel-Glass cards can shatter like Glass (1 in 4).
  let shattered = 0;
  for (let i = 0; i < 16 && !shattered; i++) {
    clearHand();
    const c = hand(['H_Q'], { center: 'm_steel' })[0];
    play([c]);
    if (c.shattered) shattered++;
  }
  ok(shattered === 1, 'tinkaton: a Steel card shattered as Glass', shattered);
  // Held Steel cards still give X1.5.
  clearHand();
  hand(['D_K'], { center: 'm_steel' });
  const r2 = play(hand(['S_A']));
  ok(near(r2.total.mult, (1 + 15) * 1.5), 'tinkaton: held Steel still X1.5', r2.total);
}

// ---------------------------------------------------------------- Wiglett
{
  start('WIGLETT');
  const j = add('j_poke_wiglett');
  let r = play(hand(['S_5', 'H_5', 'D_5']));
  ok(r.total.chips === 30 + 15 + 60 && r.total.mult === 3 + 4, 'wiglett: Three of a Kind with a 5 -> +60 Chips +4 Mult', r.total);
  r = play(hand(['S_6']));
  ok(r.total.chips === 5 + 6 + 60 && r.total.mult === 1, 'wiglett: a 5/6/7 -> +60 Chips', r.total);
  r = play(hand(['S_K', 'H_K', 'D_K']));
  ok(r.total.chips === 30 + 30 && r.total.mult === 3 + 4, 'wiglett: Three of a Kind -> +4 Mult', r.total);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 && r.total.chips === 16, 'wiglett: nothing otherwise', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_wugtrio', 'wiglett evolves into wugtrio', key(j));
}

done();
