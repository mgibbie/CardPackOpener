// engine/actionlog.js — action log, replay dispatcher, trace shrinker (PR 16).
//
// An ACTION is a plain JSON record of one public-API call:
//   { k: 'play', pi, uid, target, choice, position }   → playCard
//   { k: 'attack', pi, uid, target }                   → attack
//   { k: 'heroAttack', pi, target }                    → heroAttack
//   { k: 'power', pi, uid, target }                    → useHeroPower
//   { k: 'endTurn' }                                   → endTurn
//   { k: 'pick', id } / { k: 'ask', yes } / { k: 'scry', ids }
//   { k: 'dredge', id } / { k: 'discard', uids } / { k: 'sac' }
//   { k: 'respond', pi, uid, target } / { k: 'pass', pi }
//   { k: 'trade', pi, uid } / { k: 'prepare', pi, uid }
//
// dispatch() is the ONE mapping from records to engine calls — the fuzzer
// records through it and replayActions() replays through it, so a recorded
// trace cannot drift from what actually ran.
//
// REPLAY FIDELITY CAVEAT: a trace replays into the identical game only if
// the game's rng stream was not shared with whatever generated the actions.
// The fuzzer's legacy mode shares one stream between game and driver (its
// recorded finding seeds depend on that); its --split mode seeds the game
// separately, which is what makes traces replayable and shrinkable.
import { seededRng } from './rng.js';
import { validateGameState } from './validate.js';
import {
	createGame, playCard, attack, heroAttack, useHeroPower, endTurn,
	resolvePick, resolveAsk, resolveScry, resolveDredge, resolveDiscard,
	resolveSac, resolveResponse, tradeCard, prepareCard,
} from './core.js';

export function dispatch(state, a) {
	switch (a.k) {
		case 'play': return playCard(state, a.pi, a.uid, a.target ?? null, a.choice ?? null, a.position ?? 0);
		case 'attack': return attack(state, a.pi, a.uid, a.target);
		case 'heroAttack': return heroAttack(state, a.pi, a.target);
		case 'power': return useHeroPower(state, a.pi, a.uid, a.target ?? null, a.choice ?? null);
		case 'endTurn': endTurn(state); return true;
		case 'pick': return resolvePick(state, a.id);
		case 'ask': return resolveAsk(state, a.yes);
		case 'scry': return resolveScry(state, a.ids || []);
		case 'dredge': return resolveDredge(state, a.id);
		case 'discard': return resolveDiscard(state, a.uids);
		case 'sac': return resolveSac(state, undefined);
		case 'respond': return resolveResponse(state, a.pi, a.uid, a.target ?? null, null);
		case 'pass': return resolveResponse(state, a.pi, null);
		case 'trade': return tradeCard(state, a.pi, a.uid);
		case 'prepare': return prepareCard(state, a.pi, a.uid);
		default: throw new Error(`dispatch: unknown action kind '${a.k}'`);
	}
}

// Replay a recorded trace onto a fresh game. Mirrors the fuzz driver's
// per-action envelope (strict debug mode, budget reset, validator sweep) so
// a failure reproduces the same way it was found. Returns
// { state, failedAt, error } — error null on a clean run.
export function replayActions(byId, gameSeed, actions, { strict = true, validate = true, players = 2 } = {}) {
	const state = createGame(byId, seededRng(gameSeed), null, players);
	if (strict) state.debug = { strictEffects: true, effectBudget: 4000 };
	for (let i = 0; i < actions.length; i++) {
		if (state.over) break;
		state._fxCount = 0;
		try { dispatch(state, actions[i]); }
		catch (e) { return { state, failedAt: i, error: `threw: ${e.message}` }; }
		if (validate) {
			const v = validateGameState(state);
			if (v.length) return { state, failedAt: i, error: `invariant violations: ${v.join(' | ')}` };
		}
	}
	return { state, failedAt: -1, error: null };
}

// Greedy delta-debugging (ddmin-lite): remove chunks while `stillFails`
// keeps returning true, halving chunk size until single actions. Purely
// deterministic. `stillFails(candidate)` should replay the candidate and
// report whether the original failure still reproduces.
export function shrinkTrace(actions, stillFails) {
	let trace = [...actions];
	let chunk = Math.max(1, Math.floor(trace.length / 2));
	while (chunk >= 1) {
		let removedAny = false;
		for (let start = trace.length - chunk; start >= 0; start -= chunk) {
			const candidate = [...trace.slice(0, start), ...trace.slice(start + chunk)];
			if (candidate.length && stillFails(candidate)) {
				trace = candidate;
				removedAny = true;
			}
		}
		if (!removedAny) {
			if (chunk === 1) break;
			chunk = Math.max(1, Math.floor(chunk / 2));
		}
	}
	return trace;
}
