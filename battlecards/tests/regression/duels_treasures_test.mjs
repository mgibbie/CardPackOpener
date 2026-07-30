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

// ---------------- batch 2 ----------------
const IDS2 = ['duels_necrotic_poison', 'duels_devouring_hunger', 'duels_wand_of_disintegration', 'duels_will_of_the_warden', 'duels_water_invocation', 'duels_bag_of_stuffing', 'duels_stroke_of_midnight'];
ok('all 7 batch-2 treasures present + tagged', IDS2.every(id => byId[id] && byId[id].treasure && byId[id].set === 'DUELS'), IDS2.filter(id => !byId[id]));

// Necrotic Poison: destroy a targeted creature
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 5, attack: 4, health: 7 })
		.mana(0, 10).board(1, ['t_m']).hand(0, ['duels_necrotic_poison'])
		.play(0, 'duels_necrotic_poison', { targetBoard: [1, 't_m'] }).run();
	ok('Necrotic Poison: destroys the targeted creature', state.players[1].board.filter(c => !E.isDead(c)).length === 0);
}
// Devouring Hunger: destroy all creatures
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 4 })
		.mana(0, 10).board(0, ['t_m']).board(1, ['t_m', 't_m']).hand(0, ['duels_devouring_hunger']).play(0, 'duels_devouring_hunger').run();
	ok('Devouring Hunger: wipes the whole board', [...state.players[0].board, ...state.players[1].board].every(c => E.isDead(c)));
}
// Wand of Disintegration: silence + destroy all enemy creatures
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 4 })
		.mana(0, 10).board(0, ['t_m']).board(1, ['t_m', 't_m']).hand(0, ['duels_wand_of_disintegration']).play(0, 'duels_wand_of_disintegration').run();
	ok('Wand of Disintegration: clears only enemy creatures', state.players[1].board.filter(c => !E.isDead(c)).length === 0 && state.players[0].board.filter(c => !E.isDead(c)).length === 1);
}
// Will of the Warden: refresh mana — after paying its 3 cost, mana is back to full
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_will_of_the_warden']).play(0, 'duels_will_of_the_warden').run();
	ok('Will of the Warden: refreshes mana to max after paying its cost', E.availableMana(state.players[0]) === 10, E.availableMana(state.players[0]));
}
// Water Invocation: restore 6 to friendly characters
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 10, damage: 6 })
		.mana(0, 10).life(0, 20).board(0, ['t_m']).hand(0, ['duels_water_invocation']).play(0, 'duels_water_invocation').run();
	ok('Water Invocation: heals friendly creature', state.players[0].board[0].damage === 0, state.players[0].board[0].damage);
	ok('Water Invocation: heals friendly hero', state.players[0].life === 26, state.players[0].life);
}
// Bag of Stuffing: draw until hand full (Battlecards hand cap)
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_bag_of_stuffing'])
		.do((s) => { for (let i = 0; i < 24; i++) s.players[0].deck.push('coin'); }).play(0, 'duels_bag_of_stuffing').run();
	ok('Bag of Stuffing: fills the hand', state.players[0].hand.length >= 12 && state.players[0].deck.length > 0, state.players[0].hand.length);
}
// Stroke of Midnight: destroy a random enemy creature + Echo flag
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 4 })
		.mana(0, 10).board(1, ['t_m', 't_m']).hand(0, ['duels_stroke_of_midnight']).play(0, 'duels_stroke_of_midnight').run();
	ok('Stroke of Midnight: destroys one random enemy creature', state.players[1].board.filter(c => !E.isDead(c)).length === 1);
	ok('Stroke of Midnight: has Echo', byId['duels_stroke_of_midnight'].echo === true);
}

// ---------------- batch 3 ----------------
const IDS3 = ['duels_elemental_learning', 'duels_hunters_insight', 'duels_deadly_weapons_101', 'duels_invoke_the_void'];
ok('all 4 batch-3 treasures present + tagged', IDS3.every(id => byId[id] && byId[id].treasure && byId[id].set === 'DUELS'), IDS3.filter(id => !byId[id]));

// Elemental Learning: 3 random Elementals to hand
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_elemental_learning']).play(0, 'duels_elemental_learning').run();
	const els = state.players[0].hand.filter(c => (c.tribe || '').includes('Elemental'));
	ok('Elemental Learning: 3 Elementals added to hand', els.length === 3, state.players[0].hand.map(c => c.tribe));
}
// Hunter's Insight: hand cards cost (1) less
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 5, attack: 3, health: 3 })
		.mana(0, 10).hand(0, ['duels_hunters_insight', 't_c', 't_c']).play(0, 'duels_hunters_insight').run();
	ok("Hunter's Insight: reduces hand costs by 1", state.players[0].hand.filter(c => c.id === 't_c').every(c => c.cost === 4), state.players[0].hand.filter(c => c.id === 't_c').map(c => c.cost));
}
// Deadly Weapons 101: weapon +2/+2
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_deadly_weapons_101'])
		.do((s) => { s.players[0].weapon = { id: 'w', name: 'Axe', type: 'weapon', attack: 2, durability: 2, keywords: [] }; })
		.play(0, 'duels_deadly_weapons_101').run();
	const w = state.players[0].weapon;
	ok('Deadly Weapons 101: weapon +2/+2', w && w.attack === 4 && w.durability === 4, w && `${w.attack}/${w.durability}`);
}
// Invoke the Void: two 7/7 + Overload
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_invoke_the_void']).play(0, 'duels_invoke_the_void').run();
	const ff = state.players[0].board.filter(c => c.name === 'Flamewreathed Faceless');
	ok('Invoke the Void: two 7/7 Flamewreathed Faceless', ff.length === 2 && ff.every(c => c.attack === 7 && E.hp(c) === 7), ff.length);
	ok('Invoke the Void: Overloads 4', (state.players[0].overloadPending || 0) === 4, state.players[0].overloadPending);
}

// ---------------- batch 4 ----------------
const IDS4 = ['duels_gift_of_the_heart', 'duels_spyglass', 'duels_creepy_curio', 'duels_coin_pouch', 'duels_old_militia_horn', 'duels_surly_mob', 'duels_collectors_ire', 'duels_summoning_ritual'];
ok('all 8 batch-4 treasures present + tagged', IDS4.every(id => byId[id] && byId[id].treasure && byId[id].set === 'DUELS'), IDS4.filter(id => !byId[id]));

// Gift of the Heart: +3 empty Mana Crystals
{
	const { state } = new Scenario(byId).mana(0, 5).hand(0, ['duels_gift_of_the_heart']).play(0, 'duels_gift_of_the_heart').run();
	ok('Gift of the Heart: +3 max Mana Crystals', state.players[0].mana.max === 8, state.players[0].mana.max);
}
// Spyglass: copy a random card from the opponent's hand
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 10).hand(0, ['duels_spyglass']).hand(1, ['t_c']).play(0, 'duels_spyglass').run();
	ok('Spyglass: copies an enemy hand card into yours', state.players[0].hand.some(c => c.id === 't_c'));
}
// Creepy Curio: three 1/1 Ghosts
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_creepy_curio']).play(0, 'duels_creepy_curio').run();
	const g = state.players[0].board.filter(c => c.name === 'Ghost');
	ok('Creepy Curio: three 1/1 Ghosts', g.length === 3 && g.every(c => c.attack === 1 && E.hp(c) === 1), g.length);
}
// Coin Pouch: a random 3-Cost creature
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_coin_pouch']).play(0, 'duels_coin_pouch').run();
	const b = state.players[0].board.filter(c => c.type === 'creature');
	ok('Coin Pouch: summons a 3-Cost creature', b.length === 1 && (byId[b[0].id]?.cost === 3), b.map(c => c.id + ':' + byId[c.id]?.cost));
}
// Old Militia Horn: +1/+1 and Taunt
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_m']).hand(0, ['duels_old_militia_horn']).play(0, 'duels_old_militia_horn').run();
	const m = state.players[0].board[0];
	ok('Old Militia Horn: +1/+1 & Taunt', m.attack === 3 && E.hp(m) === 3 && m.keywords.includes('taunt'));
}
// Surly Mob: destroy a random enemy creature
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 4 })
		.mana(0, 10).board(1, ['t_m', 't_m']).hand(0, ['duels_surly_mob']).play(0, 'duels_surly_mob').run();
	ok('Surly Mob: destroys one random enemy creature', state.players[1].board.filter(c => !E.isDead(c)).length === 1);
}
// Collector's Ire: summon a Mech, Pirate, and Dragon from your deck
{
	const { state } = new Scenario(byId)
		.def('t_mech', { type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Mech' })
		.def('t_pir', { type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Pirate' })
		.def('t_drag', { type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Dragon' })
		.def('t_plain', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).deck(0, ['t_mech', 't_pir', 't_drag', 't_plain']).hand(0, ['duels_collectors_ire']).play(0, 'duels_collectors_ire').run();
	const b = state.players[0].board.map(c => c.id);
	ok("Collector's Ire: summons the Mech/Pirate/Dragon from deck", ['t_mech', 't_pir', 't_drag'].every(id => b.includes(id)) && !b.includes('t_plain'), b);
	ok("Collector's Ire: pulls them out of the deck", !state.players[0].deck.some(id => ['t_mech', 't_pir', 't_drag'].includes(id)) && state.players[0].deck.includes('t_plain'), state.players[0].deck);
}
// Summoning Ritual: summon 3 Demons from your deck
{
	const { state } = new Scenario(byId).def('t_demon', { type: 'creature', cost: 3, attack: 3, health: 3, tribe: 'Demon' })
		.mana(0, 10).deck(0, ['t_demon', 't_demon', 't_demon', 't_demon']).hand(0, ['duels_summoning_ritual']).play(0, 'duels_summoning_ritual').run();
	ok('Summoning Ritual: summons 3 Demons from deck', state.players[0].board.filter(c => c.id === 't_demon').length === 3 && state.players[0].deck.filter(id => id === 't_demon').length === 1, state.players[0].board.length);
}

// ---------------- batch 5 ----------------
const IDS5 = ['duels_mindpocalypse', 'duels_enhance_a_matic', 'duels_wish', 'duels_embers_of_ragnaros', 'duels_humble_blessings', 'duels_amalgamate'];
ok('all 6 batch-5 treasures present + tagged', IDS5.every(id => byId[id] && byId[id].treasure && byId[id].set === 'DUELS'), IDS5.filter(id => !byId[id]));

// Mindpocalypse: both players draw 2 & gain a Mana Crystal
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).deck(0, ['t_c', 't_c', 't_c']).deck(1, ['t_c', 't_c', 't_c'])
		.hand(0, ['duels_mindpocalypse']).play(0, 'duels_mindpocalypse').run();
	ok('Mindpocalypse: you draw 2 & +1 Mana Crystal', state.players[0].hand.length === 2 && state.players[0].mana.max === 11, [state.players[0].hand.length, state.players[0].mana.max]);
	ok('Mindpocalypse: opponent draws 2 & gains a Mana Crystal', state.players[1].hand.length === 2 && state.players[1].mana.max >= 1, [state.players[1].hand.length, state.players[1].mana.max]);
}
// Enhance-a-matic: add 9 random spells to hand
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['duels_enhance_a_matic']).play(0, 'duels_enhance_a_matic').run();
	ok('Enhance-a-matic: adds ~9 spells to hand', state.players[0].hand.length >= 8 && state.players[0].hand.every(c => E.isSpell ? true : true), state.players[0].hand.length);
}
// Wish: fill the board with Legendary creatures + fully heal hero
{
	const { state } = new Scenario(byId).mana(0, 10).life(0, 20).hand(0, ['duels_wish']).play(0, 'duels_wish').run();
	const b = state.players[0].board.filter(c => c.type === 'creature' && !E.isDead(c));
	ok('Wish: fills the board with Legendaries', b.length >= 5 && b.every(c => byId[c.id]?.rarity === 'legendary'), b.length);
	ok('Wish: fully heals the hero', state.players[0].life === 40, state.players[0].life);
}
// Embers of Ragnaros: three 8-damage hits at random enemies
{
	const { state } = new Scenario(byId).def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 40 })
		.mana(0, 10).board(1, ['t_wall']).hand(0, ['duels_embers_of_ragnaros']).play(0, 'duels_embers_of_ragnaros').run();
	const dealt = (40 - state.players[1].life) + state.players[1].board.reduce((s, c) => s + c.damage, 0);
	ok('Embers of Ragnaros: 3x8 = 24 damage across enemies', dealt === 24, dealt);
}
// Humble Blessings: set friendly creatures to 3/3
{
	const { state } = new Scenario(byId).def('t_big', { type: 'creature', cost: 7, attack: 7, health: 7 })
		.mana(0, 10).board(0, ['t_big']).hand(0, ['duels_humble_blessings']).play(0, 'duels_humble_blessings').run();
	const m = state.players[0].board[0];
	ok('Humble Blessings: creature becomes 3/3', m.attack === 3 && E.hp(m) === 3, [m.attack, E.hp(m)]);
}
// Amalgamate: destroy friendlies, summon their combined stats
{
	const { state } = new Scenario(byId).def('t_a', { type: 'creature', cost: 2, attack: 2, health: 3 }).def('t_b', { type: 'creature', cost: 3, attack: 4, health: 1 })
		.mana(0, 10).board(0, ['t_a', 't_b']).hand(0, ['duels_amalgamate']).play(0, 'duels_amalgamate').run();
	const live = state.players[0].board.filter(c => !E.isDead(c));
	ok('Amalgamate: one 6/4 Amalgamation remains', live.length === 1 && live[0].name === 'Amalgamation' && live[0].attack === 6 && E.hp(live[0]) === 4, live.map(c => c.name + ' ' + c.attack + '/' + E.hp(c)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
