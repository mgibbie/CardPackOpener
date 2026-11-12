// micasurvivor_m3d_expeco_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run's economy
// and items (micasurvivor/m3d/expeco.js, explevel.js), in node, with the 2D game's tables. The state checks of the 2D
// suites micasurvivor_expedition_economy_test.mjs and _slots_test.mjs, made of the 3D run.
//   * where things stand: seeded, on flat ground you can walk to, away from where you arrive and from the altar, apart
//     from each other; the shrine has none
//   * money: what each KO pays; the Nugget and Gengar's greed multiply it
//   * gold rocks, berry bushes (only when hurt), cages
//   * Poké Balls: paid (the price grows; without the money it stays shut), free, cursed (difficulty, ghosts)
//   * the Unown altars: charge by standing in the circle, drain when you leave; the epic and golden ones call hordes;
//     the golden one is sealed for 90 s and gives two of four
//   * the comet: it lands, is charged, or burns out
//   * the challenge altar: a wave, then a Great Ball
//   * the cursed altar and Gengar's
//   * Ditto, Hypno
//   * Meowth: his visits, his prices, the market's heat
//   * the slot machine: the 2D reels and pay table; an ambush on two Voltorb
//   * a thing counts you only on its own level; a choice holds the fight
//   * items: they stack to a cap; their stats; thorns, the Focus Band, the three revives, Sitrus, the Weakness Policy,
//     the Expert Belt, the Deep Sea Tooth, execute, flinch, the time stop; the four epic strikes; an alpha's drop
//   node overworld/tests/micasurvivor_m3d_expeco_test.mjs
import { CELL } from '../../micasurvivor/m3d/sim.js';
import { dataFrom, hazard, land, CK, U } from '../../micasurvivor/m3d/combat.js';
import { XK, expFrom, newRun, stepRun, spawn, fire, walkable, flat3, hudLine, zoneRoom, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { total, takeItem, offerCards } from '../../micasurvivor/m3d/explevel.js';
import { EK, FRESH, USED, ACTIVE, GONE, READY, layoutOf, earn, goldK, mods, pickTake, pickClose, shopPrices, peekSpin, ecoView, rollOffers } from '../../micasurvivor/m3d/expeco.js';
import { rng as makeRng } from '../../micasurvivor/m3d/gen.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), L = X.L, E = X.E, K = E.K;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const KINDS = EK.PLACE.map((p) => p[0]);
/** A quiet run you cannot lose, on a zone that has every kind of thing. */
let FULL = 0;
for (let seed = 1; seed < 400 && !FULL; seed++) { const S = newRun(data, X, { seed, dex: 6, moves: [] }), lay = layoutOf(S.w.room, S); if (KINDS.every((k) => lay.objs.some((o) => o.kind === k)) && lay.objs.filter((o) => o.kind === 'meowth').length >= 2) FULL = seed; }
const run = (o = {}) => { const S = newRun(data, X, { seed: FULL, dex: 6, moves: [], weather: false, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; stepRun(S, null); return S; };
const calm = (S) => { S.acc = -1e9; for (const e of S.w.enemies) if (!e.keep) e.dummy = true; for (let i = S.w.pickups.length - 1; i >= 0; i--) if (S.w.pickups[i].kind === 'xp' || S.w.pickups[i].kind === 'xpBig') S.w.pickups.splice(i, 1); };
/** Finish an enemy inside the fight's own tick (a burn's last point), as a move would. */
const slay = (S, e) => { e.dummy = true; e.maxHp = e.hp = 1; e.burn = 1; e.burnT = 1; e.burnTick = 0; calm(S); stepRun(S, null); calm(S); };
const steps = (S, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { calm(S); stepRun(S, null); } return S; };
const objs = (S, kind) => layoutOf(S.w.room, S).objs.filter((o) => o.kind === kind);
const put = (S, x, z, y) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = y; s.vx = s.vy = s.vz = 0; s.grounded = true; };
const at = (S, o) => put(S, o.x, o.z, o.y);
const away = (S) => { const r = S.w.room; put(S, r.spawn[0], r.spawn[2], r.spawn[1]); };
const stOf = (S, o) => S.eco.z.st[o.i];
const items = (S) => ({ ...S.w.pl.xi }), count = (S) => Object.values(S.w.pl.xi).reduce((a, b) => a + b, 0);
const says = (S, sec) => { const out = []; for (let i = 0, n = Math.round(sec * 60); i < n; i++) { calm(S); stepRun(S, null); out.push(...S.says.map((q) => q.text)); } return out; };

// ---------------------------------------------------------------- where things stand
{
	A(FULL > 0 && JSON.stringify(KINDS) === JSON.stringify(E.KINDS), `the 18 kinds and their order are the 2D game's; seed ${FULL} has every one`);
	let bad = [], n = 0, total0 = 0, min = 99, hasBall = 0, over = 0;
	for (let seed = 1; seed <= 20; seed++) for (const map of X.MAP_IDS) for (let z = 1; z <= 3; z++) {
		const S = { seed, X, map, zone: z }, room = zoneRoom(seed, map, z, X), lay = layoutOf(room, S), ok = walkable(room); n++;
		total0 += lay.objs.length; min = Math.min(min, lay.objs.length); if (lay.objs.some((o) => o.kind === 'ball')) hasBall++;
		for (const [k, c] of EK.PLACE) if (lay.objs.filter((o) => o.kind === k).length > c) over++;
		for (const o of lay.objs) {
			const sp = Math.hypot(o.x - room.spawn[0], o.z - room.spawn[2]) / CELL, al = Math.hypot(o.x - room.altar[0], o.z - room.altar[2]) / CELL;
			if (!ok[o.cz * room.w + o.cx] || !flat3(room, o.cx, o.cz) || sp < EK.FROM_SPAWN || al < EK.FROM_ALTAR || o.y !== room.cells[o.cz * room.w + o.cx]) bad.push([seed, map, z, o.kind]);
			for (const q of lay.objs) if (q.i < o.i && Math.hypot(q.cx - o.cx, q.cz - o.cz) < (EK.SMALL.includes(q.kind) || EK.SMALL.includes(o.kind) ? EK.GAP_SMALL : EK.GAP)) bad.push([seed, map, z, o.kind, q.kind]);
		}
	}
	A(bad.length === 0 && over === 0, `over ${n} zones every thing stands on a flat 3 x 3 you can walk to, ${EK.FROM_SPAWN} cells or more from where you arrive, ${EK.FROM_ALTAR} from the altar, ${EK.GAP} from the others (${EK.GAP_SMALL} for rocks and bushes)`, bad.slice(0, 4));
	A(min >= 12 && hasBall === n, `a zone holds ${Math.round(total0 / n)} things on average (never fewer than ${min}), always a Poké Ball`, [min, hasBall]);
	const S = run(), a = layoutOf(zoneRoom(FULL, 'viridian', 1, X), S), b = layoutOf(zoneRoom(FULL, 'viridian', 1, X), S), c = layoutOf(zoneRoom(FULL + 1, 'viridian', 1, X), { ...S, seed: FULL + 1 });
	const sig = (l) => l.objs.map((o) => o.kind + o.cx + ',' + o.cz + ':' + o.v).join(' ') + l.cometAt + JSON.stringify(l.visits);
	A(sig(a) === sig(b) && sig(a) !== sig(c) && layoutOf(zoneRoom(FULL, 'viridian', 4, X), S) === null, 'the same seed, the same things in the same places; the shrine has none');
	const v = a.visits, stalls = a.objs.filter((o) => o.kind === 'meowth').map((o) => o.i);
	A(v.length === 5 && v[0].at >= 50 && v[0].at <= 70 && v.every((q, i) => q.until === q.at + 70 && q.at >= 50 + 150 * i && q.at <= 70 + 150 * i && q.spot === stalls[i % stalls.length]) && a.cometAt >= 150 && a.cometAt <= 300, `Meowth visits from ${v[0].at} s, every 150 s, 70 s each, moving from stall to stall; the comet lands at ${a.cometAt} s`, v);
	A(a.objs.filter((o) => o.kind === 'rock').every((o) => o.v >= 6 && o.v <= 14) && a.objs.filter((o) => o.kind === 'cage').every((o) => X.MAPS.viridian.residents[0].includes(o.v)), 'a rock is worth 6-14; a cage holds one of the zone\'s residents');
}

// ---------------------------------------------------------------- money
{
	const S = run(), s = S.w.pl.s, kill = (o) => slay(S, spawn(S, S.plan.cards[0], s.x + 6, s.z, o));
	A(S.coins === 0 && /₽ 0/.test(hudLine(S)), 'a run starts with no money (the readout shows ₽ 0)');
	for (let i = 0; i < 4; i++) kill(); A(S.coins === 0, 'four KOs: 0.8, not yet a whole ₽');
	kill(); A(S.coins === 1 && S.eco.earned === 1, 'the fifth makes 1');
	kill({ kind: 'elite' }); A(S.coins === 2, 'an elite pays 1');
	kill({ kind: 'alpha' }); A(S.coins === 7, 'an alpha pays 5');
	kill({ kind: 'totem' }); kill({ kind: 'summoner' }); A(S.coins === 13, 'a totem 5, a summoner 1');
	const b = spawn(S, S.plan.guardian, s.x + 6, s.z); b.xk = 'guardian'; slay(S, b);
	A(S.coins === 33, 'a guardian pays 20 in zone 1');
	L.I.takeVitamin(S.w.pl, 'nugget', 0); S.eco.mods.money = 0.25;
	A(near(goldK(S), 1.1 * 1.25), 'the Nugget (+ 10 %) and Gengar\'s greed (+ 25 %) multiply what you earn');
	kill({ kind: 'alpha' }); A(S.coins === 33 + 6 && near(S.eco.frac, 5 * 1.375 - 6, 1e-6), `an alpha now pays 6.875: 6 and the rest kept (${S.eco.frac.toFixed(3)})`, [S.coins, S.eco.frac]);
}

// ---------------------------------------------------------------- rocks, berries, cages
{
	const S = run(), rock = objs(S, 'rock')[0], berry = objs(S, 'berry')[0], cage = objs(S, 'cage')[0], pl = S.w.pl;
	at(S, rock); stepRun(S, null);
	A(S.coins === rock.v && stOf(S, rock) === USED && S.eco.log.rocks === 1 && !ecoView(S).some((o) => o.i === rock.i), `a gold rock: touch it for its ${rock.v} ₽, and it is gone`);
	at(S, berry); steps(S, 0.5);
	A(stOf(S, berry) === FRESH, 'a berry bush does nothing while you are unhurt');
	pl.hp = pl.maxHp * 0.2; steps(S, 0.1);
	A(near(pl.hp, pl.maxHp * 0.7, 0.001) && stOf(S, berry) === USED, 'hurt, it heals half your HP, once');
	S.coins = 10; at(S, cage);
	const t1 = says(S, 1);
	A(stOf(S, cage) === FRESH && S.coins === 10 && t1.some((q) => /need 20 ₽ more/.test(q)), 'a cage costs 30 ₽ in zone 1: with 10 it stays shut and says what you lack', t1);
	steps(S, 2); A(S.eco.log.freed === 0, 'standing there longer does not ask again');
	S.coins = 45; away(S); steps(S, 0.2); at(S, cage);
	const lv = pl.level, xp = pl.xp, need = pl.xpNext; steps(S, 0.9);
	A(stOf(S, cage) === USED && S.coins === 15 && S.eco.spent === 30 && (pl.level > lv || near(pl.xp - xp, Math.round(need * 0.5), 0.01)), `step away and back with the money: 0.8 s frees it for 30 ₽ and half a level of XP (${Math.round(need * 0.5)})`, [S.coins, pl.xp, pl.level]);
	// height
	const R = run(), r2 = objs(R, 'rock')[0]; put(R, r2.x, r2.z, r2.y + 3); R.w.pl.s.grounded = false; stepRun(R, null);
	A(R.coins === 0 && stOf(R, r2) === FRESH, '3 m above a rock is not touching it: a thing wants you on its level');
}

// ---------------------------------------------------------------- Poké Balls
{
	const S = run(), balls = objs(S, 'ball'), free = objs(S, 'freeball')[0], cursed = objs(S, 'cursedball')[0], pl = S.w.pl;
	at(S, balls[0]); const t0 = says(S, 0.6);
	A(stOf(S, balls[0]) === FRESH && !S.pick && t0.some((q) => /need 18 ₽ more/.test(q)), 'a Poké Ball costs 18 ₽: without it, it stays shut', t0);
	S.coins = 100; steps(S, 1); A(!S.pick, 'and it does not open under you when the money comes: step away first');
	away(S); steps(S, 0.2); at(S, balls[0]); steps(S, 0.3); A(!S.pick, '0.3 s on it is not enough');
	steps(S, 0.2);
	const P = S.pick;
	A(P && P.kind === 'ball' && P.ids.length === 3 && new Set(P.ids).size === 3 && P.ids.every((id) => L.I.IT[id]) && S.coins === 82 && S.eco.balls === 1 && stOf(S, balls[0]) === USED, `0.45 s: it opens for 18 ₽, three different items to choose from (${P && P.ids.join(', ')})`);
	const t = S.w.t; for (let i = 0; i < 30; i++) stepRun(S, null);
	A(S.w.t === t && S.pick === P, 'the fight holds while you choose');
	A(pickClose(S) === false && pickTake(S, 1) && !S.pick && pl.xi[P.ids[1]] === 1 && count(S) === 1, 'a ball\'s choice cannot be left; taking one closes it, and the item is yours');
	steps(S, 0.1); A(S.w.t > t, 'and the fight goes on');
	A(E.ballCost(1) === Math.round(18 * Math.pow(1.22, 0.65)) && E.ballCost(1) > 18, `the next one costs ${E.ballCost(1)}`);
	at(S, balls[1]); steps(S, 0.5);
	A(S.pick && S.coins === 82 - E.ballCost(1), 'and it does'); pickTake(S, 0);
	const n0 = count(S); at(S, free); steps(S, 0.5);
	A(!S.pick && count(S) === n0 + 1 && S.coins === 82 - E.ballCost(1) && stOf(S, free) === USED, 'a free ball: an item at once, no choice, no cost');
	const n1 = count(S), dex0 = S.plan.cards[0], e0 = spawn(S, dex0, pl.s.x + 9, pl.s.z); e0.dead = true;
	at(S, cursed); S.w.enemies.length = 0; steps(S, 0.5);
	const ghosts = S.w.enemies.filter((e) => K.GHOST_DEX.includes(e.dex)), e1 = spawn(S, dex0, pl.s.x + 9, pl.s.z);
	A(near(mods(S).diff, 0.05) && ghosts.length === 6 && count(S) >= n1 + 1 && count(S) <= n1 + 2 && near(e1.maxHp / e0.maxHp, 1.05, 0.01) && near(e1.dmg / e0.dmg, 1.05, 0.01), `a cursed ball: free, ${count(S) - n1} item(s), ${ghosts.length} ghosts round you, and from now on enemies have 5 % more HP and damage`, [ghosts.length, count(S) - n1, e1.maxHp / e0.maxHp]);
}

// ---------------------------------------------------------------- the Unown altars and the comet
{
	const S = run(), u1 = objs(S, 'unown1')[0], u3 = objs(S, 'unown3')[0], u4 = objs(S, 'unown4')[0];
	at(S, u1); steps(S, 4);
	A(near(S.eco.z.ch[u1.i], 0.5, 0.02) && stOf(S, u1) === ACTIVE, 'an Unown altar: 4 s in its circle, half charged');
	put(S, u1.x + K.UNOWN_R[0] * CELL - 0.3, u1.z, u1.y); steps(S, 1);
	A(near(S.eco.z.ch[u1.i], 0.625, 0.02), `the circle is ${K.UNOWN_R[0] * CELL} m across: its edge still charges`);
	away(S); steps(S, 2);
	A(near(S.eco.z.ch[u1.i], 0.5, 0.02), 'two seconds away: it drains at half the pace');
	at(S, u1); steps(S, 4.2);
	const P = S.pick;
	A(P && P.kind === 'unown' && P.ids.length === 3 && P.picks === 1 && stOf(S, u1) === USED && S.w.stats.spawned === 0, 'charged: its blessing, one of three; a plain altar calls no horde');
	pickTake(S, 0);
	// epic: hordes
	at(S, u3); steps(S, 0.1);
	const h1 = S.w.enemies.length; steps(S, 6.5); const h2 = S.w.enemies.length; steps(S, 0.6); const h3 = S.w.enemies.length;
	A(h1 === 8 && h2 === 8 && h3 === 16 && S.w.enemies.every((e) => e.xch === u3.i + 1), `an Epic altar calls a horde of 8 (6 + 2 x zone) as you start, and another every ${K.HORDE_EVERY} s while you charge it`, [h1, h2, h3]);
	steps(S, 15.2);
	A(S.pick && S.pick.ids.length === 4 && S.pick.picks === 1 && S.pick.ids.every((id) => L.I.IT[id].rar >= 2), `after ${K.UNOWN_T[2]} s: one of four, all Rare or better (${S.pick && S.pick.ids.map((id) => L.I.RAR[L.I.IT[id].rar]).join(', ')})`);
	pickTake(S, 0); S.w.enemies.length = 0;
	// golden: sealed
	const G4 = run(), g = objs(G4, 'unown4')[0]; at(G4, g); steps(G4, 5);
	A(G4.eco.z.ch[g.i] === 0 && G4.w.t < 90 && G4.w.enemies.length === 0, 'the Golden altar is sealed for the first 90 s');
	setZoneTime(G4, 90); steps(G4, 0.1);
	A(G4.w.enemies.length === 12, 'then it charges, with hordes of 12 (4 more)');
	steps(G4, K.UNOWN_T[3] + 0.2);
	const P4 = G4.pick;
	A(P4 && P4.ids.length === 4 && P4.picks === 2 && P4.ids.every((id) => L.I.IT[id].rar >= 3), `${K.UNOWN_T[3]} s: two of four, all Epic or better`);
	pickTake(G4, 0); A(G4.pick && pickTake(G4, 0) === false, 'after the first it is still up (and the same one cannot be taken twice)');
	pickTake(G4, 2); A(!G4.pick && count(G4) === 2, 'the second closes it');
	// the comet
	const C = run(), lay = layoutOf(C.w.room, C), c = objs(C, 'comet')[0];
	at(C, c); steps(C, 3);
	A(stOf(C, c) === FRESH && !ecoView(C).some((o) => o.kind === 'comet'), 'the comet is not there yet');
	away(C); setZoneTime(C, lay.cometAt - 0.05); const t = says(C, 0.2);
	A(stOf(C, c) === READY && t.some((q) => /comet shard has fallen/.test(q)) && ecoView(C).some((o) => o.kind === 'comet'), `at ${lay.cometAt} s it lands`);
	at(C, c); steps(C, K.COMET_T - 0.2); const uc = C.ult.c; steps(C, 0.3);
	A(C.pick && C.pick.kind === 'comet' && C.pick.ids.length === 3 && C.pick.ids.every((id) => L.I.IT[id].rar >= 1) && stOf(C, c) === USED, `${K.COMET_T} s in it: one of three, Uncommon or better`);
	A(K.COMET_ULT === 0.25 && C.ult.c - uc > 0.25 && C.ult.c - uc < 0.26 && C.pick.sub.endsWith(' · Ultimate +25 %'), 'the comet also gives + 25 % Ultimate charge, and says so', [uc, C.ult.c, C.pick && C.pick.sub]);
	const D = run(), d = objs(D, 'comet')[0], lay2 = layoutOf(D.w.room, D); setZoneTime(D, lay2.cometAt + 1); steps(D, 0.1); setZoneTime(D, lay2.cometAt + K.COMET_LIFE + 0.1); steps(D, 0.2);
	A(stOf(D, d) === GONE, `left alone it burns out after ${K.COMET_LIFE} s`);
}

// ---------------------------------------------------------------- the challenge, the cursed altar, Gengar's
{
	const S = run(), ch = objs(S, 'challenge')[0], cu = objs(S, 'cursedaltar')[0], gr = objs(S, 'greed')[0], ball = objs(S, 'ball')[0], pl = S.w.pl;
	at(S, ch); steps(S, 1.9); A(stOf(S, ch) === FRESH && S.w.enemies.length === 0, 'the challenge altar: 1.9 s is not enough');
	const base = spawn(S, S.plan.cards[0], pl.s.x, pl.s.z + 9); base.dead = true; S.w.enemies.length = 0;
	steps(S, 0.2);
	const wave = S.w.enemies.slice();
	A(stOf(S, ch) === ACTIVE && wave.length === 14 && wave.every((e) => e.xch === ch.i + 1), '2 s: a wave of 14 (10 + 4 x zone)');
	const same = wave.find((e) => e.dex === base.dex);
	A(!same || near(same.maxHp / base.maxHp, K.CHAL_HP, 0.02), `each with ${K.CHAL_HP} times the HP`);
	for (const e of wave.slice(1)) S.w.hit(e, 1e9, 0, 0, 0); steps(S, 0.2);
	A(stOf(S, ch) === ACTIVE, 'one still standing: not beaten yet');
	S.w.hit(wave[0], 1e9, 0, 0, 0); const t = says(S, 0.2);
	A(stOf(S, ch) === READY && t.some((q) => /Great Ball/.test(q)) && ecoView(S).find((o) => o.i === ch.i).kind === 'great', 'the last one down: the altar becomes a Great Ball');
	away(S); steps(S, 0.2); at(S, ch); steps(S, 0.5);
	A(S.pick && S.pick.ids.length === 3 && S.pick.ids.every((id) => L.I.IT[id].rar >= 1) && stOf(S, ch) === USED && S.eco.spent === 0, 'stand on it: one of three, Uncommon or better, free');
	pickTake(S, 0);
	const n0 = count(S); at(S, cu); steps(S, 1.7);
	const got = Object.keys(pl.xi).map((id) => L.I.IT[id].rar);
	A(stOf(S, cu) === USED && count(S) === n0 + 1 && Math.max(...got) >= 2 && near(mods(S).diff, 0.08) && near(mods(S).rate, 0.15), 'the cursed altar (1.6 s): a Rare or better item; + 8 % difficulty, + 15 % arrivals');
	at(S, gr); steps(S, 1.7);
	const M = mods(S);
	A(near(M.diff, 0.18) && near(M.xp, 0.15) && near(M.money, 0.25) && M.loot === 1, 'Gengar\'s altar: + 10 % difficulty, + 15 % XP, + 25 % money, one more card in every ball');
	const keep = { ...M }; M.diff = 0; M.xp = 0; const now = spawn(S, S.plan.cards[0], pl.s.x, pl.s.z + 9); Object.assign(M, keep);
	const e = spawn(S, S.plan.cards[0], pl.s.x, pl.s.z + 9), def = e.def;
	A(near(e.maxHp / now.maxHp, 1.18, 0.01) && e.xp === Math.round(Math.round(def.xp * X.K.XP_K) * 1.15), 'enemies are that much tougher, and worth that much more');
	S.coins = 50; at(S, ball); steps(S, 0.5);
	A(S.pick && S.pick.ids.length === 4, 'and a Poké Ball now offers four');
}

// ---------------------------------------------------------------- Ditto and Hypno
{
	const S = run(), ditto = objs(S, 'ditto')[0], hyp = objs(S, 'hypno')[0], pl = S.w.pl;
	at(S, ditto); const t = says(S, 1);
	A(stOf(S, ditto) === FRESH && t.some((q) => /nothing to copy/.test(q)), 'Ditto, with no items: nothing to copy, and it stays');
	takeItem(S, 'leftovers'); takeItem(S, 'choiceband'); away(S); steps(S, 0.2); at(S, ditto); steps(S, 0.9);
	A(stOf(S, ditto) === USED && pl.xi.leftovers === 2 && pl.xi.choiceband === 1, 'with Leftovers and a Choice Band (already at its cap of one): it copies the Leftovers', items(S));
	at(S, hyp); const t2 = says(S, 1);
	A(!S.pick && t2.some((q) => /no vitamins/.test(q)), 'Hypno, with no vitamins: nothing to forget');
	for (const id of ['protein', 'iron', 'hpup']) L.I.takeVitamin(pl, id, 0);
	const hp = pl.maxHp; away(S); steps(S, 0.2); at(S, hyp); steps(S, 0.9);
	A(S.pick && S.pick.kind === 'hypno' && S.pick.vit.join() === 'protein,iron,hpup', 'with three: which one to forget?');
	A(pickClose(S) && !S.pick && stOf(S, hyp) === FRESH && pl.xv.length === 3, 'you may keep them all: Hypno stays for later');
	away(S); steps(S, 0.2); at(S, hyp); steps(S, 0.9); pickTake(S, 2);
	A(!S.pick && pl.xv.length === 2 && pl.maxHp === hp - 18 && stOf(S, hyp) === USED && offerCards(S).length === 3 && S.eco.log.hypno === 1, 'forget HP Up: its 18 HP go, its slot is free again, and Hypno is gone');
}

// ---------------------------------------------------------------- Meowth
{
	const S = run(), lay = layoutOf(S.w.room, S), v = lay.visits, stall = lay.objs[v[0].spot], pl = S.w.pl;
	at(S, stall); steps(S, 1);
	A(!S.pick && !ecoView(S).some((o) => o.kind === 'meowth'), 'before his first visit the stall is empty');
	away(S); setZoneTime(S, v[0].at - 0.05); const t = says(S, 0.2);
	A(t.some((q) => /Meowth has opened/.test(q)) && ecoView(S).filter((o) => o.kind === 'meowth').length === 1 && S.eco.z.stock.length === 3, `at ${v[0].at} s Meowth opens at one stall, with three items`);
	S.coins = 1000; at(S, stall); steps(S, 0.1);
	const P = S.pick, rar = P.ids.map((id) => L.I.IT[id].rar);
	A(P && P.kind === 'shop' && P.prices.join() === rar.map((r) => K.PRICE[r]).join(), `walk up: his prices by rarity (${P.prices.join(', ')} ₽)`);
	const c0 = S.coins; pickTake(S, 0);
	A(S.pick && S.coins === c0 - P.prices[0] && pl.xi[P.ids[0]] === 1 && S.eco.buys === 1 && !pickTake(S, 0), 'buy one: it is yours, the stall stays open, and it cannot be bought twice');
	pickTake(S, 1);
	A(S.eco.buys === 2 && near(P.prices[2], K.PRICE[rar[2]]), 'two buys are at list price');
	const c2 = S.coins; pickTake(S, 2);
	A(S.coins === c2 - K.PRICE[rar[2]] && E.heatOf(3, 0) === 1 && E.price(0, 1, 1) === Math.round(30 * 1.15) && E.price(0, 1, 2) === Math.round(30 * 1.15 * 1.32), `the market heats after that: a Common would now be ${E.price(0, 1, 1)} ₽, then ${E.price(0, 1, 2)}; opening three balls cools it one step`);
	A(E.heatOf(3, 3) === 0 && E.price(2, 2, 0) === Math.round(95 * 1.3), `zone 2's list prices are 30 % higher (a Rare: ${E.price(2, 2, 0)} ₽)`);
	A(pickClose(S) && !S.pick, 'walk away to leave');
	steps(S, 1); A(!S.pick, 'he does not call you back while you stand there');
	setZoneTime(S, v[0].until + 0.1); const t3 = says(S, 0.2);
	A(t3.some((q) => /packs up/.test(q)) && !ecoView(S).some((o) => o.kind === 'meowth'), `after ${K.MEOWTH_STAY} s he packs up`);
	setZoneTime(S, v[1].at + 1); steps(S, 0.2);
	A(S.eco.z.spot === v[1].spot && v[1].spot !== v[0].spot && S.eco.z.sold === 0, 'his next visit is at another stall, with new stock');
	// a shop that closes under you
	at(S, lay.objs[v[1].spot]); steps(S, 0.1); const open = !!S.pick; S.pick = null; S.pick = { kind: 'shop', ids: [], taken: [], picks: 99 };
	setZoneTime(S, v[1].until + 1); stepRun(S, null);
	A(open, 'the second stall opens too');
}

// ---------------------------------------------------------------- the slot machine
{
	const S = run(), slot = objs(S, 'slots')[0], pl = S.w.pl, cost = E.slotCost(1);
	at(S, slot); const t = says(S, 1);
	A(cost === 15 && S.eco.log.spins === 0 && t.some((q) => /need 15 ₽ more/.test(q)), 'a spin costs 15 ₽ in zone 1 (the run\'s own money); without it nothing turns');
	const seen = new Set(); let ok = true, why = null, spins = 0;
	for (let k = 0; k < 60 && stOf(S, slot) !== USED; k++) {
		S.coins = 500; S.w.enemies.length = 0; away(S); steps(S, 0.2);
		const r = peekSpin(S, slot.i), p = E.payout(r), sym = K.SLOT_SYM[p.sym], hp0 = (pl.hp = pl.maxHp * 0.5), n0 = count(S);
		at(S, slot); steps(S, 0.85); spins++;
		const got = S.coins - 500 + cost, foes = S.w.enemies.length; seen.add(p.kind + (p.kind === 'triple' ? ':' + sym : ''));
		const good = p.kind === 'none' ? got === 0 && foes === 0 && !S.pick
			: p.kind === 'pair' ? got === cost * 2 && !S.pick
			: p.kind === 'bad' ? got === 0 && foes === 4 && S.w.enemies.every((e) => e.dex === 100)
			: p.kind === 'boom' ? got === 0 && foes === 6 && S.w.enemies.every((e) => e.dex === 101) && stOf(S, slot) === USED
			: sym === 'nugget' ? got === cost * 15
			: sym === 'berry' ? pl.hp > hp0 && count(S) === n0 + 1
			: !!S.pick && S.pick.ids.length === (sym === 'master' ? 4 : 3) && S.pick.picks === (sym === 'master' ? 2 : 1) && S.pick.ids.every((id) => L.I.IT[id].rar >= { poke: 0, great: 1, ultra: 2, master: 3 }[sym]);
		if (!good) { ok = false; why = why || [k, r, p, got, foes, !!S.pick]; }
		while (S.pick) pickTake(S, S.pick.taken.length);
		for (const id of Object.keys(pl.xi)) delete pl.xi[id];
	}
	A(ok && S.eco.log.spins === spins && seen.has('none') && seen.has('pair') && seen.has('bad'), `${spins} spins, each paid as the 2D game's reels and pay table say (seen: ${[...seen].join(', ')})`, why);
	A(E.payout([6, 6, 6]).kind === 'boom' && E.payout([5, 5, 5]).kind === 'triple' && E.payout([6, 6, 0]).kind === 'bad' && E.payout([1, 6, 1]).kind === 'pair' && E.payout([0, 1, 2]).kind === 'none', 'three Voltorb break the machine, two spring an ambush, a pair pays double, three Nuggets fifteen times');
}

// ---------------------------------------------------------------- items
{
	const mk = (moves = ['ember', 'tackle']) => { const S = run({ moves }); return S; };
	const mv = (S, id) => S.w.pl.moves.find((m) => m.id === id);
	const foe = (S, dx = 1.2, o = {}) => { const s = S.w.pl.s, e = spawn(S, 19, s.x + dx, s.z, o); e.dummy = true; e.maxHp = e.hp = o.hpSet || 1e6; return e; };
	const hit = (S, dmg, type = null) => { const s = S.w.pl.s, hp = S.w.pl.hp; S.w.pl.invuln = 0; hazard(S.w, { kind: 'zone', x: s.x, y: s.y, z: s.z, r: 3, delay: 0, dmg, type }); steps(S, 0.05); return hp - S.w.pl.hp; };
	A(L.I.ITEMS.length === 60 && L.I.ITEMS.filter((q) => q.type).length === 18, 'the 2D game\'s 60 items: 18 type boosters and 42 others');
	let S = mk(); const t0 = mv(S, 'tackle').dmg, e0 = mv(S, 'ember').dmg;
	A(takeItem(S, 'muscleband') === 1 && near(mv(S, 'tackle').dmg, t0 * 1.12) && mv(S, 'ember').dmg === e0, 'a Muscle Band: + 12 % to physical moves');
	for (let i = 0; i < 3; i++) takeItem(S, 'muscleband');
	const hp = (S.w.pl.hp = S.w.pl.maxHp * 0.5);
	A(S.w.pl.xi.muscleband === 4 && near(mv(S, 'tackle').dmg, t0 * 1.48) && takeItem(S, 'muscleband') === 0 && S.w.pl.xi.muscleband === 4 && near(S.w.pl.hp, hp + S.w.pl.maxHp * 0.2), 'they stack (four: + 48 %) up to its cap; one more is a small heal instead');
	takeItem(S, 'charcoal');
	A(near(mv(S, 'ember').dmg / e0, 1.30) && near(S.w.pl.atkMul, 1.03), 'Charcoal: + 30 % to Fire moves, + 3 % to everything');
	S = mk(); const m0 = S.w.pl.maxHp, a0 = S.w.pl.atkMul; takeItem(S, 'lifeorb');
	A(near(S.w.pl.atkMul, a0 * 1.3) && S.w.pl.maxHp === m0 - Math.round(m0 * 0.1), 'a Life Orb: + 30 % damage for 10 % of your max HP');
	// thorns
	S = mk(); takeItem(S, 'rockyhelmet'); let e = foe(S); const h0 = e.hp; hit(S, 10);
	A(h0 - e.hp === 25 && e.a.kx !== undefined, 'a Rocky Helmet: whoever is on you when you are hit takes 25');
	// the Focus Band and the revives
	S = mk(); S.w.pl.xi.focusband = 2; S.w.pl.xv.push(); let held = 0, tries = 0;
	for (let i = 0; i < 300; i++) { const R = mk(); takeItem(R, 'focusband'); takeItem(R, 'focusband'); R.w.rand = makeRng(i + 1); R.w.pl.hp = 5; hit(R, 500); tries++; if (!R.w.pl.dead && R.w.pl.hp === 1) held++; if (i === 0) { R.w.pl.hp = 1; hit(R, 500); if (!R.w.pl.dead) held = -999; } }
	A(near(held / tries, 0.3, 0.3), `two Focus Bands: a 30 % chance to hold on at 1 HP (${held} of ${tries}), not twice within 20 s`);
	S = mk(); takeItem(S, 'revive'); takeItem(S, 'maxrevive'); S.w.pl.maxHp = 1000; S.w.pl.hp = 5; hit(S, 500);
	A(!S.w.pl.dead && S.w.pl.hp === 300 && S.w.pl.xproc.revives === 0, 'a Revive: back at 30 %, once');
	S.w.pl.hp = 5; hit(S, 5000);
	A(!S.w.pl.dead && S.w.pl.hp === 600, 'then the Max Revive: back at 60 %');
	S.w.pl.hp = 5; hit(S, 5000); A(S.w.pl.dead && S.ended && S.lost, 'and then nothing is left: down');
	S = mk(); takeItem(S, 'revivalherb'); S.w.pl.maxHp = 1000; S.w.pl.hp = 5; e = foe(S, 4); const far = foe(S, 20); hit(S, 500);
	A(!S.w.pl.dead && S.w.pl.hp === 400 && e.hp < 1e6 && e.burn > 0 && far.hp === 1e6, 'a Revival Herb: back at 40 % in flames (what is near burns)');
	S.w.pl.hp = 5; hit(S, 5000); A(S.w.pl.dead, 'once a zone');
	// Sitrus, the Weakness Policy
	S = mk(); takeItem(S, 'sitrusberry'); S.w.pl.maxHp = 1000; S.w.pl.hp = 390; steps(S, 0.05);
	A(near(S.w.pl.hp, 640, 0.01), 'a Sitrus Berry: under 40 % HP it gives back 25 %');
	S.w.pl.hp = 100; steps(S, 5); A(S.w.pl.hp < 200, 'not again within a minute');
	S = mk(); takeItem(S, 'weaknesspolicy'); e = foe(S);
	const plain = land(S.w, e, 100, 0, 0, 0, { kind: 'item' }); hit(S, 10); const boosted = land(S.w, e, 100, 0, 0, 0, { kind: 'item' }); steps(S, 6.1); const after = land(S.w, e, 100, 0, 0, 0, { kind: 'item' });
	A(near(boosted / plain, 1.3) && near(after, plain), 'a Weakness Policy: for 6 s after a hit you deal 30 % more');
	// the hit modifiers
	S = mk(); takeItem(S, 'expertbelt'); e = foe(S); e.types = ['grass'];
	A(near(land(S.w, e, 100, 0, 0, 0, { type: 'fire', kind: 'item' }), 100 * data.typeMult('fire', ['grass']) * 1.3) && near(land(S.w, e, 100, 0, 0, 0, { type: 'normal', kind: 'item' }), 100), 'an Expert Belt: + 30 % on a super-effective hit only');
	S = mk(); takeItem(S, 'deepseatooth'); e = foe(S); const b = foe(S); b.boss = true;
	A(near(land(S.w, b, 100, 0, 0, 0, { kind: 'item' }), 125) && near(land(S.w, e, 100, 0, 0, 0, { kind: 'item' }), 100), 'a Deep Sea Tooth: + 25 % to bosses');
	S = mk(); takeItem(S, 'razorfang'); e = foe(S, 1.2, { hpSet: 1000 }); e.hp = 79; const e2 = foe(S, 1.5, { hpSet: 1000 }); e2.hp = 81; land(S.w, e, 5, 0, 0, 0, { kind: 'item' }); land(S.w, e2, 5, 0, 0, 0, { kind: 'item' });
	A(e.dead && !e2.dead && e2.hp === 76, 'a Razor Fang: any hit finishes an enemy under 8 % HP (not one at 8.1 %)');
	S = mk(); for (let i = 0; i < 3; i++) takeItem(S, 'kingsrock'); e = foe(S); let fl = 0; for (let i = 0; i < 500; i++) { e.frozenT = 0; land(S.w, e, 1, 0, 0, 0, { kind: 'item' }); if (e.frozenT > 0) fl++; }
	A(near(fl / 500, 0.18, 0.3), `three King's Rocks: 18 % of hits make it flinch (${fl} of 500)`);
	S = mk(); takeItem(S, 'reliccrown'); e = foe(S, 3); const e3 = foe(S, 6); steps(S, 20.1); e.frozenT = e3.frozenT = 0; land(S.w, e, 1, 0, 0, 0, { kind: 'item' });
	const froze = e.frozenT > 0.9 && e3.frozenT > 0.9; e.frozenT = e3.frozenT = 0; land(S.w, e, 1, 0, 0, 0, { kind: 'item' });
	A(froze && e3.frozenT === 0, 'a Relic Crown: a hit stops time for everything near, once every 20 s');
	// the four strikes
	S = mk(); takeItem(S, 'electirizer'); const four = [foe(S, 2), foe(S, 3), foe(S, 4), foe(S, 5)]; steps(S, 2.55);
	A(four.slice(0, 3).every((q) => q.hp < 1e6) && four[3].hp === 1e6, 'an Electirizer: a bolt on the three nearest every 2.5 s');
	S = mk(); takeItem(S, 'magmarizer'); e = foe(S, 5); const out = foe(S, 9); steps(S, 4.05);
	A(e.hp < 1e6 && e.burn > 0 && out.hp === 1e6, 'a Magmarizer: a ring of fire round you every 4 s, and it burns');
	S = mk(); takeItem(S, 'sunstone'); e = foe(S, 6); const by = foe(S, 9), off = foe(S, 24); steps(S, 6.05);   /* (24 m, not 16: the strike is Grass, and on a foe your Ember has set alight it is an Inferno, whose burn spreads 7 m from each it hits) */
	A(e.hp < 1e6 && by.hp < 1e6 && off.hp === 1e6, 'a Sun Stone: a strike on the nearest every 6 s, and on what stands by it');
	S = mk(); takeItem(S, 'meteorite'); e = foe(S, 6); const e4 = foe(S, 12); const x4 = e4.a.x; steps(S, 8.05);
	const pulled = S.lv.rifts.length === 1, x6 = e.a.x; steps(S, 1); const moved = Math.abs(e.a.x - x6) + Math.abs(e4.a.x - x4); steps(S, 0.6);
	A(pulled && moved > 3 && S.lv.rifts.length === 0 && (e.hp < 1e6 || e4.hp < 1e6), `a Meteorite: every 8 s a rift drags them in (${moved.toFixed(1)} m in a second), then bursts`);
	// drops
	S = mk(); S.w.pl.s.x += 0; const ev = { at: 0, kind: 'alpha', n: 1, dex: [19], seed: 5 }; fire(S, ev); const al = S.w.enemies[0]; slay(S, al); steps(S, 8.2);   // (it faints; left alone its prize falls)
	const it = S.w.pickups.find((p) => p.kind === 'item');
	A(it && L.I.IT[it.value] && S.w.pickups.some((p) => p.kind === 'heal') && S.coins === 5, `an alpha pays 5 ₽ and, not caught, leaves an item (${it && it.value}) and a berry`);
	put(S, it.x, it.z, it.y); steps(S, 0.3);
	A(S.w.pl.xi[it.value] === 1 && !S.w.pickups.includes(it), 'walk over it: it is yours');
}

// ---------------------------------------------------------------- choices by themselves, and the same run twice
{
	const S = run({ autoPick: 0 }), ball = objs(S, 'ball')[0]; S.coins = 50; at(S, ball); steps(S, 0.6);
	A(!S.pick && count(S) === 1 && S.w.t > 0.6, 'a run told to choose by itself takes a ball\'s first item and goes on');
	const play = () => { const R = run({ autoPick: 0, moves: [['ember', 3]] }), lay = layoutOf(R.w.room, R); R.coins = 300; for (const o of lay.objs.slice(0, 30)) { at(R, o); steps(R, o.kind.startsWith('unown') ? 9 : 1.8); } return [R.coins, JSON.stringify(R.w.pl.xi), R.eco.used, R.w.stats.kills, JSON.stringify(R.eco.mods)].join('|'); };
	const a = play(), b = play();
	A(a === b && /\{"/.test(a), 'the same seed and the same walk through the zone: the same money, items and curses', [a, b]);
	const S2 = newRun(data, X, { seed: 3, dex: 6, eco: false });
	A(!S2.eco && S2.lv && !/₽/.test(hudLine(S2)), 'a run asked for without an economy has none (its level-ups stay)');
	const pool = rollOffers(run(), makeRng(9), 5, 3);
	A(pool.length === 5 && new Set(pool).size === 5 && pool.every((id) => L.I.IT[id].rar >= 3), 'offers asked for at Epic or better are that, and all different');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
