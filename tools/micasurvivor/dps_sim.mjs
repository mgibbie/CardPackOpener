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
// --pace (DLC D21): the PACING bot runs instead: the same invulnerable bot plays an Expedition run (--pmodes=survival,classic:
//   Survival to --survT seconds, milestone bosses down 40 s after they come, the migration portal taken; Classic to its clear,
//   ~6:30 a zone, then the altar, the guardian down 45 s after it wakes, the portal), once as today's game (one active slot:
//   pl.af = false, x1) and once as shipped (every slot firing, the shipped factor); prints KOs, the level, the bosses and the
//   Normal pay (G.ExpMeta.payOf, in Pokémonedas) of each, averaged over --seeds. No forced KOs (the mp test's bot has them).
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
const PACE = process.argv.includes('--pace');
const PMODES = arg('pmodes', 'survival,classic').split(',');
const SURV_T = +arg('survT', 2750);
// (the Survival curve: --afonly skips the one-slot runs; --dv=19 plays the run at that content version (19: the shared curve, before
//  the Survival curve); --vuln: the bot can be hurt and fall (no boss assist): the survival rate. Every run prints its level at the
//  LV_AT marks.)
const AF_ONLY = process.argv.includes('--afonly');
const RUN_DV = arg('dv', null) == null ? null : +arg('dv', null);
const VULN = process.argv.includes('--vuln') ? 1 : process.argv.includes('--soft') ? 2 : 0;   // (--soft: hurt for real, but a fall
//  refills the HP and is counted (falls, the first fall's time): the wandering bot dies by ~4:30 on either curve, so this compares them)
const RATE = arg('rate', null) == null ? null : +arg('rate', null);   // (--rate=: try Survival's spawn pacing, K.PACE.rate)
const CAPK = arg('capk', null) == null ? null : +arg('capk', null);   // (--capk=: try a smaller field, G.ExpClassic.K.CAP x k, the run's mode only)
const CURVE = arg('curve', null) ? arg('curve', null).split(',').map(Number) : null;   // (--curve=FROM,SCALE,POW: try a Survival curve)
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
	/** DLC D21: a pacing run of the started Expedition run (see --pace). af: every slot firing (as shipped), else one slot at x1. */
	H.pace = (classic, T, dt, af, vuln) => {
		H.freeze();
		const pl = G.Game.player, C = G.ExpClassic, S = G.ExpSurv;
		if (!vuln) { pl.hurt = () => {}; pl.invuln = 1e9; }
		let falls = 0, fall1 = null;
		if (vuln === 2) {
			const nd = G.Modes.noDeath, hurt0 = pl.hurt;
			pl.hurt = function (...a) { G.Modes.noDeath = () => true; try { hurt0.apply(this, a); } finally { G.Modes.noDeath = nd; } if (this.hp <= 1) { falls++; if (fall1 == null) fall1 = Math.round(G.Game.st.time); this.hp = this.maxHp; } };
		}
		const LV_AT = [300, 720, 1440, 1800, 2700], lvAt = {};
		if (!af) { pl.af = false; pl.afDmg = 1; pl.active = 0; }
		let sum = null, maxE = 0, blocked = 0;
		if (!H.hooked) { H.hooked = 1; G.Hooks.on('run.end', (o, sm) => { H.sum = JSON.parse(JSON.stringify(sm)); return o; }); }
		H.sum = null;
		// (--why: where the run's foes come from, by the function that added them, and the KOs by that source)
		const why = {}, src = new Map();
		if (window.__why) { const add0 = G.EnemyMgr.add; G.EnemyMgr.add = function (e) { if (e && !e.remote) { const st = (new Error().stack || '').split('\n').slice(2, 4).map(l => (l.match(/at (\S+)/) || [])[1] || '?').join('<'); why[st] = (why[st] || 0) + 1; src.set(e, st); } return add0.call(this, e); }; }
		const toAltar = () => { const [x, y] = C.siteXY(C.sitesOf(G.World.zone).altar); pl.x = x; pl.y = y; pl.zMask = null; pl._px = null; };
		const steps = Math.round(T / dt);
		for (let f = 0; f < steps; f++) {
			const st = G.Game.state;
			if (st === 'over') break;
			if (st === 'playing') { blocked = 0; hold(H.input(f)); }
			else {
				hold([]);
				if (st !== 'held') {
					if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.pick.at = -1e9; G.ExpEco.choose(0); }
					else H.tap('Digit1');
				}
				if (++blocked > 300) { if (G.ExpCap && G.ExpCap.run && G.ExpCap.run.prompt) G.ExpCap.run.prompt = null; H.tap('Escape'); if (blocked > 900) break; }
			}
			G.Game.debugStep(1, dt);
			if (f % 10 === 0) {
				maxE = Math.max(maxE, G.EnemyMgr.count);
				const Rn = C.run; if (!Rn) continue;
				const t = G.Game.st.time;
				for (const m of LV_AT) if (t >= m && lvAt[m] == null) lvAt[m] = pl.level;
				if (vuln) continue;
				if (classic) {
					const zt = t - Rn.zs;
					if ((zt > 390 && Rn.ph === 0) || Rn.ph === 2 || (Rn.zone === 4 && Rn.ph === 0)) toAltar();
					if (Rn.boss && !Rn.boss.dead && t - (Rn.boss.xborn || 0) > 45) Rn.boss.hurt(Rn.boss.maxHp * 10, '#fff');
				} else {
					for (const b of S.run.bosses) if (t - b.at > 40 && !b.e.dead) b.e.hurt(b.e.hp * 10, '#fff');
					if (Rn.ph === 2) { const [x, y] = C.siteXY(Rn.sites.altar); pl.x = x; pl.y = y; pl.zMask = null; pl._px = null; }
				}
			}
		}
		hold([]);
		const kills = pl.kills, level = pl.level, t = Math.round(G.Game.st.time), zone = C.run ? C.run.zone : null, won = !!(C.run && C.run.won), dead = !!pl.dead || G.Game.state === 'over';
		const mewtwo = !classic && S.run ? S.run.mewtwo : null, milestones = !classic && S.run ? S.run.downs : null;
		if (G.Game.state !== 'over') G.Game.endRun(false);
		sum = H.sum || {};
		const p = sum.parts || { kills, time: t, zone: zone || 1, bosses: 0, won, catches: 0 };
		const pay = G.ExpMeta.payOf(classic ? p : Object.assign({}, p, { surv: true }), 'normal');
		if (window.__why) { const k = {}; for (const [e, st] of src) if (e.dead) k[st] = (k[st] || 0) + 1; console.log('WHY spawns ' + JSON.stringify(Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12)) + ' dead ' + JSON.stringify(Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, 12))); }
		return { af, t, kills, level, lvAt, zone, won, dead, mewtwo, milestones, bosses: p.bosses, legends: p.legends || 0, falls, fall1, units: pay.base, pay: pay.pay, maxE, k: af ? pl.afDmg : 1, dv: G.Modes.dv };
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
	if (PACE) for (const pm of PMODES) for (let seed = 1; seed <= SEEDS; seed++) for (const af of AF_ONLY ? [true] : [false, true]) {
		const t0 = Date.now();
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		if (process.argv.includes('--why')) { page.on('console', m => { if (/^WHY/.test(m.text())) console.log(m.text()); }); await page.evaluateOnNewDocument(() => { window.__why = 1; }); }
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await page.evaluate(() => { const el = document.getElementById('tap-start'); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; })) await page.click('#tap-start');
		await waitFor(() => page.evaluate(() => { const el = document.getElementById('scr-menu'); return !!el && !el.classList.contains('hidden'); }), 15000);
		const r = await page.evaluate(async (pm, seed, af, T, dt, dv, vuln, curve, rate, capk) => {
			G.Audio.sfx = () => {}; G.Audio.music = () => {};
			window.__s.reseed(seed * 7919);
			const ok = await G.Expedition.load().catch(e => String(e));
			if (ok !== true) return { error: String(ok) };
			await G.ExpSave.open();
			if (capk != null) { G.ExpClassic.K.CAP = Math.round(G.ExpClassic.K.CAP * capk); G.ExpClassic.K.CAP_TOUCH = Math.round(G.ExpClassic.K.CAP_TOUCH * capk); }
			if (rate != null) G.ExpSurv.K.PACE.rate = rate;
			if (curve) Object.assign(G.ExpSurv.K.CURVE, { FROM: curve[0], SCALE: curve[1], POW: curve[2] });
			if (dv != null) { const plan0 = G.Modes.plan; G.Modes.plan = m => Object.assign(plan0(m), { dv }); }   // (--dv: the run's content version)
			await G.Flow.play(pm === 'classic' ? 'exp-classic' : 'exp-survival');
			if (G.Game.state !== 'playing') return { error: 'did not start ' + G.Game.state };
			return window.__s.pace(pm === 'classic', T, dt, af, vuln);
		}, pm, seed, af, pm === 'classic' ? 3600 : SURV_T, 1 / 20, RUN_DV, VULN, CURVE, RATE, CAPK);
		await ctx.close();
		const row = Object.assign({ pace: pm, seed, secs: Math.round((Date.now() - t0) / 1000) }, r);
		out.push(row);
		console.log(JSON.stringify(row));
	}
	if (!PACE) for (const mode of MODES) for (let seed = 1; seed <= SEEDS; seed++) for (const T of TS) {
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
for (const pm of PACE ? PMODES : []) for (const af of [false, true]) {
	const rs = out.filter(r => r.pace === pm && r.af === af && !r.error);
	if (!rs.length) continue;
	const avg = k => Math.round(rs.reduce((a, r) => a + (r[k] || 0), 0) / rs.length);
	console.log(`\n${pm} ${af ? 'all-fire (shipped)' : 'one slot (before D16)'}: ${rs.length} runs · ${avg('t')} s · ${avg('kills')} KOs · Lv ${avg('level')} · ${avg('bosses')} bosses · won ${rs.filter(r => r.won).length} · ${avg('units')} units = ${avg('pay')} Pokémonedas · up to ${avg('maxE')} foes`);
}
for (const mode of PACE ? [] : MODES) {
	const rs = out.filter(r => r.mode === mode);
	if (!rs.length) continue;
	const avg = k => +(rs.reduce((a, r) => a + (r[k] || 0), 0) / rs.filter(r => r[k] != null).length).toFixed(3);
	console.log(`\n${mode}: ${rs.length} builds · all-fire / best slot x${avg('kBest')} · / mean slot x${avg('kMean')} · factor for 1.6x best: ${avg('factor')}` +
		(mode === 'normal' ? ` · fused build / best slot x${avg('kFused')}` : '') + (APPLY ? ` · SHIPPED x${avg('shipX')} of today's best slot` + (mode === 'normal' ? `, fused x${avg('fshipX')}` : '') : ''));
}
