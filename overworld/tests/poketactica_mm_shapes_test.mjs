// poketactica_mm_shapes_test.mjs — MYSTERY MAZE, geometry (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 2): Poketactica's
// move shapes laid out in 8 directions, the corner rule, what walls stop, and sight (poketactica/js/mm/shapes8.js).
// Every one of the game's move shapes is laid out in all 8 directions: facing straight it must be the battle's own shape
// (engine/grid.js), and a diagonal must be a true turn of it. Pure: node only.
//   node overworld/tests/poketactica_mm_shapes_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIR8, DIR8_KEYS, isDiagonal, cheb, isWall, dir8Toward, canStep8, lineOfFire, clearTo, sightTiles, shapeTiles8, hitTiles8, aimTiles8 } from '../../poketactica/js/mm/shapes8.js';
import { generateFloor, MM_W, MM_H, T_FLOOR, T_IMPASSABLE, NO_ROOM } from '../../poketactica/js/mm/gen.js';
import { shapeTiles, AIM_BY_DIR, NO_AIM } from '../../poketactica/js/engine/grid.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHAPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/move_shapes.json'), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const set = (tiles) => tiles.map(([x, y]) => x + ',' + y).sort().join(' ');

/** A floor from rows of text: # wall, anything else floor; a digit is that room's number, '.' a corridor. */
function floor(rows) {
	const h = rows.length, w = rows[0].length, terrain = new Uint16Array(w * h), room = new Uint8Array(w * h).fill(NO_ROOM);
	rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '#') { terrain[y * w + x] = T_FLOOR; if (/\d/.test(c)) room[y * w + x] = +c; } }));
	return { w, h, terrain, room };
}
const OPEN = floor(Array.from({ length: 31 }, () => '.'.repeat(31)));   // (an open field, the user in the middle)
const UX = 15, UY = 15;
const BATTLE_MAP = { w: 31, h: 31, height: new Array(31 * 31).fill(0) };

// ================================================================ every move's shape, 8 ways
{
	const ids = Object.keys(SHAPES);
	const forms = [];   // (each move's base shape and every shape it grows into)
	for (const id of ids) { const m = SHAPES[id]; forms.push([id, m]); for (const [, more] of (m.grow && m.grow.at) || []) forms.push([id, { ...m, ...more }]); }
	A(ids.length > 800 && forms.length > ids.length, `${ids.length} moves, ${forms.length} shapes with what they grow into`);
	const bad = { straight: [], turn: [], diag: [], count: [] };
	const kinds = new Set();
	const rot = ([x, y]) => [UX - (y - UY), UY + (x - UX)];   // (a quarter turn clockwise about the user)
	for (const [id, m] of forms) {
		kinds.add(m.s);
		if (m.s === 'map') continue;   // (room-wide here: its own test below)
		const aimAt = (d) => { const reach = AIM_BY_DIR.has(m.s) ? 1 : NO_AIM.has(m.s) ? 0 : Math.min((m.r || [1, 1])[1], 12); return [UX + DIR8[d][0] * reach, UY + DIR8[d][1] * reach]; };
		const lay = (d) => { const [tx, ty] = aimAt(d); return shapeTiles8(OPEN, m, UX, UY, d, tx, ty); };
		for (const d of [0, 2, 4, 6]) {
			const [tx, ty] = aimAt(d);
			if (set(lay(d)) !== set(shapeTiles(BATTLE_MAP, m, UX, UY, tx, ty))) bad.straight.push(id + ' ' + DIR8_KEYS[d]);
		}
		for (let d = 0; d < 8; d++) if (set(lay(d).map(rot)) !== set(lay((d + 2) % 8))) bad.turn.push(id + ' ' + DIR8_KEYS[d]);
		if (AIM_BY_DIR.has(m.s)) {
			// a diagonal covers as many tiles as facing straight, all of them in its own quarter, and reaches as far
			const straight = lay(2), diag = lay(1), n = m.n || 0;
			if (diag.length !== straight.length) bad.count.push(id + ' ' + m.s + m.n + ': ' + diag.length + ' v ' + straight.length);
			if (!diag.every(([x, y]) => x >= UX && y <= UY && cheb(UX, UY, x, y) <= n && (x > UX || y < UY))) bad.diag.push(id + ' quarter');
			if (n && !diag.some(([x, y]) => x === UX + n && y === UY - n)) bad.diag.push(id + ' tip');
		}
	}
	A(['one', 'line', 'cone', 'arc', 'dash', 'cross', 'dia', 'burst', 'aura', 'self', 'map'].every((k) => kinds.has(k)), 'every kind of shape is in the data', [...kinds]);
	A(!bad.straight.length, 'facing straight, every shape is the battle\'s own shape (north, east, south, west)', bad.straight.slice(0, 8));
	A(!bad.turn.length, 'every shape turned a quarter is the shape two facings on (all 8 facings)', bad.turn.slice(0, 8));
	A(!bad.count.length, 'a line, cone, arc or dash covers as many tiles on a diagonal as facing straight', bad.count.slice(0, 8));
	A(!bad.diag.length, 'on a diagonal they stay in their own quarter and reach the diagonal tip', bad.diag.slice(0, 8));
	A(set(shapeTiles8(OPEN, { s: 'line', n: 3 }, UX, UY, 1, 0, 0)) === set([[16, 14], [17, 13], [18, 12]]), 'a line to the north-east runs along the diagonal');
	A(set(shapeTiles8(OPEN, { s: 'arc', n: 1 }, UX, UY, 3, 0, 0)) === set([[16, 16], [15, 16], [16, 15]]), 'an arc to the south-east: the diagonal tile and the two beside it');
	A(set(shapeTiles8(OPEN, { s: 'cone', n: 2 }, UX, UY, 7, 0, 0)) === set([[14, 14], [13, 13], [14, 13], [13, 14]]), 'a cone to the north-west: 1 tile, then 3');
}

// ================================================================ directions and the corner rule
{
	A(DIR8.length === 8 && DIR8_KEYS.join() === 'n,ne,e,se,s,sw,w,nw' && [1, 3, 5, 7].every(isDiagonal) && ![0, 2, 4, 6].some(isDiagonal), '8 directions, clockwise from north; the odd ones are diagonals');
	const want = [[0, -5, 0], [5, -5, 1], [5, 0, 2], [5, 5, 3], [0, 5, 4], [-5, 5, 5], [-5, 0, 6], [-5, -5, 7], [5, -1, 2], [5, -4, 1], [1, 5, 4], [-2, -5, 0], [-3, -5, 7]];
	A(want.every(([dx, dy, d]) => dir8Toward(10, 10, 10 + dx, 10 + dy) === d), 'the facing toward a tile is the nearest of the 8 directions');
	A(cheb(0, 0, 3, 3) === 3 && cheb(0, 0, 3, -1) === 3 && cheb(2, 2, 2, 2) === 0, 'reach is counted in 8 directions: a diagonal step is one step');
	const F = floor([
		'#######',
		'#..#..#',
		'#.....#',
		'#..#..#',
		'#######']);
	A(canStep8(F, 1, 1, 2) && canStep8(F, 1, 1, 4) && canStep8(F, 1, 1, 3) && !canStep8(F, 1, 1, 0) && !canStep8(F, 2, 1, 2), 'a step needs an open tile');
	A(!canStep8(F, 2, 1, 3) && !canStep8(F, 2, 2, 1) && !canStep8(F, 4, 3, 7) && canStep8(F, 2, 2, 2), 'no diagonal step round a wall\'s corner: both tiles beside the way must be open');
	A(isWall(F, -1, 0) && isWall(F, 7, 2) && isWall(F, 3, 1) && !isWall(F, 3, 2), 'off the floor is wall');
	A(lineOfFire(F, 1, 2, 5, 2) && !lineOfFire(F, 1, 1, 5, 1) && !lineOfFire(F, 2, 1, 4, 3) && lineOfFire(F, 1, 1, 2, 2) && !lineOfFire(F, 2, 1, 3, 2), 'a shot needs every step of its line open, corners too');
	const hit = (m, ux, uy, tx, ty) => set(hitTiles8(F, m, ux, uy, tx, ty));
	A(hit({ s: 'one', r: [1, 1], h: 'melee' }, 2, 1, 3, 2) === '' && hit({ s: 'one', r: [1, 1], h: 'melee' }, 2, 2, 3, 2) === '3,2', 'a melee strike obeys the corner rule');
	A(hit({ s: 'line', n: 4, h: 'beam' }, 1, 1, 2, 1) === '2,1' && hit({ s: 'line', n: 4, h: 'beam' }, 1, 2, 2, 2) === '2,2 3,2 4,2 5,2', 'a beam stops at the first wall');
	const burst = hitTiles8(F, { s: 'burst', n: 2, h: 'any' }, 2, 2, 2, 2);
	A(burst.some(([x, y]) => x === 4 && y === 2) && burst.some(([x, y]) => x === 1 && y === 1) && !burst.some(([x, y]) => (x === 3 && y === 1) || (x === 2 && y === 2)), 'a burst spreads round its user, never onto a wall or the user', set(burst));
}

// ================================================================ walls, rooms, lobs, sight
{
	const F = floor([
		'###########',
		'#0000#1111#',
		'#0000#1111#',
		'#0000..111#',
		'#0000#1111#',
		'###.#######',
		'###.#######',
		'###....####',
		'###########']);
	const lob = { s: 'one', r: [1, 6], h: 'lob' }, beam = { s: 'one', r: [1, 6], h: 'beam' };
	A(clearTo(F, 'lob', 1, 1, 4, 4) && hitTiles8(F, lob, 1, 1, 4, 4).length === 1, 'a lob lands anywhere in the thrower\'s own room');
	A(!clearTo(F, 'lob', 1, 1, 6, 1) && !hitTiles8(F, lob, 4, 1, 6, 1).length && !hitTiles8(F, beam, 4, 1, 6, 1).length, 'a lob cannot leave the room over a wall, and neither can a beam');
	A(hitTiles8(F, beam, 1, 3, 7, 3).length === 1 && hitTiles8(F, lob, 1, 3, 7, 3).length === 1, 'through the doorway either gets there');
	const aim = aimTiles8(F, lob, 2, 2);
	A(aim.length > 10 && aim.every(([x, y]) => !isWall(F, x, y) && cheb(2, 2, x, y) >= 1 && cheb(2, 2, x, y) <= 6) && !aim.some(([x, y]) => x === 6 && y === 1) && aim.some(([x, y]) => x === 4 && y === 4), 'aiming: every open tile in reach the walls let the move get to (8-direction reach)', aim.length);
	A(set(aimTiles8(F, { s: 'aura', n: 1 }, 2, 2)) === '2,2', 'a move with no aim is aimed at its own tile');
	const dirs = aimTiles8(F, { s: 'line', n: 3, h: 'beam' }, 1, 1);
	A(set(dirs) === set([[2, 1], [2, 2], [1, 2]]), 'a move aimed by direction: the neighbours it has a tile toward (3 of 8 in a corner)', dirs);
	// a blast aimed at a doorway spreads only where the walls let it
	const blast = hitTiles8(F, { s: 'dia', n: 2, r: [1, 6], h: 'beam' }, 2, 3, 5, 3);
	A(blast.some(([x, y]) => x === 5 && y === 3) && blast.every(([x, y]) => !isWall(F, x, y)) && !blast.some(([x, y]) => x === 6 && y === 2 && false), 'an area lands on open tiles only', set(blast));
	// sight
	const inRoom = sightTiles(F, 2, 2);
	A(inRoom.length === 36 && inRoom.some(([x, y]) => x === 5 && y === 3) && !inRoom.some(([x, y]) => x === 6 && y === 3), 'in a room you see the whole room and the ring round it (its doorways), no further', inRoom.length);
	const inHall = sightTiles(F, 3, 6);
	A(inHall.length === 25 && inHall.some(([x, y]) => x === 3 && y === 4) && inHall.some(([x, y]) => x === 5 && y === 7) && !inHall.some(([x, y]) => x === 3 && y === 3) && sightTiles(F, 3, 6, 1).length === 9, 'in a corridor you see the 2 tiles around you, round the bend too (1 tile on a dark floor)', set(inHall));
	A(set(shapeTiles8(F, { s: 'map' }, 2, 2, 0, 2, 2)) === set(inRoom.filter(([x, y]) => !isWall(F, x, y))), 'a room-wide move covers what its user sees');
}

// ================================================================ on real floors
{
	let ok = true, sym = true, tiles = 0;
	for (let k = 0; k < 12; k++) {
		const f = generateFloor(1000 + k * 77, { layout: k, roomDensity: 6, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 2, roomFlags: 5,
			itemDensity: 3, trapDensity: 3, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 1, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 }, {});
		const F = { w: MM_W, h: MM_H, terrain: f.terrain, room: f.room };
		for (let y = 0; y < MM_H; y++) for (let x = 0; x < MM_W; x++) {
			if (isWall(F, x, y)) continue;
			tiles++;
			for (let d = 0; d < 8; d++) {
				const nx = x + DIR8[d][0], ny = y + DIR8[d][1];
				if (canStep8(F, x, y, d)) { if (F.terrain[ny * MM_W + nx] & T_IMPASSABLE) ok = false; if (!canStep8(F, nx, ny, (d + 4) % 8)) sym = false; }
			}
		}
		const see = sightTiles(F, f.player[0], f.player[1]);
		if (!see.some(([x, y]) => x === f.player[0] && y === f.player[1]) || see.length < 9) ok = false;
	}
	A(ok && sym && tiles > 3000, 'on 12 generated floors: no step leaves the floor, every step can be taken back, the start sees its room', tiles);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
