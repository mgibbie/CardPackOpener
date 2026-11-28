// poketactica_ladder_test.mjs — STORY: AN ENDING, AND A POST-GAME LADDER (Plans/POKETACTICA_MODES_PLAN.md item S2). "The
// ending is one clause and the Story stops where the figurines start to get interesting." The last map's first clear
// has an ending; then a ladder of harder games opens: a Story map a rung, its foes from Lv 65 up, 6 levels a rung.
// Pure: node only.   node overworld/tests/poketactica_ladder_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import * as F from '../../poketactica/js/figcol.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = F.STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 70, makeRng('ld' + i), data, { id: 'ld-' + i, shinyRate: 0 }));
const ALL = C.MAPS.map((m) => m.id);

// ---------- the ending
{
	A(C.ENDING.title.length > 8 && C.ENDING.lines.length >= 3 && C.ENDING.lines.every((l) => l.length > 30 && /[.]$/.test(l)) && /ladder/i.test(C.ENDING.lines[C.ENDING.lines.length - 1]), 'an ending: a title and a few whole sentences, the last pointing on to the ladder');
	A(C.nextMap(ALL) === null && C.nextMap(ALL.slice(0, -1)).id === C.MAPS[C.MAPS.length - 1].id, 'it is the last map\'s first clear that ends the Story (no map is next after it)');
}
// ---------- when the ladder opens, and its numbers
{
	A(C.ladderOpen(ALL) && !C.ladderOpen(ALL.slice(0, -1)) && !C.ladderOpen([]) && !C.ladderOpen(null), 'the ladder opens when every Story map is cleared, not before');
	A(C.ladderLevel(1) === 65 && C.ladderLevel(2) === 71 && C.ladderLevel(10) === 119 && C.ladderLevel(500) === 999 && C.ladderLevel(0) === 65, 'rung 1 is Lv 65 (the Story ends at 60), 6 more a rung, 999 at most', [C.ladderLevel(1), C.ladderLevel(10)]);
	A(C.ladderStars(1) === 80 && C.ladderStars(2) === 90 && C.ladderStars(20) === 270, 'a rung pays 80 stars and 10 more a rung');
	const ids = []; for (let n = 1; n <= 22; n++) ids.push(C.ladderMapId(n));
	A(new Set(ids).size === 22 && ids.every((id) => C.mapById(id)) && C.ladderMapId(23) === C.ladderMapId(1), '22 rungs are 22 different Story maps, then round again');
	A(C.ladderBest({ td: { ladder: 7 } }) === 7 && C.ladderBest({}) === 0 && C.ladderBest(null) === 0 && F.cleanFigs({ v: 1, figs: {}, td: { ladder: 7 } }).td.ladder === 7, 'the best rung is kept with the records (and the collection\'s cleaner keeps it)');
	const mg = F.merge3Figs(F.cleanFigs({ v: 1, figs: {} }), F.cleanFigs({ v: 1, figs: {}, td: { ladder: 3 } }), F.cleanFigs({ v: 1, figs: {}, td: { ladder: 9 } }));
	A(mg.td.ladder === 9, 'two devices: the higher rung is kept');
}
// ---------- the rungs
{
	const bad = [];
	for (let n = 1; n <= 30; n++) {
		const m = C.ladderMap(n), base = C.mapById(C.ladderMapId(n)), L = C.ladderLevel(n);
		if (m.ladder !== n || m.id !== base.id || !m.name.startsWith('Ladder rung ' + n + ' · ') || m.reward.stars !== C.ladderStars(n) || m.reward.fig) bad.push(n + ': the rung');
		if (m.rows !== base.rows || m.base !== base.base) bad.push(n + ': the board');
		if (Math.max(...m.foes.map((f) => f.lv)) !== L) bad.push(n + ': the strongest foe is not Lv ' + L);
		if (!m.foes.every((f, i) => f.sp === base.foes[i].sp && f.x === base.foes[i].x && f.y === base.foes[i].y && f.lv > base.foes[i].lv && f.ai !== 'passive')) bad.push(n + ': foes');
		const order = (list) => list.map((f, i) => [f.lv, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[1]).join();
		if (base.foes.some((f, i) => base.foes.some((g, j) => f.lv > g.lv && m.foes[i].lv < m.foes[j].lv))) bad.push(n + ': a weaker foe became the stronger');
		void order;
		if (!m.tip.startsWith('Post-game ladder, rung ' + n + ':')) bad.push(n + ': not said');
		try { const S = B.newBattle('l' + n, C.campaignSetup(m, team, data, 'l' + n), data); if (S.units.filter((u) => u.side === 'e').length !== m.foes.length) bad.push(n + ': build'); } catch (e) { bad.push(n + ': ' + e.message); }
	}
	A(bad.length === 0, 'rungs 1 to 30: a Story map\'s board and foes, the strongest at the rung\'s level and the others in step, nobody only watching, no figurine reward; the engine builds each', bad.slice(0, 6));
	A(C.mapOf({ kind: 'map', id: C.ladderMapId(4), ladder: 4 }).ladder === 4 && !C.mapOf({ kind: 'map', id: 'c1-1' }).ladder && C.mapOf({ kind: 'map', id: 'c1-1', hard: true }).hard === true, 'a target plays its rung; a Story map and its hard set are as they were');
	A(C.MAPS.every((m) => !m.ladder) && C.ladderMap(1).foes !== C.mapById(C.ladderMapId(1)).foes, 'the Story maps themselves are not changed');
	// a rung on a map with an objective keeps it, and the one to protect keeps step with the rung's foes
	{
		let n = 1; while (C.ladderMapId(n) !== 'c4-2') n++;
		const S = B.newBattle('lp', C.campaignSetup(C.ladderMap(n), team, data, 'lp'), data), vip = S.units.find((u) => u.vip);
		const H2 = B.newBattle('hp', C.campaignSetup(C.hardMap(C.mapById('c4-2')), team, data, 'hp'), data).units.find((u) => u.vip);
		const P0 = B.newBattle('pp', C.campaignSetup(C.mapById('c4-2'), team, data, 'pp'), data).units.find((u) => u.vip);
		A(S.goal && S.goal.k === 'protect' && vip.level === C.ladderLevel(n) && P0.level === 30 && H2.level === C.hardLevel(30), `the rung on Grassy Glade (rung ${n}) is still a protect map, and its Chansey is the rung's level (${vip.level}), not the map's 30; a hard set's is the hard level`, [vip.level, P0.level, H2.level]);
	}
	A(C.ladderMap(40).foes.every((f) => f.lv <= 999) && Math.max(...C.ladderMap(400).foes.map((f) => f.lv)) === 999, 'deep rungs stop at Lv 999');
}
// ---------- the page
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A(/if \(!nextMap\(c2\.cleared\)\) report\.ending = true;/.test(main) && /id=\\?"r-ending\\?"/.test(main), 'the last map\'s first clear shows the ending on its results');
	A(/P\.map\.ladder && P\.S\.over === 'won'\) \{\s*const n = P\.map\.ladder, best = ladderBest\(c2\);\s*if \(n > best\) \{ c2 = \{ \.\.\.c2, td: \{ \.\.\.\(c2\.td \|\| \{\}\), \[LADDER_KEY\]: n \} \}; report\.stars \+= P\.map\.reward\.stars;/.test(main), 'a rung\'s FIRST clear pays its stars and becomes the best rung; again pays nothing');
	A(/\} else\s*if \(P\.target && P\.target\.kind === 'map' && P\.map && P\.S\.over === 'won' && mapById\(P\.map\.id\)\) \{/.test(main), 'a rung won is not the Story map\'s hard set or medal');
	A(/t\.ladder && ladderOpen\(col\(\)\.cleared\) && t\.ladder <= ladderBest\(col\(\)\) \+ 1/.test(hub), 'a rung is a target only when the ladder is open and it is the next rung or one below');
	A(/if \(ladderOpen\(cl\)\) \{/.test(hub) && /The ending/.test(hub) && /Ladder rung \$\{n\}/.test(hub) && /function ending\(\)/.test(hub) && /id=\\?"path-post\\?"/.test(hub), 'past the Story path\'s last stop: the ending to read again, and the next rung');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
