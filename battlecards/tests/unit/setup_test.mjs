// setup_test.mjs — engine/setup.js narrow out-of-band APIs (PR 15).
//
// These replace game.js's direct player-object writes (dungeon boot, duel
// guest setup, treasure application). Each test mirrors a real game.js call.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- resetDeckAndHand: boss/guest encounter boot ---
{
	const state = E.createGame(byId, seededRng(1), null, 2);
	const ids = ['murloc_raider', 'river_crocolisk', 'chillwind_yeti', 'fireball', 'polymorph'];
	E.resetDeckAndHand(state, 1, ids);
	const p = state.players[1];
	ok('deck replaced with the given ids (shuffled)', p.deck.length === 5
		&& [...p.deck].sort().join() === [...ids].sort().join());
	ok('hand emptied', p.hand.length === 0);
	ok('input array not consumed', ids.length === 5);
	E.drawCards(state, 1, 4);
	ok('boot draw works on the fresh deck', p.hand.length === 4 && p.deck.length === 1);
	ok('validator clean after boot', validateGameState(state).length === 0);
}
// --- applyHeroMods: allow-listed writes, loud on typos ---
{
	const state = E.createGame(byId, seededRng(2), null, 2);
	E.applyHeroMods(state, 1, { life: 25, maxLife: 25 });
	ok('vitals set (dungeon boss HP)', state.players[1].life === 25 && state.players[1].maxLife === 25);
	E.applyHeroMods(state, 1, { battlecriesTwice: true, deathrattlesTwice: true });
	ok('boss passives set', state.players[1].battlecriesTwice === true && state.players[1].deathrattlesTwice === true);
	let threw = null;
	try { E.applyHeroMods(state, 0, { lief: 10 }); } catch (e) { threw = e.message; }
	ok('unknown field throws (no silent pokes)', !!threw && threw.includes('lief'), threw);
}
// --- addManaCrystal: Crystal Gem ---
{
	const state = E.createGame(byId, seededRng(3), null, 2);
	const { cur, max } = state.players[0].mana;
	E.addManaCrystal(state, 0);
	ok('crystal gem: +1 current and max', state.players[0].mana.cur === cur + 1 && state.players[0].mana.max === max + 1);
}
// --- grantEmblem: treasure emblems participate in auras/costMods/statics ---
{
	const { state } = new Scenario(byId)
		.def('t_grunt', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_spell', { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] })
		.board(0, ['t_grunt']).hand(0, ['t_spell'])
		.run();
	const flag = E.grantEmblem(state, 0, { id: 'captured_flag', name: 'Captured Flag', aura: { attack: 1, health: 1 } });
	ok('emblem granted with a numeric engine uid', typeof flag.uid === 'number' && state.players[0].emblems.includes(flag));
	ok('aura emblem radiates immediately (recompute ran)', state.players[0].board[0].attack === 2);
	E.grantEmblem(state, 0, { id: 'khadgars_scrying_orb', costMod: { cardType: 'spell', amount: -1, scope: 'own' } });
	ok('costMod emblem discounts spells', E.effectiveCost(state, 0, state.players[0].hand[0]) === 2);
	E.grantEmblem(state, 0, { id: 'robe_of_the_magi', static: { type: 'spell-damage', value: 3 } });
	ok('static emblem counts in staticValue', E.staticValue(state.players[0], 'spell-damage') === 3);
	ok('validator clean with emblems in play', validateGameState(state).length === 0);
}
// --- capHeroPowerCost: Justicar's Ring ---
{
	const state = E.createGame(byId, seededRng(4), null, 2, [{ id: 'mage', name: 'Mage', power: { name: 'Fireblast', cost: 2, effects: [{ type: 'damage', value: 1, target: 'any' }], text: 'Deal 1 damage.' } }, null]);
	E.capHeroPowerCost(state, 0, 1);
	ok('hero power capped at 1', state.players[0].heroPowers.every(hp => hp.power.cost <= 1));
	// a cheaper power is never raised
	state.players[0].heroPowers[0].power.cost = 0;
	E.capHeroPowerCost(state, 0, 1);
	ok('cap never raises a cheaper power', state.players[0].heroPowers[0].power.cost === 0);
}
// --- stripLoadouts: dungeon fights hide the western zones ---
{
	const state = E.createGame(byId, seededRng(5), null, 2);
	state.players[0].companion = { id: 'x' };
	state.players[1].command = [{ id: 'y' }];
	E.stripLoadouts(state);
	ok('companions and command zones cleared for all players',
		state.players.every(p => p.companion === null && p.command.length === 0));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
