// ai_search.js — the computer player, looking ahead. ai.js picks each play by rules of thumb; this file takes the two
// decisions that decide matches (where this turn's Energy goes, and which attacks are queued at which targets), tries
// each candidate on copies of the match, plays those copies on with ai.js for every seat until the looking player's
// next turn has been played, and keeps the candidate whose copies end best.
//
// It does not cheat. A copy (engine.js fork) deals again everything the looking seat cannot see (the other players'
// hands, every deck's order) and flips its own coins, so nothing it learns is the real match's hidden cards or luck.
// The same copies are used for every candidate, so they are compared on equal luck. Everything else (setup, Trainers,
// evolving, retreating, answering a choice) is ai.js unchanged, and so is this file's answer whenever looking ahead is
// not possible.
import * as E from './engine/engine.js';
import { nextAction, executePlans, attachPlans } from './ai.js';

// copies: how many re-dealt copies each candidate is tried on; maxPlans: how many candidates; turns: how far (this seat's
// turns, counting this one); steps: a copy played on for longer than this is dropped; ms: on a slow device the candidates
// not yet tried when this much time has gone are left untried (the rule-of-thumb play is always tried first).
export const LOOK = Object.freeze({ copies: 4, maxPlans: 10, steps: 400, turns: 2, ms: 400 });

const seatToAct = S => (S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup && !p.eliminated) || {}).seat : S.current);
/** Play a copy on with ai.js until `stop(F)` or the match ends. false if it could not be played on. */
function playOn(F, stop, steps) {
	for (let n = 0; n < steps && !F.over && !stop(F); n++) {
		const seat = seatToAct(F); if (seat == null) return false;
		const banned = new Set(); let done = false;
		for (let t = 0; t < 12 && !done; t++) {
			const a = nextAction(E.view(F, seat), banned) || { t: 'execute', seat, commands: [null, null] };
			try { E.apply(F, a); done = true; } catch (e) { if (!e || !e.refused) return false; banned.add(JSON.stringify(a)); }
		}
		if (!done) return false;
	}
	return true;
}
/** How a position looks from `seat`: points first (a win or a loss beyond anything else), then what is left on the table. */
export function worth(F, seat) {
	const me = F.players[seat], others = F.players.filter(p => p.seat !== seat && !p.eliminated);
	if (F.over) return F.over.winner === seat ? 1e6 : F.over.winner == null ? 0 : -1e6;
	const table = p => [...p.active, ...p.bench].filter(Boolean).reduce((n, k) => n + 20 + k.energy.length * 12 - k.dmg * 0.25, 0);
	const lead = me.points - Math.max(0, ...others.map(p => p.points));
	return lead * 1000 + (me.eliminated ? -5e5 : 0) + table(me) - Math.max(0, ...others.map(table));
}
/** The play for `seat` in match `S` (never changed here). `banned`: plays the engine has refused this step. */
export function chooseAction(S, seat, banned = new Set()) {
	const base = nextAction(E.view(S, seat), banned);
	if (!base || S.over || S.pending || S.phase !== 'main' || S.current !== seat || (base.t !== 'execute' && base.t !== 'attach')) return base;
	let plans;
	try {
		const v = E.view(S, seat);
		plans = (base.t === 'execute' ? executePlans(v, seat) : attachPlans(v, seat)).filter(a => !banned.has(JSON.stringify(a)));
	} catch (e) { return base; }
	const key = JSON.stringify(base); if (!plans.some(a => JSON.stringify(a) === key)) plans.unshift(base);
	plans = [plans.find(a => JSON.stringify(a) === key), ...plans.filter(a => JSON.stringify(a) !== key)].slice(0, LOOK.maxPlans);   // (the rule-of-thumb play first: it wins a tie)
	if (plans.length < 2) return base;
	// far enough to see the answer: until this seat has played `turns` turns from here (this one, then the next) and it is its turn again
	const D = LOOK.turns, stop = F => F.current === seat && F.phase === 'main' && !F.pending && F.players[seat].turns >= S.players[seat].turns + D;
	let best = null; const clock = () => (typeof performance !== 'undefined' ? performance.now() : 0), t0 = clock();
	for (const plan of plans) {
		if (best && clock() - t0 > LOOK.ms) break;
		let sum = 0, n = 0;
		for (let c = 0; c < LOOK.copies; c++) {
			const F = E.fork(S, seat, c); if (!F) return base;
			try { E.apply(F, plan); } catch (e) { if (!e || !e.refused) return base; n = -1; break; }   // (a play the engine would refuse is not a candidate)
			if (!playOn(F, stop, LOOK.steps)) continue;
			sum += worth(F, seat); n++;
		}
		if (n <= 0) continue;
		const score = sum / n;
		if (!best || score > best.score + 1e-9) best = { score, plan };
	}
	return best ? best.plan : base;
}
