// Warlock six: Tamsin's Phylactery, Symphony of Sins, Divergence, Wing
// Welding, Bloodbloom, Curse of Flesh (+ the 7 Movement tokens).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_one = { id: 't_one', name: 'One', type: 'creature', cost: 1, attack: 1, health: 4 };
byId.t_six = { id: 't_six', name: 'Six', type: 'creature', cost: 6, attack: 6, health: 6 };
byId.t_costly = { id: 't_costly', name: 'Costly', type: 'creature', cost: 7, attack: 7, health: 9 };
byId.t_bigspell = { id: 't_bigspell', name: 'Big Spell', type: 'sorcery', cost: 6, effects: [{ type: 'armor', value: 1 }] };
byId.t_rattler = { id: 't_rattler', name: 'Rattler', type: 'creature', cost: 1, attack: 1, health: 1, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] };

function game() {
	const st = E.createGame(byId, seededRng(81), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(10).fill('t_one'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function give(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'hand';
	st.players[pi].hand.push(c); return c;
}
function cast(st, id, tgt = null) {
	const sp = give(st, 0, id);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}

// --- Bloodbloom: the next spell this turn is paid in Health, once ---
{
	const st = game();
	cast(st, 'bloodbloom');
	const sp = give(st, 0, 't_bigspell');
	ok('bloodbloom: next spell costs 0 mana', E.effectiveCost(st, 0, sp) === 0);
	const life = st.players[0].life, mana = st.players[0].mana.cur;
	E.playCard(st, 0, sp.uid, null, null, 0);
	ok('bloodbloom: paid 6 Health, no mana', st.players[0].life === life - 6 && st.players[0].mana.cur === mana, [life - st.players[0].life, mana - st.players[0].mana.cur]);
	const sp2 = give(st, 0, 't_bigspell');
	ok('bloodbloom: consumed — second spell costs mana again', E.effectiveCost(st, 0, sp2) === 6);
}
// --- Curse of Flesh: opponent's minions cost Health on THEIR next turn ---
{
	const st = game();
	cast(st, 'curse_of_flesh');
	E.endTurn(st); // opponent's turn
	const m = give(st, 1, 't_six');
	ok('curse: their minion costs 0 mana', E.effectiveCost(st, 1, m) === 0);
	const life = st.players[1].life;
	st.players[1].mana.cur = 0; // no mana at all — health pays
	E.playCard(st, 1, m.uid, null, null, 0);
	ok('curse: they paid 6 Health to play it', st.players[1].board.some(c => c.uid === m.uid) && st.players[1].life === life - 6, life - st.players[1].life);
	E.endTurn(st); E.endTurn(st); // their turn AFTER: back to mana
	const m2 = give(st, 1, 't_six');
	ok('curse: lapses after their turn', E.effectiveCost(st, 1, m2) === 6);
}
// --- Divergence: a random hand minion splits into two ceil-halves ---
{
	const st = game();
	give(st, 0, 't_costly'); // 7-cost 7/9
	cast(st, 'divergence');
	const halves = st.players[0].hand.filter(c => c.id === 't_costly');
	ok('divergence: two halves in hand', halves.length === 2, st.players[0].hand.map(c => c.id));
	ok('divergence: stats and cost halved rounded up', halves.every(c => c.attack === 4 && c.maxHealth === 5 && c.cost === 4), halves.map(c => [c.attack, c.maxHealth, c.cost]));
}
// --- Wing Welding: discard highest-cost card, its Cost hits all minions ---
{
	const st = game();
	give(st, 0, 't_one'); give(st, 0, 't_costly');
	const mine = put(st, 0, 't_six'), theirs = put(st, 1, 't_six');
	cast(st, 'wing_welding');
	ok('welding: the 7-cost was discarded', !st.players[0].hand.some(c => c.id === 't_costly') && st.players[0].graveyard.length >= 1, st.players[0].hand.map(c => c.id));
	ok('welding: all minions took 7', E.isDead(mine) || !st.players[0].board.includes(mine), E.hp(mine));
	ok('welding: cheap card kept', st.players[0].hand.some(c => c.id === 't_one'));
}
// --- Symphony of Sins: discover-and-play a Movement; other 6 shuffle in ---
{
	const st = game();
	cast(st, 'symphony_of_sins');
	ok('symphony: 3 Movements offered', st.pickQueue.length === 1 && st.pickQueue[0].ids.length === 3 && st.pickQueue[0].ids.every(id => id.startsWith('movement_of_')), st.pickQueue[0] && st.pickQueue[0].ids);
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	const p = st.players[0];
	const inDeck = p.deck.filter(id => id.startsWith('movement_of_')).length;
	const inHand = p.hand.filter(c => c.id.startsWith('movement_of_')).length;
	ok('symphony: the other 6 Movements shuffled into your deck', inDeck + inHand === 6, [inDeck, inHand]);
}
// --- Tamsin's Phylactery: spread a died minion's Deathrattle to your board ---
{
	const st = game();
	const r = put(st, 0, 't_rattler');
	r.damage = r.maxHealth; E.sweepDeaths(st); // it dies -> deathLog
	const a = put(st, 0, 't_one'), b = put(st, 0, 't_six');
	cast(st, 'tamsins_phylactery');
	ok('phylactery: the died Rattler is discoverable', st.pickQueue.length === 1 && st.pickQueue[0].ids.includes('t_rattler'), st.pickQueue[0] && st.pickQueue[0].ids);
	E.resolvePick(st, 't_rattler');
	ok('phylactery: both minions gained the Deathrattle', [a, b].every(c => c.keywords.includes('deathrattle') && (c.deathrattle || []).some(d => d.type === 'armor')), [a.deathrattle, b.deathrattle]);
	const armor = st.players[0].armor;
	a.damage = a.maxHealth; E.sweepDeaths(st);
	ok('phylactery: the granted rattle fires on death', st.players[0].armor === armor + 1, st.players[0].armor - armor);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
