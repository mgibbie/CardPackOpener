// bets_stage2_e2e_test.mjs — spectator bets, stage 2, end to end: Battlecards and MicaSurvivor pages, the widget every
// spectator view mounts (site/bets.js), the REAL server (server/mp.mjs bundled over node:sqlite) behind a static server and
// headless browsers. alice plays; bob and carol are her friends, with 1000 stars each.
//   1. a Battlecards Quick Match: alice's page publishes it with its bet report; bob's ?spectate=alice page shows the Bets
//      chip, he backs "alice wins" with the page's own buttons; alice sees "★ N riding on this game"; she concedes the
//      fight and her page reports the loss: carol (against) takes the pool
//   2. a Battlecards Dungeon RUN: the market is the run ("wins the run"); alice concedes the run (the run's own Concede):
//      her page reports a loss, and the bets settle on it
//   3. a MicaSurvivor run (2D): bob watches it (Friends -> Watch), the chip is there, he bets on "alice survives 10
//      minutes"; her run reaching 10:00 reports the win at once (the run goes on) and bob takes the pool
//   node overworld/tests/bets_stage2_e2e_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as W from '../../site/stars.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8697;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets2-e2e-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const markets = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

const NAMES = ['alice', 'bob', 'carol'];
const BETTORS = ['bob', 'carol'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets2-e2e-pass' })).token;
for (const n of ['bob', 'carol']) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const bal = n => W.balance(row('stars:' + n));
const total = () => BETTORS.reduce((a, n) => a + bal(n), 0) + markets().filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
const T0 = total();
const stateOf = async (n) => (await call('state', {}, tok[n])).state || { username: n };
let bidN = 0; const bid = () => 'carolbet' + (++bidN).toString().padStart(4, '0');

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const open = async (who, url, extra) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tk, st, extra) => {
			try {
				localStorage.setItem('magepunk_sfx_muted', '1'); localStorage.setItem('micasurvivor_lang', 'en');
				localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				if (extra) window.__msurvNet = extra;
			} catch { /* ignore */ }
		}, tok[who], st, extra || null);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, E: (fn, ...a) => page.evaluate(fn, ...a), close: () => ctx.close() };
	};
	/** Open the Bets panel by its chip, pick outcome k, type n, press Place. -> the market id */
	const betByWidget = async (page, k, n) => {
		if (!(await waitFor(() => page.evaluate(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none'; }), 30000))) return 'no chip';
		await page.click('#bets-chip');
		if (!(await waitFor(() => page.evaluate(() => !!document.querySelector('#bets-panel .bm-o')), 10000))) return 'no panel';
		const mid = await page.evaluate((k) => { const b = [...document.querySelectorAll('#bets-panel .bm-o')].find(x => x.dataset.k === k); if (!b) return null; b.click(); return b.dataset.m; }, k);
		if (!mid) return 'no outcome ' + k;
		await page.click(`#bets-panel .bm-amt[data-m="${mid}"]`);
		await page.keyboard.type(String(n));
		await page.click(`#bets-panel .bm-place[data-m="${mid}"]`);
		return mid;
	};
	const gameLive = (p) => waitFor(() => p.E(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 60000);

	// ===== 1. a Battlecards Quick Match =====
	{
		const alice = await open('alice', '/battlecards/index.html?players=2');
		A(await gameLive(alice), "alice's Quick Match is on", alice.errors.slice(0, 2).join(' | '));
		A(await waitFor(() => { const r = row('cardstate:alice'); return r && r.bet && /^f/.test(r.bet.run) && r.bet.md === 'battle'; }, 15000), 'her page publishes the fight with its bet report (this game, its turn)', row('cardstate:alice') && row('cardstate:alice').bet);
		const bob = await open('bob', '/battlecards/index.html?spectate=alice');
		const mid = await betByWidget(bob.page, 'win', 70);
		A(/^s:cards:alice:f/.test(String(mid)), 'bob, watching, opens Bets from its chip and backs "alice wins" with 70 stars', mid);
		A(await waitFor(() => { const m = row('betm:' + mid); return m && m.stakes.bob && m.stakes.bob.stars === 70; }, 10000) && bal('bob') === 930, 'the stake left his wallet for the market', row('betm:' + mid));
		A((await call('bet-place', { id: mid, o: 'lose', n: 30, bid: bid() }, tok.carol)).ok, 'carol bets 30 that alice loses');
		A(await waitFor(() => alice.E(() => /100 riding on this game/.test((document.getElementById('bets-riding') || {}).textContent || '')), 15000), 'alice sees "★ 100 riding on this game"');
		await alice.E(() => { const g = window.__game; g.E.concede(g.state, g.HUMAN); g.pump(); });
		A(await waitFor(() => { const m = row('betm:' + mid); return m && m.end; }, 20000), 'alice concedes the fight: her page reports it, the market settles', row('betm:' + mid));
		A(row('betm:' + mid).end.result === 'lose' && bal('carol') === 1070 && bal('bob') === 930 && total() === T0, 'carol takes the pool of 100; nothing made or lost', { end: row('betm:' + mid).end, carol: bal('carol') });
		A(await waitFor(() => bob.E(() => { const p = document.getElementById('bets-panel'); if (!p) document.getElementById('bets-chip')?.click(); return /went to the winners/.test((document.querySelector('#bets-panel .bm-res') || {}).textContent || ''); }), 15000), "bob's panel says his 70 went to the winners");
		A(alice.errors.length === 0 && bob.errors.length === 0, 'no page errors', [...alice.errors, ...bob.errors]);
		await alice.close(); await bob.close();
	}

	// ===== 2. a Battlecards Dungeon run, conceded =====
	{
		const alice = await open('alice', '/battlecards/index.html?dungeon=1');
		// the class and the weekly anomaly: the first button of each overlay, until the first fight is on
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await alice.E(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players)); }))) {
			await alice.E(() => { const o = document.getElementById('dungeon-overlay'); const b = o && o.style.display !== 'none' && o.querySelector('button'); if (b) b.click(); });
			await sleep(400);
		}
		A(await gameLive(alice), "alice's Dungeon run is on its first fight", alice.errors.slice(0, 2).join(' | '));
		A(await waitFor(() => { const r = row('cardstate:alice'); return r && r.bet && /^r/.test(r.bet.run) && r.bet.md === 'dungeon' && r.bet.prog === 0; }, 15000), 'her page publishes the RUN (its runId, no fight decided yet)', row('cardstate:alice') && row('cardstate:alice').bet);
		const g = await call('bet-get', { game: 'cards', runner: 'alice' }, tok.bob), M = g.markets && g.markets[0];
		A(M && M.outcomes[0].label === 'alice wins the run' && M.open, 'bob sees "alice wins the run / loses the run"', g);
		await call('bet-place', { id: M.id, o: 'win', n: 50, bid: 'bobrunbet01' }, tok.bob);
		await call('bet-place', { id: M.id, o: 'lose', n: 25, bid: bid() }, tok.carol);
		await alice.E(() => document.getElementById('concede').click());
		await waitFor(() => alice.E(() => [...document.querySelectorAll('#dungeon-overlay button')].some(b => b.textContent === 'Concede the run')), 5000);
		await alice.E(() => [...document.querySelectorAll('#dungeon-overlay button')].find(b => b.textContent === 'Concede the run').click());
		A(await waitFor(() => { const m = row('betm:' + M.id); return m && m.end; }, 20000) && row('betm:' + M.id).end.result === 'lose', 'alice concedes the run: her page reports the loss, the market settles "loses"', row('betm:' + M.id));
		A(bal('carol') === 1070 + 50 && total() === T0, 'carol takes the pool of 75; nothing made or lost', { carol: bal('carol') });
		A(alice.errors.length === 0, 'no page errors', alice.errors);
		await alice.close();
	}

	// ===== 3. a MicaSurvivor run (2D) =====
	{
		const net = { ice: [], specCheckMs: 1500, specPollMs: 800, friendsMs: 1500 };
		const alice = await open('alice', '/micasurvivor/', net), bob = await open('bob', '/micasurvivor/', net);
		const boot = async (p) => {
			const ok = await waitFor(() => p.E(() => document.getElementById('boot').classList.contains('hidden') && !!G.Social && !!G.WatchUI), 40000);
			await sleep(200);
			await p.E(() => { const t = document.getElementById('tap-start'); if (t && !t.classList.contains('hidden') && t.getClientRects().length) t.click(); });
			await waitFor(() => p.E(() => { const s = document.getElementById('scr-starters'); return s && !s.classList.contains('hidden'); }), 10000);
			await p.E(() => { const c = document.querySelector('#starter-grid .cell[data-dex="813"]'); if (c) c.click(); }); await sleep(300);
			await p.E(() => document.getElementById('starter-ok').click());
			return ok && await waitFor(() => p.E(() => { const s = document.getElementById('scr-menu'); return s && !s.classList.contains('hidden'); }), 10000);
		};
		A(await boot(alice) && await boot(bob), 'alice and bob boot MicaSurvivor signed in', [...alice.errors, ...bob.errors].slice(0, 2).join(' | '));
		await waitFor(() => alice.E(() => G.Social.started && G.Social.friends.length >= 1), 8000);
		await alice.E(() => G.Flow.play('normal'));
		A(await waitFor(() => alice.E(() => G.Game.state === 'playing' && G.Spectate.publishing), 8000), 'alice starts a run');
		await alice.E(() => { const pl = G.Game.player; pl.invuln = 1e9; G.Spawner.update = () => {}; });
		A(await waitFor(() => { const r = row('msurvlive:alice'); return r && r.bet && r.bet.run === r.run; }, 10000), 'her beacon carries the bet report (the run)', row('msurvlive:alice'));
		await bob.E(() => document.querySelector('#scr-menu [data-go=friends]').click());
		A(await waitFor(() => bob.E(() => { const b = document.querySelector('#fr-live button[data-watch="alice"]'); if (b) b.click(); return G.Game.state === 'watch'; }), 15000), 'bob watches her run (Friends -> Watch)');
		const mid = await betByWidget(bob.page, 'win', 45);
		A(/^s:micasurvivor:alice:/.test(String(mid)) && await bob.E(() => /alice survives 10 minutes/.test(document.getElementById('bets-panel').textContent)), 'the Bets chip is on his watch view: he backs "alice survives 10 minutes" with 45', mid);
		A(await waitFor(() => { const m = row('betm:' + mid); return m && m.stakes.bob && m.stakes.bob.stars === 45; }, 10000), 'the bet is on the market');
		A((await call('bet-place', { id: mid, o: 'lose', n: 15, bid: bid() }, tok.carol)).ok, 'carol bets 15 that she falls first');
		A(await waitFor(() => alice.E(() => /60 riding on this game/.test((document.getElementById('bets-riding') || {}).textContent || '')), 20000), 'alice sees "★ 60 riding on this game"');
		// ten minutes of run time (the run clock, read through G.Game.st): the "yes" is told at once, the run goes on
		await alice.E(() => Object.defineProperty(G.Game.st, 'time', { get: () => 601, configurable: true }));
		A(await waitFor(() => { const m = row('betm:' + mid); return m && m.end; }, 20000) && row('betm:' + mid).end.result === 'win', 'her run reaches 10:00: the market settles "survives"', row('betm:' + mid));
		A(await alice.E(() => G.Game.state === 'playing'), 'the run itself goes on');
		A(bal('bob') === 930 - 50 - 45 + 60 && total() === T0, 'bob takes the pool of 60; nothing made or lost', { bob: bal('bob') });
		A(alice.errors.length === 0 && bob.errors.length === 0, 'no page errors', [...alice.errors, ...bob.errors]);
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
