// Wave 38 (locations): Nespirah, Enthralled — tap deals 1 damage; reopens after
// you cast a Fel spell; Deathrattle summons Nespirah, Unshackled (which conjures a
// 1-Cost Naga after each Fel spell).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
// spell school lives in the `tribe` field (schoolOf reads card.tribe)
cardsById.t_fel = { id: 't_fel', name: 'Fel Bolt', type: 'sorcery', cost: 0, tribe: 'Fel', effects: [{ type: 'armor', value: 0 }] };
cardsById.t_arcane = { id: 't_arcane', name: 'Arc Bolt', type: 'sorcery', cost: 0, tribe: 'Arcane', effects: [{ type: 'armor', value: 0 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const castSpell = (st, id) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, null, null, 0); };

for (const id of ['nespirah_enthralled', 'nespirah_unshackled']) ok(`${id} exists`, cardsById[id], id);

// Tap deals 1 damage to a chosen target
{
	const st = game();
	const loc = placeLoc(st, 'nespirah_enthralled');
	const before = st.players[1].life;
	E.tapLand(st, 0, loc.uid, 0, { type: 'hero', player: 1 });
	ok('tap dealt 1 damage to the enemy hero', st.players[1].life === before - 1, [before, st.players[1].life]);
	ok('location is now tapped', loc.tapped === true, loc.tapped);
}

// Casting a Fel spell reopens the location; a non-Fel spell does not
{
	const st = game();
	const loc = placeLoc(st, 'nespirah_enthralled');
	E.tapLand(st, 0, loc.uid, 0, { type: 'hero', player: 1 });
	castSpell(st, 't_arcane');
	ok('a non-Fel spell does NOT reopen', loc.tapped === true, loc.tapped);
	castSpell(st, 't_fel');
	ok('a Fel spell reopens the location', loc.tapped === false, loc.tapped);
}

// Deathrattle summons Nespirah, Unshackled when the location wears out
{
	const st = game();
	const loc = placeLoc(st, 'nespirah_enthralled');
	loc.doomed = true;
	E.sweepDeaths(st);
	const unshackled = st.players[0].board.find(c => c.id === 'nespirah_unshackled');
	ok('Deathrattle summoned Nespirah, Unshackled', unshackled && unshackled.attack === 6 && E.hp(unshackled) === 6, unshackled && [unshackled.attack, E.hp(unshackled)]);
}

// Nespirah, Unshackled: after a Fel spell, get a 1-Cost non-Colossal Naga
{
	const st = game();
	const u = E.instantiate(cardsById.nespirah_unshackled, 0); u.zone = 'board'; u.sick = false; st.players[0].board.push(u); E.recomputeAuras(st);
	const handBefore = st.players[0].hand.length;
	castSpell(st, 't_fel');
	const got = st.players[0].hand[st.players[0].hand.length - 1];
	ok('a card was added to hand after the Fel spell', st.players[0].hand.length === handBefore + 1, [handBefore, st.players[0].hand.length]);
	ok('it is a Naga that costs 1', got && (cardsById[got.id].tribe || '').includes('Naga') && got.cost === 1, got && [cardsById[got.id]?.tribe, got.cost]);
	ok('the Naga is not Colossal', got && !cardsById[got.id].colossal, got && got.id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
