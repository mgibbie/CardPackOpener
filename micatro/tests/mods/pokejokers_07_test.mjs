// Pokermon pokejokers_07 (Ampharos -> Granbull): every one of the 33 jokers fired through real
// plays (act), plus each line's evolution.
//   node micatro/tests/mods/pokejokers_07_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { is_type, type_sticker_applied } from '../../mods/pokermon/systems/types.js';
import { has_enhancement, smods_debuff_card } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
const drop = (j) => { j.remove_from_deck(); G.jokers.remove_card(j); j.remove(); };

const FILE_JOKERS = ['ampharos', 'mega_ampharos', 'bellossom', 'marill', 'azumarill', 'sudowoodo', 'weird_tree', 'politoed', 'hoppip', 'skiploom',
  'jumpluff', 'aipom', 'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire', 'espeon', 'umbreon', 'murkrow', 'slowking', 'misdreavus', 'unown',
  'wobbuffet', 'girafarig', 'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'mega_steelix', 'snubbull', 'granbull'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 33 pokejokers_07 jokers ported',
  FILE_JOKERS.filter((n) => !STATUS.PORTED.jokers.includes('j_poke_' + n)));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_07.lua'].length === 33, 'defs: 33 from pokejokers_07.lua', STATUS.PORTED_FILES['pokemon/pokejokers_07.lua'].length);

// ---------------------------------------------------------------- Ampharos / Mega Ampharos
{
  start('AMPH');
  const j = add('j_poke_ampharos');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'ampharos: X1 does nothing', r.total);
  clearHand();
  const tgt = hand(['S_K']);
  const cr = add('c_cryptid');
  act({ type: 'use', id: cr.sort_id, targets: [tgt[0].sort_id] });
  ok(near(j.ability.extra.Xmult, 1.3), 'ampharos: +X0.3 per card added', j.ability.extra.Xmult);
  clearHand();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.3), 'ampharos: X1.3', r.total);
}
{
  start('MAMPH', {}, { noBlind: true });
  const j = add('j_poke_mega_ampharos');
  const deck = G.deck.cards.length;
  act({ type: 'select_blind' });
  ok(G.hand.config.card_limit === Math.ceil(deck / 2) && G.GAME.current_round.discards_left === 0 && G.GAME.current_round.hands_left === 1,
    'mega ampharos: hand size = half the deck, no discards, 1 hand', [G.hand.config.card_limit, G.GAME.current_round.discards_left, G.GAME.current_round.hands_left]);
  clearHand();
  j.ability.extra.Xmult = 3;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'mega ampharos: XMult', r.total);
  winRound();
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  ok(G.hand.config.card_limit === 8, 'mega ampharos: the hand-size boost is temporary', G.hand.config.card_limit);
}

// ---------------------------------------------------------------- Bellossom
{
  start('BELLO');
  add('j_poke_bellossom');
  let wild = 0, plus = 0;
  for (let i = 0; i < 8; i++) {
    const c = hand(['S_3']);
    const r = play(c);
    const became = key(c[0]) === 'm_wild';
    if (became) { wild++; ok(r.total.mult === 1 && r.total.chips === 8, 'bellossom: odd card became Wild (no Mult)', r.total); }
    else { plus++; ok(r.total.mult === 8 && r.total.chips === 8, 'bellossom: odd card gives +7 Mult', r.total); }
  }
  ok(wild > 0 && plus > 0, 'bellossom: both outcomes happen (coin flip)', [wild, plus]);
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'bellossom: even ranks do nothing', r.total);
  // Already Wild + converted -> gains an aura edition (Foil / Holo / Polychrome).
  let got = false;
  for (let i = 0; i < 10 && !got; i++) {
    const c = hand(['S_5'], { center: 'm_wild' });
    play(c);
    if (c[0].edition) got = c[0].edition.foil || c[0].edition.holo || c[0].edition.polychrome;
  }
  ok(got, 'bellossom: a Wild odd card gets Foil / Holo / Polychrome');
}

// ---------------------------------------------------------------- Marill / Azumarill
{
  start('MARILL');
  const j = add('j_poke_marill');
  let r = play(hand(['S_A', 'H_A'], {}).map((c, i) => { if (i === 0) c.set_ability(P_CENTERS.m_bonus, null, true); return c; }));
  ok(r.total.chips === 10 + 22 + 30 && r.total.mult === 2 * 2 && j.ability.extra.bonus_scored === 1, 'marill: X2 with an enhanced + unenhanced card; counts Bonus cards', [r.total, j.ability.extra]);
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2, 'marill: no X without an enhanced card', r.total);
  j.ability.extra.bonus_scored = 15;
  winRound();
  ok(key(j) === 'j_poke_azumarill', 'marill -> azumarill after 15 Bonus cards', key(j));
  nextRound();
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2 * 2, 'azumarill: X2', r.total);
  const b = hand(['S_A', 'H_A']);
  b[0].set_ability(P_CENTERS.m_bonus, null, true);
  r = play(b);
  ok(r.total.mult === 2 * 4, 'azumarill: X4 with a Bonus + non-Bonus card', r.total);
  const b2 = hand(['S_Q', 'H_Q']);
  b2[0].set_ability(P_CENTERS.m_bonus, null, true);
  smods_debuff_card(b2[0], true, 'test');
  r = play(b2);
  ok(r.total.mult === 2 * 2, 'azumarill: a debuffed Bonus card does not double it (Pokermon 3.9.1)', r.total);
}

// ---------------------------------------------------------------- Sudowoodo / Weird Tree
{
  start('SUDO');
  add('j_poke_sudowoodo');
  let r = play(hand(['S_K']));
  ok(r.total.chips === 5 + 10 + 10, 'sudowoodo: retriggers played face cards', r.total);
  hand(['H_K'], { center: 'm_steel' });
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.5 * 1.5), 'sudowoodo: retriggers held face cards (Steel King)', r.total);
}
{
  start('WTREE');
  const t = add('j_poke_weird_tree');
  ok(type_sticker_applied(t) === 'Grass' && is_type(t, 'Grass'), 'weird tree: starts with a Grass sticker', type_sticker_applied(t));
  winRound();
  ok(key(t) === 'j_poke_weird_tree', 'weird tree: stays while Grass and no Water', key(t));
  nextRound();
  add('j_poke_squirtle');
  winRound();
  ok(key(t) === 'j_poke_sudowoodo', 'weird tree -> sudowoodo with a Water type', key(t));
  ok(P_CENTERS.j_poke_weird_tree.in_pool(P_CENTERS.j_poke_weird_tree) === false, 'weird tree: out of the pool while Sudowoodo is owned');
}

// ---------------------------------------------------------------- Politoed
{
  start('POLI');
  const j = add('j_poke_politoed');
  // (the suit is set before each hand: it cycles after every hand in Pokermon's mod-level calculate)
  G.GAME.poke_poli_suit = 'Spades';
  // 1 Water joker (itself): the FIRST scoring Spade is retriggered 1 + 1 times, the second not at all.
  let r = play(hand(['S_A', 'S_A']));
  ok(r.total.chips === 10 + 11 * 3 + 11 && r.total.mult === 2, 'politoed: first scoring Spade retriggered 1 + 1 Water times (Pokermon 3.9.1)', r.total);
  G.GAME.poke_poli_suit = 'Hearts';
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11, 'politoed: other suits are not retriggered (Pokermon 3.9.1)', r.total);
  const sq = add('j_poke_squirtle');
  G.GAME.poke_poli_suit = 'Clubs';
  r = play(hand(['C_A']));
  ok(r.total.chips === 5 + 11 * 4 + sq.ability.extra.chips && r.total.mult === 1, 'politoed: 2 Water jokers -> the first Club retriggered 3 times, no Mult (Pokermon 3.9.1)', r.total);
  const lv = P_CENTERS.j_poke_politoed.loc_vars(P_CENTERS.j_poke_politoed, [], j);
  ok(lv.vars[0] === 1 && lv.vars[6] === 3, 'politoed: text shows 1 retrigger, 3 in all (Pokermon 3.9.1)', lv.vars);
}

// ---------------------------------------------------------------- Hoppip line
{
  start('HOPP');
  const j = add('j_poke_hoppip');
  ok(G.hand.config.card_limit === 9, 'hoppip +1 hand size');
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_skiploom' && G.hand.config.card_limit === 10, 'hoppip -> skiploom (+2 hand size)', [key(j), G.hand.config.card_limit]);
  nextRound();
  const d = hand(['S_2', 'S_4', 'S_6', 'S_8']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  const res = act({ type: 'discard' });
  ok(d.filter((c) => key(c) === 'm_wild').length === 3, 'skiploom: the first 3 discarded cards become Wild', d.map(key));
  ok(!G.jokers.cards.includes(j) && G.hand.config.card_limit === 8, 'skiploom: hops away after the discard', [G.jokers.cards.map(key), G.hand.config.card_limit]);
  ok(statusMsgs(res.events).some((m) => /Skip/i.test(m)), 'skiploom: "Skip!"', statusMsgs(res.events));
}
{
  start('HOPP2');
  const j = add('j_poke_hoppip');
  const d = hand(['S_2', 'S_4', 'S_6']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(d.filter((c) => key(c) === 'm_wild').length === 2 && !G.jokers.cards.includes(j), 'hoppip: first 2 discarded become Wild, then it leaves', d.map(key));
  const k = add('j_poke_jumpluff');
  ok(G.hand.config.card_limit === 11, 'jumpluff +3 hand size', G.hand.config.card_limit);
  clearHand();
  const d2 = hand(['H_2', 'H_4', 'H_6', 'H_8', 'H_T']);
  act({ type: 'highlight', ids: d2.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(d2.every((c) => key(c) === 'm_wild') && !G.jokers.cards.includes(k), 'jumpluff: every discarded card becomes Wild', d2.map(key));
}

// ---------------------------------------------------------------- Aipom
{
  start('AIPOM');
  const j = add('j_poke_aipom');
  const four = hand(['S_2', 'H_5', 'D_9', 'C_J']);
  act({ type: 'highlight', ids: four.map((c) => c.sort_id) });
  ok(!act({ type: 'play' }).ok && !act({ type: 'discard' }).ok, 'aipom: 4 cards can be neither played nor discarded');
  clearHand();
  let r = play(hand(['S_5', 'H_6', 'D_7']));
  ok(r.total.chips === 30 + 18 && r.total.mult === 4 && j.ability.extra.straights_played === 1, 'aipom: a 3-card Straight', [r.total, j.ability.extra]);
  r = play(hand(['H_2', 'H_9', 'H_K']));
  ok(r.total.chips === 35 + 21 && j.ability.extra.flushes_played === 1, 'aipom: a 3-card Flush', [r.total, j.ability.extra]);
  j.ability.extra.straights_played = 5; j.ability.extra.flushes_played = 4;
  winRound();
  ok(key(j) === 'j_poke_aipom', 'aipom: needs 5 straights and 5 flushes', key(j));
  nextRound();
  const s0 = G.GAME.starting_params.play_limit;
  drop(j);
  ok(G.GAME.starting_params.play_limit === s0 + 2 && G.GAME.starting_params.discard_limit === 5, 'aipom: limits restored when it leaves', G.GAME.starting_params);
  const j2 = add('j_poke_aipom');
  j2.ability.extra.straights_played = 5; j2.ability.extra.flushes_played = 5;
  winRound();
  ok(key(j2) === 'j_poke_ambipom', 'aipom -> ambipom', key(j2));
}

// ---------------------------------------------------------------- Sunkern / Sunflora
{
  start('SUNK', {}, { noBlind: true });
  const j = add('j_poke_sunkern');
  let d0 = G.GAME.dollars;
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === d0 + 1, 'sunkern: $1 when the blind is selected', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  play(hand(['S_A']));
  ok(G.GAME.dollars === d0 + 1, 'sunkern: $1 per hand played', G.GAME.dollars - d0);
  j.ability.extra.evolve = true; // what a Sun Stone sets
  winRound();
  ok(key(j) === 'j_poke_sunflora', 'sunkern -> sunflora with a Sun Stone', key(j));
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_sunflora');
  ok(row && row.dollars === 1, 'sunflora: $1 at cash-out', row);
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  d0 = G.GAME.dollars;
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === d0 + 1, 'sunflora: $1 on blind select', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  const dd = hand(['S_2']);
  act({ type: 'highlight', ids: [dd[0].sort_id] }); act({ type: 'discard' });
  ok(G.GAME.dollars === d0 + 1, 'sunflora: $1 per discard', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  const merc = add('c_mercury');
  act({ type: 'use', id: merc.sort_id });
  ok(G.GAME.dollars === d0 + 1, 'sunflora: $1 per consumable used', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  clearHand();
  play(hand(['S_A']));
  ok(G.GAME.dollars === d0 + 1, 'sunflora: $1 per hand', G.GAME.dollars - d0);
}

// ---------------------------------------------------------------- Yanma
{
  start('YANMA');
  const j = add('j_poke_yanma');
  G.GAME.probabilities.normal = 1e-9;
  let r = play(hand(['S_3', 'H_3']));
  ok(r.total.chips === 10 + 6 + 12 && r.total.mult === 2 + 6 && j.ability.extra.scored === 2, 'yanma: 3s and 6s give +6 chips +3 Mult', [r.total, j.ability.extra]);
  G.GAME.probabilities.normal = 1000;
  r = play(hand(['S_6']));
  ok(r.total.chips === 5 + 6 + 12 && r.total.mult === 1 + 6, 'yanma: +12 chips +6 Mult on the 1 in 3', r.total);
  j.ability.extra.scored = 36;
  winRound();
  ok(key(j) === 'j_poke_yanmega', 'yanma -> yanmega after 36 scored', key(j));
}

// ---------------------------------------------------------------- Wooper / Quagsire
{
  start('WOOP');
  const j = add('j_poke_wooper');
  const faces = () => G.deck.cards.filter((c) => c.is_face()).length;
  let f = faces();
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + Math.max(0, 15 - f) || (15 - f <= 0 && r.total.mult === 1), 'wooper: +15 Mult -1 per face card in deck', [r.total, f]);
  // Remove faces from the deck to make it count.
  for (const c of G.deck.cards.filter((x) => x.is_face()).slice(0, 8)) { G.deck.remove_card(c); G.discard.emplace(c); }
  f = faces();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + (15 - f), 'wooper: fewer faces -> more Mult', [r.total, f]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_quagsire', 'wooper -> quagsire', key(j));
  nextRound();
  f = faces();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + Math.max(0, 25 - f) || (25 - f <= 0 && r.total.mult === 1), 'quagsire: +25 Mult -1 per face in deck', [r.total, f]);
}

// ---------------------------------------------------------------- Espeon
{
  start('ESPEON');
  const scry0 = G.GAME.scry_amount || 0;
  const j = add('j_poke_espeon');
  ok(G.GAME.scry_amount === scry0 + 2, 'espeon: +2 Foresight (Pokermon 3.9.1)', G.GAME.scry_amount);
  const suit = G.GAME.current_round.espeon_suit;
  // The top of the deck is its last card: put a card of the round's suit there, then one of another suit.
  const toTop = (pred) => { const i = G.deck.cards.findIndex(pred); G.deck.cards.push(G.deck.cards.splice(i, 1)[0]); };
  toTop((c) => c.base.suit === suit);
  let r = play(hand([suit === 'Spades' ? 'H_2' : 'S_2']));
  ok(near(r.total.mult, 2.5), 'espeon: X2.5 when the top card of the deck is the suit of the round (Pokermon 3.9.1)', [suit, r.total]);
  toTop((c) => c.base.suit !== suit);
  r = play(hand([SUIT[suit] + '_2']));
  ok(r.total.mult === 1, 'espeon: nothing when the top card is another suit, even playing the suit (Pokermon 3.9.1)', r.total);
  drop(j);
  ok(G.GAME.scry_amount === scry0, 'espeon: Foresight removed with it (Pokermon 3.9.1)', G.GAME.scry_amount);
}

// ---------------------------------------------------------------- Umbreon
{
  start('UMBRE');
  const j = add('j_poke_umbreon');
  ok(G.GAME.hands[j.ability.extra.hand_played] && G.GAME.hands[j.ability.extra.hand_played].visible, 'umbreon: picks a visible hand', j.ability.extra.hand_played);
  j.ability.extra.hand_played = 'Pair';
  const lvl = G.GAME.hands.Pair.level;
  const d = hand(['S_A']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.GAME.hands.Pair.level === lvl + 1 && !G.playing_cards.includes(d[0]), 'umbreon: a 1-card first discard is destroyed and levels up its hand (Pokermon 3.9.1)', [G.GAME.hands.Pair.level, G.playing_cards.includes(d[0])]);
  const d2 = hand(['S_K']);
  act({ type: 'highlight', ids: d2.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.GAME.hands.Pair.level === lvl + 1 && G.playing_cards.includes(d2[0]), 'umbreon: only the first discard of the round (Pokermon 3.9.1)', G.GAME.hands.Pair.level);
  play(hand(['S_2']));
  ok(j.ability.extra.hand_played === 'Two Pair', 'umbreon: hand cycles after scoring (Pokermon 3.9.1)', j.ability.extra.hand_played);
}
{
  start('UMBRE2');
  const j = add('j_poke_umbreon');
  j.ability.extra.hand_played = 'Flush';
  const lvl = G.GAME.hands.Flush.level;
  const d = hand(['S_A', 'H_A']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.GAME.hands.Flush.level === lvl && d.every((c) => G.playing_cards.includes(c)), 'umbreon: a 2-card first discard does nothing (Pokermon 3.9.1)', G.GAME.hands.Flush.level);
}

// ---------------------------------------------------------------- Murkrow
{
  start('MURK');
  const j = add('j_poke_murkrow');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1.5, 'murkrow: X(1 + 0.5 per Dark type) (itself)', r.total);
  add('j_poke_umbreon');
  r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'murkrow: 2 Dark types -> X2', r.total);
  j.ability.extra.evolve = true; // Dusk Stone
  winRound();
  ok(key(j) === 'j_poke_honchkrow', 'murkrow -> honchkrow with a Dusk Stone', key(j));
}

// ---------------------------------------------------------------- Slowking
{
  start('SLOWK');
  const j = add('j_poke_slowking');
  let r = play(hand(['S_K']));
  ok(near(r.total.mult, 1.2) && near(j.ability.extra.Xmult_multi, 1.2), 'slowking: Kings X1.2 after the first hand', r.total);
  r = play(hand(['S_K', 'H_K']));
  ok(near(r.total.mult, 2 * 1.4 * 1.4), 'slowking: grows X0.2 per hand', r.total);
  winRound();
  ok(j.ability.extra.Xmult_multi === 1, 'slowking: resets at end of round', j.ability.extra);
}

// ---------------------------------------------------------------- Misdreavus
{
  start('MISD');
  const j = add('j_poke_misdreavus');
  const k = hand(['S_K']);
  let r = play(k);
  ok(r.total.chips === 5 + 10 + 5 && j.ability.extra.chips === 5 && k[0].get_chip_bonus() === 5, 'misdreavus: face cards permanently lose 5 chips to it', [r.total, j.ability.extra, k[0].get_chip_bonus()]);
  const q = hand(['S_Q'], { center: 'm_bonus' });
  q[0].ability.nominal_drain = 8; // already drained to 2: the next 1 from the rank, the other 4 from Bonus
  r = play(q);
  ok(j.ability.extra.chips === 10 && q[0].ability.nominal_drain === 9 && q[0].ability.perma_bonus === -4, 'misdreavus: drains the bonus once the rank is at 1', [j.ability.extra, q[0].ability]);
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_mismagius', 'misdreavus -> mismagius with a Dusk Stone', key(j));
}

// ---------------------------------------------------------------- Unown
{
  start('UNOWN');
  const u = add('j_poke_unown');
  const u2 = add('j_poke_unown');
  ok(u.ability.extra.form !== u2.ability.extra.form, 'unown: two Unown never share a form', [u.ability.extra.form, u2.ability.extra.form]);
  const t = u.ability.extra.targets[0];
  ok(typeof t.id === 'number' && t.id >= 2 && t.id <= 14, 'unown: a random target rank', t);
  drop(u2);
  let r = play(hand(['S_' + CODE[t.id]]));
  ok(r.total.mult === 1 + 6, 'unown: +6 Mult with its rank scoring', r.total);
  r = play(hand(['S_' + CODE[t.id === 2 ? 3 : 2]]));
  ok(r.total.mult === 1, 'unown: nothing otherwise', r.total);
  ok(u.sell_cost === 0, 'unown sells for $0', u.sell_cost);
  const w = winRound();
  ok(!G.jokers.cards.includes(u), 'unown flees at end of round', G.jokers.cards.map(key));
  ok(statusMsgs(w.events).some((m) => /flee/i.test(m)), 'unown: "Fled!"', statusMsgs(w.events));
}

// ---------------------------------------------------------------- Wobbuffet
{
  start('WOBB', {}, { noBlind: true });
  add('j_poke_wobbuffet');
  const cat = add('j_poke_caterpie');
  act({ type: 'select_blind' }); clearHand();
  ok(cat.ability.eternal === true, 'wobbuffet: rightmost joker becomes Eternal on blind select', cat.ability);
  const r = play(hand(['S_7', 'H_7']));
  ok(r.total.chips === 10 + 28, 'wobbuffet: retriggers 6-10s', r.total);
}

// ---------------------------------------------------------------- Girafarig
{
  start('GIRA');
  const j = add('j_poke_girafarig');
  let r = play(hand(['S_K', 'H_K', 'S_Q', 'H_Q']));
  ok(r.total.chips === 20 + 40 && r.total.mult === 2 * 2 * 2, 'girafarig: Two Pair -> first and last face card X2', r.total);
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2, 'girafarig: only with Two Pair', r.total);
  clearHand();
  const fc = hand(['S_J', 'H_Q']);
  const death = add('c_death');
  ok(act({ type: 'use', id: death.sort_id, targets: fc.map((c) => c.sort_id) }).ok && j.ability.extra.death_used === 1, 'girafarig: Death on 2 face cards', j.ability.extra);
  clearHand();
  winRound();
  ok(key(j) === 'j_poke_farigiraf', 'girafarig -> farigiraf', key(j));
}

// ---------------------------------------------------------------- Pineco / Forretress
{
  start('PINECO');
  const j = add('j_poke_pineco');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 120 && j.debuff, 'pineco: +120 chips then faints', [r.total, j.debuff]);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'pineco: fainted for the rest of the round', r.total);
  j.ability.extra.rounds = 1;
  winRound(); // fainted: no countdown this round
  ok(j.ability.extra.rounds === 1, 'pineco: no countdown in a round it fainted', j.ability.extra);
  nextRound();
  ok(!j.debuff, 'pineco: back next round', j.debuff);
  const cat = add('j_poke_caterpie');
  G.jokers.cards.splice(G.jokers.cards.indexOf(cat), 1); G.jokers.cards.unshift(cat); // pineco no longer leftmost -> no explosion
  winRound();
  ok(key(j) === 'j_poke_forretress', 'pineco -> forretress', key(j));
  drop(cat);
  nextRound();
  hand(['H_2'], { center: 'm_steel' });
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 300 && near(r.total.mult, 1.5), 'forretress: +150 chips, doubled with a Steel card held', r.total);
}
{
  start('PINE2');
  add('j_poke_caterpie');
  const p = add('j_poke_pineco');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 && !p.debuff, 'pineco: volatile left — inactive when not leftmost', r.total);
}

// ---------------------------------------------------------------- Dunsparce
{
  start('DUNS');
  const j = add('j_poke_dunsparce');
  winRound(); act({ type: 'cash_out' });
  act({ type: 'next_round' });
  ok(G.jokers.cards.includes(j), 'dunsparce: stays without a reroll');
  act({ type: 'select_blind' }); clearHand();
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 50;
  act({ type: 'reroll_shop' });
  ok(j.ability.extra.rerolled === true, 'dunsparce: notices the reroll');
  act({ type: 'next_round' });
  ok(!G.jokers.cards.includes(j), 'dunsparce: leaves at end of shop after a reroll', G.jokers.cards.map(key));
  start('DUNS2');
  const k = add('j_poke_dunsparce');
  k.ability.extra.rounds = 1;
  winRound();
  ok(key(k) === 'j_poke_dudunsparce', 'dunsparce -> dudunsparce', key(k));
}

// ---------------------------------------------------------------- Gligar
{
  start('GLIG');
  const j = add('j_poke_gligar');
  const s = SUIT[G.GAME.current_round.gligar_suit];
  hand([s + '_2', s + '_3']);
  const r = play(hand(['S_A', 'H_A']));
  ok(near(r.total.mult, 2 * 1.3 * 1.3), 'gligar: each played card X(1 + 0.15 per held card of the suit)', [r.total, s]);
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_gliscor', 'gligar -> gliscor with a Dusk Stone', key(j));
}

// ---------------------------------------------------------------- Steelix / Mega Steelix
{
  start('STEEL');
  const sx = add('j_poke_steelix');
  const st = hand(['H_4'], { center: 'm_stone' });
  ok(key(st[0]) === 'm_stone' && has_enhancement(st[0], 'm_steel'), 'steelix: Stone cards are also Steel (quantum) (Pokermon 3.9.1)', key(st[0]));
  const p = hand(['S_A']);
  const r = play(p);
  ok(near(r.total.mult, 1.5) && key(p[0]) === 'c_base', 'steelix: a held Stone card gives Steel X1.5; played cards stay unenhanced (Pokermon 3.9.1)', r.total);
  const deckStones = () => G.deck.cards.filter((c) => key(c) === 'm_stone').length;
  clearHand();
  const d0 = deckStones();
  const tgt = hand(['S_K', 'D_4']);
  tgt[1].set_ability(P_CENTERS.m_stone, null, true);
  const hm = add('c_hanged_man');
  act({ type: 'use', id: hm.sort_id, targets: tgt.map((c) => c.sort_id) });
  G.E_MANAGER.flush();
  ok(deckStones() === d0 + 1, 'steelix: destroying a non-Stone card adds a Stone card to the deck, a Stone card adds none (Pokermon 3.9.1)', [d0, deckStones()]);
  drop(sx);
  ok(!has_enhancement(st[0], 'm_steel'), 'steelix: the quantum Steel goes with it', key(st[0]));
}
{
  start('MSTEEL'); // (held on its 3.2.1 behaviour: needs quantum Hazard scoring, batch 10)
  add('j_poke_mega_steelix');
  const st = hand(['S_4'], { center: 'm_steel' });
  play(hand(['S_A']));
  ok(st[0].base.suit === 'Diamonds' && key(st[0]) === 'c_base', 'mega steelix: held non-Diamond Steel -> Diamond, enhancement lost', [st[0].base.suit, key(st[0])]);
  winRound();
  const n = G.playing_cards.filter((c) => c.is_suit('Diamonds')).length;
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_mega_steelix');
  ok(row && row.dollars === n, 'mega steelix: $1 per Diamond in the deck', [row, n]);
}

// ---------------------------------------------------------------- Snubbull / Granbull
{
  start('SNUB');
  const j = add('j_poke_snubbull');
  let r = play(hand(['S_K', 'H_K']));
  ok(near(r.total.mult, 2 * 1.75), 'snubbull: first face card X1.75', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_granbull', 'snubbull -> granbull', key(j));
  nextRound();
  r = play(hand(['S_K', 'H_K']));
  ok(near(r.total.mult, 2 * 2.25), 'granbull: first face X2.25', r.total);
  r = play(hand(['S_Q', 'H_Q']));
  ok(near(r.total.mult, 2 * 2.5), 'granbull: X2.5 if it is a Queen', r.total);
}

done();
