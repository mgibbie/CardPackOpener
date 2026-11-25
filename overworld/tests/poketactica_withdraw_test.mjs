// poketactica_withdraw_test.mjs — WITHDRAW (battle RULES_REV 12; Plans/POKETACTICA_IMPROVEMENT_PLAN.md item 14; the
// permanent-loss plan deferred it): a figurine standing on its base tile that has not acted goes back to the reserve, as
// it is. It is how a hurt figurine is saved in a deadly battle. Never the last one on the map; not the turn it came out;
// out again only from the next turn. A battle recorded under rules 11 has no such action.
//   node overworld/tests/poketactica_withdraw_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { recipeOf, replayTo } from '../../poketactica/js/replay.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const fig = (sp, tag, lv = 50) => ({ ...makeFigurine(sp, lv, makeRng(sp + tag), data, { id: sp + tag, shinyRate: 0 }), ability: null });
const setup = (rev) => ({ map: { w: 9, h: 9, height: Array(81).fill(0), base: { x: 4, y: 7 }, ground: Array(81).fill(null) }, noBonus: true, rev: rev || B.RULES_REV,
	player: [fig('machamp', 'a'), fig('pikachu', 'b'), fig('eevee', 'c')], enemy: [{ fig: fig('snorlax', 'f', 5), x: 4, y: 0, ai: 'hold' }] });
const scene = (rev) => { const S = B.newBattle('wd', setup(rev), data); return { S, a: S.units[0], b: S.units[1], c: S.units[2] }; };
const act = (S, a) => B.act(S, a, data);
const end = (S) => act(S, { t: 'end' });

A(B.RULES_REV >= 12, 'the battle rules revision is 12 or later');

// ---------- the rule
{
	const { S, a, b } = scene();
	act(S, { t: 'deploy', uid: a.uid });
	A(act(S, { t: 'withdraw', uid: a.uid }).why === 'it has only just come out', 'the turn it is deployed it cannot withdraw');
	act(S, { t: 'move', uid: a.uid, x: 4, y: 6 });
	act(S, { t: 'deploy', uid: b.uid });
	end(S);
	A(S.turn === 2 && S.phase === 'player', '(turn 2)');
	A(act(S, { t: 'withdraw', uid: a.uid }).why === 'not on the base tile', 'only from the base tile');
	const hp = b.hp;
	b.hp = 11;
	const r = act(S, { t: 'withdraw', uid: b.uid });
	A(r.ok && b.x == null && b.y == null && b.acted && b.hp === 11 && r.events.some((e) => e.t === 'withdraw' && e.uid === b.uid) && B.onMap(S, 'p').length === 1, 'on the base tile, not yet acted: back to the reserve, as it is (its HP too)', [b.x, b.hp, hp]);
	A(act(S, { t: 'deploy', uid: b.uid }).why === 'it has only just come back', 'it cannot come straight out again the same turn');
	A(act(S, { t: 'move', uid: b.uid, x: 4, y: 6 }).why === 'not deployed' && act(S, { t: 'withdraw', uid: b.uid }).why === 'not deployed', 'off the map it does nothing');
	// the last one on the map cannot leave
	act(S, { t: 'move', uid: a.uid, x: 4, y: 7 });
	end(S);
	A(act(S, { t: 'withdraw', uid: a.uid }).why === 'the last one on the map cannot leave' && a.x === 4, 'the last one on the map stays: someone has to hold the field');
	// from the next turn it deploys again, with the HP it left with
	act(S, { t: 'move', uid: a.uid, x: 3, y: 7 });
	const d = act(S, { t: 'deploy', uid: b.uid });
	A(d.ok && b.x === 4 && b.y === 7 && b.hp === 11 && !b.acted, 'from the next turn it deploys again, with the HP it left with', [d.why, b.hp]);
}

// ---------- it is the figurine's action; an attack queued holds it
{
	const { S, a, b } = scene();
	act(S, { t: 'deploy', uid: a.uid }); act(S, { t: 'move', uid: a.uid, x: 4, y: 6 }); act(S, { t: 'deploy', uid: b.uid }); act(S, { t: 'move', uid: b.uid, x: 5, y: 7 });
	end(S);
	act(S, { t: 'move', uid: b.uid, x: 4, y: 7 });
	A(act(S, { t: 'withdraw', uid: b.uid }).ok && b.x == null, 'walked back onto the base tile this turn, then withdrew');
	const { S: S2, a: a2, b: b2 } = scene();
	act(S2, { t: 'deploy', uid: a2.uid }); act(S2, { t: 'move', uid: a2.uid, x: 4, y: 6 }); act(S2, { t: 'deploy', uid: b2.uid });
	end(S2);
	act(S2, { t: 'wait', uid: b2.uid });
	A(act(S2, { t: 'withdraw', uid: b2.uid }).why === 'already acted', 'not after it has acted');
}

// ---------- a withdrawn figurine is out of the foes' reach; a battle under rules 11 has no such action
{
	const { S, a, b } = scene();
	act(S, { t: 'deploy', uid: a.uid }); act(S, { t: 'move', uid: a.uid, x: 4, y: 6 }); act(S, { t: 'deploy', uid: b.uid });
	end(S);
	act(S, { t: 'withdraw', uid: b.uid });
	A(!B.onMap(S, 'p').includes(b) && B.view(S).units.find((u) => u.uid === b.uid).x == null, 'the board no longer has it (the view too)');
	const old = scene(11);
	act(old.S, { t: 'deploy', uid: old.a.uid }); act(old.S, { t: 'move', uid: old.a.uid, x: 4, y: 6 }); act(old.S, { t: 'deploy', uid: old.b.uid });
	end(old.S);
	A(old.S.rev === 11 && act(old.S, { t: 'withdraw', uid: old.b.uid }).why === 'not in this battle' && old.b.x === 4, 'a battle recorded under rules 11 has no Withdraw');
	A(old.b.cameIn === undefined, '(and keeps no note of when a figurine came out: it replays as it was)');
}

// ---------- a recipe with a Withdraw replays to the same battle
{
	const st = setup(), acts = [];
	const S = B.newBattle('wdrec', st, data);
	const go = (a) => { const r = B.act(S, a, data); if (r.ok) acts.push(a); return r; };
	go({ t: 'deploy', uid: S.units[0].uid }); go({ t: 'move', uid: S.units[0].uid, x: 4, y: 6 }); go({ t: 'deploy', uid: S.units[1].uid }); go({ t: 'end' });
	go({ t: 'withdraw', uid: S.units[1].uid }); go({ t: 'end' });
	const rec = recipeOf('wdrec', st, acts, { label: 'Withdraw', won: false });
	const R = rec && replayTo(rec, acts.length, data);
	A(rec && R && JSON.stringify(B.view(R)) === JSON.stringify(B.view(S)) && R.units[1].x == null, 'a replay re-runs the Withdraw to the very same battle', rec ? Object.keys(rec) : null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
