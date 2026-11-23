// poketactica_mm_equip_test.mjs — CHANGING MOVES INSIDE A MYSTERY MAZE RUN (owner, 2026-11-23; MM_RULES_REV 13). A figurine
// can put on any move it knows (its pool) in place of one it has, or in an empty slot. It takes a turn. The PP of a move
// taken off comes back with it, so swapping is not a refill. It is recorded like any action, so a saved run and a
// replay come out the same.
//   node overworld/tests/poketactica_mm_equip_test.mjs
import * as MM from '../../poketactica/js/mm/turn.js';
import { dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { packActs, unpackActs, mmRecipe, mmRunTo, validMmRecipe } from '../../poketactica/js/mm/replay.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { mmFig as slimFig } from '../../poketactica/js/mm/replay.js';
import { makeRng } from '../rules/rng.js';
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const data = loadData();
/** Pikachu knowing six moves, four of them on; a partner Eevee knowing only what it has on. */
const pika = () => { const f = makeFigurine('pikachu', 30, makeRng('p'), data, { id: 'p', shinyRate: 0 }), ids = ['thunderbolt', 'quickattack', 'thunderwave', 'irontail', 'surf', 'dig']; return slimFig(equip({ ...f, pool: ids.map((id) => ({ id, lv: 1, xp: 0 })) }, ids.slice(0, 4))); };
const eevee = () => { const f = makeFigurine('eevee', 30, makeRng('e'), data, { id: 'e', shinyRate: 0 }); return slimFig(equip({ ...f, pool: [{ id: 'tackle', lv: 1, xp: 0 }, { id: 'growl', lv: 1, xp: 0 }] }, ['tackle', 'growl'])); };
const start = (rev) => { const S = MM.newRun('equip', { dungeon: dungeonById('whisper-woods'), party: [pika(), eevee()], ...(rev ? { rev } : {}) }, data); return { S, L: MM.leaderOf(S), P: MM.partyOf(S).find((u) => u.uid !== S.leader) }; };

{
	const { S, L, P } = start();
	const why = (a) => MM.actBlock(S, a, data);
	A(why({ t: 'equip', uid: L.uid, id: 'surf', out: 'irontail' }) === null, 'a move it knows may go on in place of one it has');
	A(/does not know/.test(why({ t: 'equip', uid: L.uid, id: 'hyperbeam', out: 'irontail' })) && /has that move on/.test(why({ t: 'equip', uid: L.uid, id: 'thunderbolt', out: 'irontail' }))
		&& /does not have/.test(why({ t: 'equip', uid: L.uid, id: 'surf', out: 'tackle' })) && /no empty slot/.test(why({ t: 'equip', uid: L.uid, id: 'surf' })) && /party/.test(why({ t: 'equip', uid: 'nobody', id: 'surf' })),
	'not a move it does not know, one it has on, in place of one it has not, or into a full set', [why({ t: 'equip', uid: L.uid, id: 'surf' })]);
	const turns = S.turns, full = data.moves.surf.pp;
	L.pp.irontail = 3;
	const evs = MM.act(S, { t: 'equip', uid: L.uid, id: 'surf', out: 'irontail' }, data);
	A(L.fig.equipped.join() === 'thunderbolt,quickattack,thunderwave,surf' && L.pp.surf === full && !('irontail' in L.pp) && S.turns === turns + 1 && evs.some((e) => e.t === 'equip' && e.id === 'surf' && e.out === 'irontail'),
		'Surf goes on in Iron Tail\'s slot with all its PP, and it takes a turn', [L.fig.equipped, L.pp]);
	L.pp.surf = 5;
	MM.act(S, { t: 'equip', uid: L.uid, id: 'irontail', out: 'surf' }, data);
	MM.act(S, { t: 'equip', uid: L.uid, id: 'surf', out: 'irontail' }, data);
	A(L.pp.surf === 5 && L.ppKept.irontail === 3, 'a move taken off keeps its PP: swapping it off and on again is not a refill', [L.pp.surf, L.ppKept]);
	// a partner, and an empty slot
	P.fig = { ...P.fig, pool: [...P.fig.pool, { id: 'bite', lv: 1, xp: 0 }] };
	A(why({ t: 'equip', uid: P.uid, id: 'bite' }) === null, 'a partner with a slot free may add a move');
	MM.act(S, { t: 'equip', uid: P.uid, id: 'bite' }, data);
	A(P.fig.equipped.join() === 'tackle,growl,bite' && P.pp.bite === data.moves.bite.pp, 'it goes into the empty slot');
}
{
	const { S, L } = start(12);
	A(/not in this run/.test(MM.actBlock(S, { t: 'equip', uid: L.uid, id: 'surf', out: 'irontail' }, data)), 'a run of an older revision has no such action');
}
{
	// recorded like any action: the recipe re-runs to the same run
	const { S, L } = start();
	const acts = [{ t: 'pass' }, { t: 'equip', uid: L.uid, id: 'surf', out: 'irontail' }, { t: 'pass' }, { t: 'equip', uid: L.uid, id: 'dig', out: 'quickattack' }, { t: 'pass' }];
	for (const a of acts) MM.act(S, a, data);
	const packed = packActs(acts), back = unpackActs(packed);
	A(JSON.stringify(back) === JSON.stringify(acts), 'the action packs and unpacks with the run\'s others');
	const rec = mmRecipe({ seed: 'equip', dungeonId: 'whisper-woods', party: [pika(), eevee()], acts, S });
	const R = mmRunTo(rec, null, data);
	A(rec.party[0].pool.length === 6 && rec.party[0].equipped.length === 4 && validMmRecipe(rec), 'a run carries every move a figurine knows, not only the four it has on (a battle\'s recipe keeps only those)', rec.party[0].pool.map((p) => p.id));
	A(MM.hashOf(R) === MM.hashOf(S) && MM.leaderOf(R).fig.equipped.join() === 'thunderbolt,dig,thunderwave,surf', 'a saved run and a replay come out with the same moves on', MM.leaderOf(R).fig.equipped);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
