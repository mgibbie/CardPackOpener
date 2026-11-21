// poketactica_dungeon_test.mjs — the generated dungeon (stage 7, poketactica/js/dungeon.js). Floors are made, not written,
// so many are generated and each is held to the campaign's map checks: a floor that can't be played never reaches a player.
//   1. every floor 1-120 of three runs, and deep samples to Lv 999: rows and Geo one size, fits the screen, the base a
//      ground tile clear of foes and symbols, every foe reachable on foot (Jump 2), every symbol walkable-up-to on a
//      coloured tile with a known effect, real species, levels 1-999, the engine builds it
//   2. the same (seed, floor) is the same floor; another seed or floor is another
//   3. harder per floor: more foes (to eight), higher levels, stronger species; legendaries only as bosses from floor 30
//   4. every tenth floor is a boss floor: one boss, five levels up, its figurine as the reward, three times the stars
//   5. checkpoints: startFloors; the collection keeps `deep` (cleaned, the deeper wins on a sync, part of sameFigs)
//   6. the run on the device: saved, loaded, cleared; bad saves read as none
//   node overworld/tests/poketactica_dungeon_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from '../../poketactica/js/dungeon.js';
import { buildMap, campaignSetup } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { reach, isTile } from '../../poketactica/js/engine/grid.js';
import { GEO_EFFECTS } from '../../poketactica/js/engine/geo.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { cleanFigs, merge3Figs, sameFigs, markDeep, STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };

try {
	// ---------- 1. every floor is playable (one line per check, counting the floors that break it)
	const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 5, makeRng('t' + i), data, { id: sp + '-t' + i }));
	const floors = [];
	for (const seed of ['ra1', 'rb2', 'rc3']) for (let f = 1; f <= 120; f++) floors.push([seed, f]);
	for (const f of [150, 200, 333, 500, 664, 665, 700]) floors.push(['rdeep', f]);
	const bad = {};
	const no = (what, at) => { (bad[what] = bad[what] || []).push(at); };
	let built = 0;
	for (const [seed, f] of floors) {
		const m = D.genFloor(seed, f, data), at = seed + '/' + f;
		if (!m) { no('generated', at); continue; }
		const w = m.rows[0].length, h = m.rows.length;
		if (!m.rows.every((r) => r.length === w && /^[.#1-9]+$/.test(r))) no('rows one width, heights 0-9 or a gap', at);
		if (!(m.geo.length === h && m.geo.every((r) => r.length === w && /^[.rbpocyg]+$/.test(r)))) no('Geo the map\'s size', at);
		if (!(w <= 12 && h <= 10)) no('fits the screen (12 x 10)', at);
		const map = buildMap(m), [bx, by] = m.base;
		if (!(isTile(map, bx, by) && map.height[by * w + bx] === 0)) no('the base is a ground tile', at);
		const spots = [...m.foes.map((x) => x.x + ',' + x.y), ...m.symbols.map((s) => s.x + ',' + s.y)];
		if (!(new Set(spots).size === spots.length && !spots.includes(bx + ',' + by))) no('foes and symbols each have their own tile, none on the base', at);
		const walk = reach(map, bx, by, 999, 2, () => null);
		for (const x of m.foes) {
			if (!(isTile(map, x.x, x.y) && walk.has(x.x + ',' + x.y))) no('every foe is reachable on foot', at);
			if (!(data.species[x.sp] && x.lv >= 1 && x.lv <= 999 && ['aggro', 'passive', 'hold'].includes(x.ai))) no('every foe a real species, level and AI', at);
		}
		for (const s of m.symbols) {
			const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk.has((s.x + dx) + ',' + (s.y + dy)));
			if (!(isTile(map, s.x, s.y) && near)) no('every symbol can be walked up to', at);
			if (!(GEO_EFFECTS.includes(s.effect.k) && map.geo[s.y * w + s.x])) no('every symbol has a known effect and sits on a coloured tile', at);
			if (s.effect.k === 'typeBoost' && !/^[A-Z][a-z]+$/.test(s.effect.type)) no('a type boost names a type', at);
		}
		if (!(m.tip && m.tip.length > 20 && m.reward.stars > 0)) no('a tip and a star reward', at);
		if (f % 40 === 7 || D.isBossFloor(f) && f <= 30 || f >= 500) {
			try { const S = B.newBattle('dgn-' + seed + '-f' + f, campaignSetup(m, team, data, 'dgn-' + seed + '-f' + f), data); if (S.units.filter((u) => u.side === 'e').length === m.foes.length) built++; else no('the engine builds it', at); }
			catch (e) { no('the engine builds it', at + ' ' + String(e && e.message)); }
		}
	}
	A(!Object.keys(bad).length, `all ${floors.length} generated floors pass the campaign's map checks`, bad);
	A(built >= 20, `the engine builds the sampled floors (${built})`);

	// ---------- 2. seeded
	A(JSON.stringify(D.genFloor('ra1', 7, data)) === JSON.stringify(D.genFloor('ra1', 7, data)), 'the same seed and floor give the same floor');
	A(JSON.stringify(D.genFloor('ra1', 7, data).rows) !== JSON.stringify(D.genFloor('rb2', 7, data).rows) && JSON.stringify(D.genFloor('ra1', 7, data).rows) !== JSON.stringify(D.genFloor('ra1', 8, data).rows), 'another seed or floor gives another layout');

	// ---------- 3. harder per floor
	const F = (f) => D.genFloor('ra1', f, data);
	A(F(1).foes.length === 3 && F(30).foes.length === 8 && F(120).foes.length === 8, 'three foes on floor 1, more deeper down, never more than eight', [F(1).foes.length, F(30).foes.length]);
	let up = true; for (let f = 1; f < 200; f++) if (D.floorLevel(f + 1) <= D.floorLevel(f)) up = false;
	A(up && D.floorLevel(1) === 4 && D.floorLevel(9999) === 999 && D.floorLevel(10, true) === D.floorLevel(10) + 5, 'foe levels rise every floor (4 on floor 1, capped at 999; a boss five more)', [D.floorLevel(1), D.floorLevel(100)]);
	const bst = (sp) => Object.values(data.species[sp].baseStats).reduce((a, b) => a + b, 0);
	const avg = (fs) => { const l = fs.flatMap((f) => ['ra1', 'rb2', 'rc3'].flatMap((s) => D.genFloor(s, f, data).foes.filter((x) => !x.boss).map((x) => bst(x.sp)))); return l.reduce((a, b) => a + b, 0) / l.length; };
	A(avg([1, 2, 3, 4]) < avg([41, 42, 43, 44]) - 80, 'deeper floors field stronger species', [Math.round(avg([1, 2, 3, 4])), Math.round(avg([41, 42, 43, 44]))]);
	const legends = floors.flatMap(([s, f]) => D.genFloor(s, f, data).foes.filter((x) => D.isLegend(data.species[x.sp].num)).map((x) => ({ f, boss: !!x.boss })));
	A(legends.every((l) => l.boss && l.f >= 30), 'legendary Pokémon appear only as bosses, from floor 30', legends.filter((l) => !l.boss || l.f < 30).slice(0, 5));
	A(D.isLegend(150) && D.isLegend(1025) && !D.isLegend(25) && !D.isLegend(149), 'the legendary list: Mewtwo and Pecharunt are, Pikachu and Dragonite are not');

	// ---------- 4. boss floors
	for (const f of [10, 20, 50]) {
		const m = F(f), bosses = m.foes.filter((x) => x.boss);
		A(m.boss && bosses.length === 1 && bosses[0].lv === D.floorLevel(f, true) && m.reward.fig && m.reward.fig.sp === bosses[0].sp && m.reward.stars === 3 * (10 + 2 * f) && /Boss/.test(m.name), `floor ${f}: a boss floor (one boss Lv ${D.floorLevel(f, true)}, its figurine, triple stars)`);
	}
	A(!F(9).boss && !F(11).boss && !F(9).foes.some((x) => x.boss) && !F(9).reward.fig, 'other floors have no boss and no figurine reward');
	A(D.bossFigId('mew', 'rabc', 20) === 'mew-dgn-rabc-f20', 'the boss figurine id is the run\'s and the floor\'s');

	// ---------- 5. checkpoints
	A(JSON.stringify(D.startFloors(0)) === '[1]' && JSON.stringify(D.startFloors(10)) === '[1,11]' && JSON.stringify(D.startFloors(30)) === '[1,11,21,31]', 'new runs start on floor 1 or after a checkpoint reached');
	A(cleanFigs({ v: 1, figs: {}, deep: 20 }).deep === 20 && !('deep' in cleanFigs({ v: 1, figs: {}, deep: -3 })) && !('deep' in cleanFigs({ v: 1, figs: {}, deep: 'x' })), 'the collection keeps a checkpoint, cleaned');
	const base = { v: 1, figs: {} };
	A(merge3Figs(base, markDeep(base, 10), markDeep(base, 30)).deep === 30 && merge3Figs(base, markDeep(base, 40), markDeep(base, 30)).deep === 40, 'a sync keeps the deeper checkpoint');
	A(!sameFigs(base, markDeep(base, 10)) && markDeep(markDeep(base, 30), 10).deep === 30, 'a new checkpoint counts as a change; a shallower one never lowers it');

	// ---------- 6. the run on the device
	const mem = new Map(), LS = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
	A(D.loadRun(LS) === null, 'no run saved: none');
	const run = D.newRun(11, 12345);
	D.saveRun(run, LS);
	A(JSON.stringify(D.loadRun(LS)) === JSON.stringify({ seed: run.seed, floor: 11 }), 'a run is saved and loaded');
	D.saveRun(null, LS);
	A(D.loadRun(LS) === null, 'a finished run is cleared');
	for (const junk of ['{', '{"seed":"A B","floor":3}', '{"seed":"x","floor":0}', '{"seed":"x","floor":2.5}']) { mem.set(D.RUN_KEY, junk); A(D.loadRun(LS) === null, 'a bad saved run reads as none: ' + junk); }
	A(D.loadRun({ getItem() { throw new Error('blocked'); } }) === null, 'blocked storage reads as no run');
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
