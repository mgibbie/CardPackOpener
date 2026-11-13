// micasurvivor_m3d_dive_save_test.mjs — MicaSurvivor 3D, Dive part 6 (Plans/MICASURVIVOR_3D_PLAN.md §5.58): what a 3D
// Dive writes into the Expedition save (micasurvivor/m3d/divesave.js), in node, with the 2D Dive's own keys and rules.
//   * a test parameter makes a Dive a practice run
//   * the record: runs, escapes, the route's deepest floor, the rescued, the pay owed to this browser (in Pokémonedas)
//   * a guardian's stage and Seal; the start floors a save has; the Route of Origin needs the 8 Seals
//   * why a Dive is not kept: a member you do not have, a closed route, a stage not reached
//   * the Seal in the run: +10 % damage, -10 % damage taken
//   node overworld/tests/micasurvivor_m3d_dive_save_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as DS from '../../micasurvivor/m3d/divesave.js';
import { applyOps } from '../../micasurvivor/m3d/expsave.js';
import { rulesFrom, newDive, stepDive, result } from '../../micasurvivor/m3d/dive.js';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const HERE = path.dirname(fileURLToPath(import.meta.url));

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive;
const run = (o = {}) => newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: ['ember', 'water-gun', 'tackle'], autoPick: 0, ...o });
/** The Expedition save's own rules (js/expedition/save.js): bump adds, best keeps the largest, add joins a set. */
const save = () => { const c = {}, s = {}; return { c, s, who: 'guest', data: {}, get: (k) => c[k] || 0, has: (k, v) => !!(s[k] && s[k].includes(String(v))), bump: (k, n) => { c[k] = (c[k] || 0) + n; }, best: (k, v) => { c[k] = Math.max(c[k] || 0, v); }, add: (k, v) => { s[k] = s[k] || []; if (s[k].includes(String(v))) return false; s[k].push(String(v)); return true; }, commit: () => {} }; };
const L = { free: (m) => m === 4, FAM: { 5: 4, 6: 4, 148: 147, 149: 147 }, BY: { 4: {}, 147: {} } };

// ---------------------------------------------------------------- the 2D game's numbers and keys
{
	const meta = fs.readFileSync(path.join(HERE, '../../micasurvivor/js/expedition/meta.js'), 'utf8'), dive = fs.readFileSync(path.join(HERE, '../../micasurvivor/js/expedition/dive.js'), 'utf8');
	const m = /\bSCALE: ([\d.]+),/.exec(meta);
	A(m && +m[1] === DS.DSV.SCALE && DS.coinsOf(100) === 300 && DS.coinsOf(7) === 20 && DS.coinsOf(0) === 0, "Pokémonedas by the 2D game's scale (meta.js SCALE, rounded to 5)", m && m[1]);
	A(["X.bump('dive.runs')", "X.bump('dive.escapes')", "X.best(k + '.best', S.deepest)", "X.best(k + '.stage', S.stage)", "X.bump('dive.rescued'", "X().add('dive.seal', S.route)"].every((q) => dive.includes(q)), "the keys are the 2D Dive's own (its record and its Seal)");
	A(R.SEAL === E.SEAL && R.SEAL.DMG === 0.1 && R.SEAL.TAKEN === 0.1 && R.MAIN.join() === E.MAIN.join() && R.MAIN.length === 8, "the Seal's numbers and the 8 main routes are the 2D game's");
}

// ---------------------------------------------------------------- practice
A(DS.unfairDive([['dive', '7'], ['route', 'forest'], ['floor', '26'], ['dex', '4']]) === null, 'a Dive by its seed, route, floor and Pokémon is a fair one');
A(DS.unfairDive([['dive', '7'], ['auto', '1']]) === 'auto' && DS.unfairDive([['dive', '7'], ['moves', 'ember']]) === 'moves' && DS.unfairDive([['dive', '7'], ['items', 'x']]) === 'items', 'a test parameter (auto, moves, items) makes it a practice run');

// ---------------------------------------------------------------- the record
{
	const Sv = save(), S = run();
	S.bank = 40; S.stake = 100; S.deepest = 7; S.floor = 7; S.rescued = [16, 19]; S.rescuedBank = 1;
	S.ended = true; S.escaped = false; S.lost = true;
	const res = result(S), ops = DS.recordOps(S, res, { dev: 'dv1' });
	applyOps(Sv, ops);
	A(Sv.c['dive.runs'] === 1 && !Sv.c['dive.escapes'] && Sv.c['dive.forest.best'] === 7 && Sv.c['dive.rescued'] === 1, 'a faint on floor 7: one run, the route\'s best 7, the rescued that were secured', Sv.c);
	const loot = Math.floor(40 + 100 * R.K.FAINT_KEEP);
	A(res.parts.divePay === loot && Sv.c['pay3d.dv1'] === DS.coinsOf(loot) && Sv.c['pay.best'] === DS.coinsOf(loot) && Sv.c['m3d.n.dv1'] === 1, `its pay is owed to this browser: the bank and a quarter of the stake (${loot}) = ₽ ${DS.coinsOf(loot)}`, Sv.c);
	A(!Sv.c['dive.forest.stage'] && !Sv.s['dive.seal'], 'no guardian beaten: no stage, no Seal');
	// an escape, shallower: the best stays, the escape counts, the pay adds
	const S2 = run(); S2.bank = 0; S2.stake = 50; S2.deepest = 3; S2.floor = 3; S2.rescued = [16]; S2.ended = true; S2.escaped = true;
	applyOps(Sv, DS.recordOps(S2, result(S2), { dev: 'dv1' }));
	A(Sv.c['dive.runs'] === 2 && Sv.c['dive.escapes'] === 1 && Sv.c['dive.forest.best'] === 7 && Sv.c['dive.rescued'] === 2 && Sv.c['pay3d.dv1'] === DS.coinsOf(loot) + DS.coinsOf(50) && Sv.c['pay.best'] === DS.coinsOf(loot), 'then an escape from floor 3 with 50: the best stays 7, the escape counts, the whole stake is paid', Sv.c);
	A(DS.bestOf(Sv, 'forest') === 7 && DS.bestOf(Sv, 'reef') === 0, 'a route has its own best');
	// nothing kept, nothing owed
	const Sv3 = save(), S3 = run(); S3.ended = true; S3.lost = true; S3.deepest = 1;
	applyOps(Sv3, DS.recordOps(S3, result(S3), { dev: 'dv1' }));
	A(Sv3.c['dive.runs'] === 1 && !Sv3.c['pay3d.dv1'] && Sv3.c['dive.forest.best'] === 1, 'a Dive with no loot is recorded, and pays nothing', Sv3.c);
}

// ---------------------------------------------------------------- stages, Seals, the Route of Origin
{
	const Sv = save(), S = run();
	A(DS.guardianOps(S).length === 0 && DS.starts(Sv, 'forest').join() === '1' && DS.startOf(Sv, 'forest', 26) === 1, 'a new save: a Dive starts on floor 1 (a floor it has not reached becomes 1)');
	S.stage = 26; S.guardians = 1;
	applyOps(Sv, DS.guardianOps(S));
	A(DS.stageOf(Sv, 'forest') === 26 && DS.sealOf(Sv, 'forest') && !DS.sealOf(Sv, 'reef'), 'a guardian beaten on floor 25: stage 26 and the route\'s Seal, kept at once', [Sv.c, Sv.s]);
	A(DS.starts(Sv, 'forest').join() === '1,26' && DS.startOf(Sv, 'forest', 26) === 26 && DS.startOf(Sv, 'forest', 51) === 1 && DS.startOf(Sv, 'forest', 12) === 1 && DS.startOf(Sv, 'reef', 26) === 1, 'now it may start on floor 26 of that route, and nowhere else');
	S.stage = 51; S.ended = true; S.lost = true; S.deepest = 52;
	applyOps(Sv, DS.recordOps(S, result(S), { dev: 'dv1' }));
	A(DS.stageOf(Sv, 'forest') === 51 && DS.starts(Sv, 'forest').join() === '1,26,51' && Sv.s['dive.seal'].length === 1, "the run's end writes them too (once: the same stage and Seal)", [Sv.c, Sv.s]);
	A(DS.routeOpen(Sv, 'forest', R.MAIN) && !DS.routeOpen(Sv, 'origin', R.MAIN), 'the Route of Origin is closed with one Seal');
	for (const r of R.MAIN) Sv.add('dive.seal', r);
	A(DS.routeOpen(Sv, 'origin', R.MAIN), '…and open with all 8');
}

// ---------------------------------------------------------------- why a Dive is not kept
{
	const Sv = save(), o = (member) => ({ L, Sv, base: null, main: R.MAIN, member });
	A(DS.missing(run(), o(4)) === null, 'a starter of the League, forest, floor 1: it can be kept');
	A(DS.missing(run({ dex: 149 }), o(147)) === 'member' && DS.missing(run(), o(0)) === 'member', 'a member the save does not have (or no member at all): not kept');
	Sv.add('league.own', 147);
	A(DS.missing(run({ dex: 149 }), o(147)) === null, '…kept once it is caught');
	A(DS.missing(run({ route: 'origin' }), o(4)) === 'route', 'the Route of Origin without the Seals: not kept');
	A(DS.missing(run({ start: 26 }), o(4)) === 'start', 'a start on floor 26 the save has not reached: not kept');
	Sv.best('dive.forest.stage', 26);
	A(DS.missing(run({ start: 26 }), o(4)) === null, '…kept once the stage is reached');
	A(Object.keys(DS.WHY).join() === 'practice,nosave,unclean,member,form,route,start' && Object.values(DS.WHY).every((t) => /nothing is saved\.$/.test(t)), 'every reason has its line, and each says nothing is saved');
}

// ---------------------------------------------------------------- the Seal in the run
{
	const plain = run(), sealed = run({ seal: true });
	const out = (S) => S.w.hooks.out(S.w, {}, { id: 'ember' }, 10), hurt = (S) => S.w.hooks.hurt(S.w, 100);
	A(out(plain) === 1 && Math.abs(out(sealed) - 1.1) < 1e-9, 'with the Seal: your damage x1.1', [out(plain), out(sealed)]);
	A(hurt(plain) === 100 && Math.abs(hurt(sealed) - 90) < 1e-9, '…and what you take x0.9', [hurt(plain), hurt(sealed)]);
	sealed.dodge.t = 0.1;
	A(hurt(sealed) === 0, 'a dodge still takes nothing');
	// the stage a run earns: its guardian falls
	const S = run({ start: 25 }); S.w.pl.maxHp = S.w.pl.hp = 1e9;
	A(!!S.boss && S.boss.xk === 'guardian' && S.stage === 0, 'floor 25 has the guardian');
	const e = S.boss; e.hp = 1e-6; e.shield = 0; e.poison = 1; e.poisonT = 1; e.poisonTick = 0;
	let ev = []; for (let i = 0; i < 120 && S.stage === 0; i++) { stepDive(S, noInput()); ev.push(...S.w.events); }
	A(S.stage === 26 && ev.some((q) => q.k === 'bossdown' && q.guardian) && DS.guardianOps(S).length === 2, 'when it falls the run has stage 26, and the page is told (it keeps it at once)', S.stage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
