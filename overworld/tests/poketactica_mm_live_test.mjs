// poketactica_mm_live_test.mjs — MYSTERY MAZE: resume, live spectating and replays against the REAL server (owner,
// 2026-11-23: "Both of these single player sub games need to have spectation/replays").
//   alice plays signed in (the camp's Mystery Maze screens, by keyboard); bob, a friend, sees her run listed and follows
//   it live, drawn only from what she sees (no seed reaches him); a reload resumes her run on the same state; she walks
//   down a floor and gives up: the replay is stored and listed; bob is offered it; the viewer (signed out) plays it to
//   the same end, jumps between floors, and opens at a floor from a link.
//   node overworld/tests/poketactica_mm_live_test.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8970;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------------------------------------------------------------- the real handler over sqlite
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { return st.run(...b); }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ptmm-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return res.json();
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.1.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const tokens = {};
for (const n of ['alice', 'bob']) tokens[n] = (await call('register', { username: n, password: 'poketactica-mm-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const mk = (sp, lv, moves) => ({ v: 1, id: sp + '-e2e', species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: moves.map((id) => ({ id, lv: 1, xp: 0 })), equipped: moves });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries([mk('pikachu', 60, ['thunderbolt']), mk('charizard', 60, ['flamethrower']), mk('blastoise', 60, ['surf'])].map((f) => [f.id, f])) });

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (who, url, figs = null) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st, figs) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_mmcoach_v1', 'done');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st, figs);
		const load = async (u = url) => { await page.goto(`http://localhost:${PORT}${u}`, { waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)), 60000); await sleep(400); };
		await load();
		const E = (fn, ...a) => page.evaluate(fn, ...a);
		const key = async (k, ms = 250) => { await page.keyboard.press(k); await sleep(ms); };
		const focus = () => E(() => window.__poketactica.hub.focusLabel());
		const keyTo = async (re) => { for (let i = 0; i < 40; i++) { const f = await focus(); if (f && re.test(f)) { await key('KeyZ', 500); return true; } await key(i < 20 ? 'ArrowDown' : 'ArrowUp', 70); } return false; };
		const mm = () => E(() => { const T = window.__poketactica, M = T.mm.M; if (!M.S) return null; const v = T.mm.view(); return { mode: M.mode, floor: v.floor, turns: v.turns, units: v.units.length, party: v.units.filter((u) => u.side === 'p').length, over: M.S.over || null, hash: M.mode === 'follow' ? null : T.mm.hash(), acts: M.acts.length, k: M.drv ? M.drv.k : null, paused: M.paused, speed: M.speed, ended: M.ended, hasSeed: 'seed' in M.S || 'rng' in M.S || 'pre' in M.S }; });
		return { page, errors, E, key, keyTo, focus, mm, load };
	};
	/** In alice's page: real actions, the shortest way to the stairs, attacking what stands in the way; then down them. */
	const descend = (p) => p.E(async () => {
		const T = window.__poketactica, MM = await import('/poketactica/js/mm/turn.js'), { DIR8 } = await import('/poketactica/js/mm/shapes8.js');
		const S = T.mm.M.S, f0 = S.floorNo;
		for (let n = 0; n < 400 && !S.over && S.floorNo === f0; n++) {
			const u = MM.leaderOf(S), [sx, sy] = S.F.stairs;
			if (u.x === sx && u.y === sy) { T.mm.act({ t: 'stairs' }); break; }
			const dist = MM.walkMap(S.F, u, sx, sy), here = dist[u.y * S.F.w + u.x];
			const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => MM.canWalk(S.F, u, k) && dist[(u.y + DIR8[k][1]) * S.F.w + u.x + DIR8[k][0]] === here - 1);
			if (d == null) { T.mm.act({ t: 'pass' }); continue; }
			if (MM.actBlock(S, { t: 'step', d }, T.P.data)) { if (u.dir !== d) T.mm.act({ t: 'face', d }); T.mm.act({ t: 'attack' }); } else T.mm.act({ t: 'step', d });
		}
		return S.floorNo;
	});

	// ---- alice: the camp's Mystery Maze screens, by keyboard
	const alice = await open('alice', '/poketactica/', FIGS);
	A(await alice.keyTo(/Mystery Maze/), 'alice: the camp has Mystery Maze');
	const list = await alice.E(() => ({ screen: window.__poketactica.hub.H.screen, l: window.__poketactica.hub.labels(), sub: document.querySelector('#hub .ph-sub').textContent }));
	A(list.screen === 'mm' && list.l.some((x) => /Whisper Woods/.test(x) && /New/.test(x)) && /deadly/.test(list.sub), 'its dungeons, and that it is deadly', list.l.slice(0, 3));
	A(await alice.keyTo(/Whisper Woods/) && await alice.keyTo(/Next: pack/) && await alice.keyTo(/Enter!/), 'Whisper Woods, the party, the pack, Enter!');
	await sleep(600);
	let a = await alice.mm();
	A(a && a.mode === 'play' && a.floor === 1 && a.party === 3 && await alice.E(() => window.__poketactica.P.screen === 'mm'), 'the run begins: three in the party', a);
	await alice.E(() => { const T = window.__poketactica; for (let k = 0; k < 3; k++) T.mm.act({ t: 'pass' }); });
	const listed = await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && f.kind === 'poketactica' && /Mystery Maze · Whisper Woods · B1F/.test(f.label)), 15000);
	A(listed, "bob's live-friends lists alice's Mystery Maze run, by dungeon and floor", JSON.stringify(await call('live-friends', {}, tokens.bob)).slice(0, 300));

	// ---- bob follows it live
	const bob = await open('bob', '/poketactica/?spectate=alice');
	const following = await waitFor(async () => { const b = await bob.mm(); return b && b.mode === 'follow' && b.party === 3; }, 20000);
	let b = await bob.mm();
	A(following && b.floor === 1, 'bob: her floor as far as she has explored it, her party on it', b);
	A(b && !b.hasSeed && await bob.E(() => !document.querySelector('#pt-mm [data-act="moves"]') && /Watching alice/.test(document.getElementById('pt-mm').textContent) && /Whisper Woods · B1F/.test(document.getElementById('pt-mm').textContent)), "bob's page has no play controls and no seed; the bar says he is watching alice");
	const snap = await call('spectate', { username: 'alice' }, tokens.bob).catch(() => null);
	A(!JSON.stringify(snap || {}).includes('"seed"'), 'nothing the server hands a spectator carries the run\'s seed', JSON.stringify(snap || {}).slice(0, 120));
	await alice.E(() => { const T = window.__poketactica; for (let k = 0; k < 4; k++) T.mm.act({ t: 'pass' }); });
	a = await alice.mm();
	const caught = await waitFor(async () => (await bob.mm()).turns === a.turns, 20000);
	A(caught, 'as she plays on, he catches up to her very turn', [a.turns, (await bob.mm()).turns]);

	// ---- a reload: the run resumes
	const before = await alice.mm();
	await alice.load();
	const home = await alice.E(() => window.__poketactica.hub.labels());
	A(/Resume Mystery Maze/.test(home[0]) && /Whisper Woods · B1F/.test(home[0]), 'after a reload the camp offers Resume Mystery Maze, first', home.slice(0, 2));
	await alice.key('KeyZ', 1200);
	a = await alice.mm();
	A(a && a.mode === 'play' && a.hash === before.hash && a.turns === before.turns && a.acts === before.acts, 'resumed on the very state it was left on', { before: [before.turns, before.hash], after: [a.turns, a.hash] });
	// down a floor by real actions, then give up: the replay
	const floor = await descend(alice);
	a = await alice.mm();
	A(floor === 2 && a.floor === 2 && !a.over, 'she walks to the stairs and down to B2F', a);
	const onTwo = await waitFor(async () => (await bob.mm()).floor === 2, 20000);
	A(onTwo && await bob.E(() => /B2F/.test(document.getElementById('pt-mm').textContent)), 'bob sees the new floor');
	await alice.E(() => { const T = window.__poketactica; T.mm.act({ t: 'pass' }); T.mm.act({ t: 'quit' }); });
	await sleep(600);
	const end = await alice.mm();
	const res = await alice.E(() => ({ shown: !document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), saved: localStorage.getItem('magepunk_poketactica_mm_v1'), col: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')) }));
	A(res.shown && res.title === 'Gave up' && /Whisper Woods/.test(res.body) && /B2F/.test(res.body) && res.saved === null && res.col.mm.best['whisper-woods'] === 2 && !res.col.mm.clear['whisper-woods'], 'the results: gave up on B2F; the saved run is cleared; the deepest floor is recorded', res.body.slice(0, 160));
	const rid = await waitFor(() => alice.E(() => !!window.__poketactica.P.replayId), 15000) ? await alice.E(() => window.__poketactica.P.replayId) : null;
	A(rid && await alice.E(() => [...document.querySelectorAll('#result .pt-rp')].some((x) => /Watch replay/.test(x.textContent))), 'its replay is stored: the results offer Watch replay', rid);
	const lib = await call('replay-library', {}, tokens.alice);
	A(JSON.stringify(lib).includes(rid) && /Mystery Maze · Whisper Woods/.test(JSON.stringify(lib)), 'the replay library lists it, named', JSON.stringify(lib).slice(0, 300));
	const bobOver = await waitFor(() => bob.E(() => !document.getElementById('result').hidden && /run is over/i.test(document.getElementById('r-title').textContent) && /Watch the whole run/.test(document.getElementById('r-again').textContent)), 25000);
	A(bobOver && await bob.E(() => /B2F/.test(document.getElementById('r-body').textContent)), "bob: 'The run is over' on B2F, and its replay is offered", await bob.E(() => document.getElementById('result').textContent.replace(/\s+/g, ' ').slice(0, 200)));
	A(!alice.errors.length && !bob.errors.length, 'no page errors (alice, bob)', [...alice.errors, ...bob.errors].slice(0, 3));

	// ---- the replay viewer (anyone, signed out)
	const v = await open(null, '/poketactica/?replay=' + rid);
	let w = await v.mm();
	A(w && w.mode === 'watch' && w.k <= 3 && w.floor === 1 && !w.over && await v.E(() => /Pause|Play/.test(document.getElementById('pt-mm').textContent) && !document.querySelector('#pt-mm [data-act="moves"]')), 'the replay opens in the viewer (signed out): from the start and playing, with the viewer\'s buttons', w);
	await v.key('KeyC', 150); await v.key('KeyC', 150); await v.key('KeyC', 150);
	A((await v.mm()).speed === 8, 'C: 1× → 2× → 4× → 8×');
	const done = await waitFor(async () => (await v.mm()).ended, 120000);
	w = await v.mm();
	A(done && w.hash === end.hash && w.floor === 2 && w.over && w.over.quit === true && w.k === end.acts, 'played through, it ends on the very state alice\'s run ended on', { w: [w.k, w.hash], end: [end.acts, end.hash] });
	await v.key('KeyX', 500);
	const st = await v.mm();
	A(st.k === 0 && st.floor === 1 && st.paused && !st.ended, 'X: the very start, paused');
	await v.key('ArrowRight', 700);
	const fwd = await v.mm();
	A(fwd.floor === 2 && fwd.turns === 0 && fwd.k > 0 && fwd.k < end.acts && fwd.paused, '→: on to where B2F began', fwd);
	await v.key('ArrowLeft', 700);
	const back = await v.mm();
	A(!back.ended && back.floor === 1 && back.k === 0, '←: back to where B1F began', back);
	await v.key('KeyC', 150);
	await v.key('KeyZ', 200);
	const k0 = (await v.mm()).k; await sleep(900);
	A((await v.mm()).speed === 1 && !(await v.mm()).paused && (await v.mm()).k > k0, 'Z plays (at 1× again)');
	await v.key('KeyZ', 200);
	const k1 = (await v.mm()).k; await sleep(500);
	A((await v.mm()).paused && (await v.mm()).k === k1, 'Z pauses');
	// a clip link: ?t=<floor> starts there
	const clip = await open(null, '/poketactica/?replay=' + rid + '&t=2');
	const c = await clip.mm();
	A(c && c.mode === 'watch' && c.floor === 2 && c.turns <= 3, 'a link with t=2 opens the replay where B2F began (it is already playing, so a turn or two may have passed)', c);
	A(!v.errors.length && !clip.errors.length, 'no page errors (the viewer)', [...v.errors, ...clip.errors].slice(0, 3));
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
