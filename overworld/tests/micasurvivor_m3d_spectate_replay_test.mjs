// micasurvivor_m3d_spectate_replay_test.mjs — MicaSurvivor: every mode can be WATCHED live and has a REPLAY (owner, 2026-11-19).
// The REAL server handler (server/mp.mjs over sqlite) behind a static server; signed-in players in browser contexts of their own.
//   * a lobby's 3D co-op run (alice hosts, bob joins) is published: alice's beacon names the party, bob's points at alice (`via`)
//   * carol, a friend of bob's only, sees bob live; the link opens alice's run (the host's), with bob in it, and the co-op goes on
//   * the server lets a friend of any of the party watch, and nobody else
//   * the run's replay (a 3D tape) opened by the 2D replay address (/msr/<id> -> /micasurvivor/?replay=<id>): the 3D page plays it
//     (before: the 2D player could not read it and said it was not found)
//   * the player's replay list has their 3D replays (marked 3D), and the friends screen shows them, each opening in the 3D page
//   (practice runs are the one kind with no replay, on purpose: m3d/main.js REC)
//   node overworld/tests/micasurvivor_m3d_spectate_replay_test.mjs
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
const PORT = 9675;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-spectrep-')), 'mp.bundle.mjs');
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
const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin'];
for (const n of NAMES) tokens[n] = (await call('register', { username: n, password: 'msurv-spectrep-pass' })).token;
for (const [x, y] of [['alice', 'bob'], ['bob', 'carol'], ['alice', 'dave'], ['carol', 'erin']]) { await call('add-friend', { username: x }, tokens[y]); await call('add-friend', { username: y }, tokens[x]); }
A(Object.values(tokens).every(Boolean), 'five real accounts: alice-bob, bob-carol, alice-dave and carol-erin are friends');
const { watchHref } = await import(pathToFileURL(path.join(ROOT, 'site/livewatch.js')).href);

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const ctxOf = async (who) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1000, height: 620, deviceScaleFactor: 1 });
		page.setDefaultNavigationTimeout(90000);   // (three 3D pages at once load slowly on a busy runner)
		page.on('pageerror', e => errors.push((who || 'viewer') + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403|401)|Failed to load resource|favicon/.test(m.text())) errors.push((who || 'viewer') + ' console: ' + m.text().slice(0, 200)); });
		if (who) { const st = (await call('state', {}, tokens[who])).state || { username: who }; await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micasurvivor_lang', 'en'); window.__msurvNet = { ice: [] }; }, tokens[who], st); }
		return page;
	};
	/** The 2D game's menu, signed in as `who`. */
	const menu = async (who) => {
		const page = await ctxOf(who);
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 40000);
		await sleep(300);
		if (await page.evaluate(() => { const e = document.getElementById('tap-start'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })) await page.click('#tap-start');
		if (await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-starters')), 6000)) { await page.evaluate(() => { const c = document.querySelector('#starter-grid .cell'); if (c) c.click(); }); await sleep(300); await page.click('#starter-ok'); }
		await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-menu')), 15000);
		await waitFor(() => page.evaluate(() => G.Game.state === 'ui' && !!G.Social && !!G.PlayUI), 20000);
		await page.evaluate(async () => { await G.Social.start(); if (G.Expedition && G.Expedition.load) await G.Expedition.load(); });
		return page;
	};
	const in3d = (p) => waitFor(() => p.evaluate(() => location.pathname === '/micasurvivor/m3d/' && !!(window.__m3d && window.__m3d.ready)), 60000);

	// ---- a lobby's 3D Expedition: alice hosts, bob joins
	const AL = await menu('alice'), BO = await menu('bob');
	const id = await AL.evaluate(async () => { const r = await G.Social.createRoom({ mode: 'exp-classic', map: 'viridian', diff: 'normal', opts: {} }); return r && r.id; });
	await BO.evaluate(async (id) => { const r = await G.Social.joinRoom(id); if (r.ok) await G.Social.setReady(true); return r; }, id);
	await waitFor(() => AL.evaluate(() => { const R = G.Social.room; return !!R && R.members.length === 2 && R.members.every((m) => m.ready); }), 15000);
	await AL.evaluate(() => { const R = G.Social.room, d3 = G.PlayUI.coop3d(R); setTimeout(async () => { const r = await G.Social.startRoom(4242, d3); if (r.ok) { G.Net.broadcast(r.cfg); G.Flow.startCoop(r.cfg); } }, 50); });
	const both3d = (await in3d(AL)) && (await in3d(BO));
	const joined = both3d && await waitFor(() => BO.evaluate(() => !!(window.__m3d.rv && window.__m3d.net.joined)), 60000);
	A(joined && await AL.evaluate(() => window.__m3d.world.mates.length === 1 && !!window.__m3d.run), 'alice and bob are in one 3D Expedition from the lobby');

	// ---- the beacons: the host's names the party, the guest's points at the host
	const beacons = await waitFor(() => { const a = row('msurvlive:alice'), b = row('msurvlive:bob'); return !!a && !a.over && a.mode === 'exp-threed' && (a.group || []).includes('bob') && !!b && b.via === 'alice'; }, 30000);
	A(beacons, "alice's run is published with the party; bob's beacon points at alice's run", JSON.stringify([row('msurvlive:alice'), row('msurvlive:bob')]));
	const lf = await call('live-friends', {}, tokens.carol), eb = (lf.live || []).find((e) => e.username === 'bob') || {};
	A(eb.kind === 'micasurvivor' && eb.watch === 'alice' && watchHref(eb) === '/micasurvivor/m3d/?live=alice', "carol (bob's friend only) sees bob live; the link opens alice's run in the 3D page", JSON.stringify([eb, watchHref(eb)]));
	const ld = await call('live-friends', {}, tokens.dave), ea = (ld.live || []).find((e) => e.username === 'alice') || {};
	A(ea.kind === 'micasurvivor' && !ea.watch && /co-op/.test(ea.label || ''), "dave (alice's friend) sees alice's co-op run live", JSON.stringify(ea));
	const perm = { carol: await call('micasurvivor-state', { username: 'alice' }, tokens.carol), erin: await call('micasurvivor-state', { username: 'alice' }, tokens.erin), bobState: await call('micasurvivor-state', { username: 'bob' }, tokens.carol) };
	A(!perm.carol.error && perm.carol.live === true && perm.erin.error === 'not your friend' && perm.bobState.via === 'alice', "the server lets carol watch alice's run (through bob), not erin (a friend of none of them); asking for bob answers with alice", JSON.stringify(perm).slice(0, 400));

	// ---- carol opens bob from the 2D game (its friends list's Watch): she is sent to alice's run in the 3D page, bob beside her
	const CA = await ctxOf('carol');
	await CA.goto(`http://localhost:${PORT}/micasurvivor/?watch=bob`, { waitUntil: 'domcontentloaded' });
	const sent = await waitFor(() => CA.evaluate(() => location.pathname === '/micasurvivor/m3d/' && /live=alice/.test(location.search)), 40000);
	A(sent, "carol's page goes to the 3D page, watching alice", await CA.evaluate(() => location.href).catch(() => ''));
	const seen = sent && await waitFor(() => CA.evaluate(() => { const m = window.__m3d; return !!(m && m.ready && m.view && m.siteWatch && m.siteWatch.status === 'live' && m.replay.mates === 1); }), 90000);
	A(seen, "alice's run plays on carol's screen, with bob in it", JSON.stringify(await CA.evaluate(() => { const m = window.__m3d; return m && { st: m.siteWatch && m.siteWatch.status, who: m.siteWatch && m.siteWatch.who, view: !!m.view, mates: m.replay && m.replay.mates }; }).catch(() => null)));
	A(await AL.evaluate(() => !!window.__m3d.siteHost && window.__m3d.siteHost.sent >= 1), "alice's page was told it is watched and sent its frames (it sends none unwatched)", JSON.stringify(await AL.evaluate(() => { const h = window.__m3d.siteHost; return h && { w: h.watchers, n: h.names, sent: h.sent }; })));
	A(await BO.evaluate(() => !!window.__m3d.net.joined) && await AL.evaluate(() => window.__m3d.world.mates.length === 1 && !window.__m3d.world.mates[0].away), 'the co-op goes on as before (bob is still in, alice still hears him)');

	await CA.browserContext().close();   // (carol stops watching: a third 3D page slowed the two players' run too much to end on a loaded runner)

	// ---- the run ends: its replay is the host's 3D tape
	for (let i = 0; i < 160 && !(await AL.evaluate(() => !!window.__m3d.run.ended)); i++) {
		// (a level-up card left open by either player holds the whole party's fight, and with it the end: no card is open here)
		await BO.evaluate(() => { const m = window.__m3d; m.world.pl.pending = 0; m.world.pl.choices = null; m.world.pl.hp = 0; m.world.pl.dead = true; });
		if (await AL.evaluate(() => window.__m3d.world.mates.every((q) => q.dead || q.away))) await AL.evaluate(() => { const m = window.__m3d; m.world.pl.pending = 0; m.world.pl.choices = null; for (const q of m.world.mates) q.lv = 1e6; m.world.waiting = false; m.world.enemies.length = 0; m.world.pl.hp = 0; m.world.pl.dead = true; });
		await sleep(500);
	}
	await waitFor(() => AL.evaluate(() => /^[a-f0-9]{8,20}$/.test(window.__m3d.replay.sent || '')), 40000);
	const rid = await AL.evaluate(() => window.__m3d.replay.sent || '');
	A(/^[a-f0-9]{8,20}$/.test(rid), `the run ended and its replay was stored (${rid})`, JSON.stringify(await AL.evaluate(() => { const m = window.__m3d; return { ended: !!m.run.ended, dead: m.world.pl.dead, hp: m.world.pl.hp, mates: m.world.mates.map((q) => ({ dead: q.dead, away: q.away, hp: q.hp })), rp: m.replay, kept: m.kept, notes: m.noteLog.slice(-6) }; })));
	A(await waitFor(() => { const a = row('msurvlive:alice'); return !!a && a.over; }, 20000), "alice's beacon says the run is over");

	// ---- the replay by the 2D address (/msr/<id> redirects to /micasurvivor/?replay=<id>): the 3D page plays it
	A(/^\/msr\/\* \/micasurvivor\/\?replay=:splat 302\r?$/m.test(fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8')), '/msr/<id> still leads to /micasurvivor/?replay=<id>');
	// (a solo 3D Expedition's replay, the path every board's Watch links: dave plays one and faints)
	const DV = await ctxOf('dave');
	await DV.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=4`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => DV.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 40000);
	await waitFor(() => DV.evaluate(() => window.__m3d.replay.taped >= 5), 30000);
	await DV.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.world.pl.hp = 0; m.world.pl.dead = true; });
	await waitFor(() => DV.evaluate(() => /^[a-f0-9]{8,20}$/.test(window.__m3d.replay.sent || '')), 30000);
	const sid = await DV.evaluate(() => window.__m3d.replay.sent || '');
	A(/^[a-f0-9]{8,20}$/.test(sid) && ((await call('micasurvivor-replay-get', { id: sid })).meta || {}).d3 === true, `dave's solo 3D Expedition stored its replay (${sid})`);
	for (const [who, id3] of [['dave (solo)', sid], ['alice (co-op)', rid]]) {
		const V = await ctxOf(null);
		await V.goto(`http://localhost:${PORT}/micasurvivor/?replay=${id3}`, { waitUntil: 'domcontentloaded' });
		const plays = await waitFor(() => V.evaluate((id3) => location.pathname === '/micasurvivor/m3d/' && location.search.includes('replay=' + id3) && !!(window.__m3d && window.__m3d.replay && window.__m3d.replay.state === 'playing'), id3), 60000);
		A(!!id3 && plays, `a logged-out browser opens ${who}'s 3D replay by the 2D address: the 3D page plays it`, JSON.stringify(await V.evaluate(() => ({ href: location.href, end: (document.getElementById('watch-end-title') || {}).textContent || '', rp: window.__m3d && window.__m3d.replay })).catch(() => null)).slice(0, 400));
		await V.close();
	}

	// ---- the player's list has the 3D replay; the friends screen shows it, marked 3D
	const ld3 = await call('micasurvivor-replay-list', {}, tokens.dave), d3e = (ld3.replays3d || []).find((e) => e.id === sid) || {};
	A(!!sid && d3e.d3 === true && d3e.meta && d3e.meta.mode === 'exp-classic' && d3e.meta.map === 'viridian', "dave's replay list has his solo 3D run, with what it was", JSON.stringify(ld3).slice(0, 400));
	const li = await call('micasurvivor-replay-list', {}, tokens.alice), e3 = (li.replays3d || []).find((e) => e.id === rid) || {};
	A(!!rid && e3.d3 === true && e3.meta && e3.meta.d3 === true && e3.meta.frames > 0 && (li.replays || []).every((e) => e.id !== rid), "alice's replay list has it among her 3D replays (and not among the 2D ones)", JSON.stringify(li).slice(0, 400));
	const AM = await menu('alice');
	await AM.evaluate(() => G.FriendsUI.open());
	const shown = await waitFor(() => AM.evaluate((rid) => { const el = document.querySelector(`#fr-replays [data-replay3d="${rid}"]`); return !!el && !!el.querySelector('.d3-badge') && !document.getElementById('fr-replays-h').classList.contains('hidden') && [...el.querySelectorAll('button')].some((b) => b.dataset.href === '/micasurvivor/m3d/?replay=' + rid); }, rid), 15000);
	A(shown, 'the friends screen lists it, marked 3D, its Watch opening the 3D page', await AM.evaluate(() => document.getElementById('fr-replays').innerHTML.slice(0, 400)));
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
