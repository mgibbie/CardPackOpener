// Twenty-third batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Colossapede          -> add "Frenzy: Gain 5 Life".
//   Brambleweft Behemoth -> add "Deathrattle: Add two random Elementals to your hand".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 49) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; } return st; };

// ---------- Colossapede: Frenzy: Gain 5 Life ----------
{
	const c = cardsById.colossapede;
	ok('Colossapede reads "Trample.\\nFrenzy: Gain 5 Life."', c.description === 'Trample.\nFrenzy: Gain 5 Life.', JSON.stringify(c.description));
	ok('Frenzy wired (self-damaged/once/survives -> heal self 5)', c.ongoing?.on === 'self-damaged' && c.ongoing?.once && c.ongoing?.survives && c.ongoing.effects[0].type === 'heal' && c.ongoing.effects[0].value === 5, JSON.stringify(c.ongoing));
	const st = game(); st.players[0].life = 30;
	const p = E.instantiate(c, 0); p.zone = 'board'; p.sick = false; st.players[0].board.push(p); // 5/5
	E.execEffects(st, 0, [{ type: 'damage', value: 1, target: 'creature' }], { type: 'creature', uid: p.uid, player: 0 }, null);
	ok('Frenzy healed the hero 5 (30 -> 35)', st.players[0].life === 35, ['life', st.players[0].life]);
}

// ---------- Brambleweft Behemoth: Deathrattle adds 2 random Elementals ----------
{
	const c = cardsById.brambleweft_behemoth;
	ok('Brambleweft reads "Trample.\\nDeathrattle: Add two random Elementals to your hand."', c.description === 'Trample.\nDeathrattle: Add two random Elementals to your hand.', JSON.stringify(c.description));
	ok('deathrattle conjures 2 random Elemental creatures', c.keywords.includes('deathrattle') && c.deathrattle?.[0]?.type === 'conjure-random' && c.deathrattle[0].tribe === 'Elemental' && c.deathrattle[0].count === 2, JSON.stringify(c.deathrattle));
	const st = game();
	const b = E.instantiate(c, 0); b.zone = 'board'; st.players[0].board.push(b);
	const before = st.players[0].hand.length;
	b.damage = b.maxHealth;
	E.sweepDeaths(st);
	const added = st.players[0].hand.slice(before);
	ok('Deathrattle added 2 cards to hand', added.length === 2, ['added', added.length]);
	ok('both are Elemental creatures', added.length === 2 && added.every(h => { const d = cardsById[h.id] || h; return d.type === 'creature' && (d.tribe || '').includes('Elemental'); }), JSON.stringify(added.map(h => (cardsById[h.id] || h).tribe)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
