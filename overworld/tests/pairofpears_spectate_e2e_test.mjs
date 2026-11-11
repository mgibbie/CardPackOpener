// pairofpears_spectate_e2e_test.mjs — a friend watches a live Pair of Pears run, end to end, the way
// Micatro / Scoundrel friend spectating works: the REAL server handler (server/mp.mjs, bundled like the dev
// server, over sqlite) behind a static server, headless browsers:
//   alice plays /pairofpears/ signed in (publisher: publish-pears, presence 'pears:<label>'),
//   bob watches /pairofpears/?spectate=alice (pears-state).
// Asserts bob's table converges on alice's after her moves (the cards, Hearts, Berries, the shop, the
// charms), bob never receives a face-down card's fruit, the watcher badge reaches alice, bob's friends list /
// Live now hub route Watch to /pairofpears/?spectate=alice, a stranger can't watch, and the end of the run
// reaches bob and drops alice off the live list.
//   node overworld/tests/pairofpears_spectate_e2e_test.mjs      (screenshots: PEARS_SHOTS=<dir>)
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
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.PEARS_SHOTS || null;
const PORT = 8659;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pears-e2e-')), 'mp.bundle.mjs');
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
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'pears-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice and bob are friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server actions on their own ----------
{
	const pub = await call('publish-pears', { seq: 1, label: 'Pair of Pears · Level 1', snapshot: { game: 'pears', cards: [], level: 1 } }, tokens.carol);
	A(pub.ok, 'publish-pears accepts a signed-in runner');
	const strangers = await call('pears-state', { username: 'carol' }, tokens.alice);
	A(strangers.error && /friend/.test(strangers.error), "a stranger can't read the run (friends only)", JSON.stringify(strangers));
	const anon = await call('publish-pears', { seq: 1, label: 'x' });
	A(!!anon.error, 'publishing needs an account', JSON.stringify(anon));
	A((await call('micatro-state', { username: 'carol' }, tokens.carol)).snapshot == null && (await call('scoundrel-state', { username: 'carol' }, tokens.carol)).snapshot == null, 'a Pair of Pears run is not a Micatro or Scoundrel run (its own row)');
	const odd = await call('publish-constructor', { seq: 1, label: 'x' }, tokens.carol);
	A(!odd.ok, 'an action naming no game (publish-constructor) is not a broadcast', JSON.stringify(odd));
	await call('publish-pears', { seq: 2, label: 'x', over: true }, tokens.carol);
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, vp = { width: 1600, height: 900, deviceScaleFactor: 1 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { /* ignore */ }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 30000);
	const sig = (page) => page.evaluate(() => {
		const v = window.__pears.view();
		if (!v || !v.cards) return null;
		return JSON.stringify({ l: v.level, ph: v.phase, h: v.hearts, b: v.berries, p: v.pairs, c: v.cards.map((c) => [c.id, !!c.up, !!c.m, c.fruit || '']), ch: v.charms.map((c) => (c ? c.id : '')), held: v.held && v.held.id, o: (v.offers || []).map((o) => (o ? o.kind + (o.id || o.cond || '') : '-')) });
	});
	const drawn = (page) => page.evaluate(() => [...document.querySelectorAll('.cards-layer .card')].filter((e) => getComputedStyle(e).pointerEvents !== 'none').map((e) => +e.dataset.id).sort((a, b) => a - b).join(','));
	const hiddenFruitLeak = (page) => page.evaluate(() => (window.__pears.view() || { cards: [] }).cards.some((c) => !c.up && !c.m && c.fruit));

	// alice starts a run (signed in)
	const alice = await open('alice', '/pairofpears/');
	A(await ready(alice.page), 'alice: game ready (signed in)');
	await alice.page.evaluate(() => window.__pears.newRun());
	await waitFor(() => alice.page.evaluate(() => !!window.__pears.view()), 5000);
	const live = await waitFor(async () => {
		const r = await call('live-friends', {}, tokens.bob);
		return (r.live || []).some((f) => f.username === 'alice' && f.kind === 'pears' && f.label === 'Pair of Pears · Level 1');
	}, 10000);
	A(live, "bob's live-friends lists alice with kind 'pears' and her label 'Pair of Pears · Level 1'");
	const fr = await call('friends', {}, tokens.bob);
	const af = (fr.friends || []).find((f) => f.username === 'alice');
	A(af && af.status === 'pears:Pair of Pears · Level 1', "alice's presence status is 'pears:Pair of Pears · Level 1' (the top bar's Friends tab)", JSON.stringify(af));
	A(!((await call('live-friends', {}, tokens.carol)).live || []).some((f) => f.username === 'alice'), "a stranger's live list doesn't show alice");

	// bob watches
	const bob = await open('bob', '/pairofpears/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	const conv = async (label) => {
		const target = await sig(alice.page);
		const ok = await waitFor(async () => (await sig(bob.page)) === target, 15000);
		A(ok, `bob converges on alice's table: ${label}`, ok ? '' : `\n   alice ${target}\n   bob   ${await sig(bob.page)}`);
		const cardsOk = await waitFor(async () => (await drawn(bob.page)) === (await drawn(alice.page)), 6000);
		A(cardsOk, `bob's table draws the same cards as alice's: ${label}`, cardsOk ? '' : (await drawn(alice.page)) + ' vs ' + (await drawn(bob.page)));
		A(!(await hiddenFruitLeak(bob.page)), `bob never gets a face-down card's fruit: ${label}`);
	};
	await conv('the first deal');
	A(await bob.page.evaluate(() => /Watching/.test(document.body.innerText) && /alice/.test(document.querySelector('.pp-banner').textContent) && !document.querySelector('.menu-modal')), 'the spectator shows a "Watching alice" banner, no menu');
	A(await bob.page.evaluate(() => document.getElementById('stage').classList.contains('readonly')), 'the spectator table is read-only');
	{
		// a click on bob's side flips nothing, on either side
		await sleep(1200);
		const before = await sig(bob.page);
		const r = await bob.page.evaluate(() => { const e = document.querySelector('.cards-layer .card'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
		await bob.page.mouse.click(r.x, r.y); await sleep(600);
		A((await sig(bob.page)) === before && (await sig(alice.page)) === before, "a spectator's click flips nothing (on either side)");
	}

	const pl = (fn) => alice.page.evaluate(fn);
	// a match
	await pl(() => { const P = window.__pears.engine; const cs = P._cards(); const a = cs.find((c) => c.fruit === 'apple'), b = cs.find((c) => c !== a && c.fruit === 'apple'); window.__pears.act('reveal', a.id); window.__pears.act('reveal', b.id); });
	await conv('after a match (+2 Berries)');
	// a mismatch, held up long enough to be seen (the flip-back stretched for the test)
	await pl(() => { const P = window.__pears.engine; const cs = P._cards().filter((c) => !c.faceUp && !c.matched); const a = cs.find((c) => c.fruit === 'orange'), b = cs.find((c) => c.fruit === 'pear'); window.__pears.act('reveal', a.id); window.__pears.act('reveal', b.id); P.run().flipBackTimer = 30; });
	await conv('a mismatch, both cards up (Hearts 2.5)');
	A(await bob.page.evaluate(() => window.__pears.view().hearts === 2.5 && window.__pears.view().cards.filter((c) => c.up && !c.m).length === 2), 'bob sees the two mismatched cards face up and 2.5 Hearts');
	await pl(() => { window.__pears.engine.run().flipBackTimer = 0.01; });
	await waitFor(() => alice.page.evaluate(() => !window.__pears.view().busy), 3000);
	await conv('they turn back');
	const badge = await waitFor(() => alice.page.evaluate(() => /\b1\b/.test((document.querySelector('.pp-watch') || {}).textContent || '')), 15000);
	A(badge, "alice's watcher badge shows 1 watcher");

	// clear the level, open the shop, buy a charm, hold it
	await pl(() => { const P = window.__pears.engine; for (let g = 0; g < 10 && P.phase() === 'play'; g++) { const cs = P._cards().filter((c) => !c.faceUp && !c.matched); const a = cs.find((c) => c.fruit !== 'pear') || cs[0], b = cs.find((c) => c !== a && c.fruit === a.fruit); window.__pears.act('reveal', a.id); window.__pears.act('reveal', b.id); } });
	await conv('level 1 complete');
	A(await waitFor(() => bob.page.evaluate(() => /Level 1 Complete|Pair of Pears!/.test(document.querySelector('.pp-clear').textContent) && /Waiting for alice/.test(document.querySelector('.pp-clear').textContent)), 8000), 'bob sees the "Level 1 Complete!" panel, waiting for alice');
	await pl(() => { window.__pears.act('continue'); const P = window.__pears.engine; P.run().berries = 40; P.run().shop.offers[0] = { kind: 'charm', id: 'grape', cost: 6 }; window.__pears.act('buy', 0); window.__pears.act('pick', 0); });
	await conv('in the shop, a charm bought and held');
	A(await waitFor(() => bob.page.evaluate(() => getComputedStyle(document.querySelector('.pp-shop')).display !== 'none' && /alice is shopping/.test(document.querySelector('.pp-shop').textContent) && !document.querySelector('.pp-shop .b-nextlevel')), 6000), "bob sees alice's shop (read-only: no Next Level button)");
	if (SHOTS) { await sleep(700); await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop_shop.png') }); }
	await pl(() => { window.__pears.act('sell'); window.__pears.act('next'); });
	await conv('level 2 dealt');
	A(await bob.page.evaluate(() => window.__pears.view().level === 2 && document.querySelector('.pp-lname').textContent === 'Level 2'), "bob's HUD shows Level 2");
	A(await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && f.label === 'Pair of Pears · Level 2'), 10000), "the live list follows alice's progress (Level 2)");
	if (SHOTS) { await sleep(900); await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop.png') }); }

	// the hub's Live now list routes Watch to the Pair of Pears spectator
	const hub = await open('bob', '/battlecards/start.html');
	const link = await waitFor(() => hub.page.evaluate(() => [...document.querySelectorAll('a,button')].some((el) => (el.getAttribute('href') || el.dataset.href || '').includes('/pairofpears/?spectate=alice'))), 15000);
	A(link, "bob's Live now hub has a Watch link to /pairofpears/?spectate=alice");
	A(await hub.page.evaluate(() => /Playing Pair of Pears/.test(document.body.innerText)), 'the hub says "Playing Pair of Pears"');

	// a phone spectator sees the table too
	const bobPhone = await open('bob', '/pairofpears/?spectate=alice', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await ready(bobPhone.page);
	A(await waitFor(async () => (await sig(bobPhone.page)) === (await sig(alice.page)), 15000), 'a phone spectator converges too');
	A(await waitFor(async () => (await drawn(bobPhone.page)) === (await drawn(alice.page)), 6000), "the phone spectator's table draws alice's cards");
	if (SHOTS) { await sleep(900); await bobPhone.page.screenshot({ path: path.join(SHOTS, 'spectator_phone.png') }); }

	// alice runs out of Hearts: the run is over for everyone
	for (let g = 0; g < 14 && (await alice.page.evaluate(() => window.__pears.view().phase)) === 'play'; g++) {
		await waitFor(() => alice.page.evaluate(() => !window.__pears.view().busy), 3000);   // the page's own flip-back
		await pl(() => { const P = window.__pears.engine; const cs = P._cards().filter((c) => !c.faceUp && !c.matched); const a = cs.find((c) => c.fruit !== 'pear'), b = a && cs.find((c) => c.fruit !== a.fruit); if (b) { window.__pears.act('reveal', a.id); window.__pears.act('reveal', b.id); } });
	}
	A(await waitFor(() => alice.page.evaluate(() => window.__pears.view().phase === 'over'), 5000), 'alice: out of Hearts, the run is over');
	const bobOver = await waitFor(() => bob.page.evaluate(() => /OUT OF HEARTS/.test(document.body.innerText)), 15000);
	A(bobOver, 'bob sees the run end (OUT OF HEARTS)');
	if (SHOTS) await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop_over.png') });
	const gone = await waitFor(async () => !((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice'), 15000);
	A(gone, "a finished run drops off bob's live list");
	const presOff = await waitFor(async () => { const f = ((await call('friends', {}, tokens.bob)).friends || []).find((x) => x.username === 'alice'); return f && !String(f.status || '').startsWith('pears:'); }, 10000);
	A(presOff, "alice's presence goes back to plain online");
	for (const [n, p] of [['alice', alice], ['bob', bob], ['bob phone', bobPhone]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
