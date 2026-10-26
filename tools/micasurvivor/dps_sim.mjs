// tools/micasurvivor/dps_sim.mjs — MicaSurvivor DLC D16 (owner 2026-10-26: every move fires on its own cooldown): the DPS
// measurement behind G.Combat.AF.DMG / DMG_EXP (owner decision #10: "a global damage factor so total DPS ~ 1.6x today's").
//
// The fixed-step bot sim of D11 (a fixed guest profile, an invulnerable bot that wanders, Math.random seeded, the run stepped
// with G.Game.debugStep at a fixed dt, every card / item screen answered with its first card) plays a run to T seconds; that
// run's BUILD (its moves, their levels and evolutions, items, stats) is then measured on a target dummy: the field cleared,
// 12 dummies of 6 types (water, grass, fire, bug, rock, psychic: no immunity dominates) in a ring 70-190 px away, the player
// still; its damage over WINDOW seconds, for
//   one      today's game: one active slot (pl.af = false), each slot alone; "today" = the BEST slot (a player fired their
//            best move) and the mean slot
//   all      every slot firing (pl.af = true) at x1 (pl.afDmg = 1: the raw multiplier)
//   fused    (base) a bond fuses two moves into one slot and the freed slot takes a new move: all firing, x1
// factor = 1.6 x best / all (the damage factor that makes all-fire 1.6x today's best slot), averaged over seeds.
//   node tools/micasurvivor/dps_sim.mjs [--modes=normal,exp] [--seeds=3] [--t=300,600] [--window=20] [--dt=0.0333]
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. One browser, one page at a time.)
// --apply: also measure with the factors the code ships (pl.afDmg as the run set it) and print the shipped multiplier.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const MODES = arg('modes', 'normal,exp').split(',');
const SEEDS = +arg('seeds', 3);
const TS = arg('t', '300,600').split(',').map(Number);
const WINDOW = +arg('window', 20);
const DT = +arg('dt', 1 / 30);
const APPLY = process.argv.includes('--apply');
const PORT = 8893;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
// the D0a golden profile's upgrades (a fully upgraded partner), Charmander as partner
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' }, 133: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: Object.fromEntries([1, 4, 7, 25, 133].map(d => [d, { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5 }])),
};
const BEFORE = save => {
	const H = window.__s = { frozen: false };
	let a = 1;
	H.reseed = s => { a = s >>> 0; };
	Math.random = function random() { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'ddpssim01');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* reported by the boot wait */ }
	const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
	const DIRS = [['KeyD'], ['KeyD', 'KeyS'], ['KeyS'], ['KeyA', 'KeyS'], ['KeyA'], ['KeyA', 'KeyW'], ['KeyW'], ['KeyD', 'KeyW']];
	let held = [];
	const hold = list => { for (const k of held) if (!list.includes(k)) key('keyup', k); for (const k of list) if (!held.includes(k)) key('keydown', k); held = list.slice(); };
	H.tap = code => { key('keydown', code); key('keyup', code); };
	// the bot: a pure function of the frame (1 s walking in one of 8 directions, 1.5 s still), invulnerable
	H.input = f => { const k = f % 75; return k < 30 ? DIRS[(Math.floor(f / 75) * 3) % DIRS.length] : []; };
	/** play the started run to `secs` (dt steps), the bot invulnerable; any card / item screen: its first card. -> {t, stuck} */
	H.play = (secs, dt) => {
		H.freeze();
		const pl = G.Game.player;
		pl.hurt = () => {}; pl.invuln = 1e9;
		const steps = Math.round(secs / dt);
		let blocked = 0, stuck = 0;
		for (let f = 0; f < steps; f++) {
			const st = G.Game.state;
			if (st === 'over') break;
			if (st === 'playing') { blocked = 0; hold(H.input(f)); }
			else {
				hold([]);
				if (st !== 'held') {
					if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.pick.at = -1e9; G.ExpEco.choose(0); }
					else if (G.UI.isOpen('scr-bond')) { const c = document.querySelector('#bond-cards .card'); if (c) c.click(); else H.tap('Escape'); }
					else H.tap('Digit1');
				}
				if (++blocked > 300) { if (G.ExpCap && G.ExpCap.run && G.ExpCap.run.prompt) G.ExpCap.run.prompt = null; H.tap('Escape'); if (blocked > 900) { stuck = f; break; } }
			}
			G.Game.debugStep(1, dt);
		}
		hold([]);
		return { t: Math.round(G.Game.st.time), stuck, level: pl.level, moves: pl.slots.map(g => g.map(m => m.id + ':' + (m.xlv || m.lvl) + (m.evolved ? 'e' : '')).join('+')), items: [pl.item, pl.item2].filter(Boolean), xi: pl.xi ? Object.keys(pl.xi).length : 0 };
	};
	const DUMMY = [7, 1, 4, 10, 74, 63];   // water, grass/poison, fire, bug, rock/ground, psychic
	/** the dummy ring: every live foe gone, 12 dummies with ~infinite HP, still. */
	H.dummies = top => {
		if (top) { if (G.EnemyMgr.all().filter(e => !e.dead).length >= 12) return; }
		for (const e of G.EnemyMgr.all()) e.remote = true;
		G.EnemyMgr.clear();
		G.Projectiles.clearOrbs();
		if (G.Combat.clearFields) G.Combat.clearFields();
		const pl = G.Game.player;
		for (let i = 0; i < 12; i++) {
			const a = i / 12 * 6.2832, r = 70 + (i % 3) * 60;
			const e = new G.Enemy({ dex: DUMMY[i % DUMMY.length], hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r, { hp: 1, spd: 0, dmg: 0 });
			e.spd = 0; e.dmg = 0;
			G.EnemyMgr.add(e);
		}
	};
	/** the build's damage over `secs` with cfg {af, active, k}: the field reset first. -> damage per second */
	H.measure = (cfg, secs, dt) => {
		const pl = G.Game.player;
		const keep = { af: pl.af, active: pl.active, k: pl.afDmg };
		pl.af = cfg.af; pl.active = cfg.active || 0; pl.afDmg = cfg.k == null ? 1 : cfg.k;
		for (let i = 0; i < 60 && G.Game.state !== 'playing'; i++) { if (G.Game.state !== 'held') H.tap('Digit1'); G.Game.debugStep(1, dt); }
		for (const g of pl.slots) for (const m of g) m.t = 0;
		pl.gainXp = () => 0;   // (no level-up screen in the window)
		H.dummies();
		const add = G.EnemyMgr.add; G.EnemyMgr.add = function (e) { return e && e.def && e.def.hp === 1e9 ? add.call(this, e) : null; };   // (the spawner off: only the dummies)
		hold([]);
		const d0 = pl.dmgDealt, x0 = pl.x, y0 = pl.y;
		const steps = Math.round(secs / dt);
		for (let f = 0; f < steps; f++) {
			if (G.Game.state !== 'playing') { if (G.Game.state !== 'held') H.tap('Escape'); }
			pl.x = x0; pl.y = y0;
			for (const e of G.EnemyMgr.all()) { e.kx = 0; e.ky = 0; }
			if (f % 15 === 0) H.dummies(true);   // (a dummy lost to an Expedition effect: the ring again)
			G.Game.debugStep(1, dt);
		}
		const dps = (pl.dmgDealt - d0) / secs;
		G.EnemyMgr.add = add;
		if (window.__dbg) console.log('measure', JSON.stringify(cfg), G.Game.state, G.EnemyMgr.all().length, G.EnemyMgr.all().filter(e => !e.dead).length, pl.dead, pl.coopDown, G.Rift && G.Rift.inArena, dps);
		pl.af = keep.af; pl.active = keep.active; pl.afDmg = keep.k;
		return Math.round(dps * 10) / 10;
	};
	/** (base) a bond: the first two loose moves fused, then a new move in the freed slot. -> the slots */
	H.fuseBuild = () => {
		const pl = G.Game.player;
		const loose = pl.slots.filter(s => s.length === 1).map(s => s[0]);
		if (loose.length < 2) return null;
		pl.bonds = 1;
		pl.fuse(loose.slice(0, 2));
		const pool = G.Moves.poolFor(pl.mon).filter(id => !pl.hasMove(id) && G.Moves.BY_ID[id].kind !== 'buff');
		if (pool.length) pl.addMove(pool[0]);
		return pl.slots.map(g => g.map(m => m.id).join('+'));
	};
};

const out = [];
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	for (const mode of MODES) for (let seed = 1; seed <= SEEDS; seed++) for (const T of TS) {
		const t0 = Date.now();
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		if (process.env.DBG) { page.on('console', m => console.log('[page] ' + m.text().slice(0, 300))); await page.evaluateOnNewDocument(() => { window.__dbg = 1; }); }
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await page.evaluate(() => { const el = document.getElementById('tap-start'); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; })) await page.click('#tap-start');
		await waitFor(() => page.evaluate(() => { const el = document.getElementById('scr-menu'); return !!el && !el.classList.contains('hidden'); }), 15000);
		const started = await page.evaluate(async (mode, seed) => {
			G.Audio.sfx = () => {}; G.Audio.music = () => {};
			window.__s.reseed(seed * 7919);
			if (mode === 'exp') {
				const ok = await G.Expedition.load().catch(e => String(e));
				if (ok !== true) return { error: String(ok) };
				await G.ExpSave.open();
				await G.Flow.play('exp-classic');
			} else G.Flow.play('normal');
			return { state: G.Game.state, mode: G.Game.mode, dv: G.Expedition.DV, afDmg: G.Game.player && G.Game.player.afDmg };
		}, mode, seed);
		if (started.error || started.state !== 'playing') { console.log(mode, seed, T, 'did not start', JSON.stringify(started)); await ctx.close(); continue; }
		const run = await page.evaluate((T, dt) => window.__s.play(T, dt), T, DT);
		const shipped = started.afDmg;
		const res = await page.evaluate((W, dt, apply, shipped, mode) => {
			const H = window.__s, pl = G.Game.player, n = pl.slots.length;
			const one = [];
			for (let i = 0; i < n; i++) one.push(H.measure({ af: false, active: i, k: 1 }, W, dt));
			const all = H.measure({ af: true, k: 1 }, W, dt);
			const ship = apply ? H.measure({ af: true, k: shipped }, W, dt) : null;
			let fused = null, fusedSlots = null;
			if (mode === 'normal') { fusedSlots = H.fuseBuild(); if (fusedSlots) fused = H.measure({ af: true, k: 1 }, W, dt); }
			const fship = apply && fusedSlots ? H.measure({ af: true, k: shipped }, W, dt) : null;
			return { one, all, ship, fused, fship, fusedSlots };
		}, WINDOW, DT, APPLY, shipped, mode);
		await ctx.close();
		const best = Math.max(...res.one), mean = res.one.reduce((a, b) => a + b, 0) / (res.one.length || 1);
		const row = { mode, seed, T, level: run.level, moves: run.moves, items: run.items, stuck: run.stuck, one: res.one, best, mean: Math.round(mean * 10) / 10, all: res.all,
			kBest: +(res.all / best).toFixed(3), kMean: +(res.all / mean).toFixed(3), factor: +(1.6 * best / res.all).toFixed(3),
			fused: res.fused, fusedSlots: res.fusedSlots, kFused: res.fused ? +(res.fused / best).toFixed(3) : null,
			shippedK: shipped, ship: res.ship, shipX: res.ship ? +(res.ship / best).toFixed(3) : null, fship: res.fship, fshipX: res.fship ? +(res.fship / best).toFixed(3) : null,
			secs: Math.round((Date.now() - t0) / 1000) };
		out.push(row);
		console.log(JSON.stringify(row));
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
for (const mode of MODES) {
	const rs = out.filter(r => r.mode === mode);
	if (!rs.length) continue;
	const avg = k => +(rs.reduce((a, r) => a + (r[k] || 0), 0) / rs.filter(r => r[k] != null).length).toFixed(3);
	console.log(`\n${mode}: ${rs.length} builds · all-fire / best slot x${avg('kBest')} · / mean slot x${avg('kMean')} · factor for 1.6x best: ${avg('factor')}` +
		(mode === 'normal' ? ` · fused build / best slot x${avg('kFused')}` : '') + (APPLY ? ` · SHIPPED x${avg('shipX')} of today's best slot` + (mode === 'normal' ? `, fused x${avg('fshipX')}` : '') : ''));
}
