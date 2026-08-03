// Group C (cost modification) wave 8 — the odd auras + two more counter cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 17) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'druid', name: 'D', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const handCost = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };
const eff = (st, pi, id) => handCost(st, pi, cardsById[id]);

ok('razorscale carries a cost-floor static', cardsById['razorscale'].static && cardsById['razorscale'].static.type === 'cost-floor');
ok('customs_enforcer carries a foreignOnly costMod', cardsById['customs_enforcer'].costMod && cardsById['customs_enforcer'].costMod.foreignOnly);
ok('mulchmuncher / devout_pupil carry selfCost', cardsById['mulchmuncher'].selfCost && cardsById['devout_pupil'].selfCost);

// Razorscale: cards can't cost less than (2)
{
	const st = game(); put(st, 0, 'razorscale');
	ok('Razorscale: a 1-cost card is floored to 2', handCost(st, 0, { id: 'c1', name: 'c1', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }) === 2);
	ok('Razorscale: a 5-cost card is unaffected', handCost(st, 0, { id: 'c5', name: 'c5', type: 'creature', cost: 5, rarity: 'common', attack: 1, health: 1 }) === 5);
	// a card discounted below 2 is still floored to 2
	st.players[0].nextCardsDiscount = { count: 1, amount: 5 };
	ok('Razorscale: a heavily-discounted card still costs at least 2', handCost(st, 0, { id: 'c3', name: 'c3', type: 'creature', cost: 3, rarity: 'common', attack: 1, health: 1 }) === 2);
}

// Customs Enforcer: enemy cards that didn't start in their deck cost (2) more
{
	const st = game(); put(st, 0, 'customs_enforcer');
	const foreign = { id: 'fc', name: 'FC', type: 'creature', cost: 3, rarity: 'common', attack: 1, health: 1 }; // fromDeck falsy -> foreign
	ok('Customs Enforcer: enemy foreign card +2', handCost(st, 1, foreign) === 5, handCost(st, 1, foreign));
	const owned = E.instantiate(foreign, 1); owned.zone = 'hand'; owned.fromDeck = true; st.players[1].hand.push(owned);
	ok('Customs Enforcer: an enemy card that started in their deck is unaffected', E.effectiveCost(st, 1, owned) === 3);
	ok('Customs Enforcer: YOUR own foreign cards are unaffected', handCost(st, 0, { id: 'fc2', name: 'FC2', type: 'creature', cost: 3, rarity: 'common', attack: 1, health: 1 }) === 3);
}

// Mulchmuncher: -1 per friendly Treant that died this game
{
	const st = game();
	const mk = () => { const t = E.instantiate({ id: 'tr', name: 'Treant', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Treant', attack: 2, health: 1 }, 0); t.zone = 'board'; st.players[0].board.push(t); return t; };
	const a = mk(), b = mk();
	a.damage = a.maxHealth; b.damage = b.maxHealth; E.sweepDeaths(st);
	ok('two friendly Treants died -> tribeDiedGame.Treant = 2', (st.players[0].tribeDiedGame || {}).Treant === 2, JSON.stringify(st.players[0].tribeDiedGame));
	ok('Mulchmuncher: 9 - 2 dead Treants = 7', eff(st, 0, 'mulchmuncher') === 7, eff(st, 0, 'mulchmuncher'));
}

// Devout Pupil: -1 per spell cast on a friendly character this game
{
	const st = game(); st.players[0].spellsOnFriendly = ['s1', 's2', 's3'];
	ok('Devout Pupil: 6 - 3 spells on friendlies = 3', eff(st, 0, 'devout_pupil') === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
