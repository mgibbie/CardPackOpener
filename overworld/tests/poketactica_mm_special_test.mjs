// poketactica_mm_special_test.mjs — MYSTERY MAZE, SPECIAL FLOORS (rules revision 20;
// Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md item 11: "shops and Monster Houses at 5 to 8% are the only events").
// Every fourth floor from the third is a gold vault (piles of stars under guard), a locked room (its key lies elsewhere
// on the floor) or a floor of sleepers. A run recorded under rules 19 has none.
// Pure: node only.   node overworld/tests/poketactica_mm_special_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, NO_ROOM } from '../../poketactica/js/mm/gen.js';
import { DIR8, canStep8 } from '../../poketactica/js/mm/shapes8.js';
import { DUNGEONS, dungeonById, dungeonAt, dungeonLevels, endlessFloor, specialAt, SPECIALS, SPECIAL_NAME, SPECIAL_SAY, SPECIAL_REV } from '../../poketactica/js/mm/dungeons.js';
import { ITEMS, usable, throwable, givable } from '../../poketactica/js/mm/items.js';
import { mmOutcome } from '../../poketactica/js/mm/rewards.js';
import { mmStoreAdd } from '../../poketactica/js/figcol.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 40) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-sp' + lv, shinyRate: 0 });
const PLAIN = { types: [], ability: null };
/** The first floor of that kind in the story dungeons, as a two-floor dungeon of its own. */
const floorOfKind = (kind) => { for (const d of DUNGEONS) if (!d.endless) { const fl = d.floors.find((f) => f.special === kind); if (fl) return fl; } return null; };
const run = (kind, seed, o = {}) => { const fl = floorOfKind(kind); return MM.newRun(seed, { dungeon: { id: 'test', name: 'Test', party: 4, floors: [fl, { ...fl, special: undefined }] }, party: [fig('pikachu'), fig('squirtle')], bag: o.bag || [], ...(o.rev ? { rev: o.rev } : {}) }, data); };
const at = (S, x, y) => y * W + x;
const SEEDS = Array.from({ length: 12 }, (_, i) => 'sp' + i);

A(MM.MM_RULES_REV >= 20 && SPECIAL_REV === 20, 'the rules revision is 20 or later');

// ---------- which floors
{
	A(specialAt(0, 10) === null && specialAt(1, 10) === null && SPECIALS.includes(specialAt(2, 10)) && specialAt(3, 10) === null && SPECIALS.includes(specialAt(6, 10)), 'every fourth floor from the third is a special one');
	A(new Set([2, 6, 10].map((i) => specialAt(i, 12))).size === 3, 'the three kinds come in turn');
	A(SPECIALS.every((k) => SPECIAL_NAME[k] && SPECIAL_SAY[k]), 'each kind has a name and a line that says what it is');
	const first = DUNGEONS[0];
	A(!first.floors.some((f) => f.special), 'the first dungeon has no special floor', first.id);
	A(DUNGEONS.filter((d) => !d.endless).every((d) => !d.floors[d.floors.length - 1].special), 'a boss\'s floor is never a special one');
	A(DUNGEONS.filter((d) => !d.endless && d !== first).every((d) => d.floors.some((f) => f.special)), 'every other story dungeon has one at least');
	const d = dungeonById('ember-rift'), old = dungeonAt('ember-rift', 19);
	A(!old.floors.some((f) => f.special) && old.floors.length === d.floors.length, 'the dungeon as a rules-19 run knew it has none');
	A(dungeonAt('ember-rift', 19) === dungeonAt('ember-rift', 19) || dungeonAt('ember-rift', 19).floors === old.floors, 'and it is made once');
	A(old.floors.some((f) => f.weather), 'it still has its weather');
	A(dungeonAt('ember-rift', 20) === d, 'a rules-20 run has the dungeon as it is');
	const sl = d.floors.findIndex((f) => f.special === 'sleepers');
	A(sl >= 0 && d.floors[sl].props.enemyDensity === old.floors[sl].props.enemyDensity + 3 && d.floors[sl].props.itemDensity === old.floors[sl].props.itemDensity + 2, 'a floor of sleepers has 3 more wild Pokémon and 2 more items');
	A(dungeonLevels(d).special === true && dungeonLevels(first).special === false, 'the camp can tell which dungeons have them');
	A(endlessFloor(3).special && endlessFloor(8).special && endlessFloor(13).special && !endlessFloor(4).special && new Set([3, 8, 13].map((k) => endlessFloor(k).special)).size === 3, 'the endless dungeon: every fifth floor from the third, the three kinds in turn');
	A(!endlessFloor(8, false, false, false, true).special, 'and none for a run recorded before');
	const abyss = DUNGEONS.find((x) => x.endless);
	A(dungeonAt(abyss.id, 19).plainFloors === true && !dungeonAt(abyss.id, 19).clearSky && dungeonAt(abyss.id, 18).clearSky === true && dungeonAt(abyss.id, 20) === abyss, 'which the dungeon of that revision asks for');
}

// ---------- a floor of sleepers
{
	const S = run('sleepers', 'zz1'), wild = S.units.filter((u) => u.side !== 'p');
	A(wild.length >= 4 && wild.every((u) => u.nap), 'every wild Pokémon on it starts asleep', wild.length);
	A(S.ev.some((e) => e.t === 'special' && e.kind === 'sleepers'), 'the floor says what it is');
	A(MM.view(S).special === 'sleepers', 'and so does what a spectator is shown');
	const old = run('sleepers', 'zz1', { rev: 19 });
	A(!old.ev.some((e) => e.t === 'special') && MM.view(old).special === null, 'a rules-19 run of the same floor is told nothing');
	// one of them, with the leader put beside it, wakes on its turn; the others sleep on
	const w = wild[0], L = MM.leaderOf(S);
	const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => MM.canEnter(S.F, L, w.x + DIR8[k][0], w.y + DIR8[k][1]) && !MM.unitAt(S, w.x + DIR8[k][0], w.y + DIR8[k][1]));
	L.x = w.x + DIR8[d][0]; L.y = w.y + DIR8[d][1];
	for (let i = 0; i < 3; i++) MM.act(S, { t: 'pass' }, data);
	A(!w.nap, 'one wakes when you come beside it');
	A(wild.filter((u) => u !== w && u.hp > 0 && Math.max(Math.abs(u.x - L.x), Math.abs(u.y - L.y)) > 3).every((u) => u.nap), 'the others sleep on');
}

// ---------- a gold vault
{
	let made = 0, okPiles = 0, okGuards = 0, okRoom = 0;
	for (const seed of SEEDS) {
		const S = run('vault', seed), F = S.F;
		if (!S.ev.some((e) => e.t === 'special' && e.kind === 'vault')) continue;
		made++;
		const L = MM.leaderOf(S), inRoom = (o) => F.room[at(S, o.x, o.y)] === F.vault;
		const piles = S.items.filter((o) => o.id === 'stars' && inRoom(o) && o.n >= 15);
		if (piles.length >= 3) okPiles++;
		const guards = S.units.filter((u) => u.side !== 'p' && u.post && inRoom(u));
		if (guards.length >= 1 && guards.length <= MM.VAULT_GUARDS && guards.every((u) => !u.nap && u.post[0] === u.x && u.post[1] === u.y)) okGuards++;
		if (F.vault !== NO_ROOM && F.vault !== F.room[at(S, L.x, L.y)] && F.vault !== F.room[at(S, F.stairs[0], F.stairs[1])] && !F.locks) okRoom++;
	}
	A(made >= SEEDS.length - 2, 'a vault is made on nearly every such floor', made);
	A(okPiles === made, 'it holds piles of stars, bigger than a floor\'s own', [okPiles, made]);
	A(okGuards === made, 'and guards stand over them, awake, each at its post', [okGuards, made]);
	A(okRoom === made, 'it is not the room you start in, nor the stairs\', and it is not locked', [okRoom, made]);
	const old = run('vault', SEEDS[0], { rev: 19 });
	A(old.F.vault == null && !old.units.some((u) => u.post), 'a rules-19 run of the same floor has no vault');
}

// ---------- a locked room
{
	let made = 0, okKey = 0, okShut = 0, okFind = 0, S0 = null;
	for (const seed of SEEDS) {
		const S = run('locked', seed), F = S.F;
		if (!F.locks) continue;
		made++; S0 = S0 || S;
		const L = MM.leaderOf(S), dist = MM.walkMap(F, PLAIN, L.x, L.y), key = S.items.filter((o) => o.id === 'vaultkey');
		if (key.length === 1 && dist[at(S, key[0].x, key[0].y)] > 0 && dist[at(S, F.stairs[0], F.stairs[1])] >= 0 && F.room[at(S, key[0].x, key[0].y)] !== F.vault) okKey++;
		const inside = S.items.filter((o) => o.locked);
		if (inside.length >= 3 && inside.every((o) => F.room[at(S, o.x, o.y)] === F.vault && dist[at(S, o.x, o.y)] < 0) && F.locks.length <= MM.LOCK_DOORS_MAX) okShut++;
		if (inside.some((o) => ITEMS[o.id].group === 'good') && inside.some((o) => o.id === 'stars' && o.n >= 45) && !inside.some((o) => o.sticky && o.id !== 'stars' && ITEMS[o.id].group === 'good')) okFind++;
	}
	A(made >= SEEDS.length / 2, 'a room is locked on most such floors', made);
	{ const no = SEEDS.map((s) => run('locked', s)).find((x) => !x.F.locks); A(!no || (MM.view(no).special === null && !no.ev.some((e) => e.t === 'special') && !no.items.some((o) => o.id === 'vaultkey')), 'a floor with no room to lock is an ordinary one, and says nothing'); }
	A(okKey === made, 'one Brass Key lies outside it where you can walk to, and the stairs can still be reached', [okKey, made]);
	A(okShut === made, 'what is inside cannot be walked to', [okShut, made]);
	A(okFind === made, 'inside: a held item and a great pile of stars', [okFind, made]);

	// at a door
	const S = S0, F = S.F, L = MM.leaderOf(S), door = F.locks[0], dx = door % W, dy = Math.floor(door / W);
	const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => { const x = dx - DIR8[k][0], y = dy - DIR8[k][1]; return F.room[at(S, x, y)] !== F.vault && !MM.isLock(F, x, y) && MM.canEnter(F, L, x, y) && canStep8(F, x, y, k) && !MM.unitAt(S, x, y); });
	L.x = dx - DIR8[d][0]; L.y = dy - DIR8[d][1];
	A(MM.isLock(F, dx, dy) && !MM.canEnter(F, L, dx, dy), 'a locked door is no tile to step on');
	A(/locked door/.test(MM.actBlock(S, { t: 'step', d }, data) || ''), 'without the key the leader is told so', MM.actBlock(S, { t: 'step', d }, data));
	A(MM.view(S).locks.every((i) => S.seen[i]), 'a spectator is shown only the doors that have been seen');
	const h0 = MM.hashOf(S);
	// the trawl leaves what is locked away
	S.bag.push({ id: 'trawlorb' });
	MM.act(S, { t: 'use', slot: S.bag.length - 1 }, data);
	A(S.items.filter((o) => o.locked).every((o) => F.room[at(S, o.x, o.y)] === F.vault), 'a Trawl Marble leaves what is behind the door');
	L.x = dx - DIR8[d][0]; L.y = dy - DIR8[d][1];
	// the key
	const k = ITEMS.vaultkey;
	A(k && k.group === 'key' && !usable('vaultkey') && !throwable('vaultkey') && !givable('vaultkey'), 'the key is not for eating, throwing or handing over');
	S.bag.push({ id: 'vaultkey' });
	A(MM.actBlock(S, { t: 'step', d }, data) === null, 'with the key the step is allowed');
	const was = [L.x, L.y], ev = MM.act(S, { t: 'step', d }, data);
	A(ev.some((e) => e.t === 'unlock' && e.key) && !S.F.locks && !S.bag.some((it) => it.id === 'vaultkey'), 'it opens the door and the key is spent');
	A(S.turns > 0 && was.length === 2, 'opening it is the turn');
	A(!S.items.some((o) => o.locked) && MM.canEnter(S.F, L, dx, dy), 'the room and what is in it are open');
	A(MM.hashOf(S) !== h0, 'the run\'s hash tells a shut door from an open one');
	A(MM.view(S).locks === undefined, 'no doors are shown once it is open');

	// from inside (a warp put you there): no key is needed
	const T = run('locked', SEEDS.find((s) => run('locked', s).F.locks)), G = T.F, M = MM.leaderOf(T);
	const d2 = [0, 1, 2, 3, 4, 5, 6, 7].find((q) => { const x = G.locks[0] % W - DIR8[q][0], y = Math.floor(G.locks[0] / W) - DIR8[q][1]; return G.room[y * W + x] === G.vault && canStep8(G, x, y, q) && !MM.unitAt(T, x, y); });
	M.x = G.locks[0] % W - DIR8[d2][0]; M.y = Math.floor(G.locks[0] / W) - DIR8[d2][1];
	A(MM.actBlock(T, { t: 'step', d: d2 }, data) === null, 'from inside the room the door opens without the key');
	const ev2 = MM.act(T, { t: 'step', d: d2 }, data);
	A(ev2.some((e) => e.t === 'unlock' && !e.key) && !T.F.locks, 'and it does');

	// the key stays on its floor
	const U = run('locked', 'keyfloor');
	U.bag.push({ id: 'vaultkey' }, { id: 'apple' });
	const lead = MM.leaderOf(U); lead.x = U.F.stairs[0]; lead.y = U.F.stairs[1];
	for (const u of U.units) if (u.side !== 'p') u.hp = 0;
	MM.act(U, { t: 'stairs' }, data);
	A(U.floorNo === 2 && !U.bag.some((it) => it.id === 'vaultkey') && U.bag.some((it) => it.id === 'apple'), 'the key does not come down the stairs; the rest of the bag does');
	// nor out of the dungeon
	const V = run('locked', 'keyout');
	V.bag.push({ id: 'vaultkey' }, { id: 'apple' }); V.over = { won: true, floor: 1 };
	const out = mmOutcome(V);
	A(!out.items.includes('vaultkey') && out.items.includes('apple'), 'nor out of the dungeon');
	const col = { figs: {}, mm: { clear: {}, best: {}, store: {} } };
	A(mmStoreAdd(col, 'vaultkey', 'x1') === col, 'the storage will not take one');

	const old = run('locked', SEEDS[0], { rev: 19 });
	A(!old.F.locks && !old.items.some((o) => o.id === 'vaultkey' || o.locked), 'a rules-19 run of the same floor has no locked room and no key');
}

// ---------- a whole run is the same run twice
{
	const play = () => { const S = run('locked', 'same'); const out = []; for (let i = 0; i < 30 && !S.over; i++) { const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => !MM.actBlock(S, { t: 'step', d: (k + i) % 8 }, data)); MM.act(S, d == null ? { t: 'pass' } : { t: 'step', d: (d + i) % 8 }, data); out.push(MM.hashOf(S)); } return out.join(); };
	A(play() === play(), 'the same seed and the same steps give the same floor, door for door');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
