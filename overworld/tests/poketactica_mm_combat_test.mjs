// poketactica_mm_combat_test.mjs — MYSTERY MAZE, fighting (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 4): a hit in the
// maze is the battle engine's hit on the maze's geometry (mm/combat.js); the plain Attack; wild Pokémon from the floor's
// marks and what they do (mm/ai.js: attack what is in reach, else move); partners' tactics; healing as you go, SP from
// walking, burns; and the owner's rule: a fainted figurine is GONE, the next partner leads, nobody left loses the run.
// Still exact: the same seed and actions give the same run. Pure: node only.
//   node overworld/tests/poketactica_mm_combat_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, S_ENEMY, NO_ROOM } from '../../poketactica/js/mm/gen.js';
import { DIR8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { ATTACK, ATTACK_ID, moveFor, aimsOf } from '../../poketactica/js/mm/combat.js';
import { foesInSight, aimsAtFoes } from '../../poketactica/js/mm/ai.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 20, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-mm' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 6, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 3, trapDensity: 3, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const WILD = [{ species: 'rattata', level: 8, w: 3 }, { species: 'pidgey', level: 8, w: 1 }];
const dungeon = (floors = 2, wild = WILD) => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: floors }, () => ({ props: PROPS, water: false, vis: 0, wild })) });
const L = (S) => MM.leaderOf(S);
/**
 * An open field with nothing wild on it: the leader at (20, 15) facing east, partners in a column to its west. Wild
 * Pokémon are added by hand.
 */
function arena(party, seed = 'arena') {
	const S = MM.newRun(seed, { dungeon: dungeon(2, []), party }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [50, 28];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const wild = (S, sp, lv, x, y, more = {}) => Object.assign(MM.addWild(S, sp, lv, x, y, data), more);
const of = (e, t) => e.filter((v) => v.t === t);

// ================================================================ the plain Attack, a move
{
	A(ATTACK.type === '???' && ATTACK.spCost === 0 && moveFor({ fig: fig('pikachu') }, ATTACK_ID, data) === ATTACK, 'the plain Attack: no type, no cost');
	const S = arena([fig('pikachu', 30, ['thundershock', 'tackle'])]);
	const u = L(S), foe = wild(S, 'gastly', 10, 21, 15, { tactic: null });
	foe.nap = true;   // (it only stands there)
	const pp = { ...u.pp }, sp = u.sp;
	let hits = 0, turns = S.turns;
	for (let n = 0; n < 6 && foe.hp > 0; n++) hits += of(MM.act(S, { t: 'attack' }, data), 'hit').filter((h) => h.uid === 'p0' && h.target === foe.uid && h.dmg > 0 && h.eff === 1).length;
	A(hits >= 1 && JSON.stringify(u.pp) === JSON.stringify(pp) && u.sp === sp && S.turns > turns, 'the Attack hits the tile in front, even a Ghost, neutrally; it costs no PP and no SP, and takes a turn', hits);
	A(foe.nap === false || foe.hp <= 0, 'a hit wakes a sleeping wild Pokémon');
	MM.act(S, { t: 'face', d: 6 }, data);
	const air = MM.act(S, { t: 'attack' }, data);
	A(of(air, 'use').length === 1 && of(air, 'miss').length === 1 && of(air, 'hit').length === 0, 'swinging at nothing is still a turn');
	// a move
	const T = arena([fig('pikachu', 30, ['thundershock', 'tackle'])]);
	const p = L(T), f2 = wild(T, 'squirtle', 12, 23, 15);
	f2.nap = true;
	const m = moveFor(p, 'thundershock', data), hp0 = f2.hp, pp0 = p.pp.thundershock, sp0 = p.sp;
	A(MM.actBlock(T, { t: 'move', id: 'thundershock', x: 23, y: 15 }, data) === null && MM.actBlock(T, { t: 'move', id: 'thundershock', x: 40, y: 15 }, data) === 'out of reach' && MM.actBlock(T, { t: 'move', id: 'surf', x: 23, y: 15 }, data) === 'not equipped', 'a move is aimed at a tile in its reach; out of reach or not equipped is refused');
	const before = MM.hashOf(T);
	A(MM.act(T, { t: 'move', id: 'thundershock', x: 40, y: 15 }, data)[0].t === 'no' && MM.hashOf(T) === before, 'a refused move costs nothing and no time');
	let landed = [];
	for (let n = 0; n < 4 && !landed.length; n++) landed = of(MM.act(T, { t: 'move', id: 'thundershock', x: 23, y: 15 }, data), 'hit');
	A(landed.length === 1 && landed[0].target === f2.uid && landed[0].eff === 2 && (f2.hp < hp0 || !MM.unit(T, f2.uid)) && p.pp.thundershock < pp0 && p.sp < sp0 + 1 && m.spCost > 0, 'a move is the battle\'s: Thunder Shock is super effective on a Water type, and costs PP and SP', landed[0]);
	p.pp.thundershock = 0;
	A(MM.actBlock(T, { t: 'move', id: 'thundershock', x: 23, y: 15 }, data) === 'no PP left', 'no PP, no move');
	p.pp.thundershock = 5; p.sp = 0;
	A(MM.actBlock(T, { t: 'move', id: 'thundershock', x: 23, y: 15 }, data) === 'not enough SP', 'no SP, no move (but the Attack is always there)');
	// a corner
	const C = arena([fig('pikachu', 30, ['tackle'])]);
	const c = L(C), f3 = wild(C, 'rattata', 5, 21, 14);
	f3.nap = true;
	C.F.terrain[15 * W + 21] = 0; C.B.map.height[15 * W + 21] = null;
	MM.act(C, { t: 'face', d: 1 }, data);
	const e = MM.act(C, { t: 'attack' }, data);
	A(of(e, 'hit').length === 0 && of(e, 'miss').length === 1 && f3.hp === f3.maxHP && c.dir === 1, 'no strike diagonally round a wall\'s corner');
}

// ================================================================ wild Pokémon: where they come from
{
	const S = MM.newRun('wild', { dungeon: dungeon(), party: [fig('pikachu', 30)] }, data);
	const marks = S.F.spawn.filter((s) => s & S_ENEMY).length, w = MM.wildOf(S);
	A(marks >= 3 && w.length === marks && w.every((u) => (S.F.spawn[u.y * W + u.x] & S_ENEMY) && ['rattata', 'pidgey'].includes(u.species) && u.level === 8 && u.uid[0] === 'w'), `a wild Pokémon on each of the floor's ${marks} marks, from the floor's list`);
	let naps = 0, n = 0, rats = 0;
	for (let k = 0; k < 40; k++) for (const u of MM.wildOf(MM.newRun('nap' + k, { dungeon: dungeon(), party: [fig('pikachu', 30)] }, data))) { n++; if (u.nap) naps++; if (u.species === 'rattata') rats++; }
	A(n > 100 && naps / n > 0.03 && naps / n < 0.15 && rats / n > 0.6 && rats / n < 0.9, 'about 8 in 100 start asleep; the list\'s weights are kept (3 to 1)', [n, naps, rats]);
	A(MM.wildOf(MM.newRun('none', { dungeon: dungeon(2, []), party: [fig('pikachu', 30)] }, data)).length === 0, 'a floor with no list has no wild Pokémon');
	// another walks in every 36 turns
	const R = arena([fig('pikachu', 30)]);
	R.dungeon.floors[0].wild = WILD;
	let spawns = [];
	for (let k = 0; k < 80; k++) spawns.push(...of(MM.act(R, { t: 'pass' }, data), 'spawn').map((v) => [R.turns, v]));
	A(spawns.length === 2 && spawns[0][0] >= 34 && spawns[0][0] <= 37 && spawns[1][0] - spawns[0][0] === 36 && Math.max(Math.abs(spawns[0][1].x - 20), Math.abs(spawns[0][1].y - 15)) >= 6, 'a new one walks in every 36 turns, at least 6 tiles away', spawns.map((v) => v[0]));
	const full = arena([fig('pikachu', 30)]);
	full.dungeon.floors[0].wild = WILD;
	for (let k = 0; k < 10; k++) wild(full, 'rattata', 2, 40 + k, 4, { nap: true });
	let more = 0;
	for (let k = 0; k < 40; k++) more += of(MM.act(full, { t: 'pass' }, data), 'spawn').length;
	A(more === 0, 'never more than 10 on a floor');
}

// ================================================================ what they do
{
	// asleep until you come close
	const S = arena([fig('pikachu', 30)]);
	const z = wild(S, 'rattata', 8, 26, 15, { nap: true });
	for (let k = 0; k < 3; k++) MM.act(S, { t: 'pass' }, data);
	const still = z.x === 26 && z.nap;
	for (let k = 0; k < 5; k++) MM.act(S, { t: 'step', d: 2 }, data);
	const woke = !z.nap;
	A(still && woke && cheb(z.x, z.y, L(S).x, L(S).y) <= 1, 'a sleeping wild Pokémon stays put until someone is next to it');
	// it comes for you and attacks
	const T = arena([fig('pikachu', 30)]);
	const r = wild(T, 'rattata', 8, 30, 12);
	const d0 = cheb(r.x, r.y, 20, 15);
	let hit = 0, steps = 0;
	for (let k = 0; k < 30; k++) { const e = MM.act(T, { t: 'pass' }, data); steps += of(e, 'step').filter((v) => v.uid === r.uid).length; hit += of(e, 'hit').filter((v) => v.uid === r.uid && v.target === 'p0').length + of(e, 'miss').filter((v) => v.uid === r.uid).length; }
	A(d0 === 10 && steps >= 9 && steps <= 12 && hit >= 10 && cheb(r.x, r.y, 20, 15) === 1 && L(T).hp < L(T).maxHP, 'a wild Pokémon that sees you walks straight up and attacks every turn', [steps, hit]);
	A(foesInSight(T, r).length === 1 && aimsAtFoes(T, r, ATTACK).length === 1, 'it sees its foe and has it in reach');
	// one that cannot see you patrols
	const P = MM.newRun('patrol', { dungeon: dungeon(), party: [fig('pikachu', 30)] }, data);
	const roam = MM.wildOf(P).filter((u) => !u.nap && P.F.room[u.y * W + u.x] !== P.F.room[L(P).y * W + L(P).x]);
	const from = roam.map((u) => [u.uid, P.F.room[u.y * W + u.x]]);
	for (let k = 0; k < 60 && !P.over; k++) MM.act(P, { t: 'pass' }, data);
	const moved = from.filter(([uid, room]) => { const u = MM.unit(P, uid); return u && P.F.room[u.y * W + u.x] !== room; }).length;
	A(roam.length >= 2 && moved >= 1, 'wild Pokémon that see no one leave their rooms and roam', [roam.length, moved]);
	// the moves it knows
	const M = arena([fig('pikachu', 40)]);
	const sq = wild(M, 'squirtle', 20, 23, 15);
	sq.fig = equip({ ...sq.fig, pool: [...sq.fig.pool, { id: 'watergun', lv: 1, xp: 0 }] }, ['watergun']); sq.pp = { watergun: 25 };
	let used = 0, plain = 0;
	for (let k = 0; k < 40; k++) { const e = MM.act(M, { t: 'pass' }, data); used += of(e, 'use').filter((v) => v.uid === sq.uid && v.move === 'watergun').length; plain += of(e, 'use').filter((v) => v.uid === sq.uid && v.move === ATTACK_ID).length; M.units[0].hp = M.units[0].maxHP; }
	A(used >= 2 && plain >= 5 && sq.pp.watergun === 25 - used, 'it uses its moves (paying their PP) and the plain Attack, by the original\'s weights', [used, plain]);
}

// ================================================================ your party
{
	// healing as you go, SP from walking
	const S = arena([fig('pikachu', 30, ['thundershock']), fig('rattata', 30)]);
	const a = L(S), b = S.units[1], w = wild(S, 'rattata', 5, 40, 4, { nap: true });
	a.hp = 1; b.hp = 1; w.hp = 1; a.sp = 0;
	for (let k = 0; k < 20; k++) MM.act(S, { t: 'pass' }, data);
	const per = a.maxHP / 200;
	A(Math.abs(a.hp - 1 - 20 * per) <= 1 && b.hp > 1 && w.hp === 1 && a.sp === 0, 'your party heals as it goes (a full heal in 200 turns); wild Pokémon do not; standing still gives no SP', [a.hp, a.maxHP, b.hp]);
	for (let k = 0; k < 5; k++) MM.act(S, { t: 'step', d: 4 }, data);
	A(a.sp === 5 * Math.ceil(a.maxSP * 0.02), 'walking gives SP back: 2% of the most a tile', [a.sp, a.maxSP]);
	// a burn bites every 20 turns; sleep costs turns
	const B = arena([fig('pikachu', 30)]);
	const u = L(B);
	u.status = 'brn';
	let bites = [];
	for (let k = 0; k < 45; k++) bites.push(...of(MM.act(B, { t: 'pass' }, data), 'hurt').map(() => B.turns));
	A(bites.join() === '20,40' && u.hp < u.maxHP, 'a burn bites every 20 turns', bites);
	u.status = 'slp'; u.sleepTurns = 3;
	const t0 = B.tick;
	const e = MM.act(B, { t: 'pass' }, data);
	A(of(e, 'asleep').length === 2 && of(e, 'woke').length === 1 && u.status === null && B.tick !== t0, 'an asleep leader loses its turns without being asked, then wakes', e.map((v) => v.t));
	// tactics
	const T = arena([fig('pikachu', 30), fig('rattata', 30), fig('squirtle', 30), fig('charmander', 30)]);
	A(MM.act(T, { t: 'tactic', uid: 'p1', tactic: 'wait' }, data)[0].t === 'tactic' && T.turns === 0 && MM.actBlock(T, { t: 'tactic', uid: 'p0', tactic: 'wait' }, data) !== null && MM.actBlock(T, { t: 'tactic', uid: 'p1', tactic: 'dance' }, data) !== null, 'a partner\'s tactic is set for free; not the leader\'s, not a made-up one');
	MM.act(T, { t: 'tactic', uid: 'p2', tactic: 'hunt' }, data);
	MM.act(T, { t: 'tactic', uid: 'p3', tactic: 'away' }, data);
	const foe = wild(T, 'caterpie', 3, 12, 15, { nap: false });
	foe.tactic = null; foe.stage = 0;
	const [p1, p2, p3] = [T.units[1], T.units[2], T.units[3]], at = [p1, p2, p3].map((v) => [v.x, v.y]);
	const dist = (v) => cheb(v.x, v.y, foe.x, foe.y), d2 = dist(p2), d3 = dist(p3);
	for (let k = 0; k < 3; k++) MM.act(T, { t: 'step', d: 2 }, data);
	A(p1.x === at[0][0] && p1.y === at[0][1], 'wait: it stands where it is');
	A(dist(p2) < d2, 'hunt: it goes for the foe it sees', [d2, dist(p2)]);
	A(dist(p3) > d3, 'away: it keeps clear of it', [d3, dist(p3)]);
	// a following partner fights what reaches it
	const F2 = arena([fig('pikachu', 30), fig('rattata', 30)]);
	const prey = wild(F2, 'caterpie', 2, 18, 15, { nap: true });
	let blows = 0;
	for (let k = 0; k < 12 && MM.unit(F2, prey.uid); k++) blows += of(MM.act(F2, { t: 'pass' }, data), 'use').filter((v) => v.uid === 'p1').length;
	A(blows >= 1 && !MM.unit(F2, prey.uid) && F2.B.exp.p1 > 0, 'a partner attacks a foe beside it, and a knocked-out wild Pokémon is gone from the floor (EXP noted)', [blows, F2.B.exp]);
}

// ================================================================ one attack a turn, however fast
{
	const S = arena([fig('pikachu', 30)]);
	const u = L(S);
	u.stage = 2;
	while (!MM.actsOn(2, S.tick)) S.tick++;
	const t0 = S.tick;
	let ticks = 0, last = t0;
	for (let k = 0; k < 6; k++) { MM.act(S, { t: 'attack' }, data); ticks += (S.tick - last + 24) % 24; last = S.tick; }
	const T = arena([fig('pikachu', 30)]);
	L(T).stage = 2;
	let walk = 0; last = T.tick;
	for (let k = 0; k < 6; k++) { MM.act(T, { t: 'step', d: 4 }, data); walk += (T.tick - last + 24) % 24; last = T.tick; }
	A(walk === 12 && ticks >= 20 && ticks <= 24, 'at double speed you get two steps a turn but still one attack', [walk, ticks]);
}

// ================================================================ a fainted figurine is gone
{
	const S = arena([fig('pikachu', 30), fig('rattata', 30), fig('squirtle', 30)]);
	const foe = wild(S, 'machop', 60, 18, 14);
	const victim = S.units[2];
	victim.hp = 1;
	let ev = [];
	for (let k = 0; k < 20 && MM.unit(S, 'p2'); k++) ev.push(...MM.act(S, { t: 'pass' }, data));
	A(!MM.unit(S, 'p2') && of(ev, 'lost').some((v) => v.uid === 'p2') && S.fallen.length >= 1 && S.fallen.some((f) => f.uid === 'p2' && f.species === 'squirtle' && f.id === victim.fig.id && f.floor === 1) && !S.over, 'a partner that faints leaves the run at once and is listed among the fallen, with its figurine\'s id', S.fallen);
	A(!MM.view(S).units.some((v) => v.uid === 'p2') && MM.view(S).fallen === S.fallen.length, 'it is off the board for a spectator too');
	// the leader falls: the next partner leads
	const T = arena([fig('pikachu', 30), fig('rattata', 30)]);
	const big = wild(T, 'machop', 60, 21, 15);
	L(T).hp = 1; T.units[1].hp = T.units[1].maxHP;
	ev = [];
	for (let k = 0; k < 20 && MM.unit(T, 'p0'); k++) ev.push(...MM.act(T, { t: 'pass' }, data));
	A(!MM.unit(T, 'p0') && T.leader === 'p1' && of(ev, 'leader').some((v) => v.uid === 'p1') && !T.over && MM.actBlock(T, { t: 'pass' }, data) === null && MM.actsOn(L(T).stage, T.tick), 'when the leader faints the next partner leads, and the run goes on', [T.leader, T.over]);
	// nobody left
	T.units.find((u) => u.uid === 'p1').hp = 1;
	ev = [];
	for (let k = 0; k < 30 && !T.over; k++) ev.push(...MM.act(T, { t: 'pass' }, data));
	A(T.over && T.over.won === false && of(ev, 'over').length === 1 && T.fallen.length === 2 && MM.act(T, { t: 'pass' }, data)[0].t === 'no' && big.hp > 0, 'with nobody left the run is lost', T.over);
}

// ================================================================ exact
{
	const play = (seed, n) => {
		const S = MM.newRun(seed, { dungeon: dungeon(4), party: [fig('pikachu', 25, ['thundershock', 'quickattack']), fig('squirtle', 25, ['watergun']), fig('pidgey', 25, ['gust'])] }, data);
		const r = makeRng('script'), acts = [];
		for (let k = 0; k < n && !S.over; k++) {
			const u = L(S);
			let a = null;
			const near = aimsAtFoes(S, u, ATTACK);
			if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) a = { t: 'stairs' };
			else if (near.length && r() < 0.8) {
				const m = moveFor(u, 'thundershock', data), aims = u.pp.thundershock > 0 && u.sp >= m.spCost ? aimsAtFoes(S, u, m) : [];
				if (aims.length && r() < 0.5) a = { t: 'move', id: 'thundershock', x: aims[0][0], y: aims[0][1] };
				else { const d = DIR8.findIndex(([dx, dy]) => u.x + dx === near[0][0] && u.y + dy === near[0][1]); if (u.dir !== d) { MM.act(S, { t: 'face', d }, data); acts.push({ t: 'face', d }); } a = { t: 'attack' }; }
			} else {
				const dist = MM.walkMap(S.F, u, S.F.stairs[0], S.F.stairs[1]), here = dist[u.y * W + u.x];
				const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k2) => MM.canWalk(S.F, u, k2) && dist[(u.y + DIR8[k2][1]) * W + u.x + DIR8[k2][0]] === here - 1 && MM.actBlock(S, { t: 'step', d: k2 }, data) === null);
				a = d != null ? { t: 'step', d } : { t: 'pass' };
			}
			acts.push(a);
			MM.act(S, a, data);
		}
		return { S, acts };
	};
	const one = play('exact', 500), two = play('exact', 500);
	A(one.acts.length > 100 && MM.hashOf(one.S) === MM.hashOf(two.S) && JSON.stringify(one.acts) === JSON.stringify(two.acts), `a run with fighting replays the same (${one.acts.length} actions, floor ${one.S.floorNo}, ${one.S.fallen.length} fallen${one.S.over ? ', over' : ''})`);
	const fresh = MM.newRun('exact', { dungeon: dungeon(4), party: [fig('pikachu', 25, ['thundershock', 'quickattack']), fig('squirtle', 25, ['watergun']), fig('pidgey', 25, ['gust'])] }, data);
	let mid = null;
	const half = one.acts.length >> 1;
	one.acts.forEach((a, i) => { if (i === half) mid = MM.toSnapshot(fresh); MM.act(fresh, a, data); });
	const again = MM.fromSnapshot(JSON.parse(JSON.stringify(mid)), data);
	one.acts.slice(half).forEach((a) => MM.act(again, a, data));
	A(again.B.units === again.units && again.B.map.w === W, 'a restored run fights on its own board again (its units and floor re-linked)');
	A(MM.hashOf(fresh) === MM.hashOf(one.S) && MM.hashOf(again) === MM.hashOf(one.S), 'the recorded actions re-run to the same end, and so does a snapshot taken mid-fight, through JSON');
	const fights = one.acts.filter((a) => a.t === 'attack' || a.t === 'move').length;
	A(fights >= 5, 'that run had real fighting in it', fights);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
