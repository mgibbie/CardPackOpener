// tools/micasurvivor/pack_anim_atlas.mjs — packs battle-animation sprites from the Emerald decomp into one atlas for
// MicaSurvivor 3D's effects layer (micasurvivor/m3d/fx.js): micasurvivor/assets/fx/anims1.png + anims1.json (published assets are cached hard: a changed atlas takes the next number, here and in m3d/main.js).
//
// The owner, 2026-11-14: the 3D attacks may use "the real games' animations" as well as free-licence packs.
// Source: pret/pokeemerald, graphics/battle_anims/sprites/*.png (+ .pal). These are the games' own art (Pokémon ©
// Nintendo / Creatures Inc. / GAME FREAK), like the decomp maps and sprites the site already uses. So, like
// overworld/data, the atlas is NOT committed: micasurvivor/assets/ is gitignored and goes to its own Pages project
// (npm run deploy-micasurvivor, then node tools/cloud/fetch-assets.mjs --write-manifest).
//
//   node tools/micasurvivor/pack_anim_atlas.mjs <dir with the sprites>
//
// A sprite sheet there is a column of square frames, 4-bit indexed, colour 0 transparent; a .pal beside it (JASC) is
// its real palette when the PNG's own is a placeholder. Each sheet becomes one ROW of the atlas, its frames across.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node tools/micasurvivor/pack_anim_atlas.mjs <dir with pokeemerald graphics/battle_anims/sprites>'); process.exit(1); }

/** A 4-bit / 8-bit indexed PNG -> { w, h, idx: Uint8Array (one index a pixel), pal: [[r, g, b], …] } */
function readIndexed(file) {
	const b = fs.readFileSync(file); let p = 8, w = 0, h = 0, depth = 0, ctype = 0; const idat = []; let pal = [];
	while (p < b.length) {
		const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); p += 12 + len;
		if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; if (d[12]) throw new Error(file + ': interlaced'); }
		else if (type === 'PLTE') { for (let i = 0; i < d.length; i += 3) pal.push([d[i], d[i + 1], d[i + 2]]); }
		else if (type === 'IDAT') idat.push(d);
	}
	if (ctype !== 3) throw new Error(file + ': not an indexed PNG');
	const raw = zlib.inflateSync(Buffer.concat(idat)), stride = Math.ceil(w * depth / 8), idx = new Uint8Array(w * h); let prev = new Uint8Array(stride);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)], line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let x = 0; x < stride; x++) {   // (the filter's "pixel to the left" is one BYTE back at these depths)
			const a = x ? line[x - 1] : 0, up = prev[x], c = x ? prev[x - 1] : 0;
			if (f === 1) line[x] = (line[x] + a) & 255; else if (f === 2) line[x] = (line[x] + up) & 255; else if (f === 3) line[x] = (line[x] + ((a + up) >> 1)) & 255;
			else if (f === 4) { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
		}
		for (let x = 0; x < w; x++) idx[y * w + x] = depth === 8 ? line[x] : depth === 4 ? (line[x >> 1] >> (x & 1 ? 0 : 4)) & 15 : depth === 2 ? (line[x >> 2] >> (6 - (x & 3) * 2)) & 3 : (line[x >> 3] >> (7 - (x & 7))) & 1;
		prev = line;
	}
	return { w, h, idx, pal };
}
const readPal = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(3).map((l) => l.trim().split(/\s+/).map(Number)).filter((c) => c.length === 3 && c.every(Number.isFinite));
function writePng(file, w, h, rgba) {
	const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
	const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
	const chunk = (type, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(type, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
	const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
	fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

const sheets = fs.readdirSync(SRC).filter((f) => f.endsWith('.png')).sort().map((f) => {
	const name = f.replace(/\.png$/, ''), s = readIndexed(path.join(SRC, f));
	const pf = [name + '.pal', name.replace(/_\d+$/, '') + '.pal'].map((q) => path.join(SRC, q)).find((q) => fs.existsSync(q));
	const pal = pf ? readPal(pf) : s.pal, cell = s.w, frames = Math.max(1, Math.round(s.h / s.w));
	return { name, ...s, pal, cell, frames, wide: s.h < s.w };
});
// (a sheet wider than it is tall is one frame: razor_leaf 32 x 16)
for (const s of sheets) if (s.wide) { s.frames = 1; s.cellH = s.h; } else s.cellH = s.cell;
const W = Math.max(...sheets.map((s) => s.cell * s.frames)), PAD = 1;
let y = 0; const info = { source: 'pret/pokeemerald graphics/battle_anims/sprites (Pokémon © Nintendo / Creatures Inc. / GAME FREAK)', w: W, h: 0, sprites: {} };
for (const s of sheets) { s.y = y; y += s.cellH + PAD; }
const H = y, rgba = new Uint8Array(W * H * 4);
for (const s of sheets) {
	for (let f = 0; f < s.frames; f++) for (let py = 0; py < s.cellH; py++) for (let px = 0; px < s.cell; px++) {
		const i = s.idx[(f * s.cell + py) * s.w + px]; if (!i) continue;   // (colour 0: transparent)
		const c = s.pal[i] || [255, 0, 255], o = ((s.y + py) * W + f * s.cell + px) * 4;
		rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
	}
	info.sprites[s.name] = { y: s.y, w: s.cell, h: s.cellH, n: s.frames };
}
info.h = H;
const dir = path.join(ROOT, 'micasurvivor/assets/fx'); fs.mkdirSync(dir, { recursive: true });
writePng(path.join(dir, 'anims1.png'), W, H, rgba);
fs.writeFileSync(path.join(dir, 'anims1.json'), JSON.stringify(info) + '\n');
console.log(`wrote ${path.join(dir, 'anims1.png')}: ${W} x ${H}, ${sheets.length} sheets, ${fs.statSync(path.join(dir, 'anims1.png')).size} bytes`);
