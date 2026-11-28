// ai.js — the computer painters. Deterministic (its only dice come from the match's seed and move count), so a replay or
// the server's referee plays them exactly as the page did. It reads the board as everyone sees it: never a hand but its own.
//   normal   one step ahead: every legal action is tried on a copy of the match and the best board taken; it passes when
//            nothing makes the board better. Asked about a Newspaper, it uses one when the throw would cost it.
//   easy     the same, but 2 times in 5 it does something at random (or passes), and it never uses a Newspaper.
import { act, legal, clone, trueColor, inPlay, onCanvas, alivePets, whereIs, toAct, playerOf, PALETTE } from './rules.js';
import { makeRng } from '../../overworld/rules/rng.js';

const WIN = 1e6;
/** How good the board is for `seat` (bigger is better). */
export function score(S, seat) {
	if (S.over) return S.over.winner === seat ? WIN : -WIN;
	const side = (s) => {
		const P = playerOf(S, s);
		if (!P || P.out) return 0;
		let v = onCanvas(S, s).length * 100;
		for (const u of alivePets(S, s)) {
			const w = whereIs(S, u), m = trueColor(S, u);
			if (w.zone === 'palette' && w.top) v += 12 + (m.c ? 30 : 0) - (m.wipe ? 25 : 0);
			else if (w.zone === 'extra') v += 6;
			else if (w.zone === 'canvas' && !w.top) v += 8;
			// (ammunition: a card on a symbol is something to throw next turn, a step this one-step look-ahead would not see)
			if (w.top && (w.zone === 'palette' || w.zone === 'canvas')) v += Math.min(2, S.pets[u].slots[0].length + S.pets[u].slots[1].length) * 9;
		}
		v += Math.min(P.hand.length, 6) * 2;
		if (onCanvas(S, s).length === 2) v += 60;   // (one away)
		return v;
	};
	const me = side(seat);
	const rivals = S.players.filter((p) => p.seat !== seat && !p.out).map((p) => side(p.seat));
	return me - (rivals.length ? Math.max(...rivals) * 0.9 + rivals.reduce((a, b) => a + b, 0) * 0.1 : 0);
}
/** Try an action on a copy; a throw that would wait on a Newspaper is assumed to land. -> the copy */
function tryAct(S, seat, a) {
	const T = clone(S);
	if (act(T, seat, a)) return null;
	for (let i = 0; i < 4 && T.pending; i++) act(T, T.pending.ask[0], { t: 'let' });
	return T;
}
/** The computer's next action for `seat` (who must be the one to act). */
export function choose(S, seat, level = 'normal') {
	const list = legal(S, seat);
	if (!list.length) return null;
	const rng = makeRng(S.seed + ':ai:' + seat + ':' + S.n);
	if (S.pending) {
		const paper = list.find((a) => a.t === 'paper');
		if (!paper || level === 'easy') return { t: 'let' };
		const land = tryAct(S, seat, { t: 'let' });
		const T = clone(S); act(T, seat, paper);
		return land && score(land, seat) < score(T, seat) - 20 ? paper : { t: 'let' };
	}
	if (level === 'easy' && rng() < 0.4) return list[Math.floor(rng() * list.length)];
	const base = score(S, seat);
	let best = null, bestV = base + 1;
	for (const a of list) {
		if (a.t === 'pass') continue;
		const T = tryAct(S, seat, a);
		if (!T) continue;
		const v = score(T, seat) + (a.t === 'extra' ? 1 : 0);
		if (v > bestV) { best = a; bestV = v; }
	}
	return best || { t: 'pass' };
}
/** Play every computer seat whose turn (or answer) it is, until a person must act or the match is over. -> how many actions. */
export function runCpus(S, levelOf = (seat) => (playerOf(S, seat) || {}).cpu, onAct = null, max = 200) {
	let n = 0;
	for (; n < max && !S.over; n++) {
		const seat = toAct(S), lv = seat && levelOf(seat);
		if (!lv) break;
		const a = choose(S, seat, lv);
		if (!a || act(S, seat, a)) { act(S, seat, S.pending ? { t: 'let' } : { t: 'pass' }); if (onAct) onAct(seat, S.pending ? { t: 'let' } : { t: 'pass' }); continue; }
		if (onAct) onAct(seat, a);
	}
	return n;
}
export { inPlay, PALETTE };
