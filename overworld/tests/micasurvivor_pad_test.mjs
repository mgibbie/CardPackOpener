// micasurvivor_pad_test.mjs — MicaSurvivor controller support (M2, Plans/MICASURVIVOR_PLAN.md) in
// headless Chrome with a SYNTHETIC Gamepad API (navigator.getGamepads overridden in the page; the
// pads are plain objects the test presses buttons / tilts sticks on). No mouse, no keyboard, except
// where the test checks that keyboard use switches the prompts back to keys.
//   - site rule: a guest's pad only says "Log in to Magepunk to use a controller"; signed in, it drives
//   - default layout = Nintendo (site standard: RIGHT face confirms, bottom face cancels)
//   - title -> personality test -> partner -> menu with the pad only; focus ring on every screen;
//     Pokémon / Upgrades / Gacha / Missions / Settings / Credits opened and left with cancel;
//     LB / RB cycle a screen's tabs; the menu hint bar shows the pad's glyphs
//   - a gacha pull: confirm hurries the slot machine, Continue closes the results
//   - Settings > Controls: layout picker (Xbox: bottom confirms; back to Nintendo swaps them),
//     remap with swap-on-conflict (reroll -> X, then pause -> X takes reroll's old button),
//     persisting across a reload (micasurvivor_settings), vibration toggle, reset to defaults
//   - in a run: left stick moves (deadzone, analog scaling), D-pad moves, pause / resume with the
//     REMAPPED pause button, level-up card: glyph prompts, reroll with the remapped button, pick
//     with D-pad + confirm, LB / RB switch moves, rumble on hit, quit to the summary and back
//   - glyphs switch back to keys on keyboard use and to the pad on pad use
//   - hot-plug: unplugging hides the ring; the first pad that presses drives, a second one is ignored
//   - the port's ban / swap / zmove / dynamax are not offered (the web game has no such mechanics)
// Screenshots (pad_menu_focus, pad_settings_remap, pad_levelup) go to MICASURVIVOR_SHOTS=<dir>.
// Covers micasurvivor/js/core/pad.js, js/core/input.js, js/game.js (G.Pad.poll), js/ui/run-ui.js
// (card glyphs), js/ui/settings-ui.js (Controls tab), js/ui/hud.js (move-switch glyphs),
// js/entities/player.js (rumble), js/data/lang-en.js, index.html, css/style.css, site/gamepad.js.
//   node overworld/tests/micasurvivor_pad_test.mjs
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
const PORT = 8792;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// the synthetic Gamepad API, installed before any page script runs
const FAKE_PADS = () => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
		axes: [0, 0, 0, 0],
		vibrationActuator: { calls: [], playEffect(t, o) { this.calls.push([t, o]); return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	window.__axes = (x, y, p = 0) => { const pad = window.__pads[p]; if (pad) { pad.axes[0] = x; pad.axes[1] = y; } };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
};

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(FAKE_PADS);
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	await page.setRequestInterception(true);
	page.on('request', r => { const url = r.url(); if (/^(data|blob):/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) r.continue(); else r.abort(); });
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const ev = (fn, ...a) => page.evaluate(fn, ...a);
	// one press of button b on pad p (held ~5 frames)
	const press = async (b, p = 0) => { await ev((b, p) => __btn(b, true, p), b, p); await sleep(80); await ev((b, p) => __btn(b, false, p), b, p); await sleep(110); };
	const focus = () => ev(() => { const f = document.querySelector('.pad-focus'); return f ? { id: f.id, cls: f.className, text: (f.textContent || '').trim().slice(0, 40), scope: G.Pad.topScope() && G.Pad.topScope().id, n: document.querySelectorAll('.pad-focus').length } : null; });
	const toastText = () => ev(() => { const t = document.querySelector('.toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
	// move the focus to `sel` with the D-pad only (12 up, 13 down, 14 left, 15 right)
	const navTo = async (sel, p = 0) => {
		for (let i = 0; i < 40; i++) {
			const d = await ev(sel => {
				const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
				if (!f || !t) return 'missing';
				if (f === t) return 'here';
				const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
				const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
				return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
			}, sel);
			if (d === 'here') return true;
			if (d === 'missing') { if (process.env.PAD_DEBUG) console.log('   navTo missing', sel, JSON.stringify(await focus()), errors.slice(-3).join(' | ')); return false; }
			await press(d, p);
		}
		return false;
	};
	const B = { cancel: 0, confirm: 1, X: 2, Y: 3, LB: 4, RB: 5, view: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };   // Nintendo default

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => ev(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready), 30000), 'boots; the pad module and the site gamepad core load');
	A(await ev(() => G.Pad.layout()) === 'nintendo' && JSON.stringify(await ev(() => G.Pad.map())) === JSON.stringify({ prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3 }),
		'default layout is Nintendo (site standard): right face confirms, bottom cancels, LB/RB prev/next, Start pause, top face reroll', JSON.stringify(await ev(() => G.Pad.map())));
	A(await ev(() => !['ban', 'swap', 'zmove', 'dynamax'].some(a => G.Pad.ACTIONS.includes(a))), 'ban / swap / zmove / dynamax are not offered (no such mechanics in the web game)');

	// ---- guest: the pad only hints
	await ev(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
	if (await visible('tap-start')) { await press(B.confirm); }
	A(await waitFor(() => visible('scr-login'), 10000), 'title (login) screen shows');
	await press(B.confirm);
	A(/Log in to Magepunk to use a controller/.test(await toastText()), 'guest: a pad press says "Log in to Magepunk to use a controller"', await toastText());
	A(await ev(() => !G.Pad.active && !document.body.classList.contains('pad-input')) && await visible('scr-login'), 'guest: the pad does not drive (no ring, still on the title)');

	// ---- signed in: the pad drives
	await ev(() => { localStorage.setItem('magepunk_mp_token_v1', 'test-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'padtester' })); });
	await sleep(2200);
	await press(B.confirm);
	A(/Controller connected/.test(await toastText()) && await ev(() => G.Pad.active && document.body.classList.contains('pad-input')), 'signed in: the first press takes the pad ("Controller connected", pad prompts on)', await toastText());
	let f = await focus();
	A(f && f.id === 'btn-guest' && await visible('scr-login'), 'that first press only shows the focus ring, on Play', JSON.stringify(f));
	await press(B.confirm);
	A(await waitFor(() => visible('scr-test'), 5000), 'confirm on Play: the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) await press(B.confirm);
	A(await waitFor(() => visible('scr-result'), 5000), 'the test is answered with confirm alone');
	f = await focus();
	A(f && f.id === 'res-ok', 'result screen: focus on "Let\'s go together!"', JSON.stringify(f));
	await press(B.confirm);
	A(await waitFor(() => visible('scr-menu'), 8000), 'main menu, reached with the pad only');
	await sleep(300);
	f = await focus();
	A(f && /play/.test(f.cls) && f.n === 1, 'menu: the ring sits on Play', JSON.stringify(f));
	const hint = await ev(() => { const h = document.getElementById('pad-hint'); return { on: h && !h.classList.contains('hidden'), text: h && h.innerText, svgs: h ? h.querySelectorAll('svg').length : 0 }; });
	A(hint.on && /Accept/.test(hint.text) && /Back/.test(hint.text) && hint.svgs >= 2, 'menu hint bar: confirm / back glyphs', JSON.stringify(hint));
	const ring = await ev(() => getComputedStyle(document.querySelector('.pad-focus')).outlineStyle);
	A(ring === 'solid', 'the focus ring is visible (gold outline)', ring);
	await press(B.down);
	f = await focus();
	A(f && /Pokémon/.test(f.text), 'D-pad down moves the ring to Pokémon', JSON.stringify(f));
	await shot('pad_menu_focus.png');

	// ---- every menu screen, opened and left with the pad
	const SCREENS = [['dex', 'scr-dex'], ['upgrades', 'scr-upgrades'], ['gacha', 'scr-gacha'], ['goals', 'scr-goals']];
	for (const [go, id] of SCREENS) {
		A(await navTo(`#scr-menu [data-go=${go}]`), `menu: D-pad reaches ${go}`);
		await press(B.confirm);
		A(await waitFor(() => visible(id), 4000), `${go}: confirm opens it`);
		await sleep(150);
		f = await focus();
		A(f && f.scope === id, `${go}: the ring is inside the screen`, JSON.stringify(f));
		const before = await focus();
		await press(B.right); await press(B.down);
		const after = await focus();
		A(after && after.scope === id && (after.text !== before.text || after.cls !== before.cls), `${go}: the D-pad moves the ring inside the screen`, JSON.stringify([before, after]));
		if (go !== 'upgrades') {
			const tab0 = await ev(id => { const t = document.querySelector('#' + id + ' .gen-tab.on, #' + id + ' .tab.on'); return t && t.textContent.trim(); }, id);
			await press(B.RB);
			const tab1 = await ev(id => { const t = document.querySelector('#' + id + ' .gen-tab.on, #' + id + ' .tab.on'); return t && t.textContent.trim(); }, id);
			A(tab0 && tab1 && tab0 !== tab1, `${go}: RB cycles the tabs (${tab0} -> ${tab1})`);
			await press(B.LB);
			const tab2 = await ev(id => { const t = document.querySelector('#' + id + ' .gen-tab.on, #' + id + ' .tab.on'); return t && t.textContent.trim(); }, id);
			A(tab2 === tab0, `${go}: LB goes back`, tab2);
		} else {
			// the Pokémon picker is a <select>: left / right change it
			if (await navTo('#upg-mon')) {
				const n = await ev(() => document.getElementById('upg-mon').options.length);
				const v0 = await ev(() => document.getElementById('upg-mon').selectedIndex);
				await press(B.right);
				const v1 = await ev(() => document.getElementById('upg-mon').selectedIndex);
				A(n < 2 || v1 !== v0, 'upgrades: right changes the Pokémon <select>', `${v0}->${v1} of ${n}`);
			} else A(false, 'upgrades: D-pad reaches the Pokémon <select>');
		}
		await press(B.cancel);
		A(await waitFor(async () => !(await visible(id)) && await visible('scr-menu'), 3000), `${go}: cancel goes back to the menu`);
		f = await focus();
		A(f && f.scope === 'scr-menu' && new RegExp(go === 'dex' ? 'Pokémon' : '.').test(f.text), `${go}: back on the menu, the ring returns`, JSON.stringify(f));
	}

	// ---- a gacha pull: the slot machine overlay (confirm speeds it up), then the results
	await ev(() => { G.DB.save.tickets.t1 = 1; });
	A(await navTo('#scr-menu [data-go=gacha]'), 'menu: back to the gacha');
	await press(B.confirm);
	await waitFor(() => visible('scr-gacha'), 3000);
	A(await navTo('#pull-1'), 'gacha: D-pad reaches "Pull ×1"');
	await press(B.confirm);
	A(await waitFor(() => visible('pull-fx'), 3000), 'confirm pulls: the slot machine opens');
	f = await focus();
	A(f && f.scope === 'pull-fx', 'the ring moves into the slot machine overlay', JSON.stringify(f));
	for (let i = 0; i < 30 && !(await visible('pull-close')); i++) await press(B.confirm);
	A(await visible('pull-close'), 'confirm hurries the reels; the result shows');
	await sleep(150);
	await press(B.confirm);
	A(await waitFor(async () => !(await visible('pull-fx')), 3000) && await visible('scr-gacha'), 'confirm on Continue closes the results');
	await press(B.cancel);
	A(await waitFor(() => visible('scr-menu'), 3000) && !(await visible('scr-gacha')), 'cancel: back to the menu');

	// ---- settings: tabs, controls (layout picker, remap with swap-on-conflict), credits
	A(await navTo('#scr-menu [data-go=settings]'), 'menu: D-pad reaches Settings');
	await press(B.confirm);
	A(await waitFor(() => visible('scr-settings'), 3000), 'Settings opens');
	for (let i = 0; i < 6; i++) { if (await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'ctl') break; await press(B.RB); }
	A(await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'ctl', 'RB reaches the Controls tab');
	const ctl = await ev(() => document.getElementById('set-body').innerText);
	A(/Controller/.test(ctl) && /Controller type/.test(ctl) && /Reset mapping/.test(ctl) && /Vibration/.test(ctl), 'Controls: controller section (layout, remap rows, vibration, reset), in English', ctl.slice(0, 300));
	A(await ev(() => ['prev', 'next', 'pause', 'confirm', 'cancel', 'reroll'].every(a => document.querySelector(`[data-bind=${a}] svg`))), 'one remap row per action, each with its button glyph');
	// Xbox: the bottom face confirms
	A(await navTo('[data-pad-layout=xbox]'), 'D-pad reaches the Xbox layout chip');
	await press(B.confirm);
	A(await ev(() => G.Pad.layout() === 'xbox' && G.Pad.map().confirm === 0 && G.Pad.map().cancel === 1), 'Xbox layout: A (bottom) confirms, B (right) cancels', JSON.stringify(await ev(() => G.Pad.map())));
	const xbHint = await ev(() => document.querySelector('#pad-hint .pad-glyph').innerHTML);
	A(await navTo('[data-pad-layout=nintendo]'), 'D-pad reaches the Nintendo chip');
	await press(0);    // Xbox: bottom face is confirm now
	A(await ev(() => G.Pad.layout() === 'nintendo' && G.Pad.map().confirm === 1 && G.Pad.map().cancel === 0), 'Nintendo layout swaps them back (right face confirms)');
	const nHint = await ev(() => document.querySelector('#pad-hint .pad-glyph').innerHTML);
	A(xbHint !== nHint, 'the glyphs follow the layout');
	// remap reroll onto X (2), then pause onto X: pause takes 2, reroll takes pause's old button (9)
	A(await navTo('[data-bind=reroll]'), 'D-pad reaches the reroll row');
	await press(B.confirm);
	A(await ev(() => G.Pad.listening) === 'reroll' && /Press a button/.test(await ev(() => document.querySelector('[data-bind=reroll]').innerText)), 'confirm on a row listens ("Press a button…")');
	await press(B.X);
	A(await ev(() => G.Pad.listening === null && G.Pad.map().reroll === 2), 'the next press binds it (reroll -> X / left face)', JSON.stringify(await ev(() => G.Pad.map())));
	A(await ev(() => G.Pad.listening) === null, 'binding with a press does not re-open the listener');
	A(await navTo('[data-bind=pause]'), 'D-pad reaches the pause row');
	await press(B.confirm);
	await sleep(100);
	await shot('pad_settings_remap.png');
	await press(B.X);
	const m2 = await ev(() => G.Pad.map());
	A(m2.pause === 2 && m2.reroll === 9, 'swap-on-conflict: pause takes X, reroll takes Start', JSON.stringify(m2));
	// vibration on
	A(await navTo('[data-pad-rumble]'), 'D-pad reaches the vibration switch');
	await press(B.confirm);
	A(await ev(() => G.Settings.get('padRumble') === true), 'vibration toggled on with the pad');
	A(await ev(() => window.__pads[0].vibrationActuator.calls.length > 0), 'turning it on gives a test rumble');
	// about -> credits screen, and back out
	for (let i = 0; i < 6; i++) { if (await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'about') break; await press(B.RB); }
	A(await navTo('#set-body [data-legal]'), 'About: D-pad reaches "Credits & licences"');
	await press(B.confirm);
	A(await waitFor(() => visible('scr-legal'), 3000), 'Credits screen opens');
	f = await focus();
	A(f && f.scope === 'scr-legal', 'Credits: the ring is inside it', JSON.stringify(f));
	const sc0 = await ev(() => document.querySelector('#scr-legal .legal').scrollTop);
	for (let i = 0; i < 8; i++) await press(B.down);
	const sc1 = await ev(() => document.querySelector('#scr-legal .legal').scrollTop);
	A(sc1 > sc0, 'Credits: the D-pad walks / scrolls the long page', `${sc0} -> ${sc1}`);
	await press(B.cancel);
	A(await waitFor(async () => !(await visible('scr-legal')), 2000) && await visible('scr-settings'), 'cancel closes Credits (back to Settings)');
	await press(B.cancel);
	A(await waitFor(async () => !(await visible('scr-settings')), 2000) && await visible('scr-menu'), 'cancel closes Settings (back to the menu)');

	// ---- the remap survives a reload
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitFor(() => ev(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready), 30000);
	await ev(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
	const saved = await ev(() => ({ m: G.Pad.map(), lay: G.Pad.layout(), raw: JSON.parse(localStorage.getItem('micasurvivor_settings')) }));
	A(saved.m.pause === 2 && saved.m.reroll === 9 && saved.lay === 'nintendo' && saved.raw.padMap && saved.raw.padRumble === true, 'remap, layout and vibration persist across a reload (micasurvivor_settings)', JSON.stringify(saved));
	if (await visible('tap-start')) await press(B.confirm);
	A(await waitFor(() => visible('scr-menu'), 10000), 'reload lands on the menu');
	await press(B.confirm); await sleep(100);   // first press: shows the ring

	// ---- a run, with the pad only
	A(await navTo('#scr-menu [data-go=play]'), 'D-pad reaches Play');
	await press(B.confirm);
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 15000), 'confirm on Play starts a run');
	await sleep(500);
	// stick: deadzone + radial scaling
	const ax = await ev(() => { const r = []; for (const [x, y] of [[0.12, 0.05], [0.6, 0], [1, 0], [0.7071, 0.7071]]) { __axes(x, y); r.push(G.Pad.axis()); } __axes(0, 0); return r; });
	A(ax[0] === null, 'left stick: inside the deadzone does nothing', JSON.stringify(ax[0]));
	A(ax[1] && Math.abs(ax[1][0] - 0.5) < 0.01 && ax[2] && Math.abs(ax[2][0] - 1) < 0.001, 'left stick: radial scaling (0.6 -> 0.5, full -> 1): analog speed', JSON.stringify(ax.slice(1, 3)));
	A(ax[3] && Math.abs(Math.hypot(ax[3][0], ax[3][1]) - 1) < 0.01, 'left stick: diagonals keep full speed (radial, not per-axis)', JSON.stringify(ax[3]));
	const pos = () => ev(() => ({ x: G.Game.player.x, y: G.Game.player.y }));
	let p0 = await pos();
	await ev(() => __axes(1, 0)); await sleep(500); await ev(() => __axes(0, 0));
	let p1 = await pos();
	A(p1.x - p0.x > 30, `left stick moves the partner (dx ${Math.round(p1.x - p0.x)})`);
	p0 = await pos();
	await ev(() => __axes(0.45, 0)); await sleep(500); await ev(() => __axes(0, 0));
	p1 = await pos();
	const slow = p1.x - p0.x;
	p0 = await pos();
	await ev(() => __axes(-1, 0)); await sleep(500); await ev(() => __axes(0, 0));
	p1 = await pos();
	A(slow > 3 && slow < (p0.x - p1.x) * 0.6, `a half-tilted stick walks slower (${Math.round(slow)} vs ${Math.round(p0.x - p1.x)})`);
	p0 = await pos();
	await ev(() => __btn(13, true)); await sleep(500); await ev(() => __btn(13, false));
	p1 = await pos();
	A(p1.y - p0.y > 30, `D-pad moves the partner (dy ${Math.round(p1.y - p0.y)})`);
	// HUD hint (first 14 s) is drawn with glyphs: just check the mode the HUD reads
	A(await ev(() => G.Pad.mode) === 'pad', 'in a run the HUD is in pad mode (glyph hints, LB/RB beside the moves)');
	// pause / resume with the remapped pause button (X)
	await press(B.X);
	A(await waitFor(() => visible('scr-pause'), 2000) && await ev(() => G.Game.state) === 'paused', 'the REMAPPED pause button (X) pauses');
	const ph = await ev(() => ({ pad: getComputedStyle(document.querySelector('#scr-pause .pad-hint')).display, kbd: getComputedStyle(document.querySelector('#scr-pause .kbd-hint')).display, glyphs: document.querySelectorAll('#scr-pause .pad-hint svg').length }));
	A(ph.pad !== 'none' && ph.kbd === 'none' && ph.glyphs >= 4, 'pause shows the pad hints (glyphs), not the keyboard ones', JSON.stringify(ph));
	f = await focus();
	A(f && f.id === 'btn-resume', 'pause: the ring is on Continue', JSON.stringify(f));
	await press(B.cancel);
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 2000) && !(await visible('scr-pause')), 'cancel resumes');
	await press(B.X);
	A(await waitFor(() => visible('scr-pause'), 2000), 'pause again');
	await press(B.X);
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 2000), 'the pause button resumes too');
	await press(B.start);
	A(await ev(() => G.Game.state) === 'playing', 'Start no longer pauses (it is reroll now)');

	// ---- level-up cards
	await ev(() => G.Game.debugLevelUp());
	A(await waitFor(() => visible('scr-levelup'), 4000), 'a level-up opens the cards');
	await sleep(500);
	const lv = await ev(() => {
		const d = s => getComputedStyle(document.querySelector(s)).display;
		const foc = document.querySelector('#cards .card.pad-focus');
		return { keysHidden: d('#scr-levelup .sub .key-k') === 'none', glyphs: d('#scr-levelup .sub .key-p') !== 'none', focusGlyph: !!foc && getComputedStyle(foc.querySelector('.key .pad-glyph')).display !== 'none', first: foc === document.querySelector('#cards .card') };
	});
	A(lv.keysHidden && lv.glyphs, 'level-up prompt: D-pad + confirm glyphs instead of "1 2 3"', JSON.stringify(lv));
	A(lv.first && lv.focusGlyph, 'the first card is focused and shows the confirm glyph', JSON.stringify(lv));
	const rr = await ev(() => ({ n: G.Game.player.rerolls || 0, d: getComputedStyle(document.querySelector('#lvl-reroll .key-p')).display, g: document.querySelector('#lvl-reroll .key-p .pad-glyph') && document.querySelector('#lvl-reroll .key-p .pad-glyph').dataset.g }));
	A(rr.d !== 'none' && rr.g === 'reroll', 'the Reroll button shows the reroll glyph instead of R', JSON.stringify(rr));
	await shot('pad_levelup.png');
	const cards0 = await ev(() => [...document.querySelectorAll('#cards .card .nm')].map(e => e.textContent).join('|'));
	await press(B.start);    // reroll was swapped onto Start
	const rr1 = await ev(() => ({ n: G.Game.player.rerolls || 0, cards: [...document.querySelectorAll('#cards .card .nm')].map(e => e.textContent).join('|') }));
	A(rr1.n === rr.n + 1, `the REMAPPED reroll button (Start) rerolls (rerolls ${rr.n} -> ${rr1.n})`, cards0 + ' => ' + rr1.cards);
	// keyboard use: prompts back to keys; pad use: back to glyphs
	await page.keyboard.press('KeyK');
	const kb = await ev(() => ({ cls: document.body.classList.contains('pad-input'), keys: getComputedStyle(document.querySelector('#scr-levelup .sub .key-k')).display, pad: getComputedStyle(document.querySelector('#scr-levelup .sub .key-p')).display, ring: getComputedStyle(document.querySelector('.pad-focus') || document.body).outlineStyle }));
	A(!kb.cls && kb.keys !== 'none' && kb.pad === 'none' && kb.ring !== 'solid', 'keyboard use: the prompts switch back to keys and the ring hides', JSON.stringify(kb));
	await press(B.right);
	const pd = await ev(() => ({ cls: document.body.classList.contains('pad-input'), keys: getComputedStyle(document.querySelector('#scr-levelup .sub .key-k')).display }));
	A(pd.cls && pd.keys === 'none', 'pad use: back to glyphs', JSON.stringify(pd));
	const cardAt = () => ev(() => [...document.querySelectorAll('#cards .card')].findIndex(c => c.classList.contains('pad-focus')));
	const ca0 = await cardAt();
	await press(B.RB);
	const ca1 = await cardAt();
	await press(B.LB);
	const ca2 = await cardAt();
	A(ca1 === (ca0 + 1) % 3 && ca2 === ca0, `RB / LB step through the cards (${ca0} -> ${ca1} -> ${ca2})`);
	// pick a "new move" card if offered (so LB/RB have something to switch), else the second card
	const target = await ev(() => { const cs = [...document.querySelectorAll('#cards .card')]; const i = cs.findIndex(c => /New ·/.test(c.textContent)); return i >= 0 ? i : 1; });
	for (let i = 0; i < 4; i++) {
		const at = await ev(() => [...document.querySelectorAll('#cards .card')].findIndex(c => c.classList.contains('pad-focus')));
		if (at === target) break;
		await press(at < target ? B.down : B.up);
	}
	const at = await ev(() => [...document.querySelectorAll('#cards .card')].findIndex(c => c.classList.contains('pad-focus')));
	A(at === target, `the D-pad walks the cards (card ${target + 1})`, at);
	const moves0 = await ev(() => G.Game.player.slots.length);
	await press(B.confirm);
	A(await waitFor(async () => !(await visible('scr-levelup')), 3000) && await ev(() => G.Game.state) === 'playing', 'confirm picks the focused card; the run resumes');
	await sleep(200);
	const slots = await ev(() => G.Game.player.slots.length);
	if (slots > 1) {
		const a0 = await ev(() => G.Game.player.active);
		await press(B.RB);
		const a1 = await ev(() => G.Game.player.active);
		await press(B.LB);
		const a2 = await ev(() => G.Game.player.active);
		A(a1 !== a0 && a2 === a0, `RB / LB switch the active move (${a0} -> ${a1} -> ${a2})`);
	} else console.log(`note: no new-move card was offered (${moves0} -> ${slots} slots): LB/RB move switch not exercised`);
	// rumble on hit
	const calls0 = await ev(() => window.__pads[0].vibrationActuator.calls.length);
	await ev(() => { const p = G.Game.player; p.invuln = 0; p.hurt(1); });
	A(await ev(() => window.__pads[0].vibrationActuator.calls.length) === calls0 + 1, 'getting hit rumbles the pad (vibration on)');
	// quit to the summary with the pad
	await press(B.X);
	A(await waitFor(() => visible('scr-pause'), 2000), 'pause (to quit)');
	A(await navTo('#btn-quit'), 'D-pad reaches "Abandon run"');
	await press(B.confirm);
	A(await waitFor(() => visible('scr-over'), 6000), 'confirm quits: run summary');
	await sleep(300);
	f = await focus();
	A(f && f.id === 'btn-again', 'summary: the ring is on "Back to menu"', JSON.stringify(f));
	await press(B.confirm);
	A(await waitFor(() => visible('scr-menu'), 6000), 'confirm returns to the menu');

	// ---- hot-plug
	await ev(() => { window.__pads = []; });
	await sleep(250);
	A(await ev(() => !G.Pad.active && !document.body.classList.contains('pad-input')) && /Controller disconnected/.test(await toastText()), 'unplugging: "Controller disconnected", the ring hides');
	await ev(() => { window.__pads[1] = window.__mkPad(1, 'Second Synthetic Pad'); window.__pads[0] = window.__mkPad(0, 'First Synthetic Pad'); });
	await press(B.confirm, 1);
	A(await ev(() => G.Pad.active && document.body.classList.contains('pad-input')), 'a re-plugged pad takes over on its first press');
	const f1 = await focus();
	await press(B.down, 0);    // the other pad: ignored
	const f2 = await focus();
	A(f1 && f2 && f1.text === f2.text, 'the first active pad drives; a second pad is ignored', JSON.stringify([f1, f2]));
	await press(B.down, 1);
	const f3 = await focus();
	A(f3 && f3.text !== f1.text, 'the driving pad still navigates', JSON.stringify(f3));

	// ---- reset the mapping with the pad
	A(await navTo('#scr-menu [data-go=settings]', 1), 'back to Settings (driving pad)');
	await press(B.confirm, 1);
	await waitFor(() => visible('scr-settings'), 3000);
	for (let i = 0; i < 6; i++) { if (await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'ctl') break; await press(B.RB, 1); }
	A(await navTo('#pad-reset', 1), 'D-pad reaches "Reset mapping"');
	await press(B.confirm, 1);
	A(JSON.stringify(await ev(() => G.Pad.map())) === JSON.stringify({ prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3 }), 'reset restores the layout defaults', JSON.stringify(await ev(() => G.Pad.map())));

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
