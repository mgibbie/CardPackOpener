// micatro_gamepad_test.mjs — controller play for Micatro (micatro/js/ui/pad.js on the
// shared site/gamepad.js core, Nintendo layout: RIGHT face confirms, BOTTOM cancels).
// A fake pad rides in window.__owFakePads (headless Chrome has no controllers) and
// plays a whole round with nothing but pad presses: menu -> new run -> select blind
// -> pick 5 cards -> Play (L) -> Discard (R) -> beat the blind -> Cash Out -> buy in
// the shop -> open a pack and take a card -> Next Round. Also: hold-confirm moves a
// card, top face sorts, left face shows card info, Start pauses, the hint bar shows
// the right glyphs, and a signed-out (guest) pad drives the game exactly the same
// (the owner dropped the signed-in-only rule on 2026-10-18).
// Covers micatro/js/ui/pad.js (+ board.js / screens.js / main.js wiring) on site/gamepad.js.
//   node overworld/tests/micatro_gamepad_test.mjs
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
const PORT = 8743;
const SEED = 'DEMO2';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'micatropad', friendCode: 'MICPD0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, messages: [] })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

// standard mapping by position; Nintendo layout: right face (1) = confirm, bottom (0) = cancel
const B = { cancel: 0, confirm: 1, context: 2, secondary: 3, L: 4, R: 5, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

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
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const open = async (url, signedIn = true) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, signedIn) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.removeItem('micatro_run_v1');
				if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'pad-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				else { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); }
			} catch { }
		}, STATE, signedIn);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && window.__micatroPad)), 30000);
		await sleep(400);
		const tap = async (b, hold = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(hold); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(140); };
		return { page, errors, ctx, tap };
	};

	// ------------------------------------------------------------- signed in
	{
		const { page, errors, ctx, tap } = await open(`/micatro/?seed=${SEED}`);
		await page.evaluate(BOT);
		const idle = () => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
		const V = () => page.evaluate(() => window.__micatro.view());
		const focus = () => page.evaluate(() => { const f = window.__micatroPad.focus; return f ? (f.card != null ? { card: f.card, area: f.area } : { cls: String(f.cls) }) : null; });
		// walk the reticle to a card (or a selector) with the d-pad
		const focusTo = async (target) => {
			for (let i = 0; i < 30; i++) {
				const step = await page.evaluate((t) => {
					const f = window.__micatroPad.focus;
					const elOf = (x) => (x.card != null ? document.querySelector(`.card[data-id="${x.card}"]`) : x.el);
					const tgt = typeof t === 'number' ? document.querySelector(`.card[data-id="${t}"]`) : document.querySelector(t);
					if (!f || !tgt) return 'none';
					const fe = elOf(f);
					if (fe === tgt) return 'done';
					const a = fe.getBoundingClientRect(), b = tgt.getBoundingClientRect();
					const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
					return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
				}, target);
				if (step === 'done') return true;
				if (step === 'none') { await tap(B.right); continue; }
				await tap(B[step]);
			}
			return false;
		};

		// main menu -> New Run -> Play, all by pad
		A(await waitFor(() => page.evaluate(() => getComputedStyle(document.getElementById('pad-hints')).display !== 'none'), 3000), 'a connected pad shows the button-hint bar');
		await tap(B.right);  // first press only shows the reticle
		A(await page.evaluate(() => document.querySelector('.pad-reticle').style.display !== 'none'), 'the first press shows the focus reticle');
		let f = await focus();
		A(f && /b-menu-play/.test(f.cls), 'focus starts on the menu\'s Play button', JSON.stringify(f));
		await tap(B.confirm);
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.new-run')), 3000), 'confirm opens the New Run screen');
		await sleep(200);
		A(await page.evaluate(() => document.querySelector('.seed-on').checked && document.querySelector('.seed-in').value === 'DEMO2'), '?seed= pre-fills the seeded-run field');
		f = await focus();
		A(f && /b-start/.test(f.cls), 'focus lands on the New Run screen\'s Play', JSON.stringify(f));
		await tap(B.confirm);
		await idle();
		let v = await V();
		A(v && v.state === 'BLIND_SELECT' && v.seed === SEED, 'the seeded run starts on blind select', JSON.stringify(v && { state: v.state, seed: v.seed }));

		// blind select: focus homes onto Select
		await sleep(200);
		f = await focus();
		A(f && /b-select/.test(f.cls), 'blind select homes the reticle on Select', JSON.stringify(f));
		await tap(B.confirm);
		await idle(); await sleep(300);
		v = await V();
		A(v.state === 'SELECTING_HAND', 'confirm selects the blind', v.state);
		f = await focus();
		A(f && f.area === 'hand', 'focus moves onto the hand', JSON.stringify(f));

		// hold confirm + right moves the focused card one slot right
		const order0 = v.areas.hand.map(c => c.id);
		await focusTo(order0[0]);
		await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, B.confirm); await sleep(120);
		await tap(B.right);
		await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, B.confirm); await sleep(200);
		await idle();
		v = await V();
		A(v.areas.hand[1].id === order0[0] && v.areas.hand[0].id === order0[1] && !v.areas.hand.some(c => c.hl), 'hold confirm + → moves the card (and does not select it)', JSON.stringify(v.areas.hand.slice(0, 2).map(c => c.id)));
		// top face sorts the hand (rank <-> suit)
		const before = v.areas.hand.map(c => c.id).join();
		await tap(B.secondary); await idle(); await sleep(150);
		v = await V();
		A(v.areas.hand.map(c => c.id).join() !== before, 'the top face sorts the hand', JSON.stringify({ before }));
		// left face: card info
		await tap(B.context); await sleep(200);
		A(await page.evaluate(() => document.querySelector('.tip').style.display !== 'none' && document.querySelector('.tip-name').textContent.length > 0), 'the left face shows the focused card\'s info');
		await tap(B.context); await sleep(150);
		A(await page.evaluate(() => /Play/.test(document.getElementById('pad-hints').textContent) && /Discard/.test(document.getElementById('pad-hints').textContent)), 'the hint bar names L/R as Play / Discard in a round');

		// pick 5 cards with d-pad + confirm, Play with L
		const pickAndDo = async (ids, button) => {
			for (const id of ids) { await focusTo(id); await tap(B.confirm); await idle(); }
			const hl = (await V()).areas.hand.filter(c => c.hl).map(c => c.id).sort().join();
			const ok = hl === ids.slice().sort().join();
			await tap(button); await sleep(200); await idle(); await sleep(150);
			return ok;
		};
		let bh = await page.evaluate(() => window.__bestHand());
		const five = bh.best.slice(0, 5);
		const c0 = (await V()).chips;
		A(await pickAndDo(five, B.L), 'd-pad + confirm selects exactly the chosen cards');
		v = await V();
		A(v.chips > c0 && v.hands_left === 3, 'L plays the hand and it scores', JSON.stringify({ chips: v.chips, hands: v.hands_left }));
		// discard with R
		if (v.state === 'SELECTING_HAND') {
			const d0 = v.discards_left;
			const two = v.areas.hand.slice(-2).map(c => c.id);
			await pickAndDo(two, B.R);
			v = await V();
			A(v.discards_left === d0 - 1 && !v.areas.hand.some(c => two.includes(c.id)), 'R discards the selected cards', JSON.stringify({ d: v.discards_left }));
		}
		// beat the blind
		for (let guard = 0; guard < 14; guard++) {
			v = await V();
			if (v.state !== 'SELECTING_HAND') break;
			bh = await page.evaluate(() => window.__bestHand());
			const need = (v.blind.chips - v.chips) / v.hands_left;
			if (bh.bestScore < need && v.discards_left > 0) {
				const d = bh.all.filter(id => !bh.best.includes(id)).slice(0, 5);
				if (d.length) { await pickAndDo(d, B.R); continue; }
			}
			await pickAndDo(bh.best, B.L);
		}
		v = await V();
		A(v.state === 'ROUND_EVAL', 'the round is won with pad play alone', JSON.stringify({ state: v.state, chips: v.chips }));
		await sleep(200);
		await tap(B.L);  // Cash Out
		await idle(); await sleep(300);
		v = await V();
		A(v.state === 'SHOP', 'L cashes out into the shop', v.state);

		// shop: confirm on a shop card buys it
		const item = v.areas.shop_jokers.find(c => c.cost <= v.dollars);
		if (item) {
			const n0 = v.areas.jokers.length + v.areas.consumeables.length;
			A(await focusTo(item.id), 'the reticle reaches the shop item');
			await tap(B.confirm); await idle(); await sleep(200);
			const v2 = await V();
			A(v2.areas.jokers.length + v2.areas.consumeables.length === n0 + 1 && v2.dollars === v.dollars - item.cost, 'confirm buys the focused shop card', JSON.stringify({ name: item.name }));
			v = v2;
		} else A(false, 'an affordable shop card exists (seed choice)');
		const pack = v.areas.shop_booster.find(c => c.cost <= v.dollars);
		if (pack) {
			A(await focusTo(pack.id), 'the reticle reaches a booster pack');
			await tap(B.confirm); await idle(); await sleep(300);
			v = await V();
			A(!!v.pack_kind, 'confirm opens the booster', JSON.stringify({ kind: v.pack_kind }));
			await sleep(200);
			f = await focus();
			A(f && f.area === 'pack_cards', 'focus homes onto the pack\'s cards', JSON.stringify(f));
			await tap(B.confirm); await idle(); await sleep(200);
			v = await V();
			if (v.pack_kind) { await tap(B.R); await idle(); v = await V(); }  // a card that needs targets: skip with R
			A(v.state === 'SHOP' && !v.pack_kind, 'taking a card (or R = skip) closes the pack', v.state);
		} else A(false, 'an affordable booster exists (seed choice)');

		// Start pauses; cancel resumes
		await tap(B.start); await sleep(250);
		A(await page.evaluate(() => !!document.querySelector('.pause-modal')), 'Start opens the pause menu');
		f = await focus();
		A(f && /b-resume/.test(f.cls || ''), 'the pause menu focuses Resume', JSON.stringify(f));
		await tap(B.cancel); await sleep(250);
		A(await page.evaluate(() => !document.querySelector('.pause-modal')), 'cancel closes the pause menu');

		await sleep(200);
		await tap(B.L);  // Next Round
		await idle(); await sleep(200);
		v = await V();
		A(v.state === 'BLIND_SELECT' && v.round === 1, 'L leaves the shop for the next blind', JSON.stringify({ state: v.state, round: v.round }));

		// into the next round, then a phone in portrait: the hint bar must not cover Play / Discard
		await sleep(250);
		await tap(B.confirm); await idle(); await sleep(300);
		await page.setViewport({ width: 390, height: 844 }); await sleep(900);
		const hb = await page.evaluate(() => {
			const R = (el) => el.getBoundingClientRect();
			const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
			const hint = R(document.getElementById('pad-hints'));
			const btns = ['.b-play', '.b-discard'].map(s => R(document.querySelector(s)));
			return { state: window.__micatro.view().state, shown: getComputedStyle(document.getElementById('pad-hints')).display !== 'none', covers: btns.some(b => hit(hint, b)), hint: { t: hint.top, b: hint.bottom }, btn: { t: btns[0].top, b: btns[0].bottom } };
		});
		A(hb.state === 'SELECTING_HAND' && hb.shown && !hb.covers && hb.hint.b <= 844, '390×844 with a pad: the hint bar sits clear of Play / Discard', JSON.stringify(hb));
		await page.setViewport({ width: 1600, height: 900 }); await sleep(400);

		// the mouse takes over: the reticle hides
		await page.mouse.move(400, 400); await page.mouse.move(420, 420); await sleep(150);
		A(await page.evaluate(() => document.querySelector('.pad-reticle').style.display === 'none'), 'moving the mouse hides the reticle');

		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors during pad play', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ------------------------------------------------------------- signed out (guest)
	{
		const { page, ctx, tap } = await open('/micatro/', false);
		A(await waitFor(() => page.evaluate(() => getComputedStyle(document.getElementById('pad-hints')).display !== 'none'), 3000), 'guest: a connected pad shows the button-hint bar');
		await tap(B.right);
		A(await page.evaluate(() => document.querySelector('.pad-reticle').style.display !== 'none'), 'guest: the first press shows the focus reticle');
		await tap(B.confirm);
		const opened = await waitFor(() => page.evaluate(() => !!document.querySelector('.new-run')), 3000);
		const st = await page.evaluate(() => ({ toast: (document.querySelector('.toast') || {}).textContent || '', hints: document.getElementById('pad-hints').textContent }));
		A(opened && !/log in to use a controller/i.test(st.toast + st.hints), 'guest: confirm opens the New Run screen, and nothing says "Log in to use a controller"', JSON.stringify(st));
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
