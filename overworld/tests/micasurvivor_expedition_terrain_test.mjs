// micasurvivor_expedition_terrain_test.mjs — MicaSurvivor DLC D1: the Expedition's terrain layers
// (micasurvivor/js/expedition/terrain.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.2 and the D1 row).
// A static server, headless Chrome, a fixed guest profile; an Expedition mode is turned on for the test
// (G.Expedition.debugEnable: D1 still ships them as "Coming soon"). One browser at a time.
//   1. the generator: the same seed + map + zone gives the identical zone (heights, kinds, ramps, props, hash), another
//      seed / zone another one, and it never draws Math.random (its own G.DLC.rng stream); heights 0..3 are all used,
//      neighbours differ by at most 1, the spawn is a flat clearing
//   2. connectivity: for the run's zone and 45 more (3 maps x 15 seeds), a flood-fill from the spawn with the GAME's
//      own rule (G.World.walkable + G.World.maskAt: two tiles join if their layer masks share a bit) reaches every
//      walkable tile, also with trees and rocks counted as walls (props can't cut a path)
//   3. the player (a hand-made zone: a plateau north of a cliff, one ramp): walking north into the cliff stops at its
//      foot (layer 0); walking north up the ramp reaches the plateau (layer 1, entity.layer 0.5 on the ramp); walking
//      south off the plateau stops at the edge (no hop-down before D2); back down the ramp works
//   4. a ground enemy south of the cliff reaches a player on the plateau by going round to the ramp (through its tile,
//      never across a cliff edge); with the ramp removed it never gets up
//   5. a flyer (Butterfree hovers) flies straight over the cliff, ignoring the terrain, as before
//   6. the minimap: by height, low ground darker and plateaus lighter (mean luminance rises with each level), ramps
//      sandy, cliff faces dark; the same tile without a zone is the base colour
//   7. the `x` block v1 {xv, m, z, th} on the live snapshot and the co-op host frame; terrain itself is never sent.
//      A fresh page rebuilds the same zone (same hash, same layer masks) as a replay viewer (the run's own recorded
//      replay through G.WatchUI), as a live spectator (a snapshot through G.WatchUI.watchLive) and as a co-op guest
//      (the host frame's `x` through G.Expedition.viewZone); an unknown `x` schema is ignored
//   8. base runs untouched: after the Expedition run a Normal run has no zone, and its snapshot / host frame no `x`
//   9. rendering: the zone painted at desktop (1280x720) and phone size (844x390, touch), screenshots of both
//      (SHOTS=<dir>, default: none written), the canvas not blank, no page errors
//   node overworld/tests/micasurvivor_expedition_terrain_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites, as the other micasurvivor tests.
//  MICASURVIVOR_ROOT=<dir> serves micasurvivor/ from another tree: how the "fails before D1" count was taken.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
const PORT = 8844;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 600) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

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
	owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { 4: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 } },
};

// ---------------------------------------------------------------- the page side (before any page script)
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, draws: 0 };
	const rnd = Math.random;
	Math.random = function random() { H.draws++; return rnd(); };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dterrain1');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
	let held = [];
	H.hold = list => { for (const k of held) if (!list.includes(k)) key('keyup', k); for (const k of list) if (!held.includes(k)) key('keydown', k); held = list.slice(); };
	/** n fixed steps of 1/60 s with these keys held (then released); fn(i) after each step */
	H.steps = (n, keys, fn) => { H.hold(keys || []); for (let i = 0; i < n; i++) { G.Game.debugStep(1, 1 / 60); if (fn && fn(i) === false) break; } H.hold([]); };
	H.tile = v => Math.floor(v / G.World.TS);
	/** a quiet run: no spawns, events, rifts; the player can't be hurt (TEST ONLY) */
	H.quiet = () => {
		G.Spawner.update = () => {}; G.Events.update = () => {}; G.Rift.update = () => {};
		const pl = G.Game.player; pl.hurt = () => {};
		G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear();
	};
	/** the hand-made zone of the player / enemy scenarios: a plateau (height 1) north of row 0, one ramp at (6, 0) */
	H.cliffZone = (withRamp = true) => G.ExpTerrain.custom({ w: 24, h: 24, map: 'custom', hgt: (x, y) => y < 12 ? 1 : 0,
		ramp: (x, y) => withRamp && x === 18 && y === 12 ? 1 : 0 });
	H.place = (e, tx, ty) => { e.x = tx * G.World.TS + G.World.TS / 2; e.y = ty * G.World.TS + G.World.TS / 2; e.zMask = null; if (!e.flying) G.World.collide(e); };
	/** the game's own reachability: BFS over G.World.walkable + G.World.maskAt (props count as walls through walkable) */
	H.flood = () => {
		const z = G.World.zone, W = G.World;
		const sx = H.tile(z.spawn[0]), sy = H.tile(z.spawn[1]);
		const id = (x, y) => (y - z.y0) * z.w + (x - z.x0);
		const seen = new Uint8Array(z.w * z.h), q = [[sx, sy]];
		seen[id(sx, sy)] = 1;
		while (q.length) {
			const [x, y] = q.pop(), m = W.maskAt(x, y);
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy;
				if (!z.inside(nx, ny) || seen[id(nx, ny)] || !W.walkable(nx, ny) || !(W.maskAt(nx, ny) & m)) continue;
				seen[id(nx, ny)] = 1; q.push([nx, ny]);
			}
		}
		let walk = 0, reached = 0;
		for (let y = z.y0; y < z.y0 + z.h; y++) for (let x = z.x0; x < z.x0 + z.w; x++) {
			if (!W.walkable(x, y)) continue;
			walk++; if (seen[id(x, y)]) reached++;
		}
		return { walk, reached };
	};
};

// ---------------------------------------------------------------- the browser
const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

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
		return { ctx, page, menu };
	}
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 300) }; } };
	/** start an Expedition Classic run (turned on for the test) and freeze the real frames */
	const startExp = page => E(page, async () => {
		if (!G.Expedition.debugEnable('exp-classic')) return { error: 'no exp-classic' };
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		return { ok, state: G.Game.state, mode: G.Game.mode, zone: !!G.World.zone };
	});
	const shoot = async (page, name) => {
		if (!SHOTS) return null;
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await page.screenshot({ path: f });
		return f;
	};

	// ======================== desktop page: generator, connectivity, movement, pathing, minimap, x block
	const { ctx, page, menu } = await bootPage();
	A(menu, 'boots to the menu as a guest');
	const run = await startExp(page);
	A(run.ok === true && run.state === 'playing' && run.mode === 'exp-classic', 'an Expedition Classic run starts (turned on for the test)', JSON.stringify(run));
	A(run.zone === true, 'the run is in an Expedition zone (G.World.zone)', JSON.stringify(run));

	// 1. the generator
	const gen = await E(page, () => {
		const T = G.ExpTerrain, z = G.World.zone, H = window.__t;
		const d0 = H.draws;
		const a = T.generate({ seed: G.World.seed, map: 'viridian', zone: 1 }), b = T.generate({ seed: G.World.seed, map: 'viridian', zone: 1 });
		const drawn = H.draws - d0;
		const same = ['hgt', 'kind', 'ramp', 'prop'].every(k => a[k].length === b[k].length && a[k].every((v, i) => v === b[k][i]));
		const other = T.generate({ seed: G.World.seed + 1, map: 'viridian', zone: 1 }).hash, zone2 = T.generate({ seed: G.World.seed, map: 'viridian', zone: 2 }).hash;
		let maxStep = 0, flatSpawn = true;
		const sh = z.height(0, 0);
		for (let y = z.y0; y < z.y0 + z.h; y++) for (let x = z.x0; x < z.x0 + z.w; x++) {
			if (z.terr(x, y) === 1) continue;
			for (const [dx, dy] of [[1, 0], [0, 1]]) if (z.inside(x + dx, y + dy) && z.terr(x + dx, y + dy) !== 1) maxStep = Math.max(maxStep, Math.abs(z.height(x, y) - z.height(x + dx, y + dy)));
			if (x * x + y * y <= 25 && (z.height(x, y) !== sh || z.terr(x, y) !== 0 || z.rampDir(x, y))) flatSpawn = false;
		}
		const levels = T.audit(z).levels;
		return { same, hashA: a.hash, hashB: b.hash, run: z.hash, other, zone2, drawn, maxStep, flatSpawn, levels, stats: z.stats, map: z.map, zn: z.zone, w: z.w, h: z.h, ms: a.stats.ms };
	});
	A(gen.same && gen.hashA === gen.hashB, 'the generator is deterministic: the same seed + map + zone gives the identical heightmap, kinds, ramps and props', JSON.stringify(gen));
	A(gen.run === gen.hashA && gen.map === 'viridian' && gen.zn === 1 && gen.w === 120 && gen.h === 120, "the run's zone is exactly that one (world seed, Viridian, zone 1, 120x120)", JSON.stringify(gen));
	A(gen.other && gen.other !== gen.hashA && gen.zone2 !== gen.hashA, 'another seed, or another zone, gives another zone', JSON.stringify(gen));
	A(gen.drawn === 0, 'the generator never draws Math.random (its own seeded G.DLC.rng stream)', String(gen.drawn));
	A(gen.levels && gen.levels.every(n => n > 200) && gen.maxStep === 1 && gen.flatSpawn, `heights 0..3 all used (${gen.levels}), neighbours differ by at most 1, the spawn is a flat clearing`, JSON.stringify(gen));
	A(gen.stats && gen.stats.ramps > 3 && gen.stats.extra >= 0 && gen.ms < 400, `ramps placed (${gen.stats && gen.stats.ramps} to connect + ${gen.stats && gen.stats.extra} along long cliffs), generated in ${gen.ms} ms`, JSON.stringify(gen.stats));

	// 2. connectivity, with the game's own rule
	const conn = await E(page, () => {
		const out = [], H = window.__t, keep = G.World.zone;
		const run = H.flood();
		for (const map of G.ExpTerrain.MAPS) for (let s = 1; s <= 15; s++) {
			const z = G.ExpTerrain.generate({ seed: s * 104729 + 7, map, zone: 1 + (s % 3) });
			G.World.setZone(z);
			const f = H.flood(), a = G.ExpTerrain.audit(z);
			out.push([map, s, f.walk, f.reached, a.walk, a.reached, a.walkP, a.reachedP, a.liquid, a.liquidReached]);
		}
		G.World.setZone(keep);
		return { run, out };
	});
	A(conn.run && conn.run.walk > 5000 && conn.run.walk === conn.run.reached, `every walkable tile of the run's zone is reachable from the spawn (${conn.run && conn.run.reached} / ${conn.run && conn.run.walk}, BFS over G.World.walkable + maskAt)`, JSON.stringify(conn.run));
	const bad = (conn.out || []).filter(r => r[2] !== r[3] || r[4] !== r[5] || r[6] !== r[7] || r[8] !== r[9]);
	A(conn.out && conn.out.length === 45 && !bad.length, `45 more zones (3 maps x 15 seeds): every walkable tile reachable, with props as walls too, all water reachable`, JSON.stringify(bad.slice(0, 3)));

	// 3. the player: a cliff blocks, the ramp climbs
	const plr = await E(page, () => {
		const H = window.__t, pl = G.Game.player, W = G.World;
		H.quiet();
		W.setZone(H.cliffZone(true));
		const r = {};
		H.place(pl, 0, 1);
		let minY = pl.y;
		H.steps(90, ['KeyW'], () => { minY = Math.min(minY, pl.y); });
		r.cliff = { ty: H.tile(pl.y), minTy: H.tile(minY), layer: pl.layer, mask: pl.zMask, y: Math.round(pl.y) };
		H.place(pl, 6, 2);
		let onRamp = false;
		H.steps(100, ['KeyW'], () => { if (pl.layer === 0.5) onRamp = true; });
		r.ramp = { ty: H.tile(pl.y), tx: H.tile(pl.x), layer: pl.layer, mask: pl.zMask, onRamp };
		H.place(pl, 0, -2);
		let maxY = pl.y;
		H.steps(90, ['KeyS'], () => { maxY = Math.max(maxY, pl.y); });
		r.edge = { ty: H.tile(pl.y), maxTy: H.tile(maxY), layer: pl.layer, mask: pl.zMask };
		H.place(pl, 6, -3);
		H.steps(100, ['KeyS']);
		r.down = { ty: H.tile(pl.y), layer: pl.layer, mask: pl.zMask };
		return r;
	});
	A(plr.cliff && plr.cliff.minTy >= 0 && plr.cliff.layer === 0 && plr.cliff.mask === 1, 'the player walking north into the cliff stops at its foot (never on the plateau, layer 0)', JSON.stringify(plr.cliff || plr));
	A(plr.ramp && plr.ramp.ty < 0 && plr.ramp.layer === 1 && plr.ramp.mask === 2 && plr.ramp.onRamp, 'walking north up the ramp reaches the plateau (layer 0.5 on the ramp, then 1)', JSON.stringify(plr.ramp || plr));
	A(plr.edge && plr.edge.maxTy < 0 && plr.edge.layer === 1, 'walking south off the plateau stops at the edge (no hop-down before D2)', JSON.stringify(plr.edge || plr));
	A(plr.down && plr.down.ty > 0 && plr.down.layer === 0 && plr.down.mask === 1, 'back down the ramp to the low ground', JSON.stringify(plr.down || plr));

	// 4. + 5. a ground enemy goes round to the ramp; a flyer goes straight over
	const foe = await E(page, () => {
		const H = window.__t, pl = G.Game.player, W = G.World;
		const chase = (withRamp, dex, secs) => {
			H.quiet();
			W.setZone(H.cliffZone(withRamp));
			G.Path.clear();
			H.place(pl, 0, -4);
			const e = new G.Enemy({ dex, name: 'x', behavior: 'chase', hp: 99999, spd: 95, dmg: 1, xp: 1 }, 0, 0, { hp: 1, spd: 1, dmg: 1 });
			H.place(e, 0, 4);
			G.EnemyMgr.add(e);
			const tiles = new Set(), masks = [];
			let jumps = 0, minDist = 1e9, maxAbsX = 0, crossedAt = null, prev = e.zMask;
			H.steps(secs * 60, [], i => {
				tiles.add(H.tile(e.x) + ',' + H.tile(e.y));
				if (prev != null && e.zMask != null && !(prev & e.zMask)) jumps++;
				prev = e.zMask;
				maxAbsX = Math.max(maxAbsX, Math.abs(H.tile(e.x)));
				const d = Math.hypot(e.x - pl.x, e.y - pl.y);
				minDist = Math.min(minDist, d);
				if (crossedAt == null && H.tile(e.y) < 0) crossedAt = i;
				pl.x = 16; pl.y = -4 * 32 + 16;   // the player stays put
			});
			return { flying: e.flying, layer: e.layer, mask: e.zMask, ty: H.tile(e.y), viaRamp: tiles.has('6,0'), jumps, minDist: Math.round(minDist), maxAbsX, crossedAt };
		};
		return { walk: chase(true, 19, 20), noRamp: chase(false, 19, 10), fly: chase(true, 12, 6) };
	});
	A(foe.walk && !foe.walk.flying && foe.walk.ty < 0 && foe.walk.layer === 1 && foe.walk.viaRamp && foe.walk.jumps === 0 && foe.walk.minDist < 60,
		`a ground enemy south of the cliff reaches the player on the plateau by the ramp (through its tile, never across a cliff edge; closest ${foe.walk && foe.walk.minDist})`, JSON.stringify(foe.walk || foe));
	A(foe.noRamp && foe.noRamp.ty >= 0 && foe.noRamp.layer === 0 && foe.noRamp.jumps === 0, 'with the ramp removed it never gets up the cliff', JSON.stringify(foe.noRamp || foe));
	A(foe.fly && foe.fly.flying && foe.fly.mask == null && !foe.fly.viaRamp && foe.fly.maxAbsX <= 1 && foe.fly.crossedAt != null && foe.fly.crossedAt < 240 && foe.fly.minDist < 60,
		'a flyer (Butterfree hovers) flies straight over the cliff, ignoring the terrain', JSON.stringify(foe.fly || foe));

	// 6. the minimap: shading by height
	const mm = await E(page, () => {
		const keep = G.Exp.enterZone(1), z = G.World.zone;
		const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
		const acc = [[0, 0], [0, 0], [0, 0], [0, 0]];
		let ramp = null, face = null, faceN = null, sample = null;
		for (let y = z.y0 + 1; y < z.y0 + z.h - 1; y++) for (let x = z.x0 + 1; x < z.x0 + z.w - 1; x++) {
			if (z.terr(x, y) !== 0) continue;
			const c = G.Minimap.colorAt(x, y), h = z.height(x, y);
			if (z.rampDir(x, y)) { if (!ramp) ramp = { c, base: null, x, y }; continue; }
			const south = z.terr(x, y + 1) !== 1 && z.height(x, y + 1) < h;
			if (south) { if (!face) face = { c, h, x, y }; continue; }
			acc[h][0] += lum(c); acc[h][1]++;
			if (!sample && h === 3) sample = { x, y, c };
		}
		const mean = acc.map(([s, n]) => n ? Math.round(s / n) : null);
		G.World.setZone(null);
		const baseRamp = ramp && G.Minimap.colorAt(ramp.x, ramp.y), baseSample = sample && G.Minimap.colorAt(sample.x, sample.y);
		G.World.setZone(keep);
		return { mean, ramp: ramp && ramp.c, baseRamp, face: face && face.c, sample: sample && sample.c, baseSample };
	});
	const incr = mm.mean && mm.mean.every((v, i) => i === 0 || (v != null && v > mm.mean[i - 1]));
	A(incr, `minimap shading by height: mean luminance rises with each level (${mm.mean && mm.mean.join(' < ')})`, JSON.stringify(mm));
	A(mm.ramp && mm.baseRamp && mm.ramp[0] > mm.baseRamp[0] && mm.ramp[0] - mm.ramp[2] > mm.baseRamp[0] - mm.baseRamp[2], 'ramps are drawn sandy on the minimap', JSON.stringify([mm.ramp, mm.baseRamp]));
	A(mm.face && mm.mean && 0.299 * mm.face[0] + 0.587 * mm.face[1] + 0.114 * mm.face[2] < mm.mean[0], 'a cliff face (a tile above lower ground) is darker than any level', JSON.stringify(mm.face));
	A(mm.sample && mm.baseSample && mm.sample.some((v, i) => v !== mm.baseSample[i]) && mm.sample[1] > mm.baseSample[1], 'without a zone the same tile is the base colour (the shading is only the zone\'s)', JSON.stringify([mm.sample, mm.baseSample]));

	// 7. the x block on the snapshot and the host frame; the run's replay
	const xb = await E(page, async () => {
		const H = window.__t;
		G.Spawner.update = () => {};
		H.place(G.Game.player, 0, 0);   // back in the run's zone (its clearing)
		H.steps(240, ['KeyD']);   // 4 s of run: the replay records it
		const s = G.Spectate.snap(), f = G.Hooks.reduce('net.frame', { k: 'f' });
		const out = { x: s && s.x, fx: f.x, seed: G.World.seed, hash: G.World.zone.hash, snapSize: JSON.stringify(s).length,
			masks: [], sample: [] };
		for (let i = 0; i < 400; i++) { const tx = ((i * 37) % 120) - 60, ty = ((i * 53) % 120) - 60; out.masks.push(G.World.maskAt(tx, ty)); }
		G.Game.quit();
		const e = G.Replay.last;
		if (e) { await e.ready; const txt = await G.Replay.unpack(e.code); out.code = e.code; out.xInFrames = (txt.match(/"x":\{"xv":1/g) || []).length; out.terrainSent = /"hgt"|"ramp":\[/.test(txt); }
		out.after = { state: G.Game.state };
		window.__t.thaw();
		return out;
	});
	A(xb.x && xb.x.xv === 1 && xb.x.m === 'viridian' && xb.x.z === 1 && xb.x.th === xb.hash, 'the live snapshot carries the x block v1 {xv: 1, m, z, th}', JSON.stringify(xb.x || xb));
	A(xb.fx && JSON.stringify(xb.fx) === JSON.stringify(xb.x), 'the co-op host frame carries the same x block', JSON.stringify(xb.fx));
	A(xb.code && xb.xInFrames >= 1 && !xb.terrainSent, `the run's replay records the x block (${xb.xInFrames}x), never the terrain itself`, JSON.stringify({ n: xb.xInFrames, sent: xb.terrainSent }));
	await ctx.close();

	// the rebuilds: a fresh page (no Expedition code yet) as a replay viewer, a live spectator and a co-op guest
	if (xb.code) {
		const v = await bootPage();
		const rb = await E(v.page, async (code, x, seed) => {
			const out = { loadedBefore: G.Expedition.loaded };
			const rd = await G.Replay.open(code);
			G.WatchUI.playReplay(rd, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash); i++) await new Promise(r => setTimeout(r, 50));
			const masks = () => { const m = []; for (let i = 0; i < 400; i++) { const tx = ((i * 37) % 120) - 60, ty = ((i * 53) % 120) - 60; m.push(G.World.maskAt(tx, ty)); } return m; };
			out.replay = { hash: G.World.zone && G.World.zone.hash, seed: G.World.seed, masks: masks(), loaded: G.Expedition.loaded, state: G.Game.state };
			G.WatchUI.leave();
			// a live spectator: a host snapshot through the live view
			G.MicaAccount.name = () => 'viewer';
			G.Spectate.watch = (u, cb) => { cb.snapshot({ v: 1, t: 10, sd: seed, b: 0, m: 'exp-classic', dv: 1, x, me: [4, 0], p: [0, 0, 0, 0, 100, 100, 0], lv: [1, 0, 10], k: 0, bo: 0, co: 0, mv: [], ac: 0, it: ['', ''], lu: 0, e: [], pk: [] }, {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 60 && !(G.World.zone && G.World.zone.hash === x.th); i++) await new Promise(r => setTimeout(r, 50));
			out.live = { hash: G.World.zone && G.World.zone.hash, masks: masks() };
			G.WatchUI.leave();
			// a co-op guest: the host frame's x, on the guest's world from the start seed
			G.World.reset(seed);
			out.guest = { hash: await G.Expedition.viewZone(seed, x), masks: masks() };
			// an unknown schema: ignored
			G.World.reset(seed);
			out.unknown = { r: await G.Expedition.viewZone(seed, Object.assign({}, x, { xv: 2 })), zone: !!G.World.zone };
			G.World.reset(seed + 1);
			out.otherSeed = await G.Expedition.viewZone(seed + 1, x).then(() => G.World.zone && G.World.zone.hash);
			return out;
		}, xb.code, xb.x, xb.seed);
		const same = o => o && o.hash === xb.hash && JSON.stringify(o.masks) === JSON.stringify(xb.masks);
		A(rb.loadedBefore === false && rb.replay && rb.replay.loaded && rb.replay.seed === xb.seed && same(rb.replay), 'a replay viewer (a fresh page) loads the Expedition code and rebuilds the same zone from seed + x (same hash, same layer masks)', JSON.stringify(rb.replay && { h: rb.replay.hash, want: xb.hash, seed: rb.replay.seed }) || JSON.stringify(rb));
		A(same(rb.live), 'a live spectator rebuilds the same zone from a snapshot', JSON.stringify(rb.live && rb.live.hash));
		A(same(rb.guest), 'a co-op guest rebuilds the same zone from the host frame\'s x', JSON.stringify(rb.guest && rb.guest.hash));
		A(rb.unknown && rb.unknown.r === null && !rb.unknown.zone && rb.otherSeed && rb.otherSeed !== xb.hash, 'an unknown x schema is ignored (no zone); another seed gives another zone', JSON.stringify([rb.unknown, rb.otherSeed]));
		await v.ctx.close();
	} else A(false, 'the rebuilds (no replay recorded)');

	// 8. + 9. base runs untouched; rendering at desktop and phone size
	for (const [name, view] of [['desktop', { width: 1280, height: 720, deviceScaleFactor: 1 }], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		A(d.menu, `${name}: boots to the menu (${view.width}x${view.height})`);
		const st = await startExp(d.page);
		const live = await E(d.page, async () => {
			const pl = G.Game.player;
			pl.hurt = () => {};
			window.__t.thaw();
			await new Promise(r => setTimeout(r, 1200));
			// walk to a ledge so the shot shows a cliff: the nearest ramp, then stand just below it
			const z = G.World.zone;
			let best = null;
			for (let y = z.y0; y < z.y0 + z.h; y++) for (let x = z.x0; x < z.x0 + z.w; x++) if (z.rampDir(x, y) === 1) { const d = x * x + y * y; if (!best || d < best.d) best = { x, y, d }; }
			if (best) { pl.x = best.x * 32 + 16; pl.y = (best.y + 3) * 32 + 16; pl.zMask = null; G.World.collide(pl); G.Camera.x = pl.x; G.Camera.y = pl.y; }
			await new Promise(r => setTimeout(r, 900));
			const cv = document.getElementById('game'), c2 = cv.getContext('2d');
			const px = c2.getImageData(0, 0, cv.width, cv.height).data, cols = new Set();
			for (let i = 0; i < px.length; i += 4 * 97) cols.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
			return { painted: z.painted, colours: cols.size, touch: !!(G.Touch && G.Touch.active), state: G.Game.state, w: cv.width, h: cv.height, minimap: G.Minimap.shown() };
		});
		A(st.ok && live.painted > 200 && live.colours > 60 && live.state === 'playing', `${name}: the zone is painted (${live.painted} tiles through the terrain painter, ${live.colours} colours on the canvas ${live.w}x${live.h})`, JSON.stringify([st, live]));
		if (name === 'phone') A(live.touch, 'phone: the touch controls are up', JSON.stringify(live));
		const f = await shoot(d.page, `expedition_terrain_${name}.png`);
		if (f) console.log('     screenshot: ' + f);
		if (name === 'desktop') {
			const base = await E(d.page, async () => {
				window.__t.freeze();
				G.Game.quit();
				G.Flow.goMenu();
				G.Flow.play('normal');
				window.__t.freeze();
				const s = G.Spectate.snap(), f = G.Hooks.reduce('net.frame', { k: 'f' });
				const out = { mode: G.Game.mode, zone: G.World.zone, sx: 'x' in s, fx: 'x' in f };
				G.Game.quit();
				return out;
			});
			A(base.mode === 'normal' && base.zone === null && !base.sx && !base.fx, 'after the Expedition run a Normal run has no zone, and its snapshot / host frame carry no x', JSON.stringify(base));
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
