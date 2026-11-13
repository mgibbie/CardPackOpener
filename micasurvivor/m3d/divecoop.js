// divecoop.js — MicaSurvivor 3D, Dive part 17 (Plans/MICASURVIVOR_3D_PLAN.md §5.70): playing a Dive together. coop.js
// (P3n) shares the FIGHT: the host has the foes, the floor and the team's level; each player their own body, HP and
// moves. This is the DIVE on top of it, as expcoop.js is an Expedition's:
//   THE HOST      the Dive itself (dive.js): the floor, the groups and who wakes them, the stairs, the rope, the loot,
//                 the chests, the pockets, the landmark, the lost Pokémon, the stall. ANY player counts for each.
//   A GUEST       its own League member: its stats, its kit of three (the basic and two specials, pressed), its
//                 dodge, its level-up cards, its evolutions. It is told the Dive by the Dive's row (divenet.js) in the
//                 host's frames, and builds each floor itself.
// What is a player's own comes to the guest as a SEED and it rolls from its own pool (expcoop.js guestGift): a chest's
// item ('xg'), Meowth's stall ('xs', its buys go back as 'xb'). A shrine's or a fairy ring's healing comes as 'heal'.
// The red ground: the host aims it at the nearest player and says where it lands and what it does (the events 'slam'
// and 'charge' carry `d`); a guest standing in it takes that itself (slamOn), unless it is dodging.
// The Dive ends for everyone when the host faints or the party leaves by the rope (any player standing still in its
// circle). A guest that faints is down until the next floor.
// What a guest's own SAVE brings (o.form, o.perks, o.meta, o.shiny, o.seal: as a host's, dive.js): the form it starts as,
// its family's bought upgrades, the Lab (its stats, tools and Max Revive; not the Rare Candy: the level is the team's),
// its shiny's look, and its own Seal of this route.
// Not here: a guest's combo (the loot is the host's).
import { K, newState } from './sim.js';
import { tick, hurtPlayer } from './combat.js';
import { guestWorld } from './coop.js';
import { besideHost } from './expedition.js';
import { setup as setupLevels, tickStats, takeItem } from './explevel.js';
import { memberOf, setupLeague, learnKit } from './expleague.js';
import { syncPerks } from './expcap.js';
import { applyPerks, perkTools } from './expperks.js';
import { pickTake } from './expeco.js';
import { guestGift } from './expcoop.js';
import { tickFog } from './expfog.js';
import { diveRoom } from './divegen.js';
import { setupKit, kitInput } from './dive.js';
import { diveView } from './divenet.js';

/** A guest's side of a Dive. o: { seed, route, dex (its species: it plays that family's member), id (its number in the
 *  party; the host is 0), and guestWorld's options }. R: rulesFrom(G).
 *  -> the guest's Dive: { w (its side of the fight), floor, rv (the Dive as last told), says, lv, lg, kit, dodge, … } */
export function guestDive(data, X, R, o = {}) {
	const route = R.F.ROUTES[o.route] ? o.route : 'forest', seed = (o.seed | 0) || 1;
	const league = !!X.G && o.league !== false, member = league ? memberOf(X.G, o.dex || 25) : 0, room = diveRoom(R.F, seed, route, 1);
	const lv = league ? [] : (o.moves || []).map((m) => (Array.isArray(m) ? m : [m, 1]));
	const w = guestWorld(room, data, { ...o, dex: league ? member : o.dex, moves: lv.map((m) => m[0]),
		ability: league && o.ability === undefined ? X.G.abilityOf(X.G.finalsOf(X.G.BY[member])[0]) : o.ability });
	const S = { w, X, R, data, dive: true, guest: true, slot: o.id || 1, route, map: 'dive:' + route, seed, floor: 1, zone: 1, zs: 0, coins: 0, says: [], rv: null, keep: {}, ended: false, won: false, lost: false, escaped: false,
		weekly: null, seal: !!o.seal, obeliskT: 0, meta: o.meta || null, pick: null };
	if (o.perks) applyPerks(S, o.perks);
	setupLevels(S, X.L, lv);
	S.syncPerks = () => syncPerks(S);
	if (S.up) perkTools(S);
	if (league) { S.maxMoves = R.K.SLOTS; setupLeague(S, member, o.form | 0); S.lg.shiny = !!o.shiny; for (let i = 1; i < R.K.SLOTS; i++) learnKit(S, i); }   // (the basic and both specials from the start, as the host)
	setupKit(S, o);
	place(S);
	if (S.meta) { S.meta.candy = false; S.syncPerks(); if (S.meta.eff.lab.revive && S.lv && X.L.I.IT.maxrevive) takeItem(S, 'maxrevive'); }   // (the Lab's: its stats and a Max Revive; the Rare Candy's levels are not a guest's, the level is the team's)
	return S;
}
/** Where a guest arrives on a floor: beside where the host does, by its number. */
function place(S) {
	const w = S.w, s = w.pl.s, sp = w.room.spawn;
	Object.assign(s, newState(w.room, w.tune)); s.x = sp[0] + besideHost(S.slot); s.z = sp[2] + 0.8 * (S.slot % 2 ? 1 : -1);
	if (w.room.cells[Math.floor(s.z / 2) * w.room.w + Math.floor(s.x / 2)] >= w.room.rimH) { s.x = sp[0]; s.z = sp[2]; }   // (rock there: on the spawn itself)
}
/** The Dive's row arrives (in the host's frame). The floor has changed (or a pocket opened): the guest builds it; on a
 *  new floor it arrives beside the host, and is up again if it was down. */
export function guestDiveApply(S, row) {
	if (!row) return S.rv;
	const was = S.rv, rv = S.rv = diveView(row, S.R, S.X, S.keep), w = S.w;
	if (rv.room !== w.room) {
		const moved = !was || was.floor !== rv.floor || was.seed !== rv.seed || was.route !== rv.route;
		w.room = rv.room;
		if (moved) {
			for (const k of ['enemies', 'shots', 'orbs', 'fields', 'effects', 'eshots', 'hazards', 'pickups']) w[k].length = 0;
			w.co.known.clear(); w.co.queue.length = 0; w.pl.target = null;
			place(S);
			if (w.pl.dead) { w.pl.dead = false; w.pl.hp = Math.max(1, w.pl.maxHp * 0.5); S.says.push({ text: 'You are back on your feet', s: 2.4 }); }
			w.events.push({ k: 'floor', floor: rv.floor });
		}
	}
	S.floor = rv.floor; S.zone = rv.floor; S.route = rv.route; S.seed = rv.seed; S.coins = rv.coins; S.weekly = rv.weekly;
	if (rv.over && !S.ended) { S.ended = true; S.escaped = rv.over === 'won'; S.won = S.escaped; S.lost = !S.won; }
	return rv;
}
/** The host's events as they reach a guest: a slam or a charge that lands where the guest stands hurts it (its dodge
 *  saves it, as the host's does). -> the damage taken */
export function slamOn(S, events) {
	const w = S.w, pl = w.pl, s = pl.s; let took = 0;
	if (pl.dead || S.ended) return 0;
	for (const ev of events || []) {
		if (!(ev.d > 0)) continue;
		if (ev.k === 'slam' && Math.hypot(s.x - ev.x, s.z - ev.z) < ev.r) took += hurtPlayer(w, ev.d, 'normal', true) || 0;
		else if (ev.k === 'charge') {   // (the lane it dashes along, at once: the dash is a third of a second)
			const dx = Math.cos(ev.a), dz = Math.sin(ev.a), px = s.x - ev.x, pz = s.z - ev.z, along = px * dx + pz * dz, off = Math.abs(px * dz - pz * dx);
			if (along > 0 && along < ev.len && off < (ev.w || 2.6) * 0.6 + 0.35) took += hurtPlayer(w, ev.d, 'normal', true) || 0;
		}
	}
	return took;
}
/** One tick of a guest's side (after coop.js's guestSync): its kit and its dodge, its fight, its own stats' clocks. */
export function stepGuestDive(S, input, dt = K.TICK) {
	S.says.length = 0;
	if (S.ended) return S;
	const w = S.w, t0 = w.t;
	input = kitInput(S, input, dt);
	tick(w, input, dt);
	for (const ev of w.events) if (ev.k === 'say') S.says.push({ text: ev.text, s: ev.s });
	if (S.dodgeEv) { S.dodgeEv = false; if (w.t !== t0) w.events.push({ k: 'dodge' }); }
	if (w.t !== t0) { tickStats(S, dt); tickFog(S); }
	for (const ev of w.events) if (ev.k === 'pickup' && ev.kind === 'item') takeItem(S, ev.value);
	for (const g of w.co.inbox.splice(0)) { const n0 = w.events.length; guestGift(S, g); for (let i = n0; i < w.events.length; i++) if (w.events[i].k === 'say') S.says.push({ text: w.events[i].text, s: w.events[i].s }); }
	if (S.pick && (w.autoPick !== undefined && w.autoPick !== null)) { const P = S.pick; if (P.kind === 'shop' || P.kind === 'hypno') S.pick = null; else if (P.onTake) pickTake(S, 0); else for (let i = 0; S.pick === P && i < P.ids.length; i++) pickTake(S, i); if (S.pick === P) S.pick = null; }
	return S;
}
