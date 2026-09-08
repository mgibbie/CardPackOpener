// Sixth batch of card changes filed from the wiki's owner inbox (owner_todo),
// applied 2026-09-08. All three are Forest advanced-land pool cards.
//
//   Argothian Swine  -> Trample & Poisonous.
//   Barbary Apes     -> Rush & Static; retribe to Beast.
//   Bounding Wolf    -> add "Deathrattle: Discover a Beast"; retribe to Beast.
//
// The keyword array is the SAME array the engine reads at combat time
// (card.keywords.includes('poisonous'|'static'|'rush'|'trample')), so asserting
// membership on a freshly instantiated instance confirms the mechanic is live —
// and the genuinely new behaviour (Bounding Wolf's Deathrattle) is FIRED: kill it
// and confirm it queues a Discover restricted to Beasts.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- Argothian Swine ----------
{
	const c = cardsById.argothian_swine;
	ok('Argothian Swine reads "Trample & Poisonous."', c.description === 'Trample & Poisonous.', JSON.stringify(c.description));
	const inst = E.instantiate(c, 0);
	ok('instantiated with the trample + poisonous the engine reads at combat',
		inst.keywords.includes('trample') && inst.keywords.includes('poisonous'), JSON.stringify(inst.keywords));
	// batch 6 added the keywords only; batch 7 later retribed Boar -> Beast (see owner_todo_cards7_test)
	ok('Argothian Swine tribe is Beast (retribed in batch 7)', c.tribe === 'Beast', c.tribe);
}

// ---------- Barbary Apes ----------
{
	const c = cardsById.barbary_apes;
	ok('Barbary Apes reads "Rush & Static."', c.description === 'Rush & Static.', JSON.stringify(c.description));
	ok('Barbary Apes is now a Beast', c.tribe === 'Beast', c.tribe);
	const inst = E.instantiate(c, 0);
	ok('instantiated with rush + static', inst.keywords.includes('rush') && inst.keywords.includes('static'), JSON.stringify(inst.keywords));
}

// ---------- Bounding Wolf ----------
{
	const c = cardsById.bounding_wolf;
	ok('Bounding Wolf reads "Rush.\\nDeathrattle: Discover a Beast."',
		c.description === 'Rush.\nDeathrattle: Discover a Beast.', JSON.stringify(c.description));
	ok('Bounding Wolf is now a Beast', c.tribe === 'Beast', c.tribe);
	ok('keeps rush + gains deathrattle', ['rush', 'deathrattle'].every(k => (c.keywords || []).includes(k)), JSON.stringify(c.keywords));
	ok('its deathrattle is a Beast Discover', Array.isArray(c.deathrattle) && c.deathrattle[0]?.type === 'discover' && c.deathrattle[0]?.tribe === 'Beast', JSON.stringify(c.deathrattle));

	// FIRE it: put the wolf on board, kill it, sweep deaths → a Beast Discover queues
	const st = game();
	const w = E.instantiate(c, 0); w.zone = 'board'; w.sick = false;
	st.players[0].board.push(w);
	E.recomputeAuras(st);
	const before = (st.pickQueue || []).length;
	w.damage = w.maxHealth;            // lethal
	ok('the wolf is dead', E.isDead(w), [w.damage, w.maxHealth]);
	E.sweepDeaths(st);
	const q = (st.pickQueue || [])[before];
	ok('death queued a Discover', !!q && q.discover === true && Array.isArray(q.ids) && q.ids.length > 0, JSON.stringify(q && { discover: q.discover, ids: q.ids }));
	const offered = (q?.ids || []).map(id => cardsById[id]);
	ok('every Discover option is a Beast', offered.length > 0 && offered.every(d => (d.tribe || '').includes('Beast')),
		JSON.stringify(offered.map(d => d && [d.name, d.tribe])));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
