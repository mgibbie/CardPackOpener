// micasurvivor_m3d_parity_test.mjs — MicaSurvivor 3D, P3 (Plans/MICASURVIVOR_3D_PLAN.md): "existing combat numbers
// reproduced on flat ground". The SAME fight is played twice in one page — by the 2D game's own combat code (a real
// run, paused, its subsystems stepped by hand in the game's own frame order) and by the 3D rules
// (micasurvivor/m3d/combat.js, on a flat room, reading the same G data) — and the numbers are compared:
//   * one move at a time against a target that stands still, 10 s at 60 ticks a second: the number of hits and the
//     damage dealt. A shot (Ember), a swing (Tackle: its shove pushes the target out of reach, the same on both
//     sides), a beam (Hydro Pump), an aura (Bug Buzz), a chain (Thunderbolt), a ring of shots (Heat Wave), orbs
//     (Fire Spin)
//   * the type chart and piercing: one Ember volley line through a Grass, a Water and a Fire target
//   * damage over time: Ember's burn and Poison Sting's poison tick for the same totals
//   * the kinds that lie on the ground or are placed at random: a boomerang, meteors, a trail, a turret, cones, mines
//     (where the 2D game rolls dice for a position or a speed the totals are compared within a margin), and a buff
//   * the control states, set by hand on both sides: asleep (+30 % and it wakes), frozen (+25 %, it stands still),
//     paralysed (40 % speed, slower to touch), confused (it hits its neighbour)
//   * enemy behaviours: a charger (aim, then through you at 3.4 × speed), a ranged enemy (walks into range, holds
//     its distance, backs off when you are close, shoots), a fan of shots, a beamer and a zoner (a mark on the ground
//     that goes off after a delay, through your moment of grace), a bomber (a fuse, and it takes itself with it)
//   * an enemy's touch: a chaser walks up and hits you — the same number of touches, the same HP lost, and it is
//     knocked back the same distance
// Lengths: the 2D game's unit is 1/16 m here (32 units = one 2 m cell).
//   node overworld/tests/micasurvivor_m3d_parity_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9671;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const E = (fn, ...a) => page.evaluate(fn, ...a);

	// ---------- the 2D game: boot -> guest -> a run, paused
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'the 2D game boots', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-login'), 10000);
	await page.click('#btn-guest');
	await waitFor(() => visible('scr-test'), 8000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	await waitFor(() => visible('scr-menu'), 10000);
	await page.click('#scr-menu [data-go=play]');
	await page.evaluate(() => { for (const s of ['[data-cat=survival]', '[data-var=normal]', '[data-players=solo]', '#mx-start']) document.querySelector('#scr-play ' + s).click(); });
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a run starts');
	await sleep(400);

	// ---------- both sides of the comparison, as helpers in the page
	const ready = await E(async () => {
		G.Game.togglePause(); G.UI.hide('scr-pause');
		const C = await import('/micasurvivor/m3d/combat.js'), S = await import('/micasurvivor/m3d/sim.js');
		const data = C.dataFrom(G), U = C.U;
		// a seeded Math.random for the 2D side (its shots' aim wobbles; nothing here turns on it)
		const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
		const DT = 1 / 60;
		/** The fight in the 2D game. sc: { moves: [[id, lvl]], foes: [{ dex, dx, dy, hp, spd, dmg, still }], secs, hurtable } */
		function play2d(sc) {
			const pl = G.Game.player, R = Math.random; Math.random = seeded(sc.seed || 12345);
			// flat, EMPTY ground: the run's map put rocks, grass and water round you at random, and they stop shots and
			// swallow hits. For the comparison the 2D world has nothing in it (put back afterwards).
			const Wd = G.World, keep = {}, bare = { projectileBlock: () => null, propsInCircle: () => [], isWall: () => false, isFree: () => true, isLiquid: () => false, nearestBreakable: () => null, collide: () => { } };
			for (const k in bare) if (typeof Wd[k] === 'function') { keep[k] = Wd[k]; Wd[k] = bare[k]; }
			try {
				G.EnemyMgr.clear(); G.Projectiles.clear(); G.Projectiles.clearOrbs(pl); G.Combat.clearFields(); G.Hazards.clear(); G.EnemyMgr.rebuildGrid();
				const ms = sc.moves.map(([id, lvl]) => G.Moves.instance(id, lvl || 1));
				pl.moves = ms; pl.slots = ms.map((m) => [m]); pl.active = 0; pl.statsTaken = {}; pl.dmgDealt = 0; pl.meleeT = 0;
				pl.hp = pl.maxHp; pl.invuln = sc.hurtable ? 0 : 1e9; pl.dead = false; pl.lastPatch = null;
				for (const k in pl.buffs) { pl.buffs[k].n = 0; pl.buffs[k].t = 0; }
				const atkK = pl.atk / pl.baseAtk;   // (the ability's factor, before any buff)
				if (sc.noProc) for (const m of ms) m.ccp = 0;   // (a state's dice are not the same dice on the two sides)
				let hits = 0, touches = 0, removed = 0, taken = 0;
				const foes = sc.foes.map((f) => {
					const def = { dex: f.dex, name: 'T' + f.dex, hp: f.hp || 1e6, spd: f.still ? 0 : f.spd || 56, dmg: f.dmg || 10, xp: 1, behavior: f.b || 'chase', ...(f.def || {}) };
					const e = new G.Enemy(def, pl.x + f.dx, pl.y + (f.dy || 0), { hp: 1, spd: 1, dmg: 1 }, false);
					e.flying = true;   // (straight lines: no walls or pathing between you)
					const hurt = e.hurt.bind(e); e.hurt = (...a) => { const h0 = e.hp; const r = hurt(...a); removed += h0 - e.hp; if (a[4] !== undefined || a.length > 2) hits++; return r; };
					if (f.shotCd !== undefined) e.shotCd = f.shotCd;
					G.EnemyMgr.add(e); if (f.state) G.Status.apply(e, f.state); return e;
				});
				G.EnemyMgr.rebuildGrid();
				const plHurt = pl.hurt.bind(pl); pl.hurt = (...a) => { const h0 = pl.hp, was = pl.invuln > 0; const r = plHurt(...a); touches++; taken += h0 - pl.hp; return r; };
				const x0 = pl.x, y0 = pl.y; let t = 0, far = 0, landed = 0, first = 0;
				const land = G.Combat.land; let count = 0;
				for (let i = 0, n = Math.round(sc.secs / DT); i < n; i++) {
					t += DT;
					// the frame, in game.js's order: you (timers + the auto-aim), enemies, your moves, shots, hits and touches
					pl.x = x0; pl.y = y0;
					if (pl.invuln > 0 && pl.invuln < 1e8) pl.invuln -= DT;
					if (pl.meleeT > 0) pl.meleeT -= DT;
					for (const k in pl.buffs) { const b = pl.buffs[k]; if (b.n > 0) { b.t -= DT; if (b.t <= 0) b.n = 0; } }   // (player.update's buff clocks)
					const tg = G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, 520);
					pl.target = tg; if (tg) pl.aim = Math.atan2(tg.y - pl.y, tg.x - pl.x);
					G.EnemyMgr.update(DT, [pl]); G.EnemyMgr.rebuildGrid();
					const d0 = pl.dmgDealt;
					G.Combat.tick(DT, pl, t);
					G.Projectiles.update(DT, pl, G.EnemyMgr.all());
					G.Combat.resolve(DT, pl, t);
					G.Combat.updateFields(DT);
					G.Hazards.update(DT);
					for (const e of foes) far = Math.max(far, Math.hypot(e.x - x0, e.y - y0));
					if (!first && taken > 0) first = t;
				}
				pl.hurt = plHurt;
				return { first, dealt: pl.dmgDealt, removed, taken, touches, hp: pl.hp, maxHp: pl.maxHp, far, foes: foes.map((e) => ({ hp: e.maxHp - e.hp, d: Math.hypot(e.x - x0, e.y - y0), dead: e.dead })),
					atkK, afDmg: pl.afDmg, dex: pl.mon.dex, crit: pl.critChance, r: pl.r, reduction: pl.reduction, takenK: G.Abilities.inK(pl, 'normal', null) };
			} finally { for (const k in keep) Wd[k] = keep[k]; Math.random = R; G.EnemyMgr.clear(); G.Projectiles.clear(); G.Projectiles.clearOrbs(G.Game.player); G.Combat.clearFields(); G.EnemyMgr.rebuildGrid(); G.Game.player.invuln = 1e9; }
		}
		/** The same fight by the 3D rules, on a flat room. `ref`: the 2D result (who you are, your ability's factors). */
		function play3d(sc, ref) {
			const room = S.makeRoom(80, 80, 0); room.spawn = [80, 0, 80];
			const w = C.newWorld(room, data, { dex: ref.dex, moves: sc.moves, seed: sc.seed ? sc.seed * 7 + 1 : 777, afDmg: ref.afDmg, atkK: ref.atkK, takenK: ref.takenK, crit: 0, orbitSquash: 0.7 });
			w.pl.baseReduce = ref.reduction; w.pl.invuln = sc.hurtable ? 0 : 1e9;
			if (sc.noProc) for (const m of w.pl.moves) m.ccp = 0;
			const foes = sc.foes.map((f) => {
				const e = C.addEnemy(w, f.dex, 80 + f.dx * U, 80 + (f.dy || 0) * U, { t: 0, ti: 0, behavior: f.b || 'chase' });   // (a target that stands still is an enemy with no speed: it still touches, as in 2D)
				if (f.def) Object.assign(e.def = { ...e.def }, f.def); if (f.shotCd !== undefined) e.shotCd = f.shotCd;
				e.maxHp = e.hp = f.hp || 1e6; e.dmg = f.dmg || 10; e.a.speed = (f.still ? 0 : f.spd || 56) * U;
				e.fly = false; e.a.fly = false; e.a.y = 0; e.a.grounded = true;   // (flat ground: everyone walks)
				if (f.state) C.applyState(w, e, f.state);
				return e;
			});
			let far = 0, first = 0;
			for (let i = 0, n = Math.round(sc.secs / DT); i < n; i++) { C.tick(w, null, DT); for (const e of foes) far = Math.max(far, Math.hypot(e.a.x - 80, e.a.z - 80) / U); if (!first && w.stats.taken > 0) first = w.t; }
			return { first, dealt: w.stats.dealt, removed: w.stats.removed, hits: w.stats.hits, taken: w.stats.taken, touches: w.stats.touched, hp: w.pl.hp, maxHp: w.pl.maxHp, far, r: w.pl.r / U,
				foes: foes.map((e) => ({ hp: e.maxHp - e.hp, d: Math.hypot(e.a.x - 80, e.a.z - 80) / U, dead: e.dead })) };
		}
		window.P = { both(sc) { const a = play2d(sc); return { a, b: play3d(sc, a) }; } };
		return { state: G.Game.state, unported: C.CK.UNPORTED };
	});
	A(ready.state === 'paused', 'the run is paused: both sides are stepped by hand, 60 ticks a second');

	const cmp = (r) => `2D ${r.a.removed} HP (${r.a.dealt.toFixed(1)} dealt) · 3D ${r.b.removed} HP (${r.b.dealt.toFixed(1)} dealt, ${r.b.hits} hits)`;
	const same = (a, b, tol) => Math.abs(a - b) <= tol;
	// ---------- one move at a time against a still target
	const ONE = [['ember', 120, 'a shot'], ['tackle', 50, 'a swing'], ['hydro-pump', 150, 'a beam'], ['bug-buzz', 60, 'an aura'], ['bulldoze', 70, 'an aura that slows'], ['thunderbolt', 150, 'a chain'], ['heat-wave', 100, 'a ring of shots'], ['fire-spin', 62, 'orbs'], ['water-gun', 200, 'another shot'], ['vine-whip', 70, 'another swing'], ['body-slam', 45, 'a swing with a big shove']];
	for (const [id, dist, what] of ONE) {
		const has = await E((id) => !!G.Moves.BY_ID[id], id);
		if (!has) { console.log(`     (no move "${id}" in the data: skipped)`); continue; }
		const r = await E((id, dist) => P.both({ moves: [[id, 1]], foes: [{ dex: 19, dx: dist, still: true }], secs: 10, noProc: true }), id, dist);
		const one = r.b.hits ? r.b.removed / r.b.hits : 1;   // one hit's worth
		A(r.a.removed > 0 && same(r.a.removed, r.b.removed, one * 1.01 + 2), `${id} (${what}), 10 s on a still Rattata ${dist} units away: ${cmp(r)}`, r);
	}
	// ---------- the other kinds: what lies on the ground, what comes back, what is placed at random
	const near = (a, b, pct, abs = 3) => Math.abs(a - b) <= Math.max(abs, Math.max(a, b) * pct);
	for (const [id, dist, what, pct, secs] of [['razor-leaf', 30, 'a boomerang: two leaves, out and back', 0.001, 10], ['bonemerang', 60, 'another boomerang', 0.001, 10], ['rock-slide', 150, 'meteors (the spare one lands at random)', 0.15, 10], ['flame-wheel', 20, 'a trail of patches, the target touching you', 0.001, 10], ['toxic', 36, 'a poisoning trail', 0.03, 10],
		['will-o-wisp', 150, 'a turret (placed at a random angle behind you)', 0.12, 10], ['flamethrower', 80, 'a cone (each shot\'s speed and life are random)', 0.2, 20], ['bubble-beam', 80, 'another cone', 0.2, 20]]) {
		const r = await E((id, dist, secs) => P.both({ moves: [[id, 1]], foes: [{ dex: 19, dx: dist, still: true, hp: 20000 }], secs, noProc: true }), id, dist, secs);
		A(r.a.removed > 0 && near(r.a.removed, r.b.removed, pct), `${id} (${what}), ${secs} s: ${cmp(r)}`, r);
	}
	{   // mines: two a cast, dropped at random round you; a target close enough to set most of them off
		// (where each mine lands is dice, and the dice differ: thirty runs a side, and the averages are compared)
		const rs = []; for (let seed = 1; seed <= 30; seed++) rs.push(await E((seed) => P.both({ moves: [['spikes', 1]], foes: [{ dex: 19, dx: 34, still: true, hp: 20000 }], secs: 30, seed }), seed));
		const avg = (k) => rs.reduce((s, r) => s + r[k].removed, 0) / rs.length, a2 = avg('a'), a3 = avg('b');
		console.log('     2D ' + rs.map(r => r.a.removed).join(' ') + ' · 3D ' + rs.map(r => r.b.removed).join(' '));
		A(a2 > 0 && near(a2, a3, 0.2), `spikes (mines dropped at random round you), 30 s, thirty runs a side: on average 2D ${a2.toFixed(0)} HP · 3D ${a3.toFixed(0)} HP`, rs.map(r => [r.a.removed, r.b.removed]));
	}
	{   // a buff: Swords Dance stacks under Ember
		const r = await E(() => P.both({ moves: [['swords-dance', 1], ['ember', 1]], foes: [{ dex: 19, dx: 120, still: true }], secs: 12 }));
		const plain = await E(() => P.both({ moves: [['ember', 1]], foes: [{ dex: 19, dx: 120, still: true }], secs: 12 }));
		A(near(r.a.dealt, r.b.dealt, 0.001, 0.5) && r.a.dealt > plain.a.dealt * 1.3, `Swords Dance under Ember, 12 s: ${cmp(r)} (without the buff: ${plain.a.dealt.toFixed(1)})`, r);
	}
	// ---------- the control states, applied by hand on both sides
	{
		const sl = await E(() => P.both({ moves: [['ember', 1]], foes: [{ dex: 1, dx: 120, still: true, state: 'sleep' }], secs: 3 }));
		const aw = await E(() => P.both({ moves: [['ember', 1]], foes: [{ dex: 1, dx: 120, still: true }], secs: 3 }));
		A(sl.a.removed === sl.b.removed && sl.a.removed > aw.a.removed, `asleep: the first hit does 30 % more and wakes it (3 s of Ember: ${cmp(sl)}; awake ${aw.a.removed})`, sl);
		const fr = await E(() => P.both({ moves: [['water-gun', 1]], foes: [{ dex: 19, dx: 120, still: true, state: 'freeze' }], secs: 3 }));
		const nf = await E(() => P.both({ moves: [['water-gun', 1]], foes: [{ dex: 19, dx: 120, still: true }], secs: 3 }));
		A(fr.a.removed === fr.b.removed && fr.a.removed > nf.a.removed, `frozen: 25 % more for 1.8 s (3 s of Water Gun: ${cmp(fr)}; not frozen ${nf.a.removed})`, fr);
		const st = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 150, spd: 56, dmg: 4, state: 'freeze' }], secs: 4, hurtable: true }));
		const pa = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 150, spd: 56, dmg: 4, state: 'para' }], secs: 9, hurtable: true }));
		const free = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 150, spd: 56, dmg: 4 }], secs: 9, hurtable: true }));
		A(st.a.touches === st.b.touches && Math.abs(st.a.foes[0].d - st.b.foes[0].d) < 1, `a frozen chaser stands still for 1.8 s, then comes (after 4 s: ${st.a.foes[0].d.toFixed(1)} / ${st.b.foes[0].d.toFixed(1)} units away, ${st.a.touches} / ${st.b.touches} touches)`, st);
		A(pa.a.touches === pa.b.touches && pa.a.touches < free.a.touches && Math.abs(pa.a.taken - pa.b.taken) < 0.02, `a paralysed chaser walks at 40 % for 3 s and touches less often (9 s: ${pa.a.touches} / ${pa.b.touches} touches; unparalysed ${free.a.touches})`, [pa, free]);
		const cf = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 150, spd: 56, dmg: 5, hp: 1000, state: 'conf' }, { dex: 1, dx: 190, still: true, hp: 1000 }], secs: 3 }));
		A(cf.a.foes[1].hp > 0 && cf.a.foes[1].hp === cf.b.foes[1].hp && cf.a.touches === 0 && cf.b.touches === 0, `a confused enemy turns on the one next to it instead of you (the other loses ${cf.a.foes[1].hp} / ${cf.b.foes[1].hp} HP in 3 s)`, cf);
	}
	// ---------- the type chart and piercing: three targets in a line
	{
		const r = await E(() => P.both({ moves: [['ember', 5]], foes: [{ dex: 1, dx: 90, still: true }, { dex: 7, dx: 150, still: true }, { dex: 4, dx: 210, still: true }], secs: 10 }));
		const ok = r.a.foes.every((f, i) => same(f.hp, r.b.foes[i].hp, Math.max(8, f.hp * 0.06)));
		A(ok && r.a.foes[0].hp > r.a.foes[1].hp, `Ember Lv5 through a Grass, a Water and a Fire target in a line: per target 2D ${r.a.foes.map(f => f.hp).join(' / ')} · 3D ${r.b.foes.map(f => f.hp).join(' / ')} HP`, r);
	}
	// ---------- poison
	{
		const has = await E(() => !!G.Moves.BY_ID['poison-sting']);
		if (has) { const r = await E(() => P.both({ moves: [['poison-sting', 1]], foes: [{ dex: 19, dx: 120, still: true, hp: 5000 }], secs: 10 }));
			A(r.a.removed > 0 && same(r.a.removed, r.b.removed, Math.max(12, r.a.removed * 0.05)), `Poison Sting, with its poison ticking (a 5,000 HP target): ${cmp(r)}`, r); }
	}
	// ---------- an enemy's touch
	{
		const r = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 220, spd: 56, dmg: 4 }], secs: 12, hurtable: true }));
		A(r.a.touches > 3 && r.a.touches === r.b.touches, `a chaser from 220 units, 12 s: it touches you ${r.a.touches} times in 2D, ${r.b.touches} in 3D`, r);
		A(same(r.a.taken, r.b.taken, 0.02), `...for the same HP: ${r.a.taken.toFixed(2)} in 2D, ${r.b.taken.toFixed(2)} in 3D`, r);
		A(same(r.a.foes[0].d, r.b.foes[0].d, 6), `...and ends the same distance away after its last knock-back (${r.a.foes[0].d.toFixed(1)} / ${r.b.foes[0].d.toFixed(1)} units)`, r);
		A(same(r.a.r, r.b.r, 1e-6), `your body is the same size (radius ${r.a.r} units)`, [r.a.r, r.b.r]);
	}
	// ---------- enemy behaviours: who does more than walk at you
	{
		const big = (b, o = {}) => ({ moves: [], foes: [{ dex: 19, dx: o.dx || 150, spd: 56, dmg: 6, hp: 1e6, b, def: o.def, shotCd: o.shotCd }], secs: o.secs || 12, hurtable: true, seed: o.seed });
		// (they start within 14 m: beyond that a 3D walker follows the level's cells, not a straight line)
		const hpOf = (r) => `${r.a.taken.toFixed(2)} HP in 2D, ${r.b.taken.toFixed(2)} in 3D`;
		const ch = await E((sc) => P.both(sc), big('charger', { dx: 220 }));
		A(ch.a.taken > 0 && Math.abs(ch.a.taken - ch.b.taken) < 0.02 && Math.abs(ch.a.first - ch.b.first) < 0.05, `a charger stops 200 units out, aims 0.55 s and comes through at 3.4 × speed: first hit after ${ch.a.first.toFixed(2)} s / ${ch.b.first.toFixed(2)} s, ${hpOf(ch)} in 12 s`, ch);
		A(Math.abs(ch.a.foes[0].d - ch.b.foes[0].d) < 3, `...and after 12 s it is in the same place (${ch.a.foes[0].d.toFixed(1)} / ${ch.b.foes[0].d.toFixed(1)} units away)`, ch);
		const rdef = { shotDmg: 5, shotCd: 2.2, range: 190 };
		const rg = await E((sc) => P.both(sc), big('ranged', { dx: 220, def: rdef, shotCd: 1 }));
		A(rg.a.taken > 0 && Math.abs(rg.a.taken - rg.b.taken) < 0.02 && Math.abs(rg.a.first - rg.b.first) < 0.05, `a ranged enemy walks into range, holds its distance and shoots every 2.2 s: first hit after ${rg.a.first.toFixed(2)} s / ${rg.b.first.toFixed(2)} s, ${hpOf(rg)}`, rg);
		A(Math.abs(rg.a.foes[0].d - rg.b.foes[0].d) < 2 && rg.a.foes[0].d > 100, `...and it stands off at the same distance (${rg.a.foes[0].d.toFixed(1)} / ${rg.b.foes[0].d.toFixed(1)} units)`, rg);
		const close = await E((sc) => P.both(sc), big('ranged', { dx: 60, def: rdef, shotCd: 1, secs: 6 }));
		A(Math.abs(close.a.foes[0].d - close.b.foes[0].d) < 2 && close.a.foes[0].d > 100, `too close, it backs away to its distance (from 60 to ${close.a.foes[0].d.toFixed(1)} / ${close.b.foes[0].d.toFixed(1)} units)`, close);
		const fan = await E((sc) => P.both(sc), big('fan', { dx: 220, def: { shotDmg: 5, shotCd: 3.2, range: 190, fanN: 5 }, shotCd: 1 }));
		A(fan.a.taken > 0 && Math.abs(fan.a.taken - fan.b.taken) < 0.02 && Math.abs(fan.a.first - fan.b.first) < 0.05, `a fan of five shots: the one down the middle hits (${hpOf(fan)})`, fan);
		const bm = await E((sc) => P.both(sc), big('beamer', { dx: 220, def: { shotDmg: 5, shotCd: 4.4, range: 260 }, shotCd: 1 }));
		A(bm.a.taken > 0 && Math.abs(bm.a.taken - bm.b.taken) < 0.02 && Math.abs(bm.a.first - bm.b.first) < 0.05, `a beamer marks a line and fires it a second later: first hit after ${bm.a.first.toFixed(2)} s / ${bm.b.first.toFixed(2)} s, ${hpOf(bm)}`, bm);
		const zn = await E((sc) => P.both(sc), big('zoner', { dx: 220, def: { shotDmg: 5, shotCd: 4.6, range: 190, zones: 1 }, shotCd: 1 }));
		A(zn.a.taken > 0 && Math.abs(zn.a.taken - zn.b.taken) < 0.02 && Math.abs(zn.a.first - zn.b.first) < 0.05, `a zoner marks the ground under you and it goes off 1.2 s later: first hit after ${zn.a.first.toFixed(2)} s / ${zn.b.first.toFixed(2)} s, ${hpOf(zn)}`, zn);
		const bo = await E((sc) => P.both(sc), big('bomber', { dx: 200, secs: 8 }));
		A(bo.a.taken > 0 && Math.abs(bo.a.taken - bo.b.taken) < 0.02 && Math.abs(bo.a.first - bo.b.first) < 0.05 && bo.a.foes[0].dead && bo.b.foes[0].dead, `a bomber walks up, lights its fuse and goes off a second later, taking itself with it: after ${bo.a.first.toFixed(2)} s / ${bo.b.first.toFixed(2)} s, ${hpOf(bo)}`, bo);
	}
	// ---------- a kill
	{
		const r = await E(() => P.both({ moves: [['ember', 1]], foes: [{ dex: 1, dx: 120, still: true, hp: 150 }], secs: 10 }));
		A(r.a.foes[0].dead && r.b.foes[0].dead, 'a 150 HP Bulbasaur dies to Ember on both sides', r);
	}
	A(errors.length === 0, 'no page errors', errors.slice(0, 4).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
