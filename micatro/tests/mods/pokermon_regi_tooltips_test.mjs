// The Regi trio's card tooltips (owner, 2026-10-28): with Regirock held a Stone card's OWN tooltip shows +100 Chips (plus its banked
// perma_bonus); with Registeel held a Steel card's shows X2 (energized: X2.1 / X2.2 / X2.3). Both tooltip paths:
//   - the board's playing-card tooltip (engine/view.js cardView enh_vars -> ui/markup.js describePlaying: a card in hand)
//   - the engine's describe (a live Card: a Standard pack's card, the deck view)
// The number comes from the same functions scoring uses (Pokermon's regi_chip_bonus / regi_h_x_mult, through the pure hook
// enh_loc_vars; describe.js enh_live_vars), so the test also scores the card and compares. No Regi (or a debuffed one): +50 / X1.5.
//   node micatro/tests/mods/pokermon_regi_tooltips_test.mjs
import { T, start, hand, add, play, clearHand, G } from './poke_helpers.mjs';
import { describe } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
function back(c) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); return c; }

globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = await import('../../js/ui/markup.js');
const assets = await import('../../js/ui/assets.js');
const M = await import('../../js/mods/index.js');
await M.loadMods(['pokermon']);
assets.bindModRegistry(M);

/** Both tooltips of a playing card in hand, as text. */
function tips(c) {
  const v = toView().areas.hand.find((x) => x.id === c.sort_id);
  return { board: mk.describePlaying(v).lines.join(' | '), engine: describe(c).lines.join(' | '), view: v };
}
const stoneLine = (n) => '{C:chips}+' + n + '{} Chips';
const steelLine = (x) => '{X:mult,C:white} X' + x + ' {}';

await sec('stone', () => {
  start('REGITIP1');
  const [s] = hand(['S_A'], { center: 'm_stone' });
  let t = tips(s);
  ok(t.board.includes(stoneLine(50)) && t.engine.includes(stoneLine(50)) && t.view.enh_vars === undefined, 'no Regirock: +50 Chips on both tooltips (the view carries nothing extra)', t);
  const rock = add('j_poke_regirock');
  t = tips(s);
  ok(t.board.includes(stoneLine(100)) && !t.board.includes(stoneLine(50)), 'Regirock held: the in-hand tooltip says +100 Chips', t.board);
  ok(t.engine.includes(stoneLine(100)), '... and the engine\'s describe too', t.engine);
  // it scores what it says, then banks +10: the tooltip follows (+110)
  const sc = play([s]).total;
  ok(sc.chips === 5 + 100, 'it scores the +100 it showed (5 + 100)', sc);
  back(s); t = tips(s);
  ok(s.ability.perma_bonus === 10 && t.board.includes(stoneLine(110)) && t.engine.includes(stoneLine(110)), 'after one score: +110 (100 + its banked +10) on both', [s.ability.perma_bonus, t.board, t.engine]);
  // energized: chips1 100 -> 130 / 160 / 190 (+ the banked 10)
  const shown = [];
  for (let k = 0; k < 3; k++) { increment_energy(rock, 'Earth'); shown.push(tips(s).board); }
  ok([140, 170, 200].every((n, k) => shown[k].includes(stoneLine(n))), 'energized Regirock: +140 / +170 / +200 (130 / 160 / 190 + the banked 10)', shown);
  const sc2 = play([s]).total;
  ok(sc2.chips === 5 + 200, 'and it scores +200', sc2);
  // debuffed Regirock: back to +50 (+ the bank: 50 + 26)
  back(s); debuff(rock);
  t = tips(s);
  ok(t.board.includes(stoneLine(50 + 26)) && t.engine.includes(stoneLine(50 + 26)), 'a debuffed Regirock: +50 again plus the banked 26 (+76)', [s.ability.perma_bonus, t.board]);
  rock.remove(); G.E_MANAGER.flush();
  ok(tips(s).board.includes(stoneLine(76)), 'Regirock sold: +76 (the card\'s own +50 and its bank)');
});

await sec('steel', () => {
  start('REGITIP2');
  const [st] = hand(['C_7'], { center: 'm_steel' });
  let t = tips(st);
  ok(t.board.includes(steelLine(1.5)) && t.engine.includes(steelLine(1.5)) && t.view.enh_vars === undefined, 'no Registeel: X1.5 on both tooltips', t);
  const reg = add('j_poke_registeel');
  t = tips(st);
  ok(t.board.includes(steelLine(2)) && !t.board.includes(steelLine(1.5)) && t.engine.includes(steelLine(2)), 'Registeel held: X2 on both', t);
  const sc = play(hand(['S_2'])).total;
  ok(near(sc.mult, 2), 'it scores the X2 it showed', sc);
  const shown = [];
  for (let k = 0; k < 3; k++) { increment_energy(reg, 'Metal'); shown.push([tips(st).board, tips(st).engine]); }
  ok([2.1, 2.2, 2.3].every((x, k) => shown[k][0].includes(steelLine(x)) && shown[k][1].includes(steelLine(x))), 'energized Registeel: X2.1 / X2.2 / X2.3 (rounded, both paths)', shown);
  const sc2 = play(hand(['S_2'])).total;
  ok(near(sc2.mult, 2.3), 'and it scores X2.3', sc2);
  debuff(reg);
  ok(tips(st).board.includes(steelLine(1.5)), 'a debuffed Registeel: X1.5 again');
});

await sec('other cards untouched', () => {
  start('REGITIP3');
  add('j_poke_regirock'); add('j_poke_registeel');
  const [g] = hand(['H_K'], { center: 'm_glass' });
  const [b] = hand(['H_2'], { center: 'm_bonus' });
  ok(tips(g).view.enh_vars === undefined && tips(b).view.enh_vars === undefined, 'a Glass / Bonus card carries no live vars even with both Regis');
  // a Steel card held with Regirock (no Registeel) / a Stone card with Registeel only: unchanged
  clearHand();
  start('REGITIP4'); add('j_poke_registeel');
  const [s] = hand(['S_A'], { center: 'm_stone' });
  ok(tips(s).board.includes(stoneLine(50)), 'Registeel alone leaves a Stone card at +50');
  start('REGITIP5'); add('j_poke_regirock');
  const [st] = hand(['C_7'], { center: 'm_steel' });
  ok(tips(st).board.includes(steelLine(1.5)), 'Regirock alone leaves a Steel card at X1.5');
});

done();
