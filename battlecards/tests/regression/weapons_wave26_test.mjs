// Wave 26: Molten Blade — while in hand it transforms into a random weapon each turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'warrior'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
// end player 0's turn, then player 1's, returning to a fresh player-0 turn start
const cycleTurn = (st) => { E.endTurn(st); E.endTurn(st); };
const isWeaponDef = (id) => cardsById[id] && cardsById[id].type === 'weapon' && cardsById[id].collectible !== false;

ok('molten_blade exists', cardsById.molten_blade);
ok('molten_blade is a weapon that transforms into weapons', cardsById.molten_blade.transformInHand && cardsById.molten_blade.transformInHandType === 'weapon');

// In hand, it transforms into a random weapon at the start of your turn
{
	const st = game();
	const mb = E.instantiate(cardsById.molten_blade, 0); mb.zone = 'hand'; st.players[0].hand.push(mb);
	const uid = mb.uid;
	ok('starts as Molten Blade', mb.id === 'molten_blade');
	cycleTurn(st);
	const after = st.players[0].hand.find(c => c.uid === uid);
	ok('same card object persists (transformed in place)', !!after, uid);
	ok('transformed into a real collectible weapon', after && isWeaponDef(after.id), after && after.id);
	ok('the transformed card is still a weapon type', after && cardsById[after.id].type === 'weapon', after && after.id);
	ok('it keeps transforming (still a shifter)', after && after.transformInHand === true && after.transformInHandType === 'weapon', after && [after.transformInHand, after.transformInHandType]);
	ok('adopted the new weapon stats', after && after.attack === (cardsById[after.id].attack || 0) && after.durability === (cardsById[after.id].durability || 0), after && [after.id, after.attack, after.durability]);
}

// It transforms AGAIN on the following turn (changes each turn)
{
	const st = game(2);
	const mb = E.instantiate(cardsById.molten_blade, 0); mb.zone = 'hand'; st.players[0].hand.push(mb);
	const uid = mb.uid;
	cycleTurn(st);
	const id1 = st.players[0].hand.find(c => c.uid === uid).id;
	cycleTurn(st);
	const id2 = st.players[0].hand.find(c => c.uid === uid).id;
	ok('both transforms yield valid weapons', isWeaponDef(id1) && isWeaponDef(id2), [id1, id2]);
	// (ids may coincide by chance, but the shift ran twice without error)
	ok('still a live weapon after two turns', cardsById[id2].type === 'weapon');
}

// Once equipped it stops transforming (no longer in hand)
{
	const st = game(3);
	const mb = E.instantiate(cardsById.molten_blade, 0); mb.zone = 'hand'; st.players[0].hand.push(mb);
	cycleTurn(st); // transforms into some weapon
	const inHand = st.players[0].hand[0];
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, inHand.uid, null, null, 0);
	const equippedId = st.players[0].weapon && st.players[0].weapon.id;
	ok('the current weapon got equipped', !!st.players[0].weapon, equippedId);
	cycleTurn(st);
	ok('equipped weapon does NOT transform (only in hand)', st.players[0].weapon && st.players[0].weapon.id === equippedId, [equippedId, st.players[0].weapon?.id]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
