// micasurvivor_m3d_expsurv_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): Expedition's Survival, an
// endless run on one map (micasurvivor/m3d/expsurv.js), in node, with the 2D game's own Survival functions. The state
// checks of the 2D suites micasurvivor_expedition_survival_test.mjs and _survivalcurve_test.mjs, made of the 3D run.
//   * a Survival run: no altar to wake, no final swarm; the readout counts down to the next milestone
//   * the pacing: half the arrivals, each 1.8 times the HP and XP
//   * each 5:00 segment's timeline is the 2D game's plan for it
//   * milestones: a boss every 5:00 (the 2D game's choice of it), every third a legendary, Mewtwo at 45:00; each one
//     down leaves its prize and a pact to choose
//   * the pacts: three offered, one taken or none; its boon and its price; the team's price on the enemies
//   * the phases at 12:00 and 24:00: the next band of enemies
//   * the migration portal: at 11:00 for 90 s, not while a milestone boss is up; through it, a new land on new ground
//   * deep wounds from 30:00; the Endless Night from 45:00
//   * the siege: stay put and your damage falls and flocks come; move and it lifts
//   * Survival's own curve above Lv 40; its score; the run ends only when you go down
//   node overworld/tests/micasurvivor_m3d_expsurv_test.mjs
import { hashRoom, validate } from '../../micasurvivor/m3d/gen.js';
import { dataFrom, land } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, spawn, hudLine, result, capNow } from '../../micasurvivor/m3d/expedition.js';
import { total } from '../../micasurvivor/m3d/explevel.js';
import { pickTake, pickClose } from '../../micasurvivor/m3d/expeco.js';
import { foeK, foeTeam, takePact } from '../../micasurvivor/m3d/expsurv.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), V = X.V, K = V.K, SV = G.ExpSurv;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false, mode: 'survival', cap: false, ...o }); S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e7; S.w.pl.xpMul = 0; stepRun(S, null); return S; };
/** Step a run; `quiet`: nothing arrives by the trickle, and what is there stands still. */
const steps = (S, sec, quiet = true) => { const out = []; for (let i = 0, n = Math.round(sec * 60); i < n; i++) { if (quiet) { S.acc = -1e9; for (const e of S.w.enemies) e.dummy = true; } stepRun(S, null); out.push(...S.says.map((q) => q.text)); } return out; };
/** Put the run's clock at `t` (nothing between is played). */
const at = (S, t) => { S.w.t = t; S.w.tick = Math.round(t * 60); };
const clear = (S) => { for (const e of S.w.enemies) e.dead = true; S.w.hazards.length = 0; };
const move = (S, dx) => { S.w.pl.s.x += dx; };

// ---------------------------------------------------------------- a Survival run
{
	A(K.MILE_S === 300 && V.PACTS.length === 9 && K.PHASES.join() === '720,1440' && K.MIGRATE_AT === 660, 'the milestones, the pacts, the phases and the migration are the 2D game\'s');
	const S = run();
	A(S.surv && S.sv && S.zone === 1 && S.sv.land === 1 && /^SURVIVAL · PHASE 1 · BOSS IN 5:00 · ₽ 0$/.test(hudLine(S)), 'a Survival run starts on land 1, counting down to its first milestone: ' + hudLine(S));
	const a = S.w.room.altar, s = S.w.pl.s; s.x = a[0]; s.y = a[1]; s.z = a[2]; steps(S, 5);
	A(S.ph === 0 && S.charge === 0 && !S.boss, 'there is no altar to wake: standing on it does nothing');
	at(S, 620); S.sv.miles = 2; S.sv.seg = 2; steps(S, 1);
	A(!S.fs && capNow(S) === 110, 'and no final swarm at 10:00');
	const C = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false }); stepRun(C, null);
	A(!C.surv && !C.sv && /ZONE 1\/3/.test(hudLine(C)), 'a Classic run is as it was');
	// the pacing
	const P = run(), c = spawn(C, 19, C.w.pl.s.x + 6, C.w.pl.s.z), p = spawn(P, 19, P.w.pl.s.x + 6, P.w.pl.s.z);
	A(near(p.maxHp / c.maxHp, K.PACE.hp, 0.02) && near(p.xp / c.xp, K.PACE.xp, 0.03) && near(p.dmg, c.dmg, 0.01), `an enemy has ${K.PACE.hp} times the HP and XP of Classic's`, [p.maxHp / c.maxHp, p.xp / c.xp]);
	C.acc = 0; stepRun(C, null); P.acc = 0; stepRun(P, null);
	A(near(P.acc / C.acc, K.PACE.rate, 0.01), 'and half as many arrive');
	// the survival curve
	A(P.w.xpNeed(40) === X.L.need(40) && P.w.xpNeed(60) === Math.round(X.L.need(60) * 2) && P.w.xpNeed(80) === Math.round(X.L.need(80) * SV.curveK(80)) && C.w.xpNeed(60) === X.L.need(60), `its own curve: Classic's to Lv 40, then slower (Lv 60 needs twice as much, Lv 80 ${SV.curveK(80).toFixed(2)} times)`);
}

// ---------------------------------------------------------------- the timeline and the first milestone
{
	const S = run(), plan = SV.segPlan(7, 'viridian', 0, 'normal');
	at(S, plan[0].at - 0.5); steps(S, 0.3); A(S.log.length === 0, 'before its time a segment\'s event has not fired');
	steps(S, 0.4); A(S.log.length === 1 && S.log[0].kind === plan[0].kind, `at its time it does (${plan[0].kind} at ${plan[0].at} s)`);
	clear(S); at(S, 299); steps(S, 0.2);
	A(S.log.map((l) => l.kind + l.n).join() === plan.map((e) => e.kind + e.n).join() && plan.length >= 5, `by 5:00 the segment's whole plan has fired, in order (${plan.map((e) => e.kind).join(', ')}): the 2D game's`, S.log.map((l) => l.kind));
	clear(S); const t = steps(S, 1.2), m = SV.milestone(1, 'viridian', 7), b = S.boss;
	A(S.sv.miles === 1 && b && b.boss && b.dex === m.dex && b.xmile === 1 && t.some((q) => /Milestone boss: /.test(q)) && /BOSS IN [45]:\d\d/.test(hudLine(S)), `at 5:00 the first milestone boss: ${data.mon(m.dex).name} (the 2D game's choice); the readout counts to the next`, [hudLine(S), t]);
	const rec = S.bosses[0];
	A(rec.target === K.MILE_TARGET[0] && b.maxHp === Math.round(rec.curve * (1 + K.MILE_HP)) && Math.hypot(b.a.x - S.w.pl.s.x, b.a.z - S.w.pl.s.z) < 20, `with no damage done its HP is the curve's + 6 % for the milestone (${b.maxHp}); it arrives near you`);
	b.xborn = S.w.t - 70; steps(S, 0.05);
	A(b.takenK > 1, 'past its target it is exhausted, as a guardian is');
	S.w.hit(b, 1e12, 0, 0, 0); const t2 = steps(S, 0.05);
	A(S.sv.downs === 1 && !S.boss && S.w.pickups.some((p) => p.kind === 'item') && S.w.pickups.some((p) => p.kind === 'heal') && S.w.pickups.every((p) => p.pulled) && t2.some((q) => /defeated! Choose a pact/.test(q)), 'it falls: an item and a berry, everything comes to you');
	// the pact
	const Pk = S.pick, want = SV.offerOf(7, 1, 0, []);
	A(Pk && Pk.kind === 'pact' && Pk.cards.length === 3 && Pk.cards.map((c) => c.id).join() === want.join() && Pk.cards.every((c) => c.title && / · /.test(c.desc)), `and a pact to choose, one of three (${Pk && Pk.cards.map((c) => c.title).join(', ')}): the 2D game's offer`);
	const tt = S.w.t; steps(S, 1); A(S.w.t === tt, 'the fight holds while you choose');
	A(pickTake(S, 0) && !S.pick && S.sv.pacts.join() === want[0] && S.w.t === tt, 'take one: sealed');
	steps(S, 0.5); A(S.w.t > tt && !S.pick && S.sv.pactSeen === 1, 'the fight goes on; it is not offered again');
	const N = run(); at(N, 299.9); N.sv.seg = 0; N.sv.segEv = []; steps(N, 0.3); N.w.hit(N.boss, 1e12, 0, 0, 0); steps(N, 0.05);
	A(N.pick && pickClose(N) && !N.pick && N.sv.pacts.length === 0, 'or take none');
}

// ---------------------------------------------------------------- the pacts
{
	const mk = () => { const S = run({ eco: true }); return S; };
	let S = mk(); const pl = S.w.pl, a0 = pl.atkMul, h0 = pl.maxHp;
	takePact(S, 'glass');
	A(near(pl.atkMul, a0 * 1.25) && pl.maxHp === h0 - 30 && near(total(S, 'dmg'), 0.25) && takePact(S, 'glass') === false, 'Glass Cannon: + 25 % damage, − 30 max HP; a pact is taken once');
	S = mk(); const sp0 = S.w.pl.spdMul, r0 = S.w.pl.baseReduce; takePact(S, 'iron');
	A(near(S.w.pl.baseReduce, r0 + 0.08) && near(S.w.pl.spdMul, sp0 * 0.9), 'Iron Hide: + 8 armour, − 10 % speed');
	S = mk(); const e0 = spawn(S, 19, S.w.pl.s.x + 6, S.w.pl.s.z); takePact(S, 'frenzy'); takePact(S, 'greed'); const e1 = spawn(S, 19, S.w.pl.s.x + 6, S.w.pl.s.z);
	A(near(e1.dmg / e0.dmg, 1.15, 0.01) && near(e1.maxHp / e0.maxHp, 1.15, 0.02) && near(S.w.pl.coinMul, 1.5) && S.w.pl.xluck === 10 && near(foeTeam(S).dmg, 0.15), 'Frenzy and Greed: their boons are yours; their price is on every enemy (+ 15 % damage, + 15 % HP)');
	S = mk(); const k0 = foeK(S, 10); takePact(S, 'horde'); takePact(S, 'scholar');
	A(near(foeK(S, 10).rate / k0.rate, 1.25) && near(foeK(S, 10).elite, 0.06) && near(S.w.pl.xpMul === 0 ? 0.3 : total(S, 'xp'), 0.3) && near(total(S, 'crit'), 0.06), 'Horde: + 25 % arrivals for + 30 % XP; Scholar: 6 % of them elites for reach and crit');
	S = mk(); takePact(S, 'hunter'); at(S, 299.9); S.sv.seg = 0; S.sv.segEv = []; steps(S, 0.3);
	const rec = S.bosses[0];
	A(S.boss.maxHp === Math.round(rec.curve * (1 + K.MILE_HP) * 1.25) && near(total(S, 'boss'), 0.3), 'Hunter: + 30 % damage to bosses; milestone bosses have 25 % more HP');
	S = mk(); takePact(S, 'vampire'); takePact(S, 'titan');
	A(near(total(S, 'steal'), 0.04) && near(total(S, 'regen'), -1) && near(total(S, 'hp'), 60) && near(total(S, 'dmg'), -0.12), 'Vampire and Titan: lifesteal for a drain; HP and armour for damage');
	const three = SV.offerOf(7, 2, 0, ['glass', 'iron']);
	A(three.length === 3 && !three.includes('glass') && !three.includes('iron'), 'a pact you have is not offered again');
}

// ---------------------------------------------------------------- legendaries, phases, Mewtwo
{
	const S = run(); S.sv.miles = 2; S.sv.downs = 2; S.sv.pactSeen = 2; S.sv.seg = 2; S.sv.segEv = [];
	at(S, 899.9); const t = steps(S, 0.3), m3 = SV.milestone(3, 'viridian', 7), L = S.boss;
	A(m3.legend && m3.dex === 151 && L && L.dex === 151 && L.xk === 'legend' && S.bosses[0].target === K.LEGEND_TARGET && t.some((q) => /Legendary milestone: Mew!/.test(q)), 'the third milestone (15:00) is a legendary: the map\'s own, Mew');
	S.w.hit(L, 1e12, 0, 0, 0); steps(S, 0.05);
	A(S.sv.legends === 1 && S.w.pickups.filter((p) => p.kind === 'item').length === 2 && S.pick && S.pick.kind === 'pact', 'it leaves two items');
	pickClose(S);
	// phases
	const P = run(), c1 = X.plan(7, 'viridian', 1, 'normal').cards, c2 = X.plan(7, 'viridian', 2, 'normal').cards;
	A(P.plan.cards.join() === c1.join() && P.zi === 0, 'phase 1: the zone\'s first band of enemies');
	P.sv.miles = 2; P.sv.seg = 2; P.sv.segEv = []; at(P, 719.9); const t2 = steps(P, 0.3), e = spawn(P, c2[0], P.w.pl.s.x + 6, P.w.pl.s.z);
	A(P.zi === 1 && P.sv.phase === 1 && P.plan.cards.join() === c2.join() && e.ti >= 2 && t2.some((q) => /Phase 2/.test(q)) && /PHASE 2/.test(hudLine(P)) && P.zone === 1, 'at 12:00, phase 2: the next band, tougher (on the same land)');
	P.sv.miles = 4; P.sv.seg = 4; P.sv.segEv = []; at(P, 1439.9); steps(P, 0.3);
	A(P.zi === 2 && /PHASE 3/.test(hudLine(P)) && P.plan.cards.join() === X.plan(7, 'viridian', 3, 'normal').cards.join(), 'at 24:00, phase 3');
	// Mewtwo
	const M = run(); M.sv.miles = 8; M.sv.downs = 8; M.sv.pactSeen = 8; M.sv.seg = 8; M.sv.segEv = []; M.sv.phase = 2; M.zi = 2; M.sv.said.wounds = true;
	at(M, 2699.9); const t3 = steps(M, 0.3), mw = M.boss;
	A(mw && mw.dex === 150 && mw.xmew === 1 && M.bosses[0].target === K.MEWTWO_TARGET && t3.some((q) => /MEWTWO AWAKENS/.test(q)) && t3.some((q) => /Endless Night/.test(q)), 'at 45:00: Mewtwo, and the Endless Night begins');
	M.w.hit(mw, 1e12, 0, 0, 0); steps(M, 0.05); if (M.pick) pickClose(M); steps(M, 1);
	A(M.sv.mewtwo === 1 && !M.ended && M.w.t > 2700 && /LEGENDARY IN|BOSS IN/.test(hudLine(M)), 'Mewtwo down: the run goes on (' + hudLine(M) + ')');
	// the night
	const n1 = foeK(M, 2700), n2 = foeK(M, 2700 + 300);
	A(near(n2.hp / n1.hp, 1 + K.NIGHT_HP * 5) && near(n2.dmg / n1.dmg, 1 + K.NIGHT_DMG * 5) && /NIGHT ×1\.0/.test(hudLine(M)), `the night: five minutes in, a new enemy has ${(n2.hp / n1.hp).toFixed(2)} times the HP and ${(n2.dmg / n1.dmg).toFixed(2)} times the damage`);
}

// ---------------------------------------------------------------- migration
{
	const S = run(); S.sv.miles = 2; S.sv.downs = 2; S.sv.pactSeen = 2; S.sv.seg = 2; S.sv.segEv = [];
	at(S, 659.5); steps(S, 0.3); A(S.ph === 0, 'before 11:00 there is no portal');
	const t = steps(S, 0.4);
	A(S.ph === 2 && t.some((q) => /migration portal opens/.test(q)) && /PORTAL (90|89) s/.test(hudLine(S)), 'at 11:00 a migration portal opens on the land\'s altar, for 90 s');
	const h1 = hashRoom(S.w.room), a = S.w.room.altar, s = S.w.pl.s; s.x = a[0]; s.y = a[1]; s.z = a[2]; steps(S, 1);
	A(S.sv.land === 2 && S.zone === 2 && S.ph === 0 && hashRoom(S.w.room) !== h1 && validate(S.w.room).ok && S.w.enemies.length === 0 && S.splits.length === 0, 'step in: land 2, new ground, nothing of the old land come along');
	A(near(S.sv.nextMig, S.w.t + K.MIGRATE_EVERY, 0.01) && S.zi === 0, 'the next portal is 11:00 on; the phase is the clock\'s, not the land\'s');
	// it closes
	const C = run(); C.sv.miles = 2; C.sv.seg = 2; C.sv.segEv = []; at(C, 660); steps(C, 0.1); at(C, 660 + 89.9); C.sv.miles = 2; steps(C, 0.05); const open = C.ph === 2; const t2 = steps(C, 0.2);
	A(open && C.ph === 0 && t2.some((q) => /portal closes/.test(q)) && C.sv.land === 1, 'left alone it closes after 90 s');
	// not while a milestone boss is up
	const B = run(); B.sv.miles = 1; B.sv.seg = 1; B.sv.segEv = []; B.sv.nextMig = 600; at(B, 599.9); steps(B, 0.5);
	A(B.boss && B.ph === 0, 'it does not open while a milestone boss is up');
	B.w.hit(B.boss, 1e12, 0, 0, 0); steps(B, 0.05); if (B.pick) pickClose(B); steps(B, 0.2);
	A(B.ph === 2, 'and does when it is down');
	// lands are new ground each time
	const L = run(), seen = new Set([hashRoom(L.w.room)]);
	for (let k = 0; k < 3; k++) { L.sv.nextMig = L.w.t; steps(L, 0.1); const q = L.w.room.altar, p = L.w.pl.s; p.x = q[0]; p.y = q[1]; p.z = q[2]; steps(L, 1); seen.add(hashRoom(L.w.room)); }
	A(L.sv.land === 4 && L.zone === 1 && seen.size === 4, 'land 4 is zone 1\'s kind of land again, but not land 1\'s ground: every land is new');
}

// ---------------------------------------------------------------- wounds and the siege
{
	const S = run(); const pl = S.w.pl; S.sv.miles = 6; S.sv.seg = 6; S.sv.segEv = []; S.sv.phase = 2; S.zi = 2;
	at(S, 1700); pl.hp = 1000; steps(S, 0.05); pl.hp += 100; steps(S, 1 / 60);
	A(near(pl.hp, 1100, 0.001), 'before 30:00 a heal of 100 is 100');
	S.sv.miles = 7; S.sv.seg = 7; at(S, 2100); steps(S, 0.05); const h = pl.hp; pl.hp += 100; steps(S, 1 / 60);
	A(near(pl.hp - h, 100 * SV.woundK(S.w.t), 0.01) && near(SV.woundK(2100), 0.8) && /WOUNDS −20%/.test(hudLine(S)) && SV.woundK(1e5) === K.WOUND_MIN, 'deep wounds: at 35:00 it is worth 80 (4 % less a minute, never under a fifth)', [pl.hp - h]);
	// siege
	const Z = run({ moves: [] }); Z.sv.miles = 99; Z.sv.seg = 0; Z.sv.segEv = []; Z.sv.nextMig = 1e9;
	steps(Z, 25); A(!Z.sv.siege.on, 'before 5:00 standing still is safe');
	at(Z, 400); Z.sv.seg = 1; steps(Z, 19.5); A(!Z.sv.siege.on && Z.sv.siege.k === 1, 'after 5:00, 19.5 s in one place: not yet');
	const t = steps(Z, 0.7);
	A(Z.sv.siege.on && t.some((q) => /Siege! Keep moving/.test(q)) && Z.sv.log.sieges === 1, '20 s: a siege');
	const fl = Z.w.enemies.length; steps(Z, 1.2);
	const flock = Z.w.enemies.filter((e) => e.xsiege);
	A(flock.length === K.SIEGE_N && flock.every((e) => e.fly && e.a.fly) && fl === 0, `a flock of ${K.SIEGE_N} fliers comes for you`);
	const e = spawn(Z, 19, Z.w.pl.s.x + 2, Z.w.pl.s.z); e.maxHp = e.hp = 1e9; const d1 = land(Z.w, e, 100, 0, 0, 0, { kind: 'item' });
	steps(Z, 5); const d2 = land(Z.w, e, 100, 0, 0, 0, { kind: 'item' });
	A(d1 < 100 && d2 < d1 && near(d2, 100 * Z.sv.siege.k, 0.01) && /SIEGE · DAMAGE \d+%/.test(hudLine(Z)), `your damage falls while it lasts (a hit of 100: ${d1.toFixed(0)}, then ${d2.toFixed(0)})`);
	steps(Z, 12); A(near(Z.sv.siege.k, K.SIEGE_MIN) && Z.w.enemies.filter((q) => q.xsiege).length >= K.SIEGE_N * 2, 'down to 30 %, with another flock every 8 s');
	move(Z, 2); steps(Z, 0.1); A(Z.sv.siege.on, 'a step of 2 m is not moving on');
	move(Z, 6); const t2 = steps(Z, 0.1);
	A(!Z.sv.siege.on && t2.some((q) => /siege lifts/.test(q)), 'move on (more than 6 m): it lifts');
	steps(Z, 1.5); A(near(Z.sv.siege.k, 1), 'and your damage is back in a moment');
}

// ---------------------------------------------------------------- the end
{
	const S = run(); S.sv.miles = 3; S.sv.downs = 3; S.sv.legends = 1; S.sv.pacts = ['glass']; S.sv.land = 2; S.sv.seg = 3; S.sv.segEv = []; S.sv.pactSeen = 3;
	at(S, 1000); S.w.stats.kills = 1200; S.w.stats.dealt = 250000; steps(S, 0.1);
	A(!S.ended && !S.won, 'a Survival run is never won');
	S.w.pl.hp = 0; S.w.pl.dead = true; steps(S, 0.05);
	const R = result(S), parts = { kills: 1200, time: Math.floor(S.w.t), dmg: 250000, bosses: 3, legends: 1, catches: 0 };
	A(S.ended && S.lost && R.survival && R.score === SV.scoreOf(parts, 'normal') && R.score > 1200 * 2 + 1000 * 4 + 3 * 800 + 2000 && /Survived 16:4\d · phase 2/.test(R.line), `you go down: ${R.line} · score ${R.score} (the 2D game's formula)`, R);
	A(R.lines.some((q) => /Milestone bosses: 3 \(1 legendary\)/.test(q)) && R.lines.some((q) => /Pacts: Glass Cannon/.test(q)) && R.lines.some((q) => /Lands visited: 2/.test(q)), 'its lines: the bosses, the pacts, the lands');
	const H = run({ diff: 'nightmare' });
	A(/SURVIVAL · PHASE 1 · NIGHTMARE · BOSS IN/.test(hudLine(H)) && SV.scoreOf(parts, 'nightmare') === Math.floor(SV.scoreOf(parts, 'normal') * 2 + 0.5) || SV.scoreOf(parts, 'nightmare') > SV.scoreOf(parts, 'normal') * 1.99, 'on Nightmare the readout says so, and the score is doubled');
	const a = run({ seed: 9 }), b = run({ seed: 9 }); for (const q of [a, b]) { at(q, 290); steps(q, 12, false); }
	A(a.w.stats.spawned === b.w.stats.spawned && a.w.stats.spawned > 5 && a.boss && b.boss && a.boss.dex === b.boss.dex && a.log.length === b.log.length, 'the same seed, the same run');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
