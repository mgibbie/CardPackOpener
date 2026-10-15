// Pokermon pokejokers_16 (Mantyke -> the Rotom forms): every joker fired through real plays (act),
// plus each evolution.
//   node micatro/tests/mods/pokejokers_16_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS, act, clearHand, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { probability_vars } from '../../js/engine/core.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
/** Discard exactly these hand cards. */
function discard(cards) {
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  return act({ type: 'discard' });
}
const toShop = () => { winRound(); act({ type: 'cash_out' }); };

const FILE_JOKERS = ['mantyke', 'weavile', 'magnezone', 'lickilicky', 'rhyperior', 'tangrowth', 'electivire', 'magmortar', 'togekiss', 'yanmega',
  'leafeon', 'glaceon', 'gliscor', 'mamoswine', 'porygonz', 'probopass', 'dusknoir', 'froslass', 'rotom', 'rotomh', 'rotomw', 'rotomf', 'rotomfan', 'rotomm'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 24 pokejokers_16 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_16.lua'].length === 24, 'defs: 24 from pokejokers_16.lua');

// ---------------------------------------------------------------- Mantyke
{
  start('MANTYKE');
  const j = add('j_poke_mantyke');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.75, 'mantyke: X0.75', r.total);
  winRound();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_devil' && c.edition && c.edition.negative), 'mantyke: a Negative Devil at end of round', G.consumeables.cards.map(key));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_mantine', 'mantyke -> mantine after 2 rounds', key(j));
}

// ---------------------------------------------------------------- Weavile
{
  start('WEAVILE');
  const j = add('j_poke_weavile');
  const id = G.GAME.current_round.sneaselcard.id;
  const d0 = G.GAME.dollars;
  const one = hand(['S_' + CODE[id]]);
  let r = play(one);
  ok(r.total.mult === 1 && j.ability.extra.Xmult === 2 && G.GAME.dollars === d0 + 4 && !G.playing_cards.includes(one[0]), 'weavile: single card of the rank: destroyed, $4, +X1', { t: r.total, x: j.ability.extra.Xmult, d: G.GAME.dollars - d0 });
  r = play(hand(['S_' + CODE[id === 2 ? 3 : 2], 'H_' + CODE[id === 2 ? 3 : 2]]));
  ok(r.total.mult === 2 * 2, 'weavile: X2 Mult', r.total);
  const two = hand(['H_' + CODE[id], 'D_' + CODE[id]]);
  play(two);
  ok(j.ability.extra.Xmult === 2 && G.playing_cards.includes(two[0]), 'weavile: only a single card');
  const o = CODE[id === 2 ? 3 : 2];
  winRound(hand(['C_' + o, 'D_' + o]));
  ok(j.ability.extra.Xmult === 2, 'weavile: no reset on a small blind', j.ability.extra.Xmult);
  nextRound();
  G.GAME.blind.boss = true;
  winRound(hand(['C_' + o, 'D_' + o]));
  ok(j.ability.extra.Xmult === 1, 'weavile: resets after a Boss Blind', j.ability.extra.Xmult);
}

// ---------------------------------------------------------------- Magnezone / Lickilicky / Rhyperior
{
  start('MAGNEZ');
  add('j_poke_magnezone');
  let r = play(hand(['S_A'], { center: 'm_steel' }));
  ok(r.total.mult === 1.5, 'magnezone: X1.5 per Steel card scored', r.total);
  add('j_poke_aron');
  r = play(hand(['S_A'], { center: 'm_steel' }));
  ok(near(r.total.mult, 1.75 * 1.25), 'magnezone: +X0.25 per Metal joker (aron also eats it)', r.total);
}
{
  start('LICKI');
  add('j_poke_lickilicky');
  const r = play(hand(['S_J', 'H_J', 'D_J']));
  ok(near(r.total.mult, 3 * 1.5 * 1.5 * 1.2), 'lickilicky: first 2 Jacks X1.5, others X1.2', r.total);
}
{
  start('RHYPER');
  add('j_poke_rhyperior');
  const st = hand(['S_A'], { center: 'm_stone' });
  const r = play(st);
  // Stone 50 (+8 perma) then retriggered once (1 Earth joker): 58 (+8)
  ok(r.total.chips === 5 + 50 + 58 && st[0].ability.perma_bonus === 16, 'rhyperior: +8 permanent chips to Stone cards, retriggered', [r.total, st[0].ability.perma_bonus]);
  add('j_poke_bonsly'); add('j_poke_nosepass');
  const st2 = hand(['S_K'], { center: 'm_stone' });
  const r2 = play(st2);
  ok(r2.total.chips === 5 + 50 + 58 + 66, 'rhyperior: +1 retrigger per 3 Earth jokers', r2.total);
}

// ---------------------------------------------------------------- Tangrowth
{
  start('TANGROW');
  add('j_poke_tangrowth');
  G.GAME.probabilities.normal = 1000;
  const d0 = G.GAME.dollars;
  let r = play(hand(['S_A'], { center: 'm_wild' }));
  ok(r.total.chips === 16 + 75 && r.total.mult === 1 + 15 && G.GAME.dollars === d0 + 3, 'tangrowth: 1 in 4 Wild cards give all three', [r.total, G.GAME.dollars - d0]);
  G.GAME.probabilities.normal = 0;
  const d1 = G.GAME.dollars;
  r = play(hand(['S_K'], { center: 'm_wild' }));
  const got = [r.total.chips === 15 + 75 && r.total.mult === 1, r.total.chips === 15 && r.total.mult === 16, r.total.chips === 15 && r.total.mult === 1 && G.GAME.dollars === d1 + 3];
  ok(got.filter(Boolean).length === 1, 'tangrowth: otherwise one of +75 chips / +15 Mult / $3', [r.total, G.GAME.dollars - d1]);
  G.GAME.probabilities.normal = 1;
  const w = hand(['S_Q'], { center: 'm_wild' });
  G.GAME.blind.debuff.suit = 'Spades';
  w[0].set_debuff();
  ok(!w[0].debuff, 'tangrowth: Wild cards cannot be debuffed');
}

// ---------------------------------------------------------------- Electivire
{
  start('ELECTI');
  const j = add('j_poke_electivire');
  const s0 = j.sell_cost;
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + 0.02 * s0), 'electivire: X0.02 per $ of sell value', [r.total, s0]);
  winRound();
  ok(j.sell_cost === s0 + 2, 'electivire: +$2 sell value at end of round', j.sell_cost);
  act({ type: 'cash_out' });
  const other = add('j_poke_caterpie');
  act({ type: 'sell', id: other.sort_id });
  ok(j.sell_cost === s0 + 4, 'electivire: +$2 when a card is sold', j.sell_cost);
}

// ---------------------------------------------------------------- Magmortar
{
  start('MAGMOR');
  const j = add('j_poke_magmortar');
  const one = hand(['S_5']);
  hand(['S_6', 'S_7', 'S_8']);
  discard(one);
  ok(!G.playing_cards.includes(one[0]) && j.ability.extra.mult === 2 && near(j.ability.extra.Xmult, 1.05), 'magmortar: first 1-card discard destroyed, +2 Mult, +X0.05', j.ability.extra);
  const two = G.hand.cards.slice(0, 2);
  discard(two);
  ok(G.playing_cards.includes(two[0]) && j.ability.extra.mult === 2 && near(j.ability.extra.Xmult, 1.1), 'magmortar: later discards just +X0.05', j.ability.extra);
  clearHand();
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 3 * 1.1) && statusMsgs(r.events).some((m) => /Fire Blast/i.test(m)), 'magmortar: +Mult and X Mult', [r.total, statusMsgs(r.events)]);
}

// ---------------------------------------------------------------- Togekiss
{
  start('TOGEKISS');
  add('j_poke_togekiss');
  ok(probability_vars(null, 1, 4).join() === '2,4', 'togekiss: +1 to every listed probability', probability_vars(null, 1, 4));
  G.GAME.probabilities.normal = 1000;
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_A'], { center: 'm_lucky' }));
  // Lucky: +20 Mult and $20; Togekiss: +100 chips and X1.5
  ok(r.total.chips === 16 + 100 && near(r.total.mult, 21 * 1.5) && G.GAME.dollars === d0 + 20, 'togekiss: Lucky cards +100 chips and X1.5', [r.total, G.GAME.dollars - d0]);
  G.GAME.probabilities.normal = 0;
  const r2 = play(hand(['S_K'], { center: 'm_lucky' }));
  ok(r2.total.chips === 15 && r2.total.mult === 1, 'togekiss: misses (odds 0)', r2.total);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Yanmega
{
  start('YANMEGA');
  add('j_poke_yanmega');
  G.GAME.probabilities.normal = 0;
  let r = play(hand(['S_3']));
  ok(r.total.chips === 5 + 3 + 12 && r.total.mult === 1 + 6, 'yanmega: 3s and 6s give +12 chips +6 Mult', r.total);
  G.GAME.probabilities.normal = 1000;
  r = play(hand(['S_6']));
  ok(r.total.chips === 5 + 2 * (6 + 12) && r.total.mult === 1 + 12, 'yanmega: 1 in 3 retrigger', r.total);
  r = play(hand(['S_7']));
  ok(r.total.chips === 12 && r.total.mult === 1, 'yanmega: other ranks nothing', r.total);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Leafeon / Glaceon / Gliscor / Mamoswine
{
  start('LEAFEON');
  const h0 = G.hand.config.card_limit;
  const j = add('j_poke_leafeon');
  ok(G.hand.config.card_limit === h0 + 7, 'leafeon: +7 hand size', G.hand.config.card_limit);
  play(hand(['S_A']));
  ok(G.hand.config.card_limit === h0 + 6 && j.ability.extra.h_size === 6, 'leafeon: -1 per hand played', G.hand.config.card_limit);
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_K'], { center: 'm_lucky' }));
  ok(G.hand.config.card_limit === h0 + 6 && j.ability.extra.h_size === 6, 'leafeon: +1 when a Lucky card triggers', G.hand.config.card_limit);
  G.GAME.probabilities.normal = 1;
  j.remove(); G.E_MANAGER.flush();
  ok(G.hand.config.card_limit === h0, 'leafeon removed: hand size back', G.hand.config.card_limit - h0);
}
{
  start('GLACEON');
  add('j_poke_glaceon');
  toShop();
  const n0 = G.shop_jokers.cards.length;
  G.GAME.dollars = 100;
  G.GAME.probabilities.normal = 1000;
  act({ type: 'reroll_shop' });
  const glass = G.shop_jokers.cards.filter((c) => key(c) === 'm_glass');
  ok(glass.length === 1 && G.shop_jokers.cards.length === n0 + 1, 'glaceon: a Glass copy of a deck card in the shop', G.shop_jokers.cards.map(key));
  G.GAME.probabilities.normal = 1;
  const pc = G.playing_cards.length;
  ok(act({ type: 'buy', id: glass[0].sort_id }).ok && G.playing_cards.length === pc + 1, 'glaceon: the copy can be bought into the deck');
}
{
  start('GLISCOR');
  add('j_poke_gliscor');
  const suit = G.GAME.current_round.gligar_suit;
  const S = suit[0];
  hand([S + '_2', S + '_3']);
  hand([(S === 'S' ? 'H' : 'S') + '_4']);
  const r = play(hand([(S === 'D' ? 'C' : 'D') + '_A', (S === 'C' ? 'H' : 'C') + '_A']));
  ok(near(r.total.mult, 2 * 1.5 * 1.5), 'gliscor: each played card X(1 + 0.25 per held card of the suit)', [r.total, suit]);
}
{
  start('MAMOS');
  add('j_poke_mamoswine');
  G.GAME.probabilities.normal = 0;
  const d0 = G.GAME.dollars;
  let r = play(hand(['S_A'], { center: 'm_glass' }).concat(hand(['H_9'], { center: 'm_stone' })));
  // Glass Ace: 11 chips, X2; then Mamoswine +15 per Stone/Glass (2) on the first card; Stone 50
  ok(r.total.chips === 5 + 11 + 50 && r.total.mult === 1 * 2 + 30 && G.GAME.dollars === d0, 'mamoswine: first card +15 Mult per Stone/Glass card', r.total);
  G.GAME.probabilities.normal = 1000;
  const d1 = G.GAME.dollars;
  r = play(hand(['S_K'], { center: 'm_stone' }));
  ok(G.GAME.dollars === d1 + 4 && r.total.mult === 1 + 15, 'mamoswine: 1 in 2 Stone/Glass cards earn $4', [G.GAME.dollars - d1, r.total]);
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Porygon-Z / Probopass / Dusknoir / Froslass
{
  start('PORYZ');
  const p0 = G.GAME.energy_plus || 0;
  const j = add('j_poke_porygonz');
  ok(G.GAME.energy_plus === p0 + 3, 'porygon-z: +3 energy limit', G.GAME.energy_plus);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'porygon-z: X1 with no Energy used');
  const e = add('c_poke_colorless_energy');
  ok(act({ type: 'use', id: e.sort_id, joker_targets: [j.sort_id] }).ok, 'energy used on porygon-z');
  ok(G.GAME.energies_used === 1 && G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Energy', 'porygon-z: makes an Energy when one is used', G.consumeables.cards.map(key));
  G.GAME.energies_used = 5;
  r = play(hand(['S_A']));
  // (the Colorless Energy also energized its own Xmult_mod: 0.1 -> 0.12)
  ok(j.ability.extra.Xmult_mod > 0.1 && near(r.total.mult, 1 + 5 * j.ability.extra.Xmult_mod), 'porygon-z: X0.1 (energized) per Energy used this run', [r.total, j.ability.extra.Xmult_mod]);
  j.remove();
  ok(G.GAME.energy_plus === p0, 'porygon-z removed: limit back');
}
{
  start('PROBO');
  add('j_poke_probopass');
  const r = play(hand(['S_A'], { center: 'm_stone' }));
  ok(r.total.mult === 1.5, 'probopass: Stone cards X1.5', r.total);
  start('DUSKNOIR');
  const s0 = G.GAME.spectral_rate;
  const d = add('j_poke_dusknoir');
  ok(G.GAME.spectral_rate === s0 + 2, 'dusknoir: Spectral cards appear in the shop', G.GAME.spectral_rate);
  d.remove();
  ok(G.GAME.spectral_rate === s0, 'dusknoir removed: rate back');
  start('FROSL');
  const b0 = G.GAME.bankrupt_at;
  add('j_poke_froslass');
  ok(G.GAME.bankrupt_at === b0 - 15, 'froslass: $15 of debt');
}

// ---------------------------------------------------------------- Rotom forms
{
  start('ROTOM');
  toShop();
  const bk = G.shop_booster.cards[0];
  const c0 = bk.cost;
  const j = add('j_poke_rotom');
  ok(bk.cost === Math.max(0, c0 - 1), 'rotom: Booster Packs cost $1 less', [c0, bk.cost]);
  G.GAME.probabilities.normal = 1000;
  G.GAME.dollars = 100;
  act({ type: 'buy', id: bk.sort_id });
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item', 'rotom: 1 in 2 an Item when a pack is opened', G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 1;
  ok(!!j);
}
{
  start('ROTOMH');
  add('j_poke_rotomh');
  const two = hand(['S_5', 'H_6']);
  hand(['S_7', 'S_8']);
  discard(two);
  ok(two.every((c) => key(c) === 'm_mult'), 'rotom heat: a first discard of 2 cards turns them to Mult cards', two.map(key));
  const two2 = G.hand.cards.slice(0, 2);
  discard(two2);
  ok(two2.every((c) => key(c) === 'c_base'), 'rotom heat: only the first discard');
}
{
  start('ROTOMW');
  add('j_poke_rotomw');
  const d0 = G.GAME.dollars;
  const cs = hand(['S_A', 'H_A'], { center: 'm_bonus' });
  const r = play(cs);
  ok(cs.every((c) => key(c) === 'c_base') && G.GAME.dollars === d0 + 6 && r.total.chips === 32, 'rotom wash: strips enhancements from scoring cards, $3 each', [cs.map(key), G.GAME.dollars - d0, r.total]);
}
{
  start('ROTOMF', {}, { noBlind: true });
  add('j_poke_rotomf');
  act({ type: 'select_blind' }); clearHand();
  const c = G.consumeables.cards[0];
  ok(G.consumeables.cards.length === 1 && c.edition && (c.edition.foil || c.edition.holo || c.edition.polychrome), 'rotom frost: an editioned consumable when the blind is selected', [c && key(c), c && c.edition]);
}
{
  start('ROTOMFAN', {}, { noBlind: true });
  add('j_poke_rotomfan');
  const victim = add('j_poke_caterpie');
  const t0 = G.GAME.tags.length;
  const res = act({ type: 'select_blind' }); clearHand();
  ok(!G.jokers.cards.includes(victim) && G.jokers.cards.length === 1, 'rotom fan: destroys the joker to its right', G.jokers.cards.map(key));
  ok(res.events.some((e) => e.type === 'tag_added') || G.GAME.tags.length > t0, 'rotom fan: ... and makes a random Tag', res.events.filter((e) => /tag/.test(e.type)));
}
{
  start('ROTOMM');
  add('j_poke_rotomm');
  const held = hand(['S_9', 'H_5', 'D_K']);
  winRound(hand(['C_2']));
  ok(held[0].base.value === '8' && held[1].base.value === '4' && held[2].base.value === 'King', 'rotom mow: first 2 held cards -1 rank at end of round', held.map((c) => c.base.value));
}

done();
