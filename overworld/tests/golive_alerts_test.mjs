// golive_alerts_test.mjs — GO-LIVE ALERTS (owner, 2026-11-19): a player opts in (every friend, or some) to hear when a
// friend starts a game they can watch; the alert is a bell message (kind 'golive') with a Watch link. The REAL server
// handler (server/mp.mjs) over sqlite, then the real top bar (site/topbar.js) in a headless browser.
//   - golive-set / golive-get: a friend at a time, or all friends (with one muted); a stranger can't be named
//   - a friend going live (the overworld heartbeat) drops ONE alert into the follower's DM inbox; heartbeats while they
//     stay live add nothing (and write nothing to the follower), another game while live adds nothing either
//   - live -> not live -> live again within the per-friend gap: nothing; after the gap: one more
//   - every way presence goes live alerts: a card run (publish-cardstate), Micatro / a solo game (publish-micatro,
//     publish-scoundrel), a MicaSurvivor run (its beacon); a friend who was online but OFFLINE for a while alerts again
//   - a friend who didn't opt in, and a stranger, get nothing
//   - the top bar: the bell counts the alert, Alerts shows "<friend> went live" with Watch to the right place, the DM
//     threads don't list it, and the Friends tab has the all-friends switch and a 🔔 per friend that turns it on
//   node overworld/tests/golive_alerts_test.mjs
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
const PORT = 8736;
const GAP = 1500;   // the per-friend gap between alerts, shortened for the test (live: 10 minutes)
process.env.MP_GOLIVE_GAP_MS = String(GAP);
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-golive-')), 'mp.bundle.mjs');
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
const row = (k) => { const r = sqlite.prepare('SELECT value, updated_at FROM mp_store WHERE key = ?').get(k); return r ? { v: JSON.parse(r.value), raw: r.value } : null; };
const alertsOf = (n) => ((row('chat:dm:' + n) || { v: [] }).v || []).filter((m) => m && m.kind === 'golive');

const tokens = {};
for (const n of ['alice', 'bob', 'carol', 'dave', 'erin']) tokens[n] = (await call('register', { username: n, password: 'golive-test-pass' })).token;
const befriend = async (a, b) => { await call('add-friend', { username: b }, tokens[a]); await call('add-friend', { username: a }, tokens[b]); };
await befriend('alice', 'bob'); await befriend('alice', 'dave'); await befriend('erin', 'bob');
A(Object.values(tokens).every(Boolean), 'five accounts; bob is friends with alice and erin, dave with alice; carol with nobody');

// ---------- opting in ----------
{
	const r0 = await call('golive-get', {}, tokens.bob);
	A(r0 && r0.all === false && Array.isArray(r0.friends) && !r0.friends.length, 'nobody is alerted about until they ask', JSON.stringify(r0));
	const r1 = await call('golive-set', { friend: 'alice', on: true }, tokens.bob);
	A(r1 && !r1.error && r1.friends.includes('alice') && !r1.all, 'bob asks to hear when alice goes live', JSON.stringify(r1));
	const s = await call('golive-set', { friend: 'alice', on: true }, tokens.carol);
	A(s && s.error && !row('golive:carol'), 'a stranger (carol) can\'t ask about alice: refused, nothing stored', JSON.stringify(s));
	const s2 = await call('golive-set', { friend: 'nobody_here', on: true }, tokens.bob);
	A(s2 && s2.error, 'nor about a name that isn\'t a friend');
}

// ---------- alice goes live in the overworld ----------
{
	await call('heartbeat', { map: 'MAP_LITTLEROOT_TOWN', x: 4, y: 5, status: 'roaming', region: 'Littleroot Town' }, tokens.alice);
	let a = alertsOf('bob');
	A(a.length === 1 && a[0].from === 'alice' && a[0].watch && a[0].watch.kind === 'world' && /alice is live/.test(a[0].text), 'alice opening the overworld drops one go-live alert into bob\'s inbox (Watch: follow her)', JSON.stringify(a));
	A(!alertsOf('dave').length && !alertsOf('carol').length, 'dave (didn\'t ask) and carol (a stranger) get nothing');
	const before = (row('chat:dm:bob') || {}).raw, writes = sqlite.prepare("SELECT updated_at FROM mp_store WHERE key = 'golivelast:alice'").get();
	for (let i = 0; i < 5; i++) await call('heartbeat', { map: 'MAP_LITTLEROOT_TOWN', x: 4 + i, y: 5, status: 'roaming', region: 'Littleroot Town' }, tokens.alice);
	await call('heartbeat', { map: 'MAP_ROUTE101', x: 1, y: 1, status: 'battling:abc123', region: 'Route 101' }, tokens.alice);
	A(!!before && (row('chat:dm:bob') || {}).raw === before && alertsOf('bob').length === 1, 'heartbeats while she stays live (and a battle from the overworld) add nothing to bob\'s row');
	A(!!writes, 'the alert marks when alice last alerted (golivelast:alice)');
}

// ---------- live -> not live -> live: the gap, then once more ----------
{
	await call('publish-micatro', { seq: 1, label: 'Ante 1', snapshot: { ante: 1 } }, tokens.alice);   // (live -> another live game: nothing)
	A(alertsOf('bob').length === 1, 'switching from the overworld to a Micatro run (still live) is no new alert');
	await call('publish-micatro', { seq: 2, label: 'Ante 1', over: true }, tokens.alice);   // the run ends: online, not live
	await call('publish-scoundrel', { seq: 1, label: 'Dungeon 1', snapshot: { room: [] } }, tokens.alice);   // live again, inside the gap
	A(alertsOf('bob').length === 1, 'going live again inside the per-friend gap: no second alert');
	await call('publish-scoundrel', { seq: 2, label: 'Run over', over: true }, tokens.alice);
	await sleep(GAP + 200);
	await call('publish-scoundrel', { seq: 1, label: 'Dungeon 1', snapshot: { room: [] } }, tokens.alice);
	const a = alertsOf('bob');
	A(a.length === 2 && a[1].watch.kind === 'scoundrel' && /Dungeon 1/.test(a[1].text), 'after the gap, a Scoundrel run alerts again (Watch: the Scoundrel spectator)', JSON.stringify(a[1] || null));
	await call('publish-scoundrel', { seq: 2, label: 'Dungeon 2', snapshot: { room: [] } }, tokens.alice);
	A(alertsOf('bob').length === 2, 'and that run carrying on adds nothing');
}

// ---------- every friend (with one muted), offline -> live, a card run and a MicaSurvivor run ----------
{
	const r = await call('golive-set', { all: true }, tokens.dave);
	A(r && r.all === true && r.friends.includes('alice'), 'dave asks about every friend', JSON.stringify(r));
	// erin was online in a run long ago (her presence row is stale: offline now), so her next run is a change to live
	sqlite.prepare('INSERT OR REPLACE INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch())').run('presence:erin', JSON.stringify({ name: 'erin', map: '', x: 0, y: 0, facing: 'down', status: 'card:dungeon', region: 'Fight 1/8', lastSeen: Date.now() - 10 * 60_000 }));
	await call('golive-set', { all: true }, tokens.bob);
	await call('golive-set', { friend: 'alice', on: false }, tokens.bob);   // (all, but alice muted)
	const g = await call('golive-get', {}, tokens.bob);
	A(g.all === true && !g.friends.includes('alice') && g.friends.includes('erin'), 'bob: every friend but alice', JSON.stringify(g));
	await call('publish-cardstate', { mode: 'dungeon', label: 'Fight 2/8', snapshot: { x: 1 }, seq: 1 }, tokens.erin);
	const e = alertsOf('bob').filter((m) => m.from === 'erin');
	A(e.length === 1 && e[0].watch.kind === 'card', 'erin, offline for a while, starting a card run alerts bob (Watch: the Battlecards spectator)', JSON.stringify(e));
	await call('publish-cardstate', { mode: 'dungeon', label: 'Fight 2/8', snapshot: { x: 2 }, seq: 2 }, tokens.erin);
	A(alertsOf('bob').filter((m) => m.from === 'erin').length === 1, 'her run publishing on: still one');
	// alice: a MicaSurvivor run (its beacon) after the gap — dave (all) hears, bob (alice muted) doesn't
	await call('publish-scoundrel', { seq: 3, label: 'Run over', over: true }, tokens.alice);
	await sleep(GAP + 200);
	const bobN = alertsOf('bob').length;
	await call('publish-micasurvivor', { run: 'abcdef0123', label: 'Pikachu', mode: 'normal', dex: 25 }, tokens.alice);
	const d = alertsOf('dave');
	A(d.length === 1 && d[0].watch.kind === 'micasurvivor', 'alice starting a MicaSurvivor run alerts dave (every friend)', JSON.stringify(d));
	A(alertsOf('bob').length === bobN, 'and not bob, who muted her');
	await call('publish-micasurvivor', { run: 'abcdef0123', label: 'Pikachu', mode: 'normal', dex: 25, snapshot: { t: 1 } }, tokens.alice);
	A(alertsOf('dave').length === 1, 'the run going on: still one');
	A(!alertsOf('carol').length && !alertsOf('alice').length, 'the stranger and the player herself never get one');
	// turning every friend off clears the ask
	const off = await call('golive-set', { all: false }, tokens.dave);
	A(off && off.all === false && !off.friends.length, 'every friend off: dave asks about nobody', JSON.stringify(off));
}

// ---------- the top bar ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--mute-audio'] });
try {
	const st = (await call('state', {}, tokens.bob)).state;
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1300, height: 900 });
	page.on('pageerror', (e) => console.log('   [page error] ' + String(e.message || e).slice(0, 160)));
	await page.evaluateOnNewDocument((tok, s) => { try { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(s)); } catch (e) { } }, tokens.bob, st);
	await page.goto(`http://localhost:${PORT}/profile/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('#tb-bell')), 15000), 'bob\'s page has the bell');
	// the badge counts the alerts (the first background poll)
	await page.evaluate(() => { try { localStorage.removeItem('mp_golive_seen_v1'); } catch (e) { } });
	await page.evaluate(() => document.querySelector('#tb-bell').click());
	A(await waitFor(() => page.evaluate(() => document.querySelectorAll('#ib-body .row.golive').length >= 2), 10000), 'Alerts lists the friends who went live');
	const rows = await page.evaluate(() => [...document.querySelectorAll('#ib-body .row.golive')].map((r) => ({ name: r.querySelector('.name').textContent, href: (r.querySelector('[data-golive-watch]') || {}).getAttribute ? r.querySelector('[data-golive-watch]').getAttribute('href') : null })));
	const al = rows.find((r) => /alice/.test(r.name) && /scoundrel/.test(r.href || '')), er = rows.find((r) => /erin/.test(r.name));
	A(!!al && al.href === '/scoundrel/?spectate=alice', '"alice went live" with Watch to her Scoundrel run', JSON.stringify(rows));
	A(!!er && er.href === '/battlecards/?spectate=erin&mp=1', '"erin went live" with Watch to her card run', JSON.stringify(er));
	// they are not DM threads
	await page.evaluate(() => document.querySelector('.ib-tab[data-view="messages"]').click());
	await sleep(300);
	const sub = await page.evaluate(() => [...document.querySelectorAll('#ib-body .row .sub')].map((e) => e.textContent).join(' | '));
	A(!/is live/.test(sub), 'the Messages tab shows no go-live alert as a message', sub);
	// the Friends tab: the all-friends switch (on for bob) and a bell per friend
	await page.evaluate(() => document.querySelector('.ib-tab[data-view="friends"]').click());
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('#golive-all') && document.querySelectorAll('[data-golive]').length === 2), 8000), 'the Friends tab has "Tell me when any friend goes live" and a 🔔 per friend');
	const st1 = await page.evaluate(() => ({ all: document.querySelector('#golive-all').checked, alice: document.querySelector('[data-golive="alice"]').getAttribute('aria-pressed'), erin: document.querySelector('[data-golive="erin"]').getAttribute('aria-pressed') }));
	A(st1.all === true && st1.alice === 'false' && st1.erin === 'true', 'it shows bob\'s ask: every friend, alice muted', JSON.stringify(st1));
	await page.evaluate(() => document.querySelector('[data-golive="alice"]').click());
	A(await waitFor(async () => (await call('golive-get', {}, tokens.bob)).friends.includes('alice'), 5000), 'pressing alice\'s 🔕 turns her alerts back on (on the server)');
	A(await waitFor(() => page.evaluate(() => document.querySelector('[data-golive="alice"]') && document.querySelector('[data-golive="alice"]').getAttribute('aria-pressed') === 'true'), 5000), 'and the button says so');
	// the keyboard reaches the switch: focus it, Space flips it
	await page.evaluate(() => document.querySelector('#golive-all').focus());
	await page.keyboard.press('Space');
	A(await waitFor(async () => (await call('golive-get', {}, tokens.bob)).all === false, 5000), 'Space on the all-friends switch turns it off');
	await ctx.close();
} catch (e) {
	A(false, 'the top bar part ran to its end', String(e && e.message || e).slice(0, 160));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
