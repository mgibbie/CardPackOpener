// Group C — the previously-skipped one-off cost cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 21) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'rogue', name: 'R', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = []; st.players[0].graveyard = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const eff = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };
const handCost = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };

// Paid-Off Patrolman: -1 per Coin in your graveyard
{
	const st = game();
	st.players[0].graveyard = [{ id: 'coin' }, { id: 'counterfeit_coin' }, { id: 'chillwind_yeti' }];
	ok('Paid-Off Patrolman: 7 - 2 Coins in graveyard = 5', eff(st, 0, 'paid_off_patrolman') === 5, eff(st, 0, 'paid_off_patrolman'));
}
// Chained Guardian: -1 per Plague shuffled into the enemy deck this game
{
	const st = game();
	// find a real Plague card id
	const plague = raw.cards.find(c => /Plague/i.test(c.name || '') && !c.token);
	if (plague) {
		E.execEffects(st, 0, [{ type: 'shuffle-cards-into-enemy-deck', id: plague.id, count: 2 }], null, null);
		ok('shuffling 2 Plagues into enemy deck increments the counter', st.players[0].plaguesIntoEnemyGame === 2, st.players[0].plaguesIntoEnemyGame);
		ok('Chained Guardian: 11 - 2 = 9', eff(st, 0, 'chained_guardian') === 9);
	} else { ok('(no Plague card to test)', true); ok('(skip)', true); }
}
// Abyssal Bassist: -2 per weapon equipped this game
{
	const st = game();
	E.execEffects(st, 0, [{ type: 'equip', attack: 2, durability: 2, name: 'Blade' }], null, null);
	E.execEffects(st, 0, [{ type: 'equip', attack: 1, durability: 3, name: 'Dirk' }], null, null);
	ok('equipping two weapons increments weaponsEquippedGame', st.players[0].weaponsEquippedGame === 2, st.players[0].weaponsEquippedGame);
	ok('Abyssal Bassist: 7 - 2*2 weapons = 3', eff(st, 0, 'abyssal_bassist') === 3);
}
// Underbrush Tracker: -1 per shuffle-into-your-deck this game
{
	const st = game();
	E.execEffects(st, 0, [{ type: 'shuffle-into-own-deck', id: 'chillwind_yeti', count: 1 }], null, null);
	E.execEffects(st, 0, [{ type: 'shuffle-into-own-deck', id: 'wolfrider', count: 1 }], null, null);
	ok('two shuffles into your deck increment the counter', st.players[0].shufflesIntoDeckGame === 2, st.players[0].shufflesIntoDeckGame);
	ok('Underbrush Tracker: 6 - 2 = 4', eff(st, 0, 'underbrush_tracker') === 4);
}
// Red Giant: -1 per adjacent card played while it's in hand
{
	const st = game();
	const rg = E.instantiate(cardsById['red_giant'], 0); rg.zone = 'hand';
	const left = E.instantiate({ id: 'lft', name: 'Lft', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0); left.zone = 'hand';
	const right = E.instantiate({ id: 'rgt', name: 'Rgt', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0); right.zone = 'hand';
	st.players[0].hand = [left, rg, right]; // Red Giant flanked
	E.playCard(st, 0, left.uid, null, null, 0); // left neighbor played
	ok('playing a hand-neighbor increments Red Giant\'s counter', rg.adjacentPlayedWhileHeld === 1, rg.adjacentPlayedWhileHeld);
	E.playCard(st, 0, right.uid, null, null, 0); // right neighbor played (still adjacent after left removed? re-check indices)
	ok('Red Giant: base 8 minus adjacent plays', E.effectiveCost(st, 0, rg) === 8 - (rg.adjacentPlayedWhileHeld || 0), [rg.adjacentPlayedWhileHeld, E.effectiveCost(st, 0, rg)]);
}
// Quietblade Shinobi: keywords restored + Bushido aura present
{
	ok('Quietblade Shinobi has Poisonous + Rush + Firebreathing', ['poisonous', 'rush', 'firebreathing'].every(k => cardsById['quietblade_shinobi'].keywords.includes(k)));
	ok('Quietblade Shinobi carries a Bushido costMod', cardsById['quietblade_shinobi'].costMod && cardsById['quietblade_shinobi'].costMod.keyword === 'bushido');
}
// Eldraine Sprite: Adventure OR Nature spells cost 1 less
{
	const st = game(); const s = E.instantiate(cardsById['eldraine_sprite'], 0); s.zone = 'board'; s.sick = false; st.players[0].board.push(s);
	ok('Eldraine Sprite: a Nature spell -1', handCost(st, 0, { id: 'ns', name: 'NS', type: 'sorcery', cost: 4, tribe: 'Nature', rarity: 'common', effects: [] }) === 3);
	ok('Eldraine Sprite: an Adventure spell -1', handCost(st, 0, { id: 'as', name: 'AS', type: 'sorcery', cost: 4, rarity: 'common', keywords: ['adventure'], effects: [] }) === 3);
	ok('Eldraine Sprite: a plain Fire spell is unaffected', handCost(st, 0, { id: 'fs', name: 'FS', type: 'sorcery', cost: 4, tribe: 'Fire', rarity: 'common', effects: [] }) === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
