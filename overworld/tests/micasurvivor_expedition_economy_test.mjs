// micasurvivor_expedition_economy_test.mjs — MicaSurvivor DLC D7: economy and interactables (₽ from kills / rocks / Skip,
// paid / free / cursed Poké Balls, Meowth with market heat, Unown altars in 4 tiers + the comet, challenge / cursed / greed
// altars, Ditto, Hypno, gold rocks, berries, cages; the zone map's legend and the fog of war; first-run tips).
// micasurvivor/js/expedition/economy.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.7, 2.15 and the D7 row.
// A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   0. the server keeps the D7 counters (tips seen, ₽ earned...) merged by max, with no server change
//   1. Classic starts at dv 6; the zone's interactables come from the seed + its grids (the same on a rebuilt zone), on
//      flat open tiles, away from the start and the guardian's altar
//   2. ₽: 0.2 a KO x the gold stat, elites / alphas / bosses more, through the real enemy.ko seam; a level-up Skip pays ₽
//   3. Poké Balls: a paid one needs ₽ (18, then 18 x 1.22^0.65...), a pick of 3; free: 1 item; cursed: +5 % difficulty, a
//      ghost ambush, 1-2 items; rolls are seeded (no Math.random)
//   4. Meowth: comes and goes on his schedule with 3 items; buys past 2 + ⌊balls / 3⌋ heat the market (x1.15, x1.32...)
//   5. Unown altars (4 tiers: charge time, drain, offers / picks / lowest rarity, hordes, Golden sealed 90 s), the comet
//      (lands, burns out if ignored, a pick + Ultimate charge), challenge (a wave -> a Great Ball), cursed and greed altars
//   6. Ditto copies an item (never a capped one), Hypno makes you forget a vitamin (its stats undone, the slot free)
//   7. gold rocks (₽ x zone), berries (50 % heal, only when hurt), cages (20 + 10 x zone ₽, +50 % of a level's XP)
//   8. the fog of war (only explored tiles; interactables appear on the minimap once found) and the zone map's legend
//   9. tips: each kind's tip shows once, kept in the Expedition save
//  10. sync: the `x` block v7 `o` in snapshots and host frames; replay field 9 and the `xi` event; a fresh spectator page
//      sees the used / charging interactables and Meowth; a v6 block still loads; base modes untouched
//  11. the phone (844 x 390, touch) and desktop: the shop, a ball's choice, the map fit the screen; screenshots
//   node overworld/tests/micasurvivor_expedition_economy_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D7" count was taken. SHOTS=<dir> saves the screenshots.)
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
const PORT = 8861;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ======================== 0. the server keeps the D7 counters (two devices: the max of each)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-eco-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ip = 0;
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.3.' + (1 + ip++), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await call('register', { username: 'economytester', password: 'msurv-economy-pass-1' })).body.token;
	const devA = { v: 1, counters: { 'tip.ball': 1, 'eco.earned': 300, 'eco.balls': 4 }, sets: {} };
	const devB = { v: 1, counters: { 'tip.meowth': 1, 'eco.earned': 120, 'eco.best': 90, 'eco.freed': 1 }, sets: {} };
	await call('micasurvivor-exp-save-put', { save: devA, rev: 0 }, tok);
	const p2 = await call('micasurvivor-exp-save-put', { save: devB, rev: 0 }, tok);
	if (p2.status === 409) await call('micasurvivor-exp-save-put', { save: devB, rev: p2.body.rev }, tok);
	const c = ((await call('micasurvivor-exp-save-get', {}, tok)).body.save || {}).counters || {};
	A(p2.status === 409 && c['tip.ball'] === 1 && c['tip.meowth'] === 1 && c['eco.earned'] === 300 && c['eco.best'] === 90 && c['eco.freed'] === 1 && c['eco.balls'] === 4,
		'the server takes the D7 counters (tip.*, eco.*) with no server change; two devices merge by max (the tips both devices saw stay seen)', JSON.stringify(c));
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
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	try {
		localStorage.setItem('micasurvivor_dev', 'deco7');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	/** a sturdy test player: hurts are counted, not taken; XP pickups give nothing */
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.unsturdy = () => { const pl = G.Game.player; delete pl.hurt; delete pl.gainXp; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	/** every live enemy gone, without counting as kills */
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); };
	/** the zone's interactables of a kind */
	H.objs = kind => (G.ExpEco.layoutOf(G.World.zone) || { objs: [] }).objs.filter(o => !kind || o.kind === kind);
	/** the player onto world (x, y) (a teleport: its layer re-learnt, as the portal does) */
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null; pl.vx = 0; pl.vy = 0; G.Camera.x = x; G.Camera.y = y; };
	/** ... far from every interactable (a latch lets go) */
	H.away = () => { H.go(0, 0); H.step(2); };
	/** stand on o for `sec` seconds (steps of 1/30) */
	H.stand = (o, sec, dx = 0, dy = 0) => { H.go(o.x + dx, o.y + dy); H.step(Math.ceil(sec * 30)); };
	H.st = o => G.ExpEco.zone.st[o.i];
	H.key = code => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true })); };
	H.cards = () => [...document.querySelectorAll('#xeco-cards .card')].map(el => ({ nm: el.querySelector('.nm').innerText, cls: el.className, price: (el.querySelector('.xprice') || {}).innerText || '' }));
	/** pick card k on the open choice screen (past its accidental-pick guard) */
	H.choose = k => { const P = G.ExpEco.pick; if (P) P.at = -1e9; return G.ExpEco.choose(k); };
	H.items = () => Object.assign({}, G.Game.player.xi || {});
	H.nItems = () => Object.values(G.Game.player.xi || {}).reduce((a, n) => a + n, 0);
	H.xch = i => G.EnemyMgr.all().filter(e => !e.dead && e.xch === i + 1).length;
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
	/** start Classic (Bulbasaur), freeze the frames, a sturdy player, no foes */
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
		const Ec = G.ExpEco;
		return { ok, state: G.Game.state, mode: G.Game.mode, dv: G.Modes.run.dv, on: !!(Ec && Ec.run), seed: G.World.seed, coins: G.Game.player.coins };
	});

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const r0 = await startClassic(page);
	A(r0.ok && r0.mode === 'exp-classic' && r0.dv === 19 && r0.on && r0.coins === 0, 'Classic starts with the economy on and 0 ₽; the content version is 19 (D20)', JSON.stringify(r0));
	if (!r0.ok || !r0.on) throw new Error('no economy: the rest needs it');

	// ======================== 1. the layout
	const ly = await E(page, () => {
		const Ec = G.ExpEco, z = G.World.zone, lay = Ec.layoutOf(z), out = { n: lay.objs.length, kinds: {} };
		for (const o of lay.objs) out.kinds[o.kind] = (out.kinds[o.kind] || 0) + 1;
		// the same from a rebuilt zone (a viewer's): pure
		const z2 = G.ExpClassic.build(z.seed, z.map, z.zone);
		const lay2 = Ec.layoutOf(z2);
		out.same = JSON.stringify(lay2.objs) === JSON.stringify(lay.objs) && JSON.stringify(lay2.visits) === JSON.stringify(lay.visits) && lay2.cometAt === lay.cometAt;
		// another seed: another layout
		const z3 = G.ExpClassic.build(z.seed + 1, z.map, z.zone);
		out.other = JSON.stringify(Ec.layoutOf(z3).objs.map(o => [o.tx, o.ty])) !== JSON.stringify(lay.objs.map(o => [o.tx, o.ty]));
		// every one on open floor at one height, away from the start and the guardian's altar, none too close to another
		const si = G.ExpClassic.sitesOf(z).altar;
		out.bad = lay.objs.filter(o => z.terr(o.tx, o.ty) !== 0 || z.propAt(o.tx, o.ty) || z.rampDir(o.tx, o.ty) || Math.hypot(o.tx, o.ty) < 9 || Math.hypot(o.tx - si[0], o.ty - si[1]) < 7).map(o => o.kind);
		let minGap = 99;
		for (const a of lay.objs) for (const b of lay.objs) if (a !== b) minGap = Math.min(minGap, Math.hypot(a.tx - b.tx, a.ty - b.ty));
		out.minGap = minGap;
		out.rocks = lay.objs.filter(o => o.kind === 'rock').map(o => o.v);
		out.cages = lay.objs.filter(o => o.kind === 'cage').map(o => o.v);
		out.visits = lay.visits.slice(0, 3); out.cometAt = lay.cometAt;
		// zone 4 (the shrine): none
		out.shrine = Ec.layoutOf(G.ExpClassic.build(z.seed, z.map, 4));
		// no Math.random in the layout
		const mr = Math.random; let draws = 0; Math.random = () => { draws++; return mr(); };
		Ec.layoutOf(G.ExpClassic.build(z.seed + 7, z.map, 2)); Math.random = mr;
		out.draws = draws;
		return out;
	});
	const KN = { unown4: 1, unown3: 1, unown2: 1, unown1: 2, challenge: 1, cursedaltar: 1, greed: 1, comet: 1, meowth: 3, ball: 6, freeball: 2, cursedball: 2, ditto: 1, hypno: 1, cage: 2, rock: 8, berry: 8, slots: 1 };   // (D15: + the slot machine)
	A(ly.n === 43 && Object.keys(KN).every(k => ly.kinds[k] === KN[k]), 'zone 1 holds 43 interactables: 6 paid / 2 free / 2 cursed balls, 3 Meowth stalls, Unown altars 2 / 1 / 1 / 1, comet, challenge, cursed, greed, Ditto, Hypno, 2 cages, 8 rocks, 8 berries, a slot machine (D15)', JSON.stringify(ly.kinds));
	A(ly.same && ly.other && ly.draws === 0, 'the layout is pure: a rebuilt zone (a viewer\'s) places the same ones, with the same Meowth visits and comet; another seed, another layout; no Math.random', JSON.stringify({ same: ly.same, other: ly.other, draws: ly.draws }));
	A(ly.bad.length === 0 && ly.minGap >= 4, 'every one on open floor (no cliff, ramp, prop), 9+ tiles from the start, 7+ from the guardian\'s altar, 4+ tiles apart', JSON.stringify({ bad: ly.bad, gap: ly.minGap }));
	A(ly.rocks.every(v => v >= 6 && v <= 14) && ly.cages.every(d => d > 0) && ly.visits.length >= 3 && ly.visits[0].at >= 50 && ly.visits[0].at <= 70 && ly.visits[0].until - ly.visits[0].at === 70 && ly.visits[1].at - ly.visits[0].at >= 130 && ly.cometAt >= 150 && ly.cometAt <= 300 && ly.shrine === null,
		'rocks hold 6-14 ₽ (x zone), cages a Pokémon of the map; Meowth first visits at 0:50-1:10 for 70 s, then every 2:30; the comet lands at 2:30-5:00; the shrine has none', JSON.stringify({ r: ly.rocks, v: ly.visits, c: ly.cometAt }));

	// ======================== 2. ₽
	const mo = await E(page, () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, out = {};
		pl.coins = 0; Ec.run.frac = 0;
		for (let i = 0; i < 10; i++) Ec.onKill({ dex: 16 }, pl);
		out.ten = pl.coins;
		Ec.onKill({ xk: 'elite' }, pl); out.elite = pl.coins - out.ten;
		const a0 = pl.coins; Ec.onKill({ xk: 'alpha' }, pl); out.alpha = pl.coins - a0;
		const b0 = pl.coins; Ec.onKill({ boss: true, xk: 'guardian' }, pl); out.boss = pl.coins - b0;
		// through the real enemy.ko seam: 5 dummies dying in the EnemyMgr step
		pl.coins = 0; Ec.run.frac = 0;
		for (let i = 0; i < 5; i++) { const e = new G.Enemy({ dex: 16, name: 'Pidgey', behavior: 'chaser', hp: 1, spd: 0, dmg: 0, xp: 0 }, pl.x + 300 + i * 30, pl.y, { hp: 10, dmg: 0, spd: 0 }); G.EnemyMgr.add(e); e.dead = true; e.fade = 0; }
		H.step(1);
		out.real = pl.coins; out.frac = Ec.run.frac;
		// the gold stat: Amulet Coin x2 (+30 %)
		G.ExpItems.takeItem(pl, 'amuletcoin'); G.ExpItems.takeItem(pl, 'amuletcoin');
		pl.coins = 0; Ec.run.frac = 0;
		for (let i = 0; i < 100; i++) Ec.onKill({ dex: 16 }, pl);
		out.gold = pl.coins;
		delete pl.xi.amuletcoin; G.ExpItems.apply(pl);
		// a level-up's Skip pays ₽ (10 x zone)
		G.Game.debugLevelUp();
		for (let i = 0; i < 3 && !G.UI.isOpen('scr-levelup'); i++) H.step(1);
		const c0 = pl.coins, e0 = Ec.run.earned;
		document.getElementById('lvl-skip').click();
		H.step(1);
		out.skip = { closed: !G.UI.isOpen('scr-levelup'), got: pl.coins - c0, earned: Ec.run.earned - e0, banner: (G.Spawner.banner && G.Spawner.banner.text) || null };
		out.hud = G.ExpClassic.hudLine(pl);
		return out;
	});
	A(mo.ten === 2 && mo.elite === 1 && mo.alpha === 5 && mo.boss === 20, '₽ a KO: 0.2 (10 kills = 2 ₽), an elite 1, an alpha 5, a guardian 20 x zone', JSON.stringify(mo));
	A(mo.real === 1 && near(mo.frac, 0, 1e-9), 'through the real enemy.ko seam: 5 kills in the EnemyMgr step = 1 ₽ (the run\'s coins)', JSON.stringify(mo));
	A(mo.gold === 26, 'the gold stat multiplies it: Amulet Coin x2 (+30 %) makes 100 kills 26 ₽', JSON.stringify(mo));
	A(mo.skip.closed && mo.skip.got === 10 && mo.skip.earned === 10 && / ₽ \d+/.test(mo.hud), 'a level-up Skip pays 10 x zone ₽ (counted as earned); the zone line shows the run\'s ₽', JSON.stringify(mo.skip) + ' ' + mo.hud);

	// ======================== 3. Poké Balls
	const bl = await E(page, () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, out = {};
		const [b1, b2] = H.objs('ball'), fb = H.objs('freeball')[0], cb = H.objs('cursedball')[0];
		pl.coins = 0;
		// a paid ball with no ₽: nothing opens
		H.stand(b1, 0.7);
		out.poor = { st: H.st(b1), pick: !!Ec.pick, coins: pl.coins };
		// with ₽ (after stepping away: the latch)
		H.away(); pl.coins = 100;
		H.stand(b1, 0.7);
		const mr = Math.random; let draws = 0; Math.random = () => { draws++; return mr(); };
		Ec.rollOffers(pl, G.DLC.rng(7), 4, 0); Ec.rollOffers(pl, G.DLC.rng(8), 3, 2);   // (the rolls: seeded streams only)
		Math.random = mr;
		out.paid = { st: H.st(b1), pick: Ec.pick && { kind: Ec.pick.kind, n: Ec.pick.ids.length, picks: Ec.pick.picks }, coins: pl.coins, state: G.Game.state, cards: H.cards(), draws };
		const n0 = H.nItems(), id = Ec.pick && Ec.pick.ids[1];
		out.guard = G.ExpEco.choose(1);   // (too soon after it opened: ignored)
		out.chose = H.choose(1);
		out.after = { n: H.nItems() - n0, got: id && pl.xi[id], state: G.Game.state, open: !!Ec.pick, shown: !document.getElementById('scr-xeco').classList.contains('hidden') };
		// the price climbs: 18, then 18 x 1.22^0.65, ...; luck takes up to 25 % off
		out.costs = [0, 1, 2, 3, 5, 10].map(n => Ec.ballCost(n));
		out.luck = [Ec.ballCost(0, 40), Ec.ballCost(0, 100), Ec.ballCost(0, 300)];
		H.away();
		H.stand(b2, 0.7);
		out.second = { coins: pl.coins, open: !!Ec.pick };
		if (Ec.pick) H.choose(0);
		// a free ball: one item, no choice, no ₽
		H.away();
		const n1 = H.nItems(), c1 = Ec.run.spent;
		H.stand(fb, 0.7);
		out.free = { st: H.st(fb), items: H.nItems() - n1, coins: Ec.run.spent - c1, open: !!Ec.pick };   // (₽ spent: a kill meanwhile may earn some)
		// a cursed ball: +5 % difficulty, a ghost ambush of 4 + 2 x zone, 1-2 items
		H.away(); H.wipe();
		const n2 = H.nItems(), d0 = Ec.mods().diff;
		H.stand(cb, 0.7);
		const ghosts = G.EnemyMgr.all().filter(e => e.xch === cb.i + 1);
		out.cursed = { st: H.st(cb), items: H.nItems() - n2, diff: Ec.mods().diff - d0, ghosts: Ec.run.hordes.filter(h => h[0] === cb.i).reduce((a, h) => a + h[1], 0), dex: [...new Set(ghosts.map(e => e.dex))], open: !!Ec.pick };
		// a foe born now is +5 % tougher than one without the curse
		const e1 = G.ExpClassic.spawnFoe(16, pl.x + 400, pl.y); const hp1 = e1.maxHp;
		Ec.run.mods.diff -= 0.05; const e2 = G.ExpClassic.spawnFoe(16, pl.x + 400, pl.y); const hp2 = e2.maxHp; Ec.run.mods.diff += 0.05;
		out.cursed.hpK = hp1 / hp2;
		H.wipe(); H.away();
		out.opened = Ec.run.opened; out.bought = Ec.run.balls;
		// the same seed, the same item offers (seeded streams): roll again from a fresh stream
		const r1 = Ec.rollOffers(pl, G.DLC.rng(99), 3, 0), r2 = Ec.rollOffers(pl, G.DLC.rng(99), 3, 0);
		out.seeded = JSON.stringify(r1) === JSON.stringify(r2) && new Set(r1).size === 3;
		out.minRar = Ec.rollOffers(pl, G.DLC.rng(5), 4, 3).map(i => G.ExpItems.IT[i].rar);
		return out;
	});
	A(bl.poor && bl.poor.st === 0 && !bl.poor.pick && bl.poor.coins === 0, 'a paid ball with 0 ₽ doesn\'t open', JSON.stringify(bl.poor));
	A(bl.paid && bl.paid.st === 1 && bl.paid.pick && bl.paid.pick.kind === 'ball' && bl.paid.pick.n === 3 && bl.paid.coins === 82 && bl.paid.state === 'choice' && bl.paid.cards.length === 3 && bl.paid.draws === 0,
		'with ₽: standing on it opens it for 18 ₽ and pauses on a pick of 3 items (rolled with no Math.random)', JSON.stringify(bl.paid));
	A(bl.guard === false && bl.chose && bl.after.n === 1 && bl.after.got >= 1 && bl.after.state === 'playing' && !bl.after.open && !bl.after.shown, 'a pick right after it opens is ignored (the A that walked you in); then the picked item stacks and the run goes on', JSON.stringify(bl.after));
	A(JSON.stringify(bl.costs) === '[18,20,23,27,34,66]' && JSON.stringify(bl.luck) === '[16,14,14]', 'the price after n balls: 18 x 1.22^(0.65 n) = 18, 20, 23, 27, 34, 66; luck 40 / 100 takes 10 / 25 % off (never more)', JSON.stringify({ c: bl.costs, l: bl.luck }));
	A(bl.second && bl.second.coins === 62 && bl.second.open, 'the second paid ball costs 20 ₽', JSON.stringify(bl.second));
	A(bl.free && bl.free.st === 1 && bl.free.items === 1 && bl.free.coins === 0 && !bl.free.open, 'a free ball: one item at once, no ₽, no choice', JSON.stringify(bl.free));
	A(bl.cursed && bl.cursed.st === 1 && bl.cursed.items >= 1 && bl.cursed.items <= 2 && near(bl.cursed.diff, 0.05) && bl.cursed.ghosts === 6 && bl.cursed.dex.every(d => [92, 93, 200, 355, 425, 562].includes(d)) && near(bl.cursed.hpK, 1.05, 0.02) && !bl.cursed.open,
		'a cursed ball: free, +5 % difficulty (new foes +5 % HP), a ghost ambush of 4 + 2 x zone = 6, 1-2 items at once', JSON.stringify(bl.cursed));
	A(bl.opened === 4 && bl.bought === 2 && bl.seeded && bl.minRar.every(r => r >= 3), 'the run counts 4 balls opened (2 bought); offers are seeded and distinct, and respect a lowest rarity', JSON.stringify(bl));

	// ======================== 4. Meowth and market heat
	const mw = await E(page, () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, lay = Ec.layoutOf(G.World.zone), out = {};
		const v0 = lay.visits[0];
		G.ExpClassic.debugZoneTime(v0.at - 1); H.step(2);
		out.before = Ec.zone.spot;
		G.ExpClassic.debugZoneTime(v0.at + 0.5); H.step(1);
		out.in = { spot: Ec.zone.spot, want: v0.spot, stock: (Ec.zone.stock || []).slice() };
		// the pure prices: list price by rarity x (1 + 0.3 per zone), heat x1.15, x1.32, ... (x2 at most a step)
		out.list = [0, 1, 2, 3, 4].map(r => Ec.price(r, 1, 0)); out.z2 = Ec.price(0, 2, 0);
		out.heat = [0, 1, 2, 3, 8].map(h => +Ec.heatMul(h).toFixed(4));
		out.allow = [0, 2, 3, 6, 9].map(Ec.allowance);
		// walk up to him: the shop opens
		pl.coins = 1000; Ec.run.opened = 0; Ec.run.buys = 0;
		const sp = lay.objs[v0.spot];
		H.stand(sp, 0.3, 0, 10);
		out.open = { kind: Ec.pick && Ec.pick.kind, state: G.Game.state, cards: H.cards(), sub: document.getElementById('xeco-sub').innerText, leave: !document.getElementById('xeco-close').classList.contains('hidden') };
		const p0 = Ec.shopPrices(Ec.zone.stock);
		H.choose(0); const p1 = Ec.shopPrices(Ec.zone.stock);
		H.choose(1); const p2 = Ec.shopPrices(Ec.zone.stock);
		out.after2 = { coins: 1000 - pl.coins, paid: p0[0] + p1[1], sold: Ec.zone.sold, heat: G.ExpEco.heatOf(Ec.run.buys, Ec.run.opened) };
		out.p = [p0, p1, p2];
		out.soldCard = H.cards()[0];
		out.again = H.choose(0);   // (sold: nothing)
		// the third buy: past the allowance of 2 -> heat 1, then prices x1.15
		const c3 = pl.coins; H.choose(2); out.third = { paid: c3 - pl.coins, heatNow: Ec.heatOf(Ec.run.buys, Ec.run.opened), sub: document.getElementById('xeco-sub').innerText };
		// opening balls cools it: 3 balls opened -> allowance 3 -> heat 0
		Ec.run.opened = 3; out.cool = Ec.heatOf(Ec.run.buys, Ec.run.opened);
		// can't afford: refused
		Ec.run.opened = 0; Ec.run.buys = 9;
		document.getElementById('xeco-close').click();
		out.closed = { state: G.Game.state, open: !!Ec.pick };
		// a fresh stock on his next visit, and he leaves
		const v1 = lay.visits[1];
		H.away();
		G.ExpClassic.debugZoneTime(v0.until + 1); H.step(1);
		out.left = Ec.zone.spot;
		G.ExpClassic.debugZoneTime(v1.at + 0.5); H.step(1);
		out.next = { spot: Ec.zone.spot, want: v1.spot, stock: (Ec.zone.stock || []).slice(), sold: Ec.zone.sold };
		H.wipe();
		return out;
	});
	A(mw.before === -1 && mw.in.spot === mw.in.want && mw.in.stock.length === 3, 'Meowth isn\'t in before his visit; at its time he opens at his stall with 3 items', JSON.stringify(mw));
	A(JSON.stringify(mw.list) === '[30,55,95,160,260]' && mw.z2 === 39 && JSON.stringify(mw.heat) === '[1,1.15,1.518,2.2618,54.9677]' && JSON.stringify(mw.allow) === '[2,2,3,4,5]',
		'the price table: 30 / 55 / 95 / 160 / 260 ₽ by rarity, +30 % a zone; heat x1.15, x1.32 ... (x2 at most per buy); the free buys 2 + ⌊balls / 3⌋', JSON.stringify({ l: mw.list, h: mw.heat, a: mw.allow }));
	A(mw.open.kind === 'shop' && mw.open.state === 'choice' && mw.open.cards.length === 3 && mw.open.cards.every(c => /Buy · \d+ ₽/.test(c.price)) && /You have 1000 ₽/.test(mw.open.sub) && mw.open.leave,
		'walking up to him opens the shop (paused): 3 cards with "Buy · N ₽", "You have 1000 ₽", a Leave button', JSON.stringify(mw.open));
	A(mw.after2.paid === mw.after2.coins && mw.after2.sold === 3 && mw.after2.heat === 0 && JSON.stringify(mw.p[0]) === JSON.stringify(mw.p[2]) && /Sold/.test(mw.soldCard.price) && mw.again === false,
		'the first 2 buys are at list price (no heat); a sold card says "Sold" and can\'t be bought again', JSON.stringify({ a: mw.after2, p: mw.p, s: mw.soldCard }));
	A(mw.third.paid === mw.p[2][2] && mw.third.heatNow === 1 && /Market heat ×1\.15/.test(mw.third.sub) && mw.cool === 0, 'the third buy heats the market (heat 1: x1.15 from then on, shown); opening 3 balls cools it again', JSON.stringify(mw.third));
	A(mw.closed.state === 'playing' && !mw.closed.open && mw.left === -1 && mw.next.spot === mw.next.want && mw.next.stock.length === 3 && mw.next.sold === 0, 'Leave closes the shop; he packs up after 70 s and comes back on his next visit with a fresh stock', JSON.stringify({ c: mw.closed, l: mw.left, n: mw.next }));

	// ======================== 5. altars and the comet
	const al = await E(page, () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, out = { tiers: [] };
		G.ExpClassic.debugZoneTime(20); H.step(1); H.wipe();
		for (let t = 1; t <= 4; t++) {
			const o = H.objs('unown' + t)[0], T = Ec.K.UNOWN_T[t - 1], row = { t, T };
			H.away();
			if (t === 4) {   // sealed for the first 90 s
				G.ExpClassic.debugZoneTime(40); H.step(1);
				H.stand(o, 2); row.sealed = Ec.zone.ch[o.i];
				H.away(); G.ExpClassic.debugZoneTime(95); H.step(1); H.wipe();
			}
			H.go(o.x, o.y); H.wipe();
			H.step(60);   // 2 s inside
			row.c2 = Ec.zone.ch[o.i]; row.st = H.st(o);
			row.horde = Ec.run.hordes.filter(h => h[0] === o.i).reduce((a, h) => a + h[1], 0);   // (spawned: a strong build kills some at once)
			H.go(0, 0); H.step(30);   // 1 s outside (at the start, clear of everything): it drains at half speed
			row.c3 = Ec.zone.ch[o.i];
			H.go(o.x, o.y); Ec.zone.ch[o.i] = 0.999; H.step(2);
			row.pick = Ec.pick && { n: Ec.pick.ids.length, picks: Ec.pick.picks, rar: Ec.pick.ids.map(i => G.ExpItems.IT[i].rar), title: document.getElementById('xeco-h').innerText };
			row.done = H.st(o);
			const n0 = H.nItems();
			if (Ec.pick) { H.choose(0); if (Ec.pick) H.choose(1); }
			row.got = H.nItems() - n0;
			out.tiers.push(row);
			H.wipe();
		}
		// the comet: hidden until it lands, burns out if ignored
		const cm = H.objs('comet')[0], lay = Ec.layoutOf(G.World.zone);
		H.away(); Ec.zone.st[cm.i] = 0;   // (an earlier jump of the zone clock may have landed it already)
		G.ExpClassic.debugZoneTime(lay.cometAt - 2); H.step(2); out.cometBefore = H.st(cm);
		G.ExpClassic.debugZoneTime(lay.cometAt + 0.5); H.step(1); out.cometLanded = H.st(cm);
		G.ExpClassic.debugZoneTime(lay.cometAt + Ec.K.COMET_LIFE + 1); H.step(1); out.cometGone = H.st(cm); H.wipe();
		// (the same comet charged in time, on the zone's next state: zone state reset by hand for the test)
		Ec.zone.st[cm.i] = Ec.READY; G.ExpClassic.debugZoneTime(lay.cometAt + 1);
		const U = G.ExpUlt;
		H.go(cm.x, cm.y); H.step(30); out.cometC1 = Ec.zone.ch[cm.i];
		H.step(Math.ceil(8.85 * 30)); U.run.c = 0.1; H.step(8);
		out.comet = { st: H.st(cm), pick: Ec.pick && { n: Ec.pick.ids.length, rar: Ec.pick.ids.map(i => G.ExpItems.IT[i].rar) }, ult: U.run.c };
		if (Ec.pick) H.choose(0);
		H.wipe(); H.away();
		// challenge: stand 2 s -> a wave of 10 + 4 x zone; beat it -> a Great Ball (pick 1 of 3, Uncommon+)
		const ch = H.objs('challenge')[0];
		H.stand(ch, 2.2);
		out.chal = { st: H.st(ch), wave: Ec.run.hordes.filter(h => h[0] === ch.i).reduce((a, h) => a + h[1], 0) };
		const one = G.EnemyMgr.all().find(e => e.xch === ch.i + 1);
		out.chal.hpK = one ? one.maxHp / G.ExpClassic.spawnFoe(one.dex, pl.x + 500, pl.y).maxHp : 0;
		for (const e of G.EnemyMgr.all()) if (e.xch === ch.i + 1) { e.dead = true; e.fade = 0; }
		H.away(); H.step(2);
		out.chal.ready = H.st(ch);
		H.stand(ch, 0.7);
		out.chal.pick = Ec.pick && { n: Ec.pick.ids.length, rar: Ec.pick.ids.map(i => G.ExpItems.IT[i].rar), title: document.getElementById('xeco-h').innerText };
		if (Ec.pick) H.choose(0);
		out.chal.done = H.st(ch);
		H.wipe(); H.away();
		// cursed altar: a Rare+ item, +8 % difficulty, +15 % spawns
		const ca = H.objs('cursedaltar')[0], m0 = Object.assign({}, Ec.mods()), it0 = H.items();
		H.stand(ca, 1.8);
		const it1 = H.items(), newIds = Object.keys(it1).filter(k => (it1[k] || 0) > (it0[k] || 0));
		out.cursed = { st: H.st(ca), diff: +(Ec.mods().diff - m0.diff).toFixed(3), rate: +(Ec.mods().rate - m0.rate).toFixed(3), rar: newIds.map(i => G.ExpItems.IT[i].rar) };
		H.away();
		// greed: +10 % difficulty, +15 % XP, +25 % ₽, one more card per ball
		const gr = H.objs('greed')[0];
		H.stand(gr, 1.8);
		out.greed = { st: H.st(gr), m: Object.assign({}, Ec.mods()) };
		pl.coins = 0; Ec.run.frac = 0;
		for (let i = 0; i < 100; i++) Ec.onKill({ dex: 16 }, pl);
		out.greed.ko100 = pl.coins; out.greed.want = Math.floor(100 * 0.2 * (1 + G.ExpItems.total(pl, 'coin')) * 1.25 + 1e-6);
		const e3 = G.ExpClassic.spawnFoe(16, pl.x + 400, pl.y); out.greed.xp = e3.xp; Ec.run.mods.xp = 0; out.greed.xp0 = G.ExpClassic.spawnFoe(16, pl.x + 400, pl.y).xp; Ec.run.mods.xp = 0.15;
		H.away(); pl.coins = 500;
		const b3 = H.objs('ball')[2]; H.stand(b3, 0.7);
		out.greed.ballCards = Ec.pick ? Ec.pick.ids.length : 0;
		if (Ec.pick) H.choose(0);
		H.wipe(); H.away();
		return out;
	});
	const tr = al.tiers;
	A(tr.length === 4 && tr.map(r => r.T).join() === '8,14,22,35' && tr.every(r => near(r.c2, 2 / r.T, 0.02) && r.st === 2), 'Unown altars charge in 8 / 14 / 22 / 35 s by tier (2 s inside: 2 / T)', JSON.stringify(tr.map(r => [r.T, r.c2, r.st])));
	A(tr.every(r => near(r.c3, 2 / r.T - 0.5 / r.T, 0.02)), 'leaving drains it at half speed', JSON.stringify(tr.map(r => [r.c2, r.c3])));
	A(tr[0].pick && tr[0].pick.n === 3 && tr[0].pick.picks === 1 && tr[1].pick.n === 3 && tr[1].pick.rar.every(x => x >= 1) && tr[2].pick.n === 4 && tr[2].pick.rar.every(x => x >= 2) && tr[3].pick.n === 4 && tr[3].pick.picks === 2 && tr[3].pick.rar.every(x => x >= 3) && /Golden blessing!/.test(tr[3].pick.title),
		'full, each tier\'s blessing: 1 of 3 (Common+), 1 of 3 (Uncommon+), 1 of 4 (Rare+), 2 of 4 (Epic+, "Golden blessing!")', JSON.stringify(tr.map(r => r.pick)));
	A(tr.every(r => r.done === 1) && tr[0].got === 1 && tr[3].got === 2, 'a used altar stays used; the Golden one gives 2 items', JSON.stringify(tr.map(r => [r.done, r.got])));
	A(tr[0].horde === 0 && tr[1].horde === 0 && tr[2].horde === 8 && tr[3].horde === 12 && tr[3].sealed === 0, 'Epic and Golden call a horde while charging (6 + 2 x zone, +4 Golden); Golden stays sealed for the first 90 s', JSON.stringify(tr.map(r => [r.horde, r.sealed])));
	A(al.cometBefore === 0 && al.cometLanded === 4 && al.cometGone === 3, 'the comet: hidden until it lands, burns out 45 s later if nobody charges it', JSON.stringify(al));
	A(near(al.cometC1, 0.1, 0.01) && al.comet.st === 1 && al.comet.pick && al.comet.pick.n === 3 && al.comet.pick.rar.every(x => x >= 1) && near(al.comet.ult, 0.35, 0.02),
		'charged in 10 s: a pick of 3 (Uncommon+) and +25 % Ultimate charge', JSON.stringify({ c1: al.cometC1, c: al.comet }));
	A(al.chal.st === 2 && al.chal.wave === 14 && near(al.chal.hpK, 1.5, 0.05) && al.chal.ready === 4 && al.chal.pick && al.chal.pick.n === 3 && al.chal.pick.rar.every(x => x >= 1) && /Great Ball/.test(al.chal.pick.title) && al.chal.done === 1,
		'the challenge altar: a wave of 10 + 4 x zone at x1.5 HP; beaten, a Great Ball (pick 1 of 3, Uncommon+)', JSON.stringify(al.chal));
	A(al.cursed.st === 1 && al.cursed.diff === 0.08 && al.cursed.rate === 0.15 && al.cursed.rar.length === 1 && al.cursed.rar[0] >= 2, 'the cursed altar: a Rare+ item for +8 % difficulty and +15 % spawns', JSON.stringify(al.cursed));
	A(al.greed.st === 1 && near(al.greed.m.xp, 0.15) && near(al.greed.m.money, 0.25) && al.greed.m.loot === 1 && Math.abs(al.greed.ko100 - al.greed.want) <= 1 && al.greed.want >= 25 && al.greed.xp > al.greed.xp0 && al.greed.ballCards === 4,
		'Gengar\'s greed: +10 % difficulty, +15 % XP (new foes give more), +25 % ₽ (100 kills = 25), balls offer 4 cards', JSON.stringify(al.greed));

	// ======================== 6. Ditto and Hypno; 7. rocks, berries, cages
	const dh = await E(page, async () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, I = G.ExpItems, out = {};
		Object.assign(Ec.run.mods, { diff: 0, rate: 0, xp: 0, money: 0, loot: 0 });   // (the curses and greed of 5 off)
		const dt = H.objs('ditto')[0], hy = H.objs('hypno')[0];
		// only capped items: nothing to copy (Ditto stays)
		const keep = Object.assign({}, pl.xi);
		pl.xi = { masterball: 1 }; I.apply(pl);
		H.stand(dt, 1); out.capped = { st: H.st(dt), xi: Object.assign({}, pl.xi) };
		H.away();
		pl.xi = { masterball: 1, lifeorb: 1 }; I.apply(pl);
		H.stand(dt, 1); out.copy = { st: H.st(dt), xi: Object.assign({}, pl.xi) };
		pl.xi = keep; I.apply(pl);
		H.away();
		// Hypno: forget a vitamin; its stat is undone and the slot is free
		pl.xv.length = 0; I.apply(pl);
		H.stand(hy, 1); out.none = { st: H.st(hy), open: !!Ec.pick };
		H.away();
		I.takeVitamin(pl, 'protein', 0); I.takeVitamin(pl, 'protein', 0); I.takeVitamin(pl, 'carbos', 0);
		const atk0 = pl.atkMul, spd0 = pl.spdMul, phys0 = I.total(pl, 'phys'), prot = pl.xv.find(x => x.id === 'protein').v;
		H.stand(hy, 1);
		out.hyp = { open: Ec.pick && Ec.pick.kind, cards: H.cards().map(c => c.nm), leave: document.getElementById('xeco-close').innerText };
		H.choose(0);
		out.hyp.after = { xv: pl.xv.map(x => x.id), phys: I.total(pl, 'phys'), phys0, prot, spd: pl.spdMul === spd0, st: H.st(hy), open: !!Ec.pick };
		H.away();
		// gold rocks: v x zone x gold ₽, once
		const rk = H.objs('rock')[0];
		pl.coins = 0; Ec.run.frac = 0;
		H.stand(rk, 0.1); out.rock = { got: pl.coins, v: rk.v, want: Math.floor(rk.v * (1 + I.total(pl, 'coin')) + 1e-6), st: H.st(rk) };
		H.away(); H.stand(rk, 0.1); out.rock.again = pl.coins;
		// berries: heal 50 %, only when hurt
		const be = H.objs('berry')[0];
		const bag = pl.xi; pl.xi = {}; I.apply(pl);   // (no Sitrus Berry / Leftovers healing on top)
		pl.hp = pl.maxHp; H.stand(be, 0.1); out.berryFull = H.st(be);
		H.away(); pl.hp = Math.round(pl.maxHp * 0.3); const h0 = pl.hp;
		H.stand(be, 0.1); out.berry = { st: H.st(be), healed: pl.hp - h0, want: Math.round(pl.maxHp * 0.5) };
		pl.xi = bag; I.apply(pl);
		H.away();
		// cages: 20 + 10 x zone ₽ -> +50 % of a level's XP
		const cg = H.objs('cage')[0];
		H.unsturdy(); H.sturdy(); delete pl.gainXp;
		pl.coins = 10; H.stand(cg, 1); out.cagePoor = { st: H.st(cg), coins: pl.coins };
		H.away(); pl.coins = 100; const xp0 = pl.xp, need = pl.xpNext, lv0 = pl.level;
		H.stand(cg, 1);
		out.cage = { st: H.st(cg), paid: 100 - pl.coins, xp: pl.level > lv0 ? null : pl.xp - xp0, want: Math.round(need * 0.5), freed: Ec.run.log.freed };
		pl.gainXp = () => 0;
		H.away();
		return out;
	});
	A(dh.capped.st === 0 && JSON.stringify(dh.capped.xi) === '{"masterball":1}' && dh.copy.st === 1 && dh.copy.xi.lifeorb === 2 && dh.copy.xi.masterball === 1,
		'Ditto copies one of your items (Life Orb x1 -> x2), never a capped one (a lone Master Ball: nothing, Ditto stays)', JSON.stringify(dh));
	A(dh.none.st === 0 && !dh.none.open && dh.hyp.open === 'hypno' && dh.hyp.cards.length === 2 && /Forget Protein/.test(dh.hyp.cards[0]) && /Keep them/.test(dh.hyp.leave)
		&& JSON.stringify(dh.hyp.after.xv) === '["carbos"]' && Math.abs(dh.hyp.after.phys0 - dh.hyp.after.phys - dh.hyp.after.prot) < 1e-9 && dh.hyp.after.prot > 0 && dh.hyp.after.spd && dh.hyp.after.st === 1 && !dh.hyp.after.open,
		'Hypno: nothing to forget without vitamins; else "Forget X" cards (or "Keep them"); forgetting Protein undoes its damage and frees the slot', JSON.stringify(dh.hyp));
	A(dh.rock.got === dh.rock.want && dh.rock.st === 1 && dh.rock.again === dh.rock.got, 'a gold rock breaks at a touch for its 6-14 ₽ x zone, once', JSON.stringify(dh.rock));
	A(dh.berryFull === 0 && dh.berry.st === 1 && near(dh.berry.healed, dh.berry.want, 1), 'a berry bush waits while you\'re at full HP, then heals 50 %', JSON.stringify(dh));
	A(dh.cagePoor.st === 0 && dh.cagePoor.coins === 10 && dh.cage.st === 1 && dh.cage.paid === 30 && (dh.cage.xp === null || near(dh.cage.xp, dh.cage.want, 1)) && dh.cage.freed === 1,
		'a cage: 10 ₽ isn\'t enough; 30 ₽ (20 + 10 x zone) frees its Pokémon for +50 % of a level\'s XP', JSON.stringify(dh));

	// ======================== 8. the fog of war and the legend; 9. tips (a fresh page: no tip seen yet)
	const d2 = await bootPage();
	const r2 = await startClassic(d2.page);
	A(r2.ok && r2.on, 'a fresh page starts Classic', JSON.stringify(r2));
	const fg = await E(d2.page, async () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, out = {};
		const wait = ms => new Promise(r => setTimeout(r, ms));
		H.go(0, 0); H.step(2);
		const f = Ec.fog;
		out.start = f ? f.n : -1;
		const lay = Ec.layoutOf(G.World.zone), far = lay.objs.filter(o => Math.hypot(o.tx, o.ty) > 22);
		const tgt = far.find(o => o.kind === 'ball') || far[0];
		out.tgtFoundBefore = Ec.found(tgt, pl);
		H.thaw(); await wait(350); H.freeze();
		const drawn0 = G.Minimap.drawn.filter(d => /^x-/.test(d.kind));
		out.mini0 = drawn0.length;
		// walk (teleport) near it: its tile is explored, it shows on the minimap
		H.go(tgt.x + 3 * G.World.TS, tgt.y); H.step(2);
		out.tgtFoundAfter = Ec.found(tgt, pl); out.more = Ec.fog.n > out.start;
		H.thaw(); await wait(350); H.freeze();
		out.mini1 = G.Minimap.drawn.filter(d => d.kind === 'x-' + tgt.kind).length;
		out.tip = { id: Ec.tip, q: Ec.run.tipQ.slice(), text: document.getElementById('xtip').innerText, vis: !document.getElementById('xtip').classList.contains('hidden'), saved: G.ExpSave.get('tip.' + tgt.kind) };
		// the zone map: M opens it (paused), the legend lists what's found, the fog covers the rest
		H.key('KeyM');
		out.map = { open: Ec.mapOpen, state: G.Game.state, vis: !document.getElementById('scr-xmap').classList.contains('hidden'), info: Ec.mapInfo, legend: document.getElementById('xmap-legend').innerText };
		// the fog on the canvas: a far corner is dark, the start is not
		const cv = document.getElementById('xmap-cv'), g = cv.getContext('2d'), z = G.World.zone;
		const px = (tx, ty) => Array.from(g.getImageData((tx - z.x0) * 4 + 2, (ty - z.y0) * 4 + 2, 1, 1).data);
		out.map.corner = px(z.x0 + 2, z.y0 + 2); out.map.start = px(3, 3);
		H.key('KeyM');
		out.map.closed = { open: Ec.mapOpen, state: G.Game.state };
		// the pause screen's button opens it too (the pad's way)
		G.Game.togglePause(); await wait(60);
		const pb = document.getElementById('pause-xmap');
		out.pauseBtn = { shown: !!pb && !pb.classList.contains('hidden'), text: pb && pb.innerText };
		if (pb) pb.click();
		out.pauseMap = Ec.mapOpen;
		document.getElementById('xmap-close').click();
		G.Game.togglePause(); await wait(60);
		// a tip shows once: the same kind again shows nothing
		H.away();
		const second = lay.objs.find(o => o.kind === tgt.kind && o !== tgt && Math.hypot(o.tx, o.ty) > 12);
		if (second) { H.go(second.x + 4 * G.World.TS, second.y); H.step(2); }
		out.tipLog = Ec.tips; out.tipAgain = Ec.tips.filter(k => k === tgt.kind).length !== 1;
		out.tipCount = G.ExpSave.get('tip.' + tgt.kind);
		out.kind = tgt.kind;
		// the stored copy (this browser's Expedition save) keeps it for the next run / page
		out.stored = (JSON.parse(localStorage.getItem('micasurvivorexp_save.guest') || '{}').counters || {})['tip.' + tgt.kind] || 0;
		return out;
	});
	A(fg.start > 400 && fg.start < 1200 && !fg.tgtFoundBefore && fg.mini0 >= 0, 'the fog: a new zone has only the tiles round the start explored; a far ball is not found yet', JSON.stringify(fg));
	A(fg.tgtFoundAfter && fg.more && fg.mini1 >= 1, 'walking near it explores its tiles and it appears on the minimap', JSON.stringify({ a: fg.tgtFoundAfter, m: fg.mini1 }));
	A(fg.map.open && fg.map.state === 'choice' && fg.map.vis && fg.map.info && fg.map.info.counts[fg.kind] && /legend/i.test(fg.map.legend) && /You/.test(fg.map.legend) && fg.map.info.pct > 0 && fg.map.info.pct < 20,
		'M opens the zone map (the run holds): a legend with "You" and the kinds found, the share explored', JSON.stringify(fg.map).slice(0, 600));
	A(fg.map.corner[0] < 30 && fg.map.corner[1] < 30 && fg.map.start[0] + fg.map.start[1] + fg.map.start[2] > 120 && !fg.map.closed.open && fg.map.closed.state === 'playing',
		'on the map an unexplored corner is fogged (near black), the start is not; M again closes it and the run goes on', JSON.stringify(fg.map));
	A(fg.pauseBtn.shown && /Zone map/.test(fg.pauseBtn.text) && fg.pauseMap, 'the pause screen has a "Zone map" button (the pad\'s way to it)', JSON.stringify(fg.pauseBtn));
	await d2.ctx.close();
	A(fg.tip.vis && /^tip/i.test(fg.tip.text) && fg.tip.saved === 1 && fg.tipCount === 1 && fg.tipAgain === false && fg.stored === 1, 'a first-run tip shows when you first meet a kind, once: saved in the Expedition save (also this browser\'s copy), not queued again', JSON.stringify(fg));

	// ======================== 10. sync
	const sy = await E(page, async () => {
		const H = window.__t, Ec = G.ExpEco, pl = G.Game.player, out = {};
		H.wipe();
		const idle = JSON.parse(JSON.stringify(G.Spectate.snap()));
		// use a few: a rock, a free ball, half-charge an Unown altar; Meowth in
		const lay = Ec.layoutOf(G.World.zone), rk = H.objs('rock')[1], fb = H.objs('freeball')[1], un = H.objs('unown1')[1];
		H.stand(rk, 0.1); H.away(); H.stand(fb, 0.7); H.away();
		H.go(un.x, un.y); H.step(90); H.go(0, 0); H.step(1);
		G.ExpClassic.debugZoneTime(lay.visits[0].at + 1); H.step(1);
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const m = { uid: 'bob', name: 'bob', connected: true, pl: G.Game.player };
		const had = Object.getOwnPropertyDescriptor(G.Net, 'uid');
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x, gf = G.Hooks.reduce('net.frame', { k: 'f' }, null).x;
		if (had) Object.defineProperty(G.Net, 'uid', had); else delete G.Net.uid;
		out.idle = idle; out.snap = snap; out.hf = hf && hf.o; out.gf = gf ? gf.o || null : null; out.seed = G.World.seed;
		out.ids = { rk: rk.i, fb: fb.i, un: un.i, spot: Ec.zone.spot };
		// the replay: the recording keeps `o` (field 9) and an `xi` event per use
		H.step(40);
		G.Game.quit(); await new Promise(r => setTimeout(r, 300));
		const e = G.Replay.last; if (e && e.ready) await e.ready;
		out.code = e && e.code;
		out.over = (document.getElementById('scr-over') || {}).innerText || '';
		out.saved = { earned: G.ExpSave.get('eco.earned'), balls: G.ExpSave.get('eco.balls'), rocks: G.ExpSave.get('eco.rocks') };
		return out;
	});
	const oi = sy.idle && sy.idle.x && sy.idle.x.o, os = sy.snap && sy.snap.x && sy.snap.x.o;
	const stOf = (o, i) => { for (let k = 0; k + 2 < o.s.length; k += 3) if (o.s[k] === i) return [o.s[k + 1], o.s[k + 2]]; return null; };
	A(sy.snap && sy.snap.x.xv === 10 && oi && Array.isArray(oi.h) && os && JSON.stringify(stOf(os, sy.ids.rk)) === '[1,0]' && JSON.stringify(stOf(os, sy.ids.fb)) === '[1,0]' && stOf(os, sy.ids.un)[0] === 2 && stOf(os, sy.ids.un)[1] > 30 && os.m && os.m[1] === sy.ids.spot && os.m.length === 6 && os.n > oi.n,
		'a live snapshot: x v10 with `o` (v7 since D7) {s: [index, state, charge %] of the used / charging ones, h, g, n, m: Meowth while he\'s in}', JSON.stringify({ oi, os }).slice(0, 700));
	A(sy.hf && JSON.stringify(sy.hf.s) === JSON.stringify(os.s) && sy.gf === null, 'a co-op host frame carries the same `o`; a guest\'s own frame none (the host owns the interactables)', JSON.stringify({ hf: sy.hf, gf: sy.gf }).slice(0, 300));
	A(/₽ \d+ · Poké Balls \d+ · Altars \d+/.test(sy.over) && sy.saved.earned > 0 && sy.saved.balls >= 1 && sy.saved.rocks >= 1, 'the run-over screen: "₽ N · Poké Balls N · Altars N"; the Expedition save counts them (merged by max)', JSON.stringify(sy.saved) + ' ' + (sy.over.match(/₽.*Altars \d+/) || [''])[0]);
	A(!!sy.code, 'the run\'s replay is kept');

	// a fresh page: a live spectator, the replay viewer, a v6 block, a base run
	const d3 = await bootPage();
	const vw = await E(d3.page, async (rec) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
		G.MicaAccount.name = () => 'viewer';
		let hs = null;
		G.Spectate.watch = (u, h) => { hs = h; h.snapshot(rec.idle, {}); };
		G.WatchUI.watchLive('host');
		for (let i = 0; i < 80 && !(G.WatchUI.player && G.World.zone && G.ExpEco); i++) await wait(50);
		hs.snapshot(rec.snap, {});
		hs.snapshot(Object.assign({}, rec.snap, { t: rec.snap.t + 5 }), {});
		await wait(400);
		const c = G.ExpEco.cur();
		out.spec = c && { rk: c.st[rec.ids.rk], fb: c.st[rec.ids.fb], un: c.st[rec.ids.un], ch: c.ch[rec.ids.un], spot: c.spot, stock: c.stock && c.stock.length, host: c.host, n: c.lay.objs.length };
		out.spec.mini = G.Minimap.drawn.filter(d => /^x-/.test(d.kind)).length;
		out.spec.tip = !document.getElementById('xtip') || document.getElementById('xtip').classList.contains('hidden');
		G.WatchUI.leave(); await wait(200);
		// a v6 block (no `o`) still loads: everything fresh
		const old = Object.assign({}, rec.snap, { dv: 5, x: Object.assign({}, rec.snap.x, { xv: 6 }) });
		delete old.x.o;
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.World.reset(rec.seed); G.Exp.applyX(rec.seed, old.x);
		G.Exp.viewAir(old, pup, null);
		const c2 = G.ExpEco.cur();
		out.old = { used: c2 ? c2.st.filter(s => s !== 0).length : -1, ok: G.Expedition.replayOk(5), notice: G.Expedition.viewNotice('exp-classic', 5), dv: G.Expedition.DV };
		// the replay viewer
		const rd = await G.Replay.open(rec.code);
		let withO = 0, lastO = null;
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.o) { withO++; lastO = s.x.o; } }
		out.replay = { frames: rd.length, withO, xi: rd.ev.filter(e => e[1] === 'xi').length, last: lastO && lastO.n };
		G.WatchUI.playReplay(rd, {});
		for (let i = 0; i < 60 && !G.WatchUI.player; i++) await wait(50);
		G.WatchUI.seek(Math.max(0, rd.duration - 0.5)); await wait(400);
		const c3 = G.ExpEco.cur();
		out.replay.rk = c3 && c3.st[rec.ids.rk];
		G.WatchUI.leave(); await wait(200);
		// a base run in the same page: no zone, no interactables, the minimap draws none
		H.thaw(); await G.Flow.play('normal'); await wait(400); H.freeze();
		out.base = { mode: G.Game.mode, zone: !!G.World.zone, run: !!G.ExpEco.run, o: !!((G.Spectate.snap() || {}).x), mini: G.Minimap.drawn.filter(d => /^x-/.test(d.kind)).length, loaded: G.Expedition.loaded, seam: G.Hooks.count('minimap.draw') };
		G.Game.quit(); await wait(200);
		return out;
	}, { idle: sy.idle, snap: sy.snap, ids: sy.ids, code: sy.code, seed: sy.seed });
	A(vw.loadedBefore === false && vw.spec && vw.spec.rk === 1 && vw.spec.fb === 1 && vw.spec.un === 2 && vw.spec.ch > 0.3 && vw.spec.spot === sy.ids.spot && vw.spec.stock === 3 && !vw.spec.host && vw.spec.n === 43 && vw.spec.tip,
		'a live spectator (a fresh page) rebuilds the 43 interactables from the seed and shows the host\'s state: the used rock and ball, the charging altar, Meowth (no tips for a viewer)', JSON.stringify(vw.spec));
	A(vw.old && vw.old.used === 0 && vw.old.ok && !vw.old.notice && vw.old.dv === 19, 'a dv-5 / x v6 snapshot (no `o`) still loads with no notice: every interactable fresh; this build is dv 17 (D12)', JSON.stringify(vw.old));
	A(vw.replay && vw.replay.withO > 0 && vw.replay.xi >= 2 && vw.replay.rk === 1, 'a replay keeps `o` (frame field 9) and an `xi` event per use; played back, the rock is used', JSON.stringify(vw.replay));
	A(vw.base && vw.base.mode === 'normal' && !vw.base.zone && !vw.base.run && !vw.base.o && vw.base.mini === 0 && vw.base.loaded && vw.base.seam === 1,
		'a Normal run in the same page (Expedition code loaded): no zone, no economy, no `x`, nothing extra on the minimap', JSON.stringify(vw.base));
	await d3.ctx.close();

	// ======================== 11. phone and desktop: the shop, a ball's choice, an altar, the map
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startClassic(d.page);
		A(st.ok && st.on, `${tag}: Classic starts`, JSON.stringify(st));
		const inV = (b, W, Hh) => b && b.x >= -1 && b.y >= -1 && b.x + b.w <= W + 1 && b.y + b.h <= Hh + 1;
		const rectOf = sel => E(d.page, sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
		const dims = await E(d.page, () => ({ W: innerWidth, H: innerHeight, touch: G.Touch.active }));
		// an Unown altar, charging, with its label and tip
		await E(d.page, () => { const H = window.__t, o = H.objs('unown3')[0]; H.go(o.x, o.y + 10); H.step(80); });
		const lay1 = await E(d.page, async () => {
			window.__t.thaw(); await new Promise(r => setTimeout(r, 350)); window.__t.freeze();
			const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
			const tip = R.find(o => o.name === 'xtip');
			const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
			return { tip, hits: tip ? R.filter(o => o !== tip && hit(o, tip)).map(o => o.name) : [], names: R.map(o => o.name) };
		});
		A(!lay1.tip || (inV(lay1.tip, dims.W, dims.H) && lay1.hits.length === 0), `${tag}: the tip box is on screen and overlaps nothing on the HUD`, JSON.stringify(lay1));
		if (SHOTS) await shoot(d.page, `altar_${tag}.png`, 250);
		// a paid ball's choice
		await E(d.page, () => { const H = window.__t, pl = G.Game.player; H.wipe(); H.away(); pl.coins = 200; G.ExpEco.zone.ch.fill(0); const b = H.objs('ball')[0]; H.stand(b, 0.7); });
		const pk = await E(d.page, () => ({ open: !!G.ExpEco.pick, n: document.querySelectorAll('#xeco-cards .card').length }));
		const box1 = await rectOf('#scr-xeco .box'), lastCard = await rectOf('#xeco-cards .card:last-child');
		A(pk.open && pk.n === 3 && inV(box1, dims.W, dims.H) && inV(lastCard, dims.W, dims.H), `${tag}: a ball's pick of 3 fits the screen (${dims.W}x${dims.H})`, JSON.stringify({ pk, box1, lastCard }));
		if (SHOTS) await shoot(d.page, `ball_choice_${tag}.png`, 300);
		// tap / click a card: it is taken
		if (lastCard) {
			const n0 = await E(d.page, () => { G.ExpEco.pick.at = -1e9; return window.__t.nItems(); });
			if (view && view.hasTouch) await d.page.touchscreen.tap(lastCard.x + lastCard.w / 2, lastCard.y + lastCard.h / 2); else await d.page.mouse.click(lastCard.x + lastCard.w / 2, lastCard.y + lastCard.h / 2);
			await sleep(100);
			const n1 = await E(d.page, () => ({ n: window.__t.nItems(), open: !!G.ExpEco.pick }));
			A(n1.n === n0 + 1 && !n1.open, `${tag}: a ${view && view.hasTouch ? 'tap' : 'click'} on a card takes it and closes the choice`, JSON.stringify({ n0, n1 }));
		}
		// Meowth's shop
		await E(d.page, () => { const H = window.__t, Ec = G.ExpEco, lay = Ec.layoutOf(G.World.zone), v = lay.visits[0]; H.away(); G.ExpClassic.debugZoneTime(v.at + 1); H.step(1); H.wipe(); G.Game.player.coins = 140; H.stand(lay.objs[v.spot], 0.2, 0, 10); });
		const sh = await E(d.page, () => ({ open: G.ExpEco.pick && G.ExpEco.pick.kind }));
		const box2 = await rectOf('#scr-xeco .box'), leave = await rectOf('#xeco-close');
		A(sh.open === 'shop' && inV(box2, dims.W, dims.H) && inV(leave, dims.W, dims.H) && leave.w > 20, `${tag}: Meowth's shop and its Leave button fit the screen`, JSON.stringify({ sh, box2, leave }));
		if (SHOTS) await shoot(d.page, `meowth_shop_${tag}.png`, 300);
		await E(d.page, () => { const a = document.getElementById('ach-pop'); if (a) a.classList.add('hidden'); });   // (a base toast over the bottom edge)
		if (leave) { if (view && view.hasTouch) await d.page.touchscreen.tap(leave.x + leave.w / 2, leave.y + leave.h / 2); else await d.page.mouse.click(leave.x + leave.w / 2, leave.y + leave.h / 2); }
		await sleep(100);
		const lv = await E(d.page, () => ({ pick: !!G.ExpEco.pick, state: G.Game.state }));
		A(!lv.pick && lv.state === 'playing', `${tag}: Leave closes the shop`, JSON.stringify(lv));
		// the minimap's fog (walk a little), then the zone map from a tap on the minimap
		await E(d.page, () => { const H = window.__t; H.away(); for (const o of H.objs().filter(o => (o.kind === 'rock' || o.kind === 'berry') && Math.hypot(o.tx, o.ty) < 40).slice(0, 4)) { H.go(o.x + 50, o.y + 50); H.step(2); } });
		const mm = await E(d.page, async () => { window.__t.thaw(); await new Promise(r => setTimeout(r, 350)); window.__t.freeze(); const r = G.ExpEco.miniRect, k = G.HUD.k; return r ? { x: r.x * k, y: r.y * k, w: r.s * k, h: r.s * k, drawn: G.Minimap.drawn.filter(d => /^x-/.test(d.kind)).length } : null; });
		if (SHOTS) await shoot(d.page, `minimap_fog_${tag}.png`, 250);
		A(mm && mm.drawn > 0, `${tag}: the minimap shows the interactables found so far`, JSON.stringify(mm));
		if (mm) {
			await E(d.page, () => window.__t.thaw());
			if (view && view.hasTouch) await d.page.touchscreen.tap(mm.x + mm.w / 2, mm.y + mm.h / 2); else await d.page.mouse.click(mm.x + mm.w / 2, mm.y + mm.h / 2);
			await sleep(200);
			await E(d.page, () => window.__t.freeze());
		}
		const mp = await E(d.page, () => ({ open: G.ExpEco.mapOpen }));
		const cvR = await rectOf('#xmap-cv'), lgR = await rectOf('#xmap-legend'), clR = await rectOf('#xmap-close');
		A(mp.open && inV(cvR, dims.W, dims.H) && inV(lgR, dims.W, dims.H) && inV(clR, dims.W, dims.H) && cvR.w > 150, `${tag}: a ${view && view.hasTouch ? 'tap' : 'click'} on the minimap opens the zone map; the map, its legend and Close fit the screen`, JSON.stringify({ mp, cvR, lgR, clR }));
		if (SHOTS) await shoot(d.page, `zone_map_${tag}.png`, 300);
		await E(d.page, () => G.ExpEco.closeMap());
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
