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
//   * Expedition's own kinds: a lob, homing shots, a barrage, a smite, a vortex (and its pull), a wave, a spin
//   * weather: rain on a Water move (the fade-in included), a sandstorm on a Rattata, a Geodude and you, Rain Dance
//   * the kinds that lie on the ground or are placed at random: a boomerang, meteors, a trail, a turret, cones, mines
//     (where the 2D game rolls dice for a position or a speed the totals are compared within a margin), and a buff
//   * the control states, set by hand on both sides: asleep (+30 % and it wakes), frozen (+25 %, it stands still),
//     paralysed (40 % speed, slower to touch), confused (it hits its neighbour)
//   * enemy behaviours: a charger (aim, then through you at 3.4 × speed), a ranged enemy (walks into range, holds
//     its distance, backs off when you are close, shoots), a fan of shots, a beamer and a zoner (a mark on the ground
//     that goes off after a delay, through your moment of grace), a bomber (a fuse, and it takes itself with it)
//   * the supports: a healer mends a hurt neighbour, a shielder's shield soaks up hits, a summoner calls four of its
//     kind at a time and keeps at most eight; and a jumper leaps to where you were
//   * a boss: each of its seven attacks (stomp, charge, leap, rain, beams, volley, ring) lands at the same moment for
//     the same damage; it is the same size; a hit does not shove it
//   * abilities, the same one set on both sides: seven that change your damage or cooldown, six that change what a
//     touch does to you or to the toucher, and Sturdy
//   * held items, the same one on both sides: sixteen of them, by damage dealt, HP lost and gained, and what is left
//     of the enemy
//   * experience: what each level costs, how far your reach is and how fast an orb comes, what a heap of XP makes
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
	await waitFor(() => visible('scr-starters'), 8000);
	await E(() => { const c = document.querySelector('#starter-grid .cell[data-dex="813"]'); if (c) c.click(); }); await sleep(200);   // (Scorbunny: the partner the old personality test gave this suite)
	await sleep(150);
	await page.click('#starter-ok');
	await waitFor(() => visible('scr-menu'), 10000);
	await page.click('#scr-menu [data-go=play]');
	await page.evaluate(() => { for (const s of ['[data-cat=survival]', '[data-var=normal]', '[data-players=solo]', '#mx-start']) document.querySelector('#scr-play ' + s).click(); });
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a run starts');
	await sleep(400);

	// ---------- both sides of the comparison, as helpers in the page
	const ready = await E(async () => {
		G.Game.togglePause(); G.UI.hide('scr-pause');
		await G.Expedition.load();   // (Expedition's own moves: the page loads them only when an Expedition run starts)
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
				if (G.ExpMoves.clear) G.ExpMoves.clear();
				G.Weather.reset(); if (sc.wx) G.Weather.force(sc.wx, sc.wxDur || 60);
				const ms = sc.moves.map(([id, lvl]) => (G.ExpMoves.isExpMove(id) ? G.ExpMoves.instance(id) : G.Moves.instance(id, lvl || 1)));
				pl.moves = ms; pl.slots = ms.map((m) => [m]); pl.active = 0; pl.statsTaken = {}; pl.dmgDealt = 0; pl.meleeT = 0;
				pl.hp = pl.maxHp; pl.invuln = sc.hurtable ? 0 : 1e9; pl.dead = false; pl.lastPatch = null;
				for (const k in pl.buffs) { pl.buffs[k].n = 0; pl.buffs[k].t = 0; }
				const ab0 = pl.ability, crit0 = pl.critChance; if (sc.ability) { G.Abilities.set(pl, sc.ability); pl.abT = 0; pl.abFirstT = -999; pl.abSturdyT = -999; pl.defiantT = 0; }
				const item0 = pl.item; if (sc.item !== undefined) { pl.equip(sc.item); pl.wpT = 0; pl.itemClock = 0; pl.sitrusT = -999; pl.sashT = -Infinity; pl.bellHeal = 0; }
				if (sc.plHp) pl.hp = pl.maxHp * sc.plHp;
				const atkK = sc.ability ? 1 : pl.atk / pl.baseAtk / (sc.item === 'lifeorb' ? 1.3 : 1), base2d = { cdMul: pl.cdMul, reduce: pl.dmgReduce };   // (the ability's factor, before any buff)
				if (sc.noProc) for (const m of ms) m.ccp = 0;   // (a state's dice are not the same dice on the two sides)
				let hits = 0, touches = 0, removed = 0, taken = 0;
				const foes = sc.foes.map((f) => {
					const def = { dex: f.dex, name: 'T' + f.dex, hp: f.hp || 1e6, spd: f.still ? 0 : f.spd || 56, dmg: f.dmg || 10, xp: 1, behavior: f.b || 'chase', ...(f.def || {}) };
					const e = new G.Enemy(def, pl.x + f.dx, pl.y + (f.dy || 0), { hp: 1, spd: 1, dmg: 1 }, !!f.boss);
					if (f.boss) { e.bossInit(); Object.assign(e.ai, { melee: [f.boss], ranged: [f.boss], mode: 'close', modeT: 99, cd: 0.5 }); }
					e.flying = true;   // (straight lines: no walls or pathing between you)
					const hurt = e.hurt.bind(e); e.hurt = (...a) => { const h0 = e.hp; const r = hurt(...a); removed += h0 - e.hp; if (a[4] !== undefined || a.length > 2) hits++; return r; };
					if (f.shotCd !== undefined) e.shotCd = f.shotCd; if (f.skillCd !== undefined) e.skillCd = f.skillCd; if (f.hurt) e.hp -= f.hurt;
					G.EnemyMgr.add(e); if (f.state) G.Status.apply(e, f.state); return e;
				});
				G.EnemyMgr.rebuildGrid();
				let firstDmg = 0;
				const plHurt = pl.hurt.bind(pl); pl.hurt = (...a) => { const h0 = pl.hp, was = pl.invuln > 0; const r = plHurt(...a); touches++; taken += h0 - pl.hp; if (!firstDmg && h0 - pl.hp > 0) firstDmg = h0 - pl.hp; return r; };
				const x0 = pl.x, y0 = pl.y; let t = 0, far = 0, landed = 0, first = 0;
				const land = G.Combat.land; let count = 0;
				for (let i = 0, n = Math.round(sc.secs / DT); i < n; i++) {
					t += DT;
					// the frame, in game.js's order: you (timers + the auto-aim), enemies, your moves, shots, hits and touches
					pl.x = x0; pl.y = y0;
					if (pl.invuln > 0 && pl.invuln < 1e8) pl.invuln -= DT;
					if (pl.meleeT > 0) pl.meleeT -= DT;
					for (const k in pl.buffs) { const b = pl.buffs[k]; if (b.n > 0) { b.t -= DT; if (b.t <= 0) b.n = 0; } }   // (player.update's buff clocks)
					G.Abilities.tick(pl, DT); if ((sc.ability || sc.item) && pl.regen > 0) pl.hp = Math.min(pl.maxHp, pl.hp + pl.regen * DT);   // (…its ability clocks and regeneration)
					pl.itemClock += DT; if (pl.wpT > 0) pl.wpT = Math.max(0, pl.wpT - DT); if (pl.bellHeal > 0) { const h = Math.min(pl.bellHeal, 4 * DT); pl.hp = Math.min(pl.maxHp, pl.hp + h); pl.bellHeal -= h; }   // (…and its item clocks)
					const tg = G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, 520);
					pl.target = tg; if (tg) pl.aim = Math.atan2(tg.y - pl.y, tg.x - pl.x);
					G.EnemyMgr.update(DT, [pl]); G.EnemyMgr.rebuildGrid();
					const d0 = pl.dmgDealt;
					G.Combat.tick(DT, pl, t);
					G.Projectiles.update(DT, pl, G.EnemyMgr.all());
					G.Combat.resolve(DT, pl, t);
					G.Combat.updateFields(DT);
					G.ExpMoves.tick(DT);   // (the game's run.tick, for Expedition's timed effects)
					G.Weather.update(DT, 0, pl);   // (the clock held at 0: no weather starts by itself)
					G.Hazards.update(DT);
					for (const e of foes) far = Math.max(far, Math.hypot(e.x - x0, e.y - y0));
					if (!first && taken > 0) first = t;
				}
				pl.hurt = plHurt;
				const hpEnd = pl.hp, cdMulWas = pl.cdMul; if (sc.ability) G.Abilities.set(pl, ab0); if (sc.item !== undefined) pl.equip(item0 || null);
				const all = G.EnemyMgr.all().filter((e) => !e.dead), mins = all.filter((e) => e.isMinion);
				return { count: all.length, minions: mins.length, minion: mins[0] ? { hp: mins[0].maxHp, dmg: mins[0].dmg, spd: mins[0].spd, xp: mins[0].xp } : null, left: foes.map((e) => Math.round(e.hp)), shields: foes.map((e) => Math.round(e.shield || 0)),
					first, firstDmg, scale: foes[0] ? foes[0].scale : 1, fr: foes[0] ? foes[0].r : 0, dealt: pl.dmgDealt, removed, taken, touches, hp: hpEnd, maxHp: pl.maxHp, far, foes: foes.map((e) => ({ hp: e.maxHp - e.hp, d: Math.hypot(e.x - x0, e.y - y0), dead: e.dead })),
					atkK, afDmg: pl.afDmg, dex: pl.mon.dex, crit: pl.critChance, r: pl.r, reduction: pl.reduction, takenK: G.Abilities.inK(pl, 'normal', null) };
			} finally { G.Weather.reset(); for (const k in keep) Wd[k] = keep[k]; Math.random = R; G.EnemyMgr.clear(); G.Projectiles.clear(); G.Projectiles.clearOrbs(G.Game.player); G.Combat.clearFields(); G.EnemyMgr.rebuildGrid(); G.Game.player.invuln = 1e9; }
		}
		/** The same fight by the 3D rules, on a flat room. `ref`: the 2D result (who you are, your ability's factors). */
		function play3d(sc, ref) {
			const room = S.makeRoom(80, 80, 0); room.spawn = [80, 0, 80];
			const w = C.newWorld(room, data, { dex: ref.dex, moves: sc.moves, seed: sc.seed ? sc.seed * 7 + 1 : 777, weather: false, items: sc.item ? [sc.item] : [], ability: sc.ability || null, afDmg: ref.afDmg, atkK: ref.atkK, takenK: sc.ability ? 1 : ref.takenK, crit: 0, orbitSquash: 0.7 });
			w.pl.baseReduce = sc.ability ? 0 : sc.item === 'assaultvest' ? 0.2 : ref.reduction; w.pl.invuln = sc.hurtable ? 0 : 1e9; if (sc.plHp) w.pl.hp = w.pl.maxHp * sc.plHp;
			if (sc.wx) C.setWeather(w, sc.wx, sc.wxDur || 60);
			if (sc.noProc) for (const m of w.pl.moves) m.ccp = 0;
			const foes = sc.foes.map((f) => {
				if (f.boss) { const b = C.addBoss(w, f.dex, 80 + f.dx * U, 80, { t: 0, def: { dex: f.dex, hp: f.hp || 1e6, spd: f.spd || 56, dmg: f.dmg || 10, xp: 1, behavior: 'chase', ...(f.def || {}) } }); Object.assign(b.ai, { melee: [f.boss], ranged: [f.boss], mode: 'close', modeT: 99, cd: 0.5 }); b.a.y = 0; b.a.hover = 0; return b; }   // (flat ground: it stands on the floor as the 2D one does)
				const e = C.addEnemy(w, f.dex, 80 + f.dx * U, 80 + (f.dy || 0) * U, { t: 0, ti: 0, behavior: f.b || 'chase' });   // (a target that stands still is an enemy with no speed: it still touches, as in 2D)
				if (f.def) Object.assign(e.def = { ...e.def }, f.def); if (f.shotCd !== undefined) e.shotCd = f.shotCd; if (f.skillCd !== undefined) e.skillCd = f.skillCd;
				if (f.def2) { e.def = { ...e.def, hp: f.def2.hp, spd: f.def2.spd, dmg: f.def2.dmg, xp: f.def2.xp }; }
				e.maxHp = e.hp = f.hp || 1e6; e.dmg = f.dmg || 10; e.a.speed = (f.still ? 0 : f.spd || 56) * U; if (f.hurt) e.hp -= f.hurt;
				e.fly = false; e.a.fly = false; e.a.y = 0; e.a.grounded = true;   // (flat ground: everyone walks)
				if (f.state) C.applyState(w, e, f.state);
				return e;
			});
			let far = 0, first = 0, firstDmg = 0;
			for (let i = 0, n = Math.round(sc.secs / DT); i < n; i++) { C.tick(w, null, DT); for (const e of foes) far = Math.max(far, Math.hypot(e.a.x - 80, e.a.z - 80) / U); if (!first && w.stats.taken > 0) { first = w.t; firstDmg = w.stats.taken; } }
			const mins = w.enemies.filter((e) => e.minion && !e.dead);
			return { count: w.enemies.length, minions: mins.length, minion: mins[0] ? { hp: mins[0].maxHp, dmg: mins[0].dmg, spd: mins[0].a.speed / U, xp: mins[0].xp } : null, left: foes.map((e) => Math.round(e.hp)), shields: foes.map((e) => Math.round(e.shield || 0)),
				first, firstDmg, scale: foes[0] ? foes[0].scale || 1 : 1, fr: foes[0] ? foes[0].cr / U : 0, dealt: w.stats.dealt, removed: w.stats.removed, hits: w.stats.hits, taken: w.stats.taken, touches: w.stats.touched, hp: w.pl.hp, maxHp: w.pl.maxHp, far, r: w.pl.r / U,
				foes: foes.map((e) => ({ hp: e.maxHp - e.hp, d: Math.hypot(e.a.x - 80, e.a.z - 80) / U, dead: e.dead })) };
		}
		/** Experience, both ways: the curve; how long an orb at rest takes to reach you from `dist` units; what `xp` makes of a fresh level 1. */
		function xp(dist, amount) {
			const pl = G.Game.player, curve2 = [], curve3 = []; for (let l = 1; l <= 60; l++) { curve2.push(G.Player.xpFor(l)); curve3.push(C.xpFor(l)); }
			const all = G.Pickups.all(), keep = all.splice(0, all.length);
			G.Pickups.dropXp(pl.x + dist, pl.y, 7); const orb = all.find((p) => p.kind === 'xp'); all.length = 0; all.push(orb); orb.vx = orb.vy = 0; orb.x = pl.x + dist; orb.y = pl.y;
			let n2 = 0, got = false; while (n2 < 600 && !got) { G.Pickups.update(DT, [pl], () => { got = true; }); n2++; }
			all.length = 0; for (const p of keep) all.push(p);
			const room = S.makeRoom(80, 80, 0); room.spawn = [80, 0, 80]; const w = C.newWorld(room, data, { dex: pl.mon.dex, moves: [], seed: 1 });
			w.pl.s.y = 0; const o = C.drop(w, 'xp', 80 + dist * U, 0.5, 80, 7); o.vx = o.vz = 0;   // (level with your middle, as a 2D orb is level with you)
			let n3 = 0; while (n3 < 600 && w.pickups.length) { C.tick(w, null, DT); n3++; }
			// levels: the same XP into a fresh level-1 player
			const p2 = { xp: 0, xpMul: 1, level: 1, xpNext: G.Player.xpFor(1) }; p2.xp += amount; while (p2.xp >= p2.xpNext) { p2.xp -= p2.xpNext; p2.level++; p2.xpNext = G.Player.xpFor(p2.level); }
			const w2 = C.newWorld(room, data, { dex: pl.mon.dex, moves: [], seed: 1, autoPick: 0 }); const big = C.drop(w2, 'xp', 80.1, 0.5, 80, amount); big.vx = big.vz = 0; for (let i = 0; i < 10; i++) C.tick(w2, null, DT);
			return { same: JSON.stringify(curve2) === JSON.stringify(curve3), first: curve2[0], n2, n3, magnet2: pl.magnet, magnet3: w.pl.magnet / U, l2: [p2.level, p2.xp], l3: [w2.pl.level, w2.pl.xp] };
		}
		window.P = { xp, both(sc) { const a = play2d(sc); return { a, b: play3d(sc, a) }; } };
		return { state: G.Game.state, unported: C.CK.UNPORTED, exp: !!G.ExpMoves && Object.keys(G.ExpMoves.MOVES).length, later: C.CK.EXP_LATER };
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
	// ---------- Expedition's own kinds
	A(ready.exp === 18 && ready.later.length === 0, `Expedition's 18 moves are loaded, and all eight of its kinds are in the 3D rules`, ready);
	for (const [id, dist, what] of [['mud-bomb', 150, 'a lob: a bomb in an arc, and it slows'], ['sludge-bomb', 150, 'a lob that poisons'], ['swift', 150, 'homing shots'], ['bullet-seed', 150, 'a barrage: four quick shots'], ['sky-attack', 150, 'a smite: a strike from the sky'], ['thunder', 150, 'a smite'], ['whirlpool', 150, 'a vortex on the target'], ['surf', 120, 'a wave spreading from you'], ['rapid-spin', 40, 'a spin']]) {
		const r = await E((id, dist) => P.both({ moves: [[id, 1]], foes: [{ dex: 19, dx: dist, still: true, hp: 20000 }], secs: 10, noProc: true }), id, dist);
		const one = r.b.hits ? r.b.removed / r.b.hits : 1;
		A(r.a.removed > 0 && Math.abs(r.a.removed - r.b.removed) <= Math.max(2, one * 0.02), `${id} (${what}), 10 s: ${cmp(r)}`, r);
	}
	{   // a vortex drags the others in
		const r = await E(() => P.both({ moves: [['twister', 1]], foes: [{ dex: 19, dx: 150, still: true, hp: 20000 }, { dex: 19, dx: 150, dy: 90, still: true, hp: 20000 }], secs: 6, noProc: true }));
		A(r.a.foes[1].hp > 0 && r.a.foes[1].hp === r.b.foes[1].hp && Math.abs(r.a.foes[1].d - r.b.foes[1].d) < 1.5, `a vortex pulls a second enemy 90 units off into itself and grinds it too (it loses ${r.a.foes[1].hp} / ${r.b.foes[1].hp} HP)`, r);
	}
	// ---------- weather
	{
		const rain = await E(() => P.both({ moves: [['water-gun', 1]], foes: [{ dex: 19, dx: 150, still: true, hp: 20000 }], secs: 10, wx: 'rain' }));
		const dry = await E(() => P.both({ moves: [['water-gun', 1]], foes: [{ dex: 19, dx: 150, still: true, hp: 20000 }], secs: 10 }));
		A(rain.a.removed === rain.b.removed && rain.a.removed > dry.a.removed * 1.3, `Water Gun in the rain, the 3 s fade-in included: ${cmp(rain)} (dry: ${dry.a.removed})`, rain);
		const sand = await E(() => P.both({ moves: [], foes: [{ dex: 19, dx: 150, still: true, hp: 2000 }, { dex: 74, dx: 150, dy: 60, still: true, hp: 2000 }], secs: 12, wx: 'sand', hurtable: true }));
		A(sand.a.left[0] === sand.b.left[0] && sand.a.left[0] < 2000 && sand.a.left[1] === 2000 && sand.b.left[1] === 2000 && Math.abs(sand.a.hp - sand.b.hp) < 0.02 && sand.a.hp < sand.a.maxHp, `12 s of sandstorm: a Rattata is worn down to ${sand.a.left[0]} / ${sand.b.left[0]} of 2000, a Geodude not at all, and you to ${sand.a.hp.toFixed(2)} / ${sand.b.hp.toFixed(2)} HP`, sand);
		const dance = await E(() => P.both({ moves: [['rain-dance', 1], ['water-gun', 1]], foes: [{ dex: 19, dx: 150, still: true, hp: 20000 }], secs: 12 }));
		A(dance.a.removed === dance.b.removed && dance.a.removed > dry.a.removed * 1.3, `Rain Dance, then Water Gun under it: ${cmp(dance)}`, dance);
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
	// ---------- the supports and the jumper
	{
		// (the 2D test enemy is built from a bare definition: hp / spd / dmg / xp as given, and the 3D one is given the same)
		const d2 = { hp: 1000, spd: 56, dmg: 6, xp: 1 };
		const heal = await E((d2) => P.both({ moves: [], secs: 5, foes: [{ dex: 19, dx: 200, spd: 56, dmg: 6, hp: 1000, b: 'healer', def: { shotCd: 3.5, range: 230 }, def2: d2, shotCd: 1 }, { dex: 1, dx: 240, still: true, hp: 1000, hurt: 400 }] }), d2);
		A(heal.a.left[1] > 600 && heal.a.left[1] === heal.b.left[1], `a healer mends a hurt neighbour by 7 % of its HP each time (from 600 to ${heal.a.left[1]} / ${heal.b.left[1]} in 5 s)`, heal);
		const sh = await E((d2) => P.both({ moves: [['ember', 1]], secs: 9, noProc: true, foes: [{ dex: 19, dx: 120, still: true, hp: 1000, b: 'shielder', def2: d2, skillCd: 1 }] }), d2);
		const bare = await E((d2) => P.both({ moves: [['ember', 1]], secs: 9, noProc: true, foes: [{ dex: 19, dx: 120, still: true, hp: 1000, def2: d2 }] }), d2);
		A(sh.a.left[0] === sh.b.left[0] && sh.a.left[0] > bare.a.left[0] + 200, `a shielder's shield soaks up 30 % of its HP before it is hurt (after 9 s of Ember it has ${sh.a.left[0]} / ${sh.b.left[0]} HP; unshielded ${bare.a.left[0]})`, [sh, bare]);
		const su = await E((d2) => P.both({ moves: [], secs: 6, foes: [{ dex: 19, dx: 200, spd: 56, dmg: 6, hp: 1000, b: 'summoner', def: { shotCd: 7, range: 230 }, def2: d2, shotCd: 1 }] }), d2);
		// (HP: the 2D test enemy carries no run scaling, a 3D enemy carries the run's × 3.3 at the start, and its minions with it)
		A(su.a.minions === 4 && su.b.minions === 4 && su.a.minion.hp === 350 && su.b.minion.hp === Math.round(350 * 3.3) && su.a.minion.dmg === su.b.minion.dmg && su.a.minion.spd === su.b.minion.spd && su.a.minion.xp === su.b.minion.xp,
			`a summoner calls four of its kind, each 35 % of its HP, 60 % of its damage, 10 % faster (2D ${JSON.stringify(su.a.minion)} · 3D ${JSON.stringify(su.b.minion)})`, su);
		const su2 = await E((d2) => P.both({ moves: [], secs: 30, foes: [{ dex: 19, dx: 200, still: true, dmg: 6, hp: 1000, b: 'summoner', def: { shotCd: 7, range: 230 }, def2: d2, shotCd: 1 }] }), d2);
		A(su2.a.minions === 8 && su2.b.minions === 8, 'and never has more than eight of its own alive (after 30 s: 8 / 8)', [su2.a.minions, su2.b.minions]);
		const jm = await E((d2) => P.both({ moves: [], secs: 4, hurtable: true, foes: [{ dex: 19, dx: 200, still: true, dmg: 6, hp: 1000, b: 'jumper', def2: d2, skillCd: 0.5 }] }), d2);
		A(jm.a.taken > 0 && Math.abs(jm.a.taken - jm.b.taken) < 0.02 && Math.abs(jm.a.first - jm.b.first) < 0.05 && Math.abs(jm.a.foes[0].d - jm.b.foes[0].d) < 3, `a jumper crouches, leaps and lands where you were, hurting you if you are still there: hit after ${jm.a.first.toFixed(2)} s / ${jm.b.first.toFixed(2)} s for ${jm.a.taken.toFixed(2)} / ${jm.b.taken.toFixed(2)} HP`, jm);
	}
	// ---------- a boss, one attack at a time (its choice pinned on both sides; the first one that lands is compared)
	{
		const bdef = { shotDmg: 12, shotCd: 1.1, range: 260 };
		for (const [attack, dx, what] of [['slam', 100, 'a stomp: a ring round it'], ['dash', 220, 'a charge down a marked line'], ['leap', 220, 'a leap onto your spot'], ['rain', 220, 'zones falling round you'], ['beam', 220, 'a fan of marked lines'], ['volley', 200, 'a fan of shots'], ['nova', 80, 'a ring of shots']]) {
			const r = await E((attack, dx, bdef) => P.both({ moves: [], secs: 3, hurtable: true, foes: [{ dex: 143, dx, spd: 50, dmg: 20, hp: 5000, boss: attack, def: bdef }] }), attack, dx, bdef);
			A(r.a.firstDmg > 0 && Math.abs(r.a.firstDmg - r.b.firstDmg) < 0.02 && Math.abs(r.a.first - r.b.first) < 0.05, `a boss's ${attack} (${what}): it lands after ${r.a.first.toFixed(2)} s / ${r.b.first.toFixed(2)} s for ${r.a.firstDmg.toFixed(2)} / ${r.b.firstDmg.toFixed(2)} HP`, r);
			if (attack === 'slam') A(r.a.scale === r.b.scale && r.a.scale > 1 && Math.abs(r.a.fr - r.b.fr) < 1e-6, `a boss is drawn bigger and its body is bigger with it (Snorlax × ${r.a.scale}: radius ${r.a.fr} units)`, [r.a.scale, r.b.scale, r.a.fr, r.b.fr]);
		}
		const kb = await E(() => P.both({ moves: [['body-slam', 3]], secs: 4, foes: [{ dex: 143, dx: 40, spd: 0.0001, dmg: 1, hp: 5000, boss: 'none' }] }));
		A(kb.a.removed > 0 && kb.a.removed === kb.b.removed && kb.a.foes[0].d < 60 && kb.b.foes[0].d < 60, `a hit does not shove a boss: 4 s of Body Slam and it has not been driven off (${kb.a.foes[0].d.toFixed(0)} / ${kb.b.foes[0].d.toFixed(0)} units away; ${kb.a.removed} / ${kb.b.removed} HP)`, kb);
	}
	// ---------- abilities: the same one set on both sides (you are a Scorbunny: Fire)
	{
		const fire = (ability, o = {}) => E((ability, o) => P.both({ moves: [[o.move || 'ember', 1]], foes: [{ dex: o.foe || 19, dx: o.dx || 120, still: true, hp: 20000 }], secs: 8, ability, plHp: o.plHp, noProc: true }), ability, o);
		const plain = await fire('battlearmor');   // (an ability that changes nothing about your damage: the yardstick)
		for (const [ab, o, what, want] of [['hugepower', {}, '+ 25 % damage', 1.25], ['megalauncher', {}, '+ 20 % with shots', 1.2], ['drought', {}, '+ 15 % with Fire moves', 1.15], ['adaptability', {}, '+ 20 % with your own type', 1.2], ['blaze', { plHp: 0.3 }, '+ 35 % with Fire under 40 % HP', 1.35], ['tintedlens', { foe: 7 }, '+ 40 % on a resisted hit', null], ['prankster', {}, '10 % off cooldowns', null]]) {
			const r = await fire(ab, o);
			A(r.a.removed > 0 && Math.abs(r.a.removed - r.b.removed) <= 2 && (want === null || Math.abs(r.a.dealt / plain.a.dealt - want) < 0.005), `${ab} (${what}): 8 s of Ember: ${cmp(r)}`, r);
		}
		const touch = (ability, foe, o = {}) => E((ability, foe, o) => P.both({ moves: [], foes: [{ dex: foe, dx: 60, spd: 56, dmg: 3 }], secs: o.secs || 6, hurtable: true, ability, plHp: o.plHp }), ability, foe, o);
		for (const [ab, foe, what] of [['intimidate', 19, '10 % less from a touch'], ['thickfat', 4, 'half from a Fire enemy'], ['solidrock', 7, 'a quarter off a super-effective hit'], ['multiscale', 19, 'the first hit halved'], ['roughskin', 19, 'whoever touches you is hurt'], ['regenerator', 19, '1 % of your HP a second']]) {
			const r = await touch(ab, foe);
			A(r.a.taken > 0 && Math.abs(r.a.taken - r.b.taken) < 0.02 && r.a.touches === r.b.touches && Math.abs(r.a.hp - r.b.hp) < 0.05 && r.a.left[0] === r.b.left[0], `${ab} (${what}): 6 s with a chaser: you lose ${r.a.taken.toFixed(2)} / ${r.b.taken.toFixed(2)} HP and end on ${r.a.hp.toFixed(2)} / ${r.b.hp.toFixed(2)}; it is left with ${r.a.left[0]} / ${r.b.left[0]}`, r);
		}
		const st = await touch('sturdy', 19, { plHp: 0.05, secs: 2 });
		A(st.a.hp === 1 && st.b.hp === 1, `sturdy: on 5 % HP, the touch that would finish you leaves 1 HP (${st.a.hp} / ${st.b.hp})`, st);
	}
	// ---------- held items: the same one held on both sides
	{
		const fire = (item, o = {}) => E((item, o) => P.both({ moves: o.moves || [['ember', 1]], foes: [{ dex: o.foe || 19, dx: o.dx || 120, still: true, hp: 20000 }], secs: 8, item, plHp: o.plHp, ability: o.ability, noProc: true }), item, o);
		for (const [item, o, what] of [['lifeorb', {}, '+ 30 % damage, 1 % of your HP an attack'], ['quickclaw', {}, '20 % off cooldowns'], ['expertbelt', { foe: 1 }, '+ 25 % on a super-effective hit'], ['typegem', {}, '+ 20 % with your own type'], ['silverpowder', { moves: [['bug-buzz', 1]], dx: 50 }, '+ 20 % with Bug moves'], ['bigorb', { moves: [['bug-buzz', 1]], dx: 95 }, 'an aura 30 % wider: a target at 95 units is inside it'], ['widelens', { moves: [['bug-buzz', 1]], dx: 88 }, 'an aura 20 % wider: a target at 88 units is inside it'], ['shellbell', { plHp: 0.2, ability: 'battlearmor' }, 'HP back for the damage you do'], ['leftovers', { plHp: 0.2, ability: 'battlearmor' }, '1.5 % of your HP a second']]) {
			// (on low HP a neutral ability is set on both sides: your own, Blaze, would add to the 2D side's Fire damage)
			const r = await fire(item, o);
			A(r.a.removed > 0 && Math.abs(r.a.removed - r.b.removed) <= 2 && Math.abs(r.a.hp - r.b.hp) < 0.05, `${item} (${what}): 8 s: ${cmp(r)}; you end on ${r.a.hp.toFixed(2)} / ${r.b.hp.toFixed(2)} HP`, r);
		}
		const two = await E(() => P.both({ moves: [['ember', 1], ['water-gun', 1]], foes: [{ dex: 19, dx: 120, still: true, hp: 20000 }], secs: 8, item: 'choiceband' }));
		A(two.a.removed === two.b.removed && two.a.removed > 0, `choiceband (your first move + 40 %, the other - 20 %): Ember and Water Gun together: ${cmp(two)}`, two);
		const touch = (item, foe, o = {}) => E((item, foe, o) => P.both({ moves: [], foes: [{ dex: foe, dx: 60, spd: 56, dmg: 3 }], secs: o.secs || 6, hurtable: true, item, plHp: o.plHp }), item, foe, o);
		for (const [item, foe, what, o] of [['assaultvest', 19, '20 % less from a touch', {}], ['rockyhelmet', 19, 'whoever touches you is hurt', {}], ['eternalice', 19, 'whoever touches you is slowed', {}], ['sitrusberry', 19, 'under half HP, 30 % back', { plHp: 0.52 }], ['focussash', 19, 'left on 1 HP', { plHp: 0.03, secs: 1.2 }]]) {
			const r = await touch(item, foe, o);
			A(r.a.touches > 0 && r.a.touches === r.b.touches && Math.abs(r.a.hp - r.b.hp) < 0.05 && r.a.left[0] === r.b.left[0] && Math.abs(r.a.foes[0].d - r.b.foes[0].d) < 2, `${item} (${what}): with a chaser: you end on ${r.a.hp.toFixed(2)} / ${r.b.hp.toFixed(2)} HP after ${r.a.touches} / ${r.b.touches} touches; it is left with ${r.a.left[0]} / ${r.b.left[0]}`, r);
		}
		const wp = await E(() => P.both({ moves: [['ember', 1]], foes: [{ dex: 19, dx: 120, still: true, hp: 20000 }, { dex: 7, dx: 40, spd: 56, dmg: 1, hp: 1e6 }], secs: 8, hurtable: true, item: 'weaknesspolicy' }));
		A(wp.a.left[1] === wp.b.left[1] && wp.a.left[1] < 1e6 && wp.a.dealt > 0 && Math.abs(wp.a.dealt - wp.b.dealt) < 0.01 && Math.abs(wp.a.hp - wp.b.hp) < 0.05, `weaknesspolicy (+ 50 % for 8 s after a super-effective hit): a Squirtle on you while you fire at it: ${cmp(wp)}`, wp);
	}
	// ---------- experience
	{
		const x = await E(() => P.xp(60, 2000)), far = await E(() => P.xp(90, 10));
		A(x.same && x.first === 62, `the XP each of the first 60 levels costs is the same (${x.first} for the first)`, x);
		A(x.magnet2 === x.magnet3 && Math.abs(x.n2 - x.n3) <= 1 && x.n2 < 60, `your reach is the same (${x.magnet2} units) and an orb 60 units away takes as long to reach you (${x.n2} / ${x.n3} ticks)`, x);
		A(far.n2 === 600 && far.n3 === 600, 'an orb 90 units away is out of reach on both sides', far);
		A(JSON.stringify(x.l2) === JSON.stringify(x.l3) && x.l2[0] > 8, `2,000 XP at once makes you level ${x.l2[0]} with ${x.l2[1]} left over, on both sides`, x);
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
