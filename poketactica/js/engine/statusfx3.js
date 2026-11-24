// statusfx3.js — battle RULES_REV 11: entry hazards, knockback, and a few more of the moves that did nothing.
//
// ENTRY HAZARDS on the grid (Spikes, Toxic Spikes, Stealth Rock, Sticky Web). In Pokémon they bite whoever switches in;
// nobody switches on a board, so they are TRAP TILES: the move lays them on the tiles it covers (S.hazards), they stay,
// and a unit of another side that is standing on one when its own side's phase ends takes it. Ending a phase there is
// the player's choice (a walk can still be undone), and the tiles are marked on the board.
//   spikes       an eighth of its HP                      toxicspikes  poisoned (a Poison type soaks them up instead)
//   stealthrock  an eighth, by how Rock hits its types    stickyweb    Speed -1, once
// Flying types, Levitate and a Magnet Rise are over the first, second and fourth. Rapid Spin clears the ones within a
// tile of its user, Defog the ones within 2 of its target, Court Change hands every one to the other side.
// In Tower Defense they lie on the road and an enemy takes each kind once (td/sim.js).
import { effectiveness } from '../../../overworld/rules/tables.js';
import { has } from './statusfx.js';
import { manhattan } from './grid.js';

export const HAZARDS = Object.freeze({ spikes: ['Spikes', 'SPK', '#c9c9c9'], toxicspikes: ['Toxic Spikes', 'TOX', '#c08adf'], stealthrock: ['Stealth Rock', 'ROCK', '#c9a36b'], stickyweb: ['Sticky Web', 'WEB', '#e8e8a8'] });
export const HAZARD_MAX = 16;   // a side's hazard tiles (the oldest goes when a 17th is laid)
export const isHazard = (id) => Object.prototype.hasOwnProperty.call(HAZARDS, id);
/** Is it over the ground ones? */
export const grounded = (u) => !(u.types.includes('Flying') || u.ability === 'levitate' || has(u, 'float'));

/** Lay a hazard on these tiles for a side. -> the tiles newly covered */
export function layHazard(S, kind, side, tiles) {
	S.hazards = (S.hazards || []).slice();
	const laid = [];
	for (const [x, y] of tiles) {
		if (S.hazards.some((h) => h.x === x && h.y === y && h.kind === kind && h.side === side)) continue;
		S.hazards.push({ x, y, kind, side }); laid.push([x, y]);
	}
	const mine = S.hazards.filter((h) => h.side === side);
	if (mine.length > HAZARD_MAX) { const drop = new Set(mine.slice(0, mine.length - HAZARD_MAX)); S.hazards = S.hazards.filter((h) => !drop.has(h)); }
	return laid;
}
/** What a unit standing on a foe's hazard takes. -> [{ kind, hurt?, status?, stats?, gone? }] (gone: a Poison type soaked up Toxic Spikes) */
export function hazardsOn(S, u) {
	const out = [];
	for (const h of S.hazards || []) {
		if (h.side === u.side || h.x !== u.x || h.y !== u.y) continue;
		if (h.kind === 'stealthrock') out.push({ kind: h.kind, hurt: Math.max(1, Math.floor(u.maxHP / 8 * effectiveness('Rock', u.types))) });
		else if (!grounded(u)) continue;
		else if (h.kind === 'spikes') out.push({ kind: h.kind, hurt: Math.max(1, Math.floor(u.maxHP / 8)) });
		else if (h.kind === 'toxicspikes') out.push(u.types.includes('Poison') ? { kind: h.kind, gone: h } : { kind: h.kind, status: 'psn' });
		else if (h.kind === 'stickyweb' && !(u.webbed)) out.push({ kind: h.kind, stats: { spe: -1 }, once: 'webbed' });
	}
	return out;
}
/** Clear the hazards within n tiles of a point (any side's). -> how many went */
export function clearHazards(S, x, y, n) {
	const before = (S.hazards || []).length;
	if (!before) return 0;
	S.hazards = S.hazards.filter((h) => manhattan(h.x, h.y, x, y) > n);
	return before - S.hazards.length;
}

/** A type that resists the given one (Conversion 2), the first in a fixed order; null if none. */
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
export const resisting = (type) => TYPES.find((t) => effectiveness(type, [t]) < 1) || null;

const isBerry = (h) => !!h && (h.berryHeal || h.berryHealFrac || h.cure);
const put = (h, v, name, turns) => { v.fx = { ...(v.fx || {}), [name]: turns }; h.ev({ t: 'mark', uid: v.uid, what: name, turns }); return true; };
/** Take on another's move for the battle, in place of the move used (Mimic, Sketch). */
const copyMove = (self) => (h, u, v) => {
	const id = v.last;
	if (v === u || !id || id === self || u.fig.equipped.includes(id) || !h.moveOk(id)) return false;
	u.fig = { ...u.fig, equipped: u.fig.equipped.map((m) => (m === self ? id : m)), pool: [...u.fig.pool.filter((p) => p.id !== id), { id, lv: 1, xp: 0 }] };
	if (!u.fig.equipped.includes(id)) u.fig = { ...u.fig, equipped: [...u.fig.equipped, id].slice(-4) };
	u.pp = { ...u.pp, [id]: 5 }; delete u.pp[self];
	h.ev({ t: 'learned', uid: u.uid, move: id, from: v.uid });
	return true;
};
export const EXTRA11 = {
	roar: () => true, whirlwind: () => true,   // (the push is the move: battle.js knockback)
	courtchange: (h) => h.swapHazards(),
	stuffcheeks: (h, u) => { if (!isBerry(u.held) || u.heldUsed) return false; h.eat(u); h.boost(u, { def: 2 }); return true; },
	electrify: (h, u, v) => (v.side === u.side ? false : put(h, v, 'electrify', 2)),   // its next move is an Electric one
	powder: (h, u, v) => (v.side === u.side ? false : put(h, v, 'powder', 2)),         // a Fire move it uses blows up in its face
	iondeluge: (h) => { if (h.fieldOn('iondeluge')) return false; h.field('iondeluge', 5); return true; },   // Normal moves are Electric ones
	mimic: copyMove('mimic'), sketch: copyMove('sketch'),
	transform: (h, u, v) => {
		if (v === u || u.transformed) return false;
		u.transformed = true;
		u.types = v.types.slice(); u.ability = v.ability; u.boosts = { ...v.boosts };
		u.stats = { ...v.stats };
		const eq = v.fig.equipped.filter((id) => h.moveOk(id)).slice(0, 4);
		if (eq.length) { u.fig = { ...u.fig, equipped: eq, pool: [...u.fig.pool.filter((p) => !eq.includes(p.id)), ...eq.map((id) => ({ id, lv: 1, xp: 0 }))] }; u.pp = Object.fromEntries(eq.map((id) => [id, 5])); }
		h.ev({ t: 'retype', uid: u.uid, types: u.types }); h.ev({ t: 'transformed', uid: u.uid, into: v.uid });
		return true;
	},
	conversion2: (h, u, v) => { const lt = v !== u && v.last && h.moveType(v.last), t = lt && resisting(lt); if (!t || (u.types.length === 1 && u.types[0] === t)) return false; u.types = [t]; h.ev({ t: 'retype', uid: u.uid, types: u.types }); return true; },
};
export const hasExtra11 = (id) => Object.prototype.hasOwnProperty.call(EXTRA11, id);
