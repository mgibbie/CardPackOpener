// pokechess_live_replay_test.mjs — PokéChess spectating + replays, end to end (owner, 2026-11-19: "every mode of every
// game has live spectating and replays"). The REAL server handler (server/mp.mjs, bundled like the dev server, over
// sqlite) behind a static server, headless browsers:
//   alice plays /overworld/pokechess.html signed in (publisher: publish-pokechess, presence 'pokechess:<label>'),
//   bob watches /overworld/pokechess.html?spectate=alice (pokechess-state).
// Asserts: bob's live list routes Watch to the page, bob's board converges on alice's after her moves and the AI's,
// a capture battle reaches bob as a battle view (both Pokémon, HP, message), alice resigns (V twice), her game's tape
// goes to the Replays list and to the account (replay-put), bob's end screen offers "Watch the replay", the replay
// (opened by its link, signed out) plays back to the same final board and holds the battle's steps, the in-page
// Replays list plays it too, and a guest's game still plays without broadcasting.
//   node overworld/tests/pokechess_live_replay_test.mjs      (screenshots: POKECHESS_SHOTS=<dir>)
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
const SHOTS = process.env.POKECHESS_SHOTS || null;
const PORT = 8694;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pokechess-e2e-')), 'mp.bundle.mjs');
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

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'pokechess-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice and bob are friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server actions on their own ----------
{
	const pub = await call('publish-pokechess', { seq: 1, label: 'PokéChess · Move 1', snapshot: { v: 1, board: [] } }, tokens.carol);
	A(pub.ok, 'publish-pokechess accepts a signed-in player', JSON.stringify(pub));
	const strangers = await call('pokechess-state', { username: 'carol' }, tokens.alice);
	A(strangers.error && /friend/.test(strangers.error), "a stranger can't read the game (friends only)", JSON.stringify(strangers));
	A(!!(await call('publish-pokechess', { seq: 1, label: 'x' })).error, 'publishing needs an account');
	A(!!sqlite.prepare("SELECT key FROM mp_store WHERE key = 'pokechessstate:carol'").get() && (await call('micatro-state', { username: 'carol' }, tokens.carol)).snapshot == null, 'a PokéChess game has its own row (not a Micatro run)');
	await call('publish-pokechess', { seq: 2, label: 'x', over: true, replay: '<script>' }, tokens.carol);
	const r = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'pokechessstate:carol'").get();
	const row = r ? JSON.parse(r.value) : {};
	A(row.over && !row.replay, 'a replay that is not a tape id is dropped from the last push');
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('magepunk_sfx_muted', '1');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};
	const P = (page, fn, ...args) => page.evaluate(fn, ...args);
	const ready = (page) => waitFor(() => P(page, () => !!(window.__pokechess && window.__pokechess.board && window.__pokechess.phase === 'player')), 60000);
	// the board + whose turn + the last move: what both screens must agree on
	const aliceSig = (page) => P(page, () => { const v = window.__pokechess.view(); return v && JSON.stringify([v.board, v.turn, v.last, v.result]); });
	const shownSig = (page) => P(page, () => { const v = window.__pokechess.shown; return v && JSON.stringify([v.board, v.turn, v.last, v.result]); });

	// ---- alice plays, signed in ----
	const alice = await open('alice', '/overworld/pokechess.html');
	A(await ready(alice.page), 'alice: the game is ready (signed in)');
	A(await P(alice.page, () => window.__pokechess.live().publishing), "a signed-in player's game is broadcast");
	const listed = await waitFor(async () => { const r = await call('live-friends', {}, tokens.bob); return (r.live || []).some((f) => f.username === 'alice' && f.kind === 'pokechess' && /^PokéChess · /.test(f.label)); }, 12000);
	A(listed, "bob's live-friends lists alice with kind 'pokechess' and her progress label", JSON.stringify(await call('live-friends', {}, tokens.bob)).slice(0, 300));
	const af = ((await call('friends', {}, tokens.bob)).friends || []).find((f) => f.username === 'alice');
	A(af && /^pokechess:PokéChess · /.test(af.status), "alice's presence status is 'pokechess:<label>'", JSON.stringify(af));
	A(!((await call('live-friends', {}, tokens.carol)).live || []).some((f) => f.username === 'alice'), "a stranger's live list doesn't show alice");
	const LW = await import(pathToFileURL(path.join(ROOT, 'site/livewatch.js')).href);
	A(LW.watchHref({ username: 'alice', kind: 'pokechess' }) === '/overworld/pokechess.html?spectate=alice' && LW.activityFromStatus('pokechess:PokéChess · Move 3', '').kind === 'pokechess'
		&& LW.activityFromStatus('pokechess:PokéChess · Move 3', '').label === 'Playing PokéChess — Move 3', 'the shared live-watch routes a pokechess friend to the spectator page and reads "Playing PokéChess — Move 3"');

	// ---- bob watches ----
	const bob = await open('bob', '/overworld/pokechess.html?spectate=alice');
	A(await waitFor(() => P(bob.page, () => window.__pokechess.mode === 'watch' && !!window.__pokechess.shown), 20000), 'bob: the spectator view loads alice\'s board');
	const conv = async (label) => {
		let target = null;
		const ok = await waitFor(async () => { target = await aliceSig(alice.page); return (await shownSig(bob.page)) === target; }, 20000);
		A(ok, `bob's board converges on alice's: ${label}`, ok ? '' : `\n   alice ${target}\n   bob   ${await shownSig(bob.page)}`);
	};
	await conv('the opening');
	{
		const before = await aliceSig(alice.page);
		await bob.page.keyboard.press('KeyZ'); await bob.page.keyboard.press('ArrowUp'); await bob.page.mouse.click(300, 300);
		await sleep(600);
		A((await aliceSig(alice.page)) === before && await P(bob.page, () => window.__pokechess.board == null), 'a spectator changes nothing (no game of their own runs)');
	}

	// alice plays: a capture whenever one is open (else a quiet move), until a capture battle has been fought
	let sawBattleOnBob = false, battles = 0, safety = 0;
	const watchBob = setInterval(async () => { try { if (await P(bob.page, () => { const v = window.__pokechess.shown; return !!(v && v.phase === 'battle' && v.bt && v.bt.w && v.bt.b && typeof v.bt.w.curHP === 'number'); })) sawBattleOnBob = true; } catch { /* page busy */ } }, 120);
	while (battles < 1 && safety++ < 40) {
		const ph = await P(alice.page, () => window.__pokechess.phase);
		if (ph === 'gameover') break;
		if (ph === 'player') {
			await P(alice.page, () => {
				const pc = window.__pokechess, b = pc.board;
				const moves = b.getLegalMoves(b.turn);
				const cap = moves.find((m) => b.isCaptureMove(m) && !b.involvesKing(m));
				const quiet = moves.filter((m) => !b.isCaptureMove(m) && b.getPiece(m.fromRow, m.fromCol).piece !== 6);
				pc.doMove(cap || quiet[(pc.board.moveHistory.length * 7) % quiet.length] || moves[0]);
			});
			await sleep(300);
		}
		if (await P(alice.page, () => window.__pokechess.phase === 'battle')) {
			battles++;
			// a real battle: White's Pokémon fights; the foe is worn down first so the test stays short. Z picks FIGHT and the first move.
			await waitFor(() => P(alice.page, () => !!(window.__pokechess.battle.active && window.__pokechess.battle.active.foe)), 10000);
			await sleep(1500); // (bob sees the battle open)
			await P(alice.page, () => { const a = window.__pokechess.battle.active; a.foe.curHP = 1; });
			for (let i = 0; i < 400 && await P(alice.page, () => window.__pokechess.phase === 'battle'); i++) { await P(alice.page, () => window.__pokechess.key('z')); await sleep(250); }
			A(await P(alice.page, () => window.__pokechess.phase !== 'battle'), 'the capture battle ends and the game goes on');
		}
		await waitFor(() => P(alice.page, () => window.__pokechess.phase === 'player' || window.__pokechess.phase === 'gameover'), 30000);
	}
	clearInterval(watchBob);
	A(battles >= 1, 'a capture battle was fought', 'battles=' + battles);
	A(sawBattleOnBob, "bob saw the capture battle: both Pokémon, their HP and the message");
	await conv('after the capture and the AI\'s reply');
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await bob.page.screenshot({ path: path.join(SHOTS, 'spectator.png') }); }

	// a quiet move more, then alice resigns (V twice)
	if (await P(alice.page, () => window.__pokechess.phase === 'player')) {
		await P(alice.page, () => { const pc = window.__pokechess, b = pc.board; const m = b.getLegalMoves(b.turn).find((x) => !b.isCaptureMove(x)); if (m) pc.doMove(m); });
		await waitFor(() => P(alice.page, () => window.__pokechess.phase === 'player'), 20000);
	}
	await alice.page.keyboard.press('KeyV');
	A(await P(alice.page, () => window.__pokechess.phase === 'player'), 'one V only asks (no resign yet)');
	await alice.page.keyboard.press('KeyV');
	A(await P(alice.page, () => window.__pokechess.phase === 'gameover' && window.__pokechess.board.result === 'black'), 'V twice resigns: the game is over, Black wins');
	const finalSig = await aliceSig(alice.page);
	A(await waitFor(() => P(alice.page, () => !!(window.__pokechess.lastReplay && window.__pokechess.lastReplay.net)), 15000), "alice's finished game is uploaded (replay-put) and kept on the Replays list");
	const id = await P(alice.page, () => window.__pokechess.lastReplay.net);
	const stored = await call('replay-get', { id });
	A(/^[GR]1\./.test(stored.code || ''), 'the tape is readable by its id, signed out (replay-get)');
	A(await P(alice.page, () => { const l = JSON.parse(localStorage.getItem('pokechess_replays_v1') || '[]'); return l.length === 1 && l[0].net && l[0].result === 'black' && l[0].resigned; }), 'the local Replays list holds the game (result, resigned, its link id)');

	// bob: the end of the game, and its replay
	A(await waitFor(() => P(bob.page, (rid) => { const w = window.__pokechess.watch; return w.over && w.replay === rid; }, id), 20000), "bob's view ends with the game, and is handed its replay");
	A((await shownSig(bob.page)) === finalSig, "bob's last board is alice's final board");
	A(await waitFor(() => P(bob.page, () => !document.getElementById('pcWatchReplay').hidden), 5000), 'bob is offered "Watch the replay"');
	A(await waitFor(async () => !((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice'), 8000), 'the game drops off bob\'s live list');
	if (SHOTS) await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_over.png') });

	// ---- the replay by its link (bob's button), signed out ----
	const viewer = await open(null, '/overworld/pokechess.html?replay=' + id);
	A(await waitFor(() => P(viewer.page, () => window.__pokechess.mode === 'replay' && !!window.__pokechess.replay), 20000), 'the replay link opens the viewer, signed out');
	const frames = await P(viewer.page, () => window.__pokechess.replayFrames());
	A(frames.length >= 5 && frames.some((f) => f.phase === 'battle' && f.bt && f.bt.w && f.bt.b && f.bt.msg), 'the tape holds the capture battle\'s steps (both Pokémon, HP, message)', 'frames=' + frames.length);
	A(new Set(frames.filter((f) => f.phase === 'battle').map((f) => f.bt && f.bt.b.curHP + '/' + f.bt.w.curHP)).size >= 2, 'the battle steps show the HP changing');
	await viewer.page.keyboard.press('Space');
	A(await P(viewer.page, () => window.__pokechess.replay.playing === false), 'Space pauses');
	await viewer.page.keyboard.press('ArrowRight'); await viewer.page.keyboard.press('ArrowRight');
	A(await P(viewer.page, () => window.__pokechess.replay.i === 2), '→ steps forward a frame at a time');
	await viewer.page.keyboard.press('ArrowLeft');
	A(await P(viewer.page, () => window.__pokechess.replay.i === 1), '← steps back');
	await viewer.page.keyboard.press('ArrowUp'); await viewer.page.keyboard.press('ArrowUp');
	A(await P(viewer.page, () => window.__pokechess.replay.speed === 4), '↑ speeds up to 4×');
	await viewer.page.click('#pcPlay'); // touch / mouse: the Play button
	A(await P(viewer.page, () => window.__pokechess.replay.playing), 'the Play button plays');
	A(await waitFor(() => P(viewer.page, () => { const r = window.__pokechess.replay; return !r.playing && r.i === r.n - 1; }), 120000), 'the replay plays to its end');
	A((await shownSig(viewer.page)) === finalSig, 'the replay ends on the same final board as the game');
	A(await P(viewer.page, () => !document.getElementById('pcCtl').hidden && document.getElementById('pcReplays').hidden), 'the viewer shows its controls, not the game\'s');
	if (SHOTS) await viewer.page.screenshot({ path: path.join(SHOTS, 'replay_end.png') });
	if (SHOTS) { // a battle step, as the viewer draws it
		const bi = frames.findIndex((f) => f.phase === 'battle' && f.bt && /used|!/.test(f.bt.msg));
		await P(viewer.page, (n) => { for (let i = 0; i < 9999; i++) window.__pokechess.key('ArrowLeft'); for (let i = 0; i < n; i++) window.__pokechess.key('ArrowRight'); }, Math.max(0, bi));
		await sleep(500); await viewer.page.screenshot({ path: path.join(SHOTS, 'replay_battle.png') });
		for (let i = 0; i < 9999 && await P(viewer.page, () => window.__pokechess.replay.i < window.__pokechess.replay.n - 1); i++) await P(viewer.page, () => window.__pokechess.key('ArrowRight'));
	}

	// ---- the page's Replays list (C) ----
	await alice.page.keyboard.press('KeyC');
	A(await P(alice.page, () => window.__pokechess.listOpen && document.querySelectorAll('#pcList .pc-item').length === 1), 'C opens the Replays list with the game in it');
	await alice.page.keyboard.press('KeyZ');
	A(await waitFor(() => P(alice.page, () => window.__pokechess.mode === 'replay'), 5000), 'Z plays the picked replay in the page');
	await P(alice.page, () => { for (let i = 0; i < 9999; i++) window.__pokechess.key('ArrowRight'); });
	A((await shownSig(alice.page)) === finalSig, 'the local copy ends on the same final board');
	await alice.page.keyboard.press('KeyX');
	A(await P(alice.page, () => window.__pokechess.mode === 'play' && window.__pokechess.phase === 'gameover'), 'X closes it, back to the finished game');
	await alice.page.keyboard.press('KeyZ');
	A(await waitFor(() => P(alice.page, () => window.__pokechess.phase === 'player' && !window.__pokechess.board.gameOver && window.__pokechess.live().publishing), 20000), 'Z starts a new game, broadcast again');
	A(await waitFor(async () => (((await call('live-friends', {}, tokens.bob)).live) || []).some((f) => f.username === 'alice' && f.kind === 'pokechess'), 12000), 'the new game is live for bob again');

	// ---- a guest still plays, and broadcasts nothing ----
	const guest = await open(null, '/overworld/pokechess.html');
	A(await ready(guest.page), 'a guest\'s game boots');
	A(await P(guest.page, () => !window.__pokechess.live().publishing), 'a guest does not broadcast');
	await P(guest.page, () => { const b = window.__pokechess.board; window.__pokechess.doMove(b.getLegalMoves(b.turn)[0]); });
	A(await waitFor(() => P(guest.page, () => window.__pokechess.board.turn === 1 && window.__pokechess.phase === 'player'), 20000), 'a guest moves and the AI replies');

	for (const [n, p] of [['alice', alice], ['bob', bob], ['viewer', viewer], ['guest', guest]]) A(!p.errors.length, `no page errors (${n})`, p.errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
