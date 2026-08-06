// Missing HS weapons — wave 11: Fist of Ra-den (legendary spell-cost summon) + Dragon Soul.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 57) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const cast = (st, cost = 1) => { const sp = { id: 't_sp' + cost + '_' + st.players[0].spellsPlayedThisTurn, name: 'Sp', type: 'sorcery', cost, rarity: 'basic', effects: [{ type: 'armor', value: 0 }] }; cardsById[sp.id] = sp; const c = E.instantiate(sp, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };

for (const id of ['the_fist_of_ra_den', 'dragon_soul']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// The Fist of Ra-den: after you cast a spell, summon a Legendary of that Cost; lose 1 Durability
{
	const st = game(); const w = equip(st, 'the_fist_of_ra_den'); const d0 = w.durability;
	const b0 = st.players[0].board.length;
	cast(st, 5);
	// a random 5-Cost Legendary; may be Colossal (summons appendages too), so
	// scan the newly-summoned minions rather than assuming exactly one
	const newOnes = st.players[0].board.slice(b0);
	const leg = newOnes.find(c => cardsById[c.id]?.rarity === 'legendary' && cardsById[c.id]?.cost === 5);
	ok('Fist of Ra-den summoned a minion after the spell', newOnes.length >= 1, newOnes.length);
	ok('a 5-Cost Legendary was summoned', !!leg, newOnes.map(c => [cardsById[c.id]?.rarity, cardsById[c.id]?.cost]));
	ok('Fist of Ra-den lost 1 Durability', st.players[0].weapon.durability === d0 - 1, [d0, st.players[0].weapon?.durability]);
}
// Dragon Soul: after your 3rd spell in a turn, summon a 5/5 Dragon
{
	const st = game(); equip(st, 'dragon_soul');
	cast(st); cast(st);
	ok('Dragon Soul: no Dragon after 2 spells', !st.players[0].board.some(c => c.name === 'Dragon'), st.players[0].board.map(c => c.name));
	cast(st); // 3rd spell
	ok('Dragon Soul summoned a 5/5 Dragon on the 3rd spell', st.players[0].board.some(c => c.name === 'Dragon' && c.attack === 5 && E.hp(c) === 5), st.players[0].board.map(c => [c.name, c.attack]));
	const dragons = st.players[0].board.filter(c => c.name === 'Dragon').length;
	cast(st); // 4th spell — should NOT summon another
	ok('Dragon Soul does not fire again on the 4th spell', st.players[0].board.filter(c => c.name === 'Dragon').length === dragons);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
