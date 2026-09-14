// Fifty-seventh batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   wastes_whispersilk_cloak -> "Target creature gains +1 Attack & Elusive."
//                               (reword; mechanic unchanged: +1/+0 & grant Elusive, any creature)
//   lava_spike -> "Target player loses 3 Life." — target ONE player (chosen in FFA,
//                 auto in 1v1) for 3 (was "Deal 3 damage to a player" = all opponents)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const gameN = (seed, n) => {
	const st = E.createGame(cardsById, seededRng(seed), null, n, Array.from({ length: n }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null })));
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Whispersilk Cloak ----------
{
	const def = cardsById.wastes_whispersilk_cloak;
	ok('Whispersilk text is "Target creature gains +1 Attack & Elusive."', def.description === 'Target creature gains +1 Attack & Elusive.', JSON.stringify(def.description));
	const e = (def.effects || [])[0];
	ok('it buffs +1/+0 and grants Elusive to any creature', e && e.type === 'buff' && e.attack === 1 && (e.health || 0) === 0 && e.grant === 'elusive' && e.target === 'creature', JSON.stringify(def.effects));
	// FIRE on a friendly creature
	const st = gameN(1, 2);
	const own = E.instantiate({ id: 'o', name: 'O', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); own.zone = 'board'; own.sick = false; st.players[0].board.push(own);
	const a0 = own.attack, h0 = E.hp(own);
	const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	E.playCard(st, 0, c.uid, { type: 'creature', uid: own.uid, player: 0 }, null, 0);
	ok('friendly target got +1 Attack, health unchanged', own.attack === a0 + 1 && E.hp(own) === h0, [own.attack, E.hp(own)]);
	ok('friendly target gained Elusive', (own.keywords || []).includes('elusive'), JSON.stringify(own.keywords));
	// an enemy creature is a legal target (target: creature = any)
	const st2 = gameN(1, 2);
	const foe = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 2, attack: 2, health: 2 }, 1); foe.zone = 'board'; foe.sick = false; st2.players[1].board.push(foe);
	const legal = E.legalTargets(st2, 0, E.targetSpec(st2, 0, E.instantiate(def, 0)));
	ok('an enemy creature is a legal target', legal.some(t => t.uid === foe.uid), legal.map(t => t.uid));
}

// ---------- Lava Spike ----------
{
	const def = cardsById.lava_spike;
	ok('Lava Spike text is "Target player loses 3 Life."', def.description === 'Target player loses 3 Life.', JSON.stringify(def.description));
	ok('it uses a target-player damage of 3', (def.effects || []).some(e => e.type === 'target-player' && e.action === 'damage' && e.value === 3), JSON.stringify(def.effects));

	// 1v1: auto-hits the single opponent for 3, no lingering pick
	const st = gameN(2, 2); st.players[1].life = 30;
	const s = E.instantiate(def, 0); s.zone = 'hand'; st.players[0].hand.push(s);
	E.playCard(st, 0, s.uid, null, null, 0);
	ok('1v1: the opponent loses 3 Life (30 -> 27)', st.players[1].life === 27, st.players[1].life);
	ok('1v1: no target-player pick lingers', (st.pickQueue || []).length === 0, st.pickQueue);

	// FFA: pushes a target-player damage pick over the opponents
	const ffa = gameN(3, 3); ffa.players[1].life = 30; ffa.players[2].life = 30;
	const s2 = E.instantiate(def, 0); s2.zone = 'hand'; ffa.players[0].hand.push(s2);
	E.playCard(ffa, 0, s2.uid, null, null, 0);
	const pend = (ffa.pickQueue || [])[0];
	ok('FFA: a target-player damage pick is queued', pend && pend.mode === 'target-player' && pend.action === 'damage' && pend.value === 3, JSON.stringify(pend));
	ok('FFA: both opponents are choices', pend && pend.ids.includes('1') && pend.ids.includes('2'), pend && pend.ids);
	ok('FFA: nobody has lost Life until a target is chosen', ffa.players[1].life === 30 && ffa.players[2].life === 30, [ffa.players[1].life, ffa.players[2].life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
