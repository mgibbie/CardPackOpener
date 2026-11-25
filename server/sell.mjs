// sell.mjs — SELLING a thing for stars, from the Inventory (owner, 2026-11-25: "everything else you can trade or sell
// for stars. Selling should work like jokers in Micatro"; Plans/INVENTORY_TRADE_SELL_PLAN.md stage 2).
//
// What sells: everything the server keeps for a player that has a star value, except cards (the owner: dust only, in
// their own game) and stars themselves: dust, gold, Battlecards and Pocket packs, MicaSurvivor coins and tickets,
// Poketactica figurines and goods. (The overworld's things join when they live on the account: stage 3.)
// What it pays: the FULL star value (site/values.js), worked out HERE from the seller's own rows, never from the page.
//
// A sale is the trade system's own steps (server/trade.mjs makeHolds), so it is as safe as a trade:
//   hold     the things leave the seller's rows into a hold named sell:<id> (each one guarded write; all or nothing)
//   pay      the hold is emptied (the things are gone) and the stars are added to the wallet, once
// The sale is written down first (sale:<user>, one row, the newest sale only) and every action carries an unfinished one
// on from where it stopped, so a request that dies leaves nothing lost and nothing paid twice.
//
// TAKE IT BACK: for UNDO_MS after a sale the seller may undo it at the same price: the stars are taken (they must still
// have them), then everything comes back as it was (a figurine whole, a held item with its level and gemstones).
// One sale can be taken back: the newest. A new sale closes the one before it for good.
//
//   inv-sell       { offer }   -> { ok, stars, sale }   | { error }
//   inv-sell-undo  {}          -> { ok, sale }          | { error }
//   inv-sale       {}          -> { sale }              (the newest sale, carried on if unfinished; undoLeft in ms)
import { makeHolds, sanitizeOffer, hasBc, hasPk, hasMs, hasFg, hasPt, hasOw } from './trade.mjs';
import { offerWorth } from '../site/values.js';

export const UNDO_MS = 10 * 60_000;
const KEY = u => 'sale:' + u, HOLD = id => 'sell:' + id, BACK = id => 'sellback:' + id;
const NO_BC = { cards: {}, packs: 0, dust: 0, gold: 0 }, NO_PK = { prints: {}, packs: 0, own: {} }, NO_MS = { coins: 0, t1: 0, t10: 0 };

export async function handleSell(ctx) {
	const { action, body, store, username, json, now, maxOwned = 999, randCode } = ctx;
	if (!username) return json({ error: 'not logged in' }, 401);
	let why = '';
	const H = makeHolds({ store, now, maxOwned, setWhy: w => { why = w; } });
	const step = async (s, patch) => { const next = { ...s, ...patch, rev: s.rev + 1 }; return (await store.setIfRev(KEY(username), next, s.rev)) ? next : null; };
	const view = s => (s ? { id: s.id, stars: s.stars, offer: s.offer, at: s.at, phase: s.phase, undoLeft: s.phase === 'paid' ? Math.max(0, UNDO_MS - (now - s.at)) : 0 } : null);
	const bc = o => ({ cards: {}, packs: o.packs, dust: o.dust, gold: o.gold });

	/** Carry a sale on from wherever it stands. Safe to call any number of times. */
	const settle = async s => {
		for (let guard = 0; guard < 6 && s; guard++) {
			const o = s.offer;
			if (s.phase === 'hold') {
				let ok = true;
				if (ok && hasBc(o)) ok = await H.bcHold(username, HOLD(s.id), bc(o));
				if (ok && hasPk(o)) ok = await H.pkHold(username, HOLD(s.id), o.pk);
				if (ok && hasMs(o)) ok = await H.msHold(username, HOLD(s.id), o.ms);
				if (ok && (hasFg(o) || hasPt(o))) ok = await H.fgHold(username, HOLD(s.id), o.fg, o.pt);
				if (!ok) { s = await step(s, { phase: 'refused', why: why || 'you no longer have that' }) || await store.get(KEY(username)); continue; }
				// (what was held, whole, kept on the sale: taking it back puts exactly this back)
				const figs = hasFg(o) ? (await H.fgHeld(username, HOLD(s.id))) || [] : [], things = hasPt(o) ? await H.ptHeld(username, HOLD(s.id)) : null;
				s = await step(s, { phase: 'pay', figs, ...(things ? { things } : {}) }) || await store.get(KEY(username));
			} else if (s.phase === 'pay') {
				let ok = true;
				if (ok && hasBc(o)) ok = await H.bcOut(username, HOLD(s.id), NO_BC);
				if (ok && hasPk(o)) ok = await H.pkOut(username, HOLD(s.id), NO_PK);
				if (ok && hasMs(o)) ok = await H.msOut(username, HOLD(s.id), NO_MS);
				if (ok && (hasFg(o) || hasPt(o))) ok = await H.fgOut(username, HOLD(s.id), { figs: [], things: null });
				if (ok) ok = (await H.stHold(username, HOLD(s.id), 0)) && (await H.stOut(username, HOLD(s.id), s.stars));
				if (!ok) return s;   // (a row was busy: the next call carries on)
				s = await step(s, { phase: 'paid', at: now }) || await store.get(KEY(username));
			} else if (s.phase === 'refused' && !s.released) {
				// (a hold that failed part way: whatever was already held comes back)
				let ok = (await H.bcOut(username, HOLD(s.id), null)) && (await H.pkOut(username, HOLD(s.id), null));
				if (ok && hasMs(o)) ok = (await store.get('micasurvivor:' + username)) ? await H.msOut(username, HOLD(s.id), null) : true;
				if (ok) ok = await H.fgOut(username, HOLD(s.id), null);
				if (!ok) return s;
				s = await step(s, { released: true }) || await store.get(KEY(username));
			} else if (s.phase === 'undo') {
				// the stars are taken for good first (they were held when the undo began); then everything comes back through a hold of nothing
				let ok = await H.stOut(username, BACK(s.id), 0);
				if (ok && hasBc(o)) ok = (await H.bcHold(username, BACK(s.id), NO_BC)) && (await H.bcOut(username, BACK(s.id), bc(o)));
				if (ok && hasPk(o)) ok = (await H.pkHold(username, BACK(s.id), NO_PK)) && (await H.pkOut(username, BACK(s.id), o.pk));
				if (ok && hasMs(o)) ok = (await H.msHold(username, BACK(s.id), NO_MS)) && (await H.msOut(username, BACK(s.id), o.ms));
				if (ok && (hasFg(o) || hasPt(o))) ok = (await H.fgHold(username, BACK(s.id), [], [])) && (await H.fgOut(username, BACK(s.id), { figs: s.figs || [], things: s.things || null }));
				if (!ok) return s;
				s = await step(s, { phase: 'undone' }) || await store.get(KEY(username));
			} else return s;
		}
		return s;
	};
	const load = async () => {
		const s = await store.get(KEY(username)); if (!s || !s.rev) return null;
		// (an undo that died before it began left its stars, and its empty place for the goods, held: they come back)
		if (s.phase === 'paid') { await H.stOut(username, BACK(s.id), null); if (hasFg(s.offer) || hasPt(s.offer)) await H.fgOut(username, BACK(s.id), null); }
		return settle(s);
	};

	if (action === 'inv-sale') return json({ sale: view(await load()) });

	if (action === 'inv-sell') {
		const last = await load();
		if (last && ['hold', 'pay', 'undo'].includes(last.phase)) return json({ error: 'busy: try again', sale: view(last) }, 409);
		const offer = sanitizeOffer(body.offer);
		// (cards stay dust-only; stars are not sold for stars; the overworld's things are not on the account yet)
		if (Object.keys(offer.cards).length || Object.keys(offer.pk.prints).length) return json({ error: 'cards are not sold for stars: they turn into dust in their own game' }, 400);
		if (hasOw(offer)) return json({ error: 'things from the overworld cannot be sold here yet' }, 400);
		offer.stars = 0;
		if (hasFg(offer)) { const fg = await H.figsOf(username, offer.fg); if (!fg) return json({ error: 'that figurine is not yours to sell' }, 400); offer.fg = fg; }
		if (hasPt(offer)) { const pt = await H.ptOf(username, offer.pt); if (!pt) return json({ error: 'that item is not yours to sell (one a figurine is wearing comes off first)' }, 400); offer.pt = pt; }
		if (!hasBc(offer) && !hasPk(offer) && !hasMs(offer) && !hasFg(offer) && !hasPt(offer)) return json({ error: 'nothing to sell' }, 400);
		const stars = offerWorth(offer, () => null).total;
		if (!(stars > 0)) return json({ error: 'that has no star value' }, 400);
		const id = randCode() + randCode();
		const s0 = { rev: (last && last.rev) || 0, id, phase: 'hold', offer, stars, at: now };
		// (the row is written on the one before it as read: two sales at once cannot both start)
		const first = last ? await step({ ...last }, { id, phase: 'hold', offer, stars, at: now, figs: undefined, things: undefined, why: undefined, released: undefined, took: undefined }) : ((await store.setIfRev(KEY(username), { ...s0, rev: 1 }, 0)) ? { ...s0, rev: 1 } : null);
		if (!first) return json({ error: 'busy: try again' }, 409);
		const s = await settle(first);
		if (!s || s.phase === 'refused') return json({ error: (s && s.why) || 'you no longer have that', sale: view(s) }, 400);
		return json({ ok: s.phase === 'paid', stars: s.stars, sale: view(s) }, s.phase === 'paid' ? 200 : 202);
	}

	if (action === 'inv-sell-undo') {
		let s = await load();
		if (!s || s.phase !== 'paid') return json({ error: s && s.phase === 'undone' ? 'that sale was already taken back' : 'there is no sale to take back', sale: view(s) }, 400);
		if (now - s.at > UNDO_MS) return json({ error: 'too late to take that sale back', sale: view(s) }, 400);
		// (room for what comes back, checked before any star moves: a full Mystery Maze storage refuses here, and nothing is dropped)
		if (hasPt(s.offer)) { const n = { items: 0, gems: 0, store: 0 }; for (const x of s.offer.pt) n[x.k === 'item' ? 'items' : x.k === 'gem' ? 'gems' : 'store']++; if (!(await H.fgHold(username, BACK(s.id), [], [], n))) return json({ error: why || 'no room to take it back', sale: view(s) }, 400); }
		// the stars first (held, then gone): only then does anything come back
		if (!(await H.stHold(username, BACK(s.id), s.stars))) return json({ error: 'you no longer have the ' + s.stars + ' stars it sold for', sale: view(s) }, 400);
		const next = await step(s, { phase: 'undo' });
		if (!next) { await H.stOut(username, BACK(s.id), null); return json({ error: 'busy: try again' }, 409); }   // (the stars come back: nothing was undone)
		s = await settle(next);
		return json({ ok: !!s && s.phase === 'undone', sale: view(s) }, s && s.phase === 'undone' ? 200 : 202);
	}
	return json({ error: 'unknown action' }, 400);
}
