// Forty-seventh batch from the wiki's owner inbox (owner_todo), 2026-09-12.
//   sage_s_row_savant      -> capitalize Scry ("Battlecry: Scry 2.")
//   me_gandalf_glamdring   -> "Frigid & Swift.\nSwing: Freeze each creature you don't control."
//     (adds the Frigid keyword; the Swing freeze is the pre-existing hero-attacks
//      ongoing. Frigid on a WEAPON was wired up in this change: 50% chance to
//      Freeze a creature that survives combat with the weapon.)
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
const vanillaFoe = (st, n, hp = 5) => { const c = E.instantiate({ id: 'van' + n, name: 'Van' + n, type: 'creature', cost: 3, attack: 1, health: hp }, 1); c.zone = 'board'; c.sick = false; st.players[1].board.push(c); return c; };

// ---------- Sage's Row Savant: capitalize Scry ----------
{
	const def = cardsById.sage_s_row_savant;
	ok('Sage text capitalizes Scry', def.description === 'Battlecry: Scry 2.', JSON.stringify(def.description));
	const st = game(1);
	const sage = E.instantiate(def, 0); sage.zone = 'hand'; st.players[0].hand.push(sage);
	st.players[0].deck = ['van1', 'van2', 'van3']; cardsById.van1 = cardsById.van2 = cardsById.van3 = { id: 'van1', name: 'V', type: 'creature', cost: 1, attack: 1, health: 1 };
	E.playCard(st, 0, sage.uid, null, null, 0);
	ok('Sage battlecry queues Scry 2 (2 cards to sort)', st.scryQueue.length === 1 && (st.scryQueue[0].ids || []).length === 2, JSON.stringify(st.scryQueue[0]));
}

// ---------- Gandalf's Glamdring: Frigid & Swift + Swing freeze ----------
{
	const def = cardsById.me_gandalf_glamdring;
	ok('Glamdring text is "Frigid & Swift." + Swing line', def.description === "Frigid & Swift.\nSwing: Freeze each creature you don't control.", JSON.stringify(def.description));
	ok('Glamdring keeps Swift (first_strike)', (def.keywords || []).includes('first_strike'), JSON.stringify(def.keywords));
	ok('Glamdring gains Frigid', (def.keywords || []).includes('frigid'), JSON.stringify(def.keywords));
	ok('Glamdring Swing is a hero-attacks freeze of enemy creatures', def.ongoing && def.ongoing.on === 'hero-attacks' && def.ongoing.effects.some(e => e.type === 'freeze' && e.target === 'enemy-creatures'), JSON.stringify(def.ongoing));

	// FIRE: equip, swing at face (no taunts) -> every enemy creature freezes
	const st = game(2);
	const e1 = vanillaFoe(st, 1), e2 = vanillaFoe(st, 2);
	const w = E.instantiate(def, 0); w.zone = 'hand'; st.players[0].hand.push(w);
	E.playCard(st, 0, w.uid, null, null, 0); st.players[0].heroAttacksUsed = 0;
	ok('Glamdring equipped with Frigid on the weapon', (st.players[0].weapon.keywords || []).includes('frigid'), JSON.stringify(st.players[0].weapon.keywords));
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('Swing froze the first enemy creature', !!e1.frozen, e1.frozen);
	ok('Swing froze the second enemy creature', !!e2.frozen, e2.frozen);
}

// ---------- Frigid on a weapon: ~50% to Freeze a creature that SURVIVES the swing ----------
{
	// isolate Frigid from the Swing effect using a plain frigid weapon vs a fat survivor
	cardsById.t_frigid_w = { id: 't_frigid_w', name: 'T Frigid', type: 'weapon', cost: 1, attack: 1, durability: 99, keywords: ['frigid'] };
	let froze = 0; const trials = 40;
	for (let s = 0; s < trials; s++) {
		const st = game(500 + s);
		const foe = E.instantiate({ id: 'bigfoe', name: 'Big', type: 'creature', cost: 5, attack: 0, health: 20 }, 1);
		foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
		st.players[0].weapon = E.instantiate(cardsById.t_frigid_w, 0); st.players[0].heroAttacksUsed = 0;
		E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
		if (foe.frozen) froze++;
	}
	// deterministic across fixed seeds: proves the wiring fires (froze>0) and is a
	// coin-flip, not a guaranteed freeze (froze<trials). Wide band survives RNG drift.
	ok('Frigid weapon sometimes freezes a survivor (wiring connected)', froze > 5, froze + '/' + trials);
	ok('Frigid weapon does NOT always freeze (it is 50%, not Freezer)', froze < trials - 5, froze + '/' + trials);
	delete cardsById.t_frigid_w;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
