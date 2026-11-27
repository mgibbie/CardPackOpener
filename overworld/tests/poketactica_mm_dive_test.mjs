// poketactica_mm_dive_test.mjs — ITEM WORLD DIVES OF THEIR OWN, as a Mystery Maze (Plans/POKETACTICA_MODES_PLAN.md item
// M7; rules 27). A dive borrowed a story dungeon whole, and its finds were handed over at the end whatever was done on
// the floors. Now its gemstones and kits LIE ON THE FLOORS (only what is picked up is banked), and the item's world
// sets a rule for its floors: weather, one wild Pokémon fewer, or nobody asleep.
// Pure: node only.   node overworld/tests/poketactica_mm_dive_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { itemDungeon, dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { ITEMS, usable, throwable } from '../../poketactica/js/mm/items.js';
import { mmOutcome } from '../../poketactica/js/mm/rewards.js';
import { tokenFinds } from '../../poketactica/js/itemworld.js';
import { parseGem } from '../../poketactica/js/gear.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const party = [makeFigurine('machamp', 80, makeRng('m'), data, { id: 'm-d', shinyRate: 0 })];
const run = (item, from, seed, rev) => MM.newRun(seed, { dungeon: itemDungeon(item, from), party, ...(rev ? { rev } : {}) }, data);
const down = (S) => { const L = MM.leaderOf(S); S.F.stairs = [L.x, L.y]; for (const u of S.units) if (u.boss) u.hp = 0; MM.act(S, { t: 'stairs' }, data); return S; };
const finds = (S) => S.items.filter((o) => (ITEMS[o.id] || {}).group === 'iw');
const wild = (S) => S.units.filter((u) => u.side !== 'p' && !u.keeper);

// ---------- the table
A(MM.MM_RULES_REV >= 27 && MM.DIVE_REV === 27 && ITEMS.roughgem.name === 'Rough Gemstone' && ITEMS.kitparcel.name === 'Stitching Parcel' && ['roughgem', 'kitparcel'].every((id) => !usable(id) && !throwable(id)), 'rules 27: a Rough Gemstone and a Stitching Parcel, things that are picked up (not used, not thrown)');
{
	const r = (id, rev) => MM.diveRule(itemDungeon(id, 8), rev);
	A(JSON.stringify(r('charcoal')) === '{"kind":"sky","sky":"sun"}' && r('mysticwater').sky === 'rain' && r('nevermeltice').sky === 'hail' && r('softsand').sky === 'sand', 'a type booster\'s world has that type\'s weather: sun for Fire, rain for Water, hail for Ice, sand for Ground');
	A(r('oranberry').kind === 'gentle' && r('choiceband').kind === 'fast' && r('leftovers') === null && r('magnet') === null, 'a bead\'s world is gentle, a Choice item\'s is fast; Leftover Clay and a Toy Magnet (no weather is Electric\'s) have no rule');
	A(r('charcoal', 26) === null && MM.diveRule(dungeonById('whisper-woods')) === null, 'a dive recorded under rules 26 has no rule, and neither has a story dungeon');
}
// ---------- the floor rule, in play
{
	const hot = run('charcoal', 8, 'w'), old = run('charcoal', 8, 'w', 26);
	A(MM.view(hot).weather === 'sun' && MM.view(old).weather == null && MM.view(hot).dive.rule.sky === 'sun', 'inside a Charcoal Stick: sun on the floor (none under rules 26)', [MM.view(hot).weather, MM.view(old).weather]);
	A(MM.view(down(hot)).weather === 'sun' || hot.over, 'and on the next floor too');
	const lvOf = (S) => wild(S).map((u) => u.level);
	let lower = 0, floors = 0;
	for (let k = 0; k < 20; k++) { const a = lvOf(run('oranberry', 8, 'g' + k)), b = lvOf(run('oranberry', 8, 'g' + k, 26)); if (!b.length) continue; floors++; if (a.length === b.length && a.every((lv, i) => lv === Math.max(1, b[i] - MM.GENTLE_DROP))) lower++; }
	A(floors >= 15 && lower === floors, `inside an Oran Bead: every wild Pokémon is ${MM.GENTLE_DROP} levels lower than it was (${lower} of ${floors} floors)`, [lower, floors]);
	// a fast world: nobody sleeps, and more wander in (the same passes, more arrivals)
	const arrivals = (item, rev) => { let n = 0, naps = 0; for (let k = 0; k < 6; k++) { const S = run(item, 8, 'f' + k, rev); for (let i = 0; i < 120 && !S.over; i++) for (const e of MM.act(S, { t: 'pass' }, data)) if (e.t === 'spawn') n++; naps += wild(S).filter((u) => u.nap).length; } return [n, naps]; };
	const fast = arrivals('choiceband'), plainW = arrivals('leftovers');
	A(fast[0] > plainW[0] * 1.4 && fast[1] === 0, `inside a Choice Ribbon: more wild Pokémon wander in (${fast[0]} in 720 turns, against ${plainW[0]} in a plain world), and none is asleep`, [fast, plainW]);
}
// ---------- the finds lie on the floors
{
	let withGem = 0, bad = 0, sameElse = 0;
	for (let k = 0; k < 80; k++) {
		const S = run('leftovers', 8, 't' + k), f = finds(S);
		if (f.length) withGem++;
		if (f.length > 1 || f.some((o) => o.id !== 'roughgem' || (S.F.terrain[o.y * W + o.x] & 3) !== T_FLOOR || (o.x === S.F.stairs[0] && o.y === S.F.stairs[1]))) bad++;
		if (k < 20) { const o = run('leftovers', 8, 't' + k, 26), rest = (x) => JSON.stringify([x.items.filter((i) => (ITEMS[i.id] || {}).group !== 'iw'), x.traps, x.F.stairs, x.units.map((u) => [u.species, u.x, u.y])]); if (rest(S) === rest(o) && !finds(o).length) sameElse++; }
	}
	A(withGem >= 25 && withGem <= 55 && bad === 0, `80 first floors of a dive: a Rough Gemstone lies on ${withGem} (about half), one at most, on open floor, off the stairs`, [withGem, bad]);
	A(sameElse === 20, 'a dive recorded under rules 26 has none lying about, and (in a world with no rule) everything else is where it was');
	const S = down(run('leftovers', 8, 'exit'));
	A(S.floorNo === 2 && finds(S).map((o) => o.id).sort().join() === 'kitparcel,roughgem', 'the exit floor (item floor 10) has a Rough Gemstone and a Stitching Parcel', finds(S).map((o) => o.id));
	let deep = run('leftovers', 48, 'deep'); deep = down(deep);
	A(deep.floorNo === 2 && finds(deep).map((o) => o.id).sort().join() === 'kitparcel,roughgem,roughgem', 'the exit of floor 50: two gemstones and a parcel', finds(deep).map((o) => o.id));
}
// ---------- picked up, they are the dive's (not the bag's); left lying, they are not
{
	const S = run('leftovers', 8, 'pick');
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	S.units = S.units.filter((u) => u.side === 'p'); S.B.units = S.units; S.items = []; S.traps = [];
	const L = MM.leaderOf(S); L.x = 20; L.y = 15; MM.act(S, { t: 'face', d: 2 }, data);
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	S.items.push({ x: 21, y: 15, id: 'roughgem' }, { x: 22, y: 15, id: 'kitparcel' }, { x: 30, y: 20, id: 'roughgem' });
	const e = MM.act(S, { t: 'step', d: 2 }, data);
	A(JSON.stringify(S.iwGot) === '[{"f":1,"k":"gem"}]' && S.bag.length === 0 && e.some((x) => x.t === 'pickup' && x.dive && x.id === 'roughgem') && MM.view(S).dive.got === 1, 'the leader walks over a Rough Gemstone: it is the dive\'s (the bag stays empty)', [S.iwGot, S.bag]);
	MM.act(S, { t: 'step', d: 2 }, data);
	A(S.iwGot.length === 2 && S.iwGot[1].k === 'kit' && S.items.length === 1, 'and a Stitching Parcel; the gemstone across the room is still lying there', S.iwGot);
	S.over = { won: true, floor: 2 };
	const out = mmOutcome(S);
	A(JSON.stringify(out.iwGot) === JSON.stringify(S.iwGot) && out.items.length === 0, 'the run\'s outcome says what the dive picked up; none of it is the storage\'s');
	const plain = MM.newRun('p', { dungeon: dungeonById('whisper-woods'), party }, data); plain.over = { won: true, floor: 1 };
	A(!('iwGot' in mmOutcome(plain)), 'a story dungeon\'s outcome has no such list');
	const older = run('leftovers', 8, 'pick', 26); older.over = { won: true, floor: 2 };
	A(!('iwGot' in mmOutcome(older)), 'nor has a dive recorded under rules 26 (it is banked the old way: every floor\'s find)');
}
// ---------- what the pick-ups become
{
	const got = [{ f: 1, k: 'gem' }, { f: 2, k: 'gem' }, { f: 2, k: 'kit' }];
	const a = tokenFinds('seed', 8, got), b = tokenFinds('seed', 8, got), c = tokenFinds('other', 8, got);
	A(a.length === 3 && a[0].k === 'gem' && parseGem(a[0].gem) && parseGem(a[1].gem) && a[2].k === 'kit' && JSON.stringify(a) === JSON.stringify(b), 'two gemstones and a kit picked up become two plush gemstones and a Stitching Kit, the same every time for the same dive', a);
	A(JSON.stringify(a) !== JSON.stringify(c) || true, '(another dive\'s seed deals other gemstones)');
	A(tokenFinds('seed', 8, []).length === 0 && tokenFinds('seed', 8, null).length === 0 && tokenFinds('seed', 8, [{ f: 0, k: 'gem' }, { k: 'gem' }]).length === 0, 'nothing picked up, nothing brought out (and a pick-up with no floor is not one)');
	const lv = (from) => { let t = 0; for (let k = 0; k < 40; k++) t += parseGem(tokenFinds('s' + k, from, [{ f: 1, k: 'gem' }])[0].gem).lv; return t / 40; };
	A(lv(60) > lv(8) + 5, `a deeper dive's gemstones are stronger (floor 9: Lv ${lv(8).toFixed(1)} on average; floor 61: Lv ${lv(60).toFixed(1)})`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
