// micasurvivor_m3d_lobbystart_test.mjs — MicaSurvivor 3D, co-op from the online lobby, second part (Plans/MICASURVIVOR_3D_PLAN.md
// §5.72): the lobby's START sends every player to the 3D page. The REAL server handler behind a static server, and signed-in
// friends in the 2D game's own menu, each in a browser context of their own.
//   * it is the default; /micasurvivor/?coop3d=0 on the HOST's browser goes back to 2D co-op
//   * a Dive lobby: alice starts it; the start says it is the 3D one; alice's page goes to the 3D Dive as its host
//     and bob's as a guest, with the lobby's line, and they are in one Dive
//   * an Expedition · Classic lobby: the same, to a 3D Expedition
//   * the server takes the 3D mark only for Classic and Dive lobbies
//   node overworld/tests/micasurvivor_m3d_lobbystart_test.mjs
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
const PORT = 9643;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3dstart-')), 'mp.bundle.mjs');
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
const NAMES = ['alice', 'bob', 'dave', 'erin', 'fay', 'gus'];
for (const n of NAMES) tokens[n] = (await call('register', { username: n, password: 'msurv-m3dstart-pass' })).token;
for (const [x, y] of [['alice', 'bob'], ['dave', 'erin'], ['fay', 'gus']]) { await call('add-friend', { username: x }, tokens[y]); await call('add-friend', { username: y }, tokens[x]); }
A(Object.values(tokens).every(Boolean), 'six real accounts, in three pairs of friends');

// ---- the server: the 3D mark is for Classic and Dive lobbies only
{
	const c = await call('msurv-lobby-create', { dex: 7, rules: 2 }, tokens.fay), id = c.lobby && c.lobby.id;
	await call('msurv-lobby-join', { id, dex: 4, rules: 2 }, tokens.gus);
	await call('msurv-lobby-update', { id, ready: true }, tokens.gus);
	const s = await call('msurv-lobby-update', { id, start: { seed: 5, d3: true } }, tokens.fay);
	A(s.lobby && s.lobby.start && s.lobby.start.seed === 5 && s.lobby.start.d3 === undefined, 'a base (Survival) lobby started with the 3D mark: the server starts it without the mark', JSON.stringify(s.lobby && s.lobby.start || s));
}

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	/** The 2D game's menu, signed in as `who`. q: the address's query. */
	const menu = async (who, q = '') => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1000, height: 620, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)|Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = (await call('state', {}, tokens[who])).state || { username: who };
		await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micasurvivor_lang', 'en'); window.__msurvNet = { ice: [] }; }, tokens[who], st);
		await page.goto(`http://localhost:${PORT}/micasurvivor/${q}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 40000);
		await sleep(300);
		if (await page.evaluate(() => { const e = document.getElementById('tap-start'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })) await page.click('#tap-start');
		// (a new account: its first Pokémon, then the menu, as a player goes)
		if (await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-starters')), 6000)) { await page.evaluate(() => { const c = document.querySelector('#starter-grid .cell'); if (c) c.click(); }); await sleep(300); await page.click('#starter-ok'); }
		await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-menu')), 15000);
		await waitFor(() => page.evaluate(() => G.Game.state === 'ui' && !!G.Social && !!G.PlayUI), 20000);
		await page.evaluate(async () => { await G.Social.start(); if (G.Expedition && G.Expedition.load) await G.Expedition.load(); });
		return page;
	};
	/** A lobby of two in the 2D game: `host` makes it (opts: what it plays), `guest` joins and is ready. -> its id */
	const lobby = async (hp, gp, opts) => {
		const id = await hp.evaluate(async (o) => { const r = await G.Social.createRoom(o); return r && r.id; }, opts);
		const j = await gp.evaluate(async (id) => { const r = await G.Social.joinRoom(id); if (r.ok) await G.Social.setReady(true); return r; }, id);
		const both = await waitFor(() => hp.evaluate(() => { const R = G.Social.room; return !!R && R.members.length === 2 && R.members.every((m) => m.ready); }), 15000);
		return { id, j, both };
	};
	const startIt = (hp) => hp.evaluate(() => { const R = G.Social.room, d3 = G.PlayUI.coop3d(R); setTimeout(async () => { const r = await G.Social.startRoom(4242, d3); if (r.ok) { G.Net.broadcast(r.cfg); G.Flow.startCoop(r.cfg); } }, 50); return d3; });
	const in3d = (p) => waitFor(() => p.evaluate(() => location.pathname === '/micasurvivor/m3d/' && !!(window.__m3d && window.__m3d.ready)), 60000);

	// ---- a Dive lobby, the host opted in
	const A1 = await menu('alice'), B1 = await menu('bob');
	const L = await lobby(A1, B1, { mode: 'exp-dive', map: 'dive:forest', diff: 'normal', opts: { start: 1 } });
	A(/^[0-9a-f]{12}$/.test(L.id || '') && L.j.ok && L.both, 'alice makes a Dive lobby in the 2D game; bob joins and is ready', JSON.stringify(L));
	const sw = [await A1.evaluate(() => G.PlayUI.coop3d(G.Social.room)), await B1.evaluate(() => G.PlayUI.coop3d(G.Social.room)), await A1.evaluate(() => G.PlayUI.coop3d(Object.assign({}, G.Social.room, { opts: { weekly: 3 } }))), await A1.evaluate(() => G.PlayUI.coop3d(Object.assign({}, G.Social.room, { mode: 'exp-survival' })))];
	A(sw[0] === true && sw[1] === true && sw[2] === false && sw[3] === false, 'a lobby of a Dive is a 3D run by default (nothing stored on either browser); never the Weekly Dive or Survival', JSON.stringify(sw));
	A(await startIt(A1) === true, 'alice starts the lobby');
	const a3 = await in3d(A1), b3 = await in3d(B1);
	const ua = await A1.evaluate(() => location.search), ub = await B1.evaluate(() => location.search);
	A(a3 && ua.includes('dive=4242') && ua.includes('route=forest') && ua.includes('host=' + L.id) && ua.includes('lobby=' + L.id), `alice's page goes to the 3D Dive as its host (${ua})`);
	A(b3 && ub.includes('join=' + L.id) && ub.includes('lobby=' + L.id) && ub.includes('lh=alice') && ub.includes('id=1') && ub.includes('dj=4242') && ub.includes('route=forest'), `bob's page goes to it as a guest (${ub})`);
	const st = await call('msurv-lobby-poll', { id: L.id }, tokens.alice);
	A(st.lobby && st.lobby.start && st.lobby.start.d3 === true && st.lobby.start.seed === 4242, 'the lobby\'s start on the server says it is the 3D one');
	const joined = await waitFor(() => B1.evaluate(() => !!(window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined)), 60000);
	const pair = joined ? [await A1.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), mates: m.world.mates.map((q) => q.id + ':' + q.dex), modes: m.link.modes, floor: m.dive.floor }; }), await B1.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), floor: m.guestDive.floor, mode: m.link.modes.alice, reloaded: /gen=4242/.test(location.search) }; })] : [];
	A(joined && pair[0].stairs === pair[1].stairs && pair[0].mates.length === 1 && pair[0].mates[0].startsWith('1:') && pair[1].floor === 1 && (pair[1].mode === 'direct' || pair[1].mode === 'relay'), 'they are in one 3D Dive, linked, bob as player 1', JSON.stringify(pair));
	const direct = await waitFor(() => A1.evaluate(() => window.__m3d.link.modes.bob === 'direct'), 45000);
	A(direct, 'they are linked DIRECTLY: the old negotiation the 2D lobby left on the server is cleared first (before that fix the host read it and dropped to the slow relay for the whole run)', JSON.stringify(await A1.evaluate(() => [window.__m3d.link.modes, window.__m3d.link.waited])));
	// ---- (part 3) the run is kept by both: the team's result, the same pay, each in their own save
	const saveOf = (p, who) => p.evaluate((who) => { try { const s = JSON.parse(localStorage.getItem('micasurvivorexp_save.mp:' + who) || 'null'); return s ? { c: s.counters || {}, dev: localStorage.getItem('micasurvivorexp_dev.mp:' + who) } : null; } catch (e) { return null; } }, who);
	A(await A1.evaluate(() => window.__m3d.diveSave.practice === null && window.__m3d.diveSave.ok === true), "a lobby's host plays a Dive that can be kept (its start's own parameters are fair)", JSON.stringify(await A1.evaluate(() => window.__m3d.diveSave)));
	await A1.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.dive.bank = 40; m.world.pl.hp = 0; m.world.pl.dead = true; });
	const hk = await waitFor(() => A1.evaluate(() => !!window.__m3d.kept && window.__m3d.kept.ok === true), 15000);
	const gk = await waitFor(() => B1.evaluate(() => !!window.__m3d.kept), 20000);
	const ka = await A1.evaluate(() => window.__m3d.kept), kb = await B1.evaluate(() => window.__m3d.kept);
	A(hk && ka.pay === 120, 'the host faints with 40 secured: its Dive is saved, ₽ 120 owed', JSON.stringify(ka));
	A(gk && kb.ok === true && kb.pay === 120 && await B1.evaluate(() => { const e = document.getElementById('rx-kept'); return !!e && e.textContent.includes('Saved.') && document.getElementById('rx-end').textContent.includes('120'); }), "the guest's screen says it is saved too, with the same ₽ 120", JSON.stringify(kb));
	const sa = await saveOf(A1, 'alice'), sb = await saveOf(B1, 'bob');
	A(sa && sa.c['dive.runs'] === 1 && sa.c['pay3d.' + sa.dev] === 120, "alice's save has the Dive and her pay", JSON.stringify(sa && [sa.c['dive.runs'], sa.c['pay3d.' + sa.dev]]));
	A(sb && sb.c['dive.runs'] === 1 && sb.c['pay3d.' + sb.dev] === 120 && sb.c['dive.forest.best'] === 1 && sb.c['lg.runs.1'] === 1, "bob's own save has it too: the Dive, his pay, his League member's run", JSON.stringify(sb && sb.c));
	A(sa.dev !== sb.dev && !sb.c['pay3d.' + sa.dev], 'each is owed on their own browser only');
	// ---- (part 4) back to the lobby: the end screen's Leave
	const leaveOf = (p) => p.evaluate(() => (document.getElementById('rx-leave') || {}).href || '');
	const la = await leaveOf(A1), lb = await leaveOf(B1);
	A(la.endsWith('/micasurvivor/?lobby=' + L.id) && lb.endsWith('/micasurvivor/?lobby=' + L.id), "on both end screens, Leave leads back to the lobby", JSON.stringify([la, lb]));
	const backTo = async (p) => { await p.evaluateOnNewDocument(() => { window.__msurvNet = { ice: [] }; }); await p.goto(`http://localhost:${PORT}/micasurvivor/?lobby=${L.id}`, { waitUntil: 'domcontentloaded' }); await waitFor(() => p.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 40000); await sleep(300); if (await p.evaluate(() => { const e = document.getElementById('tap-start'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })) await p.click('#tap-start'); await waitFor(() => p.evaluate(() => G.UI.isOpen('scr-menu') || G.UI.isOpen('scr-lobby')), 15000); };   // (the menu, as a player reaches it)
	await backTo(B1);   // (the guest first: the lobby is still marked as started)
	const gBack = await waitFor(() => B1.evaluate((id) => !!G.Social && !!G.Social.room && G.Social.room.id === id && G.UI.isOpen('scr-lobby'), L.id), 20000);
	await sleep(2500);
	A(gBack && await B1.evaluate(() => location.pathname === '/micasurvivor/' && !location.search), 'the guest is back in the lobby, and the old start does not send it to the 3D page again', JSON.stringify(await B1.evaluate(() => ({ path: location.pathname, room: !!(G.Social && G.Social.room), screens: G.UI.isOpen && G.UI.isOpen('scr-lobby') }))));
	await backTo(A1);
	const hBack = await waitFor(() => A1.evaluate((id) => { const R = G.Social && G.Social.room; return !!R && R.id === id && R.isHost && R.open && !R.start && R.members.length === 2 && G.UI.isOpen('scr-lobby'); }, L.id), 20000);
	A(hBack, 'the host is back in it and it is open again: no start, both members still in', JSON.stringify(await A1.evaluate(() => G.Social.room && { open: G.Social.room.open, start: !!G.Social.room.start, n: G.Social.room.members.length })));
	A(await waitFor(() => B1.evaluate(() => { const R = G.Social.room; return !!R && R.open && !R.start && R.members.some((m) => m.uid === 'bob' && !m.ready); }), 15000), 'the guest sees it open, and is "not ready" for the next run');
	// …and the next run starts from it
	await B1.evaluate(() => G.Social.setReady(true));
	await waitFor(() => A1.evaluate(() => G.Social.room.members.every((m) => m.ready)), 15000);
	A(await startIt(A1) === true && await in3d(A1) && await in3d(B1), 'ready again, the host starts: both are in a new 3D Dive');
	await A1.close(); await B1.close();

	// ---- an Expedition · Classic lobby
	const A2 = await menu('dave'), B2 = await menu('erin');
	const L2 = await lobby(A2, B2, { mode: 'exp-classic', map: 'viridian', diff: 'normal', opts: {} });
	A(L2.both && await startIt(A2) === true, 'dave starts an Expedition · Classic lobby with erin', JSON.stringify(L2));
	const a4 = await in3d(A2), b4 = await in3d(B2);
	const ud = await A2.evaluate(() => location.search), ue = await B2.evaluate(() => location.search);
	A(a4 && b4 && ud.includes('exp=4242') && ud.includes('map=viridian') && ud.includes('diff=normal') && ud.includes('host=' + L2.id) && ue.includes('join=' + L2.id) && ue.includes('xj=4242') && ue.includes('map=viridian'), `both go to the 3D Expedition (${ud} / ${ue})`);
	const joined2 = await waitFor(() => B2.evaluate(() => !!(window.__m3d.rv && window.__m3d.net.joined)), 60000);
	A(joined2 && await A2.evaluate(() => window.__m3d.world.mates.length === 1 && !!window.__m3d.run), 'and are in one 3D Expedition run');
	await A2.close(); await B2.close();

	// ---- a browser can go back to 2D co-op
	const A3 = await menu('fay', '?coop3d=0');
	A(await A3.evaluate(() => G.PlayUI.coop3d({ mode: 'exp-dive', opts: { start: 1 } }) === false && localStorage.getItem('micasurvivor_coop3d') === '0'), '/micasurvivor/?coop3d=0 on the host\'s browser: its lobbies start the 2D run');
	await A3.goto(`http://localhost:${PORT}/micasurvivor/?coop3d=1`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => A3.evaluate(() => typeof G === 'object' && !!G.PlayUI && G.PlayUI.coop3d({ mode: 'exp-dive', opts: { start: 1 } }) === true && localStorage.getItem('micasurvivor_coop3d') === null), 30000), '?coop3d=1 returns to 3D co-op');
	const src = fs.readFileSync(path.join(ROOT, 'micasurvivor/js/ui/social-ui.js'), 'utf8');
	A(src.includes('G.Social.startRoom(Math.floor(Math.random() * 1e6), !!(G.PlayUI && G.PlayUI.coop3d && G.PlayUI.coop3d(room)))'), "the lobby screen's START button asks the same switch");
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
