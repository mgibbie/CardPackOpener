// poketactica_dungeon_records_test.mjs — THE DUNGEON'S RECORDS (Plans/POKETACTICA_MODES_PLAN.md item D5). It kept one
// number, the deepest boss beaten. Three more are kept (dungeon.js): the deepest floor cleared, the most floors in a row
// with nobody lost, and the fewest turns a boss floor was won in. They ride in the collection's record map, which is
// synced and merged "the higher wins", so the fastest boss is kept as 1000 − turns.
// Pure: node only.   node overworld/tests/poketactica_dungeon_records_test.mjs
import { dgRecords, noteFloor, recordSay, loadRun, saveRun, newRun, DG_FAR, DG_CLEAN, DG_QUICK, QUICK_BASE, RUN_KEY } from '../../poketactica/js/dungeon.js';
import { cleanFigs, merge3Figs, newFigs } from '../../poketactica/js/figcol.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra) : '')); } };
const J = JSON.stringify;

// ---------- nothing yet
{
	const c = newFigs();
	A(J(dgRecords(c)) === '{"far":0,"clean":0,"quick":0}' && J(dgRecords(null)) === '{"far":0,"clean":0,"quick":0}', 'a new collection has no record');
}
// ---------- a run, floor by floor
{
	let c = newFigs(), n;
	n = noteFloor(c, { floor: 1, clean: 1, turns: 4 }); c = n.col;
	A(J(n.news) === '["far","clean"]' && J(dgRecords(c)) === '{"far":1,"clean":1,"quick":0}', 'floor 1 cleared with nobody lost: the deepest floor and the streak are set (a plain floor sets no boss time)', [n.news, dgRecords(c)]);
	for (let f = 2; f <= 9; f++) c = noteFloor(c, { floor: f, clean: f, turns: 5 }).col;
	n = noteFloor(c, { floor: 10, clean: 0, turns: 7 }); c = n.col;
	A(J(n.news) === '["far","quick"]' && J(dgRecords(c)) === '{"far":10,"clean":9,"quick":7}', 'the floor 10 boss won on turn 7 with a figurine lost: deepest 10, fastest boss 7, the streak stays 9', [n.news, dgRecords(c)]);
	const same = noteFloor(c, { floor: 5, clean: 3, turns: 2 });
	A(same.col === c && same.news.length === 0, 'a floor that beats nothing changes nothing (the same collection object)');
	n = noteFloor(c, { floor: 10, clean: 1, turns: 9 });
	A(n.news.length === 0, 'the same boss, slower: no record');
	n = noteFloor(c, { floor: 20, clean: 2, turns: 4 }); c = n.col;
	A(J(n.news) === '["far","quick"]' && dgRecords(c).quick === 4 && dgRecords(c).far === 20, 'a later boss in 4 turns: the fastest boss is 4', dgRecords(c));
	A(recordSay('far', dgRecords(c)) === 'Deepest floor: 20' && recordSay('clean', dgRecords(c)) === 'Most floors in a row with nobody lost: 9' && recordSay('quick', dgRecords(c)) === 'Fastest boss: 4 turns' && recordSay('quick', { quick: 1 }) === 'Fastest boss: 1 turn', 'each is said in words');
	// ---------- they are kept with the collection, and the better one wins between two devices
	const kept = cleanFigs(JSON.parse(J(c)));
	A(J(dgRecords(kept)) === J(dgRecords(c)), 'a saved and loaded collection keeps them', [kept.td, c.td]);
	const other = noteFloor(noteFloor(newFigs(), { floor: 10, clean: 14, turns: 3 }).col, { floor: 12, clean: 14, turns: 0 }).col;
	const both = merge3Figs(newFigs(), c, other), r = dgRecords(both);
	A(r.far === 20 && r.clean === 14 && r.quick === 3, 'two devices: the deeper floor, the longer streak and the FASTER boss win (20, 14, 3 turns)', r);
	A(c.td[DG_FAR] === 20 && c.td[DG_CLEAN] === 9 && c.td[DG_QUICK] === QUICK_BASE - 4, '(kept as numbers where the higher is the better: the fastest boss as 1000 − turns)', c.td);
}
// ---------- the run remembers its streak between floors
{
	const mem = new Map(), LS = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
	saveRun({ ...newRun(3, 1000), clean: 5 }, LS);
	A(loadRun(LS).clean === 5 && loadRun(LS).floor === 3, 'a run saved with a streak of 5 is loaded with it');
	saveRun(newRun(1, 1000), LS);
	A(loadRun(LS).clean === undefined && J(Object.keys(loadRun(LS))) === '["seed","floor"]', 'a run with no streak is saved as it always was');
	mem.set(RUN_KEY, J({ seed: 'r1', floor: 2, clean: 'lots' }));
	A(loadRun(LS).clean === undefined, 'a streak that is not a number is dropped');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
