// Wave 30: Souleater's Scythe — Start of Game: Consume 3 different minions in your
// deck. Leave behind Bound Souls that Discover them (each consumed once).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
for (const k of ['m_a', 'm_b', 'm_c', 'm_d', 'm_e']) cardsById[k] = { id: k, name: k, type: 'creature', cost: 3, attack: 3, health: 3 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 6) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.soulPool = []; } // soulPool reset: a default-deck Souleater could pre-seed it in createGame
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};

for (const id of ['bound_soul', 'souleaters_scythe']) ok(`${id} exists`, cardsById[id], id);
ok('Souleater has a Start of Game effect', (cardsById.souleaters_scythe.startOfGame || []).some(e => e.type === 'souleater-consume'));

// Consume: 3 distinct minions removed, soulPool populated, 3 Bound Souls shuffled in
{
	const st = game();
	st.players[0].deck = ['m_a', 'm_b', 'm_c', 'm_d', 'm_e'];
	E.execEffects(st, 0, [{ type: 'souleater-consume' }], null, null);
	ok('3 minions were consumed into the soul pool', st.players[0].soulPool.length === 3, st.players[0].soulPool);
	ok('the pool minions are distinct', new Set(st.players[0].soulPool).size === 3, st.players[0].soulPool);
	ok('3 Bound Souls shuffled into the deck', st.players[0].deck.filter(id => id === 'bound_soul').length === 3, st.players[0].deck);
	ok('2 original minions remain in the deck', st.players[0].deck.filter(id => id.startsWith('m_')).length === 2, st.players[0].deck.filter(id => id.startsWith('m_')));
	ok('consumed minions are gone from the deck (not drawable)', st.players[0].soulPool.every(id => !st.players[0].deck.includes(id)), st.players[0].deck);
}

// Bound Soul Discovers a consumed minion; each is offered only once
{
	const st = game();
	st.players[0].deck = ['m_a', 'm_b', 'm_c', 'm_d', 'm_e'];
	E.execEffects(st, 0, [{ type: 'souleater-consume' }], null, null);
	const pool0 = [...st.players[0].soulPool];
	// play a Bound Soul -> Discover
	E.execEffects(st, 0, [{ type: 'discover-soul' }], null, null);
	ok('Bound Soul offers exactly the consumed minions', st.pickQueue.length === 1 && st.pickQueue[0].ids.length === 3 && st.pickQueue[0].ids.every(id => pool0.includes(id)), st.pickQueue[0]?.ids);
	const picked = st.pickQueue[0].ids[0];
	E.resolvePick(st, picked);
	ok('the discovered minion is added to hand', st.players[0].hand.some(c => c.id === picked), st.players[0].hand.map(c => c.id));
	ok('the discovered minion is removed from the pool (once only)', !st.players[0].soulPool.includes(picked) && st.players[0].soulPool.length === 2, st.players[0].soulPool);
	// second Bound Soul offers only the remaining 2
	E.execEffects(st, 0, [{ type: 'discover-soul' }], null, null);
	ok('second Bound Soul offers the remaining 2', st.pickQueue[0].ids.length === 2 && !st.pickQueue[0].ids.includes(picked), st.pickQueue[0].ids);
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	E.execEffects(st, 0, [{ type: 'discover-soul' }], null, null);
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	ok('pool is empty after all 3 discovered', st.players[0].soulPool.length === 0, st.players[0].soulPool);
	// a 4th Bound Soul with an empty pool does nothing
	const before = st.pickQueue.length;
	E.execEffects(st, 0, [{ type: 'discover-soul' }], null, null);
	ok('extra Bound Soul with empty pool does nothing', st.pickQueue.length === before, st.pickQueue.length);
}

// End-to-end: Start of Game fires from the deck during createGame
{
	const deck = ['souleaters_scythe', 'm_a', 'm_b', 'm_c', 'm_d', 'm_e', 'm_a', 'm_b'];
	const st = E.createGame(cardsById, seededRng(3), deck, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'demonhunter', name: 'N', power: null }]);
	ok('createGame ran Souleater Start of Game (pool of 3)', st.players[0].soulPool.length === 3, st.players[0].soulPool);
	ok('Bound Souls are present across deck/hand', [...st.players[0].deck, ...st.players[0].hand.map(c => c.id)].filter(id => id === 'bound_soul').length === 3, st.players[0].deck);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
