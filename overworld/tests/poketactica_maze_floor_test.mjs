// poketactica_maze_floor_test.mjs — MAZE BUILDER's NEW BLOCK KINDS (TD_RULES_REV 17; the improvement plan, item 12: "eight
// bonus blocks, all 'stand here, be stronger'"). Three that are something else:
//   Beacon     figurines on the raised tiles TOUCHING it hit 15% harder (not the one standing on it)
//   Mud        laid ON the way, not across it: enemies wade through at half speed
//   Caltrops   laid ON the way: each tile hurts an enemy as it crosses
// Each is laid here and its effect observed against the same run without it. A run recorded under rules 16 is never
// offered one.   node overworld/tests/poketactica_maze_floor_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as MZ from '../../poketactica/js/td/maze.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { tdRecipe, tdRunTo } from '../../poketactica/js/td/replay.js';
import { MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
// a straight way along row 3, a rock under it at (5, 5)
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '.....1......', '............', '............'],
	ground: ['gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggsgggggg', 'gggggggggggg', 'gggggggggggg'],
	gates: [[0, 3]], base: [11, 3] });
const fig = (sp, moves, lv = 40) => { let f = makeFigurine(sp, lv, makeRng('mzf' + sp), data, { id: 'mzf-' + sp, shinyRate: 0 }); f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return f; };
const ap = (S, a) => TD.applyInput(S, a, data);
const run = (o = {}) => { const S = TD.newRun(o.seed || 'floor', { map: o.map || FIELD, squad: o.squad || [fig('mew', ['tackle'])], ...(o.rev ? { rev: o.rev } : {}) }, data); S.gold = 999; return S; };
const lay = (S, shape, bonus, turns, x, y) => { const c = C.addCard(S, shape, bonus); return ap(S, { t: 'block', card: c.id, turns, x, y }); };
const W = 12;

// ---------- the list
{
	A(TD.TD_RULES_REV >= 17 && C.NEW_BONUS_REV === 17, 'rules revision 17');
	A(C.BONUSES.length === 11 && ['beacon', 'mud', 'caltrops'].every((k) => C.BONUS[k] && C.BONUS[k].name && C.BONUS[k].text) && C.BONUS.beacon.aura === 15 && C.BONUS.mud.floor === 'mud' && C.BONUS.caltrops.floor === 'caltrops', 'three new kinds: the Beacon (an aura), Mud and Caltrops (laid on the way)');
	A(C.bonusesAt(17).length === 11 && C.bonusesAt(16).length === 8 && !C.bonusesAt(16).some((k) => C.BONUS[k].aura || C.BONUS[k].floor), 'a run under rules 16 knows the first eight only');
	A(TD.isFloor('mud') && TD.isFloor('caltrops') && !TD.isFloor('beacon') && !TD.isFloor('tall') && !TD.isFloor(null), 'isFloor tells the cards laid on the way from the blocks');
	// the rewards: the new kinds are offered under 17, never under 16; the old stream is what it was
	const seen = (list) => { const got = new Set(); for (let n = 1; n <= 300; n++) for (const o of C.rewardsOf('rw17', n, n % 10 === 0, false, list).opts) if (o.k === 'bonus') got.add(o.bonus); return got; };
	const s17 = seen(C.bonusesAt(17)), s16 = seen(C.bonusesAt(16));
	A(['beacon', 'mud', 'caltrops'].every((k) => s17.has(k)) && !['beacon', 'mud', 'caltrops'].some((k) => s16.has(k)), 'the rewards offer them under rules 17, and never under 16', [[...s17], [...s16]]);
	A(JSON.stringify(C.rewardsOf('same', 7, false, false)) === JSON.stringify(C.rewardsOf('same', 7, false, false, C.bonusesAt(16))), 'with no list given the rewards are the old ones');
	const R = run({ seed: 'offer17' }), O = run({ seed: 'offer17', rev: 16 });
	for (const X of [R, O]) { ap(X, { t: 'call' }); for (let i = 0; i < 20 * 600 && !(X.cleared >= 1 && X.phase === 'wait') && !X.over; i++) TD.step(X, [], data); }
	A(JSON.stringify(R.pick.opts) === JSON.stringify(C.rewardsOf('offer17', 1, false, R.lives < TD.LIVES, C.bonusesAt(17)).opts) && JSON.stringify(O.pick.opts) === JSON.stringify(C.rewardsOf('offer17', 1, false, O.lives < TD.LIVES, C.bonusesAt(16)).opts), 'a run is offered by its own revision\'s list');
}

// ---------- Mud and Caltrops: laid ON the way
{
	const S = run();
	const way0 = MZ.wayLength(S.paths[0]), open0 = S.open.slice(), h0 = S.B.map.height.slice();
	A(TD.floorWhy(S, 'I', 0, 4, 3) === null && TD.waysWith(S, 'I', 0, 4, 3, 'mud') === S.paths, 'a Mud card may lie along the way, and the way would not change');
	A(lay(S, 'I', 'mud', 0, 4, 3) === null, 'Mud, four tiles in a line, laid on the way');
	A(MZ.wayLength(S.paths[0]) === way0 && JSON.stringify(S.open) === JSON.stringify(open0) && JSON.stringify(S.B.map.height) === JSON.stringify(h0), 'the way is as long as it was: the tiles stay open ground, at ground level');
	const b = S.blocks[0];
	A(S.blocks.length === 1 && b.bonus === 'mud' && b.cells.length === 4 && b.cells.every(([x, y]) => S.pads[y * W + x] === 'mud') && Object.keys(S.pads).length === 4, 'the four tiles are marked as mud', S.pads);
	A(TD.placeBlock(S, 0, b.cells[0][0], b.cells[0][1]) === 'figurines stand on blocks', 'nobody stands on it');
	A(lay(S, 'one', 'caltrops', 0, b.cells[0][0], b.cells[0][1]) === 'something is laid there already' && lay(S, 'one', null, 0, b.cells[0][0], b.cells[0][1]) === 'mud or caltrops lie there' && TD.waysWith(S, 'one', 0, b.cells[0][0], b.cells[0][1]) === null, 'nothing else goes on a tile that has some: not a second floor card, not a block');
	A(lay(S, 'one', 'mud', 0, 0, 3) === 'not on a gate or the base' && lay(S, 'one', 'mud', 0, 11, 3) === 'not on a gate or the base' && lay(S, 'one', 'mud', 0, 5, 5) === 'only on open ground' && lay(S, 'I', 'mud', 0, 10, 0) === 'off the board', 'not on the gate, the base, a rock, or off the board');
	S.hand = S.hand.filter((c) => !c.bonus && c.shape !== 'one' || false);
	// taken back: the marks go, the card returns
	const n0 = S.hand.length;
	A(ap(S, { t: 'unblock', id: b.id }) === null && !S.pads && S.blocks.length === 0 && S.hand.length === n0 + 1 && S.hand[S.hand.length - 1].bonus === 'mud', 'taken back this round: the mud is gone and the card is in the hand');
	const T2 = run(); ap(T2, { t: 'call' }); for (let i = 0; i < 400 && T2.phase !== 'wave'; i++) TD.step(T2, [], data);
	A(TD.floorWhy(T2, 'one', 0, 4, 3) === 'not during a wave', 'not during a wave');
}
// ---- mud slows: the same wave reaches the base later
{
	const through = (bonus) => {
		const S = run({ seed: 'mudrun', squad: [fig('mew', ['tackle'])] });
		if (bonus) { lay(S, 'I', bonus, 0, 2, 3); lay(S, 'I', bonus, 0, 6, 3); }
		ap(S, { t: 'call' });
		let leakAt = 0, hurt = 0, slowSeen = 0;
		for (let i = 0; i < 20 * 400 && !leakAt && !S.over && S.cleared < 1; i++) {
			TD.step(S, [], data);
			for (const e of S.ev) { if (e.t === 'leak' && !leakAt) leakAt = S.tick; if (e.t === 'hurt' && e.why === 'caltrops') hurt += e.n; }
			if (S.enemies.some((e) => S.tick < e.slow)) slowSeen++;
		}
		return { leakAt, hurt, slowSeen, S };
	};
	const plain = through(null), mud = through('mud'), cal = through('caltrops');
	A(plain.leakAt > 0 && mud.leakAt > plain.leakAt * 1.3 && mud.slowSeen > 20 && plain.slowSeen === 0, `eight tiles of mud on an 11-tile way: the first enemy reaches the base at tick ${mud.leakAt}, not ${plain.leakAt}`, [plain.leakAt, mud.leakAt, mud.slowSeen]);
	A(cal.hurt > 0 && plain.hurt === 0 && cal.leakAt === plain.leakAt, `caltrops hurt what crosses them (${cal.hurt} in all before the first leak) and slow nothing`, [cal.hurt, cal.leakAt, plain.leakAt]);
}
// ---- the limits: mud for so many ticks an enemy, caltrops for a fifth of its HP
{
	const S = run({ seed: 'limits' });
	// a long snake of a way would take walls; instead: lay caltrops on every free tile of the straight way (9 tiles)
	for (let x = 1; x <= 10; x++) lay(S, 'one', 'caltrops', 0, x, 3);
	A(Object.keys(S.pads).length === 10, 'ten tiles of caltrops on the way');
	ap(S, { t: 'call' });
	const lost = {};
	let maxHP = {};
	for (let i = 0; i < 20 * 200 && !S.over && S.cleared < 1; i++) {
		TD.step(S, [], data);
		for (const e of S.enemies) { const v = S.B.units.find((u) => u.uid === e.uid); if (v) maxHP[e.uid] = v.maxHP; }
		for (const e of S.ev) if (e.t === 'hurt' && e.why === 'caltrops') lost[e.uid] = (lost[e.uid] || 0) + e.n;
	}
	const ids = Object.keys(lost);
	A(ids.length >= 3 && ids.every((id) => lost[id] <= Math.floor(maxHP[id] * C.FLOOR.caltropMax)) && ids.some((id) => lost[id] >= Math.floor(maxHP[id] * C.FLOOR.caltropMax) - 1), 'however many tiles, an enemy loses a fifth of its HP to caltrops at most', ids.map((id) => [lost[id], maxHP[id]]));
	A(S.kills === 0, 'so caltrops alone knock nobody out', S.kills);
	const M = run({ seed: 'limits' });
	for (let x = 1; x <= 10; x++) lay(M, 'one', 'mud', 0, x, 3);
	ap(M, { t: 'call' });
	let most = 0;
	for (let i = 0; i < 20 * 300 && !M.over && M.cleared < 1; i++) { TD.step(M, [], data); for (const e of M.enemies) most = Math.max(most, e.mud || 0); }
	A(most > 0 && most <= C.FLOOR.mudMax, `mud slows an enemy for ${C.FLOOR.mudMax} ticks in all at most (seen: ${most})`, most);
}

// ---------- the Beacon: the raised tiles touching it hit harder
{
	// a foe held on the way at (4, 3); the figurine on a plain block at (4, 4); beside that block, at (5, 4), a beacon or a plain block
	const scene = (bonus) => {
		const S = run({ seed: 'beacon', squad: [fig('mew', ['tackle']), fig('mewtwo', ['tackle'])] });
		const why = [lay(S, 'one', null, 0, 4, 4), lay(S, 'one', bonus, 0, 5, 4)];
		const foe = B.makeUnit(makeFigurine('snorlax', 40, makeRng('foe'), data, { id: 'foe', shinyRate: 0 }), 'e0', 'e', 4, 3, 'hold', data);
		foe.ability = null; foe.maxHP = 1e6; foe.hp = 1e6;
		S.B.units.push(foe); S.enemies.push({ uid: 'e0', d: 4 * TD.SUB, gate: 0, boss: false, stop: 1e9, slow: 0, back: 0, dot: 0, dotKind: null, by: null });
		S.phase = 'wave'; S.wave = 1; S.left = [];
		return { S, why, foe };
	};
	const dealt = (sc, figIdx, x, y, ticks = 20 * 20) => {
		const why = ap(sc.S, { t: 'place', fig: figIdx, x, y });
		let hit = 0, more = 0;
		for (let i = 0; i < ticks; i++) { TD.step(sc.S, [], data); for (const e of sc.S.ev) { if (e.t === 'hit' && e.target === 'e0') hit += e.dmg; if (e.t === 'hurt' && e.why === 'beacon') more += e.n; } }
		return { why, hit, more };
	};
	const plain = scene(null), bea = scene('beacon');
	A(plain.why.every((w) => w === null) && bea.why.every((w) => w === null) && !plain.S.aura && bea.S.aura && bea.S.aura[4 * W + 4] === 15 && bea.S.aura[5 * W + 5] === 15 && bea.S.aura[4 * W + 5] === undefined, 'a Beacon gives the raised tiles touching it +15%: the block beside it and the rock under it, not itself', bea.S.aura);
	const a = dealt(plain, 0, 4, 4), b = dealt(bea, 0, 4, 4);
	A(a.why === null && b.why === null && a.hit > 0 && a.hit === b.hit && a.more === 0 && b.more > 0 && Math.abs(b.more / b.hit - 0.15) < 0.02, `the same hits from the same block: beside a Beacon they land 15% harder (${b.hit} + ${b.more})`, [a, b]);
	// the one standing ON the beacon gets nothing from it
	const on = scene('beacon'), c = dealt(on, 0, 5, 4, 20 * 20);
	A(c.why === null && c.more === 0, 'the figurine standing on the Beacon itself gets nothing from it', c);
	// two beacons add up, to the limit
	const two = scene('beacon');
	two.S.phase = 'wait'; lay(two.S, 'one', 'beacon', 0, 3, 4); lay(two.S, 'one', 'beacon', 0, 4, 5);
	A(two.S.aura[4 * W + 4] === C.AURA_MAX && C.AURA_MAX === 30, 'three Beacons round one block: +30%, the most', two.S.aura[4 * W + 4]);
	// taken back: the aura goes
	const gone = scene('beacon'), id = gone.S.blocks.find((x) => x.bonus === 'beacon').id;
	gone.S.phase = 'wait';
	A(ap(gone.S, { t: 'unblock', id }) === null && !gone.S.aura, 'the Beacon taken back: its aura goes with it');
}

// ---------- a run with them replays to the very same run
{
	const S = TD.newRun('replay17', { map: MAZE_MAPS[0], squad: [fig('mew', ['tackle'])] }, data), inputs = [];
	S.hand.push({ id: 'tM', shape: 'I', bonus: 'mud' }, { id: 'tC', shape: 'three', bonus: 'caltrops' }, { id: 'tB', shape: 'one', bonus: 'beacon' });
	const ord = (a) => { const why = ap(S, a); if (!why) inputs.push([S.tick, a]); return why; };
	const way = S.paths[0];
	A(ord({ t: 'block', card: 'tM', turns: 0, x: way[4][0], y: way[4][1] }) === null && ord({ t: 'block', card: 'tC', turns: 0, x: way[10][0], y: way[10][1] }) === null, 'mud and caltrops laid on the big Open Field\'s way');
	A(ord({ t: 'block', card: 'tB', turns: 0, x: 6, y: 2 }) === null, 'and a Beacon off it');
	ord({ t: 'call' });
	for (let i = 0; i < 20 * 60; i++) TD.step(S, [], data);
	// (the hand was seeded by hand: the replay is given the same three cards)
	const rec = tdRecipe({ seed: 'replay17', mapId: MAZE_MAPS[0].id, squad: S.squad, inputs: [], end: 0, wave: 0 });
	const R = tdRunTo(rec, null, data);
	R.hand.push({ id: 'tM', shape: 'I', bonus: 'mud' }, { id: 'tC', shape: 'three', bonus: 'caltrops' }, { id: 'tB', shape: 'one', bonus: 'beacon' });
	for (const [, a] of inputs) ap(R, a);
	for (let i = 0; i < 20 * 60; i++) TD.step(R, [], data);
	A(TD.hashOf(R) === TD.hashOf(S) && JSON.stringify(R.pads) === JSON.stringify(S.pads), 'the same orders make the same run, tick for tick');
	A(TD.view(S).blocks.filter((b) => b.bonus === 'mud' || b.bonus === 'caltrops' || b.bonus === 'beacon').length === 3, 'the page is told of all three (view)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
