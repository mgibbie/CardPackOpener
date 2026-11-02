// tools/micasurvivor/dive_sim.mjs — MicaSurvivor Dive: the difficulty bot (micasurvivor/js/expedition/dive.js).
// A bot plays real dives, hurt for real: it walks the floor to the stairs (a BFS on the world's tile masks, so opened plugs
// count), goes for the alpha / guardian when they seal the stairs, presses both specials whenever they are ready, dodges the
// red ground just before it lands, and answers every card / item screen with its first card. Math.random seeded per run.
// Per floor it records the seconds spent and the HP lost (in max HPs); per run, the floor it fell on (or the cap).
//   node tools/micasurvivor/dive_sim.mjs [--profiles=fresh,mid,max] [--dex=4] [--seeds=2] [--cap=40] [--route=forest] [--dt=0.0333]
//   --hpk= / --dmgk=  try a foe HP / damage multiplier on top of the shipped curve (G.ExpDive.K.HP_K / DMG_K)
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. One page at a time.)
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
const PROFILES = arg('profiles', 'fresh,mid,max').split(',');
const DEX = +arg('dex', 4), SEEDS = +arg('seeds', 2), CAP = +arg('cap', 40), ROUTE = arg('route', 'forest'), DT = +arg('dt', 1 / 30);
const HPK = arg('hpk', null) == null ? null : +arg('hpk', null), DMGK = arg('dmgk', null) == null ? null : +arg('dmgk', null);
const NOTELE = process.argv.includes('--notele');   // (no red ground: how much of the damage is it?)
const PORT = 8961;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// the shop upgrades of each profile (G.Upgrades: fresh = none, mid = about half, max = the D0a golden profile)
const UPG = {
	fresh: {},
	mid: { hp: 5, atk: 5, def: 4, regen: 2, cd: 4, spd: 4, magnet: 3, xp: 4, coins: 4, crit: 5, size: 3, moves: 1, revive: 1, reroll: 2 },
	max: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5 },
};
const saveOf = prof => ({
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' }, [DEX]: { at: 1, from: 'gacha' } },
	shiny: {}, partner: DEX, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { [DEX]: UPG[prof] || {} },
});

const BEFORE = (save, dex) => {
	const H = window.__s = { frozen: false, pending: null };
	let a = 1;
	H.reseed = s => { a = s >>> 0; };
	Math.random = function random() { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	try {
		localStorage.setItem('micasurvivor_dev', 'ddivesim1');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
		localStorage.setItem('micasurvivorexp_pick', String(dex));
	} catch (e) { /* the boot wait reports it */ }
	const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
	H.tap = code => { key('keydown', code); key('keyup', code); };

	/** the bot: plays the started dive to `cap` floors (or its fall). -> {floor, t, floors: [[secs, hpLost], ...], why} */
	H.dive = (cap, dt) => {
		H.freeze();
		const pl = G.Game.player, D = G.ExpDive, TS = G.World.TS;
		let ax = 0, ay = 0;
		G.Input.axis = () => [ax, ay];
		const floors = [];
		let fl = D.run.floor, ft = G.Game.st.time, lost = 0, hp0 = pl.hp, why = '', dist = null, distKey = '', blocked = 0;
		const tileOf = (x, y) => [Math.floor(x / TS), Math.floor(y / TS)];
		/** a BFS distance map to the tile (tx, ty) over the world's walkable tiles (the current zone's box) */
		function distTo(tx, ty) {
			const z = G.World.zone, w = z.w, h = z.h, d = new Int32Array(w * h).fill(-1), q = [];
			const id = (x, y) => (y - z.y0) * w + (x - z.x0);
			const walk = (x, y) => x >= z.x0 && y >= z.y0 && x < z.x0 + w && y < z.y0 + h && G.World.maskAt(x, y) > 0 && !(z.deep && z.deep(x, y));
			if (!walk(tx, ty)) return null;
			d[id(tx, ty)] = 0; q.push([tx, ty]);
			for (let k = 0; k < q.length; k++) {
				const [x, y] = q[k];
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nx = x + dx, ny = y + dy;
					if (!walk(nx, ny) || d[id(nx, ny)] >= 0) continue;
					d[id(nx, ny)] = d[id(x, y)] + 1; q.push([nx, ny]);
				}
			}
			return { d, id, walk };
		}
		for (let f = 0; f < cap * 6000; f++) {
			const st = G.Game.state;
			if (st === 'over') { why = 'fell'; break; }
			if (st !== 'playing') {
				ax = ay = 0;
				if (st !== 'held') {
					if (G.ExpEco && G.ExpEco.pick) { if (G.ExpEco.pick.kind === 'shop') G.ExpEco.closePick(); else { G.ExpEco.pick.at = -1e9; G.ExpEco.choose(0); } }   // (the shop: just leave)
					else H.tap('Digit1');
				}
				if (++blocked > 600) { H.tap('Escape'); if (blocked > 1800) { why = 'stuck on a screen: ' + st + ' ' + [...document.querySelectorAll('.scr:not(.hidden), .modal:not(.hidden)')].map(e => e.id).join(','); break; } }
				G.Game.debugStep(1, dt);
				continue;
			}
			blocked = 0;
			const S = D.run;
			if (!S) { why = 'no run'; break; }
			if (S.floor !== fl) {
				floors.push([+(G.Game.st.time - ft).toFixed(1), +(lost).toFixed(2)]);
				fl = S.floor; ft = G.Game.st.time; lost = 0; dist = null; distKey = '';
				if (fl > cap) { why = 'cap'; break; }
			}
			if (G.Game.st.time - ft > 300) { why = 'stuck on floor ' + fl; break; }
			// the target: the alpha / guardian while it seals the stairs, else the stairs
			const L = G.World.zone.dive;
			let tx, ty;
			if (S.sealed && S.boss && !S.boss.dead) [tx, ty] = tileOf(S.boss.x, S.boss.y);
			else { tx = L.stairs[0] + G.World.zone.x0; ty = L.stairs[1] + G.World.zone.y0; }
			const k2 = tx + ',' + ty;
			if (!dist || (k2 !== distKey && f % 15 === 0)) { const dd = distTo(tx, ty); if (dd) { dist = dd; distKey = k2; } }
			ax = ay = 0;
			if (dist) {
				const [px, py] = tileOf(pl.x, pl.y);
				let best = null, bv = dist.walk(px, py) ? dist.d[dist.id(px, py)] : 1e9;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
					const nx = px + dx, ny = py + dy;
					if (!dist.walk(nx, ny) || (dx && dy && (!dist.walk(px + dx, py) || !dist.walk(px, py + dy)))) continue;
					const v = dist.d[dist.id(nx, ny)];
					if (v >= 0 && v < bv) { bv = v; best = [nx, ny]; }
				}
				// near the boss: hold a little distance (the moves do the work)
				const nearBoss = S.sealed && S.boss && !S.boss.dead && G.U.dist(pl.x, pl.y, S.boss.x, S.boss.y) < 3 * TS;
				if (best && !nearBoss) { const gx = (best[0] + 0.5) * TS - pl.x, gy = (best[1] + 0.5) * TS - pl.y, n = Math.hypot(gx, gy) || 1; ax = gx / n; ay = gy / n; }
			}
			// the specials whenever they're up; the dodge out of red ground about to land
			D.press(1, pl); D.press(2, pl);
			if (G.ExpUlt && G.ExpUlt.run && G.ExpUlt.run.c >= 1 && !G.ExpUlt.run.cast && G.EnemyMgr.all().some(e => !e.dead && G.U.dist2(e.x, e.y, pl.x, pl.y) < 300 * 300)) G.ExpUlt.press();   // (the Ultimate when full, a foe near)
			for (const t of S.tg || []) {
				if (t.k === 'dash' || t.t < t.T - 0.3 || pl.slideCd > 0) continue;
				const inside = t.k === 'slam' ? G.U.dist2(pl.x, pl.y, t.x, t.y) < t.r * t.r : (() => { const c = Math.cos(t.a), s = Math.sin(t.a), rx = pl.x - t.x, ry = pl.y - t.y, u = rx * c + ry * s, v = -rx * s + ry * c; return u > 0 && u < t.len && Math.abs(v) < t.w / 2 + 10; })();
				if (inside) { const ex = pl.x - t.x, ey = pl.y - t.y, n = Math.hypot(ex, ey) || 1; ax = ex / n; ay = ey / n; G.ExpVerbs.press('slide'); break; }
			}
			const h0 = pl.hp;
			G.Game.debugStep(1, dt);
			if (pl.hp < h0) lost += (h0 - pl.hp) / pl.maxHp;
		}
		if (!why) why = 'frames';
		return { floor: D.run ? D.run.floor : fl, t: Math.round(G.Game.st.time), floors, why, level: pl.level, revives: (pl.revives | 0) };
	};
};

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
let browser;
const rows = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 3600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	for (const prof of PROFILES) for (let seed = 1; seed <= SEEDS; seed++) {
		const t0 = Date.now();
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, saveOf(prof), DEX);
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await page.evaluate(() => { const el = document.getElementById('tap-start'); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; })) await page.click('#tap-start');
		await waitFor(() => page.evaluate(() => { const el = document.getElementById('scr-menu'); return !!el && !el.classList.contains('hidden'); }), 15000);
		const r = await page.evaluate(async (seed, route, cap, dt, hpk, dmgk, notele) => {
			G.Audio.sfx = () => {}; G.Audio.music = () => {};
			window.__s.reseed(seed * 7919);
			const ok = await G.Expedition.load().catch(e => String(e));
			if (ok !== true) return { error: String(ok) };
			await G.ExpSave.open();
			if (hpk != null) G.ExpDive.K.HP_K *= hpk;
			if (dmgk != null) G.ExpDive.K.DMG_K *= dmgk;
			if (notele) { const T = G.ExpDive.TELE; T.CD = [1e9, 1e9]; T.ALPHA_CD = [1e9, 1e9]; T.GUARD_CD = [1e9, 1e9]; T.REACH = 0; T.chargeLen = 0; }
			G.Expedition.diveRoute(route); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive');
			return window.__s.dive(cap, dt);
		}, seed, ROUTE, CAP, DT, HPK, DMGK, NOTELE);
		await ctx.close();
		r.prof = prof; r.seed = seed; r.wall = Math.round((Date.now() - t0) / 1000);
		rows.push(r);
		const by5 = [];
		for (let i = 0; i < (r.floors || []).length; i += 5) { const s = r.floors.slice(i, i + 5); by5.push(`${i + 1}-${i + s.length}: ${Math.round(s.reduce((a, x) => a + x[0], 0) / s.length)}s ${(s.reduce((a, x) => a + x[1], 0) / s.length).toFixed(2)}hp`); }
		console.log(`${prof} seed ${seed}: floor ${r.floor} (${r.why}) in ${r.t}s, Lv ${r.level}, wall ${r.wall}s${r.error ? ' ERROR ' + r.error : ''}\n   ${by5.join(' | ')}`);
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
const sum = {};
for (const r of rows) { const s = sum[r.prof] = sum[r.prof] || { n: 0, floor: 0, fell: 0 }; s.n++; s.floor += r.floor; if (r.why === 'fell') s.fell++; }
for (const [p, s] of Object.entries(sum)) console.log(`${p}: average floor ${(s.floor / s.n).toFixed(1)}, fell ${s.fell}/${s.n}`);
