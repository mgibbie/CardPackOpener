// micasurvivor_expedition_movement_test.mjs — MicaSurvivor DLC D2: the Expedition's movement verbs
// (micasurvivor/js/expedition/verbs.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.2 and the D2 row).
// A static server, headless Chrome, a fixed guest profile with a synthetic Gamepad API; an Expedition mode is turned on
// for the test (G.Expedition.debugEnable: D2 still ships them as "Coming soon"). One browser at a time.
// Movement is measured on hand-made zones (G.ExpTerrain.custom) with every player's speed set to 100 (no weather /
// ability multipliers), stepping the game with G.Game.debugStep and real KeyboardEvents.
//   1. ledges (owner playtest after D3): walking off the plateau walks DOWN it, a 0.25 s drop (lifted a cliff face,
//      falling) onto the level below, carried clear of the edge, with no contact i-frames; hopping at the edge you cross
//      it in the air and land below; while hopping ground enemies don't hurt you on contact, back on the ground they
//      do, and a flyer still does
//   2. walking up into a cliff is blocked; a single hop lands one level up (not two: a 2-high wall stops it); a hop plus
//      the extra hop reaches two levels; a third press does nothing; never three levels
//   3. the extra hop's airtime crosses a 2-tile deep gap a single hop splashes into; by type (normalised speed): a Flying type (Pidgey) glides across a 3-tile deep pond holding hop (airtime 1.2 s),
//      a Water type (Squirtle) surfs across it at x1.35, a Fighting type (Machop) climbs a cliff at half speed and back
//      down; a non-matching type (Charmander) does none of those: blocked by deep water, its hops and double hops
//      splash back to the shore, blocked by the cliff; Squirtle holding hop doesn't glide, Pidgey doesn't climb; the
//      type table (Flying glide, Water surf, Fighting / Bug / Ghost climb)
//   4. a bounce pad throws you onto the plateau above (layer 1) along its arc, whatever your type; the generated zone
//      has pads, deterministic, each at the foot of a cliff with its landing one level up
//   5. slide: x1.9 for 0.55 s, then 0.9 s of cool-down (a press then does nothing), ground only
//   6. the HUD buttons (HOP, SLIDE): drawn in an Expedition run only, a mouse click hops; the gamepad: confirm hops
//      (held: glides), cancel slides, A / B on the Nintendo layout; in a Normal run neither does anything and no button
//      is drawn; the pad's remappable actions are unchanged
//   7. the `x` block (v3): mid-drop the air row says verb 7 and counts the drop in a 7th field; a live snapshot mid-hop carries {xv: 2, m, z, th, a: {p: [lift, verb, ...]}}, a co-op host
//      frame every player's row by uid, a guest's frame its own row; the run's replay keeps `a` out of its slow state
//      frame field 7) and plays back airborne frames and 3 falls off a real ledge of the zone; the same replay rewritten
//      as v1 (no `a`) and as an older Classic one (6-field rows, before walking down) still loads and plays
//   8. guests and spectators: a fresh page rebuilds the zone and shows the host airborne as a co-op guest (a real host
//      frame through G.Net's handler and js/net/coop.js), as a live spectator (a snapshot through G.WatchUI) and as a
//      replay viewer (seeking to an airborne frame); a spectator sees a leaping enemy lifted; the guest, the spectator
//      and the replay viewer show falls off a ledge, also ones that came and went between two frames (the drop count)
//   9. the phone layouts (landscape, touch; portrait is the game's "rotate your phone" prompt): at 844x390 and 667x375
//      the HOP / SLIDE buttons are on screen and overlap nothing else on the HUD; a tap hops, a quick second tap is the
//      extra hop, a tap on SLIDE slides (no joystick)
//  10. screenshots mid-hop, mid-glide, mid-surf, mid-bounce and mid-drop (off a ledge) at desktop and phone size (SHOTS=<dir>, default: none written)
//   node overworld/tests/micasurvivor_expedition_movement_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D2" count was taken.)
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
const PORT = 8845;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 700) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
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
	const H = window.__t = { frozen: false, pending: null, draws: 0, net: [] };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	// G.Net's message handlers, captured as js/net/coop.js registers its own (so a test can deliver a host frame to it)
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
		localStorage.setItem('micasurvivor_dev', 'dmove2');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
	let held = [];
	H.hold = list => { for (const k of held) if (!list.includes(k)) key('keyup', k); for (const k of list) if (!held.includes(k)) key('keydown', k); held = list.slice(); };
	/** n fixed steps of 1/60 s with these keys held (then released); fn(i) after each step (false stops) */
	H.steps = (n, keys, fn) => { H.hold(keys || []); for (let i = 0; i < n; i++) { G.Game.debugStep(1, 1 / 60); if (fn && fn(i) === false) break; } H.hold([]); };
	/** a script of [frames, keys] segments (a key newly held in a segment is a fresh press); fn(i) after each step */
	H.seq = (segs, fn) => { let i = 0; for (const [n, keys] of segs) { H.hold(keys); for (let k = 0; k < n; k++, i++) { G.Game.debugStep(1, 1 / 60); if (fn) fn(i); } } H.hold([]); };
	H.tile = v => Math.floor(v / G.World.TS);
	H.TS = () => G.World.TS;
	/** a quiet run: no spawns, events, rifts; hurts are recorded, not taken; speed exactly 100 (TEST ONLY) */
	H.quiet = () => {
		G.Spawner.update = () => {}; G.Events.update = () => {}; G.Rift.update = () => {};
		G.Weather.speedFor = () => 1; G.Abilities.spdK = () => 1;
		const pl = G.Game.player;
		H.hurts = [];
		pl.hurt = function () { H.hurts.push({ air: !!this.air, f: H.frame }); };
		G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear();
	};
	/** the player becomes another Pokémon (its types decide the verbs), speed 100 */
	H.become = dex => {
		const pl = G.Game.player, mon = G.DEX_BY[dex];
		pl.mon = mon; pl.dex = dex; pl.anim = new G.Sprites.Animator(dex, 1, false);
		pl.r = G.Sprites.bodyRadius(dex); pl.bodyH = G.Sprites.bodyHeight(dex);
		pl.baseSpd = 100; pl.spdMul = 1; for (const k in pl.buffs) pl.buffs[k].n = 0; pl.slowT = 0;
		pl.air = null; pl.airZ = 0; pl.slideT = 0; pl.slideCd = 0; pl.padCd = 0;
		G.Sprites.preload([dex], 8000, false);
		return pl;
	};
	H.place = (e, tx, ty) => { e.x = tx * G.World.TS + G.World.TS / 2; e.y = ty * G.World.TS + G.World.TS / 2; e.zMask = null; e.air = null; e.airZ = 0; if (!e.flying) G.World.collide(e); };
	H.zone = spec => { const z = G.ExpTerrain.custom(Object.assign({ w: 24, h: 24, map: 'custom' }, spec)); G.World.setZone(z); G.Path.clear(); return z; };
	/** the D1 cliff: a plateau (height 1) north of row 0 */
	H.cliff = (pads) => H.zone({ hgt: (x, y) => y < 12 ? 1 : 0, pads });
	/** three levels: 2 north of row -1, 1 on row -1, 0 from row 0 */
	H.steps3 = () => H.zone({ hgt: (x, y) => y < 11 ? 2 : y < 12 ? 1 : 0 });
	/** a pond across the zone, world columns 2..6 (columns 3..5 deep, 2 and 6 its shallow rim) */
	H.pond = () => H.zone({ hgt: () => 0, kind: (x, y) => { const tx = x - 12; return tx >= 2 && tx <= 6 ? 2 : 0; } });
	H.flat = () => H.zone({ hgt: () => 0 });
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
		return { ok, state: G.Game.state, mode: G.Game.mode, zone: !!G.World.zone, verbs: !!G.ExpVerbs };
	});
	const shoot = async (page, name) => {
		if (!SHOTS) return null;
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await page.screenshot({ path: f });
		console.log('     screenshot: ' + f);
		return f;
	};

	// ======================== desktop page: the verbs
	const { ctx, page, menu } = await bootPage();
	A(menu, 'boots to the menu as a guest');
	const run = await startExp(page);
	A(run.ok === true && run.state === 'playing' && run.zone === true, 'an Expedition Classic run starts in a zone (turned on for the test)', JSON.stringify(run));
	A(run.verbs === true, 'the movement verbs are loaded with the Expedition code (G.ExpVerbs)', JSON.stringify(run));

	// 1. hop down a ledge; contact i-frames
	const ledge = await E(page, () => {
		const H = window.__t, pl = H.become(4);
		H.quiet();
		H.cliff();
		const r = {};
		H.place(pl, 0, -3);
		pl.landed = null;
		let maxTy = -99, dropF = 0, dropPeak = 0, kinds = new Set(), lifts = [], dropAt = null, dropN0 = pl.dropN | 0, landedAt = null, landed = null;
		H.steps(90, ['KeyS'], i => {
			maxTy = Math.max(maxTy, H.tile(pl.y));
			if (pl.air) { kinds.add(pl.air.kind); if (pl.air.kind === 'drop') { dropF++; dropPeak = Math.max(dropPeak, pl.airZ); lifts.push(Math.round(pl.airZ)); if (dropAt == null) dropAt = { i, ty: H.tile(pl.y), y: Math.round(pl.y), lx: Math.round(pl.air.ly) }; } }
			if (pl.landed && !landed) { landed = pl.landed; landedAt = { i, y: Math.round(pl.y), ty: H.tile(pl.y), r: pl.r }; }
		});
		r.walk = { maxTy, ty: H.tile(pl.y), layer: pl.layer, mask: pl.zMask, dropF, dropPeak: Math.round(dropPeak), kinds: [...kinds], lifts, dropAt, landed, landedAt, drops: (pl.dropN | 0) - dropN0, air: !!pl.air };
		// the drop gives no contact i-frames: a ground enemy on you while you fall still hurts
		{
			H.place(pl, 0, -1);
			const foe = new G.Enemy({ dex: 19, name: 'x', behavior: 'chase', hp: 99999, spd: 1, dmg: 5, xp: 1 }, pl.x, pl.y, { hp: 1, spd: 1, dmg: 1 });
			G.EnemyMgr.add(foe);
			H.steps(60, [], () => { foe.x = pl.x + 40; foe.y = pl.y; });   // (past a new enemy's spawn-in)
			H.hurts.length = 0;
			let inDrop = 0;
			pl.invuln = 0;
			H.steps(40, ['KeyS'], () => { if (pl.air && pl.air.kind === 'drop') { inDrop++; foe.x = pl.x; foe.y = pl.y; foe.touchCd = 0; } else { foe.x = pl.x + 40; foe.y = pl.y; } });
			r.dropHit = { inDrop, hits: H.hurts.filter(h => h.air).length };
			G.EnemyMgr.clear();
		}
		// hop at the edge
		H.place(pl, 0, -1);
		let airFrames = 0, crossAir = false, peak = 0, layers = new Set();
		H.seq([[1, ['KeyS', 'Space']], [70, ['KeyS']]], () => {
			if (pl.air) { airFrames++; peak = Math.max(peak, pl.airZ); if (H.tile(pl.y) >= 0) crossAir = true; }
			layers.add(pl.layer);
		});
		r.hop = { ty: H.tile(pl.y), layer: pl.layer, mask: pl.zMask, airFrames, crossAir, peak: Math.round(peak), landed: pl.landed, air: !!pl.air };
		// contact: a ground enemy right on you
		H.place(pl, 0, 4);
		const mk = dex => { const e = new G.Enemy({ dex, name: 'x', behavior: 'chase', hp: 99999, spd: 1, dmg: 5, xp: 1 }, pl.x, pl.y, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); return e; };
		const foe = mk(19);
		H.hurts.length = 0;
		let airF = 0;
		H.frame = 0;
		H.seq([[1, ['Space']], [24, []]], i => { H.frame = i; if (pl.air) airF++; foe.x = pl.x; foe.y = pl.y; });
		const inAir = H.hurts.filter(h => h.air).length, airSteps = airF;
		H.hurts.length = 0;
		H.steps(60, [], i => { foe.x = pl.x; foe.y = pl.y; });
		r.contact = { inAir, airSteps, onGround: H.hurts.length, flying: foe.flying };
		G.EnemyMgr.clear();
		// a flyer (Butterfree hovers) still hits you in the air
		const bf = mk(12);
		H.hurts.length = 0;
		H.seq([[1, ['Space']], [20, []]], () => { bf.x = pl.x; bf.y = pl.y; });
		r.flyer = { flying: bf.flying, hits: H.hurts.filter(h => h.air).length };
		G.EnemyMgr.clear();
		return r;
	});
	const lw = ledge.walk || {};
	A(lw.maxTy >= 1 && lw.layer === 0 && lw.mask === 1 && !lw.air && lw.drops === 1 && lw.landed && lw.landed.kind === 'drop' && lw.landed.from === 1 && lw.landed.to === 0,
		'walking DOWN a ledge works with no hop: off the plateau onto the level below (layer 0, mask 1), one drop', JSON.stringify(lw));
	A(lw.dropF >= 13 && lw.dropF <= 17 && lw.dropPeak >= 10 && lw.dropPeak <= 16 && lw.lifts && lw.lifts[lw.lifts.length - 1] < lw.lifts[0] && lw.kinds.length === 1,
		`...shown as a short fall (${lw.dropF} airborne steps, ~0.25 s; the sprite starts ${lw.dropPeak} units up, a cliff face, and falls: ${(lw.lifts || []).join(',')})`, JSON.stringify(lw));
	A(lw.dropAt && lw.dropAt.ty === 0 && lw.landedAt && lw.landedAt.y - lw.landedAt.r >= 0, '...it starts as the centre crosses the edge and carries you clear of it (the body wholly below)', JSON.stringify([lw.dropAt, lw.landedAt]));
	A(ledge.dropHit && ledge.dropHit.inDrop >= 10 && ledge.dropHit.hits > 0, `the drop is free movement, not a hop: no contact i-frames (a ground enemy on you mid-fall hits ${ledge.dropHit && ledge.dropHit.hits} times)`, JSON.stringify(ledge.dropHit));
	A(ledge.hop && ledge.hop.crossAir && ledge.hop.ty >= 0 && ledge.hop.layer === 0 && ledge.hop.mask === 1 && !ledge.hop.air && ledge.hop.landed && ledge.hop.landed.from === 1 && ledge.hop.landed.to === 0,
		`a hop at the edge crosses it in the air and lands on the level below (layer 0, mask 1; ${ledge.hop && ledge.hop.airFrames} airborne steps, lifted ${ledge.hop && ledge.hop.peak})`, JSON.stringify(ledge.hop || ledge));
	A(ledge.hop && ledge.hop.airFrames >= 25 && ledge.hop.airFrames <= 29 && ledge.hop.peak >= 22 && ledge.hop.peak <= 24, 'the hop is a 0.45 s arc lifting the sprite up to 12 art px (24 world units)', JSON.stringify(ledge.hop));
	A(ledge.contact && ledge.contact.airSteps >= 20 && ledge.contact.inAir === 0 && ledge.contact.onGround > 0 && !ledge.contact.flying,
		`contact i-frames: a ground enemy on you never hurts you in the air (${ledge.contact && ledge.contact.airSteps} steps), back on the ground it does (${ledge.contact && ledge.contact.onGround} hits)`, JSON.stringify(ledge.contact || ledge));
	A(ledge.flyer && ledge.flyer.flying && ledge.flyer.hits > 0, 'a flyer (Butterfree) still hits you in the air (only ground contact is skipped)', JSON.stringify(ledge.flyer));

	// 2. walking up is blocked; a hop goes up one level, the extra hop one more (two), never three
	const up = await E(page, () => {
		const H = window.__t, pl = H.become(4);
		const r = {};
		// walking north into the cliff (no ramp): stopped at its foot, never airborne
		H.cliff();
		H.place(pl, 0, 2);
		let minTy = 99, air = false;
		H.steps(90, ['KeyW'], () => { minTy = Math.min(minTy, H.tile(pl.y)); if (pl.air) air = true; });
		r.walkUp = { minTy, ty: H.tile(pl.y), layer: pl.layer, mask: pl.zMask, air };
		// (ground layers only: airborne, entity.layer is the air's top)
		const go = (segs, tx, ty) => {
			H.place(pl, tx || 0, ty || 0);
			let minTy = 99, maxGround = 0, maxHops = 0, maxUp = 0;
			H.seq(segs, () => { minTy = Math.min(minTy, H.tile(pl.y)); if (!pl.air) maxGround = Math.max(maxGround, pl.layer || 0); else { maxHops = Math.max(maxHops, pl.air.hops); maxUp = Math.max(maxUp, pl.air.top - pl.air.top0); } });
			return { ty: H.tile(pl.y), minTy, layer: pl.layer, mask: pl.zMask, maxGround, maxHops, maxUp, air: !!pl.air, landed: pl.landed };
		};
		H.steps3();
		r.one = go([[1, ['KeyW', 'Space']], [80, ['KeyW']]]);
		r.two = go([[1, ['KeyW', 'Space']], [18, ['KeyW']], [1, ['KeyW', 'Space']], [90, ['KeyW']]]);
		r.three = go([[1, ['KeyW', 'Space']], [9, ['KeyW']], [1, ['KeyW', 'Space']], [9, ['KeyW']], [1, ['KeyW', 'Space']], [90, ['KeyW']]]);
		// a wall two levels high right ahead: one hop can't get up it
		H.zone({ hgt: (x, y) => y < 12 ? 2 : 0 });
		r.twoHigh = go([[1, ['KeyW', 'Space']], [80, ['KeyW']]]);
		// four levels in a row (3 / 2 / 1 / 0): with every press, never more than two above the take-off
		H.zone({ hgt: (x, y) => y < 10 ? 3 : y < 11 ? 2 : y < 12 ? 1 : 0 });
		r.four = go([[1, ['KeyW', 'Space']], [9, ['KeyW']], [1, ['KeyW', 'Space']], [9, ['KeyW']], [1, ['KeyW', 'Space']], [150, ['KeyW']]]);
		return r;
	});
	A(up.walkUp && up.walkUp.minTy >= 0 && up.walkUp.layer === 0 && up.walkUp.mask === 1 && !up.walkUp.air, 'walking UP into a cliff is still blocked (stopped at its foot, layer 0; a ledge is one-way)', JSON.stringify(up.walkUp || up));
	A(up.one && up.one.ty === -1 && up.one.layer === 1 && up.one.mask === 2 && up.one.maxGround === 1 && up.one.maxHops === 1 && up.one.maxUp === 1,
		'a single hop toward a higher tile lands on it: one level up (layer 1), and not on the one above (layer 2)', JSON.stringify(up.one || up));
	A(up.two && up.two.layer === 2 && up.two.mask === 4 && up.two.ty <= -2 && up.two.maxHops === 2 && up.two.maxUp === 2,
		'a hop plus the extra hop reaches two levels up (layer 2)', JSON.stringify(up.two || up));
	A(up.three && up.three.maxHops === 2 && up.three.maxUp === 2 && up.three.maxGround <= 2, 'a third press in the air does nothing (2 hops at most, never more than two levels)', JSON.stringify(up.three || up));
	A(up.twoHigh && up.twoHigh.ty >= 0 && up.twoHigh.layer === 0 && up.twoHigh.maxGround === 0, 'one hop can\'t go up two levels (a 2-high wall: back on layer 0 at its foot)', JSON.stringify(up.twoHigh || up));
	A(up.four && up.four.maxUp === 2 && up.four.maxGround <= 2 && up.four.layer <= 2, 'with three levels above, every press together still reaches at most two (never layer 3)', JSON.stringify(up.four || up));

	// 3. glide, surf, climb by type; a non-matching type can't
	const types = await E(page, () => {
		const H = window.__t, V = G.ExpVerbs, r = {};
		r.table = Object.fromEntries([[16, 'Pidgey'], [7, 'Squirtle'], [66, 'Machop'], [10, 'Caterpie'], [92, 'Gastly'], [130, 'Gyarados'], [123, 'Scyther'], [6, 'Charizard'], [4, 'Charmander'], [25, 'Pikachu']]
			.map(([d, n]) => [n, V.verbsOf(G.DEX_BY[d].types)]));
		// the pond: deep columns 3..5 (x 96..192), shallow 2 and 6
		const cross = (dex, opts) => {
			const pl = H.become(dex);
			pl.landed = null;
			if (opts.gap) H.zone({ hgt: () => 0, kind: (x, y) => { const tx = x - 12; return tx >= 2 && tx <= 5 ? 2 : 0; } }); else H.pond();
			H.place(pl, -1, 0);
			let maxX = -1e9, deepSeen = false, verbs = new Set(), airMax = 0, airNow = 0, splash = false, deepSpd = [];
			let lastX = pl.x, pressed = 0, lastLanded = pl.landed;
			const lands = [];
			const tx = () => H.tile(pl.x);
			// walk east; hop (and keep holding it) once at the shore's last stretch
			H.hold(['KeyD']);
			for (let i = 0; i < 240; i++) {
				if (pl.landed && pl.landed !== lastLanded) { lands.push([Math.round(pl.x), pl.landed.splash]); lastLanded = pl.landed; }
				if (opts.hop && !pressed && pl.x >= Math.min(82, 96 - pl.r - 3)) { H.hold(['KeyD', 'Space']); pressed = 1; }
				else if (pressed === 1 && !opts.hold) { H.hold(['KeyD']); pressed = 2; }
				else if (opts.double && pressed >= 1 && pl.air && pl.air.t > (opts.late || 0.3) && pl.air.hops === 1) { H.hold(['KeyD']); G.Game.debugStep(1, 1 / 60); H.hold(['KeyD', 'Space']); }
				G.Game.debugStep(1, 1 / 60);
				if (pl.air) { airNow++; airMax = Math.max(airMax, airNow); } else airNow = 0;
				if (pl.verb) verbs.add(V.NAME[pl.verb]);
				if (pl.landed && pl.landed.splash) splash = true;
				maxX = Math.max(maxX, pl.x);
				const t = tx();
				if (t >= 3 && t <= 5 && !pl.air) { deepSeen = true; deepSpd.push(pl.x - lastX); }
				lastX = pl.x;
				if (pressed && !pl.air && i > 200) break;
			}
			H.hold([]);
			const sp = deepSpd.slice(5, -5);
			return { lands, dex, x: Math.round(pl.x), tx: tx(), maxX: Math.round(maxX), deepSeen, verbs: [...verbs], airMax, splash, layer: pl.layer,
				deepSpeed: sp.length ? Math.round(sp.reduce((a, b) => a + b, 0) / sp.length * 60) : 0, landed: pl.landed };
		};
		r.glide = cross(16, { hop: true, hold: true });
		r.surf = cross(7, {});
		r.walkC = cross(4, {});
		r.hopC = cross(4, { hop: true, hold: true });
		r.doubleC = cross(4, { hop: true, hold: true, double: true });
		// a 2-tile deep gap (columns 3..4): one hop splashes short, the extra hop's airtime carries you over
		r.gapOne = cross(4, { gap: true, hop: true });
		r.gapTwo = cross(4, { gap: true, hop: true, hold: true, double: true, late: 0.4 });
		r.squirtleHold = (() => { const o = cross(7, { hop: true, hold: true }); return { verbs: o.verbs, airMax: o.airMax }; })();
		// the cliff (no ramp): Machop climbs up and back down; Charmander and Pidgey can't
		const climb = (dex, dir) => {
			const pl = H.become(dex);
			H.cliff();
			H.place(pl, 0, dir === 'up' ? 2 : -3);
			const verbs = new Set(), steps = [];
			let ly = pl.y;
			H.steps(150, [dir === 'up' ? 'KeyW' : 'KeyS'], () => { if (pl.verb) verbs.add(V.NAME[pl.verb]); steps.push([V.NAME[pl.verb] || '', Math.abs(pl.y - ly)]); ly = pl.y; });
			const climbing = steps.filter(s => s[0] === 'climb' && s[1] > 0).map(s => s[1]), walking = steps.filter(s => !s[0] && s[1] > 0).map(s => s[1]);
			const avg = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0;
			return { ty: H.tile(pl.y), layer: pl.layer, mask: pl.zMask, verbs: [...verbs], climbSpd: Math.round(avg(climbing) * 60), walkSpd: Math.round(avg(walking) * 60) };
		};
		r.climbUp = climb(66, 'up');
		r.climbDown = climb(66, 'down');
		r.climbC = climb(4, 'up');
		r.climbP = climb(16, 'up');
		return r;
	});
	const T = types.table || {};
	A(T.Pidgey && T.Pidgey.glide && !T.Pidgey.surf && !T.Pidgey.climb && T.Squirtle.surf && !T.Squirtle.glide && T.Machop.climb && T.Caterpie.climb && T.Gastly.climb
		&& T.Gyarados.surf && T.Gyarados.glide && T.Scyther.climb && T.Scyther.glide && T.Charizard.glide && !T.Charmander.glide && !T.Charmander.surf && !T.Charmander.climb && !T.Pikachu.glide,
		'the type table (PokéBonk\'s): Flying glides, Water surfs, Fighting / Bug / Ghost climb; dual types get both (Gyarados, Scyther); Charmander and Pikachu none', JSON.stringify(T));
	const g = types.glide || {};
	A(g.verbs && g.verbs.includes('glide') && g.tx >= 6 && !g.splash && !g.deepSeen && g.airMax >= 66,
		`a Flying type (Pidgey) holding hop glides across the 3-tile deep pond (${g.airMax} airborne steps, ~${(g.airMax / 60).toFixed(2)} s; lands on column ${g.tx})`, JSON.stringify(g));
	const s = types.surf || {};
	A(s.verbs && s.verbs.includes('surf') && s.tx >= 7 && s.deepSeen && s.deepSpeed >= 125 && s.deepSpeed <= 140,
		`a Water type (Squirtle) surfs across the deep water at x1.35 (${s.deepSpeed} units/s at speed 100)`, JSON.stringify(s));
	const u1 = types.climbUp || {}, u2 = types.climbDown || {};
	A(u1.verbs && u1.verbs.includes('climb') && u1.ty < 0 && u1.layer === 1 && u1.mask === 2 && u1.climbSpd >= 40 && u1.climbSpd <= 60 && u1.walkSpd >= 90,
		`a Fighting type (Machop) climbs the cliff at half speed (${u1.climbSpd} vs ${u1.walkSpd} units/s) onto the plateau (layer 1)`, JSON.stringify(u1));
	A(u2.ty >= 0 && u2.layer === 0 && u2.mask === 1 && u2.verbs.includes('climb') && !u2.verbs.includes('drop') && !u1.verbs.includes('drop'), '...and climbs back down it, as before (a climber never drops: it climbs, at half speed)', JSON.stringify(u2));
	const wc = types.walkC || {}, hc = types.hopC || {}, dc = types.doubleC || {}, cc = types.climbC || {}, cp = types.climbP || {}, sh = types.squirtleHold || {};
	A(wc.maxX < 96 && !wc.deepSeen && !wc.verbs.includes('surf'), `a non-matching type (Charmander) is blocked by deep water (never past x ${wc.maxX} < 96)`, JSON.stringify(wc));
	A(hc.splash && hc.x < 96 && !hc.verbs.includes('glide') && hc.airMax <= 28 && dc.splash && dc.x < 96 && !dc.verbs.includes('glide'),
		`...holding hop it doesn't glide: its hop and its double hop splash back to the shore (air ${hc.airMax} / ${dc.airMax} steps)`, JSON.stringify([hc, dc]));
	A(cc.ty >= 0 && cc.layer === 0 && !cc.verbs.includes('climb') && cp.ty >= 0 && cp.layer === 0, '...and neither Charmander nor Pidgey climbs the cliff', JSON.stringify([cc, cp]));
	const g1 = types.gapOne || {}, g2 = types.gapTwo || {};
	A(g1.splash && g1.x < 96 && g2.tx >= 5 && !g2.splash && g2.lands.length === 1 && g2.lands[0][0] >= 160 && g2.airMax > 40,
		`the extra hop extends a gap crossing: over a 2-tile deep gap one hop splashes back, hop + extra hop lands across (column ${g2.tx}, ${g2.airMax} airborne steps)`, JSON.stringify([g1, g2]));
	A(sh.verbs && !sh.verbs.includes('glide') && sh.airMax <= 28, 'Squirtle holding hop doesn\'t glide either (only Flying types)', JSON.stringify(sh));

	// 4. bounce pads
	const pads = await E(page, () => {
		const H = window.__t, r = {};
		const pl = H.become(4);
		H.cliff([[0, 0, 1]]);
		H.place(pl, 0, 3);
		pl.landed = null;
		let peak = 0, kinds = new Set();
		H.steps(150, ['KeyW'], () => { if (pl.air) { peak = Math.max(peak, pl.airZ); kinds.add(pl.air.kind); } if (pl.landed) return false; });
		r.pad = { ty: H.tile(pl.y), tx: H.tile(pl.x), layer: pl.layer, mask: pl.zMask, peak: Math.round(peak), kinds: [...kinds], landed: pl.landed };
		// the run's own zone: pads from the generator
		const z1 = G.Exp.enterZone(1), z2 = G.ExpTerrain.generate({ seed: G.World.seed, map: 'viridian', zone: 1 });
		const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
		const bad = z1.pads.filter(([x, y, d]) => {
			const [dx, dy] = DIRS[d - 1], h = z1.height(x, y);
			return z1.terr(x, y) !== 0 || z1.rampDir(x, y) || z1.height(x + dx, y + dy) !== h + 1 || z1.height(x + 2 * dx, y + 2 * dy) !== h + 1
				|| z1.terr(x + 2 * dx, y + 2 * dy) !== 0 || z1.height(x - dx, y - dy) !== h;
		});
		r.gen = { n: z1.pads.length, same: JSON.stringify(z1.pads) === JSON.stringify(z2.pads) && z1.hash === z2.hash, bad: bad.length, stats: z1.stats.pads,
			maps: G.ExpTerrain.MAPS.map(m => G.ExpTerrain.generate({ seed: 77, map: m, zone: 1 }).pads.length) };
		return r;
	});
	A(pads.pad && pads.pad.ty === -2 && pads.pad.layer === 1 && pads.pad.mask === 2 && pads.pad.kinds.includes('bounce') && pads.pad.peak >= 50 && pads.pad.landed && pads.pad.landed.kind === 'bounce',
		`a bounce pad at the cliff's foot throws Charmander (no special type) along its arc onto the plateau, 2 tiles on (layer 1; lifted ${pads.pad && pads.pad.peak})`, JSON.stringify(pads.pad || pads));
	A(pads.gen && pads.gen.n > 0 && pads.gen.same && pads.gen.bad === 0 && pads.gen.maps.every(n => n > 0),
		`the generator places bounce pads (${pads.gen && pads.gen.n} in the run's zone; ${pads.gen && pads.gen.maps.join('/')} on the 3 maps), the same ones from the same seed, each at a cliff's foot with its landing one level up`, JSON.stringify(pads.gen || pads));

	// 5. slide
	const slide = await E(page, () => {
		const H = window.__t, pl = H.become(4), r = {};
		H.flat();
		H.place(pl, -8, 0);
		let x0 = pl.x;
		H.steps(33, ['KeyD']);
		r.walk = Math.round(pl.x - x0);
		x0 = pl.x;
		let slid = 0;
		H.seq([[1, ['KeyD', 'ShiftLeft']], [32, ['KeyD']]], () => { if (pl.slideT > 0) slid++; });
		r.slide = Math.round(pl.x - x0); r.slid = slid; r.cd = pl.slideCd;
		// a press during the cool-down does nothing
		H.seq([[1, ['KeyD', 'ShiftLeft']], [5, ['KeyD']]]);
		r.cdPress = pl.slideT > 0;
		H.steps(60, []);
		H.seq([[1, ['ShiftLeft']], [3, []]]);
		r.again = pl.slideT > 0;
		H.steps(100, []);
		// not in the air
		H.seq([[1, ['Space']], [5, []], [1, ['ShiftLeft']], [3, []]]);
		r.inAir = pl.slideT > 0;
		H.steps(60, []);
		return r;
	});
	A(slide.walk > 40 && slide.slide / slide.walk >= 1.75 && slide.slide / slide.walk <= 2.0 && slide.slid >= 31 && slide.slid <= 34,
		`slide: ${slide.slide} units in 0.55 s against ${slide.walk} walking (x${(slide.slide / slide.walk).toFixed(2)})`, JSON.stringify(slide));
	A(slide.cd > 0.8 && !slide.cdPress && slide.again && !slide.inAir, 'then 0.9 s of cool-down (a press does nothing), after it slides again; never in the air', JSON.stringify(slide));

	// 7a. the x block v2 mid-hop: snapshot, host frame, guest frame
	const xb = await E(page, () => {
		const H = window.__t, pl = H.become(16);
		G.Exp.enterZone(1);
		H.place(pl, 0, 0);
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		H.seq([[1, ['Space']], [10, []]]);
		const s = G.Spectate.snap();
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, { uid: 'bob', pl });
		const gf = G.Hooks.reduce('net.frame', { k: 'f' }, null);
		H.steps(40, []);
		const s2 = G.Spectate.snap();
		// mid-fall off a ledge (the D2 cliff): the row says verb 7, and its 7th field counts the drop
		H.cliff();
		H.place(pl, 0, -1);
		const d0 = pl.dropN | 0;
		H.steps(40, ['KeyS'], () => (pl.air && pl.air.kind === 'drop' && pl.air.t > 0.06 ? false : undefined));
		const sd = G.Spectate.snap(), hd = G.Hooks.reduce('net.frame', { k: 'f' }, { uid: 'bob', pl });
		const drop = { p: sd.x && sd.x.a && sd.x.a.p, q: hd.x && hd.x.a && hd.x.a.q && hd.x.a.q.alice, n: (pl.dropN | 0) - d0 };
		H.steps(30, []);
		G.Exp.enterZone(1);
		return { drop, x: s.x, hf: hf.x, gf: gf.x, ground: s2.x && s2.x.a, hash: G.World.zone.hash, size: JSON.stringify(s.x).length };
	});
	const xa = xb.x && xb.x.a && xb.x.a.p;
	A(xb.x && xb.x.xv === 10 && xb.x.m === 'viridian' && xb.x.z === 1 && xb.x.th === xb.hash && xa && xa[0] > 10 && xa[1] === 1 && xa[3] > 0 && xa[4] === 45,
		`a live snapshot mid-hop carries the x block (v4 since D4) {xv: 4, m, z, th, a: {p: [lift ${xa && xa[0]}, verb 1 (hop), layer, phase, airtime 45 cs, hops]}} (${xb.size} chars)`, JSON.stringify(xb.x));
	A(xb.hf && xb.hf.xv === 10 && xb.hf.a && xb.hf.a.q && xb.hf.a.q.alice && xb.hf.a.q.alice[0] > 10 && xb.gf && xb.gf.a && xb.gf.a.p && xb.gf.a.p[0] > 10,
		'a co-op host frame carries every player\'s row by uid (the host\'s own), a guest\'s frame its own row', JSON.stringify([xb.hf, xb.gf]));
	A(xb.ground && xb.ground.p && xb.ground.p[0] === 0 && xb.ground.p[1] === 0, 'back on the ground the row says so (lift 0, no verb)', JSON.stringify(xb.ground));
	const xd = xb.drop || {};
	A(xd.p && xd.p.length === 7 && xd.p[0] > 0 && xd.p[1] === 7 && xd.p[4] === 25 && xd.p[6] === ((xa && xa[6]) | 0) + 1 && xd.n === 1 && xd.q && xd.q[1] === 7,
		`mid-fall off a ledge the snapshot's and the host frame's row carry it: [lift ${xd.p && xd.p[0]}, verb 7 (drop), layer, phase, airtime 25 cs, hops, drops ${xd.p && xd.p[6]}] (the x block stays v3: a 7th field older readers ignore)`, JSON.stringify(xd));

	// 6. the HUD buttons and the gamepad (real frames)
	const ui = await E(page, async () => {
		const H = window.__t, pl = H.become(16), r = {};
		G.Exp.enterZone(1);
		H.place(pl, 0, 0);
		H.thaw();
		await new Promise(res => setTimeout(res, 400));
		const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
		r.rects = R.filter(o => o.name === 'hop' || o.name === 'slide');
		r.k = k;
		return r;
	});
	const hopR = (ui.rects || []).find(o => o.name === 'hop'), slideR = (ui.rects || []).find(o => o.name === 'slide');
	A(hopR && slideR, 'the HUD draws the HOP and SLIDE buttons in an Expedition run', JSON.stringify(ui));
	if (hopR && slideR) {
		const n0 = await E(page, () => G.Game.player.hopN | 0);
		await page.mouse.click(hopR.x + hopR.w / 2, hopR.y + (hopR.h - 20) / 2);
		await sleep(120);
		const n1 = await E(page, () => ({ n: G.Game.player.hopN | 0, air: !!G.Game.player.air }));
		A(n1.n === n0 + 1, 'a mouse click on HOP hops', JSON.stringify([n0, n1]));
		await sleep(700);
		await page.mouse.click(slideR.x + slideR.w / 2, slideR.y + (slideR.h - 20) / 2);
		await sleep(60);
		const sl = await E(page, () => ({ t: G.Game.player.slideT, cd: G.Game.player.slideCd }));
		A(sl.t > 0 || sl.cd > 0, 'a click on SLIDE slides', JSON.stringify(sl));
		await sleep(1200);
	}
	// the gamepad: Nintendo layout (confirm = button 1, cancel = button 0)
	const pad = await E(page, async () => {
		const wait = ms => new Promise(res => setTimeout(res, ms));
		const r = {};
		window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)');
		for (let i = 0; i < 40 && !(G.Pad.ready && G.Pad.active); i++) { window.__btn(12, true); await wait(50); window.__btn(12, false); await wait(50); }
		await wait(200);
		r.map = G.Pad.map(); r.layout = G.Pad.layout(); r.actions = G.Pad.ACTIONS.slice();
		const pl = G.Game.player;
		const press = async (b, ms = 80) => { window.__btn(b, true); await wait(ms); window.__btn(b, false); await wait(60); };
		let n0 = pl.hopN | 0;
		await press(r.map.confirm);
		r.hop = (pl.hopN | 0) - n0;
		await wait(700);
		// held: Pidgey glides
		n0 = pl.hopN | 0;
		window.__btn(r.map.confirm, true);
		let glide = false, maxT = 0;
		for (let i = 0; i < 30; i++) { await wait(40); if (pl.air) { maxT = Math.max(maxT, pl.air.dur); if (pl.air.kind === 'glide') glide = true; } }
		window.__btn(r.map.confirm, false);
		r.held = { glide, dur: Math.round(maxT * 100) / 100, hops: (pl.hopN | 0) - n0 };
		await wait(1400);
		await press(r.map.cancel);
		await wait(30);
		r.slide = pl.slideT > 0 || pl.slideCd > 0;
		r.mode = G.Pad.mode;
		return r;
	});
	A(pad.layout === 'nintendo' && pad.hop === 1, 'the gamepad: confirm (A, the right face button on the Nintendo default) hops', JSON.stringify(pad));
	A(pad.held && pad.held.glide && pad.held.dur >= 1.15 && pad.held.hops === 1, 'holding confirm, a Flying type glides (airtime 1.2 s)', JSON.stringify(pad.held));
	A(pad.slide === true, 'cancel (B) slides', JSON.stringify(pad));
	A(JSON.stringify(pad.actions) === JSON.stringify(['prev', 'next', 'pause', 'confirm', 'cancel', 'reroll', 'ban', 'swap', 'zmove', 'dynamax']), 'the pad\'s remappable actions are unchanged (hop / slide ride on confirm / cancel in an Expedition run only)', JSON.stringify(pad.actions));
	await shoot(page, 'expedition_hud_desktop.png');

	// 10a. screenshots mid-hop, mid-glide, mid-surf (desktop)
	const poses = async (pg, tag) => {
		const pose = (dex, what) => E(pg, async (dex, what) => {
			const H = window.__t;
			H.freeze();
			const pl = H.become(dex);
			pl.update = pl._upd || pl.update;
			if (what === 'surf') { H.pond(); H.place(pl, 0, 0); H.steps(62, ['KeyD']); }
			else if (what === 'pad') {
				// mid-bounce off the run's nearest bounce pad
				const z = G.Exp.enterZone(1), p = z.pads.slice().sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1])[0];
				const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][p[2] - 1], key = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][p[2] - 1];
				H.place(pl, p[0] - dx, p[1] - dy); pl.padCd = 0;
				H.steps(60, [key], () => (pl.air && pl.air.t > 0.3 ? false : undefined));
			}
			else if (what === 'drop') {
				// mid-fall off the run's nearest south-facing ledge (its painted cliff face below)
				const z = G.Exp.enterZone(1), W = G.World, ok = (x, y) => W.walkable(x, y) && z.terr(x, y) === 0 && !z.rampDir(x, y) && !z.propAt(x, y);
				let L = null;
				// (the widest straight face near the spawn: 5 tiles, else 3, else 1)
				for (const w of [2, 1, 0]) for (let d = 2; d < 50 && !L; d++) for (let ty = -d; ty <= d && !L; ty++) for (let tx = -d; tx <= d && !L; tx++)
					if (Math.max(Math.abs(tx), Math.abs(ty)) === d && Array.from({ length: 2 * w + 1 }, (_, i) => i - w).every(k => ok(tx + k, ty) && ok(tx + k, ty - 1) && ok(tx + k, ty + 1) && ok(tx + k, ty + 2)
						&& z.height(tx + k, ty - 1) === z.height(tx, ty) && z.height(tx + k, ty) === z.height(tx, ty) && z.height(tx + k, ty + 1) === z.height(tx, ty) - 1 && z.height(tx + k, ty + 2) === z.height(tx, ty) - 1)) L = [tx, ty];
				H.place(pl, L[0], L[1]);
				H.steps(60, ['KeyS'], () => (pl.air && pl.air.kind === 'drop' && pl.air.t > 0.07 ? false : undefined));
			}
			else { G.Exp.enterZone(1); H.place(pl, 0, 0); if (what === 'hop') H.seq([[1, ['KeyD', 'Space']], [12, ['KeyD']]]); else H.seq([[1, ['KeyD', 'Space']], [40, ['KeyD', 'Space']]]); }
			const st = { verb: G.ExpVerbs.NAME[pl.verb], lift: Math.round(pl.airZ || 0), air: pl.air && pl.air.kind };
			// hold the pose while real frames draw it (the test's own stand-in for a paused sim)
			pl._upd = pl._upd || pl.update; pl.update = function (dt) { this.anim.update(dt); };
			G.Camera.x = pl.x; G.Camera.y = pl.y - 20;
			H.thaw();
			await new Promise(r => setTimeout(r, 500));
			return st;
		}, dex, what);
		const out = {};
		out.hop = await pose(4, 'hop'); await shoot(pg, `expedition_hop_${tag}.png`);
		out.glide = await pose(16, 'glide'); await shoot(pg, `expedition_glide_${tag}.png`);
		out.surf = await pose(7, 'surf'); await shoot(pg, `expedition_surf_${tag}.png`);
		out.pad = await pose(4, 'pad'); await shoot(pg, `expedition_pad_${tag}.png`);
		out.drop = await pose(4, 'drop'); await shoot(pg, `expedition_ledge_drop_${tag}.png`);
		await E(pg, () => { const pl = G.Game.player; if (pl._upd) { pl.update = pl._upd; delete pl._upd; } });
		return out;
	};
	const dp = await poses(page, 'desktop');
	A(dp.hop.air === 'hop' && dp.hop.lift > 10 && dp.glide.air === 'glide' && dp.glide.lift > 5 && dp.surf.verb === 'surf' && dp.pad.air === 'bounce', 'desktop: mid-hop, mid-glide, mid-surf and mid-bounce poses drawn', JSON.stringify(dp));
	A(dp.drop && dp.drop.air === 'drop' && dp.drop.lift > 3, 'desktop: a fall off a ledge drawn mid-drop (walking down, no hop)', JSON.stringify(dp.drop));

	// 7b. the replay: hops on the run's own zone, then quit
	const rep = await E(page, async () => {
		const H = window.__t;
		H.freeze();
		const pl = H.become(16);
		G.Exp.enterZone(1);
		H.place(pl, 0, 0);
		// ~5 s on the spawn clearing: hop, glide, hop...
		for (let k = 0; k < 4; k++) H.seq([[1, ['KeyD', 'Space']], [70, ['KeyD', 'Space']], [10, []]]);
		// walking down a real ledge of the zone (the nearest plain tile with a plain tile one level lower south of it), 3 times
		const z = G.World.zone, W = G.World;
		let ledge = null;
		for (let d = 2; d < 40 && !ledge; d++) for (let ty = -d; ty <= d && !ledge; ty++) for (let tx = -d; tx <= d && !ledge; tx++) {
			if (Math.max(Math.abs(tx), Math.abs(ty)) !== d) continue;
			const ok = (x, y) => W.walkable(x, y) && z.terr(x, y) === 0 && !z.rampDir(x, y) && !z.propAt(x, y);
			if (ok(tx, ty) && ok(tx, ty - 1) && ok(tx, ty + 1) && ok(tx, ty + 2) && z.height(tx, ty - 1) === z.height(tx, ty) && z.height(tx, ty + 1) === z.height(tx, ty) - 1 && z.height(tx, ty + 2) === z.height(tx, ty + 1)) ledge = [tx, ty];
		}
		let drops = 0;
		if (ledge) for (let k = 0; k < 3; k++) { H.place(pl, ledge[0], ledge[1]); const n0 = pl.dropN | 0; H.steps(30 + k * 7, ['KeyS']); drops += (pl.dropN | 0) - n0; H.steps(25, []); }
		G.Game.quit();
		const e = G.Replay.last;
		if (!e) return { error: 'no replay' };
		await e.ready;
		const txt = await G.Replay.unpack(e.code);
		const d = JSON.parse(txt);
		const dropRows = d.f.filter(f => f[7] && f[7].p && f[7].p.length === 7);
		const dropN = dropRows.length ? Math.max(...dropRows.map(f => f[7].p[6])) : 0, dropMid = d.f.filter(f => f[7] && f[7].p && f[7].p[1] === 7).length;
		const withA = d.f.filter(f => f[7]).length, slowA = d.f.filter(f => f[3] && f[3].x && 'a' in f[3].x).length, slowX = d.f.filter(f => f[3] && f[3].x).length;
		const rd = await G.Replay.open(e.code);
		const air = [];
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.m === 'viridian' && s.x.a && s.x.a.p && s.x.a.p[0] > 0) air.push(i); }
		// the frames where the drop count went up (a fall off a ledge since the frame before)
		const dropAt = [];
		for (let i = 1, last = null; i < rd.length; i++) { const p = rd.at(i).x && rd.at(i).x.a && rd.at(i).x.a.p; const n = p && p.length > 6 ? p[6] : null; if (last != null && n != null && n > last) dropAt.push([rd.times[i - 1], rd.times[i]]); if (n != null) last = n; }
		// the same replay as v1: x without `a`, no field 7
		const d1 = JSON.parse(txt);
		for (const f of d1.f) { if (f[3] && f[3].x) f[3].x.xv = 1; if (f.length > 7) f.length = 7; while (f.length > 1 && f[f.length - 1] === 0) f.pop(); }
		const code1 = await G.Replay.pack(JSON.stringify(d1));
		// the same replay as an older Classic one (dv 2, before walking down a ledge): air rows of 6 fields, no drop count
		const d0 = JSON.parse(txt);
		for (const f of d0.f) if (f[7] && f[7].p) f[7].p = f[7].p.slice(0, 6);
		const code0 = await G.Replay.pack(JSON.stringify(d0));
		H.thaw();
		return { dropAt, ledge, drops, dropN, dropMid, dv: d.h.dv, code0, code: e.code, code1, frames: d.f.length, withA, slowA, slowX, air, times: air.map(i => rd.times[i]), bytes: txt.length, hash: G.ExpTerrain.generate({ seed: d.h.sd, map: 'viridian', zone: 1 }).hash, seed: d.h.sd };
	});
	A(rep.code && rep.withA > 3 && rep.slowA === 0 && rep.slowX > 0, `the replay keeps the air state in frame field 7 (${rep.withA} frames), never in its slow state (${rep.slowX} slow x blocks, none with \`a\`)`, JSON.stringify({ withA: rep.withA, slowA: rep.slowA, slowX: rep.slowX, err: rep.error }));
	A(rep.ledge && rep.drops === 3 && rep.dropN >= 3 && rep.dropAt && rep.dropAt.length >= 3 && rep.dv === 12,
		`the replay records the falls off a ledge (3 walked down at ${rep.ledge}: the air row's 7th field counts them, ${rep.dropMid} frames caught one mid-fall, verb 7; dv ${rep.dv})`, JSON.stringify({ ledge: rep.ledge, drops: rep.drops, dropN: rep.dropN, dropAt: rep.dropAt, dropMid: rep.dropMid, dv: rep.dv }));
	A(rep.air && rep.air.length >= 2, `decoded, ${rep.air && rep.air.length} replay frames have the player airborne`, JSON.stringify(rep.air));
	await ctx.close();

	// 8. a fresh page: co-op guest, live spectator, replay viewer (v2 and v1)
	if (rep.code) {
		const v = await bootPage();
		const out = await E(v.page, async (rep, x) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const H = window.__t, o = { loadedBefore: G.Expedition.loaded };
			// a co-op guest: a base run of its own on the host's seed, the host frame through G.Net's handler (js/net/coop.js)
			G.Flow.play('normal');
			H.freeze();
			G.World.reset(rep.seed);
			const pl = G.Game.player;
			const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
			G.Coop.begin({ seed: rep.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 16 }, { uid: G.Net.uid, name: 'me', dex: 4 }] }, pl, cb);
			const frame = Object.assign({ k: 'f', t: 1, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [] }, { x });
			H.deliver('alice', frame);
			for (let i = 0; i < 100 && !(G.Exp && G.World.zone && G.World.zone.hash === x.th); i++) await wait(50);
			H.deliver('alice', Object.assign({}, frame, { x: Object.assign({}, x) }));
			const hp = G.Coop.mate('alice').pl;
			o.guest = { zone: G.World.zone && G.World.zone.hash, lift: G.ExpVerbs ? Math.round(G.ExpVerbs.lift(hp)) : -1, verb: hp.verb, row: hp.airRow && hp.airRow.code };
			// the host walks down a ledge: a frame mid-fall (verb 7), then one that missed a whole fall (only its drop count went up)
			const fr = row => Object.assign({}, frame, { x: Object.assign({}, x, { a: { q: { alice: row } } }) });
			H.deliver('alice', fr([0, 0, 2, 0, 0, 3, 4]));
			H.deliver('alice', fr([10, 7, 2, 8, 25, 3, 5]));
			o.guestDrop = { lift: Math.round(G.ExpVerbs.lift(hp)), verb: hp.verb, code: hp.airRow && hp.airRow.code };
			await wait(400);
			H.deliver('alice', fr([0, 0, 0, 0, 0, 3, 5]));
			H.deliver('alice', fr([0, 0, 0, 0, 0, 3, 6]));
			o.guestMissed = { lift: Math.round(G.ExpVerbs.lift(hp)), code: hp.airRow && hp.airRow.code };
			await wait(400);
			o.guestAfter = Math.round(G.ExpVerbs.lift(hp));
			// the mate drawn lifted: its sprite y above its feet
			G.Coop.end();
			G.Game.quit();
			// a live spectator: a snapshot mid-hop (with a leaping enemy)
			G.MicaAccount.name = () => 'viewer';
			const snap = { v: 1, t: 10, sd: rep.seed, b: 0, m: 'exp-classic', dv: 1, x: Object.assign({}, x, { a: { p: [18, 1, 0, 10, 45, 5], e: [901, 30] } }), me: [16, 0], p: [0, 0, 0, 0, 100, 100, 0], lv: [1, 0, 10], k: 0, bo: 0, co: 0, mv: [], ac: 0, it: ['', ''], lu: 0,
				e: [[901, 19, 40, 0, 100, 50, 0, 0]], pk: [] };
			let feed = null;
			G.Spectate.watch = (u, h) => { feed = h; h.snapshot(snap, {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 60 && !(G.World.zone && G.World.zone.hash === x.th); i++) await wait(50);
			feed.snapshot(Object.assign({}, snap, { t: 20 }), {});
			const wp = G.WatchUI.player, en = G.EnemyMgr.get(901);
			o.live = { zone: G.World.zone && G.World.zone.hash, lift: Math.round(G.ExpVerbs.lift(wp)), verb: wp.verb, enemyLift: en && en.jumpLift };
			// the next snapshot on the ground: the arc plays out, the enemy comes down
			const ground = Object.assign({}, x, { a: { p: [0, 0, 0, 0, 0, 5] } });
			feed.snapshot(Object.assign({}, snap, { t: 30, x: ground }), {});
			feed.snapshot(Object.assign({}, snap, { t: 40, x: ground }), {});
			await wait(600);
			o.liveAfter = { lift: Math.round(G.ExpVerbs.lift(wp)), enemyLift: en && en.jumpLift };
			// a fall off a ledge between two 1 s snapshots: only the drop count says so, and the spectator still plays it
			feed.snapshot(Object.assign({}, snap, { t: 50, x: Object.assign({}, x, { a: { p: [0, 0, 2, 0, 0, 5, 1] } }) }), {});
			feed.snapshot(Object.assign({}, snap, { t: 60, x: Object.assign({}, x, { a: { p: [0, 0, 0, 0, 0, 5, 2] } }) }), {});
			feed.snapshot(Object.assign({}, snap, { t: 70, x: Object.assign({}, x, { a: { p: [0, 0, 0, 0, 0, 5, 2] } }) }), {});   // (a view shows the snapshot before the newest)
			o.liveDrop = { lift: Math.round(G.ExpVerbs.lift(wp)), code: wp.airRow && wp.airRow.code };
			G.WatchUI.leave();
			// a replay viewer: the recorded run, sought to an airborne frame
			const rd = await G.Replay.open(rep.code);
			G.WatchUI.playReplay(rd, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rep.hash); i++) { G.WatchUI.seek(rep.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			let best = 0;
			for (const t of rep.times) { G.WatchUI.seek(t); best = Math.max(best, G.ExpVerbs.lift(G.WatchUI.player)); }
			o.replay = { zone: G.World.zone && G.World.zone.hash, lift: Math.round(best) };
			// each fall off a ledge, played forward from the frame before it to the one after it: the drop plays
			o.replayDrops = [];
			for (const [t0, t1] of (rep.dropAt || []).slice(-3)) { G.WatchUI.seek(t0); if (!G.WatchUI.playing) G.WatchUI.togglePlay(); G.WatchUI.tick(t1 - t0 + 0.01); G.WatchUI.togglePlay(); const p = G.WatchUI.player; o.replayDrops.push({ lift: Math.round(G.ExpVerbs.lift(p)), code: p.airRow && p.airRow.code }); }
			G.WatchUI.leave();
			// an older Classic replay (dv 2, air rows without the drop count): it loads and plays as before
			const rd0 = await G.Replay.open(rep.code0);
			G.WatchUI.playReplay(rd0, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rep.hash); i++) { G.WatchUI.seek(rep.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			let best0 = 0;
			for (const t of rep.times) { G.WatchUI.seek(t); best0 = Math.max(best0, G.ExpVerbs.lift(G.WatchUI.player)); }
			o.old = { ok: !!rd0, zone: G.World.zone && G.World.zone.hash, lift: Math.round(best0), frames: rd0 && rd0.length, notice: G.Expedition.viewNotice('exp-classic', rep.dv) };
			G.WatchUI.leave();
			// the same replay rewritten as v1
			const rd1 = await G.Replay.open(rep.code1);
			G.World.setZone(null);
			G.WatchUI.playReplay(rd1, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rep.hash); i++) { G.WatchUI.seek(rep.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			let best1 = 0;
			for (const t of rep.times) { G.WatchUI.seek(t); best1 = Math.max(best1, G.ExpVerbs.lift(G.WatchUI.player)); }
			o.v1 = { ok: !!rd1, zone: G.World.zone && G.World.zone.hash, lift: Math.round(best1), xv: rd1 && rd1.at(rd1.length - 1).x && rd1.at(rd1.length - 1).x.xv, frames: rd1 && rd1.length };
			G.WatchUI.leave();
			return o;
		}, rep, Object.assign({}, { xv: 2, m: 'viridian', z: 1, th: rep.hash }, { a: { q: { alice: [20, 2, 0, 50, 120, 3] } } }));
		A(out.loadedBefore === false && out.guest && out.guest.zone === rep.hash && out.guest.lift > 10 && out.guest.verb === 2,
			`a co-op guest (a fresh page; a host frame through G.Net's handler) rebuilds the zone and sees the host gliding (lift ${out.guest && out.guest.lift})`, JSON.stringify(out.guest || out));
		A(out.live && out.live.zone === rep.hash && out.live.lift > 5 && out.live.verb === 1 && out.live.enemyLift === 30,
			`a live spectator sees the player mid-hop (lift ${out.live && out.live.lift}) and a leaping enemy lifted`, JSON.stringify(out.live || out));
		A(out.liveAfter && out.liveAfter.lift === 0 && out.liveAfter.enemyLift === 0, '...and both back on the ground with the next snapshot', JSON.stringify(out.liveAfter));
		A(out.guestDrop && out.guestDrop.lift > 0 && out.guestDrop.verb === 7 && out.guestDrop.code === 7 && out.guestMissed && out.guestMissed.lift > 0 && out.guestMissed.code === 7 && out.guestAfter === 0,
			`a co-op guest sees the host's fall off a ledge (lift ${out.guestDrop && out.guestDrop.lift}, verb 7), also one that came and went between two frames (the drop count), then on the ground`, JSON.stringify([out.guestDrop, out.guestMissed, out.guestAfter]));
		A(out.liveDrop && out.liveDrop.lift > 0 && out.liveDrop.code === 7, `a live spectator plays a fall that came and went between two 1 s snapshots (lift ${out.liveDrop && out.liveDrop.lift})`, JSON.stringify(out.liveDrop));
		A(out.replayDrops && out.replayDrops.length === 3 && out.replayDrops.every(d => d.lift > 0 && d.code === 7), 'a replay viewer plays each of the 3 recorded falls off a ledge', JSON.stringify(out.replayDrops));
		A(out.old && out.old.ok && out.old.zone === rep.hash && out.old.lift > 3 && out.old.notice === false, `an older Classic replay (dv 2, 6-field air rows) still loads and plays: same zone, hops shown (lift ${out.old && out.old.lift}), no notice`, JSON.stringify(out.old));
		A(out.replay && out.replay.zone === rep.hash && out.replay.lift > 3, `a replay viewer seeking to an airborne frame sees the player in the air (lift ${out.replay && out.replay.lift})`, JSON.stringify(out.replay));
		A(out.v1 && out.v1.ok && out.v1.xv === 1 && out.v1.zone === rep.hash && out.v1.lift === 0, 'the same replay as v1 (no air state) still loads: same zone, everyone on the ground', JSON.stringify(out.v1));
		await v.ctx.close();
	} else A(false, 'the viewers (no replay recorded)');

	// 6b. a Normal run: no buttons, the pad's confirm doesn't hop
	{
		const d = await bootPage();
		const base = await E(d.page, async () => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			G.Flow.play('normal');
			await wait(500);
			window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)');
			for (let i = 0; i < 40 && !(G.Pad.ready && G.Pad.active); i++) { window.__btn(12, true); await wait(50); window.__btn(12, false); await wait(50); }
			const pl = G.Game.player, m = G.Pad.map();
			window.__btn(m.confirm, true); await wait(90); window.__btn(m.confirm, false); await wait(60);
			window.__btn(m.cancel, true); await wait(90); window.__btn(m.cancel, false); await wait(60);
			const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), ku = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
			kd('Space'); await wait(80); ku('Space'); kd('ShiftLeft'); await wait(80); ku('ShiftLeft');
			await wait(200);
			const out = { zone: G.World.zone, air: 'air' in pl, hopN: 'hopN' in pl, slide: 'slideT' in pl, verbs: 'xverbs' in pl, rects: G.HUD.rects().map(r => r.name), loaded: G.Expedition.loaded, state: G.Game.state };
			G.Game.quit();
			return out;
		});
		A(base.zone === null && !base.air && !base.hopN && !base.slide && !base.verbs && !base.rects.includes('hop') && !base.rects.includes('slide') && base.loaded === false,
			'a Normal run: no zone, no HOP / SLIDE buttons, and the pad\'s confirm / cancel and Space / Shift touch nothing (the Expedition code is never loaded)', JSON.stringify(base));
		await d.ctx.close();
	}

	// 9. the phone layouts (landscape, touch) + 10b. phone screenshots
	for (const [name, view] of [['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['small phone', { width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startExp(d.page);
		const lay = await E(d.page, async () => {
			const H = window.__t, pl = H.become(16);
			H.quiet();
			G.Exp.enterZone(1);
			H.place(pl, 0, 0);
			H.thaw();
			await new Promise(r => setTimeout(r, 600));
			const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
			return { R, W: innerWidth, Hh: innerHeight, touch: G.Touch.active, k };
		});
		const R = lay.R || [], mine = R.filter(o => o.name === 'hop' || o.name === 'slide');
		const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
		const hits = [];
		for (const a of mine) for (const b of R) if (a !== b && ov(a, b) && !(a.name === b.name)) hits.push(a.name + ' x ' + b.name);
		const onScreen = mine.length === 2 && mine.every(o => o.x >= 0 && o.y >= 0 && o.x + o.w <= lay.W + 1 && o.y + o.h <= lay.Hh + 1);
		A(st.ok && lay.touch && onScreen && !hits.length, `${name} (${view.width}x${view.height}, touch): HOP and SLIDE are on screen and overlap nothing else on the HUD`, JSON.stringify({ hits, mine, names: R.map(o => o.name) }));
		const hopR2 = mine.find(o => o.name === 'hop'), slideR2 = mine.find(o => o.name === 'slide');
		if (hopR2 && slideR2) {
			const cx = hopR2.x + hopR2.w / 2, cy = hopR2.y + (hopR2.h - 20) / 2;
			const n0 = await E(d.page, () => G.Game.player.hopN | 0);
			await d.page.touchscreen.tap(cx, cy);
			await sleep(90);
			await d.page.touchscreen.tap(cx, cy);
			await sleep(60);
			const two = await E(d.page, () => ({ n: G.Game.player.hopN | 0, hops: G.Game.player.air && G.Game.player.air.hops }));
			A(two.n === n0 + 2 && two.hops === 2, `${name}: a tap on HOP hops and a quick second tap is the extra hop`, JSON.stringify([n0, two]));
			await sleep(1500);
			await d.page.touchscreen.tap(slideR2.x + slideR2.w / 2, slideR2.y + (slideR2.h - 20) / 2);
			await sleep(50);
			const sl = await E(d.page, () => ({ t: G.Game.player.slideT, cd: G.Game.player.slideCd, stick: !!G.Touch.stick }));
			A((sl.t > 0 || sl.cd > 0) && !sl.stick, `${name}: a tap on SLIDE slides (and opens no joystick)`, JSON.stringify(sl));
			await sleep(1200);
		}
		if (name === 'phone') {
			await shoot(d.page, 'expedition_hud_phone.png');
			const pp = await poses(d.page, 'phone');
			A(pp.hop.air === 'hop' && pp.glide.air === 'glide' && pp.surf.verb === 'surf', 'phone: mid-hop, mid-glide and mid-surf poses drawn', JSON.stringify(pp));
			A(pp.drop && pp.drop.air === 'drop' && pp.drop.lift > 3, 'phone: a fall off a ledge drawn mid-drop', JSON.stringify(pp.drop));
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
