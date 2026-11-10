// switcher_core_test.mjs — the Games switcher's input rules (site/switcher.js,
// controls sweep B2) on a fixture "game" page: keyboard (real page.keyboard, no
// mouse), a fake controller in window.__owFakePads, and touch taps.
//
//   - ` opens; X / Esc / ` close; while open no key reaches the game (capture phase)
//     and the game's own input.js handler and pad hear nothing
//   - a QUICK Esc tap keeps the page's meaning (replayed once); HOLDING Esc opens
//   - Tab while open stays in the overlay; ` typed into a field is just a character
//   - Start alone and Select alone reach the game; Start + Select opens
//   - a button held when the overlay closes never fires the game (latched)
//   - leave guards: 'block' refuses to open (toast), 'confirm' asks first and Stay
//     backs out, Leave runs beforeLeave and then navigates
//   - touch: ✕ and the dim veil close
//
//   node overworld/tests/switcher_core_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9191;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a tiny "game": its own keydown listener (bubble phase, like every game), an
// input.js surface with a pad (like the games' controller code), a text field
const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>fake game</title></head>
<body style="margin:0;background:#123;color:#fff;font:16px sans-serif">
<h1>fake game</h1><input id="chat" type="text" placeholder="chat"><button id="btn">a button</button>
<script type="module">
import { startInput } from '/site/input.js';
window.__keys = []; window.__acts = [];
addEventListener('keydown', e => window.__keys.push((e.isTrusted ? '' : '~') + e.key));
// a game's own capture-phase Esc handler that runs BEFORE the switcher's (Battlecards' card reader)
addEventListener('keydown', e => { if (e.key === 'Escape' && window.__eat) { e.preventDefault(); window.__eaten = (window.__eaten || 0) + 1; } }, true);
startInput({ pad: true, onAction: (a, i) => { window.__acts.push(i.source + ':' + a); return true; } });
window.__guard = { state: 'safe', message: '' };
window.mpLeaveGuard = () => ({ ...window.__guard, beforeLeave: () => new Promise(r => setTimeout(() => { sessionStorage.setItem('saved', 'yes'); r(); }, 150)) });
await import('/site/switcher.js');
window.__ready = true;
</script></body></html>`;
const STUB = p => `<!doctype html><html><head><title>STUB ${p}</title></head><body>stub ${p}</body></html>`;
const server = await new Promise(r => {
	const s = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/game/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(FIXTURE); return; }
		if (u.startsWith('/site/') || u.startsWith('/micatro/assets/')) {
			fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': u.endsWith('.js') ? 'text/javascript' : 'font/ttf' }); res.end(d); });
			return;
		}
		res.writeHead(200, { 'content-type': 'text/html' }); res.end(STUB(u));
	});
	s.listen(PORT, () => r(s));
});

// Standard mapping by POSITION; Nintendo layout: RIGHT face = confirm, BOTTOM = cancel.
const BTN = { bottom: 0, right: 1, select: 8, start: 9, up: 12, down: 13, left: 14, rightD: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const open = async (viewport = { width: 1000, height: 700 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(viewport);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
		});
		await page.goto(`http://localhost:${PORT}/game/`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__ready)); i++) await sleep(100);
		const hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }, b, on);
		const tap = async b => { await hold(b, true); await sleep(80); await hold(b, false); await sleep(120); };
		const press = async (k, o) => { await page.keyboard.press(k, o); await sleep(50); };
		const isOpen = () => page.evaluate(() => !!document.getElementById('mpsw'));
		const focused = () => page.evaluate(() => window.__mpSwitcher.nav?.focused?.dataset.entry || null);
		const take = () => page.evaluate(() => ({ keys: window.__keys.splice(0), acts: window.__acts.splice(0) }));
		return { ctx, page, errors, hold, tap, press, isOpen, focused, take };
	};

	// ===== keyboard =====
	{
		const t = await open();
		await t.take();
		await t.press('Backquote');
		A(await t.isOpen(), '` opens the switcher');
		A(await t.page.evaluate(() => document.getElementById('mpsw').getAttribute('aria-modal') === 'true'), '...an aria-modal dialog');
		A(await t.focused() === 'home', '...with focus on Home');
		let g = await t.take();
		A(g.keys.length === 0 && g.acts.length === 0, 'the game never heard the `', JSON.stringify(g));
		await t.press('KeyD'); await t.press('ArrowDown');
		A(await t.focused() !== 'home', 'arrows / WASD move the overlay focus');
		await t.press('Tab'); await t.press('KeyZ', { delay: 0 }).catch(() => {});
		g = await t.take();
		A(g.keys.length === 0 && g.acts.length === 0, 'while open, no key (WASD, arrows, Tab, Z) reaches the game: keydown nor input.js', JSON.stringify(g));
	}
	{
		const t = await open();
		await t.press('Backquote');
		await t.press('KeyX');
		A(!(await t.isOpen()), 'X closes it');
		let g = await t.take();
		A(g.keys.length === 0 && !g.acts.length, '...and the game did not hear X', JSON.stringify(g));
		await t.press('Backquote'); await t.press('Escape');
		A(!(await t.isOpen()), 'Esc closes it too');
		await t.press('Backquote'); await t.press('Backquote');
		A(!(await t.isOpen()), '` toggles it');
		await t.take();

		// a QUICK Esc tap: the page's own meaning, exactly once
		await t.press('Escape');
		await sleep(80);
		g = await t.take();
		A(!(await t.isOpen()), 'a quick Esc tap does NOT open the switcher');
		A(g.keys.filter(k => /Escape/.test(k)).length === 1, '...and the page gets its Escape, once (replayed on release)', JSON.stringify(g));
		// HOLD Esc: opens, and the page never sees it
		await t.page.keyboard.down('Escape'); await sleep(850);
		A(await t.isOpen(), 'holding Esc ~0.6 s opens the switcher');
		await t.page.keyboard.up('Escape'); await sleep(80);
		A(await t.isOpen(), '...and letting go of Esc keeps it open');
		g = await t.take();
		A(!g.keys.some(k => /Escape/.test(k)), '...the page never saw that Escape', JSON.stringify(g));
		await t.press('Escape');
		A(!(await t.isOpen()), 'the next Esc closes it');

		// a game's earlier capture handler used the Esc (preventDefault): it is theirs, once, never replayed
		await t.page.evaluate(() => { window.__eat = true; }); await t.take();
		await t.press('Escape'); await sleep(80);
		g = await t.take();
		A(await t.page.evaluate(() => window.__eaten === 1) && g.keys.filter(k => /Escape/.test(k)).join() === 'Escape' && !(await t.isOpen()), 'an Esc a game already used in an earlier capture handler is left alone (no hold, no second replayed Esc)', JSON.stringify(g));
		await t.page.evaluate(() => { window.__eat = false; });
		// Tab (closed) keeps its meaning: native focus moves
		await t.page.evaluate(() => document.getElementById('chat').focus());
		await t.press('Tab');
		A(await t.page.evaluate(() => document.activeElement.id === 'btn'), 'Tab (switcher closed) still moves the page focus');
		// typing: ` and Esc in a field are the field's
		await t.page.evaluate(() => { const c = document.getElementById('chat'); c.value = ''; c.focus(); });
		await t.page.keyboard.type('a`b');
		A(!(await t.isOpen()) && await t.page.evaluate(() => document.getElementById('chat').value === 'a`b'), '` typed into a text field is a character, not the switcher');
		await t.take();
		await t.page.keyboard.down('Escape'); await sleep(800); await t.page.keyboard.up('Escape');
		g = await t.take();
		A(!(await t.isOpen()) && g.keys.includes('Escape'), 'Esc in a text field goes straight to the page (no hold-to-open while typing)', JSON.stringify(g));
		await t.page.evaluate(() => document.activeElement.blur());
		A(t.errors.length === 0, 'keyboard: no page errors', t.errors.join(' | '));
		await t.ctx.close();
	}

	// ===== the controller =====
	{
		const t = await open();
		await sleep(200); await t.take();
		await t.tap(BTN.start);
		let g = await t.take();
		A(!(await t.isOpen()) && g.acts.includes('pad:menu'), 'Start alone reaches the game (its own menu) and opens nothing', JSON.stringify(g));
		await t.tap(BTN.select);
		g = await t.take();
		A(!(await t.isOpen()) && g.acts.includes('pad:select'), 'Select alone reaches the game and opens nothing', JSON.stringify(g));
		await t.hold(BTN.start, true); await sleep(80); await t.hold(BTN.select, true); await sleep(120);
		await t.hold(BTN.start, false); await t.hold(BTN.select, false); await sleep(120);
		A(await t.isOpen(), 'Start + Select together open the switcher');
		await t.take();
		await t.tap(BTN.rightD); await t.tap(BTN.down);
		g = await t.take();
		A(await t.focused() !== 'home' && g.acts.length === 0, 'the d-pad moves the overlay; the game\'s pad hears nothing (paused)', JSON.stringify(g));
		// close with B and KEEP holding it: the game must not get a cancel when it resumes
		await t.hold(BTN.bottom, true); await sleep(150);
		A(!(await t.isOpen()), 'B closes it');
		await sleep(150); await t.hold(BTN.bottom, false); await sleep(120);
		g = await t.take();
		A(!g.acts.includes('pad:cancel'), 'the B that closed the overlay never reaches the game (latched until let go)', JSON.stringify(g));
		await t.tap(BTN.bottom);
		g = await t.take();
		A(g.acts.includes('pad:cancel'), '...a fresh B press does');
		// pad navigation to a game: Micatro is the 6th entry (Home, Battlecards, Overworld, PokéChess, Factory, Micatro)
		await t.hold(BTN.start, true); await t.hold(BTN.select, true); await sleep(150); await t.hold(BTN.start, false); await t.hold(BTN.select, false); await sleep(100);
		await t.page.evaluate(() => window.__mpSwitcher.nav.focusTo(document.querySelector('#mpsw [data-entry="micatro"]')));
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.tap(BTN.right);
		await nav;
		A(new URL(t.page.url()).pathname === '/micatro/', 'A on an entry goes there', t.page.url());
		await t.ctx.close();
	}

	// ===== leave guards =====
	{
		const t = await open();
		await t.page.evaluate(() => { window.__guard = { state: 'block', message: 'Not during a cutscene.' }; });
		await t.press('Backquote');
		A(!(await t.isOpen()), "'block' (a cutscene): the switcher does not open");
		A(await t.page.evaluate(() => /cutscene/.test(document.getElementById('mpsw-toast')?.textContent || '')), '...and says why');
		await t.page.evaluate(() => { window.__guard = { state: 'confirm', message: 'Leaving counts as a loss.' }; });
		await t.press('Backquote');
		await t.press('KeyZ');   // Home
		A(await t.page.evaluate(() => /counts as a loss/.test(document.querySelector('#mpsw .mpsw-confirm')?.textContent || '')), "'confirm': picking Home asks first, with the game's message");
		A(await t.focused() === 'stay', '...focus starts on Stay (the safe choice)');
		await t.press('KeyX');
		A(await t.isOpen() && await t.page.evaluate(() => !document.querySelector('#mpsw .mpsw-confirm')), 'X on the question goes back to the list');
		await t.press('KeyZ');
		await t.press('KeyZ');
		A(await t.isOpen() && new URL(t.page.url()).pathname === '/game/', 'Stay keeps you here');
		A(await t.focused() === 'home', '...back on the list, at Home');
		await t.press('KeyZ'); await t.press('KeyD');
		A(await t.focused() === 'leave', 'D moves to Leave');
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.press('KeyZ');
		await nav;
		A(new URL(t.page.url()).pathname === '/', 'Leave goes Home');
		A(await t.page.evaluate(() => sessionStorage.getItem('saved') === 'yes'), "...after the game's beforeLeave ran (save first)");
		await t.ctx.close();
	}

	// ===== touch (phone portrait) =====
	{
		const t = await open({ width: 390, height: 844, isMobile: true, hasTouch: true });
		await t.page.evaluate(() => window.__mpSwitcher.open());
		const box = await t.page.evaluate(() => { const r = document.querySelector('#mpsw .mpsw-panel').getBoundingClientRect(); return { w: r.width, right: r.right, vw: innerWidth }; });
		A(box.right <= box.vw && box.w > 300, 'portrait: the panel fits the phone width', JSON.stringify(box));
		const c = await t.page.evaluate(() => { const r = document.querySelector('#mpsw [data-entry="close"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
		await t.page.touchscreen.tap(c[0], c[1]); await sleep(150);
		A(!(await t.isOpen()), 'tapping ✕ closes it');
		await t.page.evaluate(() => window.__mpSwitcher.open());
		const p = await t.page.evaluate(() => { const r = document.querySelector('#mpsw .mpsw-panel').getBoundingClientRect(); return [r.x + 10, Math.min(innerHeight - 5, r.bottom + 20)]; });
		await t.page.touchscreen.tap(p[0], p[1]); await sleep(150);
		A(!(await t.isOpen()), 'tapping the dim veil outside the panel closes it');
		await t.page.evaluate(() => window.__mpSwitcher.open());
		const hm = await t.page.evaluate(() => { const r = document.querySelector('#mpsw [data-entry="home"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.page.touchscreen.tap(hm[0], hm[1]);
		await nav;
		A(new URL(t.page.url()).pathname === '/', 'tapping Home goes home');
		await t.ctx.close();
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
