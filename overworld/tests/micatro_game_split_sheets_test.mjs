// micatro_game_split_sheets_test.mjs — a Micatro RUN draws mod art from the pre-split sheet blocks, never a whole sheet
// (2026-10-27, follow-up to #837, which did it for the deck editor). Before: a Pokermon run on a phone decoded the whole
// Natdex joker sheet (4260 x 13110 px = 213 MB decoded) and kept it for the session, plus other big sheets — iOS Safari
// crash territory. Now every cell of a pre-split sheet (tools/micatro/split_mod_atlases.mjs, js/mods/split_sheets.js) is
// read from its small block, kept as a small per-card crop (an LRU) and the block let go.
//   - phone portrait (390 x 844, CPU x4), Pokermon + Nacho + Pokermon+, a seeded run: several blinds won, shops rerolled,
//     packs opened, jokers bought, Run Info + the Pokédex browsed — no whole pre-split sheet is ever decoded, the peak of
//     decoded mod images stays under budget and, settled, under the steady budget
//   - pixel identity: representative cards drawn from the blocks == drawn from the whole sheets (assets.js setModBlocks):
//     a Pokermon joker, its Shiny, a Legendary with its floating soul, a Series A card, a Nacho and a Pokermon+ joker, a
//     Pokermon consumable and a sleeve, at the card size and smaller sizes
// Covers micatro/js/ui/assets.js (drawModCell blocks, keepBlock, setModBlocks), micatro/js/ui/cardsprite.js,
// micatro/js/ui/board.js, micatro/js/ui/screens.js, micatro/js/mods/split_sheets.js — named here so
// `run-all.mjs --changed` selects this suite.
//   node overworld/tests/micatro_game_split_sheets_test.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8757;
const SHOTS = process.env.MICATRO_SHOTS || path.join(os.tmpdir(), 'micatro-gameblocks-shots');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const MODS = ['pokermon', 'nacho', 'pokermonplus'];
const PEAK_MB = 60, STEADY_MB = 30;   // decoded mod images: at most, and settled (the Natdex sheet alone is 213 MB)
const ROUNDS = Number(process.env.ROUNDS || 4);
const CPU = Number(process.env.CPU || 4);

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"error":"offline"}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=3600' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	await page.evaluateOnNewDocument((mods) => {
		// every mod image the page decodes (a whole sheet, or a block of a pre-split one), and the most alive at once
		const I = window.Image, imgs = [];
		window.__modLoads = []; window.__modPeakMB = 0;
		window.Image = function (...a) { const im = new I(...a); imgs.push(im); im.addEventListener('load', () => { if (/\/mods\//.test(im.src)) window.__modLoads.push({ src: decodeURIComponent(im.src), w: im.naturalWidth, h: im.naturalHeight }); }); return im; };
		window.Image.prototype = I.prototype;
		window.__modAliveMB = () => imgs.filter((i) => /\/mods\//.test(i.src) && i.complete && i.naturalWidth).reduce((n, i) => n + i.naturalWidth * i.naturalHeight * 4, 0) / 1048576;
		window.__modPending = () => imgs.filter((i) => /\/mods\//.test(i.src) && !i.complete).length;
		setInterval(() => { window.__modPeakMB = Math.max(window.__modPeakMB, window.__modAliveMB()); }, 25);
		// frame pacing: the longest gap between animation frames, and how many frames were over 50 ms
		window.__frames = { n: 0, slow: 0, worst: 0, last: 0 };
		const tick = (t) => { const F = window.__frames; if (F.last) { const g = t - F.last; F.n++; if (g > 50) F.slow++; F.worst = Math.max(F.worst, g); } F.last = t; requestAnimationFrame(tick); };
		requestAnimationFrame(tick);
		try {
			localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
			for (const k of ['micatro_run_v1', 'magepunk_mp_token_v1']) localStorage.removeItem(k);
			localStorage.setItem('micatro_mods', JSON.stringify({ ids: mods, options: {} }));
		} catch { }
	}, MODS);
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
	const settle = async (ms = 20000) => {
		await waitFor(() => page.evaluate(() => window.__micatro.idle() && window.__modPending() === 0), ms);
		await sleep(150);
		await waitFor(() => page.evaluate(() => window.__micatro.idle() && window.__modPending() === 0), ms);
	};
	const act = (a) => page.evaluate((a) => window.__micatro.act(a), a);
	const view = () => page.evaluate(() => { const v = window.__micatro.view(); return { state: v.state, dollars: v.dollars, areas: Object.fromEntries(Object.entries(v.areas).map(([k, l]) => [k, l.map((c) => ({ id: c.id, center: c.center, cost: c.cost }))])) }; });
	const shot = async (name) => { await sleep(300); const p = path.join(SHOTS, name + '.png'); await page.screenshot({ path: p }); console.log('  shot: ' + p); };

	await page.evaluate(async (mods) => { await window.__micatro.loadMods(mods); await window.__micatro.newRun({ seed: 'GAMEBLOCKS', back: 'b_red', mods }); }, MODS);
	await waitFor(() => page.evaluate(() => window.__micatro.session && window.__micatro.view().state === 'BLIND_SELECT'), 60000);
	const cdp = await page.createCDPSession();
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
	await page.evaluate(() => { window.__frames = { n: 0, slow: 0, worst: 0, last: 0 }; });
	const t0 = Date.now();
	await settle();
	let shops = 0, packs = 0, bought = 0, rerolls = 0;
	for (let round = 0; round < ROUNDS; round++) {
		await act({ type: 'select_blind' });
		await settle();
		await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; C.G.GAME.dollars = 200; const v = window.__micatro.view(); return window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[0].id] }); });
		await act({ type: 'play' });
		await waitFor(() => page.evaluate(() => ['SHOP', 'ROUND_EVAL'].includes(window.__micatro.view().state)), 60000);
		if ((await view()).state !== 'SHOP') { await settle(); await act({ type: 'cash_out' }); }
		await waitFor(() => page.evaluate(() => window.__micatro.view().state === 'SHOP'), 30000);
		shops++;
		await settle();
		if (round === 0) await shot('shop-1');
		// buy a joker when there's room, open every pack, reroll twice (more Pokémon through the shop)
		for (let rr = 0; rr < 3; rr++) {
			let v = await view();
			const j = v.areas.shop_jokers[0];
			if (j && v.areas.jokers.length < 5) { const r = await act({ type: 'buy', id: j.id }); if (r && r.ok) bought++; await settle(); }
			v = await view();
			for (const b of v.areas.shop_booster) {
				const r = await act({ type: 'buy', id: b.id });
				if (!r || !r.ok) continue;
				packs++;
				await settle();
				if (packs === 1) await shot('pack-1');
				if ((await view()).state !== 'SHOP') { await act({ type: 'skip_booster' }); await settle(); }
			}
			if (rr < 2) { await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.dollars = 200; }); const r = await act({ type: 'reroll_shop' }); if (r && r.ok) rerolls++; await settle(); }
		}
		await act({ type: 'next_round' });
		await waitFor(() => page.evaluate(() => window.__micatro.view().state === 'BLIND_SELECT'), 30000);
		await settle();
	}
	// the collection: Run Info's tabs (and the Pokédex), as a player browses them
	const tabs = await page.evaluate(async () => {
		const S = await import('/micatro/js/ui/screens.js');
		S.runInfo(window.__micatro.board.view);
		return [...document.querySelectorAll('.tabs .tab')].map((b) => b.dataset.k);
	});
	for (const k of tabs) {
		await page.evaluate((k) => document.querySelector(`.tabs .tab[data-k="${k}"]`).click(), k);
		await settle();
		if (k === 'mod:pokedex' || /pokedex/.test(k)) await shot('runinfo-pokedex');
	}
	await page.evaluate(async () => { const S = await import('/micatro/js/ui/screens.js'); S.closeAll(); });
	const playMs = Date.now() - t0;
	const frames = await page.evaluate(() => window.__frames);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	await shot('run-end');
	await sleep(2500);   // (the idle blocks let go)
	const mem = await page.evaluate(async () => {
		const As = await import('/micatro/js/ui/assets.js'), { SPLIT_SHEETS } = await import('/micatro/js/mods/split_sheets.js');
		const st = As.modSheetStats ? As.modSheetStats() : { sheets: [], blocks: [], crops: 0, cropCap: 0, splitBroken: [] };
		const isSplit = (src) => Object.keys(SPLIT_SHEETS).some((k) => src.endsWith(k));
		const loads = window.__modLoads;
		const whole = loads.filter((l) => !/\/_split\//.test(l.src));
		return {
			wholeSplitSheets: [...new Set(whole.filter((l) => isSplit(l.src)).map((l) => l.src.split('/').pop() + ' ' + l.w + 'x' + l.h))],
			wholeOther: [...new Set(whole.filter((l) => !isSplit(l.src)).map((l) => l.src.split('/').pop()))].length,
			blocks: loads.filter((l) => /\/_split\//.test(l.src)).length, biggest: +Math.max(0, ...loads.map((l) => l.w * l.h * 4 / 1048576)).toFixed(1),
			peakMB: +window.__modPeakMB.toFixed(1), steadyMB: +window.__modAliveMB().toFixed(1),
			sheetsAlive: st.sheets.length, blocksAlive: st.blocks.length, crops: st.crops, cropCap: st.cropCap, splitBroken: st.splitBroken,
		};
	});
	console.log('  run: ' + JSON.stringify({ shops, packs, bought, rerolls, playMs, frames: { n: frames.n, slow: frames.slow, worst: Math.round(frames.worst) } }));
	console.log('  memory: ' + JSON.stringify(mem));
	A(shops === ROUNDS && packs >= ROUNDS && bought >= 3, `the run went through ${shops} shops, ${packs} packs, ${bought} jokers bought, ${rerolls} rerolls`, JSON.stringify({ shops, packs, bought }));
	A(mem.blocks > 5 && mem.wholeSplitSheets.length === 0 && mem.splitBroken.length === 0, `memory: the run's art came from ${mem.blocks} small blocks, no whole pre-split sheet was decoded`, JSON.stringify(mem.wholeSplitSheets));
	A(mem.peakMB < PEAK_MB && mem.biggest < 8, `memory: at most ${mem.peakMB} MB of mod images decoded at once (budget ${PEAK_MB})`, JSON.stringify(mem));
	A(mem.steadyMB < STEADY_MB && mem.blocksAlive === 0 && mem.crops <= mem.cropCap, `memory: settled, ${mem.steadyMB} MB of mod images decoded, no block kept, ${mem.crops} crops (cap ${mem.cropCap})`, JSON.stringify(mem));

	// ---- pixel identity: blocks vs the whole sheets
	const px = await page.evaluate(async () => {
		const As = await import('/micatro/js/ui/assets.js'), S = await import('/micatro/js/ui/screens.js'), CS = await import('/micatro/js/ui/cardsprite.js');
		const { P_CENTERS } = await import('/micatro/js/engine/core.js'), { SPLIT_SHEETS } = await import('/micatro/js/mods/split_sheets.js');
		const PU = await import('/micatro/mods/pokermon/ui.js');
		if (!As.setModBlocks) return { error: 'no setModBlocks (blocks are not drawn in runs)' };
		const splitOf = (atlas, pos) => { const r = pos && As.modCellRect(atlas, pos); const a = r && As.MODREG.atlases[r.atlas]; let src = a && a.src || ''; try { src = decodeURIComponent(src); } catch { } return !!r && Object.keys(SPLIT_SHEETS).some((k) => src.endsWith(k)); };
		const dOf = (key, extra) => { const c = P_CENTERS[key]; return { center: key, mod: c.mod, atlas: c.atlas, pos: c.pos, soul_pos: c.soul_pos, soul_atlas: c.soul_atlas, set: c.set, name: key, poke: c.poke, ...extra }; };
		const find = (f) => Object.keys(P_CENTERS).find((k) => { const c = P_CENTERS[k]; try { return c && c.atlas && c.pos && f(c, k); } catch { return false; } });
		const samples = [];
		const add = (label, d) => { if (d) samples.push({ label, d }); };
		add('Pokermon joker (Pikachu)', dOf('j_poke_pikachu'));
		add('its Shiny', dOf('j_poke_pikachu', { edition: 'poke_shiny' }));
		const leg = find((c) => c.mod === 'pokermon' && c.set === 'Joker' && c.soul_pos && splitOf(c.atlas, c.soul_pos));
		add('Legendary + soul (' + leg + ')', leg && dOf(leg));
		const sa = PU.seriesA(dOf('j_poke_charmander'), true) || PU.seriesA(dOf(find((c, k) => c.mod === 'pokermon' && PU.seriesA(dOf(k), true) && !PU.seriesA(dOf(k), true).poke_series_anim)), true);
		add('Series A (' + (sa && sa.center) + ')', sa);
		const na = find((c) => c.mod === 'nacho' && c.set === 'Joker' && splitOf(c.atlas, c.pos));
		add('Nacho joker (' + na + ')', na && dOf(na));
		const pp = find((c) => c.mod === 'pokermonplus' && c.set === 'Joker' && splitOf(c.atlas, c.pos)) || find((c) => c.mod === 'pokermonplus' && c.set === 'Joker');
		add('Pokermon+ joker (' + pp + ')', pp && dOf(pp));
		const co = find((c, k) => c.mod === 'pokermon' && /^c_poke_/.test(k) && splitOf(c.atlas, c.pos)) || 'c_poke_pokeball';
		add('Pokermon consumable (' + co + ')', P_CENTERS[co] && dOf(co));
		const slv = As.MODREG.atlases.poke_type_sleeves ? { atlas: 'poke_type_sleeves', pos: { x: 0, y: 0 } } : null;
		const waitArt = async (draw) => { for (let i = 0; i < 150; i++) { const m = As.modDrawMisses(); draw(); if (As.modDrawMisses() === m) return true; await new Promise((r) => setTimeout(r, 60)); } return false; };
		const sig = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		const renders = async () => {
			const out = {};
			for (const s of samples) {
				const c = S.cardCanvas(s.d, 'x');
				await waitArt(() => { c.getContext('2d').clearRect(0, 0, c.width, c.height); S.redrawCard(c, s.d); });
				out[s.label] = sig(c);
				// the raw cell at smaller sizes too (a joker in a tooltip / Run Info), and its soul layer alone
				const sd = S.stillData(s.d);
				for (const [w, h] of [[71, 95], [58, 58], [113, 151]]) {
					const k = document.createElement('canvas'); k.width = w; k.height = h;
					await waitArt(() => { k.getContext('2d').clearRect(0, 0, w, h); As.drawModCell(k.getContext('2d'), sd.atlas, sd.pos, 0, 0, w, h); });
					out[s.label + ' @' + w + 'x' + h] = sig(k);
				}
				const soul = CS.soulLayer(sd);
				if (soul) { const k = document.createElement('canvas'); k.width = 142; k.height = 190; await waitArt(() => { k.getContext('2d').clearRect(0, 0, 142, 190); CS.drawSoul(k.getContext('2d'), soul); }); out[s.label + ' soul'] = sig(k); }
			}
			if (slv) for (const [w, h] of [[146, 190], [58, 58]]) { const k = document.createElement('canvas'); k.width = w; k.height = h; await waitArt(() => { k.getContext('2d').clearRect(0, 0, w, h); As.drawModCell(k.getContext('2d'), slv.atlas, slv.pos, 0, 0, w, h); }); out['sleeve @' + w + 'x' + h] = sig(k); }
			return out;
		};
		const loads0 = window.__modLoads.length;
		const blocks = await renders();
		const fromBlocks = window.__modLoads.slice(loads0).filter((l) => !/\/_split\//.test(l.src) && Object.keys(SPLIT_SHEETS).some((k) => l.src.endsWith(k))).length;
		As.setModBlocks(false);
		await renders();   // (twice: Chrome's first draw of a just-decoded huge image can come from a scaled-down decode)
		const whole = await renders();
		const sheetsUsed = As.modSheetStats().sheets.map((x) => x.name);
		As.setModBlocks(true);
		// exact at the card size (every card face, soul and animation frame of a run is composed 1:1 at 142 x 190, then
		// scaled by CSS / WebGL) and at half size; a cell drawn at an odd scale straight into a small canvas (a tag, a
		// thumbnail) can round differently: the rasteriser's bilinear weights depend on the float precision of the source
		// offset (Heatran sits at y 6080 on the Natdex sheet, y 0 in its block) — the same sheet drawn from a 4260-wide
		// canvas at the same offsets matches exactly, and the sheet itself rounds differently on another device / GPU. So
		// those must be the same picture (most values equal, none far off) rather than bit-equal.
		const cmp = (a, b) => { let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { n++; mx = Math.max(mx, d); } } return { n, mx, f: n / a.length }; };
		const exact = [], close = [], off = [];
		for (const k of Object.keys(whole)) {
			const c = cmp(whole[k], blocks[k]), odd = / @(113x151|58x58)$/.test(k);
			if (!c.n) exact.push(k); else if (odd && c.mx <= 16 && c.f < 0.2) close.push(k + ' (' + c.n + ' values, max ' + c.mx + ')'); else off.push(k + ' ' + JSON.stringify(c));
		}
		const blank = Object.keys(whole).filter((k) => !whole[k].some((v, i) => (i & 3) === 3 && v));
		return { labels: samples.map((s) => s.label), n: Object.keys(whole).length, exact: exact.length, close, off, blank, fromBlocks, sheetsUsed };
	});
	console.log('  pixel: ' + JSON.stringify(px));
	A(!px.error && px.labels.length === 7 && px.n >= 30, `pixel: ${px.labels && px.labels.length} representative cards + a sleeve drawn ${px.n} ways`, JSON.stringify(px.labels || px.error));
	A(!px.error && px.blank.length === 0, 'pixel: every sample drew art (none blank)', JSON.stringify(px.blank));
	A(!px.error && px.off.length === 0 && px.exact >= 20, `pixel: drawn from blocks == drawn from the whole sheets: ${px.exact} of ${px.n} bit-identical (every card face, soul, half size), odd-scale thumbnails within rounding`, JSON.stringify({ off: px.off, close: px.close }));
	A(!px.error && px.fromBlocks === 0 && px.sheetsUsed.some((n) => /Natdex/.test(n)), 'pixel: the block pass decoded no whole split sheet; the reference pass did (Natdex)', JSON.stringify({ fromBlocks: px.fromBlocks, sheets: px.sheetsUsed }));
	// ---- a cell outside its sheet (a placeholder pos: Pokermon draws some jokers at {x: 99, y: 99}) has no block: it draws
	// nothing, like the whole sheet there, and never requests a block that doesn't exist (a 404 that marked the whole sheet
	// broken, so every card of it drew from the 213 MB sheet again)
	const oob = await page.evaluate(async () => {
		const As = await import('/micatro/js/ui/assets.js');
		const atlas = Object.keys(As.MODREG.atlases).find((n) => /\/AtlasJokersBasicNatdex\.png$/.test(decodeURIComponent(As.MODREG.atlases[n].src || '')));
		if (!atlas) return { error: 'no Natdex atlas' };
		const c = document.createElement('canvas'); c.width = 142; c.height = 190;
		const drew = As.drawModCell(c.getContext('2d'), atlas, { x: 99, y: 99 }, 0, 0, 142, 190);
		await new Promise((r) => setTimeout(r, 500));
		const asked = performance.getEntriesByType('resource').map((e) => decodeURIComponent(e.name)).filter((u) => /\/_split\/AtlasJokersBasicNatdex\/\d+_\d+\.png/.test(u))
			.filter((u) => { const [, bx, by] = u.match(/\/(\d+)_(\d+)\.png/); return bx * 994 >= 4260 || by * 380 >= 13110; });
		return { atlas, drew, loading: As.modArtLoading(atlas), asked, broken: As.modSheetStats().splitBroken };
	});
	A(!oob.error && oob.drew === true && !oob.loading && oob.asked.length === 0 && oob.broken.length === 0, 'a cell outside its sheet draws as empty and requests no block (none past the sheet asked for; the sheet is not marked broken, which would decode it whole)', JSON.stringify(oob));
	A(errors.length === 0, 'no console errors', errors.join(' | '));

	// ---- the blocks aren't there (a mod not split yet, blocks not deployed): the whole sheet, the same picture
	{
		const p2 = await (await browser.createBrowserContext()).newPage();
		await p2.setRequestInterception(true);
		p2.on('request', (rq) => (/\/_split\//.test(decodeURIComponent(rq.url())) ? rq.respond({ status: 404, body: 'nf' }) : rq.continue()));
		await p2.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p2.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		const fb = await p2.evaluate(async (mods) => {
			await window.__micatro.loadMods(mods);
			const As = await import('/micatro/js/ui/assets.js'), S = await import('/micatro/js/ui/screens.js'), { P_CENTERS } = await import('/micatro/js/engine/core.js');
			if (!As.setModBlocks) return { error: 'no setModBlocks' };
			const c = P_CENTERS.j_poke_pikachu, d = { center: 'j_poke_pikachu', mod: c.mod, atlas: c.atlas, pos: c.pos, set: c.set, name: 'Pikachu' };
			const draw = async () => { const cv = S.cardCanvas(d, 'x'); for (let i = 0; i < 150; i++) { const m = As.modDrawMisses(); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); S.redrawCard(cv, d); if (As.modDrawMisses() === m) break; await new Promise((r) => setTimeout(r, 60)); } return cv.toDataURL(); };
			await draw();
			const viaFallback = await draw();
			const st = As.modSheetStats();
			As.setModBlocks(false);
			const ref = await draw();
			As.setModBlocks(true);
			return { same: viaFallback === ref, broken: st.splitBroken, sheets: st.sheets.map((x) => x.name), blank: viaFallback.length < 3000 };
		}, MODS);
		A(!fb.error && fb.same && !fb.blank && fb.broken.some((n) => /Natdex/.test(n)), 'fallback: with no blocks deployed the card draws from the whole sheet, the same picture', JSON.stringify(fb));
		await p2.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
