// starter_decks_test.mjs — every curated starter deck (starter-decks.json) is a
// LEGAL 40-card deck that a brand-new account already owns, so it loads → Saves →
// plays with no missing cards. Validated against the REAL collection.js rules,
// and round-tripped through the deck codec (the ?deck= link path the UI uses).
import { readFileSync } from 'fs';
import * as Col from '../../collection.js';
import { encodeDeck, decodeDeck } from '../../codec.js';
import { STARTING_COLLECTION } from '../../starter-collection.js';
import { STARTER_DECKS as RUN_STARTER_DECKS } from '../../dungeon.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const cardsById = {};
for (const d of JSON.parse(readFileSync(new URL('../../cards.json', import.meta.url))).cards) cardsById[d.id] = d;
const starters = JSON.parse(readFileSync(new URL('../../starter-decks.json', import.meta.url))).decks;

// the ACTUAL collection a fresh account is handed (starter-collection.js): every
// card in the starter decks + the dungeon/heist/tombs run decks — validate the
// starter decks against THIS, so the test guards the real end-to-end guarantee
const newAccountCollection = STARTING_COLLECTION;
ok('the starting collection is curated + bounded (not the whole common/uncommon pool)', Object.keys(STARTING_COLLECTION).length < 1000, Object.keys(STARTING_COLLECTION).length);

ok('there is at least one starter deck', starters.length >= 1, starters.length);
ok('starters cover many classes (one per class)', new Set(starters.map(s => s.classId)).size >= 10, new Set(starters.map(s => s.classId)).size);

for (const s of starters) {
	ok(`${s.classId}: has an id, name, classId, and 40 cards`, s.id && s.name && s.classId && Array.isArray(s.cards) && s.cards.length === 40, s.cards?.length);
	// THE guarantee: legal AND fully owned by a fresh account (validateDeck checks copies + ownership + class-legality)
	const err = Col.validateDeck(s.cards, cardsById, newAccountCollection, s.classId, null, null);
	ok(`${s.classId}: is a legal deck a NEW account already owns (validateDeck passes)`, err === null, err);
	// no card exceeds its copy cap (belt-and-suspenders; validateDeck covers it but assert directly)
	const counts = {};
	for (const id of s.cards) counts[id] = (counts[id] || 0) + 1;
	const overCap = Object.entries(counts).find(([id, n]) => n > (cardsById[id]?.rarity === 'legendary' ? 1 : 2));
	ok(`${s.classId}: respects copy limits`, !overCap, overCap && JSON.stringify(overCap));
}

// codec round-trip: the starter deck encodes to a ?deck= code and decodes back identically
const multiset = a => [...a].sort().join(',');
{
	const s = starters[0];
	const code = await encodeDeck({ classId: s.classId, cards: s.cards, commander: null, companion: null });
	const back = await decodeDeck(code);
	ok('a starter deck round-trips through the deck codec (the ?deck= link path)',
		back && back.classId === s.classId && multiset(back.cards) === multiset(s.cards), back?.classId);
}

// the starting collection also owns every card in the dungeon/heist/tombs run
// starter decks (the user's requirement: start with those cards too)
const runCards = new Set();
for (const deck of Object.values(RUN_STARTER_DECKS)) for (const id of deck) runCards.add(id);
const missingRun = [...runCards].filter(id => !(id in STARTING_COLLECTION));
ok('the starting collection owns every dungeon/heist/tombs run-deck card', missingRun.length === 0, missingRun.slice(0, 5).join(', '));
// and every starter-deck card (belt-and-suspenders vs validateDeck above)
const missingStarter = starters.flatMap(s => s.cards).filter(id => !(id in STARTING_COLLECTION));
ok('the starting collection owns every starter-deck card', missingStarter.length === 0, missingStarter.slice(0, 5).join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
