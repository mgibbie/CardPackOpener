// Missing HS weapons — wave 9: turn-start summon-from-hand, tribe tutor, soul fragments.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 55) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h, ...extra });

for (const id of ['skull_of_the_man_ari', 'umpire_s_grasp', 'marrowslicer'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Skull of the Man'ari: at start of your turn, summon a Demon from your hand
{
	const st = game();
	cardsById.dm_Imp = dummy(3, 3, 'Imp', { tribe: 'Demon' }); cardsById.dm_Wisp = dummy(1, 1, 'Wisp');
	const imp = E.instantiate(cardsById.dm_Imp, 0); imp.zone = 'hand'; st.players[0].hand.push(imp);
	const wisp = E.instantiate(cardsById.dm_Wisp, 0); wisp.zone = 'hand'; st.players[0].hand.push(wisp);
	equip(st, 'skull_of_the_man_ari');
	// advance to player 0's next turn start
	E.endTurn(st); E.endTurn(st);
	ok('Skull of the Man\'ari summoned the Demon from hand', st.players[0].board.some(c => c.id === 'dm_Imp'), st.players[0].board.map(c => c.id));
	ok('the non-Demon stayed in hand', st.players[0].hand.some(c => c.id === 'dm_Wisp'));
}
// Umpire's Grasp: Deathrattle draw a Demon and reduce its Cost by (2)
{
	const st = game();
	cardsById.t_demon = { id: 't_demon', name: 'D', type: 'creature', cost: 5, attack: 3, health: 3, tribe: 'Demon' };
	cardsById.t_notdemon = { id: 't_notdemon', name: 'N', type: 'creature', cost: 5, attack: 3, health: 3, tribe: 'Beast' };
	st.players[0].deck = ['t_notdemon', 't_demon', 't_notdemon'];
	equip(st, 'umpire_s_grasp'); E.breakWeapon(st, 0);
	const drawn = st.players[0].hand.find(c => c.id === 't_demon');
	ok('Umpire\'s Grasp drew the Demon', !!drawn, st.players[0].hand.map(c => c.id));
	ok('the drawn Demon costs (2) less (5→3)', drawn && drawn.cost === 3, drawn?.cost);
}
// Marrowslicer: Battlecry shuffle 2 Soul Fragments into your deck
{
	const st = game();
	st.players[0].deck = ['chillwind_yeti'];
	equip(st, 'marrowslicer');
	ok('Marrowslicer shuffled 2 Soul Fragments into the deck', st.players[0].deck.filter(id => id === 'sch_soul_fragment').length === 2, st.players[0].deck);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
