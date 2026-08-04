// Locations wave 3: The Crystal Cove (set next summon 4/4) + Sinstone Graveyard (scaled Ghost).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 59) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name) => ({ id: 'dm_' + name, name, type: 'creature', cost: 1, rarity: 'basic', attack: a, health: h });

for (const id of ['the_crystal_cove', 'sinstone_graveyard']) ok(`${id} exists`, cardsById[id]?.type === 'location', id);

// The Crystal Cove: the next minion you summon this turn is set to 4/4 (played counts too)
{
	const st = game();
	const loc = placeLoc(st, 'the_crystal_cove');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('The Crystal Cove armed nextSummonStats', st.players[0].nextSummonStats?.attack === 4);
	cardsById.dm_Wisp = dummy(1, 1, 'Wisp');
	const m = E.instantiate(cardsById.dm_Wisp, 0); m.zone = 'hand'; st.players[0].hand.push(m); st.players[0].mana.cur = 10;
	E.playCard(st, 0, m.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'dm_Wisp');
	ok('the played 1/1 became a 4/4', onBoard && onBoard.attack === 4 && E.hp(onBoard) === 4, onBoard && [onBoard.attack, E.hp(onBoard)]);
	// only the NEXT minion — the effect is consumed
	ok('nextSummonStats consumed after one minion', !st.players[0].nextSummonStats);
}
// Sinstone Graveyard: a Ghost with +1/+1 for each other card played this turn
{
	const st = game();
	// play 2 cheap spells first → cardsPlayedThisTurn = 2
	for (let i = 0; i < 2; i++) { const sp = { id: 'sp' + i, name: 's', type: 'sorcery', cost: 0, effects: [] }; cardsById[sp.id] = sp; const c = E.instantiate(sp, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); }
	const loc = placeLoc(st, 'sinstone_graveyard');
	const before = st.players[0].board.filter(c => c.type !== 'location').length;
	E.tapLand(st, 0, loc.uid, 0, null);
	const ghost = st.players[0].board.find(c => c.name === 'Ghost');
	ok('Sinstone Graveyard summoned a Ghost scaled by cards played (1+2 = 3/3)', ghost && ghost.attack === 3 && E.hp(ghost) === 3, ghost && [ghost.attack, E.hp(ghost)]);
}
// Sinstone with NO cards played → base 1/1 Ghost
{
	const st = game();
	const loc = placeLoc(st, 'sinstone_graveyard');
	E.tapLand(st, 0, loc.uid, 0, null);
	const ghost = st.players[0].board.find(c => c.name === 'Ghost');
	ok('a base 1/1 Ghost with no cards played', ghost && ghost.attack === 1 && E.hp(ghost) === 1, ghost && [ghost.attack, E.hp(ghost)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
