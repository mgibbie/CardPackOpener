// trade.mjs — the site's ONE trading system: two friends, a live window, anything collectible for anything collectible.
//
// What can be offered (an offer is a bundle; either side may mix kinds freely):
//   cards    Battlecards cards            { id: n }            account row <user>.collection      (server-kept)
//   packs    Battlecards packs            n                    account row <user>.packs           (server-kept)
//   dust, gold  Battlecards currencies    n                    account row <user>.dust / .gold    (server-kept)
//   stars    the star wallet              n                    stars:<user>                       (server-kept)
//   pk       Pocket Enhanced cards/packs  { prints:{id:n}, packs:n, own:{booster:n} }   pkcol:<user>.col   (server-kept copy)
//   pokemon  overworld Pokémon            [mon snapshots]      the player's save                  (the game keeps it)
//   items    overworld bag items          [{ id, count }]      the player's save                  (the game keeps it)
//
// The window is the one the overworld always had (request through the challenge inbox, both post offers, both
// accept). What changed is how an accepted trade is carried out. There is no multi-row transaction in this store, so
// the trade is a little state machine whose every step is ONE guarded write on ONE row, and can be run again safely:
//
//   talk ──both accept──▶ hold ──▶ wait ──▶ deliver ──▶ done
//                          │        │
//                          └────────┴──▶ cancelled (everything held goes back to its owner)
//
//   hold     each side's server-kept things are taken out of that player's own row and kept IN THE SAME ROW under this
//            trade's id (account row: `tradeHeld[id]`; pkcol row: `escrow[id]`). One write per row; a row that no longer
//            has what was offered refuses, and the trade is cancelled.
//   wait     a side that offered Pokémon or items must hand them over: its game takes them out of the save and says so
//            (`trade-deposit`). The server never writes a save (owner rule: a live save is only changed by its game).
//            A side that does not within WAIT_MS cancels the trade.
//   deliver  entered by one guarded write on the trade row, after which the trade can no longer be cancelled. Each row
//            then swaps its held bundle for the other side's (one write per row; "is my bundle still held?" says
//            whether it has been done), and Pokémon/items go to the receiver's delivery box (owtrade:<user>), which
//            their game empties: it adds them to the save, notes the delivery's id IN the save, then acknowledges.
//
// A request that dies anywhere leaves things held, never lost or doubled; the next call by either player carries on
// from the trade's phase. `settle()` is that "carry on", and every action runs it.
//
// Rows: xtrade:<id> (rev-guarded; not `trade:`, which the server sweeps after six hours: an unfinished trade must outlive that), tradeptr:<user> -> { id }, owtrade:<user> = { rev, list: [{ id, from, pokemon, items }] }.
import { cleanCollection, newCollection } from '../pocketenhanced/js/collection.js';
import * as PK from '../pocketenhanced/js/trade.js';
import { cleanWallet, balance } from '../site/stars.js';

export const WAIT_MS = 90_000;          // how long a side has to hand over its Pokémon/items once both accepted
export const COUNTDOWN_MS = 4_000;      // a window that asks for it: how long after both lock in before the trade is carried out (either can still back out)
const STAR_DEVICE = 'trades0';          // the star wallet counts what trades took and gave under this name, as it does a device's
export const TRADE_IDLE_MS = 10 * 60_000;   // a window nobody has touched for this long is cancelled
const LIMITS = { kinds: 60, each: 99, packs: 99, pokemon: 6, items: 20, monChars: 20_000, money: 10_000_000 };

const emptyOffer = () => ({ cards: {}, packs: 0, dust: 0, gold: 0, stars: 0, pk: { prints: {}, packs: 0, own: {} }, pokemon: [], items: [] });
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(+v) || 0));
const bag = (o, max) => { const out = {}; let n = 0; for (const [id, c] of Object.entries(o && typeof o === 'object' ? o : {})) { const k = int(c, max); if (k > 0 && n < LIMITS.kinds && typeof id === 'string' && id.length <= 64) { out[id] = k; n++; } } return out; };
/** Read an offer defensively: only the shapes above, bounded. */
export function sanitizeOffer(o) {
	o = o && typeof o === 'object' ? o : {};
	const pokemon = (Array.isArray(o.pokemon) ? o.pokemon : []).filter(m => m && typeof m === 'object' && JSON.stringify(m).length <= LIMITS.monChars).slice(0, LIMITS.pokemon);
	const items = (Array.isArray(o.items) ? o.items : []).map(it => ({ id: String((it && it.id) || '').slice(0, 64), count: int(it && it.count, 999) })).filter(it => it.id && it.count > 0).slice(0, LIMITS.items);
	return { cards: bag(o.cards, LIMITS.each), packs: int(o.packs, LIMITS.packs), dust: int(o.dust, LIMITS.money), gold: int(o.gold, LIMITS.money), stars: int(o.stars, LIMITS.money),
		pk: { prints: bag(o.pk && o.pk.prints, LIMITS.each), packs: int(o.pk && o.pk.packs, LIMITS.packs), own: bag(o.pk && o.pk.own, LIMITS.packs) }, pokemon, items };
}
const hasBc = o => o.packs > 0 || o.dust > 0 || o.gold > 0 || Object.keys(o.cards).length > 0;
const hasPk = o => o.pk.packs > 0 || Object.keys(o.pk.prints).length > 0 || Object.keys(o.pk.own || {}).length > 0;
const hasSt = o => o.stars > 0;
const hasOw = o => o.pokemon.length > 0 || o.items.length > 0;
export const offerEmpty = o => !hasBc(o) && !hasPk(o) && !hasSt(o) && !hasOw(o);

export async function handleTrade(ctx) {
	const { action, body, store, username, json, now, maxOwned = 999 } = ctx;
	if (!username) return json({ error: 'not logged in' }, 401);
	const TKEY = id => 'xtrade:' + id, sideOf = (t, u) => (t.a === u ? 'A' : t.b === u ? 'B' : null), other = s => (s === 'A' ? 'B' : 'A'), who = (t, s) => (s === 'A' ? t.a : t.b);

	// ---------- one row, one guarded write ----------
	/** The account row (Battlecards): read, change, write only if nobody wrote in between. fn(user) -> true to write, false to stop, 'done' if there is nothing to do. */
	const account = async (user, fn) => {
		for (let i = 0; i < 6; i++) {
			const cur = await store.getWithLength(user); if (!cur.value) return false;
			const u = cur.value, r = fn(u); if (r === 'done') return true; if (!r) return false;
			if (await store.setIfLength(user, u, cur.n)) return true;
		}
		return false;
	};
	/** The Pocket collection row: the same, on its `rev`. fn(col) -> the new collection, null to stop, 'done'. */
	const pocket = async (user, fn) => {
		for (let i = 0; i < 6; i++) {
			// (a player who has never opened Pocket Enhanced signed in has no collection there yet: a trade gives them a new player's)
			const row = (await store.get('pkcol:' + user)) || { rev: 0, col: newCollection(), ids: [] }, col = cleanCollection(row.col); if (!col) return false;
			const next = fn(col); if (next === 'done') return true; if (!next) return false;
			if (await store.setIfRev('pkcol:' + user, { ...row, rev: (row.rev || 0) + 1, col: next, at: now }, row.rev || 0)) return true;
		}
		return false;
	};
	/** The delivery box of a player's game. */
	const deliver = async (user, entry) => {
		for (let i = 0; i < 6; i++) {
			const row = (await store.get('owtrade:' + user)) || { rev: 0, list: [] };
			if (row.list.some(e => e.id === entry.id)) return true;   // (already there: this step ran before)
			if (await store.setIfRev('owtrade:' + user, { rev: row.rev + 1, list: [...row.list, entry].slice(-40) }, row.rev)) return true;
		}
		return false;
	};
	/** Change the trade row only if it is still as read. -> the trade as written, or null. */
	const step = async (t, patch) => { const next = { ...t, ...patch, rev: t.rev + 1, lastActive: now }; return (await store.setIfRev(TKEY(t.id), next, t.rev)) ? next : null; };

	// ---------- the kinds, as hold / give back / swap on a player's own row ----------
	const bcHold = (t, s) => account(who(t, s), u => {
		u.tradeHeld = u.tradeHeld || {}; if (u.tradeHeld[t.id]) return 'done';
		const o = t['offer' + s]; if ((u.packs || 0) < o.packs || (u.dust || 0) < o.dust || (u.gold || 0) < o.gold) return false;
		for (const [id, n] of Object.entries(o.cards)) if (((u.collection || {})[id] || 0) < n) return false;
		u.collection = u.collection || {};
		for (const [id, n] of Object.entries(o.cards)) { u.collection[id] -= n; if (!u.collection[id]) delete u.collection[id]; }
		u.packs = (u.packs || 0) - o.packs; if (o.dust) u.dust = (u.dust || 0) - o.dust; if (o.gold) u.gold = (u.gold || 0) - o.gold;
		u.tradeHeld[t.id] = { cards: o.cards, packs: o.packs, dust: o.dust, gold: o.gold }; return true;
	});
	const bcOut = (t, s, get) => account(who(t, s), u => {
		const held = u.tradeHeld && u.tradeHeld[t.id]; if (!held) return 'done';
		const add = get || held; u.collection = u.collection || {};
		for (const [id, n] of Object.entries(add.cards || {})) u.collection[id] = Math.min(maxOwned, (u.collection[id] || 0) + n);
		u.packs = (u.packs || 0) + (add.packs || 0); if (add.dust) u.dust = (u.dust || 0) + add.dust; if (add.gold) u.gold = (u.gold || 0) + add.gold; delete u.tradeHeld[t.id]; if (!Object.keys(u.tradeHeld).length) delete u.tradeHeld; return true;
	});
	// (a side that offered nothing of a kind still receives through a hold of nothing, so "is it still held?" answers for every row alike)
	const pkHold = (t, s) => pocket(who(t, s), c => ((c.escrow || {})[t.id] ? 'done' : PK.holdBundle(c, t.id, t['offer' + s].pk, now)));
	const pkOut = (t, s, get) => pocket(who(t, s), c => (!(c.escrow || {})[t.id] ? 'done' : get ? PK.receiveBundle(c, t.id, get) : PK.releaseBundle(c, t.id)));
	// stars: the wallet's counters only grow (site/stars.js), so a trade is counted as one more device, STAR_DEVICE: what
	// trades took is added to its "spent", what they gave to its "earned". `th` on the row says which trades hold how
	// many, so each step runs once however often it is called. One guarded write on the one row, like the others.
	const starRow = async (user, fn) => {
		for (let i = 0; i < 6; i++) {
			const cur = await store.get('stars:' + user), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0, w = cleanWallet(cur), th = { ...((cur && cur.th) || {}) };
			const r = fn(w, th); if (r === 'done') return true; if (!r) return false;
			if (await store.setIfRev('stars:' + user, { rev: rev + 1, e: w.e, s: w.s, at: now, ...(Object.keys(th).length ? { th } : {}) }, rev)) return true;
		}
		return false;
	};
	const stHold = (t, s) => starRow(who(t, s), (w, th) => { if (t.id in th) return 'done'; const n = t['offer' + s].stars; if (balance(w) < n) return false; if (n) w.s[STAR_DEVICE] = (w.s[STAR_DEVICE] || 0) + n; th[t.id] = n; return true; });
	const stOut = (t, s, get) => starRow(who(t, s), (w, th) => { if (!(t.id in th)) return 'done'; const n = get != null ? get : th[t.id]; if (n) w.e[STAR_DEVICE] = (w.e[STAR_DEVICE] || 0) + n; delete th[t.id]; return true; });
	const touches = (t, s, kind) => (kind === 'bc' ? hasBc(t.offerA) || hasBc(t.offerB) : kind === 'st' ? hasSt(t.offerA) || hasSt(t.offerB) : hasPk(t.offerA) || hasPk(t.offerB));

	/** Carry a trade on from wherever it stands. Safe to call any number of times, by either player. */
	const settle = async t => {
		for (let guard = 0; guard < 8 && t; guard++) {
			if (t.phase === 'talk' && t.goAt && t.acceptA && t.acceptB && now >= t.goAt) { t = await step(t, { phase: 'hold' }) || await store.get(TKEY(t.id)); continue; }   // (the countdown ran out with both still locked in)
			if (t.phase === 'hold') {
				let ok = true;
				for (const s of ['A', 'B']) {
					if (ok && touches(t, s, 'bc')) ok = await bcHold(t, s);
					if (ok && touches(t, s, 'pk')) ok = await pkHold(t, s);
					if (ok && touches(t, s, 'st')) ok = await stHold(t, s);
				}
				t = await step(t, ok ? { phase: 'wait', waitAt: now } : { phase: 'cancelled', why: 'an offer is no longer valid' }) || await store.get(TKEY(t.id));
			} else if (t.phase === 'wait') {
				const need = s => hasOw(t['offer' + s]) && !t['depo' + s];
				if (!need('A') && !need('B')) t = await step(t, { phase: 'deliver' }) || await store.get(TKEY(t.id));
				else if (now - (t.waitAt || 0) > WAIT_MS) t = await step(t, { phase: 'cancelled', why: 'a player did not hand over in time' }) || await store.get(TKEY(t.id));
				else return t;
			} else if (t.phase === 'deliver') {
				let ok = true;
				for (const s of ['A', 'B']) {
					const got = t['offer' + other(s)];
					if (ok && touches(t, s, 'bc')) ok = await bcOut(t, s, { cards: got.cards, packs: got.packs, dust: got.dust, gold: got.gold });
					if (ok && touches(t, s, 'pk')) ok = await pkOut(t, s, got.pk);
					if (ok && touches(t, s, 'st')) ok = await stOut(t, s, got.stars);
					if (ok && hasOw(got)) ok = await deliver(who(t, s), { id: t.id, from: who(t, other(s)), pokemon: got.pokemon, items: got.items, at: now });
				}
				if (!ok) return t;   // (a row was busy: the next call carries on)
				t = await step(t, { phase: 'done', done: true }) || await store.get(TKEY(t.id));
			} else if (t.phase === 'cancelled' && !t.released) {
				let ok = true;
				for (const s of ['A', 'B']) {
					if (ok) ok = await bcOut(t, s, null);
					if (ok) ok = await pkOut(t, s, null);
					if (ok) ok = await stOut(t, s, null);
					// Pokémon and items a side had already handed over come back to that side's own delivery box
					if (ok && t['depo' + s] && hasOw(t['offer' + s])) ok = await deliver(who(t, s), { id: t.id + ':back', from: who(t, s), back: true, pokemon: t['offer' + s].pokemon, items: t['offer' + s].items, at: now });
				}
				if (!ok) return t;
				t = await step(t, { released: true, cancelled: true }) || await store.get(TKEY(t.id));
			} else return t;
		}
		return t;
	};
	const view = t => (t ? { id: t.id, a: t.a, b: t.b, offerA: t.offerA, offerB: t.offerB, acceptA: !!t.acceptA, acceptB: !!t.acceptB, goIn: t.phase === 'talk' && t.goAt && t.acceptA && t.acceptB ? Math.max(0, t.goAt - now) : null, phase: t.phase, done: t.phase === 'done', cancelled: t.phase === 'cancelled', why: t.why || null, depoA: !!t.depoA, depoB: !!t.depoB, waitLeft: t.phase === 'wait' ? Math.max(0, WAIT_MS - (now - (t.waitAt || 0))) : null } : null);
	const load = async id => { const t = /^[A-Za-z0-9]{6,40}$/.test(String(id || '')) ? await store.get(TKEY(id)) : null; if (!t || !t.rev) return null; for (const k of ['offerA', 'offerB']) { const o = t[k] || {}; o.dust = o.dust || 0; o.gold = o.gold || 0; o.stars = o.stars || 0; o.pk = o.pk || { prints: {}, packs: 0 }; o.pk.own = o.pk.own || {}; t[k] = o; } return t; };   // (a window opened before dust, gold, stars and booster packs could be offered has none)
	const closePtr = async t => { for (const u of [t.a, t.b]) { const p = await store.get('tradeptr:' + u); if (p && p.id === t.id) await store.delete('tradeptr:' + u); } };

	// ---------- the delivery box (the overworld game empties it) ----------
	if (action === 'trade-box') { const row = await store.get('owtrade:' + username); return json({ deliveries: (row && row.list) || [] }); }
	if (action === 'trade-box-ack') {
		const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 60));
		for (let i = 0; i < 6; i++) {
			const row = await store.get('owtrade:' + username); if (!row || !row.list.some(e => ids.has(e.id))) return json({ ok: true });
			if (await store.setIfRev('owtrade:' + username, { rev: row.rev + 1, list: row.list.filter(e => !ids.has(e.id)) }, row.rev)) return json({ ok: true });
		}
		return json({ error: 'busy: try again' }, 409);
	}

	// ---------- opening a window ----------
	if (action === 'trade-open') {
		const from = String(body.from || ''), list = (await store.get('challenge:' + username)) || [];
		const ch = list.find(c => c.from === from && c.type === 'trade' && now - c.ts < ctx.challengeMs);
		if (!ch) return json({ error: 'that trade request expired' }, 404);
		await store.setJSON('challenge:' + username, list.filter(c => !(c.from === from && c.type === 'trade')));
		const id = ctx.randCode() + ctx.randCode();
		const t = { rev: 1, id, a: from, b: username, offerA: emptyOffer(), offerB: emptyOffer(), acceptA: false, acceptB: false, phase: 'talk', createdAt: now, lastActive: now };
		await store.setJSON(TKEY(id), t);
		await store.setJSON('tradeptr:' + from, { id, ts: now }); await store.setJSON('tradeptr:' + username, { id, ts: now });
		return json({ tradeId: id, trade: view(t) });
	}
	// the requester polls this to find the window the other player opened; and a player who reloads finds a trade still owed to them
	if (action === 'trade-mine') {
		// anything still held for a trade in my own rows is carried on first (a trade whose pointer has gone, or that was
		// swept: with no trade left to belong to, what I put up comes back to me)
		const acct = await store.get(username), pkrow = await store.get('pkcol:' + username), pkc = pkrow ? cleanCollection(pkrow.col) : null;
		const strow = await store.get('stars:' + username);
		for (const tid of new Set([...Object.keys((acct && acct.tradeHeld) || {}), ...Object.keys((pkc && pkc.escrow) || {}), ...Object.keys((strow && strow.th) || {})])) {
			const lt = await load(tid);
			if (lt) await settle(lt);
			else { const ghost = { id: tid, a: username, b: username }; await bcOut(ghost, 'A', null); await pkOut(ghost, 'A', null); await stOut(ghost, 'A', null); }
		}
		const ptr = await store.get('tradeptr:' + username); if (!ptr) return json({ tradeId: null });
		let t = await load(ptr.id);
		if (t) t = await settle(t);
		if (!t || t.phase === 'done' || (t.phase === 'cancelled' && t.released)) { await store.delete('tradeptr:' + username); return json({ tradeId: null, last: view(t) }); }
		return json({ tradeId: t.id, trade: view(t), role: sideOf(t, username) === 'A' ? 'a' : 'b' });
	}

	let t = await load(body.id);
	if (action === 'trade-poll') {
		if (!t) return json({ gone: true });
		if (!sideOf(t, username)) return json({ error: 'not your trade' }, 403);
		if (t.phase === 'talk' && now - (t.lastActive || 0) > TRADE_IDLE_MS) t = await step(t, { phase: 'cancelled', why: 'nobody was there' }) || t;
		t = await settle(t);
		if (t.phase === 'done' || (t.phase === 'cancelled' && t.released)) await closePtr(t);
		return json({ trade: view(t) });
	}
	if (action === 'trade-cancel') {
		if (!t || !sideOf(t, username)) return json({ ok: true });
		// (once delivery has begun there is nothing to cancel: the trade is carried through)
		if (t.phase === 'talk' || t.phase === 'hold' || t.phase === 'wait') t = await step(t, { phase: 'cancelled', why: `${username} cancelled` }) || await load(t.id);
		t = await settle(t);
		if (t.phase === 'done' || (t.phase === 'cancelled' && t.released)) await closePtr(t);
		return json({ ok: true, trade: view(t) });
	}
	if (!t || t.phase === 'done' || t.phase === 'cancelled') return json({ error: 'trade closed', closed: true, trade: view(t) }, 409);
	const side = sideOf(t, username); if (!side) return json({ error: 'not your trade' }, 403);

	if (action === 'trade-update') {
		if (t.phase !== 'talk') return json({ error: 'the trade is being carried out', trade: view(t) }, 409);
		const next = await step(t, { ['offer' + side]: sanitizeOffer(body.offer), acceptA: false, acceptB: false, goAt: 0 });   // (any change unlocks both, and stops a countdown)
		return json({ trade: view(next || await load(t.id)) });
	}
	if (action === 'trade-lock') {
		if (t.phase !== 'talk') return json({ trade: view(await settle(t)) });
		const mine = body.accepted !== false, both = mine && t['accept' + other(side)];
		if (both && offerEmpty(t.offerA) && offerEmpty(t.offerB)) return json({ trade: view(t), error: 'there is nothing in this trade' });
		// (count: this window shows a countdown. Both locked in then starts it instead of the trade; backing out stops it.)
		const wait = both && (body.count === true || t.count === true);
		let next = await step(t, { ['accept' + side]: mine, ...(body.count === true ? { count: true } : {}), ...(both ? (wait ? { goAt: now + COUNTDOWN_MS } : { phase: 'hold' }) : { goAt: 0 }) });
		if (!next) return json({ trade: view(await load(t.id)), error: 'the offer changed: look again' });
		next = await settle(next);
		if (next.phase === 'done' || (next.phase === 'cancelled' && next.released)) await closePtr(next);
		return json({ trade: view(next), ...(next.phase === 'cancelled' ? { error: next.why } : {}) });
	}
	// my game has taken my Pokémon and items out of my save: they are the trade's now
	if (action === 'trade-deposit') {
		if (t.phase !== 'wait') return json({ error: 'the trade is not waiting for that', trade: view(t) }, 409);
		let next = t['depo' + side] ? t : await step(t, { ['depo' + side]: true });
		if (!next) next = await load(t.id);
		next = await settle(next);
		if (next.phase === 'done') await closePtr(next);
		return json({ trade: view(next), deposited: !!next['depo' + side] });
	}
	return json({ error: 'unknown action' }, 400);
}
