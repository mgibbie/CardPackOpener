// micasurvivor_m3d_dive_things_test.mjs — MicaSurvivor 3D, Dive part 5 (Plans/MICASURVIVOR_3D_PLAN.md §5.57): what a
// floor holds besides foes (micasurvivor/m3d/dive.js), in node, with the 2D game's own numbers.
//   * chests: a free Poké Ball; stand by it OPEN_T s and it gives one item, once
//   * secret pockets: a boulder breaks for a Rock / Ground / Fighting / Steel Pokémon, a thicket burns for a Fire type,
//     after PLUG.T s against it; another type gets a tip and nothing else; the rock becomes ground and the chest behind
//     it can be walked to
//   * landmarks: the eight, each once a floor after LM.T s on it
//   * the same inputs give the same run
//   node overworld/tests/micasurvivor_m3d_dive_things_test.mjs
import { rulesFrom, newDive, stepDive, hudLine, result, LANDMARKS, CHEST, canOpen, openPlug } from '../../micasurvivor/m3d/dive.js';
import { checkFloor } from '../../micasurvivor/m3d/divegen.js';
import { dataFrom, hashWorld, addEnemy } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { CELL, noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive;
const KIT = ['ember', 'water-gun', 'tackle'];
const run = (o = {}) => newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: KIT, autoPick: 0, ...o });
const step = (S, input) => { stepDive(S, input || noInput()); return S.w.events.slice(); };
const steps = (S, sec, input) => { const ev = []; for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) ev.push(...step(S, input)); return ev; };
const safe = (S) => { S.w.pl.maxHp = S.w.pl.hp = 1e9; };
const empty = (S) => { S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; };   // (no foes, and no reinforcements)
const put = (S, x, z) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vz = s.vy = 0; };
const items = (S) => S.lv.log.filter((q) => q[1] === 'item').length;
/** The first floor (of these seeds) whose room passes `want`. */
const find = (route, want, o = {}) => { for (let seed = 1; seed <= 40; seed++) for (let f = 1; f <= 9; f++) { if (f % 5 === 0) continue; const S = run({ route, seed, start: f, ...o }); if (want(S.w.room, S)) return S; } return null; };

// ---------------------------------------------------------------- the 2D game's numbers
A(R.PLUG === E.PLUG && R.LM === E.LM && R.PLUG.T === 0.6 && R.LM.T === 1 && X.E.K.OPEN_T === CHEST.T, "the plugs', the landmarks' and the chests' numbers are the 2D game's", [R.PLUG, R.LM, X.E.K.OPEN_T]);
A(Object.keys(R.F.ROUTES).every((r) => !!LANDMARKS[R.F.ROUTES[r].landmark]), "every route's landmark is known here", Object.keys(R.F.ROUTES).map((r) => R.F.ROUTES[r].landmark));

// ---------------------------------------------------------------- chests
{
	const S = run(); safe(S); empty(S);
	const room = S.w.room, pockets = room.plugs.filter((pg) => pg.chest).length;
	A(S.chests.length >= 1 && S.chests.length === room.chests.filter((c) => !room.pocketChest(c)).length + pockets, "the floor's chests, and one for each secret pocket", [S.chests.length, room.chests.length, pockets]);
	const c = S.chests.find((q) => !q.pocket), n0 = items(S);
	steps(S, 1);
	A(S.opened === 0 && !c.open, 'far from a chest: nothing opens');
	put(S, c.x + 1, c.z);
	let ev = steps(S, CHEST.T - 0.1);
	A(!c.open && c.t > 0, `beside it, but not yet ${CHEST.T} s: still shut`, c.t);
	ev = steps(S, 0.2);
	const got = ev.filter((q) => q.k === 'chest');
	A(c.open && S.opened === 1 && got.length === 1 && !!got[0].item && items(S) === n0 + 1, 'then it opens: one item, and the page is told', [got, items(S) - n0]);
	A(ev.some((q) => q.k === 'say' && /^Item: /.test(q.text)), '…and you are told which');
	steps(S, 2);
	A(S.opened === 1 && items(S) === n0 + 1, 'a chest opens once');
	A(result(S).parts.chests === 1 && result(S).lines.some((l) => /Poké Balls opened: 1/.test(l)), 'the end screen counts it');
	// stepping away resets the wait
	const S2 = run(); safe(S2); empty(S2);
	const c2 = S2.chests.find((q) => !q.pocket);
	put(S2, c2.x + 1, c2.z); steps(S2, 0.3); put(S2, c2.x + 20, c2.z + 20); steps(S2, 0.1); put(S2, c2.x + 1, c2.z); steps(S2, 0.3);
	A(!c2.open, 'stepping away starts the wait again');
	// a run with no items of its own: loot instead
	const S3 = run({ levels: false }); safe(S3); empty(S3);
	const c3 = S3.chests[0], st0 = S3.stake;
	put(S3, c3.x + 1, c3.z); steps(S3, 0.6);
	A(c3.open && near(S3.stake, st0 + 3 + S3.floor), 'no item to give: a little loot instead (3 + the floor)', [S3.stake, st0]);
}

// ---------------------------------------------------------------- secret pockets
{
	const cellOf = (room, p) => Math.floor(p[2] / CELL) * room.w + Math.floor(p[0] / CELL);
	const lean = (S, pg) => { const fc = pg.faces[0]; put(S, fc[0], fc[2]); };
	for (const [kind, yes, no] of [['thicket', 4, 7], ['boulder', 74, 4]]) {
		const S = find('forest', (room) => room.plugs.some((pg) => pg.kind === kind && pg.faces.length), { dex: no });
		A(!!S, `a floor with a ${kind}`);
		if (!S) continue;
		safe(S); empty(S);
		const room = S.w.room, i = room.plugs.findIndex((pg) => pg.kind === kind && pg.faces.length), pg = room.plugs[i];
		A(room.cells[cellOf(room, pg.at)] >= room.rimH && checkFloor(room).length === 0, `the ${kind} is rock, and its face is on the side you come from`, checkFloor(room));
		A(!canOpen(S, kind), `dex ${no} cannot open a ${kind}`);
		lean(S, pg);
		let ev = steps(S, 2);
		A(!pg.open && ev.filter((q) => q.k === 'say' && /breaks it|burns it/.test(q.text)).length === 1, 'the wrong type against it: it stays shut, and a tip says what it needs, once', ev.filter((q) => q.k === 'say').map((q) => q.text));
		// the right type
		const T = run({ route: 'forest', seed: S.seed, start: S.floor, dex: yes }); safe(T); empty(T);
		const tr = T.w.room, tp = tr.plugs[i];
		A(canOpen(T, kind), `dex ${yes} can`);
		lean(T, tp);
		ev = steps(T, R.PLUG.T - 0.1);
		A(!tp.open, `not before ${R.PLUG.T} s`);
		ev = steps(T, 0.2);
		const pe = ev.filter((q) => q.k === 'plug');
		A(tp.open && pe.length === 1 && pe[0].kind === kind && T.secrets === 1, 'then it opens, and the page is told (it builds the floor again)', pe);
		A([tp.at, tp.at2].filter(Boolean).every((p) => tr.cells[cellOf(tr, p)] === 0), 'its tiles are ground now');
		A(checkFloor(tr).length === 0, 'the floor is still sound', checkFloor(tr));
		// the chest behind it can be walked to: a flood over the ground from the spawn
		{ const n = tr.w * tr.h, seen = new Uint8Array(n), q = [cellOf(tr, tr.spawn)]; seen[q[0]] = 1;
			for (let k = 0; k < q.length; k++) { const c = q[k], x = c % tr.w, z = (c - x) / tr.w; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= tr.w || nz >= tr.h) continue; const j = nz * tr.w + nx; if (!seen[j] && tr.cells[j] < tr.rimH) { seen[j] = 1; q.push(j); } } }
			A(tp.chest && seen[cellOf(tr, tp.chest)] === 1, 'the chest behind it can be walked to now'); }
		const pc = T.chests.find((c) => c.pocket && near(c.x, tp.chest[0]) && near(c.z, tp.chest[2]));
		put(T, pc.x, pc.z + 1); steps(T, 0.6);
		A(pc.open && T.opened === 1, '…and it opens like any other');
		A(openPlug(T, i) === false && T.secrets === 1, 'a plug opens once');
		A(result(T).parts.secrets === 1, 'the end screen counts the pocket');
	}
}

// ---------------------------------------------------------------- landmarks
{
	const on = (route) => { const S = find(route, (room) => !!room.landmark); if (S) { safe(S); empty(S); } return S; };
	const use = (S) => { put(S, S.lm.x, S.lm.z); return steps(S, R.LM.T + 0.1); };
	const routeOf = (kind) => Object.keys(R.F.ROUTES).find((r) => R.F.ROUTES[r].landmark === kind);
	// the shrine: half your HP, once; not before LM.T; it names itself as you come near
	{
		const S = on(routeOf('shrine')); A(!!S && S.lm.kind === 'shrine', 'a floor with a shrine');
		const pl = S.w.pl; pl.maxHp = 1000; pl.hp = 100;
		put(S, S.lm.x + 4 * CELL, S.lm.z);
		let ev = steps(S, 0.1);
		A(ev.some((q) => q.k === 'say' && /^Shrine: stand on it/.test(q.text)) && !S.lm.used, 'near it, it says what it is');
		put(S, S.lm.x, S.lm.z);
		ev = steps(S, R.LM.T - 0.1);
		A(!S.lm.used && pl.hp === 100, `on it, but not yet ${R.LM.T} s: nothing`);
		ev = steps(S, 0.2);
		A(S.lm.used && near(pl.hp, 100 + 1000 * R.LM.SHRINE_HP) && ev.filter((q) => q.k === 'landmark' && q.kind === 'shrine').length === 1, 'the shrine: half your HP back', pl.hp);
		pl.hp = 100; steps(S, 3);
		A(pl.hp === 100 && S.marks === 1, 'a landmark is used once');
	}
	{	// the obelisk: +30 % damage for 60 s
		const S = on(routeOf('obelisk')), out = () => S.w.hooks.out(S.w, {}, { id: KIT[0] }, 10);
		const k0 = out(); use(S);
		A(k0 === 1 && near(out(), 1 + R.LM.OBELISK) && /OBELISK \d+ s/.test(hudLine(S)), 'the obelisk: your damage x1.3, and the chips count it down', [k0, out(), hudLine(S)]);
		steps(S, R.LM.OBELISK_T);
		A(out() === 1 && !/OBELISK/.test(hudLine(S)), `…for ${R.LM.OBELISK_T} s`, out());
	}
	{	// the altar: HP for loot
		const S = on(routeOf('altar')), pl = S.w.pl; pl.maxHp = 1000; pl.hp = 1000; const st = S.stake;
		use(S);
		A(near(pl.hp, 1000 - 1000 * R.LM.ALTAR_HP) && near(S.stake, st + 20 + 3 * S.floor), 'the altar: 30 % of your HP for loot (20 + 3 a floor)', [pl.hp, S.stake - st]);
		const S2 = on(routeOf('altar')), p2 = S2.w.pl; p2.maxHp = 1000; p2.hp = 50; use(S2);
		A(p2.hp === 1 && !S2.ended, '…it never takes your last HP');
	}
	{	// the shipwreck: loot
		const S = on(routeOf('shipwreck')), st = S.stake; use(S);
		A(near(S.stake, st + 15 + 2 * S.floor), 'the shipwreck: loot (15 + 2 a floor)', S.stake - st);
	}
	{	// the spire: the foes near it freeze
		const S = on(routeOf('spire'));
		const a = addEnemy(S.w, 19, S.lm.x + 2 * CELL, S.lm.z, { t: 0, ti: 0, hp: 1e6 }), b = addEnemy(S.w, 19, S.lm.x + (R.LM.SPIRE_R + 3) * CELL, S.lm.z, { t: 0, ti: 0, hp: 1e6 });
		a.dummy = b.dummy = true;
		use(S);
		A(a.frozenT > R.LM.SPIRE_T - 0.3 && !(b.frozenT > 0), `the spire: a foe within ${R.LM.SPIRE_R} tiles is frozen ${R.LM.SPIRE_T} s, one farther is not`, [a.frozenT, b.frozenT]);
	}
	for (const [kind, k] of [['totem', 0.35], ['monolith', 0.6]]) {
		const S = on(routeOf(kind)), w = S.w, g0 = w.stats.gained, want = Math.round(w.pl.xpNext * k / w.pl.xpMul) * w.pl.xpMul;
		use(S);
		A(near(w.stats.gained - g0, want, 1e-6), `the ${kind}: ${k * 100} % of a level in experience`, [w.stats.gained - g0, want]);
	}
	{	// the fairy ring
		const S = on(routeOf('fairy')), pl = S.w.pl; pl.maxHp = 1000; pl.hp = 3; use(S);
		A(pl.hp === 1000, 'the fairy ring: fully healed', pl.hp);
	}
	{	// a new floor has its own
		const S = on(routeOf('shrine')); use(S);
		put(S, S.w.room.stairs[0], S.w.room.stairs[2]); steps(S, R.K.STAIRS_T + 0.3);
		A(S.floor > S.start && (!S.lm || !S.lm.used) && S.chests.every((c) => !c.open), "the next floor has its own chests and landmark, unused", [S.floor, S.lm]);
	}
}

// ---------------------------------------------------------------- the same inputs give the same run
{
	const play = () => { const S = run({ seed: 11 }); safe(S); const c = S.chests[0]; steps(S, 1); put(S, c.x + 1, c.z); steps(S, 1); if (S.lm) { put(S, S.lm.x, S.lm.z); steps(S, 1.5); } steps(S, 2, { ...noInput(), mx: 1 }); return [hashWorld(S.w), S.opened, S.stake, items(S)]; };
	const a = play(), b = play();
	A(JSON.stringify(a) === JSON.stringify(b) && a[1] === 1, 'the same inputs give the same run (the chest gives the same item)', [a, b]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
