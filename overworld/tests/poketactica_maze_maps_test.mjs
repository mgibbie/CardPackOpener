// poketactica_maze_maps_test.mjs — MAZE BUILDER, MORE MAPS (Plans/POKETACTICA_MAZE_BUILDER_IMPROVEMENT_PLAN.md item 14:
// "three maps" became six, each new one with a rule of its own):
//   Drowned Crossing  a flooded middle: two fords, and no block goes on water
//   Twin Keeps        two bases: a wave is split between them and neither may be walled off
//   Wandering Gate    a moving gate: each wave comes through the next of three gates in turn
// Pure: node only.   node overworld/tests/poketactica_maze_maps_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import * as MZ from '../../poketactica/js/td/maze.js';
import { MAZE_MAPS, MAZE_MAPS_SMALL, tdMapById, isMazeMap, lanesOf } from '../../poketactica/js/td/maps.js';
import { tdRecipe, tdRunTo, validTdRecipe } from '../../poketactica/js/td/replay.js';
import { buildMap } from '../../poketactica/js/campaign.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const squad = () => [makeFigurine('pikachu', 30, makeRng('maps-p'), data, { id: 'pikachu-maps', shinyRate: 0 })];
const ap = (S, a) => TD.applyInput(S, a, data);
const run = (id, seed = 'maps') => TD.newRun(seed, { map: tdMapById(id), squad: squad() }, data);
const wave = (S) => { for (let i = 0; S.pick && i < 4; i++) { const k = S.pick.opts.findIndex((o, j) => !ap(S, { t: 'pick', i: j })); if (k < 0) S.pick = null; } while (S.hand.length) ap(S, { t: 'discard', card: S.hand[0].id }); const n = S.cleared; ap(S, { t: 'call' }); const seen = []; for (let i = 0; i < 20 * 900 && !(S.cleared > n && S.phase === 'wait') && !S.over; i++) { TD.step(S, [], data); for (const e of S.enemies) if (!seen.includes(e.uid)) seen.push(e.uid, e.gate); } return seen.filter((_, i) => i % 2 === 1); };

// ---------- six maps
{
	A(MAZE_MAPS.length === 6 && new Set(MAZE_MAPS.map((m) => m.id)).size === 6 && new Set(MAZE_MAPS.map((m) => m.name)).size === 6, 'six Maze Builder maps, each with its own id and name', MAZE_MAPS.map((m) => m.id));
	A(MAZE_MAPS.slice(0, 3).every((m, i) => m.id === MAZE_MAPS_SMALL[i].id) && MAZE_MAPS_SMALL.length === 3, 'the first three are the ones older runs know, in their order');
	A(MAZE_MAPS.every((m) => m.big && isMazeMap(m) && m.tip && m.scenery && TD.mapProblems(m, buildMap({ ...m, foes: [] })).length === 0), 'every one is sound: each gate reaches each base over open ground');
	const more = MAZE_MAPS.slice(3);
	A(JSON.stringify(more.map((m) => m.id)) === '["mz-ford","mz-keeps","mz-drift"]' && more.every((m) => m.rule && m.tip.length > 40), 'the new three: Drowned Crossing, Twin Keeps, Wandering Gate, each with a rule it names', more.map((m) => m.rule));
	A(more.every((m) => tdMapById(m.id) === m && tdMapById(m.id, 15) === null), 'they are found by id (and no run from before the big maps has one)');
	A(more.every((m) => m.rows[0].length >= 24 && m.rows.length >= 18), 'they are as large as the others', more.map((m) => [m.rows[0].length, m.rows.length]));
}

// ---------- a flooded middle
{
	const m = tdMapById('mz-ford'), S = run('mz-ford'), W = m.rows[0].length, H = m.rows.length;
	const wet = (x, y) => m.ground[y][x] === 'w';
	const cols = [...new Set(Array.from({ length: W * H }, (_, i) => (wet(i % W, Math.floor(i / W)) ? i % W : -1)).filter((x) => x >= 0))];
	A(cols.length >= 2 && cols.every((x) => x > 4 && x < W - 5), 'a band of water runs down the middle', cols);
	const fords = Array.from({ length: H }, (_, y) => y).filter((y) => cols.every((x) => !wet(x, y)));
	A(fords.length >= 2 && fords.length <= 6 && fords.some((y) => y < H / 2) && fords.some((y) => y >= H / 2), 'with fords across it, one above and one below', fords);
	A(S.paths.length === 1 && S.paths[0].some(([x, y]) => cols.includes(x) && fords.includes(y)) && !S.paths[0].some(([x, y]) => wet(x, y)), 'the way crosses by a ford, never through the water');
	A(!!TD.blockWhy(S, 'one', 0, cols[0], 0), 'no block goes on the water', TD.blockWhy(S, 'one', 0, cols[0], 0));
	// shutting both fords is refused: walls built in a grid with the fords closed leave no way
	const open = S.open.slice(); for (const y of fords) for (const x of cols) open[y * W + x] = 0;
	A(MZ.ways({ w: W, h: H, open }, S.gates, [m.base[0], m.base[1]]) === null, 'with every ford shut there is no way: the game refuses the block that would do it');
}

// ---------- two bases
{
	const m = tdMapById('mz-keeps'), S = run('mz-keeps');
	A(m.bases.length === 2 && m.base[0] === m.bases[0][0] && m.base[1] === m.bases[0][1] && m.gates.length === 1, 'Twin Keeps: one gate, two bases');
	const L = lanesOf(m);
	A(L.gates.length === 2 && L.bases.length === 2 && JSON.stringify(L.bases) === JSON.stringify(m.bases) && L.gates.every((g) => g[0] === m.gates[0][0] && g[1] === m.gates[0][1]), 'a lane to each base from the gate');
	A(lanesOf(tdMapById('mz-pincer')).bases === null && lanesOf(tdMapById('mz-pincer')).gates.length === 2, '(a map with one base has a lane a gate, as before)');
	const ends = S.paths.map((p) => p[p.length - 1]);
	A(S.paths.length === 2 && JSON.stringify(ends) === JSON.stringify(m.bases) && S.paths.every((p) => p[0][0] === m.gates[0][0] && p[0][1] === m.gates[0][1]), 'the run has a way to each base', ends);
	A(TD.view(S).bases.length === 2 && S.B.map.bases.length === 2, 'the board knows both bases (to draw them)');
	A(/base/.test(TD.blockWhy(S, 'one', 0, m.bases[1][0], m.bases[1][1]) || ''), 'no block on the second base', TD.blockWhy(S, 'one', 0, m.bases[1][0], m.bases[1][1]));
	// a wall round the second base alone is refused, though the first stays reachable
	const W = S.B.map.w, H = S.B.map.h, [bx, by] = m.bases[1], open = S.open.slice();
	for (const [dx, dy] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) { const x = bx + dx, y = by + dy; if (x >= 0 && y >= 0 && x < W && y < H) open[y * W + x] = 0; }
	A(MZ.ways({ w: W, h: H, open }, [m.gates[0]], m.bases[0]) !== null && MZ.ways({ w: W, h: H, open }, S.gates, S.goals) === null, 'walling off one base is "closing the way", even with the other open');
	const near = [[bx - 1, by], [bx, by - 1], [bx, by + 1], [bx + 1, by]].filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
	// lay dots round it until the game says no
	S.hand = near.map((_, i) => ({ id: 'k' + i, shape: 'one' })); S.gold = 999;
	const whys = near.map(([x, y], i) => ap(S, { t: 'block', card: 'k' + i, turns: 0, x, y }));
	A(whys.some((w) => /close the way/.test(w || '')) && TD.blockWhy(S, 'one', 0, 2, 2) === null, 'in play: the last block round a base is refused', whys);
	// a wave is split between the two
	const T = run('mz-keeps', 'split'), lanes = [];
	for (let k = 0; k < 4 && !T.over; k++) lanes.push(...wave(T));
	A(lanes.includes(0) && lanes.includes(1), 'the enemies of the waves are split between the two bases', lanes.join(''));
	const lives0 = TD.newRun('x', { map: m, squad: squad() }, data).lives;
	A(T.lives < lives0 || T.over, 'an enemy reaching either base costs a life', [T.lives, lives0]);
}

// ---------- a moving gate
{
	const m = tdMapById('mz-drift'), S = run('mz-drift');
	A(m.shift === true && m.gates.length === 3 && S.shift === true && S.paths.length === 3, 'Wandering Gate: three gates, each with its way kept');
	A(TD.laneOfWave(S, 1) === 0 && TD.laneOfWave(S, 2) === 1 && TD.laneOfWave(S, 3) === 2 && TD.laneOfWave(S, 4) === 0, 'the gates open in turn, wave by wave');
	A(TD.laneNow(S) === 0 && TD.view(S).gateOn === 0, 'before the first wave the bar can say: gate 1');
	A(TD.laneNow(run('mz-field')) === null && TD.view(run('mz-field')).gateOn === undefined && TD.laneOfWave(run('mz-pincer'), 2) === null, '(no other map has a gate that moves)');
	const one = TD.waveFor(S, 3, data), field = TD.waveFor(run('mz-field', 'maps'), 3, data);
	A(one.length === field.length, 'a wave is as many enemies as on a map with one gate (not three gates\' worth)', [one.length, field.length]);
	const g1 = wave(S);
	A(g1.length > 0 && g1.every((g) => g === 0), 'wave 1 comes by gate 1, all of it', g1.join(''));
	A(S.over || TD.laneNow(S) === 1, 'between waves the bar says the next: gate 2');
	const g2 = S.over ? [1] : wave(S);
	A(g2.length > 0 && g2.every((g) => g === 1), 'wave 2 comes by gate 2', g2.join(''));
	// every gate must stay open, the quiet ones too
	const F = run('mz-drift', 'shut'), [gx, gy] = F.gates[2], W = F.B.map.w, H = F.B.map.h;
	const round = [[gx + 1, gy], [gx, gy - 1], [gx, gy + 1], [gx + 1, gy - 1], [gx + 1, gy + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && F.open[y * W + x]);
	F.hand = round.map((_, i) => ({ id: 'k' + i, shape: 'one' })); F.gold = 999;
	const whys = round.map(([x, y], i) => ap(F, { t: 'block', card: 'k' + i, turns: 0, x, y }));
	A(whys.some((w) => /close the way/.test(w || '')), 'a gate that is not open this wave may still not be walled in', whys);
}

// ---------- a run on a new map is a run like any other: recorded, replayed
{
	for (const id of ['mz-keeps', 'mz-drift']) {
		const S = run(id, 'rec-' + id), inputs = [];
		const ord = (a) => { const why = ap(S, a); if (!why) inputs.push([S.tick, a]); return why; };
		while (S.hand.length) ord({ t: 'discard', card: S.hand[0].id });
		ord({ t: 'call' });
		for (let i = 0; i < 1500 && !S.over; i++) TD.step(S, [], data);
		const rec = tdRecipe({ seed: 'rec-' + id, mapId: id, squad: S.squad, inputs, end: S.tick, wave: S.cleared });
		const again = validTdRecipe(rec) ? tdRunTo(rec, null, data) : null;
		A(!!again && TD.hashOf(again) === TD.hashOf(S), id + ': a recorded run replays to the same state');
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
