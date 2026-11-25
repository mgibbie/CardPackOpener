// POKETACTICA ONLINE — PvP for 2-4 players (owner, 2026-11-22: "PvP up to 4 players"); server/mp.mjs routes every
// `ptpvp-*` action here.
//
// LOCKSTEP. A match is a recipe: { seed, config, actions }. Every device rebuilds the battle from it with the game's own
// engine (poketactica/js/engine/battle.js, deterministic: the computer seats' AI too), so the server never runs the engine.
// What keeps it honest:
//   - the teams are the server's: each player's figurines are read from THEIR `ptfig:<user>` row when they join (an id
//     they don't own, or one a trade or a bet holds, is refused), and the computer seats are picked here;
//   - each action is stamped with the sender's seat (`by`: 'a'..'d'), so a player can only ever act as themselves. The
//     engine refuses anything out of turn or illegal, identically on every device (a refused action changes nothing);
//   - actions append in order: a client sends the count it has seen (`n`), and a stale one gets the newer actions back.
// The clock (D1 has none: whoever polls evaluates it): a seat that does nothing for PT.TURN_MS has its phase ended (the
// server appends { t: 'idle' }); a player quiet for PT.GRACE_MS concedes (the server appends their 'concede').
// The result comes from the clients (`ptpvp-over`): no stars or EXP ride on it, so it is only the lobby's note.
//
// Rows (every write an exact key; the lobby row is a compare-and-set on `rev`, retried):
//   ptpvp:<id>        { id, code, rev, at, ts, host, size, cpus, arena, lv, players: [{ name, team: [fig], ready }],
//                       seen: { name: ms }, closed?, m: null | { seed, config, actions: [], at, startAt, gone: {name: 1}, over } }
//   ptpvpcode:<CODE>  { rev, id, at }   a 5-letter join code -> the lobby
//   ptpvpcur:<user>   { id, at }        the lobby a player is in (rejoin after a reload)
// All three are swept 12 hours after their last write (GC_TABLE in mp.mjs). A finished match's replay is the page's
// ordinary replay upload (game 'poketactica').
import { cleanFigs } from '../poketactica/js/figcol.js';
import { arenaById, ARENAS, PTPVP_PROTOCOL, CPU_SPECIES, CPU_NAMES } from '../poketactica/js/arenas.js';
import { cleanMap, arenaProblems } from '../poketactica/js/editor.js';
// (a made map as the arena: the host sends it, read defensively; it needs a PvP seat per player)
const customArena = (b) => (b.arena === 'custom' && b.map ? cleanMap(b.map) : null);

export const PT = Object.freeze({ SEEN_MS: 8_000, LOBBY_IDLE_MS: 10 * 60_000, GUEST_IDLE_MS: 90_000, GRACE_MS: 120_000, TURN_MS: 150_000,
	MAX_ACTIONS: 4000, MAX_ACTION_CHARS: 400, TEAM_MAX: 6 });
const ID_RE = /^[0-9a-f]{12}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PT_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const SIDES = ['a', 'b', 'c', 'd'];
const ACTIONS = new Set(['deploy', 'move', 'undo', 'throw', 'unqueue', 'wait', 'attack', 'execute', 'end', 'order', 'concede', 'withdraw']);

export async function handlePtpvp(ctx) {
	const { action, body, store, username, json, now } = ctx;
	if (!username) return json({ error: 'sign in to play online' }, 401);
	if (body.pv !== PTPVP_PROTOCOL) return json({ error: 'your game is out of date: reload', pv: PTPVP_PROTOCOL }, 409);
	const LKEY = (id) => 'ptpvp:' + id, CKEY = (c) => 'ptpvpcode:' + c, UKEY = (u) => 'ptpvpcur:' + u;
	const id = String(body.id || '');
	const member = (lb, who) => !!lb && lb.players.some((p) => p.name === who);
	const humans = (lb) => lb.size - lb.cpus;
	const fail = (error, status = 400, extra = {}) => ({ status, body: { error, ...extra } });

	/** The player's chosen figurines, from their own collection row (1..6 ids they hold and nothing holds). */
	const teamOf = async (ids) => {
		const want = Array.isArray(ids) ? [...new Set(ids.map(String))].slice(0, PT.TEAM_MAX) : [];
		if (!want.length) return { error: 'choose up to six figurines' };
		const row = await store.get('ptfig:' + username), col = row && cleanFigs(row.figs);
		if (!col) return { error: 'you have no figurines on your account yet: play the camp first' };
		const held = new Set(Object.values(col.escrow || {}).flatMap((h) => h.ids || []));
		const team = [];
		for (const fid of want) {
			const f = col.figs[fid];
			if (!f || held.has(fid)) return { error: 'that figurine is not yours to use: ' + fid };
			team.push(f);
		}
		return { team };
	};
	const lobbyView = (lb) => ({
		id: lb.id, code: lb.code, host: lb.host, size: lb.size, cpus: lb.cpus, arena: lb.arena, arenaName: lb.map ? lb.map.name : null, lv: lb.lv, plain: !!lb.plain, started: !!lb.m, over: lb.m ? lb.m.over || null : null,
		players: lb.players.map((p) => ({ name: p.name, ready: !!p.ready || p.name === lb.host, team: p.team.map((f) => ({ species: f.species, level: f.level, shiny: !!f.shiny })), away: now - ((lb.seen || {})[p.name] || 0) > 20_000 })),
	});
	/** The clock: a player gone too long concedes; a phase that ran too long ends. (Appends to m.actions.) */
	const tick = (lb) => {
		const m = lb.m;
		if (!m || m.over || m.actions.length >= PT.MAX_ACTIONS) return;
		m.config.seats.forEach((s, i) => {
			if (s.cpu || (m.gone || {})[s.name]) return;
			if (now - ((lb.seen || {})[s.name] || m.startAt) > PT.GRACE_MS) { m.actions.push({ t: 'concede', by: SIDES[i] }); (m.gone = m.gone || {})[s.name] = 1; m.at = now; }
		});
		if (now - m.at > PT.TURN_MS) { m.actions.push({ t: 'idle' }); m.at = now; }
	};
	const matchView = (lb, since) => {
		const m = lb.m, seat = m.config.seats.findIndex((s) => !s.cpu && s.name === username);
		const from = Number.isInteger(since) && since >= 0 && since <= m.actions.length ? since : 0;
		return { seed: m.seed, config: from === 0 ? m.config : undefined, from, actions: m.actions.slice(from), n: m.actions.length, side: seat >= 0 ? SIDES[seat] : null,
			over: m.over || null, deadline: m.over ? 0 : m.at + PT.TURN_MS, startAt: m.startAt };
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
	const touch = (lb) => { if (member(lb, username) && now - (lb.seen[username] || 0) > PT.SEEN_MS) lb.seen[username] = now; };
	/** Leave the lobby a player was in before (a waiting one); a live match must be finished or left first. */
	const leaveOld = async () => {
		const cur = await store.get(UKEY(username));
		if (!cur || !ID_RE.test(String(cur.id))) return null;
		const old = await store.get(LKEY(cur.id));
		if (!old || old.closed || !member(old, username)) return null;
		if (old.m && !old.m.over && !(old.m.gone || {})[username]) return old;
		const rev = old.rev || 0;
		if (!old.m) { if (old.host === username) old.closed = true; else old.players = old.players.filter((p) => p.name !== username); }
		old.rev = rev + 1; old.ts = now;
		await store.setIfRev(LKEY(old.id), old, rev);
		return null;
	};

	if (action === 'ptpvp-create') {
		const t = await teamOf(body.team); if (t.error) return json({ error: t.error }, 400);
		const size = [2, 3, 4].includes(body.size) ? body.size : 2, cpus = Math.max(0, Math.min(size - 1, Math.floor(+body.cpus) || 0));
		const cmap = customArena(body);
		// (a made map: as many players as it has PvP bases, owner 2026-11-22)
		if (body.arena === 'custom' && (!cmap || arenaProblems(cmap, size).length)) return json({ error: 'that map cannot be an arena for ' + size + ': ' + (cmap ? arenaProblems(cmap, size)[0] : 'it cannot be read') }, 400);
		const arena = cmap ? 'custom' : arenaById(body.arena) ? body.arena : ARENAS[0].id, lv = body.lv === 'own' ? null : 50;
		const live = await leaveOld();
		if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409);
		for (let i = 0; i < 10; i++) {
			let code = ''; for (let k = 0; k < 5; k++) code += CODE_ABC[Math.floor(ctx.rnd() * CODE_ABC.length)];
			const nid = ctx.randomHex(6);
			if (!(await store.setIfRev(CKEY(code), { rev: 1, id: nid, at: now }, 0))) {
				const held = await store.get(CKEY(code));
				const hl = held && ID_RE.test(String(held.id)) ? await store.get(LKEY(held.id)) : null;
				if (hl && !hl.closed && now - (hl.ts || 0) < 6 * 3600_000) continue;
				await store.setJSON(CKEY(code), { rev: 1, id: nid, at: now });
			}
			const lb = { id: nid, code, rev: 1, at: now, ts: now, host: username, size, cpus, arena, ...(cmap ? { map: cmap } : {}), lv, ...(body.plain === true ? { plain: true } : {}), players: [{ name: username, team: t.team, ready: true }], seen: { [username]: now }, m: null };
			if (!(await store.setIfRev(LKEY(nid), lb, 0))) continue;
			await store.setJSON(UKEY(username), { id: nid, at: now });
			return json({ lobby: lobbyView(lb) });
		}
		return json({ error: 'busy, try again' }, 503);
	}
	if (action === 'ptpvp-mine') {
		const cur = await store.get(UKEY(username));
		const lb = cur && ID_RE.test(String(cur.id)) ? await store.get(LKEY(cur.id)) : null;
		if (!lb || lb.closed || !member(lb, username) || (lb.m && (lb.m.gone || {})[username])) return json({ lobby: null });
		return json({ lobby: lobbyView(lb) });
	}
	if (action === 'ptpvp-join') {
		const code = String(body.code || '').trim().toUpperCase();
		if (!PT_CODE_RE.test(code)) return json({ error: 'a code is 5 letters and numbers' }, 400);
		const c = await store.get(CKEY(code));
		const lid = c && ID_RE.test(String(c.id)) ? c.id : '';
		const peek = lid ? await store.get(LKEY(lid)) : null;
		if (!peek || peek.closed || peek.code !== code) return json({ error: 'no match with that code', closed: true }, 404);
		const t = member(peek, username) ? null : await teamOf(body.team);
		if (t && t.error) return json({ error: t.error }, 400);
		if (!member(peek, username)) { const live = await leaveOld(); if (live) return json({ error: 'you are in a match: rejoin or leave it first', id: live.id, code: live.code }, 409); }
		return mutate(lid, async (lb) => {
			if (!member(lb, username)) {
				if (lb.m) return fail('that match has already started', 409);
				if (lb.players.length >= humans(lb)) return fail('that match is full', 409);
				lb.players.push({ name: username, team: t.team, ready: false });
			}
			lb.seen[username] = now;
			await store.setJSON(UKEY(username), { id: lid, at: now });
			return { lobby: lobbyView(lb) };
		});
	}
	if (!ID_RE.test(id)) return json({ error: 'bad match id' }, 400);

	// a waiting lobby: change your team / ready up; the host changes the rules
	if (action === 'ptpvp-update') {
		const t = body.team ? await teamOf(body.team) : null;
		if (t && t.error) return json({ error: t.error }, 400);
		return mutate(id, async (lb) => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			if (lb.m) return fail('the match has started', 409);
			const me = lb.players.find((p) => p.name === username);
			if (t) me.team = t.team;
			if (typeof body.ready === 'boolean') me.ready = body.ready;
			if (username === lb.host) {
				if ([2, 3, 4].includes(body.size) && body.size >= lb.players.length && !(lb.arena === 'custom' && lb.map && body.size > (lb.map.seats || []).length)) { lb.size = body.size; lb.cpus = Math.min(lb.cpus, lb.size - 1); }
				if (Number.isInteger(body.cpus)) lb.cpus = Math.max(0, Math.min(lb.size - lb.players.length, body.cpus));
				if (arenaById(body.arena)) { lb.arena = body.arena; delete lb.map; }
				else if (body.arena === 'custom') { const cm = customArena(body); if (cm && !arenaProblems(cm, lb.size).length) { lb.arena = 'custom'; lb.map = cm; } }
				if (body.lv === 'own' || body.lv === 50) lb.lv = body.lv === 'own' ? null : 50;
				if (typeof body.plain === 'boolean') { if (body.plain) lb.plain = true; else delete lb.plain; }   // (a capped match: item levels and gemstones do not count)
			}
			touch(lb);
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'ptpvp-start') {
		return mutate(id, async (lb) => {
			if (lb.host !== username) return fail('only the host starts the match', 403);
			if (lb.m) return { lobby: lobbyView(lb), match: matchView(lb, 0) };
			if (lb.players.length !== humans(lb)) return fail(`waiting for ${humans(lb) - lb.players.length} more player(s)`, 409);
			if (!lb.players.every((p) => p.ready || p.name === lb.host)) return fail('not everyone is ready', 409);
			if (lb.map && arenaProblems(lb.map, lb.size).length) return fail('the arena: ' + arenaProblems(lb.map, lb.size)[0], 409);
			// the seats in a shuffled order (who plays first is luck), computers after the players get their own picks
			const seats = lb.players.map((p) => ({ name: p.name, team: p.team }));
			for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(ctx.rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
			const lvAvg = Math.max(5, Math.round(seats.flatMap((s) => s.team).reduce((a, f) => a + f.level, 0) / Math.max(1, seats.flatMap((s) => s.team).length)));
			const n = Math.max(3, Math.min(PT.TEAM_MAX, Math.max(...seats.map((s) => s.team.length))));
			for (let k = 0; k < lb.cpus; k++) {
				const picks = []; while (picks.length < n) { const sp = CPU_SPECIES[Math.floor(ctx.rnd() * CPU_SPECIES.length)]; if (!picks.includes(sp)) picks.push(sp); }
				seats.push({ name: CPU_NAMES[k], cpu: true, picks, level: lb.lv || lvAvg });
			}
			lb.m = { seed: ctx.randomHex(8), config: { v: PTPVP_PROTOCOL, arena: lb.arena, ...(lb.map ? { map: lb.map } : {}), lv: lb.lv, ...(lb.plain ? { plain: true } : {}), seats }, actions: [], at: now, startAt: now, gone: {}, over: null };
			touch(lb);
			return { lobby: lobbyView(lb), match: matchView(lb, 0) };
		});
	}
	// the poll: the lobby, and (once started) the actions since `n`; the clock runs here
	if (action === 'ptpvp-state') {
		return mutate(id, async (lb) => {
			if (!member(lb, username)) return fail('you are not in that match', 403);
			touch(lb);
			if (lb.m) tick(lb);
			return { lobby: lobbyView(lb), match: lb.m ? matchView(lb, body.n) : null };
		});
	}
	// one action, stamped with the sender's seat; `n` = the actions the sender had seen (else: stale, here are the rest)
	if (action === 'ptpvp-act') {
		const a = body.a;
		if (!a || typeof a !== 'object' || !ACTIONS.has(a.t) || JSON.stringify(a).length > PT.MAX_ACTION_CHARS) return json({ error: 'not an action' }, 400);
		return mutate(id, async (lb) => {
			const m = lb.m;
			if (!m) return fail('the match has not started', 409);
			const seat = m.config.seats.findIndex((s) => !s.cpu && s.name === username);
			if (seat < 0) return fail('you are not playing that match', 403);
			touch(lb);
			if (m.over) return { over: m.over, n: m.actions.length };
			if ((m.gone || {})[username]) return fail('you have left that match', 409);
			if (body.n !== m.actions.length) return { stale: true, match: matchView(lb, body.n) };
			if (m.actions.length >= PT.MAX_ACTIONS) return fail('that match is too long', 409);
			const clean = { ...JSON.parse(JSON.stringify(a)), by: SIDES[seat] };
			m.actions.push(clean); m.at = now;
			if (a.t === 'concede') (m.gone = m.gone || {})[username] = 1;
			return { ok: true, n: m.actions.length };
		});
	}
	// the end, as a client's engine saw it (no prize rides on it)
	if (action === 'ptpvp-over') {
		return mutate(id, async (lb) => {
			if (!member(lb, username) || !lb.m) return fail('you are not in that match', 403);
			if (!lb.m.over && Number.isInteger(body.n) && body.n === lb.m.actions.length) {
				const w = SIDES.indexOf(body.winner), s = w >= 0 ? lb.m.config.seats[w] : null;
				lb.m.over = { winner: s ? s.name : null, side: s ? SIDES[w] : null, at: now, by: username };
			}
			touch(lb);
			return { lobby: lobbyView(lb) };
		});
	}
	if (action === 'ptpvp-leave') {
		const r = await mutate(id, async (lb) => {
			if (!member(lb, username)) return { ok: true };
			if (!lb.m) {
				if (lb.host === username) lb.closed = true; else lb.players = lb.players.filter((p) => p.name !== username);
			} else if (!lb.m.over && !(lb.m.gone || {})[username]) {
				const seat = lb.m.config.seats.findIndex((s) => !s.cpu && s.name === username);
				lb.m.actions.push({ t: 'concede', by: SIDES[seat] }); lb.m.at = now; (lb.m.gone = lb.m.gone || {})[username] = 1;
			}
			return { ok: true };
		});
		await store.setJSON(UKEY(username), { id: '', at: now });
		return r;
	}
	return json({ error: 'unknown action' }, 400);
}
