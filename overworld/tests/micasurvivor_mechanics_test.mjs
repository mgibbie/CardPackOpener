// micasurvivor_mechanics_test.mjs — MicaSurvivor M5 batch 1 ("Foundation"): the mechanics ported
// from the Godot Android port by JayElDragon (poke-survivor: main.gd, moves_data.gd, progress.gd),
// driven headlessly in a real run (window.G is global; the run is paused and stepped by hand):
//   - lifetime kills per enemy type (stats.tk_<type>): counted on a real kill, saved, back after a
//     reload, and the save merge keeps the max of each key (never loses progress)
//   - enemy status effects: freeze 1.8 s, paralysis 3 s, sleep 4 s, confusion 3 s; bosses get
//     35 % (freeze/sleep) / 50 % (para/conf) and then 4 s immunity; frozen/asleep don't move or
//     touch you, frozen takes +25 %; sleeping takes +30 % and wakes when hit (not by sleep moves);
//     paralysed move at 40 % and take +35 % electric damage; confused wander into other enemies
//     and hit them (1.8 x dmg + 3 % of the target's max HP) instead of you; Darkrai never sleeps;
//     the moves marked `cc`/`ccp` in the port carry them (and roll them on a hit)
//   - Hypnosis puts nearby enemies to sleep; Dream Eater hits only sleeping ones and heals you
//   - the 9 alternative evolutions (EVO_ALT): both evolution cards offered together, the player
//     picks one in the real level-up screen; the Big Orb hook; EVO_EXTRA tweaks
//   - knockback by move level (KNOCK_LV): 0 at Lv1, grows 50 % per level, x1.5 evolved
//   - the "Calibre" level-up stat card: +12 % size of projectiles / orbs / areas, max 6
//   - the new strings have English (lang-en.js)
// Screenshots (status indicators, the evolution choice, the Calibre card) go to
// MICASURVIVOR_SHOTS=<dir> when set.
// Covers micasurvivor/js/systems/status.js, systems/combat.js, systems/levelup.js,
// systems/progress.js, entities/enemy.js, entities/player.js, entities/vfx.js, data/moves.js,
// data/lang-en.js, ui/icons.js, core/db.js (merge), css/style.css, index.html.
//   node overworld/tests/micasurvivor_mechanics_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8827;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); } };
	const E = (fn, ...a) => page.evaluate(fn, ...a);

	// ---------- boot -> guest -> test -> menu -> run
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'boots', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-login'), 10000);
	await page.click('#btn-guest');
	await waitFor(() => visible('scr-test'), 8000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'run starts');
	await sleep(500);

	// pause the run: from here the test steps the world by hand
	await E(() => {
		G.Game.togglePause(); G.UI.hide('scr-pause');
		const pl = G.Game.player; pl.invuln = 1e9;
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		// helpers
		window.T = {
			mk(dex, dx, dy, o = {}) {
				const pl = G.Game.player;
				const def = { dex, name: 'T' + dex, hp: o.hp || 1000, spd: o.spd || 40, dmg: o.dmg || 10, xp: 1, behavior: o.behavior || 'chaser' };
				const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
				e.flying = true;    // straight lines, no walls / pathing in the way
				G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
				return e;
			},
			reset() { G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.rebuildGrid(); },
			only(id, lvl = 1) {
				const pl = G.Game.player;
				G.Projectiles.clearOrbs(pl);
				const m = G.Moves.instance(id, lvl);
				pl.moves = [m]; pl.slots = [[m]]; pl.active = 0; pl.statsTaken = {};
				return m;
			},
			withRandom(v, fn) { const R = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = R; } },
		};
	});
	A(await E(() => G.Game.state) === 'paused', 'run paused for stepping');

	// ================= 1. kills per type =================
	{
		const r = await E(() => {
			T.reset();
			const before = Object.assign({}, G.DB.save.stats);
			const e = T.mk(6, 200, 0);           // Charizard: fire / flying
			e.hurt(1e9);
			G.EnemyMgr.update(0, [G.Game.player]);   // the manager counts the fallen
			const after = G.DB.save.stats;
			const r = { fire: (after.tk_fire || 0) - (before.tk_fire || 0), flying: (after.tk_flying || 0) - (before.tk_flying || 0),
				water: (after.tk_water || 0) - (before.tk_water || 0), api: G.Progress.typeKills('fire') === after.tk_fire, types: e.types };
			const e2 = T.mk(7, 200, 0); e2.hurt(1e9); G.EnemyMgr.update(0, [G.Game.player]);   // Squirtle: water
			r.water2 = (G.DB.save.stats.tk_water || 0) - (before.tk_water || 0);
			G.DB.commit(true);
			const disk = JSON.parse(localStorage.getItem('micasurvivor_save.guest'));
			r.disk = { fire: disk.stats.tk_fire, flying: disk.stats.tk_flying, water: disk.stats.tk_water };
			r.mem = { fire: G.DB.save.stats.tk_fire, flying: G.DB.save.stats.tk_flying, water: G.DB.save.stats.tk_water };
			return r;
		});
		A(r.fire === 1 && r.flying === 1 && r.water === 0 && r.api, 'a Charizard kill counts +1 fire and +1 flying (stats.tk_<type>), nothing else', JSON.stringify(r));
		A(r.water2 === 1, 'a Squirtle kill counts +1 water');
		A(r.disk.fire === r.mem.fire && r.disk.flying === r.mem.flying && r.disk.water === r.mem.water && r.disk.fire >= 1, 'the per-type counters are written to the save', JSON.stringify(r));
		const m = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;               // a is newer
			a.stats.tk_fire = 5; a.stats.tk_water = 1; delete a.stats.tk_ice;
			b.stats.tk_fire = 9; b.stats.tk_ice = 3; delete b.stats.tk_water;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			const c = base(); c.updated = 3000; delete c.stats;   // a newer save with no stats block at all
			const d = base(); d.updated = 1; d.stats.tk_ghost = 4;
			let r3 = null, err = null;
			try { r3 = G.DB.merge(c, d); } catch (e) { err = e.message; }
			return { r1: [r1.stats.tk_fire, r1.stats.tk_water, r1.stats.tk_ice], r2: [r2.stats.tk_fire, r2.stats.tk_water, r2.stats.tk_ice], r3: r3 && r3.stats.tk_ghost, err };
		});
		A(JSON.stringify(m.r1) === '[9,1,3]' && JSON.stringify(m.r2) === '[9,1,3]', 'save merge keeps the max of every tk_<type> from both sides, either order', JSON.stringify(m));
		A(m.r3 === 4 && !m.err, 'merge keeps the counters even when the newer save has no stats block', JSON.stringify(m));
	}

	// ================= 2. status effects =================
	{
		const r = await E(() => {
			T.reset();
			const out = {};
			for (const k of ['freeze', 'para', 'sleep', 'conf']) {
				const e = T.mk(19, 300, 0);
				const d = G.Status.apply(e, k);
				out[k] = { d, field: { freeze: e.frozenT, para: e.paraT, sleep: e.sleepT, conf: e.confT }[k], imm: e.ccImm };
				G.Status.tick(e, 0.5);
				out[k].after = { freeze: e.frozenT, para: e.paraT, sleep: e.sleepT, conf: e.confT }[k];
			}
			return out;
		});
		const want = { freeze: 1.8, para: 3, sleep: 4, conf: 3 };
		for (const k in want) A(near(r[k].d, want[k]) && near(r[k].field, want[k]) && near(r[k].after, want[k] - 0.5) && r[k].imm === 0, `${k}: ${want[k]} s on a normal enemy, ticks down, no immunity`, JSON.stringify(r[k]));

		const b = await E(() => {
			T.reset();
			const out = {};
			for (const k of ['freeze', 'para', 'sleep', 'conf']) {
				const e = T.mk(150, 300, 0, { boss: true });
				const d = G.Status.apply(e, k);
				const imm = e.ccImm;
				const again = G.Status.apply(e, k === 'freeze' ? 'sleep' : 'freeze');   // during the immunity
				G.Status.tick(e, imm - 0.05);
				const stillImm = G.Status.apply(e, 'para');
				G.Status.tick(e, 0.1);
				const after = G.Status.apply(e, 'para');
				out[k] = { d, imm, again, stillImm, after };
			}
			return out;
		});
		const bw = { freeze: 1.8 * 0.35, para: 3 * 0.5, sleep: 4 * 0.35, conf: 3 * 0.5 };
		for (const k in bw) A(near(b[k].d, bw[k]) && near(b[k].imm, bw[k] + 4) && b[k].again === 0 && b[k].stillImm === 0 && near(b[k].after, 1.5),
			`boss ${k}: ${bw[k].toFixed(2)} s (${k === 'freeze' || k === 'sleep' ? '35' : '50'}%), then immune for 4 s more, affected again after`, JSON.stringify(b[k]));

		const f = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const a = T.mk(19, 300, 0), n = T.mk(19, 300, 60);
			G.Status.apply(a, 'freeze');
			const ax = a.x, ay = a.y, nx = n.x;
			for (let i = 0; i < 20; i++) { a.update(0.05, pl); n.update(0.05, pl); }
			const moved = Math.hypot(a.x - ax, a.y - ay), nmoved = Math.abs(n.x - nx);
			const h0 = a.hp; a.hurt(100); const hitF = h0 - a.hp;
			const h1 = n.hp; n.hurt(100); const hitN = h1 - n.hp;
			// frozen ones can't be confused / paralysed; freezing clears sleep
			const conf = G.Status.apply(a, 'conf'), para = G.Status.apply(a, 'para');
			const s = T.mk(19, 300, -60); G.Status.apply(s, 'sleep'); G.Status.apply(s, 'freeze');
			return { moved, nmoved, hitF, hitN, conf, para, sleepCleared: s.sleepT === 0 && s.frozenT > 0 };
		});
		A(f.moved < 0.01 && f.nmoved > 30, 'a frozen enemy does not move (a normal one walks)', JSON.stringify(f));
		A(f.hitF === 125 && f.hitN === 100, 'a frozen enemy takes +25% damage (125 vs 100)', JSON.stringify(f));
		A(f.conf === 0 && f.para === 0 && f.sleepCleared, 'frozen blocks confusion/paralysis; freezing clears sleep');

		const c = await E(() => {
			T.reset();
			const pl = G.Game.player;
			G.Projectiles.clear();
			const fz = T.mk(19, 0, 0), sl = T.mk(19, 0, 0), cf = T.mk(19, 0, 0), ctl = T.mk(19, 0, 0);
			G.Status.apply(fz, 'freeze'); G.Status.apply(sl, 'sleep'); G.Status.apply(cf, 'conf');
			G.EnemyMgr.rebuildGrid();
			G.Combat.resolve(0.016, pl, 0);
			return { fz: fz.touchCd, sl: sl.touchCd, cf: cf.touchCd, ctl: ctl.touchCd };
		});
		A(c.fz === 0 && c.sl === 0 && c.cf === 0 && near(c.ctl, 0.55), 'frozen, asleep and confused enemies standing on you do not attack you (a normal one does)', JSON.stringify(c));

		const s = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const a = T.mk(19, 300, 0), n = T.mk(19, 300, 60);
			G.Status.apply(a, 'sleep');
			const ax = a.x;
			for (let i = 0; i < 20; i++) a.update(0.05, pl);
			const moved = Math.abs(a.x - ax);
			const h0 = a.hp; const d = G.Combat.land(a, 100, '#fff', 0, 0, 0, { mtype: 'normal' }, false); const hitS = h0 - a.hp;
			const h1 = n.hp; G.Combat.land(n, 100, '#fff', 0, 0, 0, { mtype: 'normal' }, false); const hitN = h1 - n.hp;
			const woke = a.sleepT === 0;
			// a sleep move's hit neither gets the bonus nor wakes it
			const b = T.mk(19, 300, -60); G.Status.apply(b, 'sleep');
			const h2 = b.hp; G.Combat.land(b, 100, '#fff', 0, 0, 0, { mtype: 'normal', cc: 'sleep', ccp: 0 }, false);
			return { moved, hitS, hitN, woke, hitSleepMove: h2 - b.hp, stillAsleep: b.sleepT > 0 };
		});
		A(s.moved < 0.01, 'a sleeping enemy does not move');
		A(s.hitN > 0 && Math.abs(s.hitS / s.hitN - 1.3) < 0.02 && s.woke, `a sleeping enemy takes +30% (${s.hitS} vs ${s.hitN}) and wakes up`, JSON.stringify(s));
		A(s.hitSleepMove === s.hitN && s.stillAsleep, 'a hit from a sleep move (Hypnosis, Dream Eater...) gets no bonus and does not wake it', JSON.stringify(s));

		const p = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const a = T.mk(19, 400, 0), n = T.mk(19, 400, 80);
			G.Status.apply(a, 'para');
			const ax = a.x, nx = n.x, ay0 = a.y, ny0 = n.y;
			for (let i = 0; i < 10; i++) { a.update(0.05, pl); n.update(0.05, pl); }
			const ma = Math.hypot(a.x - ax, a.y - ay0), mn = Math.hypot(n.x - nx, n.y - ny0);
			const h0 = a.hp; G.Combat.land(a, 100, '#fff', 0, 0, 0, { mtype: 'electric' }, false); const ea = h0 - a.hp;
			const h1 = n.hp; G.Combat.land(n, 100, '#fff', 0, 0, 0, { mtype: 'electric' }, false); const en = h1 - n.hp;
			const h2 = a.hp; G.Combat.land(a, 100, '#fff', 0, 0, 0, { mtype: 'water' }, false); const wa = h2 - a.hp;
			const h3 = n.hp; G.Combat.land(n, 100, '#fff', 0, 0, 0, { mtype: 'water' }, false); const wn = h3 - n.hp;
			// paralysed: attacks 2.5x slower (touch cooldown ticks at 40%)
			a.touchCd = 0.55; n.touchCd = 0.55; a.update(0.1, pl); n.update(0.1, pl);
			return { ratio: ma / mn, ea, en, wa, wn, cdA: a.touchCd, cdN: n.touchCd };
		});
		A(Math.abs(p.ratio - 0.4) < 0.02, `a paralysed enemy moves at 40% speed (${p.ratio.toFixed(3)})`, JSON.stringify(p));
		A(Math.abs(p.ea / p.en - 1.35) < 0.02 && p.wa === p.wn, `a paralysed enemy takes +35% electric damage (${p.ea} vs ${p.en}), other types unchanged`, JSON.stringify(p));
		A(near(p.cdA, 0.55 - 0.04, 1e-9) && near(p.cdN, 0.45, 1e-9), 'a paralysed enemy attacks 2.5x slower', JSON.stringify(p));

		const cf = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const a = T.mk(19, 400, 0, { dmg: 10 }), t = T.mk(19, 400, 0, { hp: 1000 });
			t.x = a.x + a.r + t.r; G.EnemyMgr.rebuildGrid();
			G.Status.apply(a, 'conf'); G.Status.apply(t, 'sleep');
			const h0 = t.hp;
			a.update(0.016, pl);
			const hit = h0 - t.hp;
			// it wanders toward another enemy, not toward you
			T.reset();
			const w = T.mk(19, 300, 0), o = T.mk(19, 300, 200);
			G.Status.apply(w, 'conf');
			const d0 = Math.hypot(o.x - w.x, o.y - w.y);
			for (let i = 0; i < 20; i++) { G.EnemyMgr.rebuildGrid(); w.update(0.05, pl); }
			const d1 = Math.hypot(o.x - w.x, o.y - w.y);
			return { hit, want: Math.round(10 * 1.8 + 1000 * 0.03), woke: t.sleepT === 0, d0, d1 };
		});
		A(cf.hit === cf.want, `a confused enemy hits another enemy for 1.8 x dmg + 3% of its max HP (${cf.hit})`, JSON.stringify(cf));
		A(cf.woke, 'the hit wakes a sleeping target');
		A(cf.d1 < cf.d0 - 20, 'a confused enemy walks toward another enemy (infighting)', JSON.stringify(cf));

		const dk = await E(() => {
			T.reset();
			const e = T.mk(491, 300, 0);
			const s = G.Status.apply(e, 'sleep');
			const f = G.Status.apply(e, 'freeze');
			return { s, asleep: e.sleepT, f };
		});
		A(dk.s === 0 && dk.asleep === 0 && near(dk.f, 1.8), 'Darkrai (491) cannot be put to sleep (but can be frozen)', JSON.stringify(dk));

		const mv = await E(() => {
			const want = { 'giga-drain': ['sleep', 0.06], 'thunder-shock': ['para', 0.18], 'discharge': ['para', 0.07], 'thunderbolt': ['para', 0.15],
				'confusion': ['conf', 0.14], 'psybeam': ['conf', 0.12], 'psychic': ['conf', 0.10], 'hypnosis': ['sleep', 0.3], 'dream-eater': ['sleep', 0],
				'ice-beam': ['freeze', 0.15], 'powder-snow': ['freeze', 0.07], 'lick': ['para', 0.2], 'night-shade': ['sleep', 0.08], 'hail': ['freeze', 0.12] };
			const bad = Object.entries(want).filter(([id, [cc, p]]) => { const m = G.Moves.BY_ID[id]; return !m || m.cc !== cc || m.ccp !== p; }).map(([id]) => id);
			const extra = G.Moves.ALL.filter(m => m.cc && !want[m.id]).map(m => m.id);
			// the roll: a hit applies the move's status with probability ccp
			T.reset();
			const e = T.mk(19, 300, 0);
			T.withRandom(0.99, () => G.Combat.land(e, 1, '#fff', 0, 0, 0, G.Moves.instance('ice-beam', 1), false));
			const missed = e.frozenT === 0;
			T.withRandom(0.1, () => G.Combat.land(e, 1, '#fff', 0, 0, 0, G.Moves.instance('ice-beam', 1), false));
			return { bad, extra, missed, frozen: e.frozenT, suffix: G.Status.suffix(G.Moves.BY_ID['ice-beam']) };
		});
		A(mv.bad.length === 0 && mv.extra.length === 0, 'the 14 moves the port marks with cc/ccp carry them (same chances)', JSON.stringify(mv));
		A(mv.missed && near(mv.frozen, 1.8), 'a hit rolls the status: Ice Beam (15%) misses at 0.99, freezes at 0.10', JSON.stringify(mv));
		A(mv.suffix === 'Puede congelar (15%).', 'the new-move card says the status chance', mv.suffix);

		// a real projectile through the game's collision code (Thunder Shock, 18% paralysis)
		const pr = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const m = T.only('thunder-shock', 1);
			const e = T.mk(19, 50, 0); pl.target = e; pl.aim = 0;
			m.t = 0;
			return T.withRandom(0.01, () => {
				G.Combat.tick(0.1, pl, 0);
				for (let i = 0; i < 10 && !(e.paraT > 0); i++) { G.Projectiles.update(0.02, pl, G.EnemyMgr.all()); G.EnemyMgr.rebuildGrid(); G.Combat.resolve(0.02, pl, i); }
				return { para: e.paraT, hurt: e.maxHp - e.hp };
			});
		});
		A(near(pr.para, 3) && pr.hurt > 0, 'a Thunder Shock projectile hit paralyses through the real collision code', JSON.stringify(pr));

		// screenshot: the four indicators
		await E(() => {
			T.reset(); G.FX.clear();
			const pl = G.Game.player;
			T.only('tackle', 1).t = 1e9;
			const L = [['freeze', -70, -20, 7], ['sleep', 70, -20, 25], ['para', -70, 50, 133], ['conf', 70, 50, 39]];
			for (const [k, dx, dy, dex] of L) { const e = T.mk(dex, dx, dy); G.Status.apply(e, k); e.ccImm = 0; e.frozenT = e.frozenT && 99; e.sleepT = e.sleepT && 99; e.paraT = e.paraT && 99; e.confT = e.confT && 99; }
		});
		await sleep(1500);
		const clip = await E(() => { const pl = G.Game.player, C = G.Camera, k = C.scale; const x = (pl.x - C.left()) * k, y = (pl.y - C.top()) * k; return { x: Math.max(0, x - 260), y: Math.max(0, y - 190), width: 520, height: 330 }; });
		await shot('status_indicators.png', clip);
		await shot('status_indicators_full.png');
	}

	// ================= 3. Hypnosis + Dream Eater =================
	{
		const h = await E(() => {
			T.reset();
			const pl = G.Game.player;
			T.only('hypnosis', 1);
			const es = [T.mk(19, 60, 0), T.mk(19, -60, 30), T.mk(19, 0, 90)];
			const far = T.mk(19, 260, 0);
			const dark = T.mk(491, 40, -40);
			T.withRandom(0, () => G.Combat.tick(2, pl, 0));
			return { asleep: es.map(e => e.sleepT), far: far.sleepT, dark: dark.sleepT, hit: es.map(e => e.maxHp - e.hp) };
		});
		A(h.asleep.every(s => near(s, 4)) && h.hit.every(d => d > 0), 'Hypnosis: enemies within its 120 radius fall asleep for 4 s (and take its 5 dmg)', JSON.stringify(h));
		A(h.far === 0 && h.dark === 0, 'Hypnosis: nothing outside the radius; Darkrai stays awake', JSON.stringify(h));

		const d = await E(() => {
			T.reset();
			const pl = G.Game.player;
			const m = T.only('dream-eater', 1);
			const s1 = T.mk(19, 60, 0, { hp: 5000 }), s2 = T.mk(19, -80, 20, { hp: 5000 }), awake = T.mk(19, 0, 70, { hp: 5000 });
			G.Status.apply(s1, 'sleep'); G.Status.apply(s2, 'sleep');
			pl.hp = Math.round(pl.maxHp * 0.5);
			const hp0 = pl.hp;
			T.withRandom(0.5, () => G.Combat.tick(2, pl, 0));
			const k = G.Types.mult('psychic', s1.types) * G.Weather.mult('psychic');
			return { d1: s1.maxHp - s1.hp, d2: s2.maxHp - s2.hp, awake: awake.maxHp - awake.hp, want: Math.round(46 * pl.atk * k),
				healed: pl.hp - hp0, wantHeal: 2 * pl.maxHp * 0.012, still: s1.sleepT > 0 && s2.sleepT > 0, radius: m.radius };
		});
		A(d.awake === 0 && d.d1 === d.want && d.d2 === d.want, `Dream Eater hits only sleeping enemies (${d.d1} each), the awake one is untouched`, JSON.stringify(d));
		A(Math.abs(d.healed - d.wantHeal) < 1.01, `Dream Eater heals you 1.2% of max HP per sleeper hit (+${d.healed.toFixed(1)})`, JSON.stringify(d));
		A(d.still, 'Dream Eater does not wake its victims');
		const ic = await E(() => ['hypnosis', 'dream-eater'].map(id => /<img/.test(G.Icons.html('move:' + id, 32)) && G.Moves.POOL.psychic.includes(id)));
		A(ic.every(Boolean), 'Hypnosis and Dream Eater get their generated icons (psychic emblem + aura badge) and are in the psychic pool',
			JSON.stringify(await E(() => G.Moves.POOL.psychic)));
	}

	// ================= 4. alternative evolutions =================
	{
		const t = await E(() => {
			const pl = G.Game.player;
			T.reset();
			const out = {};
			// all 9 EVO_ALT entries from the port
			out.alt = Object.keys(G.Moves.EVO_ALT).sort();
			// gust maxed + Carrera (its normal evolution) + Calibre (its alternative): both cards, every time
			const g = T.only('gust', 5);
			pl.statsTaken = { spd: 1, size: 1 };
			let both = 0;
			for (let i = 0; i < 40; i++) { const o = G.LevelUp.offer(pl); if (o.some(c => c.key === 'evo:gust') && o.some(c => c.key === 'evo:gust:alt')) both++; }
			out.both = both;
			// only Carrera: the normal one + the Calibre card flagged as the missing evolution
			pl.statsTaken = { spd: 1 };
			const o2 = G.LevelUp.offer(pl);
			out.only = o2.filter(c => c.type === 'evo').map(c => c.key);
			// the stat a waiting evolution needs is always a candidate (weighted x2), flagged
			for (let i = 0; i < 100 && !out.calibre; i++) out.calibre = (G.LevelUp.offer(pl).find(c => c.key === 'stat:size') || {}).tag;
			// Big Orb route: fire-spin's alternative waits for the item (batch 3); a clean hook via hasItem
			const f = T.only('fire-spin', 5);
			pl.statsTaken = { rgn: 1 };
			out.noOrb = G.LevelUp.offer(pl).filter(c => c.type === 'evo').map(c => c.key);
			const item = pl.item; pl.item = 'bigorb';
			out.orb = G.LevelUp.offer(pl).filter(c => c.type === 'evo').map(c => c.key);
			out.orbSize = pl.sizeK();
			pl.item = item;
			// EVO_EXTRA (main.gd _evolve): confusion x1.6 on top of the projectile evolution; rock-throw knock 30
			const c = G.Moves.instance('confusion', 5), c0 = c.dmg; G.Moves.evolve(c);
			const r = G.Moves.instance('rock-throw', 5); G.Moves.evolve(r);
			out.extra = { conf: c.dmg / c0, rock: r.knock };
			T.only('gust', 5);
			pl.statsTaken = { spd: 1, size: 1 };
			return out;
		});
		A(JSON.stringify(t.alt) === JSON.stringify(['bulldoze', 'discharge', 'fire-spin', 'flame-wheel', 'flamethrower', 'gust', 'leaf-storm', 'razor-leaf', 'toxic']), 'the 9 alternative evolutions of the port', JSON.stringify(t.alt));
		A(t.both === 40, 'with both ready, both Gust evolution cards are offered together (40/40)', t.both);
		A(JSON.stringify(t.only) === '["evo:gust"]' && /Evoluciona/.test(t.calibre || ''), 'with only Sprint: the normal evolution + the Calibre card marked "Evolves Gust"', JSON.stringify(t));
		A(JSON.stringify(t.noOrb) === '["evo:fire-spin"]' && JSON.stringify(t.orb.sort()) === '["evo:fire-spin","evo:fire-spin:alt"]' && near(t.orbSize, 1.3), 'Big Orb hook: Fire Spin\'s alternative needs the item (hasItem("bigorb")), which also gives x1.3 size', JSON.stringify(t));
		A(near(t.extra.conf, 1.8 * 1.6) && t.extra.rock === 30, 'EVO_EXTRA: Confusion evolves x1.8 x1.6 damage; Rock Throw knock 30', JSON.stringify(t.extra));

		// the real level-up screen: pick the alternative
		const before = await E(() => { const m = G.Game.player.moves[0]; return { count: m.count, dmg: m.dmg, size: m.size, radius: m.radius, name: m.name }; });
		await E(() => { G.Game.togglePause(); G.Game.debugLevelUp(); });
		A(await waitFor(() => visible('scr-levelup'), 5000), 'the level-up screen opens');
		await sleep(500);
		const cards = await E(() => [...document.querySelectorAll('#cards .card')].map(c => c.innerText.replace(/\s+/g, ' ')));
		A(cards.some(c => /Gust → Hurricane/.test(c)) && cards.some(c => /Gust → Colossal Cyclone/.test(c) && /\+2 orbs, ×1\.5 damage/.test(c)), 'the cards show both evolutions in English', JSON.stringify(cards));
		await shot('evolution_choice.png');
		await E(() => { const i = [...document.querySelectorAll('#cards .card')].findIndex(c => /Colossal Cyclone/.test(c.innerText)); document.querySelectorAll('#cards .card')[i].click(); });
		await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
		const after = await E(() => { const m = G.Game.player.moves[0]; G.Game.togglePause(); G.UI.hide('scr-pause'); return { count: m.count, dmg: m.dmg, size: m.size, radius: m.radius, knock: m.knock, name: m.name, evolved: m.evolved, alt: m.evoAlt, evo: G.DB.save.evoMoves.gust > 0 }; });
		A(after.name === 'Ciclón Colosal' && after.evolved && after.alt && after.evo, 'picking it evolves Gust into Colossal Cyclone (and records the evolution)', JSON.stringify(after));
		A(after.count === before.count + 2 && near(after.dmg, before.dmg * 1.5) && near(after.size, before.size * 1.5) && near(after.radius, before.radius * 1.2) && after.knock === 320,
			'Colossal Cyclone: +2 orbs, x1.5 damage, x1.5 orb size, x1.2 ring, knock 320 (moves_data.gd EVO_ALT)', JSON.stringify({ before, after }));
		const gone = await E(() => G.LevelUp.offer(G.Game.player).filter(c => c.type === 'evo').length);
		A(gone === 0, 'no more evolution cards for it afterwards');
	}

	// ================= 5. knockback by move level =================
	{
		const k = await E(() => {
			const K = (id, lvl, evo) => { const m = G.Moves.instance(id, lvl); if (evo) G.Moves.evolve(m); return G.Moves.knockOf(m); };
			const out = { hv: [1, 2, 3, 4, 5].map(l => K('hyper-voice', l)), hvEvo: K('hyper-voice', 5, true), mm: [K('meteor-mash', 1), K('meteor-mash', 2)],
				bite: [1, 5].map(l => K('bite', l)), table: Object.keys(G.Moves.KNOCK_LV).length };
			// the real thing: a Hydro Pump beam pushes harder each level
			out.push = [1, 2, 4].map(lvl => {
				T.reset();
				const pl = G.Game.player;
				const m = T.only('hydro-pump', lvl); m.t = 0;
				const e = T.mk(19, 40, 0, { hp: 100000 });
				pl.target = e; pl.aim = 0;
				G.Combat.tick(0.1, pl, 0);
				return Math.round(e.kx);
			});
			return out;
		});
		A(JSON.stringify(k.hv) === '[0,260,390,520,650]' && k.hvEvo === 975, 'Hyper Voice knockback: 0 at Lv1, 260 at Lv2, +50% of it per level, x1.5 evolved', JSON.stringify(k));
		A(k.mm[0] === 0 && k.mm[1] === 170, 'Meteor Mash: no push at Lv1, table + its own push from Lv2 (90 + 80)', JSON.stringify(k.mm));
		A(k.bite[0] === k.bite[1] && k.table === 20, 'moves outside the table (the web\'s melee) keep their own knockback; 20 moves in KNOCK_LV', JSON.stringify(k));
		A(JSON.stringify(k.push) === '[0,180,360]', `a real Hydro Pump hit pushes 0 / 180 / 360 at Lv1 / 2 / 4`, JSON.stringify(k.push));
	}

	// ================= 6. Calibre =================
	{
		const c = await E(() => {
			const pl = G.Game.player;
			const out = {};
			const S = G.LevelUp.STATS.find(s => s.id === 'size');
			out.card = S && { title: S.title, max: S.max, icon: S.icon };
			const view = (id, lvl, size) => { pl.statsTaken = { size }; const m = G.Moves.instance(id, lvl); const v = G.Combat.eff(pl, m); return { m, v }; };
			const a = view('bug-buzz', 1, 3), o = view('fire-spin', 1, 3), p = view('ember', 1, 3), b = view('psybeam', 1, 3), z = view('ember', 1, 0);
			const k3 = Math.pow(1.12, 3);
			pl.statsTaken = { size: 3 }; out.k = pl.sizeK();
			out.ok = { aura: a.v.radius / a.m.radius, orbitR: o.v.radius / o.m.radius, orbS: o.v.size / o.m.size, proj: p.v.size / p.m.size, beamW: b.v.width / b.m.width, none: z.v === z.m };
			out.k3 = k3;
			// real: an aura reaches an enemy just outside its base radius once Calibre is taken
			const hitAt = size => {
				T.reset();
				const m = T.only('bug-buzz', 1); m.t = 0; pl.statsTaken = { size };
				const e = T.mk(19, 0, 0); e.x = pl.x + 66 + e.r + 12; G.EnemyMgr.rebuildGrid();
				G.Combat.tick(0.1, pl, 0);
				return e.maxHp - e.hp;
			};
			out.aura0 = hitAt(0); out.aura3 = hitAt(3);
			// real: an Ember projectile is spawned bigger
			T.reset();
			const em = T.only('ember', 1); em.t = 0; pl.statsTaken = { size: 3 };
			const e = T.mk(19, 80, 0); pl.target = e; pl.aim = 0;
			G.Combat.tick(0.1, pl, 0);
			const shotP = G.Projectiles.all().filter(q => q.friendly && !q.orb).pop();
			out.projR = shotP && shotP.r;
			// max 6: never offered once taken 6 times
			T.only('tackle', 1); pl.statsTaken = { size: 6 };
			let seen = 0; for (let i = 0; i < 60; i++) if (G.LevelUp.offer(pl).some(x => x.key === 'stat:size')) seen++;
			out.seenAt6 = seen;
			pl.statsTaken = { size: 0 };
			let seen0 = 0; for (let i = 0; i < 200; i++) if (G.LevelUp.offer(pl).some(x => x.key === 'stat:size')) seen0++;
			out.seenAt0 = seen0;
			// taking the card counts
			const card = { apply: null };
			for (let i = 0; i < 300 && !card.apply; i++) { const x = G.LevelUp.offer(pl).find(y => y.key === 'stat:size'); if (x) card.apply = x.apply; }
			pl.statsTaken = {};
			card.apply && card.apply(pl);
			out.afterTake = { n: pl.statsTaken.size, k: pl.sizeK() };
			return out;
		});
		A(c.card && c.card.title === 'Calibre' && c.card.max === 6 && c.card.icon === 'size', 'the "Calibre" level-up stat card exists (max 6, its own icon)', JSON.stringify(c.card));
		A(near(c.k, c.k3) && near(c.ok.aura, c.k3) && near(c.ok.proj, c.k3) && near(c.ok.beamW, c.k3) && near(c.ok.orbS, c.k3) && near(c.ok.orbitR, 1 + (c.k3 - 1) / 2) && c.ok.none,
			`Calibre x3 = x${c.k3.toFixed(3)}: areas, projectiles, beam width and orb size; orbit ring half as much; no Calibre, no change`, JSON.stringify(c.ok));
		A(c.aura0 === 0 && c.aura3 > 0, 'an aura reaches an enemy just outside its base radius with Calibre x3', JSON.stringify(c));
		A(near(c.projR, 7 * c.k3), `an Ember shot is spawned ${c.projR && c.projR.toFixed(2)} wide (7 x ${c.k3.toFixed(3)})`, c.projR);
		A(c.seenAt6 === 0 && c.seenAt0 > 0, `capped at 6 (offered ${c.seenAt0}/200 at 0, ${c.seenAt6}/60 at 6)`);
		A(c.afterTake.n === 1 && near(c.afterTake.k, 1.12), 'taking the card gives +12% size', JSON.stringify(c.afterTake));

		// screenshot: the Calibre card as the missing evolution of Gust
		await E(() => {
			const pl = G.Game.player; T.reset(); T.only('gust', 5); pl.statsTaken = { spd: 1 };
			let list = null;
			for (let i = 0; i < 200 && !list; i++) { const o = G.LevelUp.offer(pl); if (o.some(c => c.key === 'stat:size')) list = o; }
			G.RunUI.showLevelUp(pl.level, list, card => card.apply(pl));
		});
		await waitFor(() => visible('scr-levelup'), 5000);
		await sleep(500);
		const cards = await E(() => [...document.querySelectorAll('#cards .card')].map(c => c.innerText.replace(/\s+/g, ' ')));
		A(cards.some(c => /Caliber/.test(c) && /\+12% size for projectiles, orbs and areas\./.test(c) && /Evolves Gust/.test(c)), 'the Caliber card shows in English, flagged "Evolves Gust"', JSON.stringify(cards));
		await shot('calibre_card.png');
		await E(() => { const i = [...document.querySelectorAll('#cards .card')].findIndex(c => /Caliber/.test(c.innerText)); document.querySelectorAll('#cards .card')[i].click(); });
		await waitFor(async () => !(await visible('scr-levelup')), 3000);
		A(await E(() => G.Game.player.statsTaken.size === 1), 'picking the card in the level-up screen takes Calibre');
	}

	// ================= 7. English =================
	{
		const tr = await E(() => ['Hipnosis', 'Come Sueños', 'Ondas hipnóticas que pueden dormir a los enemigos cercanos.',
			'Devora los sueños: solo golpea a enemigos dormidos, con mucho daño, y te cura.', '¡Congelado!', '¡Paralizado!', '¡Dormido!', '¡Confundido!',
			'¡Despertó!', '¡Inmune!', 'Puede congelar (15%).', 'Puede paralizar (7%).', 'Puede dormir (30%).', 'Puede confundir (14%).', 'Calibre',
			'+12% de tamaño de proyectiles, orbes y áreas.', 'Esfera Colosal', ...Object.values(G.Moves.EVO_ALT).flatMap(a => [a[0], a[2]]),
			G.Moves.BY_ID.hex.desc].map(s => [s, G.I18n.t(s)]));
		const bad = tr.filter(([es, en]) => es === en || /[¡¿ñáéíóú]/i.test(en));
		A(bad.length === 0, `every new string has English (${tr.length})`, JSON.stringify(bad));
		A(tr.find(x => x[0] === 'Puede dormir (30%).')[1] === 'Can put to sleep (30%).', 'the chance suffix is a pattern (any %)');
	}

	// ================= 8. persistence through a reload =================
	{
		const before = await E(() => { G.DB.commit(true); return { fire: G.DB.save.stats.tk_fire, water: G.DB.save.stats.tk_water }; });
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000);
		await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
		await waitFor(() => visible('scr-menu'), 10000);
		const after = await E(() => ({ fire: G.DB.save.stats.tk_fire, water: G.DB.save.stats.tk_water }));
		A(after.fire === before.fire && after.water === before.water && after.fire >= 1, 'the per-type kill counters come back after a reload', JSON.stringify({ before, after }));
	}

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: exception ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
