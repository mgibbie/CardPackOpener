// Group D (turn triggers) wave 3 — turn-start attackers + end-of-turn enemy effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 23) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });
const roundTrip = st => { E.endTurn(st); E.endTurn(st); };

for (const id of ['gnome_muncher', 'krog_crater_king', 'disruptive_spellbreaker', 'conjured_mirage', 'kobold_barbarian', 'briarspawn_drake'])
	ok(`${id} carries an ongoing`, cardsById[id].ongoing, id);

// Gnome Muncher: end of turn, attack the lowest-Health enemy creature
{
	const st = game(); put(st, 0, 'gnome_muncher'); // 5/6
	const big = put(st, 1, null, dummy(1, 9, 'Big')); const low = put(st, 1, null, dummy(1, 2, 'Low'));
	E.endTurn(st);
	ok('Gnome Muncher: hit the lowest-Health enemy (2 hp one)', E.isDead(low) || low.damage >= 5, [low.damage, big.damage]);
	ok('Gnome Muncher: did NOT hit the higher-Health one', big.damage === 0);
}
// Krog Crater King: end of turn, set all enemy creatures to 1/1
{
	const st = game(); put(st, 0, 'krog_crater_king');
	const a = put(st, 1, null, dummy(7, 7, 'A')); const b = put(st, 1, null, dummy(4, 5, 'B'));
	E.endTurn(st);
	ok('Krog: enemy creatures set to 1/1', a.attack === 1 && E.hp(a) === 1 && b.attack === 1 && E.hp(b) === 1, [a.attack, E.hp(a), b.attack, E.hp(b)]);
}
// Disruptive Spellbreaker: end of turn, opponent discards a spell
{
	const st = game(); put(st, 0, 'disruptive_spellbreaker');
	const spell = E.instantiate({ id: 'sp', name: 'Sp', type: 'sorcery', cost: 2, rarity: 'common', effects: [] }, 1); spell.zone = 'hand';
	const cre = E.instantiate({ id: 'cr', name: 'Cr', type: 'creature', cost: 2, rarity: 'common', attack: 1, health: 1 }, 1); cre.zone = 'hand';
	st.players[1].hand = [spell, cre];
	E.endTurn(st);
	ok('Disruptive Spellbreaker: the opponent discarded the SPELL (not the creature)', !st.players[1].hand.includes(spell) && st.players[1].hand.includes(cre), st.players[1].hand.map(c => c.id));
}
// Conjured Mirage: start of turn, shuffle itself into your deck (then the
// start-of-turn draw may pull it right back — the faithful HS order).
{
	const st = game(); const cm = put(st, 0, 'conjured_mirage');
	roundTrip(st); // back to your turn -> start of turn
	const inDeckOrHand = st.players[0].deck.includes('conjured_mirage') || st.players[0].hand.some(c => c.id === 'conjured_mirage');
	ok('Conjured Mirage: left the board into your deck/hand', !st.players[0].board.includes(cm) && inDeckOrHand, [st.players[0].deck, st.players[0].hand.map(c => c.id)]);
}
// Kobold Barbarian: start of turn, attack a random enemy (can be the hero)
{
	const st = game(); st.players[0].deck = ['wolfrider']; st.players[1].deck = ['wolfrider']; // avoid fatigue skewing hero life
	const kb = put(st, 0, 'kobold_barbarian'); // 4/4, no enemy minions -> must hit the hero
	roundTrip(st);
	ok('Kobold Barbarian: with no enemy minions, it hit the enemy hero for 4', st.players[1].life === 30 - 4, st.players[1].life);
}
// Briarspawn Drake: end of turn, attack a random enemy creature
{
	const st = game(); put(st, 0, 'briarspawn_drake'); // 12/7
	const foe = put(st, 1, null, dummy(2, 20, 'Foe'));
	E.endTurn(st);
	ok('Briarspawn Drake: hit the enemy creature for 12', foe.damage === 12 || E.isDead(foe), foe.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
