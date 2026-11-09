// Pokermon: the Meteorite says it is once per round, and whether it is ready (a tester, 2026-11-09: "Reusable" Meteorite with a
// Deoxys, Big Blind Ante 4 -> "Can't use that right now").
//   - Not an engine bug: his run (replayed) used it straight from a Planet Pack in round 13's shop (Normal forme, 1 deck card
//     destroyed); `usable` stayed off through round 14 until end_of_round restored it, as in Pokermon 3.9.1. Only the text said
//     nothing but "Reusable".
//   - Now: "(Usable once per round)" + "Currently Ready" / "Currently Used this round". Text only, no rules change (no rev gate).
//   - Owner request: the tooltip names the deck card it would destroy ("Will destroy: 7 of Hearts"), a peek at the seeded pick that
//     never moves the run's RNG, and the destroyed card rises out of the deck face up before it burns (dissolve event from: 'deck').
//   - Usable in every state of a round while ready: the blind, the shop, between rounds (only the once-per-round lock refuses).
//   node micatro/tests/mods/pokermon_meteorite_test.mjs
import { T, start, add, G, act } from './poke_helpers.mjs';
import { STATES, newRun } from '../../js/engine/run.js';
import { describe } from '../../js/engine/describe.js';
import '../../js/engine/view.js'; // (registers the event card view, as the game does)
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';

const { ok, done } = T();
const flush = () => G.E_MANAGER.flush();
const text = (c) => { const d = describe(c); return JSON.stringify([d.lines, d.colours]); };
try {
  start('METEORTXT');
  add('j_poke_deoxys');
  const m = add('c_poke_meteorite');
  G.STATE = STATES.SHOP; G.GAME.STOP_USE = 0;
  const t0 = text(m);
  ok(t0.includes('Usable once per round'), 'meteorite: the card says it is usable once per round', t0);
  ok(t0.includes('Currently') && t0.includes('Ready') && !t0.includes('Used this round') && t0.includes('green'), 'meteorite: unused -> "Currently Ready" (green)', t0);
  const u = act({ type: 'use', id: m.sort_id }); flush();
  ok(u.ok && m.ability.extra.usable === false, 'meteorite: used', u.error);
  const t1 = text(m);
  ok(t1.includes('Used this round') && t1.includes('red'), 'meteorite: after use -> "Currently Used this round" (red)', t1);
  const again = act({ type: 'use', id: m.sort_id });
  ok(!again.ok, 'meteorite: still once per round (no rules change)');
} catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 400)); }

// ------------------------------------------------ the "Will destroy" preview: exact, and never touches the RNG
const name = (c) => (c.config.center.key === 'm_stone' ? 'Stone Card' : c.base.value + ' of ' + c.base.suit);
const preview = (m) => { const d = describe(m); const l = (d.lines || []).find((x) => String(x).includes('Will destroy')); return l ? String(l) : ''; };
try {
  start('METEORPEEK');
  add('j_poke_deoxys');
  for (let round = 0; round < 3; round++) {
    const m = add('c_poke_meteorite');
    if (round === 1) G.deck.cards.reverse(); // (the deck changed: the preview follows it)
    const rng0 = JSON.stringify(G.GAME.pseudorandom);
    const p1 = preview(m), p2 = preview(m);
    ok(JSON.stringify(G.GAME.pseudorandom) === rng0, 'preview: describing the Meteorite leaves the RNG exactly as it was', round);
    ok(p1 && p1 === p2, 'preview: names a card, the same each time', [p1, p2]);
    const before = new Set(G.deck.cards);
    G.ui_events.length = 0;
    const u = act({ type: 'use', id: m.sort_id });
    G.E_MANAGER.flush();
    const evs = [...new Map([...(u.events || []), ...G.ui_events].map((e) => [e.seq, e])).values()].filter((e) => e.type === 'dissolve' && e.from === 'deck');
    const lost = [...before].filter((c) => !G.deck.cards.includes(c));
    ok(u.ok && lost.length === 1 && p1.includes(name(lost[0])), 'use: destroys the previewed card', [u.error, p1, lost.map(name)]);
    ok(evs.length === 1 && evs[0].card === lost[0].sort_id && evs[0].view && evs[0].view.id === lost[0].sort_id, 'use: the dissolve event comes from the deck with the card view (the board shows it)', evs.map((e) => [e.card, !!e.view]));
    m.remove();
  }
} catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 400)); }

// ------------------------------------------------ the preview is what use() destroys (same RNG state, both runs)
try {
  const pick = (peekFirst) => {
    start('METEORSAME');
    add('j_poke_deoxys');
    const m = add('c_poke_meteorite');
    const before = new Set(G.deck.cards);
    const p = peekFirst ? preview(m) : '';
    act({ type: 'use', id: m.sort_id }); G.E_MANAGER.flush();
    const lost = [...before].filter((c) => !G.deck.cards.includes(c));
    return { p, lost: lost.map(name), rng: JSON.stringify(G.GAME.pseudorandom) };
  };
  const a = pick(true), b = pick(false);
  ok(a.lost.length === 1 && a.p.includes(a.lost[0]), 'preview: names exactly the card use() destroys', [a.p, a.lost]);
  ok(a.lost[0] === b.lost[0] && a.rng === b.rng, 'preview: peeking first changes neither the destroyed card nor the RNG', [a.lost, b.lost]);
} catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 400)); }

// ------------------------------------------------ usable in every state while ready (blind select, the round, the shop)
try {
  for (const where of ['blind_select', 'round', 'shop']) {
    newRun({ seed: 'METEORSTATE', back: 'b_red', mods: ['pokermon', 'nacho', 'pokermonplus'], modOptions: { pokermon: {} } });
    if (where !== 'blind_select') act({ type: 'select_blind' });
    if (where === 'shop') { G.STATE = STATES.SHOP; G.GAME.STOP_USE = 0; }
    add('j_poke_deoxys');
    const m = add('c_poke_meteorite');
    const u = act({ type: 'use', id: m.sort_id }); G.E_MANAGER.flush();
    ok(u.ok, 'meteorite: usable while ready in ' + where, u.error);
  }
} catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 400)); }
done();
