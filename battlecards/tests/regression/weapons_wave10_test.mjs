// Missing HS weapons — wave 10: spell-cost summons (Cosmic Keyboard / Ceremonial Maul).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 56) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const cast = (st, cost) => { const sp = { id: 't_sp' + cost, name: 'Sp', type: 'sorcery', cost, rarity: 'basic', effects: [{ type: 'armor', value: 0 }] }; cardsById[sp.id] = sp; const c = E.instantiate(sp, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };

for (const id of ['cosmic_keyboard', 'ceremonial_maul']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Cosmic Keyboard: after you cast a spell, summon an Elemental with stats = its Cost; lose 1 Durability
{
	const st = game(); const w = equip(st, 'cosmic_keyboard'); const d0 = w.durability;
	cast(st, 4);
	const elem = st.players[0].board.find(c => (c.tribe || '').includes('Elemental'));
	ok('Cosmic Keyboard summoned a 4/4 Elemental (stats = spell Cost)', elem && elem.attack === 4 && E.hp(elem) === 4, elem && [elem.attack, E.hp(elem)]);
	ok('Cosmic Keyboard lost 1 Durability', st.players[0].weapon.durability === d0 - 1, [d0, st.players[0].weapon?.durability]);
}
// Ceremonial Maul: Spellburst — summon a Student with Taunt and stats = spell's Cost (ONCE)
{
	const st = game(); equip(st, 'ceremonial_maul');
	cast(st, 3);
	const student = st.players[0].board.find(c => c.name === 'Student');
	ok('Ceremonial Maul summoned a 3/3 Student with Taunt', student && student.attack === 3 && (student.keywords || []).includes('taunt'), student && [student.attack, student.keywords]);
	const countAfterFirst = st.players[0].board.filter(c => c.name === 'Student').length;
	cast(st, 5); // second spell — Spellburst is spent
	ok('Spellburst fired only once (no second Student)', st.players[0].board.filter(c => c.name === 'Student').length === countAfterFirst, st.players[0].board.filter(c => c.name === 'Student').length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
