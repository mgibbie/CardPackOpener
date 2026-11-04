// Inscrybed Jokers (micatro/mods/inscrybed): all 4 jokers fired through real plays/discards with
// exact values; off = gone; one test per intended-design fix (each FAILS on the shipped Lua —
// noted per test; the shipped mod scored nothing and crashed on Techno/Magickal/Deathly).
//   node micatro/tests/mods/inscrybed_test.mjs
import { T, start, hand, add, play, discard, nextRound, statusMsgs, descOk, G, P_CENTERS } from './oio_helpers.mjs';
import { P_CENTER_POOLS, P_JOKER_RARITY_POOLS } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import '../../mods/inscrybed/index.js';

const { ok, done } = T();
const KEYS = ['beast', 'deathly', 'techno', 'magickal'].map((n) => 'j_inscrybed_' + n);

// ---------------------------------------------------------------- off / data
{
  start('INSOFF', []);
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'inscrybed'), 'off: no Inscrybed joker in the pools');
  ok(KEYS.every((k) => P_CENTERS[k] && !centerActive(P_CENTERS[k])), 'off: centers inactive');
  start('INSON', ['inscrybed']);
  ok(KEYS.every((k) => P_JOKER_RARITY_POOLS[2].includes(P_CENTERS[k])), 'on: all 4 in the Uncommon pool');
  ok(KEYS.every((k) => P_CENTERS[k].cost === 5 && P_CENTERS[k].blueprint_compat && P_CENTERS[k].eternal_compat), 'cost 5, blueprint + eternal compatible');
  for (const k of KEYS) {
    const j = add(k);
    const { d, ok: good } = descOk(j);
    ok(good, `${k}: describe() filled`, d && d.lines);
    j.remove();
  }
  const b = add('j_inscrybed_beast');
  const plain = descOk(b).d.lines.join(' ').replace(/{[^}]*}/g, '');
  ok(plain.includes('gain +10 Chips') && plain.includes('(Currently +10 Chips)'), 'Beastly text: +10 / Currently +10', descOk(b).d.lines);
}

// ---------------------------------------------------------------- Beastly
{
  start('INSBEAST', ['inscrybed']);
  const j = add('j_inscrybed_beast');
  // FIX 1: the shipped joker never scored (context.end_calculate_context is nil).
  let t = play(hand(['S_2'])).total;
  ok(t.chips === 5 + 2 + 10 && t.mult === 1, 'fix 1: Beastly scores its +10 Chips', t);
  const [k] = hand(['S_K']);
  const r = discard([k]);
  ok(j.ability.extra.current_chips === 20 && !G.playing_cards.includes(k) && !k.area, 'Beastly: first discard of 1 card -> destroyed, +10 Chips');
  // FIX 5: localize{'k_upgrade_ex'} -> "ERROR"
  ok(statusMsgs(r.events).includes('Upgrade!'), 'fix 5: "Upgrade!" popup', statusMsgs(r.events));
  t = play(hand(['S_2'])).total;
  ok(t.chips === 7 + 20, 'Beastly: now +20 Chips', t);
  const [q] = hand(['S_Q']);
  discard([q]);
  ok(j.ability.extra.current_chips === 20 && G.playing_cards.includes(q), 'Beastly: not on the second discard');
}
{
  start('INSBEAST2', ['inscrybed']);
  const j = add('j_inscrybed_beast');
  const cs = hand(['S_K', 'H_K']);
  discard(cs);
  ok(j.ability.extra.current_chips === 10 && cs.every((c) => G.playing_cards.includes(c)), 'Beastly: not when 2 cards are discarded');
}
{
  // FIX 6: Blueprint copies the Chips but doesn't grow the original twice / double-destroy.
  start('INSBEAST3', ['inscrybed']);
  add('j_blueprint');
  const j = add('j_inscrybed_beast');
  discard(hand(['S_K']));
  ok(j.ability.extra.current_chips === 20, 'fix 6: Blueprint + Beastly discard -> +10 once', j.ability.extra.current_chips);
  const t = play(hand(['S_2'])).total;
  ok(t.chips === 7 + 40, 'Blueprint copies Beastly\'s +20 Chips', t);
}

// ---------------------------------------------------------------- Deathly
{
  start('INSDEATH', ['inscrybed']);
  const d = add('j_inscrybed_deathly');
  let t = play(hand(['S_2'])).total;
  ok(t.chips === 7 + 22, 'fix 1: Deathly scores its +22 Chips', t);
  // FIX 2: destroyed cards — the shipped joker listened for a nonexistent context and crashed on v.getID().
  add('j_inscrybed_beast');
  discard(hand(['S_K']));
  ok(d.ability.extra.current_chips === 22 + 26, 'fix 2: Beastly destroys a King -> Deathly +26 (2 x 13)', d.ability.extra.current_chips);
  // Glass shattering in play -> remove_playing_cards
  G.GAME.probabilities.normal = 1000;
  const [g] = hand(['H_A'], 'm_glass');
  play([g]);
  ok(!G.playing_cards.includes(g) && d.ability.extra.current_chips === 48 + 28, 'Deathly: a shattered Ace -> +28', d.ability.extra.current_chips);
  G.GAME.probabilities.normal = 1;
  // cards_destroyed / glass_shattered form
  const [five] = hand(['D_5']);
  const ev = d.calculate_joker({ cards_destroyed: true, glass_shattered: [five] });
  ok(d.ability.extra.current_chips === 86 && ev && ev.message === 'Upgrade!', 'Deathly: cards_destroyed (glass_shattered) +10', d.ability.extra.current_chips);
  ok(d.calculate_joker({ remove_playing_cards: true, removed: [] }) === undefined && d.ability.extra.current_chips === 86, 'Deathly: nothing destroyed -> no growth, no popup');
  t = play(hand(['S_2'])).total;
  ok(t.chips === 7 + 86 + 20, 'Deathly: scores its grown Chips (+ Beastly 20)', t);
}

// ---------------------------------------------------------------- Techno
{
  start('INSTECH', ['inscrybed']);
  const j = add('j_inscrybed_techno');
  let t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 8 && j.ability.mult === 16, 'Techno: +8 Mult, then gains +8 after the hand', [t.mult, j.ability.mult]);
  t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 16 && j.ability.mult === 24, 'Techno: +16 on the 2nd hand', [t.mult, j.ability.mult]);
  // FIX 3: the reset assigned extra.base_mult (nil) -> next hand crashed on nil + 8
  nextRound();
  ok(j.ability.mult === 8, 'fix 3: resets to +8 at end of round', j.ability.mult);
  t = play(hand(['S_2'])).total;
  ok(t.mult === 9 && j.ability.mult === 16, 'Techno: the next round starts over at +8', [t.mult, j.ability.mult]);
  const bp = add('j_blueprint');
  G.jokers.cards.unshift(G.jokers.cards.pop());
  t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 16 + 16 && j.ability.mult === 24, 'fix 6: Blueprint copies +16 but Techno grows once', [t.mult, j.ability.mult]);
  bp.remove();
}

// ---------------------------------------------------------------- Magickal
{
  start('INSMAG', ['inscrybed']);
  const j = add('j_inscrybed_magickal');
  // FIX 4: self.ability.mult_mod (nil) -> crash; the value is extra.mult_mod (+3)
  let t = play(hand(['S_2', 'H_3', 'C_4', 'D_5', 'S_6'])).total;
  ok(t.chips === 30 + 20 && t.mult === 4 + 4 + 3 && j.ability.mult === 7, 'fix 4: all four suits -> +3 (4 -> 7) before scoring', [t, j.ability.mult]);
  t = play(hand(['S_2', 'H_3', 'C_4', 'S_5', 'S_6'])).total;
  ok(t.mult === 4 + 7 && j.ability.mult === 7, 'Magickal: no Diamond -> no growth, still +7', [t, j.ability.mult]);
  const cs = [...hand(['S_7', 'H_8', 'C_9']), ...hand(['S_T'], 'm_wild'), ...hand(['S_J'])];
  t = play(cs).total;
  ok(j.ability.mult === 10 && t.mult === 4 + 10, 'Magickal: a Wild Card fills the missing Diamond', [t, j.ability.mult]);
  const ev = statusMsgs(play(hand(['S_2'])).events);
  ok(ev.includes('+10 Mult'), 'Magickal: popup', ev);
}

done();
