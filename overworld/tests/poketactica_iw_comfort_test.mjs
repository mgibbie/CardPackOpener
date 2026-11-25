// poketactica_iw_comfort_test.mjs — the Item World's comfort features (Plans/POKETACTICA_ITEM_WORLD_IMPROVEMENT_PLAN.md
// items 5, 6, 7 and 9; owner, 2026-11-24: kits "sold for stars, at a high price"):
//   - joining every gemstone of a stat at once (gear.js joinPlan, figcol.js combineAll)
//   - a Stitching Kit costs 500 stars in the shop
//   - a dive into an item a figurine is holding: it comes off for the dive and goes back on after (reholdItem; a dive's `back`)
//   - an item's slots filled, and emptied, in one go (socketAll, unsocketAll)
// Pure: node only.   node overworld/tests/poketactica_iw_comfort_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KIT, goodStars, kindOf } from '../../poketactica/js/goods.js';
import { joinPlan, slotsAt, parseGem } from '../../poketactica/js/gear.js';
import { addFig, addGood, goodsCount, gemList, itemGear, gearView, combineAll, socketAll, unsocketAll, reholdItem, holdItem, unholdItem, setItemLevel, addGem, cleanFigs, takeGood } from '../../poketactica/js/figcol.js';
import { cleanDive, newDive, bankDive, bankPart, clearedFloors, exitFloor } from '../../poketactica/js/itemworld.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json') };
let n = 0;
const tail = () => 't' + String(n++).padStart(5, '0');
const fig = (sp, id) => makeFigurine(sp, 30, makeRng(id), data, { id, shinyRate: 0 });
const base = (gems = {}, kits = 0, more = {}) => { let c = { v: 1, starters: true, figs: {}, ...more, gems }; for (let i = 0; i < kits; i++) c = addGood(c, 'stitchingkit', tail()); return c; };
const lv = (c, stat) => gemList(c).map((g) => parseGem(g.gem)).filter((p) => p.s === stat).map((p) => p.lv).sort((a, b) => b - a);

// ---------- a Stitching Kit in the shop
{
	A(KIT.stitchingkit.stars === 500 && goodStars('stitchingkit') === 500 && kindOf('stitchingkit') === 'kit', 'a Stitching Kit costs 500 stars');
}

// ---------- the plan of a "join all"
{
	const P = (ls, k) => joinPlan(ls, k);
	A(JSON.stringify(P([10, 2])) === '{"joins":1,"top":12,"left":1}', 'two: one join, their levels added');
	A(JSON.stringify(P([1, 1, 1, 1, 1])) === '{"joins":4,"top":5,"left":1}', 'five level 1s: four joins, one level 5');
	A(JSON.stringify(P([60, 50, 30])) === '{"joins":1,"top":90,"left":2}', 'never past 100: the 60 takes the 30 (90); the 50 would lose levels, so it stays', P([60, 50, 30]));
	A(JSON.stringify(P([70, 30, 5])) === '{"joins":1,"top":100,"left":2}' && P([100, 5]).joins === 0 && P([100, 100]).joins === 0, 'a level 100 takes nothing more');
	A(JSON.stringify(P([4, 3, 2, 1], 2)) === '{"joins":2,"top":9,"left":2}' && P([4, 3, 2, 1], 0).joins === 0, 'only as many joins as there are kits (the strongest first)');
	A(P([]).joins === 0 && P([7]).joins === 0 && P([7]).top === 7, 'nothing to join with none or one');
}

// ---------- joining every gemstone of a stat
{
	const c0 = base({ 'gem-aaaa1': 'atk:10', 'gem-aaaa2': 'atk:2', 'gem-aaaa3': 'atk:15', 'gem-aaaa4': 'spe:4', 'gem-aaaa5': 'atk:1' }, 5);
	const r = combineAll(c0, 'atk', tail);
	A(r.joins === 3 && r.top === 'atk:28' && lv(r.col, 'atk').join() === '28' && lv(r.col, 'spe').join() === '4' && goodsCount(r.col).stitchingkit === 2, 'every Plush Ruby joined: 15 + 10 + 2 + 1 = one level 28, three kits used, the Topaz untouched', [lv(r.col, 'atk'), goodsCount(r.col)]);
	A(gemList(c0).length === 5 && goodsCount(c0).stitchingkit === 5, '(the collection handed in is not changed)');
	const few = combineAll(base({ 'gem-aaaa1': 'atk:10', 'gem-aaaa2': 'atk:2', 'gem-aaaa3': 'atk:15', 'gem-aaaa5': 'atk:1' }, 1), 'atk', tail);
	A(few.joins === 1 && lv(few.col, 'atk').join() === '25,2,1' && !goodsCount(few.col).stitchingkit, 'with one kit: one join, the two strongest', lv(few.col, 'atk'));
	const none = combineAll(base({ 'gem-aaaa1': 'atk:10', 'gem-aaaa2': 'atk:2' }, 0), 'atk', tail);
	A(none.joins === 0 && none.top === 'atk:10' && lv(none.col, 'atk').join() === '10,2', 'with no kit: nothing happens');
	const cap = combineAll(base({ 'gem-aaaa1': 'hp:60', 'gem-aaaa2': 'hp:50', 'gem-aaaa3': 'hp:30' }, 9), 'hp', tail);
	A(cap.joins === 1 && lv(cap.col, 'hp').join() === '90,50' && goodsCount(cap.col).stitchingkit === 8, 'no level is thrown away: 60 + 30, and the 50 is left', lv(cap.col, 'hp'));
	A(combineAll(base({ 'gem-aaaa1': 'atk:10' }, 3), 'spe', tail).joins === 0, 'a stat you have none of: nothing');
	A(cleanFigs(r.col) && gemList(cleanFigs(r.col)).length === gemList(r.col).length, 'what it makes reads back clean');
}

// ---------- an item's slots in one go
{
	const items = { 'charcoal-aaaa1': 'charcoal' };
	let c = base({ 'gem-aaaa1': 'atk:10', 'gem-aaaa2': 'atk:2', 'gem-aaaa3': 'atk:15', 'gem-aaaa4': 'spe:4', 'gem-aaaa5': 'hp:1', 'gem-aaaa6': 'def:30', 'gem-aaaa7': 'spd:7' }, 0, { items });
	c = setItemLevel(c, 'charcoal-aaaa1', 31);
	const where = { uid: 'charcoal-aaaa1' };
	A(slotsAt(31) === 5, '(a level 31 item has five slots)');
	const f = socketAll(c, where);
	A(f.n === 5 && itemGear(f.col, 'charcoal-aaaa1').gems.join() === 'def:30,atk:15,atk:10,spd:7,spe:4' && gemList(f.col).map((g) => g.gem).sort().join() === 'atk:2,hp:1', 'Fill: the five strongest loose gemstones go in, strongest first; the two weakest stay loose', itemGear(f.col, 'charcoal-aaaa1'));
	A(socketAll(f.col, where).n === 0 && socketAll(f.col, where).col === f.col, 'full: nothing more');
	const one = socketAll(base({ 'gem-aaaa1': 'atk:10' }, 0, { items }), where);
	A(one.n === 1 && itemGear(one.col, 'charcoal-aaaa1').gems.join() === 'atk:10', 'fewer gemstones than slots: all of them');
	A(socketAll(base({}, 0, { items }), where).n === 0, 'no loose gemstones: nothing');
	const u = unsocketAll(f.col, where, tail);
	A(u.n === 5 && !itemGear(u.col, 'charcoal-aaaa1').gems.length && itemGear(u.col, 'charcoal-aaaa1').lv === 31 && gemList(u.col).map((g) => g.gem).sort().join() === gemList(c).map((g) => g.gem).sort().join(), 'Take them all out: every gemstone is loose again, the item keeps its level', gemList(u.col).map((g) => g.gem));
	A(unsocketAll(u.col, where, tail).n === 0, 'empty: nothing to take out');
	// on a figurine too
	const fg = fig('charmander', 'char-cmf1');
	let h = addFig(f.col, fg);
	h = holdItem(h, fg.id, 'charcoal-aaaa1', tail());
	const hu = unsocketAll(h, { fig: fg.id }, tail), hf = socketAll(hu.col, { fig: fg.id });
	A(hu.n === 5 && hf.n === 5 && gearView(hf.col, { fig: fg.id }).gems.length === 5 && gearView(hf.col, { fig: fg.id }).lv === 31, 'the same for an item a figurine is holding');
}

// ---------- a dive into an item a figurine holds: off for the dive, back on after
{
	const fg = fig('charmander', 'char-cmf2'), other = fig('squirtle', 'squi-cmf3');
	let c = addFig(addFig(base({}, 0, { items: { 'charcoal-bbbb1': 'charcoal', 'leftovers-cccc1': 'leftovers' } }), fg), other);
	c = setItemLevel(c, 'charcoal-bbbb1', 12);
	c = holdItem(c, fg.id, 'charcoal-bbbb1', tail());
	A(c.figs[fg.id].held === 'charcoal' && c.figs[fg.id].gear.lv === 12 && !c.items['charcoal-bbbb1'], '(a Charmander holding a level 12 Charcoal Stick)');
	const off = unholdItem(c, fg.id, tail());
	A(off && !off.col.figs[fg.id].held && off.col.items[off.uid] === 'charcoal' && itemGear(off.col, off.uid).lv === 12, 'it comes off into the bag for the dive, with its level');
	const dive = newDive(off.uid, 'charcoal', 12, 'tactics', 1e12, fg.id);
	A(dive && dive.back === fg.id && cleanDive(JSON.parse(JSON.stringify(dive))).back === fg.id, 'the dive remembers who it came off (and that survives being saved)');
	A(!('back' in newDive(off.uid, 'charcoal', 12)) && !('back' in cleanDive({ ...dive, back: '<script>' })) && !('back' in cleanDive({ ...dive, back: 7 })), 'a dive from the bag has none; a forged one is dropped');
	// the exit: banked, and back on the figurine at its new level
	const done = { ...dive, floor: exitFloor(12), found: [{ k: 'gem', gem: 'atk:6' }, { k: 'kit' }] };
	const b = bankDive(off.col, done, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem }, tail);
	A(b.col.figs[fg.id].held === 'charcoal' && b.col.figs[fg.id].gear.lv === 20 && !b.col.items[off.uid] && b.report.back === fg.id && b.report.to === 20 && b.report.banked, 'the exit cleared: the item is level 20 and back in the Charmander\'s hands', [b.col.figs[fg.id].gear, b.report]);
	A(lv(b.col, 'atk').join() === '6' && goodsCount(b.col).stitchingkit === 1, 'and what was found came out too');
	// lost or abandoned: back on, at the level it had
	const back = reholdItem(off.col, fg.id, off.uid, tail());
	A(back.figs[fg.id].held === 'charcoal' && back.figs[fg.id].gear.lv === 12 && !back.items[off.uid], 'a dive that ends early: back on, as it was');
	// its figurine fell in the dive: the item stays in the bag
	const gone = { ...off.col, figs: { [other.id]: off.col.figs[other.id] } };
	A(reholdItem(gone, fg.id, off.uid, tail()) === gone, 'its figurine is gone: the item stays in the bag');
	const b2 = bankDive(gone, done, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem }, tail);
	A(b2.col.items[off.uid] === 'charcoal' && itemGear(b2.col, off.uid).lv === 20 && !b2.report.back, '(and still gets its level)');
	// the figurine picked something else up meanwhile: it keeps that
	const busy = holdItem(off.col, fg.id, 'leftovers-cccc1', tail());
	const kept = reholdItem(busy, fg.id, off.uid, tail());
	A(kept === busy && kept.figs[fg.id].held === 'leftovers' && kept.items[off.uid] === 'charcoal', 'holding something else by then: nothing is swapped');
	A(reholdItem(off.col, fg.id, 'charcoal-zzzz9', tail()) === off.col && reholdItem(off.col, null, off.uid, tail()) === off.col, 'an item that is not there, or nobody to give it to: nothing');
	// a dive from the bag banks without anyone to hand it to
	const plain = bankDive(off.col, { ...done, back: undefined }, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem }, tail);
	A(plain.col.items[off.uid] === 'charcoal' && !plain.col.figs[fg.id].held && !plain.report.back, 'a dive from the bag leaves the item in the bag');
}

// ---------- out by a Pull Cord: the floors cleared so far are kept (owner, 2026-11-24: a way out is an item)
{
	A(KIT.pullcord && KIT.pullcord.name === 'Pull Cord' && goodStars('pullcord') === 200 && kindOf('pullcord') === 'kit' && /keep the floors cleared/.test(KIT.pullcord.text), 'a Pull Cord: 200 stars, and its text says what it keeps');
	const ops = { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem, takeGood };
	let c = addGood(addGood(base({}, 0, { items: { 'charcoal-pppp1': 'charcoal' } }), 'pullcord', tail()), 'pullcord', tail());
	c = setItemLevel(c, 'charcoal-pppp1', 12);
	const dive = { ...newDive('charcoal-pppp1', 'charcoal', 12, 'tactics', 1e12), floor: 16, found: [{ k: 'gem', gem: 'atk:4' }, { k: 'gem', gem: 'spe:5' }] };
	A(clearedFloors(dive) === 3 && clearedFloors({ ...dive, floor: 13 }) === 0 && clearedFloors(null) === 0, 'on floor 16 of a dive from level 12, three floors are cleared (13, 14, 15)');
	const r = bankPart(c, dive, dive.floor - 1, dive.found, ops, tail);
	A(r && itemGear(r.col, 'charcoal-pppp1').lv === 15 && r.report.to === 15 && r.report.from === 12 && r.report.cord === true && r.report.cleared === 3, 'the cord pulled: the item is level 15, not 20', r && r.report);
	A(lv(r.col, 'atk').join() === '4' && lv(r.col, 'spe').join() === '5' && r.report.gems.length === 2 && !goodsCount(r.col).stitchingkit && r.report.kits === 0, 'the gemstones found so far come out; no Stitching Kit');
	A(goodsCount(r.col).pullcord === 1 && goodsCount(c).pullcord === 2, 'one Pull Cord is used');
	const none = bankPart(base({}, 0, { items: { 'charcoal-pppp1': 'charcoal' } }), dive, 15, dive.found, ops, tail);
	A(none === null, 'with no Pull Cord: nothing happens');
	// a kit among the finds is never banked by a cord; nor a floor past the last before the exit
	const greedy = bankPart(c, { ...dive, floor: 20 }, 99, [{ k: 'kit' }, { k: 'gem', gem: 'hp:9' }], ops, tail);
	A(itemGear(greedy.col, 'charcoal-pppp1').lv === 19 && !goodsCount(greedy.col).stitchingkit && lv(greedy.col, 'hp').join() === '9', 'never the exit floor itself, and never its kit: level 19 at most from a dive to 20', greedy.report);
	// nothing cleared: the cord is used and the item is as it was (the page does not offer it then)
	const zero = bankPart(c, { ...dive, floor: 13, found: [] }, 12, [], ops, tail);
	A(itemGear(zero.col, 'charcoal-pppp1').lv === 12 && zero.report.to === 12 && zero.report.cleared === 0, 'no floor cleared: the level stays');
	// an item taken off a figurine goes back on with what it gained
	const fg = fig('charmander', 'char-cord1');
	let h = addFig(c, fg);
	const withBack = { ...dive, back: fg.id };
	const rb = bankPart(h, withBack, 15, dive.found, ops, tail);
	A(rb.col.figs[fg.id].held === 'charcoal' && rb.col.figs[fg.id].gear.lv === 15 && rb.report.back === fg.id, 'an item taken off a figurine for the dive goes back on, at its new level');
	A(itemGear(c, 'charcoal-pppp1').lv === 12, '(the collection handed in is not changed)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
