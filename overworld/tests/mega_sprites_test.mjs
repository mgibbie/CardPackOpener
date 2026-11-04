// mega_sprites_test.mjs — every Legends Z-A / Mega Dimension Mega ("wave 2" of the overworld's Mega Evolution) has its
// OWN battle front + back sprite in overworld/data/pokemon, so the Mega feature (feat/overworld-mega-evolution) can turn
// them on. Before 2026-11-03 the overworld had no art at all for these 49 (tools/gen_mega_sprites.py adds it:
// PokeAPI/sprites' pixel art, Mega Zygarde composed from the official Legends Z-A renders).
//
// Covers: tools/gen_mega_sprites.py, tools/data/mega_sprites.json, overworld/data/pokemon (s<n>.png / s<n>-b.png),
// tools/cloud/owdata_manifest.txt (CI fetches the gitignored data by it).
//   node overworld/tests/mega_sprites_test.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const ex = f => fs.existsSync(f);
const same = (a, b) => ex(a) && ex(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

// ---------- a tiny PNG decoder: size + the visible box (alpha > 16, sprite-audit's rule) ----------
function png(file) {
	const buf = fs.readFileSync(file);
	let p = 8, w, h, depth, ct, inter, pal = null, trns = null; const idat = [];
	while (p < buf.length) {
		const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
		if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; inter = d[12]; }
		else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
		p += 12 + len;
	}
	if (inter) throw new Error(file + ': interlaced');
	const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
	const bpp = Math.max(1, (ch * depth) >> 3), stride = (w * ch * depth + 7) >> 3;
	const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = (x >= bpp && y) ? px[o - stride + x - bpp] : 0;
			let v = src[x];
			if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
			else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
			px[o + x] = v & 255;
		}
	}
	const sample = (x, y) => { // value of channel/index at (x,y)
		if (depth === 8) return px[y * stride + x * ch + (ch - 1)];
		const bit = x * depth, byte = px[y * stride + (bit >> 3)];
		return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
	};
	const alpha = (x, y) => {
		if (ct === 6 || ct === 4) return sample(x, y);
		if (ct === 3) { const i = sample(x, y); return trns && i < trns.length ? trns[i] : 255; }
		return 255; // greyscale/RGB without tRNS: opaque (none of ours)
	};
	let x0 = w, y0 = h, x1 = -1, y1 = -1;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha(x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
	return { w, h, box: x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1] };
}

const L = rd(path.join(ROOT, 'tools/data/mega_sprites.json')).megas;
const W2 = L.filter(m => m.wave === 2);
A(L.length === 99 && L.filter(m => m.wave === 1).length === 50 && W2.length === 49,
	'the list: 99 Megas / Primals, 50 of X/Y + ORAS (wave 1) and 49 of Legends Z-A + Mega Dimension (wave 2)', JSON.stringify({ n: L.length, w2: W2.length }));
// the numbering every form sprite uses: dex * 32 + Showdown formeOrder index (tools/fix_form_sprites.mjs)
const badNum = W2.filter(m => { const n = +/^s(\d+)\.png$/.exec(m.sprite)?.[1]; return !(n > m.num * 32 && n < m.num * 32 + 32); });
A(!badNum.length, 'each sprite is numbered dex*32 + its forme index', badNum.map(m => m.name).join());
A(['Raichu-Mega-X:s834.png', 'Absol-Mega-Z:s11490.png', 'Zygarde-Mega:s22981.png', 'Tatsugiri-Stretchy-Mega:s31301.png']
	.every(k => L.some(m => m.name + ':' + m.sprite === k)), 'Mega Raichu X s834, Mega Absol Z s11490, Mega Zygarde s22981, Stretchy Mega Tatsugiri s31301');
const P = f => path.join(D, 'pokemon', f), B = f => P(f.replace(/\.png$/, '-b.png'));
const big = f => { const b = png(f).box; return b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0; };
const noFront = W2.filter(m => !ex(P(m.sprite))), noBack = W2.filter(m => !ex(B(m.sprite)));
A(!noFront.length, 'every wave-2 Mega has a battle FRONT sprite', `${noFront.length}: ${noFront.slice(0, 10).map(m => m.name).join()}`);
A(!noBack.length, 'every wave-2 Mega has a battle BACK sprite (else battle.js draws the front for your own Mega)', `${noBack.length}: ${noBack.slice(0, 10).map(m => m.name).join()}`);
const have = W2.filter(m => ex(P(m.sprite)) && ex(B(m.sprite)));
// real art: not the base species' picture, front != back, not a minisprite blown up to the 96px battle box, trimmed
const dupBase = have.filter(m => same(P(m.sprite), P('s' + m.num * 32 + '.png')) || same(B(m.sprite), B('s' + m.num * 32 + '.png')));
A(have.length && !dupBase.length, "none is a copy of its base species' front / back", dupBase.map(m => m.name).join());
const dupFB = have.filter(m => same(P(m.sprite), B(m.sprite)));
A(have.length && !dupFB.length, 'front and back are different pictures', dupFB.map(m => m.name).join());
const mini = have.filter(m => big(P(m.sprite)) < 48 || big(B(m.sprite)) < 40);
A(have.length && !mini.length, 'all are full-size art (front >= 48px, back >= 40px), not minisprites', mini.map(m => m.name + ' ' + big(P(m.sprite))).join());
const padded = have.filter(m => { const { w, h } = png(P(m.sprite)); return big(P(m.sprite)) < 0.9 * Math.max(w, h); });
A(have.length && !padded.length, 'fronts are trimmed to their art (no empty canvas)', padded.map(m => m.name).join());
// the cosmetic variants are their own pictures (Magearna's Original Color, Tatsugiri's three). Mega Meowstic M and F are
// drawn the same everywhere (PokeAPI's pixel art, Showdown, HOME and the Legends Z-A renders), so one picture serves both
const pairs = [['Magearna-Mega', 'Magearna-Original-Mega'], ['Tatsugiri-Curly-Mega', 'Tatsugiri-Droopy-Mega'], ['Tatsugiri-Curly-Mega', 'Tatsugiri-Stretchy-Mega']];
const by = n => L.find(m => m.name === n);
A(have.length === 49 && pairs.every(([a, b]) => !same(P(by(a).sprite), P(by(b).sprite))), 'each colour / shape variant has its own picture');
A(W2.filter(m => m.src === 'composed').map(m => m.name).join() === 'Zygarde-Mega' && W2.filter(m => m.src === 'pokeapi').length === 48,
	'48 from PokeAPI/sprites, 1 composed (Mega Zygarde: no pixel sprite exists anywhere)');
const man = fs.readFileSync(path.join(ROOT, 'tools/cloud/owdata_manifest.txt'), 'utf8').split(/\r?\n/);
const unlisted = W2.flatMap(m => [m.sprite, m.sprite.replace('.png', '-b.png')]).filter(f => !man.includes('pokemon/' + f));
A(!unlisted.length, 'the owdata manifest lists all 98 (deployed to magepunk-owdata; the CI gate fetches by it)', unlisted.slice(0, 6).join());

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
