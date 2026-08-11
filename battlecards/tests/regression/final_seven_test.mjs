// The final seven — 100% of HS collectible spells: Enter the Lost City,
// The Forbidden Sequence, Death Growl, Topple the Idol, Elemental
// Inspiration, Dragon Soul Shattered, Welcome Home!
import fs from 'fs';
import * as E from '../../engine.js';
import { drawCards } from '../../engine/zones.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_one = { id: 't_one', name: 'One', type: 'creature', cost: 1, attack: 1, health: 6 };
byId.t_five = { id: 't_five', name: 'Five', type: 'creature', cost: 5, attack: 5, health: 9 };
byId.t_rattler = { id: 't_rattler', name: 'Rattler', type: 'creature', cost: 1, attack: 1, health: 6, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] };
byId.t_loc = { id: 't_loc', name: 'Cozy Home', type: 'location', cost: 2, durability: 2, taps: [{ text: 'Nothing.', effects: [] }] };

function game() {
	const st = E.createGame(byId, seededRng(101), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(30).fill('t_one'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id, tgt = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}
const tgtOf = c => ({ type: 'creature', uid: c.uid, player: c.controller });

// --- Enter the Lost City: survive 10 turns -> Latorvius -> Un'Goro rewards ---
{
	const st = game();
	cast(st, 'enter_the_lost_city');
	ok('lost city: quest installed', st.players[0].quests.length === 1);
	for (let i = 0; i < 9; i++) { E.endTurn(st); E.endTurn(st); }
	ok('lost city: not yet at 9 turns', !st.players[0].hand.some(c => c.id === 'latorvius'));
	E.endTurn(st); // the 10th of your turn-ends
	ok('lost city: Latorvius awarded on turn 10', st.players[0].hand.some(c => c.id === 'latorvius'), st.players[0].hand.map(c => c.id));
	E.endTurn(st); st.players[0].mana.cur = 10; // back to my turn
	const lat = st.players[0].hand.find(c => c.id === 'latorvius');
	E.playCard(st, 0, lat.uid, null, null, 0);
	const rewardsInHand = st.players[0].hand.filter(c => c.id.startsWith('ungoro_')).length;
	const rewardsInDeck = st.players[0].deck.filter(id => id.startsWith('ungoro_')).length;
	ok('latorvius: 2 rewards to hand, the rest shuffled in', rewardsInHand === 2 && rewardsInDeck === 1, [rewardsInHand, rewardsInDeck]);
}
// --- The Forbidden Sequence: Discover 7 -> The Origin Stone (additive powers untouched) ---
{
	const st = game();
	cast(st, 'the_forbidden_sequence');
	for (let i = 0; i < 7; i++) {
		E.execEffects(st, 0, [{ type: 'discover', cardType: 'creature' }], null, null);
		E.resolvePick(st, st.pickQueue[0].ids[0]);
	}
	ok('sequence: Origin Stone awarded after 7 Discovers', st.players[0].hand.some(c => c.id === 'the_origin_stone'), st.players[0].hand.map(c => c.id).slice(-3));
	const stone = st.players[0].hand.find(c => c.id === 'the_origin_stone');
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, stone.uid, null, null, 0);
	ok('stone: equipped', st.players[0].weapon && st.players[0].weapon.id === 'the_origin_stone');
	const boardBefore = st.players[0].board.length;
	E.execEffects(st, 0, [{ type: 'discover', cardType: 'creature' }], null, null);
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	ok('stone: the 2 unpicked options were played', st.players[0].board.length === boardBefore + 2, st.players[0].board.length - boardBefore);
	ok('stone: lost 1 Durability', st.players[0].weapon && st.players[0].weapon.durability === 2, st.players[0].weapon && st.players[0].weapon.durability);
}
// --- Death Growl: spread the chosen minion's Deathrattle to its neighbors ---
{
	const st = game();
	const a = put(st, 0, 't_one'), mid = put(st, 0, 't_rattler'), b = put(st, 0, 't_one');
	cast(st, 'death_growl', tgtOf(mid));
	ok('growl: both neighbors gained the rattle', [a, b].every(c => c.keywords.includes('deathrattle') && (c.deathrattle || []).some(d => d.type === 'armor')));
	const armor = st.players[0].armor;
	a.damage = a.maxHealth; E.sweepDeaths(st);
	ok('growl: the spread rattle fires', st.players[0].armor === armor + 1);
}
// --- Topple the Idol: dredge, reveal, AoE by its Cost ---
{
	const st = game();
	st.players[0].deck = ['t_five', 't_one', 't_one', ...Array(5).fill('t_one')]; // bottom = front: t_five is dredgeable
	const m1 = put(st, 0, 't_five'), m2 = put(st, 1, 't_five');
	cast(st, 'topple_the_idol');
	ok('topple: dredge offered', st.dredgeQueue.length === 1 && st.dredgeQueue[0].ids.includes('t_five'));
	E.resolveDredge(st, 't_five');
	ok('topple: all minions took the 5-cost hit', E.hp(m1) === 4 && E.hp(m2) === 4, [E.hp(m1), E.hp(m2)]);
	ok('topple: the dredged card sits on top', st.players[0].deck[st.players[0].deck.length - 1] === 't_five');
}
// --- Elemental Inspiration: a gifted Vortex per school cast this game ---
{
	const st = game();
	st.players[0].schoolsCastGame = { Fire: true, Frost: true, Shadow: true };
	cast(st, 'elemental_inspiration');
	const vortexes = st.players[0].board.filter(c => c.name === 'Vortex');
	ok('inspiration: one Vortex per school', vortexes.length === 3, vortexes.length);
}
// --- Dragon Soul, Shattered: 6 Essences shuffle in; they cast when drawn ---
{
	const st = game();
	st.players[0].deck = [];
	cast(st, 'dragon_soul_shattered');
	ok('dragon soul: 6 Essences in the deck', st.players[0].deck.filter(id => id.startsWith('essence_of_')).length === 6, st.players[0].deck);
	st.players[0].deck = ['essence_of_the_green'];
	drawCards(st, 0, 1);
	ok('dragon soul: a drawn Essence casts (two Whelps)', st.players[0].board.filter(c => c.name === 'Emerald Whelp').length === 2, st.players[0].board.map(c => c.name));
}
// --- Welcome Home!: reopen a location + grant it a parting gift ---
{
	const st = game();
	const loc = put(st, 0, 't_loc');
	cast(st, 'welcome_home');
	ok('home: +2 uses', loc.durability === 4, loc.durability);
	ok('home: carries the granted Deathrattle', (loc.deathrattle || []).some(d => d.type === 'summon-random'));
	loc.durability = 0; E.sweepDeaths(st);
	const made = st.players[0].board.find(c => c.type === 'creature' && (byId[c.id]?.cost ?? c.cost) === 3);
	ok('home: crumbling created a 3-cost minion', !!made, st.players[0].board.map(c => [c.id, c.cost]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
