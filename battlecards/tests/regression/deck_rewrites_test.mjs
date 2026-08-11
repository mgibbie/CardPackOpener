// Deck-rewrites family: Blackrock 'n' Roll, Deck of Chaos, The Fires of
// Zin-Azshari (draw-pipeline deck mods) + Shadow Council (hand replace).
import fs from 'fs';
import * as E from '../../engine.js';
import { drawCards } from '../../engine/zones.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_one = { id: 't_one', name: 'One', type: 'creature', cost: 3, attack: 1, health: 1 };
byId.t_two = { id: 't_two', name: 'Two', type: 'creature', cost: 5, attack: 2, health: 4 };

function game() {
	const st = E.createGame(byId, seededRng(51), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function cast(st, id) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, null, null, 0); return sp;
}

// --- Blackrock 'n' Roll: drawn deck minions get stats = Cost ---
{
	const st = game();
	st.players[0].deck = ['t_one', 't_one'];
	cast(st, 'blackrock_n_roll');
	drawCards(st, 0, 1);
	const c = st.players[0].hand.find(x => x.id === 't_one');
	ok("b'n'r: drawn 3-cost is 3/3", !!c && c.attack === 3 && c.maxHealth === 3 && c.cost === 3, c && [c.attack, c.maxHealth, c.cost]);
}
// --- Deck of Chaos: drawn deck minions swap Cost and Attack ---
{
	const st = game();
	st.players[0].deck = ['t_two'];
	cast(st, 'deck_of_chaos');
	drawCards(st, 0, 1);
	const c = st.players[0].hand.find(x => x.id === 't_two');
	ok('chaos: 5-cost 2-attack becomes 2-cost 5-attack (health kept)', !!c && c.cost === 2 && c.attack === 5 && c.maxHealth === 4, c && [c.cost, c.attack, c.maxHealth]);
	ok('chaos: effectiveCost honors the swap', E.effectiveCost(st, 0, c) === 2, E.effectiveCost(st, 0, c));
}
// --- The Fires of Zin-Azshari: deck replaced with 5+ minions that cost (5) ---
{
	const st = game();
	st.players[0].deck = Array(10).fill('t_one');
	cast(st, 'the_fires_of_zin_azshari');
	const deck = st.players[0].deck;
	ok('fires: deck size kept', deck.length === 10, deck.length);
	ok('fires: every card is a 5+-cost minion', deck.every(id => byId[id] && byId[id].type === 'creature' && (byId[id].cost || 0) >= 5), deck.slice(0, 3));
	drawCards(st, 0, 1);
	const c = st.players[0].hand[st.players[0].hand.length - 1];
	ok('fires: drawn minion costs (5)', c.cost === 5 && E.effectiveCost(st, 0, c) === 5, [c.id, c.cost]);
}
// --- Shadow Council: hand replaced with random Demons at +2/+2 ---
{
	const st = game();
	for (let i = 0; i < 3; i++) { const c = E.instantiate(byId.t_one, 0); c.zone = 'hand'; st.players[0].hand.push(c); }
	cast(st, 'shadow_council');
	const hand = st.players[0].hand;
	ok('council: hand size kept', hand.length === 3, hand.length);
	ok('council: all Demons', hand.every(c => (c.tribe || '').includes('Demon')), hand.map(c => c.tribe));
	ok('council: each got +2/+2 over its base', hand.every(c => {
		const def = byId[c.id];
		return def && c.attack === (def.attack || 0) + 2 && c.maxHealth === (def.health || 0) + 2;
	}), hand.map(c => [c.id, c.attack, c.maxHealth]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
