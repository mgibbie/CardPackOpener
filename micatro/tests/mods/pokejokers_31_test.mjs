// Pokermon pokejokers_31 (Ursaluna -> Dachsbun, + the unregistered Hisuian Qwilfish / Overqwil):
// every joker fired through real plays (act), plus each evolution.
//   node micatro/tests/mods/pokejokers_31_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { playing_card_joker_effects } from '../../js/engine/jokers.js';
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
  ok(j.ability.extra.mult === 2, 'ursaluna: +2 Mult per skipped pack (Pokermon 3.9.1 mult_mod)', j.ability.extra.mult);
  const item = G.consumeables.cards[0];
  ok(item && item.ability.set === 'Item' && item.edition && (item.edition.foil || item.edition.holo || item.edition.polychrome) && !item.edition.negative, 'ursaluna: a Foil / Holographic / Polychrome Item on skip (Pokermon 3.9.1)', item && [item.ability.set, item.edition]);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  r = play(hand(['S_A']));
  // (1 + 2) Mult, then the Item's edition (consumable editions score like jokers'): Foil +50 Chips / Holo +10 Mult / Poly X1.5.
  const e = item.edition;
  ok(r.total.mult === (e.holo ? 13 : e.polychrome ? 4.5 : 3) && r.total.chips === 16 + (e.foil ? 50 : 0), 'ursaluna: +2 Mult scored (Pokermon 3.9.1)', r.total);
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
  ok(G.GAME.poke_hazard_level === 1 && hazards() === 1 && G.playing_cards.length === 53 && G.hand.cards.filter((c) => has_enhancement(c, 'm_poke_hazard')).length === 1, 'tarountula: +1 Hazard layer -> 1 Hazard dealt into the first hand (Pokermon 3.9.1)', hazards());
  clearHand();
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_spidops' && G.hand.config.card_limit === 10 && G.GAME.poke_hazard_level === 1, 'tarountula evolves into spidops (+2 hand size, layer kept) (Pokermon 3.9.1)', [key(j), G.hand.config.card_limit]);
}
{
  start('SPIDOPS');
  const j = add('j_poke_spidops');
  ok(G.hand.config.card_limit === 10 && G.GAME.poke_hazard_level === 1, 'spidops: +2 hand size, +1 Hazard layer (Pokermon 3.9.1)');
  // every 8th playing card added gets a random seal ("Sticky Web!")
  const added = [];
  for (let i = 0; i < 8; i++) { const c = hand(['S_' + (2 + i)])[0]; added.push(c); playing_card_joker_effects([c]); }
  ok(added.slice(0, 7).every((c) => !c.seal) && added[7].seal && j.ability.extra.cards_added === 0, 'spidops: the 8th card added gets a seal', added.map((c) => c.seal || '-'));
  ok(j.ability.extra.card_goal === 8 && P_CENTERS.j_poke_spidops.blueprint_compat === false, 'spidops data (3.9.1)');
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
