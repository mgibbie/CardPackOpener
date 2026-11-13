// micasurvivor_m3d_dive_yours_test.mjs — MicaSurvivor 3D, Dive part 12 (Plans/MICASURVIVOR_3D_PLAN.md §5.65): what your
// save brings to a Dive, as to an Expedition (micasurvivor/m3d/dive.js o.form / o.perks / o.meta / o.shiny), in node.
//   * the starting form: a later stage of the family, its body and stats from the start, with the kit of three; it is
//     kept only if you have reached that form
//   * the family's bought upgrades: HP, attack, a reroll, a second chance
//   * the Lab: its stats on you, its tools, a Max Revive to start with, the Rare Candy's two levels, locked items left out
//   * without them a Dive is as before
//   node overworld/tests/micasurvivor_m3d_dive_yours_test.mjs
import { rulesFrom, newDive, stepDive, result } from '../../micasurvivor/m3d/dive.js';
import * as DS from '../../micasurvivor/m3d/divesave.js';
import { noMeta } from '../../micasurvivor/m3d/expmeta.js';
import { rollOffers } from '../../micasurvivor/m3d/expeco.js';
import { dataFrom, choose } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), LG = X.G, M = LG.BY[4];
const run = (o = {}) => newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, league: true, ...o });
const ids = (S) => S.w.pl.moves.map((m) => m.id);
const plain = run(), p0 = plain.w.pl;

// ---------------------------------------------------------------- the starting form
{
	const S = run({ form: 5 }), pl = S.w.pl, st = LG.statsOf(5);
	A(S.lg.member === 4 && S.lg.form === 5 && S.lg.start === 5 && pl.mon.dex === 5 && S.lg.evo === 0, 'a Dive started as Charmeleon: that stage from the start (not an evolution of this run)', [S.lg.form, S.lg.start, pl.mon.dex]);
	A(pl.maxHp === st.hp && pl.hp === pl.maxHp && pl.maxHp > p0.maxHp && pl.baseAtk === st.atk, "its HP and attack are that stage's", [pl.maxHp, st.hp, p0.maxHp]);
	A(ids(S).join() === M.kit.slice(0, 3).join() && pl.moves[1].xman && pl.moves[2].xman && pl.moves.every((m) => m.xk === LG.factorOf(m.id, S.lg.st)), "with the kit of three, at that stage's factors", ids(S));
	A(result(S).parts.form === 5 && result(S).parts.evos === 0, "the result names the form");
	const bad = run({ form: 25 });
	A(bad.lg.form === 4 && !bad.lg.start, 'a form of another family is ignored');
	// kept only if the form is yours
	const c = {}, s = {}, Sv = { get: (k) => c[k] || 0, has: (k, v) => !!(s[k] && s[k].includes(String(v))) };
	const o = { L: { free: (m) => m === 4, FAM: { 5: 4, 6: 4 }, BY: { 4: {} } }, Sv, base: null, main: R.MAIN, member: 4 };
	A(DS.missing(S, o) === 'form' && /not reached this form/.test(DS.WHY.form), 'a form you have not reached: the Dive is not kept, and its end says so');
	s['league.form'] = ['5'];
	A(DS.missing(S, o) === null && DS.missing(plain, o) === null, '…kept once the form is yours');
	A(DS.unfairDive([['dive', '7'], ['route', 'forest'], ['dex', '4'], ['form', '5']]) === null, 'form is a fair parameter of the address');
}
// ---------------------------------------------------------------- the family's upgrades
{
	const S = run({ perks: { hp: 30, atkMul: 1.2, rerolls: 2, revives: 1 } }), pl = S.w.pl;
	A(pl.maxHp === p0.maxHp + 30 && pl.hp === pl.maxHp && near(pl.atkMul, p0.atkMul * 1.2), 'the upgrades bought for the family: +30 HP and x1.2 attack', [pl.maxHp, p0.maxHp, pl.atkMul, p0.atkMul]);
	A(S.lv.refreshes === plain.lv.refreshes + 2, '…two more rerolls', [S.lv.refreshes, plain.lv.refreshes]);
	S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9;
	pl.hp = 0; pl.dead = false;
	const hook = S.w.hooks.ko;
	A(typeof hook === 'function' && hook(S.w) === true && pl.hp === pl.maxHp && S.up.revives === 0 && hook(S.w) === false, '…and a second chance, once');
}
// ---------------------------------------------------------------- the Lab
{
	const meta = noMeta(); meta.eff.stats = { dmg: 0.25 }; meta.eff.lab = { refresh: 1, revive: 1 }; meta.candy = true;
	const locked = X.L.I.ITEMS.find((it) => it.id !== 'maxrevive'); meta.excl = new Set([locked.id]);
	const S = run({ meta }), pl = S.w.pl;
	A(S.meta === meta && pl.xperk && pl.xperk.dmg === 0.25, "the Lab's stats are on you (+25 % damage, summed with your items')", pl.xperk);
	A(S.lv.refreshes === plain.lv.refreshes + 1, "its tools: one more reroll");
	A(X.L.I.has(pl, 'maxrevive'), 'a Max Revive to start with');
	A(meta.candy === false && (pl.level + pl.pending >= 3 || pl.level >= 3), "the Rare Candy: two levels at once", [pl.level, pl.pending]);
	let seen = false; for (let i = 0; i < 400 && !seen; i++) { let r = i * 7919 + 1; const rng = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; }; if (rollOffers(S, rng, 3, 0).includes(locked.id)) seen = true; }
	A(!seen, `an item you have not unlocked (${locked.id}) is never offered, by a level or by a chest`);
	// it plays
	S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9;
	for (let i = 0; i < 240; i++) { if (pl.choices) choose(S.w, 0); stepDive(S, noInput()); }
	A(!S.ended && pl.level >= 3, 'and the Dive plays on from level 3', pl.level);
}
// ---------------------------------------------------------------- shiny, and none of it
{
	A(run({ shiny: true }).lg.shiny === true && plain.lg.shiny === false, 'your shiny plays shiny (its look)');
	A(plain.meta === null && !plain.up && !p0.xperk && !X.L.I.has(p0, 'maxrevive') && p0.level === 1, 'without them a Dive is as before');
	const N = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, levels: false, meta: noMeta(), moves: ['ember'] });
	A(N.meta === null, 'a Dive with the base game\'s levels takes nothing from the Lab');
}

// ---------------------------------------------------------------- (part 13) research, the counters, the tasks
{
	const { applyOps } = await import('../../micasurvivor/m3d/expsave.js');
	const { researchOf } = await import('../../micasurvivor/m3d/expmeta.js');
	const { addEnemy } = await import('../../micasurvivor/m3d/combat.js');
	const meta = noMeta(), S = run({ meta }), pl = S.w.pl;
	S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; pl.maxHp = pl.hp = 1e9;
	const fam = Object.keys(LG.FAM).map(Number).find((d) => LG.FAM[d] && data.mon(d));
	for (let i = 0; i < 3; i++) { const e = addEnemy(S.w, fam, pl.s.x + 3, pl.s.z, { t: 0, ti: 0 }); e.dummy = true; e.hp = 1e-6; e.poison = 1; e.poisonT = 1; e.poisonTick = 0; }
	for (let i = 0; i < 90; i++) { if (pl.choices) choose(S.w, 0); stepDive(S, noInput()); }
	const rs = researchOf(S);
	A(S.kills === 3 && rs.length === 1 && rs[0][0] === LG.FAM[fam] && rs[0][1] === 3 * meta.RS.ko, `three KOs of a League family: its research (3 x ${meta.RS.ko})`, [S.kills, rs]);
	A(researchOf(plain).length === 0, 'a Dive that cannot be kept (no Lab row) earns none');
	S.ended = true; S.lost = true;
	const c = {}, s = {}, Sv = { get: (k) => c[k] || 0, has: () => false, bump: (k, n) => { c[k] = (c[k] || 0) + n; }, best: (k, v) => { c[k] = Math.max(c[k] || 0, v); }, add: (k, v) => { (s[k] = s[k] || []).push(String(v)); }, commit: () => {} };
	const res = result(S);
	applyOps(Sv, DS.recordOps(S, res, { dev: 'dv1', research: rs, seen: 4, final: false }));
	A(c['rs.' + LG.FAM[fam]] === 3 * meta.RS.ko, 'the save gets the research');
	A(c['m3d.t.dv1.runs'] === 1 && c['m3d.t.dv1.kos'] === 3 && (c['m3d.t.dv1.secs'] || 0) === res.parts.time && c['m3d.x.dv1.zone'] === 5 * 1e6 + 1 && !c['m3d.t.dv1.finals'], "the tasks' metrics of the run are left for the 2D game to count (a run, its KOs, its time, its zone)", c);
	A(c['lv.cards'] === S.lv.log.filter((q) => ['up', 'new', 'vit', 'swap'].includes(q[1])).length || (!c['lv.cards'] && !S.lv.log.some((q) => ['up', 'new', 'vit', 'swap'].includes(q[1]))), "the level-ups' counters too");
	const o2 = DS.recordOps(S, res, { dev: 'dv1', final: true });
	A(o2.some((q) => q[1] === 'm3d.t.dv1.finals' && q[2] === 1), "a Dive ended at its line's last stage counts as one");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
