// Group C (cost modification) wave 5 — more counter-driven self-scaling cost.
import fs from 'fs';
import * as E from '../../engine.js';
import { drawCards } from '../../engine/zones.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 14) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'druid', name: 'D', power: null }, { id: 'druid', name: 'E', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	return st;
};
const eff = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };

for (const id of ['irebound_brute', 'knight_of_the_wild', 'frostsaber_matriarch', 'naga_giant', 'shirvallah_the_tiger', 'imprisoned_horror'])
	ok(`${id} carries selfCost`, cardsById[id].selfCost && cardsById[id].selfCost.per, id);

{ const st = game(); st.players[0].cardsDrawnThisTurn = 3; ok('Irebound Brute: 7 - 3 drawn this turn = 4', eff(st, 0, 'irebound_brute') === 4); }
{ const st = game(); st.players[0].tribeSummonedGame = { Beast: 4 }; ok('Knight of the Wild: 7 - 4 Beasts summoned = 3', eff(st, 0, 'knight_of_the_wild') === 3); ok('Frostsaber Matriarch: 7 - 4 = 3', eff(st, 0, 'frostsaber_matriarch') === 3); }
{ const st = game(); st.players[0].manaSpentSpellsGame = 8; ok('Naga Giant: 20 - 8 mana spent on spells = 12', eff(st, 0, 'naga_giant') === 12); }
{ const st = game(); st.players[0].manaSpentSpellsGame = 5; ok('Shirvallah: 25 - 5 mana on spells = 20', eff(st, 0, 'shirvallah_the_tiger') === 20); }
{ const st = game(); st.players[0].ownTurnsDamage = 4; ok('Imprisoned Horror: 9 - 4 damage taken on your turns = 5', eff(st, 0, 'imprisoned_horror') === 5); }

// end-to-end: Beast summons drive the tribe counter
{
	const st = game();
	E.summon(st, 0, { id: 'wolf', name: 'Wolf', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Beast', attack: 1, health: 1, description: 'x' });
	E.summon(st, 0, { id: 'wolf', name: 'Wolf', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Beast', attack: 1, health: 1, description: 'x' });
	ok('summon() tracks Beasts summoned this game', (st.players[0].tribeSummonedGame || {}).Beast === 2);
	ok('Knight of the Wild is 2 cheaper after 2 Beasts', eff(st, 0, 'knight_of_the_wild') === 5, eff(st, 0, 'knight_of_the_wild'));
}
// end-to-end: cards drawn this turn resets across turns
{
	const st = game(); st.players[0].deck = ['chillwind_yeti', 'wolfrider', 'boulderfist_ogre'].filter(id => cardsById[id]);
	const before = st.players[0].cardsDrawnThisTurn || 0;
	drawCards(st, 0, 2);
	ok('drawCards increments cardsDrawnThisTurn (delta 2)', (st.players[0].cardsDrawnThisTurn || 0) === before + 2, st.players[0].cardsDrawnThisTurn);
	E.endTurn(st); E.endTurn(st); // back to p0
	ok('cardsDrawnThisTurn resets at your next turn (only the start-of-turn draw counts)', st.players[0].cardsDrawnThisTurn <= 1, st.players[0].cardsDrawnThisTurn);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
