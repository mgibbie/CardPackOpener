// replay.js — a Poketactica battle's REPLAY (stage 8): its recipe, re-run by the engine. The engine is deterministic from
// its seed (engine/battle.js: every action, the enemy phase's included, goes through act()), so a battle is
//   { v, seed, setup: { map, player: [figurine], enemy: [{ fig, x, y, ai }] }, actions: [action], label, won }
// or, an online match (PvP, 2-4 seats): setup { map, pvp: { seats: [{ team: [figurine], base: {x, y}, cpu? }] } }
// and the viewer rebuilds it action by action with the same animations the player saw. The figurines are slimmed to what
// a battle reads (species, level, ability, the equipped moves and their levels). The recipe is packed (battlecards/codec.js
// gzip + base64url) and stored with the site's generic tape store (replay-put / replay-get, 30 days, public to read):
// /poketactica/?replay=<id>. Pure: node-tested (overworld/tests/poketactica_replay_test.mjs).
import { packString, unpackString } from '../../battlecards/codec.js';
import { newBattle, act } from './engine/battle.js';

export const REPLAY_V = 1, ACTIONS_MAX = 6000;
export const REPLAY_ID_RE = /^[a-f0-9]{8,20}$/;
const ACTION_T = new Set(['deploy', 'move', 'undo', 'throw', 'wait', 'attack', 'unqueue', 'order', 'execute', 'end', 'concede', 'idle']);

/** A figurine as a battle reads it (no EXP bar, no unequipped moves; its held item, which the battle reads). */
export function slimFig(f) {
	const eq = [...(f.equipped || [])];
	return { id: String(f.id || ''), species: f.species, level: f.level, exp: f.exp || 0, ability: f.ability ?? null, shiny: !!f.shiny,
		pool: (f.pool || []).filter((p) => eq.includes(p.id)).map((p) => ({ id: p.id, lv: p.lv || 1, xp: 0 })), equipped: eq, ...(f.held ? { held: String(f.held) } : {}) };
}
/** The recipe of a battle: its seed, its setup (figurines slimmed) and the actions taken. */
export function recipeOf(seed, setup, actions, extra = {}) {
	return {
		v: REPLAY_V, seed: String(seed),
		setup: setup.pvp ? { ...(setup.rev ? { rev: setup.rev } : {}), map: setup.map, pvp: { seats: setup.pvp.seats.map((st) => ({ team: st.team.map(slimFig), base: { x: st.base.x, y: st.base.y }, ...(st.cpu ? { cpu: true } : {}) })), ...(setup.pvp.foes && setup.pvp.foes.length ? { foes: setup.pvp.foes.map((e) => ({ fig: slimFig(e.fig), x: e.x, y: e.y, ai: e.ai })) } : {}) } }
			: { ...(setup.rev ? { rev: setup.rev } : {}), ...(setup.noBonus ? { noBonus: true } : {}), map: setup.map, player: setup.player.map(slimFig), enemy: setup.enemy.map((e) => ({ fig: slimFig(e.fig), x: e.x, y: e.y, ai: e.ai })) },
		actions: actions.map((a) => ({ ...a })),
		...(extra.label ? { label: String(extra.label).slice(0, 64) } : {}), ...(extra.won != null ? { won: !!extra.won } : {}),
	};
}
/** Is this a recipe the viewer can play? */
export function validRecipe(r) {
	if (!r || typeof r !== 'object' || r.v !== REPLAY_V || typeof r.seed !== 'string' || !r.seed) return false;
	const s = r.setup;
	if (!s || !s.map || !Array.isArray(s.map.height) || !(s.map.w > 0 && s.map.h > 0) || s.map.height.length !== s.map.w * s.map.h) return false;
	const figOk = (f) => f && typeof f.species === 'string' && Number.isInteger(f.level) && Array.isArray(f.equipped) && Array.isArray(f.pool);
	if (s.pvp) {
		const seats = s.pvp.seats;
		if (!Array.isArray(seats) || seats.length < 2 || seats.length > 4 || !seats.every((st) => st && Array.isArray(st.team) && st.team.length <= 6 && st.team.every(figOk) && st.base && Number.isInteger(st.base.x) && Number.isInteger(st.base.y))) return false;
		if (s.pvp.foes != null && !(Array.isArray(s.pvp.foes) && s.pvp.foes.length <= 64 && s.pvp.foes.every((e) => e && figOk(e.fig) && Number.isInteger(e.x) && Number.isInteger(e.y)))) return false;
		return Array.isArray(r.actions) && r.actions.length <= ACTIONS_MAX && r.actions.every((a) => a && ACTION_T.has(a.t));
	}
	if (!Array.isArray(s.player) || !s.player.length || s.player.length > 6 || !s.player.every(figOk)) return false;
	if (!Array.isArray(s.enemy) || !s.enemy.length || !s.enemy.every((e) => e && figOk(e.fig) && Number.isInteger(e.x) && Number.isInteger(e.y))) return false;
	return Array.isArray(r.actions) && r.actions.length <= ACTIONS_MAX && r.actions.every((a) => a && ACTION_T.has(a.t));
}
export const packRecipe = (r) => packString(JSON.stringify(r));
export async function unpackRecipe(code) {
	const s = await unpackString(code);
	if (!s) return null;
	try { const r = JSON.parse(s); return validRecipe(r) ? r : null; } catch { return null; }
}
/** The battle after the first k actions (and each step's events, when `onStep` is given). */
export function replayTo(r, k, data, onStep) {
	const S = newBattle(r.seed, r.setup, data);
	for (let i = 0; i < Math.min(k, r.actions.length); i++) { const res = act(S, r.actions[i], data); if (onStep) onStep(i, res); }
	return S;
}
