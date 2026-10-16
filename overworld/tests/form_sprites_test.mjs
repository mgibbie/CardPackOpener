// form_sprites_test.mjs — every alternate form wears its OWN art everywhere: battle
// front + back, the overworld walk sheet (follower) and standing sprite, the
// species index, the battle sprite tuning, and the design wiki.
//
// Covers: tools/gen_form_sprites.py, tools/fix_form_sprites.mjs, tools/gen_designwiki.mjs,
// overworld/ow_follower.js (followSheet), overworld/battle.js (loadSprite),
// overworld/encounters.js (species_index.json), overworld/npcs.js + overworld/pokemon_ow_index.json,
// overworld/sprite_tuning.json, designwiki/sprites, overworld/data/species_index.json,
// overworld/data/pokemon, overworld/data/pokemon_follow, overworld/data/pokemon_ow.
//
// The bugs (2026-10-16, "swap in the real hisuian qwilfish sprite in the overworld too"):
//  * 99 form FRONT sprites were 14–40px minisprites (box-icon art, upscaled to a
//    chunky blur in battle); urshifu_rapid_strike was byte-identical to Urshifu.
//  * 81 forms had no BACK sprite: battle.js loadSprite fell back to the FRONT, so
//    your own Hisuian Qwilfish faced the camera.
//  * No form had a walk sheet / overworld sprite: a Hisuian Qwilfish followed you
//    as a plain Qwilfish (ow_follower.js falls back to the base species' sheet).
//  * species_index.json still gave 103 forms the base species' sprite.
//  * sprite_tuning.json's per-form crops were measured on the BASE sprite.
//  * The wiki's own sprite copies must be byte-identical to the game's.
//   node overworld/tests/form_sprites_test.mjs
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
// sprite-audit.cjs's crop: [x,y,w,h] canvas fractions, or null when "close enough"
function cropOf(file) {
	const { w, h, box } = png(file);
	if (!box) return null;
	const bw = box[2] - box[0], bh = box[3] - box[1], gap = h - box[3], cxOff = (box[0] + box[2]) / 2 - w / 2;
	if (Math.max(bw, bh) / Math.max(w, h) >= 0.9 && gap / h <= 0.03 && Math.abs(cxOff) / w <= 0.05) return null;
	const r = v => Math.round(v * 1000) / 1000;
	return [r(box[0] / w), r(box[1] / h), r(bw / w), r(bh / h)];
}

// ---------- the forms (the same rule as tools/fix_form_sprites.mjs) ----------
const bat = rd(path.join(D, 'species_battle.json'));
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const baseByNum = new Map();
for (const id of ALL) { const n = bat[id].num; if (n > 0 && !/_/.test(id) && !baseByNum.has(n)) baseByNum.set(n, id); }
const forms = ALL.filter(id => /_/.test(id) && bat[id].num > 0 && baseByNum.has(bat[id].num) && baseByNum.get(bat[id].num) !== id);
const baseOf = id => baseByNum.get(bat[id].num);
const P = f => path.join(D, 'pokemon', f);
const backOf = f => f.replace(/\.(png|gif)$/, '-b.$1');
A(forms.length >= 130, `${forms.length} alternate forms`);

// ---------- battle FRONT ----------
const noFront = forms.filter(id => !ex(P(bat[id].sprite)));
A(noFront.length === 0, 'every form\'s front sprite exists', noFront.join(','));
// true cosmetic duplicates (same picture in the real games) would go here — none
const COSMETIC_DUP = new Set([]);
const dupFront = forms.filter(id => !COSMETIC_DUP.has(id) && same(P(bat[id].sprite), P(bat[baseOf(id)].sprite)));
A(dupFront.length === 0, 'every form\'s front art differs from its base species\'', `${dupFront.length}: ${dupFront.join(',')}`);
// a 14–40px minisprite drawn into the 96px battle box is a blur of fat pixels.
// Real art is >= 40px, or (a small species: Diglett, Minior) >= 3/4 of its base's;
// Unown letters are small glyphs everywhere, so they need >= 22px (theirs were 15-23).
const big = f => { const b = png(f).box; return b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0; };
const mini = forms.filter(id => {
	const v = big(P(bat[id].sprite));
	if (/^unown_/.test(id)) return v < 22;
	return v < Math.min(40, 0.75 * big(P(bat[baseOf(id)].sprite)));
});
A(mini.length === 0, 'no form front is a minisprite', `${mini.length}: ${mini.slice(0, 12).join(',')}`);
// the HD Hisui/Paldea art sat at the bottom of ~110x250 canvases: a tall empty box
// on the wiki and in menus
const padded = forms.filter(id => { const { w, h } = png(P(bat[id].sprite)); return big(P(bat[id].sprite)) < 0.9 * Math.max(w, h); });
A(padded.length === 0, 'form fronts are trimmed to their art (no tall empty canvas)', `${padded.length}: ${padded.slice(0, 8).join(',')}`);

// ---------- battle BACK (the player's own mon) ----------
const noBack = forms.filter(id => !ex(P(backOf(bat[id].sprite))));
A(noBack.length === 0, 'every form has its own back sprite (else battle.js draws the FRONT for your mon)', `${noBack.length}: ${noBack.slice(0, 12).join(',')}`);
const dupBack = forms.filter(id => !noBack.includes(id) && same(P(backOf(bat[id].sprite)), P(backOf(bat[baseOf(id)].sprite))));
A(dupBack.length === 0, 'and that back art differs from the base species\' back', dupBack.join(','));
const tinyBack = forms.filter(id => !noBack.includes(id) && (() => { const b = png(P(backOf(bat[id].sprite))).box; return !b || Math.max(b[2] - b[0], b[3] - b[1]) < 16; })());
A(tinyBack.length === 0, 'and is real art, not an empty/minute canvas', tinyBack.join(','));

// ---------- species_index.json agrees with species_battle.json ----------
const si = rd(path.join(D, 'species_index.json'));
const stale = ALL.filter(id => si[id] && bat[id].sprite && si[id].sprite !== bat[id].sprite);
A(stale.length === 0, 'species_index.json sprites match species_battle.json', `${stale.length}: ${stale.slice(0, 8).join(',')}`);

// ---------- overworld: walk sheet (follower) + standing sprite ----------
// The forms the Essentials packs have no walk sheet for. All but Unown K are
// battle-only transformations; the follower renders the BASE species' sheet
// (ow_follower.js followSheet: `id.split('_')[0]`), which is what you see in the
// overworld in the games too (Aegislash walks in Shield Forme, Castform un-weathered).
const OW_FALLBACK = new Set(['aegislash_blade', 'castform_rainy', 'castform_snowy', 'castform_sunny', 'darmanitan_galar_zen',
	'darmanitan_zen', 'eiscue_noice', 'necrozma_ultra', 'unown_k', 'wishiwashi_school', 'zygarde_complete']);
const F = id => path.join(D, 'pokemon_follow', id + '.png'), O = id => path.join(D, 'pokemon_ow', id + '.png');
const noFollow = forms.filter(id => !OW_FALLBACK.has(id) && !ex(F(id)));
A(noFollow.length === 0, 'every form has its own follower walk sheet', `${noFollow.length}: ${noFollow.slice(0, 12).join(',')}`);
const noOw = forms.filter(id => !OW_FALLBACK.has(id) && !ex(O(id)));
A(noOw.length === 0, 'every form has its own standing overworld sprite', `${noOw.length}: ${noOw.slice(0, 12).join(',')}`);
const badSheet = forms.filter(id => ex(F(id)) && (({ w, h }) => w !== 128 || h !== 128)(png(F(id))));
A(badSheet.length === 0, 'walk sheets are the renderer\'s 128x128 (4x4 of 32px frames)', badSheet.join(','));
const badOw = forms.filter(id => ex(O(id)) && png(O(id)).h !== 40);
A(badOw.length === 0, 'standing sprites are the importer\'s 40px tall', badOw.join(','));
const dupFollow = forms.filter(id => ex(F(id)) && same(F(id), F(baseOf(id))));
A(dupFollow.length === 0, 'and no form walk sheet is just its base\'s', dupFollow.join(','));
// the documented fallback really renders: the base sheet exists and the code still falls back
const fbBase = [...OW_FALLBACK].filter(id => !ex(F(id.split('_')[0])));
A(fbBase.length === 0, 'every fallback form\'s base walk sheet exists', fbBase.join(','));
A(/a FORM falls back to its base species' walk sheet[\s\S]{0,200}split\('_'\)\[0\]/.test(fs.readFileSync(path.join(ROOT, 'overworld/ow_follower.js'), 'utf8')),
	'ow_follower.js still falls back to the base walk sheet for those');
const owIdx = new Set(rd(path.join(ROOT, 'overworld/pokemon_ow_index.json')));
const unindexed = forms.filter(id => ex(O(id)) && !owIdx.has(id));
A(unindexed.length === 0, 'pokemon_ow_index.json lists every form with an overworld sprite', unindexed.join(','));
// spot check: the owner's report
A(ex(F('qwilfish_hisui')) && !same(F('qwilfish_hisui'), F('qwilfish')), 'Hisuian Qwilfish follows you as Hisuian Qwilfish');

// ---------- battle sprite tuning: crops measured on the form's OWN files ----------
const tun = rd(path.join(ROOT, 'overworld/sprite_tuning.json'));
const badCrop = [];
for (const id of forms) {
	for (const [side, f] of [['front', bat[id].sprite], ['back', backOf(bat[id].sprite)]]) {
		if (!ex(P(f))) continue;
		const want = cropOf(P(f)), have = tun[id]?.[side]?.crop || null;
		if (JSON.stringify(want) !== JSON.stringify(have)) badCrop.push(`${id}.${side}`);
	}
}
A(badCrop.length === 0, 'sprite_tuning crops match each form\'s own sprites', `${badCrop.length}: ${badCrop.slice(0, 8).join(',')}`);

// ---------- the design wiki ----------
const wiki = rd(path.join(ROOT, 'designwiki/data/pokemon.json'));
const W = f => path.join(ROOT, 'designwiki/sprites', f);
const wikiMissing = Object.values(wiki).map(p => p.sprite).filter(Boolean).filter(f => !ex(W(f)));
A(wikiMissing.length === 0, 'the wiki references only sprites it ships', wikiMissing.slice(0, 6).join(','));
const wikiWrong = forms.filter(id => wiki[id] && wiki[id].sprite !== bat[id].sprite);
A(wikiWrong.length === 0, 'the wiki points every form at the game\'s sprite', wikiWrong.join(','));
const wikiStale = forms.filter(id => wiki[id] && ex(W(wiki[id].sprite)) && !same(W(wiki[id].sprite), P(bat[id].sprite)));
A(wikiStale.length === 0, 'and its copy of each form sprite is byte-identical to the game\'s', `${wikiStale.length}: ${wikiStale.slice(0, 8).join(',')}`);
A(/readFileSync\(src\)|!same|equals\(/.test(fs.readFileSync(path.join(ROOT, 'tools/gen_designwiki.mjs'), 'utf8')),
	'gen_designwiki.mjs refreshes changed sprites, not only missing ones');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
