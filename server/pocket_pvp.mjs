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
//
// The clock (D1 has none: whoever polls evaluates it). `seen[name]` is rewritten at most every PK.SEEN_MS. A waiting
// lobby closes when its host goes quiet (PK.LOBBY_IDLE_MS); a guest who goes quiet is dropped (PK.GUEST_IDLE_MS). In a
// match a player quiet for PK.GRACE_MS concedes; a player who is there but has not acted for PK.TURN_MS has the move
// made for them (the computer player's choice for a setup or a forced choice, otherwise Execute with both passing).
import * as E from '../pocketenhanced/js/engine/engine.js';
import { nextAction } from '../pocketenhanced/js/ai.js';
import { STARTERS, starterDeck } from '../pocketenhanced/js/decks.js';

export const PKPVP_PROTOCOL = 18;   // 6: Celestial Guardians; 5: Shining Revelry; 4: Triumphant Light; 3: Space-Time Smackdown; 2: Mythical Island (a page without its cards must reload before it joins a match that may hold them)
export const PK = { SEEN_MS: 8_000, LOBBY_IDLE_MS: 10 * 60_000, GUEST_IDLE_MS: 90_000, GRACE_MS: 120_000, TURN_MS: 180_000, MAX_ACTIONS: 3000, MAX_ACTION_CHARS: 1500, CLOSED_KEEP_MS: 6 * 3600_000 };
const ID_RE = /^[0-9a-f]{12}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const BOT_NAMES = ['Blue', 'Green', 'Silver'];
const ACTIONS = new Set(['setup', 'playBasic', 'evolve', 'attach', 'retreat', 'promote', 'discardFossil', 'trainer', 'ability', 'execute', 'choose', 'concede']);

/** Whose move the match is waiting on (a seat), or null. In setup: any seat that has not set up. */
function waitingOn(S) {
	if (S.over) return [];
	if (S.pending) return [S.pending.seat];
	if (S.phase === 'setup') return S.players.filter(p => !p.setup && !p.eliminated).map(p => p.seat);
	return [S.current];
}
/** The computer player's move for a seat (also the move made for a player who ran out of time). Always legal. */
function autoAction(S, m, seat, passOnly) {
	const banned = new Set();
	for (let t = 0; t < 40; t++) {
		let a = nextAction(E.view(S, seat), banned);
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
	const deckOf = b => {
		const deck = Array.isArray(b.deck) ? b.deck.map(String).slice(0, 40) : null, energy = Array.isArray(b.energy) ? b.energy.map(String).slice(0, 6) : null;
		if (!deck || !energy) return { error: 'choose a deck' };
		let err; try { err = E.deckError(deck, energy); } catch (e) { err = 'that deck cannot be read'; }
		return err ? { error: 'your deck is not legal: ' + err } : { deck, energy };
	};
	const lobbyView = lb => ({
		id: lb.id, code: lb.code, host: lb.host, size: lb.size, bots: lb.bots, started: !!lb.m, over: !!(lb.m && lb.m.over),
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
		for (let guard = 0; guard < 400 && !S.over && m.actions.length < PK.MAX_ACTIONS; guard++) {
			const seats = waitingOn(S);
			const bot = seats.find(s => S.players[s].ai);
			if (bot != null) { S = autoAction(S, m, bot, false); m.at = now; continue; }
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

	if (body.pv !== PKPVP_PROTOCOL || body.ev !== E.ENGINE_VERSION) return json({ error: 'your game is out of date: reload', pv: PKPVP_PROTOCOL, ev: E.ENGINE_VERSION }, 409);

	if (action === 'pkpvp-create') {
		const d = deckOf(body); if (d.error) return json({ error: d.error }, 400);
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
			const lb = { id: nid, code, rev: 1, at: now, ts: now, host: username, size, bots, players: [{ name: username, deck: d.deck, energy: d.energy, ready: true }], seen: { [username]: now }, m: null };
			if (!(await store.setIfRev(LKEY(nid), lb, 0))) continue;
			await store.setJSON(UKEY(username), { id: nid, at: now });
			return json({ lobby: lobbyView(lb) });
		}
		return json({ error: 'busy, try again' }, 503);
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
		const d = deckOf(body); if (d.error) return json({ error: d.error }, 400);
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
				lb.players.push({ name: username, deck: d.deck, energy: d.energy, ready: false });
			}
			lb.seen[username] = now;
			await store.setJSON(UKEY(username), { id: lid, at: now });
			return { lobby: lobbyView(lb) };
		});
	}
	if (!ID_RE.test(id)) return json({ error: 'bad match id' }, 400);

	if (action === 'pkpvp-update') {
		return mutate(id, async lb => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			const me = lb.players.find(p => p.name === username);
			if (body.deck != null) { const d = deckOf(body); if (d.error) return fail(d.error); me.deck = d.deck; me.energy = d.energy; }
			if (typeof body.ready === 'boolean') me.ready = body.ready;
			if (lb.host === username) {
				if ([2, 3, 4].includes(body.size)) lb.size = Math.max(body.size, lb.players.length);
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
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			if (lb.players.length + lb.bots < 2) return fail('a match needs at least two players');
			if (lb.players.some(p => p.name !== lb.host && !p.ready)) return fail('not everyone is ready');
			const pick = () => STARTERS[Math.floor(ctx.rnd() * STARTERS.length)].id;
			const players = [...lb.players.map(p => ({ name: p.name, ai: false, deck: p.deck.slice(), energy: p.energy.slice() })), ...Array.from({ length: lb.bots }, (_, i) => ({ name: BOT_NAMES[i], ai: true, ...starterDeck(pick()) }))];
			const config = { seed: ctx.randomHex(8), players, rules: E.RULES };
			let S; try { S = E.createGame(config); } catch (e) { if (e && e.refused) return fail(e.message); throw e; }
			lb.m = { config, actions: [], at: now, startAt: now, over: null, left: {}, auto: {} };
			for (const p of lb.players) { lb.seen[p.name] = Math.max(lb.seen[p.name] || 0, now - PK.GRACE_MS / 2); if (p.name !== lb.host) p.ready = false; }
			lb.seen[username] = now;
			S = advance(lb, S);
			return { lobby: lobbyView(lb), match: matchView(lb, S, -1) };
		});
	}
	if (action === 'pkpvp-sync') {
		return mutate(id, async lb => {
			if (!member(lb, username)) return fail('you are not in that match', 403, { closed: true });
			touch(lb);
			if (closeIfIdle(lb)) return { lobby: null, closed: true };
			if (!lb.m) return { lobby: lobbyView(lb) };
			let S = E.replay(lb.m.config, lb.m.actions);
			if (!lb.m.over) S = advance(lb, S);
			return { lobby: lobbyView(lb), match: matchView(lb, S, Number.isInteger(body.n) ? body.n : -1) };
		});
	}
	if (action === 'pkpvp-act') {
		const a = body.a;
		if (!a || typeof a !== 'object' || !ACTIONS.has(a.t) || JSON.stringify(a).length > PK.MAX_ACTION_CHARS) return json({ error: 'not an action' }, 400);
		return mutate(id, async lb => {
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
		});
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
		await store.setJSON(UKEY(username), { id: '', at: now });
		return res;
	}
	return json({ error: 'unknown action' }, 400);
}
