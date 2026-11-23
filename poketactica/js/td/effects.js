// td/effects.js — what each move DOES in Tower Defense (Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md, "What a move does").
// Read from the data the battles already have (MOVE_FX, STAT_MOVES, the move's shape), so a new move is classed without
// a hand-kept list. Pure.
//   damage   hits every enemy on its shape's tiles (a dash is its line, a leap its target tile: the tower stays put)
//   foe      a status / stat-drop / knockback move aimed at enemies (asleep = stopped, paralysed = slowed, … : sim.js)
//   buff     the user's own boost, timed (its neighbours too at move level 99)
//   sp       a healing move: gives SP back (owner, 2026-11-23), to the towers its shape covers or to the user
//   weather  sets the weather for a while          paint  a terrain move paints Geo colour on its tiles
//   none     no use here (Protect, Taunt, Encore, Baton Pass…): never fired, and the squad screen says so
import { isDynamic } from '../engine/dynpower.js';
import { MOVE_FX } from '../../../overworld/rules/movefx.js';
import { STAT_MOVES } from '../../../overworld/rules/tables.js';

export const TD_KINDS = Object.freeze(['damage', 'foe', 'buff', 'sp', 'weather', 'paint', 'none']);
/** m: the move as moveOf gives it (shape, category, …). */
export function tdKind(id, m, dyn = true) {
	const fx = MOVE_FX[id] || {}, sm = STAT_MOVES[id];
	if (dyn && m.s !== 'swap' && m.category !== 'Status' && isDynamic(id)) return 'damage';   // (a worked-out power: engine/dynpower.js)
	if (m.s === 'swap') return 'none';
	if (fx.weather) return 'weather';
	if (fx.terrain) return 'paint';
	if (m.category !== 'Status') return m.power || fx.fixed || fx.ohko ? 'damage' : 'none';
	if (fx.heal || fx.healTarget) return 'sp';
	if (fx.status || fx.confuse) return m.t === 'self' || m.t === 'ally' ? 'none' : 'foe';
	if (sm) return sm.foe ? 'foe' : 'buff';
	if (m.kb) return 'foe';
	return 'none';
}
/** The share of max SP a healing move gives back (its share of max HP in a battle). */
export const healShare = (id) => { const fx = MOVE_FX[id] || {}; return fx.heal || fx.healTarget || 0.5; };
export const weatherOf = (id) => (MOVE_FX[id] || {}).weather || null;
export const terrainOf = (id) => (MOVE_FX[id] || {}).terrain || null;
