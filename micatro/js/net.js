// net.js — Micatro's account + multiplayer glue: live broadcasting of a run to
// friends, spectating a friend's run, the chat overlay, and the high-score board.
// Everything goes through the site's single API (POST /api/mp, server/mp.mjs):
//
//   publish-micatro  {snapshot?, label, seq, over, won}  → the runner's live view
//   micatro-state    {username, seq}                     → a FRIEND reads it (cap 10)
//   run-score        {mode:'micatro', score, ante, seed, back, stake, won}
//                    {mode:'micatro_modded', ..., mods:[ids]}  (a modded run: its own board)
//   run-leaderboard  {mode:'micatro' | 'micatro_modded'}  → {top, you}
//
// Write budget: the publisher bumps `seq` and sends the snapshot ONLY when the view
// changed; otherwise it sends a snapshot-less keep-alive every ~10s (the server
// treats a run as live for 45s and skips rewriting unchanged rows).
// Nothing here throws into the game: every network failure is swallowed/reported.
import * as MP from '/battlecards/mpmode.js';
import * as Chat from '/battlecards/chat.js';

const PUBLISH_MS = 1200;        // how often the publisher looks for a changed view
const KEEPALIVE_MS = 10_000;    // an unchanged view is re-announced this often (server: live for 45s)
const SNAPSHOT_MAX = 200_000;   // the server's cap (MICATRO_SNAPSHOT_MAX)
const POLL_FAST_MS = 1000, POLL_SLOW_MS = 2500, POLL_IDLE_MS = 5000;

export const isLoggedIn = () => MP.hasToken();
export const requireLogin = () => MP.requireLogin();
export const myName = () => MP.cachedState()?.username || null;
export const watchUrl = (user) => '/micatro/?spectate=' + encodeURIComponent(String(user || ''));

// ---------------------------------------------------------------- publishing
// startPublisher(getSnapshot, getLabel) → { stop(), finish({won}) → Promise, onWatchers(cb) → unsubscribe }
//   getSnapshot(): a JSON-able view of the run (what a spectator renders)
//   getLabel():    a short progress string, e.g. "Ante 3 · Big Blind" (≤48 chars shown)
// onWatchers(cb) calls cb(count, names) whenever the server's watcher list changes.
export function startPublisher(getSnapshot, getLabel) {
	const cbs = new Set();
	let watchers = 0, watcherNames = [];
	const noop = { stop() {}, finish: async () => {}, onWatchers(cb) { cbs.add(cb); return () => cbs.delete(cb); }, get watchers() { return watchers; }, get watcherNames() { return watcherNames; } };
	if (!isLoggedIn()) return noop;

	let seq = Date.now();       // monotonic across reloads, so a reloaded run never reuses a spectator's seq
	let seqJson = null;         // the view `seq` currently names
	let ackedJson = null;       // the view the server is known to hold
	let lastSentAt = 0, stopped = false, finished = false, inflight = null, timer = null, warnedBig = false;

	const read = () => {
		let snap = null, label = '';
		try { snap = getSnapshot(); } catch (e) { console.warn('[micatro/net] getSnapshot failed', e); }
		try { label = String(getLabel() ?? ''); } catch {}
		let json = 'null';
		try { json = JSON.stringify(snap ?? null); } catch (e) { console.warn('[micatro/net] snapshot is not JSON-able', e); }
		return { snap, label: label.slice(0, 48), json };
	};
	const setWatchers = (res) => {
		if (!res || !Array.isArray(res.watcherNames)) return;
		const names = res.watcherNames.slice(), n = +res.watchers || names.length;
		if (n === watchers && names.join(',') === watcherNames.join(',')) return;
		watchers = n; watcherNames = names;
		for (const cb of cbs) { try { cb(watchers, watcherNames); } catch {} }
	};
	async function push({ over = false, won = false } = {}) {
		const { snap, label, json } = read();
		const tooBig = json.length > SNAPSHOT_MAX;
		if (tooBig && !warnedBig) { warnedBig = true; console.warn('[micatro/net] snapshot over ' + SNAPSHOT_MAX + ' chars — not broadcast'); }
		const needSnap = !tooBig && json !== ackedJson;
		const now = Date.now();
		if (!needSnap && !over && now - lastSentAt < KEEPALIVE_MS) return; // nothing new, keep-alive not due
		if (needSnap && json !== seqJson) { seq++; seqJson = json; }
		const body = { seq, label, over, won: !!won };
		if (needSnap) body.snapshot = snap;
		lastSentAt = now;
		try {
			const res = await MP.call('publish-micatro', body, over && json.length < 60_000 ? { keepalive: true } : {});
			if (res && res.ok) { if (needSnap) ackedJson = json; setWatchers(res); }
		} catch { /* offline / timeout: the next tick retries (ackedJson unchanged) */ }
	}
	const loop = async () => {
		if (stopped) return;
		inflight = push();
		await inflight; inflight = null;
		if (!stopped) timer = setTimeout(loop, PUBLISH_MS);
	};
	timer = setTimeout(loop, 0);

	return {
		stop() { stopped = true; clearTimeout(timer); },
		// the run ended: one last push with over:true (spectators see the result; the
		// runner's presence drops back to plain "online"), then the publisher stops.
		async finish({ won = false } = {}) {
			if (finished) return;
			finished = true; stopped = true; clearTimeout(timer);
			if (inflight) await inflight.catch(() => {});
			await push({ over: true, won });
		},
		onWatchers(cb) { cbs.add(cb); return () => cbs.delete(cb); },
		get watchers() { return watchers; },
		get watcherNames() { return watcherNames; },
	};
}

// ---------------------------------------------------------------- spectating
// startSpectate(username, { onSnapshot(snapshot, meta), onStatus(status, info) }) → { stop() }
//   meta/info: { seq, label, over, won, watchers, watcherNames, room }
//   status: 'connecting' | 'live' | 'not-live' (runner isn't broadcasting; keeps checking)
//         | 'full' (info.max; retries every 5s) | 'over' (final; polling stops)
//         | 'forbidden' (not your friend; polling stops) | 'login' (no account) | 'offline' (network; retries)
// onStatus fires on every status change, and again on 'live' when the watcher list changes.
export function startSpectate(username, { onSnapshot = () => {}, onStatus = () => {} } = {}) {
	const who = String(username || '').trim().toLowerCase();
	let stopped = false, timer = null, seq = null, status = null, delay = POLL_FAST_MS, lastWatchSig = '';
	const meta = { seq: null, label: '', over: false, won: false, watchers: 0, watcherNames: [], room: 'u:' + who };
	const setStatus = (s, info = meta) => {
		const sig = s === 'live' ? (meta.watcherNames || []).join(',') + '|' + meta.label : '';
		if (s === status && sig === lastWatchSig) return;
		status = s; lastWatchSig = sig;
		try { onStatus(s, info); } catch (e) { console.warn('[micatro/net] onStatus threw', e); }
	};
	if (!isLoggedIn()) { setStatus('login', {}); return { stop() {} }; }
	if (!who) { setStatus('forbidden', {}); return { stop() {} }; }
	setStatus('connecting', {});

	const tick = async () => {
		if (stopped) return;
		let d;
		try { d = await MP.call('micatro-state', { username: who, seq }); }
		catch { d = null; }
		if (stopped) return;
		if (!d) { setStatus('offline', {}); delay = POLL_SLOW_MS; }
		else if (d.full) { setStatus('full', { max: d.max }); delay = POLL_IDLE_MS; }
		else if (d.error === 'slow down') { delay = POLL_IDLE_MS; }
		else if (d.error) { setStatus('forbidden', { error: d.error }); stopped = true; return; }
		else if (d.unchanged) {
			Object.assign(meta, { label: d.label ?? meta.label, over: !!d.over, won: !!d.won, watchers: d.watchers ?? meta.watchers, watcherNames: d.watcherNames || meta.watcherNames });
			delay = Math.min(POLL_SLOW_MS, delay + 500); // nothing new → ease off toward 2.5s
		} else if (d.snapshot == null && !d.seq) {
			seq = null; setStatus('not-live', {}); delay = POLL_SLOW_MS;
		} else {
			seq = d.seq;
			Object.assign(meta, { seq: d.seq, label: d.label || '', over: !!d.over, won: !!d.won, watchers: d.watchers || 0, watcherNames: d.watcherNames || [], room: d.room || meta.room });
			try { onSnapshot(d.snapshot, { ...meta }); } catch (e) { console.warn('[micatro/net] onSnapshot threw', e); }
			delay = POLL_FAST_MS;
		}
		if (d && !d.error && !d.full && (d.unchanged || d.snapshot != null || d.seq)) {
			if (meta.over) { setStatus('over', { ...meta }); stopped = true; return; }
			setStatus('live', { ...meta });
		}
		timer = setTimeout(tick, delay);
	};
	tick();
	return { stop() { stopped = true; clearTimeout(timer); } };
}

// ---------------------------------------------------------------- chat
// mountChat(container, { runner, spectator }) → { unmount(), clear(), el } | null
// Same rooms as Battlecards: the runner talks in 'u:<runner>' (friends read it);
// a spectator reads that room and chats with the other spectators in 'spec:<runner>'.
// The overlay is a fixed-position element; when `container` is given it's moved
// inside it (so the UI can own stacking/visibility).
export function mountChat(container, { runner, spectator = false } = {}) {
	if (!isLoggedIn()) return null;
	const r = String(runner || myName() || '').trim().toLowerCase();
	if (!r) return null;
	if (spectator) Chat.mount({ room: 'u:' + r, canPost: false, specRoom: 'spec:' + r });
	else Chat.mount({ room: 'u:' + r, canPost: true });
	const el = document.getElementById('mp-chat');
	if (container && el && el.parentNode !== container) container.appendChild(el);
	return { unmount: () => Chat.unmount(), clear: () => Chat.clear(), el };
}

// ---------------------------------------------------------------- leaderboard
// Scores are plain JS numbers that can overflow to Infinity (or a BigInt / numeric
// string from the engine): JSON can't carry Infinity, so it travels as the string
// 'Infinity' and the server clamps it to Number.MAX_VALUE. NaN is refused locally.
function wireScore(score) {
	let n = typeof score === 'bigint' ? Number(score) : typeof score === 'string' ? Number(score.trim()) : +score;
	if (Number.isNaN(n)) return null;
	if (n === Infinity) return 'Infinity';
	return Math.max(0, n);
}

/** A run's mod ids, cleaned + sorted (the board groups identical mod sets). */
export function modList(mods) {
	return [...new Set((Array.isArray(mods) ? mods : []).filter(m => typeof m === 'string' && m).map(String))].sort();
}

// submitScore({score, ante, seed, back, stake, won, mods}) → {ok, better, best, rank} | {error}
// A run with mods posts to the separate Modded board (mode 'micatro_modded') with its mod list.
export async function submitScore({ score, ante = 0, seed = '', back = '', stake = 0, won = false, mods = [] } = {}) {
	if (!isLoggedIn()) return { error: 'not logged in' };
	const s = wireScore(score);
	if (s == null) return { error: 'bad score' };
	const ml = modList(mods);
	const body = { mode: ml.length ? 'micatro_modded' : 'micatro', score: s, ante, seed: String(seed || ''), back: String(back || ''), stake, won: !!won };
	if (ml.length) body.mods = ml;
	try { return await MP.call('run-score', body); }
	catch (e) { return { error: 'offline' }; }
}

// fetchLeaderboard({limit, modded}) → { top: [{name, score, ante, seed, back, stake, won, when, mods?}], you: {...best, rank} | null, me }
// sorted by score (desc), then ante (desc), then earliest. The server keeps the top 100, returns 50.
// modded:true reads the Modded board (each row carries its mod list).
export async function fetchLeaderboard({ limit = 50, modded = false } = {}) {
	if (!isLoggedIn()) return { top: [], you: null, me: null, error: 'not logged in' };
	try {
		const d = await MP.call('run-leaderboard', { mode: modded ? 'micatro_modded' : 'micatro' });
		if (!d || d.error) return { top: [], you: null, me: myName(), error: d?.error || 'bad response' };
		return { top: (d.top || []).slice(0, Math.max(0, limit | 0)), you: d.you || null, me: myName() };
	} catch { return { top: [], you: null, me: myName(), error: 'offline' }; }
}
