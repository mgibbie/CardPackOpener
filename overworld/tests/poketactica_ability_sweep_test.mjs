// poketactica_ability_sweep_test.mjs — THE ABILITIES SWEEP, pinned (owner, 2026-11-23: every ability checked). The table in
// poketactica/data/ability_sweep.json says, for each of the 318 abilities a species can have, in which scenes it changes
// anything next to the same unit with no ability and the same dice (tools/poketactica/sweep_abilities.mjs: entering,
// attacking, defending, the end of the phase, auras, knockouts). This suite runs the sweep again and holds the table to
// it: an ability that stops working (or starts) fails here until the table is rewritten on purpose
// (`node tools/poketactica/sweep_abilities.mjs --write`). Pure: node only.
//   node overworld/tests/poketactica_ability_sweep_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sweepAbilities, deadAbilities } from '../../tools/poketactica/sweep_abilities.mjs';
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = loadData();
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/ability_sweep.json'), 'utf8'));
const DEAD_MAX = 209;   // (never more; when abilities are fixed the table is rewritten and this number moves down)

const R = sweepAbilities(data), ids = Object.keys(R), dead = deadAbilities(R);
const every = [...new Set(Object.values(data.abilities).flatMap((v) => (Array.isArray(v) ? v : [])))];
A(ids.length === every.length && ids.length === Object.keys(TABLE).length && ids.length >= 318, `every ability a species can have is in the table (${ids.length})`);
const off = ids.filter((id) => JSON.stringify(R[id]) !== JSON.stringify(TABLE[id]));
A(!off.length, 'each ability shows in the scenes the table says it does', off.slice(0, 12).map((id) => `${id}: now ${JSON.stringify(R[id])}, table ${JSON.stringify(TABLE[id])}`));
A(dead.length <= DEAD_MAX, `the abilities that change nothing: ${dead.length} of ${ids.length} (never more than ${DEAD_MAX})`, dead.length);
// the ones the engine has had from the start keep working, each where it should
const want = { intimidate: 'enter', drought: 'enter', drizzle: 'enter', electricsurge: 'enter', static: 'defend', flamebody: 'defend', roughskin: 'defend', levitate: 'stats', pressure: 'aura', friendguard: 'aura', victorystar: 'aura',
	arenatrap: 'aura', shadowtag: 'aura', lightningrod: 'aura', stormdrain: 'aura', guts: 'attack', technician: 'attack', adaptability: 'attack', thickfat: 'defend', voltabsorb: 'defend', waterabsorb: 'defend', flashfire: 'defend', immunity: 'defend', limber: 'defend', insomnia: 'defend' };
const lost = Object.entries(want).filter(([id, scene]) => !(R[id] || []).includes(scene)).map(([id, scene]) => id + ' (' + scene + ')');
A(!lost.length, `${Object.keys(want).length} abilities the engine has always had still show where they should (Intimidate on entering, Static when struck, Guts when attacking ...)`, lost);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
