// poketactica_mm_gen_test.mjs — MYSTERY MAZE, the floor generator (owner, 2026-11-23: "study the decomp ... to match the
// level generation"; Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 1, Plans/PMD_FLOOR_GENERATION_SPEC.md). The port
// (poketactica/js/mm/gen.js, rng.js) is checked three ways:
//   1. THE ORIGINAL: fixtures/mm_gen_golden.json holds a hash of every tile of 360 floors made by the ORIGINAL C generator,
//      compiled and run natively (all 12 layouts, 30 seeds and settings each). The port must make the same floors, down to
//      the random state it ends on.
//   2. the random numbers against a second, BigInt implementation of the same generator;
//   3. what any floor must be: walled in, a start and stairs in rooms, every open tile reachable from the stairs, the same
//      floor from the same seed.
// Pure: node only.
//   node overworld/tests/poketactica_mm_gen_test.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { makeRng, makeFloorSeeds } from '../../poketactica/js/mm/rng.js';
import { generateFloor, floorText, LAYOUTS, MM_W as W, MM_H as H, T_FLOOR, T_LIQUID, T_WALL, T_CUT, T_IMPASSABLE, T_SHOP, T_MONSTER_HOUSE, T_STAIRS, S_SPECIAL, S_STAIRS, S_ITEM, S_TRAP, S_ENEMY, NO_ROOM } from '../../poketactica/js/mm/gen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };

/** The hash the golden file holds: every tile's terrain, spawn flags and room, the start, the stairs, the Monster House room, the final random state. */
export const floorHash = (f) => crypto.createHash('sha1').update(JSON.stringify([[...f.terrain], [...f.spawn], [...f.room], f.player, f.stairs, f.mh, f.rng >>> 0])).digest('hex').slice(0, 16);

// ================================================================ 1. the original's own floors
{
	const G = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/mm_gen_golden.json'), 'utf8'));
	A(G.cases.length === 360 && new Set(G.cases.map((c) => c.props.layout)).size === 12, 'the golden file: 360 floors from the original generator, all 12 layouts');
	const byLayout = {};
	const wrong = [];
	for (const c of G.cases) {
		const f = generateFloor(c.seed, c.props, { water: c.water });
		const ok = floorHash(f) === c.hash;
		const k = LAYOUTS[c.props.layout];
		byLayout[k] = byLayout[k] || [0, 0];
		byLayout[k][ok ? 0 : 1]++;
		if (!ok) wrong.push(c.id);
	}
	for (const [k, [good, bad]] of Object.entries(byLayout)) A(bad === 0, `${k}: ${good} of ${good + bad} floors are tile-for-tile the original's`, wrong.slice(0, 20));
	A(G.cases.some((c) => c.shop) && G.cases.some((c) => c.mh !== NO_ROOM) && G.cases.some((c) => c.liquid), 'the golden floors include shops, Monster Houses and liquid');
}

// ================================================================ 2. the random numbers
{
	const M = 0x5D588B65n, MASK = 0xFFFFFFFFn;
	let s = 0x1234567n | 1n;
	const rng = makeRng(0x1234567);
	let ok = true;
	for (let i = 0; i < 5000 && ok; i++) {
		const n = (i * 7) % 300;
		s = (s * M + 1n) & MASK;
		const want = Number((((s >> 16n) * BigInt(n)) >> 16n) & 0xFFFFn);
		if (rng.int(n) !== want || rng.state !== Number(s)) ok = false;
	}
	A(ok, 'int(n): the original\'s generator (x1566083941 + 1, the top 16 bits), 5,000 draws against a BigInt copy');
	const r = makeRng(99);
	const s0 = r.state; r.int(0); const s1 = r.state; r.int(1); const s2 = r.state;
	A(s0 !== s1 && s1 !== s2 && makeRng(98).state === 99, 'int(0) and int(1) still step the generator; a seed is made odd');
	const before = r.state;
	A(r.range(5, 5) === 5 && r.state === before, 'range(a, a) is a and draws nothing');
	let lo = 99, hi = -99, lo2 = 99, hi2 = -99;
	for (let i = 0; i < 2000; i++) { const v = r.range(3, 7); lo = Math.min(lo, v); hi = Math.max(hi, v); const u = r.range(7, 3); lo2 = Math.min(lo2, u); hi2 = Math.max(hi2, u); }
	A(lo === 3 && hi === 6 && lo2 === 3 && hi2 === 6, 'range(3, 7) is 3..6 (the top is not included), and so is range(7, 3)', [lo, hi, lo2, hi2]);
	const a = makeFloorSeeds(0xABCDEF), b = makeFloorSeeds(0xABCDEF);
	const sa = [a(), a(), a(), a()], sb = [b(), b(), b(), b()];
	A(sa.join() === sb.join() && new Set(sa).size === 4 && sa.every((v) => v % 2 === 1 && v < 2 ** 24), 'floor seeds: a chain from the dungeon\'s seed, a different odd 24-bit state per floor', sa);
}

// ================================================================ 3. what any floor must be
const base = { roomDensity: 6, floorConnectivity: 15, enemyDensity: 6, kecleonShopChance: 20, monsterHouseChance: 20, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 3, roomFlags: 5,
	itemDensity: 4, trapDensity: 6, numExtraHallways: 4, buriedItemDensity: 2, standaloneLakeDensity: 1, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
/** Every floor tile a walker can reach from the stairs: 8 directions, never cutting a corner past a wall or liquid. */
function reach(f) {
	const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (f.terrain[y * W + x] & 3) === T_FLOOR;
	const seen = new Uint8Array(W * H), q = [f.stairs];
	seen[f.stairs[1] * W + f.stairs[0]] = 1;
	while (q.length) {
		const [x, y] = q.pop();
		for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
			if (!dx && !dy) continue;
			const nx = x + dx, ny = y + dy;
			if (!open(nx, ny) || seen[ny * W + nx]) continue;
			if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
			seen[ny * W + nx] = 1; q.push([nx, ny]);
		}
	}
	return seen;
}
{
	const stats = { floors: 0, shops: 0, houses: 0, liquid: 0 };
	const bad = { border: [], spots: [], reach: [], flags: [], rooms: [], small: [] };
	for (let layout = 0; layout < 12; layout++) for (let k = 0; k < 40; k++) {
		const seed = (layout * 7919 + k * 104729 + 17) >>> 0, water = k % 2 === 0, tag = LAYOUTS[layout] + '#' + seed;
		const f = generateFloor(seed, { ...base, layout }, { water });
		stats.floors++;
		if (f.shop) stats.shops++;
		if (f.mh !== NO_ROOM) stats.houses++;
		const at = (x, y) => y * W + x;
		// walled in: the outer ring cannot be dug, and the ring inside it is wall too
		let ring = true;
		for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) if ((f.terrain[at(x, y)] & 3) === T_FLOOR) ring = false;
		for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!(f.terrain[at(x, y)] & T_IMPASSABLE) || (f.terrain[at(x, y)] & 3) !== T_WALL) ring = false;
		if (!ring) bad.border.push(tag);
		// the start and the stairs: on room floor
		const pi = at(...f.player), si = at(...f.stairs);
		const roomFloor = (i) => ((f.terrain[i] & 3) === T_FLOOR || (f.terrain[i] & 3) === 3) && f.room[i] !== NO_ROOM;
		if (!(f.player[0] > 0 && f.stairs[0] > 0 && roomFloor(pi) && roomFloor(si) && (f.spawn[si] & S_STAIRS) && (f.terrain[si] & T_STAIRS))) bad.spots.push(tag);
		let stairsCount = 0;
		for (let i = 0; i < W * H; i++) if (f.spawn[i] & S_STAIRS) stairsCount++;
		if (stairsCount !== 1) bad.spots.push(tag + ' stairs x' + stairsCount);
		// every floor tile is reachable on foot without touching liquid. The one exception is the original's own: the 2 x 2
		// island in a moat (its tiles carry the special mark), reached across the liquid
		const seen = reach(f);
		let cut = 0, liquid = 0, enemies = 0, rooms = new Set();
		for (let i = 0; i < W * H; i++) {
			const t = f.terrain[i], kind = t & 3, s = f.spawn[i];
			if (kind === T_FLOOR && !seen[i] && !(s & S_SPECIAL)) cut++;
			if (kind === T_LIQUID || kind === 3) liquid++;
			if (s & S_ENEMY) enemies++;
			if (kind === T_FLOOR && f.room[i] < 64) rooms.add(f.room[i]);
			// flags that must not meet
			if ((s & S_TRAP) && (s & (S_ITEM | S_STAIRS))) bad.flags.push(tag + ' trap with an item or the stairs');
			if ((s & S_TRAP) && kind !== T_FLOOR && kind !== 3) bad.flags.push(tag + ' trap off the floor');
			if ((s & S_ENEMY) && (kind !== T_FLOOR && kind !== 3)) bad.flags.push(tag + ' enemy off the floor');
			if ((s & S_ENEMY) && i === pi) bad.flags.push(tag + ' enemy on the start');
			if (t & T_CUT) bad.flags.push(tag + ' a corner-cut mark left over');
			if (!water && kind === 3) bad.flags.push(tag + ' shallow water on a lava floor');
			if (water && kind === T_LIQUID) bad.flags.push(tag + ' deep liquid on a water floor');
			if (f.room[i] === 0xFE) bad.flags.push(tag + ' a corridor anchor left unfinished');
		}
		if (cut) bad.reach.push(tag + ' ' + cut);
		if (liquid) stats.liquid++;
		if (!enemies) bad.flags.push(tag + ' no enemies');
		if (!rooms.size) bad.rooms.push(tag);
		// the small layout keeps to the left half
		if (layout === 1) { let far = 0; for (let x = 36; x < W; x++) for (let y = 0; y < H; y++) if ((f.terrain[at(x, y)] & 3) === T_FLOOR && f.room[at(x, y)] !== NO_ROOM) far++; if (far && !f.forceMh) bad.small.push(tag); }
	}
	A(stats.floors === 480, '480 more floors: every layout, 40 seeds, water and lava', stats);
	A(!bad.border.length, 'every floor is walled in: an undiggable outer ring, and wall inside it', bad.border.slice(0, 5));
	A(!bad.spots.length, 'every floor has a start and exactly one staircase, both on room floor', bad.spots.slice(0, 5));
	A(!bad.reach.length, 'every floor tile can be walked to from the stairs, dry-footed and without cutting a corner (but for an island in its moat)', bad.reach.slice(0, 5));
	A(!bad.flags.length, 'traps, items, enemies and liquid never land where they cannot be', bad.flags.slice(0, 5));
	A(!bad.rooms.length, 'every floor has a room', bad.rooms.slice(0, 5));
	A(!bad.small.length, 'the small layout keeps its rooms to the left of the map', bad.small.slice(0, 5));
	A(stats.shops > 10 && stats.houses > 10 && stats.liquid > 100, 'shops, Monster Houses and liquid all turn up', stats);
}
{
	const p = { ...base, layout: 0 };
	const a = generateFloor(4242, p, {}), b = generateFloor(4242, p, {}), c = generateFloor(4244, p, {});
	A(floorHash(a) === floorHash(b) && floorHash(a) !== floorHash(c), 'the same seed and settings give the same floor; another seed another');
	const rng = makeRng(4242);
	const d = generateFloor(rng, p, {});
	A(floorHash(d) === floorHash(a) && rng.state === a.rng && rng.draws > 100, 'a floor can be made from a running generator, which is left where the floor ended (the dungeon\'s one stream)', rng.draws);
	const one = generateFloor(7, { ...base, layout: 2 }, {});
	let house = 0, open = 0;
	for (let i = 0; i < W * H; i++) { if ((one.terrain[i] & 3) === T_FLOOR) open++; if (one.terrain[i] & T_MONSTER_HOUSE) house++; }
	A(one.forceMh && one.mh === 0 && open === 52 * 28 && house === open, 'the one-room layout: one 52 x 28 room, all of it a Monster House', [open, house]);
	const shop = generateFloor(777, { ...base, layout: 0, kecleonShopChance: 100, monsterHouseChance: 0 }, { water: true });
	let carpet = 0, inRoom = true;
	for (let i = 0; i < W * H; i++) if (shop.terrain[i] & T_SHOP) { carpet++; if (shop.room[i] === NO_ROOM) inRoom = false; }
	A(shop.shop && shop.shopKeeper && carpet >= 9 && inRoom && !(shop.terrain[shop.stairs[1] * W + shop.stairs[0]] & T_SHOP), 'a shop: a carpet of at least 3 x 3 inside a room, a keeper\'s spot, and the stairs are not in it', carpet);
	const txt = floorText(a).split('\n');
	A(txt.length === H && txt.every((r) => r.length === W) && floorText(a).includes('@') && floorText(a).includes('>'), 'floorText: 32 rows of 56, with the start and the stairs');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
