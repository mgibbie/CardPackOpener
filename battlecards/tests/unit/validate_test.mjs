// validate_test.mjs — unit tests for engine/validate.js: it must accept
// healthy states, flag corrupted ones, and never mutate anything.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const freshState = () => new Scenario(byId)
	.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
	.board(0, ['t_bear']).board(1, ['t_bear'])
	.hand(0, ['t_bear'])
	.run().state;

// --- healthy states validate clean ---
{
	const s = E.createGame(byId, () => 0.4, null, 2);
	ok('fresh createGame state is clean', validateGameState(s).length === 0, validateGameState(s));
	const s2 = freshState();
	ok('scenario state is clean', validateGameState(s2).length === 0, validateGameState(s2));
}
// --- validation does not mutate (compare serializable projection) ---
{
	const s = freshState();
	const snap = st => JSON.stringify({ players: st.players, current: st.current, turnNumber: st.turnNumber, stack: st.stack });
	const before = snap(s);
	validateGameState(s); validateGameState(s);
	ok('validate is a pure read', snap(s) === before);
}
// --- duplicate uid across zones is flagged ---
{
	const s = freshState();
	s.players[0].hand.push(s.players[0].board[0]); // same instance in two zones
	const v = validateGameState(s);
	ok('dup uid detected', v.some(m => m.includes('AND')), v);
}
// --- null entries flagged ---
{
	const s = freshState();
	s.players[1].board.push(null);
	ok('null in zone detected', validateGameState(s).some(m => m.includes('null')));
}
// --- negative resources flagged ---
{
	const s = freshState();
	s.players[0].mana.cur = -1;
	s.players[1].corpses = -3;
	const v = validateGameState(s);
	ok('negative mana flagged', v.some(m => m.includes('mana.cur')), v);
	ok('negative corpses flagged', v.some(m => m.includes('corpses')), v);
}
// --- NaN poisoning flagged ---
{
	const s = freshState();
	s.players[0].life = NaN;
	s.players[1].board[0].attack = undefined;
	const v = validateGameState(s);
	ok('NaN life flagged', v.some(m => m.includes('life')), v);
	ok('non-numeric attack flagged', v.some(m => m.includes('attack')), v);
}
// --- instance in deck flagged ---
{
	const s = freshState();
	s.players[0].deck.push({ id: 'oops' });
	ok('non-id in deck flagged', validateGameState(s).some(m => m.includes('non-id')));
}
// --- eliminated current player flagged (unless game over) ---
{
	const s = freshState();
	s.players[s.current].eliminated = true;
	ok('eliminated current flagged', validateGameState(s).some(m => m.includes('eliminated')));
	s.over = true;
	ok('...but tolerated once the game is over', validateGameState(s).length === 0, validateGameState(s));
}
// --- limbo fields are whitelisted, not double-zone violations ---
{
	const s = freshState();
	const c = s.players[0].hand.pop();
	s.players[0].savedHand = [c];      // Illucia/Fins-style limbo
	ok('limbo reference alone is clean', validateGameState(s).length === 0, validateGameState(s));
	s.players[0].hand.push(c);         // …but limbo + a real zone IS a violation
	ok('limbo + zone dupe detected', validateGameState(s).some(m => m.includes('AND')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
