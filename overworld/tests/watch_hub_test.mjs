// watch_hub_test.mjs — the Watch page, the account's replay library, KEPT replays and TV mode (owner, 2026-11-19:
// "one watch page", "an account replay library", "keep favourites", "TV mode"). The REAL server handler
// (server/mp.mjs, bundled like the dev server, over sqlite) behind a static server, headless browsers:
//   - bob's /watch/ lists his friends live in three kinds of game (Pocket Enhanced, Scoundrel, the overworld), each
//     with its own Watch link, and Watch opens it; a stranger sees none of them
//   - alice's replays from several games (Battlecards, Micatro, Pocket, an overworld battle, MicaSurvivor, and her
//     device's Scoundrel run) are ONE list on /watch/ and on the profile, and each opens the game's own replay link
//   - a kept replay survives the sweep past 30 days; one let go expires; only its owner can keep it; at most 20
//   - TV mode shows one friend's game at a time, moves on by itself, and Next / Prev / Leave by keyboard and touch
//   - the home page has a Watch tile and the top bar's Friends tab links the page
//   node overworld/tests/watch_hub_test.mjs
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
const PORT = 8681;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------- the real handler over sqlite ----------
process.env.MP_GC_RATE = '0';   // (the sweep runs only when this test asks for it)
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-watch-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	try { return await res.json(); } catch { return { error: 'status ' + res.status }; }
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.6.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	// (the spectator pages TV mode frames are not what this test checks: a tiny stand-in keeps the run light)
	if (/^\/(pocketenhanced|scoundrel|overworld|micatro|battlecards|micasurvivor|pairofpears)\//.test(u) && /[?&](spectate|follow|watch|rshare|replay|owreplay)=/.test(req.url)) {
		res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>stand-in</title><p id="stand">' + req.url.replace(/[<>&]/g, '') + '</p>'); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts: alice, dave and erin are bob's friends; carol is nobody's ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol', 'dave', 'erin']) tokens[n] = (await call('register', { username: n, password: 'watch-hub-pass' })).token;
for (const f of ['alice', 'dave', 'erin']) { await call('add-friend', { username: f }, tokens.bob); await call('add-friend', { username: 'bob' }, tokens[f]); }
A(Object.values(tokens).every(Boolean), 'five real accounts; alice, dave and erin are bob\'s friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
// a row's value / last-write time, or null when it is gone
const rowOf = (k) => { const r = sqlite.prepare('SELECT value, updated_at FROM mp_store WHERE key = ?').get(k); return r ? { v: JSON.parse(r.value), at: r.updated_at } : null; };
const { packString } = await import(pathToFileURL(path.join(ROOT, 'battlecards/codec.js')).href);

// ---------- 2. the account's replay library (server) ----------
const ids = {};
{
	const tok = tokens.alice;
	ids.bc = (await call('replay-put', { code: 'G1.' + 'a'.repeat(40), game: 'battlecards', label: 'Battlecards · dungeon · alice vs Lich' }, tok)).id;
	ids.mt = (await call('micatro-replay-put', { code: await packString(JSON.stringify({ v: 1, seed: 'SEED1', actions: [{ type: 'play' }] })), meta: { ante: 4, won: false } }, tok)).id;
	ids.pk = (await call('pocket-replay-put', { code: await packString(JSON.stringify({ v: 1, config: { seed: 's', players: [{ name: 'alice' }, { name: 'Blue' }] }, actions: [{ t: 'execute' }] })), meta: { kind: 'Match', players: [{ name: 'alice', points: 3 }, { name: 'Blue', points: 1 }], winner: 'alice', turns: 9 } }, tok)).id;
	ids.ow = (await call('owreplay-put', { code: await packString(JSON.stringify({ v: 1, frames: [{ t: 0, s: null }] })), meta: { label: 'vs. Brock', kind: 'gym' } }, tok)).id;
	ids.ms = (await call('micasurvivor-replay-put', { code: await packString(JSON.stringify({ v: 1, h: {}, f: [[1]] })), meta: { mon: 'Pikachu' } }, tok)).id;
	A(Object.values(ids).every((x) => /^[a-f0-9]{8}$/.test(x || '')), 'alice stores replays in five games', JSON.stringify(ids));
	const lib = await call('replay-library', {}, tok);
	const games = (lib.replays || []).map((r) => r.game + ':' + r.id);
	A(['battlecards:' + ids.bc, 'micatro:' + ids.mt, 'pocket:' + ids.pk, 'overworld:' + ids.ow, 'micasurvivor:' + ids.ms].every((k) => games.includes(k)), 'replay-library lists all five, across games, for her account', JSON.stringify(lib).slice(0, 400));
	A((lib.replays || []).find((r) => r.game === 'battlecards')?.label === 'Battlecards · dungeon · alice vs Lich' && /Ante 4/.test((lib.replays || []).find((r) => r.game === 'micatro')?.label || ''), 'each entry carries a label naming it');
	A(lib.keepMax === 20 && lib.kept === 0, 'up to 20 can be kept; none yet');
	const bobs = await call('replay-library', {}, tokens.bob);
	A(Array.isArray(bobs.replays) && bobs.replays.length === 0, "bob's library has none of alice's replays");
	A(!!(await call('replay-library', {})).error, 'the library needs an account');
}

// ---------- 3. keeping favourites past the 30-day sweep ----------
{
	const k1 = await call('replay-keep', { game: 'battlecards', id: ids.bc, keep: true }, tokens.alice);
	const k2 = await call('replay-keep', { game: 'micatro', id: ids.mt, keep: true }, tokens.alice);
	A(k1.ok && k1.kept && k2.ok && k2.count === 2, 'alice keeps her Battlecards and Micatro replays', JSON.stringify([k1, k2]));
	const stranger = await call('replay-keep', { game: 'pocket', id: ids.pk, keep: true }, tokens.carol);
	const friend = await call('replay-keep', { game: 'overworld', id: ids.ow, keep: true }, tokens.bob);
	A(stranger.error && friend.error && !rowOf('pkreplay:' + ids.pk)?.v.keep, "only the owner can keep a replay (a stranger and a friend can't)", JSON.stringify([stranger, friend]));
	A(!!(await call('replay-keep', { game: 'battlecards', id: 'zz' }, tokens.alice)).error && !!(await call('replay-keep', { game: 'nope', id: ids.bc }, tokens.alice)).error, 'a bad id or game is refused');
	// Micatro extends a won run's replay IN PLACE (the Endless run after it): it stays kept
	await call('micatro-replay-put', { id: ids.mt, code: await packString(JSON.stringify({ v: 1, seed: 'SEED1', actions: [{ type: 'play' }, { type: 'play' }] })), meta: { ante: 9, won: true, endless: true } }, tokens.alice);
	A(rowOf('mreplay:' + ids.mt)?.v.keep === true, 'a kept Micatro replay extended in place is still kept');

	// the sweep, 31 days on: every replay row's last write is moved back, and the GC is due
	const ageRows = () => sqlite.exec(`UPDATE mp_store SET updated_at = updated_at - ${31 * 86400} WHERE key LIKE 'replay:%' OR key LIKE 'mreplay:%' OR key LIKE 'pkreplay:%' OR key LIKE 'owreplay:%' OR key LIKE 'msurvreplay:%'`);
	const sweep = async () => { sqlite.exec("DELETE FROM mp_store WHERE key = 'gc:last'"); process.env.MP_GC_RATE = '1'; await call('state', {}, tokens.dave); process.env.MP_GC_RATE = '0'; };
	const has = (k) => !!sqlite.prepare('SELECT key FROM mp_store WHERE key = ?').get(k);
	ageRows(); await sweep();
	A(has('replay:' + ids.bc) && has('mreplay:' + ids.mt), 'the kept replays survive the sweep past 30 days');
	A(!has('pkreplay:' + ids.pk) && !has('owreplay:' + ids.ow) && !has('msurvreplay:' + ids.ms), 'the ones not kept are swept as before');
	const lib = await call('replay-library', {}, tokens.alice);
	const ks = (lib.replays || []).map((r) => r.game + (r.kept ? '*' : ''));
	A(ks.includes('battlecards*') && ks.includes('micatro*') && !ks.includes('pocket') && !ks.includes('overworld') && !ks.includes('micasurvivor'), 'the library shows the kept ones (marked) and drops the swept ones', JSON.stringify(ks));
	// letting one go: it expires when it would have (its row is not rewritten, so it is already past due)
	const before = rowOf('mreplay:' + ids.mt)?.at;
	const un = await call('replay-keep', { game: 'micatro', id: ids.mt, keep: false }, tokens.alice);
	A(un.ok && un.kept === false && un.count === 1 && before != null && rowOf('mreplay:' + ids.mt)?.at === before, 'unkeeping leaves the row\'s last-write time alone');
	await sweep();
	A(!has('mreplay:' + ids.mt) && has('replay:' + ids.bc), 'the one let go expires at the next sweep; the one still kept stays');
	// at most 20
	const more = [];
	for (let i = 0; i < 19; i++) more.push((await call('replay-put', { code: 'G1.b' + i + 'x'.repeat(20), label: 'game ' + i }, tokens.alice)).id);   // (replay-put allows 20 a minute)
	for (let i = 0; i < 2; i++) more.push({ g: 'overworld', id: (await call('owreplay-put', { code: await packString(JSON.stringify({ v: 1, frames: [{ t: i, s: null }] })), meta: { label: 'more ' + i } }, tokens.alice)).id });
	let last = null, okN = 1;
	const gid = (x) => (typeof x === 'object' ? x : { g: 'battlecards', id: x });
	for (const x of more.slice(0, 20)) { last = await call('replay-keep', { game: gid(x).g, id: gid(x).id, keep: true }, tokens.alice); if (last.ok) okN++; }
	A(okN === 20 && last.error && /20/.test(last.error), 'a 21st keep is refused: at most 20', JSON.stringify(last));
	// (one let go, so the list below can keep another; replay-keep allows 30 a minute)
	A((await call('replay-keep', { game: 'battlecards', id: more[1], keep: false }, tokens.alice)).count === 19, 'letting one go frees a place');
}

// ---------- 1. who is live: three kinds of game ----------
{
	await call('publish-pocket', { seq: 1, label: 'Pocket Enhanced · Turn 3 · 1–1', snapshot: { game: 'pocket', n: 0, you: 0, view: { players: [] } } }, tokens.alice);
	await call('publish-scoundrel', { seq: 1, label: 'Dungeon 2 · 14/20 HP', snapshot: { s: 1 } }, tokens.erin);
	await call('heartbeat', { map: 'PALLET_TOWN', x: 3, y: 4, status: 'roaming', region: 'Kanto' }, tokens.dave);
	const lf = await call('live-friends', {}, tokens.bob);
	A(['pocket', 'scoundrel', 'world'].every((k) => (lf.live || []).some((f) => f.kind === k)), 'bob\'s friends are live in three kinds of game', JSON.stringify(lf).slice(0, 300));
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox'] });
	const open = async (who, url, vp = { width: 1280, height: 860, deviceScaleFactor: 1 }, device = null) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st, device) => {
			try {
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_local_owner_v1', st.username); }
				if (device) for (const [k, v] of Object.entries(device)) localStorage.setItem(k, v);
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st, device);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};

	// --- bob's Watch page: every friend live, each with its own Watch link ---
	const bob = await open('bob', '/watch/');
	const cards = () => bob.page.evaluate(() => [...document.querySelectorAll('#live .live')].map((e) => ({ u: e.dataset.user, k: e.dataset.kind, href: e.querySelector('a.btn')?.getAttribute('href') || '', what: e.querySelector('.what').textContent })));
	A(await waitFor(async () => (await cards()).length === 3, 10000), 'bob\'s Watch page lists his three live friends', JSON.stringify(await cards()));
	const cs = await cards();
	A(cs.some((c) => c.k === 'pocket' && c.href === '/pocketenhanced/?spectate=alice' && /Pocket Enhanced/.test(c.what))
		&& cs.some((c) => c.k === 'scoundrel' && c.href === '/scoundrel/?spectate=erin')
		&& cs.some((c) => c.k === 'world' && c.href === '/overworld/?follow=dave'), 'each has its game\'s own Watch link (Pocket, Scoundrel, the overworld\'s live follow)', JSON.stringify(cs));
	{
		const p = await (await browser.createBrowserContext()).newPage();
		await p.goto(`http://localhost:${PORT}/watch/`, { waitUntil: 'domcontentloaded' });
		await p.evaluate((tok) => localStorage.setItem('magepunk_mp_token_v1', tok), tokens.bob);
		await p.goto(`http://localhost:${PORT}/watch/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p.evaluate(() => !!document.querySelector('#live .live a.btn')), 10000);
		await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.evaluate(() => document.querySelector('#live .live[data-kind="scoundrel"] a.btn').click())]);
		A(/\/scoundrel\/\?spectate=erin$/.test(p.url()), 'Watch opens the friend\'s game', p.url());
		await p.close();
	}

	// --- TV mode: one at a time, moves on by itself; keys, touch and Leave ---
	const tvp = await open('bob', '/watch/?tvbase=1500');
	await waitFor(() => tvp.page.evaluate(() => document.querySelectorAll('#live .live').length === 3), 10000);
	await tvp.page.click('#tv-open');
	const tvs = () => tvp.page.evaluate(() => window.__watch.tv.state());
	A(await waitFor(async () => { const s = await tvs(); return s.open && s.n === 3 && !!s.href; }, 8000), 'TV mode opens on one live friend\'s game, in a frame', JSON.stringify(await tvs()));
	const first = await tvs();
	A(first.cur === 'alice:pocket', 'the closest-sounding game comes first (alice\'s "1–1")', JSON.stringify(first));
	A(first.dwell > 1500, 'a close game lingers longer than the base time', String(first.dwell));
	const seen = new Set([first.cur]);
	await waitFor(async () => { seen.add((await tvs()).cur); return seen.size >= 3; }, 20000);
	A(seen.size >= 3, 'it moves on by itself through every live friend', JSON.stringify([...seen]));
	const frameHref = await tvp.page.evaluate(() => document.querySelector('#tv-frame').getAttribute('src'));
	A(['/pocketenhanced/?spectate=alice', '/scoundrel/?spectate=erin', '/overworld/?follow=dave'].includes(frameHref), 'the frame shows the friend\'s watch link', frameHref);
	{
		const a = (await tvs()).cur;
		await tvp.page.keyboard.press('ArrowRight');
		await waitFor(async () => (await tvs()).cur !== a, 4000);
		const b = (await tvs()).cur;
		await tvp.page.keyboard.press('KeyQ');
		await waitFor(async () => (await tvs()).cur !== b, 4000);
		const c = (await tvs()).cur;
		A(a !== b && c === a, '→ moves to the next game and Q back to the one before', JSON.stringify([a, b, c]));
		await tvp.page.click('#tv-next');
		await waitFor(async () => (await tvs()).cur !== c, 4000);
		A((await tvs()).cur !== c, 'the on-screen Next button (touch) moves on too');
		await tvp.page.keyboard.press('KeyX');
		A(await waitFor(async () => !(await tvs()).open, 3000) && !(await tvp.page.evaluate(() => document.querySelector('#tv-frame').getAttribute('src'))), 'X leaves TV mode and stops watching');
		await tvp.page.click('#tv-open'); await waitFor(async () => (await tvs()).open, 3000);
		await tvp.page.keyboard.press('Escape');
		A(await waitFor(async () => !(await tvs()).open, 3000), 'Escape leaves it too');
	}
	A(await tvp.page.evaluate(async () => { const m = await import('/watch/watch.js'); return m.tvDwellMs({ label: 'Final round', watchers: 0 }, 1000) > m.tvDwellMs({ label: 'Turn 2', watchers: 0 }, 1000) && m.tvDwellMs({ label: 'Turn 2', watchers: 4 }, 1000) > m.tvDwellMs({ label: 'Turn 2', watchers: 0 }, 1000) && m.tvDwellMs({ label: 'final', watchers: 99 }, 1000) <= 2500; }), 'the dwell grows for a close-sounding label and for watchers, capped');

	// --- the stranger: nothing live, none of alice's replays ---
	const carol = await open('carol', '/watch/');
	await sleep(1500);
	A(await carol.page.evaluate(() => !document.querySelector('#live .live') && !document.querySelector('#library .rl-row')), 'a stranger sees nobody live and no replays');

	// --- alice's library on /watch/ (with her device's Scoundrel run) and on the profile ---
	const scoundrelRun = JSON.stringify([{ id: 'S1.3', seed: 'S1', actions: '0wb', result: { reason: 'dead', dungeons: 2 }, when: Date.now() }]);
	const al = await open('alice', '/watch/', undefined, { scoundrel_replays_v1: scoundrelRun });
	const rows = () => al.page.evaluate(() => [...document.querySelectorAll('#library .rl-row')].map((e) => ({ g: e.dataset.game, id: e.dataset.id, href: e.querySelector('.rl-watch').getAttribute('href'), kept: !!e.querySelector('.rl-keep.on'), keep: !!e.querySelector('.rl-keep'), sub: e.querySelector('.rl-sub').textContent })));
	A(await waitFor(async () => (await rows()).length >= 4, 10000), 'alice\'s Watch page lists her replays', JSON.stringify(await rows()).slice(0, 300));
	const rs = await rows();
	A(rs.some((r) => r.g === 'battlecards' && r.href === '/battlecards/index.html?rshare=' + ids.bc && r.kept), 'the kept Battlecards replay, with its link, marked kept');
	A(rs.some((r) => r.g === 'scoundrel' && r.href === '/scoundrel/?replay=S1.0wb' && !r.keep && /on this device/.test(r.sub)), "the device's Scoundrel run is in the list (no Keep: it never expires)", JSON.stringify(rs.filter((r) => r.g === 'scoundrel')));
	{
		// a fresh replay in two more games, then the list again: several games in one list, each opening its own viewer
		ids.pk2 = (await call('pocket-replay-put', { code: await packString(JSON.stringify({ v: 1, config: { seed: 's2', players: [{ name: 'alice' }, { name: 'Red' }] }, actions: [{ t: 'execute' }] })), meta: { kind: 'Match', players: [{ name: 'alice', points: 3 }, { name: 'Red', points: 0 }], winner: 'alice', turns: 5 } }, tokens.alice)).id;
		ids.ow2 = (await call('owreplay-put', { code: await packString(JSON.stringify({ v: 1, frames: [{ t: 0, s: null }] })), meta: { label: 'Route 1', kind: 'wild' } }, tokens.alice)).id;
		await al.page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(async () => (await rows()).some((r) => r.g === 'overworld'), 10000);
		const r2 = await rows();
		const gs = new Set(r2.map((r) => r.g));
		A(['battlecards', 'pocket', 'overworld', 'scoundrel'].every((g) => gs.has(g)), 'one list holds replays from four games', JSON.stringify([...gs]));
		A(r2.find((r) => r.g === 'pocket')?.href === '/pocketenhanced/?replay=' + ids.pk2 && r2.find((r) => r.g === 'overworld')?.href === '/overworld/?owreplay=' + ids.ow2, 'each links to its game\'s own replay viewer');
		await Promise.all([al.page.waitForNavigation({ waitUntil: 'domcontentloaded' }), al.page.evaluate((id) => document.querySelector(`#library .rl-row[data-id="${id}"] .rl-watch`).click(), ids.pk2)]);
		A(al.page.url().endsWith('/pocketenhanced/?replay=' + ids.pk2), 'Watch on a library row opens that replay', al.page.url());
		await al.page.goBack({ waitUntil: 'domcontentloaded' });
		await waitFor(async () => (await rows()).some((r) => r.g === 'overworld'), 10000);
		// ☆ Keep from the list
		await al.page.evaluate((id) => document.querySelector(`#library .rl-row[data-id="${id}"] .rl-keep`).click(), ids.ow2);
		A(await waitFor(async () => (await rows()).find((r) => r.id === ids.ow2)?.kept, 5000) && rowOf('owreplay:' + ids.ow2)?.v.keep === true, '☆ Keep on a row keeps it on the server');
	}
	const prof = await open('alice', '/profile/');
	A(await waitFor(() => prof.page.evaluate((id) => !!document.querySelector(`#replay-library .rl-row[data-id="${id}"]`)), 8000).then(() => prof.page.evaluate((id) => !!document.querySelector(`#replay-library .rl-row[data-id="${id}"]`), ids.pk2)), 'the profile shows the same library');

	// --- reaching the page: the home tile and the top bar's Friends tab ---
	const home = await open('bob', '/');
	A(await home.page.evaluate(() => document.querySelector('a#tile-watch')?.getAttribute('href') === 'watch/'), 'the home page has a Watch tile');
	await bob.page.click('#tb-bell');
	await waitFor(() => bob.page.evaluate(() => !!document.querySelector('#mp-inbox .ib-tab[data-view="friends"]')), 5000);
	await bob.page.evaluate(() => document.querySelector('#mp-inbox .ib-tab[data-view="friends"]').click());
	A(await waitFor(() => bob.page.evaluate(() => document.querySelector('#tb-watch-link')?.getAttribute('href') === '/watch/'), 6000), 'the top bar\'s Friends tab links the Watch page');

	// --- a guest: no live list, but the device's replays still show ---
	const guest = await open(null, '/watch/', undefined, { scoundrel_replays_v1: scoundrelRun });
	A(await waitFor(() => guest.page.evaluate(() => /Log in/.test(document.querySelector('#live').textContent) && !!document.querySelector('#library .rl-row[data-game="scoundrel"]')), 8000), 'a guest is asked to log in for the live list and still sees the device\'s replays');

	const errs = [...bob.errors, ...tvp.errors, ...al.errors, ...carol.errors, ...prof.errors, ...guest.errors].filter((e) => !/Failed to fetch|NetworkError|AbortError/.test(e));
	A(!errs.length, 'no page errors', errs.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
