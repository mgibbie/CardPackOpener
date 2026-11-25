// poketactica_itemworld_test.mjs — the ITEM WORLD's rules (owner, 2026-11-24; Plans/POKETACTICA_ITEM_WORLD_PLAN.md,
// stage 3): a dive's floors and exits, how strong its foes are, what a floor holds, the dive kept on the device, and
// banking it (the item's level, its new slots, the gemstones and kits found). The page side is
// poketactica_itemworld_page_test.mjs.
// Pure: node only.   node overworld/tests/poketactica_itemworld_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXIT_EVERY, IW_STYLES, exitFloor, canDive, diveFloors, itemFoeLevel, itemFloorStars, itemFloor, IW_MAX_FOES, worldOf, worldSay, iwRecords, findsOf, cleanDive, newDive, loadDive, saveDive, afterFloor, bankDive } from '../../poketactica/js/itemworld.js';
import { HELD } from '../../poketactica/js/goods.js';
import { parseGem, slotsAt } from '../../poketactica/js/gear.js';
import { newFigs, addGood, addGem, setItemLevel, itemGear, gemList, goodsCount, takeItem, cleanFigs } from '../../poketactica/js/figcol.js';
import { floorStars, isBossFloor, genFloor } from '../../poketactica/js/dungeon.js';
import { campaignSetup } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { DUNGEONS, dungeonById, dungeonAt, itemDungeon, itemDungeonId, dungeonLevels } from '../../poketactica/js/mm/dungeons.js';
import { applyMmRewards } from '../../poketactica/js/mm/rewards.js';
import * as MM from '../../poketactica/js/mm/turn.js';
import { mmRecipe, validMmRecipe, mmNewRun, mmFig } from '../../poketactica/js/mm/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const ops = { levelTo: setItemLevel, addGem, addGood };
let n = 0; const tail = () => 't' + String(++n).padStart(5, '0');

// ---------- a dive's floors
{
	A(EXIT_EVERY === 10 && IW_STYLES.join() === 'tactics,maze', 'an exit every ten floors; two ways to play a dive');
	A([1, 5, 9, 10, 11, 19, 20, 55, 90, 99].map(exitFloor).join() === '10,10,10,20,20,20,30,60,100,100' && exitFloor(100) === 0, 'a dive ends on the next exit floor: 10, 20 ... 100; a level 100 item has none');
	A(canDive(1) && canDive(99) && !canDive(100), 'an item can be dived into until it is level 100');
	A(diveFloors(1).join() === '2,3,4,5,6,7,8,9,10' && diveFloors(10).join() === '11,12,13,14,15,16,17,18,19,20' && diveFloors(97).join() === '98,99,100' && diveFloors(100).length === 0, 'the floors are numbered by the level they bring: level 1 dives floors 2 to 10');
	A(isBossFloor(10) && isBossFloor(100) && !isBossFloor(9), 'the exit floor is a boss floor');
}

// ---------- how strong the foes are
{
	const cheap = 'oranberry', dear = 'choiceband';
	A(HELD[cheap].stars < HELD[dear].stars, 'a bead costs less than a Choice Ribbon');
	A(itemFoeLevel(2, cheap) < itemFoeLevel(2, dear) && itemFoeLevel(100, cheap) < itemFoeLevel(100, dear), 'a costlier item is a harder world');
	A(itemFoeLevel(2, cheap) >= 5 && itemFoeLevel(2, cheap) <= 12 && itemFoeLevel(100, cheap) > 100 && itemFoeLevel(100, dear) <= 999, 'from about level 8 on the first floor to well past 100 at the bottom', [itemFoeLevel(2, cheap), itemFoeLevel(100, cheap), itemFoeLevel(100, dear)]);
	let up = true; for (let f = 3; f <= 100; f++) if (itemFoeLevel(f, dear) < itemFoeLevel(f - 1, dear)) up = false;
	A(up && itemFoeLevel(10, dear, true) === itemFoeLevel(10, dear) + 5, 'deeper is never easier; a boss is 5 levels over');
	A(itemFloorStars(10) === Math.ceil(floorStars(10) / 2) && itemFloorStars(7) < floorStars(7), 'a floor pays half the Dungeon\'s stars: the item is the prize');
}

// ---------- a floor as a battle
{
	const m = itemFloor('iwtest', 7, 'charcoal', data), b = itemFloor('iwtest', 10, 'charcoal', data);
	A(m && m.item === 'charcoal' && /Charcoal Stick · floor 7/.test(m.name) && m.foes.length > 0 && m.foes.every((f) => f.lv === itemFoeLevel(7, 'charcoal', !!f.boss)) && !m.reward.fig && m.reward.stars === itemFloorStars(7), 'a floor is a board with foes at the item\'s levels; it pays stars, no figurine', m && [m.name, m.foes.map((f) => f.lv), m.reward]);
	A(b.boss && b.foes.some((f) => f.boss) && /Exit/.test(b.name) && /reaches level 10/.test(b.tip) && /exit on floor 10/.test(m.tip), 'floor 10 is the exit: a boss, and the tip says what clearing it does');
	A(JSON.stringify(itemFloor('iwtest', 7, 'charcoal', data)) === JSON.stringify(m) && JSON.stringify(itemFloor('other', 7, 'charcoal', data)) !== JSON.stringify(m), 'the same dive has the same floor; another dive has another');
	A(itemFloor('iwtest', 7, 'firestone', data) === null, 'only a held item has a world');
	// it is a battle the engine can play
	const team = [makeFigurine('charizard', 60, makeRng('a'), data, { shinyRate: 0 })];
	const S = B.newBattle('iw-battle', { ...campaignSetup(m, team, data, 'iw-battle'), perma: true }, data);
	A(S.units.filter((u) => u.side === 'e').length === m.foes.length && S.units.filter((u) => u.side === 'e').every((u) => u.level === itemFoeLevel(7, 'charcoal', false) || u.level === itemFoeLevel(7, 'charcoal', true)), 'and the engine sets it up: the foes stand at their levels');
}

// ---------- what a floor holds
{
	A(JSON.stringify(findsOf('s1', 7)) === JSON.stringify(findsOf('s1', 7)), 'a floor\'s finds come from the dive\'s seed: the same each time');
	const boss = findsOf('s1', 10);
	A(boss.filter((x) => x.k === 'kit').length === 1 && boss.filter((x) => x.k === 'gem').length === 1 && parseGem(boss.find((x) => x.k === 'gem').gem), 'an exit floor always holds a gemstone and a Stitching Kit', boss);
	A(findsOf('s1', 60).filter((x) => x.k === 'gem').length === 2, 'from floor 50 an exit holds two gemstones');
	let some = 0, none = 0, lvLow = 0, lvHigh = 0, nl = 0, nh = 0; const stats = new Set();
	for (let i = 0; i < 400; i++) {
		const a = findsOf('seed' + i, 5), b = findsOf('seed' + i, 95);
		if (a.length) some++; else none++;
		for (const x of a) if (x.k === 'gem') { const p = parseGem(x.gem); lvLow += p.lv; nl++; stats.add(p.s); }
		for (const x of b) if (x.k === 'gem') { lvHigh += parseGem(x.gem).lv; nh++; }
	}
	A(some > 150 && none > 150, 'a plain floor holds a gemstone about half the time', [some, none]);
	A(stats.size === 6, 'of any of the six stats', [...stats]);
	A(lvLow / nl < 4 && lvHigh / nh > 25 && lvHigh / nh < 45, 'deeper floors hold stronger gemstones: about level 2 near the top, level 30 and more near the bottom', [lvLow / nl, lvHigh / nh]);
	const all = []; for (let f = 2; f <= 100; f++) for (const x of findsOf('whole', f)) all.push(x);
	A(all.every((x) => x.k === 'kit' || (parseGem(x.gem) && parseGem(x.gem).lv <= 100)) && all.filter((x) => x.k === 'kit').length === 10, 'a whole item (floors 2 to 100): every find is sound; ten Stitching Kits', all.length);
}

// ---------- the dive kept on the device
{
	const d = newDive('charcoal-aaaa', 'charcoal', 1, 'tactics', 1700000000000);
	A(d && d.from === 1 && d.floor === 2 && d.style === 'tactics' && d.found.length === 0 && /^iw[a-z0-9]+$/.test(d.seed), 'a new dive starts on the floor after the item\'s level', d);
	A(newDive('charcoal-aaaa', 'charcoal', 100) === null && newDive('x', 'charcoal', 1) === null && newDive('firestone-aaaa', 'firestone', 1) === null && newDive('charcoal-aaaa', 'charcoal', 20, 'maze').style === 'maze', 'no dive into a level 100 item, or into what is no held item');
	A(cleanDive({ ...d, floor: 500 }).floor === 10 && cleanDive({ ...d, floor: -3 }).floor === 2 && cleanDive({ ...d, style: 'swim' }).style === 'tactics' && cleanDive({ ...d, found: [{ k: 'gem', gem: 'atk:5' }, { k: 'junk' }, { k: 'kit' }, null] }).found.length === 2 && cleanDive(null) === null, 'a dive is read defensively: its floor inside the dive, junk finds dropped');
	const mem = {}; const LS = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
	A(loadDive(LS) === null, 'no dive to begin with');
	saveDive(d, LS);
	A(JSON.stringify(loadDive(LS)) === JSON.stringify(d), 'saved, and read back');
	saveDive(null, LS);
	A(loadDive(LS) === null, 'and put away');
	// floor by floor
	let run = d, exits = 0, lastFinds = null;
	for (const f of diveFloors(1)) { const r = afterFloor(run); lastFinds = r.finds; if (r.run) { A(r.run.floor === f + 1 && !r.done, 'floor ' + f + ' cleared: on to floor ' + (f + 1)); run = r.run; } else { exits++; A(f === 10 && r.done.floor === 10 && r.done.found.some((x) => x.k === 'kit'), 'floor 10 cleared: the dive is done, its finds in hand'); run = r.done; } }
	A(exits === 1 && lastFinds.some((x) => x.k === 'kit'), 'one exit a dive');

	// ---------- banking
	let c = addGood(addGood(newFigs(), 'charcoal', 'aaaa'), 'charcoal', 'bbbb');
	const bank = bankDive(c, run, ops, tail);
	const kits = run.found.filter((x) => x.k === 'kit').length, gems = run.found.filter((x) => x.k === 'gem').length;
	A(itemGear(bank.col, 'charcoal-aaaa').lv === 10 && itemGear(bank.col, 'charcoal-bbbb') === null, 'banked: THAT Charcoal Stick is level 10; its twin is untouched');
	A(bank.report.from === 1 && bank.report.to === 10 && bank.report.banked && bank.report.kits === kits && bank.report.gems.length === gems && gemList(bank.col).length === gems && (goodsCount(bank.col).stitchingkit || 0) === kits, 'the finds are in the collection: every gemstone, every kit', bank.report);
	A(bank.report.slotsFrom === 4 && bank.report.slotsTo === 4 && cleanFigs(bank.col).gear['charcoal-aaaa'].lv === 10, 'the report says the slots before and after; the collection is sound');
	// the dive that crosses level 25 opens a slot
	const c20 = setItemLevel(c, 'charcoal-aaaa', 20), d20 = newDive('charcoal-aaaa', 'charcoal', 20);
	let r20 = d20; for (;;) { const r = afterFloor(r20); if (r.run) r20 = r.run; else { r20 = r.done; break; } }
	const b30 = bankDive(c20, r20, ops, tail);
	A(itemGear(b30.col, 'charcoal-aaaa').lv === 30 && b30.report.slotsFrom === 4 && b30.report.slotsTo === 5 && slotsAt(30) === 5, 'a dive from level 20 banks level 30, and with it a fifth slot');
	// a dive never lowers an item, and never passes 100
	const hi = setItemLevel(c, 'charcoal-aaaa', 37);
	A(itemGear(bankDive(hi, run, ops, tail).col, 'charcoal-aaaa').lv === 37, 'an old dive banked late never lowers the item');
	const d97 = newDive('charcoal-aaaa', 'charcoal', 97); let r97 = d97; for (;;) { const r = afterFloor(r97); if (r.run) r97 = r.run; else { r97 = r.done; break; } }
	A(itemGear(bankDive(setItemLevel(c, 'charcoal-aaaa', 97), r97, ops, tail).col, 'charcoal-aaaa').lv === 100 && newDive('charcoal-aaaa', 'charcoal', 100) === null, 'the last dive reaches level 100, and there is no dive after it');
	// the item gone from the bag meanwhile: the finds still come out, no level is given to anything else
	const gone = takeItem(c, 'charcoal-aaaa').col, bg = bankDive(gone, run, ops, tail);
	A(!bg.report.banked && bg.report.gems.length === gems && itemGear(bg.col, 'charcoal-bbbb') === null && !bg.col.gear, 'the item no longer in the bag: the finds come out, and no other item is levelled');
	A(setItemLevel(c, 'charcoal-aaaa', 500).gear['charcoal-aaaa'].lv === 100 && setItemLevel(c, 'nope-0000', 5) === c && !setItemLevel(setItemLevel(c, 'charcoal-aaaa', 30), 'charcoal-aaaa', 1).gear, 'an item\'s level is set between 1 and 100; level 1 with no gemstones is a plain item again');
}

// ---------- the Item World as a Mystery Maze (stage 4): a dive is a dungeon of the dive's floors
{
	const d = itemDungeon('charcoal', 8), e = itemDungeon('charcoal', 10), top = itemDungeon('choiceband', 90);
	A(d && d.id === 'iw-charcoal-8' && itemDungeonId('charcoal', 8) === d.id && d.floors.length === 2 && e.floors.length === 10 && top.floors.length === 10 && itemDungeon('charcoal', 1).floors.length === 9, 'a dive\'s dungeon has the dive\'s floors: 2 from level 8, 10 from level 10, 9 from level 1');
	A(/Charcoal Stick · floors 9 to 10/.test(d.name) && d.iw.id === 'charcoal' && d.iw.from === 8 && d.iw.exit === 10 && d.noRecord && d.reward.first === 0 && d.party === 4, 'named for the item; it pays no prize and keeps no record');
	A(d.floors[0].wild.every((w) => w.level === itemFoeLevel(9, 'charcoal')) && d.floors[1].boss.level === itemFoeLevel(10, 'charcoal', true) && e.floors[9].boss && !e.floors[8].boss, 'the wild Pokémon stand at the item\'s levels; the last floor is the exit, a boss');
	A(top.floors[9].boss.level === itemFoeLevel(100, 'choiceband', true) && top.floors[0].wild[0].level > e.floors[0].wild[0].level, 'a deep dive into a costly item is far harder');
	A(itemDungeon('charcoal', 100) === null && itemDungeon('firestone', 8) === null && itemDungeon('nope', 8) === null && itemDungeon('charcoal', 0) === null, 'no dungeon for a level 100 item, or for what is no held item');
	A(dungeonById('iw-charcoal-8') === d && dungeonAt('iw-charcoal-8', 14) === d && dungeonById('iw-firestone-8') === null && dungeonById('whisper-woods') === DUNGEONS[0] && dungeonById('iw-') === null, 'a run finds it again by its id (and the story dungeons as before)');
	A(new Set([1, 13, 26, 38, 51, 63, 76, 88].map((lv) => itemDungeon('charcoal', lv).theme)).size >= 6, 'the deeper the item, the later the story dungeon its floors borrow from', [1, 13, 26, 38, 51, 63, 76, 88].map((lv) => itemDungeon('charcoal', lv).theme));
	A(dungeonLevels(d) && JSON.stringify(itemDungeon('charcoal', 8)) === JSON.stringify(d), 'it reads as any dungeon does, and is the same each time');
	// a run in it: the engine opens it, and its recipe is sound
	const party = [mmFig(makeFigurine('charizard', 60, makeRng('p'), data, { shinyRate: 0 }))];
	const S = MM.newRun('iw-mm', { dungeon: d, party, bag: [], stars: 0 }, data);
	const rec = mmRecipe({ seed: 'iw-mm', dungeonId: d.id, party, acts: [], S });
	A(S.floorNo === 1 && S.dungeon.id === d.id && validMmRecipe(rec) && /Charcoal Stick/.test(rec.label) && mmNewRun(rec, data).dungeon.id === d.id, 'a run opens in it, and its recipe (a resume, a replay) is sound', rec.label);
	// the rewards keep no record for it
	const out = { won: true, floor: 2, stars: 7, items: [], recruits: [], exp: {}, moveXp: {}, kept: true };
	const r = applyMmRewards(newFigs(), out, d, data, 'tt');
	A(!Object.keys(r.col.mm.clear).length && !Object.keys(r.col.mm.best).length && r.report.prize === 0 && !r.report.first && !r.report.record && r.report.stars === 7, 'clearing it marks no dungeon record and pays no prize (the stars picked up are kept)', r.report);
	const r2 = applyMmRewards(newFigs(), out, DUNGEONS[0], data, 'tt');
	A(r2.col.mm.clear[DUNGEONS[0].id] === 1 && r2.report.first && r2.report.prize > 0, 'a story dungeon still does');
}

// ---------- records: read from what the collection holds (improvement plan item 13)
{
	const none = iwRecords({ v: 1, figs: {} });
	A(none.items === 0 && none.best === null && none.levels === 0 && none.gem === null && none.gems === 0, 'a collection with no held items has no records');
	const mk = (id, more) => ({ v: 1, id, species: 'eevee', level: 5, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'], ...more });
	const col = { v: 1, figs: { a: mk('fig-rec1', { held: 'charcoal', gear: { lv: 100, gems: ['atk:40', 'spe:7'] } }), b: mk('fig-rec2', { held: 'oranberry' }), c: mk('fig-rec3') },
		items: { 'leftovers-rrrr1': 'leftovers', 'magnet-rrrr2': 'magnet', 'firestone-rrrr3': 'firestone' }, gear: { 'leftovers-rrrr1': { lv: 31, gems: ['hp:55'] } }, gems: { 'gem-rrrr1': 'def:12', 'gem-rrrr2': 'nope:9' } };
	const r = iwRecords(col);
	A(r.items === 4 && r.best.id === 'charcoal' && r.best.lv === 100 && r.levels === 99 + 30 && r.top === 1 && r.slots8 === 1, 'the highest item, the levels raised in all (on figurines and in the bag), how many are at the top', r);
	A(r.gem.s === 'hp' && r.gem.lv === 55 && r.gems === 4, 'the strongest gemstone, loose or in a slot (an evolution item and a forged gemstone do not count)', r);
	A(iwRecords({ v: 1, figs: {}, items: { 'charcoal-rrrr9': 'charcoal' } }).levels === 0 && iwRecords({ v: 1, figs: {}, items: { 'charcoal-rrrr9': 'charcoal' } }).best.lv === 1, 'a plain item counts as level 1: no levels raised');
}

// ---------- measured (tools/poketactica/iw_auto.mjs, 2026-11-25): a floor holds no more foes than a team has figurines
{
	const genFloorOf = (fl) => genFloor('capseed', fl, data);
	const many = [35, 40, 67, 90, 100].map((fl) => ({ fl, d: genFloorOf(fl), i: itemFloor('capseed', fl, 'charcoal', data) }));
	A(IW_MAX_FOES === 6 && many.every((m) => m.d.foes.length === 8 && m.i.foes.length === 6), 'the Dungeon has 8 foes from floor 30; an item\'s world stops at 6', many.map((m) => [m.fl, m.d.foes.length, m.i.foes.length]));
	A(many.filter((m) => isBossFloor(m.fl)).every((m) => m.i.foes.filter((f) => f.boss).length === 1), 'the exit floor keeps its boss');
	A(many.every((m) => m.i.foes.every((f) => m.d.foes.some((g) => g.x === f.x && g.y === f.y && !!g.boss === !!f.boss))), 'the six stand where the Dungeon\'s stood (the boss where the boss was)');
	// EACH ITEM'S WORLD IS ITS OWN (owner, 2026-11-24: "worlds that differ first")
	{
		const types = (sp) => data.species[sp].types || [], J2 = JSON.stringify;
		const floors = [3, 8, 10, 24, 40, 77, 100];
		A(worldOf('charcoal').kind === 'type' && worldOf('charcoal').type === 'Fire' && worldOf('charcoal').theme === 'volcano' && worldOf('mysticwater').theme === 'islands' && worldOf('oranberry').kind === 'gentle' && worldOf('lumberry').kind === 'gentle' && worldOf('leppaberry').kind === 'gentle' && worldOf('choicescarf').kind === 'fast' && worldOf('leftovers').kind === 'plain' && worldOf('nope').kind === 'plain', 'an item\'s kind of world: a type booster its type, a bead gentle, a Choice item fast, the rest plain');
		// a type booster: that type, on that type's ground
		const fire = floors.map((fl) => ({ fl, i: itemFloor('worlds', fl, 'charcoal', data), d: genFloor('worlds', fl, data) }));
		A(fire.every((m) => m.i.foes.every((f) => types(f.sp).includes('Fire'))), 'a Charcoal Stick\'s world: every foe on every floor is a Fire type', fire.map((m) => m.i.foes.map((f) => f.sp).join('/')).slice(0, 3));
		A(fire.every((m) => m.i.theme === 'volcano' && m.i.ground.join('').replace(/[.l]/g, '') === '' && J2(m.i.ground.map((r) => r.replace(/[^.]/g, 'x'))) === J2(m.d.ground.map((r) => r.replace(/[^.]/g, 'x')))), '... on lava: the Dungeon\'s own patches of ground, as lava, in the volcano\'s look');
		A(fire.every((m) => J2(m.i.rows) === J2(m.d.rows) && J2(m.i.base) === J2(m.d.base) && J2(m.i.symbols) === J2(m.d.symbols)), 'the layout, the base and the Geo symbols are the Dungeon\'s, untouched');
		A(J2(itemFloor('worlds', 24, 'charcoal', data).foes) === J2(itemFloor('worlds', 24, 'charcoal', data).foes) && J2(itemFloor('worlds', 24, 'charcoal', data).foes.map((f) => f.sp)) !== J2(itemFloor('other', 24, 'charcoal', data).foes.map((f) => f.sp)), 'the same dive meets the same Pokémon; another dive, others');
		const water = itemFloor('worlds', 40, 'mysticwater', data), bug = itemFloor('worlds', 40, 'silverpowder', data);
		A(water.foes.every((f) => types(f.sp).includes('Water')) && water.theme === 'islands' && bug.foes.every((f) => types(f.sp).includes('Bug')) && bug.theme === 'forest', 'a Mystic Droplet: Water types on the islands; Silver Glitter: Bug types in the forest');
		A(Object.keys(HELD).filter((id) => worldOf(id).kind === 'type').length === 17 && Object.keys(HELD).filter((id) => worldOf(id).kind === 'type').every((id) => { const w = worldOf(id), fl = itemFloor('alltypes', 30, id, data); return w.theme && fl.theme === w.theme && fl.foes.every((f) => types(f.sp).includes(w.type)); }), 'all seventeen type boosters have a world of their type');
		// a bead: one foe fewer, never fewer than two
		const gentle = floors.map((fl) => ({ fl, n: itemFloor('worlds', fl, 'oranberry', data).foes.length, plain: itemFloor('worlds', fl, 'leftovers', data).foes.length, boss: itemFloor('worlds', fl, 'oranberry', data).foes.filter((f) => f.boss).length }));
		A(gentle.every((g) => g.n === Math.max(2, g.plain - 1) || (g.plain <= 2 && g.n === g.plain)) && gentle.some((g) => g.n < g.plain) && gentle.filter((g) => isBossFloor(g.fl)).every((g) => g.boss === 1), 'an Oran Bead\'s world is gentle: one foe fewer on a floor (the boss stays)', gentle);
		// a Choice item: nobody waits
		const fast = floors.map((fl) => itemFloor('worlds', fl, 'choiceband', data)), plainAi = floors.map((fl) => itemFloor('worlds', fl, 'leftovers', data));
		A(fast.every((m) => m.foes.every((f) => f.ai === 'aggro')) && plainAi.some((m) => m.foes.some((f) => f.ai === 'passive')), 'a Choice Ribbon\'s world is fast: every foe comes at once (elsewhere some wait)');
		// the exit's boss holds the item itself, in every world
		A(['charcoal', 'oranberry', 'choiceband', 'leftovers', 'focussash'].every((id) => [10, 40, 100].every((fl) => { const b = itemFloor('worlds', fl, id, data).foes.filter((f) => f.boss); return b.length === 1 && b[0].held === id; })) && itemFloor('worlds', 8, 'leftovers', data).foes.every((f) => !f.held), 'the exit\'s boss holds the item you are levelling; nobody else holds anything');
		A(/Fire types live here/.test(itemFloor('worlds', 8, 'charcoal', data).tip) && /gentle world: fewer foes/.test(itemFloor('worlds', 8, 'oranberry', data).tip) && /Its guardian holds one itself/.test(itemFloor('worlds', 10, 'leftovers', data).tip) && worldSay('leftovers') === 'the Dungeon\'s own Pokémon', 'the floor\'s tip says what kind of world it is');
		// the levels are untouched by all this
		A(fire.every((m) => m.i.foes.every((f) => f.lv === itemFoeLevel(m.fl, 'charcoal', !!f.boss))), 'the foes\' levels are the item\'s, as before');
		// it plays: a battle on a type world starts and its boss really holds the item
		const fl10 = itemFloor('worlds', 10, 'charcoal', data);
		const team10 = [makeFigurine('blastoise', 60, makeRng('w'), data, { id: 'w-1', shinyRate: 0 })];
		const S10 = B.newBattle('worlds10', { ...campaignSetup(fl10, team10, data, 'worlds10'), rev: B.RULES_REV, perma: true }, data);
		const bossU = S10.units.find((u) => u.side === 'e' && u.heldId);
		A(S10.units.filter((u) => u.side === 'e').length === fl10.foes.length && bossU && bossU.heldId === 'charcoal' && S10.units.filter((u) => u.side === 'e' && u.heldId).length === 1, 'in the battle itself the boss holds the Charcoal Stick');
	}
	const few = itemFloor('capseed', 5, 'charcoal', data), fewD = genFloorOf(5);
	A(few.foes.length === fewD.foes.length && few.foes.length < 6, 'a shallow floor is as it was', [few.foes.length, fewD.foes.length]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
