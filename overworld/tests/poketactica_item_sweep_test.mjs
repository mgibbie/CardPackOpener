// poketactica_item_sweep_test.mjs — THE HELD ITEMS SWEEP holds (owner, 2026-11-23: every move, ability and held item
// checked in every mode). tools/poketactica/sweep_items.mjs puts each held item on a unit and plays it next to the same
// unit holding nothing, in a turn-based battle, in Mystery Maze and on a Tower Defense tower. The table
// (poketactica/data/item_sweep.json) says where each made a difference; this test re-measures it, so an item that stops
// working in a mode fails here, and so does one that starts (the table is then rewritten: --write).
//   node overworld/tests/poketactica_item_sweep_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sweepItems, deadIn } from '../../tools/poketactica/sweep_items.mjs';
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import { HELD } from '../../poketactica/js/goods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = loadData();
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/item_sweep.json'), 'utf8'));

// Mystery Maze: the items that do nothing there (none should: the leader fights by the battle's own rules).
// KNOWN GAP: Leftovers and Black Sludge act at the end of a battle's phase, and the maze has its own end of a turn.
const MAZE_NOTHING = ['blacksludge', 'leftovers'];
// Tower Defense: a tower is never attacked and its PP refills each wave, so what guards, heals or cures does nothing there.
const TD_NOTHING = ['aspearberry', 'blacksludge', 'brightpowder', 'cheriberry', 'chestoberry', 'eviolite', 'focusband', 'focussash', 'leftovers', 'leppaberry', 'oranberry', 'persimberry', 'rawstberry',
	'rockyhelmet', 'shellbell', 'sitrusberry', 'weaknesspolicy', 'whiteherb'];

const R = sweepItems(data), ids = Object.keys(R);
A(ids.length === Object.keys(HELD).length && ids.length === Object.keys(TABLE).length && ids.length >= 48, `every held item is in the table (${ids.length})`);
const off = ids.filter((id) => JSON.stringify(R[id]) !== JSON.stringify(TABLE[id]));
A(!off.length, 'each item shows in the scenes the table says it does', off.slice(0, 8).map((id) => `${id}: now ${JSON.stringify(R[id])}, table ${JSON.stringify(TABLE[id])}`));
A(!deadIn(R, 'turn').length, 'turn-based battles: every held item does something', deadIn(R, 'turn'));
A(JSON.stringify(deadIn(R, 'maze').sort()) === JSON.stringify(MAZE_NOTHING), `Mystery Maze: every held item does something but ${MAZE_NOTHING.length} (${MAZE_NOTHING.join(', ')})`, deadIn(R, 'maze'));
A(JSON.stringify(deadIn(R, 'td').sort()) === JSON.stringify(TD_NOTHING), `Tower Defense: the ${TD_NOTHING.length} that guard, heal or cure do nothing on a tower; the other ${ids.length - TD_NOTHING.length} work`, deadIn(R, 'td'));
// each where it should
const want = { leftovers: ['turn', 'upkeep'], sitrusberry: ['maze', 'defend'], lumberry: ['maze', 'defend'], leppaberry: ['turn', 'pp'], choicescarf: ['td', 'fire'], lifeorb: ['td', 'fire'], charcoal: ['td', 'fire'], widelens: ['td', 'fire'],
	luckyegg: ['maze', 'ko'], focussash: ['maze', 'defend'], eviolite: ['maze', 'defend'], scopelens: ['maze', 'attack'], shellbell: ['maze', 'attack'], rockyhelmet: ['turn', 'defend'], weaknesspolicy: ['turn', 'defend'] };
const lost = Object.entries(want).filter(([id, [mode, scene]]) => !(R[id] && R[id][mode].includes(scene))).map(([id, [mode, scene]]) => `${id} (${mode}: ${scene})`);
A(!lost.length, `${Object.keys(want).length} items show where they should (Leftovers at the end of a phase, a Sitrus Berry when struck in the maze, Charcoal on a tower ...)`, lost);
const types = ids.filter((id) => HELD[id].held.typeBoost);
A(types.length === 17 && types.every((id) => R[id].turn.includes('attack') && R[id].maze.includes('attack') && R[id].td.includes('fire')), 'all 17 type-boosting items work in all three modes', types.filter((id) => !(R[id].turn.includes('attack') && R[id].maze.includes('attack') && R[id].td.includes('fire'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
