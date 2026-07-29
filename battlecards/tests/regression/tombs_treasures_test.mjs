// tombs_treasures_test.mjs — Tombs of Terror active treasures, batch 1.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('batch-1 treasures marked treasure+token', raw.cards.filter(c => c.set === 'TOMBS_OF_TERROR' && c.treasure).length >= 14);

// Staff of Scales: three 1/1 rush/poisonous/reborn Snakes
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_staff_of_scales']).play(0, 'ulda_staff_of_scales').run();
	const snakes = state.players[0].board.filter(c => c.id === 'ulda_ancient_snake');
	ok('Staff of Scales: 3 Snakes', snakes.length === 3 && snakes.every(s => s.keywords.includes('poisonous') && s.keywords.includes('reborn') && s.keywords.includes('rush')));
}
// Jr. Scout: end of turn, 4 to a random enemy creature
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 3, attack: 1, health: 10 })
		.mana(0, 10).board(1, ['t_e']).board(0, ['ulda_jr_scout']).run();
	state.current = 0;
	E.endTurn(state);
	ok('Jr. Scout: 4 to an enemy creature at end of turn', state.players[1].board[0].damage === 4, state.players[1].board[0].damage);
}
// Sanctum Golem: can't attack
{
	const { state } = new Scenario(byId).mana(0, 10).board(0, ['ulda_sanctum_golem']).run();
	const g = state.players[0].board[0]; g.sick = false; state.current = 0;
	ok('Sanctum Golem: cannot attack (Pacifist)', !E.canAttackWith(state, 0, g));
}
// Enflamed Golem: DR nukes all creatures for 3 + summons a Sanctum Golem
{
	const { state } = new Scenario(byId)
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.def('t_bystander', { type: 'creature', cost: 2, attack: 1, health: 3 })
		.mana(0, 10).board(0, ['ulda_enflamed_golem']).board(1, ['t_bystander']).hand(0, ['t_kill']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Enflamed Golem: summoned a Sanctum Golem', state.players[0].board.some(c => c.id === 'ulda_sanctum_golem'));
	ok('Enflamed Golem: 3 damage hit the bystander', !state.players[1].board.length || state.players[1].board[0].damage >= 3 || state.players[1].board.length === 0);
}
// Runaway Gyrocopter: DR 5 to enemy creatures + shuffle self back
{
	const { state } = new Scenario(byId)
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.def('t_e', { type: 'creature', cost: 3, attack: 2, health: 8 })
		.mana(0, 10).board(0, ['ulda_runaway_gyrocopter']).board(1, ['t_e']).hand(0, ['t_kill']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Gyrocopter: 5 to enemy creature', state.players[1].board[0].damage === 5, state.players[1].board[0].damage);
	ok('Gyrocopter: shuffled back into deck', state.players[0].deck.includes('ulda_runaway_gyrocopter'));
}
// Crawling Claw: Rush+Reborn body; DR steals a card on its FINAL death
// (this engine's Reborn returns it at 1 health and skips the deathrattle the
// first time — the steal fires when it dies for good)
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).board(0, ['ulda_crawling_claw']).hand(1, ['t_held']).hand(0, ['t_kill', 't_kill']).run();
	const claw = state.players[0].board[0];
	ok('Crawling Claw: Rush + Reborn body', claw.keywords.includes('rush') && claw.keywords.includes('reborn'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: claw.uid, player: 0 });
	const reborn = state.players[0].board.find(c => c.id === 'ulda_crawling_claw');
	ok('Crawling Claw: reborned once (no steal yet)', !!reborn && !state.players[0].hand.some(c => c.id === 't_held'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: reborn.uid, player: 0 });
	ok('Crawling Claw: stole from the enemy hand on final death', state.players[0].hand.some(c => c.id === 't_held'));
}
// Reno's Crafty Lasso: weapon steals on hero attack
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 10).hand(0, ['ulda_renos_crafty_lasso']).hand(1, ['t_held']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok("Reno's Crafty Lasso: stole on attack", state.players[0].hand.some(c => c.id === 't_held'));
}
// Reno's Lucky Hat: +2/+2 and Spell Damage +2
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ['ulda_renos_lucky_hat'])
		.play(0, 'ulda_renos_lucky_hat', { targetBoard: [0, 0] }).run();
	const c = state.players[0].board[0];
	ok("Reno's Lucky Hat: +2/+2", c.attack === 4 && E.hp(c) === 4);
	ok("Reno's Lucky Hat: Spell Damage +2", (c.spellDamage || (c.static && c.static.value) || 0) >= 2 || c.spellDamage === 2);
}
// Elise's Machete: summons two Treants on hero attack
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ["ulda_elises_machete"]).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	const treants = state.players[0].board.filter(c => c.name === 'Treant');
	ok("Elise's Machete: two Rush Treants", treants.length === 2 && treants.every(t => t.keywords.includes('rush')));
}
// Ol' Faithful: 1 to all enemies on hero attack
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 2, attack: 1, health: 5 })
		.mana(0, 10).board(1, ['t_e']).hand(0, ["ulda_ol_faithful"]).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	const foeLife = state.players[1].life;
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok("Ol' Faithful: enemy creature took 1", state.players[1].board[0].damage === 1);
}
// Karl the Lost: six Recruits + all friendly get Taunt
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_karl_the_lost']).play(0, 'ulda_karl_the_lost').run();
	const recruits = state.players[0].board.filter(c => c.id === 'silver_hand_recruit');
	ok('Karl the Lost: 6 Recruits', recruits.length === 6);
	ok('Karl the Lost: friendly board has Taunt', state.players[0].board.every(c => c.keywords.includes('taunt')));
}
// Finley's Pith Helmet: +0/+2 to friendly + shuffle self
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ["ulda_finleys_pith_helmet"])
		.play(0, 'ulda_finleys_pith_helmet').run();
	ok("Pith Helmet: +2 Health", E.hp(state.players[0].board[0]) === 4);
	ok("Pith Helmet: shuffled back", state.players[0].deck.includes('ulda_finleys_pith_helmet'));
}
// Truesilver Lance: lifesteal weapon heals on hero attack
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_truesilver_lance']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	state.players[0].life = 20; state.players[0].maxLife = 40;
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok('Truesilver Lance: Lifesteal healed the hero', state.players[0].life === 25, state.players[0].life);
}

// ---- batch 2 ----
// Book of the Dead: costs 1 less per creature died; deals 7 to all enemies
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ['ulda_book_of_the_dead']).run();
	state.minionsDiedGame = 5;
	const card = state.players[0].hand[0];
	ok('Book of the Dead: 12 - 5 = 7 cost', E.effectiveCost(state, 0, card) === 7, E.effectiveCost(state, 0, card));
	const foeLife = state.players[1].life;
	E.playCard(state, 0, card.uid, null);
	ok('Book of the Dead: 7 to the enemy hero', state.players[1].life === foeLife - 7, state.players[1].life);
}
// Gnomebliterator: 10 to any target
{
	const { state } = new Scenario(byId)
		.def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 12 })
		.mana(0, 20).board(1, ['t_wall']).hand(0, ['ulda_gnomebliterator'])
		.play(0, 'ulda_gnomebliterator', { targetBoard: [1, 0] }).run();
	ok('Gnomebliterator: 10 damage', state.players[1].board[0].damage === 10, state.players[1].board[0].damage);
}
// Starseeker's Tools: two discovers (creature + spell), both at -2 cost
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ["ulda_starseekers_tools"]).play(0, 'ulda_starseekers_tools').run();
	ok("Starseeker's Tools: both discovers queued", state.pickQueue.length === 2);
	const picked1 = state.pickQueue[0].ids[0];
	E.resolvePick(state, picked1);
	const c1 = state.players[0].hand.find(c => c.id === picked1);
	ok("Starseeker's Tools: a creature discover at -2", byId[picked1]?.type === 'creature' && c1 && c1.cost === Math.max(0, byId[picked1].cost - 2));
	const picked2 = state.pickQueue[0].ids[0];
	E.resolvePick(state, picked2);
	const c2 = state.players[0].hand.find(c => c.id === picked2);
	ok("Starseeker's Tools: a spell discover at -2", ['sorcery', 'instant'].includes(byId[picked2]?.type) && c2 && c2.cost === Math.max(0, byId[picked2].cost - 2));
}
// Stone Fox Statue: two 0-cost copies of a chosen creature
{
	const { state } = new Scenario(byId)
		.def('t_big', { type: 'creature', cost: 7, attack: 7, health: 7 })
		.mana(0, 20).board(1, ['t_big']).hand(0, ['ulda_stone_fox_statue'])
		.play(0, 'ulda_stone_fox_statue', { targetBoard: [1, 0] }).run();
	const copies = state.players[0].hand.filter(c => c.id === 't_big');
	ok('Stone Fox Statue: 2 copies at cost 0', copies.length === 2 && copies.every(c => c.cost === 0));
}
// Staff of Renewal: resurrect the highest-cost dead friendlies with Taunt
{
	const { state } = new Scenario(byId)
		.def('t_big', { type: 'creature', cost: 6, attack: 6, health: 6 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).board(0, ['t_big']).hand(0, ['t_kill', 'ulda_staff_of_renewal']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'ulda_staff_of_renewal').uid, null);
	const rez = state.players[0].board.filter(c => c.id === 't_big');
	ok('Staff of Renewal: resurrected the dead creature with Taunt', rez.length >= 1 && rez.every(c => c.keywords.includes('taunt')));
}
// Titan-Forged Grapnel: destroy 2 random enemies, gain armor = their attack
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.def('t_b', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.mana(0, 20).board(1, ['t_a', 't_b']).hand(0, ['ulda_titan_forged_grapnel'])
		.play(0, 'ulda_titan_forged_grapnel').run();
	ok('Titan-Forged Grapnel: both enemies destroyed', state.players[1].board.length === 0);
	ok('Titan-Forged Grapnel: gained 7 Armor (3+4)', state.players[0].armor === 7, state.players[0].armor);
}
// Ancient Reflections: fill the board with 1/1 copies of a chosen creature
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 5, attack: 5, health: 5, keywords: ['taunt'] })
		.mana(0, 20).board(0, ['t_c']).hand(0, ['ulda_ancient_reflections'])
		.play(0, 'ulda_ancient_reflections', { targetBoard: [0, 0] }).run();
	const copies = state.players[0].board.filter(c => c.id === 't_c' && c.attack === 1);
	ok('Ancient Reflections: board filled with 1/1 copies', state.players[0].board.length === 7 && copies.length >= 6);
}
// Crusty the Crustacean: destroy a creature, gain double its stats
{
	const { state } = new Scenario(byId)
		.def('t_prey', { type: 'creature', cost: 4, attack: 3, health: 4 })
		.mana(0, 20).board(1, ['t_prey']).hand(0, ['ulda_crusty_the_crustacean'])
		.play(0, 'ulda_crusty_the_crustacean', { targetBoard: [1, 0] }).run();
	const crusty = state.players[0].board.find(c => c.id === 'ulda_crusty_the_crustacean');
	ok('Crusty: destroyed the prey', !state.players[1].board.some(c => c.id === 't_prey'));
	ok('Crusty: gained double (3/4 -> +6/+8 = 9/12)', crusty && crusty.attack === 9 && E.hp(crusty) === 12, crusty && `${crusty.attack}/${E.hp(crusty)}`);
}
// Brann's Epic Egg: takes damage -> summons King Krush (once)
{
	const { state } = new Scenario(byId)
		.def('t_ping', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 1, target: 'creature' }] })
		.mana(0, 20).board(0, ['ulda_branns_epic_egg']).hand(0, ['t_ping']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok("Brann's Epic Egg: summoned King Krush", state.players[0].board.some(c => c.id === 'king_krush'));
}

// ---- batch 3 ----
// Maxwell: +2 Attack per OTHER creature on the battlefield
{
	const { state } = new Scenario(byId)
		.def('t_o', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 20).board(0, ['ulda_maxwell_mighty_steed', 't_o', 't_o']).board(1, ['t_o']).run();
	E.recomputeAuras(state); // Scenario board placement doesn't recompute; a real summon does
	const max = state.players[0].board.find(c => c.id === 'ulda_maxwell_mighty_steed');
	// 3 other creatures on the battlefield (2 friendly + 1 enemy) -> +6 -> 9 attack
	ok('Maxwell: +2 per other creature (3 -> 3+6 = 9)', max.attack === 9, max.attack);
}
// Rakanishu: sets the lackey buff for the rest of the game
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ['ulda_rakanishu']).play(0, 'ulda_rakanishu').run();
	ok('Rakanishu: lackeyBuff set to 4', state.players[0].lackeyBuff === 4, state.players[0].lackeyBuff);
}
// Servant of Siamat: a Taunt + Divine Shield body
{
	const { state } = new Scenario(byId).mana(0, 20).board(0, ['ulda_servant_of_siamat']).run();
	const c = state.players[0].board[0];
	ok('Servant of Siamat: Taunt + Divine Shield', c.keywords.includes('taunt') && c.keywords.includes('divine_shield'));
}
// Murky's Battle Horn: 7 Rush Murlocs now, 7 more at the start of next turn
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ["ulda_murkys_battle_horn"]).play(0, 'ulda_murkys_battle_horn').run();
	ok("Murky's Battle Horn: 7 Rush Murlocs", state.players[0].board.filter(c => c.name === 'Murloc' && c.keywords.includes('rush')).length === 7);
	state.current = 0;
	E.endTurn(state); E.endTurn(state); // back to my turn start -> repeat (capped by board ceiling)
	ok("Murky's Battle Horn: repeated next turn", state.players[0].board.filter(c => c.name === 'Murloc').length > 7);
}
// Bauble of Beetles: resurrect dead friendlies with Reborn
{
	const { state } = new Scenario(byId)
		.def('t_big', { type: 'creature', cost: 6, attack: 6, health: 6 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).board(0, ['t_big']).hand(0, ['t_kill', 'ulda_bauble_of_beetles']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'ulda_bauble_of_beetles').uid, null);
	const rez = state.players[0].board.filter(c => c.id === 't_big');
	ok('Bauble of Beetles: resurrected with Reborn', rez.length >= 1 && rez.every(c => c.keywords.includes('reborn')));
}
// Flex-plosion: destroy 3 random enemy creatures
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(1, ['t_e', 't_e', 't_e', 't_e']).hand(0, ['ulda_flex_plosion'])
		.play(0, 'ulda_flex_plosion').run();
	ok('Flex-plosion: destroyed 3 (1 left)', state.players[1].board.length === 1, state.players[1].board.length);
}
// Phaoris' Blade: gains +2/+1 after killing a creature
{
	const { state } = new Scenario(byId)
		.def('t_prey', { type: 'creature', cost: 1, attack: 0, health: 1 })
		.mana(0, 20).board(1, ['t_prey']).hand(0, ["ulda_phaoris_blade"]).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	const before = state.players[0].weapon.attack;
	E.heroAttack(state, 0, { type: 'creature', uid: state.players[1].board[0].uid, player: 1 });
	ok("Phaoris' Blade: +2 attack after a kill", state.players[0].weapon && state.players[0].weapon.attack === before + 2, state.players[0].weapon?.attack);
}
// Canopic Jars: your creatures gain a summon-a-Legendary deathrattle
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).board(0, ['t_c']).hand(0, ['ulda_canopic_jars', 't_kill'])
		.play(0, 'ulda_canopic_jars').run();
	const c = state.players[0].board[0];
	ok('Canopic Jars: granted a Deathrattle', c.keywords.includes('deathrattle') && (c.deathrattle || []).some(e => e.type === 'summon-random'));
	E.playCard(state, 0, state.players[0].hand.find(x => x.id === 't_kill').uid, { type: 'creature', uid: c.uid, player: 0 });
	const legend = state.players[0].board.find(x => byId[x.id]?.rarity === 'legendary');
	ok('Canopic Jars: DR summoned a Legendary', !!legend);
}

// ---- batch 4 ----
const usePower = (state, pi, id, target = null) => {
	const card = Object.assign(E.instantiate(byId[id], pi), { zone: 'heropower', usedThisTurn: false });
	state.players[pi].heroPowers.push(card);
	return E.useHeroPower(state, pi, card.uid, target);
};
// Flo Slatebrand: Battlecry AND Deathrattle add a random Treasure
{
	const { state } = new Scenario(byId)
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).hand(0, ['ulda_flo_slatebrand', 't_kill']).play(0, 'ulda_flo_slatebrand').run();
	ok('Flo: Battlecry added a Treasure', state.players[0].hand.some(c => byId[c.id]?.treasure));
	const before = state.players[0].hand.filter(c => byId[c.id]?.treasure).length;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Flo: Deathrattle added another Treasure', state.players[0].hand.filter(c => byId[c.id]?.treasure).length > before);
}
// Addarah: shuffle all enemy creatures into your deck
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(1, ['t_e', 't_e']).hand(0, ['ulda_addarah']).play(0, 'ulda_addarah').run();
	ok('Addarah: enemy board cleared', state.players[1].board.length === 0);
	ok('Addarah: two enemy creatures now in your deck', state.players[0].deck.filter(id => id === 't_e').length === 2);
}
// The Gatling Wand: 3 total damage among enemies
{
	const { state } = new Scenario(byId)
		.def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 20 })
		.mana(0, 20).board(1, ['t_wall']).hand(0, ['ulda_the_gatling_wand']).play(0, 'ulda_the_gatling_wand').run();
	const dealt = state.players[1].board[0].damage + (40 - state.players[1].life);
	ok('Gatling Wand: 3 damage split', dealt === 3, dealt);
}
// Brann's Saddle: +3/+3 to a friendly creature
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(0, ['t_c']).hand(0, ["ulda_branns_saddle"])
		.play(0, 'ulda_branns_saddle', { targetBoard: [0, 0] }).run();
	const c = state.players[0].board[0];
	ok("Brann's Saddle: +3/+3", c.attack === 5 && E.hp(c) === 5);
}
// Reno's Magical Torch: 4 damage; Combo also shuffles a copy back
{
	const { state } = new Scenario(byId)
		.def('t_free', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 1 }] })
		.def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 20 })
		.mana(0, 20).board(1, ['t_wall']).hand(0, ['t_free', 'ulda_renos_magical_torch']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_free').uid, null); // enables Combo
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'ulda_renos_magical_torch').uid, { type: 'creature', uid: state.players[1].board[0].uid, player: 0 });
	ok("Reno's Magical Torch: 4 damage", state.players[1].board[0].damage === 4, state.players[1].board[0].damage);
	ok("Reno's Magical Torch: Combo shuffled a copy into the deck", state.players[0].deck.includes('ulda_renos_magical_torch'));
}
// Staff of Ammunae: Windfury + Immune to your whole board this turn
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_b', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).board(0, ['t_a', 't_b']).hand(0, ["ulda_staff_of_ammunae"])
		.play(0, 'ulda_staff_of_ammunae').run();
	ok('Staff of Ammunae: whole board has Windfury + Immune',
		state.players[0].board.every(c => c.keywords.includes('windfury') && c.keywords.includes('immune')));
}
// Blade of the Burning Sun: deck +2 Attack on play; returns to hand on break
{
	const { state } = new Scenario(byId)
		.def('t_m', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).deck(0, ['t_m']).hand(0, ['ulda_blade_of_the_burning_sun']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	E.drawCards(state, 0, 1);
	const drawn = state.players[0].hand.find(c => c.id === 't_m');
	ok('Blade of the Burning Sun: deck creature drawn at +2 Attack', drawn && drawn.attack === 5, drawn && drawn.attack);
	// break the weapon -> deathrattle returns it to hand
	state.players[0].weapon.durability = 1;
	E.degradeWeapon(state, 0);
	ok('Blade of the Burning Sun: returned to hand on break', state.players[0].hand.some(c => c.id === 'ulda_blade_of_the_burning_sun'));
}
// Uldum Treasure Cache (shared power): add a random Treasure
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_uldum_treasure_cache');
	ok('Uldum Treasure Cache: a Treasure in hand', state.players[0].hand.some(c => byId[c.id]?.treasure));
}

// ---- batch 5 ----
// Amakir the Light: after it attacks, add 2 cost-0 spells
{
	const { state } = new Scenario(byId).mana(0, 20).board(0, ['ulda_amakir_the_light']).run();
	const am = state.players[0].board[0]; am.sick = false; state.current = 0;
	E.attack(state, 0, am.uid, { type: 'hero', player: 1 });
	const spells = state.players[0].hand.filter(c => byId[c.id] && ['sorcery', 'instant'].includes(byId[c.id].type) && c.cost === 0);
	ok('Amakir: 2 cost-0 spells after attacking', spells.length === 2, state.players[0].hand.length);
}
// Sand Trap: casts when drawn, mills the top 2 of your own deck
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_b', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 20).deck(0, ['t_a', 't_b', 't_c']).run();
	// draw Sand Trap: it should mill 2 more off the top and consume itself
	state.players[0].deck.push('ulda_sand_trap');
	const before = state.players[0].deck.length;
	E.drawCards(state, 0, 1);
	ok('Sand Trap: consumed on draw + milled 2', state.players[0].deck.length === before - 3 && !state.players[0].hand.some(c => c.id === 'ulda_sand_trap'), state.players[0].deck.length);
}
// LOCUUUUSTS!!!: fill the board with 2/2 Rush Locusts
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ['ulda_locuuuusts']).play(0, 'ulda_locuuuusts').run();
	const locusts = state.players[0].board.filter(c => c.id === 'ulda_giant_locust');
	ok('LOCUUUUSTS: 7 Rush Locusts', locusts.length === 7 && locusts.every(l => l.attack === 2 && l.keywords.includes('rush')));
}
// Jr. Excavator: draw 3
{
	const { state } = new Scenario(byId)
		.def('t_x', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 20).deck(0, ['t_x', 't_x', 't_x', 't_x']).hand(0, ['ulda_jr_excavator']).run();
	const before = state.players[0].hand.length - 1;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'ulda_jr_excavator').uid, null);
	ok('Jr. Excavator: drew 3', state.players[0].hand.filter(c => c.id === 't_x').length === 3);
}
// Lei Flamepaw: your spells cast an extra time while it's alive
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] })
		.mana(0, 20).board(0, ['ulda_lei_flamepaw']).hand(0, ['t_bolt']).run();
	const foeLife = state.players[1].life;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_bolt').uid, null);
	ok('Lei Flamepaw: a 2-damage bolt hit for 4 (cast twice)', state.players[1].life === foeLife - 4, foeLife - state.players[1].life);
}
// ...and without Lei, the same bolt casts once
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] })
		.mana(0, 20).hand(0, ['t_bolt']).run();
	const foeLife = state.players[1].life;
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('No Lei: the bolt casts once (2 damage)', state.players[1].life === foeLife - 2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
