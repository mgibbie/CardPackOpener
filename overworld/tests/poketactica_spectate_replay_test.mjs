// poketactica_spectate_replay_test.mjs — Poketactica live spectating, bets and replays, end to end (stage 8; owner's house
// rules, Plans/NEW_GAME_RULES.md §4). The REAL server handler (server/mp.mjs, bundled like the dev server, over sqlite)
// behind a static server, headless browsers:
//   alice plays /poketactica/ signed in (publish-poketactica, presence 'poketactica:<label>', a bet report each turn),
//   bob (her friend) watches /poketactica/?spectate=alice (poketactica-state), carol (a stranger) can't.
// Asserts: the server takes the actions (friends only, a junk replay id dropped), bob's live list routes Watch to the
// page, bob's board converges on alice's (no seed in what he gets), alice wins a real battle, its recipe goes to the
// tape store and the account's replay library, bob's end screen offers the full battle, the replay (signed out) re-runs
// to alice's final board, a clip link (&t=) opens at its moment, ←/→ step, Z plays; a guest's battle broadcasts nothing.
//   node overworld/tests/poketactica_spectate_replay_test.mjs
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
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8697;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const apiLog = [];

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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-poketactica-e2e-')), 'mp.bundle.mjs');
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { apiLog.push({ action: String(JSON.parse(raw).action), auth: String(req.headers.authorization || '') }); } catch { /* not JSON */ }
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'poketactica-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice and bob are friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server actions on their own ----------
{
	const pub = await call('publish-poketactica', { seq: 1, label: 'Poketactica · First Steps · Turn 1', snapshot: { turn: 1 }, bet: { run: 'camp-c1-1-x', prog: 1 } }, tokens.carol);
	A(pub.ok && pub.mark === 2, 'publish-poketactica accepts a signed-in player; betting closes on turn 2 (bets.mjs MARK)', pub);
	const strangers = await call('poketactica-state', { username: 'carol' }, tokens.alice);
	A(strangers.error && /friend/.test(strangers.error), "a stranger can't read the battle (friends only)", strangers);
	A(!!(await call('publish-poketactica', { seq: 1, label: 'x' })).error, 'publishing needs an account');
	await call('publish-poketactica', { seq: 2, label: 'x', over: true, replay: '<script>' }, tokens.carol);
	const r = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'poketacticastate:carol'").get();
	const row = r ? JSON.parse(r.value) : {};
	A(row.over && !row.replay, 'a Poketactica battle has its own row, and a replay that is not a tape id is dropped from the last push', row);
}

// a saved collection: three level-14 figurines (the battle starts at the team screen)
const MOVE = { pikachu: 'thundershock', machamp: 'karatechop', charmander: 'ember' };
const FIGS3 = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(Object.keys(MOVE).map((sp, i) => [sp + '-e2e' + i, { v: 1, id: sp + '-e2e' + i, species: sp, level: 14, exp: 0, ability: null, shiny: false, pool: [{ id: MOVE[sp], lv: 1, xp: 0 }], equipped: [MOVE[sp]] }])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
	const open = async (who, url, figs = null) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st, figs) => {
			try {
				localStorage.setItem('micatro_sfx', '0');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st, figs);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)), 60000);
		return { ctx, page, errors };
	};
	const E = (page, fn, ...args) => page.evaluate(fn, ...args);
	const idle = (page) => E(page, () => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 20000 ? r() : setTimeout(k, 60)); k(); }));
	const unitsSig = (S) => JSON.stringify(S.units.map((u) => [u.uid, u.x, u.y, u.hp]));

	// ---- alice plays, signed in ----
	const alice = await open('alice', '/poketactica/', FIGS3);
	A(await E(alice.page, () => window.__poketactica.mode === 'normal' && window.__poketactica.P.screen === 'camp'), 'alice: the page boots to camp (signed in)');
	await alice.page.keyboard.press('KeyZ'); await sleep(800);
	A(await E(alice.page, () => window.__poketactica.P.screen === 'battle' && window.__poketactica.P.S.map.name === 'First Steps'), 'alice: Z starts First Steps');
	const listed = await waitFor(async () => { const r = await call('live-friends', {}, tokens.bob); return (r.live || []).some((f) => f.username === 'alice' && f.kind === 'poketactica' && /^Poketactica · First Steps/.test(f.label)); }, 15000);
	A(listed, "bob's live-friends lists alice with kind 'poketactica' and her progress label", JSON.stringify(await call('live-friends', {}, tokens.bob)).slice(0, 300));
	const af = ((await call('friends', {}, tokens.bob)).friends || []).find((f) => f.username === 'alice');
	A(af && /^poketactica:Poketactica · First Steps/.test(af.status), "alice's presence status is 'poketactica:<label>'", af);
	A(!((await call('live-friends', {}, tokens.carol)).live || []).some((f) => f.username === 'alice'), "a stranger's live list doesn't show alice");
	const LW = await import(pathToFileURL(path.join(ROOT, 'site/livewatch.js')).href);
	A(LW.watchHref({ username: 'alice', kind: 'poketactica' }) === '/poketactica/?spectate=alice' && LW.activityFromStatus('poketactica:Poketactica · Dungeon floor 3 · Turn 2', '').label === 'Playing Poketactica — Dungeon floor 3 · Turn 2', 'the shared live-watch routes a poketactica friend to the spectator page and reads "Playing Poketactica — …"');
	const RL = await import(pathToFileURL(path.join(ROOT, 'site/replaylib.js')).href);
	A(RL.replayHref('poketactica', 'abcd1234') === '/poketactica/?replay=abcd1234' && RL.GAME_NAME.poketactica === 'Poketactica', 'the replay library opens a Poketactica replay on the page');

	// ---- bob watches ----
	const bob = await open('bob', '/poketactica/?spectate=alice');
	A(await E(bob.page, () => window.__poketactica.mode === 'spectate'), 'bob: the spectator page is up');
	const sameBoard = () => waitFor(async () => (await E(bob.page, () => { const S = window.__poketactica.P.S; return S && S.map && JSON.stringify(S.units.map((u) => [u.uid, u.x, u.y, u.hp])); })) === (await E(alice.page, () => JSON.stringify(window.__poketactica.P.S.units.map((u) => [u.uid, u.x, u.y, u.hp])))), 15000);
	A(await sameBoard(), "bob's board shows alice's battle");
	A(await E(bob.page, () => { const P = window.__poketactica.P; return P.S.map.w > 0 && !('seed' in P.S) && !('rng' in P.S) && P.screen === 'spectate'; }), 'what bob gets carries no seed or RNG state');
	A(await E(bob.page, () => getComputedStyle(document.getElementById('b-end')).display === 'none' && getComputedStyle(document.getElementById('b-exec')).display === 'none'), "bob's page has no play controls");
	// alice deploys: bob follows
	await E(alice.page, () => { const P = window.__poketactica.P; return window.__poketactica.act({ t: 'deploy', uid: 'p0' }); }); await idle(alice.page);
	A(await sameBoard(), "bob's board follows alice's deploy");

	// ---- alice plays the battle out (deploy, step toward a foe, attack what is in reach, Execute, end the phase) ----
	const result = await E(alice.page, async () => {
		const T = window.__poketactica, P = T.P, B = T.B;
		const wait = () => new Promise((r) => { const k = () => (!P.busy ? r() : setTimeout(k, 40)); k(); });
		for (let guard = 0; guard < 400 && !P.S.over; guard++) {
			const S = P.S;
			if (S.phase !== 'player') { await wait(); continue; }
			for (const u of S.units.filter((x) => x.side === 'p' && x.hp > 0 && x.x == null)) if (!B.unitAt(S, S.map.base.x, S.map.base.y)) { T.act({ t: 'deploy', uid: u.uid }); await wait(); }
			for (const u of B.onMap(S, 'p')) {
				const foes = B.onMap(S, 'e'); if (!foes.length || S.over) break;
				const near = (x, y) => Math.min(...foes.map((f) => Math.abs(f.x - x) + Math.abs(f.y - y)));
				if (!u.moved) { const t = [...B.moveTiles(S, u).values()].sort((a, b) => near(a.x, a.y) - near(b.x, b.y))[0]; if (t && (t.x !== u.x || t.y !== u.y)) { T.act({ t: 'move', uid: u.uid, x: t.x, y: t.y }); await wait(); } }
				if (!u.acted) for (const mid of u.fig.equipped) { let hit = false; for (const f of foes) { const r = B.act(JSON.parse(JSON.stringify(S)), { t: 'attack', uid: u.uid, move: mid, x: f.x, y: f.y }, P.data); if (r.ok) { T.act({ t: 'attack', uid: u.uid, move: mid, x: f.x, y: f.y }); hit = true; break; } } if (hit) break; }
				await wait();
			}
			if (S.queue.length) { T.act({ t: 'execute' }); await wait(); }
			if (!P.S.over) { T.act({ t: 'end' }); await wait(); }
		}
		return { over: P.S.over, actions: P.actions.length, view: JSON.stringify(B.view(P.S)) };
	});
	A(result.over === 'won' && result.actions > 5, `alice wins First Steps (${result.actions} actions)`, result.over);
	A(await waitFor(() => E(alice.page, () => !document.getElementById('result').hidden), 5000), "alice's results open");
	const rid = await (async () => { let id = null; await waitFor(async () => (id = await E(alice.page, () => window.__poketactica.P.replayId)), 15000); return id; })();
	A(/^[a-f0-9]{8,20}$/.test(String(rid)), 'the battle went to the tape store (a replay id)', rid);
	A(await waitFor(() => E(alice.page, () => /Watch replay/.test(document.querySelector('#result .bal-modal-acts').textContent)), 5000), "alice's results offer Watch replay (V) and Copy link (C)");
	const lib = await call('replay-library', {}, tokens.alice);
	A((lib.replays || []).some((r) => r.game === 'poketactica' && r.id === rid && /First Steps/.test(r.label)), "alice's replay library lists it as a Poketactica battle", lib.replays);
	A(await waitFor(() => E(bob.page, () => !document.getElementById('result').hidden && /Watch the full battle/.test(document.getElementById('r-again').textContent)), 20000), "bob's end screen offers the full battle");
	const rowA = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'poketacticastate:alice'").get();
	const ra = rowA ? JSON.parse(rowA.value) : {};
	A(ra.over && ra.won && ra.replay === rid && ra.bet && /^camp-c1-1-/.test(ra.bet.run) && ra.bet.res === 'win', "the last push carries the result, the replay and the bet's result", ra);

	// ---- the replay, signed out ----
	const viewer = await open(null, '/poketactica/?replay=' + rid);
	A(await waitFor(() => E(viewer.page, () => window.__poketactica.mode === 'replay' && window.__poketactica.replayTotal > 0), 20000), 'the replay opens signed out');
	const total = await E(viewer.page, () => window.__poketactica.replayTotal);
	A(total === result.actions, `it holds every action (${total})`);
	await E(viewer.page, (k) => window.__poketactica.replayTo(k), total);
	A((await E(viewer.page, () => JSON.stringify(window.__poketactica.B.view(window.__poketactica.P.S)))) === result.view, "re-run to its end, the replay is alice's final board");
	A(await E(viewer.page, () => !document.getElementById('rp-bar').hidden && getComputedStyle(document.getElementById('b-end')).display === 'none'), 'the replay has its own bar and no play controls');
	// a clip link opens at its moment; ←/→ step; X back to the start; Z plays
	const clip = await open(null, '/poketactica/?replay=' + rid + '&t=3');
	A(await waitFor(() => E(clip.page, () => window.__poketactica.replayAt && window.__poketactica.replayAt() === 3), 20000), 'a clip link (&t=3) opens at action 3');
	await clip.page.keyboard.press('ArrowRight'); await idle(clip.page);
	A(await E(clip.page, () => window.__poketactica.replayAt() === 4 && document.getElementById('rp-pos').textContent === '4 / ' + window.__poketactica.replayTotal), '→ steps forward (4)');
	await clip.page.keyboard.press('ArrowLeft'); await sleep(200);
	A(await E(clip.page, () => window.__poketactica.replayAt() === 3), '← steps back (3)');
	await clip.page.keyboard.press('KeyX'); await sleep(200);
	A(await E(clip.page, () => window.__poketactica.replayAt() === 0), 'X goes back to the start');
	await clip.page.keyboard.press('KeyZ');
	A(await waitFor(() => E(clip.page, () => window.__poketactica.replayAt() >= 3), 15000), 'Z plays it');
	await E(clip.page, () => document.getElementById('rp-play').click());
	const at = await E(clip.page, () => window.__poketactica.replayAt()); await sleep(1200); await idle(clip.page);
	A((await E(clip.page, () => window.__poketactica.replayAt())) <= at + 1, 'tapping Pause stops it');
	A(await E(clip.page, () => { const b = document.getElementById('rp-clip').getBoundingClientRect(); return b.width > 0 && b.bottom <= innerHeight; }), "the bar's Moment button (a link to this moment) is on screen");

	// ---- a guest's battle broadcasts nothing ----
	const before = apiLog.filter((h) => h.action === 'publish-poketactica').length;
	const guest = await open(null, '/poketactica/', FIGS3);
	await guest.page.keyboard.press('KeyZ'); await sleep(2500);
	A(await E(guest.page, () => window.__poketactica.P.screen === 'battle'), "a guest's battle plays");
	A(apiLog.filter((h) => h.action === 'publish-poketactica').length === before, "... and isn't broadcast");

	for (const [n, t] of [['alice', alice], ['bob', bob], ['viewer', viewer], ['clip', clip], ['guest', guest]]) A(t.errors.length === 0, `no page errors (${n})`, t.errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
