// Quick one-offs batch: Against All Odds, Wither, SW: Devour, Deadly Arsenal,
// Dew Process, Melomania, Forbidden Fruit, Blood Boil, Food Fight.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_one = { id: 't_one', name: 'One', type: 'creature', cost: 1, attack: 1, health: 4 };
byId.t_two = { id: 't_two', name: 'Two', type: 'creature', cost: 2, attack: 2, health: 4 };
byId.t_three = { id: 't_three', name: 'Three', type: 'creature', cost: 3, attack: 3, health: 4 };
byId.t_five = { id: 't_five', name: 'Five', type: 'creature', cost: 5, attack: 5, health: 5 };
byId.t_undead = { id: 't_undead', name: 'Ghoul', type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Undead' };
byId.t_axe = { id: 't_axe', name: 'Axe', type: 'weapon', cost: 2, attack: 3, durability: 2 };

function game() {
	const st = E.createGame(byId, seededRng(71), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(20).fill('t_one'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id, tgt = null, choice = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, choice, 0); return sp;
}
const tgtOf = c => ({ type: 'creature', uid: c.uid, player: c.controller });

// --- Against All Odds: odd-Attack minions die on both boards ---
{
	const st = game();
	const a1 = put(st, 0, 't_one'), a2 = put(st, 0, 't_two'), b3 = put(st, 1, 't_three'), b2 = put(st, 1, 't_two');
	cast(st, 'against_all_odds');
	ok('odds: odd-attack minions destroyed both sides', !st.players[0].board.includes(a1) && !st.players[1].board.includes(b3));
	ok('odds: even-attack minions survive', st.players[0].board.includes(a2) && st.players[1].board.includes(b2));
}
// --- Wither: friendly Undead steal 1/1 each from the chosen minion ---
{
	const st = game();
	const u1 = put(st, 0, 't_undead'), u2 = put(st, 0, 't_undead');
	const victim = put(st, 1, 't_five');
	cast(st, 'wither', tgtOf(victim));
	ok('wither: victim lost 2/2', victim.attack === 3 && victim.maxHealth === 3, [victim.attack, victim.maxHealth]);
	ok('wither: each Undead grew to 2/2', u1.attack === 2 && u1.maxHealth === 2 && u2.attack === 2 && u2.maxHealth === 2, [u1.attack, u1.maxHealth]);
}
// --- SW: Devour: chosen minion steals 1 Health from all others ---
{
	const st = game();
	const eater = put(st, 0, 't_two');
	const f = put(st, 0, 't_one'), e1 = put(st, 1, 't_five'), tiny = put(st, 1, 't_undead'); // 1-health: dies
	cast(st, 'shadow_word_devour', tgtOf(eater));
	ok('devour: eater gained +3 Health', eater.maxHealth === 7, eater.maxHealth);
	ok('devour: others each lost 1', f.maxHealth === 3 && e1.maxHealth === 4, [f.maxHealth, e1.maxHealth]);
	ok('devour: the 1-health minion died of it', !st.players[1].board.includes(tiny));
}
// --- Deadly Arsenal: reveal a deck weapon, its Attack hits all minions ---
{
	const st = game();
	st.players[0].deck = ['t_one', 't_axe', 't_one'];
	const m1 = put(st, 0, 't_five'), m2 = put(st, 1, 't_five');
	cast(st, 'deadly_arsenal');
	ok('arsenal: all minions took the axe attack (3)', E.hp(m1) === 2 && E.hp(m2) === 2, [E.hp(m1), E.hp(m2)]);
	ok('arsenal: the weapon stays in the deck', st.players[0].deck.includes('t_axe'));
}
// --- Dew Process: everyone draws an extra card at turn start ---
{
	const st = game();
	cast(st, 'dew_process');
	ok('dew: both players flagged', st.players.every(p => p.extraTurnDraw === 1), st.players.map(p => p.extraTurnDraw));
	const oppHand = st.players[1].hand.length;
	E.endTurn(st); // opponent's turn starts: mandatory 1 + extra 1
	ok('dew: opponent drew 2 at turn start', st.players[1].hand.length === oppHand + 2, st.players[1].hand.length - oppHand);
}
// --- Melomania: playing a minion this turn conjures a Shaman spell ---
{
	const st = game();
	cast(st, 'melomania');
	const c = E.instantiate(byId.t_one, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, c.uid, null, null, 0);
	const gained = st.players[0].hand.filter(x => x.id !== 't_one');
	ok('melomania: gained a Shaman spell', gained.length === 1 && E.isSpellType(gained[0]) && (gained[0].cardClass || '').includes('shaman'), gained.map(x => [x.id, x.cardClass]));
}
// --- Forbidden Fruit: spend-all-mana choose one ---
{
	const st = game();
	cast(st, 'forbidden_fruit', null, 0); // Attack this turn
	ok('fruit A: +10 hero Attack, mana spent', st.players[0].heroTempAttack === 10 && st.players[0].mana.cur === 0, [st.players[0].heroTempAttack, st.players[0].mana.cur]);
}
{
	const st = game();
	cast(st, 'forbidden_fruit', null, 1); // twice as much Armor
	ok('fruit B: 20 Armor', st.players[0].armor === 20, st.players[0].armor);
}
// --- Blood Boil: infected enemies take 2 at your turn ends, healing you ---
{
	const st = game();
	const e1 = put(st, 1, 't_five'), e2 = put(st, 1, 't_five');
	cast(st, 'blood_boil');
	const late = put(st, 1, 't_five'); // summoned after — not infected
	st.players[0].life = 20;
	E.endTurn(st);
	ok('boil: infected minions took 2', E.hp(e1) === 3 && E.hp(e2) === 3, [E.hp(e1), E.hp(e2)]);
	ok('boil: latecomer untouched', E.hp(late) === 5, E.hp(late));
	ok('boil: lifesteal healed the caster by the damage dealt', st.players[0].life === 24, st.players[0].life);
	E.endTurn(st); E.endTurn(st); // around again: the tick is permanent
	ok('boil: ticks again next turn', E.hp(e1) === 1 && st.players[0].life === 28, [E.hp(e1), st.players[0].life]);
}
// --- Food Fight: enemy gets a 0/4 Entrée; its death summons from YOUR deck ---
{
	const st = game();
	st.players[0].deck = ['t_five'];
	cast(st, 'food_fight');
	const entree = st.players[1].board.find(c => c.name === 'Entrée');
	ok('food: opponent owns the 0/4 Entrée', !!entree && entree.attack === 0 && entree.maxHealth === 4 && entree.controller === 1, entree && [entree.attack, entree.maxHealth]);
	entree.damage = entree.maxHealth; E.sweepDeaths(st);
	ok('food: its death summoned from the CASTER deck', st.players[0].board.some(c => c.id === 't_five') && st.players[0].deck.length === 0, st.players[0].board.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
