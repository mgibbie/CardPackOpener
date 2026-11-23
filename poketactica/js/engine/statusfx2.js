// statusfx2.js — more moves the Poketactica battle had no rule for (RULES_REV 10; the moves sweep's list of those that
// did nothing). As statusfx.js: EXTRA10[id](h, user, target, rng) -> did it do anything; what each lasting mark DOES is
// in battle.js where it applies. Also the moves that call another move (Metronome, Copycat ...): CALLS.
//
// OWNER, 2026-11-23, with permanent loss in mind:
//   - Perish Song, Destiny Bond, Grudge and Revival Blessing STAY OFF (no figurine is lost to a move with no counterplay).
//   - Healing Wish and Lunar Dance do NOT make the user faint: they heal the ally beside it by half, and cost the user
//     half its own HP.
import { MARK_TURNS, FOREVER } from './statusfx.js';
import { manhattan } from './grid.js';

const foe = (u, v) => u.side !== v.side;
const put = (h, v, name, turns) => { v.fx = { ...(v.fx || {}), [name]: turns }; h.ev({ t: 'mark', uid: v.uid, what: name, ...(turns < FOREVER / 2 ? { turns } : {}) }); return true; };
const mark = (name, turns = MARK_TURNS, onlyFoe = false) => (h, u, v) => (onlyFoe && !foe(u, v) ? false : put(h, v, name, turns));
const self = (name, turns) => (h, u) => put(h, u, name, turns);
/** Marks that last until their owner's next turn begins (battle.js turnStart takes them down), not a count of turns. */
export const UNTIL_TURN = ['endure', 'wideguard', 'quickguard', 'magiccoat', 'center'];
const untilTurn = (name, onSelf) => (h, u, v) => put(h, onSelf ? u : v, name, FOREVER);

/** Healing Wish / Lunar Dance (the owner's rule: nobody faints): the most hurt ally beside the user is healed by half, the user pays half its HP. */
const mend = (alsoCure) => (h, u) => {
	const cost = Math.floor(u.maxHP / 2);
	const ally = h.everyone().filter((a) => a !== u && a.side === u.side && manhattan(a.x, a.y, u.x, u.y) === 1 && (a.hp < a.maxHP || (alsoCure && a.status)))
		.sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
	if (!ally || u.hp <= cost) return false;
	u.hp -= cost; h.ev({ t: 'hurt', uid: u.uid, n: cost, why: 'cost' });
	h.heal(ally, Math.floor(ally.maxHP / 2));
	if (alsoCure) h.cure(ally);
	return true;
};
const lastMove = (name, turns, key) => (h, u, v) => {
	if (!foe(u, v) || !v.last || (v.fx && v.fx[name])) return false;
	v[key] = v.last;
	return put(h, v, name, turns);
};
const swapItems = (h, u, v) => {
	if (v === u || (!u.held && !v.held)) return false;
	[u.held, v.held] = [v.held, u.held]; [u.heldId, v.heldId] = [v.heldId, u.heldId]; [u.heldUsed, v.heldUsed] = [v.heldUsed, u.heldUsed];
	h.ev({ t: 'itemswap', uid: u.uid, target: v.uid });
	return true;
};
const plusMinus = (changes) => (h, u, v) => { if (v.ability !== 'plus' && v.ability !== 'minus') return false; h.boost(v, changes); return true; };
const field = (name, toggles) => (h) => { const on = h.fieldOn(name); if (on && !toggles) return false; h.field(name, on ? 0 : MARK_TURNS); return true; };

export const EXTRA10 = {
	healingwish: mend(false), lunardance: mend(true),
	// guards
	mist: mark('mist'),                                   // a foe cannot lower its stats
	endure: untilTurn('endure', true),                    // (as a mark of 1 turn it wore off before any foe moved)
	wideguard: untilTurn('wideguard'), quickguard: untilTurn('quickguard'),   // the allies the move reaches: no spread move / no priority move lands
	magiccoat: untilTurn('magiccoat', true),              // a foe's status move comes back
	followme: untilTurn('center', true), ragepowder: untilTurn('center', true), spotlight: untilTurn('center'),   // single-target moves aimed near go to it
	substitute: (h, u) => { const cost = Math.floor(u.maxHP / 4); if (u.sub || u.hp <= cost || cost < 1) return false; u.hp -= cost; h.ev({ t: 'hurt', uid: u.uid, n: cost, why: 'cost' }); u.sub = cost; h.ev({ t: 'mark', uid: u.uid, what: 'sub' }); return true; },
	magnetrise: self('float', MARK_TURNS), telekinesis: mark('float', 3, true),   // Ground moves do not reach it
	tailwind: mark('tailwind', 4),                        // Speed doubled (accuracy and evasion on the grid)
	// on a foe
	miracleeye: mark('identified', FOREVER, true),
	attract: mark('attract', 3, true),                    // half the time it cannot bring itself to act (figurines have no gender: it works on any foe)
	meanlook: mark('trapped', MARK_TURNS, true), block: mark('trapped', MARK_TURNS, true), spiderweb: mark('trapped', MARK_TURNS, true), fairylock: mark('trapped', 2, true),   // it cannot move from its tile
	octolock: (h, u, v) => (foe(u, v) ? put(h, v, 'trapped', MARK_TURNS) && put(h, v, 'octolock', MARK_TURNS) : false),   // ... and loses Defense and Sp. Def each turn
	torment: mark('torment', MARK_TURNS, true),           // not the same move twice running
	disable: lastMove('disable', 4, 'disabled'),          // not the move it used last
	encore: lastMove('encore', 3, 'encored'),             // only the move it used last
	defog: (h, u, v) => { if (!foe(u, v)) return false; for (const k of ['reflect', 'lightscreen', 'safeguard', 'mist']) if (v.fx && v.fx[k]) delete v.fx[k]; h.boost(v, { eva: -1 }); return true; },
	// held items
	trick: swapItems, switcheroo: swapItems,
	bestow: (h, u, v) => (v === u || !u.held || v.held ? false : swapItems(h, u, v)),
	recycle: (h, u) => { if (!u.held || !u.heldUsed) return false; u.heldUsed = false; h.ev({ t: 'held', uid: u.uid, item: u.heldId, what: 'back' }); return true; },
	corrosivegas: (h, u, v) => { if (!foe(u, v) || !v.held) return false; h.ev({ t: 'held', uid: v.uid, item: v.heldId, what: 'gone' }); v.held = null; v.heldId = null; return true; },
	// stats
	gearup: plusMinus({ atk: 1, spa: 1 }), magneticflux: plusMinus({ def: 1, spd: 1 }),
	powershift: (h, u) => { u.stats = { ...u.stats, atk: u.stats.def, def: u.stats.atk }; return u.stats.atk !== u.stats.def; },
	// the field, for 5 turns
	gravity: field('gravity'), mudsport: field('mudsport'), watersport: field('watersport'),
	trickroom: field('trickroom', true),   // (used again, it ends)
};
export const hasExtra10 = (id) => Object.prototype.hasOwnProperty.call(EXTRA10, id);

/** What the Room and field moves are called. */
export const FIELD_SAY = { gravity: 'Gravity', mudsport: 'Mud Sport', watersport: 'Water Sport', trickroom: 'Trick Room' };

// ---------- the moves that use ANOTHER move
const NOT_CALLED = new Set(['metronome', 'copycat', 'mirrormove', 'sleeptalk', 'assist', 'naturepower', 'mefirst', 'mimic', 'sketch', 'transform', 'struggle', 'explosion', 'selfdestruct', 'mistyexplosion', 'memento',
	'finalgambit', 'healingwish', 'lunardance', 'perishsong', 'destinybond', 'grudge', 'revivalblessing', 'protect', 'detect', 'endure', 'counter', 'mirrorcoat', 'metalburst', 'bide', 'fling', 'naturalgift']);
const NATURE = { electric: 'thunderbolt', grassy: 'energyball', psychic: 'psychic', misty: 'moonblast' };
const pick = (list, rng) => (list.length ? list[Math.floor(rng() * list.length)] : null);
const usable = (id, c) => !!id && !NOT_CALLED.has(id) && !!c.data.moves[id] && !!c.data.shapes[id];
/**
 * c = { data, rng, user, target (the unit aimed at, if any), allies: [unit], lastMove (the last move anyone used), terrain }
 * -> the move to use instead, or null (it fails)
 */
export const CALLS = {
	// (any damaging move with a shape; not the ones that end the user, answer a hit or call another)
	metronome: (c) => pick(Object.keys(c.data.moves).filter((id) => usable(id, c) && c.data.moves[id].category !== 'Status' && c.data.moves[id].power > 0).sort(), c.rng),
	copycat: (c) => (usable(c.lastMove, c) ? c.lastMove : null),
	mirrormove: (c) => (c.target && c.target !== c.user && usable(c.target.last, c) ? c.target.last : null),
	sleeptalk: (c) => (c.user.status === 'slp' ? pick(c.user.fig.equipped.filter((id) => id !== 'sleeptalk' && usable(id, c)), c.rng) : null),
	assist: (c) => pick([...new Set(c.allies.flatMap((a) => a.fig.equipped))].filter((id) => usable(id, c)).sort(), c.rng),
	naturepower: (c) => NATURE[c.terrain] || 'triattack',
};
export const isCall = (id) => Object.prototype.hasOwnProperty.call(CALLS, id);
