// Fortieth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Penguin Soldier  -> line break before Divine Shield; also WIRE the
//     Divine Shield + Tradeable the text claimed but never had.
//   Filigree Familiar-> tribe "Mech Beast"
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 95) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Penguin Soldier ----------
{
	const c = cardsById.penguin_soldier;
	ok('reads "Battlecry: Bounce target creature.\\nDivine Shield & Tradeable."', c.description === 'Battlecry: Bounce target creature.\nDivine Shield & Tradeable.', JSON.stringify(c.description));
	ok('Divine Shield is now a real keyword', (c.keywords || []).includes('divine_shield'), JSON.stringify(c.keywords));
	ok('Tradeable is now field-backed', c.tradeable === true, c.tradeable);
	const inst = E.instantiate(c, 0);
	ok('the instance actually has a Divine Shield', inst.shield === true, inst.shield);
	// Battlecry still bounces an enemy creature (use a real card so it reconstructs)
	const st = game();
	const foe = put(st, 1, E.instantiate(cardsById.grizzly_bears, 1));
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('Battlecry bounced the enemy creature to its owner\'s hand', !st.players[1].board.some(x => x.uid === foe.uid) && st.players[1].hand.some(x => x.id === 'grizzly_bears'), st.players[1].hand.map(x => x.id));
	const penguin = st.players[0].board.find(x => x.id === 'penguin_soldier');
	ok('the played Penguin Soldier has its Divine Shield', penguin && penguin.shield === true, penguin && penguin.shield);
}

// ---------- Filigree Familiar: tribe Mech Beast ----------
ok('Filigree Familiar is a "Mech Beast"', cardsById.wastes_filigree_familiar.tribe === 'Mech Beast', cardsById.wastes_filigree_familiar.tribe);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
