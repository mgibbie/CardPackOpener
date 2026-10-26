// micasurvivor_expedition_plumbing_test.mjs — MicaSurvivor DLC D0b: the Expedition plumbing, end to end. The REAL
// server handler (server/mp.mjs bundled like the dev server, over sqlite) behind a static server, headless Chrome, one
// browser context per device. D0b shipped the Expedition modes as "Coming soon"; since D3 Classic is playable (its own
// suite: micasurvivor_expedition_classic_test.mjs) and since D11 Survival (micasurvivor_expedition_survival_test.mjs), so
// here League is the "Coming soon" one, and the content version is DV (2 since D3).
//   1. lazy loading: a base boot (guest and signed in) and a base run never fetch js/expedition/* (the network log) and
//      make no Expedition request; G.Expedition.load() fetches its scripts once, in order (D1: save.js, terrain.js,
//      D2: verbs.js, core.js), and attaches the seams
//   2. the mode select: an "Expedition" group with Classic / Survival / League; League "Coming soon",
//      aria-disabled; reached and pressed by mouse, touch (844x390) and pad (synthetic Gamepad API): each says "coming soon"
//      and starts nothing
//   3. the freeze: before load the base tables are writable; after it every write to G.Moves / G.Items (and its item
//      order) / G.Upgrades / G.Enemies / G.DEX / G.DEX_BY throws and changes nothing; its one-time cost and the sim's
//      per-step cost frozen vs not (two seeded contexts) are measured and printed
//   4. the Expedition save: round trip to micasurvivorexp:<user> (never the base row micasurvivor:<user>), another
//      device's write meanwhile (409 -> merge -> retry: both devices' progress), a lower counter never going back,
//      a guest's progress in localStorage only (no request) carried into the account on the first signed-in open,
//      once
//   5. boards: an Expedition mark lands on runboard:micasurvivor_expedition:<map>:<diff> and never the base board; an
//      Expedition run (turned on for the test) ends without touching the base save or sending a base run-score
//   6. versions: the run carries {mode:'exp-…', dv}; its replay header / meta and live snapshots carry dv (a base run's
//      don't); a replay or live run of a newer dv shows the notice, a base one doesn't; the co-op lobby: an Expedition
//      lobby made by the client carries mode + dv, one of another dv refuses the join ("Your game is out of date:
//      reload."), a mismatched start is refused client-side, a base lobby joins as before
//   7. no Spanish on any of it in English
//   node overworld/tests/micasurvivor_expedition_plumbing_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored micasurvivor/assets and overworld/data.)
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';

const DV = 14;   // G.Expedition.DV (D0b-D2: 1; D3 made Classic playable and bumped it to 2; D4 the League: 3; D5 level-ups and items: 4; D6 Ultimates: 5; D7 economy: 6; D8 captures: 7; D9 tiers: 8; D10 the League meta: 9; D11 Survival and MP: 10; D12 maps 2-3: 11; D13 League mode: 12; D14 Mega Evolution: 13; D15 slots and respawns: 14)
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
const PORT = 8843;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---------- the real handler over sqlite ----------
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
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-exp-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const apiLog = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw); } catch { }
		apiLog.push({ action: b.action, mode: b.mode, auth: req.headers.authorization || '', body: b });
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
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

const tokens = {}, states = {};
const reg = async (n) => { const r = (await call('register', { username: n, password: 'msurv-exp-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await call('state', {}, r.token)).body.state; };
for (const n of ['alice', 'bob', 'carl']) await reg(n);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(Object.values(tokens).every(Boolean), 'test accounts registered (alice and bob are friends)');

// a fixed profile (the D0a one: 5 Pokémon, all upgraded, so a run lasts)
const SAVE = (name) => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' }, 133: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, stats: { runs: 3, bestTime: 60, bestLevel: 5, totalKills: 10, coinsEarned: 0 },
	pupg: Object.fromEntries([1, 4, 7, 25, 133].map(d => [d, { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 }])),
});
// before any page script: the synthetic Gamepad API, the profile (a guest or a Magepunk user), optionally a seeded
// Math.random + a freezable requestAnimationFrame (the perf measure)
const BEFORE = (o) => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	if (o.seed) {
		let a = o.seed >>> 0;
		Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
		const realRaf = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = cb => realRaf(ts => { if (!window.__frozen) cb(ts); });
	}
	if (sessionStorage.getItem('seeded')) return;
	sessionStorage.setItem('seeded', '1');
	if (o.guestSave) {
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.guestSave));
	}
	if (o.user) {
		localStorage.setItem('magepunk_mp_token_v1', o.token);
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
		localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
		localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));   // (no base carry-over offer)
	}
};

// Spanish left on an English screen (Pokémon names taken out first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|tipo|modo|monedas|partida|elige|hoy|récord|aún|jefes|sin|vida|enemigos|próximamente|expedición|clásico|supervivencia|liga|recarga|versión|página|repetición|juego)\b/i;
const EXP_URL = /\/micasurvivor\/js\/expedition\//;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const device = async (o, vp = { width: 1280, height: 720 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ deviceScaleFactor: 1, ...vp });
		const urls = [];
		page.on('request', r => urls.push(r.url()));
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|400)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument(BEFORE, o);
		const E = (fn, ...a) => page.evaluate(fn, ...a);
		const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => E(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
			await sleep(300);
			if (await visible('tap-start')) await page.click('#tap-start');
			return waitFor(() => visible('scr-menu'), 15000);
		};
		const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
		const navTo = async (sel) => {
			for (let i = 0; i < 80; i++) {
				const d = await E(sel => {
					const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
					if (!f || !t) return 'missing';
					if (f === t || f.contains(t) || t.contains(f)) return 'here';
					const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
					const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
					return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
				}, sel);
				if (d === 'here') return true;
				if (d === 'missing') return false;
				await press(d);
			}
			return false;
		};
		const spanish = sel => E((sel, src) => {
			const els = [...document.querySelectorAll(sel)];
			if (!els.length) return ['missing ' + sel];
			const re = new RegExp(src, 'gi');
			const bad = [];
			for (const el of els) {
				let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon');
				for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
				bad.push(...(txt.match(re) || []));
			}
			return bad;
		}, sel, SPANISH.source);
		const toast = () => E(() => { const t = document.querySelector('.toast'); return t && t.style.display !== 'none' ? t.innerText : ''; });
		const expFetches = () => urls.filter(u => EXP_URL.test(u));
		return { ctx, page, urls, E, visible, boot, press, navTo, spanish, toast, expFetches };
	};

	// ================= 1-3. a guest: lazy loading, the mode select, the freeze =================
	{
		const a0 = apiLog.length;
		const d = await device({ guestSave: SAVE('Trainer') }, { width: 844, height: 390, hasTouch: true });
		A(await d.boot(), 'a guest boots to the menu (844x390, touch)');
		const st = await d.E(() => ({ X: typeof G.Expedition, loaded: G.Expedition.loaded, frozen: G.Expedition.frozen, exp: typeof G.Exp, save: typeof G.ExpSave,
			seams: G.Hooks.SEAMS.map(s => G.Hooks.count(s)), modes: G.Expedition.MODES, on: G.Expedition.MODES.filter(G.Expedition.enabled), dv: G.Expedition.DV,
			movesFrozen: Object.isFrozen(G.Moves), scripts: document.querySelectorAll('script[data-expedition]').length }));
		A(st.X === 'object' && !st.loaded && st.frozen === null && st.exp === 'undefined' && st.save === 'undefined' && st.scripts === 0 && !st.movesFrozen,
			'base boot: the registry is there (G.Expedition) but no Expedition code ran: no G.Exp / G.ExpSave, nothing frozen', JSON.stringify(st));
		A(st.seams.length >= 4 && st.seams.every(n => n === 0), 'base boot: no listener on any seam (run.start, run.end, replay.header, spectate.snap; D1: net.frame)', st.seams.join(','));
		A(JSON.stringify(st.modes) === '["exp-classic","exp-survival","exp-league"]' && JSON.stringify(st.on) === '["exp-classic","exp-survival","exp-league"]' && st.dv === DV, 'the registry: Classic / Survival / League, Classic (D3), Survival (D11) and League (D13) enabled, content version ' + DV, JSON.stringify(st));
		// (DLC D13: every Expedition mode is playable now. This page turns League off again, so the "Coming soon" gate below, which a
		//  future mode will use, is still tested: the card, the pad, G.Flow.play and the network log)
		await d.E(() => { G.Expedition.ENABLED.delete('exp-league'); });
		A(d.expFetches().length === 0, 'the network log: a base boot fetches nothing from js/expedition/', d.expFetches().join(' '));
		// a base run: still nothing, and its run / replay / snapshot carry no dv
		const base = await d.E(async () => {
			G.Flow.play('normal');
			const run = { mode: G.Modes.mode, dv: G.Modes.dv, hasDv: 'dv' in G.Modes.run };
			G.Game.debugStep(240, 1 / 60);
			const snap = G.Spectate.snap();
			G.Game.quit();
			const e = G.Replay.last;
			await e.ready;
			const h = JSON.parse(await G.Replay.unpack(e.code)).h;
			const out = { run, snapDv: 'dv' in snap, snapM: snap.m, hDv: 'dv' in h, hMap: 'map' in h, hM: h.m, metaDv: 'dv' in e.meta };
			G.Flow.goMenu();
			return out;
		});
		A(base.run.mode === 'normal' && base.run.dv === null && !base.run.hasDv, 'a base run carries no dv', JSON.stringify(base.run));
		A(!base.snapDv && base.snapM === 'normal' && !base.hDv && !base.hMap && base.hM === 'normal' && !base.metaDv, "a base run's snapshot, replay header and meta are unchanged (no dv / map)", JSON.stringify(base));
		A(d.expFetches().length === 0 && !(await d.E(() => typeof G.Exp !== 'undefined')), 'the network log: a base run fetches nothing from js/expedition/ either');

		// the mode select: the Expedition group
		await d.page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => d.visible('scr-modes'), 3000), 'the menu opens "Choose a mode"');
		await sleep(250);
		const ui = await d.E(() => ({
			h: document.getElementById('modes-exp-h').innerText,
			cards: [...document.querySelectorAll('#modes-exp [data-exp]')].map(b => ({ id: b.dataset.exp, soon: b.classList.contains('soon'), aria: b.getAttribute('aria-disabled'), disabled: b.disabled, txt: b.innerText.replace(/\s+/g, ' ').trim() })),
			after: !!document.querySelector('#modes-list ~ #modes-exp-h ~ #modes-exp ~ .modes-h ~ #modes-mods'),
		}));
		A(ui.cards.map(c => c.id).join(',') === 'exp-classic,exp-survival,exp-league' && ui.after, 'the Expedition group: Classic, Survival, League, between the base modes and the modifiers', JSON.stringify(ui.cards.map(c => c.id)));
		A(ui.cards.slice(2).every(c => c.soon && c.aria === 'true' && !c.disabled) && ui.cards.slice(0, 2).every(c => !c.soon && c.aria !== 'true'), 'League is "Coming soon": aria-disabled, not [disabled] (so the pad still reaches it); Classic and Survival are playable', JSON.stringify(ui.cards));
		A(/^Expedition$/.test(ui.h) && /^Expedition · Classic /.test(ui.cards[0].txt) && !/Coming soon/.test(ui.cards[0].txt) && /^Expedition · League .*Coming soon$/.test(ui.cards[2].txt), 'in English: "Expedition", "Expedition · League … Coming soon"', JSON.stringify([ui.h, ui.cards[0].txt, ui.cards[2].txt]));
		const sp = await d.spanish('#modes-exp-h, #modes-exp');
		A(!sp.length, 'no Spanish on the Expedition group', sp.join(', '));
		// mouse
		await d.page.click('#modes-exp [data-exp=exp-league]');
		await sleep(200);
		let t = await d.toast();
		A(t === 'Expedition is coming soon.' && await d.visible('scr-modes') && await d.E(() => G.Game.state === 'ui'), 'mouse: clicking League says "Expedition is coming soon." and starts nothing', t);
		// touch
		await d.page.tap('#modes-exp [data-exp=exp-league]');
		await sleep(200);
		t = await d.toast();
		A(t === 'Expedition is coming soon.' && await d.E(() => G.Game.state === 'ui'), 'touch: tapping League says so too', t);
		// G.Flow.play directly: still nothing (the gate is in the flow, not only the screen)
		const fp = await d.E(async () => { const r = await G.Flow.play('exp-league'); return { r, st: G.Game.state, mode: G.Modes.plan('exp-league').mode }; });
		A(fp.r === false && fp.st === 'ui' && fp.mode === 'normal', 'G.Flow.play of a disabled Expedition mode resolves false and starts nothing (and plan() falls back to normal)', JSON.stringify(fp));
		// pad
		await d.E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await d.press(13); await sleep(150);
		A(await d.navTo('#modes-exp [data-exp=exp-league]'), 'pad: the D-pad reaches League in the Expedition group');
		await d.E(() => { const t = document.querySelector('.toast'); if (t) t.style.display = 'none'; });
		await d.press(1);   // (Nintendo layout: the right face button confirms)
		await sleep(200);
		t = await d.toast();
		A(t === 'Expedition is coming soon.' && await d.visible('scr-modes') && await d.E(() => G.Game.state === 'ui'), 'pad: confirm on it says "coming soon" and stays on the screen', t);
		await d.press(0);
		A(await waitFor(() => d.visible('scr-menu'), 2000), 'pad: cancel goes back to the menu');
		await d.E(() => { window.__pads[0] = null; });
		A(d.expFetches().length === 0, 'the network log: pressing the "Coming soon" cards fetches no Expedition code');

		// the freeze, and the loader
		const pre = await d.E(() => { 'use strict'; const o = G.Moves.BY_ID[Object.keys(G.Moves.BY_ID)[0]]; const v = o.dmg; o.dmg = v; return { writable: !Object.isFrozen(o) }; });
		A(pre.writable, 'before the Expedition loads, the base tables are writable (nothing frozen in a base page)');
		const ld = await d.E(async () => {
			const t0 = performance.now();
			const [a, b] = await Promise.all([G.Expedition.load(), G.Expedition.load()]);
			return { a, b, ms: Math.round(performance.now() - t0), loaded: G.Expedition.loaded, frozen: G.Expedition.frozen, init: G.Exp.inited, dv: G.Exp.dv,
				seams: G.Hooks.SEAMS.map(s => G.Hooks.count(s)), scripts: [...document.querySelectorAll('script[data-expedition]')].map(s => s.getAttribute('src')), who: G.ExpSave.who };
		});
		A(ld.a === true && ld.b === true && ld.loaded && ld.init && ld.dv === DV, 'G.Expedition.load(): resolves true (twice at once: one load), G.Exp at dv ' + DV + ', initialised', JSON.stringify(ld));
		const SCR = ['js/expedition/save.js', 'js/expedition/terrain.js', 'js/expedition/verbs.js', 'js/expedition/classic.js', 'js/expedition/league-data.js', 'js/expedition/league.js', 'js/expedition/mega-data.js', 'js/expedition/mega.js', 'js/expedition/moves.js', 'js/expedition/items.js', 'js/expedition/levelups.js', 'js/expedition/ultimates.js', 'js/expedition/economy.js', 'js/expedition/reactions.js', 'js/expedition/capture.js', 'js/expedition/tiers.js', 'js/expedition/meta.js', 'js/expedition/survival.js', 'js/expedition/core.js'];   // (D1 added terrain.js, D2 verbs.js, D3 classic.js, D4 league-data.js + league.js, D5 moves.js + items.js + levelups.js, D6 ultimates.js, D7 economy.js, D8 reactions.js + capture.js, D9 tiers.js)
		A(JSON.stringify(ld.scripts) === JSON.stringify(SCR) && d.expFetches().length === SCR.length && SCR.every((s, i) => d.expFetches()[i].endsWith(s)),
			'the network log: exactly js/expedition/save.js, terrain.js, verbs.js, classic.js, league-data.js, league.js, mega-data.js, mega.js (D14), moves.js, items.js, levelups.js, ultimates.js, economy.js, reactions.js, capture.js, tiers.js, meta.js, survival.js (D11) then core.js, once', d.expFetches().join(' '));
		A(ld.seams.length >= 4 && ld.seams.every(n => n === 1), 'the Expedition attaches to every seam once', ld.seams.join(','));
		console.log(`     freeze: ${ld.frozen.objects} objects in ${ld.frozen.ms} ms (load ${ld.ms} ms)`);
		A(ld.frozen.objects > 1000 && ld.frozen.ms < 200, `the freeze is a one-time cost (${ld.frozen.objects} objects, ${ld.frozen.ms} ms)`);
		const fz = await d.E(() => {
			'use strict';
			const tries = {
				'G.Moves.BY_ID[id].dmg': () => { const o = G.Moves.BY_ID[Object.keys(G.Moves.BY_ID)[0]]; o.dmg = 9999; },
				'G.Moves.newField': () => { G.Moves.extra = 1; },
				'G.Items.LIST.push (the item order)': () => { G.Items.LIST.push({ id: 'x' }); },
				'G.Items.LIST reorder': () => { G.Items.LIST.reverse(); },
				'G.Items.BY[id] = ...': () => { G.Items.BY.newItem = {}; },
				'G.Items.BY[id].name': () => { G.Items.BY[Object.keys(G.Items.BY)[0]].name = 'x'; },
				'G.Upgrades.LIST[0].max': () => { G.Upgrades.LIST[0].max = 99; },
				'G.Upgrades.BY delete': () => { delete G.Upgrades.BY[Object.keys(G.Upgrades.BY)[0]]; },
				'G.Enemies.TIERS[0]': () => { const k = Object.keys(G.Enemies).find(k => Array.isArray(G.Enemies[k]) && G.Enemies[k].length); G.Enemies[k][0] = null; },
				'G.Enemies.newField': () => { G.Enemies.extra = 1; },
				'G.DEX.push': () => { G.DEX.push({ dex: 9999 }); },
				'G.DEX[0].name': () => { G.DEX[0].name = 'x'; },
				'G.DEX_BY[25].types.push': () => { G.DEX_BY[25].types.push('fire'); },
				'G.DEX_BY[9999] = ...': () => { G.DEX_BY[9999] = {}; },
			};
			const out = {};
			for (const [k, fn] of Object.entries(tries)) { try { fn(); out[k] = 'no throw'; } catch (e) { out[k] = e instanceof TypeError ? 'TypeError' : String(e); } }
			return { out, same: G.Items.LIST.length, dex: G.DEX.length, name: G.DEX[0].name, t25: G.DEX_BY[25].types.join('/'), extra: G.Moves.extra };
		});
		const notThrown = Object.entries(fz.out).filter(([, v]) => v !== 'TypeError').map(([k]) => k);
		A(!notThrown.length, `after the load, every write to a base table throws (${Object.keys(fz.out).length} kinds: moves, items and their order, upgrades, enemies, the Pokédex)`, notThrown.join(', '));
		A(fz.dex === 1025 && fz.name === 'Bulbasaur' && fz.t25 === 'electric' && fz.extra === undefined, '...and none of them changed anything', JSON.stringify(fz));
		await d.ctx.close();
		const guestApi = apiLog.slice(a0).filter(e => /exp/.test(e.action || ''));
		A(guestApi.length === 0, 'a guest makes no Expedition request (its Expedition save is local only)', JSON.stringify(guestApi.map(e => e.action)));
	}

	// ================= 3b. the freeze's cost on the sim: the same seeded run, frozen vs not =================
	{
		const measure = async (frozen) => {
			const d = await device({ guestSave: SAVE('Trainer'), seed: 0x5eed }, { width: 1280, height: 720 });
			await d.boot();
			if (frozen) await d.E(() => G.Expedition.load());
			const r = await d.E(() => {
				G.Audio.sfx = () => {}; G.Audio.music = () => {};
				window.__frozen = true;
				G.Flow.play('normal');
				const out = [];
				for (let k = 0; k < 4; k++) { const t0 = performance.now(); G.Game.debugStep(600, 1 / 60); out.push(performance.now() - t0); if (G.Game.state === 'over') break; }
				const reads = (() => { const t0 = performance.now(); let s = 0; const ids = Object.keys(G.Moves.BY_ID); for (let i = 0; i < 2e6; i++) { const m = G.Moves.BY_ID[ids[i % ids.length]]; s += (m.dmg || 0) + G.DEX[i % 1000].dex; } return [performance.now() - t0, s]; })();
				return { steps: out, total: out.reduce((a, b) => a + b, 0), n: out.length * 600, reads: reads[0], frozenNow: Object.isFrozen(G.Moves) };
			});
			await d.ctx.close();
			return r;
		};
		const u1 = await measure(false), f1 = await measure(true), u2 = await measure(false), f2 = await measure(true);
		const per = r => r.total / r.n * 1000;
		const U = Math.min(per(u1), per(u2)), F = Math.min(per(f1), per(f2));
		const RU = Math.min(u1.reads, u2.reads), RF = Math.min(f1.reads, f2.reads);
		console.log(`     sim cost: ${U.toFixed(1)} ms / 1000 steps unfrozen vs ${F.toFixed(1)} frozen (x${(F / U).toFixed(2)}); 2M table reads ${RU.toFixed(1)} vs ${RF.toFixed(1)} ms (x${(RF / RU).toFixed(2)})`);
		A(!u1.frozenNow && !u2.frozenNow && f1.frozenNow && f2.frozenNow, 'perf: the same seeded run, unfrozen (a base page) and frozen (the Expedition loaded)', JSON.stringify([u1.n, f1.n]));
		A(F / U < 1.5 && RF / RU < 1.5, `perf: frozen tables cost no measurable sim time (x${(F / U).toFixed(2)} per step, x${(RF / RU).toFixed(2)} per read; noise allowed to 1.5)`);
	}

	// ================= 4-6. signed in: the Expedition save, the boards, the version fields =================
	{
		const a0 = apiLog.length;
		const d = await device({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
		A(await d.boot(), 'alice (signed in) boots to the menu');
		await waitFor(() => d.E(() => G.DB.syncState === 'ok'), 15000);
		const bootExp = apiLog.slice(a0).filter(e => /exp/.test(e.action || '') || e.mode === 'micasurvivor_expedition');
		A(bootExp.length === 0 && d.expFetches().length === 0, 'signed in, a base boot makes no Expedition request and fetches no Expedition code', JSON.stringify(bootExp.map(e => e.action)));
		const baseRow0 = JSON.stringify(row('micasurvivor:alice'));
		const p0 = apiLog.length;
		const op = await d.E(async () => { await G.Expedition.load(); await G.ExpSave.open(); return { who: G.ExpSave.who, rev: G.ExpSave.rev, data: G.ExpSave.data }; });
		A(op.who === 'mp:alice' && op.rev === 1 && row('micasurvivorexp:alice') && row('micasurvivorexp:alice').rev === 1, 'the Expedition save opens as alice: get, then a first put (rev 1) of the empty save', JSON.stringify(op));
		const r1 = await d.E(async () => { const S = G.ExpSave; S.bump('runs', 3); S.add('league', 25); S.add('league', '1'); S.best('lab.hp', 2); S.commit(); return S.flush(); });
		const xr = row('micasurvivorexp:alice');
		A(r1.ok && xr.rev === 2 && xr.save.counters.runs === 3 && xr.save.counters['lab.hp'] === 2 && JSON.stringify(xr.save.sets.league) === '["25","1"]', 'round trip: counters and sets reach micasurvivorexp:alice (rev 2)', JSON.stringify(xr));
		A(JSON.stringify(row('micasurvivor:alice')) === baseRow0, 'the base row micasurvivor:alice is untouched by the Expedition save');
		const expActs = [...new Set(apiLog.slice(p0).map(e => e.action))];
		A(expActs.every(a => /^micasurvivor-exp-save-(get|put)$/.test(a)), 'and the only requests were micasurvivor-exp-save-get / -put', expActs.join(','));
		const ls = await d.E(() => ({ save: JSON.parse(localStorage.getItem('micasurvivorexp_save.mp:alice')), rev: JSON.parse(localStorage.getItem('micasurvivorexp_rev.mp:alice')) }));
		A(ls.save && ls.save.counters.runs === 3 && ls.rev === 2, 'this browser keeps a copy (micasurvivorexp_save.mp:alice + its rev)', JSON.stringify(ls));
		// another device writes meanwhile: the next put is stale (409), merges, retries
		const other = await call('micasurvivor-exp-save-put', { save: { v: 1, counters: { runs: 10, kills: 40 }, sets: { league: ['7'] } }, rev: 2 }, tokens.alice);
		A(other.status === 200 && other.body.rev === 3, 'another device saves on rev 2 (now rev 3)');
		const n409 = apiLog.length;
		const r2 = await d.E(async () => { const S = G.ExpSave; S.bump('runs'); S.best('lab.atk', 1); S.commit(); const r = await S.flush(); return { r, data: S.data, rev: S.rev }; });
		const xr2 = row('micasurvivorexp:alice').save;
		const puts = apiLog.slice(n409).filter(e => e.action === 'micasurvivor-exp-save-put').length;
		A(r2.r.ok && puts === 2 && r2.rev === 4 && row('micasurvivorexp:alice').rev === 4, 'the stale put got 409, merged and retried (2 puts, rev 4)', JSON.stringify({ puts, rev: r2.rev }));
		A(xr2.counters.runs === 10 && xr2.counters.kills === 40 && xr2.counters['lab.hp'] === 2 && xr2.counters['lab.atk'] === 1 && JSON.stringify(xr2.sets.league) === '["25","1","7"]',
			"409 merge: both devices' progress is kept (max per counter: runs 10 not 4; union of the sets)", JSON.stringify(xr2));
		const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
		A(canon(r2.data) === canon(xr2), 'and this device adopted the merged save', canon(r2.data) + ' vs ' + canon(xr2));
		// a lower counter never goes back, whoever sends it
		const back = await d.E(async () => (await G.MicaAccount.call('micasurvivor-exp-save-put', { save: { v: 1, counters: { runs: 1 }, sets: { league: [] } }, rev: G.ExpSave.rev })).body);
		A(back.ok && row('micasurvivorexp:alice').save.counters.runs === 10 && row('micasurvivorexp:alice').save.sets.league.length === 3, 'a put with runs 1 and an empty League on the current rev takes nothing away', JSON.stringify(row('micasurvivorexp:alice').save));
		A(JSON.stringify(row('micasurvivor:alice')) === baseRow0, 'the base row is still untouched');

		// the boards: an Expedition mark goes to its own board, never the base one
		const bb0 = JSON.stringify(row('runboard:micasurvivor'));
		const sc = await d.E(() => G.Exp.submitScore({ mode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal', time: 321, kills: 50, level: 12, dex: 4 }));
		A(sc.ok && sc.rank === 1 && sc.board === 'micasurvivor_expedition:viridian:normal' && row('runboard:micasurvivor_expedition:viridian:normal')[0].name === 'alice', 'G.Exp.submitScore: the mark lands on runboard:micasurvivor_expedition:viridian:normal', JSON.stringify(sc));
		const lb = await d.E(() => G.Exp.leaderboard('viridian', 'normal'));
		A(lb.top.length === 1 && lb.you && lb.you.rank === 1 && lb.you.score === 321, 'G.Exp.leaderboard(map, diff): the top + your rank', JSON.stringify(lb));
		const forged = await d.E(() => G.MicaAccount.call('run-score', { mode: 'micasurvivor', time: 321, kills: 50, level: 12, dex: 4, expMode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal' }));
		A(forged.status === 400 && JSON.stringify(row('runboard:micasurvivor')) === bb0, 'an Expedition score sent to the base board is refused (400): the base board is untouched', JSON.stringify(forged));

		// an Expedition run (turned on for the test): {mode, dv}, its snapshots / replay carry dv, nothing reaches the base save or board
		const s0 = await d.E(() => JSON.stringify(G.DB.save));
		const nRun = apiLog.length;
		const xr0 = JSON.stringify(row('micasurvivor:alice'));
		const run = await d.E(async () => {
			G.Audio.sfx = () => {};
			G.Expedition.debugEnable('exp-classic');
			const ok = await G.Flow.play('exp-classic');
			const R = Object.assign({}, G.Modes.run);
			G.Game.debugStep(300, 1 / 60);
			const snap = G.Spectate.snap();
			window.__lastSnap = JSON.parse(JSON.stringify(snap));
			const title = G.Modes.title();
			G.Game.quit();
			await sleep(100);
			const over = document.getElementById('scr-over').innerText;
			const e = G.Replay.last;
			await e.ready;
			const h = JSON.parse(await G.Replay.unpack(e.code)).h;
			const out = { ok, R, snap: { m: snap.m, dv: snap.dv }, title, over, h: { m: h.m, dv: h.dv, map: h.map, diff: h.diff }, meta: e.meta, rid: e.rid, runs: G.ExpSave.get('runs'), runsC: G.ExpSave.get('runs.exp-classic'), best: G.ExpSave.get('best.time.viridian.normal'), code: e.code };
			function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
			return out;
		});
		A(run.ok === true && run.R.mode === 'exp-classic' && run.R.dv === DV && run.R.map === 'viridian' && run.R.diff === 'normal' && run.R.mods.length === 0, 'an Expedition run carries {mode: "exp-classic", dv: ' + DV + '} (+ map, difficulty, no modifiers)', JSON.stringify(run.R));
		A(run.snap.m === 'exp-classic' && run.snap.dv === DV, 'its live / replay snapshots carry mode + dv', JSON.stringify(run.snap));
		A(run.h.m === 'exp-classic' && run.h.dv === DV && run.h.map === 'viridian' && run.h.diff === 'normal' && run.meta.dv === DV && run.meta.mode === 'exp-classic', 'its replay header and meta carry mode + dv (+ map, difficulty)', JSON.stringify([run.h, run.meta]));
		A(run.runs === 11 && run.runsC === 1, 'the run.end seam recorded it in the Expedition save (runs, runs per mode)', JSON.stringify([run.runs, run.runsC]));
		A(/Expedition · Classic/.test(run.over) && run.title === 'Expedición · Clásico', 'its run-over screen names the mode (in English)', run.over.slice(0, 120));
		const sOver = await d.spanish('#scr-over');
		A(!sOver.length, 'no Spanish on its run-over screen', sOver.join(', '));
		const s1 = await d.E(() => JSON.stringify(G.DB.save));
		{   // (D11, owner decision #4: an Expedition run pays the base Pokémonedas; nothing else in the base save changes)
			const strip = t => { const o = JSON.parse(t); const c = [o.coins, (o.stats && o.stats.coinsEarned) || 0]; delete o.coins; delete o.updated; delete o.led; if (o.stats) delete o.stats.coinsEarned; return [JSON.stringify(o), c]; };
			const [a, ca] = strip(s0), [b, cb] = strip(s1);
			A(a === b && cb[0] - ca[0] === cb[1] - ca[1] && cb[0] >= ca[0], 'the base save is unchanged by the Expedition run but its Pokémonedas (D11: the pay, counted as earned; no stats, missions): +' + (cb[0] - ca[0]), a.length + ' vs ' + b.length);
		}
		await sleep(2500);
		const runActs = apiLog.slice(nRun).map(e => e.action + (e.mode ? ':' + e.mode : ''));
		A(!runActs.includes('run-score:micasurvivor') && !runActs.includes('micasurvivor-save-put') && JSON.stringify(row('micasurvivor:alice')) === xr0, 'nor the base board or the base row: no base run-score, no base save put', runActs.join(','));
		// sharing it: the server's meta keeps mode + dv
		const shared = await d.E(rid => G.Replay.share(rid), run.rid);
		const sm = shared.id && row('msurvreplay:' + shared.id).meta;
		A(shared.ok && sm && sm.mode === 'exp-classic' && sm.dv === DV && sm.map === 'viridian', 'the shared replay row keeps mode + dv + map', JSON.stringify(sm));

		// replays and live runs of a newer dv: a notice; a known one and a base one: none
		const notes = await d.E(async (code, DV) => {
			const t = JSON.parse(await G.Replay.unpack(code));
			const view = async (mut) => {
				const d2 = JSON.parse(JSON.stringify(t)); mut(d2.h);
				const rd = await G.Replay.open(await G.Replay.pack(JSON.stringify(d2)));
				G.WatchUI.playReplay(rd, {});
				const n = G.WatchUI.notice;
				await new Promise(r => setTimeout(r, 60));   // (the translation of new DOM text runs from a MutationObserver)
				const toast = (document.querySelector('.toast') || {}).innerText || '';
				G.WatchUI.leave();
				const tt = document.querySelector('.toast'); if (tt) tt.style.display = 'none';
				return { n, toast };
			};
			const out = {
				same: await view(() => {}),
				newer: await view(h => { h.dv = DV + 1; }),
				noDv: await view(h => { delete h.dv; }),
				unknownMode: await view(h => { h.m = 'exp-future'; }),
				base: await view(h => { h.m = 'normal'; delete h.dv; delete h.map; delete h.diff; }),
			};
			// live: a friend's snapshot of a newer dv
			const real = G.Spectate.watch;
			G.Spectate.watch = (u, cb) => { cb.snapshot(Object.assign(JSON.parse(JSON.stringify(window.__lastSnap || {})), { m: 'exp-classic', dv: DV + 1 }), {}); };
			try { G.WatchUI.watchLive('bob'); await new Promise(r => setTimeout(r, 60)); out.live = { n: G.WatchUI.notice, toast: (document.querySelector('.toast') || {}).innerText || '' }; } catch (e) { out.live = { err: String(e) }; }
			G.Spectate.watch = real;
			try { G.WatchUI.leave(); } catch (e) { /* fine */ }
			return out;
		}, run.code, DV);
		A(!notes.same.n && !notes.base.n, 'a replay of a known dv (' + DV + ') or a base replay: no notice', JSON.stringify([notes.same, notes.base]));
		A(notes.newer.n && notes.newer.toast === 'This replay is from a newer version of Expedition: reload the page to watch it properly.', 'a replay of a NEWER dv (' + (DV + 1) + ') plays with the notice (in English)', JSON.stringify(notes.newer));
		A(notes.noDv.n && notes.unknownMode.n, 'an Expedition replay with no dv, or of a mode this build lacks: the notice too', JSON.stringify([notes.noDv.n, notes.unknownMode.n]));
		A(notes.live && notes.live.n && notes.live.toast === 'This run is from a newer version of Expedition: reload the page to watch it properly.', 'a live run of a newer dv: the notice (in English)', JSON.stringify(notes.live));

		// the co-op lobby: mode + dv, the join gate, the start gate
		await d.E(() => G.Social.start());
		const lx2 = await call('msurv-lobby-create', { dex: 25, mode: 'exp-classic', dv: DV + 1 }, tokens.bob);
		const j2 = await d.E(async id => { const r = await G.Social.joinRoom(id); return { ok: r.ok, err: r.error, en: G.T(r.error || ''), room: !!G.Social.room }; }, lx2.body.lobby.id);
		A(!j2.ok && !j2.room && j2.en === 'Your game is out of date: reload.', 'joining an Expedition lobby of another dv (' + (DV + 1) + ') is refused: "Your game is out of date: reload."', JSON.stringify(j2));
		A(row('msurvlobby:' + lx2.body.lobby.id).members.length === 1, '...and alice is not in it');
		await call('msurv-lobby-leave', { id: lx2.body.lobby.id }, tokens.bob);
		const lx1 = await call('msurv-lobby-create', { dex: 25, mode: 'exp-classic', dv: DV }, tokens.bob);
		const j1 = await d.E(async id => { const r = await G.Social.joinRoom(id); const R = G.Social.room; return { ok: r.ok, mode: R && R.mode, dv: R && R.dv }; }, lx1.body.lobby.id);
		A(j1.ok && j1.mode === 'exp-classic' && j1.dv === DV, 'the same dv joins: the room carries mode + dv', JSON.stringify(j1));
		const sg = await d.E(async (DV) => {
			const room = G.Social.room;
			G.Flow.startCoop({ k: 'start', seed: 5, at: 1, host: room.host, members: [{ uid: 'bob' }, { uid: 'alice' }], mode: 'exp-classic', dv: DV + 1 });
			await new Promise(r => setTimeout(r, 300));
			return { st: G.Game.state, toast: (document.querySelector('.toast') || {}).innerText || '', room: !!G.Social.room };
		}, DV);
		A(sg.st === 'ui' && sg.toast === 'Your game is out of date: reload.' && !sg.room, 'a start of another dv is refused client-side (the toast, out of the lobby, no run)', JSON.stringify(sg));
		await call('msurv-lobby-leave', { id: lx1.body.lobby.id }, tokens.bob);
		const mine = await d.E(async () => { const r = await G.Social.createRoom({ mode: 'exp-classic' }); const out = { id: r && r.id, mode: r && r.mode, dv: r && r.dv }; await G.Social.leaveRoom(); return out; });
		A(mine.mode === 'exp-classic' && mine.dv === DV, 'G.Social.createRoom({mode}) makes an Expedition lobby with this build\'s dv', JSON.stringify(mine));
		const lb0 = await call('msurv-lobby-create', { dex: 25 }, tokens.bob);
		const jb = await d.E(async id => { const r = await G.Social.joinRoom(id); const R = G.Social.room; const out = { ok: r.ok, mode: R && R.mode, dv: R && R.dv }; await G.Social.leaveRoom(); return out; }, lb0.body.lobby.id);
		A(jb.ok && jb.mode === null && jb.dv === null, 'a base lobby joins as before (no mode / dv)', JSON.stringify(jb));
		await call('msurv-lobby-leave', { id: lb0.body.lobby.id }, tokens.bob);
		await d.ctx.close();
	}

	// ================= 4b. a guest's Expedition progress carried into the account on the first signed-in open =================
	{
		const d = await device({ guestSave: SAVE('Trainer') });
		await d.boot();
		const a0 = apiLog.length;
		const g = await d.E(async () => { await G.Expedition.load(); await G.ExpSave.open(); const S = G.ExpSave; S.bump('runs', 2); S.add('league', 133); S.best('lab.hp', 4); S.commit(); return { who: S.who, ls: JSON.parse(localStorage.getItem('micasurvivorexp_save.guest')) }; });
		await sleep(2500);
		A(g.who === 'guest' && g.ls && g.ls.counters.runs === 2 && JSON.stringify(g.ls.sets.league) === '["133"]', 'a guest keeps its Expedition progress in localStorage (micasurvivorexp_save.guest)', JSON.stringify(g));
		A(apiLog.slice(a0).length === 0, '...with no request at all');
		// the guest signs in (carl): the next Expedition open carries it over, once
		await d.E((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: 'carl', at: 1, choice: 'skip' })); }, tokens.carl, states.carl);
		await d.page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => d.E(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		const c = await d.E(async () => { await G.Expedition.load(); await G.ExpSave.open(); return { who: G.ExpSave.who, carried: G.ExpSave.carried, mig: JSON.parse(localStorage.getItem('micasurvivorexp_migrated.guest')), guest: !!localStorage.getItem('micasurvivorexp_save.guest') }; });
		const cr = row('micasurvivorexp:carl');
		A(c.who === 'mp:carl' && c.carried && cr && cr.save.counters.runs === 2 && cr.save.counters['lab.hp'] === 4 && JSON.stringify(cr.save.sets.league) === '["133"]', "signed in, the guest's Expedition progress is carried into micasurvivorexp:carl", JSON.stringify([c, cr]));
		A(c.mig && c.mig.to === 'carl' && c.guest, 'it is remembered (micasurvivorexp_migrated.guest) and the guest copy kept', JSON.stringify(c.mig));
		await d.page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => d.E(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		const c2 = await d.E(async () => { await G.Expedition.load(); await G.ExpSave.open(); return G.ExpSave.carried; });
		A(c2 === false && row('micasurvivorexp:carl').save.counters.runs === 2, 'the next open does not carry it again');
		A(!row('micasurvivor:carl') || !row('micasurvivor:carl').save.expedition, 'nothing Expedition went into the base row micasurvivor:carl');
		await d.ctx.close();
	}

	const pageErrs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
	A(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
