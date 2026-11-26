// tvdrive.js — TV mode plays a REPLAY by itself (owner, 2026-11-25: "I shouldn't need to hit play, it should just play
// and automatically go to the next one"). The replay sits in TV mode's frame, which takes no clicks and no keys, and
// several viewers open paused: nothing could ever start them. So TV mode drives the viewer itself, through the page
// globals each one already has (the frame is this site's own page), and reads when it has ended.
//
//   readReplay(kind, win)  ->  null while the viewer is not up yet, else
//       { playing, ended, at, total, kick }     at/total: where it is (null when the viewer has no such number)
//                                               kick():   start it playing (only called when it is neither)
//
// A viewer this file cannot read (no global, a new game) is left to play by itself: TV mode then moves on by its clock.
const btnClick = (win, sel) => { const b = win.document.querySelector(sel); if (b) b.click(); return !!b; };
const num = (v) => (Number.isFinite(+v) ? +v : null);

const READERS = {
	// (battlecards and mail: the bar's ▶; __replay is read-only)
	battlecards: (win) => { const r = win.__replay; if (!r || !(r.total > 0)) return null; const last = r.idx >= r.total - 1; return { playing: !!r.playing, ended: last && !r.playing, at: r.idx, total: r.total - 1, kick: () => btnClick(win, '#rb-play') }; },
	pokechess: (win) => { const r = win.__pokechess && win.__pokechess.replay; if (!r || !(r.n > 0)) return null; const last = r.i >= r.n - 1; return { playing: !!r.playing, ended: last && !r.playing, at: r.i, total: r.n - 1, kick: () => win.__pokechess.key && win.__pokechess.key('z') }; },
	// (three viewers behind one link: a battle, a Tower Defense run, a Mystery Maze run)
	poketactica: (win) => {
		const T = win.__poketactica; if (!T || !T.ready) return null;
		const td = T.td && T.td.T, mm = T.mm && T.mm.M;
		if (td && td.mode === 'watch' && td.S) return { playing: !td.paused && !td.ended, ended: !!td.ended, at: null, total: null, kick: () => { td.paused = false; } };
		if (mm && mm.mode === 'watch' && mm.S) return { playing: !mm.paused && !mm.ended, ended: !!mm.ended, at: null, total: null, kick: () => { mm.paused = false; } };
		const rp = T.P && T.P.rp; if (!rp || !rp.rec || !T.replayPlay) return null;
		const total = rp.rec.actions.length, last = rp.k >= total;
		return { playing: !!rp.playing, ended: last && !rp.playing, at: rp.k, total, kick: () => T.replayPlay(true) };
	},
	micatro: (win) => { const r = win.__micatro && win.__micatro.replay; if (!r || !(r.total > 0)) return null; return { playing: !!r.playing, ended: !!r.ended, at: num(r.index), total: num(r.total), kick: () => r.play && r.play() }; },
	// (Pocket has no global for it: the bar's own button and its "12 / 40")
	pocket: (win) => {
		const bar = win.document.querySelector('.pe-replaybar'); if (!bar) return null;
		const m = /(\d+)\s*\/\s*(\d+)/.exec((bar.querySelector('span') || {}).textContent || ''); if (!m) return null;
		const b = [...bar.querySelectorAll('button')].find((x) => /^(Play|Pause)$/.test(x.textContent.trim()));
		const playing = !!b && b.textContent.trim() === 'Pause', at = +m[1], total = +m[2];
		return { playing, ended: at >= total && !playing, at, total, kick: () => { if (b && !playing) b.click(); } };
	},
	journey: (win) => { const v = win.__owFollow && win.__owFollow.view; if (!v || !v.tape) return null; const n = ((v.tape.frames || []).length || 1) - 1, last = v.i >= n; return { playing: !!v.playing, ended: last && !v.playing, at: num(v.i), total: n, kick: () => win.__owFollow.key && win.__owFollow.key('z') }; },
	micasurvivor: (win) => { const w = win.G && win.G.WatchUI; if (!w || w.mode !== 'replay') return null; return { playing: !!w.playing, ended: !!w.done, at: null, total: null, kick: () => { if (!w.playing && !w.done && w.togglePlay) w.togglePlay(); } }; },
	micasurvivor3d: (win) => { const r = win.__m3d && win.__m3d.replay; if (!r || !(r.end > 0)) return null; const ended = r.at >= r.end; return { playing: !ended, ended, at: num(r.at), total: num(r.end), kick: () => {} }; },
	scoundrel: (win) => stepper(win, win.__scoundrel),
	pears: (win) => stepper(win, win.__pears),
};
READERS.mail = READERS.battlecards;
/** Scoundrel and Pair of Pears: replayAt() of replayTotal, and the bar's own Play button (its class says which it is). */
function stepper(win, T) {
	if (!T || !T.replayAt || !(T.replayTotal > 0)) return null;
	const b = win.document.querySelector('.b-rp-play'); if (!b) return null;
	const at = T.replayAt(), total = T.replayTotal, playing = /pause|⏸/i.test(b.textContent);
	return { playing, ended: at >= total && !playing, at, total, kick: () => { if (!playing) b.click(); } };
}

/** What the replay in the frame is doing; null while it is not up (or it is a kind this file does not know). */
export function readReplay(kind, win) {
	const f = READERS[kind]; if (!f || !win) return null;
	try { return f(win); } catch (e) { return null; }   // (the page is still loading, or it moved on: not up)
}
export const knowsReplay = (kind) => !!READERS[kind];

// ---------- the clock of one replay on TV ----------
// A replay plays to its END, then TV mode moves on. Three things keep one replay from holding the channel:
//   UP_MS     the viewer never comes up (a replay this version cannot play, a page that failed): on to the next
//   STALL_MS  it is up, not ended, and where it is has not changed for this long, kicks and all: on to the next
//   MAX_MS    a very long run: on to the next after this much of it
export const TV_REPLAY = { POLL_MS: 500, UP_MS: 25_000, STALL_MS: 20_000, MAX_MS: 8 * 60_000, END_MS: 2500, KICK_MS: 1500 };

/**
 * One look at the replay in the frame. `st` is kept between looks ({} at the start of a replay); `now` is the time.
 * Says what TV mode should do: 'wait', 'next' (with why), and how far through it is (0..1, or null when it cannot be told).
 */
export function tvReplayTick(st, r, now, C = TV_REPLAY) {
	if (st.t0 == null) { st.t0 = now; st.moved = now; st.kicked = -1e9; }
	if (!r) return now - st.t0 >= C.UP_MS && !st.up ? { do: 'next', why: 'never came up' } : now - st.t0 >= C.MAX_MS ? { do: 'next', why: 'too long' } : { do: 'wait', part: null };
	st.up = true;
	const part = r.total > 0 && r.at != null ? Math.max(0, Math.min(1, r.at / r.total)) : null;
	if (r.ended) { if (st.endAt == null) st.endAt = now; return now - st.endAt >= C.END_MS ? { do: 'next', why: 'ended' } : { do: 'wait', part: 1 }; }
	st.endAt = null;
	if (r.at !== st.at || (r.at == null && r.playing)) { st.at = r.at; st.moved = now; }
	if (!r.playing && now - st.kicked >= C.KICK_MS) { st.kicked = now; try { r.kick(); } catch (e) { /* not ready: the next look tries again */ } }
	if (now - st.moved >= C.STALL_MS) return { do: 'next', why: 'stalled' };
	if (now - st.t0 >= C.MAX_MS) return { do: 'next', why: 'too long' };
	return { do: 'wait', part };
}
