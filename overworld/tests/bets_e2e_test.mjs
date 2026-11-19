// bets_e2e_test.mjs — spectator bets end to end, through the widget every spectator view mounts (site/bets.js, mounted by
// micatro/js/net.js's spectator loop): the REAL server (server/mp.mjs bundled over node:sqlite) behind a static server and
// headless browsers. alice plays; bob and carol are her friends, with 1000 stars each on their accounts.
//   1. a Pocket Enhanced match against the computer: bob watches, opens Bets (the chip), backs an outcome and places a bet
//      with the page's own buttons; alice's table shows "N ★ riding on this game"; the match ends; bob's panel shows how
//      it settled, and every wallet adds up to what it was
//   2. a Pocket Enhanced ONLINE match (alice against the server's computer player): the server decides it (alice concedes
//      on the server); bob's bet on the computer player wins the pool
//   3. a Micatro run: bob opens Bets with the B key and picks with Z (keyboard), types an amount and presses Enter; the run
//      is lost, so carol's bet against alice takes the pool
//   node overworld/tests/bets_e2e_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as W from '../../site/stars.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import { starterDeck } from '../../pocketenhanced/js/decks.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8694;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets-e2e-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'server/pocket_pvp.mjs'), 'utf8').match(/PKPVP_PROTOCOL = (\d+)/)[1], ev: E.ENGINE_VERSION };
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const markets = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
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
const BETTORS = ['bob', 'carol'];   // (alice's own wallet moves with her games' rewards; the bets are bob's and carol's)
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets-e2e-pass' })).token;
for (const n of ['bob', 'carol']) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const bal = n => W.balance(row('stars:' + n));
const total = () => BETTORS.reduce((a, n) => a + bal(n), 0) + markets().filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
const T0 = total();
const stateOf = async (n) => (await call('state', {}, tok[n])).state || { username: n };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tk, st) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.removeItem('micatro_run_v1');
				localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { /* ignore */ }
		}, tok[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, close: () => ctx.close() };
	};
	const pocketReady = (page) => waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	/** Open the Bets panel by its chip, pick outcome k of the first market of `kind`, type n, press Place. */
	const betByWidget = async (page, k, n, kind) => {
		if (!(await waitFor(() => page.evaluate(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none'; }), 20000))) return 'no chip';
		await page.click('#bets-chip');
		if (!(await waitFor(() => page.evaluate(() => !!document.querySelector('#bets-panel .bm-o')), 10000))) return 'no panel';
		const sel = await page.evaluate((k, kind) => { const m = window.__betsState ? null : null; const all = [...document.querySelectorAll('#bets-panel .bm-o')].filter(b => b.dataset.k === k && (!kind || b.dataset.m.startsWith(kind))); return all.length ? `#bets-panel .bm-o[data-f="${all[0].dataset.f.replace(/"/g, '\\"')}"]` : null; }, k, kind);
		if (!sel) return 'no outcome ' + k;
		await page.click(sel);
		const mid = await page.evaluate((s) => document.querySelector(s).dataset.m, sel);
		await page.click(`#bets-panel .bm-amt[data-m="${mid}"]`);
		await page.keyboard.type(String(n));
		await page.click(`#bets-panel .bm-place[data-m="${mid}"]`);
		return mid;
	};

	// ===== 1. a Pocket Enhanced match against the computer =====
	const alice = await open('alice', '/pocketenhanced/?seed=bets-a');
	A(await pocketReady(alice.page), 'alice: Pocket Enhanced ready (signed in)');
	await alice.page.evaluate(async () => { const P = window.__pocket; P.fast(); P.start({ players: 2, starter: 'charizard' }); const { nextAction } = await import('/pocketenhanced/js/ai.js'); P.act(nextAction(P.engine.view(P.state(), 0))); });
	A(await waitFor(() => !!row('pocketstate:alice') && !!row('pocketstate:alice').bet, 15000), "alice's match is published with its bet report (instance, turn)", row('pocketstate:alice'));
	const bob = await open('bob', '/pocketenhanced/?spectate=alice');
	A(await pocketReady(bob.page), 'bob watches alice');
	const mid1 = await betByWidget(bob.page, 'win', 120);
	A(String(mid1).startsWith('s:pocket:alice:'), 'bob opens Bets from its chip, backs "alice wins" and places 120 stars', mid1);
	A(await waitFor(() => { const m = row('betm:' + mid1); return m && m.stakes.bob && m.stakes.bob.stars === 120; }, 10000) && bal('bob') === 880, 'the bet is on the market; 120 stars left his wallet', row('betm:' + mid1));
	A(await waitFor(() => bob.page.evaluate(() => /Your bet: 120/.test(document.querySelector('#bets-panel').textContent) && /Raise bet/.test(document.querySelector('#bets-panel .bm-place').textContent)), 8000), 'his panel shows his bet; the button now raises it');
	A(await waitFor(() => bob.page.evaluate(() => /880/.test(document.querySelector('#bets-panel .bm-bal').textContent)), 8000), 'the balance shown is the account\'s (880)');
	A((await call('bet-place', { id: mid1, o: 'lose', n: 80, bid: 'carolbet01' }, tok.carol)).ok, 'carol bets 80 that alice loses');
	A(await waitFor(() => alice.page.evaluate(() => /200 riding on this game/.test((document.getElementById('bets-riding') || {}).textContent || '')), 20000), 'alice sees "★ 200 riding on this game"');
	A(await waitFor(() => bob.page.evaluate(() => { const t = document.querySelector('#bets-panel').textContent; return /pool 200/.test(t) && /×1\.67/.test(t) && /×2\.50/.test(t); }), 12000), "bob's panel shows the pool (200) and what a star pays on each side (200/120 = ×1.67, 200/80 = ×2.50)");
	await bob.page.keyboard.press('KeyX');
	A(await waitFor(() => bob.page.evaluate(() => !document.getElementById('bets-panel') && document.getElementById('bets-chip').style.display !== 'none'), 5000), 'X closes the panel back to its chip');
	const end = await alice.page.evaluate(async () => {
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		const P = window.__pocket, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		for (let i = 0; i < 40000; i++) {
			const S = P.state(); if (!S || S.over) return 'over';
			const mine = (S.pending && S.pending.seat === 0) || (!S.pending && S.current === 0) || (S.phase === 'setup' && !S.players[0].setup);
			if (!mine) { await sleep(5); continue; }
			const banned = new Set(); let ok = false;
			for (let t = 0; t < 40 && !ok; t++) { const a = nextAction(P.engine.view(P.state(), 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; ok = P.act(a); if (!ok) banned.add(JSON.stringify(a)); }
			if (!ok) return 'stuck';
		}
		return 'long';
	});
	const won = await alice.page.evaluate(() => { const v = window.__pocket.view(); return v.over.winner === 0; });
	A(end === 'over', `the match plays to its end (alice ${won ? 'won' : 'lost'})`, end);
	A(await waitFor(() => { const m = row('betm:' + mid1); return m && m.end; }, 20000), 'her game reported the result: the market settled', row('betm:' + mid1));
	A(won ? bal('bob') === 1080 && bal('carol') === 920 : bal('bob') === 880 && bal('carol') === 1120, won ? 'alice won: bob takes the pool of 200 (+80)' : 'alice lost: carol takes the pool of 200 (+120)', { bob: bal('bob'), carol: bal('carol') });
	await bob.page.click('#bets-chip');
	A(await waitFor(() => bob.page.evaluate((won) => { const t = (document.querySelector('#bets-panel .bm-res') || {}).textContent || ''; return won ? /\+200/.test(t) : /went to the winners/.test(t); }, won), 15000), "bob's panel shows how it settled (" + (won ? '+200 ★' : 'his stake went to the winners') + ')');
	A(total() === T0, "the bettors' wallets and the open pools add up to what they were before any bet");
	await bob.page.keyboard.press('KeyX');
	A(alice.errors.length === 0 && bob.errors.length === 0, 'no page errors', [...alice.errors, ...bob.errors]);
	await alice.close(); await bob.close();

	// ===== 2. a Pocket Enhanced online match: the server decides =====
	const D = starterDeck('charizard');
	const made = await call('pkpvp-create', { size: 2, bots: 1, ...D }, tok.alice);
	const LID = made.lobby && made.lobby.id;
	const started = LID && await call('pkpvp-start', { id: LID }, tok.alice);
	A(started && started.match, 'alice starts an online match against the server\'s computer player (Blue)', started && started.error);
	const alice2 = await open('alice', '/pocketenhanced/');
	await pocketReady(alice2.page);
	A(await waitFor(() => { const r = row('pocketstate:alice'); return r && r.bet && r.bet.pk === LID; }, 25000), "alice's page goes back into the match and publishes it as an online one (its lobby id)", row('pocketstate:alice') && row('pocketstate:alice').bet);
	const bob2 = await open('bob', '/pocketenhanced/?spectate=alice');
	await pocketReady(bob2.page);
	const mid2 = await betByWidget(bob2.page, 'Blue', 300);
	A(String(mid2).startsWith('p:' + LID + ':'), 'bob backs "Blue wins" with 300 stars', mid2);
	A(await waitFor(() => { const m = row('betm:' + mid2); return m && m.stakes.bob && m.stakes.bob.stars === 300; }, 10000), 'the bet is on the match market');
	A((await call('bet-place', { id: mid2, o: 'alice', n: 100, bid: 'carolbet02' }, tok.carol)).ok, 'carol backs alice with 100');
	A(/playing in this match/.test((await call('bet-place', { id: mid2, o: 'alice', n: 5, bid: 'alicebet01' }, tok.alice)).error || ''), 'alice (playing in it) cannot bet on it');
	const cc = await call('pkpvp-act', { id: LID, a: { t: 'concede' }, n: -1 }, tok.alice);
	A(cc.match && cc.match.over, 'alice concedes: the server ends the match (Blue wins)', cc.error);
	A(await waitFor(() => { const m = row('betm:' + mid2); return m && m.end && m.end.result === 'Blue'; }, 25000), 'the market settles on the server\'s result', row('betm:' + mid2) && row('betm:' + mid2).end);
	A(bal('bob') === (won ? 1080 : 880) + 100 && total() === T0, 'bob takes the pool of 400 (+100); nothing made or lost', { bob: bal('bob') });
	await alice2.close(); await bob2.close();

	// ===== 3. a Micatro run (keyboard) =====
	const bobBefore = bal('bob'), carolBefore = bal('carol');
	const alice3 = await open('alice', '/micatro/');
	await waitFor(() => alice3.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
	await alice3.page.evaluate(() => window.__micatro.newRun({ seed: 'BETSE2E' }));
	await waitFor(() => alice3.page.evaluate(() => window.__micatro.idle()), 30000);
	await alice3.page.evaluate(() => window.__micatro.selectBlind());
	await waitFor(() => alice3.page.evaluate(() => window.__micatro.idle()), 30000);
	A(await waitFor(() => { const r = row('micatrostate:alice'); return r && r.bet && r.bet.prog === 1; }, 15000), "alice's Micatro run is published with its run id and ante 1", row('micatrostate:alice') && row('micatrostate:alice').bet);
	const bob3 = await open('bob', '/micatro/?spectate=alice');
	A(await waitFor(() => bob3.page.evaluate(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none'; }), 30000), 'bob watching her run has the Bets chip');
	await bob3.page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
	await bob3.page.keyboard.press('KeyB');
	A(await waitFor(() => bob3.page.evaluate(() => !!document.querySelector('#bets-panel .bm-o') && document.activeElement && document.activeElement.classList.contains('bm-o')), 8000), 'the B key opens the panel, focus on the first outcome',
		await bob3.page.evaluate(() => ({ panel: !!document.getElementById('bets-panel'), active: document.activeElement && (document.activeElement.className || document.activeElement.tagName) })));
	await bob3.page.keyboard.press('KeyZ');
	A(await waitFor(() => bob3.page.evaluate(() => { const s = document.querySelector('#bets-panel .bm-o.sel'); return !!s && s.dataset.k === 'win'; }), 5000), 'Z picks it ("alice wins")');
	await bob3.page.focus('#bets-panel .bm-amt');
	await bob3.page.keyboard.type('40');
	await bob3.page.keyboard.press('Enter');
	const mid3 = await bob3.page.evaluate(() => document.querySelector('#bets-panel .bm-o').dataset.m);
	A(await waitFor(() => { const m = row('betm:' + mid3); return m && m.stakes.bob && m.stakes.bob.stars === 40; }, 10000) && bal('bob') === bobBefore - 40, 'typing 40 and Enter places the bet', row('betm:' + mid3));
	A((await call('bet-place', { id: mid3, o: 'lose', n: 60, bid: 'carolbet03' }, tok.carol)).ok, 'carol bets 60 that alice loses');
	await alice3.page.evaluate(async () => { const R = await import('/micatro/js/engine/run.js'); const G = R.G; if (G.STATE !== R.STATES.SELECTING_HAND) return; G.GAME.current_round.hands_left = 1; G.GAME.chips = 0; });
	await alice3.page.evaluate(() => { const v = window.__micatro.view(); window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[v.areas.hand.length - 1].id] }); return window.__micatro.act({ type: 'play' }); });
	A(await waitFor(() => alice3.page.evaluate(() => window.__micatro.view().over), 20000), 'alice loses the run');
	A(await waitFor(() => { const m = row('betm:' + mid3); return m && m.end && m.end.result === 'lose'; }, 20000), 'the market settles: "alice loses"', row('betm:' + mid3) && row('betm:' + mid3).end);
	A(bal('carol') === carolBefore + 40 && bal('bob') === bobBefore - 40 && total() === T0, 'carol takes the pool of 100 (+40); every wallet adds up');
	A(await waitFor(() => bob3.page.evaluate(() => /went to the winners/.test((document.querySelector('#bets-panel .bm-res') || {}).textContent || '')), 15000), "bob's panel says his 40 went to the winners");
	A(alice3.errors.length === 0 && bob3.errors.length === 0, 'no page errors', [...alice3.errors, ...bob3.errors]);
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
