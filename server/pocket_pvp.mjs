// POCKET ENHANCED ONLINE — the lobby and the match referee (server/mp.mjs routes every `pkpvp-*` action here).
//
// A match is 2-4 seats: the signed-in players who joined with the lobby's code, and (the host's choice) computer
// players for the rest. The SERVER plays the match: it holds the recipe (the seed, every deck, every action), rebuilds
// the position with the game's own engine (pocketenhanced/js/engine/engine.js), applies a player's action only if the
// engine accepts it for THAT player's seat, plays the computer seats itself, and sends each player `view(state, seat)`:
// their own hand, nobody else's, no deck. A client never holds another player's hidden cards, so it cannot leak or
// change them. When the match is over the whole recipe is sent, as its replay.
//
// Rows (every write is an exact key; the lobby row is a compare-and-set on `rev`, retried on a conflict):
//   pkpvp:<id>         {id, code, rev, at, ts, host, size, bots, players:[{name, deck, energy, ready}], seen:{name: ms},
//                       closed?, m: null | {seed, config, actions:[], at, over, left:{name:1}, auto:{name:n}}}
//   pkpvpcode:<CODE>   {rev, id, at}   a 5-letter join code (no I, O, 0, 1) -> the lobby
//   pkpvpcur:<user>    {id, at}        the lobby a player is in (rejoin after a reload / on another device)
//   pktour:<id>        a TOURNAMENT (owner's second improvement list, 2026-11-18, "yes to all": "a 4- or 8-player bracket on
//                      the existing online system, with stars and a badge for the winner"): {id, code, rev, at, ts, host,
//                      size 4|8, singles, state 'lobby'|'running'|'over', players:[{name, deck, energy, prints}], cpus:[name],
//                      rounds:[[{a, b, lid, winner}]], placed:{name: place}, paid:{name: stars}}. Each pairing is an
//                      ordinary two-seat match (pkpvp:<lid>, `tid` on it) the server starts; whoever looks next moves the
//                      winners on (tourTick). The prize goes into the star wallet once (the wallet row's note `tp`).
//   pktourcode:<CODE>  {rev, id, at}   its join code
//
// The clock (D1 has none: whoever polls evaluates it). `seen[name]` is rewritten at most every PK.SEEN_MS. A waiting
// lobby closes when its host goes quiet (PK.LOBBY_IDLE_MS); a guest who goes quiet is dropped (PK.GUEST_IDLE_MS). In a
// match a player quiet for PK.GRACE_MS concedes; a player who is there but has not acted for PK.TURN_MS has the move
// made for them (the computer player's choice for a setup or a forced choice, otherwise Execute with both passing).
import * as E from '../pocketenhanced/js/engine/engine.js';
import { nextAction } from '../pocketenhanced/js/ai.js';
import { chooseAction } from '../pocketenhanced/js/ai_search.js';
import { SAY, SAY_EVERY_MS, SAY_SHOWN_MS } from '../pocketenhanced/js/say.js';   // (the computer player that looks ahead: the one a match on this device plays against)
import { STARTERS, starterDeck } from '../pocketenhanced/js/decks.js';
import { cleanCollection, newCollection, deckOwnedError, START_DECKS } from '../pocketenhanced/js/collection.js';
import { THEME_DECKS } from '../pocketenhanced/js/data/theme_decks.js';
import { makeRank } from './pocket_rank.mjs';
import * as W from '../site/stars.js';

export const PKPVP_PROTOCOL = 28;   // 6: Celestial Guardians; 5: Shining Revelry; 4: Triumphant Light; 3: Space-Time Smackdown; 2: Mythical Island (a page without its cards must reload before it joins a match that may hold them)
export const PK = { SEEN_MS: 8_000, LOBBY_IDLE_MS: 10 * 60_000, GUEST_IDLE_MS: 90_000, GRACE_MS: 120_000, TURN_MS: 180_000, MAX_ACTIONS: 3000, MAX_ACTION_CHARS: 1500, CLOSED_KEEP_MS: 6 * 3600_000 };
const ID_RE = /^[0-9a-f]{12}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const BOT_NAMES = ['Blue', 'Green', 'Silver'];
export const INVITE_MS = 5 * 60_000;   // how long an invitation to a match stands
/** Is `who` playing a match of a tournament `viewer` is in? (Watching a tournament's matches: owner's third improvement
 *  list, 2026-11-18. A player may watch a friend's match, and any match of their own tournament.) */
export async function tourmates(store, viewer, who) {
	const cur = await store.get('pkpvpcur:' + who); if (!cur || !ID_RE.test(String(cur.id))) return false;
	const lb = await store.get('pkpvp:' + cur.id); if (!lb || !lb.tid || !ID_RE.test(String(lb.tid))) return false;
	const t = await store.get('pktour:' + lb.tid);
	return !!(t && !t.closed && t.players.some(p => p.name === viewer) && t.players.some(p => p.name === who));
}
// tournaments: the stars by where a player finished [winner, runner-up, the two who lost a semi-final (8 only)]; the
// computer players who fill a tournament's empty seats (named so no account can share the name)
export const TOUR = Object.freeze({ SIZES: [4, 8], PAY: Object.freeze({ 4: [400, 150, 0], 8: [800, 300, 100] }), LOBBY_IDLE_MS: 30 * 60_000 });
const TOUR_CPUS = ['CPU Blue', 'CPU Green', 'CPU Silver', 'CPU Gold', 'CPU Brendan', 'CPU May', 'CPU Lyra'];
const ACTIONS = new Set(['setup', 'playBasic', 'evolve', 'attach', 'retreat', 'promote', 'discardFossil', 'trainer', 'ability', 'stadium', 'execute', 'choose', 'concede']);   // (stadium: a Stadium's Use button)

/** Whose move the match is waiting on (a seat), or null. In setup: any seat that has not set up. */
function waitingOn(S) {
	if (S.over) return [];
	if (S.pending) return [S.pending.seat];
	if (S.phase === 'setup') return S.players.filter(p => !p.setup && !p.eliminated).map(p => p.seat);
	return [S.current];
}
/** The computer player's move for a seat (also the move made for a player who ran out of time). Always legal. */
/** How many of one request's computer-player decisions may look ahead (each costs tens of milliseconds of processor
 *  time; a request that has many to make finishes the rest by rule of thumb, so no request runs long). */
export const BOT_LOOKS = 24;
export function autoAction(S, m, seat, passOnly, look) {
	const banned = new Set();
	for (let t = 0; t < 40; t++) {
		let a = look && !passOnly ? chooseAction(S, seat, banned) : nextAction(E.view(S, seat), banned);   // (a move made for a player out of time is never thought about: it passes)
		if (passOnly && a && !['setup', 'choose', 'execute'].includes(a.t)) a = { t: 'execute', seat, commands: [null, null] };
		if (!a) a = { t: 'execute', seat, commands: [null, null] };
		try { E.apply(S, a); m.actions.push(a); return S; } catch (e) {
			if (!e || !e.refused) throw e;
			banned.add(JSON.stringify(a));
			S = E.replay(m.config, m.actions);   // a refusal leaves the match exactly as it was
			if (passOnly && a.t === 'execute') break;
		}
	}
	const a = { t: 'concede', seat }; E.apply(S, a); m.actions.push(a);   // (never reached in practice: passing is legal)
	return S;
}

export async function handlePkpvp(ctx) {
	const { action, body, store, username, json, now } = ctx;
	const LKEY = id => 'pkpvp:' + id, CKEY = c => 'pkpvpcode:' + c, UKEY = u => 'pkpvpcur:' + u;
	const id = String(body.id || '');
	const member = (lb, who) => !!lb && lb.players.some(p => p.name === who);
	const humansMax = lb => lb.size - lb.bots;
	const seatOf = (m, who) => m.config.players.findIndex(p => !p.ai && p.name === who);
	// The player's collection on the account (a player who has none yet has a new player's: the four starter decks)
	let colMemo;
	const myCol = async () => { if (colMemo === undefined) { const row = await store.get('pkcol:' + username); colMemo = (row && cleanCollection(row.col)) || newCollection(); } return colMemo; };
	const deckOf = async b => {
		const deck = Array.isArray(b.deck) ? b.deck.map(String).slice(0, 40) : null, energy = Array.isArray(b.energy) ? b.energy.map(String).slice(0, 6) : null;
		if (!deck || !energy) return { error: 'choose a deck' };
		let err; try { err = E.deckError(deck, energy); } catch (e) { err = 'that deck cannot be read'; }
		if (err) return { error: 'your deck is not legal: ' + err };
		// (owner's improvement list, 2026-11-18: the deck must be the player's own, checked here and not only on the page)
		const col = await myCol(), own = deckOwnedError(col, deck, START_DECKS.map(id => starterDeck(id).deck));
		if (own) return { error: 'that deck is not in your collection: ' + own };
		// (prints: the printing chosen for a card, how it is drawn; it changes nothing in play. Only printings the player holds)
		const prints = Object.fromEntries(Object.entries(E.cleanPrints(b.prints, deck)).filter(([, p]) => (col.prints[p] || 0) > 0));
		return { deck, energy, prints };
	};
	const lobbyView = lb => ({
		id: lb.id, code: lb.code, host: lb.host, size: lb.size, bots: lb.bots, singles: !!lb.singles, easy: !!lb.easy, tid: lb.tid || null, says: (lb.says || []).filter(s => now - s.t < SAY_SHOWN_MS), started: !!lb.m, over: !!(lb.m && lb.m.over),
		players: lb.players.map(p => ({ name: p.name, ready: !!p.ready || p.name === lb.host, away: now - ((lb.seen || {})[p.name] || 0) > 20_000 })),
	});
	/** Everything the clock and the computer players decide, on the rebuilt position. -> the position (m.actions grows). */
	const advance = (lb, S) => {
		const m = lb.m;
		// a player who stopped polling concedes
		for (const p of S.players) {
			if (S.over) break;
			if (p.ai || p.eliminated) continue;
			if ((m.left && m.left[p.name]) || now - ((lb.seen || {})[p.name] || m.startAt) > PK.GRACE_MS) { const a = { t: 'concede', seat: p.seat }; E.apply(S, a); m.actions.push(a); m.at = now; }
		}
		let looks = 0;
		for (let guard = 0; guard < 400 && !S.over && m.actions.length < PK.MAX_ACTIONS; guard++) {
			const seats = waitingOn(S);
			const bot = seats.find(s => S.players[s].ai);
			if (bot != null) { S = autoAction(S, m, bot, false, !lb.easy && looks++ < BOT_LOOKS); m.at = now; continue; }   // (the host may ask for the easier computer player: rule of thumb only)
			if (seats.length && now - m.at > PK.TURN_MS) {   // out of time: the move is made for them
				const s = seats[0]; m.auto = m.auto || {}; m.auto[S.players[s].name] = (m.auto[S.players[s].name] || 0) + 1;
				S = autoAction(S, m, s, true); if (waitingOn(S)[0] !== s || S.phase !== 'setup') m.at = now;
				continue;
			}
			break;
		}
		if (!S.over && m.actions.length >= PK.MAX_ACTIONS) m.over = { winner: null, why: 'the match ran too long' };
		else if (S.over && !m.over) m.over = { winner: S.over.winner, why: S.over.why };
		return S;
	};
	const matchView = (lb, S, sinceN) => {
		const m = lb.m, n = m.actions.length, seat = seatOf(m, username);
		const out = { mid: m.startAt, n, over: m.over || null, seat, deadline: m.over ? 0 : m.at + PK.TURN_MS };   // (mid: which match of this lobby)
		if (sinceN !== n) out.view = { ...E.view(S, seat >= 0 ? seat : null), n };
		if (m.over) out.recipe = { v: E.ENGINE_VERSION, config: m.config, actions: m.actions };
		return out;
	};
	/** Read the lobby, let `fn` change it, write it if it changed (compare-and-set on rev, retried). */
	const mutate = async (lid, fn) => {
		for (let i = 0; i < 5; i++) {
			const lb = await store.get(LKEY(lid));
			if (!lb || lb.closed) return json({ error: 'that match is closed', closed: true }, 404);
			const before = JSON.stringify(lb);
			lb.seen = lb.seen || {};
			const res = await fn(lb);
			if (res && res.status) return json(res.body, res.status);
			if (JSON.stringify(lb) === before) return json(res);
			const rev = lb.rev || 0;
			lb.rev = rev + 1; lb.ts = now;
			if (await store.setIfRev(LKEY(lid), lb, rev)) return json(res);
		}
		return json({ error: 'busy, try again' }, 503);
	};
	const fail = (error, status = 400, extra = {}) => ({ status, body: { error, ...extra } });
	const touch = lb => { if (member(lb, username) && now - (lb.seen[username] || 0) > PK.SEEN_MS) lb.seen[username] = now; };
	const closeIfIdle = lb => {
		if (lb.m && !lb.m.over) return false;
		if (now - (lb.seen[lb.host] || lb.at) > PK.LOBBY_IDLE_MS) { lb.closed = true; return true; }
		if (!lb.m) lb.players = lb.players.filter(p => p.name === lb.host || now - (lb.seen[p.name] || now) < PK.GUEST_IDLE_MS);
		return false;
	};
	const leaveOld = async () => {
		const cur = await store.get(UKEY(username));
		if (!cur || !ID_RE.test(String(cur.id))) return null;
		const old = await store.get(LKEY(cur.id));
		if (!old || old.closed || !member(old, username)) return null;
		if (old.m && !old.m.over) return old;   // a live match: finish or leave it first
		const rev = old.rev || 0;
		if (old.host === username) old.closed = true; else old.players = old.players.filter(p => p.name !== username);
		old.rev = rev + 1; old.ts = now;
		await store.setIfRev(LKEY(old.id), old, rev);
		return null;
	};

	// ---- tournaments: the view, the pairing's match, and moving the bracket on (see the head of the file)
	const tourView = t => {
		const r = t.rounds.length ? t.rounds[t.rounds.length - 1] : [], g = r.find(x => !x.winner && (x.a === username || x.b === username));
		return { id: t.id, code: t.code, host: t.host, size: t.size, singles: !!t.singles, state: t.state, players: t.players.map(p => p.name), cpus: t.cpus || [],
			rounds: t.rounds.map(rr => rr.map(x => ({ a: x.a, b: x.b, winner: x.winner || null, live: !!(x.lid && !x.winner) }))), placed: t.placed || {}, paid: (t.paid || {})[username] || 0,
			mine: g && g.lid ? { lid: g.lid } : null, out: t.state === 'running' && t.rounds.some(rr => rr.some(x => x.winner && x.winner !== username && (x.a === username || x.b === username))) };
	};
	const BOT_POOL = STARTERS.length + THEME_DECKS.length;
	const botDeck = () => { const i = Math.floor(ctx.rnd() * BOT_POOL), t = THEME_DECKS[i - STARTERS.length]; return i < STARTERS.length ? starterDeck(STARTERS[i].id) : { deck: t.cards.slice(), energy: t.energy.slice() }; };
	/** A pairing's match, started at once: an ordinary two-seat lobby the server plays like any other (`tid` on it). */
	const makeTourMatch = async (t, g) => {
		const human = n => t.players.find(p => p.name === n);
		const ent = n => { const p = human(n); return p ? { name: n, ai: false, deck: p.deck.slice(), energy: p.energy.slice(), prints: p.prints || {} } : { name: n, ai: true, ...botDeck() }; };
		const humans = [g.a, g.b].filter(human);
		const config = { seed: ctx.randomHex(8), players: [ent(g.a), ent(g.b)], rules: E.RULES, ...(t.singles ? { opts: { singles: true } } : {}) };
		E.createGame(config);   // (the decks were checked when each player joined)
		for (let i = 0; i < 5; i++) {
			const lid = ctx.randomHex(6);
			const lb = { id: lid, code: t.code, rev: 1, at: now, ts: now, host: humans[0], size: 2, bots: 2 - humans.length, singles: !!t.singles, easy: false, tid: t.id,
				players: humans.map(n => { const p = human(n); return { name: n, deck: p.deck, energy: p.energy, prints: p.prints || {}, ready: true }; }), seen: Object.fromEntries(humans.map(n => [n, now])),
				m: { config, actions: [], at: now, startAt: now, over: null, left: { ...Object.fromEntries(humans.filter(n => (t.left || {})[n]).map(n => [n, 1])) }, auto: {} } };
			if (!(await store.setIfRev(LKEY(lid), lb, 0))) continue;
			for (const n of humans) await store.setJSON(UKEY(n), { id: lid, at: now });
			return lid;
		}
		return null;
	};
	/** Move a tournament on: a pairing's match that ended gives its winner; two computer players settle by a coin; a
	 *  round all decided makes the next; the final decided places everyone and pays the stars (each once). */
	async function tourTick(t0) {
		const TKEY = t => 'pktour:' + t;
		for (let pass = 0; pass < 8; pass++) {
			const t = await store.get(TKEY(t0));
			if (!t || t.closed || t.state !== 'running') { if (t && t.state === 'over') await tourPay(t); return; }
			const before = JSON.stringify(t), r = t.rounds[t.rounds.length - 1], human = n => t.players.some(p => p.name === n);
			for (const g of r) {
				if (g.winner) continue;
				if (!human(g.a) && !human(g.b)) { g.winner = ctx.rnd() < 0.5 ? g.a : g.b; continue; }
				if (!g.lid) { g.lid = await makeTourMatch(t, g); continue; }
				// the match's clock first (a player who never came concedes), then its result
				await mutate(g.lid, async lb => { if (lb.m && !lb.m.over) advance(lb, E.replay(lb.m.config, lb.m.actions)); return {}; });
				const lb = await store.get(LKEY(g.lid));
				if (!lb || !lb.m) { g.winner = ctx.rnd() < 0.5 ? g.a : g.b; continue; }
				if (lb.m.over) { const w = lb.m.over.winner; g.winner = w != null && lb.m.config.players[w] ? lb.m.config.players[w].name : (ctx.rnd() < 0.5 ? g.a : g.b); }
			}
			if (r.every(g => g.winner)) {
				if (r.length === 1) {
					t.state = 'over';
					const [fin] = r, n = t.rounds.length; t.placed = { [fin.winner]: 1, [fin.winner === fin.a ? fin.b : fin.a]: 2 };
					if (n >= 2) for (const g of t.rounds[n - 2]) { const loser = g.winner === g.a ? g.b : g.a; if (!t.placed[loser]) t.placed[loser] = 3; }
				} else t.rounds.push(Array.from({ length: r.length / 2 }, (_, i) => ({ a: r[2 * i].winner, b: r[2 * i + 1].winner, lid: null, winner: null })));
			}
			if (JSON.stringify(t) === before) return;
			const rev = t.rev || 0; t.rev = rev + 1; t.ts = now;
			if (await store.setIfRev(TKEY(t0), t, rev)) { if (t.state === 'over') { await tourPay(t); return; } continue; }
		}
	}
	/** The prizes, into each human player's star wallet once (the wallet row's note `tp`: tournaments paid). */
	async function tourPay(t) {
		const pay = TOUR.PAY[t.size] || [];
		for (const p of t.players) {
			const place = (t.placed || {})[p.name], n = place ? pay[place - 1] || 0 : 0;
			if (!n) continue;
			for (let i = 0; i < 6; i++) {
				const cur = await store.get('stars:' + p.name), rev = cur && Number.isInteger(cur.rev) && cur.rev > 0 ? cur.rev : 0, w = W.cleanWallet(cur), tp = [...((cur && cur.tp) || [])];
				if (tp.includes(t.id)) break;
				w.e.tour0 = (w.e.tour0 || 0) + n;
				const keep = W.walletNotes(cur); delete keep.tp;
				if (await store.setIfRev('stars:' + p.name, { rev: rev + 1, e: w.e, s: w.s, at: now, ...keep, tp: [...tp, t.id].slice(-40) }, rev)) break;
			}
			if (!(t.paid || {})[p.name]) { for (let i = 0; i < 5; i++) { const cur = await store.get('pktour:' + t.id); if (!cur) break; cur.paid = { ...(cur.paid || {}), [p.name]: n }; const rev = cur.rev || 0; cur.rev = rev + 1; if (await store.setIfRev('pktour:' + t.id, cur, rev)) break; } }
		}
	}

	if (body.pv !== PKPVP_PROTOCOL || body.ev !== E.ENGINE_VERSION) return json({ error: 'your game is out of date: reload', pv: PKPVP_PROTOCOL, ev: E.ENGINE_VERSION }, 409);

	if (action === 'pkpvp-create') {
		const d = await deckOf(body); if (d.error) return json({ error: d.error }, 400);
		const size = [2, 3, 4].includes(body.size) ? body.size : 2, bots = Math.max(0, Math.min(size - 1, Math.floor(+body.bots) || 0));
		const live = await leaveOld();
		if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409);
		for (let i = 0; i < 10; i++) {
			let code = ''; for (let k = 0; k < 5; k++) code += CODE_ABC[Math.floor(ctx.rnd() * CODE_ABC.length)];
			const nid = ctx.randomHex(6);
			if (!(await store.setIfRev(CKEY(code), { rev: 1, id: nid, at: now }, 0))) {
				const held = await store.get(CKEY(code));
				const hl = held && ID_RE.test(String(held.id)) ? await store.get(LKEY(held.id)) : null;
				if (hl && !hl.closed && now - (hl.ts || 0) < PK.CLOSED_KEEP_MS) continue;   // a live lobby owns that code
				await store.setJSON(CKEY(code), { rev: 1, id: nid, at: now });
			}
			const lb = { id: nid, code, rev: 1, at: now, ts: now, host: username, size, bots, singles: body.singles === true, easy: body.easy === true, players: [{ name: username, deck: d.deck, energy: d.energy, prints: d.prints, ready: true }], seen: { [username]: now }, m: null };
			if (!(await store.setIfRev(LKEY(nid), lb, 0))) continue;
			await store.setJSON(UKEY(username), { id: nid, at: now });
			return json({ lobby: lobbyView(lb) });
		}
		return json({ error: 'busy, try again' }, 503);
	}
	// an invitation: the host of a match that has not started tells a friend which match to join. pkinvite:<user> =
	// { rev, list: [{ from, code, id, ts }] }; an invitation lasts INVITE_MS, and one from the same player replaces the last.
	if (action === 'pkpvp-invite') {
		const to = String(body.to || '').trim().toLowerCase(), lb = await store.get(LKEY(id));
		if (!lb || lb.closed || lb.host !== username) return json({ error: 'only the host of a match can invite to it' }, 403);
		if (lb.m && !lb.m.over) return json({ error: 'the match has started' }, 409);
		if (!to || to === username || !((ctx.user && ctx.user.friends) || []).includes(to)) return json({ error: 'you can only invite a friend' }, 403);
		for (let i = 0; i < 5; i++) {
			const row = (await store.get('pkinvite:' + to)) || { rev: 0, list: [] };
			const list = [...row.list.filter(v => v.from !== username && now - v.ts < INVITE_MS), { from: username, code: lb.code, id: lb.id, ts: now }].slice(-6);
			if (await store.setIfRev('pkinvite:' + to, { rev: row.rev + 1, list }, row.rev)) return json({ ok: true });
		}
		return json({ error: 'busy: try again' }, 409);
	}
	if (action === 'pkpvp-invites') {
		const row = await store.get('pkinvite:' + username), out = [];
		for (const v of (row && row.list) || []) { if (now - v.ts >= INVITE_MS) continue; const lb = await store.get(LKEY(v.id)); if (lb && !lb.closed && !(lb.m && !lb.m.over) && lb.players.length + lb.bots < lb.size && !member(lb, username)) out.push({ from: v.from, code: v.code }); }
		return json({ invites: out });
	}
	if (action === 'pkpvp-mine') {
		const cur = await store.get(UKEY(username));
		const lb = cur && ID_RE.test(String(cur.id)) ? await store.get(LKEY(cur.id)) : null;
		if (!lb || lb.closed || !member(lb, username)) return json({ lobby: null });
		return json({ lobby: lobbyView(lb) });
	}
	if (action === 'pkpvp-join') {
		const code = String(body.code || '').trim().toUpperCase();
		if (!CODE_RE.test(code)) return json({ error: 'a code is 5 letters and numbers' }, 400);
		const d = await deckOf(body); if (d.error) return json({ error: d.error }, 400);
		const c = await store.get(CKEY(code));
		const lid = c && ID_RE.test(String(c.id)) ? c.id : '';
		if (!lid) return json({ error: 'no match with that code', closed: true }, 404);
		const peek = await store.get(LKEY(lid));
		if (!peek || peek.closed || peek.code !== code) return json({ error: 'no match with that code', closed: true }, 404);
		if (!member(peek, username)) { const live = await leaveOld(); if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409); }
		return mutate(lid, async lb => {
			if (!member(lb, username)) {
				if (lb.m) return fail('that match has already started', 409);
				if (lb.players.length >= humansMax(lb)) return fail('that match is full', 409);
				lb.players.push({ name: username, deck: d.deck, energy: d.energy, prints: d.prints, ready: false });
			}
			lb.seen[username] = now;
			await store.setJSON(UKEY(username), { id: lid, at: now });
			return { lobby: lobbyView(lb) };
		});
	}
	if (!ID_RE.test(id) && !action.startsWith('pkpvp-t')) return json({ error: 'bad match id' }, 400);   // (a tournament's actions name it by `tid`)

	if (action === 'pkpvp-update') {
		return mutate(id, async lb => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			const me = lb.players.find(p => p.name === username);
			if (body.deck != null) { const d = await deckOf(body); if (d.error) return fail(d.error); me.deck = d.deck; me.energy = d.energy; me.prints = d.prints; }
			if (typeof body.ready === 'boolean') me.ready = body.ready;
			if (lb.host === username) {
				if ([2, 3, 4].includes(body.size)) lb.size = Math.max(body.size, lb.players.length);
				if (typeof body.singles === 'boolean') lb.singles = body.singles;
				if (typeof body.easy === 'boolean') lb.easy = body.easy;
				if (Number.isFinite(+body.bots) && body.bots != null) lb.bots = Math.max(0, Math.floor(+body.bots));
				lb.bots = Math.max(0, Math.min(lb.bots, lb.size - lb.players.length));
			}
			touch(lb);
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'pkpvp-start') {
		return mutate(id, async lb => {
			if (lb.host !== username) return fail('only the host can start', 403);
			if (lb.tid) return fail('a tournament match is played once', 409);
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			if (lb.players.length + lb.bots < 2) return fail('a match needs at least two players');
			if (lb.players.some(p => p.name !== lb.host && !p.ready)) return fail('not everyone is ready');
			// a computer player's deck: any ready-made deck or any of Pocket's own
			const BOT_DECKS = STARTERS.length + THEME_DECKS.length;
			const pick = () => { const i = Math.floor(ctx.rnd() * BOT_DECKS), t = THEME_DECKS[i - STARTERS.length]; return i < STARTERS.length ? starterDeck(STARTERS[i].id) : { deck: t.cards.slice(), energy: t.energy.slice() }; };
			const players = [...lb.players.map(p => ({ name: p.name, ai: false, deck: p.deck.slice(), energy: p.energy.slice(), prints: p.prints || {} })), ...Array.from({ length: lb.bots }, (_, i) => ({ name: BOT_NAMES[i], ai: true, ...pick() }))];
			const config = { seed: ctx.randomHex(8), players, rules: E.RULES, ...(lb.singles ? { opts: { singles: true } } : {}) };   // (the host's choice: singles is one Active slot and a Bench of three)
			let S; try { S = E.createGame(config); } catch (e) { if (e && e.refused) return fail(e.message); throw e; }
			lb.m = { config, actions: [], at: now, startAt: now, over: null, left: {}, auto: {} };
			for (const p of lb.players) { lb.seen[p.name] = Math.max(lb.seen[p.name] || 0, now - PK.GRACE_MS / 2); if (p.name !== lb.host) p.ready = false; }
			lb.seen[username] = now;
			S = advance(lb, S);
			return { lobby: lobbyView(lb), match: matchView(lb, S, -1) };
		});
	}
	// the ranked ladder (server/pocket_rank.mjs): a finished match of two people is rated by whoever looks next (once)
	const rated = async res => { try { const lb = await store.get(LKEY(id)); if (lb && lb.m && lb.m.over) { await makeRank({ store, now }).rateMatch(lb); if (lb.tid) await tourTick(lb.tid); } } catch (e) { /* rated on the next look */ } return res; };
	if (action === 'pkpvp-sync') {
		return rated(await mutate(id, async lb => {
			if (!member(lb, username)) return fail('you are not in that match', 403, { closed: true });
			touch(lb);
			if (closeIfIdle(lb)) return { lobby: null, closed: true };
			if (!lb.m) return { lobby: lobbyView(lb) };
			let S = E.replay(lb.m.config, lb.m.actions);
			if (!lb.m.over) S = advance(lb, S);
			return { lobby: lobbyView(lb), match: matchView(lb, S, Number.isInteger(body.n) ? body.n : -1) };
		}));
	}
	// a quick message: one of the listed phrases, by number (say.js), to everyone at the table
	if (action === 'pkpvp-say') {
		const i = body.i;
		if (!Number.isInteger(i) || i < 0 || i >= SAY.length) return json({ error: 'not a message' }, 400);
		return mutate(id, async lb => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			const mine = (lb.says || []).filter(s => s.by === username);
			if (mine.length && now - mine[mine.length - 1].t < SAY_EVERY_MS) return fail('one message at a time', 429);
			lb.sayK = (lb.sayK || 0) + 1;
			lb.says = [...(lb.says || []).filter(s => now - s.t < SAY_SHOWN_MS).slice(-7), { k: lb.sayK, by: username, i, t: now }];
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'pkpvp-act') {
		const a = body.a;
		if (!a || typeof a !== 'object' || !ACTIONS.has(a.t) || JSON.stringify(a).length > PK.MAX_ACTION_CHARS) return json({ error: 'not an action' }, 400);
		return rated(await mutate(id, async lb => {
			const m = lb.m;
			if (!m) return fail('the match has not started', 409);
			const seat = seatOf(m, username);
			if (seat < 0) return fail('you are not in that match', 403);
			lb.seen[username] = now;
			let S = E.replay(m.config, m.actions);
			if (!m.over) S = advance(lb, S);   // the clock first: this action lands on the position everyone has
			if (m.over) return { lobby: lobbyView(lb), match: matchView(lb, S, -1), refused: 'the match is over' };
			// an action is for the position its sender saw (a request sent twice must not act twice). Not in setup, where
			// everyone puts their Pokémon down at once and nobody's choice depends on anyone else's; never for a concession.
			if (S.phase !== 'setup' && a.t !== 'concede' && Number.isInteger(body.n) && body.n !== m.actions.length) return { lobby: lobbyView(lb), match: matchView(lb, S, -1), refused: 'the table changed: look again' };
			const act = { ...a, seat };   // a player acts only for their own seat, whatever they sent
			try { E.apply(S, act); } catch (e) {
				if (!e || !e.refused) throw e;
				S = E.replay(m.config, m.actions);
				return { lobby: lobbyView(lb), match: matchView(lb, S, -1), refused: e.message };
			}
			m.actions.push(act); m.at = now;
			if (act.t === 'concede') { m.left = m.left || {}; m.left[username] = 1; }
			S = advance(lb, S);
			return { lobby: lobbyView(lb), match: matchView(lb, S, -1) };
		}));
	}
	if (action === 'pkpvp-leave') {
		const res = await mutate(id, async lb => {
			if (!member(lb, username)) return { ok: true };
			if (lb.m && !lb.m.over) {
				const m = lb.m; m.left = m.left || {}; m.left[username] = 1;
				let S = E.replay(m.config, m.actions);
				S = advance(lb, S);   // (their concession is the clock's first step)
				return { ok: true };
			}
			if (lb.host === username) lb.closed = true; else lb.players = lb.players.filter(p => p.name !== username);
			return { ok: true };
		});
		// (only if it is still this match: a tournament may already have put the player in their next one)
		{ const cur = await store.get(UKEY(username)); if (!cur || cur.id === id) await store.setJSON(UKEY(username), { id: '', at: now }); }
		return res;
	}
	// ---------------------------------------------------------------- tournaments (pktour:<id>; see the head of the file)
	if (action.startsWith('pkpvp-t')) {
		const TKEY = t => 'pktour:' + t, TCKEY = c => 'pktourcode:' + c;
		const tid = String(body.tid || '');
		const inTour = (t, who) => t.players.some(p => p.name === who);
		const tmut = async (t0, fn) => {
			for (let i = 0; i < 5; i++) {
				const t = await store.get(TKEY(t0));
				if (!t || t.closed) return json({ error: 'that tournament is closed', closed: true }, 404);
				const before = JSON.stringify(t);
				const res = await fn(t);
				if (res && res.status) return json(res.body, res.status);
				if (JSON.stringify(t) === before) return json(res);
				const rev = t.rev || 0; t.rev = rev + 1; t.ts = now;
				if (await store.setIfRev(TKEY(t0), t, rev)) { if (res && res.after) await res.after(); delete (res || {}).after; return json(res); }
			}
			return json({ error: 'busy, try again' }, 503);
		};
		if (action === 'pkpvp-tcreate') {
			const d = await deckOf(body); if (d.error) return json({ error: d.error }, 400);
			const size = TOUR.SIZES.includes(body.size) ? body.size : 4;
			for (let i = 0; i < 10; i++) {
				let code = ''; for (let k = 0; k < 5; k++) code += CODE_ABC[Math.floor(ctx.rnd() * CODE_ABC.length)];
				const nid = ctx.randomHex(6);
				if (!(await store.setIfRev(TCKEY(code), { rev: 1, id: nid, at: now }, 0))) {
					const held = await store.get(TCKEY(code)), ht = held && ID_RE.test(String(held.id)) ? await store.get(TKEY(held.id)) : null;
					if (ht && !ht.closed && now - (ht.ts || 0) < PK.CLOSED_KEEP_MS) continue;
					await store.setJSON(TCKEY(code), { rev: 1, id: nid, at: now });
				}
				const t = { id: nid, code, rev: 1, at: now, ts: now, host: username, size, singles: body.singles === true, state: 'lobby', players: [{ name: username, deck: d.deck, energy: d.energy, prints: d.prints }], cpus: [], rounds: [], placed: {}, paid: {} };
				if (!(await store.setIfRev(TKEY(nid), t, 0))) continue;
				return json({ tour: tourView(t) });
			}
			return json({ error: 'busy, try again' }, 503);
		}
		if (action === 'pkpvp-tjoin') {
			const code = String(body.code || '').toUpperCase();
			if (!CODE_RE.test(code)) return json({ error: 'that is not a tournament code' }, 400);
			const c = await store.get(TCKEY(code));
			if (!c || !ID_RE.test(String(c.id))) return json({ error: 'no tournament has that code' }, 404);
			const d = await deckOf(body); if (d.error) return json({ error: d.error }, 400);
			return tmut(c.id, async t => {
				if (inTour(t, username)) return { tour: tourView(t) };
				if (t.state !== 'lobby') return fail('that tournament has started', 409);
				if (t.players.length >= t.size) return fail('that tournament is full', 409);
				t.players.push({ name: username, deck: d.deck, energy: d.energy, prints: d.prints });
				return { tour: tourView(t) };
			});
		}
		if (!ID_RE.test(tid)) return json({ error: 'which tournament?' }, 400);
		if (action === 'pkpvp-tget') {
			await tourTick(tid);
			const t = await store.get(TKEY(tid));
			if (!t || t.closed) return json({ error: 'that tournament is closed', closed: true }, 404);
			if (!inTour(t, username)) return json({ error: 'you are not in that tournament' }, 403);
			return json({ tour: tourView(t) });
		}
		if (action === 'pkpvp-tstart') {
			const res = await tmut(tid, async t => {
				if (t.host !== username) return fail('only the host can start', 403);
				if (t.state !== 'lobby') return fail('the tournament has started', 409);
				// the empty seats: computer players; the seats in a random order, so the bracket is a draw
				t.cpus = TOUR_CPUS.slice(0, t.size - t.players.length);
				const seats = [...t.players.map(p => p.name), ...t.cpus];
				for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(ctx.rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
				t.state = 'running';
				t.rounds = [Array.from({ length: seats.length / 2 }, (_, i) => ({ a: seats[2 * i], b: seats[2 * i + 1], lid: null, winner: null }))];
				return { ok: true };
			});
			if (res.status !== 200) return res;
			await tourTick(tid);
			const t = await store.get(TKEY(tid));
			return json({ tour: tourView(t) });
		}
		if (action === 'pkpvp-tleave') {
			return tmut(tid, async t => {
				if (!inTour(t, username)) return { ok: true };
				if (t.state === 'lobby') { if (t.host === username) t.closed = true; else t.players = t.players.filter(p => p.name !== username); return { ok: true }; }
				// running: their match is conceded (the clock does it), and an undecided pairing of theirs not yet started is lost
				const r = t.rounds[t.rounds.length - 1];
				for (const g of r) if (!g.winner && !g.lid && (g.a === username || g.b === username)) g.winner = g.a === username ? g.b : g.a;
				(t.left = t.left || {})[username] = 1;
				return { ok: true };
			});
		}
		return json({ error: 'unknown action' }, 400);
	}
	return json({ error: 'unknown action' }, 400);
}
