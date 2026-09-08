// Twenty-second batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Broodhunter Wurm -> retribe Beast; give it "Trample & Smoldering"
//   (stored alphabetically as "Smoldering & Trample").
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const c = cardsById.broodhunter_wurm;
ok('Broodhunter Wurm is now a Beast', c.tribe === 'Beast', c.tribe);
ok('keywords are [trample, smoldering]', ['trample', 'smoldering'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
ok('reads "Smoldering & Trample." (alphabetical)', c.description === 'Smoldering & Trample.', JSON.stringify(c.description));

// FIRE Smoldering (rng forced to 0 => always burns the surviving defender)
const st = E.createGame(cardsById, seededRng(47), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
st.rng = () => 0;
const w = E.instantiate(c, 0); w.zone = 'board'; w.sick = false; st.players[0].board.push(w);
const foe = E.instantiate({ id: 'wall', name: 'Wall', type: 'creature', cost: 4, attack: 2, health: 20 }, 1); foe.zone = 'board'; st.players[1].board.push(foe);
E.attack(st, 0, w.uid, { type: 'creature', uid: foe.uid, player: 1 });
ok('Smoldering Burned the survivor (Attack 2 -> 1)', foe.burned === true && foe.attack === 1, [foe.burned, foe.attack]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
