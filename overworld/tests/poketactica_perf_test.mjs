// poketactica_perf_test.mjs — big maps stay quick (owner, 2026-11-22: "phone speed check on big maps"). On a 32 x 32 map
// with 4 seats and 24 wild foes the computers' turn took ~1 s on a slowed phone: the engine looked at every tile of the
// map for every spot and move. Now:
//   - aimTiles looks only at the box a move can reach (the same tiles, in the same order)
//   - threat works out a shape aimed at a tile (not from its user's place) once per aim tile, not once per spot
//   - the AI skips the forecast of an aim that covers no one (it would score 0)
//   - the whole-map shape doesn't search its own list for every tile
// Each is checked two ways: the SAME answers as the plain way (written out here), and work that doesn't grow with the map
// (timed on a 12 x 12 and a 32 x 32 map: the old way took ~7 times as long on the big one). Then a seeded 4-seat match with foes on 32 x 32 plays out.
//   node overworld/tests/poketactica_perf_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as Ed from '../../poketactica/js/editor.js';
import { shapeTiles, heightReach, manhattan, isTile, key } from '../../poketactica/js/engine/grid.js';
import { enemyTurn } from '../../poketactica/js/engine/ai.js';
import { matchSetup } from '../../poketactica/js/arenas.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };

// ---- the plain ways (what the engine did before), to compare against
const NO_AIM = new Set(['self', 'burst', 'aura', 'map']), BY_DIR = new Set(['line', 'cone', 'arc', 'dash']);
function aimPlain(S, u, m) {
	if (NO_AIM.has(m.s)) return [[u.x, u.y]];
	if (BY_DIR.has(m.s)) return [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [u.x + dx, u.y + dy]).filter(([x, y]) => isTile(S.map, x, y));
	const out = [];
	for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) {
		const d = manhattan(u.x, u.y, x, y);
		if (d < m.r[0] || d > m.r[1] || !isTile(S.map, x, y)) continue;
		if (m.s !== 'leap' && !heightReach(S.map, m.h, u.x, u.y, x, y)) continue;
		out.push([x, y]);
	}
	return out;
}
function threatPlain(S, e) {
	const spots = e.ai === 'hold' ? [[e.x, e.y]] : [...B.moveTiles(S, e).values()].map((t) => [t.x, t.y]);
	const hit = new Set();
	for (const [sx, sy] of spots) {
		const at = { ...e, x: sx, y: sy };
		for (const mid of e.fig.equipped) {
			const m = B.moveOf(e, mid, data);
			if (!m || (e.pp[mid] || 0) < 1 || e.sp < m.spCost || m.category === 'Status' || m.s === 'self' || B.heldBlock(e, mid, data)) continue;
			for (const [ax, ay] of aimPlain(S, at, m)) for (const [x, y] of shapeTiles(S.map, m, sx, sy, ax, ay)) if (isTile(S.map, x, y)) hit.add(key(x, y));
		}
	}
	return [...hit].sort();
}

// ---- a made map with heights, ground and foes; matches on it
function bigMatch(n, seed, nFoes = 24) {
	const rng = makeRng('map' + seed);
	let m = Ed.newMap('Perf', n, n);
	m = Ed.apply(Ed.apply(m, 'seat', 0, 0).map, 'seat', n - 1, n - 1).map;
	const sps = ['machamp', 'gengar', 'dragonite', 'tyranitar', 'pikachu', 'snorlax', 'alakazam', 'gyarados'];
	for (let i = 0; i < nFoes; i++) { const r = Ed.apply(m, 'foe', 2 + Math.floor(rng() * (n - 4)), 2 + Math.floor(rng() * (n - 4)), { foe: { sp: sps[i % sps.length], lv: 40, ai: ['aggro', 'passive', 'hold'][i % 3] } }); if (r.map) m = r.map; }
	for (let i = 0; i < n * 3; i++) { const r = Ed.apply(m, rng() < 0.6 ? 'raise' : 'lower', Math.floor(rng() * n), Math.floor(rng() * n)); if (r.map) m = r.map; }
	const picks = (k) => ['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'machop', 'geodude', 'abra', 'gastly', 'eevee', 'growlithe'].slice(k, k + 5);
	const config = { arena: 'custom', map: m, lv: 50, seats: [{ name: 'me', team: picks(0).map((sp, i) => makeFigurine(sp, 45, makeRng('me' + seed + i), data, { id: sp + '-me' + i, shinyRate: 0 })) }, ...[1, 2, 3].map((k) => ({ name: 'CPU' + k, cpu: true, picks: picks(k), level: 50 }))] };
	return B.newBattle('perf' + seed, matchSetup(config, 'perf' + seed, data, makeFigurine, makeRng), data);
}
// how long fn takes, run many times (the best of 3, after a warm-up)
function timed(fn, n) {
	for (let i = 0; i < n; i++) fn();
	let best = Infinity;
	for (let k = 0; k < 3; k++) { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); best = Math.min(best, performance.now() - t0); }
	return best;
}
const SAME_COST = 2.5;   // (32 x 32 has 7 times the tiles: work tied to the map is ~7 times the cost; work that isn't, ~1)

try {
	// ---------- aimTiles: the same tiles in the same order, for every shape, all over a 32 x 32 map
	{
		const S = bigMatch(32, 'a');
		const u = S.units.find((x) => x.x != null);
		const moveIds = Object.keys(data.shapes).filter((id) => data.moves[id]).slice(0, 400);
		let cases = 0, bad = null;
		for (let i = 0; i < moveIds.length && !bad; i++) {
			const at = { ...u, x: (i * 7) % 32, y: (i * 13) % 32 };
			if (!isTile(S.map, at.x, at.y)) continue;
			const m = B.moveOf(at, moveIds[i], data); if (!m) continue;
			const a = JSON.stringify(B.aimTiles(S, at, m)), b = JSON.stringify(aimPlain(S, at, m));
			cases++; if (a !== b) bad = { move: moveIds[i], at: [at.x, at.y], a: a.slice(0, 80), b: b.slice(0, 80) };
		}
		A(!bad && cases > 300, `aimTiles: the same tiles in the same order as a whole-map scan (${cases} moves, at the edges too)`, bad);
		// the work: a short-range move costs the same on a 12 x 12 map as on a 32 x 32 one
		const S12 = bigMatch(12, 'w', 0), S32 = bigMatch(32, 'w', 0);
		for (const S of [S12, S32]) S.map.height.fill(0);   // (flat ground: the same neighbourhood on both)
		const probe = (S) => { const v = { ...S.units.find((x) => x.side === 'b'), x: 5, y: 5 }; const m = B.moveOf(v, 'tackle', data); return timed(() => B.aimTiles(S, v, m), 4000); };
		const r12 = probe(S12), r32 = probe(S32);
		A(r32 < r12 * SAME_COST, 'aimTiles: a short-range move costs about the same on 32 x 32 as on 12 x 12', [+r12.toFixed(1), +r32.toFixed(1)]);
	}
	// ---------- threat (the enemy range and the AI's danger map): the same tiles as the plain way; work not tied to the map
	{
		let bad = null, cases = 0;
		for (const seed of ['t1', 't2', 't3']) {
			const S = bigMatch(32, seed);
			for (const e of S.units.filter((x) => x.x != null && x.hp > 0)) {
				const a = B.threat(S, e, data).attack.map(([x, y]) => key(x, y)).sort(), b = threatPlain(S, e);
				cases++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad = { seed, uid: e.uid, sp: e.fig.species, a: a.length, b: b.length }; break; }
			}
			if (bad) break;
		}
		A(!bad && cases >= 30, `threat: the same tiles as working every spot and aim out in full (${cases} units on 32 x 32 maps)`, bad);
		// the work: a Tyranitar (Rock Slide, Thrash, Crunch: shapes aimed at a tile) in the middle of flat 32 x 32 ground,
		// counted in tiles read. Working every (spot, aim) out read 23,040; once per aim tile, ~7,700.
		const S = bigMatch(32, 'w', 0);
		S.map.height.fill(0);
		const fig = makeFigurine('tyranitar', 50, makeRng('tyranitar'), data, { id: 'tyranitar-perf', shinyRate: 0 });
		const u = S.units.find((x) => x.side === 'b');
		const e = { ...u, fig, x: 15, y: 15, hp: u.maxHP, ai: 'aggro', pp: Object.fromEntries(fig.equipped.map((k) => [k, 10])), sp: 999 };
		let reads = 0;
		const h = S.map.height;
		S.map = { ...S.map, height: new Proxy(h, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return t[k]; } }) };
		B.threat(S, e, data);
		A(reads > 0 && reads < 12000, `threat: a shape aimed at a tile is worked out once per aim tile, not once per spot (${reads} tiles read; 23,040 before)`, { reads, moves: fig.equipped });
	}
	// ---------- the AI: a forecast only for aims that cover someone (an aim covering no one scores 0 anyway)
	{
		const S = bigMatch(32, 'ai');
		B.act(S, { t: 'end', by: 'a' }, data);   // (the computer seats deploy)
		const e = S.units.find((x) => x.side === 'e' && x.x != null && x.hp > 0);
		e.ai = 'aggro';
		// a seat's figurine two tiles from it: in reach, so there is something worth forecasting
		const v = S.units.find((x) => x.side === 'b' && x.x != null && x.hp > 0);
		const spot = [[2, 0], [0, 2], [-2, 0], [0, -2]].map(([dx, dy]) => [e.x + dx, e.y + dy]).find(([x, y]) => isTile(S.map, x, y) && !B.unitAt(S, x, y));
		v.x = spot[0]; v.y = spot[1];
		// every aim it looks at: those covering a figurine get a forecast; for the others the forecast (asked here) is empty
		let calls = 0, aims = 0, covering = 0, skippedButHits = 0;
		const ALWAYS = new Set(['self', 'dash', 'leap', 'swap']);
		const api = { ...B.AI_API,
			aimTiles: (S1, u, m) => {
				const t = B.aimTiles(S1, u, m);
				for (const [ax, ay] of t) {
					aims++;
					const covers = ALWAYS.has(m.s) || shapeTiles(S1.map, m, u.x, u.y, ax, ay).some(([x, y]) => (x === u.x && y === u.y) || B.unitAt(S1, x, y));
					if (covers) covering++;
					else { const f = B.forecast(S1, u, m.id, ax, ay, data); if (f && f.targets.length) skippedButHits++; }
				}
				return t;
			},
			forecast: (...a) => { calls++; return B.forecast(...a); } };
		enemyTurn(S, e, data, api);
		A(calls > 0 && calls < aims, 'the AI forecasts fewer aims than it looks at', { calls, aims });
		A(skippedButHits === 0 && calls <= covering, 'every aim it skips would have hit no one (skipping changes no choice)', { skippedButHits, calls, covering });
	}
	// ---------- shapeTiles 'map' (Earthquake-style): every tile once, quickly
	{
		const S = bigMatch(32, 'm', 0);
		const t0 = performance.now(); let tiles;
		for (let i = 0; i < 50; i++) tiles = shapeTiles(S.map, { s: 'map' }, 0, 0, 0, 0);
		const want = S.map.height.filter((h) => h != null).length;
		A(tiles.length === want && new Set(tiles.map(([x, y]) => key(x, y))).size === want, 'the whole-map shape: every tile, once', [tiles.length, want]);
		A(performance.now() - t0 < 400, 'the whole-map shape doesn\'t search its own list (50 on 32 x 32 well under 0.4 s)', +(performance.now() - t0).toFixed(0));
	}
	// ---------- a whole 4-seat match with 24 foes on 32 x 32 plays out
	{
		const S = bigMatch(32, 'full');
		B.act(S, { t: 'deploy', uid: S.units.find((u) => u.side === 'a').uid, by: 'a' }, data);
		let rounds = 0;
		for (; rounds < 40 && !S.over; rounds++) B.act(S, { t: 'end', by: 'a' }, data);
		A(S.over === 'done' && 'abcd'.includes(S.pvp.winner), 'a 4-seat match with wild foes on 32 x 32 ends with a winner', [S.over, S.pvp && S.pvp.winner, rounds]);
	}
} catch (e) { A(false, 'the run threw', e && e.stack); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
