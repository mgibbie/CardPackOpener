// poketactica_mm_abyss_marks_test.mjs — MYSTERY MAZE, MILESTONES IN THE ABYSS (Plans/POKETACTICA_MODES_PLAN.md item M2).
// It was "endless with two marks". Reaching floors 10, 25, 50, 75 and 100 each opens something to keep: one more item in
// the kit every Abyss run then starts with, free. The kit is worked out from the deepest floor the collection records;
// what is left of it at the end of a run stays in the Abyss (it is never carried out into the storage).
// Pure: node only.   node overworld/tests/poketactica_mm_abyss_marks_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ABYSS_ID, ABYSS_MARKS, abyssKit, abyssCrossed, dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { ITEMS } from '../../poketactica/js/mm/items.js';
import { applyMmRewards } from '../../poketactica/js/mm/rewards.js';
import { mmRecipe, validMmRecipe, cleanKit, mmFig } from '../../poketactica/js/mm/replay.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { newFigs, addFig, mmStoreCount } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'), moves: J('overworld/data/moves_battle.json') };
const abyss = dungeonById(ABYSS_ID);
const out = (more) => ({ kept: true, goods: [], won: false, escaped: true, quit: false, floor: 1, stars: 0, carried: 0, items: [], recruits: [], exp: {}, moveXp: {}, fallen: [], kills: 0, ch: [], ...more });

// ---------- the table
A(abyss && abyss.endless && JSON.stringify(ABYSS_MARKS.map((m) => m.floor)) === '[10,25,50,75,100]' && ABYSS_MARKS.every((m) => ITEMS[m.item] && ITEMS[m.item].group !== 'good'), 'five milestones (floors 10, 25, 50, 75, 100), each a real item of the maze', ABYSS_MARKS);
A(abyssKit(0).length === 0 && abyssKit(9).length === 0 && JSON.stringify(abyssKit(10)) === '["oran"]' && abyssKit(49).length === 2 && abyssKit(100).length === 5 && abyssKit(400).length === 5, 'the kit grows with the deepest floor reached: nothing before 10, one thing at 10, all five from 100');
A(abyssCrossed(0, 9).length === 0 && abyssCrossed(0, 10).length === 1 && abyssCrossed(8, 27).map((m) => m.floor).join() === '10,25' && abyssCrossed(25, 25).length === 0 && abyssCrossed(30, 24).length === 0, 'a run crosses the milestones above the old record and at or under the floor it reached');

// ---------- a run that reaches a milestone: said in its report, and the record keeps it
{
	let col = addFig(newFigs(), makeFigurine('pikachu', 30, makeRng('a'), data, { id: 'pika-a', shinyRate: 0 }));
	let r = applyMmRewards(col, out({ kept: false, escaped: false, floor: 12 }), abyss, data, 't1');
	col = r.col;
	A(r.report.marks.length === 1 && r.report.marks[0].floor === 10 && col.mm.best[ABYSS_ID] === 12 && JSON.stringify(abyssKit(col.mm.best[ABYSS_ID])) === '["oran"]', 'a run that FELL on floor 12 still reached floor 10: the milestone is opened, and the next run starts with an Oran Bead', r.report.marks);
	r = applyMmRewards(col, out({ floor: 11 }), abyss, data, 't2');
	A(r.report.marks.length === 0, 'a shallower run opens nothing more');
	r = applyMmRewards(col, out({ floor: 30 }), dungeonById('whisper-woods'), data, 't3');
	A(r.report.marks.length === 0, 'another dungeon has no milestones');
	// ---------- the kit is not carried out
	const before = Object.values(mmStoreCount(col)).reduce((a, b) => a + b, 0);
	r = applyMmRewards(col, out({ floor: 14, items: ['oran', 'oran', 'apple'] }), abyss, data, 't4', ['oran']);
	const stored = mmStoreCount(r.col);
	A(JSON.stringify(r.report.kitLeft) === '["oran"]' && r.report.stored === 2 && (stored.oran || 0) === 1 && (stored.apple || 0) === 1 && before === 0, 'escaping with two Oran Beads and an apple, one bead of them the kit\'s: the kit\'s stays, one bead and the apple go to storage', [r.report.kitLeft, stored]);
	r = applyMmRewards(col, out({ floor: 14, items: ['apple'] }), abyss, data, 't5', ['oran']);
	A(r.report.kitLeft.length === 0 && r.report.stored === 1, 'a kit item that was eaten is simply gone: nothing is held back for it');
	r = applyMmRewards(col, out({ floor: 14, items: ['oran'] }), abyss, data, 't6');
	A(r.report.kitLeft.length === 0 && r.report.stored === 1, 'a run with no kit carries everything out, as before');
}
// ---------- the recipe remembers the kit (a resumed run must not carry it out either)
{
	const party = [makeFigurine('pikachu', 30, makeRng('k'), data, { id: 'pika-k', shinyRate: 0 })].map(mmFig);
	const rec = mmRecipe({ seed: 'kit', dungeonId: ABYSS_ID, party, bag: [{ id: 'oran' }], stars: 0, acts: [], kit: ['oran', 'nonsense'] });
	A(JSON.stringify(rec.kit) === '["oran"]' && validMmRecipe(rec) && JSON.stringify(cleanKit('x')) === '[]', 'a run\'s recipe keeps its kit (an item that does not exist is dropped)', rec.kit);
	A(!('kit' in mmRecipe({ seed: 'kit', dungeonId: ABYSS_ID, party, bag: [], stars: 0, acts: [] })), 'a run with no kit has no such field');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
