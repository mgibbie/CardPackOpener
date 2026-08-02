// Regression: a singular `ongoing` with a `once` flag (e.g. Warsong Envoy's
// Frenzy) must have per-instance spent state. It used to be copied by reference
// in instantiate(), so firing one instance's once-trigger set `spent` on the
// SHARED card def — leaking to every other instance and across games in one
// process (a fuzz determinism failure at seed 9419695).
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };
const game = () => { const st = E.createGame(cardsById, seededRng(2), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]); st.current = 0; return st; };

// two Warsong Envoys (1/3, Frenzy once): each must be able to Frenzy on its own
{
	const st = game();
	const w1 = put(st, 0, 'warsong_envoy');
	const w2 = put(st, 0, 'warsong_envoy');
	const a1 = w1.attack, a2 = w2.attack;
	damageCreature(st, w1, 1, null); // w1 survives -> its Frenzy fires
	ok('first Warsong Frenzy fires (gains Attack)', w1.attack > a1, [a1, w1.attack]);
	damageCreature(st, w2, 1, null); // w2 must still be able to fire (not pre-spent by w1)
	ok('second Warsong Frenzy ALSO fires (per-instance once, no leak)', w2.attack > a2, [a2, w2.attack]);
	// the shared card def must be untouched
	ok('the card def ongoing was not mutated (no shared spent)', cardsById['warsong_envoy'].ongoing.spent === undefined, cardsById['warsong_envoy'].ongoing.spent);
}

// a fresh game after firing must behave identically (no cross-game leak)
{
	const st1 = game(); const x1 = put(st1, 0, 'warsong_envoy'); const base = x1.attack;
	damageCreature(st1, x1, 1, null); const fired1 = x1.attack;
	const st2 = game(); const x2 = put(st2, 0, 'warsong_envoy');
	damageCreature(st2, x2, 1, null);
	ok('same card in a new game fires identically (determinism across games)', x2.attack === fired1 && fired1 > base, [base, fired1, x2.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
