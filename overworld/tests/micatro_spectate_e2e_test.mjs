// micatro_spectate_e2e_test.mjs — a friend watches a live Micatro run, end to end:
// the REAL server handler (server/mp.mjs, bundled like the dev server, over sqlite)
// behind a static server, two headless browsers:
//   alice plays /micatro/ (publisher), bob watches /micatro/?spectate=alice.
// Asserts bob converges on alice's table after each of her actions (state, ante,
// money, score, hand, jokers), the watcher badge reaches alice, bob's Live now hub
// lists alice with a Watch link to /micatro/?spectate=alice, and a finished run's
// score lands on the micatro leaderboard.
//   node overworld/tests/micatro_spectate_e2e_test.mjs
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
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8744;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

// ---------- real handler over sqlite ----------
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-e2e-')), 'mp.bundle.mjs');
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
		// each browser gets its own client IP so per-IP limits behave like real users
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
await new Promise(r => server.listen(PORT, r));

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob']) {
	const r = await call('register', { username: n, password: 'micatro-e2e-pass' });
	tokens[n] = r.token;
}
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob, 'two real accounts registered and befriended');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.removeItem('micatro_run_v1');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const sig = (page) => page.evaluate(() => {
		const v = window.__micatro.view();
		if (!v || !v.areas) return null;
		return JSON.stringify({ s: v.state, a: v.ante, r: v.round, d: v.dollars, c: v.chips, h: v.areas.hand.map(c => c.id), j: v.areas.jokers.map(c => c.center), sh: v.areas.shop_jokers.map(c => c.center) });
	});

	// alice starts a seeded run
	const alice = await open('alice', '/micatro/');
	A(await ready(alice.page), 'alice: game ready');
	await alice.page.evaluate(() => window.__micatro.newRun({ seed: 'E2ESPEC' }));
	await idle(alice.page);
	await alice.page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle(alice.page);

	// she shows up as live for bob
	const live = await waitFor(async () => {
		const r = await call('live-friends', {}, tokens.bob);
		return (r.live || r.friends || []).some((f) => f.username === 'alice' && f.kind === 'micatro');
	}, 8000);
	A(live, "bob's live-friends lists alice with kind 'micatro'");

	// bob watches
	const bob = await open('bob', '/micatro/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	const conv = async (label) => {
		const target = await sig(alice.page);
		const ok = await waitFor(async () => (await sig(bob.page)) === target, 15000);
		A(ok, `bob converges on alice's table: ${label}`, ok ? '' : `\n   alice ${target}\n   bob   ${await sig(bob.page)}`);
	};
	await conv('after selecting the blind');
	A(await bob.page.evaluate(() => document.body.innerText.toLowerCase().includes('watching')), 'spectator shows a "Watching" banner');

	// alice plays a few hands (best-scoring 5 cards each time)
	const best = () => alice.page.evaluate(async () => {
		const R = await import('/micatro/js/engine/run.js');
		const G = R.G, hand = G.hand.cards, n = hand.length;
		let best = null, bestScore = -1;
		const rec = (s, p) => { if (p.length) { const cards = p.map(i => hand[i]); const info = R.pokerInfo(cards); const h = G.GAME.hands[info.text]; if (h) { let ch = h.chips; for (const c of info.scoring_hand) ch += c.get_chip_bonus(); if (ch * h.mult > bestScore) { bestScore = ch * h.mult; best = cards.map(x => x.sort_id); } } } if (p.length === 5) return; for (let i = s; i < n; i++) { p.push(i); rec(i + 1, p); p.pop(); } };
		rec(0, []);
		return best;
	});
	for (let i = 0; i < 2; i++) {
		const ids = await best();
		await alice.page.evaluate((ids) => window.__micatro.act({ type: 'highlight', ids }), ids);
		await alice.page.evaluate(() => window.__micatro.act({ type: 'play' }));
		await idle(alice.page);
		await conv(`after hand ${i + 1}`);
		if (await alice.page.evaluate(() => window.__micatro.view().state !== 'SELECTING_HAND')) break;
	}

	// watcher badge reaches alice
	const badge = await waitFor(() => alice.page.evaluate(() => /\b1\b/.test((document.querySelector('[class*="watch"]') || {}).textContent || '')), 15000);
	A(badge, "alice's watcher badge shows 1 watcher");

	// bob's Live now hub lists alice → Watch link points at the micatro spectator
	const hub = await open('bob', '/battlecards/start.html');
	const link = await waitFor(() => hub.page.evaluate(() => [...document.querySelectorAll('a,button')].some((el) => (el.getAttribute('href') || el.dataset.href || '').includes('/micatro/?spectate=alice'))), 15000);
	A(link, "bob's Live now hub has a Watch link to /micatro/?spectate=alice");

	// finish: force a loss so the run ends, then the score is on the board
	await alice.page.evaluate(async () => {
		const R = await import('/micatro/js/engine/run.js');
		const G = R.G;
		if (G.STATE !== R.STATES.SELECTING_HAND) return;
		G.GAME.current_round.hands_left = 1;
		G.GAME.chips = 0;
		G.hand.config.card_limit = Math.max(1, G.hand.config.card_limit);
	});
	await alice.page.evaluate(() => {
		const v = window.__micatro.view();
		window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[v.areas.hand.length - 1].id] });
		return window.__micatro.act({ type: 'play' });
	});
	await idle(alice.page);
	const over = await waitFor(() => alice.page.evaluate(() => window.__micatro.view().over), 10000);
	A(over, 'alice: run over');
	const onBoard = await waitFor(async () => {
		const r = await call('run-leaderboard', { mode: 'micatro', limit: 10 }, tokens.bob);
		return (r.top || r.rows || []).some((x) => (x.name || x.username) === 'alice' && x.score > 0);
	}, 15000);
	A(onBoard, "alice's best hand is on the micatro leaderboard");
	const bobOver = await waitFor(() => bob.page.evaluate(() => /over|ended|game over/i.test(document.body.innerText)), 15000);
	A(bobOver, 'bob sees the run end');

	for (const [who, p] of [['alice', alice], ['bob', bob], ['hub', hub]]) {
		A(p.errors.length === 0, `${who}: no uncaught page errors`, p.errors.slice(0, 3).join(' | '));
	}
} catch (e) {
	fail++; console.log('FAIL: exception', e && e.stack);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
