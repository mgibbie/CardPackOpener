// Thirty-second batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Alpha Tyrranax -> retribe "Alien Beast" (was "Dinosaur Beast").
import fs from 'fs';
import * as E from '../../engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const c = cardsById.alpha_tyrranax;
ok('Alpha Tyrranax is now an "Alien Beast"', c.tribe === 'Alien Beast', c.tribe);
ok('it keeps Trample', (c.keywords || []).includes('trample'), JSON.stringify(c.keywords));
// instance carries the tribe (tribe synergies read it)
const inst = E.instantiate(c, 0);
ok('the instance reports tribe "Alien Beast"', inst.tribe === 'Alien Beast', inst.tribe);
ok('the tribe contains both "Alien" and "Beast" (compound-tribe matchers)', (inst.tribe || '').includes('Alien') && (inst.tribe || '').includes('Beast'), inst.tribe);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
