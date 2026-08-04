// Wave 19: Hand of Infinity (temp weapon attack + noFace) + Low Security Wing (lock-in-hand).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass = 'paladin', seed = 67) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };

for (const id of ['hand_of_infinity', 'low_security_wing']) ok(`${id} exists`, cardsById[id], id);

// Hand of Infinity: Battlecry set Attack to INFINITY this turn; can't attack heroes
{
	const st = game('paladin'); const base = cardsById.hand_of_infinity.attack;
	const w = equip(st, 'hand_of_infinity');
	ok('Hand of Infinity: Attack set to a huge value this turn', E.heroAttackValue(st, st.players[0]) >= 9999, E.heroAttackValue(st, st.players[0]));
	ok('Hand of Infinity: cannot target the enemy hero', !E.heroAttackTargets(st, 0).some(t => t.type === 'hero'));
	// end of turn reverts the Attack
	E.endTurn(st);
	ok('Attack reverted after the turn', st.players[0].weapon.attack === base, [base, st.players[0].weapon?.attack]);
}

// Low Security Wing: get a random Shaman minion, locked in hand until you play another card
{
	const st = game('shaman');
	const loc = placeLoc(st, 'low_security_wing');
	E.tapLand(st, 0, loc.uid, 0, null);
	const got = st.players[0].hand[st.players[0].hand.length - 1];
	ok('Low Security Wing added a Shaman minion to hand', got && (cardsById[got.id]?.cardClass === 'shaman') && got.type === 'creature', got && [got.id, cardsById[got.id]?.cardClass]);
	ok('the minion is locked (cannot be played yet)', got._locked === true && !E.canPlay(st, 0, got), got?._locked);
	// play another card → it unlocks
	const other = E.instantiate({ id: 'other', name: 'O', type: 'sorcery', cost: 0, effects: [] }, 0); other.zone = 'hand'; st.players[0].hand.push(other); st.players[0].mana.cur = 10;
	E.playCard(st, 0, other.uid, null, null, 0);
	ok('playing another card unlocked the minion', got._locked === false, got._locked);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
