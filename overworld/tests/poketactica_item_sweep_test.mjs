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
import { loadData, mazeRun } from '../../tools/poketactica/sweep_moves.mjs';
import * as MM from '../../poketactica/js/mm/turn.js';
import { HELD, TD_IDLE, heldNote } from '../../poketactica/js/goods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = loadData();
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/item_sweep.json'), 'utf8'));

// Mystery Maze: none does nothing there. (Leftover Clay and Black Glue did until MM_RULES_REV 8: they act at the end of a
// battle's phase, and the maze has its own end of a turn.)
const MAZE_NOTHING = [];
// Tower Defense: a tower has no HP, keeps no status and its PP refills each wave, so what guards, heals or cures does nothing there.
const TD_NOTHING = ['aspearberry', 'blacksludge', 'brightpowder', 'cheriberry', 'chestoberry', 'eviolite', 'focusband', 'focussash', 'leftovers', 'leppaberry', 'lumberry', 'oranberry', 'pechaberry', 'persimberry',
	'rawstberry', 'rockyhelmet', 'shellbell', 'sitrusberry', 'weaknesspolicy', 'whiteherb'];

const R = sweepItems(data), ids = Object.keys(R);
A(ids.length === Object.keys(HELD).length && ids.length === Object.keys(TABLE).length && ids.length >= 48, `every held item is in the table (${ids.length})`);
const off = ids.filter((id) => JSON.stringify(R[id]) !== JSON.stringify(TABLE[id]));
A(!off.length, 'each item shows in the scenes the table says it does', off.slice(0, 8).map((id) => `${id}: now ${JSON.stringify(R[id])}, table ${JSON.stringify(TABLE[id])}`));
A(!deadIn(R, 'turn').length, 'turn-based battles: every held item does something', deadIn(R, 'turn'));
A(JSON.stringify(deadIn(R, 'maze').sort()) === JSON.stringify(MAZE_NOTHING), 'Mystery Maze: every held item does something', deadIn(R, 'maze'));
A(JSON.stringify(deadIn(R, 'td').sort()) === JSON.stringify(TD_NOTHING), `Tower Defense: the ${TD_NOTHING.length} that guard, heal or cure do nothing on a tower; the other ${ids.length - TD_NOTHING.length} work`, deadIn(R, 'td'));
A(JSON.stringify([...TD_IDLE].sort()) === JSON.stringify(TD_NOTHING) && heldNote('leftovers').includes('Tower Defense') && heldNote('charcoal') === '', 'the held-item screen says so for exactly those (goods.js TD_IDLE)');
{
	const hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A((hub.match(/heldNote\(/g) || []).length >= 4, 'both item panels of the held-item screen show the note');
}
// each where it should
const want = { leftovers: ['turn', 'upkeep'], sitrusberry: ['maze', 'defend'], lumberry: ['maze', 'defend'], leppaberry: ['turn', 'pp'], choicescarf: ['td', 'fire'], lifeorb: ['td', 'fire'], charcoal: ['td', 'fire'], widelens: ['td', 'fire'],
	luckyegg: ['maze', 'ko'], focussash: ['maze', 'defend'], eviolite: ['maze', 'defend'], scopelens: ['maze', 'attack'], shellbell: ['maze', 'attack'], rockyhelmet: ['turn', 'defend'], weaknesspolicy: ['turn', 'defend'] };
const lost = Object.entries(want).filter(([id, [mode, scene]]) => !(R[id] && R[id][mode].includes(scene))).map(([id, [mode, scene]]) => `${id} (${mode}: ${scene})`);
A(!lost.length, `${Object.keys(want).length} items show where they should (Leftover Clay at the end of a phase, a Sitrus Bead when struck in the maze, Charcoal on a tower ...)`, lost);
const types = ids.filter((id) => HELD[id].held.typeBoost);
A(types.length === 17 && types.every((id) => R[id].turn.includes('attack') && R[id].maze.includes('attack') && R[id].td.includes('fire')), 'all 17 type-boosting items work in all three modes', types.filter((id) => !(R[id].turn.includes('attack') && R[id].maze.includes('attack') && R[id].td.includes('fire'))));

// ---------- Mystery Maze (MM_RULES_REV 8): Leftover Clay and Black Glue at the maze's pace; a floor is a battle to a held item
{
	const run = (held, rev) => { const S = mazeRun(data, held), L = MM.leaderOf(S); for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1); if (rev) S.rev = rev; L.hp = Math.floor(L.maxHP / 2); return { S, L }; };
	const wait = (S, n) => { for (let i = 0; i < n; i++) MM.act(S, { t: 'pass' }, data); };
	const after = (held, rev) => { const { S, L } = run(held, rev); wait(S, 11); return L.hp; };
	const none = after(null), left = after('leftovers'), old = after('leftovers', 7), sludge = after('blacksludge'), maxHP = run(null).L.maxHP;
	A(left - none === Math.floor(maxHP / 16) && old === none, 'Leftover Clay in the maze: a sixteenth every 10th turn (a run recorded under rev 7 replays without it)', [none, left, old]);
	A(none - sludge === Math.floor(maxHP / 8), 'Black Glue in the maze: anyone but a Poison type loses an eighth', [none, sludge]);
	const stairs = (rev) => { const { S, L } = run('sitrusberry', rev); L.heldUsed = true; L.choiceLock = 'tackle'; L.x = S.F.stairs[0]; L.y = S.F.stairs[1]; MM.act(S, { t: 'stairs' }, data); return [S.floorNo, MM.leaderOf(S).heldUsed, MM.leaderOf(S).choiceLock]; };
	A(JSON.stringify(stairs()) === '[2,false,null]' && JSON.stringify(stairs(7)) === '[2,true,"tackle"]', 'a berry it has eaten works again on the next floor, and a Choice item lets go (not under rev 7)', [stairs(), stairs(7)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
