// pocketenhanced_site_test.mjs — Pocket Enhanced on the rest of the site:
//   1. the design wiki's page (#/pocket-enhanced): its numbers and tables are the game's own (LIMITS, the type chart
//      from matchup(), the pack odds, the exchange, every booster); the sidebar link; no overflow on a phone
//   2. the profile page: a Pocket Enhanced section read from the account's collection (and "no cards yet" without one);
//      the page asks the server only to READ it
//   3. the bug report form offers Pocket Enhanced as an area, and the server keeps that area
//   4. the Battlecards learn page points to Pocket Enhanced's own teaching
//   node overworld/tests/pocketenhanced_site_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9581;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const E = await imp('pocketenhanced/js/engine/engine.js'), T = await imp('pocketenhanced/js/engine/types.js'), C = await imp('pocketenhanced/js/collection.js'), D = await imp('pocketenhanced/js/data/cards.js');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const STATE = { username: 'sitetester', friendCode: 'SITE01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
let pkcol = null; const asked = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch { }
		asked.push(b.action);
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'pkcol-get') return res.end(JSON.stringify({ rev: pkcol ? 3 : 0, col: pkcol, ids: [] }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], rows: [], gifts: [], messages: [] }));
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'site-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);

	// ===== 1. the design wiki =====
	await page.goto(`http://localhost:${PORT}/designwiki/#/pocket-enhanced`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pk-wiki-boosters')), 30000), 'the wiki page opens');
	const w = await page.evaluate(() => {
		const rows = sel => [...document.querySelectorAll(sel + ' tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
		return { text: document.getElementById('content').innerText, chart: rows('.pk-wiki-chart'), odds: rows('.pk-wiki-odds'), exch: rows('.pk-wiki-exchange'), boosters: rows('.pk-wiki-boosters'),
			nav: !!document.querySelector('nav a[href="#/pocket-enhanced"]'), play: !!document.querySelector('#content a[href="../pocketenhanced/"]') };
	});
	const L = E.LIMITS;
	A(w.text.includes(`${L.deck} cards, at most ${L.copies} of a name`) && w.text.includes(`${L.actives} Active slots and ${L.bench} Bench slots`) && w.text.includes(`for ${L.players[0]} to ${L.players[1]} players`) && w.text.includes(`${D.CARDS.length.toLocaleString()} cards`), "the match rules are stated with the engine's own limits and the card list's own size");
	A(w.chart.length === T.COMBAT_TYPES.length && T.COMBAT_TYPES.every((a, i) => w.chart[i][0] === a && w.chart[i][1] === (T.COMBAT_TYPES.filter(d => T.matchup(a, d) > 0).join(', ') || '—') && w.chart[i][2] === (T.COMBAT_TYPES.filter(d => T.matchup(a, d) < 0).join(', ') || '—')), `the type chart has all ${T.COMBAT_TYPES.length} types, each row the game's own matchups`);
	A(w.chart.find(r => r[0] === 'Fire')[1] === 'Grass, Ice, Bug, Steel' && w.chart.find(r => r[0] === 'Electric')[3] === 'Ground' && w.text.includes('+20 damage') && w.text.includes('-20 damage'), '(Fire is super effective into Grass, Ice, Bug and Steel; Electric into Ground is neutral; +20 and -20)');
	A(w.odds.length === Object.keys(C.SLOT_ODDS[5]).length && w.odds[0][1] === '90%' && w.odds[0][2] === '60%' && w.exch.length === Object.keys(C.EXCHANGE).length && w.exch.every(r => C.EXCHANGE[Object.keys(C.RARITY).find(k => C.RARITY[k] === r[0])] === +r[1]), "the pack odds and the exchange prices are the game's", [w.odds[0], w.exch]);
	A(w.boosters.length === C.BOOSTERS.length && C.BOOSTERS.every((x, i) => w.boosters[i][0] === x.name && w.boosters[i][1] === x.set), `every booster is listed (${C.BOOSTERS.length})`);
	A(w.nav && w.play, 'the sidebar links to the page, and the page to the game');
	await page.setViewport({ width: 390, height: 800 }); await sleep(300);
	A(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'on a phone the page does not overflow sideways', String(await page.evaluate(() => document.documentElement.scrollWidth)));
	await page.setViewport({ width: 1200, height: 900 });

	// ===== 2. the profile =====
	asked.length = 0;
	await page.goto(`http://localhost:${PORT}/profile/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => /No cards yet/.test(document.getElementById('pocket-stats')?.textContent || '')), 20000), 'a player with no Pocket Enhanced collection: "No cards yet", with a link to play');
	const start = C.newCollection(), mine = { ...start, opened: 4, packs: 2, prints: { ...start.prints, 'A1-036': 1 } };
	pkcol = mine;
	await page.reload({ waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => document.querySelectorAll('#pocket-stats .stat').length === 4), 30000), 'with a collection: four figures');
	const tiles = await page.evaluate(() => [...document.querySelectorAll('#pocket-stats .stat .v')].map(x => x.textContent));
	const clean = C.cleanCollection(mine), total = Object.values(clean.prints).reduce((a, b) => a + b, 0);
	A(tiles[0] === C.uniqueOwned(clean).toLocaleString() && tiles[1] === total.toLocaleString() && tiles[2] === '4' && tiles[3] === '2', 'different cards, total copies, packs opened and unopened, from the account', tiles);
	A(asked.includes('pkcol-get') && !asked.some(a => /^pk.*-put$/.test(a || '')), 'the profile only reads the collection', asked.filter(a => /^pk/.test(a || '')));

	// ===== 3. bug reports =====
	await page.goto(`http://localhost:${PORT}/bugs/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => [...document.querySelectorAll('#area option')].some(o => o.value === 'pocketenhanced' && o.textContent === 'Pocket Enhanced')), 10000), 'the bug report form offers Pocket Enhanced');
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'latin1');
	A(/\['overworld', 'battlecards', 'pocketenhanced', 'site'\]\.includes\(body\.area\)/.test(src), 'and the server keeps that area (it used to file any other area as "overworld")');

	// ===== 4. the learn page =====
	await page.goto(`http://localhost:${PORT}/learnmagepunk/`, { waitUntil: 'domcontentloaded' });
	A(await page.evaluate(() => { const p = document.querySelector('.pk-pointer'); return !!p && !!p.querySelector('a[href="/pocketenhanced/"]') && !!p.querySelector('a[href="/designwiki/#/pocket-enhanced"]'); }), "the learn page points to Pocket Enhanced's own teaching and its wiki page");
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
