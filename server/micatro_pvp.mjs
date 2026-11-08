// MICATRO MULTIPLAYER (PvP) — the lobby and the match referee (server/mp.mjs routes every `mtpvp-*` action here).
//
// Rules are the Balatro Multiplayer mod's "Vanilla" ruleset, Attrition mode, re-implemented from its behaviour
// (Desktop/BalatroMultiplayer_ref/ANALYSIS.md): both players run the SAME seed, deck and stake (the host's) on their
// own engine; from ante `pvpStart` every Boss Blind is "Your Nemesis": both press READY, a 3-2-1 countdown, both enter
// together, no score target, every hand's running total is reported here. The round ends when the TRAILING player has
// no hands left (or both are out); the lower score loses a life, an exact tie costs nobody. Failing a normal blind
// costs a life (lobby option) but never ends a run; whoever reaches 0 lives loses — except a last life lost on a
// normal blind: the opponent must then play that same blind ("pending death": beat or skip it -> they win, fail it
// with lives left -> they win, fail it on their last life -> draw, leave first -> the dead player wins).
//
// The server is the referee: lives, round results and the match result are decided here, from the two clients'
// reports (scores are client-reported, as in the mod). Everything a client applies to its engine from here is a
// RECORDED action (engine/pvp.js), so a resume / replay rebuilds exactly what was played.
//
// Stage 6 (host options, defaults per the mod — ANALYSIS.md §5 / §1.2 / Part B §1):
//   * MODE: Attrition (the Boss from ante `pvpStart` is the Nemesis) | Showdown (from ante `showdownStart` Small, Big AND Boss
//     are all Nemesis rounds) | Survival (no Nemesis, 1 life: the player who beat the furthest blind wins; one who fails on
//     their last life waits for the opponent to reach that blind — decideSurvival). A round is keyed by its blind number
//     b = ante*10 + 1|2|3 (Small|Big|Boss), so Showdown's three rounds an ante are three rounds.
//   * the HURRY timer (`timer`, `timerBase` s, `timerInc` s): a player READY at a Nemesis may start it on an opponent who
//     isn't; it runs on SERVER time (m.timer.endAt), never in a Nemesis round (a round's start clears it); at 0 the timed
//     player loses a life (every expiry: unguarded, as in the mod) and it restarts at full length until they reach the
//     Nemesis. Skipping further ahead (skips since the last Nemesis round, m.sk) is worth `timerInc` s per extra skip,
//     taken back when the opponent catches up (never below 10 s left). The client applies each loss as a RECORDED action.
//   * `hideScore`: the opponent's live score is "???" (null in this player's view) until they've played a hand this round.
//   * `bossFx`: the PvP Boss is the ante's real boss, its effect on (the engine's; the referee just sees a PvP round).
//
// Rows (every write is an exact key; the shared lobby row is a compare-and-set on `rev`):
//   mtpvp:<id>             {id, code, rev, at, ts, host, guest, gready, opts, mods, pv, m: null | match}
//                          match = {n, seed, at, mode, players:[host, guest], lives:{name}, lost:{name}, round, hist[],
//                                   res:{name:{'ante:slot':'b'|'f'}}, far:{name: furthest blind}, sk:{name: skips since the
//                                   last round}, tl:{name: timer lives lost}, timer, guard:{name:{key:1}}, pending, over, rematch:{name}}
//                          round = {ante, slot, b, ready:{name}, startAt, scores:{name:{s, h, n, hp}}, res}
//                          timer = {on: the timed player, by, b, endAt (running) | 0, left (paused, ms), adj, n}
//   mtpvpcode:<CODE>       {id}         a 5-letter join code (no I, O, 0, 1) -> the lobby
//   mtpvpcur:<user>        {id, at}     the lobby a player is in (rejoin after a reload / on another tab)
//   mtpvpp:<id>:<user>     {ts, seq, sum, end?}   one player's own row: liveness (ts), the summary the opponent's
//                          HUD shows, and at the end the jokers + deck the end screen shows. Written only by its player.
//
// Liveness is the player row's `ts` (rewritten on a changed summary, else every PP.BEAT_MS). A waiting lobby closes
// when its host goes quiet (PP.LOBBY_IDLE_MS); a guest who goes quiet is dropped; in a match a player quiet for
// PP.GRACE_MS (120 s, owner D7) forfeits — checked lazily by whoever polls (D1 has no clock).

export const MTPVP_PROTOCOL = 2;   // (2: stage 6 — rounds keyed by blind, modes, the Hurry timer, hidden scores)
export const PP = {
	BEAT_MS: 10_000,                 // a player row is rewritten at least this often while polling (liveness; <= GRACE_MS / 4, below)
	MIN_WRITE_MS: 900,               // ...and at most this often (a summary that changes on every click)
	LOBBY_IDLE_MS: +(globalThis.process && process.env && process.env.MTPVP_LOBBY_IDLE_MS) || 60_000,
	GUEST_IDLE_MS: +(globalThis.process && process.env && process.env.MTPVP_GUEST_IDLE_MS) || 45_000,
	GRACE_MS: +(globalThis.process && process.env && process.env.MTPVP_GRACE_MS) || 120_000,
	COUNTDOWN_MS: +(globalThis.process && process.env && process.env.MTPVP_COUNTDOWN_MS) || 3_000,
	PRESENCE_MS: 30_000,             // the lobby's presence status is rewritten at most this often
	SUM_MAX: 6_000,                  // one player summary (JSON chars)
	END_MAX: 40_000,                 // the end-of-match jokers + deck
	MODS_MAX: 24_000,                // the host's mod set + options + pins
	DEFAULTS: {
		lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true, seed: '', back: 'b_red', stake: 1, sleeve: '',
		mode: 'attrition', showdownStart: 3, bossFx: false, hideScore: false, timer: true, timerBase: 150, timerInc: 60,
	},
	TIMER_FLOOR_MS: 10_000,          // a skip taken back never leaves less than this on the Hurry timer
};
export const MODES = ['attrition', 'showdown', 'survival'];
// (a short grace period — a test's — keeps the heartbeat well inside it)
PP.BEAT_MS = Math.min(PP.BEAT_MS, Math.floor(PP.GRACE_MS / 4));
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1
const SEED_ABC = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
const KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
const MOD_ID_RE = /^[a-z0-9_]{1,32}$/;
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const ID_RE = /^[0-9a-f]{12}$/;
const SLOTS = ['Small', 'Big', 'Boss'];

// ------------------------------------------------------------------ pure rules (unit-tested)
/** A reported score ("123", "1.5e+25", "Infinity", "1.23e450") -> [exponent, mantissa] (0 -> [-Infinity, 0]); null if not a score. */
export function scoreKey(s) {
	s = String(s == null ? '' : s).trim();
	if (s.length > 48) return null;
	if (/^(Infinity|naneinf)$/i.test(s)) return [Infinity, 1];
	if (!/^\d+(\.\d+)?(e\+?\d+(\.\d+)?)?$/i.test(s)) return null;
	const n = Number(s);
	if (Number.isFinite(n)) {
		if (n <= 0) return [-Infinity, 0];
		const e = Math.floor(Math.log10(n));
		return [e, n / Math.pow(10, e), n];
	}
	const m = /^(\d(?:\.\d+)?)e\+?(\d+)$/i.exec(s);
	if (!m) return null;
	const exp = Number(m[2]);
	return exp >= 1000 ? [Infinity, 1] : [exp, Number(m[1])];
}
/** > 0 when score a beats b, 0 for an exact tie. Two plain numbers compare exactly. */
export function scoreCmp(a, b) {
	const ka = scoreKey(a) || [-Infinity, 0], kb = scoreKey(b) || [-Infinity, 0];
	if (ka.length === 3 && kb.length === 3) return ka[2] === kb[2] ? 0 : ka[2] > kb[2] ? 1 : -1;
	if (ka[0] !== kb[0]) return ka[0] > kb[0] ? 1 : -1;
	return ka[1] === kb[1] ? 0 : ka[1] > kb[1] ? 1 : -1;
}
/**
 * One Nemesis round between a and b ({s: score, h: hands left | null before the first report}): the round ends when the
 * trailing player is out of hands, or both are. -> null (still playing) | {tie: true} | {loser: 'a' | 'b'}.
 */
export function resolve2p(a, b) {
	const out = (x) => !!x && Number.isInteger(x.h) && x.h < 1;
	const c = scoreCmp(a && a.s, b && b.s);
	const trigger = (out(a) && c < 0) || (out(b) && c > 0) || (out(a) && out(b));
	if (!trigger) return null;
	if (c === 0) return { tie: true };
	return { loser: c < 0 ? 'a' : 'b' };
}
/**
 * A pending death: `dead` lost their last life on non-PvP blind `key`; the opponent must play that blind.
 * opp = {result: 'b' | 'f' | undefined, lives, present} -> {outcome: 'pending' | 'win' | 'draw', winner: 'opp' | 'dead' | null}
 */
export function decidePending(opp) {
	if (opp.result === 'b') return { outcome: 'win', winner: 'opp' };
	if (!(opp.lives > 0)) return { outcome: 'draw', winner: null };
	if (opp.result === 'f') return { outcome: 'win', winner: 'opp' };
	if (!opp.present) return { outcome: 'win', winner: 'dead' };
	return { outcome: 'pending', winner: null };
}
/**
 * Survival (the mod's legacy mode): `dead` failed a blind on their (only) life with `deadFar` = the furthest blind they had
 * beaten; the opponent plays on. opp = {far, dead, present} -> {outcome: 'pending' | 'win' | 'draw', winner: 'opp' | 'dead' | null}.
 * The opponent wins once they beat a blind past the dead player's furthest; if they fail first, the furthest blind decides
 * (equal -> draw); an opponent who leaves before getting past it loses.
 */
export function decideSurvival(deadFar, opp) {
	const of = opp.far || 0, df = deadFar || 0;
	if (of > df) return { outcome: 'win', winner: 'opp' };
	if (opp.dead) return of === df ? { outcome: 'draw', winner: null } : { outcome: 'win', winner: 'dead' };
	if (!opp.present) return { outcome: 'win', winner: 'dead' };
	return { outcome: 'pending', winner: null };
}
/** A blind's number: ante*10 + 1 | 2 | 3 (Small | Big | Boss) — the mod's "furthest blind", and a round's key. */
export const blindNum = (ante, slot) => ante * 10 + (SLOTS.indexOf(slot) + 1);
/** Is this blind a PvP round under the lobby's options? (engine/pvp.js pvpSlots is the same table) */
export function isPvpSlot(o, ante, slot) {
	const mode = (o && o.mode) || 'attrition';
	if (mode === 'survival') return false;
	if (mode === 'showdown') return ante >= (o.showdownStart || 3);
	return slot === 'Boss' && ante >= ((o && o.pvpStart) || 2);
}
/** The lives a match starts with (Survival: 1). */
export const startLives = (o) => (o.mode === 'survival' ? 1 : o.lives);

// ---- the Hurry timer (pure: m = the match, o = the lobby's options, now = server ms)
const otherOf = (m, who) => m.players.find((x) => x !== who);
/** Extra skips the timed player is ahead by, since the last Nemesis round. */
export const timerExtra = (m, who) => Math.max(0, ((m.sk && m.sk[who]) || 0) - ((m.sk && m.sk[otherOf(m, who)]) || 0));
/** One full run of the timer for `extra` skips ahead (ms). */
export const timerLen = (o, extra) => Math.max(PP.TIMER_FLOOR_MS, (o.timerBase + o.timerInc * (extra || 0)) * 1000);
/** Start (or resume a paused) timer on `target`, by `by`, for round b. */
export function timerStart(m, o, now, by, target, b) {
	const t = m.timer;
	if (t && t.on === target && t.b === b && t.endAt) return false;                          // (already running)
	if (t && t.on === target && t.b === b && t.left > 0) { t.endAt = now + t.left; t.left = 0; t.by = by; return true; }
	const adj = timerExtra(m, target);
	m.timer = { on: target, by, b, endAt: now + timerLen(o, adj), left: 0, adj, n: 0 };
	return true;
}
/** Pause a running timer (its time left is kept for a resume). */
export function timerPause(m, now) {
	const t = m.timer;
	if (!t || !t.endAt) return false;
	t.left = Math.max(1, t.endAt - now); t.endAt = 0;
	return true;
}
/**
 * The timer's expiries up to `now`: each costs the timed player a life (unguarded — every expiry, as in the mod) and
 * restarts it at full length from the moment it ran out; out of lives -> the match is over. Returns the expiries applied.
 */
export function timerAdvance(m, o, now) {
	const t = m.timer;
	if (!t || !t.endAt || m.over) return 0;
	let k = 0;
	while (t.endAt <= now && k < 50) {
		k++;
		const T = t.on;
		t.n = (t.n || 0) + 1;
		m.lives[T] = Math.max(0, (m.lives[T] || 0) - 1);
		m.lost[T] = (m.lost[T] || 0) + 1;
		(m.tl = m.tl || {})[T] = (m.tl[T] || 0) + 1;
		if (m.lives[T] <= 0) { m.timer = null; if (!m.over) m.over = { winner: otherOf(m, T), draw: false, why: 'timer', at: t.endAt }; break; }
		t.adj = timerExtra(m, T);
		t.endAt += timerLen(o, t.adj);
	}
	return k;
}
/** A skip by `who` (a new one): skips since the last Nemesis round; a running / paused timer gains or gives back its time. */
export function timerSkip(m, o, now, who) {
	(m.sk = m.sk || {})[who] = (m.sk[who] || 0) + 1;
	const t = m.timer;
	if (!t) return;
	const adj = timerExtra(m, t.on), delta = (adj - (t.adj || 0)) * o.timerInc * 1000;
	t.adj = adj;
	if (!delta) return;
	const floor = (v, f) => (delta < 0 ? Math.max(Math.min(v, f), v + delta) : v + delta);
	if (t.endAt) t.endAt = floor(t.endAt, now + PP.TIMER_FLOOR_MS);
	else t.left = floor(t.left, PP.TIMER_FLOOR_MS);
}

/** The lobby's options, validated against the defaults (host input). */
export function cleanOpts(o) {
	o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
	const D = PP.DEFAULTS, int = (v, lo, hi, d) => (Number.isInteger(+v) && +v >= lo && +v <= hi ? +v : d);
	const step = (v, lo, hi, st, d) => { const n = int(v, lo, hi, d); return n % st === 0 ? n : d; };
	const bool = (v, d) => (v === undefined ? d : !!v);
	const seed = typeof o.seed === 'string' ? o.seed.trim().toUpperCase() : '';
	return {
		lives: int(o.lives, 1, 9, D.lives),
		pvpStart: int(o.pvpStart, 1, 8, D.pvpStart),
		deathOnLoss: bool(o.deathOnLoss, D.deathOnLoss),
		comeback: bool(o.comeback, D.comeback),
		seed: /^[A-Z0-9]{1,8}$/.test(seed) ? seed : '',
		back: typeof o.back === 'string' && KEY_RE.test(o.back) ? o.back : D.back,
		stake: typeof o.stake === 'string' ? (KEY_RE.test(o.stake) ? o.stake : D.stake) : int(o.stake, 1, 8, D.stake),
		sleeve: typeof o.sleeve === 'string' && KEY_RE.test(o.sleeve) ? o.sleeve : '',
		mode: MODES.includes(o.mode) ? o.mode : D.mode,
		showdownStart: int(o.showdownStart, 1, 20, D.showdownStart),
		bossFx: bool(o.bossFx, D.bossFx),
		hideScore: bool(o.hideScore, D.hideScore),
		timer: bool(o.timer, D.timer),
		timerBase: step(o.timerBase, 30, 240, 30, D.timerBase),
		timerInc: step(o.timerInc, 0, 180, 30, D.timerInc),
	};
}
/** The host's mod set: {ids, options, pins: {engineRev, modVersions}} -> a clean copy + its signature, or {error}. */
export function cleanMods(m) {
	m = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
	const ids = Array.isArray(m.ids) ? m.ids.filter((x) => typeof x === 'string' && MOD_ID_RE.test(x)) : [];
	if (ids.length > 40 || (Array.isArray(m.ids) && ids.length !== m.ids.length)) return { error: 'bad mod list' };
	const options = m.options && typeof m.options === 'object' && !Array.isArray(m.options) ? m.options : {};
	const pins = cleanPins(m.pins);
	if (!pins) return { error: 'bad mod pins' };
	const out = { ids, options, pins };
	if (JSON.stringify(out).length > PP.MODS_MAX) return { error: 'mod settings too large' };
	return { mods: out, sig: pinSig(pins) };
}
function cleanPins(p) {
	if (!p || typeof p !== 'object' || !Number.isInteger(p.engineRev) || p.engineRev < 1 || p.engineRev > 1e6) return null;
	const mv = p.modVersions && typeof p.modVersions === 'object' && !Array.isArray(p.modVersions) ? p.modVersions : {};
	const out = {};
	for (const k of Object.keys(mv).sort()) {
		if (!MOD_ID_RE.test(k) || typeof mv[k] !== 'string' || mv[k].length > 48) return null;
		out[k] = mv[k];
	}
	return { engineRev: p.engineRev, modVersions: out };
}
/** The canonical signature two clients must share to play together (engine rules rev + every mod's pin). */
export const pinSig = (p) => (p ? `e${p.engineRev}|` + Object.keys(p.modVersions).sort().map((k) => `${k}=${p.modVersions[k]}`).join(',') : '');

const randFrom = (abc, n, rnd) => { let s = ''; for (let i = 0; i < n; i++) s += abc[Math.floor(rnd() * abc.length)]; return s; };

// ------------------------------------------------------------------ the actions
/**
 * ctx = {action, body, store, user, username, json, now, randomHex(n), rnd(), presence(status, label)}.
 * Returns a Response for an mtpvp-* action.
 */
export async function handleMtpvp(ctx) {
	const { action, body, store, username, json } = ctx;
	const now = ctx.now;
	const LKEY = (id) => 'mtpvp:' + id, CKEY = (c) => 'mtpvpcode:' + c, UKEY = (u) => 'mtpvpcur:' + u, PKEY = (id, u) => 'mtpvpp:' + id + ':' + u;
	const id = String(body.id || '');
	const okId = ID_RE.test(id);
	const other = (lb, who) => (lb.host === who ? lb.guest : lb.host);
	const member = (lb, who) => !!lb && (lb.host === who || lb.guest === who);
	const ageOf = (row) => (row && Number.isFinite(row.ts) ? now - row.ts : Infinity);
	// the two player rows (liveness + summaries)
	const rowsOf = async (lb) => {
		const out = {};
		for (const n of [lb.host, lb.guest]) if (n) out[n] = await store.get(PKEY(lb.id, n));
		return out;
	};
	// is the lobby still there? (a waiting lobby: its host polled lately; a match: closed only by leaving / GC)
	const liveLobby = (lb, rows) => {
		if (!lb || lb.closed) return false;
		if (lb.m) return true;
		const hostAge = rows ? ageOf(rows[lb.host]) : 0;
		return Math.min(hostAge, now - (lb.at || 0)) < PP.LOBBY_IDLE_MS;
	};
	const view = (lb, rows) => {
		const ages = {};
		for (const n of [lb.host, lb.guest]) if (n) ages[n] = rows && rows[n] ? Math.min(now - rows[n].ts, 86_400_000) : null;
		return { id: lb.id, code: lb.code, v: lb.rev, host: lb.host, guest: lb.guest || null, gready: !!lb.gready, opts: lb.opts, mods: lb.mods, pv: lb.pv, m: lb.m ? hideScores(lb) : null, ages };
	};
	// "Hide enemy score until you play": until this player has played a hand in the round, the opponent's score is not
	// sent at all (null + hid) — the round's result and the history still show it once decided
	const hideScores = (lb) => {
		const m = lb.m, rd = m.round;
		if (!lb.opts.hideScore || !rd || !rd.startAt || rd.res || !member(lb, username)) return m;
		const mine = rd.scores && rd.scores[username];
		if (mine && mine.hp > 0) return m;
		const opp = other(lb, username), os = rd.scores && rd.scores[opp];
		if (!os) return m;
		return { ...m, round: { ...rd, scores: { ...rd.scores, [opp]: { ...os, s: null, hid: 1 } } } };
	};
	// compare-and-set on the lobby row: fn(lb, rows) edits lb in place; returns {error, status} to refuse, false for no write
	const mutate = async (fn) => {
		for (let i = 0; i < 6; i++) {
			const lb = await store.get(LKEY(id));
			const rows = lb ? await rowsOf(lb) : {};
			if (!liveLobby(lb, rows)) return { error: 'lobby closed', status: 404, closed: true };
			// a waiting guest who went quiet (tab closed without a goodbye) is dropped
			if (!lb.m && lb.guest && ageOf(rows[lb.guest]) > PP.GUEST_IDLE_MS && now - (lb.gat || 0) > PP.GUEST_IDLE_MS) { lb.guest = null; lb.gready = false; }
			const r = fn(lb, rows);
			if (r && r.error) return r;
			if (r === false) return { lb, rows };
			const prev = lb.rev || 0;
			lb.rev = prev + 1; lb.ts = now;
			if (await store.setIfRev(LKEY(id), lb, prev)) return { lb, rows };
		}
		return { error: 'busy, try again', status: 503 };
	};
	const fail = (r) => json({ error: r.error, ...(r.closed ? { closed: true } : {}), ...(r.extra || {}) }, r.status || 400);
	const touchPlayer = async (lbid, prev, patch) => {
		const row = { ts: now, seq: (prev && prev.seq) || 0, sum: (prev && prev.sum) || null, ...(prev && prev.end ? { end: prev.end } : {}), ...patch };
		await store.setJSON(PKEY(lbid, username), row);
		return row;
	};
	const freshMatch = (lb, n) => {
		const seed = lb.opts.seed || randFrom(SEED_ABC, 8, ctx.rnd);
		const players = [lb.host, lb.guest];
		const lives = {}, lost = {}, res = {}, guard = {}, far = {}, sk = {}, tl = {};
		for (const p of players) { lives[p] = startLives(lb.opts); lost[p] = 0; res[p] = {}; guard[p] = {}; far[p] = 0; sk[p] = 0; tl[p] = 0; }
		return { n, seed, at: now, mode: lb.opts.mode, players, lives, lost, round: null, hist: [], res, far, sk, tl, timer: null, guard, pending: null, over: null, rematch: {} };
	};
	const end = (m, winner, why, draw = false) => { if (!m.over) m.over = { winner: winner || '', draw: !!draw, why, at: now }; };
	// a life lost (at most once per key: a Nemesis round 'pvp:<ante>', a blind '<ante>:<slot>')
	const loseLife = (m, who, key) => {
		m.guard[who] = m.guard[who] || {};
		if (m.guard[who][key]) return false;
		m.guard[who][key] = 1;
		m.lives[who] = Math.max(0, (m.lives[who] || 0) - 1);
		m.lost[who] = (m.lost[who] || 0) + 1;
		return true;
	};
	const settlePending = (m, rows) => {
		const p = m.pending;
		if (!p || m.over) return;
		const opp = m.players.find((x) => x !== p.dead);
		const present = !(m.left && m.left[opp]) && ageOf(rows && rows[opp]) < PP.GRACE_MS;
		// (Survival: the furthest blind decides; else the opponent's result on the same blind)
		const d = m.mode === 'survival' ? decideSurvival(p.far, { far: (m.far || {})[opp], dead: !(m.lives[opp] > 0), present })
			: decidePending({ result: (m.res[opp] || {})[p.key], lives: m.lives[opp], present });
		const why = m.mode === 'survival' ? 'furthest' : 'pending';
		if (d.outcome === 'draw') end(m, '', why, true);
		else if (d.outcome === 'win') end(m, d.winner === 'opp' ? opp : p.dead, why);
	};
	// what the clock decides, evaluated by whoever polls (D1 has no clock): the forfeit clock, a pending death's "opponent
	// left", the Hurry timer's expiries. -> true when the match changed.
	const housekeep = (lb, rows) => {
		const m = lb.m;
		if (!m || m.over) return false;
		if (checkStale(m, rows)) return true;
		if (m.pending) { settlePending(m, rows); if (m.over) return true; }
		return timerAdvance(m, lb.opts, now) > 0;
	};
	// the forfeit clock: a player quiet past the grace period loses (not the dead player of a pending death: leaving
	// then is not a forfeit — the opponent's result for the blind decides)
	const checkStale = (m, rows) => {
		if (!m || m.over) return false;
		for (const p of m.players) {
			if (m.pending && m.pending.dead === p) continue;
			if (ageOf(rows[p]) > PP.GRACE_MS) {
				if (m.pending) { settlePending(m, rows); if (m.over) return true; }
				end(m, m.players.find((x) => x !== p), 'forfeit');
				return true;
			}
		}
		return false;
	};

	// ---------------------------------------------------------------- create / peek / join / leave
	if (action === 'mtpvp-create') {
		if (body.pv !== MTPVP_PROTOCOL) return json({ error: 'your game is out of date: reload', pv: MTPVP_PROTOCOL }, 409);
		const cm = cleanMods(body.mods);
		if (cm.error) return json({ error: cm.error }, 400);
		// one lobby per player: a waiting / finished one is left; a live match must be finished (or forfeited) first
		const cur = await store.get(UKEY(username));
		if (cur && ID_RE.test(String(cur.id))) {
			const old = await store.get(LKEY(cur.id));
			if (old && !old.closed && member(old, username)) {
				if (old.m && !old.m.over) return json({ error: 'you are in a match — rejoin or forfeit it first', id: old.id, code: old.code }, 409);
				await leaveLobby(old.id);
			}
		}
		for (let i = 0; i < 10; i++) {
			const code = randFrom(CODE_ABC, 5, ctx.rnd);
			const nid = ctx.randomHex(6);
			const lb = { id: nid, code, rev: 1, at: now, ts: now, host: username, guest: null, gready: false, opts: cleanOpts(body.opts), mods: cm.mods, sig: cm.sig, pv: MTPVP_PROTOCOL, m: null };
			if (!(await store.setIfRev(CKEY(code), { rev: 1, id: nid, at: now }, 0))) {
				const held = await store.get(CKEY(code));
				const hl = held && ID_RE.test(String(held.id)) ? await store.get(LKEY(held.id)) : null;
				if (hl && !hl.closed && now - (hl.ts || 0) < 6 * 3600_000) continue;   // a live lobby owns it
				await store.setJSON(CKEY(code), { rev: 1, id: nid, at: now });       // a dead one's: reclaim
			}
			if (!(await store.setIfRev(LKEY(nid), lb, 0))) continue;
			await store.setJSON(UKEY(username), { id: nid, at: now });
			const row = await touchPlayer(nid, null, {});
			return json({ lobby: view(lb, { [username]: row }) });
		}
		return json({ error: 'busy, try again' }, 503);
	}
	// a lobby by its code, before joining: the guest's client loads the host's mods to compare pins
	if (action === 'mtpvp-peek') {
		const code = String(body.code || '').trim().toUpperCase();
		if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
		const c = await store.get(CKEY(code));
		const lb = c && ID_RE.test(String(c.id)) ? await store.get(LKEY(c.id)) : null;
		const rows = lb ? await rowsOf(lb) : null;
		if (!lb || lb.code !== code || !liveLobby(lb, rows)) return json({ error: 'no lobby with that code', closed: true }, 404);
		return json({ lobby: view(lb, rows), full: !!(lb.guest && lb.guest !== username) || (!!lb.m && !member(lb, username)) });
	}
	if (action === 'mtpvp-join') {
		const code = String(body.code || '').trim().toUpperCase();
		let lid = okId ? id : '';
		if (!lid) {
			if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
			const c = await store.get(CKEY(code));
			lid = c && ID_RE.test(String(c.id)) ? c.id : '';
		}
		if (!lid) return json({ error: 'no lobby with that code', closed: true }, 404);
		const lb0 = await store.get(LKEY(lid));
		if (!lb0 || lb0.closed) return json({ error: 'no lobby with that code', closed: true }, 404);
		if (member(lb0, username)) {
			await store.setJSON(UKEY(username), { id: lid, at: now });
			const prev = await store.get(PKEY(lid, username));
			const row = await touchPlayer(lid, prev, {});
			const rows = await rowsOf(lb0); rows[username] = row;
			return json({ lobby: view(lb0, rows), rejoined: true });
		}
		// the same game on both sides: the protocol, the engine rules and every mod's version
		if (body.pv !== lb0.pv) return json({ error: body.pv > lb0.pv ? 'the host is on an old version of the game (out of date)' : 'your game is out of date: reload', pv: lb0.pv }, 409);
		const mine = cleanPins(body.pins);
		if (!mine || pinSig(mine) !== lb0.sig) {
			return json({ error: 'your game and the host\'s are on different versions: reload to update', pins: lb0.mods.pins, yours: mine }, 409);
		}
		const cur = await store.get(UKEY(username));
		if (cur && ID_RE.test(String(cur.id)) && cur.id !== lid) {
			const old = await store.get(LKEY(cur.id));
			if (old && !old.closed && member(old, username)) {
				if (old.m && !old.m.over) return json({ error: 'you are in a match — rejoin or forfeit it first', id: old.id, code: old.code }, 409);
				await leaveLobby(old.id);
			}
		}
		const prevRow = await store.get(PKEY(lid, username));
		const myRow = await touchPlayer(lid, prevRow, {});
		const r = await mutateAt(lid, (lb) => {
			if (lb.guest && lb.guest !== username) return { error: 'that lobby is full', status: 409 };
			if (lb.m) return { error: 'that match has already started', status: 409 };
			lb.guest = username; lb.gready = false; lb.gat = now;
		});
		if (r.error) return fail(r);
		await store.setJSON(UKEY(username), { id: lid, at: now });
		r.rows[username] = myRow;
		return json({ lobby: view(r.lb, r.rows) });
	}
	if (action === 'mtpvp-leave') {
		if (!okId) return json({ error: 'bad lobby id' }, 400);
		return json(await leaveLobby(id));
	}
	// the lobby this player is in (a reload / another tab rejoins it)
	if (action === 'mtpvp-mine') {
		const cur = await store.get(UKEY(username));
		if (!cur || !ID_RE.test(String(cur.id))) return json({ lobby: null });
		const lb = await store.get(LKEY(cur.id));
		const rows = lb ? await rowsOf(lb) : null;
		if (!lb || !member(lb, username) || !liveLobby(lb, rows)) return json({ lobby: null });
		return json({ lobby: view(lb, rows) });
	}

	// ---------------------------------------------------------------- the rest: inside one lobby
	if (!okId) return json({ error: 'bad lobby id' }, 400);

	if (action === 'mtpvp-update') {
		const r = await mutate((lb, rows) => {
			if (!member(lb, username)) return { error: 'not in this lobby', status: 403, closed: true };
			const isHost = lb.host === username;
			if ((body.opts != null || body.mods != null || body.start != null) && !isHost) return { error: 'only the host can do that', status: 403 };
			if (lb.m && (body.opts != null || body.mods != null || body.start != null)) return { error: 'the match has started', status: 409 };
			if (body.ready != null && !isHost) lb.gready = !!body.ready;
			if (body.opts != null) { const o = cleanOpts(body.opts); if (JSON.stringify(o) !== JSON.stringify(lb.opts)) { lb.opts = o; lb.gready = false; } }
			if (body.mods != null) {
				const cm = cleanMods(body.mods);
				if (cm.error) return { error: cm.error, status: 400 };
				// a different mod set: the guest (on other versions maybe) has to rejoin to check theirs
				if (cm.sig !== lb.sig && lb.guest) { lb.guest = null; lb.gready = false; }
				lb.mods = cm.mods; lb.sig = cm.sig; lb.gready = lb.gready && cm.sig === lb.sig;
			}
			if (body.start) {
				if (!lb.guest || ageOf(rows[lb.guest]) > PP.GUEST_IDLE_MS) return { error: 'waiting for a second player', status: 409 };
				if (!lb.gready) return { error: 'your opponent is not ready', status: 409 };
				lb.m = freshMatch(lb, 1);
			}
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows) });
	}

	if (action === 'mtpvp-sync') {
		// my row: liveness + the summary the opponent's HUD shows (+ the end screen's jokers / deck)
		let lb = await store.get(LKEY(id));
		let rows = lb ? await rowsOf(lb) : {};
		if (!lb || !member(lb, username)) return json({ closed: true, removed: !!lb });
		if (!liveLobby(lb, rows)) return json({ closed: true });
		const prev = rows[username];
		const sum = body.sum && typeof body.sum === 'object' && !Array.isArray(body.sum) ? body.sum : null;
		if (sum && JSON.stringify(sum).length > PP.SUM_MAX) return json({ error: 'summary too large', max: PP.SUM_MAX }, 413);
		const endData = body.end && typeof body.end === 'object' && !Array.isArray(body.end) ? body.end : null;
		if (endData && JSON.stringify(endData).length > PP.END_MAX) return json({ error: 'end data too large', max: PP.END_MAX }, 413);
		const seq = Number.isSafeInteger(body.seq) ? body.seq : null;
		const changed = (sum && seq != null && (!prev || prev.seq !== seq)) || (endData && (!prev || JSON.stringify(prev.end) !== JSON.stringify(endData)));
		if (!prev || (changed && ageOf(prev) >= PP.MIN_WRITE_MS) || ageOf(prev) >= PP.BEAT_MS || (endData && !prev.end)) {
			rows[username] = await touchPlayer(id, prev, { ...(changed && sum ? { sum, seq } : {}), ...(endData ? { end: endData } : {}) });
		}
		// the forfeit clock and the pending death's "opponent left", evaluated by whoever polls
		if (lb.m && !lb.m.over) {
			const probe = { ...lb, m: JSON.parse(JSON.stringify(lb.m)) };
			if (housekeep(probe, rows)) {
				const r = await mutate((l, rr) => { rr[username] = rows[username]; if (!housekeep(l, rr)) return false; });
				if (!r.error) { lb = r.lb; rows = { ...r.rows, [username]: rows[username] }; }
			}
		}
		// presence: a waiting lobby with a free seat is joinable from the friends list (a match publishes its own)
		if (ctx.presence && !lb.m && lb.host === username) await ctx.presence(lb.guest ? 'micatropvp:full:' + lb.code : 'micatropvp:lobby:' + lb.code, 'Micatro lobby');
		const opp = other(lb, username);
		const oppRow = opp ? rows[opp] : null;
		const oppOut = opp ? { name: opp, age: oppRow ? Math.min(ageOf(oppRow), 86_400_000) : null, seq: oppRow ? oppRow.seq : null, ...(oppRow && body.oseq !== oppRow.seq ? { sum: oppRow.sum } : {}), ...(oppRow && oppRow.end && body.wantEnd ? { end: oppRow.end } : {}) } : null;
		if (body.v != null && Number(body.v) === lb.rev) return json({ unchanged: true, v: lb.rev, opp: oppOut, now });
		return json({ lobby: view(lb, rows), opp: oppOut, now });
	}

	// ---------------------------------------------------------------- the match referee
	const ante = Math.floor(+body.ante);
	const inMatch = (lb) => {
		if (!member(lb, username)) return { error: 'not in this lobby', status: 403, closed: true };
		if (!lb.m) return { error: 'the match has not started', status: 409 };
		return null;
	};

	// the round's blind (a client before protocol 2 sends no slot: its rounds were always the Boss)
	const slot = body.slot == null ? 'Boss' : String(body.slot);
	const bnum = SLOTS.includes(slot) && ante >= 1 && ante <= 1e6 ? blindNum(ante, slot) : 0;

	if (action === 'mtpvp-ready') {
		if (!bnum) return json({ error: 'bad blind' }, 400);
		const r = await mutate((lb, rows) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m;
			const changed = housekeep(lb, rows);
			if (m.over || m.pending) return changed ? undefined : false;
			if (!isPvpSlot(lb.opts, ante, slot)) return { error: 'that blind is not a Nemesis round', status: 409 };
			if (m.round && (m.round.b || blindNum(m.round.ante, 'Boss')) > bnum) return { error: 'that round is over', status: 409 };
			if (!m.round || (m.round.b || blindNum(m.round.ante, 'Boss')) < bnum) {
				if (m.round && !m.round.res && m.round.startAt) return { error: 'the last round is still being played', status: 409 };
				m.round = { ante, slot, b: bnum, ready: {}, startAt: 0, scores: {}, res: null };
				if (m.timer && m.timer.b !== bnum) m.timer = null;
			}
			const rd = m.round;
			if (rd.startAt) return changed ? undefined : false;  // (already counting down / playing)
			rd.ready[username] = !!body.ready;
			// un-READY pauses a Hurry timer this player started; READY by the timed player: they reached the Nemesis
			if (!body.ready && m.timer && m.timer.by === username) timerPause(m, now);
			if (m.players.every((p) => rd.ready[p])) {
				rd.startAt = now + PP.COUNTDOWN_MS;
				for (const p of m.players) rd.scores[p] = { s: '0', h: null };
				// (the round starts: no timer in a Nemesis round; skips count again from here)
				m.timer = null; m.sk = {};
			}
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	// the Hurry timer: {on: true} starts (or resumes) it on the opponent — only from READY at a Nemesis the opponent hasn't
	// readied for; {on: false} pauses it
	if (action === 'mtpvp-timer') {
		const r = await mutate((lb, rows) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m;
			const changed = housekeep(lb, rows);
			if (m.over || m.pending) return changed ? undefined : false;
			if (!lb.opts.timer || lb.opts.mode === 'survival') return { error: 'the timer is off in this lobby', status: 409 };
			const opp = other(lb, username), rd = m.round;
			if (body.on) {
				if (!rd || rd.startAt || !rd.ready[username]) return { error: 'press READY at the Nemesis first', status: 409 };
				if (rd.ready[opp]) return { error: 'your opponent is ready', status: 409 };
				if (!timerStart(m, lb.opts, now, username, opp, rd.b || blindNum(rd.ante, 'Boss')) && !changed) return false;
			} else if (!(m.timer && m.timer.by === username && timerPause(m, now)) && !changed) return false;
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	if (action === 'mtpvp-hand') {
		const score = String(body.score == null ? '' : body.score);
		const hands = Math.floor(+body.hands);
		const n = Math.floor(+body.n);   // (the report's number within the round: a retried older one arriving late is dropped)
		const hp = Math.max(0, Math.min(1000, Math.floor(+body.hp) || 0));   // (hands played this round: "hide score until you play")
		if (!bnum) return json({ error: 'bad blind' }, 400);
		if (!scoreKey(score)) return json({ error: 'bad score' }, 400);
		if (!(n >= 0 && n <= 1e6)) return json({ error: 'bad report number' }, 400);
		if (!(hands >= 0 && hands <= 1000)) return json({ error: 'bad hands' }, 400);
		const r = await mutate((lb) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m, rd = m.round;
			if (m.over) return false;
			if (!rd || (rd.b || blindNum(rd.ante, 'Boss')) !== bnum || !rd.startAt) return { error: 'no round to report to', status: 409 };
			if (rd.res) return false;                           // (decided: later hands change nothing)
			const cur = rd.scores[username] || {};
			if (cur.n != null && n <= cur.n) return false;
			rd.scores[username] = { s: score, h: hands, n, hp: Math.max(hp, cur.hp || 0) };
			const [a, b] = m.players;
			const res = resolve2p(rd.scores[a], rd.scores[b]);
			if (!res) return;
			const loser = res.tie ? '' : (res.loser === 'a' ? a : b);
			rd.res = { loser, at: now };
			m.hist.push({ ante, slot: rd.slot || 'Boss', s: { [a]: rd.scores[a].s, [b]: rd.scores[b].s }, loser });
			if (m.hist.length > 40) m.hist.splice(0, m.hist.length - 40);
			if (loser && loseLife(m, loser, 'pvp:' + bnum) && m.lives[loser] <= 0) end(m, m.players.find((x) => x !== loser), 'lives');
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	// a non-PvP blind's result: 'beat' | 'skip' (counts as beaten) | 'fail' (costs a life with deathOnLoss)
	if (action === 'mtpvp-blind') {
		const slot = String(body.slot || ''), result = String(body.result || '');
		if (!(ante >= 1 && ante <= 1e6) || !SLOTS.includes(slot) || !['beat', 'skip', 'fail'].includes(result)) return json({ error: 'bad blind result' }, 400);
		const key = ante + ':' + slot;
		const r = await mutate((lb, rows) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m;
			const changed = housekeep(lb, rows);
			if (m.over) return changed ? undefined : false;
			m.res[username] = m.res[username] || {};
			if (m.res[username][key] === 'f') return changed ? undefined : false;     // a failure is final
			if (m.res[username][key] && result !== 'fail') return changed ? undefined : false;
			m.res[username][key] = result === 'fail' ? 'f' : 'b';
			// the furthest blind beaten (or skipped) — Survival's progress; a skip is worth Hurry time
			if (result !== 'fail') (m.far = m.far || {})[username] = Math.max((m.far || {})[username] || 0, bnum);
			if (result === 'skip') timerSkip(m, lb.opts, now, username);
			const deathOnLoss = lb.opts.deathOnLoss || m.mode === 'survival';
			if (result === 'fail' && deathOnLoss && loseLife(m, username, key) && m.lives[username] <= 0 && !m.pending) {
				m.pending = { dead: username, key, at: now, far: (m.far || {})[username] || 0 };
				if (m.timer) m.timer = null;
			}
			settlePending(m, rows);
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	if (action === 'mtpvp-forfeit') {
		const r = await mutate((lb) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m;
			if (m.over) return false;
			// the dead player of a pending death leaving is not a forfeit (the opponent's blind decides)
			if (m.pending && m.pending.dead === username) { (m.left = m.left || {})[username] = 1; return; }
			// (a forfeit is not a leave: the pair can still rematch)
			end(m, m.players.find((x) => x !== username), 'forfeit');
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	if (action === 'mtpvp-rematch') {
		const r = await mutate((lb, rows) => {
			const e = inMatch(lb); if (e) return e;
			const m = lb.m;
			if (!m.over) return { error: 'the match is still on', status: 409 };
			const opp = other(lb, username);
			if (!opp || (m.left && m.left[opp]) || ageOf(rows[opp]) > PP.GRACE_MS) return { error: 'your opponent has left', status: 409 };
			m.rematch = m.rematch || {};
			if (m.rematch[username] && !body.cancel) return false;
			m.rematch[username] = !body.cancel;
			if (m.players.every((p) => m.rematch[p])) lb.m = freshMatch(lb, m.n + 1);
		});
		if (r.error) return fail(r);
		return json({ lobby: view(r.lb, r.rows), now });
	}

	return json({ error: 'unknown action' }, 400);

	// ---------------------------------------------------------------- helpers needing the actions' scope
	async function mutateAt(lid, fn) {
		for (let i = 0; i < 6; i++) {
			const lb = await store.get(LKEY(lid));
			const rows = lb ? await rowsOf(lb) : {};
			if (!liveLobby(lb, rows) && !(lb && lb.m)) return { error: 'that lobby has closed', status: 404, closed: true };
			if (!lb.m && lb.guest && lb.guest !== username && ageOf(rows[lb.guest]) > PP.GUEST_IDLE_MS && now - (lb.gat || 0) > PP.GUEST_IDLE_MS) { lb.guest = null; lb.gready = false; }
			const r = fn(lb, rows);
			if (r && r.error) return r;
			if (r === false) return { lb, rows };
			const prev = lb.rev || 0;
			lb.rev = prev + 1; lb.ts = now;
			if (await store.setIfRev(LKEY(lid), lb, prev)) return { lb, rows };
		}
		return { error: 'busy, try again', status: 503 };
	}
	// leave a lobby: the host of a waiting lobby closes it; a player in a live match forfeits it (a pending death's dead
	// player just goes); a guest of a waiting lobby frees the seat. Exact keys only.
	async function leaveLobby(lid) {
		const lb = await store.get(LKEY(lid));
		const cur = await store.get(UKEY(username));
		if (cur && cur.id === lid) await store.delete(UKEY(username));
		if (!lb || !member(lb, username)) return { ok: true };
		await store.delete(PKEY(lid, username));
		const r = await mutateAt(lid, (l) => {
			if (l.m && !l.m.over) {
				(l.m.left = l.m.left || {})[username] = 1;
				if (!(l.m.pending && l.m.pending.dead === username)) end(l.m, l.m.players.find((x) => x !== username), 'forfeit');
			}
			if (l.m) { (l.m.left = l.m.left || {})[username] = 1; }
			if (l.host === username) {
				if (!l.m || !l.guest || (l.m.left && l.m.left[l.guest])) l.closed = true;
				else { l.host = l.guest; l.guest = null; l.gready = false; }   // (the opponent keeps the finished lobby)
			} else if (l.guest === username) { l.guest = null; l.gready = false; }
		});
		if (r.lb && r.lb.closed) {
			const c = await store.get(CKEY(r.lb.code));
			if (c && c.id === lid) await store.delete(CKEY(r.lb.code));
		}
		// (a waiting lobby's "Join" leaves the friends list with it)
		if (ctx.presence && lb.host === username && !lb.m) await ctx.presence('', '');
		return { ok: true, closed: !!(r.lb && r.lb.closed) };
	}
}
