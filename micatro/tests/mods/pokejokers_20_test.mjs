// Pokermon pokejokers_20 (Zoroark -> Ferrothorn): all 11 jokers fired through real plays (act),
// plus every evolution. (Zoroark's copy is covered with Zorua in pokejokers_19_test.)
//   node micatro/tests/mods/pokejokers_20_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { create_card } from '../../js/engine/core.js';
import { has_enhancement } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const NAMES = ['zoroark', 'gothita', 'gothorita', 'gothitelle', 'vanillite', 'vanillish', 'vanilluxe', 'frillish', 'jellicent', 'ferroseed', 'ferrothorn'];
ok(NAMES.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 11 pokejokers_20 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_20.lua'] || []).length === 13, 'defs: 13 from pokejokers_20.lua (+ 2 new in 3.9.1, new-jokers sub-batch 15)');
const rounds = (n) => { for (let i = 0; i < n; i++) { winRound(); if (i < n - 1) nextRound(); } };
function discard(cards) { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); }

// ------------------------------------------------------------- Zoroark (static)
{
  start('ZOROARK');
  const s = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_zoroark');
  const ill = P_CENTERS[s.ability.extra.hidden_key];
  ok(ill && ill.rarity === 'poke_safari' && ill.ptype !== 'Dark', 'zoroark: a shop Zoroark shows a Safari, non-Dark Illusion (never itself) (Pokermon 3.9.1)', s.ability.extra.hidden_key);
  const z = add('j_poke_zoroark');
  ok(z.ability.extra.hidden_key === undefined, 'zoroark: no Illusion in the joker row (Pokermon 3.9.1)');
  add('j_joker');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 9, 'zoroark: copies the rightmost joker', r.total);
}

// ------------------------------------------------------------- Gothita line
{
  start('GOTHITA');
  const p = add('c_mercury');
  ok(p.cost === 3, 'planet costs $3', p.cost);
  const j = add('j_poke_gothita');
  ok(p.cost === 1, 'gothita: planets cost $2 less', p.cost);
  rounds(4);
  ok(key(j) === 'j_poke_gothorita', 'gothita -> gothorita after 4 rounds', key(j));
  act({ type: 'cash_out' });
  const p2 = G.consumeables.cards.find((c) => key(c) === 'c_mercury');
  p2.set_cost();
  ok(p2.cost === 0, 'gothorita: planets cost $3 less', p2.cost);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  rounds(4);
  ok(key(j) === 'j_poke_gothitelle', 'gothorita -> gothitelle after 4 rounds', key(j));
  act({ type: 'cash_out' });
  const d0 = G.GAME.dollars;
  ok(act({ type: 'use', id: p2.sort_id }).ok !== false, 'use a planet');
  ok(G.GAME.dollars === d0 + 2, 'gothitelle: $2 per Planet used', G.GAME.dollars - d0);
  j.remove_from_deck && G.jokers.cards.length;
  act({ type: 'sell', id: j.sort_id });
  const p3 = add('c_venus');
  ok(p3.cost === 3, 'discount gone after selling', p3.cost);
}

// ------------------------------------------------------------- Vanillite line
{
  start('VANILLITE');
  const j = add('j_poke_vanillite');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 60 && j.ability.extra.chips === 50, 'vanillite: +60 chips, then -10', { t: r.total, c: j.ability.extra.chips });
  ok(statusMsgs(r.events).includes('-10 Chips') || statusMsgs(r.events).some((m) => /-10/.test(m)), 'vanillite: "-10" popup', statusMsgs(r.events));
  const other = add('j_joker');
  act({ type: 'reorder', area: 'jokers', ids: [other.sort_id, j.sort_id] });
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 && j.ability.extra.chips === 50, 'vanillite: inactive unless leftmost (volatile)', { t: r.total, c: j.ability.extra.chips });
  act({ type: 'reorder', area: 'jokers', ids: [j.sort_id, other.sort_id] });
  j.ability.extra.chips = 10;
  r = play(hand(['S_A']));
  winRound();
  ok(!G.jokers.cards.includes(j), 'vanillite: melts at 0', G.jokers.cards.map(key));
}
{
  start('VANILLISH');
  const j = add('j_poke_vanillite');
  rounds(3);
  ok(key(j) === 'j_poke_vanillish' && j.ability.extra.chips === 100, 'vanillite -> vanillish after 3 rounds', j.ability.extra);
  nextRound();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 116 && j.ability.extra.chips === 90, 'vanillish: +100 chips, then -10', r.total);
  winRound(); nextRound(); winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_vanilluxe' && j.ability.extra.chips === 140, 'vanillish -> vanilluxe', j.ability.extra);
  nextRound();
  const other = add('j_joker');
  act({ type: 'reorder', area: 'jokers', ids: [other.sort_id, j.sort_id] });
  let r2 = play(hand(['S_A']));
  ok(r2.total.chips === 16 + 140 && j.ability.extra.chips === 130, 'vanilluxe: +140 chips anywhere, then -10', r2.total);
  j.ability.extra.chips = 10;
  const t0 = G.GAME.tags.length;
  r2 = play(hand(['S_K']));
  ok(!G.jokers.cards.includes(j) && G.GAME.tags.length === t0 + 2 && G.GAME.tags.slice(-2).every((t) => t.key === 'tag_double'), 'vanilluxe: melts into 2 Double Tags', G.GAME.tags.map((t) => t.key));
}
{
  // Pokermon 3.9.1: the Vanillite line is Blueprint-compatible (a copy scores the chips; the melt count is the original's).
  start('VANILLA_BP');
  const bp = add('j_blueprint');
  const j = add('j_poke_vanilluxe');
  void bp;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 140 + 140 && j.ability.extra.chips === 130, 'vanilluxe: Blueprint copies its +140 Chips, it loses 10 once (Pokermon 3.9.1)', { t: r.total, c: j.ability.extra.chips });
  // An Eternal Vanillite stays when it would melt (SMODS.destroy_cards keeps Eternal cards).
  start('VANILLA_ETERNAL');
  const v = add('j_poke_vanillite');
  v.ability.eternal = true;
  v.ability.extra.chips = 10;
  const r2 = play(hand(['S_A']));
  ok(G.jokers.cards.includes(v) && statusMsgs(r2.events).some((m) => /Melted/i.test(m)), 'vanillite: an Eternal one says "Melted!" but stays (SMODS.destroy_cards) (Pokermon 3.9.1)', statusMsgs(r2.events));
}

// ------------------------------------------------------------- Frillish / Jellicent
{
  start('FRILLISH');
  const j = add('j_poke_frillish');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'frillish: 0 chips at first', r.total);
  discard(hand(['S_J', 'H_Q', 'D_3']));
  ok(j.ability.extra.chips === 4, 'frillish: +2 chips per discarded face card', j.ability.extra.chips);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 20, 'frillish: scores its chips', r.total);
  j.ability.extra.chips = 60;
  winRound();
  ok(key(j) === 'j_poke_jellicent' && j.ability.extra.chips === 60, 'frillish -> jellicent at 60 chips', j.ability.extra);
  nextRound();
  discard(hand(['S_J', 'H_Q', 'D_K', 'C_4']));
  ok(j.ability.extra.chips === 60 + 4 + 8 + 8, 'jellicent: +4 per Jack, +8 per Queen/King discarded', j.ability.extra.chips);
  clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 80, 'jellicent: scores its chips', r.total);
}

// ------------------------------------------------------------- Ferroseed / Ferrothorn
{
  start('FERROSEED');
  const j = add('j_poke_ferroseed');
  const [w] = hand(['H_2'], { center: 'm_wild' });
  const [hz] = hand(['D_3'], { center: 'm_poke_hazard' });
  ok(has_enhancement(w, 'm_steel') && has_enhancement(hz, 'm_steel') && has_enhancement(w, 'm_wild'), 'ferroseed: Wild and Hazard cards are also Steel');
  let r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.5 * 1.5) < 1e-9, 'ferroseed: held Wild + Hazard give X1.5 each (Steel)', r.total);
  clearHand();
  hand(['H_4']);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'ferroseed: plain cards are not Steel', r.total);
  rounds(5);
  ok(key(j) === 'j_poke_ferrothorn', 'ferroseed -> ferrothorn after 5 rounds', key(j));
  G.jokers.cards[0].remove();
}
{
  start('FERROTHORN');
  add('j_poke_ferrothorn');
  hand(['H_2'], { center: 'm_wild' });
  hand(['C_5'], { center: 'm_steel' });
  // Flush: 35 + 2+4+6+8+10 = 65 chips, 4 mult; held Wild (Steel) and Steel each retriggered: X1.5^4
  let r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.total.chips === 65 && Math.abs(r.total.mult - 4 * 1.5 ** 4) < 1e-9, 'ferrothorn: Flush retriggers held Steel cards', r.total);
  ok(statusMsgs(r.events).includes('Again!'), 'ferrothorn: "Again!"');
  r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.5 ** 2) < 1e-9, 'ferrothorn: no retrigger without a Flush', r.total);
}

done();
