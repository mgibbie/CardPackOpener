// Twelfth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
// All three are Forest pool cards leaning into green-pie keywords.
//
//   Leatherback Baloth -> Trample & Regenerate 3.
//   Nessian Courser    -> Rush & Ward 2.
//   Alpine Grizzly     -> Rush & Overkill: gains +1/+2.
//
// Regenerate was documented in keywords.js but never wired — this batch adds a
// `regen` field + an end-of-turn self-heal loop (parallel to Medic). All three
// mechanics are FIRED:
//   - Regenerate: damage the Baloth, end the turn, watch it heal 3.
//   - Overkill:   the Grizzly overkills a small creature and grows +1/+2.
//   - Ward:       an enemy spell can't hit the Courser without the +2, then can.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 19) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['x', 'y', 'z']; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const onBoard = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; inst.summonedThisTurn = false; inst.attacksUsed = 0; st.players[pi].board.push(inst); return inst; };

// ---------- Leatherback Baloth: Regenerate 3 ----------
{
	const c = cardsById.leatherback_baloth;
	ok('Leatherback Baloth reads "Trample & Regenerate 3."', c.description === 'Trample & Regenerate 3.', JSON.stringify(c.description));
	const inst = E.instantiate(c, 0);
	ok('instance carries trample + regen 3', inst.keywords.includes('trample') && inst.regen === 3, JSON.stringify([inst.keywords, inst.regen]));

	// FIRE it: wound the Baloth, end the turn -> it heals 3 of its own damage
	const st = game();
	const baloth = onBoard(st, 0, E.instantiate(c, 0));
	baloth.damage = 4; // 4/5 taken to 1 Health
	E.endTurn(st);
	ok('Regenerate healed 3 at end of turn', baloth.damage === 1, ['damage after', baloth.damage]);
}

// ---------- Alpine Grizzly: Overkill gains +1/+2 ----------
{
	const c = cardsById.alpine_grizzly;
	// batch 12 set the Overkill; batch 13 reworded the clause to "Gain +1/+2" (see owner_todo_cards13_test)
	ok('Alpine Grizzly reads "Rush.\\nOverkill: Gain +1/+2."', c.description === 'Rush.\nOverkill: Gain +1/+2.', JSON.stringify(c.description));
	const inst = E.instantiate(c, 0);
	ok('instance carries rush + overkill buff', inst.keywords.includes('rush') && inst.keywords.includes('overkill')
		&& inst.overkill?.[0]?.type === 'buff-self' && inst.overkill[0].attack === 1 && inst.overkill[0].health === 2, JSON.stringify([inst.keywords, inst.overkill]));

	// FIRE it: the 4/2 Grizzly kills a 1/1 with overkill on your turn -> +1/+2 -> 5/4
	const st = game(); st.current = 0;
	const grizzly = onBoard(st, 0, E.instantiate(c, 0));
	const chump = onBoard(st, 1, E.instantiate({ id: 'ch', name: 'Chump', type: 'creature', cost: 1, attack: 1, health: 1 }, 1));
	E.attack(st, 0, grizzly.uid, { type: 'creature', uid: chump.uid, player: 1 });
	ok('the chump died', E.isDead(chump), [chump.damage, chump.maxHealth]);
	ok('Overkill grew the Grizzly to 5/4', grizzly.attack === 5 && grizzly.maxHealth === 4, [grizzly.attack, grizzly.maxHealth]);
}

// ---------- Nessian Courser: Ward 2 ----------
{
	const c = cardsById.nessian_courser;
	// Ward's mana number now renders as a mana pip "(2)" (see keywords.js) — later batch
	ok('Nessian Courser reads "Rush & Ward (2)."', c.description === 'Rush & Ward (2).', JSON.stringify(c.description));
	const inst = E.instantiate(c, 0);
	ok('instance carries rush + ward {mana:2}', inst.keywords.includes('rush') && inst.ward?.mana === 2, JSON.stringify([inst.keywords, inst.ward]));

	const zap = { id: 'zap', name: 'Zap', type: 'spell', cost: 1, effects: [{ type: 'damage', value: 2, target: 'creature' }] };
	// UNDERFUNDED: on P1's turn, P1 has only 1 mana; targeting the Ward-2 Courser
	// needs 1+2=3 -> blocked
	{
		const st = game(); st.current = 1;
		const courser = onBoard(st, 0, E.instantiate(c, 0)); courser.damage = 0;
		const sp = E.instantiate(zap, 1); sp.zone = 'hand'; st.players[1].hand.push(sp); st.players[1].mana.cur = 1;
		E.playCard(st, 1, sp.uid, { type: 'creature', uid: courser.uid, player: 0 }, null, 0);
		ok('Ward blocks the spell when the +2 is unaffordable', courser.damage === 0, ['damage', courser.damage]);
	}
	// FUNDED: on P1's turn with 3 mana; spell resolves and the Ward tax is paid
	{
		const st = game(); st.current = 1;
		const courser = onBoard(st, 0, E.instantiate(c, 0)); courser.damage = 0;
		const sp = E.instantiate(zap, 1); sp.zone = 'hand'; st.players[1].hand.push(sp); st.players[1].mana.cur = 3;
		E.playCard(st, 1, sp.uid, { type: 'creature', uid: courser.uid, player: 0 }, null, 0);
		ok('with 3 mana the spell lands on the Courser', courser.damage === 2, ['damage', courser.damage]);
		ok('the Ward tax + spell drained all 3 mana', st.players[1].mana.cur === 0, ['mana left', st.players[1].mana.cur]);
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
