// Twenty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Canopy Gorger -> retribe Beast; add "Landfall: Gain +2/+2".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const c = cardsById.canopy_gorger;
ok('Canopy Gorger is a Beast', c.tribe === 'Beast', c.tribe);
ok('reads "Trample.\\nLandfall: Gain +2/+2."', c.description === 'Trample.\nLandfall: Gain +2/+2.', JSON.stringify(c.description));
ok('Landfall wired (on landfall -> buff-self +2/+2)', c.ongoing?.on === 'landfall' && c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 2 && c.ongoing.effects[0].health === 2, JSON.stringify(c.ongoing));

// FIRE it: each landfall grows it +2/+2 (permanent)
const st = E.createGame(cardsById, seededRng(53), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
const g = E.instantiate(c, 0); g.zone = 'board'; st.players[0].board.push(g); // 6/5
E.fireOngoing(st, 0, 'landfall', {});
ok('Landfall grew it +2/+2 (6/5 -> 8/7)', g.attack === 8 && g.maxHealth === 7, [g.attack, g.maxHealth]);
E.fireOngoing(st, 0, 'landfall', {});
ok('a second land drop grows it again (8/7 -> 10/9)', g.attack === 10 && g.maxHealth === 9, [g.attack, g.maxHealth]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
