// poketactica_mm_turn_test.mjs — MYSTERY MAZE, the run (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 3; the original's
// turn order from Plans/PMD_SYSTEMS_SPEC.md section 1): time in ticks by the original's speed table, 8-direction walking
// and the corner rule, swapping with a partner, partners that follow, liquid only its own kind crosses, the stairs down
// floor by floor, the fog. And it is EXACT: the same seed and actions give the same run; a snapshot continues the same.
// Pure: node only.
//   node overworld/tests/poketactica_mm_turn_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { generateFloor, MM_W as W, MM_H as H, T_FLOOR, T_LIQUID, NO_ROOM } from '../../poketactica/js/mm/gen.js';
import { makeRng as mmRng, floorSeedStep } from '../../poketactica/js/mm/rng.js';
import { DIR8, canStep8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 20) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-mm' + lv, shinyRate: 0 });
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 3, trapDensity: 3, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const dungeon = (floors = 3, more = {}) => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: floors }, (_, i) => ({ props: { ...PROPS, layout: [0, 6, 9, 3, 11][i % 5], ...more }, water: false, vis: 0 })) });
const run = (seed, party = ['pikachu', 'rattata', 'squirtle'], d = dungeon()) => MM.newRun(seed, { dungeon: d, party: party.map((s) => fig(s)) }, data);
const L = (S) => MM.leaderOf(S);
/** The next direction of the shortest walk for the leader to (x, y), or -1. */
function toward(S, x, y) {
	const u = L(S), dist = MM.walkMap(S.F, u, x, y), here = dist[u.y * W + u.x];
	if (here <= 0) return -1;
	for (let d = 0; d < 8; d++) {
		if (!MM.canWalk(S.F, u, d)) continue;
		const nx = u.x + DIR8[d][0], ny = u.y + DIR8[d][1], o = MM.unitAt(S, nx, ny);
		if (dist[ny * W + nx] === here - 1 && !(o && o.side !== 'p')) return d;
	}
	return -1;
}
function walkTo(S, x, y, each) {
	for (let n = 0; n < 400; n++) {
		const d = toward(S, x, y);
		if (d < 0) break;
		const e = MM.act(S, { t: 'step', d });
		if (each) each(e);
	}
	return L(S).x === x && L(S).y === y;
}
/** Everything that must hold at any moment of a run. */
function sound(S) {
	const seen = new Set();
	for (const u of S.units.filter((v) => v.hp > 0)) {
		const k = u.y * W + u.x;
		if (seen.has(k)) return 'two on one tile';
		seen.add(k);
		if (!MM.canEnter(S.F, u, u.x, u.y)) return u.uid + ' stands where it cannot';
	}
	const u = L(S);
	if (!MM.actsOn(u.stage, S.tick)) return 'not the leader\'s tick';
	return '';
}

// ================================================================ time
{
	const ticks = (st) => Array.from({ length: 24 }, (_, t) => t).filter((t) => MM.actsOn(st, t));
	A(ticks(1).join() === '3,7,11,15,19,23' && ticks(0).join() === '7,15,23' && ticks(2).length === 12 && ticks(2).every((t) => t % 2 === 1) && ticks(3).length === 18 && ticks(3).every((t) => t % 4 !== 0) && ticks(4).length === 24,
		'the original\'s speed table: 3, 6, 12, 18 or 24 turns in 24 ticks; a normal Pokémon acts on every 4th');
}

// ================================================================ a floor, the party
{
	const S = run('alpha');
	const f = S.F, u = L(S);
	// (the chain starts from a 24-bit hash of the run's seed)
	const preOf = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) | 1) & 0xFFFFFF; };
	const direct = generateFloor(mmRng(floorSeedStep(preOf('alpha'))[0]), dungeon().floors[0].props, {});
	A(S.floorNo === 1 && f.w === W && f.h === H && f.terrain.join() === [...direct.terrain].join() && u.x === direct.player[0] && u.y === direct.player[1] && f.stairs.join() === direct.stairs.join(),
		'floor 1 is the generator\'s floor for the first seed of the run\'s chain; the leader stands on its start');
	const party = MM.partyOf(S);
	A(party.length === 3 && sound(S) === '' && party.every((p) => cheb(p.x, p.y, u.x, u.y) <= 2), 'partners start beside the leader, each on its own tile', party.map((p) => [p.x, p.y]));
	const room = f.room[u.y * W + u.x];
	let all = true, none = true;
	for (let i = 0; i < W * H; i++) { if (f.room[i] === room && (f.terrain[i] & 3) === T_FLOOR && !S.seen[i]) all = false; if (f.room[i] !== NO_ROOM && f.room[i] !== room && S.seen[i] && cheb(i % W, (i / W) | 0, u.x, u.y) > 20) none = false; }
	A(room !== NO_ROOM && all && none, 'the leader\'s room is seen at once; far rooms are not');
	A(run('alpha', ['pikachu', 'rattata', 'squirtle', 'charmander', 'bulbasaur', 'eevee', 'pidgey']).units.length === 4 && run('a', ['pikachu', 'eevee'], { ...dungeon(), party: 1 }).units.length === 1, 'the dungeon sets how many enter (4 here; 1 is solo)');
}

// ================================================================ the leader's actions
{
	const S = run('beta', ['pikachu']);
	const u = L(S), h0 = MM.hashOf(S);
	// find a wall direction and an open one from here, walking to a room edge first if needed
	const wallDir = () => [0, 2, 4, 6].find((d) => !canStep8(S.F, L(S).x, L(S).y, d));
	for (let n = 0; n < 60 && wallDir() == null; n++) MM.act(S, { t: 'step', d: [0, 2, 4, 6].find((d) => MM.canWalk(S.F, L(S), d)) });
	const before = MM.hashOf(S), turns = S.turns, wd = wallDir();
	const e = MM.act(S, { t: 'step', d: wd });
	A(wd != null && e.length === 1 && e[0].t === 'no' && e[0].why === 'a wall' && MM.hashOf(S) === before && S.turns === turns && MM.actBlock(S, { t: 'step', d: wd }) === 'a wall', 'walking into a wall is refused and no time passes', e);
	const f1 = MM.act(S, { t: 'face', d: 5 });
	A(f1[0].t === 'face' && L(S).dir === 5 && S.turns === turns && S.tick === 3, 'turning on the spot is free');
	const p1 = MM.act(S, { t: 'pass' });
	A(p1[0].t === 'pass' && S.turns === turns + 1 && S.tick === 7, 'passing takes a turn (4 ticks at normal speed)');
	A(MM.actBlock(S, { t: 'step', d: 9 }) === 'not a direction' && MM.actBlock(S, { t: 'dance' }) === 'not an action' && MM.actBlock(S, null) === 'not an action' && (MM.actBlock(S, { t: 'stairs' }) === 'not on the stairs' || (u.x === S.F.stairs[0] && u.y === S.F.stairs[1])), 'bad actions are refused by name');
	A(h0 !== MM.hashOf(S), 'the run\'s hash moves with it');
	// the corner rule, on a floor edited to have one
	const T = run('corner', ['pikachu']);
	const c = L(T), F = T.F, at = (x, y) => y * W + x;
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { F.terrain[at(c.x + dx, c.y + dy)] = T_FLOOR; }
	F.terrain[at(c.x + 1, c.y)] = 0;
	A(MM.actBlock(T, { t: 'step', d: 1 }) === 'a corner in the way' && MM.actBlock(T, { t: 'step', d: 3 }) === 'a corner in the way' && MM.actBlock(T, { t: 'step', d: 2 }) === 'a wall' && MM.actBlock(T, { t: 'step', d: 7 }) === null, 'no diagonal step round a wall\'s corner');
	const s1 = MM.act(T, { t: 'step', d: 7 });
	A(s1.some((v) => v.t === 'step' && v.uid === 'p0' && v.d === 7) && L(T).x === c.x && T.steps === 1 && L(T).dir === 7, 'a diagonal step is one step, and turns the leader that way');
}

// ================================================================ liquid
{
	const mk = (sp, water) => { const S = run('wet', [sp], { ...dungeon(), floors: [{ props: PROPS, water, vis: 0 }] }); const u = L(S); S.F.terrain[u.y * W + u.x + 1] = water ? 3 : T_LIQUID; return S; };
	A(MM.actBlock(mk('pikachu', true), { t: 'step', d: 2 }) === 'deep water' && MM.actBlock(mk('pikachu', false), { t: 'step', d: 2 }) === 'lava', 'a walker does not step into water or lava');
	A(MM.actBlock(mk('squirtle', true), { t: 'step', d: 2 }) === null && MM.actBlock(mk('squirtle', false), { t: 'step', d: 2 }) === 'lava', 'a Water type crosses water, not lava');
	A(MM.actBlock(mk('charmander', false), { t: 'step', d: 2 }) === null && MM.actBlock(mk('charmander', true), { t: 'step', d: 2 }) === 'deep water', 'a Fire type crosses lava, not water');
	A(MM.actBlock(mk('pidgey', true), { t: 'step', d: 2 }) === null && MM.actBlock(mk('pidgey', false), { t: 'step', d: 2 }) === null && MM.actBlock(mk('gastly', false), { t: 'step', d: 2 }) === null, 'a flier (a Flying type, or Levitate) crosses both');
	// liquid does not make a corner
	const S = mk('pikachu', true), u = L(S);
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 1 || dy !== 0) S.F.terrain[(u.y + dy) * W + u.x + dx] = T_FLOOR;
	A(MM.actBlock(S, { t: 'step', d: 1 }) === null, 'water beside the way does not block a diagonal step (only walls make corners)');
}

// ================================================================ partners: following, swapping
{
	const S = run('gamma', ['pikachu', 'rattata', 'squirtle', 'charmander']);
	const far = [];
	let bad = '', steps = 0;
	const ok = walkTo(S, S.F.stairs[0], S.F.stairs[1], () => { steps++; bad = bad || sound(S); far.push(Math.max(...MM.partyOf(S).map((p) => cheb(p.x, p.y, L(S).x, L(S).y)))); });
	A(ok && steps > 5 && bad === '', `the leader walks to the stairs (${steps} steps) and nobody ever shares a tile or stands in a wall`, bad);
	A(Math.max(...far) <= 5 && far[far.length - 1] <= 4, 'the partners keep up: never more than a few tiles behind', [Math.max(...far), far[far.length - 1]]);
	// a swap
	const T = run('swap', ['pikachu', 'rattata']);
	const a = L(T), b = T.units[1], d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => a.x + DIR8[k][0] === b.x && a.y + DIR8[k][1] === b.y);
	const ax = a.x, ay = a.y, bx = b.x, by = b.y;
	const e = MM.act(T, { t: 'step', d });
	A(d != null && a.x === bx && a.y === by && b.x === ax && b.y === ay && e.filter((v) => v.t === 'step' && v.uid === 'p1').length === 1 && e.find((v) => v.uid === 'p1').swap === true && T.turns === 1, 'walking into a partner swaps places, and that is the partner\'s move for the tick', e);
	// a partner that cannot cross waits
	const Wt = run('moat', ['squirtle', 'pikachu'], { ...dungeon(), floors: [{ props: PROPS, water: true, vis: 0 }] });
	const s = L(Wt), p = Wt.units[1];
	for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) Wt.F.terrain[y * W + x] = x === s.x + 1 ? 3 : T_FLOOR;   // (a field with a river down it)
	p.x = s.x - 1; p.y = s.y;
	for (let n = 0; n < 4; n++) MM.act(Wt, { t: 'step', d: 2 });
	A(s.x > p.x + 3 && p.x <= s.x - 4 && sound(Wt) === '' && (Wt.F.terrain[p.y * W + p.x] & 3) === T_FLOOR, 'a partner that cannot cross the water stays on its own bank', [s.x, p.x]);
}

// ================================================================ speed
{
	const count = (stage, pstage, turns = 6) => {
		const S = run('speed', ['pikachu', 'rattata']);
		for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) S.F.terrain[y * W + x] = T_FLOOR;
		const a = L(S), b = S.units[1];
		a.x = 30; a.y = 15; b.x = 10; b.y = 15; a.stage = stage; b.stage = pstage; S.tick = 0;
		MM.act(S, { t: 'face', d: 0 });
		let n = 0;
		// (line the run up on the leader's first tick, then count the partner's steps over 6 leader turns)
		while (!MM.actsOn(a.stage, S.tick)) S.tick++;
		for (let k = 0; k < turns; k++) n += MM.act(S, { t: 'pass' }).filter((v) => v.t === 'step' && v.uid === 'p1').length;
		return n;
	};
	A(count(1, 1) === 6, 'at the same speed a partner takes one step for each of the leader\'s turns', count(1, 1));
	A(count(1, 2) === 12 && count(1, 0) === 3, 'a doubled partner takes two; a slowed one takes one every other turn', [count(1, 2), count(1, 0)]);
	A(count(2, 1) === 3 && count(4, 1, 8) === 2 && count(0, 1, 3) === 6, 'a doubled leader gets two turns to a partner\'s one, a leader at four times speed four; a slowed leader one to the partner\'s two', [count(2, 1), count(4, 1, 8), count(0, 1, 3)]);
}

// ================================================================ the stairs, floor by floor
{
	const S = run('delta', ['pikachu', 'rattata']);
	A(MM.act(S, { t: 'stairs' })[0].t === 'no' || (L(S).x === S.F.stairs[0] && L(S).y === S.F.stairs[1]), 'the stairs are only taken standing on them');
	const floors = [S.F.terrain.join()];
	let ok = true;
	for (let n = 1; n <= 3 && ok; n++) {
		ok = walkTo(S, S.F.stairs[0], S.F.stairs[1]) && sound(S) === '';
		const e = MM.act(S, { t: 'stairs' });
		if (n < 3) { ok = ok && S.floorNo === n + 1 && e.some((v) => v.t === 'floor' && v.n === n + 1) && sound(S) === '' && S.seen.some((v) => v) && S.tick === 3; floors.push(S.F.terrain.join()); }
		else ok = ok && S.over && S.over.won === true && e.some((v) => v.t === 'over' && v.won);
	}
	A(ok && new Set(floors).size === 3, 'down the stairs floor by floor, each a new floor with the party set down on it; the last stairs clear the dungeon');
	A(MM.act(S, { t: 'pass' })[0].why === 'the run is over', 'nothing happens after the run is over');
}

// ================================================================ exact: replays, resume, what a spectator gets
{
	const script = (S, n, seed) => {
		const r = makeRng(seed), acts = [];
		for (let k = 0; k < n && !S.over; k++) {
			const u = L(S);
			let a;
			if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) a = { t: 'stairs' };
			else if (r() < 0.8) { const d = toward(S, S.F.stairs[0], S.F.stairs[1]); a = d >= 0 ? { t: 'step', d } : { t: 'pass' }; }
			else a = [{ t: 'pass' }, { t: 'face', d: Math.floor(r() * 8) }, { t: 'step', d: Math.floor(r() * 8) }][Math.floor(r() * 3)];
			acts.push(a);
			MM.act(S, a);
		}
		return acts;
	};
	const d5 = dungeon(5, { roomFlags: 5, secondaryStructuresBudget: 2, standaloneLakeDensity: 1 });
	const party = ['pikachu', 'squirtle', 'pidgey', 'charmander'];
	const A1 = run('exact', party, d5);
	const acts = script(A1, 600, 'walk');
	const B1 = run('exact', party, d5);
	let snap = null, bad = '';
	acts.forEach((a, i) => { if (i === 250) snap = MM.toSnapshot(B1); MM.act(B1, a); bad = bad || sound(B1); });
	A(acts.length > 100 && MM.hashOf(A1) === MM.hashOf(B1) && bad === '' && A1.floorNo >= 2, `the same seed and ${acts.length} actions give the same run (floor ${A1.floorNo}), sound at every step`, bad);
	const C1 = MM.fromSnapshot(JSON.parse(JSON.stringify(snap)));
	acts.slice(250).forEach((a) => MM.act(C1, a));
	A(MM.hashOf(C1) === MM.hashOf(A1), 'a snapshot taken mid-run, through JSON, continues to the same end');
	A(MM.hashOf(run('exact2', party, d5)) !== MM.hashOf(run('exact', party, d5)), 'another seed is another dungeon');
	const v = MM.view(B1), txt = JSON.stringify(v);
	const unseen = v.tiles.filter((t) => t === -1).length;
	A(unseen > 200 && v.tiles.length === W * H && !('seed' in v) && !('rng' in v) && !txt.includes('"pre"') && v.units.length === MM.partyOf(B1).length && v.floor === B1.floorNo, 'a spectator\'s view: only the explored ground, no seed, the party', unseen);
	const fresh = MM.view(run('fog', ['pikachu']));
	const S2 = run('fog', ['pikachu']);
	A((fresh.stairs === null) === !S2.seen[S2.F.stairs[1] * W + S2.F.stairs[0]] && fresh.tiles.filter((t) => t >= 0).length < 400, 'the stairs show only once seen; a new floor is mostly dark', fresh.tiles.filter((t) => t >= 0).length);
	const before = S2.seen.filter(Boolean).length;
	walkTo(S2, S2.F.stairs[0], S2.F.stairs[1]);
	A(S2.seen.filter(Boolean).length > before && MM.view(S2).stairs !== null, 'walking uncovers the map, and what was seen stays seen');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
