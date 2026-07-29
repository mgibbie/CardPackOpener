// heist_bosses_test.mjs — Dalaran Heist phase 3: heroes, wings, and all 75
// bosses. Boots a real game against every boss (themed deck + hero power
// installed the dungeon way), fires the power, and plays two full turns.
import fs from 'fs';
import * as E from '../../engine.js';
import * as H from '../../heist.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('75 bosses, 5 wings, 9 heroes', Object.keys(H.BOSSES).length === 75 && H.WINGS.length === 5 && H.HEROES.length === 9);
ok('every wing pool + final resolves', H.WINGS.every(w => H.BOSSES[w.final] && w.pool.every(b => H.BOSSES[b])));
ok('each hero has 2 dala alt powers of its class', H.HEROES.every(h =>
	raw.cards.filter(c => c.set === 'DALARAN_HEIST' && c.type === 'heropower' && c.cardClass === h.heroClass).length === 2));

for (const [bid, boss] of Object.entries(H.BOSSES)) {
	try {
		const deck = H.buildBossDeck(cardsById, boss.theme);
		if (deck.length < 20) { fail++; console.log('FAIL deck too small:', bid, deck.length); continue; }
		const picks = [{ id: 'mage', name: 'Mage', power: { name: 'Bolt', cost: 2, effects: [{ type: 'damage', value: 2, target: 'enemy-heroes' }], text: '' } },
			{ id: bid, name: boss.name, power: boss.power }];
		const state = E.createGame(cardsById, seededRng(42), null, 2, picks);
		state.players[1].deck = [...deck];
		state.players[1].life = boss.health;
		// fire the boss power through the real pipeline
		const pw = state.players[1].heroPowers[0];
		state.current = 1;
		E.useHeroPower(state, 1, pw.uid, null);
		state.current = 0;
		E.endTurn(state); E.endTurn(state);
		const errs = validateGameState(state);
		if (errs.length) { fail++; console.log('FAIL validate:', bid, errs.slice(0, 2)); continue; }
		pass++;
	} catch (err) {
		fail++; console.log('FAIL boot:', bid, String(err).slice(0, 140));
	}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
