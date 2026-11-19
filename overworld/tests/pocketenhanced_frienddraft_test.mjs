// pocketenhanced_frienddraft_test.mjs — Draft with friends (owner's third improvement list, 2026-11-18, "yes to all": "Draft
// with friends. Everyone in a lobby drafts from their own packs, then plays a small bracket with the tournament code").
// server/pocket_pvp.mjs pkpvp-tcreate {draft}, pkpvp-tpool, pkpvp-tdeck; main.js tourDraftHost/tourDraftDeck.
//   1. Play online > Host a draft tournament (a booster): a draft tournament with a code; a friend joins with it, no deck
//      needed; the host cannot start before everyone has built
//   2. each player has their own 8 packs, opened by the server, the same every time; a deck with a card not in your own
//      packs is refused, one from them is kept
//   3. the page: Your packs & deck, Finish this deck, Save my deck: "deck ✓"
//   4. the start: each match is played with the drafted decks; computer players draft legal decks too
//   node overworld/tests/pocketenhanced_frienddraft_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as C from '../../pocketenhanced/js/collection.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8689;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-fdraft-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'server/pocket_pvp.mjs'), 'utf8').match(/PKPVP_PROTOCOL = (\d+)/)[1], ev: E.ENGINE_VERSION };
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const r = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.1.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw }), { MP_DB });
		res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const tok = {};
for (const n of ['ann', 'ben']) { tok[n] = (await call('register', { username: n, password: 'pocket-fdraft-pass' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }

const DR = await import('../../pocketenhanced/js/draft.js');
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	const st = (await call('state', {}, tok.ann)).state;
	await page.evaluateOnNewDocument((t, st) => { try { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true, guided: { tour: 1, draft: 1, event: 1, setrewards: 1, binder: 1, emblems: 1 } })); localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { /* */ } }, tok.ann, st);
	await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e && !e.disabled) { e.click(); return true; } return false; }, k);
	// ===== 1. ann hosts =====
	await click('online'); await sleep(400);
	A(await click('tdhost'), 'Play online: "Host a draft tournament"'); await sleep(300);
	A(await click('tdbC'), '(Charizard packs)');
	const code = await waitFor(() => page.evaluate(() => !!document.querySelector('[data-tcode]')), 8000) && await page.evaluate(() => document.querySelector('[data-tcode]').dataset.tcode);
	A(/^[A-Z2-9]{5}$/.test(code || '') && await page.evaluate(() => /A draft tournament/.test(document.querySelector('.pe-tdraft').textContent)), 'the tournament screen: a draft tournament, with its code', code);
	// ben joins with the code: no deck needed
	const bj = await call('pkpvp-tjoin', { code }, tok.ben);
	const tid = bj.tour && bj.tour.id;
	A(!!tid && bj.tour.draft && bj.tour.draft.booster === 'C', 'ben joins with the code, no deck needed', bj);
	A(/not everyone has built/.test((await call('pkpvp-tstart', { tid }, tok.ann)).error || ''), 'nobody has built: the start is refused');
	// ===== 2. pools =====
	const pa = await call('pkpvp-tpool', { tid }, tok.ann), pb = await call('pkpvp-tpool', { tid }, tok.ben), pa2 = await call('pkpvp-tpool', { tid }, tok.ann);
	A(pa.pool.length === 40 && pb.pool.length === 40 && pa.pool.join() !== pb.pool.join() && pa.pool.join() === pa2.pool.join(), 'each has their own 8 packs (40 cards), the same each time asked');
	// ben: a deck with a card not in his packs is refused; one from his packs is kept
	const bd = DR.poolDeck(pb.pool), stranger = pa.pool.find(id => !pb.pool.includes(id));
	A(/not playable/.test((await call('pkpvp-tdeck', { tid, deck: [...bd.deck.slice(0, 19), stranger], energy: bd.energy }, tok.ben)).error || ''), "a card that is not in his packs: refused");
	A(!!(await call('pkpvp-tdeck', { tid, deck: bd.deck, energy: bd.energy }, tok.ben)).tour, 'a deck from his packs: kept');
	// ===== 3. ann builds hers on the page =====
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="tdeck"]')), 8000) && await click('tdeck'), 'the tournament screen: "Your packs & deck"'); await sleep(600);
	A(await click('dfinish'), 'Finish this deck (from her packs)'); await sleep(300);
	await click('dplay');
	const saved = await waitFor(() => page.evaluate(() => /deck ✓/.test([...document.querySelectorAll('.pe-tour .pe-opt')].find(e => /^ann/.test(e.textContent))?.textContent || '')), 8000);
	A(saved, 'Save my deck: back at the tournament, ann "deck ✓"');
	// ===== 4. the start =====
	A(await click('tstart'), 'the host starts');
	await waitFor(() => page.evaluate(() => window.__pocket.mode === 'online'), 20000);
	const t = row('pktour:' + tid), annP = t.players.find(p => p.name === 'ann');
	const lid = row('pkpvpcur:ann').id, lb = row('pkpvp:' + lid), mine = lb.m.config.players.find(p => p.name === 'ann'), opp = lb.m.config.players.find(p => p.name !== 'ann');
	A(mine.deck.join() === annP.deck.join() && !DR.draftDeckError(pa.pool, mine.deck, mine.energy), "ann's match is played with the deck she drafted", mine.deck.length);
	if (opp.ai) A(!E.deckError(opp.deck, opp.energy), 'a computer player drafted a legal deck too', opp.name);
	else A(opp.deck.join() === bd.deck.join(), "ben plays the deck he drafted");
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
