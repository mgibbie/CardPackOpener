// Group C (cost modification) wave 9 — "Costs Health/Corpses instead of Mana"
// via a forced altCost (never pays mana; must be able to afford the alt resource).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 18) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'druid', name: 'D', power: null }, { id: 'druid', name: 'E', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30;
	return st;
};
const inHand = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };

ok('blood_treant altCost life (forced)', cardsById['blood_treant'].altCost && cardsById['blood_treant'].altCost.forced && cardsById['blood_treant'].altCost.life === 5);
ok('reanimated_pterrordax altCost corpses (forced)', cardsById['reanimated_pterrordax'].altCost.corpses === 5 && cardsById['reanimated_pterrordax'].altCost.forced);
ok('death_metal_knight altCost life forcedIf healed', cardsById['death_metal_knight'].altCost.forcedIf === 'healed-this-turn');

// Blood Treant: costs Health instead of Mana
{
	const st = game(); const c = inHand(st, 'blood_treant');
	ok('Blood Treant: mana cost is 0', E.effectiveCost(st, 0, c) === 0);
	ok('Blood Treant: playable at 30 Health', E.canPlay(st, 0, c));
	const mana0 = st.players[0].mana.cur;
	E.playCard(st, 0, c.uid, null, null, 0);
	ok('Blood Treant: paid 5 Health (30 -> 25), mana untouched', st.players[0].life === 25 && st.players[0].mana.cur === mana0, [st.players[0].life, st.players[0].mana.cur]);
	ok('Blood Treant: it entered play', st.players[0].board.some(b => b.id === 'blood_treant'));
	// can't pay Health you can't survive
	const st2 = game(); st2.players[0].life = 5; const c2 = inHand(st2, 'blood_treant');
	ok('Blood Treant: NOT playable when Health <= its cost', !E.canPlay(st2, 0, c2));
}

// Reanimated Pterrordax: costs Corpses instead of Mana
{
	const st = game(); st.players[0].corpses = 5; const c = inHand(st, 'reanimated_pterrordax');
	ok('Pterrordax: mana cost is 0', E.effectiveCost(st, 0, c) === 0);
	ok('Pterrordax: playable with 5 Corpses', E.canPlay(st, 0, c));
	E.playCard(st, 0, c.uid, null, null, 0);
	ok('Pterrordax: spent 5 Corpses (5 -> 0)', st.players[0].corpses === 0, st.players[0].corpses);
	const st2 = game(); st2.players[0].corpses = 3; const c2 = inHand(st2, 'reanimated_pterrordax');
	ok('Pterrordax: NOT playable with too few Corpses', !E.canPlay(st2, 0, c2));
}

// Death Metal Knight: only costs Life once you've gained Life this turn
{
	const st = game(); const c = inHand(st, 'death_metal_knight');
	ok('Death Metal Knight: normal 3 mana when NOT healed', E.effectiveCost(st, 0, c) === 3);
	const life0 = st.players[0].life, mana0 = st.players[0].mana.cur;
	E.playCard(st, 0, c.uid, null, null, 0);
	ok('Death Metal Knight: paid 3 mana, no Health, when not healed', st.players[0].mana.cur === mana0 - 3 && st.players[0].life === life0, [st.players[0].mana.cur, st.players[0].life]);

	const st2 = game(); st2.players[0].healedThisTurn = true; const c2 = inHand(st2, 'death_metal_knight');
	ok('Death Metal Knight: 0 mana when healed this turn', E.effectiveCost(st2, 0, c2) === 0);
	const mana2 = st2.players[0].mana.cur;
	E.playCard(st2, 0, c2.uid, null, null, 0);
	ok('Death Metal Knight: paid 3 Life (not mana) when healed', st2.players[0].mana.cur === mana2 && st2.players[0].life === 27, [st2.players[0].mana.cur, st2.players[0].life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
