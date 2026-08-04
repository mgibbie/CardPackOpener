// Wave 25: Staff of Trickery (after hero attacks, Discover a Druid card, -Cost by
// hero Attack) + Harpoon Gun (after hero attacks, Dredge; Beast gets -2 Cost).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass, seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
// swing the hero into the enemy face
const heroSwing = (st) => E.heroAttack(st, 0, { type: 'hero', player: 1 });

for (const id of ['staff_of_trickery', 'harpoon_gun']) ok(`${id} exists`, cardsById[id], id);

// Staff of Trickery: after hero attacks -> Discover a Druid card, reduced by hero Attack
{
	const st = game('druid');
	const w = equip(st, 'staff_of_trickery'); // 1/3 weapon -> hero Attack 1
	ok('equipped Staff of Trickery (hero attack 1)', E.heroAttackValue(st, st.players[0]) === 1, E.heroAttackValue(st, st.players[0]));
	heroSwing(st);
	ok('a Discover was queued after the hero attack', st.pickQueue.length === 1 && st.pickQueue[0].discover, st.pickQueue.length);
	ok('the Discover offers only Druid cards', st.pickQueue[0].ids.every(id => (cardsById[id].cardClass || 'neutral') === 'druid'), st.pickQueue[0].ids.map(id => cardsById[id].cardClass));
	ok('the pick carries -1 Cost (hero Attack was 1)', st.pickQueue[0].costMod === -1, st.pickQueue[0].costMod);
	// resolve it: the discovered card lands in hand at reduced cost
	const chosen = st.pickQueue[0].ids[0];
	const baseCost = cardsById[chosen].cost;
	E.resolvePick(st, chosen);
	const got = st.players[0].hand.find(c => c.id === chosen);
	ok('discovered Druid card in hand', got, chosen);
	ok('its Cost was reduced by hero Attack (1)', got && got.cost === Math.max(0, baseCost - 1), got && [baseCost, got.cost]);
}

// Harpoon Gun: after hero attacks -> Dredge; a dredged Beast gets -2 Cost when drawn
{
	const st = game('hunter');
	equip(st, 'harpoon_gun');
	// stock the bottom of the deck (front of array) with a Beast to dredge
	cardsById.t_beast = { id: 't_beast', name: 'Wolf', type: 'creature', cost: 5, attack: 3, health: 3, tribe: 'Beast' };
	cardsById.t_nonbeast = { id: 't_nonbeast', name: 'Golem', type: 'creature', cost: 5, attack: 3, health: 3 };
	st.players[0].deck = ['t_beast', 't_nonbeast', 't_nonbeast'];
	heroSwing(st);
	ok('a Dredge was queued after the hero attack', st.dredgeQueue.length === 1, st.dredgeQueue.length);
	// choose the Beast
	E.resolveDredge(st, 't_beast');
	ok('a -2 Cost buff was queued for the dredged Beast', (st.players[0].deckIdBuffs || []).some(b => b.id === 't_beast' && b.cost === -2), st.players[0].deckIdBuffs);
	ok('the Beast is now on top of the deck', st.players[0].deck[st.players[0].deck.length - 1] === 't_beast', st.players[0].deck);
	// draw it -> costs 3 (5 - 2)
	E.drawCards(st, 0, 1);
	const drawn = st.players[0].hand.find(c => c.id === 't_beast');
	ok('drawn Beast costs 3 (5 - 2)', drawn && drawn.cost === 3, drawn && drawn.cost);
}
// Harpoon Gun: a dredged NON-Beast gets no cost reduction
{
	const st = game('hunter');
	equip(st, 'harpoon_gun');
	cardsById.t_beast2 = { id: 't_beast2', name: 'Wolf', type: 'creature', cost: 5, attack: 3, health: 3, tribe: 'Beast' };
	cardsById.t_golem = { id: 't_golem', name: 'Golem', type: 'creature', cost: 5, attack: 3, health: 3 };
	st.players[0].deck = ['t_golem', 't_beast2', 't_beast2'];
	heroSwing(st);
	E.resolveDredge(st, 't_golem');
	ok('non-Beast dredge queues no cost buff', !(st.players[0].deckIdBuffs || []).some(b => b.id === 't_golem'), st.players[0].deckIdBuffs);
	E.drawCards(st, 0, 1);
	const drawn = st.players[0].hand.find(c => c.id === 't_golem');
	ok('drawn non-Beast still costs 5', drawn && drawn.cost === 5, drawn && drawn.cost);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
