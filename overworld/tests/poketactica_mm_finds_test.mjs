// poketactica_mm_finds_test.mjs — MYSTERY MAZE, rules revision 18 (Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md
// items 5 and 6): held items of the camp's as FINDS on the floors, WANDS with charges, two foods, the Vigor Pellet, and
// pellets that are UNKNOWN until tried, in the hard dungeons only (owner, 2026-11-24). Each is done here and its effect
// observed; a run recorded under rules 17 has the floors without any of them.
// Pure: node only.   node overworld/tests/poketactica_mm_finds_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, T_SHOP } from '../../poketactica/js/mm/gen.js';
import { ITEMS, rollItem, findCap, findsFor, usable, throwable, givable, sellPrice, isHidden, nameIn, noteIn, iconIn, pelletAlias, PELLET_COLOURS, itemName, BELLY_MAX } from '../../poketactica/js/mm/items.js';
import { DUNGEONS, dungeonById, dungeonAt, itemDungeon, COMMON_ITEMS, NEW_ITEMS } from '../../poketactica/js/mm/dungeons.js';
import { mmOutcome, applyMmRewards } from '../../poketactica/js/mm/rewards.js';
import { newFigs, mmStoreAdd, mmStoreSize, cleanMm, haveGood } from '../../poketactica/js/figcol.js';
import { HELD } from '../../poketactica/js/goods.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-fnd' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 0, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 0, trapDensity: 0, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const dungeon = (more = {}) => ({ id: 'test', name: 'Test Cave', party: 4, ...more, floors: Array.from({ length: 3 }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) });
const L = (S) => MM.leaderOf(S);
const PARTY = () => [fig('pikachu', 30, ['thundershock', 'tackle']), fig('squirtle', 30, ['watergun', 'tackle'])];
/** An open field with nothing on it: the leader at (20, 15) facing east, its partner to the west; the bag as given. */
function arena(bag = [], o = {}) {
	const S = MM.newRun(o.seed || 'finds', { dungeon: dungeon(o.dungeon), party: o.party || PARTY(), bag, ...(o.rev ? { rev: o.rev } : {}) }, data);
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
/** A foe some tiles east of the leader, asleep like a stone so it does nothing of its own. */
const foe = (S, dx = 3, sp = 'machop') => Object.assign(MM.addWild(S, sp, 30, 20 + dx, 15, data), { nap: true, stone: true });
const ids = (list) => list.map((e) => e.id);
const NEW = ids(NEW_ITEMS);

A(MM.MM_RULES_REV >= 18, 'the rules revision is 18 or later');

// ---------- the table: every held item of the camp's is a maze item of the group "good", and none took a maze item's place
{
	const held = Object.keys(HELD);
	A(held.every((id) => ITEMS[id] && ITEMS[id].group === 'good' && ITEMS[id].name === HELD[id].name && ITEMS[id].price === HELD[id].stars), 'every held item is in the maze\'s table under its own name and price');
	A(['apple', 'oran', 'sitrus', 'pecha', 'sleepseed', 'escapeorb', 'gravelrock', 'elixir', 'stars'].every((id) => ITEMS[id].group !== 'good') && ids(COMMON_ITEMS).every((id) => ITEMS[id].group !== 'good'), 'no held item shares an id with a maze item');
	A(NEW.filter((id) => id !== 'find').every((id) => ITEMS[id]) && !ITEMS.find, 'the new items are all in the table; "find" is a list entry, not an item');
	const names = Object.values(ITEMS).filter((d) => d.group !== 'good').map((d) => d.name);
	A(new Set(names).size === names.length && [1, 10, 30, 99].every((n) => findsFor(n).every((id) => !names.includes(HELD[id].name))), 'no two maze items share a name, and no find shares one with a maze item (the held Oran Bead is never a find)');
	A(held.every((id) => !usable(id) && !throwable(id) && !givable(id)), 'a find is not eaten, thrown or handed to a partner');
}

// ---------- the floors: the new items lie in every dungeon under rules 18, and in none as a run under 17 knew it
{
	const has = (fl, id) => fl.items.some((e) => e.id === id);
	const named = DUNGEONS.filter((d) => !d.endless);
	A(named.every((d) => d.floors.every((fl) => has(fl, 'find') && has(fl, 'dozewand') && has(fl, 'glazedapple') && has(fl, 'vigorseed'))), 'every floor of every named dungeon has finds, wands, the new food and the Vigor Pellet');
	A(named.every((d) => dungeonAt(d.id, 17).floors.every((fl) => !fl.items.some((e) => NEW.includes(e.id)))), 'as a run under rules 17 knew them: none');
	A(named.every((d) => dungeonAt(d.id, 14).floors.every((fl) => fl.items === COMMON_ITEMS)), 'and under rules 14: the one shared list, as before');
	const gale17 = dungeonAt('gale-tower', 17).floors[3].items, gale = dungeonById('gale-tower').floors[3].items;
	A(gale17.find((e) => e.id === 'warpseed').w === gale.find((e) => e.id === 'warpseed').w && gale17.length < gale.length, 'a dungeon\'s own weights are the same either side of the revision');
	A(has(MM.floorOf(dungeonAt('the-abyss', 18), 4), 'find') && !MM.floorOf(dungeonAt('the-abyss', 17), 4).items.some((e) => NEW.includes(e.id)) && dungeonAt('the-abyss', 11).oldHouses === true && !dungeonAt('the-abyss', 17).oldHouses, 'the endless dungeon too; its older Monster Houses are still kept apart');
	const iw = itemDungeon('leftovers', 1);
	A(iw && has(iw.floors[0], 'find') && !dungeonAt(iw.id, 17).floors[0].items.some((e) => NEW.includes(e.id)), 'and an item\'s world played as a maze');
	const w = (d, id) => (d.floors[2].items.find((e) => e.id === id) || { w: 0 }).w;
	A(w(dungeonById('starfall-spire'), 'find') > w(dungeonById('whisper-woods'), 'find'), 'finds are commoner in the last dungeon than the first');
}

// ---------- a find is rolled by the floor: nothing dearer than the floor allows
{
	const T = (seed) => { const r = makeRng(seed); return { roll: (n) => r.int(n) }; };
	const t = T('rolls'), got1 = Array.from({ length: 300 }, () => rollItem([{ id: 'find', w: 1 }], t, 1, 100)), got30 = Array.from({ length: 300 }, () => rollItem([{ id: 'find', w: 1 }], t, 30, 100));
	A(got1.every((it) => HELD[it.id] && HELD[it.id].stars <= findCap(1) && !it.sticky && !it.n), 'floor 1: only the cheap ones, never sticky', got1.find((it) => !HELD[it.id] || HELD[it.id].stars > findCap(1)));
	A(got30.every((it) => HELD[it.id] && HELD[it.id].stars <= findCap(30)) && got30.some((it) => HELD[it.id].stars > findCap(1)), 'floor 30: dearer ones too');
	A(findsFor(1).length >= 5 && findsFor(30).length > findsFor(1).length && findCap(30) > findCap(1), 'the deeper the floor, the more there is to find', [findsFor(1).length, findsFor(30).length]);
	const a = T('same'), b = T('same');
	A(JSON.stringify(Array.from({ length: 40 }, () => rollItem(NEW_ITEMS, a, 9, 5))) === JSON.stringify(Array.from({ length: 40 }, () => rollItem(NEW_ITEMS, b, 9, 5))), 'the same seed rolls the same items');
	const wand = Array.from({ length: 60 }, () => rollItem([{ id: 'dozewand', w: 1 }], t, 5, 0));
	A(wand.every((it) => it.n >= 3 && it.n <= 6), 'a wand comes with 3 to 6 charges');
}

// ---------- a find: picked up, carried, sold, and carried OUT into your items (not the maze's storage)
{
	const S = arena([{ id: 'oran' }]);
	S.items.push({ x: 21, y: 15, id: 'leftovers' });
	const e = MM.act(S, { t: 'step', d: 2 }, data);
	A(S.bag.some((b) => b.id === 'leftovers') && of(e, 'pickup')[0].id === 'leftovers' && !S.items.length, 'stepped on: into the bag');
	const slot = S.bag.findIndex((b) => b.id === 'leftovers');
	A(no(S, { t: 'use', slot }) === 'not something to use' && no(S, { t: 'throw', slot }) === 'not for throwing' && no(S, { t: 'give', slot, uid: 'p1' }) === 'a partner has no use for it', 'it cannot be used, thrown or given');
	A(no(S, { t: 'drop', slot }) === null && sellPrice({ id: 'leftovers' }) === Math.floor(HELD.leftovers.stars / 2), 'it can be put down, and a shopkeeper pays half its camp price');
	S.over = { won: true, floor: 3 };
	const out = mmOutcome(S);
	A(out.goods.join() === 'leftovers' && out.items.join() === 'oran', 'a cleared run: the find is apart from the items for the storage', out);
	const c0 = newFigs(), r = applyMmRewards(c0, out, S.dungeon, data, 'Ab-12');
	A(haveGood(r.col, 'leftovers') === 1 && r.report.goods.join() === 'leftovers' && mmStoreSize(r.col) === 1 && Object.values(cleanMm(r.col.mm).store).join() === 'oran', 'banked: the held item is with your items, the bead in the storage', r.report);
	A(mmStoreAdd(c0, 'leftovers', 'abcd') === c0 && mmStoreSize({ ...c0, mm: { clear: {}, best: {}, store: { 'leftovers-abcd': 'leftovers', 'oran-abcd': 'oran' } } }) === 1, 'the storage never holds one');
	const Q = arena([{ id: 'leftovers' }]); Q.over = { won: false, quit: true, floor: 1 };
	A(mmOutcome(Q).goods.length === 0 && applyMmRewards(c0, mmOutcome(Q), Q.dungeon, data, 'q').report.goods.length === 0, 'given up: the find is lost with the rest');
	// in a shop it costs its camp price
	const P = arena([], { seed: 'shop' });
	for (let y = 14; y <= 16; y++) for (let x = 19; x <= 23; x++) P.F.terrain[y * W + x] |= T_SHOP;
	Object.assign(MM.addWild(P, 'kecleon', 90, 20, 18, data), { keeper: true, hostile: false, nap: false });
	P.items.push({ x: 21, y: 15, id: 'leftovers', shop: true, price: ITEMS.leftovers.price });
	MM.act(P, { t: 'step', d: 2 }, data);
	const te = MM.act(P, { t: 'take' }, data);
	A(P.owed === HELD.leftovers.stars && of(te, 'take')[0].price === HELD.leftovers.stars && P.bag[0].unpaid === HELD.leftovers.stars, 'a shop asks its camp price');
}

// ---------- wands: waved the way the leader faces, a charge a wave
{
	const S = arena([{ id: 'dozewand', n: 3 }]);
	const v = foe(S, 4); v.nap = false; v.stone = false;
	A(!usable('dozewand') && throwable('dozewand') && no(S, { t: 'throw', slot: 0 }) === null, 'a wand is waved (the throw action), not eaten');
	const t0 = S.turns, e = MM.act(S, { t: 'throw', slot: 0 }, data);
	A(v.status === 'slp' && S.bag[0].n === 2 && S.turns === t0 + 1 && of(e, 'thrown')[0].hit === v.uid, 'Dozing Wand: the first Pokémon ahead sleeps; one charge gone; a turn', [v.status, S.bag]);
	A(!S.items.length, 'nothing is left lying on the floor');
	const S2 = arena([{ id: 'dozewand', n: 1 }]);
	MM.act(S2, { t: 'throw', slot: 0 }, data);
	A(!S2.bag.length && !S2.items.length, 'a wave at nothing spends the charge; the last charge spends the wand');

	const W2 = arena([{ id: 'swapwand', n: 2 }]), w = foe(W2, 5), lead = L(W2);
	MM.act(W2, { t: 'throw', slot: 0 }, data);
	A(lead.x === 25 && lead.y === 15 && w.x === 20 && w.y === 15, 'Swapping Wand: the leader and the Pokémon ahead change places', [lead.x, w.x]);

	const W3 = arena([{ id: 'slowwand', n: 2 }]), s = foe(W3, 3); s.nap = false; s.stone = false; s.status = 'slp'; s.sleepTurns = 99;
	MM.act(W3, { t: 'throw', slot: 0 }, data);
	A(s.slow > 0 && s.stage === MM.NORMAL_STAGE - 1, 'Slowing Wand: the Pokémon ahead is slowed', [s.slow, s.stage]);

	const W4 = arena([{ id: 'banishwand', n: 2 }]), b = foe(W4, 2);
	const e4 = MM.act(W4, { t: 'throw', slot: 0 }, data);
	A(of(e4, 'warp').some((x) => x.uid === b.uid) && !(b.x === 22 && b.y === 15), 'Banishing Wand: the Pokémon ahead is sent somewhere else');
	A(MM.actBlock(arena([{ id: 'dozewand', n: 3 }], { rev: 17 }), { t: 'throw', slot: 0 }, data) === null, '(the table is the table: an old run handed a wand could still throw it; its floors never hold one)');
}

// ---------- the new food and the Vigor Pellet
{
	const S = arena([{ id: 'glazedapple' }, { id: 'waxfeast' }, { id: 'vigorseed' }, { id: 'vigorseed' }]);
	const u = L(S);
	S.belly = 100; u.hp = 1;
	MM.act(S, { t: 'use', slot: 0 }, data);
	A(S.belly >= 590 && S.belly <= 600 && u.hp >= Math.ceil(u.maxHP / 2), 'Glazed Wax Apple: the belly by 50 and half of all HP', [S.belly, u.hp, u.maxHP]);
	S.belly = 100; u.hp = 1; u.status = 'psn';
	MM.act(S, { t: 'use', slot: 0 }, data);
	A(S.belly >= BELLY_MAX - 10 && u.hp >= u.maxHP - 2 && !u.status, 'Wax Feast: a full belly, all HP, the status gone', [S.belly, u.hp, u.status]);
	MM.act(S, { t: 'use', slot: 0 }, data);
	A(u.boosts.atk === 1 && u.boosts.spa === 1, 'Vigor Pellet, eaten: Attack and Sp. Atk up a stage', u.boosts);
	const v = foe(S, 3);
	MM.act(S, { t: 'throw', slot: 0 }, data);
	A(v.boosts.atk === 1, 'thrown at a foe it does the same for the foe: know what you throw', v.boosts);
}

// ---------- unknown pellets: in a hard dungeon only, until one of the kind is tried
{
	const hard = { hard: true };
	const S = arena([{ id: 'sleepseed' }, { id: 'quickseed' }, { id: 'oran' }, { id: 'warpseed' }, { id: 'sleepseed' }], { dungeon: hard });
	A(isHidden(S, 'sleepseed') && isHidden(S, 'quickseed') && !isHidden(S, 'oran') && !isHidden(S, 'dozewand') && !isHidden(S, 'apple'), 'a hard dungeon: pellets are unknown, nothing else is');
	const al = pelletAlias(S, 'sleepseed');
	A(/^[A-Z][a-z]+ Pellet$/.test(al) && nameIn(S, S.bag[0]) === al && nameIn(S, { id: 'oran' }) === 'Oran Bead' && nameIn(S, { id: 'sleepseed', n: 3 }) === al + ' x3', 'an unknown pellet goes by a colour: ' + al);
	A(/do not know/.test(noteIn(S, S.bag[0])) && noteIn(S, { id: 'oran' }) === ITEMS.oran.note, 'and its note gives nothing away');
	A(iconIn(S, S.bag[0]) === 'pellet-' + al.split(' ')[0].toLowerCase() && iconIn(S, { id: 'oran' }) === 'oran' && PELLET_COLOURS.includes(al.split(' ')[0]), 'and its picture is its colour, not its kind', iconIn(S, S.bag[0]));
	const kinds = Object.keys(ITEMS).filter((id) => ITEMS[id].group === 'seed'), cols = kinds.map((id) => pelletAlias(S, id));
	A(kinds.length >= 6 && new Set(cols).size === kinds.length, 'every kind has a colour of its own', cols);
	const other = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => pelletAlias({ seed, rev: 18, dungeon: hard }, 'sleepseed'));
	A(new Set(other).size > 1, 'another run deals the colours another way', other);
	// thrown at nothing: still unknown
	MM.act(S, { t: 'throw', slot: 3 }, data);
	A(isHidden(S, 'warpseed'), 'thrown at nothing: still unknown');
	// eaten: known from then on, every one of its kind
	const e = MM.act(S, { t: 'use', slot: 0 }, data);
	A(of(e, 'known').length === 1 && of(e, 'known')[0].id === 'sleepseed' && !isHidden(S, 'sleepseed') && nameIn(S, { id: 'sleepseed' }) === 'Sleep Pellet' && of(e, 'status').some((x) => x.st === 'slp'), 'eaten: it was a Sleep Pellet, and the run knows the kind now', e.filter((x) => x.t === 'known'));
	A(isHidden(S, 'quickseed') && S.known.sleepseed === true, 'the other kinds are still unknown');
	const snap = MM.fromSnapshot(MM.toSnapshot(S), data);
	A(!isHidden(snap, 'sleepseed') && isHidden(snap, 'quickseed'), 'what is known survives a save');
	// thrown and it hits: known
	const T2 = arena([{ id: 'stunseed' }], { dungeon: hard }), v = foe(T2, 3); v.nap = false; v.stone = false;
	const e2 = MM.act(T2, { t: 'throw', slot: 0 }, data);
	A(of(e2, 'known').some((x) => x.id === 'stunseed') && !isHidden(T2, 'stunseed'), 'thrown and it hits someone: known');
	// handed to a partner: known
	const T3 = arena([{ id: 'quickseed' }], { dungeon: hard });
	MM.act(T3, { t: 'give', slot: 0, uid: 'p1' }, data);
	A(!isHidden(T3, 'quickseed'), 'handed to a partner: known');
	// a shop's label says what it is
	const P = arena([], { seed: 'label', dungeon: hard });
	for (let y = 14; y <= 16; y++) for (let x = 19; x <= 23; x++) P.F.terrain[y * W + x] |= T_SHOP;
	Object.assign(MM.addWild(P, 'kecleon', 90, 20, 18, data), { keeper: true, hostile: false, nap: false });
	const forSale = { x: 21, y: 15, id: 'blastseed', shop: true, price: ITEMS.blastseed.price };
	P.items.push(forSale);
	A(nameIn(P, forSale) === 'Blast Pellet' && isHidden(P, 'blastseed'), 'an item for sale is named on the shelf');
	MM.act(P, { t: 'step', d: 2 }, data); MM.act(P, { t: 'take' }, data);
	A(!isHidden(P, 'blastseed'), 'taken from the shelf: the kind is known');
	// not in an ordinary dungeon, and not in a run recorded before rules 18
	const N = arena([{ id: 'sleepseed' }]);
	A(!isHidden(N, 'sleepseed') && nameIn(N, N.bag[0]) === itemName(N.bag[0]) && of(MM.act(N, { t: 'use', slot: 0 }, data), 'known').length === 0 && !N.known, 'an ordinary dungeon: every pellet is named, and nothing is "found out"');
	const O = arena([{ id: 'sleepseed' }], { dungeon: hard, rev: 17 });
	A(!isHidden(O, 'sleepseed') && of(MM.act(O, { t: 'use', slot: 0 }, data), 'known').length === 0 && !O.known, 'a run recorded under rules 17 in a hard dungeon: named, as it was played');
	A(DUNGEONS.filter((d) => d.hard).map((d) => d.id).sort().join() === 'ancients-descent,starfall-spire,the-abyss', 'the hard dungeons are Starfall Spire, Ancients\' Descent and The Abyss');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
