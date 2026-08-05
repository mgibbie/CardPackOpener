// Secret-reward unlock wave 2: transform/counter the triggering minion + copy-on-attacked.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_big = { id: 't_big', name: 'Big', type: 'creature', cost: 6, attack: 6, health: 6 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const arm = (st, id) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, null, null, 0); };
const enemyPlays = (st, id) => { const m = E.instantiate(cardsById[id], 1); m.zone = 'hand'; st.players[1].hand.push(m); st.players[1].mana.cur = 10; E.playCard(st, 1, m.uid, null, null, 0); return st.players[1].board.find(c => c.id === id); };
const enemyBoard = (st, atk = 6, hp = 6) => { const m = E.instantiate({ id: 'atk', name: 'Atk', type: 'creature', cost: 3, attack: atk, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendlyBoard = (st, atk = 3, hp = 5) => { const m = E.instantiate({ id: 'my', name: 'My', type: 'creature', cost: 3, attack: atk, health: hp }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };

for (const id of ['potion_of_polymorph', 'mystic_misdirection', 'objection', 'splitting_image', 'vengeful_visage']) ok(`${id} present`, cardsById[id], id);

// Potion of Polymorph: opponent plays a minion -> transform it into a 1/1 Sheep
{
	const st = game(); arm(st, 'potion_of_polymorph');
	st.current = 1;
	enemyPlays(st, 't_big'); // 6/6 -> Sheep
	const sheep = st.players[1].board.find(c => c.name === 'Sheep');
	ok('Potion of Polymorph: enemy minion is now a 1/1 Sheep', sheep && sheep.attack === 1 && E.hp(sheep) === 1, sheep && [sheep.attack, E.hp(sheep)]);
	ok('the original 6/6 is gone', !st.players[1].board.some(c => c.id === 't_big'), st.players[1].board.map(c => c.id));
}

// Objection!: opponent plays a minion -> Counter it (removed silently)
{
	const st = game(); arm(st, 'objection');
	st.current = 1;
	const before = st.players[1].board.length;
	enemyPlays(st, 't_big');
	ok('Objection! countered the played minion (not on board)', !st.players[1].board.some(c => c.id === 't_big'), st.players[1].board.map(c => c.id));
}

// Mystic Misdirection: an enemy minion attacks -> transform it into a 1/1 Sheep
{
	const st = game(); arm(st, 'mystic_misdirection');
	st.current = 1;
	const attacker = enemyBoard(st, 6, 6);
	E.attack(st, 1, attacker.uid, { type: 'hero', player: 0 });
	const sheep = st.players[1].board.find(c => c.name === 'Sheep');
	ok('Mystic Misdirection: the attacker became a 1/1 Sheep', sheep && sheep.attack === 1, sheep && sheep.attack);
	ok('the attacker did not deal its 6 to my hero', st.players[0].life >= 40 - 1, st.players[0].life);
}

// Splitting Image: one of your minions is attacked -> summon a copy of it
{
	const st = game(); arm(st, 'splitting_image');
	const mine = friendlyBoard(st, 3, 8);
	st.current = 1;
	const attacker = enemyBoard(st, 2, 5);
	E.attack(st, 1, attacker.uid, { type: 'creature', uid: mine.uid, player: 0 });
	ok('Splitting Image: a copy of the attacked minion was summoned', st.players[0].board.filter(c => c.name === 'My').length === 2, st.players[0].board.filter(c => c.name === 'My').length);
}

// Vengeful Visage: enemy minion attacks your hero -> summon a copy that hits the enemy hero
{
	const st = game(); arm(st, 'vengeful_visage');
	st.current = 1;
	const attacker = enemyBoard(st, 4, 6);
	const enemyHeroBefore = st.players[1].life;
	E.attack(st, 1, attacker.uid, { type: 'hero', player: 0 });
	ok('Vengeful Visage: a copy of the attacker was summoned for you', st.players[0].board.some(c => c.attack === 4), st.players[0].board.map(c => c.attack));
	ok('the copy attacked the enemy hero (4 damage)', st.players[1].life === enemyHeroBefore - 4, [enemyHeroBefore, st.players[1].life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
