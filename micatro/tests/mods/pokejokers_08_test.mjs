// Pokermon pokejokers_08 (Qwilfish -> Magby): every one of the 33 jokers fired through real
// plays (act), plus each line's evolution.
//   node micatro/tests/mods/pokejokers_08_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { localize } from '../../js/engine/core.js';
import { poke_evolve } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const hazards = () => G.playing_cards.filter((c) => c.config.center.key === 'm_poke_hazard').length;
const evalRow = (k) => G.GAME.round_eval && G.GAME.round_eval.rows.find((x) => x.center === k);
/** Leave the round (won) and stand in the shop. */
function toShop() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
}
/** From the shop: next blind selected, hand cleared. */
function fromShop() { act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); }

const FILE_JOKERS = ['qwilfish', 'scizor', 'mega_scizor', 'shuckle', 'heracross', 'mega_heracross', 'sneasel', 'teddiursa', 'ursaring',
  'slugma', 'magcargo', 'swinub', 'piloswine', 'corsola', 'remoraid', 'octillery', 'delibird', 'mantine', 'skarmory', 'houndour',
  'houndoom', 'mega_houndoom', 'kingdra', 'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle', 'tyrogue', 'hitmontop',
  'smoochum', 'elekid', 'magby'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 33 pokejokers_08 jokers ported',
  FILE_JOKERS.filter((n) => P_CENTERS['j_poke_' + n].unported));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_08.lua'].length === 33, 'defs: 33 from pokejokers_08.lua', STATUS.PORTED_FILES['pokemon/pokejokers_08.lua'].length);

// ---------------------------------------------------------------- Qwilfish
{
  start('QWIL');
  const j = add('j_poke_qwilfish');
  const h0 = hazards();
  nextRound();
  ok(hazards() === h0 + 4, 'qwilfish: 4 hazard cards set when the blind is selected', [h0, hazards()]);
  G.GAME.probabilities.normal = 1000;
  let r = play(hand(['S_A'], { center: 'm_glass' }));
  ok(r.total.chips === 16 && j.ability.extra.chips === 25, 'qwilfish: +25 chips when an enhanced card is destroyed', [r.total, j.ability.extra.chips]);
  G.GAME.probabilities.normal = 1;
  clearHand();
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 + 25, 'qwilfish: scores its chips', r.total);
  // poke_remove_card of a plain card: no gain.
  clearHand();
}

// ---------------------------------------------------------------- Scizor / Mega Scizor
{
  start('SCIZ');
  const s = add('j_poke_scizor');
  const common = add('j_joker');
  nextRound();
  ok(common.removed && !G.jokers.cards.includes(common) && s.ability.extra.mult === 4 && !s.edition, 'scizor slices a common joker: +4 Mult, no edition', [s.ability.extra, s.edition]);
  add('j_poke_corsola', 'polychrome');
  nextRound();
  ok(s.edition && s.edition.polychrome && s.ability.extra.mult === 8, 'scizor slices a rare: takes its polychrome', [s.edition, s.ability.extra]);
  add('j_poke_corsola', 'foil');
  nextRound();
  ok(s.edition && s.edition.foil && near(s.ability.extra.scizor_Xmult, 1.5) && s.ability.extra.mult === 12, 'scizor: banks its old polychrome X1.5, now foil', [s.edition, s.ability.extra]);
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 50 && near(r.total.mult, (1 + 12) * 1.5), 'scizor: +12 Mult, X1.5 (+50 foil chips)', r.total);
  // Evolution into Mega Scizor (Mega Stone) keeps the scaled values (poke_custom_values_to_keep).
  poke_evolve(s, 'j_poke_mega_scizor', true);
  ok(key(s) === 'j_poke_mega_scizor' && s.ability.extra.mult === 12 && near(s.ability.extra.scizor_Xmult, 1.5) && s.ability.extra.Xmult_multi === 4, 'scizor -> mega scizor keeps its values', s.ability.extra);
}
{
  start('MSCIZ');
  const m = add('j_poke_mega_scizor');
  add('j_joker'); add('j_greedy_joker');
  const r = play(hand(['S_A']));
  // Joker +4 -> 5, X4 for Joker -> 20, X4 for Greedy Joker -> 80
  ok(r.total.mult === 80, 'mega scizor: X4 for each common joker', r.total);
  winRound();
  ok(G.jokers.cards.length === 1 && G.jokers.cards[0] === m, 'mega scizor slices every common joker at end of round', G.jokers.cards.map(key));
}

// ---------------------------------------------------------------- Shuckle
{
  start('SHUCK');
  add('j_poke_shuckle');
  add('c_pluto');
  nextRound();
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_berry_juice_planet', 'shuckle: turns the first consumable into its Berry Juice', G.consumeables.cards.map(key));
  nextRound();
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_berry_juice_planet', 'shuckle: leaves Berry Juice alone', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- Heracross / Mega Heracross
{
  start('HERA');
  add('j_poke_heracross');
  hand(['S_K']);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'heracross: X2 when no held card shares a played rank', r.total);
  clearHand();
  hand(['H_A']);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'heracross: nothing when a held card matches', r.total);
}
{
  start('MHERA');
  const j = add('j_poke_mega_heracross');
  let r = play(hand(['S_2', 'H_5', 'D_8', 'C_J', 'S_K']));
  ok(r.total.chips === 5 + 10 * 3, 'mega heracross: retriggers scored cards twice on a 5-card hand', r.total);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 && j.debuff, 'mega heracross: a <5 card hand faints it (no retrigger)', [r.total, j.debuff]);
  start('MHERA2');
  const j2 = add('j_poke_mega_heracross');
  act({ type: 'highlight', ids: hand(['S_2', 'S_3']).map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(j2.debuff, 'mega heracross: a <5 card discard faints it', j2.debuff);
}

// ---------------------------------------------------------------- Sneasel
{
  start('SNEAS');
  const j = add('j_poke_sneasel');
  const id = G.GAME.current_round.sneaselcard.id;
  const code = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[id];
  const [c] = hand(['S_' + code]);
  const d0 = G.GAME.dollars;
  play([c]);
  ok(G.GAME.dollars === d0 + 4 && !G.playing_cards.includes(c), 'sneasel: lone ' + code + ' pays $4 and is destroyed', [G.GAME.dollars - d0, G.playing_cards.includes(c)]);
  clearHand();
  const [o] = hand(['S_' + (code === '2' ? '3' : '2')]);
  const d1 = G.GAME.dollars;
  play([o]);
  ok(G.GAME.dollars === d1 && G.playing_cards.includes(o), 'sneasel: other ranks untouched');
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_weavile', 'sneasel -> weavile with a Dusk Stone', key(j));
}

// ---------------------------------------------------------------- Teddiursa / Ursaring
{
  start('TEDDI');
  const j = add('j_poke_teddiursa');
  toShop();
  G.GAME.dollars = 200;
  for (let i = 0; i < 2; i++) {
    const b = G.shop_booster.cards[0];
    ok(b && act({ type: 'buy', id: b.sort_id }).ok, 'bought a booster');
    act({ type: 'skip_booster' });
  }
  ok(j.ability.extra.mult === 4, 'teddiursa: +2 Mult per skipped booster', j.ability.extra.mult);
  j.ability.extra.mult = 12;
  fromShop();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 13, 'teddiursa scores +12 Mult', r.total);
  winRound();
  ok(key(j) === 'j_poke_ursaring' && j.ability.extra.mult === 12 && j.ability.extra.mult_mod === 2, 'teddiursa -> ursaring keeps its Mult (Ursaring +2 per skip (Pokermon 3.9.1 data))', j.ability.extra);
  act({ type: 'cash_out' });
  const b = G.shop_booster.cards[0];
  act({ type: 'buy', id: b.sort_id });
  const n0 = G.consumeables.cards.length;
  act({ type: 'skip_booster' });
  ok(j.ability.extra.mult === 14 && G.consumeables.cards.length === n0 + 1 && G.consumeables.cards[n0].ability.set === 'Item', 'ursaring: +2 Mult and an Item per skip' + ' (Pokermon 3.9.1 data)', [j.ability.extra.mult, G.consumeables.cards.map(key)]);
  for (const c of G.consumeables.cards.slice()) c.remove();
  const ms = add('c_poke_moonstone');
  ok(act({ type: 'use', id: ms.sort_id, joker_targets: [j.sort_id] }).ok && j.ability.extra.evolve === true, 'moon stone marks ursaring');
  fromShop();
  winRound();
  ok(key(j) === 'j_poke_ursaluna', 'ursaring -> ursaluna with a Moon Stone', key(j));
}

// ---------------------------------------------------------------- Slugma / Magcargo
{
  start('SLUG');
  const j = add('j_poke_slugma');
  for (let i = 0; i < 3; i++) { clearHand(); play(hand(['S_A'])); }
  ok(j.ability.extra.hands === 1 && j.ability.extra.chips === 0, 'slugma counts down its hands', j.ability.extra);
  clearHand();
  const [held] = hand(['D_3']);
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 12 && j.ability.extra.hands === 4 && !G.playing_cards.includes(held), 'slugma: every 4th hand +12 chips and burns the leftmost held card', [r.total, j.ability.extra, G.playing_cards.includes(held)]);
  j.ability.extra.chips = 60;
  winRound();
  ok(key(j) === 'j_poke_magcargo' && j.ability.extra.chips === 60 && j.ability.extra.hands === 3, 'slugma -> magcargo at 60 chips', j.ability.extra);
  nextRound();
  for (let i = 0; i < 2; i++) { clearHand(); play(hand(['S_A'])); }
  clearHand();
  const [h2] = hand(['D_4']);
  const r2 = play(hand(['S_A']));
  ok(r2.total.chips === 16 + 75 && !G.playing_cards.includes(h2), 'magcargo: every 3rd hand +15 chips and burns a card', r2.total);
}

// ---------------------------------------------------------------- Swinub / Piloswine
{
  start('SWIN');
  const j = add('j_poke_swinub');
  const st = hand(['C_9'], { center: 'm_stone' });
  let r = play([...hand(['S_A']), ...st]);
  ok(r.total.chips === 5 + 11 + 50 && r.total.mult === 1 + 5, 'swinub: +5 Mult per Stone/Glass card scored', r.total);
  G.GAME.probabilities.normal = 2;
  winRound();
  ok(evalRow('j_poke_swinub') && evalRow('j_poke_swinub').dollars === 3, 'swinub: $3 (1 in 2) at cash-out', evalRow('j_poke_swinub'));
  G.GAME.probabilities.normal = 1;
  for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_piloswine', 'swinub -> piloswine after 5 rounds', key(j));
  nextRound();
  clearHand();
  r = play([...hand(['S_A'], { center: 'm_stone' }), ...hand(['S_K'], { center: 'm_stone' })]);
  ok(r.total.mult === 1 + 20 && j.ability.extra.scored === 2, 'piloswine: +10 Mult per Stone/Glass, counts them', [r.total, j.ability.extra.scored]);
  G.GAME.probabilities.normal = 2;
  winRound();
  ok(evalRow('j_poke_piloswine') && evalRow('j_poke_piloswine').dollars === 6, 'piloswine: $6 at cash-out', evalRow('j_poke_piloswine'));
  nextRound();
  j.ability.extra.scored = 15;
  winRound();
  ok(key(j) === 'j_poke_mamoswine', 'piloswine -> mamoswine after 15 Stone/Glass', key(j));
  G.GAME.probabilities.normal = 1;
}

// ---------------------------------------------------------------- Corsola
{
  start('CORS');
  add('j_poke_corsola');
  const base_enh = G.playing_cards.filter((c) => c.config.center !== P_CENTERS.c_base).length;
  const cards = hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6'], { center: 'm_bonus' });
  const tally = base_enh + 5;
  const r = play(cards);
  ok(r.total.chips === 30 + 20 + 150 && r.total.mult === 4 + 3 * tally, 'corsola: +3 Mult per enhanced card in the deck', [r.total, tally]);
  ok(G.jokers.cards.length === 2 && G.jokers.cards[1].config.center.ptype === 'Water' && G.jokers.cards[1].config.center.stage === 'Basic', 'corsola: 5 enhanced scoring cards make a Basic Water Pokémon', G.jokers.cards.map(key));
}

// ---------------------------------------------------------------- Remoraid / Octillery
{
  start('REMO');
  const j = add('j_poke_remoraid');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 22, 'remoraid: retriggers the first hand', r.total);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'remoraid: only the first hand', r.total);
  winRound(); for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_octillery', 'remoraid -> octillery after 5 rounds', key(j));
  nextRound();
  r = play(hand(['S_8']));
  ok(r.total.chips === 5 + 16 && !j.debuff, 'octillery: retriggers every card, an 8 keeps it awake', [r.total, j.debuff]);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 22 && j.debuff, 'octillery: faints without an 8', [r.total, j.debuff]);
}

// ---------------------------------------------------------------- Delibird
{
  start('DELI');
  add('j_poke_delibird');
  const seen = {};
  for (let i = 0; i < 16; i++) {
    for (const c of G.consumeables.cards.slice()) c.remove();
    for (const c of G.jokers.cards.slice()) if (key(c) === 'j_gift') c.remove();
    const tags0 = G.GAME.tags.length;
    const w = winRound();
    const row = evalRow('j_poke_delibird');
    const outcomes = [];
    if (row && row.dollars === 8) outcomes.push('money');
    if (G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item') outcomes.push('item');
    if (G.GAME.tags.length === tags0 + 1 && G.GAME.tags[tags0].key === 'tag_coupon') outcomes.push('coupon');
    const gift = G.jokers.cards.find((c) => key(c) === 'j_gift');
    if (gift && gift.edition && gift.edition.polychrome) outcomes.push('gift');
    ok(outcomes.length === 1, 'delibird: exactly one present per cash-out', outcomes);
    ok(statusMsgs(w.events).includes(localize('poke_gift_ex')), 'delibird: "Gift!" popup', statusMsgs(w.events));
    seen[outcomes[0]] = true;
    act({ type: 'cash_out' });
    fromShop();
  }
  ok(Object.keys(seen).length >= 3, 'delibird: several kinds of present over 16 rounds', seen);
}

// ---------------------------------------------------------------- Mantine
{
  start('MANT');
  const j = add('j_poke_mantine');
  hand(['S_K'], { center: 'm_gold' });
  const r = play(hand(['S_A'], { center: 'm_gold' }));
  ok(j.ability.extra.chips === 8 && r.total.chips === 16 + 8, 'mantine: +4 chips per Gold card scored or held', [j.ability.extra.chips, r.total]);
}

// ---------------------------------------------------------------- Skarmory
{
  start('SKARM');
  add('j_poke_skarmory');
  const h0 = hazards();
  nextRound();
  ok(hazards() === h0 + 4, 'skarmory: sets 4 hazards', [h0, hazards()]);
  hand(['S_K', 'H_K'], { center: 'm_steel' });
  const r = play(hand(['S_A']));
  // steel X1.5 X1.5 = 2.25, then skarmory X(1 + 0.5 * 2)
  ok(near(r.total.mult, 2.25 * 2), 'skarmory: X0.5 per held Steel/Hazard card', r.total);
}

// ---------------------------------------------------------------- Houndour / Houndoom / Mega Houndoom
{
  start('HOUND');
  const j = add('j_poke_houndour');
  const hc = hand(['S_2', 'S_3', 'S_4', 'S_5', 'H_7', 'H_8', 'H_9', 'H_T']);
  const dl = G.GAME.current_round.discards_left;
  act({ type: 'highlight', ids: hc.slice(0, 4).map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.discard.cards.length === 6 && G.GAME.current_round.discards_left === dl - 1, 'houndour: a 4-card discard discards 2 more held cards', [G.discard.cards.length, G.GAME.current_round.discards_left]);
  ok(G.discard.cards.every((c) => c.ability.perma_mult === 1), 'houndour: discarded cards gain +1 permanent Mult', G.discard.cards.map((c) => c.ability.perma_mult));
  clearHand();
  const [pm] = hand(['S_A']);
  pm.ability.perma_mult = 3;
  const r = play([pm]);
  ok(r.total.mult === 1 + 3, 'perma_mult scores (SMODS)', r.total);
  winRound(); for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_houndoom', 'houndour -> houndoom after 5 rounds', key(j));
  nextRound();
  const hd = hand(['S_2', 'S_3', 'S_4', 'S_5', 'H_7', 'H_8', 'H_9', 'H_T']);
  const n0 = G.discard.cards.length;
  act({ type: 'highlight', ids: hd.slice(0, 4).map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.discard.cards.length === n0 + 8 && hd.every((c) => c.ability.perma_mult === 2), 'houndoom: discards the whole hand, +2 permanent Mult each', [G.discard.cards.length - n0, hd.map((c) => c.ability.perma_mult)]);
}
{
  start('MHOUND');
  const j = add('j_poke_mega_houndoom');
  const hc = hand(['S_2', 'S_3', 'H_7', 'H_8']);
  act({ type: 'highlight', ids: [hc[0].sort_id] });
  act({ type: 'discard' });
  ok(j.ability.extra.Xmult === 3 && G.discard.cards.length === 4, 'mega houndoom: X+2 per discard, discards the whole hand', [j.ability.extra.Xmult, G.discard.cards.length]);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'mega houndoom: X3', r.total);
  winRound();
  ok(j.ability.extra.Xmult === 1, 'mega houndoom: resets at end of round', j.ability.extra.Xmult);
}

// ---------------------------------------------------------------- Kingdra
{
  start('KINGD');
  const j = add('j_poke_kingdra');
  hand(['S_K']);
  let r = play(hand(['H_6']));
  ok(near(r.total.mult, 1.05) && near(j.ability.extra.Xmult, 1.05), 'kingdra: scored 6 with a King held -> X+0.05', r.total);
  clearHand();
  r = play(hand(['H_6']));
  ok(near(r.total.mult, 2 * 1.05) && j.ability.extra.mult === 1, 'kingdra: scored 6 without a King -> +1 Mult', r.total);
}

// ---------------------------------------------------------------- Phanpy / Donphan
{
  start('PHAN');
  const j = add('j_poke_phanpy');
  let r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(near(r.total.mult, 4 * 1.1), 'phanpy: X+0.1 per 5-card hand', r.total);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 && j.ability.extra.Xmult === 1, 'phanpy: resets on a short hand', r.total);
  winRound(); for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_donphan', 'phanpy -> donphan after 5 rounds', key(j));
  nextRound();
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(near(r.total.mult, 4 * 1.15), 'donphan: X+0.15 per 5-card hand', r.total);
}

// ---------------------------------------------------------------- Porygon2
{
  start('PORY');
  const j = add('j_poke_porygon2');
  ok(G.GAME.energy_plus === 2, 'porygon2: +2 energy limit', G.GAME.energy_plus);
  toShop();
  G.GAME.dollars = 200;
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_colorless_energy'), 'porygon2: opening a pack makes the leftmost joker\'s Energy', G.consumeables.cards.map(key));
  act({ type: 'skip_booster' });
  j.ability.extra.evolve = true;
  fromShop();
  winRound();
  ok(key(j) === 'j_poke_porygonz', 'porygon2 -> porygonz with a Dubious Disc', key(j));
  start('PORY2');
  const p = add('j_poke_porygon2');
  p.ability.extra.ptype = 'Bird';
  toShop();
  G.GAME.dollars = 200;
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  ok(key(p) === 'j_poke_porygonz' && G.consumeables.cards.some((c) => key(c) === 'c_poke_bird_energy'), 'porygon2: a Bird Energy evolves it', [key(p), G.consumeables.cards.map(key)]);
  start('PORY3');
  const q = add('j_poke_porygon2');
  q.remove();
  ok(G.GAME.energy_plus === 0, 'porygon2 removed: energy limit back', G.GAME.energy_plus);
}

// ---------------------------------------------------------------- Stantler
{
  start('STANT');
  const j = add('j_poke_stantler');
  ok(G.GAME.scry_amount === 2, 'stantler: scry 2', G.GAME.scry_amount);
  const extra = add('j_poke_stantler'); extra.remove();
  ok(G.GAME.scry_amount === 2, 'stantler removed: its scry goes away', G.GAME.scry_amount);
  const top = G.scry_view.cards.filter((c) => c.ability.effect !== 'Stone Card');
  let best = null; for (const c of top) if (!best || c.base.id > best.base.id) best = c;
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1 + best.base.nominal && j.ability.extra.triggered === 1, 'stantler: the highest scried card gives its rank as Mult', [r.total, best.base.value]);
  j.ability.extra.triggered = 12;
  winRound();
  ok(G.GAME.scry_amount === 2, 'scry kept across the evolution', G.GAME.scry_amount);
  ok(key(j) === 'j_poke_wyrdeer', 'stantler -> wyrdeer after 12 triggers', key(j));
}

// ---------------------------------------------------------------- Smeargle
{
  start('SMEAR');
  const s = add('j_poke_smeargle');
  add('j_poke_caterpie');
  nextRound();
  ok(s.smeargle_copy_joker === G.jokers.cards[1] && s.ability.extra.copy_pos === 2, 'smeargle sketches the joker to its right', s.ability.extra);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3 + 3, 'smeargle copies caterpie (+3 Mult)', r.total);
  // The sketch sticks even after the copied joker moves.
  act({ type: 'reorder', area: 'jokers', ids: [G.jokers.cards[1].sort_id, s.sort_id] });
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.mult === 7 && s.ability.extra.copy_pos === 1, 'smeargle keeps its sketch after a reorder', [r.total, s.ability.extra]);
}

// ---------------------------------------------------------------- Tyrogue / Hitmontop
{
  start('TYRO');
  const j = add('j_poke_tyrogue');
  const n0 = G.playing_cards.length;
  const five = hand(['S_2', 'H_5', 'D_8', 'C_J', 'S_K']);
  const r = play(five);
  ok(G.playing_cards.length === n0 + 6 && near(r.total.mult, 0.5), 'tyrogue: X0.5, first 5-card hand copies a card', [G.playing_cards.length - n0, r.total]);
  start('TYRO2');
  const j2 = add('j_poke_tyrogue');
  const d5 = hand(['S_2', 'H_5', 'D_8', 'C_J', 'S_K']);
  const n1 = G.playing_cards.length;
  act({ type: 'highlight', ids: d5.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.playing_cards.length === n1 - 1, 'tyrogue: first 5-card discard destroys one card', n1 - G.playing_cards.length);
  winRound();
  nextRound();
  G.GAME.starting_deck_size = G.playing_cards.length + 1; // winRound adds its own card
  winRound();
  ok(key(j2) === 'j_poke_hitmontop', 'tyrogue -> hitmontop with the starting deck size', key(j2));
  ok(key(j) === 'j_poke_tyrogue', 'other run untouched');
  act({ type: 'cash_out' });
  G.GAME.starting_deck_size = G.playing_cards.length;
  fromShop();
  ok(near(j2.ability.extra.Xmult, 1.65), 'hitmontop: X+0.15 per blind at the starting deck size', j2.ability.extra.Xmult);
  const r2 = play(hand(['S_A']));
  ok(near(r2.total.mult, 1.65), 'hitmontop X1.65', r2.total);
  for (const [extra, want] of [[1, 'j_poke_hitmonchan'], [-1, 'j_poke_hitmonlee']]) {
    start('TYRO' + want);
    const t = add('j_poke_tyrogue');
    t.ability.extra.rounds = 1;
    G.GAME.starting_deck_size = G.playing_cards.length + 1 - extra;
    winRound();
    ok(key(t) === want, 'tyrogue -> ' + want, key(t));
  }
}

// ---------------------------------------------------------------- Smoochum / Elekid / Magby
for (const [baby, evo, tag] of [['smoochum', 'j_poke_jynx', 'tag_standard'], ['elekid', 'j_poke_electabuzz', 'tag_coupon'], ['magby', 'j_poke_magmar', null]]) {
  start('BABY' + baby);
  const d0 = G.GAME.round_resets.discards;
  const j = add('j_poke_' + baby);
  if (baby === 'magby') ok(G.GAME.round_resets.discards === d0 + 1, 'magby: +1 discard');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 0.75), baby + ': X0.75', r.total);
  add('j_joker');
  clearHand();
  play(hand(['S_A']));
  ok(j.debuff, baby + ': faints with an adult to its right', j.debuff);
  G.jokers.cards[1].remove();
  winRound(); // fainted this round: no countdown
  nextRound();
  ok(!j.debuff, baby + ': wakes up next round', j.debuff);
  const tags0 = G.GAME.tags.length;
  winRound(); nextRound(); winRound();
  ok(key(j) === evo, baby + ' -> ' + evo + ' after 2 rounds', key(j));
  if (tag) ok(G.GAME.tags.length === tags0 + 1 && G.GAME.tags[tags0].key === tag, baby + ': evolving gives a ' + tag, G.GAME.tags.map((t) => t.key));
}

done();
