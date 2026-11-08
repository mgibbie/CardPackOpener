// micatro_pvp_e2e_test.mjs — Micatro Multiplayer (PvP), two real players end to end: the REAL server handler (server/mp.mjs
// over sqlite) behind a static server, each player in their OWN browser context (separate localStorage — the 2-client
// gotcha), plus a friend who watches.
//   alice: main menu -> Multiplayer -> Create lobby (the New Run screen) -> lobby code; options: Nemesis from ante 1
//   carol (alice's friend): the friends list says alice is in a lobby, with a Join link (/micatro/?join=CODE)
//   bob:   /micatro/?join=CODE -> the lobby -> Ready; alice -> Start: both runs start on the same seed / deck / stake
//   both skip Small + Big, press READY at "Your Nemesis" -> the countdown -> both enter together; the opponent's live score
//   shows on the HUD while they play; out of hands -> waiting; the referee's result -> both cash out with the right lives
//   carol watches alice (?spectate=alice): the PvP HUD with bob's name
//   bob reloads mid-match -> rejoins the same run; bob forfeits -> both get the end screen; Rematch (both) -> match 2
//   bob's browser goes away -> after the grace period alice wins by forfeit
// Screenshots go to $MTPVP_SHOTS when set.
//   node overworld/tests/micatro_pvp_e2e_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

process.env.MP_GC_RATE = '0';
process.env.MTPVP_GRACE_MS = '20000';   // (the 120 s forfeit clock, shortened for the test)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || (fs.existsSync('/opt/chrome/chrome') ? '/opt/chrome/chrome' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const PORT = 9787;
const SHOTS = process.env.MTPVP_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

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
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mtpvp-e2e-')), 'mp.bundle.mjs');
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
	return (await handler(req, { MP_DB })).json();
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'mtpvp-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.carol);
A(tokens.alice && tokens.bob && tokens.carol, 'three accounts (carol is alice\'s friend; bob is not)');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

let browser;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, ctx0) => {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1400, height: 860, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, ctx };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000);
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const view = (page) => page.evaluate(() => { const v = window.__micatro.view(); return v && { state: v.state, ante: v.ante, seed: v.seed, back: v.back, stake: v.stake, pvp: v.pvp, opp: v.pvp_opp, chips: v.chips, hands: v.hands_left, blind: v.blind && v.blind.key, onDeck: v.blind_on_deck, over: v.over, won: v.won }; });
	const click = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b || b.disabled) return false; b.click(); return true; }, sel);
	const act = (page, a) => page.evaluate((a) => window.__micatro.act(a), a);

	// ---- alice creates a lobby from the main menu
	const alice = await open('alice', '/micatro/');
	A(await ready(alice.page), 'alice: game ready');
	A(await waitFor(() => click(alice.page, '.b-multiplayer'), 10000), 'the main menu has a Multiplayer button (signed in)');
	await shot(alice.page, '01-multiplayer-menu');
	A(await click(alice.page, '.b-pvp-create'), 'Multiplayer -> Create lobby');
	A(await waitFor(() => alice.page.evaluate(() => { const b = document.querySelector('.b-start'); return b && /Create lobby/.test(b.textContent); }), 8000), 'the New Run screen picks the lobby\'s deck / stake / mods ("Create lobby")');
	await click(alice.page, '.b-start');
	A(await waitFor(() => alice.page.evaluate(() => /^[A-Z2-9]{5}$/.test((document.querySelector('.pvp-code-v') || {}).textContent || '')), 10000), 'the lobby shows a 5-letter code');
	const code = await alice.page.evaluate(() => document.querySelector('.pvp-code-v').textContent);
	// options: the Nemesis from ante 1 (so the test meets it after skipping two blinds)
	await click(alice.page, '.b-pvp-dec-pvpStart');
	A(await waitFor(() => alice.page.evaluate(() => (document.querySelector('.pvp-pvpStart') || {}).textContent === '1'), 6000), 'the host changes an option (Nemesis from ante 1)');
	await shot(alice.page, '02-lobby-host');

	// ---- carol sees "in a Micatro lobby" + Join
	const seesLobby = await waitFor(async () => { const f = (await call('friends', {}, tokens.carol)).friends.find((x) => x.username === 'alice'); return f && f.status === 'micatropvp:lobby:' + code; }, 8000);
	A(seesLobby, 'a friend sees alice "in a Micatro lobby" (presence micatropvp:lobby:<CODE>)');
	const carol = await open('carol', '/micatro/');
	await ready(carol.page);
	const join = await carol.page.evaluate(async (c) => { const m = await import('/site/livewatch.js'); return { a: m.activityFromStatus('micatropvp:lobby:' + c), href: m.joinHref({ username: 'alice', status: 'micatropvp:lobby:' + c }) }; }, code);
	A(join.a.joinable && join.href === '/micatro/?join=' + code, 'the friends list routes Join to /micatro/?join=<CODE>', JSON.stringify(join));
	const fl = await carol.page.evaluate(async () => { const r = await (await import('/battlecards/mpmode.js')).call('friends', {}); return r.friends; });
	A(fl.some((f) => f.username === 'alice' && /^micatropvp:lobby:/.test(f.status)), 'carol\'s own friends call carries the lobby status');

	// ---- bob joins by link, readies; alice starts
	const bob = await open('bob', '/micatro/?join=' + code);
	A(await ready(bob.page), 'bob: game ready');
	A(await waitFor(() => bob.page.evaluate(() => !!document.querySelector('.b-pvp-ready-lobby')), 15000), 'bob opened the join link and is in the lobby (anyone with the code may join)');
	await click(bob.page, '.b-pvp-ready-lobby');
	A(await waitFor(() => alice.page.evaluate(() => { const b = document.querySelector('.b-pvp-start'); return b && !b.disabled; }), 10000), 'alice sees bob ready: Start is enabled');
	await shot(alice.page, '03-lobby-ready');
	await click(alice.page, '.b-pvp-start');
	const started = await waitFor(async () => (await view(alice.page))?.pvp && (await view(bob.page))?.pvp, 20000);
	A(started, 'Start: both players are in a match run');
	await idle(alice.page); await idle(bob.page);
	const va = await view(alice.page), vb = await view(bob.page);
	A(va.seed === vb.seed && va.back === vb.back && va.stake === vb.stake, 'the same seed, deck and stake on both sides', JSON.stringify([va.seed, vb.seed]));
	A(va.pvp.lives === 4 && va.pvp.pvpStart === 1, 'the host\'s options are the match\'s (4 lives, Nemesis from ante 1)');
	const recipeA = await alice.page.evaluate(() => window.__micatro.session.recipe);
	A(recipeA.pvp && !recipeA.seeded, 'alice\'s run recipe carries the match config');
	A(await alice.page.evaluate(() => !!localStorage.getItem('micatro_pvp_run_v1') && !localStorage.getItem('micatro_run_v1')), 'the match is saved in its own slot (never the solo run\'s)');

	// ---- both skip to the Nemesis
	for (const p of [alice.page, bob.page]) { await act(p, { type: 'skip_blind' }); await idle(p); await act(p, { type: 'skip_blind' }); await idle(p); }
	const na = await view(alice.page);
	A(na.onDeck === 'Boss' && na.state === 'BLIND_SELECT', 'both at the Boss: Your Nemesis');
	A(await alice.page.evaluate(() => !!document.querySelector('.b-pvp-ready')), 'the Nemesis column has a READY button (not Select)');
	const sel = await act(alice.page, { type: 'select_blind' });
	A(!sel.ok, 'Select is refused on the Nemesis (READY only)');
	await shot(alice.page, '04-nemesis-select');
	await click(alice.page, '.b-pvp-ready');
	await sleep(600);
	A((await view(alice.page)).state === 'BLIND_SELECT', 'one READY: waiting for the opponent');
	await click(bob.page, '.b-pvp-ready');
	const entered = await waitFor(async () => (await view(alice.page)).blind === 'bl_mp_nemesis' && (await view(bob.page)).blind === 'bl_mp_nemesis', 15000);
	A(entered, 'both READY -> the 3-2-1 countdown -> both enter the Nemesis together');
	await idle(alice.page); await idle(bob.page);
	// bob plays one weak hand; alice sees his score
	const playWeak = async (p) => { await p.evaluate(() => { const v = window.__micatro.view(); const h = v.areas.hand; window.__micatro.act({ type: 'highlight', ids: [h[h.length - 1].id] }); }); await act(p, { type: 'play' }); await idle(p); };
	const playStrong = async (p) => { await p.evaluate(() => { const v = window.__micatro.view(); window.__micatro.act({ type: 'highlight', ids: v.areas.hand.slice(0, 5).map((c) => c.id) }); }); await act(p, { type: 'play' }); await idle(p); };
	await playWeak(bob.page);
	const bobChips = String((await view(bob.page)).chips);
	A(await waitFor(async () => String((await view(alice.page)).opp?.score) === bobChips, 8000), "the opponent's live score reaches alice's HUD", bobChips);
	A(await alice.page.evaluate(() => /Their score/.test(document.querySelector('.pvp-hud')?.textContent || '')), 'the PvP HUD shows the opponent\'s score in the Nemesis');
	await shot(alice.page, '05-nemesis-live-score');
	// carol watches alice: the spectator sees the PvP HUD
	const carolW = await open('carol', '/micatro/?spectate=alice');
	A(await waitFor(() => carolW.page.evaluate(() => { const e = document.querySelector('#pvp-hud'); return e && !e.hidden && /bob/.test(e.textContent); }), 15000), 'a friend watching alice sees the PvP HUD with her opponent');
	await shot(carolW.page, '06-spectator');
	for (let i = 0; i < 6 && (await view(bob.page)).state === 'SELECTING_HAND'; i++) await playWeak(bob.page);
	for (let i = 0; i < 6 && (await view(alice.page)).state === 'SELECTING_HAND'; i++) await playStrong(alice.page);
	const done = await waitFor(async () => (await view(alice.page)).state === 'ROUND_EVAL' && (await view(bob.page)).state === 'ROUND_EVAL', 20000);
	A(done, 'both out of hands -> the referee decides -> both cash out', JSON.stringify([(await view(alice.page)).state, (await view(bob.page)).state]));
	const ra = await view(alice.page), rb = await view(bob.page);
	const lobbyRow = row('mtpvp:' + (await alice.page.evaluate(() => window.__micatro.pvp.lobbyId)));
	const loser = lobbyRow.m.round.res.loser;
	const sa = String(ra.chips), sb = String(rb.chips);
	A(loser === (Number(sa) > Number(sb) ? 'bob' : Number(sa) < Number(sb) ? 'alice' : ''), 'the lower score lost the round', JSON.stringify({ sa, sb, loser }));
	A(ra.pvp.lives === lobbyRow.m.lives.alice && rb.pvp.lives === lobbyRow.m.lives.bob && ra.pvp.lives + rb.pvp.lives === 7, 'both engines carry the referee\'s lives (one life lost)', JSON.stringify([ra.pvp.lives, rb.pvp.lives]));
	await shot(alice.page, '07-cashout');

	// ---- bob reloads: the match comes back
	const before = await bob.page.evaluate(() => window.__micatro.session.recipe.actions.length);
	await bob.page.reload({ waitUntil: 'domcontentloaded' });
	await ready(bob.page);
	A(await waitFor(async () => { const v = await view(bob.page); return v && v.pvp && v.state === 'ROUND_EVAL'; }, 20000), 'bob reloads mid-match -> rejoins the same run (his saved match run)');
	A(await bob.page.evaluate((n) => window.__micatro.session.recipe.actions.length === n && window.__micatro.pvp.active, before), 'the rejoined run is exactly where he left it');

	// ---- bob forfeits: both get the end screen; then a rematch
	await bob.page.evaluate(() => window.__micatro.pvp.forfeitConfirm());
	await click(bob.page, '.b-pvp-forfeit');
	A(await waitFor(() => alice.page.evaluate(() => !!document.querySelector('.pvp-end-title.won')), 15000), 'bob forfeits -> alice: "You win!"');
	A(await waitFor(() => bob.page.evaluate(() => !!document.querySelector('.pvp-end-title.lost')), 15000), 'bob: "You lose"');
	A((await view(alice.page)).over && (await view(alice.page)).pvp.result === 'win', "alice's run ends on the recorded pvp_end (win)");
	A(await waitFor(() => alice.page.evaluate(() => document.querySelectorAll('.pvp-end-joker').length >= 0 && !/Waiting/.test(document.querySelector('.pvp-end-cards').textContent)), 12000), "the end screen shows the opponent's cards");
	await shot(alice.page, '08-end-screen');
	await click(alice.page, '.b-pvp-rematch');
	await click(bob.page, '.b-pvp-rematch');
	const rem = await waitFor(async () => { const a = await view(alice.page), b = await view(bob.page); return a && b && !a.over && !b.over && a.ante === 1 && b.ante === 1 && a.seed === b.seed && a.seed !== va.seed; }, 20000);
	A(rem, 'Rematch (both) -> match 2 on a new shared seed', JSON.stringify([await view(alice.page), await view(bob.page), await alice.page.evaluate(() => window.__micatro.pvp.state.matchN), await bob.page.evaluate(() => window.__micatro.pvp.state.matchN)]).slice(0, 900));

	// ---- bob goes away: the grace period, then alice wins by forfeit
	await bob.ctx.close();
	A(await waitFor(() => alice.page.evaluate(() => /disconnected/.test(document.querySelector('.pvp-hud')?.textContent || '')), 15000), 'alice sees "bob disconnected" with the countdown');
	await shot(alice.page, '09-disconnected');
	A(await waitFor(() => alice.page.evaluate(() => !!document.querySelector('.pvp-end-title.won')), 30000), 'after the grace period alice wins by forfeit');
	const errs = [...alice.errors, ...carol.errors].filter((e) => !/favicon|net::/.test(e));
	A(!errs.length, 'no page errors', errs.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
