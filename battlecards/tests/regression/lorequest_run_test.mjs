// Lorequest run logic: deck build (2x15=30), starter choice, enemy roster (PW first 8 then bosses),
// WIN-parity loot budget, enemy generation, and the engine integration a boot performs.
import fs from 'fs';
import * as LQ from '../../lorequest.js';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- rosters ----
ok('16 planeswalkers', LQ.PLANESWALKERS.length === 16);
ok('21 bosses', LQ.BOSSES.length === 21);
ok('all 37 have a valid class', [...LQ.PLANESWALKERS, ...LQ.BOSSES].every(c => LQ.classOf(c) &&
	['warrior','rogue','mage','paladin','priest','shaman','warlock','hunter','druid','demon_hunter','death_knight'].includes(LQ.classOf(c))));
ok('12 wins / 3 losses', LQ.WINS_TO_CLEAR === 12 && LQ.LOSSES_TO_END === 3);

// ---- deckOf = 30 cards (2 copies of each of 15) ----
for (const ch of [...LQ.PLANESWALKERS, ...LQ.BOSSES]) {
	const deck = LQ.deckOf(byId, ch);
	const uniq = new Set(deck);
	ok(`${ch}: 30-card deck`, deck.length === 30, deck.length);
	ok(`${ch}: 15 distinct cards x2`, uniq.size === 15 && [...uniq].every(id => deck.filter(x => x === id).length === 2), uniq.size);
	ok(`${ch}: every card id resolves`, [...uniq].every(id => byId[id]));
}

// ---- starter choices: 3 distinct planeswalkers ----
{
	const c = LQ.starterChoices(seededRng(3), 3);
	ok('3 distinct planeswalker starters', c.length === 3 && new Set(c).size === 3 && c.every(x => LQ.PLANESWALKERS.includes(x)), c);
}

// ---- enemy roster: planeswalkers for battles 1-8 (games 0-7), bosses for 9+ ----
ok('games 0..7 => planeswalker roster', [0,3,7].every(g => LQ.enemyRosterFor(g) === LQ.PLANESWALKERS));
ok('games 8+ => boss roster', [8,11].every(g => LQ.enemyRosterFor(g) === LQ.BOSSES));

// ---- WIN-parity loot budget ----
ok('enemyLoot(0) = 0 buckets', LQ.enemyLoot(0).buckets === 0 && LQ.enemyLoot(0).treasures === 0);
ok('enemyLoot(5) = 5 buckets, 2 treasures', LQ.enemyLoot(5).buckets === 5 && LQ.enemyLoot(5).treasures === 2, JSON.stringify(LQ.enemyLoot(5)));
ok('enemyLoot(11) = 11 buckets, 4 treasures', LQ.enemyLoot(11).buckets === 11 && LQ.enemyLoot(11).treasures === 4, JSON.stringify(LQ.enemyLoot(11)));

// ---- generateEnemy: base 30 + wins buckets(x3) + treasures, all ids resolve ----
for (const wins of [0, 3, 8]) {
	const gen = LQ.generateEnemy(byId, 'Kozilek', wins, seededRng(7 + wins));
	ok(`enemy@${wins} wins deck >= 30 + ${wins}*3`, gen.deck.length >= 30 + wins * 3, gen.deck.length);
	ok(`enemy@${wins} wins all ids resolve`, gen.deck.every(id => byId[id]), gen.deck.filter(id => !byId[id]).slice(0, 3));
}

// ---- randomEnemy avoids self + immediate repeat ----
{
	const e = LQ.randomEnemy(0, seededRng(9), 'Chandra', 'Ajani');
	ok('randomEnemy (games 0) is a planeswalker, not self/avoid', LQ.PLANESWALKERS.includes(e) && e !== 'Chandra' && e !== 'Ajani', e);
	const b = LQ.randomEnemy(8, seededRng(9), null, 'Ajani');
	ok('randomEnemy (games 8) is a boss', LQ.BOSSES.includes(b), b);
}

// ---- engine integration: a boot seats both sides + loads decks + draws, cleanly ----
{
	const playerDeck = LQ.deckOf(byId, 'Chandra');
	const gen = LQ.generateEnemy(byId, 'Ulamog', 4, seededRng(5));
	const picks = [{ id: 'mage', name: 'Chandra', power: null }, { id: 'warrior', name: 'Ulamog', power: null }];
	let threw = null; let st;
	try {
		st = E.createGame(byId, seededRng(2), [...playerDeck], 2, picks);
		E.resetDeckAndHand(st, 1, [...gen.deck]);
		E.drawCards(st, 1, 4);
		E.stripLoadouts && E.stripLoadouts(st);
	} catch (e) { threw = e; }
	ok('boot builds a Lorequest game without throwing', !threw, threw && threw.message);
	const v = st && validateGameState(st);
	ok('booted game state is valid', !threw && (!v || v.length === 0), v);
	ok('player deck seated (>= starting hand drawn)', !threw && st.players[0].hand.length > 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
