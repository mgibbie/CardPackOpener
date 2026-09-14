// Fifty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   ravenous_chupacabra    -> reword to "Battlecry: Destroy target creature you
//                             don't control." (mechanic unchanged: enemy-creature)
//   me_gandalf_flameofanor -> "Deal 2 damage to any target & Scry 1." (& join)
//   me_gandalf_shadowfax   -> tribe Horse -> Beast (keeps Rush & Elusive)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Ravenous Chupacabra ----------
{
	const def = cardsById.ravenous_chupacabra;
	ok('Chupacabra reworded to "target creature you don\'t control"', def.description === "Battlecry: Destroy target creature you don't control.", JSON.stringify(def.description));
	ok('it still destroys an enemy creature', (def.effects || []).some(e => e.type === 'destroy' && e.target === 'enemy-creature'), JSON.stringify(def.effects));
	// FIRE: destroys a chosen enemy creature; friendly creatures are not legal targets
	const st = game(1);
	const own = E.instantiate({ id: 'o', name: 'O', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); own.zone = 'board'; own.sick = false; st.players[0].board.push(own);
	const foe = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 3, attack: 3, health: 3 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(def, 0)));
	ok('an enemy creature is a legal target', legal.some(t => t.uid === foe.uid), legal.map(t => t.uid));
	ok('a friendly creature is NOT a legal target', !legal.some(t => t.uid === own.uid), legal.map(t => t.uid));
	E.playCard(st, 0, c.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('the targeted enemy creature is destroyed', !st.players[1].board.some(x => x.uid === foe.uid), st.players[1].board.map(x => x.uid));
	ok('the friendly creature is untouched', st.players[0].board.some(x => x.uid === own.uid), st.players[0].board.map(x => x.uid));
}

// ---------- Flame of Anor ----------
{
	const def = cardsById.me_gandalf_flameofanor;
	ok('Flame of Anor uses the & join', def.description === 'Deal 2 damage to any target & Scry 1.', JSON.stringify(def.description));
	ok('it deals 2 to any target', (def.effects || []).some(e => e.type === 'damage' && e.value === 2 && e.target === 'any'), JSON.stringify(def.effects));
	ok('it scries 1', (def.effects || []).some(e => e.type === 'scry' && e.value === 1), JSON.stringify(def.effects));
	// FIRE: 2 damage to a creature + queue a Scry 1
	const st = game(2); st.players[0].deck = ['grizzly_bears', 'grizzly_bears'];
	const foe = E.instantiate({ id: 'tgt', name: 'T', type: 'creature', cost: 5, attack: 1, health: 5 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const h0 = E.hp(foe);
	const sp = E.instantiate(def, 0); sp.zone = 'hand'; st.players[0].hand.push(sp);
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('dealt 2 damage (5 -> 3)', E.hp(foe) === h0 - 2, [h0, E.hp(foe)]);
	ok('queued a Scry 1', st.scryQueue.length === 1 && (st.scryQueue[0].ids || []).length === 1, JSON.stringify(st.scryQueue[0]));
}

// ---------- Shadowfax ----------
{
	const def = cardsById.me_gandalf_shadowfax;
	ok('Shadowfax tribe is Beast', def.tribe === 'Beast', def.tribe);
	ok('Shadowfax keeps Rush & Elusive', ['rush', 'elusive'].every(k => (def.keywords || []).includes(k)), JSON.stringify(def.keywords));
	const inst = E.instantiate(def, 0);
	ok('the instance reports the Beast tribe', (inst.tribe || '').includes('Beast'), inst.tribe);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
