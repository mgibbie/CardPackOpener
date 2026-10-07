// contest_engine.js — pokeemerald's Pokémon Contest, ported rule for rule (no DOM,
// node-testable). Data: overworld/contest_emerald.json (tools/gen_contest_emerald.mjs).
//
// What is ported, from:
//   src/contest.c        CalculateRound1Points, SortContestants, ApplyNextTurnOrder,
//                        GetChosenMove, CalculateAppealMoveImpact, the Task_DoAppeals
//                        state machine's scoring steps (combo bonus, repeat jam, the
//                        crowd/excitement step), RankContestants, SetAttentionLevels,
//                        SetContestantStatusesForNextRound, CalculateFinalScores,
//                        DetermineFinalStandings, SetContestants (opponent draw)
//   src/contest_effect.c all 48 effects, CanUnnerveContestant,
//                        WasAtLeastOneOpponentJammed, the rounding helpers
//   src/contest_ai.c     ContestAI_GetActionToUse + the script interpreter, running
//                        data/contest_ai_scripts.s (compiled into the json)
//   src/contest_util.c   GetNumPreliminaryPoints / GetNumRound2Points (results board),
//                        GetContestEntryEligibility, GiveMonContestRibbon's rule
//
// The engine records what the screen shows as an ordered list of events per
// appeal turn — text (the decomp's strings, expanded), hearts, judge symbols,
// stars, applause — in the order Task_DoAppeals shows them; contest_ui.js plays
// them back.
//
// Two notes on fidelity:
//   * `if_random_less_than` in the retail AI reads eContestAI.vars[n] (out of
//     bounds, undefined behaviour — the decomp's UBFIX compares against n); it is
//     ported as the UBFIX reading (Random() & 0xFF) < n. Random() is still drawn.
//   * `if_user_doesnt_have_move` keeps the retail bug: it compares move NUMBERS
//     against the CONTEST_EFFECT_* constant (BUGFIX compared effects).
//   * Moves this build knows that Emerald does not (later gens, fakemon) have no
//     gContestMoves entry; they appeal as HIGHLY_APPEALING in the category their
//     battle type maps to, and start/finish no combos.

export const CONTESTANT_COUNT = 4;
export const NUM_APPEALS = 5;
const LAST_APPEAL = NUM_APPEALS - 1;
const NONE = 0xFF; // CONTESTANT_NONE
const PLAYER = 3; // NPC contests: the player is always entry 4 (TryPutPlayerLast)
const CONDITION_NO_CHANGE = 0, CONDITION_GAIN = 1, CONDITION_LOSE = 2;
export const JUDGE = { SWIRL: 0, ONE_EXCLAMATION: 1, TWO_EXCLAMATIONS: 2, NUMBER_ONE: 3, NUMBER_FOUR: 4, QUESTION_MARK: 5, STAR: 6 };
export const CATS = ['cool', 'beauty', 'cute', 'smart', 'tough'];
export const RANKS = ['NORMAL', 'SUPER', 'HYPER', 'MASTER'];
// sContestExcitementTable[contest category][move category]
const EXCITEMENT = [
	[+1, 0, -1, -1, 0],
	[0, +1, 0, -1, -1],
	[-1, 0, +1, 0, -1],
	[-1, -1, 0, +1, 0],
	[0, -1, -1, 0, +1],
];
const TYPE2CAT = {
	Fire: 0, Fighting: 0, Electric: 0, Dragon: 0,
	Water: 1, Ice: 1, Grass: 1, Flying: 1,
	Normal: 2, Fairy: 2, Psychic: 3, Ghost: 3, Dark: 3, Poison: 3,
	Rock: 4, Ground: 4, Steel: 4, Bug: 4,
};
// gContestEffectFuncs entries that several CONTEST_EFFECT_* share
const FN_CASE = { StartleFrontMon: 'STARTLE_FRONT_MON', StartlePrevMons: 'STARTLE_PREV_MONS', StartlePrevMon2: 'STARTLE_PREV_MON2', StartlePrevMons2: 'STARTLE_PREV_MONS2' };
const ET = { APPEAL: 0, AVOID_STARTLE: 1, STARTLE_MON: 2, STARTLE_MONS: 3, WORSEN: 4, SPECIAL_APPEAL: 5, TURN_ORDER: 6, UNKNOWN: 8 };

// the GBA's Random(): gRngValue = 1103515245 * gRngValue + 24691, returns the top 16 bits
export function makeRng(seed = 0) {
	let s = seed >>> 0;
	const rng = () => { s = (Math.imul(1103515245, s) + 24691) >>> 0; return s >>> 16; };
	rng.state = () => s;
	return rng;
}

const trunc = x => (x < 0 ? Math.ceil(x) : Math.floor(x)); // C integer division
const s16 = x => ((x & 0xFFFF) << 16) >> 16;

function roundTowardsZero(score) {
	const a = Math.abs(score) % 10;
	if (score < 0) { if (a !== 0) score -= 10 - a; } else score -= a;
	return score;
}
function roundUp(score) {
	const a = Math.abs(score) % 10;
	if (a !== 0) score += 10 - a;
	return score;
}

// ---------- the move table ----------
export function contestMove(D, id, battleType) {
	if (!id) return { id: null, num: 0, cat: 0, fx: 0, starter: 0, combos: [] }; // gContestMoves[MOVE_NONE] = {0}
	const m = D.moves[id];
	if (m) return { id, ...m };
	return { id, num: -1, cat: TYPE2CAT[battleType] ?? 2, fx: 0, starter: 0, combos: [] };
}

// GetContestEntryEligibility: 'egg' | 'fainted' | 'low' | 'equal' | 'high'
export function ribbonRank(mon, category) {
	// MON_DATA_<CAT>_RIBBON: how many ranks of that category the mon has won (0-4).
	// The port keeps ribbons as `${cat}-${rank}` names on mon.ribbons.
	const c = CATS[category] ?? category;
	let n = 0;
	for (let r = 0; r < RANKS.length; r++) if ((mon.ribbons || []).includes(`${c}-${RANKS[r].toLowerCase()}`)) n = r + 1;
	return n;
}
export function entryEligibility(mon, category, rank) {
	if (mon.isEgg || mon.egg) return 'egg';
	if ((mon.hp ?? 1) <= 0) return 'fainted';
	const ribbon = ribbonRank(mon, category);
	if (ribbon > rank) return 'high';
	if (ribbon >= rank) return 'equal';
	return 'low';
}
// HasMonWonThisContestBefore
export const hasWonBefore = (mon, category, rank) => ribbonRank(mon, category) > rank;

// ---------- the contest ----------
export class Contest {
	// opts: { data, category (0-4), rank (0-3), player: {name, trainer, species, moves[4],
	//         cool..tough, sheen}, rng, postgame, battleTypeOf(id), opponents? }
	constructor(opts) {
		const D = this.D = opts.data;
		this.category = opts.category;
		this.rank = opts.rank;
		this.rng = opts.rng || makeRng((Math.random() * 2 ** 32) >>> 0);
		this.battleTypeOf = opts.battleTypeOf || (() => null);
		const opps = opts.opponents || this.pickOpponents(opts.postgame);
		const mk = (src, isPlayer) => ({
			isPlayer, name: src.nick ?? src.name, trainer: src.trainer, species: src.species,
			moves: [0, 1, 2, 3].map(i => src.moves[i] || null),
			cool: src.cool | 0, beauty: src.beauty | 0, cute: src.cute | 0, smart: src.smart | 0, tough: src.tough | 0, sheen: src.sheen | 0,
			aiFlags: isPlayer ? 0 : (src.ai >>> 0),
		});
		this.mons = [...opps.map(o => mk(o, false)), mk(opts.player, true)];
		this.playerIndex = PLAYER;
		this.appealNumber = 0;
		this.applauseLevel = 0;
		this.turnNumber = 0;
		this.excitement = { frozen: false, freezer: 0, moveExcitement: 0, excitementAppealBonus: 0 };
		this.round1 = this.mons.map(m => this.round1Points(m));
		this.st = this.mons.map(() => this.freshStatus());
		this.turnOrder = [0, 0, 0, 0]; // gContestantTurnOrder
		this.appealTurnOrder = [0, 0, 0, 0]; // eContestAppealResults.turnOrder
		this.results = { jam: 0, jam2: 0, contestant: 0, jamQueue: [], unnerved: [0, 0, 0, 0] };
		this.history = [];
		// InitContestResources
		this.sortContestants(false);
		for (const s of this.st) s.nextTurnOrder = NONE;
		this.applyNextTurnOrder();
		this.done = false;
	}

	freshStatus() {
		return {
			appeal: 0, baseAppeal: 0, pointTotal: 0, currMove: null, prevMove: null, moveCategory: 0, ranking: 0,
			attentionLevel: 0, moveRepeatCount: 0, noMoreTurns: false, nervous: false, numTurnsSkipped: 0, condition: 0,
			jam: 0, jamReduction: 0, resistant: false, immune: false, moreEasilyStartled: false, usedRepeatableMove: false,
			conditionMod: CONDITION_NO_CHANGE, turnOrderMod: 0, nextTurnOrder: NONE, hasJudgesAttention: false,
			judgesAttentionWasRemoved: false, effectStringId: null, effectStringId2: null, repeatedMove: false,
			repeatedPrevMove: false, completedCombo: 0, comboAppealBonus: 0, repeatJam: 0, usedComboMove: false,
			completedComboFlag: false, turnSkipped: false, exploded: false, overrideCategoryExcitementMod: false,
			appealTripleCondition: false, jamSafetyCount: 0, turnOrderModAction: 0,
		};
	}

	mv(id) { return contestMove(this.D, id, this.battleTypeOf(id)); }
	eff(id) { return this.D.effects[this.mv(id).fx]; }
	moveExcitement(id) { return EXCITEMENT[this.category][this.mv(id).cat]; }

	// SetContestants: three random opponents of this rank whose pool includes the category
	pickOpponents(postgame = false) {
		const list = [];
		this.D.opponents.forEach((o, i) => {
			if (o.rank !== this.rank) return;
			if (postgame ? o.filter === 'NO_POSTGAME' : o.filter === 'ONLY_POSTGAME') return;
			if (o.pools.includes(this.category)) list.push(i);
		});
		const picks = [];
		for (let i = 0; i < CONTESTANT_COUNT - 1; i++) {
			const r = this.rng() % list.length;
			picks.push(this.D.opponents[list[r]]);
			list.splice(r, 1);
		}
		return picks;
	}

	// CalculateContestantRound1Points
	round1Points(m) {
		const order = [[0, 4, 1], [1, 0, 2], [2, 1, 3], [3, 2, 4], [4, 3, 0]][this.category];
		const v = order.map(c => Math.min(255, m[CATS[c]] | 0));
		return v[0] + trunc((v[1] + v[2] + Math.min(255, m.sheen | 0)) / 2);
	}

	uniqueRandoms() {
		const r = [];
		for (let i = 0; i < CONTESTANT_COUNT; i++) {
			const v = this.rng();
			if (r.includes(v)) { i--; continue; }
			r.push(v);
		}
		return r;
	}

	// SortContestants
	sortContestants(useRanking) {
		const rnd = this.uniqueRandoms();
		const T = this.turnOrder;
		if (!useRanking) {
			const order = [];
			for (let i = 0; i < CONTESTANT_COUNT; i++) {
				order[i] = i;
				let v3;
				for (v3 = 0; v3 < i; v3++) {
					const o = order[v3];
					if (this.round1[o] < this.round1[i] || (this.round1[o] === this.round1[i] && rnd[o] < rnd[i])) {
						for (let j = i; j > v3; j--) order[j] = order[j - 1];
						order[v3] = i;
						break;
					}
				}
				if (v3 === i) order[i] = i;
			}
			for (let i = 0; i < CONTESTANT_COUNT; i++) T[order[i]] = i;
		} else {
			const scratch = [NONE, NONE, NONE, NONE];
			for (let i = 0; i < CONTESTANT_COUNT; i++) {
				let j = this.st[i].ranking;
				while (true) {
					if (scratch[j] === NONE) { scratch[j] = i; T[i] = j; break; }
					j++;
				}
			}
			for (let i = 0; i < CONTESTANT_COUNT - 1; i++) {
				for (let v3 = CONTESTANT_COUNT - 1; v3 > i; v3--) {
					if (this.st[v3 - 1].ranking === this.st[v3].ranking && T[v3 - 1] < T[v3] && rnd[v3 - 1] < rnd[v3]) {
						const t = T[v3]; T[v3] = T[v3 - 1]; T[v3 - 1] = t;
					}
				}
			}
		}
	}

	// ApplyNextTurnOrder
	applyNextTurnOrder() {
		const T = this.turnOrder, S = this.st;
		const newOrder = [...T];
		const ordered = [false, false, false, false];
		let next = 0;
		for (let i = 0; i < CONTESTANT_COUNT; i++) {
			let j;
			for (j = 0; j < CONTESTANT_COUNT; j++) {
				if (S[j].nextTurnOrder === i) { newOrder[j] = i; ordered[j] = true; break; }
			}
			if (j === CONTESTANT_COUNT) {
				for (j = 0; j < CONTESTANT_COUNT; j++) {
					if (!ordered[j] && S[j].nextTurnOrder === NONE) { next = j; j++; break; }
				}
				for (; j < CONTESTANT_COUNT; j++) {
					if (!ordered[j] && S[j].nextTurnOrder === NONE && T[next] > T[j]) next = j;
				}
				newOrder[next] = i;
				ordered[next] = true;
			}
		}
		for (let i = 0; i < CONTESTANT_COUNT; i++) {
			this.appealTurnOrder[i] = newOrder[i];
			S[i].nextTurnOrder = NONE;
			S[i].turnOrderMod = 0;
			T[i] = newOrder[i];
		}
	}

	isTurnDisabled(i) { return this.st[i].numTurnsSkipped !== 0 || this.st[i].noMoreTurns; }
	canUseTurn(i) { return !this.isTurnDisabled(i); }
	allowedToCombo(i) { return !(this.st[i].repeatedMove || this.st[i].nervous); }

	// AreMovesContestCombo
	isCombo(last, next) {
		const s = this.mv(last).starter;
		if (!s) return 0;
		return this.mv(next).combos.includes(s) ? (this.D.comboStarterLookup[s] | 0) : 0;
	}

	// ---------- choosing moves ----------
	// GetAllChosenMoves. playerChoice is the player's move slot (0-3).
	chooseMoves(playerChoice) {
		for (let i = 0; i < CONTESTANT_COUNT; i++) {
			if (this.isTurnDisabled(i)) { this.st[i].currMove = null; continue; }
			if (i === PLAYER) this.st[i].currMove = this.mons[i].moves[playerChoice] || null;
			else this.st[i].currMove = this.mons[i].moves[this.aiChoose(i)] || null;
		}
	}

	// ContestAI_ResetAI + ContestAI_GetActionToUse
	aiChoose(c) {
		const ai = { contestant: c, scores: [100, 100, 100, 100], flags: this.mons[c].aiFlags >>> 0, flag: 0, result: 0 };
		while (ai.flags !== 0) {
			if (ai.flags & 1) {
				for (let mi = 0; mi < 4; mi++) {
					if (!this.mons[c].moves[mi]) { ai.scores[mi] = 0; continue; }
					this.runAiScript(ai, this.D.ai.table[ai.flag], mi);
				}
			}
			ai.flags >>>= 1;
			ai.flag++;
		}
		while (true) {
			const mi = this.rng() & 3;
			const score = ai.scores[mi];
			let i;
			for (i = 0; i < 4; i++) if (score < ai.scores[i]) break;
			if (i === 4) return mi;
		}
	}

	byTurn(turn) {
		let i;
		for (i = 0; i < CONTESTANT_COUNT; i++) if (this.appealTurnOrder[i] === turn) break;
		return i;
	}

	runAiScript(ai, pc, mi) {
		const code = this.D.ai.code, c = ai.contestant, S = this.st;
		const move = this.mons[c].moves[mi];
		const stack = [];
		const cmp = { less_than: (a, b) => a < b, more_than: (a, b) => a > b, eq: (a, b) => a === b, not_eq: (a, b) => a !== b };
		const get = {
			appeal_num: () => this.appealNumber,
			excitement: () => this.applauseLevel,
			user_order: () => this.appealTurnOrder[c],
			user_condition: () => trunc(S[c].condition / 10),
			contest_type: () => this.category,
			move_excitement: () => this.moveExcitement(move),
			effect: () => this.mv(move).fx,
			effect_type: () => this.eff(move).type,
			move_used_count: () => (move !== S[c].prevMove ? 0 : S[c].moveRepeatCount + 1),
		};
		const getMon = {
			condition: t => trunc(S[this.byTurn(t)].condition / 10),
			used_combo_starter: t => { const k = this.byTurn(t); return this.allowedToCombo(k) ? (this.mv(S[k].prevMove).starter ? 1 : 0) : 0; },
		};
		for (let guard = 0; guard < 100000; guard++) {
			const [op, ...a] = code[pc];
			let m;
			if (op === 'score') {
				ai.scores[mi] = Math.max(0, Math.min(255, ai.scores[mi] + a[0]));
				pc++;
			} else if (op === 'end') {
				if (!stack.length) return;
				pc = stack.pop();
			} else if (op === 'goto') {
				pc = a[0];
			} else if (op === 'call') {
				stack.push(pc + 1);
				pc = a[0];
			} else if (op === 'if_random_less_than') {
				pc = ((this.rng() & 0xFF) < a[0]) ? a[1] : pc + 1;
			} else if ((m = op.match(/^if_(user_order|appeal_num|excitement|user_condition|contest_type|move_excitement|effect|effect_type|move_used_count)_(less_than|more_than|eq|not_eq)$/))) {
				pc = cmp[m[2]](get[m[1]](), a[0]) ? a[1] : pc + 1;
			} else if ((m = op.match(/^if_(condition|used_combo_starter)_(less_than|more_than|eq|not_eq)$/))) {
				pc = cmp[m[2]](getMon[m[1]](a[0]), a[1]) ? a[2] : pc + 1;
			} else if (op === 'if_can_participate' || op === 'if_cannot_participate') {
				const can = !this.isTurnDisabled(this.byTurn(a[0]));
				pc = (op === 'if_can_participate' ? can : !can) ? a[1] : pc + 1;
			} else if (op === 'if_not_completed_combo') {
				pc = !S[this.byTurn(a[0])].completedComboFlag ? a[1] : pc + 1;
			} else if (op === 'if_most_appealing_move') {
				const ap = this.eff(move).appeal;
				const most = this.mons[c].moves.every(o => !o || !(ap < this.eff(o).appeal));
				pc = most ? a[0] : pc + 1;
			} else if (op === 'if_would_finish_combo') {
				const r = S[c].prevMove ? this.isCombo(S[c].prevMove, move) : 0;
				pc = r ? a[0] : pc + 1;
			} else if (op === 'if_not_combo_starter') {
				const r = this.mons[c].moves.some(o => o && this.isCombo(move, o));
				pc = !r ? a[0] : pc + 1;
			} else if (op === 'if_not_combo_finisher') {
				const r = this.mons[c].moves.some(o => o && this.isCombo(o, move));
				pc = !r ? a[0] : pc + 1;
			} else if (op === 'if_user_has_exciting_move') {
				const r = this.mons[c].moves.some(o => o && this.moveExcitement(o) === 1);
				pc = r ? a[0] : pc + 1;
			} else if (op === 'if_user_doesnt_have_move') {
				// retail: compares the move NUMBER against the effect constant
				const has = this.mons[c].moves.some(o => (o ? this.mv(o).num : 0) === a[0]);
				pc = !has ? a[1] : pc + 1;
			} else {
				throw new Error('contest AI: unported command ' + op);
			}
		}
		throw new Error('contest AI: runaway script');
	}

	// ---------- the appeals ----------
	setString(c, id) { this.st[c].effectStringId = id; }
	setString2(c, id) { this.st[c].effectStringId2 = id; }

	canUnnerve(i) {
		const s = this.st[i];
		this.results.unnerved[i] = 1;
		if (s.immune) { this.setString(i, 'AVOID_SEEING'); return false; }
		if (s.jamSafetyCount !== 0) { s.jamSafetyCount--; this.setString(i, 'AVERT_GAZE'); return false; }
		return !s.noMoreTurns && s.numTurnsSkipped === 0;
	}

	jamQueue() {
		const R = this.results;
		const buf = [0, 0, 0, 0];
		for (const k of R.jamQueue) {
			if (!this.canUnnerve(k)) continue;
			R.jam2 = R.jam;
			const s = this.st[k];
			if (s.moreEasilyStartled) R.jam2 *= 2;
			if (s.resistant) {
				R.jam2 = 10;
				this.setString(k, 'LITTLE_DISTRACTED');
			} else {
				R.jam2 -= s.jamReduction;
				if (R.jam2 <= 0) {
					R.jam2 = 0;
					this.setString(k, 'NOT_FAZED');
				} else {
					const jam = R.jam2 & 0xFF; // JamContestant(u8, u8)
					s.appeal -= jam;
					s.jam += jam;
					if (R.jam2 >= 60) this.setString(k, 'TRIPPED_OVER');
					else if (R.jam2 >= 40) this.setString(k, 'LEAPT_UP');
					else if (R.jam2 >= 30) this.setString(k, 'UTTER_CRY');
					else if (R.jam2 >= 20) this.setString(k, 'TURNED_BACK');
					else if (R.jam2 >= 10) this.setString(k, 'LOOKED_DOWN');
					buf[k] = R.jam2;
				}
			}
		}
		return buf.some(v => v !== 0);
	}

	makeNervous(p) { this.st[p].nervous = true; this.st[p].currMove = null; }

	// gContestEffectFuncs — the 48 effects
	runEffect(name) {
		const R = this.results, me = R.contestant, S = this.st, TO = this.appealTurnOrder;
		const myTurn = TO[me];
		const startleEach = (filter, jamOf, stringOnMiss = 'MESSED_UP2') => {
			let n = 0;
			for (let i = 0; i < CONTESTANT_COUNT; i++) {
				if (myTurn > TO[i] && filter(i)) {
					R.jam = jamOf(i);
					R.jamQueue = [i];
					if (this.jamQueue()) n++;
				}
			}
			return n;
		};
		switch (name) {
			case 'HIGHLY_APPEALING': break;
			case 'USER_MORE_EASILY_STARTLED': S[me].moreEasilyStartled = true; this.setString(me, 'MORE_CONSCIOUS'); break;
			case 'GREAT_APPEAL_BUT_NO_MORE_MOVES': S[me].exploded = true; this.setString(me, 'NO_APPEAL'); break;
			case 'REPETITION_NOT_BORING': S[me].usedRepeatableMove = true; S[me].repeatedMove = false; S[me].moveRepeatCount = 0; break;
			case 'AVOID_STARTLE_ONCE': S[me].jamSafetyCount = 1; this.setString(me, 'SETTLE_DOWN'); break;
			case 'AVOID_STARTLE': S[me].immune = true; this.setString(me, 'OBLIVIOUS_TO_OTHERS'); break;
			case 'AVOID_STARTLE_SLIGHTLY': S[me].jamReduction = 20; this.setString(me, 'LESS_AWARE'); break;
			case 'USER_LESS_EASILY_STARTLED': S[me].resistant = true; this.setString(me, 'STOPPED_CARING'); break;
			case 'STARTLE_FRONT_MON': this.startleFrontMon(); break;
			case 'STARTLE_PREV_MONS': this.startlePrevMons(); break;
			case 'STARTLE_PREV_MON2': {
				const r = this.rng() % 10;
				R.jam = r < 2 ? 20 : r < 8 ? 40 : 60;
				this.startleFrontMon();
				break;
			}
			case 'STARTLE_PREV_MONS2': {
				let n = 0;
				if (myTurn !== 0) {
					for (let i = 0; i < 4; i++) {
						if (myTurn > TO[i]) {
							R.jamQueue = [i];
							const r = this.rng() % 10;
							R.jam = r === 0 ? 0 : r <= 2 ? 10 : r <= 4 ? 20 : r <= 6 ? 30 : r <= 8 ? 40 : 60;
							if (this.jamQueue()) n++;
						}
					}
				}
				this.setString(me, 'ATTEMPT_STARTLE');
				if (n === 0) this.setString2(me, 'MESSED_UP2');
				break;
			}
			case 'SHIFT_JUDGE_ATTENTION': {
				let hit = false;
				if (myTurn !== 0) {
					for (let i = 0; i < 4; i++) {
						if (myTurn > TO[i] && S[i].hasJudgesAttention && this.canUnnerve(i)) {
							S[i].hasJudgesAttention = false;
							S[i].judgesAttentionWasRemoved = true;
							this.setString(i, 'JUDGE_LOOK_AWAY2');
							hit = true;
						}
					}
				}
				this.setString(me, 'DAZZLE_ATTEMPT');
				if (!hit) this.setString2(me, 'MESSED_UP2');
				break;
			}
			case 'STARTLE_MON_WITH_JUDGES_ATTENTION': {
				const n = myTurn !== 0 ? startleEach(() => true, i => (S[i].hasJudgesAttention ? 50 : 10)) : 0;
				this.setString(me, 'ATTEMPT_STARTLE');
				if (n === 0) this.setString2(me, 'MESSED_UP2');
				break;
			}
			case 'JAMS_OTHERS_BUT_MISS_ONE_TURN':
				S[me].turnSkipped = true;
				this.startlePrevMons();
				this.setString(me, 'ATTEMPT_STARTLE');
				break;
			case 'STARTLE_MONS_SAME_TYPE_APPEAL': this.jamByCategory(this.mv(S[me].currMove).cat); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'STARTLE_MONS_COOL_APPEAL': this.jamByCategory(0); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'STARTLE_MONS_BEAUTY_APPEAL': this.jamByCategory(1); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'STARTLE_MONS_CUTE_APPEAL': this.jamByCategory(2); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'STARTLE_MONS_SMART_APPEAL': this.jamByCategory(3); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'STARTLE_MONS_TOUGH_APPEAL': this.jamByCategory(4); this.setString(me, 'ATTEMPT_STARTLE'); break;
			case 'MAKE_FOLLOWING_MON_NERVOUS': {
				let hit = false;
				if (myTurn !== 3) {
					for (let i = 0; i < 4; i++) {
						if (myTurn + 1 === TO[i]) {
							if (this.canUnnerve(i)) { this.makeNervous(i); this.setString(i, 'NERVOUS'); hit = true; }
							else { this.setString(i, 'UNAFFECTED'); hit = true; }
						}
					}
				}
				this.setString(me, 'UNNERVE_ATTEMPT');
				if (!hit) this.setString2(me, 'MESSED_UP2');
				break;
			}
			case 'MAKE_FOLLOWING_MONS_NERVOUS': {
				let numUnnerved = 0;
				let unnerved = false;
				const ids = [];
				for (let i = 0; i < CONTESTANT_COUNT; i++) {
					if (myTurn < TO[i] && !S[i].nervous && !this.isTurnDisabled(i)) ids.push(i);
				}
				const odds = ids.length === 1 ? [60] : ids.length === 2 ? [30, 30] : ids.length === 3 ? [20, 20, 20] : [0, 0, 0, 0];
				const oddsMod = [];
				for (let i = 0; i < CONTESTANT_COUNT; i++) {
					oddsMod[i] = (S[i].hasJudgesAttention && this.allowedToCombo(i))
						? (this.D.comboStarterLookup[this.mv(S[i].prevMove).starter] | 0) * 10 : 0;
					oddsMod[i] -= trunc(S[i].condition / 10) * 10;
				}
				if (odds[0] !== 0) {
					ids.forEach((id, k) => {
						if (this.rng() % 100 < odds[k] + oddsMod[id]) {
							if (this.canUnnerve(id)) { this.makeNervous(id); this.setString(id, 'NERVOUS'); numUnnerved++; }
							else unnerved = true;
						} else unnerved = true;
						if (unnerved) { unnerved = false; this.setString(id, 'UNAFFECTED'); numUnnerved++; }
						R.unnerved[id] = 1;
					});
				}
				this.setString(me, 'UNNERVE_WAITING');
				if (numUnnerved === 0) this.setString2(me, 'MESSED_UP2');
				break;
			}
			case 'WORSEN_CONDITION_OF_PREV_MONS': {
				let n = 0;
				for (let i = 0; i < CONTESTANT_COUNT; i++) {
					if (myTurn > TO[i] && S[i].condition > 0 && this.canUnnerve(i)) {
						S[i].condition = 0;
						S[i].conditionMod = CONDITION_LOSE;
						this.setString(i, 'REGAINED_FORM');
						n++;
					}
				}
				this.setString(me, 'TAUNT_WELL');
				if (n === 0) this.setString2(me, 'IGNORED');
				break;
			}
			case 'BADLY_STARTLES_MONS_IN_GOOD_CONDITION': {
				const n = startleEach(() => true, i => (S[i].condition > 0 ? 40 : 10));
				this.setString(me, 'JAM_WELL');
				if (n === 0) this.setString2(me, 'IGNORED');
				break;
			}
			case 'BETTER_IF_FIRST':
				if (this.turnOrder[me] === 0) {
					S[me].appeal += 2 * this.eff(S[me].currMove).appeal;
					this.setString(me, 'HUSTLE_STANDOUT');
				}
				break;
			case 'BETTER_IF_LAST':
				if (this.turnOrder[me] === 3) {
					S[me].appeal += 2 * this.eff(S[me].currMove).appeal;
					this.setString(me, 'WORK_HARD_UNNOTICED');
				}
				break;
			case 'APPEAL_AS_GOOD_AS_PREV_ONES': {
				let sum = 0;
				for (let i = 0; i < CONTESTANT_COUNT; i++) if (myTurn > TO[i]) sum += S[i].appeal;
				if (sum < 0) sum = 0;
				if (myTurn === 0 || sum === 0) this.setString(me, 'APPEAL_NOT_WELL');
				else { S[me].appeal += trunc(sum / 2); this.setString(me, 'WORK_BEFORE'); }
				S[me].appeal = roundTowardsZero(S[me].appeal);
				break;
			}
			case 'APPEAL_AS_GOOD_AS_PREV_ONE': {
				let ap = 0;
				if (myTurn !== 0) for (let i = 0; i < CONTESTANT_COUNT; i++) if (myTurn - 1 === TO[i]) ap = S[i].appeal;
				if (myTurn === 0 || ap <= 0) this.setString(me, 'APPEAL_NOT_WELL2');
				else { S[me].appeal += ap; this.setString(me, 'WORK_PRECEDING'); }
				break;
			}
			case 'BETTER_WHEN_LATER':
				S[me].appeal = myTurn === 0 ? 10 : 20 * myTurn;
				this.setString(me, ['APPEAL_NOT_SHOWN_WELL', 'APPEAL_SLIGHTLY_WELL', 'APPEAL_PRETTY_WELL', 'APPEAL_EXCELLENTLY'][Math.min(myTurn, 3)]);
				break;
			case 'QUALITY_DEPENDS_ON_TIMING': {
				const r = this.rng() % 10;
				const [ap, str] = r < 3 ? [10, 'APPEAL_NOT_VERY_WELL'] : r < 6 ? [20, 'APPEAL_SLIGHTLY_WELL2']
					: r < 8 ? [40, 'APPEAL_PRETTY_WELL2'] : r < 9 ? [60, 'APPEAL_VERY_WELL'] : [80, 'APPEAL_EXCELLENTLY2'];
				this.setString(me, str);
				S[me].appeal = ap;
				break;
			}
			case 'BETTER_IF_SAME_TYPE': {
				if (myTurn === 0) break;
				let i = myTurn - 1, j;
				let found = true;
				while (true) {
					for (j = 0; j < CONTESTANT_COUNT; j++) if (TO[j] === i) break;
					if (S[j].noMoreTurns || S[j].nervous || S[j].numTurnsSkipped) {
						if (--i < 0) { found = false; break; }
					} else break;
				}
				if (!found) break;
				if (this.mv(S[me].currMove).cat === this.mv(S[j].currMove).cat) {
					S[me].appeal += this.eff(S[me].currMove).appeal * 2;
					this.setString(me, 'SAME_TYPE_GOOD');
				}
				break;
			}
			case 'BETTER_IF_DIFF_TYPE':
				if (myTurn !== 0) {
					for (let i = 0; i < CONTESTANT_COUNT; i++) {
						if (myTurn - 1 === TO[i] && this.mv(S[me].currMove).cat !== this.mv(S[i].currMove).cat) {
							S[me].appeal += this.eff(S[me].currMove).appeal * 2;
							this.setString(me, 'DIFF_TYPE_GOOD');
							break;
						}
					}
				}
				break;
			case 'AFFECTED_BY_PREV_APPEAL':
				if (myTurn !== 0) {
					for (let i = 0; i < CONTESTANT_COUNT; i++) {
						if (myTurn - 1 === TO[i]) {
							if (S[me].appeal > S[i].appeal) { S[me].appeal *= 2; this.setString(me, 'STOOD_OUT_AS_MUCH'); }
							else if (S[me].appeal < S[i].appeal) { S[me].appeal = 0; this.setString(me, 'NOT_AS_WELL'); }
						}
					}
				}
				break;
			case 'IMPROVE_CONDITION_PREVENT_NERVOUSNESS':
				if (S[me].condition < 30) { S[me].condition += 10; S[me].conditionMod = CONDITION_GAIN; this.setString(me, 'CONDITION_ROSE'); }
				else this.setString(me, 'NO_CONDITION_IMPROVE');
				break;
			case 'BETTER_WITH_GOOD_CONDITION':
				S[me].appealTripleCondition = true;
				this.setString(me, S[me].condition !== 0 ? 'HOT_STATUS' : 'BAD_CONDITION_WEAK_APPEAL');
				break;
			case 'NEXT_APPEAL_EARLIER':
			case 'NEXT_APPEAL_LATER': {
				if (this.appealNumber === LAST_APPEAL) break;
				const later = name === 'NEXT_APPEAL_LATER';
				const order = S.map(s => s.nextTurnOrder);
				order[me] = NONE;
				if (!later) {
					for (let i = 0; i < CONTESTANT_COUNT; i++) {
						let j;
						for (j = 0; j < CONTESTANT_COUNT; j++) {
							if (j !== me && i === order[j] && order[j] === S[j].nextTurnOrder) { order[j]++; break; }
						}
						if (j === CONTESTANT_COUNT) break;
					}
					order[me] = 0;
				} else {
					for (let i = CONTESTANT_COUNT - 1; i > -1; i--) {
						let j;
						for (j = 0; j < CONTESTANT_COUNT; j++) {
							if (j !== me && i === order[j] && order[j] === S[j].nextTurnOrder) { order[j] = (order[j] - 1) & 0xFF; break; }
						}
						if (j === CONTESTANT_COUNT) break;
					}
					order[me] = CONTESTANT_COUNT - 1;
				}
				S[me].turnOrderMod = 1;
				for (let i = 0; i < CONTESTANT_COUNT; i++) S[i].nextTurnOrder = order[i];
				S[me].turnOrderModAction = later ? 2 : 1;
				this.setString(me, later ? 'MOVE_BACK_LINE' : 'MOVE_UP_LINE');
				break;
			}
			case 'MAKE_SCRAMBLING_TURN_ORDER_EASIER': break; // dummied out
			case 'SCRAMBLE_NEXT_TURN_ORDER': {
				if (this.appealNumber === LAST_APPEAL) break;
				const order = S.map(s => s.nextTurnOrder);
				const unselected = [0, 1, 2, 3];
				for (let i = 0; i < CONTESTANT_COUNT; i++) {
					let r = this.rng() % (CONTESTANT_COUNT - i);
					for (let j = 0; j < CONTESTANT_COUNT; j++) {
						if (unselected[j] !== NONE) {
							if (r === 0) { order[j] = i; unselected[j] = NONE; break; }
							r--;
						}
					}
				}
				for (let i = 0; i < CONTESTANT_COUNT; i++) { S[i].nextTurnOrder = order[i]; S[i].turnOrderMod = 2; }
				S[me].turnOrderModAction = 3;
				this.setString(me, 'SCRAMBLE_ORDER');
				break;
			}
			case 'EXCITE_AUDIENCE_IN_ANY_CONTEST':
				if (this.mv(S[me].currMove).cat !== this.category) S[me].overrideCategoryExcitementMod = true;
				break;
			case 'BADLY_STARTLE_MONS_WITH_GOOD_APPEALS': {
				const n = startleEach(() => true, i => (S[i].appeal > 0 ? roundUp(s16(trunc(S[i].appeal / 2))) : 10));
				if (n === 0) this.setString2(me, 'MESSED_UP2');
				this.setString(me, 'ATTEMPT_STARTLE');
				break;
			}
			case 'BETTER_WHEN_AUDIENCE_EXCITED': {
				const L = this.applauseLevel;
				const [ap, str] = L === 0 ? [10, 'APPEAL_NOT_VERY_WELL'] : L === 1 ? [20, 'APPEAL_SLIGHTLY_WELL2']
					: L === 2 ? [30, 'APPEAL_PRETTY_WELL2'] : L === 3 ? [50, 'APPEAL_VERY_WELL'] : [60, 'APPEAL_EXCELLENTLY2'];
				this.setString(me, str);
				S[me].appeal = ap;
				break;
			}
			case 'DONT_EXCITE_AUDIENCE':
				if (!this.excitement.frozen) {
					this.excitement.frozen = true;
					this.excitement.freezer = me;
					this.setString(me, 'ATTRACTED_ATTENTION');
				}
				break;
			default: throw new Error('contest effect not ported: ' + name);
		}
	}

	startleFrontMon() {
		const R = this.results, me = R.contestant, TO = this.appealTurnOrder;
		let hit = false;
		if (TO[me] !== 0) {
			let i;
			for (i = 0; i < CONTESTANT_COUNT; i++) if (TO[me] - 1 === TO[i]) break;
			R.jamQueue = [i];
			hit = this.jamQueue();
		}
		if (!hit) this.setString2(me, 'MESSED_UP2');
		this.setString(me, 'ATTEMPT_STARTLE');
	}

	startlePrevMons() {
		const R = this.results, me = R.contestant, TO = this.appealTurnOrder;
		let hit = false;
		if (TO[me] !== 0) {
			R.jamQueue = [];
			for (let i = 0; i < CONTESTANT_COUNT; i++) if (TO[me] > TO[i]) R.jamQueue.push(i);
			hit = this.jamQueue();
		}
		if (!hit) this.setString2(me, 'MESSED_UP2');
		this.setString(me, 'ATTEMPT_STARTLE');
	}

	jamByCategory(cat) {
		const R = this.results, me = R.contestant, TO = this.appealTurnOrder, S = this.st;
		let n = 0;
		for (let i = 0; i < CONTESTANT_COUNT; i++) {
			if (TO[me] > TO[i]) {
				R.jam = cat === this.mv(S[i].currMove).cat ? 40 : 10;
				R.jamQueue = [i];
				if (this.jamQueue()) n++;
			}
		}
		if (n === 0) this.setString2(me, 'MESSED_UP2');
	}

	// CalculateAppealMoveImpact
	appealImpact(c) {
		const S = this.st, s = S[c];
		s.appeal = 0;
		s.baseAppeal = 0;
		if (!this.canUseTurn(c)) return;
		const move = s.currMove;
		const m = this.mv(move);
		const e = this.D.effects[m.fx];
		s.moveCategory = m.cat;
		if (move === s.prevMove && move !== null) { s.repeatedMove = true; s.moveRepeatCount++; }
		else s.moveRepeatCount = 0;
		s.baseAppeal = e.appeal;
		s.appeal = s.baseAppeal;
		this.results.jam = e.jam;
		this.results.jam2 = e.jam;
		this.results.contestant = c;
		for (let i = 0; i < CONTESTANT_COUNT; i++) { S[i].jam = 0; this.results.unnerved[i] = 0; }
		if (s.hasJudgesAttention && !this.isCombo(s.prevMove, move)) s.hasJudgesAttention = false;
		this.runEffect(FN_CASE[e.fn] || e.name);
		if (s.conditionMod === CONDITION_GAIN) s.appeal += s.condition - 10;
		else if (s.appealTripleCondition) s.appeal += s.condition * 3;
		else s.appeal += s.condition;
		s.completedCombo = 0;
		s.usedComboMove = false;
		if (this.allowedToCombo(c)) {
			const done = this.isCombo(s.prevMove, move);
			if (done && s.hasJudgesAttention) {
				s.completedCombo = done;
				s.usedComboMove = true;
				s.hasJudgesAttention = false;
				s.comboAppealBonus = s.baseAppeal * s.completedCombo;
				s.completedComboFlag = true;
			} else if (m.starter !== 0) {
				s.hasJudgesAttention = true;
				s.usedComboMove = true;
			} else s.hasJudgesAttention = false;
		}
		if (s.repeatedMove) s.repeatJam = (s.moveRepeatCount + 1) * 10;
		if (s.nervous) { s.hasJudgesAttention = false; s.appeal = 0; s.baseAppeal = 0; }
		const X = this.excitement;
		X.moveExcitement = this.moveExcitement(s.currMove);
		if (s.overrideCategoryExcitementMod) X.moveExcitement = 1;
		X.excitementAppealBonus = X.moveExcitement > 0 ? (this.applauseLevel + X.moveExcitement > 4 ? 60 : 10) : 0;
		// Transform / Role Play pick a random "target" to animate against: the draw happens
		let r = this.rng() % (CONTESTANT_COUNT - 1);
		for (let i = 0; i < CONTESTANT_COUNT; i++) if (i !== c) { if (r === 0) break; r--; }
	}

	// ---------- text ----------
	moveName(id) { return this.moveNames?.[id] || (id ? id.toUpperCase() : '???'); }
	fmt(key, v1, v2, v3) {
		const t = this.D.text[key] ?? key;
		return t.replace(/\{STR_VAR_1\}/g, v1 ?? '').replace(/\{STR_VAR_2\}/g, v2 ?? '').replace(/\{STR_VAR_3\}/g, v3 ?? '');
	}
	// PrintAppealMoveResultText
	resultText(c, stringId) {
		const flavour = ['gText_Contest_Shyness', 'gText_Contest_Anxiety', 'gText_Contest_Laziness', 'gText_Contest_Hesitancy', 'gText_Contest_Fear'];
		const cat = this.mv(this.st[this.results.contestant].currMove).cat;
		return this.fmt(this.D.appealResults[stringId], this.mons[c].name, this.moveName(this.st[c].currMove), this.D.text[flavour[cat]]);
	}

	// one contestant's turn: Task_DoAppeals from APPEALSTATE_START_TURN to START_NEXT_TURN.
	// Returns the events in display order.
	doTurn() {
		const ev = [];
		const S = this.st;
		let c;
		for (c = 0; this.turnNumber !== this.appealTurnOrder[c]; c++);
		this.appealImpact(c);
		const s = S[c];
		const say = text => ev.push({ t: 'text', text });
		const hearts = (who, from, delta) => ev.push({ t: 'hearts', who, from, delta });
		const judge = sym => ev.push({ t: 'judge', sym });
		ev.push({ t: 'turn', who: c });
		if (s.numTurnsSkipped !== 0 || s.noMoreTurns) {
			say(this.fmt('gText_MonWasWatchingOthers', this.mons[c].name));
		} else if (s.nervous) {
			ev.push({ t: 'slidein', who: c });
			if (s.hasJudgesAttention) s.hasJudgesAttention = false;
			say(this.fmt('gText_MonWasTooNervousToMove', this.mons[c].name, this.moveName(s.currMove)));
			this.applauseSlideOut(ev);
		} else {
			ev.push({ t: 'slidein', who: c });
			say(this.fmt('gText_MonAppealedWithMove', this.mons[c].name, this.moveName(s.currMove)));
			ev.push({ t: 'anim', who: c, move: s.currMove });
			// APPEALSTATE_TRY_PRINT_MOVE_RESULT
			while (true) {
				if (s.effectStringId != null) { say(this.resultText(c, s.effectStringId)); s.effectStringId = null; continue; }
				if (s.effectStringId2 != null) {
					let i;
					for (i = 0; i < CONTESTANT_COUNT; i++) if (i !== c && S[i].effectStringId != null) break;
					if (i === CONTESTANT_COUNT) { say(this.resultText(c, s.effectStringId2)); s.effectStringId2 = null; continue; }
				}
				break;
			}
			if (s.turnOrderModAction === 1) judge(JUDGE.NUMBER_ONE);
			else if (s.turnOrderModAction === 2) judge(JUDGE.NUMBER_FOUR);
			else if (s.turnOrderModAction === 3) judge(JUDGE.QUESTION_MARK);
			ev.push({ t: 'nextturn' });
			hearts(c, 0, s.appeal);
			if (s.conditionMod === CONDITION_GAIN) judge(JUDGE.STAR);
			ev.push({ t: 'stars', who: c, condition: s.condition });
			ev.push({ t: 'status' });
			// APPEALSTATE_UPDATE_OPPONENT: the others' reactions, in turn order
			for (let turn = 0; turn < CONTESTANT_COUNT; turn++) {
				for (let j = 0; j < CONTESTANT_COUNT; j++) {
					if (j !== c && this.turnOrder[j] === turn && S[j].effectStringId != null) {
						say(this.resultText(j, S[j].effectStringId));
						S[j].effectStringId = null;
						hearts(j, S[j].appeal + S[j].jam, -S[j].jam);
						ev.push({ t: 'stars', who: j, condition: S[j].condition });
						ev.push({ t: 'status' });
						if (S[j].judgesAttentionWasRemoved) S[j].judgesAttentionWasRemoved = false;
					}
				}
			}
			if (s.numTurnsSkipped !== 0 || s.turnSkipped) say(this.fmt('gText_MonCantAppealNextTurn', this.mons[c].name));
			if (s.usedComboMove) {
				if (s.completedCombo) { say(this.D.text.gText_AppealComboWentOverWell); judge(JUDGE.TWO_EXCLAMATIONS); }
				else { say(this.fmt('gText_JudgeLookedAtMonExpectantly', this.mons[c].name)); judge(JUDGE.ONE_EXCLAMATION); }
				if (!s.hasJudgesAttention) {
					hearts(c, s.appeal, s.comboAppealBonus);
					s.appeal += s.comboAppealBonus;
				}
			}
			if (s.repeatedMove) {
				say(this.fmt('gText_RepeatedAppeal', this.mons[c].name));
				judge(JUDGE.SWIRL);
				hearts(c, s.appeal, -s.repeatJam);
				s.appeal -= s.repeatJam;
			}
			// APPEALSTATE_UPDATE_CROWD
			const X = this.excitement;
			if (X.frozen && c !== X.freezer) {
				say(this.fmt('gText_CrowdContinuesToWatchMon', this.mons[c].name, this.moveName(s.currMove), this.mons[X.freezer].name));
				say(this.fmt('gText_MonsMoveIsIgnored', this.mons[c].name, this.moveName(s.currMove)));
			} else {
				let r3 = X.moveExcitement;
				let what;
				if (s.overrideCategoryExcitementMod) { r3 = 1; what = this.moveName(s.currMove); }
				else what = this.D.text[['gText_Contest_Coolness', 'gText_Contest_Beauty', 'gText_Contest_Cuteness', 'gText_Contest_Smartness', 'gText_Contest_Toughness'][this.mv(s.currMove).cat]];
				if (r3 > 0 && s.repeatedMove) r3 = 0;
				this.applauseLevel += r3;
				if (this.applauseLevel < 0) this.applauseLevel = 0;
				if (r3 !== 0) {
					if (r3 < 0) say(this.fmt('gText_MonsXDidntGoOverWell', this.mons[c].name, null, what));
					else if (this.applauseLevel <= 4) say(this.fmt('gText_MonsXWentOverGreat', this.mons[c].name, null, what));
					else say(this.fmt('gText_MonsXGotTheCrowdGoing', this.mons[c].name, null, what));
					ev.push({ t: 'applause', level: this.applauseLevel, dir: r3 < 0 ? -1 : 1 });
					if (r3 > 0) {
						hearts(c, s.appeal, X.excitementAppealBonus);
						s.appeal += X.excitementAppealBonus;
					}
				}
			}
			this.applauseSlideOut(ev);
		}
		this.turnNumber++;
		return ev;
	}

	applauseSlideOut(ev) {
		if (this.applauseLevel > 4) { this.applauseLevel = 0; ev.push({ t: 'applause', level: 0, dir: 0 }); }
	}

	// one full appeal (all four turns + the round end). Returns { events, roundText }.
	playAppeal(playerChoice) {
		if (this.done) return null;
		this.chooseMoves(playerChoice);
		const events = [];
		this.turnNumber = 0;
		for (let t = 0; t < CONTESTANT_COUNT; t++) events.push(...this.doTurn());
		// Task_FinishRoundOfAppeals: RankContestants + SetAttentionLevels
		for (const s of this.st) s.pointTotal += s.appeal;
		const arr = this.st.map(s => s.pointTotal).sort((a, b) => b - a);
		this.st.forEach(s => { s.ranking = arr.indexOf(s.pointTotal); });
		this.sortContestants(true);
		this.applyNextTurnOrder();
		this.st.forEach(s => {
			s.attentionLevel = s.currMove === null ? 5 : s.appeal <= 0 ? 0 : s.appeal < 30 ? 1 : s.appeal < 60 ? 2 : s.appeal < 80 ? 3 : 4;
		});
		events.push({ t: 'sliders', totals: this.st.map(s => s.pointTotal) });
		events.push({ t: 'text', text: this.fmt(this.D.roundResults[this.st[PLAYER].attentionLevel], this.mons[PLAYER].name) });
		events.push({ t: 'reorder', order: [...this.turnOrder] });
		// Task_ResetForNextRound: SetContestantStatusesForNextRound
		this.history.push(this.st.map(s => s.currMove));
		for (const s of this.st) {
			Object.assign(s, {
				appeal: 0, baseAppeal: 0, jamSafetyCount: 0, jam: 0, resistant: false, jamReduction: 0, immune: false,
				moreEasilyStartled: false, usedRepeatableMove: false, nervous: false, effectStringId: null, effectStringId2: null,
				conditionMod: CONDITION_NO_CHANGE, repeatedPrevMove: s.repeatedMove, repeatedMove: false, turnOrderModAction: 0,
				appealTripleCondition: false, overrideCategoryExcitementMod: false,
			});
			if (s.numTurnsSkipped > 0) s.numTurnsSkipped--;
			if (s.turnSkipped) { s.numTurnsSkipped = 1; s.turnSkipped = false; }
			if (s.exploded) { s.noMoreTurns = true; s.exploded = false; }
		}
		for (const s of this.st) { s.prevMove = s.currMove; s.currMove = null; }
		this.excitement.frozen = false;
		this.appealNumber++;
		if (this.appealNumber === NUM_APPEALS) {
			events.push({ t: 'text', text: this.D.text.gText_AllOutOfAppealTime });
			this.finish();
		}
		return events;
	}

	// Task_EndAppeals: CalculateFinalScores + DetermineFinalStandings
	finish() {
		this.round2 = this.st.map(s => s.pointTotal * 2);
		this.total = this.round2.map((r2, i) => this.round1[i] + r2);
		const rnd = this.uniqueRandoms();
		const stand = [0, 1, 2, 3].map(i => ({ total: this.total[i], r1: this.round1[i], random: rnd[i], i }));
		const higher = (a, b) => a.total < b.total ? true : a.total > b.total ? false
			: a.r1 < b.r1 ? true : a.r1 > b.r1 ? false : a.random < b.random;
		for (let i = 0; i < CONTESTANT_COUNT - 1; i++) {
			for (let j = CONTESTANT_COUNT - 1; j > i; j--) {
				if (higher(stand[j - 1], stand[j])) { const t = stand[j - 1]; stand[j - 1] = stand[j]; stand[j] = t; }
			}
		}
		this.standings = [0, 0, 0, 0];
		stand.forEach((s, place) => { this.standings[s.i] = place; });
		this.winner = stand[0].i;
		this.done = true;
	}

	// results board: GetNumPreliminaryPoints / GetNumRound2Points (capped)
	stars(i) {
		const cond = (this.round1[i] << 16) >>> 0;
		let n = Math.floor(cond / 0x3F);
		if (n & 0xFFFF) n += 0x10000;
		n = n >>> 16;
		if (n === 0 && cond) n = 1;
		return Math.min(10, n);
	}
	round2Hearts(i) {
		const r = this.round2[i];
		const r4 = (Math.abs(r) << 16) >>> 0;
		let n = Math.floor(r4 / 80);
		if (n & 0xFFFF) n += 0x10000;
		n = n >>> 16;
		if (n === 0 && r4 !== 0) n = 1;
		n = Math.min(10, n);
		return r < 0 ? -n : n;
	}
	// ContestHall_EventScript_GetNumberOfHearts<Rank>: the audience hearts at the introduction
	introHearts(i) {
		const t = [[80, 70, 60, 50, 40, 30, 20, 10], [230, 210, 190, 170, 150, 130, 110, 90],
			[380, 350, 320, 290, 260, 230, 200, 170], [600, 560, 520, 480, 440, 400, 360, 320]][this.rank];
		const v = this.round1[i];
		for (let k = 0; k < t.length; k++) if (v > t[k]) return 8 - k;
		return 0;
	}
}
