// micasurvivor_online_test.mjs — MicaSurvivor M5 batch 12b: online co-op with friends, end to end. The REAL server
// handler (server/mp.mjs, bundled like the dev server, over an in-memory sqlite D1 stand-in) behind a static server,
// and THREE signed-in Magepunk friends, each in their own browser context (separate localStorage):
//   - menus: "Play with friends" (a guest is told to sign in), the friends list with who is online / in MicaSurvivor
//   - alice (host) creates a lobby and invites bob and carl from it; each sees the invite popup in MicaSurvivor (and a
//     bell message in their Magepunk inbox), joins, picks ready; the lobby shows members, Pokémon, ready, connection
//   - the start: the server refuses it until everyone is ready; then all three are in one run (same seed)
//   - WebRTC: the data channels open on localhost (host candidates, no STUN: window.__msurvNet.ice = []) and the
//     signalling polls stop once they are open
//   - in the run: positions sync both ways, an enemy the guest kills dies for the host, XP / level are shared and the
//     level-up waits for everyone (the wait screen names who is still choosing) and releases for all
//   - a guest closes the tab: the host keeps playing ("carl left the game"); the host closes the tab: the guest's run
//     ends ("Lost connection to the host.") with its rewards saved (coins, runs, groupRuns, the account row)
//   - the relay fallback: WebRTC off (window.__msurvNet.noRtc), two friends play through /api/mp (msurv-relay-*),
//     positions + a kill sync, the host quits and the guest's run ends gracefully ("The host has ended the game")
//   - no Spanish anywhere in English mode (DOM, toasts, the canvas)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the friends screen, the lobby (host + guest), the invite popup, a 3-player
// run from each side (desktop and 844x390), the level-up wait, the disconnect messages, the relay run.
// Covers micasurvivor/js/mica/social.js, js/mica/online.js, js/net/net.js, js/net/coop.js, js/ui/social-ui.js,
// js/ui/menu.js, js/game.js, js/data/lang-en.js, index.html and server/mp.mjs (msurv-*).
//   node overworld/tests/micasurvivor_online_test.mjs
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
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9611;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// ---------- the real handler over sqlite, counting row writes per key prefix ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push({ k: String(bound[0]), t: Date.now() }); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-online-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const actions = [];   // every /api/mp call the pages make: {who, action, t}
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); actions.push({ action: b.action, t: Date.now(), auth: (req.headers.authorization || '').slice(-8) }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (a suite rerun right after the first may find the port still held for a moment: retry for 20 s)
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

// ---------- accounts: alice hosts; bob and carl are her friends ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carl', 'dave', 'erin']) tokens[n] = (await call('register', { username: n, password: 'msurv-online-pass' })).token;
for (const n of ['bob', 'carl']) await call('add-friend', { username: 'alice' }, tokens[n]);
await call('add-friend', { username: 'erin' }, tokens.dave);
A(Object.values(tokens).every(Boolean), 'five real accounts registered; bob and carl are alice\'s friends (dave + erin for the relay run)');

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|sala|amigos|anfitrión|listo|jugar|partida|invitar|invita|conectado|conectando|esperando|elige|faltan|compañero|monedas|ha dejado|perdido)\b/i;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({
		executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		// real host candidates on localhost (no mDNS .local names), so WebRTC connects without any STUN server
		args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--mute-audio'],
	});
	const pages = {};
	const open = async (who, net = {}) => {
		const ctx = await browser.createBrowserContext();   // its own localStorage (the 2-client gotcha)
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = (await call('state', {}, tokens[who])).state || { username: who };
		await page.evaluateOnNewDocument((tok, st, net) => {
			localStorage.setItem('magepunk_mp_token_v1', tok);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('micasurvivor_lang', 'en');
			window.__msurvNet = net;
			window.__drawn = new Set(); window.__toasts = [];
			window.__pads = [];
			window.__mkPad = (i, id) => ({ index: i, id, connected: true, mapping: 'standard', timestamp: 0,
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
				vibrationActuator: { playEffect() { return Promise.resolve('complete'); } } });
			window.__btn = (b, on) => { const pad = window.__pads[0]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
			Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
			addEventListener('DOMContentLoaded', () => {
				const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
				P.fillText = function (s, ...a) { if (typeof s === 'string' && window.G && G.I18n && window.__rec) window.__drawn.add(G.I18n.t(s)); return orig.call(this, s, ...a); };
				new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); })
					.observe(document.body, { childList: true, subtree: true, characterData: true });
			});
		}, tokens[who], st, Object.assign({ ice: [], lostMs: 9000, directMs: 8000, invMs: 1200, friendsMs: 1500 }, net));
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const p = { who, ctx, page, E: (fn, ...a) => page.evaluate(fn, ...a) };
		p.visible = id => p.E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		p.shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
		p.click = sel => p.E(sel => { const el = document.querySelector(sel); if (!el || el.disabled) return false; el.click(); return true; }, sel);
		p.text = sel => p.E(sel => { const el = document.querySelector(sel); return el ? el.innerText : ''; }, sel);
		p.press = async (b) => { await p.E(b => __btn(b, true), b); await sleep(90); await p.E(b => __btn(b, false), b); await sleep(110); };
		// the D-pad walks the focus ring to `sel` (12 up, 13 down, 14 left, 15 right)
		p.navTo = async (sel) => {
			for (let i = 0; i < 60; i++) {
				const d = await p.E(sel => {
					const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
					if (!f || !t) return 'missing';
					if (f === t || f.contains(t) || t.contains(f)) return 'here';
					const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
					const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
					return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
				}, sel);
				if (d === 'here') return true;
				if (d === 'missing') return false;
				await p.press(d);
			}
			return false;
		};
		p.tap = async (sel) => {
			const b = await p.E(sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
			if (b) await page.touchscreen.tap(b.x, b.y);
			return !!b;
		};
		pages[who] = p;
		return p;
	};
	// boot -> (tap to start) -> personality test -> menu
	const boot = async (p) => {
		const ok = await waitFor(() => p.E(() => document.getElementById('boot').classList.contains('hidden') && !!G.Social && !!G.MicaNet), 30000);
		await sleep(200); if (await p.visible('tap-start')) await p.page.click('#tap-start');
		await waitFor(() => p.visible('scr-test'), 10000);
		for (let i = 0; i < 40 && await p.visible('scr-test'); i++) { await p.E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(90); }
		await waitFor(() => p.visible('scr-result'), 8000);
		await p.click('#res-ok');
		return ok && await waitFor(() => p.visible('scr-menu'), 10000);
	};
	const spanish = (p, sel) => p.E((sel, src) => {
		const el = document.querySelector(sel);
		if (!el) return ['missing ' + sel];
		let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon');
		for (const d of G.DEX) if (/[^\x00-\x7f]/.test(d.name) && txt.includes(d.name)) txt = txt.split(d.name).join('#');
		return txt.match(new RegExp(src, 'gi')) || [];
	}, sel, SPANISH.source);
	// the run keeps going between evaluate calls: nobody may die or level up by accident
	const calm = (p) => p.E(() => {
		const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; }
		if (!window.__calm) {
			window.__calm = true;
			G.Spawner.update = () => {}; G.Rift.update = () => {}; G.Events.update = () => {}; G.Judgment.update = () => {}; G.Weather.update = () => {};
		}
		if (G.Coop.isHost) for (const e of G.EnemyMgr.all().slice()) if (!e.dead && !e.netTest) { e.hp = 0; e.dead = true; }
	});

	// ===================== boot the three friends =====================
	const bob = await open('bob'), carl = await open('carl');
	A(await boot(bob) && await boot(carl), 'bob and carl boot signed in (their Magepunk accounts) to the menu', errors.slice(0, 3).join(' | '));
	const alice = await open('alice');
	A(await boot(alice), 'alice boots to the menu');
	for (const p of [alice, bob, carl]) await p.E(() => { window.__rec = true; G.Audio && G.Audio.music && G.Audio.music(null); });

	// the menu item and the friends screen
	const sub = await alice.text('#menu-friends-sub');
	A(/friends|online/i.test(sub) && !/coming soon/i.test(sub), 'the menu\'s Friends item says play with friends (no "Coming soon")', sub);
	await alice.page.click('#scr-menu [data-go=friends]');
	A(await waitFor(() => alice.visible('scr-friends'), 5000), 'Friends opens for a signed-in player');
	A(await waitFor(async () => /bob/.test(await alice.text('#fr-list')) && /carl/.test(await alice.text('#fr-list')) && /In MicaSurvivor/.test(await alice.text('#fr-list')), 8000),
		'alice\'s friends list has bob and carl, "In MicaSurvivor" (presence from their game)', await alice.text('#fr-list'));
	A(/You play as alice/.test(await alice.text('#fr-me')), 'it says who you play as', await alice.text('#fr-me'));
	A((await spanish(alice, '#scr-friends')).length === 0, 'the friends screen has no Spanish', JSON.stringify(await spanish(alice, '#scr-friends')));
	await sleep(500);
	await alice.shot('m5b12b_friends.png');

	// ===================== lobby + invites =====================
	await alice.page.click('#fr-play');
	A(await waitFor(() => alice.visible('scr-lobby'), 6000), '"Play with friends" creates a lobby and opens it');
	const lobbyId = await alice.E(() => G.Social.room && G.Social.room.id);
	A(/^[0-9a-f]{12}$/.test(lobbyId || '') && !!row('msurvlobby:' + lobbyId), 'the lobby is a server row (msurvlobby:<id>)', lobbyId);
	A(await waitFor(async () => (await alice.E(() => document.querySelectorAll('#lobby-invite .fr-row button').length)) >= 2, 8000), 'the lobby lists the online friends to invite');
	const invite = (name) => alice.E(name => { const r = [...document.querySelectorAll('#lobby-invite .fr-row')].find(x => x.querySelector('b').textContent === name); if (r) r.querySelector('button').click(); return !!r; }, name);
	await invite('bob');
	A(await waitFor(() => bob.visible('invite-pop'), 8000), 'bob (in MicaSurvivor\'s menu) gets the invite popup');
	const popText = await bob.text('#inv-text');
	A(/alice invites you to play in their lobby/.test(popText), 'the popup says who invites (English)', popText);
	A((row('chat:dm:bob') || []).some(m => m.from === 'alice' && m.kind === 'msurv-invite'), '...and a bell message lands in bob\'s Magepunk inbox (chat:dm:bob)');
	await sleep(500);
	await bob.shot('m5b12b_invite_popup.png');
	const popBox = await bob.E(() => { const a = document.getElementById('invite-pop').getBoundingClientRect(), m = document.querySelector('#scr-menu .menu-list, #scr-menu .box') || document.getElementById('scr-menu'); const b = [...document.querySelectorAll('#scr-menu [data-go]')].map(e => e.getBoundingClientRect()); return b.some(r => !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom)); });
	A(!popBox, 'the invite popup does not cover any menu item');
	await bob.page.click('#inv-yes');
	A(await waitFor(() => bob.visible('scr-lobby'), 6000), 'bob accepts and is in the lobby');
	await invite('carl');
	A(await waitFor(() => carl.visible('invite-pop'), 8000), 'carl gets his invite too');
	await carl.page.click('#inv-yes');
	A(await waitFor(() => carl.visible('scr-lobby'), 6000), 'carl joins');
	A(await waitFor(async () => (await alice.E(() => G.Social.room.members.length)) === 3, 6000), 'the host\'s lobby has 3 members');

	// WebRTC: both pairs open a data channel (localhost host candidates)
	const direct = await waitFor(() => alice.E(() => G.Net.mode('bob') === 'direct' && G.Net.mode('carl') === 'direct'), 25000);
	A(direct, 'the host\'s data channels to bob and carl open (WebRTC, direct)', JSON.stringify(await alice.E(() => G.Net.snapshot())));
	A(await waitFor(() => bob.E(() => G.Net.mode('alice') === 'direct'), 8000), 'bob sees a direct channel to the host');
	await sleep(1500);
	const polling = await alice.E(() => G.MicaNet.snapshot().polling) || await bob.E(() => G.MicaNet.snapshot().polling);
	A(!polling, 'the signalling polls stop once every channel is open');

	// ready + start
	A(await waitFor(async () => /Not ready/.test(await alice.text('#lobby-members')), 5000), 'the host sees the guests are not ready yet');
	A(await alice.E(() => document.getElementById('lobby-start').disabled), 'Start is disabled until everyone is ready');
	await alice.shot('m5b12b_lobby_host_waiting.png');
	await bob.page.click('#lobby-ready');
	await carl.page.click('#lobby-ready');
	A(await waitFor(() => alice.E(() => G.Social.room.members.every(m => m.ready) && !document.getElementById('lobby-start').disabled), 8000), 'both guests ready: Start is enabled');
	const lobbyTxt = await alice.text('#lobby-members');
	A(/alice/.test(lobbyTxt) && /bob/.test(lobbyTxt) && /carl/.test(lobbyTxt) && /Ready · Connected/.test(lobbyTxt) && /Host/.test(lobbyTxt), 'the host\'s lobby: members, their Pokémon, ready and connection', lobbyTxt);
	A(/Host · Connected/.test(await bob.text('#lobby-members')) && /You · Ready/.test(await bob.text('#lobby-members')), 'a guest\'s lobby: the host connection and its own ready state', await bob.text('#lobby-members'));
	for (const p of [alice, bob]) A((await spanish(p, '#scr-lobby')).length === 0, p.who + '\'s lobby has no Spanish', JSON.stringify(await spanish(p, '#scr-lobby')));
	await sleep(400);
	await alice.shot('m5b12b_lobby_host.png');
	await bob.shot('m5b12b_lobby_guest.png');
	// the lobby at phone size: the cards and buttons fit, nothing cut off
	await bob.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(500);
	await bob.shot('m5b12b_lobby_guest_844.png');
	const fit844 = await bob.E(() => { const box = document.querySelector('#scr-lobby .box'); const r = box.getBoundingClientRect(); const btns = [...box.querySelectorAll('button')].filter(b => b.getClientRects().length); const note = document.getElementById('lobby-note').getBoundingClientRect(); return { box: r.left >= 0 && r.right <= innerWidth + 1, note: note.bottom <= innerHeight, btn: btns.every(b => b.scrollWidth <= b.clientWidth + 2) }; });
	A(fit844.box && fit844.btn && fit844.note, 'the lobby fits at 844x390 (down to its note; no button text cut off)', JSON.stringify(fit844));
	await bob.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await alice.page.click('#lobby-start');
	A(await waitFor(async () => (await Promise.all([alice, bob, carl].map(p => p.E(() => G.Game.state === 'playing' && G.Coop.active)))).every(Boolean), 15000), 'the host starts: all three are in the same run');
	const seeds = await Promise.all([alice, bob, carl].map(p => p.E(() => G.World.seed !== undefined ? G.World.seed : null)));
	A(await alice.E(() => G.Coop.isHost) && !(await bob.E(() => G.Coop.isHost)), 'alice is the host, bob a guest');
	const startRow = row('msurvlobby:' + lobbyId);
	A(startRow.start && startRow.start.members.length === 3 && !startRow.open, 'the server stored the start (seed, 3 members) and closed the lobby', JSON.stringify(startRow.start));
	A(seeds.every(s => s === seeds[0] && s != null) && seeds[0] === startRow.start.seed, 'one world: the same seed on all three (the server\'s)', JSON.stringify(seeds));

	// ===================== in the run =====================
	for (const p of [alice, bob, carl]) await calm(p);
	await sleep(600);
	const me = p => p.E(() => ({ x: Math.round(G.Game.player.x), y: Math.round(G.Game.player.y) }));
	const seen = (p, u) => p.E(u => { const m = G.Coop.mate(u); return m ? { x: Math.round(m.pl.x), y: Math.round(m.pl.y), on: m.connected } : null; }, u);
	// bob walks right with the keyboard; alice is moved by her own game state
	const b0 = await me(bob);
	await bob.page.keyboard.down('KeyD'); await sleep(900); await bob.page.keyboard.up('KeyD');
	const b1 = await me(bob);
	A(b1.x - b0.x > 60, 'bob walks (keyboard) in his own game', JSON.stringify([b0, b1]));
	A(await waitFor(async () => { const s = await seen(alice, 'bob'); return s && Math.abs(s.x - b1.x) < 12 && Math.abs(s.y - b1.y) < 12; }, 4000), 'the host sees bob where bob is', JSON.stringify([await seen(alice, 'bob'), b1]));
	A(await waitFor(async () => { const s = await seen(carl, 'bob'); return s && Math.abs(s.x - b1.x) < 12; }, 4000), '...and so does carl (guest to guest, through the host)', JSON.stringify(await seen(carl, 'bob')));
	await alice.E(() => { G.Game.player.y -= 140; });
	const a1 = await me(alice);
	A(await waitFor(async () => { const s = await seen(bob, 'alice'); return s && Math.abs(s.y - a1.y) < 12 && Math.abs(s.x - a1.x) < 12; }, 4000), 'bob sees the host move', JSON.stringify([await seen(bob, 'alice'), a1]));

	// an enemy the GUEST kills dies for the host
	const eid = await alice.E(() => {
		const bp = G.Coop.mate('bob').pl;
		const d = { dex: 19, name: G.DEX_BY[19].name, behavior: 'melee', hp: 1e7, spd: 0, dmg: 1, xp: 1 };
		const e = new G.Enemy(d, bp.x + 70, bp.y, { hp: 1, spd: 1, dmg: 1 }); e.spd = 0; e.netTest = true; G.EnemyMgr.add(e);
		window.__kills0 = G.Game.player.kills;
		return e.id;
	});
	A(await waitFor(() => bob.E(id => { const e = G.EnemyMgr.get(id); return !!e && e.remote; }, eid), 4000), 'the host\'s enemy appears on bob\'s screen (a remote copy)');
	await bob.E(id => { G.EnemyMgr.get(id).hurt(2e7, '#fff', 1, 0, 0); }, eid);
	A(await waitFor(() => alice.E(id => { const e = G.EnemyMgr.get(id); return !e || e.dead; }, eid), 4000), 'bob\'s hit kills it on the HOST (the host applies guests\' hits)');
	A(await waitFor(() => bob.E(id => { const e = G.EnemyMgr.get(id); return !e || e.dead; }, eid), 4000), '...and it is gone from bob\'s screen too');
	A(await waitFor(async () => (await bob.E(() => G.Game.player.kills)) === (await alice.E(() => G.Game.player.kills)) && (await alice.E(() => G.Game.player.kills > window.__kills0)), 4000), 'the team\'s kills count it, on both sides');
	await alice.shot('m5b12b_run_host.png');
	await bob.shot('m5b12b_run_guest.png');
	for (const p of [alice, bob]) await p.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(700);
	await alice.shot('m5b12b_run_host_844.png');
	await bob.shot('m5b12b_run_guest_844.png');
	for (const p of [alice, bob]) await p.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

	// XP / level shared; the level-up waits for everyone and releases for all
	const lv0 = await alice.E(() => G.Game.player.level);
	await alice.E(() => G.Game.debugLevelUp());
	A(await waitFor(async () => (await Promise.all([alice, bob, carl].map(p => p.visible('scr-levelup')))).every(Boolean), 5000), 'a level-up opens the cards for all three at once');
	await alice.click('#cards .card');
	A(await waitFor(async () => /Waiting for bob and carl/.test(await alice.text('#lvl-wait')), 4000), 'the host picked: "Waiting for bob and carl…"', await alice.text('#lvl-wait'));
	A(await alice.E(() => G.Game.state === 'levelup'), 'the host waits (the run does not go on without them)');
	await alice.shot('m5b12b_levelup_wait.png');
	await bob.click('#cards .card');
	A(await waitFor(async () => /Waiting for carl/.test(await alice.text('#lvl-wait')) && /carl/.test(await bob.text('#lvl-wait')), 4000), 'bob picked: both wait for carl', [await alice.text('#lvl-wait'), await bob.text('#lvl-wait')].join(' / '));
	await bob.shot('m5b12b_levelup_wait_guest.png');
	A((await spanish(bob, '#scr-levelup')).length === 0, 'the level-up wait has no Spanish', JSON.stringify(await spanish(bob, '#scr-levelup')));
	await carl.click('#cards .card');
	A(await waitFor(async () => (await Promise.all([alice, bob, carl].map(p => p.E(() => G.Game.state === 'playing' && !document.getElementById('scr-levelup').getClientRects().length)))).every(Boolean), 5000), 'carl picked: the wait releases for all three');
	// "Still choosing: carl and you": the short "tú" used to leak untranslated (too short for the fragment pass)
	const still = await bob.E(() => { G.RunUI.setWaiting(['carl', 'bob']); return new Promise(r => setTimeout(() => { const t = document.getElementById('lvl-wait').textContent; G.RunUI.setWaiting([]); r(t); }, 100)); });
	A(still === 'Still choosing: carl and you', 'the wait line names you in English ("…and you", not "tú")', still);
	const lvs = await Promise.all([alice, bob, carl].map(p => p.E(() => G.Game.player.level)));
	A(lvs.every(l => l === lv0 + 1), 'the level is shared (all three at the same level)', JSON.stringify([lv0, lvs]));
	await alice.E(() => G.Game.debugLevelUp());
	await waitFor(() => bob.visible('scr-levelup'), 5000);
	for (const p of [alice, bob, carl]) await p.click('#cards .card');
	A(await waitFor(async () => (await Promise.all([alice, bob, carl].map(p => p.E(() => G.Game.state === 'playing')))).every(Boolean), 5000), 'a second level-up releases too');

	// ===================== a guest leaves: the host goes on =====================
	await carl.ctx.close();
	A(await waitFor(() => alice.E(() => { const m = G.Coop.mate('carl'); return !!m && !m.connected; }), 15000), 'carl closes his tab: the host drops him (data channel closed, then no relay row)');
	A(await alice.E(() => G.Game.state === 'playing' && G.Coop.active && G.Coop.mate('bob').connected), 'the host keeps playing with bob');
	A(await alice.E(() => [...window.__drawn].some(s => s === 'carl left the game')), 'the host is told "carl left the game"');
	await alice.shot('m5b12b_guest_left.png');
	await alice.E(() => { G.Game.player.x += 90; });
	const a2 = await me(alice);
	A(await waitFor(async () => { const s = await seen(bob, 'alice'); return s && Math.abs(s.x - a2.x) < 12; }, 9000), 'host and bob still sync after carl left', JSON.stringify([a2, await seen(bob, 'alice'), await alice.E(() => [G.Game.state, G.Net.snapshot().peers]), await bob.E(() => [G.Game.state, G.Net.snapshot().peers, G.Game.player && G.Game.player.x])]));

	// ===================== the host leaves: the guest's run ends, rewards saved =====================
	const before = await bob.E(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs, group: G.DB.save.stats.groupRuns || 0, }));
	const rev0 = (row('micasurvivor:bob') || {}).rev || 0;
	console.log('   run times', JSON.stringify(await Promise.all([alice, bob].map(p => p.E(() => [G.Game.st.time, document.visibilityState])))));
	await alice.E(() => { G.Game.player.coins += 50; });   // coins the team picked up (synced to the guests)
	await waitFor(() => bob.E(() => G.Game.player.coins >= 50), 3000);
	// ABRUPT: alice's renderer crashes (no pagehide, no goodbye): the channel goes quiet, then the relay finds no row
	const crash = await alice.page.target().createCDPSession();
	crash.send('Page.crash').catch(() => {});
	A(await waitFor(() => bob.visible('scr-over'), 35000), "alice's browser dies: bob's run ends (the run-over screen)");
	A(await bob.E(() => window.__toasts.some(t => /Lost connection to the host/.test(t))), 'bob is told "Lost connection to the host."', JSON.stringify(await bob.E(() => window.__toasts)));
	await sleep(600);
	await bob.shot('m5b12b_host_lost.png');
	const after = await bob.E(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs, group: G.DB.save.stats.groupRuns || 0, best: G.DB.save.stats.bestGroupTime || 0 }));
	A(after.runs === before.runs + 1 && after.coins > before.coins && after.best > 0, 'bob\'s rewards are saved: +1 run, coins, a best group time', JSON.stringify([before, after]));
	A(await waitFor(() => ((row('micasurvivor:bob') || {}).rev || 0) > rev0 && (row('micasurvivor:bob').save.coins === after.coins), 8000), '...in his Magepunk account too (micasurvivor:bob)', JSON.stringify([rev0, (row('micasurvivor:bob') || {}).rev]));
	A((await spanish(bob, '#scr-over')).length === 0, 'the run-over screen has no Spanish', JSON.stringify(await spanish(bob, '#scr-over')));
	await bob.E(() => document.getElementById('btn-again').click());
	A(await waitFor(() => bob.visible('scr-menu'), 10000), 'bob goes back to the menu (the lobby is gone with its host)');
	A(await bob.E(() => !G.Social.room && !G.Coop.active), '...out of the lobby, no co-op left running');

	// ===================== the relay fallback (no WebRTC) =====================
	const dave = await open('dave', { noRtc: true }), erin = await open('erin', { noRtc: true });
	A(await boot(erin) && await boot(dave), 'dave and erin boot with WebRTC off (test hook: the relay only)');
	await dave.E(() => { window.__rec = true; });
	await erin.E(() => { window.__rec = true; });
	await dave.page.click('#scr-menu [data-go=friends]');
	await waitFor(() => dave.visible('scr-friends'), 5000);
	await waitFor(async () => /erin/.test(await dave.text('#fr-list')), 8000);
	await dave.E(() => { const r = [...document.querySelectorAll('#fr-list .fr-row')].find(x => /erin/.test(x.textContent)); const b = r && [...r.querySelectorAll('button')].find(b => /Invite/.test(b.textContent)); if (b) b.click(); });
	A(await waitFor(() => dave.visible('scr-lobby'), 6000), 'inviting from the friends list opens a lobby');
	A(await waitFor(() => erin.visible('invite-pop'), 8000), 'erin gets the invite');
	const ecdp = await erin.page.target().createCDPSession();
	await ecdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await erin.tap('#inv-yes');
	A(await waitFor(() => erin.visible('scr-lobby'), 6000), 'erin joins by TOUCH (tapping "Join")');
	await ecdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
	A(await waitFor(() => dave.E(() => G.Net.mode('erin') === 'relay'), 8000) && await waitFor(() => erin.E(() => G.Net.mode('dave') === 'relay'), 8000), 'without WebRTC the pair falls back to the relay');
	A(await waitFor(async () => /Connected \(via server\)/.test(await dave.text('#lobby-members')), 5000), 'the lobby says "Connected (via server)"', await dave.text('#lobby-members'));
	// a controller (no sign-in gate for pads; online play only needs the account)
	await erin.E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
	await sleep(1500);
	await erin.press(13); await sleep(150);
	A(await erin.navTo('#lobby-ready'), 'the D-pad reaches "I\'m ready" in the lobby');
	await erin.press(1);   // confirm (Nintendo: right face)
	A(await waitFor(() => dave.E(() => G.Social.room.members.every(m => m.ready) && !document.getElementById('lobby-start').disabled), 8000), 'erin is ready by PAD: the host can start');
	await erin.E(() => { window.__pads[0] = null; });
	A(/through the server/.test(await dave.text('#lobby-note')), 'the host is told someone plays through the server', await dave.text('#lobby-note'));
	await dave.shot('m5b12b_lobby_relay.png');
	await dave.page.click('#lobby-start');
	A(await waitFor(async () => (await Promise.all([dave, erin].map(p => p.E(() => G.Game.state === 'playing' && G.Coop.active)))).every(Boolean), 15000), 'the relay pair starts a run');
	await calm(dave); await calm(erin);
	const w0 = writes.length, t0 = Date.now();
	const e0 = await me(erin);
	await erin.page.keyboard.down('KeyS'); await sleep(900); await erin.page.keyboard.up('KeyS');
	const e1 = await me(erin);
	A(await waitFor(async () => { const s = await seen(dave, 'erin'); return s && Math.abs(s.y - e1.y) < 14 && e1.y - e0.y > 60; }, 6000), 'positions sync over the relay', JSON.stringify([e0, e1, await seen(dave, 'erin')]));
	const rid = await dave.E(() => {
		const ep = G.Coop.mate('erin').pl;
		const d = { dex: 19, name: G.DEX_BY[19].name, behavior: 'melee', hp: 1e7, spd: 0, dmg: 1, xp: 1 };
		const e = new G.Enemy(d, ep.x + 70, ep.y, { hp: 1, spd: 1, dmg: 1 }); e.spd = 0; e.netTest = true; G.EnemyMgr.add(e); return e.id;
	});
	A(await waitFor(() => erin.E(id => !!G.EnemyMgr.get(id), rid), 6000), 'a host enemy reaches erin over the relay');
	await erin.E(id => G.EnemyMgr.get(id).hurt(2e7, '#fff', 1, 0, 0), rid);
	A(await waitFor(() => dave.E(id => { const e = G.EnemyMgr.get(id); return !e || e.dead; }, rid), 6000), 'erin\'s hit kills it on the host over the relay');
	await sleep(3000);
	const span = (Date.now() - t0) / 1000;
	const relayW = writes.slice(w0).filter(w => w.k.startsWith('msurvrelay:')).length;
	const perSec = relayW / span;
	console.log(`   relay: ${relayW} row writes in ${span.toFixed(1)} s = ${perSec.toFixed(2)}/s for 2 players`);
	A(perSec > 1 && perSec <= 2 * 3.3, 'the relay writes at most ~3 rows a second per player (2 players: ≤ 6.6/s)', perSec.toFixed(2));
	A(writes.slice(w0).every(w => !w.k.startsWith('msurvsig:')), 'no signalling writes once the pair is on the relay');
	await dave.shot('m5b12b_relay_run_host.png');
	await erin.shot('m5b12b_relay_run_guest.png');
	// the host quits from the pause menu: the guest's run ends gracefully
	await dave.page.keyboard.press('Escape');
	A(await waitFor(() => dave.visible('scr-pause'), 3000), 'the host opens the pause menu (co-op: the run goes on behind it)');
	await dave.page.click('#btn-quit');
	A(await waitFor(() => erin.visible('scr-over'), 10000), 'the host quits: erin\'s run ends too');
	A(await erin.E(() => window.__toasts.some(t => /The host has ended the game/.test(t))), 'erin is told "The host has ended the game"', JSON.stringify(await erin.E(() => window.__toasts)));
	await sleep(600);
	await erin.shot('m5b12b_host_ended.png');
	await dave.E(() => document.getElementById('btn-again') && document.getElementById('btn-again').click());
	await erin.E(() => document.getElementById('btn-again') && document.getElementById('btn-again').click());
	A(await waitFor(() => dave.visible('scr-lobby'), 8000) && await waitFor(() => erin.visible('scr-lobby'), 8000), 'after the run both are back in the lobby');
	A(await waitFor(() => dave.E(() => G.Social.room.open && !G.Social.room.start), 5000) && await waitFor(async () => /Not ready/.test(await dave.text('#lobby-members')), 6000), 'the host\'s lobby is open again, the guest back to "not ready"');
	A((row('msurvlobby:' + (await dave.E(() => G.Social.room.id))) || {}).open === true, '...on the server too');

	// ===================== a guest (no account) =====================
	const gctx = await browser.createBrowserContext();
	const gp = await gctx.newPage();
	await gp.evaluateOnNewDocument(() => { localStorage.setItem('micasurvivor_lang', 'en'); window.__toasts = []; addEventListener('DOMContentLoaded', () => new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent) window.__toasts.push(t.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true })); });
	await gp.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	const guest = { who: 'guest', page: gp, E: (fn, ...a) => gp.evaluate(fn, ...a) };
	guest.visible = id => guest.E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	guest.click = sel => guest.E(sel => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, sel);
	await waitFor(() => guest.E(() => document.getElementById('boot').classList.contains('hidden')), 30000);
	await sleep(200); if (await guest.visible('tap-start')) await gp.click('#tap-start');
	await waitFor(() => guest.visible('scr-login'), 8000);
	await guest.E(() => { const b = [...document.querySelectorAll('#scr-login button')].find(b => b.offsetParent && /^Play/.test(b.textContent.trim())); if (b) b.click(); });
	await waitFor(() => guest.visible('scr-test'), 8000);
	for (let i = 0; i < 40 && await guest.visible('scr-test'); i++) { await guest.E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(90); }
	await waitFor(() => guest.visible('scr-result'), 8000); await guest.click('#res-ok');
	A(await waitFor(() => guest.visible('scr-menu'), 10000), 'a guest (no Magepunk account) reaches the menu');
	A(/Sign in to play with friends/.test(await guest.E(() => document.getElementById('menu-friends-sub').textContent)), 'the guest\'s Friends item says "Sign in to play with friends"');
	await gp.click('#scr-menu [data-go=friends]');
	await sleep(400);
	A(!(await guest.visible('scr-friends')) && await guest.E(() => window.__toasts.some(t => /Sign in to play with friends/.test(t))), 'clicking it explains instead of opening (friends need an account)');
	A(!actions.some(a => /^msurv-/.test(a.action) && !a.auth), 'a guest makes no co-op request');
	await gctx.close();

	// ===================== no Spanish on any canvas =====================
	for (const p of [bob, dave, erin]) {
		const bad = await p.E(src => [...window.__drawn].filter(s => new RegExp(src, 'i').test(s.replace(/Pok[ée]mon/g, ''))
			&& !G.DEX.some(d => s.includes(d.name))), SPANISH.source);
		A(bad.length === 0, p.who + ': nothing Spanish drawn on the canvas', JSON.stringify(bad.slice(0, 8)));
		const toasts = await p.E(() => window.__toasts);
		A(!toasts.some(t => SPANISH.test(t.replace(/Pok[ée]mon/g, ''))), p.who + ': no Spanish toasts', JSON.stringify(toasts));
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
