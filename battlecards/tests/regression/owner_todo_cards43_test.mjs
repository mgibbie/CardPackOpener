// Forty-third batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Goblin Arsonist -> tribe "Goblin Soldier"
import fs from 'fs';
import * as E from '../../engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const c = cardsById.goblin_arsonist;
ok('Goblin Arsonist is a "Goblin Soldier"', c.tribe === 'Goblin Soldier', c.tribe);
ok('keeps its Deathrattle', (c.keywords || []).includes('deathrattle'), JSON.stringify(c.keywords));
const inst = E.instantiate(c, 0);
ok('the instance reports the compound tribe', (inst.tribe || '').includes('Goblin') && (inst.tribe || '').includes('Soldier'), inst.tribe);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
