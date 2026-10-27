// micasurvivor_expedition_mp_test.mjs — MicaSurvivor DLC D11: online co-op, spectating, the relay budget and the replay size on
// the Expedition. Two signed-in friends in real co-op (the REAL server handler, bundled like the dev server over sqlite, behind a
// static server; WebRTC on localhost), then a spectator, then two long fast-forward runs. One browser (and it always exits).
//   1. an Expedition lobby: "With friends" makes it (mode, map, tier on the server row and in the lobby); a friend joins with
//      his own League member on his card; the start puts both in the same Expedition run (dv 10) on the lobby's map and tier
//   2. Classic: the guest (a phone, 844 x 390, touch) gets the DLC state: the same terrain, the tier (Hard on its HUD), its
//      own League member, kit and meta row (its Lab level is ITS effect on the host), its verbs (a hop seen by the host), its
//      Ultimate (the host sees the cast), the interactables (the host's `o` block; a Poké Ball the guest stands in opens ITS
//      choice of items from ITS pool, paid from the team's ₽), a capture (the guest stands by a fainted alpha: the Friend Ball
//      is its own, the Support Alpha joins ITS team and fights round its puppet on the host, shooting) and its reactions'
//      pop-ups on the host
//   3. the relay budget: a busy host frame (a full cap of foes round the guest + every DLC block) against the server's
//      MSURV_RELAY_MSG_MAX (16,000) and its relay row (64,000): measured, and pushed through the real msurv-relay-push
//   4. Survival with the roles swapped (the phone hosts, the desktop is the guest): the guest gets the host's milestones
//      (`s`), its own pact choice after a milestone boss (its team bane counts on the host), the night and the hazards from
//      the clock, the migration portal, its siege row on the host; the local partner gets the verbs
//   5. a spectator of the host: the terrain, the night, the hazards, Survival's HUD, both players' Support Alphas shooting,
//      the reactions' pop-ups, from real snapshots (x v10); the snapshot under the 24 KB live cap
//   6. replay size: a 45-min Survival replay (fast-forward to Mewtwo, migrations, every event) and a full Classic clear,
//      each packed under the server's 1.2 MB (MSURV_REPLAY_MAX)
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
const PORT = 8879;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-xmp-')), 'mp.bundle.mjs');
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
const reg = async n => { const r = (await raw('register', { username: n, password: 'msurv-xmp-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; };
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
	const H = window.__t = {};
	try {
		localStorage.setItem('micasurvivor_dev', JSON.stringify('dx' + (o.user || 'view').slice(0, 4)));
		localStorage.setItem('micasurvivor_lang', 'en');
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			if (o.user && o.token) {
				localStorage.setItem('magepunk_mp_token_v1', o.token);
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
				localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
				localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
			} else {
				localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
				localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
				localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
			}
		}
	} catch (e) { /* the test reports a boot failure */ }
	// WebRTC on localhost with host candidates only; the timeouts short (micasurvivor_online_test's settings)
	window.__msurvNet = Object.assign({ ice: [], lostMs: 15000, directMs: 8000, invMs: 1200, friendsMs: 1500 }, o.net || {});
	/** no foes, no levels, no harm: the run holds still between checks (a co-op run goes on in real time) */
	H.calm = () => {
		const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; pl.hurt = () => {}; }
		const C = G.ExpClassic && G.ExpClassic.run; if (C) { C.acc = -1e9; if (C.plan) C.plan.events = []; C.n = 1e9; }
		const S = G.ExpSurv && G.ExpSurv.run; if (S && !S.guest) { S.seg = Math.floor(G.Game.st.time / 300); S.segEv = []; S.segN = 0; }
	};
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null; pl.vx = 0; pl.vy = 0; G.Camera.x = x; G.Camera.y = y; };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) e.remote = true; G.EnemyMgr.clear(); if (G.ExpCap && G.ExpCap.run) { G.ExpCap.run.tg.clear(); G.ExpCap.run.faint.length = 0; } if (G.ExpSurv && G.ExpSurv.run) G.ExpSurv.run.bosses.length = 0; if (G.ExpClassic.run) G.ExpClassic.run.boss = null; };
	H.choose = k => { const E = G.ExpEco; if (!E.pick) return false; E.pick.at = 0; return E.choose(k); };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 900000,
		args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--mute-audio'] });
	async function bootPage(o, view) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, o);
		const who = o.user || 'viewer';
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
	const shoot = async (p, name, ms = 500) => {
		if (!SHOTS) return null;
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await p.page.screenshot({ path: f });
		console.log('     screenshot: ' + f);
		return f;
	};
	const prep = p => p.E(async () => {
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { ok: false, err: ok };
		await G.ExpSave.open();
		return { ok: true, dv: G.Expedition.DV, xv: G.Exp.XV };
	});
	const inRun = (p, mode) => p.E(mode => G.Game.state === 'playing' && G.Modes.run.mode === mode && !!G.Game.player, mode);
	const calm = p => p.E(() => window.__t.calm());
	/** the lobby: the host makes an Expedition room of `mode` on its pick (map + tier), the guest joins; both ready; start */
	async function lobbyStart(host, guest, mode) {
		const mk = await host.E(async (mode) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			if (G.UI.isOpen('scr-modes')) G.UI.show('scr-menu', true);
			G.ModesUI.open(); await wait(200);
			document.querySelector('[data-xcoop="' + mode + '"]').click();
			for (let i = 0; i < 60 && !(G.Social.room && G.UI.isOpen('scr-lobby')); i++) await wait(100);
			const R = G.Social.room;
			return R ? { id: R.id, mode: R.mode, dv: R.dv, map: R.map, diff: R.diff, exp: (document.getElementById('lobby-exp') || {}).textContent, expShown: !document.getElementById('lobby-exp').classList.contains('hidden') } : null;
		}, mode);
		if (!mk) return { mk };
		const jn = await guest.E(async (id) => { const r = await G.Social.joinRoom(id); G.LobbyUI.open(); await new Promise(r => setTimeout(r, 400)); return { r, exp: (document.getElementById('lobby-exp') || {}).textContent }; }, mk.id);
		await waitFor(() => host.E(() => G.Social.room && G.Social.room.members.length === 2), 8000);
		const direct = await waitFor(() => host.E(g => G.Net.mode(g) === 'direct', guest.who), 30000);
		await guest.E(async () => { const me = G.Social.room && G.Social.room.members.find(m => m.uid === G.Social.uid); if (me && !me.ready) await G.Social.setReady(true); });
		await waitFor(() => host.E(() => G.Social.room.members.every(m => m.ready) && !document.getElementById('lobby-start').disabled), 10000);
		const card = await waitFor(() => host.E(g => { const m = G.Social.room.members.find(x => x.uid === g || x.name === g); return m && m.dex; }, guest.who), 5000)
			? await host.E(g => (G.Social.room.members.find(x => x.uid === g || x.name === g) || {}).dex, guest.who) : null;
		await host.E(() => document.getElementById('lobby-start').click());
		const both = await waitFor(async () => await inRun(host, mode) && await inRun(guest, mode), 30000);
		return { mk, jn, direct, both, card };
	}

	// ======================== 1. an Expedition lobby with a friend
	const alice = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
	const bob = await bootPage({ user: 'bob', token: tokens.bob, state: states.bob, save: SAVE('bob') }, PHONE);
	A(alice.menu && bob.menu, 'alice (desktop) and bob (a phone, 844 x 390, touch) boot signed in to the menu');
	const pa = await prep(alice), pb = await prep(bob);
	A(pa.ok && pb.ok && pa.dv === 20 && pa.xv === 10, 'both load the Expedition (dv 17, x v10)', JSON.stringify([pa, pb]));
	// bob's own League member (Charmander, his) and a Lab level of his own (Training 3: +12 % damage)
	const bobSetup = await bob.E(() => { G.ExpSave.add('league.own', 4); const ok = G.ExpLeague.setPick(4); G.ExpSave.best('lab.training', 3); G.ExpSave.commit(); return { ok, pick: G.Expedition.leaguePick() }; });
	A(bobSetup.ok && bobSetup.pick === 4, 'bob picks his own League member (Charmander) and has his own Lab (Training 3)', JSON.stringify(bobSetup));
	await alice.E(() => { G.ExpSave.best('tier.viridian', 1); G.ExpSave.commit(); return G.ExpTier.setPick('viridian', 'hard'); });   // (Hard unlocked on alice's save; the lobby takes the host's pick)
	const L1 = await lobbyStart(alice, bob, 'exp-classic');
	const lrow = L1.mk && row('msurvlobby:' + L1.mk.id);
	A(L1.mk && L1.mk.mode === 'exp-classic' && L1.mk.dv === 20 && L1.mk.map === 'viridian' && L1.mk.diff === 'hard' && lrow && lrow.mode === 'exp-classic' && lrow.map === 'viridian' && lrow.diff === 'hard',
		'"With friends: Expedition · Classic" makes an Expedition lobby: mode, dv 10, map and tier on the server row (msurvlobby:<id>)', JSON.stringify({ mk: L1.mk, row: lrow && { mode: lrow.mode, dv: lrow.dv, map: lrow.map, diff: lrow.diff } }));
	A(L1.mk && L1.mk.expShown && L1.mk.exp === 'Expedition · Classic · Viridian Forest · Hard' && L1.jn && L1.jn.r.ok && L1.jn.exp === 'Expedition · Classic · Viridian Forest · Hard',
		'the lobby says what everyone plays: "Expedition · Classic · Viridian Forest · Hard" (host and guest)', JSON.stringify([L1.mk && L1.mk.exp, L1.jn]));
	A(L1.direct && L1.card === 4, 'bob joins (a direct data channel); his lobby card shows his League member (Charmander)', JSON.stringify({ direct: L1.direct, card: L1.card }));
	A(L1.both, 'Start puts both in the same Expedition · Classic run', JSON.stringify(L1).slice(0, 400));
	if (!L1.both) throw new Error('no co-op run: the rest needs it');
	await calm(alice); await calm(bob);

	// ======================== 2. Classic: the guest's DLC state
	await sleep(1500);
	const runA = await alice.E(() => ({ mode: G.Modes.run.mode, dv: G.Modes.run.dv, map: G.Modes.run.map, diff: G.Modes.run.diff, seed: G.World.seed, hash: G.World.zone && G.World.zone.hash, host: G.Coop.isHost, timeline: !!G.ExpClassic.run, dex: G.Game.player.dex, group: !!G.Modes.run.group, mate: !!(G.LocalCoop && G.LocalCoop.mate) }));
	const runB = await bob.E(() => ({ mode: G.Modes.run.mode, dv: G.Modes.run.dv, map: G.Modes.run.map, diff: G.Modes.run.diff, seed: G.World.seed, hash: G.World.zone && G.World.zone.hash, host: G.Coop.isHost, timeline: !!G.ExpClassic.run, dex: G.Game.player.dex,
		league: !!(G.ExpLeague && G.ExpLeague.run), meta: !!(G.ExpMeta && G.ExpMeta.run), row: G.ExpMeta.row(), view: G.ExpClassic.view && G.ExpClassic.view.diff, line: G.ExpClassic.hudLine(G.Game.player, G.Game.st), touch: G.Touch.active }));
	A(runA.mode === 'exp-classic' && runB.mode === 'exp-classic' && runA.dv === 20 && runB.dv === 20 && runA.map === 'viridian' && runB.diff === 'hard' && runA.diff === 'hard' && runA.seed === runB.seed && runA.hash && runA.hash === runB.hash,
		'both play Expedition · Classic, Viridian Forest, Hard (the lobby\'s), on the same seed: the guest rebuilt the same terrain (zone hash)', JSON.stringify({ runA, runB }).slice(0, 500));
	A(runA.host && runA.timeline && !runB.host && !runB.timeline && runB.view === 'hard' && /HARD/.test(runB.line) && runB.touch, 'the host runs the timeline; the guest reads it (its `c` view: the tier, "HARD" on its HUD)', JSON.stringify({ line: runB.line, view: runB.view }));
	A(runB.dex === 4 && runA.dex !== 4 && runB.league && runB.meta && Array.isArray(runB.row) && runB.row[0][0] === '3' && runA.group && !runA.mate,
		'the guest plays its own League member (Charmander) with its own meta row (its Lab: Training 3); an online co-op run brings no local partner', JSON.stringify({ a: runA.dex, b: runB.dex, row: runB.row }));
	const metaH = await alice.E(() => { const p = G.Coop.mate('bob').pl; return { row: p.xmr, dmg: G.ExpMeta.statOf(p, 'dmg'), dex: p.dex }; });
	// (DLC D18: Training is retired, so the row's level 3 there gives nothing: was "+12 % damage from Training 3")
	A(JSON.stringify(metaH.row) === JSON.stringify(runB.row) && Math.abs(metaH.dmg) < 1e-9 && metaH.dex === 4, 'the host sees bob\'s meta row on his puppet, read as his own (Training 3, retired in D18: no damage bonus)', JSON.stringify(metaH));
	// verbs: bob hops; the host sees it
	const hop0 = await alice.E(() => { const r = G.Coop.mate('bob').xrow; return r ? r[5] | 0 : 0; });
	// (a press is swallowed while the guest is already in the air or held: press again, up to 3 times)
	let hopSeen = false;
	for (let k = 0; k < 3 && !hopSeen; k++) {
		await bob.E(() => { const pl = G.Game.player; pl.air = null; pl.frozen = false; G.ExpVerbs.press('hop'); });
		hopSeen = await waitFor(() => alice.E(h0 => { const r = G.Coop.mate('bob').xrow; return r && (r[5] | 0) > h0; }, hop0), 3000);
	}
	A(hopSeen, 'verbs: the guest hops; the host sees the hop on its puppet (the air row\'s hop count)');
	// the Ultimate: bob's meter full, he casts; the host sees the cast
	await bob.E(() => { G.ExpUlt.run.c = 1; G.ExpUlt.press(); });
	const ultSeen = await waitFor(() => alice.E(() => { const p = G.Coop.mate('bob').pl; return !!(p.xw && (p.xw[4] & 1)) || !!p.xult; }), 5000);
	A(ultSeen, 'Ultimates: the guest casts its own; the host sees the cast on its puppet (the `w` row)');
	await calm(alice); await alice.E(() => window.__t.wipe());
	// the interactables: the host's `o` block; a Poké Ball the guest stands in
	const ball = await alice.E(() => {
		const L = G.ExpEco.layoutOf(G.World.zone), Z = G.ExpEco.run.z || null;
		const o = L.objs.find(x => x.kind === 'ball' && (!Z || Z.st[x.i] === G.ExpEco.FRESH));
		G.Game.player.coins = 5000;   // (the team's ₽ are the host's)
		return o ? { i: o.i, x: o.x, y: o.y, n: L.objs.length } : null;
	});
	const oView = await bob.E(() => { const v = G.ExpEco.view; return v ? { has: true, keys: Object.keys(v) } : null; });
	A(ball && oView && oView.has, 'interactables: the guest has the host\'s `o` block (the zone\'s ' + (ball && ball.n) + ' interactables, their state)', JSON.stringify(oView));
	const items0 = await bob.E(() => Object.keys(G.Game.player.xi || {}).length);
	await bob.E(b => window.__t.go(b.x, b.y), ball);
	const pickB = await waitFor(() => bob.E(() => !!(G.ExpEco.pick && G.ExpEco.pick.kind === 'ball')), 8000);
	const pk = await bob.E(() => { const P = G.ExpEco.pick; return P ? { kind: P.kind, n: (P.ids || []).length } : null; });
	await shoot(bob, 'coop-guest-classic-ball-phone.png', 300);
	await bob.E(() => window.__t.choose(0));
	const usedHost = await waitFor(() => alice.E(i => G.ExpEco.run.z && G.ExpEco.run.z.st[i] === G.ExpEco.USED, ball.i), 4000);
	const items1 = await bob.E(() => Object.keys(G.Game.player.xi || {}).length);
	const coinsA = await alice.E(() => G.Game.player.coins);
	A(pickB && pk && pk.n >= 3 && usedHost && items1 === items0 + 1 && coinsA < 5000,
		'a Poké Ball the guest stands in: the host opens it (paid from the team\'s ₽) and the GUEST picks from its own roll; the item is the guest\'s', JSON.stringify({ pickB, pk, usedHost, items0, items1, coinsA }));
	await bob.E(() => { if (G.ExpEco.pick) G.ExpEco.closePick(true); });
	// a capture: an alpha faints by bob; he stands by it; the Friend Ball is his
	const cap = await alice.E(() => {
		const H = window.__t, bp = G.Coop.mate('bob').pl, K = G.ExpClassic.K.ALPHA;
		const e = G.ExpClassic.spawnFoe(16, bp.x + 40, bp.y, { ti: 1, hp: K.hp, dmg: K.dmg, xp: K.xp, scale: K.scale, spd: 0, kind: 'alpha' });
		if (!e) return null;
		e.spd = 0; e.hurt(e.maxHp * 10);
		return { id: e.id, x: e.x, y: e.y };
	});
	const faintSeen = await waitFor(() => alice.E(() => G.ExpCap.run.faint.length > 0), 4000);
	const f0 = await alice.E(() => { const f = G.ExpCap.run.faint[0]; return f ? { x: f.x, y: f.y, dex: f.dex } : null; });
	if (f0) await bob.E(f => window.__t.go(f.x + 6, f.y + 4), f0);
	const caught = await waitFor(() => bob.E(() => G.ExpCap.run && G.ExpCap.run.sa.length > 0), 15000);
	const capB = await bob.E(() => ({ sa: G.ExpCap.run.sa.map(s => s.dex), n: G.ExpCap.run.n }));
	const capH = await waitFor(() => alice.E(() => { const p = G.Coop.mate('bob').pl; return Array.isArray(p.xsa) && p.xsa.length > 0; }), 6000);
	const capH2 = await alice.E(() => ({ xsa: G.Coop.mate('bob').pl.xsa, own: G.ExpCap.run.sa.length, shots0: G.ExpCap.ghostShots }));
	A(cap && faintSeen && caught && capB.sa[0] === 16 && capH && capH2.own === 0 && JSON.stringify(capH2.xsa) === '[16]',
		'a capture by the guest: the host hands it the fainted alpha (its Friend Ball, its cinematic); the Support Alpha is in the GUEST\'s team, not the host\'s; the host draws it round bob\'s puppet', JSON.stringify({ cap, f0, capB, capH2 }));
	// (an enemy for the Support Alpha to shoot at, on the host)
	await alice.E(() => { const bp = G.Coop.mate('bob').pl; const e = G.ExpClassic.spawnFoe(13, bp.x + 120, bp.y + 30, {}); if (e) { e.spd = 0; e.maxHp = e.hp = 1e7; } });
	const shots = await waitFor(() => alice.E(s0 => G.ExpCap.ghostShots > s0, capH2.shots0), 6000);
	A(shots, 'the host sees bob\'s Support Alpha fight round his puppet (its shots, as ghosts: no double damage)', JSON.stringify(await alice.E(() => G.ExpCap.ghostShots)));
	// reactions: bob's pop-up shows on the host
	const pop0 = await alice.E(() => G.ExpRx.popsShown);
	await bob.E(() => { const pl = G.Game.player; G.ExpRx.react('electro', { x: pl.x + 60, y: pl.y, bodyH: 30, xwet: 1, dead: false }, 10, G.Game.st.time); });
	const popSeen = await waitFor(() => alice.E(p0 => G.ExpRx.popsShown > p0, pop0), 4000);
	A(popSeen, 'a reaction by the guest: its pop-up shows on the host (the `r` block)');
	await shoot(bob, 'coop-guest-classic-phone.png', 600);
	await shoot(alice, 'coop-host-classic-desktop.png', 100);
	const phoneHud = await bob.E(() => { const r = G.HUD.rects ? G.HUD.rects() : []; return { W: innerWidth, H: innerHeight, side: document.documentElement.scrollWidth - innerWidth, rects: r.filter(m => m.x < -1 || m.y < -1 || m.x + m.w > innerWidth + 1 || m.y + m.h > innerHeight + 1).map(m => m.name) }; });
	A(phoneHud.W === 844 && phoneHud.side <= 0 && !phoneHud.rects.length, 'the phone guest\'s HUD fits 844 x 390 (every marked element on screen, no sideways scroll)', JSON.stringify(phoneHud));

	// ======================== 3. the relay budget
	const rel = await alice.E(async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const bp = G.Coop.mate('bob').pl, cap = Math.round(G.ExpClassic.K.CAP * G.ExpClassic.tierOf('hard').cap);
		// a full cap of foes round the guest (alphas, elites among them), the team's and the guest's Support Alphas, pop-ups
		const out = { cap };
		// (DLC D16: every move fires: the host with its whole kit (Lv 8: 4 moves), each cast a 'c' event to the guests)
		{ const pl = G.Game.player; pl.level = Math.max(pl.level, 8); G.ExpLeague.process(pl); out.moves = pl.slots.length; }
		let n = G.EnemyMgr.count;
		for (let i = 0; n < cap && i < cap * 2; i++) { const a = i * 2.39996, d = 120 + (i % 9) * 80; const e = G.ExpClassic.spawnFoe([10, 13, 16, 19, 21, 29, 32, 43][i % 8], bp.x + Math.cos(a) * d, bp.y + Math.sin(a) * d * 0.8, i % 12 === 0 ? { kind: 'elite', scale: 1.3 } : {}); if (e) { e.spd = 0; e.maxHp = e.hp = 1e7; n++; } }
		for (let i = 0; i < 8; i++) G.ExpRx.react(['electro', 'melt', 'rage'][i % 3], { x: bp.x + i * 20, y: bp.y, bodyH: 30, xwet: 1 }, 10, G.Game.st.time);
		out.enemies = G.EnemyMgr.count;
		const sizes = [], send = G.Net.send;
		const t0 = performance.now(); let cN = 0, cChars = 0;
		G.Net.send = (u, msg) => { if (u === 'bob' && msg && msg.k === 'f') { for (const ev of msg.ev || []) if (ev && ev[0] === 'c') { cN++; cChars += JSON.stringify(ev).length + 1; } } if (u === 'bob' && msg && msg.k === 'f') sizes.push({ n: JSON.stringify(msg).length, x: msg.x ? JSON.stringify(msg.x).length : 0, e: (msg.e || []).length, keys: msg.x ? Object.keys(msg.x).join('') : '' }); return send(u, msg); };
		await wait(2500);
		G.Net.send = send;
		out.frames = sizes.length;
		// (DLC D16: a relayed frame carries ~1 s of events: the casts of every move of the host in a second, on top of the busiest frame)
		const secs = (performance.now() - t0) / 1000; out.cPerSec = Math.round(cN / secs * 10) / 10; out.cCharsPerSec = Math.round(cChars / secs);
		const big = sizes.sort((a, b) => b.n - a.n)[0] || {};
		out.max = big.n; out.x = big.x; out.e = big.e; out.keys = big.keys;
		// the biggest one itself, to push through the server's relay
		out.sample = null;
		const cap2 = []; G.Net.send = (u, msg) => { if (u === 'bob' && msg && msg.k === 'f') cap2.push(msg); return send(u, msg); };
		await wait(600); G.Net.send = send;
		out.sample = cap2.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0] || null;
		out.guest = null;
		return out;
	});
	const relG = await bob.E(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), s = [], t = G.Net.toHost; G.Net.toHost = msg => { if (msg && msg.k === 'f') s.push(JSON.stringify(msg).length); return t(msg); }; await wait(1500); G.Net.toHost = t; return { n: s.length, max: Math.max(0, ...s) }; });
	console.log(`     relay: a busy host frame to the guest is ${rel.max} chars (${rel.e} foes, x block ${rel.x} chars: ${rel.keys}); the guest's frame ${relG.max}; budget 16,000 a message, 64,000 a relay row`);
	console.log(`     relay (DLC D16, every move fires): the host's ${rel.moves} moves cast ${rel.cPerSec} 'c' events a second (${rel.cCharsPerSec} chars); busiest frame + 1 s of casts = ${rel.max + rel.cCharsPerSec} chars`);
	A(rel.moves === 4 && rel.max + rel.cCharsPerSec < 16000, 'relay budget with every move firing (DLC D16): the busiest host frame plus a second of the 4 moves\' cast events fits one relayed message (16,000)', JSON.stringify({ moves: rel.moves, max: rel.max, c: rel.cCharsPerSec }));
	A(rel.max > 0 && rel.e >= 60 && rel.max <= 16000 && relG.max > 0 && relG.max <= 16000, 'relay budget: the busiest host frame (a full cap of foes + every DLC block) and the guest\'s frame each fit one relayed message (16,000)', JSON.stringify({ rel: { max: rel.max, e: rel.e, x: rel.x, cap: rel.cap, enemies: rel.enemies }, relG }));
	A(rel.max * 3 <= 64000, 'three of them fit one relay row (64,000: a 1 Hz relay keeps ~3 unacknowledged frames to a guest)', rel.max * 3);
	if (rel.sample) {
		const lid = L1.mk.id;
		const push = await raw('msurv-relay-push', { id: lid, to: { bob: [[1, rel.sample]] }, ack: {}, since: 0 }, tokens.alice);
		A(push.status === 200, 'the real server takes that frame through msurv-relay-push (its message and row caps)', JSON.stringify(push.body).slice(0, 200));
	}
	await alice.E(() => window.__t.wipe());

	// back to the menus (the host quits; both see the run-over, then the lobby)
	await alice.E(() => G.Game.quit());
	await waitFor(async () => (await alice.E(() => G.Game.state)) === 'over' && (await bob.E(() => G.Game.state)) === 'over', 15000);
	for (const p of [alice, bob]) await p.E(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); if (G.UI.isOpen('scr-over')) { const b = document.getElementById('btn-menu') || document.getElementById('btn-again'); G.Flow.afterRun(); await wait(300); } if (G.Social.room) await G.Social.leaveRoom(); G.UI.show('scr-menu', true); });
	await sleep(800);

	// ======================== 4. Survival, roles swapped: bob (the phone) hosts, alice (desktop) is the guest
	await bob.E(() => G.ExpTier.setPick('viridian', 'normal'));
	const L2 = await lobbyStart(bob, alice, 'exp-survival');
	A(L2.mk && L2.mk.mode === 'exp-survival' && L2.both, '"With friends: Expedition · Survival": bob hosts, alice joins, both in a Survival run', JSON.stringify(L2).slice(0, 400));
	if (!L2.both) throw new Error('no Survival co-op run');
	await calm(alice); await calm(bob);
	await sleep(1200);
	const sv0 = await alice.E(() => ({ guest: G.ExpSurv.run && G.ExpSurv.run.guest, timeline: !!G.ExpClassic.run, line: G.ExpClassic.hudLine(G.Game.player, G.Game.st) }));
	A(sv0.guest && !sv0.timeline && /SURVIVAL/.test(sv0.line), 'the guest\'s Survival: no timeline of its own (the host\'s `s` block), its HUD says SURVIVAL', JSON.stringify(sv0));
	// a milestone boss: the host jumps to 5:00 and beats it; each player chooses its own pact
	await bob.E(() => { G.Game.debugTime(299.5); const S = G.ExpSurv.run; S.miles = 0; S.nextMig = 1e9; window.__t.calm(); });
	await waitFor(() => bob.E(() => G.ExpSurv.run.bosses.length > 0), 6000);
	const boss = await bob.E(() => { const e = G.ExpSurv.run.bosses[0].e; return { dex: e.dex, mile: e.xmile }; });
	const bossSeenG = await waitFor(() => alice.E(() => G.ExpSurv.view && G.ExpSurv.view.miles === 1), 5000);
	await bob.E(() => { const e = G.ExpSurv.run.bosses[0].e; e.hurt(e.hp * 10, '#fff'); });
	const pactH = await waitFor(() => bob.E(() => !!(G.ExpEco.pick && G.ExpEco.pick.kind === 'pact')), 8000);
	const heldG = await alice.E(() => G.Game.state);
	await bob.E(() => window.__t.choose(0));
	const pactG = await waitFor(() => alice.E(() => !!(G.ExpEco.pick && G.ExpEco.pick.kind === 'pact')), 8000);
	await shoot(alice, 'coop-guest-survival-pact-desktop.png', 300);
	const pactCards = await alice.E(() => G.ExpEco.pick ? G.ExpEco.pick.cards.map(c => c.nm) : null);
	await alice.E(() => window.__t.choose(0));
	await waitFor(async () => (await alice.E(() => G.Game.state)) === 'playing' && (await bob.E(() => G.Game.state)) === 'playing', 6000);
	const pactA = await alice.E(() => ({ pacts: G.ExpSurv.run.pacts.slice(), row: G.ExpSurv.row() }));
	const pactOnHost = await waitFor(() => bob.E(code => { const p = G.Coop.mate('alice').pl; return p.xsv && p.xsv[0] === code; }, pactA.row && pactA.row[0]), 5000);
	const team = await bob.E(() => ({ team: G.ExpSurv.foeTeam(), own: G.ExpSurv.run.pacts.slice() }));
	const teamWant = await alice.E(ids => { const t = { hp: 0, dmg: 0, rate: 0, boss: 0, elite: 0 }; for (const id of ids) for (const k in G.ExpSurv.PACT_BY[id].team) t[k] += G.ExpSurv.PACT_BY[id].team[k]; return t; }, pactA.pacts.concat(team.own));
	A(boss.mile === 1 && bossSeenG && pactH && pactG && pactCards && pactCards.length === 3 && pactA.pacts.length === 1 && pactOnHost && JSON.stringify(team.team) === JSON.stringify(teamWant),
		'a milestone boss on the host: the guest sees it (`s`), then gets ITS pact choice (3 cards); its pact travels in its row and its team bane counts on the host (foeTeam = both players\' banes)', JSON.stringify({ boss, pactH, heldG, pactCards, pactA, team, teamWant }));
	// night and hazards from the clock (the host jumps to 50:00)
	await bob.E(() => { window.__t.wipe(); G.Game.debugTime(3000); const S = G.ExpSurv.run; S.miles = 10; S.nextMig = 1e9; window.__t.calm(); });
	await sleep(1500);
	const night = await alice.E(async () => { const n0 = G.ExpSurv.nightDrawn, h0 = G.ExpSurv.hazDrawn; await new Promise(r => setTimeout(r, 600)); return { t: Math.round(G.Game.st.time), night: G.ExpSurv.nightDrawn - n0, haz: G.ExpSurv.hazDrawn - h0, hz: G.ExpSurv.hazardsOf(G.World.zone).length, line: G.ExpClassic.hudLine(G.Game.player, G.Game.st) }; });
	A(night.t >= 2990 && night.night > 0 && night.hz === 16 && /NIGHT ×1\.6/.test(night.line) && /PHASE 3/.test(night.line), 'the guest\'s clock follows the host: at 50:00 its screen darkens (Endless Night), its HUD says "PHASE 3 · ... · NIGHT ×1.6", the hazards of its land are the host\'s (16)', JSON.stringify(night));
	// migration: the host's portal opens; the guest sees it
	await bob.E(() => { const S = G.ExpSurv.run; S.nextMig = G.Game.st.time + 0.5; });
	const portalG = await waitFor(() => alice.E(() => /PORTAL \d+ s/.test(G.ExpClassic.hudLine(G.Game.player, G.Game.st))), 6000);
	await shoot(alice, 'coop-guest-survival-desktop.png', 400);
	await shoot(bob, 'coop-host-survival-phone.png', 100);
	const land0 = await alice.E(() => G.World.zone.zone);
	await bob.E(() => { const C = G.ExpClassic, [x, y] = C.siteXY(C.run.sites.altar); window.__t.go(x, y); });
	const migrated = await waitFor(() => alice.E(z0 => G.World.zone.zone !== z0 && G.ExpSurv.view && G.ExpSurv.view.land === 2, land0), 10000);
	A(portalG && migrated, 'migration: the host\'s portal shows on the guest\'s HUD ("PORTAL N s"); the host steps in and the guest moves to the new land with it', JSON.stringify({ portalG, migrated, land0 }));
	// the guest's siege row on the host
	await alice.E(() => { const s = G.ExpSurv.run.siege, pl = G.Game.player; s.ax = pl.x; s.ay = pl.y; s.t = 25; s.on = true; s.k = 0.6; });
	const siegeH = await waitFor(() => bob.E(() => { const p = G.Coop.mate('alice').pl; return p.xsv && p.xsv[1] > 0; }), 5000);
	A(siegeH, 'the guest\'s siege travels in its row: the host knows alice is under siege (and sends the flocks after her puppet)');
	// (both players beside the host's nearest hazard so the spectator's camera has a hazard in view
	//  and the foes below are spawned round both)
	const hzAt = await bob.E(() => {
		const pl = G.Game.player, list = G.ExpSurv.hazardsOf(G.World.zone).slice().sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
		const hz = list[0]; if (!hz) return null;
		window.__t.go(hz.x + hz.r * 0.5, hz.y);
		return [hz.x + hz.r * 0.5, hz.y];
	});
	if (hzAt) await alice.E(p => window.__t.go(p[0] + 40, p[1] + 20), hzAt);
	await sleep(800);
	// a snapshot of the host (for the spectator), with everything on it: the guest's Support Alpha, a pop-up, the night
	await alice.E(() => { const pl = G.Game.player; G.ExpCap.run.sa.push({ dex: 21, type: 'flying', x: pl.x + 30, y: pl.y, anim: new G.Sprites.Animator(21, G.ExpCap.K.SA_SCALE) }); });
	await sleep(1200);
	await bob.E(() => { const pl = G.Game.player; G.ExpRx.react('melt', { x: pl.x + 50, y: pl.y, bodyH: 30, xwet: 1 }, 10, G.Game.st.time); for (const q of [pl, G.Coop.mate('alice').pl]) { const e = G.ExpClassic.spawnFoe(13, q.x + 140, q.y + 20, {}); if (e) { e.spd = 0; e.maxHp = e.hp = 1e7; } } });
	const snaps = await bob.E(async () => {
		const out = [];
		for (let i = 0; i < 3; i++) { out.push(JSON.parse(JSON.stringify(G.Spectate.snap()))); await new Promise(r => setTimeout(r, 400)); }
		return { snaps: out, seed: G.World.seed, sizes: out.map(s => JSON.stringify(s).length), uid: G.Social.uid };
	});
	const sx = snaps.snaps[0].x || {};
	A(sx.xv === 10 && Array.isArray(sx.s) && sx.v && sx.p && sx.p.g && Object.values(sx.p.g).some(l => l.includes(21)) && Math.max(...snaps.sizes) < 24000,
		'the host\'s live snapshot: x v10 with Survival\'s `s` / `v`, the partners\' Support Alphas (p.g, by name), under the 24 KB live cap (' + Math.max(...snaps.sizes) + ' chars)', JSON.stringify({ keys: Object.keys(sx), g: sx.p && sx.p.g, sizes: snaps.sizes }));
	await bob.E(() => G.Game.quit());
	await waitFor(async () => (await alice.E(() => G.Game.state)) === 'over', 15000);
	await alice.ctx.close(); await bob.ctx.close();

	// ======================== 5. a spectator of the host
	const vw = await bootPage({ save: SAVE('viewer') });
	const spec = await vw.E(async (rec) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const out = { loadedBefore: G.Expedition.loaded };
		G.MicaAccount.name = () => 'viewer';
		let hs = null;
		G.Spectate.watch = (u, h) => { hs = h; h.snapshot(rec.snaps[0], {}); };
		G.WatchUI.watchLive('bob');
		for (let i = 0; i < 100 && !(G.WatchUI.player && G.World.zone && G.ExpSurv); i++) await wait(60);
		const s0 = { night: G.ExpSurv ? G.ExpSurv.nightDrawn : 0, haz: G.ExpSurv ? G.ExpSurv.hazDrawn : 0, shots: G.ExpCap ? G.ExpCap.ghostShots : 0, pops: G.ExpRx ? G.ExpRx.popsShown : 0 };
		for (let k = 1; k < rec.snaps.length; k++) { hs.snapshot(rec.snaps[k], {}); await wait(500); }
		await wait(2500);
		out.view = G.ExpSurv.view; out.night = G.ExpSurv.nightDrawn - s0.night; out.haz = G.ExpSurv.hazDrawn - s0.haz; out.shots = G.ExpCap.ghostShots - s0.shots; out.pops = G.ExpRx.popsShown;
		out.line = G.ExpClassic.hudLine(G.WatchUI.player, G.Game.st); out.state = G.Game.state;
		out.pups = (G.WatchUI.drawables ? G.WatchUI.drawables() : []).map(p => ({ xsa: p.xsa || null, xsv: p.xsv || null }));
		out.zone = G.World.zone && G.World.zone.hash;
		return out;
	}, snaps);
	A(spec.loadedBefore === false && spec.state === 'watch' && spec.view && spec.view.miles >= 10 && spec.zone && /SURVIVAL/.test(spec.line || '') && spec.night > 0 && spec.haz > 0,
		'a spectator (the Expedition code loads on demand): the host\'s land, Survival\'s HUD, the night and the hazards', JSON.stringify(spec).slice(0, 600));
	A(spec.shots > 0 && spec.pups.some(p => Array.isArray(p.xsa) && p.xsa.includes(21)) && spec.pops > 0, 'the spectator sees the allies fight: the partner\'s Support Alpha round its puppet, shooting; and the reactions\' pop-ups', JSON.stringify({ shots: spec.shots, pops: spec.pops, pups: spec.pups }));
	await shoot(vw, 'spectator-survival-desktop.png', 300);
	await vw.E(() => { try { G.WatchUI.leave(); } catch (e) { /* */ } });
	await vw.ctx.close();

	// ======================== 6. replay size: a 45-min Survival run and a full Classic clear, fast-forward
	const sim = await bootPage({ save: SAVE('sim') });
	await prep(sim);
	const SIM = () => {
		const H = window.__t, key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
		let f = 0;
		// the golden runs' steering: away from close foes (turned to circle), else short walks
		G.Input.axis = () => {
			const pl = G.Game.player; let vx = 0, vy = 0;
			if (pl) for (const e of G.EnemyMgr.all()) { if (e.dead) continue; const dx = pl.x - e.x, dy = pl.y - e.y, d2 = dx * dx + dy * dy; if (d2 < 200 * 200 && d2 > 0) { vx += dx / d2; vy += dy / d2; } }
			if (vx || vy) { const a = Math.atan2(vy, vx) + 0.9; return [Math.cos(a), Math.sin(a)]; }
			const k = f % 150; if (k >= 60) return [0, 0]; const a = (Math.floor(f / 150) * 3 % 8) * Math.PI / 4; return [Math.cos(a), Math.sin(a)];
		};
		H.sturdy = () => { const pl = G.Game.player; pl.hurt = () => {}; };
		/** the unpacked tape's size by frame field (chars of JSON): where a replay's bytes go */
		H.parts = text => {
			if (!text) return null;
			const d = JSON.parse(text), names = ['dt', 'P', 'C', 'S', 'E', 'K', 'M', 'XA', 'XW', 'XO', 'XF', 'XC'], o = { total: text.length, h: JSON.stringify(d.h).length, ev: JSON.stringify(d.ev || []).length };
			for (const f of d.f) { const a = typeof f === 'string' ? JSON.parse(f) : f; a.forEach((v, i) => { const k = names[i] || 'f' + i; o[k] = (o[k] || 0) + JSON.stringify(v).length + 1; }); }
			return o;
		};
		/** one step; level-ups / choices answered like a player; a strong player's KOs (3 a second round you) */
		H.tick = (dt) => {
			f++;
			const st = G.Game.state;
			if (st === 'levelup') { key('keydown', 'Digit1'); key('keyup', 'Digit1'); }
			if (G.ExpEco.pick) { G.ExpEco.pick.at = 0; if (G.ExpEco.pick.kind === 'friend' || G.ExpEco.pick.kind === 'shop' || G.ExpEco.pick.kind === 'hypno') G.ExpEco.closePick(); else G.ExpEco.choose(0); }
			if (st === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
			G.Game.debugStep(1, dt);
			if (f % Math.round(1 / dt / 3) === 0) {
				const pl = G.Game.player; if (!pl) return;
				const near = G.EnemyMgr.all().filter(e => !e.dead && !e.boss && Math.hypot(e.x - pl.x, e.y - pl.y) < 320);
				if (near.length) { const e = near[f % near.length]; e.hurt(e.maxHp * 20, '#fff'); }
			}
		};
	};
	await sim.E(SIM);
	const survRep = await sim.E(async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		window.requestAnimationFrame = () => 0;
		const ok = await G.Flow.play('exp-survival');
		H.sturdy();
		const dt = 1 / 20, T = 45 * 60 + 50, t0 = performance.now(), C = G.ExpClassic, S = G.ExpSurv;
		let migr = 0, bossKills = 0, maxE = 0;
		while (G.Game.st.time < T && G.Game.state !== 'over') {
			H.tick(dt);
			maxE = Math.max(maxE, G.EnemyMgr.count);
			// milestone bosses: down 40 s after they come (as a decent player); the migration portal: taken
			for (const b of S.run.bosses) if (G.Game.st.time - b.at > 40 && !b.e.dead) { b.e.hurt(b.e.hp * 10, '#fff'); bossKills++; }
			if (C.run.ph === 2) { const [x, y] = C.siteXY(C.run.sites.altar), pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl._px = null; migr++; }
		}
		const t = G.Game.st.time, out = { ok, t: Math.round(t), miles: S.run.miles, downs: S.run.downs, mewtwo: S.run.mewtwo, lands: S.run.land, kills: G.Game.player.kills, maxE, ms: Math.round(performance.now() - t0) };
		G.Game.quit(); await wait(400);
		const e = G.Replay.last; if (e && e.ready) await e.ready;
		out.code = e && e.code ? e.code.length : 0; out.frames = e && e.meta ? e.meta.frames : null; out.bytes = G.Replay.stats.frames;
		const rd = e && e.code ? await G.Replay.open(e.code) : null;
		out.readable = !!rd; out.last = rd ? (rd.at(rd.length - 1) || {}).x ? 'x' : '-' : null;
		const txt = e && e.code ? await G.Replay.unpack(e.code) : null;
		out.parts = window.__t.parts(txt);
		window.__survTxt = txt;
		// (D11: the tape's frame intervals (tenths of a second): Survival's 1 s; the size steps of any Expedition tape)
		if (txt) { const d = JSON.parse(txt), dts = d.f.slice(1).map(f => f[0] || 0).sort((a, b) => a - b); out.hdt = d.h.dt; out.dtMed = dts[dts.length >> 1]; out.dtMin = dts[0]; }
		out.thin = [0, 2999999, 3000000, 3300000, 3550000].map(b => G.Replay.thinDt({ dt: 1, bytes: b })).concat([G.Replay.thinDt({ dt: 0.5, bytes: 3400000 })]);
		out.stop = G.Replay.K.THIN_STOP;
		return out;
	});
	console.log('     survival tape by field: ' + JSON.stringify(survRep.parts));
	console.log(`     replay: a 45-min Survival run (${survRep.kills} KOs, ${survRep.downs} milestone bosses, Mewtwo ${survRep.mewtwo}, ${survRep.lands} lands, up to ${survRep.maxE} foes) packs to ${survRep.code} chars, ${survRep.frames} frames (sim ${survRep.ms} ms)`);
	A(survRep.ok && survRep.t >= 2700 && survRep.mewtwo >= 1 && survRep.lands >= 4 && survRep.code > 0 && survRep.code < 1200000 && survRep.frames <= 30000 && survRep.readable,
		'replay size: a 45-minute Survival run (to Mewtwo, through 3 migrations) packs under 1.2 MB (MSURV_REPLAY_MAX) and plays back', JSON.stringify(survRep));
	const clRep = await sim.E(async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms)), C = G.ExpClassic;
		if (G.Game.state === 'over') { G.Flow.afterRun(); await wait(300); }
		const ok = await G.Flow.play('exp-classic');
		H.sturdy();
		const dt = 1 / 20, t0 = performance.now(), toAltar = () => { const [x, y] = C.siteXY(C.sitesOf(G.World.zone).altar), pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl._px = null; };
		let zoneSecs = 0, maxE = 0, guard = 0;
		while (G.Game.state !== 'over' && G.Game.st.time < 3600 && guard++ < 200000) {
			H.tick(dt);
			maxE = Math.max(maxE, G.EnemyMgr.count);
			const R = C.run; if (!R) break;
			const zt = G.Game.st.time - R.zs;
			// each zone: play ~6:30, then wake the guardian (stand at the altar), beat it in ~45 s, take the portal
			if (zt > 390 && R.ph === 0) toAltar();
			if (R.boss && !R.boss.dead && G.Game.st.time - (R.boss.xborn || 0) > 45) R.boss.hurt(R.boss.maxHp * 10, '#fff');
			if (R.ph === 2) toAltar();
			if (R.zone === 4 && R.ph === 0) toAltar();
		}
		const R = C.run, out = { ok, t: Math.round(G.Game.st.time), zone: R ? R.zone : null, won: R ? R.won : null, kills: G.Game.player ? G.Game.player.kills : null, maxE, ms: Math.round(performance.now() - t0), state: G.Game.state };
		if (G.Game.state !== 'over') { G.Game.quit(); await wait(400); }
		await wait(300);
		const e = G.Replay.last; if (e && e.ready) await e.ready;
		out.code = e && e.code ? e.code.length : 0; out.frames = e && e.meta ? e.meta.frames : null;
		const txt = e && e.code ? await G.Replay.unpack(e.code) : null;
		out.parts = window.__t.parts(txt);
		if (txt) { const d = JSON.parse(txt), dts = d.f.slice(1).map(f => f[0] || 0).sort((a, b) => a - b); out.hdt = d.h.dt; out.dtMed = dts[dts.length >> 1]; }
		return out;
	});
	console.log(`     replay: a full Classic clear (${clRep.t} s, zone ${clRep.zone}, won ${clRep.won}, ${clRep.kills} KOs, up to ${clRep.maxE} foes) packs to ${clRep.code} chars, ${clRep.frames} frames (sim ${clRep.ms} ms)`);
	console.log('     classic tape by field: ' + JSON.stringify(clRep.parts));
	A(clRep.ok && clRep.won && clRep.code > 0 && clRep.code < 1200000 && clRep.frames <= 30000, 'replay size: a full Classic clear (3 zones and the shrine) packs under 1.2 MB', JSON.stringify(clRep));
	// (DLC D16: every move fires, so a 45-min Survival run KOs about twice as many foes and its tape thins sooner: its frames are
	//  1 s apart or, past the thinning sizes, 2 s; never closer)
	A(survRep.hdt === 1 && survRep.dtMed >= 10 && survRep.dtMed <= 20 && clRep.hdt === 0.5 && clRep.dtMed === 5,
		"the Survival tape's frames are 1 s apart (header dt 1; 2 s once it thins); a Classic tape keeps 0.5 s", JSON.stringify({ s: [survRep.hdt, survRep.dtMed, survRep.dtMin], c: [clRep.hdt, clRep.dtMed] }));
	A(JSON.stringify(survRep.thin) === '[1,1,1.5,2,3,1]' && survRep.stop === 4500000,
		"an endless run's tape spaces its frames out as it grows (x1.5 at 3.0 M raw chars, x2 at 3.3 M, x3 at 3.55 M) and stops adding frames at 4.5 M", JSON.stringify([survRep.thin, survRep.stop]));
	// the cap's last resort: a tape that still packs over it merges every two frames (halve), exactly
	const hv = await sim.E(async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms)), R = G.Replay, out = {};
		// (a) the 45-min Survival tape halved: each merged frame decodes to the original's state at that point, the whole run kept
		const d = JSON.parse(window.__survTxt), f1 = d.f.map(f => JSON.stringify(f)), f2 = R.halve(f1);
		const a = R.reader({ v: 1, h: d.h, f: d.f, ev: d.ev }), b = R.reader({ v: 1, h: d.h, f: f2.map(x => JSON.parse(x)), ev: d.ev });
		const key = s => JSON.stringify([s.t, s.p, s.lv, s.k, s.e.map(e => e.slice(0, 7)).sort((x, y) => x[0] - y[0]), s.pk.slice().sort((x, y) => x[0] - y[0]), s.x]);
		let bad = 0; for (let j = 0; j < b.length; j++) if (key(a.at(Math.min(a.length - 1, 2 * j + 1))) !== key(b.at(j))) bad++;
		out.half = { n1: f1.length, n2: f2.length, bad, dur: [a.duration, b.duration], packed: [(await R.pack(window.__survTxt)).length, (await R.pack(JSON.stringify({ v: 1, h: d.h, f: f2.map(x => JSON.parse(x)), ev: d.ev }))).length] };
		// (b) finish() over the cap (forced to 1 char): an Expedition tape is halved HALVE_MAX times and still plays to its end
		const cap = R.K.PACKED_MAX;
		const runFor = async (mode, secs) => {
			if (G.Game.state === 'over') { G.Flow.afterRun(); await wait(300); }
			const ok = await G.Flow.play(mode); H.sturdy();
			while (G.Game.st.time < secs && G.Game.state !== 'over') H.tick(1 / 20);
			R.K.PACKED_MAX = 1;
			const t = G.Game.st.time; G.Game.quit(); await wait(400);
			const e = R.last; if (e && e.ready) await e.ready;
			R.K.PACKED_MAX = cap;
			const txt = await R.unpack(e.code), dd = JSON.parse(txt), rd = await R.open(e.code);
			return { ok, mode: dd.h.m, halved: dd.h.halved || 0, frames: dd.f.length, metaFrames: e.meta.frames, t: Math.round(t), dur: rd ? Math.round(rd.duration) : null };
		};
		out.exp = await runFor('exp-classic', 120);
		out.base = await runFor('normal', 60);
		return out;
	});
	A(hv.half.bad === 0 && hv.half.n2 === Math.ceil(hv.half.n1 / 2) && hv.half.dur[0] === hv.half.dur[1] && hv.half.packed[1] < hv.half.packed[0] * 0.75,
		'halve(): the Survival tape with every two frames merged decodes to exactly the original state at each merged frame, keeps the whole run, and packs ' + hv.half.packed[0] + ' -> ' + hv.half.packed[1], JSON.stringify(hv.half));
	A(hv.exp.ok && hv.exp.halved === 3 && hv.exp.frames === hv.exp.metaFrames && hv.exp.frames <= 40 && Math.abs(hv.exp.dur - hv.exp.t) <= 2,
		'finish() over the cap: an Expedition tape is halved (up to 3 times) and still plays to its end', JSON.stringify(hv.exp));
	A(hv.base.mode === 'normal' && hv.base.halved === 0 && hv.base.frames >= 110, "a base run's tape is never halved or thinned (0.5 s frames, as before)", JSON.stringify(hv.base));
	await sim.ctx.close();
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
