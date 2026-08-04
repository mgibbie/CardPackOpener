// Wave 32: Barbed Thorn — Choose One: Gain Poisonous this turn; OR gain
// "Deathrattle: Deal 2 damage to all enemies."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'rogue', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'rogue'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equipChoice = (st, id, choice) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, choice, 0); return st.players[0].weapon; };
const enemyMinion = (st, hp = 4) => { const m = E.instantiate({ id: 'edum', name: 'Ox', type: 'creature', cost: 1, attack: 1, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };

ok('barbed_thorn exists', cardsById.barbed_thorn);
ok('barbed_thorn is a Choose One weapon', (cardsById.barbed_thorn.choices || []).length === 2);

// Choice 0: Gain Poisonous this turn — minions it damages get Poisoned; wears off next turn
{
	const st = game();
	const w = equipChoice(st, 'barbed_thorn', 0);
	ok('weapon gained Poisonous', w && w.keywords.includes('poisonous'), w && w.keywords);
	const foe = enemyMinion(st, 4);
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('a minion the weapon hit is now Poisoned', foe.poisoned === true, foe.poisoned);
	// "this turn" — Poisonous is gone after the turn ends
	E.endTurn(st);
	ok('Poisonous wore off at end of turn', st.players[0].weapon && !st.players[0].weapon.keywords.includes('poisonous'), st.players[0].weapon && st.players[0].weapon.keywords);
}

// Choice 1: gain a Deathrattle that deals 2 to all enemies when the weapon breaks
{
	const st = game();
	const w = equipChoice(st, 'barbed_thorn', 1);
	ok('weapon gained a Deathrattle', w && (w.deathrattle || []).some(e => e.type === 'damage-all-enemies'), w && w.deathrattle);
	ok('weapon did NOT gain Poisonous on this branch', w && !w.keywords.includes('poisonous'), w && w.keywords);
	const foe = enemyMinion(st, 4);
	const heroLifeBefore = st.players[1].life;
	E.breakWeapon(st, 0, true); // destroy -> deathrattle fires
	ok('Deathrattle dealt 2 to the enemy hero', st.players[1].life === heroLifeBefore - 2, [heroLifeBefore, st.players[1].life]);
	ok('Deathrattle dealt 2 to the enemy minion', foe.damage === 2, foe.damage);
}

// The two choices are exclusive: choosing Deathrattle does not poison, and vice versa
{
	const st = game();
	const w = equipChoice(st, 'barbed_thorn', 0);
	ok('Poisonous branch adds no Deathrattle', w && !(w.deathrattle || []).length, w && w.deathrattle);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
