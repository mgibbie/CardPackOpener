// poketactica_mm_items_test.mjs — MYSTERY MAZE, items, belly and traps (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 5):
// items on the floor's marks, the bag of 20, using and throwing every kind (mm/items.js); the leader's belly; the 19
// traps and who springs them (mm/traps.js). Each item and each trap is USED here and its effect observed. Still exact.
// Pure: node only.
//   node overworld/tests/poketactica_mm_items_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, S_ITEM, S_TRAP } from '../../poketactica/js/mm/gen.js';
import { DIR8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { ITEMS, BAG_MAX, BELLY_MAX, usable, throwable, itemName } from '../../poketactica/js/mm/items.js';
import { TRAPS, TRAP_DMG, MISFIRE } from '../../poketactica/js/mm/traps.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-mm' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 5, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 6, trapDensity: 10, numExtraHallways: 3, buriedItemDensity: 2, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const WILD = [{ species: 'rattata', level: 6, w: 1 }];
const ALL_ITEMS = Object.keys(ITEMS).filter((id) => id !== 'grimyfood').map((id) => ({ id, w: 1 }));
const ALL_TRAPS = Object.keys(TRAPS).map((id) => ({ id, w: 1 }));
const dungeon = (more = {}, floors = 3) => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: floors }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: ALL_ITEMS, traps: ALL_TRAPS, ...more })) });
const L = (S) => MM.leaderOf(S);
/** An open field with nothing on it: the leader at (20, 15) facing east, partners to its west; the bag as given. */
function arena(party = [fig('pikachu', 30, ['thundershock', 'tackle'])], bag = [], seed = 'arena') {
	const S = MM.newRun(seed, { dungeon: dungeon({ items: [], traps: [] }), party, bag }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [50, 28];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const wild = (S, sp, lv, x, y, more = {}) => Object.assign(MM.addWild(S, sp, lv, x, y, data), { nap: true }, more);
const of = (e, t) => e.filter((v) => v.t === t);
const act = (S, a) => MM.act(S, a, data);
const use = (S, slot = 0) => act(S, { t: 'use', slot });

// ================================================================ the table
{
	const ids = Object.keys(ITEMS);
	A(ids.length === 24 && ids.every((id) => ITEMS[id].name && ITEMS[id].note && ['food', 'berry', 'seed', 'orb', 'thrown', 'drink', 'stars'].includes(ITEMS[id].group)), '24 items, each named, explained and in one of the original\'s groups', ids.length);
	A(!ids.some((id) => /reviv/i.test(id)) && usable('apple') && !usable('ironthorn') && !usable('stars') && throwable('oran') && !throwable('stars') && itemName({ id: 'ironthorn', n: 4 }) === 'Iron Tack x4', 'no Reviver Seed (a knockout is final); thrown things are only thrown, stars neither');
	A(Object.keys(TRAPS).length === 19 && !TRAPS.trip && TRAPS.wonder.shown && Object.values(TRAPS).every((t) => t.name && t.note), '19 traps (no Trip Trap yet); the Wonder Tile is never hidden');
}

// ================================================================ on the floor, into the bag
{
	const S = MM.newRun('floor', { dungeon: dungeon(), party: [fig('pikachu')] }, data);
	const at = (flag) => { let n = 0; for (let i = 0; i < W * H; i++) if ((S.F.spawn[i] & flag) && (S.F.terrain[i] & 3) === T_FLOOR) n++; return n; };
	A(S.items.length === at(S_ITEM) && S.items.length >= 3 && S.items.every((o) => ITEMS[o.id] && (S.F.spawn[o.y * W + o.x] & S_ITEM) && (S.F.terrain[o.y * W + o.x] & 3) === T_FLOOR), `an item on each of the floor's ${S.items.length} item marks (none inside walls)`);
	A(S.traps.length === at(S_TRAP) && S.traps.length >= 2 && S.traps.every((t) => TRAPS[t.kind] && t.seen === !!TRAPS[t.kind].shown), `a trap on each of its ${S.traps.length} trap marks, hidden but for Wonder Tiles`);
	const v = MM.view(S);
	A(v.traps.every((t) => t.kind === 'wonder') && v.items.every((o) => S.seen[o.y * W + o.x]) && v.belly === 100 && v.stars === 0 && Array.isArray(v.bag), 'a spectator sees items on explored ground, no hidden trap, the belly and the purse');
	let piles = 0, sticky = 0, n = 0, bad = 0;
	for (let k = 0; k < 30; k++) for (const o of MM.newRun('roll' + k, { dungeon: dungeon({ sticky: 20 }), party: [fig('pikachu')] }, data).items) {
		n++;
		if (o.sticky) sticky++;
		if (o.id === 'stars') { piles++; if (!(o.n >= 5) || o.sticky) bad++; }
		if (ITEMS[o.id].stack && !(o.n >= 3 && o.n <= 6)) bad++;
	}
	A(n > 100 && piles > 0 && bad === 0 && sticky / n > 0.1 && sticky / n < 0.3, 'stars come as a pile, thrown things as a handful of 3 to 6; the floor\'s share are sticky', [n, piles, sticky]);
	// walking over them
	const T = arena();
	T.items.push({ x: 21, y: 15, id: 'apple' }, { x: 22, y: 15, id: 'stars', n: 12 }, { x: 23, y: 15, id: 'ironthorn', n: 3 }, { x: 24, y: 15, id: 'ironthorn', n: 4 }, { x: 25, y: 15, id: 'oran', sticky: true });
	const ev = [];
	for (let k = 0; k < 5; k++) ev.push(...act(T, { t: 'step', d: 2 }));
	A(of(ev, 'pickup').length === 5 && T.items.length === 0 && T.stars === 12 && JSON.stringify(T.bag) === JSON.stringify([{ id: 'apple' }, { id: 'ironthorn', n: 7 }, { id: 'oran', sticky: true }]), 'the leader picks up what it walks over: stars to the purse, a handful onto its pile', T.bag);
	const full = arena(undefined, Array.from({ length: 25 }, () => ({ id: 'apple' })));
	full.items.push({ x: 21, y: 15, id: 'oran' });
	const e2 = act(full, { t: 'step', d: 2 });
	A(full.bag.length === BAG_MAX && of(e2, 'bagfull').length === 1 && full.items.length === 1, 'the bag holds 20: a full bag leaves the item where it lies');
	const P = arena([fig('pikachu'), fig('rattata')]);
	P.items.push({ x: 21, y: 16, id: 'apple' });
	wild(P, 'rattata', 3, 30, 15, { nap: false });
	P.units[1].x = 21; P.units[1].y = 17; act(P, { t: 'tactic', uid: 'p1', tactic: 'hunt' });
	for (let k = 0; k < 4; k++) act(P, { t: 'pass' });
	A(P.items.length === 1 && P.bag.length === 0, 'partners and wild Pokémon walk over items without taking them');
}

// ================================================================ using
{
	const one = (id, prep, more) => { const S = arena(more && more.party, [{ id }]); const u = L(S); if (prep) prep(S, u); const turns = S.turns; const e = use(S); return { S, u, e, took: S.turns - turns }; };
	let r = one('apple', (S) => { S.belly = 300; });
	A(r.S.belly === 800 - 1 && r.S.bag.length === 0 && r.took === 1 && of(r.e, 'item')[0].how === 'use', 'an Apple fills the belly by 50, is used up, and takes a turn', r.S.belly);
	r = one('bigapple', (S) => { S.belly = 300; });
	A(r.S.belly === BELLY_MAX - 1, 'a Big Wax Apple fills it');
	r = one('oran', (S, u) => { u.hp = 1; });
	A(r.u.hp >= Math.ceil(r.u.maxHP / 2) && r.u.hp < r.u.maxHP, 'an Oran Bead heals half', [r.u.hp, r.u.maxHP]);
	r = one('sitrus', (S, u) => { u.hp = 1; });
	A(r.u.hp === r.u.maxHP, 'a Sitrus Bead heals all');
	for (const [id, st] of [['pecha', 'psn'], ['pecha', 'tox'], ['cheri', 'par'], ['rawst', 'brn']]) { r = one(id, (S, u) => { u.status = st; }); A(r.u.status === null && of(r.e, 'cured').length === 1, `${ITEMS[id].name} cures ${st}`); }
	r = one('pecha', (S, u) => { u.status = 'brn'; });
	A(r.u.status === 'brn', 'the wrong berry cures nothing');
	r = one('elixir', (S, u) => { u.pp.thundershock = 2; u.pp.tackle = 0; });
	A(r.u.pp.thundershock === 12 && r.u.pp.tackle === 10, 'an Joint Oil gives 10 PP to every move', r.u.pp);
	r = one('maxelixir', (S, u) => { u.pp.thundershock = 0; });
	A(r.u.pp.thundershock === data.moves.thundershock.pp, 'a Max Joint Oil gives it all back');
	r = one('sleepseed');
	A(of(r.e, 'status').some((v) => v.st === 'slp') && of(r.e, 'asleep').length >= 2 && of(r.e, 'asleep').length <= 5 && r.u.status === null, 'eating a Sleep Pellet: asleep for the original\'s 3 to 6 turns', of(r.e, 'asleep').length);
	r = one('stunseed');
	A(r.u.status === 'par', 'eating a Stun Pellet paralyses');
	r = one('blastseed', (S) => { wild(S, 'machop', 30, 21, 15); });
	{ const f = r.S.units.find((u) => u.side === 'e'); A(f.hp === f.maxHP - Math.floor(f.maxHP * 0.3) && !f.nap, 'eating a Blast Pellet: the foe in front loses 3 tenths of its HP (and wakes)', [f.hp, f.maxHP]); }
	r = one('quickseed');
	{ const S = r.S; let fast = 0; const st = [S.units[0].stage]; for (let k = 0; k < 14; k++) { act(S, { t: 'pass' }); st.push(S.units[0].stage); if (S.units[0].stage === 2) fast++; } A(st[0] === 2 && fast >= 6 && fast <= 9 && st[st.length - 1] === 1, 'a Quick Pellet: double speed for 8 or 9 turns, then back to normal', st); }
	r = one('warpseed');
	A(of(r.e, 'warp').length === 1 && (r.u.x !== 20 || r.u.y !== 15), 'a Warp Pellet sends you somewhere else');
	r = one('escapeorb', (S) => { S.bag.push({ id: 'apple' }); S.stars = 40; });
	A(r.S.over && r.S.over.escaped === true && r.S.over.won === false && r.S.bag.length === 1 && r.S.stars === 40 && act(r.S, { t: 'pass' })[0].t === 'no', 'an Escape Marble leaves the dungeon with everything you carry', r.S.over);
	{ const S = MM.newRun('lum', { dungeon: dungeon(), party: [fig('pikachu')], bag: [{ id: 'luminousorb' }] }, data); const dark = MM.view(S).tiles.filter((t) => t === -1).length; use(S); A(dark > 500 && MM.view(S).tiles.every((t) => t !== -1) && MM.view(S).stairs !== null, 'a Luminous Marble shows the whole floor'); }
	r = one('petrifyorb', (S) => { wild(S, 'rattata', 5, 22, 15, { nap: false }); wild(S, 'rattata', 5, 24, 13, { nap: false }); });
	{ const S = r.S, foes = MM.wildOf(S); for (let k = 0; k < 6; k++) act(S, { t: 'pass' }); const still = foes.every((f) => f.stone && f.nap && (f.x === 22 || f.x === 24)); act(S, { t: 'step', d: 2 }); const hit = act(S, { t: 'attack' }); A(of(r.e, 'stone').length === 2 && still && (!foes[0].stone || foes[0].hp <= 0 || of(hit, 'miss').length), 'a Petrify Marble turns the foes in sight to stone: they do not stir even with you beside them, until hit'); }
	r = one('slumberorb', (S) => { wild(S, 'rattata', 5, 22, 15, { nap: false }); });
	A(r.S.units.find((u) => u.side === 'e').status === 'slp', 'a Slumber Marble puts the foes in sight to sleep');
	r = one('trawlorb', (S) => { S.items.push({ x: 40, y: 5, id: 'apple' }, { x: 45, y: 25, id: 'oran' }, { x: 5, y: 5, id: 'stars', n: 9 }); });
	A(r.S.items.length === 3 && r.S.items.every((o) => cheb(o.x, o.y, 20, 15) <= 2) && new Set(r.S.items.map((o) => o.x + ',' + o.y)).size === 3, 'a Trawl Marble pulls the floor\'s items to your feet, one to a tile', r.S.items);
	r = one('grimyfood', (S) => { S.belly = 100; });
	A(r.S.belly === 400 - 1 && ['psn', 'par', 'brn'].includes(r.u.status), 'Grimy Wax fills a little and does something nasty', r.u.status);
	// refusals
	const S = arena(undefined, [{ id: 'ironthorn', n: 2 }, { id: 'oran', sticky: true }]);
	const h = MM.hashOf(S);
	A(use(S, 0)[0].why === 'not something to use' && use(S, 1)[0].why === 'it is sticky' && use(S, 5)[0].why === 'no such item' && act(S, { t: 'throw', slot: 1 })[0].why === 'it is sticky' && MM.hashOf(S) === h, 'a thrown thing is not eaten, a sticky item is not used or thrown, an empty slot is nothing: no time passes');
}

// ================================================================ throwing
{
	const S = arena([fig('pikachu'), fig('rattata')], [{ id: 'ironthorn', n: 2 }, { id: 'oran' }, { id: 'sleepseed' }, { id: 'gravelrock', n: 3 }, { id: 'blastseed' }]);
	const foe = wild(S, 'machop', 30, 26, 15), far = wild(S, 'machop', 30, 29, 15);
	const e = act(S, { t: 'throw', slot: 0 });
	A(of(e, 'thrown')[0].hit === foe.uid && foe.hp === foe.maxHP - Math.floor(foe.maxHP * 0.12) && far.hp === far.maxHP && S.bag[0].n === 1 && S.turns === 1, 'an Iron Tack flies straight and hits the first Pokémon in its way; one leaves the handful', [foe.hp, foe.maxHP]);
	act(S, { t: 'face', d: 0 });
	const miss = act(S, { t: 'throw', slot: 0 });
	A(of(miss, 'thrown')[0].hit === null && S.items.length === 1 && S.items[0].id === 'ironthorn' && S.items[0].x === 20 && S.items[0].y === 5 && S.bag[0].id === 'oran', 'one that hits nobody lands 10 tiles on, to be picked up again', S.items);
	// a berry thrown at a partner heals it
	const p = S.units[1];
	p.hp = 1;
	act(S, { t: 'face', d: 6 });
	act(S, { t: 'throw', slot: 0 });
	A(p.hp >= Math.ceil(p.maxHP / 2), 'a berry thrown at a partner heals it', [p.hp, p.maxHP]);
	act(S, { t: 'face', d: 2 });
	act(S, { t: 'throw', slot: 0 });
	A(foe.status === 'slp', 'a Sleep Pellet thrown at a foe puts it to sleep');
	// the lob
	A(MM.actBlock(S, { t: 'throw', slot: 0 }, data) === 'pick a tile' && MM.actBlock(S, { t: 'throw', slot: 0, x: 40, y: 15 }, data) === 'out of reach' && MM.actBlock(S, { t: 'throw', slot: 0, x: 26, y: 15 }, data) === null, 'a Gravel Chip is lobbed at a tile within 6');
	const hp = far.hp;
	const lob = act(S, { t: 'throw', slot: 0, x: foe.x, y: foe.y });   // (the foe has come closer since the thorn woke it)
	A(of(lob, 'thrown')[0].hit === foe.uid && far.hp === hp, 'it lands on the aimed tile');
	const b = foe.hp;
	act(S, { t: 'throw', slot: 1 });
	A(foe.hp === b - Math.floor(foe.maxHP * 0.15) || !MM.unit(S, foe.uid), 'a thrown Blast Pellet is half the blast of an eaten one', [b, foe.hp]);
}

// ================================================================ the belly
{
	const S = arena();
	const u = L(S), ev = [];
	u.hp = Math.floor(u.maxHP / 2);
	for (let k = 0; k < 1000; k++) ev.push(...act(S, { t: 'pass' }).map((v) => [S.turns, v]));
	const warn = ev.filter(([, v]) => v.t === 'hungry').map(([t, v]) => [t, v.n]);
	A(S.belly === 0 && JSON.stringify(warn) === JSON.stringify([[800, 20], [900, 10], [1000, 0]]) && u.hp === u.maxHP, 'the belly lasts 1,000 of the leader\'s actions and warns at 20, 10 and empty; face and tactics cost nothing', warn);
	const hp = u.hp;
	const e = [];
	for (let k = 0; k < 5; k++) e.push(...act(S, { t: 'pass' }));
	A(u.hp === hp - 5 && of(e, 'hurt').every((v) => v.why === 'hunger'), 'empty, every action costs 1 HP and nothing heals', [hp, u.hp]);
	S.bag.push({ id: 'apple' });
	use(S);
	const h2 = u.hp;
	for (let k = 0; k < 10; k++) act(S, { t: 'pass' });
	A(S.belly > 480 && u.hp >= h2, 'an Apple puts that right');
	u.hp = 3;
	S.belly = 0;
	let over = [];
	for (let k = 0; k < 5 && !S.over; k++) over = act(S, { t: 'pass' });
	A(S.over && S.over.won === false && S.fallen.length === 1 && of(over, 'lost').length === 1, 'starving to 0 HP is a knockout like any other: the figurine is gone');
}

// ================================================================ traps: who springs them
{
	const lay = (S, kind, x = 21, y = 15, seen = true) => { const t = { x, y, kind, seen }; S.traps.push(t); return t; };
	// hidden ones sometimes do nothing
	let duds = 0, n = 0;
	for (let k = 0; k < 300; k++) { const S = arena(undefined, [], 'dud' + k); lay(S, 'chestnut', 21, 15, false); const e = act(S, { t: 'step', d: 2 }); n++; if (of(e, 'trap')[0].dud) duds++; }
	A(duds / n > 0.08 && duds / n < 0.23 && MISFIRE === 15, 'a hidden trap does nothing about 15 times in 100', [duds, n]);
	const S = arena([fig('pikachu'), fig('rattata')]);
	const t = lay(S, 'spike', 21, 15, false);
	const w = wild(S, 'rattata', 5, 22, 15, { nap: false });
	w.hp = w.maxHP;
	for (let k = 0; k < 3; k++) act(S, { t: 'pass' });
	A(t.seen === false && w.hp === w.maxHP && (w.x === 21 || cheb(w.x, w.y, 20, 15) === 1), 'a wild Pokémon walks over a trap and nothing happens');
	const P = arena([fig('pikachu'), fig('rattata')]);
	P.rev = 16;   // (as a run recorded before rules 17: from 17 a partner walks ROUND a trap that is showing, poketactica_mm_partners_test.mjs)
	const hid = lay(P, 'spike', 20, 14, false);
	const p = P.units[1];
	p.x = 20; p.y = 13;
	act(P, { t: 'step', d: 4 });   // (the leader walks away south; the partner follows over the hidden trap)
	const safe = p.hp === p.maxHP && !hid.seen;
	p.x = 20; p.y = 14 - 1; L(P).x = 20; L(P).y = 15; hid.seen = true;
	act(P, { t: 'step', d: 4 });
	A(safe && p.hp === p.maxHP - Math.floor(p.maxHP * TRAP_DMG.spike), 'under rules 16 a partner sprang only a trap that was showing (never a hidden one)', [safe, p.hp, p.maxHP]);
	const V = arena();
	const hidden = lay(V, 'spike', 21, 15, false);
	const e = act(V, { t: 'attack' });
	A(hidden.seen && of(e, 'trapseen').length === 1 && MM.view(V).traps.length === 1 && L(V).hp === L(V).maxHP, 'the plain Attack shows a trap on the tile in front without springing it');
}

// ================================================================ traps: what each does
{
	const on = (kind, prep, party) => { const S = arena(party); const u = L(S); S.traps.push({ x: 21, y: 15, kind, seen: true }); if (prep) prep(S, u); const e = act(S, { t: 'step', d: 2 }); return { S, u, e }; };
	let r = on('mud');
	A(Object.values(r.u.boosts).filter((b) => b === -1).length === 1 && ['atk', 'spa', 'def', 'spd'].some((k) => r.u.boosts[k] === -1), 'Mud Trap: one of Attack, Sp. Atk, Defense, Sp. Def drops a stage', r.u.boosts);
	r = on('sticky', (S) => { S.bag.push({ id: 'apple' }, { id: 'oran', sticky: true }); });
	A(r.S.bag.every((it) => it.sticky), 'Sticky Trap: a clean item in the bag turns sticky');
	let spoiled = 0;
	for (let k = 0; k < 40; k++) { const S = arena(undefined, [{ id: 'apple' }, { id: 'apple' }, { id: 'bigapple' }, { id: 'oran' }], 'grimy' + k); S.traps.push({ x: 21, y: 15, kind: 'grimy', seen: true }); act(S, { t: 'step', d: 2 }); spoiled += S.bag.filter((it) => it.id === 'grimyfood').length; if (S.bag[3].id !== 'oran') spoiled = -999; }
	A(spoiled > 20 && spoiled < 55, 'Grimy Trap: each food in the bag spoils 3 times in 10 (berries are safe)', spoiled);
	r = on('summon', (S) => { S.dungeon.floors[0].wild = WILD; });
	{ const w = MM.wildOf(r.S); A(w.length >= 2 && w.length <= 4 && w.every((v) => cheb(v.x, v.y, 21, 15) === 1 && !v.nap) && r.S.traps.length === 0, 'Summon Trap: 2 to 4 wild Pokémon appear round you, awake; it works once', w.length); }
	r = on('pitfall', null, [fig('pikachu'), fig('rattata')]);
	A(r.S.floorNo === 2 && of(r.e, 'fell').length === 1 && r.u.hp < r.u.maxHP && MM.partyOf(r.S).length === 2 && cheb(r.S.units[1].x, r.S.units[1].y, r.u.x, r.u.y) <= 2, 'Pitfall Trap: a bump, and the whole party lands on the next floor');
	{ const S = arena(); S.dungeon.floors.length = 1; S.traps.push({ x: 21, y: 15, kind: 'pitfall', seen: true }); act(S, { t: 'step', d: 2 }); A(S.floorNo === 1 && !S.over && L(S).x === 21, 'on the last floor there is nothing below a pitfall'); }
	r = on('warp');
	A(of(r.e, 'warp').length === 1 && (r.u.x !== 21 || r.u.y !== 15), 'Warp Trap: somewhere else on the floor');
	r = on('gust');
	A(cheb(r.u.x, r.u.y, 21, 15) === 10 && r.u.hp === r.u.maxHP - Math.max(1, Math.floor(r.u.maxHP * TRAP_DMG.gust)), 'Gust Trap: blown 10 tiles in a straight line, a little damage', [r.u.x, r.u.y]);
	r = on('spin');
	{ const S = r.S; const dirs = new Set(); let turns = 0; for (let k = 0; k < 8 && S.units[0].confused > 0; k++) { const e = act(S, { t: 'step', d: 2 }); turns++; const st = of(e, 'step').find((v) => v.uid === 'p0'); if (st) dirs.add(st.d); } A(of(r.e, 'confused').length === 1 && turns >= 2 && turns <= 6 && dirs.size >= 2 && S.units[0].confused === 0, 'Spin Trap: confused for a few turns, its feet picking the way', [turns, [...dirs]]); }
	r = on('slumber');
	A(of(r.e, 'asleep').length >= 2 && r.u.status === null, 'Slumber Trap: asleep for a few turns');
	r = on('slow');
	{ const S = r.S; const st = [S.units[0].stage]; for (let k = 0; k < 9; k++) { act(S, { t: 'pass' }); st.push(S.units[0].stage); } A(st[0] === 0 && st[st.length - 1] === 1 && of(r.e, 'speed')[0].stage === 0, 'Slow Trap: half speed for 6 or 7 turns', st); }
	r = on('seal');
	{ const S = r.S, u = r.u, id = u.sealed[0]; const blocked = MM.actBlock(S, { t: 'move', id, x: u.x + 1, y: u.y }, data); S.F.stairs = [u.x, u.y]; act(S, { t: 'stairs' }); A(of(r.e, 'sealed').length === 1 && blocked === 'sealed' && L(S).sealed === null, 'Seal Trap: one move is sealed until the next floor', id); }
	r = on('poison');
	A(r.u.status === 'psn', 'Poison Trap: poisoned');
	r = on('selfdestruct', (S) => { const p = S.units[1]; p.x = 22; p.y = 16; p.hp = 40; p.status = 'slp'; p.sleepTurns = 9; wild(S, 'machop', 30, 23, 13); }, [fig('pikachu'), fig('rattata')]);
	{ const f = r.S.units.find((u) => u.side === 'e'), p = r.S.units.find((u) => u.uid === 'p1'); A(r.u.hp === Math.ceil(r.u.maxHP / 2) && p.hp === 20 && f.hp === f.maxHP && r.S.traps.length === 0, 'Selfdestruct Trap: everyone next to it loses half their HP; it works once', [r.u.hp, p.hp]); }
	r = on('explosion', (S) => { wild(S, 'machop', 30, 23, 15); wild(S, 'machop', 30, 24, 15); });
	{ const [a, b] = r.S.units.filter((u) => u.side === 'e'); A(a.hp === Math.ceil(a.maxHP / 2) && b.hp === b.maxHP, 'Explosion Trap: the same, out to 2 tiles'); }
	r = on('ppzero');
	A(of(r.e, 'ppzero').length === 1 && Object.values(r.u.pp).filter((n) => n === 0).length === 1, 'PP-Zero Trap: one move\'s PP is emptied', r.u.pp);
	r = on('chestnut');
	A(r.u.hp === r.u.maxHP - Math.floor(r.u.maxHP * 0.06), 'Chestnut Trap: 6 in 100 of max HP');
	r = on('spike');
	A(r.u.hp === r.u.maxHP - Math.floor(r.u.maxHP * 0.12) && r.S.traps.length === 1, 'Spike Trap: 12 in 100, and it stays');
	r = on('wonder', (S, u) => { u.boosts.atk = -3; u.boosts.def = 2; });
	A(Object.values(r.u.boosts).every((b) => b === 0), 'Wonder Tile: every stat change back to normal');
	r = on('pokemon', (S) => { S.dungeon.floors[0].wild = WILD; S.items.push({ x: 25, y: 12, id: 'apple' }, { x: 26, y: 18, id: 'oran' }); });
	A(MM.wildOf(r.S).length === 2 && r.S.items.length === 0 && r.S.traps.length === 0, 'Pokémon Trap: the items in sight turn into wild Pokémon; it works once');
}

// ================================================================ exact
{
	const play = (seed) => {
		const S = MM.newRun(seed, { dungeon: dungeon({ wild: WILD }, 4), party: [fig('pikachu', 30, ['thundershock']), fig('squirtle', 30)], bag: [{ id: 'apple' }] }, data);
		const r = makeRng('items'), acts = [];
		for (let k = 0; k < 400 && !S.over; k++) {
			const u = L(S);
			let a;
			const usableSlot = S.bag.findIndex((it) => !it.sticky && usable(it.id) && it.id !== 'escapeorb');
			const thorn = S.bag.findIndex((it) => !it.sticky && ITEMS[it.id].group === 'thrown' && !ITEMS[it.id].arc);
			if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) a = { t: 'stairs' };
			else if (usableSlot >= 0 && r() < 0.1) a = { t: 'use', slot: usableSlot };
			else if (thorn >= 0 && r() < 0.2) a = { t: 'throw', slot: thorn };
			else {
				// to the nearest item, else the stairs; attack what blocks the way
				const goal = S.items.length && S.bag.length < BAG_MAX ? S.items.reduce((p, o) => (cheb(o.x, o.y, u.x, u.y) < cheb(p.x, p.y, u.x, u.y) ? o : p)) : { x: S.F.stairs[0], y: S.F.stairs[1] };
				const dist = MM.walkMap(S.F, u, goal.x, goal.y), here = dist[u.y * W + u.x];
				const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k2) => MM.canWalk(S.F, u, k2) && dist[(u.y + DIR8[k2][1]) * W + u.x + DIR8[k2][0]] === here - 1);
				if (d == null) a = { t: 'pass' };
				else if (MM.actBlock(S, { t: 'step', d }, data)) { if (u.dir !== d) { acts.push({ t: 'face', d }); act(S, { t: 'face', d }); } a = { t: 'attack' }; }
				else a = { t: 'step', d };
			}
			acts.push(a);
			act(S, a);
		}
		return { S, acts };
	};
	const one = play('exact-items'), two = play('exact-items');
	const used = one.acts.filter((a) => a.t === 'use' || a.t === 'throw').length;
	A(one.acts.length > 150 && MM.hashOf(one.S) === MM.hashOf(two.S) && used >= 3, `a run with items and traps replays the same (${one.acts.length} actions, floor ${one.S.floorNo}, ${used} items used or thrown, ${one.S.stars} stars)`);
	const fresh = MM.newRun('exact-items', { dungeon: dungeon({ wild: WILD }, 4), party: [fig('pikachu', 30, ['thundershock']), fig('squirtle', 30)], bag: [{ id: 'apple' }] }, data);
	const half = one.acts.length >> 1;
	let mid = null;
	one.acts.forEach((a, i) => { if (i === half) mid = MM.toSnapshot(fresh); act(fresh, a); });
	const again = MM.fromSnapshot(JSON.parse(JSON.stringify(mid)), data);
	one.acts.slice(half).forEach((a) => act(again, a));
	A(MM.hashOf(fresh) === MM.hashOf(one.S) && MM.hashOf(again) === MM.hashOf(one.S) && mid.bag && mid.traps && typeof mid.belly === 'number', 'the recorded actions re-run to the same end, and so does a snapshot (bag, belly, items and traps in it)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
