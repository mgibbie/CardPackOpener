// Twentieth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Baloth Gorger -> add "Frenzy: Gain +2/+2".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const st = E.createGame(cardsById, seededRng(43), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }

const c = cardsById.baloth_gorger;
ok('Baloth Gorger reads "Trample.\\nFrenzy: Gain +2/+2."', c.description === 'Trample.\nFrenzy: Gain +2/+2.', JSON.stringify(c.description));
ok('Frenzy wired (self-damaged, once, survives -> buff-self +2/+2)',
	c.ongoing?.on === 'self-damaged' && c.ongoing?.once === true && c.ongoing?.survives === true
	&& c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 2 && c.ongoing.effects[0].health === 2, JSON.stringify(c.ongoing));

const g = E.instantiate(c, 0); g.zone = 'board'; g.sick = false; st.players[0].board.push(g); // 4/4
E.execEffects(st, 0, [{ type: 'damage', value: 1, target: 'creature' }], { type: 'creature', uid: g.uid, player: 0 }, null);
ok('Frenzy: surviving damage grants +2/+2 (now 6/6)', g.attack === 6 && g.maxHealth === 6, [g.attack, g.maxHealth]);
E.execEffects(st, 0, [{ type: 'damage', value: 1, target: 'creature' }], { type: 'creature', uid: g.uid, player: 0 }, null);
ok('Frenzy is once-only (no second buff)', g.attack === 6 && g.maxHealth === 6, [g.attack, g.maxHealth]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
