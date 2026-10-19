// micasurvivor_dlc_base_unchanged_test.mjs — MicaSurvivor DLC batch D0a: the "base unchanged" golden-run test
// (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.0.4). The Expedition DLC adds new modes; the owner's rule is that the
// existing modes stay EXACTLY as they are. This test is the proof: every later DLC batch re-runs it and must match.
//
// What it does, per base mode (Normal, Daily, Boss Rush, Tower, Team, local Co-op), each in a fresh browser context:
//   - boots /micasurvivor/ as a fixed guest profile (a fixed save in localStorage: 5 Pokémon, all fully upgraded so
//     the runs last; a fixed device id; a 1280x720 viewport, which sets the camera and so where enemies spawn)
//   - before any page script (evaluateOnNewDocument, TEST ONLY): Math.random -> a seeded mulberry32 that counts draws;
//     crypto.getRandomValues seeded; Date / Date.now and performance.now on a virtual clock (fixed day; while the sim
//     runs, the clock moves exactly dt per step); requestAnimationFrame frozen once the sim starts (no real frames)
//   - TEST ONLY as well: G.Audio.sfx / music are silenced (sound effects draw Math.random only where an audio device
//     exists, so the draw count would depend on the machine) and G.EnemyMgr.add is wrapped to log spawns
//   - reseeds, starts the mode (G.Flow.play) and runs SECONDS of sim with G.Game.debugStep(1, 1/60) inside ONE
//     synchronous page.evaluate (no timer, network reply or frame can interleave), with scripted keyboard input
//     through the game's own input layer (KeyboardEvent on window -> G.Input: keep away from close enemies, else a
//     fixed walk / stand pattern; Digit1 takes the first card of any level-up / bond / item / Tower screen)
//   - records, per second of sim: a hash of the player, the enemies, the pickups, the projectiles and the rest (clock,
//     state, biome, co-op partner, team), their counts and the Math.random draw count; the spawn log; the kill / XP /
//     coin totals; then quits the run and records the final save (timestamps normalised)
//   - Normal also records its 12c replay; a fresh context plays the FIXTURE replay through the replay player
//     (G.WatchUI, stepped with debugStep) to its last frame and hashes it
//   - a run ends at SECONDS or when the player falls (Normal ~112 s, Daily ~74 s, Boss Rush ~49 s with this script)
// Not covered: what render() does (the harness never draws), sound, online co-op, the network.
// The fixtures are overworld/tests/fixtures/micasurvivor_golden/<mode>.json + replay.json (LF line endings).
// On a mismatch the test prints the FIRST divergent second and field (and the fixture vs. actual values).
//
// Regenerating (ONLY for a deliberate base change, e.g. a balance pass on a base mode; never to make a DLC batch pass):
//   node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs --record
// then review the fixture diff and say in the PR why the base changed.
// Debugging: ONLY=normal,tower runs those modes; TRACE=1 prints [frame, state, hp, maxHp, x, y, dead, enemies] each
// second; SECONDS=30 shortens the run (only with --record into a scratch dir: GOLDEN_DIR=<dir>).
//   node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs
// Covers micasurvivor/** (every base mode's sim, the save, the replay recorder and player); see the README section
// "DLC D0a: base-unchanged harness".
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
// (B1c) MAGEPUNK_ASSET_ROOT=<checkout>: serve the gitignored micasurvivor/assets/ and overworld/data/ from that checkout
// (read only; a git worktree has neither), as micasurvivor_pokedex_test does
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8842;
const RECORD = process.argv.includes('--record');
const DIR = process.env.GOLDEN_DIR || path.join(HERE, 'fixtures', 'micasurvivor_golden');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const SECONDS = +process.env.SECONDS || 120;
const DT = 1 / 60;
const SEED = 0x0d0a5eed;
const MODES = ['normal', 'daily', 'rush', 'tower', 'team', 'coop'];
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// a static server; /api/mp answers {} (a guest profile makes no account calls that matter; nothing waits on them)
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});

// the fixed guest profile: 5 Pokémon (so Team has 3 and Co-op has a partner), Charmander as partner
const BASE_SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' }, 133: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	// every owned Pokémon fully upgraded (Vitality, Strength, Armour, Synthesis, Second Chance...): the runs last ~120 s
	pupg: Object.fromEntries([1, 4, 7, 25, 133].map(d => [d, { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 }])),
};

// ---------------------------------------------------------------- the page side (before any page script)
const BEFORE = (baseSave) => {
	// --- seeded Math.random with a draw counter
	const H = window.__golden = { draws: 0, virt: null, frozen: false, spawns: [] };
	let a = 1;
	const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	let c = 7;
	const nextC = () => { c = (c + 0x9E3779B9) >>> 0; let t = c; t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B); t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35); return (t ^ (t >>> 16)) >>> 0; };
	H.reseed = s => { a = s >>> 0; c = (s ^ 0xA5A5A5A5) >>> 0; H.draws = 0; };
	Math.random = function random() { H.draws++; return next(); };
	const realGRV = crypto.getRandomValues.bind(crypto);
	crypto.getRandomValues = function getRandomValues(arr) { if (!arr || !arr.BYTES_PER_ELEMENT) return realGRV(arr); const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u8.length; i++) u8[i] = nextC() & 255; return arr; };
	// --- the clock: performance.now real during boot, virtual (moved by the sim) once the sim starts
	const realNow = performance.now.bind(performance);
	Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: function now() { return H.virt != null ? H.virt : realNow(); } });
	const RD = Date;
	const EPOCH = new RD(2026, 0, 15, 12, 0, 0).getTime();   // local noon: the same day in any time zone
	H.EPOCH = EPOCH;
	class FD extends RD {
		constructor(...args) { if (!args.length) super(FD.now()); else super(...args); }
		static now() { return EPOCH + Math.floor(performance.now()); }
	}
	window.Date = FD;
	// --- requestAnimationFrame: real during boot, swallowed once frozen (the sim then runs only through debugStep)
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); });
	H.freeze = () => { H.frozen = true; H.virt = 1e7; };
	// --- the fixed guest profile
	try {
		localStorage.setItem('micasurvivor_dev', 'dgolden01');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(baseSave));
	} catch (e) { /* the test reports a boot failure */ }

	// --- hashing (FNV-1a over a canonical string; numbers to 1/100)
	const r2 = v => typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 100) : String(v)) : v === true ? 1 : v === false || v == null ? 0 : v;
	const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
	const row = arr => arr.map(r2).join(',');
	H.fnv = fnv;
	H.hashSnap = o => fnv(JSON.stringify(o, (k, v) => typeof v === 'number' ? r2(v) : v));
	const mon = p => p ? [p.dex, p.x, p.y, p.hp, p.maxHp, p.dead, p.level, p.xp, p.kills, p.coins, p.bosses, p.item || '', p.item2 || '',
		(p.moves || []).map(m => m.id + ':' + m.lvl + (m.evolved ? 'e' : '')).join('/')] : [];
	H.sample = () => {
		const g = G.Game, pl = g.player;
		const en = G.EnemyMgr.all(), pk = G.Pickups.all(), pj = G.Projectiles.all();
		const fP = row(mon(pl)) + '|' + row([pl && pl.atkMul, pl && pl.spdMul, pl && pl.cdMul, pl && pl.magnet, pl && pl.invuln]);
		const fE = en.map(e => row([e.id, e.dex, e.x, e.y, e.hp, e.maxHp, e.boss, e.dead])).join(';');
		const fK = pk.map(p => row([p.kind, p.x, p.y, typeof p.value === 'number' ? p.value : String(p.value)])).join(';');
		const fJ = pj.map(p => row([p.id, p.x, p.y, p.vx, p.vy, p.dmg, p.life === Infinity ? -1 : p.life, p.friendly])).join(';');
		const mate = G.LocalCoop && G.LocalCoop.mate;
		const fS = row([G.Game.st.time, g.state, G.World.biome != null ? G.World.biome : '', G.Game.pendingLevels]) + '|' + row(mon(mate)) + '|' +
			(G.Team && G.Team.on ? JSON.stringify(G.Team.members ? G.Team.members.map(m => [m.dex, r2(m.hp)]) : G.Team.list()) : '') + '|' + (G.Tower && G.Tower.on ? row([G.Tower.floor, G.Tower.clears]) : '');
		return { p: fnv(fP), e: fnv(fE), k: fnv(fK), j: fnv(fJ), s: fnv(fS), ne: en.length, nk: pk.length, nj: pj.length };
	};

	// --- scripted input through the game's own input layer (window keydown / keyup -> G.Input)
	const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
	const DIRS = [['KeyD'], ['KeyD', 'KeyS'], ['KeyS'], ['KeyA', 'KeyS'], ['KeyA'], ['KeyA', 'KeyW'], ['KeyW'], ['KeyD', 'KeyW']];   // 0 = east, clockwise (y down)
	let held = [];
	const hold = list => { for (const k of held) if (!list.includes(k)) key('keyup', k); for (const k of list) if (!held.includes(k)) key('keydown', k); held = list.slice(); };
	H.releaseAll = () => hold([]);
	// the input script (a pure function of the frame and the run state, so it is as deterministic as the run): keep away
	// from enemies closer than 200 (away, turned ~50° clockwise, so it circles instead of backing into a wall); with nobody
	// close, 1 s walking in one of 8 directions (turning 3/8 each time) then 1.5 s standing still
	H.input = f => {
		const pl = G.Game.player;
		let vx = 0, vy = 0;
		if (pl) for (const e of G.EnemyMgr.all()) {
			if (e.dead) continue;
			const dx = pl.x - e.x, dy = pl.y - e.y, d2 = dx * dx + dy * dy;
			if (d2 < 200 * 200 && d2 > 0) { vx += dx / d2; vy += dy / d2; }
		}
		if (vx || vy) {
			const a = Math.atan2(vy, vx) + 0.9;   // away, turned clockwise
			return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
		}
		const k = f % 150;
		return k < 60 ? DIRS[(Math.floor(f / 150) * 3) % DIRS.length] : [];
	};

	// --- the sim: ONE synchronous call (nothing else can run in between)
	H.sim = ({ mode, seconds, dt, seed }) => {
		H.freeze();
		H.reseed(seed);
		H.spawns = [];
		// the Daily's Pokémon of the day is not one of yours: it gets the same upgrades (part of the fixed profile)
		const cfg = G.Modes.plan(mode);
		if (cfg.dex && !G.DB.save.pupg[cfg.dex]) G.DB.save.pupg[cfg.dex] = Object.assign({}, G.DB.save.pupg[G.DB.save.partner]);
		G.Flow.play(mode);
		const out = { mode, started: G.Game.state, gameMode: G.Game.mode, seconds: [], picks: 0, stuck: 0 };
		const steps = Math.round(seconds / dt), per = Math.round(1 / dt);
		let blocked = 0;
		for (let f = 0; f < steps; f++) {
			const st = G.Game.state;
			if (st === 'over') break;
			if (st === 'playing') { blocked = 0; hold(H.input(f)); }
			else { hold([]); if (st !== 'held') { key('keydown', 'Digit1'); key('keyup', 'Digit1'); out.picks++; } if (++blocked > 600) { out.stuck = f; break; } }
			H.virt += dt * 1000;
			G.Game.debugStep(1, dt);
			if ((f + 1) % per === 0) { const s = H.sample(); s.d = H.draws; out.seconds.push(s); if (H.trace) { const p = G.Game.player; H.trace.push([f + 1, G.Game.state, p && Math.round(p.hp), p && Math.round(p.maxHp), p && Math.round(p.x), p && Math.round(p.y), p && p.dead, G.EnemyMgr.all().length]); } }
		}
		hold([]);
		const pl = G.Game.player;
		out.endState = G.Game.state;
		out.totals = pl ? { time: Math.round(G.Game.st.time * 100) / 100, level: pl.level, xp: Math.round(pl.xp * 100) / 100, kills: pl.kills, coins: pl.coins, bosses: pl.bosses, t1: pl.t1, t10: pl.t10 } : null;
		out.draws = H.draws;
		out.finalSnap = G.Spectate && G.Spectate.snap ? H.hashSnap(G.Spectate.snap()) : '';
		G.Game.quit();   // ends the run (endRun(false)): rewards, stats, missions and achievements into the save
		out.endState2 = G.Game.state;
		out.drawsAfterQuit = H.draws;
		out.spawns = H.spawns.slice();
		out.save = JSON.parse(JSON.stringify(G.DB.save));
		return out;
	};

	// --- the replay player: play a packed replay to its end with debugStep (async: unpacking)
	H.play = async (code, seed, dt) => {
		const rd = await G.Replay.open(code);
		if (!rd) return { error: 'the replay does not open' };
		H.freeze();
		H.reseed(seed);
		const last = rd.at(rd.length - 1);
		G.WatchUI.playReplay(rd, {});
		let steps = 0;
		const max = Math.ceil(rd.duration / dt) + 600;
		while (G.WatchUI.playing && steps < max) { H.virt += dt * 1000; G.Game.debugStep(1, dt); steps++; }
		const pl = G.Game.player;
		const view = {
			p: pl ? [pl.dex, pl.x, pl.y, pl.hp, pl.maxHp, pl.dead, pl.level, (pl.moves || []).map(m => m.id + ':' + m.lvl).join('/')] : null,
			e: G.EnemyMgr.all().map(e => [e.id, e.dex, e.x, e.y, e.dead]),
			k: G.Pickups.all().map(p => [p.kind, p.x, p.y]),
		};
		return { frames: rd.length, duration: rd.duration, steps, finished: !G.WatchUI.playing, T: G.WatchUI.T, finalFrame: H.hashSnap(last), view: H.hashSnap(view), ne: view.e.length, nk: view.k.length };
	};
};

// ---------------------------------------------------------------- normalising and comparing
const EPOCH_GUESS = new Date(2026, 0, 15, 12).getTime();
const isStamp = v => typeof v === 'number' && Math.abs(v - EPOCH_GUESS) < 400 * 864e5;
function normSave(s) {
	return JSON.parse(JSON.stringify(s, (k, v) => isStamp(v) ? '<ts>' : v));
}
const stable = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
// the first difference between two JSON values: a path and both sides
function firstDiff(a, b, p = '') {
	if (stable(a) === stable(b)) return null;
	if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
		const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
		for (const k of keys) { const d = firstDiff(a[k], b[k], p + (Array.isArray(a) ? `[${k}]` : `.${k}`)); if (d) return d; }
	}
	return { path: p || '(root)', want: JSON.stringify(a)?.slice(0, 200), got: JSON.stringify(b)?.slice(0, 200) };
}
const FIELD = { p: 'player', e: 'enemies', k: 'pickups', j: 'projectiles', s: 'clock/state/biome/partner/team', ne: 'enemy count', nk: 'pickup count', nj: 'projectile count', d: 'Math.random draws' };
function compareSeconds(want, got) {
	for (let i = 0; i < Math.max(want.length, got.length); i++) {
		const w = want[i], g = got[i];
		if (!w || !g) return `second ${i + 1}: the run ${!g ? 'ended early' : 'ran longer'} (fixture ${want.length} s, now ${got.length} s)`;
		for (const f of Object.keys(FIELD)) if (w[f] !== g[f]) return `second ${i + 1}: ${FIELD[f]} (${f}) diverged: fixture ${w[f]} vs now ${g[f]}` +
			` · also differing that second: ${Object.keys(FIELD).filter(x => x !== f && w[x] !== g[x]).join(', ') || 'nothing else'}`;
	}
	return null;
}

// ---------------------------------------------------------------- the browser
const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

	async function bootPage() {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, BASE_SAVE);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		// TEST ONLY: no sound (its random draws depend on the audio device) and the spawn log
		await page.evaluate(() => {
			G.Audio.sfx = () => {}; G.Audio.music = () => {};
			const add = G.EnemyMgr.add, H = window.__golden;
			G.EnemyMgr.add = function (e) { const r = add.call(this, e); H.spawns.push([Math.round(G.Game.st.time * 100), e.dex, e.boss ? 1 : 0, e.den ? 1 : 0, Math.round(e.maxHp)]); return r; };
		});
		return { ctx, page, menu };
	}

	const results = {};
	for (const mode of MODES) {
		if (ONLY.length && !ONLY.includes(mode)) continue;
		const t0 = Date.now();
		const { ctx, page, menu } = await bootPage();
		A(menu, `${mode}: boots to the menu as the fixed guest profile`, errors.slice(-3).join(' | '));
		const r = await page.evaluate(H => { if (H.trace) window.__golden.trace = []; const o = window.__golden.sim(H); o.trace = window.__golden.trace; return o; }, { mode, seconds: SECONDS, dt: DT, seed: SEED, trace: !!process.env.TRACE });
		if (r.trace) console.log(r.trace.map(x => JSON.stringify(x)).join('\n'));
		delete r.trace;
		const env = await page.evaluate(() => ({ dex: G.DEX.length, ua: navigator.userAgent.match(/(Chrome|Edg)\/[\d.]+/g)?.join(' ') || '' }));
		if (mode === 'normal') {
			const rep = await page.evaluate(async () => { const e = G.Replay.last; if (!e) return null; await e.ready; const text = await G.Replay.unpack(e.code); return { code: e.code, raw: text.length, hash: window.__golden.fnv(text), frames: e.meta.frames }; });
			r.replay = rep;
		}
		await ctx.close();
		r.save = normSave(r.save);
		results[mode] = { r, env, ms: Date.now() - t0 };
		console.log(`     ${mode}: ${r.seconds.length} s simulated, ${r.draws} draws, ${r.spawns.length} spawns, kills ${r.totals && r.totals.kills}, ${r.picks} picks, end ${r.endState} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
		A(r.started === 'playing' && r.gameMode === mode, `${mode}: the run starts in its mode`, JSON.stringify([r.started, r.gameMode]));
		A(!r.stuck, `${mode}: no screen blocked the scripted run`, String(r.stuck));
	}

	// the replay: play the (fixture's, or the just-recorded) Normal replay through the player
	const playReplay = async (code) => {
		const { ctx, page, menu } = await bootPage();
		A(menu, 'replay: boots to the menu');
		const out = await page.evaluate((code, seed, dt) => window.__golden.play(code, seed, dt), code, SEED, DT);
		await ctx.close();
		return out;
	};

	const fixtureOf = (mode, { r, env }) => ({
		about: 'MicaSurvivor DLC D0a golden run (overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs). Regenerate ONLY for a deliberate base change: --record.',
		mode, seed: SEED, dt: DT, seconds: SECONDS, pokedex: env.dex, recordedWith: env.ua,
		endState: r.endState, totals: r.totals, draws: r.draws, drawsAfterQuit: r.drawsAfterQuit, picks: r.picks, finalSnap: r.finalSnap,
		spawns: r.spawns, perSecond: r.seconds, save: r.save,
	});

	if (RECORD) {
		fs.mkdirSync(DIR, { recursive: true });
		for (const [mode, res] of Object.entries(results)) {
			fs.writeFileSync(path.join(DIR, mode + '.json'), JSON.stringify(fixtureOf(mode, res)) + '\n');
		}
		if (results.normal && results.normal.r.replay) {
			const rep = results.normal.r.replay;
			const play = await playReplay(rep.code);
			A(play.finished, 'replay: the recorded replay plays to its end', JSON.stringify(play));
			fs.writeFileSync(path.join(DIR, 'replay.json'), JSON.stringify({
				about: 'The Normal golden run\'s 12c replay (G1 = gzip + base64url). rawHash = the unpacked text; finalFrame / view = the player\'s last frame.',
				mode: 'normal', seed: SEED, rawHash: rep.hash, raw: rep.raw, frames: rep.frames, code: rep.code,
				play: { finalFrame: play.finalFrame, view: play.view, frames: play.frames, ne: play.ne, nk: play.nk, finished: play.finished },
			}) + '\n');
		}
		const sizes = fs.readdirSync(DIR).map(f => [f, fs.statSync(path.join(DIR, f)).size]);
		console.log('recorded ' + sizes.map(([f, n]) => `${f} ${(n / 1024).toFixed(1)} KB`).join(', ') + ` · total ${(sizes.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(1)} KB`);
	} else {
		for (const [mode, res] of Object.entries(results)) {
			const file = path.join(DIR, mode + '.json');
			if (!fs.existsSync(file)) { A(false, `${mode}: fixture exists`, file); continue; }
			const want = JSON.parse(fs.readFileSync(file, 'utf8')), got = fixtureOf(mode, res);
			if (want.pokedex !== got.pokedex) console.log(`     (${mode}: the fixture was recorded with a ${want.pokedex}-entry Pokédex, now ${got.pokedex})`);
			const sec = compareSeconds(want.perSecond, got.perSecond);
			A(!sec, `${mode}: per-second hashes of player / enemies / pickups / projectiles / state and the draw count match (${want.perSecond.length} s)`, sec);
			A(want.draws === got.draws && want.drawsAfterQuit === got.drawsAfterQuit, `${mode}: Math.random draws match (${want.draws}; ${want.drawsAfterQuit} with the run end)`, `fixture ${want.draws}/${want.drawsAfterQuit} vs now ${got.draws}/${got.drawsAfterQuit}`);
			const sp = firstDiff(want.spawns, got.spawns);
			A(!sp, `${mode}: the spawn log matches (${want.spawns.length} spawns)`, sp && `first difference at spawns${sp.path} [t*100, dex, boss, den, maxHp]: fixture ${sp.want} vs now ${sp.got}`);
			const tt = firstDiff(want.totals, got.totals);
			A(!tt && want.endState === got.endState, `${mode}: kill / XP / coin totals and the end state match (${JSON.stringify(want.totals)})`, tt ? `totals${tt.path}: fixture ${tt.want} vs now ${tt.got}` : `end state ${want.endState} vs ${got.endState}`);
			A(want.finalSnap === got.finalSnap && want.picks === got.picks, `${mode}: the final snapshot and the number of card picks match`, `${want.finalSnap}/${want.picks} vs ${got.finalSnap}/${got.picks}`);
			const sv = firstDiff(want.save, got.save);
			A(!sv, `${mode}: the final save blob matches (timestamps normalised)`, sv && `save${sv.path}: fixture ${sv.want} vs now ${sv.got}`);
		}
		if (results.normal) {
			const file = path.join(DIR, 'replay.json');
			if (!fs.existsSync(file)) A(false, 'replay: fixture exists', file);
			else {
				const want = JSON.parse(fs.readFileSync(file, 'utf8')), rep = results.normal.r.replay;
				A(!!rep && rep.hash === want.rawHash && rep.frames === want.frames, `replay: the Normal run records the same replay (${want.frames} frames, ${want.raw} chars)`, JSON.stringify(rep && { hash: rep.hash, frames: rep.frames, raw: rep.raw }));
				const play = await playReplay(want.code);
				A(play.finished && play.finalFrame === want.play.finalFrame && play.view === want.play.view, `replay: the fixture replay plays to the same final frame hash (${want.play.finalFrame} / ${want.play.view})`, JSON.stringify(play));
			}
		}
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
