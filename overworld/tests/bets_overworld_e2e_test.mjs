// bets_overworld_e2e_test.mjs — spectator bets in the OVERWORLD, end to end (owner, 2026-11-19: stars, a parimutuel pool,
// no limit, every kind of game; never on your own game or as a player; friends only). The REAL server (server/mp.mjs
// bundled over node:sqlite) behind a static server; headless Chrome, one browser context per account. alice plays; bob,
// carol and erin are her friends with 1000 stars each.
//   1. a WILD battle: bob watches it in the battle viewer (/overworld/?watchfactory=alice, factoryspec.js), the Bets chip
//      is there (a DOM overlay over the canvas, like the chat), he backs "alice wins" with the panel's own buttons; carol
//      bets against; alice's screen says "★ N riding on this game"; she wins and her page's last push settles it
//   2. a TRAINER battle lost (her page reports the blackout): the bettors against her take the pool
//   3. an ESCAPE: carol, following alice (/overworld/?follow=alice, ow_follow.js), bets through the chip; alice runs away:
//      every stake back
//   4. VOLTORB FLIP: carol (still following) bets "clears the level"; alice clears the board: carol takes the pool
//   5. a LIVE battle between alice and bob: erin watches it in the PvP view (pvp.js), bets on alice with the chip; the
//      players are refused; bob forfeits on the server and the MATCH ROW settles it
//   6. every star accounted for
//   node overworld/tests/bets_overworld_e2e_test.mjs
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
const PORT = 8931;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(200); } return false; }

const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets3-e2e-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.11.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const markets = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.12.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	if (u === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>blank</title>'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (other sessions may run tests on this port: wait for it rather than fail)
for (let i = 0; ; i++) {
	try { await new Promise((ok, no) => { server.once('error', no); server.listen(PORT, ok); }); break; } catch (e) { if (i >= 30) throw e; console.log('(port ' + PORT + ' busy: waiting)'); await sleep(10_000); }
}

const NAMES = ['alice', 'bob', 'carol', 'erin'];
const BETTORS = ['bob', 'carol', 'erin'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets3-e2e-pass' })).token;
for (const n of BETTORS) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const bal = n => W.balance(row('stars:' + n));
const total = () => NAMES.reduce((a, n) => a + bal(n), 0) + markets().filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
const T0 = total();
let bidN = 0; const bid = () => 'owbetbid' + (++bidN).toString().padStart(4, '0');
const stateOf = async (n) => (await call('state', {}, tok[n])).state || { username: n };
const PARTY = [{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }];
const STORY = JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} });
const mon = (name) => ({ name, speciesId: name.toLowerCase(), level: 20, curHP: 50, maxHP: 50, types: ['Normal'], stats: { hp: 50, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], status: null, sprite: 's133.png' });

let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	/** A signed-in page of `who`'s, with a game save on the device (a viewer page never touches it). */
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
		page.on('pageerror', (e) => errors.push(who + ' pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tk, st) => { try { localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_sfx_muted', '1'); } catch { } }, tok[who], st);
		await page.goto(`http://localhost:${PORT}/blank.html`);
		await page.evaluate((party, story) => { localStorage.setItem('magepunk_region', 'HOENN'); localStorage.setItem('magepunk_story', story); localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_pos_v1', JSON.stringify({ map: 'Route101', x: 10, y: 10 })); }, PARTY, STORY);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, E: (fn, ...a) => page.evaluate(fn, ...a) };
	};
	/** Open the Bets panel by its chip, pick outcome k, type n, press Place. -> the market id */
	const betByWidget = async (page, k, n, re = /./, ms = 40000) => {
		if (!(await waitFor(() => page.evaluate((k, re) => { const c = document.getElementById('bets-chip'); if (!document.getElementById('bets-panel')) { if (!c || c.style.display === 'none') return false; c.click(); } return [...document.querySelectorAll('#bets-panel .bm-o')].some(x => x.dataset.k === k && !x.disabled && new RegExp(re).test(x.dataset.m)); }, k, re.source), ms))) return 'no open market with ' + k + ' ' + JSON.stringify(await page.evaluate(async () => { const B = await import('/site/bets.js'); return { st: B.state().markets.map(m => [m.id, m.open, m.can, m.why]), btn: [...document.querySelectorAll('#bets-panel .bm-o')].map(x => [x.dataset.k, x.disabled]) }; }));
		const mid = await page.evaluate((k, re) => { const b = [...document.querySelectorAll('#bets-panel .bm-o')].find(x => x.dataset.k === k && !x.disabled && new RegExp(re).test(x.dataset.m)); b.click(); return b.dataset.m; }, k, re.source);
		await page.click(`#bets-panel .bm-amt[data-m="${mid}"]`);
		await page.keyboard.type(String(n));
		await page.click(`#bets-panel .bm-place[data-m="${mid}"]`);
		await waitFor(() => { const m = row('betm:' + mid); return m && m.stakes && Object.keys(m.stakes).length; }, 8000);
		await page.evaluate(() => { const x = document.querySelector('#bets-panel .bm-x'); if (x) x.click(); });   // (closed again: the view underneath gets its keys back)
		return mid;
	};
	const marketOf = (pred) => markets().find(pred);

	// ===== alice plays =====
	const alice = await open('alice', '/overworld/index.html');
	A(await waitFor(() => alice.E(() => !!(window.__ow && window.__ow.world?.current?.layout && window.__ow.friends && window.__ow.friends.some(f => f.username === 'bob'))), 60000), 'alice\'s game boots signed in, her friends listed');
	const clearA = () => alice.E(() => { const o = window.__ow; for (let i = 0; i < 30 && o.dialog.blocking; i++) o.dialog.key('x'); if (o.cutscene.blocking) o.cutscene.stop(); });
	await clearA();

	// ===== 1. a wild battle, in the battle viewer =====
	const bob = await open('bob', '/overworld/index.html?watchfactory=alice&mp=1');
	A(await waitFor(() => bob.E(() => !!(window.__ow && window.__ow.factorySpec && window.__ow.factorySpec.active)), 60000), 'bob opens the battle viewer on alice');
	await alice.E(() => window.__ow.startWildBattle({ id: 'zigzagoon', level: 5 }));
	await waitFor(() => alice.E(() => { const a = window.__ow.battle.active; return !!(a && a.me && a.foe); }), 15000);
	const mid1 = await betByWidget(bob.page, 'win', 70);
	A(/^s:overworld:alice:b/.test(String(mid1)) && row('betm:' + mid1)?.stakes?.bob?.stars === 70 && bal('bob') === 930, 'bob, in the battle viewer, opens Bets from its chip and backs "alice wins" with 70 stars', { mid1, m: row('betm:' + mid1) });
	A(row('betm:' + mid1)?.outcomes?.map(o => o.label).join() === 'alice wins,alice loses', 'the market: "alice wins" / "alice loses"', row('betm:' + mid1)?.outcomes);
	A((await call('bet-place', { id: mid1, o: 'lose', n: 30, bid: bid() }, tok.carol)).ok, 'carol bets 30 that alice loses');
	A(/own game/.test((await call('bet-place', { id: mid1, o: 'win', n: 5, bid: bid() }, tok.alice)).error || ''), 'alice cannot bet on her own battle');
	A(await waitFor(() => alice.E(() => /100 riding on this game/.test((document.getElementById('bets-riding') || {}).textContent || '')), 20000), 'alice sees "★ 100 riding on this game"');
	await alice.E(() => window.__ow.battle.finish('victory'));
	A(await waitFor(() => row('betm:' + mid1)?.end, 20000), 'she wins: her page\'s last push reports it and the market settles', row('betm:' + mid1));
	A(row('betm:' + mid1).end.result === 'win' && bal('bob') === 1030 && bal('carol') === 970 && total() === T0, 'bob takes the pool of 100; nothing made or lost', { end: row('betm:' + mid1).end, bob: bal('bob'), carol: bal('carol') });
	A(await waitFor(() => bob.E(() => { if (!document.getElementById('bets-panel')) document.getElementById('bets-chip')?.click(); return /\+100/.test((document.querySelector('#bets-panel .bm-res') || {}).textContent || ''); }), 20000), 'bob\'s panel shows his payout', await bob.E(() => (document.querySelector('#bets-panel') || {}).textContent || ''));
	await bob.E(() => { const x = document.querySelector('#bets-panel .bm-x'); if (x) x.click(); });
	await waitFor(() => alice.E(() => !window.__ow.battle.active), 10000); await clearA();
	A(await waitFor(() => alice.E(() => { const r = document.getElementById('bets-riding'); return !r || r.style.display === 'none'; }), 10000), 'with the battle over her badge goes');

	// ===== 2. a trainer battle lost =====
	await alice.E(async () => { const F = await import('./frontier.js'); const foe = F.genTeam(window.__ow.battle.data, 12, 1); window.__ow.battle.startTrainer(window.__ow.party, foe, { displayName: 'YOUNGSTER JOEY', defeatText: '', money: 0 }, () => { }); });
	await waitFor(() => alice.E(() => { const a = window.__ow.battle.active; return !!(a && a.me && a.foe && a.isTrainer); }), 15000);
	A(await waitFor(() => row('owbet:alice')?.bet?.md === 'trainer', 25000), 'a trainer battle: bob is watching, so its report is written (kind trainer)', row('owbet:alice'));
	const mid2 = 's:overworld:alice:' + row('owbet:alice').bet.run;
	await call('bet-get', { game: 'overworld', runner: 'alice' }, tok.erin);
	A((await call('bet-place', { id: mid2, o: 'win', n: 40, bid: bid() }, tok.erin)).ok && (await call('bet-place', { id: mid2, o: 'lose', n: 10, bid: bid() }, tok.carol)).ok, 'erin backs her for 40, carol against for 10');
	await alice.E(() => window.__ow.battle.finish('defeat'));
	A(await waitFor(() => row('betm:' + mid2)?.end, 20000) && row('betm:' + mid2).end.result === 'lose' && bal('carol') === 1010 && bal('erin') === 960 && total() === T0, 'she blacks out: carol takes 50', row('betm:' + mid2)?.end);
	await waitFor(() => alice.E(() => !window.__ow.battle.active), 10000); await clearA();
	await bob.E(() => window.__ow.factorySpec.quit());
	A(await waitFor(() => bob.E(() => !document.getElementById('bets-chip') || document.getElementById('bets-chip').style.display === 'none'), 5000), 'bob leaves the viewer: the chip goes with it');

	// ===== 3. an escape, followed =====
	const carol = await open('carol', '/overworld/index.html?follow=alice');
	A(await waitFor(() => carol.E(() => { const v = window.__owFollow && window.__owFollow.view; return !!(v && v.map); }), 60000), 'carol follows alice (live follow)');
	A(await waitFor(() => alice.E(async () => (await import('./ow_worldcast.js')).worldCast.watchers >= 1), 25000), 'alice\'s page knows she is followed');
	await sleep(3000);
	A(!(await carol.E(() => { const c = document.getElementById('bets-chip'); return !!c && c.style.display !== 'none' && c.classList.contains('live'); })), 'walking about: nothing open to bet on (at most the result of the last battle, which goes after a minute)');
	await alice.E(() => window.__ow.startWildBattle({ id: 'wurmple', level: 4 }));
	await waitFor(() => alice.E(() => { const a = window.__ow.battle.active; return !!(a && a.me && a.foe); }), 15000);
	const mid3 = await betByWidget(carol.page, 'win', 25, /^s:overworld:alice:b/);
	A(/^s:overworld:alice:b/.test(String(mid3)) && mid3 !== mid1 && row('betm:' + mid3)?.stakes?.carol?.stars === 25, 'carol, following, bets 25 on the battle through the chip', { mid3, owbet: row('owbet:alice'), ms: markets().map(m => [m.id, m.closed, m.end && m.end.result]), panel: await carol.E(() => (document.getElementById('bets-panel') || {}).textContent) });
	await call('bet-place', { id: mid3, o: 'lose', n: 15, bid: bid() }, tok.bob);
	const before3 = { carol: bal('carol'), bob: bal('bob') };
	await alice.E(() => window.__ow.battle.finish('escaped'));
	A(await waitFor(() => row('betm:' + mid3)?.end, 20000) && row('betm:' + mid3).end.result === null && bal('carol') === before3.carol + 25 && bal('bob') === before3.bob + 15 && total() === T0, 'she runs away: no result, both stakes back', row('betm:' + mid3)?.end);
	await waitFor(() => alice.E(() => !window.__ow.battle.active), 10000); await clearA();

	// ===== 4. Voltorb Flip, followed =====
	await alice.E(async () => { const G = await import('./ow_gamecorner.js'), V = await import('./voltorbflip.js'); G.vfMenu.open = true; G.vfMenu.game = V.newGame(1); G.vfMenu.cur = 12; });
	const mid4 = await betByWidget(carol.page, 'win', 40, /^s:overworld:alice:v/);
	A(/^s:overworld:alice:v/.test(String(mid4)) && row('betm:' + mid4)?.outcomes?.[0]?.label === 'alice clears the level', 'Voltorb Flip on her screen: carol bets 40 that she "clears the level"', row('betm:' + mid4));
	await call('bet-place', { id: mid4, o: 'lose', n: 20, bid: bid() }, tok.erin);
	const c4 = bal('carol');
	await alice.E(async () => { const G = await import('./ow_gamecorner.js'), V = await import('./voltorbflip.js'); const g = G.vfMenu.game; for (let i = 0; i < 25; i++) if (g.board[i].v > 1) V.flip(g, i); return g.phase; });
	A(await waitFor(() => row('betm:' + mid4)?.end, 20000) && row('betm:' + mid4).end.result === 'win' && bal('carol') === c4 + 60 && total() === T0, 'she clears the board: carol takes the pool of 60', row('betm:' + mid4)?.end);
	await alice.E(async () => { (await import('./ow_gamecorner.js')).vfMenu.open = false; });

	// ===== 5. a live battle between friends, in the PvP view =====
	const erin = await open('erin', '/overworld/index.html?mp=1');
	A(await waitFor(() => erin.E(() => !!(window.__ow && window.__ow.world?.current?.layout)), 60000), 'erin\'s game boots');
	await call('challenge', { to: 'bob', battleType: 'pokemon', party: [mon('PIKACHU')] }, tok.alice);
	const MID = (await call('accept-challenge', { from: 'alice', party: [mon('EEVEE')] }, tok.bob)).matchId;
	await erin.E((id) => window.__ow.enterMatch(id, true), MID);
	A(await waitFor(() => erin.E(() => !!(window.__ow.pvp.active && window.__ow.pvp.active.spectator)), 15000), 'erin watches alice vs bob (the PvP view)');
	const mid5 = await betByWidget(erin.page, 'alice', 50);
	A(mid5 === 'v:' + MID && row('betm:' + mid5)?.stakes?.erin?.stars === 50, 'erin bets 50 on alice with the chip: one outcome per player', { mid5, MID });
	A(/playing in this match/.test((await call('bet-place', { id: mid5, o: 'alice', n: 5, bid: bid() }, tok.bob)).error || '') && /playing in this match/.test((await call('bet-place', { id: mid5, o: 'alice', n: 5, bid: bid() }, tok.alice)).error || ''), 'both players are refused');
	A((await call('bet-place', { id: mid5, o: 'bob', n: 50, bid: bid() }, tok.carol)).ok, 'carol backs bob for 50');
	const e5 = bal('erin');
	await call('match-action', { id: MID, act: { kind: 'forfeit' } }, tok.bob);
	A(row('betm:' + mid5)?.end?.result === 'alice' && bal('erin') === e5 + 100 && total() === T0, 'bob forfeits on the server: the match row settles it, erin takes 100', row('betm:' + mid5)?.end);

	// ===== 6 =====
	A(total() === T0, 'every star accounted for', { T0, now: total() });
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
