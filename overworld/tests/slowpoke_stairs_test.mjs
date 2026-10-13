// slowpoke_stairs_test.mjs — Slowpoke Well B1F's "stairs" are WATER, as in Crystal.
//
// 2026-10-13, Muse (bug:1791891356350): north of (7,16) the player bumps and the
// B2F warp at (7,11) "can't be reached on foot". Verdict: authentic. pokecrystal's
// SlowpokeWellB1F.blk puts block $0f (tilecoll WATER x4, data/tilesets/
// cave_collision.asm) on cells (6..7,14..15); the port's metatile 14 carries
// water behavior 0x15, so tryMove refuses it on foot (isPassable is true for any
// collision-0 cell — water included — which is why the report's probe said yes).
// B2F is a later-visit area: reached with SURF across that pool.
//
// Same day, Instinct (bug:1791850470017 / 1791851715994): Route 128's south half,
// Mossdeep's south sea and the Route 125 channel. Verdict: authentic — those
// layouts are byte-identical to pokeemerald's map.bin (checked below when the
// decomp is on this machine).
//
//   node overworld/tests/slowpoke_stairs_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. Slowpoke Well B1F: walk vs SURF, by the port's own movement rules =====
{
	const L = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', 'LAYOUT_SLOWPOKE_WELL_B1F.json'), 'utf8'));
	const attrs = JSON.parse(fs.readFileSync(path.join(DATA, 'tilesets', 'primary_cr_cave_metatiles.json'), 'utf8')).attributes;
	const beh = (x, y) => attrs[L.map[y][x] & 0x3ff] & 0xff;
	const passable = (x, y) => ((L.map[y][x] >> 10) & 3) === 0;
	const surfable = (x, y) => { const b = beh(x, y); return b >= 0x10 && b <= 0x1b; };   // engine.isSurfable
	const isWarp = (x, y) => (x === 7 && y === 11) || (x === 17 && y === 15);
	// engine.tryMove: on foot a cell must be passable and not water; surfing, water
	// or land; SURF starts from land facing water
	const reach = canSurf => {
		const seen = new Set(['17,15']), q = [[17, 15, false]];
		while (q.length) {
			const [x, y, s] = q.shift();
			for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= L.width || ny >= L.height) continue;
				let ok, ns = s;
				if (isWarp(nx, ny)) ok = true;
				else if (s) { ok = surfable(nx, ny) || passable(nx, ny); ns = surfable(nx, ny); }
				else { ok = passable(nx, ny) && !surfable(nx, ny); if (!ok && canSurf && surfable(nx, ny)) { ok = true; ns = true; } }
				const k = nx + ',' + ny;
				if (ok && !seen.has(k)) { seen.add(k); q.push([nx, ny, ns]); }
			}
		}
		return seen;
	};
	A(surfable(7, 14) && surfable(7, 15), "1. (7,14) and (7,15) are WATER (Crystal's block $0f), not stairs", `0x${beh(7, 14).toString(16)} 0x${beh(7, 15).toString(16)}`);
	A(!reach(false).has('7,11'), '1. on foot the B2F warp (7,11) is out of reach — as in Crystal');
	A(reach(true).has('7,11'), '1. with SURF the pool crosses to the B2F warp (7,11)');
}

// ===== 2. Emerald Route 128 / Mossdeep / Route 125: the port's layouts ARE the decomp's =====
{
	const EM = path.resolve(ROOT, '..', 'Magepunk66', 'Reference', 'pokeemerald', 'data', 'layouts');
	if (!fs.existsSync(EM)) console.log('skip - 2. pokeemerald not on this machine (the layout comparison needs it)');
	else for (const [layout, dir] of [['ROUTE128', 'Route128'], ['MOSSDEEP_CITY', 'MossdeepCity'], ['ROUTE125', 'Route125'], ['EVER_GRANDE_CITY', 'EverGrandeCity']]) {
		const j = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', `LAYOUT_${layout}.json`), 'utf8'));
		const bin = fs.readFileSync(path.join(EM, dir, 'map.bin'));
		let diffs = 0;
		for (let y = 0; y < j.height; y++) for (let x = 0; x < j.width; x++) if (bin.readUInt16LE((y * j.width + x) * 2) !== j.map[y][x]) diffs++;
		A(diffs === 0, `2. LAYOUT_${layout} matches pokeemerald's map.bin cell for cell (collision included)`, `${diffs} cells differ`);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
