// micasurvivor_expedition_maps_test.mjs — MicaSurvivor DLC D12: maps 2-3, Mt. Moon and Cerulean Cape. micasurvivor/js/expedition/
// classic.js (MAPS.mtmoon / MAPS.cerulean: residents, guardians, totems, summoners, stampedes, flocks, the shrine boss, the
// shrines), terrain.js (PROFILES, LOOK: the biome palette, height tint, minimap shading, bounce pad per map), survival.js
// (K.LEGENDS per map, the hazard colours), tiers.js (the unlock rule, the panel's map tabs), core.js (the palette on every zone),
// systems/expedition.js (DV 11) and server/mp.mjs (the boards per map). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.3 and the D12 row.
// Headless Chrome against a static server (guest saves); the real server handler (bundled, over sqlite) for the boards. One
// browser at a time (and it always exits).
//   1. pure: each map's zones are seeded (same seed, same hash; another seed, another), flood-fill connected (every walkable
//      tile, props never cut a path), its own profile (Mt. Moon: high ground and rock; Cerulean Cape: low ground and sea), its
//      shrine connected; its palette, tint, minimap shading and bounce pad (painted: a crystal / a life buoy)
//   2. content: residents by stage, guardians, totems, summoners (and minions), stampedes, flocks, the shrine boss; the plan
//      is pure (no Math.random); a totem and a summoner fire in a live run on the map
//   3. Survival: the legendary milestones per map (Mt. Moon: Clefable, then the birds; Cerulean Cape: Zapdos), the segment
//      timeline from the map's pools, hazards on its lands with its own colours; a Survival run on Cerulean Cape: the
//      15:00 milestone is Zapdos
//   4. tiers and boards: every map playable, no "Coming soon"; a locked map says which map opens it; the server's boards
//      per map (Classic score + time, Survival) through the real handler
//   5. the unlock rule: Viridian Forest open; Mt. Moon after a Viridian win (any tier); Cerulean Cape after a Mt. Moon win
//   6. a Classic run won on each map (fast-forward): 3 guardians of the map, its shrine boss, the victory screen
//   7. sync: a co-op guest, a live spectator and a replay viewer rebuild a Cerulean Cape zone (hash, altar, palette)
//   8. the phone (844 x 390): the HUD on Mt. Moon, the tier panel's map tabs fit
//   9. screenshots (SHOTS=<dir>): each map's Classic zone, shrine and a Survival milestone, desktop and phone
//   node overworld/tests/micasurvivor_expedition_maps_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree and MP_SERVER=<file> another server: how the "fails before D12" count was taken.)
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
const PORT = 8869;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const MAPS2 = ['mtmoon', 'cerulean'];

// ======================== 4b. the boards per map: the real server handler over sqlite (no browser)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-maps-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [MP_SERVER], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const raw = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.81.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await raw('register', { username: 'mapper', password: 'msurv-maps-pass-1' })).body.token;
	// (the formulas: tiers.js K.SCORE / survival.js K.SCORE, = the server's)
	const cScore = (p, tier = 0) => Math.floor((2 * p.kills + 3 * p.time + p.dmg / 200 + 1500 * (p.zone - 1) + 800 * p.bosses + (p.won ? 6000 : 0) + 400 * p.catches) * (1 + 0.5 * tier));
	const sScore = (p, tier = 0) => Math.floor((2 * p.kills + 4 * p.time + p.dmg / 200 + 800 * p.bosses + 2000 * p.legends + 400 * p.catches) * (1 + 0.5 * tier));
	const out = {};
	for (const map of MAPS2) {
		const p = { kills: 2600, time: 1380, dmg: 900000, zone: 4, bosses: 4, won: true, catches: 1 };
		const c = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 14, map, diff: 'normal', level: 30, dex: 4, ...p, score: cScore(p) }, tok);
		const sp = { kills: 1900, time: 1000, dmg: 600000, bosses: 3, legends: 1, catches: 0 };
		const s = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-survival', dv: 14, map, diff: 'normal', level: 30, dex: 4, ...sp, score: sScore(sp) }, tok);
		const lb = await raw('run-leaderboard', { mode: 'micasurvivor_expedition', map, diff: 'normal', board: 'score' }, tok);
		const lt = await raw('run-leaderboard', { mode: 'micasurvivor_expedition', map, diff: 'normal', board: 'time' }, tok);
		const ls = await raw('run-leaderboard', { mode: 'micasurvivor_expedition', map, diff: 'normal', board: 'survival' }, tok);
		out[map] = { c: c.status, s: s.status, score: (row('runboard:micasurvivor_expedition:' + map + ':normal') || []).length, time: (row('runboard:micasurvivor_expedition:' + map + ':normal:time') || []).length,
			surv: (row('runboard:micasurvivor_expedition:' + map + ':normal:survival') || []).length, lb: (lb.body.top || lb.body.board || []).length, lt: (lt.body.top || lt.body.board || []).length, ls: (ls.body.top || ls.body.board || []).length };
	}
	const vir = row('runboard:micasurvivor_expedition:viridian:normal');
	A(MAPS2.every(m => out[m].c === 200 && out[m].s === 200 && out[m].score === 1 && out[m].time === 1 && out[m].surv === 1) && !vir,
		'the server keeps each new map\'s own boards: Classic score + time attack and Survival (runboard:micasurvivor_expedition:<map>:normal[:time|:survival]); Viridian\'s untouched', JSON.stringify(out));
	A(MAPS2.every(m => out[m].lb === 1 && out[m].lt === 1 && out[m].ls === 1), 'run-leaderboard reads each new map\'s Score / Time attack / Survival board', JSON.stringify(out));
}

// ======================== the browser
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { 4: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 } },
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, net: [], draws: 0 };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	const real = Math.random;
	Math.random = () => { H.draws++; return real(); };
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dmaps12');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.closePick(true); return; }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.altarXY = () => G.ExpClassic.siteXY(G.ExpClassic.sitesOf(G.World.zone).altar);
	H.toAltar = () => { const pl = G.Game.player, [x, y] = H.altarXY(); pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.World.collide(pl); G.Camera.x = pl.x; G.Camera.y = pl.y; };
	H.away = () => { const pl = G.Game.player; pl.x = 0; pl.y = 0; pl.zMask = null; G.World.collide(pl); };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead) { e.dead = true; e.fade = 0; } };
	H.beatBoss = () => {
		H.thin();
		H.step(300, 1 / 30, () => { if (G.ExpClassic.run.boss) return false; H.toAltar(); });
		const b = G.ExpClassic.run.boss;
		if (!b) return { error: 'no boss', ph: G.ExpClassic.run.ph };
		const out = { dex: b.dex, hp: b.maxHp, ph: G.ExpClassic.run.ph, zone: G.ExpClassic.run.zone };
		let n = 0;
		while (!b.dead && n < 4000) { b.hurt(b.maxHp / 40); H.step(1); n++; if (n % 60 === 0) H.thin(); }
		H.step(3);
		out.down = b.dead; out.phAfter = G.ExpClassic.run.ph;
		return out;
	};
	H.through = () => H.step(90, 1 / 30, () => { if (G.ExpClassic.run.ph === 0) return false; H.toAltar(); });
	H.calm = () => { const C = G.ExpClassic.run, S = G.ExpSurv && G.ExpSurv.run; if (C) C.acc = -1e6; if (S) { S.seg = Math.floor(G.Game.st.time / 300); S.segEv = []; S.segN = 0; } };
	H.jump = (t, miles) => { G.Game.debugTime(t); const S = G.ExpSurv.run; if (S) { S.miles = miles != null ? miles : Math.floor(t / 300); S.nextMig = Math.max(S.nextMig, t + 1); } H.calm(); };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(view) {
		const ctx = await browser.createBrowserContext();
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
	const load = page => E(page, async () => {
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { ok: false, err: ok };
		await G.ExpSave.open();
		if (!window.__hooked) { window.__hooked = 1; G.Hooks.on('run.end', (out, sum) => { window.__out = { lines: out.lines.slice() }; window.__sum = JSON.parse(JSON.stringify(sum)); return out; }); }
		return { ok: true, dv: G.Expedition.DV, cdv: G.Exp.dv, xv: G.Exp.XV, maps: Object.keys(G.ExpClassic.MAPS) };
	});
	/** open the maps up to `upto` (the Viridian / Mt. Moon wins the rule reads), pick it, and start mode (Classic by default) */
	const startOn = (page, map, mode = 'exp-classic') => E(page, async (map, mode) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.Game.state === 'playing' || G.Game.state === 'levelup' || G.Game.state === 'choice') { G.Game.quit(); await wait(300); }
		if (G.Game.state !== 'ui') { G.Flow.goMenu(); await wait(200); }
		if (G.ExpEco && G.ExpEco.pick) G.ExpEco.closePick(true);
		if (map !== 'viridian' && !G.ExpTier.mapOpen(map)) { G.ExpSave.bump('wins.viridian.normal'); if (map === 'cerulean') G.ExpSave.bump('wins.mtmoon.normal'); }
		const picked = G.ExpTier.setPick(map, 'normal');
		const ok = await G.Flow.play(mode);
		window.__t.freeze();
		window.__t.sturdy();
		window.__t.thin();
		if (G.ExpClassic.run) G.ExpClassic.run.acc = -1e6;
		return { picked, ok, state: G.Game.state, map: G.Modes.run.map, zmap: G.World.zone && G.World.zone.map, dv: G.Modes.run.dv, biome: G.World.biome, mode: G.Modes.run.mode };
	}, map, mode);

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const ld = await load(page);
	A(ld.ok && ld.dv === 18 && ld.cdv === 18 && ld.xv === 10 && JSON.stringify(ld.maps) === '["viridian","mtmoon","cerulean"]',
		'the Expedition code loads: content version 11 (D12; old replays still play), the x block still v10, all three maps in G.ExpClassic.MAPS', JSON.stringify(ld));
	if (!ld.ok) throw new Error('the Expedition code did not load');

	// ======================== 1. pure: terrain per map
	const pure = await E(page, () => {
		const X = G.ExpTerrain, C = G.ExpClassic, out = {};
		const share = z => { let lo = 0, hi = 0, liq = 0, wall = 0, n = z.w * z.h; for (let i = 0; i < n; i++) { if (z.kind[i] === 1) wall++; else if (z.kind[i] === 2) liq++; if (z.kind[i] !== 1) { if (z.hgt[i] >= 2) hi++; else lo++; } } return { hi: hi / n, liq: liq / n, wall: wall / n }; };
		for (const map of ['viridian', 'mtmoon', 'cerulean']) {
			const o = out[map] = { same: true, differ: true, conn: true, connP: true, pads: [], hi: 0, liq: 0, wall: 0, levels: [0, 0, 0, 0], ms: 0 };
			for (const seed of [1234, 98765, 4242]) for (let zn = 1; zn <= 3; zn++) {
				const a = X.generate({ seed, map, zone: zn }), b = X.generate({ seed, map, zone: zn }), c = X.generate({ seed: seed + 1, map, zone: zn });
				if (a.hash !== b.hash) o.same = false;
				if (a.hash === c.hash) o.differ = false;
				const au = X.audit(a);
				if (au.reached !== au.walk) o.conn = false;
				if (au.reachedP !== au.walkP || au.solidOnPath) o.connP = false;
				o.pads.push(a.pads.length);
				const s = share(a); o.hi += s.hi / 9; o.liq += s.liq / 9; o.wall += s.wall / 9;
				au.levels.forEach((v, i) => { if (v > 0) o.levels[i]++; });
				o.ms = Math.max(o.ms, a.stats.ms);
				// every pad lands one level up, on land
				for (const p of a.pads) { const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][p[2] - 1]; if (a.height(p[0] + 2 * dx, p[1] + 2 * dy) !== a.height(p[0], p[1]) + 1) o.padBad = (o.padBad || 0) + 1; }
			}
			// the shrine: connected, the pedestal on the dais (height 1), the stairs up
			const sh = C.build(1234, map, 4), sa = X.audit(sh), ped = C.sitesOf(sh).altar;
			o.shrine = { conn: sa.reached === sa.walk && !sa.solidOnPath, ped, pedH: sh.height(ped[0], ped[1]), liq: sa.liquid, w: sh.w, shrine: C.sitesOf(sh).shrine, hash: sh.hash, again: C.build(1234, map, 4).hash === sh.hash };
			o.look = X.lookOf(map); o.biome = X.biomeOf(map); o.tint = [0, 1, 2, 3].map(l => X.tintOf(l, map));
			o.prof = X.PROFILES[map];
		}
		out.water = G.Tiles.arenaBiome('water');
		return JSON.parse(JSON.stringify(out));
	});
	for (const map of MAPS2) {
		const o = pure[map] || {};
		A(o.same && o.differ, `${map}: each zone is seeded (the same seed rebuilds the same hash; the next seed gives another)`, JSON.stringify(o));
		A(o.conn && o.connP, `${map}: a flood-fill from the spawn reaches every walkable tile, and solid props never cut a path (9 zones)`, JSON.stringify({ conn: o.conn, connP: o.connP }));
		A(o.pads && o.pads.every(n => n >= 3) && !o.padBad, `${map}: every zone has bounce pads (${(o.pads || []).join(',')}), each landing one level up`, JSON.stringify(o.pads));
		A(o.shrine && o.shrine.conn && o.shrine.shrine && o.shrine.pedH === 1 && o.shrine.w === 44 && o.shrine.again && o.shrine.hash !== pure.viridian.shrine.hash, `${map}: its own shrine (every tile connected, no prop on the stairs, the pedestal on the dais), not Viridian's`, JSON.stringify(o.shrine));
	}
	A(pure.mtmoon && pure.mtmoon.hi > pure.viridian.hi * 1.3 && pure.mtmoon.wall > pure.viridian.wall && pure.mtmoon.levels.every(n => n === 9) && pure.mtmoon.liq < pure.viridian.liq / 3,
		`Mt. Moon's terrain: cave ledges, heavy verticality (high ground ${Math.round((pure.mtmoon || {}).hi * 100)} % vs Viridian ${Math.round(pure.viridian.hi * 100)} %, all 4 levels in every zone), more rock, hardly any water`, JSON.stringify({ m: pure.mtmoon && [pure.mtmoon.hi, pure.mtmoon.wall, pure.mtmoon.liq], v: [pure.viridian.hi, pure.viridian.wall, pure.viridian.liq] }));
	A(pure.cerulean && pure.cerulean.liq > pure.viridian.liq * 2 && pure.cerulean.hi < pure.viridian.hi && pure.cerulean.wall < pure.viridian.wall,
		`Cerulean Cape's terrain: the sea (water ${Math.round((pure.cerulean || {}).liq * 100)} % vs Viridian ${Math.round(pure.viridian.liq * 100)} %), low ground, few rocks`, JSON.stringify({ c: pure.cerulean && [pure.cerulean.hi, pure.cerulean.wall, pure.cerulean.liq] }));
	A(pure.viridian.biome === 0 && pure.mtmoon && pure.mtmoon.biome === 1 && pure.cerulean.biome === pure.water && pure.cerulean.look.pad === 'buoy' && pure.mtmoon.look.pad === 'crystal' && pure.viridian.look.pad === 'mushroom'
		&& JSON.stringify(pure.viridian.tint) === '[0.9,1,1.09,1.17]' && JSON.stringify(pure.mtmoon.tint) !== JSON.stringify(pure.viridian.tint) && JSON.stringify(pure.cerulean.look.mini) !== JSON.stringify(pure.viridian.look.mini),
		'each map\'s look: palette (Viridian the forest 0, Mt. Moon the crystal cave 1, Cerulean Cape the sea grotto), its own height tint and minimap shading, its pad (mushroom / crystal / life buoy)', JSON.stringify({ v: pure.viridian.look, m: pure.mtmoon && pure.mtmoon.look, c: pure.cerulean && pure.cerulean.look }));
	// the pads, painted: the crystal's / the buoy's colours on the pad's tile (in code, no image)
	const padPx = await E(page, () => {
		const X = G.ExpTerrain, out = {}, TT = G.Tiles.T;
		const want = { viridian: [214, 54, 64], mtmoon: [150, 128, 222], cerulean: [232, 64, 58] };
		for (const map of ['viridian', 'mtmoon', 'cerulean']) {
			const z = X.generate({ seed: 1234, map, zone: 1 }), p = z.pads[0];
			const cv = document.createElement('canvas'); cv.width = cv.height = 3 * TT;
			const ctx = cv.getContext('2d'); ctx.fillStyle = '#404040'; ctx.fillRect(0, 0, cv.width, cv.height);
			z.paint(cv, p[0] - 1, p[1] - 1, 3, X.biomeOf(map));
			const d = ctx.getImageData(TT, TT, TT, TT).data, w = want[map];
			let hit = 0;
			for (let i = 0; i < d.length; i += 4) if (d[i] === w[0] && d[i + 1] === w[1] && d[i + 2] === w[2]) hit++;
			out[map] = hit;
		}
		return out;
	});
	A(padPx.viridian > 10 && padPx.mtmoon > 10 && padPx.cerulean > 10, 'the bounce pads are painted per map: Viridian\'s red mushroom cap, Mt. Moon\'s moon-stone crystal, Cerulean Cape\'s life buoy', JSON.stringify(padPx));

	// ======================== 2. content: residents, guardians, totems, summoners, legendaries
	const ct = await E(page, () => {
		const C = G.ExpClassic, H = window.__t, out = {};
		for (const map of ['mtmoon', 'cerulean']) {
			const M = C.MAPS[map], o = out[map] = {};
			const all = [].concat(...M.residents, ...M.guardians, ...M.stampede, ...M.flock, ...M.totem, ...M.summoner, Object.values(M.minion), [M.legend]);
			o.missing = all.filter(d => !G.DEX_BY[d] || !G.SPRITE_META[d]);
			o.sizes = { res: M.residents.map(r => r.length), guard: M.guardians.map(g => g.length), totem: M.totem.length, summ: M.summoner.length, stamp: M.stampede.length, flock: M.flock.length };
			o.minion = [].concat(...M.summoner).every(d => M.minion[d]);
			o.legend = M.legend; o.name = G.I18n.t(M.name);
			o.overlap = M.residents[0].filter(d => C.MAPS.viridian.residents[0].includes(d));
			// the residents' share of the map's types, the stages' bands rising
			const typed = [].concat(...M.residents).filter(d => G.DEX_BY[d].types.some(t => M.types.includes(t))).length / [].concat(...M.residents).length;
			o.typed = Math.round(typed * 100) / 100;
			o.bst = M.residents.map(r => Math.round(r.reduce((s, d) => s + G.DEX_BY[d].bst, 0) / r.length));
			o.pools = [1, 2, 3].map(z => { const p = C.poolOf(map, z); return [p.res.length, p.others.length]; });
			// the plan: pure, the map's own guardian / totem / summoner / stampede / flock, the shrine boss
			const d0 = H.draws;
			const plans = [1, 2, 3, 4].map(z => C.plan(777, map, z, 'normal'));
			o.pure = JSON.stringify(plans) === JSON.stringify([1, 2, 3, 4].map(z => C.plan(777, map, z, 'normal'))) && H.draws === d0;
			o.guard = plans.slice(0, 3).map((p, i) => M.guardians[i].includes(p.guardian));
			o.events = plans.slice(0, 3).map((p, i) => p.events.every(e => (e.kind !== 'totem' || M.totem[i].includes(e.dex[0])) && (e.kind !== 'summoner' || M.summoner[i].includes(e.dex[0])) && (e.kind !== 'stampede' || M.stampede[i].includes(e.dex[0])) && (e.kind !== 'flock' || M.flock[i].includes(e.dex[0]))));
			o.kinds = [...new Set(plans[0].events.map(e => e.kind))].sort();
			o.shrineLegend = plans[3].legend; o.cards = plans[0].cards.slice(0, 4);
			o.otherSeed = JSON.stringify(C.plan(778, map, 1)) !== JSON.stringify(plans[0]);
		}
		return out;
	});
	for (const map of MAPS2) {
		const o = ct[map] || {};
		A(o.missing && !o.missing.length && o.sizes && o.sizes.res.every(n => n >= 8) && o.sizes.guard.every(n => n === 3) && o.sizes.totem === 3 && o.sizes.summ === 3 && o.sizes.stamp === 3 && o.sizes.flock === 3 && o.minion,
			`${map}: residents for each stage (${o.sizes && o.sizes.res}), 3 guardians a zone, per-zone totem / summoner (each with its minion) / stampede / flock pools; every one a real Pokémon with sprites`, JSON.stringify(o));
		A(o.typed >= 0.75 && o.bst && o.bst[0] < o.bst[1] && o.bst[1] < o.bst[2] && o.pools.every(([r, x]) => r >= 8 && x >= 6) && !o.overlap.length,
			`${map}: its residents are its types (${o.typed}), stronger by stage (BST ${o.bst}), plus others of its types in each band; none shared with Viridian's first stage`, JSON.stringify({ typed: o.typed, bst: o.bst, pools: o.pools, overlap: o.overlap }));
		A(o.pure && o.otherSeed && o.guard.every(Boolean) && o.events.every(Boolean) && ['alpha', 'flock', 'rockslide', 'summoner', 'totem'].every(k => o.kinds.includes(k)),
			`${map}: the plan is pure (no Math.random) and seeded; its guardians, totems, summoners, stampedes and flocks come from the map's pools`, JSON.stringify({ pure: o.pure, guard: o.guard, events: o.events, kinds: o.kinds }));
	}
	A(ct.mtmoon && ct.mtmoon.legend === 36 && ct.mtmoon.shrineLegend === 36 && ct.cerulean.legend === 145 && ct.cerulean.shrineLegend === 145 && ct.mtmoon.name === 'Mt. Moon' && ct.cerulean.name === 'Cerulean Cape',
		'the shrine bosses (study 5.3): Mt. Moon\'s Clefable (the moon\'s guardian), Cerulean Cape\'s Zapdos', JSON.stringify({ m: ct.mtmoon && ct.mtmoon.legend, c: ct.cerulean && ct.cerulean.legend }));

	// a live run on Mt. Moon: the palette, a totem and a summoner of the map
	const st1 = await startOn(page, 'mtmoon');
	A(st1.picked && st1.ok && st1.map === 'mtmoon' && st1.zmap === 'mtmoon' && st1.dv === 18 && st1.biome === 1, 'Classic starts on Mt. Moon (dv 17): its zone, painted in the crystal cave\'s palette', JSON.stringify(st1));
	const live = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = C.run, M = C.MAPS.mtmoon, out = {};
		for (const kind of ['totem', 'summoner']) {
			H.thin();
			const ev = S.plan.events.find(e => e.kind === kind);
			const e0 = C.fireEvent(ev, [G.Game.player]);
			const sp = G.EnemyMgr.all().filter(e => !e.dead && e.xk === kind);
			out[kind] = { dex: ev.dex[0], spawned: e0 && e0.spawned, xk: sp.length, inPool: M[kind][0].includes(ev.dex[0]), minion: sp[0] && sp[0].def ? sp[0].def.minion : sp[0] && sp[0].minion };
		}
		out.say = C.MAPS.mtmoon.flockSay;
		return out;
	});
	A(live.totem && live.totem.spawned === 1 && live.totem.xk === 1 && live.totem.inPool && live.summoner.spawned === 1 && live.summoner.inPool,
		'in a live Mt. Moon run a totem and a summoner of the map appear (e.g. Clefairy calling Cleffa)', JSON.stringify(live));

	// ======================== 3. Survival: milestones, segments, hazards
	const sv = await E(page, () => {
		const S = G.ExpSurv, C = G.ExpClassic, out = {};
		for (const map of ['viridian', 'mtmoon', 'cerulean']) {
			const m = n => S.milestone(n, map, 4242);
			const M = C.MAPS[map];
			out[map] = { l3: m(3).dex, l6: m(6).dex, l9: m(9).dex, m1: M.guardians[0].includes(m(1).dex), m4: M.guardians[0].includes(m(4).dex) || M.guardians[1].includes(m(4).dex), legends: S.K.LEGENDS[map],
				seg: S.segPlan(4242, map, 3, 'normal').every(e => (e.kind !== 'stampede' || [].concat(...M.stampede).includes(e.dex[0])) && (e.kind !== 'flock' || [].concat(...M.flock).includes(e.dex[0])) && (e.kind !== 'totem' || [].concat(...M.totem).includes(e.dex[0]))),
				haz: S.hazardsOf(G.ExpTerrain.generate({ seed: 4242, map, zone: 1 })).length, pal: S.hazPal(map, 'burning') };
		}
		out.pure = JSON.stringify(S.milestone(6, 'mtmoon', 4242)) === JSON.stringify(S.milestone(6, 'mtmoon', 4242));
		return out;
	});
	A(sv.mtmoon && sv.mtmoon.l3 === 36 && [144, 145, 146].includes(sv.mtmoon.l6) && sv.mtmoon.l9 === 150 && sv.cerulean.l3 === 145 && [144, 146, 151].includes(sv.cerulean.l6) && sv.cerulean.l9 === 150 && sv.viridian.l3 === 151 && sv.pure,
		'Survival\'s legendary milestones per map (G.ExpSurv.K.LEGENDS): Mt. Moon Clefable then a bird, Cerulean Cape Zapdos then another, Mewtwo at 45:00 on all (Viridian still Mew)', JSON.stringify(sv));
	A(MAPS2.every(m => sv[m] && sv[m].m1 && sv[m].m4 && sv[m].seg && sv[m].haz >= 8), 'Survival on the new maps: the milestone bosses are the map\'s guardians, the segment timeline draws from its pools, its lands get hazards', JSON.stringify(sv));
	A(sv.mtmoon && JSON.stringify(sv.mtmoon.pal) !== JSON.stringify(sv.viridian.pal) && JSON.stringify(sv.cerulean.pal) !== JSON.stringify(sv.viridian.pal) && sv.viridian.pal[0] === '#ff6a2a',
		'the hazards\' colours per map (Mt. Moon moon-fire, Cerulean Cape live sparks; Viridian keeps D11\'s)', JSON.stringify({ v: sv.viridian.pal, m: sv.mtmoon && sv.mtmoon.pal, c: sv.cerulean && sv.cerulean.pal }));
	const sr = await startOn(page, 'cerulean', 'exp-survival');
	const ms = await E(page, () => {
		const H = window.__t, S = G.ExpSurv;
		H.jump(899.9, 2); H.step(6);
		const b = S.run.bosses[0], e = b && b.e;
		return { map: S.run.map, miles: S.run.miles, dex: e && e.dex, xk: e && e.xk, biome: G.World.biome, line: G.ExpClassic.hudLine(G.Game.player, G.Game.st) };
	});
	A(sr.ok && sr.mode === 'exp-survival' && sr.map === 'cerulean' && ms.map === 'cerulean' && ms.miles === 3 && ms.dex === 145 && ms.xk === 'legend',
		'a Survival run on Cerulean Cape: at 15:00 the legendary milestone is Zapdos', JSON.stringify({ sr, ms }));
	if (SHOTS) {
		await E(page, () => { const e = G.ExpSurv.run.bosses[0].e, pl = G.Game.player; e.x = pl.x + 120; e.y = pl.y - 40; G.Camera.x = pl.x + 50; G.Camera.y = pl.y - 20; });
		await shoot(page, 'maps_survival_cerulean_desktop.png');
	}

	// ======================== 4 + 5. the panel, the unlock rule
	const un = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.Game.state !== 'over') G.Game.quit();
		await wait(300);
		if (G.ExpEco && G.ExpEco.pick) G.ExpEco.closePick(true);
		G.Flow.goMenu();
		// a fresh Expedition save's counters (this page's): nothing won
		const Sv = G.ExpSave, keep = {};
		for (const m of ['viridian', 'mtmoon', 'cerulean']) for (const d of ['normal', 'hard', 'nightmare']) { const k = 'wins.' + m + '.' + d; keep[k] = Sv.get(k); Sv.data.counters[k] = 0; }
		const T = G.ExpTier, out = {};
		const tabs = async () => {
			G.ModesUI.open(); await wait(150);
			T.open(); await wait(250);
			const r = [...document.querySelectorAll('#modes-xtier [data-map]')].map(b => ({ m: b.dataset.map, dis: b.getAttribute('aria-disabled') === 'true', txt: b.innerText.replace(/\s+/g, ' ').trim() }));
			const all = (document.getElementById('modes-xtier') || {}).innerText || '';
			T.close(true);
			return { r, soon: /Coming soon/i.test(all) };
		};
		out.fresh = { open: ['viridian', 'mtmoon', 'cerulean'].map(T.mapOpen), play: T.playable(), pickM: T.setPick('mtmoon', 'normal'), pickC: T.setPick('cerulean', 'normal'), pick: T.pick(), tabs: await tabs() };
		Sv.bump('wins.viridian.hard');   // (a win on any tier opens the next map)
		out.one = { open: ['viridian', 'mtmoon', 'cerulean'].map(T.mapOpen), pickM: T.setPick('mtmoon', 'normal'), pickC: T.setPick('cerulean', 'normal'), pick: T.pick(), tabs: await tabs(), hardM: T.isOpen('mtmoon', 'hard') };
		Sv.bump('wins.mtmoon.normal');
		out.two = { open: ['viridian', 'mtmoon', 'cerulean'].map(T.mapOpen), pickC: T.setPick('cerulean', 'normal'), pick: T.pick(), tabs: await tabs() };
		for (const k in keep) Sv.data.counters[k] = keep[k];
		G.Flow.goMenu();
		return out;
	});
	A(un.fresh && JSON.stringify(un.fresh.open) === '[true,false,false]' && un.fresh.play.length === 3 && un.fresh.pickM === false && un.fresh.pickC === false && un.fresh.pick.map === 'viridian',
		'the unlock rule, a fresh save: only Viridian Forest is open (Mt. Moon / Cerulean Cape refused; the pick stays on Viridian)', JSON.stringify(un.fresh));
	const tb = (o, m) => (o && o.tabs && o.tabs.r.find(t => t.m === m)) || {};
	A(un.fresh && !un.fresh.tabs.soon && tb(un.fresh, 'mtmoon').dis && /Clear Viridian Forest first/.test(tb(un.fresh, 'mtmoon').txt) && /Clear Mt\. Moon first/.test(tb(un.fresh, 'cerulean').txt) && !tb(un.fresh, 'viridian').dis,
		'the panel\'s map tabs: no "Coming soon"; a locked map says which map opens it ("Clear Viridian Forest first", "Clear Mt. Moon first")', JSON.stringify(un.fresh && un.fresh.tabs));
	A(un.one && JSON.stringify(un.one.open) === '[true,true,false]' && un.one.pickM === true && un.one.pickC === false && un.one.pick.map === 'mtmoon' && !tb(un.one, 'mtmoon').dis && tb(un.one, 'cerulean').dis && un.one.hardM === false,
		'a Viridian win (on Hard here: any tier) opens Mt. Moon on Normal (its own tiers unlock in sequence); Cerulean Cape still locked', JSON.stringify(un.one));
	A(un.two && JSON.stringify(un.two.open) === '[true,true,true]' && un.two.pickC === true && un.two.pick.map === 'cerulean' && !tb(un.two, 'cerulean').dis,
		'a Mt. Moon win opens Cerulean Cape', JSON.stringify(un.two));

	// ======================== 6. a Classic run won on each map (fast-forward)
	for (const map of MAPS2) {
		const st = await startOn(page, map);
		const win = await E(page, async (map) => {
			const H = window.__t, C = G.ExpClassic, S = C.run, M = C.MAPS[map];
			const next = { mtmoon: 'cerulean', cerulean: null }[map];
			// (the next map locked again, to see the win open it)
			if (next) for (const d of ['normal', 'hard', 'nightmare']) G.ExpSave.data.counters['wins.' + map + '.' + d] = 0;
			const bosses = [];
			for (let z = 1; z <= 3; z++) { const b = H.beatBoss(); bosses.push(b); H.through(); }
			const shrine = { zone: S.zone, map: G.World.zone.map, hash: G.World.zone.hash };
			const leg = H.beatBoss();
			H.step(Math.ceil(C.K.WIN_T * 30) + 10);
			await new Promise(r => setTimeout(r, 300));
			const over = document.getElementById('scr-over');
			return { bosses, okG: bosses.every((b, i) => b.down && M.guardians[i].includes(b.dex)), shrine, leg, won: S.won, splits: S.splits.length, state: G.Game.state,
				ttl: (document.getElementById('over-title') || {}).innerText, text: over.innerText.replace(/\s+/g, ' ').slice(0, 400), lines: (window.__out || {}).lines,
				wins: G.ExpSave.get('wins.' + map + '.normal'), nextOpen: next ? G.ExpTier.mapOpen(next) : null };
		}, map);
		const name = map === 'mtmoon' ? 'Mt. Moon' : 'Cerulean Cape', legend = map === 'mtmoon' ? 36 : 145;
		A(st.ok && st.map === map && win.okG && win.shrine && win.shrine.zone === 4 && win.shrine.map === map && win.leg && win.leg.dex === legend && win.leg.down && win.won && win.splits === 4,
			`${name}: a Classic run won (fast-forward): its 3 guardians, then its shrine boss (${legend === 36 ? 'Clefable' : 'Zapdos'}) at its shrine`, JSON.stringify({ st, bosses: win.bosses, shrine: win.shrine, leg: win.leg, won: win.won }));
		A(win.state === 'over' && /^EXPEDITION COMPLETE!$/.test(win.ttl || '') && new RegExp(name.replace('.', '\\.') + ' · Normal').test(win.text) && win.wins >= 1,
			`${name}: the victory screen ("EXPEDITION COMPLETE!", ${name} · Normal) and the win in the Expedition save`, JSON.stringify({ ttl: win.ttl, text: win.text, wins: win.wins }));
		if (map === 'mtmoon') A(win.nextOpen === true && (win.lines || []).some(l => /^New map open: Cerulean Cape$/.test(l)), 'winning Mt. Moon opens Cerulean Cape ("New map open: Cerulean Cape" on the run-over screen)', JSON.stringify(win.lines));
	}

	// ======================== 7. sync: guest / spectator / replay on Cerulean Cape
	const rec = await E(page, async () => {
		window.__t.thaw();
		G.Flow.goMenu();
		await new Promise(r => setTimeout(r, 200));
		G.ExpTier.setPick('cerulean', 'normal');
		await G.Flow.play('exp-classic');
		window.__t.freeze();
		const H = window.__t, C = G.ExpClassic, S = C.run;
		H.sturdy(); H.thin();
		H.toAltar(); H.step(Math.ceil(C.K.ALTAR_T * 30) + 6);
		H.step(30);
		const mid = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const b = S.boss; while (b && !b.dead) { b.hurt(b.maxHp / 20); H.step(1); }
		H.away(); H.step(40);
		const open = JSON.parse(JSON.stringify(G.Spectate.snap()));
		G.Game.quit();
		await new Promise(r => setTimeout(r, 200));
		const e = G.Replay.last;
		await e.ready;
		return { seed: G.World.seed, mid, open, code: e.code, hash: mid.x && mid.x.th, m: mid.x && mid.x.m, altar: C.sitesOf(G.World.zone) && C.sitesOf(G.World.zone).altar, biome: mid.b, dv: mid.dv };
	});
	A(rec.m === 'cerulean' && rec.dv === 18 && rec.mid.x.c && rec.mid.x.c.p === 1 && rec.open.x.c.p === 2 && rec.biome === pure.water, 'a Cerulean Cape run\'s snapshots name the map (x.m), dv 14 and its palette (b)', JSON.stringify({ m: rec.m, dv: rec.dv, b: rec.biome, c: rec.mid.x && rec.mid.x.c }));
	await d0.ctx.close();
	{
		const d = await bootPage();
		const g = await E(d.page, async (rec, water) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
			G.Flow.play('normal');
			H.freeze();
			G.World.reset(rec.seed);
			const pl = G.Game.player;
			const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
			G.Coop.begin({ seed: rec.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 4 }, { uid: G.Net.uid, name: 'me', dex: 4 }] }, pl, cb);
			const frame = { k: 'f', t: 1, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [], x: rec.open.x };
			H.deliver('alice', frame);
			for (let i = 0; i < 100 && !(G.Exp && G.World.zone && G.World.zone.hash === rec.open.x.th); i++) await wait(50);
			H.deliver('alice', Object.assign({}, frame, { t: 2 }));
			const C = G.ExpClassic;
			out.guest = { hash: G.World.zone && G.World.zone.hash, map: G.World.zone && G.World.zone.map, altar: C && C.sitesOf(G.World.zone) && C.sitesOf(G.World.zone).altar, cur: C && C.cur() && C.cur().ph, biome: G.World.biome };
			G.Coop.end();
			G.Game.quit();
			await wait(200);
			G.MicaAccount.name = () => 'viewer';
			G.Spectate.watch = (u, h) => { h.snapshot(rec.mid, {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 60 && !(G.World.zone && G.World.zone.hash === rec.mid.x.th); i++) await wait(50);
			await wait(300);
			out.spec = { hash: G.World.zone && G.World.zone.hash, ph: C.cur() && C.cur().ph, biome: G.World.biome, notice: G.Expedition.viewNotice('exp-classic', 11) };
			G.WatchUI.leave();
			const rd = await G.Replay.open(rec.code);
			let portal = -1;
			for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.c && s.x.c.p === 2 && portal < 0) portal = i; }
			G.WatchUI.playReplay(rd, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rec.hash); i++) { G.WatchUI.seek(rd.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			G.WatchUI.seek(rd.times[portal]); await wait(150);
			out.replay = { portal, hash: G.World.zone && G.World.zone.hash, ph: C.cur() && C.cur().ph, biome: G.World.biome, map: rd.meta && rd.meta.map };
			G.WatchUI.leave();
			out.oldOk = G.Expedition.replayOk(10) && G.Expedition.replayOk(1);
			out.water = water;
			return out;
		}, rec, pure.water);
		A(g.loadedBefore === false && g.guest && g.guest.hash === rec.hash && g.guest.map === 'cerulean' && JSON.stringify(g.guest.altar) === JSON.stringify(rec.altar) && g.guest.cur === 2 && g.guest.biome === pure.water,
			'a co-op guest (a fresh page; a host frame) rebuilds the same Cerulean Cape zone, altar and palette, the portal open', JSON.stringify(g.guest || g));
		A(g.spec && g.spec.hash === rec.hash && g.spec.ph === 1 && g.spec.biome === pure.water && g.spec.notice === false, 'a live spectator sees the same Cerulean Cape zone, palette and guardian fight (no version notice at dv 14)', JSON.stringify(g.spec));
		A(g.replay && g.replay.portal > 0 && g.replay.hash === rec.hash && g.replay.ph === 2 && g.replay.biome === pure.water && g.oldOk === true,
			'a replay viewer plays the Cerulean Cape run on the same zone and palette; dv-10 and dv-1 replays still play', JSON.stringify(g.replay));
		await d.ctx.close();
	}

	// ======================== 8 + 9. the phone, and the screenshots (each map: a Classic zone, the shrine; desktop and phone)
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		await load(d.page);
		if (tag === 'phone') {
			const pn = await E(d.page, async () => {
				const wait = ms => new Promise(r => setTimeout(r, ms));
				window.__t.thaw();
				G.ModesUI.open(); await wait(150); G.ExpTier.open(); await wait(300);
				const box = document.querySelector('#modes-xtier .xt-maps'), tabs = [...document.querySelectorAll('#modes-xtier [data-map]')].map(b => b.getBoundingClientRect());
				const out = { W: innerWidth, sw: document.documentElement.scrollWidth, box: box && { sw: box.scrollWidth, cw: box.clientWidth }, tabs: tabs.map(r => [Math.round(r.left), Math.round(r.right), Math.round(r.top)]) };
				G.ExpTier.close(true); G.Flow.goMenu();
				return out;
			});
			A(pn.sw <= pn.W && pn.tabs.length === 3 && pn.tabs.every(t => t[0] >= 0 && t[1] <= pn.W), 'phone: the tier panel\'s three map tabs fit (no sideways scroll; the lock note included)', JSON.stringify(pn));
			if (SHOTS) {
				await E(d.page, async () => { G.ModesUI.open(); await new Promise(r => setTimeout(r, 150)); G.ExpTier.open(); });
				await shoot(d.page, 'maps_tierpanel_phone.png', 400);
				await E(d.page, () => { G.ExpTier.close(true); G.Flow.goMenu(); });
			}
		}
		for (const map of MAPS2) {
			const st = await startOn(d.page, map);
			const lay = await E(d.page, async () => {
				const H = window.__t, C = G.ExpClassic;
				H.thaw();
				await new Promise(r => setTimeout(r, 600));
				const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
				H.freeze();
				return { R, W: innerWidth, touch: G.Touch.active, line: C.hudLine(G.Game.player, G.Game.st), biome: G.World.biome };
			});
			const R = lay.R || [], ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, hits = [];
			for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (ov(R[i], R[j]) && !['minimap'].includes(R[i].name)) hits.push(R[i].name + ' x ' + R[j].name);
			const clock = R.find(o => o.name === 'clock');
			A(st.ok && clock && clock.x + clock.w <= lay.W && !hits.length && /^ZONE 1\/3/.test(lay.line || ''), `${tag} ${map}: Classic runs; the zone line ("${lay.line}") fits and nothing on the HUD overlaps`, JSON.stringify({ hits, clock, W: lay.W, st }));
			if (tag === 'phone' && map === 'mtmoon') A(lay.touch, 'phone: touch controls are on');
			if (SHOTS) {
				// the zone round a bounce pad, then the shrine
				await E(d.page, () => { const z = G.World.zone, p = z.pads[0] || [0, 0], TS = G.World.TS, pl = G.Game.player; pl.x = (p[0] + 0.5) * TS - 40; pl.y = (p[1] + 2.5) * TS; pl.zMask = null; G.World.collide(pl); G.Camera.x = pl.x; G.Camera.y = pl.y - 30; });
				await shoot(d.page, `maps_zone_${map}_${tag}.png`, 900);
				await E(d.page, () => { const H = window.__t; for (let z = 1; z <= 3; z++) { H.beatBoss(); H.through(); } const [x, y] = H.altarXY(); const pl = G.Game.player; pl.x = x; pl.y = y + 120; pl.zMask = null; G.Camera.x = x; G.Camera.y = y - 10; });
				await shoot(d.page, `maps_shrine_${map}_${tag}.png`, 1100);
			}
		}
		if (SHOTS) {
			// a Survival milestone on each map
			for (const map of MAPS2) {
				await startOn(d.page, map, 'exp-survival');
				await E(d.page, (map) => { const H = window.__t, S = G.ExpSurv; H.jump(map === 'mtmoon' ? 899.9 : 299.9, map === 'mtmoon' ? 2 : 0); H.step(6); const b = S.run.bosses[0]; const pl = G.Game.player; if (b) { b.e.x = pl.x + 110; b.e.y = pl.y - 40; } G.Camera.x = pl.x + 40; G.Camera.y = pl.y - 20; }, map);
				await shoot(d.page, `maps_survival_${map}_${tag}.png`, 800);
			}
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
