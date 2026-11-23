// td_auto.mjs — a headless auto-player for Tower Defense (Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md stage 5: tuning). It
// plays a map many times with a simple, sensible commander and prints how far the runs get, how long they take and what
// they pay, so the numbers can be set against each other and against the Dungeon.
// The commander: puts each figurine, as slots open, on the free tile that covers the most road for its longest-reaching
// attack (the early road first); calls every wave at once; buys a slot when it has the energy and a figurine waiting.
//   node tools/poketactica/td_auto.mjs [--map=td-loop | all] [--level=20] [--runs=6] [--squad=12] [--max=72000]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
import { TD_MAPS, tdMapById } from '../../poketactica/js/td/maps.js';
import { tdRewards } from '../../poketactica/js/td/rewards.js';
import { moveOf } from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { slimFig } from '../../poketactica/js/replay.js';
import { makeRng } from '../../overworld/rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
export const loadData = () => ({ species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') });

const LINES = [['bulbasaur', 16, 'ivysaur', 32, 'venusaur'], ['charmander', 16, 'charmeleon', 36, 'charizard'], ['squirtle', 16, 'wartortle', 36, 'blastoise'], ['pidgey', 18, 'pidgeotto', 36, 'pidgeot'],
	['pikachu', 999, 'pikachu', 999, 'pikachu'], ['geodude', 25, 'graveler', 999, 'graveler'], ['abra', 16, 'kadabra', 999, 'kadabra'], ['machop', 28, 'machoke', 999, 'machoke'],
	['gastly', 25, 'haunter', 999, 'haunter'], ['oddish', 21, 'gloom', 999, 'gloom'], ['magnemite', 30, 'magneton', 999, 'magneton'], ['growlithe', 999, 'growlithe', 999, 'growlithe']];
/** The squad a player would have at a level: 12 common figurines, evolved as far as the level allows. */
export const squadAt = (lv, n, data) => LINES.slice(0, n).map(([a, l1, b, l2, c], i) => makeFigurine(lv >= l2 ? c : lv >= l1 ? b : a, lv, makeRng('td' + i + lv), data, { id: 'auto-' + i, shinyRate: 0 }));

/** How far a figurine's longest damaging move reaches (in tiles, as the battle counts them). */
function reachOf(fig, data) {
	let best = 1;
	for (const id of fig.equipped) {
		const m = moveOf({ fig }, id, data);
		if (!m || tdKind(id, m) !== 'damage') continue;
		best = Math.max(best, ['line', 'cone', 'arc', 'dash'].includes(m.s) ? m.n || 1 : (m.r || [1, 1])[1] + (['dia', 'cross'].includes(m.s) ? m.n || 0 : 0));
	}
	return best;
}
/** The commander's orders for this moment. */
export function chooseOrders(S, data) {
	const out = [], W = S.B.map.w, H = S.B.map.h;
	if (S.phase === 'wait') out.push({ t: 'call' });
	const waiting = S.squad.map((_, i) => i).filter((i) => !S.placed[i]);
	if (waiting.length && TD.freeSlots(S) <= 0 && TD.slotsOf(S) < TD.SQUAD_MAX && S.energy >= TD.ENERGY.slot * (S.bought + 1)) out.push({ t: 'spend', kind: 'slot' });
	if (waiting.length && TD.freeSlots(S) > 0) {
		const fig = waiting[0], r = reachOf(S.squad[fig], data);
		let best = null;
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			if (TD.placeBlock(S, fig, x, y)) continue;
			let score = 0;
			for (const p of S.paths) p.forEach(([px, py], k) => { if (Math.abs(px - x) + Math.abs(py - y) <= r) score += 1 + 0.5 * (1 - k / p.length); });
			if (score > 0 && (!best || score > best.score)) best = { score, x, y };
		}
		if (best) out.push({ t: 'place', fig, x: best.x, y: best.y });
	}
	return out;
}
/** One run to its end (or `max` ticks). -> { wave, ticks, kills, lives, stars (banked), exp (all figurines'), over } */
export function autoRun(seed, map, squad, data, max = 72000) {
	const S = TD.newRun(seed, { map, squad: squad.map(slimFig) }, data);
	while (!S.over && S.tick < max) {
		if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) TD.applyInput(S, a, data);
		TD.step(S, [], data);
	}
	const r = tdRewards(S);
	return { wave: S.cleared, ticks: S.tick, kills: S.kills, lives: S.lives, stars: r.stars, exp: Object.values(r.exp).reduce((a, b) => a + b, 0), over: S.over, towers: S.towers.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const data = loadData(), runs = +arg('runs', 6), level = +arg('level', 20), size = +arg('squad', 12), max = +arg('max', 72000);
	const maps = arg('map', 'all') === 'all' ? TD_MAPS : [tdMapById(arg('map', 'td-loop'))];
	for (const m of maps) {
		const squad = squadAt(level, size, data), out = [];
		for (let k = 0; k < runs; k++) out.push(autoRun('auto-' + m.id + '-' + k, m, squad, data, max));
		const avg = (f) => out.reduce((a, o) => a + f(o), 0) / out.length, min = (o) => o.ticks / TD.TPS / 60;
		console.log(`${m.name}, ${size} at Lv ${level}: waves ${Math.min(...out.map((o) => o.wave))}-${Math.max(...out.map((o) => o.wave))} (avg ${avg((o) => o.wave).toFixed(1)}) · ${avg(min).toFixed(1)} min at 1× · ${avg((o) => o.stars).toFixed(0)} ★ a run = ${(avg((o) => o.stars) / avg(min)).toFixed(1)} ★/min · EXP ${avg((o) => o.exp).toFixed(0)} = ${(avg((o) => o.exp) / avg(min)).toFixed(0)}/min · unfinished ${out.filter((o) => !o.over).length}`);
	}
}
