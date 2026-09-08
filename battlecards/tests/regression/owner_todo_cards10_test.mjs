// Tenth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Reclamation Sage -> "Battlecry: Destroy target artifact, location or
//                        enchantment." (previously artifact OR enchantment only)
//
// This needed engine work, so it is FIRED against all three permanent kinds:
//  - new target value 'artifact-location-or-enchantment' in targeting.js
//    (spec + filter), so legalTargets/AI can pick a location too
//  - destroy-permanent's targeted branch now removes a location from the board
//    (it previously only knew the artifact/enchantment zones)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 15) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
// play Reclamation Sage from P0's hand at the given permanent
const fire = (st, target) => {
	const sp = E.instantiate(cardsById.reclamation_sage, 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, target, null, 0);
};

{
	const c = cardsById.reclamation_sage;
	ok('reads "Battlecry: Destroy target artifact, location or enchantment."',
		c.description === 'Battlecry: Destroy target artifact, location or enchantment.', JSON.stringify(c.description));
	ok('effect targets artifact-location-or-enchantment',
		c.effects?.[0]?.type === 'destroy-permanent' && c.effects?.[0]?.target === 'artifact-location-or-enchantment', JSON.stringify(c.effects));

	// legalTargets now offers a location
	{
		const st = game();
		const loc = E.instantiate({ id: 'loc', name: 'Loc', type: 'location', cost: 2 }, 1); loc.zone = 'board'; st.players[1].board.push(loc);
		E.recomputeAuras(st);
		const spec = E.targetSpec(cardsById.reclamation_sage, c.effects, cardsById.reclamation_sage);
		const legal = E.legalTargets(st, 0, spec);
		ok('legalTargets includes the enemy location', legal.some(t => t.type === 'location' && t.uid === loc.uid), JSON.stringify(legal));
	}

	// FIRE at a LOCATION
	{
		const st = game();
		const loc = E.instantiate({ id: 'loc', name: 'Loc', type: 'location', cost: 2 }, 1); loc.zone = 'board'; st.players[1].board.push(loc);
		E.recomputeAuras(st);
		fire(st, { type: 'location', uid: loc.uid, player: 1 });
		ok('destroys a LOCATION', !st.players[1].board.some(x => x.uid === loc.uid), st.players[1].board.map(x => x.type));
	}
	// FIRE at an ARTIFACT
	{
		const st = game();
		const art = E.instantiate({ id: 'art', name: 'Art', type: 'artifact', cost: 2 }, 1); st.players[1].artifacts.push(art);
		E.recomputeAuras(st);
		fire(st, { type: 'artifact', uid: art.uid, player: 1 });
		ok('destroys an ARTIFACT', !st.players[1].artifacts.some(x => x.uid === art.uid), st.players[1].artifacts.length);
	}
	// FIRE at an ENCHANTMENT
	{
		const st = game();
		const ench = E.instantiate({ id: 'ench', name: 'Ench', type: 'enchantment', cost: 2 }, 1); st.players[1].enchantments.push(ench);
		E.recomputeAuras(st);
		fire(st, { type: 'enchantment', uid: ench.uid, player: 1 });
		ok('destroys an ENCHANTMENT', !st.players[1].enchantments.some(x => x.uid === ench.uid), st.players[1].enchantments.length);
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
