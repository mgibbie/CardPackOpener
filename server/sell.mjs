// sell.mjs — SELLING a thing for stars, from the Inventory (owner, 2026-11-25: "everything else you can trade or sell
// for stars. Selling should work like jokers in Micatro"; Plans/INVENTORY_TRADE_SELL_PLAN.md stage 2).
//
// What sells: everything the server keeps for a player that has a star value, except cards (the owner: dust only, in
// their own game) and stars themselves: dust, gold, Battlecards and Pocket packs, MicaSurvivor coins and tickets,
// Poketactica figurines and goods; and the OVERWORLD's Pokémon, items, money and Game Corner coins (below).
// What it pays: the FULL star value (site/values.js), worked out HERE from the seller's own rows, never from the page.
//
// A sale is the trade system's own steps (server/trade.mjs makeHolds), so it is as safe as a trade:
//   hold     the things leave the seller's rows into a hold named sell:<id> (each one guarded write; all or nothing)
//   pay      the hold is emptied (the things are gone) and a place for the stars is made in the wallet
//   pay2     the stars are added, through that place: gone once used, so a step run twice adds nothing more
// A step that MAKES a place and a step that USES it are never the same phase. Were they one, a request dying between
// the stars and the note that they were paid would, carried on, make the place again and pay again.
// The sale is written down first (sale:<user>, one row, the newest sale only) and every action carries an unfinished one
// on from where it stopped, so a request that dies leaves nothing lost and nothing paid twice.
//
// TAKE IT BACK: for UNDO_MS after a sale the seller may undo it at the same price: the stars are taken (they must still
// have them), then everything comes back as it was (a figurine whole, a held item with its level and gemstones).
// One sale can be taken back: the newest. A new sale closes the one before it for good.
//
// THE OVERWORLD'S THINGS (stage 3; owner, 2026-11-25: "go ahead" on the route that keeps the standing rule). The server
// never writes an overworld save: the GAME takes things out of it, on the device that holds the save
// (overworld/ow_handover.js), because a running game keeps the save in memory and would write a thing back that the
// server had removed. So a sale of the overworld's things is asked for first and paid for second, as a spectator bet of
// them is (server/bets.mjs):
//   ask      inv-sell with an offer of the overworld's things ONLY: valued here, written down, nothing paid.
//            -> { handover: true, id, stars }
//   (the device notes it in the save's sale journal, takes the things out with the game's own code, sends the save)
//   deposit  inv-sell-deposit { id }: the stars are paid, once -> { landed }.   { id, cancel: true }: the device never
//            took them out -> { cancelled }.   An ask that a newer sale has replaced -> { gone }: the device puts them back.
// Taking such a sale back sends the things to the delivery box (owtrade:<user>, 'sell:<id>:back'), which the game
// empties into the save as it does for a trade. Key and story items are refused, as everywhere.
//
//   inv-sell       { offer }   -> { ok, stars, sale }   | { handover, id, stars, sale }   | { error }
//   inv-sell-deposit { id, cancel? } -> { landed, stars, sale } | { cancelled } | { gone }
//   inv-sell-undo  {}          -> { ok, sale }          | { error }
//   inv-sale       {}          -> { sale }              (the newest sale, carried on if unfinished; undoLeft in ms)
import { makeHolds, sanitizeOffer, hasBc, hasPk, hasMs, hasFg, hasPt, hasOw } from './trade.mjs';
import { offerWorth, itemTradeable } from '../site/values.js';

export const UNDO_MS = 10 * 60_000;
const KEY = u => 'sale:' + u, HOLD = id => 'sell:' + id, BACK = id => 'sellback:' + id;
const NO_BC = { cards: {}, packs: 0, dust: 0, gold: 0 }, NO_PK = { prints: {}, packs: 0, own: {} }, NO_MS = { coins: 0, t1: 0, t10: 0 };

export async function handleSell(ctx) {
	const { action, body, store, username, json, now, maxOwned = 999, randCode } = ctx;
	if (!username) return json({ error: 'not logged in' }, 401);
	let why = '';
	const H = makeHolds({ store, now, maxOwned, setWhy: w => { why = w; } });
	const step = async (s, patch) => { const next = { ...s, ...patch, rev: s.rev + 1 }; return (await store.setIfRev(KEY(username), next, s.rev)) ? next : null; };
	const view = s => (s ? { id: s.id, stars: s.stars, offer: s.offer, at: s.at, phase: s.phase, ...(s.ow ? { ow: true } : {}), undoLeft: s.phase === 'paid' ? Math.max(0, UNDO_MS - (now - s.at)) : 0 } : null);
	const owOf = o => ({ pokemon: o.pokemon || [], items: o.items || [], ...(o.money ? { money: o.money } : {}), ...(o.coins ? { coins: o.coins } : {}) });
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
				if (ok) ok = await H.stHold(username, HOLD(s.id), 0);   // (the place the stars will come through: made here, used in the next phase)
				if (!ok) return s;   // (a row was busy: the next call carries on)
				s = await step(s, { phase: 'pay2' }) || await store.get(KEY(username));
			} else if (s.phase === 'pay2') {
				if (!(await H.stOut(username, HOLD(s.id), s.stars))) return s;   // ('done' when the place is already used: nothing is added twice)
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
				// (the same rule as paying: this phase makes each row's empty place, the next one fills it, and a place filled is gone)
				let ok = await H.stOut(username, BACK(s.id), 0);
				if (ok && hasBc(o)) ok = await H.bcHold(username, BACK(s.id), NO_BC);
				if (ok && hasPk(o)) ok = await H.pkHold(username, BACK(s.id), NO_PK);
				if (ok && hasMs(o)) ok = await H.msHold(username, BACK(s.id), NO_MS);
				if (ok && (hasFg(o) || hasPt(o))) ok = await H.fgHold(username, BACK(s.id), [], []);
				if (!ok) return s;
				s = await step(s, { phase: 'undo2' }) || await store.get(KEY(username));
			} else if (s.phase === 'undo2') {
				let ok = true;
				if (ok && hasBc(o)) ok = await H.bcOut(username, BACK(s.id), bc(o));
				if (ok && hasPk(o)) ok = await H.pkOut(username, BACK(s.id), o.pk);
				if (ok && hasMs(o)) ok = await H.msOut(username, BACK(s.id), o.ms);
				if (ok && (hasFg(o) || hasPt(o))) ok = await H.fgOut(username, BACK(s.id), { figs: s.figs || [], things: s.things || null });
				// (the overworld's things come back through the delivery box, which the game empties into the save; one entry, by its id)
				if (ok && s.ow) ok = await H.deliver(username, { id: HOLD(s.id) + ':back', from: username, back: true, ...owOf(o), at: now });
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
		if (last && ['hold', 'pay', 'pay2', 'undo', 'undo2'].includes(last.phase)) return json({ error: 'busy: try again', sale: view(last) }, 409);
		const offer = sanitizeOffer(body.offer);
		// (cards stay dust-only; stars are not sold for stars; the overworld's things are not on the account yet)
		if (Object.keys(offer.cards).length || Object.keys(offer.pk.prints).length) return json({ error: 'cards are not sold for stars: they turn into dust in their own game' }, 400);
		offer.stars = 0;
		if (hasOw(offer)) {
			// THE OVERWORLD'S: sold on their own (their game hands them over), asked for here and paid for at the deposit
			if (hasBc(offer) || hasPk(offer) || hasMs(offer) || hasFg(offer) || hasPt(offer)) return json({ error: 'things from the overworld are sold on their own' }, 400);
			const keyItems = offer.items.filter(it => !itemTradeable(it.id)).map(it => it.id);
			if (keyItems.length) return json({ error: `key items cannot be sold: ${keyItems.join(', ')}`, untradeable: keyItems }, 400);
			const ow = { ...offer, ...owOf(offer), money: offer.money || 0, coins: offer.coins || 0 };
			const worth = offerWorth(ow, () => null).total;
			if (!(worth > 0)) return json({ error: 'that has no star value' }, 400);
			const oid = randCode() + randCode(), ask = { id: oid, phase: 'ask', offer: ow, stars: worth, at: now, ow: 1, figs: undefined, things: undefined, why: undefined, released: undefined };
			// (an ask never handed over is simply replaced by the next sale: its device is told `gone` and keeps its things)
			const wrote = last ? await step({ ...last }, ask) : ((await store.setIfRev(KEY(username), { ...ask, rev: 1 }, 0)) ? { ...ask, rev: 1 } : null);
			if (!wrote) return json({ error: 'busy: try again' }, 409);
			return json({ handover: true, id: oid, stars: worth, sale: view(wrote) });
		}
		if (hasFg(offer)) { const fg = await H.figsOf(username, offer.fg); if (!fg) return json({ error: 'that figurine is not yours to sell' }, 400); offer.fg = fg; }
		if (hasPt(offer)) { const pt = await H.ptOf(username, offer.pt); if (!pt) return json({ error: 'that item is not yours to sell (one a figurine is wearing comes off first)' }, 400); offer.pt = pt; }
		if (!hasBc(offer) && !hasPk(offer) && !hasMs(offer) && !hasFg(offer) && !hasPt(offer)) return json({ error: 'nothing to sell' }, 400);
		const stars = offerWorth(offer, () => null).total;
		if (!(stars > 0)) return json({ error: 'that has no star value' }, 400);
		const id = randCode() + randCode();
		const s0 = { rev: (last && last.rev) || 0, id, phase: 'hold', offer, stars, at: now };
		// (the row is written on the one before it as read: two sales at once cannot both start)
		const first = last ? await step({ ...last }, { id, phase: 'hold', offer, stars, at: now, figs: undefined, things: undefined, why: undefined, released: undefined, took: undefined, ow: undefined }) : ((await store.setIfRev(KEY(username), { ...s0, rev: 1 }, 0)) ? { ...s0, rev: 1 } : null);
		if (!first) return json({ error: 'busy: try again' }, 409);
		const s = await settle(first);
		if (!s || s.phase === 'refused') return json({ error: (s && s.why) || 'you no longer have that', sale: view(s) }, 400);
		return json({ ok: s.phase === 'paid', stars: s.stars, sale: view(s) }, s.phase === 'paid' ? 200 : 202);
	}

	if (action === 'inv-sell-deposit') {
		const id = String(body.id || '');
		let s = await load();
		if (!s || s.id !== id || !s.ow) return json({ gone: true });   // (replaced by a newer sale, or never asked: the server never had them)
		if (s.phase === 'ask') {
			if (body.cancel) { await step(s, { phase: 'refused', released: true, why: 'not handed over' }); return json({ cancelled: true }); }
			const next = await step(s, { phase: 'pay' });
			if (!next) return json({ error: 'busy: try again' }, 409);
			s = await settle(next);
		}
		if (s && s.phase === 'refused') return json({ cancelled: true });
		if (s && ['paid', 'undo', 'undo2', 'undone'].includes(s.phase)) return json({ landed: true, stars: s.stars, sale: view(s) });
		return json({ error: 'busy: try again', sale: view(s) }, 409);
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
