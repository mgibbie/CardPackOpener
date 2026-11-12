// micasurvivor_m3d_expend_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): the rest of a Classic run
// (micasurvivor/m3d/expedition.js), in node, against the 2D game's own functions:
//   * a run's pay in Pokémonedas is the 2D game's payOf, case by case (by tier; nothing under a minute)
//   * a Survival run's pay too (a legendary milestone, a minute survived)
//   * a won run's medal is the 2D game's medalOf (bronze for finishing; silver, gold, champion by the clock and tier)
//   * the three shrines: Viridian's grove with its ponds, Mt. Moon's crater (rock pillars for the ponds, crystals),
//     Cerulean Cape's island (a ring of sea); the dais, its stairs and the pedestal the same on each; all walkable
//   * a guardian leaves a base held item: one of the 2D pool the species can use; you hold one; a second asks whether
//     to replace it
//   node overworld/tests/micasurvivor_m3d_expend_test.mjs
import { CELL, groundAt } from '../../micasurvivor/m3d/sim.js';
import { validate, footPath, LEVEL } from '../../micasurvivor/m3d/gen.js';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { XK, expFrom, newRun, stepRun, shrineRoom, payOf, result, heldRoll, takeHeld } from '../../micasurvivor/m3d/expedition.js';
import { pickTake, pickClose } from '../../micasurvivor/m3d/expeco.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G);
// (the 2D game's meta.js, with its Lab and save, is loaded into a world of its own: only its pay function is asked)
const G2 = loadG(['expedition/meta.js']);
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; stepRun(S, null); return S; };
const steps = (S, sec) => { const out = []; for (let i = 0, n = Math.round(sec * 60); i < n; i++) { S.acc = -1e9; for (const e of S.w.enemies) if (e !== S.boss) e.dead = true; for (let k = S.w.pickups.length - 1; k >= 0; k--) if (/^xp/.test(S.w.pickups[k].kind)) S.w.pickups.splice(k, 1); stepRun(S, null); out.push(...S.says.map((q) => q.text)); } return out; };
const toAltar = (S) => { const s = S.w.pl.s, a = S.w.room.altar; s.x = a[0]; s.y = a[1]; s.z = a[2]; s.vx = s.vy = s.vz = 0; s.grounded = true; };

// ---------------------------------------------------------------- pay and medal
{
	const cases = [{ kills: 0, time: 30, zone: 1, bosses: 0, won: false, catches: 0 }, { kills: 400, time: 300, zone: 1, bosses: 0, won: false, catches: 0 }, { kills: 1500, time: 900, zone: 3, bosses: 2, won: false, catches: 1 },
		{ kills: 3000, time: 1500, zone: 4, bosses: 4, won: true, catches: 2 }, { kills: 5200, time: 1900, zone: 4, bosses: 4, won: true, catches: 0 }, { kills: 59, time: 60, zone: 2, bosses: 1, won: false, catches: 0 }];
	let same = true; const seen = [];
	for (const diff of X.DIFFS) for (const p of cases) { const a = payOf({ X, diff }, p), b = G2.ExpMeta.payOf(p, diff); seen.push([diff, a.pay, b.pay]); if (a.pay !== b.pay || a.base !== b.base || a.mul !== b.mul) same = false; }
	A(same && G2.ExpMeta.K.SCALE === XK.PAY.SCALE && JSON.stringify(Object.keys(XK.PAY).filter((k) => k !== 'SCALE').map((k) => [k, XK.PAY[k]])) === JSON.stringify(Object.keys(XK.PAY).filter((k) => k !== 'SCALE').map((k) => [k, G2.ExpMeta.K.PAY[k]])), `a run's pay is the 2D game's for all ${seen.length} cases tried (a Normal clear with 3,000 KOs and 2 catches: ${payOf({ X, diff: 'normal' }, cases[3]).pay} Pokémonedas)`, seen);
	A(payOf({ X, diff: 'normal' }, cases[0]).pay === 0 && payOf({ X, diff: 'nightmare' }, cases[3]).pay > payOf({ X, diff: 'hard' }, cases[3]).pay && payOf({ X, diff: 'hard' }, cases[3]).mul === 1.75, 'under a minute a run pays nothing; Hard pays 1.75 times, Nightmare 2.5 times');
	// a won run
	const S = run({ autoPick: 0 });   // (it takes any choice's first answer: these checks are about the end)
	for (let z = 1; z <= 4; z++) { steps(S, 0.2); toAltar(S); steps(S, 3.2); S.w.hit(S.boss, 1e12, 0, 0, 0); steps(S, 0.1); if (z < 4) { toAltar(S); steps(S, 1); } }
	steps(S, 3.3);
	const R = result(S);
	A(S.ended && R.won && R.pay.pay === G2.ExpMeta.payOf(R.parts, 'normal').pay && R.pay.pay === 0 && R.medal === 'champion', `a run won in ${R.parts.time} s: the champion's medal (and no pay: it lasted under a minute)`, R.pay);
	const med = (t, d) => XK.MEDAL[X.medalOf(t, d, 'viridian')];
	A(med(2000, 'normal') === 'bronze' && med(1799, 'normal') === 'silver' && med(1379, 'normal') === 'gold' && med(1049, 'normal') === 'champion' && med(1050, 'normal') === 'gold' && med(1100, 'nightmare') === 'champion', 'the medals: bronze for finishing; on Normal silver under 30:00, gold under 23:00, champion under 17:30; Nightmare\'s limits are 16 % longer');
	const L = run(); L.w.t = 700; L.w.stats.kills = 900; L.zone = 2; L.w.pl.hp = 0; L.w.pl.dead = true; stepRun(L, null);
	const RL = result(L);
	A(L.lost && RL.medal === '' && RL.pay.pay === G2.ExpMeta.payOf(RL.parts, 'normal').pay && RL.pay.pay === 125, `a run lost in zone 2 after 11:40 and 900 KOs still pays (${RL.pay.pay}), and has no medal`, RL);
}

// ---------------------------------------------------------------- the three shrines
{
	const V = shrineRoom('viridian'), M = shrineRoom('mtmoon'), C = shrineRoom('cerulean'), w = V.w, cx = w >> 1, cz = V.h >> 1;
	const all = [V, M, C].map((r) => { const v = validate(r), p = footPath(r, r.altar); return v.ok && p && p.length > 10 && r.altar.join() === V.altar.join() && r.spawn.join() === V.spawn.join() && groundAt(r, r.altar[0], r.altar[2]) === LEVEL; });
	A(all.every(Boolean), 'each map\'s shrine is a whole level, with the same dais, stairs and pedestal, and you can walk up to it', all);
	const pond = [cx + 11, cz + 4], at = (r, c) => c[1] * w + c[0];
	A(V.water.has(at(V, pond)) && !M.water.has(at(M, pond)) && M.cells[at(M, pond)] === M.rimH && C.water.has(at(C, pond)), 'Viridian has its two ponds; Mt. Moon has rock pillars there; Cerulean Cape keeps the ponds');
	const ring = [cx + 17, cz];
	A(C.water.has(at(C, ring)) && !V.water.has(at(V, ring)) && !M.water.has(at(M, ring)) && C.water.size > V.water.size + 200, `Cerulean Cape's shrine is an island: a ring of sea round the grove (${C.water.size} cells of water; Viridian ${V.water.size})`);
	A(M.water.size === 0 && M.scatter.length > 20 && M.scatter.every((o) => o.kind === 'pebble') && V.scatter.some((o) => o.kind === 'flower') && [V, M, C].every((r) => r.scatter.every((o) => groundAt(r, o.x, o.z) === 0)), 'Mt. Moon\'s crater is dry, ringed with crystals; the groves have their flowers; nothing grows on the dais or the stairs');
	A(V.biome === 'meadow' && M.biome === 'peaks' && C.biome === 'marsh' && run({ map: 'cerulean' }).map === 'cerulean', 'each in its map\'s colours');
}

// ---------------------------------------------------------------- a guardian's held item
{
	const pool = Object.keys(XK.HELD);
	A(JSON.stringify(pool) === JSON.stringify(G.ExpLevel.K.HELD_POOL), 'the held items a guardian can drop are the 2D game\'s seven');
	// (holding one is only being listed as held: which is why one can simply be put down for another)
	const blank = () => ({ maxHp: 100, regenFlat: 0, cdMul: 1, coinMul: 1, xpMul: 1, atkMul: 1, spdMul: 1, dmgReduce: 0, critChance: 0 });
	A(pool.every((id) => { const p = blank(); G.Items.BY[id].on(p); return JSON.stringify(p) === JSON.stringify(blank()); }), 'none of the seven changes a number when picked up (each acts where it is read)');
	const S = run(), pl = S.w.pl;
	const rolls = new Set(); for (let i = 0; i < 60; i++) rolls.add(heldRoll(S));
	A(rolls.size === 5 && !rolls.has('lightball') && !rolls.has('thickclub'), 'a Charizard can be given five of them (not the Light Ball or the Thick Club)', [...rolls]);
	toAltar(S); steps(S, 3.2); const boss = S.boss; S.w.hit(boss, 1e12, 0, 0, 0); const t = steps(S, 0.05);
	const h = S.w.pickups.find((p) => p.kind === 'held');
	A(h && XK.HELD[h.value] && h.pulled && !S.held, `the guardian falls: it leaves a held item (${h && XK.HELD[h.value]}), and it comes to you with everything else`);
	const t2 = steps(S, 2.5);
	A(S.held === h.value && pl.items.join() === h.value && !S.pick && t2.some((q) => q === 'Held item: ' + XK.HELD[h.value]), 'the first is simply yours', [S.held, pl.items, t2]);
	const other = pool.find((id) => id !== S.held && data.itemOk(id, 6));
	A(takeHeld(S, S.held) === false && takeHeld(S, 'nonsense') === false && takeHeld(S, other) && S.pick && S.pick.kind === 'held' && S.pick.cards.length === 1 && S.pick.cards[0].title === XK.HELD[other], 'a second one asks: replace what you hold?');
	const tt = S.w.t; steps(S, 0.5);
	A(S.w.t === tt, 'the fight holds while you decide');
	const first = S.held;
	A(pickClose(S) && !S.pick && S.held === first && pl.items.join() === first, 'keep yours: nothing changes');
	takeHeld(S, other);
	A(pickTake(S, 0) && !S.pick && S.held === other && pl.items.join() === other, 'or take it: you hold the new one, and only that');
	const before = new Set(); for (let i = 0; i < 60; i++) before.add(heldRoll(S));
	A(!before.has(other) && before.size === 4, 'the next guardian will not drop the one you hold');
	const B = newRun(data, X, { seed: 7, dex: 6, moves: [], levels: false });
	A(heldRoll(B) !== undefined && !B.lv, 'a run with the base game\'s level-ups is left alone');
}

// ---------------------------------------------------------------- a Survival run's pay
{
	const cases = [{ kills: 900, time: 700, zone: 1, bosses: 2, legends: 0, won: false, catches: 0, surv: true }, { kills: 6000, time: 1900, zone: 3, bosses: 6, legends: 2, won: false, catches: 1, surv: true }, { kills: 12000, time: 2800, zone: 3, bosses: 9, legends: 3, won: false, catches: 4, surv: true }, { kills: 10, time: 40, zone: 1, bosses: 0, legends: 0, won: false, catches: 0, surv: true }];
	let same = true; const seen = [];
	for (const diff of X.DIFFS) for (const p of cases) { const a = payOf({ X, diff }, p), b = G2.ExpMeta.payOf(p, diff); seen.push([diff, a.pay, b.pay]); if (a.pay !== b.pay || a.base !== b.base) same = false; }
	A(same && XK.PAY.LEGEND === G2.ExpMeta.K.PAY.LEGEND && XK.PAY.SURV_MIN === G2.ExpMeta.K.PAY.SURV_MIN, `a Survival run's pay is the 2D game's for all ${seen.length} cases tried (60 a legendary, 4 a minute survived; 31:40 with two legendaries on Normal: ${payOf({ X, diff: 'normal' }, cases[1]).pay})`, seen);
	const S = newRun(data, X, { seed: 7, dex: 6, moves: [], mode: 'survival', weather: false }); S.w.pl.maxHp = S.w.pl.hp = 1e7; stepRun(S, null);
	S.sv.miles = 99; S.sv.downs = 3; S.sv.legends = 1; S.sv.seg = 3; S.sv.segEv = []; S.sv.pactSeen = 3; S.sv.nextMig = 1e9; S.w.t = 1000; S.w.stats.kills = 1500; S.w.pl.hp = 0; S.w.pl.dead = true; stepRun(S, null);
	const R = result(S);
	A(S.ended && R.survival && R.pay.pay === G2.ExpMeta.payOf({ ...R.parts, surv: true }, 'normal').pay && R.pay.pay > 500, `a Survival run that ends at 16:40 with three milestone bosses pays ${R.pay.pay}`, R.pay);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
