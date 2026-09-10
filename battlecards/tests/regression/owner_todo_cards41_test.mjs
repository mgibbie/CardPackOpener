// Forty-first batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Sage Owl / Sigiled Starfish -> tribe "Beast"
//   Chart a Course -> "Draw 2 cards.\nAdvance & Assemble."
//   Bonesplitter   -> "Swing: Each opponent loses 1 Life."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 99) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } st.pickQueue = []; return st; };

// ---------- tribe edits ----------
ok('Sage Owl is a Beast', cardsById.sage_owl.tribe === 'Beast', cardsById.sage_owl.tribe);
ok('Sigiled Starfish is a Beast', cardsById.sigiled_starfish.tribe === 'Beast', cardsById.sigiled_starfish.tribe);

// ---------- Chart a Course: Draw 2 + Advance & Assemble ----------
{
	const c = cardsById.chart_a_course;
	ok('reads "Draw 2 cards.\\nAdvance & Assemble."', c.description === 'Draw 2 cards.\nAdvance & Assemble.', JSON.stringify(c.description));
	ok('effects: draw 2 + advance + assemble', c.effects.some(e => e.type === 'draw' && e.value === 2) && c.effects.some(e => e.type === 'advance') && c.effects.some(e => e.type === 'assemble'), JSON.stringify(c.effects));
	const st = game();
	st.players[0].deck = ['grizzly_bears', 'sage_owl', 'sigiled_starfish'];
	const h0 = st.players[0].hand.length;
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, null, null, 0);
	ok('drew 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
	ok('queued an Advance pick', (st.pickQueue || []).some(q => q.mode === 'advance'), (st.pickQueue || []).map(q => q.mode));
	ok('queued an Assemble pick', (st.pickQueue || []).some(q => q.mode === 'assemble'), (st.pickQueue || []).map(q => q.mode));
}

// ---------- Bonesplitter: Swing -> each opponent loses 1 Life ----------
{
	const c = cardsById.wastes_bonesplitter;
	ok('reads "Swing: Each opponent loses 1 Life."', c.description === 'Swing: Each opponent loses 1 Life.', JSON.stringify(c.description));
	ok('Swing = hero-attacks -> 1 damage to enemy heroes', c.ongoing?.on === 'hero-attacks' && c.ongoing.effects[0].type === 'damage' && c.ongoing.effects[0].value === 1 && c.ongoing.effects[0].target === 'enemy-heroes', JSON.stringify(c.ongoing));
	const st = game();
	const w = E.instantiate(c, 0); w.zone = 'weapon'; st.players[0].weapon = w;
	const life0 = st.players[1].life;
	E.fireOngoing(st, 0, 'hero-attacks', {});
	ok('the opponent lost 1 Life on the Swing', st.players[1].life === life0 - 1, [life0, st.players[1].life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
