// poketactica_squad_test.mjs — Poketactica's SQUAD TOOLS, the collection's side (Plans/POKETACTICA_IMPROVEMENT_PLAN.md
// item 12): a figurine marked as a FAVOURITE, and RELEASE (it leaves for good, as a lost one does, but it is no loss:
// nothing goes to the memorial, and what it held comes back to the bag). The camp's side (sort, filter, the screens) is in
// poketactica_items_test.mjs.
// Pure: node only.   node overworld/tests/poketactica_squad_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as FC from '../../poketactica/js/figcol.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json') };
let n = 0;
const tail = () => 's' + String(n++).padStart(5, '0');
const fig = (sp, lv, id) => makeFigurine(sp, lv, makeRng(id), data, { id, shinyRate: 0 });
const a = fig('pikachu', 30, 'pika-sq1'), b = fig('eevee', 12, 'eevee-sq2'), c = fig('eevee', 9, 'eevee-sq3');
const col0 = FC.addFig(FC.addFig(FC.addFig({ v: 1, starters: true, figs: {} }, a), b), c);

// ---------- a favourite
{
	const f1 = FC.setFav(col0, a.id, true);
	A(f1.figs[a.id].fav === true && !col0.figs[a.id].fav && f1.figs[b.id] === col0.figs[b.id], 'a favourite is marked on the figurine (the others untouched)');
	A(FC.setFav(f1, a.id, true) === f1 && FC.setFav(col0, a.id, false) === col0 && FC.setFav(col0, 'nope-000', true) === col0, 'marking what is already so, or nobody, changes nothing');
	const f0 = FC.setFav(f1, a.id, false);
	A(!('fav' in f0.figs[a.id]), 'unmarked: the field is gone');
	A(FC.cleanFig(f1.figs[a.id]).fav === true && !('fav' in FC.cleanFig(col0.figs[a.id])) && !('fav' in FC.cleanFig({ ...a, fav: 'yes' })) && !('fav' in FC.cleanFig({ ...a, fav: 1 })), 'it survives being read back; anything but true is dropped');
	A(FC.cleanFigs(f1).figs[a.id].fav === true && !FC.sameFigs(col0, f1) && FC.sameFigs(f1, JSON.parse(JSON.stringify(f1))), 'and the sync sees it as a change');
	// two devices: the side that changed it since the agreed copy wins; with no agreed copy a favourite stays one
	const m = (base, mine, theirs) => FC.merge3Figs(base, mine, theirs).figs[a.id].fav === true;
	A(m(col0, f1, col0) && m(col0, col0, f1) && !m(f1, f0, f1) && !m(f1, f1, f0) && m(f1, f1, f1) && !m(col0, col0, col0), 'two devices: the one that changed it since the agreed copy wins');
	A(FC.linkFigs(f1, col0).figs[a.id].fav === true && FC.linkFigs(col0, f1).figs[a.id].fav === true, 'with no agreed copy, a favourite on either device stays a favourite');
}

// ---------- release
{
	A(FC.releaseBlock(col0, a.id) === null && FC.releaseBlock(col0, 'nope-000') === 'no such figurine' && FC.releaseBlock(FC.setFav(col0, a.id, true), a.id) === 'it is a favourite', 'a favourite cannot be released');
	const r = FC.releaseFig(col0, c.id, tail());
	A(r && !r.figs[c.id] && r.figs[a.id] && r.figs[b.id] && r.gone.join() === c.id, 'released: out of the collection, its id on the gone list');
	A(!r.fallen && FC.fallenList(r).length === 0, 'it is no loss: nothing goes to the memorial');
	A(FC.releaseFig(r, c.id, tail()) === null && FC.releaseFig(FC.setFav(col0, c.id, true), c.id, tail()) === null, 'not twice, and not a favourite');
	// a stale copy on another device never brings it back
	const stale = { ...col0, figs: { ...col0.figs, [c.id]: { ...c, exp: c.exp + 99 } } };
	const merges = [FC.merge3Figs(col0, stale, r), FC.merge3Figs(col0, r, stale), FC.linkFigs(stale, r), FC.linkFigs(r, stale)];
	A(merges.every((x) => !x.figs[c.id] && x.gone.includes(c.id) && x.figs[a.id] && x.figs[b.id]), 'another device\'s stale copy merged in (either way round, with or without an agreed copy) does not bring it back');
	A(!FC.cleanFigs({ ...r, figs: { ...r.figs, [c.id]: c } }).figs[c.id], 'nor does a copy that still lists it');
	// what it held comes back to the bag, with its level and gemstones
	let h = FC.addGood(col0, 'charcoal', tail());
	const uid = Object.keys(h.items)[0];
	h = FC.addGem(FC.setItemLevel(h, uid, 31), 'atk', 7, 'gemaa1');
	h = FC.socketGem(h, { uid }, 'gem-gemaa1');
	h = FC.holdItem(h, c.id, uid, tail());
	A(h.figs[c.id].held === 'charcoal' && h.figs[c.id].gear.lv === 31 && !Object.keys(h.items || {}).length, '(an Eevee holding a level 31 Charcoal Stick with a gemstone in it)');
	const rh = FC.releaseFig(h, c.id, tail());
	const back = rh && Object.keys(rh.items || {})[0];
	A(rh && !rh.figs[c.id] && rh.items[back] === 'charcoal' && FC.itemGear(rh, back).lv === 31 && FC.itemGear(rh, back).gems.join() === 'atk:7', 'released while holding an item: the item is in the bag again, level and gemstones kept', rh && rh.items);
	// the last figurine stays
	const one = { v: 1, starters: true, figs: { [a.id]: a } };
	A(FC.releaseBlock(one, a.id) === 'it is your last figurine' && FC.releaseFig(one, a.id, tail()) === null, 'your last figurine cannot be released');
	const two = FC.releaseFig(FC.releaseFig(col0, c.id, tail()), b.id, tail());
	A(two && Object.keys(two.figs).join() === a.id && two.gone.length === 2 && FC.releaseFig(two, a.id, tail()) === null, 'down to one: no further');
	A(col0.figs[c.id] && !col0.gone, '(the collection handed in is never changed)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
