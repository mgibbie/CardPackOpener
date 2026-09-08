// Seventh batch of card changes filed from the wiki's owner inbox (owner_todo),
// applied 2026-09-08. Both are Forest advanced-land pool cards.
//
//   Argothian Swine  -> retribe Boar -> Beast (keywords/stats unchanged; last
//                       batch only added Trample & Poisonous).
//   Centaur Courser  -> Rush & Taunt, restatted to a 3/4.
//
// Behaviour is exercised, not just inspected: the Taunt is FIRED — a fresh
// Centaur Courser on the enemy board forces the attacker's only legal target to
// be the courser (no vanilla neighbour, no hero).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 9) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const onBoard = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; inst.summonedThisTurn = false; inst.attacksUsed = 0; st.players[pi].board.push(inst); return inst; };

// ---------- Argothian Swine ----------
{
	const c = cardsById.argothian_swine;
	ok('Argothian Swine is now a Beast', c.tribe === 'Beast', c.tribe);
	ok('Argothian Swine keeps its Trample & Poisonous + 3/3', c.description === 'Trample & Poisonous.'
		&& ['trample', 'poisonous'].every(k => (c.keywords || []).includes(k)) && c.attack === 3 && c.health === 3,
		JSON.stringify([c.keywords, c.attack, c.health]));
}

// ---------- Centaur Courser ----------
{
	const c = cardsById.centaur_courser;
	ok('Centaur Courser reads "Rush & Taunt."', c.description === 'Rush & Taunt.', JSON.stringify(c.description));
	ok('Centaur Courser is a 3/4', c.attack === 3 && c.health === 4, [c.attack, c.health]);
	const inst = E.instantiate(c, 0);
	ok('instantiated with rush + taunt', inst.keywords.includes('rush') && inst.keywords.includes('taunt'), JSON.stringify(inst.keywords));
	ok('instance is a 3/4', inst.attack === 3 && (inst.health ?? inst.maxHealth) === 4, [inst.attack, inst.health, inst.maxHealth]);

	// FIRE the Taunt: attacker (P0) faces a Centaur Courser + a vanilla minion on
	// the enemy board. attackTargets must be restricted to the courser only.
	const st = game();
	const attacker = onBoard(st, 0, E.instantiate({ id: 'dm', name: 'Dummy', type: 'creature', cost: 3, attack: 2, health: 2 }, 0));
	const courser = onBoard(st, 1, E.instantiate(c, 1));
	const vanilla = onBoard(st, 1, E.instantiate({ id: 'dm2', name: 'Vanilla', type: 'creature', cost: 3, attack: 2, health: 2 }, 1));
	E.recomputeAuras(st);
	const tgts = E.attackTargets(st, 0, attacker);
	const uids = tgts.map(t => t.uid);
	ok('Taunt forces the courser to be a legal target', uids.includes(courser.uid), JSON.stringify(tgts));
	ok('Taunt hides the vanilla neighbour', !uids.includes(vanilla.uid), JSON.stringify(tgts));
	ok('Taunt hides the enemy hero', !tgts.some(t => t.type === 'hero'), JSON.stringify(tgts));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
