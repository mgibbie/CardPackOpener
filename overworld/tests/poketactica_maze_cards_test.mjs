// poketactica_maze_cards_test.mjs — Tower Defense, MAZE BUILDER, stage 2 (owner, 2026-11-24;
// Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): block CARDS, GOLD and REWARDS. A seed deals the same cards; the hand has a
// limit but a reward card is never lost to it; nothing is bought without the gold; gold stands where the Road mode has
// slots and energy; a wave cleared pays gold and offers a pick; a snapshot taken mid-build resumes exactly.
//   node overworld/tests/poketactica_maze_cards_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import { SHAPES, TETROMINOES } from '../../poketactica/js/td/maze.js';
import { TD_MAPS } from '../../poketactica/js/td/maps.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const J = JSON.stringify;
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '.....1......', '............', '............'],
	ground: ['gggggggggggg', 'ggggggggwggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggsgggggg', 'gggggggggggg', 'gggggggggggg'],
	gates: [[0, 3]], base: [11, 3] });
const squad = (n = 3, lv = 30) => ['pikachu', 'squirtle', 'charmander', 'bulbasaur', 'eevee', 'geodude'].slice(0, n).map((sp, i) => makeFigurine(sp, lv, makeRng('mzc' + i), data, { id: 'mzc' + i, shinyRate: 0 }));
const ap = (S, a) => TD.applyInput(S, a, data);
const fresh = (seed = 'cards', o = {}) => TD.newRun(seed, { map: FIELD, squad: squad(o.n || 3, o.lv || 30), ...(o.startWave ? { startWave: o.startWave } : {}) }, data);
/** Lay the hand's first card of this shape (the test puts one there if the deal had none). */
const lay = (S, shape, turns, x, y) => { let c = S.hand.find((k) => k.shape === shape); if (!c) c = C.addCard(S, shape); return ap(S, { t: 'block', card: c.id, turns, x, y }); };
const untilClear = (S, max = 20 * 120) => { ap(S, { t: 'call' }); for (let i = 0; i < max && !S.over && S.phase !== 'wave'; i++) TD.step(S, [], data); for (let i = 0; i < max && !S.over && S.phase === 'wave'; i++) TD.step(S, [], data); return S; };

// ---------- the bag
{
	const b0 = C.bagOf('s', 0);
	A(b0.length === 11 && J([...b0].sort()) === J([...C.BAG].sort()) && J(C.bagOf('s', 0)) === J(b0) && J(C.bagOf('s', 1)) !== J(b0) && J(C.bagOf('t', 0)) !== J(b0), 'a bag is the 11 shapes in a seeded order: the same for the same seed, another for the next bag');
	const S = { seed: 'deal', bag: [], bagN: 0, hand: [], nc: 0 };
	for (let i = 0; i < 22; i++) C.drawCard(S);
	const count = {}; for (const c of S.hand) count[c.shape] = (count[c.shape] || 0) + 1;
	A(Object.keys(count).length === 11 && Object.values(count).every((n) => n === 2) && new Set(S.hand.slice(0, 11).map((c) => c.shape)).size === 11, 'no repeats until the bag is empty: 22 draws are each shape twice');
	A(new Set(S.hand.map((c) => c.id)).size === 22, 'every card has its own id');
	const T = { seed: 'deal', bag: [], bagN: 0, hand: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], nc: 0 };
	A(C.deal(T, 3) === 2 && T.hand.length === C.HAND_MAX && C.deal(T, 3) === 0, 'a deal stops at the hand limit (6)');
	A(C.placeCost(0) === 20 && C.placeCost(5) === 70 && C.placeCost(11) === 130 && C.drawCost(0) === 5 && C.drawCost(2) === 15, 'the 1st figurine 20 gold, the 6th 70, the 12th 130; a draw 5, then 10, then 15');
	A(C.lateGold(0) === 60 && C.lateGold(10) === 310 && C.lateCards(0) === 0 && C.lateCards(10) === 11 && C.lateCards(20) === 33, 'a late start: 25 gold and 2 cards a skipped wave (cards in whole bags)');
}
// ---------- rewards
{
	let ok = true, kinds = {}, lifeUnhurt = 0, small = 0, bonus = 0;
	for (let n = 1; n <= 400; n++) {
		const boss = n % 10 === 0, r = C.rewardsOf('rw', n, boss, n % 2 === 0);
		if (r.opts.length !== (boss ? 4 : 3) || r.pick !== (boss ? 2 : 1)) ok = false;
		if (boss && !(r.opts[0].k === 'bonus' && TETROMINOES.includes(r.opts[0].shape))) ok = false;
		for (const k of ['gold', 'cards', 'life']) if (r.opts.filter((o) => o.k === k).length > 1) ok = false;
		if (new Set(r.opts.map((o) => J(o))).size !== r.opts.length) ok = false;
		for (const o of r.opts) {
			kinds[o.k] = (kinds[o.k] || 0) + 1;
			if (o.k === 'life' && n % 2) lifeUnhurt++;
			if (o.k === 'gold' && o.n !== 15 + n) ok = false;
			if (o.k === 'bonus') { bonus++; if (!SHAPES[o.shape] || !C.BONUSES.includes(o.bonus)) ok = false; if (o.shape === 'one') small++; }
		}
		if (J(C.rewardsOf('rw', n, boss, n % 2 === 0)) !== J(r)) ok = false;
	}
	A(ok, 'a cleared wave offers 3 rewards to pick 1 of (a boss wave: 4, pick 2, the first always a bonus tetromino); no two alike; the same for the same seed', kinds);
	A(kinds.bonus > kinds.gold && kinds.bonus > kinds.cards && kinds.gold > 50 && kinds.cards > 50 && kinds.life > 0 && kinds.life < kinds.cards && lifeUnhurt === 0, 'bonus blocks are the common reward, a life the rare one, and a life is only offered when one is missing', { ...kinds, lifeUnhurt });
	A(small > 0 && small < bonus * 0.06, 'a 1-tile bonus block is rare', { small, bonus });
}
// ---------- a run: the hand
{
	const S = fresh();
	A(S.gold === 60 && S.hand.length === 5 && S.energy === 0 && TD.slotsOf(S) === TD.SQUAD_MAX, 'a new run: 60 gold, 5 cards, no energy and no slots to open');
	A(J(fresh().hand) === J(S.hand) && J(fresh('other').hand) !== J(S.hand), 'the same seed deals the same cards');
	const card = S.hand[0];
	A(ap(S, { t: 'block', card: 'nope', turns: 0, x: 2, y: 0 }) === 'no such card' && ap(S, { t: 'block', shape: 'I', turns: 0, x: 2, y: 0 }) === 'no such card', 'a block needs its card');
	A(ap(S, { t: 'block', card: card.id, turns: 0, x: 2, y: 6 }) === null && S.hand.length === 4 && !S.hand.includes(card) && S.blocks[0].shape === card.shape, 'laying a block plays the card');
	A(ap(S, { t: 'block', card: card.id, turns: 0, x: 6, y: 6 }) === 'no such card', 'a card is played once');
	A(ap(S, { t: 'unblock', id: 'b0' }) === null && S.hand.length === 5 && S.hand[4].shape === card.shape && S.blocks.length === 0, 'a block taken back is a card in the hand again');
	// draws
	A(ap(S, { t: 'draw' }) === null && S.gold === 55 && S.hand.length === 6, 'a draw costs 5 gold');
	A(ap(S, { t: 'draw' }) === 'the hand is full' && S.gold === 55, 'not with a full hand');
	A(ap(S, { t: 'discard', card: S.hand[0].id }) === null && S.gold === 57 && S.hand.length === 5 && ap(S, { t: 'discard', card: 'nope' }) === 'no such card', 'a discard pays 2 gold');
	A(ap(S, { t: 'draw' }) === null && S.gold === 47, 'the next draw in the same round costs 10');
	S.gold = 14; ap(S, { t: 'discard', card: S.hand[0].id }); S.gold = 14;
	A(ap(S, { t: 'draw' }) === 'not enough gold' && S.hand.length === 5, 'not without the gold (15)');
}
// ---------- a run: figurines cost gold
{
	const S = fresh('place', { n: 6 });
	lay(S, 'I', 1, 4, 0); lay(S, 'three', 1, 4, 4);
	A(ap(S, { t: 'place', fig: 0, x: 4, y: 3 }) === null && S.gold === 40 && TD.view(S).placeCost === 30, 'the first figurine costs 20 gold; the next will cost 30');
	A(ap(S, { t: 'place', fig: 1, x: 4, y: 4 }) === null && S.gold === 10 && ap(S, { t: 'place', fig: 2, x: 4, y: 2 }) === 'not enough gold' && S.towers.length === 2, 'the second 30; the third (40) not without the gold');
	A(ap(S, { t: 'recall', uid: 't1' }) === null && S.gold === 40 && TD.freeSlots(S) === 11 && ap(S, { t: 'place', fig: 1, x: 4, y: 4 }) === null && S.gold === 10, 'recalled in the build phase it was placed in: all its gold back, and it can go straight out again (no resting slot)');
	A(ap(S, { t: 'spend', kind: 'slot' }) === 'no such thing' && ap(S, { t: 'spend', kind: 'swap', uid: 't0' }) === 'no such thing', 'there are no slots to buy and no swap');
	S.B.units.find((u) => u.uid === 't0').sp = 1;
	A(ap(S, { t: 'spend', kind: 'sp', uid: 't0' }) === null && S.gold === 2 && ap(S, { t: 'spend', kind: 'overdrive', uid: 't0' }) === 'not enough gold', 'gold buys the SP refill (8) and the Overdrive (15)');
	// the wave: knockouts pay gold; clearing pays gold, deals cards and offers a pick
	const g0 = S.gold, h0 = S.hand.length;
	untilClear(S);
	A(S.cleared === 1 && S.phase === 'wait' && S.kills > 0 && S.energy === 0, 'the wave is cleared (and no energy was earned: gold stands in for it)', { cleared: S.cleared, kills: S.kills, lives: S.lives });
	A(S.gold === g0 + S.kills * 1 + 10 + 1 + (S.lives === 20 ? 5 : 0), 'a knockout pays 1 gold at these levels; the wave 10 + its number, and 5 more with no leak', [g0, S.gold, S.kills, S.lives]);
	A(S.hand.length === Math.min(6, h0 + 3) && S.draws === 0, '3 cards are dealt for the next build phase (up to the limit)', [h0, S.hand.length]);
	A(S.pick && S.pick.pick === 1 && S.pick.opts.length === 3 && J(TD.view(S).pick.opts) === J(C.rewardsOf('place', 1, false, S.lives < 20).opts), 'and three rewards are on offer, as the seed says');
	A(ap(S, { t: 'call' }) === 'pick a reward first' && S.phase === 'wait', 'the next wave waits for the pick');
	// recall after a wave: half
	const g1 = S.gold;
	A(ap(S, { t: 'recall', uid: 't1' }) === null && S.gold === g1 + 15, 'recalled later: half its price back (15 of 30)');
	// lift
	S.gold = 14;
	A(ap(S, { t: 'lift', id: 'b0' }) === 'a figurine stands on it' && ap(S, { t: 'lift', id: 'b1' }) === 'not enough gold' && ap(S, { t: 'unblock', id: 'b1' }) === 'that block is locked', 'a locked block does not come back for free');
	S.gold = 15; const h1 = S.hand.length, len = S.paths[0].length;
	A(ap(S, { t: 'lift', id: 'b1' }) === null && S.gold === 0 && S.hand.length === h1 + 1 && S.hand[h1].shape === 'three' && S.paths[0].length < len && S.B.map.height[5 * 12 + 4] === 0, 'Lift (15 gold) takes a locked block with nobody on it back to the hand');
	const c = C.addCard(S, 'one'); ap(S, { t: 'block', card: c.id, turns: 0, x: 9, y: 6 });
	A(ap(S, { t: 'lift', id: S.blocks[S.blocks.length - 1].id }) === 'that block is not locked', 'a block laid this round is taken back, not lifted');
}
// ---------- picks
{
	const S = fresh('pick');
	A(ap(S, { t: 'pick', i: 0 }) === 'no such reward', 'no pick without a cleared wave');
	const offer = (opts, pick = 1) => { S.pick = { pick, opts }; };
	while (S.hand.length < 6) C.drawCard(S);
	offer([{ k: 'bonus', shape: 'T', bonus: 'tall' }, { k: 'gold', n: 16 }, { k: 'cards', n: 2 }]);
	A(ap(S, { t: 'pick', i: 0 }) === null && S.hand.length === 7 && S.hand[6].shape === 'T' && S.hand[6].bonus === 'tall' && S.pick === null, 'a reward card is never lost to a full hand: it is the 7th');
	A(ap(S, { t: 'draw' }) === 'the hand is full' && ap(S, { t: 'pick', i: 1 }) === 'no such reward', 'over the limit there is no drawing; one pick is one pick');
	const b = S.hand[6]; A(ap(S, { t: 'block', card: b.id, turns: 0, x: 1, y: 6 }) === null && S.blocks[0].bonus === 'tall' && TD.view(S).blocks[0].bonus === 'tall', 'a bonus card lays a bonus block');
	A(ap(S, { t: 'unblock', id: 'b0' }) === null && S.hand[S.hand.length - 1].bonus === 'tall', 'taken back, the card still has its bonus');
	offer([{ k: 'gold', n: 16 }, { k: 'cards', n: 2 }, { k: 'life' }]); const g = S.gold;
	A(ap(S, { t: 'pick', i: 0 }) === null && S.gold === g + 16, 'a gold reward is gold');
	offer([{ k: 'cards', n: 2 }]); const h = S.hand.length;
	A(ap(S, { t: 'pick', i: 0 }) === 'choose the shapes' && ap(S, { t: 'pick', i: 0, shapes: ['one'] }) === 'choose the shapes' && ap(S, { t: 'pick', i: 0, shapes: ['one', 'bogus'] }) === 'choose the shapes' && S.pick, 'two plain cards: the player names both shapes');
	A(ap(S, { t: 'pick', i: 0, shapes: ['one', 'I'] }) === null && S.hand.length === h + 2 && S.hand[h].shape === 'one' && S.hand[h + 1].shape === 'I' && !S.hand[h].bonus, 'and gets them');
	offer([{ k: 'life' }]); S.lives = 19; ap(S, { t: 'pick', i: 0 });
	offer([{ k: 'life' }]); ap(S, { t: 'pick', i: 0 });
	A(S.lives === 20, 'a life back, never past 20');
	offer([{ k: 'bonus', shape: 'L', bonus: 'ice' }, { k: 'gold', n: 5 }, { k: 'gold', n: 6 }, { k: 'cards', n: 2 }], 2);
	A(ap(S, { t: 'pick', i: 1 }) === null && S.pick && S.pick.pick === 1 && ap(S, { t: 'pick', i: 1 }) === 'no such reward' && ap(S, { t: 'pick', i: 0 }) === null && S.pick === null, 'after a boss wave: two picks, each reward once');
}
// ---------- nothing without the gold; exact
{
	const S = fresh('broke');
	lay(S, 'I', 1, 4, 0);
	untilClear(S);
	S.gold = 0;
	const h = TD.hashOf(S);
	const tries = [ap(S, { t: 'place', fig: 0, x: 4, y: 1 }), ap(S, { t: 'draw' }), ap(S, { t: 'lift', id: 'b0' }), ap(S, { t: 'spend', kind: 'overdrive', uid: 't0' })];
	A(tries.slice(0, 3).every((w) => w === 'not enough gold' || w === 'the hand is full') && tries[3] !== null && TD.hashOf(S) === h && S.gold === 0, 'with no gold, nothing is bought and nothing changes', tries);

	// a snapshot taken mid-build (a pick waiting, cards in hand, a block not yet locked) resumes exactly
	const R = fresh('resume');
	lay(R, 'I', 1, 4, 0); ap(R, { t: 'place', fig: 0, x: 4, y: 3 });
	untilClear(R);
	ap(R, { t: 'block', card: R.hand[0].id, turns: 0, x: 7, y: 6 });
	const snap = JSON.parse(J(TD.toSnapshot(R)));
	const rest = (X) => {
		ap(X, { t: 'pick', i: X.pick.opts.findIndex((o) => o.k !== 'cards') });
		ap(X, { t: 'draw' }); ap(X, { t: 'unblock', id: X.blocks[X.blocks.length - 1].id });
		ap(X, { t: 'block', card: X.hand[X.hand.length - 1].id, turns: 1, x: 8, y: 5 });
		untilClear(X); return X;
	};
	const a = rest(R), b = rest(TD.fromSnapshot(snap));
	A(a.tick === b.tick && a.cleared >= 1 && TD.hashOf(a) === TD.hashOf(b) && J(a.hand) === J(b.hand) && a.gold === b.gold && J(a.pick) === J(b.pick), 'a snapshot taken mid-build (through JSON) plays on to the very same run: gold, hand, pick and all', [a.tick, b.tick, a.gold, b.gold]);
	const c = fresh('resume'); const before = TD.hashOf(c); ap(c, { t: 'discard', card: c.hand[0].id });
	A(TD.hashOf(c) !== before, 'gold and the hand are part of the fingerprint');
}
// ---------- a late start; the Road mode
{
	const L = fresh('late', { startWave: 11 });
	A(L.gold === 310 && L.hand.length === 5 + 11 && L.wave === 10, 'a start from wave 11: 310 gold and a bag of cards on top of the opening five', [L.gold, L.hand.length]);
	const R = TD.newRun('road', { map: TD_MAPS[0], squad: squad() }, data), v = TD.view(R);
	A(R.gold === undefined && v.gold === undefined && v.hand === undefined && ['draw', 'discard', 'pick', 'lift'].every((t) => ap(R, { t, card: 'c0', i: 0, id: 'b0' }) !== null) && TD.slotsOf(R) === 3, 'a Road run has no gold, no hand and no picks: slots and energy as ever');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
