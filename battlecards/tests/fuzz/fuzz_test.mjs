// fuzz_test.mjs — seeded random-legal-action fuzzer.
//
// Plays whole games by enumerating legal actions through the PUBLIC engine API
// (exactly what the UI and AI do), asserting after every action that:
//   - the engine did not throw
//   - validateGameState(state) reports zero violations
// A failure prints the seed + a replayable action trace tail.
//
// Both the game (createGame rng) and the driver's choices share one seeded
// PRNG, so a seed fully determines the run — the suite ends with a determinism
// smoke test replaying one seed and comparing digests.
//
// Defaults are CI-sized. Deep runs:
//   node battlecards/tests/fuzz/fuzz_test.mjs --games=100 --actions=800 --seed=1234
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;

const arg = (name, dflt) => {
	const a = process.argv.find(x => x.startsWith(`--${name}=`));
	return a ? Number(a.split('=')[1]) : dflt;
};
const GAMES = arg('games', 8);
const MAX_ACTIONS = arg('actions', 300);
const BASE_SEED = arg('seed', 20260728);
const MAX_PER_TURN = 25;

// mulberry32 — tiny seeded PRNG, plenty for fuzzing
function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function playOneGame(seed) {
	const rng = mulberry32(seed);
	const pick = arr => arr[Math.floor(rng() * arr.length)];
	const trace = [];
	const act = (desc, fn) => {
		trace.push(desc);
		if (trace.length > 25) trace.shift();
		return fn();
	};
	const state = E.createGame(byId, rng, null, 2);
	// strict dev mode: unknown effect types throw; runaway compositions trip a budget
	state.debug = { strictEffects: true, effectBudget: 4000 };

	let actions = 0, perTurn = 0, lastTurn = state.turnNumber;
	while (!state.over && actions < MAX_ACTIONS) {
		state._fxCount = 0; // effect budget is per-action
		if (state.turnNumber !== lastTurn) { lastTurn = state.turnNumber; perTurn = 0; }
		const pi = state.current;
		const p = state.players[pi];
		let did = false;

		try {
			// 1. pending modal decisions always come first (they block the game)
			if (state.pickQueue.length) did = act(`pick`, () => E.resolvePick(state, pick(state.pickQueue[0].ids)));
			else if (state.askQueue.length) did = act(`ask`, () => E.resolveAsk(state, rng() < 0.5));
			else if (state.scryQueue.length) did = act(`scry`, () => E.resolveScry(state, []));
			else if (state.dredgeQueue.length) did = act(`dredge`, () => E.resolveDredge(state, pick(state.dredgeQueue[0].ids)));
			else if (state.discardQueue.length) {
				const q = state.discardQueue[0];
				const hand = state.players[q.player].hand;
				const uids = [...hand].sort(() => rng() - 0.5).slice(0, q.count).map(c => c.uid);
				did = act(`discard x${q.count}`, () => E.resolveDiscard(state, uids));
			}
			else if (state.sacQueue.length) did = act(`sac`, () => E.resolveSac(state, undefined)); // engine falls back to pool[0]
			// 2. an open priority window: usually pass, sometimes respond
			else if (state.priority != null) {
				const rp = state.priority;
				const opts = E.responseOptions(state, rp);
				if (opts.length && rng() < 0.35) {
					const c = pick(opts);
					const spec = E.targetSpec(state, rp, c);
					let tgt = null;
					if (spec) { const legal = E.legalTargets(state, rp, spec); if (spec.required && !legal.length) tgt = null; else tgt = legal.length ? pick(legal) : null; }
					did = act(`respond ${c.id}`, () => E.resolveResponse(state, rp, c.uid, tgt, null));
				} else {
					did = act('pass', () => E.resolveResponse(state, rp, null));
				}
			}
			// 3. normal turn actions
			else {
				const candidates = [];
				if (perTurn < MAX_PER_TURN) {
					for (const c of p.hand) {
						if (!E.canPlay(state, pi, c)) continue;
						candidates.push(() => {
							const choice = c.choices ? Math.floor(rng() * c.choices.length) : null;
							const spec = E.targetSpec(state, pi, c, choice);
							let tgt = null;
							if (spec) {
								const legal = E.legalTargets(state, pi, spec);
								if (spec.required && !legal.length) return false;
								tgt = legal.length ? pick(legal) : null;
							}
							return act(`play ${c.id}${choice != null ? ` c${choice}` : ''}`, () => E.playCard(state, pi, c.uid, tgt, choice, 0));
						});
					}
					for (const c of E.attackersFor(state, pi)) {
						candidates.push(() => {
							const ts = E.attackTargets(state, pi, c);
							if (!ts.length) return false;
							return act(`attack ${c.id}`, () => E.attack(state, pi, c.uid, pick(ts)));
						});
					}
					if (E.canHeroAttack(state, pi)) candidates.push(() => {
						const ts = E.heroAttackTargets(state, pi);
						if (!ts.length) return false;
						return act('heroAttack', () => E.heroAttack(state, pi, pick(ts)));
					});
					for (const hpw of p.heroPowers) {
						if (!E.canUseHeroPower(state, pi, hpw)) continue;
						candidates.push(() => {
							const spec = E.heroPowerSpec(state, pi, hpw);
							let tgt = null;
							if (spec) {
								const legal = E.legalTargets(state, pi, spec);
								if (spec.required && !legal.length) return false;
								tgt = legal.length ? pick(legal) : null;
							}
							return act(`heroPower ${hpw.id}`, () => E.useHeroPower(state, pi, hpw.uid, tgt, null));
						});
					}
					for (const c of p.hand) {
						if (c.tradeable && E.canTrade(state, pi, c) && rng() < 0.3) candidates.push(() => act(`trade ${c.id}`, () => E.tradeCard(state, pi, c.uid)));
						if (c.prepare && E.canPrepare(state, pi, c) && rng() < 0.3) candidates.push(() => act(`prepare ${c.id}`, () => E.prepareCard(state, pi, c.uid)));
					}
				}
				// end turn: always possible; more likely as the turn drags on
				const endBias = candidates.length === 0 || rng() < 0.12 + perTurn / (MAX_PER_TURN * 1.4);
				if (endBias) did = act('endTurn', () => { E.endTurn(state); return true; });
				else {
					const c = pick(candidates);
					did = c();
					if (did === false) did = act('endTurn*', () => { E.endTurn(state); return true; });
				}
				perTurn++;
			}
		} catch (e) {
			return { seed, actions, error: `threw: ${e.message}\n${e.stack?.split('\n')[1] || ''}`, trace };
		}

		actions++;
		const v = validateGameState(state);
		if (v.length) return { seed, actions, error: `invariant violations: ${v.join(' | ')}`, trace };
		// Degenerate-growth stop: exponential summon cards (e.g. lab_constructor,
		// "at end of turn summon a copy of this") double every turn, and the engine
		// has no board cap BY DESIGN (see docs/10-risk-register). A 4000+ board is
		// legitimate play that would trip the per-action effect budget — end the
		// game cleanly rather than report a false trigger-loop finding.
		if (state.players.some(pl => pl.board.length > 300)) break;
		if (did === false) {
			// a legality-checked action was rejected by the engine — that mismatch
			// between can*/spec and the action fn is itself a finding
			return { seed, actions, error: `legal-looking action rejected: ${trace[trace.length - 1]}`, trace };
		}
	}
	return { seed, actions, error: null, digest: digest(state) };
}

// determinism digest: gameplay-relevant summary, no uids or event noise
function digest(state) {
	return JSON.stringify({
		turn: state.turnNumber, over: state.over, winner: state.winner ?? null,
		players: state.players.map(p => ({
			life: p.life, armor: p.armor, corpses: p.corpses,
			hand: p.hand.length, board: p.board.map(c => [c.id, c.attack, E.hp(c)]),
			deck: p.deck.length, grave: p.graveyard.length,
		})),
	});
}

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

let totalActions = 0;
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
	const seed = BASE_SEED + g * 7919;
	const r = playOneGame(seed);
	totalActions += r.actions;
	ok(`game seed=${seed} clean (${r.actions} actions)`, r.error === null,
		r.error ? `\n  ${r.error}\n  trace tail: ${r.trace?.join(' → ')}` : '');
}
// determinism: same seed twice ⇒ identical digest
{
	const a = playOneGame(BASE_SEED);
	const b = playOneGame(BASE_SEED);
	ok('determinism: same seed, same outcome', a.error === null && b.error === null && a.digest === b.digest);
}
console.log(`\n(${totalActions} fuzz actions across ${GAMES} games in ${Date.now() - t0}ms)`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
