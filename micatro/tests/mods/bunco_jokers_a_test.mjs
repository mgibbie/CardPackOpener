// Bunco jokers, part A (micatro/mods/bunco/jokers_a.js): every joker fired through real act() plays with the
// mod's numbers, every describe() filled, and one test per intended-design fix (each fails reverted).
//   node micatro/tests/mods/bunco_jokers_a_test.mjs
import {
  ok, near, done, flush, start, clearHand, hand, add, clearJokers, play, discard, winRound, nextRound, toShop,
  msgs, tot, filled, G, P_CENTERS, P_CARDS, act, STATES,
} from './bunco_helpers.mjs';
import { P_CENTER_POOLS, create_card, ease_dollars, create_playing_card } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { centers } from '../../mods/bunco/jokers_a.js';

const SLUGS = 'cassette mosaic voxel crop_circles xray dread prehistoric linocut ghost_print loan_shark basement shepherd knight jmjb dogs_playing_poker righthook fiendish carnival sledgehammer doorhanger fingerprints zero_shapiro nil_bill bierdeckel registration_plate'.split(' ');
const KEYS = SLUGS.map((k) => 'j_bunc_' + k);

// ------------------------------------------------------------------ off
start('BJAOFF', { mods: [] });
ok(!KEYS.some((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'off: no part-A joker in the pool');

// ------------------------------------------------------------------ registration / describe
start('BJAON');
ok(centers.length === 25 && centers.every((c, i) => c.key === KEYS[i]), '25 jokers in the Lua order', centers.map((c) => c.key));
ok(P_CENTERS.j_bunc_cassette.cost === 5 && P_CENTERS.j_bunc_carnival.rarity === 3 && P_CENTERS.j_bunc_crop_circles.rarity === 1 && P_CENTERS.j_bunc_loan_shark.pos.x === 0 && P_CENTERS.j_bunc_loan_shark.pos.y === 1, 'data: cost / rarity / pos');
for (const k of KEYS) {
  const c = add(k);
  ok(filled(describe(c)), 'describe filled: ' + k, describe(c));
  ok(filled(describeCenter(k)), 'describeCenter filled: ' + k, describeCenter(k));
  c.remove(); flush();
}
ok(P_CENTERS.m_glass.config.Xmult === 2 && P_CENTERS.m_glass.config.extra === 4, 'Glass back to X2 / 1 in 4 after the describe loop', P_CENTERS.m_glass.config);

const hc = (k = 'S_2') => play(hand([k]));

{ // Cassette: A side +45 chips on light suits; discard flips to B: +6 Mult on dark suits
  start('BJA1'); const c = add('j_bunc_cassette');
  let r = hc('H_2'); ok(r.total.chips === 5 + 2 + 45 && r.total.mult === 1, 'Cassette A: Heart +45 chips', tot(r));
  r = hc('S_2'); ok(r.total.chips === 7 && r.total.mult === 1, 'Cassette A: Spade nothing', tot(r));
  ok(describe(c).name.includes('A Side'), 'Cassette describe A side', describe(c).name);
  discard(hand(['D_9'])); flush();
  ok(c.ability.extra.side === 'B' && c.facing === 'front', 'Cassette flipped to B on discard (stays face up)', [c.ability.extra.side, c.facing]);
  ok(P_CENTERS.j_bunc_cassette.get_pos(P_CENTERS.j_bunc_cassette, c).x === 1, 'Cassette B art cell');
  r = hc('C_2'); ok(r.total.chips === 7 && r.total.mult === 7, 'Cassette B: Club +6 Mult', tot(r));
  r = hc('H_2'); ok(r.total.mult === 1 && r.total.chips === 7, 'Cassette B: Heart nothing', tot(r));
  ok(describe(c).name.includes('B Side') && filled(describe(c)), 'Cassette describe B side', describe(c));
  if (P_CARDS.bunc_FLEURON_2) {
    discard(hand(['D_9'])); flush();
    r = hc('bunc_FLEURON_2'); ok(r.total.chips >= 45 + 2, 'Cassette A: Fleurons are light', tot(r));
  } else ok(false, 'exotic suits not registered yet (systems.js)');
}

{ // Mosaic: Stone cards +6 Mult; in_pool only with a Stone card
  start('BJA2');
  ok(!P_CENTERS.j_bunc_mosaic.in_pool(P_CENTERS.j_bunc_mosaic), 'Mosaic not in pool without Stones');
  add('j_bunc_mosaic');
  const r = play(hand(['S_2'], 'm_stone'));
  ok(r.total.mult === 7, 'Mosaic +6 on Stone', tot(r));
  ok(P_CENTERS.j_bunc_mosaic.in_pool(P_CENTERS.j_bunc_mosaic), 'Mosaic in pool with a Stone card');
}

{ // Voxel: X3, -X0.1 per Enhanced card in the full deck
  start('BJA3'); const v = add('j_bunc_voxel');
  let r = hc(); ok(near(r.total.mult, 3), 'Voxel X3 with no Enhanced cards', tot(r));
  for (const c of G.playing_cards.slice(0, 5)) c.set_ability(P_CENTERS.m_bonus);
  r = hc(); ok(near(r.total.mult, 2.5) && near(v.ability.extra.xmult, 2.5) && v.ability.extra.tally === 5, 'Voxel X2.5 with 5 Enhanced', tot(r));
  for (const c of G.playing_cards.slice(0, 30)) c.set_ability(P_CENTERS.m_bonus);
  r = hc(); ok(r.total.mult === 1 && v.ability.extra.xmult === 1, 'Voxel floors at X1 (no effect)', tot(r));
}

{ // Crop Circles
  start('BJA4'); add('j_bunc_crop_circles');
  const m = (k) => hc(k).total.mult - 1;
  ok(m('C_8') === 5 && m('C_Q') === 4 && m('C_A') === 3 && m('H_8') === 2 && m('H_9') === 1 && m('H_A') === 0, 'Crop Circles Clubs 3/4/5, 8s +2, Q/10/9/6 +1');
  if (P_CARDS.bunc_FLEURON_8) ok(m('bunc_FLEURON_8') === 6 && m('bunc_FLEURON_6') === 5 && m('bunc_FLEURON_A') === 4, 'Crop Circles Fleurons 4/5/6');
  else ok(false, 'exotic suits not registered yet (systems.js)');
  const s = play(hand(['C_8'], 'm_stone')); ok(s.total.mult === 1, 'Crop Circles ignores Stone cards', tot(s));
}

{ // X-Ray: +X0.2 per card drawn face down
  start('BJA5'); const x = add('j_bunc_xray');
  let r = hc(); ok(r.total.mult === 1, 'X-Ray X1 does nothing');
  const c = G.deck.cards[G.deck.cards.length - 1];
  G.deck.remove_card(c); G.hand.emplace(c, null, true); flush();
  ok(c.facing === 'back' && near(x.ability.extra.xmult, 1.2), 'X-Ray +X0.2 for a face-down draw', x.ability.extra.xmult);
  const d = G.deck.cards[G.deck.cards.length - 1]; G.deck.remove_card(d); G.hand.emplace(d); flush();
  ok(near(x.ability.extra.xmult, 1.2), 'X-Ray ignores a face-up draw');
  clearHand();
  r = hc(); ok(near(r.total.mult, 1.2), 'X-Ray X1.2', tot(r));
}

const dreadLast = (cards) => { // play the LAST hand of the round (and win it)
  G.GAME.current_round.hands_left = 1;
  G.GAME.chips = 0; G.GAME.blind.chips = 1;
  return play(cards, { left: 0, keepChips: true });
};
{ // Dread: last hand: +2 levels and the played cards destroyed; levels lost when Dread goes
  start('BJA6'); const d = add('j_bunc_dread');
  const n0 = G.playing_cards.length;
  const cards = hand(['S_5', 'H_5']);
  dreadLast(cards); flush();
  ok(G.GAME.hands.Pair.level === 3, 'Dread: Pair +2 levels', G.GAME.hands.Pair.level);
  ok(cards.every((c) => !G.playing_cards.includes(c)) && G.playing_cards.length === n0, 'Dread destroyed the played cards', G.playing_cards.length - n0);
  d.remove(); flush();
  ok(G.GAME.hands.Pair.level === 1, 'Dread removed: levels lost', G.GAME.hands.Pair.level);
}
{ // FIX 2: a debuff doesn't take Dread's levels away (and the real removal takes them once)
  start('BJA6B'); const d = add('j_bunc_dread');
  dreadLast(hand(['S_5', 'H_5'])); flush();
  ok(G.GAME.hands.Pair.level === 3, 'Dread +2 (fix setup)');
  d.set_debuff(true); flush();
  ok(d.debuff && G.GAME.hands.Pair.level === 3, 'FIX: debuffed Dread keeps the levels', G.GAME.hands.Pair.level);
  d.set_debuff(false); flush();
  d.remove(); flush();
  ok(G.GAME.hands.Pair.level === 1, 'FIX: removal takes them once (level 1, not below)', G.GAME.hands.Pair.level);
}
{ // Dread copy: no levels to take back
  start('BJA6C'); const d = add('j_bunc_dread');
  dreadLast(hand(['S_5', 'H_5'])); flush();
  const { copy_card } = await import('../../js/engine/core.js');
  const cp = copy_card(d); cp.add_to_deck(); G.jokers.emplace(cp); flush();
  ok(Object.keys(cp.ability.extra.level_up_list).length === 0, 'Dread copy has an empty level list');
  cp.remove(); flush();
  ok(G.GAME.hands.Pair.level === 3, 'removing the copy keeps the levels', G.GAME.hands.Pair.level);
}

{ // Prehistoric: +16 Mult for a card sharing rank and suit with a card already scored this round
  start('BJA7'); add('j_bunc_prehistoric');
  let r = hc('S_5'); ok(r.total.mult === 1, 'Prehistoric first 5 of Spades: nothing', tot(r));
  r = hc('H_5'); ok(r.total.mult === 1, 'Prehistoric 5 of Hearts: nothing');
  r = hc('S_5'); ok(r.total.mult === 17, 'Prehistoric second 5 of Spades: +16', tot(r));
  nextRound();
  r = hc('S_5'); ok(r.total.mult === 1, 'Prehistoric list cleared at end of round', tot(r));
}

{ // Linocut: exactly 2 cards making a Pair: left card takes the right card's suit
  start('BJA8'); add('j_bunc_linocut');
  const [a, b] = hand(['H_5', 'S_5']);
  const r = play([a, b]); flush();
  ok(a.base.suit === 'Spades' && b.base.suit === 'Spades', 'Linocut: left card is now a Spade', [a.base.suit, b.base.suit]);
  ok(msgs(r.events).includes('Copied!'), 'Linocut message', msgs(r.events));
  const [c, d, e] = hand(['H_7', 'S_7', 'D_7']); play([c, d, e]); flush();
  ok(c.base.suit === 'Hearts', 'Linocut: not with 3 cards');
}

{ // Ghost Print: the last hand type's chips and mult
  start('BJA9'); const g = add('j_bunc_ghost_print');
  let r = play(hand(['S_5', 'H_5'])); ok(r.total.chips === 20 && r.total.mult === 2, 'Ghost Print: nothing on the first hand', tot(r));
  ok(describe(g).lines.join(' ').includes('Pair'), 'Ghost Print shows Pair', describe(g).lines);
  r = hc('S_2'); ok(r.total.chips === 5 + 2 + 10 && r.total.mult === 1 + 2, 'Ghost Print: +Pair (10 / 2) on a High Card', tot(r));
}

{ // Loan Shark: $50 when acquired, sells for -$100
  start('BJA10', { noBlind: true });
  const d0 = G.GAME.dollars;
  const l = add('j_bunc_loan_shark');
  ok(G.GAME.dollars === d0 + 50 && l.sell_cost === -100, 'Loan Shark +$50, sell -$100', [G.GAME.dollars - d0, l.sell_cost]);
  // FIX 3: a debuff cycle doesn't pay again
  l.set_debuff(true); l.set_debuff(false); flush();
  ok(G.GAME.dollars === d0 + 50, 'FIX: Loan Shark pays only once (debuff / un-debuff)', G.GAME.dollars - d0);
}

{ // Basement: a Spectral after defeating the Boss Blind
  start('BJA11'); add('j_bunc_basement');
  winRound(); flush();
  ok(G.consumeables.cards.length === 0, 'Basement: nothing after a Small Blind');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.boss, 'at the boss');
  winRound(); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'Basement: a Spectral after the Boss', G.consumeables.cards.map((c) => c.config.center.key));
}

{ // Shepherd: +6 chips per hand with a Pair
  start('BJA12'); const s = add('j_bunc_shepherd');
  let r = play(hand(['S_5', 'H_5'])); ok(r.total.chips === 10 + 10 + 6, 'Shepherd +6 on a Pair', tot(r));
  r = play(hand(['S_5', 'H_5', 'S_9', 'H_9'])); ok(s.ability.extra.chips === 12 && r.total.chips === 20 + 28 + 12, 'Shepherd +12 on Two Pair', tot(r));
  r = hc(); ok(r.total.chips === 7 + 12, 'Shepherd keeps +12 on a High Card', tot(r));
}

{ // Knight: +6 Mult per blind (shuffles jokers), resets when jokers are rearranged
  start('BJA13', { noBlind: true });
  const k = add('j_bunc_knight'); add('j_joker');
  act({ type: 'select_blind' }); clearHand();
  ok(k.ability.extra.mult === 6, 'Knight +6 on blind select', k.ability.extra.mult);
  let r = hc(); ok(r.total.mult === 1 + 6 + 4, 'Knight +6 Mult (with Joker)', tot(r));
  act({ type: 'reorder', area: 'jokers', ids: G.jokers.cards.map((c) => c.sort_id) });
  ok(k.ability.extra.mult === 6, 'Knight: same order is no rearrangement');
  act({ type: 'reorder', area: 'jokers', ids: G.jokers.cards.map((c) => c.sort_id).reverse() });
  ok(k.ability.extra.mult === 0, 'Knight reset by a rearrangement', k.ability.extra.mult);
  // FIX 4: every Knight resets
  const k2 = add('j_bunc_knight');
  k.ability.extra.mult = 12; k2.ability.extra.mult = 6;
  const ids = G.jokers.cards.map((c) => c.sort_id);
  act({ type: 'reorder', area: 'jokers', ids: [ids[2], ids[0], ids[1]] });
  ok(k.ability.extra.mult === 0 && k2.ability.extra.mult === 0, 'FIX: both Knights reset', [k.ability.extra.mult, k2.ability.extra.mult]);
}

{ // JMJB: always has a (non-Negative) edition; Standard packs only have Enhanced cards
  start('BJA14'); add('j_bunc_jmjb');
  let all = true;
  for (let i = 0; i < 20; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, 'j_bunc_jmjb'); if (!c.edition || c.edition.negative) all = false; }
  ok(all, 'JMJB created with an edition, never Negative');
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const b = G.shop_booster.cards[0];
  G.shop_booster.remove_card(b);
  const sb = new (b.constructor)(P_CARDS.empty, P_CENTERS.p_standard_mega_1);
  G.shop_booster.emplace(sb);
  act({ type: 'buy', id: sb.sort_id }); flush();
  ok(G.pack_cards.cards.length === 5 && G.pack_cards.cards.every((c) => c.ability.set === 'Enhanced'), 'JMJB: Standard pack all Enhanced', G.pack_cards.cards.map((c) => c.config.center.key));
}

{ // Dogs Playing Poker: X2.5 if every scored rank is 2-5
  start('BJA15'); add('j_bunc_dogs_playing_poker');
  let r = play(hand(['S_2', 'H_2'])); ok(r.total.mult === 5, 'Dogs X2.5 on 2s', tot(r));
  r = play(hand(['S_6', 'H_6'])); ok(r.total.mult === 2, 'Dogs nothing on 6s', tot(r));
  // (5.4.8b: a rankless scored card — a Stone Card too — breaks it; 5.1 skipped Stone Cards)
  r = play(hand(['S_K'], 'm_stone').concat(hand(['D_3']))); ok(r.total.mult === 1, 'Dogs (5.4.8b): a Stone card breaks it', tot(r));
}

{ // Righthook: retrigger the rightmost scored card once per remaining hand
  start('BJA16'); add('j_bunc_righthook');
  G.GAME.current_round.hands_left = 4;
  const r = play(hand(['S_2', 'H_9']), { left: 4 });
  ok(r.total.chips === 5 + 9 * 4, 'Righthook: the 9 scored 1 + 3 times', tot(r));
  const r2 = play(hand(['S_5', 'H_5']), { left: 4 });
  ok(r2.total.chips === 10 + 5 + 5 * 4, 'Righthook: rightmost 5 scored 4 times (3 hands left)', tot(r2));
}

{ // Fiendish: money doubled, 1 in 3 just $1
  start('BJA17'); add('j_bunc_fiendish');
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const d0 = G.GAME.dollars; ease_dollars(5); flush(); seen.add(G.GAME.dollars - d0); }
  ok(seen.has(10) && seen.has(1) && seen.size === 2, 'Fiendish: $10 or $1 for a $5 gain', [...seen]);
  const d0 = G.GAME.dollars; ease_dollars(-3); flush();
  ok(G.GAME.dollars === d0 - 3, 'Fiendish ignores spending');
}

{ // Carnival: after a Boss, destroy a random Joker and go back an Ante; then only on a greater Ante
  start('BJA18'); const c = add('j_bunc_carnival'); const j = add('j_joker');
  act({ type: 'select_blind' }); // (already in Small)
  G.GAME.round_resets.ante = 1;
  for (let i = 0; i < 2; i++) { winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); }
  ok(G.GAME.blind.boss, 'at the boss');
  winRound(); flush();
  ok(!G.jokers.cards.includes(j) && G.GAME.round_resets.ante === 1 && c.ability.extra.ante === 1, 'Carnival destroyed Joker and looped the Ante', [G.GAME.round_resets.ante, c.ability.extra.ante]);
  ok(describe(c).lines.join(' ').includes('inactive'), 'Carnival inactive now', describe(c).lines);
}

{ // Sledgehammer: Glass +X1 and guaranteed to break; FIX 1: a debuff cycle is symmetric
  start('BJA19');
  const s = add('j_bunc_sledgehammer'); const nb = add('j_bunc_nil_bill');
  ok(P_CENTERS.m_glass.config.Xmult === 3 && P_CENTERS.m_glass.config.extra === 1, 'Sledgehammer: Glass X3, 1 in 1');
  const d0 = G.GAME.dollars;
  const [g] = hand(['S_2'], 'm_glass');
  ok(g.ability.x_mult === 3 && g.ability.extra === 1, 'new Glass card X3 / 1 in 1', g.ability);
  const r = play([g]); flush();
  ok(near(r.total.mult, 3) && !G.playing_cards.includes(g), 'Glass X3 and broke', tot(r));
  ok(G.GAME.dollars === d0 + 2, 'Nil Bill +$2 for the broken card', G.GAME.dollars - d0);
  const s2 = add('j_bunc_sledgehammer');
  ok(P_CENTERS.m_glass.config.Xmult === 4 && P_CENTERS.m_glass.config.extra === 1, 'two Sledgehammers: X4, still 1 in 1');
  s2.remove(); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 3 && P_CENTERS.m_glass.config.extra === 1, 'one left: X3, 1 in 1');
  const [g2] = hand(['S_3'], 'm_glass');
  act({ type: 'sell', id: s.sort_id }); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 2 && P_CENTERS.m_glass.config.extra === 4, 'last Sledgehammer sold: Glass X2, 1 in 4', P_CENTERS.m_glass.config);
  ok(g2.ability.x_mult === 2 && g2.ability.extra === 4, 'deck Glass back to X2 / 1 in 4', [g2.ability.x_mult, g2.ability.extra]);
  // FIX 1: a debuff cycle (remove_from_deck / add_to_deck from_debuff) is symmetric
  const s3 = add('j_bunc_sledgehammer');
  s3.set_debuff(true); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 2 && P_CENTERS.m_glass.config.extra === 4, 'FIX: debuffed Sledgehammer: Glass X2, 1 in 4', P_CENTERS.m_glass.config);
  s3.set_debuff(false); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 3 && P_CENTERS.m_glass.config.extra === 1, 'FIX: re-enabled: X3, 1 in 1', P_CENTERS.m_glass.config);
  s3.remove(); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 2 && P_CENTERS.m_glass.config.extra === 4, 'FIX: removed after a debuff cycle: X2, 1 in 4', P_CENTERS.m_glass.config);
  add('j_bunc_sledgehammer');
  newRun({ seed: 'BJA19B', back: 'b_red', mods: ['bunco'] }); flush();
  ok(P_CENTERS.m_glass.config.Xmult === 2 && P_CENTERS.m_glass.config.extra === 4, 'reset_run: Glass vanilla at a new run');
  nb;
}

{ // Doorhanger: no Commons
  start('BJA20'); add('j_bunc_doorhanger');
  const rar = [];
  for (let i = 0; i < 40; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, null, 'dh' + i); rar.push(c.config.center.rarity); }
  ok(!rar.includes(1) && rar.includes(2), 'Doorhanger: no Common jokers', rar);
}

{ // Fingerprints: winning hand's scored cards +50 chips until end of the next round
  start('BJA21'); add('j_bunc_fingerprints');
  const [a] = hand(['S_A']);
  play([a]);
  const [b] = hand(['S_K']);
  G.GAME.chips = 0; G.GAME.blind.chips = 1;
  play([b], { keepChips: true }); flush();
  ok(b.ability.temporary_extra_chips === 50 && !a.ability.temporary_extra_chips, 'Fingerprints: the winning hand\'s card +50', [b.ability.temporary_extra_chips, a.ability.temporary_extra_chips]);
  ok(b.get_chip_bonus() === 10 + 50, 'chip bonus 60', b.get_chip_bonus());
}

{ // Zero Shapiro: scored K/Q/J or rankless: 1 in 8 a D6 Tag
  start('BJA22'); add('j_bunc_zero_shapiro');
  G.GAME.probabilities.normal = 8;
  hc('S_2'); flush();
  ok(!G.GAME.tags.some((t) => t.key === 'tag_d_six'), 'Zero Shapiro: not on a 2');
  const r = hc('S_K'); flush();
  ok(G.GAME.tags.filter((t) => t.key === 'tag_d_six').length === 1, 'Zero Shapiro: D6 Tag on a King', G.GAME.tags.map((t) => t.key));
  ok(msgs(r.events).some((m) => /D6/.test(m)), 'Zero Shapiro message', msgs(r.events));
  hc('S_A'); flush();
  ok(G.GAME.tags.filter((t) => t.key === 'tag_d_six').length === 1, 'Zero Shapiro: not on an Ace');
}

{ // Bierdeckel: after play / discard, held cards +10 chips until end of round
  start('BJA24'); add('j_bunc_bierdeckel');
  const [p, h1, h2] = hand(['S_2', 'H_9', 'D_9']);
  play([p], { keepHand: true }); flush();
  ok(h1.ability.temporary_extra_chips === 10 && h2.ability.temporary_extra_chips === 10 && !p.ability.temporary_extra_chips, 'Bierdeckel +10 held after play');
  discard([h1]); flush();
  ok(h2.ability.temporary_extra_chips === 20 && h1.ability.temporary_extra_chips === 10, 'Bierdeckel +10 held after discard (not the discarded)', [h1.ability.temporary_extra_chips, h2.ability.temporary_extra_chips]);
  const r = play([h2]); ok(r.total.chips === 5 + 9 + 20, 'held card scores its +20', tot(r));
  nextRound();
  ok(!h2.ability.temporary_extra_chips, 'gone at end of round');
}

{ // Registration Plate: 5 random ranks from the deck, re-rolled every round
  start('BJA25'); const p = add('j_bunc_registration_plate');
  const e = p.ability.extra;
  ok(Array.isArray(e.ranks) && e.ranks.length === 5 && e.ranks.every((x) => x >= 2 && x <= 14), 'Registration Plate: 5 rank ids', e.ranks);
  ok(/^[^,]+, [^,]+, [^,]+, [^,]+ and \S+$/.test(e.combination) && describe(p).lines[0] === e.combination, 'combination text', [e.combination, describe(p).lines[0]]);
  const before = e.ranks.join();
  let changed = false;
  for (let i = 0; i < 3; i++) { nextRound(); if (p.ability.extra.ranks.join() !== before) changed = true; }
  ok(changed, 'Registration Plate re-rolls at end of round');
  ok(describeCenter('j_bunc_registration_plate').lines[0].startsWith('2, 3, 4, 5 and 6'), 'collection text');
}

done();
