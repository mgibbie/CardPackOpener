// Group C (cost modification) wave 6 — "first/every-Nth X each turn costs N",
// filter-aware costMod.firstEachTurn / new costMod.everyN.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 15) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].cardsPlayedThisTurnIds = []; st.players[1].cardsPlayedThisTurnIds = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const cost = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };
// real ids to seed the "played this turn" log (costMod reads state.cardsById[id])
const realId = pred => (raw.cards.find(c => pred(c) && !c.token && c.collectible !== false) || {}).id;
const someSecret = realId(c => c.type === 'secret');
const someSpell = realId(c => c.type === 'sorcery' && !(c.colors && c.colors.length));
const someCreature = realId(c => c.type === 'creature' && !(c.colors && c.colors.length));
const someTaunt = realId(c => c.type === 'creature' && (c.keywords || []).includes('taunt') && !(c.colors && c.colors.length));
const someDragon = realId(c => c.type === 'creature' && (c.tribe || '').includes('Dragon') && !(c.colors && c.colors.length));

const SECRET = { id: 'sq', name: 'SQ', type: 'secret', cost: 3, rarity: 'common', secret: { on: 'x' } };
const TAUNTC = { id: 'tq', name: 'TQ', type: 'creature', cost: 5, rarity: 'common', attack: 1, health: 1, keywords: ['taunt'] };
const DRAGONC = { id: 'dq', name: 'DQ', type: 'creature', cost: 6, rarity: 'common', attack: 1, health: 1, tribe: 'Dragon' };
const SPELL = { id: 'spq', name: 'SpQ', type: 'sorcery', cost: 4, rarity: 'common', effects: [] };
const CRE = { id: 'cq', name: 'CQ', type: 'creature', cost: 4, rarity: 'common', attack: 1, health: 1 };

for (const id of ['game_master', 'razormane_battleguard', 'naralex_herald_of_the_flights', 'duskfallen_aviana', 'marooned_archmage', 'kael_thas_sunstrider', 'kael_thas_sinstrider'])
	ok(`${id} carries costMod`, cardsById[id].costMod, id);

// Game Master: first Secret each turn costs 1
{ const st = game(); put(st, 0, 'game_master'); ok('Game Master: first secret costs 1', cost(st, 0, SECRET) === 1); st.players[0].cardsPlayedThisTurnIds = [someSecret]; ok('Game Master: a later secret is full price', cost(st, 0, SECRET) === 3); }
// Razormane Battleguard: first Taunt creature each turn costs (2) less
{ const st = game(); put(st, 0, 'razormane_battleguard'); ok('Razormane: first Taunt creature -2 (5->3)', cost(st, 0, TAUNTC) === 3); ok('Razormane: a NON-Taunt creature is unaffected', cost(st, 0, CRE) === 4); st.players[0].cardsPlayedThisTurnIds = [someTaunt]; ok('Razormane: a later Taunt creature is full price', cost(st, 0, TAUNTC) === 5); }
// Naralex: first Dragon each turn costs (1)
{ const st = game(); put(st, 0, 'naralex_herald_of_the_flights'); ok('Naralex: first Dragon costs 1', cost(st, 0, DRAGONC) === 1); if (someDragon) { st.players[0].cardsPlayedThisTurnIds = [someDragon]; ok('Naralex: a later Dragon is full price', cost(st, 0, DRAGONC) === 6); } else ok('(no real Dragon id to seed)', true); }
// Duskfallen Aviana: on each player's turn, the first card played costs (0)
{
	const st = game(); put(st, 0, 'duskfallen_aviana');
	ok('Duskfallen: your first card costs 0', cost(st, 0, SPELL) === 0);
	ok('Duskfallen: the OPPONENT\'s first card also costs 0 (each player)', cost(st, 1, CRE) === 0);
	st.players[0].cardsPlayedThisTurnIds = [someSpell];
	ok('Duskfallen: your second card is full price', cost(st, 0, SPELL) === 4);
}
// Marooned Archmage: first spell each turn costs (2) less
{ const st = game(); put(st, 0, 'marooned_archmage'); ok('Marooned Archmage: first spell -2 (4->2)', cost(st, 0, SPELL) === 2); st.players[0].cardsPlayedThisTurnIds = [someSpell]; ok('Marooned Archmage: a later spell is full price', cost(st, 0, SPELL) === 4); }
// Kael'thas Sunstrider: every third spell you cast each turn costs (1)
{
	const st = game(); put(st, 0, 'kael_thas_sunstrider');
	ok('Kaelthas: 1st spell is NOT cheap', cost(st, 0, SPELL) === 4);
	st.players[0].cardsPlayedThisTurnIds = [someSpell, someSpell];
	ok('Kaelthas: the 3rd spell costs 1', cost(st, 0, SPELL) === 1);
	st.players[0].cardsPlayedThisTurnIds = [someSpell, someSpell, someSpell];
	ok('Kaelthas: the 4th spell is NOT cheap', cost(st, 0, SPELL) === 4);
}
// Kael'thas Sinstrider: every third creature you play each turn costs (0)
{ const st = game(); put(st, 0, 'kael_thas_sinstrider'); st.players[0].cardsPlayedThisTurnIds = [someCreature, someCreature]; ok('Sinstrider: the 3rd creature costs 0', cost(st, 0, CRE) === 0); ok('Sinstrider: spells are unaffected', cost(st, 0, SPELL) === 4); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
