// duels_treasures_test.mjs — Hearthstone Duels active-treasure imports, batch 1.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const IDS = ['duels_earth_invocation', 'duels_fire_invocation', 'duels_lightning_invocation', 'duels_cursed_curio', 'duels_blood_moon', 'duels_veterans_militia_horn', 'duels_supercharge', 'duels_mage_armor', 'duels_pure_cold', 'duels_hefty_sack_of_coins', 'duels_astral_portal', 'duels_bag_of_coins'];
ok('all 12 batch-1 treasures present + tagged', IDS.every(id => byId[id] && byId[id].treasure && byId[id].token && byId[id].set === 'DUELS'), IDS.filter(id => !byId[id]));

// Earth Invocation: two 2/3 Elementals with Taunt
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_earth_invocation']).play(0, 'duels_earth_invocation').run();
	const el = state.players[0].board.filter(c => c.name === 'Elemental');
	ok('Earth Invocation: two 2/3 Taunt Elementals', el.length === 2 && el.every(c => c.attack === 2 && E.hp(c) === 3 && c.keywords.includes('taunt')), el.length);
}
// Fire Invocation: 6 to enemy hero
{
	const { state } = new Scenario(byId).mana(0, 10).life(1, 30).hand(0, ['duels_fire_invocation']).play(0, 'duels_fire_invocation').run();
	ok('Fire Invocation: 6 to enemy hero', state.players[1].life === 24, state.players[1].life);
}
// Lightning Invocation: 2 to all enemy creatures
{
	const { state } = new Scenario(byId).def('t_e', { type: 'creature', cost: 2, attack: 2, health: 5 })
		.mana(0, 10).board(1, ['t_e', 't_e']).hand(0, ['duels_lightning_invocation']).play(0, 'duels_lightning_invocation').run();
	ok('Lightning Invocation: 2 to all enemy creatures', state.players[1].board.every(c => c.damage === 2), state.players[1].board.map(c => c.damage));
}
// Cursed Curio: three 3/3 Ghosts with Lifesteal
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_cursed_curio']).play(0, 'duels_cursed_curio').run();
	const g = state.players[0].board.filter(c => c.name === 'Ghost');
	ok('Cursed Curio: three 3/3 Lifesteal Ghosts', g.length === 3 && g.every(c => c.keywords.includes('lifesteal')), g.length);
}
// Blood Moon: your creatures +1/+1 and Lifesteal
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_m']).hand(0, ['duels_blood_moon']).play(0, 'duels_blood_moon').run();
	const m = state.players[0].board[0];
	ok('Blood Moon: +1/+1 & Lifesteal', m.attack === 3 && E.hp(m) === 3 && m.keywords.includes('lifesteal'), `${m.attack}/${E.hp(m)} ${m.keywords}`);
}
// Veteran's Militia Horn: +4/+4, Taunt, Divine Shield
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_m']).hand(0, ['duels_veterans_militia_horn']).play(0, 'duels_veterans_militia_horn').run();
	const m = state.players[0].board[0];
	ok("Veteran's Militia Horn: +4/+4 + Taunt + Divine Shield", m.attack === 6 && E.hp(m) === 6 && m.keywords.includes('taunt') && m.shield, `${m.attack}/${E.hp(m)} ${m.keywords} shield=${m.shield}`);
}
// Supercharge: +2 Health
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_m']).hand(0, ['duels_supercharge']).play(0, 'duels_supercharge').run();
	const m = state.players[0].board[0];
	ok('Supercharge: +2 Health', m.attack === 2 && E.hp(m) === 4, `${m.attack}/${E.hp(m)}`);
}
// Mage Armor: 10 Armor
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_mage_armor']).play(0, 'duels_mage_armor').run();
	ok('Mage Armor: gain 10 Armor', state.players[0].armor === 10, state.players[0].armor);
}
// Pure Cold: 8 to enemy hero
{
	const { state } = new Scenario(byId).mana(0, 10).life(1, 30).hand(0, ['duels_pure_cold']).play(0, 'duels_pure_cold').run();
	ok('Pure Cold: 8 to enemy hero', state.players[1].life === 22, state.players[1].life);
}
// Hefty Sack of Coins: three summoned creatures
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_hefty_sack_of_coins']).play(0, 'duels_hefty_sack_of_coins').run();
	ok('Hefty Sack of Coins: summons three creatures', state.players[0].board.filter(c => c.type === 'creature').length === 3, state.players[0].board.length);
}
// Astral Portal: a random Legendary creature
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_astral_portal']).play(0, 'duels_astral_portal').run();
	const b = state.players[0].board.filter(c => c.type === 'creature');
	ok('Astral Portal: summons a Legendary creature', b.length === 1 && byId[b[0].id]?.rarity === 'legendary', b.map(c => c.id + ':' + byId[c.id]?.rarity));
}
// Bag of Coins: 3 Coin cards added to hand
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_bag_of_coins']).play(0, 'duels_bag_of_coins').run();
	ok('Bag of Coins: 3 Coins in hand', state.players[0].hand.filter(c => c.id === 'coin').length === 3, state.players[0].hand.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
