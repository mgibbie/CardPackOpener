// poketactica_campaign_test.mjs — Campaign v1 (stage 6, poketactica/js/campaign.js): every hand-built map is checked, so a
// map that can't be played never ships.
//   1. each map: its rows and Geo are one size; heights are 0-9 or a gap; the base tile is a tile, clear of foes and
//      symbols; every foe and symbol is on a tile, none share one; every foe can be reached from the base on foot (Jump 2,
//      the lowest any figurine has) and every symbol can be walked up to (it is broken by attacking its tile); every
//      symbol's effect is one the engine knows and sits on a coloured tile (or it would do nothing)
//   2. every species, listed move and reward figurine is real; levels 1-999; a tip for every map; three chapters with a
//      boss at the end of each; ids unique
//   3. the engine builds every map (battle.js newBattle) with a team of three starters
//   4. opening order: the first map is open, each next one opens when the one before is cleared; nextMap walks them
//   5. the collection keeps `cleared` (figcol.js): cleaned, synced as a union (a map cleared on any device stays cleared),
//      part of sameFigs; the server's put keeps it (cleanFigs is the server's cleaner)
//   node overworld/tests/poketactica_campaign_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { reach, isTile } from '../../poketactica/js/engine/grid.js';
import { GEO_EFFECTS } from '../../poketactica/js/engine/geo.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { cleanFigs, merge3Figs, sameFigs, markCleared, STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };

try {
	A(C.MAPS.length >= 10, `at least ten maps (${C.MAPS.length})`);
	A(new Set(C.MAPS.map((m) => m.id)).size === C.MAPS.length, 'map ids are unique');
	for (const ch of C.CHAPTERS) {
		const ms = C.MAPS.filter((m) => m.chapter === ch.n);
		A(ms.length >= 2 && ms[ms.length - 1].boss && ms[ms.length - 1].foes.some((f) => f.boss), `chapter ${ch.n} (${ch.name}) ends with a boss map`);
	}
	const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 5, makeRng('t' + i), data, { id: sp + '-t' + i }));
	for (const m of C.MAPS) {
		const at = `${m.id} ${m.name}`;
		const w = m.rows[0].length, h = m.rows.length;
		A(m.rows.every((r) => r.length === w && /^[.#1-9]+$/.test(r)), `${at}: rows are one width, heights 0-9 or a gap`);
		A(!m.geo || (m.geo.length === h && m.geo.every((r) => r.length === w && /^[.rbpocyg]+$/.test(r))), `${at}: the Geo grid is the map's size`);
		A(w <= 12 && h <= 10, `${at}: fits the screen (at most 12 x 10)`, [w, h]);
		A(typeof m.tip === 'string' && m.tip.length > 20, `${at}: has a tip`);
		const map = C.buildMap(m), [bx, by] = m.base;
		A(isTile(map, bx, by), `${at}: the base is a tile`);
		const spots = [...m.foes.map((f) => `${f.x},${f.y}`), ...(m.symbols || []).map((s) => `${s.x},${s.y}`)];
		A(new Set(spots).size === spots.length && !spots.includes(`${bx},${by}`), `${at}: foes and symbols each have their own tile, none on the base`, spots);
		const walk = reach(map, bx, by, 999, 2, () => null);
		for (const f of m.foes) {
			A(isTile(map, f.x, f.y) && walk.has(`${f.x},${f.y}`), `${at}: ${f.sp} at ${f.x},${f.y} is on a tile reachable on foot`);
			A(!!data.species[f.sp] && f.lv >= 1 && f.lv <= 999 && ['aggro', 'passive', 'hold'].includes(f.ai), `${at}: ${f.sp} is a real species, level and AI`);
			for (const mid of f.moves || []) A(!!data.moves[mid], `${at}: ${f.sp}'s move ${mid} is real`);
		}
		for (const s of m.symbols || []) {
			const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk.has(`${s.x + dx},${s.y + dy}`));
			A(isTile(map, s.x, s.y) && near, `${at}: the symbol at ${s.x},${s.y} can be walked up to`);
			A(GEO_EFFECTS.includes(s.effect.k) && map.geo[s.y * map.w + s.x], `${at}: the symbol's effect (${s.effect.k}) is known and it sits on a coloured tile`);
		}
		if (m.reward.fig) A(!!data.species[m.reward.fig.sp] && /-camp-/.test(C.rewardFigId(m)), `${at}: the reward figurine (${m.reward.fig.sp}) is real, with the map's id`);
		A(m.reward.stars > 0, `${at}: the first clear pays stars`);
		let S = null;
		try { S = B.newBattle('camp-' + m.id, C.campaignSetup(m, team, data, 'camp-' + m.id), data); } catch (e) { A(false, `${at}: the engine builds it`, String(e && e.stack || e)); continue; }
		A(S.units.filter((u) => u.side === 'e').length === m.foes.length && S.units.filter((u) => u.side === 'p').length === 3, `${at}: the engine builds it (${m.foes.length} foes, the team of three)`);
	}
	// stars grow chapter by chapter (a boss pays the most in its chapter)
	for (const ch of C.CHAPTERS) { const ms = C.MAPS.filter((m) => m.chapter === ch.n); A(ms[ms.length - 1].reward.stars === Math.max(...ms.map((m) => m.reward.stars)), `chapter ${ch.n}'s boss pays the most stars`); }

	// ---------- 4. opening order
	A(C.isOpen(C.MAPS[0].id, []) && !C.isOpen(C.MAPS[1].id, []), 'a new player has the first map open, the second shut');
	A(C.isOpen(C.MAPS[1].id, [C.MAPS[0].id]), 'clearing a map opens the next');
	A(C.nextMap([]).id === C.MAPS[0].id && C.nextMap([C.MAPS[0].id]).id === C.MAPS[1].id && C.nextMap(C.MAPS.map((m) => m.id)) === null, 'nextMap walks the maps in order; null when all are cleared');

	// ---------- 5. the collection keeps `cleared`
	const col = cleanFigs({ v: 1, figs: {}, cleared: ['c1-2', 'c1-1', 'c1-1', 'BAD ID', 7] });
	A(JSON.stringify(col.cleared) === '["c1-1","c1-2"]', 'cleared is cleaned: unique, sorted, only map ids', col.cleared);
	const base = { v: 1, figs: {} }, mine = markCleared(base, 'c1-1'), theirs = markCleared(base, 'c2-1');
	A(JSON.stringify(merge3Figs(base, mine, theirs).cleared) === '["c1-1","c2-1"]', 'two devices clearing different maps: both stay cleared after the sync');
	A(!sameFigs(base, mine), 'a newly cleared map counts as a change (the sync sends it)');
	A(!('cleared' in cleanFigs({ v: 1, figs: {} })), 'a collection with nothing cleared carries no cleared field');
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
