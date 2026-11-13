// micasurvivor_m3d_dive_kit_test.mjs — MicaSurvivor 3D, Dive part 4 (Plans/MICASURVIVOR_3D_PLAN.md §5.56): the kit, the
// dodge and the combo (micasurvivor/m3d/dive.js), in node, with the 2D game's own numbers.
//   * the kit: the first move fires by itself; the second and third only when pressed; a special hits x K.SPECIAL_K;
//     a press just before the cool-down ends is kept, an earlier one is refused; a fourth move is put away
//   * the dodge: slide = a dash the way you push (or face), DODGE.T s, about DODGE.TILES x DODGE.T tiles; nothing hurts
//     you during it; DODGE.CD s to cool; holding the button does not repeat it
//   * the combo: KOs within COMBO.WINDOW s chain; XP +COMBO.XP_PER a step; loot every COMBO.MILESTONE; it lapses
//   * the same inputs give the same run
//   node overworld/tests/micasurvivor_m3d_dive_kit_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rulesFrom, newDive, stepDive, pressSpecial, specials, hudLine, result, DODGE } from '../../micasurvivor/m3d/dive.js';
import { dataFrom, hashWorld, addEnemy } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { CELL, noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const HERE = path.dirname(fileURLToPath(import.meta.url));

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive, K = E.K;
const KIT = ['ember', 'water-gun', 'tackle'];
const run = (o = {}) => newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: KIT, autoPick: 0, ...o });
const step = (S, input) => { stepDive(S, input || noInput()); return S.w.events.slice(); };
const steps = (S, sec, input) => { const ev = []; for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) ev.push(...step(S, input)); return ev; };
const safe = (S) => { S.w.pl.maxHp = S.w.pl.hp = 1e9; };
const empty = (S) => { S.w.enemies.length = 0; S.groups.length = 0; };
const kill = (e) => { e.hp = 1e-6; e.shield = 0; e.poison = 1; e.poisonT = 1; e.poisonTick = 0; };
/** A foe that stands beside you and takes a lot. */
const target = (S, d = 2) => { const s = S.w.pl.s, e = addEnemy(S.w, 19, s.x + d, s.z, { t: 0, ti: 0, hp: 1e6 }); e.dummy = true; return e; };

// ---------------------------------------------------------------- the 2D game's numbers
{
	const verbs = fs.readFileSync(path.join(HERE, '../../micasurvivor/js/expedition/verbs.js'), 'utf8');
	const m = /DODGE_T: ([\d.]+), DODGE_CD: ([\d.]+), DODGE_TILES: ([\d.]+)/.exec(verbs);
	A(m && +m[1] === DODGE.T && +m[2] === DODGE.CD && +m[3] === DODGE.TILES, 'the dodge\'s numbers are the 2D game\'s (verbs.js): ' + JSON.stringify(DODGE), m && m.slice(1));
	A(R.COMBO === E.COMBO && R.COMBO.WINDOW === 3 && R.COMBO.MILESTONE === 10 && K.SLOTS === 3 && K.SPECIAL_K === 1.25 && K.BUFFER === 0.15 && K.HOLD === 0.6, 'the combo\'s and the kit\'s numbers are read from the 2D game\'s Dive');
}

// ---------------------------------------------------------------- the kit
{
	const S = run(); safe(S); empty(S);
	const mv = S.w.pl.moves;
	A(mv.length === 3 && mv.map((m) => m.id).join() === KIT.join() && !mv[0].xman && mv[1].xman && mv[2].xman, 'the kit: three moves; the first is the basic, the other two are specials', mv.map((m) => [m.id, m.xman]));
	const e = target(S);
	let ev = steps(S, 4);
	const hp1 = e.hp;
	A(hp1 < e.maxHp && !ev.some((q) => q.k === 'special') && mv[1].t === 0 && mv[2].t === 0, 'the basic fires by itself; the specials do not (4 s beside a foe: it is hurt, no special was fired)', [e.maxHp - hp1, mv[1].t, mv[2].t]);
	A(specials(S).length === 2 && specials(S).every((q) => q.cd === 0 && !q.queued), 'the specials are ready');
	// press special 1
	A(pressSpecial(S, 1) === true && specials(S)[0].queued, 'special 1 pressed: it is queued');
	ev = steps(S, 0.2);
	const fired = ev.filter((q) => q.k === 'special');
	A(fired.length === 1 && fired[0].id === KIT[1] && mv[1].t > 0 && !mv[1].xreq, 'it fires once, and its cool-down begins', [fired, mv[1].t]);
	A(!ev.some((q) => q.k === 'special' && q.id === KIT[2]), '…and the other special did not');
	// during the cool-down
	const cd = mv[1].t;
	A(cd > K.BUFFER && pressSpecial(S, 1) === false, 'pressed again at once: refused (its cool-down is not nearly over)', cd);
	ev = steps(S, cd - K.BUFFER + 0.02);
	A(mv[1].t > 0 && mv[1].t <= K.BUFFER && !ev.some((q) => q.k === 'special'), '(the cool-down runs; nothing fires by itself)', mv[1].t);
	A(pressSpecial(S, 1) === true, 'a press just before the cool-down ends is kept');
	ev = steps(S, 0.3);
	A(ev.filter((q) => q.k === 'special' && q.id === KIT[1]).length === 1, '…and fires when it ends', ev.filter((q) => q.k === 'special'));
	A(pressSpecial(S, 0) === false && pressSpecial(S, 3) === false, 'the basic cannot be pressed; there is no third special');
	// a special's hit
	const out = S.w.hooks.out;
	A(near(out(S.w, e, { mid: KIT[1] }, 10), K.SPECIAL_K) && near(out(S.w, e, { id: KIT[2] }, 10), K.SPECIAL_K) && near(out(S.w, e, { mid: KIT[0] }, 10), 1), 'a special\'s hit is worth x' + K.SPECIAL_K + '; the basic\'s is not');
	// no foe in reach: the press waits K.HOLD, then lapses
	const S2 = run(); safe(S2); empty(S2);
	steps(S2, 0.5);
	const m2 = S2.w.pl.moves[1], needsTarget = (() => { pressSpecial(S2, 1); const q = steps(S2, 0.1); return !q.some((x) => x.k === 'special'); })();
	if (needsTarget) {
		const q = steps(S2, K.HOLD + 0.1);
		A(!q.some((x) => x.k === 'special') && !(m2.xreq > 0), 'pressed with no foe in reach: it waits ' + K.HOLD + ' s, then the press lapses', m2.xreq);
		target(S2);
		const q2 = steps(S2, 1);
		A(!q2.some((x) => x.k === 'special'), '…and a foe that comes later is not hit by the old press');
		pressSpecial(S2, 1);
		A(steps(S2, 0.2).some((x) => x.k === 'special'), 'pressed with a foe in reach: it fires');
	} else A(true, '(this special needs no target: it fires where you stand)');
	// a fourth move
	const S4 = run({ moves: ['ember', 'water-gun', 'tackle', 'confusion'] }); safe(S4); empty(S4);
	A(S4.w.pl.moves.length === 3 && S4.spare.length === 1 && S4.spare[0].id === 'confusion', 'a fourth move is put away: the kit has three slots', [S4.w.pl.moves.map((m) => m.id), S4.spare.map((m) => m.id)]);
	// without the kit
	const S0 = run({ kit: false }); safe(S0); empty(S0); target(S0);
	steps(S0, 4);
	A(S0.w.pl.moves.every((m) => !m.xman) && pressSpecial(S0, 1) === false && specials(S0).length === 0, 'kit: false keeps every move firing by itself');
}

// ---------------------------------------------------------------- the dodge
{
	const S = run(); safe(S); empty(S);
	const s = S.w.pl.s, room = S.w.room;
	// a long open way from the spawn: try the four directions, take the one that goes farthest
	const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
	const free = (d) => { let n = 0; for (let k = 1; k < 12; k++) { const cx = Math.floor((s.x + d[0] * k * CELL) / CELL), cz = Math.floor((s.z + d[1] * k * CELL) / CELL), i = cz * room.w + cx; if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h || room.cells[i] >= room.rimH || room.water.has(i)) break; n++; } return n; };
	const d = dirs.slice().sort((a, b) => free(b) - free(a))[0];
	A(free(d) >= 5, '(there is open floor to dodge across)', dirs.map(free));
	steps(S, 0.2);
	const x0 = s.x, z0 = s.z;
	let ev = step(S, { mx: d[0], mz: d[1], jump: false, crouch: true });
	A(S.dodge.t > 0 && S.dodge.n === 1 && ev.some((q) => q.k === 'dodge'), 'slide pressed: a dodge begins');
	A(S.w.hooks.hurt(S.w, 10) === 0, 'during it nothing hurts you');
	const hp = S.w.pl.hp; S.w.pl.invuln = 0;
	ev = steps(S, DODGE.T, { mx: d[0], mz: d[1], jump: false, crouch: true });
	const went = Math.hypot(s.x - x0, s.z - z0), want = DODGE.TILES * DODGE.T * CELL;
	A(went > want * 0.8 && went < want * 1.25, `it carries you about ${want.toFixed(1)} m (${(DODGE.TILES * DODGE.T).toFixed(1)} tiles) in ${DODGE.T} s`, went);
	A(S.dodge.t === 0 && S.dodge.cd > 0 && S.w.hooks.hurt(S.w, 10) === 10, 'then it is over: you can be hurt again, and it cools');
	steps(S, 0.5, { mx: d[0], mz: d[1], jump: false, crouch: true });
	A(S.dodge.n === 1, 'holding the button does not dodge again');
	step(S, noInput()); step(S, { mx: 0, mz: 0, jump: false, crouch: true });
	A(S.dodge.n === 1 && S.dodge.cd > 0, 'pressed again while it cools: nothing', S.dodge);
	steps(S, DODGE.CD);
	A(S.dodge.cd === 0, `after ${DODGE.CD} s it is ready`);
	// no direction pushed: the way you face
	s.vx = s.vz = 0; const f = s.facing, x1 = s.x, z1 = s.z;
	step(S, noInput()); step(S, { mx: 0, mz: 0, jump: false, crouch: true });
	steps(S, DODGE.T, noInput());
	const dx = s.x - x1, dz = s.z - z1, l = Math.hypot(dx, dz) || 1;
	A(S.dodge.n === 2 && l > 0.5 && dx / l * Math.sin(f) + dz / l * Math.cos(f) > 0.9, 'with no direction pushed, you dodge the way you face', [dx, dz, f]);
	A(!s.sliding, 'there is no slide in a Dive: the button is the dodge');
	A(S.w.pl.hp === hp, '(no harm came of it)');
}

// ---------------------------------------------------------------- the combo
{
	const C = R.COMBO, S = run({ moves: [] }); safe(S); empty(S);
	const far = (n) => { const s = S.w.pl.s, out = []; for (let i = 0; i < n; i++) { const e = addEnemy(S.w, 19, s.x + 3 + i * 0.1, s.z, { t: 0, ti: 0 }); e.dummy = true; out.push(e); } return out; };
	const xp0 = S.w.pl.xpMul;
	for (const e of far(3)) kill(e);
	steps(S, 0.1);
	A(S.combo.n === 3 && S.combo.best === 3 && S.kills === 3, 'three KOs in a moment: combo x3', S.combo);
	A(near(S.w.pl.xpMul, xp0 * (1 + 3 * C.XP_PER), 1e-9), `XP is worth +${C.XP_PER * 100} % a step`, [S.w.pl.xpMul, xp0]);
	A(hudLine(S).includes('COMBO x3'), 'the line says COMBO x3', hudLine(S));
	steps(S, C.WINDOW - 0.3);
	A(S.combo.n === 3, 'it holds for ' + C.WINDOW + ' s');
	for (const e of far(1)) kill(e);
	steps(S, 0.1);
	A(S.combo.n === 4 && S.combo.t > C.WINDOW - 0.2, 'a KO inside the window chains it, and the window starts again', S.combo);
	// to the milestone
	const stake0 = S.stake, ko = K.LOOT.ko + K.LOOT.koPer * S.floor;
	for (const e of far(C.MILESTONE - 4)) kill(e);
	const ev = steps(S, 0.1);
	A(S.combo.n === C.MILESTONE && near(S.stake - stake0, (C.MILESTONE - 4) * ko + C.COINS_PER, 1e-9), `KO number ${C.MILESTONE} of the chain pays ${C.COINS_PER} more loot`, [S.stake - stake0, ko]);
	A(ev.some((q) => q.k === 'combo' && q.n === C.MILESTONE) && ev.some((q) => q.k === 'say' && /Combo x10!/.test(q.text)), '…and says so');
	// the cap
	for (const e of far(12)) kill(e);
	steps(S, 0.1);
	A(S.combo.n === 22 && near(S.w.pl.xpMul, xp0 * (1 + C.XP_CAP), 1e-9), `the XP stops at +${C.XP_CAP * 100} %`, S.w.pl.xpMul / xp0);
	steps(S, C.WINDOW + 0.2);
	A(S.combo.n === 0 && near(S.w.pl.xpMul, xp0, 1e-9) && S.combo.best === 22, 'left alone it lapses: XP is as it was; the best is remembered', S.combo);
	A(!hudLine(S).includes('COMBO') && result(S).parts.combo === 22 && result(S).lines.some((l) => l === 'Best combo: 22'), 'the run\'s end has the best combo');
}

// ---------------------------------------------------------------- the same inputs, the same run
{
	const play = () => { const S = run({ autoPick: 1 }); safe(S); for (let i = 0; i < 900; i++) { if (i % 90 === 10) pressSpecial(S, 1 + (i % 180 === 10 ? 0 : 1)); stepDive(S, { mx: Math.cos(i / 40), mz: Math.sin(i / 55), jump: i % 200 === 5, crouch: i % 100 < 3 }); } return [hashWorld(S.w), S.kills, S.combo.best, S.dodge.n, S.stake]; };
	const a = play(), b = play();
	A(a.join() === b.join() && a[3] >= 5, 'the same inputs give the same run (specials, dodges and all)', [a, b]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
