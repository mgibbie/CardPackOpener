// defless_deck_id_test.mjs — deck-reading effects (Chronogor, draw-lowest/
// highest) must not crash when a card mints a defless token id into a deck
// (a dynamic token_* with no cardsById entry). The phantom evaporates.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// Chronogor: you draw your 2 highest-Cost; enemy draws your 2 lowest. A
// defless id sorts as cost 0, so it lands in the "lowest" pick — must not
// crash instantiate.
{
	let threw = false;
	try {
		const { state } = new Scenario(byId)
			.def('t_hi', { type: 'creature', cost: 8, attack: 8, health: 8 })
			.def('t_mid', { type: 'creature', cost: 4, attack: 4, health: 4 })
			.mana(0, 20).deck(0, ['t_hi', 't_mid', 'token_phantom', 'token_phantom']).hand(0, ['chronogor']).run();
		E.playCard(state, 0, state.players[0].hand[0].uid, null);
		ok('Chronogor: I drew a real high-cost card', state.players[0].hand.some(c => c.id === 't_hi'));
		ok('Chronogor: the phantom ids did not become cards', !state.players[1].hand.some(c => c.id === 'token_phantom'));
	} catch (e) { threw = true; }
	ok('Chronogor with defless deck ids did not crash', !threw);
}

// draw-lowest: a defless (cost-0) id would be the "lowest" — must not crash
{
	let threw = false;
	try {
		const { state } = new Scenario(byId)
			.def('t_low', { type: 'creature', cost: 2, attack: 2, health: 2 })
			.def('t_draw', { type: 'sorcery', cost: 1, effects: [{ type: 'draw-lowest', value: 1 }] })
			.mana(0, 20).deck(0, ['t_low', 'token_phantom']).hand(0, ['t_draw']).run();
		E.playCard(state, 0, state.players[0].hand[0].uid, null);
		ok('draw-lowest: no crash on a defless deck id', true);
	} catch (e) { threw = true; }
	ok('draw-lowest with a defless deck id did not crash', !threw);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
