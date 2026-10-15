// Pokermon pokejokers_15 (Ambipom -> Lucario): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_15_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { get_poker_hand_info } from '../../js/engine/run.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
/** Put a deck card of this rank id on top of the deck (the scry view shows the top). */
function toTop(id) {
  const c = G.deck.cards.find((x) => x.get_id() === id && x.config.center.key === 'c_base');
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
}

const FILE_JOKERS = ['ambipom', 'buneary', 'lopunny', 'mega_lopunny', 'mismagius', 'honchkrow', 'bonsly', 'mimejr', 'happiny', 'munchlax', 'riolu', 'lucario'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 12 pokejokers_15 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_15.lua'].length === 12, 'defs: 12 from pokejokers_15.lua');

// ---------------------------------------------------------------- Ambipom
{
  start('AMBIPOM');
  let r = play(hand(['S_2', 'S_5', 'S_9']));
  ok(r.total.chips === 5 + 9, 'without ambipom 3 Spades are a High Card', r.total);
  add('j_poke_ambipom');
  r = play(hand(['S_2', 'S_5', 'S_9']));
  ok(r.total.chips === 35 + 16 && r.total.mult === 4, 'ambipom: a 3-card Flush', r.total);
  r = play(hand(['S_4', 'H_5', 'D_6']));
  ok(r.total.chips === 30 + 15 && r.total.mult === 4, 'ambipom: a 3-card Straight', r.total);
}

// ---------------------------------------------------------------- Buneary / Lopunny / Mega Lopunny
{
  start('BUNEARY');
  const j = add('j_poke_buneary');
  let r = play(hand(['S_A', 'H_2', 'D_5']));
  ok(r.total.mult === 1 + 6, 'buneary: +3 Mult per unscored card', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_lopunny' && G.GAME.scry_amount === 2, 'buneary -> lopunny after 4 rounds (scry 2)', [key(j), G.GAME.scry_amount]);
  nextRound();
  toTop(9); toTop(7);
  ok(G.scry_view.cards.map((c) => c.get_id()).join() === '7,9', 'lopunny: sees the top 2 cards', G.scry_view.cards.map((c) => c.get_id()));
  r = play(hand(['S_A', 'H_3']));
  ok(r.total.mult === 1 + 5, 'lopunny: +5 Mult per unscored card', r.total);
  toTop(7);
  r = play(hand(['S_A', 'H_7']));
  ok(r.total.mult === (1 + 5) * 2 && statusMsgs(r.events).some((m) => /Kick/i.test(m)), 'lopunny: X2 when an unscored rank is in the scry', [r.total, statusMsgs(r.events)]);
  j.remove();
  ok(G.GAME.scry_amount === 0, 'lopunny removed: scry back to 0');
}
{
  start('MLOPUNNY');
  add('j_poke_mega_lopunny');
  ok(G.GAME.scry_amount === 5, 'mega lopunny: scry 5');
  const { text } = get_poker_hand_info(G.scry_view.cards);
  G.GAME.hands[text].level = 3;
  const r = play(hand(['S_2']));
  ok(r.total.mult === G.GAME.hands['High Card'].mult * 3, 'mega lopunny: X the level of the scry cards\' hand', { r: r.total, text });
}

// ---------------------------------------------------------------- Mismagius
{
  start('MISMAG');
  const j = add('j_poke_mismagius');
  G.GAME.probabilities.normal = 0; // never the 1 in 4
  const k = hand(['S_K']);
  let r = play(k);
  // The King scores its 10 first; Mismagius then drains 5 and plays +5
  ok(r.total.chips === 5 + 10 + 5 && j.ability.extra.chips === 5 && k[0].ability.nominal_drain === 5, 'mismagius: drains 5 chips from a scored face card', [r.total, j.ability.extra, k[0].ability]);
  G.hand.emplace(G.discard.cards.splice(G.discard.cards.indexOf(k[0]), 1)[0]);
  r = play(k);
  // the King now scores 5; can drain 4 more from its rank (down to 1)
  ok(r.total.chips === 5 + 5 + 9 && j.ability.extra.chips === 9 && k[0].ability.nominal_drain === 9, 'mismagius: never below 1 chip of rank', [r.total, j.ability.extra, k[0].ability]);
  const bonus = hand(['S_Q'], { center: 'm_bonus' });
  bonus[0].ability.nominal_drain = 9;
  play(bonus);
  ok(j.ability.extra.chips === 14 && bonus[0].ability.perma_bonus === -5, 'mismagius: then drains bonus chips', [j.ability.extra, bonus[0].ability.perma_bonus]);
  play(hand(['S_A']));
  ok(j.ability.extra.chips === 14, 'mismagius: only face cards');
  G.GAME.probabilities.normal = 1000;
  const q = hand(['H_Q']);
  play(q);
  ok(q[0].ability.perma_bonus === 20 && j.ability.extra.chips === 14, 'mismagius: 1 in 4: the face card gains 20 chips instead', q[0].ability);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Honchkrow
{
  start('HONCH');
  add('j_poke_honchkrow');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1.5, 'honchkrow: X1.5 for itself (Dark)', r.total);
  add('j_poke_absol');
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5 * 2 * 1.5), 'honchkrow: X1.5 for every Dark joker', r.total);
  add('j_poke_aron');
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5 * 2 * 1.5), 'honchkrow: not for other types', r.total);
}

// ---------------------------------------------------------------- Baby Pokémon
{
  start('BONSLY');
  const j = add('j_poke_bonsly');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.75, 'bonsly: X0.75', r.total);
  const wc = hand(['S_2']);
  const n0 = G.playing_cards.length;
  winRound(wc);
  const made = G.playing_cards[G.playing_cards.length - 1];
  ok(G.playing_cards.length === n0 + 1 && made.is_face() && ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_lucky'].includes(key(made)) && G.deck.cards.includes(made),
    'bonsly: an enhanced face card into the deck at end of round', [made.base.value, key(made)]);
  nextRound(); winRound();
  ok(key(j) === 'j_poke_sudowoodo', 'bonsly -> sudowoodo after 2 rounds', key(j));
}
{
  start('MIMEJR');
  const j = add('j_poke_mimejr');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.5, 'mime jr: X0.5', r.total);
  const seals = () => G.playing_cards.filter((c) => c.seal === 'Red' || c.seal === 'Blue').length;
  const s0 = seals();
  const w = winRound();
  ok(seals() === s0 + 1, 'mime jr: a Red or Blue Seal on a random card', seals());
  ok(statusMsgs(w.events).length > 0);
  nextRound(); winRound();
  ok(key(j) === 'j_poke_mrmime', 'mime jr -> mr mime after 2 rounds', key(j));
}
{
  start('HAPPINY');
  const j = add('j_poke_happiny');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.5, 'happiny: X0.5', r.total);
  G.GAME.probabilities.normal = 1000;
  winRound();
  const m = G.consumeables.cards.filter((c) => key(c) === 'c_magician' && c.edition && c.edition.negative);
  ok(m.length === 2, 'happiny: a Negative Magician (+1 more 1 in 3)', G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 0;
  nextRound(); winRound();
  ok(G.consumeables.cards.filter((c) => key(c) === 'c_magician').length === 3 && key(j) === 'j_poke_chansey', 'happiny: just 1 on a miss; -> chansey after 2 rounds', key(j));
  G.GAME.probabilities.normal = 1;
}
{
  start('MUNCHLAX');
  const j = add('j_poke_munchlax');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.5, 'munchlax: X0.5', r.total);
  winRound();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item' && G.consumeables.cards[0].edition.negative, 'munchlax: a Negative Item at end of round', G.consumeables.cards.map(key));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_snorlax', 'munchlax -> snorlax after 2 rounds', key(j));
}
{
  start('RIOLU');
  const j = add('j_poke_riolu');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 0.9), 'riolu: X0.9', r.total);
  winRound();
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_aura', 'riolu: an Aura at end of round', G.consumeables.cards.map(key));
  nextRound();
  G.consumeables.config.card_limit = 1;
  winRound();
  ok(G.consumeables.cards.length === 1 && key(j) === 'j_poke_lucario', 'riolu: needs room; -> lucario after 2 rounds', [G.consumeables.cards.length, key(j)]);
  nextRound();
  const held = hand(['H_K', 'D_K']);
  held[0].set_edition({ foil: true }, true);
  held[1].set_edition({ holo: true }, true);
  hand(['C_9']);
  const r2 = play(hand(['S_A']));
  ok(near(r2.total.mult, 1.69), 'lucario: X1.3 per editioned card held', r2.total);
}

done();
