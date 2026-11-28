// poketactica_made_td_test.mjs — THE MAP MAKER: MAZE BUILDER AND ROAD MAPS (Plans/POKETACTICA_MODES_PLAN.md item K1). "It
// makes battle maps only." A made map may carry Tower Defense marks (1-3 gates and a base); it is then played as a Maze
// Builder map, and, with a road painted in Dirt from every gate to the base, as a Road map. Practice only.
// Pure: node only.   node overworld/tests/poketactica_made_td_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as E from '../../poketactica/js/editor.js';
import * as TD from '../../poketactica/js/td/sim.js';
import { buildMap } from '../../poketactica/js/campaign.js';
import { tdRecipe, validTdRecipe, tdNewRun, tdMapOf, tdRunTo } from '../../poketactica/js/td/replay.js';
import { loadData, squadAt, chooseOrders } from '../../tools/poketactica/td_auto.mjs';
import { slimFig } from '../../poketactica/js/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), squad = squadAt(20, 6, data).map(slimFig);
const tool = (m, t, x, y, opt) => E.apply(m, t, x, y, opt);
/** A 12 by 8 map with a gate on the left edge and the base on the right, and (road: true) a road of Dirt along row 4. */
function made({ road = false } = {}) {
	let m = E.newMap('Test TD', 12, 8);
	m = tool(m, 'tdgate', 0, 4).map; m = tool(m, 'tdbase', 11, 4).map;
	if (road) for (let x = 1; x <= 10; x++) m = tool(m, 'ground', x, 4, { ground: 'd' }).map;
	return m;
}

// ---------- the tools
{
	A(E.TOOLS.map((t) => t.id).join() === 'raise,lower,ground,geo,foe,seat,tdgate,tdbase' && E.MAX_GATES === 3, 'two more tools: a Tower Defense gate and a base (the six there were keep their places)');
	let m = E.newMap('T', 8, 8);
	A(!m.td && E.tdOf(m).gates.length === 0 && E.tdOf(m).base === null, 'a new map has no Tower Defense marks');
	const g = tool(m, 'tdgate', 0, 3); m = g.map;
	A(!g.why && m.td.gates.length === 1 && m.td.gates[0].join() === '0,3', 'a gate is placed');
	A(tool(m, 'tdbase', 0, 3).why === 'a gate is there' && tool(tool(m, 'tdbase', 7, 3).map, 'tdgate', 7, 3).why === 'the base is there', 'the base and a gate cannot share a tile');
	const hill = tool(m, 'raise', 5, 5).map;
	A(tool(hill, 'tdgate', 5, 5).why === 'a gate needs flat ground' && tool(hill, 'tdbase', 5, 5).why === 'the base needs flat ground', 'both need flat ground');
	let four = m; for (const y of [0, 1]) four = tool(four, 'tdgate', 7, y).map;
	A(four.td.gates.length === 3 && tool(four, 'tdgate', 7, 5).why === '3 gates at most', 'three gates at most');
	A(!tool(m, 'tdgate', 0, 3).map.td, 'Z on a gate again takes it away (and with nothing left the marks are gone)');
	const b = tool(m, 'tdbase', 7, 3).map;
	A(b.td.base.join() === '7,3' && tool(b, 'tdbase', 2, 2).map.td.base.join() === '2,2' && !tool(b, 'tdbase', 7, 3).map.td.base, 'the base is set, moved by setting it elsewhere, and removed by Z on it');
	A(JSON.stringify(m.seats) === JSON.stringify(E.newMap('T', 8, 8).seats), 'the Versus seats are untouched');
}
// ---------- what it can be played as
{
	const none = E.newMap('T', 12, 8), mz = made(), rd = made({ road: true });
	A(E.tdProblems(none).join() === 'place the Tower Defense base,place at least one Tower Defense gate' && !E.tdPlayable(none), 'no marks: it says what to place');
	A(E.tdProblems(mz, 'maze').length === 0 && E.tdPlayable(mz) && E.tdProblems(mz, 'road')[0] === 'no road of Dirt joins gate 1 to the base', 'a gate and a base on open ground: a Maze Builder map; not a Road map until a road is painted');
	A(E.tdProblems(rd, 'road').length === 0 && E.tdProblems(rd, 'maze').length === 0, 'with a road of Dirt from the gate to the base: a Road map too');
	const near = tool(tool(E.newMap('T', 12, 8), 'tdgate', 5, 4).map, 'tdbase', 7, 4).map;
	A(E.tdProblems(near)[0] === 'gate 1 is too close to the base', 'a gate under 4 tiles from the base is too close');
	let cut = made(); for (let y = 0; y < 8; y++) cut = tool(cut, 'lower', 6, y).map;
	A(E.tdProblems(cut, 'maze')[0] === 'gate 1 has no way to the base over flat ground', 'a gap across the whole map: no way, in words');
	let wet = made({ road: true }); wet = tool(wet, 'ground', 5, 4, { ground: 'w' }).map;
	A(E.tdProblems(wet, 'road')[0] === 'no road of Dirt joins gate 1 to the base', 'a road broken by water is no road');
	const noSeats = { ...mz, seats: [] };
	A(E.saveBlock(noSeats) === null && E.saveBlock({ ...none, seats: [] }) !== null && E.saveBlock(none) === null, 'a map with a base and a gate can be saved without Versus seats; one with neither still cannot');
}
// ---------- the maps it becomes are sound, and a run plays on each
{
	const mz = E.asTdMaze(made()), rd = E.asTdRoad(made({ road: true }));
	A(mz && mz.custom && mz.gates.length === 1 && mz.base.join() === '11,4' && TD.mapProblems(mz, buildMap({ ...mz, foes: [] })).length === 0, 'as a Maze Builder map it passes the game\'s own map checks', mz && TD.mapProblems(mz, buildMap({ ...mz, foes: [] })));
	A(rd && rd.road && rd.paths.length === 1 && rd.paths[0].length === 12 && rd.paths[0][0].join() === '0,4' && rd.paths[0][11].join() === '11,4' && TD.mapProblems(rd, buildMap({ ...rd, foes: [] })).length === 0, 'as a Road map its road is the walk over Dirt, gate to base, and it passes the checks too', rd && TD.mapProblems(rd, buildMap({ ...rd, foes: [] })));
	A(E.asTdRoad(made()) === null && E.asTdMaze(E.newMap('T', 8, 8)) === null, 'a map that cannot be played that way becomes nothing');
	let bent = E.newMap('Bent', 12, 8); bent = tool(bent, 'tdgate', 0, 1).map; bent = tool(bent, 'tdbase', 11, 6).map;
	for (let x = 1; x <= 5; x++) bent = tool(bent, 'ground', x, 1, { ground: 'd' }).map;
	for (let y = 1; y <= 6; y++) bent = tool(bent, 'ground', 5, y, { ground: 'd' }).map;
	for (let x = 5; x <= 10; x++) bent = tool(bent, 'ground', x, 6, { ground: 'd' }).map;
	const br = E.asTdRoad(bent);
	A(br && br.paths[0].length === 17 && br.paths[0].some(([x, y]) => x === 5 && y === 4), 'a bent road is walked along its bend', br && br.paths[0].length);
	for (const [name, m] of [['Maze Builder', mz], ['Road', rd]]) {
		const S = TD.newRun('made', { map: m, squad }, data);
		// (the Road's commander plays both: on a Maze Builder map it stops at the first reward to pick, so one wave is asked of it there)
		const want = name === 'Road' ? 2 : 1;
		let t = 0; while (!S.over && S.cleared < want && t++ < 20000) { if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) TD.applyInput(S, a, data); TD.step(S, [], data); }
		A(S.cleared >= want && S.spawned > 0 && S.mode === (name === 'Road' ? undefined : 'maze'), `a run is played on it as a ${name} map (wave ${S.cleared} cleared)`, [S.cleared, S.over, S.mode]);
	}
}
// ---------- the recipe carries the made map: a replay is the same run
{
	const m = made({ road: true }), road = E.asTdRoad(m);
	const S = TD.newRun('rec', { map: road, squad }, data), inputs = [];
	for (let t = 0; t < 900 && !S.over; t++) { const now = S.tick % 10 === 0 ? chooseOrders(S, data) : []; for (const a of now) { if (TD.applyInput(S, a, data) === null) inputs.push([S.tick, a]); } TD.step(S, [], data); }
	const rec = tdRecipe({ seed: 'rec', mapId: 'custom', made: m, madeAs: 'road', squad, inputs, end: S.tick, wave: S.cleared });
	A(rec.map === 'custom' && rec.made && rec.madeAs === 'road' && validTdRecipe(rec) && /Tower Defense · Test TD/.test(rec.label), 'a run on a made map: its recipe carries the map, and is a valid recipe', rec.label);
	A(tdMapOf(rec).paths[0].length === 12 && tdMapOf({ ...rec, madeAs: 'maze' }).gates.length === 1 && tdMapOf({ map: 'custom' }) === null && tdMapOf({ map: 'td-loop', rev: TD.TD_RULES_REV }).id === 'td-loop', 'the map is read back out of the recipe (one of the game\'s own maps as before)');
	A(!validTdRecipe({ ...rec, made: { rows: ['bad'] } }) && !validTdRecipe({ ...rec, made: undefined }), 'a recipe whose made map cannot be read is no recipe');
	const again = tdRunTo(rec, rec.end, data);
	A(TD.hashOf(again) === TD.hashOf(S), 'replayed from the recipe it is the same run, tick for tick');
	const mzRec = tdRecipe({ seed: 'm', mapId: 'custom', made: made(), madeAs: 'maze', squad, inputs: [], end: 0 });
	A(/^Maze Builder · Test TD/.test(mzRec.label) && tdNewRun(mzRec, data).mode === 'maze', 'a made Maze Builder map\'s recipe says so, and starts a Maze Builder run');
	const c = E.cleanMap(JSON.parse(JSON.stringify(m)));
	A(JSON.stringify(c.td) === JSON.stringify(m.td), 'a map read back from a share code keeps its Tower Defense marks');
	const junk = E.cleanMap({ ...m, td: { gates: [[0, 4], [0, 4], [99, 99], 'x', [1, 1], [2, 2], [3, 3]], base: [0, 4] } });
	A(junk.td.gates.length === 3 && !junk.td.base, 'marks off the map, doubled, past three, or a base on a gate are dropped', junk.td);
}
// ---------- the page
{
	const hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), ed = fs.readFileSync(path.join(ROOT, 'poketactica/js/editmode.js'), 'utf8'), tdm = fs.readFileSync(path.join(ROOT, 'poketactica/js/tdmode.js'), 'utf8');
	A(/Play as \$\{kind === 'maze' \? 'Maze Builder' : 'a Road map'\}/.test(hub) && /ctx\.startTd\(m, squad, 1, null, false\)/.test(hub), 'a made map\'s screen plays it as Maze Builder or as a Road map, and says why when it cannot');
	A(/const made = !!run\.map\.custom;/.test(main) && /stars: 0, exp: \{\}/.test(main) && /delete td\.custom;/.test(main) && /report\.made = true; report\.record = false;/.test(main) && /id="r-made"/.test(main), 'a run on a made map pays no stars and no EXP, keeps no record, and its results say Practice (not "New record!")');
	A(/sub: 'TD gate'/.test(ed) && /sub: 'TD base'/.test(ed) && /id=\\?"edit-td\\?"/.test(ed), 'the Map Maker marks the gates and the base, and its bar says whether it is a Maze Builder map and a Road map');
	A(/T\.map\.made \? \{ made: T\.map\.made, madeAs: T\.map\.road \? 'road' : 'maze' \}/.test(tdm) && (tdm.match(/tdMapOf\(/g) || []).length >= 3, 'a run on a made map saves, resumes, is watched and is replayed by the map its recipe carries');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
