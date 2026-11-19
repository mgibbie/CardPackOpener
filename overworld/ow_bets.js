// ow_bets.js — the overworld's side of spectator bets (owner, 2026-11-19: "let spectators make bets": stars, a parimutuel
// pool, no limit, every kind of game, never on your own game, friends only). The rules and the money are the server's
// (server/bets.mjs, OW_KIND); the widget is site/bets.js. This says what can be bet on right now, as a REPORT
// {run, prog, md, el, res?} that rides along on calls the overworld makes anyway:
//   - a battle (wild, trainer, a Gym Leader / Elite Four / Champion, the Safari's) or a Battle Frontier run: on its
//     broadcast to friends (ow_frontier.js frontierPublish -> publish-factory)
//   - a minigame with a clear yes / no (Voltorb Flip, a Contest), or a mail battle: on the live-follow check
//     (ow_worldcast.js -> publish-world)
//   - a live battle against a friend needs nothing: the server reads its own match row
// run: the instance's own id; prog: how far it has got (only up to its milestone, so it changes a few times at most);
// md: which kind (server/bets.mjs OW_KIND); el: how long it has been going; res: 'win' | 'lose' | 'void' (no result: an
// escape) once there is one.
// The answers say how many stars ride on it: the player's "★ N riding on this game" badge (site/bets.js riding). The
// spectator views (factoryspec.js, pvp.js watching, ow_follow.js) mount the Bets chip with watchBets(runner).
import * as MP from '../battlecards/mpmode.js';
import { battle } from './ow_core.js';

const ids = new WeakMap();   // a battle / a Voltorb Flip board / a contest -> { run, t0 }
const newRun = p => p + Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36);
function idOf(obj, p) { let r = ids.get(obj); if (!r) { r = { run: newRun(p), t0: Date.now() }; ids.set(obj, r); } return r; }
const elOf = r => Math.max(0, Date.now() - r.t0);

// ---------------------------------------------------------------- a battle
/** What kind of battle it is (server/bets.mjs OW_KIND): the Safari's, a boss (a Gym Leader, the Elite Four, a Champion, a
 *  rival: the battle's info.boss), any other trainer, or a wild Pokémon. */
export const battleKind = a => a.safari ? 'safari' : a.isTrainer ? (a.info && a.info.boss ? 'boss' : 'trainer') : 'wild';
/** The battle's result as a bet's: a win or a CATCH wins; a blackout loses; an escape (either side), or a battle that went
 *  away without one, is no result (every stake back). The Safari's encounter is caught or not: anything else loses. */
export function battleRes(md, result) {
	if (md === 'safari') return result === 'caught' ? 'win' : result ? 'lose' : 'void';
	return result === 'victory' || result === 'caught' ? 'win' : result === 'defeat' ? 'lose' : 'void';
}
let lastBattle = null;   // { a, run, t0, md }: the battle last reported, so its result can still be read once it is gone
/** The battle on screen as a bet report, or (over: its broadcast's last push) the one that just ended, with its result. */
export function battleReport(over) {
	const a = battle.active;
	if (a && !over) {
		const r = idOf(a, 'b');
		lastBattle = { a, ...r, md: battleKind(a) };
		const res = a.result ? battleRes(lastBattle.md, a.result) : null;   // (the result is known while its last line shows)
		return { run: r.run, prog: Math.min(2, (a.turnCount | 0) + 1), md: lastBattle.md, el: elOf(r), ...(res ? { res } : {}) };
	}
	const l = lastBattle;
	if (!l || !over) return null;
	return { run: l.run, prog: 2, md: l.md, el: elOf(l), res: battleRes(l.md, l.a.result) };
}

// ---------------------------------------------------------------- a Battle Frontier run
let fr = null;   // { run, t0, md, goal, bouts, best, ended }
/** A facility's challenge begins: one market on the whole run. Its goal: every round of a fixed-round facility (the Dome,
 *  the Arena, the Battle Tents), else a streak of 7 (the streak that meets the facility's Brain). */
export function frontierBegin(cfg) {
	const cup = !!cfg && Number.isFinite(cfg.rounds);
	fr = { run: newRun('f'), t0: Date.now(), md: cup ? 'frontier-cup' : 'frontier', goal: cup ? cfg.rounds : 7, bouts: 0, best: 0, ended: false };
}
/** A bout was decided (won: the run's streak is now `streak`). */
export function frontierBout(won, streak) { if (!fr) return; fr.bouts++; if (won) fr.best = Math.max(fr.best, streak | 0); }
/** The run ended (its broadcast's last push carries the result, then the run is forgotten). */
export function frontierEnd() { if (fr) fr.ended = true; }
export const frontierOn = () => !!fr;
/** The run as a bet report: won the moment the goal is reached (the run goes on), lost if it ends first. */
export function frontierReport() {
	if (!fr) return null;
	const res = fr.best >= fr.goal ? 'win' : fr.ended ? 'lose' : null;
	const rep = { run: fr.run, prog: Math.min(1, fr.bouts), md: fr.md, el: elOf(fr), ...(res ? { res } : {}) };
	if (fr.ended) fr = null;
	return rep;
}

// ---------------------------------------------------------------- a minigame, a mail battle (publish-world)
let held = null;   // { obj, rep, forfeit }: the minigame last reported while on screen
let pend = null;   // a result not yet delivered (the minigame has left the screen)
/** What is on screen to bet on, from the minigames' own state (ow_worldcast.js passes them: { vfMenu, contestMenu, pvp }). */
function liveGame({ vfMenu, contestMenu, pvp }) {
	const g = vfMenu && vfMenu.open && vfMenu.game;
	if (g && Array.isArray(g.board)) {
		const r = idOf(g, 'v'), res = g.phase === 'won' ? 'win' : g.phase === 'lost' ? 'lose' : null;
		return { obj: g, forfeit: g.phase === 'play', rep: { run: r.run, prog: Math.min(2, (g.flips | 0) + (g.phase === 'lost' ? 1 : 0)), md: 'vflip', el: elOf(r), ...(res ? { res } : {}) } };
	}
	const st = contestMenu && contestMenu.st;
	if (st && Number.isInteger(st.playerIndex)) {
		const r = idOf(st, 'c'), res = st.done ? (st.winner === st.playerIndex ? 'win' : 'lose') : null;
		return { obj: st, forfeit: false, rep: { run: r.run, prog: Math.min(1, st.appealNumber | 0), md: 'contest', el: elOf(r), ...(res ? { res } : {}) } };
	}
	const a = pvp && pvp.active;
	if (a && a.async && !a.spectator && /^[A-Z]{12}$/.test(String(a.matchId || ''))) return { obj: a, forfeit: false, rep: { run: a.matchId, am: a.matchId, prog: 0 } };   // (its match row decides)
	return null;
}
/** The report for publish-world: the minigame on screen, or the result of the one that just left it (leaving a Voltorb
 *  Flip board mid-round forfeits it, as the game does). */
export function gameReport(state) {
	const live = liveGame(state);
	if (live) {
		if (held && held.obj !== live.obj) leave();
		held = live;
		if (live.rep.res) pend = live.rep;
		return live.rep;
	}
	if (held) leave();
	return pend;
}
function leave() { if (held && !held.rep.res && held.forfeit) pend = { ...held.rep, res: 'lose' }; held = null; }
/** publish-world took the report: a result, once delivered, is not sent again. */
export function gameSent(rep) { if (rep && rep.res && pend && pend.run === rep.run) pend = null; }

// ---------------------------------------------------------------- what the player sees, and the spectator's chip
const BETS = () => import('../site/bets.js');
const riding = {};   // source ('cast' | 'world' | 'pvp') -> the stars its last answer said ride on it
export const ridingNow = () => Math.max(0, ...Object.values(riding));
/** An answer said n stars ride on this source's game: the player's "★ N riding on this game" badge. */
export function showRiding(src, n) {
	const was = ridingNow();
	riding[src] = Math.max(0, Math.floor(+n) || 0);
	const now = ridingNow();
	if (now !== was) BETS().then(B => B.riding(now)).catch(() => { });
}
/** A spectator view is watching `runner`: the Bets chip for whatever can be bet on in their game. */
let seen = null, openAt = 0;
export function watchBets(runner) {
	if (!runner) return;
	BETS().then(B => B.watch({ game: 'overworld', runner, call: MP.call })).catch(() => { });
	if (!seen) seen = setInterval(() => { if (panelUp()) openAt = Date.now(); }, 100);
}
export function unwatchBets() {
	if (seen) { clearInterval(seen); seen = null; }
	BETS().then(B => B.unwatch()).catch(() => { });
}
const panelUp = () => typeof document !== 'undefined' && !!document.getElementById('bets-panel');
/** The Bets panel is open, or was a moment ago: it has the keyboard and the controller, so the view underneath must not
 *  also take the press (X / B closes the panel; the same press must not also leave the view, whichever hears it first). */
export const betsPanelOpen = () => panelUp() || Date.now() - openAt < 300;
