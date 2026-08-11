// Time-bombs family: Wheel of DEATH!!!, Immolate, Rhythm and Roots (delayed
// enchantments firing onExpire) + Silk Stitching (discover a spell for a
// minion to cast on death).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_filler = { id: 't_filler', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1 };
byId.t_body = { id: 't_body', name: 'Body', type: 'creature', cost: 1, attack: 2, health: 3 };

function game() {
	const st = E.createGame(byId, seededRng(41), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(30).fill('t_filler'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function cast(st, id, tgt = null, choice = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, choice, 0); return sp;
}
function fullRound(st, n = 1) { for (let i = 0; i < n && !st.over; i++) { E.endTurn(st); if (!st.over) E.endTurn(st); } }

// --- Wheel of DEATH!!!: deck destroyed now, opponent destroyed in 5 turns ---
{
	const st = game();
	cast(st, 'wheel_of_death');
	ok('wheel: your deck is destroyed', st.players[0].deck.length === 0, st.players[0].deck.length);
	ok('wheel: countdown enchantment ticking', st.players[0].enchantments.some(e => e.name === 'Wheel of DEATH!!!'));
	fullRound(st, 4);
	ok('wheel: opponent alive with 1 turn left', !st.over);
	fullRound(st, 1); // the 5th of your turn-ends
	ok('wheel: opponent destroyed on turn 5', st.over === true && st.winner === 0, [st.over, st.winner]);
}
// --- Immolate: marks the CURRENT hand; 3 turns later the survivors burn ---
{
	const st = game();
	for (let i = 0; i < 3; i++) { const c = E.instantiate(byId.t_filler, 1); c.zone = 'hand'; st.players[1].hand.push(c); }
	cast(st, 'immolate');
	ok('immolate: current hand marked', st.players[1].hand.every(c => c._immolate === true), st.players[1].hand.length);
	// they play one marked card, and draw fresh (unmarked) ones over the turns
	const played = st.players[1].hand[0];
	st.players[1].hand = st.players[1].hand.filter(c => c !== played); // simulate it leaving the hand
	fullRound(st, 3);
	const hand = st.players[1].hand;
	ok('immolate: marked cards burned after 3 turns', hand.every(c => !c._immolate), hand.filter(c => c._immolate).length);
	ok('immolate: freshly drawn cards survived', hand.length >= 3, hand.length); // mandatory draws over 3 rounds
	ok('immolate: burned cards hit the graveyard', st.players[1].graveyard.length >= 2, st.players[1].graveyard.length);
}
// --- Rhythm and Roots: choose-one delayed summons ---
{
	const st = game();
	cast(st, 'rhythm_and_roots', null, 0); // three 5/5 in 2 turns
	ok('rhythm A: nothing yet', st.players[0].board.length === 0);
	fullRound(st, 2);
	const ancients = st.players[0].board.filter(c => c.name === 'Ancient');
	ok('rhythm A: three 5/5 Ancients after 2 turns', ancients.length === 3 && ancients.every(c => c.attack === 5 && c.maxHealth === 5), ancients.map(c => [c.attack, c.maxHealth]));
}
{
	const st = game();
	cast(st, 'rhythm_and_roots', null, 1); // three 8/8 in 4 turns
	fullRound(st, 3);
	ok('rhythm B: not yet at 3 turns', st.players[0].board.filter(c => c.name === 'Ancient').length === 0);
	fullRound(st, 1);
	const giants = st.players[0].board.filter(c => c.name === 'Ancient');
	ok('rhythm B: three 8/8 Ancients after 4 turns', giants.length === 3 && giants.every(c => c.attack === 8 && c.maxHealth === 8), giants.map(c => [c.attack, c.maxHealth]));
}
// --- Silk Stitching: chosen minion casts the discovered spell on death ---
{
	const st = game();
	const m = E.instantiate(byId.t_body, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m);
	cast(st, 'silk_stitching', { type: 'creature', uid: m.uid, player: 0 });
	ok('silk: discover queued', st.pickQueue.length === 1 && st.pickQueue[0].castOnDeathUid === m.uid, st.pickQueue[0] && st.pickQueue[0].castOnDeathUid);
	const options = st.pickQueue[0].ids;
	ok('silk: options are cheap spells', options.length > 0 && options.every(id => (byId[id].cost || 0) <= 4), options);
	const chosen = options[0];
	E.resolvePick(st, chosen);
	ok('silk: spell NOT added to hand', !st.players[0].hand.some(c => c.id === chosen));
	ok('silk: minion armed with the death-cast', m.keywords.includes('deathrattle') && (m.deathrattle || []).some(d => d.type === 'cast-random-spell' && d.ids[0] === chosen), JSON.stringify(m.deathrattle));
	m.damage = m.maxHealth; E.sweepDeaths(st);
	ok('silk: death-cast resolves without blowing up', !st.players[0].board.includes(m));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
