// poketactica_mm_partners_test.mjs — MYSTERY MAZE, PARTNERS THAT THINK and their ORDERS (rules revision 17;
// Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md items 7 and 8): a partner finishes a nearly beaten foe with the plain
// Attack, otherwise uses the move worth most against what it would hit (never one the foe is immune to), walks round a
// trap that is showing, and takes orders for its moves (save PP, the plain Attack only, a move switched off). A run
// recorded under rules 16 has the old partners.
// Pure: node only.   node overworld/tests/poketactica_mm_partners_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, T_WALL } from '../../poketactica/js/mm/gen.js';
import { NEARLY_BEATEN, MOVE_PLANS } from '../../poketactica/js/mm/ai.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-pt' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return { ...f, ability: null };
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 0, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 0, trapDensity: 0, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const dungeon = () => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: 3 }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) });
const L = (S) => MM.leaderOf(S);
/** An open field: the leader (a Pikachu) at (20, 15), the partner (a Squirtle with these moves) just west of it at (19, 15). */
function arena(moves = ['watergun', 'tackle'], o = {}) {
	const S = MM.newRun(o.seed || 'partners', { dungeon: dungeon(), party: [fig('pikachu', 30, ['thundershock']), fig('squirtle', 30, moves)], bag: [], ...(o.rev ? { rev: o.rev } : {}) }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [50, 28]; S.items = []; S.traps = [];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const partner = (S) => MM.partyOf(S).find((u) => u !== L(S));
/** A sleeping wild Pokémon (it does nothing until hit), with a great deal of HP so it lasts the test. */
const wild = (S, sp, x, y, more = {}) => { const v = Object.assign(MM.addWild(S, sp, 30, x, y, data), { nap: true }, more); v.maxHP = 5000; v.hp = more.hp != null ? more.hp : 5000; return v; };
/** The leader lets a turn go by: what move did the partner use (null: none)? */
const turn = (S) => { for (const u of MM.partyOf(S)) { u.hp = u.maxHP; u.status = null; } S.belly = 999; const p = partner(S), e = MM.act(S, { t: 'pass' }, data).find((x) => x.t === 'use' && x.uid === p.uid); return e ? e.move : null; };   // (the party is kept whole: this is about what the partner chooses)
const turns = (S, n, each) => { const out = []; for (let i = 0; i < n; i++) { if (each) each(S); out.push(turn(S)); } return out; };
const no = (S, a) => MM.actBlock(S, a, data);

A(MM.MM_RULES_REV >= 17 && NEARLY_BEATEN === 0.25 && MOVE_PLANS.join() === 'any,save,attack', 'the rules revision is 17 or later; "nearly beaten" is a quarter of its HP; three orders for moves');

// ---------- the move worth most; the plain Attack on a nearly beaten foe
{
	const S = arena();
	const p = partner(S), g = wild(S, 'geodude', 19, 14);
	const keep = (T) => { const u = partner(T); for (const k of Object.keys(u.pp)) u.pp[k] = 20; u.sp = u.maxSP; };
	const used = turns(S, 8, (T) => { keep(T); g.hp = 5000; g.nap = true; });
	A(used.every((m) => m === 'watergun'), 'a Geodude beside it: Water Gun every turn (Tackle is weak against Rock, and the plain Attack is weaker still)', used);
	const low = turns(S, 8, (T) => { keep(T); g.hp = Math.floor(g.maxHP * 0.25); g.nap = true; });
	A(low.every((m) => m === 'attack'), 'the same Geodude down to a quarter of its HP: the plain Attack, every turn (free, and enough)', low);
	const pp0 = p.pp.watergun;
	turns(S, 3, () => { g.hp = Math.floor(g.maxHP * 0.2); g.nap = true; });
	A(p.pp.watergun === pp0, 'and no PP is spent on it');
	g.hp = Math.floor(g.maxHP * 0.25) + 1; keep(S);
	A(turn(S) === 'watergun', 'one HP over the quarter: a move again');
	// two beside it, one nearly beaten: that one is finished first
	const S2 = arena();
	const a = wild(S2, 'geodude', 19, 14), b = wild(S2, 'rattata', 18, 14, { hp: 900 });
	const e = MM.act(S2, { t: 'pass' }, data), u2 = partner(S2).uid, hit = e.find((x) => x.t === 'hit' && (x.target === a.uid || x.target === b.uid));
	A(e.find((x) => x.t === 'use' && x.uid === u2).move === 'attack' && hit && hit.target === b.uid, 'two beside it, one nearly beaten: it finishes that one', [hit && hit.target, a.uid, b.uid]);
}

// ---------- never a move the foe is immune to
{
	const S = arena(['tackle', 'watergun']);
	const g = wild(S, 'gastly', 19, 14);
	const used = turns(S, 8, (T) => { const u = partner(T); for (const k of Object.keys(u.pp)) u.pp[k] = 20; u.sp = u.maxSP; g.hp = 5000; g.nap = true; });
	A(used.every((m) => m === 'watergun'), 'a Gastly: never Tackle (it is immune), though Tackle is listed first', used);
	const N = arena(['tackle']);
	const g2 = wild(N, 'gastly', 19, 14);
	const only = turns(N, 4, () => { g2.hp = 5000; g2.nap = true; });
	A(only.every((m) => m === 'attack'), 'with nothing but Tackle: the plain Attack (which hits anything)', only);
}

// ---------- orders for moves
{
	const S = arena();
	const p = partner(S), g = wild(S, 'geodude', 19, 14);
	const keep = () => { for (const k of Object.keys(p.pp)) p.pp[k] = 20; p.sp = p.maxSP; g.hp = 5000; g.nap = true; };
	let e = MM.act(S, { t: 'plan', uid: p.uid, plan: 'attack' }, data);
	const t0 = S.turns;
	A(e.some((x) => x.t === 'plan' && x.plan === 'attack') && p.plan === 'attack' && S.turns === t0, 'an order is given at once (no turn is spent)');
	A(turns(S, 5, keep).every((m) => m === 'attack'), '"the plain Attack only": no move is used');
	MM.act(S, { t: 'plan', uid: p.uid, plan: 'save' }, data);
	A(turns(S, 5, keep).every((m) => m === 'attack'), '"save PP": the plain Attack while a foe is in its reach');
	g.boss = true;
	A(turns(S, 3, keep).every((m) => m === 'watergun'), '... but a boss gets the move');
	g.boss = false;
	MM.act(S, { t: 'plan', uid: p.uid, plan: 'any' }, data);
	A(!('plan' in p) && turn(S) === 'watergun', '"any": back to the move worth most (the order is forgotten, not stored)');
	// a move switched off
	keep();
	e = MM.act(S, { t: 'moveoff', uid: p.uid, id: 'watergun', off: true }, data);
	A(p.off.join() === 'watergun' && e.some((x) => x.t === 'moveoff' && x.off === true), 'a move switched off');
	A(turns(S, 5, keep).every((m) => m === 'tackle'), 'it uses the other one (Tackle beats the plain Attack)');
	MM.act(S, { t: 'moveoff', uid: p.uid, id: 'tackle', off: true }, data);
	A(p.off.length === 2 && turns(S, 3, keep).every((m) => m === 'attack'), 'both off: the plain Attack');
	MM.act(S, { t: 'moveoff', uid: p.uid, id: 'watergun', off: false }, data); MM.act(S, { t: 'moveoff', uid: p.uid, id: 'tackle', off: false }, data);
	A(!('off' in p) && (keep(), turn(S)) === 'watergun', 'switched on again: as before');
	// what is refused
	A(no(S, { t: 'plan', uid: L(S).uid, plan: 'save' }) === 'not a partner' && no(S, { t: 'plan', uid: p.uid, plan: 'wild' }) === 'not an order' && no(S, { t: 'plan', uid: 'nobody', plan: 'save' }) === 'not a partner', 'an order is for a partner, and one of the three');
	A(no(S, { t: 'moveoff', uid: p.uid, id: 'hyperbeam', off: true }) === 'not one of its moves' && no(S, { t: 'moveoff', uid: L(S).uid, id: 'thundershock', off: true }) === 'not a partner', 'only a move the partner has on can be switched off');
	const h0 = MM.hashOf(S);
	MM.act(S, { t: 'plan', uid: p.uid, plan: 'save' }, data);
	const h1 = MM.hashOf(S), B = MM.fromSnapshot(MM.toSnapshot(S), data);
	A(h0 !== h1 && MM.hashOf(B) === h1 && partner(B).plan === 'save', 'an order is part of the run: its fingerprint changes, and a snapshot carries it');
}

// ---------- a trap that is showing is walked round
{
	const S = arena();
	const p = partner(S);
	p.x = 20; p.y = 13; L(S).x = 20; L(S).y = 15;
	const tr = { x: 20, y: 14, kind: 'spike', seen: true }; S.traps.push(tr);
	MM.act(S, { t: 'step', d: 4 }, data);   // (the leader walks south; the straight way after it is over the trap)
	A(p.hp === p.maxHP && !(p.x === 20 && p.y === 14) && Math.max(Math.abs(p.x - 20), Math.abs(p.y - 16)) <= 2, 'following the leader, it steps round a trap that is showing', [p.x, p.y, p.hp]);
	// a hidden one is still never sprung by a partner
	const Hd = arena(); const q = partner(Hd);
	q.x = 20; q.y = 13; L(Hd).x = 20; L(Hd).y = 15;
	const hid = { x: 20, y: 14, kind: 'spike', seen: false }; Hd.traps.push(hid);
	MM.act(Hd, { t: 'step', d: 4 }, data);
	A(q.hp === q.maxHP && !hid.seen, 'a hidden trap is still not sprung by a partner');
	// no other way: across it
	const C = arena(); const r = partner(C);
	for (let y = 10; y <= 18; y++) for (const x of [19, 21]) { C.F.terrain[y * W + x] = T_WALL; }   // (a corridor one tile wide)
	C.B.map.height = C.F.terrain.map((t) => ((t & 3) === 0 ? null : 0));
	r.x = 20; r.y = 13; L(C).x = 20; L(C).y = 15;
	C.traps.push({ x: 20, y: 14, kind: 'spike', seen: true });
	MM.act(C, { t: 'step', d: 4 }, data);
	A(r.x === 20 && r.y === 14 && r.hp < r.maxHP, 'in a corridor with no way round, it crosses (and is hurt) rather than be left behind', [r.x, r.y, r.hp, r.maxHP]);
}

// ---------- a run recorded under rules 16 has the old partners
{
	const O = arena(['watergun', 'tackle'], { rev: 16 });
	const p = partner(O), g = wild(O, 'geodude', 19, 14);
	A(O.rev === 16 && no(O, { t: 'plan', uid: p.uid, plan: 'save' }) === 'not in this run' && no(O, { t: 'moveoff', uid: p.uid, id: 'watergun', off: true }) === 'not in this run', 'under rules 16 there are no orders for moves');
	const low = turns(O, 40, () => { for (const k of Object.keys(p.pp)) p.pp[k] = 20; p.sp = p.maxSP; g.hp = Math.floor(g.maxHP * 0.1); g.nap = true; });
	A(low.some((m) => m === 'watergun' || m === 'tackle') && low.some((m) => m === 'attack'), 'and the old roll: over 40 turns on a nearly beaten foe it uses its moves as well as the plain Attack', [...new Set(low)]);
	const tr = arena(['watergun'], { rev: 16 }); const q = partner(tr);
	q.x = 20; q.y = 13; L(tr).x = 20; L(tr).y = 15; tr.traps.push({ x: 20, y: 14, kind: 'spike', seen: true });
	MM.act(tr, { t: 'step', d: 4 }, data);
	A(q.x === 20 && q.y === 14 && q.hp < q.maxHP, 'and it walks straight onto a trap that is showing, as it did');
	// the same turns twice end in the same place (the new partners are not random, but for a helping move)
	const play = () => { const S = arena(); const v = wild(S, 'geodude', 19, 14); const out = turns(S, 12, () => { v.nap = true; }); return JSON.stringify([out, MM.hashOf(S)]); };
	A(play() === play(), 'the same run plays the same way twice');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
