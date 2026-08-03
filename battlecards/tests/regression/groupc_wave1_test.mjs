// Group C (cost modification) wave 1 — cost-aura minions (a board minion changes
// the cost of OTHER cards). All reuse the engine's costMod field.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 9) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	return st;
};
const putBoard = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const inHand = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const CRE = (cost, kw) => ({ id: 'tc', name: 'TC', type: 'creature', cost, rarity: 'common', attack: 1, health: 1, keywords: kw || [] });
const SPELL = cost => ({ id: 'ts', name: 'TS', type: 'sorcery', cost, rarity: 'common', effects: [] });

// all 8 wired with costMod
for (const id of ['mana_wraith', 'emerald_hive_queen', 'doomed_apprentice', 'kirin_tor_tricaster', 'armory_mice', 'angel_of_eternal_dawn', 'cloaked_huntress', 'nerub_ar_weblord']) {
	ok(`${id} carries a costMod aura`, cardsById[id].costMod && typeof cardsById[id].costMod.amount === 'number' || cardsById[id].costMod?.setCost != null, id);
}

// Mana Wraith: ALL creatures cost (1) more
{
	const st = game(); putBoard(st, 0, 'mana_wraith');
	ok('Mana Wraith: your creature +1', E.effectiveCost(st, 0, inHand(st, 0, CRE(3))) === 4);
	ok('Mana Wraith: enemy creature +1 too', E.effectiveCost(st, 1, inHand(st, 1, CRE(3))) === 4);
	ok('Mana Wraith: spells unaffected', E.effectiveCost(st, 0, inHand(st, 0, SPELL(3))) === 3);
}
// Emerald Hive Queen: YOUR creatures cost (2) more
{
	const st = game(); putBoard(st, 0, 'emerald_hive_queen');
	ok('Hive Queen: your creature +2', E.effectiveCost(st, 0, inHand(st, 0, CRE(3))) === 5);
	ok('Hive Queen: enemy creature unaffected', E.effectiveCost(st, 1, inHand(st, 1, CRE(3))) === 3);
}
// Doomed Apprentice: your OPPONENTS' spells cost (1) more
{
	const st = game(); putBoard(st, 0, 'doomed_apprentice');
	ok('Doomed Apprentice: enemy spell +1', E.effectiveCost(st, 1, inHand(st, 1, SPELL(3))) === 4);
	ok('Doomed Apprentice: your own spell unaffected', E.effectiveCost(st, 0, inHand(st, 0, SPELL(3))) === 3);
}
// Kirin Tor Tricaster: YOUR spells cost (1) more; keeps Spell Damage +3
{
	const st = game(); const k = putBoard(st, 0, 'kirin_tor_tricaster');
	ok('Kirin Tor: your spell +1', E.effectiveCost(st, 0, inHand(st, 0, SPELL(3))) === 4);
	ok('Kirin Tor: still Spell Damage +3', E.staticValue(st.players[0], 'spell-damage') === 3, E.staticValue(st.players[0], 'spell-damage'));
}
// Armory Mice: your Artifacts cost (1) less
{
	const st = game(); putBoard(st, 0, 'armory_mice');
	ok('Armory Mice: your artifact -1', E.effectiveCost(st, 0, inHand(st, 0, { id: 'ta', name: 'TA', type: 'artifact', cost: 3, rarity: 'common' })) === 2);
	ok('Armory Mice: creatures unaffected', E.effectiveCost(st, 0, inHand(st, 0, CRE(3))) === 3);
}
// Angel of Eternal Dawn: your Enchantments cost (1) more
{
	const st = game(); putBoard(st, 0, 'angel_of_eternal_dawn');
	ok('Angel: your enchantment +1', E.effectiveCost(st, 0, inHand(st, 0, { id: 'te', name: 'TE', type: 'enchantment', cost: 3, rarity: 'common' })) === 4);
}
// Cloaked Huntress: your Secrets cost (0)
{
	const st = game(); putBoard(st, 0, 'cloaked_huntress');
	ok('Cloaked Huntress: your secret costs 0', E.effectiveCost(st, 0, inHand(st, 0, { id: 'tsec', name: 'Tsec', type: 'secret', cost: 3, secret: { on: 'x' }, rarity: 'common' })) === 0);
	ok('Cloaked Huntress: non-secrets unaffected', E.effectiveCost(st, 0, inHand(st, 0, CRE(3))) === 3);
}
// Nerub'ar Weblord: creatures with Battlecry cost (2) more (both sides)
{
	const st = game(); putBoard(st, 0, 'nerub_ar_weblord');
	ok('Weblord: Battlecry creature +2', E.effectiveCost(st, 0, inHand(st, 0, CRE(3, ['battlecry']))) === 5);
	ok('Weblord: non-Battlecry creature unaffected', E.effectiveCost(st, 0, inHand(st, 0, CRE(3))) === 3);
	ok('Weblord: enemy Battlecry creature +2 too', E.effectiveCost(st, 1, inHand(st, 1, CRE(3, ['battlecry']))) === 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
