// Group E wave 4 — condition-awaken sleepers. Stockades Prisoner (play 3 cards),
// Crystalline Statue (draw 4 cards), Dozing Kelpkeeper (cast 5 Mana of spells).
// Each starts Dormant (dormant:99 fallback) and wakes early when its action
// counter fills.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 36) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const putDormant = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cheap = { id: 't_cheap', name: 'Cheap', type: 'sorcery', cost: 0, rarity: 'basic', effects: [{ type: 'armor', value: 0 }] };
cardsById.t_cheap = cheap;
const playCheap = (st, pi) => { const c = E.instantiate(cheap, pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, null, 0); };

// data sanity
ok('Stockades: dormant + card-played need:3 → awaken-self', cardsById.stockades_prisoner.dormant === 99 && cardsById.stockades_prisoner.ongoing?.on === 'card-played' && cardsById.stockades_prisoner.ongoing.need === 3);
ok('Crystalline Statue: dormant + card-drawn need:4', cardsById.crystalline_statue.dormant === 99 && cardsById.crystalline_statue.ongoing?.on === 'card-drawn' && cardsById.crystalline_statue.ongoing.need === 4);
ok('Dozing Kelpkeeper: dormant + spell-played accrue-mana-awaken', cardsById.dozing_kelpkeeper.dormant === 99 && cardsById.dozing_kelpkeeper.ongoing?.on === 'spell-played' && cardsById.dozing_kelpkeeper.ongoing.effects?.[0]?.threshold === 5);

// Stockades Prisoner: wakes after you play 3 cards
{
	const st = game();
	const prisoner = putDormant(st, 0, 'stockades_prisoner');
	ok('Stockades starts Dormant', prisoner.dormantLeft > 0, prisoner.dormantLeft);
	ok('a Dormant minion cannot attack', !E.canAttackWith(st, 0, prisoner));
	playCheap(st, 0); playCheap(st, 0);
	ok('still Dormant after only 2 cards', prisoner.dormantLeft > 0, prisoner.dormantLeft);
	playCheap(st, 0);
	ok('Stockades awakened on the 3rd card played', prisoner.dormantLeft === 0, prisoner.dormantLeft);
}

// Crystalline Statue: wakes after you draw 4 cards
{
	const st = game();
	const statue = putDormant(st, 0, 'crystalline_statue');
	st.players[0].deck = ['chillwind_yeti', 'chillwind_yeti', 'chillwind_yeti', 'chillwind_yeti', 'chillwind_yeti'];
	E.drawCards(st, 0, 3);
	ok('still Dormant after 3 draws', statue.dormantLeft > 0, statue.dormantLeft);
	E.drawCards(st, 0, 1);
	ok('Crystalline Statue awakened on the 4th draw', statue.dormantLeft === 0, statue.dormantLeft);
}

// Dozing Kelpkeeper: wakes after you cast 5 Mana worth of spells
{
	const st = game();
	const kelp = putDormant(st, 0, 'dozing_kelpkeeper');
	cardsById.t_spell3 = { id: 't_spell3', name: 'S3', type: 'sorcery', cost: 3, rarity: 'basic', effects: [{ type: 'armor', value: 1 }] };
	cardsById.t_spell2 = { id: 't_spell2', name: 'S2', type: 'sorcery', cost: 2, rarity: 'basic', effects: [{ type: 'armor', value: 1 }] };
	const cast = (id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };
	cast('t_spell3'); // accrued 3
	ok('still Dormant after 3 Mana of spells', kelp.dormantLeft > 0, [kelp.dormantLeft, kelp._manaAccrued]);
	cast('t_spell2'); // accrued 5
	ok('Dozing Kelpkeeper awakened at 5 Mana of spells', kelp.dormantLeft === 0, [kelp.dormantLeft, kelp._manaAccrued]);
	// it has Rush — once awake it can attack an enemy minion
	const foe = E.instantiate({ id: 'foe', name: 'F', type: 'creature', cost: 2, attack: 1, health: 5 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe); E.recomputeAuras(st);
	ok('awakened Rush Kelpkeeper can attack a minion', E.canAttackWith(st, 0, kelp), kelp.sick);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
