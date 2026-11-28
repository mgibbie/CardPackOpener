// poketactica_mm_lift_test.mjs — MYSTERY MAZE, LIFT AND THROW; WILD POKEMON THAT PICK ITEMS UP (Plans/
// POKETACTICA_MODES_PLAN.md item M6, carried; rules 28). "Planned from the start."
//   a wild Pokémon takes the item it walks onto, and drops it when it is knocked out (or when it joins)
//   a leader that can lift throws whoever stands in front of it: over water and others, never through a wall
// Pure: node only.   node overworld/tests/poketactica_mm_lift_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, T_WALL } from '../../poketactica/js/mm/gen.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-l' + lv, shinyRate: 0 });
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 5, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 6, trapDensity: 10, numExtraHallways: 3, buriedItemDensity: 2, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const TEST = { id: 'test', name: 'Test Cave', party: 4, reward: { first: 100, again: 40 }, floors: Array.from({ length: 2 }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) };
/** An open field with nothing on it: the leader at (20, 15) facing east. -> the run */
function field(seed, { leader = 'machamp', lv = 60, rev, party = [] } = {}) {
	const S = MM.newRun(seed, { dungeon: TEST, party: [fig(leader, lv), ...party.map((sp) => fig(sp, 20))], ...(rev ? { rev } : {}) }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	S.units = S.units.filter((u) => u.side === 'p'); S.B.units = S.units; S.items = []; S.traps = [];
	const u = MM.leaderOf(S); u.x = 20; u.y = 15; MM.act(S, { t: 'face', d: 2 }, data);
	S.units.filter((p) => p !== u).forEach((p, i) => { p.x = 10; p.y = 10 + i; });
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	S.F.stairs = [50, 28];
	return S;
}
const wall = (S, x, y) => { S.F.terrain[y * W + x] = T_WALL; };
const evs = (list, t) => list.filter((e) => e.t === t);

// ---------- who can lift
{
	const S = field('who'), L = MM.leaderOf(S);
	A(MM.MM_RULES_REV >= 28 && MM.LIFT_REV === 28 && L.lift && L.throw >= 2, `rules 28: a Machamp can lift, and throws ${L.throw} tiles`);
	const R = field('who2', { leader: 'rattata', lv: 30 });
	A(!MM.leaderOf(R).lift && MM.tossOf(R) === 'your leader cannot lift' && MM.actBlock(R, { t: 'toss' }, data) === 'your leader cannot lift', 'a Rattata cannot: the order is refused, and says why');
	A(MM.tossOf(S) === 'nobody stands in front of you' && MM.actBlock(S, { t: 'toss' }, data) === 'nobody stands in front of you', 'nobody in front: nothing to throw');
	A(MM.tossOf(field('old', { rev: 27 })) === 'not in this run', 'a run recorded under rules 27 has no throwing');
}
// ---------- throwing a foe
{
	const S = field('foe'), L = MM.leaderOf(S), v = MM.addWild(S, 'rattata', 50, 21, 15, data);
	v.nap = true; const hp = v.hp, t0 = S.turns, far = L.throw;
	const t = MM.tossOf(S);
	A(typeof t === 'object' && t.v === v && t.x === 21 + far && t.y === 15, `the one in front would land ${far} tiles further on`, [t.x, t.y]);
	const e = MM.act(S, { t: 'toss' }, data);
	// (where it LANDED is the throw's own event: it is awake now, and walks in its own turn after)
	const land = evs(e, 'toss')[0];
	A(land && land.target === v.uid && land.x === 21 + far && land.y === 15 && S.turns === t0 + 1, 'thrown: it lands there, and the throw took the turn', [land, S.turns]);
	A(v.hp === hp - Math.max(1, Math.floor(v.maxHP / MM.TOSS_HURT)) && !v.nap && evs(e, 'hurt').some((x) => x.uid === v.uid && x.why === 'toss'), `the fall hurts a foe an eighth of its HP (${hp} to ${v.hp}), and wakes it`);
	// a weak one does not survive the fall
	const K = field('ko'), w = MM.addWild(K, 'rattata', 2, 21, 15, data); w.hp = 1;
	MM.act(K, { t: 'toss' }, data);
	A(!K.units.includes(w) && K.units.every((u) => u.side === 'p'), 'a foe at 1 HP is knocked out by the fall');
}
// ---------- over water and others, never through a wall
{
	const S = field('over'), L = MM.leaderOf(S), v = MM.addWild(S, 'rattata', 50, 21, 15, data), far = L.throw;
	const blocker = MM.addWild(S, 'pidgey', 50, 21 + far, 15, data);
	A(MM.tossOf(S).x === 21 + far - 1, 'another Pokémon on the landing tile: it lands one short', MM.tossOf(S).x);
	for (let k = 1; k < far; k++) MM.addWild(S, 'pidgey', 50, 21 + k, 15, data);
	A(MM.tossOf(S) === 'there is no room to throw it' && MM.actBlock(S, { t: 'toss' }, data) === 'there is no room to throw it', 'every tile taken: there is no room, and nothing is thrown');
	void blocker; void v;
	const Wl = field('wall'), q = MM.addWild(Wl, 'rattata', 50, 21, 15, data);
	wall(Wl, 23, 15);
	A(MM.tossOf(Wl).x === 22, 'a wall two tiles on: it lands before the wall, not past it', MM.tossOf(Wl).x);
	wall(Wl, 22, 15);
	A(MM.tossOf(Wl) === 'there is no room to throw it', 'a wall right behind it: no room');
	void q;
	// over a gap it could not walk across
	const G = field('gap'), g = MM.addWild(G, 'rattata', 50, 21, 15, data), gfar = MM.leaderOf(G).throw;
	for (let k = 1; k < gfar; k++) G.F.terrain[15 * W + 21 + k] = 2;   // (liquid: T_IMPASSABLE is not a wall)
	const tg = MM.tossOf(G);
	A(typeof tg === 'object' && tg.x === 21 + gfar && !MM.canEnter(G.F, g, 22, 15), 'over water it could not walk through, onto the ground beyond', tg && [tg.x, tg.y]);
}
// ---------- throwing a partner; who is too heavy
{
	const S = field('ally', { party: ['pikachu'] }), L = MM.leaderOf(S), p = S.units.find((u) => u !== L);
	p.x = 21; p.y = 15; const hp = p.hp;
	const e = MM.act(S, { t: 'toss' }, data);
	A(evs(e, 'toss').length === 1 && evs(e, 'toss')[0].target === p.uid && evs(e, 'toss')[0].x === 21 + L.throw && p.hp === hp && !evs(e, 'hurt').some((x) => x.uid === p.uid), 'a partner is thrown as far, and is not hurt');
	const B = field('boss'), b = MM.addWild(B, 'rattata', 50, 21, 15, data); b.boss = true;
	A(MM.tossOf(B) === 'it is too heavy to throw', 'a boss is too heavy');
	b.boss = false; b.stone = true;
	A(MM.tossOf(B) === 'it is too heavy to throw', 'so is one turned to stone');
	b.stone = false; b.keeper = true;
	A(MM.tossOf(B) === 'it is too heavy to throw', 'and the shopkeeper');
}
// ---------- wild Pokémon pick items up
{
	const S = field('pick'), v = MM.addWild(S, 'rattata', 5, 30, 15, data);
	S.items.push({ x: 31, y: 15, id: 'apple' }, { x: 32, y: 15, id: 'oran' });
	MM.stepTo(S, v, 31, 15, 2);
	A(v.carry && v.carry.id === 'apple' && !S.items.some((o) => o.id === 'apple') && S.ev.some((e) => e.t === 'wildpick' && e.uid === v.uid && e.id === 'apple'), 'a wild Pokémon that walks onto an item takes it');
	A(MM.view(S).units.find((u) => u.uid === v.uid) === undefined || MM.view(S).units.find((u) => u.uid === v.uid).carry === 'apple', 'the page is told what it carries (when it is in sight)');
	MM.stepTo(S, v, 32, 15, 2);
	A(v.carry.id === 'apple' && S.items.some((o) => o.id === 'oran' && o.x === 32), 'one at a time: it walks over the next and leaves it');
	const h0 = MM.hashOf(S); const c = v.carry; delete v.carry;
	A(MM.hashOf(S) !== h0, 'what it carries is part of the run (two devices agree on it)'); v.carry = c;
	// knocked out: it drops it where it stood (the tile has an item: the nearest free one)
	MM.hurt(S, v, 9999, 'test');
	const dropped = S.items.find((o) => o.id === 'apple');
	A(!S.units.includes(v) && dropped && Math.max(Math.abs(dropped.x - 32), Math.abs(dropped.y - 15)) === 1 && S.ev.some((e) => e.t === 'dropped' && e.id === 'apple'), 'knocked out, it drops it: beside its tile, which already held one', dropped);
	// what it never takes
	const N = field('never'), n = MM.addWild(N, 'rattata', 5, 30, 15, data);
	N.items.push({ x: 31, y: 15, id: 'stars', n: 20 }, { x: 32, y: 15, id: 'apple', shop: true, price: 30 }, { x: 33, y: 15, id: 'apple', locked: true }, { x: 34, y: 15, id: 'vaultkey' });
	for (const x of [31, 32, 33, 34]) MM.stepTo(N, n, x, 15, 2);
	A(!n.carry && N.items.length === 4, 'never stars, a shop\'s goods, a locked room\'s, or a key');
	const k = MM.addWild(N, 'kecleon', 30, 40, 15, data); k.keeper = true; N.items.push({ x: 41, y: 15, id: 'oran' }); MM.stepTo(N, k, 41, 15, 2);
	A(!k.carry, 'the shopkeeper takes nothing');
	// under rules 27: nothing is taken
	const O = field('old27', { rev: 27 }), o = MM.addWild(O, 'rattata', 5, 30, 15, data);
	O.items.push({ x: 31, y: 15, id: 'apple' }); MM.stepTo(O, o, 31, 15, 2);
	A(!o.carry && O.items.length === 1, 'a run recorded under rules 27: a wild Pokémon walks over an item as it always did');
	// the leader still picks things up as before
	const P = field('lead'); P.items.push({ x: 21, y: 15, id: 'apple' }); MM.act(P, { t: 'step', d: 2 }, data);
	A(P.bag.some((it) => it.id === 'apple') && !P.items.length, 'the leader picks up what it walks onto, as ever');
}
// ---------- a thrown foe takes what it lands on; the same orders are the same run
{
	const S = field('land'), L = MM.leaderOf(S), v = MM.addWild(S, 'rattata', 50, 21, 15, data);
	S.items.push({ x: 21 + L.throw, y: 15, id: 'oran' });
	MM.act(S, { t: 'toss' }, data);
	A(v.carry && v.carry.id === 'oran', 'a foe thrown onto an item takes it');
	const mk = () => { const T = field('same'); MM.addWild(T, 'rattata', 50, 21, 15, data); T.items.push({ x: 24, y: 15, id: 'apple' }); MM.act(T, { t: 'toss' }, data); MM.act(T, { t: 'pass' }, data); return MM.hashOf(T); };
	A(mk() === mk(), 'the same seed and the same throw are the same run');
}
// ---------- the page
{
	const md = fs.readFileSync(path.join(ROOT, 'poketactica/js/mmmode.js'), 'utf8');
	A(/t: 'toss'/.test(md) && /MM\.tossOf\(/.test(md), 'the Mystery Maze screen offers the throw, and says why when it cannot be made');
	A(/wildpick/.test(md) && /dropped/.test(md), 'and says when a wild Pokémon takes an item, and when one is dropped');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
