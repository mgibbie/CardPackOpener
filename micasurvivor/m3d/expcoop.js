// expcoop.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): playing an Expedition run together. coop.js
// (P3n) already shares the FIGHT: the host has the enemies, the floor and the team's level; each player their own
// body, HP and moves. This is the RUN on top of it, by the 2D game's rule for who decides what:
//   THE HOST      the run itself: the zone and its level, the altar and the portal (ANYONE standing on them counts),
//                 the guardian, the timeline, the zone's things, the money (it is the team's), the captures.
//   A GUEST       its own League member: its stats, its kit, its level-up cards (the level is the team's, the cards
//                 are its own), its evolutions. It is told the run by the run's row (expnet.js) in the host's frames,
//                 and builds each zone's level itself.
//
// A guest uses the zone's things and catches, too. The host sees it standing there (its puppet), keeps the thing's
// state and pays from the team's money; what is a player's own comes to the guest as a SEED and it rolls the offer from
// its own pool on its side (the 2D game's rule and messages):
//   xo   a choice of items (a ball, a blessing, the comet, a slot machine's ball)     xg   items at once
//   xs   Meowth's stall (the guest's buy goes back as 'xb'; the item comes as 'xgi')   xd   Ditto: a copy of one of its own
//   xh   Hypno: forget one of its own vitamins        xcg  a catch (kept its full team: 'xcp' back, the prize falls)
// A choice does not hold the fight for a guest: a party does not stop for one player's choosing.
// Not yet: a guest's Support Alphas on the other screens; Survival in co-op.
import { K, newState } from './sim.js';
import { tick } from './combat.js';
import { guestWorld } from './coop.js';
import { zoneRoom, besideHost } from './expedition.js';
import { setup as setupLevels, tickStats } from './explevel.js';
import { memberOf, setupLeague } from './expleague.js';
import { rowView } from './expnet.js';
import { rng as makeRng } from './gen.js';
import { rollOffers, pickTake } from './expeco.js';
import { takeItem } from './explevel.js';
import { setupCap, guestCatch, tickGuestCap, syncPerks } from './expcap.js';

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
	S.syncPerks = () => syncPerks(S);
	if (X.C) setupCap(S);
	S.pick = null;
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
	if (w.t !== t0) { tickStats(S, dt); tickGuestCap(S, dt); }
	for (const ev of w.events) if (ev.k === 'pickup' && ev.kind === 'item') takeItem(S, ev.value);
	for (const g of w.co.inbox.splice(0)) guestGift(S, g);
	if (S.pick && (w.autoPick !== undefined && w.autoPick !== null)) { const P = S.pick; if (P.kind === 'shop' || P.kind === 'hypno') S.pick = null; else if (P.onTake) pickTake(S, 0); else for (let i = 0; S.pick === P && i < P.ids.length; i++) pickTake(S, i); if (S.pick === P) S.pick = null; }
	return S;
}
/** The host's word for this guest: what it has opened, been given, or been handed to catch. */
export function guestGift(S, g) {
	const w = S.w, pl = w.pl, L = S.L, rngOf = () => { const r = makeRng(g.sd); for (let i = 0; i < (g.skip || 0); i++) r(); return r; };
	if (g.k === 'xo') { const ids = rollOffers(S, rngOf(), g.n, g.min), picks = Math.min(g.picks || 1, ids.length); if (ids.length) { S.pick = { kind: g.kind, title: g.title, sub: `Choose ${picks} of ${ids.length}`, ids, picks, taken: [] }; w.events.push({ k: 'pick', kind: g.kind }); } }
	else if (g.k === 'xg') { for (const id of rollOffers(S, rngOf(), g.n, g.min)) takeItem(S, id); }
	else if (g.k === 'xgi') { takeItem(S, g.id); if (g.slot != null && S.pick && S.pick.kind === 'shop') S.pick.taken.push(g.slot); }
	else if (g.k === 'xs') {   // Meowth: the host's stock and prices; a buy is asked of the host
		S.pick = { kind: 'shop', title: "Meowth's stall", sub: 'Buy what you like; leave when you are done', ids: g.stock, prices: g.prices, picks: 99, taken: g.stock.map((_, i) => i).filter((i) => g.sold & (1 << i)),
			onTake: (i) => { if (S.pick.asked && S.pick.asked.includes(i)) return false; (S.pick.asked || (S.pick.asked = [])).push(i); w.co.outbox.push(['xb', i]); S.pick.hold = true; return true; }, onClose: () => true };
		w.events.push({ k: 'pick', kind: 'shop' });
	}
	else if (g.k === 'xd') { const have = Object.keys(pl.xi).filter((id) => L.I.IT[id] && L.I.room(pl, id)); if (have.length) takeItem(S, have[Math.floor(makeRng(g.sd)() * have.length) % have.length]); else S.says.push({ text: 'Ditto has nothing to copy', s: 2.4 }); }
	else if (g.k === 'xh') { if (pl.xv.length) { S.pick = { kind: 'hypno', title: 'Hypno', sub: 'Forget a vitamin to free its slot (or walk away)', vit: pl.xv.map((x) => x.id), picks: 1, taken: [], ids: [] }; w.events.push({ k: 'pick', kind: 'hypno' }); } else S.says.push({ text: 'You have no vitamins to forget', s: 2.4 }); }
	else if (g.k === 'xcg' && S.cap) guestCatch(S, g);
}
