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
//   stage 6: dave picks Showdown + host options (erin sees them read-only); dave READY + Hurry! -> erin's timer runs out
//   (a life, as a recorded action) -> erin READY -> both play the Small-blind Nemesis -> next is the Big (same ante)
//   stage 7: frank hosts a Pokermon lobby with Gen 4 off: the ruleset picker (Balanced: The Order + the PvP timer on; Vanilla
//   turns both off), the host's mod options shown to gina read-only (her own saved mod settings untouched); both engines run
//   Gen 4 off, Balanced, The Order (recorded); no source offers either a Gen 4 Pokémon; in the Nemesis gina (ahead) starts the
//   PvP timer on frank -> at 0 he loses ONE hand, as a recorded pvp_hand_lost
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
process.env.MTPVP_PVPT_BASE_MS = '8000'; // (the PvP timer's 60 s, shortened for the test)

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
for (const n of ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina']) tokens[n] = (await call('register', { username: n, password: 'mtpvp-e2e-pass' })).token;
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

	// ======== stage 6: a Showdown lobby (host options, read-only for the guest), the Hurry timer runs out on the slower
	// player (a life, as a recorded action), then a Small-blind Nemesis played together ========
	const dave = await open('dave', '/micatro/');
	A(await ready(dave.page), 'dave: game ready');
	await waitFor(() => click(dave.page, '.b-multiplayer'), 10000);
	A(await waitFor(() => click(dave.page, '.b-pvp-mode-showdown'), 6000), 'the Multiplayer screen offers the modes (Showdown picked)');
	await shot(dave.page, '10-mode-pick');
	await click(dave.page, '.b-pvp-create');
	await waitFor(() => dave.page.evaluate(() => { const b = document.querySelector('.b-start'); return b && /Create lobby/.test(b.textContent); }), 8000);
	await click(dave.page, '.b-start');
	A(await waitFor(() => dave.page.evaluate(() => (document.querySelector('.pvp-mode') || {}).textContent === 'Showdown'), 10000), 'the lobby is created in Showdown mode');
	const code2 = await dave.page.evaluate(() => document.querySelector('.pvp-code-v').textContent);
	const optV = (page, k) => page.evaluate((k) => (document.querySelector('.pvp-' + k) || {}).textContent, k);
	for (let i = 0; i < 2; i++) { await click(dave.page, '.b-pvp-dec-showdownStart'); await waitFor(async () => (await optV(dave.page, 'showdownStart')) === String(2 - i), 5000); }
	for (const want of ['120 s', '90 s', '60 s', '30 s']) { await click(dave.page, '.b-pvp-dec-timerBase'); await waitFor(async () => (await optV(dave.page, 'timerBase')) === want, 5000); }
	A((await optV(dave.page, 'showdownStart')) === '1' && (await optV(dave.page, 'timerBase')) === '30 s', 'host options: Showdown from ante 1, a 30 s Hurry timer');
	await shot(dave.page, '11-lobby-showdown-host');
	const erin = await open('erin', '/micatro/?join=' + code2);
	A(await ready(erin.page), 'erin: game ready');
	A(await waitFor(() => erin.page.evaluate(() => !!document.querySelector('.b-pvp-ready-lobby')), 15000), 'erin joined the Showdown lobby');
	const ro = await erin.page.evaluate(() => ({ mode: (document.querySelector('.pvp-mode') || {}).textContent, tb: (document.querySelector('.pvp-timerBase') || {}).textContent, arrows: document.querySelectorAll('.pvp-opts [class*="b-pvp-dec-"], .pvp-opts [class*="b-pvp-tog-"]').length, note: /Only the host/.test(document.querySelector('.pvp-opts')?.textContent || '') }));
	A(ro.mode === 'Showdown' && ro.tb === '30 s' && ro.arrows === 0 && ro.note, 'the guest sees the host\'s options read-only', JSON.stringify(ro));
	await shot(erin.page, '12-lobby-showdown-guest');
	await click(erin.page, '.b-pvp-ready-lobby');
	await waitFor(() => dave.page.evaluate(() => { const b = document.querySelector('.b-pvp-start'); return b && !b.disabled; }), 10000);
	await click(dave.page, '.b-pvp-start');
	A(await waitFor(async () => (await view(dave.page))?.pvp && (await view(erin.page))?.pvp, 20000), 'Start: both in the Showdown match');
	await idle(dave.page); await idle(erin.page);
	const vd = await view(dave.page);
	A(vd.pvp.mode === 'showdown' && vd.pvp.slots.Small && vd.onDeck === 'Small', 'Showdown from ante 1: the SMALL blind is a Nemesis round', JSON.stringify(vd.pvp.slots));
	A(await dave.page.evaluate(() => !!document.querySelector('.blind-col .b-pvp-ready') && !document.querySelector('.b-skip')), 'the Small column has READY and no Skip');
	// dave is READY first; Hurry! starts erin's timer
	await click(dave.page, '.b-pvp-ready');
	A(await waitFor(() => dave.page.evaluate(() => { const b = document.querySelector('.b-pvp-hurry'); return !!b && b.style.display !== 'none' && /Hurry/.test(b.textContent); }), 8000), 'READY at the Nemesis (the opponent not): the HUD offers Hurry!');
	A(await erin.page.evaluate(() => { const b = document.querySelector('.b-pvp-hurry'); return !b || b.style.display === 'none'; }), 'erin (not READY) has no Hurry button');
	await click(dave.page, '.b-pvp-hurry');
	A(await waitFor(() => erin.page.evaluate(() => { const t = document.querySelector('.pvp-hud .ph-timer.on-me'); return t && t.style.display !== 'none' && /Hurry!/.test(t.textContent); }), 8000), 'erin sees the Hurry countdown on her');
	await shot(erin.page, '13-hurry-on-me');
	await shot(dave.page, '14-hurry-started');
	const lid2 = await dave.page.evaluate(() => window.__micatro.pvp.lobbyId);
	A(row('mtpvp:' + lid2).m.timer && row('mtpvp:' + lid2).m.timer.on === 'erin', 'the timer runs on the server, on erin');
	A(await waitFor(async () => (await view(erin.page)).pvp.lives === 3, 45000), 'the timer runs out: erin loses a life');
	const rec = await erin.page.evaluate(() => window.__micatro.session.recipe.actions.filter((a) => a.type === 'pvp_timer'));
	A(rec.length === 1 && rec[0].n === 1 && row('mtpvp:' + lid2).m.tl.erin === 1 && row('mtpvp:' + lid2).m.lives.erin === 3, 'the life arrives as a RECORDED action (pvp_timer n 1), matching the referee', JSON.stringify(rec));
	A(await waitFor(async () => (await view(dave.page)).opp.lives === 3, 8000), 'dave sees erin at 3 lives');
	await shot(erin.page, '15-timer-life-lost');
	// erin reaches the Nemesis: both enter the SMALL-blind Nemesis together; the timer is gone
	await click(erin.page, '.b-pvp-ready');
	A(await waitFor(async () => (await view(dave.page)).blind === 'bl_mp_nemesis' && (await view(erin.page)).blind === 'bl_mp_nemesis', 15000), 'both READY -> both in the Small-blind Nemesis');
	A(!row('mtpvp:' + lid2).m.timer, 'no timer in a Nemesis round');
	await idle(dave.page); await idle(erin.page);
	A((await view(erin.page)).pvp.slot === 'Small', 'the round is the Small blind');
	await playWeak(erin.page);
	await shot(dave.page, '16-showdown-small-nemesis');
	for (let i = 0; i < 6 && (await view(erin.page)).state === 'SELECTING_HAND'; i++) await playWeak(erin.page);
	for (let i = 0; i < 6 && (await view(dave.page)).state === 'SELECTING_HAND'; i++) await playStrong(dave.page);
	A(await waitFor(async () => (await view(dave.page)).state === 'ROUND_EVAL' && (await view(erin.page)).state === 'ROUND_EVAL', 20000), 'the Small round is decided -> both cash out');
	const r6 = row('mtpvp:' + lid2).m;
	A(r6.round.b === 11 && r6.round.res && r6.hist[0].slot === 'Small', 'the referee decided round b 11 (ante 1 Small)', JSON.stringify(r6.round));
	await idle(dave.page);
	let co = null;
	await waitFor(async () => { co = await act(dave.page, { type: 'cash_out' }); return co && co.ok; }, 10000);
	await idle(dave.page);
	const nr = await act(dave.page, { type: 'next_round' }); await idle(dave.page);
	const vd2 = await view(dave.page);
	A(co && co.ok && vd2.ante === 1 && vd2.onDeck === 'Big' && vd2.state === 'BLIND_SELECT', 'a Small-slot Nemesis counts as the Small blind: next is the Big (same ante)', JSON.stringify([co && co.error, nr && nr.error, vd2.ante, vd2.onDeck, vd2.state]));
	await shot(dave.page, '17-showdown-next-big');
	const errs2 = [...dave.errors, ...erin.errors].filter((e) => !/favicon|net::/.test(e));
	A(!errs2.length, 'stage 6: no page errors', errs2.join(' | '));
	await dave.ctx.close(); await erin.ctx.close();

	// ======== stage 7: the ruleset, The Order, the host's Pokermon generations, the PvP timer ========
	const GEN_OFF = { ids: ['pokermon'], options: { pokermon: { gen_four: false } } };
	const frank = await open('frank', '/micatro/');
	await frank.page.evaluate((p) => localStorage.setItem('micatro_mods', JSON.stringify(p)), GEN_OFF);
	await frank.page.reload({ waitUntil: 'domcontentloaded' });
	A(await ready(frank.page), 'frank: game ready (Pokermon on, Gen 4 off in his mod settings)');
	await waitFor(() => click(frank.page, '.b-multiplayer'), 10000);
	await click(frank.page, '.b-pvp-create');
	await waitFor(() => frank.page.evaluate(() => { const b = document.querySelector('.b-start'); return b && /Create lobby/.test(b.textContent); }), 8000);
	await click(frank.page, '.b-start');
	A(await waitFor(() => frank.page.evaluate(() => /^[A-Z2-9]{5}$/.test((document.querySelector('.pvp-code-v') || {}).textContent || '')), 60000), 'frank\'s Pokermon lobby is up');
	const code3 = await frank.page.evaluate(() => document.querySelector('.pvp-code-v').textContent);
	const lobbyTxt = (page) => page.evaluate(() => ({ rs: (document.querySelector('.pvp-ruleset') || {}).textContent, order: (document.querySelector('.b-pvp-tog-order') || document.querySelector('.pvp-opts') || {}).textContent, mo: (document.querySelector('.pvp-modopts') || {}).textContent || '' }));
	let lt = await lobbyTxt(frank.page);
	A(lt.rs === 'Balanced' && /On/.test(lt.order) && /Gen 4 off/.test(lt.mo), 'the lobby: Balanced by default, The Order on, the host\'s mod options listed (Gen 4 off)', JSON.stringify(lt));
	await click(frank.page, '.b-pvp-dec-ruleset');
	A(await waitFor(async () => (await lobbyTxt(frank.page)).rs === 'Vanilla', 6000), 'the host picks Vanilla');
	const vo = await frank.page.evaluate(() => ({ o: (document.querySelector('.b-pvp-tog-order') || {}).textContent, t: (document.querySelector('.b-pvp-tog-pvpTimer') || {}).textContent }));
	A(vo.o === 'Off' && vo.t === 'Off', 'Vanilla: The Order and the PvP timer default off', JSON.stringify(vo));
	await shot(frank.page, '18-lobby-vanilla');
	await click(frank.page, '.b-pvp-inc-ruleset');
	A(await waitFor(async () => (await lobbyTxt(frank.page)).rs === 'Balanced', 6000), '... and back to Balanced');
	await click(frank.page, '.b-pvp-dec-pvpStart');
	await waitFor(() => frank.page.evaluate(() => (document.querySelector('.pvp-pvpStart') || {}).textContent === '1'), 6000);
	await shot(frank.page, '19-lobby-balanced-host');
	// gina: her own mod settings (no mods at all) are never touched; she sees the host's options read-only
	const gina = await open('gina', '/micatro/?join=' + code3);
	A(await ready(gina.page), 'gina: game ready');
	A(await waitFor(() => gina.page.evaluate(() => !!document.querySelector('.b-pvp-ready-lobby')), 60000), 'gina joined (the host\'s Pokermon loaded for her)');
	lt = await lobbyTxt(gina.page);
	const gArrows = await gina.page.evaluate(() => document.querySelectorAll('.b-pvp-dec-ruleset, .b-pvp-tog-order, .b-pvp-tog-pvpTimer').length);
	A(lt.rs === 'Balanced' && /Gen 4 off/.test(lt.mo) && gArrows === 0, 'gina sees the ruleset and the host\'s Gen 4 filter, read-only', JSON.stringify({ lt, gArrows }));
	await shot(gina.page, '20-lobby-balanced-guest');
	await click(gina.page, '.b-pvp-ready-lobby');
	await waitFor(() => frank.page.evaluate(() => { const b = document.querySelector('.b-pvp-start'); return b && !b.disabled; }), 10000);
	await click(frank.page, '.b-pvp-start');
	A(await waitFor(async () => (await view(frank.page))?.pvp && (await view(gina.page))?.pvp, 60000), 'Start: both in the Balanced match');
	await idle(frank.page); await idle(gina.page);
	const eng = (page) => page.evaluate(async () => {
		const core = await import('/micatro/js/engine/core.js');
		const G = core.G, rec = window.__micatro.session.recipe;
		return { gen4: G.GAME.mod_options.pokermon && G.GAME.mod_options.pokermon.gen_four, order: core.theOrder(), rs: G.GAME.pvp.ruleset, rec: { rs: rec.pvp.ruleset, order: rec.pvp.order, gen4: rec.modOptions && rec.modOptions.pokermon && rec.modOptions.pokermon.gen_four }, prefs: localStorage.getItem('micatro_mods') };
	});
	const ef = await eng(frank.page), eg = await eng(gina.page);
	A(ef.gen4 === false && eg.gen4 === false && ef.order && eg.order && ef.rs === 'balanced' && eg.rs === 'balanced', 'both engines: Gen 4 off, Balanced, The Order', JSON.stringify([ef, eg]));
	A(eg.rec.rs === 'balanced' && eg.rec.order === true && eg.rec.gen4 === false, 'gina\'s recipe records it all (resume / replay / spectate play the same)', JSON.stringify(eg.rec));
	A(eg.prefs === null, 'gina\'s own saved mod settings are untouched', String(eg.prefs));
	// no source offers a Gen 4 Pokémon (each player's engine: the pools, then 150 shop / pack / Judgement-style rolls on a throwaway
	// copy of the streams — the live run's recipe isn't touched: a reload afterwards replays the same run)
	const sweep = (page) => page.evaluate(async () => {
		const core = await import('/micatro/js/engine/core.js');
		const { G, P_CENTERS, get_current_pool, create_card } = core;
		const bad = new Set(); let made = 0;
		const gen4 = (k) => { const c = P_CENTERS[k]; return !!(c && c.stage && c.stage !== 'Other' && c.gen === 4); };
		for (const r of [1, 2, 3]) for (const k of get_current_pool('Joker', r)[0]) if (k !== 'UNAVAILABLE' && gen4(k)) bad.add(k);
		const saved = JSON.stringify(G.GAME.pseudorandom), used = { ...G.GAME.used_jokers };
		for (let i = 0; i < 150; i++) {
			const area = [G.shop_jokers, G.pack_cards, G.jokers][i % 3];
			const c = create_card('Joker', area, null, null, null, null, null, ['sho', 'buf', 'jud'][i % 3]);
			made++; if (gen4(c.config.center.key)) bad.add(c.config.center.key);
			c.remove();
		}
		G.GAME.pseudorandom = JSON.parse(saved); G.GAME.used_jokers = used;
		const seenGen4 = Object.values(P_CENTERS).filter((c) => c.stage && c.gen === 4).length;
		return { bad: [...bad], made, seenGen4 };
	});
	const sf = await sweep(frank.page), sg = await sweep(gina.page);
	A(!sf.bad.length && !sg.bad.length && sf.made === 150 && sf.seenGen4 > 50, 'no Gen 4 Pokémon offered to either player (pools + 150 rolls each)', JSON.stringify([sf, sg]));
	// to the Nemesis (from ante 1): skip Small + Big (a pack from a skip tag is skipped)
	for (const p of [frank.page, gina.page]) for (let k = 0; k < 2; k++) {
		await act(p, { type: 'skip_blind' }); await idle(p);
		if (/PACK/.test((await view(p)).state)) { await act(p, { type: 'skip_booster' }); await idle(p); }
	}
	A((await view(frank.page)).onDeck === 'Boss' && (await view(gina.page)).onDeck === 'Boss', 'both at the Nemesis');
	await click(frank.page, '.b-pvp-ready'); await click(gina.page, '.b-pvp-ready');
	A(await waitFor(async () => (await view(frank.page)).blind === 'bl_mp_nemesis' && (await view(gina.page)).blind === 'bl_mp_nemesis', 15000), 'both in the Nemesis');
	await idle(frank.page); await idle(gina.page);
	A(await frank.page.evaluate(() => { const b = document.querySelector('.b-pvp-ptimer'); return !b || b.style.display === 'none'; }), 'level at 0-0: no PvP timer button');
	await playStrong(gina.page);
	A(await waitFor(() => gina.page.evaluate(() => { const b = document.querySelector('.b-pvp-ptimer'); return !!b && b.style.display !== 'none' && /Start timer/.test(b.textContent); }), 10000), 'gina ahead: her HUD offers the PvP timer');
	A(await frank.page.evaluate(() => { const b = document.querySelector('.b-pvp-ptimer'); return !b || b.style.display === 'none'; }), 'frank (behind) has no PvP timer button');
	const h0 = (await view(frank.page)).hands;
	await click(gina.page, '.b-pvp-ptimer');
	A(await waitFor(() => frank.page.evaluate(() => { const t = document.querySelector('.pvp-hud .ph-ptimer.on-me'); return t && t.style.display !== 'none' && /PvP timer/.test(t.textContent); }), 8000), 'frank sees the PvP timer on him');
	await shot(frank.page, '21-pvp-timer-on-me');
	await shot(gina.page, '22-pvp-timer-started');
	A(await waitFor(async () => (await view(frank.page)).hands === h0 - 1, 25000), 'the PvP timer runs out: frank loses ONE hand (not a life)', JSON.stringify([h0, (await view(frank.page)).hands]));
	const rec7 = await frank.page.evaluate(() => window.__micatro.session.recipe.actions.filter((a) => a.type === 'pvp_hand_lost'));
	const lid3 = await frank.page.evaluate(() => window.__micatro.pvp.lobbyId);
	A(rec7.length === 1 && rec7[0].n === 1 && row('mtpvp:' + lid3).m.hl.frank === 1 && (await view(frank.page)).pvp.lives === 4, 'the hand arrives as a RECORDED action (pvp_hand_lost n 1), matching the referee; no life lost', JSON.stringify(rec7));
	await shot(frank.page, '23-pvp-timer-hand-lost');
	for (let i = 0; i < 6 && (await view(frank.page)).state === 'SELECTING_HAND'; i++) await playWeak(frank.page);
	for (let i = 0; i < 6 && (await view(gina.page)).state === 'SELECTING_HAND'; i++) await playStrong(gina.page);
	A(await waitFor(async () => (await view(frank.page)).state === 'ROUND_EVAL' && (await view(gina.page)).state === 'ROUND_EVAL', 25000), 'the round is decided -> both cash out');
	// frank reloads: his run (the lost hand included) comes back exactly
	const n7 = await frank.page.evaluate(() => window.__micatro.session.recipe.actions.length);
	await frank.page.reload({ waitUntil: 'domcontentloaded' });
	await ready(frank.page);
	A(await waitFor(async () => { const v = await view(frank.page); return v && v.pvp && v.state === 'ROUND_EVAL' && v.pvp.hlost === 1 && v.pvp.order; }, 60000), 'frank reloads -> the same run (the lost hand, The Order) re-simulated from its recipe');
	A(await frank.page.evaluate((n) => window.__micatro.session.recipe.actions.length === n, n7), '... every move kept');
	const errs3 = [...frank.errors, ...gina.errors].filter((e) => !/favicon|net::/.test(e));
	A(!errs3.length, 'stage 7: no page errors', errs3.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
