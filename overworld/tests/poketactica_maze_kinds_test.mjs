// poketactica_maze_kinds_test.mjs — Tower Defense, MAZE BUILDER's ENEMY KINDS (rules revision 14; owner, 2026-11-24:
// "new kinds, but all walk"; Plans/POKETACTICA_MAZE_BUILDER_IMPROVEMENT_PLAN.md items 8 and 9): runners, splitters,
// shielded ones and healers; elite waves; a boss's trick (rally, call, armour). The wave list itself is the one it
// always was; the Road, and a run recorded under rules 13, meet no kinds at all.
//   node overworld/tests/poketactica_maze_kinds_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import { TD_MAPS } from '../../poketactica/js/td/maps.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const J = JSON.stringify;
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '.....1......', '............', '............'],
	ground: ['gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggsgggggg', 'gggggggggggg', 'gggggggggggg'],
	gates: [[0, 3]], base: [11, 3] });
const squad = (n = 3, lv = 30) => ['pikachu', 'squirtle', 'charmander'].slice(0, n).map((sp, i) => makeFigurine(sp, lv, makeRng('mzk' + i), data, { id: 'mzk' + i, shinyRate: 0 }));
const fresh = (seed = 'kinds', o = {}) => TD.newRun(seed, { map: FIELD, squad: squad(), ...o }, data);
const unit = (S, uid) => S.B.units.find((u) => u.uid === uid);
/** A run in a wave made of exactly these (no towers: nothing is hurt unless the test hurts it). */
function waveOfThese(list, seed = 'craft', lives = 99) {
	const S = fresh(seed);
	S.lives = lives;
	TD.applyInput(S, { t: 'call' }, data);
	TD.step(S, [], data);                       // (the wave starts: its own list is made ...)
	S.spawn = list.map((w, i) => ({ sp: 'rattata', lv: 10, boss: false, at: i * 4, gate: 0, ...w }));   // (... and swapped for the test's)
	S.spawned = 0;
	for (const e of S.enemies.slice()) { S.B.units = S.B.units.filter((u) => u.uid !== e.uid); } S.enemies = [];
	return S;
}
/** Knocked out as the game does it (a poison tick takes its last HP): the sim's own knockout, with its gold and its count. */
const kill = (S, e) => { const v = unit(S, e.uid); v.hp = 1; e.dotKind = 'psn'; e.dot = 0; };
const run = (S, ticks) => { const evs = []; for (let i = 0; i < ticks && !S.over; i++) { TD.step(S, [], data); evs.push(...S.ev); S.ev = []; } return evs; };

// ---------- the list: the same waves, with kinds on a stream of their own
{
	A(TD.TD_RULES_REV >= 14, 'the rules revision is 14 or later');
	let same = true, early = true, fromOk = true, some = 0, kinds = new Set(), oneKind = true;
	for (let n = 1; n <= 60; n++) {
		const a = TD.waveOf('list', n, data, 2), b = TD.waveOf('list', n, data, 2, true);
		if (J(b.map(({ trait, trick, ...w }) => w)) !== J(a) || a.some((w) => w.trait || w.trick)) same = false;
		const tr = [...new Set(b.filter((w) => w.trait).map((w) => w.trait))];
		if (n < TD.TRAIT_WAVE && tr.length) early = false;
		if (tr.length > 1) oneKind = false;
		for (const k of tr) { kinds.add(k); if (n < TD.TRAITS[k].from) fromOk = false; }
		if (tr.length) some++;
		if (b.some((w) => w.boss && w.trait)) oneKind = false;
	}
	A(same, 'with no kinds asked for the list is exactly what it was; with them, the same foes at the same times and gates');
	A(early && fromOk, 'no kinds before wave 3, and each kind only from its own wave (runners 3, splitters 5, shielded 7, healers 9)');
	A(oneKind && kinds.size === 4 && some >= 25 && some < 60, 'a wave has one kind at most (never on the boss itself); all four turn up; some waves have none', [some, [...kinds]]);
	A(J(TD.waveOf('list', 12, data, 1, true)) === J(TD.waveOf('list', 12, data, 1, true)), 'the same seed and wave: the same kinds');
	// elite waves
	const elites = [5, 15, 25, 35, 45, 55].map((n) => ({ n, w: TD.waveOf('elite', n, data, 1, true) }));
	A(TD.isEliteWave(5) && TD.isEliteWave(25) && !TD.isEliteWave(10) && !TD.isEliteWave(7), 'waves 5, 15, 25 ... are elite');
	A(elites.every(({ w }) => { const k = (w.find((x) => x.trait) || {}).trait; return k && (k === 'healer' ? w.some((x) => !x.trait) && w.filter((x) => x.trait).length >= 1 : w.every((x) => x.trait === k)); }), 'an elite wave is all of one kind (healers: some of it)', elites.map(({ n, w }) => [n, w.filter((x) => x.trait).length, w.length]));
	// a boss's trick
	const bosses = [10, 20, 30, 40, 50, 60].map((n) => TD.waveOf('boss', n, data, 1, true).find((w) => w.boss));
	A(!bosses[0].trick && bosses.slice(1).every((b) => TD.BOSS_TRICKS[b.trick]), 'the wave 10 boss has no trick; every boss from wave 20 has one', bosses.map((b) => b.trick));
	// who meets them
	const road = TD.newRun('who', { map: TD_MAPS[0], squad: squad() }, data), maze = fresh('who'), old = fresh('who', { rev: 13 });
	const has = (S) => { for (let n = 3; n <= 30; n++) if (TD.waveFor(S, n, data).some((w) => w.trait || w.trick)) return true; return false; };
	A(has(maze) && !has(road) && !has(old) && old.rev === 13, 'Maze Builder meets them; the Road does not; a run recorded under rules 13 does not');
}

// ---------- a runner: 1.6 times as fast, 0.6 of the HP
{
	const S = waveOfThese([{ trait: 'runner' }, { at: 0 }]);
	run(S, 40);
	const [r, p] = S.enemies, rv = unit(S, r.uid), pv = unit(S, p.uid);
	A(r.trait === 'runner' && !p.trait && Math.abs(r.d / p.d - 1.6) < 0.08, 'a runner has walked 1.6 times as far as a plain one', [r.d, p.d]);
	A(Math.abs(rv.maxHP / pv.maxHP - 0.6) < 0.03, 'with 0.6 of the HP', [rv.maxHP, pv.maxHP]);
	A(TD.view(S).enemies[0].trait === 'runner' && TD.view(S).enemies[1].trait === null, 'the view says which is which');
}

// ---------- a shield: nothing sticks until it has lost 40% of its HP
{
	const S = waveOfThese([{ trait: 'shield' }, { at: 0 }]);
	run(S, 10);
	const [s, p] = S.enemies, sv = unit(S, s.uid), pv = unit(S, p.uid);
	A(Math.abs(sv.maxHP / pv.maxHP - 1.3) < 0.03, 'a shielded one has 1.3 of the HP', [sv.maxHP, pv.maxHP]);
	sv.status = 'slp'; pv.status = 'slp';
	const d0 = s.d, p0 = p.d;
	let evs = run(S, 20);
	A(s.d > d0 && !sv.status && p.d === p0 && pv.status === 'slp', 'put to sleep: the shielded one walks on, awake; the plain one stops', [s.d - d0, sv.status, p.d - p0]);
	A(TD.view(S).enemies[0].shielded === true && !evs.some((e) => e.t === 'cracked'), 'its shield stands');
	s.slow = S.tick + 100; s.back = S.tick + 100; s.stop = S.tick + 100;
	const d1 = s.d; run(S, 10);
	A(s.d > d1 && s.slow === 0 && s.back === 0 && s.stop === 0, 'no slow, no turn-back and no hold either');
	sv.hp = Math.floor(sv.maxHP * 0.6);
	evs = run(S, 2);
	A(evs.filter((e) => e.t === 'cracked' && e.uid === s.uid).length === 1 && TD.view(S).enemies[0].shielded === false, 'at 60% of its HP the shield breaks (said once)');
	sv.status = 'slp';
	const d2 = s.d; evs = run(S, 20);
	A(s.d === d2 && sv.status === 'slp' && !evs.some((e) => e.t === 'cracked'), 'and now sleep holds it like anyone else');
}

// ---------- a healer: mends the others near it, not itself
{
	const S = waveOfThese([{ trait: 'healer' }, { at: 0 }, { at: 0 }]);
	run(S, 6);
	const [h, a, b] = S.enemies, hv = unit(S, h.uid), av = unit(S, a.uid), bv = unit(S, b.uid);
	hv.hp = Math.floor(hv.maxHP / 2); av.hp = Math.floor(av.maxHP / 2);
	b.d = 9 * TD.SUB; run(S, 1); h.stop = 1e9; a.stop = 1e9; b.stop = 1e9; h.free = 0;   // (the third is far ahead; all three stand still for the count) bv.hp = Math.floor(bv.maxHP / 2);   // (the third one is far ahead)
	const a0 = av.hp, b0 = bv.hp, h0 = hv.hp;
	const evs = run(S, TD.HEAL_EVERY + 2);
	const want = Math.ceil(av.maxHP * TD.HEAL_FRAC);
	A(av.hp === a0 + want && evs.some((e) => e.t === 'mend' && e.uid === a.uid && e.n === want && e.by === h.uid), 'one beside it is mended by 4% of its HP', [a0, av.hp, want]);
	A(hv.hp === h0 && bv.hp === b0, 'not itself, and not one out of reach (2 tiles)', [h0, hv.hp, b0, bv.hp]);
	av.hp = av.maxHP - 1; run(S, TD.HEAL_EVERY + 1);
	A(av.hp === av.maxHP, 'never over its full HP');
}

// ---------- a splitter: two small ones where it fell
{
	const S = waveOfThese([{ trait: 'splitter' }]);
	run(S, 60);
	const e = S.enemies[0], v = unit(S, e.uid), d = e.d, max = v.maxHP, k0 = S.kills, g0 = S.gold;
	kill(S, e);
	const evs = run(S, 1);
	A(S.enemies.length === 2 && S.enemies.every((c) => c.small && !c.trait && Math.abs(c.d - d) <= TD.SUB) && S.kills === k0 + 1 && S.gold > g0, 'knocked out: two small ones stand where it fell (and it paid its gold)', [S.enemies.map((c) => c.d), d]);
	A(S.enemies.every((c) => { const u = unit(S, c.uid); return u.maxHP === Math.max(1, Math.floor(max * TD.SPLIT_HP)) && u.hp === u.maxHP && u.species === 'rattata'; }) && evs.filter((x) => x.t === 'spawn' && x.split === e.uid).length === 2, 'each with 35% of its HP');
	A(S.phase === 'wave' && TD.view(S).left === 2, 'the wave is not over until they are dealt with');
	const d1 = S.enemies[0].d; run(S, 10);
	A(S.enemies[0].d > d1, 'they walk on');
	for (const c of S.enemies.slice()) kill(S, c);
	run(S, 2);
	A(S.enemies.length === 0 && S.kills === k0 + 3, 'a small one does not split again');
	// one that LEAKS does not split
	const L = waveOfThese([{ trait: 'splitter' }]);
	run(L, 3); L.enemies[0].d = 1e9; const lv = L.lives; run(L, 2);
	A(L.enemies.length === 0 && L.lives === lv - 1, 'one that reaches the base costs a life and does not split');
}

// ---------- a boss's tricks
{
	// rally: everything walks 1.3 times as fast while it stands
	const R = waveOfThese([{ boss: true, sp: 'onix', trick: 'rally' }, { at: 0 }], 'rally'), P = waveOfThese([{ boss: true, sp: 'onix' }, { at: 0 }], 'rally');
	run(R, 40); run(P, 40);
	A(R.enemies[0].trick === 'rally' && Math.abs(R.enemies[1].d / P.enemies[1].d - 1.3) < 0.06 && Math.abs(R.enemies[0].d / P.enemies[0].d - 1.3) < 0.06, 'rally: its wave (and it) walks 1.3 times as fast', [R.enemies[1].d, P.enemies[1].d]);
	unit(R, R.enemies[0].uid).hp = 0; run(R, 1);
	const d0 = R.enemies[0].d; run(R, 20); const d1 = R.enemies[0].d - d0;
	const q0 = P.enemies[1].d; run(P, 20);
	A(Math.abs(d1 / (P.enemies[1].d - q0) - 1) < 0.06, 'the boss falls: they walk as they would');
	// call: a helper every 6 seconds, 6 at most
	const C = waveOfThese([{ boss: true, sp: 'onix', trick: 'call' }, { at: 0, sp: 'pidgey' }], 'call');
	C.lives = 999;
	let evs = run(C, TD.CALL_EVERY - 5);
	A(C.enemies.length === 2 && !evs.some((e) => e.called), 'call: nothing for the first seconds');
	evs = run(C, 12);
	const boss = C.enemies.find((e) => e.boss), help = C.enemies[C.enemies.length - 1];
	A(C.enemies.length === 3 && evs.some((e) => e.t === 'spawn' && e.called === boss.uid) && !help.boss && Math.abs(help.d - boss.d) < TD.SUB && unit(C, help.uid).species === 'pidgey', 'then a helper of the wave\'s kind, where the boss stands', C.enemies.map((e) => [e.uid, e.d]));
	for (let i = 0; i < 9; i++) { boss.d = TD.SUB; run(C, TD.CALL_EVERY); }   // (kept near the gate so it calls all it can)
	A(boss.called === TD.CALL_MAX, 'six at most', boss.called);
	// armour: the shield, on a boss
	const M = waveOfThese([{ boss: true, sp: 'onix', trick: 'armour' }], 'armour');
	run(M, 5);
	const mv = unit(M, M.enemies[0].uid); mv.status = 'par';
	run(M, 3);
	A(M.enemies[0].trait === 'shield' && M.enemies[0].trick === 'armour' && !mv.status && TD.view(M).enemies[0].shielded, 'armour: the boss shrugs off paralysis until 40% of its HP is gone');
}

// ---------- the same run twice; a snapshot mid-wave
{
	const play = (S, n) => { for (let i = 0; i < n && !S.over; i++) { if (S.phase === 'wait') { if (S.pick) TD.applyInput(S, { t: 'pick', i: S.pick.opts.findIndex((o) => o && o.k !== 'cards') }, data); if (S.perks) TD.applyInput(S, { t: 'perk', i: 0 }, data); TD.applyInput(S, { t: 'call' }, data); } TD.step(S, [], data); } return S; };
	const a = play(fresh('twice'), 2500), b = play(fresh('twice'), 2500);
	A(TD.hashOf(a) === TD.hashOf(b) && a.wave >= 3, 'the same seed plays the same run, kinds and all', [a.wave, a.over]);
	const c = play(fresh('snap'), 900), d = TD.fromSnapshot(TD.toSnapshot(c));
	play(c, 600); play(d, 600);
	A(TD.hashOf(c) === TD.hashOf(d), 'a snapshot taken mid-run goes on exactly as the run did');
	const o1 = play(fresh('old', { rev: 13 }), 2500), sawKind = [];
	const o2 = fresh('old', { rev: 13 }); for (let i = 0; i < 2500 && !o2.over; i++) { if (o2.phase === 'wait') TD.applyInput(o2, { t: 'call' }, data), o2.pick && TD.applyInput(o2, { t: 'pick', i: o2.pick.opts.findIndex((o) => o && o.k !== 'cards') }, data); TD.step(o2, [], data); if (o2.enemies.some((e) => e.trait || e.trick)) sawKind.push(o2.tick); }
	A(!sawKind.length && o1.rev === 13, 'a run under rules 13 never meets a kind');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
