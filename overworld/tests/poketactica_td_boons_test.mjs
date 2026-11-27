// poketactica_td_boons_test.mjs — TOWER DEFENSE, THE ROAD's BOONS (Plans/POKETACTICA_MODES_PLAN.md item T4; rules 24).
// "The Road has slots and energy and no decisions between waves." Every third wave cleared on the Road offers one of
// three small boons.
// Pure: node only.   node overworld/tests/poketactica_td_boons_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import { TD_MAPS, MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import { loadData, squadAt, chooseOrders } from '../../tools/poketactica/td_auto.mjs';
import { slimFig } from '../../poketactica/js/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), squad = squadAt(40, 6, data).map(slimFig);
const run = (o = {}) => TD.newRun(o.seed || 'boon', { map: o.map || TD_MAPS[0], squad, ...(o.rev ? { rev: o.rev } : {}) }, data);
const ap = (S, a) => TD.applyInput(S, a, data);
const unit = (S, t) => S.B.units.find((u) => u.uid === t.uid);
/** Play with the auto-player until wave n is cleared (it never takes a boon). */
const playTo = (S, n, max = 60000) => { const evs = []; while (!S.over && S.cleared < n && S.tick < max) { if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) ap(S, a); TD.step(S, [], data); for (const e of S.ev) if (e.t === 'boons' || e.t === 'boon') evs.push({ ...e, at: S.cleared }); } return evs; };

// ---------- the list
{
	const ids = Object.keys(TD.BOONS);
	A(TD.TD_RULES_REV >= 24 && TD.BOON_REV === 24 && TD.BOON_EVERY === 3 && ids.join() === 'energy,lives,refill,quick,focus,toll', 'rules 24: six boons');
	A(ids.every((id) => TD.BOONS[id].name && TD.BOONS[id].text.length > 10) && new Set(ids.map((id) => TD.BOONS[id].name)).size === 6, 'each has a name of its own and says what it does');
	const seen = new Set(); let ok = true;
	for (let n = 3; n <= 300; n += 3) { const o = TD.boonsOf('s', n); if (o.length !== 3 || new Set(o).size !== 3 || !o.every((id) => TD.BOONS[id])) ok = false; o.forEach((id) => seen.add(id)); }
	A(ok && seen.size === 6 && JSON.stringify(TD.boonsOf('s', 6)) === JSON.stringify(TD.boonsOf('s', 6)) && JSON.stringify(TD.boonsOf('s', 6)) !== JSON.stringify(TD.boonsOf('s', 9)), 'an offer is three different boons, the same for the same run and wave; all six come up');
}
// ---------- when they are offered
{
	const S = run(), evs = playTo(S, 7);
	A(S.cleared >= 7 && evs.length === 1 && evs[0].t === 'boons' && evs[0].at === 3 && JSON.stringify(evs[0].ids) === JSON.stringify(TD.boonsOf('boon', 3)), 'the first offer comes when wave 3 is cleared', evs);
	A(JSON.stringify(S.boons) === JSON.stringify(TD.boonsOf('boon', 3)) && JSON.stringify(TD.view(S).boons) === JSON.stringify(S.boons), 'not taken, it waits: wave 6 made no new one (the view shows it)');
	const O = run({ rev: 23 }), evo = playTo(O, 4);
	A(O.cleared >= 4 && evo.length === 0 && !O.boons && TD.view(O).boons === null, 'a run recorded under rules 23 is never offered one');
	const M = TD.newRun('boonmz', { map: MAZE_MAPS[0], squad }, data);
	A(ap(M, { t: 'boon', i: 0 }) === 'no such boon' && !M.boons, 'Maze Builder has its own rewards: no boons there');
	A(ap(run(), { t: 'boon', i: 0 }) === 'no such boon', 'nothing to take before one is offered');
}
// ---------- what each does
{
	const give = (id, prep) => { const S = run(); playTo(S, 3); S.boons = [id, 'energy', 'lives'].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3); if (prep) prep(S); const before = { e: S.energy, l: S.lives, h: TD.hashOf(S) }; const why = ap(S, { t: 'boon', i: 0 }); return { S, before, why }; };
	const e = give('energy');
	A(e.why === null && e.S.energy === e.before.e + 15 && e.S.boons === null && TD.hashOf(e.S) !== e.before.h && e.S.boonLog.join() === 'energy', 'Spare Parts: 15 energy at once; the offer is gone; the run remembers what was taken');
	const l = give('lives', (S) => { S.lives = 10; }), l2 = give('lives', (S) => { S.lives = 19; });
	A(l.S.lives === 12 && l2.S.lives === 20, 'Patch Up: 2 lives back, 20 at most', [l.S.lives, l2.S.lives]);
	const r = give('refill', (S) => { for (const t of S.towers) unit(S, t).sp = 0; });
	A(r.S.towers.length > 0 && r.S.towers.every((t) => { const u = unit(r.S, t); return u.sp === u.maxSP; }), 'Second Wind: every figurine on the board has its SP filled');
	const q = give('quick'), f = give('focus'), t = give('toll');
	A(q.S.boon.cd === 4 && f.S.boon.sp === 15 && t.S.boon.wave === 2 && TD.view(q.S).boon.cd === 4, 'Drill, Deep Breath and Toll Gate are kept for the rest of the run');
	// kept boons add up; Drill stops at its limit
	const S = run(); playTo(S, 3);
	for (let k = 0; k < 8; k++) { S.boons = ['quick', 'toll', 'focus']; ap(S, { t: 'boon', i: 0 }); S.boons = ['toll', 'quick', 'focus']; ap(S, { t: 'boon', i: 0 }); }
	A(S.boon.cd === TD.BOON_CD_MAX && S.boon.wave === 16 && S.boonLog.length === 16, 'taken again they add up; Drill stops at 24%', S.boon);
	// Toll Gate pays every wave after: two runs alike but for it, each with an offer left waiting (so no new one is made)
	const a = run({ seed: 'toll' }), b = run({ seed: 'toll' });
	playTo(a, 3); playTo(b, 3);
	b.boon = { cd: 0, sp: 0, wave: 2 };
	const e0 = [a.energy, b.energy];
	// (from here nothing is spent: the next wave is only called, so the two differ by the toll alone)
	for (const S of [a, b]) while (!S.over && S.cleared < 5 && S.tick < 60000) { if (S.phase === 'wait') ap(S, { t: 'call' }); TD.step(S, [], data); }
	A(e0[0] === e0[1] && a.cleared === 5 && b.cleared === 5 && b.energy - a.energy === 4, 'Toll Gate: 2 more energy for each of the next two waves cleared', [a.energy, b.energy]);
}
// ---------- Drill is felt: the same run clears a wave with more moves made
{
	const cdOf = (S) => { const t = S.towers[0]; return t ? Math.max(...Object.values(t.cd || {}), 0) : 0; };
	const a = run({ seed: 'drill' }), b = run({ seed: 'drill' });
	playTo(a, 3); playTo(b, 3);
	b.boon = { cd: 24, sp: 0, wave: 0 };
	let ma = 0, mb = 0;
	for (let i = 0; i < 1200 && !a.over && !b.over; i++) {
		for (const S of [a, b]) { if (S.tick % 10 === 0) for (const o of chooseOrders(S, data)) ap(S, o); TD.step(S, [], data); }
		ma += a.ev.filter((e) => e.t === 'move' || e.t === 'attack' || e.t === 'use').length; mb += b.ev.filter((e) => e.t === 'move' || e.t === 'attack' || e.t === 'use').length;
	}
	A(TD.hashOf(a) !== TD.hashOf(b), 'a run with Drill at its limit is a different run from the same one without', [ma, mb, cdOf(a), cdOf(b)]);
}
// ---------- the same orders are the same run
{
	const mk = () => { const S = run({ seed: 'same' }); playTo(S, 3); ap(S, { t: 'boon', i: 1 }); playTo(S, 5); return S; };
	A(TD.hashOf(mk()) === TD.hashOf(mk()), 'the same seed and the same boon taken are the same run');
	const S = mk(), T2 = TD.fromSnapshot(TD.toSnapshot(S));
	A(TD.hashOf(T2) === TD.hashOf(S) && JSON.stringify(T2.boon) === JSON.stringify(S.boon), 'a snapshot keeps the boons');
}
// ---------- the page
{
	const md = fs.readFileSync(path.join(ROOT, 'poketactica/js/tdmode.js'), 'utf8');
	A(/data-act="boon"/.test(md) && /dataset\.act === 'boon'\) openBoon\(\)/.test(md) && /order\(\{ t: 'boon', i \}\)/.test(md) && /Pick your boon/.test(md), 'the Road shows a Boon button while an offer waits, the field menu has it too, and picking sends the order');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
