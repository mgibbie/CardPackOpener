// Temple of Oketra advanced-land pool: 15 mono-white, uncollectible "Oketra" cards the
// land Discovers from (keyed by landSet:"Oketra", NOT name-match — the name-match conjure
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
const pool = raw.cards.filter(c => c.landSet === 'Oketra' && !c.token);
ok('at least 15 Oketra pool cards', pool.length >= 15, pool.length);
ok('all Oketra cards uncollectible', pool.every(c => c.collectible === false));
ok('all Oketra cards mono-white', pool.every(c => JSON.stringify(c.colors) === '["W"]'));
ok('all Oketra names contain "Oketra"', pool.every(c => c.name.includes('Oketra')),
	pool.filter(c => !c.name.includes('Oketra')).map(c => c.name));

// ---- temple tap surfaces the pool via landSet (not the collectible-filtering name-match) ----
const temple = byId.temple_of_oketra;
const tapEff = temple.taps.flatMap(t => t.effects).find(e => e.landSet === 'Oketra');
ok('temple tap keys off landSet Oketra', tapEff && tapEff.landSet === 'Oketra', JSON.stringify(tapEff));

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

// ---- discover from the temple pool offers only Oketra cards ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'discover', landSet: 'Oketra' }], null, null);
	const pend = st.pickQueue[0];
	ok('temple discover queues a pick', !!pend);
	ok('discover offers only Oketra cards', pend && pend.ids && pend.ids.every(id => byId[id] && byId[id].landSet === 'Oketra'), pend && pend.ids);
}

// ---- Oketra's Initiate: Deathrattle summons a Warrior on death (redesigned) ----
{
	byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 1, attack: 5, health: 5, rarity: 'common' };
	const st = fresh();
	const atk = E.instantiate(byId._big, 0); atk.zone = 'board'; atk.sick = false; st.players[0].board.push(atk);
	const init = E.instantiate(byId.oketras_initiate, 1); init.zone = 'board'; init.sick = false; st.players[1].board.push(init);
	E.recomputeAuras(st);
	const w0 = st.players[1].board.filter(c => c.name === 'Warrior').length;
	E.attack(st, 0, atk.uid, { type: 'creature', uid: init.uid, player: 1 }); E.sweepDeaths(st); // 5/5 kills the 2/3 Taunt
	ok('Initiate dies to combat', !st.players[1].board.some(x => x.id === 'oketras_initiate'));
	ok('Initiate Deathrattle summons a Warrior', st.players[1].board.filter(c => c.name === 'Warrior').length === w0 + 1, st.players[1].board.map(c => c.name));
}

// ---- Oketra's Truth: Discover, then add a second copy (2 total in hand) ----
{
	const st = fresh();
	const c = E.instantiate(byId.oketras_truth, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	E.playCard(st, 0, c.uid, null);
	const pend = st.pickQueue[0];
	ok('Truth discover carries the duplicate flag', pend && pend.duplicate === true);
	const pick = pend.ids[0];
	E.resolvePick(st, pick);
	ok('Truth yields 2 copies of the discovered card', st.players[0].hand.filter(x => x.id === pick).length === 2);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
