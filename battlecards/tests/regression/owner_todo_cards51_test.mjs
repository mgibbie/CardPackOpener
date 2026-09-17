// Fifty-first batch from the wiki's owner inbox (owner_todo), 2026-09-13.
//   wastes_bottle_gnomes -> tribe "Mech Construct Gnome" (compound; mechanic unchanged)
//   wastes_pilgrims_eye  -> tribe Thopter -> Mech; reword "a Mana Crystal" ->
//                           "1 Mana Crystal" (effect already gain-mana value:1)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; }
	return st;
};

// ---------- Bottle Gnomes: compound tribe ----------
{
	const def = cardsById.wastes_bottle_gnomes;
	ok('Bottle Gnomes tribe is "Mech Construct Gnome"', def.tribe === 'Mech Construct Gnome', def.tribe);
	ok('Bottle Gnomes keeps its Battlecry heal', (def.effects || []).some(e => e.type === 'heal' && e.value === 3 && e.target === 'self'), JSON.stringify(def.effects));
	ok('Bottle Gnomes keeps Taunt', (def.keywords || []).includes('taunt'), JSON.stringify(def.keywords));
	const inst = E.instantiate(def, 0);
	ok('the instance reports all three tribe words', ['Mech', 'Construct', 'Gnome'].every(t => (inst.tribe || '').includes(t)), inst.tribe);
	// FIRE: Battlecry gains 3 Life
	const st = game(1); st.players[0].mana = { cur: 10, max: 10, bonus: 0 }; st.players[0].life = 25;
	const h = E.instantiate(def, 0); h.zone = 'hand'; st.players[0].hand.push(h);
	E.playCard(st, 0, h.uid, null, null, 0);
	ok('Battlecry gained 3 Life (25 -> 28)', st.players[0].life === 28, st.players[0].life);
}

// ---------- Pilgrim's Eye: Mech + reworded mana ----------
{
	const def = cardsById.wastes_pilgrims_eye;
	ok("Pilgrim's Eye tribe is Mech", def.tribe === 'Mech', def.tribe);
	ok("Pilgrim's Eye text normalized to \"Gain 1 Mana\"", def.description === 'Elusive. Battlecry: Gain 1 Mana.', JSON.stringify(def.description));
	ok("Pilgrim's Eye keeps Elusive", (def.keywords || []).includes('elusive'), JSON.stringify(def.keywords));
	ok("Pilgrim's Eye still gains 1 mana", (def.effects || []).some(e => e.type === 'gain-mana' && e.value === 1), JSON.stringify(def.effects));
	// FIRE: Battlecry adds a mana crystal this turn
	const st = game(2); st.players[0].mana = { cur: 2, max: 2, bonus: 0 };
	const pe = E.instantiate(def, 0); pe.zone = 'hand'; st.players[0].hand.push(pe);
	E.playCard(st, 0, pe.uid, null, null, 0);
	ok('Battlecry granted a temporary mana crystal this turn', st.players[0].mana.bonus === 1, [st.players[0].mana.cur, st.players[0].mana.bonus]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
