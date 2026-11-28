// poketactica_goals_map_test.mjs — STORY: MAP OBJECTIVES OTHER THAN "DEFEAT ALL" (Plans/POKETACTICA_MODES_PLAN.md item S1).
// "The rules only test for a wipe; 22 maps play the same way." Four objectives, each PLAYED here on a small board with
// the battle's own orders: beat the leader, reach a tile, hold a tile, protect a figurine. Then the nine Story maps that
// have one are checked: the goal is on the board, and a battle is made with it.
// Pure: node only.   node overworld/tests/poketactica_goals_map_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { reach } from '../../poketactica/js/engine/grid.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const fig = (sp, lv, tag) => makeFigurine(sp, lv, makeRng('gm' + tag), data, { id: 'gm-' + tag, shinyRate: 0 });
// a flat board, 7 by 3, the base in the middle of the left edge
const BOARD = { id: 'gm', name: 'Test', theme: 'meadow', rows: ['.......', '.......', '.......'], ground: ['ggggggg', 'ggggggg', 'ggggggg'], base: [0, 1], foes: [] };
const make = (foes, goal, team = [fig('machamp', 90, 'p')]) => B.newBattle('gm', { map: C.buildMap(BOARD), player: team, enemy: foes.map((f, i) => ({ fig: fig(f.sp, f.lv, 'e' + i), x: f.x, y: f.y, ai: f.ai || 'hold' })), ...(goal ? { goal } : {}), rev: B.RULES_REV }, data);
const act = (S, a) => B.act(S, a, data);
const out = (S) => S.units.find((u) => u.side === 'p' && !u.vip);
/** The figurine next to (x, y) attacks it with its first move that reaches, and Executes. */
function strike(S, u, x, y) {
	for (const mid of u.fig.equipped) {
		const m = B.moveOf(u, mid, data);
		if (!m || m.category === 'Status') continue;
		if (B.aimTiles(S, u, m).some(([ax, ay]) => ax === x && ay === y)) { const r = act(S, { t: 'attack', uid: u.uid, move: mid, x, y }); if (r.ok) return act(S, { t: 'execute' }); }
	}
	return { ok: false };
}

// ---------- no goal: as it ever was
{
	const S = make([{ sp: 'rattata', lv: 1, x: 2, y: 1 }, { sp: 'rattata', lv: 1, x: 6, y: 1 }], null), p = out(S);
	act(S, { t: 'deploy', uid: p.uid }); act(S, { t: 'move', uid: p.uid, x: 1, y: 1 });
	A(strike(S, p, 2, 1).ok && S.units.filter((u) => u.side === 'e' && u.hp > 0).length === 1 && !S.over && S.goal === undefined && B.view(S).goal === null, 'a map with no objective: one foe down, one standing, the battle goes on');
}
// ---------- beat the leader
{
	const S = make([{ sp: 'rattata', lv: 1, x: 2, y: 1 }, { sp: 'rattata', lv: 1, x: 6, y: 1 }], { k: 'leader', foe: 0 }), p = out(S);
	const lead = S.units.find((u) => u.leader);
	A(lead && lead.x === 2 && S.goal.k === 'leader' && S.goal.uid === lead.uid && B.view(S).goal.uid === lead.uid && S.units.filter((u) => u.leader).length === 1, 'the leader is marked, and the page can read who it is');
	act(S, { t: 'deploy', uid: p.uid }); act(S, { t: 'move', uid: p.uid, x: 1, y: 1 });
	A(strike(S, p, 2, 1).ok && lead.hp <= 0 && S.over === 'won' && S.units.some((u) => u.side === 'e' && u.hp > 0), 'the leader knocked out wins the map, with another foe still standing');
	// the other foe down first does not win it
	const T = make([{ sp: 'rattata', lv: 1, x: 6, y: 1 }, { sp: 'rattata', lv: 1, x: 2, y: 1 }], { k: 'leader', foe: 0 }), q = out(T);
	act(T, { t: 'deploy', uid: q.uid }); act(T, { t: 'move', uid: q.uid, x: 1, y: 1 });
	A(strike(T, q, 2, 1).ok && !T.over, 'knocking out somebody else does not');
}
// ---------- reach a tile
{
	const S = make([{ sp: 'rattata', lv: 1, x: 6, y: 0 }], { k: 'reach', tiles: [[3, 1], [3, 2]] }), p = out(S);
	act(S, { t: 'deploy', uid: p.uid });
	A(!S.over && act(S, { t: 'move', uid: p.uid, x: 2, y: 1 }).ok && !S.over, 'beside the tile is not on it');
	act(S, { t: 'end' });
	const r = act(S, { t: 'move', uid: p.uid, x: 3, y: 1 });
	A(r.ok && S.over === 'won' && r.events.some((e) => e.t === 'over' && e.result === 'won') && S.units.some((u) => u.side === 'e' && u.hp > 0), 'one of yours walks onto a marked tile: the map is won at once');
	const T = make([{ sp: 'rattata', lv: 1, x: 6, y: 0 }], { k: 'reach', tiles: [[99, 99]] });
	A(T.goal === undefined, 'a goal with no real tile is no goal');
}
// ---------- hold a tile
{
	const S = make([{ sp: 'rattata', lv: 1, x: 6, y: 0 }], { k: 'hold', tiles: [[2, 1]], turns: 2 }), p = out(S);
	act(S, { t: 'deploy', uid: p.uid }); act(S, { t: 'move', uid: p.uid, x: 2, y: 1 });
	A(!S.over && S.goal.n === 0, 'standing on it is not holding it yet');
	const e1 = act(S, { t: 'end' });
	A(!S.over && S.goal.n === 1 && e1.events.some((e) => e.t === 'goal' && e.n === 1 && e.of === 2) && B.view(S).goal.n === 1, 'the enemy phase ends with one of yours still there: 1 of 2');
	act(S, { t: 'move', uid: p.uid, x: 1, y: 1 });
	act(S, { t: 'end' });
	A(!S.over && S.goal.n === 0, 'stepping off starts the count again');
	act(S, { t: 'move', uid: p.uid, x: 2, y: 1 }); act(S, { t: 'end' });
	A(!S.over && S.goal.n === 1, 'back on: 1 of 2');
	const e3 = act(S, { t: 'end' });
	A(S.over === 'won' && S.goal.n === 2 && e3.events.some((e) => e.t === 'over' && e.result === 'won'), 'held for two enemy phases running: the map is won');
}
// ---------- protect a figurine
{
	const vipFig = fig('chansey', 1, 'vip');
	const S = make([{ sp: 'machamp', lv: 90, x: 2, y: 0, ai: 'aggro' }], { k: 'protect', fig: vipFig, x: 1, y: 0 }, [fig('rattata', 5, 'p1'), fig('rattata', 5, 'p2')]);
	const vip = S.units.find((u) => u.vip), p = out(S);
	A(vip && vip.side === 'p' && vip.x === 1 && vip.y === 0 && S.goal.k === 'protect' && S.goal.uid === vip.uid, 'the one to protect stands on the board from the start');
	A(act(S, { t: 'move', uid: vip.uid, x: 1, y: 1 }).why === 'it takes no orders: keep it safe' && vip.x === 1, 'it takes no orders');
	act(S, { t: 'deploy', uid: p.uid }); act(S, { t: 'move', uid: p.uid, x: 0, y: 2 });
	let turns = 0; while (!S.over && turns++ < 6) act(S, { t: 'end' });
	A(S.over === 'lost' && vip.hp <= 0, 'it falls: the map is lost, though one of yours still stands', [S.over, vip.hp, S.units.filter((u) => u.side === 'p' && !u.vip && u.hp > 0).length]);
	// every foe down with it standing wins
	const W = make([{ sp: 'rattata', lv: 1, x: 2, y: 1 }], { k: 'protect', fig: vipFig, x: 0, y: 0 }), w = out(W);
	act(W, { t: 'deploy', uid: w.uid }); act(W, { t: 'move', uid: w.uid, x: 1, y: 1 });
	A(strike(W, w, 2, 1).ok && W.over === 'won' && W.units.find((u) => u.vip).hp > 0, 'every foe knocked out with it standing: won');
	// it is not one of yours: with all of yours down the map is lost while it stands
	const L = make([{ sp: 'machamp', lv: 90, x: 5, y: 1, ai: 'aggro' }], { k: 'protect', fig: fig('chansey', 200, 'vip2'), x: 6, y: 2 }, [fig('rattata', 1, 'p3')]), l = out(L);
	act(L, { t: 'deploy', uid: l.uid });
	l.hp = 1; const lv = L.units.find((u) => u.vip);
	let t2 = 0; while (!L.over && t2++ < 12) act(L, { t: 'end' });
	A(L.over === 'lost', 'all of yours down: lost, whether or not it still stands', [L.over, lv.hp]);
}
// ---------- the nine Story maps
{
	const ids = Object.keys(C.GOALS), kinds = ids.map((id) => C.GOALS[id].k);
	A(ids.length === 9 && kinds.filter((k) => k === 'leader').length === 6 && C.MAPS.filter((m) => m.boss).every((m) => C.GOALS[m.id] && C.GOALS[m.id].k === 'leader') && ['hold', 'reach', 'protect'].every((k) => kinds.includes(k)), 'nine maps have an objective: the six boss maps (beat the leader), one to hold, one to reach, one to protect');
	A(C.MAPS.filter((m) => !C.GOALS[m.id]).every((m) => C.goalOf(m) === null && C.goalSay(m) === '' && !C.campaignSetup(m, [], data, 'x').goal), 'the other thirteen have none: their setup is what it was');
	const team = STARTERS.slice(0, 3).map((sp, i) => fig(sp, 40, 't' + i)), bad = [];
	for (const id of ids) {
		const m = C.mapById(id), g = C.GOALS[id], say = C.goalSay(m, (sp) => data.species[sp].name);
		if (!/^Objective: /.test(say) || say.length < 30) bad.push(id + ': not said');
		for (const mm of [m, C.hardMap(m)]) {
			let S; try { S = B.newBattle('g-' + id, C.campaignSetup(mm, team, data, 'g-' + id), data); } catch (e) { bad.push(id + ': ' + e.message); continue; }
			if (!S.goal || S.goal.k !== g.k) { bad.push(id + ': no goal in the battle'); continue; }
			const walk = reach(S.map, m.base[0], m.base[1], 999, 2, () => null);
			if (g.k === 'leader') { const u = S.units.find((x) => x.leader); if (!u || u.species !== m.foes.find((f) => f.boss).sp) bad.push(id + ': the leader is not the boss'); }
			if (g.tiles) { if (S.goal.tiles.length !== g.tiles.length) bad.push(id + ': a goal tile is no tile'); if (!g.tiles.some(([x, y]) => walk.has(x + ',' + y))) bad.push(id + ': no goal tile can be walked to (Jump 2)'); if (g.tiles.some(([x, y]) => x === m.base[0] && y === m.base[1])) bad.push(id + ': the base is a goal tile'); }
			if (g.k === 'protect') { const v = S.units.find((x) => x.vip); if (!v || v.x !== g.x || v.y !== g.y || m.foes.some((f) => f.x === g.x && f.y === g.y) || (g.x === m.base[0] && g.y === m.base[1])) bad.push(id + ': the one to protect is misplaced'); if (!/Chansey/.test(say)) bad.push(id + ': not named'); }
		}
	}
	A(bad.length === 0, 'on each of the nine (and its hard set) the battle carries the goal: the leader is the boss, a goal tile can be walked to from the base, the one to protect stands clear of the foes and the base; each says its objective', bad);
	A(/knock out Onix\. The others need not fall\./.test(C.goalSay(C.mapById('c1-5'), (sp) => data.species[sp].name)) && /2 enemy phases in a row/.test(C.goalSay(C.mapById('c3-1'))), 'in words: "knock out Onix. The others need not fall."');
}
// ---------- the page
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A(/const g = goalSay\(m, nameOf\); return \(g \? g \+ ' ' : ''\) \+ m\.tip;/.test(main) && /id=\\?"map-goal\\?"/.test(hub), 'the map\'s panel and the battle\'s first tip say the objective');
	// (found in a browser: the page gave the figurine to protect a place in the team, and starting the map threw)
	A(/S0\.units\.filter\(\(u\) => u\.side === 'p' && !u\.vip\)\.forEach\(\(u, i\) => \{ teamMap\[u\.uid\] = team\[i\]\.id; \}\);/.test(main) && /const ready = \(\) => B\.onMap\(P\.S, ME\(\)\)\.filter\(\(u\) => !u\.acted && !u\.vip\);/.test(main) && /if \(mine\(u\) && u\.vip\)/.test(main), 'the one to protect is not one of the team: it has no place in the team, is not counted as able to act, and opens no commands');
	A(/function goalMarks\(\)/.test(main) && /sub: g\.k === 'hold' \? 'hold ' \+ g\.n \+ ' \/ ' \+ g\.turns : 'reach'/.test(main) && /'leader' : 'protect'/.test(main) && /banner\('Held: ' \+ e\.n \+ ' of ' \+ e\.of\)/.test(main), 'the board marks the tiles (with the count held), the leader and the one to protect');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
