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
import { seededRng } from '../../engine/rng.js';
import { dispatch, replayActions, shrinkTrace } from '../../engine/actionlog.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const CLASSES = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
// split mode plays WITH hero classes (powers, passives): picks derive from the
// game seed via a dedicated stream so replayActions can re-derive them
export const pickClasses = (seed, n = 2) => {
	const r = seededRng((seed ^ 0xc1a55) >>> 0);
	return Array.from({ length: n }, () => CLASSES[Math.floor(r() * CLASSES.length)]);
};

const arg = (name, dflt) => {
	const a = process.argv.find(x => x.startsWith(`--${name}=`));
	return a ? Number(a.split('=')[1]) : dflt;
};
const GAMES = arg('games', 8);
const MAX_ACTIONS = arg('actions', 300);
const BASE_SEED = arg('seed', 20260728);
const PLAYERS = arg('players', 2); // 2 (default) keeps legacy seeds identical; 0 = random 2-8 per game (FFA); N forces N
const SPLIT = process.argv.includes('--split'); // game rng separate from driver rng -> traces replay + shrink
const MAX_PER_TURN = 25;

function playOneGame(seed) {
	// engine/rng.js seededRng has the SAME mulberry32 core this file used to
	// carry privately — recorded finding seeds replay the identical games
	// LEGACY (default): ONE stream shared by game and driver - recorded finding
	// seeds (420484, 9419695, ...) replay their exact original games this way.
	// --split: the game gets its own stream, so the recorded action trace
	// replays into an identical game via replayActions (and can be shrunk).
	const rngGame = seededRng(seed);
	const rng = SPLIT ? seededRng((seed ^ 0x5bf03635) >>> 0) : rngGame;
	const pick = arr => arr[Math.floor(rng() * arr.length)];
	const trace = [];
	const actions = []; // full structured action log (engine/actionlog.js records)
	const act = (desc, action) => {
		trace.push(desc);
		if (trace.length > 25) trace.shift();
		actions.push(action);
		return dispatch(state, action);
	};
	// player count: 2 by default (legacy determinism); PLAYERS=0 fuzzes FFA at a
	// seed-derived 2-8 (a dedicated stream, so rngGame stays reproducible)
	const nPlayers = PLAYERS === 0 ? (2 + Math.floor(seededRng((seed ^ 0xba5e1) >>> 0)() * 7)) : Math.max(2, Math.min(8, PLAYERS));
	const classPicks = SPLIT ? pickClasses(seed, nPlayers) : null; // legacy seeds predate classes — keep their games identical
	const state = E.createGame(byId, rngGame, null, nPlayers, classPicks);
	// strict dev mode: unknown effect types throw; runaway compositions trip a budget
	state.debug = { strictEffects: true, effectBudget: 4000 };

	let steps = 0, perTurn = 0, lastTurn = state.turnNumber;
	while (!state.over && steps < MAX_ACTIONS) {
		state._fxCount = 0; // effect budget is per-action
		if (state.turnNumber !== lastTurn) { lastTurn = state.turnNumber; perTurn = 0; }
		const pi = state.current;
		const p = state.players[pi];
		let did = false;

		try {
			// 1. pending modal decisions always come first (they block the game)
			if (state.pickQueue.length) did = act(`pick`, { k: 'pick', id: pick(state.pickQueue[0].ids) });
			else if (state.askQueue.length) did = act(`ask`, { k: 'ask', yes: rng() < 0.5 });
			else if (state.scryQueue.length) did = act(`scry`, { k: 'scry', ids: [] });
			else if (state.dredgeQueue.length) did = act(`dredge`, { k: 'dredge', id: pick(state.dredgeQueue[0].ids) });
			else if (state.discardQueue.length) {
				const q = state.discardQueue[0];
				const hand = state.players[q.player].hand;
				const uids = [...hand].sort(() => rng() - 0.5).slice(0, q.count).map(c => c.uid);
				did = act(`discard x${q.count}`, { k: 'discard', uids });
			}
			else if (state.sacQueue.length) did = act(`sac`, { k: 'sac' }); // engine falls back to pool[0]
			// 2. an open priority window: usually pass, sometimes respond
			else if (state.priority != null) {
				const rp = state.priority;
				const opts = E.responseOptions(state, rp);
				if (opts.length && rng() < 0.35) {
					const c = pick(opts);
					const spec = E.targetSpec(state, rp, c);
					let tgt = null;
					if (spec) { const legal = E.legalTargets(state, rp, spec); if (spec.required && !legal.length) tgt = null; else tgt = legal.length ? pick(legal) : null; }
					did = act(`respond ${c.id}`, { k: 'respond', pi: rp, uid: c.uid, target: tgt });
				} else {
					did = act('pass', { k: 'pass', pi: rp });
				}
			}
			// 3. normal turn actions
			else {
				const candidates = [];
				if (perTurn < MAX_PER_TURN) {
					// cross-seat oracle: legal targets must never point at an eliminated
					// seat's hero or permanents (throws surface as findings via the
					// surrounding try/catch, trace attached)
					const assertLiveTargets = (legal, what) => {
						const bad = legal.find(t => t.player != null && state.players[t.player]?.eliminated);
						if (bad) throw new Error(`legalTargets offered eliminated seat p${bad.player} for ${what}`);
					};
					for (const c of p.hand) {
						if (!E.canPlay(state, pi, c)) continue;
						candidates.push(() => {
							const choice = c.choices ? Math.floor(rng() * c.choices.length) : null;
							const spec = E.targetSpec(state, pi, c, choice);
							let tgt = null;
							if (spec) {
								const legal = E.legalTargets(state, pi, spec);
								assertLiveTargets(legal, `play ${c.id}`);
								if (spec.required && !legal.length) return false;
								tgt = legal.length ? pick(legal) : null;
							}
							return act(`play ${c.id}${choice != null ? ` c${choice}` : ''}`, { k: 'play', pi, uid: c.uid, target: tgt, choice });
						});
					}
					for (const c of E.attackersFor(state, pi)) {
						candidates.push(() => {
							const ts = E.attackTargets(state, pi, c);
							assertLiveTargets(ts, `attack ${c.id}`);
							if (!ts.length) return false;
							return act(`attack ${c.id}`, { k: 'attack', pi, uid: c.uid, target: pick(ts) });
						});
					}
					// FFA only (nPlayers > 2, so legacy 2-player seed streams stay
					// byte-identical): occasionally a random alive seat concedes mid-game —
					// the elimination path, stranded-turn handoff, and play-on-after-a-
					// forfeit were never fuzzed before
					if (nPlayers > 2) {
						const alive = state.players.map((pl, i) => pl.eliminated ? -1 : i).filter(i => i >= 0);
						if (alive.length > 2) candidates.push(() => {
							if (rng() < 0.7) return false; // keep concedes rare even when picked
							const who = pick(alive);
							concedeCount++;
							return act(`concede p${who}`, { k: 'concede', pi: who });
						});
					}
					if (E.canHeroAttack(state, pi)) candidates.push(() => {
						const ts = E.heroAttackTargets(state, pi);
						if (!ts.length) return false;
						return act('heroAttack', { k: 'heroAttack', pi, target: pick(ts) });
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
							return act(`heroPower ${hpw.id}`, { k: 'power', pi, uid: hpw.uid, target: tgt });
						});
					}
					for (const c of p.hand) {
						if (c.tradeable && E.canTrade(state, pi, c) && rng() < 0.3) candidates.push(() => act(`trade ${c.id}`, { k: 'trade', pi, uid: c.uid }));
						if (c.prepare && E.canPrepare(state, pi, c) && rng() < 0.3) candidates.push(() => act(`prepare ${c.id}`, { k: 'prepare', pi, uid: c.uid }));
					}
				}
				// end turn: always possible; more likely as the turn drags on
				const endBias = candidates.length === 0 || rng() < 0.12 + perTurn / (MAX_PER_TURN * 1.4);
				if (endBias) did = act('endTurn', { k: 'endTurn' });
				else {
					const c = pick(candidates);
					did = c();
					if (did === false) did = act('endTurn*', { k: 'endTurn' });
				}
				perTurn++;
			}
		} catch (e) {
			return { seed, nPlayers, actions: steps, log: actions, error: `threw: ${e.message}\n${e.stack?.split('\n')[1] || ''}`, trace };
		}

		steps++;
		const v = validateGameState(state);
		if (v.length) return { seed, nPlayers, actions: steps, log: actions, error: `invariant violations: ${v.join(' | ')}`, trace };
		// Degenerate-growth stop: exponential summon cards (e.g. lab_constructor,
		// "at end of turn summon a copy of this") double every turn, and the engine
		// has no board cap BY DESIGN (see docs/10-risk-register). A 4000+ board is
		// legitimate play that would trip the per-action effect budget — end the
		// game cleanly rather than report a false trigger-loop finding.
		if (state.players.some(pl => pl.board.length > 300)) break;
		if (did === false) {
			// a legality-checked action was rejected by the engine — that mismatch
			// between can*/spec and the action fn is itself a finding
			return { seed, nPlayers, actions: steps, log: actions, error: `legal-looking action rejected: ${trace[trace.length - 1]}`, trace };
		}
	}
	return { seed, nPlayers, actions: steps, error: null, digest: digest(state) };
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
let concedeCount = 0; // FFA-only mid-game forfeits injected (see the nPlayers > 2 candidate)
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

let totalActions = 0;
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
	const seed = BASE_SEED + g * 7919;
	const r = playOneGame(seed);
	totalActions += r.actions;
	let shrunk = '';
	if (r.error && SPLIT && r.log) {
		// minimal repro via engine/actionlog.js: replay must reproduce, then ddmin
		// (players/classPicks mirror the failing game — FFA traces replay at FFA size)
		const sig = r.error.slice(0, 30);
		const fails = cand => (replayActions(byId, seed, cand, { players: r.nPlayers, classPicks: pickClasses(seed, r.nPlayers) }).error || '').slice(0, 30) === sig;
		if (fails(r.log)) {
			const min = shrinkTrace(r.log, fails);
			shrunk = `\n  shrunk repro (${min.length}/${r.log.length} actions): ${JSON.stringify(min)}`;
		} else shrunk = `\n  (trace did not replay-reproduce - investigate nondeterminism)`;
	}
	ok(`game seed=${seed} clean (${r.actions} actions)`, r.error === null,
		r.error ? `\n  ${r.error}\n  trace tail: ${r.trace?.join(' → ')}${shrunk}` : '');
}
// determinism: same seed twice ⇒ identical digest
{
	const a = playOneGame(BASE_SEED);
	const b = playOneGame(BASE_SEED);
	ok('determinism: same seed, same outcome', a.error === null && b.error === null && a.digest === b.digest);
}
console.log(`\n(${totalActions} fuzz actions across ${GAMES} games in ${Date.now() - t0}ms${concedeCount ? `, ${concedeCount} mid-game concedes` : ''})`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
