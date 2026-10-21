// rotating_gates_test.mjs — pokeemerald's rotating gate puzzles (src/rotating_gate.c)
// in FORTREE GYM and TRICK HOUSE PUZZLE 6 (overworld/rotating_gates.js).
//
// Both maps' ON_TRANSITION ran `special RotatingGate_InitPuzzle` into nothing and
// the gates' collision (field_player_avatar.c -> CheckForRotatingGatePuzzleCollision)
// was never ported, so the gates did not exist and both puzzles were open floor.
//
// Node-only: the module is pure. Checks the decomp's own rules on real layouts:
//   * a gate's arm stops the step that crosses it; pushing it turns the gate a
//     quarter the right way and lets you through, unless an arm would sweep a wall;
//   * InitPuzzle puts every gate back to the puzzle's start (both maps reset on entry);
//   * the orientation bytes live in VAR_TEMP_0.. two gates a var, low byte first;
//   * with the gates in their ORIGINAL layout, a breadth-first search over
//     (position, every gate's orientation) reaches WINONA, and the Trick House's
//     scroll and exit; and the gates matter: some steps are refused at the start.
//
//   node overworld/tests/rotating_gates_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as RG from '../rotating_gates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../data');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const story = () => ({ vars: {}, getVar(v) { return this.vars[v] || 0; }, setVar(v, x) { this.vars[v] = x; } });
function mapData(name) {
	const m = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', name + '_map.json'), 'utf8'));
	const L = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', m.layout + '.json'), 'utf8'));
	return { m, L };
}
const collisionOf = L => (x, y) => (x < 0 || y < 0 || x >= L.width || y >= L.height) ? 1 : (L.map[y][x] >> 10) & 3;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// --- the module's own rules ---
{
	const st = story();
	A(RG.puzzleFor('FortreeCity_Gym') === RG.FORTREE_GATES && RG.puzzleFor('Hoenn2_FortreeCity_Gym') === RG.FORTREE_GATES, 'Fortree Gym (and its Hoenn2 copy) carry the Fortree puzzle');
	A(RG.puzzleFor('Route110_TrickHousePuzzle6') === RG.TRICK_HOUSE_GATES && !RG.puzzleFor('FortreeCity'), 'Trick House Puzzle 6 carries its own, other maps none');
	A(RG.initPuzzle(st, 'FortreeCity_Gym'), 'InitPuzzle sets up the gym');
	A(RG.FORTREE_GATES.every((g, i) => RG.getOrientation(st, i) === g.orientation), 'every gate starts in the decomp\'s orientation');
	// gates 0,1 -> VAR_TEMP_0 (lo, hi); 2,3 -> VAR_TEMP_1 ...; Fortree uses VAR_TEMP_0..3
	A(st.vars.VAR_TEMP_0 === (RG.FORTREE_GATES[0].orientation | (RG.FORTREE_GATES[1].orientation << 8)), 'orientations pack two a temp var, low byte first', JSON.stringify(st.vars));
	A(Object.keys(st.vars).sort().join() === 'VAR_TEMP_0,VAR_TEMP_1,VAR_TEMP_2,VAR_TEMP_3', 'Fortree uses VAR_TEMP_0..3 (the map script\'s NOTE)', Object.keys(st.vars).join());
	const t = story(); RG.initPuzzle(t, 'Route110_TrickHousePuzzle6');
	A(Object.keys(t.vars).length === 6, 'Trick House uses VAR_TEMP_0..5', Object.keys(t.vars).join());
}

// gate 4 of Fortree: T1 at (9,12) facing 0: arms N (9,12)-(9,11), E (9,12)-(10,12), S (9,12)-(9,13)
{
	const { L } = mapData('FortreeCity_Gym');
	const st = story(); RG.initPuzzle(st, 'FortreeCity_Gym');
	const col = collisionOf(L);
	const arms = RG.gateArms(st, 'FortreeCity_Gym').filter(a => a.gate === 4);
	A(arms.length === 3 && arms.some(a => a.x1 === 9 && a.y1 === 11) && arms.some(a => a.x1 === 10 && a.y1 === 12) && arms.some(a => a.x1 === 9 && a.y1 === 13),
		'a T1 gate at orientation 0 has its N, E and S arms', JSON.stringify(arms));
	// stepping NORTH from (8,12) to (8,11) crosses the edge y=12 west of the pivot,
	// where only a WEST arm would lie: nothing there at orientation 0
	A(!RG.checkGateCollision(st, 'FortreeCity_Gym', 'up', 8, 11, col, { animate: false }) && RG.getOrientation(st, 4) === 0, 'a step clear of the arms is not touched');
}

// a synthetic room with no walls: push each arm and watch the turn
{
	const st = story(); RG.initPuzzle(st, 'FortreeCity_Gym');
	const open = () => 0;
	// Fortree gate 4: T1 at (9,12), o=0. Walking EAST from (8,11) to (9,11) crosses
	// its NORTH arm (the edge x=9, y 11..12): CW, through.
	const before = RG.getOrientation(st, 4);
	const blocked = RG.checkGateCollision(st, 'FortreeCity_Gym', 'right', 9, 11, open, { animate: false });
	A(!blocked && RG.getOrientation(st, 4) === (before + 1) % 4, 'pushing the north arm east turns the gate clockwise and lets you through', `${before} -> ${RG.getOrientation(st, 4)}`);
	// now o=1: arms E, S, W. Walking WEST from (9,11) to (8,11) crosses nothing (north arm is gone)
	A(!RG.checkGateCollision(st, 'FortreeCity_Gym', 'left', 8, 11, open, { animate: false }) && RG.getOrientation(st, 4) === 1, 'the arm that turned away no longer stops that edge');
	// walking WEST into (8,12) from (9,12)... the west arm now lies on y=12, x 8..9 (horizontal): a
	// west step does not cross a horizontal edge
	A(!RG.checkGateCollision(st, 'FortreeCity_Gym', 'left', 8, 12, open, { animate: false }), 'a horizontal arm never stops a sideways step');
	// walking NORTH from (8,12) to (8,11) crosses the west arm: clockwise
	const b2 = RG.getOrientation(st, 4);
	A(!RG.checkGateCollision(st, 'FortreeCity_Gym', 'up', 8, 11, open, { animate: false }) && RG.getOrientation(st, 4) === (b2 + 1) % 4, 'pushing the west arm north turns it clockwise');
	// a wall in the sweep: the gate cannot turn, the step is stopped, nothing changes
	const walls = () => 1;
	const b3 = RG.getOrientation(st, 4);
	const arms3 = RG.gateArms(st, 'FortreeCity_Gym').filter(a => a.gate === 4);
	// find an edge it has: at o=2 the arms are S, W, N; walk east across the north arm again
	A(arms3.some(a => a.x1 === 9 && a.y1 === 11), 'at orientation 2 the north arm is back', JSON.stringify(arms3));
	A(RG.checkGateCollision(st, 'FortreeCity_Gym', 'right', 9, 11, walls, { animate: false }) === true && RG.getOrientation(st, 4) === b3, 'an arm that would sweep a wall: stopped, no turn');
	// collision 2/3 is NOT a wall here (vanilla checks == 1)
	A(RG.checkGateCollision(st, 'FortreeCity_Gym', 'right', 9, 11, () => 3, { animate: false }) === false, 'only collision 1 holds a gate (vanilla, no BUGFIX)');
	// InitPuzzle resets
	RG.initPuzzle(st, 'FortreeCity_Gym');
	A(RG.getOrientation(st, 4) === RG.FORTREE_GATES[4].orientation, 'InitPuzzle (re-entering the map) puts it back');
}

// --- the puzzles can be done, and the gates are in the way ---
function solve(name, starts, goals, objects) {
	const { L } = mapData(name);
	const col = collisionOf(L);
	const gates = RG.puzzleFor(name);
	const st = story(); RG.initPuzzle(st, name);
	const ori = () => gates.map((_, i) => RG.getOrientation(st, i)).join('');
	const setOri = s => { for (let i = 0; i < gates.length; i++) { const v = +s[i]; const k = 'VAR_TEMP_' + (i >> 1).toString(16).toUpperCase(); const cur = st.vars[k] | 0; st.vars[k] = i & 1 ? (cur & 0xFF) | (v << 8) : (cur & 0xFF00) | v; } };
	const blockedObj = new Set(objects.map(([x, y]) => x + ',' + y));
	const key = (x, y, o) => x + ',' + y + ',' + o;
	const seen = new Set(); const q = [];
	for (const [x, y] of starts) { const o = ori(); seen.add(key(x, y, o)); q.push([x, y, o, 0]); }
	let refusedAtStart = 0;
	const startOri = ori();
	while (q.length) {
		const [x, y, o, d] = q.shift();
		if (goals.some(([gx, gy]) => gx === x && gy === y)) return { found: true, steps: d, states: seen.size, refusedAtStart };
		for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
			const nx = x + dx, ny = y + dy;
			if (col(nx, ny) !== 0 || blockedObj.has(nx + ',' + ny)) continue;
			setOri(o);
			const blocked = RG.checkGateCollision(st, name, dir, nx, ny, col, { animate: false });
			if (blocked) { if (o === startOri) refusedAtStart++; continue; }
			const no = ori();
			const k = key(nx, ny, no);
			if (seen.has(k)) continue;
			seen.add(k); q.push([nx, ny, no, d + 1]);
		}
	}
	return { found: false, states: seen.size, refusedAtStart };
}
{
	const { m } = mapData('FortreeCity_Gym');
	const objs = m.object_events.map(o => [+o.x, +o.y]);
	const r = solve('FortreeCity_Gym', [[15, 23], [16, 23]], [[15, 3]], objs);
	A(r.found, 'FORTREE GYM: from the door, the original gates let you reach WINONA', JSON.stringify(r));
	A(r.refusedAtStart > 0, 'FORTREE GYM: some steps are refused by the gates as you find them', JSON.stringify(r));
	// and the gates are what makes it a puzzle: a gate-less walk would be shorter or equal
	A(r.steps >= 20, 'the walk to WINONA is a real route', r.steps);
}
{
	const { m } = mapData('Route110_TrickHousePuzzle6');
	const objs = m.object_events.filter(o => !/ITEM_BALL/.test(o.graphics_id)).map(o => [+o.x, +o.y]);
	const toScroll = solve('Route110_TrickHousePuzzle6', [[1, 20]], [[0, 9]], objs);
	A(toScroll.found, 'TRICK HOUSE 6: from the entrance, the gates let you reach the scroll', JSON.stringify(toScroll));
	const toExit = solve('Route110_TrickHousePuzzle6', [[1, 20]], [[13, 2]], objs);
	A(toExit.found, 'TRICK HOUSE 6: ...and the exit door', JSON.stringify(toExit));
	A(toScroll.refusedAtStart > 0, 'TRICK HOUSE 6: the gates are in the way', JSON.stringify(toScroll));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
