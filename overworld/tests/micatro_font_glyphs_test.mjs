// micatro_font_glyphs_test.mjs — Micatro's pixel font draws the gender signs ♀ (U+2640) and ♂ (U+2642).
// m6x11plus had neither, so "Nidoran♀" or Burmy's "(Currently Plant Cloak, ♂)" fell back to another font (the owner: "I don't
// want this, get the symbols"). tools/micatro/add_gender_glyphs.py draws both on the font's pixel grid, from the original
// (tools/micatro/specs/m6x11plus_original.ttf), into micatro/assets/fonts/m6x11plus.ttf.
// Part 1 (no browser): the patched TTF maps U+2640 / U+2642 to pixel-grid outlines that are exactly the script's bitmaps, and
//   every other glyph (its stored bytes, its advance, its code points) and the name table are unchanged from the original.
// Part 2 (Chrome): the game draws them with OUR glyphs, not a fallback — a canvas fillText in 'm6x11' (the card-face path,
//   micatro/js/ui/cardsprite.js) matches the bitmaps pixel for pixel, DOM text (css/micatro.css @font-face) has our advances,
//   the font is fetched once at the versioned URL (index.html preload = micatro.css = js/ui/assets.js FONT_FILE), and a Burmy
//   tooltip / Nidoran's name show the signs.
//   node overworld/tests/micatro_font_glyphs_test.mjs        [MICATRO_SHOTS=<dir> saves screenshots]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SHOTS = process.env.MICATRO_SHOTS || process.env.SHOTS || null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8759;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

// ------------------------------------------------------------------ a minimal TrueType reader (cmap 4, loca, glyf, hmtx, name)
function readTTF(file) {
	const b = fs.readFileSync(file);
	const n = b.readUInt16BE(4), T = {};
	for (let i = 0; i < n; i++) { const o = 12 + 16 * i; T[b.toString('latin1', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) }; }
	const tab = (t) => b.subarray(T[t].off, T[t].off + T[t].len);
	const head = tab('head'), maxp = tab('maxp'), hhea = tab('hhea'), hmtx = tab('hmtx'), loca = tab('loca'), glyf = tab('glyf');
	const upm = head.readUInt16BE(18), longLoca = head.readInt16BE(50) === 1, numGlyphs = maxp.readUInt16BE(4), nH = hhea.readUInt16BE(34);
	const locaAt = (i) => (longLoca ? loca.readUInt32BE(4 * i) : 2 * loca.readUInt16BE(2 * i));
	const advance = (g) => hmtx.readUInt16BE(4 * Math.min(g, nH - 1));
	const raw = (g) => glyf.subarray(locaAt(g), locaAt(g + 1));
	// every format-4 subtable: code point -> glyph id
	const cmaps = [];
	const cm = tab('cmap');
	for (let i = 0; i < cm.readUInt16BE(2); i++) {
		const pid = cm.readUInt16BE(4 + 8 * i), eid = cm.readUInt16BE(6 + 8 * i), so = cm.readUInt32BE(8 + 8 * i);
		if (cm.readUInt16BE(so) !== 4) continue;
		const segX2 = cm.readUInt16BE(so + 6), ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
		const map = new Map();
		for (let s = 0; s < segX2 / 2; s++) {
			const end = cm.readUInt16BE(ends + 2 * s), start = cm.readUInt16BE(starts + 2 * s), delta = cm.readInt16BE(deltas + 2 * s), ro = cm.readUInt16BE(ranges + 2 * s);
			for (let c = start; c <= end && c !== 0xffff; c++) {
				let g;
				if (ro === 0) g = (c + delta) & 0xffff;
				else { const at = ranges + 2 * s + ro + 2 * (c - start); g = cm.readUInt16BE(at); if (g) g = (g + delta) & 0xffff; }
				if (g) map.set(c, g);
			}
		}
		cmaps.push({ pid, eid, map });
	}
	// a simple glyph's outline: contours of {x, y, on}
	function outline(g) {
		const d = raw(g);
		if (!d.length) return [];
		const nc = d.readInt16BE(0);
		if (nc < 0) throw new Error('composite glyph ' + g);
		const endPts = []; for (let i = 0; i < nc; i++) endPts.push(d.readUInt16BE(10 + 2 * i));
		const np = endPts.length ? endPts[nc - 1] + 1 : 0;
		let p = 10 + 2 * nc; const il = d.readUInt16BE(p); p += 2 + il;
		const flags = [];
		while (flags.length < np) { const f = d[p++]; flags.push(f); if (f & 8) { let r = d[p++]; while (r--) flags.push(f); } }
		const xs = [], ys = [];
		for (const [arr, SHORT, SAME] of [[xs, 2, 16], [ys, 4, 32]]) {
			let v = 0;
			for (const f of flags) {
				if (f & SHORT) { const dv = d[p++]; v += (f & SAME) ? dv : -dv; }
				else if (!(f & SAME)) { v += d.readInt16BE(p); p += 2; }
				arr.push(v);
			}
		}
		const out = []; let s = 0;
		for (const e of endPts) { out.push(flags.slice(s, e + 1).map((f, i) => ({ x: xs[s + i], y: ys[s + i], on: !!(f & 1) }))); s = e + 1; }
		return out;
	}
	const name = tab('name');
	return { upm, numGlyphs, advance, raw, cmaps, outline, name };
}
/** Rasterise an outline on the pixel grid (even-odd at each pixel centre): rows top first, '#' lit, from the baseline. */
function raster(contours, px, base, rows, cols) {
	const inside = (x, y) => {
		let w = 0;
		for (const c of contours) for (let i = 0; i < c.length; i++) {
			const a = c[i], b = c[(i + 1) % c.length];
			if ((a.y <= y) !== (b.y <= y) && a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y) > x) w++;
		}
		return w % 2 === 1;
	};
	const out = [];
	for (let r = rows - 1; r >= 0; r--) { let l = ''; for (let c = 0; c < cols; c++) l += inside(c * px + px / 2, base + r * px + px / 2) ? '#' : '.'; out.push(l); }
	return out;
}

const ORIG = path.join(ROOT, 'tools/micatro/specs/m6x11plus_original.ttf');
const FONT = path.join(ROOT, 'micatro/assets/fonts/m6x11plus.ttf');
const o = readTTF(ORIG), f = readTTF(FONT);
const PX = 64, BASE = -128, CAP = 11;
// the bitmaps, from the script that draws them (one source of truth)
const py = fs.readFileSync(path.join(ROOT, 'tools/micatro/add_gender_glyphs.py'), 'utf8');
const BITMAPS = {};
for (const cp of [0x2640, 0x2642]) {
	const m = py.match(new RegExp('0x' + cp.toString(16) + ":\\s*\\('\\w+',\\s*\\[([^\\]]*)\\]"));
	BITMAPS[cp] = m ? [...m[1].matchAll(/'([.#]+)'/g)].map((x) => x[1]) : null;
}

// ------------------------------------------------------------------ part 1: the font file
A(o.upm === 1024 && f.upm === 1024, 'unitsPerEm 1024 in both (1 pixel = 64 units)', [o.upm, f.upm]);
A(f.numGlyphs === o.numGlyphs + 2, 'the patched font has the original glyphs + 2', [o.numGlyphs, f.numGlyphs]);
A(f.name.equals(o.name), 'the name table is byte-identical (still "m6x11plus", Daniel Linssen)');
const oMap = o.cmaps.find((c) => c.pid === 3) || o.cmaps[0];
let changed = [];
for (let g = 0; g < o.numGlyphs; g++) {
	const a = o.raw(g), b = f.raw(g);
	const strip = (x) => { let e = x.length; while (e > 0 && x[e - 1] === 0) e--; return x.subarray(0, e); };
	if (!strip(a).equals(strip(b)) || o.advance(g) !== f.advance(g)) changed.push(g);
}
A(changed.length === 0, `all ${o.numGlyphs} original glyphs are unchanged (stored outline bytes + advance, glyph by glyph)`, changed.slice(0, 10));
for (const sub of f.cmaps) {
	const lost = [...oMap.map].filter(([c, g]) => sub.map.get(c) !== g);
	A(lost.length === 0, `cmap ${sub.pid}/${sub.eid}: every original code point maps to the same glyph`, lost.slice(0, 5));
	A(sub.map.size === oMap.map.size + 2, `cmap ${sub.pid}/${sub.eid}: exactly two new code points`, [oMap.map.size, sub.map.size]);
}
const gO = f.advance(oMap.map.get(0x4f));
for (const cp of [0x2640, 0x2642]) {
	const ch = String.fromCodePoint(cp), want = BITMAPS[cp];
	A(want && want.length === CAP, `${ch}: the script's bitmap is ${CAP} rows (the capital height)`, want);
	const gid = f.cmaps[0].map.get(cp);
	A(gid >= o.numGlyphs && f.cmaps.every((c) => c.map.get(cp) === gid), `${ch} U+${cp.toString(16).toUpperCase()}: mapped in every cmap subtable, to a new glyph`, gid);
	if (!gid || !want) continue;
	const cs = f.outline(gid), pts = cs.flat();
	A(cs.length > 0 && pts.every((p) => p.on && p.x % PX === 0 && (p.y - BASE) % PX === 0), `${ch}: every outline point is on the pixel grid (on-curve, multiples of 64 from the baseline)`);
	A(cs.every((c) => c.every((p, i) => { const q = c[(i + 1) % c.length]; return p.x === q.x || p.y === q.y; })), `${ch}: straight horizontal / vertical edges only (pixel rectangles, like the font's own outlines)`);
	A(Math.min(...pts.map((p) => p.y)) === BASE && Math.max(...pts.map((p) => p.y)) === BASE + CAP * PX && Math.min(...pts.map((p) => p.x)) === 0,
		`${ch}: sits on the baseline, capital height (as O), from x = 0`, [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))]);
	const got = raster(cs, PX, BASE, CAP, want[0].length);
	A(got.join('\n') === want.join('\n'), `${ch}: the outline is exactly the script's pixel art`, '\n' + got.join('\n'));
	A(f.advance(gid) === PX * (Math.max(...want.map((r) => r.replace(/\.+$/, '').length)) + 1),
		`${ch}: advance = ink + one blank column (${f.advance(gid) / PX} px; O is ${gO / PX})`, f.advance(gid));
}
// the three places that load the font use one versioned URL
const css = fs.readFileSync(path.join(ROOT, 'micatro/css/micatro.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'micatro/index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'micatro/js/ui/assets.js'), 'utf8');
const vCss = (css.match(/m6x11plus\.ttf(\?v=\w+)?'/) || [])[1], vHtml = (html.match(/m6x11plus\.ttf(\?v=\w+)?"/) || [])[1], vJs = (js.match(/FONT_FILE = 'fonts\/m6x11plus\.ttf(\?v=\w+)?'/) || [])[1];
A(vCss && vCss === vHtml && vHtml === vJs, 'micatro.css @font-face, index.html preload and assets.js FONT_FILE load the same versioned URL (cache-bust)', [vCss, vHtml, vJs]);

// ------------------------------------------------------------------ part 2: Chrome draws OUR glyphs
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.fs': 'text/plain', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const p = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
try {
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.log('pageerror', e.message));
	await page.setViewport({ width: 1280, height: 800 });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(() => document.fonts.ready);

	// the canvas path (cardsprite.js: ctx.font = '<n>px m6x11, monospace'): 16 px = 1 canvas pixel per font pixel; at 32 px each
	// font pixel is a 2 x 2 block, so the lit blocks read back the bitmap exactly. A fallback font would draw something else.
	const canvasRead = (ch, family) => page.evaluate((ch, family) => {
		const S = 2, c = document.createElement('canvas'); c.width = 40; c.height = 40;
		const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 40, 40);
		x.font = (16 * S) + 'px ' + family; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
		const BL = 4 + 9 * S; // the alphabetic baseline: m6x11plus capitals stand 9 px above y = 0 and 2 below (O: y -128..576)
		x.fillText(ch, 0, BL);
		const d = x.getImageData(0, 0, 40, 40).data, rows = [];
		for (let r = 0; r < 11; r++) { let l = ''; for (let col = 0; col < 9; col++) { const px = 4 * ((4 + r * S + 1) * 40 + col * S + 1); l += d[px] > 127 ? '#' : '.'; } rows.push(l); }
		return { rows, width: x.measureText(ch).width / S };
	}, ch, family);
	for (const cp of [0x2640, 0x2642]) {
		const ch = String.fromCodePoint(cp), want = BITMAPS[cp];
		const pad = (r) => (r + '.........').slice(0, 9);
		const got = await canvasRead(ch, 'm6x11');
		A(got.rows.join('\n') === want.map(pad).join('\n'), `canvas: fillText('${ch}') in m6x11 draws our pixel art`, '\n' + got.rows.join('\n'));
		const gid = f.cmaps[0].map.get(cp);
		A(Math.abs(got.width - f.advance(gid) / PX) < 0.01, `canvas: measureText('${ch}') is our advance (${f.advance(gid) / PX} px at 16 px)`, got.width);
		const fb = await canvasRead(ch, 'monospace');
		A(fb.rows.join('\n') !== got.rows.join('\n'), `canvas: a fallback font draws '${ch}' differently (so the match above is ours)`);
	}
	// DOM text (css/micatro.css @font-face 'm6x11'): a 16 px span's width is the sum of our advances, signs included
	const domW = await page.evaluate(() => {
		const s = document.createElement('span'); s.style.cssText = "font: 16px 'm6x11'; position: absolute; left: 0; top: 0; white-space: pre; letter-spacing: 0";
		document.body.appendChild(s);
		const w = {}; for (const t of ['Nidoran\u2640', 'Nidoran\u2642', '\u2640\u2642', 'Nidoran']) { s.textContent = t; w[t] = s.getBoundingClientRect().width; }
		s.remove(); return w;
	});
	const adv = (t) => [...t].reduce((n, c) => n + f.advance(f.cmaps[0].map.get(c.codePointAt(0)) || 0), 0) / PX;
	for (const t of Object.keys(domW)) A(Math.abs(domW[t] - adv(t)) < 0.01, `DOM: "${t}" in m6x11 at 16 px is ${adv(t)} px wide (our glyphs, no fallback)`, domW[t]);
	A(await page.evaluate(() => document.fonts.check("16px 'm6x11'", '\u2640\u2642')), 'document.fonts.check: m6x11 is loaded for ♀♂');
	// fetched once, at the versioned URL (the preload, the @font-face and the FontFace all share it)
	const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /m6x11plus\.ttf/.test(n)));
	A(urls.length === 1 && urls[0].endsWith('m6x11plus.ttf' + vJs), 'the font is fetched once, at its versioned URL', urls);

	// the game: Burmy's tooltip and Nidoran's names
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'GLYPHS', back: 'b_red', mods: ['pokermon'] }); });
	await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const b = C.add_joker('j_poke_burmy'); b.ability.extra.gender = 'male';
		C.add_joker('j_poke_nidoranf'); C.add_joker('j_poke_nidoranm');
		C.G.E_MANAGER.flush();
		await window.__micatro.act({ type: 'select_blind' });
	});
	await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 });
	const settle = () => waitFor(() => page.evaluate(() => {
		for (const sp of window.__micatro.board.sprites.values()) {
			if (sp.leaving) continue;
			const T = sp.T, g = sp.tgt;
			if (sp.dragging || sp.juice || sp.flipAnim || Math.abs(T.x - g.x) > 0.5 || Math.abs(T.y - g.y) > 0.5) return false;
		}
		return true;
	}), 20000);
	for (const [i, key, want, shot] of [[0, 'j_poke_burmy', /Cloak, ♂\).*♀ into Wormadam, ♂ into Mothim/, 'burmy_tooltip.png'], [1, 'j_poke_nidoranf', /^Nidoran♀/, 'nidoranf_card.png'], [2, 'j_poke_nidoranm', /^Nidoran♂/, 'nidoranm_card.png']]) {
		const id = await page.evaluate(async (i) => { const C = await import('/micatro/js/engine/core.js'); return C.G.jokers.cards[i].sort_id; }, i);
		const sel = `.card[data-id="${id}"]`;
		await page.waitForSelector(sel, { timeout: 5000 });
		await settle();
		await page.click(sel);
		await sleep(500);
		const tip = await page.evaluate(() => {
			const t = document.querySelector('.tip');
			if (!t || t.style.display === 'none') return null;
			const nm = t.querySelector('.tip-name, .name, h1, h2, h3') || t.firstElementChild;
			return { text: t.textContent.replace(/\s+/g, ' ').trim(), font: getComputedStyle(t).fontFamily, name: nm ? nm.textContent.trim() : '' };
		});
		A(tip && want.test(tip.text), `${key}: its tooltip shows the sign(s)`, tip && tip.text.slice(0, 300));
		A(tip && /m6x11/.test(tip.font), `${key}: the tooltip is set in m6x11`, tip && tip.font);
		A(tip && !/Female|Male|Nidoran [FM]\b/.test(tip.text), `${key}: no "Female" / "Male" / "Nidoran F" words`, tip && tip.text.slice(0, 200));
		if (SHOTS) {
			const box = await page.evaluate((sel) => {
				const r = [document.querySelector(sel), document.querySelector('.tip')].map((e) => e.getBoundingClientRect());
				const x = Math.max(0, Math.min(r[0].left, r[1].left) - 12), y = Math.max(0, Math.min(r[0].top, r[1].top) - 12);
				return { x, y, width: Math.min(innerWidth - x, Math.max(r[0].right, r[1].right) + 12 - x), height: Math.min(innerHeight - y, Math.max(r[0].bottom, r[1].bottom) + 12 - y) };
			}, sel);
			await page.screenshot({ path: path.join(SHOTS, shot), clip: box });
		}
		await page.evaluate(() => document.querySelector('.stage, #stage, body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
		await sleep(250);
	}
	await page.close();
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
