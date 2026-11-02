// micasurvivor_online_modes_test.mjs — MicaSurvivor U2 (Plans/MICASURVIVOR_UNIFIED_PLAN.md): online co-op for every variant.
// Two signed-in friends (the REAL server handler over sqlite behind a static server; WebRTC on localhost), one browser:
//   1. a Tower lobby: the host's start floor (a checkpoint only the host has) and modifier for both; the host clears a floor:
//      the guest clears it too (its own first-clear reward in its own save), each picks its own rest and pact while the run
//      waits for everyone (held), the guest's pact's enemy-side cost reaches the host's foes, both go on to the next floor
//   2. the same lobby switched to the Daily: the host's day (its rule and seed) for both, each with their OWN Pokémon
//   3. Rift Time Attack: the host's clock ends the run for both (a "win" end, not "the host has ended the game")
//   4. a Dive lobby from a saved stage: refused (named) until the guest has reached it, then both start on that floor;
//      the Weekly Dive: both on this week's seed, route and rule
//   node overworld/tests/micasurvivor_online_modes_test.mjs
// Screenshots (SHOTS=<dir>): the co-op guest's view in Classic (phone) and Survival (desktop), the host's, the spectator's.
//   node overworld/tests/micasurvivor_expedition_mp_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree and MP_SERVER=<file> another server: how the "fails before D11" count was taken.)
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
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MROOT = process.env.MICASURVIVOR_ROOT ? path.resolve(process.env.MICASURVIVOR_ROOT) : ROOT;
const MP_SERVER = process.env.MP_SERVER ? path.resolve(process.env.MP_SERVER) : path.join(ROOT, 'server/mp.mjs');
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8899;
const PHONE = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }
const T0 = Date.now();

// ======================== the server (the real handler over sqlite)
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-omodes-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [MP_SERVER], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.79.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {}, states = {};
const reg = async n => { const r = (await raw('register', { username: n, password: 'msurv-omodes-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; };
for (const n of ['alice', 'bob']) await reg(n);
await raw('add-friend', { username: 'alice' }, tokens.bob);
await raw('add-friend', { username: 'bob' }, tokens.alice);
for (const n of ['alice', 'bob']) states[n] = (await raw('state', {}, tokens[n])).body.state || states[n];
A(Object.values(tokens).every(Boolean), 'two accounts registered (alice and bob, friends both ways)');

// ======================== the browser (the static server proxies /api/mp to the same handler)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let body = ''; for await (const c of req) body += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.80.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = name => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 4: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 1, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
});
const BEFORE = (o) => {
	try {
		localStorage.setItem('micasurvivor_dev', JSON.stringify('dx' + (o.user || 'view').slice(0, 4)));
		localStorage.setItem('micasurvivor_lang', 'en');
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', o.token);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
			localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
			localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
		}
	} catch (e) { /* the test reports a boot failure */ }
	window.__msurvNet = { ice: [], lostMs: 15000, directMs: 8000, invMs: 1200, friendsMs: 1500 };
	window.__toasts = [];
	addEventListener('DOMContentLoaded', () => new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true }));
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
		args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--mute-audio'] });
	async function bootPage(o) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, o);
		const who = o.user;
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|403|404|409|429)/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
		return { ctx, page, menu, visible, E, who };
	}
	const inRun = (p, mode) => p.E(mode => G.Game.state !== 'ui' && G.Game.state !== 'over' && G.Modes.run.mode === mode && !!G.Game.player && G.Coop.active, mode);
	/** nobody dies, levels up or gets swarmed between checks (the run goes on in real time) */
	const calm = p => p.E(() => {
		const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; pl.hurt = () => {}; }
		G.Spawner.spawnOne = () => null; G.Rift.update = () => {}; G.Events.update = () => {}; G.Judgment.update = () => {};
		const C = G.ExpClassic && G.ExpClassic.run; if (C) C.acc = -1e9;
	});
	/** the guest joins the host's lobby and readies; the host starts; both in a run of `mode` */
	async function joinAndStart(host, guest, mode) {
		const id = await host.E(() => G.Social.room && G.Social.room.id);
		const inRoom = await guest.E(() => !!G.Social.room);
		if (!inRoom) await guest.E(async id => { await G.Social.joinRoom(id); G.LobbyUI.open(); }, id);
		await waitFor(() => host.E(() => G.Social.room && G.Social.room.members.length === 2), 8000);
		await waitFor(() => host.E(g => G.Net.mode(g) === 'direct', guest.who), 30000);
		await waitFor(async () => { await guest.E(async () => { const me = G.Social.room && G.Social.room.members.find(m => m.uid === G.Social.uid); if (me && !me.ready) await G.Social.setReady(true); }); return host.E(() => G.Social.room.members.every(m => m.ready) && !document.getElementById('lobby-start').disabled); }, 12000);
		await host.E(() => document.getElementById('lobby-start').click());
		return waitFor(async () => await inRun(host, mode) && await inRun(guest, mode), 30000);
	}
	/** the host quits; both are back in the lobby */
	async function backToLobby(host, guest) {
		await host.E(() => G.Game.quit());
		await waitFor(() => guest.visible('scr-over'), 15000);
		await waitFor(() => host.visible('scr-over'), 5000);
		for (const p of [host, guest]) await p.E(() => document.getElementById('btn-again') && document.getElementById('btn-again').click());
		return await waitFor(() => host.visible('scr-lobby'), 10000) && await waitFor(() => guest.visible('scr-lobby'), 10000)
			&& await waitFor(() => host.E(() => G.Social.room && G.Social.room.open && !G.Social.room.start), 8000);
	}

	const SAVE_A = Object.assign(SAVE('alice'), { tower: { claimed: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, best: 5, log: [] }, modes: { towerStart: 6, mods: ['fast'] } });
	const SAVE_B = Object.assign(SAVE('bob'), { partner: 4 });
	const alice = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE_A });
	const bob = await bootPage({ user: 'bob', token: tokens.bob, state: states.bob, save: SAVE_B });
	A(alice.menu && bob.menu, 'alice and bob boot signed in to the menu');

	// ======================== 1. Tower
	const mk = await alice.E(async () => { const c = G.Modes.lobbyCfg('tower'); const r = await G.Social.createRoom(c); G.LobbyUI.open(); return { c, bmode: r && r.bmode, opts: r && r.opts, line: document.getElementById('lobby-exp').textContent }; });
	A(mk.bmode === 'tower' && mk.opts.tstart === 6 && JSON.stringify(mk.opts.mods) === '["fast"]' && /Floor 6/.test(mk.line), 'the host\'s Tower lobby carries its start floor (6) and modifier; the lobby says what it plays', JSON.stringify(mk));
	A(await joinAndStart(alice, bob, 'tower'), 'Start puts both in the same Tower run');
	await calm(alice); await calm(bob);
	const t0 = await Promise.all([alice, bob].map(p => p.E(() => ({ floor: G.Tower.floor, on: G.Tower.on, mods: G.Modes.run.mods, group: G.Modes.run.group, dex: G.Game.player.dex, seed: G.World.seed, host: G.Coop.isHost }))));
	A(t0.every(t => t.on && t.floor === 6 && JSON.stringify(t.mods) === '["fast"]' && t.group) && t0[0].seed === t0[1].seed && t0[0].host && !t0[1].host,
		'both start on the HOST\'s floor 6 (bob never reached it) with the host\'s modifier, on one seed', JSON.stringify(t0));
	A(t0[0].dex === 1 && t0[1].dex === 4, 'each plays their own Pokémon', JSON.stringify(t0.map(t => t.dex)));
	// (the host's checkpoint gives a free level per floor skipped: everyone picks those cards first)
	for (let i = 0; i < 40; i++) {
		const st = await Promise.all([alice, bob].map(p => p.E(() => { const c = document.querySelector('#scr-levelup:not(.hidden) #cards .card'); if (c && G.Game.state === 'levelup') c.click(); return G.Game.state; })));
		if (i > 3 && st.every(s => s === 'playing')) break;
		await sleep(250);
	}
	await alice.E(() => G.Tower.clear());
	const held = await waitFor(async () => (await bob.E(() => G.Tower.phase === 1 && G.UI.isOpen('scr-tower'))) && (await alice.E(() => G.Tower.phase === 1)), 6000);
	A(held, 'the host clears floor 6: both get their own rest screen');
	const rew = await bob.E(() => ({ claimed: !!G.DB.save.tower.claimed[6], floor: G.Tower.floor }));
	A(rew.claimed && rew.floor === 7, 'the guest cleared it too: floor 6 is in ITS save (its own first-clear reward); next floor 7', JSON.stringify(rew));
	await alice.E(() => { G.Tower.restPick('heal'); G.Tower.riskPick('skip'); });
	const hostWait = await waitFor(() => alice.E(() => G.Game.state === 'held'), 4000);
	A(hostWait, 'the host picked; the run waits for the guest (held)', await alice.E(() => G.Game.state));
	await bob.E(() => { G.Tower.restPick('shield'); G.Tower.riskPick('scholar'); });
	A(await waitFor(async () => (await alice.E(() => G.Game.state === 'playing')) && (await bob.E(() => G.Game.state === 'playing')), 6000), 'the guest picked: the run goes on for both');
	const pact = await alice.E(() => ({ team: G.Tower.teamRisks, ehp: G.Tower.rkE('ehp'), mine: G.Tower.risks }));
	A(JSON.stringify(pact.team) === '["scholar"]' && Math.abs(pact.ehp - 1.2) < 1e-9 && !pact.mine.length, 'the guest\'s pact (Forbidden Knowledge) puts its enemy-side cost on the host\'s foes (HP x1.2); not on the host\'s own pacts', JSON.stringify(pact));
	const t1 = await Promise.all([alice, bob].map(p => p.E(() => [G.Tower.floor, G.Tower.risks, G.Tower.shield > 0])));
	A(t1[0][0] === 7 && t1[1][0] === 7 && JSON.stringify(t1[1][1]) === '["scholar"]' && t1[1][2], 'both on floor 7; the guest keeps its own pact and its rest shield', JSON.stringify(t1));
	A(await backToLobby(alice, bob), 'the host quits: both back in the lobby');

	// ======================== 2. Daily
	const dl = await alice.E(async () => { const r = await G.Social.setCfg(G.Modes.lobbyCfg('daily')); return { r, bmode: G.Social.room.bmode, opts: G.Social.room.opts }; });
	A(dl.r.ok && dl.bmode === 'daily' && dl.opts.dseed > 20200101, 'the host switches the lobby to the Daily (its day)', JSON.stringify(dl));
	A(await joinAndStart(alice, bob, 'daily'), 'Start puts both in the Daily');
	await calm(alice); await calm(bob);
	const d0 = await Promise.all([alice, bob].map(p => p.E(() => ({ seed: G.Modes.run.seed, mods: G.Modes.run.mods, rule: G.Modes.dailyMod(G.Modes.run.seed), dex: G.Game.player.dex, wseed: G.World.seed }))));
	A(d0[0].seed === dl.opts.dseed && d0[1].seed === dl.opts.dseed && d0.every(d => JSON.stringify(d.mods) === JSON.stringify([d.rule])) && d0[0].wseed === d0[1].wseed,
		'both play the host\'s day: its seed and its rule', JSON.stringify(d0));
	A(d0[0].dex === 1 && d0[1].dex === 4, 'each keeps their OWN Pokémon (not the day\'s)', JSON.stringify(d0));
	A(await backToLobby(alice, bob), 'back in the lobby');

	// ======================== 3. Rift Time Attack: the host's clock ends it for everyone
	await alice.E(async () => { await G.Social.setCfg(G.Modes.lobbyCfg('rifts')); });
	A(await joinAndStart(alice, bob, 'rifts'), 'Start puts both in Rift Time Attack');
	await calm(alice); await calm(bob);
	const r0 = await bob.E(() => (G.DB.save.stats.riftsRuns || 0));
	await bob.E(() => { document.querySelectorAll('.toast').forEach(t => { t.textContent = ''; }); window.__toasts.length = 0; G.Game.debugTime(600); });
	await sleep(800);
	A(await bob.E(() => G.Game.state !== 'over'), 'a guest\'s own clock never ends the run (the host is the authority)');
	await alice.E(() => G.Game.debugTime(481));
	A(await waitFor(() => bob.visible('scr-over'), 10000) && await waitFor(() => alice.visible('scr-over'), 5000), 'the host\'s clock runs out: the run ends for both');
	const r1 = await bob.E(() => ({ runs: G.DB.save.stats.riftsRuns || 0, toasts: window.__toasts.slice() }));
	A(r1.runs === r0 + 1 && !r1.toasts.some(t => /host has ended/.test(t)), 'the guest\'s run counts as a Time Attack, not as "the host has ended the game"', JSON.stringify([r0, r1]));
	for (const p of [alice, bob]) await p.E(() => document.getElementById('btn-again') && document.getElementById('btn-again').click());
	await waitFor(() => alice.visible('scr-lobby'), 10000);
	await alice.E(() => G.Social.leaveRoom());
	await waitFor(() => bob.E(() => !G.Social.room), 15000);
	await bob.E(() => G.MenuUI.open());
	await alice.E(() => G.MenuUI.open());

	// ======================== 4. Dive from a saved stage, then the Weekly Dive
	const prep = p => p.E(async () => { await G.Expedition.load(); await G.ExpSave.open(); return !!G.ExpDive; });
	A(await prep(alice) && await prep(bob), 'both load the Expedition');
	await alice.E(() => { G.ExpSave.best('dive.reef.stage', 26); G.ExpSave.commit(); });
	const dk = await alice.E(async () => { const r = await G.Social.createRoom({ mode: 'exp-dive', map: 'dive:reef', diff: 'normal', opts: { start: 26 } }); G.LobbyUI.open(); return r && { map: r.map, opts: r.opts, line: document.getElementById('lobby-exp').textContent }; });
	A(dk && dk.map === 'dive:reef' && dk.opts.start === 26 && /Floor 26/.test(dk.line), 'a Dive lobby from stage 26 of the reef (the lobby says so)', JSON.stringify(dk));
	const did = await alice.E(() => G.Social.room.id);
	await bob.E(async id => { await G.Social.joinRoom(id); G.LobbyUI.open(); await G.Social.setReady(true); }, did);
	await waitFor(() => alice.E(() => G.Social.room.members.length === 2 && G.Social.room.members.every(m => m.ready)), 10000);
	await waitFor(() => alice.E(() => G.Net.mode('bob') === 'direct'), 30000);
	await sleep(600);
	const refused = await alice.E(() => ({ dis: document.getElementById('lobby-start').disabled, note: document.getElementById('lobby-note').textContent }));
	A(refused.dis && /Haven't reached floor 26 on this route: bob/.test(refused.note), 'Start stays off and names who has not reached floor 26', JSON.stringify(refused));
	const srv = await raw('msurv-lobby-update', { id: did, start: { seed: 1 } }, tokens.alice);
	A(srv.status === 409 && /not reached/.test(srv.body.error), '...and the server refuses that start too', JSON.stringify(srv));
	await bob.E(async () => { G.ExpSave.best('dive.reef.stage', 26); G.ExpSave.commit(); G.Social.refreshMember(); });
	A(await waitFor(() => alice.E(() => !document.getElementById('lobby-start').disabled), 10000), 'bob reaches the stage: Start is on');
	await alice.E(() => document.getElementById('lobby-start').click());
	A(await waitFor(async () => await inRun(alice, 'exp-dive') && await inRun(bob, 'exp-dive'), 30000), 'both in the Dive');
	await sleep(1500);
	const dv0 = await Promise.all([alice, bob].map(p => p.E(() => { const S = G.ExpDive.run || G.ExpDive.view; return { start: S && S.start, floor: S && S.floor, route: S && S.route, weekly: !!(S && S.weekly) }; })));
	A(dv0.every(d => d.start === 26 && d.route === 'reef' && !d.weekly) && dv0[0].floor === 26, 'both start the reef on floor 26 (the host\'s stage)', JSON.stringify(dv0));
	A(await backToLobby(alice, bob), 'back in the lobby');
	const wk = await alice.E(async () => { const w = G.Expedition.diveWeekly(); const r = await G.Social.setCfg({ opts: { weekly: w.week }, map: 'dive:' + w.route }); return { r, w, opts: G.Social.room.opts, map: G.Social.room.map }; });
	A(wk.r.ok && wk.opts.weekly === wk.w.week && wk.opts.start === 1 && wk.map === 'dive:' + wk.w.route, 'the host switches the lobby to this week\'s Weekly Dive', JSON.stringify(wk));
	A(await joinAndStart(alice, bob, 'exp-dive'), 'both in the Weekly Dive');
	await sleep(1500);
	const dw = await Promise.all([alice, bob].map(p => p.E(() => { const S = G.ExpDive.run || G.ExpDive.view; return { week: S && S.weekly && S.weekly.week, route: S && S.route, start: S && S.start, seed: G.World.seed, rseed: G.Modes.run.seed }; })));
	A(dw.every(d => d.week === wk.w.week && d.route === wk.w.route && d.start === 1 && d.rseed === wk.w.seed) && dw[0].seed === dw[1].seed, 'both play the week\'s route and rule from floor 1, on one seed', JSON.stringify(dw));
} catch (e) {
	fail++;
	console.log('FAIL: the test crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
const errs = errors.filter(e => !/favicon|ResizeObserver|WebRTC|RTCPeer|ICE/i.test(e));
A(!errs.length, 'no page errors', errs.slice(0, 6).join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
process.exit(fail ? 1 : 0);
