// micasurvivor_m3d_expcoop_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): two players in one
// Expedition run (micasurvivor/m3d/expcoop.js, on coop.js), in node. A HOST's run and a GUEST's side of it run tick
// for tick and talk only through the messages a transport would carry (as text, ten a second each way, 100 ms late).
//   * the guest is told the run by the row in the host's frames, and builds the same zone itself; it is its own
//     League member, with its own stats and kit
//   * its moves hurt the host's enemies; what it finishes pays the team
//   * a party's run is tougher: more arrivals, tougher enemies, a tougher guardian
//   * the altar and the portal count ANYONE: a guest alone wakes the guardian; either takes the team through the
//     portal, and both arrive in the next zone's level
//   * the level is the team's, the cards are each player's own; the fight waits for both; each learns its own kit
//   * a guest that evolves is the new stage on the host's side too
//   * the run is over only when everyone is down
//   * a guest uses the zone's things: the host keeps their state and the team's money, the guest rolls and keeps what
//     is its own (rocks, berries, the three balls, altars, Ditto, Hypno, cages, Meowth, the slot machine)
//   * a guest catches: its own Support Alpha, fighting from its side; a full team kept sends the prize back
//   node overworld/tests/micasurvivor_m3d_expcoop_test.mjs
import { hashRoom } from '../../micasurvivor/m3d/gen.js';
import { dataFrom, gainXp, choose } from '../../micasurvivor/m3d/combat.js';
import { keepEvents, diff, NK } from '../../micasurvivor/m3d/net.js';
import { hostAdd, hostStep, hostFrame, hostApply, guestSync, guestMsg, guestApply } from '../../micasurvivor/m3d/coop.js';
import { expFrom, newRun, stepRun, spawn, fire, bossHp, capNow, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { EK, FRESH, USED, layoutOf, mods, pickTake, pickClose, shopPrices } from '../../micasurvivor/m3d/expeco.js';
import { total } from '../../micasurvivor/m3d/explevel.js';
import { runRow } from '../../micasurvivor/m3d/expnet.js';
import { guestRun, guestRunApply, stepGuest } from '../../micasurvivor/m3d/expcoop.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), XG = expFrom(loadG()), dataG = dataFrom(loadG()), EVERY = Math.round(60 / NK.HZ);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const pickUp = (w, cs) => { const i = cs.findIndex((c) => c.type === 'up' && c.kind === 'move'); return i >= 0 ? i : Math.max(0, cs.findIndex((c) => c.type !== 'swap')); };

/** A host's run and a guest in it, joined by a line that delays everything `lag` ticks each way. */
function party(o = {}) {
	const lag = 6, H = newRun(data, X, { seed: 31, dex: 6, league: true, weather: false, autoPick: o.hostPick === null ? undefined : pickUp, ...(o.host || {}) });
	H.plan.events = []; H.acc = -1e9;
	const Gs = guestRun(dataG, XG, { seed: 0, id: o.id || 1, dex: 9, autoPick: o.guestPick === null ? undefined : pickUp });   // (it knows nothing of the run yet but that it is joining one)
	const mate = hostAdd(H.w, o.id || 1, Gs.w.pl.mon.dex);
	const P = { H, G: Gs, mate, n: 0, toGuest: [], toHost: [], ev: [], prev: null, says: [], gsays: [], quiet: true, known: false };
	P.step = (sec = 1 / 60, inH = null, inG = null) => {
		for (let i = 0, n = Math.max(1, Math.round(sec * 60)); i < n; i++) {
			if (P.quiet) H.acc = -1e9;
			hostStep(H.w); stepRun(H, inH); P.says.push(...H.says.map((q) => q.text)); keepEvents(P.ev, H.w.events);
			guestSync(Gs.w); stepGuest(Gs, inG);
			if (P.n % EVERY === 0) {
				const f = hostFrame(H.w, P.ev); f.r = runRow(H); P.ev = [];
				P.toGuest.push([P.n + lag, JSON.stringify(P.n % (EVERY * 10) === 0 || !P.prev ? f : diff(P.prev, f))]); P.prev = f;
				P.toHost.push([P.n + lag, JSON.stringify(guestMsg(Gs.w))]);
			}
			while (P.toGuest.length && P.toGuest[0][0] <= P.n) { guestApply(Gs.w, JSON.parse(P.toGuest.shift()[1])); const last = Gs.w.co.viewer.last; if (last && last.r) { guestRunApply(Gs, last.r); P.known = true; } }
			while (P.toHost.length && P.toHost[0][0] <= P.n) hostApply(H.w, o.id || 1, JSON.parse(P.toHost.shift()[1]));
			P.n++;
		}
		return P;
	};
	P.put = (who, p) => { const s = who.w.pl.s; s.x = p[0]; s.y = p[1]; s.z = p[2]; s.vx = s.vy = s.vz = 0; s.grounded = true; };
	H.w.pl.maxHp = H.w.pl.hp = 1e6; Gs.w.pl.maxHp = Gs.w.pl.hp = 1e6;
	return P.step(0.5);
}

// ---------------------------------------------------------------- the guest in the run
{
	const P = party(), { H, G: Gs } = P;
	A(P.known && Gs.zone === 1 && hashRoom(Gs.w.room) === hashRoom(H.w.room) && Gs.w.room.altar.join() === H.w.room.altar.join() && Gs.rv.map === 'viridian', 'a guest that knew nothing of the run is told it in the host\'s frames, and builds zone 1 itself: the same level');
	const st = X.G.statsOf(7);
	A(Gs.lg && Gs.lg.member === 7 && Gs.w.pl.mon.dex === 7 && Gs.w.pl.moves.map((m) => m.id).join() === X.G.BY[7].kit[0] && near(Gs.w.pl.baseAtk, st.atk) && H.lg.member === 4, 'it is its own League member (asked for as Blastoise: a Squirtle, with Squirtle\'s kit and stats), beside the host\'s Charmander');
	A(H.w.mates.length === 1 && P.mate.dex === 7 && Math.hypot(P.mate.s.x - Gs.w.pl.s.x, P.mate.s.z - Gs.w.pl.s.z) < 0.5 && Math.hypot(Gs.w.pl.s.x - H.w.pl.s.x, Gs.w.pl.s.z - H.w.pl.s.z) > 1, 'it arrives beside the host, not on top of it, and the host has it where it is');
	// its moves on the host's enemies
	const s = Gs.w.pl.s, e = spawn(H, 19, s.x + 2.5, s.z); e.dummy = true; e.maxHp = e.hp = 30; H.w.pl.moves.length = 0;
	const coins = H.coins; for (let k = 0; k < 4; k++) { const q = spawn(H, 19, s.x + 2.5, s.z + (k - 2)); q.dummy = true; q.maxHp = q.hp = 20; }
	P.step(8);
	A(e.dead && H.w.stats.kills >= 5 && Gs.w.stats.hits > 0 && H.coins === coins + 1 && Gs.coins === H.coins, `the guest's Water Gun finishes five of the host's enemies: the KOs pay the team (${H.coins} ₽ on both screens)`, [H.w.stats.kills, Gs.w.stats.hits, H.coins, Gs.coins]);
	// tougher for two
	// (the same run at the same moment, with and without its second player)
	const mates = H.w.mates; H.w.mates = []; const a = spawn(H, 19, H.w.pl.s.x + 6, H.w.pl.s.z); a.dead = true; H.w.mates = mates;
	const b = spawn(H, 19, H.w.pl.s.x + 6, H.w.pl.s.z); b.dead = true;
	const one = bossHp(X.K, { zone: 1, t: 60, players: 1 }).hp, two = bossHp(X.K, { zone: 1, t: 60, players: 2 }).hp;
	A(near(b.maxHp / a.maxHp, 1.3, 0.05) && near(two / one, 1.3 * 1.4, 0.001), `with two players an enemy has ${(b.maxHp / a.maxHp).toFixed(2)} times the HP and a guardian ${(two / one).toFixed(2)} times`);
	P.quiet = false; H.acc = 0; P.step(1 / 60); const with2 = H.acc; H.w.mates = []; H.acc = 0; stepRun(H, null); const with1 = H.acc; H.w.mates = mates; P.quiet = true;
	A(near(with2 / with1, 1.75, 0.02), 'and arrivals come 1.75 times as fast', [with2, with1]);
}

// ---------------------------------------------------------------- the altar, the guardian, the portal
{
	const P = party(), { H, G: Gs } = P, altar = H.w.room.altar;
	P.put(Gs, altar); P.step(1.6);
	A(near(H.charge, 0.5, 0.08) && near(Gs.charge, H.charge, 0.12) && H.ph === 0, `the guest alone on the altar charges it (${Math.round(H.charge * 100)} %): the guest sees it charge too`);
	P.step(1.9);
	A(H.ph === 1 && H.boss && Gs.ph === 1 && Gs.rv.boss && Gs.rv.boss.dex === H.plan.guardian && Gs.w.enemies.some((e) => e.boss) && P.says.some((q) => /the guardian, awakens!/.test(q)), 'and wakes the guardian, for both');
	A(H.boss.maxHp === bossHp(X.K, { zone: 1, t: H.bosses[0].at, players: 2 }).hp, `it has a party's HP (${H.boss.maxHp})`);
	P.put(Gs, H.w.room.spawn); P.put(H, H.w.room.spawn); H.w.hit(H.boss, 1e12, 0, 0, 0); P.step(0.5);
	A(H.ph === 2 && Gs.ph === 2, 'it falls: the portal, for both');
	const h1 = hashRoom(H.w.room); P.put(Gs, altar); P.step(3);   // (the guardian's XP is a level: the fight waits for both to choose before anyone goes anywhere)
	const sp = H.w.room.spawn, gs = Gs.w.pl.s, hs = H.w.pl.s;
	A(H.zone === 2 && Gs.zone === 2 && hashRoom(H.w.room) !== h1 && hashRoom(Gs.w.room) === hashRoom(H.w.room), 'the GUEST steps into the portal: the whole team goes; both are on zone 2\'s level');
	A(Math.hypot(hs.x - sp[0], hs.z - sp[2]) < 1 && Math.hypot(gs.x - sp[0], gs.z - sp[2]) < 4 && Math.hypot(gs.x - sp[0], gs.z - sp[2]) > 0.5 && Math.hypot(P.mate.s.x - gs.x, P.mate.s.z - gs.z) < 0.6 && Gs.w.enemies.length === 0, 'each arrives where the zone starts (the guest beside the host), and the host has the guest there', [[hs.x, hs.z], [gs.x, gs.z], sp, [P.mate.s.x, P.mate.s.z], Gs.w.enemies.length]);
	// the host can take it too
	P.put(H, H.w.room.altar); P.step(3.4); P.put(H, H.w.room.spawn); P.put(Gs, H.w.room.spawn); H.w.hit(H.boss, 1e12, 0, 0, 0); P.step(0.3); P.put(H, H.w.room.altar); P.step(3);
	A(H.zone === 3 && Gs.zone === 3 && hashRoom(Gs.w.room) === hashRoom(H.w.room) && H.splits.length === 2, 'and the host through the next: zone 3 for both', [H.zone, Gs.zone, H.ph, H.splits]);
}

// (a player's number in a party can be any number: on the page it is a large random one)
{
	const P = party({ id: 64105 }), { H, G: Gs } = P, sp = H.w.room.spawn, d = Math.hypot(Gs.w.pl.s.x - sp[0], Gs.w.pl.s.z - sp[2]);
	A(d > 0.5 && d < 6 && Math.hypot(P.mate.s.x - Gs.w.pl.s.x, P.mate.s.z - Gs.w.pl.s.z) < 0.5, `a guest numbered 64105 still arrives beside the host (${d.toFixed(1)} m away)`, [Gs.w.pl.s.x, sp]);
}

// ---------------------------------------------------------------- levels and cards
{
	const P = party({ hostPick: null, guestPick: null }), { H, G: Gs } = P, hp = H.w.pl, gp = Gs.w.pl;
	gainXp(H.w, (hp.xpNext - hp.xp + 0.5) / hp.xpMul); P.step(0.6);
	const hc = hp.choices, gc = gp.choices;
	A(hp.level === 2 && gp.level === 2 && hc && gc && hc.length === 3 && gc.length === 3 && hc[0].kind === 'move' && gc[0].kind === 'move', 'the team levels: both have three cards up, a move first');
	A(hc.map((c) => c.key).join() !== gc.map((c) => c.key).join() && gc.every((c) => c.kind !== 'move' || X.G.BY[7].kit.includes(c.id) || true) && gc[0].id === gp.moves[0].id, 'each is dealt their own (the guest\'s are for its Squirtle)', [hc.map((c) => c.key), gc.map((c) => c.key)]);
	A(gp.moves.map((m) => m.id).join() === X.G.BY[7].kit.slice(0, 2).join() && hp.moves.map((m) => m.id).join() === X.G.BY[4].kit.slice(0, 2).join(), 'at Lv 2 each has learned its own kit\'s second move');
	const t = H.w.t; choose(H.w, 0); P.step(0.8);
	A(H.w.t === t && gp.choices, 'the host chooses; the fight waits for the guest');
	choose(Gs.w, 0); P.step(0.8);
	A(H.w.t > t && !hp.choices && !gp.choices && Gs.lv.log.length === 1 && H.lv.log.length === 1, 'the guest chooses: the fight goes on');
	// an evolution on the guest's side
	H.w.autoPick = pickUp; Gs.w.autoPick = pickUp;
	let g = 0; while (hp.level < 16 && g++ < 300) { gainXp(H.w, (hp.xpNext - hp.xp + 0.5) / hp.xpMul); P.step(0.4); }
	P.step(1);
	A(hp.level === 16 && gp.level === 16 && Gs.lg.form === 8 && gp.mon.dex === 8 && H.lg.form === 5 && P.mate.dex === 8 && P.mate.mon.dex === 8, 'at Lv 16 both evolve, each on its own side; the host has the guest as a Wartortle now', [hp.level, gp.level, Gs.lg.form, P.mate.dex]);
	A(gp.moves.length === 4 && gp.moves.map((m) => m.id).join() === X.G.BY[7].kit.join(), 'and the guest has its whole kit');
}

// ---------------------------------------------------------------- down
{
	const P = party(), { H, G: Gs } = P;
	H.w.pl.hp = 0; H.w.pl.dead = true; P.step(1);
	A(!H.ended && H.w.t > 1 && !Gs.ended, 'the host goes down: the run goes on while the guest stands');
	P.put(Gs, [H.w.pl.s.x + 0.6, H.w.pl.s.y, H.w.pl.s.z]); P.step(3.3);
	A(!H.w.pl.dead && !H.ended, 'the guest beside it for 3 s: the host is up again (P3n\'s revive, in a run)');
	H.w.pl.hp = 0; H.w.pl.dead = true; Gs.w.pl.hp = 0; Gs.w.pl.dead = true; P.step(1);
	A(H.ended && H.lost && Gs.ended && Gs.lost, 'both down: the run is over, for both');
	const solo = newRun(data, X, { seed: 31, dex: 6, league: true }); stepRun(solo, null); solo.w.pl.hp = 0; solo.w.pl.dead = true; stepRun(solo, null);
	A(solo.ended && solo.lost && capNow(solo) === 110, 'alone, going down still ends it at once');
}

// ---------------------------------------------------------------- a guest and the zone's things
{
	// (a zone that has every kind of thing)
	let FULL = 0; const KINDS = EK.PLACE.map((p) => p[0]);
	for (let seed = 1; seed < 400 && !FULL; seed++) { const T = newRun(data, X, { seed, dex: 6, league: true }), lay = layoutOf(T.w.room, T); if (KINDS.every((k) => lay.objs.some((o) => o.kind === k))) FULL = seed; }
	const mk = (o = {}) => { const P = party({ host: { seed: FULL }, ...o }); P.objs = (kind) => layoutOf(P.H.w.room, P.H).objs.filter((q) => q.kind === kind); P.st = (q) => P.H.eco.z.st[q.i]; P.on = (who, q) => P.put(who, [q.x, q.y, q.z]); P.away = (who) => P.put(who, P.H.w.room.spawn); return P; };
	const items = (S) => Object.values(S.w.pl.xi).reduce((a, b) => a + b, 0);
	const calm = (P) => { for (const e of P.H.w.enemies) e.dead = true; };
	{
		const P = mk({ guestPick: null }), { H, G: Gs } = P, rock = P.objs('rock')[0], berry = P.objs('berry')[0], balls = P.objs('ball');
		P.on(Gs, rock); P.step(0.6);
		A(H.coins === rock.v && P.st(rock) === USED && Gs.coins === H.coins && !Gs.rv.eco.some((q) => q.i === rock.i), `the guest touches a gold rock: its ${rock.v} ₽ are the team's, and it is gone on both screens`, [H.coins, Gs.coins]);
		P.on(Gs, berry); P.step(0.6); A(P.st(berry) === FRESH, 'a berry bush does nothing for an unhurt guest');
		Gs.w.pl.hp = Gs.w.pl.maxHp * 0.2; P.step(0.8);
		A(P.st(berry) === USED && near(Gs.w.pl.hp, Gs.w.pl.maxHp * 0.7, 0.01), 'hurt, it heals half the GUEST\'s HP');
		// a paid ball
		H.coins = 5; P.on(Gs, balls[0]); P.step(1);
		A(P.st(balls[0]) === FRESH && !Gs.pick && H.coins === 5 && P.says.some((q) => /need \d+ ₽ more/.test(q)), 'a Poké Ball costs the team\'s money: without it, it stays shut for the guest too');
		H.coins = 100; P.away(Gs); P.step(0.5); P.on(Gs, balls[0]); P.step(1);
		const pk = Gs.pick, t = Gs.w.t;
		A(P.st(balls[0]) === USED && H.coins === 82 && H.eco.balls === 1 && !H.pick && pk && pk.kind === 'ball' && pk.ids.length === 3 && new Set(pk.ids).size === 3, `with it: the team pays 18 ₽, and the GUEST has three items to choose from (${pk && pk.ids.join(', ')}); the host has no choice up`);
		P.step(0.5);
		A(Gs.w.t > t && H.w.t > 0 && Gs.pick === pk, 'a party\'s fight does not hold for one player\'s choosing');
		A(pickTake(Gs, 1) && !Gs.pick && Gs.w.pl.xi[pk.ids[1]] === 1 && items(H) === 0, 'it takes one: the guest\'s item, not the host\'s');
		// the host and the guest, each at a ball of their own, at once
		P.away(Gs); P.step(0.5); H.coins = 100; P.on(H, balls[1]); P.on(Gs, balls[2]); P.step(1);
		A(P.st(balls[1]) === USED && P.st(balls[2]) === USED && items(H) === 1 && Gs.pick && H.eco.balls === 3, 'the host and the guest each open a ball of their own at the same moment: each gets its own (the host takes its first by itself here; the guest has its choice up)');
		pickTake(Gs, 0);
	}
	{
		const P = mk(), { H, G: Gs } = P, free = P.objs('freeball')[0], cursed = P.objs('cursedball')[0];
		P.on(Gs, free); P.step(1);
		A(P.st(free) === USED && items(Gs) === 1 && items(H) === 0, 'a free ball: an item for the guest at once');
		calm(P); P.on(Gs, cursed); P.step(1);
		const ghosts = H.w.enemies.filter((e) => X.E.K.GHOST_DEX.includes(e.dex) && !e.dead), gs = Gs.w.pl.s;
		A(P.st(cursed) === USED && near(mods(H).diff, 0.05) && items(Gs) >= 2 && ghosts.length === 6 && ghosts.every((e) => Math.hypot(e.a.x - gs.x, e.a.z - gs.z) < 25), 'a cursed ball: its item(s) for the guest, the curse for everyone, and the ghosts come round the GUEST');
		// altars
		calm(P); const u1 = P.objs('unown1')[0];
		P.on(Gs, u1); P.away(H); P.step(4);
		A(near(H.eco.z.ch[u1.i], 0.5, 0.06), 'an Unown altar charges for the guest standing in it');
		P.step(4.5);
		A(P.st(u1) === USED && Gs.w.pl.xi && items(Gs) >= 3 && !H.pick, 'full: its blessing is the guest\'s (taken by itself here)');
		const cu = P.objs('cursedaltar')[0], n0 = items(Gs); P.on(Gs, cu); P.step(2.2);
		A(P.st(cu) === USED && items(Gs) === n0 + 1 && near(mods(H).diff, 0.13) && near(mods(H).rate, 0.15), 'the cursed altar: a Rare or better item for the guest, the curse for everyone');
		// Ditto and Hypno
		const ditto = P.objs('ditto')[0], n1 = items(Gs); P.on(Gs, ditto); P.step(1.5);
		A(P.st(ditto) === USED && items(Gs) === n1 + 1, 'Ditto copies one of the GUEST\'s own items');
		const hyp = P.objs('hypno')[0]; for (const id of ['protein', 'iron']) XG.L.I.takeVitamin(Gs.w.pl, id, 0);
		Gs.w.autoPick = undefined; P.on(Gs, hyp); P.step(1.5);
		A(Gs.pick && Gs.pick.kind === 'hypno' && Gs.pick.vit.join() === 'protein,iron' && P.st(hyp) === FRESH, 'Hypno asks the guest which of ITS vitamins to forget');
		A(pickTake(Gs, 0) && Gs.w.pl.xv.map((q) => q.id).join() === 'iron' && P.st(hyp) === FRESH, 'it forgets one; Hypno stays for the host');
		// a cage: the team's XP
		const cage = P.objs('cage')[0]; H.coins = 60; const lv = H.w.pl.level, xp = H.w.pl.xp; H.w.autoPick = pickUp; Gs.w.autoPick = pickUp;
		P.on(Gs, cage); P.step(1.5);
		A(P.st(cage) === USED && H.coins === 30 && (H.w.pl.level > lv || H.w.pl.xp > xp), 'a cage freed by the guest: the team pays, and the team gets the XP');
	}
	{
		// Meowth
		const P = mk({ guestPick: null }), { H, G: Gs } = P, lay = layoutOf(H.w.room, H), v = lay.visits[0], stall = lay.objs[v.spot];
		setZoneTime(H, v.at + 1); P.step(0.3); H.coins = 1000;
		P.on(Gs, stall); P.step(0.8);
		const pk = Gs.pick, stock = H.eco.z.stock;
		A(pk && pk.kind === 'shop' && pk.ids.join() === stock.join() && pk.prices.join() === shopPrices(H, stock).join() && !H.pick, 'Meowth\'s stall opens for the guest, with the host\'s stock and prices');
		pickTake(Gs, 1); A(Gs.pick === pk, 'the guest asks for one: the stall stays open');
		P.step(0.8);
		A(H.coins === 1000 - pk.prices[1] && H.eco.buys === 1 && (H.eco.z.sold & 2) === 2 && Gs.w.pl.xi[stock[1]] === 1 && pk.taken.includes(1), 'the team pays, the item is the guest\'s, and it is sold');
		A(pickTake(Gs, 1) === false, 'it cannot be bought twice');
		A(pickClose(Gs) && !Gs.pick, 'the guest leaves the stall');
		// the slot machine
		const slot = P.objs('slots')[0]; H.coins = 100; calm(P); P.on(Gs, slot); P.step(1.2);
		A(H.eco.log.spins === 1 && H.eco.spent >= X.E.slotCost(1), 'the guest spins the slot machine on the team\'s money');
	}
	{
		// a catch
		const P = mk({ guestPick: null, hostPick: null }), { H, G: Gs } = P; H.w.pl.xpMul = 0;
		const faintOne = (dex) => { let e = null; for (let k = 1; k < 60 && !e; k++) { const n = H.w.enemies.length; fire(H, { at: 0, kind: 'alpha', n: 1, dex: [dex], seed: 500 + k * 7 + dex }); e = H.w.enemies.length > n ? H.w.enemies[H.w.enemies.length - 1] : null; } e.dummy = true; H.w.hit(e, 1e12, 0, 0, 0); P.step(0.1); return H.cap.faint[H.cap.faint.length - 1]; };
		const f = faintOne(74);
		P.put(Gs, [f.x + 1, f.y, f.z]); P.step(0.9);
		A(H.cap.faint.length === 0 && H.cap.sa.length === 0 && Gs.cap.cine && Gs.cap.cine.dex === 74 && P.says.some((q) => /A teammate throws a Friend Ball/.test(q)), 'an alpha faints and the GUEST stands by it: the catch is the guest\'s (the host says so)');
		const t = Gs.w.t; P.step(1); A(Gs.w.t > t && H.w.t > 0, 'the fight does not hold for a guest\'s ball');
		P.step(3);
		A(!Gs.cap.cine && Gs.cap.sa.length === 1 && Gs.cap.sa[0].dex === 74 && near(total(Gs, 'hp'), 15) && H.cap.sa.length === 0 && H.cap.n === 0, 'then Geodude is the GUEST\'s Support Alpha (its perk too); the host\'s team is as it was');
		const e = spawn(H, 19, Gs.w.pl.s.x + 5, Gs.w.pl.s.z); e.dummy = true; e.maxHp = e.hp = 1e6; P.step(4);
		A(e.hp < 1e6 && Gs.cap.sa[0].shots >= 2, 'it shoots the host\'s enemies from the guest\'s side, and they are hurt');
		e.dead = true;
		// a full team: keep it, and the prize falls on the host's floor
		const f2 = faintOne(4); P.put(Gs, [f2.x + 1, f2.y, f2.z]); P.step(4.5);
		A(Gs.cap.sa.length === 2, 'a second one: the guest\'s team is full');
		const f3 = faintOne(16); H.w.pickups.length = 0; P.put(Gs, [f3.x + 1, f3.y, f3.z]); P.step(0.9);
		A(Gs.pick && Gs.pick.kind === 'friend' && Gs.pick.cards.length === 2, 'a third: which one to swap?');
		const gi = items(Gs), hi = items(H);
		A(pickClose(Gs) && !Gs.pick, 'it keeps its team');
		P.step(0.8);
		A(H.cap.log.prizes === 1 && Gs.cap.sa.map((a) => a.dex).join() === '74,4' && items(Gs) === gi + 1 && items(H) === hi, 'and the alpha\'s prize falls on the floor; the guest, standing right there, picks it up: the item is the GUEST\'s, not the host\'s', [H.w.pickups.map((p) => p.kind), H.cap.log, items(Gs), gi, items(H), hi]);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
