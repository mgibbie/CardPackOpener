// poketactica_mm_dungeons_test.mjs — MYSTERY MAZE, the dungeons and what a run pays (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md
// stage 8): the launch list (8 named, 2 Lv 5, 1 endless) and every floor of it; bosses on the stairs; the endless
// dungeon; Lv 5 entry; EXP and levelling inside a run; the outcome applied to the collection (EXP, recruits, the storage
// of 200, stars, records); the collection's maze record cleaned and merged. Pure: node only.
//   node overworld/tests/poketactica_mm_dungeons_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { generateFloor, MM_W as W, MM_H as H, T_FLOOR, LAYOUTS } from '../../poketactica/js/mm/gen.js';
import { DUNGEONS, COMMON_ITEMS, EASY_TRAPS, MID_TRAPS, HARD_TRAPS, OWN_LOOT_REV, dungeonById, dungeonAt, dungeonOpen, endlessFloor, dungeonLevels } from '../../poketactica/js/mm/dungeons.js';
import { mmNewRun } from '../../poketactica/js/mm/replay.js';
import { explore } from '../../tools/poketactica/mm_explore.mjs';
import { ITEMS } from '../../poketactica/js/mm/items.js';
import { TRAPS } from '../../poketactica/js/mm/traps.js';
import { mmOutcome, applyMmRewards, clearPrize } from '../../poketactica/js/mm/rewards.js';
import { cleanFigs, cleanMm, merge3Figs, sameFigs, mmStoreAdd, mmStoreTake, mmStoreCount, mmStoreSize, MM_STORE_MAX } from '../../poketactica/js/figcol.js';
import { makeFigurine, equip, expForLevel } from '../../poketactica/js/figurine.js';
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
const L = (S) => MM.leaderOf(S);
const act = (S, a) => MM.act(S, a, data);
const of = (e, t) => e.filter((v) => v.t === t);
const col = (figs) => ({ v: 1, figs: Object.fromEntries(figs.map((f) => [f.id, f])) });

// ================================================================ the list
{
	const named = DUNGEONS.filter((d) => !d.lv5 && !d.endless), lv5 = DUNGEONS.filter((d) => d.lv5), endless = DUNGEONS.filter((d) => d.endless);
	A(named.length === 8 && lv5.length === 2 && endless.length === 1 && new Set(DUNGEONS.map((d) => d.id)).size === 11, 'the launch list: 8 named dungeons, 2 Lv 5 dungeons and the endless one');
	A(DUNGEONS.every((d) => /^[a-z0-9-]{1,24}$/.test(d.id) && d.name && d.blurb && d.theme && d.party >= 1 && d.party <= 6 && d.reward && (d.endless || d.floors.length >= 5)), 'each has an id the collection can keep, a name, a line about it, a theme and a party size');
	A(named.every((d, i) => d.floors.length >= (named[i - 1] ? named[i - 1].floors.length : 0) && d.reward.first > (named[i - 1] ? named[i - 1].reward.first : 0) && d.reward.again < d.reward.first) && named[0].floors.length === 5 && named[7].floors.length === 30, 'the named dungeons run 5 to 30 floors, each longer and richer than the last; a first clear pays most');
	A(lv5.map((d) => d.floors.length).join() === '20,25' && lv5[1].party === 1, 'the Lv 5 dungeons: 20 floors, and 25 floors alone (50 could not be made fair for one figurine)');
	A(lv5.every((d) => d.floors.every((f) => !f.props.monsterHouseChance)) && lv5[1].floors.every((f) => !f.vis) && lv5[1].floors[24].props.enemyDensity === 0 && lv5[1].floors[24].boss && lv5[0].floors[19].props.enemyDensity > 0,
		'no Monster Houses in either (a Lv 5 party with an empty bag has no answer to one); the solo one is lit, and its boss waits alone');
	const bad = [];
	let floors = 0;
	for (const d of DUNGEONS) for (const [i, f] of d.floors.entries()) {
		floors++;
		for (const w of f.wild) if (!data.species[w.species] || !(w.level >= 1) || !(w.w > 0)) bad.push(d.id + ' wild ' + w.species);
		for (const it of f.items) if (!ITEMS[it.id] && it.id !== 'find') bad.push(d.id + ' item ' + it.id);
		for (const t of f.traps) if (!TRAPS[t.id]) bad.push(d.id + ' trap ' + t.id);
		if (!f.wild.length || f.props.layout < 0 || f.props.layout > 11) bad.push(d.id + ' floor ' + i);
		if ((i === d.floors.length - 1) !== !!f.boss) bad.push(d.id + ' boss on floor ' + (i + 1));
		if (f.boss && (!data.species[f.boss.species] || f.boss.level <= Math.max(...f.wild.map((w) => w.level)) || !f.noRecruit || f.props.kecleonShopChance || f.props.monsterHouseChance)) bad.push(d.id + ' boss floor');
	}
	A(floors === 160 && !bad.length, 'all 160 floors: real Pokémon, items and traps; the last floor of each is the boss\'s (stronger than its floor, no shop, no Monster House, no recruiting)', bad.slice(0, 6));
	const levels = named.map((d) => [d.floors[0].wild[0].level, d.floors[d.floors.length - 1].boss.level]);
	A(levels.every(([lo, hi], i) => hi > lo && (!i || lo >= levels[i - 1][0])) && levels[0][0] <= 3 && levels[7][1] >= 65, 'levels rise through a dungeon and from one to the next (Lv 2 to a Lv 69 boss)', levels);
	A(DUNGEONS.filter((d) => d.hard).map((d) => d.id).join() === 'starfall-spire,ancients-descent,the-abyss', 'the dungeons the auto-explorer mostly loses are marked very hard (the camp says so before you go in)');
	const lv = dungeonLevels(dungeonById('pebble-hollow'));
	A(lv.lo === 6 && lv.hi === 11 && lv.boss === 12 && lv.bossSpecies === 'onix' && lv.suggest === 14 && dungeonLevels(dungeonById('whisper-woods')).suggest === 5 && dungeonLevels(dungeonById('sprout-trial')).suggest === 0 && dungeonLevels(dungeonById('the-abyss')) === null,
		'each dungeon says its wild levels, its boss, and a suggested party level (the first: Lv 5 starters; a Lv 5 dungeon: none)', lv);
	// every floor can be made
	let made = 0, broken = [];
	for (const d of DUNGEONS) for (const [i, f] of d.floors.entries()) { const g = generateFloor(1000 + made * 7919, f.props, { water: f.water }); made++; if (g.player[0] < 1 || g.stairs[0] < 1) broken.push(d.id + ' ' + i); }
	for (let n = 1; n <= 60; n++) { const f = endlessFloor(n), g = generateFloor(5000 + n, f.props, { water: f.water }); made++; if (g.player[0] < 1 || g.stairs[0] < 1) broken.push('abyss ' + n); }
	A(made === 220 && !broken.length, 'every one of those floors, and 60 of the endless dungeon\'s, is made by the generator', broken);
	// the way they open
	const cleared = {}, order = [];
	for (let k = 0; k < 12; k++) for (const d of DUNGEONS) if (!cleared[d.id] && dungeonOpen(d, cleared)) { order.push(d.id); cleared[d.id] = 1; }
	A(order.length === 11 && order[0] === 'whisper-woods' && dungeonOpen(DUNGEONS[0], {}) && !dungeonOpen(DUNGEONS[1], {}) && dungeonOpen(DUNGEONS[1], { 'whisper-woods': 1 }) && dungeonById('the-abyss').needs === 'frostspire', 'only Whisper Woods is open at first; each clear opens the next, and every dungeon can be reached', order);
}

// ================================================================ a boss floor
{
	const d = dungeonById('pebble-hollow');
	const S = MM.newRun('boss', { dungeon: { ...d, floors: [d.floors[d.floors.length - 1]] }, party: [fig('pikachu', 60, ['thunderbolt'])] }, data);
	const boss = S.units.find((u) => u.boss);
	A(boss && boss.species === 'onix' && boss.level === 12 && Math.max(Math.abs(boss.x - S.F.stairs[0]), Math.abs(boss.y - S.F.stairs[1])) <= 1 && !boss.nap && MM.view(S).units.every((u) => !u.boss || u.species === 'onix'), 'the boss stands on the stairs, awake', boss && [boss.x, boss.y, S.F.stairs]);
	for (let k = 0; k < 25 && !MM.wildOf(S).some((u) => !u.boss && !u.nap && Math.max(Math.abs(u.x - L(S).x), Math.abs(u.y - L(S).y)) < 3); k++) act(S, { t: 'pass' });
	A(boss.x === boss.post[0] && boss.y === boss.post[1] || MM.view(S).units.some((u) => u.boss), 'it keeps to its post while it sees no one');
	const u = L(S);
	u.x = S.F.stairs[0]; u.y = S.F.stairs[1];
	if (boss.x === u.x && boss.y === u.y) { boss.x = boss.post[0] = u.x; u.x = S.F.stairs[0]; }
	const bx = boss.x, by = boss.y;
	boss.x = -5; boss.y = -5;   // (off the stairs, so the leader can stand there, but still alive)
	A(MM.actBlock(S, { t: 'stairs' }, data) === 'the boss bars the way', 'the stairs stay shut while the boss stands');
	boss.x = bx === u.x && by === u.y ? u.x + 1 : bx; boss.y = by;
	MM.hurt(S, boss, 99999, 'test');
	const e = act(S, { t: 'stairs' });
	A(!S.units.some((x) => x.boss) && S.over && S.over.won === true && of(e, 'over')[0].won, 'when it falls they open, and the last stairs clear the dungeon');
	// knocked out by a move: said so
	const T = MM.newRun('boss2', { dungeon: { ...d, floors: [d.floors[d.floors.length - 1]] }, party: [fig('squirtle', 80, ['watergun'])] }, data);
	const b2 = T.units.find((x) => x.boss), t2 = L(T);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { T.F.terrain[y * W + x] = T_FLOOR; T.F.room[y * W + x] = 0; }
	T.B.map = { w: W, h: H, height: T.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	for (const o of MM.wildOf(T)) if (!o.boss) o.hp = 0;
	t2.x = 20; t2.y = 15; b2.x = 22; b2.y = 15; b2.post = [22, 15]; b2.hp = 1;
	let down = [], lv = [];
	for (let k = 0; k < 6 && !down.length; k++) { const ev = act(T, { t: 'move', id: 'watergun', x: b2.x, y: b2.y }); down = of(ev, 'bossdown'); lv.push(...of(ev, 'level')); }
	A(down.length === 1 && down[0].species === 'onix' && T.kills === 1 && MM.view(T).kills === 1, 'a boss knocked out is announced, and counted');
}

// ================================================================ how strong the wild are (the tuning, pinned)
{
	const d = dungeonById('pebble-hollow');
	const S = MM.newRun('strength', { dungeon: d, party: [fig('pikachu', 30)] }, data);
	const w = MM.wildOf(S)[0], same = makeFigurine(w.species, w.level, makeRng('same'), data, { id: 'same', shinyRate: 0 });
	const full = MM.newRun('full', { dungeon: { ...d, floors: [{ ...d.floors[0], wild: [] }] }, party: [same] }, data).units[0];
	A(MM.WILD_HP < 1 && MM.WILD_ATK < 1 && w.maxHP === Math.max(1, Math.round(full.maxHP * MM.WILD_HP)) && w.stats.atk === Math.max(1, Math.round(full.stats.atk * MM.WILD_ATK)) && w.stats.def === full.stats.def, 'a wild Pokémon has less HP and a softer hit than a figurine of its level (its defences are whole)', [w.maxHP, full.maxHP, MM.WILD_HP]);
	const B = MM.newRun('bossstr', { dungeon: { ...d, floors: [d.floors[d.floors.length - 1]] }, party: [fig('pikachu', 30)] }, data);
	const boss = B.units.find((u) => u.boss), onix = MM.newRun('o', { dungeon: { ...d, floors: [{ ...d.floors[0], wild: [] }] }, party: [makeFigurine('onix', boss.level, makeRng('o'), data, { id: 'o', shinyRate: 0 })] }, data).units[0];
	A(MM.BOSS_ATK < 1 && boss.maxHP === onix.maxHP && boss.stats.atk === Math.max(1, Math.round(onix.stats.atk * MM.BOSS_ATK)), 'a boss keeps all its HP but hits softer too: a long fight, not a sudden one', [boss.maxHP, boss.stats.atk, onix.stats.atk]);
	// the auto-explorer (tools/poketactica/mm_explore.mjs): a new player's three Lv 5 starters in the first dungeon
	const party = ['bulbasaur', 'charmander', 'squirtle'].map((sp, i) => makeFigurine(sp, 5, makeRng('x' + sp + 5), data, { id: sp + '-x' + i, shinyRate: 0 }));
	const runs = Array.from({ length: 24 }, (_, k) => explore('balance-' + k, dungeonById('whisper-woods'), party, data, 6000));
	const cleared = runs.filter((r) => r.over && r.over.won).length, fallen = runs.reduce((a, r) => a + r.fallen, 0) / runs.length, wiped = runs.filter((r) => r.over && !r.over.won && r.fallen === 3).length;
	A(cleared >= 20 && fallen <= 0.6 && wiped <= 2, `Whisper Woods, played 24 times by the auto-explorer with three Lv 5 starters: cleared ${cleared}, ${fallen.toFixed(2)} figurines lost a run, wiped out ${wiped} times (the first dungeon must not be a meat grinder)`, { cleared, fallen, wiped });
	// ... and the second dungeon, with four at its suggested level (the three starters and a bird, not yet evolved)
	const lv2 = dungeonLevels(dungeonById('pebble-hollow')).suggest;
	const party2 = ['bulbasaur', 'charmander', 'squirtle', 'pidgey'].map((sp, i) => makeFigurine(sp, lv2, makeRng('x' + sp + lv2), data, { id: sp + '-x' + i, shinyRate: 0 }));
	const runs2 = Array.from({ length: 12 }, (_, k) => explore('balance2-' + k, dungeonById('pebble-hollow'), party2, data, 8000));
	const cleared2 = runs2.filter((r) => r.over && r.over.won).length, fallen2 = runs2.reduce((a, r) => a + r.fallen, 0) / runs2.length;
	// ... and the two Lv 5 dungeons, which were where figurines went to die (owner, 2026-11-23: tune them until a careful party usually comes back)
	{
		const sprout = dungeonById('sprout-trial'), three = ['bulbasaur', 'charmander', 'squirtle'].map((sp, i) => makeFigurine(sp, 5, makeRng('x' + sp + 5), data, { id: sp + '-x' + i, shinyRate: 0 }));
		const rs = Array.from({ length: 10 }, (_, k) => explore('explore-sprout-trial-' + k, sprout, three, data, 12000));
		const lost = rs.reduce((a, r) => a + r.fallen, 0) / rs.length, wipes = rs.filter((r) => r.fallen === 3).length;
		A(lost <= 0.8 && wipes <= 1, `Sprout Trial, 10 times with three Lv 5 starters: ${lost.toFixed(2)} figurines lost a run, wiped out ${wipes} times`, { lost, wipes, why: rs.map((r) => r.why) });
		const solo = dungeonById('ancients-descent'), one = [three[0]];
		const ra = Array.from({ length: 10 }, (_, k) => explore('explore-ancients-descent-' + k, solo, one, data, 12000));
		const back = ra.filter((r) => r.fallen === 0).length;
		A(back >= 6, `Ancients' Descent, 10 times with one Lv 5 Bulbasaur: it came back ${back} times (cleared ${ra.filter((r) => r.over && r.over.won).length}, left by an Escape Marble ${ra.filter((r) => r.over && r.over.escaped).length})`, { back, why: ra.map((r) => r.why) });
	}
	// ... and the endless one. It has no last floor, so a careful party goes home ("Give up") once one of them has fallen. Its
	// Monster Houses ran up to 30% a floor, and they, not the depth, ended most runs with the whole party lost.
	{
		const abyss = dungeonById('the-abyss'), lv = 40;
		A([5, 15, 30, 60, 200].every((k) => endlessFloor(k).props.monsterHouseChance <= 8) && endlessFloor(30).props.monsterHouseChance > endlessFloor(3).props.monsterHouseChance, 'The Abyss: Monster Houses grow rarer than one floor in twelve, however deep');
		const four = ['venusaur', 'charizard', 'blastoise', 'pidgeot'].map((sp, i) => makeFigurine(sp, lv, makeRng('x' + sp + lv), data, { id: sp + '-x' + i, shinyRate: 0 }));
		const rs = Array.from({ length: 8 }, (_, k) => explore('explore-the-abyss-' + k, abyss, four, data, 20000));
		const wipes = rs.filter((r) => r.fallen === 4).length, depth = rs.reduce((a, r) => a + r.floor, 0) / rs.length, lost = rs.reduce((a, r) => a + r.fallen, 0) / rs.length;
		A(wipes === 0 && depth >= 10 && lost <= 1.5, `The Abyss, 8 times with four at Lv ${lv}: floor ${depth.toFixed(1)} on average, ${lost.toFixed(2)} figurines lost a run, wiped out ${wipes} times`, { wipes, depth, lost });
	}
	// A RUN REPLAYS ON THE FLOORS IT WAS PLAYED ON. A dungeon's floors are part of what a recorded run goes by, as the rules
	// are: a run saved half way down Ancients' Descent when it was 50 floors re-ran its actions on the new 25 and came out
	// somewhere else entirely (with permanent loss, possibly without a figurine). dungeonAt keeps the old ones.
	{
		const old = dungeonAt('ancients-descent', 9), now = dungeonAt('ancients-descent', MM.MM_RULES_REV), oldS = dungeonAt('sprout-trial', 9);
		A(old.floors.length === 50 && old.floors[49].boss.level === 21 && old.floors[30].vis > 0 && now.floors.length === 25 && now === dungeonById('ancients-descent'), 'a run from before rev 10 still has the 50-floor Ancients\' Descent');
		A(oldS.floors.some((f) => f.props.monsterHouseChance > 0) && dungeonAt('sprout-trial', 10).floors.every((f) => !f.props.monsterHouseChance), '... and the Sprout Trial with Monster Houses');
		A(dungeonAt('the-abyss', 11).oldHouses === true && !dungeonAt('the-abyss', 12).oldHouses && MM.floorOf(dungeonAt('the-abyss', 11), 20).props.monsterHouseChance === 20 && MM.floorOf(dungeonAt('the-abyss', 12), 20).props.monsterHouseChance === 6, '... and The Abyss as it was');
		A(dungeonAt('whisper-woods', MM.MM_RULES_REV) === dungeonById('whisper-woods') && dungeonAt('the-abyss', 18) === dungeonById('the-abyss') && dungeonAt('nope', 3) === null, 'a dungeon is itself at today\'s revision (and one that never changed, at any)');
		// EACH DUNGEON'S OWN ITEMS AND TRAPS (rev 15, improvement plan 2026-11-25): one list used to serve every floor of every dungeon
		{
			const J = JSON.stringify, story = DUNGEONS.filter((d) => !d.endless), sig = (d) => J(d.floors.slice(0, -1).map((f) => [f.items, f.traps]));
			A(OWN_LOOT_REV === 15 && MM.MM_RULES_REV >= 15, 'the rules revision is 15 or later');
			A(story.length === 10 && new Set(story.map(sig)).size === 10, 'every one of the ten dungeons has a mix of its own');
			A(story.every((d) => d.floors.every((f) => f.items !== COMMON_ITEMS && f.items.length >= 12 && f.items.every((e) => (ITEMS[e.id] || e.id === 'find') && Number.isInteger(e.w) && e.w > 0) && f.traps.every((e) => TRAPS[e.id] && Number.isInteger(e.w) && e.w > 0))), 'every floor\'s lists are real items and traps with whole weights');
			A(story.every((d) => d.floors.every((f) => f.items.some((e) => e.id === 'apple') && f.items.some((e) => e.id === 'oran') && f.items.some((e) => e.id === 'stars'))), 'food, healing and stars are found everywhere');
			const w = (list, id) => (list.find((e) => e.id === id) || { w: 0 }).w, share = (list, id) => w(list, id) / list.reduce((a, e) => a + e.w, 0);
			const ruins = dungeonById('sunken-ruins').floors[5], hollow = dungeonById('pebble-hollow').floors[2], rift = dungeonById('ember-rift'), woods = dungeonById('whisper-woods').floors[0];
			A(share(ruins.items, 'luminousorb') > 5 * share(COMMON_ITEMS, 'luminousorb') && share(hollow.items, 'gravelrock') > 2 * share(COMMON_ITEMS, 'gravelrock') && share(rift.floors[4].items, 'rawst') > 3 * share(COMMON_ITEMS, 'rawst'),
				'the dark Sunken Ruins hold Luminous Marbles, Pebble Hollow Gravel Chips, Ember Rift Rawst Beads', [share(ruins.items, 'luminousorb'), share(hollow.items, 'gravelrock'), share(rift.floors[4].items, 'rawst')]);
			A(!w(woods.traps, 'warp') && w(woods.traps, 'chestnut') === 8 && !w(rift.floors[0].traps, 'selfdestruct') && w(rift.floors[5].traps, 'selfdestruct') === 3 && !w(rift.floors[5].traps, 'explosion') && w(rift.floors[9].traps, 'explosion') >= 1 && !w(rift.floors[5].traps, 'mud'),
				'traps too: chestnuts and no warps in Whisper Woods; Ember Rift\'s blasts wait until it is under way, and it has no mud', [woods.traps, rift.floors[0].traps.map((e) => e.id).join()]);
			A(story.every((d) => !d.floors[0].traps.some((e) => ['explosion', 'selfdestruct', 'pokemon', 'pitfall'].includes(e.id))), 'no dungeon opens with a blast, a Pokémon Trap or a pitfall on its first floor');
			// a run recorded before rev 15 is re-run on the floors it was played on: the shared lists
			const oldW = dungeonAt('whisper-woods', 14), oldR = dungeonAt('ember-rift', 13);
			A(oldW !== dungeonById('whisper-woods') && oldW.floors.every((f) => f.items === COMMON_ITEMS && [EASY_TRAPS, MID_TRAPS, HARD_TRAPS].includes(f.traps)) && oldR.floors.every((f) => f.items === COMMON_ITEMS), 'before rev 15: the shared lists, as those runs had them');
			A(J(oldW.floors.map((f) => [f.props, f.wild])) === J(dungeonById('whisper-woods').floors.map((f) => [f.props, f.wild])), 'and nothing else about those floors differs');
			A(dungeonAt('sprout-trial', 9).floors.some((f) => f.props.monsterHouseChance > 0) && dungeonAt('sprout-trial', 12).floors.every((f) => !f.props.monsterHouseChance && f.items === COMMON_ITEMS) && dungeonAt('ancients-descent', 12).floors.length === 25, 'the older changes still stand under it (Sprout Trial at 9 and at 12)');
			const one = makeFigurine('bulbasaur', 12, makeRng('own'), data, { id: 'own', shinyRate: 0 });
			const run = (rev) => mmNewRun({ seed: 'ownloot', dungeon: 'pebble-hollow', party: [one], bag: [], stars: 0, rev }, data);
			const a = run(14), b = run(15), a2 = run(14);
			A(J(a.items) === J(a2.items) && J(a.traps) === J(a2.traps) && a.items.length > 0, 'the same old recipe makes the same floor twice');
			A(a.dungeon.floors[0].items === COMMON_ITEMS && b.dungeon.floors[0].items !== COMMON_ITEMS && b.rev === 15 && a.rev === 14, 'a recipe is re-run with the lists of its own revision');
			const iw = dungeonById('iw-charcoal-1');
			A(iw && dungeonAt('iw-charcoal-1', 18) === iw && dungeonAt('iw-charcoal-1', 14).floors.every((f) => f.items === COMMON_ITEMS) && dungeonAt('iw-charcoal-1', 17).floors.every((f) => f.items === COMMON_ITEMS), 'an item\'s world kept the shared lists up to rules 17 (rules 18: the new items join them)');
		}
		const one = makeFigurine('bulbasaur', 5, makeRng('lv'), data, { id: 'lv', shinyRate: 0 });
		const rec = (rev) => mmNewRun({ seed: 'legacy', dungeon: 'ancients-descent', party: [one], bag: [], stars: 0, rev }, data);
		A(MM.lastFloor(rec(9).dungeon) === 50 && MM.lastFloor(rec(MM.MM_RULES_REV).dungeon) === 25, 'a recipe is re-run in the dungeon of its own revision');
	}
	// a move learned inside a run can be USED (MM_RULES_REV 10): it fills an empty slot at once, with its PP. A figurine that
	// came in at Lv 5 with two moves "learned" the rest of its kind's and could never use one: 50 floors on Tackle.
	{
		const learn = (rev) => {
			const S = MM.newRun('learn', { dungeon: dungeonById('sprout-trial'), party: [makeFigurine('bulbasaur', 30, makeRng('b'), data, { id: 'b', shinyRate: 0 })], ...(rev ? { rev } : {}) }, data);
			const L = MM.leaderOf(S), had = L.fig.equipped.slice();
			for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1);
			const w = MM.addWild(S, 'chansey', 40, L.x + 1, L.y, data) || S.units[S.units.length - 1];
			w.hp = 1; w.x = L.x + 1; w.y = L.y; w.nap = false;
			MM.act(S, { t: 'face', d: [0, 1, 2, 3, 4, 5, 6, 7].find((d) => MM.unitAt(S, L.x + [0, 1, 1, 1, 0, -1, -1, -1][d], L.y + [-1, -1, 0, 1, 1, 1, 0, -1][d]) === w) ?? 2 }, data);
			for (let i = 0; i < 6 && w.hp > 0; i++) MM.act(S, { t: 'attack' }, data);
			return { L, had, level: L.level, eq: L.fig.equipped, pool: L.fig.pool.map((m) => m.id) };
		};
		const now = learn(), old = learn(9);
		const added = now.eq.filter((id) => !now.had.includes(id));
		A(now.had.length < 4 && now.level > 5 && added.length > 0 && now.eq.length <= 4 && added.every((id) => now.L.pp[id] > 0 && now.pool.includes(id)), `a Lv 5 Bulbasaur (${now.had.join(', ')}) that grows to Lv ${now.level} in a run can use what it learns (${added.join(', ')}), up to four moves`, now.eq);
		A(old.level > 5 && old.eq.join() === old.had.join() && old.pool.length > old.had.length, 'a run recorded under rev 9 replays as it was played (learned, never usable)', old.eq);
	}
	A(cleared2 >= 10 && fallen2 <= 0.8, `Pebble Hollow, 12 times with four at Lv ${lv2}: cleared ${cleared2}, ${fallen2.toFixed(2)} figurines lost a run`, { cleared2, fallen2, why: runs2.map((r) => r.why) });
	A(runs.every((r) => r.over) && JSON.stringify(explore('balance-0', dungeonById('whisper-woods'), party, data, 6000)) === JSON.stringify(runs[0]), 'every one of those runs ends, and the explorer plays the same run from the same seed');
}

// ================================================================ the endless dungeon
{
	const d = dungeonById('the-abyss');
	A(MM.lastFloor(d) === Infinity && MM.lastFloor(dungeonById('whisper-woods')) === 5, 'the endless dungeon has no last floor');
	const f1 = endlessFloor(1), f13 = endlessFloor(13), f60 = endlessFloor(60);
	A(JSON.stringify(endlessFloor(13)) === JSON.stringify(f13) && f13.wild[0].level > f1.wild[0].level && f60.wild[0].level > f13.wild[0].level && f60.props.monsterHouseChance > f1.props.monsterHouseChance && f60.props.trapDensity > f1.props.trapDensity && !f1.boss, 'floor n is made from n alone: levels, traps and Monster Houses rise without end', [f1.wild[0].level, f13.wild[0].level, f60.wild[0].level]);
	A(new Set(Array.from({ length: 12 }, (_, i) => endlessFloor(i + 1).props.layout)).size >= 10 && endlessFloor(999).wild.every((w) => w.level === 999 && data.species[w.species]), 'it turns through the layouts, and its levels stop at 999');
	const S = MM.newRun('abyss', { dungeon: d, party: [fig('pikachu', 200, ['thunderbolt'])] }, data);
	let floors = [S.F.terrain.join()];
	for (let n = 1; n <= 3; n++) { for (const u of MM.wildOf(S)) u.hp = 0; const u = L(S); S.units = S.units.filter((x) => x.hp > 0); S.B.units = S.units; u.x = S.F.stairs[0]; u.y = S.F.stairs[1]; act(S, { t: 'stairs' }); floors.push(S.F.terrain.join()); }
	A(S.floorNo === 4 && !S.over && new Set(floors).size === 4 && MM.view(S).floors === 0 && JSON.stringify(MM.floorOf(d, 4)) === JSON.stringify(endlessFloor(4)), 'down and down: the stairs always lead on');
}

// ================================================================ a Lv 5 dungeon
{
	const d = dungeonById('sprout-trial');
	const big = fig('charizard', 60, ['flamethrower', 'fly']);
	const S = MM.newRun('lv5', { dungeon: d, party: [big, fig('pikachu', 40), fig('machamp', 50), fig('eevee', 20)], bag: [{ id: 'apple' }, { id: 'oran' }], stars: 500 }, data);
	const u = L(S);
	A(MM.partyOf(S).length === 3 && MM.partyOf(S).every((p) => p.level === 5) && u.species === 'charizard' && u.fig.id === big.id && u.maxHP < 40 && !u.fig.equipped.includes('flamethrower') && u.fig.equipped.length >= 1 && u.fig.equipped.length <= 4 && u.fig.exp === expForLevel(5), 'everyone goes in as a Lv 5 copy of itself, with the moves its kind knows by then (3 may enter)', [u.level, u.maxHP, u.fig.equipped]);
	A(S.bag.length === 0 && S.stars === 0 && S.stars0 === 0, 'with an empty bag and no stars, whatever was packed');
	const copy = MM.atLevel(big, 5, data);
	A(copy.id === big.id && copy.species === 'charizard' && copy.level === 5 && big.level === 60 && big.equipped.includes('flamethrower'), 'the figurine itself is untouched');
}

// ================================================================ EXP and levelling inside a run
function arena(party, seed = 'arena', more = {}) {
	const S = MM.newRun(seed, { dungeon: { id: 'test', name: 'Test Cave', party: 4, reward: { first: 100, again: 20 }, floors: [{ props: DUNGEONS[0].floors[0].props, water: false, vis: 0, wild: [], items: [], traps: [] }, { props: DUNGEONS[0].floors[0].props, water: false, vis: 0, wild: [], items: [], traps: [] }] }, party, ...more }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	act(S, { t: 'face', d: 2 });
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const prey = (S, lv = 40, x = 21, sp = 'machop') => Object.assign(MM.addWild(S, sp, lv, x, 15, data), { nap: true, stone: true, hp: 1 });   // (asleep like a stone: it does not stir when someone stands beside it)
{
	const S = arena([fig('pikachu', 5, ['tackle']), fig('rattata', 5), fig('squirtle', 30)]);
	const a = L(S), b = S.units[1], c = S.units[2], hp0 = a.maxHP, atk0 = a.stats.atk, lv0 = c.level;
	b.tactic = 'wait'; c.tactic = 'wait';
	prey(S);
	let ev = [];
	for (let k = 0; k < 8 && !of(ev, 'ko').length; k++) ev = act(S, { t: 'attack' });
	const got = S.exp.p0;
	A(got > 0 && S.exp.p1 === got && S.exp.p2 === got, 'a knockout\'s EXP goes to everyone in the party, in full', S.exp);
	A(of(ev, 'level').some((v) => v.uid === 'p0') && a.level > 5 && a.fig.level === a.level && a.maxHP > hp0 && a.stats.atk > atk0 && a.hp <= a.maxHP && b.level === a.level && c.level >= lv0, 'they level up on the spot: level, stats and HP', [a.level, hp0, a.maxHP]);
	A(a.fig.pool.length >= 2 && of(ev, 'level').find((v) => v.uid === 'p0').moves.every((m) => a.fig.pool.some((p) => p.id === m)), 'and new moves join the pool');
	const h = MM.hashOf(S), T = MM.fromSnapshot(JSON.parse(JSON.stringify(MM.toSnapshot(S))), data);
	A(MM.hashOf(T) === h && L(T).level === a.level && T.exp.p0 === got, 'levels and EXP survive a snapshot');
}

// ================================================================ what a run pays
{
	const mk = () => [fig('pikachu', 20, ['tackle']), fig('rattata', 20)];
	const d = (S) => S.dungeon;
	// cleared
	const S = arena(mk(), 'win', { bag: [{ id: 'apple' }], stars: 30 });
	S.units[1].tactic = 'wait';
	prey(S, 300);
	for (let k = 0; k < 8 && MM.wildOf(S).length; k++) act(S, { t: 'attack' });
	S.bag.push({ id: 'ironthorn', n: 3 }, { id: 'oran', unpaid: 30 }, { id: 'sitrus', sticky: true });
	S.stars += 45;
	S.recruits.push({ uid: 'w9', fig: makeFigurine('machop', 12, makeRng('r'), data, { id: 'w9', shinyRate: 0 }), floor: 1 });
	S.floorNo = 2; L(S).x = S.F.stairs[0]; L(S).y = S.F.stairs[1];
	act(S, { t: 'stairs' });
	const out = mmOutcome(S), figs = mk(), c0 = col(figs);
	A(S.over.won && out.kept && out.won && out.stars === 75 && out.carried === 30 && out.items.join() === 'apple,ironthorn,ironthorn,ironthorn,sitrus' && out.recruits.length === 1 && out.exp[figs[0].id] > 0 && out.exp[figs[1].id] === out.exp[figs[0].id] && out.kills === 1 && out.floor === 2, 'a cleared run: the purse, the bag (a handful as its pieces, nothing unpaid), the recruits and each survivor\'s EXP', out);
	const r1 = applyMmRewards(c0, out, d(S), data, 'Ab-12');
	const p = r1.col.figs[figs[0].id];
	A(p.level > 20 && p.exp === figs[0].exp + out.exp[figs[0].id] && r1.report.units.length === 2 && r1.report.units[0].to === p.level && c0.figs[figs[0].id].level === 20, 'the figurines get their EXP (and the levels it brings)', [p.level, r1.report.units.map((u) => [u.from, u.to])]);
	const rec = Object.values(r1.col.figs).find((f) => f.species === 'machop');
	A(rec && /^machop-mm-ab12/.test(rec.id) && rec.level === 12 && r1.report.recruits.length === 1 && Object.keys(r1.col.figs).length === 3, 'a recruit becomes a real figurine with an id of its own', rec && rec.id);
	A(JSON.stringify(mmStoreCount(r1.col)) === JSON.stringify({ apple: 1, ironthorn: 3, sitrus: 1 }) && r1.report.stored === 5 && r1.report.dropped === 0, 'what was carried out goes into the storage', mmStoreCount(r1.col));
	A(r1.report.stars === 75 + 100 && r1.report.prize === 100 && r1.report.first && r1.col.mm.clear.test === 1 && r1.col.mm.best.test === 2 && r1.report.record, 'the stars: the purse and the first-clear prize; the dungeon is marked cleared, the floor a record');
	const r2 = applyMmRewards(r1.col, out, d(S), data, 'cd');
	A(r2.report.prize === 20 && !r2.report.first && r2.col.mm.clear.test === 2 && !r2.report.record && clearPrize(d(S), 0) === 100 && clearPrize(d(S), 3) === 20, 'a second clear pays the smaller prize');
	A(sameFigs(cleanFigs(r1.col), r1.col) && cleanFigs(JSON.parse(JSON.stringify(r1.col))).mm.clear.test === 1, 'the collection keeps all of it through cleaning (what the server stores)');
	// the storage is full at 200
	let fullCol = c0;
	for (let i = 0; i < 198; i++) fullCol = mmStoreAdd(fullCol, 'apple', 'f' + i.toString(36).padStart(3, '0'));
	const r3 = applyMmRewards(fullCol, out, d(S), data, 'zz');
	A(mmStoreSize(fullCol) === 198 && mmStoreSize(r3.col) === MM_STORE_MAX && r3.report.stored === 2 && r3.report.dropped === 3, 'the storage holds 200: what does not fit is left behind, and said', [r3.report.stored, r3.report.dropped]);
	// escaped
	const E = arena(mk(), 'esc', { bag: [{ id: 'escapeorb' }, { id: 'apple' }], stars: 10 });
	act(E, { t: 'use', slot: 0 });
	const eo = mmOutcome(E), er = applyMmRewards(c0, eo, d(E), data, 'e');
	A(eo.kept && eo.escaped && !eo.won && eo.items.join() === 'apple' && er.report.stars === 10 && er.report.prize === 0 && !er.col.mm.clear.test && er.col.mm.best.test === 1, 'escaped: everything is kept, but the dungeon is not cleared');
	// gave up
	const Q = arena(mk(), 'quit', { bag: [{ id: 'apple' }], stars: 50 });
	Q.units[1].tactic = 'wait';
	prey(Q, 300);
	for (let k = 0; k < 8 && MM.wildOf(Q).length; k++) act(Q, { t: 'attack' });
	Q.recruits.push({ uid: 'w9', fig: makeFigurine('machop', 12, makeRng('r'), data, { id: 'w9', shinyRate: 0 }), floor: 1 });
	act(Q, { t: 'quit' });
	const qo = mmOutcome(Q), qr = applyMmRewards(c0, qo, d(Q), data, 'q');
	A(!qo.kept && qo.quit && qo.stars === 0 && !qo.items.length && !qo.recruits.length && qo.exp[figs[0].id] > 0 && qr.report.stars === 0 && mmStoreSize(qr.col) === 0 && Object.keys(qr.col.figs).length === 2 && qr.col.figs[figs[0].id].level > 20, 'gave up: the stars, the bag and the recruits are lost; the EXP earned is kept', qo);
	// the party fell
	const F = arena(mk(), 'fell', { bag: [{ id: 'apple' }], stars: 50 });
	for (const u of MM.partyOf(F)) MM.hurt(F, u, 99999, 'test');
	const fo = mmOutcome(F), fr = applyMmRewards(c0, fo, d(F), data, 'f');
	A(F.over && !F.over.won && !fo.kept && fo.fallen.length === 2 && fo.stars === 0 && !Object.keys(fo.exp).length && fr.report.stars === 0 && !fr.report.units.length, 'the party fell: nothing comes back (the fallen were buried when they fell)', fo);
	// a Lv 5 dungeon pays its EXP to the real figurine
	const big = fig('charizard', 60, ['flamethrower']);
	const V = MM.newRun('lv5pay', { dungeon: { ...dungeonById('sprout-trial'), floors: dungeonById('sprout-trial').floors.slice(0, 2).map((f) => ({ ...f, wild: [], boss: undefined })) }, party: [big] }, data);
	prey(V, 40, L(V).x + 1); const pv = MM.wildOf(V)[0]; pv.y = L(V).y; act(V, { t: 'face', d: 2 });
	for (let y = L(V).y - 1; y <= L(V).y + 1; y++) for (let x = L(V).x - 1; x <= L(V).x + 2; x++) V.F.terrain[y * W + x] = T_FLOOR;
	V.B.map = { w: W, h: H, height: V.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	for (let k = 0; k < 10 && MM.wildOf(V).length; k++) act(V, { t: 'attack' });
	act(V, { t: 'quit' });
	const vo = mmOutcome(V), vr = applyMmRewards(col([big]), vo, V.dungeon, data, 'v');
	A(L(V) && L(V).level > 5 && vo.exp[big.id] > 0 && vr.col.figs[big.id].exp === big.exp + vo.exp[big.id] && vr.col.figs[big.id].level >= 60 && vr.col.figs[big.id].equipped.includes('flamethrower'), 'a Lv 5 dungeon: it grew from 5 inside, and the EXP goes to the real figurine at its own level', [L(V).level, vr.col.figs[big.id].level]);
}

// ================================================================ the collection's maze record
{
	const junk = cleanMm({ clear: { 'whisper-woods': 3, 'BAD ID': 2, x: -1, y: 1.5 }, best: { 'the-abyss': 47 }, store: { 'apple-ab12': 'apple', 'apple-zz': 'apple', 'stars-ab12': 'stars', 'oran-ab12': 'apple', 'nope-ab12': 'nope' } });
	A(JSON.stringify(junk) === JSON.stringify({ clear: { 'whisper-woods': 3 }, best: { 'the-abyss': 47 }, store: { 'apple-ab12': 'apple' } }), 'cleaning keeps only real counts, floors and stored items (no stars, no mismatched ids)', junk);
	A(JSON.stringify(cleanMm(null)) === JSON.stringify({ clear: {}, best: {}, store: {} }) && !('mm' in cleanFigs({ v: 1, figs: {} })), 'none: nothing is written');
	let c = { v: 1, figs: {} };
	c = mmStoreAdd(c, 'apple', 'a001'); c = mmStoreAdd(c, 'apple', 'a002'); c = mmStoreAdd(c, 'oran', 'o001');
	A(JSON.stringify(mmStoreCount(c)) === JSON.stringify({ apple: 2, oran: 1 }) && mmStoreAdd(c, 'stars', 's001') === c && mmStoreAdd(c, 'nope', 'n001') === c && mmStoreAdd(c, 'apple', 'a001') === c, 'storing: one entry an item; not stars, not an unknown thing, not the same one twice');
	const t = mmStoreTake(c, 'apple');
	A(mmStoreCount(t).apple === 1 && mmStoreTake(t, 'sitrus') === null && !sameFigs(c, t), 'taking one out; the change is seen by the sync');
	// two devices
	const base = { ...c, mm: { ...cleanMm(c.mm), clear: { 'whisper-woods': 1 }, best: { 'whisper-woods': 5 } } };
	const mine = mmStoreAdd(mmStoreTake(base, 'oran'), 'sitrus', 'm001');   // (this device took the Oran into a dungeon, and brought a Sitrus out)
	mine.mm.clear['whisper-woods'] = 2; mine.mm.best['pebble-hollow'] = 4;
	const theirs = mmStoreAdd(base, 'elixir', 't001');
	theirs.mm.clear['pebble-hollow'] = 1; theirs.mm.best['whisper-woods'] = 5;
	const m = merge3Figs(base, mine, theirs).mm;
	A(JSON.stringify(mmStoreCount({ mm: m })) === JSON.stringify({ apple: 2, sitrus: 1, elixir: 1 }) && m.clear['whisper-woods'] === 2 && m.clear['pebble-hollow'] === 1 && m.best['pebble-hollow'] === 4 && m.best['whisper-woods'] === 5, 'two devices joined: an item used on one stays used, what each brought back is kept, the higher records win', m);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
