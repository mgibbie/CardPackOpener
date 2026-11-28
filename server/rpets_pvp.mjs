// RAINBOW PETS ONLINE — 2 to 4 players (server/mp.mjs routes every `rpvp-*` action here).
//
// The SERVER plays the match (as Pocket Enhanced's does): it holds the recipe (the setup and every action), rebuilds the
// match with the game's own engine (rainbowpets/js/rules.js), applies a player's action only if the engine accepts it for
// THAT player's seat, plays the computer seats itself (rainbowpets/js/ai.js), and sends each player view(match, seat):
// their own hand, nobody else's, no deck. A Newspaper's question goes to whoever the engine asks, and to nobody else.
// When the match is over the whole recipe is sent, as its replay.
//
// Rows (every write an exact key; the lobby row is a compare-and-set on `rev`, retried):
//   rpvp:<id>        { id, code, rev, at, ts, host, size, cpus, level, opts, tag?, split?, players: [{ name, team: [pet id], ready }],
//                      seen: { name: ms }, closed?, m: null | { setup, actions: [[seat, action]], at, startAt, over, left: {} } }
//   rpvpcode:<CODE>  { rev, id, at }   a 5-letter join code -> the lobby
//   rpvpcur:<user>   { id, at }        the lobby a player is in (rejoin after a reload)
// All three are swept 12 hours after their last write (GC_TABLE in mp.mjs).
// The clock (D1 has none: whoever polls evaluates it): a player who must act and has not for RP.TURN_MS has the
// least move made for them (pass; let a throw land); a player quiet for RP.GRACE_MS concedes.
// TAG-TEAM (lobby.tag, 4 seats): seats 1 + 2 play seats 3 + 4. lobby.split says where the friends sit: 'together' (in
// join order, the computers after them) or 'apart' (the friends shared out between the teams, the computers filling in).
/** Tag-Team seating: the lobby's people (join order) and its computer seats -> 4 seats, slot 0 + 1 one team, 2 + 3 the other. */
export function tagSeats(humans, cpus, split) {
	const order = split === 'apart' ? [0, 2, 1, 3] : [0, 1, 2, 3], out = [null, null, null, null];
	humans.forEach((h, i) => { out[order[i]] = h; });
	let k = 0; for (let i = 0; i < 4; i++) if (!out[i] && k < cpus.length) out[i] = cpus[k++];
	return out.filter(Boolean);
}
import * as R from '../rainbowpets/js/rules.js';
import { choose } from '../rainbowpets/js/ai.js';

export const RPVP_PROTOCOL = 1;
export const RP = Object.freeze({ SEEN_MS: 8_000, LOBBY_IDLE_MS: 10 * 60_000, GUEST_IDLE_MS: 90_000, GRACE_MS: 120_000, TURN_MS: 120_000,
	MAX_ACTIONS: 3000, MAX_CPU_ACTS: 16 });
const ID_RE = /^[0-9a-f]{12}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RP_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
export const CPU_NAMES = Object.freeze(['CPU Pip', 'CPU Wren', 'CPU Ivy']);
const KINDS = new Set(['paint', 'move', 'throw', 'extra', 'heal', 'pass', 'let', 'paper', 'concede']);

/** A team a player sends: 3 to 5 Pets of the 42, none twice. -> the team, or null. */
export function cleanTeam(t) {
	if (!Array.isArray(t)) return null;
	const team = t.map(String).slice(0, R.TEAM_MAX);
	return team.length >= R.TEAM_MIN && new Set(team).size === team.length && team.every((id) => R.petById(id)) ? team : null;
}
/** An action a player sends, kept to the fields the engine reads (and their types). */
export function cleanAction(a) {
	if (!a || typeof a !== 'object' || !KINDS.has(a.t)) return null;
	const s = (v) => (typeof v === 'string' && v.length <= 8 ? v : undefined), i = (v) => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : undefined);
	const out = { t: a.t };
	for (const k of ['pet', 'card', 'from', 'to']) if (a[k] !== undefined) out[k] = s(a[k]);
	for (const k of ['slot', 'toSlot', 'spot']) if (a[k] !== undefined) out[k] = i(a[k]);
	return out;
}

export async function handleRpvp(ctx) {
	const { action, body, store, username, json, now } = ctx;
	if (!username) return json({ error: 'sign in to play online' }, 401);
	if (body.pv !== RPVP_PROTOCOL) return json({ error: 'your game is out of date: reload', pv: RPVP_PROTOCOL }, 409);
	const LKEY = (id) => 'rpvp:' + id, CKEY = (c) => 'rpvpcode:' + c, UKEY = (u) => 'rpvpcur:' + u;
	const id = String(body.id || '');
	const member = (lb, who) => !!lb && lb.players.some((p) => p.name === who);
	const lobbyView = (lb) => ({ id: lb.id, code: lb.code, host: lb.host, size: lb.size, cpus: lb.cpus, level: lb.level, opts: { ...lb.opts }, tag: !!lb.tag, split: lb.split === 'apart' ? 'apart' : 'together', started: !!lb.m, over: !!(lb.m && lb.m.over),
		players: lb.players.map((p) => ({ name: p.name, ready: !!p.ready || p.name === lb.host, team: p.team.length, away: now - ((lb.seen || {})[p.name] || 0) > 20_000 })) });
	const seatOf = (m, who) => { const i = m.setup.seats.findIndex((s) => !s.cpu && s.name === who); return i >= 0 ? R.SEATS[i] : null; };
	/** The clock and the computer seats, on the rebuilt match. -> the match (m.actions grows). */
	const advance = (lb, S) => {
		const m = lb.m, push = (seat, a) => { if (!R.act(S, seat, a)) { m.actions.push([seat, a]); return true; } return false; };
		for (const p of S.players) {   // a player who stopped polling, or left, concedes
			if (S.over || p.cpu || p.out) continue;
			if ((m.left && m.left[p.name]) || now - ((lb.seen || {})[p.name] || m.startAt) > RP.GRACE_MS) { push(p.seat, { t: 'concede' }); m.at = now; }
		}
		for (let k = 0, cpu = 0; k < 200 && !S.over && m.actions.length < RP.MAX_ACTIONS; k++) {
			const seat = R.toAct(S); if (!seat) break;
			const P = R.playerOf(S, seat);
			if (P.cpu) {
				if (cpu++ >= RP.MAX_CPU_ACTS) break;   // (the rest on the next request: none runs long)
				const a = choose(S, seat, P.cpu);
				if (!a || !push(seat, a)) push(seat, S.pending ? { t: 'let' } : { t: 'pass' });
				m.at = now; continue;
			}
			if (now - m.at > RP.TURN_MS) { push(seat, S.pending ? { t: 'let' } : { t: 'pass' }); m.at = now; continue; }   // out of time
			break;
		}
		if (!S.over && m.actions.length >= RP.MAX_ACTIONS) m.over = { winner: null, how: 'too long' };
		else if (S.over && !m.over) { const w = S.over.winner ? R.playerOf(S, S.over.winner) : null; m.over = { winner: S.over.winner, name: w ? w.name : null, how: S.over.how, ...(S.over.winners ? { winners: S.over.winners.slice(), names: S.over.winners.map((s) => R.playerOf(S, s).name) } : {}) }; }
		return S;
	};
	const matchView = (lb, S, sinceN) => {
		const m = lb.m, n = m.actions.length, seat = seatOf(m, username);
		const out = { mid: m.startAt, n, over: m.over || null, seat, deadline: m.over ? 0 : m.at + RP.TURN_MS };
		if (sinceN !== n) out.view = R.view(S, seat);
		if (m.over) out.recipe = { setup: m.setup, actions: m.actions };
		return out;
	};
	const mutate = async (lid, fn) => {
		for (let i = 0; i < 5; i++) {
			const lb = await store.get(LKEY(lid));
			if (!lb || lb.closed) return json({ error: 'that match is closed', closed: true }, 404);
			const before = JSON.stringify(lb);
			lb.seen = lb.seen || {};
			const res = await fn(lb);
			if (res && res.status) return json(res.body, res.status);
			if (JSON.stringify(lb) === before) return json(res);
			const rev = lb.rev || 0; lb.rev = rev + 1; lb.ts = now;
			if (await store.setIfRev(LKEY(lid), lb, rev)) return json(res);
		}
		return json({ error: 'busy, try again' }, 503);
	};
	const fail = (error, status = 400, extra = {}) => ({ status, body: { error, ...extra } });
	const touch = (lb) => { if (member(lb, username) && now - (lb.seen[username] || 0) > RP.SEEN_MS) lb.seen[username] = now; };
	const leaveOld = async () => {
		const cur = await store.get(UKEY(username));
		if (!cur || !ID_RE.test(String(cur.id))) return null;
		const old = await store.get(LKEY(cur.id));
		if (!old || old.closed || !member(old, username)) return null;
		if (old.m && !old.m.over) return old;   // a live match: finish or leave it first
		const rev = old.rev || 0;
		if (old.host === username) old.closed = true; else old.players = old.players.filter((p) => p.name !== username);
		old.rev = rev + 1; old.ts = now;
		await store.setIfRev(LKEY(old.id), old, rev);
		return null;
	};
	const optsOf = (o) => { const out = {}; for (const k of R.OPTION_KEYS) if (o && o[k] === true) out[k] = true; return out; };

	if (action === 'rpvp-create') {
		const team = cleanTeam(body.team); if (!team) return json({ error: `pick ${R.TEAM_MIN} to ${R.TEAM_MAX} Pets` }, 400);
		const tag = body.tag === true, size = tag ? 4 : [2, 3, 4].includes(body.size) ? body.size : 2, cpus = Math.max(0, Math.min(size - 1, Math.floor(+body.cpus) || 0));
		const live = await leaveOld();
		if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409);
		for (let i = 0; i < 10; i++) {
			let code = ''; for (let k = 0; k < 5; k++) code += CODE_ABC[Math.floor(ctx.rnd() * CODE_ABC.length)];
			const nid = ctx.randomHex(6);
			if (!(await store.setIfRev(CKEY(code), { rev: 1, id: nid, at: now }, 0))) {
				const held = await store.get(CKEY(code));
				const hl = held && ID_RE.test(String(held.id)) ? await store.get(LKEY(held.id)) : null;
				if (hl && !hl.closed) continue;
				await store.setJSON(CKEY(code), { rev: 1, id: nid, at: now });
			}
			const lb = { id: nid, code, rev: 1, at: now, ts: now, host: username, size, cpus, level: body.level === 'easy' ? 'easy' : 'normal', opts: optsOf(body.opts), ...(tag ? { tag: true, split: body.split === 'apart' ? 'apart' : 'together' } : {}), players: [{ name: username, team, ready: true }], seen: { [username]: now }, m: null };
			if (!(await store.setIfRev(LKEY(nid), lb, 0))) continue;
			await store.setJSON(UKEY(username), { id: nid, at: now });
			return json({ lobby: lobbyView(lb) });
		}
		return json({ error: 'busy, try again' }, 503);
	}
	if (action === 'rpvp-mine') {
		const cur = await store.get(UKEY(username));
		const lb = cur && ID_RE.test(String(cur.id)) ? await store.get(LKEY(cur.id)) : null;
		if (!lb || lb.closed || !member(lb, username)) return json({ lobby: null });
		return json({ lobby: lobbyView(lb) });
	}
	if (action === 'rpvp-join') {
		const code = String(body.code || '').trim().toUpperCase();
		if (!RP_CODE_RE.test(code)) return json({ error: 'a code is 5 letters and numbers' }, 400);
		const team = cleanTeam(body.team); if (!team) return json({ error: `pick ${R.TEAM_MIN} to ${R.TEAM_MAX} Pets` }, 400);
		const c = await store.get(CKEY(code));
		const lid = c && ID_RE.test(String(c.id)) ? c.id : '';
		const peek = lid ? await store.get(LKEY(lid)) : null;
		if (!peek || peek.closed || peek.code !== code) return json({ error: 'no match with that code', closed: true }, 404);
		if (!member(peek, username)) { const live = await leaveOld(); if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409); }
		return mutate(lid, async (lb) => {
			if (!member(lb, username)) {
				if (lb.m) return fail('that match has already started', 409);
				if (lb.players.length >= lb.size - lb.cpus) return fail('that match is full', 409);
				lb.players.push({ name: username, team, ready: false });
			}
			lb.seen[username] = now;
			await store.setJSON(UKEY(username), { id: lid, at: now });
			return { lobby: lobbyView(lb) };
		});
	}
	if (!ID_RE.test(id)) return json({ error: 'bad match id' }, 400);
	if (action === 'rpvp-update') {
		return mutate(id, async (lb) => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			const p = lb.players.find((x) => x.name === username);
			if (body.team !== undefined) { const t = cleanTeam(body.team); if (!t) return fail(`pick ${R.TEAM_MIN} to ${R.TEAM_MAX} Pets`); p.team = t; }
			if (typeof body.ready === 'boolean') p.ready = body.ready;
			if (username === lb.host) {
				if ([2, 3, 4].includes(body.size)) lb.size = Math.max(body.size, lb.players.length);
				if (body.cpus !== undefined) lb.cpus = Math.max(0, Math.min(lb.size - lb.players.length, Math.floor(+body.cpus) || 0));
				if (body.level === 'easy' || body.level === 'normal') lb.level = body.level;
				if (body.opts !== undefined) lb.opts = optsOf(body.opts);
				if (typeof body.tag === 'boolean') { lb.tag = body.tag; if (lb.tag) { lb.size = 4; lb.split = lb.split || 'together'; } }
				if (body.split === 'apart' || body.split === 'together') lb.split = body.split;
				if (lb.tag && lb.size !== 4) lb.tag = false;   // (Tag-Team is 4 seats)
				lb.cpus = Math.max(0, Math.min(lb.size - lb.players.length, lb.cpus));
			}
			touch(lb);
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'rpvp-start') {
		return mutate(id, async (lb) => {
			if (lb.host !== username) return fail('only the host starts the match', 403);
			if (lb.m && !lb.m.over) return fail('the match has started', 409);
			const humans = lb.players.length, seats = humans + lb.cpus;
			if (seats < 2) return fail('a match needs 2 players: add a computer player, or wait for a friend');
			if (!lb.players.every((p) => p.ready || p.name === lb.host)) return fail('not everyone is ready');
			const pool = R.PETS.map((p) => p.id), taken = new Set(lb.players.flatMap((p) => p.team));
			const cpuTeam = (k) => { const free = pool.filter((x) => !taken.has(x)); const out = []; for (let j = 0; j < 4 && free.length; j++) out.push(free.splice(Math.floor(ctx.rnd() * free.length), 1)[0]); out.forEach((x) => taken.add(x)); return out; };
			const people = lb.players.map((p) => ({ name: p.name, pets: p.team.slice() })), computers = Array.from({ length: lb.cpus }, (_, k) => ({ name: CPU_NAMES[k], pets: cpuTeam(k), cpu: lb.level }));
			if (lb.tag && seats !== 4) return fail('Tag-Team needs 4 players: add computer players, or wait for friends');
			const setup = { seed: ctx.randomHex(8), opts: { ...lb.opts }, seats: lb.tag ? tagSeats(people, computers, lb.split) : [...people, ...computers], ...(lb.tag ? { tagTeam: true } : {}) };
			if (!R.newMatch(setup)) return fail('that match cannot be set up');
			lb.m = { setup, actions: [], at: now, startAt: now, over: null, left: {} };
			for (const p of lb.players) lb.seen[p.name] = now;
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'rpvp-sync' || action === 'rpvp-act') {
		const sinceN = Number.isInteger(body.n) ? body.n : -1;
		return mutate(id, async (lb) => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			touch(lb);
			if (!lb.m) return { lobby: lobbyView(lb), match: null };
			let S = R.replay({ setup: lb.m.setup, actions: lb.m.actions });
			if (!lb.m.over) S = advance(lb, S);
			if (action === 'rpvp-act' && !lb.m.over) {
				const seat = seatOf(lb.m, username), a = cleanAction(body.a);
				if (!seat || !a) return fail('not an action');
				const no = R.act(S, seat, a);
				if (no) return { lobby: lobbyView(lb), match: matchView(lb, S, -1), refused: no };
				lb.m.actions.push([seat, a]); lb.m.at = now;
				S = advance(lb, S);
			}
			return { lobby: lobbyView(lb), match: matchView(lb, S, sinceN) };
		});
	}
	if (action === 'rpvp-leave') {
		return mutate(id, async (lb) => {
			if (!member(lb, username)) return { ok: true };
			if (lb.m && !lb.m.over) { lb.m.left = { ...(lb.m.left || {}), [username]: 1 }; advance(lb, R.replay({ setup: lb.m.setup, actions: lb.m.actions })); }
			else if (lb.host === username) lb.closed = true;
			else lb.players = lb.players.filter((p) => p.name !== username);
			const cur = await store.get(UKEY(username)); if (cur && cur.id === lb.id) await store.setJSON(UKEY(username), { id: '', at: now });
			return { ok: true };
		});
	}
	return json({ error: 'unknown action' }, 400);
}
