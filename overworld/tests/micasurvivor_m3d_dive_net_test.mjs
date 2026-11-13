// micasurvivor_m3d_dive_net_test.mjs — MicaSurvivor 3D, Dive part 16 (Plans/MICASURVIVOR_3D_PLAN.md §5.69): a Dive's row
// (micasurvivor/m3d/divenet.js), in node: what the playing side says, and what a watcher makes of it with nothing else.
//   * the row is small and made of plain values; it reads back to the same floor, chests, landmark, lost Pokémon,
//     things, loot and chips
//   * an opened pocket, an opened chest, a used landmark, a broken rock, the stall, the boss, the end: each is seen
//   * the next floor is a new floor (and its pockets are shut again); the Weekly Dive and the League member travel too
//   node overworld/tests/micasurvivor_m3d_dive_net_test.mjs
import { rulesFrom, newDive, stepDive, hudLine, openPlug } from '../../micasurvivor/m3d/dive.js';
import { diveRow, diveView } from '../../micasurvivor/m3d/divenet.js';
import { ecoView } from '../../micasurvivor/m3d/expeco.js';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { NK } from '../../micasurvivor/m3d/net.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G);
const run = (o = {}) => { const S = newDive(data, X, R, { route: 'forest', seed: 3, dex: 4, league: true, autoPick: 0, ...o }); S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; return S; };
const steps = (S, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) stepDive(S, noInput()); };
const put = (S, x, z) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vz = s.vy = 0; };
/** What a watcher has: the row as text, and nothing else of the run. */
const seen = (S, keep) => diveView(JSON.parse(JSON.stringify(diveRow(S))), R, X, keep);

{
	const S = run(), keep = {}; steps(S, 0.2);
	const row = diveRow(S), text = JSON.stringify(row), v = seen(S, keep), room = S.w.room;
	A(text.length < 220 && JSON.stringify(JSON.parse(text)) === text, `the row is small (${text.length} characters) and plain`, text);
	A(v.dive && v.route === 'forest' && v.floor === 1 && v.seed === 3 && v.room !== room && v.room.w === room.w && v.room.h === room.h && v.room.stairs.join() === room.stairs.join() && v.room.cells.every((c, i) => c === room.cells[i]), 'a watcher builds the same floor from it');
	A(v.chests.length === S.chests.length && v.chests.every((c, i) => c.x === S.chests[i].x && c.z === S.chests[i].z && !c.open) && v.lm.kind === S.lm.kind && v.lm.x === S.lm.x && !v.lm.used, 'with the same chests and landmark');
	A(!!v.stray && v.stray.dex === S.stray.dex && Math.abs(v.stray.x - S.stray.x) < 0.06 && !v.stray.follow, 'and the same lost Pokémon, where it waits');
	const mine = ecoView(S).map((o) => [o.i, o.kind, o.x, o.z].join()).sort().join(';'), theirs = v.eco.map((o) => [o.i, o.kind, o.x, o.z].join()).sort().join(';');
	A(v.eco.length >= 5 && mine === theirs, `and the same ${v.eco.length} things (the stall, the bushes, the rocks)`, [mine, theirs]);
	A(v.hud(S.w.pl.s) === hudLine(S), "its chips' line is the player's own", [v.hud(S.w.pl.s), hudLine(S)]);
	A(v.league && v.league.member === 4 && v.league.form === 4 && !v.weekly && v.over === '' && v.boss === '', 'it knows the League member, and that the Dive goes on');
	const again = seen(S, keep);
	A(again.room === v.room, 'the floor is built once, not each frame');
	// a rock, a chest, the shrine, the pocket
	const rock = S.w.room.eco.objs.find((o) => o.kind === 'rock'); put(S, rock.x, rock.z); steps(S, 0.2);
	let q = seen(S, keep);
	A(q.coins === rock.v && q.eco.length === v.eco.length - 1 && !q.eco.some((o) => o.i === rock.i) && / · ₽ \d+$/.test(q.hud(S.w.pl.s)), 'a gold rock broken: its ₽, and it is gone');
	const c = S.chests.findIndex((k) => !k.pocket); put(S, S.chests[c].x + 1, S.chests[c].z); steps(S, 0.7);
	q = seen(S, keep);
	A(q.chests[c].open && q.chests.filter((k) => k.open).length === 1, 'a chest opened: that one');
	put(S, S.lm.x, S.lm.z); steps(S, R.LM.T + 0.2);
	A(seen(S, keep).lm.used === true, 'the landmark used');
	const pi = S.w.room.plugs.findIndex((p) => !p.open);
	openPlug(S, pi);
	q = seen(S, keep);
	A(q.room !== v.room && q.room.plugs[pi].open && q.room.cells.every((cell, i) => cell === S.w.room.cells[i]), 'a secret pocket opened: the watcher builds the floor again, with it open');
	// the lost Pokémon follows
	put(S, S.stray.x + 1, S.stray.z); steps(S, 0.3);
	A(seen(S, keep).stray.follow === true, 'the lost Pokémon follows');
	// loot and the boss
	S.bank = 12.7; S.stake = 30.2; S.boss = { xk: 'guardian', dead: false }; S.sealed = true;
	q = seen(S, keep);
	A(q.bank === 13 && q.stake === 30 && q.boss === 'guardian' && q.sealed && /GUARDIAN/.test(q.hud(S.w.pl.s)), 'the loot, a guardian, the sealed stairs');
	S.boss = null; S.sealed = false;
	// the next floor
	put(S, S.w.room.stairs[0], S.w.room.stairs[2]); steps(S, R.K.STAIRS_T + 0.3);
	S.w.enemies.length = 0; S.groups.length = 0;
	q = seen(S, keep);
	A(S.floor === 2 && q.floor === 2 && q.room.cells.every((cell, i) => cell === S.w.room.cells[i]) && q.room.plugs.every((p) => !p.open) && q.chests.every((k) => !k.open) && diveRow(S).p === undefined, 'the next floor: a new floor, its pockets shut and its chests whole');
	// the end
	S.w.pl.hp = 0; S.w.pl.dead = true; steps(S, 0.1);
	A(seen(S, keep).over === 'lost', 'a faint: over');
	const E = run(); E.ended = true; E.escaped = true; E.rescued = [16, 19];
	q = seen(E, {});
	A(q.over === 'won' && q.rescued === 2, 'an escape: over, with those rescued');
}
{	// the Weekly Dive and a later stage
	const wk = G.Expedition.diveWeekly(), S = run({ route: wk.route, seed: wk.seed, weekly: { week: wk.week, mod: wk.mod }, form: 5, shiny: true });
	const v = seen(S, {});
	A(v.weekly && v.weekly.week === wk.week && v.weekly.mod === wk.mod && v.route === wk.route && v.seed === (wk.seed | 0) && v.league.form === 5 && v.league.shiny, "the Weekly Dive's week and modifier, the stage and the shiny travel too", v.weekly);
}
A(['tele', 'slam', 'chest', 'landmark', 'plug'].every((k) => NK.EVENTS.includes(k)), "a Dive's red ground, chests, landmark and pockets are among the events a watcher is sent");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
