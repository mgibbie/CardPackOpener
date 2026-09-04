// targeting_commit_smoke.mjs — the gesture that #232/#236 never asserted:
// a DELIBERATE drag-to-attack that commits on release. The earlier harnesses
// only drove fast, no-hesitation drags, so they missed the bug where a drag
// with a pause before it (press the attacker, glance at targets, THEN drag)
// trips the 380ms long-press timer and the pointerup commit bails on
// `longPressFired`. This drives, per (device × attacker):
//   - a creature attack drag with a ~250ms hesitation before moving
//   - a hero-WEAPON attack drag with the same hesitation
// on BOTH desktop mouse and phone touch, and asserts the attack actually
// resolved (attacksUsed / heroAttacksUsed == 1), plus a fast no-hesitation
// drag still works. Standalone (headless Chrome + puppeteer-core); NOT in
// run-all.   node battlecards/tests/integration/targeting_commit_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8872;
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const STATE = { username: 'tgt', friendCode: 'TGT000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { } await sleep(150); } return false; }

async function boot(browser, vp) {
	const page = await browser.newPage();
	await page.setViewport(vp);
	if (vp.isMobile) await page.setUserAgent(PHONE_UA);
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'tgt'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players?.length && window.__game.targeting)), 45000);
	if (!booted) return { page, errors, booted: false };
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(800);
	return { page, errors, booted: true };
}
async function seed(page, weapon) {
	return page.evaluate(w => {
		const g = window.__game, s = g.state, E = g.E;
		const pool = Object.values(s.cardsById).filter(c => c && c.type === 'creature' && c.attack > 0 && c.health >= 5 && !c.activated && !c.titan && !c.magnetic && !c.disguised && !c.adventure);
		const p = s.players[g.HUMAN];
		p.board.length = 0;
		E.summon(s, g.HUMAN, pool[10]);
		E.summon(s, 1 - g.HUMAN, pool[20]);
		const mine = p.board[p.board.length - 1];
		const foe = s.players[1 - g.HUMAN].board.slice(-1)[0];
		mine.sick = false; mine.attacksUsed = 0;
		if (w) { const wp = Object.values(s.cardsById).find(c => c && c.type === 'weapon' && c.attack > 0); if (wp) p.weapon = { ...JSON.parse(JSON.stringify(wp)), keywords: wp.keywords || [], durability: 9 }; p.heroAttacksUsed = 0; }
		s.current = g.HUMAN; s.priority = null; g.pump();
		return { mine: mine.uid, foe: foe.uid };
	}, weapon);
}
const at = (page, uid) => page.evaluate(u => window.__game.screenPosOf(u), uid);
const panelPos = page => page.evaluate(() => window.__game.panelScreenPos());

// press at `from`, hold `holdMs`, drag to `to`, release. touch or mouse.
async function dragAttack(page, touch, from, to, holdMs) {
	if (touch) {
		await page.touchscreen.touchStart(from.x, from.y);
		await sleep(holdMs);
		for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8); await sleep(35); }
		await sleep(80);
		await page.touchscreen.touchEnd();
	} else {
		await page.mouse.move(from.x, from.y); await sleep(50);
		await page.mouse.down();
		await sleep(holdMs);
		for (let i = 1; i <= 8; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8, { steps: 2 }); await sleep(30); }
		await page.mouse.up();
	}
	await sleep(800);
}

async function scenario(browser, label, vp, touch) {
	const { page, errors, booted } = await boot(browser, vp);
	A(booted, `[${label}] booted`);
	if (!booted) { await page.close(); return; }

	// creature attack, 250ms hesitation before the drag (the natural "which
	// target?" beat — this is what tripped the long-press timer)
	{
		const ids = await seed(page, false);
		await sleep(1400);
		await dragAttack(page, touch, await at(page, ids.mine), await at(page, ids.foe), 250);
		const r = await page.evaluate(() => { const g = window.__game, s = g.state; const mi = s.players[g.HUMAN].board[0]; return { used: mi ? mi.attacksUsed : -1, armed: g.targeting.attacker }; });
		A(r.used === 1, `[${label}] creature attack drag with a 250ms hesitation COMMITS`, JSON.stringify(r));
	}
	// hero-WEAPON attack, same hesitation
	{
		const ids = await seed(page, true);
		await sleep(1400);
		const panel = await panelPos(page);
		await dragAttack(page, touch, { x: panel.x, y: panel.y + 4 }, await at(page, ids.foe), 250);
		const r = await page.evaluate(() => { const g = window.__game, s = g.state; return { heroUsed: s.players[g.HUMAN].heroAttacksUsed, armed: g.targeting.attacker }; });
		A(r.heroUsed === 1, `[${label}] hero-weapon attack drag with a 250ms hesitation COMMITS`, JSON.stringify(r));
	}
	// fast no-hesitation creature drag still works (guard against over-correction)
	{
		const ids = await seed(page, false);
		await sleep(1400);
		await dragAttack(page, touch, await at(page, ids.mine), await at(page, ids.foe), 0);
		const r = await page.evaluate(() => { const g = window.__game, s = g.state; const mi = s.players[g.HUMAN].board[0]; return { used: mi ? mi.attacksUsed : -1 }; });
		A(r.used === 1, `[${label}] fast no-hesitation creature drag still COMMITS`, JSON.stringify(r));
	}
	A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, `[${label}] no uncaught client errors`, errors.slice(0, 2).join(' | '));
	await page.close();
}

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		await scenario(browser, 'desktop-mouse', { width: 1440, height: 900, deviceScaleFactor: 1 }, false);
		await scenario(browser, 'phone-touch', { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, true);
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
