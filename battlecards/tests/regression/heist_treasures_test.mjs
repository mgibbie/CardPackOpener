// heist_treasures_test.mjs — Dalaran Heist phase 1: active treasures +
// alternate hero powers imported with wired effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const usePower = (state, pi, id, target = null) => {
	const card = Object.assign(E.instantiate(byId[id], pi), { zone: 'heropower' });
	state.players[pi].heroPowers.push(card);
	return E.useHeroPower(state, pi, card.uid, target);
};

// every imported heist card is uncollectible and its data types have handlers (census covers that)
{
	const heist = raw.cards.filter(c => c.set === 'DALARAN_HEIST');
	ok('52 heist cards imported, all tokens', heist.length === 52 && heist.every(c => c.token), heist.length);
	ok('29 marked as treasures (chain/bomb tokens excluded)', heist.filter(c => c.treasure).length === 29, heist.filter(c => c.treasure).length);
}
// extra-turns: me, me, them, them
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_continuum_collider']).play(0, 'dala_continuum_collider').run();
	E.endTurn(state);
	ok('Continuum Collider: I take the extra turn', state.current === 0);
	E.endTurn(state);
	ok('...then the opponent', state.current === 1);
	E.endTurn(state);
	ok('...twice', state.current === 1);
	E.endTurn(state);
	ok('...then back to normal rotation', state.current === 0);
}
// Gnomish Army Knife: all seven keywords
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ['dala_gnomish_army_knife'])
		.play(0, 'dala_gnomish_army_knife', { targetBoard: [0, 0] }).run();
	const c = state.players[0].board[0];
	ok('Army Knife: all 7 keywords', ['charge', 'windfury', 'divine_shield', 'lifesteal', 'poisonous', 'taunt', 'stealth'].every(k => c.keywords.includes(k)), c.keywords.join());
}
// The Muscle: 3 free random cards
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_the_muscle']).play(0, 'dala_the_muscle').run();
	const h = state.players[0].hand;
	ok('The Muscle: 3 cards, all cost 0', h.length === 3 && h.every(c => c.cost === 0), h.map(c => c.cost).join());
}
// Super Simian Sphere: Mukla with immune + elusive
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_super_simian_sphere']).play(0, 'dala_super_simian_sphere').run();
	const m = state.players[0].board.find(c => c.id === 'king_mukla');
	ok('Simian Sphere: Immune Elusive Mukla', !!m && m.keywords.includes('immune') && m.keywords.includes('elusive'));
}
// EVIL Propaganda: mass mind control
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_b', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 10).board(1, ['t_a', 't_b']).hand(0, ['dala_evil_propaganda'])
		.play(0, 'dala_evil_propaganda').run();
	ok('EVIL Propaganda: stole the whole board', state.players[0].board.length === 2 && state.players[1].board.length === 0);
}
// Untold Splendor: 5 treasures into deck
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_untold_splendor']).play(0, 'dala_untold_splendor').run();
	const treasures = state.players[0].deck.filter(id => byId[id]?.treasure);
	ok('Untold Splendor: 5 treasures shuffled in', treasures.length === 5, treasures.length);
}
// Golden Candle: everything else becomes random legendaries
{
	const { state } = new Scenario(byId)
		.def('t_x', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, ['t_x', 't_x']).hand(0, ['dala_golden_candle', 't_x'])
		.play(0, 'dala_golden_candle').run();
	const p = state.players[0];
	ok('Golden Candle: hand is now random legendaries', p.hand.every(c => byId[c.id]?.rarity === 'legendary'), p.hand.map(c => c.id).join());
	ok('Golden Candle: deck too', p.deck.every(id => byId[id]?.rarity === 'legendary'), p.deck.join());
}
// Dreamgrove Ring: pick a legendary, five copies hit the board, none to hand
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_dreamgrove_ring']).play(0, 'dala_dreamgrove_ring').run();
	const picked = state.pickQueue[0].ids[0];
	E.resolvePick(state, picked);
	const copies = state.players[0].board.filter(c => c.id === picked);
	ok('Dreamgrove Ring: five copies summoned', copies.length === 5, copies.length);
	ok('Dreamgrove Ring: the pick did NOT go to hand', !state.players[0].hand.some(c => c.id === picked));
}
// Orb of the Untold: 20 total damage among enemies
{
	const { state } = new Scenario(byId)
		.def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 30 })
		.mana(0, 10).board(1, ['t_wall']).hand(0, ['dala_orb_of_the_untold'])
		.play(0, 'dala_orb_of_the_untold').run();
	const dmg = state.players[1].board[0].damage + (40 - state.players[1].life);
	ok('Orb of the Untold: 20 damage split', dmg === 20, dmg);
}
// THE... Candles? chain: each cast adds the next
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_the_candles']).play(0, 'dala_the_candles').run();
	ok('Candles: second candle in hand', state.players[0].hand.some(c => c.id === 'dala_the_candles_b'));
}
// Overpowered: cards replay for the rest of the turn
{
	const { state } = new Scenario(byId)
		.def('t_v', { type: 'creature', cost: 1, attack: 2, health: 2 })
		.mana(0, 10).hand(0, ['dala_overpowered', 't_v'])
		.play(0, 'dala_overpowered').run();
	const card = state.players[0].hand.find(c => c.id === 't_v');
	E.playCard(state, 0, card.uid, null);
	ok('Overpowered: creature replayed (2 on board)', state.players[0].board.filter(c => c.id === 't_v').length === 2);
}
// Fly-By: Kadoom Bot detonates on draw for 50
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['dala_fly_by']).play(0, 'dala_fly_by').run();
	ok('Fly-By: bot in enemy deck', state.players[1].deck.includes('dala_kadoom_bot'));
	state.players[1].deck = ['dala_kadoom_bot'];
	const life = state.players[1].life;
	E.drawCards(state, 1, 1);
	ok('Kadoom Bot: detonated for 50 on draw', state.players[1].life <= life - 40 || state.players[1].eliminated || state.over,
		`life ${state.players[1].life}`);
}
// Elistra: recasts the spells played this game
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] })
		.mana(0, 20).hand(0, ['t_bolt', 'dala_elistra_the_immortal']).run();
	const bolt = state.players[0].hand.find(c => c.id === 't_bolt');
	E.playCard(state, 0, bolt.uid, null);
	const life = state.players[1].life;
	const el = state.players[0].hand.find(c => c.id === 'dala_elistra_the_immortal');
	E.playCard(state, 0, el.uid, null);
	ok('Elistra: bolt recast (another 3 to face)', state.players[1].life === life - 3, state.players[1].life);
}
// Soulreaper's Scythe: kills return on weapon deathrattle
{
	const { state } = new Scenario(byId)
		.def('t_prey', { type: 'creature', cost: 1, attack: 0, health: 1 })
		.mana(0, 10).board(1, ['t_prey']).hand(0, ['dala_soulreapers_scythe']).run();
	const w = state.players[0].hand.find(c => c.id === 'dala_soulreapers_scythe');
	E.playCard(state, 0, w.uid, null);
	E.heroAttack(state, 0, { type: 'creature', uid: state.players[1].board[0].uid, player: 1 });
	ok('Scythe: kill logged', (state.players[0].weapon?._reaped || []).includes('t_prey'));
	state.players[0].weapon.durability = 1;
	E.degradeWeapon(state, 0);
	ok('Scythe deathrattle: the kill is resummoned', state.players[0].board.some(c => c.id === 't_prey'));
}
// Duplatransmogrifier: deck minions become the target
{
	const { state } = new Scenario(byId)
		.def('t_m', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_star', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).deck(0, ['t_m', 't_m', 't_sp']).board(0, ['t_star']).hand(0, ['dala_duplatransmogrifier'])
		.play(0, 'dala_duplatransmogrifier', { targetBoard: [0, 0] }).run();
	const p = state.players[0];
	ok('Duplatransmogrifier: creatures now copies, spell untouched',
		p.deck.filter(id => id === 't_star').length === 2 && p.deck.includes('t_sp'), p.deck.join());
}
// Big Boomba: board wipe now AND at the start of your next turn
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(1, ['t_c']).hand(0, ['dala_big_boomba'])
		.play(0, 'dala_big_boomba').run();
	ok('Big Boomba: first wipe', state.players[1].board.length === 0);
	const c2 = Object.assign(E.instantiate(byId['t_c'] || { id: 't_c', name: 't', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' }, 1), { zone: 'board' });
	state.players[1].board.push(c2);
	E.endTurn(state); // their turn
	E.endTurn(state); // back to me: delayed wipe fires
	ok('Big Boomba: round two at my turn start', state.players[1].board.length === 0, state.players[1].board.length);
}
// Banana Split: +2/+2 then two copies at the buffed stats
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ['dala_banana_split'])
		.play(0, 'dala_banana_split', { targetBoard: [0, 0] }).run();
	const all = state.players[0].board.filter(c => c.id === 't_c');
	ok('Banana Split: three 3/3s total', all.length === 3 && all.every(c => c.attack === 3 && E.hp(c) === 3), all.map(c => c.attack).join());
}
// Master Scheme upgrades each turn held
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_master_scheme']).run();
	E.endTurn(state); E.endTurn(state); E.endTurn(state); E.endTurn(state); // held 2 of my turn starts
	const ms = state.players[0].hand.find(c => c.id === 'dala_master_scheme');
	ok('Master Scheme leveled to 3', ms._schemeLevel === 3, ms._schemeLevel);
	const deckN = state.players[0].deck.length;
	E.playCard(state, 0, ms.uid, null);
	ok('Master Scheme: 3 Boom Bots', state.players[0].board.filter(c => c.id === 'boom_bot').length === 3);
	ok('Master Scheme: 3 armor', state.players[0].armor === 3, state.players[0].armor);
}
// Sow the Seeds: deck minions drawn later carry +3/+3
{
	const { state } = new Scenario(byId)
		.def('t_m', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, ['t_m']).hand(0, ['dala_sow_the_seeds'])
		.play(0, 'dala_sow_the_seeds').run();
	E.drawCards(state, 0, 1);
	const c = state.players[0].hand.find(x => x.id === 't_m');
	ok('Sow the Seeds: drawn minion is 4/4', c && c.attack === 4 && c.maxHealth === 4, c && `${c.attack}/${c.maxHealth}`);
}
// Dagwik: attacking the hero steals a card
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['dala_dagwik_stickytoe']).hand(1, ['t_held']).run();
	const d = state.players[0].board[0];
	d.sick = false;
	E.attack(state, 0, d.uid, { type: 'hero', player: 1 });
	ok('Dagwik: stole the card', state.players[0].hand.some(c => c.id === 't_held') && state.players[1].hand.length === 0);
}
// Murgatha: enemy overloads when you play cards
{
	const { state } = new Scenario(byId)
		.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).board(0, ['dala_murgatha']).hand(0, ['t_sp']).run();
	const sp = state.players[0].hand.find(c => c.id === 't_sp');
	E.playCard(state, 0, sp.uid, null);
	ok('Murgatha: enemy overloaded 1', (state.players[1].overloadPending || 0) >= 1, state.players[1].overloadPending);
}
// The Box / Shifting Chameleon: in-hand morphs
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['dala_the_box', 'dala_shifting_chameleon']).run();
	E.endTurn(state); E.endTurn(state); // back to my turn start: both morph
	const h = state.players[0].hand;
	ok('The Box became a treasure', h.some(c => byId[c.id]?.treasure && c.id !== 'dala_the_box'), h.map(c => c.id).join());
	ok('Chameleon became a 1-cost minion', h.some(c => c.id !== 'dala_shifting_chameleon' && byId[c.id]?.type === 'creature' && (byId[c.id].cost || 0) === 1));
}
// Loyal Henchman: drawn at start of game + grows in hand
{
	const { state } = new Scenario(byId)
		.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, ['t_f', 't_f']).hand(0, ['dala_loyal_henchman']).run();
	const hm = state.players[0].hand.find(c => c.id === 'dala_loyal_henchman');
	E.endTurn(state); E.endTurn(state);
	ok('Henchman grew to 2/2 in hand', hm.attack === 2 && hm.maxHealth === 2, `${hm.attack}/${hm.maxHealth}`);
}
// ---- hero powers ----
{
	const { state } = new Scenario(byId)
		.def('t_hurt', { type: 'creature', cost: 3, attack: 3, health: 6 })
		.mana(0, 20).board(0, ['t_hurt']).run();
	const c = state.players[0].board[0];
	c.damage = 4;
	usePower(state, 0, 'dala_lifebloom', { type: 'creature', uid: c.uid, player: 0 });
	ok('Lifebloom: full heal', c.damage === 0, c.damage);
	usePower(state, 0, 'dala_touch_of_bark', { type: 'creature', uid: c.uid, player: 0 });
	ok('Touch of Bark: +1/+1', c.attack === 4 && E.hp(c) === 7);
}
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'dala_backup');
	ok('Backup!: three recruits in hand', state.players[0].hand.filter(c => c.id === 'silver_hand_recruit').length === 3);
	usePower(state, 0, 'dala_pet_training');
	ok('Pet Training: chameleon in hand', state.players[0].hand.some(c => c.id === 'dala_shifting_chameleon'));
}
{
	const { state } = new Scenario(byId)
		.def('t_frozen', { type: 'creature', cost: 2, attack: 2, health: 4 })
		.mana(0, 20).board(1, ['t_frozen']).run();
	const c = state.players[1].board[0];
	usePower(state, 0, 'dala_frostburn', { type: 'creature', uid: c.uid, player: 1 });
	ok('Frostburn: froze it', !!c.frozen);
	usePower(state, 0, 'dala_frostburn', { type: 'creature', uid: c.uid, player: 1 });
	ok('Frostburn: frozen target takes 2 instead', c.damage === 2, c.damage);
}
{
	const { state } = new Scenario(byId)
		.def('t_swap', { type: 'creature', cost: 2, attack: 1, health: 5 })
		.mana(0, 20).board(0, ['t_swap']).run();
	const c = state.players[0].board[0];
	usePower(state, 0, 'dala_distort', { type: 'creature', uid: c.uid, player: 0 });
	ok('Distort: stats swapped', c.attack === 5 && E.hp(c) === 1, `${c.attack}/${E.hp(c)}`);
}
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	const life = state.players[0].life;
	usePower(state, 0, 'dala_the_pact');
	ok('The Pact: took 2, Imp summoned', state.players[0].life === life - 2 && state.players[0].board.some(c => c.name === 'Devious Imp'));
	usePower(state, 0, 'dala_undermine');
	ok('Undermine: two Explosives in enemy deck', state.players[1].deck.filter(id => id === 'dala_improvised_explosive').length === 2);
}
{
	const { state } = new Scenario(byId)
		.def('t_ev', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).board(0, ['t_ev']).run();
	usePower(state, 0, 'dala_evolution', { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Evolution: transformed into something else', state.players[0].board.length === 1 && state.players[0].board[0].id !== 't_ev', state.players[0].board[0]?.id);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
