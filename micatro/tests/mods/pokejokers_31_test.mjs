// Pokermon pokejokers_31 (Ursaluna -> Dachsbun, + the unregistered Hisuian Qwilfish / Overqwil):
// every joker fired through real plays (act), plus each evolution.
//   node micatro/tests/mods/pokejokers_31_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { has_enhancement } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

const FILE_JOKERS = ['ursaluna', 'hisuian_qwilfish', 'overqwil', 'tarountula', 'spidops', 'fidough', 'dachsbun'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 7 pokejokers_31 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_31.lua'].length === 7, 'defs: 7 from pokejokers_31.lua');
ok(P_CENTERS.j_poke_hisuian_qwilfish.stage === 'Basic' && P_CENTERS.j_poke_overqwil.stage === 'One' && P_CENTERS.j_poke_overqwil.rarity === 'poke_safari',
  'hisuian qwilfish / overqwil registered (overqwil stage One)');
const hazards = () => G.playing_cards.filter((c) => has_enhancement(c, 'm_poke_hazard')).length;

// ---------------------------------------------------------------- Ursaluna
{
  start('URSALUNA');
  const j = add('j_poke_ursaluna');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'ursaluna: +0 Mult scores nothing', r.total);
  winRound();
  act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const pack = G.shop_booster.cards[0];
  ok(act({ type: 'buy', id: pack.sort_id }).ok, 'bought a pack');
  ok(act({ type: 'skip_booster' }).ok, 'skipped the pack');
  ok(j.ability.extra.mult === 3, 'ursaluna: +3 Mult per skipped pack', j.ability.extra.mult);
  const item = G.consumeables.cards[0];
  ok(item && item.ability.set === 'Item' && item.edition && item.edition.polychrome, 'ursaluna: Polychrome Item on skip', item && [item.ability.set, item.edition]);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  r = play(hand(['S_A']));
  // (1 + 3) Mult, then the Polychrome Item's X1.5 (consumable editions score like jokers').
  ok(r.total.mult === 6, 'ursaluna: +3 Mult scored', r.total);
}

// ---------------------------------------------------------------- Hisuian Qwilfish -> Overqwil
{
  start('HQWIL', {}, { noBlind: true });
  const j = add('j_poke_hisuian_qwilfish');
  act({ type: 'select_blind' });
  ok(G.playing_cards.length === 57 && hazards() === 5, 'hisuian qwilfish: +1 Hazard per 10 cards (5)', [G.playing_cards.length, hazards()]);
  const drawn = G.hand.cards.filter((c) => has_enhancement(c, 'm_poke_hazard')).length;
  ok(j.ability.extra.chips === 5 * drawn, 'hisuian qwilfish: +5 Chips per Hazard drawn', [j.ability.extra.chips, drawn]);
  clearHand();
  j.ability.extra.chips = 30;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 46, 'hisuian qwilfish: chips scored', r.total);
  j.ability.extra.chips = 80;
  winRound();
  ok(key(j) === 'j_poke_overqwil' && j.ability.extra.chips === 80, 'hisuian qwilfish evolves into overqwil at 80 chips', [key(j), j.ability.extra.chips]);
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  act({ type: 'next_round' });
  const n0 = G.playing_cards.length, h0 = hazards();
  act({ type: 'select_blind' });
  const expect_add = Math.floor((n0 - h0) / 5);
  ok(G.playing_cards.length === n0 + expect_add, 'overqwil: +1 Hazard per 5 cards', [n0, G.playing_cards.length, expect_add]);
  const drawn2 = G.hand.cards.filter((c) => has_enhancement(c, 'm_poke_hazard')).length;
  ok(j.ability.extra.chips === 80 + 20 * drawn2, 'overqwil: +20 Chips per Hazard drawn', [j.ability.extra.chips, drawn2]);
  clearHand();
  j.ability.extra.chips = 100;
  const r2 = play(hand(['S_A']));
  const drawn3 = G.hand.cards.filter((c) => has_enhancement(c, 'm_poke_hazard')).length; // drawn after the hand
  ok(r2.total.chips === 116 && j.ability.extra.chips === 50 + 20 * drawn3, 'overqwil: scores its chips, then halves them', [r2.total, j.ability.extra.chips, drawn3]);
  ok(statusMsgs(r2.events).length >= 1, 'overqwil popups');
}

// ---------------------------------------------------------------- Tarountula -> Spidops
{
  start('TAROUNTULA', {}, { noBlind: true });
  const j = add('j_poke_tarountula');
  ok(G.hand.config.card_limit === 9, 'tarountula: +1 hand size');
  act({ type: 'select_blind' });
  ok(hazards() === 4 && G.playing_cards.length === 52, 'tarountula: 4 deck cards become Hazards', hazards());
  clearHand();
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_spidops' && G.hand.config.card_limit === 9, 'tarountula evolves into spidops (hand size kept)', [key(j), G.hand.config.card_limit]);
}
{
  start('SPIDOPS');
  const j = add('j_poke_spidops');
  ok(G.hand.config.card_limit === 9, 'spidops: +1 hand size');
  const hz = hand(['S_A', 'H_K'], { center: 'm_poke_hazard' });
  const r = play(hz);
  const sh = r.events.find((e) => e.type === 'scoring_hand').cards.length;
  ok(G.hand.config.card_limit === 9 + sh && G.GAME.round_resets.temp_handsize === sh, 'spidops: first hand all Hazards -> +1 hand size per scoring card this round', [G.hand.config.card_limit, sh]);
  play(hand(['S_2'], { center: 'm_poke_hazard' }));
  ok(G.hand.config.card_limit === 9 + sh, 'spidops: only the first hand counts');
  winRound(); act({ type: 'cash_out' });
  ok(G.hand.config.card_limit === 9, 'spidops: bonus hand size ends with the round', G.hand.config.card_limit);
  nextRound();
  play(hand(['S_A', 'H_A']));
  ok(G.hand.config.card_limit === 9, 'spidops: non-Hazard first hand -> nothing');
  ok(j.ability.extra.hazards === 4, 'spidops data');
}

// ---------------------------------------------------------------- Fidough -> Dachsbun
{
  start('FIDOUGH');
  const j = add('j_poke_fidough');
  ok(j.ability.extra.id === 2 && j.ability.extra.rank === '2', 'fidough: starts on the lowest rank in the deck', j.ability.extra);
  let r = play(hand(['S_A']));
  ok(j.ability.extra.chips === 0 && r.total.chips === 16, 'fidough: no 2 -> nothing', r.total);
  r = play(hand(['S_2', 'H_2']));
  ok(j.ability.extra.chips === 8 && j.ability.extra.id === 3 && r.total.chips === 10 + 4 + 8, 'fidough: +8 Chips, next rank up', [j.ability.extra, r.total]);
  r = play(hand(['S_3']));
  ok(j.ability.extra.chips === 16 && j.ability.extra.rank === '4', 'fidough: climbs again', j.ability.extra);
  winRound();
  ok(key(j) === 'j_poke_fidough', 'fidough: no Fire joker -> no evolution');
  nextRound();
  const fire = add('j_poke_charcadet');
  winRound();
  ok(key(j) === 'j_poke_dachsbun' && j.ability.extra.chips === 16 && j.ability.extra.rank === '4', 'fidough evolves with a Fire joker (keeps chips + rank)', [key(j), j.ability.extra]);
  nextRound();
  r = play(hand(['S_4']));
  // +10 + 2 per Fire joker (1)
  ok(j.ability.extra.chips === 28 && j.ability.extra.rank === '5', 'dachsbun: +10 Chips +2 per Fire joker', j.ability.extra);
  ok(r.total.chips === 5 + 4 + 28, 'dachsbun: chips scored', r.total);
  ok(fire.ability.extra.ptype === 'Fire', 'fire data');
}

done();
