// bets_goods_e2e_test.mjs — "Bet something else" in the bet widget (site/bets.js; owner, 2026-11-19: anything tradeable is
// bettable, at its star value, sold to the bank, winners paid in stars), end to end: the REAL server (server/mp.mjs bundled
// over node:sqlite) behind a static server and headless browsers. alice plays Pocket Enhanced against the computer; bob,
// her friend, watches with 1000 stars, 2 Charizard ex ◆◆◆◆ in his Pocket collection and an overworld game on his device.
//   1. bob backs an outcome, opens "Bet something else…", sees his Charizard at 8,000 ★ each, puts one up and bets it:
//      it leaves his collection once, the pool is 8,000 ★, and his panel says what was bet ("sold to the bank")
//   2. he raises with a Master Ball from his overworld game (the Overworld tab; his key item is not offered): this page
//      takes it out of the save on his device (the Inventory's hand-over, under its bet journal), sends the save to his
//      account at a higher revision, and only then is the bet confirmed (+500 ★)
//   3. the match plays out; the winners are paid in STARS, and every wallet plus every thing's worth adds up
//   node overworld/tests/bets_goods_e2e_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as W from '../../site/stars.js';
import { newCollection } from '../../pocketenhanced/js/collection.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8713;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-betsgoods-e2e-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
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
// (another session may be running a test on this port: wait for it rather than take another)
for (let i = 0; ; i++) { try { await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }); break; } catch (e) { if (i > 40) throw e; await sleep(3000); } }

const NAMES = ['alice', 'bob', 'carol'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets-goods-e2e' })).token;
for (const n of ['bob', 'carol']) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const CZ = 'A1-036', CZV = 8000, MBV = 500;
{ const col = newCollection(); col.prints[CZ] = 2; setRow('pkcol:bob', { rev: 1, col, ids: [] }); }
const MON = (name, level) => ({ speciesId: name.toLowerCase(), name: name.toUpperCase(), level, curHP: 20, maxHP: 20, moves: [{ id: 'tackle', pp: 35, maxPp: 35 }], num: 25 });
const BOBSAVE = { magepunk_party_v1: JSON.stringify([MON('Pikachu', 20), MON('Eevee', 9)]), magepunk_box_v1: '[]', magepunk_bag_v1: JSON.stringify({ masterball: 3, itemfinder: 1 }), magepunk_money: '0', magepunk_coins_v1: '0', magepunk_ow_rev: '4', magepunk_region: 'KANTO' };
const bal = n => W.balance(row('stars:' + n));
const pkHas = id => (row('pkcol:bob').col.prints || {})[id] || 0;
const stateOf = async (n) => (await call('state', {}, tok[n])).state || { username: n };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, save = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tk, st, sv) => {
			try {
				if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
				localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				for (const [k, v] of Object.entries(sv)) localStorage.setItem(k, v);
			} catch { /* ignore */ }
		}, tok[who], st, save);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, close: () => ctx.close() };
	};
	const pocketReady = (page) => waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	const panelText = (page) => page.evaluate(() => (document.querySelector('#bets-panel') || {}).textContent || '');

	const alice = await open('alice', '/pocketenhanced/?seed=betsgoods');
	A(await pocketReady(alice.page), 'alice: Pocket Enhanced ready');
	await alice.page.evaluate(async () => { const P = window.__pocket; P.fast(); P.start({ players: 2, starter: 'charizard' }); const { nextAction } = await import('/pocketenhanced/js/ai.js'); P.act(nextAction(P.engine.view(P.state(), 0))); });
	A(await waitFor(() => !!row('pocketstate:alice') && !!row('pocketstate:alice').bet, 15000), "alice's match is published");
	const bob = await open('bob', '/pocketenhanced/?spectate=alice', BOBSAVE);
	A(await pocketReady(bob.page), 'bob watches alice (with an overworld game on his device)');
	const P = bob.page;
	A(await waitFor(() => P.evaluate(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none'; }), 20000), 'the Bets chip');
	await P.click('#bets-chip');
	A(await waitFor(() => P.evaluate(() => !!document.querySelector('#bets-panel .bm-o[data-k="win"]')), 10000), 'the panel opens');
	await P.click('#bets-panel .bm-o[data-k="win"]');
	const mid = await P.evaluate(() => document.querySelector('#bets-panel .bm-o[data-k="win"]').dataset.m);

	// ===== 1. a Pocket card =====
	await P.click(`#bets-panel .bm-goods[data-m="${mid}"]`);
	A(await waitFor(() => P.evaluate(() => !!document.querySelector('#bets-panel .bm-gtab[data-tab="pk"]') && !/Looking at/.test(document.querySelector('#bets-panel .bm-gd').textContent)), 15000), '"Bet something else…" opens the picker on what he holds');
	await P.click('#bets-panel .bm-gtab[data-tab="pk"]');
	const czRow = `#bets-panel .bm-gpm[data-key="pk:${CZ}"][data-d="1"]`;
	A(await waitFor(() => P.evaluate((s) => { const b = document.querySelector(s); return !!b && /Charizard ex ◆◆◆◆/.test(b.closest('.bm-gr').textContent) && /8,000 ★ each/.test(b.closest('.bm-gr').textContent); }, czRow), 8000), 'the Pocket tab lists his Charizard ex ◆◆◆◆ at 8,000 ★ each', await panelText(P));
	await P.click(czRow);
	A(await waitFor(() => P.evaluate(() => /Worth 8,000 ★/.test(document.querySelector('#bets-panel .bm-gsum').textContent) && /sold to the bank/.test(document.querySelector('#bets-panel .bm-gsum').textContent)), 5000), 'one put up: "Worth 8,000 ★", and it says they are sold to the bank');
	await P.click(`#bets-panel .bm-gplace[data-m="${mid}"]`);
	A(await waitFor(() => { const m = row('betm:' + mid); return m && m.stakes.bob && m.stakes.bob.stars === CZV; }, 15000) && pkHas(CZ) === 1 && bal('bob') === 1000, 'Bet these: the stake is 8,000 ★, one Charizard left his collection, his stars are untouched', row('betm:' + mid));
	A(await waitFor(() => P.evaluate(() => { const t = document.querySelector('#bets-panel').textContent; return /Your bet: 8,000 ★/.test(t) && /Sold to the bank for 8,000 ★/.test(t) && /Charizard ex ◆◆◆◆ \(8,000 ★\)/.test(t); }), 10000), 'his panel: "Your bet: 8,000 ★", "Sold to the bank for 8,000 ★: Charizard ex ◆◆◆◆ (8,000 ★)"', await panelText(P));

	// ===== 2. an overworld item, through the hand-over =====
	await P.click(`#bets-panel .bm-goods[data-m="${mid}"]`);
	await waitFor(() => P.evaluate(() => !!document.querySelector('#bets-panel .bm-gtab[data-tab="ow"]') && !/Looking at/.test(document.querySelector('#bets-panel .bm-gd').textContent)), 15000);
	await P.click('#bets-panel .bm-gtab[data-tab="ow"]');
	const mbRow = '#bets-panel .bm-gpm[data-key="item:masterball"][data-d="1"]';
	A(await waitFor(() => P.evaluate((s) => !!document.querySelector(s), mbRow), 10000), 'the Overworld tab (no game open, his save up to date) lists his Master Balls', await panelText(P));
	A(await P.evaluate(() => !document.querySelector('#bets-panel [data-key="item:itemfinder"]')), 'his key item (the Itemfinder) is not offered');
	await P.click(mbRow);
	await P.click(`#bets-panel .bm-gplace[data-m="${mid}"]`);
	A(await waitFor(() => { const m = row('betm:' + mid); return m && m.stakes.bob && m.stakes.bob.stars === CZV + MBV; }, 20000), 'the bet is raised by the Master Ball\'s 500 ★ once his game has handed it over', row('betm:' + mid) && row('betm:' + mid).stakes);
	const dev = await P.evaluate(() => ({ bag: JSON.parse(localStorage.getItem('magepunk_bag_v1')), rev: +localStorage.getItem('magepunk_ow_rev'), journal: JSON.parse(localStorage.getItem('magepunk_bet_journal_v1') || '{}') }));
	const owRow = row('ow:bob'), acctBag = owRow && owRow.ow && JSON.parse(owRow.ow.magepunk_bag_v1 || '{}');
	A(dev.bag.masterball === 2 && dev.bag.itemfinder === 1 && dev.rev > 4 && !Object.keys(dev.journal).length, 'his device\'s save has 2 Master Balls left, its revision stepped, the bet journal clear', dev);
	A(acctBag && acctBag.masterball === 2, 'the save went to his account with the ball out of it', owRow);
	A(await waitFor(() => P.evaluate(() => /Master Ball \(500 ★\)/i.test(document.querySelector('#bets-panel').textContent)), 10000), 'his panel lists the Master Ball (500 ★) too', await panelText(P));

	// ===== 3. settling in stars =====
	A((await call('bet-place', { id: mid, o: 'lose', n: 100, bid: 'carolbet01' }, tok.carol)).ok, 'carol bets 100 stars that alice loses');
	const T0 = bal('bob') + bal('carol') + CZV + MBV + 100;   // (the two wallets + the pool, after the bets)
	const end = await alice.page.evaluate(async () => {
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		const P2 = window.__pocket, sl = (ms) => new Promise((r) => setTimeout(r, ms));
		for (let i = 0; i < 40000; i++) {
			const S = P2.state(); if (!S || S.over) return 'over';
			const mine = (S.pending && S.pending.seat === 0) || (!S.pending && S.current === 0) || (S.phase === 'setup' && !S.players[0].setup);
			if (!mine) { await sl(5); continue; }
			const banned = new Set(); let ok = false;
			for (let t = 0; t < 40 && !ok; t++) { const a = nextAction(P2.engine.view(P2.state(), 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; ok = P2.act(a); if (!ok) banned.add(JSON.stringify(a)); }
			if (!ok) return 'stuck';
		}
		return 'long';
	});
	const won = await alice.page.evaluate(() => window.__pocket.view().over.winner === 0);
	A(end === 'over', `the match plays out (alice ${won ? 'won' : 'lost'})`, end);
	A(await waitFor(() => { const m = row('betm:' + mid); return m && m.end; }, 20000), 'the market settles');
	const pool = CZV + MBV + 100;
	A(won ? bal('bob') === 1000 + pool && bal('carol') === 900 : bal('bob') === 1000 && bal('carol') === 900 + pool, won ? `alice won: bob is paid the pool, ${pool} ★, in stars` : `alice lost: carol is paid the pool, ${pool} ★, in stars`, { bob: bal('bob'), carol: bal('carol') });
	A(pkHas(CZ) === 1, 'his Charizard stays sold (one left)');
	A(bal('bob') + bal('carol') === T0 && markets().filter(m => !m.end).length === 0, 'every star accounted for');
	A(alice.errors.length === 0 && bob.errors.length === 0, 'no page errors', [...alice.errors, ...bob.errors]);
	await alice.close(); await bob.close();
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
