// Fifteenth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Fusion Elemental -> "Trample & Meteoric."
//
// Meteoric is a NEW keyword: a creature may attack enemy enchantments as if
// they were 1/1 creatures. Engine work: KW.METEORIC + a keywords.js glossary
// entry, attackTargets offers enemy enchantments to a Meteoric attacker (gated
// by Taunt like the hero), and resolveCombat gets an 'enchantment' branch that
// destroys the 1/1 and takes 1 back (First Strike skips the retaliation, Trample
// carries the excess to the controller).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 25) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const attacker = (st) => { const fe = E.instantiate(cardsById.fusion_elemental, 0); fe.zone = 'board'; fe.sick = false; st.players[0].board.push(fe); return fe; };
const foeEnch = (st) => { const e = E.instantiate({ id: 'ench', name: 'Ench', type: 'enchantment', cost: 2 }, 1); st.players[1].enchantments.push(e); return e; };

// ---------- card + keyword wiring ----------
{
	const c = cardsById.fusion_elemental;
	ok('Fusion Elemental reads "Trample & Meteoric."', c.description === 'Trample & Meteoric.', JSON.stringify(c.description));
	ok('instance carries trample + meteoric', E.instantiate(c, 0).keywords.includes('trample') && E.instantiate(c, 0).keywords.includes('meteoric'), JSON.stringify(c.keywords));
}

// ---------- attackTargets offers enemy enchantments to a Meteoric attacker ----------
{
	const st = game();
	const fe = attacker(st);
	const e = foeEnch(st);
	E.recomputeAuras(st);
	ok('a Meteoric attacker may target an enemy enchantment',
		E.attackTargets(st, 0, fe).some(t => t.type === 'enchantment' && t.uid === e.uid), JSON.stringify(E.attackTargets(st, 0, fe)));
}

// ---------- a plain (non-Meteoric) creature may NOT ----------
{
	const st = game();
	const plain = E.instantiate({ id: 'p', name: 'Plain', type: 'creature', cost: 2, attack: 3, health: 3, keywords: ['trample'] }, 0);
	plain.zone = 'board'; plain.sick = false; st.players[0].board.push(plain);
	foeEnch(st); E.recomputeAuras(st);
	ok('a non-Meteoric creature is offered no enchantment targets', !E.attackTargets(st, 0, plain).some(t => t.type === 'enchantment'));
}

// ---------- FIRE it: destroy the enchantment, take 1 back, Trample the excess ----------
{
	const st = game();
	const fe = attacker(st);            // 8/8 Trample & Meteoric
	const e = foeEnch(st);
	E.recomputeAuras(st);
	const life0 = st.players[1].life;
	E.attack(st, 0, fe.uid, { type: 'enchantment', uid: e.uid, player: 1 });
	ok('the enchantment is destroyed', !st.players[1].enchantments.some(x => x.uid === e.uid), st.players[1].enchantments.length);
	ok('the 1/1 dealt 1 back to the attacker', fe.damage === 1, ['damage', fe.damage]);
	ok('Trample carried the excess (8-1=7) to the enemy hero', st.players[1].life === life0 - 7, [life0, st.players[1].life]);
}

// ---------- Taunt gates it (must clear the wall first) ----------
{
	const st = game();
	const fe = attacker(st);
	foeEnch(st);
	const wall = E.instantiate({ id: 'w', name: 'Wall', type: 'creature', cost: 2, attack: 1, health: 4, keywords: ['taunt'] }, 1);
	wall.zone = 'board'; st.players[1].board.push(wall);
	E.recomputeAuras(st);
	ok('with an enemy Taunt up, the enchantment is not a legal target',
		!E.attackTargets(st, 0, fe).some(t => t.type === 'enchantment'), JSON.stringify(E.attackTargets(st, 0, fe)));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
