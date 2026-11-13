// micasurvivor_m3d_lobbylink_test.mjs — MicaSurvivor 3D, co-op from the online lobby, first part (Plans/MICASURVIVOR_3D_PLAN.md
// §5.71): the players of a lobby linked on the 3D page (micasurvivor/m3d/lobbylink.js over the 2D game's js/net/net.js and
// js/mica/online.js). The REAL server handler (server/mp.mjs over sqlite) behind a static server, and signed-in friends,
// each in a browser context of their own (separate storage: as two machines).
//   * alice makes a lobby and bob joins it (the server's own actions); each opens the 3D page with ?lobby=<id>
//   * the two browsers link DIRECTLY (WebRTC on localhost), and bob is a guest in alice's Dive: the same floor, its own kit
//   * it goes both ways: bob opens a chest and alice's Dive has it open
//   * with WebRTC off, dave and erin are linked by the site's RELAY, and erin still joins dave's Dive
//   * a page that is not signed in, or has no lobby, is as before
//   node overworld/tests/micasurvivor_m3d_lobbylink_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9641;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// ---------- the real handler over sqlite, counting row writes per key prefix ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push({ k: String(bound[0]), t: Date.now() }); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3dlobby-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const actions = [];   // every /api/mp call the pages make: {who, action, t}
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); actions.push({ action: b.action, t: Date.now(), auth: (req.headers.authorization || '').slice(-8) }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) && process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (a suite rerun right after the first may find the port still held for a moment: retry for 20 s)
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

const tokens = {};
for (const n of ['alice', 'bob', 'dave', 'erin']) tokens[n] = (await call('register', { username: n, password: 'msurv-m3dlobby-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob); await call('add-friend', { username: 'bob' }, tokens.alice);
await call('add-friend', { username: 'dave' }, tokens.erin); await call('add-friend', { username: 'erin' }, tokens.dave);
A(Object.values(tokens).every(Boolean), 'four real accounts: alice and bob are friends, dave and erin are friends');
/** A lobby of two, made with the server's own actions. -> its id */
const lobbyOf = async (host, guest) => {
	const c = await call('msurv-lobby-create', { dex: 7, rules: 2 }, tokens[host]);
	const id = c.lobby && c.lobby.id;
	const j = id ? await call('msurv-lobby-join', { id, dex: 4, rules: 2 }, tokens[guest]) : {};
	return { id, members: ((j.lobby || {}).members || []).map((m) => m.name), err: c.error || j.error || null };
};

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const open = async (who, query, net = {}) => {
		const ctx = await browser.createBrowserContext();   // its own storage: as another machine
		const page = await ctx.newPage();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)|Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		if (who) { const st = (await call('state', {}, tokens[who])).state || { username: who };
			await page.evaluateOnNewDocument((tok, st, net) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); window.__msurvNet = net; }, tokens[who], st, net); }
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 40000);
		return { page, ok };
	};
	const calm = (p) => p.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 1e6; });

	// ---- a direct link
	const L = await lobbyOf('alice', 'bob');
	A(/^[0-9a-f]{12}$/.test(L.id || '') && L.members.join() === 'alice,bob', 'alice makes a lobby and bob joins it', JSON.stringify(L));
	const H = await open('alice', `?dive=3&route=forest&dex=7&auto=1&host=${L.id}&lobby=${L.id}`, { ice: [] });
	A(H.ok && await H.page.evaluate(() => !!window.__m3d.link && window.__m3d.link.isHost), 'alice opens the 3D page with the lobby: it has the lobby\'s line, as its host');
	await calm(H.page);
	const Gp = await open('bob', `?join=${L.id}&lobby=${L.id}&lh=alice&dex=4&auto=1&gen=3&biome=meadow&dj=3&route=forest`, { ice: [] });   // (the whole address, as a lobby's start gives it: the page is not sent anywhere else, so the link is made once)
	A(Gp.ok, 'bob opens it as a guest of that Dive');
	const linked = await waitFor(() => H.page.evaluate(() => window.__m3d.link.modes.bob === 'direct'), 30000);
	A(linked, 'the two browsers link directly (WebRTC)', JSON.stringify(await H.page.evaluate(() => window.__m3d.link.modes)));
	const joined = await waitFor(() => Gp.page.evaluate(() => /dj=3/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined)), 60000);
	const sides = async () => [await H.page.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), mates: m.world.mates.map((q) => q.dex), opened: m.dive.opened, sent: m.link.sent, got: m.link.got }; }),
		await Gp.page.evaluate(() => { const m = window.__m3d; return { search: location.search, stairs: m.room.stairs.join(), member: m.guestDive.lg && m.guestDive.lg.member, moves: m.world.pl.moves.length, link: !!m.link, mode: m.link && m.link.modes.alice, sent: m.link ? m.link.sent : 0, got: m.link ? m.link.got : 0 }; })];
	let [h, g] = joined ? await sides() : [{}, {}];
	A(joined && /lobby=/.test(g.search) && g.link && g.mode === 'direct' && g.stairs === h.stairs && g.member === 4 && g.moves === 3 && h.mates.join() === '4', 'bob is a guest in alice\'s Dive, over the lobby\'s line: the same floor, its own Charmander and kit', JSON.stringify([h, g]));
	A(h.sent > 5 && h.got > 5 && g.sent > 5 && g.got > 5, `messages go both ways (alice sent ${h.sent}, got ${h.got}; bob sent ${g.sent}, got ${g.got})`);
	const ch = await H.page.evaluate(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await Gp.page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x + 1; s.z = z; s.vx = s.vz = 0; }, ch[0], ch[1]);
	A(await waitFor(() => H.page.evaluate(() => window.__m3d.dive.opened === 1), 12000), 'bob stands by a chest: it opens in alice\'s Dive');
	const polls = actions.filter((q) => q.action === 'msurv-lobby-poll').length;
	A(polls >= 2, `both keep asking the lobby who is in it (${polls} polls)`);
	await H.page.close(); await Gp.page.close();

	// ---- the relay, when the browsers cannot reach each other
	const L2 = await lobbyOf('dave', 'erin');
	const H2 = await open('dave', `?dive=3&route=forest&dex=7&auto=1&host=${L2.id}&lobby=${L2.id}`, { noRtc: true });
	await calm(H2.page);
	const G2 = await open('erin', `?join=${L2.id}&lobby=${L2.id}&lh=dave&dex=4&auto=1`, { noRtc: true });
	const relayed = await waitFor(() => H2.page.evaluate(() => window.__m3d.link.modes.erin === 'relay' && window.__m3d.link.slow), 40000);
	A(H2.ok && G2.ok && relayed, 'with WebRTC off, dave and erin are linked by the site\'s relay', JSON.stringify(await H2.page.evaluate(() => window.__m3d.link.modes)));
	const joined2 = await waitFor(() => G2.page.evaluate(() => /dj=3/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined)), 90000);
	A(joined2 && await H2.page.evaluate(() => window.__m3d.world.mates.length === 1), 'erin still joins dave\'s Dive over it (slowly: a few messages a second)');
	A(actions.some((q) => q.action === 'msurv-relay-push'), 'the relay is the server\'s own (msurv-relay-push)');
	await H2.page.close(); await G2.page.close();

	// ---- as before without it
	const N = await open(null, '?dive=3&route=forest&dex=7&auto=1&host=abcdefabcdef&lobby=abcdefabcdef');
	A(N.ok && await N.page.evaluate(() => window.__m3d.link === null && !window.G.Net), 'a page that is not signed in has no lobby line (and loads none of its scripts)');
	const S = await open('alice', '?dive=3&route=forest&dex=7&auto=1');
	A(S.ok && await S.page.evaluate(() => window.__m3d.link === null && !window.G.Net && !!window.__m3d.dive), 'a signed-in Dive with no lobby is as before');
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
