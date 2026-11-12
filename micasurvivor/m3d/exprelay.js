// exprelay.js — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.37): a 3D run watched LIVE over
// the site's own lines. Owner, 2026-11-12: "just keep spectating": no new transport. So this is the 2D game's
// spectating, as it is on the server (server/mp.mjs publish-micasurvivor / micasurvivor-state, js/mica/spectate.js):
// no sockets; the player's page publishes and a friend's page polls.
//
//   the player   every 10 s it asks, with NO snapshot, whether a friend is watching (the server only reads then, and
//                keeps the "in a run" beacon that puts you in your friends' "live now" lists). While one is, it sends
//                a SNAPSHOT a second: that second's frames as the 3D page's relay bundles them (net.js bundle: you in
//                all ten, the enemies in two, the run's row), `{ m3d: 1, h, b }`. At the end, once more with `over`.
//   a friend     polls once a second, and hands each new snapshot to the page as the test room's relay would.
//
// The mode it publishes, `exp-threed`, is how the 2D game knows to send a watcher here (js/mica/spectate.js).
// Both ends look like the test room's BroadcastChannel to the page (postMessage / onmessage), so the page's watching
// code is the one P3n and P4 built and tested. Friends only, both ways; eight watchers at most (the server's rules).
//
// Pure: `call(action, body) -> Promise<{ ok, status, body }>` (G.MicaAccount.call) and the clock are handed in.

export const RK = { MODE: 'exp-threed', CHECK_MS: 10000, PUB_MS: 1000, POLL_MS: 1000, FULL_MS: 6000, OFF_MS: 3000, GONE_MS: 4000, CAP: 23000 };
/** A run's id for the server (8-16 hex). */
export function runId(cryptoObj) { const a = new Uint32Array(2); cryptoObj.getRandomValues(a); return (a[0].toString(16).padStart(8, '0') + a[1].toString(16).padStart(8, '0')).slice(0, 12); }

/** The player's end. o: { call, run (id), label, dex, now: () => ms } */
export class HostLink {
	constructor(o) { Object.assign(this, { call: o.call, run: o.run, label: o.label || '3D Expedition', dex: o.dex | 0, now: o.now, watchers: 0, names: [], seq: 0, lastAsk: -1e12, lastPub: -1e12, every: RK.PUB_MS, busy: false, done: false, latest: null, sent: 0, asks: 0, dropped: 0, onmessage: null }); }
	/** Is a friend watching? (The page builds frames only then.) */
	get watched() { return this.watchers > 0; }
	/** The newest second of frames (the page's relay message: '{"h":…,"b":…}'). */
	postMessage(text) { this.latest = text; }
	/** Call often (every frame): it asks or sends when it is time, one request at a time. */
	tick() {
		if (this.busy || this.done) return null;
		const t = this.now();
		if (this.watched && this.latest && t - this.lastPub >= this.every) return this.send(true, false);
		if (t - this.lastAsk >= RK.CHECK_MS) return this.send(false, false);
		return null;
	}
	async send(withSnap, over) {
		this.busy = true;
		let snapshot;
		if (withSnap && this.latest) { try { const m = JSON.parse(this.latest); snapshot = { m3d: 1, h: m.h, b: m.b }; } catch (e) { snapshot = undefined; } this.latest = null; }
		if (snapshot && JSON.stringify(snapshot).length > RK.CAP) { snapshot = undefined; this.dropped++; }   // (never over the server's size: that second is skipped)
		const body = { run: this.run, label: this.label, mode: RK.MODE, dex: this.dex, group: [], over: !!over };
		if (snapshot) { body.snapshot = snapshot; body.seq = ++this.seq; }
		let r = null;
		try { r = await this.call('publish-micasurvivor', body); } catch (e) { r = null; }
		const t = this.now(); this.lastAsk = t; if (snapshot) { this.lastPub = t; this.sent++; } else this.asks++;
		if (r && r.ok && r.body) { this.watchers = r.body.watchers | 0; this.names = r.body.watcherNames || []; this.every = Math.max(RK.PUB_MS, r.body.every | 0); }
		this.busy = false;
		return r;
	}
	/** The run is over: tell the server once (with the last frames, if a friend is watching). */
	async end() { if (this.done) return null; this.done = true; for (let i = 0; i < 40 && this.busy; i++) await new Promise((res) => setTimeout(res, 50)); return this.send(this.watched, true); }
	close() { this.done = true; }
}

/** A watching friend's end. o: { call, who, later: (fn, ms) => any (setTimeout) }. Set onmessage and onstatus, then start().
 *  status: 'live' | 'waiting' (in a run, no frames yet) | 'over' | 'gone' (not in a run) | 'not3d' (in the 2D game) |
 *          'notfriend' | 'full' | 'login' | 'offline' */
export class WatchLink {
	constructor(o) { Object.assign(this, { call: o.call, who: o.who, later: o.later, seq: null, status: null, stopped: false, polls: 0, got: 0, onmessage: null, onstatus: null }); }
	start() { return this.poll(); }
	postMessage() { /* a watcher sends nothing */ }
	close() { this.stopped = true; }
	async poll() {
		if (this.stopped) return;
		this.polls++;
		let r = null;
		try { r = await this.call('micasurvivor-state', { username: this.who, seq: this.seq }); } catch (e) { r = null; }
		if (this.stopped) return;
		const b = (r && r.body) || {};
		let next = RK.POLL_MS, st = this.status, stop = false;
		if (!r || r.status === 0) { st = 'offline'; next = RK.OFF_MS; }
		else if (r.status === 401) { st = 'login'; stop = true; }
		else if (r.status === 403 && b.full) { st = 'full'; next = RK.FULL_MS; }
		else if (r.status === 403) { st = 'notfriend'; stop = true; }
		else if (!r.ok) { st = 'offline'; next = RK.OFF_MS; }
		else if (b.snapshot) {
			this.seq = b.seq;
			if (b.snapshot.m3d) { st = b.over ? 'over' : 'live'; this.got++; if (this.onmessage) this.onmessage({ data: JSON.stringify({ h: b.snapshot.h, b: b.snapshot.b }) }); }
			else st = 'not3d';
			if (b.over) stop = true;
		} else if (b.unchanged) st = b.over ? 'over' : 'live';
		else if (b.over) { st = 'over'; stop = true; }
		else if (b.live === false) { st = 'gone'; next = RK.GONE_MS; }
		else if (b.waiting) st = b.mode === RK.MODE ? 'waiting' : 'not3d';
		this.status = st;
		if (this.onstatus) this.onstatus(st, b);
		if (stop) { this.stopped = true; return; }
		this.later(() => this.poll(), next);
	}
}
/** What a watcher's screen says of each status. */
export const SAYS = { waiting: 'Waiting for the run…', over: 'The run is over.', gone: 'Not in a run right now.', not3d: 'Playing the 2D game: watch from MicaSurvivor\'s own page.', notfriend: 'You can only watch a friend (you must both have added each other).', full: 'Eight friends are watching already.', login: 'Log in to Magepunk to watch a friend.', offline: 'No answer from the server; trying again…' };
