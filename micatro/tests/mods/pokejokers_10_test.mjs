// Pokermon pokejokers_10 (Shroomish -> Nosepass): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_10_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS, act, clearHand } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['shroomish', 'breloom', 'azurill', 'nosepass'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 4 pokejokers_10 jokers ported');
// (+ 21 new in 3.9.1: new-jokers sub-batch 11, pokermon_391_new_11_test.mjs)
ok(STATUS.PORTED_FILES['pokemon/pokejokers_10.lua'].length === 25, 'defs: 25 from pokejokers_10.lua (4 + 21 new in 3.9.1)');

// ---------------------------------------------------------------- Shroomish / Breloom
/** Select the blind with the joker in play; -> which bonus it rolled. */
function blind_bonus(jkey, seed) {
  start(seed, {}, { noBlind: true });
  const j = add(jkey);
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards, s0 = G.hand.config.card_limit;
  act({ type: 'select_blind' });
  clearHand();
  const dh = G.GAME.current_round.hands_left - h0, dd = G.GAME.current_round.discards_left - d0, ds = G.hand.config.card_limit - s0;
  return { j, dh, dd, ds };
}
{
  const seen = new Set();
  for (let s = 0; s < 12 && seen.size < 3; s++) {
    const { dh, dd, ds } = blind_bonus('j_poke_shroomish', 'SHROOM' + s);
    const kind = dh === 1 && dd === 0 && ds === 0 ? 'hands' : dd === 1 && dh === 0 && ds === 0 ? 'discards' : ds === 1 && dh === 0 && dd === 0 ? 'size' : 'bad';
    ok(kind !== 'bad', 'shroomish: exactly one of +1 hand / +1 discard / +1 hand size', { dh, dd, ds });
    seen.add(kind);
    if (kind === 'size') {
      // temporary: the hand size bonus goes away at the end of the round
      const lim = G.hand.config.card_limit;
      winRound();
      ok(G.hand.config.card_limit === lim - 1, 'shroomish: hand size bonus is for this round only', G.hand.config.card_limit);
    }
  }
  ok(seen.size === 3, 'shroomish: all three bonuses roll over a few seeds', [...seen]);
}
{
  // Evolves after 2 Boss Blinds.
  start('SHROOMEVO');
  const j = add('j_poke_shroomish');
  winRound();
  ok(j.ability.extra.boss_defeated === 0, 'shroomish: small blind does not count', j.ability.extra.boss_defeated);
  nextRound();
  G.GAME.blind.boss = true;
  winRound();
  ok(j.ability.extra.boss_defeated === 1 && key(j) === 'j_poke_shroomish', 'shroomish: 1 boss defeated', j.ability.extra);
  nextRound();
  G.GAME.blind.boss = true;
  winRound();
  ok(key(j) === 'j_poke_breloom', 'shroomish -> breloom after 2 bosses', key(j));
}
{
  const seen = new Set();
  for (let s = 0; s < 12 && seen.size < 3; s++) {
    const { dh, dd, ds } = blind_bonus('j_poke_breloom', 'BRELOOM' + s);
    const kind = dh === 2 && dd === 0 && ds === 0 ? 'hands' : dd === 2 && dh === 0 && ds === 0 ? 'discards' : ds === 2 && dh === 0 && dd === 0 ? 'size' : 'bad';
    ok(kind !== 'bad', 'breloom: exactly one of +2 hands / +2 discards / +2 hand size', { dh, dd, ds });
    seen.add(kind);
  }
  ok(seen.size === 3, 'breloom: all three bonuses roll', [...seen]);
}

// ---------------------------------------------------------------- Azurill
{
  start('AZURILL');
  const j = add('j_poke_azurill');
  const r = play(hand(['S_A']));
  // High Card 5 + 11 = 16 chips, 1 Mult * 0.75
  ok(r.total.chips === 16 && r.total.mult === 0.75, 'azurill: X0.75 Mult', r.total);
  ok(!j.debuff, 'azurill alone (a Baby is rightmost) does not faint');
  winRound();
  const made = G.consumeables.cards.filter((c) => key(c) === 'c_heirophant');
  ok(made.length === 1 && made[0].edition && made[0].edition.negative, 'azurill: a Negative Hierophant at end of round', G.consumeables.cards.map(key));
  ok(key(j) === 'j_poke_azurill' && j.ability.extra.rounds === 1, 'azurill: 1 round left', j.ability.extra.rounds);
  nextRound();
  winRound();
  ok(key(j) === 'j_poke_marill', 'azurill -> marill after 2 rounds', key(j));
}
{
  // An adult to its right: it faints (debuffed for the rest of the round, no countdown).
  start('AZFAINT');
  const j = add('j_poke_azurill');
  add('j_poke_shroomish');
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 0.75 && j.debuff, 'azurill faints with a non-Baby to its right', { t: r2.total, d: j.debuff });
  winRound();
  ok(j.ability.extra.rounds === 2 && !G.consumeables.cards.length, 'fainted azurill: no Hierophant, no countdown', [j.ability.extra.rounds, G.consumeables.cards.length]);
}

// ---------------------------------------------------------------- Nosepass
{
  start('NOSEPASS');
  const j = add('j_poke_nosepass');
  const ks = hand(['S_K', 'H_K']);
  const r = play(ks);
  // Pair: 10 chips / 2 Mult. The first face card turns to Stone (50 chips), the other K scores 10;
  // the Stone card gives X2.5.
  ok(ks[0].config.center.key === 'm_stone' && ks[1].config.center.key === 'c_base', 'nosepass: first scoring face card -> Stone', [key(ks[0]), key(ks[1])]);
  ok(r.total.chips === 10 + 50 + 10 && r.total.mult === 2 * 2.5, 'nosepass: X2.5 on that card', r.total);
  ok(j.ability.extra.first === undefined, 'nosepass: target cleared after the hand');
  const r2 = play(hand(['S_A', 'H_A']));
  ok(r2.total.mult === 2, 'nosepass: no face card, nothing', r2.total);
  // Thunder Stone -> Probopass at the end of the round.
  const ts = add('c_poke_thunderstone');
  ok(act({ type: 'use', id: ts.sort_id, joker_targets: [j.sort_id] }).ok && j.ability.extra.evolve === true, 'thunder stone marks nosepass');
  winRound();
  ok(key(j) === 'j_poke_probopass', 'nosepass -> probopass with a Thunder Stone', key(j));
  nextRound();
  // Probopass: Stone cards are face cards and give X1.5.
  const st = hand(['S_A'], { center: 'm_stone' });
  const r3 = play(st);
  ok(st[0].is_face() && r3.total.mult === 1.5 && r3.total.chips === 5 + 50, 'probopass: Stone = face, X1.5', r3.total);
}

done();
