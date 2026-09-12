// Forty-sixth batch from the wiki's owner inbox (owner_todo), 2026-09-12.
//   riftwing_cloudskate -> reword bounce to "target creature you don't control"
//                          (mechanic unchanged: enemy-creature = a creature you don't control)
//   blazing_rootwalla   -> "Rush & Firebreathing" — Firebreathing auto-grants the
//                          repeatable (1):+1 Attack, so the custom (1):+2/+0 is dropped
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Riftwing Cloudskate ----------
{
	const def = cardsById.riftwing_cloudskate;
	ok('Riftwing reworded to "creature you don\'t control"', def.description === "Elusive.\nBattlecry: Bounce target creature you don't control.", JSON.stringify(def.description));
	ok('Riftwing keeps Elusive', (def.keywords || []).includes('elusive'), JSON.stringify(def.keywords));
	ok('Riftwing still bounces an enemy creature', (def.effects || []).some(e => e.type === 'bounce' && e.target === 'enemy-creature'), JSON.stringify(def.effects));
	// FIRE: the battlecry returns an opponent's creature to their hand
	const st = game();
	const foe = E.instantiate(cardsById.grizzly_bears, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const rift = E.instantiate(def, 0); rift.zone = 'hand'; st.players[0].hand.push(rift);
	E.playCard(st, 0, rift.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('the enemy creature left the board', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.uid));
	ok('the enemy creature returned to its owner hand', st.players[1].hand.some(c => c.id === 'grizzly_bears'), st.players[1].hand.map(c => c.id));
}

// ---------- Blazing Rootwalla ----------
{
	const def = cardsById.blazing_rootwalla;
	ok('Rootwalla text is "Firebreathing & Rush."', def.description === 'Firebreathing & Rush.', JSON.stringify(def.description));
	ok('Rootwalla has the rush keyword', (def.keywords || []).includes('rush'), JSON.stringify(def.keywords));
	ok('Rootwalla has the firebreathing keyword', (def.keywords || []).includes('firebreathing'), JSON.stringify(def.keywords));
	ok('Rootwalla has no leftover custom activated ability in its def', def.activated === undefined, JSON.stringify(def.activated));
	// FIRE: instantiate grants the repeatable (1):+1 Attack; firing twice pumps +1 each
	const st = game();
	const root = E.instantiate(def, 0); root.zone = 'board'; root.sick = false; st.players[0].board.push(root);
	ok('instantiate injected exactly one (Firebreathing) activated ability', (root.activated || []).length === 1 && root.activated[0].repeatable, JSON.stringify(root.activated));
	const a0 = root.attack;
	ok('first activation: +1 Attack', E.activateAbility(st, 0, root.uid, 0, null) && root.attack === a0 + 1, [a0, root.attack]);
	ok('repeatable: second activation: +1 Attack again', E.activateAbility(st, 0, root.uid, 0, null) && root.attack === a0 + 2, [a0, root.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
