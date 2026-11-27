// poketactica_mm_recruits_test.mjs — MYSTERY MAZE, RECRUITS THAT MATTER (Plans/POKETACTICA_MODES_PLAN.md item M3; rules
// 25). "A recruit is a plain figurine." Four things:
//   only here      the kinds no other dungeon has, worked out from the floors
//   a recruit log  each kind that has ever joined, and where it first did (kept with the collection, synced)
//   Welcome Bell   an item that, in the bag, raises the chance a wild Pokémon joins; it lies on a few floors
//   a boss joins   on a dungeon cleared before, its boss may join when the leader knocks it out
// Pure: node only.   node overworld/tests/poketactica_mm_recruits_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { DUNGEONS, dungeonById, kindsOf, onlyHere } from '../../poketactica/js/mm/dungeons.js';
import { ITEMS, usable, throwable } from '../../poketactica/js/mm/items.js';
import { mmRecipe, validMmRecipe, mmNewRun, mmFig } from '../../poketactica/js/mm/replay.js';
import { applyMmRewards } from '../../poketactica/js/mm/rewards.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { newFigs, addFig, cleanFigs, merge3Figs } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-r' + lv, shinyRate: 0 });
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 5, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 6, trapDensity: 10, numExtraHallways: 3, buriedItemDensity: 2, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const TEST = { id: 'test', name: 'Test Cave', party: 4, reward: { first: 100, again: 40 }, floors: Array.from({ length: 2 }, (_, i) => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [], ...(i === 1 ? { noRecruit: true } : {}) })) };
/** An open field: the leader (a Lv 60 Machamp) at (20, 15) facing east, a wild one asleep in front of it; knocked out in a few blows. -> the run */
function ko(seed, { sp = 'rattata', lv = 2, more = {}, bag = [], boss = false, floor = 1 } = {}) {
	const S = MM.newRun(seed, { dungeon: TEST, party: [fig('machamp', 60)], bag, ...more }, data);
	if (floor === 2) { S.F.stairs = [MM.leaderOf(S).x, MM.leaderOf(S).y]; MM.act(S, { t: 'stairs' }, data); }
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	S.units = S.units.filter((u) => u.side === 'p'); S.B.units = S.units;
	const u = MM.leaderOf(S); u.x = 20; u.y = 15; MM.act(S, { t: 'face', d: 2 }, data);
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	S.F.stairs = [50, 28];
	Object.assign(MM.addWild(S, sp, lv, 21, 15, data), { nap: true }, boss ? { boss: true } : {});
	for (let i = 0; i < 6 && S.units.some((x) => x.side !== 'p' && x.hp > 0); i++) MM.act(S, { t: 'attack' }, data);
	return S;
}
const count = (n, o) => { let k = 0; for (let i = 0; i < n; i++) k += ko('rc' + i, o).recruits.length; return k; };

// ---------- only here
{
	const woods = dungeonById('whisper-woods'), all = DUNGEONS.filter((d) => !d.endless);
	A(kindsOf(woods).includes('caterpie') && kindsOf(woods).includes('weedle') && kindsOf(dungeonById('the-abyss')).length === 0, 'a dungeon\'s kinds are the wild Pokémon of its floors (the endless one lists none)', kindsOf(woods));
	A(JSON.stringify(onlyHere(woods).sort()) === '["bellsprout","weedle"]', 'Whisper Woods alone has Weedle and Bellsprout', onlyHere(woods));
	const seen = {}; for (const d of all) for (const sp of onlyHere(d)) seen[sp] = (seen[sp] || 0) + 1;
	A(all.every((d) => onlyHere(d).length >= 2) && Object.values(seen).every((n) => n === 1) && all.every((d) => onlyHere(d).every((sp) => data.species[sp])), 'every dungeon has two kinds or more that no other has, and no kind is "only" in two', all.map((d) => [d.id, onlyHere(d).length]));
}
// ---------- the Welcome Bell
{
	A(MM.MM_RULES_REV >= 25 && MM.RECRUIT_REV === 25 && ITEMS.joinbell && ITEMS.joinbell.name === 'Welcome Bell' && !usable('joinbell') && !throwable('joinbell'), 'rules 25: the Welcome Bell, an item that is carried (not used, not thrown)');
	const plain = count(150), bell = count(150, { bag: [{ id: 'joinbell' }] }), old = count(150, { bag: [{ id: 'joinbell' }], more: { rev: 24 } });
	A(bell >= plain + 6 && plain >= 8, `150 wild Rattata knocked out: ${plain} ask to join without the bell, ${bell} with it in the bag`, [plain, bell]);
	A(old === plain, 'a run recorded under rules 24 rolls as it did, bell or no bell', [old, plain]);
	const S = ko('keep', { bag: [{ id: 'joinbell' }] });
	A(S.bag.some((it) => it.id === 'joinbell'), 'it is not used up');
	// where it lies: a few floors, by dice of its own
	const d = dungeonById('whisper-woods'), one = [fig('pikachu')];
	let n = 0, same = 0;
	for (let k = 0; k < 200; k++) { const a = MM.newRun('bell' + k, { dungeon: d, party: one }, data); if (a.items.some((o) => o.id === 'joinbell')) n++; if (k < 20) { const b = MM.newRun('bell' + k, { dungeon: d, party: one, rev: 24 }, data), plainOf = (x) => JSON.stringify([x.items.filter((o) => o.id !== 'joinbell'), x.traps, x.F.stairs]); if (plainOf(a) === plainOf(b) && !b.items.some((o) => o.id === 'joinbell')) same++; } }
	A(n >= 2 && n <= 25 && same === 20, `200 first floors: a bell lies on ${n} (about ${MM.BELL_CHANCE} in 100); a run recorded before bells finds none and everything else is where it was`, [n, same]);
}
// ---------- a boss that joins, on a dungeon cleared before
{
	const o = { sp: 'geodude', lv: 3, boss: true, floor: 2 };
	const first = count(60, o), again = count(60, { ...o, more: { again: true } }), oldAgain = count(60, { ...o, more: { again: true, rev: 24 } });
	A(first === 0, 'a first clear: the boss never joins (60 knocked out, none)', first);
	A(again >= 6 && again <= 28, `on a dungeon cleared before: of 60 bosses knocked out, ${again} join (about 1 in 4)`, again);
	A(oldAgain === 0, 'a run recorded under rules 24 has no such rule');
	let seed = -1; for (let i = 0; i < 60 && seed < 0; i++) if (ko('rc' + i, { ...o, more: { again: true } }).recruits.length) seed = i;
	const S = ko('rc' + seed, { ...o, more: { again: true } }), b = S.units.find((u) => u.species === 'geodude');
	A(b && b.side === 'p' && b.hp === b.maxHP && !b.boss && b.wasBoss && !S.units.some((u) => u.boss && u.hp > 0), 'a boss that joins stands with the party at full HP, and is no longer "the boss"', b && [b.side, b.hp, b.boss]);
	MM.leaderOf(S).x = S.F.stairs[0]; MM.leaderOf(S).y = S.F.stairs[1];
	A(MM.actBlock(S, { t: 'stairs' }, data) === null, 'so it bars no stairs: the floor can be left');
	const wild = count(60, { sp: 'rattata', lv: 2, floor: 2, more: { again: true } });
	A(wild === 0, 'the boss\'s floor still has no other recruits');
	// the recipe keeps it
	const party = [fig('pikachu')].map(mmFig);
	const R = MM.newRun('ag', { dungeon: dungeonById('whisper-woods'), party, again: true }, data);
	const rec = mmRecipe({ seed: 'ag', dungeonId: 'whisper-woods', party, bag: [], stars: 0, acts: [], S: R });
	A(rec.again === true && validMmRecipe(rec) && mmNewRun(rec, data).again === true && !('again' in mmRecipe({ seed: 'ag', dungeonId: 'whisper-woods', party, bag: [], stars: 0, acts: [], S: MM.newRun('ag', { dungeon: dungeonById('whisper-woods'), party }, data) })), 'a run\'s recipe keeps "cleared before", so its replay is the same run; a first run has no such field');
	A(!MM.newRun('ab', { dungeon: dungeonById('the-abyss'), party, again: true }, data).again, 'the endless dungeon has no boss to join');
}
// ---------- the recruit log
{
	let col = addFig(newFigs(), fig('pikachu'));
	const out = (recruits) => ({ kept: true, goods: [], won: true, escaped: false, quit: false, floor: 2, stars: 0, carried: 0, items: [], recruits, exp: {}, moveXp: {}, fallen: [], kills: 0, ch: [] });
	let r = applyMmRewards(col, out([fig('weedle', 4), fig('caterpie', 4)]), dungeonById('whisper-woods'), data, 'a');
	col = r.col;
	A(JSON.stringify(col.mm.log) === '{"weedle":"whisper-woods","caterpie":"whisper-woods"}' && r.report.newKinds.join() === 'weedle,caterpie', 'two recruits carried out: both kinds are logged, with the dungeon they joined in', col.mm.log);
	r = applyMmRewards(col, out([fig('weedle', 6), fig('geodude', 6)]), dungeonById('pebble-hollow'), data, 'b');
	col = r.col;
	A(col.mm.log.weedle === 'whisper-woods' && col.mm.log.geodude === 'pebble-hollow' && r.report.newKinds.join() === 'geodude', 'a kind already logged keeps where it FIRST joined; only the new kind is new', [col.mm.log, r.report.newKinds]);
	const kept = cleanFigs(JSON.parse(JSON.stringify(col)));
	A(JSON.stringify(kept.mm.log) === JSON.stringify(col.mm.log), 'a saved and loaded collection keeps the log');
	const other = { ...newFigs(), mm: { clear: {}, best: {}, store: {}, log: { zubat: 'pebble-hollow', 'BAD KEY': 'x' } } };
	const both = merge3Figs(newFigs(), col, other);
	A(Object.keys(both.mm.log).sort().join() === 'caterpie,geodude,weedle,zubat', 'two devices: the kinds of both (a key that is not a species id is dropped)', both.mm.log);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
