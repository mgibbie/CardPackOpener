// mm_floor.mjs — print a Mystery Maze floor (poketactica/js/mm/gen.js) for any seed and settings, as text and as a picture.
//   node tools/poketactica/mm_floor.mjs [--seed=12345] [--layout=0..11 | a name] [--png=floor.png] [--scale=8] [--water]
//        [--rooms=6] [--connect=15] [--enemies=6] [--items=4] [--traps=6] [--shop=0] [--house=0] [--halls=4]
//        [--structures=2] [--flags=5] [--lakes=1] [--buried=0] [--deadends]
// Text: # wall, . room floor, , corridor, ~ liquid, > stairs, @ you, $ shop, m Monster House, i item, b buried item, ^ trap, e enemy.
import fs from 'fs';
import zlib from 'zlib';
import { generateFloor, floorText, LAYOUTS, MM_W, MM_H, T_SHOP, T_MONSTER_HOUSE, S_STAIRS, S_ITEM, S_TRAP, S_ENEMY, NO_ROOM } from '../../poketactica/js/mm/gen.js';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const num = (n, d) => +arg(n, d);
const lay = arg('layout', '0');
const layout = /^\d+$/.test(lay) ? +lay : Math.max(0, LAYOUTS.indexOf(lay));
const seed = num('seed', 12345) >>> 0;
export const props = {
	layout, roomDensity: num('rooms', 6), floorConnectivity: num('connect', 15), enemyDensity: num('enemies', 6), kecleonShopChance: num('shop', 0), monsterHouseChance: num('house', 0),
	mazeRoomChance: 0, allowDeadEnds: has('deadends'), secondaryStructuresBudget: num('structures', 2), roomFlags: num('flags', 5), itemDensity: num('items', 4), trapDensity: num('traps', 6),
	numExtraHallways: num('halls', 4), buriedItemDensity: num('buried', 0), standaloneLakeDensity: num('lakes', 1), kecleonShopLayout: 0, itemlessMonsterHouseChance: 0,
};
const f = generateFloor(seed, props, { water: has('water') });
console.log(`seed ${seed} · ${LAYOUTS[layout] || 'large'} · you ${f.player} · stairs ${f.stairs}${f.shop ? ' · a shop' : ''}${f.mh !== NO_ROOM ? ' · a Monster House (room ' + f.mh + ')' : ''}`);
console.log(floorText(f));

const png = arg('png', '');
if (png) {
	const k = Math.max(1, num('scale', 8)), w = MM_W * k, h = MM_H * k;
	const raw = Buffer.alloc((w * 3 + 1) * h);
	const colour = (i, x, y) => {
		const t = f.terrain[i], s = f.spawn[i], kind = t & 3;
		if (x === f.player[0] && y === f.player[1]) return [255, 255, 255];
		if (s & S_STAIRS) return [255, 220, 60];
		if (kind === 0) return s & S_ITEM ? [70, 60, 40] : [34, 30, 42];
		if (s & S_ENEMY) return [230, 70, 70];
		if (s & S_ITEM) return [90, 220, 120];
		if (s & S_TRAP) return [200, 110, 240];
		if (kind !== 1) return has('water') ? [70, 130, 230] : [230, 120, 50];
		if (t & T_SHOP) return [240, 190, 120];
		if (t & T_MONSTER_HOUSE) return [150, 120, 130];
		return f.room[i] === NO_ROOM ? [120, 116, 104] : [170, 164, 146];
	};
	for (let y = 0; y < h; y++) {
		const row = y * (w * 3 + 1);
		for (let x = 0; x < w; x++) {
			const tx = (x / k) | 0, ty = (y / k) | 0, c = colour(ty * MM_W + tx, tx, ty);
			raw[row + 1 + x * 3] = c[0]; raw[row + 2 + x * 3] = c[1]; raw[row + 3 + x * 3] = c[2];
		}
	}
	const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
	const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
	fs.writeFileSync(png, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	console.log('picture: ' + png);
}
