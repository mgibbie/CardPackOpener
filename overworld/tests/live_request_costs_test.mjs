// live_request_costs_test.mjs — the three biggest live-request costs, cut (owner, 2026-11-19: the Cloudflare plan bills
// every server request; tools/live-request-report.mjs measured them). Real server (server/mp.mjs over node:sqlite),
// two real accounts, headless Chrome.
//   1. FRIENDS ON THE SAME MAP (overworld/ow_pvp.js coPresenceTick, trackMyTrail; main.js presLoop): used to be a
//      friends poll every 0.4 s + a heartbeat every 0.45 s while moving (~125 calls/min each). Now one request per
//      tick: 0.7 s while either moves, 1 s while neither does, and at once on a first step (the owner: 4 s was "way too much"
//      delay walking with a friend). The ghost still walks the friend's real path (the
//      heartbeat carries their trail) and lands on their tile soon after they stop, without teleporting.
//   2. CHAT (battlecards/chat.js): minimised (it starts so) or hidden, it polls every POLL_SLOW (12 s), not 1.5 s; a
//      new message still lights the pill within that; opening it polls at once and then every 1.5 s.
//   3. BATTLE BROADCAST (overworld/ow_frontier.js frontierPublish): with nobody watching, a battle sends only a
//      keep-alive every 10 s (the board rides along when it changed), not a snapshot every 1.2 s; the server keeps the
//      last board, so a watcher who arrives sees it at once; then the runner switches to the 1.2 s cadence.
//   4. the server: a keep-alive keeps the last board and its seq; a heartbeat's trail comes back on `friends`, and a
//      heartbeat withFriends answers with the friends list.
//   node overworld/tests/live_request_costs_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return st.get(...bound) ?? null; }, async run() { return st.run(...bound); }, async all() { return { results: st.all(...bound) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-reqcost-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
process.env.MP_GC_RATE = '0';
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.31.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const accounts = new Map();   // token -> username
async function account(username) {
	const r = await call('register', { username, password: 'req-cost-pass' });
	if (!r.token) throw new Error('register ' + username + ': ' + JSON.stringify(r));
	accounts.set(r.token, username);
	return { username, token: r.token };
}
async function befriend(a, b) { await call('add-friend', { username: a.username }, b.token); await call('add-friend', { username: b.username }, a.token); }

// ===== 4. the server =====
{
	const p = await account('rc_srv_p'), v = await account('rc_srv_v'); await befriend(p, v);
	const board = { kind: 'battle', facility: 'Wild X', me: { name: 'A', curHP: 5, maxHP: 9 }, foe: { name: 'B', curHP: 7, maxHP: 9 } };
	await call('publish-factory', { snapshot: board, label: 'Wild X', seq: 4 }, p.token);
	const ka = await call('publish-factory', { snapshot: null, keep: true, label: 'Wild X', seq: 6 }, p.token);
	const fs1 = await call('factory-state', { username: p.username }, v.token);
	A(ka.ok && typeof ka.watchers === 'number' && fs1.snapshot && fs1.snapshot.me && fs1.snapshot.me.name === 'A' && fs1.seq === 4,
		'a keep-alive keeps the last board and its seq: a watcher who arrives gets the board at once', { ka, fs1 });
	const ka2 = await call('publish-factory', { snapshot: null, keep: true, label: 'Wild X', seq: 6 }, p.token);
	A(ka2.watchers === 1, 'the keep-alive answers with the watcher count (how the runner learns to publish fully)', ka2);
	await call('publish-factory', { snapshot: null, label: 'Wild X', seq: 7, over: true }, p.token);
	await call('publish-factory', { snapshot: null, keep: true, label: 'Next', seq: 8 }, p.token);
	const fs2 = await call('factory-state', { username: p.username }, v.token);
	A(!fs2.snapshot, 'a finished battle\'s board is not carried into the next battle\'s keep-alive', fs2);
	const trail = [[3, 4], [4, 4], [5, 4]];
	const hb = await call('heartbeat', { map: 'Route101', x: 5, y: 4, facing: 'right', status: 'roaming', region: 'Route 101', trail, step: 12, withFriends: true }, p.token);
	A(Array.isArray(hb.friends) && hb.friends.some(f => f.username === v.username), 'a heartbeat withFriends answers with the friends list (one request per co-located tick)', hb);
	const fr = await call('friends', {}, v.token);
	const me = (fr.friends || []).find(f => f.username === p.username);
	A(me && me.step === 12 && JSON.stringify(me.trail) === JSON.stringify(trail), 'the trail and its step number come back on friends', me);
	await call('heartbeat', { map: 'Route101', x: 5, y: 4, facing: 'right', status: 'roaming', region: '', trail: [[1, 1], ['x', 2]], step: 3 }, p.token);
	const me2 = ((await call('friends', {}, v.token)).friends || []).find(f => f.username === p.username);
	A(me2 && me2.trail === undefined, 'a malformed trail is dropped whole (its numbering would be wrong)', me2);
	const plain = await call('heartbeat', { map: 'Route101', x: 5, y: 4 }, p.token);
	A(plain.ok && plain.friends === undefined, 'a plain heartbeat still answers just ok', plain);
}

// ---------- the static server, counting /api/mp by account ----------
const hits = [];   // { user, action, at, body }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
		let body = {}; try { body = JSON.parse(raw); } catch { /* counted as '?' */ }
		hits.push({ user: accounts.get(tok) || 'guest', action: String(body.action || '?'), at: Date.now(), body });
		const user = accounts.get(tok) || 'guest';
		let h = 7; for (const c of user) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.40.' + (1 + (h >> 8) % 250) + '.' + (1 + h % 250), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const count = (user, actions, from, to = Date.now()) => hits.filter(h => h.user === user && actions.includes(h.action) && h.at >= from && h.at < to);

const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const PARTY = [{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }];
const STORY = JSON.stringify({ flags: { intro_done: true, intro_started: true, intro_greeted: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} });
const OW_SAVE = { magepunk_region: 'HOENN', magepunk_story: STORY, magepunk_party_v1: JSON.stringify(PARTY), magepunk_pos_v1: JSON.stringify({ map: 'Route101', x: 10, y: 10 }), magepunk_repel_v1: '99999' };

let browser;
const pageErrors = [];
async function open(who, url, ls = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
	page.on('pageerror', (e) => pageErrors.push(who.username + ': ' + e.message));
	const st = (await call('state', {}, who.token)).state || { username: who.username };
	await page.evaluateOnNewDocument((tok, st, ls) => {
		try {
			if (!sessionStorage.getItem('rc_seeded')) { sessionStorage.setItem('rc_seeded', '1'); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }
			localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		} catch { /* ignore */ }
	}, who.token, st, ls);
	await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
	return page;
}
const owUp = (page) => waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.world.current.layout && window.__ow.MP_ON)), 60000);
const clearOw = (page) => page.evaluate(() => { const o = window.__ow; for (let i = 0; i < 30 && o.dialog.blocking; i++) o.dialog.key('x'); });

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

	// ===== 1. two friends on the same map =====
	{
		const a = await account('rc_here_a'), b = await account('rc_here_b'); await befriend(a, b);
		const pa = await open(a, '/overworld/index.html', OW_SAVE), pb = await open(b, '/overworld/index.html', OW_SAVE);
		A(await owUp(pa) && await owUp(pb), 'both overworlds boot signed in on Route 101');
		await clearOw(pa); await clearOw(pb);
		// each sees the other (B booted with A's presence possibly not there yet: let a poll land)
		await pb.evaluate(() => window.__ow.pollPresence()); await pa.evaluate(() => window.__ow.pollPresence());
		const seen = await waitFor(async () => (await pa.evaluate(n => window.__ow.ghosts.has(n), b.username)) && (await pb.evaluate(n => window.__ow.ghosts.has(n), a.username)), 15000);
		A(seen, 'each sees the other\'s ghost');
		await sleep(6000);   // (both idle: the co-located cadence settles to the idle tick)
		const presence = ['friends', 'heartbeat'];
		const ti = Date.now(); await sleep(20000);
		const idleA = count(a.username, presence, ti).length, idleB = count(b.username, presence, ti).length;
		A(idleA >= 8 && idleB >= 8 && idleA <= 24 && idleB <= 24, `standing side by side, idle: at most 24 presence calls each in 20 s (one per 1 s tick; it was ~50 at 0.4 s) — ${idleA} / ${idleB}`);

		// B walks 5 tiles right; A's ghost of B walks there too, tile by tile, and lands on B's tile
		const start = await pb.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty]);
		const samples = [];
		let sampling = true;
		const sampler = (async () => { while (sampling) { const g = await pa.evaluate(n => { const g = window.__ow.ghosts.get(n); return g ? [g.px / 16, g.py / 16] : null; }, b.username).catch(() => null); if (g) samples.push({ t: Date.now(), g }); await sleep(50); } })();
		const tw = Date.now();
		const moved = await pb.evaluate(() => window.__ow.pumpPlayer('right', false, 700));
		const end = await pb.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty]);
		const tStop = Date.now();
		const reached = await waitFor(() => pa.evaluate((n, x, y) => { const g = window.__ow.ghosts.get(n); return !!g && Math.round(g.px / 16) === x && Math.round(g.py / 16) === y && !g.path.length; }, b.username, end[0], end[1]), 10000);
		const lag = Date.now() - tStop;
		sampling = false; await sampler;
		A(moved >= 3 && end[0] - start[0] >= 3, `B walked ${end[0] - start[0]} tiles`);
		// (B set off after standing still: B's first step beats at once, and A hears of it on its next idle tick, <= 1 s)
		const firstMove = samples.find(s => s.t >= tw && samples.length && Math.hypot(s.g[0] - start[0], s.g[1] - start[1]) >= 0.5);
		const setOff = firstMove ? firstMove.t - tw : Infinity;
		A(setOff <= 1800, `A sees B set off within ~1.5 s of B's first step (owner: a 4 s delay was "way too much") — ${setOff} ms`);
		A(reached && lag <= 4000, `A's ghost of B reaches B's tile within 4 s of B stopping (${lag} ms)`);
		const gx = samples.filter(s => s.t >= tw).map(s => s.g[0]), covered = gx.length ? Math.max(...gx) - Math.min(...gx) : 0;
		let maxJump = 0; for (let i = 1; i < samples.length; i++) maxJump = Math.max(maxJump, Math.hypot(samples[i].g[0] - samples[i - 1].g[0], samples[i].g[1] - samples[i - 1].g[1]) / Math.max(1, (samples[i].t - samples[i - 1].t) / 50));
		A(covered >= end[0] - start[0] - 0.5 && maxJump <= 1.2, `...walking the whole way there, no teleport (covered ${covered.toFixed(1)} of ${end[0] - start[0]} tiles; largest move per 50 ms ${maxJump.toFixed(2)} tiles)`);

		// both walking back and forth: one presence request per 1.5 s tick each
		let walking = true;
		const walker = async (p) => { let d = 'left'; while (walking) { await p.evaluate(dir => window.__ow.pumpPlayer(dir, false, 500), d).catch(() => {}); d = d === 'left' ? 'right' : 'left'; await sleep(150); } };
		const ws = [walker(pa), walker(pb)];
		await sleep(2000);
		const tm = Date.now(); await sleep(15000);
		const walkA = count(a.username, presence, tm).length, walkB = count(b.username, presence, tm).length;
		walking = false; await Promise.all(ws);
		A(walkA <= 24 && walkB <= 24, `walking side by side: at most 24 presence calls each in 15 s (one per 0.7 s tick, <= ~95/min; it was ~125/min) — ${walkA} / ${walkB}`);
		const beats = count(a.username, ['heartbeat'], tm);
		A(beats.some(h => Array.isArray(h.body.trail) && h.body.trail.length >= 2 && Number.isInteger(h.body.step) && h.body.withFriends), 'a co-located heartbeat carries the trail and asks for the friends list', beats.slice(-1).map(h => h.body));
		await pa.browserContext().close(); await pb.browserContext().close();
	}

	// ===== 3 + 2. a battle nobody watches, then somebody does; its chat =====
	{
		const a = await account('rc_bat_a'), v = await account('rc_bat_v'); await befriend(a, v);
		const pa = await open(a, '/overworld/index.html', OW_SAVE);
		A(await owUp(pa), 'the runner\'s overworld boots');
		await clearOw(pa);
		await pa.evaluate(() => window.__ow.startWildBattle({ id: 'blissey', level: 100 }));
		A(await waitFor(() => pa.evaluate(() => !!(window.__ow.battle.active && window.__ow.battle.active.foe)), 20000), 'a long wild battle starts');
		const first = await waitFor(() => count(a.username, ['publish-factory'], 0).some(h => h.body.snapshot && h.body.snapshot.me), 8000);
		A(first, 'its first real board is published at once');
		const t0 = Date.now(); await sleep(24000);
		const pubs = count(a.username, ['publish-factory'], t0);
		A(pubs.length <= 4, `nobody watching: at most 4 publishes in 24 s (a keep-alive every 10 s; it was a snapshot every 1.2 s, ~20) — ${pubs.length}`);
		A(pubs.some(h => h.body.keep === true && h.body.snapshot == null), 'an unchanged board (the battle waits on a move) goes as a keep-alive, no snapshot', pubs.map(h => ({ keep: h.body.keep, snap: !!h.body.snapshot })));

		// CHAT, minimised (the battle mounted it as the pill): a slow poll
		A(await pa.evaluate(() => !!document.querySelector('#mp-chat.min')), 'the battle\'s chat is mounted, minimised');
		const cg = count(a.username, ['chat-get'], t0).filter(h => String(h.body.room || '').startsWith('u:'));
		A(cg.length <= 3, `minimised chat: at most 3 chat polls in 24 s (one per 12 s; it was every 1.5 s, ~16) — ${cg.length}`);
		const tPost = Date.now();
		await call('chat-post', { room: 'u:' + a.username, text: 'hello from the test' }, a.token);
		const flashed = await waitFor(() => pa.evaluate(() => !!document.querySelector('#mp-chat .mc-min.flash')), 16000);
		A(flashed, `a new message still lights the minimised pill within the slow interval (${Date.now() - tPost} ms)`);
		const tOpen = Date.now();
		await pa.evaluate(() => document.querySelector('#mp-chat .mc-min').click());
		const quick = await waitFor(() => count(a.username, ['chat-get'], tOpen).some(h => String(h.body.room || '').startsWith('u:')), 800);
		A(quick, 'opening the chat polls at once');
		await sleep(5000);
		const openPolls = count(a.username, ['chat-get'], tOpen).filter(h => String(h.body.room || '').startsWith('u:')).length;
		A(openPolls >= 3, `open, it polls fast (~1.5 s): ${openPolls} polls in 5 s`);
		await pa.evaluate(() => document.querySelector('#mp-chat .mc-min').click());   // (minimised again)

		// a WATCHER arrives: the board at once, then the runner publishes fully
		const tw = Date.now();
		const fs1 = await call('factory-state', { username: a.username }, v.token);
		A(fs1.snapshot && fs1.snapshot.me && fs1.snapshot.foe && Date.now() - tw < 2000, 'a watcher\'s first look gets the board at once (the server kept the last one)', fs1);
		let polling = true;
		const viewer = (async () => { while (polling) { await call('factory-state', { username: a.username }, v.token); await sleep(1000); } })();
		const fast = await waitFor(() => {
			const ps = count(a.username, ['publish-factory'], tw).filter(h => h.body.snapshot);
			return ps.length >= 3 && ps[ps.length - 1].at - ps[ps.length - 3].at <= 3500;
		}, 15000);
		A(fast, `once watched, the board is published at the full cadence (within ${Math.round((Date.now() - tw) / 1000)} s of the watcher arriving)`);
		polling = false; await viewer;
		await pa.browserContext().close();
	}
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
if (pageErrors.length) console.log('page errors:', [...new Set(pageErrors)].slice(0, 5));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
