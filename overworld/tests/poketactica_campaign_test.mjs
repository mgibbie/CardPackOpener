// poketactica_campaign_test.mjs — Campaign v1 (stage 6, poketactica/js/campaign.js): every hand-built map is checked, so a
// map that can't be played never ships.
//   1. each map: its rows and Geo are one size; heights are 0-9 or a gap; the base tile is a tile, clear of foes and
//      symbols; every foe and symbol is on a tile, none share one; every foe can be reached from the base on foot (Jump 2,
//      the lowest any figurine has) and every symbol can be walked up to (it is broken by attacking its tile); every
//      symbol's effect is one the engine knows and sits on a coloured tile (or it would do nothing)
//   2. every species, listed move and reward figurine is real; levels 1-999; a tip for every map; six chapters (Kanto's
//      three, then Johto's: Ilex Woods, the Whirl Isles, Tin Tower) with a boss at the end of each, holding a held item,
//      the top level of its chapter, its figurine the reward; foe levels and boss stars rise chapter by chapter; ids unique
//   3. the engine builds every map (battle.js newBattle) with a team of three starters
//   4. opening order: the first map is open, each next one opens when the one before is cleared (across chapters too:
//      clearing c3-2 opens c4-1); nextMap walks them
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
import { HELD } from '../../poketactica/js/goods.js';
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

	// ---------- the six chapters (Kanto's three, then Johto's: owner, 2026-11-22 "more story chapters")
	A(C.CHAPTERS.length === 6 && C.CHAPTERS.every((ch, i) => ch.n === i + 1 && ch.name), 'six chapters, numbered 1-6', C.CHAPTERS.map((c) => c.n + ' ' + c.name));
	A(C.MAPS.every((m, i) => i === 0 || m.chapter === C.MAPS[i - 1].chapter || m.chapter === C.MAPS[i - 1].chapter + 1), 'the maps run in chapter order, no chapter skipped', C.MAPS.map((m) => m.id));
	A(C.MAPS.every((m) => m.id.startsWith('c' + m.chapter + '-')), "every map's id names its chapter");
	const chs = C.CHAPTERS.map((ch) => {
		const ms = C.MAPS.filter((m) => m.chapter === ch.n), lvs = ms.flatMap((m) => m.foes.map((f) => f.lv)), last = ms[ms.length - 1];
		return { ch, ms, lo: Math.min(...lvs), hi: Math.max(...lvs), last, boss: last.foes.find((f) => f.boss), stars: Math.min(...ms.map((m) => m.reward.stars)) };
	});
	for (const c of chs) {
		const at = `chapter ${c.ch.n} (${c.ch.name})`;
		A(c.last.boss === true && !!c.boss && c.ms.slice(0, -1).every((m) => !m.boss && !m.foes.some((f) => f.boss)), `${at}: only its last map is a boss map, with one boss foe`);
		A(!!c.boss && !!HELD[c.boss.held], `${at}: its boss holds a held item (${c.boss && c.boss.held})`);
		A(!!c.boss && c.boss.lv === c.hi && c.ms.every((m) => m.foes.every((f) => f === c.boss || f.lv < c.boss.lv)), `${at}: its boss is the top level in the chapter (${c.boss && c.boss.lv})`);
		A(!!c.boss && !!c.last.reward.fig && c.last.reward.fig.sp === c.boss.sp && c.last.reward.fig.lv < c.boss.lv && c.last.reward.fig.lv >= c.boss.lv - 5, `${at}: the boss map's reward is that boss's figurine, a little below its level`, c.last.reward.fig);
	}
	for (let i = 1; i < chs.length; i++) {
		const a = chs[i - 1], b = chs[i];
		A(b.lo >= a.lo && b.hi > a.hi && b.boss.lv > a.boss.lv, `levels rise from chapter ${a.ch.n} to ${b.ch.n} (${a.lo}-${a.hi} -> ${b.lo}-${b.hi})`);
		A(b.last.reward.stars > a.last.reward.stars && b.stars >= a.stars, `stars rise from chapter ${a.ch.n} to ${b.ch.n} (boss ${a.last.reward.stars} -> ${b.last.reward.stars})`);
	}
	// the Johto chapters: 3-4 maps each, every map a mix of AI kinds across the chapter, some non-boss maps paying a figurine
	for (const c of chs.filter((c) => c.ch.n >= 4)) {
		const at = `chapter ${c.ch.n} (${c.ch.name})`;
		A(c.ms.length >= 3 && c.ms.length <= 4, `${at}: three or four maps (${c.ms.length})`);
		const ais = new Set(c.ms.flatMap((m) => m.foes.map((f) => f.ai)));
		A(['aggro', 'passive', 'hold'].every((k) => ais.has(k)), `${at}: its foes mix aggro, passive and hold`, [...ais]);
		A(c.ms.every((m) => m.foes.length >= 3 && m.foes.length <= 6), `${at}: every map has 3-6 foes`);
		A(c.ms.some((m) => (m.symbols || []).length || m.rows.some((r) => /[2-9]/.test(r))), `${at}: it uses Geo symbols or height`);
	}
	A(chs.filter((c) => c.ch.n >= 4).flatMap((c) => c.ms.slice(0, -1)).filter((m) => m.reward.fig).length >= 2, 'some Johto non-boss maps pay a figurine');
	A(C.MAPS.filter((m) => m.chapter === 5).some((m) => m.rows.some((r) => r.includes('#'))), 'the Whirl Isles have sea gaps');
	A(Math.max(...C.MAPS.filter((m) => m.chapter === 6).flatMap((m) => m.rows.join('').split('').filter((ch) => /[1-9]/.test(ch)).map(Number))) === 9, 'Tin Tower climbs to height 9');
	A(chs[5].boss.sp === 'hooh', 'the last boss is Ho-Oh', chs[5].boss.sp);

	// ---------- 4. opening order
	A(C.isOpen(C.MAPS[0].id, []) && !C.isOpen(C.MAPS[1].id, []), 'a new player has the first map open, the second shut');
	A(C.isOpen(C.MAPS[1].id, [C.MAPS[0].id]), 'clearing a map opens the next');
	A(C.nextMap([]).id === C.MAPS[0].id && C.nextMap([C.MAPS[0].id]).id === C.MAPS[1].id && C.nextMap(C.MAPS.map((m) => m.id)) === null, 'nextMap walks the maps in order; null when all are cleared');
	{
		const upTo = (id) => C.MAPS.slice(0, C.MAPS.findIndex((m) => m.id === id) + 1).map((m) => m.id);
		A(!C.isOpen('c4-1', upTo('c3-1')) && C.isOpen('c4-1', upTo('c3-2')), 'clearing c3-2 (the Thunder Spire boss) opens c4-1, and nothing before it does');
		A(C.nextMap(upTo('c3-2')).id === 'c4-1' && C.nextMap(upTo('c4-4')).id === 'c5-1' && C.nextMap(upTo('c5-4')).id === 'c6-1', 'each chapter boss leads on to the next chapter');
		A(C.nextMap(upTo('c6-4')) === null && C.MAPS[C.MAPS.length - 1].id === 'c6-4', "Ho-Oh's Rainbow Crown is the last map");
	}

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
