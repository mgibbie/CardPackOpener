// Wave 28: Unidentified Maul — on draw, becomes a random one of four Mauls,
// each a 2/2 Paladin weapon with its own Battlecry.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const VARIANTS = ['blessed_maul', 'purifiers_maul', 'sacred_maul', 'champions_maul'];
const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'paladin', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'paladin'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const putMinion = (st, atk = 2, hp = 2) => { const m = E.instantiate({ id: 'dummy', name: 'Dummy', type: 'creature', cost: 1, attack: atk, health: hp }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of [...VARIANTS, 'unidentified_maul']) ok(`${id} exists`, cardsById[id], id);

// Drawing Unidentified Maul transforms it into one of the four Mauls
{
	for (let seed = 0; seed < 6; seed++) {
		const st = game(seed);
		st.players[0].deck = ['unidentified_maul'];
		E.drawCards(st, 0, 1);
		const drawn = st.players[0].hand[st.players[0].hand.length - 1];
		ok(`seed ${seed}: drew a Maul variant (not the Unidentified base)`, drawn && VARIANTS.includes(drawn.id), drawn && drawn.id);
		ok(`seed ${seed}: the drawn variant is a 2/2 weapon`, drawn && drawn.type === 'weapon' && drawn.attack === 2 && drawn.durability === 2, drawn && [drawn.attack, drawn.durability]);
	}
}

// Each variant's Battlecry fires on equip
// Blessed Maul: give your minions +1 Attack
{
	const st = game();
	const m = putMinion(st, 2, 2);
	equip(st, 'blessed_maul');
	ok('Blessed Maul: friendly minion gained +1 Attack', m.attack === 3, m.attack);
}
// Purifier's Maul: give your minions Divine Shield
{
	const st = game();
	const m = putMinion(st, 2, 2);
	equip(st, 'purifiers_maul');
	ok('Purifier\'s Maul: friendly minion has Divine Shield', m.shield === true && m.keywords.includes('divine_shield'), [m.shield, m.keywords]);
}
// Sacred Maul: give your minions Taunt
{
	const st = game();
	const m = putMinion(st, 2, 2);
	equip(st, 'sacred_maul');
	ok('Sacred Maul: friendly minion has Taunt', m.keywords.includes('taunt'), m.keywords);
}
// Champion's Maul: summon two 1/1 Silver Hand Recruits
{
	const st = game();
	const before = st.players[0].board.length;
	equip(st, 'champions_maul');
	const recruits = st.players[0].board.filter(c => c.attack === 1 && (c.maxHealth === 1));
	ok('Champion\'s Maul: summoned two 1/1 recruits', st.players[0].board.length === before + 2 && recruits.length >= 2, [before, st.players[0].board.length]);
}
// the weapon itself equipped at 2/2 in every case
{
	const st = game();
	const w = equip(st, 'blessed_maul');
	ok('the Maul equips as a 2/2 weapon', w && w.attack === 2 && w.durability === 2, w && [w.attack, w.durability]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
