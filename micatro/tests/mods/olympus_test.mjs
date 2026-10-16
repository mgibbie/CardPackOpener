// Olympus (micatro/mods/olympus): all 6 jokers + both synergies fired through real plays, with
// exact values; off = gone; one test per intended-design fix (each FAILS on the shipped Lua's
// behaviour — noted per test).
//   node micatro/tests/mods/olympus_test.mjs
import { T, start, hand, add, play, statusMsgs, descOk, G, P_CENTERS, act } from './oio_helpers.mjs';
import { P_CENTER_POOLS, P_JOKER_RARITY_POOLS } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import '../../mods/olympus/index.js';

const { ok, done } = T();
const KEYS = ['artemis', 'apollo', 'hephaestus', 'hades', 'hera', 'zeus'].map((n) => 'j_olympus_' + n);
const ckeys = () => G.consumeables.cards.map((c) => c.config.center.key);

// ---------------------------------------------------------------- off
{
  start('OLYOFF', []);
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'olympus'), 'off: no Olympus joker in the pools');
  ok(KEYS.every((k) => P_CENTERS[k] && !centerActive(P_CENTERS[k])), 'off: centers registered but inactive');
}

// ---------------------------------------------------------------- data
{
  start('OLYON', ['olympus']);
  ok(KEYS.every((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'on: all 6 jokers pooled');
  const R = (k) => P_CENTERS[k].rarity, Cc = (k) => P_CENTERS[k].cost;
  ok(R('j_olympus_artemis') === 3 && R('j_olympus_apollo') === 3 && R('j_olympus_hephaestus') === 3
    && R('j_olympus_hades') === 2 && R('j_olympus_hera') === 2 && R('j_olympus_zeus') === 2, 'rarities 3/3/3/2/2/2');
  ok(Cc('j_olympus_artemis') === 8 && Cc('j_olympus_apollo') === 8 && Cc('j_olympus_hephaestus') === 8
    && Cc('j_olympus_hades') === 5 && Cc('j_olympus_hera') === 6 && Cc('j_olympus_zeus') === 6, 'costs 8/8/8/5/6/6');
  ok(P_JOKER_RARITY_POOLS[3].includes(P_CENTERS.j_olympus_artemis) && P_JOKER_RARITY_POOLS[2].includes(P_CENTERS.j_olympus_hera), 'rarity pools');
  ok(KEYS.every((k) => !P_CENTERS[k].blueprint_compat && !P_CENTERS[k].eternal_compat), 'no blueprint_compat / eternal_compat (as registered)');
  for (const k of KEYS) {
    const j = add(k);
    const { d, ok: good } = descOk(j);
    ok(good, `${k}: describe() filled`, d && d.lines);
    j.remove();
  }
}

// ---------------------------------------------------------------- Artemis / Apollo
{
  start('OLYART', ['olympus'], { noBlind: true });
  add('j_olympus_artemis');
  add('j_olympus_apollo');
  const r = act({ type: 'select_blind' });
  ok(ckeys().join() === 'c_moon,c_sun', 'Artemis -> The Moon, Apollo -> The Sun on Blind select', ckeys());
  ok(statusMsgs(r.events).filter((m) => m === '+1 Tarot').length === 2, '+1 Tarot popups', statusMsgs(r.events));
}
{
  // FIX 1: one free slot -> one Tarot (shipped: both passed the check -> 3 cards in 2 slots).
  start('OLYART2', ['olympus'], { noBlind: true });
  add('j_olympus_artemis');
  add('j_olympus_apollo');
  add('c_fool');
  act({ type: 'select_blind' });
  ok(ckeys().join() === 'c_fool,c_moon' && G.GAME.consumeable_buffer === 0, 'fix 1: one free slot -> only Artemis\'s Moon (slot reserved)', ckeys());
}

// ---------------------------------------------------------------- Hephaestus
{
  start('OLYHEPH', ['olympus']);
  add('j_olympus_hephaestus');
  const [a, b] = hand(['S_A', 'H_A']);
  const { total } = play([a, b]);
  // Pair: 10 + 11 + 11 = 32 chips x 2 — the scored cards turn Steel AFTER their own scoring
  ok(total.chips === 32 && total.mult === 2, 'Hephaestus: the hand scores normally', total);
  ok(a.config.center.key === 'm_steel' && b.config.center.key === 'm_steel', 'Hephaestus: scored cards became Steel');
  const [c, x] = hand(['D_K', 'C_3']);
  play([c, x]); // High card: only the King scores
  ok(c.config.center.key === 'm_steel' && x.config.center.key === 'c_base', 'Hephaestus: only SCORED cards');
}

// ---------------------------------------------------------------- Hades
{
  start('OLYHADES', ['olympus']);
  add('j_olympus_hades');
  const caino = add('j_caino');
  const [k] = hand(['S_K']);
  const n0 = G.playing_cards.length, d0 = G.GAME.dollars;
  play([k]);
  ok(G.GAME.dollars === d0 + 3, 'Hades: first hand of 1 card earns $3', G.GAME.dollars - d0);
  ok(!G.playing_cards.includes(k) && G.playing_cards.length === n0 - 1 && !k.area, 'Hades: the card is destroyed');
  // FIX 2: listeners got `removed = card` (not a list) -> Caino never saw the destroyed King.
  ok(caino.ability.caino_xmult === 2, 'fix 2: remove_playing_cards gets [card] (Caino +X1 for the King)', caino.ability.caino_xmult);
  const d1 = G.GAME.dollars;
  const [q] = hand(['S_Q']);
  play([q]);
  ok(G.GAME.dollars === d1 && G.playing_cards.includes(q), 'Hades: not on the second hand');
}
{
  start('OLYHADES2', ['olympus']);
  add('j_olympus_hades');
  const d0 = G.GAME.dollars;
  const [a, b] = hand(['S_9', 'H_9']);
  play([a, b]);
  ok(G.GAME.dollars === d0 && G.playing_cards.includes(a) && G.playing_cards.includes(b), 'Hades: not when 2 cards are played');
}
{
  // FIX 3: a retriggered card pays per trigger (as the Lua) but is destroyed once.
  start('OLYHADES3', ['olympus']);
  add('j_olympus_hades');
  const [k] = hand(['S_K']);
  const d0 = G.GAME.dollars, n0 = G.playing_cards.length;
  k.set_seal('Red', true);
  play([k]);
  ok(G.GAME.dollars === d0 + 6 && G.playing_cards.length === n0 - 1, 'fix 3: Red Seal -> $3 x2, one card destroyed', [G.GAME.dollars - d0, n0 - G.playing_cards.length]);
}
{
  // FIX 3 with Blueprint: the copy pays too, but Caino hears of ONE destroyed King (shipped: per trigger).
  start('OLYHADES4', ['olympus']);
  add('j_blueprint');
  add('j_olympus_hades');
  const caino = add('j_caino');
  const kk = hand(['S_K']);
  const d0 = G.GAME.dollars, n0 = G.playing_cards.length;
  play(kk);
  ok(G.GAME.dollars === d0 + 6 && G.playing_cards.length === n0 - 1 && caino.ability.caino_xmult === 2,
    'fix 3: Blueprint + Hades -> $6, one card destroyed, Caino +X1 once', [G.GAME.dollars - d0, n0 - G.playing_cards.length, caino.ability.caino_xmult]);
}

// ---------------------------------------------------------------- Hera / Zeus
{
  start('OLYHZ', ['olympus']);
  const hera = add('j_olympus_hera');
  let t = play(hand(['S_Q'])).total;
  ok(t.chips === 15 && t.mult === 14 && t.total === 210, 'Hera: Queen +13 Mult', t);
  t = play(hand(['S_K'])).total;
  ok(t.chips === 15 && t.mult === 1, 'Hera: King nothing', t);
  hera.remove();
  add('j_olympus_zeus');
  t = play(hand(['S_K'])).total;
  ok(t.chips === 15 && t.mult === 14, 'Zeus: King +13 Mult', t);
  t = play(hand(['S_Q'])).total;
  ok(t.mult === 1, 'Zeus: Queen nothing', t);
  // Lua Blueprint never checks blueprint_compat when calculating: it copies Zeus (badge says incompatible)
  const bp = add('j_blueprint');
  G.jokers.cards.unshift(G.jokers.cards.pop());
  t = play(hand(['S_K'])).total;
  ok(t.mult === 27 && bp.ability.blueprint_compat === 'incompatible', 'Blueprint copies Zeus like the Lua (+13 twice), badge incompatible', [t, bp.ability.blueprint_compat]);
}
{
  // Royal Matrimony (Zeus + Hera): x3 with a scoring King and Queen
  start('OLYRM', ['olympus']);
  add('j_olympus_zeus');
  add('j_olympus_hera');
  let r = play(hand(['S_K', 'H_K', 'S_Q', 'H_Q']));
  // Two Pair 20 + 4x10 = 60 chips; mult 2 + 4x13 = 54, x3 = 162
  ok(r.total.chips === 60 && r.total.mult === 162 && r.total.total === 9720, 'Royal Matrimony: x3 Mult', r.total);
  ok(statusMsgs(r.events).includes('X3 Mult'), 'X3 popup', statusMsgs(r.events));
  r = play(hand(['S_Q', 'H_Q']));
  ok(r.total.mult === 2 + 26, 'Royal Matrimony: no King -> no x3', r.total);
}

// ---------------------------------------------------------------- The Twins (Artemis + Apollo)
{
  start('OLYTW', ['olympus'], { noBlind: true });
  add('j_olympus_artemis');
  add('j_olympus_apollo');
  act({ type: 'select_blind' });
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  let t = play(hand(['H_5', 'C_5'])).total;
  ok(t.chips === 20 && t.mult === 10 && t.total === 200, 'The Twins: Heart + Club scoring -> x5', t);
  t = play(hand(['H_5', 'D_5'])).total;
  ok(t.mult === 2, 'The Twins: no Club -> nothing', t);
  const [h, w] = [...hand(['H_6']), ...hand(['S_6'], 'm_wild')];
  t = play([h, w]).total;
  ok(t.mult === 10, 'The Twins: a Wild Card fills the missing Club', t);
  const [s, w2] = [...hand(['S_7']), ...hand(['D_7'], 'm_wild')];
  t = play([s, w2]).total;
  ok(t.mult === 2, 'The Twins: a Wild Card fills only ONE suit (Clubs first) -> no Heart', t);
}
{
  start('OLYTW2', ['olympus']);
  add('j_olympus_artemis');
  add('j_olympus_artemis');
  const t = play(hand(['H_5', 'C_5'])).total;
  ok(t.mult === 2, 'The Twins needs Apollo (two Artemis do nothing)', t);
}

done();
