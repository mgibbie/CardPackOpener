// Group D (turn triggers) wave 10 — Blood of the Ancient One merge + Primordial
// Acolyte hand-spell transform.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 30) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');

ok('the_ancient_one token exists (30/30)', cardsById['the_ancient_one'] && cardsById['the_ancient_one'].attack === 30 && cardsById['the_ancient_one'].health === 30);
ok('blood_of_the_ancient_one turn-end ongoing', cardsById['blood_of_the_ancient_one'].ongoing?.on === 'turn-end');
ok('primordial_acolyte turn-end ongoing (keeps Divine Shield)', cardsById['primordial_acolyte'].ongoing?.on === 'turn-end' && cardsById['primordial_acolyte'].keywords.includes('divine_shield'));

// Blood of the Ancient One: two of them at end of turn merge into The Ancient One
{
	const st = game(); put(st, 0, 'blood_of_the_ancient_one'); put(st, 0, 'blood_of_the_ancient_one');
	E.endTurn(st);
	ok('two Bloods merged into a single 30/30 The Ancient One', minions(st, 0).length === 1 && minions(st, 0)[0].id === 'the_ancient_one' && minions(st, 0)[0].attack === 30, minions(st, 0).map(c => c.id));
}
// only ONE -> no merge
{
	const st = game(); const b = put(st, 0, 'blood_of_the_ancient_one');
	E.endTurn(st);
	ok('a single Blood does not merge', minions(st, 0).length === 1 && minions(st, 0)[0].id === 'blood_of_the_ancient_one', minions(st, 0).map(c => c.id));
}
// Primordial Acolyte: end of turn, transform the lowest-cost hand spell into one costing 1 more
{
	const st = game(); put(st, 0, 'primordial_acolyte');
	const s2 = E.instantiate({ id: 'sp2', name: 'Sp2', type: 'sorcery', cost: 2, rarity: 'common', effects: [] }, 0); s2.zone = 'hand';
	const s5 = E.instantiate({ id: 'sp5', name: 'Sp5', type: 'sorcery', cost: 5, rarity: 'common', effects: [] }, 0); s5.zone = 'hand';
	st.players[0].hand = [s2, s5];
	E.endTurn(st);
	const morph = st.players[0].hand.find(c => c.uid === s2.uid);
	ok('Primordial Acolyte: the 2-cost spell became a random 3-cost spell', morph && morph.id !== 'sp2' && (cardsById[morph.id]?.cost === 3) && (morph.type === 'sorcery' || morph.type === 'instant'), morph && [morph.id, morph.cost]);
	ok('Primordial Acolyte: the higher-cost spell is untouched', st.players[0].hand.some(c => c.uid === s5.uid && c.id === 'sp5'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
