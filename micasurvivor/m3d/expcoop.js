// expcoop.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): playing an Expedition run together. coop.js
// (P3n) already shares the FIGHT: the host has the enemies, the floor and the team's level; each player their own
// body, HP and moves. This is the RUN on top of it, by the 2D game's rule for who decides what:
//   THE HOST      the run itself: the zone and its level, the altar and the portal (ANYONE standing on them counts),
//                 the guardian, the timeline, the zone's things, the money (it is the team's), the captures.
//   A GUEST       its own League member: its stats, its kit, its level-up cards (the level is the team's, the cards
//                 are its own), its evolutions. It is told the run by the run's row (expnet.js) in the host's frames,
//                 and builds each zone's level itself.
//
// Here so far: a guest in a run (fighting, levelling, evolving, charging the altar, taking the portal with the team),
// and the run ending only when everyone is down.
// Not yet: a guest opening the zone's things or catching (the 2D game's D11 messages: an offer rolled on the guest's
// side from a seed the host sends); a guest's Support Alphas.
import { K, newState } from './sim.js';
import { tick } from './combat.js';
import { guestWorld } from './coop.js';
import { zoneRoom, besideHost } from './expedition.js';
import { setup as setupLevels, tickStats } from './explevel.js';
import { memberOf, setupLeague } from './expleague.js';
import { rowView } from './expnet.js';

/** A guest's side of a run. o: { seed, map, diff, dex (its species: it plays that family's member), id (its number in
 *  the party; the host is 0), league: false for a plain body with `moves`, and guestWorld's options }.
 *  -> the guest's run: { w (its side of the fight), zone, rv (the run as last told), says, lv, lg, … } */
export function guestRun(data, X, o = {}) {
	const map = X.MAPS[o.map] ? o.map : 'viridian', diff = X.DIFFS.includes(o.diff) ? o.diff : 'normal', seed = (o.seed >>> 0) || 1;
	const league = !!X.G && o.league !== false, member = league ? memberOf(X.G, o.dex || 25) : 0, room = zoneRoom(seed, map, 1, X);
	const lv = league ? [] : (o.moves || []).map((m) => (Array.isArray(m) ? m : [m, 1]));
	const w = guestWorld(room, data, { ...o, dex: league ? member : o.dex, moves: lv.map((m) => m[0]),
		ability: league && o.ability === undefined ? X.G.abilityOf(X.G.finalsOf(X.G.BY[member])[0]) : o.ability });
	const S = { w, X, data, map, diff, seed, guest: true, slot: o.id || 1, zone: 1, zs: 0, ph: 0, charge: 0, coins: 0, says: [], rv: null, keep: {}, ended: false, won: false, lost: false, plan: { cards: [] } };
	setupLevels(S, X.L, lv);
	if (league) setupLeague(S, member);
	place(S);
	return S;
}
/** Where a guest arrives in a zone: beside where the host does, by its number. */
function place(S) {
	const w = S.w, s = w.pl.s, sp = w.room.spawn;
	Object.assign(s, newState(w.room, w.tune)); s.x = sp[0] + besideHost(S.slot); s.z = sp[2] + 0.8 * (S.slot % 2 ? 1 : -1);
}
/** The run's row arrives (in the host's frame). The zone has changed: the guest builds its level and arrives in it. */
export function guestRunApply(S, row) {
	if (!row) return S.rv;
	const rv = S.rv = rowView(row, S.X, S.keep), w = S.w;
	if (rv.room !== w.room) {
		for (const k of ['enemies', 'shots', 'orbs', 'fields', 'effects', 'eshots', 'hazards', 'pickups']) w[k].length = 0;
		w.co.known.clear(); w.co.queue.length = 0;
		w.room = rv.room; w.pl.target = null;
		place(S);
		w.events.push({ k: 'zone', zone: rv.zone });
	}
	S.zone = rv.zone; S.ph = rv.ph; S.charge = rv.charge; S.coins = rv.coins;
	if (rv.over && !S.ended) { S.ended = true; S.won = rv.over === 'won'; S.lost = !S.won; }
	return rv;
}
/** One tick of a guest's side (after coop.js's guestSync): its fight, and its own stats' clocks. */
export function stepGuest(S, input, dt = K.TICK) {
	S.says.length = 0;
	if (S.ended) return S;
	const w = S.w, t0 = w.t;
	tick(w, input, dt);
	for (const ev of w.events) if (ev.k === 'say') S.says.push({ text: ev.text, s: ev.s });
	if (w.t !== t0) tickStats(S, dt);
	return S;
}
