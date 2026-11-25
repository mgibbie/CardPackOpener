// td/replay.js — a Tower Defense run as a RECIPE (owner, 2026-11-23: spectating and replays are required). The sim is
// exact (td/sim.js), so a run is
//   { v, kind: 'td', rev, seed, map (a td/maps.js id), squad: [slimmed figurine], startWave, inputs: [[tick, order]], end, wave, label }
// and is re-run to any tick. The same recipe is a replay (the site's tape store), a live broadcast (the recipe so far +
// the tick the player is on: a spectator runs the same sim a moment behind) and a resume (this device's saved run).
// Pure: node-tested (overworld/tests/poketactica_td_replay_test.mjs).
import { slimFig } from '../replay.js';
import * as TD from './sim.js';
import { tdMapById } from './maps.js';
import { heroById } from './heroes.js';

export const TD_REPLAY_V = 1, TD_INPUTS_MAX = 20000, TD_END_MAX = 20 * 3600 * 12;   // (12 hours of ticks)
const ORDERS = new Set(['place', 'recall', 'rule', 'toggle', 'spend', 'throw', 'call', 'retire', 'block', 'unblock', 'lift', 'draw', 'discard', 'pick', 'perk', 'reroll']);   // (the last eight: Maze Builder)

/** The recipe of a run so far (or of a finished one). */
export function tdRecipe({ seed, mapId, squad, startWave = 1, inputs, end, wave = 0, over = null, hero = null, rev = 0 }) {
	const m = tdMapById(mapId);
	return { v: TD_REPLAY_V, kind: 'td', rev: rev || TD.TD_RULES_REV, seed: String(seed), map: mapId, squad: squad.map(slimFig), startWave: Math.max(1, startWave | 0), inputs: inputs.map(([t, a]) => [t, { ...a }]), end: end | 0, wave: wave | 0,
		...(over ? { over } : {}), ...(hero ? { hero } : {}), label: ((m && m.gates ? 'Maze Builder · ' : 'Tower Defense · ') + (m ? m.name : mapId) + (hero && heroById(hero) ? ' · ' + heroById(hero).name : '') + ' · wave ' + (wave | 0)).slice(0, 64) };
}
export function validTdRecipe(r) {
	if (!r || r.kind !== 'td' || r.v !== TD_REPLAY_V || typeof r.seed !== 'string' || !r.seed || !tdMapById(r.map)) return false;
	if (r.hero != null && !heroById(r.hero)) return false;
	const figOk = (f) => f && typeof f.species === 'string' && Number.isInteger(f.level) && Array.isArray(f.equipped) && Array.isArray(f.pool);
	if (!Array.isArray(r.squad) || !r.squad.length || r.squad.length > TD.SQUAD_MAX || !r.squad.every(figOk)) return false;
	if (!Number.isInteger(r.end) || r.end < 0 || r.end > TD_END_MAX || !Number.isInteger(r.startWave) || r.startWave < 1) return false;
	if (!Array.isArray(r.inputs) || r.inputs.length > TD_INPUTS_MAX) return false;
	let last = 0;
	for (const e of r.inputs) { if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < last || !e[1] || !ORDERS.has(e[1].t)) return false; last = e[0]; }
	return true;
}
/** A fresh run from a recipe's head. */
export const tdNewRun = (r, data) => TD.newRun(r.seed, { map: tdMapById(r.map, r.rev || 1), squad: r.squad, startWave: r.startWave, rev: r.rev || 1, ...(r.hero ? { hero: r.hero } : {}) }, data);
/**
 * Drives a run from a recipe's orders. An order written down on tick T was given while the run stood on tick T, before
 * that tick's step: so each order is applied when the run stands on its tick, then time moves on. `settle` applies the
 * orders of the tick the run stands on without moving time (the last orders before a save, a broadcast, a retire).
 *   d.S            the run            d.step() -> events of one tick (orders of this tick first)
 *   d.to(tick)     step on to a tick and settle there          d.settle() -> events
 *   d.setInputs(list)   a longer list of the same run (a live broadcast grows)
 *   d.mark() / d.restore(m)   a snapshot of the run and of how far into the orders it is
 */
export function tdDriver(r, data) {
	let S = tdNewRun(r, data), inputs = r.inputs, k = 0;
	const settle = () => {
		const ev = [];
		while (k < inputs.length && inputs[k][0] <= S.tick && !S.over) { if (inputs[k][0] === S.tick) { S.ev = []; TD.applyInput(S, inputs[k][1], data); ev.push(...S.ev); } k++; }
		return ev;
	};
	const d = {
		get S() { return S; },
		settle,
		step() { const ev = settle(); if (S.over) return ev; TD.step(S, [], data); return ev.concat(S.ev); },
		to(tick, onEv) { while (S.tick < tick && !S.over) { const ev = d.step(); if (onEv) onEv(ev, S); } const ev = settle(); if (onEv && ev.length) onEv(ev, S); return S; },
		setInputs(list) { inputs = list; },
		mark: () => ({ snap: TD.toSnapshot(S), k }),
		restore(m) { S = TD.fromSnapshot(m.snap); k = m.k; },
	};
	return d;
}
/** The run a recipe describes, at `tick` (its end when not given). */
export function tdRunTo(r, tick, data, onEv) {
	return tdDriver(r, data).to(tick == null ? r.end : Math.min(tick, r.end), onEv);
}
