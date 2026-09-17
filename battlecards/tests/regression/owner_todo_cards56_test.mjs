// Fifty-sixth batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   me_gandalf_radagast  -> reword "gain +1/+0" -> "gain +1 Attack" (mechanic unchanged)
//   wastes_star_compass  -> tap now "Gain 1 Mana this turn & Luck: Advance."
//   wastes_steel_overseer -> reword "Give your creatures +1/+1" ->
//                            "Creatures you control gain +1/+1" (mechanic unchanged)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Radagast: +1 Attack per spell ----------
{
	const def = cardsById.me_gandalf_radagast;
	ok('Radagast reworded to "gain +1 Attack"', def.description === 'Whenever you cast a spell, gain +1 Attack.', JSON.stringify(def.description));
	ok('it buffs itself +1/+0 on spell-played', def.ongoing && def.ongoing.on === 'spell-played' && def.ongoing.effects.some(e => e.type === 'buff-self' && e.attack === 1 && (e.health || 0) === 0), JSON.stringify(def.ongoing));
	const st = game(1);
	const r = E.instantiate(def, 0); r.zone = 'board'; r.sick = false; st.players[0].board.push(r);
	const a0 = r.attack, h0 = E.hp(r);
	E.fireOngoing(st, 0, 'spell-played', {});
	ok('a spell gives +1 Attack, health unchanged', r.attack === a0 + 1 && E.hp(r) === h0, [r.attack, E.hp(r)]);
}

// ---------- Star Compass: Gain 1 Mana & Luck: Advance ----------
{
	const def = cardsById.wastes_star_compass;
	ok('Star Compass is still an artifact with a tap ability', def.type === 'artifact' && !!def.tapAbility, def.type);
	ok('Star Compass tap text is the new wording', def.description === '{T}: Gain 1 Mana & Luck: Advance.', JSON.stringify(def.description));
	const fx = def.tapAbility.effects || [];
	ok('tap gains 1 mana', fx.some(e => e.type === 'gain-mana' && e.value === 1), JSON.stringify(fx));
	ok('tap has a Luck-wrapped Advance', fx.some(e => e.type === 'luck' && (e.effects || []).some(x => x.type === 'advance')), JSON.stringify(fx));
	// FIRE: gain-mana always fires; Luck: Advance coin-flips an advance pick
	let manaOk = 0, advanced = 0; const trials = 30;
	for (let s = 0; s < trials; s++) {
		const st = game(700 + s);
		const c = E.instantiate(def, 0); c.zone = 'artifact'; st.players[0].artifacts.push(c);
		const b0 = st.players[0].mana.bonus;
		E.tapArtifact(st, 0, c.uid, null);
		if (st.players[0].mana.bonus === b0 + 1) manaOk++;
		if ((st.pickQueue || []).some(q => q.mode === 'advance')) advanced++;
	}
	ok('gain-mana fires on every tap (30/30)', manaOk === trials, manaOk + '/' + trials);
	ok('Luck: Advance fires ~half the time (banded, proves wiring)', advanced > 5 && advanced < trials - 5, advanced + '/' + trials);
}

// ---------- Steel Overseer: Battlecry buff ----------
{
	const def = cardsById.wastes_steel_overseer;
	ok('Steel Overseer reworded to "Creatures you control gain +1/+1"', def.description === 'Battlecry: Creatures you control gain +1/+1.', JSON.stringify(def.description));
	ok('it buffs friendly creatures +1/+1', (def.effects || []).some(e => e.type === 'buff' && e.attack === 1 && e.health === 1 && e.target === 'friendly-creatures'), JSON.stringify(def.effects));
	const st = game(3);
	const ally = E.instantiate({ id: 'a', name: 'A', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); ally.zone = 'board'; ally.sick = false; st.players[0].board.push(ally);
	const so = E.instantiate(def, 0); so.zone = 'hand'; st.players[0].hand.push(so);
	const a0 = ally.attack, h0 = E.hp(ally);
	E.playCard(st, 0, so.uid, null, null, 0);
	ok('Battlecry gave a friendly creature +1/+1 (2/2 -> 3/3)', ally.attack === a0 + 1 && E.hp(ally) === h0 + 1, [ally.attack, E.hp(ally)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
