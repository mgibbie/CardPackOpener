// Group D (turn triggers) wave 6 — enemy-manipulation end/start-of-turn effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 26) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });
const roundTrip = st => { E.endTurn(st); E.endTurn(st); };

for (const id of ['mythical_terror', 'soothsayer_s_caravan', 'merch_seller', 'ancient_void_hound'])
	ok(`${id} carries an ongoing`, cardsById[id].ongoing, id);
ok('mythical_terror gained its Lifesteal keyword', cardsById['mythical_terror'].keywords.includes('lifesteal'));

// Mythical Terror: end of turn, force all enemy creatures to attack it
{
	const st = game(); const mt = put(st, 0, 'mythical_terror'); // 4/10
	const a = put(st, 1, null, dummy(3, 3, 'A')); const b = put(st, 1, null, dummy(2, 3, 'B'));
	E.endTurn(st);
	ok('Mythical Terror: both enemy minions attacked it (took 3+2=5)', mt.damage === 5 || E.isDead(mt) === false && mt.damage >= 5, mt.damage);
	ok('Mythical Terror: it hit them back (they took its 4 Attack)', a.damage === 4 && b.damage === 4, [a.damage, b.damage]);
}
// Soothsayer's Caravan: start of turn, copy a spell from opponent's deck
{
	const st = game(); put(st, 0, 'soothsayer_s_caravan');
	const spell = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	st.players[1].deck = ['chillwind_yeti', spell.id, 'boulderfist_ogre'];
	roundTrip(st);
	ok('Soothsayer\'s Caravan: copied a SPELL (not a minion) to your hand', st.players[0].hand.some(c => cardsById[c.id] && (cardsById[c.id].type === 'sorcery' || cardsById[c.id].type === 'instant')) && !st.players[0].hand.some(c => c.id === 'chillwind_yeti'), st.players[0].hand.map(c => c.id));
}
// Merch Seller: end of turn, put a random spell on top of opponent's deck
{
	const st = game(); put(st, 0, 'merch_seller');
	st.players[1].deck = ['chillwind_yeti', 'boulderfist_ogre']; // creatures only, so a spell reaching deck/hand is clearly Merch Seller's
	E.endTurn(st); // p0 ends -> merch fires (spell on top of p1 deck) -> p1 draws it
	const isSpell = c => { const d = cardsById[c.id] || cardsById[c]; return d && (d.type === 'sorcery' || d.type === 'instant'); };
	const spellReached = st.players[1].deck.some(isSpell) || st.players[1].hand.some(isSpell);
	ok('Merch Seller: a spell reached the opponent (their deck/hand now has one)', spellReached, [st.players[1].deck, st.players[1].hand.map(c => c.id)]);
}
// Ancient Void Hound: end of turn, steal 1/1 from all enemy creatures
{
	const st = game(); const h = put(st, 0, 'ancient_void_hound'); // 10/10
	const a = put(st, 1, null, dummy(3, 4, 'A')); const b = put(st, 1, null, dummy(2, 2, 'B'));
	const hA = h.attack, hH = E.hp(h);
	E.endTurn(st);
	ok('Void Hound: each enemy minion lost 1/1', a.attack === 2 && a.maxHealth === 3 && b.attack === 1 && b.maxHealth === 1, [a.attack, a.maxHealth, b.attack, b.maxHealth]);
	ok('Void Hound: it grew +1/+1 per enemy minion (2 -> +2/+2)', h.attack === hA + 2 && E.hp(h) === hH + 2, [h.attack, E.hp(h)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
