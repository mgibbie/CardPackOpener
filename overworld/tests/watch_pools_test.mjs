// watch_pools_test.mjs — POOLS on the Watch page and in TV mode (owner, 2026-11-19: "show what's riding on each live game
// ('1,240 ★ on Ann'), so the big-stakes games stand out"). The REAL server handler (server/mp.mjs bundled over node:sqlite)
// behind a static server, headless browsers. bob watches; alice, erin and fred are his friends; dave is not. carol and gina
// (friends of the players, not of bob) bet.
//   1. live-friends: alice's Scoundrel run with 1,240 ★ on it shows the total, the bettors, each outcome's stars and the open
//      countdown; erin's small pool too; fred (nobody bet) has none; dave's game (a stranger's) and its pool never show
//   2. live-friends writes NOTHING (the table is byte-for-byte the same; no write statement runs) and reads at most one
//      market row per live friend
//   3. betting closes: alice's run past its milestone and erin's past the 3-minute window both show CLOSED
//   4. the page: the pool line on each card, the big one stands out (badge + class), the ★ Bet link opens the game's
//      spectator view with the bet panel open; "Biggest pools" orders the cards by pool; the countdown ticks
//   5. TV mode shows the bigger pool first and shows the pool on its overlay; the weighting (pure)
//   node overworld/tests/watch_pools_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8699;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------- the real handler over sqlite, every statement watched (the read / write counts of section 2) ----------
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const spy = { on: false, writes: [], reads: [] };
const MP_DB = {
	prepare(sql) {
		const st = sqlite.prepare(sql); const b = [];
		const note = () => {
			if (!spy.on) return;
			if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) spy.writes.push(sql.slice(0, 60) + ' ' + b.filter((x) => typeof x === 'string').slice(0, 1).join());
			else spy.reads.push(...b.filter((x) => typeof x === 'string' && /^[a-z]+:/.test(x)));
		};
		const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { note(); return st.get(...b) ?? null; }, async run() { note(); const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { note(); return { results: st.all(...b) }; } };
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pools-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const dump = () => JSON.stringify(sqlite.prepare('SELECT key, value, updated_at FROM mp_store ORDER BY key').all());
let skew = 0; globalThis.__msurvClock = () => Date.now() + skew;   // (the clock the bets read)

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.10.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	// (Pair of Pears' spectator view is not what this test checks: a stand-in keeps TV mode's frames light. Scoundrel's is
	// the real page: the Bet link is checked on it)
	if (/^\/pairofpears\//.test(u) && /[?&]spectate=/.test(req.url)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>stand-in</title>'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
for (let i = 0; ; i++) {   // (another session's suite may hold the port for a while: wait and retry)
	try { await new Promise((ok, no) => { server.once('error', no); server.listen(PORT, ok); }); break; } catch (e) { if (i >= 20) throw e; await sleep(3000); }
}

// ---------- accounts ----------
const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'fred', 'gina'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'watch-pools-pass' })).token;
const friends = async (a, b) => { await call('add-friend', { username: b }, tok[a]); await call('add-friend', { username: a }, tok[b]); };
for (const f of ['fred', 'erin', 'alice']) await friends('bob', f);   // (in this order: the list's own order is fred, erin, alice)
for (const p of ['alice', 'erin', 'dave']) await friends('carol', p);
await friends('gina', 'alice');
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 5000 }, s: {}, at: 1 });
let bidN = 0; const bid = () => 'pool' + (++bidN).toString().padStart(6, '0');
const pub = (who, game, run, prog, label) => call('publish-' + game, { seq: Date.now() + (++bidN), label, snapshot: { v: bidN }, bet: { run, prog } }, tok[who]);
const marketOf = async (bettor, runner, game) => ((await call('bet-get', { game, runner }, tok[bettor])).markets || [])[0];
const place = (who, id, o, n) => call('bet-place', { id, o, n, bid: bid() }, tok[who]);

await pub('alice', 'scoundrel', 'a-run-1', 1, 'Dungeon 1');
await pub('erin', 'pears', 'e-run-1', 1, 'Level 1');
await pub('fred', 'pears', 'f-run-1', 1, 'Level 1');
await pub('dave', 'scoundrel', 'd-run-1', 1, 'Dungeon 1');
const MA = await marketOf('carol', 'alice', 'scoundrel'), ME = await marketOf('carol', 'erin', 'pears'), MD = await marketOf('carol', 'dave', 'scoundrel');
A(MA && ME && MD, 'markets open on alice\'s, erin\'s and dave\'s runs (their friend carol looked)', [MA, ME, MD]);
const placed = [await place('carol', MA.id, 'win', 900), await place('gina', MA.id, 'lose', 340), await place('carol', ME.id, 'win', 50), await place('carol', MD.id, 'win', 777)];
A(placed.every((r) => r.ok), 'bets placed: 900 + 340 on alice, 50 on erin, 777 on dave (a stranger to bob)', placed.map((r) => r.error));
const lf = async (who = 'bob') => (await call('live-friends', {}, tok[who])).live || [];

// ===== 1. live-friends carries the pools =====
{
	const live = await lf();
	const of = (u) => live.find((f) => f.username === u);
	A(live.map((f) => f.username).join() === 'fred,erin,alice', 'bob sees his three live friends (not dave)', live.map((f) => f.username));
	const pa = of('alice') && of('alice').pool;
	A(pa && pa.total === 1240 && pa.bettors === 2, "alice's run: 1,240 ★ riding, 2 bettors", pa);
	A(pa && JSON.stringify(pa.outcomes) === JSON.stringify([{ label: 'alice wins', n: 900 }, { label: 'alice loses', n: 340 }]), 'each outcome\'s total, labelled as the bet panel labels it', pa && pa.outcomes);
	A(pa && pa.open === true && pa.left > 150 && pa.left <= 180, 'betting is OPEN, with the seconds left (out of 3 minutes)', pa);
	A(pa && !('stakes' in pa) && !JSON.stringify(pa).includes('carol') && !JSON.stringify(pa).includes('gina'), 'nothing says who bet what', pa);
	A(of('erin') && of('erin').pool && of('erin').pool.total === 50 && of('erin').pool.bettors === 1, "erin's small pool: 50 ★, 1 bettor", of('erin'));
	A(of('fred') && !of('fred').pool, 'fred\'s run (nobody bet) has no pool', of('fred'));
	const carols = await lf('carol');
	A(carols.find((f) => f.username === 'dave')?.pool?.total === 777 && !(await lf()).some((f) => JSON.stringify(f).includes('777')), "dave's pool shows to his friend carol, never to bob (a stranger to dave)");
	const alices = await lf('alice');
	A(alices.length === 0 || !alices.some((f) => f.pool), 'alice (a player) is shown no pool of her own game');
}

// ===== 2. no writes, at most one market row per live friend =====
{
	const before = dump();
	spy.on = true; spy.writes = []; spy.reads = [];
	const live = await lf();
	spy.on = false;
	const marketReads = spy.reads.filter((k) => k.startsWith('betm:'));
	A(live.some((f) => f.pool) && spy.writes.length === 0, 'live-friends runs no write statement', spy.writes);
	A(dump() === before, 'the table is exactly as it was (every row, every updated_at)');
	A(marketReads.length >= 1 && marketReads.length <= live.length, `market rows read: ${marketReads.length} for ${live.length} live friends (at most one each)`, marketReads);
	A(new Set(marketReads).size === marketReads.length, 'no market row is read twice', marketReads);
}

// ===== 3. betting closes =====
{
	await pub('alice', 'scoundrel', 'a-run-1', 2, 'Dungeon 2');   // (Scoundrel's milestone: dungeon 2)
	let live = await lf();
	const pa = live.find((f) => f.username === 'alice').pool;
	A(pa && pa.open === false && pa.total === 1240 && !('left' in pa), "alice reaches dungeon 2: her pool shows CLOSED (still 1,240 ★ riding)", pa);
	skew = 3 * 60_000 + 2000;
	live = await lf();
	const pe = live.find((f) => f.username === 'erin').pool;
	A(pe && pe.open === false, "three minutes on, erin's shows CLOSED too", pe);
	skew = 0;
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox'] });
	const stateOf = async (n) => (await call('state', {}, tok[n])).state || { username: n };
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tk, st) => { try { localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_local_owner_v1', st.username); } catch { /* ignore */ } }, tok[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, close: () => ctx.close() };
	};
	// fresh runs, betting open again: alice's big pool, erin's small one
	await pub('alice', 'scoundrel', 'a-run-2', 1, 'Dungeon 1');
	await pub('erin', 'pears', 'e-run-2', 1, 'Level 1');
	await pub('fred', 'pears', 'f-run-1', 1, 'Level 1');
	const MA2 = await marketOf('carol', 'alice', 'scoundrel'), ME2 = await marketOf('carol', 'erin', 'pears');
	await place('carol', MA2.id, 'win', 900); await place('gina', MA2.id, 'lose', 340); await place('carol', ME2.id, 'lose', 60);

	// ===== 4. the page =====
	const bob = await open('bob', '/watch/');
	const cards = () => bob.page.evaluate(() => [...document.querySelectorAll('#live .live')].map((e) => ({ u: e.dataset.user, big: e.classList.contains('big'), badge: !!e.querySelector('.big-badge'), pool: (e.querySelector('.pool-text') || {}).textContent || '', bet: e.querySelector('a.bet')?.getAttribute('href') || '' })));
	A(await waitFor(async () => (await cards()).length === 3 && (await cards()).some((c) => c.pool), 10000), 'bob\'s Watch page lists his three live friends with their pools', await cards());
	let cs = await cards();
	const ca = cs.find((c) => c.u === 'alice'), ce = cs.find((c) => c.u === 'erin'), cf = cs.find((c) => c.u === 'fred');
	A(ca && /^1,240 ★ riding · 2 bettors · alice wins 900 \/ loses 340 · betting open [23]:\d\d$/.test(ca.pool), 'alice\'s card: "1,240 ★ riding · 2 bettors · alice wins 900 / loses 340 · betting open 2:5x"', ca);
	A(ca && ca.big && ca.badge && ce && !ce.big && !ce.badge, 'the big pool stands out (gold badge and border); the small one does not', cs);
	A(ce && /^60 ★ riding · 1 bettor · erin wins 0 \/ loses 60 · betting open/.test(ce.pool) && cf && !cf.pool && !cf.bet, "erin's small pool in one line; fred's card has no pool and no Bet link", cs);
	A(ca && ca.bet === '/scoundrel/?spectate=alice&bet=1', 'a ★ Bet link: the game\'s spectator link with bet=1', ca);
	A(cs.map((c) => c.u).join() === 'fred,erin,alice', 'the default order is as before (the server\'s)', cs.map((c) => c.u));
	const t0 = ca.pool;
	A(await waitFor(async () => (await cards()).find((c) => c.u === 'alice').pool !== t0, 4000), 'the countdown ticks', t0);
	await bob.page.select('#live-order', 'pool');
	cs = await cards();
	A(cs.map((c) => c.u).join() === 'alice,erin,fred', '"Biggest pools" orders the cards by pool: alice 1,240, erin 60, fred none', cs.map((c) => c.u));
	await bob.page.reload({ waitUntil: 'domcontentloaded' });
	A(await waitFor(async () => (await cards()).map((c) => c.u).join() === 'alice,erin,fred', 10000) && await bob.page.evaluate(() => document.querySelector('#live-order').value === 'pool'), 'the choice is remembered on this device');
	A(await bob.page.evaluate(async () => { const m = await import('/watch/watch.js'); const L = [{ username: 'a', pool: { total: 5, open: false } }, { username: 'b' }, { username: 'c', pool: { total: 5, open: true } }, { username: 'd', pool: { total: 900, open: false } }]; return m.byPool(L).map((f) => f.username).join() === 'd,c,a,b'; }), 'byPool: the largest first, an open one first on a tie, no pool last');
	// the Bet link opens the spectator view with its panel open
	await Promise.all([bob.page.waitForNavigation({ waitUntil: 'domcontentloaded' }), bob.page.evaluate(() => document.querySelector('#live .live[data-user="alice"] a.bet').click())]);
	A(/\/scoundrel\/\?spectate=alice&bet=1$/.test(bob.page.url()), 'Bet opens alice\'s Scoundrel spectator view', bob.page.url());
	A(await waitFor(() => bob.page.evaluate(() => !!document.querySelector('#bets-panel .bm-o')), 20000), 'with the bet panel open on its own (no click on the chip)', await bob.page.evaluate(() => ({ chip: !!document.getElementById('bets-chip'), panel: !!document.getElementById('bets-panel') })));
	A(await bob.page.evaluate(() => /pool 1,240/.test(document.querySelector('#bets-panel').textContent)), 'the panel shows the same pool (1,240 ★)');
	const plain = await open('bob', '/scoundrel/?spectate=alice');
	await waitFor(() => plain.page.evaluate(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none'; }), 20000);
	await sleep(800);
	A(await plain.page.evaluate(() => !document.getElementById('bets-panel') && !!document.getElementById('bets-chip')), 'the plain Watch link still opens with the panel shut (its chip only)');
	await plain.close();

	// ===== 5. TV mode =====
	const tvp = await open('bob', '/watch/?tvbase=1500');
	await waitFor(() => tvp.page.evaluate(() => document.querySelectorAll('#live .live').length === 3), 10000);
	await tvp.page.click('#tv-open');
	const tvs = () => tvp.page.evaluate(() => window.__watch.tv.state());
	A(await waitFor(async () => { const s = await tvs(); return s.open && s.n === 3 && !!s.cur; }, 8000), 'TV mode opens', await tvs());
	const first = await tvs();
	A(first.cur === 'alice:scoundrel', 'the bigger pool comes first (alice\'s 1,240 ★, betting open)', first);
	A(await tvp.page.evaluate(() => /★ Big pool · 1,240 ★ riding · 2 bettors · alice wins 900 \/ loses 340 · betting open/.test(document.querySelector('#tv-now').textContent)), 'its overlay shows the pool', await tvp.page.evaluate(() => document.querySelector('#tv-now').textContent));
	A(first.dwell > 1500 * 1.7, 'a big pool open for betting lingers longer than the base time', first.dwell);
	A(await tvp.page.evaluate(async () => {
		const m = await import('/watch/watch.js');
		const big = { username: 'a', label: 'Turn 2', watchers: 0, pool: { total: 1240, open: true } }, small = { username: 'b', label: 'Turn 2', watchers: 0, pool: { total: 60, open: true } };
		const none = { username: 'c', label: 'Turn 2', watchers: 0 }, close = { username: 'd', label: 'Final round', watchers: 0 }, shut = { username: 'e', label: 'Turn 2', watchers: 0, pool: { total: 1240, open: false } };
		const order = m.tvOrder([none, close, small, shut, big]).map((f) => f.username).join();
		const d = (f) => m.tvDwellMs(f, 1000);
		return order === 'a,b,d,e,c' && d(big) > d(small) && d(small) > d(none) && d(big) <= 2500 && m.tvDwellMs({ label: 'final', watchers: 99, pool: { total: 1e9, open: true } }, 1000) <= 2500;
	}), 'the weighting: open + bigger first (1,240 > 60 > a close-sounding game > a closed pool > none); bigger pools linger longer, capped');
	await tvp.page.keyboard.press('KeyX');

	// ===== 3b. closed on the page =====
	await pub('alice', 'scoundrel', 'a-run-2', 2, 'Dungeon 2');
	const bob2 = await open('bob', '/watch/');
	A(await waitFor(() => bob2.page.evaluate(() => { const e = document.querySelector('#live .live[data-user="alice"]'); return !!e && /1,240 ★ riding · 2 bettors · alice wins 900 \/ loses 340 · betting closed$/.test(e.querySelector('.pool-text').textContent) && !e.querySelector('a.bet'); }), 10000), 'past its milestone the card says "betting closed" and has no Bet link');

	const errs = [...bob2.errors, ...tvp.errors].filter((e) => !/Failed to fetch|NetworkError|AbortError/.test(e));
	A(!errs.length, 'no page errors on the Watch page', errs.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
// ===== 6. the overworld: a Battle Frontier run's pool, found by the player's betcur: pointer (no state row read) =====
try {
	const hana = (await call('register', { username: 'hana', password: 'watch-pools-pass' })).token;
	tok.hana = hana;
	await friends('bob', 'hana'); await friends('carol', 'hana');
	setRow('stars:hana', { rev: 1, e: { seedhana: 5000 }, s: {}, at: 1 });
	await call('publish-factory', { snapshot: { kind: 'battle', facility: 'Battle Tower', v: 0 }, label: 'Battle Tower', seq: 0 }, hana);   // (her broadcast is on)
	await call('heartbeat', { map: 'MAP_BATTLE_FRONTIER_BATTLE_TOWER_LOBBY', x: 3, y: 4, facing: 'down', status: 'factory:Battle Tower', region: 'Battle Tower' }, hana);   // (live: in a Frontier facility)
	await call('factory-state', { username: 'hana' }, tok.carol);   // (carol watches: the run's report is written)
	await call('publish-factory', { snapshot: { kind: 'battle', facility: 'Battle Tower', v: 1 }, label: 'Battle Tower', seq: 1, bet: { run: 'tower1', prog: 0, md: 'frontier', el: 0 } }, hana);
	const MH = await marketOf('carol', 'hana', 'overworld');
	A(MH && MH.id === 's:overworld:hana:tower1', "carol opens a market on hana's Battle Tower run", MH);
	A(MH && (await place('carol', MH.id, 'win', 300)).ok, 'carol bets 300 that hana wins 7 in a row');
	spy.on = true; spy.reads = []; spy.writes = [];
	const live = await lf();
	spy.on = false;
	const h = live.find((f) => f.username === 'hana');
	A(h && h.kind === 'factory' && h.pool && h.pool.total === 300 && h.pool.open && h.pool.outcomes[0].label === 'hana wins 7 in a row', "bob's list: hana's Frontier run with its 300 ★ pool, open", h);
	A(spy.writes.length === 0 && spy.reads.filter((k) => k.startsWith('betm:')).length <= live.length, 'still no writes, at most one market row per live friend', { w: spy.writes, r: spy.reads.filter((k) => /^bet/.test(k)) });
} catch (e) { fail++; console.log('FAIL: overworld section threw ' + (e && e.stack || e)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
