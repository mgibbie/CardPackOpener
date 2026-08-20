// Wastes basic-land pool: 70 colorless, uncollectible "Wastes" cards the land Conjures from
// (keyed by landSet:"Wastes"). Unlike the advanced Temples/triomes (which Discover, pick 1 of 3),
// a basic land CONJURES a random member — the conjure handler's landSet branch (handlers-copy.js
// ~line 1195) draws straight from the tag, bypassing the collectible:false exclusion. The Wastes
// land also swaps the color-Boost tap for "Deal 1 damage to any target" (it is colorless).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- pool membership ----
const pool = raw.cards.filter(c => c.landSet === 'Wastes' && !c.token);
ok('exactly 70 Wastes pool cards', pool.length === 70, pool.length);
ok('all Wastes cards uncollectible', pool.every(c => c.collectible === false));
ok('all Wastes cards colorless', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0),
	pool.filter(c => !(Array.isArray(c.colors) && c.colors.length === 0)).map(c => c.id));
ok('all Wastes cards cardClass neutral', pool.every(c => c.cardClass === 'neutral'));
ok('no Wastes card carries a rarity', pool.every(c => !('rarity' in c)),
	pool.filter(c => 'rarity' in c).map(c => c.id));
ok('all Wastes cards tagged landSet Wastes', pool.every(c => c.landSet === 'Wastes'));

// ---- the Wastes land: colorless, damage tap replaces the boost, conjure keys off landSet ----
const land = byId.wastes;
ok('Wastes land is colorless', Array.isArray(land.colors) && land.colors.length === 0, JSON.stringify(land.colors));
const dmgTap = land.taps.find(t => (t.effects || []).some(e => e.type === 'damage' && e.target === 'any'));
ok('Wastes land has a "1 damage to any target" tap', !!dmgTap, JSON.stringify(land.taps.map(t => t.text)));
ok('Wastes land has NO boost tap', !land.taps.some(t => (t.effects || []).some(e => e.type === 'boost')));
const conjTap = land.taps.flatMap(t => t.effects).find(e => e.type === 'conjure' && e.landSet === 'Wastes');
ok('Wastes conjure tap keys off landSet Wastes', !!conjTap, JSON.stringify(land.taps.flatMap(t => t.effects)));

// ---- headless: play every card, drain picks with a legal target, validate ----
const vanilla = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
byId._v = vanilla;

function fresh() {
	const st = E.createGame(byId, seededRng(11), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	for (const pi of [0, 1]) for (let i = 0; i < 2; i++) {
		const c = E.instantiate(vanilla, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c);
	}
	return st;
}

function drainPicks(st, tag) {
	let guard = 0;
	while (st.pickQueue && st.pickQueue.length && st.pickQueue[0].player === 0) {
		if (guard++ > 20) { ok(tag + ': picks terminate', false, 'infinite pick loop'); break; }
		const pend = st.pickQueue[0];
		let choice = null;
		if (Array.isArray(pend.ids) && pend.ids.length) choice = pend.ids[0];
		else { const cre = st.players.flatMap(p => p.board).find(c => c.type === 'creature'); choice = cre ? cre.uid : null; }
		const before = st.pickQueue.length;
		E.resolvePick(st, choice);
		if (st.pickQueue.length >= before && st.pickQueue[0] === pend) { ok(tag + ': pick advanced', false, 'stuck'); break; }
	}
}

for (const card of pool) {
	let threw = null;
	const st = fresh();
	try {
		const inst = E.instantiate(card, 0); inst.zone = 'hand'; st.players[0].hand.push(inst);
		E.playCard(st, 0, inst.uid, null);
		drainPicks(st, card.id);
	} catch (e) { threw = e; }
	ok(card.id + ' plays without throwing', !threw, threw && threw.message);
	const v = validateGameState(st);
	ok(card.id + ' leaves state valid', !v || v.length === 0, v);
}

// ---- conjure from the Wastes tag actually pulls a Wastes card into hand ----
{
	const st = fresh();
	const before = st.players[0].hand.length;
	E.execEffects(st, 0, [{ type: 'conjure', count: 1, landSet: 'Wastes' }], null, null);
	const hand = st.players[0].hand;
	ok('conjure adds a card to hand', hand.length === before + 1, hand.length);
	const got = hand[hand.length - 1];
	const gotSet = got && (got.landSet || (byId[got.id] && byId[got.id].landSet));
	ok('conjured card is a Wastes card', gotSet === 'Wastes', got && got.id);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
