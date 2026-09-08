// Thirteenth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Alpine Grizzly -> reword the Overkill clause to just "Gain +1/+2"
//                     (mechanics unchanged from batch 12).
//   Axebane Beast  -> Trample & Medic 1; Battlecry: Destroy target Hero Weapon.
//
// Axebane's two new pieces are FIRED: the Battlecry breaks an equipped enemy
// weapon, and Medic 1 patches up a wounded neighbour at end of turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 21) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['x', 'y', 'z']; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const onBoard = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; inst.summonedThisTurn = false; inst.attacksUsed = 0; st.players[pi].board.push(inst); return inst; };

// ---------- Alpine Grizzly: reworded Overkill ----------
{
	const c = cardsById.alpine_grizzly;
	ok('Alpine Grizzly reads "Rush.\\nOverkill: Gain +1/+2."', c.description === 'Rush.\nOverkill: Gain +1/+2.', JSON.stringify(c.description));
	ok('its Overkill effect is unchanged (buff-self +1/+2)',
		c.overkill?.[0]?.type === 'buff-self' && c.overkill[0].attack === 1 && c.overkill[0].health === 2, JSON.stringify(c.overkill));
}

// ---------- Axebane Beast: Trample, Medic 1, weapon-break Battlecry ----------
{
	const c = cardsById.axebane_beast;
	ok('Axebane Beast reads "Trample & Medic 1.\\nBattlecry: Destroy target Hero Weapon."',
		c.description === 'Trample & Medic 1.\nBattlecry: Destroy target Hero Weapon.', JSON.stringify(c.description));
	const inst = E.instantiate(c, 0);
	ok('instance carries trample + battlecry + medic 1', inst.keywords.includes('trample') && inst.keywords.includes('battlecry') && inst.medic === 1, JSON.stringify([inst.keywords, inst.medic]));
	ok('battlecry is destroy-weapon', c.effects?.[0]?.type === 'destroy-weapon', JSON.stringify(c.effects));

	// FIRE the Battlecry: the enemy is armed -> playing Axebane breaks their weapon
	{
		const st = game();
		st.players[1].weapon = { id: 'axe', name: 'Axe', attack: 3, durability: 2 };
		const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
		E.playCard(st, 0, sp.uid, null, null, 0);
		ok('Battlecry destroyed the enemy weapon', !st.players[1].weapon, st.players[1].weapon);
	}

	// FIRE Medic 1: a wounded neighbour is healed 1 at end of turn
	{
		const st = game();
		const axe = onBoard(st, 0, E.instantiate(c, 0));
		const buddy = onBoard(st, 0, E.instantiate({ id: 'bud', name: 'Buddy', type: 'creature', cost: 2, attack: 2, health: 5 }, 0));
		buddy.damage = 3; // wounded neighbour
		E.endTurn(st);
		ok('Medic 1 healed the wounded neighbour by 1', buddy.damage === 2, ['damage after', buddy.damage]);
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
