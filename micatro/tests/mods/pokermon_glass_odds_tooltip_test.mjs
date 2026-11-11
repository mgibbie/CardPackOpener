// A Glass card's OWN tooltip shows its live break odds (the owner's tester screenshot, 2026-11-02: with Noivern held the Glass card
// still said "1 in 4 chance to destroy card" while Noivern said "Now 1 in 2"). Both tooltip paths:
//   - the board's playing-card tooltip (engine/view.js cardView enh_vars -> ui/markup.js describePlaying: a card in hand)
//   - the engine's describe (a live Card: a Standard pack's card, the deck view)
// The odds are the card's own roll (identifier 'glass') through core.js probability_vars (describe.js enh_live_vars), so Oops! All 6s,
// Pokermon r69's Noibat / Noivern (each copy doubles it: one 1 in 2, two always; a Tera'd one counts) and Regice's Ice Body (never)
// all show. Describing never moves the run's RNG (BETMMA's Phantom edition rolls on every calculation it is asked for).
// Pokermon r69 never retroactive: a run recorded on r68 (two Noibats: still 1 in 2) replays as recorded.
//   node micatro/tests/mods/pokermon_glass_odds_tooltip_test.mjs
import { T, start, hand, add, clearHand, G, STATES } from './poke_helpers.mjs';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import { describe } from '../../js/engine/describe.js';
import { toView, cardView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import * as PINS from '../../js/mods/pins.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';

const { ok, done } = T();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const flush = () => G.E_MANAGER.flush();
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); flush(); return j; }

globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = await import('../../js/ui/markup.js');
const assets = await import('../../js/ui/assets.js');
const M = await import('../../js/mods/index.js');
await M.loadMods(['pokermon', 'betmma']);
assets.bindModRegistry(M);

const clean = (s) => s.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
/** Both tooltips of a playing card in hand, as plain text. */
function tips(c) {
  const v = toView().areas.hand.find((x) => x.id === c.sort_id);
  return { board: clean(mk.describePlaying(v).lines.join(' | ')), engine: clean(describe(c).lines.join(' | ')), view: v };
}
const both = (t, re) => re.test(t.board) && re.test(t.engine);

await sec('glass tooltip', () => {
  start('GLTIP1');
  const [g] = hand(['S_9'], { center: 'm_glass' });
  let t = tips(g);
  ok(both(t, /1 in 4 chance to/) && t.view.enh_vars === undefined, 'no joker: 1 in 4 on both tooltips (the view carries nothing extra)', t);
  const n = add('j_poke_noivern');
  t = tips(g);
  ok(both(t, /1 in 2 chance to/) && !/1 in 4/.test(t.board), 'one Noivern held: the Glass card says 1 in 2 (it said 1 in 4: the tester\'s screenshot)', t);
  ok(/X2 Mult/.test(t.board) && /destroy card/.test(t.board), '... the rest of the text unchanged (X2 Mult, destroy card)', t.board);
  const n2 = add('j_poke_noivern');
  apply_type_sticker(n2, 'Colorless');
  t = tips(g);
  ok(both(t, /Always breaks/) && !/chance to/.test(t.board), 'two Noiverns (one Tera Colorless): "Always breaks"', t);
  debuff(n2);
  t = tips(g);
  ok(both(t, /1 in 2 chance to/), 'the second one debuffed: 1 in 2 again', t);
  n2.remove(); flush();
  const oo = add('j_oops');
  t = tips(g);
  ok(both(t, /Always breaks/), 'one Noivern + Oops! All 6s: always', t);
  n.remove(); flush();
  t = tips(g);
  ok(both(t, /1 in 2 chance to/), 'Oops! alone: 1 in 2 (2 in 4; the board tooltip said 1 in 4 before)', t);
  oo.remove(); flush();
  add('j_poke_noivern');
  const rg = add('j_poke_regice');
  t = tips(g);
  ok(both(t, /Never breaks/) && !/chance to/.test(t.engine), 'Noivern + Regice: "Never breaks"', t);
  rg.remove(); flush();
});

await sec('no rng', () => {
  start('GLTIP2', {}, { mods: ['betmma'] });
  add('j_poke_noivern', 'betmma_phantom');
  add('j_joker', 'betmma_phantom');
  const [g] = hand(['S_9'], { center: 'm_glass' });
  const before = JSON.stringify(G.GAME.pseudorandom);
  let shown = '';
  for (let i = 0; i < 5; i++) { shown = clean(mk.describePlaying(cardView(g, false)).lines.join(' | ')) + ' / ' + clean(describe(g).lines.join(' | ')); }
  ok(/1 in 2 chance to/.test(shown) && JSON.stringify(G.GAME.pseudorandom) === before, 'describing a Glass card (two Phantom jokers asked 10 times) leaves the run RNG untouched', [shown, before.length, JSON.stringify(G.GAME.pseudorandom).length]);
});

// ------------------------------------------------------------------- a run recorded on r68 replays as recorded
await sec('r68 replay', () => {
  // one Glass 2 a hand (High Card, 7 Chips): three hands stay under the 300-chip Small Blind
  const deck = { name: 'Bats', mods: ['pokermon'], params: { blind_scaling: 1 },
    cards: [['S_2', 'm_glass', 0, 0, 30], ['H_3', 0, 0, 0, 10]],
    jokers: [{ key: 'j_poke_noibat' }, { key: 'j_poke_noibat' }] };
  const record = (pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ engineRev: 1, seed: 'NOIBREC', mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) {
        const glass = G.hand.cards.filter((c) => c.ability.name === 'Glass Card').slice(0, 1);
        s.act({ type: 'highlight', ids: glass.map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const glassLeft = () => G.playing_cards.filter((c) => c.ability.name === 'Glass Card').length;
  const snap = () => ({ glass: glassLeft(), mult: G.jokers.cards.map((j) => j.ability.extra.bat_mult), chips: String(G.GAME.chips) });
  const s68 = record({ pokermon: '3.9.1+r68' });
  const want = snap();
  ok(want.glass > 27 && want.glass < 30, 'recorded on r68: two Noibats were 1 in 2, so only some of the 3 played Glass cards broke', want);
  const rec = JSON.parse(JSON.stringify(s68.recipe));
  rec.modVersions.pokermon = '3.9.1+r68';
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(rec)), { repin: true }); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resumed: every r68 move replays on r68 (the same breaks, the same banks)', { want, got });
  const st = Session.stepper(JSON.parse(JSON.stringify(rec)));
  st.seek(st.total); flush();
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(want), 'the replay stepper: the same', [st.error, snap()]);
  record(null);
  const now = snap();
  ok(now.glass === 30 - 3 && now.mult.every((m) => m === 2 * 3), 'the same moves on r69: all 3 played Glass cards break, each Noibat +6', now);
  clearHand();
});

done();
