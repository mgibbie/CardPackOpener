// Thirty-first batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Garruk's Gorehorn -> "Sanguine & Trample." (add Sanguine to the Trample it
//   already had; alphabetical order per the card-text convention).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 75) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
// Blood Tokens are banked into the artifact zone (a token artifact), not hand
const bloods = (st, pi) => st.players[pi].artifacts.filter(c => c.id === 'blood_token').length;

const c = cardsById.garruk_s_gorehorn;
ok('reads "Sanguine & Trample."', c.description === 'Sanguine & Trample.', JSON.stringify(c.description));
ok('keywords are [trample, sanguine]', ['trample', 'sanguine'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
ok('instance carries both', ['trample', 'sanguine'].every(k => E.instantiate(c, 0).keywords.includes(k)));

// FIRE Sanguine: attacking banks a Blood Token for its controller
{
	const st = game();
	const g = put(st, 0, E.instantiate(c, 0));
	const before = bloods(st, 0);
	E.attack(st, 0, g.uid, { type: 'hero', player: 1 });
	ok('Sanguine banked a Blood Token on attack', bloods(st, 0) === before + 1, [before, bloods(st, 0)]);
}

// FIRE Trample: excess damage over a small blocker carries to the hero
{
	const st = game();
	const g = put(st, 0, E.instantiate(c, 0)); // 7 attack
	const wall = put(st, 1, E.instantiate({ id: 'w', name: 'W', type: 'creature', cost: 1, attack: 0, health: 2 }, 1));
	const life0 = st.players[1].life;
	E.attack(st, 0, g.uid, { type: 'creature', uid: wall.uid, player: 1 });
	ok('Trample carried the excess (7 - 2 = 5) to the enemy hero', st.players[1].life === life0 - 5, [life0, st.players[1].life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
