// poketactica_maze_tune_test.mjs — Tower Defense, MAZE BUILDER, stage 5 (owner, 2026-11-24;
// Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): the numbers. The auto-builder (tools/poketactica/maze_auto.mjs) plays each
// map, and the plan's targets are pinned as ranges: 12 figurines at a wave's level stop around that wave with a plain
// back-and-forth maze; a maze is worth far more than no maze; what a run pays stays near the Road's. And the HOLD LIMIT:
// an enemy held still for 3 s in all shakes it off and cannot be held for 3 s (Maze Builder only).
//   node overworld/tests/poketactica_maze_tune_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import { MAZE_MAPS, TD_MAPS } from '../../poketactica/js/td/maps.js';
import { GOLD } from '../../poketactica/js/td/cards.js';
import { loadData, squadAt, autoRun } from '../../tools/poketactica/td_auto.mjs';
import { mazeRun } from '../../tools/poketactica/maze_auto.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length;

// ---------- the auto-builder is exact, and builds
{
	const sq = squadAt(18, 12, data), m = MAZE_MAPS[0];
	const a = mazeRun('tune-0', m, sq, data), b = mazeRun('tune-0', m, sq, data), c = mazeRun('tune-1', m, sq, data);
	A(a.hash === b.hash && a.wave === b.wave && a.hash !== c.hash, 'the auto-builder plays the same run from the same seed', [a.hash, b.hash, c.hash]);
	A(a.over === 'lost' && a.blocks >= 6 && a.towers >= 5 && a.way > 11, 'it lays blocks, lengthens the way and stands figurines on them, to the end of the run', a);
}
// ---------- the targets
{
	const at = (lv, style) => MAZE_MAPS.map((m) => { const out = [0, 1, 2].map((k) => mazeRun('mz-auto-' + m.id + '-' + k, m, squadAt(lv, 12, data), data, 120000, style)); return { id: m.id, wave: avg(out.map((o) => o.wave)), min: avg(out.map((o) => o.ticks / TD.TPS / 60)), stars: avg(out.map((o) => o.stars)), exp: avg(out.map((o) => o.exp)), lost: out.every((o) => o.over === 'lost') }; });
	const l18 = at(18), l30 = at(30), none = at(18, 'line');
	A(l18.every((r) => r.lost && r.wave >= 8 && r.wave <= 16), 'Lv 18 (wave 10\'s level), a plain back-and-forth maze: every map ends between waves 8 and 16', l18.map((r) => [r.id, r.wave.toFixed(1)]));
	A(l30.every((r) => r.lost && r.wave >= 15 && r.wave <= 30) && l30.every((r, i) => r.wave > l18[i].wave + 4), 'Lv 30: between waves 15 and 30, well past the Lv 18 runs (no run goes on for ever)', l30.map((r) => [r.id, r.wave.toFixed(1)]));
	// (the big maps, rules 16: Lakeside Ridge's long ridge is somewhere to stand with no block laid, so there the maze adds less; on open ground it is everything)
	A(avg(none.map((r) => r.wave)) < avg(l18.map((r) => r.wave)) - 3 && none.every((r, i) => r.wave < l18[i].wave) && none.filter((r, i) => r.wave < l18[i].wave - 4).length >= 2, 'with no maze the same squad falls sooner on every map, and much sooner on open ground: the blocks matter', none.map((r, i) => [r.id, r.wave.toFixed(1), l18[i].wave.toFixed(1)]));
	// what a run pays, against the Road's (the owner's rates: td/rewards.js)
	const road = TD_MAPS.map((m) => { const out = [0, 1].map((k) => autoRun('auto-' + m.id + '-' + k, m, squadAt(18, 12, data), data)); return { stars: avg(out.map((o) => o.stars)) / avg(out.map((o) => o.ticks / TD.TPS / 60)), exp: avg(out.map((o) => o.exp)) / avg(out.map((o) => o.ticks / TD.TPS / 60)) }; });
	const mz = l18.map((r) => ({ stars: r.stars / r.min, exp: r.exp / r.min }));
	const rs = avg(road.map((r) => r.stars)), re = avg(road.map((r) => r.exp)), ms = avg(mz.map((r) => r.stars)), me = avg(mz.map((r) => r.exp));
	A(ms < rs * 1.5 && me < re * 1.5 && ms > rs * 0.4, 'stars and EXP a minute stay near the Road\'s (never half as much again)', { road: [rs.toFixed(1), re.toFixed(0)], maze: [ms.toFixed(1), me.toFixed(0)] });
}
// ---------- the hold limit
{
	const walk = (map) => {
		const S = TD.newRun('hold', { map, squad: [] }, data);
		TD.applyInput(S, { t: 'call' }, data);
		while (!S.enemies.length) TD.step(S, [], data);
		const e = S.enemies[0], d = [], shook = [];
		// someone tries to hold it for ever
		for (let i = 0; i < 200 && S.enemies.includes(e); i++) { e.stop = S.tick + 1000; const d0 = e.d; TD.step(S, [], data); d.push(e.d > d0 ? 1 : 0); if (S.ev.some((x) => x.t === 'shook' && x.uid === e.uid)) shook.push(i); }
		return { d: d.join(''), shook };
	};
	const m = walk(MAZE_MAPS[0]);
	const stood = m.d.indexOf('1'), walked = m.d.slice(stood).indexOf('0');
	A(stood === TD.HOLD_MAX_TICKS - 1 && TD.HOLD_MAX_TICKS === 60 && m.shook[0] === stood, 'Maze Builder: an enemy held still for 3 s in all shakes it off', [stood, m.shook]);
	A(walked === TD.HOLD_FREE_TICKS && TD.HOLD_FREE_TICKS === 60, 'and for the next 3 s nothing holds it', walked);
	A(m.d.slice(stood + walked, stood + walked + 59) === '0'.repeat(59) && m.shook.length >= 2, 'after that it can be held again, for another 3 s', m.shook);
	const r = walk(TD_MAPS[0]);
	A(!r.d.includes('1') && r.shook.length === 0, 'the Road mode has no such limit (unchanged)');
	A(TD.MAZE_HP_MULT === 1 && GOLD.start === 60 && GOLD.place === 20 && GOLD.placeMore === 10 && GOLD.draw === 5 && GOLD.lift === 15, 'the tuned numbers: no extra enemy HP; 60 gold to start; a figurine 20 and 10 more each; a draw 5; Lift 15');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
