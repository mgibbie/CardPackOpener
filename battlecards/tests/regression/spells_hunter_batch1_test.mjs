// Hunter spell-import batch 1 — traps vs secrets + the unlock effects.
// Traps (Dart/Ice/Rat Trap) live in p.traps and fire identically to secrets
// but are NOT counted by secret-synergy.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_big = { id: 't_big', name: 'Big', type: 'creature', cost: 6, attack: 6, health: 6 };
cardsById.t_bolt = { id: 't_bolt', name: 'Bolt', type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 0 }] };
cardsById.t_dr = { id: 't_dr', name: 'DR', type: 'creature', cost: 3, attack: 2, health: 2, keywords: ['deathrattle'], effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const HP = { name: 'Steady Shot', cost: 2, text: 'Deal 2 damage to the enemy hero.', effects: [{ type: 'damage', value: 2, target: 'enemy-heroes' }] };
const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: HP }, { id: 'hunter', name: 'N', power: HP }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const arm = (st, id) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, null, null, 0); return s; };
const enemyPlays = (st, id) => { const m = E.instantiate(cardsById[id], 1); m.zone = 'hand'; st.players[1].hand.push(m); st.players[1].mana.cur = 10; E.playCard(st, 1, m.uid, null, null, 0); return st.players[1].board.find(c => c.id === id); };
const enemyBoard = (st, atk = 6, hp = 6) => { const m = E.instantiate({ id: 'atk', name: 'Atk', type: 'creature', cost: 3, attack: atk, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendlyBoard = (st, atk = 3, hp = 5) => { const m = E.instantiate({ id: 'my', name: 'My', type: 'creature', cost: 3, attack: atk, health: hp }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };

for (const id of ['dart_trap', 'ice_trap', 'rat_trap', 'bait_and_switch', 'emergency_maneuvers', 'wandering_monster', 'motion_denied', 'fetch', 'carrion_studies', 'toxic_reinforcements', 'awakening_tremors'])
	ok(`${id} present`, cardsById[id], id);

// The three traps are type 'trap' and land in p.traps (not p.secrets)
{
	const st = game();
	arm(st, 'dart_trap'); arm(st, 'ice_trap'); arm(st, 'rat_trap');
	ok('all 3 traps live in p.traps', st.players[0].traps.length === 3, st.players[0].traps.length);
	ok('none are in p.secrets', st.players[0].secrets.length === 0, st.players[0].secrets.length);
	for (const id of ['dart_trap', 'ice_trap', 'rat_trap']) ok(`${id} is type trap`, cardsById[id].type === 'trap' && cardsById[id].trap && !cardsById[id].secret, cardsById[id].type);
}

// Dart Trap: opposing Hero Power used -> 5 to a random enemy
{
	const st = game(); arm(st, 'dart_trap');
	st.current = 1; st.players[1].mana.cur = 10;
	const foe = enemyBoard(st, 1, 9);
	const pw = st.players[1].heroPowers[0];
	E.useHeroPower(st, 1, pw.uid, null);
	ok('Dart Trap sprang (left p.traps)', st.players[0].traps.length === 0, st.players[0].traps.length);
	ok('Dart Trap dealt 5 to a random enemy character', st.players[1].life === 40 - 5 || foe.damage === 5, [st.players[1].life, foe.damage]);
}

// Ice Trap: opponent casts a spell -> countered + returned to their hand at +1 cost
{
	const st = game(); arm(st, 'ice_trap');
	st.current = 1;
	const sp = E.instantiate(cardsById.t_bolt, 1); sp.zone = 'hand'; st.players[1].hand.push(sp); st.players[1].mana.cur = 10;
	E.playCard(st, 1, sp.uid, null, null, 0);
	const returned = st.players[1].hand.find(c => c.id === 't_bolt');
	ok('Ice Trap returned the spell to the caster hand', !!returned, st.players[1].hand.map(c => c.id));
	ok('the returned spell costs (1) more', returned && returned.cost === 2, returned && returned.cost);
}

// Rat Trap: opponent plays their 3rd card in a turn -> summon a 6/6 Rat
{
	const st = game(); arm(st, 'rat_trap');
	st.current = 1; st.players[1].cardsPlayedThisTurn = 0;
	enemyPlays(st, 't_big'); enemyPlays(st, 't_big'); // 2 cards, no trigger yet
	ok('Rat Trap not sprung before the 3rd card', st.players[0].traps.length === 1, st.players[0].traps.length);
	enemyPlays(st, 't_big'); // 3rd card -> trap fires
	ok('Rat Trap sprang on the 3rd card', st.players[0].traps.length === 0, st.players[0].traps.length);
	ok('a 6/6 Rat was summoned for the trap owner', st.players[0].board.some(c => c.name === 'Rat' && c.attack === 6), st.players[0].board.map(c => c.name));
}

// Bait and Switch (Secret): a friendly minion is attacked -> it gets +3/+3
{
	const st = game(); arm(st, 'bait_and_switch');
	const mine = friendlyBoard(st, 2, 6);
	st.current = 1;
	const attacker = enemyBoard(st, 1, 9);
	E.attack(st, 1, attacker.uid, { type: 'creature', uid: mine.uid, player: 0 });
	ok('Bait and Switch buffed the ATTACKED friendly minion to 5/9', mine.attack === 5 && mine.maxHealth === 9, [mine.attack, mine.maxHealth]);
}

// Emergency Maneuvers (Secret): friendly minion dies -> summon a Dormant copy
{
	const st = game(); arm(st, 'emergency_maneuvers');
	const mine = friendlyBoard(st, 4, 2); mine.id = 'my';
	cardsById.my = { id: 'my', name: 'My', type: 'creature', cost: 3, attack: 4, health: 2 };
	st.current = 1;
	mine.damage = mine.maxHealth; E.sweepDeaths(st);
	const copy = st.players[0].board.find(c => c.name === 'My');
	ok('Emergency Maneuvers summoned a copy', !!copy, st.players[0].board.map(c => c.name));
	ok('the copy is Dormant', copy && copy.dormantLeft > 0, copy && copy.dormantLeft);
}

// Wandering Monster (Secret): enemy attacks your hero -> summon a random 3-Cost minion
{
	const st = game(); arm(st, 'wandering_monster');
	st.current = 1;
	const attacker = enemyBoard(st, 4, 6);
	E.attack(st, 1, attacker.uid, { type: 'hero', player: 0 });
	// the summoned 3-Cost minion becomes the new target — the hero takes no damage
	ok('Wandering Monster fired and protected the hero (attack redirected)', st.players[0].secrets.length === 0 && st.players[0].life === 40, [st.players[0].secrets.length, st.players[0].life]);
}

// Motion Denied (Secret): opponent's 3rd card -> 6 to enemy hero
{
	const st = game(); arm(st, 'motion_denied');
	st.current = 1; st.players[1].cardsPlayedThisTurn = 0;
	const heroBefore = st.players[1].life;
	enemyPlays(st, 't_big'); enemyPlays(st, 't_big'); enemyPlays(st, 't_big');
	ok('Motion Denied dealt 6 to the enemy hero on the 3rd card', st.players[1].life === heroBefore - 6, [heroBefore, st.players[1].life]);
	ok('Motion Denied is a Secret (in p.secrets), not a trap', cardsById.motion_denied.type === 'secret', cardsById.motion_denied.type);
}

// Carrion Studies: your next Deathrattle minion costs (1) less
{
	const st = game();
	const s = E.instantiate(cardsById.carrion_studies, 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10;
	E.playCard(st, 0, s.uid, null, 0, 0); // discover picks index 0
	ok('Carrion Studies granted a next-Deathrattle discount', st.players[0].nextDeathrattleDiscount === 1, st.players[0].nextDeathrattleDiscount);
	const dr = E.instantiate(cardsById.t_dr, 0); dr.zone = 'hand'; st.players[0].hand.push(dr);
	ok('a Deathrattle minion now costs 1 less (3 -> 2)', E.effectiveCost(st, 0, dr) === 2, E.effectiveCost(st, 0, dr));
}

// Toxic Reinforcements: use your Hero Power 3 times -> summon three 1/1 Leper Gnomes
{
	const st = game();
	arm(st, 'toxic_reinforcements');
	ok('Toxic Reinforcements installed as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
	for (let i = 0; i < 3; i++) { st.players[0].mana.cur = 10; const pw = st.players[0].heroPowers[0]; pw.usedThisTurn = false; E.useHeroPower(st, 0, pw.uid, null); }
	ok('quest completed after 3 Hero Powers (gnomes on board)', st.players[0].board.filter(c => /gnome/i.test(c.name)).length === 3, st.players[0].board.map(c => c.name));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
