// Temple of Izzet advanced-land pool: 15 mono-white, uncollectible "Izzet" cards the
// land Discovers from (keyed by landSet:"Izzet", NOT name-match — the name-match conjure
// path filters out collectible:false cards, so the pool must use the landSet branch).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- pool membership ----
const pool = raw.cards.filter(c => c.landSet === 'Izzet' && !c.token);
ok('at least 15 Izzet pool cards', pool.length >= 15, pool.length);
ok('all Izzet cards uncollectible', pool.every(c => c.collectible === false));
ok('all Izzet cards are R/U dual-color', pool.every(c => JSON.stringify(c.colors) === '["R","U"]'));
ok('all Izzet names contain "Izzet"', pool.every(c => c.name.includes('Izzet')),
	pool.filter(c => !c.name.includes('Izzet')).map(c => c.name));

// ---- temple tap surfaces the pool via landSet (not the collectible-filtering name-match) ----
const temple = byId.izzet_guildgate;
const tapEff = temple.taps.flatMap(t => t.effects).find(e => e.landSet === 'Izzet');
ok('temple tap keys off landSet Izzet', tapEff && tapEff.landSet === 'Izzet', JSON.stringify(tapEff));

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

// ---- discover from the temple pool offers only Izzet cards ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'discover', landSet: 'Izzet' }], null, null);
	const pend = st.pickQueue[0];
	ok('temple discover queues a pick', !!pend);
	ok('discover offers only Izzet cards', pend && pend.ids && pend.ids.every(id => byId[id] && byId[id].landSet === 'Izzet'), pend && pend.ids);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
