// Group D (turn triggers) wave 5 — token-makers + Maw and Paw's Corpse cycle.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 25) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'deathknight', name: 'D', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');
const roundTrip = st => { E.endTurn(st); E.endTurn(st); };

ok('acidspitter_nest turn-end ongoing', cardsById['acidspitter_nest'].ongoing?.on === 'turn-end');
ok('scout_s_nest turn-start ongoing', cardsById['scout_s_nest'].ongoing?.on === 'turn-start');
ok('voronei_recruiter turn-end ongoing', cardsById['voronei_recruiter'].ongoing?.on === 'turn-end');
ok('maw_and_paw carries two ongoings', Array.isArray(cardsById['maw_and_paw'].ongoings) && cardsById['maw_and_paw'].ongoings.length === 2);

// Acidspitter's Nest: end of turn, create two Acidspitters on board
{
	const st = game(); put(st, 0, 'acidspitter_nest');
	E.endTurn(st);
	ok('Acidspitter\'s Nest: two Acidspitters summoned', st.players[0].board.filter(c => c.id === 'acidspitter').length === 2, minions(st, 0).map(c => c.id));
}
// Scout's Nest: start of turn, add two Scurrying Scouts to hand
{
	const st = game(); put(st, 0, 'scout_s_nest');
	roundTrip(st);
	ok('Scout\'s Nest: two Scurrying Scouts in hand', st.players[0].hand.filter(c => c.id === 'scurrying_scout').length === 2, st.players[0].hand.map(c => c.id));
}
// Voronei Recruiter: end of turn, get a 4/4 Crewmate with a random Bonus Effect
{
	const st = game(); put(st, 0, 'voronei_recruiter');
	E.endTurn(st);
	const cm = st.players[0].hand.find(c => c.name === 'Crewmate');
	ok('Voronei: a 4/4 Crewmate is in hand', cm && cm.attack >= 4 && E.hp(cm) >= 4, cm && [cm.attack, E.hp(cm)]); // base 4/4, a stat Dark Gift can raise it
	ok('Voronei: the Crewmate carries a Bonus Effect (Dark Gift)', cm && cm._darkGift, cm && cm._darkGift);
}
// Maw and Paw: end of turn gain 5 Corpses; start of your NEXT turn, spend 5 to heal 5
{
	const st = game(); st.players[0].deck = ['wolfrider', 'wolfrider']; st.players[1].deck = ['wolfrider', 'wolfrider']; // avoid fatigue
	put(st, 0, 'maw_and_paw'); st.players[0].corpses = 0; st.players[0].life = 20;
	E.endTurn(st); // end of your turn -> +5 Corpses
	ok('Maw and Paw: +5 Corpses at end of turn', st.players[0].corpses === 5, st.players[0].corpses);
	E.endTurn(st); // opponent's turn ends -> your turn starts -> spend 5 Corpses, heal 5
	ok('Maw and Paw: at your next turn start, spent 5 Corpses and healed 5 (20 -> 25, corpses 0)', st.players[0].life === 25 && st.players[0].corpses === 0, [st.players[0].life, st.players[0].corpses]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
