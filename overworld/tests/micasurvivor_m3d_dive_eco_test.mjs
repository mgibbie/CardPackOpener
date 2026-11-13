// micasurvivor_m3d_dive_eco_test.mjs — MicaSurvivor 3D, Dive part 13 (Plans/MICASURVIVOR_3D_PLAN.md §5.66): what a 2D
// Dive floor also holds (js/expedition/dive.js ecoLayout), run by the Expedition's economy (micasurvivor/m3d/expeco.js).
//   * the layout: 2 berry bushes and 3 gold rocks a floor; Meowth's stall on about 1 plain floor in 4, never on an
//     alpha's or a guardian's; on the ground, apart from each other, the chests, the spawn and the stairs
//   * a KO pays ₽; a rock pays its gold x the floor's zone; a bush heals half your HP
//   * the stall: its three items at the economy's prices; buying spends ₽ and gives the item; the fight holds while
//     it is open
//   * eco: false is a Dive as before; the same Dive has the same floor
//   node overworld/tests/micasurvivor_m3d_dive_eco_test.mjs
import { rulesFrom, newDive, stepDive, hudLine, ecoLayout } from '../../micasurvivor/m3d/dive.js';
import { ecoView, pickTake, pickClose, shopPrices } from '../../micasurvivor/m3d/expeco.js';
import { dataFrom, addEnemy, hashWorld } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { CELL, noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), EKK = X.E.K;
const run = (o = {}) => { const S = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, league: true, ...o }); S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; S.w.pl.maxHp = S.w.pl.hp = 1e9; return S; };
const step = (S) => { stepDive(S, noInput()); return S.w.events.slice(); };
const steps = (S, sec) => { const ev = []; for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) ev.push(...step(S)); return ev; };
const put = (S, x, z) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vz = s.vy = 0; };
const lay = (S) => S.w.room.eco, of = (S, kind) => lay(S).objs.filter((o) => o.kind === kind);

// ---------------------------------------------------------------- the layout
{
	let stalls = 0, plain = 0, bad = [], bossStall = 0;
	for (let seed = 1; seed <= 12; seed++) for (const f of [1, 2, 3, 4, 5, 6, 7, 25]) {
		const S = newDive(data, X, R, { route: 'forest', seed, dex: 4, league: true, start: f }), room = S.w.room, L = room.dive, E = room.eco;
		const boss = L.cadence.arena || L.cadence.guardian, n = (k) => E.objs.filter((o) => o.kind === k).length;
		if (!boss) { plain++; stalls += n('meowth'); } else bossStall += n('meowth');
		if (n('berry') > 2 || n('rock') > 3 || n('meowth') > 1) bad.push([seed, f, 'counts']);
		if (n('berry') < 1 || n('rock') < 1) bad.push([seed, f, 'none']);
		for (const o of E.objs) {
			if (room.cells[o.cz * room.w + o.cx] !== 0 || room.water.has(o.cz * room.w + o.cx)) bad.push([seed, f, o.kind + ' not on the ground']);
			if (Math.abs(o.cx - L.spawn[0]) + Math.abs(o.cz - L.spawn[1]) < 6 && o.kind !== 'meowth') bad.push([seed, f, o.kind + ' on the spawn']);
			for (const q of E.objs) if (q !== o && Math.abs(o.cx - q.cx) + Math.abs(o.cz - q.cz) < 5) bad.push([seed, f, 'two together']);
			if (o.kind === 'rock' && !(o.v >= 6 && o.v <= 14)) bad.push([seed, f, 'rock ' + o.v]);
		}
		if (n('meowth') && !(E.visits.length === 1 && E.visits[0].at === 0 && E.visits[0].until > 1e6)) bad.push([seed, f, 'visit']);
	}
	A(bad.length === 0, 'every floor: up to 2 berry bushes and 3 gold rocks (6-14), on the ground, 5 tiles apart, off the spawn', bad.slice(0, 6));
	A(bossStall === 0 && stalls > 0 && stalls / plain > 0.1 && stalls / plain < 0.45, `Meowth's stall on about 1 plain floor in 4 (${stalls} of ${plain}), open all floor, never on an alpha's or a guardian's`, [stalls, plain, bossStall]);
	const S = run();
	A(JSON.stringify(ecoLayout(S, S.w.room)) === JSON.stringify(lay(S)), 'the same floor has the same things');
}

// ---------------------------------------------------------------- ₽
{
	const S = run({ autoPick: 0 }), pl = S.w.pl;   // (autoPick: the level the KOs bring picks its own card)
	A(S.coins === 0 && / · ₽ 0$/.test(hudLine(S)), 'a Dive has ₽, and the chips show them', hudLine(S));
	const e = addEnemy(S.w, 19, pl.s.x + 3, pl.s.z, { t: 0, ti: 0 }); e.dummy = true; e.hp = 1e-6; e.poison = 1; e.poisonT = 1; e.poisonTick = 0;
	for (let i = 0; i < 5; i++) { const q = addEnemy(S.w, 19, pl.s.x + 3 + i * 0.1, pl.s.z + 1, { t: 0, ti: 0 }); q.dummy = true; q.hp = 1e-6; q.poison = 1; q.poisonT = 1; q.poisonTick = 0; }
	steps(S, 1.5);
	A(S.kills === 6 && S.eco.earned === Math.floor(6 * EKK.KO + 1e-9) && S.coins === S.eco.earned, `KOs pay ₽ (${EKK.KO} each: 6 KOs, ${Math.floor(6 * EKK.KO + 1e-9)} ₽)`, [S.kills, S.coins]);
	// a rock
	const rock = of(S, 'rock')[0], c0 = S.coins;
	put(S, rock.x, rock.z);
	const ev = steps(S, 0.2);
	A(S.coins === c0 + rock.v * 1 && ev.some((q) => q.k === 'coins') && !ecoView(S).some((o) => o.i === rock.i), `a gold rock pays its gold (${rock.v} ₽ on floor 1) and is gone`, [S.coins, c0, rock.v]);
	const deep = run({ start: 11, autoPick: 0 }), r2 = of(deep, 'rock')[0];
	put(deep, r2.x, r2.z); steps(deep, 0.2);
	A(deep.coins === r2.v * 2, 'from floor 11 it pays double (a zone every 10 floors, as the 2D economy)', [deep.coins, r2.v]);
	// a bush
	const bush = of(S, 'berry')[0];
	pl.maxHp = 1000; pl.hp = 1000; put(S, bush.x, bush.z); steps(S, 0.2);
	A(ecoView(S).some((o) => o.i === bush.i), 'a berry bush waits while you are at full HP');
	pl.hp = 100; steps(S, 0.2);
	A(near(pl.hp, 100 + 1000 * EKK.BERRY) && !ecoView(S).some((o) => o.i === bush.i), `hurt, it heals ${EKK.BERRY * 100} % of your HP, once`, pl.hp);
}

// ---------------------------------------------------------------- the stall
{
	let S = null;
	for (let seed = 1; seed <= 60 && !S; seed++) { const T = run({ seed }); if (of(T, 'meowth').length) S = T; }
	A(!!S, 'a floor with the stall');
	const stall = of(S, 'meowth')[0], pl = S.w.pl;
	let ev = steps(S, 0.2);
	A(ecoView(S).some((o) => o.kind === 'meowth') && S.says !== undefined, 'Meowth is at his stall from the start of the floor');
	S.coins = 5000;
	put(S, stall.x + 1, stall.z);
	steps(S, 0.2);
	const P = S.pick;
	A(!!P && P.kind === 'shop' && P.ids.length === EKK.STOCK && P.prices.length === EKK.STOCK && P.prices.every((p) => p > 0), `walk up to it: the stall opens with ${EKK.STOCK} items and their prices`, P && [P.ids, P.prices]);
	const t0 = S.w.t; steps(S, 0.5);
	A(S.w.t === t0 && S.pick === P, 'the fight holds while it is open');
	const items0 = S.lv.log.filter((q) => q[1] === 'item').length, price = P.prices[0], id = P.ids[0];
	A(pickTake(S, 0) === true && S.coins === 5000 - price && S.lv.log.filter((q) => q[1] === 'item').length === items0 + 1 && X.L.I.has(pl, id), `buy the first: ${price} ₽ spent, the item is yours`, [S.coins, price]);
	A(pickTake(S, 0) === false && S.coins === 5000 - price, 'an item is sold once');
	S.coins = 0;
	A(pickTake(S, 1) === false && S.coins === 0, 'without the ₽ it is not sold');
	A(pickClose(S) === true && S.pick === null, 'walk away: the stall closes');
	steps(S, 0.3);
	A(S.w.t > t0 && S.pick === null, '…the fight goes on, and it does not open again while you stand there');
	// autoPick: a run that picks by itself never waits at the stall
	let T = null; for (let seed = 1; seed <= 60 && !T; seed++) { const Q = run({ seed, autoPick: 0 }); if (of(Q, 'meowth').length) T = Q; }
	const st = of(T, 'meowth')[0]; put(T, st.x + 1, st.z); const t1 = T.w.t; steps(T, 0.5);
	A(T.w.t > t1 && T.pick === null, 'a Dive that picks by itself (tests, watching) does not wait at the stall');
}

// ---------------------------------------------------------------- off, and the same
{
	const N = run({ eco: false });
	A(!N.eco && !N.w.room.eco && !/₽/.test(hudLine(N)), 'eco: false is a Dive as before: no ₽, no stall, no bushes, no rocks');
	const one = () => { const S = run({ seed: 9 }); const r = of(S, 'rock')[0]; put(S, r.x, r.z); steps(S, 1); return [hashWorld(S.w), S.coins, JSON.stringify(lay(S).objs.map((o) => [o.kind, o.cx, o.cz, o.v]))]; };
	A(JSON.stringify(one()) === JSON.stringify(one()), 'the same Dive gives the same floor and the same ₽');
	// the next floor has its own
	const S = run(); const a = JSON.stringify(lay(S).objs.map((o) => [o.kind, o.cx, o.cz]));
	put(S, S.w.room.stairs[0], S.w.room.stairs[2]); steps(S, R.K.STAIRS_T + 0.3);
	A(S.floor === 2 && JSON.stringify(lay(S).objs.map((o) => [o.kind, o.cx, o.cz])) !== a && ecoView(S).length === lay(S).objs.filter((o) => o.kind !== 'meowth' || lay(S).visits.length).length, 'the next floor has its own bushes and rocks, all fresh');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
