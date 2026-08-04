// Missing HS weapons — wave 18: traded-self (Blackwater), force-attacked-neighbor
// (Supercollider), transform-friendly-costplus (Boggspine Knuckles).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 66) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'rogue', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, cost = 2, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['blackwater_cutlass', 'supercollider', 'boggspine_knuckles']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Blackwater Cutlass: after you Trade this, reduce a hand spell's Cost by (1)
{
	const st = game();
	const spell = E.instantiate({ id: 't_sp', name: 'Sp', type: 'sorcery', cost: 4, effects: [] }, 0); spell.zone = 'hand';
	const cut = E.instantiate(cardsById.blackwater_cutlass, 0); cut.zone = 'hand';
	st.players[0].hand = [cut, spell]; st.players[0].deck = ['chillwind_yeti']; st.players[0].mana.cur = 10;
	ok('Blackwater Cutlass is Tradeable', E.canTrade(st, 0, cut));
	E.tradeCard(st, 0, cut.uid);
	ok('trading it reduced the hand spell by 1 (4→3)', spell.cost === 3, spell.cost);
	ok('the Cutlass left play (shuffled to deck, possibly re-drawn)', st.players[0].deck.includes('blackwater_cutlass') || st.players[0].hand.some(c => c.id === 'blackwater_cutlass'));
}
// Supercollider: after you attack a minion, force it to attack a neighbour
{
	const st = game();
	const left = put(st, 1, dummy(3, 3, 'Left')); const mid = put(st, 1, dummy(2, 5, 'Mid')); const right = put(st, 1, dummy(3, 3, 'Right'));
	equip(st, 'supercollider'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: mid.uid, player: 1 }); // hero(1) hits Mid; Mid then attacks a neighbour
	const neighbourHit = (left.damage > 0) || (right.damage > 0);
	ok('Supercollider: the attacked minion struck a neighbour', neighbourHit, [left.damage, right.damage]);
	ok('the neighbour struck back at Mid (took its 3)', mid.damage >= 1 + 3, mid.damage); // hero 1 + neighbour 3
}
// Boggspine Knuckles: after your hero attacks, transform your minions into ones costing (1) more
{
	const st = game();
	const a = put(st, 0, dummy(1, 1, 'A', 1)); const b = put(st, 0, dummy(1, 1, 'B', 2));
	const foe = put(st, 1, dummy(0, 8, 'Foe'));
	equip(st, 'boggspine_knuckles'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	// A (cost 1) and B (cost 2) become random creatures costing 2 and 3 respectively
	const stillOriginal = st.players[0].board.some(c => c.id === 'dm_A' || c.id === 'dm_B');
	ok('Boggspine: your minions were transformed (originals gone)', !stillOriginal, st.players[0].board.map(c => c.id));
	ok('Boggspine: you still have 2 minions on board', st.players[0].board.filter(c => c.type !== 'location').length === 2, st.players[0].board.length);
	const transformed = st.players[0].board.filter(c => c.type !== 'location' && c.token);
	ok('both minions became transform tokens', transformed.length === 2, transformed.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
