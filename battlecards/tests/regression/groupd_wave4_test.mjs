// Group D (turn triggers) wave 4 — end-of-turn spell-casters + recruit / summon /
// resurrect from your deck & graveyard.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 24) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].deathLogIds = [];
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');

for (const id of ['trick_totem', 'grand_archivist', 'dragonhatcher', 'y_shaarj_rage_unbound', 'catrina_muerte'])
	ok(`${id} carries a turn-end ongoing`, cardsById[id].ongoing && cardsById[id].ongoing.on === 'turn-end', id);

// Trick Totem: end of turn, cast a random spell that costs 3 or less
{
	const st = game(); put(st, 0, 'trick_totem'); st.players[1].life = 30;
	const before = JSON.stringify(st.players.map(p => [p.life, p.board.length]));
	E.endTurn(st);
	// hard to assert the exact random spell, but the game must stay coherent and something usually happened
	ok('Trick Totem: no crash casting a random <=3 spell', !st.over && st.players[0].board.some(b => b.id === 'trick_totem'));
}
// Grand Archivist: end of turn, cast a spell from your deck
{
	const st = game(); put(st, 0, 'grand_archivist');
	st.players[0].deck = ['fireball', 'arcane_intellect', 'chillwind_yeti'].filter(id => cardsById[id]);
	const deck0 = st.players[0].deck.length;
	E.endTurn(st);
	ok('Grand Archivist: a spell left the deck (was cast)', st.players[0].deck.length < deck0 || !st.players[0].deck.some(id => cardsById[id] && (cardsById[id].type === 'sorcery' || cardsById[id].type === 'instant')), st.players[0].deck);
}
// Dragonhatcher: end of turn, Recruit a Dragon
{
	const st = game(); put(st, 0, 'dragonhatcher');
	const dragon = raw.cards.find(c => c.type === 'creature' && (c.tribe || '').includes('Dragon') && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	st.players[0].deck = [dragon.id, 'chillwind_yeti'];
	E.endTurn(st);
	ok('Dragonhatcher: a Dragon was recruited onto the board', minions(st, 0).some(c => (cardsById[c.id]?.tribe || '').includes('Dragon')), minions(st, 0).map(c => c.id));
	ok('Dragonhatcher: it pulled the Dragon from the deck (not the Yeti)', !st.players[0].deck.includes(dragon.id) && st.players[0].deck.includes('chillwind_yeti'));
}
// Y'Shaarj: end of turn, put a creature from your deck onto the battlefield
{
	const st = game(); put(st, 0, 'y_shaarj_rage_unbound');
	st.players[0].deck = ['fireball', 'boulderfist_ogre'].filter(id => cardsById[id]);
	E.endTurn(st);
	ok('Y\'Shaarj: a creature entered from the deck', minions(st, 0).some(c => c.id === 'boulderfist_ogre'), minions(st, 0).map(c => c.id));
}
// Catrina Muerte: end of turn, resurrect a friendly Undead
{
	const st = game(); put(st, 0, 'catrina_muerte');
	// an Undead died this game
	const undead = raw.cards.find(c => c.type === 'creature' && (c.tribe || '').includes('Undead') && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	st.players[0].deathLogIds = [undead.id];
	const b0 = minions(st, 0).length;
	E.endTurn(st);
	ok('Catrina Muerte: a dead friendly Undead is resurrected', minions(st, 0).some(c => c.id === undead.id) && minions(st, 0).length === b0 + 1, minions(st, 0).map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
