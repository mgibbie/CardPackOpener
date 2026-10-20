// Pokermon pokejokers_06 (Mew -> Flaaffy): every one of the 30 jokers fired through real plays
// (act), plus each line's evolution. On the Pokermon 3.9.1 behaviour (batch 6).
//   node micatro/tests/mods/pokejokers_06_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_total_chips } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['mew', 'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion', 'totodile', 'croconaw', 'feraligatr',
  'sentret', 'furret', 'hoothoot', 'noctowl', 'ledyba', 'ledian', 'spinarak', 'ariados', 'crobat', 'chinchou', 'lanturn', 'pichu', 'cleffa',
  'igglybuff', 'togepi', 'togetic', 'natu', 'xatu', 'mareep', 'flaaffy'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 30 pokejokers_06 jokers ported',
  FILE_JOKERS.filter((n) => !STATUS.PORTED.jokers.includes('j_poke_' + n)));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_06.lua'].length === 30, 'defs: 30 from pokejokers_06.lua', STATUS.PORTED_FILES['pokemon/pokejokers_06.lua'].length);

/** Win the round with `held` cards left in hand (they see the end-of-round held pass). */
function winHolding(held) {
  clearHand();
  const h = hand(held);
  const w = winRound(hand(['S_2']));
  return { h, w };
}
const toShop = () => { if (G.STATE === STATES.SELECTING_HAND) winRound(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); };

// ---------------------------------------------------------------- Mew
{
  start('MEW');
  const m = add('j_poke_mew');
  m.ability.extra.percent = 0; // force the consumable branch
  toShop();
  const nc = G.consumeables.cards.length;
  act({ type: 'next_round' });
  const made = G.consumeables.cards[G.consumeables.cards.length - 1];
  ok(G.consumeables.cards.length === nc + 1 && made.edition && made.edition.negative && ['Tarot', 'Spectral', 'Item'].includes(made.ability.set),
    'mew: end of shop makes a Negative Tarot/Spectral/Item', made && [made.ability.set, made.edition]);
  act({ type: 'select_blind' }); clearHand();
  m.ability.extra.percent = 100; // force the joker branch
  toShop();
  const nj = G.jokers.cards.length;
  act({ type: 'next_round' });
  const j2 = G.jokers.cards[G.jokers.cards.length - 1];
  ok(G.jokers.cards.length === nj + 1 && j2 !== m && j2.edition && j2.edition.negative, 'mew: 15% -> a Negative Joker instead', G.jokers.cards.map(key));
}

// ---------------------------------------------------------------- Chikorita line
{
  start('CHIKO');
  const j = add('j_poke_chikorita');
  ok(G.hand.config.card_limit === 9, 'chikorita +1 hand size', G.hand.config.card_limit);
  let d0 = G.GAME.dollars;
  winHolding(['H_3', 'H_4', 'H_5', 'H_6', 'H_7', 'H_8']);
  ok(G.GAME.dollars === d0 + 2, 'chikorita: $1 per card held past the 4th at end of round (6 held -> $2)', G.GAME.dollars - d0);
  nextRound();
  j.ability.extra.rounds = 1;
  d0 = G.GAME.dollars;
  winHolding(['H_3', 'H_4', 'H_5', 'H_6', 'H_7', 'H_8']);
  // The evolution lands after the held-card pass (poke_evolve is an event, as in the Lua): Chikorita still pays this round.
  ok(key(j) === 'j_poke_bayleef' && G.GAME.dollars === d0 + 2, 'chikorita -> bayleef', [key(j), G.GAME.dollars - d0]);
  ok(G.hand.config.card_limit === 9, 'hand size kept across the evolution', G.hand.config.card_limit);
  nextRound();
  j.ability.extra.rounds = 1;
  d0 = G.GAME.dollars;
  winHolding(['H_3', 'H_4', 'H_5']);
  ok(key(j) === 'j_poke_meganium' && G.GAME.dollars === d0 + 1, 'bayleef: $1 per card held past the 2nd; -> meganium', [key(j), G.GAME.dollars - d0]);
  nextRound();
  d0 = G.GAME.dollars;
  winHolding(['H_3', 'H_4', 'H_5']);
  ok(G.GAME.dollars === d0 + 3, 'meganium: $1 for every held card', G.GAME.dollars - d0);
}

// ---------------------------------------------------------------- Cyndaquil line
{
  start('CYNDA');
  const d = G.GAME.current_round.discards_left;
  const j = add('j_poke_cyndaquil');
  ok(G.GAME.current_round.discards_left === d + 1, 'cyndaquil +1 discard');
  const dl = G.GAME.current_round.discards_left;
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 * dl, 'cyndaquil: +4 Mult per discard left', [r.total, dl]);
  G.GAME.current_round.discards_left = 0;
  r = play(hand(['S_K']));
  ok(r.total.mult === 1, 'cyndaquil: nothing at 0 discards', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_quilava', 'cyndaquil -> quilava', key(j));
  nextRound();
  G.GAME.current_round.discards_left = 2;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 8 * 2, 'quilava: +8 Mult per discard left', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_typhlosion', 'quilava -> typhlosion', key(j));
  nextRound();
  G.GAME.current_round.discards_left = 4;
  r = play(hand(['S_A']));
  ok(near(r.total.mult, (1 + 32) * (1 + 0.3 * 4)), 'typhlosion: +8 Mult and X(1 + 0.3) per discard left', r.total);
  ok(statusMsgs(r.events).some((m) => /Fire Blast/i.test(m)), 'typhlosion: "Fire Blast!"', statusMsgs(r.events));
}

// ---------------------------------------------------------------- Totodile line
{
  start('TOTO');
  const h0 = G.GAME.round_resets.hands;
  const j = add('j_poke_totodile');
  ok(G.GAME.round_resets.hands === h0 + 1, 'totodile +1 hand');
  let r = play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.chips === 8 && r.total.chips === 10 + 22 + 8, 'totodile: +4 chips per played card', [j.ability.extra, r.total]);
  r = play(hand(['S_K', 'H_K', 'D_K']));
  ok(j.ability.extra.chips === 20 && r.total.chips === 30 + 30 + 20, 'totodile: keeps stacking', r.total);
  const w = winRound();
  ok(j.ability.extra.chips === 0 && statusMsgs(w.events).includes(localizeReset()), 'totodile: resets at end of round', j.ability.extra);
  j.ability.extra.rounds = 1;
  nextRound(); winRound();
  ok(key(j) === 'j_poke_croconaw' && j.ability.extra.chips === 0 && j.ability.extra.chip_mod === 7, 'totodile -> croconaw', j.ability.extra);
  ok(G.GAME.round_resets.hands === h0 + 1, 'hand bonus kept across the evolution', G.GAME.round_resets.hands);
  nextRound();
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === 32 + 14, 'croconaw: +7 per played card', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_feraligatr', 'croconaw -> feraligatr', key(j));
  nextRound();
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === 32 + 20, 'feraligatr: +10 per played card', r.total);
  winRound();
  ok(j.ability.extra.chips === 0, 'feraligatr: resets at end of round', j.ability.extra);
}
function localizeReset() { return 'Reset'; }

// ---------------------------------------------------------------- Sentret / Furret
{
  start('SENT');
  const j = add('j_poke_sentret');
  let r = play(hand(['S_A']));
  ok(j.ability.extra.mult === 1 && r.total.mult === 2, 'sentret: +1 Mult on a new hand type', [j.ability.extra, r.total]);
  r = play(hand(['S_K', 'H_K']));
  ok(j.ability.extra.mult === 2 && r.total.mult === 4, 'sentret: +1 again on a different hand', r.total);
  r = play(hand(['S_Q', 'H_Q']));
  ok(j.ability.extra.mult === 0 && r.total.mult === 2, 'sentret: resets on a repeat hand', [j.ability.extra, r.total]);
  j.ability.extra.mult = 15;
  j.ability.extra.last_hand = 'Pair';
  winRound(); // High Card (new type): 16 -> evolves
  ok(key(j) === 'j_poke_furret' && j.ability.extra.mult === 16, 'sentret -> furret at 15 Mult (kept)', [key(j), j.ability.extra]);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 16, 'furret: same hand type does not reset', [r.total, j.ability.extra]);
  r = play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.mult === 17 && r.total.mult === 2 + 17, 'furret: +1 on a new hand type', r.total);
  G.GAME.last_hand_played = 'Flush';
  ok(j.config.center.loc_vars(j.config.center, [], j).vars[2] === 'Pair', 'furret: the text shows its own last hand, not the run\'s (Pokermon 3.9.1)', j.config.center.loc_vars(j.config.center, [], j).vars);
}

// ---------------------------------------------------------------- Hoothoot / Noctowl
{
  start('HOOT');
  const j = add('j_poke_hoothoot');
  ok(G.GAME.scry_amount === 2, 'hoothoot: scry 2', G.GAME.scry_amount);
  const top = [G.deck.cards[G.deck.cards.length - 1], G.deck.cards[G.deck.cards.length - 2]];
  const extra = poke_total_chips(top[0]) + poke_total_chips(top[1]);
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + extra, 'hoothoot: the 2 scried cards add their chips', [r.total, extra]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_noctowl' && G.GAME.scry_amount === 4, 'hoothoot -> noctowl (scry 4)', [key(j), G.GAME.scry_amount]);
  nextRound();
  let ex4 = 0;
  for (let i = 1; i <= 4; i++) ex4 += poke_total_chips(G.deck.cards[G.deck.cards.length - i]);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + ex4, 'noctowl: 4 scried cards add their chips', [r.total, ex4]);
  j.remove_from_deck(); G.jokers.remove_card(j);
  ok(G.GAME.scry_amount === 0, 'scry removed with the joker', G.GAME.scry_amount);
}

// ---------------------------------------------------------------- Ledyba / Ledian
{
  start('LEDY');
  const j = add('j_poke_ledyba');
  let n = G.deck.cards.length;
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + Math.floor(n / 5), 'ledyba: +1 Mult per 5 cards in deck', [r.total, n]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_ledian', 'ledyba -> ledian', key(j));
  nextRound();
  n = G.deck.cards.length;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + Math.floor(n / 3), 'ledian: +1 Mult per 3 cards in deck', [r.total, n]);
}

// ---------------------------------------------------------------- Spinarak / Ariados
{
  start('SPIN');
  const j = add('j_poke_spinarak');
  G.GAME.probabilities.normal = 1e-9;
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 40, 'spinarak: +40 chips', r.total);
  G.GAME.probabilities.normal = 1000;
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 90, 'spinarak: +90 chips on the 1 in 3', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_ariados', 'spinarak -> ariados', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 135, 'ariados: +135 on the 1 in 3', r.total);
  G.GAME.probabilities.normal = 1e-9;
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 60, 'ariados: +60 chips', r.total);
}

// ---------------------------------------------------------------- Crobat
{
  start('CROBAT');
  const j = add('j_poke_crobat');
  G.GAME.probabilities.normal = 1e-9; // no Lucky procs
  const leeched = [];
  let lr;
  for (const center of ['m_mult', 'm_bonus', 'm_glass', 'm_gold']) { const c = hand(['S_A'], { center }); leeched.push(c[0]); lr = play(c); }
  const ex = j.ability.extra;
  ok(ex.mult === 2 && ex.chips === 15 && near(ex.Xmult, 1.1) && ex.money === 1, 'crobat: gains per enhancement scored', ex);
  ok(leeched.every((c) => key(c) === 'c_base'), 'crobat: leeches the Enhancement (the card becomes a base card) (Pokermon 3.9.1)', leeched.map(key));
  ok(statusMsgs(lr.events).some((m) => /leech/i.test(m)), 'crobat: "Leech!" (Pokermon 3.9.1)', statusMsgs(lr.events));
  const four = hand(['S_K', 'H_K', 'D_K', 'C_K']);
  four[0].set_ability(P_CENTERS.m_lucky); four[1].set_ability(P_CENTERS.m_wild); four[2].set_ability(P_CENTERS.m_steel); four[3].set_ability(P_CENTERS.m_stone);
  play(four);
  ok(ex.mult === 2 + 2 * 2 && near(ex.Xmult, 1.2) && ex.chips === 30 && ex.money === 1, 'crobat: Lucky / Wild -> Mult, Steel -> XMult, Stone -> Chips (Pokermon 3.9.1)', ex);
  const before = { ...ex };
  play(hand(['S_Q']));
  ok(ex.mult === before.mult && ex.chips === before.chips, 'crobat: base cards give nothing (Pokermon 3.9.1)', ex);
  ex.mult = 2; ex.chips = 15; ex.Xmult = 1.1; ex.money = 1;
  const r = play(hand(['S_K']));
  ok(r.total.chips === 15 + 15 && near(r.total.mult, (1 + 2) * j.ability.extra.Xmult), 'crobat: +Chips +Mult XMult on every hand', [r.total, j.ability.extra]);
  ok(statusMsgs(r.events).some((m) => /Skree/i.test(m)), 'crobat: "Skree!" (poke_screech_ex)', statusMsgs(r.events));
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_crobat');
  ok(row && row.dollars === 1, 'crobat: $ at cash-out', row);
}

// ---------------------------------------------------------------- Chinchou / Lanturn
{
  start('CHINCH');
  const j = add('j_poke_chinchou');
  let d0 = G.GAME.dollars;
  let r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === 32 + 40 && G.GAME.dollars === d0 + 1, 'chinchou: Pair -> +40 chips and $1', [r.total, G.GAME.dollars - d0]);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'chinchou: nothing without a pair', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_lanturn', 'chinchou -> lanturn', key(j));
  nextRound();
  const sq = add('j_poke_squirtle'); // a Water type (its own +chips scale every hand)
  d0 = G.GAME.dollars;
  r = play(hand(['S_A', 'H_A']));
  // chips 60 + 20 * 1 Water; money 1 + 1 * 1 Lightning (itself)
  ok(r.total.chips === 32 + 80 + sq.ability.extra.chips && G.GAME.dollars === d0 + 2, 'lanturn: +20 chips per Water, +$1 per Lightning', [r.total, G.GAME.dollars - d0]);
}

// ---------------------------------------------------------------- Pichu / Cleffa / Igglybuff / Togepi (babies)
{
  start('PICHU');
  const j = add('j_poke_pichu');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 0.75 && !j.debuff, 'pichu: X0.75 Mult, no faint as rightmost', r.total);
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_pichu');
  ok(row && row.dollars === 10, 'pichu: $10 at cash-out', row);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const cat = add('j_poke_caterpie');
  r = play(hand(['S_A']));
  ok(j.debuff === true && j.ability.fainted === G.GAME.round, 'pichu faints with a non-baby to its right', [j.debuff, j.ability.fainted]);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3, 'fainted pichu does nothing for the rest of the round', r.total);
  cat.remove(); G.jokers.remove_card(cat);
  winRound();
  ok(key(j) === 'j_poke_pichu' && j.ability.extra.rounds === 1, 'pichu: no countdown in a round it fainted', j.ability.extra);
  nextRound(); winRound();
  ok(key(j) === 'j_poke_pikachu', 'pichu -> pikachu after 2 counted rounds', key(j));
}
{
  start('CLEFFA');
  const j = add('j_poke_cleffa');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.75, 'cleffa: X0.75', r.total);
  winRound();
  const moon = G.consumeables.cards.find((c) => key(c) === 'c_moon');
  ok(moon && moon.edition && moon.edition.negative, 'cleffa: a Negative Moon at end of round', G.consumeables.cards.map(key));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_clefairy' && G.consumeables.cards.filter((c) => key(c) === 'c_moon').length === 2, 'cleffa -> clefairy after 2 rounds (Moon again)', key(j));
}
{
  start('IGGLY');
  const j = add('j_poke_igglybuff');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 0.75, 'igglybuff: X0.75', r.total);
  winRound();
  const w = G.consumeables.cards.find((c) => key(c) === 'c_world');
  ok(w && w.edition && w.edition.negative, 'igglybuff: a Negative World at end of round', G.consumeables.cards.map(key));
  nextRound(); winRound();
  ok(key(j) === 'j_poke_jigglypuff', 'igglybuff -> jigglypuff', key(j));
}
{
  start('TOGEPI');
  const j = add('j_poke_togepi');
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const r = play(hand(['S_A']));
    const x = r.total.mult;
    seen.add(x);
    ok(x >= 0.5 && x <= 1.5 && near(Math.round(x * 20), x * 20), 'togepi: X0.50-X1.50 in 0.05 steps', x);
  }
  ok(seen.size > 1, 'togepi: the X Mult varies', [...seen]);
  winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_togetic', 'togepi -> togetic after 2 rounds', key(j));
}

// ---------------------------------------------------------------- Togetic
{
  start('TOGETIC');
  const j = add('j_poke_togetic');
  G.GAME.probabilities.normal = 1000; // both Togetic rolls hit (and the Lucky Card's own +20 Mult / $20)
  const d0 = G.GAME.dollars;
  let r = play(hand(['S_A'], { center: 'm_lucky' }));
  ok(r.total.chips === 16 + 100 && near(r.total.mult, (1 + 20) * 1.5) && G.GAME.dollars === d0 + 20, 'togetic: Lucky cards +100 chips and X1.5', [r.total, G.GAME.dollars - d0]);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 && r.total.mult === 1, 'togetic: only Lucky cards', r.total);
  G.GAME.probabilities.normal = 1e-9;
  r = play(hand(['S_A'], { center: 'm_lucky' }));
  ok(r.total.chips === 16 && r.total.mult === 1, 'togetic: no proc on a miss', r.total);
  j.ability.extra.evolve = true; // what a Shiny Stone sets
  winRound();
  ok(key(j) === 'j_poke_togekiss', 'togetic -> togekiss with a Shiny Stone', key(j));
}

// ---------------------------------------------------------------- Natu / Xatu
{
  start('NATU', {}, { noBlind: true });
  const j = add('j_poke_natu');
  act({ type: 'select_blind' }); clearHand();
  const merc = add('c_mercury');
  const l0 = G.GAME.hands.Pair.level;
  ok(act({ type: 'use', id: merc.sort_id }).ok, 'mercury used');
  ok(G.GAME.hands.Pair.level === l0 + 2, 'natu: a Planet levels its hand an extra time (Pokermon 3.9.1 poker_hand_changed)', G.GAME.hands.Pair.level);
  const hc = G.GAME.hands['High Card'].level;
  play(hand(['S_A']));
  ok(G.GAME.hands['High Card'].level === hc, 'natu: no level outside Planets', G.GAME.hands['High Card'].level);
  const merc2 = add('c_mercury');
  act({ type: 'use', id: merc2.sort_id });
  ok(G.GAME.hands.Pair.level === l0 + 4 && G.GAME.hands['High Card'].level === hc, 'natu: only the planet\'s hand (Pokermon 3.9.1)', [G.GAME.hands.Pair.level, G.GAME.hands['High Card'].level]);
  const bh = add('c_black_hole');
  const pl = G.GAME.hands.Pair.level;
  act({ type: 'use', id: bh.sort_id });
  ok(G.GAME.hands.Pair.level === pl + 1, 'natu: a Spectral (Black Hole) gets no extra level (Pokermon 3.9.1)', G.GAME.hands.Pair.level);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_xatu', 'natu -> xatu', key(j));
  act({ type: 'cash_out' });
  const venus = add('c_venus');
  const t0 = G.GAME.hands['Three of a Kind'].level;
  act({ type: 'use', id: venus.sort_id });
  ok(G.GAME.hands['Three of a Kind'].level === t0 + 2, 'xatu: a Planet levels its hand an extra time (Pokermon 3.9.1)', G.GAME.hands['Three of a Kind'].level);
}
{
  start('XATU');
  const j = add('j_poke_xatu');
  winRound(); act({ type: 'cash_out' });
  G.GAME.last_hand_played = 'Pair';
  ok(j.config.center.loc_vars(j.config.center, [], j).vars[0] === 'Pair', 'xatu: the text shows the last played hand (Pokermon 3.9.1)', j.config.center.loc_vars(j.config.center, [], j).vars);
  const n0 = G.consumeables.cards.length;
  const pack = G.shop_booster.cards[0];
  pack.set_ability(P_CENTERS.p_celestial_normal_1);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pack.sort_id });
  G.E_MANAGER.flush();
  const made = G.consumeables.cards.slice(n0).map(key);
  ok(made.length === 1 && made[0] === 'c_mercury', 'xatu: opening a Celestial Pack creates the last hand\'s Planet (Pokermon 3.9.1)', made);
}

// ---------------------------------------------------------------- Mareep / Flaaffy
{
  start('MAREEP');
  const j = add('j_poke_mareep');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'mareep: X1 does nothing', r.total);
  // Cryptid: 2 copies of a card -> playing_card_added.
  clearHand();
  const tgt = hand(['S_K']);
  const cr = add('c_cryptid');
  ok(act({ type: 'use', id: cr.sort_id, targets: [tgt[0].sort_id] }).ok, 'cryptid used');
  ok(near(j.ability.extra.Xmult, 1.1), 'mareep: +X0.1 when cards are added', j.ability.extra.Xmult);
  clearHand();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.1), 'mareep: X1.1', r.total);
  // Hanged Man destroys cards -> remove_playing_cards.
  clearHand();
  const hm = hand(['S_3', 'S_4']);
  const hang = add('c_hanged_man');
  ok(act({ type: 'use', id: hang.sort_id, targets: hm.map((c) => c.sort_id) }).ok, 'hanged man used');
  ok(near(j.ability.extra.Xmult, 1.0), 'mareep: -X0.1 when cards are destroyed', j.ability.extra.Xmult);
  j.ability.extra.Xmult = 1.5;
  clearHand();
  winRound();
  ok(key(j) === 'j_poke_flaaffy' && near(j.ability.extra.Xmult, 1.5) && j.ability.extra.Xmult_mod === 0.25, 'mareep -> flaaffy at X1.5 (kept)', j.ability.extra);
  nextRound();
  const tgt2 = hand(['S_K']);
  const cr2 = add('c_cryptid');
  act({ type: 'use', id: cr2.sort_id, targets: [tgt2[0].sort_id] });
  ok(near(j.ability.extra.Xmult, 1.75), 'flaaffy: +X0.25 per add', j.ability.extra.Xmult);
  j.ability.extra.Xmult = 2.5;
  clearHand();
  winRound();
  ok(key(j) === 'j_poke_ampharos' && near(j.ability.extra.Xmult, 2.5), 'flaaffy -> ampharos at X2.5 (kept)', j.ability.extra);
}

done();
