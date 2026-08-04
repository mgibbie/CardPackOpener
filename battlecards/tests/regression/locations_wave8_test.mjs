// Wave 37 (locations): Amirdrassil — summon a 1-Cost minion, gain 1 Armor, draw 1,
// refresh 1 Mana Crystal; every value improves by 1 for each previous use.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_fill = { id: 't_fill', name: 'Fill', type: 'creature', cost: 1, attack: 1, health: 1 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'druid', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.armor = 0; }
	st.players[0].heroClass = 'druid'; st.players[0].mana.max = 10; st.players[0].deck = Array(20).fill('t_fill');
	return st;
};
const placeLoc = (st) => { const c = E.instantiate(cardsById.amirdrassil, 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const untap = (loc) => { loc.tapped = false; loc.tapStone = false; };
const lastSummon = (st) => { const cr = st.players[0].board.filter(c => c.type === 'creature'); return cr[cr.length - 1]; };

ok('amirdrassil exists', cardsById.amirdrassil);

// First use (improve 0): 1-Cost minion, +1 Armor, draw 1, refresh 1
{
	const st = game();
	const loc = placeLoc(st);
	st.players[0].mana.cur = 0;
	const handBefore = st.players[0].hand.length;
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('first use: gained 1 Armor', st.players[0].armor === 1, st.players[0].armor);
	ok('first use: drew 1 card', st.players[0].hand.length === handBefore + 1, [handBefore, st.players[0].hand.length]);
	ok('first use: refreshed 1 Mana Crystal', st.players[0].mana.cur === 1, st.players[0].mana.cur);
	ok('first use: summoned a 1-Cost minion', cardsById[lastSummon(st).id].cost === 1, lastSummon(st) && cardsById[lastSummon(st).id].cost);
	ok('improveCount incremented to 1', loc.improveCount === 1, loc.improveCount);
}

// Second use (improve 1): 2-Cost minion, +2 Armor (total 3), draw 2, refresh 2
{
	const st = game();
	const loc = placeLoc(st);
	st.players[0].mana.cur = 0;
	E.tapLand(st, 0, loc.uid, 0, null); // use 1
	untap(loc);
	st.players[0].mana.cur = 0;
	const handBefore = st.players[0].hand.length;
	E.tapLand(st, 0, loc.uid, 0, null); // use 2 (improved)
	ok('second use: +2 Armor (total 1 + 2 = 3)', st.players[0].armor === 3, st.players[0].armor);
	ok('second use: drew 2 cards', st.players[0].hand.length === handBefore + 2, [handBefore, st.players[0].hand.length]);
	ok('second use: refreshed 2 Mana Crystals', st.players[0].mana.cur === 2, st.players[0].mana.cur);
	ok('second use: summoned a 2-Cost minion', cardsById[lastSummon(st).id].cost === 2, lastSummon(st) && cardsById[lastSummon(st).id].cost);
}

// Durability limits it to 3 uses; improveCount tracks across them
{
	const st = game();
	const loc = placeLoc(st);
	for (let i = 0; i < 3; i++) { if (!st.players[0].board.includes(loc) || loc.durability <= 0) break; untap(loc); st.players[0].mana.cur = 0; E.tapLand(st, 0, loc.uid, 0, null); }
	ok('improveCount reached 3 after 3 uses', loc.improveCount === 3, loc.improveCount);
	ok('durability spent to 0 (worn out)', loc.durability <= 0, loc.durability);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
