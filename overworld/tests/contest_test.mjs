// contest_test.mjs — Pokémon Contests, held to pokeemerald (unit; no browser).
//
// contest_engine.js against the decomp's own rules (src/contest.c,
// src/contest_effect.c, src/contest_ai.c, src/contest_util.c), with the GBA's
// Random() pinned:
//   * primary judging: CalculateContestantRound1Points (main stat + (two
//     neighbours + sheen) / 2)
//   * the first appeal order: SortContestants(FALSE) + ApplyNextTurnOrder —
//     the best round-1 score appeals first
//   * effects: BETTER_IF_FIRST's double, StartleFrontMon's 30-point jam and
//     its line (SetStartledString), AVOID_STARTLE's immunity, NEXT_APPEAL_LATER
//     sending the user to the back of the next line
//   * the crowd: an on-category appeal raises the applause meter and adds 10
//     (60 when it fills); a repeated move earns 20 off and no cheer
//   * combos: the starter draws the JUDGE's look, the finisher adds its base
//     appeal again
//   * final scoring: round 1 + appeal points x 2, ranked by DetermineFinalStandings
//   * the opponents' AI runs data/contest_ai_scripts.s with every command it uses
//   * entry rules (GetContestEntryEligibility), results-board stars/hearts,
//     the introduction hearts per rank
//
//   node overworld/tests/contest_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Contest, makeRng, entryEligibility, hasWonBefore } from '../contest_engine.js';
import { overworldSource } from './owsource.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/contest_emerald.json'), 'utf8'));
const FX = Object.fromEntries(D.effects.map((e, i) => [e.name, i]));
const moveWith = (fx, cat, not = []) => Object.keys(D.moves).find(id => D.moves[id].fx === FX[fx] && (cat == null || D.moves[id].cat === cat) && !not.includes(id));
// one move in every slot, so whatever the AI scores it appeals with that move
const opp = (nick, moves, cool = 0) => ({ nick, trainer: 'NPC', species: 'zigzagoon', moves: [0, 1, 2, 3].map(i => moves[i % moves.length]), cool, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0, ai: 1 }); // CHECK_BAD_MOVE: its empty slots score 0
const player = (moves, c = {}) => ({ name: 'HERO', trainer: 'ME', species: 'pikachu', moves, cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0, ...c });
const texts = ev => ev.filter(e => e.t === 'text').map(e => e.text.replace(/\n/g, ' '));

// ---------- the data ----------
A(D.effects.length === 48 && D.effects.every(e => e.fn), 'all 48 contest effects are harvested with their gContestEffectFuncs entry');
A(Object.keys(D.moves).length >= 350, 'every gContestMoves entry is harvested', String(Object.keys(D.moves).length));
A(D.opponents.length === 96 && D.opponents.every(o => o.ai > 0 && o.moves.length === 4), 'the 96 NPC contestants carry their aiFlags and movesets');
A(D.ai.table.length === 32 && D.ai.code.length > 500, 'the contest AI scripts are compiled for the interpreter');

// ---------- primary judging + the first order ----------
const HA = moveWith('HIGHLY_APPEALING', 4); // a TOUGH move: no cheer in a COOL contest
{
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(5),
		opponents: [opp('A', [HA], 50), opp('B', [HA], 30), opp('C', [HA], 10)],
		player: player([HA], { cool: 100, tough: 40, beauty: 20, sheen: 61 }) });
	A(c.round1[3] === 100 + Math.trunc((40 + 20 + 61) / 2), 'round 1 = COOL + (TOUGH + BEAUTY + sheen) / 2', String(c.round1[3]));
	A(c.round1[0] === 50 && c.round1[2] === 10, 'an opponent scores the same way', JSON.stringify(c.round1));
	A(JSON.stringify(c.turnOrder) === JSON.stringify([1, 2, 3, 0]), 'the best round-1 score appeals first, then down the line', JSON.stringify(c.turnOrder));
	const beauty = new Contest({ data: D, category: 1, rank: 0, rng: makeRng(5),
		opponents: [opp('A', [HA]), opp('B', [HA]), opp('C', [HA])], player: player([HA], { beauty: 10, cool: 20, cute: 30, sheen: 1 }) });
	A(beauty.round1[3] === 10 + Math.trunc((20 + 30 + 1) / 2), 'a BEAUTY contest leans on COOL and CUTE', String(beauty.round1[3]));
}

// ---------- effects ----------
{
	const FIRST = moveWith('BETTER_IF_FIRST');
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(9),
		opponents: [opp('A', [HA], 5), opp('B', [HA], 4), opp('C', [HA], 3)], player: player([FIRST], { cool: 200 }) });
	const ev = c.playAppeal(0);
	const cheer = [1, 0, -1, -1, 0][D.moves[FIRST].cat] > 0 ? 10 : 0;
	A(c.st[3].pointTotal === 20 + 2 * 20 + cheer, 'BETTER_IF_FIRST: 20 + twice its appeal when it opens', String(c.st[3].pointTotal));
	A(texts(ev).some(t => /hustled even more/.test(t)), 'with the decomp line for it', texts(ev).join(' | '));
}
{
	const STARTLE = moveWith('STARTLE_PREV_MON'); // ContestEffect_StartleFrontMon, jam 30
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(3),
		opponents: [opp('A', [STARTLE], 50), opp('B', [HA], 4), opp('C', [HA], 3)], player: player([HA], { cool: 200 }) });
	const ev = c.playAppeal(0);
	A(c.st[3].pointTotal === 40 - 30, 'STARTLE_PREV_MON (StartleFrontMon) jams the appeal in front by 30', String(c.st[3].pointTotal));
	A(texts(ev).some(t => /HERO couldn't help uttering a cry/.test(t)), 'and the jammed contestant cries out (SetStartledString 30)', texts(ev).join(' | '));
}
{
	const STARTLE = moveWith('STARTLE_PREV_MON'); // ContestEffect_StartleFrontMon, jam 30
	const AVOID = moveWith('AVOID_STARTLE');
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(3),
		opponents: [opp('A', [STARTLE], 50), opp('B', [HA], 4), opp('C', [HA], 3)], player: player([AVOID], { cool: 200 }) });
	const ev = c.playAppeal(0);
	const base = D.effects[FX.AVOID_STARTLE].appeal;
	const cheer = [1, 0, -1, -1, 0][D.moves[AVOID].cat] > 0 ? 10 : 0;
	A(c.st[3].pointTotal === base + cheer, 'AVOID_STARTLE: the startle misses', String(c.st[3].pointTotal));
	A(texts(ev).some(t => /managed to avoid seeing it/.test(t)), 'CanUnnerveContestant: "managed to avoid seeing it"', texts(ev).join(' | '));
}
{
	const LATER = moveWith('NEXT_APPEAL_LATER');
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(4),
		opponents: [opp('A', [HA], 5), opp('B', [HA], 4), opp('C', [HA], 3)], player: player([LATER], { cool: 200 }) });
	c.playAppeal(0);
	A(c.turnOrder[3] === 3, 'NEXT_APPEAL_LATER: the user appeals last next turn', JSON.stringify(c.turnOrder));
}

// ---------- the crowd + repeats ----------
{
	const COOL = moveWith('HIGHLY_APPEALING', 0);
	const COOL2 = moveWith('HIGHLY_APPEALING', 0, [COOL]);
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(11),
		opponents: [opp('A', [HA], 5), opp('B', [HA], 4), opp('C', [HA], 3)], player: player([COOL, COOL2], { cool: 200 }) });
	let ev = c.playAppeal(0);
	A(c.st[3].pointTotal === 40 + 10 && c.applauseLevel === 1, 'an on-category appeal: the meter rises and adds 10', JSON.stringify({ t: c.st[3].pointTotal, a: c.applauseLevel }));
	A(texts(ev).some(t => /coolness went over great/.test(t)), '"…went over great"', texts(ev).join(' | '));
	ev = c.playAppeal(0); // the same move again
	A(c.st[3].pointTotal === 50 + 40 - 20 && c.applauseLevel === 1, 'a repeated move: 20 off (moveRepeatCount+1)*10 and no cheer', JSON.stringify({ t: c.st[3].pointTotal, a: c.applauseLevel }));
	A(texts(ev).some(t => /repeating an appeal/.test(t)), 'the JUDGE is disappointed by the repeat', texts(ev).join(' | '));
	for (let i = 0; i < 3; i++) c.playAppeal(i % 2 ? 0 : 1);
	A(c.done && c.total.every((t, i) => t === c.round1[i] + 2 * c.st[i].pointTotal), 'final: round 1 + appeal points x 2 (CalculateFinalScores)', JSON.stringify(c.total));
	const order = [0, 1, 2, 3].sort((a, b) => c.standings[a] - c.standings[b]);
	A(order.every((k, i) => i === 0 || c.total[order[i - 1]] > c.total[k] || (c.total[order[i - 1]] === c.total[k] && c.round1[order[i - 1]] >= c.round1[k])),
		'standings by total, ties to round 1 (DidContestantPlaceHigher)', JSON.stringify({ total: c.total, standings: c.standings }));
}
{
	// the applause meter tops out: the fifth cheer pays 60 and resets the meter
	const COOL = moveWith('HIGHLY_APPEALING', 0);
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(12),
		opponents: [opp('A', [moveWith('HIGHLY_APPEALING', 0, [COOL])], 5), opp('B', [moveWith('USER_MORE_EASILY_STARTLED', 0)], 4), opp('C', [HA], 3)],
		player: player([COOL, moveWith('GREAT_APPEAL_BUT_NO_MORE_MOVES')], { cool: 200 }) });
	const ev = c.playAppeal(0);
	c.playAppeal(1);
	const ev3 = c.playAppeal(0);
	A([...ev, ...ev3].some(e => e.t === 'hearts' && e.delta === 60), 'filling the meter pays the 60-point bonus', '');
	A(c.st[3].noMoreTurns, 'GREAT_APPEAL_BUT_NO_MORE_MOVES ends the user\'s appeals');
	A(texts(ev3).some(t => /watching the others/.test(t)), 'after which it only watches', texts(ev3).join(' | '));
}

// ---------- combos ----------
{
	const ids = Object.keys(D.moves);
	let pair = null;
	for (const a of ids) {
		const s = D.moves[a].starter;
		if (!s) continue;
		const b = ids.find(x => x !== a && D.moves[x].combos.includes(s) && D.effects[D.moves[x].fx].name === 'HIGHLY_APPEALING');
		if (b) { pair = [a, b]; break; }
	}
	A(!!pair, 'the move table has combo starters and finishers', JSON.stringify(pair));
	const c = new Contest({ data: D, category: 4, rank: 0, rng: makeRng(21),
		opponents: [opp('A', [HA], 5), opp('B', [HA], 4), opp('C', [HA], 3)], player: player(pair, { tough: 200 }) });
	const ev1 = c.playAppeal(0);
	A(texts(ev1).some(t => /looked at HERO expectantly/.test(t)) && c.st[3].hasJudgesAttention, 'the starter draws the JUDGE\'s attention', texts(ev1).join(' | '));
	const before = c.st[3].pointTotal;
	const ev2 = c.playAppeal(1);
	const base = D.effects[D.moves[pair[1]].fx].appeal;
	A(texts(ev2).some(t => /combo went over well/.test(t)), 'the finisher completes the combo', texts(ev2).join(' | '));
	A(ev2.some(e => e.t === 'hearts' && e.who === 3 && e.delta === base), 'the combo adds the finisher\'s base appeal again', JSON.stringify(ev2.filter(e => e.t === 'hearts' && e.who === 3)));
	A(c.st[3].pointTotal - before >= 2 * base, 'and it lands in the total', String(c.st[3].pointTotal - before));
}

// ---------- the AI, with the real opponents ----------
{
	let err = null, games = 0, badPick = 0;
	try {
		for (let seed = 1; seed <= 40; seed++) for (let cat = 0; cat < 5; cat++) for (let rank = 0; rank < 4; rank++) {
			const c = new Contest({ data: D, category: cat, rank, rng: makeRng(seed * 977 + cat * 31 + rank),
				player: player(['pound', 'growl', 'tackle', 'leer'], { cool: 40, beauty: 40, cute: 40, smart: 40, tough: 40, sheen: 40 }) });
			let n = 0;
			while (!c.done) {
				c.chooseMoves(n % 4);
				for (let i = 0; i < 3; i++) if (!c.isTurnDisabled(i) && !c.st[i].currMove) badPick++;
				c.turnNumber = 0;
				// play the round the engine's way (chooseMoves again inside playAppeal)
				c.playAppeal(n++ % 4);
			}
			games++;
		}
	} catch (e) { err = e.message; }
	A(!err && games === 800, 'the AI scripts run every contest at every rank without an unported command', err || String(games));
	A(badPick === 0, 'an able opponent always picks one of its moves', String(badPick));
}
{
	// the draw is the decomp's: same seed, same contest
	const run = seed => {
		const c = new Contest({ data: D, category: 2, rank: 1, rng: makeRng(seed), player: player(['pound', 'growl'], { cute: 90 }) });
		while (!c.done) c.playAppeal(0);
		return JSON.stringify([c.mons.map(m => m.name), c.total, c.standings]);
	};
	A(run(77) === run(77) && run(77) !== run(78), 'Random() is the GBA LCG: a pinned seed replays exactly');
}

// ---------- entry, results board, introduction ----------
{
	const mon = { ribbons: [] };
	A(entryEligibility(mon, 0, 0) === 'equal' && entryEligibility(mon, 0, 1) === 'low', 'a ribbonless mon may enter NORMAL only');
	mon.ribbons.push('cool-normal');
	A(entryEligibility(mon, 0, 1) === 'equal' && entryEligibility(mon, 0, 0) === 'high' && entryEligibility(mon, 1, 1) === 'low',
		'a COOL NORMAL RIBBON opens COOL SUPER, flags a rematch, and opens nothing in BEAUTY');
	A(hasWonBefore(mon, 0, 0) && !hasWonBefore(mon, 0, 1), 'HasMonWonThisContestBefore follows the ribbon');
	A(entryEligibility({ hp: 0 }, 0, 0) === 'fainted' && entryEligibility({ isEgg: true }, 0, 0) === 'egg', 'eggs and fainted POKeMON are turned away');
	const c = new Contest({ data: D, category: 0, rank: 0, rng: makeRng(1), opponents: [opp('A', [HA], 0), opp('B', [HA], 63), opp('C', [HA], 64)], player: player([HA], { cool: 255, tough: 255, beauty: 255, sheen: 255 }) });
	while (!c.done) c.playAppeal(0);
	A(c.stars(0) === 0 && c.stars(1) === 1 && c.stars(2) === 2 && c.stars(3) === 10, 'GetNumPreliminaryPoints: round 1 / 63, rounded up, capped at 10', [0, 1, 2, 3].map(i => c.stars(i)).join(','));
	A([0, 1, 2, 3].every(i => c.round2Hearts(i) === Math.min(10, Math.ceil(c.round2[i] / 80))), 'GetNumRound2Points: round 2 / 80, rounded up, capped at 10');
	A(c.introHearts(1) === 6 && c.introHearts(0) === 0 && c.introHearts(3) === 8, 'the NORMAL rank introduction hearts (GetNumberOfHeartsNormal)', [0, 1, 2, 3].map(i => c.introHearts(i)).join(','));
}

// ---------- wiring ----------
{
	const mn = overworldSource();
	A(/emerald_MUS_CONTEST'/.test(mn), 'the stage theme takes over during the appeal round');
	A(/contestReception\(\)/.test(mn), 'the lobby counter runs the reception script');
	A(/'magepunk_contest_v1'/.test(fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8')), 'contest progress joins the canonical save inventory');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
