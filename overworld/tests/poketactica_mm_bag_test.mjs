// poketactica_mm_bag_test.mjs — MYSTERY MAZE, the BAG's actions (rules revision 16; owner, 2026-11-24: "the bag first";
// Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md item 4): drop, swap with what lies underfoot (how a full bag takes
// something better), give to a partner, sell to a shopkeeper. Each is DONE here and its effect observed; a run recorded
// under rules 15 has none of them.
// Pure: node only.   node overworld/tests/poketactica_mm_bag_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, T_SHOP } from '../../poketactica/js/mm/gen.js';
import { ITEMS, BAG_MAX, givable, sellPrice, priceOf } from '../../poketactica/js/mm/items.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { mmRecipe, mmNewRun } from '../../poketactica/js/mm/replay.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-bag' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 0, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 0, trapDensity: 0, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const dungeon = () => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: 3 }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) });
const L = (S) => MM.leaderOf(S);
const PARTY = () => [fig('pikachu', 30, ['thundershock', 'tackle']), fig('squirtle', 30, ['watergun', 'tackle'])];
/** An open field with nothing on it: the leader at (20, 15) facing east, its partner to the west; the bag as given. */
function arena(bag = [], o = {}) {
	const S = MM.newRun(o.seed || 'bag', { dungeon: dungeon(), party: o.party || PARTY(), bag, ...(o.rev ? { rev: o.rev } : {}) }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [50, 28];
	S.items = []; S.traps = [];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const of = (e, t) => e.filter((v) => v.t === t);
const no = (S, a) => MM.actBlock(S, a, data);
const here = (S) => S.items.filter((o) => o.x === L(S).x && o.y === L(S).y);

A(MM.MM_RULES_REV >= 16, 'the rules revision is 16 or later');

// ---------- drop
{
	const S = arena([{ id: 'oran' }, { id: 'gravelrock', n: 5 }, { id: 'apple', sticky: true }]);
	const t0 = S.turns;
	let e = MM.act(S, { t: 'drop', slot: 1 }, data);
	A(S.bag.length === 2 && S.bag.map((b) => b.id).join() === 'oran,apple' && here(S).length === 1 && here(S)[0].id === 'gravelrock' && here(S)[0].n === 5 && !here(S)[0].shop, 'drop: the whole handful leaves the bag and lies where the leader stands', S.items);
	A(of(e, 'drop')[0].id === 'gravelrock' && of(e, 'drop')[0].n === 5 && S.turns === t0 + 1, 'it takes a turn');
	A(no(S, { t: 'drop', slot: 0 }) === 'something lies here already', 'not on top of something else');
	A(no(S, { t: 'drop', slot: 1 }) === 'it is sticky' && no(S, { t: 'drop', slot: 7 }) === 'no such item', 'a sticky item cannot be put down; nor an empty slot');
	// walked off and back on: it is picked up again
	MM.act(S, { t: 'step', d: 2 }, data); MM.act(S, { t: 'step', d: 6 }, data);
	A(S.bag.some((b) => b.id === 'gravelrock' && b.n === 5) && !S.items.length, 'stepped back onto it: picked up again');
	const T = arena([{ id: 'oran' }]);
	L(T).x = T.F.stairs[0]; L(T).y = T.F.stairs[1];
	A(no(T, { t: 'drop', slot: 0 }) === 'not on the stairs', 'not on the stairs');
}

// ---------- swap: a full bag takes what lies underfoot
{
	const full = Array.from({ length: BAG_MAX }, (_, i) => ({ id: i === 3 ? 'apple' : 'oran' }));
	const S = arena(full);
	S.items.push({ x: 21, y: 15, id: 'sitrus' });
	let e = MM.act(S, { t: 'step', d: 2 }, data);
	A(of(e, 'bagfull').length === 1 && S.bag.length === BAG_MAX && here(S)[0].id === 'sitrus', 'a full bag: the Sitrus Bead stays on the floor');
	A(no(S, { t: 'drop', slot: 3 }) === 'something lies here already', '(and nothing can be dropped onto it)');
	const t0 = S.turns;
	e = MM.act(S, { t: 'swap', slot: 3 }, data);
	A(S.bag.length === BAG_MAX && S.bag[3].id === 'sitrus' && here(S).length === 1 && here(S)[0].id === 'apple' && of(e, 'swap')[0].got === 'sitrus' && of(e, 'swap')[0].left === 'apple' && S.turns === t0 + 1, 'swap: the Sitrus Bead is in that slot, the Wax Apple lies there, a turn has passed', [S.bag[3], S.items]);
	S.items = [];
	A(no(S, { t: 'swap', slot: 0 }) === 'nothing lies here', 'nothing underfoot: nothing to swap for');
	// a sticky one on the floor comes up sticky; the one left behind is a plain floor item
	S.items.push({ x: L(S).x, y: L(S).y, id: 'bigapple', sticky: true });
	MM.act(S, { t: 'swap', slot: 0 }, data);
	A(S.bag[0].id === 'bigapple' && S.bag[0].sticky === true && here(S)[0].id === 'oran' && !here(S)[0].sticky, 'what it picks up keeps what it is (a sticky one stays sticky)');
}

// ---------- give: a partner takes it in
{
	const S = arena([{ id: 'oran' }, { id: 'pecha' }, { id: 'elixir' }, { id: 'quickseed' }, { id: 'apple' }, { id: 'sleepseed' }, { id: 'escapeorb' }]);
	const lead = L(S), p = MM.partyOf(S).find((u) => u !== lead);
	A(givable('oran') && givable('sitrus') && givable('pecha') && givable('elixir') && givable('quickseed') && !givable('apple') && !givable('sleepseed') && !givable('escapeorb') && !givable('gravelrock') && !givable('stars'), 'beads, drinks and Quick Pellets can be handed over; food, harmful pellets, marbles and things to throw cannot');
	p.hp = 5; lead.hp = 7;
	const belly = S.belly, t0 = S.turns;
	let e = MM.act(S, { t: 'give', slot: 0, uid: p.uid }, data);
	A(p.hp >= 5 + Math.ceil(p.maxHP * 0.5) - 1 && lead.hp <= 8 && S.bag.length === 6 && of(e, 'item')[0].how === 'give' && of(e, 'item')[0].uid === p.uid && S.turns === t0 + 1, 'an Oran Bead handed to a hurt partner heals IT (not the leader), is used up, and takes a turn', [p.hp, p.maxHP, lead.hp]);
	A(S.belly <= belly, 'the leader\'s belly is not filled by what a partner eats', [belly, S.belly]);
	p.status = 'psn';
	MM.act(S, { t: 'give', slot: 0, uid: p.uid }, data);
	A(!p.status && !S.bag.some((b) => b.id === 'pecha'), 'a Pecha Bead cures its poison');
	const mv = Object.keys(p.pp)[0]; p.pp[mv] = 0;
	MM.act(S, { t: 'give', slot: 0, uid: p.uid }, data);
	A(p.pp[mv] > 0 && !S.bag.some((b) => b.id === 'elixir'), 'Joint Oil gives its PP back');
	e = MM.act(S, { t: 'give', slot: 0, uid: p.uid }, data);
	A(!S.bag.some((b) => b.id === 'quickseed') && (p.speed > 0 || of(e, 'speed').length || of(e, 'haste').length || JSON.stringify(e).includes(p.uid)), 'a Quick Pellet speeds it up');
	A(no(S, { t: 'give', slot: 0, uid: p.uid }) === 'a partner has no use for it' && no(S, { t: 'give', slot: 1, uid: p.uid }) === 'a partner has no use for it', 'a Wax Apple and a Sleep Pellet are refused');
	A(no(S, { t: 'give', slot: 0, uid: lead.uid }) === 'not a partner' && no(S, { t: 'give', slot: 0, uid: 'nobody' }) === 'not a partner', 'only to a partner');
	// one from a handful: the rest stays
	const H2 = arena([{ id: 'oran' }, { id: 'oran' }]);
	const p2 = MM.partyOf(H2).find((u) => u !== L(H2)); p2.hp = 1;
	MM.act(H2, { t: 'give', slot: 0, uid: p2.uid }, data);
	A(H2.bag.length === 1, 'one is handed over; the other stays in the bag');
	// full HP: nothing happens, said
	const F2 = arena([{ id: 'oran' }]);
	const p3 = MM.partyOf(F2).find((u) => u !== L(F2));
	const e3 = MM.act(F2, { t: 'give', slot: 0, uid: p3.uid }, data);
	A(of(e3, 'nothing').length === 1 && !F2.bag.length, 'handed to one at full HP: it is used up and nothing happens (said)');
}

// ---------- sell: on a shop's carpet, its keeper by
{
	const shop = (bag, more = {}) => {
		const S = arena(bag, more);
		for (let y = 14; y <= 16; y++) for (let x = 19; x <= 21; x++) S.F.terrain[y * W + x] |= T_SHOP;
		const k = Object.assign(MM.addWild(S, 'kecleon', 90, 20, 18, data), { keeper: true, hostile: false, nap: false });
		return { S, k };
	};
	const { S, k } = shop([{ id: 'escapeorb' }, { id: 'gravelrock', n: 6 }, { id: 'apple', sticky: true }, { id: 'oran', unpaid: 30 }]);
	S.bag.find((b) => b.id === 'oran').unpaid = 30; S.owed = 30; S.stars = 10;   // (as after { t: 'take' } in the shop)
	A(sellPrice({ id: 'escapeorb' }) === 75 && sellPrice({ id: 'gravelrock', n: 6 }) === 12 && sellPrice({ id: 'apple' }) === Math.floor(priceOf({ id: 'apple' }) / 2), 'a shopkeeper pays half an item\'s price (a handful: each one)');
	const t0 = S.turns;
	let e = MM.act(S, { t: 'sell', slot: 0 }, data);
	A(S.stars === 85 && !S.bag.some((b) => b.id === 'escapeorb') && of(e, 'sold')[0].stars === 75 && of(e, 'sold')[0].purse === 85 && S.turns === t0 && !k.hostile, 'sold: 75 stars for an Escape Marble, at once (no turn), and the keeper stays friendly');
	e = MM.act(S, { t: 'sell', slot: 0 }, data);
	A(S.stars === 97 && of(e, 'sold')[0].n === 6, 'a handful sells whole: 6 Gravel Chips for 12');
	A(no(S, { t: 'sell', slot: 0 }) === 'it is sticky' && no(S, { t: 'sell', slot: 1 }) === 'it is not yours to sell', 'not a sticky one, and not one you have not paid for');
	A(S.owed === 30 && S.bag.find((b) => b.id === 'oran').unpaid === 30, '(what you owe is untouched)');
	A(no(S, { t: 'drop', slot: 1 }) === 'pay for it, or put it back', 'an unpaid item is put back, not dropped');
	const { S: S2 } = shop([{ id: 'oran' }]);
	A(no(S2, { t: 'drop', slot: 0 }) === 'not on a shop\'s carpet', 'nothing is dropped on the carpet (it would look like stock)');
	L(S2).x = 30;
	A(no(S2, { t: 'sell', slot: 0 }) === 'not on a shop\'s carpet', 'only on the carpet');
	const { S: S3, k: k3 } = shop([{ id: 'oran' }]);
	k3.hostile = true;
	A(no(S3, { t: 'sell', slot: 0 }) === 'no shopkeeper will buy it', 'an angry keeper buys nothing');
	const { S: S4, k: k4 } = shop([{ id: 'oran' }]); k4.hp = 0;
	A(no(S4, { t: 'sell', slot: 0 }) === 'no shopkeeper will buy it', 'nor a fallen one');
}

// ---------- a run recorded under rules 15 has none of them; a replay re-runs them exactly
{
	const O = arena([{ id: 'oran' }], { rev: 15 });
	const p = MM.partyOf(O).find((u) => u !== L(O));
	A(O.rev === 15 && ['drop', 'swap', 'sell'].every((t) => no(O, { t, slot: 0 }) === 'not in this run') && no(O, { t: 'give', slot: 0, uid: p.uid }) === 'not in this run', 'under rules 15: drop, swap, give and sell are refused');
	const e = MM.act(O, { t: 'drop', slot: 0 }, data);
	A(of(e, 'no').length === 1 && O.bag.length === 1 && !O.items.length, 'and change nothing');
	// two runs of the same actions end in the same place
	const play = () => { const S = arena([{ id: 'oran' }, { id: 'sitrus' }, { id: 'gravelrock', n: 4 }], { seed: 'twice' }); const q = MM.partyOf(S).find((u) => u !== L(S)); q.hp = 3;
		for (const a of [{ t: 'drop', slot: 2 }, { t: 'step', d: 2 }, { t: 'give', slot: 0, uid: q.uid }, { t: 'step', d: 6 }, { t: 'pass' }]) MM.act(S, a, data);
		return JSON.stringify([S.bag, S.items, S.turns, S.rng, MM.partyOf(S).map((u) => [u.x, u.y, u.hp])]); };
	A(play() === play(), 'the same actions on the same run end in the same place');
	const rec = mmRecipe({ seed: 'recipe', dungeonId: 'whisper-woods', party: PARTY(), bag: [{ id: 'oran' }], stars: 0, acts: [{ t: 'drop', slot: 0 }] });
	const R = mmNewRun(rec, data);
	A(rec.rev === MM.MM_RULES_REV && R.rev === MM.MM_RULES_REV, 'a new run\'s recipe carries today\'s rules', [rec.rev, R.rev]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
