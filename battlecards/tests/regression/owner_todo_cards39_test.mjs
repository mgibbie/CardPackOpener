// Thirty-ninth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Bay Falcon -> tribe "Beast"
//   Snap       -> "Bounce target creature." with Bounce BOLDED (glossary keyword)
import fs from 'fs';
import * as E from '../../engine.js';
import { richTokens } from '../../keywords.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 93) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Bay Falcon: tribe Beast ----------
ok('Bay Falcon is a Beast', cardsById.bay_falcon.tribe === 'Beast', cardsById.bay_falcon.tribe);

// ---------- Snap: "Bounce target creature." (Bounce bold) ----------
{
	const c = cardsById.snap;
	ok('reads "Bounce target creature."', c.description === 'Bounce target creature.', JSON.stringify(c.description));
	ok('effect is a bounce on a creature', c.effects?.[0]?.type === 'bounce' && c.effects[0].target === 'creature', JSON.stringify(c.effects));
	ok('"Bounce" renders bold', richTokens(c.description).find(t => t.text === 'Bounce')?.bold === true);

	// FIRE it: bounce an enemy creature back to its owner's hand (use a real card
	// so bounce can reconstruct it as its base card)
	const st = game();
	const foe = put(st, 1, E.instantiate(cardsById.grizzly_bears, 1));
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('the creature left the board', !st.players[1].board.some(x => x.uid === foe.uid), st.players[1].board.map(x => x.id));
	ok('it returned to its owner\'s hand', st.players[1].hand.some(x => x.id === 'grizzly_bears'), st.players[1].hand.map(x => x.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
