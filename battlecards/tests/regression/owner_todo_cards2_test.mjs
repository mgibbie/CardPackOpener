// Second batch of card changes filed from the wiki's owner inbox (owner_todo),
// applied 2026-08-31.
//
//   Alpine Grizzly   -> tribe Bear -> Beast
//   Kalonian Tusker  -> 2/3 Beast for 2 with "Battlecry: Adapt twice."
//   Ghalta           -> tribe Elder Dinosaur -> Beast; clearer cost wording
//
// The previous batch shipped a Deathrattle that looked right in JSON and did
// nothing at run time (see owner_todo_cards_test.mjs), so the two mechanical
// claims here are EXECUTED: Kalonian Tusker's battlecry has to actually queue
// two Adapt offers on itself, and Ghalta's discount has to actually come off
// its cost. Ghalta's wording change is only cosmetic, but it asserts "total
// Attack" is what the engine really sums, so the text can't drift from the code.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const play = (st, id) => {
	const c = E.instantiate(cardsById[id], 0);
	c.zone = 'hand'; st.players[0].hand.push(c);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, c.uid, null, null, 0);
	return c;
};

// ---------- Alpine Grizzly ----------
{
	const c = cardsById.alpine_grizzly;
	ok('Alpine Grizzly is a Beast', c.tribe === 'Beast', c.tribe);
	ok('nothing else about it moved', c.cost === 3 && c.attack === 4 && c.health === 2
		&& (c.keywords || []).includes('rush'), JSON.stringify([c.cost, c.attack, c.health, c.keywords]));
}

// ---------- Kalonian Tusker ----------
{
	const c = cardsById.kalonian_tusker;
	ok('Kalonian Tusker is a 2/3 for 2', c.cost === 2 && c.attack === 2 && c.health === 3,
		`${c.cost}: ${c.attack}/${c.health}`);
	ok('Kalonian Tusker is a Beast', c.tribe === 'Beast', c.tribe);
	ok('it is a Battlecry now, not Trample',
		(c.keywords || []).includes('battlecry') && !(c.keywords || []).includes('trample'), JSON.stringify(c.keywords));
	ok('reads "Battlecry: Adapt twice."', c.description === 'Battlecry: Adapt twice.', c.description);

	// the battlecry has to actually offer TWO adaptations, on the Tusker itself
	const st = game();
	const tusker = play(st, 'kalonian_tusker');
	const offers = st.pickQueue.filter(q => q.mode === 'adapt');
	ok('playing it queues two Adapt offers', offers.length === 2, `queued ${offers.length}`);
	ok('both adapt the Tusker itself',
		offers.every(o => (o.adaptUids || []).includes(tusker.uid)),
		JSON.stringify(offers.map(o => o.adaptUids)));
	ok('each offer is a choice of three', offers.every(o => (o.ids || []).length === 3),
		JSON.stringify(offers.map(o => o.ids)));

	// and resolving them actually changes the creature
	const snap = JSON.stringify([tusker.attack, tusker.maxHealth, [...(tusker.keywords || [])].sort()]);
	let guard = 0;
	while (st.pickQueue.some(q => q.mode === 'adapt') && guard++ < 5) {
		const q = st.pickQueue.find(x => x.mode === 'adapt');
		E.resolvePick(st, q.player, q.ids[0]);
	}
	const after = JSON.stringify([tusker.attack, tusker.maxHealth, [...(tusker.keywords || [])].sort()]);
	ok('resolving the Adapts changes the creature', after !== snap, `${snap} -> ${after}`);
	ok('the adapt queue drained', !st.pickQueue.some(q => q.mode === 'adapt'));
}

// ---------- Ghalta ----------
{
	const c = cardsById.ghalta;
	ok('Ghalta is a Beast', c.tribe === 'Beast', c.tribe);
	ok('Ghalta keeps Trample', (c.keywords || []).includes('trample'));
	ok('Ghalta still discounts off board power',
		c.selfCost?.per === 'board-power' && c.selfCost.amount === -1, JSON.stringify(c.selfCost));
	ok('its text describes total Attack', /total Attack among creatures you control/.test(c.description), c.description);

	// the wording says "total Attack" — prove that is what the engine sums, so a
	// future retune of the mechanic can't leave the text lying
	const st = game();
	cardsById.t_fatty = { id: 't_fatty', name: 'Fatty', type: 'creature', cost: 1, attack: 5, health: 1 };
	const base = E.effectiveCost ? E.effectiveCost(st, 0, E.instantiate(cardsById.ghalta, 0)) : null;
	for (let i = 0; i < 2; i++) { const m = E.instantiate(cardsById.t_fatty, 0); m.zone = 'board'; st.players[0].board.push(m); }
	const g = E.instantiate(cardsById.ghalta, 0); g.zone = 'hand'; st.players[0].hand.push(g);
	const cost = E.effectiveCost ? E.effectiveCost(st, 0, g) : null;
	if (cost != null) {
		// 10 total Attack on board => 12 - 10 = 2
		ok('10 Attack on board discounts Ghalta from 12 to 2', cost === 2, `cost ${cost} (base ${base})`);
	} else {
		ok('effectiveCost is exported for the discount check', false, 'no effectiveCost export');
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
