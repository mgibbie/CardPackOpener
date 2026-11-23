// sweep_moves.mjs — THE MOVES SWEEP (owner, 2026-11-23): every move, USED for real in each kind of Poketactica mode, and
// what it did there. Not a reading of the tables: the move is fired on a board and the board is compared before / after.
//   turn  the turn-based battle (Story, Dungeon, Versus share engine/battle.js)
//   maze  Mystery Maze (the same hit on the maze's 8-way geometry, mm/combat.js)
//   td    Tower Defense (what a tower does with it: td/effects.js tdKind, the mode's own rule)
// A cell is the list of things that changed: damage, heal, status, stat, moved (someone was pushed / pulled / swapped /
// leapt), weather, terrain, mark (something that lasts: a screen, Taunt, Leech Seed), ability, type, other:<what>; chip is a hit for under 3% of the target's HP (a move the engine has no power
// for). An EMPTY list is a move that does nothing there.
// Each move is tried from every tile it can be aimed at, with three dice, in two set-ups (fresh; and "set": foes asleep
// and hurt, the user hurt, as moves like Dream Eater or Rest need). The aim that changes the most is the cell.
//   node tools/poketactica/sweep_moves.mjs            print the summary
//   node tools/poketactica/sweep_moves.mjs --write    also write poketactica/data/move_sweep.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W, MM_H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { mazeGeo, aimsOf } from '../../poketactica/js/mm/combat.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
export const loadData = () => ({ species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') });

const USER = 'mew', FOE = 'squirtle', ALLY = 'eevee';   // (a foe no type is useless against; the user learns anything)
// (the allies carry no moves: an ally beside the user would join in with a TEAM ATTACK, and its hit would be counted as the move's)
const fig = (sp, lv, data, tag) => { const f = makeFigurine(sp, lv, makeRng(sp + tag), data, { id: sp + '-' + tag, shinyRate: 0 }); return sp === ALLY ? { ...f, equipped: [] } : f; };
const DICE = ['a', 'b', 'c'];
const PHYS_ANSWER = new Set(['counter', 'metalburst', 'comeuppance', 'bide']);   // (the "set" hit is physical for these, special for Mirror Coat)

/** What of a unit the sweep compares (not the user's own PP / SP, which every move spends). */
const SKIP = new Set(['lastHit', 'fig', 'pp', 'uid', 'side', 'species', 'level', 'maxHP', 'maxSP', 'ai', 'held', 'heldId', 'facing', 'dir', 'moved', 'acted', 'origin']);
const snap = (S, extra) => JSON.parse(JSON.stringify({ units: S.units.map((u) => Object.fromEntries(Object.entries(u).filter(([k]) => !SKIP.has(k)))), field: S.field, ground: S.map && S.map.ground, geo: S.geo, ...extra }));
function changes(S, a, b, userIdx) {
	const out = new Set();
	a.units.forEach((ua, i) => {
		const ub = b.units[i]; if (!ub) return;
		const foe = S.units[i].side !== S.units[userIdx].side;
		for (const k of new Set([...Object.keys(ua), ...Object.keys(ub)])) {
			if (JSON.stringify(ua[k]) === JSON.stringify(ub[k])) continue;
			if (k === 'sp' && i === userIdx) continue;
			if (k === 'hp') out.add(ub.hp < ua.hp ? (foe ? (ua.hp - ub.hp < S.units[i].maxHP * 0.03 ? 'chip' : 'damage') : i === userIdx ? 'self-hurt' : 'ally-hurt') : 'heal');   // (chip: under 3% of its HP, a move whose power the engine does not know)
			else if (k === 'status' || k === 'confused' || k === 'sleepTurns' || k === 'toxic') out.add('status');
			else if (k === 'boosts') out.add('stat');
			else if (k === 'x' || k === 'y') out.add('moved');
			else if (k === 'sp') out.add('sp');
			else if (k === 'fx' || k === 'seed') out.add('mark');   // (something that lasts: a screen, Taunt, Leech Seed ...)
			else if (k === 'ability') out.add('ability');
			else if (k === 'types') out.add('type');
			else out.add('other:' + k);
		}
	});
	if (JSON.stringify(a.field) !== JSON.stringify(b.field)) out.add('weather');
	if (JSON.stringify(a.ground) !== JSON.stringify(b.ground)) out.add('terrain');
	if (JSON.stringify(a.geo) !== JSON.stringify(b.geo)) out.add('other:geo');
	if (a.F && JSON.stringify(a.F) !== JSON.stringify(b.F)) out.add('terrain');
	return [...out].sort();
}
/** "Set": the foes asleep and hurt, the user and its allies hurt (what Dream Eater, Rest, Wake-Up Slap ... need). */
function setUp(S, userIdx) {
	const me = S.units[userIdx];
	me.lastHit = { n: 30, phys: PHYS_ANSWER.has(S._sweepMove), by: S.units.find((x) => x.side !== me.side).uid }; me.stock = 2; me.status = 'psn';   // (struck, stocked up, poisoned: Counter's kin, Spit Up / Swallow, Refresh / Psycho Shift)
	S.units.forEach((u, i) => {
		u.hp = Math.max(1, Math.floor(u.maxHP / 2));
		if (u.side !== S.units[userIdx].side) { u.status = 'slp'; u.sleepTurns = 9; }
	});
}

// ---------- the turn-based battle
const TW = 13, TH = 13, C = 6;
const T_FOES = [[C, C - 1], [C, C - 2], [C, C - 3], [C + 1, C], [C + 2, C], [C - 1, C - 1], [C, C - 5], [C + 4, C]], T_ALLIES = [[C - 1, C], [C, C + 1], [C - 2, C]];
function turnBoard(data) {
	const map = { w: TW, h: TH, height: Array(TW * TH).fill(0), base: { x: 0, y: 0 }, ground: Array(TW * TH).fill(null) };
	const S = B.newBattle('sweep', { map, rev: B.RULES_REV, noBonus: true, player: [fig(USER, 60, data, 'u'), ...T_ALLIES.map((_, i) => fig(ALLY, 50, data, 'a' + i))],
		enemy: T_FOES.map(([x, y], i) => ({ fig: fig(FOE, 50, data, 'f' + i), x, y, ai: 'hold' })) }, data);
	const mine = S.units.filter((u) => u.side === 'p');
	mine[0].x = C; mine[0].y = C; mine[0].facing = 'n';
	T_ALLIES.forEach(([x, y], i) => { mine[i + 1].x = x; mine[i + 1].y = y; });
	return S;
}
function sweepTurn(id, data, base) {
	for (const set of [false, true]) {
		const S0 = structuredClone(base);
		S0._sweepMove = id;
		if (set) setUp(S0, 0);
		delete S0._sweepMove;
		const m = B.moveOf(S0.units[0], id, data);
		if (!m) return { err: 'no shape' };
		let best = [];
		for (const die of DICE) {
			for (const [x, y] of B.aimTiles(S0, S0.units[0], m)) {
				const S = structuredClone(S0); S.rng = makeRng('sweep-' + die).state();
				const before = snap(S);
				try { B.useMoveAt(S, S.units[0], { move: id, x, y }, data); } catch (e) { return { err: String(e.message || e).slice(0, 120) }; }
				const did = changes(S, before, snap(S), 0);
				if (did.length > best.length) best = did;
			}
			if (best.length) return { did: best, ...(set ? { set: 1 } : {}) };
		}
	}
	return { did: [] };
}

// ---------- Mystery Maze
const MX = 20, MY = 15;
const M_FOES = [[1, 0], [2, 0], [3, 0], [0, -1], [0, -2], [1, 1], [-1, -1], [2, 2], [5, 0]], M_ALLY = [[-1, 0], [0, 1], [-2, 0]];
/** The sweep's maze: an open floor, the user and three allies, nine foes around them. -> the run */
export function mazeRun(data) {
	const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 0, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
		itemDensity: 0, trapDensity: 0, numExtraHallways: 0, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
	const S = MM.newRun('sweep', { dungeon: { id: 'sweep', name: 'Sweep', party: 4, floors: [{ props: PROPS, water: false, vis: 0, wild: [] }, { props: PROPS, water: false, vis: 0, wild: [] }] },
		party: [fig(USER, 60, data, 'u'), ...M_ALLY.map((_, i) => fig(ALLY, 50, data, 'a' + i))] }, data);
	for (let y = 2; y < MM_H - 2; y++) for (let x = 2; x < MM_W - 2; x++) { S.F.terrain[y * MM_W + x] = T_FLOOR; S.F.room[y * MM_W + x] = 0; }
	S.items = []; S.traps = [];
	for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1);   // (in place: the board's units ARE the run's)
	const party = MM.partyOf(S), L = MM.leaderOf(S);
	L.x = MX; L.y = MY;
	party.filter((u) => u !== L).forEach((u, i) => { u.x = MX + M_ALLY[i][0]; u.y = MY + M_ALLY[i][1]; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.B.map = { w: MM_W, h: MM_H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	for (const [dx, dy] of M_FOES) MM.addWild(S, FOE, 50, MX + dx, MY + dy, data);
	return S;
}
function mazeBoard(data) { const S = mazeRun(data); return { B: S.B, F: S.F, lead: S.B.units.indexOf(MM.leaderOf(S)) }; }
function sweepMaze(id, data, base) {
	for (const set of [false, true]) {
		const W0 = structuredClone(base);
		W0.B._sweepMove = id;
		if (set) setUp(W0.B, W0.lead);
		delete W0.B._sweepMove;
		const u0 = W0.B.units[W0.lead], m = B.moveOf(u0, id, data);
		if (!m) return { err: 'no shape' };
		let best = [];
		for (const die of DICE) {
			for (const [x, y] of aimsOf(W0.F, u0, m)) {
				const W = structuredClone(W0); W.B.rng = makeRng('sweep-' + die).state();
				const G = mazeGeo(W.F, (u, tx, ty) => (W.F.terrain[ty * MM_W + tx] & 3) === T_FLOOR);
				const before = snap(W.B, { F: { terrain: Array.from(W.F.terrain) } });
				try { B.useMoveAt(W.B, W.B.units[W.lead], { move: id, x, y }, data, G); } catch (e) { return { err: String(e.message || e).slice(0, 120) }; }
				const did = changes(W.B, before, snap(W.B, { F: { terrain: Array.from(W.F.terrain) } }), W.lead);
				if (did.length > best.length) best = did;
			}
			if (best.length) return { did: best, ...(set ? { set: 1 } : {}) };
		}
	}
	return { did: [] };
}

/** The whole sweep. -> { moveId: { turn, maze, td } } (turn / maze: { did: [...], set? } or { err }; td: the tower's kind) */
export function sweep(data, only) {
	const tb = turnBoard(data), mz = mazeBoard(data), out = {};
	const user = tb.units[0];
	for (const id of Object.keys(data.moves).sort()) {
		if (only && !only.includes(id)) continue;
		if (!data.shapes[id]) { out[id] = { turn: { err: 'no shape' }, maze: { err: 'no shape' }, td: 'none' }; continue; }
		out[id] = { turn: sweepTurn(id, data, tb), maze: sweepMaze(id, data, mz), td: tdKind(id, B.moveOf(user, id, data)) };
	}
	return out;
}
export function summary(R) {
	const ids = Object.keys(R), dead = (k) => ids.filter((id) => R[id][k].did && !R[id][k].did.length), err = (k) => ids.filter((id) => R[id][k].err);
	const chip = (k) => ids.filter((id) => R[id][k].did && R[id][k].did.includes('chip') && !R[id][k].did.includes('damage'));
	return { moves: ids.length, turn: { nothing: dead('turn'), chip: chip('turn'), error: err('turn') }, maze: { nothing: dead('maze'), chip: chip('maze'), error: err('maze') }, td: { nothing: ids.filter((id) => R[id].td === 'none') },
		differ: ids.filter((id) => R[id].turn.did && R[id].maze.did && JSON.stringify(R[id].turn.did) !== JSON.stringify(R[id].maze.did)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const data = loadData(), t0 = Date.now(), R = sweep(data), s = summary(R);
	console.log(`${s.moves} moves, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	for (const k of ['turn', 'maze']) console.log(`${k}: ${s[k].nothing.length} do nothing, ${s[k].chip.length} only chip (${s[k].chip.join(' ')}), ${s[k].error.length} error\n  nothing: ${s[k].nothing.join(' ')}\n  error: ${s[k].error.map((id) => id + ' (' + R[id][k].err + ')').join('; ')}`);
	console.log(`td: ${s.td.nothing.length} of no use to a tower`);
	console.log(`differ between turn and maze: ${s.differ.length}\n  ${s.differ.map((id) => `${id} [${R[id].turn.did}] vs [${R[id].maze.did}]`).join('; ')}`);
	if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'poketactica/data/move_sweep.json'), JSON.stringify(R, null, '\t').replace(/\[\n\t+("[^\]]*?)\n\t+\]/g, (m) => m.replace(/\s+/g, ' ')) + '\n'); console.log('wrote poketactica/data/move_sweep.json'); }
}
