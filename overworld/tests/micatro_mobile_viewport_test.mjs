// micatro_mobile_viewport_test.mjs — on a phone every shop / booster-pack control must be reachable
// without zooming. A tester (iPhone Safari, portrait) had to pinch-zoom to open a pack: the board is
// a fixed design canvas scaled to the screen, and when the visible height is short (Safari's bottom
// toolbar showing) the shop's booster row and its Open button were laid out BELOW the canvas, under
// the toolbar. Puppeteer can't show a real Safari toolbar, so this simulates it two ways:
//   - a layout viewport that IS the visible area (390x664: an iPhone 14's 844 minus the toolbars)
//   - a 390x844 window whose visualViewport reports only 664 px visible (iOS 26's floating toolbar
//     draws over the page; innerHeight can still be the full 844)
// and checks, in portrait and landscape: Next Round / Reroll, every shop card's Buy / Open / Redeem
// button, the opened pack's Skip and its cards' Select / Use buttons all sit inside the visible area.
// Covers micatro/js/ui/board.js (resize / computeRegions / renderShop / renderPack).
//   node overworld/tests/micatro_mobile_viewport_test.mjs        (SHOTS=<dir> also saves screenshots)
import http from 'http';
import fs from 'fs';
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
const SHOTS = process.env.SHOTS || '';
const PORT = 8763;
const SEED = 'DEMO2';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'micatromob', friendCode: 'MICMB0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		if (body.action === 'run-leaderboard') out = { top: [], you: null };
		else if (body.action === 'chat-get') out = { messages: [] };
		else if (body.action === 'publish-micatro') out = { ok: true, watchers: 2, watcherNames: ['bob', 'carol'] }; // (the run is watched: the "2 watching" chip)
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const BOT = `
window.__bestHand = async function () {
	const R = await import('/micatro/js/engine/run.js');
	const G = R.G, hand = G.hand.cards, n = hand.length, combos = [];
	const rec = (s, p) => { if (p.length === Math.min(5, n)) { combos.push(p.slice()); return; } for (let i = s; i < n; i++) { p.push(i); rec(i + 1, p); p.pop(); } };
	rec(0, []);
	let best = null, bestScore = -1;
	for (const c of combos) {
		const cards = c.map(i => hand[i]); const info = R.pokerInfo(cards); const h = G.GAME.hands[info.text]; if (!h) continue;
		let chips = h.chips; for (const sc of info.scoring_hand) chips += sc.get_chip_bonus();
		if (chips * h.mult > bestScore) { bestScore = chips * h.mult; best = cards.map(x => x.sort_id); }
	}
	return { best, bestScore, all: hand.map(x => x.sort_id) };
};
// Simulate Safari's toolbar covering the bottom of a full-height window: visualViewport reports
// only VISIBLE px while innerHeight stays the full window. null = the real values.
window.__fakeVisible = function (h) {
	const vv = window.visualViewport;
	if (h == null) delete vv.height; else Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
	vv.dispatchEvent(new Event('resize'));
};`;

// the screen sizes: [name, window w, window h, visible h (null = all of it)]
const SIZES = [
	['portrait 390x664', 390, 664, null],
	['portrait 390x844 (toolbar covers 180px)', 390, 844, 664],
	['portrait 390x844', 390, 844, null],
	['landscape 844x390', 844, 390, null],
	['landscape 844x390 (toolbar covers 50px)', 844, 390, 340],
];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
			localStorage.removeItem('micatro_run_v1');
			localStorage.setItem('magepunk_mp_token_v1', 'mic-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 60000), 'micatro boots');
	await page.evaluate(BOT);
	const idle = () => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const V = () => page.evaluate(() => window.__micatro.view());
	const act = async (a) => { await page.evaluate(a => window.__micatro.act(a), a); await idle(); };

	// ---- play the first blind out (same seeded bot as micatro_ui_test) and cash out into the shop
	await page.evaluate(async (seed) => { await window.__micatro.newRun({ seed, back: 'b_red' }); }, SEED);
	await idle();
	await act({ type: 'select_blind' });
	for (let guard = 0; guard < 14; guard++) {
		const v = await V();
		if (v.state !== 'SELECTING_HAND') break;
		const bh = await page.evaluate(() => window.__bestHand());
		const need = (v.blind.chips - v.chips) / v.hands_left;
		let ids = bh.best, a = 'play';
		if (bh.bestScore < need && v.discards_left > 0) { const d = bh.all.filter(id => !bh.best.includes(id)).slice(0, 5); if (d.length) { ids = d; a = 'discard'; } }
		await act({ type: 'highlight', ids });
		await act({ type: a });
	}
	await act({ type: 'cash_out' });
	await sleep(400);
	let v = await V();
	A(v.state === 'SHOP', 'the bot reaches the shop', v.state);

	const setSize = async ([, w, h, vis]) => {
		await page.evaluate(() => window.__fakeVisible(null));
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await sleep(150);
		if (vis != null) await page.evaluate((x) => window.__fakeVisible(x), vis);
		await sleep(250);
		await idle(); await sleep(500); // cards ease to their new targets
	};
	// tap a card the way a finger does (pointer events on the card), so its buttons appear
	// (at a point of the card nothing else covers — the selected card's tooltip can overlap a neighbour)
	const select = async (id) => {
		for (let tries = 0; tries < 3; tries++) {
			const p = await page.evaluate((id) => {
				const el = document.querySelector(`.card[data-id="${id}"]`); if (!el) return null;
				const r = el.getBoundingClientRect();
				for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.25, 0.75]) {
					const x = r.left + r.width * fx, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y);
					if (hit && hit.closest('.card') === el && !hit.closest('.card-btns')) return { x, y };
				}
				return null;
			}, id);
			if (!p) return false;
			await page.touchscreen.tap(p.x, p.y);
			await sleep(350);
			if (await page.evaluate((id) => !!document.querySelector(`.card[data-id="${id}"] .card-btns`), id)) return true;
		}
		return false;
	};
	// every rect must be inside the VISIBLE area (visualViewport, else innerHeight)
	const offscreen = (sel) => page.evaluate((sel) => {
		const vh = Math.min(innerHeight, window.visualViewport ? window.visualViewport.height : innerHeight), vw = innerWidth;
		const out = [];
		for (const el of document.querySelectorAll(sel)) {
			if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
			const r = el.getBoundingClientRect();
			if (r.width < 2 || r.height < 2) continue;
			if (r.top < -0.5 || r.left < -0.5 || r.bottom > vh + 0.5 || r.right > vw + 0.5) out.push(`${(el.className || el.tagName).toString().slice(0, 40)} [${Math.round(r.left)},${Math.round(r.top)} - ${Math.round(r.right)},${Math.round(r.bottom)}] visible ${vw}x${Math.round(vh)}`);
		}
		return { n: document.querySelectorAll(sel).length, out };
	}, sel);
	const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name.replace(/[^a-z0-9]+/gi, '_') + '.png') }); };

	// ---- the shop at every size
	const shopIds = (vv) => [...vv.areas.shop_jokers, ...vv.areas.shop_vouchers, ...vv.areas.shop_booster].map(c => c.id);
	const boosterId = v.areas.shop_booster.length ? v.areas.shop_booster[0].id : null;
	A(!!boosterId, 'the shop offers a booster pack (seed choice)');
	for (const size of SIZES) {
		await setSize(size);
		const nm = size[0];
		const r0 = await offscreen(['.shop-btns .btn', '.shop-panel', ...shopIds(v).map(id => `.card[data-id="${id}"]`)].join(', '));
		A(r0.n >= 4 && !r0.out.length, `${nm}: shop panel, Next Round / Reroll and every shop card are on screen`, JSON.stringify(r0.out));
		for (const id of shopIds(v)) {
			await select(id);
			const r = await offscreen(`.card[data-id="${id}"] .card-btns .btn`);
			A(r.n >= 1 && !r.out.length, `${nm}: shop card ${id}'s ${id === boosterId ? 'Open' : 'Buy'} button is on screen`, JSON.stringify(r));
			if (id === boosterId) await shot(`shop ${nm}`);
		}
		await page.touchscreen.tap(5, Math.round(size[2] * 0.3)); await sleep(200); // deselect
	}

	// ---- the "2 watching" chip (a watched run) never covers the HUD (bug 2026-10-19: in portrait it sat on the Round
	// score box) nor the settings / bell buttons, and stays on screen, at every size (+ a desktop-sized window)
	for (const size of [...SIZES, ['wide 1600x900', 1600, 900, null]]) {
		await setSize(size);
		const r = await page.evaluate(() => {
			const w = document.getElementById('watchers');
			if (!w || getComputedStyle(w).display === 'none') return { shown: false };
			const a = w.getBoundingClientRect(), hits = [];
			for (const el of document.querySelectorAll('.hud, .hud-score, .hud-stats .btn, #mp-topbar, #mp-topbar .tb-mini')) {
				const b = el.getBoundingClientRect();
				if (b.width < 2 || b.height < 2) continue;
				if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(`${(el.id || el.className).toString().slice(0, 30)} [${[b.left, b.top, b.right, b.bottom].map(Math.round)}]`);
			}
			const on = a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight;
			return { shown: true, text: w.textContent, rect: [a.left, a.top, a.right, a.bottom].map(Math.round), hits, on };
		});
		A(r.shown && /2 watching/.test(r.text), `${size[0]}: the watched run shows "2 watching"`, JSON.stringify(r));
		A(r.shown && r.on && !r.hits.length, `${size[0]}: the watching chip covers no HUD box / button and is on screen`, JSON.stringify(r));
		await shot(`watching ${size[0]}`);
	}

	// ---- open the pack (via its button) and check its controls at every size
	await setSize(SIZES[0]);
	v = await V();
	if (boosterId && v.areas.shop_booster.find(c => c.cost <= v.dollars)) {
		await select(boosterId);
		const opened = await page.evaluate((id) => { const b = document.querySelector(`.card[data-id="${id}"] .card-btns .buy`); if (!b) return false; b.click(); return true; }, boosterId);
		await idle(); await sleep(600);
		v = await V();
		A(opened && !!v.pack_kind && v.areas.pack_cards.length > 0, 'the Open button opens the booster', JSON.stringify({ kind: v.pack_kind }));
		for (const size of SIZES) {
			await setSize(size);
			const nm = size[0];
			const r0 = await offscreen(['.pack-head', '.pack-head .btn', ...v.areas.pack_cards.map(c => `.card[data-id="${c.id}"]`)].join(', '));
			A(r0.n >= 2 && !r0.out.length, `${nm}: the pack header, Skip and the pack's cards are on screen`, JSON.stringify(r0.out));
			for (const c of v.areas.pack_cards) {
				await select(c.id);
				const r = await offscreen(`.card[data-id="${c.id}"] .card-btns .btn`);
				A(r.n >= 1 && !r.out.length, `${nm}: pack card ${c.id}'s ${c.set === 'Default' || c.set === 'Enhanced' ? 'Select' : 'Select/Use'} button is on screen`, JSON.stringify(r));
				if (c === v.areas.pack_cards[0]) await shot(`pack ${nm}`);
			}
			await page.touchscreen.tap(5, Math.round(size[2] * 0.3)); await sleep(200);
		}
		await setSize(SIZES[0]);
		await page.click('.b-skip-pack'); await idle(); await sleep(300);
		v = await V();
		A(v.state === 'SHOP' && !v.pack_kind, 'Skip closes the pack', v.state);
	} else A(false, 'the booster is affordable (seed choice)', JSON.stringify({ $: v.dollars }));

	A(!errors.length, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
