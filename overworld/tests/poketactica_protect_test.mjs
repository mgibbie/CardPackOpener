// poketactica_protect_test.mjs — PROTECT (and Detect, and every move with the same effect) holds until its user's next
// turn. Two bugs with one root (battle RULES_REV 9, MM_RULES_REV 9):
//   - in a turn-based battle it was dropped at the end of its user's OWN phase, before any foe had moved: it blocked nothing;
//   - in Mystery Maze nothing ever dropped it: a wild Pokémon that used it once could not be hurt by a move again, for
//     the rest of the floor (found by the auto-explorer, which stood attacking a protected Aron until it starved), and
//     a player's own figurine was as safe for the rest of the run.
// Now it comes down when its user's next turn begins, and a second one running fails (as it all but does in Pokémon).
// Recordings made under the older revisions replay as they were played.
//   node overworld/tests/poketactica_protect_test.mjs
import { loadData, mazeRun } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import * as MM from '../../poketactica/js/mm/turn.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();

const fig = (sp, moves) => { let f = makeFigurine(sp, 50, makeRng(sp), data, { id: sp, shinyRate: 0 }); f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null }; };
/** Machamp (the player's, knows Protect and Tackle) on the base; a Squirtle beside it that attacks ('aggro') or stands ('hold'). */
function duel(rev, ai = 'aggro') {
	const S = B.newBattle('protect', { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 2, y: 2 }, ground: Array(25).fill(null) }, noBonus: true, rev, player: [fig('machamp', ['protect', 'tackle'])],
		enemy: [{ fig: fig('squirtle', ['tackle', 'protect']), x: 2, y: 1, ai }] }, data);
	B.act(S, { t: 'deploy', uid: S.units[0].uid }, data);
	return { S, me: S.units[0], foe: S.units[1] };
}
const queue = (S, u, move, x, y) => B.act(S, { t: 'attack', uid: u.uid, move, x, y }, data);
const endPhase = (S) => { S.log.length = 0; B.act(S, { t: 'end' }, data); return S.log.map((e) => e.t + (e.by ? ':' + e.by : '') + (e.why ? ':' + e.why : '')); };

// ---------- turn-based battles
{
	const { S, me } = duel(B.RULES_REV);
	queue(S, me, 'protect', me.x, me.y);
	const hp = me.hp, log = endPhase(S);
	A(me.hp === hp && log.includes('guard') && !log.includes('hit'), 'a Protect put up in your phase holds through the foe\'s: it takes no hit (the foe sees it and does not waste the attack)', log);
	A(me.guard === false && S.phase === 'player', 'and it is down again when your next phase begins');
	// twice running: the second fails, and the foe's attack lands
	queue(S, me, 'protect', me.x, me.y);
	const log2 = endPhase(S);
	A(me.hp < hp && log2.includes('fail:twice in a row'), 'used again straight away, it fails and the attack lands', log2);
	// a turn later it works again
	queue(S, me, 'protect', me.x, me.y);
	const hp3 = me.hp, log3 = endPhase(S);
	A(me.hp === hp3 && log3.includes('guard') && !log3.includes('hit'), 'the turn after that it works again', log3);
}
{
	// the bug, kept for old recordings: under rev 8 the Protect was dropped before the foe moved
	const { S, me } = duel(8);
	queue(S, me, 'protect', me.x, me.y);
	const hp = me.hp, log = endPhase(S);
	A(me.hp < hp && !log.includes('blocked:protect'), 'a battle recorded under rev 8 replays as it was played (the Protect blocked nothing)', log);
}
{
	// a foe's Protect covers your next phase, then comes down
	const { S, me, foe } = duel(B.RULES_REV, 'hold');
	B.useMoveAt(S, foe, { move: 'protect', x: foe.x, y: foe.y }, data);
	const hp = foe.hp; B.useMoveAt(S, me, { move: 'tackle', x: foe.x, y: foe.y }, data);
	A(foe.hp === hp && foe.guard === true, 'a foe\'s Protect blocks your attack');
	endPhase(S);   // (your phase ends; the foe's begins, and its Protect comes down)
	B.useMoveAt(S, me, { move: 'tackle', x: foe.x, y: foe.y }, data);
	A(foe.hp < hp && foe.guard === false, 'and is down after the foe\'s own next phase begins');
	const f = B.forecast(S, me, 'tackle', foe.x, foe.y, data).targets[0];
	A(!f.immune, 'the forecast no longer calls it protected');
}

// ---------- Mystery Maze
{
	const run = (rev) => {
		const S = mazeRun(data), L = MM.leaderOf(S), foe = MM.wildOf(S).find((w) => Math.abs(w.x - L.x) + Math.abs(w.y - L.y) === 1);
		for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p' && S.units[i] !== foe) S.units.splice(i, 1);
		if (rev) { S.rev = rev; S.B.rev = 8; }
		foe.maxHP = foe.hp = 9999; foe.nap = false; foe.stone = true;   // (it stands there: only its Protect is being tested)
		return { S, L, foe };
	};
	const strike = (S, L, foe) => { const hp = foe.hp; B.useMoveAt(S.B, L, { move: 'swift', x: foe.x, y: foe.y }, data); S.B.log.length = 0; return hp - foe.hp; };
	{
		const { S, L, foe } = run();
		foe.stone = false;
		B.useMoveAt(S.B, foe, { move: 'protect', x: foe.x, y: foe.y }, data);
		A(foe.guard === true && strike(S, L, foe) === 0, 'in the maze a wild Pokémon\'s Protect blocks the next attack');
		foe.stone = true; foe.nap = false;
		for (let i = 0; i < 3; i++) MM.act(S, { t: 'pass' }, data);
		A(foe.guard === false && strike(S, L, foe) > 0, 'and comes down when its next turn begins (it never did: it could not be hurt again)', foe.guard);
	}
	{
		const { S, L, foe } = run(8);
		B.useMoveAt(S.B, foe, { move: 'protect', x: foe.x, y: foe.y }, data);
		for (let i = 0; i < 12; i++) MM.act(S, { t: 'pass' }, data);
		A(foe.guard === true && strike(S, L, foe) === 0, 'a maze run recorded under rev 8 replays as it was played (still protected 12 turns on)');
	}
	{
		const { S, L } = run();
		B.useMoveAt(S.B, L, { move: 'protect', x: L.x, y: L.y }, data);
		A(L.guard === true, 'the leader\'s own Protect goes up');
		MM.act(S, { t: 'pass' }, data); MM.act(S, { t: 'pass' }, data);
		A(L.guard === false, 'and is down by its next turn: it is not safe for the rest of the run');
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
