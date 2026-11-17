// pocket_trade.mjs — Pocket Enhanced: two signed-in players trade one card for one card of the same rarity, and the
// free packs that arrive with time (the pack inbox, as Battlecards has).
//
// TRADING. A player offers a card and gets a 5-letter code. Another enters the code, sees the card, and proposes one of
// theirs of the same rarity. The first accepts or declines. Rows:
//   pktrade:<id>        { rev, id, code, a, give, state, b, bGive, at }   state: open | proposed | matched | cancelled
//   pktradecode:<CODE>  { rev, id }
//   pkcol:<user>        the player's collection (pocket_collection.mjs); a card on offer is in its `escrow`
// Every step is ONE compare-and-set write on ONE row, and a card is only ever moved by its own owner's row:
//   held      prints -> escrow[id]          (offering, proposing)
//   received  escrow[id] -> the other card  (the trade is `matched`)
//   released  escrow[id] -> prints          (cancelled, declined, withdrawn, or a trade that never came to be)
// so a card is in exactly one place at every moment, and a request that dies half way leaves cards held, never lost or
// doubled: the next `pktrade-mine` from that player settles them (escrow says what is still owed; settling is repeatable).
//   pktrade-offer   { give }        -> { trade }           pktrade-look    { code }       -> { trade }
//   pktrade-propose { code, give }  -> { trade }           pktrade-answer  { id, accept } -> { trade }   (the offerer)
//   pktrade-cancel  { id }          -> { trade }   (the offerer, before it is matched)
//   pktrade-withdraw{ id }          -> { trade }   (the proposer, before it is answered)
//   pktrade-mine    {}              -> { trades, settled: [{ id, got | back }] }
//
// THE PACK INBOX. pkinbox:<user> = { rev, base, inbox, last }. pkinbox-get -> { inbox, cap, timerMs, nextMs };
// pkinbox-claim { id } -> { claimed }: the inbox is emptied in one write that remembers the claim's id and size, so a
// claim asked twice (a lost answer) is answered the same way and paid once. The page adds the packs to the collection.
import { cleanCollection } from '../pocketenhanced/js/collection.js';
import * as T from '../pocketenhanced/js/trade.js';
import * as PT from '../pocketenhanced/js/packtimer.js';

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
export const SETTLE_AFTER_MS = 60_000;   // a held card with no trade naming its holder is given back only once this old (a request in flight is younger)
const TKEY = id => 'pktrade:' + id, CKEY = c => 'pktradecode:' + c, UKEY = u => 'pkcol:' + u;

export async function handlePktrade(ctx) {
	const { action, body, store, username, json, now } = ctx;
	if (!username) return json({ error: 'not logged in' }, 401);

	// ---------- the pack inbox ----------
	if (action === 'pkinbox-get' || action === 'pkinbox-claim') {
		const key = 'pkinbox:' + username;
		for (let tries = 0; tries < 4; tries++) {
			const cur = await store.get(key), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0;
			const st = PT.accrue(cur, now), last = cur && cur.last && typeof cur.last.id === 'string' ? cur.last : null;
			const out = s => ({ inbox: s.inbox, cap: PT.PACK_INBOX_CAP, timerMs: PT.PACK_TIMER_MS, nextMs: PT.etaMs(s, now) });
			if (action === 'pkinbox-get') {
				const moved = !cur || st.inbox !== (cur.inbox || 0) || st.base !== cur.base;
				if (moved && !(await store.setIfRev(key, { rev: rev + 1, base: st.base, inbox: st.inbox, last, at: now }, rev))) continue;
				return json(out(st));
			}
			const id = /^[a-z0-9]{6,24}$/.test(String(body.id || '')) ? String(body.id) : null;
			if (!id) return json({ error: 'a claim needs an id' }, 400);
			if (last && last.id === id) return json({ claimed: last.n, again: true, ...out(st) });   // (asked before: the same answer, paid once)
			const c = PT.claim(st, now);
			if (!c.claimed) return json({ claimed: 0, ...out(st) });
			if (await store.setIfRev(key, { rev: rev + 1, base: c.st.base, inbox: 0, last: { id, n: c.claimed }, at: now }, rev)) return json({ claimed: c.claimed, ...out(c.st) });
		}
		return json({ error: 'busy: try again' }, 409);
	}

	// ---------- trading ----------
	const view = t => (t ? { id: t.id, code: t.code, state: t.state, by: t.a, give: t.give, rarity: T.tradeRarity(t.give), with: t.b || null, their: t.bGive || null, mine: t.a === username, at: t.at } : null);
	const getCol = async user => { const row = await store.get(UKEY(user)); return { row, rev: (row && Number.isInteger(row.rev) && row.rev > 0) ? row.rev : 0, col: row ? cleanCollection(row.col) : null }; };
	/** Change one player's collection in one write (retried if another write got in first). `fn(col)` -> the new collection, or null to stop. */
	const change = async (user, fn) => {
		for (let tries = 0; tries < 5; tries++) {
			const { row, rev, col } = await getCol(user); if (!col) return null;
			const next = fn(col); if (!next) return null;
			if (await store.setIfRev(UKEY(user), { ...row, rev: rev + 1, col: next, at: now }, rev)) return next;
		}
		return null;
	};
	const getTrade = async id => (T.TRADE_ID.test(String(id || '')) ? await store.get(TKEY(id)) : null);
	/** Move a trade from one state to another in one write (only if it is still as read). */
	const step = async (t, next) => ((await store.setIfRev(TKEY(t.id), { ...t, ...next, rev: t.rev + 1, at: now }, t.rev)) ? { ...t, ...next, rev: t.rev + 1, at: now } : null);
	/** What this player's held cards are owed, paid: each goes to the other card, back to them, or stays held. */
	const settle = async () => {
		const done = [], { col } = await getCol(username); if (!col || !col.escrow) return done;
		for (const [tid, held] of Object.entries(col.escrow)) {
			const t = await store.get(TKEY(tid)), party = t && (t.a === username || t.b === username);
			if (t && t.state === 'matched' && party) {
				const get = t.a === username ? t.bGive : t.give;
				if (await change(username, c => T.receive(c, tid, get))) done.push({ id: tid, got: get, gave: held.p });
			} else if ((t && t.state === 'cancelled') || ((!t || !party || t.state === 'matched') && now - held.at > SETTLE_AFTER_MS)) {
				if (await change(username, c => T.release(c, tid))) done.push({ id: tid, back: held.p });
			}
		}
		return done;
	};

	if (action === 'pktrade-mine') {
		const settled = await settle(), { col } = await getCol(username), trades = [];
		for (const tid of Object.keys((col && col.escrow) || {})) { const t = await store.get(TKEY(tid)); if (t) trades.push(view(t)); }
		return json({ trades, settled });
	}
	if (action === 'pktrade-offer') {
		const give = String(body.give || ''), { col } = await getCol(username);
		if (!col) return json({ error: 'your collection is not on your account yet: open the game signed in first' }, 409);
		const why = T.whyNotGive(col, give); if (why) return json({ error: why }, 400);
		const id = now.toString(36) + ctx.randomHex(4);
		if (!(await change(username, c => T.hold(c, id, give, now)))) return json({ error: 'that card could not be put up: try again' }, 409);
		for (let i = 0; i < 12; i++) {
			let code = ''; for (let k = 0; k < 5; k++) code += CODE_ABC[Math.floor(ctx.rnd() * CODE_ABC.length)];
			if (!(await store.setIfRev(CKEY(code), { rev: 1, id, at: now }, 0))) {
				const old = await store.get(CKEY(code)), ot = old ? await store.get(TKEY(old.id)) : null;
				if (ot && (ot.state === 'open' || ot.state === 'proposed')) continue;   // a trade still going owns that code
				await store.setJSON(CKEY(code), { rev: 1, id, at: now });
			}
			const t = { rev: 1, id, code, a: username, give, state: 'open', b: null, bGive: null, at: now };
			if (await store.setIfRev(TKEY(id), t, 0)) return json({ trade: view(t) });
		}
		await change(username, c => T.release(c, id));
		return json({ error: 'no code free: try again' }, 409);
	}
	if (action === 'pktrade-look' || action === 'pktrade-propose') {
		const code = String(body.code || '').toUpperCase(); if (!CODE_RE.test(code)) return json({ error: 'a trade code is 5 letters and digits' }, 400);
		const ptr = await store.get(CKEY(code)), t = ptr ? await getTrade(ptr.id) : null;
		if (!t || t.code !== code || t.state === 'cancelled' || t.state === 'matched') return json({ error: 'there is no trade with that code' }, 404);
		if (action === 'pktrade-look') return json({ trade: view(t) });
		if (t.a === username) return json({ error: 'that is your own offer' }, 400);
		if (t.state !== 'open') return json({ error: 'someone else has already made an offer on that trade' }, 409);
		const give = String(body.give || ''), { col } = await getCol(username);
		if (!col) return json({ error: 'your collection is not on your account yet: open the game signed in first' }, 409);
		const why = T.whyNotGive(col, give); if (why) return json({ error: why }, 400);
		if (T.tradeRarity(give) !== T.tradeRarity(t.give)) return json({ error: 'a trade is one card for one card of the same rarity' }, 400);
		if (!(await change(username, c => T.hold(c, t.id, give, now)))) return json({ error: 'that card could not be put up: try again' }, 409);
		const next = await step(t, { state: 'proposed', b: username, bGive: give });
		if (!next) { await change(username, c => T.release(c, t.id)); return json({ error: 'someone else got there first' }, 409); }
		return json({ trade: view(next) });
	}
	if (['pktrade-answer', 'pktrade-cancel', 'pktrade-withdraw'].includes(action)) {
		const t = await getTrade(body.id); if (!t) return json({ error: 'no such trade' }, 404);
		let next = null;
		if (action === 'pktrade-answer') {
			if (t.a !== username) return json({ error: 'only the player who made the offer can answer' }, 403);
			if (t.state !== 'proposed') return json({ error: 'there is nothing to answer' }, 409);
			next = await step(t, body.accept === true ? { state: 'matched' } : { state: 'open', b: null, bGive: null, declined: t.b });
		} else if (action === 'pktrade-cancel') {
			if (t.a !== username) return json({ error: 'only the player who made the offer can cancel it' }, 403);
			if (t.state !== 'open' && t.state !== 'proposed') return json({ error: 'that trade is already done' }, 409);
			next = await step(t, { state: 'cancelled' });
		} else {
			if (t.b !== username || t.state !== 'proposed') return json({ error: 'you have no offer on that trade to take back' }, 409);
			next = await step(t, { state: 'open', b: null, bGive: null });
		}
		if (!next) return json({ error: 'the trade changed while you were answering: look again' }, 409);
		// the caller's own side is settled now; the other player's on their next look (a card given back to someone no
		// longer named by the trade waits out SETTLE_AFTER_MS first, or goes at once if the caller is that someone)
		let settled = [];
		if (action === 'pktrade-withdraw') { if (await change(username, c => T.release(c, t.id))) settled.push({ id: t.id, back: t.bGive }); }
		else settled = await settle();
		return json({ trade: view(next), settled });
	}
	return json({ error: 'unknown action' }, 400);
}
