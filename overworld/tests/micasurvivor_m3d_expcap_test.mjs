// micasurvivor_m3d_expcap_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): capture in an Expedition run
// (micasurvivor/m3d/expcap.js), in node, with the 2D game's tables. The state checks of the 2D suite
// micasurvivor_expedition_capture_test.mjs, made of the 3D run.
//   * an alpha cannot be taken under 1 HP: it faints where it stands (its XP falls, the KO counts and pays), and an
//     8 s window opens; left alone it comes round and leaves its prize
//   * stand beside it 0.35 s (on its level) and the Friend Ball goes out; the world holds for the cinematic; then it
//     is a Support Alpha: it follows you, shoots the nearest enemy every 1.25 s, and its type gives a perk (they add)
//   * with two already: which one to swap, or keep your team and take the prize
//   * your team comes through the portal with you
//   * a shiny: the 2D game's odds; it wanders near you, never attacks, flees after two minutes; caught the same way
//   * a catch counts in the run's score
//   node overworld/tests/micasurvivor_m3d_expcap_test.mjs
import { CELL } from '../../micasurvivor/m3d/sim.js';
import { dataFrom, attackOf, CK, U } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, spawn, fire, result, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { total } from '../../micasurvivor/m3d/explevel.js';
import { pickTake, pickClose } from '../../micasurvivor/m3d/expeco.js';
import { capView, slotsMax, recruit } from '../../micasurvivor/m3d/expcap.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), L = X.L, K = X.C.K;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false, eco: true, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; if (o.shiny) S.forceShiny = true; stepRun(S, null); return S; };
const calm = (S) => { S.acc = -1e9; for (let i = S.w.pickups.length - 1; i >= 0; i--) if (/^xp/.test(S.w.pickups[i].kind)) S.w.pickups.splice(i, 1); };
const steps = (S, sec, input = null) => { const out = []; for (let i = 0, n = Math.round(sec * 60); i < n; i++) { calm(S); stepRun(S, input); out.push(...S.says.map((q) => q.text)); } return out; };
const put = (S, x, z, y) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = y; s.vx = s.vy = s.vz = 0; s.grounded = true; };
/** An alpha of a species, standing still a little way off; `down`: already fainted. */
let SEED = 100;
const alpha = (S, dex, down = false) => { const s = S.w.pl.s; let e = null; for (let k = 0; k < 40 && !e; k++) { const n = S.w.enemies.length; fire(S, { at: 0, kind: 'alpha', n: 1, dex: [dex], seed: SEED++ }); e = S.w.enemies.length > n ? S.w.enemies[S.w.enemies.length - 1] : null; } e.dummy = true; if (down) { S.w.hit(e, 1e12, 0, 0, 0); steps(S, 0.05); } return e; };
const beside = (S, f) => put(S, f.x + 1, f.z, f.y);
/** Faint an alpha and catch it. */
const catchOne = (S, dex) => { alpha(S, dex, true); const f = S.cap.faint[S.cap.faint.length - 1]; beside(S, f); steps(S, K.THROW_T + 0.05); if (!S.pick) steps(S, X.C.CINE_T + 0.1); return f; };

// ---------------------------------------------------------------- the faint
{
	A(K.FAINT_T === 8 && K.THROW_T === 0.35 && K.SLOTS === 2 && near(X.C.CINE_T, 3.2) && X.C.perkOf('rock').join() === 'hp,15' && X.C.perkOf('fairy').join() === 'luck,8', 'the window, the throw, the slots, the cinematic and the perks are the 2D game\'s');
	const S = run(), e = alpha(S, 19), kills = S.w.stats.kills;
	A(e.xk === 'alpha' && e.hpFloor === 1 && S.cap.tg.has(e.id), 'an alpha is marked: it can be caught');
	S.w.hit(e, e.hp - 5, 0, 0, 0); A(e.hp === 5 && !e.dead, 'hurt, it is hurt');
	S.w.hit(e, 1e9, 0, 0, 0);
	A(e.hp === 1 && !e.dead, 'but no hit takes it under 1 HP');
	const t = steps(S, 0.05), f = S.cap.faint[0];
	A(e.dead && f && f.kind === 'alpha' && f.dex === 19 && near(f.x, e.a.x) && S.w.stats.kills === kills + 1 && S.coins === 5 && t.some((q) => /faints! Stand beside it to throw a Friend Ball/.test(q)), 'at 1 HP it faints where it stands: the KO counts (and pays its 5 ₽), and the window opens', t);
	A(capView(S).faint.length === 1 && near(capView(S).faint[0].left, 8, 0.02), 'for 8 s');
	steps(S, 7.8); A(S.cap.faint.length === 1 && !S.w.pickups.some((p) => p.kind === 'item'), 'at 7.8 s it is still down');
	const t2 = steps(S, 0.3);
	A(S.cap.faint.length === 0 && S.w.pickups.some((p) => p.kind === 'item') && S.w.pickups.some((p) => p.kind === 'heal') && S.cap.log.prizes === 1 && S.cap.sa.length === 0 && t2.some((q) => /comes round and leaves its prize/.test(q)), 'then it comes round and leaves its prize: an item and a berry');
}

// ---------------------------------------------------------------- the throw and the cinematic
{
	const S = run(), e = alpha(S, 74, true), f = S.cap.faint[0], pl = S.w.pl;
	put(S, f.x + K.THROW_R * CELL + pl.r + 0.4, f.z, f.y); steps(S, 1);
	A(!S.cap.cine && f.stand === 0, `${(K.THROW_R * CELL + pl.r + 0.4).toFixed(1)} m away is not beside it`);
	put(S, f.x + 1, f.z, f.y + 3); S.w.pl.s.grounded = false; stepRun(S, null);
	A(!S.cap.cine && f.stand === 0, 'nor is the air 3 m above it');
	beside(S, f); steps(S, 0.3); A(!S.cap.cine, '0.3 s beside it: not yet');
	steps(S, 0.1);
	const c = S.cap.cine, t0 = S.w.t;
	A(c && c.kind === 'alpha' && c.dex === 74 && S.cap.faint.length === 0, '0.35 s: the Friend Ball goes out (no odds: it always works)');
	const spawned = S.w.stats.spawned; S.acc = 5; for (let i = 0; i < 60 * 3.1; i++) stepRun(S, { mx: 1, mz: 0, jump: false, crouch: false });
	A(S.w.t === t0 && S.cap.cine && S.w.stats.spawned === spawned && capView(S).cine.phase.n === 'click' && pl.invuln >= 0.5, 'for 3.1 s the world holds (nothing moves, nothing arrives, nothing can hurt you): three shakes, the click');
	const t = steps(S, 0.2), a = S.cap.sa[0];
	A(!S.cap.cine && a && a.dex === 74 && a.type === 'rock' && S.cap.n === 1 && S.cap.log.alpha === 1 && pl.invuln >= 0.7 && t.some((q) => /Gotcha! Geodude joins your team · \+15 max HP/.test(q)), 'then Geodude is a Support Alpha, and says what it brings', t);
	A(S.w.t > t0 && !S.w.pickups.some((p) => p.kind === 'item'), 'the fight goes on; a caught alpha leaves no prize');
}

// ---------------------------------------------------------------- Support Alphas
{
	const S = run(), pl = S.w.pl, hp0 = pl.maxHp;
	catchOne(S, 74);
	A(pl.maxHp === hp0 + 15 && near(total(S, 'hp'), 15), 'a Rock Support Alpha: + 15 max HP');
	catchOne(S, 111);   // Rhyhorn: ground / rock (its first type is what counts)
	const first = S.cap.sa[1].type, st = X.C.perkOf(first);
	A(S.cap.sa.length === 2 && near(total(S, st[0]), st[1] + (st[0] === 'hp' ? 15 : 0)) && S.cap.log.best === 2, `a second one (${first}): its perk too (same-stat perks add)`);
	// it follows
	S.w.enemies.length = 0;
	steps(S, 3, { mx: 1, mz: 0, jump: false, crouch: false });
	const d = S.cap.sa.map((a) => Math.hypot(a.x - pl.s.x, a.z - pl.s.z));
	A(d.every((q) => q < 8) && d.every((q) => q > 1), `run 3 s: they are with you, a few metres behind (${d.map((q) => q.toFixed(1)).join(', ')} m)`);
	put(S, pl.s.x - 20, pl.s.z, S.w.pl.s.y); const far = Math.hypot(S.cap.sa[0].x - pl.s.x, S.cap.sa[0].z - pl.s.z); put(S, S.w.room.spawn[0], S.w.room.spawn[2], S.w.room.spawn[1]); steps(S, 0.05);
	A(far > 5, 'left behind they run after you');
	// it shoots
	const R = run(); catchOne(R, 4); R.w.enemies.length = 0; R.w.shots.length = 0;
	put(R, R.w.room.spawn[0], R.w.room.spawn[2], R.w.room.spawn[1]); steps(R, 2);   // (back in the open, your team with you)
	const a = R.cap.sa[0], e = spawn(R, 19, R.w.pl.s.x + 6, R.w.pl.s.z); e.dummy = true; e.maxHp = e.hp = 1e6; const fired0 = a.shots;
	steps(R, 5);
	const want = K.SA_DMG * attackOf(R.w.pl) * data.typeMult('fire', e.types);
	A(a.shots - fired0 >= 3 && a.shots - fired0 <= 5 && e.hp < 1e6 && e.burn > 0, `a Charmander Support Alpha: a shot at the nearest enemy every ${K.SA_CD} s (${a.shots - fired0} in 5 s), and a Fire one burns`);
	const per = (1e6 - e.hp) / (a.shots - fired0);
	A(per > want * 0.8 && per < want * 2.2, `each for about ${K.SA_DMG} x your attack (${per.toFixed(1)} a shot with its burn; a bare shot would be ${want.toFixed(1)})`);
	const off = spawn(R, 19, a.x, a.z + K.SA_REACH * U + 6 > 0 ? a.z - K.SA_REACH * U - 6 : a.z); off.dummy = true; off.maxHp = off.hp = 1e6; e.dead = true; steps(R, 3);
	A(off.hp === 1e6, `nothing beyond ${K.SA_REACH * U} m`);
}

// ---------------------------------------------------------------- a full team
{
	const S = run(), pl = S.w.pl;
	catchOne(S, 74); catchOne(S, 4);
	A(slotsMax(S) === 2 && S.cap.sa.map((a) => a.dex).join() === '74,4', 'two Support Alphas: the team is full');
	alpha(S, 92, true); let f = S.cap.faint[0]; beside(S, f); steps(S, 0.4);
	const P = S.pick, t0 = S.w.t;
	A(P && P.kind === 'friend' && P.cards.length === 2 && /Swap Geodude for Gastly/.test(P.cards[0].title) && /evasion/.test(P.cards[0].desc) && !S.cap.cine, 'a third faints and you stand by it: who do you swap for Gastly?', P && P.cards);
	steps(S, 9); A(S.w.t === t0 && S.cap.faint.length === 1, 'the fight holds while you decide (and the window does not run out under you)');
	A(pickTake(S, 1) && !S.pick && S.cap.cine && S.cap.cine.slot === 1, 'swap the second: the ball goes out');
	steps(S, X.C.CINE_T + 0.1);
	A(S.cap.sa.map((a) => a.dex).join() === '74,92' && S.cap.log.swaps === 1 && near(total(S, 'evade'), 0.05) && total(S, 'status') === 0 && near(total(S, 'hp'), 15), 'Gastly has Charmander\'s place: its perk (evasion) for Charmander\'s (status)');
	alpha(S, 16, true); f = S.cap.faint[0]; beside(S, f); steps(S, 0.4);
	A(S.pick && pickClose(S) && !S.pick && S.cap.sa.map((a) => a.dex).join() === '74,92' && S.w.pickups.some((p) => p.kind === 'item') && S.cap.log.prizes === 1 && S.cap.faint.length === 0, 'or keep your team: its prize falls to the ground instead');
	// a run that chooses by itself swaps the first
	const R = run({ autoPick: 0 }); catchOne(R, 74); catchOne(R, 4); alpha(R, 92, true); beside(R, R.cap.faint[0]); steps(R, 0.5 + X.C.CINE_T);
	A(R.cap.sa.map((a) => a.dex).join() === '92,4', 'a run told to choose by itself swaps the first');
	// through the portal
	const a = S.boss; S.w.pickups.length = 0;
	put(S, S.w.room.altar[0], S.w.room.altar[2], S.w.room.altar[1]); steps(S, 3.2); S.w.hit(S.boss, 1e12, 0, 0, 0); steps(S, 0.1); put(S, S.w.room.altar[0], S.w.room.altar[2], S.w.room.altar[1]); steps(S, 1);
	const dz = S.cap.sa.map((q) => Math.hypot(q.x - pl.s.x, q.z - pl.s.z));
	A(S.zone === 2 && S.cap.sa.length === 2 && dz.every((q) => q < 8) && near(total(S, 'hp'), 15) && a === null, 'through the portal: your team comes with you, perks and all', [S.zone, dz]);
	const r = result(S);
	A(r.parts.catches === 3 && r.score === G.ExpTier.score(r.parts, 'normal') && G.ExpTier.score({ ...r.parts, catches: 4 }, 'normal') - r.score === 400, `three catches are in the run's score (400 each)`);
}

// ---------------------------------------------------------------- a shiny
{
	let n = 0; for (let seed = 1; seed <= 3000; seed++) if (X.C.zonePlan(seed, 'viridian', 1, { luck: 0 }).shiny) n++;
	A(near(n / 3000, 0.08, 0.2) && X.C.shinyChance(0) === 0.08 && near(X.C.shinyChance(40, true), 0.18) && X.C.zonePlan(5, 'viridian', 4, {}).shiny === null, `a zone has a shiny 8 % of the time (${n} of 3,000 seeds), more with luck and the Shiny Charm; never the shrine`);
	const S = run({ shiny: true }), P = S.cap.zplan, pl = S.w.pl;
	A(P.shiny && P.shiny.at >= 60 && P.shiny.at <= 420, `this zone's arrives at ${P.shiny && P.shiny.at} s`);
	setZoneTime(S, P.shiny.at - 0.5); steps(S, 0.3); A(S.w.enemies.length === 0, 'not before');
	const t = steps(S, 0.4), e = S.w.enemies[0];
	const plain = spawn(S, e.dex, e.a.x, e.a.z); plain.dead = true;
	A(e && e.xk === 'shiny' && e.shiny && S.plan.cards.includes(e.dex) && near(e.maxHp / plain.maxHp, K.SH_HP, 0.02) && near(e.xp, plain.xp * K.SH_XP, 0.02) && t.some((q) => /A shiny .* is near!/.test(q)) && S.cap.log.seen === 1, `then: a shiny ${data.mon(e.dex).name}, one of the zone's own, ${K.SH_HP} times the HP and ${K.SH_XP} times the XP`, t);
	const at0 = [e.a.x, e.a.z], hp = pl.hp; let touched = false, dmin = 1e9, dmax = 0;
	for (let i = 0; i < 60 * 20; i++) { calm(S); stepRun(S, null); const d = Math.hypot(e.a.x - pl.s.x, e.a.z - pl.s.z); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
	A(Math.hypot(e.a.x - at0[0], e.a.z - at0[1]) > 2 && pl.hp === hp && S.w.stats.touched === 0 && dmax < 45, `it wanders round you (${dmin.toFixed(0)}-${dmax.toFixed(0)} m away over 20 s) and never attacks`, [dmin, dmax]);
	// it flees
	const F = run({ shiny: true }); setZoneTime(F, F.cap.zplan.shiny.at); steps(F, 0.1); const fe = F.w.enemies[0];
	steps(F, K.SH_FLEE - 1); A(F.w.enemies.includes(fe), `after ${K.SH_FLEE - 1} s it is still about`);
	const t3 = steps(F, 1.2);
	A(!F.w.enemies.includes(fe) && F.cap.log.fled === 1 && t3.some((q) => /got away/.test(q)) && F.w.stats.kills === 0, `at ${K.SH_FLEE} s it is gone`);
	// caught
	S.w.hit(e, 1e12, 0, 0, 0); steps(S, 0.05);
	const f = S.cap.faint[0];
	A(e.dead && f && f.kind === 'shiny' && near(capView(S).faint[0].left, K.SH_WINDOW, 0.02), `beaten, it faints too: a ${K.SH_WINDOW} s window`);
	beside(S, f); steps(S, 0.4 + X.C.CINE_T + 0.1);
	A(S.cap.log.shiny.join() === String(e.dex) && S.cap.n === 1 && S.cap.sa.length === 0 && result(S).parts.catches === 1, 'a Poké Ball: the shiny is caught (it does not join your team), and counts as a catch');
	const U2 = run({ shiny: true }); setZoneTime(U2, U2.cap.zplan.shiny.at); steps(U2, 0.1); U2.w.hit(U2.w.enemies[0], 1e12, 0, 0, 0); const t4 = steps(U2, K.SH_WINDOW + 0.2);
	A(U2.cap.faint.length === 0 && U2.cap.log.fled === 1 && !U2.w.pickups.some((p) => p.kind === 'item') && t4.some((q) => /got away/.test(q)), 'left alone it gets away, and leaves nothing');
}

// ---------------------------------------------------------------- without capture
{
	const S = newRun(data, X, { seed: 7, dex: 6, moves: [], cap: false }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; stepRun(S, null);
	const e = alpha(S, 19); S.w.hit(e, 1e12, 0, 0, 0); steps(S, 0.05);
	A(!S.cap && e.dead && !e.hpFloor && S.w.pickups.some((p) => p.kind === 'item') && S.w.pickups.some((p) => p.kind === 'heal'), 'a run asked for without capture: an alpha simply falls and leaves its prize');
	const R = run(); recruit(R, 25, null, null);
	A(R.cap.sa.length === 1 && near(total(R, 'atkspd'), 0.08), 'an Electric Support Alpha: + 8 % attack speed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
