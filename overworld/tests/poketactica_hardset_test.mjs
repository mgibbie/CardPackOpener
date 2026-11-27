// poketactica_hardset_test.mjs — A REASON TO REPLAY A MAP (Plans/POKETACTICA_MODES_PLAN.md item S4). "A cleared map is
// finished for good." A cleared Story map can be played against a second, harder set of foes (its first clear pays the
// map's stars again), and a map won with nobody lost earns its medal.
// Pure: node only.   node overworld/tests/poketactica_hardset_test.mjs
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
const team = F.STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 12, makeRng('hs' + i), data, { id: 'hs-' + i, shinyRate: 0 }));

// ---------- the hard set
{
	A(C.hardLevel(5) === 12 && C.hardLevel(12) === 22 && C.hardLevel(60) === 86 && C.hardLevel(999) === 999 && C.hardLevel(800) === 999, 'a hard foe is 1.35 times its level and 5 more, 999 at most', [C.hardLevel(5), C.hardLevel(12), C.hardLevel(60)]);
	const bad = [];
	for (const m of C.MAPS) {
		const h = C.hardMap(m);
		if (!(h.hard && h.id === m.id && h.foes.length === m.foes.length && h.foes.every((f, i) => f.sp === m.foes[i].sp && f.x === m.foes[i].x && f.y === m.foes[i].y && f.lv === C.hardLevel(m.foes[i].lv) && f.lv > m.foes[i].lv && f.ai !== 'passive' && (m.foes[i].ai === 'passive' ? f.ai === 'hold' : f.ai === m.foes[i].ai)))) bad.push(m.id + ': foes');
		if (h.rows !== m.rows || h.base !== m.base || h.reward !== m.reward || h.symbols !== m.symbols) bad.push(m.id + ': the board');
		try { const S = B.newBattle('hs-' + m.id, C.campaignSetup(h, team, data, 'hs-' + m.id), data); const lv = S.units.filter((u) => u.side !== 'p').map((u) => u.level); if (lv.join() !== h.foes.map((f) => f.lv).join()) bad.push(m.id + ': levels in battle ' + lv); } catch (e) { bad.push(m.id + ': ' + e.message); }
	}
	A(bad.length === 0, `every one of the ${C.MAPS.length} maps has a hard set: the same Pokémon on the same tiles and board, every level higher, nobody only watching; the engine builds each`, bad);
	const m = C.mapById('c1-4');
	A(m.foes.some((f) => f.ai === 'passive') && Object.isFrozen(C.MAPS) && C.mapById('c1-4').foes.some((f) => f.ai === 'passive'), 'the map itself is not changed by making its hard set');
	A(C.mapOf({ kind: 'map', id: 'c1-2' }) === C.mapById('c1-2') && C.mapOf({ kind: 'map', id: 'c1-2', hard: true }).hard === true && C.mapOf({ kind: 'map', id: 'nope', hard: true }) === null, 'a target plays the map, or its hard set when it says so');
	A(!C.hardOpen('c1-2', ['c1-1']) && C.hardOpen('c1-2', ['c1-1', 'c1-2']) && !C.hardOpen('c1-1', []), 'the hard set opens when the map itself is cleared');
}
// ---------- what the collection keeps
{
	let c = F.cleanFigs({ v: 1, figs: {} });
	c = F.markHard(c, 'c1-2'); c = F.markHard(c, 'c1-2'); c = F.markMedal(c, 'c1-1'); c = F.markMedal(c, 'c1-2');
	A(JSON.stringify(c.hard) === '["c1-2"]' && JSON.stringify(c.medals) === '["c1-1","c1-2"]', 'a hard clear and a medal are kept once each, as cleared maps are', [c.hard, c.medals]);
	const k = F.cleanFigs({ v: 1, figs: {}, hard: ['c1-2', 'c1-2', 'BAD ID', 7], medals: 'junk' });
	A(JSON.stringify(k.hard) === '["c1-2"]' && k.medals === undefined, 'cleaned: unique, only ids; junk is dropped (this is the server\'s cleaner too)', k);
	A(F.cleanFigs({ v: 1, figs: {} }).hard === undefined, 'a collection with none has no such field');
	const base = F.cleanFigs({ v: 1, figs: {} }), a = F.markHard(base, 'c1-1'), b = F.markMedal(F.markHard(base, 'c1-3'), 'c1-1');
	const mg = F.merge3Figs(base, a, b);
	A(JSON.stringify(mg.hard) === '["c1-1","c1-3"]' && JSON.stringify(mg.medals) === '["c1-1"]', 'two devices: a hard clear or a medal earned on either is kept', [mg.hard, mg.medals]);
	A(!F.sameFigs(base, a) && F.sameFigs(a, F.markHard(base, 'c1-1')) && !F.sameFigs(a, F.markMedal(a, 'c1-1')), 'a new hard clear or medal is a change to sync');
}
// ---------- the page: what a win does, and where it is shown
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A(/P\.map\.hard && !\(c2\.hard \|\| \[\]\)\.includes\(P\.map\.id\)\) \{ c2 = markHard\(c2, P\.map\.id\); report\.stars \+= P\.map\.reward\.stars;/.test(main), 'the hard set pays the map\'s stars on its FIRST clear only');
	A(/!P\.S\.units\.some\(\(u\) => u\.side === 'p' && u\.hp <= 0\) && !\(c2\.medals \|\| \[\]\)\.includes\(P\.map\.id\)/.test(main), 'the medal: a win with no figurine of yours down, once a map');
	A(/target\.kind === 'map' \? mapOf\(target\)/.test(main) && (main.match(/target\.kind === 'map' \? mapOf\(target\)/g) || []).length === 2, 'a new battle and a resumed one both play the target\'s set');
	A(/go: \(\) => \(done \? replay\(m\) : team\(\{ kind: 'map', id: m\.id \}\)\)/.test(hub) && /team\(\{ kind: 'map', id: m\.id, hard: true \}\)/.test(hub), 'a cleared map opens a choice: play again, or the hard set');
	A(/\(!t\.hard \|\| hardOpen\(t\.id, col\(\)\.cleared\)\)/.test(hub), 'a hard target for a map not cleared is not a target');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
