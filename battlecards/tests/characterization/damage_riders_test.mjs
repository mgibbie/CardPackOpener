// damage_riders_test.mjs — dedicated damage-rider characterization BEFORE the
// PR 11 engine/damage.js extraction (docs/09 rates this move HIGH risk; every
// rider family on damageCreature / damageHero / gainArmor / healHero gets a
// pin here first). All tests drive the PUBLIC surface (plays, attacks,
// E.damageHero) so the identical assertions verify the engine after the move.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const BOLT = { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 3, target: 'creature' }] };
const scen = () => new Scenario(byId).def('t_bolt', BOLT).mana(0, 10);

// ---------- damageCreature riders ----------
// --- divine shield: pops once, absorbs everything ---
{
	const { state } = scen()
		.def('t_ds', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['divine_shield'] })
		.board(1, ['t_ds']).hand(0, ['t_bolt', 't_bolt'])
		.play(0, 't_bolt', { targetBoard: [1, 0] })
		.run();
	const c = state.players[1].board[0];
	ok('divine shield: first hit absorbed', c.damage === 0 && c.shield === false);
	E.playCard(state, 0, state.players[0].hand.find(x => x.id === 't_bolt').uid, { type: 'creature', uid: c.uid, player: 1 }, null, 0);
	ok('divine shield: second hit lands', c.damage === 3);
}
// --- Immune keyword + temporary immuneTurn ---
{
	const { state } = scen()
		.def('t_imm', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['immune'] })
		.def('t_plain', { type: 'creature', cost: 2, attack: 2, health: 4 })
		.board(1, ['t_imm', 't_plain']).hand(0, ['t_bolt', 't_bolt'])
		.play(0, 't_bolt', { targetBoard: [1, 0] })
		.run();
	ok('IMMUNE: takes nothing', state.players[1].board[0].damage === 0);
	const plain = state.players[1].board[1];
	plain.immuneTurn = state.turnNumber;
	E.playCard(state, 0, state.players[0].hand.find(x => x.id === 't_bolt').uid, { type: 'creature', uid: plain.uid, player: 1 }, null, 0);
	ok('immuneTurn: temporary immunity holds this turn', plain.damage === 0);
}
// --- deathtouch / venomous (one-shot) / poisonous via combat ---
{
	const { state } = new Scenario(byId)
		.def('t_dt', { type: 'creature', cost: 1, attack: 1, health: 9, keywords: ['deathtouch'] })
		.def('t_big', { type: 'creature', cost: 5, attack: 0, health: 9 })
		.board(0, ['t_dt']).board(1, ['t_big'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('deathtouch: 1 damage destroys the 9-health target', state.players[1].board.length === 0
		&& state.players[1].graveyard.some(c => c.id === 't_big'));
}
{
	const { state } = new Scenario(byId)
		.def('t_ven', { type: 'creature', cost: 1, attack: 1, health: 9, keywords: ['venomous'] })
		.def('t_big', { type: 'creature', cost: 5, attack: 0, health: 9 })
		.board(0, ['t_ven']).board(1, ['t_big', 't_big'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('venomous: kills like deathtouch once', state.players[1].board.length === 1);
	ok('venomous: spent after the first kill', !state.players[0].board[0].keywords.includes('venomous'));
}
{
	const { state } = new Scenario(byId)
		.def('t_poi', { type: 'creature', cost: 1, attack: 1, health: 9, keywords: ['poisonous'] })
		.def('t_big', { type: 'creature', cost: 5, attack: 0, health: 9 })
		.board(0, ['t_poi']).board(1, ['t_big'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	const big = state.players[1].board[0];
	ok('poisonous: no instant kill — poisoned condition', big.poisoned === true && big.damage === 1);
	E.endTurn(state); E.endTurn(state); // poison ticks at the VICTIM controller's end of turn
	ok('poison ticks 2 at victim-controller end of turn', big.damage === 3, big.damage);
}
// --- tribeDamageBoost (Goldrinn family): +N and double ---
{
	const { state } = new Scenario(byId)
		.def('t_wolf', { type: 'creature', cost: 1, attack: 2, health: 9, tribe: 'Beast' })
		.def('t_totem', { type: 'creature', cost: 1, attack: 0, health: 9, tribeDamageBoost: { tribe: 'Beast', amount: 2 } })
		.def('t_tgt', { type: 'creature', cost: 1, attack: 0, health: 9 })
		.board(0, ['t_wolf', 't_totem']).board(1, ['t_tgt'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('tribeDamageBoost +2: Beast hits for 4', state.players[1].board[0].damage === 4);
}
{
	const { state } = new Scenario(byId)
		.def('t_wolf', { type: 'creature', cost: 1, attack: 2, health: 9, tribe: 'Beast' })
		.def('t_gold', { type: 'creature', cost: 1, attack: 0, health: 9, tribeDamageBoost: { tribe: 'Beast', double: true } })
		.def('t_tgt', { type: 'creature', cost: 1, attack: 0, health: 9 })
		.board(0, ['t_wolf', 't_gold']).board(1, ['t_tgt'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('tribeDamageBoost double: Beast hits for 4', state.players[1].board[0].damage === 4);
}
// --- undamagedFoesDouble (Talgath): first hit doubled, later hits normal ---
{
	const { state } = scen()
		.def('t_talgath', { type: 'creature', cost: 5, attack: 3, health: 9, undamagedFoesDouble: true })
		.def('t_tgt', { type: 'creature', cost: 1, attack: 0, health: 9 })
		.board(0, ['t_talgath']).board(1, ['t_tgt']).hand(0, ['t_bolt', 't_bolt'])
		.play(0, 't_bolt', { targetBoard: [1, 0] })
		.run();
	const tgt = state.players[1].board[0];
	ok('undamagedFoesDouble: undamaged foe takes 6', tgt.damage === 6);
	E.playCard(state, 0, state.players[0].hand.find(x => x.id === 't_bolt').uid, { type: 'creature', uid: tgt.uid, player: 1 }, null, 0);
	ok('undamagedFoesDouble: damaged foe takes normal 3', tgt.damage === 9);
}
// --- Snapjaw Shellfighter: adjacent neighbor soaks the hit ---
{
	const { state } = scen()
		.def('t_tgt', { type: 'creature', cost: 1, attack: 0, health: 9 })
		.board(1, [{ id: 't_tgt' }, 'snapjaw_shellfighter'])
		.hand(0, ['t_bolt'])
		.play(0, 't_bolt', { targetBoard: [1, 0] })
		.run();
	ok('snapjaw soaks the neighbor hit', state.players[1].board[0].damage === 0
		&& state.players[1].board[1].damage === 3, state.players[1].board.map(c => c.damage).join(','));
}
// --- minionsSurviveTurn (Commanding Shout): floor at 1 health ---
{
	const { state } = scen()
		.def('t_frail', { type: 'creature', cost: 1, attack: 0, health: 2 })
		.board(0, ['t_frail'])
		.run();
	state.players[0].minionsSurviveTurn = state.turnNumber;
	const frail = state.players[0].board[0];
	E.playCard(state, 0, (() => { const s2 = state.players[0]; s2.deck.push('t_bolt'); E.drawCards(state, 0, 1); return s2.hand.at(-1).uid; })(), { type: 'creature', uid: frail.uid, player: 0 }, null, 0);
	ok('minionsSurviveTurn: survives at 1 health, not doomed', frail.damage === frail.maxHealth - 1 && !frail.doomed && state.players[0].board.length === 1);
}
// --- self-damaged triggers: plain fires, survives-gated skips on lethal ---
{
	const { state } = scen()
		.def('t_reactor', { type: 'creature', cost: 2, attack: 1, health: 9, ongoing: { on: 'self-damaged', effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_reactor']).hand(0, ['t_bolt'])
		.play(0, 't_bolt', { targetBoard: [0, 0] })
		.run();
	ok('self-damaged trigger fires', state.players[0].armor === 1);
}
{
	const { state } = scen()
		.def('t_fragile', { type: 'creature', cost: 2, attack: 1, health: 2, ongoing: { on: 'self-damaged', survives: true, effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_fragile']).hand(0, ['t_bolt'])
		.play(0, 't_bolt', { targetBoard: [0, 0] })
		.run();
	ok('survives-gated trigger skips on lethal', state.players[0].armor === 0);
}
// ---------- damageHero riders ----------
// --- armor absorbs before life; pierce bypasses ---
{
	const { state } = new Scenario(byId).run();
	const p = state.players[0];
	p.armor = 5;
	const dealt = E.damageHero(state, 0, 7, 1);
	ok('armor: 5 absorbed, 2 to life; returns life damage', p.armor === 0 && p.life === 38 && dealt === 2);
	p.armor = 5;
	const dealt2 = E.damageHero(state, 0, 3, 1, true);
	ok('pierce: armor untouched, all to life', p.armor === 5 && p.life === 35 && dealt2 === 3);
	ok('damage tracking: heroDamageTakenThisTurn accumulates', p.heroDamageTakenThisTurn === 5);
}
// --- heroShield (Curious Cumulus): one-shot full absorb — BOTH paths ---
{
	const { state } = new Scenario(byId).run();
	const p = state.players[0];
	p.heroShield = true;
	E.damageHero(state, 0, 9, 1);
	ok('heroShield: absorbs the armor-path hit', p.life === 40 && p.heroShield === false);
	p.heroShield = true;
	E.damageHero(state, 0, 9, 1, true);
	ok('heroShield: absorbs the pierce-path hit too', p.life === 40 && p.heroShield === false);
}
// --- heroImmuneTurn + Mal'Ganis-style aura ---
{
	const { state } = new Scenario(byId)
		.def('t_malg', { type: 'creature', cost: 5, attack: 5, health: 5, heroImmuneAura: true })
		.board(0, ['t_malg'])
		.run();
	E.damageHero(state, 0, 6, 1);
	ok('heroImmuneAura: hero takes nothing while the minion lives', state.players[0].life === 40);
	state.players[0].board[0].damage = 5; // dead aura holder
	E.damageHero(state, 0, 6, 1);
	ok('heroImmuneAura: dead holder stops protecting', state.players[0].life === 34);
}
// --- redirectHeroDamage (Bolf Ramshield) ---
{
	const { state } = new Scenario(byId)
		.def('t_bolf', { type: 'creature', cost: 5, attack: 3, health: 9, redirectHeroDamage: true })
		.board(0, ['t_bolf'])
		.run();
	E.damageHero(state, 0, 4, 1);
	ok('Bolf: creature takes the hero damage', state.players[0].life === 40 && state.players[0].board[0].damage === 4);
}
// --- healToMaxHealth (Arisen Onyxia): own-turn damage becomes max health ---
{
	const { state } = new Scenario(byId)
		.def('t_onyxia', { type: 'creature', cost: 9, attack: 8, health: 8, healToMaxHealth: true })
		.board(0, ['t_onyxia'])
		.run();
	E.damageHero(state, 0, 5, 1); // player 0's own turn
	const p = state.players[0];
	ok('Onyxia: own-turn hero damage becomes +life/+maxLife', p.life === 45 && p.maxLife === 45);
}
// --- Husk: corpses save the hero at lethal — both paths ---
{
	const { state } = new Scenario(byId).run();
	const p = state.players[0];
	p.corpses = 8; p.heroDeathrattleCorpses = true; p.life = 5;
	E.damageHero(state, 0, 9, 1);
	ok('Husk (armor path): revives on corpses', p.life === 8 && p.corpses === 0 && p.heroDeathrattleCorpses === false);
	p.corpses = 6; p.heroDeathrattleCorpses = true; p.life = 5;
	E.damageHero(state, 0, 9, 1, true);
	ok('Husk (pierce path): revives on corpses too', p.life === 6 && p.corpses === 0);
}
// ---------- gainArmor / healHero riders ----------
// --- armor effect: counters + Odyn ---
{
	const { state } = scen()
		.def('t_plate', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 4 }] })
		.hand(0, ['t_plate'])
		.run();
	const p = state.players[0];
	p.odynActive = true;
	E.playCard(state, 0, p.hand.find(c => c.id === 't_plate').uid, null, null, 0);
	ok('gainArmor: armor + game counter + turn flag', p.armor === 4 && p.armorGainedGame === 4 && p.armorChangedThisTurn === true);
	ok('Odyn: armor also grants hero attack', p.heroTempAttack === 4);
}
// --- heal above starting life is legal; heal lock blocks ---
{
	const { state } = scen()
		.def('t_potion', { type: 'sorcery', cost: 0, effects: [{ type: 'heal', value: 5, target: 'own-hero' }] })
		.hand(0, ['t_potion', 't_potion'])
		.run();
	const p = state.players[0];
	E.playCard(state, 0, p.hand.find(c => c.id === 't_potion').uid, null, null, 0);
	ok('heal above starting life allowed (MTG-style)', p.life === 45);
	ok('healed trackers: amount + turn flag', p.healedAmountThisTurn === 5 && p.healedThisTurn === true);
	p.healLockUntilTurn = state.turnNumber + 5;
	E.playCard(state, 0, p.hand.find(c => c.id === 't_potion').uid, null, null, 0);
	ok('healLockUntilTurn: healing blocked', p.life === 45);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
