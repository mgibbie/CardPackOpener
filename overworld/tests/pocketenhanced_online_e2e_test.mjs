// pocketenhanced_online_e2e_test.mjs — two people and a computer player play Pocket Enhanced online, end to end: the
// REAL server handler (server/mp.mjs + server/pocket_pvp.mjs, bundled like the dev server, over sqlite) behind a
// static server, and two headless browsers on /pocketenhanced/.
//   ann hosts from the page's own menus (Play online -> Host a match) and reads the code off her screen;
//   ben joins with that code through the on-screen keyboard, readies up; ann starts.
// Asserts each page holds only its own hand (no engine state at all), both tables agree on everything public after
// every turn, a turn is taken through the page's own buttons and Execute, an action out of turn is refused by the
// server, a reload drops the player back into the match, the match plays to its end on both screens with its replay
// kept, and a guest is told to sign in.
//   node overworld/tests/pocketenhanced_online_e2e_test.mjs      (screenshots: POCKET_SHOTS=<dir>)
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as E from '../../pocketenhanced/js/engine/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.POCKET_SHOTS || null;
const PORT = 8673;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pocket-online-')), 'mp.bundle.mjs');
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
	return res.json();
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = req.headers['x-test-ip'] || ('10.8.0.' + (req.socket.remotePort % 250 + 1));
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts ----------
const tokens = {};
for (const n of ['ann', 'ben']) tokens[n] = (await call('register', { username: n, password: 'pocket-online-pass' })).token;
A(tokens.ann && tokens.ben, 'two real accounts (they need not be friends: the code is the invitation)');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, vp = { width: 1600, height: 900, deviceScaleFactor: 1 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, vp };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	const K = (k) => `[data-k="${k}"]`;
	// press a button where it comes to rest (menus rise into place)
	const tap = async (t, sel) => {
		const ok = await waitFor(() => t.page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; }, sel), 8000);
		if (!ok) return false;
		let prev = null, b = null;
		for (let i = 0; i < 40; i++) { const e = await t.page.$(sel); b = e && await e.boundingBox(); if (b && prev && Math.abs(b.x - prev.x) < 0.5 && Math.abs(b.y - prev.y) < 0.5) break; prev = b; await sleep(40); }
		if (!b) return false;
		if (t.vp.hasTouch) await t.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await t.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
		await sleep(t.vp.hasTouch ? 380 : 80);
		return true;
	};
	const view = (t) => t.page.evaluate(() => window.__pocket.view());
	// what every table must agree on: every Pokémon in play, the points, whose turn, the counts
	const sig = (t) => t.page.evaluate(() => {
		const v = window.__pocket.view(); if (!v) return null;
		const k = (x) => (x ? [x.id, x.dmg, x.energy.join(''), x.status.join('')] : 0);
		return JSON.stringify({ n: v.n, ph: v.phase, t: v.turn, c: v.current, o: v.over && v.over.winner, p: v.players.map((p) => [p.name, p.points, p.eliminated, p.handCount, p.deck, p.discard.length, p.active.map(k), p.bench.map(k)]) });
	});
	const agree = async (label) => {
		let a = null, b = null;
		const ok = await waitFor(async () => { a = await sig(ann); b = await sig(ben); return a && a === b; }, 20000);
		A(ok, `both tables agree: ${label}`, ok ? '' : `\n   ann ${a}\n   ben ${b}`);
	};
	const hidden = async (t, seat, label) => {
		const r = await t.page.evaluate((me) => { const P = window.__pocket, v = P.view(); return { state: P.state(), own: Array.isArray(v.players[me].hand), others: v.players.filter((p) => p.seat !== me).every((p) => p.hand === null), decks: v.players.every((p) => typeof p.deck === 'number'), recipe: !!(P.recipe && P.recipe()) }; }, seat);
		A(r.state === null && r.own && r.others && r.decks && !r.recipe, `${label}: the page holds its own hand only: no engine state, no other hand, no deck, no recipe`, JSON.stringify(r));
	};

	// a guest is told to sign in (and can still play the computer)
	const guest = await open(null, '/pocketenhanced/');
	await ready(guest.page); await tap(guest, K('online'));
	A(await waitFor(() => guest.page.evaluate(() => /needs an account/.test(document.querySelector('.modal:last-child').textContent) && !document.querySelector('[data-k="host"]')), 5000), 'a guest pressing Play online is told it needs an account (computer matches do not)');

	// ann hosts: 3 seats, one of them a computer player
	const ann = await open('ann', '/pocketenhanced/');
	A(await ready(ann.page), 'ann: page ready (signed in)');
	await tap(ann, K('online')); await tap(ann, K('os3')); await tap(ann, K('ob1')); await tap(ann, K('dcharizard'));
	A(await tap(ann, K('host')), 'ann: Play online → 3 seats → 1 computer → Host a match');
	A(await waitFor(() => ann.page.evaluate(() => !!document.querySelector('[data-code]')), 8000), 'ann sees her lobby and its code');
	const code = await ann.page.evaluate(() => document.querySelector('[data-code]').dataset.code);
	A(/^[A-Z2-9]{5}$/.test(code) && await ann.page.evaluate(() => /Open seat/.test(document.querySelector('.modal').textContent) && /Computer player/.test(document.querySelector('.modal').textContent)), `the code is 5 characters (${code}); the lobby lists her, the computer player and an open seat`);
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'online_lobby_host.png') });

	// ben joins with the code, typed into the on-screen keyboard
	const ben = await open('ben', '/pocketenhanced/');
	await ready(ben.page);
	await tap(ben, K('online')); await tap(ben, K('dpikachu')); await tap(ben, K('join'));
	A(await waitFor(() => ben.page.evaluate(() => !!document.querySelector('#osk input')), 5000), 'ben: Enter a code opens the on-screen keyboard (so a controller can type it)');
	await ben.page.type('#osk input', code.toLowerCase());
	await ben.page.keyboard.press('Enter');
	A(await waitFor(() => ben.page.evaluate((c) => document.querySelector('[data-code]')?.dataset.code === c, code), 8000), 'ben is in the lobby (the code typed in lower case)');
	A(await waitFor(() => ann.page.evaluate(() => /ben/.test(document.querySelector('.modal').textContent) && /not ready/.test(document.querySelector('.modal').textContent) && document.querySelector('[data-k="ostart"]').disabled), 8000), "ann's lobby shows ben, not ready: Start still waits");
	await tap(ben, K('oready'));
	A(await waitFor(() => ann.page.evaluate(() => !document.querySelector('[data-k="ostart"]').disabled), 8000), 'ben readies up: ann can start');
	A(await tap(ann, K('ostart')), 'ann starts the match');
	A(await waitFor(async () => (await view(ann))?.phase === 'setup' && (await view(ben))?.phase === 'setup', 10000), 'the match reaches both screens, in setup');
	await hidden(ann, 0, 'ann'); await hidden(ben, 1, 'ben');
	A(await ann.page.evaluate(() => !document.querySelector('.modal')) && await ben.page.evaluate(() => !document.querySelector('.modal')), 'the lobby steps aside for the table');

	// both set up through the page: tap the Basic Pokémon, then Ready
	for (const t of [ann, ben]) {
		const basics = await t.page.evaluate(() => [...document.querySelectorAll('.pe-hand .pe-card.playable')].map((e) => e.dataset.k));
		for (const k of basics) await tap(t, K(k));
		await tap(t, K('ready'));
	}
	A(await waitFor(async () => (await view(ann))?.phase === 'main' && (await view(ben))?.phase === 'main', 12000), 'both set up from the page: the match begins', JSON.stringify([await ann.page.evaluate(() => ({ v: window.__pocket.view() && [window.__pocket.view().phase, window.__pocket.view().players.map(p => p.setup)], o: window.__pocket.online(), b: document.querySelector('.pe-banner').textContent, m: document.querySelector('.modal-title')?.textContent })), await ben.page.evaluate(() => ({ v: window.__pocket.view() && [window.__pocket.view().phase, window.__pocket.view().players.map(p => p.setup)], o: window.__pocket.online().n, b: document.querySelector('.pe-banner').textContent, m: document.querySelector('.modal-title')?.textContent }))]));
	await agree('the opening');
	if (SHOTS) { await ann.page.screenshot({ path: path.join(SHOTS, 'online_ann.png') }); await ben.page.screenshot({ path: path.join(SHOTS, 'online_ben.png') }); }

	// a player's own turn, by the computer player's rules, through the page's own action entry
	const takeTurn = (t, seat) => t.page.evaluate(async (me) => {
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		const P = window.__pocket, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		for (let i = 0; i < 60; i++) {
			const v = P.view(); if (!v || v.over) return 'over';
			const mine = v.pending ? v.pending.seat === me : v.current === me;
			if (!mine || v.players[me].eliminated) return 'waiting';
			const banned = new Set(); let a = null, ok = false;
			for (let k = 0; k < 30 && !ok; k++) { a = nextAction(P.view(), banned) || { t: 'execute', commands: [null, null] }; ok = await P.act(a); if (!ok) { banned.add(JSON.stringify(a)); await sleep(30); } }
			if (!ok) return 'stuck';
			if (a.t === 'execute') return 'done';
		}
		return 'long';
	}, seat);
	const whose = async () => { const v = await view(ann); return v.over ? -1 : v.pending ? v.pending.seat : v.current; };
	const people = [ann, ben];
	const untilPerson = () => waitFor(async () => { const s = await whose(); return s === -1 || s === 0 || s === 1; }, 20000);

	// out of turn: the server refuses, nothing changes
	await untilPerson();
	{
		const s = await whose(), other = people[1 - s], before = await sig(ann);
		const r = await other.page.evaluate(() => window.__pocket.act({ t: 'execute', commands: [null, null] }));
		A(r === false && await other.page.evaluate(() => /not your turn/i.test(document.querySelector('.pe-banner').textContent)) && (await sig(ann)) === before, 'a player acting out of turn is refused by the server ("not your turn") and nothing changes');
	}
	// one turn through the buttons: the Energy Zone, then Execute
	{
		const s = await whose(), t = people[s];
		await waitFor(async () => (await view(t)).current === s, 8000);
		const v = await view(t);
		if (v.players[s].zone.cur && !v.players[s].flags.attached && v.players[s].active.some(Boolean)) {
			await tap(t, K('zone'));
			await tap(t, K(`p:${s}:active:${v.players[s].active.findIndex(Boolean)}`));
			A(await waitFor(async () => (await view(t)).players[s].flags.attached, 8000), 'a player attaches Energy from the page: the server applies it');
			await agree('after the attachment');
		}
		const turn0 = (await view(t)).turn;
		A(await t.page.evaluate(() => document.querySelector('[data-k="exec"]').textContent === 'Execute' && !document.querySelector('[data-k="exec"]').disabled), 'the player to move has the Execute button');
		await tap(t, K('exec'));
		if (await t.page.evaluate(() => !!document.querySelector('[data-k="exec2"]'))) await tap(t, K('exec2'));
		A(await waitFor(async () => { const x = await view(t); return x.over || x.turn > turn0; }, 10000), 'Execute from the page ends the turn on the server');
	}
	// a few turns each; the tables agree and stay private throughout
	for (let round = 0; round < 3; round++) {
		await untilPerson();
		const s = await whose(); if (s < 0) break;
		const r = await takeTurn(people[s], s);
		A(r === 'done' || r === 'over' || r === 'waiting', `seat ${s + 1} takes a turn (${r})`, r);
		await untilPerson();
		await agree(`round ${round + 1}`);
	}
	await hidden(ann, 0, 'ann, mid-match'); await hidden(ben, 1, 'ben, mid-match');
	A(await ben.page.evaluate(() => /Resolved in order: A, then B/.test(document.querySelector('.pe-log').textContent)), "the battle log reaches the other player's screen");

	// a reload: Play online drops ben straight back into the match
	await ben.page.reload({ waitUntil: 'domcontentloaded' }); await ready(ben.page);
	await tap(ben, K('online'));
	A(await waitFor(async () => { const v = await view(ben); return !!v && v.phase === 'main'; }, 12000), 'after a reload, Play online puts ben back in his match');
	await agree('after the reload');
	await hidden(ben, 1, 'ben, after the reload');

	// play it out
	let guard = 0, over = false;
	while (guard++ < 3000 && !over) {
		const s = await whose();
		if (s === -1) { over = true; break; }
		// ('waiting': that player's own screen has not caught up with the other's yet; it polls about once a second)
		if (s === 0 || s === 1) { const r = await takeTurn(people[s], s); if (r === 'stuck' || r === 'long') { A(false, 'a turn got stuck', r); break; } if (r === 'waiting') await sleep(200); }
		else await sleep(150);
		if (!(await waitFor(async () => { const x = await whose(); return x === -1 || x === 0 || x === 1; }, 20000))) break;
	}
	A(await waitFor(async () => !!(await view(ann))?.over && !!(await view(ben))?.over, 20000), 'the match plays to its end on both screens', JSON.stringify({ guard, a: await sig(ann), b: await sig(ben) }));
	await agree('the end');
	for (const [n, t] of [['ann', ann], ['ben', ben]]) {
		const e = await t.page.evaluate(() => ({ title: document.querySelector('.modal-title')?.textContent || '', reps: JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1') || '[]'), run: localStorage.getItem('magepunk_pocket_run_v1') }));
		const r = e.reps[0] && e.reps[0].recipe, S = r ? E.replay(r.config, r.actions) : null;
		A(/Match over|You win/.test(e.title) && S && S.over && r.config.players.map((p) => p.name).join() === 'ann,ben,Blue' && e.run === null, `${n}: the result is shown and the whole match is kept as a replay (the server sends the recipe once it is over)`, e.title);
	}
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'online_over.png') });
	// back to the lobby: the host can start another
	await tap(ann, K('tolobby'));
	A(await waitFor(() => ann.page.evaluate(() => /Start another match/.test(document.querySelector('[data-k="ostart"]')?.textContent || '')), 8000), 'back in the lobby, the host can start another match');
	await tap(ann, K('oleave'));
	A(await waitFor(() => ann.page.evaluate(() => !!document.querySelector('[data-k="new"]') && window.__pocket.mode === 'normal'), 8000), 'Leave returns to the menu');
	for (const [n, p] of [['ann', ann], ['ben', ben], ['guest', guest]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
