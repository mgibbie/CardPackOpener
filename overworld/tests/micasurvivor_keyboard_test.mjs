// micasurvivor_keyboard_test.mjs — MicaSurvivor played with the KEYBOARD ONLY (controls sweep B4). No mouse event, no
// pad, no touch: every press is a real (trusted) key event from Chrome. The site's map (site/input.js, by physical key):
//   arrows / WASD move (the partner in a run, the focus ring in menus) · Z confirm · X back · C / V the pad's top / left
//   face buttons (reroll · ban on the cards; Z-move · Dynamax in a run) · Q / E tabs and cards · Enter Start (pause in a
//   run, "choose" in a menu) · Backspace Select (Dynamax).
//   1. title: before B4 the keyboard was stuck here (nothing moved, Tab was blocked). Z shows the ring on Play, Z again plays;
//      the ring is drawn for the keyboard (body.nav-ring) and the DOM focus follows it; Tab is no longer swallowed
//   2. choosing a partner (Z picks, Z again chooses) and the menu, with Z alone; the menu hint bar shows the keys (Z / X)
//   3. every menu screen (Pokémon, Upgrades, Gacha, Missions, Lexicon, Ranking, Friends, Game modes) opened with Z, walked with
//      arrows and WASD, tabs cycled with Q / E, left with X; a key press never hides the ring
//   4. a gacha pull, Settings (the Controls tab lists the new keys), Credits; typing in a text field (a friend's name) moves
//      nothing; Esc leaves the field and the arrows navigate again
//   5. the Play flow (U1) with the keys: Survival / Expedition / Dive reachable, X steps back to the menu, Enter chooses too
//   6. a run: WASD / arrows move; C = Z-move, V and Backspace = Dynamax; Z and X fire neither any more (they clashed: Z was the
//      Z-move, C Dynamax); Tab is held back only while playing; hold Z = the pad's confirm held (an Expedition glide)
//   7. Enter pauses and resumes; the level-up cards: arrows / Q / E walk them, C rerolls, Z picks; quit from the pause (the
//      ring reaches "Quit run"), the results screen, back to the menu
//   8. the Games switcher (`): opens from the menu and from a run (the run pauses, the guard says the run will be lost), keys
//      never reach the game behind it, X closes it
//   9. signed in (the real server handler over sqlite): Online -> START opens the co-op lobby with the keys; X leaves it
// Screenshots go to MICASURVIVOR_SHOTS=<dir>.
// Covers micasurvivor/js/core/pad.js (keyboard routing, the ring), js/core/input.js (Tab, typing), js/game.js, css/style.css,
// js/ui/settings-ui.js, js/systems/zmoves.js / dynamax.js (key labels), js/expedition/ultimates.js, index.html, site/input.js.
//   node overworld/tests/micasurvivor_keyboard_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8964;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

// ---------- the real /api/mp handler over sqlite (the co-op lobby needs it) ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-kb-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const reg = await call('register', { username: 'kbtester', password: 'msurv-kb-pass-1' });
const TOKEN = reg.body.token, STATE = reg.body.state || (await call('state', {}, TOKEN)).body.state;
const OWN = [1, 4, 7, 25, 133];
const SAVE = (name) => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: Object.fromEntries(OWN.map(d => [d, { at: 1, from: 'gacha' }])),
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, stats: { runs: 3, bestTime: 60, bestLevel: 5, totalKills: 10, coinsEarned: 0 },
	pupg: Object.fromEntries(OWN.map(d => [d, { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 }])),
});
const BEFORE = (o) => {
	if (!o || sessionStorage.getItem('seeded')) return;
	sessionStorage.setItem('seeded', '1');
	localStorage.setItem('magepunk_mp_token_v1', o.token);
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
	localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
	localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
};

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const device = async (o) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|400|401)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument(BEFORE, o || null);
		// keyboard only: a mouse event anywhere fails the test
		await page.evaluateOnNewDocument(() => {
			window.__mouse = 0;
			for (const t of ['mousedown', 'mouseup', 'click', 'pointerdown', 'touchstart']) addEventListener(t, e => { if (e.isTrusted) window.__mouse++; }, true);
		});
		const ev = (fn, ...a) => page.evaluate(fn, ...a);
		const visible = (id) => ev(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		// one key press, then a few frames for the game to route it (js/core/pad.js drains the keys at the top of a frame)
		const key = async (code, ms = 120) => { await page.keyboard.press(code); await sleep(ms); };
		const focus = () => ev(() => { const f = document.querySelector('.pad-focus'); return f ? { id: f.id, cls: String(f.className), text: (f.textContent || '').trim().slice(0, 40), scope: G.Pad.topScope() && G.Pad.topScope().id, n: document.querySelectorAll('.pad-focus').length, ring: getComputedStyle(f).outlineStyle, dom: document.activeElement === f } : null; });
		// the focus to `sel` with the arrow keys (or WASD with wasd=true)
		const navTo = async (sel, wasd = false) => {
			for (let i = 0; i < 60; i++) {
				const d = await ev(sel => {
					const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
					if (!f || !t) return 'missing';
					if (f === t || f.contains(t) || t.contains(f)) return 'here';
					const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
					const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
					return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
				}, sel);
				if (d === 'here') return true;
				if (d === 'missing') { if (process.env.KB_DEBUG) console.log('   navTo missing', sel, JSON.stringify(await focus())); return false; }
				await key(wasd ? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[d] : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[d]);
			}
			return false;
		};
		const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
		return { page, ev, visible, key, focus, navTo, shot };
	};

	// ======================= 1-8: a guest, from the title =======================
	const d = await device();
	const { page, ev, visible, key, focus, navTo, shot } = d;
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => ev(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && G.Pad.keyboard), 30000), 'boots; the site keyboard layer (site/input.js) loads into G.Pad');
	if (await visible('tap-start')) await key('KeyZ', 300);
	A(await waitFor(() => visible('scr-login'), 10000), 'title (login) screen');
	A(await ev(() => !document.querySelector('.pad-focus') || !document.body.classList.contains('nav-ring')), 'no ring before the keyboard is used');
	// Tab is no longer swallowed in the menus (it was preventDefault-ed everywhere: native focusing was dead)
	await ev(() => { window.__tabPrevented = null; addEventListener('keydown', e => { if (e.key === 'Tab') window.__tabPrevented = e.defaultPrevented; }); });
	await key('Tab');
	A(await ev(() => window.__tabPrevented === false && document.activeElement && document.activeElement !== document.body), 'Tab on the title: not blocked, the browser moves the focus', await ev(() => [window.__tabPrevented, document.activeElement && document.activeElement.outerHTML.slice(0, 80)]));
	A(await ev(() => document.body.classList.contains('nav-ring') && !!document.querySelector('.pad-focus') && document.querySelector('.pad-focus') === document.activeElement), 'the ring follows Tab (it lands where the browser focus went)', JSON.stringify(await focus()));
	await key('Escape');   // (nothing to close; Esc on the title is harmless)
	// arrows / Z from the title (the regression: before B4 nothing at all happened here)
	A(await navTo('#btn-guest'), 'the arrows walk the title\'s buttons to Play');
	let f = await focus();
	A(f && f.id === 'btn-guest' && f.ring === 'solid' && f.dom, 'title: the ring is drawn on Play (gold outline) and the DOM focus is on it', JSON.stringify(f));
	const hint = await ev(() => { const h = document.getElementById('pad-hint'); return { on: !!h && !h.classList.contains('hidden'), text: h && h.innerText, kbds: h ? h.querySelectorAll('kbd').length : 0 }; });
	A(hint.on && /Z\s*Accept/.test(hint.text) && /X\s*Back/.test(hint.text) && hint.kbds >= 2, 'the hint bar shows the KEYS (Z Accept, X Back)', JSON.stringify(hint));
	await key('KeyK');   // an unmapped key: the ring stays (before, any key hid it)
	A(await ev(() => document.body.classList.contains('nav-ring') && getComputedStyle(document.querySelector('.pad-focus')).outlineStyle === 'solid'), 'a key press never hides the ring');
	await key('KeyZ');
	A(await waitFor(() => visible('scr-starters'), 5000), 'Z on Play: choosing a partner');
	await sleep(250); await key('KeyZ', 200);
	f = await focus();
	A(f && /\bcell\b/.test(f.cls) && /\bon\b/.test(f.cls) && await ev(() => !document.getElementById('starter-ok').disabled), 'Z on a starter picks it (the ring stays on it)', JSON.stringify(f));
	await key('KeyZ');
	A(await waitFor(() => visible('scr-menu'), 8000), 'the main menu, reached with the keyboard only');
	await sleep(300);
	f = await focus();
	A(f && /play/.test(f.cls) && f.n === 1 && f.ring === 'solid', 'menu: the ring sits on Play', JSON.stringify(f));
	await key('KeyS');
	f = await focus();
	A(f && /Pokémon/.test(f.text), 'S (WASD) moves the ring down to the entry under Play (Pokémon)', JSON.stringify(f));
	await key('KeyW');
	f = await focus();
	A(f && /play/.test(f.cls), 'W moves it back up', JSON.stringify(f));
	await shot('kb_menu.png');

	// ---- 3. every menu screen: Z opens, arrows walk, Q / E tabs, X back
	const tabOn = (ev, id) => ev(id => { const t = document.querySelector('#' + id + ' .gen-tab.on, #' + id + ' .tab.on'); return t && t.textContent.trim(); }, id);
	const visitScreens = async ({ page, ev, visible, key, focus, navTo }, list) => { let f; for (const [go, id, tabs] of list) {
		/* (the menu has no "Game modes" button now: that screen is opened by its own call) */
		if (go === 'modes') await ev(() => G.ModesUI.open());
		else { A(await navTo(`#scr-menu [data-go=${go}]`), `menu: the arrows reach ${go}`); await key('KeyZ'); }
		A(await waitFor(() => visible(id), 4000), `${go}: it opens`);
		await sleep(200);
		f = await focus();
		A(f && f.scope === id && f.ring === 'solid', `${go}: the ring is inside the screen`, JSON.stringify(f));
		const before = await focus();
		await key('ArrowRight'); await key('ArrowDown');
		const after = await focus();
		A(after && after.scope === id && (after.text !== before.text || after.cls !== before.cls || go === 'friends' || go === 'rank'), `${go}: the arrows move the ring inside the screen`, JSON.stringify([before, after]));
		if (tabs) {
			const t0 = await tabOn(ev, id);
			await key('KeyE');
			const t1 = await tabOn(ev, id);
			A(t0 && t1 && t0 !== t1, `${go}: E cycles the tabs (${t0} -> ${t1})`);
			await key('KeyQ');
			A(await tabOn(ev, id) === t0, `${go}: Q goes back`);
		}
		if (go === 'upgrades') {
			if (await navTo('#upg-mon')) {
				const n = await ev(() => document.getElementById('upg-mon').options.length);
				const v0 = await ev(() => document.getElementById('upg-mon').selectedIndex);
				await key('ArrowRight');
				const v1 = await ev(() => document.getElementById('upg-mon').selectedIndex);
				A(n < 2 || v1 !== v0, 'upgrades: → changes the Pokémon dropdown', `${v0}->${v1} of ${n}`);
			} else A(false, 'upgrades: the arrows reach the Pokémon dropdown');
		}
		if (go === 'friends') {
			// typing in a text field moves nothing; Esc leaves it and the arrows navigate again
			A(await navTo('#fr-name'), 'friends: the arrows reach the friend-name field');
			await key('KeyZ');
			A(await ev(() => document.activeElement && document.activeElement.id === 'fr-name'), 'Z on a text field puts the caret in it');
			const r0 = await focus();
			await page.keyboard.type('wasdzxcvqe');
			await key('ArrowDown'); await key('Backspace');
			const r1 = await focus();
			A(await ev(() => document.getElementById('fr-name').value) === 'wasdzxcvq' && r1 && r0 && r1.text === r0.text && await visible('scr-friends'),
				'typing "wasdzxcvqe" (+ ↓, Backspace) only types: the ring stays, the screen stays', JSON.stringify([await ev(() => document.getElementById('fr-name').value), r0, r1]));
			await key('Escape');
			A(await ev(() => document.activeElement.id !== 'fr-name') && await visible('scr-friends'), 'Esc leaves the field (the screen stays open)');
			const r2 = await focus();
			await key('ArrowUp');
			const r3 = await focus();
			A(r3 && r2 && (r3.text !== r2.text || r3.cls !== r2.cls), 'then the arrows navigate again', JSON.stringify([r2, r3]));
		}
		await key('KeyX');
		A(await waitFor(async () => !(await visible(id)) && await visible('scr-menu'), 3000), `${go}: X goes back to the menu`);
		f = await focus();
		A(f && f.scope === 'scr-menu' && f.ring === 'solid', `${go}: back on the menu, the ring is still shown`, JSON.stringify(f));
	} };
	await visitScreens(d, [['dex', 'scr-dex', true], ['upgrades', 'scr-upgrades', false], ['gacha', 'scr-gacha', true], ['goals', 'scr-goals', true], ['lexicon', 'scr-lexicon', false], ['modes', 'scr-modes', false]]);

	// ---- 4. a gacha pull, Settings > Controls, Credits
	await ev(() => { G.DB.save.tickets.t1 = 1; });
	A(await navTo('#scr-menu [data-go=gacha]'), 'menu: back to the gacha');
	await key('KeyZ');
	await waitFor(() => visible('scr-gacha'), 3000);
	A(await navTo('#pull-1'), 'gacha: the arrows reach "Pull ×1"');
	await key('KeyZ');
	A(await waitFor(() => visible('pull-fx'), 3000), 'Z pulls: the slot machine opens');
	for (let i = 0; i < 30 && !(await visible('pull-close')); i++) { await key('KeyZ'); if (await waitFor(() => visible('pull-close'), 1000)) break; }
	A(await visible('pull-close'), 'Z hurries the reels; the result shows');
	await sleep(150);
	await key('KeyZ');
	A(await waitFor(async () => !(await visible('pull-fx')), 3000) && await visible('scr-gacha'), 'Z on Continue closes the results');
	await key('KeyX');
	A(await waitFor(() => visible('scr-menu'), 3000), 'X: back to the menu');
	A(await navTo('#scr-menu [data-go=settings]'), 'menu: the arrows reach Settings');
	await key('Enter');   // (Enter chooses in a menu)
	A(await waitFor(() => visible('scr-settings'), 3000), 'Enter opens Settings');
	for (let i = 0; i < 6; i++) { if (await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'ctl') break; await key('KeyE'); }
	A(await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'ctl', 'E reaches the Controls tab');
	const keysList = await ev(() => document.querySelector('#set-body .keys').innerText.replace(/\s+/g, ' '));
	A(/Z accept/.test(keysList) && /X back/.test(keysList) && /C Z-Move or Ultimate/.test(keysList) && /V Dynamax/.test(keysList) && /Q E tabs and cards/.test(keysList) && /Enter choose; in a run, pause/.test(keysList),
		'Controls lists the keyboard map (Z accept, X back, C Z-Move / Ultimate, V Dynamax, Q / E tabs, Enter)', keysList);
	await shot('kb_settings.png');
	for (let i = 0; i < 6; i++) { if (await ev(() => document.querySelector('#set-tabs .on').dataset.t) === 'about') break; await key('KeyE'); }
	A(await navTo('#set-body [data-legal]'), 'About: the arrows reach "Credits & licences"');
	await key('KeyZ');
	A(await waitFor(() => visible('scr-legal'), 3000), 'Credits open');
	const sc0 = await ev(() => document.querySelector('#scr-legal .legal').scrollTop);
	for (let i = 0; i < 8; i++) await key('ArrowDown', 80);
	A(await ev(() => document.querySelector('#scr-legal .legal').scrollTop) > sc0, 'the arrows scroll the long Credits page');
	await key('KeyX');
	A(await waitFor(async () => !(await visible('scr-legal')), 2000) && await visible('scr-settings'), 'X closes Credits');
	await key('KeyX');
	A(await waitFor(() => visible('scr-menu'), 2000), 'X closes Settings');

	// ---- 8a. the Games switcher from the menu
	await key('Backquote', 300);
	A(await ev(() => !!document.getElementById('mpsw') && !document.getElementById('mpsw').hidden && getComputedStyle(document.getElementById('mpsw')).display !== 'none'), '` opens the Games switcher from the menu');
	const f0 = await focus();
	await key('ArrowDown');
	A(JSON.stringify(await focus()) === JSON.stringify(f0), 'the game behind the switcher does not move');
	await key('KeyX', 300);
	A(await ev(() => { const s = document.getElementById('mpsw'); return !s || s.hidden || getComputedStyle(s).display === 'none'; }) && await visible('scr-menu'), 'X closes the switcher; the menu is still there');

	// ---- 5. the Play flow: Expedition and Dive are reachable, X steps back
	A(await navTo('#scr-menu [data-go=play]'), 'the arrows reach Play');
	await key('KeyZ');
	A(await waitFor(() => visible('scr-play'), 3000), 'Z opens the Play flow');
	await sleep(250);
	// (the menu's Play opens on step 2: the partner is already chosen)
	A(await ev(() => G.PlayUI.state.step) === 2, 'the flow opens on the category step');
	for (const cat of ['expedition', 'dive']) {
		A(await navTo(`#scr-play [data-cat=${cat}]`), `the arrows reach the ${cat} category`);
		await key('KeyZ', 400);
		A(await waitFor(() => ev(() => G.PlayUI.state && G.PlayUI.state.step >= 3), 3000) || await ev(() => !!document.querySelector('#scr-play [data-var]')), `Z opens ${cat}'s variants`, JSON.stringify(await ev(() => G.PlayUI.state)));
		await key('KeyX', 300);
		A(await ev(() => !!document.querySelector('#scr-play [data-cat]')), `X steps back to the categories (from ${cat})`);
	}
	A(await navTo('#scr-play [data-cat=survival]'), 'back to Survival');
	for (let i = 0; i < 6 && await ev(() => G.Game.state === 'ui'); i++) await key('KeyZ', 300);
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 15000), 'Z through Survival -> Normal -> Solo -> START starts a run');
	await sleep(600);

	// ---- 6. the run
	const pos = () => ev(() => ({ x: G.Game.player.x, y: G.Game.player.y }));
	let p0 = await pos();
	await page.keyboard.down('KeyD'); await sleep(500); await page.keyboard.up('KeyD');
	let p1 = await pos();
	A(p1.x - p0.x > 30, `D walks right (dx ${Math.round(p1.x - p0.x)})`);
	p0 = await pos();
	await page.keyboard.down('ArrowUp'); await sleep(500); await page.keyboard.up('ArrowUp');
	p1 = await pos();
	A(p0.y - p1.y > 30, `↑ walks up (dy ${Math.round(p0.y - p1.y)})`);
	// the moved run keys: spy on the Z-move / Dynamax / Ultimate entry points
	await ev(() => {
		window.__calls = [];
		const wrap = (o, k, tag) => { const f0 = o[k]; o[k] = function (...a) { window.__calls.push(tag); return f0.apply(this, a); }; };
		wrap(G.ZMoves, 'tryStart', 'zmove'); wrap(G.Dynamax, 'tryStart', 'dynamax');
	});
	const calls = () => ev(() => window.__calls.splice(0).join(','));
	await key('KeyZ'); await key('KeyX');
	A(await calls() === '', 'Z and X fire neither the Z-move nor Dynamax any more (Z = confirm, X = back)');
	await key('KeyC');
	A(await calls() === 'zmove', 'C fires the Z-move (the pad\'s top face button)');
	await key('KeyV');
	A(await calls() === 'dynamax', 'V fires Dynamax (the pad\'s left face button)');
	await key('Backspace');
	A(await calls() === 'dynamax', 'Backspace (Select) fires Dynamax too');
	A(await ev(() => G.Game.state) === 'playing', 'none of them paused the run');
	await key('Tab');
	A(await ev(() => window.__tabPrevented === true), 'Tab is held back while playing (Team mode swaps with it)');
	await page.keyboard.down('KeyZ'); await sleep(120);
	const zHeld = await ev(() => G.Pad.held('confirm'));
	await page.keyboard.up('KeyZ'); await sleep(80);
	A(zHeld && !(await ev(() => G.Pad.held('confirm'))), 'holding Z holds the pad\'s confirm (an Expedition glide reads it)');

	// ---- 7. pause with Enter, the level-up cards, quit
	await key('Enter');
	A(await waitFor(() => visible('scr-pause'), 2000) && await ev(() => G.Game.state) === 'paused', 'Enter pauses');
	f = await focus();
	A(f && f.id === 'btn-resume' && f.ring === 'solid', 'pause: the ring is on Continue', JSON.stringify(f));
	const ph = await ev(() => document.querySelector('#scr-pause .kbd-hint').innerText);
	A(/C\s*Z-Move/.test(ph) && /V\s*Dynamax/.test(ph), 'the pause hint names the new keys (C Z-Move, V Dynamax)', ph);
	await shot('kb_pause.png');
	await key('Enter');
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 2000), 'Enter resumes');
	await key('Escape');
	A(await waitFor(() => visible('scr-pause'), 2000), 'Esc pauses (as before)');
	await key('KeyX');
	A(await waitFor(() => ev(() => G.Game.state === 'playing'), 2000), 'X resumes from the pause (back)');

	await ev(() => G.Game.debugLevelUp());
	A(await waitFor(() => visible('scr-levelup'), 4000), 'a level-up opens the cards');
	await sleep(500);
	const lvl = await ev(() => ({ reroll: document.querySelector('#lvl-reroll .key-k').innerText, ban: document.querySelector('#lvl-ban .key-k').innerText }));
	A(lvl.reroll === 'C' && lvl.ban === 'V', 'the card screen names C (reroll) and V (ban)', JSON.stringify(lvl));
	const cardAt = () => ev(() => [...document.querySelectorAll('#cards .card')].findIndex(c => c.classList.contains('pad-focus')));
	const c0 = await cardAt();
	await key('KeyE');
	const c1 = await cardAt();
	await key('KeyQ');
	A(c0 >= 0 && c1 === (c0 + 1) % 3 && await cardAt() === c0, `E / Q step through the cards (${c0} -> ${c1} -> back)`);
	const rr0 = await ev(() => G.Game.player.rerolls || 0);
	await key('KeyC', 200);
	A(await ev(() => G.Game.player.rerolls || 0) === rr0 + 1, 'C rerolls the cards');
	await key('ArrowDown');
	await key('KeyZ');
	A(await waitFor(async () => !(await visible('scr-levelup')), 3000) && await ev(() => G.Game.state) === 'playing', 'Z picks the focused card; the run goes on');

	// ---- 8b. the switcher from a run: the run pauses, the guard warns, keys stay out of the game
	await key('Backquote', 400);
	A(await ev(() => !!document.getElementById('mpsw') && getComputedStyle(document.getElementById('mpsw')).display !== 'none'), '` opens the switcher from a run');
	A(await ev(() => G.Game.state) === 'paused', 'the run pauses behind it');
	A(await ev(() => window.mpLeaveGuard().state === 'confirm' && /run/i.test(window.mpLeaveGuard().message)), 'the leave guard asks first (the run will be lost)', await ev(() => JSON.stringify(window.mpLeaveGuard())));
	await key('KeyC');
	A(await calls() === '', 'C while the switcher is open does not reach the run');
	await key('KeyX', 300);
	A(await ev(() => { const s = document.getElementById('mpsw'); return !s || getComputedStyle(s).display === 'none'; }), 'X closes the switcher');
	A(await visible('scr-pause'), 'the run is left paused');
	A(await navTo('#btn-quit'), 'the arrows reach "Quit run"');
	await key('KeyZ');
	A(await waitFor(() => visible('scr-over'), 6000), 'Z quits: the results screen');
	await sleep(300);
	f = await focus();
	A(f && f.id === 'btn-again' && f.ring === 'solid', 'results: the ring is on "Back to menu"', JSON.stringify(f));
	await shot('kb_results.png');
	await key('KeyZ');
	A(await waitFor(() => visible('scr-menu'), 6000), 'Z: back to the menu');
	A(await ev(() => window.__mouse) === 0, 'not one mouse / touch event in the whole guest session');

	// ======================= 9. signed in: the co-op lobby =======================
	const s = await device({ user: 'kbtester', token: TOKEN, state: STATE, save: SAVE('kbtester') });
	await s.page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => s.ev(() => typeof G === 'object' && G.Pad && G.Pad.keyboard && document.getElementById('boot').classList.contains('hidden')), 30000);
	await sleep(300);
	if (await s.visible('tap-start')) await s.key('KeyZ', 300);
	A(await waitFor(() => s.visible('scr-menu'), 15000), 'signed in: the menu');
	await s.key('KeyZ');   // the first press shows the ring
	// the screens that need an account: the leaderboard (with its text field) and friends
	await visitScreens(s, [['rank', 'scr-rank', false], ['friends', 'scr-friends', false]]);
	A(await s.navTo('#scr-menu [data-go=play]'), 'signed in: the arrows reach Play');
	await s.key('KeyZ', 300);
	A(await s.navTo('#scr-play [data-cat=survival]'), 'Survival');
	await s.key('KeyZ', 300);
	A(await s.navTo('#scr-play [data-var=normal]'), 'Normal');
	await s.key('KeyZ', 300);
	A(await s.navTo('#scr-play [data-players=online]'), 'the arrows reach "Online with friends"');
	await s.key('KeyZ', 300);
	A(await s.navTo('#mx-start'), 'the arrows reach "Create lobby"');
	await s.key('KeyZ');
	A(await waitFor(() => s.visible('scr-lobby'), 8000), 'Z creates the co-op lobby and opens it');
	await sleep(300);
	f = await s.focus();
	A(f && f.scope === 'scr-lobby' && f.ring === 'solid', 'lobby: the ring is inside it', JSON.stringify(f));
	await s.shot('kb_lobby.png');
	await s.key('KeyX', 400);
	A(await waitFor(async () => !(await s.visible('scr-lobby')), 4000), 'X leaves the lobby screen');
	A(await s.ev(() => window.__mouse) === 0, 'not one mouse / touch event in the signed-in session');

	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
