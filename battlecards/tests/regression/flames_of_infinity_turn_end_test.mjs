// flames_of_infinity_turn_end_test.mjs — bug review 2026-10-26 (instinctgauntlet, keys
// bug:1792798933027 / 1792799483188 / 1792815483281): "Flames of Infinity left the secret zone
// without killing anything". The tester's own replay scrub REFUTED it: the secret fired at the
// end of the opponent's turn 6 and killed his only creature (Merciless Executioner, 2 Health);
// the 5/3 Patrol and 4/4 Bat-Cloud seen alive came two and four turns LATER. Not a bug. This
// pins the shapes the reports asked about so the card stays right:
//   - the only enemy creature dies at the targeted opponent's turn end (the refuted fight)
//   - a frozen and a damaged candidate: the highest CURRENT Health one dies
//   - the caster's own board is never touched
//   - an empty enemy board: the turn end still springs it (spent, no effect), no crash
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(cardsById, seededRng(11), null, 2, [{ id: 'mage', name: 'Me', power: null }, { id: 'mage', name: 'Grima', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const arm = st => { const s = E.instantiate(cardsById.flames_of_infinity, 0); s.zone = 'hand'; st.players[0].hand.push(s); E.playCard(st, 0, s.uid, null, null, 0); };
const put = (st, pi, atk, hpv, extra = {}) => { const c = E.instantiate({ id: 'c' + Math.random(), name: 'C', type: 'creature', cost: 1, attack: atk, health: hpv }, pi); c.zone = 'board'; c.sick = false; Object.assign(c, extra); st.players[pi].board.push(c); return c; };
const alive = (st, pi, c) => st.players[pi].board.includes(c) && c.damage < c.maxHealth;
const secretsOf = st => (st.players[0].secrets || []).filter(s => s.id === 'flames_of_infinity').length;

// the refuted fight: armed on my turn, the opponent plays his only creature (2 Health), ends turn
{
	const st = game(); arm(st);
	ok('armed: 1 secret in my zone', secretsOf(st) === 1, secretsOf(st));
	st.current = 1;
	const exec = put(st, 1, 4, 2);
	E.endTurn(st);
	ok('the only enemy creature dies at his turn end', !alive(st, 1, exec));
	ok('the secret is spent (zone 1 -> 0) with the kill', secretsOf(st) === 0, secretsOf(st));
}
// frozen + damaged candidates: highest CURRENT Health dies (5/5 damaged to 3 vs a 4/4)
{
	const st = game(); arm(st);
	st.current = 1;
	const patrol = put(st, 1, 5, 5, { damage: 2, frozen: true });
	const bat = put(st, 1, 4, 4);
	const mine = put(st, 0, 1, 9);
	E.endTurn(st);
	ok('the 4/4 (highest current Health) dies', !alive(st, 1, bat));
	ok('the damaged, frozen 5/3 survives', alive(st, 1, patrol));
	ok("the caster's own creature is untouched", alive(st, 0, mine) && mine.damage === 0);
}
// a frozen creature is still a candidate
{
	const st = game(); arm(st);
	st.current = 1;
	const frozen = put(st, 1, 2, 6, { frozen: true });
	E.endTurn(st);
	ok('a frozen sole candidate still dies', !alive(st, 1, frozen));
}
// empty enemy board: the trigger is the turn end itself, so it springs and finds no one
{
	const st = game(); arm(st);
	st.current = 1;
	let threw = null; try { E.endTurn(st); } catch (e) { threw = e.message; }
	ok('empty enemy board: no crash', !threw, threw);
	ok('empty enemy board: the secret is spent, as a turn-end trigger', secretsOf(st) === 0, secretsOf(st));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
