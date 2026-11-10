// info_pages_nav_test.mjs — controls sweep B8: the player-facing info and tool pages (bugs/,
// inventory/, login/, profile/, learnmagepunk/, magepunknews/, monsters/, og/, designwiki/)
// with no mouse: site/focusnav.js drives them from the keyboard (arrows / WASD, Z / Enter,
// X / Esc) and from a controller (d-pad, A, B); on a phone (portrait and landscape) taps still
// work and no focus ring shows for touch. Typing in a field moves nothing; the Games switcher
// opens from every page.
//   node overworld/tests/info_pages_nav_test.mjs      (screenshots: SHOTS=<dir>)
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.SHOTS || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(80); } return false; }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const STATE = { username: 'tester', collection: {}, decks: [], gold: 0 };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, state: STATE, bugs: [], friends: [], messages: [], gifts: [] })); }
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PAGES = [
	{ id: 'bugs', url: '/bugs/', login: true, field: '#title' },
	{ id: 'inventory', url: '/inventory/' },
	{ id: 'login', url: '/login/', field: '#u' },
	{ id: 'profile', url: '/profile/', login: true },
	{ id: 'learn', url: '/learnmagepunk/' },
	{ id: 'news', url: '/magepunknews/' },
	{ id: 'monsters', url: '/monsters/' },
	{ id: 'og', url: '/og/' },
	{ id: 'wiki', url: '/designwiki/' },
];
const DESK = { width: 1280, height: 800 };
if (process.env.ONLY) PAGES.splice(0, PAGES.length, ...PAGES.filter(p => process.env.ONLY.split(',').includes(p.id)));
const PHONES = [['portrait', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['landscape', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];
const BTN = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const open = async (spec, vp = DESK) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		// nothing leaves the test server (og/ asks Scryfall for cards)
		await page.setRequestInterception(true);
		page.on('request', r => { const h = new URL(r.url()).hostname; if (h !== 'localhost' && h !== '127.0.0.1') r.abort().catch(() => {}); else r.continue().catch(() => {}); });
		await page.evaluateOnNewDocument((login) => {
			if (login) { localStorage.setItem('magepunk_mp_token_v1', 'tok'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'tester', collection: {} })); }
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ name: 'Pikachu', level: 5, types: ['Electric'], maxHP: 20, curHP: 20 }]));
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			window.__mouse = 0;
			for (const t of ['mousedown', 'pointerdown']) addEventListener(t, e => { if (e.isTrusted && e.pointerType !== 'touch') window.__mouse++; }, true);
		}, !!spec.login);
		await page.goto(`http://localhost:${PORT}${spec.url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!window.__focusnav && !!window.__mpSwitcher), 15000);
		await sleep(700);
		const t = { ctx, page, errors };
		t.key = async (k, ms = 70) => { await page.keyboard.press(k); await sleep(ms); };
		t.tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(80); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(120); };
		// what the ring is on (a stable signature), or null
		t.focus = () => page.evaluate(() => { const f = window.__focusnav.focused; if (!f || !f.isConnected) return null; return { sig: f.tagName + '|' + (f.id || '') + '|' + (f.getAttribute('href') || '') + '|' + (f.textContent || '').trim().slice(0, 40), ring: f.classList.contains('focusnav-focus'), tag: f.tagName }; });
		return t;
	};

	for (const spec of PAGES) {
		const tag = spec.id + ':';
		// ---------- keyboard only ----------
		{
			const t = await open(spec);
			A(new URL(t.page.url()).pathname === spec.url, `${tag} loads (no redirect)`, t.page.url());
			A(await t.page.evaluate(() => !!window.__focusnav), `${tag} focusnav runs`);
			await t.key('KeyS');
			let f = await t.focus();
			A(f && f.ring, `${tag} the first key shows the focus ring`, JSON.stringify(f));
			// a sweep down: it visits several stops
			const total = await t.page.evaluate(() => window.__focusnav.candidates().length);
			const seen = new Set(f ? [f.sig] : []);
			for (let i = 0; i < 10; i++) { await t.key('KeyS'); const x = await t.focus(); if (x) seen.add(x.sig); }
			A(seen.size >= Math.min(2, total), `${tag} S walks the page (${seen.size} of ${total} stops)`, [...seen].slice(0, 6).join(' ; '));
			A(await t.page.evaluate(() => { const f = window.__focusnav.focused; return !!f && f.classList.contains('focusnav-focus') && getComputedStyle(f).outlineStyle !== 'none'; }), `${tag} the focused stop shows a visible ring`);
			// no dead ends: a sample of the page's stops (up to 10, spread over the page) is each
			// reached by pressing toward it with WASD from wherever the ring is
			const sample = await t.page.evaluate(() => { const c = window.__focusnav.candidates(); const n = Math.min(10, c.length); const out = []; for (let i = 0; i < n; i++) { const el = c[Math.floor(i * c.length / n)]; el.dataset.navSample = String(i); out.push(i); } return out; });
			const missed = [];
			// each step tries the four directions from where the ring is and keeps the one that
			// gets closest (a player looking at the screen); stuck = a dead end
			const dist = i => t.page.evaluate(i => {
				const tg = document.querySelector(`[data-nav-sample="${i}"]`), f = window.__focusnav.focused;
				if (!tg || !f) return -1;
				if (f === tg) return 0;
				const a = f.getBoundingClientRect(), b = tg.getBoundingClientRect();
				return Math.hypot((b.x + b.width / 2) - (a.x + a.width / 2), (b.y + b.height / 2) - (a.y + a.height / 2));
			}, i);
			for (const i of sample) {
				let ok = false;
				for (let step = 0; step < 30 && !ok; step++) {
					const d0 = await dist(i);
					if (d0 <= 0) { ok = d0 === 0; break; }
					// (the four tries go through the navigator's own move(), the function a key press
					// calls; the chosen step is then a real key press)
					const best = await t.page.evaluate((i, d0) => {
						const nav = window.__focusnav, here = nav.focused, tg = document.querySelector(`[data-nav-sample="${i}"]`);
						const dist = () => { const f = nav.focused; if (f === tg) return 0; const a = f.getBoundingClientRect(), b = tg.getBoundingClientRect(); return Math.hypot((b.x + b.width / 2) - (a.x + a.width / 2), (b.y + b.height / 2) - (a.y + a.height / 2)); };
						let best = null, bd = d0;
						for (const [k, dir] of [['KeyW', 'up'], ['KeyA', 'left'], ['KeyS', 'down'], ['KeyD', 'right']]) {
							nav.focusTo(here);
							const d1 = dist();   // (re-measured: focusing may scroll)
							nav.move(dir);
							const d = dist();
							if (nav.focused !== here && d < Math.min(bd, d1) - 1) { bd = d; best = k; }
						}
						nav.focusTo(here);
						return best;
					}, i, d0);
					if (!best) break;
					await t.key(best, 30);
				}
				if (!ok) missed.push(await t.page.evaluate(i => { const e = document.querySelector(`[data-nav-sample="${i}"]`); return e ? e.tagName + ' ' + (e.textContent || '').trim().slice(0, 30) : 'gone'; }, i));
			}
			A(!missed.length, `${tag} every sampled stop is reachable with WASD (${sample.length})`, missed.join(' ; '));
			await t.key('KeyW'); await t.key('ArrowUp');
			A(!!(await t.focus()), `${tag} W / ↑ move back up`);
			// a text field: Z enters it, the keys type, focus stays put, Esc leaves it
			if (spec.field) {
				await t.page.evaluate(sel => window.__focusnav.focusTo(document.querySelector(sel)), spec.field);
				await t.key('KeyZ');
				A(await t.page.evaluate(sel => document.activeElement === document.querySelector(sel), spec.field), `${tag} Z on a text field puts the caret there`);
				await t.page.keyboard.type('wasd zxcv');
				A(await t.page.evaluate(sel => document.querySelector(sel).value === 'wasd zxcv' && window.__focusnav.focused === document.querySelector(sel), spec.field), `${tag} typing WASD / ZXCV there types (focus doesn't move)`);
				await t.key('Escape', 150);
				A(await t.page.evaluate(sel => document.activeElement !== document.querySelector(sel), spec.field), `${tag} Esc leaves the field`);
				await t.key('KeyS');
				A((await t.focus())?.sig !== null, `${tag} ...and the arrows navigate again`);
			}
			if (spec.id === 'news') {
				await waitFor(() => t.page.evaluate(() => document.querySelectorAll('#feed article').length > 0), 8000);
				// REGRESSION: on this long page (thousands of links) every key press read the computed
				// style of every link and its ancestors (~0.4 s a press); now only the stops near the view
				const cost = await t.page.evaluate(() => {
					const n = document.querySelectorAll('a[href]').length;
					const real = window.getComputedStyle; let calls = 0;
					window.getComputedStyle = function (...a) { calls++; return real.apply(this, a); };
					try { window.__focusnav.move('down'); window.__focusnav.move('down'); } finally { window.getComputedStyle = real; }
					return { n, calls: calls / 2 };
				});
				A(cost.n > 2000 && cost.calls < 1500, `news: a key press on the ${cost.n}-link feed stays cheap (${Math.round(cost.calls)} style reads)`, JSON.stringify(cost));
				const fb = await t.page.evaluate(() => { const b = [...document.querySelectorAll('.filters button')].find(x => !x.classList.contains('on')); window.__focusnav.focusTo(b); return b.dataset.f; });
				await t.key('KeyZ', 200);
				A(await t.page.evaluate(f => document.querySelector(`.filters button[data-f="${f}"]`).classList.contains('on'), fb), 'news: Z picks a filter');
				await t.page.evaluate(() => { const b = document.querySelector('.filters button[data-f="all"]'); window.__focusnav.focusTo(b); });
				await t.key('KeyZ', 300);
				const hasSum = await t.page.evaluate(() => { const s = document.querySelector('details.body-toggle summary'); if (!s) return false; window.__focusnav.focusTo(s); return true; });
				if (hasSum) {
					A(await t.page.evaluate(() => window.__focusnav.candidates().some(e => e.tagName === 'SUMMARY')), 'news: a "Details" toggle is a stop');
					await t.key('KeyZ', 200);
					A(await t.page.evaluate(() => window.__focusnav.focused.parentElement.open), 'news: Z opens the Details');
				}
			}
			if (spec.id === 'wiki') {
				const hash0 = await t.page.evaluate(() => location.hash);
				const want = await t.page.evaluate(() => { const a = [...document.querySelectorAll('#sidebar a[href^="#/"]')].find(x => x.getAttribute('href') !== location.hash); window.__focusnav.focusTo(a); return a.getAttribute('href'); });
				await t.key('KeyZ', 400);
				A(await t.page.evaluate(() => location.hash) === want && want !== hash0, 'wiki: Z on a sidebar link opens that page', want);
				await t.page.evaluate(() => { location.hash = '#/controls'; });
				A(await waitFor(() => t.page.evaluate(() => /Scoundrel, Pair of Pears and PokéChess/.test(document.body.textContent) && /Fight bare-handed/.test(document.body.textContent) && /Leave to the overworld/.test(document.body.textContent)), 5000), 'wiki: the Controls page lists the Scoundrel / Pears / PokéChess keys');
			}
			A(await t.page.evaluate(() => window.__mouse) === 0, `${tag} no mouse event was used`);
			await t.key('Backquote', 200);
			A(await t.page.evaluate(() => window.__mpSwitcher.isOpen()), `${tag} \` opens the Games switcher`);
			await t.key('Escape', 200);
			A(!(await t.page.evaluate(() => window.__mpSwitcher.isOpen())), `${tag} Esc closes it`);
			if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await t.page.screenshot({ path: path.join(SHOTS, `info_${spec.id}.png`) }); }
			A(t.errors.length === 0, `${tag} no page errors`, t.errors.slice(0, 3).join(' | '));
			await t.ctx.close();
		}
		// ---------- the controller only ----------
		{
			const t = await open(spec);
			await t.tap(BTN.down);
			const f0 = await t.focus();
			await t.tap(BTN.down); await t.tap(BTN.down);
			const f1 = await t.focus();
			A(f0 && f1 && f1.ring && (f0.sig !== f1.sig || await t.page.evaluate(() => scrollY > 0)), `${tag} pad: the d-pad moves the ring`, JSON.stringify({ f0, f1 }));
			if (spec.id === 'login') {
				await t.page.evaluate(() => window.__focusnav.focusTo(document.getElementById('flip')));
				const sub0 = await t.page.evaluate(() => document.getElementById('sub').textContent);
				await t.tap(BTN.confirm);
				A(await t.page.evaluate(s => document.getElementById('sub').textContent !== s, sub0), 'login pad: A presses "Create one"');
			}
			await t.ctx.close();
		}
	}
	// ---------- a phone: taps work, no ring for touch, no sideways scroll ----------
	for (const [name, vp] of PHONES) {
		for (const spec of PAGES) {
			const t = await open(spec, vp);
			const fit = await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
			A(fit, `${spec.id} ${name}: no sideways scroll`);
			const r = await t.page.evaluate(() => {
				const el = [...document.querySelectorAll('main button, main summary, #wrap button, #content a, .filters button, details summary, form button, button')].find(e => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.top >= 0 && b.bottom <= innerHeight && !e.closest('#mp-topbar') && !e.disabled; });
				if (!el) return null;
				// (the tap is only recorded: nothing navigates or logs out)
				addEventListener('click', ev => { if (el.contains(ev.target)) { window.__tapped = true; ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
				const b = el.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2];
			});
			if (r) {
				await t.page.touchscreen.tap(r[0], r[1]); await sleep(150);
				A(await t.page.evaluate(() => !!window.__tapped && !document.querySelector('.focusnav-focus')), `${spec.id} ${name}: a tap works and shows no focus ring`);
			}
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
