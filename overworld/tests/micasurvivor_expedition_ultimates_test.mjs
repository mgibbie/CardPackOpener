// micasurvivor_expedition_ultimates_test.mjs — MicaSurvivor DLC D6: Ultimates (the charge meter, the cast's hit-stop, i-frames
// and cut-in, type Ultimates from the Z-move choreographies, 16 signature Ultimates by evolution tier, the auto setting).
// micasurvivor/js/expedition/ultimates.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.4 and the D6 row.
// A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   0. the server keeps the auto setting's two Lamport counters (two devices: max), so the latest switch wins, with no
//      server change
//   1. Classic starts with the meter at 0; dv 5
//   2. each charge source's rate: passive (95 s to full), a kill (+0.004 from a 0.024 bucket refilling 0.008 / s), elite
//      +0.03, alpha / totem +0.08, guardian / boss +0.2, damage taken 0.35 x damage / max HP; through the real seams
//      (enemy.ko, player.hurt) too; nothing charges while casting
//   3. the cast: the Z key; a 0.32 s hit-stop (the run clock holds); i-frames for the whole cast + 0.6 s (also against a
//      hurt that zeroes invuln); the charge spent; the damage reaches foes; the pad's Z-move button and R cast too
//   4. the cut-in shows (drawn on the real canvas, the Ultimate's name)
//   5. a type Ultimate per type: all 18 Z choreographies, rescaled, hurt foes; a non-signature member casts its type's
//   6. signature Ultimates by tier: 16 of them, 3 names each; Charmander -> Charmeleon -> Charizard (+ Maturity) raise the
//      tier, the name, the beats and the damage; Mew's Metronome chains 1 / 2 / 3 seeded copies
//   7. the auto setting: off by default, U / the AUTO chip / the pause button toggle it, saved in the Expedition save;
//      on: casts when full with a foe near, not with none
//   8. sync: the `x` block v6 `w` on snapshots, host and guest frames; a fresh page as co-op guest, live spectator and replay
//      viewer shows the cast (cut-in + the choreography as a ghost); the replay's `xu` event; a v5 block still loads; dv 5
//   9. base modes untouched in the same page: a Normal run has the Z button back, no Ultimate
//  10. the phone (844 x 390, touch): the button and AUTO chip fit and overlap nothing; a tap casts; screenshots
//   node overworld/tests/micasurvivor_expedition_ultimates_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D6" count was taken.)
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
const PORT = 8858;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ======================== 0. the server keeps the auto setting (two devices: the max of each counter)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-ult-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ip = 0;
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.2.' + (1 + ip++), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await call('register', { username: 'ultimatestester', password: 'msurv-ultimates-pass-1' })).body.token;
	// device A switched auto on (on 3 > off 2); device B, later, switched it off (off 4); both + a cast counter
	const devA = { v: 1, counters: { 'ult.auto.on': 3, 'ult.auto.off': 2, 'ult.casts': 9 }, sets: {} };
	const devB = { v: 1, counters: { 'ult.auto.on': 3, 'ult.auto.off': 4, 'ult.casts': 4, 'ult.best': 5 }, sets: {} };
	await call('micasurvivor-exp-save-put', { save: devA, rev: 0 }, tok);
	const p2 = await call('micasurvivor-exp-save-put', { save: devB, rev: 0 }, tok);
	if (p2.status === 409) await call('micasurvivor-exp-save-put', { save: devB, rev: p2.body.rev }, tok);
	const c = ((await call('micasurvivor-exp-save-get', {}, tok)).body.save || {}).counters || {};
	A(p2.status === 409 && c['ult.auto.on'] === 3 && c['ult.auto.off'] === 4 && c['ult.casts'] === 9 && c['ult.best'] === 5,
		'the server takes the D6 counters (ult.auto.on / .off, ult.casts, ult.best) with no server change; merged by max, the later switch (off: 4 > on: 3) wins', JSON.stringify(c));
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
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {},
	// the base Z-move of every type is unlocked: in an Expedition zone it must still step aside for the Ultimate
	stats: Object.fromEntries(['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'].map(t => ['tk_' + t, 999])),
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
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	// a synthetic Gamepad API (as micasurvivor_pad_test)
	window.__pads = [];
	window.__mkPad = (i, id) => ({ index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } } });
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	try {
		localStorage.setItem('micasurvivor_dev', 'dult6');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	/** a sturdy test player: hurts are counted, not taken; XP pickups give nothing */
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.unsturdy = () => { const pl = G.Game.player; delete pl.hurt; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); } };
	H.unblock = () => { if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); } };
	H.clear = () => { for (const e of G.EnemyMgr.all().slice()) G.EnemyMgr.remove ? G.EnemyMgr.remove(e) : null; };
	/** a still target dummy (a Pidgey with lots of HP that doesn't walk or hurt) */
	H.dummy = (x, y, hp = 5000) => {
		const e = new G.Enemy({ dex: 16, name: 'Pidgey', behavior: 'chaser', hp: 1, spd: 0, dmg: 0, xp: 0 }, x, y, { hp, dmg: 0, spd: 0 });
		e.touchCd = 99;
		G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
		return e;
	};
	/** a ring of dummies round the player; -> them */
	H.ring = (n = 8, r = 120, hp = 1e7) => { const pl = G.Game.player, out = []; for (let i = 0; i < n; i++) { const a = 6.2832 * i / n; out.push(H.dummy(pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r, hp)); } return out; };
	/** every live enemy gone, without counting as kills */
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); };
	/** a key press seen by the next step (G.Input's taps) */
	H.key = code => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true })); };
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
	/** start Classic with League member `dex` (made playable), freeze the frames, a sturdy player */
	const startClassic = (page, dex = 1) => E(page, async (dex) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		await G.Expedition.load();
		await G.ExpSave.open();
		if (!G.ExpLeague.playable(dex)) { G.ExpSave.add('league.met', dex); G.ExpSave.commit(); }
		G.ExpLeague.setPick(dex);
		if (G.Game.state === 'playing' || G.Game.state === 'levelup' || G.Game.state === 'choice') { G.Game.quit(); await wait(300); }
		if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await wait(300); }
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		window.__t.sturdy();
		const U = G.ExpUlt;
		return { ok, state: G.Game.state, mode: G.Game.mode, dex: G.Game.player.dex, dv: G.Modes.run.dv, on: !!(U && U.run), c: U && U.run ? U.run.c : null, row: U && U.row() };
	}, dex);

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const r0 = await startClassic(page);
	A(r0.ok && r0.mode === 'exp-classic' && r0.dex === 1 && r0.dv === 7 && r0.on && r0.c === 0 && Array.isArray(r0.row) && r0.row[0] === 0 && r0.row[2] === 1,
		'Classic starts as Bulbasaur with the Ultimate meter at 0 (its signature, code 1); the content version is 6 (D7)', JSON.stringify(r0));

	// ======================== 2. each charge source's rate
	const ch = await E(page, () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player, K = U.K, out = { K: { P: K.PASSIVE_T, KILL: K.KILL, B: K.BUCKET, BR: K.BUCKET_RATE, EL: K.ELITE, AL: K.ALPHA, BO: K.BOSS, HU: K.HURT } };
		const zero = () => { for (const k in S.src) S.src[k] = 0; S.c = 0; S.bucket = K.BUCKET; };
		// passive: 30 s of real run
		zero(); H.step(600, 1 / 20);
		out.passive30 = S.src.passive; out.t30 = G.Game.debugState ? null : null;
		// 95 s of passive alone fill it (the sum is uncapped in src)
		zero(); H.step(1900, 1 / 20);
		out.passive95 = S.src.passive; out.full = S.c >= 0.9999 && S.ready;
		// the kill bucket: 10 kills at once give 0.024 (6 kills' worth), then 1 s refills 0.008 (2 more kills)
		zero(); S.bucket = K.BUCKET;
		for (let i = 0; i < 10; i++) U.onKill({ dex: 16 }, pl);
		out.burst = S.src.kill; out.bucketLeft = S.bucket;
		S.bucket = Math.min(K.BUCKET, S.bucket + K.BUCKET_RATE * 1);
		for (let i = 0; i < 10; i++) U.onKill({ dex: 16 }, pl);
		out.afterRefill = S.src.kill;
		// special kills (outside the bucket)
		zero(); S.bucket = 0;
		U.onKill({ xk: 'elite' }, pl); out.elite = S.src.elite;
		U.onKill({ xk: 'summoner' }, pl); out.summoner = S.src.elite - out.elite;
		U.onKill({ xk: 'alpha' }, pl); out.alpha = S.src.alpha;
		U.onKill({ xk: 'totem' }, pl); out.totem = S.src.alpha - out.alpha;
		U.onKill({ boss: true, xk: 'guardian' }, pl); out.boss = S.src.boss;
		out.kill0 = S.src.kill;   // (an empty bucket: plain kills give nothing)
		U.onKill({ dex: 16 }, pl); out.killEmpty = S.src.kill;
		// through the real enemy.ko seam: a dummy that dies in the EnemyMgr step; an alpha one
		zero();
		const a = H.dummy(pl.x + 300, pl.y, 50); a.dead = true; a.fade = 0; H.step(1);
		out.realKill = S.src.kill;
		const b = H.dummy(pl.x + 300, pl.y, 50); b.xk = 'alpha'; b.dead = true; b.fade = 0; H.step(1);
		out.realAlpha = S.src.alpha;
		// damage taken, through the real player.hurt seam
		zero();
		H.unsturdy(); pl.invuln = 0; pl.hp = pl.maxHp;
		const hp0 = pl.hp; pl.hurt(pl.maxHp * 0.3); const lost = hp0 - pl.hp;
		out.hurt = S.src.hurt; out.hurtWant = K.HURT * lost / pl.maxHp; out.lost = lost;
		pl.hp = pl.maxHp; H.sturdy();
		// nothing charges while casting
		zero(); U.debugCharge(1); H.wipe(); H.ring(6, 140);
		U.tryCast(pl); const c0 = S.c, p0 = S.src.passive;
		H.step(40, 1 / 30);
		U.onKill({ dex: 16 }, pl); U.onKill({ xk: 'alpha' }, pl);
		out.casting = { c0, c1: S.c, passive: S.src.passive - p0, alpha: S.src.alpha, kill: S.src.kill, cast: !!S.cast };
		for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30);
		H.wipe();
		return out;
	});
	A(ch.K && ch.K.P === 95 && near(ch.passive30, 30 / 95, 0.002), 'passive: 30 s of a real run add 30 / 95 (full in 95 s)', JSON.stringify({ K: ch.K, p30: ch.passive30 }));
	A(near(ch.passive95, 1, 0.003) && ch.full, '95 s of passive charge make exactly one full meter (and it says "ready")', JSON.stringify({ p95: ch.passive95, full: ch.full }));
	A(near(ch.burst, 0.024) && near(ch.bucketLeft, 0) && near(ch.afterRefill, 0.032), 'kills: +0.004 each from a 0.024 bucket (10 at once give 0.024), refilling 0.008 a second', JSON.stringify(ch));
	A(near(ch.elite, 0.03) && near(ch.summoner, 0.03) && near(ch.alpha, 0.08) && near(ch.totem, 0.08) && near(ch.boss, 0.2) && ch.killEmpty === 0,
		'special kills: elite / summoner +0.03, alpha / totem +0.08, guardian / boss +0.2 (outside the bucket; an empty bucket gives plain kills nothing)', JSON.stringify(ch));
	A(near(ch.realKill, 0.004) && near(ch.realAlpha, 0.08), 'through the real enemy.ko seam: a dummy dying in the EnemyMgr step adds 0.004, an alpha 0.08', JSON.stringify({ k: ch.realKill, a: ch.realAlpha }));
	A(ch.lost > 0 && near(ch.hurt, ch.hurtWant, 1e-9) && ch.hurt > 0.05, `damage taken: 0.35 x damage / max HP through the real player.hurt seam (${ch.lost.toFixed(1)} lost -> +${ch.hurt.toFixed(4)})`, JSON.stringify(ch));
	A(ch.casting && ch.casting.cast && ch.casting.c0 === 0 && ch.casting.c1 === 0 && ch.casting.passive === 0 && ch.casting.alpha === 0 && ch.casting.kill === 0,
		'casting spends the meter, and nothing charges it while the cast lasts (passive, kills, alphas)', JSON.stringify(ch.casting));

	// ======================== 3. the cast: hit-stop, i-frames, damage, the inputs
	const cs = await E(page, () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player, K = U.K, out = {};
		H.wipe(); H.unsturdy(); pl.hp = pl.maxHp; pl.invuln = 0;
		const foes = H.ring(8, 130, 1e6);
		const hp0 = foes.reduce((a, e) => a + e.hp, 0);
		// not ready: Z does nothing
		U.debugCharge(0.5); H.key('KeyZ'); H.step(1); out.early = !!S.cast;
		U.debugCharge(1);
		const t0 = G.Game.time != null ? G.Game.time : null;
		const clk = () => G.Game.runTime ? G.Game.runTime() : (G.Replay && null);
		H.key('KeyZ'); H.step(1);
		out.cast = !!S.cast; out.code = S.cast && S.cast.head; out.c = S.c; out.zBase = G.ZMoves.busy;
		// the hit-stop: the world holds (the timeline clock doesn't move, foes don't move) for 0.32 s
		const e0 = foes.map(e => [e.x, e.y]);
		const tl0 = G.ExpClassic.run ? G.ExpClassic.run.t : null;
		const sum0 = JSON.stringify(G.Game.summary ? G.Game.summary() : {});
		H.step(8, 1 / 30);   // 0.27 s: still held
		out.holdLeft = S.cast.hold; out.fxDuringHold = !!S.cast.fx;
		out.heldTime = JSON.stringify(G.Game.summary ? G.Game.summary() : {}) === sum0;
		H.step(4, 1 / 30);   // past 0.32 s: the choreography starts
		out.fxAfterHold = !!S.cast.fx; out.n = S.n;
		// i-frames: a hit (and a hit after something zeroed invuln, as lava does) takes nothing while it lasts
		let dmgTaken = 0, steps = 0, castT = 0;
		while (S.cast && steps < 400) {
			const h = pl.hp; pl.invuln = steps % 7 === 0 ? 0 : pl.invuln; pl.hurt(40); dmgTaken += h - pl.hp;
			H.step(1, 1 / 30); steps++; castT += 1 / 30;
		}
		out.castT = castT; out.dmgDuring = dmgTaken; out.ended = !S.cast;
		// + 0.6 s after: still safe at 0.5 s, hurt again after it
		H.step(15, 1 / 30);
		const h1 = pl.hp; pl.invuln = 0; pl.hurt(40); out.after05 = h1 - pl.hp;
		H.step(4, 1 / 30);
		const h2 = pl.hp; pl.invuln = 0; pl.hurt(40); out.after07 = h2 - pl.hp;
		out.foeLost = hp0 - foes.reduce((a, e) => a + Math.max(0, e.hp), 0);
		out.dmgUnit = U.dmgOf(pl, 0); out.lv = pl.level; out.atk = pl.atk;
		pl.hp = pl.maxHp; H.sturdy();
		U.debugCharge(1); H.key('KeyR'); H.step(1); out.keyR = !!S.cast;
		for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30);
		out.casts = S.casts;
		H.wipe();
		return out;
	});
	A(cs.early === false && cs.cast && cs.c === 0 && cs.code === 1 && cs.zBase === false, 'not full: Z does nothing; full: Z casts the Ultimate (the meter spent; the base Z-move stays off in a zone)', JSON.stringify(cs));
	A(cs.holdLeft > 0 && !cs.fxDuringHold && cs.heldTime && cs.fxAfterHold && cs.n >= 1, 'a 0.32 s hit-stop: the run (its clock, kills, XP) holds, then the choreography starts', JSON.stringify(cs));
	A(cs.ended && cs.castT > 2.5 && cs.dmgDuring === 0, `i-frames for the whole cast (${cs.castT && cs.castT.toFixed(2)} s): no hit lands, even right after something zeroes invuln (as lava does)`, JSON.stringify(cs));
	A(cs.after05 === 0 && cs.after07 > 0, 'and for 0.6 s after it ends: a hit at 0.5 s takes nothing, one at 0.63 s lands', JSON.stringify({ a5: cs.after05, a7: cs.after07 }));
	A(cs.foeLost > cs.dmgUnit * 4 && cs.dmgUnit > 0, `the Ultimate hurts the foes round you (${Math.round(cs.foeLost)} HP; a unit hit is ${cs.dmgUnit && cs.dmgUnit.toFixed(1)} = 40 x (1 + 0.1 x Lv ${cs.lv}) x atk ${cs.atk && cs.atk.toFixed(2)} x 0.62)`, JSON.stringify(cs));
	// the pad's Z-move (L3), Y and RT buttons (a synthetic gamepad, real frames)
	const pd = await E(page, async () => {
		const wait = ms => new Promise(res => setTimeout(res, ms));
		const H = window.__t, U = G.ExpUlt, S = U.run, out = { casts: [] };
		H.thaw();
		window.__pads[0] = window.__mkPad(0, 'Synthetic Xbox Controller (STANDARD GAMEPAD)');
		for (let i = 0; i < 40 && !(G.Pad.ready && G.Pad.active); i++) { window.__btn(12, true); await wait(50); window.__btn(12, false); await wait(50); }
		await wait(150);
		const m = G.Pad.map(); out.map = m;
		for (const b of [m.zmove, m.reroll, 7]) {
			H.freeze(); H.wipe(); H.ring(3, 150, 1e6); U.debugCharge(1); H.thaw();
			window.__btn(b, true); await wait(90); window.__btn(b, false); await wait(60);
			out.casts.push(!!S.cast);
			H.freeze(); for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30); H.thaw();
		}
		window.__pads.length = 0; await wait(100);
		H.freeze(); H.wipe();
		return out;
	});
	A(pd.casts && JSON.stringify(pd.casts) === '[true,true,true]' && cs.keyR, 'the pad\'s Z-move (L3), Y and RT buttons cast it in a zone, and so does R', JSON.stringify({ pd, r: cs.keyR }));

	// ======================== 4. the cut-in shows
	const cut = await E(page, async () => {
		const H = window.__t, U = G.ExpUlt, pl = G.Game.player;
		H.wipe(); H.ring(8, 140, 1e6);
		U.debugCharge(1); U.tryCast(pl);
		const d0 = U.cutDrawn;
		H.thaw(); await new Promise(r => setTimeout(r, 250)); H.freeze();
		return { drawn: U.cutDrawn - d0, last: U.cutLast };
	});
	A(cut.drawn > 0 && cut.last && cut.last.head === 1 && cut.last.name === 'Furious Seed', 'the cut-in is drawn on the real canvas with the Ultimate\'s name (Bulbasaur, tier 0: "Furious Seed")', JSON.stringify(cut));
	if (SHOTS) await shoot(page, 'cutin_desktop.png', 120);
	await E(page, () => { const H = window.__t, S = G.ExpUlt.run; for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30); H.wipe(); });

	// ======================== 5. a type Ultimate per type
	const ty = await E(page, () => {
		const H = window.__t, U = G.ExpUlt, pl = G.Game.player, out = { types: [] };
		for (const t of G.ZMoves.ORDER) {
			H.wipe();
			const foes = H.ring(10, 150, 1e6), hp0 = foes.reduce((a, e) => a + e.hp, 0);
			const code = U.typeCode(t), fx = U.makeFx(pl, code, 0, false);
			let n = 0; while (!fx.done && n < 300) { fx.tick(1 / 30); G.ZMoves.updateWorld(1 / 30); n++; }
			for (let i = 0; i < 60; i++) G.ZMoves.updateWorld(1 / 30);   // (the fire wisps land)
			const lost = hp0 - foes.reduce((a, e) => a + Math.max(0, e.hp), 0);
			out.types.push({ t, code, type: fx.type, name: U.nameOf(code, 0), zname: G.ZMoves.DEF[t].name, dur: +fx.dur.toFixed(2), lost: Math.round(lost), unit: Math.round(fx.dmg) });
		}
		pl.x = 0; pl.y = 0;
		H.wipe();
		out.caterpie = U.codeFor(10, 10); out.bug = U.typeCode('bug'); out.butterfree = U.codeFor(10, 12); out.gengar = U.codeFor(92, 94);
		return out;
	});
	const tys = ty.types || [];
	A(tys.length === 18 && tys.every(x => x.type === x.t && x.code === 2000 + tys.indexOf(x) && x.name === x.zname), 'all 18 types have a type Ultimate: the Z-move\'s own choreography and name, codes 2000-2017', JSON.stringify(tys.map(x => [x.t, x.code, x.type])));
	A(tys.every(x => x.lost > 0 && x.unit > 0), 'each of the 18 hurts the foes round the caster', JSON.stringify(tys.map(x => [x.t, x.lost])));
	A(ty.caterpie === ty.bug && ty.butterfree === ty.bug && ty.gengar === 92, 'a member without a signature casts its form\'s first type\'s (Caterpie / Butterfree: bug); a signature member its own (Gastly\'s line)', JSON.stringify(ty));

	// a real cast as a non-signature member (Caterpie -> its bug type Ultimate), the screenshot of a type Ultimate going off
	const r10 = await startClassic(page, 10);
	const tc = await E(page, async () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player;
		H.wipe(); H.ring(12, 170, 1e6);
		U.debugCharge(1); H.key('KeyZ'); H.step(1);
		const out = { head: S.cast && S.cast.head, name: S.cast && U.nameOf(S.cast.head, S.cast.tier) };
		H.step(30, 1 / 30);
		out.fxType = S.cast && S.cast.fx && S.cast.fx.type;
		return out;
	});
	A(r10.ok && r10.dex === 10 && tc.head === 2011 && tc.fxType === 'bug' && tc.name === 'Plaga Devastadora', 'Caterpie casts the bug type Ultimate ("Plaga Devastadora", the Z-move\'s own choreography)', JSON.stringify({ r10, tc }));
	if (SHOTS) await shoot(page, 'type_ultimate_desktop.png', 350);
	await E(page, () => { const H = window.__t, S = G.ExpUlt.run; for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30); H.wipe(); });

	// ======================== 6. signature Ultimates by tier
	const r4 = await startClassic(page, 4);
	const sg = await E(page, () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player, LG = G.ExpLeague, out = {};
		out.codes = U.SIG_CODES.slice().sort((a, b) => a - b);
		out.names = U.SIG_CODES.map(c => [c, U.nameOf(c, 0), U.nameOf(c, 1), U.nameOf(c, 2), U.nameOf(c, 4)]);
		out.playable = U.SIG_CODES.filter(c => !!LG.BY[c]).length;
		out.types = U.SIG_CODES.map(c => [c, U.SIGS[c].type, (G.DEX_BY[c].types || []).includes(U.SIGS[c].type)]);
		const probe = () => { H.wipe(); const foes = H.ring(10, 150, 1e7), hp0 = foes.reduce((a, e) => a + e.hp, 0);
			const fx = U.makeFx(pl, S.code, S.tier, false); const ev = fx.ev.length, dur = fx.dur;
			let n = 0; while (!fx.done && n < 400) { fx.tick(1 / 30); G.ZMoves.updateWorld(1 / 30); n++; } for (let i = 0; i < 60; i++) G.ZMoves.updateWorld(1 / 30);
			const lost = hp0 - foes.reduce((a, e) => a + Math.max(0, e.hp), 0);
			pl.x = 0; pl.y = 0; return { form: pl.dex, tier: S.tier, code: S.code, name: U.nameOf(S.code, S.tier), ev, dur: +dur.toFixed(2), unit: +fx.dmg.toFixed(2), lost: Math.round(lost) }; };
		H.step(1);
		const t = [probe()];
		LG.evolve(pl, 5, 16); H.step(1); t.push(probe());
		LG.evolve(pl, 6, 36); H.step(1); t.push(probe());
		LG.run.mat = 1; H.step(1); t.push(probe());
		out.tiers = t;
		// Mew: 1 / 2 / 3 copies of the other 15, seeded by the world seed + the cast count
		S.casts = 7;
		out.mew = [U.copiesOf(1), U.copiesOf(2), U.copiesOf(3), U.copiesOf(3)];
		S.casts = 8; out.mew8 = U.copiesOf(3);
		const real = Math.random; let calls = 0; Math.random = function () { calls++; return real(); };
		U.copiesOf(3); Math.random = real; out.mewRandom = calls;
		H.wipe();
		return out;
	});
	A(sg.codes && sg.codes.length === 16 && JSON.stringify(sg.codes) === '[1,4,7,63,66,92,129,144,145,146,147,150,151,172,246,443]' && sg.playable === 16,
		'16 signature Ultimates, every one a built League member (the 3 Kanto starters, Pichu, Gastly, Magikarp, Dratini, the birds, Mewtwo, Mew, Abra, Machop, Larvitar, Gible)', JSON.stringify(sg.codes));
	A(sg.names && sg.names.every(([, a, b, c, d]) => a && b && c && a !== b && b !== c && c === d) && sg.types.every(x => x[2]), 'each has 3 names by tier (tier 2+ keeps the last) and one of its own types', JSON.stringify(sg.names));
	const [t0, t1, t2, t3] = sg.tiers || [];
	A(t0 && t0.form === 4 && t0.tier === 0 && t0.name === 'Brasa Rugiente' && t1.form === 5 && t1.tier === 1 && t1.name === 'Torbellino Ígneo' && t2.form === 6 && t2.tier === 2 && t2.name === 'Infierno Alado' && t3.tier === 3 && t3.name === 'Infierno Alado',
		'Charmander -> Charmeleon -> Charizard (+ Maturity): tiers 0 / 1 / 2 / 3 from the League row, the name by tier', JSON.stringify(sg.tiers));
	A(t0 && t1.ev > t0.ev && t2.ev > t1.ev && t2.dur >= t1.dur && t1.unit > t0.unit && t2.unit > t1.unit && t3.unit > t2.unit && near(t3.unit / t2.unit, (1 + 0.45) / (1 + 0.3), 0.005),
		'each tier adds beats and +15 % of the base damage (tier 3 / tier 2 = 1.45 / 1.30 at the same attack; an evolution brings its own attack too)', JSON.stringify(sg.tiers));
	A(t0 && t2.lost > t0.lost, 'and hurts more on the same foes', JSON.stringify((sg.tiers || []).map(x => x.lost)));
	const mew = sg.mew || [];
	A(mew.length === 4 && mew[0].length === 1 && mew[1].length === 2 && mew[2].length === 3 && JSON.stringify(mew[2]) === JSON.stringify(mew[3]) && mew.flat().every(c => c !== 151 && sg.codes.includes(c)) && new Set(mew[2]).size === 3 && sg.mewRandom === 0,
		'Mew\'s Metronome: 1 / 2 / 3 different copies of the other signatures by tier, from the run\'s seeded stream (the same cast count: the same copies; no Math.random)', JSON.stringify(sg.mew));

	// ======================== 7. the auto setting
	const au = await E(page, async () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player, Sv = G.ExpSave, out = {};
		out.def = U.auto();
		H.key('KeyU'); H.step(1); out.afterU = U.auto(); out.saved = [Sv.get('ult.auto.on'), Sv.get('ult.auto.off')];
		out.stored = (JSON.parse(localStorage.getItem('micasurvivorexp_save.guest') || '{}').counters || {})['ult.auto.on'] || 0;
		// on, full, no foe: waits
		H.wipe(); U.debugCharge(1); H.step(5); out.noFoe = !!S.cast;
		// a foe near: casts by itself
		H.dummy(pl.x + 200, pl.y, 1e6); H.step(1); out.withFoe = !!S.cast;
		for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30);
		// the row says auto (flag 2)
		out.flag = U.row()[4] & 2;
		// the pause screen's button
		G.Game.togglePause(); await new Promise(r => setTimeout(r, 50));
		const b = document.getElementById('pause-xult');
		out.pause = { shown: !!b && !b.classList.contains('hidden'), text: b && b.innerText };
		b.click(); out.afterClick = U.auto(); out.text2 = b.innerText;
		G.Game.togglePause();
		// a merge with another device that switched it on later
		const other = { v: 1, counters: { 'ult.auto.on': Sv.get('ult.auto.off') + 5 }, sets: {} };
		const m = Sv.merge(Sv.data, other);
		out.merged = m.counters['ult.auto.on'] > m.counters['ult.auto.off'];
		H.wipe();
		return out;
	});
	A(au.def === false && au.afterU === true && au.saved[0] > au.saved[1] && au.stored === au.saved[0], 'auto is off by default; U turns it on, written to the Expedition save (on > off, also in this browser\'s copy)', JSON.stringify(au));
	A(au.noFoe === false && au.withFoe === true && au.flag === 2, 'auto on: a full meter waits with no foe near, casts by itself when one comes (the row\'s auto flag)', JSON.stringify(au));
	A(au.pause && au.pause.shown && /Auto-Ultimate: On/.test(au.pause.text) && au.afterClick === false && /Auto-Ultimate: Off/.test(au.text2), 'the pause screen\'s "Auto-Ultimate: On" button switches it off (the pad\'s way to it)', JSON.stringify(au.pause));
	A(au.merged, 'two devices merge by max: the later switch wins');

	// ======================== 8. sync: the x block v6, fresh viewer pages
	const r1 = await startClassic(page, 1);
	const sy = await E(page, () => {
		const H = window.__t, U = G.ExpUlt, S = U.run, pl = G.Game.player, out = {};
		H.wipe(); H.ring(8, 140, 1e6);
		U.debugCharge(0.37);
		const idle = JSON.parse(JSON.stringify(G.Spectate.snap()));
		U.debugCharge(1); U.tryCast(pl); H.step(14, 1 / 30);   // past the hold: the first piece is on
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const m = { uid: 'bob', name: 'bob', connected: true, pl: G.Game.player };
		const had = Object.getOwnPropertyDescriptor(G.Net, 'uid');
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x, gf = G.Hooks.reduce('net.frame', { k: 'f' }, null).x;
		if (had) Object.defineProperty(G.Net, 'uid', had); else delete G.Net.uid;
		out.idle = idle; out.snap = snap; out.hf = hf && hf.w; out.gf = gf && gf.w; out.seed = G.World.seed;
		for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30);
		H.wipe();
		return out;
	});
	const wi = sy.idle && sy.idle.x && sy.idle.x.w, ws = sy.snap && sy.snap.x && sy.snap.x.w;
	A(sy.snap && sy.snap.x.xv === 8 && wi && JSON.stringify(wi.p) === '[37,' + wi.p[1] + ',1,0,0,1]' && ws && ws.p[4] === 1 && ws.p[1] === wi.p[1] + 1 && ws.p[2] === 1 && ws.p[5] === 1,
		'a live snapshot: x v6 with `w` {p: [charge %, pieces, piece, tier, flags, cast]}: 37 % idle; casting, the piece count up and the casting flag', JSON.stringify({ wi, ws }));
	A(sy.hf && sy.hf.q && sy.hf.q.alice && sy.hf.q.alice[4] === 1 && sy.gf && sy.gf.p && sy.gf.p[4] === 1, 'a co-op host frame carries the host\'s row by uid; a guest\'s own frame its own', JSON.stringify({ hf: sy.hf, gf: sy.gf }));
	const ov = await E(page, async () => {
		G.Game.quit(); await new Promise(r => setTimeout(r, 300));
		const S = G.ExpSave, e = G.Replay.last; if (e && e.ready) await e.ready;
		return { text: (document.getElementById('scr-over') || {}).innerText, casts: S.get('ult.casts'), best: S.get('ult.best'), sig: S.get('ult.sig'), code: e && e.code };
	});
	A(/Ultimates: 1 \(Furious Seed\)/.test(ov.text || '') && ov.casts >= 1 && ov.best >= 1 && ov.sig >= 1, 'the run-over screen: "Ultimates: 1 (Furious Seed)"; the Expedition save counts casts, best and signatures', JSON.stringify({ t: (ov.text || '').slice(0, 300), c: ov.casts, b: ov.best, s: ov.sig }));
	A(!!ov.code, 'the run\'s replay is kept');

	// ======================== 9. base modes untouched in the same page
	const bs = await E(page, async () => {
		const H = window.__t;
		H.thaw(); await G.Flow.play('normal'); H.freeze();
		const pl = G.Game.player; H.sturdy(); pl.level = 20;
		const out = { loaded: G.Expedition.loaded, mode: G.Game.mode, zone: G.World.zone, ult: !!G.ExpUlt.run, row: G.ExpUlt.row() };
		H.step(2);
		H.thaw(); await new Promise(r => setTimeout(r, 300)); H.freeze();
		out.rects = G.HUD.rects().map(r => r.name);
		out.zCan = G.ZMoves.can(pl);
		H.key('KeyZ'); H.step(1); out.zBusy = G.ZMoves.busy; out.ultAfter = !!G.ExpUlt.run;
		out.snapW = !!(G.Spectate.snap() || {}).x;
		G.Game.quit(); await new Promise(r => setTimeout(r, 200));
		return out;
	});
	A(bs.loaded && bs.mode === 'normal' && !bs.zone && !bs.ult && bs.row === null && bs.rects.includes('zmove') && !bs.rects.includes('ult') && bs.zCan && bs.zBusy && !bs.ultAfter && !bs.snapW,
		'a Normal run in the same page (Expedition code loaded): no zone, no Ultimate; the Z button is back and Z fires the base Z-move', JSON.stringify(bs));

	// fresh pages: a co-op guest, a live spectator, a replay viewer
	const d3 = await bootPage();
	const vw = await E(d3.page, async (rec) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
		G.Flow.play('normal');
		H.freeze();
		G.World.reset(rec.seed);
		const pl = G.Game.player;
		const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
		G.Coop.begin({ seed: rec.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 1 }, { uid: G.Net.uid, name: 'me', dex: 25 }] }, pl, cb);
		const xOf = row => Object.assign({}, rec.idle.x, { a: { q: {} }, l: { q: { alice: [1, 1, 1, 0, 0] } }, w: { q: { alice: row } } });
		const frame = (t, row) => ({ k: 'f', t, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [], x: xOf(row) });
		H.deliver('alice', frame(1, [100, 3, 1, 0, 0, 1]));
		for (let i = 0; i < 100 && !(G.Exp && G.World.zone && G.ExpUlt); i++) await wait(50);
		H.deliver('alice', frame(2, [100, 3, 1, 0, 0, 1]));
		const alice = G.Coop.mates.find(m => m.uid === 'alice');
		const g0 = G.ExpUlt.ghosts;
		H.deliver('alice', frame(3, [0, 4, 1, 0, 1, 1]));
		out.guest = { xw: alice && alice.pl.xw, ghosts: G.ExpUlt.ghosts - g0, cut: !!G.ExpUlt.vcut && G.ExpUlt.vcut.p === (alice && alice.pl), hp: alice && alice.pl.hp };
		// the ghost plays (rendered frames) and hurts nothing
		const enemies = [];
		H.thaw(); await wait(500); H.freeze();
		out.guest.cutDrawn = G.ExpUlt.cutDrawn;
		G.Coop.end(); G.Game.quit(); await wait(200);
		// a live spectator: an idle snapshot, then a casting one
		G.MicaAccount.name = () => 'viewer';
		let hs = null;
		G.Spectate.watch = (u, h) => { hs = h; h.snapshot(rec.idle, {}); };
		H.thaw();
		G.WatchUI.watchLive('host');
		for (let i = 0; i < 60 && !(G.WatchUI.player && G.World.zone && G.ExpUlt); i++) await wait(50);
		hs.snapshot(Object.assign({}, rec.idle, { t: rec.idle.t + 5 }), {});   // (a live view shows the snapshot BEFORE the newest)
		await wait(200);
		const s0 = G.ExpUlt.ghosts, c0 = G.ExpUlt.cutDrawn;
		out.specIdle = G.WatchUI.player && G.WatchUI.player.xw;
		hs.snapshot(rec.snap, {});
		hs.snapshot(Object.assign({}, rec.snap, { t: rec.snap.t + 5 }), {});
		await wait(60);
		out.spec = { xw: G.WatchUI.player && G.WatchUI.player.xw, ghosts: G.ExpUlt.ghosts - s0 };
		await wait(400);
		out.spec.cutDrawn = G.ExpUlt.cutDrawn - c0;
		out.spec.rects = G.HUD.rects().map(r => r.name);
		G.WatchUI.leave(); await wait(200);
		H.freeze();
		// a v5 block (no `w`) still loads: no Ultimate
		const old = Object.assign({}, rec.idle, { dv: 4, x: Object.assign({}, rec.idle.x, { xv: 5 }) });
		delete old.x.w;
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.Exp.viewAir(old, pup, null);
		out.old = { xw: pup.xw === undefined ? null : pup.xw, ok: G.Expedition.replayOk(4), notice: G.Expedition.viewNotice('exp-classic', 4), dv: G.Expedition.DV };
		// the replay viewer: the recording carries `w` and the `xu` event; playing across the cast shows it
		const rd = await G.Replay.open(rec.code);
		let withW = 0, castAt = -1;
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.w && s.x.w.p) { withW++; if (castAt < 0 && (s.x.w.p[4] & 1)) castAt = rd.times[i]; } }
		out.replay = { frames: rd.length, withW, castAt, xu: rd.ev.filter(e => e[1] === 'xu') };
		H.thaw();
		G.WatchUI.playReplay(rd, {});
		for (let i = 0; i < 60 && !G.WatchUI.player; i++) await wait(50);
		G.WatchUI.seek(Math.max(0, castAt - 1.2)); await wait(100);
		const rg0 = G.ExpUlt.cutDrawn; let maxG = 0;
		for (let i = 0; i < 40; i++) { await wait(50); maxG = Math.max(maxG, G.ExpUlt.ghosts); }
		out.replay.cutDrawn = G.ExpUlt.cutDrawn - rg0; out.replay.ghosts = maxG;
		G.WatchUI.leave();
		H.freeze();
		return out;
	}, { seed: sy.seed, idle: sy.idle, snap: sy.snap, code: ov.code });
	A(vw.loadedBefore === false && vw.guest && vw.guest.xw && vw.guest.xw[4] === 1 && vw.guest.ghosts === 1 && vw.guest.cut && vw.guest.cutDrawn > 0,
		'a co-op guest (a fresh page; host frames through G.Net) sees the host\'s cast: her puppet\'s row, the cut-in drawn, the piece as a ghost', JSON.stringify(vw.guest || vw));
	A(vw.specIdle && vw.specIdle[0] === 37 && vw.spec && vw.spec.xw && vw.spec.xw[4] === 1 && vw.spec.ghosts === 1 && vw.spec.cutDrawn > 0 && vw.spec.rects.includes('ult'),
		'a live spectator sees the watched player\'s meter (37 %), then the cast: the cut-in and the choreography', JSON.stringify({ i: vw.specIdle, s: vw.spec }));
	A(vw.old && vw.old.xw === null && vw.old.ok && !vw.old.notice && vw.old.dv === 7, 'a dv-4 / x v5 snapshot (no `w`) still loads with no notice: no Ultimate; this build is dv 7 (D8)', JSON.stringify(vw.old));
	A(vw.replay && vw.replay.withW > 0 && vw.replay.castAt >= 0 && vw.replay.xu.length === 1 && vw.replay.cutDrawn > 0 && vw.replay.ghosts >= 1,
		'a replay viewer: the recording carries `w` (frame field 8) and one `xu` event; playing across the cast shows the cut-in and the choreography', JSON.stringify(vw.replay));
	await d3.ctx.close();

	// ======================== 10. the phone (and desktop) layouts, the screenshots
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startClassic(d.page, 4);
		A(st.ok && st.on, `${tag}: Classic starts`, JSON.stringify(st));
		const lay = await E(d.page, async () => {
			const H = window.__t, U = G.ExpUlt, pl = G.Game.player;
			H.wipe(); U.debugCharge(0.62);
			H.thaw(); await new Promise(r => setTimeout(r, 400)); H.freeze();
			const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
			const ult = R.find(o => o.name === 'ult');
			const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
			const ar = U.autoRect;
			return { W: innerWidth, Hh: innerHeight, ult, hits: ult ? R.filter(o => o !== ult && hit(o, ult)).map(o => o.name) : null, names: R.map(o => o.name), touch: G.Touch.active,
				auto: ar ? { x: ar.x * k, y: ar.y * k, w: ar.w * k, h: ar.h * k } : null, k };
		});
		const inV = b => b && b.x >= -1 && b.x + b.w <= lay.W + 1 && b.y >= -1 && b.y + b.h <= lay.Hh + 1;
		A(lay.ult && inV(lay.ult) && lay.hits && lay.hits.length === 0 && !lay.names.includes('zmove') && lay.names.includes('hop') && lay.auto && inV(lay.auto),
			`${tag}: the Ultimate button (in the Z-move's place) and its AUTO chip are on screen (${lay.W}x${lay.Hh}) and overlap nothing (HOP, SLIDE, MAX, the minimap...)`, JSON.stringify(lay));
		if (tag === 'phone') A(lay.touch, 'phone: touch controls are on');
		// a tap / click on the AUTO chip toggles it; on the button casts
		if (lay.auto && lay.ult) {
			const a0 = await E(d.page, () => G.ExpUlt.auto());
			const tapAt = async (x, y) => { if (view && view.hasTouch) await d.page.touchscreen.tap(x, y); else await d.page.mouse.click(x, y); };
			await E(d.page, () => window.__t.thaw());
			await tapAt(lay.auto.x + lay.auto.w / 2, lay.auto.y + lay.auto.h / 2);
			await sleep(150);
			const a1 = await E(d.page, () => G.ExpUlt.auto());
			if (a1) { await tapAt(lay.auto.x + lay.auto.w / 2, lay.auto.y + lay.auto.h / 2); await sleep(150); }
			await E(d.page, () => { window.__t.freeze(); const H = window.__t, pl = G.Game.player; H.wipe(); H.ring(10, 160, 1e6); G.ExpUlt.debugCharge(1); });
			await E(d.page, () => window.__t.thaw());
			await sleep(100);
			await tapAt(lay.ult.x + lay.ult.w / 2, lay.ult.y + 6 + 32 * lay.k);
			await sleep(120);
			const tc2 = await E(d.page, () => { window.__t.freeze(); return { cast: !!G.ExpUlt.run.cast, auto: G.ExpUlt.auto() }; });
			A(a0 === false && a1 === true && tc2.cast, `${tag}: a ${view && view.hasTouch ? 'tap' : 'click'} on the AUTO chip switches auto on; one on the button casts`, JSON.stringify({ a0, a1, tc2 }));
			if (SHOTS) await shoot(d.page, `cutin_${tag}.png`, 140);
			await E(d.page, () => { const H = window.__t, S = G.ExpUlt.run; H.step(40, 1 / 30); });
			if (SHOTS) await shoot(d.page, `signature_ultimate_${tag}.png`, 250);
			await E(d.page, () => { const H = window.__t, S = G.ExpUlt.run; for (let i = 0; i < 400 && S.cast; i++) H.step(1, 1 / 30); H.wipe(); G.ExpUlt.debugCharge(0.62); });
			if (SHOTS) await shoot(d.page, `meter_${tag}.png`, 300);
		}
		// a type Ultimate going off (Caterpie: bug)
		if (SHOTS) {
			await startClassic(d.page, 10);
			await E(d.page, () => { const H = window.__t; H.wipe(); H.ring(12, 170, 1e6); G.ExpUlt.debugCharge(1); G.ExpUlt.tryCast(G.Game.player); H.step(36, 1 / 30); });
			await shoot(d.page, `type_ultimate_${tag}.png`, 350);
		}
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
