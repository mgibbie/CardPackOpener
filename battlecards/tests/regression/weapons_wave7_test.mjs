// Missing HS weapons — wave 7: summon-copies tribe, tribe deathrattle, play-minion
// damage, hero-attacks battlecry-cost cut.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 53) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['splitting_axe', 'boom_wrench', 'overlord_s_whip', 'auctionhouse_gavel'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Splitting Axe: Battlecry summon copies of your Totems (only Totems)
{
	const st = game();
	cardsById.dm_Totem = dummy(0, 2, 'Totem', { tribe: 'Totem' }); cardsById.dm_NonTotem = dummy(3, 3, 'NonTotem');
	put(st, 0, cardsById.dm_Totem); put(st, 0, cardsById.dm_NonTotem);
	const before = st.players[0].board.length;
	equip(st, 'splitting_axe');
	const totems = st.players[0].board.filter(c => (c.tribe || '').includes('Totem')).length;
	ok('Splitting Axe copied only the Totem (now 2 totems)', totems === 2 && st.players[0].board.length === before + 1, [totems, st.players[0].board.length - before]);
}
// Boom Wrench: Deathrattle trigger a random friendly MECH's deathrattle
{
	const st = game();
	put(st, 0, dummy(2, 2, 'Mech', { tribe: 'Mech', keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }));
	put(st, 0, dummy(2, 2, 'NonMech', { keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 9, target: 'enemy-hero' }] }));
	equip(st, 'boom_wrench'); E.breakWeapon(st, 0);
	ok('Boom Wrench triggered the Mech deathrattle (−3), not the non-Mech', st.players[1].life === 27, st.players[1].life);
	ok('Boom Wrench is Miniaturize', cardsById.boom_wrench.miniaturize === true);
}
// Overlord's Whip: after you play a minion, deal 1 damage to it
{
	const st = game();
	equip(st, 'overlord_s_whip');
	const m = E.instantiate(dummy(3, 3, 'Played'), 0); m.zone = 'hand'; st.players[0].hand.push(m); cardsById.dm_Played = dummy(3, 3, 'Played');
	st.players[0].mana.cur = 10; E.playCard(st, 0, m.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'dm_Played');
	ok('Overlord\'s Whip dealt 1 to the played minion', onBoard && onBoard.damage === 1, onBoard?.damage);
}
// Auctionhouse Gavel: after hero attacks, reduce a Battlecry minion in hand by (1)
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe'));
	const bc = E.instantiate(dummy(3, 3, 'BC', { cost: 5, keywords: ['battlecry'] }), 0); bc.zone = 'hand'; st.players[0].hand.push(bc);
	const plain = E.instantiate(dummy(3, 3, 'Plain', { cost: 5 }), 0); plain.zone = 'hand'; st.players[0].hand.push(plain);
	equip(st, 'auctionhouse_gavel'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Auctionhouse Gavel reduced the Battlecry minion (5→4)', bc.cost === 4, bc.cost);
	ok('Auctionhouse Gavel left the non-Battlecry minion alone', plain.cost === 5, plain.cost);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
