// Group D (turn triggers) wave 2 — board fillers (fill to 7) + self stat changes.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 22) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');

for (const id of ['onyxia_the_broodmother', 'shu_ma', 'scaled_nightmare', 'toothy_chest', 'validated_doomsayer'])
	ok(`${id} carries an ongoing trigger`, cardsById[id].ongoing, id);

// Onyxia: at the end of EACH turn, fill your board with 1/1 Whelps (to 7 total)
{
	const st = game(); const on = put(st, 0, 'onyxia_the_broodmother');
	E.endTurn(st); // end of your turn
	ok('Onyxia: board filled to exactly 7 minions', minions(st, 0).length === 7, minions(st, 0).length);
	const whelps = st.players[0].board.filter(c => c.name === 'Whelp');
	ok('Onyxia: the fillers are 1/1 Whelps (6 alongside Onyxia)', whelps.length === 6 && whelps.every(c => c.attack === 1 && E.hp(c) === 1), whelps.length);
	// "EACH turn" -> also fills at the end of the opponent's turn
	st.players[0].board = st.players[0].board.filter(c => c.id === 'onyxia_the_broodmother'); // clear whelps
	E.endTurn(st); // opponent's turn ends
	ok('Onyxia: also refills at the end of the opponent\'s turn', minions(st, 0).length === 7, minions(st, 0).length);
}
// Shu'ma: at the end of YOUR turn, fill with 1/1 Tentacles (to 7)
{
	const st = game(); put(st, 0, 'shu_ma');
	E.endTurn(st);
	ok('Shu\'ma: board filled to 7 with Tentacles', minions(st, 0).length === 7 && st.players[0].board.filter(c => c.name === 'Tentacle').length === 6);
	// not on the opponent's turn (only "your" turn)
	st.players[0].board = st.players[0].board.filter(c => c.id === 'shu_ma');
	E.endTurn(st); // opponent's turn ends
	ok('Shu\'ma: does NOT refill on the opponent\'s turn', minions(st, 0).length === 1);
}
// board fillers never make more than 7
{
	const st = game(); put(st, 0, 'shu_ma'); for (let i = 0; i < 3; i++) put(st, 0, 'validated_doomsayer');
	E.endTurn(st);
	ok('a filler tops the board at 7 even with minions already present', minions(st, 0).length === 7, minions(st, 0).length);
}
// Scaled Nightmare: at the start of your turn, double its Attack
{
	const st = game(); const sn = put(st, 0, 'scaled_nightmare'); const a0 = sn.attack;
	E.endTurn(st); E.endTurn(st); // back to your turn -> start-of-turn double
	ok('Scaled Nightmare: Attack doubled at start of your turn', sn.attack === a0 * 2, [a0, sn.attack]);
}
// Toothy Chest / Validated Doomsayer: set own Attack at start of turn
{
	const st = game(); const tc = put(st, 0, 'toothy_chest'); const vd = put(st, 0, 'validated_doomsayer');
	E.endTurn(st); E.endTurn(st);
	ok('Toothy Chest: Attack set to 4', tc.attack === 4, tc.attack);
	ok('Validated Doomsayer: Attack set to 7', vd.attack === 7, vd.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
