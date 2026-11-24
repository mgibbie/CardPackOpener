// poketactica_maze_bonus_test.mjs — Tower Defense, MAZE BUILDER, stage 3 (owner, 2026-11-24: "bonuses on blocks, from what
// battles already have"; Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): BONUS BLOCKS. A card may carry Tall, a terrain (Water,
// Lava, Grass, Ice) or a Geo colour (red, blue, purple). For each kind: the figurine standing on that block really gets
// it (a real hit by the battle rules, the same dice from a plain block and from the bonus one), and the ground is as it
// was when the block comes back.
//   node overworld/tests/poketactica_maze_bonus_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as B from '../../poketactica/js/engine/battle.js';
import * as Geo from '../../poketactica/js/engine/geo.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '.....1......', '............', '............'],
	ground: ['gggggggggggg', 'ggggggggwggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggsgggggg', 'gggggggggggg', 'gggggggggggg'],
	gates: [[0, 3]], base: [11, 3] });
const MOVES = ['tackle', 'watergun', 'ember', 'vinewhip', 'icebeam', 'hydropump'];
const fig = (sp, moves) => { let f = makeFigurine(sp, 40, makeRng('mzb' + sp), data, { id: 'mzb-' + sp, shinyRate: 0 }); f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null, held: null }; };
const ap = (S, a) => TD.applyInput(S, a, data);
const near = (a, b, tol = 0.035) => Math.abs(a - b) <= tol;

/**
 * A run with a plain 1-tile block at (3, 2) and a `bonus` 1-tile block at (3, 4), either side of the way, and a sturdy
 * foe on the way between them at (3, 3). hit(move, where) = the damage of a real hit from that block (same dice).
 */
function scene(bonus) {
	const S = TD.newRun('bonus', { map: FIELD, squad: [fig('mew', MOVES.slice(0, 4)), fig('mewtwo', MOVES.slice(2))] }, data);
	S.gold = 999;
	const plain = C.addCard(S, 'one'), card = C.addCard(S, 'one', bonus);
	const why = [ap(S, { t: 'block', card: plain.id, turns: 0, x: 3, y: 2 }), ap(S, { t: 'block', card: card.id, turns: 0, x: 3, y: 4 })];
	const foe = B.makeUnit(makeFigurine('snorlax', 40, makeRng('foe'), data, { id: 'foe', shinyRate: 0 }), 'e0', 'e', 3, 3, 'hold', data);
	foe.ability = null; foe.maxHP = 1e6; foe.hp = 1e6; foe.stats = { ...foe.stats, def: 8, spd: 8 };   // (soft, so the numbers are big enough to compare)
	S.B.units.push(foe);
	const hit = (figIdx, move, where) => {
		const y = where === 'bonus' ? 4 : 2;
		if (ap(S, { t: 'place', fig: figIdx, x: 3, y })) return -1;
		const u = S.B.units.find((x) => x.uid === 't' + figIdx);
		S.B.rng = makeRng('dice').state(); S.B.combo = 0; foe.hp = 1e6; foe.facing = where === 'bonus' ? 's' : 'n';   // (it faces whoever hits it: the same from either side) foe.status = null; foe.boosts = { ...foe.boosts, def: 0, spd: 0 };
		B.useMoveOn(S.B, u, move, [foe], data);
		const n = 1e6 - foe.hp;
		ap(S, { t: 'recall', uid: u.uid });
		return n;
	};
	const ratio = (figIdx, move) => { const a = hit(figIdx, move, 'plain'), b = hit(figIdx, move, 'bonus'); return a > 0 ? b / a : -1; };
	return { S, why, foe, hit, ratio };
}

// ---------- the list
{
	A(C.BONUSES.join() === 'tall,water,lava,grass,ice,red,blue,purple' && C.BONUSES.every((k) => C.BONUS[k].name && C.BONUS[k].text), 'eight bonuses, each with a name and a line of text');
	const plain = scene(null);
	A(plain.why.every((w) => w === null) && near(plain.ratio(0, 'tackle'), 1, 0.001) && plain.hit(0, 'tackle', 'plain') > 0, 'two plain blocks: the same hit from either (the dice are the same)');
	A(plain.S.B.symbols.filter((g) => g.panel).length === 3 && plain.S.B.symbols.every((g) => !g.panel || g.x === -1) && Geo.effectsAt(plain.S.B, 3, 4).length === 0, 'the panel colours do nothing where no block carries them');
}
// ---------- Tall
{
	const T = scene('tall'), W = 12;
	A(T.S.B.map.height[4 * W + 3] === 2 && T.S.B.map.height[2 * W + 3] === 1, 'a Tall block is two levels up (a plain one is one)');
	A(near(T.ratio(0, 'tackle'), 1.2 / 1.1), 'from it, a hit is 20% over the ground\'s instead of 10%', T.ratio(0, 'tackle'));
	A(ap(T.S, { t: 'unblock', id: 'b1' }) === null && T.S.B.map.height[4 * W + 3] === 0, 'taken back, the ground is flat again');
}
// ---------- terrain
for (const [bonus, ground, move, figIdx, other] of [['water', 'water', 'watergun', 0, 'ember'], ['lava', 'lava', 'ember', 0, 'watergun'], ['grass', 'tallgrass', 'vinewhip', 0, 'tackle'], ['ice', 'ice', 'icebeam', 1, 'ember']]) {
	const T = scene(bonus), W = 12, i = 4 * W + 3;
	A(T.S.B.map.ground[i] === ground && T.S.B.map.ground[2 * W + 3] === 'grass', `a ${C.BONUS[bonus].name} block is ${ground} ground`);
	A(near(T.ratio(figIdx, move), 1.2) && near(T.ratio(figIdx, other), 1, 0.001), `${move} from it hits 20% harder; ${other} does not`, [T.ratio(figIdx, move), T.ratio(figIdx, other)]);
	A(!T.S.open[i] && T.S.paths[0].every(([x, y]) => !(x === 3 && y === 4)), 'and it is still a block: no way through');
	A(ap(T.S, { t: 'unblock', id: 'b1' }) === null && T.S.B.map.ground[i] === 'grass' && T.S.hand[T.S.hand.length - 1].bonus === bonus, 'taken back, the ground is grass again and the card keeps its bonus');
}
// ---------- Geo colours
{
	const R = scene('red');
	A(Geo.colorAt(R.S.B, 3, 4) === 'red' && Geo.colorAt(R.S.B, 3, 2) == null, 'a Red panel block is red');
	A(near(R.ratio(0, 'tackle'), 1.2) && near(R.ratio(0, 'watergun'), 1, 0.001), 'Attack +20% on it: a physical move hits harder, a special one does not', [R.ratio(0, 'tackle'), R.ratio(0, 'watergun')]);
	const Bl = scene('blue');
	A(near(Bl.ratio(0, 'watergun'), 1.2) && near(Bl.ratio(0, 'tackle'), 1, 0.001), 'a Blue panel: Sp. Atk +20%', [Bl.ratio(0, 'watergun'), Bl.ratio(0, 'tackle')]);
	const P = scene('purple');
	P.foe.stats = { ...P.foe.stats, spe: 9999 };   // (quick: hard to hit)
	const chance = (y) => { P.foe.facing = y === 4 ? 's' : 'n'; ap(P.S, { t: 'place', fig: 1, x: 3, y }); const u = P.S.B.units.find((x) => x.uid === 't1'); const f = B.forecast(P.S.B, u, 'hydropump', 3, 3, data); ap(P.S, { t: 'recall', uid: 't1' }); return f && f.targets[0] ? f.targets[0].hit : -1; };
	const from = [chance(2), chance(4)];
	A(from[0] > 0 && from[0] < 100 && from[1] === 100, 'a Purple panel: a move that can miss from a plain block cannot from it', from);
	A(ap(R.S, { t: 'unblock', id: 'b1' }) === null && Geo.colorAt(R.S.B, 3, 4) == null, 'taken back, the colour goes with it');
	// two panels of one colour share the one effect; another colour's does not leak
	const two = scene('red'); const c2 = C.addCard(two.S, 'one', 'blue'); ap(two.S, { t: 'block', card: c2.id, turns: 0, x: 6, y: 6 });
	A(Geo.effectsAt(two.S.B, 3, 4).length === 1 && Geo.effectsAt(two.S.B, 3, 4)[0].stat === 'atk' && Geo.effectsAt(two.S.B, 6, 6)[0].stat === 'spa', 'each colour has its own effect');
}
// ---------- locked, lifted, snapshot
{
	const T = scene('water'); T.S.B.units = T.S.B.units.filter((u) => u.uid !== 'e0');
	const snap = JSON.parse(JSON.stringify(TD.toSnapshot(T.S)));
	const R = TD.fromSnapshot(snap);
	A(R.B.map.ground[4 * 12 + 3] === 'water' && TD.hashOf(R) === TD.hashOf(T.S) && R.blocks[1].bonus === 'water', 'a snapshot keeps a bonus block as it is');
	ap(R, { t: 'call' }); for (let i = 0; i < 20 * 120 && (R.phase === 'wave' || R.wave < 1); i++) TD.step(R, [], data);
	R.gold = 99;
	A(R.blocks[1].locked && ap(R, { t: 'lift', id: 'b1' }) === null && R.B.map.ground[4 * 12 + 3] === 'grass' && R.hand[R.hand.length - 1].bonus === 'water', 'Lift brings a locked bonus block back: the ground is as it was, the card keeps its bonus', [R.phase, R.wave]);
}
// ---------- a battle is not touched by the panel rule
{
	const S = B.newBattle('geo', { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 2, y: 2 }, geo: Array(25).fill(null).map((_, i) => (i === 0 || i === 6 ? 'red' : null)), symbols: [{ x: 0, y: 0, color: 'red', effect: { k: 'noMiss' } }] }, noBonus: true, player: [], enemy: [] }, data);
	A(Geo.effectsAt(S, 1, 1).length === 1 && Geo.effectsAt(S, 2, 2).length === 0 && !S.symbols.some((g) => g.panel), 'in a battle a symbol still powers its own tile\'s colour, and only that');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
