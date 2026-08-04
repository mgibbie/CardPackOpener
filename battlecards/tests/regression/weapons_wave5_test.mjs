// Missing HS weapons — wave 5: deck/hand deathrattle & battlecry effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 48) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.startingDeckIds = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const dummy = (a, h, name, cost = 2, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['cavalry_horn', 'crystal_tusk', 'smuggled_shovel', 'inspiring_maul'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Cavalry Horn: Deathrattle summon the lowest-Cost minion from your hand
{
	const st = game();
	cardsById.dm_Cheap = dummy(1, 1, 'Cheap', 1); cardsById.dm_Big = dummy(5, 5, 'Big', 5);
	toHand(st, 0, cardsById.dm_Big); toHand(st, 0, cardsById.dm_Cheap);
	equip(st, 'cavalry_horn'); E.breakWeapon(st, 0);
	ok('Cavalry Horn summoned the lowest-Cost minion (Cheap)', st.players[0].board.some(c => c.id === 'dm_Cheap') && !st.players[0].board.some(c => c.id === 'dm_Big'), st.players[0].board.map(c => c.id));
	ok('the summoned minion left the hand', !st.players[0].hand.some(c => c.id === 'dm_Cheap'));
}
// Crystal Tusk: Battlecry shuffle leftmost hand card into deck; Deathrattle draw 2
{
	const st = game();
	cardsById.dm_Left = dummy(2, 2, 'Left'); cardsById.dm_Right = dummy(2, 2, 'Right');
	const left = toHand(st, 0, cardsById.dm_Left); const right = toHand(st, 0, cardsById.dm_Right);
	st.players[0].deck = ['chillwind_yeti', 'chillwind_yeti'];
	equip(st, 'crystal_tusk');
	ok('Crystal Tusk battlecry shuffled the leftmost card into deck', !st.players[0].hand.some(c => c.uid === left.uid) && st.players[0].deck.includes('dm_Left'), st.players[0].deck);
	ok('the other hand card stayed', st.players[0].hand.some(c => c.uid === right.uid));
	const h0 = st.players[0].hand.length; E.breakWeapon(st, 0);
	ok('Crystal Tusk deathrattle drew 2', st.players[0].hand.length === h0 + 2, st.players[0].hand.length - h0);
}
// Smuggled Shovel: Deathrattle draw a spell that didn't start in your deck
{
	const st = game();
	// deck has a "native" spell (in startingDeckIds) and a "foreign" spell (not)
	cardsById.t_native = { id: 't_native', name: 'Nat', type: 'sorcery', cost: 1, effects: [] };
	cardsById.t_foreign = { id: 't_foreign', name: 'For', type: 'sorcery', cost: 1, effects: [] };
	st.players[0].deck = ['t_native', 't_foreign', 'chillwind_yeti'];
	st.players[0].startingDeckIds = ['t_native', 'chillwind_yeti']; // t_foreign was shuffled in later
	equip(st, 'smuggled_shovel'); E.breakWeapon(st, 0);
	ok('Smuggled Shovel drew the FOREIGN spell', st.players[0].hand.some(c => c.id === 't_foreign'), st.players[0].hand.map(c => c.id));
	ok('it did NOT draw the native spell or the minion', !st.players[0].hand.some(c => c.id === 't_native'));
}
// Inspiring Maul: Deathrattle trigger a random friendly minion's end-of-turn effect
{
	const st = game();
	// a friendly minion whose turn-end ongoing deals 2 to the enemy hero
	put(st, 0, dummy(2, 2, 'Ender', 2, { ongoing: { on: 'turn-end', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] } }));
	st.players[1].life = 30;
	equip(st, 'inspiring_maul'); E.breakWeapon(st, 0);
	ok('Inspiring Maul re-triggered a friendly end-of-turn effect (enemy hero -2)', st.players[1].life === 28, st.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
