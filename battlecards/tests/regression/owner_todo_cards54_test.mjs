// Fifty-fourth batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   duress        -> "Target opponent discards a card at random." (target-player
//                    discard: auto in 1v1, a pick in a free-for-all)
//   bitterblossom -> lose 2 Life (was 1) & make a 1/1 Faerie Rogue with Lifesteal
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const gameN = (seed, n) => {
	const seats = Array.from({ length: n }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null }));
	const st = E.createGame(cardsById, seededRng(seed), null, n, seats);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.enchantments = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Duress: Target opponent discards at random ----------
{
	const def = cardsById.duress;
	ok('Duress text is "Target opponent discards a card at random."', def.description === 'Target opponent discards a card at random.', JSON.stringify(def.description));
	ok('Duress uses a target-player discard', (def.effects || []).some(e => e.type === 'target-player' && e.action === 'discard' && e.value === 1), JSON.stringify(def.effects));

	// 1v1: auto-resolves against the single opponent, one random discard, no pending pick
	const st = gameN(1, 2);
	st.players[1].hand = [E.instantiate(cardsById.grizzly_bears, 1), E.instantiate(cardsById.grizzly_bears, 1)];
	const before = st.players[1].hand.length;
	const d = E.instantiate(def, 0); d.zone = 'hand'; st.players[0].hand.push(d);
	E.playCard(st, 0, d.uid, null, null, 0);
	ok('1v1: the opponent discards one card', st.players[1].hand.length === before - 1, [before, st.players[1].hand.length]);
	ok('1v1: no target-player pick lingers (auto-resolved)', (st.pickQueue || []).length === 0, st.pickQueue);

	// FFA: pushes a target-player pick listing the opponents
	const ffa = gameN(2, 3);
	ffa.players[1].hand = [E.instantiate(cardsById.grizzly_bears, 1)];
	ffa.players[2].hand = [E.instantiate(cardsById.grizzly_bears, 2)];
	const d2 = E.instantiate(def, 0); d2.zone = 'hand'; ffa.players[0].hand.push(d2);
	E.playCard(ffa, 0, d2.uid, null, null, 0);
	const pend = (ffa.pickQueue || [])[0];
	ok('FFA: a target-player pick is queued for the caster', pend && pend.mode === 'target-player' && pend.player === 0, JSON.stringify(pend));
	ok('FFA: both opponents are choices', pend && pend.ids.includes('1') && pend.ids.includes('2'), pend && pend.ids);
}

// ---------- Bitterblossom: lose 2 Life & Lifesteal Faerie ----------
{
	const def = cardsById.bitterblossom;
	ok("Bitterblossom text says lose 2 Life & a Faerie with Lifesteal", def.description === 'At the start of your turn, lose 2 Life & create a 1/1 Faerie Rogue with Lifesteal.', JSON.stringify(def.description));
	ok('turn-start loses 2 Life', def.ongoing && def.ongoing.effects.some(e => e.type === 'damage' && e.value === 2 && e.target === 'own-hero'), JSON.stringify(def.ongoing));
	const summon = def.ongoing.effects.find(e => e.type === 'summon');
	ok('the Faerie is a 1/1 Faerie Rogue with Lifesteal', summon && summon.attack === 1 && summon.health === 1 && summon.name === 'Faerie Rogue' && (summon.keywords || []).includes('lifesteal'), JSON.stringify(summon));

	// FIRE: turn-start -> -2 Life + a Lifesteal Faerie on board
	const st = gameN(3, 2);
	st.players[0].life = 30;
	st.players[0].enchantments.push(E.instantiate(def, 0));
	E.fireOngoing(st, 0, 'turn-start');
	ok('lost 2 Life (30 -> 28)', st.players[0].life === 28, st.players[0].life);
	const fae = st.players[0].board.find(c => c.name === 'Faerie Rogue');
	ok('made a 1/1 Faerie Rogue', fae && fae.attack === 1 && E.hp(fae) === 1, fae && [fae.attack, E.hp(fae)]);
	ok('the Faerie has Lifesteal', fae && (fae.keywords || []).includes('lifesteal'), fae && fae.keywords);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
