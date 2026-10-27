// micasurvivor_expedition_capture_test.mjs — MicaSurvivor DLC D8: alphas, capture and shinies (the faint window, the Friend
// Ball, Support Alphas with type perks, League encounters, shiny encounters, the capture cinematic) and elemental reactions +
// weather boosts. micasurvivor/js/expedition/capture.js, reactions.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.1, 2.3, 2.8
// and the D8 row. A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   0. the server keeps the D8 sets / counters (league.own, league.wild, shiny.caught, cap.*) merged, with no server change
//   1. an alpha appears (x1.6, marked), can't be KO'd outright: at 1 HP it faints for 8 s; left alone it drops its prize
//   2. the Friend Ball: stand by a fainted alpha -> the capture cinematic -> a Support Alpha in slot 1 with its type perk
//      (D5's sums), following you and shooting (the "Partner / team" row); slot 2; a full team asks whom to swap (or keep it)
//   3. a League encounter end to end: a challenge completed now is met + wild (not playable; a D4-met member still is); the
//      next run's "A wild X appeared!" at its seeded time, HP by rank, weaken -> faint -> catch -> league.own saved at once
//      (playable, in the browser's save, the run-over line); an encounter left alone flees and stays pending
//   4. shinies: 8 % a zone + luck / 1,000 (x1.5 with the Shiny Charm) over 20,000 seeded zones; a shiny encounter (its shiny
//      sheet, it roams, never hurts you, flees at 120 s); caught: shiny.caught (+ league.shiny for a League family)
//   5. the capture cinematic: its phases and pips, the world held (clock and foes), i-frames after, the banner in English
//   6. each elemental reaction (Electrocuted, Steam, Inferno, Wreckage, Poison Gas, Psychic Meltdown, Dragon Rage), wet and
//      chill -> freeze, the 0.25 s cool-down, through the real G.Combat.land
//   7. weather boosts: Sun + Grass, Fog + Dark (the study's), the base weather unchanged, your own type's +10 % and its banner
//   8. determinism: the zone plans and the pending order are pure (no Math.random), the same twice, another seed another plan
//   9. sync: the `x` block v8 `p` on snapshots and host frames; a fresh spectator page draws the Support Alphas, the fainted
//      Pokémon, the shiny's sheet and the cinematic; the replay keeps `p` and an `xc` event per capture; a v7 block loads;
//      a base Normal run untouched
//  10. the phone (844 x 390, touch) and desktop: the chips, the swap choice, the banner fit and overlap nothing; screenshots
//   node overworld/tests/micasurvivor_expedition_capture_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D8" count was taken. SHOTS=<dir> saves the screenshots.)
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
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8862;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ======================== 0. the server keeps the D8 sets and counters (two devices: the union / the max)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-cap-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ip = 0;
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.4.' + (1 + ip++), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await call('register', { username: 'capturetester', password: 'msurv-capture-pass-1' })).body.token;
	const devA = { v: 1, counters: { 'cap.alpha': 3, 'cap.league': 1, 'rx.electro': 9 }, sets: { 'league.met': ['115'], 'league.wild': ['115'], 'league.own': ['115'], 'shiny.caught': ['16'] } };
	const devB = { v: 1, counters: { 'cap.alpha': 1, 'cap.shiny': 2, 'sa.best': 2 }, sets: { 'league.met': ['115', '10'], 'league.wild': ['115', '10'], 'shiny.caught': ['19'], 'league.shiny': ['16'] } };
	await call('micasurvivor-exp-save-put', { save: devA, rev: 0 }, tok);
	const p2 = await call('micasurvivor-exp-save-put', { save: devB, rev: 0 }, tok);
	if (p2.status === 409) await call('micasurvivor-exp-save-put', { save: devB, rev: p2.body.rev }, tok);
	const s = (await call('micasurvivor-exp-save-get', {}, tok)).body.save || {}, c = s.counters || {}, st = s.sets || {};
	const srt = a => (a || []).slice().sort().join(',');
	A(p2.status === 409 && c['cap.alpha'] === 3 && c['cap.shiny'] === 2 && c['sa.best'] === 2 && c['rx.electro'] === 9 && srt(st['league.own']) === '115' && srt(st['league.wild']) === '10,115' && srt(st['shiny.caught']) === '16,19' && srt(st['league.shiny']) === '16',
		'the server takes the D8 sets and counters with no server change; two devices merge (a catch on one device is never lost: league.own unions)', JSON.stringify(s));
}

// ======================== the browser
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 1, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, net: [] };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	try {
		localStorage.setItem('micasurvivor_dev', 'dcap8');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	/** a sturdy test player: hurts are counted, not taken; XP pickups give nothing */
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	/** no trickle for a while (Classic's spawn accumulator far below zero) */
	H.quiet = () => { if (G.ExpClassic.run) G.ExpClassic.run.acc = -1e6; };
	/** every live enemy gone, without counting as kills */
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); if (G.ExpCap && G.ExpCap.run) G.ExpCap.run.tg.clear(); };
	/** the player onto world (x, y) (a teleport: its layer re-learnt, as the portal does) */
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null; pl.vx = 0; pl.vy = 0; G.Camera.x = x; G.Camera.y = y; };
	/** a foe of the zone at (x, y) (Classic's own spawner: its stats, its modifiers); o: its options (kind 'alpha'...) */
	H.foe = (dex, x, y, o) => G.ExpClassic.spawnFoe(dex, x, y, o || {});
	/** an alpha next to the player (the timeline's own numbers), marked by D8 */
	H.alpha = (dex, dx = 160) => { const pl = G.Game.player, K = G.ExpClassic.K.ALPHA; return H.foe(dex, pl.x + dx, pl.y, { ti: 1, hp: K.hp, dmg: K.dmg, xp: K.xp, scale: K.scale, spd: 0.9, kind: 'alpha' }); };
	/** a big hit: a capture target stops at 1 HP */
	H.weaken = e => { e.hurt(e.maxHp * 10); return e.hp; };
	/** stand by fainted Pokémon f until the throw (and, with run, until the cinematic is over) */
	H.throwAt = (f, run) => { H.go(f.x + 6, f.y + 4); H.step(14); if (run) H.step(Math.ceil((G.ExpCap.CINE_T + 0.2) * 30)); };
	H.faints = () => G.ExpCap.run.faint.map(f => ({ kind: f.kind, dex: f.dex, x: f.x, y: f.y, win: +(f.end - f.t0).toFixed(2), eid: f.eid }));
	H.banner = () => { const b = G.Spawner.banner(); return b ? String(b.text) : ''; };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(view, ctx0) {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		return { ctx, page, menu, visible };
	}
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	const shoot = async (page, name, ms = 450) => {
		if (!SHOTS) return null;
		await page.evaluate(() => window.__t.thaw());
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await page.screenshot({ path: f });
		await page.evaluate(() => window.__t.freeze());
		console.log('     screenshot: ' + f);
		return f;
	};
	/** start Classic (the League pick), freeze the frames, a sturdy player, no foes */
	const startClassic = page => E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		const ok0 = await G.Expedition.load().catch(e => String(e));
		if (ok0 !== true) return { ok: false, err: ok0, dv: G.Expedition.DV };
		await G.ExpSave.open();
		if (G.Game.state === 'playing' || G.Game.state === 'levelup' || G.Game.state === 'choice') { G.Game.quit(); await wait(300); }
		if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await wait(300); }
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		window.__t.sturdy();
		window.__t.wipe();
		const Cp = G.ExpCap;
		return { ok, state: G.Game.state, mode: G.Game.mode, dv: G.Modes.run.dv, on: !!(Cp && Cp.run), rx: !!(G.ExpRx && G.ExpRx.run), xv: G.Exp && G.Exp.XV, seed: G.World.seed, dex: G.Game.player.dex };
	});
	/** end the run (quit), the run-over screen's text */
	const endRun = page => E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw(); G.Game.quit(); await wait(350); window.__t.freeze();
		return { state: G.Game.state, text: (document.getElementById('scr-over') || {}).innerText || '' };
	});

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const r0 = await startClassic(page);
	A(r0.ok && r0.mode === 'exp-classic' && r0.dv === 19 && r0.xv === 10 && r0.on && r0.rx, 'Classic starts with captures and reactions on; the content version is 19 (D20), the x block v8', JSON.stringify(r0));
	if (!r0.ok || !r0.on) throw new Error('no capture system: the rest needs it');

	// ======================== 1. an alpha appears; the faint window; its prize when left alone
	const s1 = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		G.ExpClassic.debugZoneTime(149.9); H.step(3);
		const al = G.EnemyMgr.all().find(e => e.xk === 'alpha' && !e.dead);
		out.banner = H.banner();
		out.spawn = al && { dex: al.dex, scale: al.scale, floor: al.hpFloor, kind: al.xcap, tracked: Cp.run.tg.has(al.id), hp: al.maxHp };
		if (!al) return out;
		const kills0 = pl.kills, items0 = G.Pickups.all().filter(p => p.kind === 'item').length;
		out.hp1 = H.weaken(al);
		out.alive = !al.dead;
		H.step(1);
		out.faint = H.faints();
		out.fbanner = H.banner();
		H.step(2);
		out.gone = !G.EnemyMgr.get(al.id); out.kos = pl.kills - kills0;
		out.itemsAtFaint = G.Pickups.all().filter(p => p.kind === 'item').length - items0;
		// left alone (you stay away): after 8 s the window closes and it drops its prize
		const f = Cp.run.faint[0];
		H.go(f.x + 420, f.y); H.step(Math.ceil(7.2 * 30));
		out.at7 = Cp.run.faint.length;
		H.step(30);
		const pk = G.Pickups.all().filter(p => Math.hypot(p.x - f.x, p.y - f.y) < 60);
		out.after = { faint: Cp.run.faint.length, item: pk.filter(p => p.kind === 'item').length, heal: pk.filter(p => p.kind === 'heal').length, prizes: Cp.run.log.prizes, banner: H.banner(), sa: Cp.run.sa.length };
		return out;
	});
	A(s1.spawn && s1.spawn.scale === 1.6 && s1.spawn.floor === 1 && s1.spawn.kind === 'alpha' && s1.spawn.tracked && /An alpha .+ appears!/.test(s1.banner),
		'an alpha appears on the timeline (1:50... 2:30 of zone 1): x1.6, marked as a capture target (it can only faint)', JSON.stringify(s1).slice(0, 500));
	A(s1.hp1 === 1 && s1.alive && s1.faint && s1.faint.length === 1 && s1.faint[0].kind === 'alpha' && s1.faint[0].win === 8 && /faints! Stand by it to throw a Friend Ball/.test(s1.fbanner),
		'a hit that would KO it leaves it at 1 HP; it faints: an 8 s window ("Stand by it to throw a Friend Ball")', JSON.stringify(s1).slice(0, 500));
	A(s1.gone && s1.kos === 1 && s1.itemsAtFaint === 0, 'the fainted alpha counts as a KO and leaves the field, with no prize yet', JSON.stringify({ gone: s1.gone, kos: s1.kos, items: s1.itemsAtFaint }));
	A(s1.at7 === 1 && s1.after && s1.after.faint === 0 && s1.after.item === 1 && s1.after.heal === 1 && s1.after.prizes === 1 && s1.after.sa === 0 && /recovers and leaves its prize/.test(s1.after.banner),
		'left alone, the window closes after 8 s: its prize drops (an item and a berry, D3\'s), no Support Alpha', JSON.stringify(s1.after));

	// ======================== 2 + 5. the Friend Ball and the capture cinematic -> a Support Alpha with its type perk
	const s2 = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, I = G.ExpItems, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		const al = H.alpha(16);   // (Pidgey: Normal / Flying -> the Normal perk, +8 % XP)
		H.weaken(al); H.step(2);
		const f = Cp.run.faint[0];
		out.f = f && { kind: f.kind, dex: f.dex };
		const [st, v] = Cp.perkOf('normal'), before = I.total(pl, st), xpMul0 = pl.xpMul;
		// a decoy foe, to see the world hold
		const foe = H.foe(19, f.x + 200, f.y); foe.xmove = function () { this.x += 3; return true; };
		H.go(f.x + 6, f.y + 4); H.step(14);
		const c = Cp.run.cine, t0 = G.Game.st.time, fx0 = foe.x;
		out.cine = c && { kind: c.kind, dex: c.dex, seq: c.seq };
		// the phases, every 0.1 s
		const seen = [];
		let held = { clock: 0, foe: 0, n: 0 };
		for (let i = 0; i < 40 && Cp.run.cine; i++) {
			const ph = Cp.phase(Cp.run.cine.t); const tag = ph.n + (ph.n === 'shake' ? ph.k : ''); if (seen[seen.length - 1] !== tag) seen.push(tag);
			for (let j = 0; j < 3; j++) { H.step(1); if (Cp.run.cine) held = { clock: Math.max(held.clock, +(G.Game.st.time - t0).toFixed(3)), foe: Math.max(held.foe, Math.round(foe.x - fx0)), n: held.n + 1 }; }
		}
		out.phases = seen;
		out.held = held;
		out.cineOver = !Cp.run.cine; out.invuln = pl.invuln;
		out.sa = Cp.run.sa.map(s => ({ dex: s.dex, type: s.type }));
		out.perk = { st, v, before, after: I.total(pl, st), xpMul: +(pl.xpMul / xpMul0).toFixed(4), text: Cp.perkText('normal') };
		out.n = Cp.run.n; out.banner = H.banner();
		// it shoots the nearest foe (its type, your attack, the "Partner / team" row), and follows you
		H.step(1);
		H.quiet(); H.wipe(); H.step(1);
		const foe2 = H.foe(19, pl.x + 150, pl.y, { hp: 20 }), hp0 = foe2.hp, ally0 = (G.DmgLog.raw.dmg || {}).ally || 0;
		foe2.xmove = function () { return true; };
		const spawn0 = G.Projectiles.spawn, types = [];
		G.Projectiles.spawn = o => { if (o && o.mid === 'xsa') types.push(o.mtype); return spawn0(o); };
		try { H.step(75); } finally { G.Projectiles.spawn = spawn0; }
		const s = Cp.run.sa[0];
		out.shots = s.shots; out.foeHurt = hp0 - (foe2.dead ? 0 : foe2.hp); out.ally = ((G.DmgLog.raw.dmg || {}).ally || 0) - ally0; out.types = types;
		foe2.remote = true; G.EnemyMgr.removeRemote(foe2.id, false);
		H.go(pl.x - 300, pl.y); H.step(60);
		out.follow = Math.round(Math.hypot(s.x - pl.x, s.y - pl.y));
		return out;
	});
	A(s2.f && s2.f.kind === 'alpha' && s2.cine && s2.cine.kind === 'alpha' && s2.cine.dex === 16, 'standing by the fainted alpha throws the Friend Ball: the capture cinematic starts', JSON.stringify(s2).slice(0, 400));
	A(JSON.stringify(s2.phases) === '["throw","absorb","drop","shake0","shake1","shake2","click"]', 'the cinematic: the throw, the Pokémon drawn in, the drop, 3 shakes, the click', JSON.stringify(s2.phases));
	A(s2.held && s2.held.n >= 80 && s2.held.clock === 0 && s2.held.foe === 0 && s2.cineOver && s2.invuln >= 0.9, 'the world holds through it (the run clock and the foes stand still), then 1 s of i-frames', JSON.stringify({ held: s2.held, inv: s2.invuln }));
	A(s2.sa && s2.sa.length === 1 && s2.sa[0].dex === 16 && s2.sa[0].type === 'normal' && s2.perk.st === 'xp' && near(s2.perk.after - s2.perk.before, 0.08) && near(s2.perk.xpMul, 1.08, 1e-3) && s2.perk.text === '+8% XP' && s2.n === 1 && /Gotcha! Pidgey joins your team/.test(s2.banner),
		'Pidgey joins as a Support Alpha in slot 1 with the Normal perk (+8% XP: D5\'s xp stat +0.08, the player\'s XP x1.08)', JSON.stringify({ sa: s2.sa, perk: s2.perk, banner: s2.banner }));
	A(s2.follow < 140 && s2.shots >= 2 && s2.foeHurt > 0 && s2.ally > 0 && s2.types && s2.types.length === s2.shots && s2.types.every(t => t === 'normal'), 'the Support Alpha shoots the nearest foe with its type (the "Partner / team" damage row) and follows you', JSON.stringify({ follow: s2.follow, shots: s2.shots, hurt: s2.foeHurt, ally: s2.ally, types: s2.types }));

	const s2b = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, I = G.ExpItems, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		// slot 2: Geodude (Rock: +15 max HP)
		const hp0 = pl.maxHp;
		const a2 = H.alpha(74); H.weaken(a2); H.step(2); H.throwAt(Cp.run.faint[0], true);
		out.slot2 = Cp.run.sa.map(s => s.dex); out.hp = pl.maxHp - hp0; out.slots = Cp.slotsMax();
		// a third: the team is full, the Friend Ball asks whom to swap
		const a3 = H.alpha(37); H.weaken(a3); H.step(2); H.go(Cp.run.faint[0].x + 6, Cp.run.faint[0].y + 4); H.step(14);
		const P = G.ExpEco.pick;
		out.ask = P && { kind: P.kind, cards: [...document.querySelectorAll('#xeco-cards .card .nm')].map(e => e.innerText), cancel: document.getElementById('xeco-close').innerText, title: document.getElementById('xeco-h').innerText };
		if (P) P.at = -1e9;
		G.ExpEco.choose(1);   // swap Geodude for Vulpix (Fire: +15 % status chance)
		H.step(Math.ceil((Cp.CINE_T + 0.3) * 30));
		out.swapped = Cp.run.sa.map(s => s.dex); out.hpAfter = pl.maxHp - hp0; out.status = I.total(pl, 'status'); out.swaps = Cp.run.log.swaps;
		// a fourth: keep my team -> the prize
		const a4 = H.alpha(19); H.weaken(a4); H.step(2); const f4 = Cp.run.faint[0]; H.go(f4.x + 6, f4.y + 4); H.step(14);
		out.ask2 = !!G.ExpEco.pick;
		document.getElementById('xeco-close').click();
		H.step(2);
		const pk = G.Pickups.all().filter(p => Math.hypot(p.x - f4.x, p.y - f4.y) < 60);
		out.kept = { team: Cp.run.sa.map(s => s.dex), item: pk.filter(p => p.kind === 'item').length, faint: Cp.run.faint.length, pick: !!G.ExpEco.pick, state: G.Game.state };
		return out;
	});
	A(JSON.stringify(s2b.slot2) === '[16,74]' && s2b.hp === 15 && s2b.slots === 2, 'a second alpha fills slot 2 (Geodude: the Rock perk, +15 max HP); 2 slots (3 with the Lab, D10)', JSON.stringify(s2b));
	A(s2b.ask && s2b.ask.kind === 'friend' && s2b.ask.title === 'Your team is full' && s2b.ask.cards.length === 2 && /Swap Pidgey for Vulpix/.test(s2b.ask.cards[0]) && /Swap Geodude for Vulpix/.test(s2b.ask.cards[1]) && s2b.ask.cancel === 'Keep my team',
		'a third with the team full: "Your team is full", a card per slot to swap, "Keep my team" (D7\'s choice screen)', JSON.stringify(s2b.ask));
	A(JSON.stringify(s2b.swapped) === '[16,37]' && s2b.hpAfter === 0 && near(s2b.status, 0.15) && s2b.swaps === 1, 'swapping Geodude for Vulpix: its perk goes (max HP back), the Fire perk comes (+15% status chance)', JSON.stringify(s2b));
	A(s2b.ask2 && s2b.kept && JSON.stringify(s2b.kept.team) === '[16,37]' && s2b.kept.item === 1 && s2b.kept.faint === 0 && !s2b.kept.pick && s2b.kept.state === 'playing', '"Keep my team": the team stays, the alpha drops its prize', JSON.stringify(s2b.kept));
	// the cinematic's banner (drawn on a canvas of our own, as the game draws it over the HUD)
	const ov = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		// (the team is full here: a cinematic of its own, drawn at three moments and dropped unfinished)
		const pl = G.Game.player;
		Cp.startCine({ kind: 'alpha', eid: -1, dex: 21, member: 0, x: pl.x + 40, y: pl.y, scale: 1.6, shiny: false, anim: new G.Sprites.Animator(21, 1.6) }, pl, null);
		const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
		const at = t => { Cp.run.cine.t = t; const n0 = Cp.overDrawn; Cp.drawOver(g, 1280, 720); return { drawn: Cp.overDrawn - n0, text: Cp.overText }; };
		out.throw = at(0.3); out.shake = at(1.6); out.click = at(2.7);
		Cp.run.cine = null;
		return out;
	});
	A(ov.throw && ov.throw.drawn === 1 && /^Friend Ball · Spearow/.test(ov.throw.text) && ov.click.text === 'Gotcha! Spearow joins your team', 'the banner over the HUD: "Friend Ball · Spearow", then "Gotcha! Spearow joins your team" (English)', JSON.stringify(ov));
	const ovr = await endRun(page);
	A(ovr.state === 'over' && /Support Alphas: Pidgey, Vulpix/.test(ovr.text), 'the run-over screen names the Support Alphas', ovr.text.slice(0, 600));
	const sv2 = await E(page, () => ({ alpha: G.ExpSave.get('cap.alpha'), best: G.ExpSave.get('sa.best'), types: G.ExpSave.list('sa.types').sort() }));
	A(sv2.alpha === 3 && sv2.best === 2 && JSON.stringify(sv2.types) === '["fire","normal"]', 'the Expedition save counts the recruits (cap.alpha 3: Pidgey, Geodude, Vulpix; sa.best 2) and the types recruited (sa.types)', JSON.stringify(sv2));

	// ======================== 3. a League encounter, end to end
	const s3a = await E(page, () => {
		const S = G.ExpSave, L = G.ExpLeague, out = {};
		// a D4-era member: met before D8 (in league.met, never in league.wild): it keeps playing
		// (Dratini: no challenge of this profile is done; the D4 way, in league.met only)
		S.add('league.met', 147);
		out.d4 = { met: L.met(147), wild: L.wild(147), play: L.playable(147) };
		// the challenge: Kangaskhan's "evolve 2 times"
		S.bump('lg.evo', 2);
		const newly = L.checkChallenges();
		S.commit();
		out.newly = newly; out.k = { met: L.met(115), wild: L.wild(115), play: L.playable(115), set: L.setPick(115) };
		return out;
	});
	A(s3a.d4 && s3a.d4.met && !s3a.d4.wild && s3a.d4.play, 'a member met in D4 (league.met, never wild) stays playable: nothing is taken from a save', JSON.stringify(s3a.d4));
	A(s3a.newly && s3a.newly.includes(115) && s3a.k.met && s3a.k.wild && !s3a.k.play && !s3a.k.set, 'a challenge completed now (Kangaskhan: evolve twice) is met AND wild: not playable until caught', JSON.stringify(s3a));
	const r3 = await startClassic(page);
	const s3 = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, S = G.ExpSave, L = G.ExpLeague, pl = G.Game.player, out = {};
		const R = Cp.run;
		out.pend = R.pend.slice(); out.wildAll = out.pend.every(d => L.wild(d));
		H.step(1);
		const P = R.zplan, member = P.league && P.league.member;
		out.plan = P.league;
		if (!member) return out;
		H.go(0, 0);
		G.ExpClassic.debugZoneTime(P.league.at - 0.5); H.step(1);
		out.early = [...R.tg.values()].filter(g => g.kind === 'league').length;
		H.step(25);
		const g = [...R.tg.values()].find(x => x.kind === 'league'), e = g && g.e;
		out.banner = H.banner();
		if (!e) return out;
		// its HP: an alpha's x9 x its rank (Kangaskhan: uncommon x1.2), against the same Pokémon spawned plain
		const plain = H.foe(e.dex, e.x + 400, e.y, { ti: 1 }), rank = L.BY[member].rank;
		out.enc = { dex: e.dex, member, xk: e.xk, scale: e.scale, ratio: +(e.maxHp / plain.maxHp).toFixed(2), rank, k: Cp.K.LG_HP * Cp.K.LG_RANK[rank], flee: g.flee };
		plain.remote = true; G.EnemyMgr.removeRemote(plain.id, false);
		// weaken it: it faints (12 s); stand by it: a Poké Ball, the cinematic, it joins the League (saved at once)
		H.weaken(e); H.step(2);
		out.faint = H.faints();
		H.throwAt(R.faint[0], false);
		out.cine = R.cine && { kind: R.cine.kind, member: R.cine.member, ball: 'poke' };
		H.step(Math.ceil((Cp.CINE_T + 0.2) * 30));
		const local = JSON.parse(localStorage.getItem('micasurvivorexp_save.guest') || 'null');
		out.after = { own: S.has('league.own', member), play: L.playable(member), wild: L.wild(member), local: !!(local && local.sets && (local.sets['league.own'] || []).includes(String(member))), banner: H.banner(), n: R.n, cap: S.get('cap.league') };
		// a second encounter left alone flees at 150 s and stays pending (for the next run)
		const other = S.list('league.wild').map(Number).find(d => d !== member && L.BY[d] && !L.own(d));
		out.other = other || null;
		if (other) {
			const e2 = Cp.spawnLeague(other, pl);
			const g2 = R.tg.get(e2.id);
			g2.t0 -= g2.flee - 0.5; H.step(30);
			out.fled = { gone: !G.EnemyMgr.get(e2.id), banner: H.banner(), own: L.own(other), wild: L.wild(other), log: R.log.fled };
		}
		return out;
	});
	A(r3.ok && s3.pend && s3.pend.length >= 1 && s3.pend.length <= 5 && s3.wildAll && s3.plan && s3.plan.member === s3.pend[0] && s3.plan.at >= 50 && s3.plan.at <= 120, 'the next run: up to 5 wild members wait (D19: one a zone + a second in zones 1-2), zone 1\'s encounter at its seeded 50-120 s', JSON.stringify({ pend: s3.pend, plan: s3.plan }));
	A(s3.early === 0 && s3.enc && s3.enc.xk === 'league' && s3.enc.scale === 1.3 && /A wild .+ appeared!/.test(s3.banner) && near(s3.enc.ratio, s3.enc.k, s3.enc.k * 0.02) && s3.enc.flee === (s3.enc.rank === 'legendary' ? 240 : 150),
		'"A wild X appeared!" on time (not before), x1.3, HP an alpha\'s x9 x its rank, flees after 150 s (240 s a legendary)', JSON.stringify({ early: s3.early, enc: s3.enc, banner: s3.banner }));
	A(s3.faint && s3.faint.length === 1 && s3.faint[0].kind === 'league' && s3.faint[0].win === 12 && s3.cine && s3.cine.kind === 'league' && s3.cine.member === s3.enc.member,
		'weakened, it faints for 12 s; standing by it throws a Poké Ball (the cinematic)', JSON.stringify({ f: s3.faint, c: s3.cine }));
	A(s3.after && s3.after.own && s3.after.play && !s3.after.wild && s3.after.local && /Gotcha! .+ joined the League!/.test(s3.after.banner) && s3.after.cap >= 1,
		'caught: it joins the League (league.own, saved in the browser at once), playable from now on', JSON.stringify(s3.after));
	A(!s3.other || (s3.fled && s3.fled.gone && /got away! It will be back in your next run/.test(s3.fled.banner) && !s3.fled.own && s3.fled.wild), 'an encounter left alone flees after its time and stays wild (it comes back next run)', JSON.stringify(s3.fled || { other: s3.other }));
	const ovr3 = await endRun(page);
	A(ovr3.state === 'over' && /Caught: /.test(ovr3.text), 'the run-over screen names the members caught', ovr3.text.slice(0, 500));
	if (s3.enc && s3.enc.member !== 115) {
		// (Kangaskhan, if another member came first: caught the same way in a later run is covered above; it is still wild)
		const kw = await E(page, () => G.ExpLeague.wild(115) || G.ExpLeague.own(115));
		A(kw, 'Kangaskhan is still waiting (wild) or caught', String(kw));
	}

	// ======================== 4. shinies: the odds; an encounter that roams, never hurts, flees; a catch
	const s4a = await E(page, () => {
		const Cp = G.ExpCap, out = {};
		out.p = [Cp.shinyChance(0), Cp.shinyChance(100), Cp.shinyChance(0, true), Cp.shinyChance(100, true)];
		const rate = (luck, charm) => { let n = 0; for (let s = 1; s <= 20000; s++) if (Cp.zonePlan(s * 7919, 'viridian', 1 + (s % 3), { luck, charm }).shiny) n++; return n / 20000; };
		out.r0 = rate(0, false); out.r100 = rate(100, false); out.rc = rate(0, true);
		return out;
	});
	A(near(s4a.p[0], 0.08) && near(s4a.p[1], 0.18) && near(s4a.p[2], 0.12) && near(s4a.p[3], 0.27), 'shiny odds: 8 % a zone + luck / 1,000, x1.5 with the Shiny Charm', JSON.stringify(s4a.p));
	A(Math.abs(s4a.r0 - 0.08) < 0.008 && Math.abs(s4a.r100 - 0.18) < 0.01 && Math.abs(s4a.rc - 0.12) < 0.009, '... and over 20,000 seeded zones: ' + [s4a.r0, s4a.r100, s4a.rc].map(x => (x * 100).toFixed(2) + ' %').join(' / '), JSON.stringify(s4a));
	await startClassic(page);
	const s4 = await E(page, () => {
		const H = window.__t, Cp = G.ExpCap, S = G.ExpSave, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		// the zone's shiny on its schedule (this zone rolled none: give it one at 0:40)
		const R = Cp.run, zt = G.Game.st.time - G.ExpClassic.run.zs;
		R.zplan.shiny = { at: zt + 0.5, pick: 0.2 }; R.shDone = false;
		H.step(25);
		const g = [...R.tg.values()].find(x => x.kind === 'shiny'), e = g && g.e;
		out.banner = H.banner();
		if (!e) return out;
		out.enc = { dex: e.dex, sheet: e.anim.shiny, has: G.Sprites.hasShiny(e.dex), xk: e.xk, flee: g.flee, cards: G.ExpClassic.run.plan.cards.includes(e.dex), seen: R.log.seen };
		// it roams and never hurts you: stand on it for 2 s
		const x0 = e.x, y0 = e.y;
		H.hurts = 0;
		for (let i = 0; i < 60; i++) { H.go(e.x, e.y); H.step(1); }
		out.roam = { moved: Math.round(Math.hypot(e.x - x0, e.y - y0)), hurts: H.hurts, alive: !e.dead };
		// it flees at 120 s
		g.t0 -= g.flee - 0.5; H.step(30);
		out.fled = { gone: !G.EnemyMgr.get(e.id), banner: H.banner() };
		// another: weaken it, catch it
		R.zplan.shiny = { at: G.Game.st.time - G.ExpClassic.run.zs + 0.2, pick: 0.6 }; R.shDone = false;
		H.go(0, 0); H.step(12);
		const g2 = [...R.tg.values()].find(x => x.kind === 'shiny'), e2 = g2 && g2.e;
		if (!e2) return out;
		H.weaken(e2); H.step(2);
		out.faint = H.faints();
		H.throwAt(R.faint[0], true);
		const fam = G.ExpLeague.FAM[e2.dex];
		out.caught = { dex: e2.dex, has: S.has('shiny.caught', e2.dex), cap: S.get('cap.shiny'), fam: fam || 0, famShiny: fam ? S.has('league.shiny', fam) : null, banner: H.banner(), onShiny: (G.DB.save.stats.shinies || 0) };
		return out;
	});
	A(s4.enc && s4.enc.sheet && s4.enc.has && s4.enc.xk === 'shiny' && s4.enc.cards && s4.enc.flee === 120 && s4.enc.seen === 1 && /A shiny .+ is nearby!/.test(s4.banner),
		'a shiny encounter: one of the zone\'s Pokémon on its shiny sheet ("A shiny X is nearby!"), fleeing after 120 s', JSON.stringify({ enc: s4.enc, b: s4.banner }));
	A(s4.roam && s4.roam.moved > 20 && s4.roam.hurts === 0 && s4.roam.alive, 'it roams round you and never hurts you (no contact damage, no shots)', JSON.stringify(s4.roam));
	A(s4.fled && s4.fled.gone && /The shiny .+ got away!/.test(s4.fled.banner), 'left alone, it flees after 120 s', JSON.stringify(s4.fled));
	A(s4.faint && s4.faint.length === 1 && s4.faint[0].kind === 'shiny' && s4.faint[0].win === 10 && s4.caught && s4.caught.has && s4.caught.cap === 1 && (!s4.caught.fam || s4.caught.famShiny) && /Gotcha! The shiny .+ was caught!/.test(s4.caught.banner) && s4.caught.onShiny === 0,
		'weakened, it faints (10 s); caught: shiny.caught (and league.shiny for a League family) in the Expedition save, never the base save', JSON.stringify({ f: s4.faint, c: s4.caught }));
	// ======================== 6. the elemental reactions (the real G.Combat.land)
	const s6 = await E(page, () => {
		const H = window.__t, Rx = G.ExpRx, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0); G.Weather.reset(); H.step(1);
		const foe = (dx, dy = 0) => { const e = H.foe(19, pl.x + dx, pl.y + dy, { hp: 50 }); e.xmove = function () { return true; }; e.shotCd = 99; return e; };
		const hit = (e, type, d = 100) => { const h0 = e.hp; G.Combat.land(e, d, '#fff', 0, 0, 0, { mtype: type }, false, pl); return h0 - e.hp; };
		const ctl = type => { const c = foe(-260); const d = hit(c, type); c.remote = true; G.EnemyMgr.removeRemote(c.id, false); return d; };
		const tm = () => G.Game.st.time;
		const R = {};
		// Electrocuted: Electric on a wet foe (x1.5), chaining to the wet foes within 9 m
		{ const a = foe(200), b = foe(260), c = foe(300, 40), far = foe(200, 400); H.step(1); for (const e of [a, b, c, far]) e.xwet = tm() + 4; const hb = b.hp, hf = far.hp;
		  const d = hit(a, 'electric'); R.electro = { k: +(d / ctl('electric')).toFixed(3), chain: Rx.lastChain, b: hb - b.hp, far: hf - far.hp, wetA: Rx.wet(a), wetB: Rx.wet(b) }; }
		H.wipe();
		// Steam: Water on a burning foe (x1.4), confusing and rooting round it; the burn goes out
		{ const a = foe(200), b = foe(250); H.step(1); a.applyBurn(2); const d = hit(a, 'water'); R.steam = { k: +(d / ctl('water')).toFixed(3), burn: a.burn, conf: b.confT > 0 && a.confT > 0, root: b.slow > 0 }; }
		H.wipe();
		// Inferno: Grass on a burning foe spreads the burn
		{ const a = foe(200), b = foe(250), c = foe(200, 300); H.step(1); a.applyBurn(2); const d = hit(a, 'grass'); R.inferno = { k: +(d / ctl('grass')).toFixed(3), b: b.burn, far: c.burn }; }
		H.wipe();
		// Wreckage: Rock on a frozen foe (x2.6, on top of the base frozen x1.25)
		{ const a = foe(200); G.Status.apply(a, 'freeze'); const d = hit(a, 'rock'); R.wreck = { k: +(d / ctl('rock')).toFixed(3), shattered: a.frozenT <= 0.011 }; }
		H.wipe();
		// Poison Gas: Fire on a poisoned foe (x1.3), poisoning round it
		{ const a = foe(200), b = foe(250); H.step(1); a.applyPoison(1); const d = hit(a, 'fire'); R.gas = { k: +(d / ctl('fire')).toFixed(3), b: b.poison }; }
		H.wipe();
		// Psychic Meltdown: Psychic on a confused foe (x1.6)
		{ const a = foe(200); G.Status.apply(a, 'conf'); const d = hit(a, 'psychic'); R.melt = { k: +(d / ctl('psychic')).toFixed(3) }; }
		H.wipe();
		// Dragon Rage: Dragon on a foe with 2 statuses (x1.8); one status: none
		{ const a = foe(200), b = foe(240, 60); a.applyBurn(1); a.applySlow(0.3, 3); b.applyBurn(1); const d = hit(a, 'dragon'), d1 = hit(b, 'dragon'); const c = ctl('dragon'); R.rage = { k: +(d / c).toFixed(3), one: +(d1 / c).toFixed(3) }; }
		H.wipe();
		// wet from a Water hit; chill: 3 Ice hits freeze, 1 on a wet foe does
		{ const a = foe(200), b = foe(250, 60); hit(a, 'water'); const w = Rx.wet(a); const n = [];
		  for (let i = 0; i < 3; i++) { hit(b, 'ice', 1); n.push(b.frozenT > 0); }
		  const c = foe(200, -80); c.xwet = tm() + 4; hit(c, 'ice', 1);
		  R.marks = { wet: w, chill: n, wetFreeze: c.frozenT > 0, dur: +c.frozenT.toFixed(2) }; }
		H.wipe();
		// the cool-down: a second Electrocuted on the same foe within 0.25 s is a plain hit
		{ const a = foe(200); a.xwet = tm() + 4; hit(a, 'electric'); a.xwet = tm() + 4; const d2 = hit(a, 'electric'); const plain = ctl('electric'); H.step(9); a.xwet = tm() + 4; const d3 = hit(a, 'electric'); R.cd = { second: +(d2 / plain).toFixed(3), later: +(d3 / plain).toFixed(3) }; }
		H.wipe();
		out.R = R; out.counts = Object.assign({}, Rx.run.rx);
		return out;
	});
	const R6 = s6.R || {};
	A(R6.electro && near(R6.electro.k, 1.5, 0.03) && R6.electro.chain === 2 && R6.electro.b > 0 && R6.electro.far === 0 && !R6.electro.wetA && !R6.electro.wetB, 'Electrocuted: Electric on a wet foe x1.5, chaining to the 2 wet foes within 9 m (not the far one), drying them', JSON.stringify(R6.electro));
	A(R6.steam && near(R6.steam.k, 1.4, 0.03) && R6.steam.burn === 0 && R6.steam.conf && R6.steam.root, 'Steam: Water on a burning foe x1.4, confuses and roots round it, puts the burn out', JSON.stringify(R6.steam));
	A(R6.inferno && near(R6.inferno.k, 1, 0.03) && R6.inferno.b >= 2 && R6.inferno.far === 0, 'Inferno: Grass on a burning foe spreads the burn within 7 m', JSON.stringify(R6.inferno));
	A(R6.wreck && near(R6.wreck.k, 2.6 * 1.25, 0.06) && R6.wreck.shattered, 'Wreckage: Rock on a frozen foe x2.6 (with the base frozen x1.25), the ice shatters', JSON.stringify(R6.wreck));
	A(R6.gas && near(R6.gas.k, 1.3, 0.03) && R6.gas.b >= 2, 'Poison Gas: Fire on a poisoned foe x1.3 and a poison cloud', JSON.stringify(R6.gas));
	A(R6.melt && near(R6.melt.k, 1.6, 0.03), 'Psychic Meltdown: Psychic on a confused foe x1.6', JSON.stringify(R6.melt));
	A(R6.rage && near(R6.rage.k, 1.8, 0.03) && near(R6.rage.one, 1, 0.03), 'Dragon Rage: Dragon on a foe with 2+ statuses x1.8 (one status: a plain hit)', JSON.stringify(R6.rage));
	A(R6.marks && R6.marks.wet && JSON.stringify(R6.marks.chill) === '[false,false,true]' && R6.marks.wetFreeze && R6.marks.dur > 1.5 && R6.marks.dur <= 1.61, 'a Water hit leaves a foe wet; 3 Ice hits freeze it (1 on a wet foe), for 1.6 s', JSON.stringify(R6.marks));
	A(R6.cd && near(R6.cd.second, 1, 0.03) && near(R6.cd.later, 1.5, 0.03), 'each reaction has a 0.25 s cool-down per foe', JSON.stringify(R6.cd));
	A(s6.counts && ['electro', 'steam', 'inferno', 'wreck', 'gas', 'melt', 'rage'].every(k => s6.counts[k] >= 1), 'the run counts each reaction (rx.<name> in the save at the end)', JSON.stringify(s6.counts));
	// ======================== 7. weather boosts
	const s7 = await E(page, () => {
		const H = window.__t, Rx = G.ExpRx, pl = G.Game.player, out = {};
		H.wipe(); H.go(0, 0);
		const foe = () => { const e = H.foe(19, pl.x + 200, pl.y, { hp: 50 }); e.xmove = function () { return true; }; return e; };
		const hit = type => { const e = foe(); const h0 = e.hp; G.Combat.land(e, 100, '#fff', 0, 0, 0, { mtype: type }, false, pl); const d = h0 - e.hp; e.remote = true; G.EnemyMgr.removeRemote(e.id, false); return d; };
		G.Weather.reset(); Rx.run.wx = null;
		const base = { grass: hit('grass'), dark: hit('dark'), water: hit('water'), normal: hit('normal'), fire: hit('fire') };
		const under = kind => { G.Weather.force(kind, 60); H.step(8); const b = H.banner(); H.step(92); const r = {}; for (const t in base) r[t] = +(hit(t) / base[t]).toFixed(3); r.banner = b; r.fav = Rx.favoured(kind); G.Weather.clear(); Rx.run.wx = null; H.step(1); return r; };
		out.sun = under('sun'); out.fog = under('fog'); out.rain = under('rain');
		out.types = pl.mon.types;
		return out;
	});
	A(s7.sun && near(s7.sun.grass, 1.3 * 1.1, 0.03) && near(s7.sun.fire, 1.5 * 1.1, 0.04) && near(s7.sun.water, 0.5 * 1.1, 0.03) && near(s7.sun.normal, 1.1, 0.03) && /^Harsh sunlight boosts your Bulbasaur: \+10% damage$/.test(s7.sun.banner),
		'Sun: Grass x1.3 (the study\'s, which the base weather lacks), Fire / Water as the base game; Bulbasaur is Grass, so all its hits +10% ("... boosts your Bulbasaur: +10% damage")', JSON.stringify(s7.sun));
	A(s7.fog && near(s7.fog.dark, 1.3, 0.03) && near(s7.fog.normal, 1, 0.03) && !/boosts your/.test(s7.fog.banner), 'Fog: Dark x1.3 (the study\'s Mist); Bulbasaur isn\'t favoured: no boost, no banner', JSON.stringify(s7.fog));
	A(s7.rain && near(s7.rain.water, 1.5, 0.03) && near(s7.rain.fire, 0.5, 0.03) && near(s7.rain.grass, 1, 0.03), 'Rain: the base weather unchanged (Water x1.5, Fire x0.5)', JSON.stringify(s7.rain));

	// ======================== 8. determinism
	const s8 = await E(page, () => {
		const Cp = G.ExpCap, out = {};
		const real = Math.random; let calls = 0;
		Math.random = () => { calls++; return real(); };
		try {
			const a = JSON.stringify([1, 2, 3].map(z => Cp.zonePlan(4242, 'viridian', z, { member: 115, luck: 30 })));
			const b = JSON.stringify([1, 2, 3].map(z => Cp.zonePlan(4242, 'viridian', z, { member: 115, luck: 30 })));
			const c = JSON.stringify([1, 2, 3].map(z => Cp.zonePlan(4243, 'viridian', z, { member: 115, luck: 30 })));
			const p1 = JSON.stringify(Cp.pendingOf(4242)), p2 = JSON.stringify(Cp.pendingOf(4242));
			out.same = a === b; out.other = a !== c; out.pend = p1 === p2;
		} finally { Math.random = real; }
		out.calls = calls;
		return out;
	});
	A(s8.same && s8.other && s8.pend && s8.calls === 0, 'the zone plans (League encounter, shiny roll and time) and the pending order are pure: the same twice, another seed another plan, no Math.random', JSON.stringify(s8));

	// ======================== 9. sync
	await startClassic(page);
	const sy = await E(page, async () => {
		const H = window.__t, Cp = G.ExpCap, out = {};
		H.wipe(); H.go(0, 0); H.step(1);
		const idle = JSON.parse(JSON.stringify(G.Spectate.snap()));
		// a Support Alpha, a shiny on the field, a fainted alpha
		const a = H.alpha(16); H.weaken(a); H.step(2); H.throwAt(Cp.run.faint[0], true);
		const R = Cp.run;
		R.zplan.shiny = { at: G.Game.st.time - G.ExpClassic.run.zs + 0.2, pick: 0.4 }; R.shDone = false; H.go(0, 0); H.step(12);
		const sh = [...R.tg.values()].find(x => x.kind === 'shiny');
		if (sh) { sh.e.x = G.Game.player.x + 160; sh.e.y = G.Game.player.y + 40; }
		const b = H.alpha(21, -180); H.weaken(b); H.step(2);
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		// a capture under way
		H.go(R.faint[0].x + 6, R.faint[0].y + 4); H.step(14);
		const snapK = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const m = { uid: 'bob', name: 'bob', connected: true, pl: G.Game.player };
		const had = Object.getOwnPropertyDescriptor(G.Net, 'uid');
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x, gf = G.Hooks.reduce('net.frame', { k: 'f' }, null).x;
		if (had) Object.defineProperty(G.Net, 'uid', had); else delete G.Net.uid;
		H.step(Math.ceil((Cp.CINE_T + 0.3) * 30));
		const snapN = JSON.parse(JSON.stringify(G.Spectate.snap()));
		out.idle = idle; out.snap = snap; out.snapK = snapK; out.snapN = snapN; out.hf = hf && hf.p; out.gf = gf ? gf.p || null : null; out.seed = G.World.seed; out.shId = sh ? sh.e.id : 0;
		// the replay: `p` kept, an `xc` event per capture
		H.step(40);
		G.Game.quit(); await new Promise(r => setTimeout(r, 300));
		const e = G.Replay.last; if (e && e.ready) await e.ready;
		out.code = e && e.code;
		out.over = (document.getElementById('scr-over') || {}).innerText || '';
		return out;
	});
	const pS = sy.snap && sy.snap.x && sy.snap.x.p, pK = sy.snapK && sy.snapK.x && sy.snapK.x.p;
	A(sy.snap && sy.snap.x.xv === 10 && pS && JSON.stringify(pS.s) === '[16]' && Array.isArray(pS.t) && pS.t[0] === sy.shId && pS.t[1] === 8 && Array.isArray(pS.f) && pS.f[0] === 1 && pS.f[1] === 21 && pS.n === 1 && pS.u === 16 && !(sy.idle.x && sy.idle.x.p),
		'a live snapshot: x v10 with `p` {s: the Support Alphas, t: the shiny on the field, f: the fainted alpha, n, u} (none before)', JSON.stringify({ p: pS, idle: sy.idle && sy.idle.x && sy.idle.x.p }));
	A(pK && Array.isArray(pK.k) && pK.k[0] === 1 && pK.k[1] === 21 && pK.k[5] >= 2 && sy.hf && sy.hf.h === 'alice' && JSON.stringify(sy.hf.k) === JSON.stringify(pK.k) && sy.gf && JSON.stringify(sy.gf) === '{"s":[16],"n":1}',
		'... `k` while a capture is under way; a co-op host frame carries the same `p` (+ the host\'s uid); a guest\'s own frame only its own Support Alphas and catch count (D11: never the targets)', JSON.stringify({ k: pK && pK.k, hf: sy.hf, gf: sy.gf }));
	const d3 = await bootPage();
	const vw = await E(d3.page, async (rec) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
		G.MicaAccount.name = () => 'viewer';
		let hs = null;
		G.Spectate.watch = (u, h) => { hs = h; h.snapshot(rec.idle, {}); };
		G.WatchUI.watchLive('host');
		for (let i = 0; i < 80 && !(G.WatchUI.player && G.World.zone && G.ExpCap); i++) await wait(50);
		hs.snapshot(rec.snap, {}); hs.snapshot(Object.assign({}, rec.snap, { t: rec.snap.t + 1 }), {});
		await wait(350);
		const V = G.ExpCap.view, sh = rec.shId && G.EnemyMgr.get(rec.shId);
		const dr = G.ExpCap.drawables(G.Camera);
		out.spec = V && { s: V.s, f: V.f.length, shiny: !!(sh && sh.anim && sh.anim.shiny), xk: sh && sh.xk, drawables: dr.length, run: !!G.ExpCap.run };
		hs.snapshot(rec.snapK, {}); hs.snapshot(Object.assign({}, rec.snapK, { t: rec.snapK.t + 1 }), {});
		await wait(350);
		out.spec.cine = !!G.ExpCap.vcine && G.ExpCap.vcine.dex === 21;
		out.spec.over = G.ExpCap.overDrawn > 0;
		G.WatchUI.leave(); await wait(200);
		// a v7 block (no `p`) still loads: no capture shown
		const old = Object.assign({}, rec.snap, { dv: 6, x: Object.assign({}, rec.snap.x, { xv: 7 }) });
		delete old.x.p;
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.World.reset(rec.seed); G.Exp.applyX(rec.seed, old.x);
		G.Exp.viewAir(old, pup, null);
		out.old = { view: G.ExpCap.view, ok: G.Expedition.replayOk(6), notice: G.Expedition.viewNotice('exp-classic', 6), dv: G.Expedition.DV };
		// the replay viewer
		const rd = await G.Replay.open(rec.code);
		let withP = 0;
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.p) withP++; }
		out.replay = { frames: rd.length, withP, xc: rd.ev.filter(e => e[1] === 'xc').map(e => e[2]) };
		G.WatchUI.playReplay(rd, {});
		for (let i = 0; i < 60 && !G.WatchUI.player; i++) await wait(50);
		G.WatchUI.seek(Math.max(0, rd.duration - 0.5)); await wait(400);
		out.replay.sa = G.ExpCap.view && G.ExpCap.view.s;
		G.WatchUI.leave(); await wait(200);
		// a base run in the same page: no zone, no captures, nothing drawn
		H.thaw(); await G.Flow.play('normal'); await wait(400); H.freeze();
		out.base = { mode: G.Game.mode, zone: !!G.World.zone, run: !!G.ExpCap.run, rx: !!G.ExpRx.run, x: !!((G.Spectate.snap() || {}).x), loaded: G.Expedition.loaded };
		G.Game.quit(); await wait(200);
		return out;
	}, { idle: sy.idle, snap: sy.snap, snapK: sy.snapK, code: sy.code, seed: sy.seed, shId: sy.shId });
	A(vw.loadedBefore === false && vw.spec && JSON.stringify(vw.spec.s) === '[16]' && vw.spec.f === 5 && vw.spec.shiny && vw.spec.xk === 'shiny' && vw.spec.drawables >= 2 && !vw.spec.run,
		'a live spectator (a fresh page): the Support Alpha drawn round the watched player, the fainted alpha, the shiny on its shiny sheet', JSON.stringify(vw.spec));
	A(vw.spec && vw.spec.cine && vw.spec.over, '... and the capture cinematic when the host throws (its ball and its banner)', JSON.stringify(vw.spec));
	A(vw.old && vw.old.view === null && vw.old.ok && !vw.old.notice && vw.old.dv === 19, 'a dv-6 / x v7 snapshot (no `p`) still loads with no notice: no capture shown; this build is dv 17 (D12)', JSON.stringify(vw.old));
	A(vw.replay && vw.replay.withP > 0 && vw.replay.xc.length >= 2 && vw.replay.xc.includes(16) && vw.replay.xc.includes(21) && JSON.stringify(vw.replay.sa) === '[16,21]', 'a replay keeps `p` and an `xc` event per capture (Pidgey, Spearow); played back, the Support Alphas', JSON.stringify(vw.replay));
	A(vw.base && vw.base.mode === 'normal' && !vw.base.zone && !vw.base.run && !vw.base.rx && !vw.base.x && vw.base.loaded, 'a Normal run in the same page (Expedition code loaded): no zone, no captures or reactions, no `x`', JSON.stringify(vw.base));
	await d3.ctx.close();

	// ======================== 10. phone and desktop: the chips, the swap choice, the banner
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startClassic(d.page);
		A(st.ok && st.on, `${tag}: Classic starts`, JSON.stringify(st));
		const inV = (b, W, Hh) => b && b.x >= -1 && b.y >= -1 && b.x + b.w <= W + 1 && b.y + b.h <= Hh + 1;
		const rectOf = sel => E(d.page, sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
		const dims = await E(d.page, () => ({ W: innerWidth, H: innerHeight, touch: G.Touch.active }));
		// two Support Alphas: the chips under the HP bar overlap nothing
		await E(d.page, () => { const H = window.__t, Cp = G.ExpCap; for (const dex of [16, 74]) { H.wipe(); H.go(0, 0); const a = H.alpha(dex); H.weaken(a); H.step(2); H.throwAt(Cp.run.faint[0], true); } H.wipe(); H.go(0, 0); H.step(20); });
		const lay = await E(d.page, async () => {
			window.__t.thaw(); await new Promise(r => setTimeout(r, 400)); window.__t.freeze();
			const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
			const sup = R.find(o => o.name === 'xsup');
			const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
			return { sup, hits: sup ? R.filter(o => o !== sup && hit(o, sup)).map(o => o.name) : [], names: R.map(o => o.name) };
		});
		A(lay.sup && inV(lay.sup, dims.W, dims.H) && lay.hits.length === 0 && lay.sup.w > 50, `${tag}: the Support Alphas' chips are on screen and overlap nothing on the HUD (the minimap moves round them)`, JSON.stringify(lay));
		if (SHOTS) await shoot(d.page, `support_alphas_${tag}.png`, 250);
		// a third: the swap choice fits; tap / click its first card
		await E(d.page, () => { const H = window.__t, Cp = G.ExpCap; H.wipe(); H.go(0, 0); const a = H.alpha(37); H.weaken(a); H.step(2); const f = Cp.run.faint[0]; H.go(f.x + 6, f.y + 4); H.step(14); });
		const pk = await E(d.page, () => ({ open: G.ExpEco.pick && G.ExpEco.pick.kind, n: document.querySelectorAll('#xeco-cards .card').length }));
		const box = await rectOf('#scr-xeco .box'), card = await rectOf('#xeco-cards .card:first-child'), keep = await rectOf('#xeco-close');
		A(pk.open === 'friend' && pk.n === 2 && inV(box, dims.W, dims.H) && inV(card, dims.W, dims.H) && inV(keep, dims.W, dims.H), `${tag}: the Friend Ball's "swap whom?" choice and "Keep my team" fit the screen (${dims.W}x${dims.H})`, JSON.stringify({ pk, box, card, keep }));
		if (SHOTS) await shoot(d.page, `friend_ball_swap_${tag}.png`, 300);
		if (card) {
			await E(d.page, () => { G.ExpEco.pick.at = -1e9; });
			if (view && view.hasTouch) await d.page.touchscreen.tap(card.x + card.w / 2, card.y + card.h / 2); else await d.page.mouse.click(card.x + card.w / 2, card.y + card.h / 2);
			await sleep(100);
			const c1 = await E(d.page, () => ({ cine: !!G.ExpCap.run.cine, open: !!G.ExpEco.pick }));
			A(c1.cine && !c1.open, `${tag}: a ${view && view.hasTouch ? 'tap' : 'click'} on a card swaps: the capture cinematic starts`, JSON.stringify(c1));
		}
		// the cinematic's banner on screen
		await E(d.page, () => window.__t.step(40));
		const bn = await E(d.page, async () => {
			window.__t.thaw(); await new Promise(r => setTimeout(r, 120)); window.__t.freeze();
			const k = G.HUD.k, mv = G.HUD.rects().find(r => r.name === 'moves'), tp = G.ExpEco.tipRect();
			return { drawn: G.ExpCap.overDrawn, text: G.ExpCap.overText, cine: !!G.ExpCap.run.cine, r: G.ExpCap.overRect, moves: mv && { x: mv.x * k, y: mv.y * k, w: mv.w * k, h: mv.h * k }, tip: tp && { x: tp.x * k, y: tp.y * k, w: tp.w * k, h: tp.h * k } };
		});
		const clear = (a, b) => !b || !(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
		A(bn.drawn > 0 && /Friend Ball · Vulpix|Gotcha! Vulpix/.test(bn.text) && inV(bn.r, dims.W, dims.H) && clear(bn.r, bn.moves) && clear(bn.r, bn.tip), `${tag}: the capture banner is drawn (in English), on screen, clear of the move bar and of a tip's box`, JSON.stringify(bn));
		if (SHOTS) await shoot(d.page, `capture_cinematic_${tag}.png`, 40);
		await E(d.page, () => window.__t.step(Math.ceil((G.ExpCap.CINE_T + 0.4) * 30)));
		if (SHOTS) {
			// an alpha (x1.6, its red aura), a fainted one with its window, a shiny (its sheet, aura, flee timer), a reaction
			await E(d.page, () => { const H = window.__t; H.quiet(); H.wipe(); H.go(0, 0); H.step(2); H.alpha(16, 130); H.step(4); });
			await shoot(d.page, `alpha_${tag}.png`, 350);
			await E(d.page, () => { const H = window.__t; H.wipe(); H.go(0, 0); const a = H.alpha(21, 120); H.weaken(a); H.step(3); H.go(-60, 30); H.step(2); });
			await shoot(d.page, `alpha_fainted_${tag}.png`, 300);
			await E(d.page, () => { const H = window.__t, R = G.ExpCap.run; H.wipe(); R.faint.length = 0; H.go(0, 0); R.zplan.shiny = { at: G.Game.st.time - G.ExpClassic.run.zs + 0.2, pick: 0.35 }; R.shDone = false; H.step(12); const g = [...R.tg.values()].find(x => x.kind === 'shiny'); if (g) { g.e.x = G.Game.player.x + 100; g.e.y = G.Game.player.y - 20; g.e.xroam.tx = g.e.x; g.e.xroam.ty = g.e.y; g.e.xroam.t = 9; } H.step(3); });
			await shoot(d.page, `shiny_${tag}.png`, 450);
			await E(d.page, () => { const H = window.__t, pl = G.Game.player; H.wipe(); H.go(0, 0); const es = [0, 1, 2].map(i => { const e = H.foe(19, pl.x + 120 + i * 30, pl.y + (i % 2) * 30, { hp: 50 }); e.xmove = function () { return true; }; return e; }); H.step(1); for (const e of es) e.xwet = G.Game.st.time + 4; G.Combat.land(es[0], 60, '#fff', 0, 0, 0, { mtype: 'electric' }, false, pl); });
			await shoot(d.page, `reaction_${tag}.png`, 160);
		}
		const sp = await E(d.page, () => { const el = document.querySelector('#scr-xeco'); return { text: [...document.querySelectorAll('#xeco-cards, #xeco-h, #xeco-sub')].map(e => e.innerText).join(' '), ban: String((G.Spawner.banner() || {}).text || '') }; });
		A(!/[¿¡]|Cambia|Quedarme|equipo|Ya está|salvaje|variocolor/i.test(sp.text + ' ' + sp.ban), `${tag}: no Spanish on the screens and banners`, JSON.stringify(sp));
		await d.ctx.close();
	}

	const pageErrs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
	A(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
