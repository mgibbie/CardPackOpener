// fakemon_sprites_test.mjs — the 623 fakemon (CAP, Pokémon Uranium, Radical Ransei;
// species with num <= 0) face AWAY from the camera as your own mon, and their battle
// art is the source pixels.
//
// Covers: tools/gen_fakemon_sprites.py, tools/data/fakemon_sprites.json,
// overworld/data/pokemon (the fakemon's <sprite> and <sprite>-b), overworld/sprite_tuning.json,
// designwiki/sprites.
//
// The bugs (2026-10-16 audit; every fakemon eyeballed front | back | source art):
//  * 214 "-b" back sprites were exactly the front MIRRORED (Radical Ransei ships its "b"
//    file that way for most of its fakemon; 5 Uranium mons had the mirror fallback although
//    the Uranium wiki has their real backs).
//  * 9 Ransei "backs" were front-facing pictures that are NOT an exact mirror (a redraw
//    looking at the camera, a second front pose, a recoloured front): your Muzafara
//    grinned at you from its own side of the field.
//  * 177 Ransei fronts/backs were LANCZOS-shrunk from 160/192px source art to 128px.
// The rule now (owner, 2026-10-16): a real back where any source has one; otherwise the
// back is EXACTLY the mirrored front — never an unmirrored or redrawn front-facing picture.
// tools/data/fakemon_sprites.json records, per fakemon, its source and which kind of back
// it has ("real" or "mirror"), and the sha1 of the files the tool wrote.
//   node overworld/tests/fakemon_sprites_test.mjs
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

// ---------- PNG -> RGBA (8-bit; every colour type, bit depths 1-16, no interlace) ----------
function decode(file) {
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
	const S = (x, y, k) => { // sample k of pixel (x,y), scaled to 0-255 (palette index for ct 3)
		if (depth === 16) return px[y * stride + (x * ch + k) * 2];
		if (depth === 8) return px[y * stride + x * ch + k];
		const bit = (x * ch + k) * depth, v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
		return ct === 3 ? v : Math.round(v * 255 / ((1 << depth) - 1));
	};
	const raw16 = (x, y, k) => depth === 16 ? px.readUInt16BE(y * stride + (x * ch + k) * 2) : null;
	const out = Buffer.alloc(w * h * 4);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		let r, g, b, a = 255;
		if (ct === 3) { const i = S(x, y, 0); r = pal[i * 3]; g = pal[i * 3 + 1]; b = pal[i * 3 + 2]; if (trns && i < trns.length) a = trns[i]; }
		else if (ct === 0 || ct === 4) { r = g = b = S(x, y, 0); if (ct === 4) a = S(x, y, 1); else if (trns) { const k = depth === 16 ? raw16(x, y, 0) : (depth === 8 ? r : S(x, y, 0) * ((1 << depth) - 1) / 255); if (k === trns.readUInt16BE(0)) a = 0; } }
		else { r = S(x, y, 0); g = S(x, y, 1); b = S(x, y, 2); if (ct === 6) a = S(x, y, 3); else if (trns) { const m = depth === 16 ? [raw16(x, y, 0), raw16(x, y, 1), raw16(x, y, 2)] : [r, g, b]; if (m[0] === trns.readUInt16BE(0) && m[1] === trns.readUInt16BE(2) && m[2] === trns.readUInt16BE(4)) a = 0; } }
		const o = (y * w + x) * 4;
		if (a) { out[o] = r; out[o + 1] = g; out[o + 2] = b; } // a fully clear pixel's colour is not drawn: zero it
		out[o + 3] = a;
	}
	return { w, h, px: out };
}
const mirror = im => { const o = Buffer.alloc(im.px.length); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) im.px.copy(o, (y * im.w + x) * 4, (y * im.w + (im.w - 1 - x)) * 4, (y * im.w + (im.w - 1 - x)) * 4 + 4); return { ...im, px: o }; };
const same = (a, b) => a.w === b.w && a.h === b.h && a.px.equals(b.px);
const visBox = im => { let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1]; };
const big = im => { const b = visBox(im); return b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0; };
// mean |difference| (0-255) of two pictures, each trimmed to its art and sampled at 48x48
function near(a, b) {
	const S = im => { const bx = visBox(im), o = []; for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) { const x = bx[0] + Math.floor((i + 0.5) * (bx[2] - bx[0]) / 48), y = bx[1] + Math.floor((j + 0.5) * (bx[3] - bx[1]) / 48), q = (y * im.w + x) * 4, al = im.px[q + 3]; o.push(im.px[q] * al / 255, im.px[q + 1] * al / 255, im.px[q + 2] * al / 255, al); } return o; };
	const p = S(a), q = S(b); let s = 0; for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]); return s / p.length;
}
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);

// ---------- the fakemon and the tool's record of them ----------
const bat = rd(path.join(D, 'species_battle.json'));
const FAKE = Object.keys(bat).filter(k => !k.startsWith('_') && !(bat[k].num > 0));
const MAN_F = path.join(ROOT, 'tools/data/fakemon_sprites.json');
const man = ex(MAN_F) ? rd(MAN_F) : {};
A(FAKE.length === 623, `${FAKE.length} fakemon`);
const unlisted = FAKE.filter(id => !man[id]);
A(unlisted.length === 0, 'every fakemon is in tools/data/fakemon_sprites.json (source + back kind)', `${unlisted.length}: ${unlisted.slice(0, 8).join(',')}`);
const bySrc = {}; for (const id of FAKE) if (man[id]) (bySrc[man[id].src] ||= []).push(id);
A(['cap', 'uranium', 'ransei'].every(s => bySrc[s]?.length) && Object.keys(bySrc).length === 3, 'sources: ' + Object.entries(bySrc).map(([s, l]) => `${s} ${l.length}`).join(', '));

const P = f => path.join(D, 'pokemon', f);
const back = f => f.replace(/\.png$/, '-b.png');
const IM = new Map();
for (const id of FAKE) { const f = P(bat[id].sprite), b = P(back(bat[id].sprite)); if (ex(f) && ex(b)) IM.set(id, { f: decode(f), b: decode(b) }); }
A(IM.size === FAKE.length, 'every fakemon has a front and a back sprite', FAKE.filter(id => !IM.has(id)).join(','));

// ---------- the back: a real back view, or EXACTLY the mirrored front ----------
const listed = FAKE.filter(id => man[id] && IM.has(id));
const mirrorBad = listed.filter(id => man[id].back === 'mirror' && !same(IM.get(id).b, mirror(IM.get(id).f)));
A(mirrorBad.length === 0, 'every fakemon with no back art anywhere uses EXACTLY its mirrored front (never a front-facing picture)', `${mirrorBad.length}: ${mirrorBad.slice(0, 12).join(',')}`);
const realBad = listed.filter(id => { if (man[id].back !== 'real') return false; const { f, b } = IM.get(id); return same(b, f) || same(b, mirror(f)) || near(b, f) < 1 || near(b, mirror(f)) < 1; });
A(realBad.length === 0, 'every fakemon recorded with a real back has one that is not its front or mirrored front', `${realBad.length}: ${realBad.slice(0, 12).join(',')}`);
const kinds = listed.filter(id => !['real', 'mirror'].includes(man[id].back));
A(kinds.length === 0, 'every record says "real" or "mirror"', kinds.join(','));
// real backs drawn on the front's mirrored OUTLINE (a silhouette check calls them mirrors; they are not)
for (const id of ['tactite', 'germuck', 'garbadjinn', 'carabomb'])
	A(man[id]?.back === 'real' && IM.has(id) && !same(IM.get(id).b, mirror(IM.get(id).f)), `${id} keeps its real back (same outline as the mirrored front, different art)`);
const nReal = listed.filter(id => man[id].back === 'real').length, nMirror = listed.filter(id => man[id].back === 'mirror').length;
A(nReal >= 400, `${nReal} fakemon have a real back (${nMirror} use the mirrored front: no back art exists for them)`);
// the 9 front-facing Ransei "backs" and the ones that had a real back available somewhere
for (const id of ['muzafara', 'laughingshadow', 'kobblegon', 'uvulentil', 'radenza'])
	A(man[id]?.back === 'mirror' && IM.has(id) && same(IM.get(id).b, mirror(IM.get(id).f)), `${id}: its old front-facing "back" is gone (mirrored front: no back art exists)`);
for (const id of ['zephy', 'aotius', 'mutios', 'baitatao', 'leviathao'])
	A(man[id]?.back === 'real' && IM.has(id) && !same(IM.get(id).b, mirror(IM.get(id).f)), `${id} has its real back sprite (was the mirrored front)`);

// the old front-facing pictures (sha1 of the files before the fix) are nowhere
const OLD_FRONT_FACING = new Set([
	// uvulentil, rocmynah, radenza, cackleburn, muzafara, conifur, poddit, kobblegon, laughingshadow
	// (tools/gen_fakemon_sprites.py FRONT_FACING; originals in backups/fakemon/)
	'a33a292211f7', 'a386140ed9c6', '7f94f813e106', 'd520a489baad', 'e32c10379482', '933c90da7278', '53c2ef2a5885', '6f43defcb60e', 'd9cebf7ddcb5',
]);
const stillOld = FAKE.filter(id => IM.has(id)).filter(id => OLD_FRONT_FACING.has(sha(P(back(bat[id].sprite)))));
A(stillOld.length === 0, 'no fakemon back is one of the old front-facing pictures', stillOld.join(','));

// ---------- the files are the tool's output (source pixels, not the 128px LANCZOS shrink) ----------
const drift = listed.filter(id => man[id].frontSha !== sha(P(bat[id].sprite)) || man[id].backSha !== sha(P(back(bat[id].sprite))));
A(drift.length === 0, 'every fakemon sprite is the one tools/gen_fakemon_sprites.py wrote (re-run it after changing one)', `${drift.length}: ${drift.slice(0, 10).join(',')}`);
const capped = listed.filter(id => man[id].src === 'ransei' && (!man[id].srcFront || IM.get(id).f.w !== man[id].srcFront[0] || IM.get(id).f.h !== man[id].srcFront[1]));
A(capped.length === 0, 'no Ransei front is still the importer\'s 128px LANCZOS shrink of taller source art', capped.slice(0, 10).join(','));

// ---------- size: real battle art, not icons ----------
const tiny = listed.filter(id => big(IM.get(id).f) < 24 || big(IM.get(id).b) < 24);
A(tiny.length === 0, 'every fakemon front and back is >= 24px of art', tiny.join(','));
const icon = listed.filter(id => big(IM.get(id).f) < 0.6 * big(IM.get(id).b));
A(icon.length === 0, 'no fakemon front is icon-sized next to its own back (< 0.6x)', icon.map(id => `${id} ${big(IM.get(id).f)}/${big(IM.get(id).b)}`).join(', '));

// ---------- battle tuning crops measured on the fakemon's own files ----------
const cropOf = im => {
	const b = visBox(im); if (!b) return null;
	const bw = b[2] - b[0], bh = b[3] - b[1], gap = im.h - b[3], cxOff = (b[0] + b[2]) / 2 - im.w / 2;
	if (Math.max(bw, bh) / Math.max(im.w, im.h) >= 0.9 && gap / im.h <= 0.03 && Math.abs(cxOff) / im.w <= 0.05) return null;
	const r = v => Math.round(v * 1000) / 1000;
	return [r(b[0] / im.w), r(b[1] / im.h), r(bw / im.w), r(bh / im.h)];
};
const tun = rd(path.join(ROOT, 'overworld/sprite_tuning.json'));
const badCrop = [];
for (const id of listed) for (const side of ['front', 'back']) {
	const want = cropOf(side === 'front' ? IM.get(id).f : IM.get(id).b), got = tun[id]?.[side]?.crop || null;
	if (JSON.stringify(want) !== JSON.stringify(got)) badCrop.push(`${id}.${side}`);
}
A(badCrop.length === 0, 'sprite_tuning crops match every fakemon\'s own sprites', `${badCrop.length}: ${badCrop.slice(0, 10).join(',')}`);
A(listed.every(id => tun[id]?.front?.s === 0.3 && tun[id]?.back?.s === 0.3 && tun[id]?.back?.y === 16), 'the global hand tuning (s 0.3, back y 16) is kept on every fakemon');

// ---------- the design wiki's copies ----------
const W = f => path.join(ROOT, 'designwiki/sprites', f);
const wikiStale = listed.filter(id => !(ex(W(bat[id].sprite)) && fs.readFileSync(W(bat[id].sprite)).equals(fs.readFileSync(P(bat[id].sprite)))));
A(wikiStale.length === 0, 'the wiki\'s copy of every fakemon front is byte-identical to the game\'s', `${wikiStale.length}: ${wikiStale.slice(0, 8).join(',')}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
