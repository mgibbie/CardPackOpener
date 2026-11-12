// micasurvivor_m3d_expleague_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): the Expedition League in
// a 3D run (micasurvivor/m3d/expleague.js), in node, with the 2D game's League data. The state checks of the 2D suites
// micasurvivor_expedition_league_test.mjs and _leaguemode_test.mjs, made of the 3D run.
//   * you play a member: the species' family from its first stage, with that stage's stats from its real base stats,
//     its role, and its final stage's ability
//   * the kit: one move to start, the others at Lv 2, 4 and 7; it owns the four slots (no new-move cards: a new move
//     only comes as a swap, and never a kit move)
//   * a move is at its class's factor for the stage you are
//   * evolution at the real level: the new stage's body, types, stats (and how it moves); HP back up
//   * two or more targets: that level's cards are the choice, and the fight waits for it
//   * Maturity at Lv 24 and 44 for a stage that evolves no further
//   * Eviolite: its armour only while you can still evolve
//   * a run that is not a League run is as it was
//   node overworld/tests/micasurvivor_m3d_expleague_test.mjs
import { tuneFor } from '../../micasurvivor/m3d/sim.js';
import { dataFrom, gainXp, choose } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun } from '../../micasurvivor/m3d/expedition.js';
import { candidates, moveCands, takeItem, total, levelOf } from '../../micasurvivor/m3d/explevel.js';
import { memberOf, canEvolve } from '../../micasurvivor/m3d/expleague.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), LG = X.G, L = X.L;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
/** A League run that takes a move's level at each level-up (never a swap), or the evolution card `want` names. */
const run = (dex, o = {}) => {
	const S = newRun(data, X, { seed: 7, dex, league: true, weather: false, eco: false, cap: false, autoPick: (w, cs) => { const e = cs.findIndex((c) => c.key === S.want); if (e >= 0) return e; const i = cs.findIndex((c) => c.type === 'up' && c.kind === 'move'); return i >= 0 ? i : Math.max(0, cs.findIndex((c) => c.type !== 'swap')); }, ...o });
	S.plan.events = []; S.acc = -1e9; stepRun(S, null); return S;
};
const says = [];
const step = (S) => { S.acc = -1e9; stepRun(S, null); says.push(...S.says.map((q) => q.text)); };
const levelTo = (S, n) => { const pl = S.w.pl; let g = 0; while (pl.level < n && g++ < 400) { gainXp(S.w, (pl.xpNext - pl.xp + 0.5) / pl.xpMul); step(S); step(S); } step(S); return pl.level; };
const ids = (S) => S.w.pl.moves.map((m) => m.id);

// ---------------------------------------------------------------- a member
{
	A(LG.K.KIT_AT.join() === '1,2,4,7' && LG.K.MATURE_AT.join() === '24,44' && memberOf(LG, 6) === 4 && memberOf(LG, 4) === 4 && memberOf(LG, 134) === 133 && memberOf(LG, 99999) === 1, 'a species\' member is its family\'s first stage (Charizard: Charmander; Vaporeon: Eevee); the kit\'s levels and Maturity\'s are the 2D game\'s');
	const S = run(6), pl = S.w.pl, st = LG.statsOf(4), m = LG.BY[4];
	A(S.lg && S.lg.member === 4 && S.lg.form === 4 && pl.mon.dex === 4 && pl.mon.types.join() === 'fire', 'asked for as Charizard, the run starts at the first stage: Charmander');
	A(pl.maxHp === st.hp && pl.hp === st.hp && st.hp === 88 && near(pl.baseAtk, st.atk) && near(pl.baseReduce, st.taken) && near(st.taken, 0.0408), `its stats are from its real base stats: ${st.hp} HP, attack ${st.atk}, ${(st.taken * 100).toFixed(1)} % less damage taken`, [pl.maxHp, pl.baseAtk, pl.baseReduce]);
	A(m.role === 'assault' && near(pl.atkMul, 1.08) && pl.ability === 'blaze' && pl.ability === G.Abilities.of(6), 'its role (assault: + 8 % damage) and its final stage\'s ability (Blaze), from the start');
	A(ids(S).join() === m.kit[0] && S.lg.kit === 1 && levelOf(pl.moves[0]) === 1, `it starts with the first move of its kit only (${m.kit[0]})`);
	const roles = {}; for (const d of [1, 4, 7, 16, 25, 133, 74, 63, 66, 92, 113, 143]) { const mm = LG.BY[memberOf(LG, d)]; if (!roles[mm.role]) roles[mm.role] = mm.dex; }
	const R = (role) => run(roles[role]).w.pl, r0 = (d) => LG.statsOf(d);
	A(Object.keys(roles).length === 4, 'the four roles are all on the roster', roles);
	const h = R('healer'), d = R('defender'), sp = R('speedster');
	A(near(h.baseRegen, 0.6) && near(d.baseReduce, r0(roles.defender).taken + 0.06) && near(sp.spdMul, 1.06 * r0(roles.speedster).spd / 105, 1e-6), 'a healer regenerates 0.6 HP a second, a defender takes 6 % less, a speedster is 6 % faster');
	const P = newRun(data, X, { seed: 7, dex: 6, moves: ['ember'] });
	A(!P.lg && P.w.pl.mon.dex === 6 && P.w.pl.maxHp === data.mon(6).hp, 'a run not asked for as a League run is as it was: a Charizard with the moves it was given');
}

// ---------------------------------------------------------------- the kit
{
	const S = run(4), pl = S.w.pl, kit = LG.BY[4].kit;
	says.length = 0; levelTo(S, 2);
	A(ids(S).join() === kit.slice(0, 2).join() && S.lg.kit === 2 && says.some((q) => /Kit move: flame-wheel \(2\/4\)/.test(q)), 'at Lv 2 the kit\'s second move is learned (the level still has its cards)', [ids(S), says]);
	levelTo(S, 3); A(ids(S).length === 2, 'nothing at Lv 3');
	levelTo(S, 4); A(ids(S).join() === kit.slice(0, 3).join(), 'the third at Lv 4');
	levelTo(S, 6); A(ids(S).length === 3 && !candidates(S).some((c) => c.key.startsWith('new:')) && !candidates(S).some((c) => c.key.startsWith('swap:')), 'with a slot still free a League run is offered no new move: the kit owns the slots');
	levelTo(S, 7);
	A(ids(S).join() === kit.join() && S.lg.kit === 4, 'the fourth at Lv 7: the whole kit');
	const cs = candidates(S), sw = cs.filter((c) => c.key.startsWith('swap:')).map((c) => c.key.slice(5));
	A(sw.length > 0 && !sw.some((id) => kit.includes(id)) && !moveCands(S).some((id) => kit.includes(id)) && !cs.some((c) => c.key.startsWith('new:')), 'from then on a new move only comes as a (rare) swap, and never a kit move');
	// class factors
	const st = S.lg.st, fw = pl.moves.find((m) => m.id === 'flame-wheel'), em = pl.moves.find((m) => m.id === 'ember');
	A(near(fw.xk, st.phys / st.atk) && fw.xk < 1 && em.xk === 1 && near(fw.dmg, fw.x.b.dmg * fw.xk * (1 + 0.08 * (levelOf(fw) - 1)) * (1 + fw.x.r.dmg)), `Charmander is a special attacker: its physical Flame Wheel is at ${(st.phys / st.atk).toFixed(3)} of its damage, Ember at 1`, [fw.xk, em.xk]);
	const card = cs.find((c) => c.key.startsWith('swap:')).make(0, () => 0.5); card.apply();
	const nm = pl.moves.find((m) => m.id === card.id);
	A(nm && near(nm.xk, LG.factorOf(card.id, st)), 'a move swapped in is at its class\'s factor too');
}

// ---------------------------------------------------------------- evolution
{
	const S = run(4), pl = S.w.pl;
	levelTo(S, 15);
	A(S.lg.form === 4 && pl.mon.dex === 4 && canEvolve(S), 'at Lv 15 it is still a Charmander');
	pl.hp = 10; const max0 = pl.maxHp, t4 = JSON.stringify(S.w.tune); says.length = 0;
	levelTo(S, 16);
	const s5 = LG.statsOf(5), s4 = LG.statsOf(4);
	A(S.lg.form === 5 && pl.mon.dex === 5 && S.lg.evo === 1 && says.some((q) => /Charmander evolved into Charmeleon!/.test(q)), 'at Lv 16 it evolves: Charmeleon');
	A(pl.maxHp === max0 + s5.hp - s4.hp && near(pl.baseAtk, s5.atk) && near(pl.hp, pl.maxHp * 0.8, 0.02), `the new stage's stats (HP ${max0} > ${pl.maxHp}); from 10 HP it comes back to 80 % (half, then 30 % more)`, [pl.maxHp, pl.hp]);
	const fw = pl.moves.find((m) => m.id === 'flame-wheel');
	A(near(fw.xk, s5.phys / s5.atk), 'its moves are rescaled for the new stage');
	levelTo(S, 36);
	const s6 = LG.statsOf(6);
	A(S.lg.form === 6 && pl.mon.types.join() === 'fire,flying' && S.lg.evo === 2 && !canEvolve(S) && JSON.stringify(S.w.tune) === JSON.stringify(tuneFor(['fire', 'flying'])) && JSON.stringify(S.w.tune) !== t4, 'at Lv 36: Charizard, Fire / Flying, and it now moves as a Flying type does');
	A(near(pl.spdMul, s6.spd / 105, 1e-6) && s6.spd === 109 && pl.r === data.radius(6), `a stage's speed is a factor on the run speed (Charizard: ${(s6.spd / 105).toFixed(3)}); its body is the new species'`);
	A(S.lg.mat === 0, 'no Maturity while it could still evolve (Lv 24 passed as a Charmeleon)');
	levelTo(S, 43); S.w.autoPick = undefined;   // (the level's own card is left untaken: only Maturity changes the numbers)
	const a0 = pl.atkMul, m0 = pl.maxHp; says.length = 0;
	gainXp(S.w, (pl.xpNext - pl.xp + 0.5) / pl.xpMul); step(S);
	A(S.lg.mat === 1 && near(pl.atkMul, a0 * 1.12) && pl.maxHp === m0 + Math.round(m0 * 0.12) && says.some((q) => /Charizard reached Maturity 1!/.test(q)), 'at Lv 44, its last stage: Maturity (+ 12 % damage and max HP)');
	const lone = Object.values(LG.BY).find((m) => !Object.keys(m.evo).length && data.mon(m.dex)).dex, T = run(lone);
	levelTo(T, 24); const one = T.lg.mat; levelTo(T, 44);
	A(one === 1 && T.lg.mat === 2 && T.lg.evo === 0, `a member that never evolves (${data.mon(lone).name}) matures at Lv 24 and again at 44`);
}

// ---------------------------------------------------------------- a branch
{
	const S = run(43), pl = S.w.pl;
	levelTo(S, 21); A(S.lg.form === 44, 'Oddish is a Gloom at Lv 21');
	levelTo(S, 35);
	S.w.autoPick = undefined;
	gainXp(S.w, (pl.xpNext - pl.xp + 0.5) / pl.xpMul); step(S);
	const cs = pl.choices;
	A(pl.level === 36 && S.lg.pending && cs && cs.length === 2 && cs.every((c) => c.type === 'xevo') && cs.map((c) => c.id).sort().join() === '182,45' && /Gloom > /.test(cs[0].title) && /HP \d+ > \d+/.test(cs[0].desc), `at Lv 36 Gloom has two ways to go: that level's cards are the choice (${cs && cs.map((c) => c.title).join(' | ')})`);
	const t = S.w.t; for (let i = 0; i < 30; i++) step(S);
	A(S.w.t === t && S.lg.form === 44, 'the fight waits for it');
	choose(S.w, cs.findIndex((c) => c.id === 182)); step(S);
	A(S.lg.form === 182 && pl.mon.dex === 182 && !S.lg.pending && S.w.t > t && S.lg.evo === 2, 'Bellossom it is, and the fight goes on');
	const E = run(133); levelTo(E, 29); E.want = 'xevo:196'; E.w.autoPick = undefined; gainXp(E.w, (E.w.pl.xpNext - E.w.pl.xp + 0.5) / E.w.pl.xpMul); step(E);
	A(E.w.pl.choices && E.w.pl.choices.length === 8, 'Eevee at Lv 30: eight cards');
	choose(E.w, E.w.pl.choices.findIndex((c) => c.id === 196)); step(E);
	A(E.lg.form === 196 && E.w.pl.mon.types.join() === 'psychic' && ids(E).join() === LG.BY[133].kit.join(), 'Espeon: its types, and Eevee\'s kit kept');
}

// ---------------------------------------------------------------- Eviolite
{
	const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0 }); S.plan.events = []; S.acc = -1e9; stepRun(S, null);
	const base = S.w.pl.baseReduce; takeItem(S, 'eviolite');
	A(near(total(S, 'armor'), 15) && near(S.w.pl.baseReduce, base + 0.15), 'Eviolite on a Charmander (it can still evolve): 15 armour');
	const T = run(4, { eco: true }); levelTo(T, 36); const b2 = T.w.pl.baseReduce; takeItem(T, 'eviolite');
	A(total(T, 'armor') === 0 && near(T.w.pl.baseReduce, b2), 'on a Charizard (it cannot): nothing');
	const U = run(4, { eco: true }); takeItem(U, 'eviolite'); levelTo(U, 16); const mid = total(U, 'armor'); levelTo(U, 36);
	A(mid === 15 && total(U, 'armor') === 0, 'held through its evolutions, it stops working at the last one');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
