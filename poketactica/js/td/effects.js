// td/effects.js — what each move DOES in Tower Defense (Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md, "What a move does").
// Read from the data the battles already have (MOVE_FX, STAT_MOVES, the move's shape), so a new move is classed without
// a hand-kept list. Pure.
//   damage   hits every enemy on its shape's tiles (a dash is its line, a leap its target tile: the tower stays put)
//   foe      a status / stat-drop / knockback move aimed at enemies (asleep = stopped, paralysed = slowed, … : sim.js)
//   buff     the user's own boost, timed (its neighbours too at move level 99)
//   sp       a healing move: gives SP back (owner, 2026-11-23), to the towers its shape covers or to the user
//   weather  sets the weather for a while          paint  a terrain move paints Geo colour on its tiles
//   field    Gravity / Trick Room for a while (TD_RULES_REV 9)
//   trap     an entry hazard laid on the road (TD_RULES_REV 10): an enemy that walks over it takes each kind once
//   none     no use here (Protect, Taunt, Encore, Baton Pass…): never fired, and the squad screen says so
// TD_RULES_REV 9 (owner, 2026-11-23: "status moves in TD"): the status moves the battle rules gained since (statusfx.js,
// statusfx2.js) had no kind here, so a tower that knew only those never fired. The ones with something to do on a
// road get one: a boost for the tower (Belly Drum, Focus Energy, Lock-On ...), a change to an enemy (Soak, Gastro
// Acid, Foresight; Mean Look and its kin stop it walking for a moment), SP for the healing ones the owner's rule
// already covered in spirit (Wish, Aqua Ring ...), the two field moves, and Metronome / Nature Power as attacks.
// What guards a unit, or needs a foe that acts (Protect, Substitute, Taunt, Encore), still has no use: a tower is
// never attacked and its enemies only walk.
import { isDynamic } from '../engine/dynpower.js';
import { isAnswer } from '../engine/statusfx.js';
import { isHazard } from '../engine/statusfx3.js';
import { MOVE_FX } from '../../../overworld/rules/movefx.js';
import { STAT_MOVES } from '../../../overworld/rules/tables.js';

export const TD_KINDS = Object.freeze(['damage', 'foe', 'buff', 'sp', 'weather', 'paint', 'field', 'trap', 'none']);
const BUFF9 = new Set(['acupressure', 'bellydrum', 'clangoroussoul', 'filletaway', 'geomancy', 'tidyup', 'takeheart', 'coaching', 'decorate', 'spicyextract', 'focusenergy', 'dragoncheer', 'laserfocus', 'lockon', 'mindreader']);
const FOE9 = new Set(['soak', 'magicpowder', 'forestscurse', 'trickortreat', 'gastroacid', 'worryseed', 'simplebeam', 'foresight', 'odorsleuth', 'miracleeye', 'defog']);
/** Mean Look and its kin: in a battle the foe cannot leave its tile; on the road it stops walking for a moment. */
export const TRAP9 = new Set(['meanlook', 'block', 'spiderweb', 'fairylock', 'octolock']);
const SP9 = { wish: 0.5, aquaring: 0.25, ingrain: 0.25, swallow: 0.25, healingwish: 0.5, lunardance: 0.5 };
const FIELD9 = new Set(['gravity', 'trickroom']);
const CALL9 = new Set(['metronome', 'naturepower']);
/** A boost that is still on the tower (a tower's marks do not run out): no use firing it again yet. */
export const buffHeld = (id, u) => ((id === 'focusenergy' || id === 'dragoncheer') && !!u.focus) || ((id === 'lockon' || id === 'mindreader') && !!(u.fx && u.fx.sureHit)) || (id === 'laserfocus' && !!(u.fx && u.fx.sureCrit));
export const isCall9 = (id) => CALL9.has(id);
/** m: the move as moveOf gives it (shape, category, …). */
export function tdKind(id, m, rev = Infinity, tdRev = Infinity) {   // (rev: the battle rules the run is played by, tdRev: Tower Defense's own; a replay of an older run passes its own)
	const fx = MOVE_FX[id] || {}, sm = STAT_MOVES[id], dyn = rev >= 4;
	if (rev >= 5 && isAnswer(id)) return 'none';   // (Counter and its kin answer a hit, and nothing hits a tower)
	if (dyn && m.s !== 'swap' && m.category !== 'Status' && isDynamic(id)) return 'damage';   // (a worked-out power: engine/dynpower.js)
	if (m.s === 'swap') return 'none';
	if (fx.weather) return 'weather';
	if (fx.terrain) return 'paint';
	if (m.category !== 'Status') return m.power || fx.fixed || fx.ohko ? 'damage' : 'none';
	if (tdRev >= 10 && isHazard(id)) return 'trap';
	if (tdRev >= 9) {
		if (CALL9.has(id)) return 'damage';
		if (BUFF9.has(id)) return 'buff';
		if (FOE9.has(id) || TRAP9.has(id)) return 'foe';
		if (SP9[id]) return 'sp';
		if (FIELD9.has(id)) return 'field';
	}
	if (fx.heal || fx.healTarget) return 'sp';
	if (fx.status || fx.confuse) return m.t === 'self' || m.t === 'ally' ? 'none' : 'foe';
	if (sm) return sm.foe ? 'foe' : 'buff';
	if (m.kb) return 'foe';
	return 'none';
}
/** The share of max SP a healing move gives back (its share of max HP in a battle). */
export const healShare = (id) => { const fx = MOVE_FX[id] || {}; return fx.heal || fx.healTarget || SP9[id] || 0.5; };
export const weatherOf = (id) => (MOVE_FX[id] || {}).weather || null;
export const terrainOf = (id) => (MOVE_FX[id] || {}).terrain || null;
