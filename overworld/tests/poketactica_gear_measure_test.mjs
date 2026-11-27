// poketactica_gear_measure_test.mjs — THE ITEM WORLD's BALANCE, MEASURED (Plans/POKETACTICA_MODES_PLAN.md item I4;
// tools/poketactica/gear_measure.mjs). The numbers written down in the plans are pinned here: the sums exactly, and the
// one thing the measurement found (gemstones move a run far more than an item's level does) by one seed each.
// Pure: node only.   node overworld/tests/poketactica_gear_measure_test.mjs
import { loadData, autoRun } from '../../tools/poketactica/td_auto.mjs';
import { gearedSquad, sums, CASES } from '../../tools/poketactica/gear_measure.mjs';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import { battleStats } from '../../poketactica/js/figurine.js';
import { HELD } from '../../poketactica/js/goods.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();

// ---------- the sums, as written down
{
	const s = sums(), by = Object.fromEntries(s.map((x) => [x.lv, x]));
	A(s.map((x) => x.lv).join() === '1,25,50,75,100' && by[1].k === 1 && Math.abs(by[50].k - 1.99) < 0.01 && by[100].k === 3, 'an item\'s bonus: x1 at level 1, x1.99 at 50, x3 at 100');
	A(by[1].boost === 1.2 && by[25].boost === 1.3 && by[50].boost === 1.4 && by[75].boost === 1.5 && by[100].boost === 1.6, 'a type booster\'s moves: x1.2 at level 1, x1.6 at level 100 (a tenth more every 25 levels)', s.map((x) => x.boost));
	A(s.map((x) => x.slots).join() === '4,5,6,7,8', 'slots: 4 at level 1, 8 at level 100');
	const g = (lv, gl) => by[lv].gems.find((x) => x.g === gl);
	A(g(1, 100).all === 3 && g(100, 25).all === 2 && g(100, 50).all === 3 && g(100, 100).all === 5 && g(100, 100).half === 3, 'gemstones: 8 slots of Lv 100 in one stat is x5; half of them is x3; 4 slots of Lv 100 is x3', [g(100, 100), g(1, 100)]);
}
// ---------- the squads measured
{
	A(CASES.length === 8 && CASES[0][1] === 0 && CASES[CASES.length - 1][1] === 100 && CASES[CASES.length - 1][2] === 100, 'eight cases, from nothing held to a Lv 100 item full of Lv 100 gemstones');
	const none = gearedSquad(40, 12, data, 0, 0), one = gearedSquad(40, 12, data, 1, 0), top = gearedSquad(40, 12, data, 100, 100);
	A(none.every((f) => !f.held) && one.every((f) => f.held && HELD[f.held] && !f.gear) && top.every((f) => f.gear.lv === 100 && f.gear.gems.length === 8), 'nothing held; each its type\'s booster at level 1; each with 8 gemstones at level 100');
	const a = battleStats(none[0], data), b = battleStats(top[0], data);
	A(b.atk === a.atk * 3 && b.spa === a.spa * 3 && b.def === a.def && b.maxHP === a.maxHP, 'four Attack and four Sp. Atk gemstones at Lv 100: both stats x3, nothing else', [a.atk, b.atk, a.spa, b.spa]);
}
// ---------- what the measurement found, by one seed a case
{
	// (three seeds a case, added up: one seed alone swings by a wave or two)
	const map = tdMapById('td-loop'), run = (lv, gem) => [0, 1, 2].reduce((n, r) => n + autoRun('gear-' + r, map, gearedSquad(20, 12, data, lv, gem), data).wave, 0);
	const none = run(0, 0), item = run(100, 0), gems = run(100, 100);
	A(item >= none && item - none <= 12, `an item at Lv 100 with no gemstones gets a little further than nothing held (${none} -> ${item} waves over three runs)`, [none, item]);
	A(gems >= item + 6 && gems - item > item - none, `the same item full of Lv 100 gemstones gets much further (${item} -> ${gems} waves over three runs): gemstones are the larger part`, [item, gems]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
