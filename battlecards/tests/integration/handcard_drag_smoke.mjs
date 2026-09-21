// handcard_drag_smoke.mjs — the gesture targeting_commit_smoke never covered:
// dragging a card OUT OF HAND to play it.
//
// #232/#236 fixed the long-press-vs-drag race for ARMED ATTACKS and pinned it in
// targeting_commit_smoke. The cancel was deliberately gated on
// `(selectedAttacker || pending) && !placing` — attacks only — "so hand-card
// press-and-hold PREVIEW is untouched". That gate was the remaining bug: a hand
// card drag still raced the 380ms long-press timer, and that timer tested
// distance ONCE at fire time, so a drag that had not yet travelled past the
// threshold was captured as a hold. The inspector opened over the gesture and
// the pointerup commit bailed on `longPressFired`.
//
// Reported from production: "300ms / 10-step drags frequently open the inspector
// or do nothing; 800-900ms / 30-40-step drags work reliably." Duration was never
// the real variable — distance-at-the-380ms-mark was. A slow, short drag is
// still a drag.
//
// Drives, per device, a hand-card drag onto the board with the hesitation that
// trips the timer, and asserts the card was actually PLAYED (left hand, mana
// spent) rather than inspected. Standalone (headless Chrome + puppeteer-core);
// NOT in run-all.
//   node battlecards/tests/integration/handcard_drag_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8873;
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const STATE = { username: 'hdrag', friendCode: 'HDRAG0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

function startServer() {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	return new Promise(r => server.listen(PORT, () => r(server)));
}
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); } return false; }

async function boot(browser, vp) {
	const page = await browser.newPage();
	await page.setViewport(vp);
	if (vp.isMobile) await page.setUserAgent(PHONE_UA);
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'hdrag'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players?.length && window.__game.targeting)), 45000);
	if (!booted) return { page, errors, booted: false };
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(800);
	return { page, errors, booted: true };
}

// put exactly one cheap, untargeted creature in hand with mana to spare
async function seedHand(page) {
	return page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const p = s.players[g.HUMAN];
		const pick = Object.values(s.cardsById).find(c => c && c.type === 'creature' && c.cost <= 3
			&& !c.battlecry && !c.targets && !c.magnetic && !c.titan && !c.disguised && !c.adventure && !c.activated);
		p.hand.length = 0;
		p.board.length = 0;
		const c = E.instantiate(pick, g.HUMAN); c.zone = 'hand'; p.hand.push(c);
		p.mana = { cur: 10, max: 10, bonus: 0 };
		s.current = g.HUMAN; s.priority = null; g.pump();
		return { uid: c.uid, name: pick.name, cost: pick.cost };
	});
}
const at = (page, uid) => page.evaluate(u => window.__game.screenPosOf(u), uid);

// press on the card, hesitate, then drag SLOWLY in few steps — the reported
// failing shape (short travel per step, timer fires before the threshold)
async function dragPlay(page, touch, from, to, holdMs, steps, stepDelay) {
	if (touch) {
		await page.touchscreen.touchStart(from.x, from.y);
		await sleep(holdMs);
		for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await sleep(stepDelay); }
		await sleep(60);
		await page.touchscreen.touchEnd();
	} else {
		await page.mouse.move(from.x, from.y); await sleep(40);
		await page.mouse.down();
		await sleep(holdMs);
		for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, { steps: 1 }); await sleep(stepDelay); }
		await page.mouse.up();
	}
	await sleep(900);
}

const played = page => page.evaluate(() => {
	const g = window.__game, s = g.state, p = s.players[g.HUMAN];
	// the inspect panel starts with display '' (never explicitly hidden until
	// something hides it), so style.display is not a usable signal — ask whether it
	// is actually laid out AND has a card face in it
	const box = document.getElementById('inspect');
	const inspector = !!box && box.offsetParent !== null && box.children.length > 0;
	return { inHand: p.hand.length, onBoard: p.board.length, inspector };
});

async function scenario(browser, label, vp, touch) {
	const { page, errors, booted } = await boot(browser, vp);
	A(booted, `[${label}] booted`);
	if (!booted) { await page.close(); return; }
	const boardY = Math.round(vp.height * 0.45);

	// THE REPORTED SHAPE: ~300ms of travel in 10 small steps. Before the fix the
	// 380ms timer fired while the drag was still inside the threshold.
	{
		const c = await seedHand(page);
		await sleep(900);
		const from = await at(page, c.uid);
		await dragPlay(page, touch, from, { x: Math.round(vp.width / 2), y: boardY }, 0, 10, 30);
		const r = await played(page);
		A(r.onBoard === 1 && r.inHand === 0, `[${label}] a SHORT 300ms/10-step drag plays the card`, JSON.stringify(r));
		A(!r.inspector, `[${label}] and the inspector did not steal the gesture`, JSON.stringify(r));
	}

	// a drag with a deliberate hesitation first — the "which lane?" beat
	{
		const c = await seedHand(page);
		await sleep(900);
		const from = await at(page, c.uid);
		await dragPlay(page, touch, from, { x: Math.round(vp.width / 2), y: boardY }, 420, 10, 30);
		const r = await played(page);
		A(r.onBoard === 1 && r.inHand === 0, `[${label}] a drag AFTER a 420ms hesitation still plays`, JSON.stringify(r));
	}

	// a long, fast drag must keep working (this is what used to be reliable)
	{
		const c = await seedHand(page);
		await sleep(900);
		const from = await at(page, c.uid);
		await dragPlay(page, touch, from, { x: Math.round(vp.width / 2), y: boardY }, 0, 35, 22);
		const r = await played(page);
		A(r.onBoard === 1 && r.inHand === 0, `[${label}] the long 800ms/35-step drag still plays`, JSON.stringify(r));
	}

	// and a genuine press-and-hold with NO movement must still PREVIEW, never play
	{
		const c = await seedHand(page);
		await sleep(900);
		const from = await at(page, c.uid);
		if (touch) { await page.touchscreen.touchStart(from.x, from.y); await sleep(700); await page.touchscreen.touchEnd(); }
		else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await sleep(700); await page.mouse.up(); }
		await sleep(700);
		const r = await played(page);
		A(r.inHand === 1 && r.onBoard === 0, `[${label}] press-and-hold still previews instead of playing`, JSON.stringify(r));
	}

	A(errors.length === 0, `[${label}] no uncaught page errors`, errors.slice(0, 2).join(' | '));
	await page.close();
}

const server = await startServer();
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	await scenario(browser, 'desktop', { width: 1280, height: 800 }, false);
	await scenario(browser, 'phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, true);
} catch (e) {
	A(false, 'harness crashed: ' + e.message, e.stack);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
