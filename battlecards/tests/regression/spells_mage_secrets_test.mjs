// Secret-trigger unlock wave: recover 5 Mage Secrets (Explosive Runes, Frozen Clone,
// Duplicate, Effigy, Flames of Infinity) + the new enemy-turn-end trigger.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_played = { id: 't_played', name: 'Played', type: 'creature', cost: 4, attack: 3, health: 3 };
cardsById.t_friend = { id: 't_friend', name: 'Friend', type: 'creature', cost: 5, attack: 2, health: 2 };
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
const friendlyPlays = (st, id) => { const m = E.instantiate(cardsById[id], 0); m.zone = 'hand'; st.players[0].hand.push(m); st.players[0].mana.cur = 10; E.playCard(st, 0, m.uid, null, null, 0); return st.players[0].board.find(c => c.id === id); };

for (const id of ['explosive_runes', 'frozen_clone', 'duplicate', 'effigy', 'flames_of_infinity']) ok(`${id} present`, cardsById[id], id);

// Explosive Runes: opponent plays a minion -> 6 to it + excess to their hero
{
	const st = game(); arm(st, 'explosive_runes');
	st.current = 1;
	const heroBefore = st.players[1].life;
	const foe = enemyPlays(st, 't_played'); // 3/3 -> takes 6, 3 excess to hero
	ok('Explosive Runes killed the played minion', !foe || foe.damage >= foe.maxHealth || !st.players[1].board.includes(foe), foe && foe.damage);
	ok('Explosive Runes: 3 excess to the enemy hero', st.players[1].life === heroBefore - 3, [heroBefore, st.players[1].life]);
}

// Frozen Clone: opponent plays a minion -> 2 copies to YOUR hand
{
	const st = game(); arm(st, 'frozen_clone');
	st.current = 1;
	enemyPlays(st, 't_played');
	ok('Frozen Clone: 2 copies of the played minion in your hand', st.players[0].hand.filter(c => c.id === 't_played').length === 2, st.players[0].hand.map(c => c.id));
}

// Duplicate: a friendly minion dies (on the opponent's turn) -> 2 copies into your hand
{
	const st = game(); arm(st, 'duplicate');
	const m = friendlyPlays(st, 't_friend');
	st.current = 1; // secrets fire on the opponent's turn (engine guards own-turn firing)
	m.damage = m.maxHealth; E.sweepDeaths(st);
	ok('Duplicate: 2 copies of the dead minion in hand', st.players[0].hand.filter(c => c.id === 't_friend').length === 2, st.players[0].hand.map(c => c.id));
}

// Effigy: a friendly minion dies -> summon a random minion of the same Cost
{
	const st = game(); arm(st, 'effigy');
	const m = friendlyPlays(st, 't_friend'); // cost 5
	st.current = 1;
	const boardBefore = st.players[0].board.filter(c => c.type === 'creature').length;
	m.damage = m.maxHealth; E.sweepDeaths(st);
	// the original t_friend died and was swept — the board now holds Effigy's replacement.
	// (Its random same-Cost pick may itself be a t_friend, which is legitimate, so don't filter by id.)
	const summoned = st.players[0].board.filter(c => c.type === 'creature');
	ok('Effigy summoned a replacement minion', summoned.length >= 1, st.players[0].board.map(c => c.id));
	ok('the replacement costs 5 (same as the dead minion)', summoned.length && summoned.every(c => (cardsById[c.id]?.cost) === 5), summoned.map(c => cardsById[c.id]?.cost));
}

// Flames of Infinity: when the enemy's turn ends -> destroy their highest-Health minion
{
	const st = game(); arm(st, 'flames_of_infinity');
	st.current = 1;
	const small = E.instantiate({ id: 's', name: 'S', type: 'creature', cost: 1, attack: 1, health: 2 }, 1); small.zone = 'board'; small.sick = false; st.players[1].board.push(small);
	const big = E.instantiate({ id: 'b', name: 'B', type: 'creature', cost: 1, attack: 1, health: 8 }, 1); big.zone = 'board'; big.sick = false; st.players[1].board.push(big);
	E.endTurn(st); // enemy's turn ends -> secret fires
	ok('Flames of Infinity destroyed the highest-Health minion', !st.players[1].board.includes(big) || big.damage >= big.maxHealth, big.damage);
	ok('the low-Health minion survived', st.players[1].board.includes(small) && small.damage < small.maxHealth, small.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
