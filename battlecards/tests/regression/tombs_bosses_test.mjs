// tombs_bosses_test.mjs — Explorers, chapters, and all Tombs bosses. Boots a
// real game against every boss (themed deck + power) and plays two turns.
import fs from 'fs';
import * as E from '../../engine.js';
import * as T from '../../tombs.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('4 Explorers, 4 chapters, 36 bosses', T.EXPLORERS.length === 4 && T.CHAPTERS.length === 4 && Object.keys(T.BOSSES).length === 36);
ok('every chapter pool + final resolves', T.CHAPTERS.every(c => T.BOSSES[c.final] && c.pool.every(b => T.BOSSES[b])));
ok('every chapter final is a Plague Lord', T.CHAPTERS.every(c => T.BOSSES[c.final].plagueLord));
ok('each Explorer has 3 alt powers in cards.json', T.EXPLORERS.every(h => {
	const ids = T.EXPLORER_POWERS[h.heroClass] || [];
	return ids.length === 3 && ids.every(id => cardsById[id] && cardsById[id].type === 'heropower');
}));

for (const [bid, boss] of Object.entries(T.BOSSES)) {
	try {
		const deck = T.buildBossDeck(cardsById, boss.theme);
		if (deck.length < 20) { fail++; console.log('FAIL deck too small:', bid, deck.length); continue; }
		const picks = [{ id: 'mage', name: 'Mage', power: { name: 'Bolt', cost: 2, effects: [{ type: 'damage', value: 2, target: 'enemy-heroes' }], text: '' } },
			{ id: bid, name: boss.name, power: boss.power }];
		const state = E.createGame(cardsById, seededRng(99), null, 2, picks);
		state.players[1].deck = [...deck];
		state.players[1].life = boss.health;
		const pw = state.players[1].heroPowers[0];
		state.current = 1;
		E.useHeroPower(state, 1, pw.uid, null);
		state.current = 0;
		E.endTurn(state); E.endTurn(state);
		const errs = validateGameState(state);
		if (errs.length) { fail++; console.log('FAIL validate:', bid, errs.slice(0, 2)); continue; }
		pass++;
	} catch (err) { fail++; console.log('FAIL boot:', bid, String(err).slice(0, 140)); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
