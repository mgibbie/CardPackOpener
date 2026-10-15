// micatro_ui_test.mjs — the Micatro front end (micatro/index.html + micatro/js/ui/*).
// Drives a real seeded run in headless Chrome through the UI: main menu -> new run
// -> select blind -> highlight 5 + Play (the score changes, the canvases aren't
// blank) -> Discard -> play out the round -> Cash Out -> buy in the shop -> open a
// pack and take a card -> Next Round. Then the read-only spectator view renders a
// snapshot produced by a REAL engine run (and animates a newer one), and a
// portrait-phone pass checks nothing overflows and Play is reachable.
// Covers micatro/index.html, micatro/css/micatro.css and micatro/js/ui/: main.js, board.js,
// player.js, cardsprite.js, gl.js, screens.js, markup.js, sound.js, assets.js (+ the engine's
// session.js / view.js contract and net.js publish/spectate glue).
//   node overworld/tests/micatro_ui_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8742;
const SEED = 'DEMO2';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'micatroui', friendCode: 'MICUI0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- a real engine run, in node, for the spectator snapshots
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const eng = (p) => import(pathToFileURL(path.join(ROOT, 'micatro/js/engine', p)).href);
const { Session } = await eng('session.js');
const sess = new Session();
sess.start({ seed: 'SPECT1', back: 'b_blue', stake: 1 });
sess.act({ type: 'select_blind' });
const v0 = sess.view();
sess.act({ type: 'highlight', ids: v0.areas.hand.slice(0, 2).map(c => c.id) });
const snapA = { view: sess.view(), events: [] };
const r1 = sess.act({ type: 'highlight', ids: v0.areas.hand.slice(0, 5).map(c => c.id) });
snapA.events = r1.events;
snapA.view = sess.view();
const r2 = sess.act({ type: 'play' });
const snapB = { view: sess.view(), events: r2.events };
// C: the runner discards, but the spectator only receives the last 3 of that action's events
// (a missed publish): view.seq is ahead of what the events cover, so the client must jump
const vB = sess.view();
sess.act({ type: 'highlight', ids: vB.areas.hand.slice(0, 2).map(c => c.id) });
const r3 = sess.act({ type: 'discard' });
const snapC = { view: sess.view(), events: r3.events.slice(-3) };

// ---- server: static files + /api/mp stub (records what the client sent)
const seen = { publish: [], score: [], spec: 0 };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		if (body.action === 'publish-micatro') { seen.publish.push(body); out = { ok: true, watchers: 2, watcherNames: ['bob', 'sam'] }; }
		else if (body.action === 'micatro-state') {
			seen.spec++;
			const which = seen.spec <= 3 ? 1 : seen.spec <= 6 ? 2 : 3;
			const snap = [null, snapA, snapB, snapC][which];
			out = { snapshot: snap, seq: which, label: 'Ante 1 · Round 1 · $4', room: 'u:bob', over: false, watchers: 1, watcherNames: ['micatroui'] };
		}
		else if (body.action === 'run-score') { seen.score.push(body); out = { ok: true, rank: 3 }; }
		else if (body.action === 'run-leaderboard') out = { top: [{ name: 'bob', score: 12345, ante: 4, back: 'b_red', stake: 1 }], you: null };
		else if (body.action === 'chat-get') out = { messages: [] };
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
};`;

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async ({ url, w = 1600, h = 900, signedIn = true, mobile = false }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, signedIn) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.removeItem('micatro_run_v1');
				if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'mic-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { }
		}, STATE, signedIn);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		return { page, errors, ctx };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const V = (page) => page.evaluate(() => window.__micatro.view());
	const clickSel = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await page.click(sel); };
	const clickCard = (page, id) => page.click(`.card[data-id="${id}"]`);
	// hand-vs-controls geometry: every hand card's box against Play/Discard, the screen and the "n/8" counter
	const handGeom = (page) => page.evaluate(() => {
		const R = (el) => el.getBoundingClientRect();
		const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
		const ids = window.__micatro.view().areas.hand.map(c => c.id);
		const cards = ids.map(id => document.querySelector(`.card[data-id="${id}"]`)).filter(Boolean).map(R);
		const btns = ['.b-play', '.b-discard'].map(sel => R(document.querySelector(sel)));
		const lbl = R(document.querySelector('.hand-lbl'));
		const xs = cards.map(r => r.left + r.width / 2).sort((a, b) => a - b);
		const gaps = xs.slice(1).map((x, i) => x - xs[i]);
		return {
			n: cards.length,
			overButtons: cards.filter(c => btns.some(b => hit(c, b))).length,
			offscreen: cards.filter(r => r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5).length,
			underCounter: cards.filter(c => hit(c, lbl)).length,
			gapSpread: gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0,
		};
	});
	const growHand = (page, by) => page.evaluate(async (by) => {
		const C = await import('/micatro/js/engine/core.js');
		C.G.hand.change_size(by);
		window.__micatro.act({ type: 'highlight', ids: [] });   // flushes the queued draw
	}, by);

	// ================================================================ normal run
	{
		const { page, errors, ctx } = await open({ url: '/micatro/' });
		await page.evaluate(BOT);
		A(await page.evaluate(() => window.__micatro.mode === 'normal' && !!document.querySelector('.main-menu .b-menu-play')), 'the main menu shows with a Play button');
		A(await page.evaluate(() => !!document.querySelector('script[src="/site/topbar.js"]') && document.querySelector('meta[name="mp-topbar"]').content === 'compact'), 'the page carries the compact site topbar');

		// New Run: seeded via the setup screen
		await clickSel(page, '.b-menu-play');
		await page.waitForSelector('.new-run', { visible: true });
		A(await page.evaluate(() => document.querySelector('.nr-info .nr-name').textContent.length > 0), 'the deck picker shows the deck name + description');
		await page.click('.seed-on');
		await page.type('.seed-in', SEED);
		await clickSel(page, '.b-start');
		await idle(page);
		let v = await V(page);
		A(v.state === 'BLIND_SELECT' && v.seed === SEED, 'a seeded run starts on blind select', JSON.stringify({ state: v.state, seed: v.seed }));
		A(await page.evaluate(() => document.querySelectorAll('.ov-blinds .blind-col').length === 3), 'three blinds are offered');

		await clickSel(page, '.b-select');
		await idle(page); await sleep(400);
		v = await V(page);
		A(v.state === 'SELECTING_HAND' && v.areas.hand.length === 8, 'selecting the blind deals a hand of 8', v.state);
		A(await page.evaluate(() => document.querySelectorAll('.cards-layer .card').length) >= 8, 'the hand is drawn as card sprites');

		// canvases aren't blank: the WebGL background and a card face
		const px = await page.evaluate(() => {
			const bg = document.getElementById('bg');
			const c = document.createElement('canvas'); c.width = 64; c.height = 64;
			const x = c.getContext('2d'); x.drawImage(bg, 0, 0, 64, 64);
			const d = x.getImageData(0, 0, 64, 64).data; const cols = new Set();
			for (let i = 0; i < d.length; i += 4 * 37) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
			const face = document.querySelector('.cards-layer .card .card-face');
			const fd = face.getContext('2d').getImageData(0, 0, face.width, face.height).data;
			let opaque = 0, colsF = new Set();
			for (let i = 0; i < fd.length; i += 4 * 13) { if (fd[i + 3] > 200) opaque++; colsF.add(fd[i] + ',' + fd[i + 1] + ',' + fd[i + 2]); }
			return { bgColours: cols.size, faceOpaque: opaque, faceColours: colsF.size };
		});
		A(px.bgColours > 4, 'the WebGL background is painted (not one flat colour)', JSON.stringify(px));
		A(px.faceOpaque > 300 && px.faceColours > 3, 'a card face canvas has the card art drawn', JSON.stringify(px));

		// highlight 5 via the test hook, the hand preview fills in, then Play (a real click)
		const five = v.areas.hand.slice(0, 5).map(c => c.id);
		await page.evaluate(ids => window.__micatro.act({ type: 'highlight', ids }), five);
		await idle(page); await sleep(150);
		const prev = await page.evaluate(() => ({ name: document.querySelector('.hh-hand').textContent.trim(), chips: document.querySelector('.hh-chips').textContent }));
		A(prev.name.length > 1 && +prev.chips > 0, 'the selected cards preview a poker hand with chips × mult', JSON.stringify(prev));
		const before = (await V(page)).chips;
		await clickSel(page, '.b-play');
		await sleep(300);
		A(await page.evaluate(() => !window.__micatro.idle()), 'playing a hand starts a blocking animation sequence');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.pop-layer .popup').length > 0), 6000), 'scoring shows status popups over the cards');
		await idle(page); await sleep(300);
		v = await V(page);
		const shown = await page.evaluate(() => document.querySelector('.hs-num').textContent.replace(/,/g, ''));
		A(v.chips > before && +shown === v.chips, 'the round score rises and the HUD shows it', JSON.stringify({ before, after: v.chips, shown }));
		A(v.hands_left === 3 && await page.evaluate(() => document.querySelector('.s-hands .stat-v').textContent) === '3', 'hands left ticks down in the HUD');

		// discard two cards picked with real clicks
		if (v.state === 'SELECTING_HAND') {
			const two = v.areas.hand.slice(-2).map(c => c.id);
			for (const id of two) { await clickCard(page, id); await idle(page); await sleep(120); }
			const hl = (await V(page)).areas.hand.filter(c => c.hl).map(c => c.id);
			A(hl.length === 2 && two.every(id => hl.includes(id)), 'clicking hand cards highlights them', JSON.stringify(hl));
			const d0 = (await V(page)).discards_left;
			await clickSel(page, '.b-discard');
			await idle(page); await sleep(200);
			v = await V(page);
			A(v.discards_left === d0 - 1 && v.areas.hand.length === 8 && !v.areas.hand.some(c => two.includes(c.id)), 'Discard throws the two away and redraws', JSON.stringify({ d: v.discards_left, n: v.areas.hand.length }));
		}

		// drag a hand card with the mouse: the engine gets a 'reorder'
		if (v.state === 'SELECTING_HAND') {
			const o0 = v.areas.hand.map(c => c.id);
			const pts = await page.evaluate((a, b) => { const r = (id) => document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect(); const ra = r(a), rb = r(b); return { x0: ra.left + ra.width / 2, y0: ra.top + ra.height / 2, x1: rb.left + rb.width * 0.8, y1: rb.top + rb.height / 2 }; }, o0[0], o0[3]);
			await page.mouse.move(pts.x0, pts.y0); await page.mouse.down();
			for (let i = 1; i <= 12; i++) { await page.mouse.move(pts.x0 + (pts.x1 - pts.x0) * i / 12, pts.y0 + (pts.y1 - pts.y0) * i / 12); await sleep(16); }
			await page.mouse.up(); await idle(page); await sleep(200);
			v = await V(page);
			const o1 = v.areas.hand.map(c => c.id);
			A(o1.indexOf(o0[0]) >= 3 && o1.slice().sort().join() === o0.slice().sort().join() && !v.areas.hand.some(c => c.hl), 'dragging a hand card reorders the hand (no selection)', JSON.stringify({ o0: o0.slice(0, 5), o1: o1.slice(0, 5) }));
		}

		// play out the round
		for (let guard = 0; guard < 14; guard++) {
			v = await V(page);
			if (v.state !== 'SELECTING_HAND') break;
			const bh = await page.evaluate(() => window.__bestHand());
			const need = (v.blind.chips - v.chips) / v.hands_left;
			let ids = bh.best, act = 'play';
			if (bh.bestScore < need && v.discards_left > 0) { const d = bh.all.filter(id => !bh.best.includes(id)).slice(0, 5); if (d.length) { ids = d; act = 'discard'; } }
			await page.evaluate(ids => window.__micatro.act({ type: 'highlight', ids }), ids);
			await idle(page);
			await page.evaluate(a => window.__micatro.act({ type: a }), act);
			await idle(page);
		}
		v = await V(page);
		A(v.state === 'ROUND_EVAL' && v.chips >= v.blind.chips, 'the blind is beaten and the round is evaluated', JSON.stringify({ state: v.state, chips: v.chips }));
		A(await page.evaluate(() => !!document.querySelector('.ov-eval .b-cashout') && document.querySelectorAll('.eval-row').length >= 1), 'the cash-out panel lists the earnings');

		const $before = v.dollars;
		await clickSel(page, '.b-cashout');
		await idle(page); await sleep(400);
		v = await V(page);
		A(v.state === 'SHOP' && v.dollars > $before, 'Cash Out pays out and opens the shop', JSON.stringify({ state: v.state, $: v.dollars }));
		A(await page.evaluate(() => document.querySelectorAll('.price-tag').length >= 3 && !!document.querySelector('.shop-panel')), 'shop items wear price tags');

		// buy: click a shop card to select it, then its Buy button
		const buyable = v.areas.shop_jokers.find(c => c.cost <= v.dollars);
		if (buyable) {
			const nJ = v.areas.jokers.length + v.areas.consumeables.length;
			await clickCard(page, buyable.id); await sleep(250);
			await clickSel(page, `.card[data-id="${buyable.id}"] .card-btns .buy`);
			await idle(page); await sleep(200);
			const v2 = await V(page);
			A(v2.areas.jokers.length + v2.areas.consumeables.length === nJ + 1 && v2.dollars === v.dollars - buyable.cost, 'Buy moves the card into your jokers/consumables and charges for it', JSON.stringify({ name: buyable.name, cost: buyable.cost }));
			v = v2;
		} else A(false, 'something in the shop is affordable (seed choice)');

		// open a booster pack and take a card
		const pack = v.areas.shop_booster.find(c => c.cost <= v.dollars);
		if (pack) {
			await clickCard(page, pack.id); await sleep(250);
			await clickSel(page, `.card[data-id="${pack.id}"] .card-btns .buy`);
			await idle(page); await sleep(300);
			v = await V(page);
			A(!!v.pack_kind && v.areas.pack_cards.length > 0 && await page.evaluate(() => !!document.querySelector('.pack-head')), 'opening a booster shows its cards and the pack header', JSON.stringify({ kind: v.pack_kind }));
			const pc = v.areas.pack_cards[0];
			if (v.areas.hand.length) { await clickCard(page, v.areas.hand[0].id); await idle(page); }
			await clickCard(page, pc.id); await sleep(250);
			await clickSel(page, `.card[data-id="${pc.id}"] .card-btns .buy`);
			await idle(page); await sleep(200);
			v = await V(page);
			if (v.pack_kind) { await clickSel(page, '.b-skip-pack'); await idle(page); v = await V(page); }
			A(v.state === 'SHOP' && !v.pack_kind, 'taking a card closes the pack and returns to the shop', v.state);
		} else A(false, 'a booster in the shop is affordable (seed choice)');

		// Run Info + deck viewer open and close
		await clickSel(page, '.b-runinfo');
		A(await page.evaluate(() => document.querySelectorAll('.hand-row').length >= 9), 'Run Info lists the poker hands');
		await page.keyboard.press('Escape'); await sleep(200);
		await page.click('.deck-pile');
		A(await page.evaluate(() => document.querySelectorAll('.dv-row .mini-card').length >= 52), 'the deck viewer shows the whole deck');
		await page.keyboard.press('Escape'); await sleep(200);

		await clickSel(page, '.b-next');
		await idle(page); await sleep(200);
		v = await V(page);
		A(v.state === 'BLIND_SELECT' && v.round === 1, 'Next Round goes back to blind select', JSON.stringify({ state: v.state, round: v.round }));

		// broadcast to friends: snapshots carry the view + the UI events
		await waitFor(() => seen.publish.some(b => b.snapshot && b.snapshot.view && b.snapshot.view.state === 'BLIND_SELECT' && b.snapshot.view.round === 1), 8000);
		const pubs = seen.publish.filter(b => b.snapshot);
		A(pubs.length > 0 && pubs.some(b => Array.isArray(b.snapshot.events) && b.snapshot.events.length > 0) && /^Ante \d+ · Round \d+ · \$\d+/.test(pubs[pubs.length - 1].label), 'a signed-in run publishes {view, events} snapshots with an "Ante · Round · $" label', JSON.stringify({ n: pubs.length, label: pubs.length ? pubs[pubs.length - 1].label : null }));
		A(await waitFor(() => page.evaluate(() => /2 watching/.test((document.getElementById('watchers') || {}).textContent || '')), 5000), 'the watcher count badge shows who is watching');
		A(await page.evaluate(() => typeof window.__micatro.session.recipe === 'object' && localStorage.getItem('micatro_run_v1') != null), 'the run is saved locally for Continue');

		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors during the run', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ layout sizes
	{
		const { page, errors, ctx } = await open({ url: '/micatro/', signedIn: false });
		await page.evaluate(() => window.__micatro.newRun({ seed: 'LAYOUT1' }));
		await idle(page);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page); await sleep(900);
		let g = await handGeom(page);
		A(g.n === 8 && g.overButtons === 0 && g.offscreen === 0 && g.underCounter === 0, '1600×900, 8 cards: the hand clears Play/Discard and the counter', JSON.stringify(g));
		await growHand(page, 4);
		await idle(page); await sleep(900);
		g = await handGeom(page);
		A(g.n === 12 && g.overButtons === 0 && g.offscreen === 0 && g.underCounter === 0 && g.gapSpread < 2, '1600×900, 12 cards: the fan compresses evenly instead of spilling', JSON.stringify(g));
		for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]]) {
			await page.setViewport({ width: w, height: h }); await sleep(900);
			g = await handGeom(page);
			A(g.n === 12 && g.overButtons === 0 && g.offscreen === 0 && g.underCounter === 0, `${w}×${h}, 12 cards: no hand/controls overlap`, JSON.stringify(g));
		}
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no console errors across resizes', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ spectator
	{
		const { page, errors, ctx } = await open({ url: '/micatro/?spectate=bob' });
		A(await page.evaluate(() => window.__micatro.mode === 'spectate'), 'spectate mode is picked from ?spectate=');
		A(await waitFor(() => page.evaluate(() => /Watching\s*bob/.test(document.querySelector('.banner') ? document.querySelector('.banner').textContent : '')), 8000), 'a "Watching bob" banner is shown');
		A(await waitFor(() => page.evaluate(() => window.__micatro.board.view && window.__micatro.board.view.state === 'SELECTING_HAND'), 8000), 'the spectator renders the runner\'s snapshot');
		A(await waitFor(() => page.evaluate((n) => document.querySelectorAll('.cards-layer .card').length >= n, snapA.view.areas.hand.length), 4000), 'the runner\'s hand is drawn for the spectator');
		A(!!snapA.view.preview && await waitFor(() => page.evaluate((p) => document.querySelector('.hh-hand').textContent.trim() === p.name && document.querySelector('.hh-chips').textContent === String(p.chips), snapA.view.preview), 3000), 'the spectator sees the runner\'s selected-hand preview (view.preview)', JSON.stringify(snapA.view.preview));
		// the next snapshot carries newer events: they animate (not a jump) up to the new view
		const lastSeqB = snapB.events[snapB.events.length - 1].seq;
		A(await waitFor(() => page.evaluate(() => window.__micatro.player.lastSeq), 6000) && await waitFor(() => page.evaluate((s) => window.__micatro.player.lastSeq === s, lastSeqB), 8000), 'a newer snapshot\'s events are played back', JSON.stringify(await page.evaluate(() => window.__micatro.player.lastSeq)));
		await waitFor(() => page.evaluate(() => window.__micatro.idle()), 15000);
		A(await page.evaluate((c) => window.__micatro.board.view.chips === c && document.querySelector('.hs-num').textContent.replace(/,/g, '') === String(c), snapB.view.chips), 'after playback the spectator shows the runner\'s score');
		// C skips events: view.seq says so, and the spectator jumps straight to the new view
		A(await waitFor(() => page.evaluate((s) => window.__micatro.player.lastSeq === s, snapC.view.seq), 12000) &&
			await page.evaluate((c) => window.__micatro.board.view.discards_left === c.discards_left && window.__micatro.board.view.seq === c.seq, snapC.view),
			'a snapshot whose view.seq is ahead of its events jumps instead of half-animating', JSON.stringify({ seq: snapC.view.seq, events: snapC.events.length }));
		A(await page.evaluate(() => document.querySelector('.controls').classList.contains('readonly') && document.querySelector('.b-play').disabled), 'spectators can\'t act (controls are read-only)');
		const r = await page.evaluate(() => window.__micatro.act({ type: 'play' }));
		A(r && r.ok === false, 'the act hook refuses actions in spectate mode');
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no console errors while spectating', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ phone portrait
	{
		const { page, errors, ctx } = await open({ url: '/micatro/?direct=1', w: 390, h: 844, signedIn: false, mobile: true });
		A(await page.evaluate(() => !!document.querySelector('.login-link')), 'a guest sees the "log in to let friends watch" link');
		A(await page.evaluate(() => { const a = document.querySelector('.main-menu .back-link'); return !!a && a.getAttribute('href') === '/overworld/' && /overworld/i.test(a.textContent); }), '?direct=1 (the arcade cabinet) offers "Back to the overworld"');
		await page.evaluate(() => window.__micatro.newRun({ seed: 'PHONE1' }));
		await idle(page);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page); await sleep(500);
		const lay = await page.evaluate(() => {
			const st = document.getElementById('stage').getBoundingClientRect();
			const b = document.querySelector('.b-play').getBoundingClientRect();
			const cards = [...document.querySelectorAll('.cards-layer .card')].map(c => c.getBoundingClientRect());
			const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
			return {
				portrait: document.getElementById('stage').classList.contains('portrait'),
				sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
				stage: { l: st.left, r: st.right, t: st.top, b: st.bottom },
				play: { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height },
				playHit: !!hit && (hit === document.querySelector('.b-play') || document.querySelector('.b-play').contains(hit)),
				cardsIn: cards.every(r => r.left >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2),
				cardW: cards.length ? cards[0].width : 0,
			};
		});
		A(lay.portrait, 'a phone in portrait gets the portrait layout');
		A(lay.sw <= 390 && lay.sh <= 844, 'the page never scrolls sideways or down', JSON.stringify({ sw: lay.sw, sh: lay.sh }));
		A(lay.stage.l >= -1 && lay.stage.r <= 391 && lay.stage.t >= -1 && lay.stage.b <= 845, 'the table fits the screen', JSON.stringify(lay.stage));
		A(lay.cardsIn && lay.cardW >= 40, 'the hand fits on screen with tappable cards', JSON.stringify({ cardW: lay.cardW }));
		A(lay.play.b <= 844 && lay.play.t >= 0 && lay.play.w >= 80 && lay.play.h >= 40 && lay.playHit, 'Play Hand is on screen, big enough and not covered', JSON.stringify(lay.play));
		let pg = await handGeom(page);
		A(pg.n === 8 && pg.offscreen === 0 && pg.underCounter === 0 && pg.overButtons === 0 && pg.gapSpread < 2, '390×844, 8 cards: an even fan, fully on screen, the counter covers nothing', JSON.stringify(pg));
		// tap two cards and Play with touch
		const ids = (await V(page)).areas.hand.slice(0, 2).map(c => c.id);
		for (const id of ids) { await page.tap(`.card[data-id="${id}"]`); await idle(page); await sleep(150); }
		await page.tap('.b-play');
		await sleep(400); await idle(page);
		const v = await V(page);
		A(v.hands_left === 3 && v.chips > 0, 'tapping cards + Play works on touch', JSON.stringify({ hands: v.hands_left, chips: v.chips }));
		await growHand(page, 4);
		await idle(page); await sleep(900);
		pg = await handGeom(page);
		A(pg.n === 12 && pg.offscreen === 0 && pg.underCounter === 0 && pg.overButtons === 0 && pg.gapSpread < 2, '390×844, 12 cards: the fan compresses to fit the width', JSON.stringify(pg));
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no console errors on the phone layout', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
