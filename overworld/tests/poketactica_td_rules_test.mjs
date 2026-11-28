// poketactica_td_rules_test.mjs — TOWER DEFENSE, THREE MORE ROAD MAPS, EACH WITH A RULE (Plans/POKETACTICA_MODES_PLAN.md
// item T1; rules 25). "Maze Builder got six maps; the Road still has three."
//   Forked Road     one gate, a road that splits in two and joins again
//   Broken Bridge   the bridge can be cut for a wave: that wave goes the long way round
//   Fallback Line   the base moves back to the end of the road when lives fall to 10, once
// Pure: node only.   node overworld/tests/poketactica_td_rules_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import { TD_MAPS, tdMapById } from '../../poketactica/js/td/maps.js';
import { buildMap } from '../../poketactica/js/campaign.js';
import { loadData, squadAt, chooseOrders } from '../../tools/poketactica/td_auto.mjs';
import { slimFig } from '../../poketactica/js/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), squad = squadAt(30, 6, data).map(slimFig);
const run = (id, seed = 'rule') => TD.newRun(seed, { map: tdMapById(id), squad }, data);
const ap = (S, a) => TD.applyInput(S, a, data);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
/** One wave with nobody placed: called, then stepped until it is over. -> { leaks: [{ tick }], gates: [gate of each enemy spawned], evs } */
function wave(S, max = 20 * 400) {
	const out = { leaks: [], gates: [], evs: [] };
	ap(S, { t: 'call' });
	const seen = new Set(), n0 = S.cleared;
	for (let i = 0; i < max && !S.over && S.cleared === n0; i++) {
		TD.step(S, [], data);
		for (const e of S.enemies) if (!seen.has(e.uid)) { seen.add(e.uid); out.gates.push(e.gate); }
		for (const e of S.ev) { if (e.t === 'leak') out.leaks.push({ tick: S.tick - S.waveStart, lives: e.lives }); out.evs.push(e.t); }
	}
	return out;
}

// ---------- the three maps
{
	const more = TD_MAPS.slice(3);
	A(TD.TD_RULES_REV >= 25 && TD_MAPS.length === 6 && more.map((m) => m.id).join() === 'td-fork,td-bridge,td-retreat' && more.map((m) => m.rule.k).join() === 'fork,bridge,fallback' && TD_MAPS.slice(0, 3).every((m) => !m.rule), 'rules 25: three more Road maps, each with a rule; the first three have none');
	A(more.every((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] })).length === 0 && m.name && m.tip.length > 60 && m.paths.every((p) => p.every(([x, y]) => m.ground[y][x] === 'd' && m.rows[y][x] === '.'))), 'each is a sound map: its road on flat dirt, ending at the base, with a tip that says its rule', more.map((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] }))));
	A(new Set(TD_MAPS.map((m) => m.name)).size === 6, 'no two Road maps share a name');
	A(more.every((m) => typeof m.rule.say === 'string' && m.rule.say.length > 3), 'each rule has a word or two to show on the map list (as a Maze Builder map has)');
	A(TD.ruleOf(run('td-loop')) === null && TD.view(run('td-loop')).rule === null && TD.bridgeOf(run('td-loop')) === null && TD.holdBack(run('td-loop')) === 0, 'a map without a rule has none of this');
}
// ---------- the fork
{
	const m = tdMapById('td-fork'), [a, b] = m.paths;
	let i = 0; while (same(a[i], b[i])) i++;
	let j = 1; while (same(a[a.length - j], b[b.length - j])) j++;
	A(m.paths.length === 2 && same(a[0], b[0]) && same(a[a.length - 1], b[b.length - 1]) && i >= 3 && j >= 3 && a.length - i - j > 8 && b.length - i - j > 8, `one gate and one base; the two ways share their first ${i} and last ${j - 1} tiles and part between`);
	const S = run('td-fork'); let both = new Set();
	for (let k = 0; k < 3 && !S.over; k++) wave(S).gates.forEach((g) => both.add(g));
	A(both.size === 2, 'the enemies come by both branches');
}
// ---------- the bridge
{
	const m = tdMapById('td-bridge');
	A(m.paths[1].length > m.paths[0].length + 6 && m.rule.every === 4, `the long way round is ${m.paths[1].length - m.paths[0].length} tiles longer than the bridge`);
	const S = run('td-bridge');
	let b = TD.bridgeOf(S);
	A(b.can && !b.on && b.wait === 0 && TD.view(S).bridge.can, 'before the first wave the bridge may be cut');
	const w1 = wave(run('td-bridge'));
	A(w1.gates.length > 0 && w1.gates.every((g) => g === 0), 'left whole, every enemy takes the bridge');
	A(ap(S, { t: 'cut' }) === null && TD.bridgeOf(S).on && !TD.bridgeOf(S).can && ap(S, { t: 'cut' }) === 'the bridge is cut already', 'cut: it is cut for the wave to come, and cannot be cut twice');
	const c1 = wave(S);
	A(c1.gates.length === w1.gates.length && c1.gates.every((g) => g === 1) && c1.leaks.length > 0 && w1.leaks.length > 0 && c1.leaks[0].tick > w1.leaks[0].tick * 1.2, `that wave goes the long way round: its first enemy reaches the base at tick ${c1.leaks[0] && c1.leaks[0].tick}, not ${w1.leaks[0] && w1.leaks[0].tick}`, [c1.gates.slice(0, 4), c1.leaks[0], w1.leaks[0]]);
	b = TD.bridgeOf(S);
	A(!b.on && !b.can && b.wait === 3 && ap(S, { t: 'cut' }) === 'the bridge is still being mended', 'after it the bridge is mended: 3 more waves before it can be cut again', b);
	const w2 = wave(S);
	A(w2.gates.every((g) => g === 0), 'the next wave is back over the bridge');
	S.lives = 999; wave(S); wave(S);
	A(TD.bridgeOf(S).can && ap(S, { t: 'cut' }) === null, 'four waves on it may be cut again');
	const T2 = run('td-bridge'); ap(T2, { t: 'call' }); TD.step(T2, [], data);
	A(ap(T2, { t: 'cut' }) === 'not during a wave' && ap(run('td-loop'), { t: 'cut' }) === 'no bridge here', 'not during a wave, and not on a map with no bridge');
	// the wave to come is one list whichever way it goes
	A(TD.waveFor(S, 9, data).every((w) => w.gate === 0), 'a wave is made for one road (the cut only turns it)');
}
// ---------- the base that moves back
{
	const m = tdMapById('td-retreat'), p = m.paths[0], S = run('td-retreat');
	A(TD.holdBack(S) === 11 && same(TD.baseNow(S), p[p.length - 12]) && same(TD.view(S).baseAt, p[p.length - 12]) && !TD.view(S).fell, 'the base stands 11 tiles short of the end of the road');
	const w1 = wave(S), t1 = w1.leaks[0].tick;
	A(w1.leaks.length > 0 && !S.fell && S.lives > 10, 'the first leaks cost lives at the forward base');
	S.lives = 11;
	const w2 = wave(S);
	A(S.fell === 1 && w2.evs.filter((e) => e === 'fallback').length === 1 && TD.holdBack(S) === 0 && same(TD.baseNow(S), p[p.length - 1]) && TD.view(S).fell, 'lives fall to 10: the base moves back to the end of the road, once');
	S.lives = 999;
	const w3 = wave(S);
	// (the same first wave, with the base already back: the same enemies, further to walk)
	const F = run('td-retreat'); F.fell = 1; const wf = wave(F);
	A(wf.leaks.length > 0 && wf.leaks[0].tick > t1 * 1.3 && w3.leaks.length > 0 && !w3.evs.includes('fallback'), `now the enemies have further to walk (the first wave's first enemy reaches the base at tick ${wf.leaks[0] && wf.leaks[0].tick}, not ${t1}); it does not move again`, [t1, wf.leaks[0]]);
	// a boss that takes the last lives does not move it
	const Z = run('td-retreat'); Z.lives = 1; wave(Z);
	A(Z.over && !Z.fell, 'a run that ends does not move its base');
}
// ---------- the same orders are the same run; a snapshot keeps the rule's state
{
	const mk = () => { const S = run('td-bridge', 'same'); ap(S, { t: 'cut' }); for (let i = 0; i < 1500 && !S.over; i++) { if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) ap(S, a); TD.step(S, [], data); } return S; };
	const a = mk(), b = mk();
	A(TD.hashOf(a) === TD.hashOf(b), 'the same seed and the same cut are the same run');
	const whole = run('td-bridge', 'same'); for (let i = 0; i < 1500 && !whole.over; i++) { if (whole.tick % 10 === 0) for (const o of chooseOrders(whole, data)) ap(whole, o); TD.step(whole, [], data); }
	A(TD.hashOf(whole) !== TD.hashOf(a), 'and a different run from the one that left the bridge whole');
	const c = TD.fromSnapshot(TD.toSnapshot(a));
	A(TD.hashOf(c) === TD.hashOf(a) && c.cutLast === a.cutLast && c.rule.k === 'bridge', 'a snapshot keeps it');
}
// ---------- the page
{
	const md = fs.readFileSync(path.join(ROOT, 'poketactica/js/tdmode.js'), 'utf8');
	A(/Cut the bridge/.test(md) && /order\(\{ t: 'cut' \}\)/.test(md) && /The bridge is cut: the long way round/.test(md), 'the field menu cuts the bridge, and the wave to come says which way it goes');
	A(/function ruleMarks/.test(md) && /sub: 'branch'/.test(md) && /base · moves back at/.test(md) && /Your base moves back to the end of the road!/.test(md), 'the board marks the branches, the bridge and where the base stands; the base moving back is said');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
