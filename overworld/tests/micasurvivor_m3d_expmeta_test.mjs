// micasurvivor_m3d_expmeta_test.mjs — MicaSurvivor 3D, going live (Plans/MICASURVIVOR_3D_PLAN.md §5.42): what the Lab
// gives a 3D run (micasurvivor/m3d/expmeta.js), in node, with the 2D game's OWN Lab (js/expedition/meta.js) and save
// (save.js) run as they are.
//   * a new save's run has nothing of the Lab; the 25 items the Lab sells are out of its pool until bought
//   * the Lab's levels: + Refresh / Skip / Banish, + vitamin slots, a fourth card, a Max Revive, a third Support
//     Alpha slot, the Archive
//   * the shiny perks: luck, XP, the Shiny Charm, damage; and your League's shiny member
//   * the boosts armed and owned are spent when the run starts, once: Rare Candy, Lucky Egg, Amulet Coin, Honey,
//     Dawn Stone, Master Ball
//   * a run without a row (a practice run) has none of it, and spends nothing
//   node overworld/tests/micasurvivor_m3d_expmeta_test.mjs
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { total, vitSlots, offerCards, rollItem } from '../../micasurvivor/m3d/explevel.js';
import { slotsMax } from '../../micasurvivor/m3d/expcap.js';
import { deviceId } from '../../micasurvivor/m3d/expsave.js';
import { metaFor, spendBoosts, noMeta, lab, excluded, boost } from '../../micasurvivor/m3d/expmeta.js';
import { rng as makeRng } from '../../micasurvivor/m3d/gen.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
/** The 2D game with its save and its Lab, over a store of this test's. */
async function game() {
	const store = new Map(), ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
	const G = loadG(['systems/expedition.js', 'expedition/save.js', 'expedition/meta.js'], { localStorage: ls });
	await G.ExpSave.open();
	return { G, ls, store, M: G.ExpMeta, Sv: G.ExpSave, data: dataFrom(G), X: expFrom(G), dev: deviceId(ls, G.ExpSave.who, globalThis.crypto) };
}
const mk = (q, meta, o = {}) => { const S = newRun(q.data, q.X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, meta, ...o }); S.plan.events = []; S.acc = -1e9; return S; };
const step = (S, n = 1) => { for (let i = 0; i < n; i++) { S.acc = -1e9; stepRun(S, null); } };

// ---------------------------------------------------------------- a new save
{
	const q = await game(), { M, Sv } = q, m = metaFor(M, { Sv, member: 4, boosts: [] });
	A(Object.values(m.eff.lab).every((n) => n === 0) && Object.keys(m.eff.stats).length === 0 && Object.keys(m.eff.boosts).length === 0 && !m.eff.charm && !m.master && !m.candy, 'a new save\'s run has nothing of the Lab');
	const sells = M.UNLOCKS.map((u) => u.id);
	A(sells.length === 25 && sells.every((id) => m.excl.has(id)) && m.excl.size === 25, 'the 25 items the Lab sells are out of its pool until they are bought', [sells.length, m.excl.size]);
	const S = mk(q, m), P = mk(q, null), K = q.X.L.K;
	A(S.lv.refreshes === K.REFRESH && S.lv.skips === K.SKIP && S.lv.bans === K.BANISH && vitSlots(S) === 3 && slotsMax(S) === 2 && offerCards(S).length === 3 && !S.w.pl.xi.maxrevive, 'the run is the plain one: its tools, three vitamin slots, two Support Alphas, three cards');
	// a thousand items rolled: none of the 25
	S.w.pl.xluck = 400; P.w.pl.xluck = 400;   // (lucky: the rarer items are rolled too)
	let got = new Set(); for (let i = 0; i < 2000; i++) got.add(rollItem(S, makeRng(1000 + i)));
	let any = new Set(); for (let i = 0; i < 2000; i++) any.add(rollItem(P, makeRng(1000 + i)));
	A(got.size > 10 && ![...got].some((id) => sells.includes(id)) && [...any].some((id) => sells.includes(id)) && !excluded(P, sells[0]) && excluded(S, sells[0]), `2,000 items rolled in it: ${got.size} kinds, none of the 25 (a practice run, which has no row, rolls them: ${[...any].filter((id) => sells.includes(id)).length} of them)`);
}
// ---------------------------------------------------------------- the Lab's levels, the items bought, the Archive
{
	const q = await game(), { M, Sv } = q;
	for (const [id, n] of [['refresh', 2], ['skip', 1], ['banish', 3], ['vitamins', 2], ['option', 1], ['revive', 1], ['support', 1], ['archive', 1], ['training', 5]]) Sv.bump('lab.' + id, n);
	Sv.add('items.bought', 'scopelens'); Sv.add('items.bought', 'maxrevive');
	const arc = M.toggleArchive('leftovers', true);
	const m = metaFor(M, { Sv, member: 4, boosts: [] }), S = mk(q, m), K = q.X.L.K;
	A(lab(S, 'refresh') === 2 && S.lv.refreshes === K.REFRESH + 2 && S.lv.skips === K.SKIP + 1 && S.lv.bans === K.BANISH + 3, `the Lab's levels: + 2 Refresh, + 1 Skip, + 3 Banish (${S.lv.refreshes} / ${S.lv.skips} / ${S.lv.bans})`);
	A(vitSlots(S) === 5 && offerCards(S).length === 4 && slotsMax(S) === 3 && S.w.pl.xi.maxrevive === 1, 'two more vitamin slots, a fourth card at each level, a third Support Alpha slot, and a Max Revive to start with', [vitSlots(S), offerCards(S).length, slotsMax(S), S.w.pl.xi]);
	A(arc.ok && !m.excl.has('scopelens') && m.excl.has('widelens') && m.excl.has('leftovers') && m.excl.size === 24, 'an item bought is in the pool again; one archived is out of it', [arc, m.excl.size]);
	A(m.eff.lab.training === 0 && !('dmg' in m.eff.stats), 'a retired Lab row (Training) does nothing in a run, as in the 2D game');
	const cards = (() => { const seen = new Set(); for (let i = 0; i < 60; i++) { S.lv.draw = i; for (const c of offerCards(S)) seen.add(c.key); } return seen; })();
	A(cards.size > 4, 'its level-ups offer their cards as before (four at a time)');
}
// ---------------------------------------------------------------- the shiny perks
{
	const q = await game(), { M, Sv } = q;
	for (const d of [1, 4, 7, 10, 13, 16, 19, 21, 23, 25]) Sv.add('shiny.caught', String(d));   // (ten shinies: four perks)
	Sv.add('league.shiny', '4');
	const m = metaFor(M, { Sv, member: 4, boosts: [] }), other = metaFor(M, { Sv, member: 7, boosts: [] });
	A(m.eff.perk === 4 && m.eff.stats.luck === 3 && near(m.eff.stats.xp, 0.04) && m.eff.charm && near(m.eff.stats.dmg, 0.03) && m.row[3] === 1 && other.row[3] === 0, 'ten shinies caught: + 3 luck, + 4 % XP, a Shiny Charm every run, + 3 % damage; the row knows your member has its shiny', m.eff);
	const S = mk(q, m), P = mk(q, null);
	A(near(total(S, 'luck') - total(P, 'luck'), 3) && near(total(S, 'xp') - total(P, 'xp'), 0.04) && near(total(S, 'dmg') - total(P, 'dmg'), 0.03), 'the run has them: its luck, its XP and its damage are that much more than a run without a row');
	step(S); step(P);
	A(near(S.cap.zplan.p, q.X.C.shinyChance(S.w.pl.xluck || 0, true)) && S.cap.zplan.p > P.cap.zplan.p, `the Shiny Charm: a zone's shiny chance is ${(S.cap.zplan.p * 100).toFixed(1)} % (without: ${(P.cap.zplan.p * 100).toFixed(1)} %)`);
	for (const d of [27, 29, 32, 35, 37]) Sv.add('shiny.caught', String(d));   // (fifteen: the fifth perk, for your shiny member)
	const m15 = metaFor(M, { Sv, member: 4, boosts: [] }), o15 = metaFor(M, { Sv, member: 7, boosts: [] });
	A(m15.eff.perk === 5 && near(m15.eff.stats.dmg, 0.23) && near(o15.eff.stats.dmg, 0.03), 'fifteen: + 20 % damage more as your League\'s shiny member (another member does not have it)');
}
// ---------------------------------------------------------------- the boosts
{
	const q = await game(), { M, Sv, ls, dev } = q;
	for (const id of ['candy', 'egg', 'coin', 'honey', 'dawn', 'master']) M.giveBoost(id, 1);
	M.giveBoost('egg', 1);
	for (const id of ['candy', 'egg', 'coin', 'honey', 'dawn', 'master']) M.arm(id, true);
	A(M.armed().length === 6 && M.boostHave('egg') === 2, 'six boosts armed for the next run (two Lucky Eggs owned)');
	const none = mk(q, null);
	A(M.armed().length === 6 && M.boostHave('master') === 1 && !boost(none, 'egg'), 'a practice run (no row) has none of them and spends none');
	const used = spendBoosts(M, Sv, dev, ls);
	A(used.length === 6 && M.armed().length === 0 && M.boostHave('egg') === 1 && ['candy', 'coin', 'honey', 'dawn', 'master'].every((id) => M.boostHave(id) === 0) && Sv.get('bu.egg.' + dev) === 1, 'the run starts: each is spent (the 2D game\'s keys), one of the two Lucky Eggs, and the arming is cleared');
	A(spendBoosts(M, Sv, dev, ls).length === 0 && M.boostHave('egg') === 1, 'nothing is spent twice');
	const m = metaFor(M, { Sv, member: 4, boosts: used }), S = mk(q, m), P = mk(q, null), pl = S.w.pl;
	A(near(m.eff.stats.xp, 0.25) && near(m.eff.stats.coin, 0.5) && near(total(S, 'xp') - total(P, 'xp'), 0.25) && near(total(S, 'coin') - total(P, 'coin'), 0.5), 'Lucky Egg: + 25 % XP; Amulet Coin: + 50 % money');
	A(pl.level === P.w.pl.level + 2 && pl.pending >= 1 && !S.meta.candy, `Rare Candy: two levels to start with (Lv ${pl.level}, its cards waiting)`, [pl.level, pl.pending]);
	step(S, 3);
	A(S.cap.zplan.shiny && !P.cap.zplan, 'Dawn Stone: zone 1 has a shiny') || 0;
	// the Master Ball: the first wild thing faints at once; the second does not
	setZoneTime(S, S.cap.zplan.shiny.at); step(S, 6);
	const sh = S.w.enemies.find((e) => e.xk === 'shiny') || S.cap.faint.find((f) => f.kind === 'shiny');
	A(sh && (S.cap.faint.some((f) => f.kind === 'shiny') || sh.hp <= 1) && !S.meta.master && S.says !== null, 'Master Ball: the run\'s first shiny (or wild League member) faints at once, and the ball is used', sh && [sh.hp, S.cap.faint.length]);
	// Honey: an extra alpha in the zone
	const H = mk(q, metaFor(M, { Sv, member: 4, boosts: ['honey'] })); step(H);
	const before = H.w.enemies.filter((e) => e.xk === 'alpha').length;
	setZoneTime(H, m.honeyAt[1] + 1); let said = []; for (let i = 0; i < 20; i++) { step(H); said.push(...H.says.map((s) => s.text)); }
	A(H.cap.honey[1] && H.w.enemies.filter((e) => e.xk === 'alpha').length === before + 1 && said.some((t) => /^Honey: an alpha .+ appears!$/.test(t)), 'Honey: an extra alpha comes into the zone (between 200 and 300 s in), once', said.slice(0, 3));
	for (let i = 0; i < 30; i++) step(H);
	A(H.w.enemies.filter((e) => e.xk === 'alpha').length === before + 1, 'and only one');
}
// ---------------------------------------------------------------- no row
{
	const q = await game(), z = noMeta(), S = mk(q, z);
	A(z.excl.size === 0 && !z.master && S.lv.refreshes === q.X.L.K.REFRESH && vitSlots(S) === 3, 'a run given an empty row is the plain run');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
