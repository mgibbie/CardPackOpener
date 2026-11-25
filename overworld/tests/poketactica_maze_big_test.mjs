// poketactica_maze_big_test.mjs — MAZE BUILDER's maps are FOUR TIMES THE SIZE (owner, 2026-11-25: "the maps are too small
// in maze builder make them 4x the size"; TD_RULES_REV 16). Every tile of a map as it was first drawn is laid out 2 by 2:
// twice as wide, twice as deep. A wall across such a field takes twice the blocks, so a big map deals more cards. A run
// or replay recorded before the change still plays on the small map, card for card.
// Pure: node only.   node overworld/tests/poketactica_maze_big_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as MZ from '../../poketactica/js/td/maze.js';
import { MAZE_MAPS, MAZE_MAPS_SMALL, TD_MAPS, tdMapById, isMazeMap, BIG_MAPS_REV, MAP_SCALE } from '../../poketactica/js/td/maps.js';
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
const squad = () => [makeFigurine('pikachu', 30, makeRng('big-p'), data, { id: 'pikachu-big', shinyRate: 0 })];
const ap = (S, a) => TD.applyInput(S, a, data);

// ---------- the size
{
	A(TD.TD_RULES_REV >= 16 && BIG_MAPS_REV === 16 && MAP_SCALE === 2, 'rules revision 16: the maps are laid out 2 by 2');
	A(MAZE_MAPS.length === MAZE_MAPS_SMALL.length && MAZE_MAPS.every((m, i) => m.id === MAZE_MAPS_SMALL[i].id && m.name === MAZE_MAPS_SMALL[i].name && m.big && !MAZE_MAPS_SMALL[i].big), 'every map has a big one under the same id and name');
	const sizes = MAZE_MAPS.map((m, i) => [m.rows[0].length, m.rows.length, MAZE_MAPS_SMALL[i].rows[0].length, MAZE_MAPS_SMALL[i].rows.length]);
	A(sizes.every(([w, h, w0, h0]) => w === 2 * w0 && h === 2 * h0 && w * h === 4 * w0 * h0), 'twice as wide and twice as deep: four times the ground', sizes);
	A(JSON.stringify(sizes.map(([w, h]) => [w, h])) === '[[24,18],[26,22],[32,20]]', 'Open Field 24 by 18, Pincer 26 by 22, Lakeside Ridge 32 by 20', sizes);
	A(MAZE_MAPS.every((m) => m.rows.every((r) => r.length === m.rows[0].length) && m.ground.length === m.rows.length && m.ground.every((r) => r.length === m.rows[0].length)), 'rows and ground are whole rectangles of the same size');
	// every tile of the small map is the same four tiles of the big one
	const same = MAZE_MAPS.every((m, i) => { const s = MAZE_MAPS_SMALL[i]; for (let y = 0; y < m.rows.length; y++) for (let x = 0; x < m.rows[0].length; x++) if (m.rows[y][x] !== s.rows[y >> 1][x >> 1] || m.ground[y][x] !== s.ground[y >> 1][x >> 1]) return false; return true; });
	A(same, 'each tile of the small map (its height, its ground) is a 2 by 2 patch of the big one');
	const edge = (m, [x, y]) => x === 0 || y === 0 || x === m.rows[0].length - 1 || y === m.rows.length - 1;
	A(MAZE_MAPS.every((m, i) => { const s = MAZE_MAPS_SMALL[i]; return m.gates.length === s.gates.length && [...m.gates, m.base].every((p, k) => edge(m, p) === edge(s, [...s.gates, s.base][k])); }), 'a gate or a base on the edge of the small map is on the edge of the big one', MAZE_MAPS.map((m) => [m.gates, m.base]));
	A(MAZE_MAPS.every((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] })).length === 0 && isMazeMap(m)), 'every big map is sound: each gate reaches the base over open ground');
	const lens = (list) => list.map((m) => TD.newRun('len', { map: m, squad: [] }, data).paths.map((p) => MZ.wayLength(p)));
	const big = lens(MAZE_MAPS), small = lens(MAZE_MAPS_SMALL);
	A(big.every((ws, i) => ws.every((n, k) => n >= 2 * small[i][k] && n <= 2 * small[i][k] + 2)), 'the bare way is twice as long (and a step or two for the far edge)', [small, big]);
	A(TD_MAPS.every((m) => !m.big && tdMapById(m.id) === m && tdMapById(m.id, 12) === m), 'the Road maps are as they were, at any revision');
}

// ---------- which map a run plays on
{
	A(MAZE_MAPS.every((m) => tdMapById(m.id) === m && tdMapById(m.id, 16) === m && tdMapById(m.id, 0) === m), 'by id, today: the big map');
	A(MAZE_MAPS_SMALL.every((m) => tdMapById(m.id, 15) === m && tdMapById(m.id, 11) === m), 'as a run under rules 11 to 15 knew it: the small one');
}

// ---------- the cards: a wall across a field twice as deep takes twice the blocks
{
	const B = TD.newRun('deal', { map: MAZE_MAPS[0], squad: squad() }, data), S = TD.newRun('deal', { map: MAZE_MAPS_SMALL[0], squad: squad() }, data);
	A(B.big === true && !S.big, 'a run knows it is on a big map');
	A(B.hand.length === C.DEAL_FIRST + C.BIG.first && S.hand.length === C.DEAL_FIRST && C.BIG.first === 3, 'the first hand: 8 cards on a big map (5 on a small one)', [B.hand.length, S.hand.length]);
	A(TD.view(B).handMax === C.HAND_MAX + C.BIG.hand && TD.view(S).handMax === C.HAND_MAX && C.BIG.hand === 2, 'a full hand is 8 (6)', [TD.view(B).handMax, TD.view(S).handMax]);
	A(ap(B, { t: 'draw' }) === 'the hand is full' && B.gold === S.gold, 'no draw into a full hand of 8; the gold is the same on both');
	// play wave 1 with nothing built: the next deal is 5 (3), up to the hand's limit
	const wave = (X) => { while (X.hand.length) ap(X, { t: 'discard', card: X.hand[0].id }); ap(X, { t: 'call' }); for (let i = 0; i < 20 * 600 && !(X.cleared >= 1 && X.phase === 'wait') && !X.over; i++) TD.step(X, [], data); return X.hand.length; };
	const nb = wave(B), ns = wave(S);
	A(nb === C.DEAL + C.BIG.deal && ns === C.DEAL && C.BIG.deal === 2, 'each wave deals 5 cards on a big map (3 on a small one)', [nb, ns]);
}

// ---------- old runs: a recipe recorded under rules 15 replays on the small map, to the very same run
{
	const small = MAZE_MAPS_SMALL[0];
	const S = TD.newRun('old-run', { map: small, squad: squad(), rev: 15 }, data), inputs = [];
	const ord = (a) => { const why = ap(S, a); if (!why) inputs.push([S.tick, a]); return why; };
	const c = S.hand[0];
	let laid = null;
	for (let y = 0; y < 9 && !laid; y++) for (let x = 2; x < 10 && !laid; x++) if (!ord({ t: 'block', card: c.id, turns: 0, x, y })) laid = [x, y];
	A(laid && S.rev === 15 && S.B.map.w === 12 && S.B.map.h === 9 && S.hand.length === 4, 'a run under rules 15: the 12 by 9 board, a hand of 5, a block laid', [laid, S.hand.length]);
	ord({ t: 'place', fig: 0, x: S.blocks[0].cells[0][0], y: S.blocks[0].cells[0][1] }); ord({ t: 'call' });
	for (let i = 0; i < 20 * 90; i++) TD.step(S, [], data);
	const rec = tdRecipe({ seed: 'old-run', mapId: small.id, squad: S.squad, inputs, end: S.tick, wave: S.cleared, rev: 15 });
	const R = tdRunTo(rec, null, data);
	A(validTdRecipe(rec) && rec.rev === 15 && R.B.map.w === 12 && R.B.map.h === 9 && !R.big && TD.hashOf(R) === TD.hashOf(S), 'its recipe replays on the small board, tick for tick', [R.B.map.w, TD.hashOf(R), TD.hashOf(S)]);
	// and today's: on the big one
	const N = TD.newRun('new-run', { map: MAZE_MAPS[0], squad: squad() }, data), in2 = [];
	const why = ap(N, { t: 'call' }); if (!why) in2.push([N.tick, { t: 'call' }]);
	for (let i = 0; i < 20 * 30; i++) TD.step(N, [], data);
	const rec2 = tdRecipe({ seed: 'new-run', mapId: MAZE_MAPS[0].id, squad: N.squad, inputs: in2, end: N.tick, wave: N.cleared });
	const R2 = tdRunTo(rec2, null, data);
	A(rec2.rev === TD.TD_RULES_REV && R2.B.map.w === 24 && R2.big === true && TD.hashOf(R2) === TD.hashOf(N), 'a run recorded today replays on the big board, tick for tick');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
