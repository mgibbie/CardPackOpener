// base_sprites_test.mjs — every Pokémon's battle sprites are real art at battle
// resolution, not box icons, and your own mon is drawn from BEHIND.
//
// Covers: tools/gen_base_sprites.py, tools/gen_form_sprites.py, tools/gen_designwiki.mjs,
// overworld/battle.js (drawSide's 96px normalisation, loadSprite), overworld/sprite_tuning.json,
// overworld/data/pokemon, overworld/data/species_battle.json, designwiki/sprites.
//
// The bugs (2026-10-16, after PR #715 fixed the same thing for the 130 forms):
//  * 90 base species — the whole Galar dex (#810-#898) and Xerneas — wore box-icon
//    minisprites as their battle FRONT (Urshifu 33px of art, Morpeko 21px, Sinistea
//    17px). battle.js fits every sprite's visible pixels to the same 96px box, so
//    they were blown up 3-5x into a blur.
//  * 105 Gen-9 species (#906-#1010) had a FRONT-facing picture as their "-b" back
//    sprite: your own Sprigatito / Pawmo / Tinkaton faced the camera in battle.
//  * Meowstic's back (s21696-b.png) had a corrupt iCCP chunk (bad CRC).
//
// SIZE CRITERION. The base species' BACK sprites are the Essentials pack's art at
// its native scale (largest visible side within 10% of the pack's for 918 of 1025),
// and every real front is drawn at that scale or bigger (FRLG/DPP fronts are
// ~1.1-1.5x). An icon front measured 0.28-0.64x the pack's front. So: a numbered
// species' front (largest visible side, alpha > 16 — sprite-audit's rule) must be
// >= 0.75x its own back's, and every front and back >= 24px of art.
// tools/gen_base_sprites.py applies the pack rule (pack front > 1.25x ours = icon).
//   node overworld/tests/base_sprites_test.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const ex = f => fs.existsSync(f);

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
		// 8-bit RGB / greyscale with a tRNS colour key (fakemon like Protowatt): that colour is clear
		if (trns && depth === 8 && ct === 2) { const o = y * stride + x * 3; return px[o] === trns[1] && px[o + 1] === trns[3] && px[o + 2] === trns[5] ? 0 : 255; }
		if (trns && depth === 8 && ct === 0) return px[y * stride + x] === trns[1] ? 0 : 255;
		return 255;
	};
	let x0 = w, y0 = h, x1 = -1, y1 = -1;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha(x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
	return { w, h, box: x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1] };
}
// sprite-audit.cjs's crop: [x,y,w,h] canvas fractions, or null when "close enough"
function cropOf(file) {
	const { w, h, box } = png(file);
	if (!box) return null;
	const bw = box[2] - box[0], bh = box[3] - box[1], gap = h - box[3], cxOff = (box[0] + box[2]) / 2 - w / 2;
	if (Math.max(bw, bh) / Math.max(w, h) >= 0.9 && gap / h <= 0.03 && Math.abs(cxOff) / w <= 0.05) return null;
	const r = v => Math.round(v * 1000) / 1000;
	return [r(box[0] / w), r(box[1] / h), r(bw / w), r(bh / h)];
}

// every chunk's CRC is right (PIL refuses a file with a bad one; browsers may drop it)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crcOk(file) {
	const b = fs.readFileSync(file); let p = 8;
	while (p + 12 <= b.length) {
		const len = b.readUInt32BE(p); let c = ~0;
		for (let i = p + 4; i < p + 8 + len; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
		if (((~c) >>> 0) !== b.readUInt32BE(p + 8 + len)) return false;
		if (b.toString('latin1', p + 4, p + 8) === 'IEND') return true;
		p += 12 + len;
	}
	return false;
}

// ---------- the species: one per national dex number + the fakemon (forms: form_sprites_test) ----------
const bat = rd(path.join(D, 'species_battle.json'));
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const byNum = new Map();
for (const id of ALL) { const n = bat[id].num; if (n > 0 && !/_/.test(id) && !byNum.has(n)) byNum.set(n, id); }
const NUMBERED = [...byNum.values()];
const FAKEMON = ALL.filter(id => !(bat[id].num > 0));
const P = f => path.join(D, 'pokemon', f);
const backOf = f => f.replace(/\.(png|gif)$/, '-b.$1');
const big = f => { const b = png(f).box; return b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0; };
A(NUMBERED.length === 1025, `${NUMBERED.length} numbered species`);
A(FAKEMON.length >= 600, `${FAKEMON.length} fakemon`);
const SPECIES = [...NUMBERED, ...FAKEMON];

const missing = SPECIES.filter(id => !ex(P(bat[id].sprite)) || !ex(P(backOf(bat[id].sprite))));
A(missing.length === 0, 'every species has a battle front and back sprite', missing.join(','));
const have = SPECIES.filter(id => !missing.includes(id));
const corrupt = have.flatMap(id => [bat[id].sprite, backOf(bat[id].sprite)]).filter(f => !crcOk(P(f)));
A(corrupt.length === 0, 'every battle sprite is a well-formed PNG (no chunk with a bad CRC)', corrupt.join(','));

const F = new Map(have.map(id => [id, big(P(bat[id].sprite))]));
const B = new Map(have.map(id => [id, big(P(backOf(bat[id].sprite)))]));

// a front far smaller than its own back is a box icon. Real art that measures
// small next to its back (eyeballed side by side with the pack art):
const SMALL_FRONT_OK = {
	seaking: 'FRLG front with its fins folded (48px); the back spreads them (75px)',
	crabrawler: 'proper Gen-7 art with the claws tucked (50px); the back raises them (69px)',
};
const icon = NUMBERED.filter(id => F.has(id) && !SMALL_FRONT_OK[id] && F.get(id) < 0.75 * B.get(id));
A(icon.length === 0, 'no numbered species\' front is icon-sized (< 0.75x its own back)', `${icon.length}: ${icon.map(id => `${id} ${F.get(id)}/${B.get(id)}px`).slice(0, 12).join(', ')}`);
const stale = Object.keys(SMALL_FRONT_OK).filter(id => F.get(id) >= 0.75 * B.get(id));
A(stale.length === 0, 'the allowlist is still needed', stale.join(','));
const tinyF = have.filter(id => F.get(id) < 24), tinyB = have.filter(id => B.get(id) < 24);
A(tinyF.length === 0, 'every front is >= 24px of art', tinyF.join(','));
A(tinyB.length === 0, 'every back is >= 24px of art', tinyB.join(','));
// spot checks: the owner's examples are full-size pack art now
for (const [id, min] of [['urshifu', 75], ['calyrex', 75], ['morpeko', 40], ['grookey', 40], ['indeedee', 50], ['eiscue', 75], ['xerneas', 90]])
	A(F.get(id) >= min, `${id}'s front is real battle art (>= ${min}px)`, `${F.get(id)}px`);

// ---------- your own mon faces AWAY ----------
// The front-facing pictures the Gen-9 species (#906-#1010) used to have as their
// "-b" sprite (sha1, first 12 hex). #1011-#1025 have no back art in either pack:
// they still show a front-facing picture (a documented gap; not icon-sized).
const FRONT_FACING = new Set([
	'442edd152154', 'd097a876693b', '96b441f472fd', '885cbf5d5940', '358cd4ba7089', '414fe42eea91', 'feb62acb1eae', '270c23f0778f',
	'ceebb4cbc5e3', 'b75f0f4b18d4', '63415b8d9cab', '980297d4392c', '441ea016ef39', 'c87e6d3843d6', 'e183598c4c49', 'f35807bd1f9d',
	'58d063192174', '9bf2619f010b', '5baa88c532b4', '78083ab417f9', '7b382d7645b6', '035a8d69f684', '50081f10b6df', '0ecd0d7d2521',
	'9930259d3ea0', '8fb99e2782fb', '6cfda0f0e784', '8d064a795458', '27e24dfa8899', 'd1292491fff3', 'cb3a752497c1', '1f2779e02c71',
	'a8258924c64e', '8aff722ff6e7', 'cc97215821c4', 'f11f68d35c6f', '1d5e938c2e84', '97b714365a4a', 'ed499ba92395', '3b722e516797',
	'564e0fad00f3', 'a6d3d8c01abf', 'c7239f2f5c30', '43ac16ed20e4', '1091e5b2af4c', '595e07d743e3', '990f29deebbf', 'e5d6fa7aa4df',
	'6c2d5c1cfe92', '42a9aeda9704', '3655c74313db', '4683182ab33e', '51ba6083ad92', '4dfbd63ce1f3', '8964f7d9f362', '6d1e479201cd',
	'e570c1fcce4f', 'd6e544503fb8', '9a5cce20c800', 'fbc35ed7438a', 'ea3262232e83', '08b077e2c957', '855eae29531d', '94988d48d12c',
	'45aca1b1a8be', 'cdcfe1a78555', 'c05310fe8e08', 'f9cadcf11c94', 'b297b445d6a9', 'bbecb9a600d0', 'b3e54f53aa7e', 'df0da202431b',
	'27186861d50e', '59c7ad2c4f77', '6173e19217b1', '069f0be330cf', '8e84aa750fd8', 'ce4c6d42a056', '74aa3cc9121c', '540dbca5176f',
	'99658359805b', 'b75fc38f2779', '1fbd5de9621e', '4fa9650ff7fb', '729abea05da2', '786c4599a9f4', '78cae8db96d3', '2815311c45df',
	'f9cfcf448ebc', 'dd99eb14b544', 'f7efb3014f6a', '90eb07b6edff', 'bf616f3478e0', '48bf33be50f3', 'dffee20eb0aa', 'c2282242f3ea',
	'07ffa4b3634e', 'a9e328cdde48', 'da7c29457bc1', 'eda596fc2eb4', 'b86538f6b685', '1f6bf826f519', 'faef346bb9a7', '1b0d85b89acd',
	'da99605ccaf0',
]);
const NO_BACK_ART = ['dipplin', 'poltchageist', 'sinistcha', 'okidogi', 'munkidori', 'fezandipiti', 'ogerpon', 'archaludon',
	'hydrapple', 'gougingfire', 'ragingbolt', 'ironboulder', 'ironcrown', 'terapagos', 'pecharunt'];
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
const facing = have.filter(id => FRONT_FACING.has(sha(P(backOf(bat[id].sprite)))));
A(facing.length === 0, 'no back sprite is one of the old front-facing Gen-9 pictures', `${facing.length}: ${facing.slice(0, 12).join(',')}`);
A(NO_BACK_ART.every(id => bat[id].num >= 1011), 'the no-back-art gap is only the #1011+ DLC species');

// ---------- battle tuning crops measured on each species' OWN current files ----------
const tun = rd(path.join(ROOT, 'overworld/sprite_tuning.json'));
const badCrop = [];
for (const id of have) for (const [side, f] of [['front', bat[id].sprite], ['back', backOf(bat[id].sprite)]]) {
	const want = cropOf(P(f)), got = tun[id]?.[side]?.crop || null;
	if (JSON.stringify(want) !== JSON.stringify(got)) badCrop.push(`${id}.${side}`);
}
A(badCrop.length === 0, 'sprite_tuning crops match every species\' own sprites', `${badCrop.length}: ${badCrop.slice(0, 10).join(',')}`);

// ---------- the design wiki's copies ----------
const wiki = rd(path.join(ROOT, 'designwiki/data/pokemon.json'));
const W = f => path.join(ROOT, 'designwiki/sprites', f);
const wikiStale = have.filter(id => wiki[id] && wiki[id].sprite === bat[id].sprite && !(ex(W(bat[id].sprite)) && fs.readFileSync(W(bat[id].sprite)).equals(fs.readFileSync(P(bat[id].sprite)))));
A(wikiStale.length === 0, 'the wiki\'s copy of every species\' front is byte-identical to the game\'s', `${wikiStale.length}: ${wikiStale.slice(0, 8).join(',')}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
