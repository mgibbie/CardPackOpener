// tv_replay_drive_test.mjs — TV mode plays a replay by itself and goes to the next one at its end (watch/tvdrive.js;
// owner, 2026-11-25: "I shouldn't need to hit play, it should just play and automatically go to the next one").
// Each game's viewer is read through its own page globals: here each is a stand-in window with those globals, and the
// clock of one replay is run by hand. (The real thing, a battle replay in the real frame: poketactica_spectate_replay_test.)
//   node overworld/tests/tv_replay_drive_test.mjs
import { readReplay, knowsReplay, tvReplayTick, TV_REPLAY } from '../../watch/tvdrive.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const doc = (map = {}) => ({ querySelector: (sel) => map[sel] || null, querySelectorAll: () => [] });

// ---------- every game the feed carries has a reader ----------
for (const g of ['battlecards', 'pokechess', 'poketactica', 'micatro', 'pocket', 'journey', 'mail', 'micasurvivor', 'micasurvivor3d', 'scoundrel', 'pears']) A(knowsReplay(g), g + ' has a reader');
A(!knowsReplay('overworld') && readReplay('overworld', { document: doc() }) === null, 'the overworld\'s factory replay has none (it plays by itself; TV mode keeps its clock for it)');
A(readReplay('battlecards', { document: doc() }) === null && readReplay('poketactica', {}) === null && readReplay('pocket', { document: doc() }) === null, 'a viewer that is not up yet reads as null, without throwing');

// ---------- Battlecards: opens paused; the kick is the bar's own play button ----------
{
	let clicks = 0; const r0 = { idx: 0, total: 30, playing: false };
	const win = { __replay: r0, document: doc({ '#rb-play': { click: () => { clicks++; r0.playing = true; } } }) };
	let r = readReplay('battlecards', win);
	A(r && !r.playing && !r.ended && r.at === 0 && r.total === 29, 'Battlecards opens paused on its first frame', r);
	r.kick(); A(clicks === 1 && readReplay('battlecards', win).playing, 'the kick presses its play button');
	r0.idx = 29; r0.playing = false; r = readReplay('mail', win);
	A(r.ended, 'on its last frame and stopped: ended (a mail game\'s replay is the same viewer)');
}
// ---------- Poketactica: a battle (paused), a Tower Defense run and a Mystery Maze run (both play by themselves) ----------
{
	const P = { rp: { rec: { actions: new Array(10) }, k: 0, playing: false } };
	const T = { ready: true, P, td: { T: { mode: 'play' } }, mm: { M: { mode: 'play' } }, replayPlay: (on) => { P.rp.playing = on; } };
	let r = readReplay('poketactica', { __poketactica: T });
	A(r && !r.playing && !r.ended && r.total === 10, 'a Poketactica battle replay opens paused', r);
	r.kick(); A(P.rp.playing, 'the kick starts it');
	P.rp.k = 10; P.rp.playing = false; A(readReplay('poketactica', { __poketactica: T }).ended, 'after its last action: ended');
	T.td.T = { mode: 'watch', S: {}, paused: false, ended: false };
	r = readReplay('poketactica', { __poketactica: T }); A(r.playing && !r.ended && r.at === null, 'a Tower Defense replay is read from its own clock (playing)');
	T.td.T.ended = true; A(readReplay('poketactica', { __poketactica: T }).ended, 'and its end');
	T.td.T = { mode: 'play' }; T.mm.M = { mode: 'watch', S: {}, paused: true, ended: false };
	r = readReplay('poketactica', { __poketactica: T }); r.kick(); A(T.mm.M.paused === false, 'a Mystery Maze replay that is paused is started');
}
// ---------- Pocket: no global, its bar ----------
{
	const b = { textContent: 'Play', click() { this.textContent = 'Pause'; } }, span = { textContent: '0 / 40' };
	const bar = { querySelector: (s) => (s === 'span' ? span : null), querySelectorAll: () => [{ textContent: '⏮' }, b] };
	const win = { document: doc({ '.pe-replaybar': bar }) };
	let r = readReplay('pocket', win); A(r && !r.playing && r.at === 0 && r.total === 40, 'Pocket opens paused at 0 / 40', r);
	r.kick(); A(readReplay('pocket', win).playing, 'the kick presses Play');
	span.textContent = '40 / 40'; b.textContent = 'Play'; A(readReplay('pocket', win).ended, '40 / 40 and stopped: ended');
}
// ---------- the ones that play by themselves: only their end is read ----------
{
	A(readReplay('pokechess', { __pokechess: { replay: { i: 3, n: 20, playing: true } } }).playing && readReplay('pokechess', { __pokechess: { replay: { i: 19, n: 20, playing: false } } }).ended, 'PokéChess: playing, and its end');
	A(readReplay('micatro', { __micatro: { replay: { total: 50, index: 50, playing: false, ended: true } } }).ended && !readReplay('micatro', { __micatro: { replay: { total: 50, index: 5, playing: true, ended: false } } }).ended, 'Micatro: its own ended flag');
	A(readReplay('journey', { __owFollow: { view: { tape: { frames: new Array(8) }, i: 7, playing: false } } }).ended, 'a journey: its last frame');
	A(readReplay('micasurvivor3d', { __m3d: { replay: { at: 90, end: 90 } } }).ended && readReplay('micasurvivor', { G: { WatchUI: { mode: 'replay', playing: false, done: true } } }).ended, 'MicaSurvivor, 2D and 3D: their ends');
	const btn = { textContent: '▶ Play', click() { this.textContent = '⏸ Pause'; } };
	const win = { __pears: { replayAt: () => 0, replayTotal: 12 }, document: doc({ '.b-rp-play': btn }) };
	readReplay('pears', win).kick(); A(readReplay('pears', win).playing, 'Pair of Pears (and Scoundrel): the bar\'s Play is pressed');
}

// ---------- the clock of one replay ----------
{
	const C = TV_REPLAY;
	// it opens paused: kicked, plays, ends, and TV mode moves on a moment later
	let st = {}, kicks = 0, t = 0;
	const r = { playing: false, ended: false, at: 0, total: 10, kick: () => { kicks++; r.playing = true; } };
	A(tvReplayTick(st, null, t).do === 'wait', 'not up yet: wait');
	let out = tvReplayTick(st, r, (t += 500)); A(kicks === 1 && out.do === 'wait' && out.part === 0, 'up and paused: it is kicked at once');
	for (let i = 1; i <= 10; i++) { r.at = i; out = tvReplayTick(st, r, (t += 3000)); }
	A(kicks === 1 && out.part === 1, 'while it plays it is left alone, and the bar follows it', [kicks, out]);
	r.playing = false; r.ended = true;
	A(tvReplayTick(st, r, (t += 500)).do === 'wait' && tvReplayTick(st, r, (t += C.END_MS)).do === 'next', 'ended: its last frame is held a moment, then the next one');
	A(tvReplayTick(st, r, t).why === 'ended', '(said as "ended")');
	// a kick that does not take is tried again, not more often than KICK_MS
	st = {}; kicks = 0; t = 0; const dud = { playing: false, ended: false, at: 0, total: 10, kick: () => { kicks++; } };
	for (let i = 0; i < 12; i++) tvReplayTick(st, dud, (t += 500));
	A(kicks >= 3 && kicks <= 5, 'a kick that does not take is tried again (every ' + C.KICK_MS + ' ms)', kicks);
	// ...and a replay that never moves does not hold the channel
	let o2 = null; while (t < C.STALL_MS + 2000) o2 = tvReplayTick(st, dud, (t += 500));
	A(o2.do === 'next' && o2.why === 'stalled', 'a replay that never moves: on to the next after ' + C.STALL_MS / 1000 + ' s', o2);
	// a viewer that never comes up
	st = {}; t = 0; let o3 = null; while (t <= C.UP_MS) o3 = tvReplayTick(st, null, (t += 500));
	A(o3.do === 'next' && o3.why === 'never came up', 'a viewer that never comes up: on to the next after ' + C.UP_MS / 1000 + ' s', o3);
	// a very long run
	st = {}; t = 0; const long = { playing: true, ended: false, at: 0, total: 100000, kick() {} }; let o4 = null;
	while (t <= C.MAX_MS) { long.at++; o4 = tvReplayTick(st, long, (t += 500)); }
	A(o4.do === 'next' && o4.why === 'too long', 'a very long run: on to the next after ' + C.MAX_MS / 60000 + ' minutes', o4);
	// one with no position (a Tower Defense run): playing counts as moving
	st = {}; t = 0; const td = { playing: true, ended: false, at: null, total: null, kick() {} }; let o5 = null;
	while (t < C.STALL_MS * 2) o5 = tvReplayTick(st, td, (t += 500));
	A(o5.do === 'wait' && o5.part === null, 'a replay with no position that is playing is not taken for stalled', o5);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
