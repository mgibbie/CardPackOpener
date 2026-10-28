// micatro_deckeditor_pages_test.mjs — the deck editor's picker is PAGED (owner, 2026-10-27: "the deck creator mod breaks
// on mobile when i have pokermon mods on because there are too many jokers. it needs to have pages").
// Pokermon + Nacho + Pokermon+ give the joker picker 890 jokers. The old picker showed 48 and a "More" button that
// added 48 more AND rebuilt every shown tile each press: reaching the last joker left 890 tiles / 859 canvases
// (89 MB of canvas backing store, ~7,600 canvases created on the way) in a phone's tab. Now:
//   - phone portrait (390 x 844, CPU x4): the picker opens within a budget; only ONE PAGE of tiles (one screen) is
//     built, and the page's canvases are reused page to page (the count never grows)
//   - Prev / Next + "Page 1 / N" (N = ceil(890 / page)); Next / Prev move a page; a controller's RB / LB turn it
//   - the search runs over all 890 (a joker from the last page is found: "1 of 890 Jokers"); the Mod filter too
//   - a joker picked on page 3 keeps its ✓ after paging away and back, and is in the deck's Starting Jokers
//   - a deck with a joker from the LAST page saves (Save & use) and its run starts with that joker
//   - phone landscape (844 x 390): one page fits the screen; desktop (1600 x 900): 48 a page, as before
//   - memory (2026-10-27 follow-up): browsing all 25 pages never decodes a whole pre-split sheet (Pokermon's Natdex
//     sheet is 4260 x 13110 px = 213 MB decoded); cells come from the small blocks of tools/micatro/split_mod_atlases.mjs,
//     cropped and let go: at most 60 MB of mod images decoded at once, none alive after, and the art matches the sheet's
// Covers micatro/js/ui/deckeditor.js (picker), micatro/js/ui/screens.js (redrawCard), micatro/js/ui/pad.js (shoulder),
// micatro/js/ui/assets.js (drawModCell crop mode, blocks), micatro/js/ui/cardsprite.js, micatro/js/mods/split_sheets.js,
// micatro/css/micatro.css — named here so `run-all.mjs --changed` selects this suite.
//   node overworld/tests/micatro_deckeditor_pages_test.mjs
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
const PORT = 8792;
const SHOTS = process.env.MICATRO_SHOTS || path.join(os.tmpdir(), 'micatro-deckpages-shots');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const MODS = ['pokermon', 'nacho', 'pokermonplus'];
const TOTAL = 890;          // jokers with the three on (150 base + 651 Pokermon + 66 Nacho + 23 Pokermon+)
const OPEN_BUDGET = 4000;   // ms, tap -> the first page drawn, at CPU x4

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"error":"offline"}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async ({ w, h, phone }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((mods) => {
			// a fake controller (headless Chrome has none): window.__padTap(button) holds it until site/gamepad.js has polled it
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad];
			// every mod image the page decodes (a whole sheet, or a block of a pre-split one), and the most alive at once
			const I = window.Image, imgs = [];
			window.__modLoads = []; window.__modPeakMB = 0;
			window.Image = function (...a) { const im = new I(...a); imgs.push(im); im.addEventListener('load', () => { if (/\/mods\//.test(im.src)) window.__modLoads.push({ src: decodeURIComponent(im.src), w: im.naturalWidth, h: im.naturalHeight }); }); return im; };
			window.Image.prototype = I.prototype;
			window.__modAliveMB = () => imgs.filter((i) => /\/mods\//.test(i.src) && i.complete && i.naturalWidth).reduce((n, i) => n + i.naturalWidth * i.naturalHeight * 4, 0) / 1048576;
			window.__modPending = () => imgs.filter((i) => /\/mods\//.test(i.src) && !i.complete).length;
			setInterval(() => { window.__modPeakMB = Math.max(window.__modPeakMB, window.__modAliveMB()); }, 25);
			let polls = 0;
			Object.defineProperty(pad, 'connected', { get() { polls++; return true; }, enumerable: true });
			const until = (f, ms = 10000) => new Promise((r) => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms ? r() : setTimeout(k, 4)); k(); });
			const set = (b, on) => { pad.buttons[b] = on ? { pressed: true, value: 1 } : { pressed: false, value: 0 }; };
			window.__padTap = async (b) => { const t0 = performance.now(); set(b, true); const n = polls; await until(() => polls > n && performance.now() - t0 >= 70); set(b, false); const m = polls; await until(() => polls > m + 1); };
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (!sessionStorage.getItem('deckpages_init')) {
					sessionStorage.setItem('deckpages_init', '1');
					for (const k of ['micatro_run_v1', 'micatro_cdeck_sel', 'micatro_decks_v1', 'magepunk_mp_token_v1']) localStorage.removeItem(k);
					localStorage.setItem('micatro_mods', JSON.stringify({ ids: mods, options: {} }));
				}
			} catch { }
		}, MODS);
		await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		return { page, errors, ctx };
	};
	const tap = async (page, sel, { touch = false } = {}) => {
		await page.waitForSelector(sel, { visible: true, timeout: 10000 });
		await waitFor(() => page.evaluate((s) => { const m = document.querySelector(s).closest('.modal'); return !m || m.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'); }, sel), 2000);
		// (and stops moving: the New Run screen re-lays out as the mods load, and a tap meant for Decks once hit Mods)
		let last = '';
		await waitFor(async () => { const r = await page.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round).join(); }, sel); const same = r === last; last = r; if (!same) await sleep(250); return same; }, 4000);
		const hit = await page.evaluate((s) => {
			const el = document.querySelector(s);
			el.scrollIntoView({ block: 'center', behavior: 'instant' });
			const r = el.getBoundingClientRect();
			const x = r.left + r.width / 2, y = r.top + r.height / 2;
			const at = document.elementFromPoint(x, y);
			return { ok: !!at && (at === el || el.contains(at)), x, y, at: at ? String(at.className || at.tagName) : 'nothing' };
		}, sel);
		if (!hit.ok) { A(false, `"${sel}" is reachable (not covered)`, hit.at); return false; }
		if (touch) await page.touchscreen.tap(hit.x, hit.y); else await page.mouse.click(hit.x, hit.y);
		await sleep(60);
		return true;
	};
	const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
	const shot = async (page, name) => { await sleep(400); const p = path.join(SHOTS, name + '.png'); await page.screenshot({ path: p }); console.log('  shot: ' + p); };
	// the picker's state: its tiles, canvases, the page indicator
	const pick = (page) => page.evaluate(() => {
		const p = document.querySelector('.cd-picker');
		if (!p) return null;
		const tiles = [...p.querySelectorAll('.cd-tile')];
		const shown = tiles.filter((t) => !t.hidden);
		const box = p.closest('.modal-box');
		const last = shown[shown.length - 1];
		return {
			tiles: tiles.length, shown: shown.length, keys: shown.map((t) => t.dataset.key),
			canvases: p.querySelectorAll('canvas').length,
			ind: (p.querySelector('.cd-page-ind') || {}).textContent || null,
			note: (p.querySelector('.cd-pick-note') || {}).textContent || '',
			more: !!p.querySelector('.b-cd-more'),
			// one screen: the box doesn't scroll (much) and the last tile + the pager are inside it
			overflow: box.scrollHeight - box.clientHeight,
			lastIn: last ? last.getBoundingClientRect().bottom <= box.getBoundingClientRect().bottom + 1 : false,
		};
	});
	/** Open the joker picker from a fresh deck's Items tab. */
	const openPicker = async (page, touch) => {
		await tap(page, '.b-menu-play', { touch });
		await page.waitForSelector('.new-run', { visible: true });
		// (the New Run screen may still be settling: tap Decks again if its list didn't open)
		for (let i = 0; i < 3 && !(await page.$('.cd-list')); i++) { await tap(page, '.b-cdecks', { touch }); await waitFor(() => page.$('.cd-list'), 4000); }
		await page.waitForSelector('.cd-list', { visible: true, timeout: 10000 });
		await waitFor(() => page.evaluate(() => !/Loading/.test(document.querySelector('.cd-status').textContent)), 10000);
		await tap(page, '.b-cd-new', { touch });
		await tap(page, '.b-cd-tab-items', { touch });
		await page.waitForSelector('.b-cd-add-joker', { visible: true });
		await waitFor(() => page.evaluate(async () => { const { P_CENTERS } = await import('/micatro/js/engine/core.js'); return !!P_CENTERS.j_poke_bulbasaur; }), 30000);
		await sleep(300);
	};

	// ============================================================== phone portrait, CPU x4
	{
		const { page, errors } = await open({ w: 390, h: 844, phone: true });
		await openPicker(page, true);
		const cdp = await page.createCDPSession();
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		const t0 = Date.now();
		await tap(page, '.b-cd-add-joker', { touch: true });
		await page.waitForSelector('.cd-tile', { visible: true });
		const openMs = Date.now() - t0;
		let p = await pick(page);
		A(openMs < OPEN_BUDGET, `phone: the joker picker opens within ${OPEN_BUDGET} ms at CPU x4`, openMs + ' ms');
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		A(new RegExp(TOTAL + ' Jokers').test(p.note), `all ${TOTAL} jokers (Pokermon + Nacho + Pokermon+) are offered`, p.note);
		const size = p.shown;
		A(p.ind && size >= 10 && size <= 48 && p.tiles === size && p.canvases === size, 'phone: only one page of tiles is built (one canvas each)', JSON.stringify({ size, tiles: p.tiles, canvases: p.canvases, ind: p.ind, more: p.more }));
		A(p.overflow <= 2 && p.lastIn, 'phone: a page is one screen (the picker does not scroll)', JSON.stringify({ overflow: p.overflow, lastIn: p.lastIn }));
		const N = Math.ceil(TOTAL / size);
		A(p.ind === `Page 1 / ${N}`, `the indicator reads "Page 1 / ${N}"`, p.ind);
		await shot(page, 'picker-page1-phone');
		const first = p.keys;
		// ---- Next / Prev
		await tap(page, '.b-cd-pg-next', { touch: true });
		p = await pick(page);
		A(p.ind === `Page 2 / ${N}` && p.keys[0] !== first[0] && p.tiles === size && p.canvases === size, 'Next: page 2, new jokers, the same tiles reused', JSON.stringify({ ind: p.ind, k0: p.keys[0], tiles: p.tiles }));
		await tap(page, '.b-cd-pg-prev', { touch: true });
		p = await pick(page);
		A(p.ind === `Page 1 / ${N}` && p.keys.join() === first.join() && await page.evaluate(() => document.querySelector('.b-cd-pg-prev').disabled), 'Prev: back on page 1 (Prev is off there)', p.ind);
		// ---- a pick on page 3 stays picked across pages
		await tap(page, '.b-cd-pg-next', { touch: true });
		await tap(page, '.b-cd-pg-next', { touch: true });
		p = await pick(page);
		const k3 = p.keys[1];
		await tap(page, `.cd-tile[data-key="${k3}"]`, { touch: true });
		A(await page.evaluate((k) => document.querySelector(`.cd-tile[data-key="${k}"]`).classList.contains('have'), k3), `page 3: ${k3} picked (✓)`);
		await tap(page, '.b-cd-pg-next', { touch: true });
		A(await page.evaluate((k) => !document.querySelector(`.cd-tile[data-key="${k}"]`) && !document.querySelector('.cd-tile.have'), k3), 'page 4: no stale ✓ on the reused tiles');
		await tap(page, '.b-cd-pg-prev', { touch: true });
		A(await page.evaluate((k) => document.querySelector(`.cd-tile[data-key="${k}"]`).classList.contains('have'), k3), 'back on page 3: it is still ✓');
		// ---- page all the way to the end: the tile + canvas count never grows
		let maxTiles = 0, maxCanvases = 0, steps = 0, ref = null;
		while (await page.evaluate(() => !document.querySelector('.b-cd-pg-next').disabled) && steps < 200) {
			await page.evaluate(() => document.querySelector('.b-cd-pg-next').click());
			await waitFor(() => page.evaluate(() => window.__modPending() === 0), 5000);   // (the page's art, as a player waits for it)
			const q = await pick(page);
			maxTiles = Math.max(maxTiles, q.tiles); maxCanvases = Math.max(maxCanvases, q.canvases); steps++;
			// keep one Natdex-sheet joker's tile as drawn from the blocks, to check against the whole sheet later
			if (!ref && q.keys.includes('j_poke_pikachu')) { await sleep(200); ref = await page.evaluate(() => { const t = document.querySelector('.cd-tile[data-key="j_poke_pikachu"]'); return { url: t.querySelector('canvas').toDataURL(), name: t.querySelector('.cd-tile-n').firstChild.textContent.trim() }; }); }
		}
		const mem = await page.evaluate(async () => {
			const A = await import('/micatro/js/ui/assets.js'), { SPLIT_SHEETS } = await import('/micatro/js/mods/split_sheets.js');
			const st = A.modSheetStats ? A.modSheetStats() : { sheets: [], blocks: [], crops: 0, cropCap: 0, splitBroken: [] };   // (none before the follow-up)
			const isSplit = (src) => Object.keys(SPLIT_SHEETS).some((k) => src.endsWith(k));
			const loads = window.__modLoads;
			return {
				wholeSplitSheets: loads.filter((l) => !/\/_split\//.test(l.src) && isSplit(l.src)).map((l) => l.src.split('/').pop() + ' ' + l.w + 'x' + l.h),
				blocks: loads.filter((l) => /\/_split\//.test(l.src)).length, biggest: Math.max(0, ...loads.map((l) => l.w * l.h * 4 / 1048576)),
				peakMB: +window.__modPeakMB.toFixed(1), aliveMB: +window.__modAliveMB().toFixed(1),
				sheetsAlive: st.sheets.length + st.blocks.length, crops: st.crops, cropCap: st.cropCap, splitBroken: st.splitBroken,
			};
		});
		A(mem.blocks > 20 && mem.wholeSplitSheets.length === 0 && mem.splitBroken.length === 0, `memory: the art came from ${mem.blocks} small blocks, no whole pre-split sheet was decoded`, JSON.stringify(mem));
		A(mem.peakMB < 60 && mem.biggest < 8, `memory: at most ${mem.peakMB} MB of mod images decoded at once (budget 60; the Natdex sheet alone is 213)`, JSON.stringify(mem));
		A(mem.aliveMB < 8 && mem.crops <= mem.cropCap, `memory: after paging to the last page, ${mem.aliveMB} MB of images still decoded and ${mem.crops} cell crops (cap ${mem.cropCap})`, JSON.stringify(mem));
		p = await pick(page);
		const canvasesInDoc = await page.evaluate(() => document.querySelectorAll('canvas').length);
		A(p.ind === `Page ${N} / ${N}` && maxTiles <= size && maxCanvases <= size, `paged to the end (${steps} Next): never more than one page of tiles / canvases`, JSON.stringify({ ind: p.ind, maxTiles, maxCanvases, canvasesInDoc }));
		await shot(page, 'picker-lastpage-phone');
		const lastKey = p.keys[p.keys.length - 1];
		// ---- the controller: RB / LB turn the page
		await page.evaluate(() => window.__padTap(12));   // (the first press shows the reticle)
		await page.evaluate(() => window.__padTap(4));     // LB
		A(/^Page /.test((await pick(page)).ind) && (await pick(page)).ind === `Page ${N - 1} / ${N}`, 'controller: LB = previous page', (await pick(page)).ind);
		await page.evaluate(() => window.__padTap(5));     // RB
		A((await pick(page)).ind === `Page ${N} / ${N}`, 'controller: RB = next page', (await pick(page)).ind);
		// ---- search over everything: a last-page joker
		const lastName = await page.evaluate((k) => document.querySelector(`.cd-tile[data-key="${k}"] .cd-tile-n`).firstChild.textContent.trim(), lastKey);
		await tap(page, '.cd-search', { touch: true });
		await page.keyboard.type(lastName);
		await sleep(150);
		p = await pick(page);
		A(p.keys.includes(lastKey) && new RegExp('of ' + TOTAL + ' Jokers').test(p.note) && (p.ind === 'Page 1 / 1' || p.ind === null || p.ind === 'Page 1 / 1'), `search "${lastName}" finds the last page's joker (${p.note})`, JSON.stringify({ keys: p.keys, note: p.note, ind: p.ind }));
		A(await page.evaluate(() => getComputedStyle(document.querySelector('.cd-pager')).display === 'none'), 'one page of matches: no pager');
		await page.evaluate(() => { const q = document.querySelector('.cd-search'); q.value = ''; q.dispatchEvent(new Event('input')); });
		// ---- the Mod filter, across every page, then paged
		for (let i = 0; i < 5 && !/Pokermon\+/.test(await text(page, '[data-filter="mod"]')); i++) await tap(page, '[data-filter="mod"]', { touch: true });
		p = await pick(page);
		A(/Pokermon\+/.test(await text(page, '[data-filter="mod"]')) && new RegExp('^23 of ' + TOTAL).test(p.note) && p.ind === `Page 1 / ${Math.ceil(23 / size)}`, 'Mod filter: Pokermon+ = 23 of ' + TOTAL + ', paged', JSON.stringify({ note: p.note, ind: p.ind }));
		await shot(page, 'picker-filter-phone');
		for (let i = 0; i < 5 && !/All/.test(await text(page, '[data-filter="mod"]')); i++) await tap(page, '[data-filter="mod"]', { touch: true });
		// ---- pick the last joker of the last page, then build + play the deck
		while (await page.evaluate(() => !document.querySelector('.b-cd-pg-next').disabled)) await page.evaluate(() => document.querySelector('.b-cd-pg-next').click());
		await tap(page, `.cd-tile[data-key="${lastKey}"]`, { touch: true });
		await tap(page, '.cd-pick-modal .b-back', { touch: true });
		const items = await page.evaluate(() => [...document.querySelectorAll('.cd-item')].map((r) => r.dataset.item));
		A(items.includes('joker:' + k3) && items.includes('joker:' + lastKey), 'Starting Jokers: the page-3 pick and the last-page pick', JSON.stringify(items));
		await tap(page, '.b-cd-saveuse', { touch: true });
		await waitFor(() => page.evaluate(() => !document.querySelector('.cd-editor')), 5000);
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_decks_v1') || 'null'));
		const def = saved && saved.decks[0] && saved.decks[0].def;
		A(def && def.jokers.map((j) => j.key).join() === [k3, lastKey].join() && def.mods.includes('pokermonplus'), 'Save & use saves the deck (both jokers, needs Pokermon+)', JSON.stringify(def && { j: def.jokers, mods: def.mods }));
		await tap(page, '.b-start', { touch: true });
		await waitFor(() => page.evaluate(() => window.__micatro.session && window.__micatro.view().custom_deck && window.__micatro.view().state === 'BLIND_SELECT'), 60000);
		const v = await page.evaluate(() => window.__micatro.view());
		A(v.custom_deck && v.areas.jokers.map((j) => j.center).join() === [k3, lastKey].join(), 'the run starts with the page-3 and last-page jokers', JSON.stringify(v.areas && v.areas.jokers.map((j) => j.center)));
		await sleep(800);
		await shot(page, 'run-phone');
		// ---- the blocks' art is the whole sheet's: Pikachu drawn from the whole sheet (assets.js setModBlocks(false): runs
		// draw from the blocks too since the follow-up) is the same picture
		A(!!ref, 'a Natdex-sheet joker (Pikachu) was seen while paging');
		if (ref) {
			const same = await page.evaluate(async (ref) => {
				const S = await import('/micatro/js/ui/screens.js'), A = await import('/micatro/js/ui/assets.js'), { P_CENTERS } = await import('/micatro/js/engine/core.js');
				const c = P_CENTERS.j_poke_pikachu, d = { center: 'j_poke_pikachu', mod: c.mod, atlas: c.atlas, pos: c.pos, set: c.set, name: ref.name };
				if (A.setModBlocks) A.setModBlocks(false);
				const cv = S.cardCanvas(d, 'x');
				for (let i = 0; i < 100 && A.modArtLoading(S.stillData(d).atlas); i++) await new Promise((r) => setTimeout(r, 100));
				S.redrawCard(cv, d);
				const full = A.modSheetStats().sheets.map((x) => x.w + 'x' + x.h);
				if (A.setModBlocks) A.setModBlocks(true);
				return { same: cv.toDataURL() === ref.url, full };
			}, ref);
			A(same.same && same.full.includes('4260x13110'), 'the tile drawn from blocks == the one drawn from the whole Natdex sheet', JSON.stringify(same.full));
		}
		A(errors.length === 0, 'no console errors (phone portrait)', errors.join(' | '));
	}

	// ============================================================== phone landscape + desktop
	for (const [w, h, phone, name] of [[844, 390, true, 'landscape'], [1600, 900, false, 'desktop']]) {
		const { page, errors } = await open({ w, h, phone });
		await openPicker(page, phone);
		await tap(page, '.b-cd-add-joker', { touch: phone });
		await page.waitForSelector('.cd-tile', { visible: true });
		const p = await pick(page);
		if (phone) A(p.shown >= 8 && p.shown < 48 && p.overflow <= 2 && p.lastIn && p.ind === `Page 1 / ${Math.ceil(TOTAL / p.shown)}`, `${name}: one screen a page`, JSON.stringify(p && { shown: p.shown, overflow: p.overflow, ind: p.ind }));
		else A(p.shown === 48 && p.tiles === 48 && p.ind === `Page 1 / ${Math.ceil(TOTAL / 48)}`, `${name}: 48 a page (as before), "Page 1 / 18"`, JSON.stringify(p && { shown: p.shown, ind: p.ind }));
		const fit = await page.evaluate(() => { const b = document.querySelector('.cd-picker').closest('.modal-box'); return b.scrollWidth - b.clientWidth; });
		A(fit <= 1, `${name}: no sideways overflow`, fit);
		await shot(page, 'picker-' + name);
		A(errors.length === 0, `no console errors (${name})`, errors.join(' | '));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
