// bc_pad_touch_test.mjs — Battlecards on a CONTROLLER and on TOUCH (controls sweep B3).
//
// Controller (a fake pad in window.__owFakePads through the real site/gamepad.js poller):
//   * the boards page and /collection/ (no controller support before): the d-pad
//     moves a ring, RB switches boards, A picks, B goes back; on the collection a
//     focused card shows its text and Y toggles it;
//   * the match: Start opens the menu and its new Leave opens the Games switcher;
//     B in the deck builder's card page closes it and stays (regression: the pad's
//     B sent Esc, and nav.js left the page).
// Touch (page.touchscreen.tap, 390x844 portrait and 844x390 landscape):
//   * the gallery and deck builder: tap a card -> its zoom, tap ✕ closes;
//   * /collection/: a long-press shows a card's text and does NOT open the link;
//   * the match (landscape): tap "Keep hand".
//
//   node overworld/tests/bc_pad_touch_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9173;
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards;
const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/pool-rarity.json'), 'utf8'));
const owned = Object.keys(POOL).filter(id => CARDS.some(c => c.id === id)).slice(0, 30);
const STATE = { username: 'bcpad', friendCode: 'BCPAD0', decks: [], collection: Object.fromEntries(owned.map(id => [id, 2])), dust: 0, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let action = ''; try { action = JSON.parse(body).action || ''; } catch (e) {}
			const out = /leaderboard/.test(action) ? { ok: true, top: [{ name: 'alice', rating: 1200, wins: 5, losses: 1, hero: 'Jaina' }], you: null }
				: { ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null };
			res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
		}
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

// Standard mapping by position; Nintendo layout = RIGHT face confirms, BOTTOM cancels, LEFT = context (Y)
const BTN = { bottom: 0, right: 1, left: 2, top: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, leftD: 14, rightD: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (url, { signedIn = true, pad = true, vp = { width: 1280, height: 720 } } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, signedIn, pad) => {
			const p = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = pad ? [p] : []; window.__pad = p;
			localStorage.setItem('mp_onboarded_v1', '1');
			if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'bcpad-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
		}, STATE, signedIn, pad);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const tap = async (b, ms = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(ms); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(160); };
		const ring = () => page.evaluate(() => { const f = document.querySelector('.padnav-focus, .focusnav-focus'); return f ? { tag: f.tagName, id: f.id, text: (f.textContent || '').trim().slice(0, 40), cls: String(f.className) } : null; });
		const touch = async sel => { const r = await page.evaluate(s => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel); if (r) await page.touchscreen.tap(r.x, r.y); return !!r; };
		return { ctx, page, errors, tap, ring, touch };
	};

	// ===== controller: the boards page =====
	{
		const t = await open('/battlecards/boards.html');
		await t.page.waitForFunction(() => window.__boards && document.querySelectorAll('#tabs button').length > 3, { timeout: 15000 });
		await sleep(500);
		await t.tap(BTN.down);
		A(!!(await t.ring()), 'pad / boards: the d-pad shows a focus ring (no controller support before)');
		const cur = () => t.page.evaluate(() => window.__boards.current);
		const c0 = await cur();
		await t.tap(BTN.rb); await sleep(300);
		A(await cur() !== c0, 'pad / boards: RB switches to the next board', `${c0} -> ${await cur()}`);
		for (let i = 0; i < 10 && !/arena/i.test((await t.ring())?.text || ''); i++) await t.tap(i < 4 ? BTN.up : BTN.rightD);
		await t.tap(BTN.right); await sleep(300);
		A(await cur() === 'arena', 'pad / boards: the d-pad + A pick a tab', await cur());
		await Promise.all([t.page.waitForNavigation({ timeout: 10000 }).catch(() => {}), t.page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, BTN.bottom)]);
		A(/\/battlecards\/start\.html/.test(t.page.url()), 'pad / boards: B goes back to the Battlecards hub', t.page.url());
		A(t.errors.length === 0, 'pad / boards: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== controller: /collection/ =====
	{
		const t = await open('/collection/');
		await t.page.waitForFunction(() => document.querySelectorAll('#grid .wiki-card').length > 0, { timeout: 25000 }).catch(() => {});
		await sleep(500);
		for (let i = 0; i < 20 && !(await t.page.evaluate(() => !!document.querySelector('.focusnav-focus')?.closest('#grid .wiki-card'))); i++) await t.tap(BTN.down);
		A(await t.page.evaluate(() => !!document.querySelector('.focusnav-focus')?.closest('#grid .wiki-card')), 'pad / collection: the d-pad reaches a card (no controller support before)', JSON.stringify(await t.ring()));
		const tip = () => t.page.evaluate(() => { const e = document.getElementById('tip'); return e.style.display === 'block' ? e.textContent : ''; });
		A((await tip()).length > 3, 'pad / collection: the focused card shows its text');
		await t.tap(BTN.left);
		A(!(await tip()), 'pad / collection: Y hides it');
		await t.tap(BTN.left);
		A((await tip()).length > 3, 'pad / collection: Y shows it again');
		A(t.errors.length === 0, 'pad / collection: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== controller: B in the deck builder's card page stays on the page (regression) =====
	{
		const t = await open('/battlecards/deck.html', { signedIn: false });
		await t.page.waitForFunction(() => document.querySelectorAll('#grid .tile').length > 0, { timeout: 20000 }).catch(() => {});
		await sleep(600);
		const url0 = t.page.url();
		const zoomOpen = () => t.page.evaluate(() => !!document.getElementById('zoom')?.classList.contains('open'));
		await t.tap(BTN.down);
		for (let i = 0; i < 12 && !/tile/.test((await t.ring())?.cls || ''); i++) await t.tap(BTN.down);
		await t.tap(BTN.right); await sleep(300);
		A(await zoomOpen(), 'pad / deck builder: A on a card opens its page');
		await t.tap(BTN.bottom); await sleep(500);
		A(!(await zoomOpen()) && t.page.url() === url0, 'pad / deck builder: B closes the card page and stays (regression)', t.page.url());
		await t.ctx.close();
	}

	// ===== controller: the match menu's Leave =====
	{
		const t = await open('/battlecards/index.html?players=2');
		const t0 = Date.now();
		while (Date.now() - t0 < 45000 && !(await t.page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
		await t.page.waitForFunction(() => [...document.querySelectorAll('#scry-modal button')].some(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0), { timeout: 20000 }).catch(() => {});
		await t.tap(BTN.down);
		for (let i = 0; i < 6 && !/keep hand/i.test((await t.ring())?.text || ''); i++) await t.tap(BTN.down);
		await t.tap(BTN.right); await sleep(900);
		A(await t.page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none'), 'pad / match: A keeps the opening hand');
		await t.tap(BTN.start, 120); await sleep(300);
		A(await t.page.evaluate(() => window.__padboard.menuOpen), 'pad / match: Start opens the match menu');
		for (let i = 0; i < 8 && !/leave/i.test((await t.ring())?.text || ''); i++) await t.tap(BTN.down);
		A(/leave/i.test((await t.ring())?.text || ''), 'pad / match: the d-pad reaches Leave', JSON.stringify(await t.ring()));
		await t.tap(BTN.right); await sleep(500);
		A(await t.page.evaluate(() => !!document.getElementById('mpsw')), 'pad / match: Leave opens the Games switcher (a way out of a match on a pad)');
		const msg = await t.page.evaluate(async () => {
			// pick Home: an unsaved quick match asks first (mpLeaveGuard), it does not just leave
			const home = [...document.querySelectorAll('#mpsw [data-id="home"], #mpsw a, #mpsw button')].find(e => /home/i.test(e.textContent));
			return home ? home.textContent.trim() : '';
		});
		A(/home/i.test(msg), 'pad / match: the switcher lists Home', msg);
		A(t.errors.length === 0, 'pad / match: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== touch, portrait and landscape =====
	for (const [label, vp] of [['portrait 390x844', { width: 390, height: 844 }], ['landscape 844x390', { width: 844, height: 390 }]]) {
		const touchVp = { ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
		{
			const t = await open('/battlecards/viewer.html', { signedIn: false, pad: false, vp: touchVp });
			await t.page.waitForFunction(() => document.querySelectorAll('#grid > *').length > 0, { timeout: 25000 }).catch(() => {});
			await sleep(600);
			await t.touch('#grid > *');
			await sleep(400);
			A(await t.page.evaluate(() => document.getElementById('zoom').classList.contains('open')), `touch ${label} / gallery: a tap opens the card zoom`);
			await t.touch('#zoom-close');
			await sleep(400);
			A(await t.page.evaluate(() => !document.getElementById('zoom').classList.contains('open')) && /viewer\.html/.test(t.page.url()), `touch ${label} / gallery: tapping ✕ closes it`);
			await t.ctx.close();
		}
		{
			const t = await open('/collection/', { pad: false, vp: touchVp });
			if (process.env.SLOW) { const c = await t.page.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); }
			await t.page.waitForFunction(() => document.querySelectorAll('#grid .wiki-card').length > 0, { timeout: 25000 }).catch(() => {});
			await sleep(500);
			// regression: nothing is wider than the phone. The class filter was (436px at 390): the page then
			// laid out wider than the screen and Chrome zoomed it, so a finger landed on a different card than
			// the page's own coordinates said (CI's long-press read Healing Potion, the card below Backstab)
			A(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && innerWidth === screen.width), `touch ${label} / collection: nothing is wider than the screen`, JSON.stringify(await t.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, screen.width])));
			// regression: the faces carry their size, so the grid can't reflow under a finger while they decode
			A(await t.page.evaluate(() => [...document.querySelectorAll('#grid .wiki-face')].every(i => i.getAttribute('width') && i.getAttribute('height'))), `touch ${label} / collection: every card face is sized before it loads (no reflow under a press)`);
			const p = await t.page.evaluate(() => { window.scrollTo(0, 0); const e = document.querySelector('#grid .wiki-link'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, name: e.querySelector('img').alt, first: e.querySelector('img').alt }; });
			const url0 = t.page.url();
			await sleep(400);   // let the lazy faces settle, then name the card that is under the finger NOW
			p.name = await t.page.evaluate((x, y) => document.elementFromPoint(x, y)?.closest('.wiki-card')?.querySelector('img')?.alt || '', p.x, p.y);
			// a long-press: touchstart, hold, touchend (CDP touch events)
			const cdp = await t.page.createCDPSession();
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
			await sleep(700);
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await sleep(500);
			const tipText = await t.page.evaluate(() => { const e = document.getElementById('tip'); return e.style.display === 'block' ? e.textContent : ''; });
			A(!!p.name && tipText.includes(p.name), `touch ${label} / collection: a long-press shows the card's text (hover-only before)`, JSON.stringify({ pressed: p.name, at: [p.x, p.y], first: p.first, tip: tipText.slice(0, 40), cards: await t.page.evaluate(() => document.querySelectorAll('#grid .wiki-card').length), vv: await t.page.evaluate(() => [visualViewport.scale, visualViewport.offsetLeft, visualViewport.offsetTop, document.documentElement.scrollWidth, innerWidth]) }));
			A(t.page.url() === url0, `touch ${label} / collection: ...and does not follow the link`, t.page.url());
			await t.ctx.close();
		}
		if (vp.width > vp.height) {
			const t = await open('/battlecards/index.html?players=2', { pad: false, vp: touchVp });
			const t0 = Date.now();
			while (Date.now() - t0 < 45000 && !(await t.page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
			await t.page.waitForFunction(() => [...document.querySelectorAll('#scry-modal button')].some(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0), { timeout: 20000 }).catch(() => {});
			const r = await t.page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent)); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
			await t.page.touchscreen.tap(r.x, r.y);
			await sleep(900);
			A(await t.page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none'), `touch ${label} / match: tapping "Keep hand" keeps it`);
			A(await t.page.evaluate(() => !document.querySelector('.padnav-focus') && getComputedStyle(document.getElementById('padboard-reticle') || document.body).display !== 'block' || !document.getElementById('padboard-reticle')), `touch ${label} / match: no focus ring or reticle shows for a touch player`);
			A(t.errors.length === 0, `touch ${label} / match: no uncaught page error`, JSON.stringify(t.errors.slice(0, 2)));
			await t.ctx.close();
		}
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
