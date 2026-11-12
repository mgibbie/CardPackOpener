// micasurvivor_m3d_expedition_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): a Classic Expedition run
// on generated 3D maps (micasurvivor/m3d/expedition.js), in node, with the 2D game's own plan and numbers. These are
// the state checks of the 2D suite micasurvivor_expedition_classic_test.mjs (and the tiers suite's "the tier changes
// the run"), made of the 3D run.
//   * the zones: every map's three zones, over 20 seeds, are whole levels (walkable both ways, no traps); the altar
//     is on a flat 3 x 3 you can walk to, 26 m or more from where you arrive; the same seed gives the same zone
//   * the shrine: a walled grove, and stairs up to the pedestal on its dais
//   * what a zone holds is the 2D game's plan, to the letter
//   * the altar: 3 s on it wakes the guardian; step off and the charge drains at half the pace; the ledge above it
//     does not count
//   * the guardian: the plan's species, north of the altar; HP = the greater of the curve and your damage x target
//     x 0.5; past its target it is exhausted and takes more; the trickle thins while it is up
//   * it falls: the portal opens and every pickup comes to you; 0.8 s in the portal is the next zone: a new level, the
//     zone's clock at zero, the split kept, you (level, moves, HP) carried over, nothing else
//   * a later zone's enemies are at least as far into the run as its floor (zone 2: four minutes), in its tier range
//   * the trickle: four species to start, one more a minute; never past the cap
//   * the final swarm at 10:00: the cap up 40 %, arrivals x 6, HP x 4 and damage x 2 a minute
//   * the timeline: every event fires once, in order, at its time; an alpha, an elite wave, a swarm, a stampede (a
//     straight run that does not turn), a flock (in the air), a rock slide (marks on the ground), a totem (it calls
//     three allies every 7 s), a summoner (rooted; gone after 50 s leaving nothing)
//   * the tiers: Hard and Nightmare change HP, damage, speed, XP, the cap and the escorts; Normal changes nothing
//   * a whole run: three guardians and the legendary; four splits, the win, the run over 3 s later, the 2D game's score
//   * down alone: the run is over, lost
//   * the same seed and inputs give the same run
//   node overworld/tests/micasurvivor_m3d_expedition_test.mjs
import { K, CELL, groundAt } from '../../micasurvivor/m3d/sim.js';
import { validate, hashRoom, footPath, LEVEL } from '../../micasurvivor/m3d/gen.js';
import { dataFrom, hashWorld, spawnRate, drop, CK, U } from '../../micasurvivor/m3d/combat.js';
import { XK, expFrom, zoneRoom, shrineRoom, newRun, stepRun, spawn, fire, bossHp, capNow, onSite, hudLine, result, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), XKK = X.K;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
/** A run where you cannot be hurt to nothing (the run's rules are what is tested, not your survival). */
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false, autoPick: 0, ...o }); if (!o.mortal) { S.w.pl.maxHp = S.w.pl.hp = 1e9; } return S; };
const steps = (S, sec, input = null) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) stepRun(S, input); return S; };
const toAltar = (S) => { const s = S.w.pl.s, a = S.w.room.altar; s.x = a[0]; s.y = a[1]; s.z = a[2]; s.vx = s.vy = s.vz = 0; s.grounded = true; };
const toSpawn = (S) => { const s = S.w.pl.s, a = S.w.room.spawn; s.x = a[0]; s.y = a[1]; s.z = a[2]; s.vx = s.vy = s.vz = 0; s.grounded = true; };
const slay = (S) => { const e = S.boss; S.w.hit(e, e.hp + 10, 0, 0, 0); stepRun(S, null); return e; };
/** Wake the zone's guardian, beat it, take the portal (with nobody else about: a touch would shove you off the site). */
const hush = (S) => { S.acc = -1e9; for (const e of S.w.enemies) if (e !== S.boss) e.dead = true; };
const clearZone = (S) => { hush(S); toAltar(S); steps(S, XKK.ALTAR_T + 0.1); slay(S); hush(S); if (S.zone <= 3 && S.ph === 2) { toAltar(S); steps(S, XKK.PORTAL_T + 0.1); } };

// ---------------------------------------------------------------- the zones
{
	let bad = [], near26 = 0, n = 0, flat = 0, level = true;
	for (let seed = 1; seed <= 20; seed++) for (const map of X.MAP_IDS) for (let z = 1; z <= 3; z++) {
		const r = zoneRoom(seed, map, z, X), v = validate(r); n++;
		if (!v.ok) bad.push([seed, map, z, v.problems[0]]);
		const d = Math.hypot(r.altar[0] - r.spawn[0], r.altar[2] - r.spawn[2]); if (d >= XK.ALTAR_MIN) near26++;
		const cx = Math.floor(r.altar[0] / CELL), cz = Math.floor(r.altar[2] / CELL); let f = true;
		for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const i = (cz + dz) * r.w + cx + dx; if (r.cells[i] !== r.altar[1] || r.slopes.has(i) || r.water.has(i)) f = false; }
		if (f) flat++;
		if (r.map !== map || r.zone !== z || r.exit !== r.altar) level = false;
	}
	A(bad.length === 0, `every zone of the three maps over 20 seeds (${n}) is a whole level: walkable both ways, the altar reachable on foot`, bad.slice(0, 3));
	A(near26 === n && flat === n && level, `every altar is on a flat 3 x 3, ${XK.ALTAR_MIN} m or more from where you arrive`, [near26, flat, n]);
	const a = zoneRoom(11, 'viridian', 1, X), b = zoneRoom(11, 'viridian', 1, X), c = zoneRoom(11, 'viridian', 2, X), d = zoneRoom(12, 'viridian', 1, X), m = zoneRoom(11, 'mtmoon', 1, X);
	A(hashRoom(a) === hashRoom(b) && a.altar.join() === b.altar.join(), 'the same seed, map and zone give the same level and the same altar');
	A(new Set([a, c, d, m].map(hashRoom)).size === 4, 'another zone, seed or map gives another level');
	A(a.w === XK.ZONE_TILES * 7 + 2 && a.biome === 'meadow' && m.biome === 'peaks' && zoneRoom(1, 'cerulean', 1, X).biome === 'marsh', `a zone is ${XK.ZONE_TILES} x ${XK.ZONE_TILES} tiles; Viridian is meadow, Mt. Moon peaks, Cerulean Cape marsh`, [a.w, a.biome, m.biome]);
	const sh = shrineRoom('viridian'), v = validate(sh), path = footPath(sh, sh.altar);
	A(v.ok && sh.w === 44 && sh.altar[1] === LEVEL && groundAt(sh, sh.altar[0], sh.altar[2]) === LEVEL && path && path.length > 10, `the shrine: a whole level 44 cells across, the pedestal up on the dais (${LEVEL} m), stairs you can walk up to it (${path && path.length} cells from the middle)`, v.problems);
	A(groundAt(sh, 1, 1) >= sh.rimH && zoneRoom(5, 'viridian', 4, X).shrine === true, 'outside the grove is wall; zone 4 is the shrine');
}

// ---------------------------------------------------------------- the plan and the numbers are the 2D game's
{
	const S = run({ seed: 4242, map: 'mtmoon', diff: 'hard' });
	const p = G.ExpClassic.plan(4242, 'mtmoon', 1, 'hard');
	A(JSON.stringify(S.plan) === JSON.stringify(p) && p.events.length >= 13 && p.cards.length >= 12, `a zone's species, guardian and timeline are the 2D game's plan to the letter (${p.events.length} events, ${p.cards.length} species)`);
	A(S.map === 'mtmoon' && S.diff === 'hard' && newRun(data, X, { map: 'nowhere', diff: 'silly' }).map === 'viridian', 'a run takes its map and tier; an unknown one is Viridian on Normal');
	G.Coop = G.Coop || { scaleHp: (n) => 1 + 0.3 * Math.max(0, n - 1) };   // (the 2D game's net/coop.js rule, which its bossHp reads)
	let same = true; const seen = [];
	for (const o of [{ zone: 1 }, { zone: 2, t: 400 }, { zone: 3, t: 900, dps: 800, tier: 2 }, { zone: 4, legend: true, t: 1300, dps: 300 }, { zone: 2, t: 300, players: 2 }, { zone: 1, dps: 5000, tier: 1 }]) {
		const a = bossHp(XKK, o), b = G.ExpClassic.bossHp(o); seen.push([a.hp, b.hp]);
		if (a.hp !== b.hp || a.curve !== b.curve || a.fromDps !== b.fromDps || a.target !== b.target) same = false;
	}
	A(same, 'a guardian\'s HP is the 2D game\'s for every case tried (curve, your damage, tier, party, the legendary)', seen);
	A(spawnRate(300) === (1.6 + 300 * 0.028 + Math.pow(5, 1.6) * 0.5) * 0.24, 'arrivals a second are the 2D spawner\'s curve');
}

// ---------------------------------------------------------------- the altar and the guardian
{
	const S = run();
	A(S.zone === 1 && S.ph === 0 && S.charge === 0 && /ZONE 1\/3 · FINAL SWARM IN 10:00 · ALTAR \d+ m/.test(hudLine(S)), 'a run starts in zone 1, the altar asleep: ' + hudLine(S));
	steps(S, 5);
	A(S.charge === 0 && S.ph === 0, 'away from the altar nothing charges');
	toAltar(S); steps(S, 1.5);
	A(near(S.charge, 0.5, 0.02) && S.ph === 0, `1.5 s on the altar: half charged (${S.charge.toFixed(2)})`);
	const s = S.w.pl.s; s.y += 3; s.grounded = false;
	A(!onSite(S, XKK.ALTAR_R), '3 m above the altar does not count: a site wants you on its level');
	toSpawn(S); steps(S, 1);
	A(near(S.charge, 0.5 - 1 / 6, 0.03), `a second away: the charge drains at half the pace (${S.charge.toFixed(2)})`);
	toAltar(S); steps(S, 1.8);
	A(S.ph === 0 && !S.boss, '…and 1.8 s more is not yet enough');
	for (let i = 0; i < 40 && S.ph === 0; i++) stepRun(S, null);
	const e = S.boss, a = S.w.room.altar, b = S.bosses[0];
	A(S.ph === 1 && e && e.boss && e.dex === S.plan.guardian && e.xk === 'guardian', `then the guardian wakes: ${data.mon(S.plan.guardian).name} (${hudLine(S)})`);
	A(near(e.a.x, a[0], 0.02) && e.a.z < a[2] && near(a[2] - e.a.z, XK.BOSS_NORTH * U, 0.3), 'it appears just north of the altar');
	const curve = Math.round(XKK.GUARD_HP[0] * (1 + b.at / 600));
	A(e.maxHp === curve && b.hp === curve && b.fromDps === 0 && b.target === 40, `with no damage done yet its HP is the curve's (${curve})`, b);
	A(Math.round(e.dmg) === Math.round(Math.round(XKK.GUARD_DMG[0] * 1.2) * (1 + b.at / 600)), `its touch is the 2D guardian's (${Math.round(e.dmg)})`);
	// the trickle thins while it is up
	S.acc = 0; const t = S.w.t; stepRun(S, null);
	A(near(S.acc, spawnRate(Math.max(t + K.TICK, 0)) * XKK.BOSS_RATE * K.TICK, 0.02), `while it is up arrivals come at ${XKK.BOSS_RATE} of the pace`, S.acc);
	// exhaustion
	e.xborn = S.w.t - 50; stepRun(S, null);
	const hp0 = e.hp; S.w.hit(e, 100, 0, 0, 0);
	A(near(e.takenK, 2.5, 0.01) && hp0 - e.hp === 250 && /EXHAUSTED ×2\.5/.test(hudLine(S)), `10 s past its 40 s target it is exhausted: a hit of 100 takes ${hp0 - e.hp}`, hudLine(S));
	// it falls
	drop(S.w, 'xp', a[0] + 30, a[1], a[2], 5);
	const says = []; slay(S); says.push(...S.says.map((q) => q.text));
	A(S.ph === 2 && !S.boss && S.bosses[0].down > 0 && says.some((q) => /portal/i.test(q)) && S.w.pickups.every((p) => p.pulled) && /PORTAL/.test(hudLine(S)), 'it falls: the portal opens on the altar and every pickup comes to you', [S.ph, says, hudLine(S)]);
	// the portal
	toSpawn(S); steps(S, 2);
	A(S.zone === 1 && S.portalT === 0, 'away from the portal nothing happens');
	const h1 = hashRoom(S.w.room), lvl = S.w.pl.level; S.w.pl.hp = 12345;
	toAltar(S); steps(S, 0.5); A(S.zone === 1, 'half a second in the portal is not enough');
	steps(S, 0.4);
	const t2 = S.w.t, sp = S.w.room.spawn;
	A(S.zone === 2 && S.ph === 0 && S.charge === 0 && near(S.zs, t2, 0.01) && near(S.splits[0], t2, 0.01), `0.8 s: zone 2, its clock at zero, the split kept (${S.splits[0].toFixed(1)} s)`, [S.zone, S.zs, S.splits]);
	A(hashRoom(S.w.room) !== h1 && S.w.enemies.length === 0 && S.w.pickups.length === 0 && S.w.hazards.length === 0 && near(S.w.pl.s.x, sp[0], 0.01) && near(S.w.pl.s.z, sp[2], 0.01), 'a new level, you where it starts, nothing of the old zone come along');
	A(S.w.pl.hp === 12345 && S.w.pl.level === lvl && S.plan.zone === 2 && S.plan.guardian !== undefined, 'you are carried over as you were (HP, level), and the plan is zone 2\'s');
	// the zone's floor
	stepRun(S, null);
	const e2 = spawn(S, S.plan.cards[0], sp[0] + 6, sp[2]), ti = e2.ti, def = data.defFor(S.plan.cards[0], ti);
	A(S.w.t < 60 && ti >= 2 && ti <= 4 && e2.maxHp === Math.round(def.hp * (1 + 240 / 95) * CK.HP_K(240)) && e2.xp === Math.round(def.xp * XKK.XP_K), `zone 2 a minute into the run: its enemies are as tough as four minutes in (tier ${ti}, ${e2.maxHp} HP)`, [S.w.t, ti, e2.maxHp]);
}

// ---------------------------------------------------------------- the trickle, the cap, the final swarm
{
	const S = run({ seed: 21 }); S.plan.events = [];
	steps(S, 55);
	const first = new Set(S.plan.cards.slice(0, XKK.CARDS0).concat(S.plan.wander)), seen = new Set(S.w.enemies.map((e) => e.dex));
	A(S.w.enemies.length > 10 && [...seen].every((d) => first.has(d)), `the first minute: only the zone's first four species (and a wanderer now and then) arrive (${S.w.enemies.length} of ${seen.size} species)`, [...seen]);
	S.w.enemies.length = 0; setZoneTime(S, 185); steps(S, 40);
	const upTo = new Set(S.plan.cards.slice(0, XKK.CARDS0 + 3).concat(S.plan.wander)), seen2 = new Set(S.w.enemies.map((e) => e.dex)), newer = [...seen2].filter((d) => !first.has(d));
	A([...seen2].every((d) => upTo.has(d)) && newer.length >= 1, `three minutes in: three more species have joined (${newer.length} of them seen)`, [...seen2]);
	A(capNow(S) === 110 && capNow(run({ touch: true })) === 80, 'the cap is 110 (80 on a phone)');
	setZoneTime(S, 599.5); steps(S, 0.4); A(!S.fs && /FINAL SWARM IN 0:01/.test(hudLine(S)), 'at 9:59.9 the swarm has not begun');
	steps(S, 0.3);
	A(S.fs && capNow(S) === 154 && /FINAL SWARM!/.test(hudLine(S)), 'at 10:00 the final swarm begins: the cap is 154');
	S.acc = 0; const t = S.w.t; S.w.enemies.length = 0; stepRun(S, null);
	A(near(S.acc + S.w.enemies.length, spawnRate(t + K.TICK) * XKK.FINAL_SPAWN * K.TICK, 0.05), `arrivals come ${XKK.FINAL_SPAWN} times as fast`, S.acc);
	const dex = S.plan.cards[0], a = spawn(S, dex, S.w.pl.s.x + 8, S.w.pl.s.z);
	setZoneTime(S, 660); const b = spawn(S, dex, S.w.pl.s.x + 8, S.w.pl.s.z);
	A(near(b.maxHp / a.maxHp, 4, 0.05) && near(b.dmg / a.dmg, 2, 0.05), `a minute into it they have ${(b.maxHp / a.maxHp).toFixed(2)} times the HP and ${(b.dmg / a.dmg).toFixed(2)} times the damage`);
	steps(S, 30);
	A(S.w.enemies.length <= 154 + 1 && S.w.enemies.length > 110, `and the zone fills to its raised cap, no further (${S.w.enemies.length})`);
}

// ---------------------------------------------------------------- the timeline
{
	const S = run({ seed: 33 }), evs = S.plan.events;
	steps(S, 1); setZoneTime(S, evs[0].at - 0.5); S.w.enemies.length = 0; steps(S, 0.3);
	A(S.log.length === 0, 'before its time an event has not fired');
	steps(S, 0.4);
	A(S.log.length === 1 && S.log[0].kind === evs[0].kind && near(S.log[0].zt, evs[0].at, 0.01), `at its time it fires, once (${evs[0].kind} at ${evs[0].at} s)`, S.log);
	setZoneTime(S, 590); steps(S, 0.1);
	A(S.log.length === evs.length && S.log.every((l, i) => l.kind === evs[i].kind && l.at === evs[i].at), `the clock jumped to 9:50: all ${evs.length} have fired, in the plan's order`);
	steps(S, 5);
	A(S.log.length === evs.length, '…and none fires twice');
	const kinds = new Set(evs.map((e) => e.kind));
	A(['alpha', 'swarm', 'stampede', 'flock', 'rockslide', 'elite', 'totem', 'summoner'].every((k) => kinds.has(k) || k === 'swarm' || k === 'stampede'), 'the zone\'s timeline has an alpha, a herd, a flock, a rock slide, elites, a totem and a summoner', [...kinds]);
}
{
	// each kind by itself, on a quiet zone
	const quiet = (seed = 5) => { const S = run({ seed }); S.plan.events = []; steps(S, 0.5); S.w.enemies.length = 0; S.acc = -1e9; return S; };
	const ev = (kind, o = {}) => ({ at: 0, kind, n: 1, dex: [16], seed: 99, ...o });
	const base = (S, dex, ti) => { const d = data.defFor(dex, ti); return Math.round(d.hp * (1 + S.w.t / 95) * CK.HP_K(S.w.t)); };
	{
		const S = quiet(), en = fire(S, ev('alpha', { dex: [19] })), e = S.w.enemies[0];
		A(en.spawned === 1 && e.xk === 'alpha' && e.scale === XKK.ALPHA.scale && near(e.maxHp, base(S, 19, e.ti) * XKK.ALPHA.hp, 0.01) && e.xp === Math.round(e.def.xp * XKK.XP_K * XKK.ALPHA.xp) && S.says.length === 1, `an alpha: ${XKK.ALPHA.hp} times the HP, ${XKK.ALPHA.scale} times the size, ${XKK.ALPHA.xp} times the XP`, [e.maxHp, base(S, 19, e.ti)]);
		S.w.hit(e, e.hp + 1, 0, 0, 0); steps(S, 0.05);
		A(e.dead && S.cap.faint.length === 1 && !S.w.pickups.some((p) => p.kind === 'heal') && S.specials.size === 0, 'beaten, it faints where it stands (capture: micasurvivor_m3d_expcap_test.mjs)');
		S.acc = -1e9; steps(S, 8.1);
		A(S.w.pickups.some((p) => p.kind === 'heal') && S.w.pickups.some((p) => p.kind === 'item') && S.cap.faint.length === 0, 'left alone for 8 s, it comes round and leaves its prize: an item and a berry');
	}
	{
		const S = quiet(), en = fire(S, ev('elite', { n: 5, dex: [19, 16] })), L = S.w.enemies;
		A(en.spawned >= 4 && L.every((e) => e.xk === 'elite' && e.scale === XKK.ELITE.scale) && near(L[0].maxHp, base(S, L[0].dex, L[0].ti) * XKK.ELITE.hp, 0.01), `an elite wave: ${en.spawned} of 5 found room, each ${XKK.ELITE.hp} times the HP`);
	}
	{
		const S = quiet(), en = fire(S, ev('swarm', { n: 30, dex: [19, 16] })), s = S.w.pl.s, ds = S.w.enemies.map((e) => Math.hypot(e.a.x - s.x, e.a.z - s.z));
		const angs = new Set(S.w.enemies.map((e) => Math.floor((Math.atan2(e.a.z - s.z, e.a.x - s.x) + Math.PI) / (Math.PI / 2))));
		A(en.spawned >= 15 && Math.max(...ds) <= XK.SWARM[0] + XK.SWARM[1] + 0.01 && Math.min(...ds) >= XK.SWARM[0] - 0.01 && angs.size >= 3, `a swarm: ${en.spawned} of 30 in a ring ${XK.SWARM[0]}-${XK.SWARM[0] + XK.SWARM[1]} m round you`, [Math.min(...ds), Math.max(...ds), angs.size]);
	}
	{
		let S, en; for (let k = 1; k < 30; k++) { S = quiet(); en = fire(S, ev('stampede', { n: 20, dex: [19], seed: k })); if (en.spawned >= 14) break; }   // (a herd needs room behind you: a direction with some)
		const L = S.w.enemies.slice(), r0 = L[0].run, at0 = L.map((e) => [e.a.x, e.a.z]);
		steps(S, 1);
		const along = L.map((e, i) => (e.a.x - at0[i][0]) * r0.dx + (e.a.z - at0[i][1]) * r0.dz), ran = along.filter((d) => d > XKK.STAMPEDE_SPD * U * 0.6).length;
		A(en.spawned >= 8 && L.every((e) => e.dead || e.run === null || (e.run.dx === r0.dx && e.run.dz === r0.dz)) && ran >= L.length * 0.4, `a stampede: ${en.spawned} of 20 start behind you and run one way at ${(XKK.STAMPEDE_SPD * U).toFixed(1)} m/s (${ran} of them have a clear run)`, along.map((d) => +d.toFixed(1)));
		steps(S, 8);
		A(L.every((e) => e.dead || !e.run), 'when the run is over (or a wall ends it) they are ordinary enemies again');
	}
	{
		let S, en; for (let k = 1; k < 30; k++) { S = quiet(); en = fire(S, ev('flock', { n: 12, dex: [19], seed: k })); if (en.spawned >= 10) break; }
		const L = S.w.enemies.slice(), z0 = L.map((e) => [e.a.x, e.a.z]);
		steps(S, 1);
		const moved = L.map((e, i) => Math.hypot(e.a.x - z0[i][0], e.a.z - z0[i][1]));
		A(en.spawned >= 10 && L.every((e) => e.fly && e.a.fly) && moved.every((d) => near(d, XKK.FLOCK_SPD * U, 0.12)), `a flock: ${en.spawned} of 12, in the air (even a species that walks), crossing over everything at ${(XKK.FLOCK_SPD * U).toFixed(1)} m/s`, moved);
	}
	{
		const S = quiet(); S.w.pl.maxHp = S.w.pl.hp = 5000;
		const en = fire(S, ev('rockslide', { n: XKK.ROCKS })), H = S.w.hazards, s = S.w.pl.s, close = H.filter((h) => Math.hypot(h.x - s.x, h.z - s.z) <= 60 * U + 0.01).length;
		const dmg = Math.round(data.tiers[data.tierAt(S.w.t)].dmg * 1.6 * (1 + S.w.t / 420) * XKK.DMG_K);
		A(en.spawned === H.length && H.length >= 10 && close >= 4 && H.every((h) => h.kind === 'zone' && near(h.r, XKK.ROCK_R * U) && h.dmg === dmg && h.delay >= 1.1 && h.delay <= 2.71 && h.y === groundAt(S.w.room, h.x, h.z)), `a rock slide: ${H.length} marks on the ground, four of them about you, ${dmg} each, landing 1.1-2.7 s on`, [H.length, close]);
		steps(S, 3.2);
		A(S.w.hazards.length === 0, 'and then they are gone');
	}
	{
		const S = quiet(), en = fire(S, ev('totem', { dex: [14] })), e = S.w.enemies[0]; e.dummy = true;
		steps(S, XKK.TOTEM.every - 0.2); const before = S.w.enemies.length; steps(S, 0.4);
		const called = S.w.enemies.length - before;
		A(en.spawned === 1 && e.xk === 'totem' && before === 1 && called >= 1 && called <= XKK.TOTEM.calls, `a totem: every ${XKK.TOTEM.every} s it calls ${XKK.TOTEM.calls} allies to its side (${called} found floor)`, [before, called]);
		const L = S.w.enemies.slice(1), dmax = Math.max(...L.map((o) => Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z)));
		A(dmax <= e.cr + XK.TOTEM_R * U + 0.5, `…right beside it (${dmax.toFixed(1)} m)`);
	}
	{
		const S = quiet(), en = fire(S, ev('summoner', { dex: [15] })), e = S.w.enemies[0], at = [e.a.x, e.a.z];
		steps(S, 12);
		const minions = S.w.enemies.filter((o) => o.minion);
		A(en.spawned === 1 && e.behavior === 'summoner' && e.def.minion === 13 && near(e.a.x, at[0], 0.01) && near(e.a.z, at[1], 0.01) && minions.length >= 4 && minions.every((m) => m.dex === 13), `a summoner: rooted where it appeared, calling its own kind (${minions.length} Weedle from a Beedrill)`, [e.behavior, e.def.minion, minions.length]);
		const picks = S.w.pickups.length; steps(S, XKK.SUMMONER.life - 12 + 0.3);
		A(!S.w.enemies.includes(e) && S.specials.size === 0 && S.w.pickups.length === picks && S.w.stats.kills === 0, `after ${XKK.SUMMONER.life} s it leaves, and leaves nothing`);
	}
	{
		const S = quiet(), en = fire(S, ev('roam', { dex: [144] })), e = S.w.enemies[0];
		steps(S, XKK.ROAM.life + 0.3);
		A(en.spawned === 1 && e.xk === 'roam' && !S.w.enemies.includes(e), `a roaming legendary: ${XKK.ROAM.hp} times the HP, and it moves on after ${XKK.ROAM.life} s`);
	}
}

// ---------------------------------------------------------------- the tiers
{
	const mk = (diff) => { const S = run({ seed: 9, diff }); S.plan.events = []; steps(S, 0.5); S.w.enemies.length = 0; S.acc = -1e9; return S; };
	const N = mk('normal'), H = mk('hard'), M = mk('nightmare'), dex = N.plan.cards[0];
	const one = (S) => spawn(S, dex, S.w.pl.s.x + 8, S.w.pl.s.z), n = one(N), h = one(H), m = one(M), TH = X.tier('hard'), TM = X.tier('nightmare');
	A(near(h.maxHp / n.maxHp, TH.hp, 0.02) && near(h.dmg / n.dmg, TH.dmg, 0.001) && near(h.a.speed / n.a.speed, TH.spd, 0.001) && near(h.xp / n.xp, TH.xp, 0.1), `Hard: enemies have ${TH.hp} times the HP, ${TH.dmg} the damage, ${TH.spd} the speed, ${TH.xp} the XP`, [h.maxHp / n.maxHp, h.dmg / n.dmg, h.a.speed / n.a.speed, h.xp / n.xp]);
	A(near(m.maxHp / n.maxHp, TM.hp, 0.02) && near(m.dmg / n.dmg, TM.dmg, 0.001) && near(m.a.speed / n.a.speed, TM.spd, 0.001), `Nightmare: ${TM.hp}, ${TM.dmg}, ${TM.spd}`);
	A(capNow(N) === 110 && capNow(H) === Math.round(110 * TH.cap) && capNow(M) === Math.round(110 * TM.cap), `the cap: 110, ${capNow(H)}, ${capNow(M)}`);
	const wakeIt = (S) => { S.w.enemies.length = 0; toAltar(S); steps(S, XKK.ALTAR_T + 0.1); return S.w.enemies.filter((e) => e.xescort); };
	const en = wakeIt(N), eh = wakeIt(H), em = wakeIt(M);
	A(en.length === 0 && eh.length === 1 && em.length === 2 && em.every((e) => e.xk === 'elite' && e.scale === X.ESCORT.scale), 'a guardian\'s escorts: none, one, two elites');
	A(near(H.boss.dmg / N.boss.dmg, TH.dmg, 0.03) && H.boss.maxHp === N.boss.maxHp && /HARD/.test(hudLine(H)) && !/NORMAL/.test(hudLine(N)), 'the guardian hits harder on Hard (its HP follows your damage instead); the HUD names the tier');
	const pn = X.plan(9, 'viridian', 1, 'normal'), pm = X.plan(9, 'viridian', 1, 'nightmare');
	A(pm.events[0].at === pn.events[0].at - TM.early && M.plan.events !== undefined, `Nightmare's events come ${TM.early} s earlier`);
}

// ---------------------------------------------------------------- a whole run
{
	const S = run({ seed: 77 }); S.plan.events = [];
	const guardians = [];
	for (let z = 1; z <= 3; z++) { steps(S, 2); guardians.push(S.plan.guardian); S.plan.events = []; clearZone(S); S.plan.events = []; }
	A(S.zone === 4 && S.w.room.shrine && S.ph === 0 && S.splits.length === 3 && /SHRINE · ALTAR/.test(hudLine(S)), 'three guardians down: the third portal leads to the shrine (' + hudLine(S) + ')');
	steps(S, 5);
	A(S.w.enemies.length === 0 && !S.fs, 'the shrine is quiet: nothing arrives, no final swarm');
	// walk there: up the stairs to the pedestal
	const a = S.w.room.altar; let walked = 0;
	while (walked < 60 * 30 && !(S.ph === 3)) { const s = S.w.pl.s, dx = a[0] - s.x, dz = a[2] - s.z, l = Math.hypot(dx, dz) || 1; stepRun(S, { mx: l > 0.3 ? dx / l : 0, mz: l > 0.3 ? dz / l : 0, jump: false, crouch: false }); walked++; }
	const L = S.boss;
	A(S.ph === 3 && L && L.dex === S.plan.legend && L.xk === 'legend' && near(S.w.pl.s.y, LEVEL, 0.05) && /LEGENDARY/.test(hudLine(S)), `walked up the stairs to the pedestal (${(walked / 60).toFixed(1)} s): ${data.mon(S.plan.legend).name} appears`, [S.ph, S.w.pl.s.y, walked]);
	A(L.maxHp === Math.round(XKK.LEGEND_HP * (1 + S.bosses[3].at / 600)) && S.bosses[3].target === XKK.LEGEND_TARGET, `its HP is the legendary's curve (${L.maxHp})`);
	steps(S, 20);
	A(S.w.stats.spawned > 4 + 2, 'now the shrine has arrivals too (at half the pace)');
	slay(S);
	A(S.ph === 4 && S.won && !S.ended && S.splits.length === 4 && /COMPLETE!/.test(hudLine(S)) && S.says.some((q) => /COMPLETE/.test(q.text)), 'it falls: the expedition is complete, four splits');
	const spawned = S.w.stats.spawned; steps(S, XKK.WIN_T - 0.2);
	A(!S.ended && S.w.stats.spawned === spawned, 'for 3 s the banner holds (nothing more arrives)');
	steps(S, 0.4);
	const R = result(S), parts = { kills: S.w.stats.kills, time: Math.floor(S.w.t), dmg: Math.round(S.w.stats.dealt), zone: 4, bosses: 4, won: true, catches: 0 };
	A(S.ended && R.won && R.title === 'EXPEDITION COMPLETE!' && R.line === 'Map complete!' && R.score === G.ExpTier.score(parts, 'normal') && R.score > 6000 + 4 * 800 + 3 * 1500 && R.bosses.length === 4 && R.bosses.map((b) => b.dex).join() === guardians.concat(S.plan.legend).join(), `then the run is over: ${R.title} ${R.line} score ${R.score} (the 2D game's formula)`, R);
	const t = S.w.t; steps(S, 1);
	A(S.w.t === t, 'an ended run does not move');
}
{
	const S = run({ seed: 3, mortal: true }); S.plan.events = [];
	steps(S, 3); S.w.pl.hp = 0; S.w.pl.dead = true; stepRun(S, null);
	const R = result(S);
	A(S.ended && S.lost && !S.won && R.line === 'Reached zone 1' && R.score === G.ExpTier.score({ kills: 0, time: 3, dmg: 0, zone: 1, bosses: 0, won: false, catches: 0 }, 'normal'), 'down alone: the run is over, lost (' + R.line + ')', R);
}
{
	const S = run({ seed: 3, moves: [['ember', 3]] }); S.plan.events = [];
	steps(S, 40);
	const cz = run({ seed: 3 }); clearZone(cz); clearZone(cz);
	A(S.w.stats.dealt > 0 && S.dps.length > 5 && result(cz).line === 'Reached zone 3', 'your damage is sampled once a second for the guardians\' HP; a run that stops in zone 3 says so');
	S.dps = [[S.w.t - 10, 0], [S.w.t, 20000]]; S.w.stats.dealt = 20000; toAltar(S); steps(S, XKK.ALTAR_T + 0.1);
	const b = S.bosses[0];
	A(S.boss && b.fromDps > b.curve && S.boss.maxHp === b.fromDps && near(b.fromDps, b.dps * 40 * 0.5, 0.02), `a strong team's guardian: HP from your damage (${b.dps}/s x 40 s x 0.5 = ${b.fromDps}, over the curve's ${b.curve})`, b);
}

// ---------------------------------------------------------------- the same seed, the same run
{
	const play = (seed) => { const S = run({ seed, moves: [['ember', 2]] }); setZoneTime(S, 140); for (let i = 0; i < 60 * 25; i++) stepRun(S, { mx: Math.sin(i / 50), mz: Math.cos(i / 80), jump: i % 90 === 0, crouch: false }); return hashWorld(S.w) + ':' + S.log.length + ':' + S.w.stats.spawned; };
	const a = play(5), b = play(5), c = play(6);
	A(a === b && a !== c, 'the same seed and inputs give the same run to the last number; another seed another run', [a, b, c]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
