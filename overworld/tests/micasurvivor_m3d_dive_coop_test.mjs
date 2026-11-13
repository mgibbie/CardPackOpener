// micasurvivor_m3d_dive_coop_test.mjs — MicaSurvivor 3D, Dive part 17 (Plans/MICASURVIVOR_3D_PLAN.md §5.70): a Dive played
// together (micasurvivor/m3d/dive.js with guests, divecoop.js), in node: a host's Dive and a guest's side of it, joined
// by a line that delays everything a tenth of a second each way.
//   * the guest knows nothing but that it joins: it learns the Dive from the host and builds the floor itself; it is its
//     own League member with the kit of three, and its special fires when pressed and hurts the host's foe
//   * ANY player counts: the guest wakes a group, opens a chest (the item is the guest's own), burns a thicket the host
//     cannot, uses the shrine (both are healed), leads the lost Pokémon, takes the stairs (both go down)
//   * the red ground goes for the nearest player; the guest takes its own, and its dodge saves it
//   * the rope takes the party; the host's faint ends it for both
//   node overworld/tests/micasurvivor_m3d_dive_coop_test.mjs
import { rulesFrom, newDive, stepDive, spawnFoe, pressSpecial, bodies } from '../../micasurvivor/m3d/dive.js';
import { guestDive, guestDiveApply, stepGuestDive, slamOn } from '../../micasurvivor/m3d/divecoop.js';
import { diveRow } from '../../micasurvivor/m3d/divenet.js';
import { dataFrom, addEnemy } from '../../micasurvivor/m3d/combat.js';
import { keepEvents, diff, NK } from '../../micasurvivor/m3d/net.js';
import { hostAdd, hostStep, hostFrame, hostApply, guestSync, guestMsg, guestApply } from '../../micasurvivor/m3d/coop.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const FILES = ['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js'];
const G = loadG(FILES), data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), G2 = loadG(FILES), dataG = dataFrom(G2), XG = expFrom(G2), RG = rulesFrom(G2), EVERY = Math.round(60 / NK.HZ);

/** A host's Dive (Squirtle, seed 3: a thicket, a shrine, 4 chests on floor 1) and a guest in it (Charmander). */
function party(o = {}) {
	const lag = 6, H = newDive(data, X, R, { route: 'forest', seed: 3, dex: 7, league: true, autoPick: 0, ...(o.host || {}) });
	H.w.enemies.length = 0; H.groups.length = 0; H.ft = 1e9; H.w.pl.maxHp = H.w.pl.hp = 1e6;
	const Gs = guestDive(dataG, XG, RG, { seed: 0, route: 'nowhere', id: 1, dex: 4, autoPick: 0 });   // (it knows nothing of the Dive yet but that it is joining one)
	const mate = hostAdd(H.w, 1, Gs.w.pl.mon.dex);
	const P = { H, G: Gs, mate, n: 0, toGuest: [], toHost: [], ev: [], prev: null, says: [], gsays: [], known: false, took: 0, hev: [] };
	P.step = (sec = 1 / 60, inH = null, inG = null) => {
		for (let i = 0, n = Math.max(1, Math.round(sec * 60)); i < n; i++) {
			hostStep(H.w); stepDive(H, inH || noInput()); P.says.push(...H.says.map((q) => q.text)); keepEvents(P.ev, H.w.events); P.hev.push(...H.w.events.map((q) => q.k));
			const cv = guestSync(Gs.w); if (cv && cv.events && cv.events.length) P.took += slamOn(Gs, cv.events);
			stepGuestDive(Gs, inG || noInput()); P.gsays.push(...Gs.says.map((q) => q.text));
			if (P.n % EVERY === 0) {
				const f = hostFrame(H.w, P.ev); f.r = diveRow(H); P.ev = [];
				P.toGuest.push([P.n + lag, JSON.stringify(P.n % (EVERY * 10) === 0 || !P.prev ? f : diff(P.prev, f))]); P.prev = f;
				P.toHost.push([P.n + lag, JSON.stringify(guestMsg(Gs.w))]);
			}
			while (P.toGuest.length && P.toGuest[0][0] <= P.n) { guestApply(Gs.w, JSON.parse(P.toGuest.shift()[1])); const last = Gs.w.co.viewer.last; if (last && last.r) { guestDiveApply(Gs, last.r); P.known = true; } }
			while (P.toHost.length && P.toHost[0][0] <= P.n) hostApply(H.w, 1, JSON.parse(P.toHost.shift()[1]));
			P.n++;
		}
		return P;
	};
	P.gput = (x, z) => { const s = Gs.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vz = s.vy = 0; };
	P.hput = (x, z) => { const s = H.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vz = s.vy = 0; };
	P.far = () => { const r = H.w.room; P.hput(r.spawn[0], r.spawn[2]); };
	return P.step(1.2);
}
const items = (S) => S.lv.log.filter((q) => q[1] === 'item').length;

// ---------------------------------------------------------------- joining
{
	const P = party(), H = P.H, Gs = P.G, hr = H.w.room, gr = Gs.w.room;
	A(P.known && Gs.route === 'forest' && Gs.seed === 3 && Gs.floor === 1 && gr !== hr && gr.w === hr.w && gr.stairs.join() === hr.stairs.join() && gr.cells.every((c, i) => c === hr.cells[i]), 'the guest learns the Dive from the host and builds the same floor itself');
	A(Gs.lg && Gs.lg.member === 4 && Gs.w.pl.moves.length === 3 && !Gs.w.pl.moves[0].xman && Gs.w.pl.moves[1].xman && Gs.w.pl.moves[2].xman, 'it is its own League member, with the kit of three (the basic and two specials)', Gs.w.pl.moves.map((m) => m.id));
	A(bodies(H).length === 2 && Math.hypot(P.mate.s.x - Gs.w.pl.s.x, P.mate.s.z - Gs.w.pl.s.z) < 1 && Math.hypot(Gs.w.pl.s.x - hr.spawn[0], Gs.w.pl.s.z - hr.spawn[2]) < 8, 'it arrives beside the host, and the host has it where it is');
	A(Gs.rv.chests.length === H.chests.length && Gs.rv.lm.kind === 'shrine' && Gs.rv.eco.length >= 5, 'it sees the same chests, shrine and things');
	// its special, pressed, hurts the host's foe
	const s = Gs.w.pl.s, e = addEnemy(H.w, 19, s.x + 2.5, s.z, { t: 0, ti: 0, hp: 1e6 }); e.dummy = true;
	P.step(1.5);
	const hp1 = e.hp; Gs.w.pl.moves[1].t = 0;
	A(pressSpecial(Gs, 1) === true, 'the guest presses its special');
	P.step(1.5);
	A(Gs.w.pl.moves[1].t > 0 || e.hp < hp1, '…it fires');
	A(e.hp < hp1, "and the host's foe is hurt by it", [hp1, e.hp]);
}
// ---------------------------------------------------------------- any player counts
{
	const P = party(), H = P.H, Gs = P.G, room = H.w.room;
	// a sleeping group
	const gx = room.spawn[0] + 30, gz = room.spawn[2], e = spawnFoe(H, 19, gx, gz, {}); e.dummy = true; e.asleep = true; e.hp = e.maxHp = 1e9;
	const grp = { awake: false, list: [e], at: [gx, gz] }; H.groups.push(grp);
	P.step(0.5);
	A(!grp.awake, 'a sleeping group far from both stays asleep');
	P.gput(gx + 3, gz + 3); P.step(0.6);
	A(grp.awake && !e.asleep, 'the guest walks up to it: it wakes');
	H.w.enemies.length = 0; H.groups.length = 0;
	// a chest: the item is the guest's
	const c = H.chests.find((q) => !q.pocket), hi = items(H), gi = items(Gs);
	P.gput(c.x + 1, c.z); P.step(1.5);
	A(c.open && H.opened === 1 && items(H) === hi && items(Gs) === gi + 1 && P.gsays.some((t) => /^Item: /.test(t)), "the guest opens a chest: it is open for both, and the item is the guest's own", [c.open, items(H) - hi, items(Gs) - gi]);
	A(Gs.rv.chests.filter((q) => q.open).length === 1, '…and the guest sees it open');
	// the thicket: the host (Squirtle) cannot, the guest (Charmander) can
	const pi = room.plugs.findIndex((p) => p.kind === 'thicket'), pg = room.plugs[pi], fc = pg.faces[0];
	P.gput(room.spawn[0], room.spawn[2]); P.hput(fc[0], fc[2]); P.step(1.2);
	A(!pg.open && P.says.some((t) => /A thicket: a Fire/.test(t)), 'the host leans on the thicket: a Water type cannot burn it');
	P.far(); P.gput(fc[0], fc[2]); P.step(1.4);
	A(pg.open && H.secrets === 1, 'the guest leans on it: a Fire type burns it, for both');
	A(Gs.w.room.plugs[pi].open && Gs.w.room.cells.every((cell, i) => cell === H.w.room.cells[i]) && Math.hypot(Gs.w.pl.s.x - fc[0], Gs.w.pl.s.z - fc[2]) < 1, "the guest's floor has it open too, and the guest stays where it stands");
	// the shrine: both are healed
	H.w.pl.maxHp = 1000; H.w.pl.hp = 100; Gs.w.pl.hp = 1; const gmax = Gs.w.pl.maxHp;
	P.gput(H.lm.x, H.lm.z); P.step(R.LM.T + 1);
	A(H.lm.used && Math.abs(H.w.pl.hp - 600) < 1 && Gs.w.pl.hp >= gmax * 0.5 - 1 && Gs.rv.lm.used, 'the guest stands on the shrine: both recover half their HP', [H.w.pl.hp, Gs.w.pl.hp, gmax]);
	// the lost Pokémon follows the nearest
	const lo = H.stray;
	P.far(); P.gput(lo.x + 1, lo.z); P.step(0.6);
	A(lo.follow, 'the guest reaches the lost Pokémon: it follows');
	const sx = Gs.w.pl.s.x + 6, sz = Gs.w.pl.s.z;
	P.gput(sx, sz); P.step(2);
	A(Math.hypot(lo.x - sx, lo.z - sz) < 5, '…the guest, not the host', [lo.x - sx, lo.z - sz]);
	// the stairs
	P.gput(room.stairs[0], room.stairs[2]); P.step(R.K.STAIRS_T + 1.2);
	H.w.enemies.length = 0; H.groups.length = 0; H.ft = 1e9;
	P.step(0.5);
	const r2 = H.w.room;
	A(H.floor === 2 && Gs.floor === 2 && Gs.w.room.cells.every((cell, i) => cell === r2.cells[i]), 'the guest takes the stairs: both are on floor 2');
	A(H.rescued.length === 1, '…and the lost Pokémon it led is rescued');
	A(Math.hypot(Gs.w.pl.s.x - r2.spawn[0], Gs.w.pl.s.z - r2.spawn[2]) < 8 && Math.hypot(P.mate.s.x - Gs.w.pl.s.x, P.mate.s.z - Gs.w.pl.s.z) < 1.5, 'the guest arrives beside the host on the new floor');
}
// ---------------------------------------------------------------- the red ground
{
	const brawler = (() => { for (let d = 1; d <= 151; d++) { const T = newDive(data, X, R, { route: 'forest', seed: 3, dex: 7, league: true }), e = spawnFoe(T, d, T.w.pl.s.x + 2, T.w.pl.s.z, {}); if (e && !e.def.shotCd && e.behavior !== 'thief' && !e.fly) return d; } return 19; })();
	const slam = (dodge) => {
		const P = party(), H = P.H, Gs = P.G, room = H.w.room, gx = room.spawn[0] + 24, gz = room.spawn[2];
		P.gput(gx, gz); P.step(0.5);
		const e = spawnFoe(H, brawler, gx + 2, gz, {}); e.hp = e.maxHp = 1e9; e.a.speed = 0; e.touchCd = 1e9; e.dmg = 50;
		const hp0 = Gs.w.pl.hp; let tele = false, landed = false;
		for (let i = 0; i < 600 && !landed; i++) { P.hev.length = 0; P.gput(gx, gz); if (dodge && tele) Gs.dodge.t = 0.3; P.step(); if (P.hev.includes('tele')) tele = true; if (P.hev.includes('slam')) landed = true; }
		for (let i = 0; i < 40; i++) { P.gput(gx, gz); if (dodge) Gs.dodge.t = 0.3; P.step(); }
		return { tele, landed, lost: hp0 - Gs.w.pl.hp, host: 1e6 - H.w.pl.hp, took: P.took };
	};
	const a = slam(false);
	A(a.tele && a.landed && a.lost > 0 && a.host === 0, 'a brawler beside the guest slams: the guest is hit, the host far away is not', a);
	const b = slam(true);
	A(b.landed && b.lost === 0, "…and the guest's dodge saves it", b);
}
// ---------------------------------------------------------------- the ends
{
	const P = party(), H = P.H, Gs = P.G, room = H.w.room;
	H.cadence = { ...H.cadence, rope: true }; H.stake = 80;
	P.hput(room.spawn[0] + 40, room.spawn[2]); P.gput(room.spawn[0], room.spawn[2]);
	P.step(R.K.ROPE_T + 1.5);
	A(H.ended && H.escaped && Gs.ended && Gs.escaped && Gs.won, "the guest stands still in the rope's circle: the party leaves with everything", [H.ended, H.escaped, Gs.ended]);
	const Q = party();
	Q.H.w.pl.hp = 0; Q.H.w.pl.dead = true; Q.step(1);
	A(Q.H.ended && Q.H.lost && Q.G.ended && Q.G.lost, 'the host faints: the Dive is over for both');
	// a guest that faints is down, and up again on the next floor
	const T = party(), rm = T.H.w.room;
	T.G.w.pl.hp = 0; T.G.w.pl.dead = true; T.step(0.8);
	A(!T.H.ended && bodies(T.H).length === 1, 'the guest faints: the Dive goes on, and the guest no longer counts');
	T.hput(rm.stairs[0], rm.stairs[2]); T.step(R.K.STAIRS_T + 1.5);
	A(T.H.floor === 2 && T.G.floor === 2 && !T.G.w.pl.dead && T.G.w.pl.hp > 0, 'on the next floor it is back on its feet');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
