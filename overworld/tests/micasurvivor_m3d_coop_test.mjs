// micasurvivor_m3d_coop_test.mjs — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): two players in one fight
// (micasurvivor/m3d/coop.js), in node. A HOST's fight and a GUEST's side of it run tick for tick and talk only through
// the messages a transport would carry (as text, ten a second each way, arriving 100 ms late unless a check says
// otherwise). Who decides what is the 2D game's rule: the host the enemies, the floor and the team's level; each
// player their own body, HP and moves, a guest's hits being sent to the host.
//   * the guest sees the host's enemies (copies, a moment in the past) and the host; the host has the guest where it is
//   * an enemy goes for the NEAREST player; the host is not hurt by what touches the guest
//   * the guest's moves hurt the host's enemies (and what a hit carries: a burn); an enemy the guest finishes goes down
//     on the host and leaves its XP there
//   * what touches the guest hurts the guest, on the guest's side; the host gives that enemy its pause and its shove
//   * an enemy's shot and a mark on the ground made on the host hurt a guest standing in their way
//   * experience is the team's: whoever is nearest picks it up, both level, and the fight WAITS for both to choose
//   * with two players more enemies arrive (× 1.75) and they are tougher (× 1.3)
//   * it still holds with 300 ms each way; and a second of co-op traffic is small
//   * down in a party: a teammate standing beside you gets you up in 3 s at half HP; alone you stay down
//   * a guest that goes quiet is AWAY (enemies leave it, nobody waits for its card); a host that goes quiet stops the
//     guest's fight until it is heard again
//   * three players: two guests and a host, each seeing the other two
//   node overworld/tests/micasurvivor_m3d_coop_test.mjs
import { K, CELL, makeRoom, setCell } from '../../micasurvivor/m3d/sim.js';
import { generate } from '../../micasurvivor/m3d/gen.js';
import { newWorld, addEnemy, tick, dataFrom, drop, choose, xpFor, CK, U } from '../../micasurvivor/m3d/combat.js';
import { keepEvents, diff, NK } from '../../micasurvivor/m3d/net.js';
import { hostAdd, hostStep, hostFrame, hostApply, guestWorld, guestSync, guestMsg, guestApply, CO } from '../../micasurvivor/m3d/coop.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), RAT = 19, EVERY = Math.round(60 / NK.HZ);
const flat = () => { const r = makeRoom(50, 50, 0); r.spawn = [50, 0, 50]; return r; };

/** A host and a guest joined by a line that delays everything `lag` ticks each way. */
function party(o = {}) {
	const room = o.room || flat(), lag = o.lag === undefined ? 6 : o.lag;
	const hw = newWorld(room, data, { dex: 25, moves: o.hostMoves || [], seed: 5, weather: false, cast: o.cast || null, autoPick: o.autoPick });
	const gw = guestWorld(room, data, { dex: 4, moves: o.guestMoves || [], seed: 77, id: 1, autoPick: o.autoPick });
	const mate = hostAdd(hw, 1, 4);
	if (o.guestAt) { gw.pl.s.x = o.guestAt[0]; gw.pl.s.z = o.guestAt[1]; mate.s.x = o.guestAt[0]; mate.s.z = o.guestAt[1]; }
	const P = { hw, gw, mate, n: 0, toGuest: [], toHost: [], ev: [], prev: null, sent: { down: 0, up: 0, msgs: 0 }, view: null };
	P.step = (inH = null, inG = null, ticks = 1) => {
		for (let i = 0; i < ticks; i++) {
			hostStep(hw); tick(hw, typeof inH === 'function' ? inH(P.n) : inH); keepEvents(P.ev, hw.events);
			P.view = guestSync(gw); tick(gw, typeof inG === 'function' ? inG(P.n) : inG);
			P.n++;
			if (P.n % EVERY === 0) {
				const f = hostFrame(hw, P.ev), whole = !P.prev || (P.n / EVERY) % NK.HZ === 0, down = JSON.stringify(whole ? f : diff(P.prev, f)), up = JSON.stringify(guestMsg(gw));
				P.prev = f; P.ev = []; P.sent.down += down.length; P.sent.up += up.length; P.sent.msgs++;
				P.toGuest.push({ at: P.n + lag, text: down }); P.toHost.push({ at: P.n + lag, text: up });
			}
			while (P.toGuest.length && P.toGuest[0].at <= P.n) guestApply(gw, JSON.parse(P.toGuest.shift().text));
			while (P.toHost.length && P.toHost[0].at <= P.n) hostApply(hw, 1, JSON.parse(P.toHost.shift().text));
		}
		return P;
	};
	return P;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- seeing each other
{
	const p = party({ guestAt: [60, 50] }); p.hw.pl.invuln = 1e9; p.gw.pl.invuln = 1e9;
	const e1 = addEnemy(p.hw, RAT, 44, 50, { dummy: true, hp: 1e5 }), e2 = addEnemy(p.hw, RAT, 66, 54, { dummy: true, hp: 1e5 });
	p.step(null, null, 60);
	const copies = p.gw.enemies, c1 = copies.find((c) => c.id === e1.id);
	A(copies.length === 2 && c1 && c1.copy && Math.hypot(c1.a.x - 44, c1.a.z - 50) < 0.05 && c1.dex === RAT && c1.dmg > 0, 'the guest has the host\'s two enemies as copies: the same ids, species and places, and what their touch would do', copies.map((c) => [c.id, c.a.x, c.a.z, c.dmg]));
	// both move: each has the other where it is
	p.step({ mx: 0, mz: 1, jump: false, crouch: false }, { mx: 0, mz: -1, jump: false, crouch: false }, 90);
	const hostSeen = p.gw.co.mates.find((m) => m.id === 0), gs = p.gw.pl.s, hs = p.hw.pl.s;
	A(hostSeen && Math.abs(hostSeen.s.z - hs.z) < 2.2 && hostSeen.s.z > 54 && hostSeen.dex === 25, `the guest sees the host run south (${hostSeen.s.z.toFixed(1)} m; really ${hs.z.toFixed(1)}: a moment behind, as a watcher is)`, [hostSeen.s.z, hs.z]);
	A(Math.abs(p.mate.s.z - gs.z) < 1 && p.mate.s.z < 46 && Math.abs(p.mate.s.x - gs.x) < 0.3, `the host has the guest's puppet where the guest is (${p.mate.s.z.toFixed(1)} m; really ${gs.z.toFixed(1)}), carried on between reports by its speed`, [p.mate.s, gs.z]);
	p.step(null, { mx: 0, mz: 0, jump: true, crouch: false }, 14);
	A(p.mate.s.y > 0.4 && !p.mate.s.grounded, 'when the guest jumps, its puppet on the host is in the air too', p.mate.s);
}

// ---------------------------------------------------------------- an enemy goes for the nearest player
{
	const p = party({ guestAt: [70, 50] });   // the host at 50, the guest 20 m east
	const nearGuest = addEnemy(p.hw, RAT, 76, 50), nearHost = addEnemy(p.hw, RAT, 44, 50);
	p.gw.pl.invuln = 1e9;
	p.step(null, null, 40);
	A(nearGuest.a.x < 75 && nearGuest.tg === 1 && nearHost.a.x > 45 && nearHost.tg === 0, 'two enemies, one beside each player: each goes for the player nearest it', [nearGuest.a.x, nearGuest.tg, nearHost.a.x, nearHost.tg]);
	const hp0 = p.hw.pl.hp; nearHost.dead = true;
	p.step(null, null, 240);
	A(dist(nearGuest.a, p.gw.pl.s) < 3 && p.hw.pl.hp === hp0 && p.hw.stats.touched === 0, 'the one that reaches the guest does not hurt the host (the host does not decide what hits a guest)', [dist(nearGuest.a, p.gw.pl.s), p.hw.pl.hp]);
	// the guest goes down: its puppet is no longer a target
	const q = party({ guestAt: [70, 50] }); const e = addEnemy(q.hw, RAT, 74, 50); q.gw.pl.hp = 0; q.gw.pl.dead = true; q.hw.pl.invuln = 1e9;
	q.step(null, null, 120);
	A(q.mate.dead && e.tg === 0 && e.a.x < 72, 'a guest who is down is told to the host, and its enemies turn to the players still standing', [q.mate.dead, e.tg, e.a.x]);
}

// ---------------------------------------------------------------- the guest's hits
{
	const p = party({ guestAt: [70, 50], guestMoves: ['ember'] }); p.gw.pl.invuln = 1e9; p.hw.pl.invuln = 1e9;
	const e = addEnemy(p.hw, 1, 76, 50, { dummy: true, hp: 4 });   // a Bulbasaur 6 m from the guest, 26 m from the host
	const max = e.maxHp; p.step(null, null, 90);
	A(e.hp < max && p.gw.stats.hits > 0 && p.hw.stats.hits > 0 && e.burn > 0, `the guest's Ember hurts the HOST's enemy (${max - e.hp} of its ${max} HP in 1.5 s) and burns it`, [e.hp, max, p.gw.stats.hits, p.hw.stats.hits, e.burn]);
	const copy = p.gw.enemies.find((c) => c.id === e.id);
	A(copy && Math.abs(copy.hp / 1000 - e.hp / e.maxHp) < 0.25, 'the guest sees its HP fall on the copy (told by the host)', [copy && copy.hp, e.hp / e.maxHp]);
	p.step(null, null, 600);
	A(e.dead && p.hw.stats.kills === 1 && !p.gw.enemies.some((c) => c.id === e.id) && p.hw.pickups.length + p.hw.stats.collected >= 1, 'the guest finishes it: it goes down on the host, is gone from the guest, and leaves its XP on the host\'s floor', [e.dead, p.hw.stats.kills, p.gw.enemies.length, p.hw.pickups.length]);
	A(p.hw.pl.moves.length === 0 && p.hw.stats.fired === 0, '(the host fired nothing: every hit was the guest\'s)');
}

// ---------------------------------------------------------------- what hits a guest
{
	const p = party({ guestAt: [70, 50] }); p.hw.pl.invuln = 1e9;
	const e = addEnemy(p.hw, RAT, 73, 50);
	const hp0 = p.gw.pl.hp; let knocked = 0, cd = 0;
	for (let i = 0; i < 240; i++) { p.step(); knocked = Math.max(knocked, Math.hypot(e.a.kx, e.a.kz)); cd = Math.max(cd, e.touchCd); }
	A(p.gw.stats.touched >= 2 && p.gw.pl.hp < hp0 && p.hw.stats.taken === 0, `an enemy that reaches the guest hurts it on the guest's side (${p.gw.stats.touched} touches, ${(hp0 - p.gw.pl.hp).toFixed(1)} HP); the host is untouched`, [p.gw.stats, p.hw.stats.taken]);
	A(knocked > 3 && cd > 0.3, 'the host, told of each touch, gives that enemy its pause and its shove back', [knocked, cd]);
	// an enemy's shot, and a mark on the ground
	const s = party({ guestAt: [70, 50] }); s.hw.pl.invuln = 1e9;
	const shooter = addEnemy(s.hw, 58, 78, 50); shooter.shotCd = 0.2; shooter.a.speed = 0;
	const g0 = s.gw.pl.hp; let seen = 0; for (let i = 0; i < 300; i++) { s.step(); seen = Math.max(seen, s.gw.eshots.length); }
	A(seen >= 1 && s.gw.pl.hp < g0 && s.gw.stats.touched === 0, `a ranged enemy 8 m from the guest: its shots, made on the host, fly on the guest's side and hit it (${(g0 - s.gw.pl.hp).toFixed(1)} HP)`, [seen, s.gw.pl.hp, g0]);
	const z = party({ guestAt: [70, 50] }); z.hw.pl.invuln = 1e9;
	const zoner = addEnemy(z.hw, 32, 77, 50); zoner.shotCd = 0.2; zoner.a.speed = 0;
	const z0 = z.gw.pl.hp; let marks = 0; for (let i = 0; i < 200; i++) { z.step(); marks = Math.max(marks, z.gw.hazards.length); }
	A(marks >= 1 && z.gw.pl.hp < z0, `a zoner marks the ground under the guest: the mark goes off on the guest's side and hurts it (${(z0 - z.gw.pl.hp).toFixed(1)} HP)`, [marks, z.gw.pl.hp]);
	const j = party({ guestAt: [70, 50] }); j.hw.pl.invuln = 1e9; const zj = addEnemy(j.hw, 32, 77, 50); zj.shotCd = 0.2; zj.a.speed = 0;
	const j0 = j.gw.pl.hp; for (let i = 0; i < 200; i++) j.step(null, { mx: 1, mz: 0, jump: false, crouch: false });   // the guest runs out of it
	A(j.gw.pl.hp === j0 || j.gw.stats.touched > 0, '...and a guest who runs out of the mark is not hurt by it', [j.gw.pl.hp, j0]);
}

// ---------------------------------------------------------------- experience is the team's, and a level-up waits for everyone
{
	const p = party({ guestAt: [70, 50] }); p.hw.pl.invuln = 1e9; p.gw.pl.invuln = 1e9;
	const need = xpFor(1);
	const orb = drop(p.hw, 'xp', 71, 0, 50, need + 5); orb.vx = orb.vz = 0;   // beside the GUEST
	p.step(null, null, 60);
	A(p.hw.stats.collected === 1 && p.hw.pl.level === 2 && p.gw.pl.level === 2, 'an orb beside the guest is picked up for the team (the nearest player), and both are level 2', [p.hw.stats.collected, p.hw.pl.level, p.gw.pl.level]);
	A(p.hw.pl.choices && p.hw.pl.choices.length === 3 && p.gw.pl.choices && p.gw.pl.choices.length === 3 && JSON.stringify(p.hw.pl.choices.map((c) => c.key)) !== JSON.stringify(p.gw.pl.choices.map((c) => c.key)), 'each is offered three cards of their own (a Pikachu\'s and a Charmander\'s are not the same)', [p.hw.pl.choices && p.hw.pl.choices.map((c) => c.key), p.gw.pl.choices && p.gw.pl.choices.map((c) => c.key)]);
	const e = addEnemy(p.hw, RAT, 40, 50); const ex = e.a.x, t0 = p.hw.t, g0 = p.gw.t;
	p.step(null, null, 60);
	A(p.hw.t === t0 && e.a.x === ex && p.gw.t === g0, 'while they are on offer the fight stands still for both');
	choose(p.hw, 0); p.step(null, null, 60);
	A(p.hw.t === t0 && e.a.x === ex && p.hw.waiting, 'the host chooses; the guest has not: the fight still waits');
	choose(p.gw, 1); p.step(null, null, 90);
	A(p.hw.t > t0 + 0.5 && e.a.x > ex && p.gw.t > g0 + 0.5 && !p.hw.waiting && !p.gw.waiting, 'the guest chooses: the fight goes on for both');
	const h = party({ guestAt: [70, 50] }); h.gw.pl.hp = 10; const berry = drop(h.hw, 'heal', 70.5, 0, 50); berry.vx = berry.vz = 0; h.step(null, null, 60);
	A(Math.abs(h.gw.pl.hp - (10 + h.gw.pl.maxHp * 0.3)) < 0.01 && h.hw.pl.hp === h.hw.pl.maxHp, 'a berry beside the guest heals the guest (the host tells it so)', [h.gw.pl.hp, h.gw.pl.maxHp]);
}

// ---------------------------------------------------------------- a party is harder; lag; traffic
{
	const room = generate(7, 'meadow');
	const solo = newWorld(room, data, { dex: 25, moves: [], seed: 5, weather: false, cast: [RAT] }); solo.pl.invuln = 1e9; for (let i = 0; i < 60 * 90; i++) tick(solo, null);
	const duo = party({ room, cast: [RAT] }); duo.hw.pl.invuln = 1e9; duo.gw.pl.invuln = 1e9; duo.step(null, null, 60 * 90);
	const hpSolo = solo.enemies[0].maxHp, hpDuo = duo.hw.enemies.find((e) => !e.minion).maxHp;
	A(Math.abs(duo.hw.stats.spawned / solo.stats.spawned - 1.75) < 0.2 && Math.abs(hpDuo / hpSolo - 1.3) < 0.05, `with two players more arrive (${duo.hw.stats.spawned} in 90 s against ${solo.stats.spawned}) and each is tougher (${hpDuo} HP against ${hpSolo})`, [duo.hw.stats.spawned, solo.stats.spawned, hpDuo, hpSolo]);
	const perSec = (duo.sent.down + duo.sent.up) / 90;
	A(duo.sent.down / duo.sent.msgs < NK.RELAY_CAP && perSec < 60000, `ninety seconds of that fight: the host's messages average ${Math.round(duo.sent.down / duo.sent.msgs)} characters, the guest's ${Math.round(duo.sent.up / duo.sent.msgs)}; ${(perSec / 1024).toFixed(1)} KB a second both ways`, [duo.sent, perSec]);
	// 300 ms each way: a guest still kills what it shoots at, and is still hurt by what reaches it
	const lag = party({ guestAt: [70, 50], guestMoves: ['ember'], lag: 18 }); lag.hw.pl.invuln = 1e9;
	const target = addEnemy(lag.hw, 1, 76, 50, { dummy: true, hp: 1 }); lag.step(null, null, 60 * 12);
	const chaser = addEnemy(lag.hw, RAT, 74, 51); const g0 = lag.gw.pl.hp; lag.gw.pl.moves.length = 0; lag.step(null, null, 240);
	A(target.dead && lag.gw.pl.hp < g0, 'with 300 ms each way the guest still finishes what it shoots at and is still hurt by what reaches it', [target.dead, target.hp, lag.gw.pl.hp, g0]);
	// a whole fight: both playing, nothing breaks
	const f = party({ room, cast: [RAT, 41, 74, 43, 58], hostMoves: ['ember', 'tackle'], guestMoves: ['water-gun', 'bug-buzz'], autoPick: 0 });
	let bad = '';
	for (let i = 0; i < 60 * 120; i++) { f.step({ mx: Math.sin(i / 90), mz: Math.cos(i / 130), jump: i % 200 < 8, crouch: false }, { mx: Math.cos(i / 110), mz: Math.sin(i / 70), jump: i % 260 < 8, crouch: false }); if (i % 120 === 0) for (const c of f.gw.enemies) if (!Number.isFinite(c.a.x + c.a.y + c.a.z)) bad = 'a copy at no place'; }
	A(!bad && f.hw.stats.kills > 10 && f.gw.stats.hits > 20 && f.hw.pl.level === f.gw.pl.level && f.hw.pl.level >= 2, `two minutes with both playing (cards taken as they come): ${f.hw.stats.kills} KOs between them, the guest landed ${f.gw.stats.hits} hits, both are level ${f.hw.pl.level}`, [bad, f.hw.stats.kills, f.gw.stats.hits, f.hw.pl.level, f.gw.pl.level]);
}

// ---------------------------------------------------------------- down, and up again
{
	const p = party({ guestAt: [70, 50] }); p.hw.pl.invuln = 1e9;
	p.gw.pl.hp = 0; p.gw.pl.dead = true;
	p.step(null, null, 60 * 5);
	A(p.gw.pl.dead && p.gw.pl.reviveT === 0 && p.mate.dead, 'a guest who is down, with the host 20 m away, stays down');
	p.step({ mx: 1, mz: 0, jump: false, crouch: false }, null, 60 * 3);   // the host runs over (7 m/s) and stands by
	const partway = p.gw.pl.reviveT;
	p.step((n) => (Math.hypot(p.hw.pl.s.x - 70, p.hw.pl.s.z - 50) > 1.5 ? { mx: Math.sign(70 - p.hw.pl.s.x), mz: 0, jump: false, crouch: false } : null), null, 60 * 4);
	A(!p.gw.pl.dead && Math.abs(p.gw.pl.hp - p.gw.pl.maxHp * 0.5) < 0.6 && !p.mate.dead, `the host comes and stands beside it: after ${CK.REVIVE.time} s the guest is up at half HP (and the host knows)`, [p.gw.pl.dead, p.gw.pl.hp, partway, p.mate.dead]);
	// the other way: the host down, the guest beside it
	const q = party({ guestAt: [51, 50] }); q.gw.pl.invuln = 1e9; q.hw.pl.hp = 0; q.hw.pl.dead = true;
	q.step(null, null, 60 * 2); const half = q.hw.pl.reviveT; q.step(null, null, 60 * 2);
	A(half > 1.5 && half < 2.1 && !q.hw.pl.dead && Math.abs(q.hw.pl.hp - q.hw.pl.maxHp * 0.5) < 0.6, `a host who is down with the guest beside it: ${half.toFixed(1)} s of the 3 after two seconds, then up`, [half, q.hw.pl.dead, q.hw.pl.hp]);
	const r = party({ guestAt: [51, 50] }); r.gw.pl.invuln = 1e9; r.hw.pl.hp = 0; r.hw.pl.dead = true; r.step(null, null, 90); const got = r.hw.pl.reviveT;
	r.step(null, { mx: 1, mz: 0, jump: false, crouch: false }, 240);   // the guest walks off (it is out of reach after about half a second)
	A(got > 1 && r.hw.pl.reviveT < got - 0.2 && r.hw.pl.dead, 'if the teammate walks away, what they had done drains away', [got, r.hw.pl.reviveT]);
	const both = party({ guestAt: [70, 50] }); both.hw.pl.hp = 0; both.hw.pl.dead = true; both.gw.pl.hp = 0; both.gw.pl.dead = true; both.step(null, null, 60);
	A(both.hw.allDown && both.gw.co.over, 'with everyone down the host says so, and the guest hears it');
}

// ---------------------------------------------------------------- going quiet
{
	// the guest's messages stop arriving: after 3 s it is away
	const p = party({ guestAt: [70, 50] }); p.hw.pl.invuln = 1e9; p.gw.pl.invuln = 1e9;
	const e = addEnemy(p.hw, RAT, 76, 50); p.step(null, null, 30);
	const went = e.tg; const cut = (ticks) => { for (let i = 0; i < ticks; i++) { hostStep(p.hw); tick(p.hw, null); } };   // (only the host runs: nothing arrives)
	cut(60 * 2); const still = p.mate.away; cut(60 * 2);
	A(went === 1 && !still && p.mate.away && e.tg === 0, `a guest not heard from for ${CO.AWAY} s is away: the enemy that was going for it turns to the host`, [went, still, p.mate.away, e.tg]);
	const orb = drop(p.hw, 'xp', p.hw.pl.s.x + 1, 0, p.hw.pl.s.z, xpFor(1) + 1); orb.vx = orb.vz = 0; cut(40); choose(p.hw, 0); const t0 = p.hw.t; cut(40);
	A(p.hw.pl.level === 2 && !p.hw.waiting && p.hw.t > t0, '...and the fight does not wait for an away player to choose a card', [p.hw.pl.level, p.hw.waiting]);
	// the host's frames stop arriving: the guest's fight stands still, and goes on when it is heard again
	const g = party({ guestAt: [70, 50] }); g.hw.pl.invuln = 1e9; g.gw.pl.invuln = 1e9; g.step(null, null, 60);
	const lone = (ticks) => { for (let i = 0; i < ticks; i++) { guestSync(g.gw); tick(g.gw, { mx: 1, mz: 0, jump: false, crouch: false }); } };
	lone(60 * 2); const before = g.gw.co.stalled, x1 = g.gw.pl.s.x; lone(60); const x2 = g.gw.pl.s.x; lone(60);
	A(!before && g.gw.co.stalled && g.gw.waiting && g.gw.pl.s.x === x2 && x2 > x1, `a host not heard from for ${CO.STALL} s: the guest's fight stands still ("waiting for the host")`, [before, g.gw.co.stalled, x1, x2, g.gw.pl.s.x]);
	g.step(null, { mx: 1, mz: 0, jump: false, crouch: false }, 40);
	A(!g.gw.co.stalled && !g.gw.waiting && g.gw.pl.s.x > x2, 'heard again, it goes on');
}

// ---------------------------------------------------------------- three players
{
	const room = flat(), hw = newWorld(room, data, { dex: 25, moves: ['ember'], seed: 5, weather: false, autoPick: 0 });
	const g1 = guestWorld(room, data, { dex: 4, moves: ['water-gun'], seed: 71, id: 1, autoPick: 0 }), g2 = guestWorld(room, data, { dex: 7, moves: ['bug-buzz'], seed: 72, id: 2, autoPick: 0 });
	hostAdd(hw, 1, 4); hostAdd(hw, 2, 7); g1.pl.s.x = 64; g2.pl.s.z = 64; hw.pl.invuln = g1.pl.invuln = g2.pl.invuln = 1e9;
	const eH = addEnemy(hw, RAT, 46, 50, { dummy: true, hp: 2 }), e1 = addEnemy(hw, RAT, 69, 50, { dummy: true, hp: 2 }), e2 = addEnemy(hw, RAT, 50, 66, { dummy: true, hp: 2 }); let ev = [], prev = null;
	for (let n = 1; n <= 60 * 14; n++) { hostStep(hw); tick(hw, null); keepEvents(ev, hw.events); guestSync(g1); tick(g1, null); guestSync(g2); tick(g2, null);
		if (n % EVERY === 0) { const f = hostFrame(hw, ev), text = JSON.stringify(prev && (n / EVERY) % NK.HZ ? diff(prev, f) : f); prev = f; ev = []; guestApply(g1, JSON.parse(text)); guestApply(g2, JSON.parse(text)); hostApply(hw, 1, JSON.parse(JSON.stringify(guestMsg(g1)))); hostApply(hw, 2, JSON.parse(JSON.stringify(guestMsg(g2)))); } }
	const seen1 = g1.co.mates.map((m) => m.id + ':' + m.dex).sort().join(), seen2 = g2.co.mates.map((m) => m.id + ':' + m.dex).sort().join();
	A(hw.mates.length === 2 && seen1 === '0:25,2:7' && seen2 === '0:25,1:4', 'a host and two guests: each guest has the other two (the host and the other guest), by species', [seen1, seen2]);
	A(eH.dead && e1.dead && e2.dead && g1.stats.hits > 0 && g2.stats.hits > 0 && hw.stats.kills === 3, `each finishes the enemy beside it (the host ${hw.stats.fired} shots, the guests ${g1.stats.hits} and ${g2.stats.hits} hits): three KOs on the host`, [eH.dead, e1.dead, e2.dead, hw.stats.kills]);
	A(hw.pl.level === g1.pl.level && g1.pl.level === g2.pl.level, `and all three are the team's level (${hw.pl.level})`, [hw.pl.level, g1.pl.level, g2.pl.level]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
