// micasurvivor_m3d_combat_test.mjs — MicaSurvivor 3D, P3 (Plans/MICASURVIVOR_3D_PLAN.md): enemies and combat where
// HEIGHT matters, in node (micasurvivor/m3d/combat.js, actors.js) with the game's own data. Flat ground is compared
// with the 2D game itself in micasurvivor_m3d_parity_test.mjs; this is what 3D adds.
//   * enemy stats are the 2D game's formulas (HP, damage and speed by tier and by the run's clock)
//   * bodies: a walker cannot climb a wall, walks round by the ramp, drops off a ledge to reach you, floats in a
//     pond; a flyer goes straight over; nobody ends up inside the terrain
//   * a touch needs you within reach in height: jump and a ground enemy under you cannot hurt you
//   * a swing does not reach the ledge above; a shot is aimed up at it and does; a shot into a wall stops there; a
//     beam is cut by the ground
//   * the auto-aim takes the nearest enemy it can SEE before a nearer one behind a wall
//   * knockback is a real shove: a Tackle knocks an enemy off a ledge, and it falls
//   * every base move kind is in (15 of them), and the ones placed in the world respect height: a dash stops at a
//     wall and flies off a ledge, a mine or a patch only catches bodies on its own level, a turret shoots up at a
//     target above it, a boomerang comes back to you wherever you have gone, a homing shot curves
//   * buffs stack and run out; the four control states do what the 2D game's do
//   * enemy behaviours and height: a ranged enemy must see you to shoot (behind a wall it comes round instead), its
//     shot stops at terrain and passes under you when you jump; a mark on the ground can be jumped clear of, and goes
//     through your moment of grace; a charger charges off a ledge; a bomber on the ledge above does not light
//   * the supports and the jumper: a jumper leaps UP onto the ledge you are standing on and cannot touch you in the
//     air; a shield soaks up hits, runs out, and cannot be renewed at once; a healer works through a wall; a
//     summoner's minions never appear inside one
//   * experience: a fallen enemy leaves an orb where it stood; within your reach (in space: not through 3.5 m of
//     height) it flies to you; a magnet calls them all, a berry heals, a bomb clears the field; a level-up stops the
//     fight until one of three cards is taken (a new move, a move's next level, a permanent upgrade), and each card
//     does what it says
//   * bosses: the 2D game's numbers for each of its five boss times; a boss hovers over the terrain (a wall does not
//     stop it), uses its own four attacks, is enraged under half HP, shakes off a state sooner and is then immune,
//     bursts into fourteen orbs with a berry and a magnet, arrives on time and thins the other arrivals; its stomp
//     and its marks can be jumped clear of
//   * Expedition's own move kinds (seven of its eight): each does its work; a lob and a smite reach a target behind
//     a wall that a straight shot cannot; a wave and a spin stay on your level; a vortex cannot drag a body through a
//     wall
//   * weather: it fades in and out, strengthens and weakens types, slows in snow, wears down whoever is not safe
//     from sand and snow (never a boss, never you to nothing), and from 2:00 can start by itself
//   * abilities: one for each species, from the 2D game's table; every one of its effects does what it says (damage
//     by type, kind, pinch, own type; damage taken; speed; cooldown; reach; XP; crit; regeneration; Sturdy; the first
//     hit halved; thorns; a state on whoever touches you; Moxie; Defiant; weather speed and immunity)
//   * held items: the 2D game's 26, each doing what it says (three have nothing to act on here yet), and the Calibre
//     upgrade that sizes your moves
//   * arrivals: enemies appear 16-32 m away on floor they can walk to you from, never past the cap
//   * the fight is deterministic (same seed: the same fight to the last digit), stays in the world through 3 minutes
//     of random play on generated levels, and a tick with 110 enemies is cheap
//   node overworld/tests/micasurvivor_m3d_combat_test.mjs
import { K, CELL, makeRoom, setCell, groundAt, waterAt } from '../../micasurvivor/m3d/sim.js';
import { generate, rng } from '../../micasurvivor/m3d/gen.js';
import { newActor, stepActor, flowField, steer, knock } from '../../micasurvivor/m3d/actors.js';
import { newWorld, addEnemy, addBoss, bossDef, tick, dataFrom, hashWorld, clearLine, applyState, drop, offer, choose, xpFor, setWeather, wxLevel, equip, STATS, U, CK } from '../../micasurvivor/m3d/combat.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const run = (w, n, input = null) => { for (let i = 0; i < n; i++) tick(w, typeof input === 'function' ? input(i) : input); return w; };
const RAT = 19, ZUBAT = 41;   // a walker and a flyer
A(!data.hovers(RAT) && data.hovers(ZUBAT) && !data.hovers(16), 'Rattata walks and Zubat flies (the sprites\' own data: who hovers is the 2D game\'s list, and Pidgey is not on it)');

/** A test yard, 30 × 30 cells, floor 0: a plateau 1.5 m up in the east (x 16..24, z 10..20) with a ramp on its south
 *  side, and a wall 4 m high running north-south at x = 8 (z 5..25). The player starts in the middle, west of the plateau. */
function yard() {
	const r = makeRoom(30, 30, 0);
	for (let z = 10; z <= 20; z++) for (let x = 16; x <= 24; x++) setCell(r, x, z, 1.5);
	for (let x = 19; x <= 21; x++) { setCell(r, x, 21, 0.75, { ax: 'z', rise: -0.75 }); setCell(r, x, 22, 0, { ax: 'z', rise: -0.75 }); }
	for (let x = 19; x <= 21; x++) { setCell(r, x, 21, 1.5, { ax: 'z', rise: -0.75 }); setCell(r, x, 22, 0.75, { ax: 'z', rise: -0.75 }); }
	for (let z = 5; z <= 25; z++) setCell(r, 8, z, 4);
	r.spawn = [12 * CELL + 1, 0, 15 * CELL + 1];
	return r;
}
const at = (cx, cz) => [(cx + 0.5) * CELL, (cz + 0.5) * CELL];

// ---------------------------------------------------------------- stats
{
	const w = newWorld(makeRoom(20, 20, 0), data, { dex: 25 });
	const e0 = addEnemy(w, RAT, 10, 10, { t: 0 }), e5 = addEnemy(w, RAT, 12, 10, { t: 300 });
	const d0 = G.Enemies.defFor(G.DEX_BY[RAT], G.Enemies.TIERS[0], 0), d5 = G.Enemies.defFor(G.DEX_BY[RAT], G.Enemies.TIERS[3], 3);
	A(e0.maxHp === Math.round(d0.hp * 3.3) && near(e0.dmg, d0.dmg * 2.4) && near(e0.a.speed, d0.spd * U), `a Rattata at the start of a run: ${e0.maxHp} HP, ${e0.dmg.toFixed(1)} a touch, ${(e0.a.speed).toFixed(2)} m/s (the 2D game's tier 0 × 3.3 HP, × 2.4 damage)`, [e0.maxHp, e0.dmg, d0]);
	A(e5.maxHp === Math.round(d5.hp * (1 + 300 / 95) * (3.3 + 300 / 210)) && near(e5.dmg, d5.dmg * (1 + 300 / 420) * 2.4) && near(e5.a.speed, d5.spd * (1 + 300 / 1400) * U), `...and five minutes in: ${e5.maxHp} HP, ${e5.dmg.toFixed(1)} a touch (tier 3, scaled by the clock)`, [e5.maxHp, e5.dmg]);
	A(near(e0.cr, G.Sprites.bodyRadius(RAT) * U) && near(w.pl.r, G.Sprites.bodyRadius(25) * U) && near(U, 1 / 16), 'bodies are the 2D game\'s sizes: 16 of its units to a metre', [e0.cr, w.pl.r]);
}

// ---------------------------------------------------------------- bodies on the height field
{
	const r = yard(), [px, pz] = at(20, 15);   // a target on the plateau
	const f = flowField(r, px, pz), wish = [0, 0];
	const go = (o, secs) => { const a = newActor(r, o); let n = 0, minY = 1e9, inside = 0; for (; n < secs * 60 && Math.hypot(a.x - px, a.z - pz) > 0.6; n++) { steer(r, f, a, wish); stepActor(a, r, wish[0], wish[1]); if (a.y < groundAt(r, a.x, a.z) - 1e-6) inside++; } return { a, t: n / 60, there: Math.hypot(a.x - px, a.z - pz) <= 0.6, inside }; };
	const [sx, sz] = at(13, 15);
	const walker = go({ x: sx, z: sz, speed: 4 }, 40), flyer = go({ x: sx, z: sz, speed: 4, fly: true, hover: 0.6 }, 40);
	const straight = Math.hypot(px - sx, pz - sz) / 4;
	A(walker.there && walker.t > straight * 1.8 && near(walker.a.y, 1.5), `a walker cannot climb the plateau's 1.5 m side: it goes round by the ramp (${walker.t.toFixed(1)} s; straight would be ${straight.toFixed(1)} s)`, [walker.t, walker.a]);
	A(flyer.there && flyer.t < straight * 1.25 && flyer.a.y > 1.9, `a flyer goes straight over (${flyer.t.toFixed(1)} s), hovering above the plateau`, [flyer.t, flyer.a.y]);
	A(walker.inside === 0 && flyer.inside === 0, 'neither is ever under the floor');
	// pushing straight at the side: stopped
	const push = newActor(r, { x: sx, z: sz, speed: 4 }); for (let i = 0; i < 240; i++) stepActor(push, r, 1, 0);
	A(push.x < 16 * CELL - 0.3 && push.y === 0, 'walking straight at the side, it is stopped at the wall', [push.x, push.y]);
	// down: from the plateau to a target on the low ground, it drops off the edge
	const f2 = flowField(r, sx, sz), top = newActor(r, { x: px, z: pz, speed: 4 }); let fell = 0, n = 0;
	for (; n < 600 && Math.hypot(top.x - sx, top.z - sz) > 0.6; n++) { steer(r, f2, top, wish); stepActor(top, r, wish[0], wish[1]); if (top.fell) fell = top.fell; }
	A(near(fell, 1.5, 0.01) && top.y === 0 && n / 60 < straight * 1.6, `going down it does not look for the ramp: it drops off the edge (a ${fell.toFixed(1)} m fall) and keeps coming`, [fell, n / 60, top]);
	// the wall: 4 m, no way over for a walker; the flow field sends it round the end
	const [wx, wz] = at(5, 15), fw = flowField(r, wx, wz), round = newActor(r, { x: sx, z: sz, speed: 4 }); let m = 0, maxZ = 0;
	for (; m < 60 * 60 && Math.hypot(round.x - wx, round.z - wz) > 0.6; m++) { steer(r, fw, round, wish); stepActor(round, r, wish[0], wish[1]); maxZ = Math.max(maxZ, Math.abs(round.z - 15.5 * CELL)); }
	A(Math.hypot(round.x - wx, round.z - wz) <= 0.6 && maxZ > 10 * CELL, 'a 4 m wall between you: the walker goes round its end', [m / 60, maxZ]);
	// water: a walker floats across a pond
	const pond = makeRoom(16, 8, 0); for (let x = 5; x <= 10; x++) for (let z = 1; z <= 6; z++) { setCell(pond, x, z, x === 5 || x === 10 ? -0.34 : x === 6 || x === 9 ? -0.68 : -2.2); pond.water.set(z * 16 + x, -0.1); }
	const sw = newActor(pond, { x: 3, z: 8, speed: 4 }); let swam = 0, low = 0;
	for (let i = 0; i < 60 * 20 && sw.x < 26; i++) { stepActor(sw, pond, 1, 0); if (sw.swimming) { swam++; low = Math.min(low, sw.y); } }
	A(sw.x >= 26 && swam > 60 && near(low, -0.1 - K.SWIM_DEPTH) && sw.y === 0, `a walker swims a pond (floating at ${low.toFixed(2)} m, slower) and walks out the far side`, [sw.x, swam, low, sw.y]);
}

// ---------------------------------------------------------------- a touch needs you in reach
{
	const flat = makeRoom(30, 30, 0); flat.spawn = [30, 0, 30];
	const stand = newWorld(flat, data, { dex: 25, seed: 1 }); addEnemy(stand, RAT, 31, 30);
	run(stand, 120);
	A(stand.stats.touched >= 3 && near(stand.stats.taken, stand.stats.touched * stand.enemies[0].dmg * data.typeMult('normal', ['electric'])), `standing in a Rattata: it touches you every ${CK.TOUCH_CD} s (${stand.stats.touched} times in 2 s)`, stand.stats);
	// bouncing: hold jump, two air jumps' worth of height — count the touches while you are more than a metre up
	const hop = newWorld(flat, data, { dex: 25, seed: 1 }); addEnemy(hop, RAT, 31, 30);
	let high = 0, touchedHigh = 0, last = 0;
	for (let i = 0; i < 600; i++) { tick(hop, { mx: 0, mz: 0, jump: i % 20 < 10, crouch: false }); const up = hop.pl.s.y > CK.TOUCH_UP + 0.05; if (up) high++; if (hop.stats.touched > last) { if (up) touchedHigh++; last = hop.stats.touched; } }
	A(high > 100 && touchedHigh === 0 && hop.stats.touched < stand.stats.touched * 5, `jumping: in the ${high} ticks you are more than 1 m up, it cannot touch you (${hop.stats.touched} touches in 10 s, all near the ground)`, [high, touchedHigh, hop.stats]);
	// a flyer reaches a little higher, and a walker on the ledge above cannot touch you below
	const r = yard(), led = newWorld(r, data, { dex: 25, seed: 1 }); led.pl.s.x = 16 * CELL - 0.6; led.pl.s.z = 15 * CELL;
	const e = addEnemy(led, RAT, 16 * CELL + 0.5, 15 * CELL, { dummy: true }); e.dummy = false; e.a.speed = 0;
	run(led, 180);
	A(led.stats.touched === 0 && Math.hypot(e.a.x - led.pl.s.x, e.a.z - led.pl.s.z) < e.cr + led.pl.r, 'an enemy on the ledge 1.5 m above you, close enough to touch on a map: it cannot', [led.stats, e.a]);
}

// ---------------------------------------------------------------- swings, shots, beams and the terrain
{
	const r = yard();
	const mk = (moves, ex, ez, o = {}) => { const w = newWorld(r, data, { dex: 25, moves, seed: 5 }); if (o.px !== undefined) { w.pl.s.x = o.px; w.pl.s.z = o.pz; } const e = addEnemy(w, o.dex || RAT, ex, ez, { dummy: true, hp: 1000 }); return { w, e }; };
	// you below the plateau's west side, the target up on its edge: 1.5 m above, 1.6 m away
	const below = { px: 16 * CELL - 1, pz: 15 * CELL };
	const sw = mk(['tackle'], 16 * CELL + 0.6, 15 * CELL, below); sw.e.a.y = 1.5; run(sw.w, 180);
	const flatSw = newWorld(makeRoom(30, 30, 0), data, { dex: 25, moves: ['tackle'], seed: 5 }); flatSw.pl.s.x = 20; flatSw.pl.s.z = 20; flatSw.pl.s.y = 0; addEnemy(flatSw, RAT, 21.6, 20, { dummy: true, hp: 1000 }); run(flatSw, 30);
	A(flatSw.stats.hits >= 1 && sw.w.stats.hits === 0 && sw.w.stats.removed === 0, 'Tackle reaches a target 1.6 m away on your level, and not the same target on the ledge 1.5 m above', [flatSw.stats.hits, sw.w.stats]);
	const sh = mk(['ember'], 16 * CELL + 2.5, 15 * CELL, { px: 16 * CELL - 5, pz: 15 * CELL }); run(sh.w, 180);
	A(sh.w.stats.hits >= 4 && sh.w.stats.blocked === 0, `Ember is aimed up at a target on the plateau and hits it (${sh.w.stats.hits} hits in 3 s, none into the cliff)`, sh.w.stats);
	const lvl = mk(['ember'], 16 * CELL + 2.5, 15 * CELL, { px: 16 * CELL - 5, pz: 15 * CELL }); let first = null; for (let i = 0; i < 10 && !first; i++) { tick(lvl.w, null); first = lvl.w.shots[0] ? { ...lvl.w.shots[0] } : null; }
	A(first && first.vy > 0.5 && first.vx > 5, 'the shot leaves climbing (its velocity has an upward part)', first);
	// behind the wall: you at x 13, the target at x 5, the 4 m wall at x 8
	const [bx, bz] = at(5, 15);
	const wl = mk(['ember'], bx, bz); run(wl.w, 240);
	A(wl.w.stats.fired >= 6 && wl.w.stats.hits === 0 && wl.w.stats.blocked === wl.w.stats.fired - wl.w.shots.length, `a target behind a 4 m wall: every Ember stops at the wall (${wl.w.stats.blocked} of ${wl.w.stats.fired})`, wl.w.stats);
	const bm = mk(['hydro-pump'], bx, bz); let cut = null; for (let i = 0; i < 240; i++) { tick(bm.w, null); const ev = bm.w.events.find((q) => q.k === 'beam'); if (ev) cut = ev; }
	const full = G.Moves.BY_ID['hydro-pump'].radius * U;
	A(cut && cut.len < full - 2 && near(bm.w.pl.s.x - cut.len, 9 * CELL, 0.6) && bm.w.stats.hits === 0, `Hydro Pump is cut where it meets the wall (${cut && cut.len.toFixed(1)} m of ${full.toFixed(1)} m) and does not hit behind it`, [cut, bm.w.stats]);
	const open = mk(['hydro-pump'], 13 * CELL + 1, 20 * CELL); run(open.w, 240);
	A(open.w.stats.hits >= 2, 'with nothing in the way the same beam hits', open.w.stats);
	A(clearLine(r, 25, 0.8, 31, 40, 0.8, 31) === false && clearLine(r, 25, 0.8, 31, 25, 0.8, 45) === true && clearLine(r, 25, 0.8, 31, 5, 0.8, 31) === false && clearLine(r, 25, 4.5, 31, 5, 4.5, 31) === true, 'a clear line: blocked by the plateau and the wall, free along the open floor and over the wall\'s top');
}

// ---------------------------------------------------------------- the auto-aim sees
{
	const r = yard(), w = newWorld(r, data, { dex: 25, moves: ['ember'], seed: 5 });
	w.pl.s.x = 10 * CELL; w.pl.s.z = 15 * CELL;                                   // 1 m east of the wall's cell edge
	const hidden = addEnemy(w, RAT, 7 * CELL, 15 * CELL, { dummy: true, hp: 1000 });   // 6 m away, behind the wall
	const seen = addEnemy(w, RAT, 10 * CELL, 21 * CELL, { dummy: true, hp: 1000 });     // 12 m away, in the open
	run(w, 200);
	A(w.pl.target === seen && seen.hp < seen.maxHp && hidden.hp === hidden.maxHp && w.stats.blocked === 0, 'two targets, the nearer one behind the wall: you aim at the one you can see, and no shot is wasted on the wall', [w.stats, hidden.hp, seen.hp]);
	seen.dead = true; run(w, 2);
	A(w.pl.target === hidden, '...and with no one in sight, at the nearest anyway (it may come round)');
}

// ---------------------------------------------------------------- knocked off a ledge
{
	const r = yard(), w = newWorld(r, data, { dex: 25, moves: [['tackle', 1]], seed: 5 });
	// both on the plateau: you 2.6 m from its west edge, a Rattata between you and the edge
	w.pl.s.x = 16 * CELL + 2.6; w.pl.s.z = 15 * CELL; w.pl.s.y = 1.5;
	const e = addEnemy(w, RAT, 16 * CELL + 0.9, 15 * CELL, { dummy: true, hp: 1000 });
	let fell = 0; for (let i = 0; i < 90; i++) { tick(w, null); const ev = w.events.find((q) => q.k === 'fell'); if (ev) fell = ev.h; }
	A(w.stats.hits >= 1 && near(fell, 1.5, 0.01) && e.a.y === 0 && e.a.x < 16 * CELL, `Tackle's shove sends a Rattata over the plateau's edge: it falls ${fell.toFixed(1)} m to the floor below`, [w.stats, e.a, fell]);
	const a = newActor(r, { x: 20 * CELL, z: 15 * CELL }); knock(a, 0, 0, 8); let top = a.y; for (let i = 0; i < 60; i++) { stepActor(a, r, 0, 0); top = Math.max(top, a.y); }
	A(top > 2.2 && near(a.y, 1.5) && a.grounded, 'a shove upward throws a body into the air and it comes back down', [top, a.y]);
}

// ---------------------------------------------------------------- the kinds placed in the world, and height
{
	const kinds = new Set(G.Moves.ALL.map((m) => m.kind)), flat = () => { const r = makeRoom(40, 40, 0); r.spawn = [40, 0, 40]; return r; };
	const each = [...kinds].map((k) => { const m = G.Moves.ALL.find((q) => q.kind === k), w = newWorld(flat(), data, { dex: 25, moves: [m.id], seed: 4 }); addEnemy(w, RAT, 40 + (k === 'orbit' ? m.radius : 28) * U, 40, { dummy: true, hp: 1e5 }); run(w, 600); return [k, m.id, w.stats.hits, w.pl.buffs.atk.n + w.pl.buffs.spd.n + w.pl.buffs.def.n + w.pl.buffs.regen.n]; });
	A(kinds.size === 15 && each.every(([k, , hits, buffs]) => (k === 'buff' ? buffs > 0 : hits > 0)) && CK.UNPORTED.length === 0, `all 15 of the base game's move kinds do their work here (${each.map((e) => e[0]).join(', ')})`, each);
	const r = yard();
	const mk = (moves, ex, ez, px, pz, o = {}) => { const w = newWorld(r, data, { dex: 25, moves, seed: 5 }); w.pl.s.x = px; w.pl.s.z = pz; w.pl.s.y = groundAt(r, px, pz); w.pl.invuln = 1e9; const e = addEnemy(w, RAT, ex, ez, { dummy: true, hp: 1e5, ...o }); return { w, e }; };
	// a dash at a target behind the 4 m wall stops at the wall; on the plateau, a dash at a target below flies off the edge
	const d1 = mk(['quick-attack'], 9 * CELL + 4, 15 * CELL, 9 * CELL + 6, 15 * CELL); const far = mk(['quick-attack'], 5 * CELL, 15.5 * CELL, 10 * CELL, 15.5 * CELL); run(far.w, 30);
	A(far.w.pl.s.x >= 9 * CELL + 0.2 && far.w.pl.s.x < 10 * CELL - 0.5 && far.w.stats.hits === 0, `a dash at a target behind the wall stops at the wall (from x ${(10 * CELL).toFixed(0)} to ${far.w.pl.s.x.toFixed(1)}; the wall's face is at ${9 * CELL})`, [far.w.pl.s, far.w.stats]);
	run(d1.w, 20); A(d1.w.stats.hits >= 1 && d1.w.pl.s.x < 9 * CELL + 5, 'in the open the dash carries you through its target and hits it', [d1.w.pl.s.x, d1.w.stats]);
	const off = mk(['quick-attack'], 16 * CELL - 3, 15 * CELL, 16 * CELL + 1.5, 15 * CELL); off.e.a.y = 1.5; off.e.a.grounded = false;   // (a target hanging just off the edge, at your height)
	let air = false, low = 9; for (let i = 0; i < 60; i++) { tick(off.w, null); if (!off.w.pl.s.grounded && off.w.pl.s.x < 16 * CELL) air = true; low = Math.min(low, off.w.pl.s.y); }
	A(air && low === 0 && off.w.pl.s.x < 16 * CELL, 'a dash off the plateau\'s edge leaves you in the air past it, and you fall to the floor below', [air, low, off.w.pl.s]);
	// a patch laid at the foot of the plateau does not burn a body on top of it; the same patch does on its own level
	const up = mk(['flame-wheel'], 16 * CELL + 0.7, 15 * CELL, 16 * CELL - 0.7, 15 * CELL); up.e.a.y = 1.5; run(up.w, 120);
	const lv = mk(['flame-wheel'], 14 * CELL + 1.4, 15 * CELL, 14 * CELL, 15 * CELL); run(lv.w, 120);
	A(up.w.fields.length >= 1 && up.w.stats.hits === 0 && lv.w.stats.hits >= 3, `a patch on the floor burns what stands in it (${lv.w.stats.hits} ticks in 2 s), not a body on the ledge 1.5 m above it`, [up.w.stats, lv.w.stats]);
	// a mine: set off by a body on its level only
	const m0 = newWorld(r, data, { dex: 25, moves: [], seed: 5 }); m0.pl.invuln = 1e9;
	const spikes = data.move('spikes'), fx = 16 * CELL - 0.5, fz = 15 * CELL;
	m0.fields.push({ kind: 'mine', id: 9001, m: spikes, x: fx, z: fz, y: 0, t: 0, arm: 0.35, life: 60, r: spikes.radius * U, dmg: 10 });
	const above = addEnemy(m0, RAT, 16 * CELL + 0.6, fz, { dummy: true, hp: 1e5 }); run(m0, 60);
	const waiting = m0.fields.length === 1 && m0.stats.hits === 0;
	const walker = addEnemy(m0, RAT, fx - 0.5, fz + 0.3, { dummy: true, hp: 1e5 }); run(m0, 5);
	A(waiting && m0.fields.length === 0 && walker.hp < walker.maxHp && above.hp === above.maxHp, 'a mine at the foot of the ledge waits under a body up on the ledge, goes off under one that walks onto it, and the blast stays on its level', [waiting, m0.fields.length, walker.hp, above.hp]);
	// a turret shoots up at a target on the plateau
	const tu = mk(['will-o-wisp'], 16 * CELL + 2.5, 15 * CELL, 16 * CELL - 6, 15 * CELL); let climb = 0; for (let i = 0; i < 300; i++) { tick(tu.w, null); for (const p of tu.w.shots) climb = Math.max(climb, p.vy); }
	A(tu.w.fields.some((f) => f.kind === 'turret') && climb > 0.5 && tu.w.stats.hits >= 3, `a turret on the floor shoots up at a target on the plateau and hits it (${tu.w.stats.hits} hits in 5 s)`, [climb, tu.w.stats]);
	// a boomerang comes back to where you ARE: throw it, then jump up onto... run away east
	const bo = newWorld(flat(), data, { dex: 25, moves: ['bonemerang'], seed: 5 }); bo.pl.invuln = 1e9; const be = addEnemy(bo, RAT, 40 + 60 * U, 40, { dummy: true, hp: 1e5 });
	let thrown = 0, backHits = 0, home = 0; const seen = new Set();
	for (let i = 0; i < 400; i++) { tick(bo, { mx: 0, mz: 1, jump: false, crouch: false }); for (const p of bo.shots) { if (!seen.has(p.id)) { seen.add(p.id); thrown++; } if (p.back) backHits = Math.max(backHits, p.hits.size); } }
	for (const p of bo.shots) if (p.back) home++;
	A(thrown >= 3 && bo.stats.hits >= thrown && bo.shots.length <= 3, `boomerangs go out, turn round and come home to you while you run (${thrown} thrown, ${bo.stats.hits} hits, ${bo.shots.length} still in the air)`, [thrown, bo.stats, bo.shots.length]);
	// a homing shot curves: the target is 60° off the line of fire and it still arrives
	const hm = G.Moves.ALL.find((q) => q.homing && q.kind === 'projectile');
	if (hm) { const ho = newWorld(flat(), data, { dex: 25, moves: [], seed: 5 }); const t = addEnemy(ho, RAT, 40 + 6, 40 + 9, { dummy: true, hp: 1e5 }); const inst = data.move(hm.id); inst.ccp = 0;
		ho.shots.push({ id: 1, x: 40, y: CK.MUZZLE, z: 40, vx: inst.speed * U, vy: 0, vz: 0, dmg: 10, r: inst.size * U, life: 3, t: 0, pierce: 0, homing: inst.homing, hits: new Set(), px: null, py: 0, pz: 0, mtype: inst.type, mid: inst.id });
		const st = newWorld(flat(), data, { dex: 25, moves: [], seed: 5 }); addEnemy(st, RAT, 40 + 6, 40 + 9, { dummy: true, hp: 1e5 });
		st.shots.push({ id: 1, x: 40, y: CK.MUZZLE, z: 40, vx: inst.speed * U, vy: 0, vz: 0, dmg: 10, r: inst.size * U, life: 3, t: 0, pierce: 0, homing: 0, hits: new Set(), px: null, py: 0, pz: 0, mtype: inst.type, mid: inst.id });
		ho.pl.moves.length = 0; run(ho, 180); run(st, 180);
		A(ho.stats.hits === 1 && st.stats.hits === 0, `a homing shot (${hm.id}) fired past a target curves into it; a plain one flies on by`, [ho.stats.hits, st.stats.hits]); }
}

// ---------------------------------------------------------------- buffs and states
{
	const flat = makeRoom(40, 40, 0); flat.spawn = [40, 0, 40];
	const sd = G.Moves.BY_ID['swords-dance'], w = newWorld(flat, data, { dex: 25, moves: ['swords-dance'], seed: 2 });
	run(w, Math.round(60 * (sd.cd * sd.stacks + 1)));
	A(w.pl.buffs.atk.n === sd.stacks, `Swords Dance stacks to its limit (${sd.stacks} × ${sd.amount * 100} %)`, w.pl.buffs.atk);
	w.pl.moves.length = 0; run(w, Math.round(60 * sd.dur) + 5);
	A(w.pl.buffs.atk.n === 0, `...and is gone ${sd.dur} s after the last cast`, w.pl.buffs.atk);
	const ag = newWorld(flat, data, { dex: 25, moves: ['agility'], seed: 2 }), base = newWorld(flat, data, { dex: 25, moves: [], seed: 2 });
	run(ag, 240, { mx: 1, mz: 0, jump: false, crouch: false }); run(base, 240, { mx: 1, mz: 0, jump: false, crouch: false });
	A(ag.pl.s.x > base.pl.s.x + 2 && Math.hypot(ag.pl.s.vx, ag.pl.s.vz) > K.RUN * 1.2, `Agility makes you run faster (${Math.hypot(ag.pl.s.vx, ag.pl.s.vz).toFixed(1)} m/s; ${K.RUN} without)`, [ag.pl.s.x, base.pl.s.x]);
	const hd = newWorld(flat, data, { dex: 25, moves: ['harden'], seed: 2 }), soft = newWorld(flat, data, { dex: 25, moves: [], seed: 2 });
	for (const q of [hd, soft]) { run(q, 300); addEnemy(q, RAT, 40.5, 40); run(q, 20); }
	A(hd.stats.touched === 1 && soft.stats.touched === 1 && hd.stats.taken < soft.stats.taken * 0.85, `Harden: the same touch hurts less (${hd.stats.taken.toFixed(1)} against ${soft.stats.taken.toFixed(1)})`, [hd.stats, soft.stats]);
	// the states
	const s = newWorld(flat, data, { dex: 25, moves: [], seed: 2 }); s.pl.invuln = 1e9;
	const fr = addEnemy(s, RAT, 46, 40), sl = addEnemy(s, RAT, 40, 46), pa = addEnemy(s, RAT, 34, 40), ok = addEnemy(s, RAT, 40, 34);
	applyState(s, fr, 'freeze'); applyState(s, sl, 'sleep'); applyState(s, pa, 'para');
	run(s, 60);
	const moved = (e, x, z) => Math.hypot(e.a.x - x, e.a.z - z);
	A(moved(fr, 46, 40) === 0 && moved(sl, 40, 46) === 0 && near(moved(pa, 34, 40) / moved(ok, 40, 34), 0.4, 0.02), 'frozen and asleep they do not move; paralysed they come at 40 % speed', [moved(fr, 46, 40), moved(sl, 40, 46), moved(pa, 34, 40), moved(ok, 40, 34)]);
	A(applyState(s, fr, 'para') === 0 && applyState(s, sl, 'conf') === 0 && applyState(s, sl, 'freeze') > 0 && sl.sleepT === 0, 'a frozen or sleeping enemy cannot also be paralysed or confused; freezing a sleeper replaces the sleep');
	run(s, 60 * 4); A(fr.frozenT === 0 && pa.paraT === 0 && moved(fr, 46, 40) > 1, 'the states wear off (freeze 1.8 s, paralysis 3 s) and they come for you again', [fr.frozenT, pa.paraT]);
	// a move's own dice: Thunder Shock paralyses about 18 % of the time
	const ts = G.Moves.BY_ID['thunder-shock'], d = newWorld(flat, data, { dex: 25, moves: ['thunder-shock'], seed: 8 }); const tgt = addEnemy(d, 7, 40 + 100 * U, 40, { dummy: true, hp: 1e6 });
	let states = 0; for (let i = 0; i < 60 * 120; i++) { tick(d, null); states += d.events.filter((q) => q.k === 'state').length; }
	const fresh = states / d.stats.hits;
	A(d.stats.hits > 150 && fresh > 0.04 && fresh < ts.ccp, `Thunder Shock's ${ts.ccp * 100} % chance to paralyse really rolls (${states} fresh paralyses in ${d.stats.hits} hits; hits on an already paralysed target do not count as fresh)`, [states, d.stats.hits]);
}

// ---------------------------------------------------------------- enemy behaviours and height
{
	const r = yard(), RANGED = 58, FAN = 43, BOMB = 74, CHARGE = 133, BEAM = 63, ZONE = 32;
	const beh = (d) => G.Enemies.behaviorOf(G.DEX_BY[d]);
	A(beh(RANGED) === 'ranged' && beh(FAN) === 'fan' && beh(BOMB) === 'bomber' && beh(CHARGE) === 'charger' && beh(BEAM) === 'beamer' && beh(ZONE) === 'zoner', 'the species used here: Growlithe shoots, Oddish fans, Geodude explodes, Eevee charges, Abra beams, Nidoran marks the ground (the 2D game\'s own table)', [RANGED, FAN, BOMB, CHARGE, BEAM, ZONE].map(beh));
	const mk = (dex, ex, ez, px, pz) => { const w = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); w.pl.s.x = px; w.pl.s.z = pz; w.pl.s.y = groundAt(r, px, pz); const e = addEnemy(w, dex, ex, ez); e.shotCd = 0.2; return { w, e }; };
	// in the open, 8 m away: it shoots and hits
	const open = mk(RANGED, 13 * CELL, 22 * CELL, 13 * CELL, 26 * CELL); let fired = 0; for (let i = 0; i < 240; i++) { tick(open.w, null); fired += open.w.events.filter((q) => q.k === 'eshot').length; }
	A(fired >= 2 && open.w.stats.taken > 0 && open.w.stats.touched === 0, `a ranged enemy with a clear view shoots (${fired} shots in 4 s) and they hit, without it ever touching you`, open.w.stats);
	// the 4 m wall between you: no shot; it walks round the wall's end instead of standing off
	const wall = mk(RANGED, 6 * CELL, 15 * CELL, 11 * CELL, 15 * CELL); let f2 = 0, moved = 0; const x0 = wall.e.a.x, z0 = wall.e.a.z;
	for (let i = 0; i < 240; i++) { tick(wall.w, null); f2 += wall.w.events.filter((q) => q.k === 'eshot').length; moved = Math.max(moved, Math.hypot(wall.e.a.x - x0, wall.e.a.z - z0)); }
	A(f2 === 0 && wall.w.stats.taken === 0 && moved > 8, `with a wall between you it does not shoot: it comes round (${moved.toFixed(0)} m in 4 s)`, [f2, moved]);
	// a shot in the air when you step behind cover stops at the cover; one aimed at your chest passes under a jump
	const cov = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); cov.pl.s.x = 16 * CELL + 3; cov.pl.s.z = 15 * CELL; cov.pl.s.y = 1.5;
	cov.eshots.push({ id: 1, x: 10 * CELL, y: 0.8, z: 15 * CELL, vx: 190 * U, vy: 0, vz: 0, dmg: 9, r: 7 * U, life: 2.4, t: 0, mtype: 'fire' }); run(cov, 120);
	A(cov.eshots.length === 0 && cov.stats.taken === 0, 'a shot fired along the floor at you up on the plateau stops at the plateau\'s side');
	const flat = makeRoom(30, 30, 0); flat.spawn = [30, 0, 30];
	const shotAt = (y) => { const w = newWorld(flat, data, { dex: 25, moves: [], seed: 6 }); w.pl.s.y = y; w.pl.s.grounded = y === 0; w.pl.s.vy = y ? 5.5 : 0; w.eshots.push({ id: 1, x: 30 - 190 * U * 0.2, y: 0.8, z: 30, vx: 190 * U, vy: 0, vz: 0, dmg: 9, r: 7 * U, life: 2.4, t: 0, mtype: 'normal' }); run(w, 30); return w.stats.taken; };
	A(shotAt(0) > 0 && shotAt(1.45) === 0, 'the same shot hits you standing and passes under you while you are high in a jump');
	// a mark on the ground: through the moment of grace; clear of it in the air
	const zone = (y, invuln) => { const w = newWorld(flat, data, { dex: 25, moves: [], seed: 6 }); const e = addEnemy(w, ZONE, 36, 30); e.shotCd = 0; e.a.speed = 0; tick(w, null); const made = w.hazards.length; let i = 0; for (; i < 200 && !w.events.some((q) => q.k === 'boom'); i++) { if (i === 60) { w.pl.s.y = y; w.pl.s.grounded = y === 0; w.pl.s.vy = y ? 7 : 0; w.pl.invuln = invuln; } tick(w, null); } return { made, at: i / 60, taken: w.stats.taken }; };
	const stood = zone(0, 0.4), grace = zone(0, 0.4), jumped = zone(1.3, 0);
	A(stood.made >= 1 && stood.taken > 0 && grace.taken > 0 && Math.abs(stood.at - 1.2) < 0.1, `a zoner's mark goes off after ${stood.at.toFixed(2)} s and hurts you even in the moment of grace after another hit`, [stood, grace]);
	A(jumped.made >= 1 && jumped.taken === 0, 'in the air above it (more than 1.2 m up) when it goes off, you are clear', jumped);
	// a beam's mark along the floor does not reach the plateau
	const bw = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); bw.pl.s.x = 16 * CELL + 2; bw.pl.s.z = 15 * CELL; bw.pl.s.y = 1.5; const be = addEnemy(bw, BEAM, 12 * CELL, 15 * CELL); be.shotCd = 0; be.a.speed = 0; be.fly = false; be.a.fly = false; be.a.y = 0; be.a.grounded = true;
	let booms = 0; for (let i = 0; i < 150; i++) { tick(bw, null); booms += bw.events.filter((q) => q.k === 'boom').length; }
	A(booms >= 1 && bw.stats.taken === 0, 'a beamer on the floor below sees you up on the plateau and fires its line along the floor, under you', [booms, bw.stats.taken]);
	// a charger on the plateau, you on the floor below within its 200 units: it will not aim (you are not on its level); on a level, it charges and overshoots off the edge
	const cw = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); cw.pl.s.x = 16 * CELL + 0.9; cw.pl.s.z = 15 * CELL; cw.pl.s.y = 1.5; cw.pl.invuln = 1e9;
	const ce = addEnemy(cw, CHARGE, 16 * CELL + 4.4, 15 * CELL); let aimed = 0, fell = 0; for (let i = 0; i < 200; i++) { tick(cw, null); aimed += cw.events.filter((q) => q.k === 'aim').length; const ev = cw.events.find((q) => q.k === 'fell'); if (ev) fell = ev.h; }
	A(aimed >= 1 && near(fell, 1.5, 0.01) && ce.a.y === 0 && ce.a.x < 16 * CELL, `a charger takes aim across the plateau, comes through you and goes off the edge behind you (a ${fell.toFixed(1)} m fall)`, [aimed, fell, ce.a]);
	const lw = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); lw.pl.s.x = 16 * CELL - 4; lw.pl.s.z = 15 * CELL; const le = addEnemy(lw, CHARGE, 16 * CELL + 3, 15 * CELL); le.a.speed = 0; let a2 = 0; for (let i = 0; i < 120; i++) { tick(lw, null); a2 += lw.events.filter((q) => q.k === 'aim').length; }
	A(a2 === 0, 'with you on the floor below its ledge it does not take aim (it has to come down to you first)', a2);
	// a bomber on the ledge above you does not light; next to you on your level it does, and it goes with the blast
	const bb = newWorld(r, data, { dex: 25, moves: [], seed: 6 }); bb.pl.s.x = 16 * CELL - 0.8; bb.pl.s.z = 15 * CELL; const up = addEnemy(bb, BOMB, 16 * CELL + 0.8, 15 * CELL); up.a.speed = 0; run(bb, 120);
	const lit0 = up.phase; const dn = addEnemy(bb, BOMB, 16 * CELL - 2.6, 15 * CELL); dn.a.speed = 0; run(bb, 80);
	A(lit0 === 'walk' && !up.dead && dn.dead && bb.stats.taken > 0, 'a bomber on the ledge above does not light its fuse; one beside you does, hurts you and is gone', [lit0, up.dead, dn.dead, bb.stats.taken]);
	// all of them at once on a generated level: nothing breaks
	const room = generate(12, 'meadow'), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle'], seed: 21, cast: [RANGED, FAN, BOMB, CHARGE, BEAM, ZONE, RAT], autoPick: 0 }); w.pl.invuln = 1e9;
	const seen = { eshot: 0, hazard: 0, boom: 0, aim: 0 }; let bad = '';
	for (let i = 0; i < 60 * 150; i++) { tick(w, { mx: Math.sin(i / 90), mz: Math.cos(i / 130), jump: i % 300 < 8, crouch: false }); for (const ev of w.events) if (seen[ev.k] !== undefined) seen[ev.k]++; if (i % 60 === 0) for (const p of w.eshots) if (!Number.isFinite(p.x + p.y + p.z)) bad = 'shot'; }
	A(!bad && seen.eshot > 10 && seen.hazard > 5 && seen.boom > 5 && seen.aim > 2 && w.eshots.length < 80, `150 s against all of them on a generated level: ${seen.eshot} volleys, ${seen.hazard} marks, ${seen.aim} charges, and the fight goes on`, [seen, w.stats]);
}

// ---------------------------------------------------------------- the supports and the jumper
{
	const r = yard(), JUMP = 39, HEALER = 35, SHIELDER = 95, SUMMONER = 10;
	const beh = (d) => G.Enemies.behaviorOf(G.DEX_BY[d]);
	A(beh(JUMP) === 'jumper' && beh(HEALER) === 'healer' && beh(SHIELDER) === 'shielder' && beh(SUMMONER) === 'summoner' && CK.LATER.length === 0, 'Jigglypuff jumps, Clefairy heals, Onix shields, Caterpie summons (the 2D game\'s table): every behaviour in it is in the 3D rules now', [JUMP, HEALER, SHIELDER, SUMMONER].map(beh));
	// you on the plateau by its west edge, a jumper on the floor below: no ramp needed
	const w = newWorld(r, data, { dex: 25, moves: [], seed: 3 }); w.pl.s.x = 16 * CELL + 1.5; w.pl.s.z = 15 * CELL; w.pl.s.y = 1.5; w.pl.invuln = 1e9;
	const j = addEnemy(w, JUMP, 16 * CELL - 5, 15 * CELL); j.skillCd = 0.2; j.a.speed = 0;
	let top = 0, touchedInAir = 0, marks = 0, t0 = w.stats.touched, landed = null, was = false; for (let i = 0; i < 120; i++) { tick(w, null); const high = j.a.y - w.pl.s.y > CK.TOUCH_UP; top = Math.max(top, j.a.y); marks += w.events.filter((q) => q.k === 'hazard').length; if (high && w.stats.touched > t0) touchedInAir++; t0 = w.stats.touched; if (was && !j.jump && !landed) landed = { x: j.a.x, y: j.a.y, z: j.a.z, grounded: j.a.grounded }; was = !!j.jump; }
	A(marks === 1 && top > 2.5 && landed && landed.y === 1.5 && Math.hypot(landed.x - w.pl.s.x, landed.z - w.pl.s.z) < 0.5 && landed.grounded, `a jumper on the floor below leaps up onto the plateau where you stand (its arc tops out at ${top.toFixed(1)} m) and lands on your spot`, [marks, top, j.a]);
	A(touchedInAir === 0, 'while it is more than a metre above you in its arc it cannot touch you');
	// a shield: 30 % of its HP soaked up; gone after 7 s; not renewed for 14 s
	const flat = makeRoom(40, 40, 0); flat.spawn = [40, 0, 40];
	const s = newWorld(flat, data, { dex: 25, moves: [], seed: 3 }); s.pl.invuln = 1e9;
	const sh = addEnemy(s, SHIELDER, 52, 40, { hp: 10 }); sh.skillCd = 0.1; sh.a.speed = 0; const friend = addEnemy(s, RAT, 53, 46, { dummy: true, hp: 50 }), far = addEnemy(s, RAT, 40 + 14, 40 + 14, { dummy: true });
	run(s, 12);
	A(near(sh.shield, sh.maxHp * 0.3) && near(friend.shield, friend.maxHp * 0.3) && far.shield === 0, `a shielder shields itself and those within 10 m for 30 % of their HP (${Math.round(friend.shield)} on a ${friend.maxHp} HP Rattata), not one 18 m away`, [sh.shield, friend.shield, far.shield]);
	const big = Math.round(friend.shield) + 40, hp0 = friend.hp; s.shots.push({ id: 0, x: friend.a.x - 1.5, y: 0.8, z: friend.a.z, vx: 12, vy: 0, vz: 0, dmg: big, r: 0.3, life: 1, t: 0, pierce: 0, homing: 0, hits: new Set(), px: null, py: 0, pz: 0 }); run(s, 12);
	A(friend.shield === 0 && hp0 - friend.hp === 40, `a hit of ${big} on it: the shield takes its ${big - 40} and 40 gets through`, [friend.shield, hp0 - friend.hp]);
	run(s, 60 * 7.2); A(sh.shield === 0 && sh.shieldLock > 0, 'an unused shield is gone after 7 s'); run(s, 60 * 2);
	A(sh.shield === 0 && friend.shield === 0, '...and the next cast (8 s after the first) cannot renew it: 14 s must pass', [sh.shield, sh.shieldLock]);
	run(s, 60 * 8); A(sh.shield > 0, 'after that it is shielded again', sh.shield);
	// a healer behind the wall still heals its neighbour; and it comes round rather than standing off
	const hw = newWorld(r, data, { dex: 25, moves: [], seed: 3 }); hw.pl.s.x = 11 * CELL; hw.pl.s.z = 15 * CELL; hw.pl.invuln = 1e9;
	const he = addEnemy(hw, HEALER, 6 * CELL, 15 * CELL); he.shotCd = 0.2; const hurt = addEnemy(hw, RAT, 5 * CELL, 15 * CELL, { dummy: true, hp: 10 }); hurt.hp = Math.round(hurt.maxHp * 0.5); const h0 = hurt.hp;
	run(hw, 30); A(hurt.hp > h0 && near(hurt.hp - h0, hurt.maxHp * 0.07, 1), `a healer with a wall between you and it still heals its neighbour (+${hurt.hp - h0} of ${hurt.maxHp} HP)`, [h0, hurt.hp]);
	// a summoner hard against the wall: its minions are never inside it
	const sw = newWorld(r, data, { dex: 25, moves: [], seed: 3 }); sw.pl.s.x = 11 * CELL; sw.pl.s.z = 15 * CELL; sw.pl.invuln = 1e9;
	const su = addEnemy(sw, SUMMONER, 9 * CELL + 0.5, 15 * CELL); su.shotCd = 0.1; su.a.speed = 0; let inWall = 0, made = 0; const known = new Set([su.id]);
	for (let i = 0; i < 60 * 20; i++) { tick(sw, null); for (const e of sw.enemies) if (!known.has(e.id)) { known.add(e.id); made++; if (groundAt(r, e.a.x, e.a.z) > 1) inWall++; if (!e.minion) inWall += 100; } }
	A(made === 8 && inWall === 0 && sw.enemies.filter((e) => e.minion).every((e) => e.xp < su.xp && e.dmg < su.dmg), `a summoner against the wall calls its ${made} minions onto the floor, never into the wall; they are weaker and worth less than it`, [made, inWall]);
}

// ---------------------------------------------------------------- experience and level-ups
{
	const flat = () => { const r = makeRoom(40, 40, 0); r.spawn = [40, 0, 40]; return r; };
	A(xpFor(1) === 62 && xpFor(2) === 101 && xpFor(10) === 631 && xpFor(30) > xpFor(29), `levels cost what they do in 2D: ${xpFor(1)} XP for the first, ${xpFor(2)}, … ${xpFor(10)} for the tenth`, [xpFor(1), xpFor(2), xpFor(10)]);
	// a kill leaves its XP where the enemy stood
	const k = newWorld(flat(), data, { dex: 25, moves: [], seed: 3 }); const e = addEnemy(k, RAT, 60, 40, { dummy: true }); k.shots.push({ id: 0, x: 58.5, y: 0.8, z: 40, vx: 12, vy: 0, vz: 0, dmg: 1e5, r: 0.3, life: 1, t: 0, pierce: 0, homing: 0, hits: new Set(), px: null, py: 0, pz: 0 });
	run(k, 12); const orb = k.pickups.find((p) => p.kind === 'xp' || p.kind === 'xpBig');
	A(k.stats.kills === 1 && orb && orb.value === e.xp && Math.hypot(orb.x - 60, orb.z - 40) < 1 && orb.y === 0, `a fallen Rattata leaves an orb worth its ${e.xp} XP where it stood`, k.pickups);
	run(k, 240); A(k.pickups.includes(orb) && Math.hypot(orb.vx, orb.vz) < 0.01 && k.pl.xp === 0, '20 m from you it rolls a little, stops, and waits');
	// within reach it flies to you; just outside, it does not
	const reach = (dist, dy = 0) => { const w = newWorld(flat(), data, { dex: 25, moves: [], seed: 3 }); const p = drop(w, 'xp', 40 + dist, dy, 40, 10); p.vx = p.vz = 0; let n = 0; while (n < 300 && w.pickups.length) { tick(w, null); n++; } return { got: w.pl.xp, secs: n / 60 }; };
	const in4 = reach(4), out6 = reach(6);
	A(in4.got === 10 && in4.secs < 1.2 && out6.got === 0, `an orb 4 m away flies to you (${in4.secs.toFixed(2)} s) and is yours; one 6 m away stays put (your reach is ${(CK.MAGNET * U).toFixed(1)} m)`, [in4, out6]);
	const r = yard(), high = newWorld(r, data, { dex: 25, moves: [], seed: 3 }); high.pl.s.x = 9 * CELL + 3.5; high.pl.s.z = 15 * CELL; high.pl.s.y = 0; const top = drop(high, 'xp', 8.5 * CELL, 4, 15 * CELL, 10); top.vx = top.vz = 0;
	const lowW = newWorld(r, data, { dex: 25, moves: [], seed: 3 }); lowW.pl.s.x = 9 * CELL + 3.5; lowW.pl.s.z = 20 * CELL; const side = drop(lowW, 'xp', 9 * CELL + 7.5, 0, 20 * CELL, 10); side.vx = side.vz = 0;
	run(high, 120); run(lowW, 120);
	A(high.pl.xp === 0 && high.pickups.length === 1 && lowW.pl.xp === 10, 'reach is measured in space: an orb on top of the 4 m wall, 4 m along the floor from you, is out of it; the same 4 m on the flat is not', [high.pl.xp, lowW.pl.xp]);
	// a magnet, a berry, a bomb
	const m = newWorld(flat(), data, { dex: 25, moves: [], seed: 3, autoPick: 0 }); for (let i = 0; i < 6; i++) { const p = drop(m, 'xp', 40 + 12 + i * 3, 0, 40 + (i % 2 ? 9 : -9), 5); p.vx = p.vz = 0; } const mg = drop(m, 'magnet', 41, 0, 40); mg.vx = mg.vz = 0;
	run(m, 300); A(m.stats.collected === 7 && m.stats.gained === 30, 'a magnet calls every orb on the level to you (six of them, 12-30 m away)', m.stats);
	const h = newWorld(flat(), data, { dex: 25, moves: [], seed: 3 }); h.pl.hp = 10; const b = drop(h, 'heal', 41, 0, 40); b.vx = b.vz = 0; run(h, 30);
	A(near(h.pl.hp, 10 + h.pl.maxHp * 0.3), `a berry gives back 30 % of your HP (10 to ${h.pl.hp.toFixed(1)} of ${h.pl.maxHp})`, h.pl.hp);
	const bw = newWorld(flat(), data, { dex: 25, moves: [], seed: 3 }); bw.pl.invuln = 1e9; const nearE = addEnemy(bw, RAT, 50, 40, { dummy: true, hp: 20 }), farE = addEnemy(bw, RAT, 40 + 34, 40, { dummy: true, hp: 20 }); const bomb = drop(bw, 'bomb', 41, 0, 40); bomb.vx = bomb.vz = 0; run(bw, 30);
	A(nearE.maxHp - nearE.hp === 60 + 14 && farE.hp === farE.maxHp && nearE.a.x > 50.5, 'a bomb hits every enemy within 30 m for 60 + 14 a level and throws it back; one 34 m away is untouched', [nearE.hp, farE.hp, nearE.a.x]);
	// a level-up: the fight waits
	const lv = newWorld(flat(), data, { dex: 25, moves: ['ember'], seed: 9 }); const g1 = drop(lv, 'xp', 41, 0, 40, xpFor(1) + 5); g1.vx = g1.vz = 0; addEnemy(lv, RAT, 60, 40);
	run(lv, 30); const t1 = lv.t, ex = lv.enemies[0].a.x; run(lv, 120);
	A(lv.pl.level === 2 && lv.pl.xp === 5 && lv.pl.pending === 1 && lv.pl.choices && lv.pl.choices.length === 3 && new Set(lv.pl.choices.map((c) => c.key)).size === 3, `enough XP: you are level 2, and three different cards are on offer (${lv.pl.choices && lv.pl.choices.map((c) => c.key).join(', ')})`, lv.pl.choices);
	A(lv.t === t1 && lv.enemies[0].a.x === ex, 'while they are on offer the fight stands still: the clock and the enemies wait');
	const chosen = lv.pl.choices[1].key; A(choose(lv, 1) && lv.pl.pending === 0 && lv.pl.choices === null, `taking one (${chosen}) puts it in force…`); run(lv, 60);
	A(lv.t > t1 + 0.9 && lv.enemies[0].a.x < ex, '…and the fight goes on');
	// what is offered
	const kinds = { new: 0, up: 0, stat: 0 }, ids = new Set(); const o1 = newWorld(flat(), data, { dex: 25, moves: ['ember'], seed: 5 });
	for (let i = 0; i < 200; i++) for (const c of offer(o1)) { kinds[c.type]++; ids.add(c.key); }
	A(kinds.new > 100 && kinds.up > 20 && kinds.stat > 100 && [...ids].filter((q) => q.startsWith('new:')).every((q) => data.poolFor(o1.pl.mon).includes(q.slice(4))), `with a free slot: new moves from your species' own pool (${[...ids].filter((q) => q.startsWith('new:')).length} different ones seen), your move's next level, and upgrades`, kinds);
	const o4 = newWorld(flat(), data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed: 5 }); let new4 = 0, up4 = 0; for (let i = 0; i < 100; i++) for (const c of offer(o4)) { if (c.type === 'new') new4++; if (c.type === 'up') up4++; }
	A(new4 === 0 && up4 > 80, 'with all four slots full no new move is offered: levels for the ones you have, and upgrades', [new4, up4]);
	const sameA = newWorld(flat(), data, { dex: 25, moves: ['ember'], seed: 77 }), sameB = newWorld(flat(), data, { dex: 25, moves: ['ember'], seed: 77 });
	A(JSON.stringify(offer(sameA).map((c) => c.key)) === JSON.stringify(offer(sameB).map((c) => c.key)), 'the same seed offers the same cards');
	// what each card does
	const base = () => newWorld(flat(), data, { dex: 25, moves: ['ember'], seed: 5 }); const stat = (id) => STATS.find((q) => q.id === id);
	const dealt = (w) => { addEnemy(w, 1, 46, 40, { dummy: true, hp: 1e4 }); run(w, 600); return w.stats; };
	const plain = dealt(base()), strong = base(); stat('atk').apply(strong.pl); const quick = base(); stat('cd').apply(quick.pl);
	const ds = dealt(strong), dq = dealt(quick);
	A(near(ds.dealt / plain.dealt, 1.1, 1e-9) && ds.hits === plain.hits, 'Power: every hit does 10 % more', [ds.dealt, plain.dealt]);
	A(dq.fired > plain.fired && near(dq.fired / plain.fired, 1 / 0.92, 0.06), `Reflexes: 8 % less cooldown (${dq.fired} shots in 10 s against ${plain.fired})`, [dq.fired, plain.fired]);
	const tough = base(), soft = base(); stat('def').apply(tough.pl); stat('hp').apply(tough.pl); for (const q of [tough, soft]) { run(q, 2); addEnemy(q, RAT, 40.5, 40); q.pl.moves.length = 0; run(q, 20); }
	A(tough.pl.maxHp === soft.pl.maxHp + 20 && near(tough.stats.taken / soft.stats.taken, 0.94, 1e-9), 'Armour: 6 % less from the same touch; Vigor: 20 more HP', [tough.stats.taken, soft.stats.taken]);
	const fastW = base(), slowW = base(); stat('spd').apply(fastW.pl); fastW.pl.moves.length = slowW.pl.moves.length = 0; run(fastW, 180, { mx: 1, mz: 0, jump: false, crouch: false }); run(slowW, 180, { mx: 1, mz: 0, jump: false, crouch: false });
	A(near((fastW.pl.s.vx) / (slowW.pl.s.vx), 1.07, 0.005), 'Sprint: you run 7 % faster', [fastW.pl.s.vx, slowW.pl.s.vx]);
	const mgW = base(); stat('mag').apply(mgW.pl); stat('xp').apply(mgW.pl); stat('rgn').apply(mgW.pl); mgW.pl.hp = 50; const far6 = drop(mgW, 'xp', 46, 0, 40, 10); far6.vx = far6.vz = 0; mgW.pl.moves.length = 0; run(mgW, 120);
	A(near(mgW.pl.xp, 11.2) && near(mgW.pl.hp, 50 + 0.9 * 2, 0.02), 'Magnet reaches the orb 6 m away, Learning makes its 10 XP 11.2, Synthesis has given back 0.9 HP a second', [mgW.pl.xp, mgW.pl.hp]);
	const upW = base(); const upCard = offer(upW, 50).find((c) => c.type === 'up'); upCard.apply(); const want = data.move('ember', 2);
	A(upW.pl.moves[0].lvl === 2 && upW.pl.moves[0].count === want.count && upW.pl.moves[0].dmg === want.dmg && upW.pl.moves[0].spread === want.spread, 'a move\'s card raises it a level: Ember Lv2 is the data\'s own Lv2 (a second shot)', upW.pl.moves[0]);
	const nw = base(); const newCard = offer(nw, 50).find((c) => c.type === 'new'); newCard.apply();
	A(nw.pl.moves.length === 2 && nw.pl.moves[1].id === newCard.id && nw.pl.moves[1].lvl === 1, `a new move's card puts it in your next slot (${newCard.id})`);
	const capW = base(); capW.pl.statsTaken.spd = 8; capW.pl.statsTaken.mag = 6; let over = 0; for (let i = 0; i < 100; i++) for (const c of offer(capW)) if (c.key === 'stat:spd' || c.key === 'stat:mag') over++;
	A(over === 0, 'an upgrade taken as often as it allows (Sprint 8 times, Magnet 6) is not offered again');
	// a whole run with the cards taken as they come
	const room = generate(7, 'meadow'), runW = newWorld(room, data, { dex: 25, moves: ['ember'], seed: 31, cast: [RAT, ZUBAT, 1, 4, 7], autoPick: (w, cards) => Math.max(0, cards.findIndex((c) => c.type !== 'stat')) });
	let ticks = 0; for (; ticks < 60 * 240 && !runW.pl.dead; ticks++) tick(runW, { mx: Math.sin(ticks / 140), mz: Math.cos(ticks / 190), jump: false, crouch: false });
	A(runW.pl.level >= 5 && runW.pl.moves.length === 4 && runW.pl.moves.some((mv) => mv.lvl > 1) && runW.stats.collected > 30, `four minutes on a level, taking cards as they come: level ${runW.pl.level}, ${runW.pl.moves.map((mv) => mv.id + ' Lv' + mv.lvl).join(', ')}; ${runW.stats.kills} KOs${runW.pl.dead ? ' (and down at ' + (ticks / 60).toFixed(0) + ' s)' : ''}`, [runW.pl.level, runW.stats]);
}

// ---------------------------------------------------------------- bosses
{
	const SNOR = 143, r = yard();
	const d0 = bossDef(data, SNOR, 0), d4 = bossDef(data, SNOR, 4), S = G.Enemies.BOSS_SLOTS;
	A(d0.hp === Math.round(S[0].hp * 1.35) && d0.dmg === Math.round(S[0].dmg * 1.2) && d0.xp === S[0].xp && d4.hp === Math.round(S[4].hp * 1.35) && d0.at === 180 && d4.at === 900, `the 3:00 boss has ${d0.hp} HP and hits for ${d0.dmg}; the 15:00 one ${d4.hp} and ${d4.dmg} (the 2D game's slots × 1.35 HP, × 1.2 damage)`, [d0, d4]);
	const w = newWorld(r, data, { dex: 25, moves: [], seed: 4 }); w.pl.s.x = 11 * CELL; w.pl.s.z = 15 * CELL; w.pl.invuln = 1e9;
	const b = addBoss(w, SNOR, 5 * CELL, 15 * CELL, { slot: 0, t: 300 });
	A(b.boss && b.maxHp === Math.round(d0.hp * 1.5) && near(b.dmg, d0.dmg * 1.5) && b.scale === 1.5 && near(b.cr, data.radius(SNOR, 1.5)) && b.fly && b.a.y < 0.1, 'put in five minutes into a run it is scaled by the clock (× 1.5 at 5:00), half as big again, and its feet are on the floor', [b.maxHp, b.dmg, b.scale]);
	b.ai.cd = 99; let crossed = false, minX = 99; for (let i = 0; i < 240; i++) { tick(w, null); if (Math.abs(b.a.x - 8.5 * CELL) < 0.6 && b.a.y > 4) crossed = true; }
	A(crossed && b.a.x > 9 * CELL, 'the 4 m wall between you does not stop it: it goes over the top', [b.a.x, b.a.y]);
	// its attacks are its own four, all of them used over a long fight; under half HP it is enraged
	const f = newWorld(makeRoom(60, 60, 0), data, { dex: 25, moves: [], seed: 9 }); f.room.spawn = [60, 0, 60]; f.pl.s.x = 60; f.pl.s.z = 60; f.pl.invuln = 1e9;
	const fb = addBoss(f, SNOR, 70, 60, { slot: 0 }); const used = {}; let enraged = 0; const sp0 = fb.a.speed;
	for (let i = 0; i < 60 * 120; i++) { tick(f, { mx: Math.sin(i / 200), mz: Math.cos(i / 260), jump: false, crouch: false }); for (const ev of f.events) { if (ev.k === 'bosscast') used[ev.attack] = (used[ev.attack] || 0) + 1; if (ev.k === 'enrage') enraged++; } if (i === 60 * 60) fb.hp = Math.round(fb.maxHp * 0.4); }
	const own = [...fb.ai.melee, ...fb.ai.ranged];
	A(Object.keys(used).length >= 3 && Object.keys(used).every((q) => own.includes(q)), `two minutes with Snorlax, keeping on the move: it uses its own attacks and no others — the stomp only when you are beside it (${Object.entries(used).map(([q, n]) => q + ' × ' + n).join(', ')})`, [used, own]);
	A(enraged === 1 && fb.ai.fury && near(fb.a.speed, sp0 * 1.15), 'brought under half its HP it is enraged, once: 15 % faster');
	// states: shorter, then immune
	const st = newWorld(makeRoom(40, 40, 0), data, { dex: 25, moves: [], seed: 9 }); st.pl.invuln = 1e9; const sb = addBoss(st, SNOR, 30, 30, { slot: 0 });
	const dur = applyState(st, sb, 'freeze'), again = applyState(st, sb, 'sleep');
	A(near(dur, 1.8 * 0.35) && again === 0 && near(sb.ccImm, dur + 4), `a boss is frozen for ${dur.toFixed(2)} s, not 1.8, and nothing else takes hold for 4 s after`, [dur, again, sb.ccImm]);
	run(st, 60 * 5); A(applyState(st, sb, 'para') > 0, '...then it can be caught again');
	// down: fourteen orbs, a berry, a magnet
	const kd = newWorld(makeRoom(40, 40, 0), data, { dex: 25, moves: [], seed: 9, autoPick: 0 }); kd.pl.invuln = 1e9; const kb = addBoss(kd, SNOR, 56, 40, { slot: 0 }); kb.ai.cd = 99; kb.a.speed = 0;
	kd.shots.push({ id: 0, x: 53, y: 1, z: 40, vx: 12, vy: 0, vz: 0, dmg: 1e6, r: 0.3, life: 1, t: 0, pierce: 0, homing: 0, hits: new Set(), px: null, py: 0, pz: 0 }); run(kd, 20);
	const orbs = kd.pickups.filter((p) => p.kind === 'xpBig');
	A(kb.dead && orbs.length === 14 && orbs.reduce((a, p) => a + p.value, 0) >= kb.xp && kd.pickups.some((p) => p.kind === 'heal') && kd.pickups.some((p) => p.kind === 'magnet'), `down, it bursts into 14 big orbs (its ${kb.xp} XP between them), a berry and a magnet`, kd.pickups.map((p) => p.kind));
	// on time, and fewer others while it lives
	const room = generate(7, 'meadow'), tw = newWorld(room, data, { dex: 25, moves: [], seed: 5, cast: [RAT], bosses: [SNOR, 130], autoPick: 0 }); tw.pl.invuln = 1e9; tw.t = 170;
	let at = 0; for (let i = 0; i < 60 * 20 && !at; i++) { tick(tw, null); if (tw.enemies.some((e) => e.boss)) at = tw.t; }
	const boss = tw.enemies.find((e) => e.boss), dist = boss ? Math.hypot(boss.a.x - tw.pl.s.x, boss.a.z - tw.pl.s.z) : 0;
	A(Math.abs(at - 180) < 0.05 && boss.dex === SNOR && dist >= CK.SPAWN_MIN - 0.5 && dist <= CK.SPAWN_MAX + 0.5 && tw.bossIdx === 1, `the first boss on the list arrives at 3:00 (${at.toFixed(2)} s), ${dist.toFixed(0)} m away`, [at, dist]);
	const count = (alive) => { const q = newWorld(room, data, { dex: 25, moves: [], seed: 5, cast: [RAT], autoPick: 0 }); q.pl.invuln = 1e9; q.t = 181; if (alive) { const bb = addBoss(q, SNOR, q.pl.s.x + 20, q.pl.s.z, { slot: 0 }); bb.ai.cd = 1e9; bb.a.speed = 0; } const n0 = q.stats.spawned; run(q, 60 * 40); return q.stats.spawned - n0; };
	const withBoss = count(true), without = count(false);
	A(withBoss < without * 0.4 && withBoss > 0, `while a boss lives the others arrive at a quarter of the rate (${withBoss} in 40 s against ${without})`, [withBoss, without]);
	// its stomp: standing beside it you are hit; in the air above the ring you are not
	const stomp = (jump) => { const q = newWorld(makeRoom(40, 40, 0), data, { dex: 25, moves: [], seed: 9 }); q.room.spawn = [40, 0, 40]; q.pl.s.x = 40; q.pl.s.z = 40; const bb = addBoss(q, SNOR, 45, 40, { slot: 0 }); bb.a.speed = 0; Object.assign(bb.ai, { melee: ['slam'], ranged: ['slam'], mode: 'close', modeT: 99, cd: 0.1 }); bb.dmg = 5; let boomAt = 0;
		for (let i = 0; i < 120; i++) { const tt = i / 60; tick(q, { mx: 0, mz: 0, jump: jump && tt > 0.62 && tt < 1.3, crouch: false }); if (q.events.some((ev) => ev.k === 'boom')) boomAt = q.t; } return { taken: q.stats.taken, boomAt, touched: q.stats.touched }; };
	const stood = stomp(false), hopped = stomp(true);
	A(stood.taken > 0 && stood.boomAt > 0.9 && hopped.taken === 0 && hopped.boomAt === stood.boomAt, `a boss's stomp goes off ${stood.boomAt.toFixed(2)} s after it starts: standing in the ring you are hit; time a jump and you are over it`, [stood, hopped]);
}

// ---------------------------------------------------------------- Expedition's kinds
{
	const ids = data.expMoves(), byKind = {}; for (const id of ids) (byKind[data.moveDef(id).kind] = byKind[data.moveDef(id).kind] || []).push(id);
	const flat = () => { const q = makeRoom(40, 40, 0); q.spawn = [40, 0, 40]; return q; };
	const each = Object.keys(byKind).filter((k) => !CK.EXP_LATER.includes(k)).map((k) => { const w = newWorld(flat(), data, { dex: 25, moves: [byKind[k][0]], seed: 4 }); w.pl.invuln = 1e9; addEnemy(w, RAT, 43.5, 40, { dummy: true, hp: 1e5 }); run(w, 600); return [k, w.stats.hits, w.weather ? w.weather.kind : '']; });
	A(ids.length === 18 && each.length === 8 && each.every(([k, h, wx]) => (k === 'weather' ? !!wx : h > 0)), `all eight of Expedition's kinds do their work here (${each.map((e) => e[0]).join(', ')})`, each);
	const r = yard(), behind = (id) => { const w = newWorld(r, data, { dex: 25, moves: [id], seed: 4 }); w.pl.s.x = 11 * CELL; w.pl.s.z = 15 * CELL; w.pl.invuln = 1e9; const e = addEnemy(w, RAT, 6 * CELL, 15 * CELL, { dummy: true, hp: 1e5 }); run(w, 480); return { hits: w.stats.hits, blocked: w.stats.blocked, lost: e.maxHp - e.hp }; };
	const lob = behind('mud-bomb'), smite = behind('sky-attack'), straight = behind('ember');
	A(lob.hits >= 3 && smite.hits >= 3 && straight.hits === 0 && straight.blocked > 5, `a target behind the 4 m wall: a lob comes down on it (${lob.hits} hits) and a smite falls on it (${smite.hits}); Ember only hits the wall`, [lob, smite, straight]);
	const ledge = (id) => { const w = newWorld(r, data, { dex: 25, moves: [id], seed: 4 }); w.pl.s.x = 16 * CELL - 1; w.pl.s.z = 15 * CELL; w.pl.invuln = 1e9; const up = addEnemy(w, RAT, 16 * CELL + 0.8, 15 * CELL, { dummy: true, hp: 1e5 }), level = addEnemy(w, RAT, 16 * CELL - 3, 15 * CELL, { dummy: true, hp: 1e5 }); run(w, 300); return [up.maxHp - up.hp, level.maxHp - level.hp]; };
	const wave = ledge('surf'), spin = ledge('rapid-spin');
	A(wave[0] === 0 && wave[1] > 0 && spin[0] === 0 && spin[1] > 0, 'a wave and a spin hit what is on your level, not the enemy on the ledge 1.5 m above', [wave, spin]);
	// a vortex west of the wall, an enemy east of it within its pull: it is dragged to the wall and no further
	const vw = newWorld(r, data, { dex: 25, moves: [], seed: 4 }); vw.pl.invuln = 1e9; const wh = data.move('whirlpool');
	vw.effects.push({ k: 'vortex', id: 1, m: wh, x: 8 * CELL - 1.5, y: 0, z: 15 * CELL, t: 0, dur: 6, tick: 0, dmg: 1, r: wh.radius * U });
	const east = addEnemy(vw, RAT, 9 * CELL + 2, 15 * CELL, { dummy: true, hp: 1e5 }), west = addEnemy(vw, RAT, 8 * CELL - 5, 15 * CELL, { dummy: true, hp: 1e5 }); run(vw, 300);
	A(east.a.x >= 9 * CELL + 0.3 && east.a.x < 9 * CELL + 1 && Math.abs(west.a.x - (8 * CELL - 1.5)) < 0.3, 'a vortex drags an enemy in the open to its middle; one on the far side of a wall is pulled up against the wall and held there', [east.a.x, west.a.x]);
	// a lob's own arc is what the page draws: it is in the air for its 0.55 s, then gone
	const lw = newWorld(flat(), data, { dex: 25, moves: ['mud-bomb'], seed: 4 }); lw.pl.invuln = 1e9; addEnemy(lw, RAT, 48, 40, { dummy: true, hp: 1e5 }); let flying = 0; for (let i = 0; i < 60; i++) { tick(lw, null); if (lw.effects.some((q) => q.k === 'lob')) flying++; }
	A(flying >= 30 && flying <= 36 && lw.stats.hits === 1, `a bomb is in the air ${(flying / 60).toFixed(2)} s before it lands`, [flying, lw.stats.hits]);
}

// ---------------------------------------------------------------- weather
{
	const flat = () => { const q = makeRoom(40, 40, 0); q.spawn = [40, 0, 40]; return q; };
	const dealt = (wx, move, foe = RAT) => { const w = newWorld(flat(), data, { dex: 25, moves: [move], seed: 4 }); w.pl.invuln = 1e9; if (wx) { setWeather(w, wx, 60); run(w, 200); w.stats.dealt = 0; w.stats.hits = 0; } addEnemy(w, foe, 46, 40, { dummy: true, hp: 1e6 }); run(w, 300); return w.stats.dealt / w.stats.hits; };
	const dry = dealt(null, 'water-gun'), wet = dealt('rain', 'water-gun'), sunny = dealt('sun', 'water-gun'), fireRain = dealt('rain', 'ember'), fireDry = dealt(null, 'ember');
	A(near(wet / dry, 1.5, 1e-9) && near(sunny / dry, 0.5, 1e-9) && fireRain < fireDry, `rain makes a Water hit half as strong again (${dry.toFixed(1)} to ${wet.toFixed(1)}), sun halves it, and rain weakens Fire`, [dry, wet, sunny, fireRain, fireDry]);
	const w = newWorld(flat(), data, { dex: 25, moves: [], seed: 4 }); setWeather(w, 'rain', 10); const lv = []; for (let i = 0; i < 600; i++) { tick(w, null); if (i % 60 === 59) lv.push(+wxLevel(w).toFixed(2)); }
	A(lv[0] > 0.3 && lv[0] < 0.4 && lv[4] === 1 && lv[8] < 0.4 && w.weather === null, `weather fades in over 3 s, holds, fades out and ends (its strength each second of a 10 s rain: ${lv.join(' ')})`, lv);
	// sand: wears down what is not Rock, Ground or Steel; never a boss; never you to nothing
	const s = newWorld(flat(), data, { dex: 25, moves: [], seed: 4 }); s.pl.invuln = 1e9; setWeather(s, 'sand', 40);
	const rat = addEnemy(s, RAT, 60, 40, { dummy: true, hp: 5 }), geo = addEnemy(s, 74, 60, 44, { dummy: true, hp: 5 }), boss = addBoss(s, 143, 62, 50, { slot: 0 }); boss.ai.cd = 1e9; boss.a.speed = 0; geo.behavior = 'chase';
	run(s, 60 * 10);
	A(rat.hp < rat.maxHp && near((rat.maxHp - rat.hp) / 4, rat.maxHp * 0.02 + 1, 0.51) && geo.hp === geo.maxHp && boss.hp === boss.maxHp, `a sandstorm takes 2 % + 1 of a Rattata's HP every 2 s once it is up (${rat.maxHp - rat.hp} in 10 s), nothing from a Geodude (Rock / Ground) or a boss`, [rat.hp, rat.maxHp, geo.hp, boss.hp]);
	A(s.stats.taken > 0 && near(s.stats.taken / 4, s.pl.maxHp * 0.012, 1e-6), `...and ${(s.pl.maxHp * 0.012).toFixed(2)} of your own HP each time (you are Electric)`, s.stats.taken);
	s.pl.hp = 1.5; run(s, 60 * 6); A(s.pl.hp === 1.5 && !s.pl.dead, 'it never finishes you: at 1.5 HP the sand leaves you be');
	rat.hp = 4; run(s, 60 * 6); A(rat.dead && s.stats.kills >= 1 && s.pickups.length >= 1, 'it can finish an enemy, which leaves its XP like any other', [rat.dead, s.stats.kills]);
	// snow slows whoever is not Ice
	const sn = newWorld(flat(), data, { dex: 25, moves: [], seed: 4 }), cl = newWorld(flat(), data, { dex: 25, moves: [], seed: 4 }); setWeather(sn, 'snow', 60);
	for (const q of [sn, cl]) { q.pl.invuln = 1e9; run(q, 200); q.e = addEnemy(q, RAT, 60, 40); q.x0 = q.e.a.x; run(q, 120, { mx: 0, mz: 1, jump: false, crouch: false }); }
	A(near((sn.x0 - sn.e.a.x) / (cl.x0 - cl.e.a.x), 0.9, 0.02) && near(sn.pl.s.vz / cl.pl.s.vz, 0.9, 0.005), 'snow slows enemies and you by a tenth', [sn.x0 - sn.e.a.x, cl.x0 - cl.e.a.x, sn.pl.s.vz, cl.pl.s.vz]);
	// by itself: not before 2:00; after it, sooner or later
	const kinds = new Set(); let early = 0, started = 0;
	for (let seed = 1; seed <= 12; seed++) { const q = newWorld(generate(seed, seed % 2 ? 'meadow' : 'peaks'), data, { dex: 25, moves: [], seed }); q.pl.invuln = 1e9; for (let i = 0; i < 60 * 600; i++) { tick(q, null); const ev = q.events.find((e) => e.k === 'weather' && e.kind); if (ev) { started++; kinds.add(ev.kind); if (q.t < 180) early += q.t < 120 ? 100 : 0; } } }
	A(early === 0 && started >= 6 && kinds.size >= 3, `left alone, weather starts by itself from 2:00 on (${started} times in twelve 10-minute runs: ${[...kinds].join(', ')}), never before`, [early, started, [...kinds]]);
	const none = newWorld(generate(3, 'meadow'), data, { dex: 25, moves: [], seed: 3, weather: false }); none.pl.invuln = 1e9; let any = 0; for (let i = 0; i < 60 * 900; i++) { tick(none, null); if (none.weather) any++; }
	A(any === 0, 'a fight told to have no weather has none');
	const rd = newWorld(flat(), data, { dex: 25, moves: ['rain-dance'], seed: 4 }); run(rd, 30);
	A(rd.weather && rd.weather.kind === 'rain' && rd.weather.dur === 14, 'Rain Dance starts 14 s of rain');
}

// ---------------------------------------------------------------- abilities
{
	const flat = () => { const q = makeRoom(40, 40, 0); q.spawn = [40, 0, 40]; return q; };
	const FX = G.Abilities.FX, mk = (ability, o = {}) => { const w = newWorld(flat(), data, { dex: o.dex || 25, moves: o.moves || ['ember'], seed: 4, ability }); if (!o.hurt) w.pl.invuln = 1e9; return w; };
	A(data.abilityOf(25) === 'static' && data.abilityOf(4) === 'blaze' && data.abilityOf(143) && mk('auto').pl.ability === 'static' && mk().pl.ability === null, 'each species has its own ability (Pikachu: Static, Charmander: Blaze); a fight uses it when told to');
	const dps = (ability, o = {}) => { const w = mk(ability, o); if (o.hp) w.pl.hp = w.pl.maxHp * o.hp; const e = o.boss ? addBoss(w, 143, 46, 40, { slot: 0 }) : addEnemy(w, o.foe || RAT, o.x || 46, 40, { dummy: true, hp: 1e6 }); if (o.boss) { e.ai.cd = 1e9; e.a.speed = 0; e.hp = e.maxHp = 1e7; } run(w, 600); return w.stats.dealt / w.stats.hits; };
	const base = dps(null), r = (v) => v / base;
	A(near(r(dps('hugepower')), 1.25, 1e-9) && near(r(dps('technician')), 1.1, 1e-9), 'Huge Power: + 25 % damage; Technician: + 10 %');
	A(near(r(dps('megalauncher')), 1.2, 1e-9) && near(r(dps('ironfist')), 1, 1e-9) && near(dps('ironfist', { moves: ['tackle'], x: 42 }) / dps(null, { moves: ['tackle'], x: 42 }), 1.2, 1e-9), 'Mega Launcher: + 20 % with shots, nothing with a swing; Iron Fist the other way round');
	A(near(r(dps('drought')), 1.15, 1e-9) && near(r(dps('drizzle')), 1, 1e-9), 'Drought: + 15 % with Fire moves, Drizzle nothing for them');
	A(near(dps('adaptability', { dex: 4 }) / dps(null, { dex: 4 }), 1.2, 1e-9) && near(r(dps('adaptability')), 1, 1e-9), 'Adaptability: + 20 % with moves of your own type (a Charmander\'s Ember, not a Pikachu\'s)');
	A(near(dps('blaze', { dex: 4, hp: 0.3 }) / dps(null, { dex: 4, hp: 0.3 }), 1.35, 1e-9) && near(dps('blaze', { dex: 4 }) / dps(null, { dex: 4 }), 1, 1e-9), 'Blaze: + 35 % with Fire moves under 40 % HP, nothing above');
	A(near(dps('tintedlens', { foe: 7 }) / dps(null, { foe: 7 }), 1.4, 1e-9) && near(r(dps('tintedlens')), 1, 1e-9), 'Tinted Lens: + 40 % on a resisted hit (Ember on a Squirtle), nothing otherwise');
	A(near(dps('moldbreaker', { boss: true }) / dps(null, { boss: true }), 1.06 * 1.1, 1e-9) && near(r(dps('moldbreaker')), 1.06, 1e-9), 'Mold Breaker: + 6 %, and a further 10 % on a boss');
	// what you take
	const hit = (ability, foe = RAT, o = {}) => { const w = mk(ability, { hurt: true, moves: [], dex: o.dex }); if (o.hp) w.pl.hp = o.hp; run(w, 2); const e = addEnemy(w, foe, 40.5, 40); if (o.dmg) e.dmg = o.dmg; run(w, 20); return w; };
	const plain = hit(null).stats.taken;
	A(near(hit('intimidate').stats.taken / plain, 0.9, 1e-9) && near(hit('wonderguard').stats.taken / plain, 0.65, 1e-9), 'Intimidate: 10 % less from a touch; Wonder Guard: 35 % less');
	A(near(hit('thickfat', 4).stats.taken / hit(null, 4).stats.taken, 0.5, 1e-9) && near(hit('thickfat').stats.taken / plain, 1, 1e-9), 'Thick Fat: half from a Fire enemy\'s touch, nothing off a Normal one');
	A(near(hit('solidrock', 7, { dex: 4 }).stats.taken / hit(null, 7, { dex: 4 }).stats.taken, 0.75, 1e-9), 'Solid Rock: a quarter off a super-effective hit (a Squirtle touching a Charmander)');
	const ms = mk('multiscale', { hurt: true, moves: [] }); run(ms, 2); addEnemy(ms, RAT, 40.5, 40); run(ms, 20); const first = ms.stats.taken; run(ms, 30); const second = ms.stats.taken - first;
	A(near(first / plain, 0.5, 1e-9) && near(second / plain, 1, 1e-9), 'Multiscale: the first hit is halved, the next one is whole', [first, second, plain]);
	const st = hit('sturdy', RAT, { hp: 3 }), no = hit(null, RAT, { hp: 3 });
	A(st.pl.hp === 1 && !st.pl.dead && no.pl.dead, 'Sturdy: the hit that would finish you leaves you on 1 HP');
	run(st, 120); A(st.pl.dead, '...once: the next one does (it comes back after 90 s)');
	// what touching you costs
	const th = hit('roughskin'), te = th.enemies[0];
	A(te.maxHp - te.hp === 12 + 3 && th.stats.touched === 1, `Rough Skin: whoever touches you takes 12 + 3 a level (${te.maxHp - te.hp})`, te.hp);
	const procs = (ability, read) => { let n = 0, touches = 0; for (let seed = 1; seed <= 60; seed++) { const w = newWorld(flat(), data, { dex: 25, moves: [], seed, ability }); run(w, 2); const e = addEnemy(w, RAT, 40.5, 40); run(w, 3); touches += w.stats.touched; if (read(e)) n++; } return [n, touches]; };
	const para = procs('static', (e) => e.paraT > 0), burn = procs('flamebody', (e) => e.burn > 0), pois = procs('poisonpoint', (e) => e.poison > 0), slp = procs('effectspore', (e) => e.sleepT > 0), none = procs(null, (e) => e.paraT > 0 || e.burn > 0);
	A(para[1] === 60 && para[0] >= 8 && para[0] <= 24 && burn[0] >= 8 && burn[0] <= 24 && pois[0] >= 8 && pois[0] <= 24 && slp[0] >= 5 && slp[0] <= 20 && none[0] === 0, `Static, Flame Body, Poison Point (25 %) and Effect Spore (20 %): of 60 first touches, ${para[0]} paralysed, ${burn[0]} burned, ${pois[0]} poisoned, ${slp[0]} put to sleep; none without`, [para, burn, pois, slp]);
	// speed, cooldown, reach, XP, crit, regeneration
	const speed = (ability, wx) => { const w = mk(ability, { moves: [] }); if (wx) setWeather(w, wx, 60); run(w, 240, { mx: 1, mz: 0, jump: false, crouch: false }); return Math.hypot(w.pl.s.vx, w.pl.s.vz); };
	const v0 = speed(null);
	A(near(speed('speedboost') / v0, 1.12, 0.005) && near(speed('swiftswim', 'rain') / speed(null, 'rain'), 1.3, 0.005) && near(speed('swiftswim') / v0, 1, 0.005), 'Speed Boost: 12 % faster; Swift Swim: 30 % faster in the rain, not out of it');
	const pr = mk('prankster'), me = mk('magnetpull'), eb = mk('earlybird'), ce = mk('compoundeyes'), rg = mk('regenerator', { moves: [] });
	rg.pl.hp = 10; run(rg, 600);
	A(near(pr.pl.cdMul, 0.9) && near(me.pl.magnet, CK.MAGNET * U * 1.4) && near(eb.pl.xpMul, 1.12) && near(ce.pl.crit, 0.1) && near(rg.pl.hp, 10 + rg.pl.maxHp * 0.01 * 10, 0.05), 'Prankster: 10 % off cooldowns; Magnet Pull: 40 % more reach; Early Bird: 12 % more XP; Compound Eyes: 10 % crit; Regenerator: 1 % of your HP a second');
	const cr = mk('compoundeyes'); addEnemy(cr, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(cr, 60 * 120);
	A(cr.stats.crits / cr.stats.hits > 0.05 && cr.stats.crits / cr.stats.hits < 0.16, `...and that crit really rolls (${cr.stats.crits} of ${cr.stats.hits} hits)`, [cr.stats.crits, cr.stats.hits]);
	// Moxie and Defiant
	const mx = mk('moxie'); mx.stats.kills = 85; const mxd = (() => { addEnemy(mx, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(mx, 300); return mx.stats.dealt / mx.stats.hits; })();
	const big = mk('moxie'); big.stats.kills = 4000; addEnemy(big, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(big, 300);
	A(near(mxd / base, 1.04, 1e-9) && near(big.stats.dealt / big.stats.hits / base, 1.2, 1e-9), 'Moxie: + 2 % for every 40 KOs (85 KOs: + 4 %), up to + 20 %');
	const df = mk('defiant', { hurt: true }); const target = addEnemy(df, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(df, 120); const calm = df.stats.dealt / df.stats.hits; const toucher = addEnemy(df, RAT, 40.5, 40.3, { hp: 1e6 }); toucher.dmg = 0.5; const d0 = df.stats.dealt, h0 = df.stats.hits; run(df, 150); const d1 = df.stats.dealt - d0, h1 = df.stats.hits - h0;
	A(df.stats.touched >= 1 && d1 / h1 > calm * 1.02, `Defiant: for 4 s after you are hit your moves do more (an average hit ${calm.toFixed(1)} before, ${(d1 / h1).toFixed(1)} while it is touching you)`, [calm, d1 / h1]);
	// weather immunity
	const sv = mk('sandveil', { moves: [] }), ex = mk(null, { moves: [] }); for (const q of [sv, ex]) { q.pl.invuln = 1e9; setWeather(q, 'sand', 30); run(q, 600); }
	A(sv.stats.taken === 0 && ex.stats.taken > 0, 'Sand Veil: the sandstorm does not wear you down');
	// every effect in the 2D table is one the 3D rules read, or one that has nothing to act on here yet
	const READ = ['pinch', 'pinch_k', 'dmg', 'moxie', 'moxie_cap', 'defiant', 'owntype', 'typedmg', 'kind_dmg', 'kind_k', 'boss_dmg', 'tinted', 'crit', 'spd', 'wspd', 'wspd_k', 'cd', 'magnet', 'xp', 'regen', 'taken', 'resist', 'resist_k', 'se_taken', 'first_hit', 'sturdy', 'contact', 'contact_p', 'thorns', 'wximm'], NOT_YET = ['coin', 'trapimm', 'stimm'];
	const keys = new Set(); for (const id in FX) for (const k in FX[id].fx) keys.add(k);
	const unknown = [...keys].filter((k) => !READ.includes(k) && !NOT_YET.includes(k));
	A(unknown.length === 0 && Object.keys(FX).length >= 50, `all ${Object.keys(FX).length} abilities' effects are covered: ${READ.length} kinds are in the 3D rules; coins and trap / state immunities have nothing to act on here yet`, unknown);
}

// ---------------------------------------------------------------- held items
{
	const flat = () => { const q = makeRoom(40, 40, 0); q.spawn = [40, 0, 40]; return q; };
	const mk = (items, o = {}) => { const w = newWorld(flat(), data, { dex: o.dex || 25, moves: o.moves || ['ember'], seed: 4, items }); if (!o.hurt) w.pl.invuln = 1e9; return w; };
	const dps = (items, o = {}) => { const w = mk(items, o); addEnemy(w, o.foe || RAT, o.x || 46, 40, { dummy: true, hp: 1e6 }); run(w, 600); return w.stats; };
	const base = dps([]), per = (s) => s.dealt / s.hits, r = (s) => per(s) / per(base);
	A(data.itemList().length === 26 && mk(['lifeorb', 'quickclaw']).pl.items.length === 2 && mk(['lightball'], { dex: 4 }).pl.items.length === 0 && mk(['lightball']).pl.items.length === 1, 'the 2D game\'s 26 held items are known; a Light Ball is Pikachu\'s, not Charmander\'s');
	const orb = dps(['lifeorb']), claw = dps(['quickclaw']);
	A(near(r(orb), 1.3, 1e-9) && near(claw.fired / base.fired, 1.25, 0.06), `Life Orb: + 30 % damage; Quick Claw: 20 % off cooldowns (${claw.fired} shots against ${base.fired})`, [r(orb), claw.fired, base.fired]);
	const lo = mk(['lifeorb'], { moves: ['ember'] }); addEnemy(lo, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(lo, 600);
	const lo2 = mk(['lifeorb'], { moves: ['ember'] }); lo2.pl.hp = 3; addEnemy(lo2, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(lo2, 600);
	A(near(lo.pl.maxHp - lo.pl.hp, lo.stats.fired * Math.max(1, lo.pl.maxHp * 0.01), 0.01) && lo2.pl.hp === 1 && !lo2.pl.dead, `...and each attack costs 1 % of your HP (${(lo.pl.maxHp - lo.pl.hp).toFixed(1)} over ${lo.stats.fired} shots), never your last`, [lo.pl.hp, lo2.pl.hp]);
	const cb = mk(['choiceband'], { moves: ['ember', 'water-gun'] }), nb = mk([], { moves: ['ember', 'water-gun'] });
	for (const q of [cb, nb]) { q.byMove = {}; addEnemy(q, RAT, 46, 40, { dummy: true, hp: 1e6 }); for (let i = 0; i < 600; i++) { tick(q, null); for (const ev of q.events) if (ev.k === 'hit') q.byMove[ev.type] = Math.max(q.byMove[ev.type] || 0, ev.d); } }
	A(near(cb.byMove.fire / nb.byMove.fire, 1.4, 1e-9) && near(cb.byMove.water / nb.byMove.water, 0.8, 1e-9), 'Choice Band: your first move + 40 %, the others - 20 %', [cb.byMove, nb.byMove]);
	A(near(per(dps(['expertbelt'], { foe: 1 })) / per(dps([], { foe: 1 })), 1.25, 1e-9) && near(r(dps(['expertbelt'])), 1, 1e-9), 'Expert Belt: + 25 % on a super-effective hit (Ember on a Bulbasaur), nothing otherwise');
	A(near(per(dps(['typegem'], { dex: 4 })) / per(dps([], { dex: 4 })), 1.2, 1e-9) && near(per(dps(['lightball'], { moves: ['thunder-shock'] })) / per(dps([], { moves: ['thunder-shock'] })), 2, 0.2) && near(per(dps(['silverpowder'], { moves: ['bug-buzz'], x: 42 })) / per(dps([], { moves: ['bug-buzz'], x: 42 })), 1.2, 1e-9), 'a type gem: + 20 % with your own type; Light Ball: a Pikachu\'s Electric moves × 2; Silver Powder: + 20 % with Bug moves');
	// size: the Wide Lens, the Big Orb, Calibre
	const bz = G.Moves.BY_ID['bug-buzz'].radius, edge = (items, calibre, dist) => { const w = mk(items, { moves: ['bug-buzz'] }); if (calibre) w.pl.statsTaken.size = calibre; const e = addEnemy(w, RAT, 40 + dist * U, 40, { dummy: true, hp: 1e6 }); run(w, 120); return w.stats.hits > 0; }, rr = G.Sprites.bodyRadius(RAT);
	A(!edge([], 0, bz + rr + 6) && edge(['widelens'], 0, bz + rr + 6) && !edge(['widelens'], 0, bz * 1.2 + rr + 4) && edge(['bigorb'], 0, bz * 1.3 + rr - 4) && edge([], 2, bz * 1.12 * 1.12 + rr - 3) && !edge([], 2, bz * 1.12 * 1.12 + rr + 3), `an aura of ${bz} units reaches 20 % further with a Wide Lens, 30 % with a Big Orb, 12 % for each step of Calibre`);
	const big = mk(['bigorb']), small = mk([]); for (const q of [big, small]) { addEnemy(q, RAT, 50, 40, { dummy: true, hp: 1e6 }); for (let i = 0; i < 20 && !q.shots.length; i++) tick(q, null); }
	A(near(big.shots[0].r / small.shots[0].r, 1.3, 1e-9), 'a Big Orb makes a shot 30 % bigger too');
	A(STATS.some((q) => q.id === 'size' && q.max === 6), 'Calibre is one of the upgrades a level can offer (six times at most)');
	// what you take
	const hit = (items, foe = RAT, o = {}) => { const w = mk(items, { hurt: true, moves: [], dex: o.dex }); if (o.hp) w.pl.hp = o.hp; run(w, 2); const e = addEnemy(w, foe, 40.5, 40); if (o.dmg) e.dmg = o.dmg; run(w, o.ticks || 20); return w; };
	const plain = hit([]);
	A(near(hit(['assaultvest']).stats.taken / plain.stats.taken, 0.8, 1e-9), 'Assault Vest: 20 % less from a touch');
	const helm = hit(['rockyhelmet']), ice = hit(['eternalice']);
	A(helm.enemies[0].maxHp - helm.enemies[0].hp === 15 + 4 && ice.enemies[0].slow === 0.3 && near(ice.enemies[0].slowT, 2, 0.4), 'Rocky Helmet: whoever touches you takes 15 + 4 a level; Eternal Ice: it is 30 % slower for 2 s');
	const sash = hit(['focussash'], RAT, { hp: 3 }); A(sash.pl.hp === 1 && !sash.pl.dead, 'Focus Sash: the hit that would finish you leaves 1 HP'); run(sash, 120); A(sash.pl.dead, '...once a minute: the next one does');
	const sit = hit(['sitrusberry'], RAT, { hp: 50 }), nos = hit([], RAT, { hp: 50 });
	A(near(sit.pl.hp - nos.pl.hp, sit.pl.maxHp * 0.3, 1e-6), `Sitrus Berry: under half HP, 30 % of it back (${nos.pl.hp.toFixed(1)} without, ${sit.pl.hp.toFixed(1)} with)`, [sit.pl.hp, nos.pl.hp]);
	run(sit, 60 * 5); const again = sit.pl.hp; A(sit.events.every((e) => e.k !== 'item') && sit.pl.sitrusT > 0, '...and not again for 90 s');
	const wp = mk(['weaknesspolicy'], { dex: 4, hurt: true, moves: ['bug-buzz'] }); const wt = addEnemy(wp, RAT, 42, 40, { dummy: true, hp: 1e6 }); const onRat = (n) => { let best = 0; for (let i = 0; i < n; i++) { tick(wp, null); for (const ev of wp.events) if (ev.k === 'hit' && ev.id === wt.id) best = Math.max(best, ev.d); } return best; };
	const calm = onRat(120); const sq = addEnemy(wp, 7, 40.5, 40.3, { hp: 1e6 }); sq.dmg = 0.5; const hot = onRat(200);
	A(wp.pl.wpT > 0 && near(hot / calm, 1.5, 1e-9), 'Weakness Policy: hit by something super-effective (a Squirtle on a Charmander), your moves do + 50 % for 8 s', [calm, hot]);
	// what heals you, what you gain
	const lf = mk(['leftovers'], { moves: [] }); lf.pl.hp = 10; run(lf, 600);
	const sb = mk(['shellbell']); sb.pl.hp = 10; addEnemy(sb, RAT, 46, 40, { dummy: true, hp: 1e6 }); run(sb, 600);
	A(near(lf.pl.hp, 10 + lf.pl.maxHp * 0.015 * 10, 0.05) && sb.pl.hp > 12 && sb.pl.hp <= 10 + 4 * 10 + 0.01, `Leftovers: 1.5 % of your HP a second; Shell Bell: 4 % of the damage you do, 4 HP a second at most (10 to ${sb.pl.hp.toFixed(1)} in 10 s)`, [lf.pl.hp, sb.pl.hp]);
	A(near(mk(['luckyegg']).pl.xpMul, 1.3) && near(mk(['scopelens']).pl.crit, 0.15) && near(mk(['choicescarf']).pl.spdMul, 1.35), 'Lucky Egg: 30 % more XP; Scope Lens: 15 % crit; Choice Scarf: 35 % faster');
	const gg = mk(['safetygoggles'], { moves: [] }); setWeather(gg, 'sand', 30); run(gg, 600); A(gg.stats.taken === 0, 'Safety Goggles: the sandstorm does not wear you down');
	const count = (items) => { const q = newWorld(generate(7, 'meadow'), data, { dex: 25, moves: [], seed: 5, cast: [RAT], items, weather: false }); q.pl.invuln = 1e9; run(q, 60 * 120); return [q.stats.spawned, q.enemies[0].maxHp, q.enemies[0].xp]; };
	const inc = count(['pureincense']), noinc = count([]);
	A(inc[0] < noinc[0] * 0.85 && inc[0] > noinc[0] * 0.65, `Pure Incense: a quarter fewer enemies arrive (${inc[0]} against ${noinc[0]} in two minutes), each tougher and worth more`, [inc, noinc]);
	const acted = ['leftovers', 'choiceband', 'quickclaw', 'focussash', 'shellbell', 'luckyegg', 'lifeorb', 'choicescarf', 'rockyhelmet', 'eternalice', 'assaultvest', 'scopelens', 'expertbelt', 'widelens', 'bigorb', 'typegem', 'sitrusberry', 'safetygoggles', 'weaknesspolicy', 'pureincense', 'lightball', 'thickclub', 'silverpowder'];
	const left = data.itemList().filter((id) => !acted.includes(id) && !CK.IT.NOT_HERE.includes(id));
	A(left.length === 0 && data.itemList().length === acted.length + CK.IT.NOT_HERE.length, `every item is accounted for: ${acted.length} act in the 3D rules; coins, traps and Rare Candy (${CK.IT.NOT_HERE.join(', ')}) have nothing to act on here yet`, [left, data.itemList().filter((id) => !acted.includes(id))]);
}

// ---------------------------------------------------------------- arrivals
{
	const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, seed: 11, cast: [RAT, ZUBAT, 10, 41] });
	w.pl.invuln = 1e9;
	const bad = []; let seen = 0, walkers = 0;
	const known = new Set();
	for (let i = 0; i < 60 * 90; i++) {
		tick(w, null);
		for (const e of w.enemies) { if (known.has(e.id)) continue; known.add(e.id); if (e.minion) continue; seen++;   // (a summoner's minions are not arrivals)
			const d = Math.hypot(e.a.x - w.pl.s.x, e.a.z - w.pl.s.z), ci = Math.floor(e.a.z / CELL) * room.w + Math.floor(e.a.x / CELL);
			if (d < CK.SPAWN_MIN - 0.5 || d > CK.SPAWN_MAX + 0.5) bad.push(['distance', d]);
			if (room.cells[ci] >= room.rimH) bad.push(['in the rim']);
			if (!e.fly) { walkers++; if (w.field.dist[ci] < 0) bad.push(['cannot walk to you']); if (room.water.has(ci)) bad.push(['in water']); } }
	}
	const want = (() => { let a = 0; for (let t = 0; t < 90; t += 1 / 60) a += (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * 0.24 / 60; return a; })();
	A(bad.length === 0 && seen > 30 && walkers > 10 && seen > walkers, `90 s on a generated level: ${seen} enemies arrive, each 16-32 m from you, on floor it can walk to you from (flyers anywhere inside the rim)`, bad.slice(0, 4));
	A(Math.abs(seen - want) <= 3, `at the 2D game's rate (${seen} arrived; the formula gives ${want.toFixed(1)})`, [seen, want]);
	const capped = newWorld(room, data, { dex: 25, seed: 11, cast: [RAT], cap: 12 }); capped.pl.invuln = 1e9; let peak = 0;
	for (let i = 0; i < 60 * 120; i++) { tick(capped, null); peak = Math.max(peak, capped.enemies.length); }
	A(peak === 12, 'never more than the cap at once (a cap of 12 here)', peak);
	const none = newWorld(room, data, { dex: 25, seed: 11 }); run(none, 600);
	A(none.enemies.length === 0, 'with no cast nothing arrives');
}

// ---------------------------------------------------------------- a whole fight: deterministic, safe, cheap
{
	const fight = (seed, levelSeed = 7, biome = 'meadow', secs = 60) => {
		const room = generate(levelSeed, biome), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed, cast: [RAT, ZUBAT, 10, 41, 74], autoPick: 0 });
		const r = rng(seed * 31 + 5); let inp = { mx: 0, mz: 0, jump: false, crouch: false }, bad = '';
		for (let i = 0; i < secs * 60; i++) {
			if (i % 20 === 0) inp = { mx: r() * 2 - 1, mz: r() * 2 - 1, jump: r() < 0.3, crouch: r() < 0.15 };
			tick(w, inp);
			if (i % 30 === 0) for (const e of w.enemies) { const g = groundAt(room, e.a.x, e.a.z), wl = waterAt(room, e.a.x, e.a.z);
				if (!Number.isFinite(e.a.x + e.a.y + e.a.z + e.hp)) bad = 'not a number'; else if (e.a.x < 0 || e.a.z < 0 || e.a.x > room.w * CELL || e.a.z > room.h * CELL) bad = 'outside';
				else if (e.a.y < Math.min(g, wl > g ? wl - K.SWIM_DEPTH : g) - 1e-6) bad = 'under the floor'; else if (g >= room.rimH) bad = 'in the rim'; }
			if (!Number.isFinite(w.pl.hp + w.stats.dealt)) bad = 'stats not a number';
		}
		return { w, bad };
	};
	const a = fight(3), b = fight(3), c = fight(4);
	A(hashWorld(a.w) === hashWorld(b.w) && JSON.stringify(a.w.stats) === JSON.stringify(b.w.stats), `the same seed is the same fight to the last digit (60 s, ${a.w.stats.spawned} enemies, ${a.w.stats.hits} hits, ${a.w.stats.kills} kills)`, [hashWorld(a.w), hashWorld(b.w)]);
	A(hashWorld(a.w) !== hashWorld(c.w), 'another seed is another fight');
	A(a.w.stats.kills > 5 && a.w.stats.hits > 40 && a.w.stats.fell > 0, 'it is a real fight: kills, hits, and enemies dropping off ledges after you', a.w.stats);
	const meek = newWorld(generate(7, 'meadow'), data, { dex: 25, moves: [], seed: 3, cast: [RAT, ZUBAT] }); run(meek, 60 * 60);
	A(meek.stats.touched >= 3 && meek.pl.hp < meek.pl.maxHp, `stand still with no moves and they reach you and hurt you (${meek.stats.touched} touches in a minute${meek.pl.dead ? ', and you are down' : ''})`, meek.stats);
	const safe = [[5, 2, 'peaks'], [6, 9, 'marsh'], [7, 23, 'meadow']].map(([s, l, bi]) => { const f = fight(s, l, bi, 60); return f.bad ? `${bi} ${l}: ${f.bad}` : ''; }).filter(Boolean);
	A(!a.bad && safe.length === 0, 'three more minutes of random play on a peaks, a marsh and a meadow level: every enemy stays in the world, on or above the floor, out of the rim', [a.bad, ...safe]);
	// the cost of a tick with the cap's worth of enemies
	const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed: 2 }); w.pl.invuln = 1e9;
	const r = rng(99); let placed = 0;
	while (placed < CK.CAP) { const t = room.tiles[Math.floor(r() * room.tiles.length)]; const e = addEnemy(w, placed % 3 ? RAT : ZUBAT, t.centre[0] + r() * 6 - 3, t.centre[2] + r() * 6 - 3, { hp: 50 }); placed++; }
	run(w, 30);
	const t0 = performance.now(); run(w, 600, (i) => ({ mx: Math.sin(i / 50), mz: Math.cos(i / 70), jump: false, crouch: false })); const ms = (performance.now() - t0) / 600;
	A(ms < 2, `a tick with ${CK.CAP} enemies costs ${ms.toFixed(2)} ms here (a frame is 16.7 ms)`, ms);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
