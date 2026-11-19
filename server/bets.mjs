// bets.mjs — spectator bets (owner, 2026-11-19: "let spectators make bets"; site-improvement list item 7).
//
// The owner's choices: bets are in STARS (the site's currency, site/stars.js), the odds are a PARIMUTUEL pool (every stake on
// a game goes into one pot; when it settles, the stakers on the winning outcome split the whole pot in proportion to their
// stakes: nothing is made or lost, the rounding included), there is NO limit (any amount the bettor holds), and every kind
// of game can be bet on: one player against another, a solo run against the game, and a tournament.
//
// A MARKET is one game instance and a small list of outcomes:
//   s:<game>:<runner>:<run>   a solo run (Micatro, Scoundrel, Pair of Pears, Pocket Enhanced against the computer, PokéChess):
//                             outcomes 'win' / 'lose'; the result is what the runner's own game reports (publish-<game> bet.res,
//                             or its over / won). A player could throw their own run: they can never bet on it, and only their
//                             friends can, so that is the guard (these are stars, not money).
//   m:<lobby>:<n>             a Micatro Multiplayer match: one outcome per player; the referee (server/micatro_pvp.mjs) decides
//   p:<lobby>:<startAt>       a Pocket Enhanced online match: one outcome per seat (computer players too); the server plays the
//                             match (server/pocket_pvp.mjs), so it decides
//   t:<tournament>            who wins a Pocket Enhanced tournament (its placings, server/pocket_pvp.mjs)
//   c:<cardmatch id>          (stage 2) a Battlecards live duel or free-for-all: one outcome per seat (computer seats too); the
//                             match row decides (`over` / `winner`: the host's engine, or the server's abandonment call)
//   a:<amatch id>             (stage 2) a Battlecards mail duel: one outcome per player; the server's match row decides
//   (stage 2 solo runs: s:cards:… a Battlecards run or single fight, settled by the player's own `res` only (its row's `over`
//   is one fight's); s:micasurvivor:<host>:… a MicaSurvivor run, a party's run being ONE market on its host's run)
// A game reports itself through the publisher every watchable game already runs (micatro/js/net.js): its publish carries
// bet = {run, prog, res?, pk?}: the instance's own id (stable over a reload), how far it has got (`prog`: Micatro's ante,
// Scoundrel's dungeon, Pair of Pears' level, Pocket's turn, PokéChess's move), and its result once it has one. That rides
// in the state row the publish writes anyway, so a game nobody bets on costs no extra writes. The market itself is made the
// first time someone who may bet looks (bet-get), inside the betting window.
//
// The BETTING WINDOW: from the game's start until its early milestone (MARK: the first report at or past it) or WINDOW_MS,
// whichever comes first, so a late, near-certain bet is not possible. The server decides it: a stake lands only while open.
// WHO may bet: someone allowed to watch that game (the runner's friend; for a Pocket tournament's match, also a player of that
// tournament), never the runner, never a player in a match. One bet a market: it can be raised while open, never moved to
// another outcome (moving would let a bettor follow the game).
//
// MONEY. The wallet (stars:<user>, site/stars.js) counts in counters that only grow, one pair a "device"; bets are one more
// device, BET.DEVICE: a stake is added to its spent, a payout to its earned. Two notes on the wallet row:
// A stake on a market: stakes[bettor] = {o: the outcome, stars: its value in stars, ids, at, goods?}. Only stars can be
// staked today; `goods` is kept for the owner's next step (2026-11-19: any tradeable thing can be staked at its star value,
// sold to the bank through the trade system's hold paths, winners paid in stars): the pool and the split only ever read
// `stars`, so goods stakes need no change to the settlement.
//   bq {bid: {m, n, at}}   stakes taken from the wallet and not yet in their market (a stake's journey is two rows)
//   bw [market ids]        markets that have paid this wallet (a payout or a refund), so each pays once
// Placing (bet-place {id, o, n, bid}; `bid` the client's id for this placement, so a retry never takes twice):
//   1. the wallet: take n, note bq[bid] (one guarded write; a retry sees bq[bid] and takes nothing)
//   2. the market: add n to the bettor's stake if it is still open, with bid in its ids (one guarded write)
//   3. the wallet: drop bq[bid] (only the note)
//   (2 finding the market closed: first the closing is written on the market, then the stake is given back by removing
//   bq[bid] in the same write as the refund. A market written closed never opens again, so a stake is either in its
//   market or refunded, never both. A stake left half way (the request died) is finished by the bettor's next look:
//   bet-mine, or their next star sync.)
// SETTLING: the result is fixed on the market once (compare-and-set), with every payout worked out there (`pay`); then each
// wallet is paid through its `bw` note, and the market notes who has been paid. Run again (a retry, a race, another
// spectator looking) it pays nobody twice. Nobody on the winning outcome, a draw, a game that stops reporting for STALE_MS,
// or a run the player abandons (they start another): every stake goes back.
//
// Rows: betm:<market id> (the market), betcur:<game>:<player> {id, at} (the market of a player's game, for the "N stars
// riding on this game" badge), betmine:<user> {rev, list} (the markets a bettor has stakes in, so a payout reaches them
// even if they stop watching). Swept by the lazy GC long after they settle (GC_TABLE in server/mp.mjs).
import * as W from '../site/stars.js';

export const BET = Object.freeze({
	WINDOW_MS: 3 * 60_000,       // betting closes this long after the game started, if its milestone has not closed it first
	STALE_MS: 15 * 60_000,       // a game silent this long has stopped: its stakes go back
	TOUR_STALE_MS: 3 * 3600_000, // ...a tournament (its row only changes when a match ends)
	DEVICE: 'wagers0',           // the wallet "device" bets count under (site/stars.js: 5-24 letters and digits)
	PEND_MS: 20_000,             // a stake half way (bq) this old is finished by the bettor's next look
	BW_MAX: 300,                 // markets remembered as paid, per wallet
	MINE_MAX: 60,                // markets a bettor's index keeps
	IDS_MAX: 40,                 // placement ids a stake remembers
});
/** The early milestone each game closes betting on (the publish's `prog` at or past it).
 *  Stage 2 (Battlecards, MicaSurvivor):
 *   cards         a single fight (Quick Match, a match against the matchmaker's AI, a ?boss= fight, a local free-for-all, a
 *                 live duel or free-for-all): its turn 3 (`prog` = the engine's turnNumber). A RUN (Dungeon, Heist, Tombs,
 *                 Duels, Arena, the five Lorequests): its first fight decided (`prog` = fights finished): CARD_RUN_MARK.
 *                 A mail duel: the match row's own move count (MAIL_MARK), since its players take turns days apart.
 *   micasurvivor  by the clock, not by `prog`: WIN_MS (75 s into the run), so the beacon need not be rewritten for it. */
export const MARK = Object.freeze({ micatro: 2, scoundrel: 2, pears: 2, pocket: 3, pokechess: 6, cards: 3, micasurvivor: 1e9 });
export const CARD_RUN_MARK = 1, MAIL_MARK = 4;
/** Battlecards' run modes (the publish's `mode`): a market on the whole run, not one fight of it. */
export const CARD_RUNS = Object.freeze(['dungeon', 'heist', 'tombs', 'duels', 'arena', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse']);
/** A game whose betting window is not BET.WINDOW_MS. */
export const WIN_MS = Object.freeze({ micasurvivor: 75_000 });
const MAIL_WIN_MS = 7 * 86400_000, MAIL_STALE_MS = 14 * 86400_000, CARD_RUN_STALE_MS = 60 * 60_000;
/** A game whose state row's `over` is not its market's end (a Battlecards run's row says each FIGHT is over): only `bet.res` settles it. */
const RES_ONLY = new Set(['cards']);
export const RUN_RE = /^[A-Za-z0-9_.-]{1,48}$/;
export const BID_RE = /^[a-z0-9]{8,24}$/;
const LOBBY_RE = /^[0-9a-f]{12}$/;
const CAPS_RE = /^[A-Z]{12}$/;   // a Battlecards live match (cardmatch:) or mail duel (amatch:): server/mp.mjs randCode x 2
const NAME_RE = /^[a-z0-9_]{1,40}$/;
const MID_RE = /^(s:[a-z]{2,12}:[a-z0-9_]{1,40}:[A-Za-z0-9_.-]{1,48}|m:[0-9a-f]{12}:\d{1,6}|p:[0-9a-f]{12}:\d{1,15}|t:[0-9a-f]{12}|c:[A-Z]{12}|a:[A-Z]{12})$/;
/** MicaSurvivor: the one yes / no each mode is bet on (the run's own win where it has one; else lasting MSURV_SURVIVE_S). */
export const MSURV_SURVIVE_S = 600;
const MSURV_WIN = { tower: 'wins the Tower', rifts: 'lasts to the rifts\' clock', 'exp-classic': 'completes the Expedition', 'exp-dive': 'escapes the Dive', 'exp-threed': 'clears the 3D run' };
function soloLabels(game, runner, b) {
	if (game === 'micasurvivor') return [runner + ' ' + (MSURV_WIN[b.md] || 'survives 10 minutes'), runner + ' falls first'];
	if (game === 'cards' && CARD_RUNS.includes(b.md)) return [runner + ' wins the run', runner + ' loses the run'];
	return [runner + ' wins', runner + ' loses'];
}
export const marketIdOk = (id) => typeof id === 'string' && MID_RE.test(id);

/** The pool split (pure). stakes {user: {o, stars}}, the winning outcome (null: none) -> {pay: {user: stars}, refund}.
 *  Winners share the whole pool in proportion to their stakes, each share rounded down; what the rounding leaves goes to
 *  the largest winning stake (the first by name on a tie). Nobody on the winning outcome, or no result: every stake back. */
export function payouts(stakes, result) {
	const list = Object.entries(stakes || {}).filter(([, s]) => s && Number.isSafeInteger(s.stars) && s.stars > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
	const pool = list.reduce((a, [, s]) => a + BigInt(s.stars), 0n);
	const win = result == null ? [] : list.filter(([, s]) => s.o === result);
	const side = win.reduce((a, [, s]) => a + BigInt(s.stars), 0n);
	const pay = {};
	if (!win.length || side === 0n) { for (const [u, s] of list) pay[u] = s.stars; return { pay, refund: true }; }
	let given = 0n, top = null;
	for (const [u, s] of win) {
		const share = (pool * BigInt(s.stars)) / side;   // (BigInt: pool x stake can pass 2^53; the division rounds down)
		pay[u] = Number(share); given += share;
		if (!top || s.stars > stakes[top].stars) top = u;
	}
	pay[top] += Number(pool - given);
	return { pay, refund: false };
}

/** A publish's `bet` report, cleaned, with when this instance was first heard of (`since`, kept from the row before while it
 *  is the same instance). pvp: a Micatro Multiplayer lobby id (the publish's own `pvp`). -> the report, or null. */
export function cleanReport(raw, prev, now, { pvp = '', mode = '' } = {}) {
	if (!raw || typeof raw !== 'object') return null;
	const run = String(raw.run || '');
	if (!RUN_RE.test(run)) return null;
	const prog = Math.max(0, Math.min(1e6, Math.floor(+raw.prog) || 0));
	const res = raw.res === 'win' || raw.res === 'lose' || raw.res === 'draw' ? raw.res : null;   // (a draw: PokéChess's stalemate; every stake back)
	const pk = LOBBY_RE.test(String(raw.pk || '')) ? String(raw.pk) : '';
	// (stage 2) cm: a Battlecards live match, am: a Battlecards mail duel (their rows decide); md: the publish's mode (which
	// milestone, which yes / no); host: a MicaSurvivor co-op guest names the party's host, whose run is the market
	const cm = CAPS_RE.test(String(raw.cm || '')) ? String(raw.cm) : '', am = CAPS_RE.test(String(raw.am || '')) ? String(raw.am) : '';
	const md = /^[a-z][a-z-]{0,23}$/.test(String(mode || '')) ? String(mode) : '';
	const host = NAME_RE.test(String(raw.host || '')) ? String(raw.host) : '';
	const since = prev && prev.run === run && Number.isFinite(prev.since) ? prev.since : now;
	return { run, prog, since, ...(res ? { res } : {}), ...(pk ? { pk } : {}), ...(LOBBY_RE.test(pvp) ? { pvp } : {}), ...(cm ? { cm } : {}), ...(am ? { am } : {}), ...(md ? { md } : {}), ...(host ? { host } : {}) };
}

/** The bet engine over one request's store. stateKey(game) -> the state row prefix a game publishes to, or null. */
export function makeBets({ store, now, stateKey }) {
	const MKEY = id => 'betm:' + id;
	const gameOk = g => typeof g === 'string' && !!stateKey(g) && Object.prototype.hasOwnProperty.call(MARK, g);

	// ---------------------------------------------------------------- the wallet (one guarded write on one row)
	/** fn(w, bq, bw) changes them and returns true, 'done' (nothing to do) or false / a reason (refused). -> {ok, wallet} | {why} */
	async function walletDo(user, fn) {
		for (let i = 0; i < 8; i++) {
			const cur = await store.get('stars:' + user), rev = cur && Number.isInteger(cur.rev) && cur.rev > 0 ? cur.rev : 0;
			const w = W.cleanWallet(cur), bq = { ...((cur && cur.bq && typeof cur.bq === 'object') ? cur.bq : {}) }, bw = Array.isArray(cur && cur.bw) ? cur.bw.slice() : [];
			const r = fn(w, bq, bw);
			if (r === 'done') return { ok: true, wallet: w, done: true };
			if (r !== true) return { why: r || 'refused' };
			const notes = W.walletNotes(cur); delete notes.bq; delete notes.bw;   // (every other writer's notes kept as they are)
			if (Object.keys(bq).length) notes.bq = bq;
			if (bw.length) notes.bw = bw.slice(-BET.BW_MAX);
			if (await store.setIfRev('stars:' + user, { rev: rev + 1, e: w.e, s: w.s, at: now, ...notes }, rev)) return { ok: true, wallet: w };
		}
		return { why: 'busy: try again' };
	}
	const credit = (user, mid, n) => walletDo(user, (w, bq, bw) => {
		if (bw.includes(mid)) return 'done';
		if (n > 0) w.e[BET.DEVICE] = (w.e[BET.DEVICE] || 0) + n;
		bw.push(mid); return true;
	});
	/** Give back a stake that never reached its market: only while bq still holds it (whoever gets there first). */
	const unstake = (user, bid) => walletDo(user, (w, bq) => {
		const q = bq[bid]; if (!q) return 'done';
		w.e[BET.DEVICE] = (w.e[BET.DEVICE] || 0) + q.n; delete bq[bid]; return true;
	});
	const unnote = (user, bid) => walletDo(user, (w, bq) => { if (!bq[bid]) return 'done'; delete bq[bid]; return true; });

	// ---------------------------------------------------------------- a row changed by compare-and-set on `rev`
	async function mutate(key, fn) {
		for (let i = 0; i < 8; i++) {
			const cur = await store.get(key);
			if (!cur) return { gone: true };
			const r = fn(cur);
			if (r === undefined || r === false || (r && r.skip)) return { row: cur, r };
			const rev = cur.rev || 0; cur.rev = rev + 1;
			if (await store.setIfRev(key, cur, rev)) return { row: cur, r, wrote: true };
		}
		return { busy: true };
	}

	// ---------------------------------------------------------------- what a game is: the market(s) a runner's game makes
	const solo = (game, runner, b) => { const [w, l] = soloLabels(game, runner, b || {}); return { outcomes: [{ k: 'win', label: w }, { k: 'lose', label: l }], players: [runner], friendsOf: [runner] }; };
	const winOf = (m) => m.win || BET.WINDOW_MS;
	/** The markets `runner`'s current `game` makes, as the state row and the match rows say: [{id, ...the market's fixed part}] */
	async function specsOf(game, runner) {
		if (!gameOk(game) || !NAME_RE.test(runner)) return [];
		const st = await store.get(stateKey(game) + runner), b = st && st.bet;
		if (!b || !RUN_RE.test(String(b.run || ''))) return [];
		if (game === 'micatro' && b.pvp) {   // a Micatro Multiplayer match: the referee's row
			const lb = await store.get('mtpvp:' + b.pvp), m = lb && lb.m;
			if (!m || !Array.isArray(m.players) || !m.players.includes(runner)) return [];
			return [{ id: `m:${b.pvp}:${m.n | 0}`, kind: 'pvp', game, at: m.at || b.since, mark: MARK.micatro, outcomes: m.players.map(n => ({ k: n, label: n + ' wins' })), players: m.players.slice(), friendsOf: m.players.slice(), tour: null, src: { t: 'mtpvp', id: b.pvp, n: m.n | 0 } }];
		}
		if (game === 'pocket' && b.pk) {     // a Pocket Enhanced online match: the server's own match row
			const lb = await store.get('pkpvp:' + b.pk), m = lb && lb.m;
			if (!m || !m.config || !lb.players.some(p => p.name === runner)) return [];
			const humans = m.config.players.filter(p => !p.ai).map(p => p.name);
			const out = [{ id: `p:${b.pk}:${Math.floor(+m.startAt || 0)}`, kind: 'pvp', game, at: m.startAt || b.since, mark: MARK.pocket, outcomes: m.config.players.map(p => ({ k: p.name, label: p.name + ' wins' })), players: humans, friendsOf: humans, tour: lb.tid || null, src: { t: 'pkpvp', id: b.pk, mid: Math.floor(+m.startAt || 0) } }];
			if (lb.tid && LOBBY_RE.test(lb.tid)) {
				const t = await store.get('pktour:' + lb.tid);
				if (t && t.state !== 'lobby') {
					const names = t.players.map(p => p.name), seats = [...names, ...(t.cpus || [])];
					out.push({ id: 't:' + t.id, kind: 'tour', game, at: t.startAt || t.ts || now, mark: 0, outcomes: seats.map(n => ({ k: n, label: n + ' wins the tournament' })), players: names, friendsOf: names, tour: null, src: { t: 'pktour', id: t.id } });
				}
			}
			return out;
		}
		if (game === 'cards' && b.cm) {      // a Battlecards live duel / free-for-all: the match row (the host's engine, or the server's abandonment call)
			const cm = await store.get('cardmatch:' + b.cm);
			if (!cm) return [];
			const seats = cardSeats(cm), humans = seats.filter(s => s.name && !s.ai).map(s => s.name);
			if (!humans.includes(runner)) return [];
			return [{ id: 'c:' + b.cm, kind: 'pvp', game, at: +cm.createdAt || b.since, mark: MARK.cards, outcomes: seats.map(s => ({ k: seatKey(s), label: (s.name || s.aiName || 'AI ' + (s.seat + 1)) + ' wins' })), players: humans, friendsOf: humans, tour: null, src: { t: 'cm', id: b.cm } }];
		}
		if (game === 'cards' && b.am) {      // a Battlecards mail duel: the match row the server keeps (amatch:)
			const am = await store.get('amatch:' + b.am);
			if (!am || !Array.isArray(am.players) || !am.players.includes(runner) || am.status === 'invited') return [];
			return [{ id: 'a:' + b.am, kind: 'pvp', game, at: +am.createdAt || b.since, win: MAIL_WIN_MS, mark: MAIL_MARK, outcomes: am.players.map(n => ({ k: n, label: n + ' wins' })), players: am.players.slice(), friendsOf: am.players.slice(), tour: null, src: { t: 'am', id: b.am } }];
		}
		if (game === 'micasurvivor') {       // a party's run is ONE market, on its host's run: every member is a player, a friend of any may bet
			const host = st.via || b.host || '';
			if (host && host !== runner) {
				if (!NAME_RE.test(host)) return [];
				const hs = await store.get(stateKey(game) + host), hb = hs && hs.bet;
				if (!hb || !RUN_RE.test(String(hb.run || '')) || !Array.isArray(hs.group) || !hs.group.includes(runner) || !(st.group || []).includes(host)) return [];
				return specsOf(game, host);
			}
			const party = Array.isArray(st.group) && st.group.length > 1 ? st.group.filter(n => NAME_RE.test(n)) : [runner];
			if (!party.includes(runner)) party.unshift(runner);
			return [{ id: `s:${game}:${runner}:${b.run}`, kind: 'solo', game, at: b.since || now, win: WIN_MS.micasurvivor, mark: MARK[game], ...solo(game, runner, b), players: party, friendsOf: party, tour: null, src: { t: 'solo', game, runner, run: b.run } }];
		}
		const cardRun = game === 'cards' && CARD_RUNS.includes(b.md);
		return [{ id: `s:${game}:${runner}:${b.run}`, kind: 'solo', game, at: b.since || now, mark: cardRun ? CARD_RUN_MARK : MARK[game], ...(cardRun ? { stale: CARD_RUN_STALE_MS } : {}), ...solo(game, runner, b), tour: null, src: { t: 'solo', game, runner, run: b.run } }];
	}
	/** A Battlecards match's seats (the N-player shape, or an older / rematch 1v1's host and guest). */
	const cardSeats = cm => (Array.isArray(cm.seats) && cm.seats.length ? cm.seats : [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])]);
	const seatKey = s => (s.name && !s.ai ? s.name : 'ai' + (s.seat | 0));

	/** May `user` (their account: friends) bet on market m? -> null, or why not. */
	async function refusal(m, user, acct) {
		if (m.players.includes(user)) return m.kind === 'solo' ? 'you cannot bet on your own game' : 'you are playing in this ' + (m.kind === 'tour' ? 'tournament' : 'match') + ': no betting on it';
		const friends = (acct && Array.isArray(acct.friends)) ? acct.friends : [];
		if (m.friendsOf.some(n => friends.includes(n))) return null;
		if (m.tour) { const t = await store.get('pktour:' + m.tour); if (t && !t.closed && t.players.some(p => p.name === user)) return null; }   // (a player of the tournament, watching another match of it)
		return 'only friends can bet on this game';
	}

	/** Is betting on m open right now? -> null (open), or why it closed. Reads the game's rows. */
	async function closedWhy(m) {
		if (m.end) return 'settled';
		if (m.closed) return m.closed.why || 'closed';
		if (now >= m.at + winOf(m)) return 'the betting window has passed';
		const s = m.src;
		if (s.t === 'solo') {
			const st = await store.get(stateKey(s.game) + s.runner), b = st && st.bet;
			if (!b || b.run !== s.run) return 'that run is over';
			if ((st.over && !RES_ONLY.has(s.game)) || b.res) return 'the run is over';
			if (b.prog >= m.mark) return 'the game is past its opening';
			return null;
		}
		if (s.t === 'cm') {   // (turn 3 as either human's page reports it)
			const r = await resultOf(m); if (r) return 'the match is over';
			for (const n of m.players) {
				const st = await store.get(stateKey(m.game) + n), b = st && st.bet;
				if (b && b.cm === s.id && b.prog >= m.mark) return 'the match is past its opening';
			}
			return null;
		}
		if (s.t === 'am') {   // (the server's own move count)
			const am = await store.get('amatch:' + s.id);
			if (!am || am.status === 'over') return 'the match is over';
			if ((am.turnNumber | 0) >= m.mark) return 'the match is past its opening';
			return null;
		}
		if (s.t === 'mtpvp' || s.t === 'pkpvp') {
			const r = await resultOf(m); if (r) return 'the match is over';
			for (const n of m.players) {
				const st = await store.get(stateKey(m.game) + n), b = st && st.bet;
				if (b && (b.pvp === s.id || b.pk === s.id) && b.prog >= m.mark) return 'the match is past its opening';
			}
			return null;
		}
		if (s.t === 'pktour') {
			const t = await store.get('pktour:' + s.id);
			if (!t || t.closed || t.state !== 'running') return 'the tournament is over';
			const human = n => t.players.some(p => p.name === n);
			if (t.rounds.length > 1 || (t.rounds[0] || []).some(g => g.winner && (human(g.a) || human(g.b)))) return 'the tournament is under way';
			return null;
		}
		return 'closed';
	}

	/** The result, once there is one: {result: outcome | null (everyone refunded), why} | null (still being played). */
	async function resultOf(m) {
		const s = m.src, quiet = (ts, ms = BET.STALE_MS) => now - (+ts || 0) > ms;
		if (s.t === 'solo') {
			const st = await store.get(stateKey(s.game) + s.runner), b = st && st.bet;
			if (!st || !b) return quiet(m.ts || m.at) ? { result: null, why: 'the game stopped' } : null;
			if (b.run !== s.run) return { result: null, why: 'the run was left' };
			if (b.res) return b.res === 'draw' ? { result: null, why: 'a draw' } : { result: b.res, why: 'reported' };
			if (st.over && !RES_ONLY.has(s.game)) return { result: st.won ? 'win' : 'lose', why: 'reported' };
			return quiet(st.ts, m.stale || BET.STALE_MS) ? { result: null, why: 'the game stopped' } : null;
		}
		if (s.t === 'cm') {
			const cm = await store.get('cardmatch:' + s.id);
			if (!cm) return { result: null, why: 'the match was closed' };
			if (cm.over) {
				const seat = cm.winner == null ? null : cardSeats(cm).find(x => (x.seat | 0) === +cm.winner);
				return seat ? { result: seatKey(seat), why: cm.abandoned ? 'the server (a player left)' : 'the match' } : { result: null, why: 'no winner' };
			}
			const live = await store.get('cardmatchstate:' + s.id);
			return quiet(live ? live.ts : cm.createdAt) ? { result: null, why: 'the match stopped' } : null;
		}
		if (s.t === 'am') {
			const am = await store.get('amatch:' + s.id);
			if (!am) return { result: null, why: 'the match was closed' };
			if (am.status === 'over') return am.winner && am.players.includes(am.winner) ? { result: am.winner, why: 'the match' } : { result: null, why: 'no winner' };
			return quiet(am.updatedAt, MAIL_STALE_MS) ? { result: null, why: 'the match stopped' } : null;
		}
		if (s.t === 'mtpvp') {
			const lb = await store.get('mtpvp:' + s.id), mm = lb && lb.m;
			if (!mm || (mm.n | 0) !== s.n) return { result: null, why: 'the match was left' };
			if (mm.over) return mm.over.draw || !mm.over.winner ? { result: null, why: 'a draw' } : { result: mm.over.winner, why: 'the referee' };
			return quiet(lb.ts) ? { result: null, why: 'the match stopped' } : null;
		}
		if (s.t === 'pkpvp') {
			const lb = await store.get('pkpvp:' + s.id), mm = lb && lb.m;
			if (!mm || Math.floor(+mm.startAt || 0) !== s.mid) return { result: null, why: 'the match was left' };
			if (mm.over) { const w = mm.over.winner, p = w != null && mm.config.players[w]; return p ? { result: p.name, why: 'the server' } : { result: null, why: 'no winner' }; }
			if (lb.closed) return { result: null, why: 'the match was closed' };
			return quiet(lb.ts) ? { result: null, why: 'the match stopped' } : null;
		}
		if (s.t === 'pktour') {
			const t = await store.get('pktour:' + s.id);
			if (!t || t.closed) return { result: null, why: 'the tournament was closed' };
			if (t.state === 'over') { const w = Object.keys(t.placed || {}).find(n => t.placed[n] === 1); return w ? { result: w, why: 'the tournament' } : { result: null, why: 'no winner' }; }
			return quiet(t.ts, BET.TOUR_STALE_MS) ? { result: null, why: 'the tournament stopped' } : null;
		}
		return null;
	}

	/** Fix the result on the market (once), then pay everyone it owes (each wallet once). -> the market as it now is. */
	async function settle(mid, result, why) {
		const fixed = await mutate(MKEY(mid), m => {
			if (m.end) return false;
			const { pay, refund } = payouts(m.stakes, result);
			m.end = { result: refund ? null : result, outcome: result, why: refund && result != null ? 'nobody backed the winner' : why, at: now };
			m.closed = m.closed || { at: now, why: 'the game ended' };
			m.pay = pay; m.paid = m.paid || {};
			return true;
		});
		return fixed.row ? payOut(fixed.row) : null;
	}
	async function payOut(m) {
		if (!m || !m.end) return m;
		const due = Object.keys(m.pay || {}).filter(u => !(m.paid || {})[u]);
		if (!due.length) return m;
		const done = [];
		for (const u of due) { const r = await credit(u, m.id, m.pay[u]); if (r.ok) done.push(u); }
		if (!done.length) return m;
		const r = await mutate(MKEY(m.id), row => { let ch = false; row.paid = row.paid || {}; for (const u of done) if (!row.paid[u]) { row.paid[u] = 1; ch = true; } return ch; });
		return r.row || m;
	}
	/** Look at a market: settle it if its game has a result, finish paying it if it has. -> the market */
	async function check(m) {
		if (!m) return m;
		if (m.end) return payOut(m);
		const r = await resultOf(m);
		return r ? (await settle(m.id, r.result, r.why)) || m : m;
	}

	/** What a client is shown of a market (for `user`). */
	async function view(m, user, acct, why) {
		const stakes = m.stakes || {}, side = {};
		for (const s of Object.values(stakes)) side[s.o] = (side[s.o] || 0) + s.stars;
		const mine = stakes[user] ? { o: stakes[user].o, n: stakes[user].stars } : null;
		const closed = why === undefined ? await closedWhy(m) : why;
		const no = user ? await refusal(m, user, acct) : 'sign in';
		return {
			id: m.id, kind: m.kind, game: m.game, players: m.players,
			outcomes: m.outcomes.map(o => ({ k: o.k, label: o.label, pool: side[o.k] || 0 })),
			pool: m.pool || 0, bettors: Object.keys(stakes).length,
			open: !closed, why: closed || null, closesAt: m.at + winOf(m), now,
			mine, can: !no, cant: no,
			end: m.end ? { result: m.end.result, outcome: m.end.outcome, why: m.end.why, pay: (m.pay || {})[user] || 0, refund: m.end.result == null } : null,
		};
	}

	/** Note the market in the bettor's index (their payouts reach them through it). */
	async function remember(user, mid) {
		for (let i = 0; i < 6; i++) {
			const cur = await store.get('betmine:' + user), rev = cur ? cur.rev | 0 : 0, list = cur && Array.isArray(cur.list) ? cur.list : [];
			if (list.includes(mid)) return;
			if (await store.setIfRev('betmine:' + user, { rev: rev + 1, list: [...list, mid].slice(-BET.MINE_MAX), at: now }, rev)) return;
		}
	}

	/** Step 2 of a placement: the stake into the market (or back to the wallet if the market closed). -> {ok, m} | {why, refunded} */
	async function land(user, mid, bid, o, n) {
		for (let i = 0; i < 8; i++) {
			const m = await store.get(MKEY(mid));
			if (!m) { await unstake(user, bid); return { why: 'no such market', refunded: true }; }
			const st = m.stakes && m.stakes[user];
			if (st && (st.ids || []).includes(bid)) { await unnote(user, bid); return { ok: true, m }; }
			const why = (st && st.o !== o) ? 'you backed ' + labelOf(m, st.o) + ': you can raise that bet, not move it' : await closedWhy(m);
			if (why) {
				// closed: written on the market FIRST, so this stake can never land after its refund
				if (!st || st.o === o) { const c = await mutate(MKEY(mid), row => { if (row.closed || row.end) return false; row.closed = { at: now, why }; return true; }); if (c.busy) return { why: 'busy: try again' }; }
				await unstake(user, bid);
				return { why, refunded: true };
			}
			// (only a stake the wallet still holds for this bid: one already given back must never land as well)
			const q = await store.get('stars:' + user);
			if (!(q && q.bq && q.bq[bid])) return { why: 'that bet was given back', refunded: true };
			const stakes = { ...(m.stakes || {}) };
			stakes[user] = { o, stars: (st ? st.stars : 0) + n, ids: [...((st && st.ids) || []), bid].slice(-BET.IDS_MAX), at: now };
			const next = { ...m, stakes, pool: (m.pool || 0) + n, rev: (m.rev || 0) + 1 };
			if (await store.setIfRev(MKEY(mid), next, m.rev || 0)) { await unnote(user, bid); return { ok: true, m: next }; }
		}
		return { why: 'busy: try again' };
	}
	const labelOf = (m, k) => { const o = m.outcomes.find(x => x.k === k); return o ? '"' + o.label + '"' : k; };

	return {
		cleanReport,
		/** The publish of `user`'s game: settles its market when the game reports its result. -> {riding, bettors} | null */
		async onPublish(game, user, rep, over, won) {
			if (!rep || !gameOk(game)) return null;
			const cur = await store.get('betcur:' + game + ':' + user);
			if (!cur || !marketIdOk(cur.id)) return null;
			let m = await store.get(MKEY(cur.id));
			if (!m) return null;
			const s = m.src;
			// (a MicaSurvivor party's guest: the market is its host's run; the guest sees it riding, and never settles it)
			const guest = s.t === 'solo' && s.runner !== user && m.players.includes(user);
			const mine = s.t === 'solo' ? s.run === rep.run || guest : [rep.pvp, rep.pk, rep.cm, rep.am].includes(s.id);
			if (!mine) { await check(m); return null; }   // (an older game's market: its result or its refunds)
			if (!m.end && s.t === 'solo' && !guest && (rep.res || over)) m = (await settle(m.id, rep.res === 'draw' ? null : rep.res || (won ? 'win' : 'lose'), rep.res === 'draw' ? 'a draw' : 'reported')) || m;
			else if (!m.end && (over || s.t !== 'solo' || guest)) m = await check(m);
			return { riding: m.pool || 0, bettors: Object.keys(m.stakes || {}).length, ...(m.end ? { settled: true } : {}) };
		},

		/** bet-get {game, runner}: the market(s) of runner's game, made now if someone who may bet looks inside the window. */
		async get(user, acct, game, runner) {
			runner = String(runner || '').toLowerCase();
			if (!gameOk(game) || !NAME_RE.test(runner)) return { error: 'which game?', status: 400 };
			const specs = await specsOf(game, runner), out = [];
			for (const spec of specs) {
				let m = await store.get(MKEY(spec.id));
				if (!m) {
					const draft = { ...spec, rev: 1, ts: now, pool: 0, stakes: {}, closed: null, end: null };
					if (await refusal(draft, user, acct)) continue;   // (only someone who may bet opens a market)
					if (await closedWhy(draft)) continue;              // (past its window: no market, nothing to show)
					if (!(await store.setIfRev(MKEY(spec.id), draft, 0))) { m = await store.get(MKEY(spec.id)); if (!m) continue; }
					else {
						m = draft;
						if (spec.kind !== 'tour') for (const p of spec.players) await store.setJSON('betcur:' + game + ':' + p, { id: spec.id, at: now });
					}
				}
				m = await check(m);
				const why = await closedWhy(m);
				// (seen closed: written down, so a later stake can't land on it whatever its own clock says)
				if (why && !m.closed && !m.end) { const c = await mutate(MKEY(m.id), row => { if (row.closed || row.end) return false; row.closed = { at: now, why }; return true; }); if (c.row) m = c.row; }
				out.push(await view(m, user, acct, why));
			}
			return { markets: out };
		},

		/** bet-place {id, o, n, bid}: back an outcome with n stars (or raise your bet). */
		async place(user, acct, body) {
			const mid = String(body.id || ''), o = String(body.o ?? ''), bid = String(body.bid || ''), n = Number(body.n);
			if (!marketIdOk(mid)) return { error: 'which market?', status: 400 };
			if (!BID_RE.test(bid)) return { error: 'bad bet id', status: 400 };
			if (!Number.isSafeInteger(n) || n < 1) return { error: 'bet a whole number of stars, 1 or more', status: 400 };
			const m = await store.get(MKEY(mid));
			if (!m) return { error: 'no such market', status: 404 };
			const done = m.stakes && m.stakes[user] && (m.stakes[user].ids || []).includes(bid);
			if (!done) {
				if (!m.outcomes.some(x => x.k === o)) return { error: 'no such outcome', status: 400 };
				const no = await refusal(m, user, acct);
				if (no) return { error: no, status: 403 };
				const st = m.stakes && m.stakes[user];
				if (st && st.o !== o) return { error: 'you backed ' + labelOf(m, st.o) + ': you can raise that bet, not move it', status: 409 };
				const why = await closedWhy(m);
				if (why) return { error: 'betting has closed: ' + why, closed: true, status: 409 };
				// 1. the stars leave the wallet (once for this bid)
				const took = await walletDo(user, (w, bq) => {
					if (bq[bid]) return 'done';
					if (W.balance(w) < n) return 'you have ' + W.balance(w) + ' stars';
					w.s[BET.DEVICE] = (w.s[BET.DEVICE] || 0) + n; bq[bid] = { m: mid, n, o, at: now }; return true;
				});
				if (!took.ok) return { error: took.why, status: 409 };
				await remember(user, mid);
			}
			// 2 + 3. into the market, or back to the wallet
			const q = await store.get('stars:' + user), pend = q && q.bq && q.bq[bid];
			const r = done ? { ok: true, m } : await land(user, mid, bid, o, pend ? pend.n : n);
			const wallet = W.cleanWallet(await store.get('stars:' + user));
			if (!r.ok) return { error: r.why, refunded: !!r.refunded, wallet, status: 409 };
			return { ok: true, market: await view(r.m, user, acct), wallet };
		},

		/** A bettor's look (bet-mine, and every star sync): finish stakes left half way, settle and pay what is due. */
		async mine(user) {
			const q = await store.get('stars:' + user);
			for (const [bid, e] of Object.entries((q && q.bq) || {})) if (e && marketIdOk(e.m) && now - (+e.at || 0) > BET.PEND_MS) await land(user, e.m, bid, e.o, e.n);
			const cur = await store.get('betmine:' + user);
			if (!cur || !Array.isArray(cur.list) || !cur.list.length) return { settled: [] };
			const keep = [], settled = [];
			for (const mid of cur.list) {
				let m = marketIdOk(mid) ? await store.get(MKEY(mid)) : null;
				if (!m) continue;
				m = await check(m);
				if (m.end && (!(m.pay || {})[user] || (m.paid || {})[user])) { settled.push({ id: mid, pay: (m.pay || {})[user] || 0, result: m.end.result }); continue; }
				keep.push(mid);
			}
			if (keep.length !== cur.list.length) {
				for (let i = 0; i < 4; i++) {
					const c = await store.get('betmine:' + user); if (!c) break;
					const list = (c.list || []).filter(x => keep.includes(x) || !cur.list.includes(x));
					if (await store.setIfRev('betmine:' + user, { rev: (c.rev | 0) + 1, list, at: now }, c.rev | 0)) break;
				}
			}
			return { settled };
		},
		// (for the tests and the tournament hook)
		check: async (mid) => check(await store.get(MKEY(mid))),
		payouts,
	};
}
